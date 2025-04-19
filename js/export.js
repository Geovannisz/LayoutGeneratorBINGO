/**
 * Módulo para implementação da funcionalidade de exportação para OSKAR
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

        // Adiciona botões de cópia
        this.addCopyButtons();

        // Gera o conteúdo fixo do BINGO
        this.updateBingoPositionField();
    }

    // Gera o layout das 64 antenas de um único tile, centrado em 0,0
    generateSingleTileLayout() {
        // Reutiliza a lógica de generator.js, mas sem o centerX/Y
        // Presume que as constantes TILE_WIDTH, TILE_HEIGHT, SUBGROUP_N etc.
        // estão disponíveis globalmente ou são passadas/importadas.
        // Para simplificar aqui, vamos copiar a lógica essencial:
        const antennas = [];
        const SUBGROUP_N = 2;
        const SUBGROUP_M = 8;
        const SUBGROUP_DX = 0.1760695885;
        const SUBGROUP_DY = 0.1675843071;
        const DIAMOND_OFFSET = 0.05;

        const subgroupCenters = [];
        for (let i = 0; i < SUBGROUP_N; i++) {
            const posCx = (i - (SUBGROUP_N - 1) / 2.0) * SUBGROUP_DX; // Centro X = 0
            for (let j = 0; j < SUBGROUP_M; j++) {
                const posCy = (j - (SUBGROUP_M - 1) / 2.0) * SUBGROUP_DY; // Centro Y = 0
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
    }

    // Inicializa os botões de cópia
    addCopyButtons() {
        const textareaIds = [
            'export-layout-wgs84',
            'export-position',
            'export-station-layout',
            'export-tile-layout'
        ];
        textareaIds.forEach(id => this._addCopyButtonToTextarea(id));
    }

    _addCopyButtonToTextarea(textareaId) {
        const textarea = document.getElementById(textareaId);
        if (!textarea) return;
        const container = textarea.parentElement;
        if (!container) return;

        // Evita adicionar múltiplos botões
        if (container.querySelector('.copy-btn')) return;

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

    // Copia e dá feedback (igual à versão anterior)
    copyToClipboard(element, button) {
        if (!element || !navigator.clipboard) {
            console.warn("Clipboard API não disponível ou elemento inválido.");
             try { // Fallback
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
            console.error('Erro ao copiar:', err);
            this.showCopyFeedback(button, false);
        });
    }

    // Feedback visual (igual à versão anterior)
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
        // Define a cor baseado no sucesso ou falha
        button.style.color = success ? 'var(--success-color)' : 'var(--secondary-color)';
        setTimeout(() => {
            icon.classList.remove(successIconClass, errorIconClass);
            icon.classList.add(originalIconClass);
            button.style.color = 'var(--copy-btn-color)'; // Volta cor padrão do CSS
        }, feedbackDuration);
    }

    // Atualiza todos os campos de exportação com base nos dados atuais
    updateExportFields(tileCenters = null, stations = null) {
        if (tileCenters !== null) {
            this.tileCentersLayout = tileCenters;
        }
        if (stations !== null) {
            // Garante que seja sempre um array
            this.selectedStationsCoords = Array.isArray(stations) ? stations : (stations ? [stations] : []);
        }

        // Atualiza os campos individuais
        this.updateLayoutWgs84Field();
        // this.updateBingoPositionField(); // Já chamado no construtor
        this.updateStationLayoutField();
        this.updateTileLayoutField();

        console.log("Campos de exportação OSKAR atualizados.");
    }

    // --- Métodos específicos para cada arquivo ---

    // ../layout_wgs84.txt
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

    // ../position.txt (Fixo)
    updateBingoPositionField() {
        const textarea = document.getElementById('export-position');
        if (!textarea) return;
        textarea.value = `${BINGO_CENTRAL_LATITUDE.toFixed(7)},${BINGO_CENTRAL_LONGITUDE.toFixed(7)},${BINGO_CENTRAL_ALTITUDE.toFixed(1)}`;
    }

    // ../station/layout.txt
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

    // ../station/tile/layout.txt (Usa o layout pré-calculado)
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
}

// Exporta a instância para uso global
if (typeof window !== 'undefined') {
    window.oskarExporter = new OskarLayoutExporter();

    // Função global para atualizar os campos (interface para outros módulos)
    // Agora aceita os centros dos tiles e a LISTA de estações selecionadas
    window.updateExportFields = function(tileCentersLayout, selectedStationsArray) {
        if (window.oskarExporter) {
            window.oskarExporter.updateExportFields(tileCentersLayout, selectedStationsArray);
        } else {
            console.error("OskarLayoutExporter ainda não inicializado.");
        }
    };
} else {
    console.warn("Ambiente não-navegador detectado. 'window.oskarExporter' e 'window.updateExportFields' não foram criados.");
}