/**
 * psf_analyzer.js
 *
 * Módulo para gerenciar a interface e a lógica da Análise da Point Spread Function (PSF).
 * Interage com psf_analysis_worker.js para cálculos e atualiza a UI.
 * Modificado para:
 * - Usar "Volume" em vez de "Área".
 * - Incluir o cálculo de Theta_pico.
 * - Fazer triggerFullPSFVolumeCalculation retornar uma Promise.
 * - Disparar um evento 'psfTotalVolumeCalculated' quando o volume total estiver pronto.
 */

class PSFAnalyzer {
    constructor() {
        // IDs dos elementos da UI
        this.calculateVolumeBtnId = 'calculate-psf-volume-btn';
        this.totalVolumeDisplayId = 'psf-total-volume-display';
        this.totalVolumeValueId = 'psf-total-volume-value';
        this.thetaPicoValueId = 'theta-pico-value';

        this.sllThetaInputId = 'sll-theta-input';
        this.sllConeVolumeId = 'sll-cone-volume';
        this.sllPercentageId = 'sll-percentage';

        this.eePercentageInputId = 'ee-percentage-input';
        this.eeFractionalVolumeId = 'ee-fractional-volume';
        this.eeThetaResultId = 'ee-theta-result';
        this.statusDisplayId = 'psf-analysis-status';

        // Referências aos elementos DOM
        this.calculateVolumeBtn = null;
        this.totalVolumeDisplay = null;
        this.totalVolumeValue = null;
        this.thetaPicoValue = null;

        this.sllThetaInput = null;
        this.sllConeVolume = null;
        this.sllPercentage = null;

        this.eePercentageInput = null;
        this.eeFractionalVolume = null;
        this.eeThetaResult = null;
        this.statusDisplay = null;

        // Estado interno
        this.psfWorker = null; // Exposto para que psf_ee_theta_plot possa usá-lo
        this.currentTaskId = 0;
        this.isCalculating = false;
        this.cachedTotalPSFVolume = null;
        this.cachedThetaPico = null;

        // Dados do arranjo e do elemento
        this.antennaCoords = null;
        this.elementFieldData3D = null;
        this.K_CONST = null;

        // Promessa para o cálculo do volume total
        this.volumeCalculationPromise = null;
        this.volumeCalculationResolve = null;
        this.volumeCalculationReject = null;


        this._init();
    }

    _init() {
        this.calculateVolumeBtn = document.getElementById(this.calculateVolumeBtnId);
        this.totalVolumeDisplay = document.getElementById(this.totalVolumeDisplayId);
        this.totalVolumeValue = document.getElementById(this.totalVolumeValueId);
        this.thetaPicoValue = document.getElementById(this.thetaPicoValueId);

        this.sllThetaInput = document.getElementById(this.sllThetaInputId);
        this.sllConeVolume = document.getElementById(this.sllConeVolumeId);
        this.sllPercentage = document.getElementById(this.sllPercentageId);

        this.eePercentageInput = document.getElementById(this.eePercentageInputId);
        this.eeFractionalVolume = document.getElementById(this.eeFractionalVolumeId);
        this.eeThetaResult = document.getElementById(this.eeThetaResultId);
        this.statusDisplay = document.getElementById(this.statusDisplayId);

        if (!this.calculateVolumeBtn || !this.sllThetaInput || !this.eePercentageInput || !this.statusDisplay || !this.thetaPicoValue) {
            console.error("PSFAnalyzer: Falha ao encontrar um ou mais elementos DOM essenciais. A funcionalidade pode estar comprometida.");
            return;
        }

        if (window.Worker) {
            try {
                this.psfWorker = new Worker('js/psf_analysis_worker.js');
                this.psfWorker.onmessage = (e) => this._handleWorkerMessage(e.data);
                this.psfWorker.onerror = (e) => {
                    console.error("Erro no PSF Analysis Worker:", e);
                    this._updateStatus(`Erro no worker: ${e.message}`, true);
                    this._setCalculating(false);
                    if (this.volumeCalculationReject) {
                        this.volumeCalculationReject(new Error(`Erro no worker: ${e.message}`));
                        this.volumeCalculationPromise = null;
                    }
                };
            } catch (err) {
                console.error("Falha ao criar PSF Analysis Worker:", err);
                this._updateStatus("Erro ao inicializar worker de análise.", true);
                this.psfWorker = null;
            }
        } else {
            this._updateStatus("Web Workers não suportados. Análise da PSF indisponível.", true);
        }

        this.calculateVolumeBtn.addEventListener('click', () => this.triggerFullPSFVolumeCalculation());
        this.sllThetaInput.addEventListener('change', () => this.triggerSLLCalculation());
        this.eePercentageInput.addEventListener('change', () => this.triggerEECalculation());

        window.addEventListener('layoutGenerated', () => this.handleNewLayout());

        this._resetUIForNewLayout();
        console.log("PSFAnalyzer inicializado.");
    }

    updateData(antennaCoords, elementFieldData3D, K) {
        this.antennaCoords = antennaCoords;
        this.elementFieldData3D = elementFieldData3D;
        this.K_CONST = K;

        const hasAntennaData = this.antennaCoords && this.antennaCoords.length > 0;
        const hasEFieldData = this.elementFieldData3D && Array.isArray(this.elementFieldData3D) && this.elementFieldData3D.length > 0;
        const hasKConst = this.K_CONST !== null;
        const volumeNotYetCalculated = this.cachedTotalPSFVolume === null;

        if (this.calculateVolumeBtn) {
            if (hasAntennaData && hasEFieldData && hasKConst && volumeNotYetCalculated) {
                this.calculateVolumeBtn.disabled = false;
                this._updateStatus('Pronto para calcular o volume da PSF.');
            } else {
                this.calculateVolumeBtn.disabled = true;
                if (volumeNotYetCalculated && (!hasAntennaData || !hasEFieldData || !hasKConst)) {
                    this._updateStatus('Aguardando dados completos para análise da PSF...');
                }
            }
        }
        // Notificar o plotter da curva EE(Theta) sobre a atualização dos dados base
        if (window.psfEeThetaPlotter && typeof window.psfEeThetaPlotter.updateCoreData === 'function') {
            window.psfEeThetaPlotter.updateCoreData(this.antennaCoords, this.elementFieldData3D, this.K_CONST);
        }
    }
    
    handleNewLayout() {
        console.log("PSFAnalyzer: Novo layout detectado. Resetando análise.");
        this.cachedTotalPSFVolume = null; 
        this.cachedThetaPico = null;
        this.volumeCalculationPromise = null; // Reseta a promessa
        this._resetUIForNewLayout();
        // Notifica o plotter da curva EE(Theta) que o layout mudou
        if (window.psfEeThetaPlotter && typeof window.psfEeThetaPlotter.handleDataChange === 'function') {
            window.psfEeThetaPlotter.handleDataChange();
        }
    }

    _resetUIForNewLayout() {
        if (this.calculateVolumeBtn) {
            this.calculateVolumeBtn.style.display = 'inline-block';
            this.calculateVolumeBtn.disabled = !(this.antennaCoords && this.antennaCoords.length > 0 && this.elementFieldData3D && this.K_CONST);
        }
        if (this.totalVolumeDisplay) this.totalVolumeDisplay.style.display = 'none';
        if (this.totalVolumeValue) this.totalVolumeValue.textContent = '--';
        if (this.thetaPicoValue) this.thetaPicoValue.textContent = '--';

        if (this.sllThetaInput) this.sllThetaInput.disabled = true;
        if (this.sllConeVolume) this.sllConeVolume.textContent = '--';
        if (this.sllPercentage) this.sllPercentage.textContent = '--';

        if (this.eePercentageInput) this.eePercentageInput.disabled = true;
        if (this.eeFractionalVolume) this.eeFractionalVolume.textContent = '--';
        if (this.eeThetaResult) this.eeThetaResult.textContent = '--';

        this._updateStatus('Aguardando cálculo do volume da PSF...');
        this._setCalculating(false); 
    }

    _setCalculating(calculating) {
        this.isCalculating = calculating;
        if (this.calculateVolumeBtn) {
            // Só desabilita se estiver calculando OU se os dados não estiverem prontos (caso não seja uma chamada interna)
            const dataReady = this.antennaCoords && this.antennaCoords.length > 0 &&
                              this.elementFieldData3D && Array.isArray(this.elementFieldData3D) && this.elementFieldData3D.length > 0 &&
                              this.K_CONST !== null;
            this.calculateVolumeBtn.disabled = calculating || !dataReady;
        }
        if (this.sllThetaInput) this.sllThetaInput.disabled = calculating || this.cachedTotalPSFVolume === null;
        if (this.eePercentageInput) this.eePercentageInput.disabled = calculating || this.cachedTotalPSFVolume === null;
    }

    _updateStatus(message, isError = false) {
        if (this.statusDisplay) {
            this.statusDisplay.textContent = message;
            this.statusDisplay.style.color = isError ? 'var(--secondary-color)' : 'var(--text-color)';
        }
    }

    _hasRequiredData() {
        if (!this.psfWorker) {
            this._updateStatus("Worker de análise não está pronto.", true);
            return false;
        }
        if (!this.antennaCoords || this.antennaCoords.length === 0) {
            this._updateStatus("Dados do arranjo de antenas não disponíveis.", true);
            return false;
        }
        if (!this.elementFieldData3D || !Array.isArray(this.elementFieldData3D) || this.elementFieldData3D.length === 0) {
            this._updateStatus("Dados do elemento de antena (3D) não disponíveis.", true);
            return false;
        }
        if (this.K_CONST === null) {
            this._updateStatus("Constante K não disponível.", true);
            return false;
        }
        return true;
    }

    /**
     * Dispara o cálculo do volume total da PSF e de Theta_pico.
     * @param {boolean} [isInternalCall=false] - Indica se a chamada é interna (ex: do EEThetaPlotter).
     * @returns {Promise<{totalVolume: number, thetaPico: number | null}>}
     */
    triggerFullPSFVolumeCalculation(isInternalCall = false) {
        if (this.isCalculating) {
            // Se já está calculando, retorna a promessa existente ou uma promessa rejeitada
            return this.volumeCalculationPromise || Promise.reject(new Error("Cálculo já em andamento."));
        }
        if (!this._hasRequiredData()) {
            if (!isInternalCall) this._updateStatus("Dados insuficientes para cálculo.", true);
            return Promise.reject(new Error("Dados insuficientes para cálculo."));
        }

        this._setCalculating(true);
        this._updateStatus('Calculando volume total da PSF e Θ_pico...');
        this.currentTaskId++;

        this.volumeCalculationPromise = new Promise((resolve, reject) => {
            this.volumeCalculationResolve = resolve;
            this.volumeCalculationReject = reject;
        });

        this.psfWorker.postMessage({
            id: this.currentTaskId,
            command: 'calculateTotalVolumeAndThetaPico',
            antennaCoords: this.antennaCoords,
            elementFieldData3D: this.elementFieldData3D,
            K_CONST: this.K_CONST
        });
        return this.volumeCalculationPromise;
    }

    triggerSLLCalculation() {
        if (this.isCalculating || this.cachedTotalPSFVolume === null || !this._hasRequiredData() || !this.sllThetaInput) return;

        const sllThetaDeg = parseFloat(this.sllThetaInput.value);
        if (isNaN(sllThetaDeg) || sllThetaDeg <= 0 || sllThetaDeg > 90) {
            this._updateStatus("Valor de Theta para SLL inválido.", true);
            if (this.sllConeVolume) this.sllConeVolume.textContent = '--';
            if (this.sllPercentage) this.sllPercentage.textContent = '--';
            return;
        }

        this._setCalculating(true);
        this._updateStatus(`Calculando SLL para Θ=${sllThetaDeg}°...`);
        this.currentTaskId++;
        this.psfWorker.postMessage({
            id: this.currentTaskId,
            command: 'calculateSLL',
            antennaCoords: this.antennaCoords, 
            elementFieldData3D: this.elementFieldData3D,
            K_CONST: this.K_CONST,
            sllThetaDeg: sllThetaDeg
        });
    }

    triggerEECalculation() {
        if (this.isCalculating || this.cachedTotalPSFVolume === null || !this._hasRequiredData() || !this.eePercentageInput) return;

        const eePercentage = parseFloat(this.eePercentageInput.value);
        if (isNaN(eePercentage) || eePercentage <= 0 || eePercentage >= 100) {
            this._updateStatus("Valor de porcentagem para EE inválido.", true);
            if (this.eeFractionalVolume) this.eeFractionalVolume.textContent = '--';
            if (this.eeThetaResult) this.eeThetaResult.textContent = '--';
            return;
        }

        this._setCalculating(true);
        this._updateStatus(`Calculando EE para ${eePercentage}%...`);
        this.currentTaskId++;
        this.psfWorker.postMessage({
            id: this.currentTaskId,
            command: 'calculateEE',
            antennaCoords: this.antennaCoords, 
            elementFieldData3D: this.elementFieldData3D,
            K_CONST: this.K_CONST,
            eePercentage: eePercentage
        });
    }

    _handleWorkerMessage(workerData) {
        // Ignora mensagens de tarefas que não são a atual, exceto progresso
        // que pode ser de qualquer tarefa ativa (embora aqui só temos uma principal por vez)
        if (workerData.id !== this.currentTaskId && workerData.type !== 'progress') {
            // Verifica se é uma mensagem para o PSFEeThetaPlotter, se ele estiver esperando
            // Isso é um pouco hacky, o ideal seria o worker identificar o tipo de tarefa na resposta.
            // No entanto, o PSFEeThetaPlotter agora adiciona seu próprio handler temporário.
            // console.log("PSFAnalyzer: Mensagem de worker ignorada (ID de tarefa obsoleto ou não destinada a este handler).", workerData);
            return;
        }


        switch (workerData.type) {
            case 'progress':
                // Só atualiza o status se a mensagem for da tarefa atual do PSFAnalyzer
                // ou se não houver uma tarefa específica sendo rastreada pelo EE plotter.
                // O EE plotter agora trata seus próprios progressos.
                if (workerData.id === this.currentTaskId) {
                     this._updateStatus(workerData.data);
                }
                break;
            case 'resultTotalVolumeAndThetaPico':
                this.cachedTotalPSFVolume = workerData.data.totalVolume;
                this.cachedThetaPico = workerData.data.thetaPico;

                if (this.totalVolumeValue) this.totalVolumeValue.textContent = this.cachedTotalPSFVolume.toExponential(4);
                if (this.thetaPicoValue) {
                    this.thetaPicoValue.textContent = this.cachedThetaPico !== null ? this.cachedThetaPico.toFixed(2) : '--';
                }
                
                if (this.calculateVolumeBtn) this.calculateVolumeBtn.style.display = 'none';
                if (this.totalVolumeDisplay) this.totalVolumeDisplay.style.display = 'inline';
                
                this._updateStatus('Volume total da PSF e Θ_pico calculados.');
                this._setCalculating(false);
                
                if (this.sllThetaInput) this.sllThetaInput.disabled = false;
                if (this.eePercentageInput) this.eePercentageInput.disabled = false;

                // Dispara evento para notificar que o volume total está pronto
                window.dispatchEvent(new CustomEvent('psfTotalVolumeCalculated', {
                    detail: { totalVolume: this.cachedTotalPSFVolume, thetaPico: this.cachedThetaPico }
                }));
                
                // Resolve a promessa do cálculo de volume
                if (this.volumeCalculationResolve) {
                    this.volumeCalculationResolve({ totalVolume: this.cachedTotalPSFVolume, thetaPico: this.cachedThetaPico });
                    this.volumeCalculationPromise = null;
                }

                this.triggerSLLCalculation(); 
                break;
            case 'resultSLL':
                const coneVolume = workerData.data.coneVolume;
                if (this.sllConeVolume) this.sllConeVolume.textContent = coneVolume.toExponential(4);
                if (this.cachedTotalPSFVolume !== null && this.cachedTotalPSFVolume > 1e-9) {
                    const percentage = (coneVolume / this.cachedTotalPSFVolume) * 100;
                    if (this.sllPercentage) this.sllPercentage.textContent = percentage.toFixed(2);
                } else {
                    if (this.sllPercentage) this.sllPercentage.textContent = this.cachedTotalPSFVolume === 0 ? 'Div/0' : '--';
                }
                this._updateStatus(`SLL para Θ=${workerData.data.sllThetaDeg}° calculado.`);
                this._setCalculating(false);
                if(!this.isCalculating) this.triggerEECalculation(); // Chama EE após SLL
                break;
            case 'resultEE':
                const { thetaEE, fractionalVolume, eePercentage: returnedEEPercentage } = workerData.data;
                if (workerData.data.error) {
                    this._updateStatus(`Erro EE: ${workerData.data.error}`, true);
                    if(this.eeThetaResult) this.eeThetaResult.textContent = "Erro";
                    if(this.eeFractionalVolume) this.eeFractionalVolume.textContent = "Erro";
                } else {
                    if (this.eeFractionalVolume) this.eeFractionalVolume.textContent = fractionalVolume.toExponential(4);
                    if (this.eeThetaResult) this.eeThetaResult.textContent = thetaEE.toFixed(2);
                    this._updateStatus(`EE para ${returnedEEPercentage}% calculado: Θ = ${thetaEE.toFixed(2)}°.`);
                }
                this._setCalculating(false);
                break;
            case 'error':
                this._updateStatus(`Erro do Worker PSF: ${workerData.error}`, true);
                this._setCalculating(false);
                // Rejeita a promessa se houver um erro durante o cálculo do volume
                if (this.volumeCalculationReject) {
                    this.volumeCalculationReject(new Error(workerData.error));
                    this.volumeCalculationPromise = null;
                }
                break;
        }
    }
}

if (typeof window !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
        if (!window.psfAnalyzer) {
            window.psfAnalyzer = new PSFAnalyzer();
        }
    });
}