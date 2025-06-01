/**
 * generator.js
 *
 * Módulo para geração e visualização de layouts de centros de tiles e suas antenas.
 * Utiliza a biblioteca `BingoLayouts` (bingo_layouts.js) para os algoritmos
 * de geração e desenha o resultado em um canvas HTML.
 * Permite ajustar parâmetros dinamicamente via interface, visualizar colisões
 * entre tiles e baixar a imagem do layout gerado.
 * Redesenha automaticamente ao mudar o tipo de layout, parâmetros ou tema da página.
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

const PROFILE_PARAM_SCHEMAS = {
    gaussian: [
        { key: 'mean', label: 'Média (0-1)', type: 'number', min: 0, max: 1, step: 0.01, defaultValue: 0.1 },
        { key: 'stddev', label: 'Desvio Padrão (>0)', type: 'number', min: 0.01, max: 2, step: 0.01, defaultValue: 0.2 },
        { key: 'strength', label: 'Força', type: 'number', min: 0.1, max: 5, step: 0.1, defaultValue: 1.0 }
    ],
    exponential: [
        { key: 'lambda', label: 'Lambda (>0)', type: 'number', min: 0.01, max: 10, step: 0.01, defaultValue: 4.0 },
        { key: 'strength', label: 'Força', type: 'number', min: 0.1, max: 5, step: 0.1, defaultValue: 1.0 }
    ],
    linear_falloff: [
        { key: 'slope', label: 'Inclinação (>0)', type: 'number', min: 0.1, max: 10, step: 0.1, defaultValue: 1.0 },
        { key: 'strength', label: 'Força', type: 'number', min: 0.1, max: 5, step: 0.1, defaultValue: 1.0 }
    ],
    logNormal: [
        { key: 'mean', label: 'Média (escala log)', type: 'number', min: -5, max: 2, step: 0.1, defaultValue: Math.log(0.25) },
        { key: 'stddev', label: 'Desvio Padrão (escala log, >0)', type: 'number', min: 0.01, max: 3, step: 0.01, defaultValue: 0.5 },
        { key: 'strength', label: 'Força', type: 'number', min: 0.1, max: 10, step: 0.1, defaultValue: 2.0 }
    ],
    cauchy: [
        { key: 'location', label: 'Localização (0-1)', type: 'number', min: 0, max: 1, step: 0.01, defaultValue: 0.1 },
        { key: 'scale', label: 'Escala (>0)', type: 'number', min: 0.01, max: 2, step: 0.01, defaultValue: 0.05 },
        { key: 'strength', label: 'Força', type: 'number', min: 0.1, max: 5, step: 0.1, defaultValue: 1.0 }
    ],
    weibull: [
        { key: 'shape', label: 'Forma (k >0)', type: 'number', min: 0.1, max: 10, step: 0.1, defaultValue: 2.0 },
        { key: 'scale', label: 'Escala (lambda >0)', type: 'number', min: 0.01, max: 5, step: 0.01, defaultValue: 0.45 },
        { key: 'strength', label: 'Força', type: 'number', min: 0.1, max: 5, step: 0.1, defaultValue: 1.0 }
    ]
};

function getProfileDefaults(profileName) {
    const schema = PROFILE_PARAM_SCHEMAS[profileName];
    if (!schema) {
        console.error(`Schema not found for profile: ${profileName}`);
        return {};
    }
    const defaults = {};
    schema.forEach(param => {
        defaults[param.key] = param.defaultValue;
    });
    return defaults;
}

const DEFAULT_PARAMS = {
    grid: { numCols: 12, numRows: 3, spacingXFactor: 1.0, spacingYFactor: 1.0, centerExpScaleFactor: 1.0, randomOffsetStddevM: 0.0, minSeparationFactor: 1.0 },
    spiral: { numArms: 3, tilesPerArm: 12, radiusStartFactor: 0.7, radiusStepFactor: 0.3, centerExpScaleFactor: 1.0, angleStepRad: Math.PI / 9, armOffsetRad: 0.0, rotationPerArmRad: 0.0, randomOffsetStddevM: 0.0, minSeparationFactor: 1.0, includeCenterTile: false },
    ring: { numRings: 3, tilesPerRing: [8, 16, 24], radiusStartFactor: 1.0, radiusStepFactor: 1.0, centerExpScaleFactor: 1.0, angleOffsetRad: 0.0, randomOffsetStddevM: 0.0, minSeparationFactor: 1.0, addCenterTile: false },
    rhombus: { numRowsHalf: 6, sideLengthFactor: 0.65, hCompressFactor: 0.778, vCompressFactor: 0.86, centerExpScaleFactor: 1.0, randomOffsetStddevM: 0.0, minSeparationFactor: 1.0 },
    hex_grid: { numRingsHex: 3, spacingFactor: 0.8, centerExpScaleFactor: 1.0, addCenterTile: true, randomOffsetStddevM: 0.0, minSeparationFactor: 1.0 },
    phyllotaxis: { numTiles: 50, scaleFactor: 0.6, centerOffsetFactor: 0.25, centerExpScaleFactor: 1.0, randomOffsetStddevM: 0.0, minSeparationFactor: 1.0 },
    manual_circular: { spacingXFactor: 1.0, spacingYFactor: 1.0, centerExpScaleFactor: 1.0, randomOffsetStddevM: 0.0, minSeparationFactor: 1.0 },
    random: { numTiles: 36, maxRadiusM: 4.0, minSeparationFactor: 1.0 },
    advanced_density: {
        numTiles: 70,
        maxRadiusM: 6.0,
        densityProfile: 'gaussian',
        profileParams: getProfileDefaults('gaussian'),
        densityInfluenceFactor: 0.75,
        minSeparationFactor: 1.05
    }
};

const PARAM_CONTROLS = {
    grid: [ { id: 'numCols', label: 'Número de Colunas', type: 'number', min: 1, max: 20, step: 1 }, { id: 'numRows', label: 'Número de Linhas', type: 'number', min: 1, max: 20, step: 1 }, { id: 'spacingXFactor', label: 'Fator Espaç. X', type: 'number', min: 0.1, max: 5, step: 0.1 }, { id: 'spacingYFactor', label: 'Fator Espaç. Y', type: 'number', min: 0.1, max: 5, step: 0.1 }, { id: 'centerExpScaleFactor', label: 'Fator Exp. Central', type: 'number', min: 0.5, max: 3, step: 0.05 }, { id: 'randomOffsetStddevM', label: 'Offset Aleatório (m)', type: 'number', min: 0, max: 1, step: 0.01 }, { id: 'minSeparationFactor', label: 'Fator Sep. Mín.', type: 'number', min: 0.5, max: 2, step: 0.05, condition: 'this.params.randomOffsetStddevM > 0' } ],
    spiral: [ { id: 'numArms', label: 'Número de Braços', type: 'number', min: 1, max: 12, step: 1 }, { id: 'tilesPerArm', label: 'Tiles por Braço', type: 'number', min: 1, max: 30, step: 1 }, { id: 'radiusStartFactor', label: 'Fator Raio Inicial', type: 'number', min: 0.1, max: 5, step: 0.1 }, { id: 'radiusStepFactor', label: 'Fator Passo Raio Lin.', type: 'number', min: 0.1, max: 2, step: 0.05 }, { id: 'centerExpScaleFactor', label: 'Fator Exp. Central', type: 'number', min: 0.5, max: 3, step: 0.05 }, { id: 'angleStepRad', label: 'Passo Angular (rad)', type: 'number', min: 0.01, max: Math.PI.toFixed(3), step: 0.01 }, { id: 'includeCenterTile', label: 'Incluir Tile Central', type: 'checkbox' }, { id: 'randomOffsetStddevM', label: 'Offset Aleatório (m)', type: 'number', min: 0, max: 1, step: 0.01 }, { id: 'minSeparationFactor', label: 'Fator Sep. Mín.', type: 'number', min: 0.5, max: 2, step: 0.05, condition: 'this.params.randomOffsetStddevM > 0' } ],
    ring: [ { id: 'numRings', label: 'Número de Anéis', type: 'number', min: 1, max: 10, step: 1 }, { id: 'radiusStartFactor', label: 'Fator Raio Inicial', type: 'number', min: 0.1, max: 5, step: 0.1 }, { id: 'radiusStepFactor', label: 'Fator Passo Raio Lin.', type: 'number', min: 0.1, max: 2, step: 0.05 }, { id: 'centerExpScaleFactor', label: 'Fator Exp. Central', type: 'number', min: 0.5, max: 3, step: 0.05 }, { id: 'addCenterTile', label: 'Adicionar Tile Central', type: 'checkbox' }, { id: 'randomOffsetStddevM', label: 'Offset Aleatório (m)', type: 'number', min: 0, max: 1, step: 0.01 }, { id: 'minSeparationFactor', label: 'Fator Sep. Mín.', type: 'number', min: 0.5, max: 2, step: 0.05, condition: 'this.params.randomOffsetStddevM > 0' } ],
    rhombus: [ { id: 'numRowsHalf', label: 'Metade Linhas', type: 'number', min: 1, max: 15, step: 1 }, { id: 'sideLengthFactor', label: 'Fator Lado Célula', type: 'number', min: 0.1, max: 5, step: 0.05 }, { id: 'hCompressFactor', label: 'Compressão Horiz.', type: 'number', min: 0.1, max: 5, step: 0.1 }, { id: 'vCompressFactor', label: 'Compressão Vert.', type: 'number', min: 0.1, max: 5, step: 0.1 }, { id: 'centerExpScaleFactor', label: 'Fator Exp. Central', type: 'number', min: 0.5, max: 3, step: 0.05 }, { id: 'randomOffsetStddevM', label: 'Offset Aleatório (m)', type: 'number', min: 0, max: 1, step: 0.01 }, { id: 'minSeparationFactor', label: 'Fator Sep. Mín.', type: 'number', min: 0.5, max: 2, step: 0.05, condition: 'this.params.randomOffsetStddevM > 0' } ],
    hex_grid: [ { id: 'numRingsHex', label: 'Nº Anéis Hex.', type: 'number', min: 0, max: 10, step: 1 }, { id: 'spacingFactor', label: 'Fator Espaçamento', type: 'number', min: 0.1, max: 5, step: 0.1 }, { id: 'centerExpScaleFactor', label: 'Fator Exp. Central', type: 'number', min: 0.5, max: 3, step: 0.05 }, { id: 'addCenterTile', label: 'Adicionar Tile Central', type: 'checkbox' }, { id: 'randomOffsetStddevM', label: 'Offset Aleatório (m)', type: 'number', min: 0, max: 1, step: 0.01 }, { id: 'minSeparationFactor', label: 'Fator Sep. Mín.', type: 'number', min: 0.5, max: 2, step: 0.05, condition: 'this.params.randomOffsetStddevM > 0' } ],
    phyllotaxis: [ { id: 'numTiles', label: 'Número de Tiles', type: 'number', min: 1, max: 200, step: 1 }, { id: 'scaleFactor', label: 'Fator de Escala', type: 'number', min: 0.1, max: 5, step: 0.1 }, { id: 'centerOffsetFactor', label: 'Fator Offset Central', type: 'number', min: 0.01, max: 1, step: 0.01 }, { id: 'centerExpScaleFactor', label: 'Fator Exp. Central', type: 'number', min: 0.5, max: 3, step: 0.05 }, { id: 'randomOffsetStddevM', label: 'Offset Aleatório (m)', type: 'number', min: 0, max: 1, step: 0.01 }, { id: 'minSeparationFactor', label: 'Fator Sep. Mín.', type: 'number', min: 0.5, max: 2, step: 0.05, condition: 'this.params.randomOffsetStddevM > 0' } ],
    manual_circular: [ { id: 'spacingXFactor', label: 'Fator Espaç. X', type: 'number', min: 0.1, max: 5, step: 0.1 }, { id: 'spacingYFactor', label: 'Fator Espaç. Y', type: 'number', min: 0.1, max: 5, step: 0.1 }, { id: 'centerExpScaleFactor', label: 'Fator Exp. Central', type: 'number', min: 0.5, max: 3, step: 0.05 }, { id: 'randomOffsetStddevM', label: 'Offset Aleatório (m)', type: 'number', min: 0, max: 1, step: 0.01 }, { id: 'minSeparationFactor', label: 'Fator Sep. Mín.', type: 'number', min: 0.5, max: 2, step: 0.05, condition: 'this.params.randomOffsetStddevM > 0' } ],
    random: [ { id: 'numTiles', label: 'Número de Tiles', type: 'number', min: 1, max: 200, step: 1 }, { id: 'maxRadiusM', label: 'Raio Máximo (m)', type: 'number', min: 1, max: 50, step: 1 }, { id: 'minSeparationFactor', label: 'Fator Sep. Mín.', type: 'number', min: 0.5, max: 2, step: 0.05 } ],
    advanced_density: [
        { id: 'numTiles', label: 'Número de Tiles', type: 'number', min: 1, max: 300, step: 1 },
        { id: 'maxRadiusM', label: 'Raio Máximo (m)', type: 'number', min: 1, max: 50, step: 1 },
        {
            id: 'densityProfile', label: 'Perfil de Densidade', type: 'select',
            options: [
                { value: 'gaussian', label: 'Gaussiana' },
                { value: 'exponential', label: 'Exponencial' },
                { value: 'linear_falloff', label: 'Linear Decrescente' },
                { value: 'logNormal', label: 'Log-Normal' },
                { value: 'cauchy', label: 'Cauchy' },
                { value: 'weibull', label: 'Weibull' }
            ]
        },
        {
            id: 'densityInfluenceFactor',
            label: 'Fator Influência Densidade',
            type: 'number',
            min: 0, max: 1, step: 0.01,
            defaultValue: 0.75
        },
        // Profile-specific parameters will be inserted here by updateDynamicControls
        { id: 'minSeparationFactor', label: 'Fator Sep. Mín.', type: 'number', min: 1.0, max: 3, step: 0.05 }
    ]
};

// === Classe Principal do Gerador ===
class AntennaLayoutGenerator {
    constructor() {
        this.canvas = document.getElementById('layout-canvas');
        if (!this.canvas) {
            console.error("Erro Fatal: Elemento canvas#layout-canvas não encontrado!");
            alert("Erro na inicialização: Canvas de visualização não encontrado.");
            return;
        }
        this.ctx = this.canvas.getContext('2d');
        this.layoutType = document.getElementById('layout-type')?.value || 'grid'; 
        this.params = JSON.parse(JSON.stringify(DEFAULT_PARAMS[this.layoutType]));
        this.currentLayout = []; 
        this.allAntennas = [];   
        this.collisions = [];    
        this.showCollisions = true;
        this.lastProfile = null; // For advanced_density

        // Universal Drag-and-drop state variables
        this.isDragging = false;
        this.draggedTileIndex = -1;
        this.mouseOffsetX = 0;
        this.mouseOffsetY = 0;
        this.lastDrawParams = null;

        const showCollisionsCheckbox = document.getElementById('show-collisions');
        if (showCollisionsCheckbox) {
            showCollisionsCheckbox.checked = this.showCollisions;
        } else {
            console.warn("Elemento input#show-collisions não encontrado durante inicialização.");
        }

        this.downloadImageBtn = null;
        this.imageThemeRadios = null;
        this.imageAxesRadios = null;

        this.resizeCanvas();
        this.initControls();

        window.addEventListener('themeChanged', () => {
            console.log('Generator: Evento "themeChanged" recebido. Redesenhando layout do canvas.');
            this.drawLayout(); 
        });
    }

    resizeCanvas() {
        const container = this.canvas?.parentElement;
        if (!container) {
            console.warn("Container pai do canvas não encontrado, canvas não redimensionado.");
             this.canvas.width = 400;
             this.canvas.height = 350;
             this.drawLayout(); 
            return;
        }
        const style = getComputedStyle(container);
        const containerWidth = container.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
        const containerHeight = container.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
        const statsDiv = container.querySelector('.stats');
        const statsHeight = statsDiv ? statsDiv.offsetHeight : 0;
        const collisionInfoDiv = container.querySelector('.collision-info');
        const collisionInfoHeight = collisionInfoDiv ? (collisionInfoDiv.offsetHeight || collisionInfoDiv.querySelector('.collision-header')?.offsetHeight || 0) : 0;
        const availableHeight = containerHeight - statsHeight - collisionInfoHeight;
        const minWidth = 200;
        const minHeight = 150;
        this.canvas.width = Math.max(containerWidth, minWidth);
        this.canvas.height = Math.max(availableHeight, minHeight);
        this.drawLayout();
    }

    initControls() {
        const layoutTypeSelect = document.getElementById('layout-type');
        const generateBtn = document.getElementById('generate-btn');
        const randomBtn = document.getElementById('random-btn');
        const showCollisionsCheckbox = document.getElementById('show-collisions');

        if (layoutTypeSelect) {
            layoutTypeSelect.addEventListener('change', () => {
                this.layoutType = layoutTypeSelect.value;
                this.params = JSON.parse(JSON.stringify(DEFAULT_PARAMS[this.layoutType]));
                 if (this.layoutType === 'advanced_density' && this.params.densityProfile) {
                    // Ensure profileParams is initialized if not present (e.g. if DEFAULT_PARAMS was minimal)
                    if (!this.params.profileParams) {
                        this.params.profileParams = getProfileDefaults(this.params.densityProfile);
                    }
                }
                this.updateDynamicControls();
                this.generateLayout();
            });
        } else { console.warn("Elemento select#layout-type não encontrado."); }

        if (generateBtn) {
            generateBtn.addEventListener('click', () => this.generateLayout());
        } else { console.warn("Elemento button#generate-btn não encontrado."); }

        if (randomBtn) {
            randomBtn.addEventListener('click', () => this.generateRandomLayout());
        } else { console.warn("Elemento button#random-btn não encontrado."); }

        if (showCollisionsCheckbox) {
            showCollisionsCheckbox.addEventListener('change', () => {
                this.showCollisions = showCollisionsCheckbox.checked;
                this.drawLayout();
            });
        } else { console.warn("Elemento input#show-collisions não encontrado."); }

        this.downloadImageBtn = document.getElementById('download-image-btn');
        this.imageThemeRadios = document.querySelectorAll('input[name="imageTheme"]');
        this.imageAxesRadios = document.querySelectorAll('input[name="imageAxes"]');
        
        if (this.downloadImageBtn) {
            this.downloadImageBtn.addEventListener('click', () => this.downloadLayoutImage());
        } else {
            console.warn("Botão de download da imagem (download-image-btn) não encontrado.");
        }
        
        this.updateDynamicControls();

        const exportConfigBtn = document.getElementById('export-config-btn');
        if (exportConfigBtn) {
            exportConfigBtn.addEventListener('click', () => this.exportLayoutConfiguration());
        } else {
            console.warn("Botão #export-config-btn não encontrado.");
        }

        const importConfigInput = document.getElementById('import-config-input');
        if (importConfigInput) {
            importConfigInput.addEventListener('change', (event) => this.importLayoutConfiguration(event));
        } else {
            console.warn("Input #import-config-input não encontrado.");
        }

        // Attach universal drag-and-drop listeners
        this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        window.addEventListener('mouseup', (e) => this.handleMouseUp(e));
        this.canvas.addEventListener('mouseleave', (e) => this.handleMouseLeave(e));
        this.canvas.addEventListener('mouseenter', (e) => this.handleMouseEnter(e));
    }

    getMousePos(canvas, evt) {
        const rect = canvas.getBoundingClientRect();
        return {
            x: evt.clientX - rect.left,
            y: evt.clientY - rect.top
        };
    }

    handleMouseDown(e) {
        if (!this.currentLayout || this.currentLayout.length === 0 || !this.lastDrawParams) return;

        const mousePos = this.getMousePos(this.canvas, e);
        const { scale, minX, minY, offsetX, offsetY, effectiveHeight } = this.lastDrawParams;
        const clickRadius = 10; // pixels

        for (let i = 0; i < this.currentLayout.length; i++) {
            const tile = this.currentLayout[i];
            if (!Array.isArray(tile) || tile.length < 2) continue;

            const tileCanvasX = (tile[0] - minX) * scale + offsetX;
            const tileCanvasY = (effectiveHeight - (tile[1] - minY)) * scale + offsetY;

            const distance = Math.sqrt(Math.pow(mousePos.x - tileCanvasX, 2) + Math.pow(mousePos.y - tileCanvasY, 2));

            if (distance < clickRadius) {
                this.isDragging = true;
                this.draggedTileIndex = i;
                this.mouseOffsetX = mousePos.x - tileCanvasX;
                this.mouseOffsetY = mousePos.y - tileCanvasY;
                this.canvas.style.cursor = 'grabbing';
                break;
            }
        }
    }

    handleMouseMove(e) {
        if (!this.isDragging || this.draggedTileIndex === -1 || !this.lastDrawParams) return;

        const mousePos = this.getMousePos(this.canvas, e);
        const { scale, minX, minY, offsetX, offsetY, effectiveHeight } = this.lastDrawParams;

        const newTileCanvasX = mousePos.x - this.mouseOffsetX;
        const newTileCanvasY = mousePos.y - this.mouseOffsetY;

        let newWorldX = (newTileCanvasX - offsetX) / scale + minX;
        let newWorldY = minY - ((newTileCanvasY - offsetY) / scale - effectiveHeight);

        this.currentLayout[this.draggedTileIndex][0] = newWorldX;
        this.currentLayout[this.draggedTileIndex][1] = newWorldY;

        this.generateAllAntennas();
        this.checkCollisions();
        this.drawLayout();
    }

    handleMouseUp(e) {
        if (!this.isDragging) return;
        this.isDragging = false;
        this.draggedTileIndex = -1;
        this.canvas.style.cursor = (this.currentLayout && this.currentLayout.length > 0) ? 'grab' : 'default';

        this.updateStats();
        if (typeof window.updateExportFields === 'function') {
            let selectedStations = window.interactiveMap?.getSelectedCoordinates() || [];
            window.updateExportFields(this.currentLayout, selectedStations);
        }
        window.dispatchEvent(new CustomEvent('layoutGenerated'));
    }

    handleMouseLeave(e) {
        if (this.isDragging) {
            this.handleMouseUp(e);
        }
        this.canvas.style.cursor = 'default';
    }

    handleMouseEnter(e) {
        if (!this.isDragging && this.currentLayout && this.currentLayout.length > 0) {
            this.canvas.style.cursor = 'grab';
        }
    }

    exportLayoutConfiguration() {
        const config = {
            layoutType: this.layoutType,
            params: this.params, // this.params should already contain profileParams if layoutType is advanced_density
            currentTileLayout: JSON.parse(JSON.stringify(this.currentLayout || [])) // Add this line
        };
        // If advanced_density, ensure profileParams is part of the params to be saved
        // Note: The previous check for advanced_density and profileParams is implicitly handled
        // because this.params should already have profileParams correctly set if that's the active type.
        // However, explicitly ensuring it or documenting this assumption is good.
        // For this specific change, we are only adding currentTileLayout. The params object is assumed to be correct.

        const jsonString = JSON.stringify(config, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const filename = `bingo_layout_config_${this.layoutType}.json`;

        if (typeof saveAs !== 'undefined') {
            saveAs(blob, filename);
        } else {
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(link.href);
        }
        console.log('Layout configuration exported, including currentTileLayout:', filename);
    }

    importLayoutConfiguration(event) {
        const file = event.target.files[0];
        if (!file) {
            return;
        }
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const config = JSON.parse(e.target.result);
                if (config && config.layoutType && config.params) {
                    const layoutTypeSelect = document.getElementById('layout-type');
                    const isValidLayoutType = Array.from(layoutTypeSelect.options).some(opt => opt.value === config.layoutType);

                    if (!isValidLayoutType) {
                        alert('Erro: Tipo de layout inválido no arquivo de configuração.');
                        event.target.value = null; // Reset file input
                        return;
                    }

                    this.layoutType = config.layoutType;
                    // Start with default params for the imported layout type
                    this.params = JSON.parse(JSON.stringify(DEFAULT_PARAMS[this.layoutType]));

                    // Overwrite with imported params (main ones)
                    for (const key in config.params) {
                        if (config.params.hasOwnProperty(key) && key !== 'profileParams') { // Exclude profileParams for now
                            if (this.params.hasOwnProperty(key)) {
                                // Basic type conversion based on control type if available
                                const controlDef = (PARAM_CONTROLS[this.layoutType] || []).find(c => c.id === key);
                                if (controlDef && controlDef.type === 'number') {
                                    this.params[key] = parseFloat(config.params[key]);
                                } else if (controlDef && controlDef.type === 'checkbox') {
                                    this.params[key] = Boolean(config.params[key]);
                                } else {
                                    this.params[key] = config.params[key];
                                }
                            }
                        }
                    }

                    // Special handling for profileParams if layoutType is advanced_density
                    if (this.layoutType === 'advanced_density') {
                        // Ensure densityProfile is set from config.params before getting defaults
                        if (config.params.densityProfile) {
                            this.params.densityProfile = config.params.densityProfile;
                        }
                        // Initialize profileParams with defaults for the (potentially new) profile
                        this.params.profileParams = { ...getProfileDefaults(this.params.densityProfile) };
                        if (config.params.profileParams) { // If profileParams exist in imported config
                            for (const pKey in config.params.profileParams) {
                                if (this.params.profileParams.hasOwnProperty(pKey) && config.params.profileParams.hasOwnProperty(pKey)) {
                                    // Assuming all profile params are numbers, parse them
                                    this.params.profileParams[pKey] = parseFloat(config.params.profileParams[pKey]);
                                }
                            }
                        }
                    }

                    // Update the layout type dropdown UI
                    layoutTypeSelect.value = this.layoutType;
                    // Update all dynamic controls based on the new this.params
                    this.updateDynamicControls();

                    // Check for and apply currentTileLayout override
                    if (config.currentTileLayout && Array.isArray(config.currentTileLayout)) {
                        // Basic validation for array of arrays of numbers
                        const isValidLayoutArray = config.currentTileLayout.every(
                            tile => Array.isArray(tile) && tile.length >= 2 && typeof tile[0] === 'number' && typeof tile[1] === 'number'
                        );

                        if (isValidLayoutArray) {
                            console.log("Aplicando currentTileLayout do arquivo importado.");
                            this.currentLayout = JSON.parse(JSON.stringify(config.currentTileLayout));

                            // Directly update layout dependent parts
                            this.generateAllAntennas();
                            this.checkCollisions();
                            this.drawLayout(); // This will also update lastDrawParams
                            this.updateStats();
                            if (typeof window.updateExportFields === 'function') {
                                let selectedStations = window.interactiveMap?.getSelectedCoordinates() || [];
                                window.updateExportFields(this.currentLayout, selectedStations);
                            }
                            window.dispatchEvent(new CustomEvent('layoutGenerated'));
                            alert('Configuração de layout (com posições de tiles customizadas) importada com sucesso!');
                        } else {
                            console.warn("currentTileLayout encontrado no arquivo, mas formato inválido. Gerando layout a partir dos parâmetros.");
                            this.generateLayout(); // Fallback to generating from params
                            alert('Configuração de layout importada (parâmetros aplicados, mas posições de tiles customizadas inválidas/ignoradas).');
                        }
                    } else {
                        // No currentTileLayout or invalid, so generate layout from params
                        console.log("Gerando layout a partir dos parâmetros do arquivo importado (sem currentTileLayout).");
                        this.generateLayout();
                        alert('Configuração de layout (parâmetros) importada com sucesso!');
                    }
                    console.log('Layout configuration imported:', config);
                } else {
                    alert('Erro: Arquivo de configuração inválido. Faltando layoutType ou params.');
                }
            } catch (error) {
                alert('Erro ao processar o arquivo de configuração: ' + error.message);
                console.error('Erro ao importar configuração:', error);
            } finally {
                event.target.value = null; // Reset file input
            }
        };
        reader.onerror = (error) => {
            alert('Erro ao ler o arquivo: ' + error.message);
            console.error('Erro ao ler arquivo de configuração:', error);
            event.target.value = null;
        };
        reader.readAsText(file);
    }

    updateDynamicControls() {
        const dynamicParamsDiv = document.getElementById('dynamic-params');
        if (!dynamicParamsDiv) {
             console.error("Div #dynamic-params não encontrada.");
            return;
        }
        dynamicParamsDiv.innerHTML = ''; 

        const manualToolsDiv = document.getElementById('manual-edit-tools');
        if (manualToolsDiv) {
            manualToolsDiv.style.display = 'none';
        }

        const profileSpecificParamsContainer = document.getElementById('profile-specific-params-container');
        if (!profileSpecificParamsContainer) {
            console.error("Div #profile-specific-params-container não encontrada.");
        } else {
            profileSpecificParamsContainer.innerHTML = '';
            profileSpecificParamsContainer.style.display = 'none';
        }

        const controls = PARAM_CONTROLS[this.layoutType];
        if (!controls) {
            console.warn(`Nenhuma definição de controle encontrada para o tipo de layout: ${this.layoutType}`);
            return;
        }

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
                        inputElement.addEventListener('change', () => {
                            this.params[control.id] = inputElement.value;
                            if (control.id === 'densityProfile' && this.layoutType === 'advanced_density') {
                                this.params.profileParams = getProfileDefaults(inputElement.value);
                                this.lastProfile = inputElement.value; // Update lastProfile here
                            }
                            this.updateDynamicControls();
                            this.generateLayout();
                        });
                        formGroup.appendChild(inputElement);
                        break;
                    case 'checkbox':
                        inputElement = document.createElement('input'); inputElement.type = 'checkbox'; inputElement.id = control.id; inputElement.name = control.id;
                        inputElement.checked = this.params[control.id] !== undefined ? Boolean(this.params[control.id]) : false;
                        const chkContainer = document.createElement('div'); chkContainer.style.display = 'flex'; chkContainer.style.alignItems = 'center'; chkContainer.appendChild(inputElement);
                        inputElement.addEventListener('change', () => {
                            this.params[control.id] = inputElement.checked;
                            this.updateDynamicControls(); 
                            this.generateLayout();
                        });
                        formGroup.appendChild(chkContainer);
                        break;
                    case 'number': 
                        const sliderGroup = document.createElement('div'); sliderGroup.className = 'slider-group';
                        const sliderInput = document.createElement('input'); sliderInput.type = 'range'; sliderInput.id = control.id + '-slider'; sliderInput.name = control.id + '-slider';
                        if (control.min !== undefined) sliderInput.min = control.min;
                        if (control.max !== undefined) sliderInput.max = control.max;
                        if (control.step !== undefined) sliderInput.step = control.step;
                        sliderInput.value = this.params[control.id]; 
                        sliderGroup.appendChild(sliderInput);
                        const numberInput = document.createElement('input'); numberInput.type = 'number'; numberInput.id = control.id; numberInput.name = control.id;
                         if (control.min !== undefined) numberInput.min = control.min;
                         if (control.max !== undefined) numberInput.max = control.max;
                         if (control.step !== undefined) numberInput.step = control.step;
                         numberInput.value = this.params[control.id]; 
                        sliderGroup.appendChild(numberInput);
                        sliderInput.addEventListener('input', () => {
                            const v = parseFloat(sliderInput.value);
                            numberInput.value = v; 
                            this.params[control.id] = v; 
                            this.generateLayout(); 
                        });
                         numberInput.addEventListener('input', () => {
                             let v = parseFloat(numberInput.value);
                             if (!isNaN(v)) {
                                 if (control.min !== undefined) v = Math.max(control.min, v);
                                 if (control.max !== undefined) v = Math.min(control.max, v);
                                 sliderInput.value = v; 
                                 this.params[control.id] = v; 
                                 this.generateLayout(); 
                             }
                         });
                         numberInput.addEventListener('change', () => {
                             let v = parseFloat(numberInput.value);
                             if (isNaN(v)) { v = parseFloat(sliderInput.value); numberInput.value = v; } 
                             if (control.min !== undefined) v = Math.max(control.min, v);
                             if (control.max !== undefined) v = Math.min(control.max, v);
                             if (control.step !== undefined && control.step !== 0) {
                                 const dp = (String(control.step).split('.')[1] || '').length;
                                 v = parseFloat((Math.round(v / control.step) * control.step).toFixed(dp));
                             }
                             numberInput.value = v;
                             sliderInput.value = v;
                             if(this.params[control.id] !== v) {
                                 this.params[control.id] = v;
                                 this.updateDynamicControls(); 
                                 this.generateLayout();
                             }
                         });
                        formGroup.appendChild(sliderGroup);
                        break;
                    default:
                        console.warn(`Tipo de controle dinâmico não tratado: ${control.type}`);
                        break;
                }
                dynamicParamsDiv.appendChild(formGroup); 
            }
        });

        if (this.layoutType === 'advanced_density' && profileSpecificParamsContainer) {
            profileSpecificParamsContainer.style.display = 'block';
            const currentProfile = this.params.densityProfile || 'gaussian';

            if (this.lastProfile !== currentProfile || !this.params.profileParams || Object.keys(this.params.profileParams).length === 0) {
                 this.params.profileParams = { ...getProfileDefaults(currentProfile) };
            }
            this.lastProfile = currentProfile;

            const selectedSchema = PROFILE_PARAM_SCHEMAS[currentProfile];
            if (selectedSchema) {
                selectedSchema.forEach(paramSchema => {
                    const formGroup = document.createElement('div'); formGroup.className = 'form-group';
                    const label = document.createElement('label');
                    label.setAttribute('for', `profile_param_input_${paramSchema.key}`);
                    label.textContent = paramSchema.label + ':';
                    formGroup.appendChild(label);

                    const sliderGroup = document.createElement('div'); sliderGroup.className = 'slider-group';
                    const sliderInput = document.createElement('input'); sliderInput.type = 'range';
                    sliderInput.id = `profile_param_slider_${paramSchema.key}`;
                    sliderInput.min = paramSchema.min; sliderInput.max = paramSchema.max; sliderInput.step = paramSchema.step;
                    sliderInput.value = this.params.profileParams[paramSchema.key];

                    const numberInput = document.createElement('input'); numberInput.type = 'number';
                    numberInput.id = `profile_param_input_${paramSchema.key}`;
                    numberInput.min = paramSchema.min; numberInput.max = paramSchema.max; numberInput.step = paramSchema.step;
                    numberInput.value = this.params.profileParams[paramSchema.key];

                    sliderInput.addEventListener('input', () => {
                        const val = parseFloat(sliderInput.value);
                        this.params.profileParams[paramSchema.key] = val;
                        numberInput.value = val;
                        this.generateLayout();
                    });
                    numberInput.addEventListener('input', () => {
                        let val = parseFloat(numberInput.value);
                        if (!isNaN(val)) {
                            if (paramSchema.min !== undefined) val = Math.max(paramSchema.min, val);
                            if (paramSchema.max !== undefined) val = Math.min(paramSchema.max, val);
                            this.params.profileParams[paramSchema.key] = val;
                            sliderInput.value = val;
                            this.generateLayout();
                        }
                    });
                     numberInput.addEventListener('change', () => {
                        let val = parseFloat(numberInput.value);
                        if (isNaN(val)) { val = parseFloat(sliderInput.value); }
                        if (paramSchema.min !== undefined) val = Math.max(paramSchema.min, val);
                        if (paramSchema.max !== undefined) val = Math.min(paramSchema.max, val);
                        if (paramSchema.step !== undefined && paramSchema.step !== 0) {
                            const dp = (String(paramSchema.step).split('.')[1] || '').length;
                            val = parseFloat((Math.round(val / paramSchema.step) * control.step).toFixed(dp));
                        }
                        numberInput.value = val;
                        sliderInput.value = val;
                        if(this.params.profileParams[paramSchema.key] !== val) {
                             this.params.profileParams[paramSchema.key] = val;
                             this.generateLayout();
                        }
                    });

                    sliderGroup.appendChild(sliderInput); sliderGroup.appendChild(numberInput);
                    formGroup.appendChild(sliderGroup);
                    profileSpecificParamsContainer.appendChild(formGroup);
                });
            }
        } else if (profileSpecificParamsContainer) {
            profileSpecificParamsContainer.style.display = 'none';
        }


        if (this.layoutType === 'ring') {
             const numRingsControl = controls.find(c => c.id === 'numRings');
             const numRings = numRingsControl ? parseInt(this.params.numRings) : 0;
             if (!Array.isArray(this.params.tilesPerRing) || this.params.tilesPerRing.length !== numRings) {
                 this.params.tilesPerRing = Array.from({ length: numRings }, (_, i) => Math.max(1, 8 * (i + 1)));
                 console.log(`Regenerando this.params.tilesPerRing para ${numRings} anéis:`, this.params.tilesPerRing);
             }
             if (numRings > 0) {
                 const formGroup = document.createElement('div');
                 formGroup.className = 'form-group';
                 const label = document.createElement('label');
                 label.setAttribute('for', 'tilesPerRing-input');
                 label.textContent = 'Tiles por Anel (CSV):';
                 formGroup.appendChild(label);
                 const textInput = document.createElement('input');
                 textInput.type = 'text';
                 textInput.id = 'tilesPerRing-input';
                 textInput.name = 'tilesPerRing-input';
                 textInput.value = this.params.tilesPerRing.join(', ');
                 textInput.addEventListener('change', () => {
                     const rawValue = textInput.value.trim();
                     const parsedArray = rawValue.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n) && n >= 1);
                     if (parsedArray.length === numRings) {
                         this.params.tilesPerRing = parsedArray;
                         console.log("tilesPerRing atualizado:", this.params.tilesPerRing);
                         this.generateLayout(); 
                     } else {
                         textInput.value = this.params.tilesPerRing.join(', ');
                         alert(`O número de valores de Tiles por Anel (${parsedArray.length}) não corresponde ao Número de Anéis selecionado (${numRings}). Por favor, insira ${numRings} números separados por vírgula.`);
                     }
                 });
                 formGroup.appendChild(textInput);
                 dynamicParamsDiv.appendChild(formGroup);
             }
        }
    }

    evaluateCondition(conditionString) {
        try {
            const evaluator = new Function(`return (${conditionString});`);
            return evaluator.call(this);
        } catch (e) {
            console.error(`Erro ao avaliar condição para controle dinâmico "${conditionString}":`, e);
            return true; 
        }
    }

    createTileLayout64Antennas(centerX, centerY) {
        const antennas = [];
        const Nx = 4; 
        const Ny = 16; 
        const spacingX = TILE_WIDTH / Nx;
        const spacingY = TILE_HEIGHT / Ny;
        for (let i = 0; i < Nx; i++) {
            const posX = centerX + (i - (Nx - 1) / 2.0) * spacingX;
            for (let j = 0; j < Ny; j++) {
                const posY = centerY + (j - (Ny - 1) / 2.0) * spacingY;
                antennas.push([posX, posY]);
            }
        }
        return antennas; 
    }

    generateLayout() {
        console.log(`Iniciando geração do layout: ${this.layoutType}`);
        const commonParams = { tileWidthM: TILE_WIDTH, tileHeightM: TILE_HEIGHT, centerLayout: true };
        const currentParamsSanitized = {};
        const controlsForType = PARAM_CONTROLS[this.layoutType] || [];

        // Sanitize main parameters
        for (const key in this.params) {
            if (key === 'profileParams' && this.layoutType === 'advanced_density') continue; // Handle profileParams separately

            const controlDef = controlsForType.find(c => c.id === key);
            if (controlDef) {
                if (controlDef.type === 'number') {
                    const parsedValue = parseFloat(this.params[key]);
                    currentParamsSanitized[key] = isNaN(parsedValue) ? DEFAULT_PARAMS[this.layoutType][key] : parsedValue;
                } else if (controlDef.type === 'checkbox') {
                    currentParamsSanitized[key] = Boolean(this.params[key]);
                } else {
                    currentParamsSanitized[key] = this.params[key];
                }
            } else {
                 currentParamsSanitized[key] = this.params[key]; // Pass through if no specific control (e.g. profileParams object itself)
            }
        }
         // Sanitize profileParams for advanced_density
        if (this.layoutType === 'advanced_density') {
            currentParamsSanitized.profileParams = {};
            const profileSchema = PROFILE_PARAM_SCHEMAS[this.params.densityProfile] || [];
            for (const paramDef of profileSchema) {
                const key = paramDef.key;
                if (this.params.profileParams && this.params.profileParams.hasOwnProperty(key)) {
                    const parsedValue = parseFloat(this.params.profileParams[key]);
                    currentParamsSanitized.profileParams[key] = isNaN(parsedValue) ? paramDef.defaultValue : parsedValue;
                } else {
                    currentParamsSanitized.profileParams[key] = paramDef.defaultValue;
                }
            }
        }


        const fullParams = { ...currentParamsSanitized, ...commonParams };

        if (this.layoutType === 'ring') {
            const numRings = typeof fullParams.numRings === 'number' ? fullParams.numRings : 0;
            let tilesPerRingArray = fullParams.tilesPerRing; 
             if (!Array.isArray(tilesPerRingArray) || tilesPerRingArray.length !== numRings) {
                 tilesPerRingArray = Array.from({ length: numRings }, (_, i) => Math.max(1, 8 * (i + 1)));
                 console.warn(`Gerador: 'tilesPerRing' inválido ou tamanho incorreto (${tilesPerRingArray.length} vs ${numRings}). Recriado.`);
                 this.params.tilesPerRing = [...tilesPerRingArray]; // Update main params if sanitized
                 fullParams.tilesPerRing = [...tilesPerRingArray]; // Ensure fullParams also has the corrected one
             } else {
                fullParams.tilesPerRing = tilesPerRingArray.map(n => Math.max(1, parseInt(n) || 8));
             }
        }


        try {
            if (!window.BingoLayouts) {
                throw new Error("Biblioteca 'BingoLayouts' (bingo_layouts.js) não carregada.");
            }
            console.log(`Chamando BingoLayouts para tipo: ${this.layoutType} com parâmetros:`, JSON.parse(JSON.stringify(fullParams))); // Log a deep copy for safety

            // Clear previous layout results before generating new ones
            this.currentLayout = [];
            this.allAntennas = [];
            this.collisions = [];

            switch (this.layoutType) {
                case 'grid': this.currentLayout = window.BingoLayouts.createGridLayout(fullParams.numCols, fullParams.numRows, fullParams.tileWidthM, fullParams.tileHeightM, fullParams.spacingXFactor, fullParams.spacingYFactor, fullParams.centerExpScaleFactor, fullParams.randomOffsetStddevM, fullParams.minSeparationFactor, undefined, fullParams.centerLayout); break;
                case 'spiral': this.currentLayout = window.BingoLayouts.createSpiralLayout(fullParams.numArms, fullParams.tilesPerArm, fullParams.tileWidthM, fullParams.tileHeightM, fullParams.radiusStartFactor, fullParams.radiusStepFactor, fullParams.centerExpScaleFactor, fullParams.angleStepRad, fullParams.armOffsetRad, fullParams.rotationPerArmRad, fullParams.randomOffsetStddevM, fullParams.minSeparationFactor, undefined, fullParams.centerLayout, fullParams.includeCenterTile); break;
                case 'ring': this.currentLayout = window.BingoLayouts.createRingLayout(fullParams.numRings, fullParams.tilesPerRing, fullParams.tileWidthM, fullParams.tileHeightM, fullParams.radiusStartFactor, fullParams.radiusStepFactor, fullParams.centerExpScaleFactor, fullParams.angleOffsetRad, fullParams.randomOffsetStddevM, fullParams.minSeparationFactor, undefined, fullParams.centerLayout, fullParams.addCenterTile); break;
                case 'rhombus': this.currentLayout = window.BingoLayouts.createRhombusLayout(fullParams.numRowsHalf, fullParams.tileWidthM, fullParams.tileHeightM, fullParams.sideLengthFactor, fullParams.hCompressFactor, fullParams.vCompressFactor, fullParams.centerExpScaleFactor, fullParams.randomOffsetStddevM, fullParams.minSeparationFactor, undefined, fullParams.centerLayout); break;
                case 'hex_grid': this.currentLayout = window.BingoLayouts.createHexGridLayout(fullParams.numRingsHex, fullParams.tileWidthM, fullParams.tileHeightM, fullParams.spacingFactor, fullParams.centerExpScaleFactor, fullParams.addCenterTile, fullParams.randomOffsetStddevM, fullParams.minSeparationFactor, undefined, fullParams.centerLayout); break;
                case 'phyllotaxis': this.currentLayout = window.BingoLayouts.createPhyllotaxisLayout(fullParams.numTiles, fullParams.tileWidthM, fullParams.tileHeightM, fullParams.scaleFactor, fullParams.centerOffsetFactor, fullParams.centerExpScaleFactor, fullParams.randomOffsetStddevM, fullParams.minSeparationFactor, undefined, fullParams.centerLayout); break;
                case 'manual_circular': this.currentLayout = window.BingoLayouts.createManualCircularLayout(fullParams.tileWidthM, fullParams.tileHeightM, fullParams.spacingXFactor, fullParams.spacingYFactor, fullParams.centerExpScaleFactor, fullParams.randomOffsetStddevM, fullParams.minSeparationFactor, undefined, fullParams.centerLayout); break;
                case 'random': this.currentLayout = window.BingoLayouts.createRandomLayout(fullParams.numTiles, fullParams.maxRadiusM, fullParams.tileWidthM, fullParams.tileHeightM, fullParams.minSeparationFactor, undefined, fullParams.centerLayout); break;
                case 'advanced_density':
                    this.currentLayout = window.BingoLayouts.createAdvancedDensityLayout(
                        fullParams.numTiles,
                        fullParams.maxRadiusM,
                        fullParams.tileWidthM,
                        fullParams.tileHeightM,
                        fullParams.densityProfile,
                        fullParams.profileParams, // Pass the whole object
                        fullParams.densityInfluenceFactor,
                        fullParams.minSeparationFactor,
                        undefined, // maxPlacementAttemptsPerTile (uses default in bingo_layouts.js)
                        fullParams.centerLayout
                    );
                    break;
                default:
                    console.warn(`Tipo de layout não reconhecido: ${this.layoutType}. Gerando layout vazio.`);
                    this.currentLayout = [];
            }
            this.generateAllAntennas();
            this.checkCollisions();
            this.drawLayout();
            this.updateStats();
            if (typeof window.updateExportFields === 'function') {
                let selectedStations = [];
                if (window.interactiveMap?.getSelectedCoordinates) {
                     selectedStations = window.interactiveMap.getSelectedCoordinates();
                }
                window.updateExportFields(this.currentLayout, selectedStations);
            } else {
                console.warn("Função global 'updateExportFields' não encontrada. Exportação pode não atualizar.");
            }
            console.log("Dispatching 'layoutGenerated' event from generator.js");
            window.dispatchEvent(new CustomEvent('layoutGenerated'));
        } catch (error) {
            console.error(`Erro durante a geração do layout '${this.layoutType}':`, error);
            alert(`Erro ao gerar layout '${this.layoutType}'.\nDetalhes: ${error.message}`);
            this.currentLayout = [];
            this.allAntennas = [];
            this.collisions = [];
            this.drawLayout();
            this.updateStats(); 
            if (typeof window.updateExportFields === 'function') {
                 let selectedStations = [];
                 if (window.interactiveMap?.getSelectedCoordinates) {
                      selectedStations = window.interactiveMap.getSelectedCoordinates();
                 }
                 window.updateExportFields([], selectedStations); 
            }
        }
    }

    capitalizeFirstLetter(string) {
        if (!string) return '';
        return string.charAt(0).toUpperCase() + string.slice(1);
    }

    generateAllAntennas() {
        this.allAntennas = []; 
        if (!this.currentLayout || this.currentLayout.length === 0) return; 
        for (const center of this.currentLayout) {
            if (Array.isArray(center) && center.length >= 2 && typeof center[0] === 'number' && typeof center[1] === 'number') {
                 const tileAntennas = this.createTileLayout64Antennas(center[0], center[1]);
                 this.allAntennas.push(...tileAntennas); 
            } else {
                 console.warn("Gerador: Centro de tile inválido encontrado:", center);
            }
        }
        console.log(`Geradas ${this.allAntennas.length} antenas a partir de ${this.currentLayout.length} tiles.`);
    }

    checkCollisions() {
        this.collisions = []; 
        if (!this.currentLayout || this.currentLayout.length < 2) return; 
        const minCenterXDist = TILE_WIDTH;
        const minCenterYDist = TILE_HEIGHT;
        const epsilon = 1e-6;
        for (let i = 0; i < this.currentLayout.length; i++) {
            for (let j = i + 1; j < this.currentLayout.length; j++) {
                const tile1 = this.currentLayout[i];
                const tile2 = this.currentLayout[j];
                if (!Array.isArray(tile1) || tile1.length < 2 || typeof tile1[0] !== 'number' || typeof tile1[1] !== 'number' ||
                    !Array.isArray(tile2) || tile2.length < 2 || typeof tile2[0] !== 'number' || typeof tile2[1] !== 'number') {
                     console.warn(`Gerador: Dados de tile inválidos ao verificar colisão entre índices ${i} e ${j}.`, tile1, tile2);
                     continue; 
                }
                const deltaX = Math.abs(tile1[0] - tile2[0]);
                const deltaY = Math.abs(tile1[1] - tile2[1]);
                if (deltaX < (minCenterXDist - epsilon) && deltaY < (minCenterYDist - epsilon)) {
                    const distance = Math.sqrt(Math.pow(tile1[0] - tile2[0], 2) + Math.pow(tile1[1] - tile2[1], 2));
                    this.collisions.push({
                        tile1Index: i,
                        tile2Index: j,
                        distance: distance
                    });
                }
            }
        }
        console.log(`Verificação de colisões concluída. ${this.collisions.length} colisões retangulares encontradas.`);
    }

    generateRandomLayout() {
        const controls = PARAM_CONTROLS[this.layoutType];
        if (!controls) {
            console.warn(`Não é possível gerar layout aleatório para o tipo: ${this.layoutType}`);
            return;
        }
        console.log(`Gerando parâmetros aleatórios para o layout: ${this.layoutType}`);
        controls.forEach(control => {
            switch(control.type) {
                case 'number':
                    if (control.min !== undefined && control.max !== undefined) {
                        let rVal = Math.random() * (control.max - control.min) + control.min;
                        if (control.step !== undefined && control.step !== 0) {
                            const dp = (String(control.step).split('.')[1] || '').length; 
                            rVal = parseFloat((Math.round(rVal / control.step) * control.step).toFixed(dp));
                        }
                        rVal = Math.max(parseFloat(control.min), Math.min(parseFloat(control.max), rVal));
                        this.params[control.id] = rVal; 
                    } else {
                         console.warn(`Controle numérico '${control.id}' não tem min/max definidos para aleatorização.`);
                    }
                    break;
                case 'select':
                    if (control.options?.length > 0) {
                        const rIdx = Math.floor(Math.random() * control.options.length);
                        this.params[control.id] = control.options[rIdx].value; 
                    } else {
                         console.warn(`Controle select '${control.id}' não tem options definidos para aleatorização.`);
                    }
                    break;
                case 'checkbox':
                    this.params[control.id] = Math.random() > 0.5; 
                    break;
            }
        });

        if (this.layoutType === 'advanced_density') {
            const currentProfile = this.params.densityProfile || 'gaussian';
            this.params.profileParams = { ...getProfileDefaults(currentProfile) }; // Reset to defaults
            const schema = PROFILE_PARAM_SCHEMAS[currentProfile];
            if(schema){
                schema.forEach(paramDef => {
                    if (paramDef.type === 'number' && paramDef.min !== undefined && paramDef.max !== undefined) {
                         let rVal = Math.random() * (paramDef.max - paramDef.min) + paramDef.min;
                         if (paramDef.step !== undefined && paramDef.step !== 0) {
                            const dp = (String(paramDef.step).split('.')[1] || '').length;
                            rVal = parseFloat((Math.round(rVal / paramDef.step) * paramDef.step).toFixed(dp));
                        }
                        this.params.profileParams[paramDef.key] = Math.max(paramDef.min, Math.min(paramDef.max, rVal));
                    }
                });
            }
            this.params.densityInfluenceFactor = parseFloat(Math.random().toFixed(2));
        }


        if (this.layoutType === 'ring') {
             const numRings = parseInt(this.params.numRings);
             this.params.tilesPerRing = Array.from({ length: numRings }, (_, i) => Math.max(1, Math.floor(Math.random() * 20 + 5) * (i + 1))); 
             console.log("Randomized tilesPerRing:", this.params.tilesPerRing);
        }
        this.updateDynamicControls();
        this.generateLayout();
    }

    drawLayout(drawAxes = true) {
        const ctx = this.ctx;
        const canvas = this.canvas;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--card-bg-color').trim() || 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        if (!this.currentLayout || this.currentLayout.length === 0 || this.allAntennas.length === 0) {
            ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--text-color').trim() || '#333';
            ctx.font = '16px Segoe UI, Tahoma, Geneva, Verdana, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText("Gere um layout ou ajuste os parâmetros.", canvas.width / 2, canvas.height / 2);
            this.lastDrawParams = null; // Ensure params are null if nothing to draw
            return;
        }

        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (const antenna of this.allAntennas) {
             if (Array.isArray(antenna) && antenna.length >= 2 && typeof antenna[0] === 'number' && typeof antenna[1] === 'number' && !isNaN(antenna[0]) && !isNaN(antenna[1])) {
                 minX = Math.min(minX, antenna[0]);
                 maxX = Math.max(maxX, antenna[0]);
                 minY = Math.min(minY, antenna[1]);
                 maxY = Math.max(maxY, antenna[1]);
             }
        }
        if (minX === Infinity && this.currentLayout.length > 0) {
             minX = Infinity; maxX = -Infinity; minY = Infinity; maxY = -Infinity;
             for (const center of this.currentLayout) {
                 if (Array.isArray(center) && center.length >= 2 && typeof center[0] === 'number' && typeof center[1] === 'number' && !isNaN(center[0]) && !isNaN(center[1])) {
                      minX = Math.min(minX, center[0]);
                      maxX = Math.max(maxX, center[0]);
                      minY = Math.min(minY, center[1]);
                      maxY = Math.max(maxY, center[1]);
                 }
             }
             if (minX !== Infinity) {
                  minX -= TILE_WIDTH / 2; maxX += TILE_WIDTH / 2;
                  minY -= TILE_HEIGHT / 2; maxY += TILE_HEIGHT / 2;
             }
        }
        if (minX === Infinity) {
            console.warn("Não foi possível determinar os limites do layout para desenho.");
            this.lastDrawParams = null;
            return; 
        }
        const margin = drawAxes ? 50 : 20; 
        const contentWidth = (maxX - minX);
        const contentHeight = (maxY - minY);
        const effectiveWidth = Math.max(contentWidth, 1e-6);
        const effectiveHeight = Math.max(contentHeight, 1e-6);
        const availableWidth = canvas.width - 2 * margin;
        const availableHeight = canvas.height - 2 * margin;

        if (availableWidth <= 0 || availableHeight <= 0) {
             console.warn("Área disponível no canvas para desenho é zero ou negativa. Canvas pode estar muito pequeno.");
             this.lastDrawParams = null;
             return; 
        }

        const scale = Math.min(availableWidth / effectiveWidth, availableHeight / effectiveHeight);
        const offsetX = margin + (availableWidth - effectiveWidth * scale) / 2;
        const offsetY = margin + (availableHeight - effectiveHeight * scale) / 2;

        this.lastDrawParams = { scale, minX, minY, maxX, maxY, offsetX, offsetY, effectiveHeight, contentWidth, contentHeight, canvasWidth: canvas.width, canvasHeight: canvas.height, margin };

        const transformCoord = (coordX, coordY) => {
            const relativeX = coordX - minX; 
            const relativeY = coordY - minY;
            const canvasX = relativeX * scale + offsetX;
            const canvasY = (effectiveHeight - relativeY) * scale + offsetY;
            return { x: canvasX, y: canvasY };
        };
        if (drawAxes) {
            this.drawScale(ctx, canvas, scale, minX, minY, maxX, maxY, transformCoord, margin);
        }
        const currentBodyStyle = getComputedStyle(document.documentElement);
        const centerColor = currentBodyStyle.getPropertyValue('--secondary-color').trim() || 'red';
        const antennaColor = currentBodyStyle.getPropertyValue('--primary-color').trim() || '#3498db';
        const collisionColor = currentBodyStyle.getPropertyValue('--secondary-color').trim() || 'red'; 
        ctx.fillStyle = centerColor;
        for (const center of this.currentLayout) {
            if (Array.isArray(center) && center.length >= 2) {
                const { x, y } = transformCoord(center[0], center[1]);
                ctx.beginPath();
                ctx.arc(x, y, 3, 0, Math.PI * 2); 
                ctx.fill();
            }
        }
        ctx.fillStyle = antennaColor;
        for (const antenna of this.allAntennas) {
            if (Array.isArray(antenna) && antenna.length >= 2) {
                const { x, y } = transformCoord(antenna[0], antenna[1]);
                ctx.beginPath();
                ctx.arc(x, y, 1.5, 0, Math.PI * 2); 
                ctx.fill();
            }
        }
        if (this.showCollisions && this.collisions.length > 0) {
            ctx.strokeStyle = collisionColor;
            ctx.lineWidth = 1.5;
            ctx.globalAlpha = 0.6; 
            for (const collision of this.collisions) {
                const tile1 = this.currentLayout[collision.tile1Index];
                const tile2 = this.currentLayout[collision.tile2Index];
                if (!Array.isArray(tile1) || tile1.length < 2 || !Array.isArray(tile2) || tile2.length < 2) continue;
                const { x: x1, y: y1 } = transformCoord(tile1[0], tile1[1]);
                const { x: x2, y: y2 } = transformCoord(tile2[0], tile2[1]);
                ctx.beginPath();
                ctx.moveTo(x1, y1);
                ctx.lineTo(x2, y2);
                ctx.stroke();
                ctx.lineWidth = 1; 
                ctx.beginPath();
                ctx.arc(x1, y1, 5, 0, Math.PI * 2);
                ctx.stroke();
                ctx.beginPath();
                ctx.arc(x2, y2, 5, 0, Math.PI * 2);
                ctx.stroke();
            }
            ctx.globalAlpha = 1.0; 
            ctx.lineWidth = 1; 
        }
    }

     drawScale(ctx, canvas, scale, minX, minY, maxX, maxY, transformCoord, margin) {
         const layoutWidth = maxX - minX;
         const layoutHeight = maxY - minY;
         const maxDimension = Math.max(layoutWidth, layoutHeight); 
         let scaleInterval = 1; 
         if (maxDimension > 1e-6) {
              const targetTicks = 6; 
              const roughInterval = maxDimension / targetTicks; 
              const orderOfMagnitude = Math.pow(10, Math.floor(Math.log10(roughInterval)));
              if (roughInterval / orderOfMagnitude < 1.5) scaleInterval = 1 * orderOfMagnitude;
              else if (roughInterval / orderOfMagnitude < 3.5) scaleInterval = 2 * orderOfMagnitude;
              else if (roughInterval / orderOfMagnitude < 7.5) scaleInterval = 5 * orderOfMagnitude;
              else scaleInterval = 10 * orderOfMagnitude;
              scaleInterval = Math.max(scaleInterval, 0.1); 
         }
         const scalePrecision = scaleInterval < 0.5 ? 2 : (scaleInterval < 1 ? 1 : 0);
         const epsilon = scaleInterval * 1e-6; 
         const xStart = Math.ceil((minX - epsilon) / scaleInterval) * scaleInterval;
         const xEnd = Math.floor((maxX + epsilon) / scaleInterval) * scaleInterval;
         const yStart = Math.ceil((minY - epsilon) / scaleInterval) * scaleInterval;
         const yEnd = Math.floor((maxY + epsilon) / scaleInterval) * scaleInterval;
         const scaleColor = getComputedStyle(document.documentElement).getPropertyValue('--text-color').trim() || '#888';
         const axisColor = getComputedStyle(document.documentElement).getPropertyValue('--border-color').trim() || '#aaa';
         ctx.strokeStyle = scaleColor;
         ctx.fillStyle = scaleColor;
         ctx.lineWidth = 0.5;
         ctx.font = '10px Segoe UI, Tahoma, Geneva, Verdana, sans-serif'; 
         const tickSize = 5; 
         const textMargin = 8; 
         const axisTextMargin = 15; 
         ctx.textAlign = 'center';
         ctx.textBaseline = 'top';
         const xAxisYPos = canvas.height - margin; 
         for (let x = xStart; x <= xEnd; x += scaleInterval) {
             const isZero = Math.abs(x) < epsilon;
             const axisYIsVisible = minX <= epsilon && maxX >= -epsilon;
             if (isZero && axisYIsVisible) continue;
             const { x: canvasX } = transformCoord(x, minY); 
             ctx.beginPath();
             ctx.moveTo(canvasX, xAxisYPos);
             ctx.lineTo(canvasX, xAxisYPos - tickSize);
             ctx.stroke();
             ctx.fillText(`${x.toFixed(scalePrecision)}`, canvasX, xAxisYPos + textMargin / 2); 
         }
         ctx.textAlign = 'right';
         ctx.textBaseline = 'middle';
         const yAxisXPos = margin; 
         for (let y = yStart; y <= yEnd; y += scaleInterval) {
             const isZero = Math.abs(y) < epsilon;
             const axisXIsVisible = minY <= epsilon && maxY >= -epsilon;
             if (isZero && axisXIsVisible) continue;
             const { y: canvasY } = transformCoord(minX, y); 
             ctx.beginPath();
             ctx.moveTo(yAxisXPos, canvasY);
             ctx.lineTo(yAxisXPos + tickSize, canvasY);
             ctx.stroke();
             ctx.fillText(`${y.toFixed(scalePrecision)}`, yAxisXPos - textMargin / 2, canvasY); 
         }
         ctx.strokeStyle = axisColor;
         ctx.lineWidth = 1;
         const axisEpsilon = 1e-9; 
         if (minX <= axisEpsilon && maxX >= -axisEpsilon) {
             const { x: zeroX } = transformCoord(0, minY); 
             const { y: topY } = transformCoord(0, maxY);   
             const { y: bottomY } = transformCoord(0, minY); 
             ctx.beginPath();
             ctx.moveTo(zeroX, topY);
             ctx.lineTo(zeroX, bottomY);
             ctx.stroke();
             const axisYIsVisible = minX <= epsilon && maxX >= -epsilon;
             const axisXIsVisible = minY <= epsilon && maxY >= -epsilon;
             if (!axisXIsVisible || (axisYIsVisible && Math.abs(transformCoord(0,0).x - margin) < textMargin)) {
                ctx.fillStyle = scaleColor;
                ctx.font = '10px Segoe UI';
                ctx.textAlign = 'right';
                ctx.textBaseline = 'middle';
                const {y: zeroCanvasY} = transformCoord(0, 0); 
                ctx.fillText('0', yAxisXPos - textMargin / 2, zeroCanvasY);
             }
         }
         if (minY <= axisEpsilon && maxY >= -axisEpsilon) {
             const { y: zeroY } = transformCoord(minX, 0); 
             const { x: leftX } = transformCoord(minX, 0); 
             const { x: rightX } = transformCoord(maxX, 0); 
             ctx.beginPath();
             ctx.moveTo(leftX, zeroY);
             ctx.lineTo(rightX, zeroY);
             ctx.stroke();
             const axisXIsVisible = minY <= epsilon && maxY >= -epsilon;
             const axisYIsVisible = minX <= epsilon && maxX >= -epsilon;
             if (!axisYIsVisible || (axisXIsVisible && Math.abs(transformCoord(0,0).y - (canvas.height - margin)) < textMargin)) {
                ctx.fillStyle = scaleColor;
                ctx.font = '10px Segoe UI';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'top';
                const {x: zeroCanvasX} = transformCoord(0, 0); 
                 ctx.fillText('0', zeroCanvasX, xAxisYPos + textMargin / 2);
             }
         }
         ctx.fillStyle = scaleColor;
         ctx.font = '12px Segoe UI, Tahoma, Geneva, Verdana, sans-serif'; 
         ctx.textAlign = 'center';
         ctx.textBaseline = 'bottom';
         ctx.fillText('X (metros)', canvas.width / 2, canvas.height - axisTextMargin / 3);
         ctx.save(); 
         ctx.translate(axisTextMargin, canvas.height / 2); 
         ctx.rotate(-Math.PI / 2); 
         ctx.textAlign = 'center';
         ctx.textBaseline = 'bottom';
         ctx.fillText('Y (metros)', 0, 0); 
         ctx.restore(); 
     }

    updateStats() {
        const tileCountSpan = document.getElementById('tile-count');
        const antennaCountSpan = document.getElementById('antenna-count');
        const tileCount = this.currentLayout ? this.currentLayout.length : 0;
        const antennaCount = this.allAntennas ? this.allAntennas.length : 0;
        if (tileCountSpan) tileCountSpan.textContent = tileCount;
        if (antennaCountSpan) antennaCountSpan.textContent = antennaCount;
        this.updateCollisionInfo();
        console.log(`Estatísticas atualizadas: ${tileCount} tiles, ${antennaCount} antenas.`);
    }

    updateCollisionInfo() {
        const visualizationDiv = document.querySelector('.visualization');
        if (!visualizationDiv) {
            console.warn(".visualization container não encontrado para atualizar info de colisão.");
            return;
        }
        let collisionInfoDiv = document.getElementById('collision-info');
        if (!collisionInfoDiv) {
            collisionInfoDiv = document.createElement('div');
            collisionInfoDiv.id = 'collision-info';
            collisionInfoDiv.className = 'collision-info';
            const header = document.createElement('div');
            header.className = 'collision-header';
            header.innerHTML = `<span>Colisões Detectadas: <span id="collision-count">0</span></span><span class="toggle-arrow">▼</span>`;
            const content = document.createElement('div');
            content.id = 'collision-content';
            content.className = 'collision-content';
            content.style.display = 'none'; 
            header.addEventListener('click', () => {
                const isHidden = content.style.display === 'none';
                content.style.display = isHidden ? 'block' : 'none';
                const arrow = header.querySelector('.toggle-arrow');
                if (arrow) arrow.textContent = isHidden ? '▲' : '▼';
                this.resizeCanvas();
            });
            collisionInfoDiv.appendChild(header);
            collisionInfoDiv.appendChild(content);
            const statsDiv = visualizationDiv.querySelector('.stats');
            if (statsDiv) {
                 statsDiv.parentNode.insertBefore(collisionInfoDiv, statsDiv.nextSibling);
            } else {
                visualizationDiv.appendChild(collisionInfoDiv);
            }
             console.log("Div #collision-info criada.");
        }
        const collisionCountSpan = document.getElementById('collision-count');
        const collisionContentDiv = document.getElementById('collision-content');
        if (!collisionCountSpan || !collisionContentDiv) {
             console.warn("Elementos do info de colisão (span#collision-count ou div#collision-content) não encontrados.");
             return;
        }
        const numCollisions = this.collisions ? this.collisions.length : 0;
        collisionCountSpan.textContent = numCollisions; 
        collisionContentDiv.innerHTML = ''; 
        if (numCollisions > 0) {
            const list = document.createElement('ul');
            const maxCollisionsToShow = 50; 
            for (let i = 0; i < Math.min(numCollisions, maxCollisionsToShow); i++) {
                const collision = this.collisions[i];
                 if (collision && collision.tile1Index !== undefined && collision.tile2Index !== undefined && typeof collision.distance === 'number') {
                     const item = document.createElement('li');
                     item.textContent = `Tile ${collision.tile1Index + 1} e Tile ${collision.tile2Index + 1} (Dist. Centros: ${collision.distance.toFixed(3)}m)`;
                     list.appendChild(item);
                 } else {
                     console.warn("Dados de colisão inválidos encontrados:", collision);
                 }
            }
            if (numCollisions > maxCollisionsToShow) {
                const item = document.createElement('li');
                item.style.fontStyle = 'italic';
                item.textContent = `... e mais ${numCollisions - maxCollisionsToShow} colisões.`;
                list.appendChild(item);
            }
            collisionContentDiv.appendChild(list); 
        } else {
            collisionContentDiv.textContent = 'Nenhuma colisão detectada com a configuração atual.';
        }
    }

    getLayout() { return this.currentLayout; }
    getAllAntennas() { return this.allAntennas; }
    getCollisions() { return this.collisions; }

    downloadLayoutImage() {
        console.log("Iniciando processo de download da imagem do layout (PNG)...");
        if (!this.canvas || !this.imageThemeRadios || !this.imageAxesRadios ) {
             console.error("Componentes essenciais para download da imagem não encontrados.");
             alert("Erro: Opções de download da imagem não configuradas corretamente.");
             return;
        }

        let selectedTheme = 'light';
        try { selectedTheme = document.querySelector('input[name="imageTheme"]:checked')?.value || 'light'; } catch (e) { console.warn("Não foi possível ler o tema selecionado.", e); }
        
        let includeAxes = true;
        try { includeAxes = document.querySelector('input[name="imageAxes"]:checked')?.value === 'yes'; } catch (e) { console.warn("Não foi possível ler a opção de eixos.", e); }

        const selectedFormat = 'png';
        const fileExtension = 'png';
        const mimeType = 'image/png';

        const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
        const needsThemeChange = currentTheme !== selectedTheme;

        const downloadButton = this.downloadImageBtn;
        if(downloadButton) {
            downloadButton.disabled = true;
            downloadButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Preparando...';
        }

        const restoreState = () => {
            if (needsThemeChange) {
                console.log(`Restaurando tema da página para "${currentTheme}".`);
                if (currentTheme === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
                else document.documentElement.removeAttribute('data-theme');
                this.drawLayout();
            }
             if(downloadButton) {
                 downloadButton.disabled = false;
                 downloadButton.innerHTML = `<i class="fas fa-camera"></i> Baixar Imagem`;
             }
             console.log("Processo de download da imagem finalizado, estado restaurado.");
        };

        const generateAndDownload = () => {
            try {
                this.drawLayout(includeAxes); 

                setTimeout(() => {
                    try {
                        const dataURL = this.canvas.toDataURL(mimeType);
                        const link = document.createElement('a');
                        link.href = dataURL;
                        link.download = `bingo_layout_${this.layoutType}_${selectedTheme}${includeAxes ? '_com_eixos' : '_sem_eixos'}.${fileExtension}`;
                        document.body.appendChild(link);
                        link.click();
                        document.body.removeChild(link);
                        console.log(`Download da imagem como ${fileExtension.toUpperCase()} acionado.`);
                    } catch (downloadError) {
                         console.error("Erro ao gerar URL de dados ou acionar download:", downloadError);
                         alert("Ocorreu um erro ao preparar ou iniciar o download da imagem.");
                    } finally {
                        restoreState();
                    }
                }, 100);
            } catch(drawError) {
                console.error("Erro durante o redesenho para download:", drawError);
                alert("Ocorreu um erro durante o redesenho da imagem para download.");
                restoreState();
            }
        };

        if (needsThemeChange) {
            console.log(`Mudando tema temporariamente para "${selectedTheme}" para gerar imagem.`);
            if (selectedTheme === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
            else document.documentElement.removeAttribute('data-theme');
            setTimeout(generateAndDownload, 150);
        } else {
            generateAndDownload();
        }
    }
} 

if (typeof window !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
       try {
           if (!window.antennaGenerator) {
               window.antennaGenerator = new AntennaLayoutGenerator();
               console.log("Instância de AntennaLayoutGenerator criada.");
           }
       } catch (error) {
           console.error("Erro ao instanciar AntennaLayoutGenerator:", error);
           alert("Erro crítico ao inicializar o gerador de layout. Verifique o console.");
       }
   });
} else {
     console.warn("generator.js: Ambiente não-navegador detectado. Instância de AntennaLayoutGenerator não foi criada.");
}