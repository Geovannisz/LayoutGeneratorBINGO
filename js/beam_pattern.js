/**
 * beam_pattern.js
 *
 * Handles fetching antenna element data, calculating Array Factor (AF) via Web Worker,
 * and plotting the beam pattern. Includes downsampling for large datasets.
 * Uses Plotly.js and includes options for dB/linear scale and Phi angle selection.
 * --- MODIFIED: Utiliza Web Worker para cálculos pesados (AF). ---
 * --- MODIFIED: Implementa downsampling para plotagem de grandes datasets. ---
 * --- MODIFIED: Feedback de progresso do worker. ---
 */

// === Constants ===
const FREQUENCY = 1e9;
const C_LIGHT = 299792458;
const LAMBDA = C_LIGHT / FREQUENCY;
const K = (2 * Math.PI) / LAMBDA;
const E_FIELD_CSV_PATH = 'data/rE_table_vivaldi.csv';
const DEBOUNCE_DELAY = 300;
const MAX_PLOT_POINTS_BEAM = 2000; // Máximo de pontos para enviar ao Plotly após downsampling

// Cache & State
let parsedEFieldData = null;
let isFetchingData = false;
let fetchPromise = null;
let debounceTimeout = null;
let isPlotting = false; // Flag para evitar chamadas concorrentes ao worker/plotagem

// Web Worker
let beamCalculationWorker = null;
let currentCalculationId = 0; // Para rastrear e invalidar chamadas antigas ao worker
let storedPlotParams = {}; // Para armazenar parâmetros no momento da chamada ao worker

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

// === Data Fetching and Parsing (sem grandes alterações, apenas logs) ===
async function fetchAndParseEFieldData() {
    if (parsedEFieldData) return parsedEFieldData;
    if (isFetchingData && fetchPromise) return fetchPromise;

    isFetchingData = true;
    console.log(`Fetching E-field data from: ${E_FIELD_CSV_PATH}`);
    statusDiv.textContent = 'Carregando dados do elemento irradiante (CSV)...';

    fetchPromise = new Promise(async (resolve, reject) => {
        try {
            const response = await fetch(E_FIELD_CSV_PATH);
            if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
            const csvText = await response.text();
            console.log("CSV data fetched. Parsing...");
            statusDiv.textContent = 'Analisando dados do CSV...';

            const lines = csvText.trim().split('\n');
            if (lines.length < 2) throw new Error("CSV empty or header-only.");

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
                // ... (console.error detalhado)
                throw new Error("CSV header missing one or more required columns. Check console.");
            }

            const data = [];
            for (let i = 1; i < lines.length; i++) {
                 const valuesRaw = lines[i].split(',');
                 if(valuesRaw.length !== headers.length) {
                     if(lines[i].trim() !== '') {
                        console.warn(`Skipping row ${i+1}: Expected ${headers.length} columns, found ${valuesRaw.length}. Line: "${lines[i]}"`);
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
                        console.warn(`Skipping row ${i+1} due to invalid numeric value. Line: "${lines[i]}"`);
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
                console.warn("CSV parsing resulted in an empty dataset. Check data format/headers.");
            }
            console.log(`Parsing complete. ${data.length} data points loaded.`);
            parsedEFieldData = data;
            isFetchingData = false;
            resolve(parsedEFieldData);
        } catch (error) {
            console.error("Error fetching/parsing E-field data:", error);
            statusDiv.textContent = `Erro ao carregar CSV: ${error.message.substring(0,100)}`;
            isFetchingData = false; fetchPromise = null; reject(error);
        }
    });
    return fetchPromise;
}


// === Downsampling Function ===
/**
 * Reduces the number of data points for plotting.
 * @param {Array<number>} xData Array of x-coordinates (theta).
 * @param {Array<number>} yData Array of y-coordinates (magnitude).
 * @param {number} maxPoints Maximum number of points desired.
 * @returns {Object} Object with downsampled {x, y} arrays.
 */
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
    // Ensure the last actual data point is included if not already
    if ((xData.length - 1) % factor !== 0) {
         sampledX.push(xData[xData.length - 1]);
         sampledY.push(yData[yData.length - 1]);
    }
    console.log(`Downsampled data from ${xData.length} to ${sampledX.length} points.`);
    return { x: sampledX, y: sampledY };
}


// === Plotting (sem alterações na lógica interna, apenas nos logs) ===
function plotBeamPattern(theta, fieldMagnitude, phiValue, scaleType) {
    console.log(`Plotting beam pattern for Phi = ${phiValue}°, Scale = ${scaleType}, Points = ${theta.length}`);
    const plotDiv = document.getElementById(plotDivId);
    if (!plotDiv) { /* ... */ return; }
    Plotly.purge(plotDiv);
    // ... (lógica de yData, yAxisTitle, cores e layout do Plotly permanecem) ...
    let yData;
    let yAxisTitle;
    const peakMagnitude = Math.max(0.0000000001, ...fieldMagnitude);

    if (scaleType === 'dB') {
        yData = fieldMagnitude.map(mag => {
            if (mag <= 0) return -100; // Avoid log(0) or log(negative)
            const normalizedMag = mag / peakMagnitude;
            const magForDb = Math.max(normalizedMag, 1e-10); // Clamp to a small positive number
            return 20 * Math.log10(magForDb);
        });
        yAxisTitle = 'Magnitude Normalizada (dB)';
    } else { // Linear scale
        yData = fieldMagnitude.map(mag => mag / peakMagnitude); // Normalize linear scale too
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
        x: theta, y: yData, mode: 'lines', type: 'scatter',
        name: `Phi = ${phiValue}°`, line: { color: lineColor }
    };
    const layout = {
        title: `Padrão de Feixe (Phi = ${phiValue}°, Escala ${scaleType === 'dB' ? 'dB' : 'Linear'})`,
        xaxis: { title: 'Theta (graus)', gridcolor: gridColor, zerolinecolor: axisColor, linecolor: axisColor, tickcolor: textColor, titlefont: { color: textColor }, tickfont: { color: textColor }, automargin: true },
        yaxis: { title: yAxisTitle, gridcolor: gridColor, zerolinecolor: axisColor, linecolor: axisColor, tickcolor: textColor, titlefont: { color: textColor }, tickfont: { color: textColor }, automargin: true },
        plot_bgcolor: plotBgColor, paper_bgcolor: paperBgColor,
        font: { color: textColor }, showlegend: false, autosize: true
    };

    Plotly.newPlot(plotDivId, [trace], layout, {responsive: true})
        .then(() => console.log(`Plotly chart rendered: Phi = ${phiValue}°, Scale = ${scaleType}.`))
        .catch(err => console.error("Error rendering Plotly chart:", err));
}


// === Main Generation Function (Usa Web Worker) ===
async function generateBeamPatternPlot() {
    if (isPlotting && beamCalculationWorker) { // Se um cálculo já está em andamento NO WORKER
        console.log("Cálculo do padrão de feixe já em andamento no worker. Nova solicitação ignorada.");
        // Ou, podemos invalidar a chamada anterior e iniciar uma nova
        // currentCalculationId++; // Isso faria com que a resposta anterior fosse ignorada
        // console.log("Cálculo anterior invalidado. Nova solicitação será processada.");
        // Para simplificar, a abordagem de "ignorar se ocupado" é mantida.
        return;
    }
    isPlotting = true; // Bloqueia novas chamadas
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

        // Armazena os parâmetros atuais para uso quando o worker responder
        storedPlotParams = { phi: selectedPhi, scale: selectedScale };
        currentCalculationId++; // Incrementa para esta nova tarefa

        if (beamCalculationWorker) {
            statusDiv.textContent = 'Enviando dados para cálculo em background (Worker)...';
            beamCalculationWorker.postMessage({
                id: currentCalculationId,
                antennaCoords,
                filteredElementData: filteredData,
                K_CONST: K,
                selectedPhiValue: selectedPhi // Envia o valor de Phi para o worker
                // theta_0, phi_0 podem ser adicionados se forem configuráveis
            });
        } else {
            // Fallback: Se Web Workers não são suportados (já logado em init)
            // Para este exercício, assumimos que o worker está disponível.
            // Se não, a plotagem não ocorreria ou precisaria de lógica síncrona aqui.
            console.error("Web Worker não está disponível. Não é possível calcular o padrão de feixe.");
            statusDiv.textContent = "Erro: Web Workers não suportados. Cálculo não pode ser realizado.";
            isPlotting = false; // Libera a flag
        }

    } catch (error) {
        console.error("Erro ao preparar para gerar padrão de feixe:", error);
        statusDiv.textContent = `Erro: ${error.message.substring(0,150)}`;
        const plotDiv = document.getElementById(plotDivId);
        if (plotDiv) Plotly.purge(plotDiv);
        isPlotting = false; // Libera a flag em caso de erro na preparação
    }
    // A flag isPlotting será resetada para false no handler onmessage/onerror do worker
}

const debouncedGenerateBeamPatternPlot = debounce(generateBeamPatternPlot, DEBOUNCE_DELAY);


// === Initialization and Event Handling ===
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

    // Inicializa o Web Worker
    if (window.Worker) {
        beamCalculationWorker = new Worker('js/beam_worker.js'); // Caminho para o worker
        beamCalculationWorker.onmessage = function(e) {
            const { id, type, data, error, progress } = e.data;

            if (id !== currentCalculationId) {
                console.log("Worker retornou para uma tarefa antiga/invalidada (ID: " + id + ", Esperado: " + currentCalculationId + "). Ignorando.");
                return; // Ignora resultados de tarefas antigas/canceladas
            }

            if (type === 'progress') {
                statusDiv.textContent = progress; // Atualiza com mensagem de progresso do worker
                return;
            }

            isPlotting = false; // Libera a flag após receber resultado final ou erro

            if (type === 'result') {
                let { thetaValues, resultingMagnitude, phiValue: phiFromWorker } = data;
                
                // Usa os parâmetros armazenados no momento da chamada, não os atuais da UI
                const { phi: callTimePhi, scale: callTimeScale } = storedPlotParams;

                // Consistência: usar o phi retornado pelo worker, que deve ser o mesmo que callTimePhi
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
            isPlotting = false; // Libera a flag
            const plotDiv = document.getElementById(plotDivId);
            if (plotDiv) Plotly.purge(plotDiv);
            // Considerar desabilitar funcionalidade ou notificar usuário
            beamCalculationWorker = null; // Worker está inutilizável
        };
        console.log("Web Worker para cálculo do padrão de feixe inicializado.");
    } else {
        console.warn("Web Workers não são suportados neste navegador. Cálculos do padrão de feixe podem ser lentos ou indisponíveis.");
        statusDiv.textContent = "Aviso: Web Workers não suportados. Performance pode ser afetada.";
    }

    // Event Listeners para controles da UI
    phiSlider.addEventListener('input', () => {
        phiInput.value = phiSlider.value;
        statusDiv.textContent = `Phi = ${phiSlider.value}°. Atualizando...`;
        debouncedGenerateBeamPatternPlot();
    });
    phiInput.addEventListener('input', () => { // Validação e sincronia com slider
        let value = parseFloat(phiInput.value);
        if (isNaN(value)) return; // Não gera se não for número
        const min = parseFloat(phiSlider.min); const max = parseFloat(phiSlider.max);
        if (!isNaN(min)) value = Math.max(min, value); if (!isNaN(max)) value = Math.min(max, value);
        phiInput.value = value; // Atualiza input se valor foi clamped
        phiSlider.value = value;
        statusDiv.textContent = `Phi = ${value}°. Atualizando...`;
        debouncedGenerateBeamPatternPlot();
    });
     phiInput.addEventListener('change', () => { // Garante geração ao perder foco/Enter
        let value = parseFloat(phiInput.value);
        if (isNaN(value)) { value = parseFloat(phiSlider.value); } // Reverte se inválido
        const min = parseFloat(phiSlider.min); const max = parseFloat(phiSlider.max);
        if (!isNaN(min)) value = Math.max(min, value); if (!isNaN(max)) value = Math.min(max, value);
        phiInput.value = value; phiSlider.value = value;
        // Chama diretamente, sem debounce, para garantir atualização ao finalizar edição
        generateBeamPatternPlot();
     });

    scaleRadios.forEach(radio => {
        radio.addEventListener('change', () => {
            if (radio.checked) {
                 statusDiv.textContent = `Escala = ${radio.value}. Atualizando...`;
                generateBeamPatternPlot(); // Sem debounce para mudança de escala
            }
        });
    });

    window.addEventListener('layoutGenerated', () => {
        console.log("Event 'layoutGenerated' recebido por beam_pattern.js.");
        statusDiv.textContent = 'Layout alterado. Atualizando padrão de feixe...';
        generateBeamPatternPlot(); // Sem debounce para mudança de layout
    });

    window.addEventListener('themeChanged', () => {
        console.log('Event themeChanged recebido por beam_pattern.js');
        // Só redesenha se já houver dados e um layout.
        // A função generateBeamPatternPlot já lida com buscar dados e verificar layout.
        // E o worker já terá os dados cacheados se for o caso.
        if (parsedEFieldData && window.antennaGenerator?.getAllAntennas().length > 0) {
            statusDiv.textContent = 'Tema alterado. Redesenhando gráfico...';
            generateBeamPatternPlot(); // Regera para aplicar novas cores do tema ao Plotly
        } else {
            statusDiv.textContent = 'Tema alterado. Gere um layout para ver o gráfico.';
        }
    });

    console.log("Beam pattern controls initialized and event listeners set up.");
}

document.addEventListener('DOMContentLoaded', initBeamPatternControls);