/**
 * beam_worker_3d.js
 *
 * Web Worker para calcular o Array Factor (AF) e aplicar ao campo do elemento
 * para uma varredura completa de ângulos Theta e Phi, preparando dados para um plot 3D.
 * Retorna grades de magnitude em dB e linear normalizada.
 */

function computeAFForPoint(theta_deg, phi_deg, antennaCoords, k, theta_0_deg = 0, phi_0_deg = 0) {
    if (antennaCoords.length === 0) {
        return { re: 1, im: 0 }; 
    }
    const DEG_TO_RAD = Math.PI / 180;
    const theta_rad = theta_deg * DEG_TO_RAD;
    const phi_rad = phi_deg * DEG_TO_RAD;
    const theta_0_rad = theta_0_deg * DEG_TO_RAD;
    const phi_0_rad = phi_0_deg * DEG_TO_RAD;
    const scanVecX = Math.sin(theta_0_rad) * Math.cos(phi_0_rad);
    const scanVecY = Math.sin(theta_0_rad) * Math.sin(phi_0_rad);
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


self.onmessage = function(e) {
    const { id, antennaCoords, elementFieldData3D, K_CONST } = e.data;

    if (!elementFieldData3D || elementFieldData3D.length === 0) {
        self.postMessage({ id, type: 'error', error: 'Worker 3D: Dados do elemento 3D estão vazios.' });
        return;
    }

    self.postMessage({ type: 'progress', id, data: 'Worker 3D: Iniciando cálculos... 0%' });

    try {
        const magnitudes_data = []; // Array de {phi, theta, mag_linear}
        const uniquePhiSet = new Set();
        const uniqueThetaSet = new Set();

        const totalPoints = elementFieldData3D.length;
        let lastReportedProgress = 0;

        elementFieldData3D.forEach((elementPoint, index) => {
            uniquePhiSet.add(elementPoint.phi_deg);
            uniqueThetaSet.add(elementPoint.theta_deg);

            const af_complex = computeAFForPoint(elementPoint.theta_deg, elementPoint.phi_deg, antennaCoords, K_CONST);

            const rEThetaTotal_re = elementPoint.rETheta.re * af_complex.re - elementPoint.rETheta.im * af_complex.im;
            const rEThetaTotal_im = elementPoint.rETheta.re * af_complex.im + elementPoint.rETheta.im * af_complex.re;
            const rEPhiTotal_re = elementPoint.rEPhi.re * af_complex.re - elementPoint.rEPhi.im * af_complex.im;
            const rEPhiTotal_im = elementPoint.rEPhi.re * af_complex.im + elementPoint.rEPhi.im * af_complex.re;
            
            const linear_magnitude = Math.sqrt(
                rEThetaTotal_re * rEThetaTotal_re + rEThetaTotal_im * rEThetaTotal_im +
                rEPhiTotal_re * rEPhiTotal_re + rEPhiTotal_im * rEPhiTotal_im
            );
            magnitudes_data.push({ // Armazena magnitude linear
                phi: elementPoint.phi_deg,
                theta: elementPoint.theta_deg,
                mag_linear: linear_magnitude 
            });

            const currentProgress = Math.round(((index + 1) / totalPoints) * 100);
            if (currentProgress > lastReportedProgress) {
                self.postMessage({ type: 'progress', id, data: `Worker 3D: Calculando... ${currentProgress}%` });
                lastReportedProgress = currentProgress;
            }
        });
        
        self.postMessage({ type: 'progress', id, data: 'Worker 3D: Processando dados para plotagem...' });

        const uniquePhis = Array.from(uniquePhiSet).sort((a, b) => a - b);
        const uniqueThetas = Array.from(uniqueThetaSet).sort((a, b) => a - b);

        const magnitudeMapLinear = new Map();
        magnitudes_data.forEach(m => {
            const key = `${m.phi}_${m.theta}`;
            magnitudeMapLinear.set(key, m.mag_linear);
        });
        
        const z_grid_linear_raw = Array(uniqueThetas.length).fill(null).map(() => Array(uniquePhis.length).fill(0));
        let max_linear_magnitude = 1e-10; 

        for (let i = 0; i < uniqueThetas.length; i++) {
            for (let j = 0; j < uniquePhis.length; j++) {
                const key = `${uniquePhis[j]}_${uniqueThetas[i]}`;
                const linear_mag = magnitudeMapLinear.get(key) || 0;
                z_grid_linear_raw[i][j] = linear_mag;
                if (linear_mag > max_linear_magnitude) {
                    max_linear_magnitude = linear_mag;
                }
            }
        }
        
        // Grade Linear Normalizada
        const z_grid_linear_normalized = z_grid_linear_raw.map(row =>
            row.map(val => (max_linear_magnitude > 0 ? val / max_linear_magnitude : 0))
        );

        // Grade dB
        const z_grid_db = z_grid_linear_raw.map(row =>
            row.map(val => {
                if (val <= 0 || max_linear_magnitude <= 0) return -100;
                const dbVal = 20 * Math.log10(Math.max(val / max_linear_magnitude, 1e-10));
                return Math.max(-100, dbVal);
            })
        );

        self.postMessage({ type: 'progress', id, data: 'Worker 3D: Cálculo concluído.' });

        self.postMessage({
            id,
            type: 'result3D',
            data: {
                uniquePhis_deg: uniquePhis,    
                uniqueThetas_deg: uniqueThetas, 
                magnitudes_grid_dB: z_grid_db,
                magnitudes_grid_linear_normalized: z_grid_linear_normalized // Nova grade adicionada
            }
        });

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        self.postMessage({ id, type: 'error', error: `Worker 3D: ${errorMessage}` });
    }
};