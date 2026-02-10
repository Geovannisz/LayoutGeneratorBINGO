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
            this.spacingRange.addEventListener('input', () => this._updateSpacingDisplay());
        }
        if (this.layoutTypeSelect) {
            this.layoutTypeSelect.addEventListener('change', () => this._updateExtraParams());
        }

        this._updateSpacingDisplay();
        this._updateExtraParams();
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
                { id: 'sp-grid-jitter', label: 'Jitter aleatório (m)', type: 'number', value: 0, min: 0, max: 100, step: 1 }
            ],
            circular: [
                { id: 'sp-circ-rings', label: 'Número de anéis', type: 'number', value: 1, min: 1, max: 10, step: 1 },
                { id: 'sp-circ-offset', label: 'Offset angular (°)', type: 'number', value: 0, min: 0, max: 360, step: 5 },
                { id: 'sp-circ-inner', label: 'Raio interno (fração)', type: 'number', value: 0.5, min: 0.1, max: 1.0, step: 0.05 }
            ],
            spiral: [
                { id: 'sp-spiral-turns', label: 'Número de voltas', type: 'number', value: 3, min: 1, max: 20, step: 0.5 },
                { id: 'sp-spiral-growth', label: 'Fator de crescimento', type: 'number', value: 1.0, min: 0.1, max: 5, step: 0.1 },
                { id: 'sp-spiral-offset', label: 'Offset angular (°)', type: 'number', value: 0, min: 0, max: 360, step: 5 }
            ],
            y_shape: [
                { id: 'sp-y-arms', label: 'Número de braços', type: 'number', value: 3, min: 2, max: 8, step: 1 },
                { id: 'sp-y-angle', label: 'Ângulo inicial (°)', type: 'number', value: 90, min: 0, max: 360, step: 5 },
                { id: 'sp-y-curve', label: 'Curvatura dos braços', type: 'number', value: 0, min: -0.5, max: 0.5, step: 0.05 },
                { id: 'sp-y-core', label: 'Estação central', type: 'select', options: [{ v: '1', t: 'Sim' }, { v: '0', t: 'Não' }], value: '0' }
            ],
            cross: [
                { id: 'sp-cross-angle', label: 'Ângulo de rotação (°)', type: 'number', value: 0, min: 0, max: 90, step: 5 },
                { id: 'sp-cross-spacing-ratio', label: 'Proporção espaç. vert/horiz', type: 'number', value: 1.0, min: 0.1, max: 5, step: 0.1 },
                { id: 'sp-cross-core', label: 'Estação central', type: 'select', options: [{ v: '1', t: 'Sim' }, { v: '0', t: 'Não' }], value: '0' }
            ],
            random: [
                { id: 'sp-rand-shape', label: 'Forma da área', type: 'select', options: [{ v: 'circle', t: 'Círculo' }, { v: 'square', t: 'Quadrado' }], value: 'circle' },
                { id: 'sp-rand-mindist', label: 'Distância mín. entre stations (m)', type: 'number', value: 0, min: 0, max: 500, step: 5 },
                { id: 'sp-rand-seed', label: 'Semente (0 = aleatório)', type: 'number', value: 0, min: 0, max: 99999, step: 1 }
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
     * @param {number} xEast Deslocamento East em metros
     * @param {number} yNorth Deslocamento North em metros
     * @returns {{lat: number, lon: number, alt: number}}
     */
    _localToWgs84(xEast, yNorth) {
        const refLat = (typeof BingoConstants !== 'undefined') ? BingoConstants.BINGO_LATITUDE : -7.04067;
        const refLon = (typeof BingoConstants !== 'undefined') ? BingoConstants.BINGO_LONGITUDE : -38.26884;
        const refAlt = (typeof BingoConstants !== 'undefined') ? BingoConstants.BINGO_ALTITUDE : 396.4;

        const latRad = refLat * Math.PI / 180;
        // metros por grau de latitude e longitude
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

        const cols = (forcedCols > 0) ? forcedCols : Math.ceil(Math.sqrt(count));
        const rows = Math.ceil(count / cols);
        const positions = [];
        for (let r = 0; r < rows && positions.length < count; r++) {
            for (let c = 0; c < cols && positions.length < count; c++) {
                let x = c * spacing * sx;
                let y = r * spacing * sy;
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
     * Gera estações em anéis circulares.
     */
    generateCircularStations(count, spacing) {
        const rings = this._getExtraParam('sp-circ-rings', 1);
        const offsetDeg = this._getExtraParam('sp-circ-offset', 0);
        const innerFrac = this._getExtraParam('sp-circ-inner', 0.5);

        const positions = [];
        const offsetRad = offsetDeg * Math.PI / 180;

        if (rings === 1) {
            const radius = spacing;
            for (let i = 0; i < count; i++) {
                const angle = (2 * Math.PI * i) / count + offsetRad;
                positions.push({ x: radius * Math.cos(angle), y: radius * Math.sin(angle) });
            }
        } else {
            const perRing = Math.max(1, Math.floor(count / rings));
            let remaining = count;
            for (let ring = 0; ring < rings && remaining > 0; ring++) {
                const frac = rings === 1 ? 1 : innerFrac + (1 - innerFrac) * (ring / (rings - 1));
                const radius = spacing * frac;
                const n = (ring === rings - 1) ? remaining : Math.min(perRing, remaining);
                const ringOffset = offsetRad + (ring % 2 === 1 ? Math.PI / n : 0);
                for (let i = 0; i < n; i++) {
                    const angle = (2 * Math.PI * i) / n + ringOffset;
                    positions.push({ x: radius * Math.cos(angle), y: radius * Math.sin(angle) });
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
        const offsetRad = offsetDeg * Math.PI / 180;

        const positions = [];
        for (let i = 0; i < count; i++) {
            const t = (i + 1) / count; // 0..1
            const r = spacing * Math.pow(t, growth);
            const theta = 2 * Math.PI * turns * t + offsetRad;
            positions.push({ x: r * Math.cos(theta), y: r * Math.sin(theta) });
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

        const positions = [];
        const baseAngle = angleDeg * Math.PI / 180;
        let stationsLeft = addCore ? count - 1 : count;
        if (addCore && stationsLeft >= 0) {
            positions.push({ x: 0, y: 0 });
        }
        if (stationsLeft < 1) stationsLeft = count;

        const perArm = Math.floor(stationsLeft / arms);
        const remainder = stationsLeft - perArm * arms;

        for (let a = 0; a < arms; a++) {
            const stationsInArm = perArm + (a < remainder ? 1 : 0);
            const armAngle = baseAngle + (2 * Math.PI * a) / arms;
            for (let i = 0; i < stationsInArm; i++) {
                const dist = spacing * (i + 1);
                const curveAngle = curve * (i + 1) * (i + 1) / stationsInArm;
                const angle = armAngle + curveAngle;
                positions.push({ x: dist * Math.cos(angle), y: dist * Math.sin(angle) });
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

        const rotRad = rotDeg * Math.PI / 180;
        const positions = [];
        let stationsLeft = addCore ? count - 1 : count;
        if (addCore && stationsLeft >= 0) {
            positions.push({ x: 0, y: 0 });
        }
        if (stationsLeft < 1) stationsLeft = count;

        const arms = 4;
        const perArm = Math.floor(stationsLeft / arms);
        const remainder = stationsLeft - perArm * arms;
        const armAngles = [0, Math.PI / 2, Math.PI, 3 * Math.PI / 2];

        for (let a = 0; a < arms; a++) {
            const stationsInArm = perArm + (a < remainder ? 1 : 0);
            const armAngle = armAngles[a] + rotRad;
            const spc = (a === 1 || a === 3) ? spacing * spacingRatio : spacing;
            for (let i = 0; i < stationsInArm; i++) {
                const dist = spc * (i + 1);
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

        // Pseudo-random com semente
        let rng;
        if (seed > 0) {
            let s = seed;
            rng = () => { s = (s * 16807 + 0) % 2147483647; return (s - 1) / 2147483646; };
        } else {
            rng = Math.random;
        }

        const area = spacing * Math.sqrt(count);
        const positions = [];
        const maxAttempts = count * 200;
        let attempts = 0;

        while (positions.length < count && attempts < maxAttempts) {
            attempts++;
            let x, y;
            if (shape === 'circle') {
                const r = area * Math.sqrt(rng());
                const theta = 2 * Math.PI * rng();
                x = r * Math.cos(theta);
                y = r * Math.sin(theta);
            } else {
                x = (rng() - 0.5) * 2 * area;
                y = (rng() - 0.5) * 2 * area;
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
