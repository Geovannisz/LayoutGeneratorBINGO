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
        return { re: 1.0, im: 0.0 }; // AF = 1 se não houver antenas (ou apenas uma no centro).
    }
    const theta_rad = theta_deg * DEG_TO_RAD;
    const phi_rad = phi_deg * DEG_TO_RAD;

    // Assumindo que o feixe principal é direcionado para o zênite (theta_0=0, phi_0=0)
    const scanVecX = 0; // Math.sin(0) * Math.cos(0)
    const scanVecY = 0; // Math.sin(0) * Math.sin(0)

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
    // Multiplicação complexa: E_total = E_elemento * AF
    // E_theta_total = E_theta_elemento * AF
    const rEThetaTotal_re = elementFieldData.rETheta.re * af_complex.re - elementFieldData.rETheta.im * af_complex.im;
    const rEThetaTotal_im = elementFieldData.rETheta.re * af_complex.im + elementFieldData.rETheta.im * af_complex.re;
    // E_phi_total = E_phi_elemento * AF
    const rEPhiTotal_re = elementFieldData.rEPhi.re * af_complex.re - elementFieldData.rEPhi.im * af_complex.im;
    const rEPhiTotal_im = elementFieldData.rEPhi.re * af_complex.im + elementFieldData.rEPhi.im * af_complex.re;

    // Magnitude quadrada do campo total (proporcional à intensidade/potência)
    const magSquared_E_total = (rEThetaTotal_re * rEThetaTotal_re + rEThetaTotal_im * rEThetaTotal_im) +
                               (rEPhiTotal_re * rEPhiTotal_re + rEPhiTotal_im * rEPhiTotal_im);

    if (USE_INTENSITY_FOR_PSF) {
        return magSquared_E_total; // Retorna |E_total|^2
    } else {
        return Math.sqrt(magSquared_E_total); // Retorna |E_total|
    }
}

/**
 * Realiza a integração numérica 2D da PSF sobre uma grade (theta, phi) usando a regra do trapézio.
 * A integração é feita no primeiro quadrante (theta 0-90, phi 0-90).
 * dA = PSF(theta, phi) * sin(theta) dtheta dphi
 * @param {Array<number>} uniqueThetas Array de valores únicos de Theta em graus (0 a 90).
 * @param {Array<number>} uniquePhis Array de valores únicos de Phi em graus (0 a 90).
 * @param {Map<string, number>} psfGrid Mapa contendo os valores da PSF, chave "theta_phi".
 * @param {number} [thetaLimit_deg=90] Limite superior de Theta para integração (usado para SLL).
 * @returns {number} Resultado da integral (área sob a PSF no primeiro quadrante, dentro do thetaLimit).
 */
function integratePSF(uniqueThetas, uniquePhis, psfGrid, thetaLimit_deg = 90) {
    let integralSum = 0;

    // Ordena para garantir a ordem correta na integração
    const sortedThetas = [...uniqueThetas].sort((a, b) => a - b);
    const sortedPhis = [...uniquePhis].sort((a, b) => a - b);

    for (let i = 0; i < sortedThetas.length - 1; i++) {
        const theta1_deg = sortedThetas[i];
        const theta2_deg = sortedThetas[i+1];

        // Pula se theta1 já estiver além do limite para SLL
        if (theta1_deg >= thetaLimit_deg) continue;
        // Ajusta theta2 se cruzar o limite
        const currentTheta2_deg = Math.min(theta2_deg, thetaLimit_deg);

        const dTheta_rad = (currentTheta2_deg - theta1_deg) * DEG_TO_RAD;

        for (let j = 0; j < sortedPhis.length - 1; j++) {
            const phi1_deg = sortedPhis[j];
            const phi2_deg = sortedPhis[j+1];
            const dPhi_rad = (phi2_deg - phi1_deg) * DEG_TO_RAD;

            // Valores da PSF nos quatro cantos da célula da grade
            const f_th1_ph1 = psfGrid.get(`${theta1_deg}_${phi1_deg}`) || 0;
            const f_th1_ph2 = psfGrid.get(`${theta1_deg}_${phi2_deg}`) || 0;
            const f_th2_ph1 = psfGrid.get(`${currentTheta2_deg}_${phi1_deg}`) || 0; // Usa currentTheta2_deg
            const f_th2_ph2 = psfGrid.get(`${currentTheta2_deg}_${phi2_deg}`) || 0; // Usa currentTheta2_deg

            // Elemento de área dA = f(theta, phi) * sin(theta) dtheta dphi
            // Média da função * sin(theta) nos cantos da célula.
            // (PSF1*sin(T1) + PSF2*sin(T1) + PSF3*sin(T2) + PSF4*sin(T2)) / 4
            // Multiplicado por dTheta * dPhi.
            const avg_psf_sin_theta = (
                (f_th1_ph1 + f_th1_ph2) * Math.sin(theta1_deg * DEG_TO_RAD) +
                (f_th2_ph1 + f_th2_ph2) * Math.sin(currentTheta2_deg * DEG_TO_RAD)
            ) / 4.0;

            integralSum += avg_psf_sin_theta * dTheta_rad * dPhi_rad;
        }
    }
    return integralSum; // Área no primeiro quadrante
}


// --- Cache para a Grade PSF Calculada ---
let calculatedPsfGridCache = null; // Formato: Map<string, number> onde chave é "theta_phi"
let uniqueThetasCache = null;
let uniquePhisCache = null;
let lastAntennaCoordsSignature = null; // Para invalidar cache se o arranjo mudar

/**
 * Gera (ou recupera do cache) a grade de valores da PSF para o primeiro quadrante.
 * @param {Array<Array<number>>} antennaCoords Coordenadas das antenas.
 * @param {Array<Object>} elementFieldData3D Dados completos do campo do elemento.
 * @param {number} K Constante de onda.
 * @param {string} taskId ID da tarefa para mensagens de progresso.
 * @returns {{psfGrid: Map<string, number>, uniqueThetas: Array<number>, uniquePhis: Array<number>}}
 */
function getOrCalculatePsfGrid(antennaCoords, elementFieldData3D, K, taskId) {
    // Cria uma assinatura simples das coordenadas das antenas para checagem de cache.
    // JSON.stringify pode ser lento para arrays muito grandes. Uma alternativa mais simples:
    const currentAntennaCoordsSignature = antennaCoords.length + "_" + (antennaCoords[0] ? antennaCoords[0].join(',') : "empty");

    if (calculatedPsfGridCache &&
        uniqueThetasCache &&
        uniquePhisCache &&
        lastAntennaCoordsSignature === currentAntennaCoordsSignature) {
        self.postMessage({ type: 'progress', id: taskId, data: 'Worker PSF: Usando grade PSF do cache.' });
        return { psfGrid: calculatedPsfGridCache, uniqueThetas: uniqueThetasCache, uniquePhis: uniquePhisCache };
    }

    self.postMessage({ type: 'progress', id: taskId, data: 'Worker PSF: Calculando grade PSF (0%)...' });

    const psfGrid = new Map();
    const tempUniqueThetas = new Set();
    const tempUniquePhis = new Set();

    // Filtra dados do elemento para o primeiro quadrante (Theta: 0-90, Phi: 0-90)
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
        if (progress > lastReportedProgress && progress % 10 === 0) { // Reporta a cada 10%
            self.postMessage({ type: 'progress', id: taskId, data: `Worker PSF: Calculando grade PSF (${progress}%)...` });
            lastReportedProgress = progress;
        }
    });

    calculatedPsfGridCache = psfGrid;
    uniqueThetasCache = Array.from(tempUniqueThetas).sort((a,b)=>a-b);
    uniquePhisCache = Array.from(tempUniquePhis).sort((a,b)=>a-b);
    lastAntennaCoordsSignature = currentAntennaCoordsSignature;

    self.postMessage({ type: 'progress', id: taskId, data: 'Worker PSF: Grade PSF calculada (100%).' });
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

        const { psfGrid, uniqueThetas, uniquePhis } = getOrCalculatePsfGrid(antennaCoords, elementFieldData3D, K_CONST, taskId);

        if (command === 'calculateTotalArea') {
            self.postMessage({ type: 'progress', id: taskId, data: 'Worker PSF: Integrando área total...' });
            const areaFirstQuadrant = integratePSF(uniqueThetas, uniquePhis, psfGrid, 90);
            const totalArea = areaFirstQuadrant * 4.0;
            self.postMessage({
                id: taskId,
                type: 'resultTotalArea',
                data: { totalArea: totalArea }
            });
        }
        else if (command === 'calculateSLL') {
            // ... (código SLL existente - sem alterações)
            if (typeof sllThetaDeg !== 'number' || sllThetaDeg <= 0 || sllThetaDeg > 90) {
                throw new Error("Ângulo Theta inválido para SLL.");
            }
            self.postMessage({ type: 'progress', id: taskId, data: `Worker PSF: Integrando área do cone (SLL, Θ=${sllThetaDeg}°)...` });
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

            const totalAreaFirstQuadrantFull = integratePSF(uniqueThetas, uniquePhis, psfGrid, 90);
            const actualTotalPSFArea = totalAreaFirstQuadrantFull * 4.0;

            if (actualTotalPSFArea <= 1e-12) { // Aumentei ligeiramente a tolerância para área zero
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
            const sortedUniqueThetas = [...uniqueThetas].sort((a,b)=>a-b);

            // Se a área alvo no primeiro quadrante for muito pequena ou zero, Theta_EE é 0.
            if (targetAreaFirstQuadrant <= 1e-12) {
                thetaEE_deg = 0;
            } else {
                // Itera sobre os intervalos de Theta para encontrar o que contém a energia alvo.
                for (let i = 0; i < sortedUniqueThetas.length - 1; i++) {
                    const theta_i = sortedUniqueThetas[i];       // Theta_inferior do intervalo atual
                    const theta_j = sortedUniqueThetas[i+1];     // Theta_superior do intervalo atual

                    // Área da fatia no primeiro quadrante entre theta_i e theta_j
                    // A função integratePSF calcula a área ACUMULADA até o theta limite.
                    const area_up_to_theta_j = integratePSF(uniqueThetas, uniquePhis, psfGrid, theta_j);
                    const area_up_to_theta_i = integratePSF(uniqueThetas, uniquePhis, psfGrid, theta_i);
                    const sliceArea = area_up_to_theta_j - area_up_to_theta_i;

                    if (accumulatedAreaFirstQuadrant + sliceArea >= targetAreaFirstQuadrant) {
                        // A energia alvo está dentro ou no final desta fatia.
                        const remainingAreaNeededInSlice = targetAreaFirstQuadrant - accumulatedAreaFirstQuadrant;
                        if (sliceArea > 1e-12) { // Evita divisão por zero se a fatia tiver área desprezível
                            // Interpolação linear dentro da fatia:
                            // (theta_EE - theta_i) / (theta_j - theta_i) = remainingAreaNeededInSlice / sliceArea
                            thetaEE_deg = theta_i + (theta_j - theta_i) * (remainingAreaNeededInSlice / sliceArea);
                        } else {
                            // Se a área da fatia é minúscula, mas precisamos dela, consideramos que atingimos no início ou fim.
                            // Se remainingAreaNeededInSlice é também minúsculo, theta_i é uma boa aproximação.
                            // Se remainingAreaNeededInSlice é comparável a sliceArea (ambos pequenos), algo está estranho, mas
                            // para evitar erros, podemos tomar theta_j.
                            // Com a condição de parada `break`, é mais provável que `theta_i` seja o mais correto se `sliceArea` for zero.
                            thetaEE_deg = (remainingAreaNeededInSlice <= 1e-12) ? theta_i : theta_j;
                        }
                        // Garante que o theta interpolado não exceda o limite superior da fatia atual
                        thetaEE_deg = Math.min(thetaEE_deg, theta_j);
                        // Garante que não seja menor que o limite inferior (pode acontecer com interpolação e valores pequenos)
                        thetaEE_deg = Math.max(thetaEE_deg, theta_i);
                        break; // Encontrou o Theta_EE
                    }
                    accumulatedAreaFirstQuadrant += sliceArea;
                    // Se o loop continuar, significa que toda a fatia atual foi incluída,
                    // e o Theta_EE é pelo menos theta_j.
                    thetaEE_deg = theta_j;
                }
            }

            // Se após o loop, thetaEE_deg ainda é 0 e targetAreaFirstQuadrant > 0,
            // significa que mesmo a primeira fatia (até sortedUniqueThetas[1]) já excede a targetArea.
            // Isso aconteceria se eePercentage for muito baixo.
            // Neste caso, precisamos de uma interpolação no primeiro intervalo.
            if (thetaEE_deg === 0 && targetAreaFirstQuadrant > 1e-12 && sortedUniqueThetas.length > 1) {
                const theta_i = sortedUniqueThetas[0]; // Geralmente 0
                const theta_j = sortedUniqueThetas[1];
                const area_up_to_theta_j = integratePSF(uniqueThetas, uniquePhis, psfGrid, theta_j);
                // (area_up_to_theta_i é 0 se theta_i for 0)

                if (area_up_to_theta_j >= targetAreaFirstQuadrant) {
                    if (area_up_to_theta_j > 1e-12) {
                         thetaEE_deg = theta_i + (theta_j - theta_i) * (targetAreaFirstQuadrant / area_up_to_theta_j);
                         thetaEE_deg = Math.min(thetaEE_deg, theta_j);
                         thetaEE_deg = Math.max(thetaEE_deg, theta_i);
                    } else {
                        thetaEE_deg = theta_i; // Se a primeira fatia tem área zero, e precisamos de área, fica em theta_i
                    }
                } else {
                    // Isso não deveria acontecer se a lógica anterior estiver correta,
                    // mas como fallback, se toda a grade não atingir a energia:
                    thetaEE_deg = 90;
                }
            }


            // Garante que Theta_EE não exceda 90 graus.
            thetaEE_deg = Math.min(thetaEE_deg, 90.0);
            // Garante que Theta_EE não seja negativo (pouco provável, mas por segurança).
            thetaEE_deg = Math.max(thetaEE_deg, 0.0);


            // Recalcula a área exata obtida com o thetaEE_deg encontrado para o campo "Valor Intermediário".
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