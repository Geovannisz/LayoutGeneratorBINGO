/**
 * Módulo para implementação do mapa interativo com Leaflet.
 * Permite adicionar/remover/arrastar marcadores de estação,
 * visualizar distâncias ao BINGO central, interagir com
 * os módulos de geração de layout e exportação OSKAR, e
 * visualizar o estado de seleção dos marcadores por cor.
 * Utiliza camadas base comutáveis (OSM, Satélite ESRI) e uma camada de overlay para nomes/limites.
 * Inclui funcionalidade para visualizar o arranjo de tiles/antenas em escala real no mapa,
 * com os elementos do arranjo (antenas, centros de tiles) representando uma área geográfica constante.
 * Contém correção para bug de "marcador duplicado" após arrastar.
 */

// Constantes Globais - Coordenadas do BINGO Central (Referência)
const BINGO_LATITUDE = -7.04067;
const BINGO_LONGITUDE = -38.26884;
const BINGO_ALTITUDE = 396.4; // Altitude em metros

// --- CONSTANTES PARA VISUALIZAÇÃO DO ARRANJO ---
// Estas dimensões de tile são para calcular as POSIÇÕES dos elementos do arranjo.
// Devem estar sincronizadas com as de `generator.js`.
const ARR_TILE_WIDTH = 0.35;    // Largura do tile em metros
const ARR_TILE_HEIGHT = 1.34;   // Altura do tile em metros

// --- RAIOS EM METROS PARA L.circle (REPRESENTAÇÃO VISUAL NO MAPA) ---
// Estes raios definem o tamanho dos círculos no terreno.
// Eles parecerão menores no zoom out e maiores no zoom in.
const ANTENNA_DOT_RADIUS_M = 0.03;   // Raio em METROS para a visualização de uma antena
const TILE_CENTER_DOT_RADIUS_M = 0.05; // Raio em METROS para a visualização do centro de um tile

// Classe para gerenciar o mapa interativo
class InteractiveMap {
    /**
     * Construtor da classe InteractiveMap.
     * Inicializa o mapa, marcadores, linhas, ícones coloridos e estado da aplicação.
     */
    constructor() {
        this.map = null;
        this.bingoMarker = null;
        this.stationMarkers = [];
        this.distanceLines = [];
        this.selectedCoordinates = [];
        this.activeMarkerIndex = -1;

        this.arrangementLayer = L.featureGroup();
        this.isArrangementLayerActive = false;
        this.activeBaseLayerName = '';
        this.layersControl = null;

        // --- NOVA FLAG PARA CORREÇÃO DO BUG DE DRAG/CLICK ---
        this.isDraggingMarker = false; // True se um marcador de estação estiver sendo arrastado

        // Definição dos Ícones Reutilizáveis para marcadores de estação
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

        try {
            this.initMap();
            this.initControls();
        } catch (error) {
            console.error("Erro fatal durante a inicialização do mapa:", error);
            alert("Não foi possível inicializar o mapa interativo. Verifique o console para detalhes.");
        }
    }

    /**
     * Inicializa a instância do mapa Leaflet.
     * MODIFICADO: Adicionado tratamento para `this.isDraggingMarker` no evento 'click' do mapa.
     */
    initMap() {
        if (!document.getElementById('map')) {
             console.error("Elemento 'map' não encontrado no DOM.");
             throw new Error("Div do mapa não encontrada.");
        }

        const maxZoomLevel = 20; 
        const esriSatelliteMaxNativeZoom = 18; 
        const esriLabelsMaxZoom = 19; 
        const osmMaxZoom = 19;

        this.map = L.map('map', {
            maxZoom: maxZoomLevel 
        }).setView([BINGO_LATITUDE, BINGO_LONGITUDE], 10);

        const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            maxZoom: osmMaxZoom
        });
        const satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            attribution: 'Tiles © Esri',
            maxNativeZoom: esriSatelliteMaxNativeZoom,
            maxZoom: maxZoomLevel 
        });
        const labelsLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_And_Places/MapServer/tile/{z}/{y}/{x}', {
            attribution: 'Labels © Esri',
            maxZoom: maxZoomLevel,
            maxNativeZoom: esriLabelsMaxZoom,
            pane: 'overlayPane'
        });

        satelliteLayer.addTo(this.map);
        labelsLayer.addTo(this.map);

        const baseMaps = {
            "Satélite (ESRI)": satelliteLayer,
            "Mapa (OSM)": osmLayer
        };
        const overlayMaps = {
            "Nomes e Limites (ESRI)": labelsLayer,
            "Visualizar o Arranjo": this.arrangementLayer
        };

        this.layersControl = L.control.layers(baseMaps, overlayMaps, {
             position: 'topright',
             collapsed: true 
        }).addTo(this.map);

        for (const name in baseMaps) {
            if (this.map.hasLayer(baseMaps[name])) {
                this.activeBaseLayerName = name;
                break;
            }
        }

        this.bingoMarker = L.marker([BINGO_LATITUDE, BINGO_LONGITUDE], {
            icon: this.blueIcon,
            title: "BINGO Central",
            draggable: false,
            zIndexOffset: 1000
        }).addTo(this.map);
        this.bingoMarker.bindPopup(
            this._createPopupContent("BINGO Central", BINGO_LATITUDE, BINGO_LONGITUDE, BINGO_ALTITUDE, null)
        );

        // --- MODIFICAÇÃO NO EVENTO 'click' DO MAPA ---
        this.map.on('click', (e) => {
            // Se um marcador acabou de ser arrastado e solto, este evento de clique
            // pode ser disparado acidentalmente. Ignoramos se a flag estiver ativa.
            if (this.isDraggingMarker) {
                // console.log("Map click event ignored due to recent drag operation or flag still active.");
                // A flag será resetada pelo setTimeout em 'dragend'
                return; 
            }
            const { lat, lng } = e.latlng;
            this.fetchElevation(lat, lng).then(alt => {
                this.addMarker(lat, lng, alt);
            });
        });
        // --- FIM DA MODIFICAÇÃO ---

        this.map.on('mousemove', (e) => {
            this.updateDynamicDistance(e.latlng);
        });

        this.map.on('overlayadd', (e) => {
            if (e.layer === this.arrangementLayer) {
                this.isArrangementLayerActive = true;
                this.updateArrangementVisuals();
            }
        });
        this.map.on('overlayremove', (e) => {
            if (e.layer === this.arrangementLayer) {
                this.isArrangementLayerActive = false;
                this.arrangementLayer.clearLayers();
            }
        });

        this.map.on('baselayerchange', (e) => {
            this.activeBaseLayerName = e.name;
            if (this.isArrangementLayerActive) {
                this.updateArrangementVisuals();
            }
        });

        this.map.on('zoomend moveend', () => {
            // Nenhuma ação específica necessária para L.circle com raio em metros
        });

        window.addEventListener('layoutGenerated', () => {
            if (this.isArrangementLayerActive) {
                this.updateArrangementVisuals();
            }
            this.updateOskarExportFields();
        });

        window.addEventListener('themeChanged', () => {
            const newPrimaryColor = getComputedStyle(document.documentElement).getPropertyValue('--primary-color').trim() || 'blue';
            this.distanceLines.forEach(line => {
                if (this.map.hasLayer(line)) {
                    line.setStyle({ color: newPrimaryColor });
                }
            });
            if (this.isArrangementLayerActive) {
                this.updateArrangementVisuals();
            }
        });

        console.log("Mapa Leaflet inicializado.");
    }

    // initControls() - sem alterações na lógica interna
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
                const idx = parseInt(arranjoSelect.value, 10);
                if (idx > 0 && idx < arranjos.length) {
                    const { latitude: lat, longitude: lng, nome } = arranjos[idx];
                    this.fetchElevation(lat, lng).then(alt => {
                        this.addMarker(lat, lng, alt, nome);
                    });
                    arranjoSelect.value = "0";
                }
            });            
        }).catch(error => {
             console.error('Falha ao processar arranjos após carregamento:', error);
        });
    }

    // loadArranjos() - sem alterações na lógica interna
    async loadArranjos() {
        const csvPath = 'data/posicoes_outriggers.csv';
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
                        if (isNaN(alt)) alt = BINGO_ALTITUDE;

                        arranjos.push({ nome: name, latitude: lat, longitude: lon, altitude: alt });
                    } catch (parseError) {
                         console.warn(`Erro ao processar linha ${i+1} do CSV: ${lines[i]}. Erro: ${parseError.message}`);
                    }
                }
            }
            return arranjos;
        } catch (error) {
            console.error(`Erro ao carregar ou processar arranjos de '${csvPath}':`, error);
            return [{ nome: 'Selecione um arranjo', latitude: 0, longitude: 0, altitude: 0 }];
        }
    }

    /**
     * Adiciona um novo marcador de estação ao mapa.
     * MODIFICADO: Adiciona evento 'dragstart' e ajusta 'dragend' para gerenciar `this.isDraggingMarker`.
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
            color: getComputedStyle(document.documentElement).getPropertyValue('--primary-color').trim() || 'blue',
            weight: 2, opacity: 0.7, dashArray: '5, 5'
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

        // --- MODIFICAÇÕES NOS EVENTOS DE DRAG DO MARCADOR ---
        marker.on('dragstart', () => {
            this.isDraggingMarker = true; // Define a flag quando o arraste começa
            // console.log("Marker dragstart: isDraggingMarker = true");
        });

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

            if (this.isArrangementLayerActive) {
                this.updateArrangementVisuals();
            }
            // Não precisa mais setar isDraggingMarker = true aqui, já foi feito no dragstart
        });

        marker.on('dragend', async (e) => {
            // console.log("Marker dragend: Processando...");
            const currentMarker = e.target;
            const currentIndex = getCurrentIndex(currentMarker);
            if (currentIndex === -1) {
                // Se o índice for inválido (improvável aqui, mas bom para defesa), reseta a flag
                // console.log("Marker dragend: Invalid index, resetting isDraggingMarker.");
                this.isDraggingMarker = false; 
                return;
            }

            const finalLatLng = currentMarker.getLatLng();
            let newAlt;
            try {
                newAlt = await this.fetchElevation(finalLatLng.lat, finalLatLng.lng);
            } catch (err) {
                console.error('Erro ao buscar elevação no dragend:', err);
                newAlt = this.selectedCoordinates[currentIndex] ? this.selectedCoordinates[currentIndex].alt : BINGO_ALTITUDE;
            }

            const currentCoords = this.selectedCoordinates[currentIndex];
            currentCoords.lat = finalLatLng.lat;
            currentCoords.lon = finalLatLng.lng;
            currentCoords.alt = newAlt;

            const finalDistance = this.calculateDistance(finalLatLng.lat, finalLatLng.lng, BINGO_LATITUDE, BINGO_LONGITUDE);
            const finalPopupContent = this._createPopupContent(currentCoords.name, finalLatLng.lat, finalLatLng.lng, newAlt, finalDistance);
            currentMarker.setPopupContent(finalPopupContent);

            this.updateDistanceLine(currentIndex, finalLatLng.lat, finalLatLng.lng);
            this.updateCoordinatesList();
            if (this.activeMarkerIndex === currentIndex) {
                this.updateSelectedCoordinatesDisplay();
            }
            this.updateOskarExportFields();
            if (this.isArrangementLayerActive) {
                this.updateArrangementVisuals();
            }

            // A flag isDraggingMarker permanece true aqui.
            // Usamos setTimeout para resetá-la após um curto delay.
            // Isso permite que o evento 'click' do mapa, se ocorrer imediatamente após o dragend,
            // veja a flag como true e seja ignorado pela lógica de adicionar novo marcador.
            setTimeout(() => {
                this.isDraggingMarker = false;
                // console.log("Marker dragend: isDraggingMarker reset to false after timeout.");
            }, 50); // 50ms de delay
        });
        // --- FIM DAS MODIFICAÇÕES NOS EVENTOS DE DRAG ---

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

        if (this.isArrangementLayerActive) {
            this.updateArrangementVisuals();
        }
        console.log(`Marcador '${markerName}' adicionado no índice ${markerIndex}.`);
        return markerIndex;
    }

    // _createPopupContent() - sem alterações
    _createPopupContent(name, lat, lon, alt, distance) {
        const distText = (distance !== null)
            ? distance.toFixed(2)
            : this.calculateDistance(lat, lon, BINGO_LATITUDE, BINGO_LONGITUDE).toFixed(2);
        return `<b>${name}</b><br>Lat: ${lat.toFixed(5)}<br>Lon: ${lon.toFixed(5)}<br>Alt: ${alt.toFixed(1)}m<br>Dist: ${distText} km`;
    }

    // updateDistanceLine() - sem alterações
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

    // removeMarker() - sem alterações na lógica interna
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

            if (this.isArrangementLayerActive) {
                this.updateArrangementVisuals();
            }
            console.log(`Marcador '${removedName}' (índice original ${index}) removido.`);
        } else {
             console.warn(`Tentativa de remover marcador com índice inválido: ${index}`);
        }
    }

    // centerOnMarker() - sem alterações na lógica interna
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

    // updateCoordinatesList() - sem alterações na lógica interna
    updateCoordinatesList() {
        const coordinatesListDiv = document.getElementById('coordinates-list');
        if (!coordinatesListDiv) return;

        coordinatesListDiv.innerHTML = ''; 

        this.selectedCoordinates.forEach((coord, index) => {
            const item = document.createElement('div');
            item.className = 'coordinate-item';
            if (index === this.activeMarkerIndex) {
                item.classList.add('active');
            }

            const info = document.createElement('div');
            info.className = 'coordinate-info';
            const distance = this.calculateDistance(coord.lat, coord.lon, BINGO_LATITUDE, BINGO_LONGITUDE);
            info.innerHTML = `<strong>${coord.name}</strong><br>Lat: ${coord.lat.toFixed(5)}, Lon: ${coord.lon.toFixed(5)}<br>Alt: ${coord.alt.toFixed(1)}m, Dist: ${distance.toFixed(2)} km`;

            const actions = document.createElement('div');
            actions.className = 'coordinate-actions';

            const centerBtn = document.createElement('button');
            centerBtn.className = 'icon-btn center-btn';
            centerBtn.innerHTML = '<i class="fas fa-eye"></i>';
            centerBtn.title = 'Centralizar mapa neste marcador';
            centerBtn.setAttribute('aria-label', 'Centralizar mapa neste marcador');
            centerBtn.addEventListener('click', (e) => {
                e.stopPropagation(); 
                this.centerOnMarker(index);
            });

            const removeBtn = document.createElement('button');
            removeBtn.className = 'icon-btn remove-btn';
            removeBtn.innerHTML = '<i class="fas fa-trash-alt"></i>';
            removeBtn.title = 'Remover esta estação';
            removeBtn.setAttribute('aria-label', 'Remover este marcador');
            removeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.removeMarker(index);
            });

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

    // _updateMarkerIcons() - sem alterações na lógica interna
    _updateMarkerIcons() {
        this.stationMarkers.forEach((marker, index) => {
            const targetIcon = (index === this.activeMarkerIndex) ? this.greenIcon : this.redIcon;
            marker.setIcon(targetIcon);
        });
    }

    // updateSelectedCoordinatesDisplay() - sem alterações na lógica interna
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

    // updateDynamicDistance() - sem alterações na lógica interna
    updateDynamicDistance(latlng) {
        const dynamicDistanceSpan = document.getElementById('dynamic-distance');
        if (!dynamicDistanceSpan) return;
        const distance = this.calculateDistance(latlng.lat, latlng.lng, BINGO_LATITUDE, BINGO_LONGITUDE);
        dynamicDistanceSpan.textContent = `${distance.toFixed(2)} km`;
    }

    // calculateDistance() - sem alterações
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
    
    // calculateMidpoint() - sem alterações
     calculateMidpoint(lat1, lon1, lat2, lon2) {
        const lat1Rad = this.deg2rad(lat1);
        const lon1Rad = this.deg2rad(lon1);
        const lat2Rad = this.deg2rad(lat2);
        const lon2Rad = this.deg2rad(lon2);
    
        const x1 = Math.cos(lat1Rad) * Math.cos(lon1Rad);
        const y1 = Math.cos(lat1Rad) * Math.sin(lon1Rad);
        const z1 = Math.sin(lat1Rad);
    
        const x2 = Math.cos(lat2Rad) * Math.cos(lon2Rad);
        const y2 = Math.cos(lat2Rad) * Math.sin(lon2Rad);
        const z2 = Math.sin(lat2Rad);
    
        const xMid = (x1 + x2) / 2;
        const yMid = (y1 + y2) / 2;
        const zMid = (z1 + z2) / 2;
    
        const lonMidRad = Math.atan2(yMid, xMid);
        const hyp = Math.sqrt(xMid * xMid + yMid * yMid);
        const latMidRad = Math.atan2(zMid, hyp);
    
        return L.latLng(this.rad2deg(latMidRad), this.rad2deg(lonMidRad));
    }

    // deg2rad(), rad2deg() - sem alterações
    deg2rad(deg) { return deg * (Math.PI / 180); }
    rad2deg(rad) { return rad * (180 / Math.PI); }

    // updateOskarExportFields() - sem alterações
    updateOskarExportFields() {
        if (typeof window.updateExportFields === 'function') {
            const tileCenters = (window.antennaGenerator && typeof window.antennaGenerator.getLayout === 'function')
                                ? window.antennaGenerator.getLayout() : null;
            window.updateExportFields(tileCenters, this.selectedCoordinates);
        } else {
             console.warn("Função global 'updateExportFields' não encontrada para atualizar exportação.");
        }
    }

    // getSelectedCoordinates(), getActiveMarkerIndex() - sem alterações
    getSelectedCoordinates() { return this.selectedCoordinates; }
    getActiveMarkerIndex() {
        if (this.activeMarkerIndex < 0 || this.activeMarkerIndex >= this.selectedCoordinates.length) {
            this.activeMarkerIndex = (this.selectedCoordinates.length > 0) ? 0 : -1;
        }
        return this.activeMarkerIndex;
    }
    
    // fetchElevation() - sem alterações
    async fetchElevation(lat, lng) {
        const url = `https://api.open-meteo.com/v1/elevation?latitude=${lat.toFixed(5)}&longitude=${lng.toFixed(5)}`;
        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`API de elevação respondeu com status: ${response.status}`);
            }
            const data = await response.json();
            if (data && Array.isArray(data.elevation) && data.elevation.length > 0) {
                const elevation = parseFloat(data.elevation[0]);
                return !isNaN(elevation) ? elevation : BINGO_ALTITUDE;
            } else {
                console.warn('Resposta da API de elevação não continha dados de elevação válidos:', data);
                return BINGO_ALTITUDE;
            }
        } catch (error) {
            console.error('Erro ao buscar elevação:', error);
            return BINGO_ALTITUDE;
        }
    }

    // --- MÉTODOS PARA VISUALIZAÇÃO DO ARRANJO ---

    // offsetLatLng() - sem alterações
    offsetLatLng(latLng, offsetX_meters, offsetY_meters) {
        const earthRadius_meters = 6378137; 
        const dLat_rad = offsetY_meters / earthRadius_meters;
        const dLon_rad = offsetX_meters / (earthRadius_meters * Math.cos(this.deg2rad(latLng.lat)));
        const newLat_deg = latLng.lat + this.rad2deg(dLat_rad);
        const newLng_deg = latLng.lng + this.rad2deg(dLon_rad);
        return L.latLng(newLat_deg, newLng_deg);
    }

    // getArrangementColors() - sem alterações
    getArrangementColors() {
        const rootStyle = getComputedStyle(document.documentElement);
        const isDarkMode = document.documentElement.getAttribute('data-theme') === 'dark';
        const currentBaseLayerName = this.activeBaseLayerName.toLowerCase();

        let antennaColor, centerColor;

        if (isDarkMode && currentBaseLayerName.includes('satélite')) {
            antennaColor = rootStyle.getPropertyValue('--primary-color').trim();
            centerColor = rootStyle.getPropertyValue('--secondary-color').trim();
        } else if (!isDarkMode && currentBaseLayerName.includes('mapa')) {
            antennaColor = rootStyle.getPropertyValue('--primary-color').trim();
            centerColor = rootStyle.getPropertyValue('--secondary-color').trim();
        } else {
            antennaColor = rootStyle.getPropertyValue('--primary-color').trim();
            centerColor = rootStyle.getPropertyValue('--secondary-color').trim();
        }
        return { antennaColor, centerColor };
    }
    
    // drawArrangementForStation() - usa L.circle com raios em METROS
    drawArrangementForStation(stationMarker, stationArrangementGroup, tileCentersLayout, singleTileAntennaLayout, colors) {
        const stationLatLng = stationMarker.getLatLng();

        tileCentersLayout.forEach(tileCenterRel => {
            const tileAbsLatLng = this.offsetLatLng(stationLatLng, tileCenterRel[0], tileCenterRel[1]);

            if (singleTileAntennaLayout && singleTileAntennaLayout.length > 0) {
                singleTileAntennaLayout.forEach(antennaRelToTile => {
                    const antennaAbsLatLng = this.offsetLatLng(tileAbsLatLng, antennaRelToTile[0], antennaRelToTile[1]);
                    L.circle(antennaAbsLatLng, {      // Usa L.circle
                        radius: ANTENNA_DOT_RADIUS_M, // Usa raio em METROS
                        color: colors.antennaColor,
                        weight: 1,
                        fillColor: colors.antennaColor,
                        fillOpacity: 0.7
                    }).addTo(stationArrangementGroup);
                });
            }

            L.circle(tileAbsLatLng, {                 // Usa L.circle
                radius: TILE_CENTER_DOT_RADIUS_M,     // Usa raio em METROS
                color: colors.centerColor,
                weight: 1,
                fillColor: colors.centerColor,
                fillOpacity: 0.8
            }).addTo(stationArrangementGroup);
        });
    }

    // updateArrangementVisuals() - sem alterações na lógica interna
    updateArrangementVisuals() {
        this.arrangementLayer.clearLayers();

        if (!this.isArrangementLayerActive || !window.antennaGenerator) return;

        const tileCentersLayout = window.antennaGenerator.getLayout();
        
        let singleTileAntennaLayout = null;
        if (typeof window.antennaGenerator.createTileLayout64Antennas === 'function') {
            singleTileAntennaLayout = window.antennaGenerator.createTileLayout64Antennas(0, 0);
        } else {
            console.warn("Método createTileLayout64Antennas não encontrado no generator.");
        }

        if (!tileCentersLayout || tileCentersLayout.length === 0) {
            console.log("Nenhum layout de tile para visualizar no mapa.");
            return;
        }
        
        const colors = this.getArrangementColors();

        this.stationMarkers.forEach(stationMarker => {
            const stationArrangementGroup = L.featureGroup().addTo(this.arrangementLayer);
            this.drawArrangementForStation(stationMarker, stationArrangementGroup, tileCentersLayout, singleTileAntennaLayout, colors);
        });
        // console.log(`Visualização do arranjo atualizada no mapa para ${this.stationMarkers.length} estações.`); // Opcional: log verboso
    }

} // === FIM DA CLASSE InteractiveMap ===

// === Instanciação e Exportação Global ===
if (typeof window !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
        if (!window.interactiveMap) {
            try {
                window.interactiveMap = new InteractiveMap();
                console.log("Instância de InteractiveMap criada.");
            } catch (e) {
                console.error("Falha ao instanciar InteractiveMap:", e);
                const mapDiv = document.getElementById('map');
                if (mapDiv) {
                    mapDiv.innerHTML = '<p style="color: red; text-align: center; padding: 20px;">Erro ao carregar o mapa. Verifique o console (F12) para detalhes.</p>';
                }
            }
        }
    });
} else {
    console.warn("Ambiente não-navegador detectado. 'window.interactiveMap' não foi criado.");
}