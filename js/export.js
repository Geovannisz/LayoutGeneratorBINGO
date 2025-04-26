/**
 * Módulo para implementação da funcionalidade de exportação para OSKAR.
 * Inclui cópia para clipboard e download de arquivo ZIP estruturado com nome customizável.
 */

// Constantes fixas do BINGO Central
const BINGO_CENTRAL_LATITUDE = -7.04067;
const BINGO_CENTRAL_LONGITUDE = -38.26884;
const BINGO_CENTRAL_ALTITUDE = 396.4; // Altitude em metros

// Classe para gerenciar a exportação de layouts OSKAR
class OskarLayoutExporter {
    constructor() {
        this.tileCentersLayout = null;    // Array de [x, y] dos centros dos tiles (gerador)
        this.selectedStationsCoords = []; // Array de {lat, lon, alt, name} das estações (mapa)
        this.singleTileAntennaLayout = null; // Array [x, y] das 64 antenas, centrado em 0,0

        // Gera o layout interno do tile uma vez
        this.generateSingleTileLayout();

        // Adiciona botões de cópia aos textareas
        this.addCopyButtons();

        // Gera o conteúdo fixo do BINGO (position.txt)
        this.updateBingoPositionField();
    }

    // Gera o layout das 64 antenas de um único tile, centrado em 0,0
    generateSingleTileLayout() {
        const antennas = [];
        const SUBGROUP_N = 2;
        const SUBGROUP_M = 8;
        const SUBGROUP_DX = 0.1760695885;
        const SUBGROUP_DY = 0.1675843071;
        const DIAMOND_OFFSET = 0.05;

        const subgroupCenters = [];
        for (let i = 0; i < SUBGROUP_N; i++) {
            const posCx = (i - (SUBGROUP_N - 1) / 2.0) * SUBGROUP_DX;
            for (let j = 0; j < SUBGROUP_M; j++) {
                const posCy = (j - (SUBGROUP_M - 1) / 2.0) * SUBGROUP_DY;
                subgroupCenters.push([posCx, posCy]);
            }
        }

        const offsets = [
            [0, DIAMOND_OFFSET], [DIAMOND_OFFSET, 0],
            [0, -DIAMOND_OFFSET], [-DIAMOND_OFFSET, 0]
        ];

        for (const center of subgroupCenters) {
            for (const offset of offsets) {
                antennas.push([
                    center[0] + offset[0],
                    center[1] + offset[1]
                ]);
            }
        }

        // Re-centraliza para garantir precisão
        let sumX = 0, sumY = 0;
        for(const ant of antennas) { sumX += ant[0]; sumY += ant[1]; }
        const centerX = sumX / antennas.length;
        const centerY = sumY / antennas.length;

        this.singleTileAntennaLayout = antennas.map(ant => [
            ant[0] - centerX,
            ant[1] - centerY
        ]);

        console.log("Layout interno do tile (64 antenas) gerado e centrado.");
        // Atualiza o campo de exportação do tile layout imediatamente
        this.updateTileLayoutField();
    }

    // Inicializa os botões de cópia para cada textarea de exportação
    addCopyButtons() {
        const textareaIds = [
            'export-layout-wgs84',
            'export-position',
            'export-station-layout',
            'export-tile-layout'
        ];
        textareaIds.forEach(id => this._addCopyButtonToTextarea(id));
    }

    // Adiciona um botão de cópia a um textarea específico
    _addCopyButtonToTextarea(textareaId) {
        const textarea = document.getElementById(textareaId);
        if (!textarea) return;
        const container = textarea.parentElement; // O div .export-field
        if (!container) return;
        if (container.querySelector('.copy-btn')) return; // Evita duplicatas

        const copyBtn = document.createElement('button');
        copyBtn.className = 'copy-btn';
        copyBtn.innerHTML = '<i class="fas fa-copy"></i>';
        copyBtn.setAttribute('aria-label', 'Copiar');
        copyBtn.title = 'Copiar para a área de transferência';
        copyBtn.addEventListener('click', (event) => {
            event.preventDefault();
            this.copyToClipboard(textarea, copyBtn);
        });

        if (getComputedStyle(container).position === 'static') {
            container.style.position = 'relative';
        }
        container.appendChild(copyBtn);
    }

    // Copia o conteúdo de um elemento para a área de transferência
    copyToClipboard(element, button) {
        if (!element || !navigator.clipboard) {
            console.warn("Clipboard API não disponível ou elemento inválido.");
             try {
                 element.select();
                 document.execCommand('copy');
                 this.showCopyFeedback(button, true);
             } catch (err) {
                 console.error('Fallback de cópia falhou:', err);
                 this.showCopyFeedback(button, false);
             }
            return;
        }
        navigator.clipboard.writeText(element.value).then(() => {
            this.showCopyFeedback(button, true);
        }).catch(err => {
            console.error('Erro ao copiar com Clipboard API:', err);
            this.showCopyFeedback(button, false);
        });
    }

    // Mostra feedback visual no botão de cópia (sucesso/erro)
    showCopyFeedback(button, success) {
        if (!button) return;
        const icon = button.querySelector('i');
        if (!icon) return;
        const originalIconClass = 'fa-copy';
        const successIconClass = 'fa-check';
        const errorIconClass = 'fa-times';
        const feedbackDuration = 1500;

        const currentIcon = success ? successIconClass : errorIconClass;
        icon.classList.remove(originalIconClass, successIconClass, errorIconClass);
        icon.classList.add(currentIcon);
        button.style.color = success ? 'var(--success-color)' : 'var(--secondary-color)';

        setTimeout(() => {
            icon.classList.remove(successIconClass, errorIconClass);
            icon.classList.add(originalIconClass);
            button.style.color = 'var(--copy-btn-color)';
        }, feedbackDuration);
    }

    // Atualiza todos os campos de exportação com base nos dados atuais
    updateExportFields(tileCenters = null, stations = null) {
        if (tileCenters !== null) {
            this.tileCentersLayout = tileCenters;
        }
        if (stations !== null) {
            this.selectedStationsCoords = Array.isArray(stations) ? stations : (stations ? [stations] : []);
        }
        this.updateLayoutWgs84Field();
        this.updateStationLayoutField();
        this.updateTileLayoutField(); // Chamada aqui também para consistência
        console.log("Campos de exportação OSKAR atualizados.");
    }

    // --- Métodos específicos para cada arquivo de exportação ---

    // Atualiza o textarea para ../layout_wgs84.txt
    updateLayoutWgs84Field() {
        const textarea = document.getElementById('export-layout-wgs84');
        if (!textarea) return;
        if (!this.selectedStationsCoords || this.selectedStationsCoords.length === 0) {
            textarea.value = 'Selecione uma ou mais estações no mapa.';
            return;
        }
        textarea.value = this.selectedStationsCoords.map(station => {
            const lat = station.lat || 0;
            const lon = station.lon || 0;
            const alt = station.alt || 0;
            return `${lat.toFixed(7)},${lon.toFixed(7)},${alt.toFixed(1)}`;
        }).join('\n');
    }

    // Atualiza o textarea para ../position.txt (Fixo)
    updateBingoPositionField() {
        const textarea = document.getElementById('export-position');
        if (!textarea) return;
        textarea.value = `${BINGO_CENTRAL_LATITUDE.toFixed(7)},${BINGO_CENTRAL_LONGITUDE.toFixed(7)},${BINGO_CENTRAL_ALTITUDE.toFixed(1)}`;
    }

    // Atualiza o textarea para ../station/layout.txt
    updateStationLayoutField() {
        const textarea = document.getElementById('export-station-layout');
        if (!textarea) return;
        if (!this.tileCentersLayout || this.tileCentersLayout.length === 0) {
            textarea.value = 'Gere um layout de estação primeiro.';
            return;
        }
        textarea.value = this.tileCentersLayout.map(center => {
             if (Array.isArray(center) && center.length >= 2) {
                 return `${center[0].toFixed(6)},${center[1].toFixed(6)}`;
             }
             return '';
        }).filter(line => line).join('\n');
    }

    // Atualiza o textarea para ../station/tile/layout.txt (Usa o layout pré-calculado)
    updateTileLayoutField() {
        const textarea = document.getElementById('export-tile-layout');
        if (!textarea) return;
        if (!this.singleTileAntennaLayout || this.singleTileAntennaLayout.length === 0) {
            textarea.value = 'Erro interno: Layout do tile não gerado.';
            return;
        }
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

    // Cria a instância do exportador
    if (!window.oskarExporter) {
        window.oskarExporter = new OskarLayoutExporter();
        console.log("Instância de OskarLayoutExporter criada.");
    } else {
        window.oskarExporter.updateExportFields(
            window.antennaGenerator ? window.antennaGenerator.getLayout() : null,
            window.interactiveMap ? window.interactiveMap.getSelectedCoordinates() : null
        );
    }

    // Função global para atualizar os campos
    window.updateExportFields = function(tileCentersLayout, selectedStationsArray) {
        if (window.oskarExporter) {
            window.oskarExporter.updateExportFields(tileCentersLayout, selectedStationsArray);
        } else {
            console.error("OskarLayoutExporter ainda não inicializado ao chamar updateExportFields.");
        }
    };

    // --- Lógica para o Botão de Download ZIP ---
    const downloadBtn = document.getElementById('download-zip-btn');
    const filenameInput = document.getElementById('zip-filename-input'); // <<<--- Obtém o novo input

    if (downloadBtn && filenameInput) { // <<<--- Verifica se ambos existem
        downloadBtn.addEventListener('click', function(event) {
            event.preventDefault();

            console.log("Tentando gerar arquivo ZIP...");
            if (typeof JSZip === 'undefined' || typeof saveAs === 'undefined') {
                alert("Erro: Bibliotecas necessárias para gerar ZIP (JSZip, FileSaver) não foram carregadas.");
                console.error("JSZip ou FileSaver não definidos.");
                return;
            }

            try {
                const zip = new JSZip();
                const contentWGS84 = document.getElementById('export-layout-wgs84').value;
                const contentPosition = document.getElementById('export-position').value;
                const contentStationLayout = document.getElementById('export-station-layout').value;
                const contentTileLayout = document.getElementById('export-tile-layout').value;

                zip.file("layout_wgs84.txt", contentWGS84);
                zip.file("position.txt", contentPosition);
                const stationFolder = zip.folder("station");
                stationFolder.file("layout.txt", contentStationLayout);
                const tileFolder = stationFolder.folder("tile");
                tileFolder.file("layout.txt", contentTileLayout);

                // <<<--- LÓGICA PARA DETERMINAR O NOME DO ARQUIVO --- >>>
                let filename = filenameInput.value.trim(); // Pega o valor do input e remove espaços extras
                const defaultFilename = "oskar_layout.zip";

                if (!filename) {
                    // Se o campo estiver vazio, usa o nome padrão
                    filename = defaultFilename;
                } else {
                    // Se o usuário digitou algo, garante que termina com .zip
                    if (!filename.toLowerCase().endsWith('.zip')) {
                        filename += '.zip';
                    }
                    // Opcional: Sanitizar nome (remover caracteres inválidos)
                    // Exemplo simples: remover caracteres não permitidos em nomes de arquivo comuns
                    filename = filename.replace(/[/\\?%*:|"<>]/g, '_');
                }
                // <<<--- FIM DA LÓGICA DO NOME DO ARQUIVO --- >>>


                // Feedback visual
                downloadBtn.disabled = true;
                downloadBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Gerando...';

                // Gera o ZIP e inicia o download
                zip.generateAsync({ type: "blob" })
                    .then(function(blob) {
                        saveAs(blob, filename); // <<<--- USA O NOME DETERMINADO
                        console.log(`Arquivo ZIP "${filename}" gerado e download iniciado.`);
                        downloadBtn.disabled = false;
                        downloadBtn.innerHTML = '<i class="fas fa-file-archive"></i> Baixar Layout (ZIP)';
                    })
                    .catch(function (err) {
                        console.error("Erro ao gerar o arquivo ZIP:", err);
                        alert("Ocorreu um erro ao gerar o arquivo ZIP. Verifique o console.");
                        downloadBtn.disabled = false;
                        downloadBtn.innerHTML = '<i class="fas fa-file-archive"></i> Baixar Layout (ZIP)';
                    });

            } catch (error) {
                console.error("Erro inesperado ao preparar para gerar ZIP:", error);
                alert("Ocorreu um erro inesperado. Verifique o console.");
                 downloadBtn.disabled = false;
                 downloadBtn.innerHTML = '<i class="fas fa-file-archive"></i> Baixar Layout (ZIP)';
            }
        });
    } else {
        console.warn("Botão de download ZIP (download-zip-btn) ou input de nome (zip-filename-input) não encontrado.");
    }
});

// Mensagem para ambiente não-navegador
if (typeof window === 'undefined') {
    console.warn("Ambiente não-navegador detectado. Funcionalidade ZIP não aplicável.");
}