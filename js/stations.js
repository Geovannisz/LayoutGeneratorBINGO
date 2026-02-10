/**
 * stations.js
 *
 * @fileoverview Módulo para gerenciamento e visualização de posições de estações em grande escala.
 * Gera layouts de estações (~30x a escala de tiles), calcula baselines entre pares
 * de estações e a resolução angular correspondente.
 *
 * @description Suporta seis tipos de layout: grid, circular, spiral, y_shape, cross e random.
 * Distâncias de estações variam de ~15m a 3km, com espaçamento padrão de ~300m.
 * Calcula todas as baselines entre pares de estações, resolução angular (theta ≈ λ/D_max)
 * e exibe estatísticas atualizadas dinamicamente.
 *
 * @requires BingoConstants
 * @author Geovanni Fernandes Garcia
 * @version 1.0.2
 */

'use strict';

// Constantes físicas - usar BingoConstants quando disponível, senão valores padrão
const STATION_WAVELENGTH = (typeof BingoConstants !== 'undefined') ? BingoConstants.WAVELENGTH : 299792458 / 1e9;
const STATION_SPEED_OF_LIGHT = (typeof BingoConstants !== 'undefined') ? BingoConstants.SPEED_OF_LIGHT : 299792458;
const STATION_FREQUENCY_HZ = (typeof BingoConstants !== 'undefined') ? BingoConstants.FREQUENCY_HZ : 1e9;
const STATION_DEG_TO_RAD = (typeof BingoConstants !== 'undefined') ? BingoConstants.DEG_TO_RAD : Math.PI / 180;
const STATION_RAD_TO_DEG = (typeof BingoConstants !== 'undefined') ? BingoConstants.RAD_TO_DEG : 180 / Math.PI;

/**
 * Fator de escala das estações em relação aos tiles (~30x).
 * @constant {number}
 */
const STATION_SCALE_FACTOR = 30;

/**
 * Espaçamento padrão entre estações em metros.
 * @constant {number}
 */
const DEFAULT_STATION_SPACING = 300;

/**
 * Espaçamento mínimo entre estações em metros.
 * @constant {number}
 */
const MIN_STATION_SPACING = 15;

/**
 * Espaçamento máximo entre estações em metros.
 * @constant {number}
 */
const MAX_STATION_SPACING = 3000;

/**
 * Limiar para baselines curtas em metros.
 * @constant {number}
 */
const SHORT_BASELINE_THRESHOLD = 50;

/**
 * Limiar para baselines longas em metros.
 * @constant {number}
 */
const LONG_BASELINE_THRESHOLD = 1000;

class StationManager {
    constructor() {
        // IDs dos elementos da UI
        this.layoutTypeSelectId = 'station-layout-type';
        this.stationCountInputId = 'station-count';
        this.spacingRangeId = 'station-spacing';
        this.spacingValueDisplayId = 'station-spacing-value';
        this.generateBtnId = 'station-generate-btn';
        this.randomBtnId = 'station-random-btn';
        this.statsContainerId = 'station-stats';
        this.angularResDisplayId = 'angular-resolution-display';
        this.baselineInfoId = 'baseline-info';

        // Referências aos elementos DOM
        this.layoutTypeSelect = null;
        this.stationCountInput = null;
        this.spacingRange = null;
        this.spacingValueDisplay = null;
        this.generateBtn = null;
        this.randomBtn = null;
        this.statsContainer = null;
        this.angularResDisplay = null;
        this.baselineInfo = null;

        // Estado interno
        this.stations = [];
        this.baselines = [];
        this.maxBaseline = 0;
        this.minBaseline = Infinity;

        this._init();
    }

    _init() {
        this.layoutTypeSelect = document.getElementById(this.layoutTypeSelectId);
        this.stationCountInput = document.getElementById(this.stationCountInputId);
        this.spacingRange = document.getElementById(this.spacingRangeId);
        this.spacingValueDisplay = document.getElementById(this.spacingValueDisplayId);
        this.generateBtn = document.getElementById(this.generateBtnId);
        this.randomBtn = document.getElementById(this.randomBtnId);
        this.statsContainer = document.getElementById(this.statsContainerId);
        this.angularResDisplay = document.getElementById(this.angularResDisplayId);
        this.baselineInfo = document.getElementById(this.baselineInfoId);

        if (!this.generateBtn && !this.layoutTypeSelect) {
            console.warn("StationManager: Elementos DOM de estações não encontrados. Módulo em modo stand-by.");
            return;
        }

        if (this.generateBtn) {
            this.generateBtn.addEventListener('click', () => this.generateStations());
        }
        if (this.randomBtn) {
            this.randomBtn.addEventListener('click', () => {
                if (this.layoutTypeSelect) {
                    this.layoutTypeSelect.value = 'random';
                }
                this.generateStations();
            });
        }
        if (this.spacingRange) {
            this.spacingRange.addEventListener('input', () => this._updateSpacingDisplay());
        }

        this._updateSpacingDisplay();
        console.log("StationManager: Módulo de estações inicializado.");
    }

    /**
     * Converte o valor linear do range input para escala logarítmica.
     * @returns {number} Espaçamento em metros (escala log).
     */
    _getSpacingFromRange() {
        if (!this.spacingRange) return DEFAULT_STATION_SPACING;
        const t = parseFloat(this.spacingRange.value);
        const logMin = Math.log10(MIN_STATION_SPACING);
        const logMax = Math.log10(MAX_STATION_SPACING);
        return Math.pow(10, logMin + t * (logMax - logMin));
    }

    /**
     * Atualiza o display do valor de espaçamento.
     */
    _updateSpacingDisplay() {
        const spacing = this._getSpacingFromRange();
        if (this.spacingValueDisplay) {
            if (spacing >= 1000) {
                this.spacingValueDisplay.textContent = `${(spacing / 1000).toFixed(2)} km`;
            } else {
                this.spacingValueDisplay.textContent = `${spacing.toFixed(1)} m`;
            }
        }
    }

    /**
     * Gera posições de estações com base nas configurações atuais da UI.
     */
    generateStations() {
        const layoutType = this.layoutTypeSelect ? this.layoutTypeSelect.value : 'grid';
        const count = this.stationCountInput ? parseInt(this.stationCountInput.value, 10) : 7;
        const spacing = this._getSpacingFromRange();

        if (isNaN(count) || count < 1) {
            console.error("StationManager: Número de estações inválido.");
            return;
        }

        switch (layoutType) {
            case 'grid':
                this.stations = this.generateGridStations(count, spacing);
                break;
            case 'circular':
                this.stations = this.generateCircularStations(count, spacing);
                break;
            case 'spiral':
                this.stations = this.generateSpiralStations(count, spacing);
                break;
            case 'y_shape':
                this.stations = this.generateYShapeStations(count, spacing);
                break;
            case 'cross':
                this.stations = this.generateCrossStations(count, spacing);
                break;
            case 'random':
                this.stations = this.generateRandomStations(count, spacing);
                break;
            default:
                console.warn(`StationManager: Tipo de layout desconhecido '${layoutType}'. Usando grid.`);
                this.stations = this.generateGridStations(count, spacing);
        }

        this._centerStations();
        this.calculateBaselines();
        this.calculateAngularResolution();
        this.updateStats();
        this._dispatchEvent();

        console.log(`StationManager: ${this.stations.length} estações geradas (layout: ${layoutType}, espaçamento: ${spacing.toFixed(1)}m).`);
    }

    /**
     * Centraliza as estações em torno da origem (0, 0).
     */
    _centerStations() {
        if (this.stations.length === 0) return;
        let sumX = 0, sumY = 0;
        for (const s of this.stations) {
            sumX += s.x;
            sumY += s.y;
        }
        const cx = sumX / this.stations.length;
        const cy = sumY / this.stations.length;
        this.stations = this.stations.map(s => ({
            x: s.x - cx,
            y: s.y - cy
        }));
    }

    // ===========================
    // Métodos de Geração de Layout
    // ===========================

    /**
     * Gera estações em um grid regular.
     * @param {number} count Número de estações.
     * @param {number} spacing Espaçamento em metros.
     * @returns {Array<{x: number, y: number}>} Posições das estações.
     */
    generateGridStations(count, spacing) {
        const cols = Math.ceil(Math.sqrt(count));
        const rows = Math.ceil(count / cols);
        const positions = [];
        for (let r = 0; r < rows && positions.length < count; r++) {
            for (let c = 0; c < cols && positions.length < count; c++) {
                positions.push({
                    x: c * spacing,
                    y: r * spacing
                });
            }
        }
        return positions;
    }

    /**
     * Gera estações em um anel circular.
     * @param {number} count Número de estações.
     * @param {number} spacing Espaçamento em metros (usado como raio).
     * @returns {Array<{x: number, y: number}>} Posições das estações.
     */
    generateCircularStations(count, spacing) {
        const positions = [];
        const radius = spacing;
        for (let i = 0; i < count; i++) {
            const angle = (2 * Math.PI * i) / count;
            positions.push({
                x: radius * Math.cos(angle),
                y: radius * Math.sin(angle)
            });
        }
        return positions;
    }

    /**
     * Gera estações em uma espiral.
     * @param {number} count Número de estações.
     * @param {number} spacing Espaçamento em metros (controla o passo radial).
     * @returns {Array<{x: number, y: number}>} Posições das estações.
     */
    generateSpiralStations(count, spacing) {
        const positions = [];
        const goldenAngle = Math.PI * (3 - Math.sqrt(5));
        for (let i = 0; i < count; i++) {
            const r = spacing * Math.sqrt(i + 1) / Math.sqrt(count);
            const theta = i * goldenAngle;
            positions.push({
                x: r * Math.cos(theta),
                y: r * Math.sin(theta)
            });
        }
        return positions;
    }

    /**
     * Gera estações em um layout em forma de Y (comum em radioastronomia).
     * @param {number} count Número de estações.
     * @param {number} spacing Espaçamento em metros.
     * @returns {Array<{x: number, y: number}>} Posições das estações.
     */
    generateYShapeStations(count, spacing) {
        const positions = [];
        const arms = 3;
        const perArm = Math.floor(count / arms);
        const remainder = count - perArm * arms;
        const armAngles = [
            Math.PI / 2,                    // braço superior (90°)
            Math.PI / 2 + (2 * Math.PI / 3), // braço inferior esquerdo (210°)
            Math.PI / 2 + (4 * Math.PI / 3)  // braço inferior direito (330°)
        ];

        for (let a = 0; a < arms; a++) {
            const stationsInArm = perArm + (a < remainder ? 1 : 0);
            const angle = armAngles[a];
            for (let i = 0; i < stationsInArm; i++) {
                const dist = spacing * (i + 1);
                positions.push({
                    x: dist * Math.cos(angle),
                    y: dist * Math.sin(angle)
                });
            }
        }
        return positions;
    }

    /**
     * Gera estações em um layout em forma de cruz.
     * @param {number} count Número de estações.
     * @param {number} spacing Espaçamento em metros.
     * @returns {Array<{x: number, y: number}>} Posições das estações.
     */
    generateCrossStations(count, spacing) {
        const positions = [];
        const arms = 4;
        const perArm = Math.floor(count / arms);
        const remainder = count - perArm * arms;
        const armAngles = [0, Math.PI / 2, Math.PI, 3 * Math.PI / 2];

        for (let a = 0; a < arms; a++) {
            const stationsInArm = perArm + (a < remainder ? 1 : 0);
            for (let i = 0; i < stationsInArm; i++) {
                const dist = spacing * (i + 1);
                positions.push({
                    x: dist * Math.cos(armAngles[a]),
                    y: dist * Math.sin(armAngles[a])
                });
            }
        }
        return positions;
    }

    /**
     * Gera estações com distribuição aleatória.
     * @param {number} count Número de estações.
     * @param {number} spacing Espaçamento em metros (define o raio da área).
     * @returns {Array<{x: number, y: number}>} Posições das estações.
     */
    generateRandomStations(count, spacing) {
        const positions = [];
        const area = spacing * Math.sqrt(count);
        for (let i = 0; i < count; i++) {
            positions.push({
                x: (Math.random() - 0.5) * 2 * area,
                y: (Math.random() - 0.5) * 2 * area
            });
        }
        return positions;
    }

    // ===========================
    // Cálculos de Baselines
    // ===========================

    /**
     * Calcula todas as baselines (distâncias) entre pares de estações.
     */
    calculateBaselines() {
        this.baselines = [];
        this.maxBaseline = 0;
        this.minBaseline = Infinity;
        const n = this.stations.length;

        for (let i = 0; i < n; i++) {
            for (let j = i + 1; j < n; j++) {
                const dx = this.stations[j].x - this.stations[i].x;
                const dy = this.stations[j].y - this.stations[i].y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                let category;
                if (dist < SHORT_BASELINE_THRESHOLD) {
                    category = 'short';
                } else if (dist > LONG_BASELINE_THRESHOLD) {
                    category = 'long';
                } else {
                    category = 'medium';
                }

                this.baselines.push({
                    i: i,
                    j: j,
                    distance: dist,
                    category: category
                });

                if (dist > this.maxBaseline) this.maxBaseline = dist;
                if (dist < this.minBaseline) this.minBaseline = dist;
            }
        }

        if (this.baselines.length === 0) {
            this.minBaseline = 0;
        }

        this._updateBaselineInfo();
    }

    /**
     * Atualiza o display de informações de baselines.
     */
    _updateBaselineInfo() {
        if (!this.baselineInfo) return;

        if (this.baselines.length === 0) {
            this.baselineInfo.textContent = 'Nenhuma baseline calculada.';
            return;
        }

        const shortCount = this.baselines.filter(b => b.category === 'short').length;
        const mediumCount = this.baselines.filter(b => b.category === 'medium').length;
        const longCount = this.baselines.filter(b => b.category === 'long').length;

        const formatDist = (d) => d >= 1000 ? `${(d / 1000).toFixed(2)} km` : `${d.toFixed(1)} m`;

        this.baselineInfo.innerHTML =
            `<strong>Baselines:</strong> ${this.baselines.length} pares<br>` +
            `Min: ${formatDist(this.minBaseline)} | Max: ${formatDist(this.maxBaseline)}<br>` +
            `<span style="color:#4caf50">Curtas (&lt;${SHORT_BASELINE_THRESHOLD}m): ${shortCount}</span> | ` +
            `<span style="color:#ff9800">Médias: ${mediumCount}</span> | ` +
            `<span style="color:#f44336">Longas (&gt;${LONG_BASELINE_THRESHOLD}m): ${longCount}</span>`;
    }

    // ===========================
    // Resolução Angular
    // ===========================

    /**
     * Calcula e exibe a resolução angular: theta ≈ lambda / D_max.
     */
    calculateAngularResolution() {
        if (!this.angularResDisplay) return;

        if (this.maxBaseline <= 0) {
            this.angularResDisplay.textContent = 'Resolução angular: N/A (sem baselines)';
            return;
        }

        const thetaRad = STATION_WAVELENGTH / this.maxBaseline;
        const thetaDeg = thetaRad * STATION_RAD_TO_DEG;
        const thetaArcmin = thetaDeg * 60;
        const thetaArcsec = thetaArcmin * 60;

        let display;
        if (thetaArcmin >= 1) {
            display = `${thetaArcmin.toFixed(2)} arcmin`;
        } else {
            display = `${thetaArcsec.toFixed(2)} arcsec`;
        }

        this.angularResDisplay.innerHTML =
            `<strong>Resolução Angular (θ ≈ λ/D<sub>max</sub>):</strong><br>` +
            `θ = ${display}<br>` +
            `λ = ${STATION_WAVELENGTH.toFixed(4)} m | D<sub>max</sub> = ${this._formatDistance(this.maxBaseline)}<br>` +
            `f = ${(STATION_FREQUENCY_HZ / 1e9).toFixed(3)} GHz`;
    }

    /**
     * Formata distância para exibição (m ou km).
     * @param {number} dist Distância em metros.
     * @returns {string} Distância formatada.
     */
    _formatDistance(dist) {
        return dist >= 1000 ? `${(dist / 1000).toFixed(2)} km` : `${dist.toFixed(1)} m`;
    }

    // ===========================
    // Estatísticas e Eventos
    // ===========================

    /**
     * Atualiza o container de estatísticas com informações do layout atual.
     */
    updateStats() {
        if (!this.statsContainer) return;

        if (this.stations.length === 0) {
            this.statsContainer.textContent = 'Nenhuma estação gerada.';
            return;
        }

        let maxR = 0;
        for (const s of this.stations) {
            const r = Math.sqrt(s.x * s.x + s.y * s.y);
            if (r > maxR) maxR = r;
        }

        this.statsContainer.innerHTML =
            `<strong>Estações:</strong> ${this.stations.length}<br>` +
            `Baselines: ${this.baselines.length} pares<br>` +
            `Raio máximo: ${this._formatDistance(maxR)}<br>` +
            `Baseline max: ${this._formatDistance(this.maxBaseline)}`;
    }

    /**
     * Retorna as posições atuais das estações.
     * @returns {Array<{x: number, y: number}>} Array de posições em metros.
     */
    getStationPositions() {
        return this.stations.slice();
    }

    /**
     * Dispara evento customizado notificando que estações foram geradas.
     */
    _dispatchEvent() {
        window.dispatchEvent(new CustomEvent('stationsGenerated', {
            detail: {
                stations: this.getStationPositions(),
                baselines: this.baselines,
                maxBaseline: this.maxBaseline,
                minBaseline: this.minBaseline
            }
        }));
    }
}

// Inicialização e exposição global
if (typeof window !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
        if (!window.stationManager) {
            window.stationManager = new StationManager();
        }
    });
}
