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
 * @version 1.0.3
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

/**
 * Ângulo dourado (radianos) para padrão girassol/Fibonacci: π(3 - √5) ≈ 137.508°.
 * @constant {number}
 */
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

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
        this.extraParamsContainerId = 'station-extra-params';

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
        this.extraParamsContainer = null;

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
        this.extraParamsContainer = document.getElementById(this.extraParamsContainerId);

        // Timer para debounce da geração automática
        this._autoGenTimer = null;

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
                    this._updateExtraParams();
                }
                this.generateStations();
            });
        }
        if (this.spacingRange) {
            this.spacingRange.addEventListener('input', () => {
                this._updateSpacingDisplay();
                this._autoGenerate();
            });
        }
        if (this.stationCountInput) {
            this.stationCountInput.addEventListener('input', () => this._autoGenerate());
        }
        if (this.layoutTypeSelect) {
            this.layoutTypeSelect.addEventListener('change', () => {
                this._updateExtraParams();
                this._autoGenerate();
            });
        }

        this._updateSpacingDisplay();
        this._updateExtraParams();
        // Geração inicial automática
        this.generateStations();
        console.log("StationManager: Módulo de estações inicializado.");
    }

    /**
     * Gera estações automaticamente com debounce (150ms) ao alterar qualquer parâmetro.
     */
    _autoGenerate() {
        clearTimeout(this._autoGenTimer);
        this._autoGenTimer = setTimeout(() => this.generateStations(), 150);
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

    // ===========================
    // Parâmetros Extras por Tipo
    // ===========================

    /**
     * Lê um valor numérico de um parâmetro extra.
     * @param {string} id ID do input
     * @param {number} fallback Valor padrão
     * @returns {number}
     */
    _getExtraParam(id, fallback) {
        const el = document.getElementById(id);
        if (!el) return fallback;
        const v = parseFloat(el.value);
        return isNaN(v) ? fallback : v;
    }

    /**
     * Atualiza os parâmetros extras exibidos conforme o tipo de layout selecionado.
     */
    _updateExtraParams() {
        if (!this.extraParamsContainer) return;
        const layout = this.layoutTypeSelect ? this.layoutTypeSelect.value : 'grid';

        const paramDefs = {
            grid: [
                { id: 'sp-grid-cols', label: 'Colunas', type: 'number', value: 0, min: 0, max: 50, step: 1, hint: '0 = automático (√N)' },
                { id: 'sp-grid-sx', label: 'Fator Espaç. X', type: 'number', value: 1.0, min: 0.1, max: 5, step: 0.1 },
                { id: 'sp-grid-sy', label: 'Fator Espaç. Y', type: 'number', value: 1.0, min: 0.1, max: 5, step: 0.1 },
                { id: 'sp-grid-jitter', label: 'Jitter aleatório (m)', type: 'number', value: 0, min: 0, max: 100, step: 1 },
                { id: 'sp-grid-exp', label: 'Crescimento exponencial', type: 'number', value: 1.0, min: 0.5, max: 3.0, step: 0.1, hint: '1.0 = uniforme, >1 = espaço cresce' },
                { id: 'sp-grid-rot', label: 'Rotação do grid (°)', type: 'number', value: 0, min: 0, max: 90, step: 5 }
            ],
            circular: [
                { id: 'sp-circ-rings', label: 'Número de anéis', type: 'number', value: 1, min: 1, max: 10, step: 1 },
                { id: 'sp-circ-offset', label: 'Offset angular (°)', type: 'number', value: 0, min: 0, max: 360, step: 5 },
                { id: 'sp-circ-inner', label: 'Raio interno (fração)', type: 'number', value: 0.5, min: 0.1, max: 1.0, step: 0.05 },
                { id: 'sp-circ-exp', label: 'Crescimento exponencial', type: 'number', value: 1.0, min: 0.5, max: 3.0, step: 0.1, hint: '1.0 = uniforme, >1 = anéis se afastam' },
                { id: 'sp-circ-jitter', label: 'Jitter radial (m)', type: 'number', value: 0, min: 0, max: 100, step: 1 }
            ],
            spiral: [
                { id: 'sp-spiral-turns', label: 'Número de voltas', type: 'number', value: 3, min: 1, max: 20, step: 0.5 },
                { id: 'sp-spiral-growth', label: 'Fator de crescimento', type: 'number', value: 1.0, min: 0.1, max: 5, step: 0.1 },
                { id: 'sp-spiral-offset', label: 'Offset angular (°)', type: 'number', value: 0, min: 0, max: 360, step: 5 },
                { id: 'sp-spiral-arms', label: 'Nº de braços espirais', type: 'number', value: 1, min: 1, max: 6, step: 1, hint: '1 = espiral simples' },
                { id: 'sp-spiral-exp', label: 'Separação exponencial', type: 'number', value: 1.0, min: 0.5, max: 3.0, step: 0.1, hint: '1 = linear, >1 = acelera' },
                { id: 'sp-spiral-jitter', label: 'Jitter (m)', type: 'number', value: 0, min: 0, max: 100, step: 1 }
            ],
            y_shape: [
                { id: 'sp-y-arms', label: 'Número de braços', type: 'number', value: 3, min: 2, max: 8, step: 1 },
                { id: 'sp-y-angle', label: 'Ângulo inicial (°)', type: 'number', value: 90, min: 0, max: 360, step: 5 },
                { id: 'sp-y-curve', label: 'Curvatura dos braços', type: 'number', value: 0, min: -0.5, max: 0.5, step: 0.05 },
                { id: 'sp-y-core', label: 'Estação central', type: 'select', options: [{ v: '1', t: 'Sim' }, { v: '0', t: 'Não' }], value: '0' },
                { id: 'sp-y-exp', label: 'Separação exponencial', type: 'number', value: 1.0, min: 0.5, max: 3.0, step: 0.1, hint: '1 = uniforme, >1 = espaço cresce no braço' },
                { id: 'sp-y-taper', label: 'Taper (afunilamento)', type: 'number', value: 0, min: -1, max: 1, step: 0.1, hint: '>0 mais estações perto do centro' }
            ],
            cross: [
                { id: 'sp-cross-angle', label: 'Ângulo de rotação (°)', type: 'number', value: 0, min: 0, max: 90, step: 5 },
                { id: 'sp-cross-spacing-ratio', label: 'Proporção espaç. vert/horiz', type: 'number', value: 1.0, min: 0.1, max: 5, step: 0.1 },
                { id: 'sp-cross-core', label: 'Estação central', type: 'select', options: [{ v: '1', t: 'Sim' }, { v: '0', t: 'Não' }], value: '0' },
                { id: 'sp-cross-exp', label: 'Separação exponencial', type: 'number', value: 1.0, min: 0.5, max: 3.0, step: 0.1, hint: '1 = uniforme, >1 = cresce' }
            ],
            random: [
                { id: 'sp-rand-shape', label: 'Forma da área', type: 'select', options: [{ v: 'circle', t: 'Círculo' }, { v: 'square', t: 'Quadrado' }, { v: 'ellipse', t: 'Elipse' }], value: 'circle' },
                { id: 'sp-rand-mindist', label: 'Distância mín. entre stations (m)', type: 'number', value: 0, min: 0, max: 500, step: 5 },
                { id: 'sp-rand-seed', label: 'Semente (0 = aleatório)', type: 'number', value: 0, min: 0, max: 99999, step: 1 },
                { id: 'sp-rand-dist', label: 'Distribuição radial', type: 'select', options: [
                    { v: 'uniform', t: 'Uniforme' },
                    { v: 'gaussian', t: 'Gaussiana (concentrada no centro)' },
                    { v: 'exponential', t: 'Exponencial (decai do centro)' }
                ], value: 'uniform' },
                { id: 'sp-rand-sigma', label: 'Sigma da distribuição', type: 'number', value: 0.5, min: 0.1, max: 2.0, step: 0.1, hint: 'Aplica-se a gaussian/exponencial' }
            ],
            logarithmic: [
                { id: 'sp-log-arms', label: 'Nº de braços', type: 'number', value: 3, min: 1, max: 8, step: 1 },
                { id: 'sp-log-pitch', label: 'Ângulo de pitch (°)', type: 'number', value: 25, min: 5, max: 80, step: 1, hint: 'Abertura da espiral logarítmica' },
                { id: 'sp-log-offset', label: 'Offset angular (°)', type: 'number', value: 0, min: 0, max: 360, step: 5 },
                { id: 'sp-log-core', label: 'Estação central', type: 'select', options: [{ v: '1', t: 'Sim' }, { v: '0', t: 'Não' }], value: '1' },
                { id: 'sp-log-jitter', label: 'Jitter (m)', type: 'number', value: 0, min: 0, max: 100, step: 1 }
            ],
            sunflower: [
                { id: 'sp-sun-alpha', label: 'Fator de dispersão (α)', type: 'number', value: 1, min: 0, max: 5, step: 0.1, hint: '0 = Fibonacci puro, >0 = mais espaço na borda' },
                { id: 'sp-sun-offset', label: 'Offset angular (°)', type: 'number', value: 0, min: 0, max: 360, step: 5 },
                { id: 'sp-sun-exp', label: 'Crescimento radial', type: 'number', value: 0.5, min: 0.1, max: 2.0, step: 0.05, hint: '0.5 = padrão Fibonacci, >0.5 = mais disperso' }
            ],
            dual_ring: [
                { id: 'sp-dr-ratio', label: 'Proporção interno/externo', type: 'number', value: 0.4, min: 0.1, max: 0.9, step: 0.05, hint: 'Fração de estações no anel interno' },
                { id: 'sp-dr-inner-r', label: 'Raio interno (fração)', type: 'number', value: 0.35, min: 0.1, max: 0.8, step: 0.05 },
                { id: 'sp-dr-offset', label: 'Offset angular (°)', type: 'number', value: 0, min: 0, max: 360, step: 5 },
                { id: 'sp-dr-core', label: 'Estação central', type: 'select', options: [{ v: '1', t: 'Sim' }, { v: '0', t: 'Não' }], value: '0' }
            ],
            elliptical: [
                { id: 'sp-ell-ratio', label: 'Razão de eixos (b/a)', type: 'number', value: 0.6, min: 0.1, max: 1.0, step: 0.05, hint: '1.0 = círculo' },
                { id: 'sp-ell-rot', label: 'Rotação da elipse (°)', type: 'number', value: 0, min: 0, max: 180, step: 5 },
                { id: 'sp-ell-rings', label: 'Nº de anéis', type: 'number', value: 2, min: 1, max: 10, step: 1 },
                { id: 'sp-ell-exp', label: 'Crescimento exponencial', type: 'number', value: 1.0, min: 0.5, max: 3.0, step: 0.1 },
                { id: 'sp-ell-core', label: 'Estação central', type: 'select', options: [{ v: '1', t: 'Sim' }, { v: '0', t: 'Não' }], value: '1' }
            ]
        };

        const defs = paramDefs[layout] || [];
        let html = '';
        for (const p of defs) {
            if (p.type === 'select') {
                const opts = p.options.map(o => `<option value="${o.v}"${o.v === p.value ? ' selected' : ''}>${o.t}</option>`).join('');
                html += `<div class="form-group"><label for="${p.id}">${p.label}:</label><select id="${p.id}">${opts}</select></div>`;
            } else {
                html += `<div class="form-group"><label for="${p.id}">${p.label}:</label>` +
                    `<input type="number" id="${p.id}" value="${p.value}" min="${p.min}" max="${p.max}" step="${p.step}">` +
                    (p.hint ? `<small class="slider-hint">${p.hint}</small>` : '') +
                    `</div>`;
            }
        }
        this.extraParamsContainer.innerHTML = html;

        // Vincula listeners nos novos parâmetros dinâmicos para geração automática
        for (const p of defs) {
            const el = document.getElementById(p.id);
            if (el) {
                el.addEventListener(p.type === 'select' ? 'change' : 'input', () => this._autoGenerate());
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
            case 'logarithmic':
                this.stations = this.generateLogarithmicStations(count, spacing);
                break;
            case 'sunflower':
                this.stations = this.generateSunflowerStations(count, spacing);
                break;
            case 'dual_ring':
                this.stations = this.generateDualRingStations(count, spacing);
                break;
            case 'elliptical':
                this.stations = this.generateEllipticalStations(count, spacing);
                break;
            default:
                console.warn(`StationManager: Tipo de layout desconhecido '${layoutType}'. Usando grid.`);
                this.stations = this.generateGridStations(count, spacing);
        }

        this._centerStations();
        this.calculateBaselines();
        this.calculateAngularResolution();
        this.updateStats();
        this._pushStationsToMap();
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
    // Conversão para Mapa e Integração
    // ===========================

    /**
     * Converte posição local (x: East, y: North) em metros relativas ao BINGO Central
     * para coordenadas WGS84 (lat, lon).
     * Usa aproximação WGS84 para metros por grau no ponto de referência.
     * @param {number} xEast Deslocamento East em metros
     * @param {number} yNorth Deslocamento North em metros
     * @returns {{lat: number, lon: number, alt: number}}
     */
    _localToWgs84(xEast, yNorth) {
        const refLat = (typeof BingoConstants !== 'undefined') ? BingoConstants.BINGO_LATITUDE : -7.04067;
        const refLon = (typeof BingoConstants !== 'undefined') ? BingoConstants.BINGO_LONGITUDE : -38.26884;
        const refAlt = (typeof BingoConstants !== 'undefined') ? BingoConstants.BINGO_ALTITUDE : 396.4;

        const latRad = refLat * Math.PI / 180;
        // WGS84 ellipsoid series expansion for meters per degree (IAG 1980)
        const mPerDegLat = 111132.92 - 559.82 * Math.cos(2 * latRad) + 1.175 * Math.cos(4 * latRad);
        const mPerDegLon = 111412.84 * Math.cos(latRad) - 93.5 * Math.cos(3 * latRad);

        return {
            lat: refLat + (yNorth / mPerDegLat),
            lon: refLon + (xEast / mPerDegLon),
            alt: refAlt
        };
    }

    /**
     * Converte todas as estações para WGS84 e retorna.
     * @returns {Array<{lat: number, lon: number, alt: number}>}
     */
    getStationsAsWGS84() {
        return this.stations.map(s => this._localToWgs84(s.x, s.y));
    }

    /**
     * Empurra as estações geradas para o mapa interativo (se disponível)
     * e atualiza os campos de exportação WGS84, ECEF e ENU.
     */
    _pushStationsToMap() {
        const wgs84Stations = this.getStationsAsWGS84();

        // Atualiza o mapa interativo, se presente
        if (window.interactiveMap) {
            const map = window.interactiveMap;
            // Limpa marcadores antigos
            while (map.stationMarkers && map.stationMarkers.length > 0) {
                map.removeMarker(0);
            }
            // Adiciona novos marcadores
            wgs84Stations.forEach((st, i) => {
                map.addMarker(st.lat, st.lon, st.alt, `Station ${i + 1}`);
            });

            // Ajusta visualização para mostrar todas as estações
            if (map.stationMarkers && map.stationMarkers.length > 0 && map.map) {
                const group = L.featureGroup(map.stationMarkers);
                map.map.fitBounds(group.getBounds().pad(0.15));
            }
        }

        // Atualiza os campos de exportação diretamente
        const stationCoords = wgs84Stations.map((st, i) => ({
            lat: st.lat,
            lon: st.lon,
            alt: st.alt,
            name: `Station ${i + 1}`
        }));

        if (window.oskarExporter) {
            window.oskarExporter.updateAllExportFields(null, stationCoords);
        } else if (typeof window.updateExportFields === 'function') {
            window.updateExportFields(null, stationCoords);
        }
    }

    // ===========================
    // Métodos de Geração de Layout
    // ===========================

    /**
     * Gera estações em um grid regular.
     */
    generateGridStations(count, spacing) {
        const forcedCols = this._getExtraParam('sp-grid-cols', 0);
        const sx = this._getExtraParam('sp-grid-sx', 1.0);
        const sy = this._getExtraParam('sp-grid-sy', 1.0);
        const jitter = this._getExtraParam('sp-grid-jitter', 0);
        const expGrowth = this._getExtraParam('sp-grid-exp', 1.0);
        const rotDeg = this._getExtraParam('sp-grid-rot', 0);
        const rotRad = rotDeg * Math.PI / 180;

        const cols = (forcedCols > 0) ? forcedCols : Math.ceil(Math.sqrt(count));
        const rows = Math.ceil(count / cols);
        const positions = [];
        for (let r = 0; r < rows && positions.length < count; r++) {
            for (let c = 0; c < cols && positions.length < count; c++) {
                // Espaçamento exponencial: distância cresce com o índice
                const xSpacing = spacing * sx * Math.pow(c + 1, expGrowth);
                const ySpacing = spacing * sy * Math.pow(r + 1, expGrowth);
                let x = (expGrowth === 1.0) ? c * spacing * sx : xSpacing - spacing * sx;
                let y = (expGrowth === 1.0) ? r * spacing * sy : ySpacing - spacing * sy;
                if (jitter > 0) {
                    x += (Math.random() - 0.5) * 2 * jitter;
                    y += (Math.random() - 0.5) * 2 * jitter;
                }
                // Aplica rotação
                if (rotRad !== 0) {
                    const xr = x * Math.cos(rotRad) - y * Math.sin(rotRad);
                    const yr = x * Math.sin(rotRad) + y * Math.cos(rotRad);
                    x = xr; y = yr;
                }
                positions.push({ x, y });
            }
        }
        return positions;
    }

    /**
     * Gera estações em anéis circulares.
     */
    generateCircularStations(count, spacing) {
        const rings = this._getExtraParam('sp-circ-rings', 1);
        const offsetDeg = this._getExtraParam('sp-circ-offset', 0);
        const innerFrac = this._getExtraParam('sp-circ-inner', 0.5);
        const expGrowth = this._getExtraParam('sp-circ-exp', 1.0);
        const jitter = this._getExtraParam('sp-circ-jitter', 0);

        const positions = [];
        const offsetRad = offsetDeg * Math.PI / 180;

        if (rings === 1) {
            const radius = spacing;
            for (let i = 0; i < count; i++) {
                const angle = (2 * Math.PI * i) / count + offsetRad;
                let x = radius * Math.cos(angle);
                let y = radius * Math.sin(angle);
                if (jitter > 0) {
                    x += (Math.random() - 0.5) * 2 * jitter;
                    y += (Math.random() - 0.5) * 2 * jitter;
                }
                positions.push({ x, y });
            }
        } else {
            const perRing = Math.max(1, Math.floor(count / rings));
            let remaining = count;
            for (let ring = 0; ring < rings && remaining > 0; ring++) {
                // Crescimento exponencial entre anéis
                const t = rings === 1 ? 1 : ring / (rings - 1);
                const frac = innerFrac + (1 - innerFrac) * Math.pow(t, expGrowth);
                const radius = spacing * frac;
                const n = (ring === rings - 1) ? remaining : Math.min(perRing, remaining);
                const ringOffset = offsetRad + (ring % 2 === 1 ? Math.PI / n : 0);
                for (let i = 0; i < n; i++) {
                    const angle = (2 * Math.PI * i) / n + ringOffset;
                    let x = radius * Math.cos(angle);
                    let y = radius * Math.sin(angle);
                    if (jitter > 0) {
                        x += (Math.random() - 0.5) * 2 * jitter;
                        y += (Math.random() - 0.5) * 2 * jitter;
                    }
                    positions.push({ x, y });
                }
                remaining -= n;
            }
        }
        return positions;
    }

    /**
     * Gera estações em uma espiral.
     */
    generateSpiralStations(count, spacing) {
        const turns = this._getExtraParam('sp-spiral-turns', 3);
        const growth = this._getExtraParam('sp-spiral-growth', 1.0);
        const offsetDeg = this._getExtraParam('sp-spiral-offset', 0);
        const numArms = Math.max(1, this._getExtraParam('sp-spiral-arms', 1));
        const expSep = this._getExtraParam('sp-spiral-exp', 1.0);
        const jitter = this._getExtraParam('sp-spiral-jitter', 0);
        const offsetRad = offsetDeg * Math.PI / 180;

        const positions = [];
        const perArm = Math.floor(count / numArms);
        const remainder = count - perArm * numArms;

        for (let a = 0; a < numArms; a++) {
            const armCount = perArm + (a < remainder ? 1 : 0);
            const armOffset = (2 * Math.PI * a) / numArms;
            for (let i = 0; i < armCount; i++) {
                const t = (i + 1) / armCount;
                const r = spacing * Math.pow(t, growth) * Math.pow(t, expSep - 1);
                const theta = 2 * Math.PI * turns * t + offsetRad + armOffset;
                let x = r * Math.cos(theta);
                let y = r * Math.sin(theta);
                if (jitter > 0) {
                    x += (Math.random() - 0.5) * 2 * jitter;
                    y += (Math.random() - 0.5) * 2 * jitter;
                }
                positions.push({ x, y });
            }
        }
        return positions;
    }

    /**
     * Gera estações em um layout com braços radiais (Y, estrela, etc.).
     */
    generateYShapeStations(count, spacing) {
        const arms = Math.max(2, this._getExtraParam('sp-y-arms', 3));
        const angleDeg = this._getExtraParam('sp-y-angle', 90);
        const curve = this._getExtraParam('sp-y-curve', 0);
        const addCore = this._getExtraParam('sp-y-core', 0) === 1;
        const expSep = this._getExtraParam('sp-y-exp', 1.0);
        const taper = this._getExtraParam('sp-y-taper', 0);

        const positions = [];
        const baseAngle = angleDeg * Math.PI / 180;
        let stationsLeft = addCore ? count - 1 : count;
        if (addCore) {
            positions.push({ x: 0, y: 0 });
        }
        if (stationsLeft < 1) return positions;

        // Taper: redistribui estações entre braços (mais perto do centro com taper > 0)
        let perArm = Math.floor(stationsLeft / arms);
        const remainder = stationsLeft - perArm * arms;

        for (let a = 0; a < arms; a++) {
            const stationsInArm = perArm + (a < remainder ? 1 : 0);
            const armAngle = baseAngle + (2 * Math.PI * a) / arms;
            for (let i = 0; i < stationsInArm; i++) {
                const t = (i + 1) / stationsInArm;
                // Separação exponencial: espaço entre estações cresce
                const dist = spacing * Math.pow(t, expSep) * stationsInArm;
                // Taper: ajusta distribuição ao longo do braço
                const taperFactor = 1 - taper * (1 - t);
                const finalDist = dist * Math.max(0.1, taperFactor);
                const curveAngle = curve * (i + 1) * (i + 1) / stationsInArm;
                const angle = armAngle + curveAngle;
                positions.push({ x: finalDist * Math.cos(angle), y: finalDist * Math.sin(angle) });
            }
        }
        return positions;
    }

    /**
     * Gera estações em um layout em forma de cruz.
     */
    generateCrossStations(count, spacing) {
        const rotDeg = this._getExtraParam('sp-cross-angle', 0);
        const spacingRatio = this._getExtraParam('sp-cross-spacing-ratio', 1.0);
        const addCore = this._getExtraParam('sp-cross-core', 0) === 1;
        const expSep = this._getExtraParam('sp-cross-exp', 1.0);

        const rotRad = rotDeg * Math.PI / 180;
        const positions = [];
        let stationsLeft = addCore ? count - 1 : count;
        if (addCore) {
            positions.push({ x: 0, y: 0 });
        }
        if (stationsLeft < 1) return positions;

        const arms = 4;
        const perArm = Math.floor(stationsLeft / arms);
        const remainder = stationsLeft - perArm * arms;
        const armAngles = [0, Math.PI / 2, Math.PI, 3 * Math.PI / 2];

        for (let a = 0; a < arms; a++) {
            const stationsInArm = perArm + (a < remainder ? 1 : 0);
            const armAngle = armAngles[a] + rotRad;
            const spc = (a === 1 || a === 3) ? spacing * spacingRatio : spacing;
            for (let i = 0; i < stationsInArm; i++) {
                // Separação exponencial: distância cresce ao longo do braço
                const dist = spc * Math.pow((i + 1) / 1, expSep);
                positions.push({ x: dist * Math.cos(armAngle), y: dist * Math.sin(armAngle) });
            }
        }
        return positions;
    }

    /**
     * Gera estações com distribuição aleatória.
     */
    generateRandomStations(count, spacing) {
        const shape = (() => { const el = document.getElementById('sp-rand-shape'); return el ? el.value : 'circle'; })();
        const minDist = this._getExtraParam('sp-rand-mindist', 0);
        const seed = this._getExtraParam('sp-rand-seed', 0);
        const distType = (() => { const el = document.getElementById('sp-rand-dist'); return el ? el.value : 'uniform'; })();
        const sigma = this._getExtraParam('sp-rand-sigma', 0.5);

        // Pseudo-random with seed using Park-Miller MINSTD algorithm
        let rng;
        if (seed > 0) {
            let s = seed;
            const PRNG_MULTIPLIER = 16807;      // 7^5
            const PRNG_MODULUS = 2147483647;     // 2^31 - 1
            rng = () => { s = (s * PRNG_MULTIPLIER + 0) % PRNG_MODULUS; return (s - 1) / (PRNG_MODULUS - 1); };
        } else {
            rng = Math.random;
        }

        // Box-Muller para distribuição gaussiana
        const gaussRng = () => {
            const u1 = rng(), u2 = rng();
            return Math.sqrt(-2 * Math.log(u1 || 1e-10)) * Math.cos(2 * Math.PI * u2);
        };

        const area = spacing * Math.sqrt(count);
        const positions = [];
        const maxAttempts = count * 200;
        let attempts = 0;

        while (positions.length < count && attempts < maxAttempts) {
            attempts++;
            let x, y;

            if (distType === 'gaussian') {
                // Distribuição gaussiana: concentra estações no centro
                x = gaussRng() * area * sigma;
                y = gaussRng() * area * sigma;
            } else if (distType === 'exponential') {
                // Distribuição exponencial: decai do centro
                const r = -area * sigma * Math.log(rng() || 1e-10);
                const theta = 2 * Math.PI * rng();
                x = r * Math.cos(theta);
                y = r * Math.sin(theta);
            } else {
                // Uniforme (padrão)
                if (shape === 'circle') {
                    const r = area * Math.sqrt(rng());
                    const theta = 2 * Math.PI * rng();
                    x = r * Math.cos(theta);
                    y = r * Math.sin(theta);
                } else if (shape === 'ellipse') {
                    const r = area * Math.sqrt(rng());
                    const theta = 2 * Math.PI * rng();
                    x = r * Math.cos(theta);
                    y = r * sigma * Math.sin(theta); // sigma como razão de eixos
                } else {
                    x = (rng() - 0.5) * 2 * area;
                    y = (rng() - 0.5) * 2 * area;
                }
            }

            if (minDist > 0) {
                let tooClose = false;
                for (const p of positions) {
                    const dx = p.x - x, dy = p.y - y;
                    if (Math.sqrt(dx * dx + dy * dy) < minDist) {
                        tooClose = true;
                        break;
                    }
                }
                if (tooClose) continue;
            }
            positions.push({ x, y });
        }
        return positions;
    }

    /**
     * Gera estações em espiral logarítmica com múltiplos braços.
     * A espiral logarítmica é definida como r = a * e^(b*θ) onde b = tan(pitch).
     */
    generateLogarithmicStations(count, spacing) {
        const numArms = Math.max(1, this._getExtraParam('sp-log-arms', 3));
        const pitchDeg = this._getExtraParam('sp-log-pitch', 25);
        const offsetDeg = this._getExtraParam('sp-log-offset', 0);
        const addCore = this._getExtraParam('sp-log-core', 1) === 1;
        const jitter = this._getExtraParam('sp-log-jitter', 0);
        const offsetRad = offsetDeg * Math.PI / 180;
        const pitchRad = pitchDeg * Math.PI / 180;
        const b = Math.tan(pitchRad);

        const positions = [];
        let stationsLeft = addCore ? count - 1 : count;
        if (addCore) positions.push({ x: 0, y: 0 });
        if (stationsLeft < 1) return positions;

        const perArm = Math.floor(stationsLeft / numArms);
        const remainder = stationsLeft - perArm * numArms;
        const minRadius = spacing * 0.1;

        for (let a = 0; a < numArms; a++) {
            const armCount = perArm + (a < remainder ? 1 : 0);
            const armAngle = (2 * Math.PI * a) / numArms + offsetRad;
            for (let i = 0; i < armCount; i++) {
                const t = (i + 1) / armCount;
                const theta = t * 4 * Math.PI; // ~2 full turns
                const r = minRadius * Math.exp(b * theta);
                const scaledR = Math.min(r, spacing); // Cap at spacing
                const finalR = minRadius + (scaledR - minRadius) * (spacing / scaledR || 1);
                const angle = theta + armAngle;
                let x = finalR * Math.cos(angle);
                let y = finalR * Math.sin(angle);
                if (jitter > 0) {
                    x += (Math.random() - 0.5) * 2 * jitter;
                    y += (Math.random() - 0.5) * 2 * jitter;
                }
                positions.push({ x, y });
            }
        }
        return positions;
    }

    /**
     * Gera estações usando padrão girassol (Fibonacci/Vogel).
     * Distribui pontos uniformemente usando o ângulo dourado: θ = n × 137.508°.
     */
    generateSunflowerStations(count, spacing) {
        const alpha = this._getExtraParam('sp-sun-alpha', 1);
        const offsetDeg = this._getExtraParam('sp-sun-offset', 0);
        const radialExp = this._getExtraParam('sp-sun-exp', 0.5);
        const offsetRad = offsetDeg * Math.PI / 180;

        const positions = [];
        for (let i = 0; i < count; i++) {
            const n = i + alpha;
            const r = spacing * Math.pow(n / count, radialExp);
            const theta = i * GOLDEN_ANGLE + offsetRad;
            positions.push({ x: r * Math.cos(theta), y: r * Math.sin(theta) });
        }
        return positions;
    }

    /**
     * Gera estações em dois anéis concêntricos com proporção configurável.
     * Ideal para arrays com núcleo denso e anel externo esparso.
     */
    generateDualRingStations(count, spacing) {
        const innerRatio = this._getExtraParam('sp-dr-ratio', 0.4);
        const innerRadiusFrac = this._getExtraParam('sp-dr-inner-r', 0.35);
        const offsetDeg = this._getExtraParam('sp-dr-offset', 0);
        const addCore = this._getExtraParam('sp-dr-core', 0) === 1;
        const offsetRad = offsetDeg * Math.PI / 180;

        const positions = [];
        let stationsLeft = addCore ? count - 1 : count;
        if (addCore) positions.push({ x: 0, y: 0 });
        if (stationsLeft < 1) return positions;

        const innerCount = Math.max(1, Math.round(stationsLeft * innerRatio));
        const outerCount = stationsLeft - innerCount;
        const innerRadius = spacing * innerRadiusFrac;
        const outerRadius = spacing;

        // Anel interno
        for (let i = 0; i < innerCount; i++) {
            const angle = (2 * Math.PI * i) / innerCount + offsetRad;
            positions.push({ x: innerRadius * Math.cos(angle), y: innerRadius * Math.sin(angle) });
        }
        // Anel externo (com offset de meio passo angular)
        for (let i = 0; i < outerCount; i++) {
            const angle = (2 * Math.PI * i) / outerCount + offsetRad + Math.PI / outerCount;
            positions.push({ x: outerRadius * Math.cos(angle), y: outerRadius * Math.sin(angle) });
        }
        return positions;
    }

    /**
     * Gera estações em anéis elípticos.
     * Similar ao circular, mas com razão de eixos e rotação configuráveis.
     */
    generateEllipticalStations(count, spacing) {
        const axisRatio = this._getExtraParam('sp-ell-ratio', 0.6);
        const rotDeg = this._getExtraParam('sp-ell-rot', 0);
        const rings = Math.max(1, this._getExtraParam('sp-ell-rings', 2));
        const expGrowth = this._getExtraParam('sp-ell-exp', 1.0);
        const addCore = this._getExtraParam('sp-ell-core', 1) === 1;
        const rotRad = rotDeg * Math.PI / 180;

        const positions = [];
        let stationsLeft = addCore ? count - 1 : count;
        if (addCore) positions.push({ x: 0, y: 0 });
        if (stationsLeft < 1) return positions;

        const perRing = Math.max(1, Math.floor(stationsLeft / rings));
        let remaining = stationsLeft;

        for (let ring = 0; ring < rings && remaining > 0; ring++) {
            const t = rings === 1 ? 1 : (ring + 1) / rings;
            const radius = spacing * Math.pow(t, expGrowth);
            const n = (ring === rings - 1) ? remaining : Math.min(perRing, remaining);
            for (let i = 0; i < n; i++) {
                const angle = (2 * Math.PI * i) / n;
                let x = radius * Math.cos(angle);
                let y = radius * axisRatio * Math.sin(angle);
                // Aplica rotação
                const xr = x * Math.cos(rotRad) - y * Math.sin(rotRad);
                const yr = x * Math.sin(rotRad) + y * Math.cos(rotRad);
                positions.push({ x: xr, y: yr });
            }
            remaining -= n;
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
