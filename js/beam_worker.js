/**
 * beam_worker.js
 *
 * Web Worker para calcular o Array Factor (AF) para um corte 2D (Phi constante)
 * e aplicar este AF ao campo E-field do elemento individual.
 * Retorna os valores de Theta e a magnitude resultante para plotagem.
 * Utiliza TypedArrays para otimizações de performance.
 */

// --- Funções de Cálculo (Otimizadas) ---

/**
 * Calcula o Array Factor (AF) complexo para um conjunto de ângulos (theta, phi).
 * Esta versão é otimizada para execução dentro do Web Worker.
 * @param {Float64Array} theta_deg_array Array de ângulos theta em graus.
 * @param {Float64Array} phi_deg_array Array de ângulos phi em graus (para plot 2D, este será constante).
 * @param {Array<Array<number>>} antennaCoords Array de coordenadas [x,y] das antenas (metros).
 * @param {number} k Constante do número de onda (2*PI/lambda).
 * @param {number} [theta_0_deg=0] Ângulo de varredura (steering) theta em graus (não usado atualmente, aponta para o zênite).
 * @param {number} [phi_0_deg=0] Ângulo de varredura (steering) phi em graus (não usado atualmente).
 * @returns {object} Objeto contendo { af_re: Float64Array, af_im: Float64Array } - partes real e imaginária do AF.
 */
function computeAF_worker_optimized(theta_deg_array, phi_deg_array, antennaCoords, k, theta_0_deg = 0, phi_0_deg = 0) {
    const numPoints = theta_deg_array.length;
    self.postMessage({ type: 'progress', data: `Worker 2D: Iniciando cálculo AF para ${antennaCoords.length} antenas, ${numPoints} pontos angulares...` });

    if (numPoints === 0) {
        self.postMessage({ type: 'progress', data: "Worker 2D: Nenhum ponto angular fornecido para cálculo do AF." });
        return { af_re: new Float64Array(0), af_im: new Float64Array(0) };
    }
    // Validação importante: os arrays de ângulos devem ter o mesmo tamanho.
    if (theta_deg_array.length !== phi_deg_array.length) {
        console.error("Worker 2D: Disparidade no comprimento dos arrays Theta e Phi para cálculo do AF.", {theta_len: theta_deg_array.length, phi_len: phi_deg_array.length});
        throw new Error("Worker 2D: Disparidade no comprimento dos arrays Theta e Phi. Impossível calcular AF.");
    }


    const af_re = new Float64Array(numPoints); // Parte real do AF para cada ponto angular
    const af_im = new Float64Array(numPoints); // Parte imaginária do AF para cada ponto angular

    // Se não há antenas (ou apenas uma no centro de referência), o AF é 1 (sem efeito de arranjo).
    if (antennaCoords.length === 0) {
        self.postMessage({ type: 'progress', data: "Worker 2D: Nenhuma antena fornecida. AF será 1 (sem efeito de arranjo)." });
        for(let i=0; i < numPoints; i++) {
            af_re[i] = 1.0; 
            af_im[i] = 0.0;
        }
        self.postMessage({ type: 'progress', data: "Worker 2D: Cálculo AF (sem antenas) concluído." });
        return { af_re, af_im };
    }

    const numAntennas = antennaCoords.length;
    // Extrai coordenadas X e Y das antenas para TypedArrays para acesso mais rápido.
    const antX = new Float64Array(numAntennas);
    const antY = new Float64Array(numAntennas);
    for (let i = 0; i < numAntennas; i++) {
        antX[i] = Number(antennaCoords[i][0]);
        antY[i] = Number(antennaCoords[i][1]);
    }

    const DEG_TO_RAD = Math.PI / 180;
    // Converte ângulos de varredura para radianos (atualmente fixos em 0,0 - zênite).
    const theta_0_rad = theta_0_deg * DEG_TO_RAD;
    const phi_0_rad = phi_0_deg * DEG_TO_RAD;

    // Componentes do vetor de onda para a direção de varredura (scan vector).
    const scanVecX = Math.sin(theta_0_rad) * Math.cos(phi_0_rad);
    const scanVecY = Math.sin(theta_0_rad) * Math.sin(phi_0_rad);
    // O componente Z (scanVecZ = Math.cos(theta_0_rad)) não é usado aqui pois as antenas estão no plano XY.

    const progressInterval = Math.max(1, Math.floor(numPoints / 20)); // Envia progresso a cada ~5%

    // Itera sobre cada ponto angular (direção de observação).
    for (let i = 0; i < numPoints; i++) {
        const theta_rad_i = theta_deg_array[i] * DEG_TO_RAD;
        const phi_rad_i = phi_deg_array[i] * DEG_TO_RAD; // Usa o phi correspondente a este theta.

        // Componentes do vetor de onda para a direção de observação atual.
        const obsVecX = Math.sin(theta_rad_i) * Math.cos(phi_rad_i);
        const obsVecY = Math.sin(theta_rad_i) * Math.sin(phi_rad_i);

        // Diferença entre vetores de observação e varredura, multiplicada por k.
        // Esta é a parte crucial para o cálculo da fase de cada antena.
        const k_diffX = k * (obsVecX - scanVecX);
        const k_diffY = k * (obsVecY - scanVecY);

        let sumRe = 0.0; // Somatório da parte real da exponencial complexa (cos(phase))
        let sumIm = 0.0; // Somatório da parte imaginária da exponencial complexa (sin(phase))

        // Itera sobre cada antena para somar suas contribuições de fase.
        for (let j = 0; j < numAntennas; j++) {
            // Argumento da exponencial: k * dot_product( (r_obs - r_scan), pos_antena_j )
            // Simplificado para 2D: k_diffX * antX[j] + k_diffY * antY[j]
            const phase = k_diffX * antX[j] + k_diffY * antY[j];
            sumRe += Math.cos(phase);
            sumIm += Math.sin(phase);
        }
        af_re[i] = sumRe;
        af_im[i] = sumIm;

        // Envia mensagem de progresso periodicamente.
        if (i > 0 && i % progressInterval === 0) {
            self.postMessage({ type: 'progress', data: `Worker 2D: Cálculo AF ${Math.round((i / numPoints) * 100)}% concluído...` });
        }
    }
    self.postMessage({ type: 'progress', data: "Worker 2D: Cálculo AF 100% concluído." });
    return { af_re, af_im };
}

/**
 * Multiplica o campo E-field complexo do elemento individual pelo Array Factor (AF) complexo.
 * E_total = E_elemento * AF
 * A magnitude do E_total é então calculada.
 * @param {Array<Object>} elementFieldData Array de objetos, cada um contendo {theta, phi, rETheta, rEPhi},
 *                                         onde rETheta e rEPhi são objetos {re, im}.
 * @param {Float64Array} af_re_array Parte real do Array Factor para cada ponto angular.
 * @param {Float64Array} af_im_array Parte imaginária do Array Factor para cada ponto angular.
 * @returns {Float64Array} Array com as magnitudes resultantes do campo total para cada ponto angular.
 */
function applyAF_worker_optimized(elementFieldData, af_re_array, af_im_array) {
    const numPoints = elementFieldData.length;
    self.postMessage({ type: 'progress', data: "Worker 2D: Aplicando AF ao campo do elemento..." });

    // Validação: os arrays de E-field e AF devem ter o mesmo comprimento.
    if (numPoints !== af_re_array.length || numPoints !== af_im_array.length) {
        console.error("Worker 2D: Disparidade de comprimento dos arrays ao aplicar AF.", {ef_len: numPoints, af_re_len: af_re_array.length, af_im_len: af_im_array.length});
        throw new Error("Worker 2D: Disparidade no comprimento dos dados de campo do elemento e arrays AF.");
    }

    const resultingMagnitude = new Float64Array(numPoints);

    for (let i = 0; i < numPoints; i++) {
        const element = elementFieldData[i];
        // Validação crucial: garante que os dados do elemento são válidos.
        if (!element || !element.rETheta || typeof element.rETheta.re !== 'number' || typeof element.rETheta.im !== 'number' ||
            !element.rEPhi || typeof element.rEPhi.re !== 'number' || typeof element.rEPhi.im !== 'number') {
            console.error(`Worker 2D: Dados do elemento inválidos no índice ${i}:`, element);
            resultingMagnitude[i] = 0; // Define magnitude como 0 em caso de erro nos dados.
            continue; 
        }

        const af_r = af_re_array[i]; // AF real para este ponto
        const af_i = af_im_array[i]; // AF imaginário para este ponto

        // Multiplicação complexa: (a+jb)*(c+jd) = (ac-bd) + j(ad+bc)
        // Para E_theta_total = E_theta_elemento * AF
        const rEThetaTotal_re = element.rETheta.re * af_r - element.rETheta.im * af_i;
        const rEThetaTotal_im = element.rETheta.re * af_i + element.rETheta.im * af_r;

        // Para E_phi_total = E_phi_elemento * AF
        const rEPhiTotal_re = element.rEPhi.re * af_r - element.rEPhi.im * af_i;
        const rEPhiTotal_im = element.rEPhi.re * af_i + element.rEPhi.im * af_r;
        
        // Magnitude total do campo: sqrt( |E_theta_total|^2 + |E_phi_total|^2 )
        // Onde |complex|^2 = re^2 + im^2
        resultingMagnitude[i] = Math.sqrt(
            rEThetaTotal_re * rEThetaTotal_re + rEThetaTotal_im * rEThetaTotal_im +
            rEPhiTotal_re * rEPhiTotal_re + rEPhiTotal_im * rEPhiTotal_im
        );
    }
    self.postMessage({ type: 'progress', data: "Worker 2D: Aplicação do AF concluída." });
    return resultingMagnitude;
}

// --- Listener de Mensagens da Thread Principal ---
/**
 * Manipulador de mensagens recebidas da thread principal.
 * Recebe os dados das antenas, dados do E-field do elemento, e constantes.
 * Executa os cálculos e envia o resultado (ou erro) de volta.
 */
self.onmessage = function(e) {
    const { id, antennaCoords, filteredElementData, K_CONST, selectedPhiValue } = e.data;
    
    // Validação inicial dos dados recebidos.
    if (!filteredElementData || !Array.isArray(filteredElementData) || filteredElementData.length === 0) {
        console.error("Worker 2D: 'filteredElementData' está vazio ou não é um array.", filteredElementData);
        self.postMessage({ id, type: 'error', error: 'Worker 2D: Dados do elemento filtrado estão vazios ou em formato inválido.' });
        return;
    }
    
    // Valida o formato do primeiro elemento (amostra).
    if (filteredElementData.length > 0) {
        const firstElement = filteredElementData[0];
        if (typeof firstElement.theta !== 'number' || typeof firstElement.phi !== 'number' ||
            !firstElement.rETheta || !firstElement.rEPhi) {
            console.error("Worker 2D: Primeiro elemento em 'filteredElementData' tem formato inesperado.", firstElement);
            self.postMessage({ id, type: 'error', error: 'Worker 2D: Formato de dados do elemento inválido.' });
            return;
        }
    }

    try {
        // Extrai os valores de theta e phi (em graus) dos dados do elemento.
        // Para um corte 2D, todos os `phi` em `filteredElementData` devem ser iguais a `selectedPhiValue`.
        const thetaValuesDeg = new Float64Array(filteredElementData.map(point => point.theta));
        const phiValuesDeg = new Float64Array(filteredElementData.map(point => point.phi));

        // Calcula o Array Factor.
        // Parâmetros de steering (theta_0, phi_0) são omitidos, usando o padrão (0,0) - zênite.
        const { af_re, af_im } = computeAF_worker_optimized(thetaValuesDeg, phiValuesDeg, antennaCoords, K_CONST);

        // Aplica o AF ao campo do elemento para obter a magnitude resultante.
        const resultingMagnitudeTyped = applyAF_worker_optimized(filteredElementData, af_re, af_im);

        // Converte TypedArrays de volta para arrays normais para postMessage (Plotly pode preferir).
        const resultingMagnitude = Array.from(resultingMagnitudeTyped);
        const finalThetaValues = Array.from(thetaValuesDeg); 

        // Envia o resultado de volta para a thread principal.
        self.postMessage({
            id, // ID da requisição original, para correspondência.
            type: 'result',
            data: {
                thetaValues: finalThetaValues, 
                resultingMagnitude,
                phiValue: selectedPhiValue // Inclui o Phi do corte para referência no plot.
            }
        });
    } catch (error) {
        // Em caso de erro durante os cálculos, envia uma mensagem de erro.
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error("Worker 2D error:", error);
        self.postMessage({ id, type: 'error', error: `Worker 2D: ${errorMessage}` });
    }
};