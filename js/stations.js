/**
 * stations.js
 *
 * @fileoverview Gerenciamento de posições de stations (estações do interferômetro).
 * Implementa geração de layouts de stations em várias configurações geométricas
 * com escala ~30x maior que tiles.
 *
 * @author Geovanni Fernandes Garcia
 * @version 1.0.3
 */

'use strict';

/**
 * StationManager - Gerencia a geração e visualização de stations
 */
class StationManager {
    constructor() {
        this.stations = [];
        this.stationType = 'grid';
        this.frequency = 1e9; // 1 GHz padrão
        this.params = this.getDefaultParams();
        this.initialized = false;
        
        // Fator de escala padrão: ~30x maior que tiles
        this.SCALE_FACTOR = 30.0;
        
        // Velocidade da luz
        this.C = 299792458; // m/s
    }

    /**
     * Retorna parâmetros padrão para cada tipo de layout de station
     */
    getDefaultParams() {
        return {
            grid: {
                numCols: 3,
                numRows: 3,
                spacingX: 30.0, // metros
                spacingY: 30.0
            },
            circular: {
                numStations: 6,
                radius: 50.0 // metros
            },
            spiral: {
                numArms: 3,
                stationsPerArm: 4,
                radiusStart: 10.0,
                radiusStep: 15.0,
                angleStep: 0.3 // radianos
            },
            y_shape: {
                stationsPerArm: 4,
                armLength: 60.0, // metros
                armSpacing: 15.0
            },
            cross: {
                stationsPerArm: 4,
                armLength: 60.0,
                armSpacing: 15.0
            },
            random: {
                numStations: 10,
                maxRadius: 100.0 // metros
            }
        };
    }

    /**
     * Inicializa o gerenciador de stations
     */
    init() {
        if (this.initialized) return;

        this.setupUI();
        this.setupEventListeners();
        this.generateStations();

        this.initialized = true;
        console.log('StationManager inicializado com sucesso');
    }

    /**
     * Configura a interface do usuário para stations
     */
    setupUI() {
        const layoutSection = document.querySelector('.layout-generator');
        if (!layoutSection) return;

        // Cria seção de stations após o gerador de tiles
        const stationsSection = document.createElement('div');
        stationsSection.className = 'stations-section';
        stationsSection.innerHTML = `
            <h3><i class="fas fa-satellite-dish"></i> Gerador de Posições de Stations</h3>
            <p class="description">Configure as posições das estações do interferômetro. 
            As stations são automaticamente visualizadas no mapa e têm escala ~30x maior que tiles.</p>
            
            <div class="stations-controls">
                <div class="form-group">
                    <label for="station-type">Tipo de Layout:</label>
                    <select id="station-type">
                        <option value="grid">Grade (Grid)</option>
                        <option value="circular">Circular</option>
                        <option value="spiral">Espiral</option>
                        <option value="y_shape">Forma Y</option>
                        <option value="cross">Cruz</option>
                        <option value="random">Aleatório</option>
                    </select>
                </div>
                
                <div id="station-dynamic-params" class="dynamic-params-container">
                </div>
                
                <div class="form-group">
                    <label for="station-frequency">Frequência (MHz):</label>
                    <div class="slider-group">
                        <input type="range" id="station-frequency-slider" min="400" max="1500" value="1000" step="10">
                        <input type="number" id="station-frequency-input" min="400" max="1500" value="1000" step="10">
                    </div>
                </div>
                
                <div class="angular-resolution-display">
                    <strong>Resolução Angular Teórica:</strong>
                    <div id="angular-resolution-value">--</div>
                    <small>θ ≈ λ / B<sub>max</sub> (onde B<sub>max</sub> é a baseline máxima)</small>
                </div>
                
                <div class="button-group">
                    <button id="generate-stations-btn" class="primary">
                        <i class="fas fa-satellite-dish"></i> Gerar Stations
                    </button>
                    <button id="clear-stations-btn" class="secondary">
                        <i class="fas fa-eraser"></i> Limpar
                    </button>
                </div>
            </div>
        `;

        // Insere após a seção de análise PSF
        const analysisRow = layoutSection.querySelector('.analysis-download-row');
        if (analysisRow) {
            analysisRow.insertAdjacentElement('afterend', stationsSection);
        } else {
            layoutSection.appendChild(stationsSection);
        }

        this.updateDynamicParams();
    }

    /**
     * Atualiza os parâmetros dinâmicos com base no tipo selecionado
     */
    updateDynamicParams() {
        const container = document.getElementById('station-dynamic-params');
        if (!container) return;

        const type = this.stationType;
        const params = this.params[type];
        
        let html = '';

        switch (type) {
            case 'grid':
                html = `
                    <div class="control-group">
                        <label>Número de Colunas: <span id="station-cols-value">${params.numCols}</span></label>
                        <input type="range" id="station-cols" min="2" max="10" value="${params.numCols}" step="1">
                    </div>
                    <div class="control-group">
                        <label>Número de Linhas: <span id="station-rows-value">${params.numRows}</span></label>
                        <input type="range" id="station-rows" min="2" max="10" value="${params.numRows}" step="1">
                    </div>
                    <div class="control-group">
                        <label>Espaçamento X (m): <span id="station-spacing-x-value">${params.spacingX}</span></label>
                        <input type="range" id="station-spacing-x" min="10" max="200" value="${params.spacingX}" step="5">
                    </div>
                    <div class="control-group">
                        <label>Espaçamento Y (m): <span id="station-spacing-y-value">${params.spacingY}</span></label>
                        <input type="range" id="station-spacing-y" min="10" max="200" value="${params.spacingY}" step="5">
                    </div>
                `;
                break;
            case 'circular':
                html = `
                    <div class="control-group">
                        <label>Número de Stations: <span id="station-num-value">${params.numStations}</span></label>
                        <input type="range" id="station-num" min="3" max="20" value="${params.numStations}" step="1">
                    </div>
                    <div class="control-group">
                        <label>Raio (m): <span id="station-radius-value">${params.radius}</span></label>
                        <input type="range" id="station-radius" min="20" max="300" value="${params.radius}" step="10">
                    </div>
                `;
                break;
            case 'spiral':
                html = `
                    <div class="control-group">
                        <label>Número de Braços: <span id="station-arms-value">${params.numArms}</span></label>
                        <input type="range" id="station-arms" min="1" max="6" value="${params.numArms}" step="1">
                    </div>
                    <div class="control-group">
                        <label>Stations por Braço: <span id="station-per-arm-value">${params.stationsPerArm}</span></label>
                        <input type="range" id="station-per-arm" min="2" max="10" value="${params.stationsPerArm}" step="1">
                    </div>
                    <div class="control-group">
                        <label>Raio Inicial (m): <span id="station-radius-start-value">${params.radiusStart}</span></label>
                        <input type="range" id="station-radius-start" min="5" max="50" value="${params.radiusStart}" step="5">
                    </div>
                    <div class="control-group">
                        <label>Incremento de Raio (m): <span id="station-radius-step-value">${params.radiusStep}</span></label>
                        <input type="range" id="station-radius-step" min="5" max="50" value="${params.radiusStep}" step="5">
                    </div>
                `;
                break;
            case 'y_shape':
                html = `
                    <div class="control-group">
                        <label>Stations por Braço: <span id="station-per-arm-value">${params.stationsPerArm}</span></label>
                        <input type="range" id="station-per-arm" min="2" max="10" value="${params.stationsPerArm}" step="1">
                    </div>
                    <div class="control-group">
                        <label>Comprimento do Braço (m): <span id="station-arm-length-value">${params.armLength}</span></label>
                        <input type="range" id="station-arm-length" min="20" max="200" value="${params.armLength}" step="10">
                    </div>
                    <div class="control-group">
                        <label>Espaçamento (m): <span id="station-arm-spacing-value">${params.armSpacing}</span></label>
                        <input type="range" id="station-arm-spacing" min="5" max="50" value="${params.armSpacing}" step="5">
                    </div>
                `;
                break;
            case 'cross':
                html = `
                    <div class="control-group">
                        <label>Stations por Braço: <span id="station-per-arm-value">${params.stationsPerArm}</span></label>
                        <input type="range" id="station-per-arm" min="2" max="10" value="${params.stationsPerArm}" step="1">
                    </div>
                    <div class="control-group">
                        <label>Comprimento do Braço (m): <span id="station-arm-length-value">${params.armLength}</span></label>
                        <input type="range" id="station-arm-length" min="20" max="200" value="${params.armLength}" step="10">
                    </div>
                    <div class="control-group">
                        <label>Espaçamento (m): <span id="station-arm-spacing-value">${params.armSpacing}</span></label>
                        <input type="range" id="station-arm-spacing" min="5" max="50" value="${params.armSpacing}" step="5">
                    </div>
                `;
                break;
            case 'random':
                html = `
                    <div class="control-group">
                        <label>Número de Stations: <span id="station-num-value">${params.numStations}</span></label>
                        <input type="range" id="station-num" min="3" max="30" value="${params.numStations}" step="1">
                    </div>
                    <div class="control-group">
                        <label>Raio Máximo (m): <span id="station-max-radius-value">${params.maxRadius}</span></label>
                        <input type="range" id="station-max-radius" min="30" max="500" value="${params.maxRadius}" step="10">
                    </div>
                `;
                break;
        }

        container.innerHTML = html;

        // Adiciona listeners para os novos controles
        this.attachParamListeners();
    }

    /**
     * Anexa listeners para os controles de parâmetros
     */
    attachParamListeners() {
        const container = document.getElementById('station-dynamic-params');
        if (!container) return;

        const sliders = container.querySelectorAll('input[type="range"]');
        sliders.forEach(slider => {
            slider.addEventListener('input', (e) => {
                const valueSpan = document.getElementById(`${e.target.id}-value`);
                if (valueSpan) {
                    valueSpan.textContent = e.target.value;
                }
            });

            slider.addEventListener('change', () => {
                this.updateParamsFromUI();
                this.generateStations();
            });
        });
    }

    /**
     * Configura event listeners
     */
    setupEventListeners() {
        // Tipo de station
        const typeSelect = document.getElementById('station-type');
        if (typeSelect) {
            typeSelect.addEventListener('change', (e) => {
                this.stationType = e.target.value;
                this.updateDynamicParams();
                this.generateStations();
            });
        }

        // Frequência
        const freqSlider = document.getElementById('station-frequency-slider');
        const freqInput = document.getElementById('station-frequency-input');
        
        if (freqSlider && freqInput) {
            freqSlider.addEventListener('input', (e) => {
                freqInput.value = e.target.value;
                this.frequency = parseFloat(e.target.value) * 1e6; // Converte MHz para Hz
            });

            freqInput.addEventListener('input', (e) => {
                freqSlider.value = e.target.value;
                this.frequency = parseFloat(e.target.value) * 1e6;
            });

            freqSlider.addEventListener('change', () => {
                this.updateAngularResolution();
            });

            freqInput.addEventListener('change', () => {
                this.updateAngularResolution();
            });
        }

        // Botões
        const generateBtn = document.getElementById('generate-stations-btn');
        if (generateBtn) {
            generateBtn.addEventListener('click', () => {
                this.generateStations();
            });
        }

        const clearBtn = document.getElementById('clear-stations-btn');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                this.clearStations();
            });
        }
    }

    /**
     * Atualiza parâmetros a partir da UI
     */
    updateParamsFromUI() {
        const type = this.stationType;
        const params = this.params[type];

        switch (type) {
            case 'grid':
                const cols = document.getElementById('station-cols');
                const rows = document.getElementById('station-rows');
                const spacingX = document.getElementById('station-spacing-x');
                const spacingY = document.getElementById('station-spacing-y');
                if (cols) params.numCols = parseInt(cols.value);
                if (rows) params.numRows = parseInt(rows.value);
                if (spacingX) params.spacingX = parseFloat(spacingX.value);
                if (spacingY) params.spacingY = parseFloat(spacingY.value);
                break;
            
            case 'circular':
                const num = document.getElementById('station-num');
                const radius = document.getElementById('station-radius');
                if (num) params.numStations = parseInt(num.value);
                if (radius) params.radius = parseFloat(radius.value);
                break;
            
            case 'spiral':
                const arms = document.getElementById('station-arms');
                const perArm = document.getElementById('station-per-arm');
                const radiusStart = document.getElementById('station-radius-start');
                const radiusStep = document.getElementById('station-radius-step');
                if (arms) params.numArms = parseInt(arms.value);
                if (perArm) params.stationsPerArm = parseInt(perArm.value);
                if (radiusStart) params.radiusStart = parseFloat(radiusStart.value);
                if (radiusStep) params.radiusStep = parseFloat(radiusStep.value);
                break;
            
            case 'y_shape':
            case 'cross':
                const perArmYC = document.getElementById('station-per-arm');
                const armLength = document.getElementById('station-arm-length');
                const armSpacing = document.getElementById('station-arm-spacing');
                if (perArmYC) params.stationsPerArm = parseInt(perArmYC.value);
                if (armLength) params.armLength = parseFloat(armLength.value);
                if (armSpacing) params.armSpacing = parseFloat(armSpacing.value);
                break;
            
            case 'random':
                const numRand = document.getElementById('station-num');
                const maxRadius = document.getElementById('station-max-radius');
                if (numRand) params.numStations = parseInt(numRand.value);
                if (maxRadius) params.maxRadius = parseFloat(maxRadius.value);
                break;
        }
    }

    /**
     * Gera as posições das stations
     */
    generateStations() {
        this.updateParamsFromUI();
        const type = this.stationType;
        const params = this.params[type];

        let stations = [];

        switch (type) {
            case 'grid':
                stations = this.generateGridStations(params);
                break;
            case 'circular':
                stations = this.generateCircularStations(params);
                break;
            case 'spiral':
                stations = this.generateSpiralStations(params);
                break;
            case 'y_shape':
                stations = this.generateYShapeStations(params);
                break;
            case 'cross':
                stations = this.generateCrossStations(params);
                break;
            case 'random':
                stations = this.generateRandomStations(params);
                break;
        }

        this.stations = stations;
        this.updateAngularResolution();
        this.notifyUpdate();

        console.log(`${stations.length} stations geradas no layout ${type}`);
    }

    /**
     * Gera stations em grade
     */
    generateGridStations(params) {
        const stations = [];
        const { numCols, numRows, spacingX, spacingY } = params;

        for (let row = 0; row < numRows; row++) {
            for (let col = 0; col < numCols; col++) {
                const x = (col - (numCols - 1) / 2) * spacingX;
                const y = (row - (numRows - 1) / 2) * spacingY;
                stations.push({ x, y });
            }
        }

        return stations;
    }

    /**
     * Gera stations em círculo
     */
    generateCircularStations(params) {
        const stations = [];
        const { numStations, radius } = params;

        // Adiciona uma station no centro
        stations.push({ x: 0, y: 0 });

        // Adiciona stations no círculo
        for (let i = 0; i < numStations; i++) {
            const angle = (2 * Math.PI * i) / numStations;
            const x = radius * Math.cos(angle);
            const y = radius * Math.sin(angle);
            stations.push({ x, y });
        }

        return stations;
    }

    /**
     * Gera stations em espiral
     */
    generateSpiralStations(params) {
        const stations = [];
        const { numArms, stationsPerArm, radiusStart, radiusStep, angleStep } = params;

        // Station central
        stations.push({ x: 0, y: 0 });

        for (let arm = 0; arm < numArms; arm++) {
            const baseAngle = (2 * Math.PI * arm) / numArms;
            
            for (let i = 1; i <= stationsPerArm; i++) {
                const radius = radiusStart + (i - 1) * radiusStep;
                const angle = baseAngle + i * angleStep;
                const x = radius * Math.cos(angle);
                const y = radius * Math.sin(angle);
                stations.push({ x, y });
            }
        }

        return stations;
    }

    /**
     * Gera stations em forma de Y
     */
    generateYShapeStations(params) {
        const stations = [];
        const { stationsPerArm, armLength, armSpacing } = params;

        // Station central
        stations.push({ x: 0, y: 0 });

        // Três braços a 120 graus
        const angles = [Math.PI / 2, -Math.PI / 6, -5 * Math.PI / 6]; // 90°, -30°, -150°

        angles.forEach(angle => {
            for (let i = 1; i <= stationsPerArm; i++) {
                const distance = i * armSpacing;
                const x = distance * Math.cos(angle);
                const y = distance * Math.sin(angle);
                stations.push({ x, y });
            }
        });

        return stations;
    }

    /**
     * Gera stations em forma de cruz
     */
    generateCrossStations(params) {
        const stations = [];
        const { stationsPerArm, armLength, armSpacing } = params;

        // Station central
        stations.push({ x: 0, y: 0 });

        // Quatro braços a 90 graus
        const angles = [0, Math.PI / 2, Math.PI, 3 * Math.PI / 2]; // 0°, 90°, 180°, 270°

        angles.forEach(angle => {
            for (let i = 1; i <= stationsPerArm; i++) {
                const distance = i * armSpacing;
                const x = distance * Math.cos(angle);
                const y = distance * Math.sin(angle);
                stations.push({ x, y });
            }
        });

        return stations;
    }

    /**
     * Gera stations aleatórias
     */
    generateRandomStations(params) {
        const stations = [];
        const { numStations, maxRadius } = params;

        // Station central
        stations.push({ x: 0, y: 0 });

        for (let i = 0; i < numStations; i++) {
            const angle = Math.random() * 2 * Math.PI;
            const r = Math.sqrt(Math.random()) * maxRadius; // Distribuição uniforme em área
            const x = r * Math.cos(angle);
            const y = r * Math.sin(angle);
            stations.push({ x, y });
        }

        return stations;
    }

    /**
     * Calcula e atualiza a resolução angular
     */
    updateAngularResolution() {
        if (this.stations.length < 2) {
            const display = document.getElementById('angular-resolution-value');
            if (display) {
                display.textContent = 'N/A (mínimo 2 stations)';
            }
            return;
        }

        // Calcula baseline máxima
        let maxBaseline = 0;
        for (let i = 0; i < this.stations.length; i++) {
            for (let j = i + 1; j < this.stations.length; j++) {
                const dx = this.stations[i].x - this.stations[j].x;
                const dy = this.stations[i].y - this.stations[j].y;
                const baseline = Math.sqrt(dx * dx + dy * dy);
                if (baseline > maxBaseline) {
                    maxBaseline = baseline;
                }
            }
        }

        // Calcula resolução angular: θ ≈ λ / B_max
        const wavelength = this.C / this.frequency; // em metros
        const thetaRad = wavelength / maxBaseline;
        const thetaDeg = thetaRad * (180 / Math.PI);
        const thetaArcmin = thetaDeg * 60;
        const thetaArcsec = thetaArcmin * 60;

        const display = document.getElementById('angular-resolution-value');
        if (display) {
            let displayText = '';
            if (thetaDeg >= 1) {
                displayText = `${thetaDeg.toFixed(3)}° (${maxBaseline.toFixed(1)} m baseline)`;
            } else if (thetaArcmin >= 1) {
                displayText = `${thetaArcmin.toFixed(2)}' (${maxBaseline.toFixed(1)} m baseline)`;
            } else {
                displayText = `${thetaArcsec.toFixed(2)}" (${maxBaseline.toFixed(1)} m baseline)`;
            }
            display.textContent = displayText;
        }
    }

    /**
     * Limpa todas as stations
     */
    clearStations() {
        this.stations = [];
        this.updateAngularResolution();
        this.notifyUpdate();
        console.log('Stations limpas');
    }

    /**
     * Notifica outras partes da aplicação sobre mudanças
     */
    notifyUpdate() {
        window.dispatchEvent(new CustomEvent('stationsUpdated', {
            detail: { stations: this.stations }
        }));
    }

    /**
     * Retorna as stations atuais
     */
    getStations() {
        return this.stations;
    }

    /**
     * Define stations (útil para importação)
     */
    setStations(stations) {
        this.stations = stations;
        this.updateAngularResolution();
        this.notifyUpdate();
    }
}

// Cria instância global
window.stationManager = new StationManager();
