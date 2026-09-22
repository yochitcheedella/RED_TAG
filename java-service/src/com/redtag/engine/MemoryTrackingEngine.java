package com.redtag.engine;

import com.redtag.model.Point2D;
import com.redtag.model.TrackedObject;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Memory Tracking Engine
 * - Manages object age (NEW_ARRIVAL vs EXISTING_ITEM)
 * - Operator handling and occlusion memory preservation
 * - In-transit object relocation across the Red Tag Area
 */
public class MemoryTrackingEngine {
    private final Map<String, TrackedObject> activeInventory;
    private final Map<String, Long> occlusionTimers;
    private final long settlementDurationMs; // 30s
    private final long occlusionGraceMs; // 8s
    private int objectCounter = 1;

    public MemoryTrackingEngine(long settlementDurationMs, long occlusionGraceMs) {
        this.activeInventory = new ConcurrentHashMap<>();
        this.occlusionTimers = new ConcurrentHashMap<>();
        this.settlementDurationMs = settlementDurationMs;
        this.occlusionGraceMs = occlusionGraceMs;
    }

    public synchronized String generateObjectId() {
        return String.format("OBJ-%03d", objectCounter++);
    }

    public Map<String, TrackedObject> getActiveInventory() {
        return activeInventory;
    }

    public TrackedObject getObject(String id) {
        return activeInventory.get(id);
    }

    /**
     * Finds matching existing item based on centroid proximity, label, or RFID
     */
    public TrackedObject findMatch(Point2D currentFootprint, String label, String rfid) {
        // Priority 1: Match by identical RFID tag UID
        if (rfid != null && !rfid.isEmpty()) {
            for (TrackedObject item : activeInventory.values()) {
                if (rfid.equalsIgnoreCase(item.getRfidTagUid())) {
                    return item;
                }
            }
        }

        // Priority 2: Centroid proximity (within 90 pixels)
        TrackedObject closest = null;
        double minDistance = 90.0;

        for (TrackedObject item : activeInventory.values()) {
            if (item.getLabel().equalsIgnoreCase(label) || "object".equalsIgnoreCase(label)) {
                double dist = item.getFootprint().distanceTo(currentFootprint);
                if (dist < minDistance) {
                    minDistance = dist;
                    closest = item;
                }
            }
        }
        return closest;
    }

    /**
     * Checks if a relocated item matches an item previously marked IN_TRANSIT
     */
    public TrackedObject findInTransitMatch(String label, String rfid) {
        for (TrackedObject item : activeInventory.values()) {
            if (item.getState() == TrackedObject.State.IN_TRANSIT) {
                if (rfid != null && rfid.equalsIgnoreCase(item.getRfidTagUid())) {
                    return item;
                }
                if (item.getLabel().equalsIgnoreCase(label)) {
                    return item;
                }
            }
        }
        return null;
    }

    /**
     * Evaluates age transitions and handles occlusion timeouts
     */
    public void tickMaintenance(long now) {
        for (TrackedObject item : activeInventory.values()) {
            // Transition from NEW_ARRIVAL to EXISTING_ITEM after settlement period
            if (item.getState() == TrackedObject.State.NEW_ARRIVAL) {
                if (now - item.getFirstSeenTime() >= settlementDurationMs) {
                    item.setState(TrackedObject.State.EXISTING_ITEM);
                    System.out.printf("📦 Inventory Age Transition: %s (%s) is now EXISTING_ITEM (OLD)%n",
                            item.getId(), item.getLabel());
                }
            }

            // Check occluded items
            if (item.getState() == TrackedObject.State.OCCLUDED) {
                long occludedStart = occlusionTimers.getOrDefault(item.getId(), now);
                if (now - occludedStart > occlusionGraceMs) {
                    // Check if candidate for IN_TRANSIT
                    System.out.printf("🚚 Item %s not seen after occlusion grace period. Transitioning to IN_TRANSIT.%n", item.getId());
                    item.setState(TrackedObject.State.IN_TRANSIT);
                    occlusionTimers.remove(item.getId());
                }
            }
        }
    }

    public void markOccluded(TrackedObject item, long now) {
        if (item.getState() != TrackedObject.State.OCCLUDED && item.getState() != TrackedObject.State.IN_TRANSIT) {
            item.setState(TrackedObject.State.OCCLUDED);
            occlusionTimers.put(item.getId(), now);
        }
    }

    public void clearOcclusion(TrackedObject item) {
        occlusionTimers.remove(item.getId());
    }

    public void registerNewItem(TrackedObject item) {
        activeInventory.put(item.getId(), item);
    }
}
