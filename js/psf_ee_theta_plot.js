/**
 * psf_ee_theta_plot.js
 *
 * Módulo para gerenciar a interface e a lógica do gráfico de Energia Circunscrita (EE)
 * em função do ângulo de integração Theta (Θ) da PSF.
 * Gera o gráfico automaticamente após o cálculo do volume da PSF.
 * O zoom é restrito ao eixo horizontal (Theta).
 * O botão de geração e o título foram removidos.
 */

class PSFEeThetaPlotter {
    constructor() {
        // IDs dos elementos da UI
        this.plotDivId = 'psf-ee-theta-plot';
        this.statusDisplayId = 'psf-ee-theta-status';

        // Referências aos elementos DOM
        this.plotDiv = null;
        this.statusDisplay = null;

        // Estado interno
        this.isCalculating = false; 
        this.currentLayoutData = {
            antennaCoords: null,
            elementFieldData3D: null,
            K_CONST: null,
            totalPSFVolume: null
        };
        this.psfWorkerRef = null;
        this.currentWorkerTaskId = 0;

        this._init();
    }

    _init() {
        this.plotDiv = document.getElementById(this.plotDivId);
        this.statusDisplay = document.getElementById(this.statusDisplayId);

        if (!this.plotDiv || !this.statusDisplay) {
            console.error("PSFEeThetaPlotter: Falha ao encontrar um ou mais elementos DOM essenciais.");
            return;
        }

        // Tenta obter referência ao worker do PSFAnalyzer
        if (window.psfAnalyzer && window.psfAnalyzer.psfWorker) {
            this.psfWorkerRef = window.psfAnalyzer.psfWorker;
        } else {
             console.warn("PSFEeThetaPlotter: psfAnalyzer ou seu worker não encontrado na inicialização. Será verificado novamente ao tentar gerar o plot.");
        }
        
        // Listener para evento de 'psfTotalVolumeCalculated' disparado pelo PSFAnalyzer
        window.addEventListener('psfTotalVolumeCalculated', (event) => {
            console.log("PSFEeThetaPlotter: Evento 'psfTotalVolumeCalculated' recebido.", event.detail);
            if (event.detail && typeof event.detail.totalVolume === 'number') {
                this.currentLayoutData.totalPSFVolume = event.detail.totalVolume;
                
                // Verifica se os outros dados essenciais já estão presentes
                if (this.currentLayoutData.antennaCoords && 
                    this.currentLayoutData.elementFieldData3D && 
                    this.currentLayoutData.K_CONST !== null) {
                    this._updateStatus('Volume total da PSF recebido. Gerando curva EE(Θ)...');
                    this.triggerAutomaticPlotGeneration(); 
                } else {
                    this._updateStatus('Volume da PSF calculado, mas aguardando outros dados (layout/E-field) para gerar a curva EE(Θ).');
                }
            } else {
                console.warn("PSFEeThetaPlotter: 'psfTotalVolumeCalculated' evento não continha totalVolume válido.");
            }
        });
        
        // Listeners para resetar quando dados que afetam a PSF mudam
        window.addEventListener('layoutGenerated', () => this.handleDataChange());
        window.addEventListener('beamData3DLoaded', () => this.handleDataChange()); // Se o E-field 3D mudar, a PSF muda

        this._updateStatus('Aguardando dados da PSF...');
        console.log("PSFEeThetaPlotter inicializado.");
    }

    handleDataChange() {
        console.log("PSFEeThetaPlotter: Mudança nos dados do layout/E-field detectada.");
        this.clearPlot(); // Limpa o gráfico anterior
        this._updateStatus('Novos dados de layout/E-field. Aguardando cálculo do volume da PSF...');
        this.currentLayoutData.totalPSFVolume = null; // Invalida o volume local, pois a PSF mudará
        // Os dados de antennaCoords, elementFieldData3D, K_CONST serão atualizados por updateCoreData
        // que é chamado por main.js
    }

    updateCoreData(antennaCoords, elementFieldData3D, K_CONST) {
        let dataChanged = false;
        if (this.currentLayoutData.antennaCoords !== antennaCoords || 
            this.currentLayoutData.elementFieldData3D !== elementFieldData3D || 
            this.currentLayoutData.K_CONST !== K_CONST) {
            dataChanged = true;
        }

        this.currentLayoutData.antennaCoords = antennaCoords;
        this.currentLayoutData.elementFieldData3D = elementFieldData3D;
        this.currentLayoutData.K_CONST = K_CONST;

        if (dataChanged) {
            // Se os dados principais mudaram, o volume da PSF anterior não é mais válido.
            this.currentLayoutData.totalPSFVolume = null;
            this.clearPlot();
            this._updateStatus('Dados do arranjo/E-field atualizados. Aguardando cálculo do volume da PSF.');
        }

        // Tenta gerar o plot se o volume já tiver sido calculado para ESTA configuração de dados
        // (Isso é mais para o caso de o evento 'psfTotalVolumeCalculated' chegar antes do updateCoreData)
        if (this.currentLayoutData.totalPSFVolume !== null && this.currentLayoutData.totalPSFVolume > 0 &&
            this.currentLayoutData.antennaCoords && this.currentLayoutData.elementFieldData3D && this.currentLayoutData.K_CONST !== null) {
            this._updateStatus('Dados completos. Gerando curva EE(Θ) se o volume da PSF estiver OK.');
            this.triggerAutomaticPlotGeneration();
        } else if (!this.currentLayoutData.antennaCoords || !this.currentLayoutData.elementFieldData3D || this.currentLayoutData.K_CONST === null) {
            this._updateStatus('Aguardando dados completos (layout/E-field) para análise da PSF.');
        } else if (this.currentLayoutData.totalPSFVolume === null) {
            this._updateStatus('Aguardando cálculo do Volume da PSF na seção de Análise da PSF.');
        }
    }

    _setCalculating(calculating) {
        this.isCalculating = calculating;
        // Não há botão para habilitar/desabilitar
    }

    _updateStatus(message, isError = false) {
        if (this.statusDisplay) {
            this.statusDisplay.textContent = message;
            this.statusDisplay.style.color = isError ? 'var(--secondary-color)' : 'var(--text-color)';
        }
    }

    _hasRequiredDataForCurve() {
        if (!this.psfWorkerRef) {
            if (window.psfAnalyzer && window.psfAnalyzer.psfWorker) {
                this.psfWorkerRef = window.psfAnalyzer.psfWorker;
            } else {
                this._updateStatus("Worker de análise PSF não está pronto.", true);
                return false;
            }
        }
        if (!this.currentLayoutData.antennaCoords || this.currentLayoutData.antennaCoords.length === 0) {
            this._updateStatus("Dados do arranjo de antenas não disponíveis para curva EE(Θ).", true);
            return false;
        }
        if (!this.currentLayoutData.elementFieldData3D || this.currentLayoutData.elementFieldData3D.length === 0) {
            this._updateStatus("Dados do elemento de antena (3D) não disponíveis para curva EE(Θ).", true);
            return false;
        }
        if (this.currentLayoutData.K_CONST === null) {
            this._updateStatus("Constante K não disponível para curva EE(Θ).", true);
            return false;
        }
        if (this.currentLayoutData.totalPSFVolume === null || this.currentLayoutData.totalPSFVolume <= 0) {
            this._updateStatus("Volume total da PSF não calculado ou inválido para curva EE(Θ).", true);
            return false;
        }
        return true;
    }

    triggerAutomaticPlotGeneration() {
        if (this.isCalculating) {
            console.log("PSFEeThetaPlotter: Cálculo da curva EE(Θ) já em andamento.");
            return;
        }

        if (!this._hasRequiredDataForCurve()) {
            console.warn("PSFEeThetaPlotter: Dados necessários para a curva EE(Θ) ausentes na tentativa de geração automática.");
            return;
        }
        
        this._setCalculating(true);
        this.clearPlot(); 
        this._updateStatus('Calculando dados para a curva EE(Θ)...');
        this.currentWorkerTaskId = Date.now() + Math.random(); 

        const specificMessageHandler = (e) => {
            const workerData = e.data;
            if (workerData.id !== this.currentWorkerTaskId) {
                if (workerData.type === 'error' && !workerData.id) {
                    console.error("PSFEeThetaPlotter: Erro genérico do worker:", workerData.error);
                }
                return;
            }

            if (workerData.type === 'resultEECurve') {
                this.plotEECurve(workerData.data.eeCurveData);
                this._updateStatus('Curva EE(Θ) gerada.');
                this._setCalculating(false);
                this.psfWorkerRef.removeEventListener('message', specificMessageHandler);
            } else if (workerData.type === 'error') {
                this._updateStatus(`Erro do Worker ao calcular curva EE(Θ): ${workerData.error}`, true);
                this._setCalculating(false);
                this.psfWorkerRef.removeEventListener('message', specificMessageHandler);
            } else if (workerData.type === 'progress') {
                 // Só atualiza status se for da tarefa CORRENTE deste plotter
                if (workerData.id === this.currentWorkerTaskId) {
                    this._updateStatus(workerData.data);
                }
            }
        };
        this.psfWorkerRef.addEventListener('message', specificMessageHandler);

        this.psfWorkerRef.postMessage({
            id: this.currentWorkerTaskId,
            command: 'calculateEECurve',
            antennaCoords: this.currentLayoutData.antennaCoords,
            elementFieldData3D: this.currentLayoutData.elementFieldData3D,
            K_CONST: this.currentLayoutData.K_CONST,
            totalPSFVolume: this.currentLayoutData.totalPSFVolume
        });
    }

    plotEECurve(eeCurveData) {
        if (!this.plotDiv || !eeCurveData || eeCurveData.length === 0) {
            this._updateStatus('Dados insuficientes ou inválidos para plotar a curva EE(Θ).', true);
            this.clearPlot(); // Garante que o placeholder seja mostrado se os dados forem ruins
            return;
        }

        this.plotDiv.classList.add('has-plot');

        const thetaValues = eeCurveData.map(d => d.theta);
        const eeValues = eeCurveData.map(d => d.ee * 100); 

        const rootStyle = getComputedStyle(document.documentElement);
        const plotColors = {
            plotBgColor: rootStyle.getPropertyValue('--plot-bg-color').trim() || '#ffffff',
            paperBgColor: rootStyle.getPropertyValue('--card-bg-color').trim() || '#ffffff',
            textColor: rootStyle.getPropertyValue('--text-color').trim() || '#333333',
            gridColor: rootStyle.getPropertyValue('--plot-grid-color').trim() || '#eeeeee',
            lineColor: rootStyle.getPropertyValue('--primary-color').trim() || '#3498db',
            axisColor: rootStyle.getPropertyValue('--border-color').trim() || '#cccccc',
        };

        const trace = {
            x: thetaValues,
            y: eeValues,
            mode: 'lines',
            type: 'scatter',
            name: 'EE(Θ)',
            line: { color: plotColors.lineColor, width: 1.5 }
        };

        const layout = {
            xaxis: {
                title: 'Θ (graus)', 
                range: [0, 90],
                gridcolor: plotColors.gridColor,
                zerolinecolor: plotColors.axisColor,
                linecolor: plotColors.axisColor,
                tickcolor: plotColors.textColor,
                titlefont: { color: plotColors.textColor, size: 10 },
                tickfont: { color: plotColors.textColor, size: 9 }, 
                automargin: true,
                fixedrange: false 
            },
            yaxis: {
                title: 'EE (%)', 
                range: [0, 100.5], 
                gridcolor: plotColors.gridColor,
                zerolinecolor: plotColors.axisColor,
                linecolor: plotColors.axisColor,
                tickcolor: plotColors.textColor,
                titlefont: { color: plotColors.textColor, size: 10 },
                tickfont: { color: plotColors.textColor, size: 9 },
                automargin: true,
                fixedrange: true 
            },
            plot_bgcolor: plotColors.plotBgColor,
            paper_bgcolor: plotColors.paperBgColor,
            font: { color: plotColors.textColor, size: 10 }, // Fonte global um pouco menor
            showlegend: false,
            autosize: true,
            margin: { t: 5, b: 30, l: 40, r: 5 } // Margens mínimas para maximizar área do plot
        };
        const config = { 
            responsive: true, 
            scrollZoom: 'xaxis', 
            displayModeBar: true,
            modeBarButtonsToRemove: ['zoomIn2d', 'zoomOut2d', 'autoScale2d', 'select2d', 'lasso2d', 'zoom2d', 'toggleSpikelines', 'hoverClosestCartesian', 'hoverCompareCartesian']
        };

        Plotly.react(this.plotDivId, [trace], layout, config)
            .catch(err => {
                console.error("Erro ao renderizar gráfico EE(Θ) com Plotly.react, tentando newPlot:", err);
                this.clearPlot(); // Limpa em caso de erro
                return Plotly.newPlot(this.plotDivId, [trace], layout, config);
            })
            .catch(err2 => {
                console.error("Erro fatal no Plotly para EE(Θ) (newPlot fallback):", err2);
                this._updateStatus("Erro crítico ao renderizar gráfico EE(Θ).", true);
                this.clearPlot(); // Limpa em caso de erro fatal
            });
    }

    clearPlot() {
        if (this.plotDiv) {
            Plotly.purge(this.plotDivId);
            this.plotDiv.classList.remove('has-plot'); 
            // Adiciona placeholder se não existir
            if (!this.plotDiv.querySelector('.plot-placeholder')) {
                const placeholder = document.createElement('div');
                placeholder.className = 'plot-placeholder';
                // Atualiza a mensagem do placeholder para refletir a geração automática
                placeholder.textContent = 'Aguardando cálculo da PSF para gerar a curva EE(Θ)...';
                this.plotDiv.appendChild(placeholder);
            } else {
                // Atualiza o texto do placeholder existente se necessário
                this.plotDiv.querySelector('.plot-placeholder').textContent = 'Aguardando cálculo da PSF para gerar a curva EE(Θ)...';
            }
        }
    }
}

if (typeof window !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
        if (!window.psfEeThetaPlotter) {
            window.psfEeThetaPlotter = new PSFEeThetaPlotter();
        }
    });
}