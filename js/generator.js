/**
 * Módulo para geração e visualização de layouts de antenas BINGO.
 * Utiliza a biblioteca BingoLayouts (bingo_layouts.js) e desenha
 * os resultados em um canvas HTML. Permite ajustar parâmetros
 * dinamicamente e visualizar colisões.
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
        numCols: 6, numRows: 6, spacingMode: 'linear', spacingXFactor: 1.0, spacingYFactor: 1.0,
        centerExpScaleFactor: 1.1, randomOffsetStddevM: 0.0, minSeparationFactor: 1.05
    },
    spiral: {
        numArms: 3, tilesPerArm: 12, armSpacingMode: 'linear', centerScaleMode: 'none', radiusStartFactor: 0.7,
        radiusStepFactor: 0.3, centerExpScaleFactor: 1.1, angleStepRad: Math.PI / 9, armOffsetRad: 0.0,
        rotationPerArmRad: 0.0, randomOffsetStddevM: 0.0, minSeparationFactor: 1.05, includeCenterTile: false
    },
    ring: {
        numRings: 3, tilesPerRing: [8, 16, 24], ringSpacingMode: 'linear', centerScaleMode: 'none',
        radiusStartFactor: 0.5, radiusStepFactor: 0.5, centerExpScaleFactor: 1.1, angleOffsetRad: 0.0,
        randomOffsetStddevM: 0.0, minSeparationFactor: 1.05, addCenterTile: true
    },
    rhombus: {
        numRowsHalf: 6, spacingMode: 'linear', sideLengthFactor: 0.65, hCompressFactor: 1.0,
        vCompressFactor: 1.0, centerExpScaleFactor: 1.1, randomOffsetStddevM: 0.0, minSeparationFactor: 1.05
    },
    hex_grid: {
        numRingsHex: 3, spacingMode: 'linear', spacingFactor: 1.5, centerExpScaleFactor: 1.1,
        addCenterTile: true, randomOffsetStddevM: 0.0, minSeparationFactor: 1.05
    },
    phyllotaxis: {
        numTiles: 36, spacingMode: 'linear', scaleFactor: 0.6, centerOffsetFactor: 0.05,
        centerExpScaleFactor: 1.1, randomOffsetStddevM: 0.0, minSeparationFactor: 1.05
    },
    manual_circular: {
        spacingMode: 'linear', spacingXFactor: 1.0, spacingYFactor: 1.0, centerExpScaleFactor: 1.1,
        randomOffsetStddevM: 0.0, minSeparationFactor: 1.05
    },
    random: {
        numTiles: 36, maxRadiusM: 10.0, minSeparationFactor: 1.05
    }
};

// Mapeamento de Parâmetros para Controles da Interface (define como cada parâmetro será exibido)
const PARAM_CONTROLS = {
    // --- Grid ---
    grid: [
        { id: 'numCols', label: 'Número de Colunas', type: 'number', min: 1, max: 20, step: 1 },
        { id: 'numRows', label: 'Número de Linhas', type: 'number', min: 1, max: 20, step: 1 },
        { id: 'spacingMode', label: 'Modo de Espaçamento', type: 'select', options: [ { value: 'linear', label: 'Linear' }, { value: 'center_exponential', label: 'Exponencial Central' } ]},
        { id: 'spacingXFactor', label: 'Fator Espaç. X', type: 'number', min: 0.1, max: 5, step: 0.1, condition: 'this.params.spacingMode === "linear"' }, // Usa this.params na condição
        { id: 'spacingYFactor', label: 'Fator Espaç. Y', type: 'number', min: 0.1, max: 5, step: 0.1, condition: 'this.params.spacingMode === "linear"' }, // Usa this.params na condição
        { id: 'centerExpScaleFactor', label: 'Fator Exp. Central', type: 'number', min: 0.5, max: 3, step: 0.05, condition: 'this.params.spacingMode === "center_exponential"' }, // Usa this.params na condição
        { id: 'randomOffsetStddevM', label: 'Offset Aleatório (m)', type: 'number', min: 0, max: 1, step: 0.01 },
        { id: 'minSeparationFactor', label: 'Fator Sep. Mín.', type: 'number', min: 0.5, max: 2, step: 0.05, condition: 'this.params.randomOffsetStddevM > 0' } // Usa this.params na condição
    ],
    // --- Espiral ---
    spiral: [
        { id: 'numArms', label: 'Número de Braços', type: 'number', min: 1, max: 12, step: 1 },
        { id: 'tilesPerArm', label: 'Tiles por Braço', type: 'number', min: 1, max: 30, step: 1 },
        { id: 'armSpacingMode', label: 'Espaç. Braço', type: 'select', options: [ { value: 'linear', label: 'Linear' }, { value: 'exponential', label: 'Exponencial' } ]},
        { id: 'centerScaleMode', label: 'Escala Central', type: 'select', options: [ { value: 'none', label: 'Nenhum' }, { value: 'center_exponential', label: 'Exponencial' } ]},
        { id: 'radiusStartFactor', label: 'Fator Raio Inicial', type: 'number', min: 0.1, max: 5, step: 0.1 },
        { id: 'radiusStepFactor', label: 'Fator Passo Raio', type: 'number', min: 0.1, max: 2, step: 0.05 }, // Significado muda c/ armSpacingMode
        { id: 'centerExpScaleFactor', label: 'Fator Exp. Central', type: 'number', min: 0.5, max: 3, step: 0.05, condition: 'this.params.centerScaleMode === "center_exponential"' }, // Condicional
        { id: 'angleStepRad', label: 'Passo Angular (rad)', type: 'number', min: 0.01, max: Math.PI.toFixed(3), step: 0.01 }, // Exibe PI aprox.
        { id: 'includeCenterTile', label: 'Incluir Tile Central', type: 'checkbox' },
        { id: 'randomOffsetStddevM', label: 'Offset Aleatório (m)', type: 'number', min: 0, max: 1, step: 0.01 },
        { id: 'minSeparationFactor', label: 'Fator Sep. Mín.', type: 'number', min: 0.5, max: 2, step: 0.05, condition: 'this.params.randomOffsetStddevM > 0' } // Condicional
    ],
     // --- Anéis ---
     ring: [
        { id: 'numRings', label: 'Número de Anéis', type: 'number', min: 1, max: 10, step: 1 },
        // Nota: 'tilesPerRing' é tratado separadamente na lógica, não como controle direto aqui.
        { id: 'ringSpacingMode', label: 'Espaç. Anel', type: 'select', options: [ { value: 'linear', label: 'Linear' }, { value: 'exponential', label: 'Exponencial' } ]},
        { id: 'centerScaleMode', label: 'Escala Central', type: 'select', options: [ { value: 'none', label: 'Nenhum' }, { value: 'center_exponential', label: 'Exponencial' } ]},
        { id: 'radiusStartFactor', label: 'Fator Raio Inicial', type: 'number', min: 0.1, max: 5, step: 0.1 },
        { id: 'radiusStepFactor', label: 'Fator Passo Raio', type: 'number', min: 0.1, max: 2, step: 0.05 }, // Significado muda c/ ringSpacingMode
        { id: 'centerExpScaleFactor', label: 'Fator Exp. Central', type: 'number', min: 0.5, max: 3, step: 0.05, condition: 'this.params.centerScaleMode === "center_exponential"' }, // Condicional
        { id: 'addCenterTile', label: 'Adicionar Tile Central', type: 'checkbox' },
        { id: 'randomOffsetStddevM', label: 'Offset Aleatório (m)', type: 'number', min: 0, max: 1, step: 0.01 },
        { id: 'minSeparationFactor', label: 'Fator Sep. Mín.', type: 'number', min: 0.5, max: 2, step: 0.05, condition: 'this.params.randomOffsetStddevM > 0' } // Condicional
    ],
    // --- Losango ---
    rhombus: [
        { id: 'numRowsHalf', label: 'Metade Linhas', type: 'number', min: 1, max: 15, step: 1 },
        { id: 'spacingMode', label: 'Modo Espaçamento', type: 'select', options: [ { value: 'linear', label: 'Linear' }, { value: 'center_exponential', label: 'Exponencial Central' } ]},
        { id: 'sideLengthFactor', label: 'Fator Lado Célula', type: 'number', min: 0.1, max: 5, step: 0.05 },
        { id: 'hCompressFactor', label: 'Compressão Horiz.', type: 'number', min: 0.1, max: 5, step: 0.1 },
        { id: 'vCompressFactor', label: 'Compressão Vert.', type: 'number', min: 0.1, max: 5, step: 0.1 },
        { id: 'centerExpScaleFactor', label: 'Fator Exp. Central', type: 'number', min: 0.5, max: 3, step: 0.05, condition: 'this.params.spacingMode === "center_exponential"' }, // Condicional
        { id: 'randomOffsetStddevM', label: 'Offset Aleatório (m)', type: 'number', min: 0, max: 1, step: 0.01 },
        { id: 'minSeparationFactor', label: 'Fator Sep. Mín.', type: 'number', min: 0.5, max: 2, step: 0.05, condition: 'this.params.randomOffsetStddevM > 0' } // Condicional
    ],
     // --- Grade Hexagonal ---
     hex_grid: [
        { id: 'numRingsHex', label: 'Nº Anéis Hex.', type: 'number', min: 0, max: 10, step: 1 },
        { id: 'spacingMode', label: 'Modo Espaçamento', type: 'select', options: [ { value: 'linear', label: 'Linear' }, { value: 'center_exponential', label: 'Exponencial Central' } ]},
        { id: 'spacingFactor', label: 'Fator Espaçamento', type: 'number', min: 0.1, max: 5, step: 0.1 },
        { id: 'centerExpScaleFactor', label: 'Fator Exp. Central', type: 'number', min: 0.5, max: 3, step: 0.05, condition: 'this.params.spacingMode === "center_exponential"' }, // Condicional
        { id: 'addCenterTile', label: 'Adicionar Tile Central', type: 'checkbox' },
        { id: 'randomOffsetStddevM', label: 'Offset Aleatório (m)', type: 'number', min: 0, max: 1, step: 0.01 },
        { id: 'minSeparationFactor', label: 'Fator Sep. Mín.', type: 'number', min: 0.5, max: 2, step: 0.05, condition: 'this.params.randomOffsetStddevM > 0' } // Condicional
    ],
    // --- Phyllotaxis ---
    phyllotaxis: [
        { id: 'numTiles', label: 'Número de Tiles', type: 'number', min: 1, max: 200, step: 1 },
        { id: 'spacingMode', label: 'Modo Espaçamento', type: 'select', options: [ { value: 'linear', label: 'Linear' }, { value: 'center_exponential', label: 'Exponencial Central' } ]},
        { id: 'scaleFactor', label: 'Fator de Escala', type: 'number', min: 0.1, max: 5, step: 0.1 },
        { id: 'centerOffsetFactor', label: 'Fator Offset Central', type: 'number', min: 0.01, max: 1, step: 0.01 },
        { id: 'centerExpScaleFactor', label: 'Fator Exp. Central', type: 'number', min: 0.5, max: 3, step: 0.05, condition: 'this.params.spacingMode === "center_exponential"' }, // Condicional
        { id: 'randomOffsetStddevM', label: 'Offset Aleatório (m)', type: 'number', min: 0, max: 1, step: 0.01 },
        { id: 'minSeparationFactor', label: 'Fator Sep. Mín.', type: 'number', min: 0.5, max: 2, step: 0.05, condition: 'this.params.randomOffsetStddevM > 0' } // Condicional
    ],
    // --- Circular Manual ---
    manual_circular: [
        { id: 'spacingMode', label: 'Modo Espaçamento', type: 'select', options: [ { value: 'linear', label: 'Linear' }, { value: 'center_exponential', label: 'Exponencial Central' } ]},
        { id: 'spacingXFactor', label: 'Fator Espaç. X', type: 'number', min: 0.1, max: 5, step: 0.1, condition: 'this.params.spacingMode === "linear"' }, // Condicional
        { id: 'spacingYFactor', label: 'Fator Espaç. Y', type: 'number', min: 0.1, max: 5, step: 0.1, condition: 'this.params.spacingMode === "linear"' }, // Condicional
        { id: 'centerExpScaleFactor', label: 'Fator Exp. Central', type: 'number', min: 0.5, max: 3, step: 0.05, condition: 'this.params.spacingMode === "center_exponential"' }, // Condicional
        { id: 'randomOffsetStddevM', label: 'Offset Aleatório (m)', type: 'number', min: 0, max: 1, step: 0.01 },
        { id: 'minSeparationFactor', label: 'Fator Sep. Mín.', type: 'number', min: 0.5, max: 2, step: 0.05, condition: 'this.params.randomOffsetStddevM > 0' } // Condicional
    ],
    // --- Aleatório ---
    random: [
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
        this.showCollisions = document.getElementById('show-collisions')?.checked || false; // Lê estado inicial
        this.collisions = []; // Armazena informações sobre colisões detectadas

        // Ajusta o tamanho do canvas e adiciona listener para redimensionamento
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());

        // Inicializa os controles da interface (dropdown, inputs dinâmicos, botões)
        this.initControls();

        // Gera o layout inicial com os parâmetros padrão
        // Adiciona um pequeno delay para garantir que a UI esteja pronta (opcional)
        // setTimeout(() => this.generateLayout(), 50);
         this.generateLayout(); // Tenta gerar imediatamente
    }

    /**
     * Redimensiona o canvas para preencher seu contêiner pai
     * e redesenha o layout atual, se houver.
     */
    resizeCanvas() {
        const container = this.canvas.parentElement;
        if (container) {
            // Define um tamanho mínimo para evitar colapso
            const minWidth = 200;
            const minHeight = 200;
            // Calcula altura disponível descontando a div de stats (aproximadamente)
            const statsHeight = container.querySelector('.stats')?.offsetHeight || 30;
            this.canvas.width = Math.max(container.clientWidth, minWidth);
            this.canvas.height = Math.max(container.clientHeight - statsHeight, minHeight);
        } else {
             // Fallback se o container não for encontrado
             this.canvas.width = 400;
             this.canvas.height = 400;
        }

        // Redesenha o layout após redimensionar
        this.drawLayout();
    }

    /**
     * Inicializa os elementos de controle da interface e adiciona
     * os event listeners necessários (mudança de tipo, botões, etc.).
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


        // Inicializa os controles dinâmicos para o tipo de layout padrão carregado
        this.updateDynamicControls();
    }

    /**
     * Atualiza a seção de parâmetros dinâmicos na interface com base
     * no tipo de layout atualmente selecionado (this.layoutType).
     * Cria labels e inputs/selects/checkboxes correspondentes.
     */
    updateDynamicControls() {
        const dynamicParamsDiv = document.getElementById('dynamic-params');
        if (!dynamicParamsDiv) {
             console.error("Elemento div#dynamic-params não encontrado. Controles dinâmicos não podem ser criados.");
             return;
        }
        dynamicParamsDiv.innerHTML = ''; // Limpa controles antigos

        // Obtém a definição de controles para o tipo de layout atual
        const controls = PARAM_CONTROLS[this.layoutType];
        if (!controls) {
             console.warn(`Nenhuma definição de controle encontrada para o tipo de layout: ${this.layoutType}`);
             return;
        }

        // Itera sobre cada definição de controle
        controls.forEach(control => {
            // Verifica se o controle tem uma condição para ser exibido
            let shouldShowControl = true; // Assume que mostra por padrão
            if (control.condition) {
                 shouldShowControl = this.evaluateCondition(control.condition);
            }

            if (shouldShowControl) {
                // Cria os elementos HTML para o controle
                const formGroup = document.createElement('div');
                formGroup.className = 'form-group';

                const label = document.createElement('label');
                label.setAttribute('for', control.id);
                label.textContent = control.label + ':'; // Adiciona ':' ao label
                formGroup.appendChild(label);

                let inputElement; // O elemento <input>, <select> ou <textarea>

                // Cria o tipo correto de elemento de input
                switch (control.type) {
                    case 'select':
                        inputElement = document.createElement('select');
                        inputElement.id = control.id;
                        inputElement.name = control.id; // Adiciona name para formulários
                        control.options.forEach(option => {
                            const optionElement = document.createElement('option');
                            optionElement.value = option.value;
                            optionElement.textContent = option.label;
                            // Seleciona a opção que corresponde ao valor atual nos parâmetros
                            // Compara como string para evitar problemas de tipo (ex: '1.0' vs 1)
                            if (String(this.params[control.id]) === String(option.value)) {
                                optionElement.selected = true;
                            }
                            inputElement.appendChild(optionElement);
                        });
                        // Event listener para atualizar params e layout ao mudar seleção
                        inputElement.addEventListener('change', () => {
                            this.params[control.id] = inputElement.value;
                            // Recria controles dependentes (ex: fator exponencial só aparece se modo for exponencial)
                            this.updateDynamicControls();
                            this.generateLayout();
                        });
                        break;

                    case 'checkbox':
                        inputElement = document.createElement('input');
                        inputElement.type = 'checkbox';
                        inputElement.id = control.id;
                         inputElement.name = control.id; // Adiciona name
                        inputElement.checked = this.params[control.id] || false; // Garante que seja booleano
                        // Event listener para atualizar params e layout ao marcar/desmarcar
                        inputElement.addEventListener('change', () => {
                            this.params[control.id] = inputElement.checked;
                             // Recria controles dependentes se a condição mudar
                             this.updateDynamicControls();
                            this.generateLayout();
                        });
                        break;

                    case 'number':
                    default: // Trata outros tipos (como 'text') como input padrão
                        inputElement = document.createElement('input');
                        inputElement.type = control.type;
                        inputElement.id = control.id;
                         inputElement.name = control.id; // Adiciona name
                        inputElement.value = this.params[control.id]; // Define valor inicial

                        // Define atributos min, max, step se existirem
                        if (control.min !== undefined) inputElement.min = control.min;
                        if (control.max !== undefined) inputElement.max = control.max;
                        if (control.step !== undefined) inputElement.step = control.step;

                        // Event listener para 'input' (atualiza enquanto digita/arrasta slider)
                        inputElement.addEventListener('input', () => {
                             let value = inputElement.value;
                             if (control.type === 'number') {
                                 value = parseFloat(value);
                                 // Não atualiza se for NaN durante a digitação
                                 if (isNaN(value) && inputElement.value !== '' && inputElement.value !== '-') return;
                             }
                             this.params[control.id] = value;
                             this.generateLayout(); // Atualiza o layout em tempo real
                        });
                         // Event listener para 'change' (atualiza quando perde o foco, útil para validação final ou condicionais)
                        inputElement.addEventListener('change', () => {
                             let value = inputElement.value;
                             let paramValue;
                             if (control.type === 'number') {
                                 paramValue = parseFloat(value);
                                 if (isNaN(paramValue)) {
                                     // Reverte para o valor padrão se inválido
                                     console.warn(`Valor inválido para ${control.id}: ${value}. Revertendo para padrão.`);
                                     paramValue = DEFAULT_PARAMS[this.layoutType][control.id];
                                     inputElement.value = paramValue; // Atualiza UI
                                 }
                                 // Aplica limites min/max
                                 if (control.min !== undefined) paramValue = Math.max(control.min, paramValue);
                                 if (control.max !== undefined) paramValue = Math.min(control.max, paramValue);
                                 inputElement.value = paramValue; // Atualiza UI com valor validado

                             } else {
                                  paramValue = value;
                             }

                             this.params[control.id] = paramValue;
                             // Recria controles dependentes se a condição mudou
                             this.updateDynamicControls();
                             this.generateLayout(); // Garante atualização final
                        });
                        break;
                }

                // Adiciona o elemento de input ao grupo e o grupo à div principal
                formGroup.appendChild(inputElement);
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
             if (this.params.hasOwnProperty(p2)) {
                 return `${p1}this.params.${p2}${p3}`;
             }
             return match; // Mantém se não for um parâmetro conhecido
        });

        try {
            // Cria uma função anônima no escopo da classe (this é acessível)
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
            const controlDef = controlsForType.find(c => c.id === key);
            if (controlDef && controlDef.type === 'number') {
                 const parsedValue = parseFloat(this.params[key]);
                 currentParamsSanitized[key] = isNaN(parsedValue) ? DEFAULT_PARAMS[this.layoutType][key] : parsedValue;
            } else {
                 // Trata booleanos de checkboxes corretamente
                 if (controlDef && controlDef.type === 'checkbox') {
                     currentParamsSanitized[key] = Boolean(this.params[key]);
                 } else {
                     currentParamsSanitized[key] = this.params[key];
                 }
            }
        }
        const fullParams = { ...currentParamsSanitized, ...commonParams };

        // Tratamento especial para 'tilesPerRing' no layout de Anéis
        if (this.layoutType === 'ring' && typeof fullParams.numRings === 'number' && fullParams.numRings > 0) {
            if (!Array.isArray(fullParams.tilesPerRing) || fullParams.tilesPerRing.length !== fullParams.numRings) {
                 fullParams.tilesPerRing = Array.from({ length: fullParams.numRings }, (_, i) => 8 * (i + 1));
                 console.log(`Gerador: 'tilesPerRing' recriado para ${fullParams.numRings} anéis:`, fullParams.tilesPerRing);
                 // Não atualiza this.params aqui, pois não há controle direto para o array
            }
            fullParams.tilesPerRing = fullParams.tilesPerRing.map(n => Math.max(1, parseInt(n) || 8));
        }


        // Chama a função da biblioteca BingoLayouts correspondente ao tipo selecionado
        try {
            if (!window.BingoLayouts) {
                throw new Error("Biblioteca BingoLayouts não está carregada ou disponível.");
            }

            // Usa um switch para chamar a função correta com os parâmetros corretos
            switch (this.layoutType) {
                 case 'grid':
                     this.currentLayout = window.BingoLayouts.createGridLayout(
                         fullParams.numCols, fullParams.numRows, fullParams.tileWidthM, fullParams.tileHeightM,
                         fullParams.spacingMode, fullParams.spacingXFactor, fullParams.spacingYFactor,
                         fullParams.centerExpScaleFactor, fullParams.randomOffsetStddevM, fullParams.minSeparationFactor,
                         fullParams.maxPlacementAttempts, fullParams.centerLayout
                     );
                     break;
                 case 'spiral':
                     this.currentLayout = window.BingoLayouts.createSpiralLayout(
                         fullParams.numArms, fullParams.tilesPerArm, fullParams.tileWidthM, fullParams.tileHeightM,
                         fullParams.armSpacingMode, fullParams.centerScaleMode, fullParams.radiusStartFactor,
                         fullParams.radiusStepFactor, fullParams.centerExpScaleFactor, fullParams.angleStepRad,
                         fullParams.armOffsetRad, fullParams.rotationPerArmRad, fullParams.randomOffsetStddevM,
                         fullParams.minSeparationFactor, fullParams.maxPlacementAttempts, fullParams.centerLayout,
                         fullParams.includeCenterTile
                     );
                     break;
                 case 'ring':
                     this.currentLayout = window.BingoLayouts.createRingLayout(
                         fullParams.numRings, fullParams.tilesPerRing, fullParams.tileWidthM, fullParams.tileHeightM,
                         fullParams.ringSpacingMode, fullParams.centerScaleMode, fullParams.radiusStartFactor,
                         fullParams.radiusStepFactor, fullParams.centerExpScaleFactor, fullParams.angleOffsetRad,
                         fullParams.randomOffsetStddevM, fullParams.minSeparationFactor,
                         fullParams.maxPlacementAttempts, fullParams.centerLayout, fullParams.addCenterTile
                     );
                     break;
                case 'rhombus':
                     this.currentLayout = window.BingoLayouts.createRhombusLayout(
                         fullParams.numRowsHalf, fullParams.tileWidthM, fullParams.tileHeightM, fullParams.spacingMode,
                         fullParams.sideLengthFactor, fullParams.hCompressFactor, fullParams.vCompressFactor,
                         fullParams.centerExpScaleFactor, fullParams.randomOffsetStddevM, fullParams.minSeparationFactor,
                         fullParams.maxPlacementAttempts, fullParams.centerLayout
                     );
                     break;
                case 'hex_grid':
                     this.currentLayout = window.BingoLayouts.createHexGridLayout(
                         fullParams.numRingsHex, fullParams.tileWidthM, fullParams.tileHeightM, fullParams.spacingMode,
                         fullParams.spacingFactor, fullParams.centerExpScaleFactor, fullParams.addCenterTile,
                         fullParams.randomOffsetStddevM, fullParams.minSeparationFactor,
                         fullParams.maxPlacementAttempts, fullParams.centerLayout
                     );
                      break;
                case 'phyllotaxis':
                      this.currentLayout = window.BingoLayouts.createPhyllotaxisLayout(
                         fullParams.numTiles, fullParams.tileWidthM, fullParams.tileHeightM, fullParams.spacingMode,
                         fullParams.scaleFactor, fullParams.centerOffsetFactor, fullParams.centerExpScaleFactor,
                         fullParams.randomOffsetStddevM, fullParams.minSeparationFactor,
                         fullParams.maxPlacementAttempts, fullParams.centerLayout
                     );
                     break;
                case 'manual_circular':
                     this.currentLayout = window.BingoLayouts.createManualCircularLayout(
                         fullParams.tileWidthM, fullParams.tileHeightM, fullParams.spacingMode, fullParams.spacingXFactor,
                         fullParams.spacingYFactor, fullParams.centerExpScaleFactor, fullParams.randomOffsetStddevM,
                         fullParams.minSeparationFactor, fullParams.maxPlacementAttempts, fullParams.centerLayout
                     );
                     break;
                case 'random':
                     this.currentLayout = window.BingoLayouts.createRandomLayout(
                         fullParams.numTiles, fullParams.maxRadiusM, fullParams.tileWidthM, fullParams.tileHeightM,
                         fullParams.minSeparationFactor, fullParams.maxPlacementAttempts, fullParams.centerLayout
                     );
                     break;
                 default:
                     throw new Error(`Tipo de layout desconhecido ou função não implementada: ${this.layoutType}`);
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
                if (window.interactiveMap) {
                    stations = window.interactiveMap.getSelectedCoordinates();
                }
                window.updateExportFields(this.currentLayout, stations);
            }

        } catch (error) {
            console.error(`Erro ao gerar layout '${this.layoutType}':`, error);
            alert(`Erro ao gerar layout '${this.layoutType}'. Verifique os parâmetros e o console (F12).`);
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
     * Atualiza a interface e gera/desenha o novo layout.
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
                        let randomValue = Math.random() * (control.max - control.min) + control.min;
                        if (control.step) {
                            randomValue = Math.round(randomValue / control.step) * control.step;
                        }
                        // Garante que o valor final esteja dentro dos limites
                        this.params[control.id] = Math.max(control.min, Math.min(control.max, randomValue));
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

        // Atualiza os elementos da interface para refletir os novos valores aleatórios
        this.updateDynamicControls();

        // Gera e desenha o layout com os novos parâmetros aleatórios
        this.generateLayout();
    }


    /**
     * Desenha o layout atual (centros dos tiles e antenas individuais) no canvas.
     * Inclui desenho da escala e indicação de colisões (se habilitado).
     */
    drawLayout() {
        const ctx = this.ctx;
        const canvas = this.canvas;

        // Limpa completamente o canvas antes de desenhar
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Verifica se há dados para desenhar
        if (!this.currentLayout || this.allAntennas.length === 0) {
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
        for (const antenna of this.allAntennas) {
            minX = Math.min(minX, antenna[0]); maxX = Math.max(maxX, antenna[0]);
            minY = Math.min(minY, antenna[1]); maxY = Math.max(maxY, antenna[1]);
        }

        // Adiciona uma margem para não colar nas bordas e para a escala
        const margin = 50;
        const contentWidth = (maxX - minX);
        const contentHeight = (maxY - minY);
        const effectiveWidth = Math.max(contentWidth, 1); // Evita divisão por zero
        const effectiveHeight = Math.max(contentHeight, 1);

        const availableWidth = canvas.width - 2 * margin;
        const availableHeight = canvas.height - 2 * margin;

        if (availableWidth <= 0 || availableHeight <= 0) {
            console.warn("Área do canvas (descontando margens) é muito pequena para desenhar.");
            return;
        }

        // Calcula a escala (mantém proporção)
        const scale = Math.min(availableWidth / effectiveWidth, availableHeight / effectiveHeight);

        // Calcula o offset para centralizar o CONTEÚDO (baseado em minX/maxX/...)
        const offsetX = margin + (availableWidth - contentWidth * scale) / 2;
        const offsetY = margin + (availableHeight - contentHeight * scale) / 2;

        // --- Função de Transformação de Coordenadas ---
        // Converte coordenadas do layout (X,Y - origem no centro, Y para cima)
        // para coordenadas do canvas (x,y - origem no topo-esquerdo, y para baixo)
        const transformCoord = (coordX, coordY) => {
            const canvasX = (coordX - minX) * scale + offsetX;
            // Inverte o Y: (maxY - coordY) dá a posição relativa ao topo do conteúdo
            const canvasY = (maxY - coordY) * scale + offsetY;
            return { x: canvasX, y: canvasY };
        };

        // --- Desenho ---

        // 1. Desenha a escala e eixos (passa a função de transformação)
        this.drawScale(ctx, canvas, scale, minX, minY, maxX, maxY, transformCoord);

        // 2. Desenha os centros dos tiles
        const centerColor = getComputedStyle(document.body).getPropertyValue('--secondary-color') || 'red';
        ctx.fillStyle = centerColor;
        for (const center of this.currentLayout) {
            const { x, y } = transformCoord(center[0], center[1]);
            ctx.beginPath();
            ctx.arc(x, y, 3, 0, Math.PI * 2); // Raio 3 pixels
            ctx.fill();
        }

        // 3. Desenha todas as antenas individuais
        const antennaColor = getComputedStyle(document.body).getPropertyValue('--primary-color') || '#3498db';
        ctx.fillStyle = antennaColor;
        for (const antenna of this.allAntennas) {
            const { x, y } = transformCoord(antenna[0], antenna[1]);
            ctx.beginPath();
            ctx.arc(x, y, 1.5, 0, Math.PI * 2); // Raio 1.5 pixels
            ctx.fill();
        }

        // 4. Desenha as colisões (se habilitado e houver colisões)
        if (this.showCollisions && this.collisions.length > 0) {
            const collisionColor = getComputedStyle(document.body).getPropertyValue('--secondary-color') || 'red';
            ctx.strokeStyle = collisionColor;
            ctx.lineWidth = 1.5; // Linha um pouco mais fina
            ctx.globalAlpha = 0.6; // Leve transparência

            for (const collision of this.collisions) {
                const tile1 = this.currentLayout[collision.tile1Index];
                const tile2 = this.currentLayout[collision.tile2Index];

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
     * @param {CanvasRenderingContext2D} ctx Contexto do canvas.
     * @param {HTMLCanvasElement} canvas Elemento canvas.
     * @param {number} scale Fator de escala (pixels por metro).
     * @param {number} minX Valor mínimo de X no layout (metros).
     * @param {number} minY Valor mínimo de Y no layout (metros).
     * @param {number} maxX Valor máximo de X no layout (metros).
     * @param {number} maxY Valor máximo de Y no layout (metros).
     * @param {function} transformCoord Função que converte (layoutX, layoutY) para {x: canvasX, y: canvasY}.
     */
    drawScale(ctx, canvas, scale, minX, minY, maxX, maxY, transformCoord) {
        const layoutWidth = maxX - minX;
        const layoutHeight = maxY - minY;

        // --- Determinar Intervalo da Escala ---
        const maxDimension = Math.max(layoutWidth, layoutHeight);
        let scaleInterval = 1;
        if (maxDimension > 1e-6) {
            const targetTicks = 8; // Número aproximado de marcas desejadas
            const roughInterval = maxDimension / targetTicks;
            const orderOfMagnitude = Math.pow(10, Math.floor(Math.log10(roughInterval)));
            if (roughInterval / orderOfMagnitude < 1.5) scaleInterval = 1 * orderOfMagnitude;
            else if (roughInterval / orderOfMagnitude < 3.5) scaleInterval = 2 * orderOfMagnitude;
            else if (roughInterval / orderOfMagnitude < 7.5) scaleInterval = 5 * orderOfMagnitude;
            else scaleInterval = 10 * orderOfMagnitude;
            scaleInterval = Math.max(scaleInterval, 1e-3); // Garante intervalo mínimo
        } else if (maxDimension === 0) {
            scaleInterval = 1; // Caso onde todos os pontos estão no mesmo lugar
        }
        const scalePrecision = scaleInterval < 0.1 ? 2 : (scaleInterval < 1 ? 1 : 0);

        // Calcula limites da escala arredondados
        const xStart = Math.floor(minX / scaleInterval) * scaleInterval;
        const xEnd = Math.ceil(maxX / scaleInterval) * scaleInterval;
        const yStart = Math.floor(minY / scaleInterval) * scaleInterval;
        const yEnd = Math.ceil(maxY / scaleInterval) * scaleInterval;

        // --- Configuração de Estilo ---
        const scaleColor = getComputedStyle(document.body).getPropertyValue('--text-color') || '#888';
        ctx.strokeStyle = scaleColor;
        ctx.fillStyle = scaleColor;
        ctx.lineWidth = 0.5;
        ctx.font = '10px Segoe UI, Tahoma, Geneva, Verdana, sans-serif';
        const tickSize = 5;
        const textMargin = 3;

        // --- CORREÇÃO: Definir epsilon aqui ---
        const epsilon = 1e-9; // Pequena tolerância para comparações com zero

        // --- Desenha Marcas e Textos ---
        // Eixo X (na parte inferior do canvas)
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        for (let x = xStart; x <= xEnd; x += scaleInterval) {
            // Evita desenhar 0.0 se o eixo Y já estiver lá (comparação com epsilon)
            if (Math.abs(x) < epsilon && minX <= 0 && maxX >= 0) continue;
            const { x: xPos } = transformCoord(x, minY);
            const yPos = canvas.height - tickSize - textMargin;
            ctx.beginPath();
            ctx.moveTo(xPos, canvas.height - textMargin);
            ctx.lineTo(xPos, yPos);
            ctx.stroke();
            ctx.fillText(`${x.toFixed(scalePrecision)}`, xPos, yPos - 10);
        }

        // Eixo Y (na parte esquerda do canvas)
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        for (let y = yStart; y <= yEnd; y += scaleInterval) {
            // Evita desenhar 0.0 se o eixo X já estiver lá (comparação com epsilon)
             if (Math.abs(y) < epsilon && minY <= 0 && maxY >= 0) continue;
            const { y: yPos } = transformCoord(minX, y);
            const xPos = tickSize + textMargin;
            ctx.beginPath();
            ctx.moveTo(textMargin, yPos);
            ctx.lineTo(xPos, yPos);
            ctx.stroke();
            ctx.fillText(`${y.toFixed(scalePrecision)}`, xPos + 10, yPos); // Ajustado para margem
        }

        // --- Desenha Eixos X=0 e Y=0 (se visíveis) ---
        const axisColor = getComputedStyle(document.body).getPropertyValue('--border-color') || '#aaa';
        ctx.strokeStyle = axisColor;
        ctx.lineWidth = 1;
        // Eixo Y (linha vertical em X=0)
        if (minX <= epsilon && maxX >= -epsilon) {
            const { x: zeroX } = transformCoord(0, minY);
            const { y: topY } = transformCoord(0, maxY);
            const { y: bottomY } = transformCoord(0, minY);
            ctx.beginPath();
            ctx.moveTo(zeroX, topY);
            ctx.lineTo(zeroX, bottomY);
            ctx.stroke();
        }
        // Eixo X (linha horizontal em Y=0)
        if (minY <= epsilon && maxY >= -epsilon) {
            const { y: zeroY } = transformCoord(minX, 0);
            const { x: leftX } = transformCoord(minX, 0);
            const { x: rightX } = transformCoord(maxX, 0);
            ctx.beginPath();
            ctx.moveTo(leftX, zeroY);
            ctx.lineTo(rightX, zeroY);
            ctx.stroke();
        }

        // --- Desenha Rótulos dos Eixos ---
        ctx.fillStyle = scaleColor;
        ctx.font = '12px Segoe UI, Tahoma, Geneva, Verdana, sans-serif';
        // Rótulo X
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText('X (metros)', canvas.width / 2, canvas.height - 2);
        // Rótulo Y (Rotacionado)
        ctx.save();
        ctx.translate(15, canvas.height / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText('Y (metros)', 0, 0);
        ctx.restore();
    } // FIM DO MÉTODO drawScale


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
        let collisionInfoDiv = document.getElementById('collision-info');
        const statsDiv = document.querySelector('.stats'); // Onde adicionar a div

        // Cria a estrutura HTML se não existir
        if (!collisionInfoDiv && statsDiv && statsDiv.parentNode) {
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
            });

            collisionInfoDiv.appendChild(header);
            collisionInfoDiv.appendChild(content);
            statsDiv.parentNode.insertBefore(collisionInfoDiv, statsDiv.nextSibling);
        } else if (!collisionInfoDiv) {
             console.warn("Div '.stats' não encontrada, não foi possível criar/atualizar a seção de colisões.");
             return;
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

        collisionContentDiv.innerHTML = '';
        if (numCollisions > 0) {
            const list = document.createElement('ul');
            const maxCollisionsToShow = 50;
            for (let i = 0; i < Math.min(numCollisions, maxCollisionsToShow); i++) {
                const collision = this.collisions[i];
                const item = document.createElement('li');
                item.textContent = `Tile ${collision.tile1Index + 1} e Tile ${collision.tile2Index + 1} (Dist. Centros: ${collision.distance.toFixed(3)}m)`;
                list.appendChild(item);
            }
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
if (typeof window !== 'undefined') {
    // Cria a instância global do gerador APÓS a definição da classe
    window.antennaGenerator = new AntennaLayoutGenerator();
    console.log("Instância de AntennaLayoutGenerator criada.");
} else {
    console.warn("Ambiente não-navegador detectado. 'window.antennaGenerator' não foi criado.");
}