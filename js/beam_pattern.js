// js/beam_pattern.js

/**
 * beam_pattern.js
 *
 * @fileoverview Módulo para simulação e visualização do padrão de feixe de antenas.
 *
 * @description Modificado para usar:
 * 1. Arquivos CSV individuais para plot 2D.
 * 2. Arquivo CSV completo para 3D e Heatmap.
 * 3. Heatmap nativo 2D via Canvas (heatmap_worker.js) para alta performance e qualidade.
 * 4. Cache inteligente de dados e resultados.
 *
 * @requires BingoConstants
 * @requires Plotly
 * @author Geovanni Fernandes Garcia
 * @version 1.0.2
 */

'use strict';

// === Constantes - usar BingoConstants quando disponível ===
const FREQUENCY = (typeof BingoConstants !== 'undefined') ? BingoConstants.FREQUENCY_HZ : 1e9;
const C_LIGHT = (typeof BingoConstants !== 'undefined') ? BingoConstants.SPEED_OF_LIGHT : 299792458;
const LAMBDA = (typeof BingoConstants !== 'undefined') ? BingoConstants.WAVELENGTH : (C_LIGHT / FREQUENCY);
const K = (typeof BingoConstants !== 'undefined') ? BingoConstants.WAVE_NUMBER_K : ((2 * Math.PI) / LAMBDA);

// Lista de Gateways IPFS Públicos - usar BingoConstants quando disponível
const IPFS_GATEWAYS = (typeof BingoConstants !== 'undefined') ? BingoConstants.IPFS_GATEWAYS : [
    "https://dweb.link/ipfs/",
    "https://ipfs.io/ipfs/",
    "https://gateway.pinata.cloud/ipfs/",
    "https://cloudflare-ipfs.com/ipfs/",
    "https://gateway.ipfs.io/ipfs/"
];

const E_FIELD_BASE_CID_PHI_SPECIFIC = (typeof BingoConstants !== 'undefined') ? BingoConstants.E_FIELD_PHI_CID : 'bafybeibod4uopaxesmqti3qmonjcbttgxquuby6y6v2uo6sd7ah475bsai';
const E_FIELD_FULL_DATA_CID = (typeof BingoConstants !== 'undefined') ? BingoConstants.E_FIELD_FULL_CID : 'bafybeicunhz5lwv3nryglwlppu6o6keo7ii3ilntcqtq536aket7qflc34';

const MAX_PLOT_POINTS_BEAM = (typeof BingoConstants !== 'undefined') ? BingoConstants.MAX_PLOT_POINTS : 2000;
const PLOT_REQUEST_DEBOUNCE_DELAY = (typeof BingoConstants !== 'undefined') ? BingoConstants.PLOT_DEBOUNCE_DELAY_MS : 300;

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

/**
 * Objeto para coletar métricas de performance
 * @type {Object}
 */
const PerformanceMetrics = {
    lastFetchTime: 0,
    lastProcessingTime: 0,
    lastRenderTime: 0,
    totalDataPoints: 0,

    /**
     * Inicia um timer e retorna uma função para finalizá-lo
     * @returns {Function} Função que retorna o tempo decorrido em ms
     */
    startTimer: function() {
        const start = performance.now();
        return () => Math.round(performance.now() - start);
    },

    /**
     * Formata tempo em formato legível
     * @param {number} ms - Tempo em milissegundos
     * @returns {string} Tempo formatado
     */
    formatTime: function(ms) {
        if (ms < 1000) return `${ms}ms`;
        return `${(ms / 1000).toFixed(2)}s`;
    },

    /**
     * Registra métricas no console para debugging
     */
    logMetrics: function() {
        console.log(`[Performance] Fetch: ${this.formatTime(this.lastFetchTime)}, Processing: ${this.formatTime(this.lastProcessingTime)}, Render: ${this.formatTime(this.lastRenderTime)}, Points: ${this.totalDataPoints}`);
    }
};

/**
 * Valida coordenadas de antenas
 * @param {Array} antennaCoords - Array de coordenadas [x, y]
 * @returns {Object} Objeto com isValid e mensagem de erro se houver
 */
function validateAntennaCoords(antennaCoords) {
    if (!antennaCoords) {
        return { isValid: false, error: 'Coordenadas de antenas não fornecidas' };
    }
    if (!Array.isArray(antennaCoords)) {
        return { isValid: false, error: 'Coordenadas devem ser um array' };
    }
    if (antennaCoords.length === 0) {
        return { isValid: false, error: 'Array de coordenadas está vazio' };
    }
    // Valida cada coordenada
    for (let i = 0; i < antennaCoords.length; i++) {
        const coord = antennaCoords[i];
        if (!Array.isArray(coord) || coord.length < 2) {
            return { isValid: false, error: `Coordenada ${i} inválida: deve ser [x, y]` };
        }
        if (typeof coord[0] !== 'number' || typeof coord[1] !== 'number') {
            return { isValid: false, error: `Coordenada ${i} contém valores não numéricos` };
        }
        if (isNaN(coord[0]) || isNaN(coord[1])) {
            return { isValid: false, error: `Coordenada ${i} contém NaN` };
        }
        if (!isFinite(coord[0]) || !isFinite(coord[1])) {
            return { isValid: false, error: `Coordenada ${i} contém valor infinito` };
        }
    }
    return { isValid: true };
}

/**
 * Valida dados de E-field
 * @param {Array} eFieldData - Array de dados do campo elétrico
 * @returns {Object} Objeto com isValid e mensagem de erro se houver
 */
function validateEFieldData(eFieldData) {
    if (!eFieldData || !Array.isArray(eFieldData)) {
        return { isValid: false, error: 'Dados de E-field não fornecidos ou inválidos' };
    }
    if (eFieldData.length === 0) {
        return { isValid: false, error: 'Array de E-field está vazio' };
    }
    // Verifica estrutura do primeiro elemento
    const sample = eFieldData[0];
    const requiredProps = ['theta_deg', 'phi_deg', 'rETheta', 'rEPhi'];
    for (const prop of requiredProps) {
        if (!(prop in sample)) {
            return { isValid: false, error: `Propriedade '${prop}' ausente nos dados` };
        }
    }
    return { isValid: true };
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function getLayoutHash(antennaCoords) {
    if (!antennaCoords) return "";
    return JSON.stringify(antennaCoords.map(a => [Math.round(a[0] * 100), Math.round(a[1] * 100)]));
}

/**
 * Tenta buscar dados localmente primeiro, depois IPFS como fallback.
 * @param {string} localPath - Caminho local relativo do arquivo
 * @param {string} ipfsCidPath - Caminho IPFS (CID/arquivo)
 * @param {object} options - Opções de fetch
 * @returns {Promise<Response>} Resposta do fetch
 * @throws {Error} Se ambos local e IPFS falharem
 */
async function fetchDataWithLocalFallback(localPath, ipfsCidPath, options = {}) {
    const fetchTimer = PerformanceMetrics.startTimer();
    const LOCAL_TIMEOUT = 3000;

    // Tentativa 1: Carregar do caminho local
    let timeoutId = null;
    try {
        if (statusDiv) statusDiv.textContent = `Carregando dados locais...`;
        const controller = new AbortController();
        timeoutId = setTimeout(() => controller.abort(), LOCAL_TIMEOUT);
        const fetchOptions = { ...options, signal: controller.signal };

        const response = await fetch(localPath, fetchOptions);
        clearTimeout(timeoutId);
        timeoutId = null;

        if (response.ok) {
            // Ler o texto uma única vez
            const text = await response.text();
            
            // Verificar se é um LFS pointer (formato: version https://git-lfs + oid sha256: + size)
            if (text.startsWith('version https://git-lfs') && text.includes('oid sha256:') && text.includes('size ')) {
                console.warn(`[Local] ${localPath} é um LFS pointer, tentando IPFS...`);
                throw new Error('LFS Pointer detectado');
            }

            PerformanceMetrics.lastFetchTime = fetchTimer();
            console.log(`[Local] Carregado: ${localPath} em ${PerformanceMetrics.formatTime(PerformanceMetrics.lastFetchTime)}`);
            
            // Retornar uma nova Response com o texto já lido
            return new Response(text, {
                status: 200,
                statusText: 'OK',
                headers: response.headers
            });
        }
    } catch (error) {
        console.log(`[Local] Fallback para IPFS: ${error.message}`);
    } finally {
        if (timeoutId) clearTimeout(timeoutId);
    }

    // Tentativa 2: Fallback para IPFS
    return fetchDataFromIPFS(ipfsCidPath, options);
}

async function fetchDataFromIPFS(cidWithPath, options = {}) {
    const fetchTimer = PerformanceMetrics.startTimer();
    let lastError = null;
    let originalStatusText = statusDiv ? statusDiv.textContent : "";
    let statusUpdatedForGateway = false;
    const GATEWAY_TIMEOUT = 8000; // Aumentado para conexões mais lentas
    const MAX_RETRIES = 2; // Número de tentativas por gateway

    for (let i = 0; i < IPFS_GATEWAYS.length; i++) {
        const gatewayBase = IPFS_GATEWAYS[i];
        const url = gatewayBase + cidWithPath;

        for (let retry = 0; retry < MAX_RETRIES; retry++) {
            if (statusDiv && originalStatusText.startsWith("Carregando dados")) {
                const gatewayHostname = new URL(gatewayBase).hostname;
                const retryText = retry > 0 ? ` (retry ${retry})` : '';
                statusDiv.textContent = `${originalStatusText.split(' (Tentando')[0]} (Tentando ${gatewayHostname}${retryText}, ${i + 1}/${IPFS_GATEWAYS.length})...`;
                statusUpdatedForGateway = true;
            }

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), GATEWAY_TIMEOUT);
            const fetchOptions = { ...options, signal: controller.signal };

            try {
                const response = await fetch(url, fetchOptions);
                clearTimeout(timeoutId);

                if (!response.ok) {
                    console.warn(`[Fetch] Falha em ${url}: HTTP ${response.status}`);
                    if (response.status >= 500) {
                        // Erro do servidor, tentar novamente
                        await delay(500 * (retry + 1));
                        continue;
                    }
                    break; // Erro do cliente, próximo gateway
                }

                PerformanceMetrics.lastFetchTime = fetchTimer();
                if (statusUpdatedForGateway && statusDiv) {
                    statusDiv.textContent = `${originalStatusText.split(' (Tentando')[0]} (Conectado em ${PerformanceMetrics.formatTime(PerformanceMetrics.lastFetchTime)})`;
                }
                console.log(`[Fetch] Sucesso: ${url} em ${PerformanceMetrics.formatTime(PerformanceMetrics.lastFetchTime)}`);
                return response;
            } catch (error) {
                clearTimeout(timeoutId);
                const errorType = error.name === 'AbortError' ? 'Timeout' : error.message;
                console.warn(`[Fetch] Erro em ${url}: ${errorType}`);
                lastError = error;

                if (retry < MAX_RETRIES - 1) {
                    await delay(300 * (retry + 1));
                }
            }
        }
    }
    throw lastError || new Error("Falha ao buscar de todos os gateways IPFS.");
}

// === Data Fetching (2D) ===
async function _fetchAndParseSinglePhiWithRetry(phiValue) {
    const parseTimer = PerformanceMetrics.startTimer();
    const roundedPhi = Math.round(parseFloat(phiValue));

    // Validação do valor de Phi (0-90° pois os arquivos de dados cobrem apenas o primeiro quadrante)
    // Os dados são simétricos, então apenas Phi 0-90° são necessários
    if (isNaN(roundedPhi) || roundedPhi < 0 || roundedPhi > 90) {
        throw new Error(`Valor de Phi inválido: ${phiValue}. Deve estar entre 0 e 90° (primeiro quadrante).`);
    }

    const fileName = `efield_phi_${roundedPhi}.csv`;
    const localPath = `data/efield_phi_data/${fileName}`;
    const ipfsCidPath = E_FIELD_BASE_CID_PHI_SPECIFIC + "/" + fileName;
    
    if (statusDiv) statusDiv.textContent = `Carregando dados 2D (Phi ${roundedPhi}°)...`;

    try {
        const response = await fetchDataWithLocalFallback(localPath, ipfsCidPath);
        const csvText = await response.text();

        // Validação inicial do CSV
        if (!csvText || csvText.length < 100) {
            throw new Error("CSV vazio ou muito pequeno.");
        }
        if (csvText.startsWith("version")) {
            throw new Error("Arquivo é um LFS Pointer, não dados reais.");
        }

        const lines = csvText.trim().split('\n');
        if (lines.length < 2) {
            throw new Error(`CSV com dados insuficientes: apenas ${lines.length} linha(s).`);
        }

        const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim().toLowerCase());
        const indices = {
            theta_deg: headers.indexOf('theta [deg]'),
            phi_deg: headers.indexOf('phi [deg]'),
            reTheta: headers.indexOf('re(retheta) [v]'),
            imTheta: headers.indexOf('im(retheta) [v]'),
            rePhi: headers.indexOf('re(rephi) [v]'),
            imPhi: headers.indexOf('im(rephi) [v]')
        };

        if (Object.values(indices).some(index => index === -1)) {
            const missingCols = Object.entries(indices).filter(([k, v]) => v === -1).map(([k]) => k);
            throw new Error(`Cabeçalhos inválidos. Colunas ausentes: ${missingCols.join(', ')}`);
        }

        const data = [];
        let skippedLines = 0;
        for (let i = 1; i < lines.length; i++) {
            const v = lines[i].split(',').map(val => val.replace(/"/g, '').trim());
            if (v.length !== headers.length) {
                skippedLines++;
                continue;
            }
            try {
                const theta = parseFloat(v[indices.theta_deg]);
                const reTheta = parseFloat(v[indices.reTheta]);
                const imTheta = parseFloat(v[indices.imTheta]);
                const rePhi = parseFloat(v[indices.rePhi]);
                const imPhi = parseFloat(v[indices.imPhi]);
                const phi = parseFloat(v[indices.phi_deg]);

                // Validação mais rigorosa dos valores
                if (!isNaN(theta) && !isNaN(phi) && isFinite(reTheta) && isFinite(imTheta) && isFinite(rePhi) && isFinite(imPhi)) {
                    data.push({ theta, phi, rETheta: { re: reTheta, im: imTheta }, rEPhi: { re: rePhi, im: imPhi } });
                }
            } catch (e) {
                skippedLines++;
            }
        }

        if (skippedLines > 0) {
            console.warn(`[Parse 2D] ${skippedLines} linhas ignoradas por dados inválidos`);
        }

        PerformanceMetrics.lastProcessingTime = parseTimer();
        PerformanceMetrics.totalDataPoints = data.length;
        console.log(`[Parse 2D] Phi=${roundedPhi}°: ${data.length} pontos em ${PerformanceMetrics.formatTime(PerformanceMetrics.lastProcessingTime)}`);

        if (data.length === 0) {
            throw new Error(`Nenhum dado válido encontrado para Phi=${roundedPhi}°`);
        }

        return data;
    } catch (error) {
        console.error(`[Parse 2D] Erro ao processar Phi=${roundedPhi}°:`, error.message);
        throw error;
    }
}

async function fetchAndParseEFieldDataForSelectedPhi(phiValue) {
    const roundedPhi = Math.round(parseFloat(phiValue));
    if (parsedEFieldPhiDataCache[roundedPhi]) {
        console.log(`[Cache 2D] Usando dados em cache para Phi=${roundedPhi}°`);
        return parsedEFieldPhiDataCache[roundedPhi];
    }
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
    const parseTimer = PerformanceMetrics.startTimer();
    if (statusDiv) statusDiv.textContent = `Carregando dados Completos (3D)...`;

    // Caminho local para o arquivo 3D completo
    const localPath = 'data/rE_table_vivaldi_filtrado_reduzido.csv';
    
    try {
        const response = await fetchDataWithLocalFallback(localPath, E_FIELD_FULL_DATA_CID);
        const csvText = await response.text();

        // Validações iniciais
        if (!csvText || csvText.length < 1000) {
            throw new Error("Dados 3D insuficientes recebidos.");
        }
        if (csvText.startsWith("version")) {
            throw new Error("LFS Pointer recebido em vez de dados 3D.");
        }

        const lines = csvText.trim().split('\n');
        if (lines.length < 100) {
            throw new Error(`CSV 3D com poucos dados: apenas ${lines.length} linhas.`);
        }

        const headers = lines[0].split(',').map(h => h.replace(/"/g, '').replace(/\[.*?\]/g, '').trim().toLowerCase());
        const indices = {
            phi: headers.indexOf('phi'),
            theta: headers.indexOf('theta'),
            re_rephi: headers.indexOf('re(rephi)'),
            im_rephi: headers.indexOf('im(rephi)'),
            re_retheta: headers.indexOf('re(retheta)'),
            im_retheta: headers.indexOf('im(retheta)')
        };

        if (Object.values(indices).some(index => index === -1)) {
            const missingCols = Object.entries(indices).filter(([k, v]) => v === -1).map(([k]) => k);
            throw new Error(`Cabeçalhos 3D inválidos. Colunas ausentes: ${missingCols.join(', ')}`);
        }

        const data = [];
        const uniquePhiValues = new Set();
        let skippedLines = 0;
        for (let i = 1; i < lines.length; i++) {
            const v = lines[i].split(',').map(val => val.replace(/"/g, '').trim());
            if (v.length !== headers.length) {
                skippedLines++;
                continue;
            }
            const phi = parseFloat(v[indices.phi]);
            const theta = parseFloat(v[indices.theta]);
            const re_rephi = parseFloat(v[indices.re_rephi]);
            const im_rephi = parseFloat(v[indices.im_rephi]);
            const re_retheta = parseFloat(v[indices.re_retheta]);
            const im_retheta = parseFloat(v[indices.im_retheta]);

            // Validação completa dos valores
            if (!isNaN(phi) && !isNaN(theta) &&
                isFinite(re_rephi) && isFinite(im_rephi) &&
                isFinite(re_retheta) && isFinite(im_retheta)) {
                data.push({
                    phi_deg: phi, theta_deg: theta,
                    rEPhi: { re: re_rephi, im: im_rephi },
                    rETheta: { re: re_retheta, im: im_retheta }
                });
                uniquePhiValues.add(phi);
            } else {
                skippedLines++;
            }
        }

        if (skippedLines > 0) {
            console.warn(`[Parse 3D] ${skippedLines} linhas ignoradas por dados inválidos`);
        }

        PerformanceMetrics.lastProcessingTime = parseTimer();
        PerformanceMetrics.totalDataPoints = data.length;
        console.log(`[Parse 3D] ${data.length} pontos, ${uniquePhiValues.size} valores de Phi em ${PerformanceMetrics.formatTime(PerformanceMetrics.lastProcessingTime)}`);

        if (data.length === 0) {
            throw new Error("Nenhum dado 3D válido encontrado no CSV.");
        }

        Object.defineProperty(data, 'uniquePhis', { value: Array.from(uniquePhiValues).sort((a, b) => a - b), writable: false });
        return data;
    } catch (error) {
        console.error('[Parse 3D] Erro:', error.message);
        throw error;
    }
}

async function ensureFullEFieldData3DLoaded() {
    if (fullEFieldDataLoadingState === 'loaded' && fullEFieldDataCache) {
        console.log('[Cache 3D] Usando dados 3D em cache');
        return fullEFieldDataCache;
    }
    if (fullEFieldDataLoadingState === 'loading' && fetchFullDataPromiseActive) return fetchFullDataPromiseActive;

    fullEFieldDataLoadingState = 'loading';
    const promise = _fetchAndParseFullEFieldDataRecursive3D().then(data => {
        fullEFieldDataCache = data;
        fullEFieldDataLoadingState = 'loaded';
        console.log(`[Cache 3D] Dados 3D carregados: ${data.length} pontos`);
        window.dispatchEvent(new CustomEvent('beamData3DLoaded'));
        return data;
    }).catch(e => {
        fullEFieldDataLoadingState = 'error';
        console.error('[Cache 3D] Falha ao carregar dados 3D:', e.message);
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

    // HSV colorscale (SAOImageDS9: black → gray → blue → cyan → green → yellow → red → pink → white)
    const hsvColorscale = [
        [0.000, 'rgb(0, 0, 0)'],
        [0.050, 'rgb(64, 64, 64)'],
        [0.100, 'rgb(96, 96, 96)'],
        [0.130, 'rgb(96, 96, 160)'],
        [0.160, 'rgb(48, 128, 255)'],
        [0.200, 'rgb(0, 192, 255)'],
        [0.250, 'rgb(0, 255, 255)'],
        [0.300, 'rgb(0, 255, 160)'],
        [0.350, 'rgb(0, 255, 64)'],
        [0.400, 'rgb(0, 255, 0)'],
        [0.450, 'rgb(96, 255, 0)'],
        [0.500, 'rgb(192, 255, 0)'],
        [0.550, 'rgb(255, 255, 0)'],
        [0.600, 'rgb(255, 192, 0)'],
        [0.650, 'rgb(255, 128, 0)'],
        [0.700, 'rgb(255, 64, 0)'],
        [0.750, 'rgb(255, 0, 0)'],
        [0.800, 'rgb(255, 0, 64)'],
        [0.850, 'rgb(255, 0, 128)'],
        [0.900, 'rgb(255, 128, 224)'],
        [0.950, 'rgb(255, 192, 255)'],
        [1.000, 'rgb(255, 255, 255)']
    ];

    const data = [{
        type: 'surface', x: x, y: y, z: zData,
        surfacecolor: zData, colorscale: hsvColorscale
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
    console.log(`triggerHeatmapGeneration chamado: ${uniquePhis?.length} phis, ${uniqueThetas?.length} thetas, scale=${scaleType}`);
    if (!heatmapWorker) {
        console.error("Heatmap Worker not init");
        return;
    }

    toggleViews('heatmap');
    drawColorbar(scaleType); // Update legend

    if (statusDiv) statusDiv.textContent = `Gerando Heatmap...`;

    currentHeatmapRenderId++;
    console.log(`Enviando para heatmap worker, renderId=${currentHeatmapRenderId}`);
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
/**
 * Draws a clean circular axis overlay for scientific publications.
 * Features:
 * - Outer ring at θ = 90° (white border)
 * - Radial tick marks pointing inward with φ angle labels (every 30°)
 * - NO θ scale labels (removed as per request)
 * - Large BLACK φ labels for high visibility
 * - Clean, unobstructed view of beam pattern
 */
function drawCircularAxisOverlay(ctx, width, height) {
    const centerX = width / 2;
    const centerY = height / 2;
    const maxRadius = Math.min(width, height) / 2;

    // Style settings for publication quality
    const axisColor = 'rgba(255, 255, 255, 1)';
    const labelColor = 'rgba(0, 0, 0, 1)'; // BLACK labels

    // Font sizes scaled to canvas resolution - INCREASED SIZE
    // Previous: Math.max(16, Math.round(maxRadius / 40))
    // New: Significantly larger to match legend size
    const baseFontSize = Math.max(24, Math.round(maxRadius / 25));
    const tickLength = Math.max(12, Math.round(maxRadius / 80));
    const labelOffset = Math.max(25, Math.round(maxRadius / 25));

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

        // φ label outside the ring (Black, no shadow for clean look against white background assumption? 
        // Wait, the background is the canvas which might be transparent or white around the circle.
        // Heatmap is circular but fills the square canvas? 
        // No, heatmap is usually circular but the canvas is rectangular.
        // The background outside the circle is white in the container.
        // So black text is perfect.)

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
        // Removed shadow for black text on white background
        ctx.fillStyle = labelColor;
        ctx.fillText(`${phi}°`, labelX, labelY);
    });

    ctx.restore();
}

// === Colorbar / Legend ===
// DS9 "a" colormap reference for the legend (SAOImageDS9 heat-style)
// Transitions: Black → Red → Orange → Yellow → White
// Matches the colormap in heatmap_worker.js
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

    // Create HSV Gradient (Black → Gray → Blue → Cyan → Green → Yellow → Red → Pink → White)
    const barTop = 40; // Leave space for top margin
    const barBottom = height - 20;
    const barHeight = barBottom - barTop;
    const grad = ctx.createLinearGradient(0, barBottom, 0, barTop); // Bottom to Top
    grad.addColorStop(0.000, 'rgb(0, 0, 0)');
    grad.addColorStop(0.050, 'rgb(64, 64, 64)');
    grad.addColorStop(0.100, 'rgb(96, 96, 96)');
    grad.addColorStop(0.130, 'rgb(96, 96, 160)');
    grad.addColorStop(0.160, 'rgb(48, 128, 255)');
    grad.addColorStop(0.200, 'rgb(0, 192, 255)');
    grad.addColorStop(0.250, 'rgb(0, 255, 255)');
    grad.addColorStop(0.300, 'rgb(0, 255, 160)');
    grad.addColorStop(0.350, 'rgb(0, 255, 64)');
    grad.addColorStop(0.400, 'rgb(0, 255, 0)');
    grad.addColorStop(0.450, 'rgb(96, 255, 0)');
    grad.addColorStop(0.500, 'rgb(192, 255, 0)');
    grad.addColorStop(0.550, 'rgb(255, 255, 0)');
    grad.addColorStop(0.600, 'rgb(255, 192, 0)');
    grad.addColorStop(0.650, 'rgb(255, 128, 0)');
    grad.addColorStop(0.700, 'rgb(255, 64, 0)');
    grad.addColorStop(0.750, 'rgb(255, 0, 0)');
    grad.addColorStop(0.800, 'rgb(255, 0, 64)');
    grad.addColorStop(0.850, 'rgb(255, 0, 128)');
    grad.addColorStop(0.900, 'rgb(255, 128, 224)');
    grad.addColorStop(0.950, 'rgb(255, 192, 255)');
    grad.addColorStop(1.000, 'rgb(255, 255, 255)');

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

        const { uniqueThetas_deg, uniquePhis_deg, magnitudes_grid_linear_normalized } = cachedCalculationResult3D;
        const maxTheta = uniqueThetas_deg[uniqueThetas_deg.length - 1];

        const theta = (rPx / maxRadiusPx) * maxTheta;
        let angleRad = Math.atan2(-dy, dx);
        let angleDeg = angleRad * 180 / Math.PI;
        if (angleDeg < 0) angleDeg += 360;

        // Interpolate the intensity value from the grid data using supersampling for precision
        let intensityValue = 0;
        let intensityDisplay = '';
        
        try {
            // Get current scale type
            const currentScale = scaleSelect ? scaleSelect.value : 'sqrt';
            
            // Helper function for bilinear interpolation at a single point
            const interpolateAtPoint = (theta, phi) => {
                // Find theta index
                let thetaIdx = 0;
                if (theta <= uniqueThetas_deg[0]) {
                    thetaIdx = 0;
                } else if (theta >= uniqueThetas_deg[uniqueThetas_deg.length - 1]) {
                    thetaIdx = uniqueThetas_deg.length - 2;
                } else {
                    for (let i = 0; i < uniqueThetas_deg.length - 1; i++) {
                        if (uniqueThetas_deg[i] <= theta && theta <= uniqueThetas_deg[i + 1]) {
                            thetaIdx = i;
                            break;
                        }
                    }
                }
                
                // Normalize phi to [0, 360)
                let normPhi = phi % 360;
                if (normPhi < 0) normPhi += 360;
                
                // Find phi index
                let phiIdx = 0;
                const maxPhi = uniquePhis_deg[uniquePhis_deg.length - 1];
                const minPhi = uniquePhis_deg[0];
                
                if (normPhi <= minPhi) {
                    phiIdx = 0;
                } else if (normPhi >= maxPhi) {
                    phiIdx = uniquePhis_deg.length - 1;
                } else {
                    for (let i = 0; i < uniquePhis_deg.length - 1; i++) {
                        if (uniquePhis_deg[i] <= normPhi && normPhi <= uniquePhis_deg[i + 1]) {
                            phiIdx = i;
                            break;
                        }
                    }
                }
                
                // Bilinear interpolation
                const thetaLow = uniqueThetas_deg[thetaIdx];
                const thetaHigh = uniqueThetas_deg[Math.min(thetaIdx + 1, uniqueThetas_deg.length - 1)];
                const phiLow = uniquePhis_deg[phiIdx];
                const phiNextIdx = (phiIdx + 1) % uniquePhis_deg.length;
                let phiHigh = uniquePhis_deg[phiNextIdx];
                if (phiIdx === uniquePhis_deg.length - 1) {
                    phiHigh = uniquePhis_deg[0] + 360;
                }
                
                const thetaWeight = (thetaHigh !== thetaLow) ? (theta - thetaLow) / (thetaHigh - thetaLow) : 0;
                const phiWeight = (phiHigh !== phiLow) ? (normPhi - phiLow) / (phiHigh - phiLow) : 0;
                
                const u = Math.max(0, Math.min(1, thetaWeight));
                const v = Math.max(0, Math.min(1, phiWeight));
                
                const tIdx1 = Math.min(thetaIdx + 1, uniqueThetas_deg.length - 1);
                
                const v00 = magnitudes_grid_linear_normalized[thetaIdx][phiIdx];
                const v10 = magnitudes_grid_linear_normalized[tIdx1][phiIdx];
                const v01 = magnitudes_grid_linear_normalized[thetaIdx][phiNextIdx];
                const v11 = magnitudes_grid_linear_normalized[tIdx1][phiNextIdx];
                
                return (1 - u) * (1 - v) * v00 + u * (1 - v) * v10 + (1 - u) * v * v01 + u * v * v11;
            };
            
            // Supersampling Anti-Aliasing: 3x3 grid around the cursor position
            // This provides smoother, more accurate intensity readings
            const SSAA = 3;
            const pixelSize = 1.0; // Sample within +/- half pixel
            let sumVal = 0;
            let sampleCount = 0;
            
            for (let sy = 0; sy < SSAA; sy++) {
                for (let sx = 0; sx < SSAA; sx++) {
                    const offsetX = ((sx + 0.5) / SSAA - 0.5) * pixelSize;
                    const offsetY = ((sy + 0.5) / SSAA - 0.5) * pixelSize;
                    
                    const sampleDx = dx + offsetX;
                    const sampleDy = dy + offsetY;
                    const sampleR = Math.sqrt(sampleDx * sampleDx + sampleDy * sampleDy);
                    
                    if (sampleR > maxRadiusPx) continue;
                    
                    const sampleTheta = (sampleR / maxRadiusPx) * maxTheta;
                    let sampleAngleRad = Math.atan2(-sampleDy, sampleDx);
                    let sampleAngleDeg = sampleAngleRad * 180 / Math.PI;
                    if (sampleAngleDeg < 0) sampleAngleDeg += 360;
                    
                    sumVal += interpolateAtPoint(sampleTheta, sampleAngleDeg);
                    sampleCount++;
                }
            }
            
            const linearValue = sampleCount > 0 ? sumVal / sampleCount : interpolateAtPoint(theta, angleDeg);
            
            // Apply the current scale transformation
            switch (currentScale) {
                case 'dB':
                    if (linearValue <= 1e-10) {
                        intensityValue = -60;
                    } else {
                        intensityValue = 20 * Math.log10(linearValue);
                        if (intensityValue < -60) intensityValue = -60;
                    }
                    intensityDisplay = `|E|: ${intensityValue.toFixed(1)} dB`;
                    break;
                case 'linear':
                    intensityValue = linearValue;
                    intensityDisplay = `|E|: ${intensityValue.toFixed(4)}`;
                    break;
                case 'sqrt':
                    intensityValue = Math.sqrt(linearValue);
                    intensityDisplay = `|E|^½: ${intensityValue.toFixed(4)}`;
                    break;
                case 'quadratic':
                    intensityValue = linearValue * linearValue;
                    intensityDisplay = `|E|²: ${intensityValue.toFixed(6)}`;
                    break;
                case 'fourth_root':
                    intensityValue = Math.pow(linearValue, 0.25);
                    intensityDisplay = `|E|^¼: ${intensityValue.toFixed(4)}`;
                    break;
                default:
                    intensityValue = linearValue;
                    intensityDisplay = `|E|: ${intensityValue.toFixed(4)}`;
            }
        } catch (err) {
            console.warn('Error calculating intensity for tooltip:', err);
            intensityDisplay = '';
        }

        heatmapTooltip.style.display = 'block';
        heatmapTooltip.style.left = (x + 10) + 'px';
        heatmapTooltip.style.top = (y + 10) + 'px';

        const tooltipText = intensityDisplay 
            ? `Θ: ${theta.toFixed(1)}°, Φ: ${angleDeg.toFixed(1)}°, ${intensityDisplay}`
            : `Θ: ${theta.toFixed(1)}°, Φ: ${angleDeg.toFixed(1)}°`;
        heatmapTooltip.textContent = tooltipText;
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
            // Ignore progress updates for outdated calculations
            if (e.data.type === 'progress') {
                if (e.data.id === current3DCalculationId && statusDiv) {
                    statusDiv.textContent = e.data.data;
                }
                return;
            }
            
            // For final results (result3D or error), check if this is the latest request
            if (e.data.id !== current3DCalculationId) {
                // This is an outdated result - don't store it in cache
                console.log(`Ignorando resultado 3D obsoleto (ID ${e.data.id} vs atual ${current3DCalculationId})`);
                // Don't change isProcessingPlot - the newer calculation is still in progress
                return;
            }
            
            if (e.data.type === 'result3D') {
                // Get the layoutHash that the worker calculated for
                const workerLayoutHash = e.data.layoutHash;
                
                // Get the current layout hash
                const currentAntennas = window.antennaGenerator ? window.antennaGenerator.getAllAntennas() : [];
                const currentLayoutHash = getLayoutHash(currentAntennas);
                
                // Validate: the worker's result is valid if it matches the CURRENT layout
                // This is more robust than checking against cachedCalculationParams3D which may have been invalidated
                if (workerLayoutHash && workerLayoutHash === currentLayoutHash) {
                    // Worker result matches current layout - cache and display
                    cachedCalculationResult3D = e.data.data;
                    cachedCalculationParams3D = { layoutHash: currentLayoutHash };
                    console.log(`Resultado 3D recebido e cacheado (ID ${e.data.id}, hash corresponde ao layout atual).`);
                    try {
                        refreshVisualization();
                    } catch (err) {
                        console.error('Erro em refreshVisualization:', err);
                    }
                } else if (!workerLayoutHash && cachedCalculationParams3D && cachedCalculationParams3D.layoutHash === currentLayoutHash) {
                    // Fallback for older worker without layoutHash support - use cachedCalculationParams3D
                    cachedCalculationResult3D = e.data.data;
                    console.log(`Resultado 3D recebido e cacheado (ID ${e.data.id}, hash válido via cache params).`);
                    try {
                        refreshVisualization();
                    } catch (err) {
                        console.error('Erro em refreshVisualization:', err);
                    }
                } else {
                    // Layout changed during calculation - discard
                    console.log(`Resultado 3D descartado - layout mudou (worker hash: ${workerLayoutHash?.slice(0,50) || 'N/A'}..., atual: ${currentLayoutHash?.slice(0,50)}...)`);
                    // Don't clear cache here - let the next calculation populate it
                }
                
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
        let lastDisplayedHeatmapRenderId = 0; // Track the ID of the last heatmap we displayed
        
        heatmapWorker.onmessage = (e) => {
            const resultRenderId = e.data.renderId || 0;
            
            // Only accept results that are newer than what we've already displayed
            // This prevents showing an older heatmap after a newer one
            if (resultRenderId < lastDisplayedHeatmapRenderId) {
                console.log(`Ignorando heatmap obsoleto (ID ${resultRenderId} < último exibido ${lastDisplayedHeatmapRenderId})`);
                return;
            }

            if (e.data.pixels) {
                lastDisplayedHeatmapRenderId = resultRenderId;
                console.log(`Heatmap recebido do worker, renderId=${resultRenderId}, desenhando...`);
                drawHeatmapToCanvas(e.data.pixels, e.data.width, e.data.height);
                
                // Log if this wasn't the most recent request (but still show it)
                if (resultRenderId !== currentHeatmapRenderId) {
                    console.log(`Exibindo heatmap ID ${resultRenderId} (mais recente solicitado: ${currentHeatmapRenderId})`);
                }
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
    console.log('refreshVisualization() chamado, cachedCalculationResult3D:', !!cachedCalculationResult3D);
    if (!cachedCalculationResult3D) return;

    const { uniquePhis_deg, uniqueThetas_deg, magnitudes_grid_dB, magnitudes_grid_linear_normalized } = cachedCalculationResult3D;

    // Check Active Mode
    const isHeatmapMode = visualizeHeatmapBtn?.classList.contains('primary');
    const is3DMode = visualize3DBtn?.classList.contains('primary');
    console.log(`refreshVisualization: isHeatmapMode=${isHeatmapMode}, is3DMode=${is3DMode}`);
    
    if (isHeatmapMode) {
        // Heatmap Mode
        console.log('Chamando triggerHeatmapGeneration...');
        triggerHeatmapGeneration(
            uniquePhis_deg,
            uniqueThetas_deg,
            magnitudes_grid_linear_normalized,
            storedFullDataScaleType
        );
    } else if (is3DMode) {
        // 3D Mode
        plotBeamPattern3D(uniquePhis_deg, uniqueThetas_deg, magnitudes_grid_dB, magnitudes_grid_linear_normalized, storedFullDataScaleType);
    } else {
        // Default Fallback: Force Heatmap as per user request (reverted from 3D)
        console.log('Modo não detectado, usando fallback para heatmap...');
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

    // Cache Check - must have both result AND matching params
    const layoutHash = getLayoutHash(antennaCoords);
    const cacheIsValid = cachedCalculationResult3D && 
                         cachedCalculationParams3D && 
                         cachedCalculationParams3D.layoutHash === layoutHash;
    
    if (cacheIsValid) {
        console.log("Usando cache 3D (hash válido).");
        refreshVisualization();
        return;
    }
    
    // Cache is invalid - clear it to prevent stale data
    if (cachedCalculationResult3D && (!cachedCalculationParams3D || cachedCalculationParams3D.layoutHash !== layoutHash)) {
        console.log(`Cache 3D inválido (hash mismatch). Recalculando...`);
        cachedCalculationResult3D = null;
        cachedCalculationParams3D = null;
    }

    isProcessingPlot = true;
    current3DCalculationId++;
    
    // Store the hash we're calculating for - this will be used to validate when worker returns
    const calculationLayoutHash = layoutHash;

    // Load Data
    try {
        const fullData = await ensureFullEFieldData3DLoaded();
        beamCalculationWorker3D.postMessage({
            id: current3DCalculationId,
            antennaCoords: antennaCoords,
            elementFieldData3D: fullData,
            K_CONST: K,
            layoutHash: calculationLayoutHash // Pass hash to worker for validation
        });
        cachedCalculationParams3D = { layoutHash: calculationLayoutHash };
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
        // Invalidate 3D cache when layout changes to force recalculation
        console.log('BeamPattern: layoutGenerated recebido - invalidando cache 3D');
        cachedCalculationResult3D = null;
        cachedCalculationParams3D = null;
        
        layoutUpdateTimeout = setTimeout(() => {
            // Reverted auto-switch to 3D. Now just triggers update.
            console.log('BeamPattern: Timeout expirado - iniciando atualização do plot');
            if (visualize2DBtn.classList.contains('primary')) schedulePlotUpdate();
            else processFullDataPlotRequest();
        }, 200);
    });

    console.log("Controles do padrão de feixe inicializados.");
    // Initial State - Heatmap (reverted)
    setMode('heatmap');
}

document.addEventListener('DOMContentLoaded', initBeamPatternControls);