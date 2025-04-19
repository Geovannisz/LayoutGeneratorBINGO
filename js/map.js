/**
 * Módulo para implementação do mapa interativo com Leaflet.
 * Permite adicionar/remover/arrastar marcadores de estação,
 * visualizar distâncias ao BINGO central, interagir com
 * os módulos de geração de layout e exportação OSKAR, e
 * visualizar o estado de seleção dos marcadores por cor.
 */

// Constantes Globais - Coordenadas do BINGO Central (Referência)
const BINGO_LATITUDE = -7.04067;
const BINGO_LONGITUDE = -38.26884;
const BINGO_ALTITUDE = 396.4; // Altitude em metros

// Classe para gerenciar o mapa interativo
class InteractiveMap {
    /**
     * Construtor da classe InteractiveMap.
     * Inicializa o mapa, marcadores, linhas, ícones coloridos e estado da aplicação.
     */
    constructor() {
        this.map = null;                // Instância do mapa Leaflet
        this.bingoMarker = null;        // Marcador fixo do BINGO
        this.stationMarkers = [];       // Array para armazenar marcadores Leaflet das estações
        this.distanceLines = [];        // Array para armazenar linhas de distância Leaflet
        this.selectedCoordinates = [];  // Array de objetos {lat, lon, alt, name} representando as estações adicionadas
        this.activeMarkerIndex = -1;    // Índice do marcador/coordenada atualmente ativo (-1 se nenhum)

        // --- Definição dos Ícones Reutilizáveis ---
        // URLs e propriedades padrão para os ícones
        const defaultShadowUrl = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png';
        const defaultIconSize = [25, 41];
        const defaultIconAnchor = [12, 41]; // Ponto do ícone que corresponde à localização do marcador
        const defaultPopupAnchor = [1, -34];  // Ponto relativo ao iconAnchor onde o popup deve abrir
        const defaultShadowSize = [41, 41];

        // Ícone Azul (padrão para BINGO)
        this.blueIcon = L.icon({
            iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png', // Ícone azul padrão do Leaflet (2x para retina)
            iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
            shadowUrl: defaultShadowUrl,
            iconSize: defaultIconSize, iconAnchor: defaultIconAnchor, popupAnchor: defaultPopupAnchor, shadowSize: defaultShadowSize
        });

        // Ícone Vermelho (padrão para estações não selecionadas)
        this.redIcon = L.icon({
            // URL de um marcador vermelho (usando um recurso externo comum)
            iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
            iconRetinaUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
            shadowUrl: defaultShadowUrl,
            iconSize: defaultIconSize, iconAnchor: defaultIconAnchor, popupAnchor: defaultPopupAnchor, shadowSize: defaultShadowSize
        });

        // Ícone Verde (para estação selecionada)
        this.greenIcon = L.icon({
            // URL de um marcador verde
            iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
            iconRetinaUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
            shadowUrl: defaultShadowUrl,
            iconSize: defaultIconSize, iconAnchor: defaultIconAnchor, popupAnchor: defaultPopupAnchor, shadowSize: defaultShadowSize
        });
        // --- Fim da Definição dos Ícones ---

        // Tenta inicializar o mapa e controles
        try {
            this.initMap();
            this.initControls();
        } catch (error) {
            console.error("Erro fatal durante a inicialização do mapa:", error);
            alert("Não foi possível inicializar o mapa interativo. Verifique o console para detalhes.");
        }
    }

    /**
     * Inicializa a instância do mapa Leaflet, define o tile layer,
     * adiciona o marcador BINGO (azul) e configura eventos do mapa.
     */
    initMap() {
        if (!document.getElementById('map')) {
             console.error("Elemento 'map' não encontrado no DOM.");
             throw new Error("Div do mapa não encontrada."); // Interrompe a inicialização
        }
        // Cria o mapa centrado nas coordenadas do BINGO
        this.map = L.map('map').setView([BINGO_LATITUDE, BINGO_LONGITUDE], 10); // Zoom nível 10

        // Adiciona a camada de tiles (mapa base) do OpenStreetMap
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            maxZoom: 18, // Nível máximo de zoom permitido
        }).addTo(this.map);

        // Adiciona o marcador fixo para o BINGO Central usando o ícone azul
        this.bingoMarker = L.marker([BINGO_LATITUDE, BINGO_LONGITUDE], {
            icon: this.blueIcon, // Usa o ícone azul definido no construtor
            title: "BINGO Central", // Tooltip ao passar o mouse
            draggable: false // Não permite arrastar o marcador BINGO
        }).addTo(this.map);

        // Adiciona um popup ao marcador BINGO
        this.bingoMarker.bindPopup(
            this._createPopupContent("BINGO Central", BINGO_LATITUDE, BINGO_LONGITUDE, BINGO_ALTITUDE, null)
        );

        // Evento de clique no mapa: adiciona um novo marcador de estação
        this.map.on('click', (e) => {
            // Adiciona marcador na localização clicada, usando altitude padrão do BINGO
            this.addMarker(e.latlng.lat, e.latlng.lng, BINGO_ALTITUDE);
        });

        // Evento de movimento do mouse: atualiza a distância dinâmica do cursor ao BINGO
        this.map.on('mousemove', (e) => {
            this.updateDynamicDistance(e.latlng);
        });

        console.log("Mapa Leaflet inicializado.");
    }

    /**
     * Inicializa os controles relacionados ao mapa (dropdown de arranjos).
     */
    initControls() {
        const arranjoSelect = document.getElementById('arranjo-select');
        if (!arranjoSelect) {
             console.error("Elemento 'arranjo-select' não encontrado.");
             return;
        }

        // Carrega os arranjos do CSV de forma assíncrona
        this.loadArranjos().then(arranjos => {
            // Limpa opções antigas (exceto a primeira "Selecione...")
            while (arranjoSelect.options.length > 1) { arranjoSelect.remove(1); }
            // Adiciona cada arranjo carregado como uma opção no dropdown
            arranjos.forEach((arranjo, index) => {
                if (arranjo.nome === 'Selecione um arranjo') return; // Pula o placeholder
                const option = document.createElement('option');
                option.value = index; // Usa o índice do array como valor
                option.textContent = `${arranjo.nome} (${arranjo.latitude.toFixed(5)}, ${arranjo.longitude.toFixed(5)})`;
                arranjoSelect.appendChild(option);
            });

            // Evento de mudança no dropdown: adiciona o marcador do arranjo selecionado
            arranjoSelect.addEventListener('change', () => {
                const selectedIndex = parseInt(arranjoSelect.value, 10);
                // Verifica se um arranjo válido foi selecionado (índice > 0)
                if (selectedIndex > 0 && selectedIndex < arranjos.length) {
                    const arranjo = arranjos[selectedIndex];
                    // Adiciona o marcador com os dados do CSV (incluindo altitude)
                    this.addMarker(arranjo.latitude, arranjo.longitude, arranjo.altitude, arranjo.nome);
                    arranjoSelect.value = "0"; // Reseta o dropdown para "Selecione..."
                }
            });
        }).catch(error => {
             // Trata erros no carregamento ou processamento do CSV
             console.error('Falha ao processar arranjos após carregamento:', error);
        });
    }

    /**
     * Carrega e processa os dados de arranjos pré-definidos de um arquivo CSV.
     * @returns {Promise<Array<Object>>} Uma Promise que resolve com um array de objetos de arranjo.
     */
    async loadArranjos() {
        const csvPath = 'data/posicoes_outriggers.csv'; // Caminho para o arquivo CSV
        console.log(`Tentando carregar arranjos de: ${csvPath}`);
        try {
            const response = await fetch(csvPath); // Busca o arquivo
            if (!response.ok) throw new Error(`Falha ao buscar CSV: ${response.status} ${response.statusText}`);
            const csvText = await response.text(); // Lê o conteúdo como texto
            const lines = csvText.trim().split('\n'); // Divide em linhas, removendo espaços extras
            if (lines.length < 2) { // Precisa de cabeçalho + pelo menos uma linha de dados
                 console.warn(`Arquivo CSV '${csvPath}' vazio ou sem dados.`);
                 return [{ nome: 'Selecione um arranjo', latitude: 0, longitude: 0, altitude: 0 }]; // Retorna placeholder
            }

            // Processa o cabeçalho (primeira linha)
            const headerLine = lines[0].toLowerCase(); // Converte para minúsculas para case-insensitivity
            const headers = headerLine.split(',').map(h => h.trim()); // Divide e limpa espaços
            // Verifica se os cabeçalhos necessários estão presentes
            const requiredHeaders = ['arrangementname', 'latitude', 'longitude', 'altitude'];
            if (!requiredHeaders.every(h => headers.includes(h))) {
                 console.warn(`Cabeçalho do CSV (${csvPath}) não contém todos os campos esperados (case-insensitive): ${requiredHeaders.join(', ')}. Cabeçalho encontrado: ${headers.join(', ')}`);
                 // Continua mesmo assim, mas pode falhar ao acessar os dados
            }

            // Array para armazenar os arranjos processados, começando com o placeholder
            const arranjos = [{ nome: 'Selecione um arranjo', latitude: 0, longitude: 0, altitude: 0 }];
            // Processa as linhas de dados (a partir da segunda linha)
            for (let i = 1; i < lines.length; i++) {
                const values = lines[i].split(',').map(v => v.trim()); // Divide e limpa valores
                if (values.length === headers.length) { // Verifica se o número de valores corresponde ao cabeçalho
                    try {
                        // Cria um objeto para o arranjo usando os cabeçalhos como chaves
                        const arranjoData = {};
                        headers.forEach((colName, index) => { arranjoData[colName] = values[index]; });
                        // Converte latitude, longitude e altitude para números
                        const lat = parseFloat(arranjoData['latitude']);
                        const lon = parseFloat(arranjoData['longitude']);
                        let alt = parseFloat(arranjoData['altitude']);
                        const name = arranjoData['arrangementname'] || `Arranjo ${i}`; // Nome padrão se não houver
                        // Valida os números
                        if (isNaN(lat) || isNaN(lon)) throw new Error("Latitude ou Longitude inválida.");
                        if (isNaN(alt)) { alt = BINGO_ALTITUDE; } // Usa altitude padrão do BINGO se inválida/ausente
                        // Adiciona o arranjo processado ao array
                        arranjos.push({ nome: name, latitude: lat, longitude: lon, altitude: alt });
                    } catch (parseError) {
                         // Loga erro se a conversão ou validação falhar para uma linha específica
                         console.warn(`Erro ao processar linha ${i+1} do CSV: ${lines[i]}. Erro: ${parseError.message}`);
                    }
                } else if (lines[i]) { // Loga aviso se a linha não estiver vazia mas tiver número incorreto de colunas
                     console.warn(`Linha ${i+1} do CSV ignorada (número de colunas diferente do cabeçalho): ${lines[i]}`);
                }
            }
            console.log(`Arranjos carregados com sucesso de '${csvPath}'. Total: ${arranjos.length - 1} arranjos válidos.`);
            return arranjos;

        } catch (error) {
            // Trata erros gerais de fetch ou processamento
            console.error(`Erro ao carregar ou processar arranjos de '${csvPath}':`, error);
            alert(`Erro ao carregar o arquivo de arranjos (${csvPath}). Verifique se o arquivo existe e se a página está sendo servida por um servidor web (http/https). Detalhes no console (F12).`);
            return [{ nome: 'Selecione um arranjo', latitude: 0, longitude: 0, altitude: 0 }]; // Retorna placeholder em caso de erro
        }
    }

    /**
     * Adiciona um novo marcador de estação (vermelho por padrão) ao mapa.
     * @param {number} lat Latitude.
     * @param {number} lng Longitude.
     * @param {number} alt Altitude.
     * @param {string|null} [name=null] Nome da estação (opcional).
     * @returns {number} O índice do marcador recém-adicionado no array `stationMarkers`.
     */
    addMarker(lat, lng, alt, name = null) {
        const markerIndex = this.stationMarkers.length; // O índice será a posição atual no array
        const markerName = name || `Estação ${markerIndex + 1}`; // Nome padrão se não fornecido

        // Cria o marcador Leaflet
        const marker = L.marker([lat, lng], {
            draggable: true,       // Permite arrastar o marcador
            icon: this.redIcon,    // Define o ícone inicial como vermelho
            title: markerName      // Tooltip do marcador
        }).addTo(this.map); // Adiciona o marcador ao mapa

        // Calcula a distância inicial ao BINGO
        const distance = this.calculateDistance(lat, lng, BINGO_LATITUDE, BINGO_LONGITUDE);
        // Cria o conteúdo do popup
        const popupContent = this._createPopupContent(markerName, lat, lng, alt, distance);
        // Associa o popup ao marcador
        marker.bindPopup(popupContent);

        // Cria a linha pontilhada entre o marcador e o BINGO
        const line = L.polyline([[lat, lng], [BINGO_LATITUDE, BINGO_LONGITUDE]], {
            color: 'var(--primary-color, blue)', // Cor da linha (usa variável CSS se disponível)
            weight: 2,                           // Espessura da linha
            opacity: 0.7,                        // Transparência
            dashArray: '5, 5'                    // Padrão pontilhado
        }).addTo(this.map);                      // Adiciona a linha ao mapa

        // Cria um tooltip permanente para a linha, mostrando a distância
        const tooltip = L.tooltip({
            permanent: true,          // Sempre visível
            direction: 'center',      // Centralizado na linha
            className: 'distance-tooltip', // Classe CSS para estilização
            offset: [0, -7]           // Pequeno deslocamento vertical
        });
        // Calcula o ponto médio da linha para posicionar o tooltip
        const midPoint = this.calculateMidpoint(lat, lng, BINGO_LATITUDE, BINGO_LONGITUDE);
        tooltip.setLatLng(midPoint);             // Define a posição do tooltip
        tooltip.setContent(`${distance.toFixed(2)} km`); // Define o texto do tooltip
        line.bindTooltip(tooltip);               // Associa o tooltip à linha

        // Armazena as referências ao marcador, linha e coordenadas
        this.stationMarkers.push(marker);
        this.distanceLines.push(line);
        this.selectedCoordinates.push({ lat: lat, lon: lng, alt: alt, name: markerName });

        // --- Eventos do Marcador ---
        // Função auxiliar para obter o índice atual do marcador de forma segura
        const getCurrentIndex = (targetMarker) => this.stationMarkers.indexOf(targetMarker);

        // Evento 'drag': Atualiza posição e linha enquanto arrasta
        marker.on('drag', (e) => {
            const currentMarker = e.target;
            const currentIndex = getCurrentIndex(currentMarker); // Obtém o índice atual
            if (currentIndex === -1) return; // Segurança: sai se o marcador não for encontrado

            const newLatLng = currentMarker.getLatLng();
            const currentCoords = this.selectedCoordinates[currentIndex]; // Usa o índice correto
            if (!currentCoords) return; // Segurança

            // Atualiza as coordenadas armazenadas
            currentCoords.lat = newLatLng.lat;
            currentCoords.lon = newLatLng.lng;
            // Atualiza a linha e seu tooltip de distância
            this.updateDistanceLine(currentIndex, currentCoords.lat, currentCoords.lon);
            // Atualiza a lista na interface
            this.updateCoordinatesList();
            // Atualiza o display principal se este for o marcador ativo
            if (this.activeMarkerIndex === currentIndex) {
                this.updateSelectedCoordinatesDisplay();
            }
            // Atualiza os campos de exportação OSKAR
            this.updateOskarExportFields();
        });

        // Evento 'dragend': Atualiza o popup e tooltip final ao soltar o marcador
        marker.on('dragend', (e) => {
            const currentMarker = e.target;
            const currentIndex = getCurrentIndex(currentMarker); // Obtém o índice atual
            if (currentIndex === -1) return;

            const finalLatLng = currentMarker.getLatLng();
            const currentCoords = this.selectedCoordinates[currentIndex]; // Usa o índice correto
            if (!currentCoords) return;

            // Calcula a distância final
            const finalDistance = this.calculateDistance(finalLatLng.lat, finalLatLng.lng, BINGO_LATITUDE, BINGO_LONGITUDE);
            // Cria o conteúdo final do popup (usando a altitude armazenada)
            const finalPopupContent = this._createPopupContent(currentCoords.name, finalLatLng.lat, finalLatLng.lng, currentCoords.alt, finalDistance);
            currentMarker.setPopupContent(finalPopupContent); // Atualiza o popup do marcador

            // Atualiza o tooltip da linha correspondente
            if (this.distanceLines[currentIndex]) {
                const line = this.distanceLines[currentIndex];
                const currentTooltip = line.getTooltip();
                if (currentTooltip) {
                    // Recalcula o ponto médio para o tooltip
                    const midPoint = this.calculateMidpoint(finalLatLng.lat, finalLatLng.lng, BINGO_LATITUDE, BINGO_LONGITUDE);
                    currentTooltip.setLatLng(midPoint); // Atualiza posição do tooltip
                    currentTooltip.setContent(`${finalDistance.toFixed(2)} km`); // Atualiza conteúdo
                }
            }
        });

        // Evento 'click': Seleciona o marcador clicado
        marker.on('click', (e) => {
             const currentMarker = e.target;
             const currentIndex = getCurrentIndex(currentMarker); // Obtém o índice atual
             if (currentIndex === -1) return;

             // Se o marcador clicado não era o ativo
             if (this.activeMarkerIndex !== currentIndex) {
                this.activeMarkerIndex = currentIndex; // Define como ativo
                // Atualiza a interface e os ícones
                this.updateSelectedCoordinatesDisplay();
                this.updateCoordinatesList();
                this._updateMarkerIcons(); // Atualiza cores dos ícones
                this.updateOskarExportFields();
             }
             // Sempre abre o popup ao clicar, mesmo se já estiver ativo
             currentMarker.openPopup();
        });
        // --- Fim dos Eventos ---

        // --- Atualização Final da Interface ---
        this.activeMarkerIndex = markerIndex; // Define o novo marcador como ativo
        this.updateCoordinatesList();         // Atualiza a lista na UI
        this.updateSelectedCoordinatesDisplay(); // Atualiza o display principal
        this._updateMarkerIcons();            // Define o ícone do novo marcador como verde e os outros como vermelho
        this.updateOskarExportFields();       // Atualiza a exportação

        console.log(`Marcador '${markerName}' adicionado no índice ${markerIndex}.`);
        return markerIndex; // Retorna o índice do marcador adicionado
    }

    /**
     * Cria o HTML para o conteúdo do popup de um marcador.
     * @param {string} name Nome da estação/marcador.
     * @param {number} lat Latitude.
     * @param {number} lon Longitude.
     * @param {number} alt Altitude.
     * @param {number|null} distance Distância ao BINGO em km (ou null para calcular).
     * @returns {string} Conteúdo HTML do popup.
     * @private
     */
    _createPopupContent(name, lat, lon, alt, distance) {
        // Calcula a distância se não for fornecida
        const distText = (distance !== null)
            ? distance.toFixed(2) // Usa a distância fornecida
            : this.calculateDistance(lat, lon, BINGO_LATITUDE, BINGO_LONGITUDE).toFixed(2); // Calcula na hora
        // Formata o HTML
        return `<b>${name}</b><br>Lat: ${lat.toFixed(5)}<br>Lon: ${lon.toFixed(5)}<br>Alt: ${alt.toFixed(1)}m<br>Dist: ${distText} km`;
    }

    /**
     * Atualiza a posição da linha de distância e o conteúdo/posição do seu tooltip.
     * @param {number} index Índice da linha/marcador a ser atualizado.
     * @param {number} lat Nova latitude.
     * @param {number} lng Nova longitude.
     */
    updateDistanceLine(index, lat, lng) {
        // Verifica se o índice é válido
        if (index >= 0 && index < this.distanceLines.length) {
            const line = this.distanceLines[index];
            // Define os novos pontos da linha (marcador atualizado e BINGO)
            line.setLatLngs([[lat, lng], [BINGO_LATITUDE, BINGO_LONGITUDE]]);
            const tooltip = line.getTooltip(); // Obtém o tooltip associado
            if (tooltip) {
                // Recalcula a distância e o ponto médio
                const distance = this.calculateDistance(lat, lng, BINGO_LATITUDE, BINGO_LONGITUDE);
                const midPoint = this.calculateMidpoint(lat, lng, BINGO_LATITUDE, BINGO_LONGITUDE);
                // Atualiza o conteúdo e a posição do tooltip
                tooltip.setContent(`${distance.toFixed(2)} km`);
                tooltip.setLatLng(midPoint);
            }
        }
    }

    /**
     * Remove um marcador, sua linha de distância e os dados associados.
     * Atualiza a interface e o estado de seleção.
     * @param {number} index Índice do marcador a ser removido.
     */
    removeMarker(index) {
        // Verifica se o índice é válido
        if (index >= 0 && index < this.stationMarkers.length) {
            const removedName = this.selectedCoordinates[index].name; // Guarda o nome para log

            // Remove o marcador e a linha do mapa
            this.map.removeLayer(this.stationMarkers[index]);
            this.map.removeLayer(this.distanceLines[index]);

            // Remove os itens dos arrays de referência
            this.stationMarkers.splice(index, 1);
            this.distanceLines.splice(index, 1);
            this.selectedCoordinates.splice(index, 1);

            // --- Atualiza o Índice Ativo ---
            const oldActiveIndex = this.activeMarkerIndex;
            if (oldActiveIndex === index) {
                // Se o removido era o ativo, seleciona o primeiro (se houver) ou nenhum
                this.activeMarkerIndex = this.stationMarkers.length > 0 ? 0 : -1;
            } else if (oldActiveIndex > index) {
                // Se um item ANTES do ativo foi removido, decrementa o índice ativo
                this.activeMarkerIndex--;
            }
            // Se um item DEPOIS do ativo foi removido, activeMarkerIndex não precisa mudar

            // --- Atualiza a Interface ---
            this.updateCoordinatesList(); // Atualiza a lista de itens
            this.updateSelectedCoordinatesDisplay(); // Atualiza o display principal
            this._updateMarkerIcons(); // Atualiza as cores dos ícones restantes
            this.updateOskarExportFields(); // Atualiza a exportação

            console.log(`Marcador '${removedName}' (índice original ${index}) removido. Novo índice ativo: ${this.activeMarkerIndex}`);
        } else {
             console.warn(`Tentativa de remover marcador com índice inválido: ${index}`);
        }
    }

    /**
     * Centraliza o mapa em um marcador específico e o define como ativo.
     * @param {number} index Índice do marcador a ser centralizado.
     */
    centerOnMarker(index) {
        // Verifica se o índice é válido
        if (index >= 0 && index < this.stationMarkers.length) {
            const marker = this.stationMarkers[index];
            // Move a visão do mapa para as coordenadas do marcador
            this.map.setView(marker.getLatLng(), this.map.getZoom());
            // Abre o popup do marcador
            marker.openPopup();

            // Se o marcador centralizado não era o ativo
            if (this.activeMarkerIndex !== index) {
                this.activeMarkerIndex = index; // Define como ativo
                // Atualiza a interface e os ícones
                this.updateSelectedCoordinatesDisplay();
                this.updateCoordinatesList();
                this._updateMarkerIcons(); // Atualiza cores
                this.updateOskarExportFields();
            } else {
                // Se já era ativo, garante que os ícones estejam corretos (caso algo dessincronize)
                this._updateMarkerIcons();
            }
        } else {
             console.warn(`Tentativa de centralizar marcador com índice inválido: ${index}`);
        }
    }

    /**
     * Atualiza a lista de coordenadas (estações) na interface do usuário (na seção map-info).
     * Inclui nome, coordenadas, distância e botões de ação (Ver/Remover com ícones).
     */
    updateCoordinatesList() {
        const coordinatesListDiv = document.getElementById('coordinates-list');
        if (!coordinatesListDiv) return; // Sai se o elemento não for encontrado
        coordinatesListDiv.innerHTML = ''; // Limpa o conteúdo anterior

        // Itera sobre cada coordenada/marcador adicionado
        this.selectedCoordinates.forEach((coord, index) => {
            const item = document.createElement('div');
            item.className = 'coordinate-item'; // Classe para estilização
            // Adiciona classe 'active' se for o item selecionado atualmente
            if (index === this.activeMarkerIndex) item.classList.add('active');

            // Div para informações (nome, lat, lon, alt, dist)
            const info = document.createElement('div');
            info.className = 'coordinate-info';
            const distance = this.calculateDistance(coord.lat, coord.lon, BINGO_LATITUDE, BINGO_LONGITUDE);
            info.innerHTML = `<strong>${coord.name}</strong><br>Lat: ${coord.lat.toFixed(5)}, Lon: ${coord.lon.toFixed(5)}<br>Alt: ${coord.alt.toFixed(1)}m, Dist: ${distance.toFixed(2)} km`;

            // Div para botões de ação
            const actions = document.createElement('div');
            actions.className = 'coordinate-actions';

            // Botão "Ver" (Centralizar) com ícone de olho
            const centerBtn = document.createElement('button');
            centerBtn.className = 'icon-btn center-btn'; // Classe base e específica
            centerBtn.innerHTML = '<i class="fas fa-eye"></i>'; // Ícone Font Awesome
            centerBtn.title = 'Centralizar mapa';
            centerBtn.setAttribute('aria-label', 'Centralizar mapa'); // Acessibilidade
            centerBtn.addEventListener('click', (e) => {
                e.stopPropagation(); // Impede que o clique no botão propague para o item da lista
                this.centerOnMarker(index); // Chama a função para centralizar
            });

            // Botão "Remover" com ícone de lixeira
            const removeBtn = document.createElement('button');
            removeBtn.className = 'icon-btn remove-btn'; // Classe base e específica
            removeBtn.innerHTML = '<i class="fas fa-trash-alt"></i>'; // Ícone Font Awesome
            removeBtn.title = 'Remover estação';
            removeBtn.setAttribute('aria-label', 'Remover estação'); // Acessibilidade
            removeBtn.addEventListener('click', (e) => {
                 e.stopPropagation(); // Impede propagação
                 this.removeMarker(index); // Chama a função para remover
            });

            // Adiciona os botões à div de ações
            actions.appendChild(centerBtn);
            actions.appendChild(removeBtn);
            // Adiciona as informações e ações ao item da lista
            item.appendChild(info);
            item.appendChild(actions);

            // Evento de clique no próprio item da lista: seleciona o marcador correspondente
            item.addEventListener('click', () => {
                 // Se o item clicado não era o ativo
                 if (this.activeMarkerIndex !== index) {
                    this.activeMarkerIndex = index; // Define como ativo
                    // Atualiza a interface e os ícones
                    this.updateSelectedCoordinatesDisplay();
                    this.updateCoordinatesList(); // Redesenha a lista para destacar o novo ativo
                    this._updateMarkerIcons(); // Atualiza cores dos marcadores
                    this.updateOskarExportFields();
                 } else {
                      // Se clicou no que já estava ativo, apenas centraliza no mapa
                      this.centerOnMarker(index);
                 }
            });

            // Adiciona o item completo à div da lista
            coordinatesListDiv.appendChild(item);
        });

        // Se não houver coordenadas/marcadores, exibe uma mensagem
        if (this.selectedCoordinates.length === 0) {
             coordinatesListDiv.innerHTML = '<p class="empty-list-message">Clique no mapa ou selecione um arranjo.</p>';
        }
    }

    /**
     * Atualiza os ícones de todos os marcadores de estação com base
     * no índice do marcador ativo (selecionado).
     * O marcador ativo fica verde, os outros ficam vermelhos.
     * @private // Indica que é um método interno da classe
     */
    _updateMarkerIcons() {
        this.stationMarkers.forEach((marker, index) => {
            // Define o ícone verde se o índice for o ativo, senão define o vermelho
            const targetIcon = (index === this.activeMarkerIndex) ? this.greenIcon : this.redIcon;
            // Aplica o ícone ao marcador correspondente
            marker.setIcon(targetIcon);
        });
    }

    /**
     * Atualiza o display principal de coordenadas/distância na seção map-info.
     */
    updateSelectedCoordinatesDisplay() {
        const coordsDisplaySpan = document.getElementById('selected-coords');
        const distanceDisplaySpan = document.getElementById('distance-to-bingo');
        if (!coordsDisplaySpan || !distanceDisplaySpan) return; // Sai se elementos não encontrados

        // Verifica se há um marcador ativo válido
        const activeIndex = this.getActiveMarkerIndex(); // Usa helper para garantir validade
        if (activeIndex !== -1) {
            const coord = this.selectedCoordinates[activeIndex]; // Obtém os dados do marcador ativo
            // Exibe nome, coordenadas e altitude
            coordsDisplaySpan.textContent = `${coord.name}: ${coord.lat.toFixed(5)}, ${coord.lon.toFixed(5)}, ${coord.alt.toFixed(1)}m`;
            // Calcula e exibe a distância
            const distance = this.calculateDistance(coord.lat, coord.lon, BINGO_LATITUDE, BINGO_LONGITUDE);
            distanceDisplaySpan.textContent = `${distance.toFixed(2)} km`;
        } else {
            // Se nenhum marcador estiver ativo
            coordsDisplaySpan.textContent = 'Nenhuma';
            distanceDisplaySpan.textContent = '0.00 km';
        }
    }

    /**
     * Atualiza o display da distância dinâmica (do cursor do mouse ao BINGO).
     * @param {L.LatLng} latlng Coordenadas atuais do cursor.
     */
    updateDynamicDistance(latlng) {
        const dynamicDistanceSpan = document.getElementById('dynamic-distance');
        if (!dynamicDistanceSpan) return; // Sai se elemento não encontrado
        // Calcula e exibe a distância
        const distance = this.calculateDistance(latlng.lat, latlng.lng, BINGO_LATITUDE, BINGO_LONGITUDE);
        dynamicDistanceSpan.textContent = `${distance.toFixed(2)} km`;
    }

    /**
     * Calcula a distância entre dois pontos geográficos usando a fórmula de Haversine.
     * @param {number} lat1 Latitude do ponto 1.
     * @param {number} lon1 Longitude do ponto 1.
     * @param {number} lat2 Latitude do ponto 2.
     * @param {number} lon2 Longitude do ponto 2.
     * @returns {number} Distância em quilômetros.
     */
    calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371; // Raio da Terra em km
        const dLat = this.deg2rad(lat2 - lat1); // Diferença de latitude em radianos
        const dLon = this.deg2rad(lon2 - lon1); // Diferença de longitude em radianos
        // Fórmula de Haversine
        const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(this.deg2rad(lat1)) * Math.cos(this.deg2rad(lat2)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const distance = R * c; // Distância final em km
        return distance;
    }

    /**
     * Calcula o ponto médio geográfico entre dois pontos.
     * Útil para posicionar tooltips em linhas.
     * @param {number} lat1 Latitude ponto 1.
     * @param {number} lon1 Longitude ponto 1.
     * @param {number} lat2 Latitude ponto 2.
     * @param {number} lon2 Longitude ponto 2.
     * @returns {L.LatLng} Objeto LatLng do Leaflet representando o ponto médio.
     */
     calculateMidpoint(lat1, lon1, lat2, lon2) {
         // Converte graus para radianos
         const lat1Rad = this.deg2rad(lat1); const lon1Rad = this.deg2rad(lon1);
         const lat2Rad = this.deg2rad(lat2); const lon2Rad = this.deg2rad(lon2);
         // Converte coordenadas esféricas para cartesianas
         const x1 = Math.cos(lat1Rad) * Math.cos(lon1Rad); const y1 = Math.cos(lat1Rad) * Math.sin(lon1Rad); const z1 = Math.sin(lat1Rad);
         const x2 = Math.cos(lat2Rad) * Math.cos(lon2Rad); const y2 = Math.cos(lat2Rad) * Math.sin(lon2Rad); const z2 = Math.sin(lat2Rad);
         // Calcula o ponto médio cartesiano
         const xMid = (x1 + x2) / 2; const yMid = (y1 + y2) / 2; const zMid = (z1 + z2) / 2;
         // Converte o ponto médio cartesiano de volta para coordenadas esféricas (latitude/longitude)
         const lonMidRad = Math.atan2(yMid, xMid);
         const hyp = Math.sqrt(xMid * xMid + yMid * yMid);
         const latMidRad = Math.atan2(zMid, hyp);
         // Retorna um objeto LatLng do Leaflet com graus
         return L.latLng(this.rad2deg(latMidRad), this.rad2deg(lonMidRad));
     }

    /** Converte graus para radianos. */
    deg2rad(deg) { return deg * (Math.PI / 180); }
    /** Converte radianos para graus. */
     rad2deg(rad) { return rad * (180 / Math.PI); }

    // =======================================================================
    // == Métodos de Interface com Outros Módulos ==
    // =======================================================================

    /**
     * Helper para chamar a função global que atualiza os campos de exportação OSKAR.
     * Passa o layout de tiles atual (se disponível) e a lista completa de estações selecionadas.
     */
    updateOskarExportFields() {
        // Verifica se a função global existe
        if (typeof window.updateExportFields === 'function') {
            // Obtém o layout de tiles do gerador, se existir
            const tileCenters = (window.antennaGenerator && typeof window.antennaGenerator.getLayout === 'function')
                                ? window.antennaGenerator.getLayout() : null;
            // Chama a função global passando o layout e a lista completa de coordenadas/estações
            window.updateExportFields(tileCenters, this.selectedCoordinates);
        } else {
             console.warn("Função global 'updateExportFields' não encontrada para atualizar exportação.");
        }
    }

    /**
     * Retorna o array completo de coordenadas das estações selecionadas.
     * Usado por outros módulos (como exportação).
     * @returns {Array<Object>} Array de objetos {lat, lon, alt, name}.
     */
    getSelectedCoordinates() { return this.selectedCoordinates; }

    /**
     * Retorna o índice do marcador ativo atualmente.
     * Garante que o índice retornado seja válido ou -1.
     * @returns {number} Índice ativo ou -1 se nenhum ou inválido.
     */
    getActiveMarkerIndex() {
        // Verifica se o índice está dentro dos limites do array atual de coordenadas
        if (this.activeMarkerIndex < 0 || this.activeMarkerIndex >= this.selectedCoordinates.length) {
             this.activeMarkerIndex = -1; // Corrige se estiver fora dos limites
             return -1; // Retorna -1
        }
        return this.activeMarkerIndex; // Retorna o índice válido
    }
} // === FIM DA CLASSE InteractiveMap ===

// === Instanciação e Exportação Global ===
// Cria a instância da classe no escopo global (window) para ser acessível por outros scripts
if (typeof window !== 'undefined') {
    // Adiciona a instância ao objeto window, permitindo que main.js a encontre
    window.interactiveMap = new InteractiveMap();
    console.log("Instância de InteractiveMap criada.");
} else {
    console.warn("Ambiente não-navegador detectado. 'window.interactiveMap' não foi criado.");
}