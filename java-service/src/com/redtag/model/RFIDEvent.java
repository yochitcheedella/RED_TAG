package com.redtag.model;

public class RFIDEvent {
    private final String epc;
    private final long timestamp;
    private final String antennaId;
    private final double rssi;
    private final String protocol; // TCP_IP or SERIAL

    public RFIDEvent(String epc, long timestamp, String antennaId, double rssi, String protocol) {
        this.epc = epc.trim().toUpperCase();
        this.timestamp = timestamp;
        this.antennaId = antennaId;
        this.rssi = rssi;
        this.protocol = protocol;
    }

    public String getEpc() {
        return epc;
    }

    public long getTimestamp() {
        return timestamp;
    }

    public String getAntennaId() {
        return antennaId;
    }

    public double getRssi() {
        return rssi;
    }

    public String getProtocol() {
        return protocol;
    }

    @Override
    public String toString() {
        return String.format("RFIDEvent[EPC=%s, time=%d, antenna=%s, rssi=%.1f, proto=%s]",
                epc, timestamp, antennaId, rssi, protocol);
    }
}
