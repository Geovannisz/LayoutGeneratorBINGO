/**
 * Módulo para geração e visualização de layouts de antenas BINGO.
 * Utiliza a biblioteca BingoLayouts (bingo_layouts.js) e desenha
 * os resultados em um canvas HTML. Permite ajustar parâmetros
 * dinamicamente com sliders e visualizar colisões.
 * Redesenha automaticamente ao mudar o tema.
 */

// === Constantes Globais ===

// Dimensões físicas do Tile (usadas como referência de escala)
const TILE_WIDTH = 0.35;  // Largura física do tile em METROS
const TILE_HEIGHT = 1.34; // Altura física do tile em METROS
const ANTENNAS_PER_TILE = 64; // Número de antenas por tile

// Layout Interno do Tile (losangos 2x8 de 4 antenas)
const SUBGROUP_N = 2; // Número de centros internos na direção X
const SUBGROUP_M = 8; // Número de centros internos na direção Y
const SUBGROUP_DX = 0.1760695885; // Espaçamento X dos centros INTERNOS do tile em METROS
const SUBGROUP_DY = 0.1675843071; // Espaçamento Y dos centros INTERNOS do tile em METROS
const DIAMOND_OFFSET = 0.05; // "Raio" do losango/diamante interno em METROS

// Parâmetros Padrão para cada tipo de layout (usados como fallback e estado inicial)
const DEFAULT_PARAMS = {
    grid: {
        numCols: 12, 
        numRows: 3, 
        spacingXFactor: 1.0, 
        spacingYFactor: 1.0,
        centerExpScaleFactor: 1.0, 
        randomOffsetStddevM: 0.0, 
        minSeparationFactor: 1.0
    },
    spiral: {
        numArms: 3, 
        tilesPerArm: 12, 
        radiusStartFactor: 0.7, 
        radiusStepFactor: 0.3, 
        centerExpScaleFactor: 1.0, 
        angleStepRad: Math.PI / 9, 
        armOffsetRad: 0.0, 
        rotationPerArmRad: 0.0, 
        randomOffsetStddevM: 0.0, 
        minSeparationFactor: 1.0, 
        includeCenterTile: false
    },
    ring: {
        numRings: 3, 
        tilesPerRing: [8, 16, 24], 
        radiusStartFactor: 1.0, 
        radiusStepFactor: 1.0, 
        centerExpScaleFactor: 1.0, 
        angleOffsetRad: 0.0,
        randomOffsetStddevM: 0.0, 
        minSeparationFactor: 1.0, 
        addCenterTile: false
    },
    rhombus: {
        numRowsHalf: 6, 
        sideLengthFactor: 0.65, 
        hCompressFactor: 0.778,
        vCompressFactor: 0.86, 
        centerExpScaleFactor: 1.0, 
        randomOffsetStddevM: 0.0, 
        minSeparationFactor: 1.0
    },
    hex_grid: {
        numRingsHex: 3, 
        spacingFactor: 0.8, 
        centerExpScaleFactor: 1.0, 
        addCenterTile: true, 
        randomOffsetStddevM: 0.0, 
        minSeparationFactor: 1.0
    },
    phyllotaxis: {
        numTiles: 50, 
        scaleFactor: 0.6, 
        centerOffsetFactor: 0.25, 
        centerExpScaleFactor: 1.0, 
        randomOffsetStddevM: 0.0, 
        minSeparationFactor: 1.0
    },
    manual_circular: {
        spacingXFactor: 1.0, 
        spacingYFactor: 1.0, 
        centerExpScaleFactor: 1.0, 
        randomOffsetStddevM: 0.0, 
        minSeparationFactor: 1.0
    },
    random: {
        numTiles: 36, 
        maxRadiusM: 4.0, 
        minSeparationFactor: 1.0
    }
};

// Mapeamento de Parâmetros para Controles da Interface
const PARAM_CONTROLS = {
    // --- Grid ---
    grid: [
        { id: 'numCols', label: 'Número de Colunas', type: 'number', min: 1, max: 20, step: 1 },
        { id: 'numRows', label: 'Número de Linhas', type: 'number', min: 1, max: 20, step: 1 },
        // { id: 'spacingMode', ... removido }
        { id: 'spacingXFactor', label: 'Fator Espaç. X', type: 'number', min: 0.1, max: 5, step: 0.1 /* condition removida */ },
        { id: 'spacingYFactor', label: 'Fator Espaç. Y', type: 'number', min: 0.1, max: 5, step: 0.1 /* condition removida */ },
        { id: 'centerExpScaleFactor', label: 'Fator Exp. Central', type: 'number', min: 0.5, max: 3, step: 0.05 /* condition removida */ },
        { id: 'randomOffsetStddevM', label: 'Offset Aleatório (m)', type: 'number', min: 0, max: 1, step: 0.01 },
        { id: 'minSeparationFactor', label: 'Fator Sep. Mín.', type: 'number', min: 0.5, max: 2, step: 0.05, condition: 'this.params.randomOffsetStddevM > 0' }
    ],
    // --- Espiral ---
    spiral: [
        { id: 'numArms', label: 'Número de Braços', type: 'number', min: 1, max: 12, step: 1 },
        { id: 'tilesPerArm', label: 'Tiles por Braço', type: 'number', min: 1, max: 30, step: 1 },
        // { id: 'armSpacingMode', ... removido }
        // { id: 'centerScaleMode', ... removido }
        { id: 'radiusStartFactor', label: 'Fator Raio Inicial', type: 'number', min: 0.1, max: 5, step: 0.1 },
        { id: 'radiusStepFactor', label: 'Fator Passo Raio Lin.', type: 'number', min: 0.1, max: 2, step: 0.05 }, // Label indica que é linear antes do exp
        { id: 'centerExpScaleFactor', label: 'Fator Exp. Central', type: 'number', min: 0.5, max: 3, step: 0.05 /* condition removida */ },
        { id: 'angleStepRad', label: 'Passo Angular (rad)', type: 'number', min: 0.01, max: Math.PI.toFixed(3), step: 0.01 },
        { id: 'includeCenterTile', label: 'Incluir Tile Central', type: 'checkbox' },
        { id: 'randomOffsetStddevM', label: 'Offset Aleatório (m)', type: 'number', min: 0, max: 1, step: 0.01 },
        { id: 'minSeparationFactor', label: 'Fator Sep. Mín.', type: 'number', min: 0.5, max: 2, step: 0.05, condition: 'this.params.randomOffsetStddevM > 0' }
    ],
     // --- Anéis ---
     ring: [
        { id: 'numRings', label: 'Número de Anéis', type: 'number', min: 1, max: 10, step: 1 },
        // { id: 'ringSpacingMode', ... removido }
        // { id: 'centerScaleMode', ... removido }
        { id: 'radiusStartFactor', label: 'Fator Raio Inicial', type: 'number', min: 0.1, max: 5, step: 0.1 },
        { id: 'radiusStepFactor', label: 'Fator Passo Raio Lin.', type: 'number', min: 0.1, max: 2, step: 0.05 }, // Label indica que é linear antes do exp
        { id: 'centerExpScaleFactor', label: 'Fator Exp. Central', type: 'number', min: 0.5, max: 3, step: 0.05 /* condition removida */ },
        { id: 'addCenterTile', label: 'Adicionar Tile Central', type: 'checkbox' },
        { id: 'randomOffsetStddevM', label: 'Offset Aleatório (m)', type: 'number', min: 0, max: 1, step: 0.01 },
        { id: 'minSeparationFactor', label: 'Fator Sep. Mín.', type: 'number', min: 0.5, max: 2, step: 0.05, condition: 'this.params.randomOffsetStddevM > 0' }
    ],
    // --- Losango ---
    rhombus: [
        { id: 'numRowsHalf', label: 'Metade Linhas', type: 'number', min: 1, max: 15, step: 1 },
        // { id: 'spacingMode', ... removido }
        { id: 'sideLengthFactor', label: 'Fator Lado Célula', type: 'number', min: 0.1, max: 5, step: 0.05 },
        { id: 'hCompressFactor', label: 'Compressão Horiz.', type: 'number', min: 0.1, max: 5, step: 0.1 },
        { id: 'vCompressFactor', label: 'Compressão Vert.', type: 'number', min: 0.1, max: 5, step: 0.1 },
        { id: 'centerExpScaleFactor', label: 'Fator Exp. Central', type: 'number', min: 0.5, max: 3, step: 0.05 /* condition removida */ },
        { id: 'randomOffsetStddevM', label: 'Offset Aleatório (m)', type: 'number', min: 0, max: 1, step: 0.01 },
        { id: 'minSeparationFactor', label: 'Fator Sep. Mín.', type: 'number', min: 0.5, max: 2, step: 0.05, condition: 'this.params.randomOffsetStddevM > 0' }
    ],
     // --- Grade Hexagonal ---
     hex_grid: [
        { id: 'numRingsHex', label: 'Nº Anéis Hex.', type: 'number', min: 0, max: 10, step: 1 },
        // { id: 'spacingMode', ... removido }
        { id: 'spacingFactor', label: 'Fator Espaçamento', type: 'number', min: 0.1, max: 5, step: 0.1 },
        { id: 'centerExpScaleFactor', label: 'Fator Exp. Central', type: 'number', min: 0.5, max: 3, step: 0.05 /* condition removida */ },
        { id: 'addCenterTile', label: 'Adicionar Tile Central', type: 'checkbox' },
        { id: 'randomOffsetStddevM', label: 'Offset Aleatório (m)', type: 'number', min: 0, max: 1, step: 0.01 },
        { id: 'minSeparationFactor', label: 'Fator Sep. Mín.', type: 'number', min: 0.5, max: 2, step: 0.05, condition: 'this.params.randomOffsetStddevM > 0' }
    ],
    // --- Phyllotaxis ---
    phyllotaxis: [
        { id: 'numTiles', label: 'Número de Tiles', type: 'number', min: 1, max: 200, step: 1 },
        // { id: 'spacingMode', ... removido }
        { id: 'scaleFactor', label: 'Fator de Escala', type: 'number', min: 0.1, max: 5, step: 0.1 },
        { id: 'centerOffsetFactor', label: 'Fator Offset Central', type: 'number', min: 0.01, max: 1, step: 0.01 },
        { id: 'centerExpScaleFactor', label: 'Fator Exp. Central', type: 'number', min: 0.5, max: 3, step: 0.05 /* condition removida */ },
        { id: 'randomOffsetStddevM', label: 'Offset Aleatório (m)', type: 'number', min: 0, max: 1, step: 0.01 },
        { id: 'minSeparationFactor', label: 'Fator Sep. Mín.', type: 'number', min: 0.5, max: 2, step: 0.05, condition: 'this.params.randomOffsetStddevM > 0' }
    ],
    // --- Circular Manual ---
    manual_circular: [
        // { id: 'spacingMode', ... removido }
        { id: 'spacingXFactor', label: 'Fator Espaç. X', type: 'number', min: 0.1, max: 5, step: 0.1 /* condition removida */ },
        { id: 'spacingYFactor', label: 'Fator Espaç. Y', type: 'number', min: 0.1, max: 5, step: 0.1 /* condition removida */ },
        { id: 'centerExpScaleFactor', label: 'Fator Exp. Central', type: 'number', min: 0.5, max: 3, step: 0.05 /* condition removida */ },
        { id: 'randomOffsetStddevM', label: 'Offset Aleatório (m)', type: 'number', min: 0, max: 1, step: 0.01 },
        { id: 'minSeparationFactor', label: 'Fator Sep. Mín.', type: 'number', min: 0.5, max: 2, step: 0.05, condition: 'this.params.randomOffsetStddevM > 0' }
    ],
    // --- Aleatório ---
    random: [ // Sem alterações aqui
        { id: 'numTiles', label: 'Número de Tiles', type: 'number', min: 1, max: 200, step: 1 },
        { id: 'maxRadiusM', label: 'Raio Máximo (m)', type: 'number', min: 1, max: 50, step: 1 },
        { id: 'minSeparationFactor', label: 'Fator Sep. Mín.', type: 'number', min: 0.5, max: 2, step: 0.05 }
    ]
};

// === Classe Principal do Gerador ===
class AntennaLayoutGenerator {
    /**
     * Construtor da classe. Inicializa o canvas, os parâmetros,
     * os controles da interface e gera o layout inicial.
     */
    constructor() {
        this.canvas = document.getElementById('layout-canvas');
        if (!this.canvas) {
            console.error("Erro Fatal: Elemento canvas#layout-canvas não encontrado!");
            alert("Erro: Canvas de visualização não encontrado. A aplicação não pode continuar.");
            return; // Impede a continuação se o canvas não existe
        }
        this.ctx = this.canvas.getContext('2d');
        this.layoutType = document.getElementById('layout-type')?.value || 'grid'; // Lê o valor inicial do select
        this.params = JSON.parse(JSON.stringify(DEFAULT_PARAMS[this.layoutType])); // Cópia profunda dos params padrão
        this.currentLayout = []; // Armazena os centros [x,y] dos tiles
        this.allAntennas = []; // Armazena as coordenadas [x,y] de todas as antenas individuais
        // Define o estado interno padrão como true
        this.showCollisions = true;
        // Encontra o elemento checkbox no DOM
        const showCollisionsCheckbox = document.getElementById('show-collisions');
        // Se o elemento existir, define seu estado 'checked' para corresponder ao padrão
        if (showCollisionsCheckbox) {
            showCollisionsCheckbox.checked = this.showCollisions;
        } else {
            console.warn("Elemento input#show-collisions não encontrado durante inicialização.");
        }
        this.collisions = []; // Armazena informações sobre colisões detectadas

        // Ajusta o tamanho do canvas e adiciona listener para redimensionamento
        this.resizeCanvas(); // Call initial resize
        window.addEventListener('resize', () => this.resizeCanvas());

        // Inicializa os controles da interface (dropdown, inputs dinâmicos, botões)
        // e adiciona o listener para atualização de tema
        this.initControls();

        // O layout inicial será gerado por main.js após a inicialização completa
    }

    /**
     * Redimensiona o canvas para preencher seu contêiner pai
     * e redesenha o layout atual, se houver.
     * A função preserva o aspect ratio do CONTEÚDO, não necessariamente do canvas em si,
     * ajustando a escala para caber na menor dimensão disponível.
     */
    resizeCanvas() {
        const container = this.canvas.parentElement; // The '.visualization' div
        if (container) {
            // Get container dimensions EXCLUDING padding/border if box-sizing is border-box (default for most frameworks)
            const style = getComputedStyle(container);
            const containerWidth = container.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
            const containerHeight = container.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);

            // Consider the height of the stats div below the canvas
            const statsDiv = container.querySelector('.stats');
            const statsHeight = statsDiv ? statsDiv.offsetHeight : 0;
            const collisionInfoDiv = container.querySelector('.collision-info'); // Also consider collision info height if visible
            const collisionInfoHeight = collisionInfoDiv ? collisionInfoDiv.offsetHeight : 0;

            // Calculate available height for the canvas itself
            const availableHeight = containerHeight - statsHeight - collisionInfoHeight;

             // Define um tamanho mínimo para evitar colapso
             const minWidth = 200;
             const minHeight = 150; // Reduced min height slightly

            // Set canvas dimensions (actual pixels)
            this.canvas.width = Math.max(containerWidth, minWidth);
            // Adjust height calculation: use availableHeight
            this.canvas.height = Math.max(availableHeight, minHeight);

            // Log dimensions for debugging
            // console.log(`Canvas resized to: ${this.canvas.width}x${this.canvas.height}`);
            // console.log(`Container: ${container.clientWidth}x${container.clientHeight}, Stats: ${statsHeight}, Collision: ${collisionInfoHeight}, Available: ${availableHeight}`);


        } else {
             // Fallback se o container não for encontrado
             this.canvas.width = 400;
             this.canvas.height = 350; // Adjusted fallback height
             console.warn("'.visualization' container not found, using fallback canvas size.");
        }

        // Redesenha o layout após redimensionar
        // Add a small delay to allow the browser to reflow, might help with zoom issues
        // setTimeout(() => this.drawLayout(), 50);
        this.drawLayout();
    }

    /**
     * Inicializa os elementos de controle da interface e adiciona
     * os event listeners necessários (mudança de tipo, botões, etc.).
     * Também adiciona o listener para o evento 'themeChanged'.
     */
    initControls() {
        const layoutTypeSelect = document.getElementById('layout-type');
        const generateBtn = document.getElementById('generate-btn');
        const randomBtn = document.getElementById('random-btn');
        const showCollisionsCheckbox = document.getElementById('show-collisions');

        // --- Listeners ---
        if (layoutTypeSelect) {
            layoutTypeSelect.addEventListener('change', () => {
                this.layoutType = layoutTypeSelect.value;
                // Reseta os parâmetros para os padrões do novo tipo selecionado
                this.params = JSON.parse(JSON.stringify(DEFAULT_PARAMS[this.layoutType]));
                this.updateDynamicControls(); // Recria os controles para o novo tipo
                this.generateLayout(); // Gera e desenha o novo layout
            });
        } else { console.error("Elemento select#layout-type não encontrado."); }

        if (generateBtn) {
            generateBtn.addEventListener('click', () => this.generateLayout());
        } else { console.error("Elemento button#generate-btn não encontrado."); }

        if (randomBtn) {
            randomBtn.addEventListener('click', () => this.generateRandomLayout());
        } else { console.error("Elemento button#random-btn não encontrado."); }

        if (showCollisionsCheckbox) {
            showCollisionsCheckbox.addEventListener('change', () => {
                this.showCollisions = showCollisionsCheckbox.checked;
                this.drawLayout(); // Redesenha para mostrar/ocultar colisões
            });
        } else { console.warn("Elemento input#show-collisions não encontrado."); }

        // Listener para redesenhar o canvas quando o tema mudar (evento disparado por main.js)
        // MOVED TO main.js setupThemeChangeListener() for better control flow after initialization

        // Inicializa os controles dinâmicos para o tipo de layout padrão carregado
        this.updateDynamicControls();
    }

    /**
     * Atualiza a seção de parâmetros dinâmicos na interface com base
     * no tipo de layout atualmente selecionado (this.layoutType).
     * Cria labels e inputs/selects/checkboxes/sliders correspondentes.
     */
    updateDynamicControls() {
        const dynamicParamsDiv = document.getElementById('dynamic-params');
        if (!dynamicParamsDiv) {
             console.error("Elemento div#dynamic-params não encontrado. Controles dinâmicos não podem ser criados.");
             return;
        }
        dynamicParamsDiv.innerHTML = ''; // Limpa controles antigos

        const controls = PARAM_CONTROLS[this.layoutType];
        if (!controls) {
             console.warn(`Nenhuma definição de controle encontrada para o tipo de layout: ${this.layoutType}`);
             return;
        }

        // Itera sobre cada definição de controle
        controls.forEach(control => {
            // Verifica se o controle tem uma condição para ser exibido
            let shouldShowControl = true;
            if (control.condition) {
                 shouldShowControl = this.evaluateCondition(control.condition);
            }

            if (shouldShowControl) {
                // Cria os elementos HTML para o controle
                const formGroup = document.createElement('div');
                formGroup.className = 'form-group'; // Classe base

                const label = document.createElement('label');
                label.setAttribute('for', control.id); // Associa label ao primeiro input (slider ou outro)
                label.textContent = control.label + ':';
                formGroup.appendChild(label);

                let inputElement; // O elemento <input>, <select> ou <textarea>

                // Cria o tipo correto de elemento de input
                switch (control.type) {
                    case 'select':
                        inputElement = document.createElement('select');
                        inputElement.id = control.id;
                        inputElement.name = control.id;
                        control.options.forEach(option => {
                            const optionElement = document.createElement('option');
                            optionElement.value = option.value;
                            optionElement.textContent = option.label;
                            if (String(this.params[control.id]) === String(option.value)) {
                                optionElement.selected = true;
                            }
                            inputElement.appendChild(optionElement);
                        });
                        // Listener para select
                        inputElement.addEventListener('change', () => {
                            this.params[control.id] = inputElement.value;
                            this.updateDynamicControls(); // Recria controles dependentes
                            this.generateLayout();
                        });
                        formGroup.appendChild(inputElement); // Adiciona diretamente ao formGroup
                        break;

                    case 'checkbox':
                        inputElement = document.createElement('input');
                        inputElement.type = 'checkbox';
                        inputElement.id = control.id;
                        inputElement.name = control.id;
                        inputElement.checked = this.params[control.id] || false;
                         // Envolve checkbox em um container para melhor alinhamento se necessário
                         const checkboxContainer = document.createElement('div');
                         checkboxContainer.style.display = 'flex';
                         checkboxContainer.style.alignItems = 'center';
                         checkboxContainer.appendChild(inputElement);
                         // Listener para checkbox
                         inputElement.addEventListener('change', () => {
                            this.params[control.id] = inputElement.checked;
                             this.updateDynamicControls(); // Recria controles dependentes
                            this.generateLayout();
                        });
                         formGroup.appendChild(checkboxContainer); // Adiciona container ao formGroup
                        break;

                    case 'number':
                         // Cria um container para o slider e o input numérico
                         const sliderGroup = document.createElement('div');
                         sliderGroup.className = 'slider-group'; // Classe para estilização CSS

                         // Cria o Slider (range input)
                         const sliderInput = document.createElement('input');
                         sliderInput.type = 'range';
                         sliderInput.id = control.id + '-slider'; // ID único para o slider
                         sliderInput.name = control.id + '-slider';
                         sliderInput.value = this.params[control.id];
                         if (control.min !== undefined) sliderInput.min = control.min;
                         if (control.max !== undefined) sliderInput.max = control.max;
                         if (control.step !== undefined) sliderInput.step = control.step;
                         sliderGroup.appendChild(sliderInput);

                         // Cria o Input Numérico (para display e entrada)
                         const numberInput = document.createElement('input');
                         numberInput.type = 'number';
                         numberInput.id = control.id; // ID original para label e acesso
                         numberInput.name = control.id;
                         numberInput.value = this.params[control.id];
                          if (control.min !== undefined) numberInput.min = control.min;
                          if (control.max !== undefined) numberInput.max = control.max;
                          if (control.step !== undefined) numberInput.step = control.step;
                         sliderGroup.appendChild(numberInput);

                         // Listener para o Slider ('input' para atualização em tempo real)
                         sliderInput.addEventListener('input', () => {
                             const value = parseFloat(sliderInput.value);
                             numberInput.value = value; // Atualiza o display numérico
                             this.params[control.id] = value; // Atualiza o parâmetro real
                             this.generateLayout(); // Gera layout em tempo real
                         });

                          // Listener para o Input Numérico ('input' para tempo real, 'change' para validação final)
                         numberInput.addEventListener('input', () => {
                             let value = parseFloat(numberInput.value);
                             if (!isNaN(value)) {
                                  // Garante que o valor esteja dentro dos limites do slider/controle
                                 if (control.min !== undefined) value = Math.max(control.min, value);
                                 if (control.max !== undefined) value = Math.min(control.max, value);
                                 sliderInput.value = value; // Atualiza a posição do slider
                                 this.params[control.id] = value; // Atualiza o parâmetro real
                                 this.generateLayout();
                             }
                             // Se for inválido (e.g., vazio), não faz nada no 'input', espera 'change'
                         });

                         numberInput.addEventListener('change', () => {
                              // Evento 'change' dispara ao perder foco ou pressionar Enter
                             let value = parseFloat(numberInput.value);
                              if (isNaN(value)) {
                                   // Reverte para o valor padrão ou último válido se inválido
                                   console.warn(`Valor inválido para ${control.id}: ${numberInput.value}. Revertendo.`);
                                   value = parseFloat(sliderInput.value); // Usa o valor atual do slider como fallback
                                   numberInput.value = value;
                              }
                              // Garante limites novamente no 'change'
                              if (control.min !== undefined) value = Math.max(control.min, value);
                              if (control.max !== undefined) value = Math.min(control.max, value);

                              numberInput.value = value; // Atualiza UI com valor validado/corrigido
                              sliderInput.value = value; // Sincroniza slider
                              this.params[control.id] = value; // Atualiza parâmetro
                              // Não precisa chamar generateLayout() aqui se já foi chamado no 'input'
                              // Mas é bom para garantir que as condições sejam reavaliadas
                              this.updateDynamicControls();
                              // Certifica que o layout final está correto
                              this.generateLayout();
                         });


                         formGroup.appendChild(sliderGroup); // Adiciona o grupo slider+número ao formGroup
                        break;

                    // Adicione outros tipos de controle aqui se necessário
                    default:
                        console.warn(`Tipo de controle não tratado: ${control.type} para ${control.id}`);
                        break;
                }

                // Adiciona o formGroup (label + controles) à div principal
                dynamicParamsDiv.appendChild(formGroup);
             } // Fim do if (shouldShowControl)
        }); // Fim do forEach(control)
    }


    /**
     * Avalia uma string de condição para determinar se um controle deve ser exibido.
     * Substitui nomes de parâmetros na string pelos seus valores atuais (this.params).
     * @param {string} condition A string de condição (ex: 'this.params.spacingMode === "center_exponential"').
     * @returns {boolean} True se a condição for verdadeira, False caso contrário.
     */
    evaluateCondition(condition) {
        // Adiciona "this.params." se não estiver presente para simplificar as definições em PARAM_CONTROLS
        const fullCondition = condition.replace(/(\b)([a-zA-Z_]\w*)(\b)/g, (match, p1, p2, p3) => {
             // Verifica se p2 é uma chave direta em this.params
             if (this.params.hasOwnProperty(p2)) {
                 return `${p1}this.params.${p2}${p3}`;
             }
             // Mantém identificadores como 'Math', 'true', 'false', números, etc.
             if (['true', 'false', 'Math', 'null', 'undefined'].includes(p2) || !isNaN(p2)) {
                return match;
             }
             // Assume que é uma propriedade de this.params se não for palavra reservada/número
             return `${p1}this.params.${p2}${p3}`;
        });


        try {
            // Cria uma função anônima no escopo da classe (this é acessível)
            // 'use strict'; // Ajuda a pegar erros
            const evaluator = new Function(`return (${fullCondition});`);
             // Chama a função ligada ao 'this' da instância atual
            return evaluator.call(this);
        } catch (e) {
            // Loga erro se a condição for inválida
            console.error(`Erro ao avaliar condição "${condition}" (interpretada como "${fullCondition}"):`, e);
            return true; // Em caso de erro, mostra o controle por precaução
        }
    }


    /**
     * Cria o layout interno de um único tile com 64 antenas (losangos).
     * Retorna as coordenadas [x,y] relativas ao centro do tile (centerX, centerY).
     * @param {number} centerX Coordenada X do centro do tile.
     * @param {number} centerY Coordenada Y do centro do tile.
     * @returns {Array<Array<number>>} Lista das coordenadas [x,y] das 64 antenas.
     */
    createTileLayout64Antennas(centerX, centerY) {
        const antennas = [];
        const subgroupCenters = [];

        // 1. Gera os 16 centros internos (grid SUBGROUP_N x SUBGROUP_M) relativos ao centro do tile
        for (let i = 0; i < SUBGROUP_N; i++) {
            const offsetX = (i - (SUBGROUP_N - 1) / 2.0) * SUBGROUP_DX;
            for (let j = 0; j < SUBGROUP_M; j++) {
                const offsetY = (j - (SUBGROUP_M - 1) / 2.0) * SUBGROUP_DY;
                subgroupCenters.push([centerX + offsetX, centerY + offsetY]);
            }
        }

        // 2. Para cada centro interno, gera os 4 pontos do losango
        const offsets = [
            [0, DIAMOND_OFFSET], [DIAMOND_OFFSET, 0],
            [0, -DIAMOND_OFFSET], [-DIAMOND_OFFSET, 0]
        ];
        for (const center of subgroupCenters) {
            for (const offset of offsets) {
                antennas.push([center[0] + offset[0], center[1] + offset[1]]);
            }
        }
        return antennas; // Retorna as 64 posições absolutas
    }

    /**
     * Gera o layout dos centros dos tiles usando a função apropriada
     * da biblioteca BingoLayouts e os parâmetros atuais da interface.
     * Atualiza this.currentLayout e this.allAntennas.
     */
    generateLayout() {
        // Parâmetros comuns passados para todas as funções da biblioteca
        const commonParams = {
            tileWidthM: TILE_WIDTH,
            tileHeightM: TILE_HEIGHT,
            centerLayout: true // A biblioteca deve centralizar os centros dos tiles
        };

        // Sanitiza e combina parâmetros atuais com os comuns
        const currentParamsSanitized = {};
        const controlsForType = PARAM_CONTROLS[this.layoutType] || [];
        for (const key in this.params) {
             // Apenas inclui parâmetros que são definidos para o tipo atual
            const controlDef = controlsForType.find(c => c.id === key);
             if (controlDef) { // Só processa se for um controle definido para este tipo
                if (controlDef.type === 'number') {
                    // Garante que números sejam realmente números
                     const parsedValue = parseFloat(this.params[key]);
                     // Usa o valor padrão do TIPO ATUAL se não for um número válido
                     currentParamsSanitized[key] = isNaN(parsedValue) ? DEFAULT_PARAMS[this.layoutType][key] : parsedValue;
                } else if (controlDef.type === 'checkbox') {
                     // Garante que checkboxes sejam booleanos
                     currentParamsSanitized[key] = Boolean(this.params[key]);
                 } else {
                     // Mantém outros tipos (select) como estão
                     currentParamsSanitized[key] = this.params[key];
                 }
             }
        }

        // Combina parâmetros sanitizados com os comuns
        const fullParams = { ...currentParamsSanitized, ...commonParams };

        // Tratamento especial para 'tilesPerRing' no layout de Anéis
        if (this.layoutType === 'ring' && typeof fullParams.numRings === 'number' && fullParams.numRings > 0) {
             // Tenta usar o valor de this.params se existir e for array, senão gera padrão
             let tilesPerRingArray = this.params.tilesPerRing;
            if (!Array.isArray(tilesPerRingArray) || tilesPerRingArray.length !== fullParams.numRings) {
                 tilesPerRingArray = Array.from({ length: fullParams.numRings }, (_, i) => 8 * (i + 1));
                 console.log(`Gerador: 'tilesPerRing' recriado para ${fullParams.numRings} anéis:`, tilesPerRingArray);
                 // Atualiza this.params para refletir a mudança (útil se for randomizado)
                 this.params.tilesPerRing = [...tilesPerRingArray];
            }
             // Garante que os valores no array sejam números inteiros positivos
            fullParams.tilesPerRing = tilesPerRingArray.map(n => Math.max(1, parseInt(n) || 8));
        }


        // Chama a função da biblioteca BingoLayouts correspondente ao tipo selecionado
        try {
            if (!window.BingoLayouts) {
                throw new Error("Biblioteca BingoLayouts não está carregada ou disponível.");
            }

            // Usa um switch para chamar a função correta com os parâmetros corretos
            // Passa os parâmetros explicitamente conforme a assinatura de cada função
            switch (this.layoutType) {
                case 'grid':
                    this.currentLayout = window.BingoLayouts.createGridLayout(
                        fullParams.numCols, fullParams.numRows, fullParams.tileWidthM, fullParams.tileHeightM,
                        /* spacingMode removido */ fullParams.spacingXFactor, fullParams.spacingYFactor,
                        fullParams.centerExpScaleFactor, fullParams.randomOffsetStddevM, fullParams.minSeparationFactor,
                        undefined, fullParams.centerLayout
                    );
                    break;
                case 'spiral':
                    this.currentLayout = window.BingoLayouts.createSpiralLayout(
                        fullParams.numArms, fullParams.tilesPerArm, fullParams.tileWidthM, fullParams.tileHeightM,
                        /* armSpacingMode, centerScaleMode removidos */ fullParams.radiusStartFactor,
                        fullParams.radiusStepFactor, fullParams.centerExpScaleFactor, fullParams.angleStepRad,
                        fullParams.armOffsetRad, fullParams.rotationPerArmRad, fullParams.randomOffsetStddevM,
                        fullParams.minSeparationFactor, undefined, fullParams.centerLayout,
                        fullParams.includeCenterTile
                    );
                    break;
                case 'ring':
                    this.currentLayout = window.BingoLayouts.createRingLayout(
                        fullParams.numRings, fullParams.tilesPerRing, fullParams.tileWidthM, fullParams.tileHeightM,
                        /* ringSpacingMode, centerScaleMode removidos */ fullParams.radiusStartFactor,
                        fullParams.radiusStepFactor, fullParams.centerExpScaleFactor, fullParams.angleOffsetRad,
                        fullParams.randomOffsetStddevM, fullParams.minSeparationFactor,
                        undefined, fullParams.centerLayout, fullParams.addCenterTile
                    );
                    break;
                case 'rhombus':
                    this.currentLayout = window.BingoLayouts.createRhombusLayout(
                        fullParams.numRowsHalf, fullParams.tileWidthM, fullParams.tileHeightM, /* spacingMode removido */
                        fullParams.sideLengthFactor, fullParams.hCompressFactor, fullParams.vCompressFactor,
                        fullParams.centerExpScaleFactor, fullParams.randomOffsetStddevM, fullParams.minSeparationFactor,
                        undefined, fullParams.centerLayout
                    );
                    break;
                case 'hex_grid':
                    this.currentLayout = window.BingoLayouts.createHexGridLayout(
                        fullParams.numRingsHex, fullParams.tileWidthM, fullParams.tileHeightM, /* spacingMode removido */
                        fullParams.spacingFactor, fullParams.centerExpScaleFactor, fullParams.addCenterTile,
                        fullParams.randomOffsetStddevM, fullParams.minSeparationFactor,
                        undefined, fullParams.centerLayout
                    );
                     break;
                case 'phyllotaxis':
                     this.currentLayout = window.BingoLayouts.createPhyllotaxisLayout(
                        fullParams.numTiles, fullParams.tileWidthM, fullParams.tileHeightM, /* spacingMode removido */
                        fullParams.scaleFactor, fullParams.centerOffsetFactor, fullParams.centerExpScaleFactor,
                        fullParams.randomOffsetStddevM, fullParams.minSeparationFactor,
                        undefined, fullParams.centerLayout
                    );
                    break;
                case 'manual_circular':
                    this.currentLayout = window.BingoLayouts.createManualCircularLayout(
                        fullParams.tileWidthM, fullParams.tileHeightM, /* spacingMode removido */ fullParams.spacingXFactor,
                        fullParams.spacingYFactor, fullParams.centerExpScaleFactor, fullParams.randomOffsetStddevM,
                        fullParams.minSeparationFactor, undefined, fullParams.centerLayout
                    );
                    break;
                case 'random': // Não tinha modo, chamada permanece igual
                    this.currentLayout = window.BingoLayouts.createRandomLayout(
                        fullParams.numTiles, fullParams.maxRadiusM, fullParams.tileWidthM, fullParams.tileHeightM,
                        fullParams.minSeparationFactor, undefined, fullParams.centerLayout
                    );
                    break;
                default:
                    console.warn(`Tipo de layout não reconhecido para geração: ${this.layoutType}`);
                    this.currentLayout = []; // Define como vazio
            }

            // Após gerar os centros, gera as posições de todas as antenas individuais
            this.generateAllAntennas();

            // Verifica colisões entre os tiles (centros)
            this.checkCollisions();

            // Atualiza a visualização no canvas
            this.drawLayout();
            // Atualiza as estatísticas (contagem de tiles/antenas)
            this.updateStats();

            // Atualiza os campos de exportação OSKAR
            if (typeof window.updateExportFields === 'function') {
                let stations = [];
                if (window.interactiveMap && typeof window.interactiveMap.getSelectedCoordinates === 'function') {
                    stations = window.interactiveMap.getSelectedCoordinates();
                }
                window.updateExportFields(this.currentLayout, stations);
            }

        } catch (error) {
            console.error(`Erro ao gerar layout '${this.layoutType}':`, error);
            alert(`Erro ao gerar layout '${this.layoutType}'. Verifique os parâmetros e o console (F12).\n${error.message}`);
            // Limpa os dados em caso de erro
            this.currentLayout = [];
            this.allAntennas = [];
            this.collisions = [];
            this.drawLayout(); // Limpa o canvas
            this.updateStats(); // Zera as estatísticas
            // Limpa campos de exportação
            if (typeof window.updateExportFields === 'function') {
                window.updateExportFields([], []);
            }
        }
    }

    /**
     * Função auxiliar para capitalizar a primeira letra de uma string.
     * @param {string} string A string de entrada.
     * @returns {string} A string com a primeira letra maiúscula.
     */
    capitalizeFirstLetter(string) {
        if (!string) return '';
        return string.charAt(0).toUpperCase() + string.slice(1);
    }


    /**
     * Gera as coordenadas [x,y] de todas as antenas individuais
     * com base nos centros dos tiles atuais (this.currentLayout).
     * Atualiza this.allAntennas.
     */
    generateAllAntennas() {
        this.allAntennas = [];
        if (!this.currentLayout || this.currentLayout.length === 0) {
            return; // Sai se não há centros de tiles
        }

        // Para cada centro de tile, adiciona as 64 antenas calculadas
        for (const center of this.currentLayout) {
            // center[0] é o X, center[1] é o Y
            const tileAntennas = this.createTileLayout64Antennas(center[0], center[1]);
            this.allAntennas.push(...tileAntennas); // Adiciona as antenas deste tile à lista geral
        }
    }

    /**
     * Verifica colisões entre os Bounding Boxes (retângulos) de todos os tiles.
     * Atualiza o array this.collisions com informações sobre as colisões encontradas.
     * Usa uma pequena tolerância (epsilon) para evitar falsos positivos com tiles que apenas se tocam.
     */
    checkCollisions() {
        this.collisions = [];
        if (!this.currentLayout || this.currentLayout.length < 2) {
            return; // Precisa de pelo menos 2 tiles para verificar colisão
        }

        const minCenterXDist = TILE_WIDTH;  // Distância mínima entre centros em X para NÃO colidir
        const minCenterYDist = TILE_HEIGHT; // Distância mínima entre centros em Y para NÃO colidir
        const epsilon = 1e-6; // Pequena tolerância numérica

        for (let i = 0; i < this.currentLayout.length; i++) {
            for (let j = i + 1; j < this.currentLayout.length; j++) {
                const tile1 = this.currentLayout[i];
                const tile2 = this.currentLayout[j];

                 // Verifica se as coordenadas são válidas antes de calcular
                 if (!Array.isArray(tile1) || tile1.length < 2 || !Array.isArray(tile2) || tile2.length < 2) {
                     console.warn(`Coordenadas inválidas encontradas ao checar colisão entre índices ${i} e ${j}`);
                     continue; // Pula este par
                 }

                // Calcula a diferença absoluta nas coordenadas dos centros
                const deltaX = Math.abs(tile1[0] - tile2[0]);
                const deltaY = Math.abs(tile1[1] - tile2[1]);

                // Verifica se há sobreposição (colisão)
                // Colide se a distância entre os centros em AMBAS as direções
                // for MENOR que a dimensão total do tile (menos epsilon)
                if (deltaX < (minCenterXDist - epsilon) && deltaY < (minCenterYDist - epsilon)) {
                    // Calcula a distância euclidiana apenas para informação de log/debug
                    const distance = Math.sqrt(Math.pow(tile1[0] - tile2[0], 2) + Math.pow(tile1[1] - tile2[1], 2));
                    this.collisions.push({
                        tile1Index: i,
                        tile2Index: j,
                        distance: distance // Distância entre os centros
                    });
                }
            }
        }
        // Opcional: Ordenar colisões (ex: pela distância)
        // this.collisions.sort((a, b) => a.distance - b.distance);
    }


    /**
     * Gera um layout com parâmetros aleatórios para o tipo de layout atual.
     * Atualiza a interface (incluindo sliders) e gera/desenha o novo layout.
     */
    generateRandomLayout() {
        const controls = PARAM_CONTROLS[this.layoutType];
        if (!controls) return; // Sai se não houver controles definidos

        // Itera sobre os controles definidos para o tipo atual
        controls.forEach(control => {
            // Randomiza apenas os tipos suportados (number, select, checkbox)
            switch(control.type) {
                case 'number':
                    if (control.min !== undefined && control.max !== undefined) {
                        // Calcula valor aleatório dentro dos limites
                        let randomValue = Math.random() * (control.max - control.min) + control.min;
                        // Ajusta para o step se definido
                        if (control.step) {
                            randomValue = Math.round(randomValue / control.step) * control.step;
                            // Precisão decimal baseada no step
                            const decimalPlaces = (String(control.step).split('.')[1] || '').length;
                            randomValue = parseFloat(randomValue.toFixed(decimalPlaces));
                        }
                         // Garante que o valor final esteja dentro dos limites (pode ser necessário devido a arredondamento do step)
                        randomValue = Math.max(control.min, Math.min(control.max, randomValue));
                        this.params[control.id] = randomValue;
                    }
                    break;
                case 'select':
                    if (control.options && control.options.length > 0) {
                        const randomIndex = Math.floor(Math.random() * control.options.length);
                        this.params[control.id] = control.options[randomIndex].value;
                    }
                    break;
                case 'checkbox':
                    this.params[control.id] = Math.random() > 0.5; // 50% de chance
                    break;
            }
        });

        // --- Atualiza a Interface ---
        // É necessário recriar ou atualizar os valores dos inputs/sliders na UI
        this.updateDynamicControls(); // Recria os controles com os novos valores em this.params

        // Gera e desenha o layout com os novos parâmetros aleatórios
        this.generateLayout();
    }


    /**
     * Desenha o layout atual (centros dos tiles e antenas individuais) no canvas.
     * Inclui desenho da escala e indicação de colisões (se habilitado).
     * Utiliza cores definidas por variáveis CSS para se adaptar ao tema.
     * A escala preserva o aspect ratio do conteúdo.
     */
    drawLayout() {
        const ctx = this.ctx;
        const canvas = this.canvas;

        // Limpa completamente o canvas antes de desenhar
        ctx.clearRect(0, 0, canvas.width, canvas.height);

         // Define a cor de fundo do canvas explicitamente para garantir que corresponda ao tema
         // Usa a cor de fundo do card como fundo do canvas para contraste adequado
         ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--card-bg-color') || 'white';
         ctx.fillRect(0, 0, canvas.width, canvas.height);


        // Verifica se há dados para desenhar
        if (!this.currentLayout || this.currentLayout.length === 0 || this.allAntennas.length === 0) {
            // Desenha mensagem indicando que não há layout
            ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--text-color') || '#333';
            ctx.font = '16px Segoe UI, Tahoma, Geneva, Verdana, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText("Gere um layout ou ajuste os parâmetros.", canvas.width / 2, canvas.height / 2);
            return;
        }

        // --- Cálculo de Escala e Offset ---
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        // Usa TODAS as antenas para calcular os limites reais do desenho
        // Garante que só coordenadas válidas sejam consideradas
        for (const antenna of this.allAntennas) {
             if (Array.isArray(antenna) && antenna.length >= 2 && !isNaN(antenna[0]) && !isNaN(antenna[1])) {
                 minX = Math.min(minX, antenna[0]); maxX = Math.max(maxX, antenna[0]);
                 minY = Math.min(minY, antenna[1]); maxY = Math.max(maxY, antenna[1]);
             }
        }
         // Se por algum motivo não houver antenas válidas, usa os centros dos tiles
         if (minX === Infinity && this.currentLayout.length > 0) {
              minX = Infinity; maxX = -Infinity; minY = Infinity; maxY = -Infinity; // Reset
              for (const center of this.currentLayout) {
                 if (Array.isArray(center) && center.length >= 2 && !isNaN(center[0]) && !isNaN(center[1])) {
                    minX = Math.min(minX, center[0]); maxX = Math.max(maxX, center[0]);
                    minY = Math.min(minY, center[1]); maxY = Math.max(maxY, center[1]);
                 }
              }
               // Adiciona as dimensões do tile aos limites se apenas centros foram usados
               if (minX !== Infinity) {
                    minX -= TILE_WIDTH / 2; maxX += TILE_WIDTH / 2;
                    minY -= TILE_HEIGHT / 2; maxY += TILE_HEIGHT / 2;
               }
         }


        // Se ainda não há limites válidos, não desenha nada.
         if (minX === Infinity) {
             console.warn("Não foi possível determinar os limites do layout para desenho.");
             return;
         }


        // Adiciona uma margem para não colar nas bordas e para a escala
        const margin = 50; // Pixels de margem em todos os lados
        const contentWidth = (maxX - minX);
        const contentHeight = (maxY - minY);
        // Adiciona um pequeno valor se a dimensão for zero para evitar divisão por zero
        const effectiveWidth = Math.max(contentWidth, 0.1);
        const effectiveHeight = Math.max(contentHeight, 0.1);

        // Calcula área disponível no canvas descontando as margens
        const availableWidth = canvas.width - 2 * margin;
        const availableHeight = canvas.height - 2 * margin;

        // Se não há espaço útil, não desenha
        if (availableWidth <= 0 || availableHeight <= 0) {
            console.warn("Área do canvas (descontando margens) é muito pequena para desenhar.");
            // Opcional: Desenhar mensagem de erro
            ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--secondary-color') || 'red';
            ctx.font = '12px Segoe UI, Tahoma, Geneva, Verdana, sans-serif';
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText("Espaço insuficiente no canvas.", canvas.width / 2, canvas.height / 2);
            return;
        }

        // Calcula a escala (mantém proporção) - pixels por metro
        // Usa Math.min para garantir que o conteúdo caiba tanto na largura quanto na altura
        const scale = Math.min(availableWidth / effectiveWidth, availableHeight / effectiveHeight);
        // console.log(`Calculated scale: ${scale.toFixed(2)} px/m (Available: ${availableWidth.toFixed(0)}x${availableHeight.toFixed(0)}, Effective: ${effectiveWidth.toFixed(1)}x${effectiveHeight.toFixed(1)})`);

        // Calcula o offset para centralizar o CONTEÚDO (baseado em minX/maxX/...) na área disponível
        // O offset é a posição do canto superior esquerdo da área de conteúdo no canvas
        const offsetX = margin + (availableWidth - effectiveWidth * scale) / 2;
        const offsetY = margin + (availableHeight - effectiveHeight * scale) / 2;

        // --- Função de Transformação de Coordenadas ---
        // Converte coordenadas do layout (X,Y - origem no centro do layout, Y para cima)
        // para coordenadas do canvas (x,y - origem no topo-esquerdo do canvas, y para baixo)
        const transformCoord = (coordX, coordY) => {
            // Calcula a posição relativa ao canto inferior esquerdo (minX, minY)
            const relativeX = coordX - minX;
            const relativeY = coordY - minY; // Y ainda está "para cima"

            // Aplica a escala e o offset
            const canvasX = relativeX * scale + offsetX;
             // Inverte o Y: (effectiveHeight - relativeY) dá a posição relativa ao *topo* do conteúdo em coordenadas de layout
            const canvasY = (effectiveHeight - relativeY) * scale + offsetY;

            return { x: canvasX, y: canvasY };
        };


        // --- Desenho ---

        // 1. Desenha a escala e eixos (passa a função de transformação)
        // Assegura que drawScale use a mesma escala e transformação
        this.drawScale(ctx, canvas, scale, minX, minY, maxX, maxY, transformCoord, margin); // Passa a margem

        // Obtém cores do tema atual
        const centerColor = getComputedStyle(document.body).getPropertyValue('--secondary-color') || 'red';
        const antennaColor = getComputedStyle(document.body).getPropertyValue('--primary-color') || '#3498db';
        const collisionColor = getComputedStyle(document.body).getPropertyValue('--secondary-color') || 'red'; // Reutiliza secondary para colisões


        // 2. Desenha os centros dos tiles
        ctx.fillStyle = centerColor;
        for (const center of this.currentLayout) {
             if (Array.isArray(center) && center.length >= 2) {
                const { x, y } = transformCoord(center[0], center[1]);
                ctx.beginPath();
                ctx.arc(x, y, 3, 0, Math.PI * 2); // Raio 3 pixels
                ctx.fill();
             }
        }

        // 3. Desenha todas as antenas individuais
        ctx.fillStyle = antennaColor;
        for (const antenna of this.allAntennas) {
             if (Array.isArray(antenna) && antenna.length >= 2) {
                const { x, y } = transformCoord(antenna[0], antenna[1]);
                ctx.beginPath();
                ctx.arc(x, y, 1.5, 0, Math.PI * 2); // Raio 1.5 pixels
                ctx.fill();
             }
        }

        // 4. Desenha as colisões (se habilitado e houver colisões)
        if (this.showCollisions && this.collisions.length > 0) {
            ctx.strokeStyle = collisionColor;
            ctx.lineWidth = 1.5;
            ctx.globalAlpha = 0.6; // Leve transparência

            for (const collision of this.collisions) {
                const tile1 = this.currentLayout[collision.tile1Index];
                const tile2 = this.currentLayout[collision.tile2Index];

                 // Verifica se os tiles envolvidos na colisão são válidos
                 if (!Array.isArray(tile1) || tile1.length < 2 || !Array.isArray(tile2) || tile2.length < 2) {
                     continue; // Pula se dados inválidos
                 }

                const { x: x1, y: y1 } = transformCoord(tile1[0], tile1[1]);
                const { x: x2, y: y2 } = transformCoord(tile2[0], tile2[1]);

                // Desenha uma linha entre os centros dos tiles colididos
                ctx.beginPath();
                ctx.moveTo(x1, y1);
                ctx.lineTo(x2, y2);
                ctx.stroke();

                // Opcional: Destaca os centros colididos com um círculo maior
                ctx.lineWidth = 1; // Linha fina para o círculo
                ctx.beginPath();
                ctx.arc(x1, y1, 5, 0, Math.PI * 2); // Raio 5 pixels
                ctx.stroke();
                ctx.beginPath();
                ctx.arc(x2, y2, 5, 0, Math.PI * 2);
                ctx.stroke();
            }
            // Restaura padrões
            ctx.globalAlpha = 1.0;
            ctx.lineWidth = 1;
        }
    }


     /**
      * Desenha a escala em metros e os eixos X=0, Y=0 no canvas.
      * Usa a função de transformação para posicionar corretamente.
      * @param {CanvasRenderingContext2D} ctx Contexto do canvas.
      * @param {HTMLCanvasElement} canvas Elemento canvas.
      * @param {number} scale Fator de escala (pixels por metro).
      * @param {number} minX Valor mínimo de X no layout (metros).
      * @param {number} minY Valor mínimo de Y no layout (metros).
      * @param {number} maxX Valor máximo de X no layout (metros).
      * @param {number} maxY Valor máximo de Y no layout (metros).
      * @param {function} transformCoord Função que converte (layoutX, layoutY) para {x: canvasX, y: canvasY}.
      * @param {number} margin Margem usada no canvas (em pixels).
      */
     drawScale(ctx, canvas, scale, minX, minY, maxX, maxY, transformCoord, margin) {
         const layoutWidth = maxX - minX;
         const layoutHeight = maxY - minY;

         // --- Determinar Intervalo da Escala ---
         // Objetivo: ter um número razoável de marcas (e.g., 4-10)
         const maxDimension = Math.max(layoutWidth, layoutHeight);
         let scaleInterval = 1; // Intervalo em metros
         if (maxDimension > 1e-6) { // Evita cálculo se dimensão for zero
             const targetTicks = 6; // Número aproximado de marcas desejadas
             const roughInterval = maxDimension / targetTicks;
             const orderOfMagnitude = Math.pow(10, Math.floor(Math.log10(roughInterval)));
             // Escolhe intervalos "bonitos" (1, 2, 5) * 10^n
             if (roughInterval / orderOfMagnitude < 1.5) scaleInterval = 1 * orderOfMagnitude;
             else if (roughInterval / orderOfMagnitude < 3.5) scaleInterval = 2 * orderOfMagnitude;
             else if (roughInterval / orderOfMagnitude < 7.5) scaleInterval = 5 * orderOfMagnitude;
             else scaleInterval = 10 * orderOfMagnitude;
             // Garante intervalo mínimo para evitar excesso de marcas em layouts pequenos
             scaleInterval = Math.max(scaleInterval, 0.1); // Ex: Mínimo 0.1m
         }
         // Determina precisão decimal com base no intervalo
         const scalePrecision = scaleInterval < 0.5 ? 2 : (scaleInterval < 1 ? 1 : 0);

         // Calcula limites da escala arredondados para múltiplos do intervalo
         // Usa um pequeno epsilon para incluir bordas se forem exatamente no intervalo
         const epsilon = scaleInterval * 1e-6;
         const xStart = Math.ceil((minX - epsilon) / scaleInterval) * scaleInterval;
         const xEnd = Math.floor((maxX + epsilon) / scaleInterval) * scaleInterval;
         const yStart = Math.ceil((minY - epsilon) / scaleInterval) * scaleInterval;
         const yEnd = Math.floor((maxY + epsilon) / scaleInterval) * scaleInterval;

         // --- Configuração de Estilo ---
         const scaleColor = getComputedStyle(document.body).getPropertyValue('--text-color') || '#888';
         const axisColor = getComputedStyle(document.body).getPropertyValue('--border-color') || '#aaa';
         ctx.strokeStyle = scaleColor;
         ctx.fillStyle = scaleColor;
         ctx.lineWidth = 0.5;
         ctx.font = '10px Segoe UI, Tahoma, Geneva, Verdana, sans-serif';
         const tickSize = 5;      // Tamanho da marca em pixels
         const textMargin = 8;    // Espaço entre marca e texto
         const axisTextMargin = 15; // Espaço extra para os rótulos dos eixos

         // --- Desenha Marcas e Textos ---

         // Eixo X (na parte inferior, dentro da margem)
         ctx.textAlign = 'center';
         ctx.textBaseline = 'top'; // Texto acima da linha base
         const xAxisYPos = canvas.height - margin + textMargin; // Posição Y para as marcas/texto do eixo X
         for (let x = xStart; x <= xEnd; x += scaleInterval) {
             // Transforma a coordenada X do layout para a coordenada X do canvas
             // Usa minY para a posição Y (base do layout), mas desenha na margem inferior
             const { x: canvasX } = transformCoord(x, minY);

             // Evita desenhar 0.0 se o eixo Y (x=0) for desenhado separadamente
              const isZero = Math.abs(x) < epsilon;
              if (isZero && minX <= epsilon && maxX >= -epsilon) continue; // Pula se eixo Y será desenhado

             // Desenha a marca
             ctx.beginPath();
             ctx.moveTo(canvasX, xAxisYPos);
             ctx.lineTo(canvasX, xAxisYPos - tickSize); // Marca para cima
             ctx.stroke();
             // Desenha o texto
             ctx.fillText(`${x.toFixed(scalePrecision)}`, canvasX, xAxisYPos + 2); // Texto abaixo da marca
         }

         // Eixo Y (na parte esquerda, dentro da margem)
         ctx.textAlign = 'right'; // Texto à esquerda da marca
         ctx.textBaseline = 'middle'; // Texto centralizado verticalmente na marca
         const yAxisXPos = margin - textMargin; // Posição X para as marcas/texto do eixo Y
         for (let y = yStart; y <= yEnd; y += scaleInterval) {
             // Transforma a coordenada Y do layout para a coordenada Y do canvas
             // Usa minX para a posição X (borda esquerda do layout), mas desenha na margem esquerda
             const { y: canvasY } = transformCoord(minX, y);

              // Evita desenhar 0.0 se o eixo X (y=0) for desenhado separadamente
              const isZero = Math.abs(y) < epsilon;
              if (isZero && minY <= epsilon && maxY >= -epsilon) continue; // Pula se eixo X será desenhado

             // Desenha a marca
             ctx.beginPath();
             ctx.moveTo(yAxisXPos, canvasY);
             ctx.lineTo(yAxisXPos + tickSize, canvasY); // Marca para direita
             ctx.stroke();
             // Desenha o texto
             ctx.fillText(`${y.toFixed(scalePrecision)}`, yAxisXPos - 2, canvasY); // Texto à esquerda da marca
         }

         // --- Desenha Eixos X=0 e Y=0 (se visíveis na área do layout) ---
         ctx.strokeStyle = axisColor;
         ctx.lineWidth = 1;
         const axisEpsilon = 1e-9; // Tolerância para verificar se 0 está dentro dos limites

         // Eixo Y (linha vertical em X=0)
         if (minX <= axisEpsilon && maxX >= -axisEpsilon) {
             const { x: zeroX } = transformCoord(0, minY); // X do eixo Y
             // Ys correspondentes ao topo e base do *conteúdo*
             const { y: topY } = transformCoord(0, maxY);
             const { y: bottomY } = transformCoord(0, minY);
             ctx.beginPath();
             ctx.moveTo(zeroX, topY);
             ctx.lineTo(zeroX, bottomY);
             ctx.stroke();
             // Texto "0" para o eixo Y (se não foi desenhado pelas marcas)
              if (!(yStart <= axisEpsilon && yEnd >= -axisEpsilon)) { // Se 0 não estava no range das marcas Y
                 ctx.fillStyle = scaleColor; ctx.font = '10px Segoe UI'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
                 ctx.fillText('0', yAxisXPos - 2, transformCoord(0, 0).y);
             }
         }
         // Eixo X (linha horizontal em Y=0)
         if (minY <= axisEpsilon && maxY >= -axisEpsilon) {
             const { y: zeroY } = transformCoord(minX, 0); // Y do eixo X
             // Xs correspondentes à esquerda e direita do *conteúdo*
             const { x: leftX } = transformCoord(minX, 0);
             const { x: rightX } = transformCoord(maxX, 0);
             ctx.beginPath();
             ctx.moveTo(leftX, zeroY);
             ctx.lineTo(rightX, zeroY);
             ctx.stroke();
             // Texto "0" para o eixo X (se não foi desenhado pelas marcas)
              if (!(xStart <= axisEpsilon && xEnd >= -axisEpsilon)) { // Se 0 não estava no range das marcas X
                 ctx.fillStyle = scaleColor; ctx.font = '10px Segoe UI'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
                 ctx.fillText('0', transformCoord(0, 0).x, xAxisYPos + 2);
             }
         }

         // --- Desenha Rótulos dos Eixos ---
         ctx.fillStyle = scaleColor;
         ctx.font = '12px Segoe UI, Tahoma, Geneva, Verdana, sans-serif';
         // Rótulo X (Abaixo das marcas)
         ctx.textAlign = 'center';
         ctx.textBaseline = 'bottom'; // Alinha pela base do texto
         ctx.fillText('X (metros)', canvas.width / 2, canvas.height - axisTextMargin / 3); // Posição mais baixa

         // Rótulo Y (Rotacionado, à esquerda das marcas)
         ctx.save(); // Salva o estado atual do contexto (transformações, etc.)
         ctx.translate(axisTextMargin / 2, canvas.height / 2); // Move a origem para a posição do texto Y
         ctx.rotate(-Math.PI / 2); // Rotaciona -90 graus
         ctx.textAlign = 'center';
         ctx.textBaseline = 'bottom'; // Alinha pela base do texto (que agora está na "direita" devido à rotação)
         ctx.fillText('Y (metros)', 0, 0);
         ctx.restore(); // Restaura o estado anterior do contexto
     } // === FIM DO MÉTODO drawScale ===



    /**
     * Atualiza os elementos HTML que mostram a contagem de tiles e antenas.
     */
    updateStats() {
        const tileCountSpan = document.getElementById('tile-count');
        const antennaCountSpan = document.getElementById('antenna-count');
        const tileCount = this.currentLayout ? this.currentLayout.length : 0;
        const antennaCount = this.allAntennas ? this.allAntennas.length : 0;

        if (tileCountSpan) tileCountSpan.textContent = tileCount;
        if (antennaCountSpan) antennaCountSpan.textContent = antennaCount;

        // Atualiza também a informação de colisões
        this.updateCollisionInfo();
    }

    /**
     * Atualiza a seção de informações sobre colisões na interface.
     * Cria a seção se ela não existir.
     */
    updateCollisionInfo() {
        const visualizationDiv = document.querySelector('.visualization'); // Container pai
        if (!visualizationDiv) {
             console.warn("Div '.visualization' não encontrada, não foi possível criar/atualizar a seção de colisões.");
             return;
        }
         let collisionInfoDiv = document.getElementById('collision-info');

        // Cria a estrutura HTML se não existir
        if (!collisionInfoDiv) {
            collisionInfoDiv = document.createElement('div');
            collisionInfoDiv.id = 'collision-info';
            collisionInfoDiv.className = 'collision-info'; // Para estilização CSS

            const header = document.createElement('div');
            header.className = 'collision-header'; // Para estilização e evento
            header.innerHTML = `<span>Colisões Detectadas: <span id="collision-count">0</span></span><span class="toggle-arrow">▼</span>`;

            const content = document.createElement('div');
            content.id = 'collision-content';
            content.className = 'collision-content';
            content.style.display = 'none'; // Começa oculto

            header.addEventListener('click', () => {
                const isHidden = content.style.display === 'none';
                content.style.display = isHidden ? 'block' : 'none';
                const arrow = header.querySelector('.toggle-arrow');
                if (arrow) arrow.textContent = isHidden ? '▲' : '▼';
                 // Chama resizeCanvas após alterar visibilidade, pois afeta altura disponível
                 this.resizeCanvas();
            });

            collisionInfoDiv.appendChild(header);
            collisionInfoDiv.appendChild(content);
            // Adiciona a div de colisão APÓS a div de stats dentro de .visualization
            const statsDiv = visualizationDiv.querySelector('.stats');
            if (statsDiv) {
                statsDiv.parentNode.insertBefore(collisionInfoDiv, statsDiv.nextSibling);
            } else {
                 visualizationDiv.appendChild(collisionInfoDiv); // Fallback: adiciona no final
            }
        }

        // Atualiza o conteúdo (contador e lista)
        const collisionCountSpan = document.getElementById('collision-count');
        const collisionContentDiv = document.getElementById('collision-content');

        if (!collisionCountSpan || !collisionContentDiv) {
            console.warn("Elementos internos da seção de colisões (#collision-count ou #collision-content) não encontrados.");
            return;
        }

        const numCollisions = this.collisions ? this.collisions.length : 0;
        collisionCountSpan.textContent = numCollisions;

        collisionContentDiv.innerHTML = ''; // Limpa conteúdo antigo
        if (numCollisions > 0) {
            const list = document.createElement('ul');
            const maxCollisionsToShow = 50; // Limita o número de itens exibidos
            for (let i = 0; i < Math.min(numCollisions, maxCollisionsToShow); i++) {
                const collision = this.collisions[i];
                const item = document.createElement('li');
                // Adiciona 1 aos índices para exibição (usuário vê Tile 1, não Tile 0)
                item.textContent = `Tile ${collision.tile1Index + 1} e Tile ${collision.tile2Index + 1} (Dist. Centros: ${collision.distance.toFixed(3)}m)`;
                list.appendChild(item);
            }
            // Adiciona mensagem se houver mais colisões não exibidas
            if (numCollisions > maxCollisionsToShow) {
                const item = document.createElement('li');
                item.style.fontStyle = 'italic';
                item.textContent = `... e mais ${numCollisions - maxCollisionsToShow} colisões.`;
                list.appendChild(item);
            }
            collisionContentDiv.appendChild(list);
        } else {
            collisionContentDiv.textContent = 'Nenhuma colisão detectada.';
        }
    }


    // --- Métodos Getters ---

    /**
     * Retorna o layout atual dos centros dos tiles.
     * @returns {Array<Array<number>>} Array de coordenadas [x, y].
     */
    getLayout() {
        return this.currentLayout;
    }

    /**
     * Retorna o layout atual de todas as antenas individuais.
     * @returns {Array<Array<number>>} Array de coordenadas [x, y].
     */
    getAllAntennas() {
        return this.allAntennas;
    }

} // === FIM DA CLASSE AntennaLayoutGenerator ===


// === Instanciação e Exportação Global ===
// A instância é criada no escopo global (window) para ser acessível por outros scripts (main.js)
// A criação é feita aqui para garantir que a classe esteja definida.
if (typeof window !== 'undefined') {
    // Cria a instância global do gerador APÓS a definição da classe
    // O script main.js chamará a inicialização completa após o DOM carregar.
    // window.antennaGenerator = new AntennaLayoutGenerator(); // MOVIDO para ser chamado por main.js após DOM ready
    console.log("Classe AntennaLayoutGenerator definida. Instância será criada por main.js.");
     // Cria a instância aqui mesmo para garantir que ela exista quando main.js for executado
     // É seguro chamar o construtor aqui, pois ele busca elementos do DOM que já devem existir
     // se este script for carregado no final do body ou com defer.
     document.addEventListener('DOMContentLoaded', () => {
        try {
            if (!window.antennaGenerator) { // Evita recriar se já existir
                window.antennaGenerator = new AntennaLayoutGenerator();
                console.log("Instância de AntennaLayoutGenerator criada em generator.js (DOMContentLoaded).");
            }
        } catch (error) {
            console.error("Erro ao instanciar AntennaLayoutGenerator:", error);
             alert("Erro crítico ao inicializar o gerador de layout. Verifique o console.");
        }
    });

} else {
    console.warn("Ambiente não-navegador detectado. 'window.antennaGenerator' não foi criado.");
}