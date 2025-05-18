/**
 * export.js
 *
 * Módulo para implementação da funcionalidade de exportação para OSKAR.
 * Inclui:
 * - Geração de conteúdo para os arquivos de layout OSKAR.
 * - Exibição em textareas.
 * - Botões para copiar o conteúdo de cada textarea para a área de transferência.
 * - Funcionalidade de download de um arquivo ZIP contendo todos os layouts,
 *   com nome de arquivo customizável.
 */

// Constantes fixas do BINGO Central (local de referência para as estações)
const BINGO_CENTRAL_LATITUDE = -7.04067;
const BINGO_CENTRAL_LONGITUDE = -38.26884;
const BINGO_CENTRAL_ALTITUDE = 396.4; // Altitude em metros

// Classe para gerenciar a exportação de layouts OSKAR
class OskarLayoutExporter {
    constructor() {
        this.tileCentersLayout = null;    // Array de [x, y] dos centros dos tiles (do gerador de layout)
        this.selectedStationsCoords = []; // Array de {lat, lon, alt, name} das estações (do mapa)
        this.singleTileAntennaLayout = null; // Array [x, y] das 64 antenas de um tile, centrado em (0,0)

        // Gera o layout interno do tile (64 antenas) uma vez na inicialização.
        // Este layout é fixo para todos os tiles.
        this.generateSingleTileLayout();

        // Adiciona botões de cópia aos textareas de exportação.
        this.addCopyButtonsToTextareas();

        // Preenche o campo ../position.txt, que é fixo.
        this.updateBingoPositionField();
    }

    /**
     * Gera o layout das 64 antenas de um único tile, centrado em (0,0).
     * As antenas são dispostas em uma grade uniforme de 4x16.
     * Este layout é usado para o arquivo station/tile/layout.txt.
     */
    generateSingleTileLayout() {
        const Nx = 4; // Número de antenas na direção da largura do tile
        const Ny = 16; // Número de antenas na direção da altura do tile

        // Dimensões do tile BINGO (mesmas que em generator.js)
        const TILE_WIDTH_EXPORT = 0.35;  // Largura do tile em metros
        const TILE_HEIGHT_EXPORT = 1.34; // Altura do tile em metros

        // Calcula o espaçamento entre antenas em cada direção
        const spacingX = TILE_WIDTH_EXPORT / Nx;
        const spacingY = TILE_HEIGHT_EXPORT / Ny;

        const tileAntennasRelative = [];
        for (let i = 0; i < Nx; i++) {
            // Posição X relativa ao centro (0,0) do tile
            const posX_relative = (i - (Nx - 1) / 2.0) * spacingX;
            for (let j = 0; j < Ny; j++) {
                // Posição Y relativa ao centro (0,0) do tile
                const posY_relative = (j - (Ny - 1) / 2.0) * spacingY;
                tileAntennasRelative.push([posX_relative, posY_relative]);
            }
        }

        // A formulação (k - (N-1)/2.0) * spacing já centraliza o layout em (0,0).
        // As coordenadas são arredondadas para 6 casas decimais para a exportação.
        this.singleTileAntennaLayout = tileAntennasRelative.map(ant => [
            parseFloat(ant[0].toFixed(6)),
            parseFloat(ant[1].toFixed(6))
        ]);

        console.log("Layout interno do tile (64 antenas - grade 4x16) gerado e centrado para exportação.");
        // Atualiza o campo de exportação do layout do tile imediatamente.
        // Esta chamada já existia e deve ser mantida.
        this.updateTileLayoutField();
    }

    /**
     * Adiciona botões de "copiar" a todos os textareas de exportação.
     */
    addCopyButtonsToTextareas() {
        const textareaIds = [
            'export-layout-wgs84',
            'export-position',
            'export-station-layout',
            'export-tile-layout'
        ];
        textareaIds.forEach(id => this._addSingleCopyButtonToTextarea(id));
    }

    /**
     * Adiciona um botão de cópia a um textarea específico.
     * @private
     * @param {string} textareaId ID do elemento textarea.
     */
    _addSingleCopyButtonToTextarea(textareaId) {
        const textarea = document.getElementById(textareaId);
        if (!textarea) {
            console.warn(`Textarea com ID '${textareaId}' não encontrado para adicionar botão de cópia.`);
            return;
        }
        const container = textarea.parentElement; // Espera-se que seja .export-field
        if (!container) {
            console.warn(`Container para textarea '${textareaId}' não encontrado.`);
            return;
        }
        // Evita adicionar múltiplos botões se a função for chamada mais de uma vez.
        if (container.querySelector('.copy-btn')) return;

        const copyBtn = document.createElement('button');
        copyBtn.className = 'copy-btn'; // Para estilização CSS
        copyBtn.innerHTML = '<i class="fas fa-copy"></i>'; // Ícone Font Awesome
        copyBtn.setAttribute('aria-label', 'Copiar conteúdo');
        copyBtn.title = 'Copiar para a área de transferência';

        copyBtn.addEventListener('click', (event) => {
            event.preventDefault(); // Previne qualquer comportamento padrão do botão.
            this.copyTextToClipboard(textarea, copyBtn);
        });

        // Garante que o container do textarea (div.export-field) tenha position: relative
        // para que o botão de cópia (position: absolute) seja posicionado corretamente.
        if (getComputedStyle(container).position === 'static') {
            container.style.position = 'relative';
        }
        container.appendChild(copyBtn);
    }

    /**
     * Copia o conteúdo de um elemento textarea para a área de transferência.
     * Usa a Clipboard API moderna com fallback para `document.execCommand`.
     * @param {HTMLTextAreaElement} textareaElement O elemento textarea cujo valor será copiado.
     * @param {HTMLButtonElement} buttonElement O botão que acionou a cópia (para feedback visual).
     */
    copyTextToClipboard(textareaElement, buttonElement) {
        if (!textareaElement) return;

        const textToCopy = textareaElement.value;
        if (!navigator.clipboard) {
            // Fallback para navegadores mais antigos ou contextos inseguros.
            try {
                textareaElement.select(); // Seleciona o texto no textarea.
                document.execCommand('copy'); // Comando de cópia legado.
                this.showCopyFeedbackOnButton(buttonElement, true, "Copiado (legado)!");
            } catch (err) {
                console.error('Fallback de cópia (execCommand) falhou:', err);
                this.showCopyFeedbackOnButton(buttonElement, false, "Falha ao copiar.");
            }
            return;
        }

        // Uso da Clipboard API moderna.
        navigator.clipboard.writeText(textToCopy).then(() => {
            this.showCopyFeedbackOnButton(buttonElement, true, "Copiado!");
        }).catch(err => {
            console.error('Erro ao copiar com Clipboard API:', err);
            this.showCopyFeedbackOnButton(buttonElement, false, "Erro ao copiar.");
        });
    }

    /**
     * Mostra feedback visual (ícone e cor) no botão de cópia.
     * @param {HTMLButtonElement} button O botão onde o feedback será mostrado.
     * @param {boolean} success Indica se a operação de cópia foi bem-sucedida.
     * @param {string} message Mensagem para o title do botão.
     */
    showCopyFeedbackOnButton(button, success, message = "") {
        if (!button) return;
        const icon = button.querySelector('i');
        if (!icon) return;

        const originalIconClass = 'fa-copy';
        const successIconClass = 'fa-check';
        const errorIconClass = 'fa-times';
        const feedbackDuration = 1500; // ms

        const currentIcon = success ? successIconClass : errorIconClass;
        const currentColor = success ? 'var(--success-color)' : 'var(--secondary-color)'; // Usa variáveis CSS

        // Altera ícone e cor
        icon.classList.remove(originalIconClass, successIconClass, errorIconClass);
        icon.classList.add(currentIcon);
        button.style.color = currentColor;
        if (message) button.title = message;

        // Restaura ícone, cor e title originais após um tempo
        setTimeout(() => {
            icon.classList.remove(successIconClass, errorIconClass);
            icon.classList.add(originalIconClass);
            button.style.color = 'var(--copy-btn-color)'; // Cor original do botão de cópia
            button.title = 'Copiar para a área de transferência';
        }, feedbackDuration);
    }

    /**
     * Atualiza todos os campos de texto de exportação com base nos dados atuais.
     * @param {Array<Array<number>> | null} tileCenters Coordenadas dos centros dos tiles.
     * @param {Array<Object> | null} stations Coordenadas das estações selecionadas no mapa.
     */
    updateAllExportFields(tileCenters = null, stations = null) {
        // Atualiza os dados internos se novos dados forem fornecidos.
        if (tileCenters !== null) {
            this.tileCentersLayout = tileCenters;
        }
        if (stations !== null) {
            // Garante que stations seja um array.
            this.selectedStationsCoords = Array.isArray(stations) ? stations : (stations ? [stations] : []);
        }

        // Chama os métodos para atualizar cada campo de exportação.
        this.updateLayoutWgs84Field();
        // this.updateBingoPositionField(); // Já chamado no construtor, é fixo.
        this.updateStationLayoutField();
        // this.updateTileLayoutField(); // Já chamado no construtor e generateSingleTileLayout, é fixo.
        
        console.log("Campos de exportação OSKAR atualizados com os dados mais recentes.");
    }

    // --- Métodos específicos para cada arquivo de exportação ---

    /**
     * Atualiza o textarea para ../layout_wgs84.txt (Coordenadas WGS84 das estações).
     * Usa dados de `this.selectedStationsCoords` (do mapa).
     */
    updateLayoutWgs84Field() {
        const textarea = document.getElementById('export-layout-wgs84');
        if (!textarea) return;

        if (!this.selectedStationsCoords || this.selectedStationsCoords.length === 0) {
            textarea.value = 'Nenhuma estação selecionada no mapa.\nClique no mapa ou escolha um arranjo pré-definido.';
            return;
        }
        // Formato: latitude,longitude,altitude (separados por vírgula)
        textarea.value = this.selectedStationsCoords.map(station => {
            const lat = station.lat || 0;
            const lon = station.lon || 0;
            const alt = station.alt || 0;
            return `${lat.toFixed(7)},${lon.toFixed(7)},${alt.toFixed(1)}`;
        }).join('\n');
    }

    /**
     * Atualiza o textarea para ../position.txt (Coordenadas WGS84 fixas do BINGO Central).
     * Este valor é constante.
     */
    updateBingoPositionField() {
        const textarea = document.getElementById('export-position');
        if (!textarea) return;
        // Formato: latitude,longitude,altitude
        textarea.value = `${BINGO_CENTRAL_LATITUDE.toFixed(7)},${BINGO_CENTRAL_LONGITUDE.toFixed(7)},${BINGO_CENTRAL_ALTITUDE.toFixed(1)}`;
    }

    /**
     * Atualiza o textarea para ../station/layout.txt (Coordenadas XY relativas dos centros dos tiles).
     * Usa dados de `this.tileCentersLayout` (do gerador de layout).
     */
    updateStationLayoutField() {
        const textarea = document.getElementById('export-station-layout');
        if (!textarea) return;

        if (!this.tileCentersLayout || this.tileCentersLayout.length === 0) {
            textarea.value = 'Nenhum layout de estação gerado.\nUse o "Gerador de Layout" para criar um.';
            return;
        }
        // Formato: x,y (coordenadas relativas em metros, separadas por vírgula)
        textarea.value = this.tileCentersLayout.map(center => {
             if (Array.isArray(center) && center.length >= 2) {
                 return `${center[0].toFixed(6)},${center[1].toFixed(6)}`;
             }
             return ''; // Linha vazia para dados inválidos, será filtrada.
        }).filter(line => line).join('\n');
    }

    /**
     * Atualiza o textarea para ../station/tile/layout.txt (Coordenadas XY relativas das 64 antenas no tile).
     * Usa o layout pré-calculado `this.singleTileAntennaLayout`.
     */
    updateTileLayoutField() {
        const textarea = document.getElementById('export-tile-layout');
        if (!textarea) return;

        if (!this.singleTileAntennaLayout || this.singleTileAntennaLayout.length === 0) {
            textarea.value = 'Erro interno: Layout do tile individual não foi gerado.';
            return;
        }
        // Formato: x,y (coordenadas relativas em metros, separadas por vírgula)
        textarea.value = this.singleTileAntennaLayout.map(antenna => {
             if (Array.isArray(antenna) && antenna.length >= 2) {
                 return `${antenna[0].toFixed(6)},${antenna[1].toFixed(6)}`;
             }
             return '';
        }).filter(line => line).join('\n');
    }
} // Fim da classe OskarLayoutExporter

// --- Inicialização da Exportação e Funcionalidade de Download ZIP ---

document.addEventListener('DOMContentLoaded', () => {
    // Cria a instância do exportador e a armazena globalmente.
    if (!window.oskarExporter) {
        try {
            window.oskarExporter = new OskarLayoutExporter();
            console.log("Instância de OskarLayoutExporter criada e configurada.");
        } catch (error) {
            console.error("Erro ao instanciar OskarLayoutExporter:", error);
            alert("Erro crítico ao inicializar o módulo de exportação. Algumas funcionalidades podem não estar disponíveis.");
        }
    } else {
        // Se já existir (ex: Hot Module Replacement), atualiza os campos.
        window.oskarExporter.updateAllExportFields(
            window.antennaGenerator ? window.antennaGenerator.getLayout() : null,
            window.interactiveMap ? window.interactiveMap.getSelectedCoordinates() : null
        );
    }

    // Função global para ser chamada por outros módulos (gerador, mapa) quando seus dados mudam.
    window.updateExportFields = function(tileCentersLayout, selectedStationsArray) {
        if (window.oskarExporter) {
            window.oskarExporter.updateAllExportFields(tileCentersLayout, selectedStationsArray);
        } else {
            console.error("OskarLayoutExporter não inicializado ao chamar updateExportFields global.");
        }
    };

    // --- Lógica para o Botão de Download ZIP ---
    const downloadBtn = document.getElementById('download-zip-btn');
    const filenameInput = document.getElementById('zip-filename-input');

    if (downloadBtn && filenameInput) {
        downloadBtn.addEventListener('click', function(event) {
            event.preventDefault(); // Previne comportamento padrão do botão.

            console.log("Tentando gerar arquivo ZIP...");
            // Verifica se as bibliotecas JSZip e FileSaver estão carregadas.
            if (typeof JSZip === 'undefined' || typeof saveAs === 'undefined') {
                alert("Erro: Bibliotecas JSZip e/ou FileSaver não carregadas. O download do ZIP não funcionará.");
                console.error("JSZip ou FileSaver não definidos. Verifique os CDNs no HTML.");
                return;
            }

            try {
                const zip = new JSZip();
                // Obtém o conteúdo atual dos textareas.
                const contentWGS84 = document.getElementById('export-layout-wgs84').value;
                const contentPosition = document.getElementById('export-position').value;
                const contentStationLayout = document.getElementById('export-station-layout').value;
                const contentTileLayout = document.getElementById('export-tile-layout').value;

                // Adiciona os arquivos ao ZIP com a estrutura de diretórios OSKAR.
                zip.file("layout_wgs84.txt", contentWGS84);
                zip.file("position.txt", contentPosition);
                const stationFolder = zip.folder("station"); // Cria pasta "station"
                stationFolder.file("layout.txt", contentStationLayout);
                const tileFolder = stationFolder.folder("tile"); // Cria pasta "station/tile"
                tileFolder.file("layout.txt", contentTileLayout);

                // Determina o nome do arquivo ZIP.
                let filename = filenameInput.value.trim(); // Pega valor do input.
                const defaultFilename = "bingo_oskar_layout.zip";

                if (!filename) {
                    filename = defaultFilename; // Usa nome padrão se input vazio.
                } else {
                    // Garante que o nome termine com .zip.
                    if (!filename.toLowerCase().endsWith('.zip')) {
                        filename += '.zip';
                    }
                    // Remove caracteres inválidos para nomes de arquivo.
                    filename = filename.replace(/[/\\?%*:|"<>]/g, '_');
                }

                // Feedback visual no botão durante a geração do ZIP.
                downloadBtn.disabled = true;
                downloadBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Gerando ZIP...';

                // Gera o arquivo ZIP de forma assíncrona e inicia o download.
                zip.generateAsync({ type: "blob" })
                    .then(function(blob) {
                        saveAs(blob, filename); // Inicia o download.
                        console.log(`Arquivo ZIP "${filename}" gerado e download iniciado.`);
                        // Restaura o botão.
                        downloadBtn.disabled = false;
                        downloadBtn.innerHTML = '<i class="fas fa-file-archive"></i> Baixar Layout (ZIP)';
                    })
                    .catch(function (err) {
                        console.error("Erro ao gerar o arquivo ZIP com JSZip:", err);
                        alert("Ocorreu um erro ao gerar o arquivo ZIP. Verifique o console para detalhes.");
                        downloadBtn.disabled = false;
                        downloadBtn.innerHTML = '<i class="fas fa-file-archive"></i> Baixar Layout (ZIP)';
                    });

            } catch (error) {
                console.error("Erro inesperado ao preparar para gerar ZIP:", error);
                alert("Ocorreu um erro inesperado ao tentar gerar o ZIP. Verifique o console.");
                downloadBtn.disabled = false;
                downloadBtn.innerHTML = '<i class="fas fa-file-archive"></i> Baixar Layout (ZIP)';
            }
        });
    } else {
        console.warn("Botão de download ZIP (download-zip-btn) ou input de nome (zip-filename-input) não encontrado no DOM.");
    }
});

// Mensagem para ambientes não-navegador (ex: Node.js durante testes)
if (typeof window === 'undefined') {
    console.warn("export.js: Ambiente não-navegador detectado. Funcionalidade de download ZIP não aplicável.");
}