/**
 * sky_model.js
 *
 * @fileoverview Módulo gerador de modelos de céu (sky model) para o simulador OSKAR.
 *
 * @description Permite ao usuário criar modelos de céu com fontes pontuais e
 * estendidas, suportando modos simples e avançado. Modos de geração incluem:
 * fonte única, grade (grid), aleatório e distribuição power-law. O resultado
 * é exportado no formato de sky model do OSKAR.
 *
 * @requires BingoConstants
 * @author Geovanni Fernandes Garcia
 * @version 1.0.2
 */

'use strict';

// Frequência de referência padrão - usar BingoConstants quando disponível
const SKY_DEFAULT_REF_FREQ = (typeof BingoConstants !== 'undefined') ? BingoConstants.FREQUENCY_HZ : 1e9;

// =============================================================================
// Classe principal
// =============================================================================

class SkyModelGenerator {
    constructor() {
        /** @type {Array<Object>} Lista de fontes do modelo de céu */
        this.sources = [];

        /** @type {string} Modo atual: 'simple' ou 'advanced' */
        this.mode = 'simple';

        /** @type {string} Tipo de geração: 'single', 'grid', 'random', 'power_law' */
        this.generationType = 'single';

        // Referências DOM
        /** @type {HTMLSelectElement|null} */
        this.modeSelect = document.getElementById('sky-mode-select');
        /** @type {HTMLSelectElement|null} */
        this.generationTypeSelect = document.getElementById('sky-generation-type');
        /** @type {HTMLElement|null} */
        this.paramsContainer = document.getElementById('sky-params-container');
        /** @type {HTMLElement|null} */
        this.sourceTable = document.getElementById('sky-source-table');
        /** @type {HTMLElement|null} */
        this.sourceCount = document.getElementById('sky-source-count');
        /** @type {HTMLTextAreaElement|null} */
        this.previewTextarea = document.getElementById('sky-preview');
        /** @type {HTMLButtonElement|null} */
        this.addBtn = document.getElementById('sky-add-btn');
        /** @type {HTMLButtonElement|null} */
        this.clearBtn = document.getElementById('sky-clear-btn');
        /** @type {HTMLButtonElement|null} */
        this.downloadBtn = document.getElementById('sky-download-btn');
        /** @type {HTMLButtonElement|null} */
        this.copyBtn = document.getElementById('sky-copy-btn');

        this._bindEvents();
        this.renderControls();
        this.updatePreview();

        console.log('SkyModelGenerator inicializado com sucesso.');
    }

    // =========================================================================
    // Inicialização e bindagem de eventos
    // =========================================================================

    /**
     * Liga os event listeners aos elementos da interface.
     */
    _bindEvents() {
        if (this.modeSelect) {
            this.modeSelect.addEventListener('change', () => {
                this.mode = this.modeSelect.value;
                this.renderControls();
            });
        }

        if (this.generationTypeSelect) {
            this.generationTypeSelect.addEventListener('change', () => {
                this.generationType = this.generationTypeSelect.value;
                this.renderControls();
            });
        }

        if (this.addBtn) {
            this.addBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this._handleAdd();
            });
        }

        if (this.clearBtn) {
            this.clearBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.clearSources();
            });
        }

        if (this.downloadBtn) {
            this.downloadBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.downloadModel();
            });
        }

        if (this.copyBtn) {
            this.copyBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this._copyToClipboard();
            });
        }
    }

    // =========================================================================
    // Renderização de controles
    // =========================================================================

    /**
     * Renderiza os controles de parâmetros de acordo com o modo e tipo de geração.
     */
    renderControls() {
        if (!this.paramsContainer) return;

        if (this.mode === 'simple') {
            this._renderSimpleControls();
        } else {
            this._renderAdvancedControls();
        }
    }

    /**
     * Renderiza os controles do modo simples, baseando-se no tipo de geração.
     */
    _renderSimpleControls() {
        let html = '';

        switch (this.generationType) {
            case 'single':
                html = this._buildSingleSourceFields();
                break;
            case 'grid':
                html = this._buildGridFields();
                break;
            case 'random':
                html = this._buildRandomFields();
                break;
            case 'power_law':
                html = this._buildPowerLawFields();
                break;
            default:
                html = this._buildSingleSourceFields();
        }

        this.paramsContainer.innerHTML = html;
    }

    /**
     * Renderiza os controles do modo avançado.
     */
    _renderAdvancedControls() {
        this.paramsContainer.innerHTML = `
            <div class="param-group">
                <label for="sky-advanced-text">Lista de fontes (formato OSKAR):</label>
                <textarea id="sky-advanced-text" rows="10" class="form-control"
                    placeholder="RA(deg) Dec(deg) I(Jy) Q U V freq0(Hz) spix e_maj(arcsec) e_min(arcsec) e_pa(deg)"></textarea>
                <small class="form-text">Cole fontes no formato OSKAR, uma por linha.</small>
            </div>
        `;
    }

    /**
     * Gera o HTML dos campos para fonte única.
     * @returns {string} HTML dos campos.
     */
    _buildSingleSourceFields() {
        return `
            <div class="param-group">
                <label for="sky-ra">RA (graus):</label>
                <input type="number" id="sky-ra" value="0.0" step="0.001" min="0" max="360" class="form-control">
            </div>
            <div class="param-group">
                <label for="sky-dec">Dec (graus):</label>
                <input type="number" id="sky-dec" value="0.0" step="0.001" min="-90" max="90" class="form-control">
            </div>
            <div class="param-group">
                <label for="sky-flux">Fluxo Stokes I (Jy):</label>
                <input type="number" id="sky-flux" value="1.0" step="0.01" min="0" class="form-control">
            </div>
            <div class="param-group">
                <label for="sky-spix">Índice espectral:</label>
                <input type="number" id="sky-spix" value="0.0" step="0.01" class="form-control">
            </div>
            <div class="param-group">
                <label for="sky-ref-freq">Frequência de referência (Hz):</label>
                <input type="number" id="sky-ref-freq" value="${SKY_DEFAULT_REF_FREQ}" step="1e6" class="form-control">
            </div>
            <div class="param-group">
                <label for="sky-major">Eixo maior (arcsec):</label>
                <input type="number" id="sky-major" value="0.0" step="0.1" min="0" class="form-control">
            </div>
            <div class="param-group">
                <label for="sky-minor">Eixo menor (arcsec):</label>
                <input type="number" id="sky-minor" value="0.0" step="0.1" min="0" class="form-control">
            </div>
            <div class="param-group">
                <label for="sky-pa">Ângulo de posição (graus):</label>
                <input type="number" id="sky-pa" value="0.0" step="0.1" class="form-control">
            </div>
        `;
    }

    /**
     * Gera o HTML dos campos para geração em grade.
     * @returns {string} HTML dos campos.
     */
    _buildGridFields() {
        return `
            <div class="param-group">
                <label for="sky-grid-n">Dimensão da grade (N×N):</label>
                <input type="number" id="sky-grid-n" value="5" step="1" min="1" class="form-control">
            </div>
            <div class="param-group">
                <label for="sky-grid-spacing">Espaçamento (graus):</label>
                <input type="number" id="sky-grid-spacing" value="1.0" step="0.01" min="0.001" class="form-control">
            </div>
            <div class="param-group">
                <label for="sky-grid-ra">RA central (graus):</label>
                <input type="number" id="sky-grid-ra" value="0.0" step="0.001" min="0" max="360" class="form-control">
            </div>
            <div class="param-group">
                <label for="sky-grid-dec">Dec central (graus):</label>
                <input type="number" id="sky-grid-dec" value="0.0" step="0.001" min="-90" max="90" class="form-control">
            </div>
            <div class="param-group">
                <label for="sky-grid-flux">Fluxo por fonte (Jy):</label>
                <input type="number" id="sky-grid-flux" value="1.0" step="0.01" min="0" class="form-control">
            </div>
        `;
    }

    /**
     * Gera o HTML dos campos para geração aleatória.
     * @returns {string} HTML dos campos.
     */
    _buildRandomFields() {
        return `
            <div class="param-group">
                <label for="sky-rand-n">Número de fontes:</label>
                <input type="number" id="sky-rand-n" value="100" step="1" min="1" class="form-control">
            </div>
            <div class="param-group">
                <label for="sky-rand-ra">RA central (graus):</label>
                <input type="number" id="sky-rand-ra" value="0.0" step="0.001" min="0" max="360" class="form-control">
            </div>
            <div class="param-group">
                <label for="sky-rand-dec">Dec central (graus):</label>
                <input type="number" id="sky-rand-dec" value="0.0" step="0.001" min="-90" max="90" class="form-control">
            </div>
            <div class="param-group">
                <label for="sky-rand-radius">Raio do campo (graus):</label>
                <input type="number" id="sky-rand-radius" value="5.0" step="0.1" min="0.01" class="form-control">
            </div>
            <div class="param-group">
                <label for="sky-rand-flux-min">Fluxo mínimo (Jy):</label>
                <input type="number" id="sky-rand-flux-min" value="0.01" step="0.001" min="0" class="form-control">
            </div>
            <div class="param-group">
                <label for="sky-rand-flux-max">Fluxo máximo (Jy):</label>
                <input type="number" id="sky-rand-flux-max" value="10.0" step="0.1" min="0" class="form-control">
            </div>
            <div class="param-group">
                <label for="sky-rand-spix-min">Índice espectral mín.:</label>
                <input type="number" id="sky-rand-spix-min" value="-1.0" step="0.1" class="form-control">
            </div>
            <div class="param-group">
                <label for="sky-rand-spix-max">Índice espectral máx.:</label>
                <input type="number" id="sky-rand-spix-max" value="0.0" step="0.1" class="form-control">
            </div>
        `;
    }

    /**
     * Gera o HTML dos campos para distribuição power-law.
     * @returns {string} HTML dos campos.
     */
    _buildPowerLawFields() {
        return `
            <div class="param-group">
                <label for="sky-pl-n">Número de fontes:</label>
                <input type="number" id="sky-pl-n" value="200" step="1" min="1" class="form-control">
            </div>
            <div class="param-group">
                <label for="sky-pl-ra">RA central (graus):</label>
                <input type="number" id="sky-pl-ra" value="0.0" step="0.001" min="0" max="360" class="form-control">
            </div>
            <div class="param-group">
                <label for="sky-pl-dec">Dec central (graus):</label>
                <input type="number" id="sky-pl-dec" value="0.0" step="0.001" min="-90" max="90" class="form-control">
            </div>
            <div class="param-group">
                <label for="sky-pl-radius">Raio do campo (graus):</label>
                <input type="number" id="sky-pl-radius" value="5.0" step="0.1" min="0.01" class="form-control">
            </div>
            <div class="param-group">
                <label for="sky-pl-smin">S_min (Jy):</label>
                <input type="number" id="sky-pl-smin" value="0.001" step="0.0001" min="0" class="form-control">
            </div>
            <div class="param-group">
                <label for="sky-pl-smax">S_max (Jy):</label>
                <input type="number" id="sky-pl-smax" value="10.0" step="0.1" min="0" class="form-control">
            </div>
            <div class="param-group">
                <label for="sky-pl-alpha">Expoente α:</label>
                <input type="number" id="sky-pl-alpha" value="1.6" step="0.1" min="0.01" class="form-control">
            </div>
        `;
    }

    // =========================================================================
    // Manipulação de fontes
    // =========================================================================

    /**
     * Gerencia o clique no botão de adicionar, despachando para o método correto.
     */
    _handleAdd() {
        if (this.mode === 'advanced') {
            this._parseAdvancedInput();
            return;
        }

        switch (this.generationType) {
            case 'single':
                this._addSingleFromUI();
                break;
            case 'grid':
                this._generateGridFromUI();
                break;
            case 'random':
                this._generateRandomFromUI();
                break;
            case 'power_law':
                this._generatePowerLawFromUI();
                break;
        }
    }

    /**
     * Lê os campos da UI e adiciona uma fonte única.
     */
    _addSingleFromUI() {
        const ra = parseFloat(document.getElementById('sky-ra')?.value) || 0;
        const dec = parseFloat(document.getElementById('sky-dec')?.value) || 0;
        const flux = parseFloat(document.getElementById('sky-flux')?.value) || 1;
        const spix = parseFloat(document.getElementById('sky-spix')?.value) || 0;
        const refFreq = parseFloat(document.getElementById('sky-ref-freq')?.value) || SKY_DEFAULT_REF_FREQ;
        const major = parseFloat(document.getElementById('sky-major')?.value) || 0;
        const minor = parseFloat(document.getElementById('sky-minor')?.value) || 0;
        const pa = parseFloat(document.getElementById('sky-pa')?.value) || 0;

        this.addSingleSource(ra, dec, flux, spix, refFreq, major, minor, pa);
    }

    /**
     * Valida os parâmetros de uma fonte celeste.
     * @param {number} ra Ascensão reta em graus.
     * @param {number} dec Declinação em graus.
     * @param {number} flux Fluxo Stokes I em Jy.
     * @returns {string[]} Lista de erros encontrados.
     * @private
     */
    _validateSource(ra, dec, flux) {
        const errors = [];
        if (ra < 0 || ra >= 360) errors.push(`RA=${ra}° fora do intervalo [0°, 360°).`);
        if (dec < -90 || dec > 90) errors.push(`Dec=${dec}° fora do intervalo [-90°, +90°].`);
        if (flux < 0) errors.push(`Fluxo=${flux} Jy não pode ser negativo.`);
        return errors;
    }

    /**
     * Adiciona uma única fonte ao modelo de céu.
     * @param {number} ra Ascensão reta em graus.
     * @param {number} dec Declinação em graus.
     * @param {number} flux Fluxo Stokes I em Jy.
     * @param {number} spectralIndex Índice espectral.
     * @param {number} refFreq Frequência de referência em Hz.
     * @param {number} [major=0] Eixo maior em arcsec.
     * @param {number} [minor=0] Eixo menor em arcsec.
     * @param {number} [pa=0] Ângulo de posição em graus.
     */
    addSingleSource(ra, dec, flux, spectralIndex, refFreq, major = 0, minor = 0, pa = 0) {
        const errors = this._validateSource(ra, dec, flux);
        if (errors.length > 0) {
            console.warn(`SkyModel: Fonte rejeitada — ${errors.join(' ')}`);
            alert(`Fonte inválida:\n${errors.join('\n')}`);
            return;
        }

        this.sources.push({
            ra: ra,
            dec: dec,
            flux: flux,
            q: 0,
            u: 0,
            v: 0,
            refFreq: refFreq,
            spectralIndex: spectralIndex,
            major: major,
            minor: minor,
            pa: pa
        });

        console.log(`SkyModel: Fonte adicionada em RA=${ra}°, Dec=${dec}°, I=${flux} Jy.`);
        this.updateSourceTable();
        this.updatePreview();
    }

    /**
     * Lê os campos da UI e gera a grade de fontes.
     */
    _generateGridFromUI() {
        const params = {
            n: parseInt(document.getElementById('sky-grid-n')?.value) || 5,
            spacing: parseFloat(document.getElementById('sky-grid-spacing')?.value) || 1.0,
            centerRA: parseFloat(document.getElementById('sky-grid-ra')?.value) || 0,
            centerDec: parseFloat(document.getElementById('sky-grid-dec')?.value) || 0,
            flux: parseFloat(document.getElementById('sky-grid-flux')?.value) || 1.0
        };
        this.generateGrid(params);
    }

    /**
     * Gera uma grade N×N de fontes pontuais.
     * @param {Object} params Parâmetros da grade.
     * @param {number} params.n Dimensão da grade (N×N).
     * @param {number} params.spacing Espaçamento em graus.
     * @param {number} params.centerRA RA central em graus.
     * @param {number} params.centerDec Dec central em graus.
     * @param {number} params.flux Fluxo de cada fonte em Jy.
     */
    generateGrid(params) {
        const { n, spacing, centerRA, centerDec, flux } = params;
        const offset = (n - 1) / 2;

        for (let i = 0; i < n; i++) {
            for (let j = 0; j < n; j++) {
                const ra = centerRA + (i - offset) * spacing;
                const dec = centerDec + (j - offset) * spacing;
                this.sources.push({
                    ra: ra,
                    dec: dec,
                    flux: flux,
                    q: 0, u: 0, v: 0,
                    refFreq: SKY_DEFAULT_REF_FREQ,
                    spectralIndex: 0,
                    major: 0, minor: 0, pa: 0
                });
            }
        }

        console.log(`SkyModel: Grade ${n}×${n} gerada com ${n * n} fontes.`);
        this.updateSourceTable();
        this.updatePreview();
    }

    /**
     * Lê os campos da UI e gera fontes aleatórias.
     */
    _generateRandomFromUI() {
        const params = {
            count: parseInt(document.getElementById('sky-rand-n')?.value) || 100,
            centerRA: parseFloat(document.getElementById('sky-rand-ra')?.value) || 0,
            centerDec: parseFloat(document.getElementById('sky-rand-dec')?.value) || 0,
            radius: parseFloat(document.getElementById('sky-rand-radius')?.value) || 5.0,
            fluxMin: parseFloat(document.getElementById('sky-rand-flux-min')?.value) || 0.01,
            fluxMax: parseFloat(document.getElementById('sky-rand-flux-max')?.value) || 10.0,
            spixMin: parseFloat(document.getElementById('sky-rand-spix-min')?.value) || -1.0,
            spixMax: parseFloat(document.getElementById('sky-rand-spix-max')?.value) || 0.0
        };
        this.generateRandom(params);
    }

    /**
     * Gera fontes aleatórias dentro de um campo circular.
     * @param {Object} params Parâmetros de geração.
     * @param {number} params.count Número de fontes.
     * @param {number} params.centerRA RA central em graus.
     * @param {number} params.centerDec Dec central em graus.
     * @param {number} params.radius Raio do campo em graus.
     * @param {number} params.fluxMin Fluxo mínimo em Jy.
     * @param {number} params.fluxMax Fluxo máximo em Jy.
     * @param {number} params.spixMin Índice espectral mínimo.
     * @param {number} params.spixMax Índice espectral máximo.
     */
    generateRandom(params) {
        const { count, centerRA, centerDec, radius, fluxMin, fluxMax, spixMin, spixMax } = params;

        for (let i = 0; i < count; i++) {
            // Distribuição uniforme em disco circular
            const r = radius * Math.sqrt(Math.random());
            const theta = 2 * Math.PI * Math.random();
            const ra = ((centerRA + r * Math.cos(theta)) % 360 + 360) % 360;
            const dec = Math.max(-90, Math.min(90, centerDec + r * Math.sin(theta)));
            const flux = fluxMin + Math.random() * (fluxMax - fluxMin);
            const spix = spixMin + Math.random() * (spixMax - spixMin);

            this.sources.push({
                ra: ra,
                dec: dec,
                flux: flux,
                q: 0, u: 0, v: 0,
                refFreq: SKY_DEFAULT_REF_FREQ,
                spectralIndex: spix,
                major: 0, minor: 0, pa: 0
            });
        }

        console.log(`SkyModel: ${count} fontes aleatórias geradas no campo de raio ${radius}°.`);
        this.updateSourceTable();
        this.updatePreview();
    }

    /**
     * Lê os campos da UI e gera distribuição power-law.
     */
    _generatePowerLawFromUI() {
        const params = {
            count: parseInt(document.getElementById('sky-pl-n')?.value) || 200,
            centerRA: parseFloat(document.getElementById('sky-pl-ra')?.value) || 0,
            centerDec: parseFloat(document.getElementById('sky-pl-dec')?.value) || 0,
            radius: parseFloat(document.getElementById('sky-pl-radius')?.value) || 5.0,
            sMin: parseFloat(document.getElementById('sky-pl-smin')?.value) || 0.001,
            sMax: parseFloat(document.getElementById('sky-pl-smax')?.value) || 10.0,
            alpha: parseFloat(document.getElementById('sky-pl-alpha')?.value) || 1.6
        };
        this.generatePowerLaw(params);
    }

    /**
     * Gera fontes com distribuição de fluxo power-law (dN/dS ∝ S^{-α}).
     * @param {Object} params Parâmetros da distribuição.
     * @param {number} params.count Número de fontes.
     * @param {number} params.centerRA RA central em graus.
     * @param {number} params.centerDec Dec central em graus.
     * @param {number} params.radius Raio do campo em graus.
     * @param {number} params.sMin Fluxo mínimo em Jy.
     * @param {number} params.sMax Fluxo máximo em Jy.
     * @param {number} params.alpha Expoente da power-law.
     */
    generatePowerLaw(params) {
        const { count, centerRA, centerDec, radius, sMin, sMax, alpha } = params;
        const exponent = 1 - alpha;

        for (let i = 0; i < count; i++) {
            // Amostragem por inversão da CDF: S = (u * (Smax^e - Smin^e) + Smin^e)^(1/e)
            const u = Math.random();
            let flux;
            if (Math.abs(exponent) < 1e-10) {
                flux = sMin * Math.pow(sMax / sMin, u);
            } else {
                const sMinE = Math.pow(sMin, exponent);
                const sMaxE = Math.pow(sMax, exponent);
                flux = Math.pow(u * (sMaxE - sMinE) + sMinE, 1 / exponent);
            }

            // Posição aleatória no campo
            const r = radius * Math.sqrt(Math.random());
            const theta = 2 * Math.PI * Math.random();
            const ra = ((centerRA + r * Math.cos(theta)) % 360 + 360) % 360;
            const dec = Math.max(-90, Math.min(90, centerDec + r * Math.sin(theta)));

            this.sources.push({
                ra: ra,
                dec: dec,
                flux: flux,
                q: 0, u: 0, v: 0,
                refFreq: SKY_DEFAULT_REF_FREQ,
                spectralIndex: 0,
                major: 0, minor: 0, pa: 0
            });
        }

        console.log(`SkyModel: ${count} fontes power-law geradas (α=${alpha}, S=[${sMin}, ${sMax}] Jy).`);
        this.updateSourceTable();
        this.updatePreview();
    }

    /**
     * Analisa o texto do modo avançado e importa as fontes.
     */
    _parseAdvancedInput() {
        const textarea = document.getElementById('sky-advanced-text');
        if (!textarea) return;

        const lines = textarea.value.trim().split('\n');
        let imported = 0;

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) continue;

            const parts = trimmed.split(/\s+/);
            if (parts.length < 3) continue;

            this.sources.push({
                ra: parseFloat(parts[0]) || 0,
                dec: parseFloat(parts[1]) || 0,
                flux: parseFloat(parts[2]) || 0,
                q: parseFloat(parts[3]) || 0,
                u: parseFloat(parts[4]) || 0,
                v: parseFloat(parts[5]) || 0,
                refFreq: parseFloat(parts[6]) || SKY_DEFAULT_REF_FREQ,
                spectralIndex: parseFloat(parts[7]) || 0,
                major: parseFloat(parts[8]) || 0,
                minor: parseFloat(parts[9]) || 0,
                pa: parseFloat(parts[10]) || 0
            });
            imported++;
        }

        console.log(`SkyModel: ${imported} fontes importadas do modo avançado.`);
        this.updateSourceTable();
        this.updatePreview();
    }

    /**
     * Remove todas as fontes do modelo.
     */
    clearSources() {
        this.sources = [];
        console.log('SkyModel: Todas as fontes removidas.');
        this.updateSourceTable();
        this.updatePreview();
    }

    // =========================================================================
    // Atualização da interface
    // =========================================================================

    /**
     * Atualiza a pré-visualização do sky model no textarea.
     */
    updatePreview() {
        if (this.previewTextarea) {
            this.previewTextarea.value = this.exportOskarFormat();
        }
        if (this.sourceCount) {
            this.sourceCount.textContent = `${this.sources.length} fonte(s)`;
        }
    }

    /**
     * Atualiza a tabela de fontes na interface.
     */
    updateSourceTable() {
        if (!this.sourceTable) return;

        if (this.sources.length === 0) {
            this.sourceTable.innerHTML = '<tr><td colspan="6" style="text-align:center;">Nenhuma fonte adicionada.</td></tr>';
            return;
        }

        let html = `
            <tr>
                <th>#</th>
                <th>RA (°)</th>
                <th>Dec (°)</th>
                <th>I (Jy)</th>
                <th>Índ. Esp.</th>
                <th>Ação</th>
            </tr>
        `;

        this.sources.forEach((src, idx) => {
            html += `
                <tr>
                    <td>${idx + 1}</td>
                    <td>${src.ra.toFixed(4)}</td>
                    <td>${src.dec.toFixed(4)}</td>
                    <td>${src.flux.toFixed(4)}</td>
                    <td>${src.spectralIndex.toFixed(2)}</td>
                    <td><button class="sky-remove-btn" data-index="${idx}" title="Remover fonte">✕</button></td>
                </tr>
            `;
        });

        this.sourceTable.innerHTML = html;

        // Liga eventos de remoção individual
        this.sourceTable.querySelectorAll('.sky-remove-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const index = parseInt(e.target.dataset.index);
                this._removeSource(index);
            });
        });
    }

    /**
     * Remove uma fonte pelo índice.
     * @param {number} index Índice da fonte a remover.
     */
    _removeSource(index) {
        if (index >= 0 && index < this.sources.length) {
            this.sources.splice(index, 1);
            console.log(`SkyModel: Fonte #${index + 1} removida.`);
            this.updateSourceTable();
            this.updatePreview();
        }
    }

    // =========================================================================
    // Exportação
    // =========================================================================

    /**
     * Gera o texto no formato sky model do OSKAR.
     * Cada linha: RA(deg) Dec(deg) I(Jy) Q U V freq0(Hz) spix e_maj(arcsec) e_min(arcsec) e_pa(deg)
     * @returns {string} Conteúdo do sky model.
     */
    exportOskarFormat() {
        const lines = [];

        lines.push(`# OSKAR Sky Model`);
        lines.push(`# Gerado pelo BINGO Layout Generator`);
        lines.push(`# Número de fontes: ${this.sources.length}`);
        lines.push(`# Formato: RA(deg) Dec(deg) I(Jy) Q U V freq0(Hz) spix e_maj(arcsec) e_min(arcsec) e_pa(deg)`);

        for (const src of this.sources) {
            const parts = [
                src.ra.toFixed(6),
                src.dec.toFixed(6),
                src.flux.toExponential(6),
                src.q.toFixed(1),
                src.u.toFixed(1),
                src.v.toFixed(1),
                src.refFreq.toExponential(6),
                src.spectralIndex.toFixed(4),
                src.major.toFixed(2),
                src.minor.toFixed(2),
                src.pa.toFixed(2)
            ];
            lines.push(parts.join(' '));
        }

        return lines.join('\n');
    }

    /**
     * Faz o download do arquivo sky model (.osm).
     */
    downloadModel() {
        const content = this.exportOskarFormat();
        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = 'bingo_sky_model.osm';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        console.log('SkyModel: Arquivo sky model baixado com sucesso.');
    }

    /**
     * Copia o conteúdo do sky model para a área de transferência.
     */
    _copyToClipboard() {
        const content = this.exportOskarFormat();

        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(content).then(() => {
                console.log('SkyModel: Conteúdo copiado para a área de transferência.');
                this._showCopyFeedback();
            }).catch(err => {
                console.error('SkyModel: Erro ao copiar para a área de transferência:', err);
            });
        } else if (this.previewTextarea) {
            this.previewTextarea.select();
            document.execCommand('copy');
            console.log('SkyModel: Conteúdo copiado (método legado).');
            this._showCopyFeedback();
        }
    }

    /**
     * Mostra feedback visual temporário no botão de copiar.
     */
    _showCopyFeedback() {
        if (!this.copyBtn) return;
        const originalText = this.copyBtn.innerHTML;
        this.copyBtn.innerHTML = '<i class="fas fa-check"></i> Copiado!';
        this.copyBtn.disabled = true;
        setTimeout(() => {
            this.copyBtn.innerHTML = originalText;
            this.copyBtn.disabled = false;
        }, 1500);
    }
}

// =============================================================================
// Inicialização
// =============================================================================

document.addEventListener('DOMContentLoaded', () => {
    if (!window.skyModelGenerator) {
        try {
            window.skyModelGenerator = new SkyModelGenerator();
            console.log('Instância de SkyModelGenerator criada e configurada.');
        } catch (error) {
            console.error('Erro ao instanciar SkyModelGenerator:', error);
        }
    } else {
        window.skyModelGenerator.updatePreview();
    }
});
