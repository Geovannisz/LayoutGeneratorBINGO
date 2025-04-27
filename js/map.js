/**
 * Módulo para implementação do mapa interativo com Leaflet.
 * Permite adicionar/remover/arrastar marcadores de estação,
 * visualizar distâncias ao BINGO central, interagir com
 * os módulos de geração de layout e exportação OSKAR, e
 * visualizar o estado de seleção dos marcadores por cor.
 * Utiliza camadas base comutáveis (OSM, Satélite ESRI) e uma camada de overlay para nomes/limites.
 * Ajusta o comportamento de zoom máximo.
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
        const defaultShadowUrl = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png';
        const defaultIconSize = [25, 41];
        const defaultIconAnchor = [12, 41];
        const defaultPopupAnchor = [1, -34];
        const defaultShadowSize = [41, 41];

        this.blueIcon = L.icon({
            iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
            iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
            shadowUrl: defaultShadowUrl,
            iconSize: defaultIconSize, iconAnchor: defaultIconAnchor, popupAnchor: defaultPopupAnchor, shadowSize: defaultShadowSize
        });
        this.redIcon = L.icon({
            iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
            iconRetinaUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
            shadowUrl: defaultShadowUrl,
            iconSize: defaultIconSize, iconAnchor: defaultIconAnchor, popupAnchor: defaultPopupAnchor, shadowSize: defaultShadowSize
        });
        this.greenIcon = L.icon({
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
     * Inicializa a instância do mapa Leaflet, define as camadas de base (OSM, Satélite)
     * e a camada de overlay (Nomes/Limites), adiciona o controle de camadas,
     * ajusta o zoom máximo, adiciona o marcador BINGO (azul) e configura eventos do mapa.
     */
    initMap() {
        if (!document.getElementById('map')) {
             console.error("Elemento 'map' não encontrado no DOM.");
             throw new Error("Div do mapa não encontrada.");
        }

        // --- Configurações de Zoom ---
        const maxZoomLevel = 20; // Nível máximo de zoom que o usuário pode atingir no controle do mapa
        const esriSatelliteMaxNativeZoom = 18; // Nível máximo onde a ESRI *provê* tiles de satélite (comum)
        const esriLabelsMaxZoom = 19; // Nível máximo comum para a camada de nomes/limites ESRI
        const osmMaxZoom = 19; // Nível máximo comum para OpenStreetMap

        // Cria o mapa centrado nas coordenadas do BINGO
        // Define o maxZoom global do mapa aqui
        this.map = L.map('map', {
            maxZoom: maxZoomLevel // Limita o zoom geral do mapa
        }).setView([BINGO_LATITUDE, BINGO_LONGITUDE], 10);

        // --- Definição das Camadas de Tiles ---

        // 1. Camada OpenStreetMap (Mapa de Ruas Padrão / Detalhes)
        const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            maxZoom: osmMaxZoom // Define o zoom máximo para esta camada específica
        });

        // 2. Camada ESRI World Imagery (Satélite)
        const satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            attribution: 'Tiles © Esri',
            maxNativeZoom: esriSatelliteMaxNativeZoom, // Informa ao Leaflet o zoom máximo real dos tiles
            maxZoom: maxZoomLevel // Permite que o Leaflet tente exibir esta camada até o zoom máximo do mapa (overzooming)
        });

        // 3. Camada ESRI World Boundaries and Places (Nomes/Limites para Overlay)
        const labelsLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_And_Places/MapServer/tile/{z}/{y}/{x}', {
            attribution: 'Labels © Esri', // Atribuição simplificada (verificar termos ESRI se necessário)
            maxZoom: maxZoomLevel, // Permite exibir até o zoom máximo do mapa
            maxNativeZoom: esriLabelsMaxZoom, // Zoom nativo desta camada (pode ser 19 ou mais)
            pane: 'overlayPane' // Garante que seja desenhado sobre as camadas base
        });

        // --- Configuração Inicial das Camadas ---

        // Define a camada base padrão (Satélite) e a camada de nomes
        satelliteLayer.addTo(this.map);
        labelsLayer.addTo(this.map);

        // --- Controle de Camadas ---

        // Objeto com as camadas base disponíveis para escolha
        const baseMaps = {
            "Satélite (ESRI)": satelliteLayer,
            "Mapa (OSM)": osmLayer // Adiciona OSM como opção
        };

        // Objeto com as camadas de sobreposição (overlays)
        const overlayMaps = {
            "Nomes e Limites (ESRI)": labelsLayer // Permite ligar/desligar
        };

        // Adiciona o controle de camadas ao mapa
        L.control.layers(baseMaps, overlayMaps, {
             position: 'topright', // Posição do controle
             collapsed: false      // Começa expandido para o usuário ver as opções
        }).addTo(this.map);

        // --- Marcador BINGO ---
        this.bingoMarker = L.marker([BINGO_LATITUDE, BINGO_LONGITUDE], {
            icon: this.blueIcon,
            title: "BINGO Central",
            draggable: false,
            zIndexOffset: 1000
        }).addTo(this.map);
        this.bingoMarker.bindPopup(
            this._createPopupContent("BINGO Central", BINGO_LATITUDE, BINGO_LONGITUDE, BINGO_ALTITUDE, null)
        );

        // --- Eventos do Mapa ---
        this.map.on('click', (e) => {
            this.addMarker(e.latlng.lat, e.latlng.lng, BINGO_ALTITUDE);
        });
        this.map.on('mousemove', (e) => {
            this.updateDynamicDistance(e.latlng);
        });

        console.log("Mapa Leaflet inicializado com camadas comutáveis (Satélite/OSM) e overlay de Nomes/Limites.");
    }

    /**
     * Inicializa os controles relacionados ao mapa (dropdown de arranjos).
     * (Sem alterações)
     */
    initControls() {
        const arranjoSelect = document.getElementById('arranjo-select');
        if (!arranjoSelect) {
             console.error("Elemento 'arranjo-select' não encontrado.");
             return;
        }
        this.loadArranjos().then(arranjos => {
            while (arranjoSelect.options.length > 1) { arranjoSelect.remove(1); }
            arranjos.forEach((arranjo, index) => {
                if (arranjo.nome === 'Selecione um arranjo') return;
                const option = document.createElement('option');
                option.value = index;
                option.textContent = `${arranjo.nome} (${arranjo.latitude.toFixed(5)}, ${arranjo.longitude.toFixed(5)})`;
                arranjoSelect.appendChild(option);
            });
            arranjoSelect.addEventListener('change', () => {
                const selectedIndex = parseInt(arranjoSelect.value, 10);
                if (selectedIndex > 0 && selectedIndex < arranjos.length) {
                    const arranjo = arranjos[selectedIndex];
                    this.addMarker(arranjo.latitude, arranjo.longitude, arranjo.altitude, arranjo.nome);
                    arranjoSelect.value = "0";
                }
            });
        }).catch(error => {
             console.error('Falha ao processar arranjos após carregamento:', error);
        });
    }

    /**
     * Carrega e processa os dados de arranjos pré-definidos de um arquivo CSV.
     * (Sem alterações)
     * @returns {Promise<Array<Object>>}
     */
    async loadArranjos() {
        const csvPath = 'data/posicoes_outriggers.csv';
        console.log(`Tentando carregar arranjos de: ${csvPath}`);
        try {
            const response = await fetch(csvPath);
            if (!response.ok) throw new Error(`Falha ao buscar CSV: ${response.status} ${response.statusText}`);
            const csvText = await response.text();
            const lines = csvText.trim().split('\n');
            if (lines.length < 2) {
                 console.warn(`Arquivo CSV '${csvPath}' vazio ou sem dados.`);
                 return [{ nome: 'Selecione um arranjo', latitude: 0, longitude: 0, altitude: 0 }];
            }
            const headerLine = lines[0].toLowerCase();
            const headers = headerLine.split(',').map(h => h.trim());
            const requiredHeaders = ['arrangementname', 'latitude', 'longitude', 'altitude'];
            if (!requiredHeaders.every(h => headers.includes(h))) {
                 console.warn(`Cabeçalho do CSV (${csvPath}) não contém todos os campos esperados (case-insensitive): ${requiredHeaders.join(', ')}. Cabeçalho encontrado: ${headers.join(', ')}`);
            }
            const arranjos = [{ nome: 'Selecione um arranjo', latitude: 0, longitude: 0, altitude: 0 }];
            for (let i = 1; i < lines.length; i++) {
                const values = lines[i].split(',').map(v => v.trim());
                if (values.length === headers.length) {
                    try {
                        const arranjoData = {};
                        headers.forEach((colName, index) => { arranjoData[colName] = values[index]; });
                        const lat = parseFloat(arranjoData['latitude']);
                        const lon = parseFloat(arranjoData['longitude']);
                        let alt = parseFloat(arranjoData['altitude']);
                        const name = arranjoData['arrangementname'] || `Arranjo ${i}`;
                        if (isNaN(lat) || isNaN(lon)) throw new Error("Latitude ou Longitude inválida.");
                        if (isNaN(alt)) { alt = BINGO_ALTITUDE; }
                        arranjos.push({ nome: name, latitude: lat, longitude: lon, altitude: alt });
                    } catch (parseError) {
                         console.warn(`Erro ao processar linha ${i+1} do CSV: ${lines[i]}. Erro: ${parseError.message}`);
                    }
                } else if (lines[i]) {
                     console.warn(`Linha ${i+1} do CSV ignorada (número de colunas diferente do cabeçalho): ${lines[i]}`);
                }
            }
            console.log(`Arranjos carregados com sucesso de '${csvPath}'. Total: ${arranjos.length - 1} arranjos válidos.`);
            return arranjos;
        } catch (error) {
            console.error(`Erro ao carregar ou processar arranjos de '${csvPath}':`, error);
            alert(`Erro ao carregar o arquivo de arranjos (${csvPath}). Verifique se o arquivo existe e se a página está sendo servida por um servidor web (http/https). Detalhes no console (F12).`);
            return [{ nome: 'Selecione um arranjo', latitude: 0, longitude: 0, altitude: 0 }];
        }
    }

    /**
     * Adiciona um novo marcador de estação (vermelho por padrão) ao mapa.
     * (Sem alterações)
     * @returns {number} O índice do marcador recém-adicionado.
     */
    addMarker(lat, lng, alt, name = null) {
        const markerIndex = this.stationMarkers.length;
        const markerName = name || `Estação ${markerIndex + 1}`;
        const marker = L.marker([lat, lng], {
            draggable: true,
            icon: this.redIcon,
            title: markerName
        }).addTo(this.map);
        const distance = this.calculateDistance(lat, lng, BINGO_LATITUDE, BINGO_LONGITUDE);
        const popupContent = this._createPopupContent(markerName, lat, lng, alt, distance);
        marker.bindPopup(popupContent);
        const line = L.polyline([[lat, lng], [BINGO_LATITUDE, BINGO_LONGITUDE]], {
            color: 'var(--primary-color, blue)', weight: 2, opacity: 0.7, dashArray: '5, 5'
        }).addTo(this.map);
        const tooltip = L.tooltip({ permanent: true, direction: 'center', className: 'distance-tooltip', offset: [0, -7] });
        const midPoint = this.calculateMidpoint(lat, lng, BINGO_LATITUDE, BINGO_LONGITUDE);
        tooltip.setLatLng(midPoint);
        tooltip.setContent(`${distance.toFixed(2)} km`);
        line.bindTooltip(tooltip);
        this.stationMarkers.push(marker);
        this.distanceLines.push(line);
        this.selectedCoordinates.push({ lat: lat, lon: lng, alt: alt, name: markerName });
        const getCurrentIndex = (targetMarker) => this.stationMarkers.indexOf(targetMarker);
        marker.on('drag', (e) => {
            const currentMarker = e.target;
            const currentIndex = getCurrentIndex(currentMarker);
            if (currentIndex === -1) return;
            const newLatLng = currentMarker.getLatLng();
            const currentCoords = this.selectedCoordinates[currentIndex];
            if (!currentCoords) return;
            currentCoords.lat = newLatLng.lat;
            currentCoords.lon = newLatLng.lng;
            this.updateDistanceLine(currentIndex, currentCoords.lat, currentCoords.lon);
            this.updateCoordinatesList();
            if (this.activeMarkerIndex === currentIndex) {
                this.updateSelectedCoordinatesDisplay();
            }
            this.updateOskarExportFields();
        });
        marker.on('dragend', (e) => {
            const currentMarker = e.target;
            const currentIndex = getCurrentIndex(currentMarker);
            if (currentIndex === -1) return;
            const finalLatLng = currentMarker.getLatLng();
            const currentCoords = this.selectedCoordinates[currentIndex];
            if (!currentCoords) return;
            const finalDistance = this.calculateDistance(finalLatLng.lat, finalLatLng.lng, BINGO_LATITUDE, BINGO_LONGITUDE);
            const finalPopupContent = this._createPopupContent(currentCoords.name, finalLatLng.lat, finalLatLng.lng, currentCoords.alt, finalDistance);
            currentMarker.setPopupContent(finalPopupContent);
            if (this.distanceLines[currentIndex]) {
                const line = this.distanceLines[currentIndex];
                const currentTooltip = line.getTooltip();
                if (currentTooltip) {
                    const midPoint = this.calculateMidpoint(finalLatLng.lat, finalLatLng.lng, BINGO_LATITUDE, BINGO_LONGITUDE);
                    currentTooltip.setLatLng(midPoint);
                    currentTooltip.setContent(`${finalDistance.toFixed(2)} km`);
                }
            }
        });
        marker.on('click', (e) => {
             const currentMarker = e.target;
             const currentIndex = getCurrentIndex(currentMarker);
             if (currentIndex === -1) return;
             if (this.activeMarkerIndex !== currentIndex) {
                this.activeMarkerIndex = currentIndex;
                this.updateSelectedCoordinatesDisplay();
                this.updateCoordinatesList();
                this._updateMarkerIcons();
                this.updateOskarExportFields();
             }
             currentMarker.openPopup();
        });
        this.activeMarkerIndex = markerIndex;
        this.updateCoordinatesList();
        this.updateSelectedCoordinatesDisplay();
        this._updateMarkerIcons();
        this.updateOskarExportFields();
        console.log(`Marcador '${markerName}' adicionado no índice ${markerIndex}.`);
        return markerIndex;
    }

    /**
     * Cria o HTML para o conteúdo do popup de um marcador.
     * (Sem alterações)
     * @private
     */
    _createPopupContent(name, lat, lon, alt, distance) {
        const distText = (distance !== null)
            ? distance.toFixed(2)
            : this.calculateDistance(lat, lon, BINGO_LATITUDE, BINGO_LONGITUDE).toFixed(2);
        return `<b>${name}</b><br>Lat: ${lat.toFixed(5)}<br>Lon: ${lon.toFixed(5)}<br>Alt: ${alt.toFixed(1)}m<br>Dist: ${distText} km`;
    }

    /**
     * Atualiza a posição da linha de distância e o conteúdo/posição do seu tooltip.
     * (Sem alterações)
     */
    updateDistanceLine(index, lat, lng) {
        if (index >= 0 && index < this.distanceLines.length) {
            const line = this.distanceLines[index];
            line.setLatLngs([[lat, lng], [BINGO_LATITUDE, BINGO_LONGITUDE]]);
            const tooltip = line.getTooltip();
            if (tooltip) {
                const distance = this.calculateDistance(lat, lng, BINGO_LATITUDE, BINGO_LONGITUDE);
                const midPoint = this.calculateMidpoint(lat, lng, BINGO_LATITUDE, BINGO_LONGITUDE);
                tooltip.setContent(`${distance.toFixed(2)} km`);
                tooltip.setLatLng(midPoint);
            }
        }
    }

    /**
     * Remove um marcador, sua linha de distância e os dados associados.
     * (Sem alterações)
     */
    removeMarker(index) {
        if (index >= 0 && index < this.stationMarkers.length) {
            const removedName = this.selectedCoordinates[index].name;
            this.map.removeLayer(this.stationMarkers[index]);
            this.map.removeLayer(this.distanceLines[index]);
            this.stationMarkers.splice(index, 1);
            this.distanceLines.splice(index, 1);
            this.selectedCoordinates.splice(index, 1);
            const oldActiveIndex = this.activeMarkerIndex;
            if (oldActiveIndex === index) {
                this.activeMarkerIndex = this.stationMarkers.length > 0 ? 0 : -1;
            } else if (oldActiveIndex > index) {
                this.activeMarkerIndex--;
            }
            this.updateCoordinatesList();
            this.updateSelectedCoordinatesDisplay();
            this._updateMarkerIcons();
            this.updateOskarExportFields();
            console.log(`Marcador '${removedName}' (índice original ${index}) removido. Novo índice ativo: ${this.activeMarkerIndex}`);
        } else {
             console.warn(`Tentativa de remover marcador com índice inválido: ${index}`);
        }
    }

    /**
     * Centraliza o mapa em um marcador específico e o define como ativo.
     * (Sem alterações)
     */
    centerOnMarker(index) {
        if (index >= 0 && index < this.stationMarkers.length) {
            const marker = this.stationMarkers[index];
            this.map.setView(marker.getLatLng(), this.map.getZoom());
            marker.openPopup();
            if (this.activeMarkerIndex !== index) {
                this.activeMarkerIndex = index;
                this.updateSelectedCoordinatesDisplay();
                this.updateCoordinatesList();
                this._updateMarkerIcons();
                this.updateOskarExportFields();
            } else {
                this._updateMarkerIcons();
            }
        } else {
             console.warn(`Tentativa de centralizar marcador com índice inválido: ${index}`);
        }
    }

    /**
     * Atualiza a lista de coordenadas (estações) na interface do usuário.
     * (Sem alterações)
     */
    updateCoordinatesList() {
        const coordinatesListDiv = document.getElementById('coordinates-list');
        if (!coordinatesListDiv) return;
        coordinatesListDiv.innerHTML = '';
        this.selectedCoordinates.forEach((coord, index) => {
            const item = document.createElement('div');
            item.className = 'coordinate-item';
            if (index === this.activeMarkerIndex) item.classList.add('active');
            const info = document.createElement('div');
            info.className = 'coordinate-info';
            const distance = this.calculateDistance(coord.lat, coord.lon, BINGO_LATITUDE, BINGO_LONGITUDE);
            info.innerHTML = `<strong>${coord.name}</strong><br>Lat: ${coord.lat.toFixed(5)}, Lon: ${coord.lon.toFixed(5)}<br>Alt: ${coord.alt.toFixed(1)}m, Dist: ${distance.toFixed(2)} km`;
            const actions = document.createElement('div');
            actions.className = 'coordinate-actions';
            const centerBtn = document.createElement('button');
            centerBtn.className = 'icon-btn center-btn';
            centerBtn.innerHTML = '<i class="fas fa-eye"></i>';
            centerBtn.title = 'Centralizar mapa';
            centerBtn.setAttribute('aria-label', 'Centralizar mapa');
            centerBtn.addEventListener('click', (e) => { e.stopPropagation(); this.centerOnMarker(index); });
            const removeBtn = document.createElement('button');
            removeBtn.className = 'icon-btn remove-btn';
            removeBtn.innerHTML = '<i class="fas fa-trash-alt"></i>';
            removeBtn.title = 'Remover estação';
            removeBtn.setAttribute('aria-label', 'Remover estação');
            removeBtn.addEventListener('click', (e) => { e.stopPropagation(); this.removeMarker(index); });
            actions.appendChild(centerBtn);
            actions.appendChild(removeBtn);
            item.appendChild(info);
            item.appendChild(actions);
            item.addEventListener('click', () => {
                 if (this.activeMarkerIndex !== index) {
                    this.activeMarkerIndex = index;
                    this.updateSelectedCoordinatesDisplay();
                    this.updateCoordinatesList();
                    this._updateMarkerIcons();
                    this.updateOskarExportFields();
                 } else {
                      this.centerOnMarker(index);
                 }
            });
            coordinatesListDiv.appendChild(item);
        });
        if (this.selectedCoordinates.length === 0) {
             coordinatesListDiv.innerHTML = '<p class="empty-list-message">Clique no mapa ou selecione um arranjo.</p>';
        }
    }

    /**
     * Atualiza os ícones de todos os marcadores de estação (Verde para ativo, Vermelho para outros).
     * (Sem alterações)
     * @private
     */
    _updateMarkerIcons() {
        this.stationMarkers.forEach((marker, index) => {
            const targetIcon = (index === this.activeMarkerIndex) ? this.greenIcon : this.redIcon;
            marker.setIcon(targetIcon);
        });
    }

    /**
     * Atualiza o display principal de coordenadas/distância na seção map-info.
     * (Sem alterações)
     */
    updateSelectedCoordinatesDisplay() {
        const coordsDisplaySpan = document.getElementById('selected-coords');
        const distanceDisplaySpan = document.getElementById('distance-to-bingo');
        if (!coordsDisplaySpan || !distanceDisplaySpan) return;
        const activeIndex = this.getActiveMarkerIndex();
        if (activeIndex !== -1) {
            const coord = this.selectedCoordinates[activeIndex];
            coordsDisplaySpan.textContent = `${coord.name}: ${coord.lat.toFixed(5)}, ${coord.lon.toFixed(5)}, ${coord.alt.toFixed(1)}m`;
            const distance = this.calculateDistance(coord.lat, coord.lon, BINGO_LATITUDE, BINGO_LONGITUDE);
            distanceDisplaySpan.textContent = `${distance.toFixed(2)} km`;
        } else {
            coordsDisplaySpan.textContent = 'Nenhuma';
            distanceDisplaySpan.textContent = '0.00 km';
        }
    }

    /**
     * Atualiza o display da distância dinâmica (do cursor do mouse ao BINGO).
     * (Sem alterações)
     */
    updateDynamicDistance(latlng) {
        const dynamicDistanceSpan = document.getElementById('dynamic-distance');
        if (!dynamicDistanceSpan) return;
        const distance = this.calculateDistance(latlng.lat, latlng.lng, BINGO_LATITUDE, BINGO_LONGITUDE);
        dynamicDistanceSpan.textContent = `${distance.toFixed(2)} km`;
    }

    /**
     * Calcula a distância entre dois pontos geográficos usando a fórmula de Haversine.
     * (Sem alterações)
     * @returns {number} Distância em quilômetros.
     */
    calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371;
        const dLat = this.deg2rad(lat2 - lat1);
        const dLon = this.deg2rad(lon2 - lon1);
        const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(this.deg2rad(lat1)) * Math.cos(this.deg2rad(lat2)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const distance = R * c;
        return distance;
    }

    /**
     * Calcula o ponto médio geográfico entre dois pontos.
     * (Sem alterações)
     * @returns {L.LatLng} Objeto LatLng do Leaflet representando o ponto médio.
     */
     calculateMidpoint(lat1, lon1, lat2, lon2) {
         const lat1Rad = this.deg2rad(lat1); const lon1Rad = this.deg2rad(lon1);
         const lat2Rad = this.deg2rad(lat2); const lon2Rad = this.deg2rad(lon2);
         const x1 = Math.cos(lat1Rad) * Math.cos(lon1Rad); const y1 = Math.cos(lat1Rad) * Math.sin(lon1Rad); const z1 = Math.sin(lat1Rad);
         const x2 = Math.cos(lat2Rad) * Math.cos(lon2Rad); const y2 = Math.cos(lat2Rad) * Math.sin(lon2Rad); const z2 = Math.sin(lat2Rad);
         const xMid = (x1 + x2) / 2; const yMid = (y1 + y2) / 2; const zMid = (z1 + z2) / 2;
         const lonMidRad = Math.atan2(yMid, xMid);
         const hyp = Math.sqrt(xMid * xMid + yMid * yMid);
         const latMidRad = Math.atan2(zMid, hyp);
         return L.latLng(this.rad2deg(latMidRad), this.rad2deg(lonMidRad));
     }

    /** Converte graus para radianos. (Sem alterações) */
    deg2rad(deg) { return deg * (Math.PI / 180); }
    /** Converte radianos para graus. (Sem alterações) */
     rad2deg(rad) { return rad * (180 / Math.PI); }

    // =======================================================================
    // == Métodos de Interface com Outros Módulos ==
    // =======================================================================

    /**
     * Helper para chamar a função global que atualiza os campos de exportação OSKAR.
     * (Sem alterações)
     */
    updateOskarExportFields() {
        if (typeof window.updateExportFields === 'function') {
            const tileCenters = (window.antennaGenerator && typeof window.antennaGenerator.getLayout === 'function')
                                ? window.antennaGenerator.getLayout() : null;
            window.updateExportFields(tileCenters, this.selectedCoordinates);
        } else {
             console.warn("Função global 'updateExportFields' não encontrada para atualizar exportação.");
        }
    }

    /**
     * Retorna o array completo de coordenadas das estações selecionadas.
     * (Sem alterações)
     * @returns {Array<Object>} Array de objetos {lat, lon, alt, name}.
     */
    getSelectedCoordinates() { return this.selectedCoordinates; }

    /**
     * Retorna o índice do marcador ativo atualmente.
     * (Sem alterações)
     * @returns {number} Índice ativo ou -1 se nenhum ou inválido.
     */
    getActiveMarkerIndex() {
        if (this.activeMarkerIndex < 0 || this.activeMarkerIndex >= this.selectedCoordinates.length) {
             this.activeMarkerIndex = -1;
             return -1;
        }
        return this.activeMarkerIndex;
    }
} // === FIM DA CLASSE InteractiveMap ===

// === Instanciação e Exportação Global ===
if (typeof window !== 'undefined') {
    window.interactiveMap = new InteractiveMap();
    console.log("Instância de InteractiveMap criada.");
} else {
    console.warn("Ambiente não-navegador detectado. 'window.interactiveMap' não foi criado.");
}