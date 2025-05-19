// js/beam_pattern.js

/**
 * beam_pattern.js
 * Modificado para usar arquivos CSV individuais para plot 2D (via Pinata)
 * e o arquivo CSV completo para plot 3D (também via Pinata).
 * Garante que os dados enviados ao worker 2D usem chaves 'theta' e 'phi'.
 * Dispara evento 'beamData3DLoaded' após carregamento bem-sucedido dos dados 3D.
 */

// === Constantes ===
const FREQUENCY = 1e9;
const C_LIGHT = 299792458;
const LAMBDA = C_LIGHT / FREQUENCY;
const K = (2 * Math.PI) / LAMBDA;

const E_FIELD_PHI_CSV_BASE_PATH_IPFS = 'https://gateway.pinata.cloud/ipfs/bafybeibod4uopaxesmqti3qmonjcbttgxquuby6y6v2uo6sd7ah475bsai/efield_phi_';
const E_FIELD_FULL_CSV_PATH_IPFS = 'https://gateway.pinata.cloud/ipfs/bafybeicunhz5lwv3nryglwlppu6o6keo7ii3ilntcqtq536aket7qflc34';

const MAX_PLOT_POINTS_BEAM = 2000;
const PLOT_REQUEST_DEBOUNCE_DELAY = 300;

const MAX_FETCH_RETRIES = 3;
const INITIAL_RETRY_DELAY_MS = 1000;

// === Cache & Estado ===
let parsedEFieldPhiDataCache = {};
let fetchPhiPromisesCache = {};

let fullEFieldDataCache = null;
let fullEFieldDataLoadingState = 'idle'; // 'idle', 'loading', 'loaded', 'error'
let fetchFullDataPromiseActive = null;

let isProcessingPlot = false;
let beamCalculationWorker = null;
let beamCalculationWorker3D = null;
let currentCalculationId = 0;
let current3DCalculationId = 0;

let storedWorkerPlotParams = {};
let stored3DScaleType = 'dB';

let latestPlotRequestParams = null;
let currentlyProcessingRequestTimestamp = null;
let processRequestTimeoutId = null;


// === DOM Element References ===
let phiSlider = null;
let phiInput = null;
let scaleRadios = null;
let visualize3DBtn = null;
let visualize2DBtn = null;
let plotDivId = 'beam-pattern-plot';
let statusDiv = null;

// === Helper Functions ===
function getEFieldPhiCsvPath(phiValue) {
    const roundedPhi = Math.round(parseFloat(phiValue));
    return `${E_FIELD_PHI_CSV_BASE_PATH_IPFS}${roundedPhi}.csv`;
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// === Data Fetching and Parsing (2D - por arquivo Phi individual via IPFS) ===
async function _fetchAndParseSinglePhiWithRetry(phiValue, csvPath, attempt = 1) {
    const roundedPhi = Math.round(parseFloat(phiValue));
    if (statusDiv) {
        statusDiv.textContent = `Carregando dados E-field 2D (Phi ${roundedPhi}° IPFS)... ${attempt > 1 ? `(Tentativa ${attempt}/${MAX_FETCH_RETRIES})` : ''}`;
    }

    try {
        const response = await fetch(csvPath);
        if (!response.ok) {
            if ((response.status === 429 || response.status >=500 ) && attempt < MAX_FETCH_RETRIES) {
                const retryDelay = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
                if (statusDiv) {
                    statusDiv.textContent = `Falha ao buscar dados 2D (Phi ${roundedPhi}° IPFS, Status ${response.status}). Tentando novamente em ${retryDelay / 1000}s...`;
                }
                console.warn(`Fetch para ${csvPath} falhou (Status ${response.status}). Tentativa ${attempt}. Tentando novamente em ${retryDelay}ms.`);
                await delay(retryDelay);
                return _fetchAndParseSinglePhiWithRetry(phiValue, csvPath, attempt + 1);
            }
            throw new Error(`Falha ao buscar CSV 2D (Phi ${roundedPhi}° IPFS): ${response.status} ${response.statusText}`);
        }

        const csvText = await response.text();
        const lines = csvText.trim().split('\n');

        if (lines.length < 2 || csvText.startsWith("version https://git-lfs.github.com/spec/v1")) { 
            throw new Error(csvText.startsWith("version https://git-lfs.github.com/spec/v1") ? "Falha 2D: Recebido ponteiro Git LFS (IPFS)." : `CSV 2D para Phi ${roundedPhi}° (IPFS) vazio ou inválido.`);
        }
        
        const headersRaw = lines[0].split(',');
        const headers = headersRaw.map(h => h.replace(/"/g, '').trim().toLowerCase());
        const indices = {
            theta_deg: headers.indexOf('theta [deg]'), 
            phi_deg: headers.indexOf('phi [deg]'),     
            reTheta: headers.indexOf('re(retheta) [v]'),
            imTheta: headers.indexOf('im(retheta) [v]'),
            rePhi: headers.indexOf('re(rephi) [v]'),
            imPhi: headers.indexOf('im(rephi) [v]')
        };

        if (Object.values(indices).some(index => index === -1)) {
            console.error("Cabeçalhos 2D esperados não encontrados (IPFS):", headers, indices);
            throw new Error(`CSV 2D (Phi ${roundedPhi}° IPFS): Cabeçalho inválido.`);
        }
        const data = [];
        for (let i = 1; i < lines.length; i++) {
            const valuesRaw = lines[i].split(',');
            if (valuesRaw.length !== headers.length) continue;
            const values = valuesRaw.map(v => v.replace(/"/g, '').trim());
            try {
                const thetaDegVal = parseFloat(values[indices.theta_deg]);
                const phiDegVal = parseFloat(values[indices.phi_deg]); 
                const reThetaV = parseFloat(values[indices.reTheta]);
                const imThetaV = parseFloat(values[indices.imTheta]);
                const rePhiV = parseFloat(values[indices.rePhi]);
                const imPhiV = parseFloat(values[indices.imPhi]);

                if ([thetaDegVal, phiDegVal, reThetaV, imThetaV, rePhiV, imPhiV].some(isNaN)) continue;
                
                data.push({
                    theta: thetaDegVal, 
                    phi: phiDegVal,     
                    rETheta: { re: reThetaV, im: imThetaV }, 
                    rEPhi: { re: rePhiV, im: imPhiV },
                });
            } catch (parseError) { /* Ignora */ }
        }
        if (data.length === 0) {
            throw new Error(`CSV 2D (Phi ${roundedPhi}° IPFS) não contém dados válidos após parse.`);
        }
        return data;
    } catch (error) {
        console.error(`Erro final em _fetchAndParseSinglePhiWithRetry para Phi ${roundedPhi}° (IPFS, tentativa ${attempt}):`, error);
        throw error;
    }
}

async function fetchAndParseEFieldDataForSelectedPhi(phiValue) {
    const roundedPhi = Math.round(parseFloat(phiValue));

    if (parsedEFieldPhiDataCache[roundedPhi]) {
        return parsedEFieldPhiDataCache[roundedPhi];
    }
    if (fetchPhiPromisesCache[roundedPhi]) {
        return fetchPhiPromisesCache[roundedPhi];
    }

    const csvPath = getEFieldPhiCsvPath(roundedPhi);
    const promise = _fetchAndParseSinglePhiWithRetry(phiValue, csvPath, 1)
        .then(data => {
            parsedEFieldPhiDataCache[roundedPhi] = data;
            if (statusDiv && statusDiv.textContent.startsWith(`Carregando dados E-field 2D (Phi ${roundedPhi}° IPFS)`)) {
                statusDiv.textContent = `Dados E-field 2D (Phi ${roundedPhi}° IPFS) carregados.`;
            }
            delete fetchPhiPromisesCache[roundedPhi];
            return data;
        })
        .catch(error => {
            if (statusDiv && !statusDiv.textContent.includes("Falha ao buscar dados")) {
                 statusDiv.textContent = `Erro CSV 2D (Phi ${roundedPhi}° IPFS): ${error.message.substring(0,100)}`;
            }
            delete fetchPhiPromisesCache[roundedPhi];
            throw error;
        });

    fetchPhiPromisesCache[roundedPhi] = promise;
    return promise;
}


// === Data Fetching and Parsing (3D - arquivo completo via IPFS) ===
async function _fetchAndParseFullEFieldDataRecursive3D(attempt = 1) {
    if (statusDiv) {
        statusDiv.textContent = `Carregando dados E-field 3D (IPFS)... ${attempt > 1 ? `(Tentativa ${attempt}/${MAX_FETCH_RETRIES})` : ''}`;
    }
    try {
        const response = await fetch(E_FIELD_FULL_CSV_PATH_IPFS);
        if (!response.ok) {
            if ((response.status === 429 || response.status >= 500) && attempt < MAX_FETCH_RETRIES) {
                const retryDelay = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
                if (statusDiv) {
                    statusDiv.textContent = `Falha ao buscar dados 3D (IPFS, Status ${response.status}). Tentando novamente em ${retryDelay / 1000}s...`;
                }
                console.warn(`Fetch do CSV 3D (IPFS) falhou (Status ${response.status}). Tentativa ${attempt}. Tentando novamente em ${retryDelay}ms.`);
                await delay(retryDelay);
                return _fetchAndParseFullEFieldDataRecursive3D(attempt + 1);
            }
            throw new Error(`Falha ao buscar CSV 3D (IPFS): ${response.status} ${response.statusText}`);
        }
        const csvText = await response.text();
        if (csvText.startsWith("version https://git-lfs.github.com/spec/v1")) {
            throw new Error("Falha 3D: Recebido ponteiro Git LFS (IPFS).");
        }
        const lines = csvText.trim().split('\n');
        if (lines.length < 2) {
            throw new Error("CSV 3D (IPFS) vazio ou apenas com cabeçalho.");
        }
        const headersRaw = lines[0].split(',');
        const headers = headersRaw.map(h => 
            h.replace(/"/g, '').replace(/\[.*?\]/g, '').trim().toLowerCase()
        );
        
        const indices = {
            phi: headers.indexOf('phi'), 
            theta: headers.indexOf('theta'),
            re_rephi: headers.indexOf('re(rephi)'), 
            im_rephi: headers.indexOf('im(rephi)'),
            re_retheta: headers.indexOf('re(retheta)'), 
            im_retheta: headers.indexOf('im(retheta)')
        };

        if (Object.values(indices).some(index => index === -1)) {
            console.error("Cabeçalhos 3D normalizados esperados não encontrados (IPFS):", headers, indices);
            throw new Error("CSV 3D (IPFS): Cabeçalho normalizado inválido.");
        }

        const data = [];
        const uniquePhiValues = new Set(); 

        for (let i = 1; i < lines.length; i++) {
            const valuesRaw = lines[i].split(',');
            if (valuesRaw.length !== headers.length) continue;
            const values = valuesRaw.map(v => v.replace(/"/g, '').trim());
            try {
                const phiVal = parseFloat(values[indices.phi]);
                const thetaVal = parseFloat(values[indices.theta]);
                const rePhiV = parseFloat(values[indices.re_rephi]);
                const imPhiV = parseFloat(values[indices.im_rephi]);
                const reThetaV = parseFloat(values[indices.re_retheta]);
                const imThetaV = parseFloat(values[indices.im_retheta]);

                if ([phiVal, thetaVal, rePhiV, imPhiV, reThetaV, imThetaV].some(isNaN)) continue;
                
                data.push({
                    phi_deg: phiVal, 
                    theta_deg: thetaVal,
                    rEPhi: { re: rePhiV, im: imPhiV }, 
                    rETheta: { re: reThetaV, im: imThetaV }
                });
                uniquePhiValues.add(phiVal); // Adiciona para construir a lista de Phis únicos
            } catch (parseError) { /* Ignora */ }
        }
        if (data.length === 0) {
            throw new Error("CSV 3D (IPFS) não contém dados válidos após parse.");
        }
        // Adiciona a propriedade uniquePhis ao array de dados retornado
        // Isso é usado por processLatestPlotRequestIfIdle para encontrar o Phi mais próximo.
        Object.defineProperty(data, 'uniquePhis', {
            value: Array.from(uniquePhiValues).sort((a,b) => a-b),
            writable: false, // Impede modificação externa acidental
            enumerable: false // Não aparece em for...in ou Object.keys(data)
        });
        return data;
    } catch (error) {
        console.error(`Erro final em _fetchAndParseFullEFieldDataRecursive3D (tentativa ${attempt}):`, error);
        throw error;
    }
}

async function ensureFullEFieldData3DLoaded() { 
    if (fullEFieldDataLoadingState === 'loaded' && fullEFieldDataCache) {
        return fullEFieldDataCache;
    }
    if (fullEFieldDataLoadingState === 'loading' && fetchFullDataPromiseActive) {
        return fetchFullDataPromiseActive;
    }
    
    fullEFieldDataLoadingState = 'loading';
    const promise = _fetchAndParseFullEFieldDataRecursive3D(1)
        .then(data => {
            fullEFieldDataCache = data;
            fullEFieldDataLoadingState = 'loaded';
            if (statusDiv && statusDiv.textContent.startsWith('Carregando dados E-field 3D (IPFS)')) {
                 statusDiv.textContent = 'Dados E-field 3D (IPFS) carregados com sucesso.';
            }
            fetchFullDataPromiseActive = null;
            // Dispara evento para notificar que os dados 3D estão prontos
            window.dispatchEvent(new CustomEvent('beamData3DLoaded'));
            console.log("Evento 'beamData3DLoaded' disparado de beam_pattern.js");
            return data;
        })
        .catch(error => {
            if (statusDiv && !statusDiv.textContent.includes("Falha ao buscar dados")) {
                statusDiv.textContent = `Erro ao carregar dados 3D (IPFS): ${error.message.substring(0, 100)}`;
            }
            fullEFieldDataLoadingState = 'error';
            fetchFullDataPromiseActive = null;
            throw error;
        });
    
    fetchFullDataPromiseActive = promise;
    return promise;
}


// === Downsampling Function (2D) ===
// ... (sem alterações) ...
function downsampleData(xData, yData, maxPoints) {
    if (xData.length <= maxPoints) return { x: xData, y: yData };
    const factor = Math.ceil(xData.length / maxPoints);
    const sampledX = [], sampledY = [];
    for (let i = 0; i < xData.length; i += factor) {
        sampledX.push(xData[i]); sampledY.push(yData[i]);
    }
    if ((xData.length - 1) % factor !== 0 && xData.length > 0) {
         sampledX.push(xData[xData.length - 1]); sampledY.push(yData[yData.length - 1]);
    }
    return { x: sampledX, y: sampledY };
}

// === 2D Plotting Function ===
// ... (sem alterações) ...
function plotBeamPattern2D(theta, fieldMagnitude, phiValue, scaleType) {
    const plotDiv = document.getElementById(plotDivId);
    if (!plotDiv) { console.error(`Div de plot 2D "${plotDivId}" não encontrada.`); return; }

    if (!plotDiv.classList.contains('visible')) {
        plotDiv.classList.add('visible');
    }

    const peakMagnitude = Math.max(1e-10, ...fieldMagnitude);
    let yData, yAxisTitle, yAxisConfig = {};
    if (scaleType === 'dB') {
        yData = fieldMagnitude.map(mag => {
            if (mag <= 0 || peakMagnitude <= 0) return -100;
            const dbVal = 20 * Math.log10(Math.max(mag / peakMagnitude, 1e-10));
            return Math.max(-100, dbVal);
        });
        yAxisTitle = 'Magnitude Normalizada (dB)';
        yAxisConfig.range = [-100, 0];
    } else {
        yData = fieldMagnitude.map(mag => peakMagnitude > 0 ? mag / peakMagnitude : 0);
        yAxisTitle = 'Magnitude Normalizada (Linear)';
        yAxisConfig.autorange = true;
        yAxisConfig.rangemode = 'tozero';
    }
    const rootStyle = getComputedStyle(document.documentElement);
    const plotColors = {
        plotBgColor: rootStyle.getPropertyValue('--plot-bg-color').trim() || '#ffffff',
        paperBgColor: rootStyle.getPropertyValue('--card-bg-color').trim() || '#ffffff',
        textColor: rootStyle.getPropertyValue('--text-color').trim() || '#333333',
        gridColor: rootStyle.getPropertyValue('--plot-grid-color').trim() || '#eeeeee',
        lineColor: rootStyle.getPropertyValue('--primary-color').trim() || '#3498db',
        axisColor: rootStyle.getPropertyValue('--border-color').trim() || '#cccccc',
    };
    const trace = {
        x: theta, y: yData, mode: 'lines', type: 'scatter',
        name: `Phi = ${phiValue}°`, line: { color: plotColors.lineColor, width: 1.5 }
    };
    const layout = {
        title: `Padrão de Feixe 2D (Phi = ${phiValue}°, Escala ${scaleType === 'dB' ? 'dB' : 'Linear'})`,
        xaxis: { title: 'Theta (graus)', gridcolor: plotColors.gridColor, zerolinecolor: plotColors.axisColor, linecolor: plotColors.axisColor, tickcolor: plotColors.textColor, titlefont: { color: plotColors.textColor }, tickfont: { color: plotColors.textColor }, automargin: true },
        yaxis: {
            title: yAxisTitle,
            gridcolor: plotColors.gridColor,
            zerolinecolor: plotColors.axisColor,
            linecolor: plotColors.axisColor,
            tickcolor: plotColors.textColor,
            titlefont: { color: plotColors.textColor },
            tickfont: { color: plotColors.textColor },
            automargin: true,
            ...yAxisConfig
        },
        plot_bgcolor: plotColors.plotBgColor, paper_bgcolor: plotColors.paperBgColor,
        font: { color: plotColors.textColor }, showlegend: false,
        autosize: true,
    };
    const config = {responsive: true, scrollZoom: true };

    Plotly.react(plotDivId, [trace], layout, config)
        .catch(err => {
            console.error("Erro ao atualizar 2D (react) Plotly, tentando newPlot:", err);
            return Plotly.newPlot(plotDivId, [trace], layout, config);
        })
        .catch(err2 => {
            console.error("Erro fatal no Plotly 2D (newPlot fallback):", err2);
            if (statusDiv) statusDiv.textContent = "Erro crítico ao renderizar gráfico 2D.";
        });
}

// === 3D Plotting Function ===
// ... (sem alterações) ...
function plotBeamPattern3D(uniquePhis_deg, uniqueThetas_deg, magnitudes_grid_dB, magnitudes_grid_linear_normalized, scaleType) {
    const plotDiv = document.getElementById(plotDivId);
    if (!plotDiv) {
        console.error(`Div de plot 3D "${plotDivId}" não encontrada.`);
        return;
    }

    const DEG_TO_RAD = Math.PI / 180;
    const x_surface = []; const y_surface = [];
    for (let i = 0; i < uniqueThetas_deg.length; i++) {
        const theta_val_for_radius_rad = uniqueThetas_deg[i] * DEG_TO_RAD;
        const x_row = []; const y_row = [];
        for (let j = 0; j < uniquePhis_deg.length; j++) {
            const phi_rad = uniquePhis_deg[j] * DEG_TO_RAD;
            x_row.push(theta_val_for_radius_rad * Math.cos(phi_rad));
            y_row.push(theta_val_for_radius_rad * Math.sin(phi_rad));
        }
        x_surface.push(x_row); y_surface.push(y_row);
    }
    const rootStyle = getComputedStyle(document.documentElement);
    const plotColors = {
        plotBgColor: rootStyle.getPropertyValue('--plot-bg-color').trim() || '#ffffff',
        paperBgColor: rootStyle.getPropertyValue('--card-bg-color').trim() || '#ffffff',
        textColor: rootStyle.getPropertyValue('--text-color').trim() || '#333333',
        gridColor: rootStyle.getPropertyValue('--plot-grid-color').trim() || '#eeeeee',
        axisColor: rootStyle.getPropertyValue('--border-color').trim() || '#cccccc',
        colorscale: 'Viridis',
    };
    let z_data_to_plot, z_axis_title, z_axis_range_plot, colorbar_title;
    if (scaleType === 'dB') {
        z_data_to_plot = magnitudes_grid_dB; z_axis_title = 'Magnitude (dB)'; colorbar_title = 'dB'; z_axis_range_plot = [-100, 0];
    } else {
        z_data_to_plot = magnitudes_grid_linear_normalized; z_axis_title = 'Magnitude (Linear Norm.)'; colorbar_title = 'Linear'; z_axis_range_plot = [0, 1];
    }
    const data = [{
        type: 'surface', x: x_surface, y: y_surface, z: z_data_to_plot, surfacecolor: z_data_to_plot, colorscale: plotColors.colorscale,
        showscale: true, colorbar: { title: colorbar_title, tickfont: { color: plotColors.textColor }, titlefont: { color: plotColors.textColor }, len: 0.75, yanchor: 'middle', y: 0.5, },
        cmin: z_axis_range_plot[0], cmax: z_axis_range_plot[1], hoverinfo: 'skip', contours: { x: { show: false }, y: { show: false }, z: { show: false } },
        lighting: { ambient: 0.55, diffuse: 0.7, specular: 0.15, roughness: 0.5, fresnel: 0.1 }, lightposition: { x: 1000, y: 500, z: 5000 }
    }];
    let zScaleFactor = 0.8;
    let initialCamera = { eye: { x: 1.5, y: 1.5, z: 1.5 }, up: { x: 0, y: 0, z: 1 }, center: { x: 0, y: 0, z: (scaleType === 'dB' ? -50 : 0.4) } };
    if (scaleType === 'dB') { initialCamera.eye = { x: 1.5, y: 1.5, z: 1.8 }; initialCamera.center = { x: 0, y: 0, z: -50 }; }
    const layout = {
        title: `Padrão de Feixe 3D (Projeção Polar, Escala ${scaleType})`, autosize: true,
        scene: {
            xaxis: { title: 'X = Θ · cos(Φ)', autorange: true, color: plotColors.textColor, gridcolor: plotColors.gridColor, zerolinecolor: plotColors.axisColor, linecolor: plotColors.axisColor, backgroundcolor: plotColors.plotBgColor },
            yaxis: { title: 'Y = Θ · sin(Φ)', autorange: true, color: plotColors.textColor, gridcolor: plotColors.gridColor, zerolinecolor: plotColors.axisColor, linecolor: plotColors.axisColor, backgroundcolor: plotColors.plotBgColor },
            zaxis: { title: z_axis_title, range: z_axis_range_plot, color: plotColors.textColor, gridcolor: plotColors.gridColor, zerolinecolor: plotColors.axisColor, linecolor: plotColors.axisColor, backgroundcolor: plotColors.plotBgColor },
            camera: initialCamera, aspectmode: 'manual', aspectratio: { x: 1, y: 1, z: zScaleFactor }, dragmode: 'turntable'
        },
        plot_bgcolor: plotColors.plotBgColor, paper_bgcolor: plotColors.paperBgColor, font: { color: plotColors.textColor }, margin: { l: 5, r: 5, b: 5, t: 40, pad: 2 }
    };
    const config = { responsive: true, scrollZoom: true };

    Plotly.newPlot(plotDivId, data, layout, config)
        .then(() => {
            if (statusDiv && !statusDiv.textContent.startsWith("Erro")) {
                statusDiv.textContent = `Visualização 3D (${scaleType}) renderizada. Ajustando câmera...`;
            }
            setTimeout(() => {
                Plotly.Plots.resize(plotDivId)
                    .then(() => {
                        const updateLayout = { 'scene.camera': null, 'scene.xaxis.autorange': true, 'scene.yaxis.autorange': true };
                        return Plotly.relayout(plotDivId, updateLayout);
                    })
                    .then(() => {
                        plotDiv.classList.add('visible');
                        if (statusDiv && statusDiv.textContent.endsWith("Ajustando câmera...")) {
                            statusDiv.textContent = `Visualização 3D (${scaleType}) pronta. Interaja com controles.`;
                        }
                    })
                    .catch(err => {
                        console.warn("Falha ao tentar resize/relayout da câmera 3D:", err);
                        plotDiv.classList.add('visible');
                        if (statusDiv && statusDiv.textContent.endsWith("Ajustando câmera...")) {
                            statusDiv.textContent = `Visualização 3D (${scaleType}) carregada (erro no ajuste fino).`;
                        }
                    });
            }, 250);
        })
        .catch(err => {
            console.error("Erro ao renderizar Plotly 3D com newPlot:", err);
            if (statusDiv) statusDiv.textContent = `Erro ao gerar gráfico 3D: ${err.message.substring(0, 100)}`;
            plotDiv.classList.add('visible');
        });
}


// === Plot Scheduling and Processing ===
function schedulePlotUpdate() {
    const currentAntennaCoords = window.antennaGenerator ? window.antennaGenerator.getAllAntennas() : [];
    const currentPhi = phiInput ? parseFloat(phiInput.value) : 90;
    let currentScale = 'dB';
    if (scaleRadios) {
        for (const radio of scaleRadios) { if (radio.checked) { currentScale = radio.value; break; } }
    }

    latestPlotRequestParams = {
        antennaCoords: currentAntennaCoords,
        phi: currentPhi,
        scale: currentScale,
        timestamp: Date.now()
    };

    if (statusDiv && !isProcessingPlot && !statusDiv.textContent.startsWith("Limite de taxa") && !statusDiv.textContent.startsWith("Falha ao buscar dados")) {
        statusDiv.textContent = `Solicitação 2D (Phi: ${currentPhi}, Ant: ${currentAntennaCoords.length}, Escala: ${currentScale}) pendente...`;
    }

    clearTimeout(processRequestTimeoutId);
    processRequestTimeoutId = setTimeout(processLatestPlotRequestIfIdle, PLOT_REQUEST_DEBOUNCE_DELAY);
}

async function processLatestPlotRequestIfIdle() {
    if (!latestPlotRequestParams) return;

    if (isProcessingPlot) {
        clearTimeout(processRequestTimeoutId);
        processRequestTimeoutId = setTimeout(processLatestPlotRequestIfIdle, PLOT_REQUEST_DEBOUNCE_DELAY + 50);
        return;
    }

    isProcessingPlot = true;
    currentlyProcessingRequestTimestamp = latestPlotRequestParams.timestamp;
    const requestToProcess = { ...latestPlotRequestParams };

    if (statusDiv && !statusDiv.textContent.startsWith("Limite de taxa") && !statusDiv.textContent.startsWith("Falha ao buscar dados")) {
        statusDiv.textContent = 'Preparando para gerar padrão de feixe 2D...';
    }

    const plotDivCurrent = document.getElementById(plotDivId);

    try {
        if (!window.antennaGenerator?.getAllAntennas) {
            throw new Error("Gerador de antenas não disponível.");
        }
        const { antennaCoords, phi: selectedPhiFromSlider, scale: selectedScale } = requestToProcess;

        if (!antennaCoords || antennaCoords.length === 0) {
            if (statusDiv) statusDiv.textContent = 'Layout de antenas vazio. Gere um layout primeiro.';
            if (plotDivCurrent) {
                 Plotly.purge(plotDivCurrent);
                 plotDivCurrent.classList.remove('visible');
            }
            finalizePlotProcessing(true, '2D');
            return;
        }

        if (plotDivCurrent && plotDivCurrent.data && plotDivCurrent.data.length > 0 && plotDivCurrent.data[0].type === 'surface') {
            console.log("Transição de 3D para 2D detectada. Escondendo plot 3D.");
            plotDivCurrent.classList.remove('visible');
        }

        const elementDataForSelectedPhi = await fetchAndParseEFieldDataForSelectedPhi(selectedPhiFromSlider);

        if (!elementDataForSelectedPhi || !Array.isArray(elementDataForSelectedPhi) || elementDataForSelectedPhi.length === 0) {
            throw new Error(`Dados do elemento 2D para Phi=${selectedPhiFromSlider}° não carregados ou vazios (após tentativas).`);
        }
        
        storedWorkerPlotParams = { phi: selectedPhiFromSlider, scale: selectedScale };
        currentCalculationId++;

        if (beamCalculationWorker) {
            if (statusDiv && !statusDiv.textContent.startsWith("Limite de taxa") && !statusDiv.textContent.startsWith("Falha ao buscar dados")) {
                statusDiv.textContent = `Calculando padrão 2D (Phi: ${selectedPhiFromSlider}°)...`;
            }
            beamCalculationWorker.postMessage({
                id: currentCalculationId,
                antennaCoords: antennaCoords,
                filteredElementData: elementDataForSelectedPhi,
                K_CONST: K,
                selectedPhiValue: selectedPhiFromSlider
            });
        } else {
            console.error("Web Worker 2D não disponível.");
            if (statusDiv) statusDiv.textContent = "Erro: Web Worker 2D não suportado ou falhou ao inicializar.";
            finalizePlotProcessing(false, '2D');
        }
    } catch (error) {
        console.error("Erro ao processar solicitação do padrão de feixe 2D:", error);
        if (statusDiv && !statusDiv.textContent.includes("Erro CSV 2D") && !statusDiv.textContent.startsWith("Limite de taxa") && !statusDiv.textContent.startsWith("Falha ao buscar dados")) {
            statusDiv.textContent = `Erro 2D: ${error.message.substring(0, 150)}`;
        }
        if (plotDivCurrent) {
            Plotly.purge(plotDivCurrent);
            plotDivCurrent.classList.remove('visible');
        }
        finalizePlotProcessing(false, '2D');
    }
}

async function process3DPlotRequest() {
    if (isProcessingPlot || fullEFieldDataLoadingState === 'loading') {
        if (statusDiv && fullEFieldDataLoadingState === 'loading') {
            statusDiv.textContent = "Carregamento dos dados E-field 3D (IPFS) em andamento, aguarde...";
        } else if (statusDiv && !statusDiv.textContent.startsWith("Limite de taxa") && !statusDiv.textContent.startsWith("Falha ao buscar dados")) {
            statusDiv.textContent = "Processamento de outro gráfico em andamento. Aguarde...";
        }
        if (visualize3DBtn && fullEFieldDataLoadingState !== 'loading') {
            visualize3DBtn.disabled = false;
        }
        return;
    }
    isProcessingPlot = true;
    if (statusDiv && !statusDiv.textContent.startsWith("Limite de taxa") && !statusDiv.textContent.startsWith("Falha ao buscar dados")) statusDiv.textContent = 'Preparando para gerar padrão de feixe 3D...';
    if (visualize3DBtn) visualize3DBtn.disabled = true;

    const plotDiv = document.getElementById(plotDivId);
    if (plotDiv) {
        plotDiv.classList.remove('visible');
    }

    let selectedScale3D = 'dB';
    if (scaleRadios) {
        for (const radio of scaleRadios) { if (radio.checked) { selectedScale3D = radio.value; break; } }
    }
    stored3DScaleType = selectedScale3D;

    try {
        const antennaCoords = window.antennaGenerator ? window.antennaGenerator.getAllAntennas() : [];
        if (!antennaCoords || antennaCoords.length === 0) {
            if (statusDiv) statusDiv.textContent = 'Layout de antenas vazio. Gere um layout primeiro.';
            if (plotDiv) {
                Plotly.purge(plotDiv);
            }
            finalizePlotProcessing(true, '3D');
            return;
        }

        const allEFieldDataFor3D = await ensureFullEFieldData3DLoaded();
        if (!allEFieldDataFor3D || allEFieldDataFor3D.length === 0) {
            throw new Error("Dados E-field 3D (IPFS) não disponíveis após tentativa de carregamento.");
        }

        current3DCalculationId++;

        if (beamCalculationWorker3D) {
            if (statusDiv && !statusDiv.textContent.startsWith("Limite de taxa") && !statusDiv.textContent.startsWith("Falha ao buscar dados")) statusDiv.textContent = 'Calculando padrão 3D... 0%';
            beamCalculationWorker3D.postMessage({
                id: current3DCalculationId,
                antennaCoords: antennaCoords,
                elementFieldData3D: allEFieldDataFor3D,
                K_CONST: K
            });
        } else {
            console.error("Web Worker 3D não disponível.");
            if (statusDiv) statusDiv.textContent = "Erro: Web Worker 3D não suportado ou falhou ao inicializar.";
            finalizePlotProcessing(false, '3D');
        }

    } catch (error) {
        console.error("Erro ao processar solicitação do padrão de feixe 3D:", error);
        if (statusDiv && !statusDiv.textContent.includes("Erro") && !statusDiv.textContent.startsWith("Limite de taxa") && !statusDiv.textContent.startsWith("Falha ao buscar dados")) {
            statusDiv.textContent = `Erro 3D: ${error.message.substring(0, 150)}`;
        }
        if (plotDiv) {
            Plotly.purge(plotDiv);
        }
        finalizePlotProcessing(false, '3D');
    }
}


// === finalizePlotProcessing, setupWorkers, getBeamPatternModuleData, initBeamPatternControls ===
// Nenhuma alteração funcional significativa necessária nessas funções para a nova estratégia de dados,
// mas os comentários podem ser revisados se mencionarem o carregamento de dados 2D específico.
// Os logs de status já foram ajustados para não sobrescrever "Limite de taxa".

// COPIE O RESTANTE DO CÓDIGO DE beam_pattern.js A PARTIR DAQUI DA SUA VERSÃO ANTERIOR
// (finalizePlotProcessing, setupWorkers, etc.)

function finalizePlotProcessing(processedSuccessfully, plotType = '2D') {
    isProcessingPlot = false;
    if (plotType === '3D' && visualize3DBtn) {
        visualize3DBtn.disabled = false;
    }
    if (plotType === '2D') {
        if (latestPlotRequestParams && latestPlotRequestParams.timestamp === currentlyProcessingRequestTimestamp) {
            if (processedSuccessfully) {
                latestPlotRequestParams = null;
            }
        }
        currentlyProcessingRequestTimestamp = null;
        if (latestPlotRequestParams) {
            clearTimeout(processRequestTimeoutId);
            processRequestTimeoutId = setTimeout(processLatestPlotRequestIfIdle, PLOT_REQUEST_DEBOUNCE_DELAY);
        } else {
            const currentStatus = statusDiv ? statusDiv.textContent : "";
            if (statusDiv &&
                !currentStatus.startsWith("Padrão de feixe 2D para Phi") &&
                !currentStatus.startsWith("Visualização 3D") &&
                !currentStatus.includes("Worker") &&
                !currentStatus.includes("Erro") &&
                !currentStatus.includes("Carregando dados") &&
                !currentStatus.includes("Limite de taxa") && 
                !currentStatus.includes("Falha ao buscar dados") && 
                !currentStatus.includes("Analisando CSV") &&
                !currentStatus.includes("Usando Phi=")) { 
                 if (processedSuccessfully && currentStatus !== "Layout de antenas vazio. Gere um layout primeiro.") {
                    // statusDiv.textContent = "Pronto.";
                 } else if (!currentStatus.startsWith("Layout de antenas vazio")) {
                     // statusDiv.textContent = "Aguardando interação...";
                 }
            }
        }
    } else { // plotType === '3D'
        const currentStatus = statusDiv ? statusDiv.textContent : "";
        if (!processedSuccessfully && statusDiv &&
            !currentStatus.startsWith("Erro") &&
            !currentStatus.includes("Limite de taxa") && 
            !currentStatus.includes("Falha ao buscar dados") && 
            (!currentStatus.startsWith("Visualização 3D") || !currentStatus.endsWith("pronta. Interaja com controles.")) &&
            !currentStatus.includes("Worker 3D: Cálculo concluído.")) {
            statusDiv.textContent = "Falha ao gerar plot 3D. Verifique o console e tente novamente.";
        }
    }
}

function setupWorkers() {
    if (window.Worker) {
        try {
            beamCalculationWorker = new Worker('js/beam_worker.js');
            beamCalculationWorker.onmessage = function(e) {
                const { id, type, data, error } = e.data;
                if (id !== currentCalculationId) {
                    console.log(`Worker 2D: Resultado ignorado (ID ${id} não corresponde ao atual ${currentCalculationId})`);
                    return;
                }
                let plotSuccessful = false;
                if (type === 'progress') {
                    if (statusDiv && data && (!visualize3DBtn || !visualize3DBtn.disabled) && !statusDiv.textContent.startsWith("Erro") && !statusDiv.textContent.startsWith("Limite de taxa") && !statusDiv.textContent.startsWith("Falha ao buscar dados")) {
                         statusDiv.textContent = data;
                    }
                    return;
                }
                if (type === 'result') {
                    let { thetaValues, resultingMagnitude } = data;
                    const { phi: plotPhi, scale: plotScale } = storedWorkerPlotParams;
                    if (thetaValues.length > MAX_PLOT_POINTS_BEAM) {
                        if (statusDiv && !statusDiv.textContent.startsWith("Erro") && !statusDiv.textContent.startsWith("Limite de taxa")  && !statusDiv.textContent.startsWith("Falha ao buscar dados") && !statusDiv.textContent.includes("Usando Phi=")) statusDiv.textContent = `Amostrando ${thetaValues.length} pontos (2D) para ${MAX_PLOT_POINTS_BEAM}...`;
                        const downsampled = downsampleData(thetaValues, resultingMagnitude, MAX_PLOT_POINTS_BEAM);
                        thetaValues = downsampled.x; resultingMagnitude = downsampled.y;
                    }
                    plotBeamPattern2D(thetaValues, resultingMagnitude, plotPhi, plotScale); 
                    if (statusDiv && !statusDiv.textContent.startsWith("Erro") && !statusDiv.textContent.startsWith("Limite de taxa") && !statusDiv.textContent.startsWith("Falha ao buscar dados") && !statusDiv.textContent.includes("Usando Phi=")) statusDiv.textContent = `Padrão de feixe 2D para Phi=${plotPhi}° (${plotScale}) atualizado.`;
                    plotSuccessful = true;
                } else if (type === 'error') {
                    console.error("Erro do Web Worker 2D:", error);
                    if (statusDiv) statusDiv.textContent = `Erro do Worker 2D: ${String(error).substring(0,150)}`;
                    const plotDivCurrent = document.getElementById(plotDivId);
                    if(plotDivCurrent) { Plotly.purge(plotDivCurrent); plotDivCurrent.classList.remove('visible'); }
                    plotSuccessful = false;
                }
                finalizePlotProcessing(plotSuccessful, '2D');
            };
            beamCalculationWorker.onerror = function(err) {
                console.error("Erro fatal no Web Worker 2D:", err);
                if (statusDiv) statusDiv.textContent = `Erro fatal no Worker 2D: ${err.message ? err.message.substring(0,100) : 'Erro desconhecido do worker'}. Recarregue a página.`;
                finalizePlotProcessing(false, '2D');
                const plotDivCurrent = document.getElementById(plotDivId);
                if(plotDivCurrent) plotDivCurrent.classList.remove('visible');
                beamCalculationWorker = null;
            };
            console.log("Web Worker 2D para padrão de feixe inicializado.");
        } catch (e) {
            console.error("Falha ao criar Web Worker 2D:", e);
            if(statusDiv) statusDiv.textContent = "Erro: Web Worker 2D não pôde ser criado.";
            beamCalculationWorker = null;
        }
    } else {
        console.warn("Web Workers não suportados (para 2D). Plotagem de feixe pode ser lenta ou indisponível.");
        if(statusDiv) statusDiv.textContent = "Aviso: Web Workers não suportados. Cálculos podem ser lentos.";
    }

    if (window.Worker) {
        try {
            beamCalculationWorker3D = new Worker('js/beam_worker_3d.js');
            beamCalculationWorker3D.onmessage = function(e) {
                const { id, type, data, error } = e.data;
                 if (id !== current3DCalculationId) {
                    console.log(`Worker 3D: Resultado ignorado (ID ${id} não corresponde ao atual ${current3DCalculationId})`);
                    return;
                 }
                let plotSuccessful = false;
                if (type === 'progress') {
                    if (statusDiv && data && !statusDiv.textContent.startsWith("Erro") && !statusDiv.textContent.startsWith("Limite de taxa") && !statusDiv.textContent.startsWith("Falha ao buscar dados")) statusDiv.textContent = data;
                    return;
                }
                if (type === 'result3D') {
                    const { uniquePhis_deg, uniqueThetas_deg, magnitudes_grid_dB, magnitudes_grid_linear_normalized } = data;
                    plotBeamPattern3D(uniquePhis_deg, uniqueThetas_deg, magnitudes_grid_dB, magnitudes_grid_linear_normalized, stored3DScaleType);
                    plotSuccessful = true;
                } else if (type === 'error') {
                    console.error("Erro do Web Worker 3D:", error);
                    if (statusDiv) statusDiv.textContent = `Erro do Worker 3D: ${String(error).substring(0,150)}`;
                    const plotDivCurrent = document.getElementById(plotDivId);
                    if(plotDivCurrent) { Plotly.purge(plotDivCurrent); plotDivCurrent.classList.remove('visible'); }
                    plotSuccessful = false;
                }
                finalizePlotProcessing(plotSuccessful, '3D');
            };
            beamCalculationWorker3D.onerror = function(err) {
                console.error("Erro fatal no Web Worker 3D:", err);
                if (statusDiv) statusDiv.textContent = `Erro fatal no Worker 3D: ${err.message ? err.message.substring(0,100) : 'Erro desconhecido do worker'}. Recarregue a página.`;
                finalizePlotProcessing(false, '3D');
                const plotDivCurrent = document.getElementById(plotDivId);
                if(plotDivCurrent) plotDivCurrent.classList.remove('visible');
                beamCalculationWorker3D = null;
             };
            console.log("Web Worker 3D para padrão de feixe inicializado.");
        } catch (e) {
            console.error("Falha ao criar Web Worker 3D:", e);
            if(statusDiv) statusDiv.textContent = "Erro: Web Worker 3D não pôde ser criado.";
            beamCalculationWorker3D = null;
        }
    } else {
        console.warn("Web Workers não suportados (para 3D). Plotagem 3D pode ser lenta ou indisponível.");
        if(statusDiv && !statusDiv.textContent.includes("Web Workers não suportados")) {
             statusDiv.textContent = "Aviso: Web Workers não suportados. Cálculos podem ser lentos.";
        }
    }
}

function getBeamPatternModuleData() {
    return {
        parsedEFieldData3D: fullEFieldDataCache, 
        K_CONST: K,
        isEField3DLoaded: fullEFieldDataLoadingState === 'loaded' && fullEFieldDataCache !== null
    };
}

function initBeamPatternControls() {
    phiSlider = document.getElementById('beam-phi-slider');
    phiInput = document.getElementById('beam-phi-input');
    scaleRadios = document.querySelectorAll('input[name="beamScale"]');
    visualize3DBtn = document.getElementById('visualize-3d-btn');
    visualize2DBtn = document.getElementById('visualize-2d-btn');
    statusDiv = document.getElementById('beam-status');

    if (!phiSlider || !phiInput || !scaleRadios || scaleRadios.length === 0 || !statusDiv || !visualize3DBtn || !visualize2DBtn) {
        console.error("Falha na inicialização dos controles do padrão de feixe: Um ou mais elementos DOM não foram encontrados.");
        if(statusDiv) statusDiv.textContent = "Erro crítico: Controles do gráfico ausentes no DOM.";
        if(visualize2DBtn) visualize2DBtn.disabled = true;
        if(visualize3DBtn) visualize3DBtn.disabled = true;
        return;
    }

    setupWorkers();

    const trigger2DPlotUpdate = () => {
        schedulePlotUpdate();
        visualize2DBtn.classList.add('primary');
        visualize2DBtn.classList.remove('secondary');
        visualize3DBtn.classList.add('secondary');
        visualize3DBtn.classList.remove('primary');
    };

    phiSlider.addEventListener('input', () => {
        phiInput.value = phiSlider.value;
        trigger2DPlotUpdate();
    });
    phiInput.addEventListener('input', () => {
        let value = parseFloat(phiInput.value);
        if (!isNaN(value)) {
            const min = parseFloat(phiSlider.min); const max = parseFloat(phiSlider.max);
            if (value >= min && value <= max) {
                phiSlider.value = value;
            }
        }
        trigger2DPlotUpdate();
    });
    phiInput.addEventListener('change', () => {
        let value = parseFloat(phiInput.value);
        const min = parseFloat(phiSlider.min); const max = parseFloat(phiSlider.max);
        if (isNaN(value) || value < min) { value = min; }
        if (value > max) { value = max; }
        phiInput.value = value;
        phiSlider.value = value;
        trigger2DPlotUpdate();
    });

    visualize2DBtn.addEventListener('click', () => {
        trigger2DPlotUpdate();
    });

    visualize3DBtn.addEventListener('click', () => {
        process3DPlotRequest();
        visualize3DBtn.classList.add('primary');
        visualize3DBtn.classList.remove('secondary');
        visualize2DBtn.classList.add('secondary');
        visualize2DBtn.classList.remove('primary');
    });

    scaleRadios.forEach(radio => {
        radio.addEventListener('change', () => {
            if (radio.checked) {
                const plotDivCurrent = document.getElementById(plotDivId);
                const isPlotDisplayed = plotDivCurrent && plotDivCurrent.data && plotDivCurrent.data.length > 0;
                const is3DPlotCurrentlyDisplayed = isPlotDisplayed && plotDivCurrent.data[0].type === 'surface';
                if (is3DPlotCurrentlyDisplayed) {
                    process3DPlotRequest();
                } else {
                    trigger2DPlotUpdate();
                }
            }
        });
    });

    window.addEventListener('layoutGenerated', () => {
        trigger2DPlotUpdate(); 
    });

    window.addEventListener('themeChanged', () => {
        const hasAntennas = window.antennaGenerator?.getAllAntennas().length > 0;
        const plotDivCurrent = document.getElementById(plotDivId);
        const isPlotDisplayed = plotDivCurrent && plotDivCurrent.data && plotDivCurrent.data.length > 0;
        const is3DPlotDisplayed = isPlotDisplayed && plotDivCurrent.data[0].type === 'surface';
        if (is3DPlotDisplayed) {
            if (hasAntennas) {
                process3DPlotRequest();
            } else {
                 if (isPlotDisplayed) { Plotly.purge(plotDivCurrent); plotDivCurrent.classList.remove('visible');}
            }
        } else if (isPlotDisplayed && hasAntennas) {
            schedulePlotUpdate();
        } else {
            if (isPlotDisplayed) { Plotly.purge(plotDivCurrent); plotDivCurrent.classList.remove('visible');}
        }
    });

    visualize2DBtn.classList.add('primary');
    visualize2DBtn.classList.remove('secondary');
    visualize3DBtn.classList.add('secondary');
    visualize3DBtn.classList.remove('primary');

    console.log("Controles do padrão de feixe inicializados.");
    if (statusDiv) statusDiv.textContent = 'Aguardando geração do layout inicial...';
}

document.addEventListener('DOMContentLoaded', initBeamPatternControls);