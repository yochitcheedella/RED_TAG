package com.redtag.engine;

import com.redtag.model.TrackedObject;

/**
 * 60-Second Stationary Debouncing Engine
 * Requires an object to remain completely static inside the tape polygon
 * for 60 continuous seconds before initiating verification.
 * Motion/velocity automatically resets the debounce timer.
 */
public class DebounceEngine {
    private final long requiredStationaryMs;
    private final double velocityThreshold;

    public DebounceEngine(long requiredStationaryMs, double velocityThreshold) {
        this.requiredStationaryMs = requiredStationaryMs;
        this.velocityThreshold = velocityThreshold;
    }

    public boolean updateDebounce(TrackedObject obj, long now, boolean isInsidePolygon) {
        if (!isInsidePolygon) {
            obj.resetStationaryTimer(now);
            return false;
        }

        // If velocity exceeds threshold (item is being handled, shifted, or moving)
        if (obj.getCurrentVelocity() > velocityThreshold || obj.isOperatorHandling()) {
            obj.resetStationaryTimer(now);
            if (obj.getState() == TrackedObject.State.DETECTING) {
                obj.setState(TrackedObject.State.DEBOUNCING);
            }
            return false;
        }

        // Check if item has stayed static for >= requiredStationaryMs (60000ms)
        long elapsed = now - obj.getStationaryStartTime();
        if (elapsed >= requiredStationaryMs) {
            return true; // Debounce complete, ready for authorization check
        }

        obj.setState(TrackedObject.State.DEBOUNCING);
        return false;
    }

    public double getProgressPercentage(TrackedObject obj, long now) {
        long elapsed = Math.max(0, now - obj.getStationaryStartTime());
        return Math.min(100.0, (elapsed / (double) requiredStationaryMs) * 100.0);
    }
}
