/**
 * heatmap_worker.js
 *
 * Worker dedicated to generating high-resolution Cartesian heatmaps
 * from polar beam data (Theta/Phi) using bilinear interpolation.
 * Returns Uint8ClampedArray for Canvas ImageData.
 */

// Viridis Colormap (256 steps, RGB)
// Sourced from matplotlib standard viridis
const VIRIDIS_MAP = [
    [68, 1, 84], [72, 35, 116], [64, 67, 135], [52, 94, 141],
    [41, 120, 142], [32, 144, 140], [34, 167, 132], [68, 190, 112],
    [121, 209, 81], [189, 222, 38], [253, 231, 36]
];

// Helper to interpolate color from the concise table above
function getViridisColor(t) {
    if (t <= 0) return VIRIDIS_MAP[0];
    if (t >= 1) return VIRIDIS_MAP[VIRIDIS_MAP.length - 1];

    // Scale t to the array index
    const pos = t * (VIRIDIS_MAP.length - 1);
    const idx = Math.floor(pos);
    const frac = pos - idx;

    const c1 = VIRIDIS_MAP[idx];
    const c2 = VIRIDIS_MAP[idx + 1];

    return [
        Math.round(c1[0] + (c2[0] - c1[0]) * frac),
        Math.round(c1[1] + (c2[1] - c1[1]) * frac),
        Math.round(c1[2] + (c2[2] - c1[2]) * frac)
    ];
}

// Full Viridis LUT generation (more performance efficient for pixel loops)
let COLORMAP_LUT = null;
function generateColormapLUT() {
    if (COLORMAP_LUT) return;
    COLORMAP_LUT = new Uint8Array(256 * 3);
    for (let i = 0; i < 256; i++) {
        const rgb = getViridisColor(i / 255);
        COLORMAP_LUT[i * 3] = rgb[0];
        COLORMAP_LUT[i * 3 + 1] = rgb[1];
        COLORMAP_LUT[i * 3 + 2] = rgb[2];
    }
}

// Bilinear interpolation for the polar grid
function interpolateValue(grid, thetas, phis, r, phi) {
    // grid is [thetaIndex][phiIndex]

    // Find theta indices
    // Assuming thetas is sorted ascending
    let tIdx = -1;
    for (let i = 0; i < thetas.length - 1; i++) {
        if (r >= thetas[i] && r <= thetas[i+1]) {
            tIdx = i;
            break;
        }
    }
    // Handle edge case: r exactly max or slight overshoot due to float precision
    if (tIdx === -1) {
        if (r <= thetas[0]) tIdx = 0;
        else if (r >= thetas[thetas.length-1]) tIdx = thetas.length - 2;
        else return 0; // Should not happen given logic below
    }

    // Find phi indices
    // Normalize phi to [0, 360) (phis are expected to be 0..360 or similar)
    // Note: phis array from worker usually covers 0 to 360.
    // If phi < 0, add 360.
    let phiNorm = phi;
    if (phiNorm < 0) phiNorm += 360;
    if (phiNorm >= 360) phiNorm -= 360;

    let pIdx = -1;
    for (let i = 0; i < phis.length - 1; i++) {
        if (phiNorm >= phis[i] && phiNorm <= phis[i+1]) {
            pIdx = i;
            break;
        }
    }
    // Wrap around for phi (360 -> 0)
    // If phis includes 360, pIdx might be last.
    // Generally antenna codes produce 0...359 or 0...360.
    if (pIdx === -1) {
        // Fallback for circular continuity or precision errors
        if (phiNorm > phis[phis.length-1]) pIdx = phis.length - 2; // Clamp
        else pIdx = 0;
    }

    const t0 = thetas[tIdx];
    const t1 = thetas[tIdx+1];
    const p0 = phis[pIdx];
    const p1 = phis[pIdx+1];

    const dt = t1 - t0;
    const dp = p1 - p0;

    // Factors
    const u = (r - t0) / (dt || 1); // Theta factor
    const v = (phiNorm - p0) / (dp || 1); // Phi factor

    // Values
    const v00 = grid[tIdx][pIdx];
    const v10 = grid[tIdx+1][pIdx];
    const v01 = grid[tIdx][pIdx+1];
    const v11 = grid[tIdx+1][pIdx+1];

    // Bilinear interp
    const val = (1 - u) * (1 - v) * v00 +
                u * (1 - v) * v10 +
                (1 - u) * v * v01 +
                u * v * v11;

    return val;
}

self.onmessage = function(e) {
    const {
        width,
        height,
        scaleType,
        magnitudesLinear, // Raw linear data: 2D array [theta][phi]
        uniqueThetas,
        uniquePhis
    } = e.data;

    if (!magnitudesLinear || !uniqueThetas || !uniquePhis) {
        self.postMessage({ error: "Missing data for heatmap generation" });
        return;
    }

    generateColormapLUT();

    const pixels = new Uint8ClampedArray(width * height * 4);
    const maxTheta = uniqueThetas[uniqueThetas.length - 1];
    const cx = width / 2;
    const cy = height / 2;
    // Radius in pixels that corresponds to maxTheta
    const maxRadiusPx = Math.min(cx, cy) - 2; // -2 padding

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const dx = x - cx;
            const dy = y - cy; // Standard image coords: y down
            // But usually for polar plots we want Y up or matching the standard conventions.
            // Let's assume standard math coords: x right, y down (screen).
            // Distance from center
            const rPx = Math.sqrt(dx*dx + dy*dy);

            const idx = (y * width + x) * 4;

            if (rPx > maxRadiusPx) {
                // Background (transparent or white)
                pixels[idx] = 0; pixels[idx+1] = 0; pixels[idx+2] = 0; pixels[idx+3] = 0; // Transparent
                continue;
            }

            // Map pixel radius to Theta
            const theta = (rPx / maxRadiusPx) * maxTheta;

            // Map pixel angle to Phi
            // Math.atan2(y, x). Screen Y is down, so dy is positive down.
            // Standard polar: Y up. So use -dy.
            let angleRad = Math.atan2(-dy, dx);
            let angleDeg = angleRad * 180 / Math.PI;
            // atan2 returns -180 to 180. Map to 0..360
            if (angleDeg < 0) angleDeg += 360;

            // Interpolate raw linear value
            let val = interpolateValue(magnitudesLinear, uniqueThetas, uniquePhis, theta, angleDeg);

            // Apply Scale
            let normalizedVal = 0;

            // Note: magnitudesLinear is assumed to be raw or normalized linear.
            // Assuming the worker passed normalized linear [0..1] for simplicity,
            // OR we re-normalize here if needed.
            // Checking beam_worker_3d: it passes 'magnitudes_grid_linear_normalized' [0..1].
            // So 'val' is 0..1.

            if (scaleType === 'dB') {
                // dB Range: -40dB or -60dB floor to 0dB?
                // Typically heatmaps show a range.
                // Let's implement a floor of -60dB for visualization.
                if (val <= 1e-6) val = 1e-6; // avoid log(0)
                let db = 20 * Math.log10(val);
                // Map [-60, 0] to [0, 1]
                const minDb = -60;
                if (db < minDb) db = minDb;
                if (db > 0) db = 0;
                normalizedVal = (db - minDb) / (0 - minDb);
            } else if (scaleType === 'sqrt') {
                normalizedVal = Math.sqrt(val);
            } else { // Linear
                normalizedVal = val;
            }

            // Clamp
            if (normalizedVal < 0) normalizedVal = 0;
            if (normalizedVal > 1) normalizedVal = 1;

            // Map to Color
            const colorIdx = Math.floor(normalizedVal * 255);

            pixels[idx] = COLORMAP_LUT[colorIdx * 3];     // R
            pixels[idx+1] = COLORMAP_LUT[colorIdx * 3 + 1]; // G
            pixels[idx+2] = COLORMAP_LUT[colorIdx * 3 + 2]; // B
            pixels[idx+3] = 255; // Alpha
        }
    }

    self.postMessage({ pixels: pixels, width: width, height: height }, [pixels.buffer]);
};
