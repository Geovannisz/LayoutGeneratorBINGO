/**
 * uv_coverage.js
 *
 * @fileoverview Módulo de simulação e visualização da cobertura UV para o BINGO Layout Generator.
 * Calcula coordenadas UV para todos os pares de estações (baselines) em função do ângulo horário
 * e plota a cobertura UV utilizando Plotly.js.
 *
 * @description Para cada par de estações, calcula componentes u,v a partir dos vetores de baseline
 * e parâmetros de observação (declinação, duração, frequência). Suporta exportação do gráfico
 * e cálculo automático da resolução angular (θ ≈ λ/D_max).
 *
 * @requires BingoConstants
 * @requires Plotly
 * @author Geovanni Fernandes Garcia
 * @version 1.0.2
 */

'use strict';

class UVCoverageSimulator {
    constructor() {
        // IDs dos elementos da UI
        this.decInputId = 'uv-dec-input';
        this.durationInputId = 'uv-duration-input';
        this.timestepsInputId = 'uv-timesteps-input';
        this.freqInputId = 'uv-freq-input';
        this.latitudeInputId = 'uv-latitude-input';
        this.generateBtnId = 'uv-generate-btn';
        this.plotContainerId = 'uv-plot-container';
        this.resolutionDisplayId = 'uv-resolution-display';
        this.exportBtnId = 'uv-export-btn';
        this.statusId = 'uv-status';

        // Referências aos elementos DOM
        this.decInput = document.getElementById(this.decInputId);
        this.durationInput = document.getElementById(this.durationInputId);
        this.timestepsInput = document.getElementById(this.timestepsInputId);
        this.freqInput = document.getElementById(this.freqInputId);
        this.latitudeInput = document.getElementById(this.latitudeInputId);
        this.generateBtn = document.getElementById(this.generateBtnId);
        this.plotContainer = document.getElementById(this.plotContainerId);
        this.resolutionDisplay = document.getElementById(this.resolutionDisplayId);
        this.exportBtn = document.getElementById(this.exportBtnId);
        this.statusDisplay = document.getElementById(this.statusId);

        // Parâmetros padrão
        this.defaultDec = -7.04;
        this.defaultDuration = 4;
        this.defaultTimesteps = 60;
        this.defaultFreqMHz = (BingoConstants.FREQUENCY_HZ / 1e6);
        this.defaultLatitude = BingoConstants.BINGO_LATITUDE;

        // Dados UV armazenados
        this.uvData = null;

        this._initUI();
        this._bindEvents();

        console.log("UVCoverageSimulator: Módulo de cobertura UV inicializado.");
    }

    /**
     * Inicializa valores padrão nos campos da UI.
     * @private
     */
    _initUI() {
        if (this.decInput) this.decInput.value = this.defaultDec;
        if (this.durationInput) this.durationInput.value = this.defaultDuration;
        if (this.timestepsInput) this.timestepsInput.value = this.defaultTimesteps;
        if (this.freqInput) this.freqInput.value = this.defaultFreqMHz;
        if (this.latitudeInput) this.latitudeInput.value = this.defaultLatitude;
    }

    /**
     * Vincula eventos aos elementos da UI e escuta eventos globais.
     * @private
     */
    _bindEvents() {
        if (this.generateBtn) {
            this.generateBtn.addEventListener('click', () => this.generateUVCoverage());
        }
        if (this.exportBtn) {
            this.exportBtn.addEventListener('click', () => this.exportPlot('png'));
        }

        // Escuta evento de estações geradas para atualização automática
        window.addEventListener('stationsGenerated', () => {
            const uvTab = document.querySelector('.tab-button[data-tab="uv-coverage"]') ||
                          document.querySelector('[data-tab="uv-coverage"]');
            const isActive = uvTab && uvTab.classList.contains('active');
            if (isActive) {
                console.log("UVCoverageSimulator: Evento 'stationsGenerated' recebido. Atualizando cobertura UV.");
                this.generateUVCoverage();
            }
        });
    }

    /**
     * Obtém as posições atuais das estações.
     * @returns {Array<{x: number, y: number}>} Array de posições de estações.
     */
    getStationPositions() {
        if (window.stationManager && typeof window.stationManager.getStationPositions === 'function') {
            return window.stationManager.getStationPositions();
        }
        if (window.interactiveMap && typeof window.interactiveMap.getStationPositions === 'function') {
            return window.interactiveMap.getStationPositions();
        }
        console.warn("UVCoverageSimulator: Nenhuma fonte de posições de estações encontrada.");
        return [];
    }

    /**
     * Lê os parâmetros de observação da UI ou retorna valores padrão.
     * @returns {{dec: number, duration: number, timesteps: number, freqHz: number, latitude: number}}
     * @private
     */
    _readParams() {
        const dec = this.decInput ? parseFloat(this.decInput.value) : this.defaultDec;
        const duration = this.durationInput ? parseFloat(this.durationInput.value) : this.defaultDuration;
        const timesteps = this.timestepsInput ? parseInt(this.timestepsInput.value, 10) : this.defaultTimesteps;
        const freqMHz = this.freqInput ? parseFloat(this.freqInput.value) : this.defaultFreqMHz;
        const latitude = this.latitudeInput ? parseFloat(this.latitudeInput.value) : this.defaultLatitude;

        return {
            dec: isNaN(dec) ? this.defaultDec : dec,
            duration: isNaN(duration) ? this.defaultDuration : duration,
            timesteps: isNaN(timesteps) || timesteps < 1 ? this.defaultTimesteps : timesteps,
            freqHz: isNaN(freqMHz) ? BingoConstants.FREQUENCY_HZ : freqMHz * 1e6,
            latitude: isNaN(latitude) ? this.defaultLatitude : latitude
        };
    }

    /**
     * Calcula a cobertura UV para todos os pares de estações e passos de tempo.
     * Para cada baseline, calcula u,v como função do ângulo horário.
     *
     * u = Bx*sin(H) + By*cos(H)
     * v = -Bx*sin(dec)*cos(H) + By*sin(dec)*sin(H) + Bz*cos(dec)
     *
     * Bx, By são componentes do baseline no plano local (Bz = 0 para estações coplanares).
     * Coordenadas em comprimentos de onda: u_λ = u/λ, v_λ = v/λ.
     */
    generateUVCoverage() {
        const stations = this.getStationPositions();
        if (!stations || stations.length < 2) {
            this.updateStatus("Erro: São necessárias pelo menos 2 estações para calcular a cobertura UV.");
            console.error("UVCoverageSimulator: Número insuficiente de estações.");
            return;
        }

        this.updateStatus("Calculando cobertura UV...");

        const params = this._readParams();
        const decRad = params.dec * BingoConstants.DEG_TO_RAD;
        const latRad = params.latitude * BingoConstants.DEG_TO_RAD;
        const lambda = BingoConstants.SPEED_OF_LIGHT / params.freqHz;

        const sinDec = Math.sin(decRad);
        const cosDec = Math.cos(decRad);
        const sinLat = Math.sin(latRad);
        const cosLat = Math.cos(latRad);

        // Ângulos horários: centrados em 0, de -duration/2 a +duration/2
        const halfDuration = params.duration / 2;
        const hourAngles = [];
        for (let i = 0; i < params.timesteps; i++) {
            const hHours = -halfDuration + (params.duration * i) / (params.timesteps > 1 ? params.timesteps - 1 : 1);
            // Converter horas para radianos (1h = 15°)
            hourAngles.push(hHours * 15 * BingoConstants.DEG_TO_RAD);
        }

        const uPoints = [];
        const vPoints = [];
        const baselineLengths = [];
        let maxBaseline = 0;

        const nStations = stations.length;

        for (let i = 0; i < nStations; i++) {
            for (let j = i + 1; j < nStations; j++) {
                // Componentes do baseline no plano local (ENU: East, North, Up)
                const Bx = stations[j].x - stations[i].x; // East
                const By = stations[j].y - stations[i].y; // North
                const Bz = 0; // Estações coplanares

                const bLen = Math.sqrt(Bx * Bx + By * By);
                if (bLen > maxBaseline) maxBaseline = bLen;

                for (let t = 0; t < hourAngles.length; t++) {
                    const H = hourAngles[t];
                    const sinH = Math.sin(H);
                    const cosH = Math.cos(H);

                    const u = Bx * sinH + By * cosH;
                    const v = -Bx * sinDec * cosH + By * sinDec * sinH + Bz * cosDec;

                    const uLambda = u / lambda;
                    const vLambda = v / lambda;

                    // Ponto original
                    uPoints.push(uLambda);
                    vPoints.push(vLambda);
                    baselineLengths.push(bLen);

                    // Ponto conjugado (-u, -v)
                    uPoints.push(-uLambda);
                    vPoints.push(-vLambda);
                    baselineLengths.push(bLen);
                }
            }
        }

        this.uvData = { uPoints, vPoints, baselineLengths, maxBaseline, lambda, params };

        const nBaselines = (nStations * (nStations - 1)) / 2;
        console.log(`UVCoverageSimulator: ${nBaselines} baselines calculadas, ${uPoints.length} pontos UV gerados.`);

        this.plotUVCoverage(this.uvData);
        this.calculateResolution();
        this.updateStatus(`Cobertura UV gerada: ${nBaselines} baselines, ${uPoints.length} pontos.`);
    }

    /**
     * Plota a cobertura UV usando Plotly.js com mapa de cores por comprimento de baseline.
     * @param {Object} uvData - Dados UV calculados.
     * @param {number[]} uvData.uPoints - Coordenadas u em comprimentos de onda.
     * @param {number[]} uvData.vPoints - Coordenadas v em comprimentos de onda.
     * @param {number[]} uvData.baselineLengths - Comprimento de cada baseline (metros).
     * @param {number} uvData.maxBaseline - Baseline máxima (metros).
     * @param {number} uvData.lambda - Comprimento de onda (metros).
     */
    plotUVCoverage(uvData) {
        if (!this.plotContainer) {
            console.warn("UVCoverageSimulator: Contêiner do gráfico não encontrado.");
            return;
        }
        if (typeof Plotly === 'undefined') {
            console.error("UVCoverageSimulator: Plotly.js não está carregado.");
            this.updateStatus("Erro: Plotly.js não encontrado.");
            return;
        }

        const { uPoints, vPoints, baselineLengths, maxBaseline, lambda } = uvData;

        const resArcmin = maxBaseline > 0
            ? (lambda / maxBaseline) * BingoConstants.RAD_TO_DEG * 60
            : 0;

        const trace = {
            x: uPoints,
            y: vPoints,
            mode: 'markers',
            type: 'scatter',
            marker: {
                size: 2,
                color: baselineLengths,
                colorscale: [
                    [0, 'rgb(0,0,255)'],
                    [0.5, 'rgb(0,200,0)'],
                    [1, 'rgb(255,0,0)']
                ],
                colorbar: {
                    title: 'Baseline (m)',
                    titleside: 'right'
                },
                opacity: 0.6
            },
            hovertemplate: 'u: %{x:.1f} λ<br>v: %{y:.1f} λ<br>Baseline: %{marker.color:.1f} m<extra></extra>'
        };

        const layout = {
            title: 'Cobertura UV',
            xaxis: {
                title: 'u (comprimentos de onda)',
                scaleanchor: 'y',
                scaleratio: 1,
                zeroline: true,
                zerolinecolor: '#888'
            },
            yaxis: {
                title: 'v (comprimentos de onda)',
                zeroline: true,
                zerolinecolor: '#888'
            },
            hovermode: 'closest',
            plot_bgcolor: '#1a1a2e',
            paper_bgcolor: '#16213e',
            font: { color: '#e0e0e0' },
            annotations: [{
                x: 0.02,
                y: 0.98,
                xref: 'paper',
                yref: 'paper',
                text: `Baseline máx: ${maxBaseline.toFixed(1)} m | Resolução: ${resArcmin.toFixed(2)} arcmin`,
                showarrow: false,
                font: { size: 11, color: '#aaa' },
                bgcolor: 'rgba(0,0,0,0.5)',
                borderpad: 4
            }],
            margin: { t: 50, b: 60, l: 60, r: 20 }
        };

        const config = {
            responsive: true,
            displayModeBar: true,
            modeBarButtonsToRemove: ['lasso2d', 'select2d']
        };

        Plotly.newPlot(this.plotContainer, [trace], layout, config);
    }

    /**
     * Calcula e exibe a resolução angular a partir da baseline máxima.
     * θ ≈ λ / D_max (em radianos), convertido para arcminutos.
     */
    calculateResolution() {
        if (!this.uvData || this.uvData.maxBaseline <= 0) {
            if (this.resolutionDisplay) {
                this.resolutionDisplay.textContent = 'Resolução: N/A';
            }
            return;
        }

        const { maxBaseline, lambda } = this.uvData;
        const thetaRad = lambda / maxBaseline;
        const thetaDeg = thetaRad * BingoConstants.RAD_TO_DEG;
        const thetaArcmin = thetaDeg * 60;
        const thetaArcsec = thetaArcmin * 60;

        let displayText;
        if (thetaArcmin >= 1) {
            displayText = `Resolução angular: ${thetaArcmin.toFixed(2)} arcmin (θ ≈ λ/D_max)`;
        } else {
            displayText = `Resolução angular: ${thetaArcsec.toFixed(2)} arcsec (θ ≈ λ/D_max)`;
        }

        if (this.resolutionDisplay) {
            this.resolutionDisplay.textContent = displayText;
        }

        console.log(`UVCoverageSimulator: Baseline máx = ${maxBaseline.toFixed(2)} m, λ = ${lambda.toFixed(4)} m, resolução = ${thetaArcmin.toFixed(4)} arcmin.`);
    }

    /**
     * Exporta o gráfico UV como imagem PNG ou SVG.
     * @param {string} [format='png'] - Formato de exportação ('png' ou 'svg').
     */
    exportPlot(format = 'png') {
        if (!this.plotContainer) {
            this.updateStatus("Erro: Contêiner do gráfico não encontrado para exportação.");
            return;
        }
        if (typeof Plotly === 'undefined') {
            this.updateStatus("Erro: Plotly.js não encontrado.");
            return;
        }

        const validFormat = (format === 'svg') ? 'svg' : 'png';

        Plotly.downloadImage(this.plotContainer, {
            format: validFormat,
            width: 1200,
            height: 1000,
            filename: `bingo_uv_coverage_${Date.now()}`
        }).then(() => {
            this.updateStatus(`Gráfico UV exportado como ${validFormat.toUpperCase()}.`);
            console.log(`UVCoverageSimulator: Gráfico exportado como ${validFormat.toUpperCase()}.`);
        }).catch((err) => {
            this.updateStatus("Erro ao exportar gráfico UV.");
            console.error("UVCoverageSimulator: Erro na exportação:", err);
        });
    }

    /**
     * Atualiza a mensagem de status na UI.
     * @param {string} msg - Mensagem de status.
     */
    updateStatus(msg) {
        if (this.statusDisplay) {
            this.statusDisplay.textContent = msg;
        }
    }
}

// Inicialização e exposição global
if (typeof window !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
        if (!window.uvCoverageSimulator) {
            window.uvCoverageSimulator = new UVCoverageSimulator();
        }
    });
}
