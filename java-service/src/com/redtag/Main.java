package com.redtag;

import com.redtag.engine.DebounceEngine;
import com.redtag.engine.MemoryTrackingEngine;
import com.redtag.engine.SpatioTemporalCorrelationEngine;
import com.redtag.model.PolygonROI;
import com.redtag.net.JavaBridgeServer;
import com.redtag.net.RFIDSocketServer;

public class Main {
    public static void main(String[] args) {
        System.out.println("==================================================================");
        System.out.println("🚀 [Red Tag Area Core Engine] Starting Java Service (Java 25 LTS)");
        System.out.println("==================================================================");

        // 1. Initialize Floor-Tape Polygon ROI
        PolygonROI floorTapePolygon = new PolygonROI("Physical Red-and-Blue Floor Tape Polygon");
        // Vertices matching config/roi_config.json:
        // [130, 180], [510, 180], [560, 440], [80, 440]
        floorTapePolygon.addVertex(130, 180);
        floorTapePolygon.addVertex(510, 180);
        floorTapePolygon.addVertex(560, 440);
        floorTapePolygon.addVertex(80, 440);

        System.out.printf("📐 Floor-Tape Polygon initialized with %d vertices.%n",
                floorTapePolygon.getVertices().size());

        // 2. Initialize Core Engines
        // 60-second stationary debounce, 12 px/sec velocity reset threshold
        DebounceEngine debounceEngine = new DebounceEngine(60000, 12.0);

        // ±60-second spatio-temporal correlation window
        SpatioTemporalCorrelationEngine correlationEngine = new SpatioTemporalCorrelationEngine(60000);

        // 30-second settlement (NEW -> OLD), 8-second occlusion grace
        MemoryTrackingEngine memoryEngine = new MemoryTrackingEngine(30000, 8000);

        // 3. Start Industrial RFID TCP/IP Server on Port 9090
        RFIDSocketServer rfidServer = new RFIDSocketServer(9090, correlationEngine);
        new Thread(rfidServer, "RFID-TCP-Listener").start();

        // 4. Start HTTP REST Bridge Server on Port 8080
        try {
            JavaBridgeServer bridgeServer = new JavaBridgeServer(8080,
                    floorTapePolygon,
                    debounceEngine,
                    correlationEngine,
                    memoryEngine);
            bridgeServer.start();

            System.out.println("✅ All Java Subsystems Online & Ready for Node.js Integration.");
            System.out.println("==================================================================");
        } catch (Exception e) {
            System.err.println("❌ Failed to start Java Bridge Server: " + e.getMessage());
            e.printStackTrace();
        }
    }
}
