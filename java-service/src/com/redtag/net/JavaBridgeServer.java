package com.redtag.net;

import com.redtag.engine.DebounceEngine;
import com.redtag.engine.MemoryTrackingEngine;
import com.redtag.engine.SpatioTemporalCorrelationEngine;
import com.redtag.model.Point2D;
import com.redtag.model.PolygonROI;
import com.redtag.model.RFIDEvent;
import com.redtag.model.TrackedObject;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpServer;

import java.io.*;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.Executors;

/**
 * Built-in HTTP REST Micro-Bridge communicating with Node.js Backend.
 * Runs on Port 8080 with zero external dependencies.
 */
public class JavaBridgeServer {
    private final int port;
    private final PolygonROI floorTapePolygon;
    private final DebounceEngine debounceEngine;
    private final SpatioTemporalCorrelationEngine correlationEngine;
    private final MemoryTrackingEngine memoryEngine;
    private HttpServer server;

    public JavaBridgeServer(int port,
                            PolygonROI floorTapePolygon,
                            DebounceEngine debounceEngine,
                            SpatioTemporalCorrelationEngine correlationEngine,
                            MemoryTrackingEngine memoryEngine) {
        this.port = port;
        this.floorTapePolygon = floorTapePolygon;
        this.debounceEngine = debounceEngine;
        this.correlationEngine = correlationEngine;
        this.memoryEngine = memoryEngine;
    }

    public void start() throws IOException {
        server = HttpServer.create(new InetSocketAddress(port), 0);
        server.createContext("/api/status", new StatusHandler());
        server.createContext("/api/rfid-scan", new RFIDScanHandler());
        server.createContext("/api/frame-detections", new FrameDetectionsHandler());
        server.createContext("/api/inventory", new InventoryHandler());
        server.createContext("/api/polygon", new PolygonUpdateHandler());
        server.setExecutor(Executors.newCachedThreadPool());
        server.start();
        System.out.printf("☕ [Java Bridge Server] REST API listening on http://localhost:%d%n", port);
    }

    public void stop() {
        if (server != null) server.stop(0);
    }

    private class StatusHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            addCors(exchange);
            if ("OPTIONS".equalsIgnoreCase(exchange.getRequestMethod())) {
                exchange.sendResponseHeaders(204, -1);
                return;
            }

            String json = String.format(
                    "{\"status\":\"ONLINE\",\"engine\":\"Java-LTS-25\",\"inventory_count\":%d,\"polygon_vertices\":%d}",
                    memoryEngine.getActiveInventory().size(),
                    floorTapePolygon.getVertices().size()
            );
            sendResponse(exchange, 200, json);
        }
    }

    private class RFIDScanHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            addCors(exchange);
            if ("OPTIONS".equalsIgnoreCase(exchange.getRequestMethod())) {
                exchange.sendResponseHeaders(204, -1);
                return;
            }

            if ("POST".equalsIgnoreCase(exchange.getRequestMethod())) {
                String body = readBody(exchange);
                String uid = parseJsonValue(body, "uid");
                if (uid == null || uid.isEmpty()) {
                    uid = parseJsonValue(body, "epc");
                }

                if (uid != null && !uid.isEmpty()) {
                    RFIDEvent event = new RFIDEvent(uid, System.currentTimeMillis(), "REST_BRIDGE", -50.0, "HTTP");
                    correlationEngine.addRFIDEvent(event);
                    System.out.printf("📡 [Java Ingested RFID] Tag UID: %s%n", uid);
                    sendResponse(exchange, 200, String.format("{\"success\":true,\"uid\":\"%s\",\"correlated\":true}", uid));
                    return;
                }
            }
            sendResponse(exchange, 400, "{\"error\":\"Missing uid\"}");
        }
    }

    private class FrameDetectionsHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            addCors(exchange);
            if ("OPTIONS".equalsIgnoreCase(exchange.getRequestMethod())) {
                exchange.sendResponseHeaders(204, -1);
                return;
            }

            if ("POST".equalsIgnoreCase(exchange.getRequestMethod())) {
                String body = readBody(exchange);
                long now = System.currentTimeMillis();

                // Run tick maintenance for age transitions & occlusions
                memoryEngine.tickMaintenance(now);

                // Check for operators in frame (operator suppression & occlusion)
                boolean operatorPresent = body.contains("\"person\"") || body.contains("\"operator\"");

                // Parse detections list (lightweight custom parsing for zero-dependency JSON)
                List<DetectionDto> detections = parseDetections(body);

                StringBuilder responseItems = new StringBuilder("[");
                boolean first = true;

                for (DetectionDto det : detections) {
                    if ("person".equalsIgnoreCase(det.label) || "operator".equalsIgnoreCase(det.label)) {
                        continue; // Corridor exclusion / operator
                    }

                    Point2D footprint = PolygonROI.calculateFootprint(det.x, det.y, det.width, det.height);
                    boolean insidePolygon = floorTapePolygon.containsPoint(footprint);

                    // Find match in active inventory or in-transit
                    TrackedObject obj = memoryEngine.findMatch(footprint, det.label, null);

                    if (obj == null) {
                        // Check if this was an in-transit relocation
                        TrackedObject inTransit = memoryEngine.findInTransitMatch(det.label, null);
                        if (inTransit != null) {
                            obj = inTransit;
                            System.out.printf("🔄 Relocated Item Identified: %s (%s) moved to new position inside Red Tag ROI.%n",
                                    obj.getId(), obj.getLabel());
                            obj.setState(TrackedObject.State.EXISTING_ITEM);
                            obj.updatePosition(det.x, det.y, det.width, det.height, now, 0.1);
                        } else {
                            // Brand new item candidate
                            String newId = memoryEngine.generateObjectId();
                            obj = new TrackedObject(newId, det.label, det.x, det.y, det.width, det.height, now);
                            memoryEngine.registerNewItem(obj);
                        }
                    } else {
                        obj.updatePosition(det.x, det.y, det.width, det.height, now, 0.1);
                        memoryEngine.clearOcclusion(obj);
                    }

                    // Operator handling flag
                    obj.setOperatorHandling(operatorPresent);

                    // Evaluate 5-second stationary debouncing
                    boolean debounced = debounceEngine.updateDebounce(obj, now, insidePolygon);
                    double debounceProgress = debounceEngine.getProgressPercentage(obj, now);

                    // If debounced and still in DEBOUNCING/DETECTING state, trigger verification
                    String alertType = null;
                    if (debounced && (obj.getState() == TrackedObject.State.DEBOUNCING || obj.getState() == TrackedObject.State.DETECTING)) {
                        SpatioTemporalCorrelationEngine.CorrelationResult res =
                                correlationEngine.evaluateCorrelation(obj, now);

                        if (res.isAuthorized) {
                            obj.setState(TrackedObject.State.NEW_ARRIVAL);
                            alertType = "AUTHORIZED_PLACEMENT";
                            System.out.printf("✅ [Java Engine] Placement AUTHORIZED: %s (%s) correlated with %s%n",
                                    obj.getId(), obj.getLabel(), res.rfidUid);
                        } else {
                            obj.setState(TrackedObject.State.NEW_ARRIVAL);
                            alertType = "UNAUTHORIZED_PLACEMENT";
                            System.out.printf("🚨 [Java Engine] Placement UNAUTHORIZED: %s (%s) - %s%n",
                                    obj.getId(), obj.getLabel(), res.notes);
                        }
                    }

                    if (!first) responseItems.append(",");
                    first = false;

                    responseItems.append(String.format(
                            "{\"id\":\"%s\",\"label\":\"%s\",\"x\":%.1f,\"y\":%.1f,\"width\":%.1f,\"height\":%.1f," +
                            "\"footprint\":{\"x\":%.1f,\"y\":%.1f},\"inside_polygon\":%b,\"state\":\"%s\"," +
                            "\"debounce_progress\":%.1f,\"is_authorized\":%b,\"rfid_uid\":%s,\"alert\":\"%s\"}",
                            obj.getId(), obj.getLabel(), obj.getX(), obj.getY(), obj.getWidth(), obj.getHeight(),
                            footprint.x, footprint.y, insidePolygon, obj.getState(),
                            debounceProgress, obj.isAuthorized(),
                            obj.getRfidTagUid() != null ? "\"" + obj.getRfidTagUid() + "\"" : "null",
                            alertType != null ? alertType : "NONE"
                    ));
                }

                responseItems.append("]");
                String finalJson = String.format("{\"success\":true,\"timestamp\":%d,\"tracked_objects\":%s}",
                        now, responseItems.toString());
                sendResponse(exchange, 200, finalJson);
                return;
            }
            sendResponse(exchange, 405, "{\"error\":\"Method Not Allowed\"}");
        }
    }

    private class InventoryHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            addCors(exchange);
            StringBuilder sb = new StringBuilder("[");
            boolean first = true;
            for (TrackedObject obj : memoryEngine.getActiveInventory().values()) {
                if (!first) sb.append(",");
                first = false;
                sb.append(String.format(
                        "{\"id\":\"%s\",\"label\":\"%s\",\"state\":\"%s\",\"is_authorized\":%b,\"rfid_uid\":%s}",
                        obj.getId(), obj.getLabel(), obj.getState(), obj.isAuthorized(),
                        obj.getRfidTagUid() != null ? "\"" + obj.getRfidTagUid() + "\"" : "null"
                ));
            }
            sb.append("]");
            sendResponse(exchange, 200, sb.toString());
        }
    }

    private class PolygonUpdateHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            addCors(exchange);
            if ("OPTIONS".equalsIgnoreCase(exchange.getRequestMethod())) {
                exchange.sendResponseHeaders(204, -1);
                return;
            }

            if ("POST".equalsIgnoreCase(exchange.getRequestMethod()) || "PUT".equalsIgnoreCase(exchange.getRequestMethod())) {
                String body = readBody(exchange);
                List<Point2D> newVertices = parseVertices(body);
                if (newVertices.size() >= 3) {
                    floorTapePolygon.setVertices(newVertices);
                    System.out.printf("📐 [Java Engine] User Manually Set Red Tag Polygon: %d vertices updated.%n", newVertices.size());
                    sendResponse(exchange, 200, String.format("{\"success\":true,\"vertices_count\":%d}", newVertices.size()));
                    return;
                }
            }
            sendResponse(exchange, 400, "{\"error\":\"Requires at least 3 vertices\"}");
        }
    }

    private List<Point2D> parseVertices(String json) {
        List<Point2D> list = new ArrayList<>();
        int idx = json.indexOf("\"polygon_vertices\":");
        if (idx == -1) idx = json.indexOf("\"vertices\":");
        if (idx == -1) return list;

        int start = json.indexOf("[", idx);
        int end = json.indexOf("]", start);
        if (start == -1 || end == -1) return list;

        String content = json.substring(start + 1, end);
        String[] pts = content.split("\\},\\{");
        for (String ptStr : pts) {
            try {
                double x = Double.parseDouble(parseJsonValue(ptStr, "x"));
                double y = Double.parseDouble(parseJsonValue(ptStr, "y"));
                list.add(new Point2D(x, y));
            } catch (Exception ignored) {}
        }
        return list;
    }

    // Helper utilities
    private void addCors(HttpExchange exchange) {
        exchange.getResponseHeaders().set("Access-Control-Allow-Origin", "*");
        exchange.getResponseHeaders().set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        exchange.getResponseHeaders().set("Access-Control-Allow-Headers", "Content-Type");
    }

    private void sendResponse(HttpExchange exchange, int code, String response) throws IOException {
        byte[] bytes = response.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json");
        exchange.sendResponseHeaders(code, bytes.length);
        try (OutputStream os = exchange.getResponseBody()) {
            os.write(bytes);
        }
    }

    private String readBody(HttpExchange exchange) throws IOException {
        try (InputStream is = exchange.getRequestBody();
             ByteArrayOutputStream baos = new ByteArrayOutputStream()) {
            byte[] buf = new byte[1024];
            int n;
            while ((n = is.read(buf)) != -1) {
                baos.write(buf, 0, n);
            }
            return baos.toString(StandardCharsets.UTF_8);
        }
    }

    private String parseJsonValue(String json, String key) {
        String search = "\"" + key + "\":";
        int idx = json.indexOf(search);
        if (idx == -1) return null;
        int start = idx + search.length();
        while (start < json.length() && (json.charAt(start) == ' ' || json.charAt(start) == '"')) {
            start++;
        }
        int end = start;
        while (end < json.length() && json.charAt(end) != '"' && json.charAt(end) != ',' && json.charAt(end) != '}') {
            end++;
        }
        return json.substring(start, end).trim();
    }

    private List<DetectionDto> parseDetections(String json) {
        List<DetectionDto> list = new ArrayList<>();
        int detIdx = json.indexOf("\"detections\":");
        if (detIdx == -1) return list;

        int arrayStart = json.indexOf("[", detIdx);
        int arrayEnd = json.indexOf("]", arrayStart);
        if (arrayStart == -1 || arrayEnd == -1) return list;

        String arrayContent = json.substring(arrayStart + 1, arrayEnd);
        String[] objects = arrayContent.split("\\},\\{");

        for (String objStr : objects) {
            try {
                String label = parseJsonValue(objStr, "label");
                if (label == null) continue;

                double x = Double.parseDouble(parseJsonValue(objStr, "x"));
                double y = Double.parseDouble(parseJsonValue(objStr, "y"));
                double w = Double.parseDouble(parseJsonValue(objStr, "width"));
                double h = Double.parseDouble(parseJsonValue(objStr, "height"));

                list.add(new DetectionDto(label, x, y, w, h));
            } catch (Exception ignored) {
            }
        }
        return list;
    }

    private static class DetectionDto {
        public final String label;
        public final double x, y, width, height;

        public DetectionDto(String label, double x, double y, double width, double height) {
            this.label = label;
            this.x = x;
            this.y = y;
            this.width = width;
            this.height = height;
        }
    }
}
