package com.redtag.model;

import java.util.ArrayList;
import java.util.List;

/**
 * Geometric Polygon representation of the Physical Red-and-Blue Floor Tape.
 * Implements Ray-Casting Point-in-Polygon testing (equivalent to OpenCV's pointPolygonTest).
 */
public class PolygonROI {
    private final String name;
    private final List<Point2D> vertices;

    public PolygonROI(String name) {
        this.name = name;
        this.vertices = new ArrayList<>();
    }

    public void addVertex(double x, double y) {
        this.vertices.add(new Point2D(x, y));
    }

    public synchronized void clearVertices() {
        this.vertices.clear();
    }

    public synchronized void setVertices(List<Point2D> newVertices) {
        this.vertices.clear();
        this.vertices.addAll(newVertices);
    }

    public synchronized List<Point2D> getVertices() {
        return new ArrayList<>(vertices);
    }

    public String getName() {
        return name;
    }

    /**
     * Evaluates whether a ground footprint contact point P_footprint = [x_center, y_bottom]
     * is strictly inside the floor-tape polygon boundary.
     * Equivalent to OpenCV's pointPolygonTest(contour, pt, false) > 0.
     */
    public boolean containsPoint(Point2D pt) {
        if (vertices.size() < 3) return false;

        boolean inside = false;
        int n = vertices.size();

        for (int i = 0, j = n - 1; i < n; j = i++) {
            Point2D vi = vertices.get(i);
            Point2D vj = vertices.get(j);

            // Ray-casting intersection
            if (((vi.y > pt.y) != (vj.y > pt.y)) &&
                (pt.x < (vj.x - vi.x) * (pt.y - vi.y) / (vj.y - vi.y) + vi.x)) {
                inside = !inside;
            }
        }
        return inside;
    }

    /**
     * Calculates the bottom-center footprint contact point of an object bounding box
     * P_footprint = [x_center, y_bottom]
     */
    public static Point2D calculateFootprint(double x, double y, double width, double height) {
        double xCenter = x + (width / 2.0);
        double yBottom = y + height;
        return new Point2D(xCenter, yBottom);
    }
}
