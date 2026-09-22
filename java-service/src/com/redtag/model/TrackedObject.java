package com.redtag.model;

public class TrackedObject {
    public enum State {
        DETECTING,
        DEBOUNCING,
        NEW_ARRIVAL,   // Flagged as "NEW"
        EXISTING_ITEM, // Settled into active stock as "OLD"
        IN_TRANSIT,    // Shifting across Red Tag area
        OCCLUDED       // Temporarily blocked by operator
    }

    private final String id;
    private String label;
    private double x, y, width, height;
    private Point2D footprint;
    private State state;
    private long firstSeenTime;
    private long lastSeenTime;
    private long stationaryStartTime;
    private double currentVelocity;
    private boolean isAuthorized;
    private String rfidTagUid;
    private boolean isOperatorHandling;
    private long lastRelocationTime;

    public TrackedObject(String id, String label, double x, double y, double width, double height, long now) {
        this.id = id;
        this.label = label;
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.footprint = PolygonROI.calculateFootprint(x, y, width, height);
        this.state = State.DETECTING;
        this.firstSeenTime = now;
        this.lastSeenTime = now;
        this.stationaryStartTime = now;
        this.currentVelocity = 0.0;
        this.isAuthorized = false;
        this.rfidTagUid = null;
        this.isOperatorHandling = false;
        this.lastRelocationTime = 0;
    }

    public void updatePosition(double newX, double newY, double newW, double newH, long now, double dtSeconds) {
        Point2D newFootprint = PolygonROI.calculateFootprint(newX, newY, newW, newH);
        double dist = this.footprint.distanceTo(newFootprint);

        if (dtSeconds > 0) {
            this.currentVelocity = dist / dtSeconds;
        }

        this.x = newX;
        this.y = newY;
        this.width = newW;
        this.height = newH;
        this.footprint = newFootprint;
        this.lastSeenTime = now;
    }

    // Getters and Setters
    public String getId() { return id; }
    public String getLabel() { return label; }
    public double getX() { return x; }
    public double getY() { return y; }
    public double getWidth() { return width; }
    public double getHeight() { return height; }
    public Point2D getFootprint() { return footprint; }
    public State getState() { return state; }
    public void setState(State state) { this.state = state; }
    public long getFirstSeenTime() { return firstSeenTime; }
    public long getLastSeenTime() { return lastSeenTime; }
    public void setLastSeenTime(long t) { this.lastSeenTime = t; }
    public long getStationaryStartTime() { return stationaryStartTime; }
    public void resetStationaryTimer(long now) { this.stationaryStartTime = now; }
    public double getCurrentVelocity() { return currentVelocity; }
    public boolean isAuthorized() { return isAuthorized; }
    public void setAuthorized(boolean authorized) { isAuthorized = authorized; }
    public String getRfidTagUid() { return rfidTagUid; }
    public void setRfidTagUid(String rfidTagUid) { this.rfidTagUid = rfidTagUid; }
    public boolean isOperatorHandling() { return isOperatorHandling; }
    public void setOperatorHandling(boolean handling) { this.isOperatorHandling = handling; }
    public long getLastRelocationTime() { return lastRelocationTime; }
    public void setLastRelocationTime(long t) { this.lastRelocationTime = t; }
}
