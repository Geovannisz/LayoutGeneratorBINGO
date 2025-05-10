/**
 * beam_worker.js
 *
 * Web Worker para calcular o Array Factor (AF) e aplicar ao campo do elemento.
 * Utiliza TypedArrays e otimizações de loop para melhor performance.
 */

// --- Funções de Cálculo (Otimizadas) ---

/**
 * Calcula o complex Array Factor (AF) - Versão do Worker Otimizada.
 * @param {Float64Array} theta Array de ângulos theta (radianos) - Nota: A função espera graus e converte internamente.
 * @param {Float64Array} phi Array de ângulos phi (radianos) - Nota: A função espera graus e converte internamente.
 * @param {Array<Array<number>>} antennaCoords Array de coordenadas [x,y] das antenas.
 * @param {number} k Constante do número de onda.
 * @param {number} [theta_0=0] Ângulo de varredura theta (graus).
 * @param {number} [phi_0=0] Ângulo de varredura phi (graus).
 * @returns {object} Objeto contendo { af_re: Float64Array, af_im: Float64Array }.
 */
function computeAF_worker_optimized(theta_deg, phi_deg, antennaCoords, k, theta_0_deg = 0, phi_0_deg = 0) {
    const numPoints = theta_deg.length;
    self.postMessage({ type: 'progress', data: `Worker: Iniciando cálculo otimizado do AF para ${antennaCoords.length} antenas e ${numPoints} pontos angulares...` });

    if (numPoints === 0) {
        self.postMessage({ type: 'progress', data: "Worker: Nenhum ponto angular para cálculo do AF." });
        return { af_re: new Float64Array(0), af_im: new Float64Array(0) };
    }
    if (theta_deg.length !== phi_deg.length) throw new Error("Worker: Disparidade no comprimento de Theta/Phi para cálculo do AF.");


    const af_re = new Float64Array(numPoints);
    const af_im = new Float64Array(numPoints);

    if (antennaCoords.length === 0) {
        self.postMessage({ type: 'progress', data: "Worker: Nenhuma coordenada de antena; AF será efetivamente 1 (soma de 1 elemento)." });
        // Se não há antenas, AF é 1 (para normalização) ou 0 se não houver sinal.
        // Por consistência com a soma, se for soma de cos(0) e sin(0) para 1 "antena na origem", seria 1.
        // Se a interpretação é "nenhum sinal", então seria 0.
        // A implementação anterior resultava em {re: 1, im: 0} para cada ponto se o array de antenas era vazio,
        // assumindo implicitamente uma única antena na origem com fase zero.
        // Para manter esse comportamento, se não houver antenas, o AF é como se fosse uma única antena na origem.
        // No entanto, a lógica da soma resulta em 0. Se for esperado que N=0 => AF=1,
        // preencheríamos af_re com 1. Para o cálculo do somatório, N=0 => soma=0.
        // A função original retornava Array(theta.length).fill({ re: 1, im: 0 });
        // Vamos manter a lógica da soma: se não há antenas, a soma é zero.
        // Se a intenção é que o AF seja 1 (elemento único), então o array de antenas deve conter [0,0].
        // A chamada original no beam_pattern.js para computeAF já lidava com isso, retornando 1.
        // Aqui, se antennaCoords é vazio, o loop de antenas não roda, sumRe/Im permanecem 0.
        // Isso é matematicamente mais consistente com a definição de AF como uma soma.
        // O "efeito 1" pode ser aplicado no nível superior se necessário.
        // Por ora, se não há antenas, o AF é 0.
        for(let i=0; i < numPoints; i++) {
            af_re[i] = 0; // Ou 1, dependendo da interpretação de "sem antenas"
            af_im[i] = 0;
        }
        self.postMessage({ type: 'progress', data: "Worker: Cálculo AF (sem antenas) concluído." });
        return { af_re, af_im };
    }

    const numAntennas = antennaCoords.length;
    // Usar TypedArrays para coordenadas de antenas
    const antX = new Float64Array(numAntennas);
    const antY = new Float64Array(numAntennas);
    for (let i = 0; i < numAntennas; i++) {
        antX[i] = Number(antennaCoords[i][0]);
        antY[i] = Number(antennaCoords[i][1]);
    }

    const DEG_TO_RAD = Math.PI / 180;
    const theta_0_rad = theta_0_deg * DEG_TO_RAD;
    const phi_0_rad = phi_0_deg * DEG_TO_RAD;

    // Vetor de varredura (componentes constantes)
    const scanVecX = Math.sin(theta_0_rad) * Math.cos(phi_0_rad);
    const scanVecY = Math.sin(theta_0_rad) * Math.sin(phi_0_rad);

    const progressInterval = Math.max(1, Math.floor(numPoints / 20));

    for (let i = 0; i < numPoints; i++) {
        const theta_rad_i = theta_deg[i] * DEG_TO_RAD;
        const phi_rad_i = phi_deg[i] * DEG_TO_RAD;

        // Vetor de observação (componentes dependem do ponto angular 'i')
        const obsVecX = Math.sin(theta_rad_i) * Math.cos(phi_rad_i);
        const obsVecY = Math.sin(theta_rad_i) * Math.sin(phi_rad_i);

        // Diferenças pré-multiplicadas por k
        const k_diffX = k * (obsVecX - scanVecX);
        const k_diffY = k * (obsVecY - scanVecY);

        let sumRe = 0.0;
        let sumIm = 0.0;

        for (let j = 0; j < numAntennas; j++) {
            // Acesso direto aos TypedArrays antX e antY
            const phase = k_diffX * antX[j] + k_diffY * antY[j];
            sumRe += Math.cos(phase);
            sumIm += Math.sin(phase);
        }
        af_re[i] = sumRe;
        af_im[i] = sumIm;

        if (i > 0 && i % progressInterval === 0) {
            self.postMessage({ type: 'progress', data: `Worker: Cálculo AF ${Math.round((i / numPoints) * 100)}% concluído...` });
        }
    }
    self.postMessage({ type: 'progress', data: "Worker: Cálculo AF 100% concluído." });
    return { af_re, af_im };
}

/**
 * Multiplica o E-field complexo do elemento pelo Array Factor complexo - Versão do Worker Otimizada.
 * @param {Array<Object>} elementFieldData Array de {theta, phi, rETheta, rEPhi}.
 * @param {Float64Array} af_re Parte real do Array Factor.
 * @param {Float64Array} af_im Parte imaginária do Array Factor.
 * @returns {Float64Array} Array com as magnitudes resultantes.
 */
function applyAF_worker_optimized(elementFieldData, af_re_array, af_im_array) {
    const numPoints = elementFieldData.length;
    self.postMessage({ type: 'progress', data: "Worker: Aplicando AF aos dados do elemento (otimizado)..." });
    if (numPoints !== af_re_array.length || numPoints !== af_im_array.length) {
        throw new Error("Worker: Disparidade no comprimento dos dados de campo do elemento e arrays AF.");
    }

    const resultingMagnitude = new Float64Array(numPoints);

    for (let i = 0; i < numPoints; i++) {
        const element = elementFieldData[i];
        const af_r = af_re_array[i];
        const af_i = af_im_array[i];

        // Multiplicação de números complexos: (a+jb)(c+jd) = (ac-bd) + j(ad+bc)
        // E_theta_total = E_theta_elem * AF
        const rEThetaTotal_re = element.rETheta.re * af_r - element.rETheta.im * af_i;
        const rEThetaTotal_im = element.rETheta.re * af_i + element.rETheta.im * af_r;

        // E_phi_total = E_phi_elem * AF
        const rEPhiTotal_re = element.rEPhi.re * af_r - element.rEPhi.im * af_i;
        const rEPhiTotal_im = element.rEPhi.re * af_i + element.rEPhi.im * af_r;

        // Magnitude total: sqrt(Re(E_theta_total)^2 + Im(E_theta_total)^2 + Re(E_phi_total)^2 + Im(E_phi_total)^2)
        resultingMagnitude[i] = Math.sqrt(
            rEThetaTotal_re * rEThetaTotal_re + rEThetaTotal_im * rEThetaTotal_im +
            rEPhiTotal_re * rEPhiTotal_re + rEPhiTotal_im * rEPhiTotal_im
        );
    }
    self.postMessage({ type: 'progress', data: "Worker: Aplicação do AF (otimizado) concluída." });
    return resultingMagnitude;
}

// --- Listener de Mensagens da Thread Principal ---
self.onmessage = function(e) {
    const { id, antennaCoords, filteredElementData, K_CONST, selectedPhiValue } = e.data;

    if (!filteredElementData || filteredElementData.length === 0) {
        self.postMessage({ id, type: 'error', error: 'Worker: Dados do elemento filtrado estão vazios.' });
        return;
    }

    try {
        // Extrai os valores de theta (em graus) e phi (em graus) do filteredElementData.
        // Estes são os únicos ângulos para os quais o cálculo é necessário.
        const thetaValuesDeg = new Float64Array(filteredElementData.map(point => point.theta));
        // Todos os pontos em filteredElementData têm o mesmo phi (selectedPhiValue).
        const phiValuesDeg = new Float64Array(filteredElementData.length).fill(selectedPhiValue);

        // Calcula o Array Factor (AF)
        // Passamos os ângulos em graus; a função computeAF_worker_optimized os converterá para radianos.
        const { af_re, af_im } = computeAF_worker_optimized(thetaValuesDeg, phiValuesDeg, antennaCoords, K_CONST /*, theta_0, phi_0 */);

        // Aplica o AF aos dados do elemento filtrado
        const resultingMagnitudeTyped = applyAF_worker_optimized(filteredElementData, af_re, af_im);

        // Converte TypedArray para Array normal antes de enviar de volta,
        // para garantir compatibilidade e evitar problemas se a thread principal não espera TypedArray.
        const resultingMagnitude = Array.from(resultingMagnitudeTyped);
        const finalThetaValues = Array.from(thetaValuesDeg); // Mantém os theta originais (em graus)

        self.postMessage({
            id,
            type: 'result',
            data: {
                thetaValues: finalThetaValues, // theta em graus
                resultingMagnitude,
                phiValue: selectedPhiValue // Retorna o Phi usado para consistência
            }
        });
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        self.postMessage({ id, type: 'error', error: `Worker: ${errorMessage}` });
    }
};