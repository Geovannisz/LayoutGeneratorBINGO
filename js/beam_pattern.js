// js/beam_pattern.js

/**
 * beam_pattern.js
 * Modificado para usar:
 * 1. Arquivos CSV individuais para plot 2D.
 * 2. Arquivo CSV completo para 3D e Heatmap.
 * 3. Heatmap nativo 2D via Canvas (heatmap_worker.js) para alta performance e qualidade.
 * 4. Cache inteligente de dados e resultados.
 */

// === Constantes ===
const FREQUENCY = 1e9;
const C_LIGHT = 299792458;
const LAMBDA = C_LIGHT / FREQUENCY;
const K = (2 * Math.PI) / LAMBDA;

// Lista de Gateways IPFS Públicos
const IPFS_GATEWAYS = [
    "https://dweb.link/ipfs/",
    "https://ipfs.io/ipfs/",
    "https://gateway.pinata.cloud/ipfs/",
    "https://cloudflare-ipfs.com/ipfs/",
    "https://gateway.ipfs.io/ipfs/"
];

const E_FIELD_BASE_CID_PHI_SPECIFIC = 'bafybeibod4uopaxesmqti3qmonjcbttgxquuby6y6v2uo6sd7ah475bsai';
const E_FIELD_FULL_DATA_CID = 'bafybeicunhz5lwv3nryglwlppu6o6keo7ii3ilntcqtq536aket7qflc34';

const MAX_PLOT_POINTS_BEAM = 2000;
const PLOT_REQUEST_DEBOUNCE_DELAY = 300;

// === Cache & Estado ===
let parsedEFieldPhiDataCache = {};
let fetchPhiPromisesCache = {};

let fullEFieldDataCache = null;
let fullEFieldDataLoadingState = 'idle';
let fetchFullDataPromiseActive = null;

let isProcessingPlot = false;
let pendingRequestFn = null; // Store pending request if worker is busy
let beamCalculationWorker = null;  // 2D Worker
let beamCalculationWorker3D = null;// 3D Data Worker
let heatmapWorker = null;          // New Native Heatmap Worker

let currentCalculationId = 0;
let current3DCalculationId = 0;
let currentHeatmapRenderId = 0;    // ID for heatmap requests

let storedWorkerPlotParams = {};
let storedFullDataScaleType = 'sqrt'; // default
const HEATMAP_RESOLUTION = 2048; // Fixed high resolution

// Cache para Resultados de Cálculos 3D
let cachedCalculationResult3D = null;
let cachedCalculationParams3D = null;

let latestPlotRequestParams = null;
let currentlyProcessingRequestTimestamp = null;
let processRequestTimeoutId = null;
let layoutUpdateTimeout = null; // Debounce for layout updates

// === DOM Element References ===
let phiSlider, phiInput, scaleSelect;
let visualize3DBtn, visualize2DBtn, visualizeHeatmapBtn;
let plotDivId = 'beam-pattern-plot'; // Plotly Div
let heatmapContainer, heatmapCanvas, heatmapTooltip, heatmapLegendCanvas;
let statusDiv = null;

// === EXPORT FOR EXTERNAL MODULES (PSF) ===
window.getBeamPatternModuleData = function () {
    return {
        K_CONST: K,
        parsedEFieldData3D: fullEFieldDataCache,
        fullEFieldDataLoadingState: fullEFieldDataLoadingState,
        ensureDataLoaded: ensureFullEFieldData3DLoaded // Expose the loader function
    };
};
// Make specific loader global as requested by existing main.js logic
window.ensureFullEFieldData3DLoaded = ensureFullEFieldData3DLoaded;


// === Helper Functions ===
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function getLayoutHash(antennaCoords) {
    if (!antennaCoords) return "";
    return JSON.stringify(antennaCoords.map(a => [Math.round(a[0] * 100), Math.round(a[1] * 100)]));
}

async function fetchDataFromIPFS(cidWithPath, options = {}) {
    let lastError = null;
    let originalStatusText = statusDiv ? statusDiv.textContent : "";
    let statusUpdatedForGateway = false;
    const GATEWAY_TIMEOUT = 5000;

    for (let i = 0; i < IPFS_GATEWAYS.length; i++) {
        const gatewayBase = IPFS_GATEWAYS[i];
        const url = gatewayBase + cidWithPath;

        if (statusDiv && originalStatusText.startsWith("Carregando dados")) {
            const gatewayHostname = new URL(gatewayBase).hostname;
            statusDiv.textContent = `${originalStatusText.split(' (Tentando')[0]} (Tentando ${gatewayHostname}, ${i + 1}/${IPFS_GATEWAYS.length})...`;
            statusUpdatedForGateway = true;
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), GATEWAY_TIMEOUT);
        const fetchOptions = { ...options, signal: controller.signal };

        try {
            const response = await fetch(url, fetchOptions);
            clearTimeout(timeoutId);

            if (!response.ok) {
                console.warn(`Falha em ${url}: ${response.status}. Tentando próximo.`);
                continue;
            }
            if (statusUpdatedForGateway && statusDiv) {
                statusDiv.textContent = originalStatusText.split(' (Tentando')[0] + " (Conectado!)";
            }
            return response;
        } catch (error) {
            console.warn(`Erro em ${url}: ${error.message}.`);
            lastError = error;
        }
    }
    throw lastError || new Error("Falha ao buscar de todos os gateways.");
}

// === Data Fetching (2D) ===
async function _fetchAndParseSinglePhiWithRetry(phiValue) {
    const roundedPhi = Math.round(parseFloat(phiValue));
    const filePathInCID = `efield_phi_${roundedPhi}.csv`;
    if (statusDiv) statusDiv.textContent = `Carregando dados 2D (Phi ${roundedPhi}°)...`;

    try {
        const response = await fetchDataFromIPFS(E_FIELD_BASE_CID_PHI_SPECIFIC + "/" + filePathInCID);
        const csvText = await response.text();
        const lines = csvText.trim().split('\n');

        if (lines.length < 2 || csvText.startsWith("version")) throw new Error("CSV Inválido/LFS Pointer.");

        const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim().toLowerCase());
        const indices = {
            theta_deg: headers.indexOf('theta [deg]'),
            phi_deg: headers.indexOf('phi [deg]'),
            reTheta: headers.indexOf('re(retheta) [v]'),
            imTheta: headers.indexOf('im(retheta) [v]'),
            rePhi: headers.indexOf('re(rephi) [v]'),
            imPhi: headers.indexOf('im(rephi) [v]')
        };

        if (Object.values(indices).some(index => index === -1)) throw new Error("Cabeçalhos inválidos.");

        const data = [];
        for (let i = 1; i < lines.length; i++) {
            const v = lines[i].split(',').map(val => val.replace(/"/g, '').trim());
            if (v.length !== headers.length) continue;
            try {
                const theta = parseFloat(v[indices.theta_deg]);
                const reTheta = parseFloat(v[indices.reTheta]);
                const imTheta = parseFloat(v[indices.imTheta]);
                const rePhi = parseFloat(v[indices.rePhi]);
                const imPhi = parseFloat(v[indices.imPhi]);
                const phi = parseFloat(v[indices.phi_deg]);
                if (!isNaN(theta)) {
                    data.push({ theta, phi, rETheta: { re: reTheta, im: imTheta }, rEPhi: { re: rePhi, im: imPhi } });
                }
            } catch (e) { }
        }
        return data;
    } catch (error) {
        throw error;
    }
}

async function fetchAndParseEFieldDataForSelectedPhi(phiValue) {
    const roundedPhi = Math.round(parseFloat(phiValue));
    if (parsedEFieldPhiDataCache[roundedPhi]) return parsedEFieldPhiDataCache[roundedPhi];
    if (fetchPhiPromisesCache[roundedPhi]) return fetchPhiPromisesCache[roundedPhi];

    const promise = _fetchAndParseSinglePhiWithRetry(phiValue).then(data => {
        parsedEFieldPhiDataCache[roundedPhi] = data;
        delete fetchPhiPromisesCache[roundedPhi];
        return data;
    }).catch(e => { delete fetchPhiPromisesCache[roundedPhi]; throw e; });

    fetchPhiPromisesCache[roundedPhi] = promise;
    return promise;
}

// === Data Fetching (3D) ===
async function _fetchAndParseFullEFieldDataRecursive3D() {
    if (statusDiv) statusDiv.textContent = `Carregando dados Completos...`;
    try {
        const response = await fetchDataFromIPFS(E_FIELD_FULL_DATA_CID);
        const csvText = await response.text();
        if (csvText.startsWith("version")) throw new Error("LFS Pointer recebido.");

        const lines = csvText.trim().split('\n');
        if (lines.length < 2) throw new Error("CSV vazio.");

        const headers = lines[0].split(',').map(h => h.replace(/"/g, '').replace(/\[.*?\]/g, '').trim().toLowerCase());
        const indices = {
            phi: headers.indexOf('phi'),
            theta: headers.indexOf('theta'),
            re_rephi: headers.indexOf('re(rephi)'),
            im_rephi: headers.indexOf('im(rephi)'),
            re_retheta: headers.indexOf('re(retheta)'),
            im_retheta: headers.indexOf('im(retheta)')
        };
        if (Object.values(indices).some(index => index === -1)) throw new Error("Cabeçalhos 3D inválidos.");

        const data = [];
        const uniquePhiValues = new Set();
        for (let i = 1; i < lines.length; i++) {
            const v = lines[i].split(',').map(val => val.replace(/"/g, '').trim());
            if (v.length !== headers.length) continue;
            const phi = parseFloat(v[indices.phi]);
            const theta = parseFloat(v[indices.theta]);
            if (!isNaN(phi) && !isNaN(theta)) {
                data.push({
                    phi_deg: phi, theta_deg: theta,
                    rEPhi: { re: parseFloat(v[indices.re_rephi]), im: parseFloat(v[indices.im_rephi]) },
                    rETheta: { re: parseFloat(v[indices.re_retheta]), im: parseFloat(v[indices.im_retheta]) }
                });
                uniquePhiValues.add(phi);
            }
        }
        Object.defineProperty(data, 'uniquePhis', { value: Array.from(uniquePhiValues).sort((a, b) => a - b), writable: false });
        return data;
    } catch (error) { throw error; }
}

async function ensureFullEFieldData3DLoaded() {
    if (fullEFieldDataLoadingState === 'loaded' && fullEFieldDataCache) return fullEFieldDataCache;
    if (fullEFieldDataLoadingState === 'loading' && fetchFullDataPromiseActive) return fetchFullDataPromiseActive;

    fullEFieldDataLoadingState = 'loading';
    const promise = _fetchAndParseFullEFieldDataRecursive3D().then(data => {
        fullEFieldDataCache = data;
        fullEFieldDataLoadingState = 'loaded';
        window.dispatchEvent(new CustomEvent('beamData3DLoaded'));
        return data;
    }).catch(e => {
        fullEFieldDataLoadingState = 'error';
        throw e;
    });
    fetchFullDataPromiseActive = promise;
    return promise;
}


// === Plotting Functions ===

function toggleViews(viewMode) {
    const plotDiv = document.getElementById(plotDivId);
    if (!plotDiv || !heatmapContainer) return;

    if (viewMode === 'heatmap') {
        plotDiv.style.visibility = 'hidden';
        plotDiv.style.opacity = '0';
        plotDiv.style.display = 'none'; // Ensure display none to remove from flow

        heatmapContainer.style.display = 'flex';
        heatmapContainer.style.zIndex = '10';
    } else {
        // 2D or 3D
        heatmapContainer.style.display = 'none';

        plotDiv.style.display = 'block'; // Restore to flow
        plotDiv.style.visibility = 'visible';
        plotDiv.style.opacity = '1';
    }
}

// 2D Plot (Plotly)
function plotBeamPattern2D(theta, fieldMagnitude, phiValue, scaleType) {
    toggleViews('2d');

    const peak = Math.max(1e-10, ...fieldMagnitude);
    let yData, title;

    if (scaleType === 'dB') {
        yData = fieldMagnitude.map(mag => Math.max(-100, 20 * Math.log10(Math.max(mag / peak, 1e-10))));
        title = 'Magnitude (dB)';
    } else if (scaleType === 'sqrt') {
        yData = fieldMagnitude.map(mag => Math.sqrt(mag / peak));
        title = 'Magnitude (Sqrt)';
    } else if (scaleType === 'quadratic') {
        yData = fieldMagnitude.map(mag => Math.pow(mag / peak, 2));
        title = 'Magnitude (Quadrática)';
    } else if (scaleType === 'fourth_root') {
        yData = fieldMagnitude.map(mag => Math.pow(mag / peak, 0.25));
        title = 'Magnitude (Raiz Quarta)';
    } else {
        yData = fieldMagnitude.map(mag => mag / peak);
        title = 'Magnitude (Linear)';
    }

    const trace = { x: theta, y: yData, mode: 'lines', name: `Phi=${phiValue}°` };
    const layout = {
        title: `Corte 2D (Phi=${phiValue}°)`,
        xaxis: { title: 'Theta (°)' },
        yaxis: { title: title },
        margin: { t: 40, b: 40, l: 60, r: 20 }
    };

    Plotly.react(plotDivId, [trace], layout, { responsive: true });
}

// 3D Plot (Plotly)
function plotBeamPattern3D(uniquePhis, uniqueThetas, mags_dB, mags_linear, scaleType) {
    toggleViews('3d');

    const DEG_TO_RAD = Math.PI / 180;
    const x = [], y = [];

    for (let i = 0; i < uniqueThetas.length; i++) {
        const r = uniqueThetas[i] * DEG_TO_RAD;
        const xr = [], yr = [];
        for (let j = 0; j < uniquePhis.length; j++) {
            const p = uniquePhis[j] * DEG_TO_RAD;
            xr.push(r * Math.cos(p));
            yr.push(r * Math.sin(p));
        }
        x.push(xr); y.push(yr);
    }

    let zData, zTitle;
    if (scaleType === 'dB') {
        zData = mags_dB.map(row => row.map(v => (isNaN(v) || !isFinite(v)) ? -100 : v));
        zTitle = 'dB';
    } else if (scaleType === 'sqrt') {
        zData = mags_linear.map(row => row.map(v => {
            const val = Math.sqrt(v);
            return (isNaN(val) || !isFinite(val)) ? 0 : val;
        }));
        zTitle = 'Sqrt';
    } else if (scaleType === 'quadratic') {
        zData = mags_linear.map(row => row.map(v => {
            const val = Math.pow(v, 2);
            return (isNaN(val) || !isFinite(val)) ? 0 : val;
        }));
        zTitle = 'Quadrática';
    } else if (scaleType === 'fourth_root') {
        zData = mags_linear.map(row => row.map(v => {
            const val = Math.pow(v, 0.25);
            return (isNaN(val) || !isFinite(val)) ? 0 : val;
        }));
        zTitle = 'Raiz Quarta';
    } else {
        zData = mags_linear.map(row => row.map(v => (isNaN(v) || !isFinite(v)) ? 0 : v));
        zTitle = 'Linear';
    }

    const data = [{
        type: 'surface', x: x, y: y, z: zData,
        surfacecolor: zData, colorscale: 'Viridis'
    }];

    const layout = {
        title: `Padrão 3D (${scaleType})`,
        scene: {
            aspectratio: { x: 1, y: 1, z: 0.6 },
            xaxis: { title: 'X' }, yaxis: { title: 'Y' }, zaxis: { title: zTitle }
        },
        margin: { t: 40, b: 20, l: 20, r: 20 }
    };

    Plotly.newPlot(plotDivId, data, layout, { responsive: true });
}

// Heatmap Native (Canvas)
function triggerHeatmapGeneration(uniquePhis, uniqueThetas, mags_linear, scaleType) {
    if (!heatmapWorker) {
        console.error("Heatmap Worker not init");
        return;
    }

    toggleViews('heatmap');
    drawColorbar(scaleType); // Update legend

    if (statusDiv) statusDiv.textContent = `Gerando Heatmap...`;

    currentHeatmapRenderId++;
    heatmapWorker.postMessage({
        width: HEATMAP_RESOLUTION,
        height: HEATMAP_RESOLUTION,
        scaleType: scaleType,
        magnitudesLinear: mags_linear,
        uniqueThetas: uniqueThetas,
        uniquePhis: uniquePhis,
        renderId: currentHeatmapRenderId
    });
}

function drawHeatmapToCanvas(pixels, width, height) {
    if (!heatmapCanvas) return;

    heatmapCanvas.width = width;
    heatmapCanvas.height = height;

    // Enable smooth upscaling when canvas is displayed larger than internal resolution
    heatmapCanvas.style.imageRendering = 'auto';

    const ctx = heatmapCanvas.getContext('2d');
    const imageData = new ImageData(pixels, width, height);
    ctx.putImageData(imageData, 0, 0);

    // Draw professional circular axis overlay
    drawCircularAxisOverlay(ctx, width, height);

    if (statusDiv) statusDiv.textContent = `Heatmap renderizado (${width}x${height}).`;
}

/**
 * Draws a clean circular axis overlay for scientific publications.
 * Features:
 * - Outer ring at θ = 90° (white border)
 * - Radial tick marks pointing inward with φ angle labels (every 30°)
 * - θ scale labels along one radial direction
 * - NO internal grids to avoid obstructing the beam pattern
 */
function drawCircularAxisOverlay(ctx, width, height) {
    const centerX = width / 2;
    const centerY = height / 2;
    const maxRadius = Math.min(width, height) / 2;

    // Style settings for publication quality
    const axisColor = 'rgba(255, 255, 255, 1)';
    const labelColor = 'rgba(255, 255, 255, 1)';
    const shadowColor = 'rgba(0, 0, 0, 0.8)';

    // Font sizes scaled to canvas resolution
    const baseFontSize = Math.max(16, Math.round(maxRadius / 40));
    const tickLength = Math.max(12, Math.round(maxRadius / 80));
    const labelOffset = Math.max(20, Math.round(maxRadius / 30));

    ctx.save();

    // === Draw outer ring (θ = 90°) ===
    ctx.strokeStyle = axisColor;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(centerX, centerY, maxRadius - 1, 0, 2 * Math.PI);
    ctx.stroke();

    // === Draw φ tick marks and labels (every 30°) ===
    const phiAngles = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330];

    phiAngles.forEach(phi => {
        // Convert to canvas angle (0° is right, counter-clockwise positive)
        // In our heatmap, phi=0° is at the right, increasing counter-clockwise
        const radians = (-phi + 90) * Math.PI / 180;

        // Tick mark from outer edge pointing inward
        const outerX = centerX + Math.cos(radians) * maxRadius;
        const outerY = centerY + Math.sin(radians) * maxRadius;
        const innerX = centerX + Math.cos(radians) * (maxRadius - tickLength);
        const innerY = centerY + Math.sin(radians) * (maxRadius - tickLength);

        ctx.strokeStyle = axisColor;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(outerX, outerY);
        ctx.lineTo(innerX, innerY);
        ctx.stroke();

        // φ label outside the ring
        const labelRadius = maxRadius + labelOffset;
        const labelX = centerX + Math.cos(radians) * labelRadius;
        const labelY = centerY + Math.sin(radians) * labelRadius;

        // Determine text alignment based on position
        let textAlign = 'center';
        let textBaseline = 'middle';

        if (phi === 0) { textAlign = 'center'; textBaseline = 'bottom'; }
        else if (phi === 180) { textAlign = 'center'; textBaseline = 'top'; }
        else if (phi > 0 && phi < 180) { textAlign = 'left'; }
        else if (phi > 180 && phi < 360) { textAlign = 'right'; }

        if (phi === 90) { textAlign = 'left'; textBaseline = 'middle'; }
        if (phi === 270) { textAlign = 'right'; textBaseline = 'middle'; }

        ctx.font = `bold ${baseFontSize}px "Segoe UI", Arial, sans-serif`;
        ctx.textAlign = textAlign;
        ctx.textBaseline = textBaseline;
        ctx.shadowColor = shadowColor;
        ctx.shadowBlur = 4;
        ctx.shadowOffsetX = 1;
        ctx.shadowOffsetY = 1;
        ctx.fillStyle = labelColor;
        ctx.fillText(`${phi}°`, labelX, labelY);
        ctx.shadowBlur = 0;
    });

    // === Draw θ scale along the φ = 0° direction (top) ===
    const thetaAngles = [0, 10, 20, 30, 40, 50, 60, 70, 80];
    const maxThetaDisplayed = 90;
    const phiForThetaLabels = 0; // Display θ labels along φ = 0° (top)
    const radiansForTheta = (-phiForThetaLabels + 90) * Math.PI / 180;

    thetaAngles.forEach(theta => {
        const radius = (theta / maxThetaDisplayed) * maxRadius;
        const labelX = centerX + Math.cos(radiansForTheta) * radius;
        const labelY = centerY + Math.sin(radiansForTheta) * radius;

        // Small tick mark
        const tickRadians = radiansForTheta + Math.PI / 2; // Perpendicular
        const tickHalfLen = 4;
        ctx.strokeStyle = axisColor;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(labelX - Math.cos(tickRadians) * tickHalfLen, labelY - Math.sin(tickRadians) * tickHalfLen);
        ctx.lineTo(labelX + Math.cos(tickRadians) * tickHalfLen, labelY + Math.sin(tickRadians) * tickHalfLen);
        ctx.stroke();

        // θ label (offset to the side)
        const thetaLabelOffset = baseFontSize * 0.8;
        const thetaLabelX = labelX + thetaLabelOffset;
        const thetaLabelY = labelY;

        ctx.font = `${Math.round(baseFontSize * 0.85)}px "Segoe UI", Arial, sans-serif`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = shadowColor;
        ctx.shadowBlur = 3;
        ctx.fillStyle = labelColor;
        ctx.fillText(`${theta}`, thetaLabelX, thetaLabelY);
        ctx.shadowBlur = 0;
    });

    ctx.restore();
}

// === Colorbar / Legend ===
// Viridis colormap reference for the legend (simplified)
// Ideally we share the exact same LUT, but drawing a gradient is easier for legend.
// Steps from heatmap_worker.js:
// [68, 1, 84], [72, 35, 116], [64, 67, 135], [52, 94, 141],
// [41, 120, 142], [32, 144, 140], [34, 167, 132], [68, 190, 112],
// [121, 209, 81], [189, 222, 38], [253, 231, 36]
function drawColorbar(scaleType) {
    if (!heatmapLegendCanvas || !heatmapContainer) return;

    // Sync internal resolution with display size - increased width for title
    heatmapLegendCanvas.width = heatmapLegendCanvas.clientWidth || 150;
    heatmapLegendCanvas.height = heatmapContainer.clientHeight || 300;

    const ctx = heatmapLegendCanvas.getContext('2d');
    const width = heatmapLegendCanvas.width;
    const height = heatmapLegendCanvas.height;

    // Clear
    ctx.clearRect(0, 0, width, height);

    // === Draw Title (rotated vertically) ===
    let title = '';
    let minVal = 0, maxVal = 1;
    let unit = '';

    switch (scaleType) {
        case 'dB':
            title = 'Normalized |E| (dB)';
            minVal = -60; maxVal = 0; unit = '';
            break;
        case 'linear':
            title = 'Normalized |E|';
            minVal = 0; maxVal = 1; unit = '';
            break;
        case 'sqrt':
            title = 'Normalized |E|^(1/2)';
            minVal = 0; maxVal = 1; unit = '';
            break;
        case 'quadratic':
            title = 'Normalized |E|²';
            minVal = 0; maxVal = 1; unit = '';
            break;
        case 'fourth_root':
            title = 'Normalized |E|^(1/4)';
            minVal = 0; maxVal = 1; unit = '';
            break;
        default:
            title = 'Normalized |E|';
            minVal = 0; maxVal = 1;
    }

    // Create Gradient with more stops for smoother appearance
    const barTop = 40; // Leave space for top margin
    const barBottom = height - 20;
    const barHeight = barBottom - barTop;
    const grad = ctx.createLinearGradient(0, barBottom, 0, barTop); // Bottom to Top
    grad.addColorStop(0.000, 'rgb(68, 1, 84)');
    grad.addColorStop(0.063, 'rgb(71, 22, 106)');
    grad.addColorStop(0.125, 'rgb(70, 47, 125)');
    grad.addColorStop(0.188, 'rgb(65, 67, 132)');
    grad.addColorStop(0.250, 'rgb(55, 90, 135)');
    grad.addColorStop(0.313, 'rgb(45, 112, 133)');
    grad.addColorStop(0.375, 'rgb(38, 132, 127)');
    grad.addColorStop(0.438, 'rgb(37, 151, 115)');
    grad.addColorStop(0.500, 'rgb(49, 169, 97)');
    grad.addColorStop(0.563, 'rgb(68, 181, 79)');
    grad.addColorStop(0.625, 'rgb(94, 192, 57)');
    grad.addColorStop(0.688, 'rgb(126, 200, 35)');
    grad.addColorStop(0.750, 'rgb(162, 206, 19)');
    grad.addColorStop(0.813, 'rgb(190, 208, 17)');
    grad.addColorStop(0.875, 'rgb(217, 209, 31)');
    grad.addColorStop(0.938, 'rgb(233, 209, 51)');
    grad.addColorStop(1.000, 'rgb(253, 231, 36)');

    // Draw Bar with border
    const barWidth = 25;
    const barX = 15;
    ctx.fillStyle = grad;
    ctx.fillRect(barX, barTop, barWidth, barHeight);

    // Bar border
    ctx.strokeStyle = '#666';
    ctx.lineWidth = 1;
    ctx.strokeRect(barX, barTop, barWidth, barHeight);

    // Draw tick marks and labels
    ctx.fillStyle = '#333';
    ctx.font = 'bold 13px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    const numTicks = 5;
    for (let i = 0; i <= numTicks; i++) {
        const t = i / numTicks;
        const y = barBottom - t * barHeight;
        let val = minVal + t * (maxVal - minVal);
        let label;

        if (scaleType === 'dB') {
            label = Math.round(val).toString();
        } else {
            label = val.toFixed(2);
        }

        // Tick mark
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(barX + barWidth, y);
        ctx.lineTo(barX + barWidth + 5, y);
        ctx.stroke();

        // Label
        ctx.fillText(label + unit, barX + barWidth + 8, y);
    }

    // === Draw rotated title on left side of the bar ===
    ctx.save();
    ctx.translate(8, barTop + barHeight / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.font = 'bold 14px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#222';
    ctx.fillText(title, 0, 0);
    ctx.restore();
}


// === Interaction: Tooltip ===
function setupHeatmapInteraction() {
    if (!heatmapCanvas || !heatmapContainer) return;

    // Create Legend Canvas if not exists
    if (!document.getElementById('heatmap-legend-canvas')) {
        heatmapLegendCanvas = document.createElement('canvas');
        heatmapLegendCanvas.id = 'heatmap-legend-canvas';
        // Remove fixed height, use 100% of container via CSS, then sync internal size
        heatmapLegendCanvas.style.position = 'absolute';
        heatmapLegendCanvas.style.right = '0';
        heatmapLegendCanvas.style.top = '0';
        heatmapLegendCanvas.style.bottom = '0';
        heatmapLegendCanvas.style.height = '100%';
        heatmapLegendCanvas.style.width = '100px';
        heatmapLegendCanvas.style.pointerEvents = 'none';
        heatmapLegendCanvas.style.zIndex = '15';
        heatmapContainer.appendChild(heatmapLegendCanvas);

        // Add padding to container to shift plot left
        heatmapContainer.style.boxSizing = 'border-box';
        heatmapContainer.style.paddingRight = '110px';
    } else {
        heatmapLegendCanvas = document.getElementById('heatmap-legend-canvas');
    }

    heatmapCanvas.addEventListener('mousemove', (e) => {
        if (!cachedCalculationResult3D) return;

        const rect = heatmapCanvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const scaleX = heatmapCanvas.width / rect.width;
        const scaleY = heatmapCanvas.height / rect.height;

        const actualX = x * scaleX;
        const actualY = y * scaleY;

        const cx = heatmapCanvas.width / 2;
        const cy = heatmapCanvas.height / 2;
        const dx = actualX - cx;
        const dy = actualY - cy;

        const rPx = Math.sqrt(dx * dx + dy * dy);
        const maxRadiusPx = Math.min(cx, cy) - 2;

        if (rPx > maxRadiusPx) {
            heatmapTooltip.style.display = 'none';
            return;
        }

        const { uniqueThetas_deg } = cachedCalculationResult3D;
        const maxTheta = uniqueThetas_deg[uniqueThetas_deg.length - 1];

        const theta = (rPx / maxRadiusPx) * maxTheta;
        let angleRad = Math.atan2(-dy, dx);
        let angleDeg = angleRad * 180 / Math.PI;
        if (angleDeg < 0) angleDeg += 360;

        heatmapTooltip.style.display = 'block';
        heatmapTooltip.style.left = (x + 10) + 'px';
        heatmapTooltip.style.top = (y + 10) + 'px';

        heatmapTooltip.textContent = `Θ: ${theta.toFixed(1)}°, Φ: ${angleDeg.toFixed(1)}°`;
    });

    heatmapCanvas.addEventListener('mouseleave', () => {
        heatmapTooltip.style.display = 'none';
    });
}


// === Orchestration ===

function setupWorkers() {
    if (!window.Worker) {
        console.warn("Workers not supported");
        return;
    }

    try {
        // 2D Worker
        beamCalculationWorker = new Worker('js/beam_worker.js');
        beamCalculationWorker.onmessage = (e) => {
            if (e.data.id !== currentCalculationId) return;
            if (e.data.type === 'result') {
                const { thetaValues, resultingMagnitude } = e.data.data;
                plotBeamPattern2D(thetaValues, resultingMagnitude, storedWorkerPlotParams.phi, storedWorkerPlotParams.scale);
                isProcessingPlot = false;
                if (pendingRequestFn) {
                    const fn = pendingRequestFn;
                    pendingRequestFn = null;
                    fn();
                }
            } else if (e.data.type === 'error') {
                isProcessingPlot = false;
                if (pendingRequestFn) {
                    const fn = pendingRequestFn;
                    pendingRequestFn = null;
                    fn();
                }
            }
        };

        // 3D Worker
        beamCalculationWorker3D = new Worker('js/beam_worker_3d.js');
        beamCalculationWorker3D.onmessage = (e) => {
            if (e.data.id !== current3DCalculationId) return;
            if (e.data.type === 'progress') {
                if (statusDiv) statusDiv.textContent = e.data.data;
            } else if (e.data.type === 'result3D') {
                cachedCalculationResult3D = e.data.data;
                refreshVisualization();
                isProcessingPlot = false;
                if (pendingRequestFn) {
                    const fn = pendingRequestFn;
                    pendingRequestFn = null;
                    fn();
                }
            } else if (e.data.type === 'error') {
                if (statusDiv) statusDiv.textContent = e.data.error;
                isProcessingPlot = false;
                if (pendingRequestFn) {
                    const fn = pendingRequestFn;
                    pendingRequestFn = null;
                    fn();
                }
            }
        };

        // Heatmap Worker
        heatmapWorker = new Worker('js/heatmap_worker.js');
        heatmapWorker.onmessage = (e) => {
            // Check if this result matches the latest request
            if (e.data.renderId && e.data.renderId !== currentHeatmapRenderId) {
                console.warn("Ignorando resultado de heatmap obsoleto (RenderID mismatch).");
                return;
            }

            if (e.data.pixels) {
                drawHeatmapToCanvas(e.data.pixels, e.data.width, e.data.height);
            } else if (e.data.error) {
                console.error(e.data.error);
            }
        };

        console.log("Workers Initialized");
    } catch (e) {
        console.error("Worker Init Failed", e);
    }
}

function refreshVisualization() {
    if (!cachedCalculationResult3D) return;

    const { uniquePhis_deg, uniqueThetas_deg, magnitudes_grid_dB, magnitudes_grid_linear_normalized } = cachedCalculationResult3D;

    // Check Active Mode
    if (visualizeHeatmapBtn.classList.contains('primary')) {
        // Heatmap Mode
        triggerHeatmapGeneration(
            uniquePhis_deg,
            uniqueThetas_deg,
            magnitudes_grid_linear_normalized,
            storedFullDataScaleType
        );
    } else if (visualize3DBtn.classList.contains('primary')) {
        // 3D Mode
        plotBeamPattern3D(uniquePhis_deg, uniqueThetas_deg, magnitudes_grid_dB, magnitudes_grid_linear_normalized, storedFullDataScaleType);
    } else {
        // Default Fallback: Force Heatmap as per user request (reverted from 3D)
        triggerHeatmapGeneration(
            uniquePhis_deg,
            uniqueThetas_deg,
            magnitudes_grid_linear_normalized,
            storedFullDataScaleType
        );
    }
}

async function processFullDataPlotRequest() {
    if (isProcessingPlot) {
        pendingRequestFn = processFullDataPlotRequest;
        return;
    }

    const antennaCoords = window.antennaGenerator ? window.antennaGenerator.getAllAntennas() : [];
    if (antennaCoords.length === 0) return;

    // Scale
    storedFullDataScaleType = scaleSelect.value;

    // Cache Check
    const layoutHash = getLayoutHash(antennaCoords);
    if (cachedCalculationResult3D && cachedCalculationParams3D?.layoutHash === layoutHash) {
        console.log("Usando cache 3D.");
        refreshVisualization();
        return;
    }

    isProcessingPlot = true;
    current3DCalculationId++;

    // Load Data
    try {
        const fullData = await ensureFullEFieldData3DLoaded();
        beamCalculationWorker3D.postMessage({
            id: current3DCalculationId,
            antennaCoords: antennaCoords,
            elementFieldData3D: fullData,
            K_CONST: K
        });
        cachedCalculationParams3D = { layoutHash };
    } catch (e) {
        console.error(e);
        isProcessingPlot = false;
    }
}

// 2D Trigger
function schedulePlotUpdate() {
    if (isProcessingPlot) {
        pendingRequestFn = schedulePlotUpdate;
        return;
    }

    // Similar to previous implementation, tailored for 2D
    const currentPhi = parseFloat(phiInput.value);
    const scale = scaleSelect.value;
    const antennaCoords = window.antennaGenerator ? window.antennaGenerator.getAllAntennas() : [];

    if (antennaCoords.length === 0) return;

    isProcessingPlot = true;
    currentCalculationId++;
    storedWorkerPlotParams = { phi: currentPhi, scale: scale };

    fetchAndParseEFieldDataForSelectedPhi(currentPhi).then(data => {
        beamCalculationWorker.postMessage({
            id: currentCalculationId,
            antennaCoords: antennaCoords,
            filteredElementData: data,
            K_CONST: K,
            selectedPhiValue: currentPhi
        });
    }).catch(e => isProcessingPlot = false);
}


function initBeamPatternControls() {
    phiSlider = document.getElementById('beam-phi-slider');
    phiInput = document.getElementById('beam-phi-input');
    scaleSelect = document.getElementById('beam-scale-select');

    visualize3DBtn = document.getElementById('visualize-3d-btn');
    visualize2DBtn = document.getElementById('visualize-2d-btn');
    visualizeHeatmapBtn = document.getElementById('visualize-heatmap-btn');

    heatmapContainer = document.getElementById('heatmap-container');
    heatmapCanvas = document.getElementById('beam-heatmap-canvas');
    heatmapTooltip = document.getElementById('heatmap-tooltip');
    statusDiv = document.getElementById('beam-status');

    // Ensure workers run even if some UI is glitchy, but need canvas
    setupWorkers();

    if (!heatmapCanvas) {
        console.error("Heatmap Canvas missing");
        if (statusDiv) statusDiv.textContent = "Erro: Canvas não encontrado.";
        return;
    }

    setupHeatmapInteraction();

    // Event Listeners
    const setMode = (mode) => {
        visualizeHeatmapBtn.classList.toggle('primary', mode === 'heatmap');
        visualizeHeatmapBtn.classList.toggle('secondary', mode !== 'heatmap');

        visualize3DBtn.classList.toggle('primary', mode === '3d');
        visualize3DBtn.classList.toggle('secondary', mode !== '3d');

        visualize2DBtn.classList.toggle('primary', mode === '2d');
        visualize2DBtn.classList.toggle('secondary', mode !== '2d');

        if (mode === '2d') {
            schedulePlotUpdate();
        } else {
            // Both 3D and Heatmap use the 3D data pipeline
            processFullDataPlotRequest();
            if (cachedCalculationResult3D) {
                // Force switch if data is already there (refreshVisualization checks active buttons)
                refreshVisualization();
            }
        }
    };

    visualizeHeatmapBtn.onclick = () => setMode('heatmap');
    visualize3DBtn.onclick = () => setMode('3d');
    visualize2DBtn.onclick = () => setMode('2d');

    scaleSelect.onchange = () => {
        if (visualize2DBtn.classList.contains('primary')) schedulePlotUpdate();
        else processFullDataPlotRequest();
    };

    phiSlider.oninput = () => {
        phiInput.value = phiSlider.value;
        if (visualize2DBtn.classList.contains('primary')) schedulePlotUpdate();
    };
    phiInput.oninput = () => {
        phiSlider.value = phiInput.value;
        if (visualize2DBtn.classList.contains('primary')) schedulePlotUpdate();
    };

    window.addEventListener('layoutGenerated', () => {
        clearTimeout(layoutUpdateTimeout);
        layoutUpdateTimeout = setTimeout(() => {
            // Reverted auto-switch to 3D. Now just triggers update.
            if (visualize2DBtn.classList.contains('primary')) schedulePlotUpdate();
            else processFullDataPlotRequest();
        }, 200);
    });

    console.log("Controles do padrão de feixe inicializados.");
    // Initial State - Heatmap (reverted)
    setMode('heatmap');
}

document.addEventListener('DOMContentLoaded', initBeamPatternControls);