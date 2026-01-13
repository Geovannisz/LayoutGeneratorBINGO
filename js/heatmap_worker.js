/**
 * heatmap_worker.js
 *
 * Worker dedicated to generating high-resolution Cartesian heatmaps
 * from polar beam data (Theta/Phi) using bilinear interpolation.
 * Returns Uint8ClampedArray for Canvas ImageData.
 */

// Viridis Colormap (256 steps, RGB)
const VIRIDIS_MAP = [
    [68, 1, 84], [72, 35, 116], [64, 67, 135], [52, 94, 141],
    [41, 120, 142], [32, 144, 140], [34, 167, 132], [68, 190, 112],
    [121, 209, 81], [189, 222, 38], [253, 231, 36]
];

function getViridisColor(t) {
    if (t <= 0) return VIRIDIS_MAP[0];
    if (t >= 1) return VIRIDIS_MAP[VIRIDIS_MAP.length - 1];
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

// Robust Phi Search to handle [0, 360], [-180, 180] or any wrapping
function findPhiIndex(phis, phiTarget) {
    // Try direct match
    for (let i = 0; i < phis.length - 1; i++) {
        if (phiTarget >= phis[i] && phiTarget <= phis[i+1]) return i;
    }

    // Try wrapped versions (phi - 360, phi + 360)
    const pMinus = phiTarget - 360;
    for (let i = 0; i < phis.length - 1; i++) {
        if (pMinus >= phis[i] && pMinus <= phis[i+1]) return i;
    }

    const pPlus = phiTarget + 360;
    for (let i = 0; i < phis.length - 1; i++) {
        if (pPlus >= phis[i] && pPlus <= phis[i+1]) return i;
    }

    return -1;
}


function interpolateValue(grid, thetas, phis, r, phi) {
    // Theta Index
    let tIdx = -1;
    for (let i = 0; i < thetas.length - 1; i++) {
        if (r >= thetas[i] && r <= thetas[i+1]) {
            tIdx = i;
            break;
        }
    }
    if (tIdx === -1) {
        if (r <= thetas[0]) tIdx = 0;
        else if (r >= thetas[thetas.length-1]) tIdx = thetas.length - 2;
        else return 0;
    }

    // Phi Index (Robust)
    let pIdx = findPhiIndex(phis, phi);

    // Fallback/Clamp if still not found (e.g. slight precision errors at boundaries)
    // Note: If data is -180..180 and we ask for 180.0001, findPhiIndex might fail.
    if (pIdx === -1) {
        // Simple clamp to nearest valid range for visualization continuity
        // But we must be careful not to clamp across the cut.
        // For now, let's clamp to last segment if it looks close, or first.
        // Heuristic: check distance to first and last.
        // Actually, for beam patterns, 0 and 360 should ideally meet.
        // If we fail, just return 0 to avoid artifacts, or clamp to 0 index.
        // Let's try wrapping via modulo logic for strict 0..360 data sets.

        // As a safe fallback for the "missing top half" issue:
        // Try normalizing phi to the data's range.
        const minPhi = phis[0];
        const maxPhi = phis[phis.length-1];

        if (phi < minPhi) pIdx = 0;
        else if (phi > maxPhi) pIdx = phis.length - 2;
        else pIdx = 0;
    }

    const t0 = thetas[tIdx];
    const t1 = thetas[tIdx+1];

    // For Phi, we need the actual values at pIdx to interpolate
    // CAUTION: If we matched using a wrapped version (e.g. pMinus), we must interpolate
    // relative to that wrapped version range, OR normalize the input phi to that range.
    // Simplification: We found pIdx such that phis[pIdx] <= matching_phi <= phis[pIdx+1].
    // We need to know WHICH matching_phi it was.

    // Let's re-determine the effective phi for interpolation
    let effPhi = phi;
    if (effPhi < phis[pIdx]) effPhi += 360; // Try shifting up
    if (effPhi > phis[pIdx+1]) effPhi -= 360; // Try shifting down

    // Double check if effPhi is now in range
    if (effPhi < phis[pIdx] || effPhi > phis[pIdx+1]) {
        // If still out of range (maybe it was a clamp fallback), force it to boundary
        effPhi = (effPhi < phis[pIdx]) ? phis[pIdx] : phis[pIdx+1];
    }

    const p0 = phis[pIdx];
    const p1 = phis[pIdx+1];

    const dt = t1 - t0;
    const dp = p1 - p0;

    const u = (r - t0) / (dt || 1);
    const v = (effPhi - p0) / (dp || 1);

    const v00 = grid[tIdx][pIdx];
    const v10 = grid[tIdx+1][pIdx];
    const v01 = grid[tIdx][pIdx+1];
    const v11 = grid[tIdx+1][pIdx+1];

    return (1 - u) * (1 - v) * v00 +
           u * (1 - v) * v10 +
           (1 - u) * v * v01 +
           u * v * v11;
}

self.onmessage = function(e) {
    const { width, height, scaleType, magnitudesLinear, uniqueThetas, uniquePhis } = e.data;

    if (!magnitudesLinear || !uniqueThetas || !uniquePhis) {
        self.postMessage({ error: "Missing data for heatmap generation" });
        return;
    }

    generateColormapLUT();

    const pixels = new Uint8ClampedArray(width * height * 4);
    const maxTheta = uniqueThetas[uniqueThetas.length - 1];
    const cx = width / 2;
    const cy = height / 2;
    const maxRadiusPx = Math.min(cx, cy) - 2;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const dx = x - cx;
            const dy = y - cy;
            const rPx = Math.sqrt(dx*dx + dy*dy);
            const idx = (y * width + x) * 4;

            if (rPx > maxRadiusPx) {
                pixels[idx] = 0; pixels[idx+1] = 0; pixels[idx+2] = 0; pixels[idx+3] = 0;
                continue;
            }

            const theta = (rPx / maxRadiusPx) * maxTheta;

            // Coordinate System:
            // Standard Math: 0 deg = X+ (Right), 90 deg = Y+ (Up).
            // Screen: Y is Down. So Y+ (Up) is -dy.
            // Result: 0=Right, 90=Up, 180=Left, 270=Down.
            let angleRad = Math.atan2(-dy, dx);
            let angleDeg = angleRad * 180 / Math.PI;

            // Normalize to 0..360 for consistent querying
            if (angleDeg < 0) angleDeg += 360;

            let val = interpolateValue(magnitudesLinear, uniqueThetas, uniquePhis, theta, angleDeg);

            // Scale Logic
            let normalizedVal = 0;
            if (scaleType === 'dB') {
                if (val <= 1e-10) val = 1e-10;
                let db = 20 * Math.log10(val);
                const minDb = -60;
                if (db < minDb) db = minDb;
                if (db > 0) db = 0;
                normalizedVal = (db - minDb) / (0 - minDb);
            } else if (scaleType === 'sqrt') {
                normalizedVal = Math.sqrt(val);
            } else if (scaleType === 'quadratic') {
                normalizedVal = val * val;
            } else if (scaleType === 'fourth_root') {
                normalizedVal = Math.pow(val, 0.25);
            } else {
                normalizedVal = val;
            }

            if (normalizedVal < 0) normalizedVal = 0;
            if (normalizedVal > 1) normalizedVal = 1;

            const colorIdx = Math.floor(normalizedVal * 255);
            pixels[idx] = COLORMAP_LUT[colorIdx * 3];
            pixels[idx+1] = COLORMAP_LUT[colorIdx * 3 + 1];
            pixels[idx+2] = COLORMAP_LUT[colorIdx * 3 + 2];
            pixels[idx+3] = 255;
        }
    }

    self.postMessage({ pixels: pixels, width: width, height: height }, [pixels.buffer]);
};
