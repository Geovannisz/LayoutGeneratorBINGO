/**
 * psf_analyzer.js
 *
 * Módulo para gerenciar a interface e a lógica da Análise da Point Spread Function (PSF).
 * Interage com psf_analysis_worker.js para cálculos e atualiza a UI.
 * Modificado para usar "Volume" em vez de "Área" e para incluir o cálculo de Theta_pico.
 */

class PSFAnalyzer {
    constructor() {
        // IDs dos elementos da UI
        this.calculateVolumeBtnId = 'calculate-psf-volume-btn'; // Alterado de calculate-psf-area-btn
        this.totalVolumeDisplayId = 'psf-total-volume-display'; // Alterado de psf-total-area-display
        this.totalVolumeValueId = 'psf-total-volume-value';   // Alterado de psf-total-area-value
        this.thetaPicoValueId = 'theta-pico-value';           // NOVO para Theta_pico

        this.sllThetaInputId = 'sll-theta-input';
        this.sllConeVolumeId = 'sll-cone-volume';           // Alterado de sll-cone-area
        this.sllPercentageId = 'sll-percentage';

        this.eePercentageInputId = 'ee-percentage-input';
        this.eeFractionalVolumeId = 'ee-fractional-volume'; // Alterado de ee-fractional-area
        this.eeThetaResultId = 'ee-theta-result';
        this.statusDisplayId = 'psf-analysis-status';

        // Referências aos elementos DOM (serão buscadas no init)
        this.calculateVolumeBtn = null;
        this.totalVolumeDisplay = null;
        this.totalVolumeValue = null;
        this.thetaPicoValue = null; // NOVO

        this.sllThetaInput = null;
        this.sllConeVolume = null;
        this.sllPercentage = null;

        this.eePercentageInput = null;
        this.eeFractionalVolume = null;
        this.eeThetaResult = null;
        this.statusDisplay = null;

        // Estado interno
        this.psfWorker = null;
        this.currentTaskId = 0;
        this.isCalculating = false;
        this.cachedTotalPSFVolume = null; // Armazena o volume total calculado
        this.cachedThetaPico = null;      // NOVO: Armazena Theta_pico calculado

        // Dados do arranjo e do elemento (serão fornecidos externamente)
        this.antennaCoords = null;
        this.elementFieldData3D = null; // Dados brutos do CSV 3D
        this.K_CONST = null;

        // Tenta inicializar imediatamente
        this._init();
    }

    /**
     * Inicializa o analisador, buscando elementos DOM e configurando listeners.
     * @private
     */
    _init() {
        this.calculateVolumeBtn = document.getElementById(this.calculateVolumeBtnId);
        this.totalVolumeDisplay = document.getElementById(this.totalVolumeDisplayId);
        this.totalVolumeValue = document.getElementById(this.totalVolumeValueId);
        this.thetaPicoValue = document.getElementById(this.thetaPicoValueId); // NOVO

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

        // Configura o Web Worker
        if (window.Worker) {
            try {
                this.psfWorker = new Worker('js/psf_analysis_worker.js');
                this.psfWorker.onmessage = (e) => this._handleWorkerMessage(e.data);
                this.psfWorker.onerror = (e) => {
                    console.error("Erro no PSF Analysis Worker:", e);
                    this._updateStatus(`Erro no worker: ${e.message}`, true);
                    this._setCalculating(false);
                };
            } catch (err) {
                console.error("Falha ao criar PSF Analysis Worker:", err);
                this._updateStatus("Erro ao inicializar worker de análise.", true);
                this.psfWorker = null;
            }
        } else {
            this._updateStatus("Web Workers não suportados. Análise da PSF indisponível.", true);
        }

        // Adiciona Listeners
        this.calculateVolumeBtn.addEventListener('click', () => this.triggerFullPSFVolumeCalculation());
        this.sllThetaInput.addEventListener('change', () => this.triggerSLLCalculation());
        this.eePercentageInput.addEventListener('change', () => this.triggerEECalculation());

        // Listener para evento de novo layout gerado
        window.addEventListener('layoutGenerated', () => this.handleNewLayout());

        // Estado inicial da UI
        this._resetUIForNewLayout();
        console.log("PSFAnalyzer inicializado.");
    }

    /**
     * Atualiza os dados do arranjo e do elemento de antena.
     * Chamado externamente quando estes dados estão disponíveis ou mudam.
     * @param {Array<Array<number>>} antennaCoords Coordenadas das antenas.
     * @param {Array<Object>} elementFieldData3D Dados do campo do elemento 3D.
     * @param {number} K Constante de onda.
     */
    updateData(antennaCoords, elementFieldData3D, K) {
        this.antennaCoords = antennaCoords;
        this.elementFieldData3D = elementFieldData3D; // Este deve ser o array de dados
        this.K_CONST = K;

        console.log("PSFAnalyzer updateData: Antennas:", this.antennaCoords ? this.antennaCoords.length : 'null',
                    "| EField3D:", this.elementFieldData3D ? `(${this.elementFieldData3D.length} points)` : 'null', // Verifica se é um array e tem length
                    "| K_CONST:", this.K_CONST,
                    "| Cached Volume:", this.cachedTotalPSFVolume);

        const hasAntennaData = this.antennaCoords && this.antennaCoords.length > 0;
        const hasEFieldData = this.elementFieldData3D && Array.isArray(this.elementFieldData3D) && this.elementFieldData3D.length > 0;
        const hasKConst = this.K_CONST !== null;
        const volumeNotYetCalculated = this.cachedTotalPSFVolume === null;

        if (this.calculateVolumeBtn) {
            if (hasAntennaData && hasEFieldData && hasKConst && volumeNotYetCalculated) {
                this.calculateVolumeBtn.disabled = false;
                this._updateStatus('Pronto para calcular o volume da PSF.'); // Atualiza status se pronto
                console.log("PSFAnalyzer: Botão Calcular Volume HABILITADO.");
            } else {
                this.calculateVolumeBtn.disabled = true;
                console.log("PSFAnalyzer: Botão Calcular Volume DESABILITADO. Razões:", {hasAntennaData, hasEFieldData, hasKConst, volumeNotYetCalculated});
                // Mantém a mensagem "Aguardando..." se o volume ainda não foi calculado e os dados não estão completos
                if (volumeNotYetCalculated && (!hasAntennaData || !hasEFieldData || !hasKConst)) {
                    this._updateStatus('Aguardando dados completos para análise da PSF...');
                }
            }
        }
    }

    _resetUIForNewLayout() {
        if (this.calculateVolumeBtn) {
            this.calculateVolumeBtn.style.display = 'inline-block';
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

        // A habilitação do botão será tratada por updateData quando os dados chegarem.
        if (this.calculateVolumeBtn) {
            this.calculateVolumeBtn.disabled = true; // Começa desabilitado
        }
        this._updateStatus('Aguardando cálculo do volume da PSF...');
        this._setCalculating(false);
    }

    /**
     * Chamado quando um novo layout de antena é gerado.
     * Reseta o estado da análise da PSF.
     */
    handleNewLayout() {
        console.log("PSFAnalyzer: Novo layout detectado. Resetando análise.");
        this.cachedTotalPSFVolume = null; 
        this.cachedThetaPico = null; // NOVO: Reseta Theta_pico
        this._resetUIForNewLayout();
    }

    /**
     * Reseta a UI da análise da PSF para o estado inicial ou após um novo layout.
     * @private
     */
    _resetUIForNewLayout() {
        if (this.calculateVolumeBtn) {
            this.calculateVolumeBtn.style.display = 'inline-block';
            this.calculateVolumeBtn.disabled = !(this.antennaCoords && this.antennaCoords.length > 0 && this.elementFieldData3D && this.K_CONST);
        }
        if (this.totalVolumeDisplay) this.totalVolumeDisplay.style.display = 'none';
        if (this.totalVolumeValue) this.totalVolumeValue.textContent = '--';
        if (this.thetaPicoValue) this.thetaPicoValue.textContent = '--'; // NOVO

        if (this.sllThetaInput) this.sllThetaInput.disabled = true;
        if (this.sllConeVolume) this.sllConeVolume.textContent = '--';
        if (this.sllPercentage) this.sllPercentage.textContent = '--';

        if (this.eePercentageInput) this.eePercentageInput.disabled = true;
        if (this.eeFractionalVolume) this.eeFractionalVolume.textContent = '--';
        if (this.eeThetaResult) this.eeThetaResult.textContent = '--';

        this._updateStatus('Aguardando cálculo do volume da PSF...'); // Termo atualizado
        this._setCalculating(false); 
    }

    /**
     * Define o estado de cálculo (bloqueia/desbloqueia UI).
     * @param {boolean} calculating
     * @private
     */
    _setCalculating(calculating) {
        this.isCalculating = calculating;
        if (this.calculateVolumeBtn) this.calculateVolumeBtn.disabled = calculating || !(this.antennaCoords && this.antennaCoords.length > 0);
        if (this.sllThetaInput) this.sllThetaInput.disabled = calculating || this.cachedTotalPSFVolume === null;
        if (this.eePercentageInput) this.eePercentageInput.disabled = calculating || this.cachedTotalPSFVolume === null;
    }

    /**
     * Atualiza a mensagem de status.
     * @param {string} message
     * @param {boolean} [isError=false]
     * @private
     */
    _updateStatus(message, isError = false) {
        if (this.statusDisplay) {
            this.statusDisplay.textContent = message;
            this.statusDisplay.style.color = isError ? 'var(--secondary-color)' : 'var(--text-color)';
        }
    }

    /**
     * Verifica se os dados necessários para os cálculos estão disponíveis.
     * @returns {boolean}
     * @private
     */
    _hasRequiredData() {
        if (!this.psfWorker) {
            this._updateStatus("Worker de análise não está pronto.", true);
            return false;
        }
        if (!this.antennaCoords || this.antennaCoords.length === 0) {
            this._updateStatus("Dados do arranjo de antenas não disponíveis.", true);
            return false;
        }
        if (!this.elementFieldData3D || this.elementFieldData3D.length === 0) {
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
     */
    triggerFullPSFVolumeCalculation() {
        if (this.isCalculating || !this._hasRequiredData()) return;

        this._setCalculating(true);
        this._updateStatus('Calculando volume total da PSF e Θ_pico...'); // Mensagem atualizada
        this.currentTaskId++;
        this.psfWorker.postMessage({
            id: this.currentTaskId,
            command: 'calculateTotalVolumeAndThetaPico', // Comando atualizado
            antennaCoords: this.antennaCoords,
            elementFieldData3D: this.elementFieldData3D,
            K_CONST: this.K_CONST
        });
    }

    /**
     * Dispara o cálculo do SLL.
     */
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

    /**
     * Dispara o cálculo da EE.
     */
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

    /**
     * Manipula mensagens recebidas do Web Worker.
     * @param {object} workerData
     * @private
     */
    _handleWorkerMessage(workerData) {
        if (workerData.id !== this.currentTaskId && workerData.type !== 'progress') {
            console.log("PSFAnalyzer: Mensagem de worker ignorada (ID de tarefa obsoleto).", workerData);
            return;
        }

        switch (workerData.type) {
            case 'progress':
                this._updateStatus(workerData.data);
                break;
            case 'resultTotalVolumeAndThetaPico': // Mensagem atualizada
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
                this.triggerSLLCalculation(); 
                break;
            case 'resultSLL':
                const coneVolume = workerData.data.coneVolume; // Nome da variável atualizado
                if (this.sllConeVolume) this.sllConeVolume.textContent = coneVolume.toExponential(4);
                if (this.cachedTotalPSFVolume !== null && this.cachedTotalPSFVolume > 1e-9) {
                    const percentage = (coneVolume / this.cachedTotalPSFVolume) * 100;
                    if (this.sllPercentage) this.sllPercentage.textContent = percentage.toFixed(2);
                } else {
                    if (this.sllPercentage) this.sllPercentage.textContent = this.cachedTotalPSFVolume === 0 ? 'Div/0' : '--';
                }
                this._updateStatus(`SLL para Θ=${workerData.data.sllThetaDeg}° calculado.`);
                this._setCalculating(false);
                if(!this.isCalculating) this.triggerEECalculation();
                break;
            case 'resultEE':
                const { thetaEE, fractionalVolume, eePercentage: returnedEEPercentage } = workerData.data; // Nome da variável atualizado
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
                break;
        }
    }
}

// Inicialização global do analisador
if (typeof window !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
        if (!window.psfAnalyzer) {
            window.psfAnalyzer = new PSFAnalyzer();
        }
    });
}