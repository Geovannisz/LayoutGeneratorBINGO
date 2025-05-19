/**
 * psf_analysis_worker.js
 *
 * Web Worker para realizar a análise da Point Spread Function (PSF) do arranjo de antenas.
 * Calcula a área total sob a PSF, a área dentro de um cone para SLL (Side Lobe Level),
 * e o ângulo Theta que contém uma determinada porcentagem de energia (Encircled Energy - EE).
 *
 * A PSF aqui é considerada como a intensidade do campo elétrico |E_total|^2 ou a magnitude |E_total|.
 * Os cálculos são feitos integrando sobre o primeiro quadrante (Theta: 0-90, Phi: 0-90)
 * e multiplicando por 4, assumindo simetria.
 */

// --- Constantes e Configurações ---
const USE_INTENSITY_FOR_PSF = true; // true para |E_total|^2, false para |E_total|
                                    // Esta constante permite fácil alteração futura.
// NOTE: This constant's value is determined when the worker script is initially loaded.
// Changes require reloading the worker script (e.g., hard refresh or service worker update).
// The cache key below helps ensure the cache is correct for the *current* value of this constant.


const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

// --- Funções Auxiliares de Cálculo ---

/**
 * Calcula o Array Factor (AF) complexo para um único ponto (theta_deg, phi_deg).
 * @param {number} theta_deg Ângulo theta em graus.
 * @param {number} phi_deg Ângulo phi em graus.
 * @param {Array<Array<number>>} antennaCoords Coordenadas [x,y] das antenas (metros).
 * @param {number} k Constante do número de onda (2*PI/lambda).
 * @returns {{re: number, im: number}} Componentes real e imaginário do AF.
 */
function computeAFForPoint(theta_deg, phi_deg, antennaCoords, k) {
    if (!antennaCoords || antennaCoords.length === 0) {
        return { re: 1.0, im: 0.0 }; // AF = 1 si pas d'antennes (ou une au centre).
    }
    const theta_rad = theta_deg * DEG_TO_RAD;
    const phi_rad = phi_deg * DEG_TO_RAD;

    const scanVecX = 0; // Math.sin(0) * Math.cos(0) (Zenith)
    const scanVecY = 0; // Math.sin(0) * Math.sin(0) (Zenith)

    const obsVecX = Math.sin(theta_rad) * Math.cos(phi_rad);
    const obsVecY = Math.sin(theta_rad) * Math.sin(phi_rad);

    const k_diffX = k * (obsVecX - scanVecX);
    const k_diffY = k * (obsVecY - scanVecY);

    let sumRe = 0.0;
    let sumIm = 0.0;
    for (let j = 0; j < antennaCoords.length; j++) {
        const antX = antennaCoords[j][0];
        const antY = antennaCoords[j][1];
        const phase = k_diffX * antX + k_diffY * antY;
        sumRe += Math.cos(phase);
        sumIm += Math.sin(phase);
    }
    return { re: sumRe, im: sumIm };
}

/**
 * Calcula o valor da PSF (intensidade |E_total|^2 ou magnitude |E_total|) para um ponto.
 * Uses the global USE_INTENSITY_FOR_PSF constant.
 * @param {{phi_deg: number, theta_deg: number, rEPhi: {re: number, im: number}, rETheta: {re: number, im: number}}} elementFieldData Ponto de dados do campo do elemento.
 * @param {{re: number, im: number}} af_complex Array Factor complexo para este ponto.
 * @returns {number} Valor da PSF.
 */
function calculatePSFValue(elementFieldData, af_complex) {
    // Complex multiplication: E_total = E_element * AF
    // E_theta_total = E_theta_element * AF
    const rEThetaTotal_re = elementFieldData.rETheta.re * af_complex.re - elementFieldData.rETheta.im * af_complex.im;
    const rEThetaTotal_im = elementFieldData.rETheta.re * af_complex.im + elementFieldData.rETheta.im * af_complex.re;
    // E_phi_total = E_phi_element * AF
    const rEPhiTotal_re = elementFieldData.rEPhi.re * af_complex.re - elementFieldData.rEPhi.im * af_complex.im;
    const rEPhiTotal_im = elementFieldData.rEPhi.re * af_complex.im + elementFieldData.rEPhi.im * af_complex.re;

    // Squared magnitude of the total field (proportional to intensity/power)
    const magSquared_E_total = (rEThetaTotal_re * rEThetaTotal_re + rEThetaTotal_im * rEThetaTotal_im) +
                               (rEPhiTotal_re * rEPhiTotal_re + rEPhiTotal_im * rEPhiTotal_im);

    if (USE_INTENSITY_FOR_PSF) {
        return magSquared_E_total; // Returns |E_total|^2
    } else {
        return Math.sqrt(magSquared_E_total); // Returns |E_total|
    }
}

/**
 * Realiza a integração numérica 2D da PSF sobre uma grade (theta, phi) usando a regra do trapézio.
 * A integração é feita no primeiro quadrante (theta 0-90, phi 0-90).
 * dA = PSF(theta, phi) * sin(theta) dtheta dphi
 * @param {Array<number>} uniqueThetas Array de valores únicos de Theta em graus (0 a 90), sorted.
 * @param {Array<number>} uniquePhis Array de valores únicos de Phi em graus (0 a 90), sorted.
 * @param {Map<string, number>} psfGrid Mapa contendo os valores da PSF, chave "theta_phi".
 * @param {number} [thetaLimit_deg=90] Limite superior de Theta para integração (usado para SLL e EE).
 * @returns {number} Resultado da integral (área sob a PSF no primeiro quadrante, dentro do thetaLimit).
 */
function integratePSF(uniqueThetas, uniquePhis, psfGrid, thetaLimit_deg = 90) {
    let integralSum = 0;

    // Assume uniqueThetas and uniquePhis are already sorted by getOrCalculatePsfGrid
    const sortedThetas = uniqueThetas; // Using passed sorted arrays
    const sortedPhis = uniquePhis;

    const thetaLimitRad = thetaLimit_deg * DEG_TO_RAD; // Convert limit once

    // Find the index in sortedThetas just below or equal to thetaLimit_deg
    // We only need to iterate up to this index for the outer loop.
    let maxThetaIndex = sortedThetas.length - 1;
     for (let i = 0; i < sortedThetas.length; i++) {
        if (sortedThetas[i] > thetaLimit_deg + 1e-9) { // Add tolerance for float comparison
            maxThetaIndex = i - 1;
            break;
        }
     }
     // Ensure maxThetaIndex is valid
     maxThetaIndex = Math.min(maxThetaIndex, sortedThetas.length - 2); // Need at least two points for a trapezoid

    for (let i = 0; i <= maxThetaIndex; i++) {
        const theta1_deg = sortedThetas[i];
        const theta2_deg = sortedThetas[i+1]; // This will be <= thetaLimit_deg or the next point

        // The integration uses the values *at* theta1 and theta2.
        // No need to check theta1 >= thetaLimit_deg due to maxThetaIndex limit.
        // The area element naturally accounts for the limit if it falls between two points.
        // We are integrating up to thetaLimit_deg, so use the actual theta points from the grid.

        const dTheta_rad = (theta2_deg - theta1_deg) * DEG_TO_RAD; // Use actual grid step

        for (let j = 0; j < sortedPhis.length - 1; j++) {
            const phi1_deg = sortedPhis[j];
            const phi2_deg = sortedPhis[j+1];
            const dPhi_rad = (phi2_deg - phi1_deg) * DEG_TO_RAD;

            // Values of the PSF at the four corners of the grid cell
            const f_th1_ph1 = psfGrid.get(`${theta1_deg}_${phi1_deg}`) || 0;
            const f_th1_ph2 = psfGrid.get(`${theta1_deg}_${phi2_deg}`) || 0;
            const f_th2_ph1 = psfGrid.get(`${theta2_deg}_${phi1_deg}`) || 0;
            const f_th2_ph2 = psfGrid.get(`${theta2_deg}_${phi2_deg}`) || 0;

            // Element of area dA = f(theta, phi) * sin(theta) dtheta dphi
            // Average value of f(theta, phi) * sin(theta) over the cell corners.
            // (f_th1_ph1*sin(T1) + f_th1_ph2*sin(T1) + f_th2_ph1*sin(T2) + f_th2_ph2*sin(T2)) / 4
            // Multiplied by dTheta * dPhi.
            const avg_psf_sin_theta = (
                (f_th1_ph1 * Math.sin(theta1_deg * DEG_TO_RAD)) +
                (f_th1_ph2 * Math.sin(theta1_deg * DEG_TO_RAD)) +
                (f_th2_ph1 * Math.sin(theta2_deg * DEG_TO_RAD)) +
                (f_th2_ph2 * Math.sin(theta2_deg * DEG_TO_RAD))
            ) / 4.0;

            integralSum += avg_psf_sin_theta * dTheta_rad * dPhi_rad;
        }
    }

    // Handle the potential partial slice at thetaLimit_deg if it falls between grid points
    // This is more complex for 2D integration (requires interpolating the entire slice).
    // A simpler approach for grid data is to find the index *just below* the limit
    // and the index *just above* the limit, and if needed, do a linear interpolation
    // based on the *cumulative* area up to those points.
    // The current loop already integrates up to sortedThetas[maxThetaIndex+1].
    // If thetaLimit_deg falls *between* sortedThetas[maxThetaIndex] and sortedThetas[maxThetaIndex+1],
    // the area from sortedThetas[maxThetaIndex] to thetaLimit_deg needs to be added.
    // This requires knowing the cumulative area up to sortedThetas[maxThetaIndex] and sortedThetas[maxThetaIndex+1].
    // Let's refactor EE calculation slightly to handle this interpolation outside integratePSF.

    // For SLL and Total Area (where thetaLimit_deg is 90 or specific grid point), this loop-based approach is fine.
    // For EE (where thetaLimit_deg is the *result* of interpolation), this function will be called *with* that interpolated limit.
    // Let's refine the EE calculation logic to use this function correctly.

    return integralSum; // Area in the first quadrant up to the grid point <= thetaLimit_deg
}

// --- Cache para a Grade PSF Calculada ---
let calculatedPsfGridCache = null; // Format: Map<string, number> where key is "theta_phi"
let uniqueThetasCache = null; // Stored sorted
let uniquePhisCache = null;   // Stored sorted
let lastAntennaCoordsSignature = null; // To invalidate cache if array changes
// ADDED: Cache key must now also include the PSF calculation method
let lastPsfCalculationMethod = null; // 'intensity' or 'magnitude'

/**
 * Generates (or retrieves from cache) the PSF value grid for the first quadrant.
 * Cache is invalidated if antennaCoords or the PSF calculation method (|E| vs |E|^2) changes.
 * @param {Array<Array<number>>} antennaCoords Antenna coordinates.
 * @param {Array<Object>} elementFieldData3D Full element field data.
 * @param {number} K Wave number constant.
 * @param {string} taskId Task ID for progress messages.
 * @returns {{psfGrid: Map<string, number>, uniqueThetas: Array<number>, uniquePhis: Array<number>}}
 */
function getOrCalculatePsfGrid(antennaCoords, elementFieldData3D, K, taskId) {
    const currentAntennaCoordsSignature = antennaCoords.length + "_" + (antennaCoords[0] ? antennaCoords[0].join(',') : "empty");
    // Get the current calculation method for the cache key
    const currentPsfCalculationMethod = USE_INTENSITY_FOR_PSF ? 'intensity' : 'magnitude';

    // Check if cache is valid
    if (calculatedPsfGridCache &&
        uniqueThetasCache &&
        uniquePhisCache &&
        lastAntennaCoordsSignature === currentAntennaCoordsSignature &&
        lastPsfCalculationMethod === currentPsfCalculationMethod) // ADDED: Check the calculation method
    {
        self.postMessage({ type: 'progress', id: taskId, data: `Worker PSF: Usando grade PSF do cache (${currentPsfCalculationMethod}).` });
        return { psfGrid: calculatedPsfGridCache, uniqueThetas: uniqueThetasCache, uniquePhis: uniquePhisCache };
    }

    self.postMessage({ type: 'progress', id: taskId, data: `Worker PSF: Calculando grade PSF (${currentPsfCalculationMethod}) (0%)...` });

    const psfGrid = new Map();
    const tempUniqueThetas = new Set();
    const tempUniquePhis = new Set();

    // Filter element data for the first quadrant (Theta: 0-90, Phi: 0-90)
    const firstQuadrantData = elementFieldData3D.filter(p =>
        p.theta_deg >= 0 && p.theta_deg <= 90 &&
        p.phi_deg >= 0 && p.phi_deg <= 90
    );

    if (firstQuadrantData.length === 0) {
        throw new Error("Nenhum dado do elemento encontrado para o primeiro quadrante (Theta 0-90, Phi 0-90).");
    }

    const totalPointsToProcess = firstQuadrantData.length;
    let pointsProcessed = 0;
    let lastReportedProgress = 0;

    firstQuadrantData.forEach(elementPoint => {
        const af_c = computeAFForPoint(elementPoint.theta_deg, elementPoint.phi_deg, antennaCoords, K);
        const psfVal = calculatePSFValue(elementPoint, af_c); // calculatePSFValue uses USE_INTENSITY_FOR_PSF

        psfGrid.set(`${elementPoint.theta_deg}_${elementPoint.phi_deg}`, psfVal);
        tempUniqueThetas.add(elementPoint.theta_deg);
        tempUniquePhis.add(elementPoint.phi_deg);

        pointsProcessed++;
        const progress = Math.round((pointsProcessed / totalPointsToProcess) * 100);
        if (progress > lastReportedProgress && progress % 10 === 0) { // Report every 10%
            self.postMessage({ type: 'progress', id: taskId, data: `Worker PSF: Calculando grade PSF (${currentPsfCalculationMethod}) (${progress}%)...` });
            lastReportedProgress = progress;
        }
    });

    // Sort unique thetas and phis for integration
    uniqueThetasCache = Array.from(tempUniqueThetas).sort((a, b) => a - b);
    uniquePhisCache = Array.from(tempUniquePhis).sort((a, b) => a - b);

    // Store the newly calculated cache and its signature
    calculatedPsfGridCache = psfGrid;
    lastAntennaCoordsSignature = currentAntennaCoordsSignature;
    lastPsfCalculationMethod = currentPsfCalculationMethod; // ADDED: Store the method used

    self.postMessage({ type: 'progress', id: taskId, data: `Worker PSF: Grade PSF calculada (${currentPsfCalculationMethod}) (100%).` });
    return { psfGrid: calculatedPsfGridCache, uniqueThetas: uniqueThetasCache, uniquePhis: uniquePhisCache };
}


// --- Manipulador de Mensagens da Thread Principal ---
self.onmessage = function(e) {
    const {
        id: taskId,
        command,
        antennaCoords,
        elementFieldData3D,
        K_CONST,
        sllThetaDeg,
        eePercentage
    } = e.data;

    try {
        if (!elementFieldData3D || elementFieldData3D.length === 0) {
            throw new Error("Dados do elemento 3D não fornecidos ou vazios.");
        }

        // Get or calculate the PSF grid. The cache handles if antennaCoords or USE_INTENSITY_FOR_PSF changed.
        const { psfGrid, uniqueThetas, uniquePhis } = getOrCalculatePsfGrid(antennaCoords, elementFieldData3D, K_CONST, taskId);

        if (command === 'calculateTotalArea') {
            self.postMessage({ type: 'progress', id: taskId, data: 'Worker PSF: Integrando área total...' });
            const areaFirstQuadrant = integratePSF(uniqueThetas, uniquePhis, psfGrid, 90);
            const totalArea = areaFirstQuadrant * 4.0; // Multiply by 4 for symmetry
            self.postMessage({
                id: taskId,
                type: 'resultTotalArea',
                data: { totalArea: totalArea }
            });
        }
        else if (command === 'calculateSLL') {
            if (typeof sllThetaDeg !== 'number' || sllThetaDeg <= 0 || sllThetaDeg > 90) {
                throw new Error("Ângulo Theta inválido para SLL.");
            }
            self.postMessage({ type: 'progress', id: taskId, data: `Worker PSF: Integrando área do cone (SLL, Θ=${sllThetaDeg}°)...` });
            // Calculate the area up to the SLL theta limit
            const coneAreaFirstQuadrant = integratePSF(uniqueThetas, uniquePhis, psfGrid, sllThetaDeg);
            const totalConeArea = coneAreaFirstQuadrant * 4.0;

            self.postMessage({
                id: taskId,
                type: 'resultSLL',
                data: { coneArea: totalConeArea, sllThetaDeg: sllThetaDeg }
            });
        }
        else if (command === 'calculateEE') {
            if (typeof eePercentage !== 'number' || eePercentage <= 0 || eePercentage >= 100) {
                throw new Error("Porcentagem inválida para EE.");
            }
            self.postMessage({ type: 'progress', id: taskId, data: `Worker PSF: Calculando Θ para EE (${eePercentage}%)...` });

            // Calculate the full total area in the first quadrant first
            const totalAreaFirstQuadrantFull = integratePSF(uniqueThetas, uniquePhis, psfGrid, 90);
            const actualTotalPSFArea = totalAreaFirstQuadrantFull * 4.0;

            if (actualTotalPSFArea <= 1e-12) {
                self.postMessage({
                    id: taskId,
                    type: 'resultEE',
                    data: { thetaEE: 0, fractionalArea: 0, eePercentage: eePercentage, error: "Área total da PSF é próxima de zero." }
                });
                return;
            }

            const targetAreaOverall = actualTotalPSFArea * (eePercentage / 100.0);
            const targetAreaFirstQuadrant = targetAreaOverall / 4.0;

            let thetaEE_deg = 0;
            let accumulatedAreaFirstQuadrant = 0;
            // uniqueThetas is already sorted by getOrCalculatePsfGrid

            // If the target area is zero or negative (shouldn't happen with EE% > 0), thetaEE is 0.
            if (targetAreaFirstQuadrant <= 1e-12) {
                thetaEE_deg = 0;
            } else {
                // Find the angle by iterating through theta points
                for (let i = 0; i < uniqueThetas.length - 1; i++) {
                    const theta_i = uniqueThetas[i];
                    const theta_j = uniqueThetas[i+1];

                    // Calculate cumulative area up to theta_j (this includes the area up to theta_i + the slice area)
                    // Re-calculate cumulative area up to each point explicitly to be sure.
                     const areaUpTo_j = integratePSF(uniqueThetas, uniquePhis, psfGrid, theta_j);
                     const areaUpTo_i = integratePSF(uniqueThetas, uniquePhis, psfGrid, theta_i); // Will be 0 for the first point if theta_i=0

                    if (areaUpTo_j >= targetAreaFirstQuadrant) {
                        // Target area is in the slice between theta_i and theta_j (or exactly at theta_j)
                        const sliceArea = areaUpTo_j - areaUpTo_i;
                        const remainingAreaNeededInSlice = targetAreaFirstQuadrant - areaUpTo_i; // How much area is needed *after* theta_i

                        if (sliceArea > 1e-12) { // Avoid division by zero for flat sections
                            // Linear interpolation: theta_EE is between theta_i and theta_j
                            thetaEE_deg = theta_i + (theta_j - theta_i) * (remainingAreaNeededInSlice / sliceArea);
                        } else {
                             // Slice area is zero, but target is within/beyond it. Take the upper bound.
                             thetaEE_deg = theta_j; // This case should ideally not happen if areaUpTo_j >= targetArea and sliceArea is zero.
                        }

                         // Ensure thetaEE_deg is within the bounds of the interval [theta_i, theta_j]
                         thetaEE_deg = Math.min(thetaEE_deg, theta_j);
                         thetaEE_deg = Math.max(thetaEE_deg, theta_i);

                        break; // Found the thetaEE_deg
                    }
                    // If target area is not reached yet, continue to the next slice.
                    // accumulatedAreaFirstQuadrant = areaUpTo_j; // This isn't needed due to the break
                    thetaEE_deg = theta_j; // If loop finishes, the last theta_j is the angle (up to 90)
                }
            }

            // Ensure final thetaEE_deg is within [0, 90] bounds
            thetaEE_deg = Math.min(thetaEE_deg, 90.0);
            thetaEE_deg = Math.max(thetaEE_deg, 0.0);

            // Recalculate the exact area obtained with the found thetaEE_deg for the "Intermediate Value" field.
            const finalConeAreaFirstQuadrant = integratePSF(uniqueThetas, uniquePhis, psfGrid, thetaEE_deg);
            const finalFractionalArea = finalConeAreaFirstQuadrant * 4.0;

            self.postMessage({
                id: taskId,
                type: 'resultEE',
                data: { thetaEE: thetaEE_deg, fractionalArea: finalFractionalArea, eePercentage: eePercentage }
            });
        }
        else {
            throw new Error(`Comando desconhecido: ${command}`);
        }

    } catch (error) {
        console.error("Erro no Worker PSF:", error);
        self.postMessage({ id: taskId, type: 'error', error: error.message });
    }
};