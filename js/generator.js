/**
 * generator.js
 *
 * Módulo para geração e visualização de layouts de centros de tiles e suas antenas.
 * Utiliza a biblioteca `BingoLayouts` (bingo_layouts.js) para os algoritmos
 * de geração e desenha o resultado em um canvas HTML.
 * Permite ajustar parâmetros dinamicamente via interface, visualizar colisões
 * entre tiles e baixar a imagem do layout gerado.
 * Redesenha automaticamente ao mudar o tipo de layout, parâmetros ou tema da página.
 *
 * Principais funcionalidades:
 * - Define parâmetros padrão para diferentes tipos de layout.
 * - Cria dinamicamente controles na UI com base no tipo de layout selecionado.
 * - Utiliza `BingoLayouts` para calcular as posições dos centros dos tiles.
 * - Gera as posições das 64 antenas dentro de cada tile.
 * - Verifica e visualiza colisões retangulares entre tiles.
 * - Desenha o layout (tiles, antenas, colisões, eixos/escala) no canvas.
 * - Atualiza estatísticas (contagem de tiles/antenas).
 * - Dispara um evento global ('layoutGenerated') após a conclusão da geração
 *   e atualização de dados, notificando outros módulos (ex: beam_pattern, export)
 *   para que reajam ao novo layout.
 * - Permite baixar a imagem do layout com opções de tema e inclusão de eixos.
 */

// === Constantes Globais ===
// Dimensões físicas estimadas de um tile BINGO em metros.
const TILE_WIDTH = 0.35;
const TILE_HEIGHT = 1.34;
// Número fixo de antenas por tile.
const ANTENNAS_PER_TILE = 64;

// Parâmetros para o layout interno de 64 antenas de um tile (formato diamante 2x8).
// Estes são usados para gerar as antenas individuais dentro de cada centro de tile.
const SUBGROUP_N = 2; // Número de subgrupos na direção "larga" do tile (X)
const SUBGROUP_M = 8; // Número de subgrupos na direção "estreita" do tile (Y)
// Espaçamento entre os centros dos subgrupos de 4 antenas dentro de um tile.
const SUBGROUP_DX = 0.1760695885; // Espaçamento em X (largo)
const SUBGROUP_DY = 0.1675843071; // Espaçamento em Y (estreito)
// Offset das 4 antenas em forma de "diamante" ao redor do centro de cada subgrupo.
const DIAMOND_OFFSET = 0.05;

// Parâmetros Padrão para cada tipo de layout.
// Incluem o fator de escalonamento exponencial central (centerExpScaleFactor),
// que agora substitui os modos de espaçamento. 1.0 = espaçamento linear.
const DEFAULT_PARAMS = {
    grid: { numCols: 12, numRows: 3, spacingXFactor: 1.0, spacingYFactor: 1.0, centerExpScaleFactor: 1.0, randomOffsetStddevM: 0.0, minSeparationFactor: 1.0 },
    spiral: { numArms: 3, tilesPerArm: 12, radiusStartFactor: 0.7, radiusStepFactor: 0.3, centerExpScaleFactor: 1.0, angleStepRad: Math.PI / 9, armOffsetRad: 0.0, rotationPerArmRad: 0.0, randomOffsetStddevM: 0.0, minSeparationFactor: 1.0, includeCenterTile: false },
    ring: { numRings: 3, tilesPerRing: [8, 16, 24], radiusStartFactor: 1.0, radiusStepFactor: 1.0, centerExpScaleFactor: 1.0, angleOffsetRad: 0.0, randomOffsetStddevM: 0.0, minSeparationFactor: 1.0, addCenterTile: false },
    rhombus: { numRowsHalf: 6, sideLengthFactor: 0.65, hCompressFactor: 0.778, vCompressFactor: 0.86, centerExpScaleFactor: 1.0, randomOffsetStddevM: 0.0, minSeparationFactor: 1.0 },
    hex_grid: { numRingsHex: 3, spacingFactor: 0.8, centerExpScaleFactor: 1.0, addCenterTile: true, randomOffsetStddevM: 0.0, minSeparationFactor: 1.0 },
    phyllotaxis: { numTiles: 50, scaleFactor: 0.6, centerOffsetFactor: 0.25, centerExpScaleFactor: 1.0, randomOffsetStddevM: 0.0, minSeparationFactor: 1.0 },
    manual_circular: { spacingXFactor: 1.0, spacingYFactor: 1.0, centerExpScaleFactor: 1.0, randomOffsetStddevM: 0.0, minSeparationFactor: 1.0 },
    random: { numTiles: 36, maxRadiusM: 4.0, minSeparationFactor: 1.0 } // Nota: random não usa centerExpScaleFactor ou randomOffsetStddevM no mesmo sentido que os outros.
};

// Definição dos controles dinâmicos para cada tipo de layout.
// Usado para gerar a UI no control-panel. Inclui tipo de input, range, e condição de exibição.
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
     * Construtor da classe. Inicializa o canvas, os parâmetros padrão,
     * os controles da interface e configura listeners.
     */
    constructor() {
        // Referências para o canvas e seu contexto de desenho.
        this.canvas = document.getElementById('layout-canvas');
        if (!this.canvas) {
            console.error("Erro Fatal: Elemento canvas#layout-canvas não encontrado!");
            alert("Erro na inicialização: Canvas de visualização não encontrado.");
            // Retorna cedo se o canvas não for encontrado para evitar erros subsequentes.
            return;
        }
        this.ctx = this.canvas.getContext('2d');

        // Estado atual do gerador.
        this.layoutType = document.getElementById('layout-type')?.value || 'grid'; // Tipo de layout selecionado na UI.
        // Copia os parâmetros padrão para o tipo de layout inicial.
        this.params = JSON.parse(JSON.stringify(DEFAULT_PARAMS[this.layoutType]));
        this.currentLayout = []; // Coordenadas [x, y] dos centros dos tiles.
        this.allAntennas = [];   // Coordenadas [x, y] de TODAS as 64*N antenas individuais.
        this.collisions = [];    // Array de objetos descrevendo colisões detectadas.

        // Estado para controlar a visualização de colisões.
        this.showCollisions = true; // Padrão: mostrar colisões.
        const showCollisionsCheckbox = document.getElementById('show-collisions');
        if (showCollisionsCheckbox) {
            showCollisionsCheckbox.checked = this.showCollisions;
        } else {
            console.warn("Elemento input#show-collisions não encontrado durante inicialização.");
        }

        // Referências para os controles de download da imagem (serão buscados no initControls).
        this.downloadImageBtn = null;
        this.imageThemeRadios = null;
        this.imageAxesRadios = null;

        // Ajusta o tamanho inicial do canvas.
        this.resizeCanvas();
        
        // Inicializa os controles da interface (parâmetros dinâmicos, botões, download).
        this.initControls();

        // **NOVO**: Adiciona listener para o evento global 'themeChanged'.
        // Quando o tema mudar, redesenha o layout do canvas com as novas cores.
        window.addEventListener('themeChanged', () => {
            console.log('Generator: Evento "themeChanged" recebido. Redesenhando layout do canvas.');
            this.drawLayout(); // Redesenha o canvas com as cores do novo tema.
        });

        // A geração do layout inicial é adiada para main.js para garantir
        // que todos os módulos (mapa, exportação, padrão de feixe) estejam prontos
        // para receber o evento 'layoutGenerated'.
    }

    /**
     * Redimensiona o elemento canvas para preencher seu container pai (`.visualization`).
     * Recalcula o tamanho com base no espaço disponível, considerando outros elementos
     * como as estatísticas e info de colisão. Redesenha o layout após o redimensionamento.
     */
    resizeCanvas() {
        // Encontra o container pai.
        const container = this.canvas?.parentElement;
        if (!container) {
            console.warn("Container pai do canvas não encontrado, canvas não redimensionado.");
            // Fallback para um tamanho fixo se o container não for encontrado.
             this.canvas.width = 400;
             this.canvas.height = 350;
             this.drawLayout(); // Redesenha mesmo com tamanho fixo.
            return;
        }

        const style = getComputedStyle(container);
        // Calcula a largura e altura disponíveis dentro do container, descontando padding.
        const containerWidth = container.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
        const containerHeight = container.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);

        // Calcula a altura ocupada pelos outros elementos dentro do container `.visualization`.
        const statsDiv = container.querySelector('.stats');
        const statsHeight = statsDiv ? statsDiv.offsetHeight : 0;
        const collisionInfoDiv = container.querySelector('.collision-info');
        // Adiciona altura apenas se a seção de colisão estiver visível ou prestes a ser (com header).
        const collisionInfoHeight = collisionInfoDiv ? (collisionInfoDiv.offsetHeight || collisionInfoDiv.querySelector('.collision-header')?.offsetHeight || 0) : 0;


        // Altura efetivamente disponível para o canvas.
        const availableHeight = containerHeight - statsHeight - collisionInfoHeight;

        // Define um tamanho mínimo para o canvas.
        const minWidth = 200;
        const minHeight = 150;

        // Aplica o novo tamanho ao canvas.
        this.canvas.width = Math.max(containerWidth, minWidth);
        this.canvas.height = Math.max(availableHeight, minHeight);

        // Redesenha o layout para se ajustar ao novo tamanho do canvas.
        this.drawLayout();
    }

    /**
     * Inicializa os controles da interface do usuário e configura seus listeners de eventos.
     * Isso inclui o seletor de tipo de layout, botões de gerar/aleatório, checkbox de colisões,
     * e os controles para download da imagem do layout.
     */
    initControls() {
        const layoutTypeSelect = document.getElementById('layout-type');
        const generateBtn = document.getElementById('generate-btn');
        const randomBtn = document.getElementById('random-btn');
        const showCollisionsCheckbox = document.getElementById('show-collisions');

        // Listener para o seletor de tipo de layout.
        // Ao mudar o tipo, atualiza os parâmetros, os controles dinâmicos e gera um novo layout.
        if (layoutTypeSelect) {
            layoutTypeSelect.addEventListener('change', () => {
                this.layoutType = layoutTypeSelect.value;
                // Reseta os parâmetros para os padrões do novo tipo de layout.
                this.params = JSON.parse(JSON.stringify(DEFAULT_PARAMS[this.layoutType]));
                this.updateDynamicControls(); // Atualiza a UI com os controles corretos.
                this.generateLayout(); // Gera o novo layout automaticamente.
            });
        } else { console.warn("Elemento select#layout-type não encontrado."); }

        // Listener para o botão "Gerar Layout".
        // Chama a função principal de geração de layout.
        if (generateBtn) {
            generateBtn.addEventListener('click', () => this.generateLayout());
        } else { console.warn("Elemento button#generate-btn não encontrado."); }

        // Listener para o botão "Gerar Aleatório".
        // Chama a função para gerar parâmetros aleatórios e depois gera o layout.
        if (randomBtn) {
            randomBtn.addEventListener('click', () => this.generateRandomLayout());
        } else { console.warn("Elemento button#random-btn não encontrado."); }

        // Listener para o checkbox "Mostrar Colisões".
        // Apenas atualiza o estado interno e redesenha o canvas (não recalcula o layout).
        if (showCollisionsCheckbox) {
            showCollisionsCheckbox.addEventListener('change', () => {
                this.showCollisions = showCollisionsCheckbox.checked;
                this.drawLayout(); // Redesenha para mostrar/esconder colisões.
            });
        } else { console.warn("Elemento input#show-collisions não encontrado."); }


        // --- Controles para Download da Imagem ---
        this.downloadImageBtn = document.getElementById('download-image-btn');
        this.imageThemeRadios = document.querySelectorAll('input[name="imageTheme"]');
        this.imageAxesRadios = document.querySelectorAll('input[name="imageAxes"]');

        if (this.downloadImageBtn) {
            this.downloadImageBtn.addEventListener('click', () => this.downloadLayoutImage());
        } else {
            console.warn("Botão de download da imagem (download-image-btn) não encontrado.");
        }
        // --- Fim dos Controles de Download ---

        // Cria os controles de parâmetros dinâmicos iniciais com base no layout padrão.
        this.updateDynamicControls();
    }

    /**
     * Atualiza os controles de parâmetros na interface do usuário
     * com base no `layoutType` atual. Limpa os controles antigos
     * e cria novos inputs (número, checkbox) vinculados aos `this.params`.
     * Configura listeners para gerar o layout automaticamente ao mudar um parâmetro.
     */
    updateDynamicControls() {
        const dynamicParamsDiv = document.getElementById('dynamic-params');
        if (!dynamicParamsDiv) {
             console.error("Div #dynamic-params não encontrada.");
            return;
        }
        dynamicParamsDiv.innerHTML = ''; // Limpa controles anteriores.

        // Obtém a definição dos controles para o tipo de layout atual.
        const controls = PARAM_CONTROLS[this.layoutType];
        if (!controls) {
            console.warn(`Nenhuma definição de controle encontrada para o tipo de layout: ${this.layoutType}`);
            return;
        }

        // Cria e adiciona cada controle definido.
        controls.forEach(control => {
            // Verifica se o controle deve ser exibido com base em sua condição (se houver).
            let shouldShowControl = true;
            if (control.condition) {
                 shouldShowControl = this.evaluateCondition(control.condition);
            }

            if (shouldShowControl) {
                const formGroup = document.createElement('div'); formGroup.className = 'form-group';
                const label = document.createElement('label'); label.setAttribute('for', control.id);
                label.textContent = control.label + ':'; formGroup.appendChild(label);
                let inputElement;

                // Cria o input/select com base no tipo de controle.
                switch (control.type) {
                    case 'select': // (Não usado atualmente nos defaults, mas mantido por segurança)
                        inputElement = document.createElement('select'); inputElement.id = control.id; inputElement.name = control.id;
                        control.options.forEach(option => { const opt = document.createElement('option'); opt.value = option.value; opt.textContent = option.label; if (String(this.params[control.id]) === String(option.value)) opt.selected = true; inputElement.appendChild(opt); });
                        // Listener: Atualiza o parâmetro e gera layout ao mudar seleção.
                        inputElement.addEventListener('change', () => { this.params[control.id] = inputElement.value; this.updateDynamicControls(); this.generateLayout(); });
                        formGroup.appendChild(inputElement);
                        break;

                    case 'checkbox':
                        inputElement = document.createElement('input'); inputElement.type = 'checkbox'; inputElement.id = control.id; inputElement.name = control.id;
                         // Define o estado inicial do checkbox.
                        inputElement.checked = this.params[control.id] !== undefined ? Boolean(this.params[control.id]) : false;
                        const chkContainer = document.createElement('div'); chkContainer.style.display = 'flex'; chkContainer.style.alignItems = 'center'; chkContainer.appendChild(inputElement);
                         // Listener: Atualiza o parâmetro e gera layout ao marcar/desmarcar.
                        inputElement.addEventListener('change', () => {
                            this.params[control.id] = inputElement.checked;
                            this.updateDynamicControls(); // Pode afetar a visibilidade de outros controles.
                            this.generateLayout();
                        });
                        formGroup.appendChild(chkContainer);
                        break;

                    case 'number': // Cria um slider e um input numérico sincronizados.
                        const sliderGroup = document.createElement('div'); sliderGroup.className = 'slider-group';
                        const sliderInput = document.createElement('input'); sliderInput.type = 'range'; sliderInput.id = control.id + '-slider'; sliderInput.name = control.id + '-slider';
                        // Configura min/max/step do slider com base na definição.
                        if (control.min !== undefined) sliderInput.min = control.min;
                        if (control.max !== undefined) sliderInput.max = control.max;
                        if (control.step !== undefined) sliderInput.step = control.step;
                        sliderInput.value = this.params[control.id]; // Define valor inicial.
                        sliderGroup.appendChild(sliderInput);

                        const numberInput = document.createElement('input'); numberInput.type = 'number'; numberInput.id = control.id; numberInput.name = control.id;
                         // Configura min/max/step do input numérico com base na definição.
                         if (control.min !== undefined) numberInput.min = control.min;
                         if (control.max !== undefined) numberInput.max = control.max;
                         if (control.step !== undefined) numberInput.step = control.step;
                         numberInput.value = this.params[control.id]; // Define valor inicial.
                        sliderGroup.appendChild(numberInput);

                        // --- Sincronização e Listeners ---
                        // Slider -> Number Input & Generate (contínuo enquanto arrasta)
                        sliderInput.addEventListener('input', () => {
                            const v = parseFloat(sliderInput.value);
                            numberInput.value = v; // Sincroniza o input numérico.
                            this.params[control.id] = v; // Atualiza o parâmetro.
                            this.generateLayout(); // Gera layout a cada mudança no slider.
                        });
                        // Number Input -> Slider & Generate (ao digitar)
                         numberInput.addEventListener('input', () => {
                             let v = parseFloat(numberInput.value);
                             // Validação básica enquanto digita.
                             if (!isNaN(v)) {
                                 if (control.min !== undefined) v = Math.max(control.min, v);
                                 if (control.max !== undefined) v = Math.min(control.max, v);
                                 sliderInput.value = v; // Sincroniza o slider.
                                 this.params[control.id] = v; // Atualiza o parâmetro (pode ser valor ainda não final).
                                 this.generateLayout(); // Gera layout a cada input no número.
                             }
                         });
                         // Number Input -> Final Sync & Generate (ao perder foco/Enter)
                         numberInput.addEventListener('change', () => {
                             let v = parseFloat(numberInput.value);
                             // Validação final e correção do valor.
                             if (isNaN(v)) { v = parseFloat(sliderInput.value); numberInput.value = v; } // Reverte se inválido
                             if (control.min !== undefined) v = Math.max(control.min, v);
                             if (control.max !== undefined) v = Math.min(control.max, v);
                             // Arredonda para a precisão do step se step estiver definido.
                             if (control.step !== undefined && control.step !== 0) {
                                 const dp = (String(control.step).split('.')[1] || '').length;
                                 v = parseFloat((Math.round(v / control.step) * control.step).toFixed(dp));
                             }

                             // Atualiza input e slider com o valor corrigido.
                             numberInput.value = v;
                             sliderInput.value = v;

                             // Gera layout APENAS se o valor corrigido for diferente do parâmetro atual,
                             // para evitar regenerações desnecessárias.
                             if(this.params[control.id] !== v) {
                                 this.params[control.id] = v;
                                 this.updateDynamicControls(); // Pode afetar a visibilidade de outros controles.
                                 this.generateLayout();
                             }
                         });

                        formGroup.appendChild(sliderGroup);
                        break;

                    default:
                        console.warn(`Tipo de controle dinâmico não tratado: ${control.type}`);
                        break;
                }
                dynamicParamsDiv.appendChild(formGroup); // Adiciona o grupo de form ao DOM.
            }
        });

        // Tratamento especial para 'ring': adicionar input para tilesPerRing se numRings > 0
        if (this.layoutType === 'ring') {
             const numRingsControl = controls.find(c => c.id === 'numRings');
             const numRings = numRingsControl ? parseInt(this.params.numRings) : 0;

             // Verifica se existe um campo tilesPerRing e se ele está correto.
             // Se não estiver, cria/regenera o array padrão.
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
                 // Exibe o array atual como uma string CSV.
                 textInput.value = this.params.tilesPerRing.join(', ');

                 // Listener para o input de texto de tiles por anel.
                 textInput.addEventListener('change', () => {
                     const rawValue = textInput.value.trim();
                     // Tenta parsear a string CSV em um array de números inteiros.
                     const parsedArray = rawValue.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n) && n >= 1);

                     // Valida se o número de anéis parseados corresponde ao `numRings` atual.
                     if (parsedArray.length === numRings) {
                         this.params.tilesPerRing = parsedArray;
                         console.log("tilesPerRing atualizado:", this.params.tilesPerRing);
                         this.generateLayout(); // Gera layout com os novos números de tiles por anel.
                     } else {
                         // Se o parse falhou ou o número de valores não corresponde, reverte o input
                         // para o valor atual dos parâmetros e informa o usuário.
                         textInput.value = this.params.tilesPerRing.join(', ');
                         alert(`O número de valores de Tiles por Anel (${parsedArray.length}) não corresponde ao Número de Anéis selecionado (${numRings}). Por favor, insira ${numRings} números separados por vírgula.`);
                     }
                 });

                 formGroup.appendChild(textInput);
                 dynamicParamsDiv.appendChild(formGroup);
             }
        }
    }

    /**
     * Avalia uma string de condição JavaScript usando os parâmetros atuais (`this.params`).
     * Usado para determinar se um controle dinâmico deve ser exibido.
     * @param {string} conditionString A string da condição (ex: 'this.params.randomOffsetStddevM > 0').
     * @returns {boolean} O resultado da avaliação da condição. Retorna `true` em caso de erro.
     */
    evaluateCondition(conditionString) {
        // CORREÇÃO: Remove a substituição complexa.
        // A string de condição já deve estar no formato correto (ex: 'this.params.someValue > 0')
        // para ser avaliada com .call(this).
        try {
            // Usa Function para avaliar a string de condição.
            // 'this' dentro da Function será o 'this' da instância AntennaLayoutGenerator
            // porque estamos usando .call(this).
            const evaluator = new Function(`return (${conditionString});`);
            return evaluator.call(this);
        } catch (e) {
            console.error(`Erro ao avaliar condição para controle dinâmico "${conditionString}":`, e);
            return true; // Assume true em caso de erro para não esconder controles indevidamente.
        }
    }

    /**
     * Cria o layout interno das 64 antenas de um único tile, centrado nas coordenadas (centerX, centerY).
     * Usado para gerar as posições de todas as antenas a partir dos centros dos tiles gerados.
     * @param {number} centerX Coordenada X do centro do tile.
     * @param {number} centerY Coordenada Y do centro do tile.
     * @returns {Array<Array<number>>} Array de coordenadas [x,y] das 64 antenas deste tile.
     */
    createTileLayout64Antennas(centerX, centerY) {
        const antennas = [];
        const subgroupCenters = [];

        // Calcula centros dos 16 subpontos (2x8) relativos ao centro do tile.
        for (let i = 0; i < SUBGROUP_N; i++) {
            const offsetX = (i - (SUBGROUP_N - 1) / 2.0) * SUBGROUP_DX;
            for (let j = 0; j < SUBGROUP_M; j++) {
                const offsetY = (j - (SUBGROUP_M - 1) / 2.0) * SUBGROUP_DY;
                subgroupCenters.push([centerX + offsetX, centerY + offsetY]);
            }
        }

        // Define os 4 offsets para as antenas em cada subponto (formato diamante).
        const offsets = [
            [0, DIAMOND_OFFSET], [DIAMOND_OFFSET, 0],
            [0, -DIAMOND_OFFSET], [-DIAMOND_OFFSET, 0]
        ];

        // Adiciona as 4 antenas para cada um dos 16 subpontos.
        for (const center of subgroupCenters) {
            for (const offset of offsets) {
                antennas.push([
                    center[0] + offset[0],
                    center[1] + offset[1]
                ]);
            }
        }
        return antennas; // Retorna 64 coordenadas [x,y].
    }

    /**
     * Função principal para gerar o layout completo.
     * 1. Obtém os parâmetros atuais da UI (sanitizando).
     * 2. Chama a função apropriada em `BingoLayouts` para obter os centros dos tiles.
     * 3. Gera as coordenadas de todas as antenas individuais.
     * 4. Verifica colisões entre os tiles.
     * 5. Redesenha o layout no canvas.
     * 6. Atualiza as estatísticas.
     * 7. Notifica o módulo de exportação sobre o novo layout.
     * 8. Dispara o evento global 'layoutGenerated'.
     */
    generateLayout() {
        console.log(`Iniciando geração do layout: ${this.layoutType}`);
        // Parâmetros comuns a todas as funções de layout.
        const commonParams = { tileWidthM: TILE_WIDTH, tileHeightM: TILE_HEIGHT, centerLayout: true };
        const currentParamsSanitized = {};
        // Obtém a definição dos controles para o tipo de layout atual para sanitização.
        const controlsForType = PARAM_CONTROLS[this.layoutType] || [];

        // Sanitiza e copia os parâmetros atuais para uso na chamada da função de layout.
        // Isso garante que os valores usados sejam numéricos/booleanos válidos.
        for (const key in this.params) {
            const controlDef = controlsForType.find(c => c.id === key);
            if (controlDef) {
                // Sanitiza com base no tipo de controle definido.
                if (controlDef.type === 'number') {
                    const parsedValue = parseFloat(this.params[key]);
                     // Usa o valor padrão se a análise falhar.
                    currentParamsSanitized[key] = isNaN(parsedValue) ? DEFAULT_PARAMS[this.layoutType][key] : parsedValue;
                } else if (controlDef.type === 'checkbox') {
                     // Garante que seja um booleano.
                    currentParamsSanitized[key] = Boolean(this.params[key]);
                } else {
                    // Outros tipos (como array para ring) são copiados diretamente,
                    // mas podem precisar de validação/tratamento específico depois.
                    currentParamsSanitized[key] = this.params[key];
                }
            } else {
                // Inclui parâmetros que não têm um controle direto (como tilesPerRing para 'ring').
                 currentParamsSanitized[key] = this.params[key];
            }
        }

        // Combina os parâmetros sanitizados com os parâmetros comuns.
        const fullParams = { ...currentParamsSanitized, ...commonParams };

        // Tratamento especial para o array 'tilesPerRing' no layout 'ring'.
        if (this.layoutType === 'ring') {
            const numRings = typeof fullParams.numRings === 'number' ? fullParams.numRings : 0;
            let tilesPerRingArray = fullParams.tilesPerRing; // Pega o array (já sanitizado parcialmente acima).

             // Valida se o array existe, é array e tem o tamanho correto.
             if (!Array.isArray(tilesPerRingArray) || tilesPerRingArray.length !== numRings) {
                 // Regenera o array se inválido (pode acontecer se o numRings mudar antes do input de texto).
                 tilesPerRingArray = Array.from({ length: numRings }, (_, i) => Math.max(1, 8 * (i + 1)));
                 console.warn(`Gerador: 'tilesPerRing' inválido ou tamanho incorreto (${tilesPerRingArray.length} vs ${numRings}). Recriado.`);
                 // Atualiza o parâmetro interno para refletir o array recriado.
                 this.params.tilesPerRing = [...tilesPerRingArray];
             }
             // Garante que os valores dentro do array sejam números válidos (pelo menos 1).
             fullParams.tilesPerRing = tilesPerRingArray.map(n => Math.max(1, parseInt(n) || 8));
        }


        try {
            // Verifica se a biblioteca de layouts está disponível.
            if (!window.BingoLayouts) {
                throw new Error("Biblioteca 'BingoLayouts' (bingo_layouts.js) não carregada.");
            }

            console.log(`Chamando BingoLayouts para tipo: ${this.layoutType} com parâmetros:`, fullParams);

            // Chama a função de geração de layout apropriada da biblioteca.
            // Nota: Os argumentos passados correspondem aos parâmetros esperados por cada função em bingo_layouts.js.
            switch (this.layoutType) {
                case 'grid': this.currentLayout = window.BingoLayouts.createGridLayout(fullParams.numCols, fullParams.numRows, fullParams.tileWidthM, fullParams.tileHeightM, fullParams.spacingXFactor, fullParams.spacingYFactor, fullParams.centerExpScaleFactor, fullParams.randomOffsetStddevM, fullParams.minSeparationFactor, undefined, fullParams.centerLayout); break;
                case 'spiral': this.currentLayout = window.BingoLayouts.createSpiralLayout(fullParams.numArms, fullParams.tilesPerArm, fullParams.tileWidthM, fullParams.tileHeightM, fullParams.radiusStartFactor, fullParams.radiusStepFactor, fullParams.centerExpScaleFactor, fullParams.angleStepRad, fullParams.armOffsetRad, fullParams.rotationPerArmRad, fullParams.randomOffsetStddevM, fullParams.minSeparationFactor, undefined, fullParams.centerLayout, fullParams.includeCenterTile); break;
                case 'ring': this.currentLayout = window.BingoLayouts.createRingLayout(fullParams.numRings, fullParams.tilesPerRing, fullParams.tileWidthM, fullParams.tileHeightM, fullParams.radiusStartFactor, fullParams.radiusStepFactor, fullParams.centerExpScaleFactor, fullParams.angleOffsetRad, fullParams.randomOffsetStddevM, fullParams.minSeparationFactor, undefined, fullParams.centerLayout, fullParams.addCenterTile); break;
                case 'rhombus': this.currentLayout = window.BingoLayouts.createRhombusLayout(fullParams.numRowsHalf, fullParams.tileWidthM, fullParams.tileHeightM, fullParams.sideLengthFactor, fullParams.hCompressFactor, fullParams.vCompressFactor, fullParams.centerExpScaleFactor, fullParams.randomOffsetStddevM, fullParams.minSeparationFactor, undefined, fullParams.centerLayout); break;
                case 'hex_grid': this.currentLayout = window.BingoLayouts.createHexGridLayout(fullParams.numRingsHex, fullParams.tileWidthM, fullParams.tileHeightM, fullParams.spacingFactor, fullParams.centerExpScaleFactor, fullParams.addCenterTile, fullParams.randomOffsetStddevM, fullParams.minSeparationFactor, undefined, fullParams.centerLayout); break;
                case 'phyllotaxis': this.currentLayout = window.BingoLayouts.createPhyllotaxisLayout(fullParams.numTiles, fullParams.tileWidthM, fullParams.tileHeightM, fullParams.scaleFactor, fullParams.centerOffsetFactor, fullParams.centerExpScaleFactor, fullParams.randomOffsetStddevM, fullParams.minSeparationFactor, undefined, fullParams.centerLayout); break;
                case 'manual_circular': this.currentLayout = window.BingoLayouts.createManualCircularLayout(fullParams.tileWidthM, fullParams.tileHeightM, fullParams.spacingXFactor, fullParams.spacingYFactor, fullParams.centerExpScaleFactor, fullParams.randomOffsetStddevM, fullParams.minSeparationFactor, undefined, fullParams.centerLayout); break;
                case 'random': this.currentLayout = window.BingoLayouts.createRandomLayout(fullParams.numTiles, fullParams.maxRadiusM, fullParams.tileWidthM, fullParams.tileHeightM, fullParams.minSeparationFactor, undefined, fullParams.centerLayout); break;
                default:
                    console.warn(`Tipo de layout não reconhecido: ${this.layoutType}. Gerando layout vazio.`);
                    this.currentLayout = [];
            }

            // Gera as coordenadas de todas as antenas individuais com base nos centros dos tiles.
            this.generateAllAntennas();
            // Verifica colisões retangulares entre os tiles.
            this.checkCollisions();
            // Redesenha o layout gerado no canvas.
            this.drawLayout();
            // Atualiza as estatísticas exibidas na UI.
            this.updateStats();

            // Notifica o módulo de exportação sobre o novo layout de centros de tiles.
            // Mantém as estações WGS84 selecionadas no mapa.
            if (typeof window.updateExportFields === 'function') {
                let selectedStations = [];
                // Tenta obter as coordenadas das estações do módulo do mapa, se disponível.
                if (window.interactiveMap?.getSelectedCoordinates) {
                     selectedStations = window.interactiveMap.getSelectedCoordinates();
                }
                window.updateExportFields(this.currentLayout, selectedStations);
            } else {
                console.warn("Função global 'updateExportFields' não encontrada. Exportação pode não atualizar.");
            }

            // Dispara um evento global personalizado indicando que o layout foi gerado.
            // Outros módulos (como o padrão de feixe) podem escutar este evento para reagir.
            console.log("Dispatching 'layoutGenerated' event from generator.js");
            window.dispatchEvent(new CustomEvent('layoutGenerated'));

        } catch (error) {
            // Tratamento de erro durante a geração.
            console.error(`Erro durante a geração do layout '${this.layoutType}':`, error);
            alert(`Erro ao gerar layout '${this.layoutType}'.\nDetalhes: ${error.message}`);

            // Limpa os dados de layout e redesenha para mostrar um estado vazio ou de erro.
            this.currentLayout = [];
            this.allAntennas = [];
            this.collisions = [];
            this.drawLayout();
            this.updateStats(); // Atualiza contadores e info de colisão.

            // Notifica o módulo de exportação com um layout vazio.
            if (typeof window.updateExportFields === 'function') {
                 let selectedStations = [];
                 if (window.interactiveMap?.getSelectedCoordinates) {
                      selectedStations = window.interactiveMap.getSelectedCoordinates();
                 }
                 window.updateExportFields([], selectedStations); // Passa layout vazio em caso de erro.
            }
             // Poderia disparar um evento 'layoutError' se houvesse lógica específica para isso.
             // window.dispatchEvent(new CustomEvent('layoutError', { detail: error }));
        }
    }


    /**
     * Função auxiliar para capitalizar a primeira letra de uma string.
     * (Não essencial para a lógica central, mas útil para labels na UI se necessário).
     * @param {string} string A string a ser capitalizada.
     * @returns {string} A string com a primeira letra capitalizada.
     */
    capitalizeFirstLetter(string) {
        if (!string) return '';
        return string.charAt(0).toUpperCase() + string.slice(1);
    }

    /**
     * Gera as coordenadas [x, y] de todas as antenas individuais.
     * Itera sobre os centros dos tiles em `this.currentLayout` e chama
     * `createTileLayout64Antennas` para cada centro.
     */
    generateAllAntennas() {
        this.allAntennas = []; // Limpa antenas anteriores.
        if (!this.currentLayout || this.currentLayout.length === 0) return; // Nada a gerar se não há tiles.

        for (const center of this.currentLayout) {
            // Verifica se o centro é um array válido de 2 elementos.
            if (Array.isArray(center) && center.length >= 2 && typeof center[0] === 'number' && typeof center[1] === 'number') {
                 const tileAntennas = this.createTileLayout64Antennas(center[0], center[1]);
                 this.allAntennas.push(...tileAntennas); // Adiciona as antenas deste tile ao array geral.
            } else {
                 console.warn("Gerador: Centro de tile inválido encontrado:", center);
            }
        }
        console.log(`Geradas ${this.allAntennas.length} antenas a partir de ${this.currentLayout.length} tiles.`);
    }

    /**
     * Verifica colisões retangulares simples entre todos os pares de tiles.
     * Assume que cada tile ocupa uma área retangular de `TILE_WIDTH` x `TILE_HEIGHT`
     * centrada em suas coordenadas [x, y].
     * Armazena as colisões encontradas em `this.collisions`.
     */
    checkCollisions() {
        this.collisions = []; // Limpa colisões anteriores.
        if (!this.currentLayout || this.currentLayout.length < 2) return; // Não há pares para checar.

        // Distâncias mínimas entre centros para que os retângulos dos tiles NÃO se sobreponham.
        const minCenterXDist = TILE_WIDTH;
        const minCenterYDist = TILE_HEIGHT;
        // Um pequeno epsilon para lidar com imprecisões de ponto flutuante.
        const epsilon = 1e-6;

        // Itera sobre todos os pares únicos de tiles.
        for (let i = 0; i < this.currentLayout.length; i++) {
            for (let j = i + 1; j < this.currentLayout.length; j++) {
                const tile1 = this.currentLayout[i];
                const tile2 = this.currentLayout[j];

                // Valida se os dados dos tiles são arrays de 2 números.
                if (!Array.isArray(tile1) || tile1.length < 2 || typeof tile1[0] !== 'number' || typeof tile1[1] !== 'number' ||
                    !Array.isArray(tile2) || tile2.length < 2 || typeof tile2[0] !== 'number' || typeof tile2[1] !== 'number') {
                     console.warn(`Gerador: Dados de tile inválidos ao verificar colisão entre índices ${i} e ${j}.`, tile1, tile2);
                     continue; // Pula este par.
                }

                // Calcula a distância absoluta entre os centros em X e Y.
                const deltaX = Math.abs(tile1[0] - tile2[0]);
                const deltaY = Math.abs(tile1[1] - tile2[1]);

                // Condição de colisão retangular: a distância entre centros em X é menor que a largura do tile
                // E a distância entre centros em Y é menor que a altura do tile.
                // Usamos epsilon para a comparação.
                if (deltaX < (minCenterXDist - epsilon) && deltaY < (minCenterYDist - epsilon)) {
                    // Colisão detectada. Calcula a distância euclidiana entre os centros para informação.
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

    /**
     * Gera parâmetros aleatórios para o tipo de layout atual
     * e em seguida chama `generateLayout` para criar o layout com esses parâmetros.
     * A aleatorização se baseia nos ranges (min/max) definidos em `PARAM_CONTROLS`.
     */
    generateRandomLayout() {
        const controls = PARAM_CONTROLS[this.layoutType];
        if (!controls) {
            console.warn(`Não é possível gerar layout aleatório para o tipo: ${this.layoutType}`);
            return;
        }

        console.log(`Gerando parâmetros aleatórios para o layout: ${this.layoutType}`);
        // Itera sobre a definição de controles para o layout atual.
        controls.forEach(control => {
            // Só aleatoriza se o controle for de tipo 'number', 'select' ou 'checkbox'.
            switch(control.type) {
                case 'number':
                    // Gera um valor aleatório dentro do range [min, max] e opcionalmente arredonda para o step.
                    if (control.min !== undefined && control.max !== undefined) {
                        let rVal = Math.random() * (control.max - control.min) + control.min;
                        if (control.step !== undefined && control.step !== 0) {
                            // Arredonda para o step.
                            const dp = (String(control.step).split('.')[1] || '').length; // Conta casas decimais do step.
                            rVal = parseFloat((Math.round(rVal / control.step) * control.step).toFixed(dp));
                        }
                        // Garante que o valor final esteja dentro do range min/max.
                        rVal = Math.max(parseFloat(control.min), Math.min(parseFloat(control.max), rVal));
                        this.params[control.id] = rVal; // Atualiza o parâmetro interno.
                    } else {
                         console.warn(`Controle numérico '${control.id}' não tem min/max definidos para aleatorização.`);
                    }
                    break;
                case 'select':
                    // Seleciona uma opção aleatória da lista.
                    if (control.options?.length > 0) {
                        const rIdx = Math.floor(Math.random() * control.options.length);
                        this.params[control.id] = control.options[rIdx].value; // Atualiza o parâmetro interno.
                    } else {
                         console.warn(`Controle select '${control.id}' não tem options definidos para aleatorização.`);
                    }
                    break;
                case 'checkbox':
                    // Randomiza o checkbox (true/false).
                    this.params[control.id] = Math.random() > 0.5; // Atualiza o parâmetro interno.
                    break;
                 // 'ring' tilesPerRing é tratado separadamente após a aleatorização de numRings.
            }
        });

        // Tratamento especial para 'ring' tilesPerRing após aleatorizar numRings.
        if (this.layoutType === 'ring') {
             const numRings = parseInt(this.params.numRings);
             // Regenera o array tilesPerRing para corresponder ao novo numRings aleatório.
             this.params.tilesPerRing = Array.from({ length: numRings }, (_, i) => Math.max(1, Math.floor(Math.random() * 20 + 5) * (i + 1))); // Exemplo de aleatorização simples por anel.
             console.log("Randomized tilesPerRing:", this.params.tilesPerRing);
        }

        // Atualiza a UI dos controles para refletir os novos parâmetros aleatórios.
        this.updateDynamicControls();
        // Gera o layout usando os parâmetros aleatórios recém-definidos.
        this.generateLayout();
    }

    /**
     * Desenha o layout atual (`this.currentLayout`, `this.allAntennas`, `this.collisions`)
     * no canvas. Inclui cálculo de escala para centralizar e ajustar o layout.
     * @param {boolean} [drawAxes=true] - Se `true` (padrão), desenha a escala, eixos e rótulos.
     */
    drawLayout(drawAxes = true) {
        const ctx = this.ctx;
        const canvas = this.canvas;

        // Limpa o canvas e preenche com a cor de fundo do tema.
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--card-bg-color').trim() || 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Mensagem de fallback se não houver layout para desenhar.
        if (!this.currentLayout || this.currentLayout.length === 0 || this.allAntennas.length === 0) {
            ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--text-color').trim() || '#333';
            ctx.font = '16px Segoe UI, Tahoma, Geneva, Verdana, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText("Gere um layout ou ajuste os parâmetros.", canvas.width / 2, canvas.height / 2);
            return;
        }

        // === Cálculo da Escala e Transformação ===
        // Determina os limites X e Y do layout (bounding box) considerando todas as antenas.
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (const antenna of this.allAntennas) {
             if (Array.isArray(antenna) && antenna.length >= 2 && typeof antenna[0] === 'number' && typeof antenna[1] === 'number' && !isNaN(antenna[0]) && !isNaN(antenna[1])) {
                 minX = Math.min(minX, antenna[0]);
                 maxX = Math.max(maxX, antenna[0]);
                 minY = Math.min(minY, antenna[1]);
                 maxY = Math.max(maxY, antenna[1]);
             }
        }
        // Se não houver antenas (layout vazio ou erro), tenta usar os centros dos tiles com dimensões do tile.
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
             // Expande os limites pelos meios lados do tile.
             if (minX !== Infinity) {
                  minX -= TILE_WIDTH / 2; maxX += TILE_WIDTH / 2;
                  minY -= TILE_HEIGHT / 2; maxY += TILE_HEIGHT / 2;
             }
        }

        if (minX === Infinity) {
            console.warn("Não foi possível determinar os limites do layout para desenho.");
            return; // Não desenha se os limites são inválidos.
        }

        // Define margem ao redor do layout no canvas.
        const margin = drawAxes ? 50 : 20; // Mais margem se for desenhar eixos.

        const contentWidth = (maxX - minX);
        const contentHeight = (maxY - minY);
        // Evita divisão por zero se o layout for um único ponto.
        const effectiveWidth = Math.max(contentWidth, 1e-6);
        const effectiveHeight = Math.max(contentHeight, 1e-6);

        // Calcula a área disponível no canvas após descontar as margens.
        const availableWidth = canvas.width - 2 * margin;
        const availableHeight = canvas.height - 2 * margin;

        if (availableWidth <= 0 || availableHeight <= 0) {
             console.warn("Área disponível no canvas para desenho é zero ou negativa. Canvas pode estar muito pequeno.");
             return; // Não desenha se a área é inválida.
        }

        // Calcula o fator de escala para ajustar o layout à área disponível.
        const scale = Math.min(availableWidth / effectiveWidth, availableHeight / effectiveHeight);

        // Calcula os offsets para centralizar o layout na área disponível.
        const offsetX = margin + (availableWidth - effectiveWidth * scale) / 2;
        const offsetY = margin + (availableHeight - effectiveHeight * scale) / 2;

        /**
         * Função de transformação que converte coordenadas do layout (metros)
         * para coordenadas do canvas (pixels). O eixo Y é invertido para que
         * Y crescente no layout corresponda a Y decrescente no canvas (cima para baixo).
         * @param {number} coordX Coordenada X no sistema do layout.
         * @param {number} coordY Coordenada Y no sistema do layout.
         * @returns {{x: number, y: number}} Coordenadas no sistema do canvas.
         */
        const transformCoord = (coordX, coordY) => {
            const relativeX = coordX - minX; // Posição relativa ao canto inferior esquerdo do bounding box.
            const relativeY = coordY - minY;
            const canvasX = relativeX * scale + offsetX;
            // Inverte Y: altura total menos a posição Y relativa escalonada.
            const canvasY = (effectiveHeight - relativeY) * scale + offsetY;
            return { x: canvasX, y: canvasY };
        };
        // === Fim do Cálculo da Escala e Transformação ===


        // Desenha a escala e eixos se solicitado.
        if (drawAxes) {
            this.drawScale(ctx, canvas, scale, minX, minY, maxX, maxY, transformCoord, margin);
        }

        // Obtém cores do tema atual definidas no CSS.
        const currentBodyStyle = getComputedStyle(document.documentElement);
        const centerColor = currentBodyStyle.getPropertyValue('--secondary-color').trim() || 'red';
        const antennaColor = currentBodyStyle.getPropertyValue('--primary-color').trim() || '#3498db';
        const collisionColor = currentBodyStyle.getPropertyValue('--secondary-color').trim() || 'red'; // Mesma cor dos centros

        // Desenha os centros dos tiles (pontos maiores).
        ctx.fillStyle = centerColor;
        for (const center of this.currentLayout) {
            if (Array.isArray(center) && center.length >= 2) {
                const { x, y } = transformCoord(center[0], center[1]);
                ctx.beginPath();
                ctx.arc(x, y, 3, 0, Math.PI * 2); // Raio de 3 pixels.
                ctx.fill();
            }
        }

        // Desenha todas as antenas individuais (pontos menores).
        ctx.fillStyle = antennaColor;
        for (const antenna of this.allAntennas) {
            if (Array.isArray(antenna) && antenna.length >= 2) {
                const { x, y } = transformCoord(antenna[0], antenna[1]);
                ctx.beginPath();
                ctx.arc(x, y, 1.5, 0, Math.PI * 2); // Raio de 1.5 pixels.
                ctx.fill();
            }
        }

        // Desenha indicações visuais de colisões se ativado e houver colisões.
        if (this.showCollisions && this.collisions.length > 0) {
            ctx.strokeStyle = collisionColor;
            ctx.lineWidth = 1.5;
            ctx.globalAlpha = 0.6; // Transparência para as linhas de colisão.

            for (const collision of this.collisions) {
                const tile1 = this.currentLayout[collision.tile1Index];
                const tile2 = this.currentLayout[collision.tile2Index];

                // Verifica se os tiles referenciados pela colisão são válidos.
                if (!Array.isArray(tile1) || tile1.length < 2 || !Array.isArray(tile2) || tile2.length < 2) continue;

                // Transforma as coordenadas dos centros dos tiles colidindo.
                const { x: x1, y: y1 } = transformCoord(tile1[0], tile1[1]);
                const { x: x2, y: y2 } = transformCoord(tile2[0], tile2[1]);

                // Desenha uma linha entre os centros dos tiles colidindo.
                ctx.beginPath();
                ctx.moveTo(x1, y1);
                ctx.lineTo(x2, y2);
                ctx.stroke();

                // Desenha círculos ao redor dos centros dos tiles colidindo para destacá-los.
                ctx.lineWidth = 1; // Linha mais fina para os círculos.
                ctx.beginPath();
                ctx.arc(x1, y1, 5, 0, Math.PI * 2);
                ctx.stroke();
                ctx.beginPath();
                ctx.arc(x2, y2, 5, 0, Math.PI * 2);
                ctx.stroke();
            }

            ctx.globalAlpha = 1.0; // Restaura opacidade.
            ctx.lineWidth = 1; // Restaura largura da linha padrão.
        }
    }

     /**
      * Desenha a escala (marcações e números) e os eixos (X e Y) no canvas.
      * Usado por `drawLayout` quando `drawAxes` é true.
      * @param {CanvasRenderingContext2D} ctx O contexto de desenho do canvas.
      * @param {HTMLCanvasElement} canvas O elemento canvas.
      * @param {number} scale O fator de escala atual do layout para pixels.
      * @param {number} minX Coordenada X mínima do bounding box do layout.
      * @param {number} minY Coordenada Y mínima do bounding box do layout.
      * @param {number} maxX Coordenada X máxima do bounding box do layout.
      * @param {number} maxY Coordenada Y máxima do bounding box do layout.
      * @param {function} transformCoord Função para transformar coordenadas do layout para o canvas.
      * @param {number} margin Margem usada no canvas.
      */
     drawScale(ctx, canvas, scale, minX, minY, maxX, maxY, transformCoord, margin) {
         const layoutWidth = maxX - minX;
         const layoutHeight = maxY - minY;
         const maxDimension = Math.max(layoutWidth, layoutHeight); // Dimensão maior do layout.

         // Calcula um intervalo de escala "bonito" (1, 2, 5, 10, etc. * potência de 10).
         let scaleInterval = 1; // Padrão 1 metro.
         if (maxDimension > 1e-6) {
              const targetTicks = 6; // Número desejado de marcações de escala.
              const roughInterval = maxDimension / targetTicks; // Intervalo aproximado necessário.
              // Encontra a ordem de magnitude do intervalo aproximado.
              const orderOfMagnitude = Math.pow(10, Math.floor(Math.log10(roughInterval)));
              // Ajusta o intervalo para ser um valor arredondado (1, 2, 5 * ordem).
              if (roughInterval / orderOfMagnitude < 1.5) scaleInterval = 1 * orderOfMagnitude;
              else if (roughInterval / orderOfMagnitude < 3.5) scaleInterval = 2 * orderOfMagnitude;
              else if (roughInterval / orderOfMagnitude < 7.5) scaleInterval = 5 * orderOfMagnitude;
              else scaleInterval = 10 * orderOfMagnitude;
              scaleInterval = Math.max(scaleInterval, 0.1); // Garante um mínimo de 0.1m.
         }
         // Define a precisão decimal para exibir os números da escala.
         const scalePrecision = scaleInterval < 0.5 ? 2 : (scaleInterval < 1 ? 1 : 0);
         const epsilon = scaleInterval * 1e-6; // Pequeno epsilon para comparações com o intervalo.

         // Determina os pontos de início e fim para as marcações da escala.
         const xStart = Math.ceil((minX - epsilon) / scaleInterval) * scaleInterval;
         const xEnd = Math.floor((maxX + epsilon) / scaleInterval) * scaleInterval;
         const yStart = Math.ceil((minY - epsilon) / scaleInterval) * scaleInterval;
         const yEnd = Math.floor((maxY + epsilon) / scaleInterval) * scaleInterval;

         // Cores para escala e eixos do tema atual.
         const scaleColor = getComputedStyle(document.documentElement).getPropertyValue('--text-color').trim() || '#888';
         const axisColor = getComputedStyle(document.documentElement).getPropertyValue('--border-color').trim() || '#aaa';

         ctx.strokeStyle = scaleColor;
         ctx.fillStyle = scaleColor;
         ctx.lineWidth = 0.5;
         ctx.font = '10px Segoe UI, Tahoma, Geneva, Verdana, sans-serif'; // Fonte para os números da escala.

         const tickSize = 5; // Tamanho das marcas na escala.
         const textMargin = 8; // Espaço entre as marcas e os números.
         const axisTextMargin = 15; // Espaço para os rótulos dos eixos ("X", "Y").

         // Desenha as marcações e números no eixo X (na parte inferior).
         ctx.textAlign = 'center';
         ctx.textBaseline = 'top';
         const xAxisYPos = canvas.height - margin; // Posição Y para as marcas.
         for (let x = xStart; x <= xEnd; x += scaleInterval) {
             // Não desenha a marca/número '0' aqui se o eixo Y cruza o bounding box.
             const isZero = Math.abs(x) < epsilon;
             // Verifica se o eixo Y (x=0) está dentro dos limites X do layout.
             const axisYIsVisible = minX <= epsilon && maxX >= -epsilon;
             if (isZero && axisYIsVisible) continue;

             const { x: canvasX } = transformCoord(x, minY); // Transforma coordenada X.
             ctx.beginPath();
             ctx.moveTo(canvasX, xAxisYPos);
             ctx.lineTo(canvasX, xAxisYPos - tickSize);
             ctx.stroke();
             ctx.fillText(`${x.toFixed(scalePrecision)}`, canvasX, xAxisYPos + textMargin / 2); // Adiciona o número.
         }

         // Desenha as marcações e números no eixo Y (na parte esquerda).
         ctx.textAlign = 'right';
         ctx.textBaseline = 'middle';
         const yAxisXPos = margin; // Posição X para as marcas.
         for (let y = yStart; y <= yEnd; y += scaleInterval) {
             // Não desenha a marca/número '0' aqui se o eixo X cruza o bounding box.
             const isZero = Math.abs(y) < epsilon;
              // Verifica se o eixo X (y=0) está dentro dos limites Y do layout.
             const axisXIsVisible = minY <= epsilon && maxY >= -epsilon;
             if (isZero && axisXIsVisible) continue;

             const { y: canvasY } = transformCoord(minX, y); // Transforma coordenada Y.
             ctx.beginPath();
             ctx.moveTo(yAxisXPos, canvasY);
             ctx.lineTo(yAxisXPos + tickSize, canvasY);
             ctx.stroke();
             ctx.fillText(`${y.toFixed(scalePrecision)}`, yAxisXPos - textMargin / 2, canvasY); // Adiciona o número.
         }

         // === Desenha os Eixos X e Y (linha sólida) ===
         ctx.strokeStyle = axisColor;
         ctx.lineWidth = 1;
         const axisEpsilon = 1e-9; // Epsilon menor para verificar se a origem (0,0) está muito próxima.

         // Eixo Y (linha vertical em X=0).
         if (minX <= axisEpsilon && maxX >= -axisEpsilon) {
             const { x: zeroX } = transformCoord(0, minY); // Transforma X=0 no limite Y inferior.
             const { y: topY } = transformCoord(0, maxY);   // Transforma Y limite superior (no X=0).
             const { y: bottomY } = transformCoord(0, minY); // Transforma Y limite inferior (no X=0).
             ctx.beginPath();
             ctx.moveTo(zeroX, topY);
             ctx.lineTo(zeroX, bottomY);
             ctx.stroke();
             // Adiciona o número '0' perto da origem se ele não foi desenhado pelas marcações.
             const axisYIsVisible = minX <= epsilon && maxX >= -epsilon;
             const axisXIsVisible = minY <= epsilon && maxY >= -epsilon;
              // Desenha '0' no eixo Y se a origem não está coberta pelas marcações regulares
              // OU se a origem está visível E está muito perto da margem esquerda.
             if (!axisXIsVisible || (axisYIsVisible && Math.abs(transformCoord(0,0).x - margin) < textMargin)) {
                ctx.fillStyle = scaleColor;
                ctx.font = '10px Segoe UI';
                ctx.textAlign = 'right';
                ctx.textBaseline = 'middle';
                const {y: zeroCanvasY} = transformCoord(0, 0); // Posição Y da origem no canvas.
                ctx.fillText('0', yAxisXPos - textMargin / 2, zeroCanvasY);
             }
         }

         // Eixo X (linha horizontal em Y=0).
         if (minY <= axisEpsilon && maxY >= -axisEpsilon) {
             const { y: zeroY } = transformCoord(minX, 0); // Transforma Y=0 no limite X esquerdo.
             const { x: leftX } = transformCoord(minX, 0); // Transforma X limite esquerdo (no Y=0).
             const { x: rightX } = transformCoord(maxX, 0); // Transforma X limite direito (no Y=0).
             ctx.beginPath();
             ctx.moveTo(leftX, zeroY);
             ctx.lineTo(rightX, zeroY);
             ctx.stroke();
              // Adiciona o número '0' perto da origem se ele não foi desenhado pelas marcações.
             const axisXIsVisible = minY <= epsilon && maxY >= -epsilon;
             const axisYIsVisible = minX <= epsilon && maxX >= -epsilon;
             // Desenha '0' no eixo X se a origem não está coberta pelas marcações regulares
             // OU se a origem está visível E está muito perto da margem inferior.
             if (!axisYIsVisible || (axisXIsVisible && Math.abs(transformCoord(0,0).y - (canvas.height - margin)) < textMargin)) {
                ctx.fillStyle = scaleColor;
                ctx.font = '10px Segoe UI';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'top';
                const {x: zeroCanvasX} = transformCoord(0, 0); // Posição X da origem no canvas.
                 ctx.fillText('0', zeroCanvasX, xAxisYPos + textMargin / 2);
             }
         }


         // === Desenha os rótulos dos Eixos ===
         ctx.fillStyle = scaleColor;
         ctx.font = '12px Segoe UI, Tahoma, Geneva, Verdana, sans-serif'; // Fonte para rótulos.

         // Rótulo do Eixo X.
         ctx.textAlign = 'center';
         ctx.textBaseline = 'bottom';
         ctx.fillText('X (metros)', canvas.width / 2, canvas.height - axisTextMargin / 3);

         // Rótulo do Eixo Y (rotacionado).
         ctx.save(); // Salva o estado atual do contexto (translação, rotação).
         ctx.translate(axisTextMargin, canvas.height / 2); // Move a origem para a posição do rótulo Y.
         ctx.rotate(-Math.PI / 2); // Rotaciona 90 graus anti-horário.
         ctx.textAlign = 'center';
         ctx.textBaseline = 'bottom';
         ctx.fillText('Y (metros)', 0, 0); // Desenha o texto na nova origem rotacionada.
         ctx.restore(); // Restaura o estado do contexto ao que era antes da translação/rotação.
     }


    /**
     * Atualiza os elementos da UI que exibem a contagem de tiles e antenas,
     * e as informações sobre colisões detectadas.
     */
    updateStats() {
        // Atualiza a contagem de tiles e antenas.
        const tileCountSpan = document.getElementById('tile-count');
        const antennaCountSpan = document.getElementById('antenna-count');
        const tileCount = this.currentLayout ? this.currentLayout.length : 0;
        const antennaCount = this.allAntennas ? this.allAntennas.length : 0;

        if (tileCountSpan) tileCountSpan.textContent = tileCount;
        if (antennaCountSpan) antennaCountSpan.textContent = antennaCount;

        // Atualiza a seção de informações de colisão.
        this.updateCollisionInfo();
        console.log(`Estatísticas atualizadas: ${tileCount} tiles, ${antennaCount} antenas.`);
    }

    /**
     * Atualiza ou cria a seção de informações de colisão (`.collision-info`)
     * na UI. Exibe o número de colisões e lista detalhes das primeiras colisões.
     * Inclui funcionalidade de expandir/colapsar a lista.
     */
    updateCollisionInfo() {
        const visualizationDiv = document.querySelector('.visualization');
        if (!visualizationDiv) {
            console.warn(".visualization container não encontrado para atualizar info de colisão.");
            return;
        }

        // Tenta encontrar a div de info de colisão existente, ou a cria se não existir.
        let collisionInfoDiv = document.getElementById('collision-info');
        if (!collisionInfoDiv) {
            collisionInfoDiv = document.createElement('div');
            collisionInfoDiv.id = 'collision-info';
            collisionInfoDiv.className = 'collision-info';

            // Header com o título e contador, e seta para expandir/colapsar.
            const header = document.createElement('div');
            header.className = 'collision-header';
            header.innerHTML = `<span>Colisões Detectadas: <span id="collision-count">0</span></span><span class="toggle-arrow">▼</span>`;

            // Conteúdo onde a lista de colisões será exibida. Inicialmente escondido.
            const content = document.createElement('div');
            content.id = 'collision-content';
            content.className = 'collision-content';
            content.style.display = 'none'; // Escondido por padrão.

            // Adiciona listener ao header para alternar a visibilidade do conteúdo.
            header.addEventListener('click', () => {
                const isHidden = content.style.display === 'none';
                content.style.display = isHidden ? 'block' : 'none';
                const arrow = header.querySelector('.toggle-arrow');
                if (arrow) arrow.textContent = isHidden ? '▲' : '▼';
                // Redimensiona o canvas após expandir/colapsar para ajustar o espaço.
                this.resizeCanvas();
            });

            collisionInfoDiv.appendChild(header);
            collisionInfoDiv.appendChild(content);

            // Insere a nova div de colisão no DOM, após as estatísticas se possível.
            const statsDiv = visualizationDiv.querySelector('.stats');
            if (statsDiv) {
                 // Insere após o div .stats.
                 statsDiv.parentNode.insertBefore(collisionInfoDiv, statsDiv.nextSibling);
            } else {
                // Se .stats não for encontrado, apenas adiciona ao final do .visualization.
                visualizationDiv.appendChild(collisionInfoDiv);
            }
             console.log("Div #collision-info criada.");
        }

        // Atualiza o contador de colisões e a lista.
        const collisionCountSpan = document.getElementById('collision-count');
        const collisionContentDiv = document.getElementById('collision-content');
        if (!collisionCountSpan || !collisionContentDiv) {
             console.warn("Elementos do info de colisão (span#collision-count ou div#collision-content) não encontrados.");
             return;
        }

        const numCollisions = this.collisions ? this.collisions.length : 0;
        collisionCountSpan.textContent = numCollisions; // Atualiza o contador.
        collisionContentDiv.innerHTML = ''; // Limpa a lista anterior.

        if (numCollisions > 0) {
            // Cria uma lista (ul) para exibir os detalhes das colisões.
            const list = document.createElement('ul');
            const maxCollisionsToShow = 50; // Limita o número de colisões listadas para evitar sobrecarregar a UI.

            // Adiciona itens à lista para as primeiras colisões.
            for (let i = 0; i < Math.min(numCollisions, maxCollisionsToShow); i++) {
                const collision = this.collisions[i];
                 // Validação básica dos dados da colisão.
                 if (collision && collision.tile1Index !== undefined && collision.tile2Index !== undefined && typeof collision.distance === 'number') {
                     const item = document.createElement('li');
                     item.textContent = `Tile ${collision.tile1Index + 1} e Tile ${collision.tile2Index + 1} (Dist. Centros: ${collision.distance.toFixed(3)}m)`;
                     list.appendChild(item);
                 } else {
                     console.warn("Dados de colisão inválidos encontrados:", collision);
                 }
            }

            // Adiciona uma mensagem se houver mais colisões do que o limite exibido.
            if (numCollisions > maxCollisionsToShow) {
                const item = document.createElement('li');
                item.style.fontStyle = 'italic';
                item.textContent = `... e mais ${numCollisions - maxCollisionsToShow} colisões.`;
                list.appendChild(item);
            }
            collisionContentDiv.appendChild(list); // Adiciona a lista ao conteúdo.
        } else {
            // Mensagem quando não há colisões.
            collisionContentDiv.textContent = 'Nenhuma colisão detectada com a configuração atual.';
        }
    }

    // --- Métodos Getters ---
    /** @returns {Array<Array<number>>} As coordenadas XY dos centros dos tiles. */
    getLayout() { return this.currentLayout; }
    /** @returns {Array<Array<number>>} As coordenadas XY de todas as antenas individuais. */
    getAllAntennas() { return this.allAntennas; }
     /** @returns {Array<Object>} A lista de colisões detectadas. */
     getCollisions() { return this.collisions; }


    // --- MÉTODO Download da Imagem do Layout ---
    /**
     * Gera e inicia o download da imagem atual do canvas do layout.
     * Permite escolher o tema (claro/escuro) e se inclui os eixos/escala.
     * Temporariamente muda o tema da página para renderizar o canvas com as cores desejadas
     * para a imagem, e depois restaura o tema original.
     */
    downloadLayoutImage() {
        console.log("Iniciando processo de download da imagem do layout...");
        if (!this.canvas) {
             console.error("Canvas não disponível para download.");
             alert("Erro: Canvas de visualização não disponível.");
             return;
        }
        if (!this.imageThemeRadios || !this.imageAxesRadios) {
            console.error("Controles de opção de download da imagem não encontrados (tema ou eixos).");
            alert("Erro: Opções de download da imagem não configuradas corretamente.");
            return;
        }

        // Obtém as opções selecionadas na UI.
        let selectedTheme = 'light'; // Padrão.
        try { selectedTheme = document.querySelector('input[name="imageTheme"]:checked')?.value || 'light'; } catch (e) { console.warn("Não foi possível ler o tema selecionado para a imagem.", e); }
        let includeAxes = true; // Padrão.
        try { includeAxes = document.querySelector('input[name="imageAxes"]:checked')?.value === 'yes'; } catch (e) { console.warn("Não foi possível ler a opção de eixos para a imagem.", e); }

        // Obtém o tema atual da página.
        const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
        // Verifica se é necessário mudar temporariamente o tema para gerar a imagem.
        const needsThemeChange = currentTheme !== selectedTheme;

        const downloadButton = this.downloadImageBtn;
        // Desabilita o botão e mostra feedback visual durante o processo.
        if(downloadButton) {
            downloadButton.disabled = true;
            downloadButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Preparando...';
        } else {
            console.warn("Botão de download não encontrado, feedback visual desabilitado.");
        }


        /** Função para restaurar o estado da UI após o download. */
        const restoreState = () => {
            // Restaura o tema original da página se ele foi alterado temporariamente.
            if (needsThemeChange) {
                console.log(`Restaurando tema da página para "${currentTheme}".`);
                if (currentTheme === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
                else document.documentElement.removeAttribute('data-theme');
                // Redesenha o canvas visível com o tema original.
                this.drawLayout();
            }
            // Restaura o estado do botão de download.
             if(downloadButton) {
                 downloadButton.disabled = false;
                 downloadButton.innerHTML = '<i class="fas fa-camera"></i> Baixar Imagem (PNG)';
             }
             console.log("Processo de download da imagem finalizado, estado restaurado.");
        };

        /** Função que executa o redesenho para a imagem e o download. */
        const generateAndDownload = () => {
            try {
                // Redesenha o layout no canvas com as opções de tema e eixos selecionadas para a imagem.
                this.drawLayout(includeAxes);

                // Pequeno atraso para garantir que o canvas foi completamente redesenhado.
                // Isso é importante especialmente após a mudança de tema.
                setTimeout(() => {
                    try {
                        // Converte o conteúdo do canvas para uma URL de dados PNG.
                        const dataURL = this.canvas.toDataURL('image/png');
                        // Cria um link invisível para acionar o download.
                        const link = document.createElement('a');
                        link.href = dataURL;
                        // Define o nome do arquivo para download.
                        link.download = `bingo_layout_${this.layoutType}_${selectedTheme}${includeAxes ? '_com_eixos' : '_sem_eixos'}.png`;
                        // Adiciona o link ao corpo, clica nele programaticamente, e remove-o.
                        document.body.appendChild(link);
                        link.click();
                        document.body.removeChild(link);
                        console.log("Download da imagem acionado.");
                    } catch (downloadError) {
                         console.error("Erro ao gerar URL de dados ou acionar download da imagem:", downloadError);
                         alert("Ocorreu um erro ao preparar ou iniciar o download da imagem.");
                    } finally {
                        // Sempre restaura o estado da UI, mesmo se o download falhar.
                        restoreState();
                    }
                }, 100); // Atraso de 100ms após o redesenho.

            } catch(drawError) {
                console.error("Erro durante o redesenho do canvas para download:", drawError);
                alert("Ocorreu um erro durante o redesenho da imagem para download.");
                restoreState(); // Restaura estado em caso de erro de desenho.
            }
        };

        // Se for necessário mudar o tema temporariamente, muda e agenda a geração/download.
        if (needsThemeChange) {
            console.log(`Mudando tema da página temporariamente para "${selectedTheme}" para gerar a imagem.`);
            if (selectedTheme === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
            else document.documentElement.removeAttribute('data-theme');
            // Atraso adicional após a mudança de tema para permitir que o CSS aplique.
            setTimeout(generateAndDownload, 150);
        } else {
            // Se o tema da imagem já é o tema atual da página, gera e baixa imediatamente.
            generateAndDownload();
        }
    }

} // === FIM DA CLASSE AntennaLayoutGenerator ===

// === Instanciação Global ===
// Cria uma instância da classe AntennaLayoutGenerator e a anexa ao objeto window.
// Isso permite que outros módulos (main, map, export) a acessem.
if (typeof window !== 'undefined') {
    // Espera o DOM carregar antes de tentar instanciar.
    document.addEventListener('DOMContentLoaded', () => {
       try {
           // Cria a instância apenas se ela não existir (útil para HMR).
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
     // Loga um aviso se o código estiver sendo executado em um ambiente sem DOM (ex: Node.js).
     console.warn("generator.js: Ambiente não-navegador detectado. Instância de AntennaLayoutGenerator não foi criada.");
}