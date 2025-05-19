/**
 * psf_analyzer.js
 *
 * Módulo para gerenciar a interface e a lógica da Análise da Point Spread Function (PSF).
 * Interage com psf_analysis_worker.js para cálculos e atualiza a UI.
 */

class PSFAnalyzer {
    constructor() {
        // IDs dos elementos da UI
        this.calculateAreaBtnId = 'calculate-psf-area-btn';
        this.totalAreaDisplayId = 'psf-total-area-display';
        this.totalAreaValueId = 'psf-total-area-value';
        this.sllThetaInputId = 'sll-theta-input';
        this.sllConeAreaId = 'sll-cone-area';
        this.sllPercentageId = 'sll-percentage';
        this.eePercentageInputId = 'ee-percentage-input';
        this.eeFractionalAreaId = 'ee-fractional-area';
        this.eeThetaResultId = 'ee-theta-result';
        this.statusDisplayId = 'psf-analysis-status';

        // Referências aos elementos DOM (serão buscadas no init)
        this.calculateAreaBtn = null;
        this.totalAreaDisplay = null;
        this.totalAreaValue = null;
        this.sllThetaInput = null;
        this.sllConeArea = null;
        this.sllPercentage = null;
        this.eePercentageInput = null;
        this.eeFractionalArea = null;
        this.eeThetaResult = null;
        this.statusDisplay = null;

        // Estado interno
        this.psfWorker = null;
        this.currentTaskId = 0;
        this.isCalculating = false;
        this.cachedTotalPSFArea = null; // Armazena a área total calculada

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
        this.calculateAreaBtn = document.getElementById(this.calculateAreaBtnId);
        this.totalAreaDisplay = document.getElementById(this.totalAreaDisplayId);
        this.totalAreaValue = document.getElementById(this.totalAreaValueId);
        this.sllThetaInput = document.getElementById(this.sllThetaInputId);
        this.sllConeArea = document.getElementById(this.sllConeAreaId);
        this.sllPercentage = document.getElementById(this.sllPercentageId);
        this.eePercentageInput = document.getElementById(this.eePercentageInputId);
        this.eeFractionalArea = document.getElementById(this.eeFractionalAreaId);
        this.eeThetaResult = document.getElementById(this.eeThetaResultId);
        this.statusDisplay = document.getElementById(this.statusDisplayId);

        if (!this.calculateAreaBtn || !this.sllThetaInput || !this.eePercentageInput || !this.statusDisplay) {
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
        this.calculateAreaBtn.addEventListener('click', () => this.triggerFullPSFAreaCalculation());
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
        this.elementFieldData3D = elementFieldData3D;
        this.K_CONST = K;

        // Se os dados essenciais estiverem presentes, habilita o botão principal.
        // Caso contrário, um novo layout invalidará a área.
        if (this.antennaCoords && this.antennaCoords.length > 0 && this.elementFieldData3D && this.K_CONST) {
            if (this.cachedTotalPSFArea === null && this.calculateAreaBtn) {
                this.calculateAreaBtn.disabled = false;
            }
        } else {
            if (this.calculateAreaBtn) this.calculateAreaBtn.disabled = true;
        }
    }

    /**
     * Chamado quando um novo layout de antena é gerado.
     * Reseta o estado da análise da PSF.
     */
    handleNewLayout() {
        console.log("PSFAnalyzer: Novo layout detectado. Resetando análise.");
        this.cachedTotalPSFArea = null; // Invalida a área total cacheada
        this._resetUIForNewLayout();

        // Os dados atualizados (antennaCoords, etc.) serão passados via updateData()
        // pelo módulo que os gerencia (provavelmente main.js ou beam_pattern.js).
    }

    /**
     * Reseta a UI da análise da PSF para o estado inicial ou após um novo layout.
     * @private
     */
    _resetUIForNewLayout() {
        if (this.calculateAreaBtn) {
            this.calculateAreaBtn.style.display = 'inline-block';
            this.calculateAreaBtn.disabled = !(this.antennaCoords && this.antennaCoords.length > 0 && this.elementFieldData3D && this.K_CONST);
        }
        if (this.totalAreaDisplay) this.totalAreaDisplay.style.display = 'none';
        if (this.totalAreaValue) this.totalAreaValue.textContent = '--';

        if (this.sllThetaInput) this.sllThetaInput.disabled = true;
        if (this.sllConeArea) this.sllConeArea.textContent = '--';
        if (this.sllPercentage) this.sllPercentage.textContent = '--';

        if (this.eePercentageInput) this.eePercentageInput.disabled = true;
        if (this.eeFractionalArea) this.eeFractionalArea.textContent = '--';
        if (this.eeThetaResult) this.eeThetaResult.textContent = '--';

        this._updateStatus('Aguardando cálculo da área da PSF...');
        this._setCalculating(false); // Garante que o estado de cálculo seja resetado
    }

    /**
     * Define o estado de cálculo (bloqueia/desbloqueia UI).
     * @param {boolean} calculating
     * @private
     */
    _setCalculating(calculating) {
        this.isCalculating = calculating;
        if (this.calculateAreaBtn) this.calculateAreaBtn.disabled = calculating || !(this.antennaCoords && this.antennaCoords.length > 0);
        if (this.sllThetaInput) this.sllThetaInput.disabled = calculating || this.cachedTotalPSFArea === null;
        if (this.eePercentageInput) this.eePercentageInput.disabled = calculating || this.cachedTotalPSFArea === null;
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
     * Dispara o cálculo da área total da PSF.
     */
    triggerFullPSFAreaCalculation() {
        if (this.isCalculating || !this._hasRequiredData()) return;

        this._setCalculating(true);
        this._updateStatus('Calculando área total da PSF...');
        this.currentTaskId++;
        this.psfWorker.postMessage({
            id: this.currentTaskId,
            command: 'calculateTotalArea',
            antennaCoords: this.antennaCoords,
            elementFieldData3D: this.elementFieldData3D,
            K_CONST: this.K_CONST
        });
    }

    /**
     * Dispara o cálculo do SLL.
     */
    triggerSLLCalculation() {
        if (this.isCalculating || this.cachedTotalPSFArea === null || !this._hasRequiredData() || !this.sllThetaInput) return;

        const sllThetaDeg = parseFloat(this.sllThetaInput.value);
        if (isNaN(sllThetaDeg) || sllThetaDeg <= 0 || sllThetaDeg > 90) {
            this._updateStatus("Valor de Theta para SLL inválido.", true);
            if (this.sllConeArea) this.sllConeArea.textContent = '--';
            if (this.sllPercentage) this.sllPercentage.textContent = '--';
            return;
        }

        this._setCalculating(true);
        this._updateStatus(`Calculando SLL para Θ=${sllThetaDeg}°...`);
        this.currentTaskId++;
        this.psfWorker.postMessage({
            id: this.currentTaskId,
            command: 'calculateSLL',
            antennaCoords: this.antennaCoords, // Enviado novamente para consistência do cache do worker
            elementFieldData3D: this.elementFieldData3D,
            K_CONST: this.K_CONST,
            sllThetaDeg: sllThetaDeg
        });
    }

    /**
     * Dispara o cálculo da EE.
     */
    triggerEECalculation() {
        if (this.isCalculating || this.cachedTotalPSFArea === null || !this._hasRequiredData() || !this.eePercentageInput) return;

        const eePercentage = parseFloat(this.eePercentageInput.value);
        if (isNaN(eePercentage) || eePercentage <= 0 || eePercentage >= 100) {
            this._updateStatus("Valor de porcentagem para EE inválido.", true);
            if (this.eeFractionalArea) this.eeFractionalArea.textContent = '--';
            if (this.eeThetaResult) this.eeThetaResult.textContent = '--';
            return;
        }

        this._setCalculating(true);
        this._updateStatus(`Calculando EE para ${eePercentage}%...`);
        this.currentTaskId++;
        this.psfWorker.postMessage({
            id: this.currentTaskId,
            command: 'calculateEE',
            antennaCoords: this.antennaCoords, // Enviado novamente
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
            case 'resultTotalArea':
                this.cachedTotalPSFArea = workerData.data.totalArea;
                if (this.totalAreaValue) this.totalAreaValue.textContent = this.cachedTotalPSFArea.toExponential(4);
                if (this.calculateAreaBtn) this.calculateAreaBtn.style.display = 'none';
                if (this.totalAreaDisplay) this.totalAreaDisplay.style.display = 'inline';
                this._updateStatus('Área total da PSF calculada.');
                this._setCalculating(false);
                // Habilita inputs SLL/EE e dispara seus cálculos com valores padrão
                if (this.sllThetaInput) this.sllThetaInput.disabled = false;
                if (this.eePercentageInput) this.eePercentageInput.disabled = false;
                this.triggerSLLCalculation(); // Calcula SLL com valor padrão do input
                // A triggerEECalculation será chamada após SLL para evitar sobrecarga inicial
                break;
            case 'resultSLL':
                const coneArea = workerData.data.coneArea;
                if (this.sllConeArea) this.sllConeArea.textContent = coneArea.toExponential(4);
                if (this.cachedTotalPSFArea !== null && this.cachedTotalPSFArea > 1e-9) {
                    const percentage = (coneArea / this.cachedTotalPSFArea) * 100;
                    if (this.sllPercentage) this.sllPercentage.textContent = percentage.toFixed(2);
                } else {
                    if (this.sllPercentage) this.sllPercentage.textContent = this.cachedTotalPSFArea === 0 ? 'Div/0' : '--';
                }
                this._updateStatus(`SLL para Θ=${workerData.data.sllThetaDeg}° calculado.`);
                this._setCalculating(false);
                // Após SLL, se não estivermos já calculando EE por outro motivo:
                if(!this.isCalculating) this.triggerEECalculation();
                break;
            case 'resultEE':
                const { thetaEE, fractionalArea, eePercentage: returnedEEPercentage } = workerData.data;
                if (workerData.data.error) {
                    this._updateStatus(`Erro EE: ${workerData.data.error}`, true);
                    if(this.eeThetaResult) this.eeThetaResult.textContent = "Erro";
                    if(this.eeFractionalArea) this.eeFractionalArea.textContent = "Erro";
                } else {
                    if (this.eeFractionalArea) this.eeFractionalArea.textContent = fractionalArea.toExponential(4);
                    if (this.eeThetaResult) this.eeThetaResult.textContent = thetaEE.toFixed(2);
                    this._updateStatus(`EE para ${returnedEEPercentage}% calculado: Θ = ${thetaEE.toFixed(2)}°.`);
                }
                this._setCalculating(false);
                break;
            case 'error':
                this._updateStatus(`Erro do Worker PSF: ${workerData.error}`, true);
                this._setCalculating(false);
                // Resetar campos específicos se o erro foi em um cálculo particular
                if (this.isCalculating) { // Assumindo que a flag ainda estava ativa
                    // Poderia verificar aqui qual comando falhou para limpar campos específicos
                    // Por simplicidade, o status já indica o erro.
                }
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