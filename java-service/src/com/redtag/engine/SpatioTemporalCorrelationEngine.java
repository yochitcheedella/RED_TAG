package com.redtag.engine;

import com.redtag.model.RFIDEvent;
import com.redtag.model.TrackedObject;

import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

/**
 * Spatio-Temporal RFID Correlation Engine
 * Performs timestamp correlation within a ±60-second window between
 * visual placement confirmation and industrial RFID tag events.
 */
public class SpatioTemporalCorrelationEngine {
    private final long correlationWindowMs; // e.g. 60000ms
    private final List<RFIDEvent> rfidBuffer;

    public SpatioTemporalCorrelationEngine(long correlationWindowMs) {
        this.correlationWindowMs = correlationWindowMs;
        this.rfidBuffer = new CopyOnWriteArrayList<>();
    }

    public void addRFIDEvent(RFIDEvent event) {
        rfidBuffer.add(event);
        cleanOldEvents(event.getTimestamp());
    }

    public void cleanOldEvents(long now) {
        // Keep events within last 120 seconds
        rfidBuffer.removeIf(e -> (now - e.getTimestamp()) > 120000);
    }

    /**
     * Correlates visual detection at visualTime with recent RFID events
     * within [visualTime - 3000ms, visualTime + 3000ms].
     */
    public CorrelationResult evaluateCorrelation(TrackedObject obj, long visualTime) {
        long minTime = visualTime - correlationWindowMs;
        long maxTime = visualTime + correlationWindowMs;

        RFIDEvent matchedEvent = null;
        long closestDiff = Long.MAX_VALUE;

        for (RFIDEvent event : rfidBuffer) {
            long t = event.getTimestamp();
            if (t >= minTime && t <= maxTime) {
                long diff = Math.abs(t - visualTime);
                if (diff < closestDiff) {
                    closestDiff = diff;
                    matchedEvent = event;
                }
            }
        }

        if (matchedEvent != null) {
            obj.setAuthorized(true);
            obj.setRfidTagUid(matchedEvent.getEpc());
            double secDiff = closestDiff / 1000.0;
            return new CorrelationResult(true, matchedEvent.getEpc(), secDiff,
                    String.format("Correlated with RFID tag %s within %.2fs (window ±%.1fs)",
                            matchedEvent.getEpc(), secDiff, correlationWindowMs / 1000.0));
        } else {
            obj.setAuthorized(false);
            return new CorrelationResult(false, null, -1.0,
                    String.format("No RFID tag detected within ±%.1fs window of visual placement",
                            correlationWindowMs / 1000.0));
        }
    }

    public static class CorrelationResult {
        public final boolean isAuthorized;
        public final String rfidUid;
        public final double timeDifferenceSeconds;
        public final String notes;

        public CorrelationResult(boolean isAuthorized, String rfidUid, double timeDifferenceSeconds, String notes) {
            this.isAuthorized = isAuthorized;
            this.rfidUid = rfidUid;
            this.timeDifferenceSeconds = timeDifferenceSeconds;
            this.notes = notes;
        }
    }
}
