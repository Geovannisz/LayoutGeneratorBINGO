/**
 * Módulo para implementação do mapa interativo com Leaflet.
 * Permite adicionar/remover/arrastar marcadores de estação,
 * visualizar distâncias ao BINGO central e interagir com
 * os módulos de geração de layout e exportação OSKAR.
 */

// Constantes Globais - Coordenadas do BINGO Central (Referência)
const BINGO_LATITUDE = -7.04067;
const BINGO_LONGITUDE = -38.26884;
const BINGO_ALTITUDE = 396.4; // Altitude em metros

// Classe para gerenciar o mapa interativo
class InteractiveMap {
    /**
     * Construtor da classe InteractiveMap.
     * Inicializa o mapa, marcadores, linhas e estado da aplicação.
     */
    constructor() {
        this.map = null;                // Instância do mapa Leaflet
        this.bingoMarker = null;        // Marcador fixo do BINGO
        this.stationMarkers = [];       // Array para armazenar marcadores Leaflet das estações
        this.distanceLines = [];        // Array para armazenar linhas de distância Leaflet
        this.selectedCoordinates = [];  // Array de objetos {lat, lon, alt, name} representando as estações adicionadas
        this.activeMarkerIndex = -1;    // Índice do marcador/coordenada atualmente ativo (-1 se nenhum)

        // Tenta inicializar o mapa
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
     * adiciona o marcador BINGO e configura eventos do mapa.
     */
    initMap() {
        if (!document.getElementById('map')) {
             console.error("Elemento 'map' não encontrado no DOM.");
             throw new Error("Div do mapa não encontrada."); // Interrompe a inicialização
        }
        this.map = L.map('map').setView([BINGO_LATITUDE, BINGO_LONGITUDE], 10);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            maxZoom: 18,
        }).addTo(this.map);

        this.bingoMarker = L.marker([BINGO_LATITUDE, BINGO_LONGITUDE], {
            icon: L.icon({
                iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
                iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34],
                shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
                shadowSize: [41, 41]
            }),
            title: "BINGO Central"
        }).addTo(this.map);

        this.bingoMarker.bindPopup(
            this._createPopupContent("BINGO Central", BINGO_LATITUDE, BINGO_LONGITUDE, BINGO_ALTITUDE, null)
        );

        this.map.on('click', (e) => {
            this.addMarker(e.latlng.lat, e.latlng.lng, BINGO_ALTITUDE); // Usa altitude padrão ao clicar
        });

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

        this.loadArranjos().then(arranjos => {
            while (arranjoSelect.options.length > 1) { arranjoSelect.remove(1); } // Limpa opções antigas
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
                    this.addMarker(arranjo.latitude, arranjo.longitude, arranjo.altitude, arranjo.nome); // Usa altitude do CSV
                    arranjoSelect.value = "0"; // Reseta
                }
            });
        }).catch(error => {
             console.error('Falha ao processar arranjos após carregamento:', error);
        });
    }

    /**
     * Carrega e processa os dados de arranjos do arquivo CSV.
     * @returns {Promise<Array<Object>>} Uma Promise que resolve com um array de objetos de arranjo.
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
                        if (isNaN(alt)) { alt = BINGO_ALTITUDE; } // Fallback para altitude
                        arranjos.push({ nome: name, latitude: lat, longitude: lon, altitude: alt });
                    } catch (parseError) {
                         console.warn(`Erro ao processar linha ${i+1} do CSV: ${lines[i]}. Erro: ${parseError.message}`);
                    }
                } else if (lines[i]) {
                     console.warn(`Linha ${i+1} do CSV ignorada (colunas != cabeçalho): ${lines[i]}`);
                }
            }
            console.log(`Arranjos carregados com sucesso de '${csvPath}'. Total: ${arranjos.length - 1}`);
            return arranjos;

        } catch (error) {
            console.error(`Erro ao carregar ou processar arranjos de '${csvPath}':`, error);
            alert(`Erro ao carregar o arquivo de arranjos (${csvPath}). Verifique se o arquivo existe e se a página está sendo servida por um servidor web (http/https). Detalhes no console (F12).`);
            return [{ nome: 'Selecione um arranjo', latitude: 0, longitude: 0, altitude: 0 }];
        }
    }

    /**
     * Adiciona um novo marcador de estação ao mapa.
     * @param {number} lat Latitude.
     * @param {number} lng Longitude.
     * @param {number} alt Altitude.
     * @param {string|null} [name=null] Nome da estação.
     * @returns {number} O índice do marcador recém-adicionado.
     */
    addMarker(lat, lng, alt, name = null) {
        const markerIndex = this.stationMarkers.length;
        const markerName = name || `Estação ${markerIndex + 1}`;

        const marker = L.marker([lat, lng], {
            draggable: true,
            icon: L.icon({
                iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
                iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
                iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34],
                shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
                shadowSize: [41, 41]
            }),
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

        // --- Eventos ---
        marker.on('drag', (e) => {
            const newLatLng = e.target.getLatLng();
            const currentCoords = this.selectedCoordinates[markerIndex];
            currentCoords.lat = newLatLng.lat;
            currentCoords.lon = newLatLng.lng;
            this.updateDistanceLine(markerIndex, currentCoords.lat, currentCoords.lon);
            this.updateCoordinatesList();
            this.updateSelectedCoordinatesDisplay();
            this.updateOskarExportFields();
        });

        marker.on('dragend', (e) => {
            const finalLatLng = e.target.getLatLng();
            const currentCoords = this.selectedCoordinates[markerIndex]; // Pega os dados armazenados
            const finalDistance = this.calculateDistance(finalLatLng.lat, finalLatLng.lng, BINGO_LATITUDE, BINGO_LONGITUDE);
            // Usa altitude armazenada (currentCoords.alt) para o popup
            const finalPopupContent = this._createPopupContent(currentCoords.name, finalLatLng.lat, finalLatLng.lng, currentCoords.alt, finalDistance);
            marker.setPopupContent(finalPopupContent);
            const currentTooltip = line.getTooltip();
            if (currentTooltip) currentTooltip.setContent(`${finalDistance.toFixed(2)} km`);
        });

        marker.on('click', () => {
            if (this.activeMarkerIndex !== markerIndex) {
                this.activeMarkerIndex = markerIndex;
                this.updateSelectedCoordinatesDisplay();
                this.updateCoordinatesList();
                this.updateOskarExportFields();
            } else { // Se já estava ativo, apenas abre o popup
                 marker.openPopup();
            }
        });

        // --- Atualização Final ---
        this.activeMarkerIndex = markerIndex;
        this.updateCoordinatesList();
        this.updateSelectedCoordinatesDisplay();
        this.updateOskarExportFields();

        console.log(`Marcador '${markerName}' adicionado no índice ${markerIndex}.`);
        return markerIndex;
    }

    /** Helper para criar conteúdo do popup. */
    _createPopupContent(name, lat, lon, alt, distance) {
        const distText = (distance !== null)
            ? distance.toFixed(2)
            : this.calculateDistance(lat, lon, BINGO_LATITUDE, BINGO_LONGITUDE).toFixed(2);
        return `<b>${name}</b><br>Lat: ${lat.toFixed(5)}<br>Lon: ${lon.toFixed(5)}<br>Alt: ${alt.toFixed(1)}m<br>Dist: ${distText} km`;
    }

    /** Atualiza linha de distância e tooltip. */
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

    /** Remove marcador, linha e dados associados. */
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
            this.updateOskarExportFields();
            console.log(`Marcador '${removedName}' (índice ${index}) removido.`);
        } else {
             console.warn(`Tentativa de remover marcador com índice inválido: ${index}`);
        }
    }

    /** Centraliza mapa em um marcador. */
    centerOnMarker(index) {
        if (index >= 0 && index < this.stationMarkers.length) {
            const marker = this.stationMarkers[index];
            this.map.setView(marker.getLatLng(), this.map.getZoom());
            marker.openPopup();
            if (this.activeMarkerIndex !== index) { // Só atualiza se realmente mudou
                this.activeMarkerIndex = index;
                this.updateSelectedCoordinatesDisplay();
                this.updateCoordinatesList();
                this.updateOskarExportFields();
            }
        } else {
             console.warn(`Tentativa de centralizar marcador com índice inválido: ${index}`);
        }
    }

    /** Atualiza a lista de coordenadas na UI. */
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
            centerBtn.className = 'center-btn'; centerBtn.textContent = 'Ver'; centerBtn.title = 'Centralizar mapa';
            centerBtn.addEventListener('click', (e) => { e.stopPropagation(); this.centerOnMarker(index); });

            const removeBtn = document.createElement('button');
            removeBtn.className = 'remove-btn'; removeBtn.innerHTML = '×'; removeBtn.title = 'Remover estação';
            removeBtn.addEventListener('click', (e) => {
                 e.stopPropagation();
                 // *** REMOVIDO O confirm() ***
                 this.removeMarker(index); // Remove diretamente
            });

            actions.appendChild(centerBtn); actions.appendChild(removeBtn);
            item.appendChild(info); item.appendChild(actions);

            item.addEventListener('click', () => {
                 if (this.activeMarkerIndex !== index) {
                    this.activeMarkerIndex = index;
                    this.updateSelectedCoordinatesDisplay();
                    this.updateCoordinatesList();
                    this.updateOskarExportFields();
                 } else { // Se clicou no que já estava ativo, apenas centraliza
                      this.centerOnMarker(index);
                 }
            });

            coordinatesListDiv.appendChild(item);
        });

        if (this.selectedCoordinates.length === 0) {
             coordinatesListDiv.innerHTML = '<p class="empty-list-message">Clique no mapa ou selecione um arranjo.</p>';
        }
    }

    /** Atualiza o display principal de coordenadas/distância. */
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

    /** Atualiza display de distância dinâmica do cursor. */
    updateDynamicDistance(latlng) {
        const dynamicDistanceSpan = document.getElementById('dynamic-distance');
        if (!dynamicDistanceSpan) return;
        const distance = this.calculateDistance(latlng.lat, latlng.lng, BINGO_LATITUDE, BINGO_LONGITUDE);
        dynamicDistanceSpan.textContent = `${distance.toFixed(2)} km`;
    }

    /** Calcula distância Haversine. */
    calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371; const dLat = this.deg2rad(lat2 - lat1); const dLon = this.deg2rad(lon2 - lon1);
        const a = Math.sin(dLat / 2)**2 + Math.cos(this.deg2rad(lat1)) * Math.cos(this.deg2rad(lat2)) * Math.sin(dLon / 2)**2;
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    /** Calcula ponto médio geográfico. */
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

    /** Converte graus para radianos. */
    deg2rad(deg) { return deg * (Math.PI / 180); }
    /** Converte radianos para graus. */
     rad2deg(rad) { return rad * (180 / Math.PI); }

    // =======================================================================
    // == Métodos de Interface com Outros Módulos ==
    // =======================================================================

    /** Helper para chamar a atualização global da exportação OSKAR. */
    updateOskarExportFields() {
        if (typeof window.updateExportFields === 'function') {
            const tileCenters = (window.antennaGenerator && window.antennaGenerator.getLayout) ? window.antennaGenerator.getLayout() : null;
            window.updateExportFields(tileCenters, this.selectedCoordinates); // Passa array completo
        } else {
             console.warn("Função global 'updateExportFields' não encontrada.");
        }
    }

    /** Retorna array completo de coordenadas selecionadas. */
    getSelectedCoordinates() { return this.selectedCoordinates; }

    /** Retorna índice ativo (ou -1 se inválido). */
    getActiveMarkerIndex() {
        if (this.activeMarkerIndex < 0 || this.activeMarkerIndex >= this.selectedCoordinates.length) {
             this.activeMarkerIndex = -1; return -1;
        }
        return this.activeMarkerIndex;
    }
} // === FIM DA CLASSE InteractiveMap ===

// === Instanciação e Exportação Global ===
if (typeof window !== 'undefined') {
    window.interactiveMap = new InteractiveMap();
} else {
    console.warn("Ambiente não-navegador detectado. 'window.interactiveMap' não foi criado.");
}