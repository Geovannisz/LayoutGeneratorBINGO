/**
 * psf_analysis_worker.js
 *
 * Web Worker para realizar a análise da Point Spread Function (PSF) do arranjo de antenas.
 * Calcula o volume total sob a PSF, o volume dentro de um cone para SLL (Side Lobe Level),
 * o ângulo Theta que contém uma determinada porcentagem de energia (Encircled Energy - EE),
 * o ângulo Theta_pico (estimativa da largura do pico principal buscando o primeiro mínimo significativo),
 * e os dados para a curva EE(Theta) com maior precisão.
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

function integratePSF(uniqueThetas, uniquePhis, psfGrid, thetaLimit_deg = 90) {
    let volumeSum = 0;
    const sortedThetas = uniqueThetas;
    const sortedPhis = uniquePhis;   

    let maxThetaIndexForIntegration = -1;
    for(let i=0; i < sortedThetas.length; i++) {
        if (sortedThetas[i] <= thetaLimit_deg + 1e-9) { 
            maxThetaIndexForIntegration = i;
        } else {
            break; 
        }
    }
    
    if (maxThetaIndexForIntegration < 0 || thetaLimit_deg < 1e-9) return 0;

    for (let i = 0; i < maxThetaIndexForIntegration; i++) { 
        const theta1_deg = sortedThetas[i];
        const theta2_deg_candidate = sortedThetas[i+1];
        const theta2_deg = Math.min(theta2_deg_candidate, thetaLimit_deg);
        
        const dTheta_rad = (theta2_deg - theta1_deg) * DEG_TO_RAD;
        if (dTheta_rad <= 0) continue; 

        for (let j = 0; j < sortedPhis.length - 1; j++) {
            const phi1_deg = sortedPhis[j];
            const phi2_deg = sortedPhis[j+1];
            const dPhi_rad = (phi2_deg - phi1_deg) * DEG_TO_RAD;

            const f_th1_ph1 = psfGrid.get(`${theta1_deg}_${phi1_deg}`) || 0;
            const f_th1_ph2 = psfGrid.get(`${theta1_deg}_${phi2_deg}`) || 0;
            
            let f_th2_ph1, f_th2_ph2;
            if (Math.abs(theta2_deg - theta2_deg_candidate) < 1e-9) { 
                f_th2_ph1 = psfGrid.get(`${theta2_deg_candidate}_${phi1_deg}`) || 0;
                f_th2_ph2 = psfGrid.get(`${theta2_deg_candidate}_${phi2_deg}`) || 0;
            } else { 
                const f_th1_ph1_val = psfGrid.get(`${theta1_deg}_${phi1_deg}`) || 0;
                const f_th_cand_ph1_val = psfGrid.get(`${theta2_deg_candidate}_${phi1_deg}`) || 0;
                if (theta2_deg_candidate - theta1_deg > 1e-9) { // Avoid division by zero
                    f_th2_ph1 = f_th1_ph1_val + (f_th_cand_ph1_val - f_th1_ph1_val) * (thetaLimit_deg - theta1_deg) / (theta2_deg_candidate - theta1_deg);
                } else {
                    f_th2_ph1 = f_th1_ph1_val; // or f_th_cand_ph1_val, they are very close
                }
                
                const f_th1_ph2_val = psfGrid.get(`${theta1_deg}_${phi2_deg}`) || 0;
                const f_th_cand_ph2_val = psfGrid.get(`${theta2_deg_candidate}_${phi2_deg}`) || 0;
                 if (theta2_deg_candidate - theta1_deg > 1e-9) {
                    f_th2_ph2 = f_th1_ph2_val + (f_th_cand_ph2_val - f_th1_ph2_val) * (thetaLimit_deg - theta1_deg) / (theta2_deg_candidate - theta1_deg);
                 } else {
                    f_th2_ph2 = f_th1_ph2_val;
                 }
            }

            const avg_psf_sin_theta = (
                (f_th1_ph1 * Math.sin(theta1_deg * DEG_TO_RAD)) +
                (f_th1_ph2 * Math.sin(theta1_deg * DEG_TO_RAD)) +
                (f_th2_ph1 * Math.sin(theta2_deg * DEG_TO_RAD)) +
                (f_th2_ph2 * Math.sin(theta2_deg * DEG_TO_RAD))
            ) / 4.0;
            volumeSum += avg_psf_sin_theta * dTheta_rad * dPhi_rad;
        }
         if (theta2_deg_candidate > thetaLimit_deg && theta1_deg < thetaLimit_deg) {
             break; 
         }
    }
    return volumeSum;
}

let calculatedPsfGridCache = null;
let uniqueThetasCache = null;
let uniquePhisCache = null;
let lastAntennaCoordsSignature = null;
let lastPsfCalculationMethod = null;

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
        p.theta_deg >= 0 && p.theta_deg <= 90 + 1e-9 && 
        p.phi_deg >= 0 && p.phi_deg <= 90 + 1e-9
    );

    if (firstQuadrantData.length === 0) {
        throw new Error("Nenhum dado do elemento encontrado para o primeiro quadrante (Theta 0-90, Phi 0-90). Verifique os dados de E-Field.");
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
        if (progress > lastReportedProgress && progress % 5 === 0) { 
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

function calculateThetaPico(psfGrid, uniqueThetas, uniquePhis, taskId) {
    self.postMessage({ type: 'progress', id: taskId, data: 'Worker PSF: Calculando Theta_pico...' });

    if (uniqueThetas.length < 3 || uniquePhis.length === 0) {
        self.postMessage({ type: 'progress', id: taskId, data: 'Worker PSF: Dados insuficientes para Theta_pico (poucos pontos em Theta ou Phi).' });
        return null;
    }

    const SIGNIFICANT_MINIMUM_THRESHOLD_FACTOR = USE_INTENSITY_FOR_PSF ? 0.01 : 0.1; 
    const MAX_THETA_SEARCH_DEG = 30.0; 
    let sumOfFirstMinimumThetas = 0;
    let countOfValidPhiSlices = 0;
    const phiSampleStep = Math.max(1, Math.floor(uniquePhis.length / Math.min(20, uniquePhis.length))); 

    for (let phiIdx = 0; phiIdx < uniquePhis.length; phiIdx += phiSampleStep) {
        const currentPhi = uniquePhis[phiIdx];
        let peakPsfValueForSlice = -1.0;
        const currentSliceThetas = [];

        for (const theta of uniqueThetas) {
            if (theta > MAX_THETA_SEARCH_DEG + 1e-3) break;
            const psfValue = psfGrid.get(`${theta}_${currentPhi}`);
            if (psfValue === undefined) continue;
            currentSliceThetas.push({ theta: theta, value: psfValue });
            if (Math.abs(theta) < 1e-6) peakPsfValueForSlice = psfValue;
        }

        if (currentSliceThetas.length < 3 || peakPsfValueForSlice <= 1e-12) continue;

        const significantMinimumTargetValue = peakPsfValueForSlice * SIGNIFICANT_MINIMUM_THRESHOLD_FACTOR;
        let firstMinimumThetaForSlice = null;

        for (let i = 1; i < currentSliceThetas.length - 1; i++) {
            const prev = currentSliceThetas[i-1];
            const curr = currentSliceThetas[i];
            const next = currentSliceThetas[i+1];
            if (curr.value <= prev.value && curr.value < next.value && curr.value < significantMinimumTargetValue) {
                firstMinimumThetaForSlice = curr.theta;
                break;
            }
        }
        if (firstMinimumThetaForSlice === null) { 
            for (let i = 1; i < currentSliceThetas.length; i++) {
                if (currentSliceThetas[i].value < significantMinimumTargetValue) {
                    firstMinimumThetaForSlice = currentSliceThetas[i].theta;
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
        self.postMessage({ type: 'progress', id: taskId, data: 'Worker PSF: Não foi possível calcular Theta_pico.' });
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
        eePercentage,
        totalPSFVolume 
    } = e.data;

    try {
        if (!elementFieldData3D || !Array.isArray(elementFieldData3D) ||elementFieldData3D.length === 0) {
            throw new Error("Dados do elemento 3D (elementFieldData3D) não fornecidos ou vazios.");
        }

        const { psfGrid, uniqueThetas, uniquePhis } = getOrCalculatePsfGrid(antennaCoords, elementFieldData3D, K_CONST, taskId);

        if (command === 'calculateTotalVolumeAndThetaPico') {
            self.postMessage({ type: 'progress', id: taskId, data: 'Worker PSF: Integrando volume total...' });
            const volumeFirstQuadrant = integratePSF(uniqueThetas, uniquePhis, psfGrid, 90); 
            const calculatedTotalVolume = volumeFirstQuadrant * 4.0; 

            const thetaPico = calculateThetaPico(psfGrid, uniqueThetas, uniquePhis, taskId);

            self.postMessage({
                id: taskId,
                type: 'resultTotalVolumeAndThetaPico',
                data: { totalVolume: calculatedTotalVolume, thetaPico: thetaPico }
            });
        }
        else if (command === 'calculateSLL') {
            if (typeof sllThetaDeg !== 'number' || sllThetaDeg <= 0 || sllThetaDeg > 90) {
                throw new Error("Ângulo Theta inválido para SLL.");
            }
            self.postMessage({ type: 'progress', id: taskId, data: `Worker PSF: Integrando volume do cone (SLL, Θ=${sllThetaDeg}°)...` });
            const coneVolumeFirstQuadrant = integratePSF(uniqueThetas, uniquePhis, psfGrid, sllThetaDeg);
            const sllCalculatedConeVolume = coneVolumeFirstQuadrant * 4.0;

            self.postMessage({
                id: taskId,
                type: 'resultSLL',
                data: { coneVolume: sllCalculatedConeVolume, sllThetaDeg: sllThetaDeg }
            });
        }
        else if (command === 'calculateEE') {
            if (typeof eePercentage !== 'number' || eePercentage <= 0 || eePercentage >= 100) {
                throw new Error("Porcentagem inválida para EE.");
            }
            self.postMessage({ type: 'progress', id: taskId, data: `Worker PSF: Calculando Θ para EE (${eePercentage}%)...` });

            const totalVolumeForEE = integratePSF(uniqueThetas, uniquePhis, psfGrid, 90) * 4.0;

            if (totalVolumeForEE <= 1e-12) {
                self.postMessage({
                    id: taskId,
                    type: 'resultEE',
                    data: { thetaEE: 0, fractionalVolume: 0, eePercentage: eePercentage, error: "Volume total da PSF é próximo de zero." }
                });
                return;
            }

            const targetVolumeOverall = totalVolumeForEE * (eePercentage / 100.0);
            const targetVolumeFirstQuadrant = targetVolumeOverall / 4.0;
            let thetaEE_deg = 0;

            if (targetVolumeFirstQuadrant <= 1e-12) {
                thetaEE_deg = 0;
            } else {
                 let accumulatedVolumeFirstQuadrant = 0;
                 for (let i = 0; i < uniqueThetas.length -1; i++) {
                     const theta_i = uniqueThetas[i];
                     const theta_j = uniqueThetas[i+1];
                     const volume_up_to_j = integratePSF(uniqueThetas, uniquePhis, psfGrid, theta_j);
                     const volume_up_to_i = accumulatedVolumeFirstQuadrant; // Use o acumulado da iteração anterior
                     
                     if (volume_up_to_j >= targetVolumeFirstQuadrant) {
                         const segmentVolume = volume_up_to_j - volume_up_to_i;
                         const remainingVolumeNeededInSegment = targetVolumeFirstQuadrant - volume_up_to_i;
                         
                         if (segmentVolume > 1e-12) { 
                             thetaEE_deg = theta_i + (theta_j - theta_i) * (remainingVolumeNeededInSegment / segmentVolume);
                         } else {
                             thetaEE_deg = theta_j; 
                         }
                         thetaEE_deg = Math.min(Math.max(thetaEE_deg, theta_i), theta_j); 
                         break; 
                     }
                     accumulatedVolumeFirstQuadrant = volume_up_to_j; 
                     thetaEE_deg = theta_j; 
                 }
            }
            thetaEE_deg = Math.min(thetaEE_deg, 90.0); 
            thetaEE_deg = Math.max(thetaEE_deg, 0.0);

            const finalConeVolumeFirstQuadrant = integratePSF(uniqueThetas, uniquePhis, psfGrid, thetaEE_deg);
            const eeCalculatedFractionalVolume = finalConeVolumeFirstQuadrant * 4.0;

            self.postMessage({
                id: taskId,
                type: 'resultEE',
                data: { thetaEE: thetaEE_deg, fractionalVolume: eeCalculatedFractionalVolume, eePercentage: eePercentage }
            });
        }
        else if (command === 'calculateEECurve') {
            if (typeof totalPSFVolume !== 'number' || totalPSFVolume <= 1e-12) {
                throw new Error("Volume total da PSF inválido ou não fornecido para cálculo da curva EE(Θ).");
            }
            self.postMessage({ type: 'progress', id: taskId, data: `Worker PSF: Calculando curva EE(Θ)...` });

            const eeCurveData = [];
            // Aumentar a precisão (aproximadamente 3x mais pontos)
            // Antes: ~49 pontos. Agora: ~150 pontos
            const thetaSamples = [
                // De 0 a 1 grau, a cada 0.05 (20 pontos)
                ...Array.from({length: 20}, (_, i) => i * 0.05),
                // De 1 a 5 graus, a cada 0.1 (40 pontos)
                ...Array.from({length: 40}, (_, i) => 1 + i * 0.1),
                // De 5 a 15 graus, a cada 0.25 (40 pontos)
                ...Array.from({length: 40}, (_, i) => 5 + i * 0.25),
                // De 15 a 30 graus, a cada 0.5 (30 pontos)
                ...Array.from({length: 30}, (_, i) => 15 + i * 0.5),
                // De 30 a 90 graus, a cada 1 (60 pontos)
                ...Array.from({length: 60}, (_, i) => 30 + i * 1),
            ];
            
            const uniqueThetaSamples = [...new Set(thetaSamples.map(t => parseFloat(t.toFixed(3))))] // Arredonda para evitar problemas de float e garante unicidade
                                      .map(t => Math.min(t, 90)) // Clampa em 90
                                      .sort((a,b)=>a-b);
            // Garante que 0 e 90 estão presentes
            if (uniqueThetaSamples[0] > 0) uniqueThetaSamples.unshift(0);
            if (uniqueThetaSamples[uniqueThetaSamples.length-1] < 90 && !uniqueThetaSamples.includes(90)) {
                 uniqueThetaSamples.push(90);
                 uniqueThetaSamples.sort((a,b)=>a-b); // Reordena se 90 foi adicionado
            }


            for (let i = 0; i < uniqueThetaSamples.length; i++) {
                const currentThetaLimit = uniqueThetaSamples[i];
                const volumeInCone = integratePSF(uniqueThetas, uniquePhis, psfGrid, currentThetaLimit);
                const eeValue = (volumeInCone * 4.0) / totalPSFVolume; 
                eeCurveData.push({ theta: currentThetaLimit, ee: Math.min(eeValue, 1.0) }); 

                if (i % Math.floor(uniqueThetaSamples.length / 20) === 0) { // Progresso a cada ~5%
                    self.postMessage({ type: 'progress', id: taskId, data: `Worker PSF: Curva EE(Θ) ${Math.round((i/uniqueThetaSamples.length)*100)}%...` });
                }
            }
            self.postMessage({ type: 'progress', id: taskId, data: `Worker PSF: Curva EE(Θ) 100%...` });
            self.postMessage({
                id: taskId,
                type: 'resultEECurve',
                data: { eeCurveData: eeCurveData }
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