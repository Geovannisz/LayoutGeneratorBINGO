/**
 * heatmap_worker.js
 *
 * Worker dedicated to generating high-resolution Cartesian heatmaps
 * from polar beam data (Theta/Phi) using bilinear interpolation.
 * Returns Uint8ClampedArray for Canvas ImageData.
 */

// Viridis Colormap (64 steps, RGB) - High-quality for smooth gradients
const VIRIDIS_MAP = [
    [68, 1, 84], [69, 6, 90], [70, 12, 95], [71, 17, 101],
    [71, 22, 106], [72, 27, 111], [72, 32, 115], [71, 37, 119],
    [71, 42, 122], [70, 47, 125], [69, 52, 127], [68, 57, 129],
    [66, 62, 131], [65, 67, 132], [63, 72, 133], [61, 77, 134],
    [59, 81, 134], [57, 86, 135], [55, 90, 135], [53, 95, 135],
    [51, 99, 135], [49, 103, 134], [47, 108, 134], [45, 112, 133],
    [43, 116, 132], [42, 120, 131], [40, 124, 130], [39, 128, 128],
    [38, 132, 127], [37, 136, 125], [36, 140, 123], [36, 144, 120],
    [36, 147, 118], [37, 151, 115], [38, 155, 112], [40, 158, 109],
    [42, 162, 105], [45, 165, 101], [49, 169, 97], [53, 172, 93],
    [57, 175, 88], [62, 178, 84], [68, 181, 79], [74, 184, 74],
    [80, 187, 68], [87, 189, 63], [94, 192, 57], [102, 194, 51],
    [109, 196, 46], [118, 198, 40], [126, 200, 35], [135, 202, 30],
    [144, 203, 26], [153, 205, 22], [162, 206, 19], [172, 207, 17],
    [181, 208, 16], [190, 208, 17], [199, 209, 19], [208, 209, 24],
    [217, 209, 31], [225, 209, 40], [233, 209, 51], [253, 231, 36]
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

// Binary Search for sorted arrays
function binarySearch(arr, target) {
    let left = 0;
    let right = arr.length - 1;
    let idx = -1;

    while (left <= right) {
        const mid = (left + right) >>> 1;
        if (arr[mid] <= target) {
            idx = mid;
            left = mid + 1;
        } else {
            right = mid - 1;
        }
    }
    return idx;
}

// Robust Phi Search to handle [0, 360], [-180, 180] or any wrapping
function findPhiIndex(phis, phiTarget) {
    // 1. Try direct match in range
    // Since phis is sorted, we can use binary search to find the lower bound index
    if (phiTarget >= phis[0] && phiTarget <= phis[phis.length - 1]) {
        let idx = binarySearch(phis, phiTarget);
        if (idx !== -1) return idx;
    }

    // 2. Try wrapped versions
    const pMinus = phiTarget - 360;
    if (pMinus >= phis[0] && pMinus <= phis[phis.length - 1]) {
        let idx = binarySearch(phis, pMinus);
        if (idx !== -1) return idx;
    }

    const pPlus = phiTarget + 360;
    if (pPlus >= phis[0] && pPlus <= phis[phis.length - 1]) {
        let idx = binarySearch(phis, pPlus);
        if (idx !== -1) return idx;
    }

    // Handle wrap-around gap (e.g., between 350 and 0/360)
    // If the data is e.g., 0..350, and we ask for 355, standard binary search
    // might point to 350 (last element). We need to verify if we should interpolate
    // between last and first.
    return -1;
}


function interpolateValue(grid, thetas, phis, r, phi) {
    // Theta Index (Binary Search)
    let tIdx = binarySearch(thetas, r);

    // Boundary checks
    if (tIdx === -1) {
        if (r <= thetas[0]) tIdx = 0;
        else return 0; // Should not happen if r is within maxTheta
    } else if (tIdx >= thetas.length - 1) {
        tIdx = thetas.length - 2;
    }

    if (r > thetas[thetas.length - 1]) return 0;


    // Phi Index (Robust)
    let pIdx = findPhiIndex(phis, phi);

    // Logic for Wrap-Around Interpolation
    let p0, p1;
    let v;

    if (pIdx === -1) {
        // Not found in any standard range. Check if we are in the "gap"
        // between the last phi and the first phi (wrapped).
        // e.g. phis=[0, ..., 350], phi=355.
        // We assume symmetry/continuity around 360 degrees.

        // Find the "last" index in the array
        pIdx = phis.length - 1;
        p0 = phis[pIdx];

        // The "next" theoretical point is the first point + 360
        let pNextVal = phis[0] + 360;

        // Check if phi is between p0 and pNextVal
        // We normalize phi to be positive 0..360 first in the caller loop.
        // But let's check both phi and phi+360 just in case.
        let effPhi = phi;
        if (effPhi < p0) effPhi += 360; // Should move it up if it was e.g. -10 and range is 0..350

        if (effPhi >= p0 && effPhi <= pNextVal) {
            p1 = phis[0]; // The grid value index is 0
            // But for interpolation math we use pNextVal
            const dp = pNextVal - p0;
            v = (effPhi - p0) / (dp || 1);
        } else {
            // Fallback: Clamp to nearest valid
            // If we are here, we are lost. Return nearest.
            return grid[tIdx][0]; // Dummy fallback
        }
    } else {
        // Standard Case
        // If pIdx is the last element, we might still be in the wrap gap if exact match didn't happen
        if (pIdx >= phis.length - 1) {
            // We are at the last element. We need to interpolate towards the first element (wrapped)
            p0 = phis[phis.length - 1];
            let pNextVal = phis[0] + 360;
            p1 = phis[0]; // Grid index

            // Check if we are indeed in this upper interval
            let effPhi = phi;
            if (effPhi < p0) effPhi += 360;

            // The binary search returns the index LEQ target.
            // If target is 355 and phis ends at 350, idx is last.
            // So we are interpolating between last and (first+360).

            const dp = pNextVal - p0;
            v = (effPhi - p0) / (dp || 1);
        } else {
            // Normal interpolation between pIdx and pIdx+1
            p0 = phis[pIdx];
            p1 = phis[pIdx + 1]; // Grid value index is pIdx+1
            let gridP1Index = pIdx + 1;

            // Determine effective phi
            let effPhi = phi;

            // Adjust effPhi to be close to p0 (handle simple wrapping offsets)
            // e.g. p0=350, p1=360 (if exists). phi=355.
            // e.g. p0=-10, p1=0. phi=-5.
            // If we found pIdx via a wrapped search (e.g. pMinus), we need to shift effPhi?
            // Actually findPhiIndex just returns the index in the array.
            // We need to verify which "version" of phi matched.

            // Heuristic: Make effPhi close to p0
            if (effPhi < p0 - 180) effPhi += 360;
            else if (effPhi > p0 + 180) effPhi -= 360;

            // If still out of bounds of [p0, next_val], something is odd, likely the wrap logic above
            // But assuming strict ordering in phis:
            let pNextVal = phis[pIdx + 1];

            // If we are interpolating across the -180/180 cut in a -180..180 dataset:
            // e.g. phis=[-180, ...], p0=-180.
            // If we needed to wrap 180 to -180, that's the "gap" logic handled in the `if (pIdx >= length-1)` block?
            // No, standard `binarySearch` handles finding the lower bound.

            // Let's stick to the simplest math:
            const dp = pNextVal - p0;
            v = (effPhi - p0) / (dp || 1);

            // If v is outside 0..1, it means our assumption about "effPhi" being inside is wrong.
            // This happens if phi was found via "pPlus" or "pMinus".
            // We should normalize v to [0,1].
            if (v < 0) v = 0;
            if (v > 1) v = 1;

            // Assign the grid index for the second point
            p1 = phis[gridP1Index]; // Used for value lookup? No, we need the INDEX.
            // Reassign p1 to be the INDEX for lookup later, not the value.
            // Actually, let's restructure variables.
        }
    }

    // Now we have tIdx, and we need pIdx_0 and pIdx_1, and interpolation factors u, v.

    // T-dimension
    const t0_val = thetas[tIdx];
    const t1_val = thetas[tIdx + 1];
    const dt = t1_val - t0_val;
    const u = (r - t0_val) / (dt || 1);

    // P-dimension logic refined
    // We determined v above.
    // We need the GRID INDICES for the two phi columns.
    let pIdx0 = pIdx;
    let pIdx1 = (pIdx + 1);

    // Wrap pIdx1 if it goes past end
    if (pIdx1 >= phis.length) {
        pIdx1 = 0; // Wrap to first element
    }

    const v00 = grid[tIdx][pIdx0];
    const v10 = grid[tIdx + 1][pIdx0];
    const v01 = grid[tIdx][pIdx1];
    const v11 = grid[tIdx + 1][pIdx1];

    return (1 - u) * (1 - v) * v00 +
        u * (1 - v) * v10 +
        (1 - u) * v * v01 +
        u * v * v11;
}

self.onmessage = function (e) {
    const { width, height, scaleType, magnitudesLinear, uniqueThetas, uniquePhis, renderId } = e.data;

    if (!magnitudesLinear || !uniqueThetas || !uniquePhis) {
        self.postMessage({ error: "Missing data for heatmap generation", renderId });
        return;
    }

    generateColormapLUT();

    const pixels = new Uint8ClampedArray(width * height * 4);
    const maxTheta = uniqueThetas[uniqueThetas.length - 1];
    const cx = width / 2;
    const cy = height / 2;
    const maxRadiusPx = Math.min(cx, cy) - 2;

    // Adaptive Supersampling Anti-Aliasing:
    // - Standard: 3x3 samples (9 total) for most of the image
    // - High density: 7x7 samples (49 total) near center where polar singularity causes issues
    const SSAA_STANDARD = 3;
    const SSAA_HIGH = 7;

    // Threshold: use high density when theta < 5 degrees
    // Convert to pixel radius threshold
    const highDensityThreshold = (5 / maxTheta) * maxRadiusPx;

    // Pre-generate sample offsets for both densities
    function generateSampleOffsets(n) {
        const offsets = [];
        for (let sy = 0; sy < n; sy++) {
            for (let sx = 0; sx < n; sx++) {
                offsets.push({
                    dx: (sx + 0.5) / n - 0.5,
                    dy: (sy + 0.5) / n - 0.5
                });
            }
        }
        return offsets;
    }

    const standardOffsets = generateSampleOffsets(SSAA_STANDARD);
    const highDensityOffsets = generateSampleOffsets(SSAA_HIGH);

    // Helper function to apply scaling to a value
    function applyScale(val, scaleType) {
        if (scaleType === 'dB') {
            if (val <= 1e-10) val = 1e-10;
            let db = 20 * Math.log10(val);
            const minDb = -60;
            if (db < minDb) db = minDb;
            if (db > 0) db = 0;
            return (db - minDb) / (0 - minDb);
        } else if (scaleType === 'sqrt') {
            return Math.sqrt(val);
        } else if (scaleType === 'quadratic') {
            return val * val;
        } else if (scaleType === 'fourth_root') {
            return Math.pow(val, 0.25);
        }
        return val;
    }

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 4;

            // Check if center is outside circle first (optimization)
            const centerDx = x - cx;
            const centerDy = y - cy;
            const centerRPx = Math.sqrt(centerDx * centerDx + centerDy * centerDy);

            if (centerRPx > maxRadiusPx + 1) {
                pixels[idx] = 0; pixels[idx + 1] = 0; pixels[idx + 2] = 0; pixels[idx + 3] = 0;
                continue;
            }

            // Supersample: average multiple sub-pixel samples
            // Use higher density near center to handle polar singularity
            const sampleOffsets = centerRPx < highDensityThreshold ? highDensityOffsets : standardOffsets;
            const numSamples = sampleOffsets.length;

            let sumVal = 0;
            let validSamples = 0;

            for (let s = 0; s < numSamples; s++) {
                const sampleX = x + sampleOffsets[s].dx;
                const sampleY = y + sampleOffsets[s].dy;

                const dx = sampleX - cx;
                const dy = sampleY - cy;
                const rPx = Math.sqrt(dx * dx + dy * dy);

                if (rPx > maxRadiusPx) {
                    continue; // This sample is outside
                }

                const theta = (rPx / maxRadiusPx) * maxTheta;
                let angleRad = Math.atan2(-dy, dx);
                let angleDeg = angleRad * 180 / Math.PI;
                if (angleDeg < 0) angleDeg += 360;

                const val = interpolateValue(magnitudesLinear, uniqueThetas, uniquePhis, theta, angleDeg);
                const scaledVal = applyScale(val, scaleType);

                sumVal += scaledVal;
                validSamples++;
            }

            if (validSamples === 0) {
                pixels[idx] = 0; pixels[idx + 1] = 0; pixels[idx + 2] = 0; pixels[idx + 3] = 0;
                continue;
            }

            let normalizedVal = sumVal / validSamples;
            if (normalizedVal < 0) normalizedVal = 0;
            if (normalizedVal > 1) normalizedVal = 1;

            const colorIdx = Math.floor(normalizedVal * 255);
            pixels[idx] = COLORMAP_LUT[colorIdx * 3];
            pixels[idx + 1] = COLORMAP_LUT[colorIdx * 3 + 1];
            pixels[idx + 2] = COLORMAP_LUT[colorIdx * 3 + 2];
            pixels[idx + 3] = 255;
        }
    }

    self.postMessage({ pixels: pixels, width: width, height: height, renderId: renderId }, [pixels.buffer]);
};
