/**
 * beam_pattern.js
 *
 * Handles fetching antenna element data, calculating Array Factor (AF),
 * and plotting the beam pattern automatically when layout or plot parameters change.
 * Uses Plotly.js and includes options for dB/linear scale and Phi angle selection via slider.
 * --- MODIFIED: Removed explicit Plotly range settings for better autoscaling ---
 */

// === Constants ===
const FREQUENCY = 1e9;
const C_LIGHT = 299792458;
const LAMBDA = C_LIGHT / FREQUENCY;
const K = (2 * Math.PI) / LAMBDA;
const E_FIELD_CSV_PATH = 'data/rE_table_vivaldi.csv';
const DEBOUNCE_DELAY = 300; // Delay in ms for debouncing slider updates

// Cache & State
let parsedEFieldData = null;
let isFetchingData = false;
let fetchPromise = null;
let debounceTimeout = null; // For debouncing slider updates
let isPlotting = false; // Flag to prevent concurrent plotting calls

// References to DOM elements (initialized in initBeamPatternControls)
let phiSlider = null;
let phiInput = null;
let scaleRadios = null;
let plotDivId = 'beam-pattern-plot';
let statusDiv = null;

// === Debounce Function ===
/**
 * Basic debounce function.
 * @param {Function} func The function to debounce.
 * @param {number} delay Delay in milliseconds.
 */
function debounce(func, delay) {
    // (Implementation remains the same)
    return function(...args) {
        clearTimeout(debounceTimeout);
        debounceTimeout = setTimeout(() => {
            func.apply(this, args);
        }, delay);
    };
}


// === Data Fetching and Parsing ===
/**
 * Fetches and parses the E-field data CSV file. (Handles caching)
 * @returns {Promise<Array<Object>>} A promise that resolves with the parsed data array.
 */
async function fetchAndParseEFieldData() {
    // (Implementation remains the same)
    if (parsedEFieldData) return parsedEFieldData;
    if (isFetchingData && fetchPromise) return fetchPromise;

    isFetchingData = true;
    console.log(`Fetching E-field data from: ${E_FIELD_CSV_PATH}`);

    fetchPromise = new Promise(async (resolve, reject) => {
        try {
            const response = await fetch(E_FIELD_CSV_PATH);
            if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
            const csvText = await response.text();
            console.log("CSV data fetched. Parsing...");

            const lines = csvText.trim().split('\n');
            if (lines.length < 2) throw new Error("CSV empty.");

            const headersRaw = lines[0].split(',');
            const headers = headersRaw.map(h => h.replace(/"/g, '').trim().toLowerCase());

            const indices = {
                theta: headers.indexOf('theta [deg]'),
                phi: headers.indexOf('phi [deg]'),
                reTheta: headers.indexOf('re(retheta) [mv]'),
                imTheta: headers.indexOf('im(retheta) [mv]'),
                rePhi: headers.indexOf('re(rephi) [mv]'),
                imPhi: headers.indexOf('im(rephi) [mv]'),
            };

            if (Object.values(indices).some(index => index === -1)) {
                console.error("Required columns not found. Processed headers:", headers);
                throw new Error("CSV header missing columns. Check console.");
            }

            const data = [];
            for (let i = 1; i < lines.length; i++) {
                 const valuesRaw = lines[i].split(',');
                 if(valuesRaw.length !== headers.length) {
                     if(lines[i].trim() !== '') {
                        console.warn(`Skipping row ${i+1}: Expected ${headers.length} columns, found ${valuesRaw.length}.`);
                     }
                     continue;
                 }
                 const values = valuesRaw.map(v => v.replace(/"/g, '').trim());

                try {
                    const theta = parseFloat(values[indices.theta]);
                    const phi = parseFloat(values[indices.phi]);
                    const reThetaV = parseFloat(values[indices.reTheta]) * 1e-3;
                    const imThetaV = parseFloat(values[indices.imTheta]) * 1e-3;
                    const rePhiV = parseFloat(values[indices.rePhi]) * 1e-3;
                    const imPhiV = parseFloat(values[indices.imPhi]) * 1e-3;

                    if ([theta, phi, reThetaV, imThetaV, rePhiV, imPhiV].some(isNaN)) continue;

                    const rETheta = { re: reThetaV, im: imThetaV };
                    const rEPhi = { re: rePhiV, im: imPhiV };
                    const rETotalMag = Math.sqrt(rETheta.re**2 + rETheta.im**2 + rEPhi.re**2 + rEPhi.im**2);

                    data.push({ theta, phi, rETheta, rEPhi, rETotal: rETotalMag });
                } catch (parseError) {
                    console.warn(`Error parsing row ${i + 1}: ${lines[i]}. Error: ${parseError.message}`);
                }
            }

            console.log(`Parsing complete. ${data.length} data points loaded.`);
            parsedEFieldData = data;
            isFetchingData = false;
            resolve(parsedEFieldData);
        } catch (error) {
            console.error("Error fetching/parsing E-field data:", error);
            isFetchingData = false; fetchPromise = null; reject(error);
        }
    });
    return fetchPromise;
}

// === Array Factor (AF) Calculation ===
/**
 * Calculates the complex Array Factor (AF).
 * @returns {Array<Object>} Array of complex AF values {re, im}.
 */
function computeAF(theta, phi, antennaCoords, k, theta_0 = 0, phi_0 = 0) {
    // (Implementation remains the same)
     console.log(`Computing AF for ${antennaCoords.length} antennas...`);
     if (theta.length !== phi.length) throw new Error("Theta/Phi length mismatch.");
     if (antennaCoords.length === 0) return Array(theta.length).fill({ re: 1, im: 0 });

     const numAntennas = antennaCoords.length;
     const numPoints = theta.length;
     const af_complex = Array(numPoints).fill(null).map(() => ({ re: 0, im: 0 }));
     const theta_0_rad = theta_0 * (Math.PI / 180);
     const phi_0_rad = phi_0 * (Math.PI / 180);
     const scanVecX = Math.sin(theta_0_rad) * Math.cos(phi_0_rad);
     const scanVecY = Math.sin(theta_0_rad) * Math.sin(phi_0_rad);
     const antX = antennaCoords.map(c => Number(c[0]));
     const antY = antennaCoords.map(c => Number(c[1]));

     for (let i = 0; i < numPoints; i++) {
         const theta_rad = theta[i] * (Math.PI / 180);
         const phi_rad = phi[i] * (Math.PI / 180);
         const obsVecX = Math.sin(theta_rad) * Math.cos(phi_rad);
         const obsVecY = Math.sin(theta_rad) * Math.sin(phi_rad);
         const diffX = obsVecX - scanVecX;
         const diffY = obsVecY - scanVecY;
         let sumRe = 0; let sumIm = 0;
         for (let j = 0; j < numAntennas; j++) {
             const phase = k * (diffX * antX[j] + diffY * antY[j]);
             sumRe += Math.cos(phase);
             sumIm += Math.sin(phase);
         }
         af_complex[i] = { re: sumRe, im: sumIm };
     }
     console.log("AF computation finished.");
     return af_complex;
}

// === Applying AF to Field Data ===
/**
 * Multiplies the single element's complex E-field by the complex Array Factor.
 * @returns {Array<Object>} Resulting complex E-field array with magnitude.
 */
function applyAF(elementFieldData, afComplex) {
    // (Implementation remains the same)
     console.log("Applying AF to element field data...");
     if (elementFieldData.length !== afComplex.length) throw new Error("Field/AF length mismatch.");

     const resultingField = [];
     for (let i = 0; i < elementFieldData.length; i++) {
         const element = elementFieldData[i];
         const af = afComplex[i];
         const rEThetaTotal_re = element.rETheta.re * af.re - element.rETheta.im * af.im;
         const rEThetaTotal_im = element.rETheta.re * af.im + element.rETheta.im * af.re;
         const rEPhiTotal_re = element.rEPhi.re * af.re - element.rEPhi.im * af.im;
         const rEPhiTotal_im = element.rEPhi.re * af.im + element.rEPhi.im * af.re;
         const rEThetaTotal = { re: rEThetaTotal_re, im: rEThetaTotal_im };
         const rEPhiTotal = { re: rEPhiTotal_re, im: rEPhiTotal_im };
         const rETotalMagnitude = Math.sqrt(rEThetaTotal_re**2 + rEThetaTotal_im**2 + rEPhiTotal_re**2 + rEPhiTotal_im**2);
         resultingField.push({
             theta: element.theta, phi: element.phi,
             rEThetaTotal, rEPhiTotal, rETotalMagnitude
         });
     }
     console.log("AF application finished.");
     return resultingField;
}


// === Plotting ===
/**
 * Plots the beam pattern using Plotly.js, allowing for dB or linear scale.
 * Uses Plotly's default autoscaling.
 */
function plotBeamPattern(theta, fieldMagnitude, phiValue, scaleType) {
    console.log(`Plotting beam pattern for Phi = ${phiValue}°, Scale = ${scaleType}`);
    const plotDiv = document.getElementById(plotDivId);
    if (!plotDiv) {
        console.error(`Target div "${plotDivId}" not found for plotting.`);
        return;
    }

    Plotly.purge(plotDiv); // Clear previous plot

    let yData;
    let yAxisTitle;
    const peakMagnitude = Math.max(...fieldMagnitude); // Find peak for normalization

    if (scaleType === 'dB') {
        // Calculate normalized dB values
        yData = fieldMagnitude.map(mag => {
            if (mag <= 0 || peakMagnitude <= 0) return -100; // Assign a low dB value
            const normalizedMag = mag / peakMagnitude;
            const magForDb = Math.max(normalizedMag, 1e-10); // Prevent log10(0)
            return 20 * Math.log10(magForDb);
        });
        yAxisTitle = 'Magnitude Normalizada (dB)';
        // Let Plotly autoscale, but you could suggest a range if needed
        // yAxisRange = [-60, 0];
    } else { // Linear scale
        yData = fieldMagnitude; // Use raw magnitude
        yAxisTitle = 'Magnitude (Linear)';
        // Let Plotly autoscale
        // yAxisRange = [0, peakMagnitude > 0 ? peakMagnitude * 1.1 : 1];
    }

    const trace = {
        x: theta,
        y: yData,
        mode: 'lines',
        type: 'scatter',
        name: `Phi = ${phiValue}°`,
        line: {
            color: '#8be9fd' // Dracula cyan
        }
    };

    // Define layout using Dracula theme colors
    const layout = {
        title: `Padrão de Feixe (Phi = ${phiValue}°, Escala ${scaleType === 'dB' ? 'dB' : 'Linear'})`,
        xaxis: {
            title: 'Theta (graus)',
            gridcolor: '#44475a',
            zerolinecolor: '#6272a4',
            linecolor: '#6272a4',
            tickcolor: '#f8f8f2',
            titlefont: { color: '#f8f8f2' },
            tickfont: { color: '#f8f8f2' },
            // <<<--- REMOVED: Let Plotly autoscale or set dynamically if needed --- >>>
            // range: [-90, 90]
             automargin: true // Helps prevent title/labels being cut off
        },
        yaxis: {
            title: yAxisTitle, // Dynamic title based on scale
            gridcolor: '#44475a',
            zerolinecolor: '#6272a4',
            linecolor: '#6272a4',
            tickcolor: '#f8f8f2',
            titlefont: { color: '#f8f8f2' },
            tickfont: { color: '#f8f8f2' },
            // <<<--- REMOVED: Let Plotly autoscale --- >>>
            // range: yAxisRange
            automargin: true // Helps prevent title/labels being cut off
        },
        plot_bgcolor: '#282a36',
        paper_bgcolor: '#282a36',
        font: {
            color: '#f8f8f2'
        },
        showlegend: false, // Only one trace
        // <<<--- REMOVED: Let Plotly handle resizing/redrawing --- >>>
        // uirevision: 'true'
        autosize: true // Ensure plot tries to fill container
    };

    // Use Plotly.react for potentially smoother updates if layout changes often
    // Plotly.newPlot is generally fine here too.
    Plotly.newPlot(plotDivId, [trace], layout, {responsive: true}) // Ensure responsive flag is set
        .then(() => console.log(`Plotly chart rendered: Phi = ${phiValue}°, Scale = ${scaleType}.`))
        .catch(err => console.error("Error rendering Plotly chart:", err));
}


// === Main Generation Function ===
/**
 * Orchestrates the beam pattern generation and plotting process.
 */
async function generateBeamPatternPlot() {
    // (Implementation remains the same)
    if (isPlotting) { console.log("Plotting busy."); return; }
    isPlotting = true;
    console.log("Attempting to generate beam pattern plot...");

    if (!phiInput || !scaleRadios || !statusDiv) { // Check phiInput instead of phiSlider
        console.error("Beam pattern controls not initialized."); isPlotting = false; return;
    }

    statusDiv.textContent = 'Atualizando padrão de feixe...';

    try {
        if (!window.antennaGenerator?.getAllAntennas) throw new Error("Generator missing.");
        const antennaCoords = window.antennaGenerator.getAllAntennas();
        if (!antennaCoords || antennaCoords.length === 0) throw new Error("Layout vazio.");
        console.log(`Using ${antennaCoords.length} antennas.`);

        statusDiv.textContent = 'Carregando dados...';
        const elementData = await fetchAndParseEFieldData();

        const selectedPhi = parseFloat(phiInput.value);
        let selectedScale = 'dB';
        for (const radio of scaleRadios) { if (radio.checked) { selectedScale = radio.value; break; } }
        statusDiv.textContent = `Filtrando Phi = ${selectedPhi}°...`;

        const filteredData = elementData.filter(point => Math.abs(point.phi - selectedPhi) < 1e-6);
        if (filteredData.length === 0) throw new Error(`Dados não encontrados para Phi = ${selectedPhi}°.`);
        const thetaValues = filteredData.map(point => point.theta);
        const phiValues = Array(thetaValues.length).fill(selectedPhi);

        statusDiv.textContent = 'Calculando AF...';
        const afComplex = computeAF(thetaValues, phiValues, antennaCoords, K);

        statusDiv.textContent = 'Aplicando AF...';
        const resultingField = applyAF(filteredData, afComplex);
        const resultingMagnitude = resultingField.map(point => point.rETotalMagnitude);

        statusDiv.textContent = 'Renderizando gráfico...';
        plotBeamPattern(thetaValues, resultingMagnitude, selectedPhi, selectedScale); // Pass correct theta

        statusDiv.textContent = `Padrão para Phi = ${selectedPhi}° atualizado (Escala ${selectedScale}).`;

    } catch (error) {
        console.error("Error generating beam pattern:", error);
        statusDiv.textContent = `Erro: ${error.message}`;
        const plotDiv = document.getElementById(plotDivId);
        if (plotDiv) Plotly.purge(plotDiv);
    } finally {
        isPlotting = false;
    }
}

// Debounced version for sliders
const debouncedGenerateBeamPatternPlot = debounce(generateBeamPatternPlot, DEBOUNCE_DELAY);


// === Initialization and Event Handling ===
/**
 * Initializes the controls and sets up event listeners for automatic updates.
 */
function initBeamPatternControls() {
    // (Initialization remains the same - assigns elements to module vars)
    phiSlider = document.getElementById('beam-phi-slider');
    phiInput = document.getElementById('beam-phi-input');
    scaleRadios = document.querySelectorAll('input[name="beamScale"]');
    statusDiv = document.getElementById('beam-status');

    if (!phiSlider || !phiInput || !scaleRadios || scaleRadios.length === 0 || !statusDiv) {
        console.error("Beam pattern controls init failed: Elements missing.");
        return;
    }

    // --- Event Listeners ---
    phiSlider.addEventListener('input', () => {
        phiInput.value = phiSlider.value;
        statusDiv.textContent = `Phi = ${phiSlider.value}°. Atualizando...`; // More concise status
        debouncedGenerateBeamPatternPlot();
    });
    phiInput.addEventListener('input', () => {
        let value = parseFloat(phiInput.value);
        if (isNaN(value)) return;
        value = Math.max(0, Math.min(90, value));
        phiInput.value = value;
        phiSlider.value = value;
        statusDiv.textContent = `Phi = ${value}°. Atualizando...`;
        debouncedGenerateBeamPatternPlot();
    });
     phiInput.addEventListener('change', () => {
        let value = parseFloat(phiInput.value);
        if (isNaN(value)) value = parseFloat(phiSlider.value);
        value = Math.max(0, Math.min(90, value));
        phiInput.value = value;
        phiSlider.value = value;
        // Call directly here as well in case 'input' didn't fire or finished debouncing early
        generateBeamPatternPlot();
     });

    scaleRadios.forEach(radio => {
        radio.addEventListener('change', () => {
            if (radio.checked) {
                 statusDiv.textContent = `Escala = ${radio.value}. Atualizando...`;
                generateBeamPatternPlot(); // Update immediately
            }
        });
    });

    window.addEventListener('layoutGenerated', () => {
        console.log("Event 'layoutGenerated' received.");
        statusDiv.textContent = 'Layout alterado. Atualizando gráfico...';
        generateBeamPatternPlot(); // Update immediately
    });

    console.log("Beam pattern controls initialized.");
}

// Initialize controls when the DOM is ready
document.addEventListener('DOMContentLoaded', initBeamPatternControls);