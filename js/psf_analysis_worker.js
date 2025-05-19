/**
 * psf_analysis_worker.js
 *
 * Web Worker para realizar a análise da Point Spread Function (PSF) do arranjo de antenas.
 * Calcula o volume total sob a PSF, o volume dentro de um cone para SLL (Side Lobe Level),
 * o ângulo Theta que contém uma determinada porcentagem de energia (Encircled Energy - EE),
 * e o ângulo Theta_pico (estimativa da largura do pico principal buscando o primeiro mínimo significativo).
 *
 * A PSF aqui é considerada como a intensidade do campo elétrico |E_total|^2 ou a magnitude |E_total|.
 * Os cálculos são feitos integrando sobre o primeiro quadrante (Theta: 0-90, Phi: 0-90)
 * e multiplicando por 4, assumindo simetria.
 */

// --- Constantes e Configurações ---
const USE_INTENSITY_FOR_PSF = true;
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
        return { re: 1.0, im: 0.0 };
    }
    const theta_rad = theta_deg * DEG_TO_RAD;
    const phi_rad = phi_deg * DEG_TO_RAD;
    const scanVecX = 0;
    const scanVecY = 0;
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
 * @param {{phi_deg: number, theta_deg: number, rEPhi: {re: number, im: number}, rETheta: {re: number, im: number}}} elementFieldData Ponto de dados do campo do elemento.
 * @param {{re: number, im: number}} af_complex Array Factor complexo para este ponto.
 * @returns {number} Valor da PSF.
 */
function calculatePSFValue(elementFieldData, af_complex) {
    const rEThetaTotal_re = elementFieldData.rETheta.re * af_complex.re - elementFieldData.rETheta.im * af_complex.im;
    const rEThetaTotal_im = elementFieldData.rETheta.re * af_complex.im + elementFieldData.rETheta.im * af_complex.re;
    const rEPhiTotal_re = elementFieldData.rEPhi.re * af_complex.re - elementFieldData.rEPhi.im * af_complex.im;
    const rEPhiTotal_im = elementFieldData.rEPhi.re * af_complex.im + elementFieldData.rEPhi.im * af_complex.re;
    const magSquared_E_total = (rEThetaTotal_re * rEThetaTotal_re + rEThetaTotal_im * rEThetaTotal_im) +
                               (rEPhiTotal_re * rEPhiTotal_re + rEPhiTotal_im * rEPhiTotal_im);
    if (USE_INTENSITY_FOR_PSF) {
        return magSquared_E_total;
    } else {
        return Math.sqrt(magSquared_E_total);
    }
}

/**
 * Realiza a integração numérica 2D da PSF sobre uma grade (theta, phi) usando a regra do trapézio.
 * A integração é feita no primeiro quadrante (theta 0-90, phi 0-90).
 * dV = PSF(theta, phi) * sin(theta) dtheta dphi  (V de Volume)
 * @param {Array<number>} uniqueThetas Array de valores únicos de Theta em graus (0 a 90), sorted.
 * @param {Array<number>} uniquePhis Array de valores únicos de Phi em graus (0 a 90), sorted.
 * @param {Map<string, number>} psfGrid Mapa contendo os valores da PSF, chave "theta_phi".
 * @param {number} [thetaLimit_deg=90] Limite superior de Theta para integração.
 * @returns {number} Resultado da integral (volume sob a PSF no primeiro quadrante, dentro do thetaLimit).
 */
function integratePSF(uniqueThetas, uniquePhis, psfGrid, thetaLimit_deg = 90) {
    let volumeSum = 0;
    const sortedThetas = uniqueThetas;
    const sortedPhis = uniquePhis;

    let maxThetaIndex = sortedThetas.length - 1;
     for (let i = 0; i < sortedThetas.length; i++) {
        if (sortedThetas[i] > thetaLimit_deg + 1e-9) {
            maxThetaIndex = i - 1;
            break;
        }
     }
     maxThetaIndex = Math.min(maxThetaIndex, sortedThetas.length - 2);

    for (let i = 0; i <= maxThetaIndex; i++) {
        const theta1_deg = sortedThetas[i];
        const theta2_deg = sortedThetas[i+1];
        const dTheta_rad = (theta2_deg - theta1_deg) * DEG_TO_RAD;

        for (let j = 0; j < sortedPhis.length - 1; j++) {
            const phi1_deg = sortedPhis[j];
            const phi2_deg = sortedPhis[j+1];
            const dPhi_rad = (phi2_deg - phi1_deg) * DEG_TO_RAD;

            const f_th1_ph1 = psfGrid.get(`${theta1_deg}_${phi1_deg}`) || 0;
            const f_th1_ph2 = psfGrid.get(`${theta1_deg}_${phi2_deg}`) || 0;
            const f_th2_ph1 = psfGrid.get(`${theta2_deg}_${phi1_deg}`) || 0;
            const f_th2_ph2 = psfGrid.get(`${theta2_deg}_${phi2_deg}`) || 0;

            const avg_psf_sin_theta = (
                (f_th1_ph1 * Math.sin(theta1_deg * DEG_TO_RAD)) +
                (f_th1_ph2 * Math.sin(theta1_deg * DEG_TO_RAD)) +
                (f_th2_ph1 * Math.sin(theta2_deg * DEG_TO_RAD)) +
                (f_th2_ph2 * Math.sin(theta2_deg * DEG_TO_RAD))
            ) / 4.0;
            volumeSum += avg_psf_sin_theta * dTheta_rad * dPhi_rad;
        }
    }
    return volumeSum;
}

// --- Cache para a Grade PSF Calculada ---
let calculatedPsfGridCache = null;
let uniqueThetasCache = null;
let uniquePhisCache = null;
let lastAntennaCoordsSignature = null;
let lastPsfCalculationMethod = null;

/**
 * Generates (or retrieves from cache) the PSF value grid for the first quadrant.
 * @param {Array<Array<number>>} antennaCoords Antenna coordinates.
 * @param {Array<Object>} elementFieldData3D Full element field data.
 * @param {number} K Wave number constant.
 * @param {string} taskId Task ID for progress messages.
 * @returns {{psfGrid: Map<string, number>, uniqueThetas: Array<number>, uniquePhis: Array<number>}}
 */
function getOrCalculatePsfGrid(antennaCoords, elementFieldData3D, K, taskId) {
    const currentAntennaCoordsSignature = antennaCoords.length + "_" + (antennaCoords[0] ? antennaCoords[0].join(',') : "empty");
    const currentPsfCalculationMethod = USE_INTENSITY_FOR_PSF ? 'intensity' : 'magnitude';

    if (calculatedPsfGridCache &&
        uniqueThetasCache &&
        uniquePhisCache &&
        lastAntennaCoordsSignature === currentAntennaCoordsSignature &&
        lastPsfCalculationMethod === currentPsfCalculationMethod)
    {
        self.postMessage({ type: 'progress', id: taskId, data: `Worker PSF: Usando grade PSF do cache (${currentPsfCalculationMethod}).` });
        return { psfGrid: calculatedPsfGridCache, uniqueThetas: uniqueThetasCache, uniquePhis: uniquePhisCache };
    }

    self.postMessage({ type: 'progress', id: taskId, data: `Worker PSF: Calculando grade PSF (${currentPsfCalculationMethod}) (0%)...` });

    const psfGrid = new Map();
    const tempUniqueThetas = new Set();
    const tempUniquePhis = new Set();

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
        const psfVal = calculatePSFValue(elementPoint, af_c);

        psfGrid.set(`${elementPoint.theta_deg}_${elementPoint.phi_deg}`, psfVal);
        tempUniqueThetas.add(elementPoint.theta_deg);
        tempUniquePhis.add(elementPoint.phi_deg);

        pointsProcessed++;
        const progress = Math.round((pointsProcessed / totalPointsToProcess) * 100);
        if (progress > lastReportedProgress && progress % 10 === 0) {
            self.postMessage({ type: 'progress', id: taskId, data: `Worker PSF: Calculando grade PSF (${currentPsfCalculationMethod}) (${progress}%)...` });
            lastReportedProgress = progress;
        }
    });

    uniqueThetasCache = Array.from(tempUniqueThetas).sort((a, b) => a - b);
    uniquePhisCache = Array.from(tempUniquePhis).sort((a, b) => a - b);
    calculatedPsfGridCache = psfGrid;
    lastAntennaCoordsSignature = currentAntennaCoordsSignature;
    lastPsfCalculationMethod = currentPsfCalculationMethod;

    self.postMessage({ type: 'progress', id: taskId, data: `Worker PSF: Grade PSF calculada (${currentPsfCalculationMethod}) (100%).` });
    return { psfGrid: calculatedPsfGridCache, uniqueThetas: uniqueThetasCache, uniquePhis: uniquePhisCache };
}

/**
 * Calcula Theta_pico, a largura média do lóbulo principal, buscando o primeiro mínimo significativo.
 * @param {Map<string, number>} psfGrid Mapa da PSF.
 * @param {Array<number>} uniqueThetas Valores de Theta (ordenados, 0-90 graus).
 * @param {Array<number>} uniquePhis Valores de Phi (ordenados, 0-90 graus).
 * @param {string} taskId Task ID para logs de progresso.
 * @returns {number|null} Valor médio de Theta_pico em graus, ou null se não puder ser calculado.
 */
function calculateThetaPico(psfGrid, uniqueThetas, uniquePhis, taskId) {
    self.postMessage({ type: 'progress', id: taskId, data: 'Worker PSF: Calculando Theta_pico (método do primeiro mínimo)...' });

    if (uniqueThetas.length < 3 || uniquePhis.length === 0) {
        self.postMessage({ type: 'progress', id: taskId, data: 'Worker PSF: Dados insuficientes para Theta_pico (poucos pontos em Theta ou Phi).' });
        return null;
    }

    // Threshold para um mínimo ser "significativo" (ex: -20dB abaixo do pico)
    // Se USE_INTENSITY_FOR_PSF = true, psf_value é |E|^2. Se false, psf_value é |E|.
    // Para -20dB: 10*log10(Ratio) = -20 => log10(Ratio) = -2 => Ratio = 0.01 (para intensidade)
    // Para magnitude: 20*log10(Ratio) = -20 => log10(Ratio) = -1 => Ratio = 0.1 (para magnitude)
    const SIGNIFICANT_MINIMUM_THRESHOLD_FACTOR = USE_INTENSITY_FOR_PSF ? 0.01 : 0.1;

    const MAX_THETA_SEARCH_DEG = 30.0; // Não procurar nulos além deste ângulo
    let sumOfFirstMinimumThetas = 0;
    let countOfValidPhiSlices = 0;

    // Analisar um subconjunto de fatias Phi para eficiência, se houver muitas.
    // Ex: analisar a cada ~5 graus de Phi ou umas 10-20 fatias distribuídas.
    const phiSampleStep = Math.max(1, Math.floor(uniquePhis.length / 20)); // Ajustado para mais amostras se disponíveis

    for (let phiIdx = 0; phiIdx < uniquePhis.length; phiIdx += phiSampleStep) {
        const currentPhi = uniquePhis[phiIdx];
        let peakPsfValueForSlice = -1.0;
        const currentSliceThetas = []; // Array de {theta, value}

        // 1. Extrair o corte 1D da PSF para o Phi atual e encontrar o pico (em theta=0)
        for (const theta of uniqueThetas) {
            if (theta > MAX_THETA_SEARCH_DEG + 1e-3) { // Adiciona pequena tolerância e para cedo
                 // Adiciona um último ponto se theta for exatamente MAX_THETA_SEARCH_DEG
                if (Math.abs(theta - MAX_THETA_SEARCH_DEG) < 1e-3 && currentSliceThetas[currentSliceThetas.length-1]?.theta < MAX_THETA_SEARCH_DEG) {
                    const psfValue = psfGrid.get(`${theta}_${currentPhi}`);
                    if (psfValue !== undefined) currentSliceThetas.push({ theta: theta, value: psfValue });
                }
                break; 
            }
            const psfValue = psfGrid.get(`${theta}_${currentPhi}`);
            if (psfValue === undefined) continue;

            currentSliceThetas.push({ theta: theta, value: psfValue });
            if (Math.abs(theta - 0) < 1e-6) { // Pico em theta=0
                peakPsfValueForSlice = psfValue;
            }
        }

        if (currentSliceThetas.length < 3 || peakPsfValueForSlice <= 1e-12) {
            // console.debug(`PSF Worker: Skipping Phi=${currentPhi} for Theta_pico (slice length: ${currentSliceThetas.length}, peak: ${peakPsfValueForSlice})`);
            continue; 
        }

        const significantMinimumTargetValue = peakPsfValueForSlice * SIGNIFICANT_MINIMUM_THRESHOLD_FACTOR;
        let firstMinimumThetaForSlice = null;

        // 2. Varrer em Theta para encontrar o primeiro mínimo local significativo
        for (let i = 1; i < currentSliceThetas.length - 1; i++) {
            const prev = currentSliceThetas[i-1];
            const curr = currentSliceThetas[i];
            const next = currentSliceThetas[i+1];

            // Condição de mínimo local: valor atual é menor ou igual ao anterior E menor que o próximo
            if (curr.value <= prev.value && curr.value < next.value) {
                if (curr.value < significantMinimumTargetValue) {
                    firstMinimumThetaForSlice = curr.theta;
                    // console.debug(`PSF Worker: Found min for Phi=${currentPhi} at Theta=${curr.theta.toFixed(2)} (val=${curr.value.toExponential(2)}, peak=${peakPsfValueForSlice.toExponential(2)}, target_min=${significantMinimumTargetValue.toExponential(2)})`);
                    break; 
                }
            }
        }
        // Fallback: if no distinct minimum found but pattern drops consistently below threshold
        if (firstMinimumThetaForSlice === null) {
            for (let i = 1; i < currentSliceThetas.length; i++) {
                const curr = currentSliceThetas[i];
                if (curr.value < significantMinimumTargetValue) {
                    // This is the first point that drops below the threshold.
                    // It might not be a local minimum, but indicates the main lobe has significantly decayed.
                    firstMinimumThetaForSlice = curr.theta;
                    // console.debug(`PSF Worker: Fallback min for Phi=${currentPhi} at Theta=${curr.theta.toFixed(2)} (val=${curr.value.toExponential(2)} crossing threshold)`);
                    break;
                }
            }
        }


        if (firstMinimumThetaForSlice !== null) {
            sumOfFirstMinimumThetas += firstMinimumThetaForSlice;
            countOfValidPhiSlices++;
        }
    }

    if (countOfValidPhiSlices > 0) {
        const avgThetaPico = sumOfFirstMinimumThetas / countOfValidPhiSlices;
        self.postMessage({ type: 'progress', id: taskId, data: `Worker PSF: Theta_pico calculado: ${avgThetaPico.toFixed(2)}° (${countOfValidPhiSlices} fatias Phi)` });
        return avgThetaPico;
    } else {
        self.postMessage({ type: 'progress', id: taskId, data: 'Worker PSF: Não foi possível calcular Theta_pico (nenhum mínimo significativo encontrado nas fatias Phi amostradas).' });
        return null;
    }
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

        const { psfGrid, uniqueThetas, uniquePhis } = getOrCalculatePsfGrid(antennaCoords, elementFieldData3D, K_CONST, taskId);

        if (command === 'calculateTotalVolumeAndThetaPico') { // Comando atualizado
            self.postMessage({ type: 'progress', id: taskId, data: 'Worker PSF: Integrando volume total...' });
            const volumeFirstQuadrant = integratePSF(uniqueThetas, uniquePhis, psfGrid, 90);
            const totalVolume = volumeFirstQuadrant * 4.0;

            // Chamar a nova função para Theta_pico
            const thetaPico = calculateThetaPico(psfGrid, uniqueThetas, uniquePhis, taskId);

            self.postMessage({
                id: taskId,
                type: 'resultTotalVolumeAndThetaPico', // Tipo de mensagem atualizado
                data: { totalVolume: totalVolume, thetaPico: thetaPico } // Inclui thetaPico
            });
        }
        else if (command === 'calculateSLL') {
            if (typeof sllThetaDeg !== 'number' || sllThetaDeg <= 0 || sllThetaDeg > 90) {
                throw new Error("Ângulo Theta inválido para SLL.");
            }
            self.postMessage({ type: 'progress', id: taskId, data: `Worker PSF: Integrando volume do cone (SLL, Θ=${sllThetaDeg}°)...` });
            const coneVolumeFirstQuadrant = integratePSF(uniqueThetas, uniquePhis, psfGrid, sllThetaDeg);
            const totalConeVolume = coneVolumeFirstQuadrant * 4.0; // Renomeado para clareza

            self.postMessage({
                id: taskId,
                type: 'resultSLL',
                data: { coneVolume: totalConeVolume, sllThetaDeg: sllThetaDeg } // Renomeado para clareza
            });
        }
        else if (command === 'calculateEE') {
            if (typeof eePercentage !== 'number' || eePercentage <= 0 || eePercentage >= 100) {
                throw new Error("Porcentagem inválida para EE.");
            }
            self.postMessage({ type: 'progress', id: taskId, data: `Worker PSF: Calculando Θ para EE (${eePercentage}%)...` });

            const totalVolumeFirstQuadrantFull = integratePSF(uniqueThetas, uniquePhis, psfGrid, 90);
            const actualTotalPSFVolume = totalVolumeFirstQuadrantFull * 4.0; // Renomeado para clareza

            if (actualTotalPSFVolume <= 1e-12) {
                self.postMessage({
                    id: taskId,
                    type: 'resultEE',
                    data: { thetaEE: 0, fractionalVolume: 0, eePercentage: eePercentage, error: "Volume total da PSF é próximo de zero." }
                });
                return;
            }

            const targetVolumeOverall = actualTotalPSFVolume * (eePercentage / 100.0);
            const targetVolumeFirstQuadrant = targetVolumeOverall / 4.0;
            let thetaEE_deg = 0;

            if (targetVolumeFirstQuadrant <= 1e-12) {
                thetaEE_deg = 0;
            } else {
                for (let i = 0; i < uniqueThetas.length - 1; i++) {
                    const theta_i = uniqueThetas[i];
                    const theta_j = uniqueThetas[i+1];
                     const volumeUpTo_j = integratePSF(uniqueThetas, uniquePhis, psfGrid, theta_j);
                     const volumeUpTo_i = integratePSF(uniqueThetas, uniquePhis, psfGrid, theta_i);

                    if (volumeUpTo_j >= targetVolumeFirstQuadrant) {
                        const sliceVolume = volumeUpTo_j - volumeUpTo_i;
                        const remainingVolumeNeededInSlice = targetVolumeFirstQuadrant - volumeUpTo_i;
                        if (sliceVolume > 1e-12) {
                            thetaEE_deg = theta_i + (theta_j - theta_i) * (remainingVolumeNeededInSlice / sliceVolume);
                        } else {
                             thetaEE_deg = theta_j;
                        }
                         thetaEE_deg = Math.min(thetaEE_deg, theta_j);
                         thetaEE_deg = Math.max(thetaEE_deg, theta_i);
                        break;
                    }
                    thetaEE_deg = theta_j;
                }
            }
            thetaEE_deg = Math.min(thetaEE_deg, 90.0);
            thetaEE_deg = Math.max(thetaEE_deg, 0.0);
            const finalConeVolumeFirstQuadrant = integratePSF(uniqueThetas, uniquePhis, psfGrid, thetaEE_deg);
            const finalFractionalVolume = finalConeVolumeFirstQuadrant * 4.0; // Renomeado para clareza

            self.postMessage({
                id: taskId,
                type: 'resultEE',
                data: { thetaEE: thetaEE_deg, fractionalVolume: finalFractionalVolume, eePercentage: eePercentage } // Renomeado para clareza
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