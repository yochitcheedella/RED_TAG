package com.redtag.net;

import com.redtag.engine.SpatioTemporalCorrelationEngine;
import com.redtag.model.RFIDEvent;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.ServerSocket;
import java.net.Socket;

/**
 * Industrial RFID TCP/IP Network Receiver Server
 * Listens on port 9090 for real industrial RFID readers (e.g., Impinj, Zebra, Alien).
 */
public class RFIDSocketServer implements Runnable {
    private final int port;
    private final SpatioTemporalCorrelationEngine correlationEngine;
    private volatile boolean running = true;

    public RFIDSocketServer(int port, SpatioTemporalCorrelationEngine correlationEngine) {
        this.port = port;
        this.correlationEngine = correlationEngine;
    }

    @Override
    public void run() {
        System.out.printf("📡 [Java RFID TCP Server] Listening for industrial readers on port %d...%n", port);
        try (ServerSocket serverSocket = new ServerSocket(port)) {
            while (running) {
                try {
                    Socket client = serverSocket.accept();
                    new Thread(new ClientHandler(client, correlationEngine)).start();
                } catch (Exception e) {
                    if (!running) break;
                    System.err.println("TCP client accept error: " + e.getMessage());
                }
            }
        } catch (Exception e) {
            System.err.println("RFID TCP Server error: " + e.getMessage());
        }
    }

    public void stop() {
        this.running = false;
    }

    private static class ClientHandler implements Runnable {
        private final Socket socket;
        private final SpatioTemporalCorrelationEngine correlationEngine;

        public ClientHandler(Socket socket, SpatioTemporalCorrelationEngine correlationEngine) {
            this.socket = socket;
            this.correlationEngine = correlationEngine;
        }

        @Override
        public void run() {
            try (BufferedReader reader = new BufferedReader(new InputStreamReader(socket.getInputStream()))) {
                String line;
                while ((line = reader.readLine()) != null) {
                    line = line.trim();
                    if (!line.isEmpty()) {
                        // Protocol format: TAG:A472198C,ANT:1,RSSI:-55.2 or raw hex EPC
                        String epc = line;
                        String ant = "ANT-1";
                        double rssi = -60.0;

                        if (line.contains("TAG:") || line.contains(",")) {
                            String[] parts = line.split(",");
                            for (String part : parts) {
                                String[] kv = part.split(":");
                                if (kv.length == 2) {
                                    if (kv[0].equalsIgnoreCase("TAG") || kv[0].equalsIgnoreCase("EPC")) {
                                        epc = kv[1];
                                    } else if (kv[0].equalsIgnoreCase("ANT")) {
                                        ant = kv[1];
                                    } else if (kv[0].equalsIgnoreCase("RSSI")) {
                                        try { rssi = Double.parseDouble(kv[1]); } catch (Exception ignored) {}
                                    }
                                }
                            }
                        }

                        RFIDEvent event = new RFIDEvent(epc, System.currentTimeMillis(), ant, rssi, "TCP_IP");
                        correlationEngine.addRFIDEvent(event);
                        System.out.printf("📡 [TCP RFID Received] %s%n", event);
                    }
                }
            } catch (Exception e) {
                // Client disconnected
            }
        }
    }
}
