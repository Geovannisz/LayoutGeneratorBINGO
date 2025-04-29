/**
 * Módulo para geração e visualização de layouts de antenas BINGO.
 * Utiliza a biblioteca BingoLayouts (bingo_layouts.js) e desenha
 * os resultados em um canvas HTML. Permite ajustar parâmetros
 * dinamicamente com sliders, visualizar colisões e baixar a imagem do layout.
 * Redesenha automaticamente ao mudar o tema da página.
 * --- MODIFICADO: Dispara evento 'layoutGenerated' após gerar layout ---
 */

// === Constantes Globais ===
const TILE_WIDTH = 0.35;
const TILE_HEIGHT = 1.34;
const ANTENNAS_PER_TILE = 64;
const SUBGROUP_N = 2;
const SUBGROUP_M = 8;
const SUBGROUP_DX = 0.1760695885;
const SUBGROUP_DY = 0.1675843071;
const DIAMOND_OFFSET = 0.05;

// Parâmetros Padrão (sem modos explícitos, fator exp = 1.0 por padrão)
const DEFAULT_PARAMS = {
    grid: { numCols: 12, numRows: 3, spacingXFactor: 1.0, spacingYFactor: 1.0, centerExpScaleFactor: 1.0, randomOffsetStddevM: 0.0, minSeparationFactor: 1.0 },
    spiral: { numArms: 3, tilesPerArm: 12, radiusStartFactor: 0.7, radiusStepFactor: 0.3, centerExpScaleFactor: 1.0, angleStepRad: Math.PI / 9, armOffsetRad: 0.0, rotationPerArmRad: 0.0, randomOffsetStddevM: 0.0, minSeparationFactor: 1.0, includeCenterTile: false },
    ring: { numRings: 3, tilesPerRing: [8, 16, 24], radiusStartFactor: 1.0, radiusStepFactor: 1.0, centerExpScaleFactor: 1.0, angleOffsetRad: 0.0, randomOffsetStddevM: 0.0, minSeparationFactor: 1.0, addCenterTile: false },
    rhombus: { numRowsHalf: 6, sideLengthFactor: 0.65, hCompressFactor: 0.778, vCompressFactor: 0.86, centerExpScaleFactor: 1.0, randomOffsetStddevM: 0.0, minSeparationFactor: 1.0 },
    hex_grid: { numRingsHex: 3, spacingFactor: 0.8, centerExpScaleFactor: 1.0, addCenterTile: true, randomOffsetStddevM: 0.0, minSeparationFactor: 1.0 },
    phyllotaxis: { numTiles: 50, scaleFactor: 0.6, centerOffsetFactor: 0.25, centerExpScaleFactor: 1.0, randomOffsetStddevM: 0.0, minSeparationFactor: 1.0 },
    manual_circular: { spacingXFactor: 1.0, spacingYFactor: 1.0, centerExpScaleFactor: 1.0, randomOffsetStddevM: 0.0, minSeparationFactor: 1.0 },
    random: { numTiles: 36, maxRadiusM: 4.0, minSeparationFactor: 1.0 }
};

// Controles da Interface (sem modos explícitos)
const PARAM_CONTROLS = {
    grid: [ { id: 'numCols', label: 'Número de Colunas', type: 'number', min: 1, max: 20, step: 1 }, { id: 'numRows', label: 'Número de Linhas', type: 'number', min: 1, max: 20, step: 1 }, { id: 'spacingXFactor', label: 'Fator Espaç. X', type: 'number', min: 0.1, max: 5, step: 0.1 }, { id: 'spacingYFactor', label: 'Fator Espaç. Y', type: 'number', min: 0.1, max: 5, step: 0.1 }, { id: 'centerExpScaleFactor', label: 'Fator Exp. Central', type: 'number', min: 0.5, max: 3, step: 0.05 }, { id: 'randomOffsetStddevM', label: 'Offset Aleatório (m)', type: 'number', min: 0, max: 1, step: 0.01 }, { id: 'minSeparationFactor', label: 'Fator Sep. Mín.', type: 'number', min: 0.5, max: 2, step: 0.05, condition: 'this.params.randomOffsetStddevM > 0' } ],
    spiral: [ { id: 'numArms', label: 'Número de Braços', type: 'number', min: 1, max: 12, step: 1 }, { id: 'tilesPerArm', label: 'Tiles por Braço', type: 'number', min: 1, max: 30, step: 1 }, { id: 'radiusStartFactor', label: 'Fator Raio Inicial', type: 'number', min: 0.1, max: 5, step: 0.1 }, { id: 'radiusStepFactor', label: 'Fator Passo Raio Lin.', type: 'number', min: 0.1, max: 2, step: 0.05 }, { id: 'centerExpScaleFactor', label: 'Fator Exp. Central', type: 'number', min: 0.5, max: 3, step: 0.05 }, { id: 'angleStepRad', label: 'Passo Angular (rad)', type: 'number', min: 0.01, max: Math.PI.toFixed(3), step: 0.01 }, { id: 'includeCenterTile', label: 'Incluir Tile Central', type: 'checkbox' }, { id: 'randomOffsetStddevM', label: 'Offset Aleatório (m)', type: 'number', min: 0, max: 1, step: 0.01 }, { id: 'minSeparationFactor', label: 'Fator Sep. Mín.', type: 'number', min: 0.5, max: 2, step: 0.05, condition: 'this.params.randomOffsetStddevM > 0' } ],
    ring: [ { id: 'numRings', label: 'Número de Anéis', type: 'number', min: 1, max: 10, step: 1 }, { id: 'radiusStartFactor', label: 'Fator Raio Inicial', type: 'number', min: 0.1, max: 5, step: 0.1 }, { id: 'radiusStepFactor', label: 'Fator Passo Raio Lin.', type: 'number', min: 0.1, max: 2, step: 0.05 }, { id: 'centerExpScaleFactor', label: 'Fator Exp. Central', type: 'number', min: 0.5, max: 3, step: 0.05 }, { id: 'addCenterTile', label: 'Adicionar Tile Central', type: 'checkbox' }, { id: 'randomOffsetStddevM', label: 'Offset Aleatório (m)', type: 'number', min: 0, max: 1, step: 0.01 }, { id: 'minSeparationFactor', label: 'Fator Sep. Mín.', type: 'number', min: 0.5, max: 2, step: 0.05, condition: 'this.params.randomOffsetStddevM > 0' } ],
    rhombus: [ { id: 'numRowsHalf', label: 'Metade Linhas', type: 'number', min: 1, max: 15, step: 1 }, { id: 'sideLengthFactor', label: 'Fator Lado Célula', type: 'number', min: 0.1, max: 5, step: 0.05 }, { id: 'hCompressFactor', label: 'Compressão Horiz.', type: 'number', min: 0.1, max: 5, step: 0.1 }, { id: 'vCompressFactor', label: 'Compressão Vert.', type: 'number', min: 0.1, max: 5, step: 0.1 }, { id: 'centerExpScaleFactor', label: 'Fator Exp. Central', type: 'number', min: 0.5, max: 3, step: 0.05 }, { id: 'randomOffsetStddevM', label: 'Offset Aleatório (m)', type: 'number', min: 0, max: 1, step: 0.01 }, { id: 'minSeparationFactor', label: 'Fator Sep. Mín.', type: 'number', min: 0.5, max: 2, step: 0.05, condition: 'this.params.randomOffsetStddevM > 0' } ],
    hex_grid: [ { id: 'numRingsHex', label: 'Nº Anéis Hex.', type: 'number', min: 0, max: 10, step: 1 }, { id: 'spacingFactor', label: 'Fator Espaçamento', type: 'number', min: 0.1, max: 5, step: 0.1 }, { id: 'centerExpScaleFactor', label: 'Fator Exp. Central', type: 'number', min: 0.5, max: 3, step: 0.05 }, { id: 'addCenterTile', label: 'Adicionar Tile Central', type: 'checkbox' }, { id: 'randomOffsetStddevM', label: 'Offset Aleatório (m)', type: 'number', min: 0, max: 1, step: 0.01 }, { id: 'minSeparationFactor', label: 'Fator Sep. Mín.', type: 'number', min: 0.5, max: 2, step: 0.05, condition: 'this.params.randomOffsetStddevM > 0' } ],
    phyllotaxis: [ { id: 'numTiles', label: 'Número de Tiles', type: 'number', min: 1, max: 200, step: 1 }, { id: 'scaleFactor', label: 'Fator de Escala', type: 'number', min: 0.1, max: 5, step: 0.1 }, { id: 'centerOffsetFactor', label: 'Fator Offset Central', type: 'number', min: 0.01, max: 1, step: 0.01 }, { id: 'centerExpScaleFactor', label: 'Fator Exp. Central', type: 'number', min: 0.5, max: 3, step: 0.05 }, { id: 'randomOffsetStddevM', label: 'Offset Aleatório (m)', type: 'number', min: 0, max: 1, step: 0.01 }, { id: 'minSeparationFactor', label: 'Fator Sep. Mín.', type: 'number', min: 0.5, max: 2, step: 0.05, condition: 'this.params.randomOffsetStddevM > 0' } ],
    manual_circular: [ { id: 'spacingXFactor', label: 'Fator Espaç. X', type: 'number', min: 0.1, max: 5, step: 0.1 }, { id: 'spacingYFactor', label: 'Fator Espaç. Y', type: 'number', min: 0.1, max: 5, step: 0.1 }, { id: 'centerExpScaleFactor', label: 'Fator Exp. Central', type: 'number', min: 0.5, max: 3, step: 0.05 }, { id: 'randomOffsetStddevM', label: 'Offset Aleatório (m)', type: 'number', min: 0, max: 1, step: 0.01 }, { id: 'minSeparationFactor', label: 'Fator Sep. Mín.', type: 'number', min: 0.5, max: 2, step: 0.05, condition: 'this.params.randomOffsetStddevM > 0' } ],
    random: [ { id: 'numTiles', label: 'Número de Tiles', type: 'number', min: 1, max: 200, step: 1 }, { id: 'maxRadiusM', label: 'Raio Máximo (m)', type: 'number', min: 1, max: 50, step: 1 }, { id: 'minSeparationFactor', label: 'Fator Sep. Mín.', type: 'number', min: 0.5, max: 2, step: 0.05 } ]
};

// === Classe Principal do Gerador ===
class AntennaLayoutGenerator {
    /**
     * Construtor da classe. Inicializa o canvas, os parâmetros,
     * os controles da interface (incluindo download de imagem) e o layout inicial.
     */
    constructor() {
        this.canvas = document.getElementById('layout-canvas');
        if (!this.canvas) {
            console.error("Erro Fatal: Elemento canvas#layout-canvas não encontrado!");
            alert("Erro: Canvas de visualização não encontrado.");
            return;
        }
        this.ctx = this.canvas.getContext('2d');
        this.layoutType = document.getElementById('layout-type')?.value || 'grid';
        this.params = JSON.parse(JSON.stringify(DEFAULT_PARAMS[this.layoutType]));
        this.currentLayout = [];
        this.allAntennas = [];
        this.collisions = [];

        // Estado inicial para mostrar colisões (default: true)
        this.showCollisions = true;
        const showCollisionsCheckbox = document.getElementById('show-collisions');
        if (showCollisionsCheckbox) {
            showCollisionsCheckbox.checked = this.showCollisions;
        } else {
            console.warn("Elemento input#show-collisions não encontrado durante inicialização.");
        }

        // Referências para os controles de download da imagem (buscados no initControls)
        this.downloadImageBtn = null;
        this.imageThemeRadios = null;
        this.imageAxesRadios = null;

        // Ajusta tamanho do canvas e listener de resize
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());

        // Inicializa os controles da interface (parâmetros, botões, download)
        this.initControls();

        // O layout inicial será gerado por main.js após a inicialização completa
    }

    /** Redimensiona o canvas para caber no container e redesenha. */
    resizeCanvas() {
        const container = this.canvas.parentElement; // .visualization
        if (container) {
            const style = getComputedStyle(container);
            const containerWidth = container.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
            const containerHeight = container.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);

            // Considera altura do stats e collision-info *dentro* do container .visualization
            const statsDiv = container.querySelector('.stats');
            const statsHeight = statsDiv ? statsDiv.offsetHeight : 0;
            const collisionInfoDiv = container.querySelector('.collision-info');
            const collisionInfoHeight = collisionInfoDiv ? collisionInfoDiv.offsetHeight : 0;

            // Altura disponível para o canvas DENTRO de .visualization
            const availableHeight = containerHeight - statsHeight - collisionInfoHeight;

            const minWidth = 200;
            const minHeight = 150;
            this.canvas.width = Math.max(containerWidth, minWidth);
            this.canvas.height = Math.max(availableHeight, minHeight);

        } else {
             this.canvas.width = 400;
             this.canvas.height = 350;
             console.warn("'.visualization' container not found, using fallback canvas size.");
        }
        // Redesenha o layout após redimensionar
        this.drawLayout();
    }

    /** Inicializa os controles da UI e listeners. */
    initControls() {
        const layoutTypeSelect = document.getElementById('layout-type');
        const generateBtn = document.getElementById('generate-btn');
        const randomBtn = document.getElementById('random-btn');
        const showCollisionsCheckbox = document.getElementById('show-collisions');

        // Listeners para controles principais
        if (layoutTypeSelect) {
            layoutTypeSelect.addEventListener('change', () => {
                this.layoutType = layoutTypeSelect.value;
                this.params = JSON.parse(JSON.stringify(DEFAULT_PARAMS[this.layoutType]));
                this.updateDynamicControls();
                this.generateLayout(); // Gerar automaticamente ao mudar tipo
            });
        }
        if (generateBtn) {
            generateBtn.addEventListener('click', () => this.generateLayout());
        }
        if (randomBtn) {
            randomBtn.addEventListener('click', () => this.generateRandomLayout());
        }
        if (showCollisionsCheckbox) {
            showCollisionsCheckbox.addEventListener('change', () => {
                this.showCollisions = showCollisionsCheckbox.checked;
                this.drawLayout(); // Apenas redesenha, não recalcula layout
            });
        }

        // --- Listener para Botão de Download da Imagem ---
        this.downloadImageBtn = document.getElementById('download-image-btn');
        this.imageThemeRadios = document.querySelectorAll('input[name="imageTheme"]');
        this.imageAxesRadios = document.querySelectorAll('input[name="imageAxes"]');

        if (this.downloadImageBtn) {
            this.downloadImageBtn.addEventListener('click', () => this.downloadLayoutImage());
        } else {
            console.warn("Botão de download da imagem (download-image-btn) não encontrado.");
        }
        // --- Fim do Listener ---

        this.updateDynamicControls(); // Cria os controles de parâmetros dinâmicos iniciais
    }

    /** Atualiza os controles de parâmetros dinâmicos (sliders, inputs, etc.). */
    updateDynamicControls() {
        const dynamicParamsDiv = document.getElementById('dynamic-params');
        if (!dynamicParamsDiv) return;
        dynamicParamsDiv.innerHTML = ''; // Limpa controles antigos
        const controls = PARAM_CONTROLS[this.layoutType];
        if (!controls) return;

        controls.forEach(control => {
            let shouldShowControl = true;
            if (control.condition) {
                 shouldShowControl = this.evaluateCondition(control.condition);
            }
            if (shouldShowControl) {
                const formGroup = document.createElement('div'); formGroup.className = 'form-group';
                const label = document.createElement('label'); label.setAttribute('for', control.id);
                label.textContent = control.label + ':'; formGroup.appendChild(label);
                let inputElement;

                switch (control.type) {
                    case 'select':
                        inputElement = document.createElement('select'); inputElement.id = control.id; inputElement.name = control.id;
                        control.options.forEach(option => { const opt = document.createElement('option'); opt.value = option.value; opt.textContent = option.label; if (String(this.params[control.id]) === String(option.value)) opt.selected = true; inputElement.appendChild(opt); });
                        // Evento 'change' para gerar automaticamente
                        inputElement.addEventListener('change', () => { this.params[control.id] = inputElement.value; this.updateDynamicControls(); this.generateLayout(); });
                        formGroup.appendChild(inputElement);
                        break;
                    case 'checkbox':
                        inputElement = document.createElement('input'); inputElement.type = 'checkbox'; inputElement.id = control.id; inputElement.name = control.id; inputElement.checked = this.params[control.id] || false;
                        const chkContainer = document.createElement('div'); chkContainer.style.display = 'flex'; chkContainer.style.alignItems = 'center'; chkContainer.appendChild(inputElement);
                        // Evento 'change' para gerar automaticamente
                        inputElement.addEventListener('change', () => { this.params[control.id] = inputElement.checked; this.updateDynamicControls(); this.generateLayout(); });
                        formGroup.appendChild(chkContainer);
                        break;
                    case 'number':
                        const sliderGroup = document.createElement('div'); sliderGroup.className = 'slider-group';
                        const sliderInput = document.createElement('input'); sliderInput.type = 'range'; sliderInput.id = control.id + '-slider'; sliderInput.name = control.id + '-slider'; sliderInput.value = this.params[control.id]; if (control.min !== undefined) sliderInput.min = control.min; if (control.max !== undefined) sliderInput.max = control.max; if (control.step !== undefined) sliderInput.step = control.step; sliderGroup.appendChild(sliderInput);
                        const numberInput = document.createElement('input'); numberInput.type = 'number'; numberInput.id = control.id; numberInput.name = control.id; numberInput.value = this.params[control.id]; if (control.min !== undefined) numberInput.min = control.min; if (control.max !== undefined) numberInput.max = control.max; if (control.step !== undefined) numberInput.step = control.step; sliderGroup.appendChild(numberInput);

                        // --- Eventos para gerar automaticamente ---
                        // Gera enquanto arrasta o slider (com debounce seria melhor)
                        sliderInput.addEventListener('input', () => {
                            const v = parseFloat(sliderInput.value);
                            numberInput.value = v;
                            this.params[control.id] = v;
                            this.generateLayout(); // Gera a cada input no slider
                        });
                        // Gera quando o valor do número muda (e valida/sincroniza)
                        numberInput.addEventListener('input', () => {
                             let v = parseFloat(numberInput.value);
                             if (!isNaN(v)) {
                                 if (control.min !== undefined) v = Math.max(control.min, v);
                                 if (control.max !== undefined) v = Math.min(control.max, v);
                                 sliderInput.value = v;
                                 this.params[control.id] = v;
                                 this.generateLayout(); // Gera a cada input no número
                             }
                         });
                         // Garante sincronia e geração ao perder foco ou pressionar Enter
                         numberInput.addEventListener('change', () => {
                             let v = parseFloat(numberInput.value);
                             if (isNaN(v)) { v = parseFloat(sliderInput.value); numberInput.value = v; } // Reverte se inválido
                             if (control.min !== undefined) v = Math.max(control.min, v);
                             if (control.max !== undefined) v = Math.min(control.max, v);
                             numberInput.value = v;
                             sliderInput.value = v;
                             if(this.params[control.id] !== v) { // Gera apenas se valor realmente mudou
                                 this.params[control.id] = v;
                                 this.updateDynamicControls(); // Atualiza visibilidade de outros controles
                                 this.generateLayout();
                             }
                         });

                        formGroup.appendChild(sliderGroup);
                        break;
                    default: console.warn(`Tipo de controle não tratado: ${control.type}`); break;
                }
                dynamicParamsDiv.appendChild(formGroup);
            }
        });
    }

    /** Avalia condição para exibição de controle. */
    evaluateCondition(condition) {
        // (Implementation remains the same)
        const fullCondition = condition.replace(/(\b)([a-zA-Z_]\w*)(\b)/g, (match, p1, p2, p3) => { if (this.params.hasOwnProperty(p2)) { return `${p1}this.params.${p2}${p3}`; } if (['true', 'false', 'Math', 'null', 'undefined'].includes(p2) || !isNaN(p2)) { return match; } return `${p1}this.params.${p2}${p3}`; });
        try { const evaluator = new Function(`return (${fullCondition});`); return evaluator.call(this); } catch (e) { console.error(`Erro ao avaliar condição "${condition}" -> "${fullCondition}":`, e); return true; }
    }

    /** Cria layout interno de 1 tile (64 antenas). */
    createTileLayout64Antennas(centerX, centerY) {
        // (Implementation remains the same)
        const antennas = []; const subgroupCenters = [];
        for (let i = 0; i < SUBGROUP_N; i++) { const offsetX = (i - (SUBGROUP_N - 1) / 2.0) * SUBGROUP_DX; for (let j = 0; j < SUBGROUP_M; j++) { const offsetY = (j - (SUBGROUP_M - 1) / 2.0) * SUBGROUP_DY; subgroupCenters.push([centerX + offsetX, centerY + offsetY]); } }
        const offsets = [ [0, DIAMOND_OFFSET], [DIAMOND_OFFSET, 0], [0, -DIAMOND_OFFSET], [-DIAMOND_OFFSET, 0] ];
        for (const center of subgroupCenters) { for (const offset of offsets) { antennas.push([center[0] + offset[0], center[1] + offset[1]]); } }
        return antennas;
    }

    /** Gera o layout dos centros dos tiles e das antenas. */
    generateLayout() {
        const commonParams = { tileWidthM: TILE_WIDTH, tileHeightM: TILE_HEIGHT, centerLayout: true };
        const currentParamsSanitized = {};
        const controlsForType = PARAM_CONTROLS[this.layoutType] || [];

        // Sanitize parameters based on control definitions
        for (const key in this.params) {
            const controlDef = controlsForType.find(c => c.id === key);
            if (controlDef) {
                if (controlDef.type === 'number') {
                    const parsedValue = parseFloat(this.params[key]);
                    currentParamsSanitized[key] = isNaN(parsedValue) ? DEFAULT_PARAMS[this.layoutType][key] : parsedValue;
                } else if (controlDef.type === 'checkbox') {
                    currentParamsSanitized[key] = Boolean(this.params[key]);
                } else {
                    currentParamsSanitized[key] = this.params[key]; // Assumes string/select
                }
            }
        }

        const fullParams = { ...currentParamsSanitized, ...commonParams };

        // Special handling for 'ring' layout's tilesPerRing array
        if (this.layoutType === 'ring' && typeof fullParams.numRings === 'number' && fullParams.numRings > 0) {
             let tilesPerRingArray = this.params.tilesPerRing; // Get current value from params
             if (!Array.isArray(tilesPerRingArray) || tilesPerRingArray.length !== fullParams.numRings) {
                 // If not an array or wrong length, generate default based on numRings
                 tilesPerRingArray = Array.from({ length: fullParams.numRings }, (_, i) => 8 * (i + 1));
                 console.log(`Gerador: 'tilesPerRing' recriado para ${fullParams.numRings} anéis:`, tilesPerRingArray);
                 this.params.tilesPerRing = [...tilesPerRingArray]; // Update internal params state
             }
             // Ensure values are valid numbers (at least 1)
             fullParams.tilesPerRing = tilesPerRingArray.map(n => Math.max(1, parseInt(n) || 8));
        }


        try {
            if (!window.BingoLayouts) throw new Error("Biblioteca BingoLayouts não carregada.");

            console.log(`Gerando layout tipo: ${this.layoutType} com params:`, fullParams); // Log parameters being used

            // Call the appropriate layout function from BingoLayouts
            switch (this.layoutType) { // Chamadas já atualizadas para remover modos
                case 'grid': this.currentLayout = window.BingoLayouts.createGridLayout(fullParams.numCols, fullParams.numRows, fullParams.tileWidthM, fullParams.tileHeightM, fullParams.spacingXFactor, fullParams.spacingYFactor, fullParams.centerExpScaleFactor, fullParams.randomOffsetStddevM, fullParams.minSeparationFactor, undefined, fullParams.centerLayout); break;
                case 'spiral': this.currentLayout = window.BingoLayouts.createSpiralLayout(fullParams.numArms, fullParams.tilesPerArm, fullParams.tileWidthM, fullParams.tileHeightM, fullParams.radiusStartFactor, fullParams.radiusStepFactor, fullParams.centerExpScaleFactor, fullParams.angleStepRad, fullParams.armOffsetRad, fullParams.rotationPerArmRad, fullParams.randomOffsetStddevM, fullParams.minSeparationFactor, undefined, fullParams.centerLayout, fullParams.includeCenterTile); break;
                case 'ring': this.currentLayout = window.BingoLayouts.createRingLayout(fullParams.numRings, fullParams.tilesPerRing, fullParams.tileWidthM, fullParams.tileHeightM, fullParams.radiusStartFactor, fullParams.radiusStepFactor, fullParams.centerExpScaleFactor, fullParams.angleOffsetRad, fullParams.randomOffsetStddevM, fullParams.minSeparationFactor, undefined, fullParams.centerLayout, fullParams.addCenterTile); break;
                case 'rhombus': this.currentLayout = window.BingoLayouts.createRhombusLayout(fullParams.numRowsHalf, fullParams.tileWidthM, fullParams.tileHeightM, fullParams.sideLengthFactor, fullParams.hCompressFactor, fullParams.vCompressFactor, fullParams.centerExpScaleFactor, fullParams.randomOffsetStddevM, fullParams.minSeparationFactor, undefined, fullParams.centerLayout); break;
                case 'hex_grid': this.currentLayout = window.BingoLayouts.createHexGridLayout(fullParams.numRingsHex, fullParams.tileWidthM, fullParams.tileHeightM, fullParams.spacingFactor, fullParams.centerExpScaleFactor, fullParams.addCenterTile, fullParams.randomOffsetStddevM, fullParams.minSeparationFactor, undefined, fullParams.centerLayout); break;
                case 'phyllotaxis': this.currentLayout = window.BingoLayouts.createPhyllotaxisLayout(fullParams.numTiles, fullParams.tileWidthM, fullParams.tileHeightM, fullParams.scaleFactor, fullParams.centerOffsetFactor, fullParams.centerExpScaleFactor, fullParams.randomOffsetStddevM, fullParams.minSeparationFactor, undefined, fullParams.centerLayout); break;
                case 'manual_circular': this.currentLayout = window.BingoLayouts.createManualCircularLayout(fullParams.tileWidthM, fullParams.tileHeightM, fullParams.spacingXFactor, fullParams.spacingYFactor, fullParams.centerExpScaleFactor, fullParams.randomOffsetStddevM, fullParams.minSeparationFactor, undefined, fullParams.centerLayout); break;
                case 'random': this.currentLayout = window.BingoLayouts.createRandomLayout(fullParams.numTiles, fullParams.maxRadiusM, fullParams.tileWidthM, fullParams.tileHeightM, fullParams.minSeparationFactor, undefined, fullParams.centerLayout); break;
                default: console.warn(`Tipo de layout não reconhecido: ${this.layoutType}`); this.currentLayout = [];
            }

            // Generate all individual antennas based on the new tile centers
            this.generateAllAntennas();
            // Check for collisions between tiles
            this.checkCollisions();
            // Redraw the layout on the canvas
            this.drawLayout();
            // Update statistics display
            this.updateStats();

            // Update the export fields with the new layout data
            if (typeof window.updateExportFields === 'function') {
                let s = [];
                if (window.interactiveMap?.getSelectedCoordinates) {
                     s = window.interactiveMap.getSelectedCoordinates();
                }
                window.updateExportFields(this.currentLayout, s);
            }

            // <<<--- MODIFICADO: Dispara evento APÓS todas as atualizações --- >>>
            console.log("Dispatching 'layoutGenerated' event from generator.js");
            window.dispatchEvent(new CustomEvent('layoutGenerated'));
            // <<<--- Fim da modificação --- >>>

        } catch (error) {
            console.error(`Erro ao gerar layout '${this.layoutType}':`, error);
            alert(`Erro ao gerar layout '${this.layoutType}'.\n${error.message}`);
            // Reset state on error
            this.currentLayout = [];
            this.allAntennas = [];
            this.collisions = [];
            this.drawLayout();
            this.updateStats();
            if (typeof window.updateExportFields === 'function') {
                 let s = [];
                 if (window.interactiveMap?.getSelectedCoordinates) {
                      s = window.interactiveMap.getSelectedCoordinates();
                 }
                 window.updateExportFields([], s); // Pass empty layout on error
            }
             // Optional: Dispatch event on error to potentially clear beam plot?
             // window.dispatchEvent(new CustomEvent('layoutGenerated'));
        }
    }


    /** Capitaliza a primeira letra. */
    capitalizeFirstLetter(string) {
        // (Implementation remains the same)
        if (!string) return ''; return string.charAt(0).toUpperCase() + string.slice(1);
    }

    /** Gera coordenadas de todas as antenas. */
    generateAllAntennas() {
        // (Implementation remains the same)
        this.allAntennas = []; if (!this.currentLayout || this.currentLayout.length === 0) return; for (const center of this.currentLayout) { const tileAntennas = this.createTileLayout64Antennas(center[0], center[1]); this.allAntennas.push(...tileAntennas); }
    }

    /** Verifica colisões retangulares entre tiles. */
    checkCollisions() {
        // (Implementation remains the same)
        this.collisions = []; if (!this.currentLayout || this.currentLayout.length < 2) return; const minCenterXDist = TILE_WIDTH; const minCenterYDist = TILE_HEIGHT; const epsilon = 1e-6; for (let i = 0; i < this.currentLayout.length; i++) { for (let j = i + 1; j < this.currentLayout.length; j++) { const tile1 = this.currentLayout[i]; const tile2 = this.currentLayout[j]; if (!Array.isArray(tile1) || tile1.length < 2 || !Array.isArray(tile2) || tile2.length < 2) continue; const deltaX = Math.abs(tile1[0] - tile2[0]); const deltaY = Math.abs(tile1[1] - tile2[1]); if (deltaX < (minCenterXDist - epsilon) && deltaY < (minCenterYDist - epsilon)) { const distance = Math.sqrt(Math.pow(tile1[0] - tile2[0], 2) + Math.pow(tile1[1] - tile2[1], 2)); this.collisions.push({ tile1Index: i, tile2Index: j, distance: distance }); } } }
    }

    /** Gera layout com parâmetros aleatórios. */
    generateRandomLayout() {
        // (Implementation remains the same, but now triggers generateLayout at the end)
        const controls = PARAM_CONTROLS[this.layoutType]; if (!controls) return; controls.forEach(control => { switch(control.type) { case 'number': if (control.min !== undefined && control.max !== undefined) { let rVal = Math.random() * (control.max - control.min) + control.min; if (control.step) { rVal = Math.round(rVal / control.step) * control.step; const dp = (String(control.step).split('.')[1] || '').length; rVal = parseFloat(rVal.toFixed(dp)); } rVal = Math.max(control.min, Math.min(control.max, rVal)); this.params[control.id] = rVal; } break; case 'select': if (control.options?.length > 0) { const rIdx = Math.floor(Math.random() * control.options.length); this.params[control.id] = control.options[rIdx].value; } break; case 'checkbox': this.params[control.id] = Math.random() > 0.5; break; } }); this.updateDynamicControls(); this.generateLayout(); // Generate layout with new random params
    }

    /**
     * Desenha o layout atual no canvas.
     * @param {boolean} [drawAxes=true] - Se true (padrão), desenha a escala e eixos.
     */
    drawLayout(drawAxes = true) {
        // (Implementation remains the same)
        const ctx = this.ctx;
        const canvas = this.canvas;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--card-bg-color').trim() || 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        if (!this.currentLayout || this.currentLayout.length === 0 || this.allAntennas.length === 0) {
            ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--text-color').trim() || '#333';
            ctx.font = '16px Segoe UI, Tahoma, Geneva, Verdana, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText("Gere um layout ou ajuste os parâmetros.", canvas.width / 2, canvas.height / 2);
            return;
        }

        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (const antenna of this.allAntennas) { if (Array.isArray(antenna) && antenna.length >= 2 && !isNaN(antenna[0]) && !isNaN(antenna[1])) { minX = Math.min(minX, antenna[0]); maxX = Math.max(maxX, antenna[0]); minY = Math.min(minY, antenna[1]); maxY = Math.max(maxY, antenna[1]); } }
        if (minX === Infinity && this.currentLayout.length > 0) { minX = Infinity; maxX = -Infinity; minY = Infinity; maxY = -Infinity; for (const center of this.currentLayout) { if (Array.isArray(center) && center.length >= 2 && !isNaN(center[0]) && !isNaN(center[1])) { minX = Math.min(minX, center[0]); maxX = Math.max(maxX, center[0]); minY = Math.min(minY, center[1]); maxY = Math.max(maxY, center[1]); } } if (minX !== Infinity) { minX -= TILE_WIDTH / 2; maxX += TILE_WIDTH / 2; minY -= TILE_HEIGHT / 2; maxY += TILE_HEIGHT / 2; } }
        if (minX === Infinity) { console.warn("Não foi possível determinar os limites."); return; }
        const margin = 50; const contentWidth = (maxX - minX); const contentHeight = (maxY - minY);
        const effectiveWidth = Math.max(contentWidth, 0.1); const effectiveHeight = Math.max(contentHeight, 0.1);
        const availableWidth = canvas.width - 2 * margin; const availableHeight = canvas.height - 2 * margin;
        if (availableWidth <= 0 || availableHeight <= 0) { console.warn("Área do canvas pequena."); return; }
        const scale = Math.min(availableWidth / effectiveWidth, availableHeight / effectiveHeight);
        const offsetX = margin + (availableWidth - effectiveWidth * scale) / 2; const offsetY = margin + (availableHeight - effectiveHeight * scale) / 2;
        const transformCoord = (coordX, coordY) => { const relativeX = coordX - minX; const relativeY = coordY - minY; const canvasX = relativeX * scale + offsetX; const canvasY = (effectiveHeight - relativeY) * scale + offsetY; return { x: canvasX, y: canvasY }; };

        if (drawAxes) { this.drawScale(ctx, canvas, scale, minX, minY, maxX, maxY, transformCoord, margin); }

        const currentBodyStyle = getComputedStyle(document.documentElement);
        const centerColor = currentBodyStyle.getPropertyValue('--secondary-color').trim() || 'red';
        const antennaColor = currentBodyStyle.getPropertyValue('--primary-color').trim() || '#3498db';
        const collisionColor = centerColor;

        ctx.fillStyle = centerColor;
        for (const center of this.currentLayout) { if (Array.isArray(center) && center.length >= 2) { const { x, y } = transformCoord(center[0], center[1]); ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill(); } }

        ctx.fillStyle = antennaColor;
        for (const antenna of this.allAntennas) { if (Array.isArray(antenna) && antenna.length >= 2) { const { x, y } = transformCoord(antenna[0], antenna[1]); ctx.beginPath(); ctx.arc(x, y, 1.5, 0, Math.PI * 2); ctx.fill(); } }

        if (this.showCollisions && this.collisions.length > 0) {
            ctx.strokeStyle = collisionColor; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.6;
            for (const collision of this.collisions) { const tile1 = this.currentLayout[collision.tile1Index]; const tile2 = this.currentLayout[collision.tile2Index]; if (!Array.isArray(tile1) || tile1.length < 2 || !Array.isArray(tile2) || tile2.length < 2) continue; const { x: x1, y: y1 } = transformCoord(tile1[0], tile1[1]); const { x: x2, y: y2 } = transformCoord(tile2[0], tile2[1]); ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x1, y1, 5, 0, Math.PI * 2); ctx.stroke(); ctx.beginPath(); ctx.arc(x2, y2, 5, 0, Math.PI * 2); ctx.stroke(); }
            ctx.globalAlpha = 1.0; ctx.lineWidth = 1;
        }
    }

     /** Desenha a escala e eixos no canvas. */
     drawScale(ctx, canvas, scale, minX, minY, maxX, maxY, transformCoord, margin) {
         // (Implementation remains the same)
         const layoutWidth = maxX - minX; const layoutHeight = maxY - minY;
         const maxDimension = Math.max(layoutWidth, layoutHeight); let scaleInterval = 1;
         if (maxDimension > 1e-6) { const targetTicks = 6; const roughInterval = maxDimension / targetTicks; const orderOfMagnitude = Math.pow(10, Math.floor(Math.log10(roughInterval))); if (roughInterval / orderOfMagnitude < 1.5) scaleInterval = 1 * orderOfMagnitude; else if (roughInterval / orderOfMagnitude < 3.5) scaleInterval = 2 * orderOfMagnitude; else if (roughInterval / orderOfMagnitude < 7.5) scaleInterval = 5 * orderOfMagnitude; else scaleInterval = 10 * orderOfMagnitude; scaleInterval = Math.max(scaleInterval, 0.1); }
         const scalePrecision = scaleInterval < 0.5 ? 2 : (scaleInterval < 1 ? 1 : 0);
         const epsilon = scaleInterval * 1e-6;
         const xStart = Math.ceil((minX - epsilon) / scaleInterval) * scaleInterval; const xEnd = Math.floor((maxX + epsilon) / scaleInterval) * scaleInterval; const yStart = Math.ceil((minY - epsilon) / scaleInterval) * scaleInterval; const yEnd = Math.floor((maxY + epsilon) / scaleInterval) * scaleInterval;
         const scaleColor = getComputedStyle(document.documentElement).getPropertyValue('--text-color').trim() || '#888';
         const axisColor = getComputedStyle(document.documentElement).getPropertyValue('--border-color').trim() || '#aaa';
         ctx.strokeStyle = scaleColor; ctx.fillStyle = scaleColor; ctx.lineWidth = 0.5; ctx.font = '10px Segoe UI, Tahoma, Geneva, Verdana, sans-serif';
         const tickSize = 5; const textMargin = 8; const axisTextMargin = 15;
         ctx.textAlign = 'center'; ctx.textBaseline = 'top'; const xAxisYPos = canvas.height - margin + textMargin;
         for (let x = xStart; x <= xEnd; x += scaleInterval) { const { x: canvasX } = transformCoord(x, minY); const isZero = Math.abs(x) < epsilon; if (isZero && minX <= epsilon && maxX >= -epsilon) continue; ctx.beginPath(); ctx.moveTo(canvasX, xAxisYPos); ctx.lineTo(canvasX, xAxisYPos - tickSize); ctx.stroke(); ctx.fillText(`${x.toFixed(scalePrecision)}`, canvasX, xAxisYPos + 2); }
         ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; const yAxisXPos = margin - textMargin;
         for (let y = yStart; y <= yEnd; y += scaleInterval) { const { y: canvasY } = transformCoord(minX, y); const isZero = Math.abs(y) < epsilon; if (isZero && minY <= epsilon && maxY >= -epsilon) continue; ctx.beginPath(); ctx.moveTo(yAxisXPos, canvasY); ctx.lineTo(yAxisXPos + tickSize, canvasY); ctx.stroke(); ctx.fillText(`${y.toFixed(scalePrecision)}`, yAxisXPos - 2, canvasY); }
         ctx.strokeStyle = axisColor; ctx.lineWidth = 1; const axisEpsilon = 1e-9;
         if (minX <= axisEpsilon && maxX >= -axisEpsilon) { const { x: zeroX } = transformCoord(0, minY); const { y: topY } = transformCoord(0, maxY); const { y: bottomY } = transformCoord(0, minY); ctx.beginPath(); ctx.moveTo(zeroX, topY); ctx.lineTo(zeroX, bottomY); ctx.stroke(); if (!(yStart <= axisEpsilon && yEnd >= -axisEpsilon)) { ctx.fillStyle = scaleColor; ctx.font = '10px Segoe UI'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillText('0', yAxisXPos - 2, transformCoord(0, 0).y); } }
         if (minY <= axisEpsilon && maxY >= -axisEpsilon) { const { y: zeroY } = transformCoord(minX, 0); const { x: leftX } = transformCoord(minX, 0); const { x: rightX } = transformCoord(maxX, 0); ctx.beginPath(); ctx.moveTo(leftX, zeroY); ctx.lineTo(rightX, zeroY); ctx.stroke(); if (!(xStart <= axisEpsilon && xEnd >= -axisEpsilon)) { ctx.fillStyle = scaleColor; ctx.font = '10px Segoe UI'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText('0', transformCoord(0, 0).x, xAxisYPos + 2); } }
         ctx.fillStyle = scaleColor; ctx.font = '12px Segoe UI, Tahoma, Geneva, Verdana, sans-serif';
         ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillText('X (metros)', canvas.width / 2, canvas.height - axisTextMargin / 3);
         ctx.save(); ctx.translate(axisTextMargin, canvas.height / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillText('Y (metros)', 0, 0); ctx.restore();
     }

    /** Atualiza contagem de tiles/antenas e info de colisões. */
    updateStats() {
        // (Implementation remains the same)
        const tileCountSpan = document.getElementById('tile-count'); const antennaCountSpan = document.getElementById('antenna-count'); const tileCount = this.currentLayout ? this.currentLayout.length : 0; const antennaCount = this.allAntennas ? this.allAntennas.length : 0; if (tileCountSpan) tileCountSpan.textContent = tileCount; if (antennaCountSpan) antennaCountSpan.textContent = antennaCount; this.updateCollisionInfo();
    }

    /** Atualiza/Cria a seção de informações de colisão. */
    updateCollisionInfo() {
        // (Implementation remains the same)
        const visualizationDiv = document.querySelector('.visualization'); if (!visualizationDiv) { return; } let collisionInfoDiv = document.getElementById('collision-info'); if (!collisionInfoDiv) { collisionInfoDiv = document.createElement('div'); collisionInfoDiv.id = 'collision-info'; collisionInfoDiv.className = 'collision-info'; const header = document.createElement('div'); header.className = 'collision-header'; header.innerHTML = `<span>Colisões Detectadas: <span id="collision-count">0</span></span><span class="toggle-arrow">▼</span>`; const content = document.createElement('div'); content.id = 'collision-content'; content.className = 'collision-content'; content.style.display = 'none'; header.addEventListener('click', () => { const isHidden = content.style.display === 'none'; content.style.display = isHidden ? 'block' : 'none'; const arrow = header.querySelector('.toggle-arrow'); if (arrow) arrow.textContent = isHidden ? '▲' : '▼'; this.resizeCanvas(); }); collisionInfoDiv.appendChild(header); collisionInfoDiv.appendChild(content); const statsDiv = visualizationDiv.querySelector('.stats'); if (statsDiv) statsDiv.parentNode.insertBefore(collisionInfoDiv, statsDiv.nextSibling); else visualizationDiv.appendChild(collisionInfoDiv); } const collisionCountSpan = document.getElementById('collision-count'); const collisionContentDiv = document.getElementById('collision-content'); if (!collisionCountSpan || !collisionContentDiv) return; const numCollisions = this.collisions ? this.collisions.length : 0; collisionCountSpan.textContent = numCollisions; collisionContentDiv.innerHTML = ''; if (numCollisions > 0) { const list = document.createElement('ul'); const maxCollisionsToShow = 50; for (let i = 0; i < Math.min(numCollisions, maxCollisionsToShow); i++) { const collision = this.collisions[i]; const item = document.createElement('li'); item.textContent = `Tile ${collision.tile1Index + 1} e Tile ${collision.tile2Index + 1} (Dist. Centros: ${collision.distance.toFixed(3)}m)`; list.appendChild(item); } if (numCollisions > maxCollisionsToShow) { const item = document.createElement('li'); item.style.fontStyle = 'italic'; item.textContent = `... e mais ${numCollisions - maxCollisionsToShow} colisões.`; list.appendChild(item); } collisionContentDiv.appendChild(list); } else { collisionContentDiv.textContent = 'Nenhuma colisão detectada.'; }
    }

    // --- Métodos Getters ---
    getLayout() { return this.currentLayout; }
    getAllAntennas() { return this.allAntennas; }

    // --- MÉTODO Download da Imagem do Layout ---
    /**
     * Gera e inicia o download da imagem atual do canvas do layout.
     */
    downloadLayoutImage() {
        // (Implementation remains the same)
        console.log("Iniciando download da imagem do layout...");
        if (!this.imageThemeRadios || !this.imageAxesRadios) { console.error("Controles de download não encontrados."); alert("Erro: Controles de download não encontrados."); return; }

        let selectedTheme = 'light'; try { selectedTheme = document.querySelector('input[name="imageTheme"]:checked').value; } catch (e) { console.warn("Não foi possível ler tema selecionado."); }
        let includeAxes = true; try { includeAxes = document.querySelector('input[name="imageAxes"]:checked').value === 'yes'; } catch (e) { console.warn("Não foi possível ler opção de eixos."); }

        const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
        const needsThemeChange = currentTheme !== selectedTheme;
        const downloadButton = this.downloadImageBtn;

        if(downloadButton) { downloadButton.disabled = true; downloadButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Gerando...'; }

        const restoreState = () => {
            if (needsThemeChange) {
                console.log(`Restaurando tema para ${currentTheme}.`);
                if (currentTheme === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
                else document.documentElement.removeAttribute('data-theme');
                this.drawLayout(); // Redesenha canvas visível
            }
             if(downloadButton) { downloadButton.disabled = false; downloadButton.innerHTML = '<i class="fas fa-camera"></i> Baixar Imagem (PNG)'; }
        };

        const generateAndDownload = () => {
            try {
                this.drawLayout(includeAxes); // Redesenha com opções corretas
                setTimeout(() => {
                    try {
                        const dataURL = this.canvas.toDataURL('image/png');
                        const link = document.createElement('a');
                        link.href = dataURL;
                        link.download = `bingo_layout_${this.layoutType}_${selectedTheme}${includeAxes ? '_com_eixos' : '_sem_eixos'}.png`;
                        document.body.appendChild(link); link.click(); document.body.removeChild(link);
                        console.log("Download da imagem iniciado.");
                    } catch (downloadError) { console.error("Erro ao gerar/baixar imagem:", downloadError); alert("Erro ao gerar imagem. Verifique console.");
                    } finally { restoreState(); }
                }, 50);
            } catch(drawError) { console.error("Erro durante redesenho para download:", drawError); alert("Erro ao redesenhar imagem."); restoreState(); }
        };

        if (needsThemeChange) {
            console.log(`Mudando tema temporariamente para ${selectedTheme}.`);
            if (selectedTheme === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
            else document.documentElement.removeAttribute('data-theme');
            setTimeout(generateAndDownload, 100); // Delay para CSS aplicar
        } else {
            generateAndDownload(); // Gera imediatamente
        }
    }

} // === FIM DA CLASSE AntennaLayoutGenerator ===

// === Instanciação Global ===
if (typeof window !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
       try {
           if (!window.antennaGenerator) {
               window.antennaGenerator = new AntennaLayoutGenerator();
               console.log("Instância de AntennaLayoutGenerator criada.");
           }
       } catch (error) {
           console.error("Erro ao instanciar AntennaLayoutGenerator:", error);
           alert("Erro crítico ao inicializar o gerador de layout.");
       }
   });
} else { console.warn("Ambiente não-navegador."); }