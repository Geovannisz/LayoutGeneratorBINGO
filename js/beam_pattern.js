// js/beam_pattern.js

/**
 * beam_pattern.js
 *
 * Handles fetching antenna element data (from Raw GitHub User Content),
 * calculating Array Factor (AF) via Web Worker, and plotting the beam pattern.
 * Includes downsampling for large datasets.
 * Uses Plotly.js and includes options for dB/linear scale and Phi angle selection.
 */

// === Constants ===
const FREQUENCY = 1e9;
const C_LIGHT = 299792458;
const LAMBDA = C_LIGHT / FREQUENCY;
const K = (2 * Math.PI) / LAMBDA;

// --- MODIFICADO: Caminho para o CSV via Raw GitHub User Content ---
const GITHUB_USER = 'geovannisz';
const GITHUB_REPO = 'LayoutGeneratorBINGO';
const GITHUB_BRANCH = 'main'; // <<< VERIFIQUE SE ESTE É O NOME CORRETO DO SEU BRANCH PADRÃO
const CSV_FILE_PATH_IN_REPO = 'data/rE_table_vivaldi.csv';
const E_FIELD_CSV_PATH ='https://cloudflare-ipfs.com/ipfs/bafybeigdx5ssprf2wmgjbv56sfv36yawvyw6k2usorxacx63bbmtw3udvq/rE_table_vivaldi.csv';

const DEBOUNCE_DELAY = 300;
const MAX_PLOT_POINTS_BEAM = 2000;

// Cache & State
let parsedEFieldData = null;
let isFetchingData = false;
let fetchPromise = null;
let debounceTimeout = null;
let isPlotting = false;

// Web Worker
let beamCalculationWorker = null;
let currentCalculationId = 0;
let storedPlotParams = {};

// References to DOM elements
let phiSlider = null;
let phiInput = null;
let scaleRadios = null;
let plotDivId = 'beam-pattern-plot';
let statusDiv = null;

// === Debounce Function ===
function debounce(func, delay) {
    return function(...args) {
        clearTimeout(debounceTimeout);
        debounceTimeout = setTimeout(() => {
            func.apply(this, args);
        }, delay);
    };
}

// === Data Fetching and Parsing ===
async function fetchAndParseEFieldData() {
    if (parsedEFieldData) return parsedEFieldData;
    if (isFetchingData && fetchPromise) return fetchPromise;

    isFetchingData = true;
    console.log(`Fetching E-field data from Raw GitHub: ${E_FIELD_CSV_PATH}`);
    if (statusDiv) statusDiv.textContent = 'Carregando dados do elemento irradiante (CSV)...';

    fetchPromise = new Promise(async (resolve, reject) => {
        try {
            const response = await fetch(E_FIELD_CSV_PATH);
            if (!response.ok) {
                console.error(`HTTP error! Status: ${response.status} ao buscar ${E_FIELD_CSV_PATH}`);
                throw new Error(`HTTP error! Status: ${response.status} ao buscar CSV de Raw GitHub. Verifique o link/branch/caminho.`);
            }
            const csvText = await response.text();

            // Se o arquivo no repositório AINDA é um ponteiro LFS, e o raw.githubusercontent.com
            // serve esse ponteiro em vez do conteúdo LFS resolvido (o que não deveria acontecer para LFS files).
            // Esta verificação ajuda a diagnosticar se o LFS não está sendo "expandido" em nenhum nível.
            if (csvText.startsWith("version https://git-lfs.github.com/spec/v1")) {
                console.error("ERRO: O arquivo CSV baixado via link 'raw' ainda é um ponteiro Git LFS.");
                console.error("Isso sugere que o Git LFS não está sendo resolvido corretamente nem mesmo pelo raw.githubusercontent.com, ou o arquivo no branch não é o conteúdo real.");
                throw new Error("Falha ao buscar CSV: Recebido ponteiro Git LFS via link 'raw'. Verifique a configuração do LFS e o estado do arquivo no branch.");
            }

            console.log("CSV data fetched. Parsing...");
            if (statusDiv) statusDiv.textContent = 'Analisando dados do CSV...';

            const lines = csvText.trim().split('\n');
            if (lines.length < 2) throw new Error("CSV vazio ou apenas com cabeçalho.");

            const headersRaw = lines[0].split(',');
            const headers = headersRaw.map(h => h.replace(/"/g, '').trim().toLowerCase());

            const indices = {
                theta: headers.indexOf('theta [deg]'),
                phi: headers.indexOf('phi [deg]'),
                reTheta: headers.indexOf('re(retheta) [v]'),
                imTheta: headers.indexOf('im(retheta) [v]'),
                rePhi: headers.indexOf('re(rephi) [v]'),
                imPhi: headers.indexOf('im(rephi) [v]')
            };

            if (Object.values(indices).some(index => index === -1)) {
                console.error("Required columns not found. Processed headers by script (lowercase, no quotes):", headers);
                console.error("Expected (lowercase): ['theta [deg]', 'phi [deg]', 're(retheta) [v]', 'im(retheta) [v]', 're(rephi) [v]', 'im(rephi) [v]']");
                console.error("Indices found:", indices);
                throw new Error("CSV header missing one or more required columns. Check console.");
            }

            const data = [];
            for (let i = 1; i < lines.length; i++) {
                 const valuesRaw = lines[i].split(',');
                 if(valuesRaw.length !== headers.length) {
                     if(lines[i].trim() !== '') {
                        console.warn(`Skipping row ${i+1}: Expected ${headers.length} columns, found ${valuesRaw.length}. Line content: "${lines[i]}"`);
                     }
                     continue;
                 }
                 const values = valuesRaw.map(v => v.replace(/"/g, '').trim());

                try {
                    const theta = parseFloat(values[indices.theta]);
                    const phi = parseFloat(values[indices.phi]);
                    const reThetaV = parseFloat(values[indices.reTheta]);
                    const imThetaV = parseFloat(values[indices.imTheta]);
                    const rePhiV = parseFloat(values[indices.rePhi]);
                    const imPhiV = parseFloat(values[indices.imPhi]);

                    if ([theta, phi, reThetaV, imThetaV, rePhiV, imPhiV].some(isNaN)) {
                        console.warn(`Skipping row ${i+1} due to invalid numeric value after parsing. Line: "${lines[i]}"`);
                        continue;
                    }

                    const rETheta = { re: reThetaV, im: imThetaV };
                    const rEPhi = { re: rePhiV, im: imPhiV };
                    const rETotalMag = Math.sqrt(rETheta.re**2 + rETheta.im**2 + rEPhi.re**2 + rEPhi.im**2);

                    data.push({ theta, phi, rETheta, rEPhi, rETotal: rETotalMag });
                } catch (parseError) {
                    console.warn(`Error processing data in row ${i + 1}: ${lines[i]}. Error: ${parseError.message}`);
                }
            }

            if (data.length === 0 && lines.length > 1) {
                console.warn("CSV parsing resulted in an empty dataset, though file was not empty. Check data format and headers carefully.");
            }
            console.log(`Parsing complete. ${data.length} data points loaded.`);
            parsedEFieldData = data;
            isFetchingData = false;
            resolve(parsedEFieldData);
        } catch (error) {
            console.error("Error fetching/parsing E-field data from Raw GitHub:", error);
            if (statusDiv) statusDiv.textContent = `Erro ao carregar CSV: ${error.message.substring(0,100)}`;
            isFetchingData = false; fetchPromise = null; reject(error);
        }
    });
    return fetchPromise;
}

// === Downsampling Function (sem alterações) ===
function downsampleData(xData, yData, maxPoints) {
    if (xData.length <= maxPoints) {
        return { x: xData, y: yData };
    }
    const factor = Math.ceil(xData.length / maxPoints);
    const sampledX = [];
    const sampledY = [];
    for (let i = 0; i < xData.length; i += factor) {
        sampledX.push(xData[i]);
        sampledY.push(yData[i]);
    }
    if ((xData.length - 1) % factor !== 0) {
         sampledX.push(xData[xData.length - 1]);
         sampledY.push(yData[yData.length - 1]);
    }
    console.log(`Downsampled data from ${xData.length} to ${sampledX.length} points.`);
    return { x: sampledX, y: sampledY };
}

// === Plotting (sem alterações) ===
function plotBeamPattern(theta, fieldMagnitude, phiValue, scaleType) {
    console.log(`Plotting beam pattern for Phi = ${phiValue}°, Scale = ${scaleType}, Points = ${theta.length}`);
    const plotDiv = document.getElementById(plotDivId);
    if (!plotDiv) {
        console.error(`Target div "${plotDivId}" not found for plotting.`);
        return;
    }

    Plotly.purge(plotDiv);

    let yData;
    let yAxisTitle;
    const peakMagnitude = Math.max(0.0000000001, ...fieldMagnitude);

    if (scaleType === 'dB') {
        yData = fieldMagnitude.map(mag => {
            if (mag <= 0) return -100;
            const normalizedMag = mag / peakMagnitude;
            const magForDb = Math.max(normalizedMag, 1e-10);
            return 20 * Math.log10(magForDb);
        });
        yAxisTitle = 'Magnitude Normalizada (dB)';
    } else {
        yData = fieldMagnitude.map(mag => mag / peakMagnitude);
        yAxisTitle = 'Magnitude Normalizada (Linear)';
    }

    const rootStyle = getComputedStyle(document.documentElement);
    const plotBgColor = rootStyle.getPropertyValue('--plot-bg-color').trim() || '#ffffff';
    const paperBgColor = rootStyle.getPropertyValue('--card-bg-color').trim() || '#ffffff';
    const textColor = rootStyle.getPropertyValue('--text-color').trim() || '#333333';
    const gridColor = rootStyle.getPropertyValue('--plot-grid-color').trim() || '#eeeeee';
    const lineColor = rootStyle.getPropertyValue('--primary-color').trim() || '#3498db';
    const axisColor = rootStyle.getPropertyValue('--border-color').trim() || '#cccccc';

    const trace = {
        x: theta,
        y: yData,
        mode: 'lines',
        type: 'scatter',
        name: `Phi = ${phiValue}°`,
        line: { color: lineColor }
    };

    const layout = {
        title: `Padrão de Feixe (Phi = ${phiValue}°, Escala ${scaleType === 'dB' ? 'dB' : 'Linear'})`,
        xaxis: {
            title: 'Theta (graus)', gridcolor: gridColor, zerolinecolor: axisColor,
            linecolor: axisColor, tickcolor: textColor, titlefont: { color: textColor },
            tickfont: { color: textColor }, automargin: true
        },
        yaxis: {
            title: yAxisTitle, gridcolor: gridColor, zerolinecolor: axisColor,
            linecolor: axisColor, tickcolor: textColor, titlefont: { color: textColor },
            tickfont: { color: textColor }, automargin: true
        },
        plot_bgcolor: plotBgColor, paper_bgcolor: paperBgColor,
        font: { color: textColor }, showlegend: false, autosize: true
    };

    Plotly.newPlot(plotDivId, [trace], layout, {responsive: true})
        .then(() => console.log(`Plotly chart rendered: Phi = ${phiValue}°, Scale = ${scaleType}.`))
        .catch(err => console.error("Error rendering Plotly chart:", err));
}

// === Main Generation Function (Usa Web Worker - sem alterações na lógica principal) ===
async function generateBeamPatternPlot() {
    if (isPlotting && beamCalculationWorker) {
        console.log("Cálculo do padrão de feixe já em andamento no worker. Nova solicitação ignorada.");
        return;
    }
    isPlotting = true;
    console.log("Attempting to generate beam pattern plot...");

    if (!phiInput || !scaleRadios || !statusDiv) {
        console.error("Beam pattern controls not initialized properly.");
        isPlotting = false; return;
    }
    statusDiv.textContent = 'Preparando para gerar padrão de feixe...';

    try {
        if (!window.antennaGenerator?.getAllAntennas) {
            throw new Error("Antenna generator (window.antennaGenerator) not available.");
        }
        const antennaCoords = window.antennaGenerator.getAllAntennas();
        if (!antennaCoords || antennaCoords.length === 0) {
            statusDiv.textContent = 'Layout de antenas vazio. Gere um layout primeiro.';
            const plotDiv = document.getElementById(plotDivId);
            if (plotDiv) Plotly.purge(plotDiv);
            isPlotting = false; return;
        }
        console.log(`Using ${antennaCoords.length} antennas for beam pattern.`);

        const elementData = await fetchAndParseEFieldData();
        if (!elementData || elementData.length === 0) {
             throw new Error("Dados do elemento irradiante não puderam ser carregados ou estão vazios.");
        }

        const selectedPhi = parseFloat(phiInput.value);
        let selectedScale = 'dB';
        for (const radio of scaleRadios) { if (radio.checked) { selectedScale = radio.value; break; } }

        statusDiv.textContent = `Filtrando dados para Phi = ${selectedPhi}°...`;
        const filteredData = elementData.filter(point => Math.abs(point.phi - selectedPhi) < 1e-6);
        if (filteredData.length === 0) {
            throw new Error(`Dados não encontrados para Phi = ${selectedPhi}°. Verifique o CSV.`);
        }

        storedPlotParams = { phi: selectedPhi, scale: selectedScale };
        currentCalculationId++;

        if (beamCalculationWorker) {
            statusDiv.textContent = 'Enviando dados para cálculo em background (Worker)...';
            beamCalculationWorker.postMessage({
                id: currentCalculationId,
                antennaCoords,
                filteredElementData: filteredData,
                K_CONST: K,
                selectedPhiValue: selectedPhi
            });
        } else {
            console.error("Web Worker não está disponível. Não é possível calcular o padrão de feixe.");
            statusDiv.textContent = "Erro: Web Workers não suportados. Cálculo não pode ser realizado.";
            isPlotting = false;
        }

    } catch (error) {
        console.error("Erro ao preparar para gerar padrão de feixe:", error);
        statusDiv.textContent = `Erro: ${error.message.substring(0,150)}`;
        const plotDiv = document.getElementById(plotDivId);
        if (plotDiv) Plotly.purge(plotDiv);
        isPlotting = false;
    }
}

const debouncedGenerateBeamPatternPlot = debounce(generateBeamPatternPlot, DEBOUNCE_DELAY);

// === Initialization and Event Handling (sem alterações na lógica principal) ===
function initBeamPatternControls() {
    phiSlider = document.getElementById('beam-phi-slider');
    phiInput = document.getElementById('beam-phi-input');
    scaleRadios = document.querySelectorAll('input[name="beamScale"]');
    statusDiv = document.getElementById('beam-status');

    if (!phiSlider || !phiInput || !scaleRadios || scaleRadios.length === 0 || !statusDiv) {
        console.error("Beam pattern controls initialization failed: DOM elements missing.");
        if(statusDiv) statusDiv.textContent = "Erro: Controles do gráfico não encontrados.";
        return;
    }

    if (window.Worker) {
        beamCalculationWorker = new Worker('js/beam_worker.js');
        beamCalculationWorker.onmessage = function(e) {
            const { id, type, data, error } = e.data;

            if (id !== currentCalculationId) {
                console.log("Worker retornou para uma tarefa antiga/invalidada (ID: " + id + ", Esperado: " + currentCalculationId + "). Ignorando.");
                return;
            }
            if (type === 'progress') {
                if (e.data.data) {
                    statusDiv.textContent = e.data.data;
                }
                return;
            }

            isPlotting = false;

            if (type === 'result') {
                let { thetaValues, resultingMagnitude, phiValue: phiFromWorker } = data;
                const { phi: callTimePhi, scale: callTimeScale } = storedPlotParams;

                if (Math.abs(phiFromWorker - callTimePhi) > 1e-6) {
                     console.warn(`Disparidade de Phi: Worker usou ${phiFromWorker}, chamada foi para ${callTimePhi}. Usando ${callTimePhi}.`);
                }

                if (thetaValues.length > MAX_PLOT_POINTS_BEAM) {
                    statusDiv.textContent = `Amostrando ${thetaValues.length} pontos para ~${MAX_PLOT_POINTS_BEAM} para plotagem...`;
                    const downsampled = downsampleData(thetaValues, resultingMagnitude, MAX_PLOT_POINTS_BEAM);
                    thetaValues = downsampled.x;
                    resultingMagnitude = downsampled.y;
                }

                statusDiv.textContent = 'Renderizando gráfico do padrão de feixe...';
                plotBeamPattern(thetaValues, resultingMagnitude, callTimePhi, callTimeScale);
                statusDiv.textContent = `Padrão de feixe para Phi = ${callTimePhi}° atualizado (Escala: ${callTimeScale}).`;

            } else if (type === 'error') {
                console.error("Erro retornado pelo Web Worker:", error);
                statusDiv.textContent = `Erro do Worker: ${String(error).substring(0,150)}`;
                const plotDiv = document.getElementById(plotDivId);
                if (plotDiv) Plotly.purge(plotDiv);
            }
        };
        beamCalculationWorker.onerror = function(err) {
            console.error("Erro fatal no Web Worker:", err.message, err.filename, err.lineno);
            statusDiv.textContent = `Erro fatal no Worker: ${err.message.substring(0,100)}`;
            isPlotting = false;
            const plotDiv = document.getElementById(plotDivId);
            if (plotDiv) Plotly.purge(plotDiv);
            beamCalculationWorker = null;
        };
        console.log("Web Worker para cálculo do padrão de feixe inicializado.");
    } else {
        console.warn("Web Workers não são suportados neste navegador. Cálculos do padrão de feixe podem ser lentos ou indisponíveis.");
        statusDiv.textContent = "Aviso: Web Workers não suportados. Performance pode ser afetada.";
    }

    phiSlider.addEventListener('input', () => {
        phiInput.value = phiSlider.value;
        statusDiv.textContent = `Phi = ${phiSlider.value}°. Atualizando...`;
        debouncedGenerateBeamPatternPlot();
    });
    phiInput.addEventListener('input', () => {
        let value = parseFloat(phiInput.value);
        if (isNaN(value)) return;
        const min = parseFloat(phiSlider.min); const max = parseFloat(phiSlider.max);
        if (!isNaN(min)) value = Math.max(min, value); if (!isNaN(max)) value = Math.min(max, value);
        phiInput.value = value;
        phiSlider.value = value;
        statusDiv.textContent = `Phi = ${value}°. Atualizando...`;
        debouncedGenerateBeamPatternPlot();
    });
     phiInput.addEventListener('change', () => {
        let value = parseFloat(phiInput.value);
        if (isNaN(value)) { value = parseFloat(phiSlider.value); }
        const min = parseFloat(phiSlider.min); const max = parseFloat(phiSlider.max);
        if (!isNaN(min)) value = Math.max(min, value); if (!isNaN(max)) value = Math.min(max, value);
        phiInput.value = value; phiSlider.value = value;
        generateBeamPatternPlot();
     });

    scaleRadios.forEach(radio => {
        radio.addEventListener('change', () => {
            if (radio.checked) {
                 statusDiv.textContent = `Escala = ${radio.value}. Atualizando...`;
                generateBeamPatternPlot();
            }
        });
    });

    window.addEventListener('layoutGenerated', () => {
        console.log("Event 'layoutGenerated' recebido por beam_pattern.js.");
        statusDiv.textContent = 'Layout alterado. Atualizando padrão de feixe...';
        generateBeamPatternPlot();
    });

    window.addEventListener('themeChanged', () => {
        console.log('Event themeChanged recebido por beam_pattern.js');
        if (parsedEFieldData && window.antennaGenerator?.getAllAntennas().length > 0) {
            statusDiv.textContent = 'Tema alterado. Redesenhando gráfico...';
            generateBeamPatternPlot();
        } else {
            statusDiv.textContent = 'Tema alterado. Gere um layout para ver o gráfico.';
        }
    });

    console.log("Beam pattern controls initialized and event listeners set up.");
}

document.addEventListener('DOMContentLoaded', initBeamPatternControls);