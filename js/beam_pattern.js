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
let beamCalculationWorker = null;  // 2D Worker
let beamCalculationWorker3D = null;// 3D Data Worker
let heatmapWorker = null;          // New Native Heatmap Worker

let currentCalculationId = 0;
let current3DCalculationId = 0;

let storedWorkerPlotParams = {};
let storedFullDataScaleType = 'linear'; // default
let storedHeatmapResolution = 1024; // default

// Cache para Resultados de Cálculos 3D
let cachedCalculationResult3D = null;
let cachedCalculationParams3D = null;

let latestPlotRequestParams = null;
let currentlyProcessingRequestTimestamp = null;
let processRequestTimeoutId = null;

// === DOM Element References ===
let phiSlider, phiInput, scaleSelect, resolutionSelect;
let visualize3DBtn, visualize2DBtn, visualizeHeatmapBtn;
let plotDivId = 'beam-pattern-plot'; // Plotly Div
let heatmapContainer, heatmapCanvas, heatmapTooltip;
let statusDiv = null;

// === Helper Functions ===
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function getLayoutHash(antennaCoords) {
    if (!antennaCoords) return "";
    return JSON.stringify(antennaCoords.map(a => [Math.round(a.x*100), Math.round(a.y*100)]));
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
            statusDiv.textContent = `${originalStatusText.split(' (Tentando')[0]} (Tentando ${gatewayHostname}, ${i+1}/${IPFS_GATEWAYS.length})...`;
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
                if (!isNaN(theta)) {
                    data.push({ theta, rETheta: { re: reTheta, im: imTheta }, rEPhi: { re: rePhi, im: imPhi } });
                }
            } catch (e) {}
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
        Object.defineProperty(data, 'uniquePhis', { value: Array.from(uniquePhiValues).sort((a,b)=>a-b), writable: false });
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

// 2D Plot (Plotly)
function plotBeamPattern2D(theta, fieldMagnitude, phiValue, scaleType) {
    const plotDiv = document.getElementById(plotDivId);
    if (!plotDiv) return;

    // Hide Heatmap UI, Show Plotly
    if(heatmapContainer) heatmapContainer.style.display = 'none';
    plotDiv.style.display = 'block';

    const peak = Math.max(1e-10, ...fieldMagnitude);
    let yData, title;

    if (scaleType === 'dB') {
        yData = fieldMagnitude.map(mag => Math.max(-100, 20 * Math.log10(Math.max(mag / peak, 1e-10))));
        title = 'Magnitude (dB)';
    } else if (scaleType === 'sqrt') {
        yData = fieldMagnitude.map(mag => Math.sqrt(mag / peak));
        title = 'Magnitude (Sqrt)';
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
    const plotDiv = document.getElementById(plotDivId);
    if (!plotDiv) return;

    // Hide Heatmap UI, Show Plotly
    if(heatmapContainer) heatmapContainer.style.display = 'none';
    plotDiv.style.display = 'block';

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
        zData = mags_dB; zTitle = 'dB';
    } else if (scaleType === 'sqrt') {
        zData = mags_linear.map(row => row.map(v => Math.sqrt(v))); zTitle = 'Sqrt';
    } else {
        zData = mags_linear; zTitle = 'Linear';
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
function triggerHeatmapGeneration(uniquePhis, uniqueThetas, mags_linear, scaleType, resolution) {
    if (!heatmapWorker) {
        console.error("Heatmap Worker not init");
        return;
    }

    // Hide Plotly, Show Heatmap
    const plotDiv = document.getElementById(plotDivId);
    if(plotDiv) plotDiv.style.display = 'none';
    if(heatmapContainer) heatmapContainer.style.display = 'flex';

    if (statusDiv) statusDiv.textContent = `Gerando Heatmap (${resolution}px)...`;

    heatmapWorker.postMessage({
        width: resolution,
        height: resolution,
        scaleType: scaleType,
        magnitudesLinear: mags_linear,
        uniqueThetas: uniqueThetas,
        uniquePhis: uniquePhis
    });
}

function drawHeatmapToCanvas(pixels, width, height) {
    if (!heatmapCanvas) return;

    heatmapCanvas.width = width;
    heatmapCanvas.height = height;

    const ctx = heatmapCanvas.getContext('2d');
    const imageData = new ImageData(pixels, width, height);
    ctx.putImageData(imageData, 0, 0);

    if (statusDiv) statusDiv.textContent = `Heatmap renderizado (${width}x${height}).`;
}

// === Interaction: Tooltip ===
function setupHeatmapInteraction() {
    if (!heatmapCanvas || !heatmapContainer) return;

    heatmapCanvas.addEventListener('mousemove', (e) => {
        // Only if we have valid data
        if (!cachedCalculationResult3D) return;

        const rect = heatmapCanvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        // Scale coords to canvas actual size
        const scaleX = heatmapCanvas.width / rect.width;
        const scaleY = heatmapCanvas.height / rect.height;

        const actualX = x * scaleX;
        const actualY = y * scaleY;

        const cx = heatmapCanvas.width / 2;
        const cy = heatmapCanvas.height / 2;
        const dx = actualX - cx;
        const dy = actualY - cy;

        const rPx = Math.sqrt(dx*dx + dy*dy);
        const maxRadiusPx = Math.min(cx, cy) - 2;

        if (rPx > maxRadiusPx) {
            heatmapTooltip.style.display = 'none';
            return;
        }

        const { uniqueThetas_deg } = cachedCalculationResult3D;
        const maxTheta = uniqueThetas_deg[uniqueThetas_deg.length - 1];
        
        const theta = (rPx / maxRadiusPx) * maxTheta;
        let angleRad = Math.atan2(-dy, dx); // Matches worker logic
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
            } else if (e.data.type === 'error') {
                isProcessingPlot = false;
            }
        };

        // 3D Worker
        beamCalculationWorker3D = new Worker('js/beam_worker_3d.js');
        beamCalculationWorker3D.onmessage = (e) => {
            if (e.data.id !== current3DCalculationId) return;
            if (e.data.type === 'progress') {
                if(statusDiv) statusDiv.textContent = e.data.data;
            } else if (e.data.type === 'result3D') {
                cachedCalculationResult3D = e.data.data;
                refreshVisualization();
                isProcessingPlot = false;
            } else if (e.data.type === 'error') {
                 if(statusDiv) statusDiv.textContent = e.data.error;
                 isProcessingPlot = false;
            }
        };

        // Heatmap Worker
        heatmapWorker = new Worker('js/heatmap_worker.js');
        heatmapWorker.onmessage = (e) => {
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
            storedFullDataScaleType,
            storedHeatmapResolution
        );
    } else if (visualize3DBtn.classList.contains('primary')) {
        // 3D Mode
        plotBeamPattern3D(uniquePhis_deg, uniqueThetas_deg, magnitudes_grid_dB, magnitudes_grid_linear_normalized, storedFullDataScaleType);
    }
    // 2D is handled separately via `schedulePlotUpdate` usually, but if we switched back...
    // 2D requires a specific Phi cut, which we might not have fresh in cache if we only calculated 3D full.
    // So 2D logic remains separate for single-file fetching optimization.
}

async function processFullDataPlotRequest() {
    if (isProcessingPlot) return;

    const antennaCoords = window.antennaGenerator ? window.antennaGenerator.getAllAntennas() : [];
    if (antennaCoords.length === 0) return;

    // Scale
    storedFullDataScaleType = scaleSelect.value;
    storedHeatmapResolution = parseInt(resolutionSelect.value);

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
    resolutionSelect = document.getElementById('heatmap-resolution-select');

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
        if(statusDiv) statusDiv.textContent = "Erro: Canvas não encontrado.";
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
            if(heatmapContainer) heatmapContainer.style.display = 'none';
            document.getElementById(plotDivId).style.display = 'block';
            schedulePlotUpdate();
        } else {
            processFullDataPlotRequest();
        }
    };

    visualizeHeatmapBtn.onclick = () => setMode('heatmap');
    visualize3DBtn.onclick = () => setMode('3d');
    visualize2DBtn.onclick = () => setMode('2d');

    scaleSelect.onchange = () => {
        if (visualize2DBtn.classList.contains('primary')) schedulePlotUpdate();
        else processFullDataPlotRequest(); // Will use cache and just refresh viz
    };

    resolutionSelect.onchange = () => {
        if (visualizeHeatmapBtn.classList.contains('primary')) refreshVisualization();
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
        if (visualize2DBtn.classList.contains('primary')) schedulePlotUpdate();
        else processFullDataPlotRequest();
    });

    console.log("Controles do padrão de feixe inicializados.");
    // Initial State
    setMode('heatmap');
}

document.addEventListener('DOMContentLoaded', initBeamPatternControls);