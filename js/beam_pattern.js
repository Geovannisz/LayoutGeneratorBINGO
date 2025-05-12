// js/beam_pattern.js

/**
 * beam_pattern.js
 *
 * Handles fetching antenna element data PER PHI ANGLE, calculating Array Factor (AF)
 * via Web Worker, and plotting the beam pattern.
 * Manages a queue for plot requests to ensure the latest user input is processed
 * and avoids unnecessary re-plots that would reset user interactions like zoom.
 */

// === Constants ===
const FREQUENCY = 1e9;
const C_LIGHT = 299792458;
const LAMBDA = C_LIGHT / FREQUENCY;
const K = (2 * Math.PI) / LAMBDA;

const E_FIELD_CSV_BASE_PATH = 'https://raw.githubusercontent.com/Geovannisz/LayoutGeneratorBINGO/main/data/efield_phi_data/efield_phi_';
// OBSOLETO:
// const E_FIELD_CSV_PATH ='https://gateway.pinata.cloud/ipfs/bafybeigdx5ssprf2wmgjbv56sfv36yawvyw6k2usorxacx63bbmtw3udvq';
const MAX_PLOT_POINTS_BEAM = 2000;
const PLOT_REQUEST_DEBOUNCE_DELAY = 5; // Milliseconds to wait after last input before processing

// === Cache & State ===
let parsedEFieldDataCache = {};
let fetchPromisesCache = {};

let isProcessingPlot = false;
let beamCalculationWorker = null;
let currentCalculationId = 0;
let storedWorkerPlotParams = {}; // Params {phi, scale} sent to the current worker job

// Stores the parameters of the *latest* request from the user
// { antennaCoords, phi, scale, timestamp }
let latestPlotRequestParams = null;
let currentlyProcessingRequestTimestamp = null; // Timestamp of the request being processed
let processRequestTimeoutId = null;

// === DOM Element References ===
let phiSlider = null;
let phiInput = null;
let scaleRadios = null;
let plotDivId = 'beam-pattern-plot';
let statusDiv = null;

// === Helper Functions ===
function getEFieldCsvPath(phiValue) {
    const roundedPhi = Math.round(parseFloat(phiValue));
    return `${E_FIELD_CSV_BASE_PATH}${roundedPhi}.csv`;
}

// === Data Fetching and Parsing (com cache por Phi) - (sem alterações nesta função) ===
async function fetchAndParseEFieldData(phiValue) {
    const roundedPhi = Math.round(parseFloat(phiValue));
    if (parsedEFieldDataCache[roundedPhi]) {
        console.log(`Cache hit: Using E-field data for Phi = ${roundedPhi}°`);
        return parsedEFieldDataCache[roundedPhi];
    }
    if (fetchPromisesCache[roundedPhi]) {
        console.log(`Fetch in progress: Waiting for E-field data for Phi = ${roundedPhi}°`);
        return fetchPromisesCache[roundedPhi];
    }
    const csvPath = getEFieldCsvPath(roundedPhi);
    console.log(`Fetching E-field data for Phi = ${roundedPhi}° from: ${csvPath}`);
    if (statusDiv) statusDiv.textContent = `Carregando dados para Phi = ${roundedPhi}° (CSV)...`;
    fetchPromisesCache[roundedPhi] = new Promise(async (resolve, reject) => {
        try {
            const response = await fetch(csvPath);
            if (!response.ok) {
                delete fetchPromisesCache[roundedPhi];
                throw new Error(`Falha ao buscar CSV (Phi ${roundedPhi}°): ${response.status}.`);
            }
            const csvText = await response.text();
            if (csvText.startsWith("version https://git-lfs.github.com/spec/v1")) {
                delete fetchPromisesCache[roundedPhi];
                throw new Error("Falha: Recebido ponteiro Git LFS em vez de dados CSV.");
            }
            if (statusDiv) statusDiv.textContent = `Analisando CSV para Phi = ${roundedPhi}°...`;
            const lines = csvText.trim().split('\n');
            if (lines.length < 2) {
                delete fetchPromisesCache[roundedPhi];
                throw new Error(`CSV para Phi ${roundedPhi}° vazio ou só com cabeçalho.`);
            }
            const headersRaw = lines[0].split(',');
            const headers = headersRaw.map(h => h.replace(/"/g, '').trim().toLowerCase());
            const indices = {
                theta: headers.indexOf('theta [deg]'), phi: headers.indexOf('phi [deg]'),
                reTheta: headers.indexOf('re(retheta) [v]'), imTheta: headers.indexOf('im(retheta) [v]'),
                rePhi: headers.indexOf('re(rephi) [v]'), imPhi: headers.indexOf('im(rephi) [v]')
            };
            if (Object.values(indices).some(index => index === -1)) {
                delete fetchPromisesCache[roundedPhi];
                console.error("Cabeçalhos esperados não encontrados:", headers, indices);
                throw new Error(`CSV (Phi ${roundedPhi}°): Cabeçalho inválido.`);
            }
            const data = [];
            for (let i = 1; i < lines.length; i++) {
                const valuesRaw = lines[i].split(',');
                if (valuesRaw.length !== headers.length) {
                    if (lines[i].trim()) console.warn(`Phi ${roundedPhi}° CSV: Pulando linha ${i+1} (colunas ${valuesRaw.length} != ${headers.length})`);
                    continue;
                }
                const values = valuesRaw.map(v => v.replace(/"/g, '').trim());
                try {
                    const thetaVal = parseFloat(values[indices.theta]);
                    const phiVal = parseFloat(values[indices.phi]);
                    const reThetaV = parseFloat(values[indices.reTheta]);
                    const imThetaV = parseFloat(values[indices.imTheta]);
                    const rePhiV = parseFloat(values[indices.rePhi]);
                    const imPhiV = parseFloat(values[indices.imPhi]);
                    if ([thetaVal, phiVal, reThetaV, imThetaV, rePhiV, imPhiV].some(isNaN)) {
                        console.warn(`Phi ${roundedPhi}° CSV: Pulando linha ${i+1} (valor inválido).`);
                        continue;
                    }
                    data.push({
                        theta: thetaVal, phi: phiVal,
                        rETheta: { re: reThetaV, im: imThetaV },
                        rEPhi: { re: rePhiV, im: imPhiV },
                        rETotal: Math.sqrt(reThetaV**2 + imThetaV**2 + rePhiV**2 + imPhiV**2)
                    });
                } catch (parseError) {
                    console.warn(`Phi ${roundedPhi}° CSV: Erro na linha ${i+1}: ${parseError.message}`);
                }
            }
            console.log(`Phi ${roundedPhi}° CSV: ${data.length} pontos carregados.`);
            parsedEFieldDataCache[roundedPhi] = data;
            delete fetchPromisesCache[roundedPhi];
            resolve(data);
        } catch (error) {
            console.error(`Erro (fetch/parse Phi ${roundedPhi}°):`, error);
            if (statusDiv) statusDiv.textContent = `Erro CSV (Phi ${roundedPhi}°): ${error.message.substring(0,100)}`;
            delete fetchPromisesCache[roundedPhi];
            reject(error);
        }
    });
    return fetchPromisesCache[roundedPhi];
}


// === Downsampling Function (sem alterações) ===
function downsampleData(xData, yData, maxPoints) {
    if (xData.length <= maxPoints) return { x: xData, y: yData };
    const factor = Math.ceil(xData.length / maxPoints);
    const sampledX = [], sampledY = [];
    for (let i = 0; i < xData.length; i += factor) {
        sampledX.push(xData[i]); sampledY.push(yData[i]);
    }
    if ((xData.length - 1) % factor !== 0) {
         sampledX.push(xData[xData.length - 1]); sampledY.push(yData[yData.length - 1]);
    }
    console.log(`Amostragem: ${xData.length} -> ${sampledX.length} pontos.`);
    return { x: sampledX, y: sampledY };
}

// === Plotting Function ===
// MODIFICAÇÃO: Usar Plotly.react para tentar preservar o zoom/pan quando possível.
// Plotly.react atualiza o gráfico de forma mais eficiente se apenas dados ou layout mudarem.
// No entanto, se a estrutura fundamental do gráfico mudar muito, ele pode se comportar como newPlot.
function plotBeamPattern(theta, fieldMagnitude, phiValue, scaleType) {
    console.log(`Plotando (react): Phi=${phiValue}°, Escala=${scaleType}, Pontos=${theta.length}`);
    const plotDiv = document.getElementById(plotDivId);
    if (!plotDiv) { console.error(`Div "${plotDivId}" não encontrada.`); return; }

    // Não chamar Plotly.purge(plotDiv) ao usar react, a menos que queira resetar tudo.
    // Plotly.react lida com a atualização.

    const peakMagnitude = Math.max(1e-10, ...fieldMagnitude);
    let yData, yAxisTitle;

    if (scaleType === 'dB') {
        yData = fieldMagnitude.map(mag => (mag <= 0) ? -100 : 20 * Math.log10(Math.max(mag / peakMagnitude, 1e-10)));
        yAxisTitle = 'Magnitude Normalizada (dB)';
    } else {
        yData = fieldMagnitude.map(mag => mag / peakMagnitude);
        yAxisTitle = 'Magnitude Normalizada (Linear)';
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
        name: `Phi = ${phiValue}°`, line: { color: plotColors.lineColor }
    };
    const layout = {
        // Se o título muda, Plotly.react geralmente reseta o zoom.
        // Para manter o zoom, o título não deve mudar drasticamente ou ser parte de `layoutUpdates`.
        title: `Padrão de Feixe (Phi = ${phiValue}°, Escala ${scaleType === 'dB' ? 'dB' : 'Linear'})`,
        xaxis: { title: 'Theta (graus)', gridcolor: plotColors.gridColor, zerolinecolor: plotColors.axisColor, linecolor: plotColors.axisColor, tickcolor: plotColors.textColor, titlefont: { color: plotColors.textColor }, tickfont: { color: plotColors.textColor }, automargin: true },
        yaxis: { title: yAxisTitle, gridcolor: plotColors.gridColor, zerolinecolor: plotColors.axisColor, linecolor: plotColors.axisColor, tickcolor: plotColors.textColor, titlefont: { color: plotColors.textColor }, tickfont: { color: plotColors.textColor }, automargin: true },
        plot_bgcolor: plotColors.plotBgColor, paper_bgcolor: plotColors.paperBgColor,
        font: { color: plotColors.textColor }, showlegend: false, // autosize: true // `react` lida com isso
    };

    // Plotly.react é preferível para atualizações que podem preservar o estado do zoom/pan.
    Plotly.react(plotDivId, [trace], layout, {responsive: true})
        .then(() => console.log(`Gráfico Plotly (react) atualizado: Phi=${phiValue}°, Escala=${scaleType}.`))
        .catch(err => {
            console.error("Erro ao atualizar (react) Plotly, tentando newPlot:", err);
            // Fallback para newPlot se react falhar (raro, mas possível)
            Plotly.newPlot(plotDivId, [trace], layout, {responsive: true})
                .then(() => console.log(`Gráfico Plotly (newPlot fallback) renderizado.`))
                .catch(err2 => console.error("Erro fatal no Plotly (newPlot fallback):", err2));
        });
}


// === Core Logic for Handling Plot Requests ===
function schedulePlotUpdate() {
    console.log("schedulePlotUpdate: Nova solicitação de atualização do gráfico.");
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
        timestamp: Date.now() // Timestamp para identificar unicamente esta solicitação
    };

    if (statusDiv) {
        statusDiv.textContent = `Solicitação (Phi: ${currentPhi}, Ant: ${currentAntennaCoords.length}, Escala: ${currentScale}) pendente...`;
    }
    clearTimeout(processRequestTimeoutId);
    processRequestTimeoutId = setTimeout(processLatestPlotRequestIfIdle, PLOT_REQUEST_DEBOUNCE_DELAY);
}

async function processLatestPlotRequestIfIdle() {
    if (!latestPlotRequestParams) {
        console.log("processLatestPlotRequestIfIdle: Nenhuma solicitação para processar.");
        return;
    }
    if (isProcessingPlot) {
        console.log("processLatestPlotRequestIfIdle: Plotagem já em andamento. Solicitação será reavaliada.");
        return;
    }

    isProcessingPlot = true;
    // MODIFICAÇÃO: Guardar o timestamp da solicitação que está sendo processada.
    currentlyProcessingRequestTimestamp = latestPlotRequestParams.timestamp;
    const requestToProcess = { ...latestPlotRequestParams }; // Copia a solicitação

    console.log(`Iniciando processamento para solicitação timestamp: ${requestToProcess.timestamp} (Phi=${requestToProcess.phi})`);
    if (statusDiv) statusDiv.textContent = 'Preparando para gerar padrão de feixe...';

    try {
        if (!window.antennaGenerator?.getAllAntennas) {
            throw new Error("Gerador de antenas não disponível.");
        }
        const { antennaCoords, phi: selectedPhi, scale: selectedScale } = requestToProcess;

        if (!antennaCoords || antennaCoords.length === 0) {
            if (statusDiv) statusDiv.textContent = 'Layout de antenas vazio.';
            if (document.getElementById(plotDivId)) Plotly.purge(document.getElementById(plotDivId));
            finalizePlotProcessing(true); // Passa true para indicar sucesso (vazio, mas não erro)
            return;
        }

        const elementDataFull = await fetchAndParseEFieldData(selectedPhi);
        if (!elementDataFull || elementDataFull.length === 0) {
            throw new Error(`Dados do elemento para Phi=${selectedPhi}° não carregados/vazios.`);
        }

        if (statusDiv) statusDiv.textContent = `Filtrando dados para Phi = ${selectedPhi}°...`;
        const filteredElementData = elementDataFull.filter(point => Math.abs(point.phi - selectedPhi) < 1e-6);

        if (filteredElementData.length === 0) {
            console.warn(`Nenhum dado EXATO para Phi=${selectedPhi}° após filtragem.`);
            if (statusDiv) statusDiv.textContent = `Dados não encontrados para Phi=${selectedPhi}° no CSV.`;
            if (document.getElementById(plotDivId)) Plotly.purge(document.getElementById(plotDivId));
            finalizePlotProcessing(true); // Sucesso em processar, mas sem dados para plotar
            return;
        }

        storedWorkerPlotParams = { phi: selectedPhi, scale: selectedScale };
        currentCalculationId++;

        if (beamCalculationWorker) {
            if (statusDiv) statusDiv.textContent = 'Enviando dados para cálculo em background (Worker)...';
            beamCalculationWorker.postMessage({
                id: currentCalculationId,
                antennaCoords: antennaCoords,
                filteredElementData: filteredElementData,
                K_CONST: K,
                selectedPhiValue: selectedPhi
            });
            // Não chama finalizePlotProcessing aqui; será chamado no onmessage do worker
        } else {
            console.error("Web Worker não disponível.");
            if (statusDiv) statusDiv.textContent = "Erro: Web Workers não suportados.";
            finalizePlotProcessing(false); // Indicar falha no processamento
        }

    } catch (error) {
        console.error("Erro ao processar solicitação do padrão de feixe:", error);
        if (statusDiv) statusDiv.textContent = `Erro: ${error.message.substring(0,150)}`;
        if (document.getElementById(plotDivId)) Plotly.purge(document.getElementById(plotDivId));
        finalizePlotProcessing(false); // Indicar falha
    }
}

// MODIFICAÇÃO: Adicionado parâmetro `processedSuccessfully`
function finalizePlotProcessing(processedSuccessfully) {
    isProcessingPlot = false;
    console.log(`finalizePlotProcessing: Processamento da solicitação (timestamp ${currentlyProcessingRequestTimestamp}) concluído. Sucesso: ${processedSuccessfully}`);

    // Se a solicitação que acabamos de processar (identificada por currentlyProcessingRequestTimestamp)
    // AINDA é a `latestPlotRequestParams` (ou seja, o usuário não interagiu para criar uma *nova* solicitação),
    // E o processamento foi bem-sucedido, então podemos limpar `latestPlotRequestParams` para
    // evitar reprocessamento desnecessário.
    if (latestPlotRequestParams && latestPlotRequestParams.timestamp === currentlyProcessingRequestTimestamp) {
        if (processedSuccessfully) {
            console.log("finalizePlotProcessing: Solicitação atual processada com sucesso e ainda é a mais recente. Marcando como consumida.");
            latestPlotRequestParams = null; // Consome a solicitação
        } else {
            // Se não foi processado com sucesso, mantemos `latestPlotRequestParams` para que possa ser tentado novamente,
            // ou para que o usuário possa acionar uma nova tentativa alterando um parâmetro.
            console.log("finalizePlotProcessing: Solicitação atual NÃO processada com sucesso, mas ainda é a mais recente. Mantendo para possível nova tentativa.");
        }
    }

    currentlyProcessingRequestTimestamp = null; // Limpa o timestamp da solicitação processada

    // Agora, verifica se existe uma `latestPlotRequestParams` (que seria uma *nova* solicitação feita
    // enquanto a anterior estava sendo processada, ou uma que falhou e queremos tentar de novo).
    if (latestPlotRequestParams) {
        console.log(`finalizePlotProcessing: Nova solicitação (timestamp ${latestPlotRequestParams.timestamp}) detectada ou falha anterior. Reagendando processamento.`);
        clearTimeout(processRequestTimeoutId);
        processRequestTimeoutId = setTimeout(processLatestPlotRequestIfIdle, 50); // Pequeno delay
    } else {
        console.log("finalizePlotProcessing: Nenhuma nova solicitação pendente.");
        // Não limpar statusDiv se mensagem for de sucesso, para usuário ver
        if (statusDiv && !statusDiv.textContent.startsWith("Padrão de feixe para Phi")) {
            if (processedSuccessfully) { // Apenas se o último estado foi um sucesso e não há mais nada
                 // statusDiv.textContent = "Pronto."; // Ou manter a última mensagem de sucesso
            } else if (!statusDiv.textContent.startsWith("Erro")) {
                 statusDiv.textContent = "Aguardando interação...";
            }
        }
    }
}


// === Web Worker Event Handlers ===
function setupWorker() {
    if (window.Worker) {
        beamCalculationWorker = new Worker('js/beam_worker.js');
        beamCalculationWorker.onmessage = function(e) {
            const { id, type, data, error } = e.data;
            if (id !== currentCalculationId) {
                console.log(`Worker (ID ${id}) retornou para tarefa obsoleta (esperado ${currentCalculationId}). Ignorando.`);
                return; // Não finaliza, pois não é o processamento atual
            }

            let plotSuccessful = false;
            if (type === 'progress') {
                if (statusDiv && data) statusDiv.textContent = data;
                return; // Progresso não finaliza
            }

            if (type === 'result') {
                let { thetaValues, resultingMagnitude, phiValue: phiFromWorker } = data;
                const { phi: plotPhi, scale: plotScale } = storedWorkerPlotParams;
                if (Math.abs(phiFromWorker - plotPhi) > 1e-6) {
                    console.warn(`Disparidade Phi: Worker usou ${phiFromWorker}, plot usará ${plotPhi}.`);
                }
                if (thetaValues.length > MAX_PLOT_POINTS_BEAM) {
                    if (statusDiv) statusDiv.textContent = `Amostrando ${thetaValues.length} pontos...`;
                    const downsampled = downsampleData(thetaValues, resultingMagnitude, MAX_PLOT_POINTS_BEAM);
                    thetaValues = downsampled.x; resultingMagnitude = downsampled.y;
                }
                if (statusDiv) statusDiv.textContent = 'Renderizando gráfico...';
                plotBeamPattern(thetaValues, resultingMagnitude, plotPhi, plotScale);
                if (statusDiv) statusDiv.textContent = `Padrão de feixe para Phi=${plotPhi}° (${plotScale}) atualizado.`;
                plotSuccessful = true;
            } else if (type === 'error') {
                console.error("Erro do Web Worker:", error);
                if (statusDiv) statusDiv.textContent = `Erro do Worker: ${String(error).substring(0,150)}`;
                if (document.getElementById(plotDivId)) Plotly.purge(document.getElementById(plotDivId));
                plotSuccessful = false;
            }
            finalizePlotProcessing(plotSuccessful); // Sinaliza se o worker concluiu com sucesso ou erro
        };
        beamCalculationWorker.onerror = function(err) {
            console.error("Erro fatal no Web Worker:", err.message);
            if (statusDiv) statusDiv.textContent = `Erro fatal no Worker: ${err.message.substring(0,100)}`;
            finalizePlotProcessing(false); // Worker falhou, logo processamento não foi bem-sucedido
            beamCalculationWorker = null;
        };
        console.log("Web Worker para padrão de feixe inicializado.");
    } else {
        console.warn("Web Workers não suportados.");
        if (statusDiv) statusDiv.textContent = "Aviso: Web Workers não suportados.";
    }
}


// === Initialization and UI Event Listeners (sem alterações na lógica dos listeners) ===
function initBeamPatternControls() {
    phiSlider = document.getElementById('beam-phi-slider');
    phiInput = document.getElementById('beam-phi-input');
    scaleRadios = document.querySelectorAll('input[name="beamScale"]');
    statusDiv = document.getElementById('beam-status');

    if (!phiSlider || !phiInput || !scaleRadios || scaleRadios.length === 0 || !statusDiv) {
        console.error("Falha na inicialização dos controles: DOM ausente.");
        if(statusDiv) statusDiv.textContent = "Erro: Controles do gráfico não encontrados.";
        return;
    }
    setupWorker();

    phiSlider.addEventListener('input', () => {
        phiInput.value = phiSlider.value;
        if (statusDiv) statusDiv.textContent = `Phi = ${phiSlider.value}° (solicitando...)`;
        schedulePlotUpdate();
    });
    phiInput.addEventListener('input', () => {
        let value = parseFloat(phiInput.value); // Permitir digitação
        if (isNaN(value)) { // Se não for número, não faz nada no 'input', espera 'change'
             phiSlider.value = phiSlider.value; // Mantem slider onde está
        } else {
            const min = parseFloat(phiSlider.min); const max = parseFloat(phiSlider.max);
            // Não força min/max aqui para não atrapalhar digitação, 'change' fará
            phiSlider.value = Math.max(min, Math.min(max, value)); // Atualiza slider se valor for válido
        }
        if (statusDiv) statusDiv.textContent = `Phi = ${phiInput.value}° (solicitando...)`; // Usa o valor do input
        schedulePlotUpdate();
    });
    phiInput.addEventListener('change', () => {
        let value = parseFloat(phiInput.value);
        const min = parseFloat(phiSlider.min); const max = parseFloat(phiSlider.max);
        if (isNaN(value)) value = parseFloat(phiSlider.value);
        value = Math.max(min, Math.min(max, value)); // Validação final
        phiInput.value = value; phiSlider.value = value;
        if (statusDiv) statusDiv.textContent = `Phi = ${value}° (solicitando...)`;
        schedulePlotUpdate();
    });
    scaleRadios.forEach(radio => {
        radio.addEventListener('change', () => {
            if (radio.checked) {
                if (statusDiv) statusDiv.textContent = `Escala = ${radio.value} (solicitando...)`;
                schedulePlotUpdate();
            }
        });
    });
    window.addEventListener('layoutGenerated', () => {
        console.log("Evento 'layoutGenerated' recebido por beam_pattern.js.");
        if (statusDiv) statusDiv.textContent = 'Layout alterado (solicitando atualização do feixe...)';
        schedulePlotUpdate();
    });
    window.addEventListener('themeChanged', () => {
        console.log('Evento themeChanged recebido por beam_pattern.js');
        const hasAntennas = window.antennaGenerator?.getAllAntennas().length > 0;
        if (hasAntennas) {
            if (statusDiv) statusDiv.textContent = 'Tema alterado (solicitando atualização do gráfico...)';
            schedulePlotUpdate(); // Re-plotará com novas cores
        } else {
            if (statusDiv) statusDiv.textContent = 'Tema alterado. Gere um layout para ver o gráfico.';
        }
    });
    console.log("Controles do padrão de feixe inicializados.");
    if (statusDiv) statusDiv.textContent = 'Aguardando geração do layout inicial...';
}

document.addEventListener('DOMContentLoaded', initBeamPatternControls);