// js/beam_pattern.js

/**
 * beam_pattern.js
 *
 * Handles fetching antenna element data PER PHI ANGLE, calculating Array Factor (AF)
 * via Web Worker, and plotting the beam pattern.
 * Manages a queue for plot requests to ensure the latest user input is processed.
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
const PLOT_REQUEST_DEBOUNCE_DELAY = 350; // Milliseconds to wait after last input before processing

// === Cache & State ===
let parsedEFieldDataCache = {}; // Stores parsed CSV data, e.g., { 0: dataForPhi0, ... }
let fetchPromisesCache = {};    // Stores active fetch promises, e.g., { 0: promiseForPhi0, ... }

let isProcessingPlot = false;    // True if a plot request is currently being processed (fetch, worker, plot)
let beamCalculationWorker = null;
let currentCalculationId = 0;    // To invalidate outdated worker results
let storedWorkerPlotParams = {}; // Params {phi, scale} sent to the current worker job

// Stores the parameters of the *latest* request from the user
// This object will contain { antennaCoords, phi, scale, timestamp }
let latestPlotRequestParams = null;
let processRequestTimeoutId = null; // ID for the setTimeout that schedules processing

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

// === Data Fetching and Parsing (com cache por Phi) ===
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

// === Plotting Function (sem alterações) ===
function plotBeamPattern(theta, fieldMagnitude, phiValue, scaleType) {
    console.log(`Plotando: Phi=${phiValue}°, Escala=${scaleType}, Pontos=${theta.length}`);
    const plotDiv = document.getElementById(plotDivId);
    if (!plotDiv) { console.error(`Div "${plotDivId}" não encontrada.`); return; }
    Plotly.purge(plotDiv);
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
        title: `Padrão de Feixe (Phi = ${phiValue}°, Escala ${scaleType === 'dB' ? 'dB' : 'Linear'})`,
        xaxis: { title: 'Theta (graus)', gridcolor: plotColors.gridColor, zerolinecolor: plotColors.axisColor, linecolor: plotColors.axisColor, tickcolor: plotColors.textColor, titlefont: { color: plotColors.textColor }, tickfont: { color: plotColors.textColor }, automargin: true },
        yaxis: { title: yAxisTitle, gridcolor: plotColors.gridColor, zerolinecolor: plotColors.axisColor, linecolor: plotColors.axisColor, tickcolor: plotColors.textColor, titlefont: { color: plotColors.textColor }, tickfont: { color: plotColors.textColor }, automargin: true },
        plot_bgcolor: plotColors.plotBgColor, paper_bgcolor: plotColors.paperBgColor,
        font: { color: plotColors.textColor }, showlegend: false, autosize: true
    };
    Plotly.newPlot(plotDivId, [trace], layout, {responsive: true})
        .then(() => console.log(`Gráfico Plotly renderizado: Phi=${phiValue}°, Escala=${scaleType}.`))
        .catch(err => console.error("Erro ao renderizar Plotly:", err));
}

// === Core Logic for Handling Plot Requests ===

/**
 * Called by UI event listeners when a plot update is needed.
 * It captures the current state of inputs and schedules processing.
 */
function schedulePlotUpdate() {
    console.log("schedulePlotUpdate: Nova solicitação de atualização do gráfico.");

    // Captura o estado atual dos parâmetros relevantes
    const currentAntennaCoords = window.antennaGenerator ? window.antennaGenerator.getAllAntennas() : [];
    const currentPhi = phiInput ? parseFloat(phiInput.value) : 90; // Default Phi if input not ready
    let currentScale = 'dB';
    if (scaleRadios) {
        for (const radio of scaleRadios) { if (radio.checked) { currentScale = radio.value; break; } }
    }

    // Atualiza os parâmetros da "última solicitação conhecida"
    latestPlotRequestParams = {
        antennaCoords: currentAntennaCoords,
        phi: currentPhi,
        scale: currentScale,
        timestamp: Date.now() // Para depuração
    };

    if (statusDiv) {
        statusDiv.textContent = `Solicitação (Phi: ${currentPhi}, Ant: ${currentAntennaCoords.length}, Escala: ${currentScale}) pendente...`;
    }

    // Agenda o processamento (com debounce)
    clearTimeout(processRequestTimeoutId);
    processRequestTimeoutId = setTimeout(processLatestPlotRequestIfIdle, PLOT_REQUEST_DEBOUNCE_DELAY);
}

/**
 * Processes the `latestPlotRequestParams` if the system is not already busy.
 * This is the target of the debounced setTimeout.
 */
async function processLatestPlotRequestIfIdle() {
    if (!latestPlotRequestParams) {
        console.log("processLatestPlotRequestIfIdle: Nenhuma solicitação para processar.");
        return;
    }

    if (isProcessingPlot) {
        console.log("processLatestPlotRequestIfIdle: Plotagem já em andamento. A solicitação mais recente será reavaliada ao final da atual.");
        // A finalização da plotagem atual (em `finalizePlotProcessing`) verificará `latestPlotRequestParams`.
        return;
    }

    isProcessingPlot = true; // Marcar como ocupado ANTES de operações assíncronas

    // Pega uma cópia da solicitação mais recente para processar e limpa o original
    // para que novas interações do usuário criem um novo `latestPlotRequestParams`.
    const requestToProcess = { ...latestPlotRequestParams };
    // latestPlotRequestParams = null; // Não limpar ainda, finalizePlotProcessing pode precisar dele

    console.log(`Iniciando processamento para: Phi=${requestToProcess.phi}, Antenas=${requestToProcess.antennaCoords.length}, Escala=${requestToProcess.scale}`);
    if (statusDiv) statusDiv.textContent = 'Preparando para gerar padrão de feixe...';

    try {
        // Validação dos parâmetros da solicitação
        if (!window.antennaGenerator?.getAllAntennas) {
            throw new Error("Gerador de antenas (window.antennaGenerator) não disponível.");
        }
        const { antennaCoords, phi: selectedPhi, scale: selectedScale } = requestToProcess;

        if (!antennaCoords || antennaCoords.length === 0) {
            if (statusDiv) statusDiv.textContent = 'Layout de antenas vazio. Gere um layout primeiro.';
            if (document.getElementById(plotDivId)) Plotly.purge(document.getElementById(plotDivId));
            finalizePlotProcessing(); // Libera e verifica por novas solicitações
            return;
        }

        // Fetch e parse dos dados do elemento (específico para o Phi)
        const elementDataFull = await fetchAndParseEFieldData(selectedPhi);
        if (!elementDataFull || elementDataFull.length === 0) {
            throw new Error(`Dados do elemento para Phi=${selectedPhi}° não carregados ou vazios.`);
        }

        // Filtragem final para garantir exatidão do Phi (mesmo que o arquivo seja específico)
        if (statusDiv) statusDiv.textContent = `Filtrando dados para Phi = ${selectedPhi}°...`;
        const filteredElementData = elementDataFull.filter(point => Math.abs(point.phi - selectedPhi) < 1e-6);

        if (filteredElementData.length === 0) {
            console.warn(`Nenhum dado EXATO para Phi=${selectedPhi}° após filtragem final.`);
            if (statusDiv) statusDiv.textContent = `Dados não encontrados para Phi=${selectedPhi}° no CSV.`;
            if (document.getElementById(plotDivId)) Plotly.purge(document.getElementById(plotDivId));
            finalizePlotProcessing();
            return;
        }

        // Parâmetros para o worker e para a plotagem final
        storedWorkerPlotParams = { phi: selectedPhi, scale: selectedScale };
        currentCalculationId++; // Invalida cálculos anteriores do worker

        if (beamCalculationWorker) {
            if (statusDiv) statusDiv.textContent = 'Enviando dados para cálculo em background (Worker)...';
            beamCalculationWorker.postMessage({
                id: currentCalculationId,
                antennaCoords: antennaCoords,       // Coordenadas da solicitação atual
                filteredElementData: filteredElementData,
                K_CONST: K,
                selectedPhiValue: selectedPhi  // Phi da solicitação atual
            });
        } else {
            console.error("Web Worker não disponível.");
            if (statusDiv) statusDiv.textContent = "Erro: Web Workers não suportados.";
            finalizePlotProcessing(); // Libera mesmo se o worker não estiver disponível
        }

    } catch (error) {
        console.error("Erro ao processar solicitação do padrão de feixe:", error);
        if (statusDiv) statusDiv.textContent = `Erro: ${error.message.substring(0,150)}`;
        if (document.getElementById(plotDivId)) Plotly.purge(document.getElementById(plotDivId));
        finalizePlotProcessing(); // Libera em caso de erro
    }
}

/**
 * Chamado ao final de uma tentativa de plotagem (após resultado do worker, ou erro).
 * Libera o estado `isProcessingPlot` e verifica se uma nova solicitação (`latestPlotRequestParams`)
 * foi feita enquanto a anterior estava processando.
 */
function finalizePlotProcessing() {
    isProcessingPlot = false;
    console.log("finalizePlotProcessing: Processamento anterior concluído.");

    // Verifica se `latestPlotRequestParams` foi atualizado *desde que* `requestToProcess` foi copiado.
    // Se `latestPlotRequestParams` ainda existe e é diferente (ex: timestamp) daquele que acabou de ser processado,
    // ou se simplesmente existe, significa que o usuário interagiu novamente.
    if (latestPlotRequestParams) {
        console.log("finalizePlotProcessing: Nova solicitação de usuário detectada. Reagendando processamento.");
        // Limpa qualquer timeout antigo para garantir que estamos usando o mais recente.
        clearTimeout(processRequestTimeoutId);
        // Agenda o processamento da solicitação mais recente (que está em latestPlotRequestParams).
        // Um pequeno delay para permitir que o navegador "respire" antes de iniciar outra tarefa potencialmente pesada.
        processRequestTimeoutId = setTimeout(processLatestPlotRequestIfIdle, 50);
    } else {
        console.log("finalizePlotProcessing: Nenhuma nova solicitação pendente.");
        // Opcional: Limpar statusDiv se tudo correu bem e não há mais nada pendente
        // if (statusDiv && statusDiv.textContent.startsWith("Padrão de feixe para Phi")) {
        //    // Mantém mensagem de sucesso
        // } else if (statusDiv) {
        //    statusDiv.textContent = "Aguardando interação...";
        // }
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
                // Não chama finalizePlotProcessing aqui, pois este worker era para uma tarefa antiga.
                // A tarefa atual (se houver) ainda está com isProcessingPlot = true.
                return;
            }

            // Se a mensagem é para o cálculo atual:
            if (type === 'progress') {
                if (statusDiv && data) statusDiv.textContent = data;
                return;
            }

            // Resultado ou Erro do Worker para a tarefa ATUAL
            if (type === 'result') {
                let { thetaValues, resultingMagnitude, phiValue: phiFromWorker } = data;
                // Usa os parâmetros armazenados no momento do ENVIO para o worker para consistência na plotagem
                const { phi: plotPhi, scale: plotScale } = storedWorkerPlotParams;

                if (Math.abs(phiFromWorker - plotPhi) > 1e-6) {
                    console.warn(`Disparidade Phi: Worker usou ${phiFromWorker}, plot usará ${plotPhi}.`);
                }

                if (thetaValues.length > MAX_PLOT_POINTS_BEAM) {
                    if (statusDiv) statusDiv.textContent = `Amostrando ${thetaValues.length} pontos para plotagem...`;
                    const downsampled = downsampleData(thetaValues, resultingMagnitude, MAX_PLOT_POINTS_BEAM);
                    thetaValues = downsampled.x;
                    resultingMagnitude = downsampled.y;
                }

                if (statusDiv) statusDiv.textContent = 'Renderizando gráfico...';
                plotBeamPattern(thetaValues, resultingMagnitude, plotPhi, plotScale);
                if (statusDiv) statusDiv.textContent = `Padrão de feixe para Phi=${plotPhi}° (${plotScale}) atualizado.`;

            } else if (type === 'error') {
                console.error("Erro do Web Worker:", error);
                if (statusDiv) statusDiv.textContent = `Erro do Worker: ${String(error).substring(0,150)}`;
                if (document.getElementById(plotDivId)) Plotly.purge(document.getElementById(plotDivId));
            }
            finalizePlotProcessing(); // Importante: Chamado após resultado ou erro do worker ATUAL
        };

        beamCalculationWorker.onerror = function(err) {
            console.error("Erro fatal no Web Worker:", err.message, err.filename, err.lineno);
            if (statusDiv) statusDiv.textContent = `Erro fatal no Worker: ${err.message.substring(0,100)}`;
            // Se o worker falhar catastroficamente, a plotagem atual não será concluída.
            finalizePlotProcessing(); // Libera o estado de processamento.
            beamCalculationWorker = null; // O worker pode estar em um estado irrecuperável.
        };
        console.log("Web Worker para padrão de feixe inicializado.");
    } else {
        console.warn("Web Workers não suportados. Performance afetada.");
        if (statusDiv) statusDiv.textContent = "Aviso: Web Workers não suportados.";
    }
}


// === Initialization and UI Event Listeners ===
function initBeamPatternControls() {
    phiSlider = document.getElementById('beam-phi-slider');
    phiInput = document.getElementById('beam-phi-input');
    scaleRadios = document.querySelectorAll('input[name="beamScale"]');
    statusDiv = document.getElementById('beam-status');

    if (!phiSlider || !phiInput || !scaleRadios || scaleRadios.length === 0 || !statusDiv) {
        console.error("Falha na inicialização dos controles do padrão de feixe: DOM ausente.");
        if(statusDiv) statusDiv.textContent = "Erro: Controles do gráfico não encontrados.";
        return;
    }

    setupWorker(); // Configura o Web Worker

    // --- Event Listeners para os controles do usuário ---
    // Todos agora chamam schedulePlotUpdate()

    phiSlider.addEventListener('input', () => {
        phiInput.value = phiSlider.value;
        if (statusDiv) statusDiv.textContent = `Phi = ${phiSlider.value}° (solicitando...)`;
        schedulePlotUpdate();
    });

    phiInput.addEventListener('input', () => { // Para digitação direta
        let value = parseFloat(phiInput.value);
        if (isNaN(value)) return; // Ignora se não for número
        const min = parseFloat(phiSlider.min); const max = parseFloat(phiSlider.max);
        if (!isNaN(min)) value = Math.max(min, value);
        if (!isNaN(max)) value = Math.min(max, value);
        // Não atualiza phiInput.value aqui para permitir digitação livre, 'change' fará a validação final.
        phiSlider.value = value; // Sincroniza slider com o valor (mesmo que temporário)
        if (statusDiv) statusDiv.textContent = `Phi = ${value}° (solicitando...)`;
        schedulePlotUpdate();
    });

    phiInput.addEventListener('change', () => { // Ao perder foco ou Enter
        let value = parseFloat(phiInput.value);
        const min = parseFloat(phiSlider.min); const max = parseFloat(phiSlider.max);
        if (isNaN(value)) value = parseFloat(phiSlider.value); // Reverte se inválido
        if (!isNaN(min)) value = Math.max(min, value);
        if (!isNaN(max)) value = Math.min(max, value);
        phiInput.value = value; // Define valor validado
        phiSlider.value = value; // Sincroniza slider
        if (statusDiv) statusDiv.textContent = `Phi = ${value}° (solicitando...)`;
        schedulePlotUpdate(); // Agenda a atualização com o valor final
    });

    scaleRadios.forEach(radio => {
        radio.addEventListener('change', () => {
            if (radio.checked) {
                if (statusDiv) statusDiv.textContent = `Escala = ${radio.value} (solicitando...)`;
                schedulePlotUpdate();
            }
        });
    });

    // Listener para quando o layout das antenas é alterado
    window.addEventListener('layoutGenerated', () => {
        console.log("Evento 'layoutGenerated' recebido por beam_pattern.js.");
        if (statusDiv) statusDiv.textContent = 'Layout alterado (solicitando atualização do feixe...)';
        schedulePlotUpdate();
    });

    // Listener para quando o tema da página é alterado (para redesenhar o gráfico)
    window.addEventListener('themeChanged', () => {
        console.log('Evento themeChanged recebido por beam_pattern.js');
        const hasAntennas = window.antennaGenerator?.getAllAntennas().length > 0;
        // Para redesenhar o gráfico com o novo tema, precisamos de dados.
        // Se houver dados cacheados para o Phi atual, podemos usá-los.
        // A chamada a schedulePlotUpdate fará o fetch se necessário e depois plotará com novas cores.
        if (hasAntennas) {
            if (statusDiv) statusDiv.textContent = 'Tema alterado (solicitando atualização do gráfico...)';
            schedulePlotUpdate();
        } else {
            if (statusDiv) statusDiv.textContent = 'Tema alterado. Gere um layout para ver o gráfico.';
        }
    });

    console.log("Controles do padrão de feixe inicializados. Eventos chamam schedulePlotUpdate().");
    if (statusDiv) statusDiv.textContent = 'Aguardando geração do layout inicial...';
    // A primeira chamada a `schedulePlotUpdate` ocorrerá via evento 'layoutGenerated' do main.js
}

document.addEventListener('DOMContentLoaded', initBeamPatternControls);