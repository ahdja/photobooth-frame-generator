import { Slot, CatalogSlot, DetectOptions } from './types';

type Pt = { x: number; y: number };

/** Cross product of (a-o) x (b-o); > 0 means a counter-clockwise turn. */
function cross(o: Pt, a: Pt, b: Pt): number {
    return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

/**
 * Convex hull (Andrew monotone chain, collinear points dropped).
 * Sorts `pts` in place (x, then y). Returns hull vertices in a fixed order;
 * the Go port (backend/internal/slots) walks the same order on purpose.
 */
export function convexHull(pts: Pt[]): Pt[] {
    pts.sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));
    const lower: Pt[] = [];
    for (const p of pts) {
        while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
        lower.push(p);
    }
    const upper: Pt[] = [];
    for (let i = pts.length - 1; i >= 0; i--) {
        const p = pts[i];
        while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
        upper.push(p);
    }
    upper.pop();
    lower.pop();
    return lower.concat(upper);
}

/**
 * Minimum-area bounding box of a convex hull (rotating on each hull edge).
 * Returns null for an empty hull. `angle` is normalised to (-45, 45] degrees
 * expressed in RADIANS, clockwise in canvas coordinates (y down); width and
 * height are swapped when the box was rotated by more than 45 degrees.
 */
export function minimumBoundingBox(hull: Pt[]): Slot | null {
    if (hull.length === 0) return null;
    let minArea = Infinity;
    let best: Slot | null = null;
    for (let i = 0; i < hull.length; i++) {
        const p1 = hull[i];
        const p2 = hull[(i + 1) % hull.length];
        const edgeTheta = Math.atan2(p2.y - p1.y, p2.x - p1.x);
        const cosT = Math.cos(-edgeTheta);
        const sinT = Math.sin(-edgeTheta);
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (const p of hull) {
            const rx = p.x * cosT - p.y * sinT;
            const ry = p.x * sinT + p.y * cosT;
            if (rx < minX) minX = rx;
            if (rx > maxX) maxX = rx;
            if (ry < minY) minY = ry;
            if (ry > maxY) maxY = ry;
        }
        const w = maxX - minX;
        const h = maxY - minY;
        if (w * h < minArea) {
            minArea = w * h;
            const cxRot = minX + w / 2;
            const cyRot = minY + h / 2;
            const rc = Math.cos(edgeTheta);
            const rs = Math.sin(edgeTheta);
            best = { cx: cxRot * rc - cyRot * rs, cy: cxRot * rs + cyRot * rc, width: w, height: h, angle: edgeTheta };
        }
    }
    if (!best) return null;
    let deg = ((best.angle * (180 / Math.PI)) % 180 + 180) % 180; // [0, 180)
    if (deg > 45 && deg <= 135) {
        deg -= 90;
        [best.width, best.height] = [best.height, best.width];
    } else if (deg > 135) {
        deg -= 180;
    }
    best.angle = deg * (Math.PI / 180);
    // hull points are pixel centres: +1 turns the centre-to-centre extent into the covered pixel extent
    best.width += 1;
    best.height += 1;
    return best;
}

/**
 * Pure slot detection on raw RGBA pixels (no canvas, runs in Node/tests/workers).
 * A slot is a 4-connected region of pixels with alpha < alphaThreshold whose
 * axis-aligned bbox is at least minSlotSize on BOTH sides; its rotated minimum
 * bounding box is returned. Order: row band (top / max(1, height/20)) then x,
 * so slots on one visual row sort left to right despite 1-2 px jitter.
 * @param data RGBA bytes, length >= width*height*4
 * @returns raw slots (floats, angle in radians); see toCatalogSlots for the server format
 */
export function detectSlotsFromImageData(data: ArrayLike<number>, width: number, height: number, opts: DetectOptions = {}): Slot[] {
    const alphaThreshold = opts.alphaThreshold ?? 10;
    const minSlotSize = opts.minSlotSize ?? 50;
    const visited = new Uint8Array(width * height);
    const slots: Slot[] = [];
    const isHole = (idx: number) => data[idx * 4 + 3] < alphaThreshold;
    for (let i = 0; i < width * height; i++) {
        if (visited[i] || !isHole(i)) continue;
        const queue: number[] = [i];
        visited[i] = 1;
        const boundary: Pt[] = [];
        let minX = width, maxX = -1, minY = height, maxY = -1;
        for (let head = 0; head < queue.length; head++) {
            const cur = queue[head];
            const x = cur % width, y = (cur - x) / width;
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
            let isBoundary = false;
            for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
                if (nx < 0 || nx >= width || ny < 0 || ny >= height) { isBoundary = true; continue; }
                const n = ny * width + nx;
                if (!isHole(n)) { isBoundary = true; continue; }
                if (!visited[n]) { visited[n] = 1; queue.push(n); }
            }
            if (isBoundary) boundary.push({ x, y });
        }
        if (maxX - minX + 1 < minSlotSize || maxY - minY + 1 < minSlotSize) continue;
        const mbb = minimumBoundingBox(convexHull(boundary));
        if (mbb) slots.push(mbb);
    }
    const band = Math.max(1, Math.floor(height / 20));
    const key = (s: Slot) => Math.floor((s.cy - s.height / 2) / band);
    return slots.sort((a, b) => key(a) - key(b) || a.cx - b.cx);
}

/** Round half up, and never return -0 (JSON/deepEqual treat -0 != 0). */
function rnd(v: number, scale = 1): number {
    return Math.floor(v * scale + 0.5) / scale + 0;
}

/**
 * Converts raw slots to the vlor catalog format shared with the Go detector:
 * integer pixels, angle in DEGREES (clockwise, 2 decimals), radius 0, round false.
 * @param expansion total growth per axis in px (half per side), 0 = none; the
 *   box centre and angle are unchanged. Same meaning as slots.Options.Expansion.
 */
export function toCatalogSlots(slots: Slot[], expansion = 0): CatalogSlot[] {
    return slots.map((s) => ({
        cx: rnd(s.cx),
        cy: rnd(s.cy),
        width: rnd(s.width + expansion),
        height: rnd(s.height + expansion),
        angle: rnd(s.angle * (180 / Math.PI), 100),
        radius: 0,
        round: false,
    }));
}
