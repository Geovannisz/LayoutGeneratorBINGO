// js/beam_pattern.js

/**
 * beam_pattern.js
 * Modificado para usar arquivos CSV individuais para plot 2D e o arquivo CSV completo para plot 3D,
 * buscando de múltiplos gateways IPFS públicos como fallback.
 * Dispara evento 'beamData3DLoaded' após carregamento bem-sucedido dos dados 3D.
 */

// === Constantes ===
const FREQUENCY = 1e9;
const C_LIGHT = 299792458;
const LAMBDA = C_LIGHT / FREQUENCY;
const K = (2 * Math.PI) / LAMBDA;

// Lista de Gateways IPFS Públicos (o primeiro é o preferencial, os seguintes são fallbacks)
const IPFS_GATEWAYS = [
    "https://dweb.link/ipfs/", // Geralmente suporta CORS bem
    "https://ipfs.io/ipfs/",   // Gateway padrão, suporte variável a CORS
    "https://gateway.pinata.cloud/ipfs/", // Gateway original
    "https://cloudflare-ipfs.com/ipfs/", // Rápido, mas às vezes restrito com CORS
    "https://gateway.ipfs.io/ipfs/"
    // Você pode adicionar mais gateways confiáveis aqui se desejar
];

// CIDs (Content Identifiers) para os dados no IPFS
// CID do diretório que contém os arquivos efield_phi_X.csv
const E_FIELD_BASE_CID_PHI_SPECIFIC = 'bafybeibod4uopaxesmqti3qmonjcbttgxquuby6y6v2uo6sd7ah475bsai';
// CID do arquivo CSV completo para dados 3D (ex: efield_full.csv ou um manifesto)
const E_FIELD_FULL_DATA_CID = 'bafybeicunhz5lwv3nryglwlppu6o6keo7ii3ilntcqtq536aket7qflc34'; // Assumindo que este CID é o do arquivo em si.

const MAX_PLOT_POINTS_BEAM = 2000;
const PLOT_REQUEST_DEBOUNCE_DELAY = 300;

// === Cache & Estado ===
let parsedEFieldPhiDataCache = {}; // Cache para dados de E-Field por Phi
let fetchPhiPromisesCache = {};    // Cache para promessas de fetch por Phi

let fullEFieldDataCache = null;    // Cache para os dados completos de E-Field 3D
let fullEFieldDataLoadingState = 'idle'; // Estado do carregamento: 'idle', 'loading', 'loaded', 'error'
let fetchFullDataPromiseActive = null; // Promessa ativa para o fetch dos dados 3D completos

let isProcessingPlot = false;      // Flag para indicar se um plot está sendo processado
let beamCalculationWorker = null;  // Web Worker para cálculos 2D
let beamCalculationWorker3D = null;// Web Worker para cálculos 3D
let currentCalculationId = 0;      // ID para rastrear cálculos 2D
let current3DCalculationId = 0;  // ID para rastrear cálculos 3D

let storedWorkerPlotParams = {}; // Parâmetros do último plot 2D enviado ao worker
let storedFullDataScaleType = 'linear';    // Tipo de escala para o último plot 3D/Heatmap (Padrão: linear)

// Novo Cache para Resultados de Cálculos 3D (para evitar reprocessamento no worker)
let cachedCalculationResult3D = null; // Armazena o resultado retornado pelo worker 3D
let cachedCalculationParams3D = null; // Armazena { layoutHash, etc } para validar o cache

let latestPlotRequestParams = null; // Parâmetros da última solicitação de plot (para debounce)
let currentlyProcessingRequestTimestamp = null; // Timestamp da solicitação em processamento
let processRequestTimeoutId = null; // ID do timeout para debounce

// === DOM Element References ===
let phiSlider = null;
let phiInput = null;
let scaleSelect = null;
let visualize3DBtn = null;
let visualize2DBtn = null;
let visualizeHeatmapBtn = null;
let plotDivId = 'beam-pattern-plot';
let statusDiv = null;

// === Helper Functions ===
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Gera um hash simples do layout de antenas para verificar mudanças
function getLayoutHash(antennaCoords) {
    if (!antennaCoords) return "";
    return JSON.stringify(antennaCoords.map(a => [Math.round(a.x*100), Math.round(a.y*100)]));
}

/**
 * Tenta buscar um recurso de múltiplos gateways IPFS.
 * Itera sobre a lista IPFS_GATEWAYS até obter sucesso ou todos falharem.
 * @param {string} cidWithPath O CID do IPFS seguido do caminho para o arquivo, se o CID for de um diretório.
 *                             Se o CID for do arquivo diretamente, apenas o CID.
 * @param {object} options Opções para a função fetch.
 * @returns {Promise<Response>} A resposta do fetch bem-sucedido.
 * @throws {Error} Se todos os gateways falharem.
 */
async function fetchDataFromIPFS(cidWithPath, options = {}) {
    let lastError = null;
    let originalStatusText = statusDiv ? statusDiv.textContent : "";
    let statusUpdatedForGateway = false;

    // Timeout de 5 segundos para cada tentativa
    const GATEWAY_TIMEOUT = 5000;

    for (let i = 0; i < IPFS_GATEWAYS.length; i++) {
        const gatewayBase = IPFS_GATEWAYS[i];
        const url = gatewayBase + cidWithPath;
        
        if (statusDiv && originalStatusText.startsWith("Carregando dados E-field")) {
            // Atualiza o status apenas se for uma mensagem de carregamento, para não sobrescrever erros ou outros status.
            const gatewayHostname = new URL(gatewayBase).hostname;
            statusDiv.textContent = `${originalStatusText.split(' (Tentando')[0]} (Tentando ${gatewayHostname}, ${i+1}/${IPFS_GATEWAYS.length})...`;
            statusUpdatedForGateway = true;
        }
        console.log(`Tentando buscar de: ${url}`);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), GATEWAY_TIMEOUT);
        const fetchOptions = { ...options, signal: controller.signal };

        try {
            const response = await fetch(url, fetchOptions);
            clearTimeout(timeoutId); // Limpa o timeout se a resposta chegar a tempo

            if (!response.ok) {
                // Se um gateway específico retornar um erro (ex: 404, 500), registra e tenta o próximo.
                console.warn(`Falha ao buscar de ${url}: ${response.status} ${response.statusText}. Tentando próximo gateway.`);
                lastError = new Error(`Falha em ${url}: ${response.status} ${response.statusText}`);
                // Para 404, geralmente significa que o arquivo não existe *nesse* CID.
                // Poderíamos optar por parar aqui, mas alguns gateways podem ser mais lentos para indexar.
                // Por enquanto, continuaremos tentando outros gateways.
                continue; // Tenta o próximo gateway
            }
            console.log(`Sucesso ao buscar de: ${url}`);
            if (statusUpdatedForGateway && statusDiv && statusDiv.textContent.startsWith(originalStatusText.split(' (Tentando')[0])) {
                 statusDiv.textContent = originalStatusText.split(' (Tentando')[0] + " (Conectado!)"; // Feedback positivo
            }
            return response; // Sucesso!
        } catch (error) {
            // Erros de rede (como ERR_SSL_PROTOCOL_ERROR, ERR_CONNECTION_REFUSED, TypeError: Failed to fetch) cairão aqui.
            console.warn(`Erro de rede/fetch ao buscar de ${url}: ${error.message}. Tentando próximo gateway.`);
            lastError = error; // Guarda o último erro de rede/fetch
            // Continua para o próximo gateway no loop
        }
    }

    // Se todos os gateways falharem
    const finalErrorMessage = `Falha ao buscar ${cidWithPath} de todos os ${IPFS_GATEWAYS.length} gateways IPFS.`;
    console.error(finalErrorMessage, "Último erro:", lastError);
    if (statusDiv && (originalStatusText.startsWith("Carregando dados E-field") || statusUpdatedForGateway) ) {
        statusDiv.textContent = `Falha: ${lastError ? lastError.message.substring(0,80) : 'Erro desconhecido'}`;
    }
    if (lastError) { // Lança o último erro encontrado, que é o mais provável de ser relevante.
        throw lastError;
    } else {
        // Caso improvável de o loop terminar sem nenhum sucesso nem erro (ex: lista de gateways vazia)
        throw new Error(finalErrorMessage + " (Nenhum gateway tentado ou erro desconhecido).");
    }
}


// === Data Fetching and Parsing (2D - por arquivo Phi individual via IPFS) ===
async function _fetchAndParseSinglePhiWithRetry(phiValue, cid = E_FIELD_BASE_CID_PHI_SPECIFIC) {
    const roundedPhi = Math.round(parseFloat(phiValue));
    // Constrói o caminho para o arquivo CSV específico do Phi dentro do diretório CID.
    const filePathInCID = `efield_phi_${roundedPhi}.csv`;

    // Define o texto base para o status, que será atualizado por fetchDataFromIPFS
    if (statusDiv) {
        statusDiv.textContent = `Carregando dados E-field 2D (Phi ${roundedPhi}° IPFS)...`;
    }

    try {
        // Utiliza a nova função fetchDataFromIPFS que tenta múltiplos gateways.
        const response = await fetchDataFromIPFS(cid + "/" + filePathInCID);

        const csvText = await response.text();
        const lines = csvText.trim().split('\n');

        if (lines.length < 2 || csvText.startsWith("version https://git-lfs.github.com/spec/v1")) { 
            throw new Error(csvText.startsWith("version https://git-lfs.github.com/spec/v1") ? "Falha 2D: Recebido ponteiro Git LFS." : `CSV 2D para Phi ${roundedPhi}° vazio ou inválido.`);
        }
        
        const headersRaw = lines[0].split(',');
        const headers = headersRaw.map(h => h.replace(/"/g, '').trim().toLowerCase());
        const indices = {
            theta_deg: headers.indexOf('theta [deg]'), 
            phi_deg: headers.indexOf('phi [deg]'),     
            reTheta: headers.indexOf('re(retheta) [v]'),
            imTheta: headers.indexOf('im(retheta) [v]'),
            rePhi: headers.indexOf('re(rephi) [v]'),
            imPhi: headers.indexOf('im(rephi) [v]')
        };

        if (Object.values(indices).some(index => index === -1)) {
            console.error("Cabeçalhos 2D esperados não encontrados (IPFS):", headers, indices);
            throw new Error(`CSV 2D (Phi ${roundedPhi}° IPFS): Cabeçalho inválido.`);
        }
        const data = [];
        for (let i = 1; i < lines.length; i++) {
            const valuesRaw = lines[i].split(',');
            if (valuesRaw.length !== headers.length) continue;
            const values = valuesRaw.map(v => v.replace(/"/g, '').trim());
            try {
                const thetaDegVal = parseFloat(values[indices.theta_deg]);
                const phiDegVal = parseFloat(values[indices.phi_deg]); 
                const reThetaV = parseFloat(values[indices.reTheta]);
                const imThetaV = parseFloat(values[indices.imTheta]);
                const rePhiV = parseFloat(values[indices.rePhi]);
                const imPhiV = parseFloat(values[indices.imPhi]);

                if ([thetaDegVal, phiDegVal, reThetaV, imThetaV, rePhiV, imPhiV].some(isNaN)) continue;
                
                data.push({
                    theta: thetaDegVal, 
                    phi: phiDegVal,     
                    rETheta: { re: reThetaV, im: imThetaV }, 
                    rEPhi: { re: rePhiV, im: imPhiV },
                });
            } catch (parseError) { /* Ignora linhas com erro de parse */ }
        }
        if (data.length === 0) {
            throw new Error(`CSV 2D (Phi ${roundedPhi}° IPFS) não contém dados válidos após parse.`);
        }
        return data; // Retorna os dados parseados
    } catch (error) {
        // O erro aqui é o que fetchDataFromIPFS lança se todos os gateways falharem.
        console.error(`Erro final em _fetchAndParseSinglePhiWithRetry para Phi ${roundedPhi}° (IPFS):`, error);
        // O statusDiv já deve ter sido atualizado por fetchDataFromIPFS em caso de falha total.
        // Se não foi, atualiza aqui.
        if (statusDiv && !statusDiv.textContent.startsWith("Falha final")) {
             statusDiv.textContent = `Falha ao buscar dados 2D (Phi ${roundedPhi}°): ${error.message.substring(0,100)}`;
        }
        throw error; // Propaga o erro para ser tratado pela função chamadora
    }
}

async function fetchAndParseEFieldDataForSelectedPhi(phiValue) {
    const roundedPhi = Math.round(parseFloat(phiValue));

    // Verifica o cache de dados parseados
    if (parsedEFieldPhiDataCache[roundedPhi]) {
        return parsedEFieldPhiDataCache[roundedPhi];
    }
    // Verifica o cache de promessas (se uma busca já estiver em andamento para este Phi)
    if (fetchPhiPromisesCache[roundedPhi]) {
        return fetchPhiPromisesCache[roundedPhi];
    }

    // Inicia uma nova busca
    const promise = _fetchAndParseSinglePhiWithRetry(phiValue) // CID padrão é usado aqui
        .then(data => {
            parsedEFieldPhiDataCache[roundedPhi] = data; // Armazena no cache de dados
            if (statusDiv && statusDiv.textContent.startsWith(`Carregando dados E-field 2D (Phi ${roundedPhi}° IPFS)`)) {
                statusDiv.textContent = `Dados E-field 2D (Phi ${roundedPhi}° IPFS) carregados.`;
            }
            delete fetchPhiPromisesCache[roundedPhi]; // Remove do cache de promessas
            return data;
        })
        .catch(error => {
            // O erro já foi logado em _fetchAndParseSinglePhiWithRetry e o statusDiv atualizado.
            delete fetchPhiPromisesCache[roundedPhi]; // Remove do cache de promessas
            throw error; // Propaga o erro
        });

    fetchPhiPromisesCache[roundedPhi] = promise; // Armazena a promessa no cache
    return promise;
}


// === Data Fetching and Parsing (3D - arquivo completo via IPFS) ===
async function _fetchAndParseFullEFieldDataRecursive3D() {
    // Define o texto base para o status
    if (statusDiv) {
        statusDiv.textContent = `Carregando dados E-field Completos (IPFS)...`;
    }

    try {
        // Utiliza fetchDataFromIPFS. E_FIELD_FULL_DATA_CID é o hash do arquivo diretamente.
        const response = await fetchDataFromIPFS(E_FIELD_FULL_DATA_CID);

        const csvText = await response.text();
        if (csvText.startsWith("version https://git-lfs.github.com/spec/v1")) {
            throw new Error("Falha Dados Completos: Recebido ponteiro Git LFS (IPFS).");
        }
        const lines = csvText.trim().split('\n');
        if (lines.length < 2) {
            throw new Error("CSV Completos (IPFS) vazio ou apenas com cabeçalho.");
        }
        const headersRaw = lines[0].split(',');
        // Normaliza cabeçalhos: remove aspas, remove unidades "[...]", converte para minúsculas e remove espaços extras.
        const headers = headersRaw.map(h => 
            h.replace(/"/g, '').replace(/\[.*?\]/g, '').trim().toLowerCase()
        );
        
        // Mapeia os nomes dos cabeçalhos esperados para seus índices no arquivo CSV.
        const indices = {
            phi: headers.indexOf('phi'), 
            theta: headers.indexOf('theta'),
            re_rephi: headers.indexOf('re(rephi)'), 
            im_rephi: headers.indexOf('im(rephi)'),
            re_retheta: headers.indexOf('re(retheta)'), 
            im_retheta: headers.indexOf('im(retheta)')
        };

        // Verifica se todos os cabeçalhos esperados foram encontrados.
        if (Object.values(indices).some(index => index === -1)) {
            console.error("Cabeçalhos 3D normalizados esperados não encontrados (IPFS):", headers, "Índices mapeados:", indices);
            throw new Error("CSV 3D (IPFS): Cabeçalho normalizado inválido.");
        }

        const data = [];
        const uniquePhiValues = new Set(); 

        for (let i = 1; i < lines.length; i++) {
            const valuesRaw = lines[i].split(',');
            if (valuesRaw.length !== headers.length) continue; // Ignora linhas com número incorreto de colunas
            const values = valuesRaw.map(v => v.replace(/"/g, '').trim());
            try {
                const phiVal = parseFloat(values[indices.phi]);
                const thetaVal = parseFloat(values[indices.theta]);
                const rePhiV = parseFloat(values[indices.re_rephi]);
                const imPhiV = parseFloat(values[indices.im_rephi]);
                const reThetaV = parseFloat(values[indices.re_retheta]);
                const imThetaV = parseFloat(values[indices.im_retheta]);

                // Ignora a linha se algum valor numérico essencial for NaN.
                if ([phiVal, thetaVal, rePhiV, imPhiV, reThetaV, imThetaV].some(isNaN)) continue;
                
                data.push({
                    phi_deg: phiVal, 
                    theta_deg: thetaVal,
                    rEPhi: { re: rePhiV, im: imPhiV }, 
                    rETheta: { re: reThetaV, im: imThetaV }
                });
                uniquePhiValues.add(phiVal); // Adiciona para construir a lista de Phis únicos
            } catch (parseError) { /* Ignora linhas com erro de parse */ }
        }
        if (data.length === 0) {
            throw new Error("CSV 3D (IPFS) não contém dados válidos após parse.");
        }
        // Adiciona a propriedade uniquePhis ao array de dados retornado.
        // Isso é usado por processLatestPlotRequestIfIdle para encontrar o Phi mais próximo no dataset 3D (se necessário).
        Object.defineProperty(data, 'uniquePhis', {
            value: Array.from(uniquePhiValues).sort((a,b) => a-b),
            writable: false, 
            enumerable: false 
        });
        return data; // Retorna os dados parseados
    } catch (error) {
        console.error(`Erro final em _fetchAndParseFullEFieldDataRecursive3D (IPFS):`, error);
        // O statusDiv já deve ter sido atualizado por fetchDataFromIPFS.
        if (statusDiv && !statusDiv.textContent.startsWith("Falha final")) {
            statusDiv.textContent = `Falha ao buscar dados completos: ${error.message.substring(0,100)}`;
        }
        throw error;
    }
}

async function ensureFullEFieldData3DLoaded() { 
    // Se os dados já estão carregados e cacheados, retorna-os.
    if (fullEFieldDataLoadingState === 'loaded' && fullEFieldDataCache) {
        return fullEFieldDataCache;
    }
    // Se um carregamento já está em progresso, retorna a promessa existente.
    if (fullEFieldDataLoadingState === 'loading' && fetchFullDataPromiseActive) {
        return fetchFullDataPromiseActive;
    }
    
    fullEFieldDataLoadingState = 'loading'; // Define o estado para 'loading'.
    // Inicia uma nova busca pelos dados 3D completos.
    const promise = _fetchAndParseFullEFieldDataRecursive3D()
        .then(data => {
            fullEFieldDataCache = data; // Armazena os dados no cache.
            fullEFieldDataLoadingState = 'loaded'; // Define o estado para 'loaded'.
            if (statusDiv && statusDiv.textContent.startsWith('Carregando dados E-field Completos (IPFS)')) {
                 statusDiv.textContent = 'Dados E-field Completos (IPFS) carregados com sucesso.';
            }
            fetchFullDataPromiseActive = null; // Limpa a promessa ativa.
            // Dispara evento para notificar que os dados 3D estão prontos.
            window.dispatchEvent(new CustomEvent('beamData3DLoaded'));
            console.log("Evento 'beamData3DLoaded' disparado de beam_pattern.js");
            return data;
        })
        .catch(error => {
            // O erro já foi logado e o statusDiv atualizado em _fetchAndParseFullEFieldDataRecursive3D.
            fullEFieldDataLoadingState = 'error'; // Define o estado para 'error'.
            fetchFullDataPromiseActive = null; // Limpa a promessa ativa.
            throw error; // Propaga o erro.
        });
    
    fetchFullDataPromiseActive = promise; // Armazena a promessa ativa.
    return promise;
}


// === Downsampling Function (2D) ===
function downsampleData(xData, yData, maxPoints) {
    if (xData.length <= maxPoints) return { x: xData, y: yData };
    const factor = Math.ceil(xData.length / maxPoints);
    const sampledX = [], sampledY = [];
    for (let i = 0; i < xData.length; i += factor) {
        sampledX.push(xData[i]); sampledY.push(yData[i]);
    }
    if ((xData.length - 1) % factor !== 0 && xData.length > 0) { // Garante que o último ponto seja incluído
         sampledX.push(xData[xData.length - 1]); sampledY.push(yData[yData.length - 1]);
    }
    return { x: sampledX, y: sampledY };
}

// === 2D Plotting Function ===
function plotBeamPattern2D(theta, fieldMagnitude, phiValue, scaleType) {
    const plotDiv = document.getElementById(plotDivId);
    if (!plotDiv) { console.error(`Div de plot 2D "${plotDivId}" não encontrada.`); return; }

    if (!plotDiv.classList.contains('visible')) {
        plotDiv.classList.add('visible');
    }

    const peakMagnitude = Math.max(1e-10, ...fieldMagnitude); // Evita divisão por zero ou log de zero
    let yData, yAxisTitle, yAxisConfig = {};
    if (scaleType === 'dB') {
        yData = fieldMagnitude.map(mag => {
            if (mag <= 0 || peakMagnitude <= 0) return -100; // Valor mínimo para dB
            const dbVal = 20 * Math.log10(Math.max(mag / peakMagnitude, 1e-10)); // Normaliza e converte para dB
            return Math.max(-100, dbVal); // Limita o mínimo dB
        });
        yAxisTitle = 'Magnitude Normalizada (dB)';
        yAxisConfig.range = [-100, 0]; // Faixa padrão para dB
    } else if (scaleType === 'sqrt') {
        yData = fieldMagnitude.map(mag => peakMagnitude > 0 ? Math.sqrt(mag / peakMagnitude) : 0);
        yAxisTitle = 'Magnitude Normalizada (Sqrt)';
        yAxisConfig.autorange = true;
        yAxisConfig.rangemode = 'tozero';
    } else { // scaleType === 'linear' e outros
        yData = fieldMagnitude.map(mag => peakMagnitude > 0 ? mag / peakMagnitude : 0); // Normaliza linearmente
        yAxisTitle = 'Magnitude Normalizada (Linear)';
        yAxisConfig.autorange = true;
        yAxisConfig.rangemode = 'tozero'; // Garante que o eixo Y comece em zero
    }
    const rootStyle = getComputedStyle(document.documentElement);
    const plotColors = {
        plotBgColor: rootStyle.getPropertyValue('--plot-bg-color').trim() || '#ffffff',
        paperBgColor: rootStyle.getPropertyValue('--card-bg-color').trim() || '#ffffff',
        textColor: rootStyle.getPropertyValue('--text-color').trim() || '#333333',
        gridColor: rootStyle.getPropertyValue('--plot-grid-color').trim() || '#eeeeee',
        lineColor: rootStyle.getPropertyValue('--primary-color').trim() || '#3498db',
        axisColor: rootStyle.getPropertyValue('--border-color').trim() || '#cccccc',
    };
    const trace = {
        x: theta, y: yData, mode: 'lines', type: 'scatter',
        name: `Phi = ${phiValue}°`, line: { color: plotColors.lineColor, width: 1.5 }
    };
    const layout = {
        xaxis: { title: 'Theta (graus)', gridcolor: plotColors.gridColor, zerolinecolor: plotColors.axisColor, linecolor: plotColors.axisColor, tickcolor: plotColors.textColor, titlefont: { color: plotColors.textColor }, tickfont: { color: plotColors.textColor }, automargin: true },
        yaxis: {
            title: yAxisTitle,
            gridcolor: plotColors.gridColor,
            zerolinecolor: plotColors.axisColor,
            linecolor: plotColors.axisColor,
            tickcolor: plotColors.textColor,
            titlefont: { color: plotColors.textColor },
            tickfont: { color: plotColors.textColor },
            automargin: true,
            ...yAxisConfig // Aplica configuração específica do eixo Y (range, etc.)
        },
        plot_bgcolor: plotColors.plotBgColor, paper_bgcolor: plotColors.paperBgColor,
        font: { color: plotColors.textColor }, showlegend: false,
        autosize: true,
        margin: { t: 20, b: 50, l: 60, r: 20 }
    };
    const config = {responsive: true, scrollZoom: true };

    Plotly.react(plotDivId, [trace], layout, config)
        .catch(err => {
            console.error("Erro ao atualizar 2D (react) Plotly, tentando newPlot:", err);
            return Plotly.newPlot(plotDivId, [trace], layout, config); // Tenta newPlot como fallback
        })
        .catch(err2 => {
            console.error("Erro fatal no Plotly 2D (newPlot fallback):", err2);
            if (statusDiv) statusDiv.textContent = "Erro crítico ao renderizar gráfico 2D.";
        });
}

// === Heatmap/Surface Top-Down Plotting Function ===
// Alterado para usar type: 'surface' com câmera ortográfica para simular heatmap,
// pois type: 'contour' não suporta coordenadas curvilíneas (grids não-retangulares)
function plotBeamHeatmap(uniquePhis_deg, uniqueThetas_deg, magnitudes_grid_dB, magnitudes_grid_linear_normalized, scaleType) {
    const plotDiv = document.getElementById(plotDivId);
    if (!plotDiv) return;

    const DEG_TO_RAD = Math.PI / 180;
    const x_surface = [];
    const y_surface = [];

    // Gera coordenadas Cartesianas (projeção top-down do cone 3D)
    for (let i = 0; i < uniqueThetas_deg.length; i++) {
        const theta_val_for_radius_rad = uniqueThetas_deg[i] * DEG_TO_RAD;
        const x_row = []; const y_row = [];
        for (let j = 0; j < uniquePhis_deg.length; j++) {
            const phi_rad = uniquePhis_deg[j] * DEG_TO_RAD;
            x_row.push(theta_val_for_radius_rad * Math.cos(phi_rad));
            y_row.push(theta_val_for_radius_rad * Math.sin(phi_rad));
        }
        x_surface.push(x_row); y_surface.push(y_row);
    }

    const rootStyle = getComputedStyle(document.documentElement);
    const plotColors = {
        plotBgColor: rootStyle.getPropertyValue('--plot-bg-color').trim() || '#ffffff',
        paperBgColor: rootStyle.getPropertyValue('--card-bg-color').trim() || '#ffffff',
        textColor: rootStyle.getPropertyValue('--text-color').trim() || '#333333',
        gridColor: rootStyle.getPropertyValue('--plot-grid-color').trim() || '#eeeeee',
        axisColor: rootStyle.getPropertyValue('--border-color').trim() || '#cccccc',
        colorscale: 'Viridis',
    };

    let z_data_to_plot, colorbar_title, z_min, z_max;

    if (scaleType === 'dB') {
        z_data_to_plot = magnitudes_grid_dB;
        colorbar_title = 'dB';
        z_min = -100; // Corte para melhor visualização (alinhado com 3D)
        z_max = 0;
    } else if (scaleType === 'sqrt') {
        z_data_to_plot = magnitudes_grid_linear_normalized.map(row => row.map(val => Math.sqrt(val)));
        colorbar_title = 'Sqrt';
        z_min = 0;
        z_max = 1;
    } else { // Linear
        z_data_to_plot = magnitudes_grid_linear_normalized;
        colorbar_title = 'Linear';
        z_min = 0;
        z_max = 1;
    }

    const data = [{
        type: 'surface', // Usamos surface para suportar a malha polar projetada
        x: x_surface,
        y: y_surface,
        z: z_data_to_plot,
        surfacecolor: z_data_to_plot,
        colorscale: plotColors.colorscale,
        showscale: true,
        colorbar: {
            title: colorbar_title,
            tickfont: { color: plotColors.textColor },
            titlefont: { color: plotColors.textColor },
            len: 0.75, yanchor: 'middle', y: 0.5,
        },
        cmin: z_min,
        cmax: z_max,
        hoverinfo: 'x+y+z',
        lighting: { // Desabilita iluminação para parecer um mapa de calor plano ("flat")
            ambient: 1, diffuse: 0, specular: 0, roughness: 1, fresnel: 0
        },
        contours: {
            z: { show: false } // Remove linhas de contorno se houver
        }
    }];

    const layout = {
        autosize: true,
        scene: {
            xaxis: {
                title: 'X = Θ·cos(Φ)', autorange: true,
                color: plotColors.textColor, gridcolor: plotColors.gridColor,
                zerolinecolor: plotColors.axisColor, linecolor: plotColors.axisColor,
                backgroundcolor: plotColors.plotBgColor,
                titlefont: {size: 10}, tickfont: {size: 9}
            },
            yaxis: {
                title: 'Y = Θ·sin(Φ)', autorange: true,
                color: plotColors.textColor, gridcolor: plotColors.gridColor,
                zerolinecolor: plotColors.axisColor, linecolor: plotColors.axisColor,
                backgroundcolor: plotColors.plotBgColor,
                titlefont: {size: 10}, tickfont: {size: 9}
            },
            zaxis: {
                title: '', // Oculta título Z para parecer 2D
                range: [z_min, z_max],
                showticklabels: false, showgrid: false, zeroline: false, // Oculta eixo Z
                color: plotColors.textColor,
                backgroundcolor: plotColors.plotBgColor
            },
            camera: {
                projection: { type: 'orthographic' }, // Projeção ortográfica para eliminar perspectiva
                eye: { x: 0, y: 0, z: 2 }, // Câmera diretamente acima
                up: { x: 0, y: 1, z: 0 } // Orientação Y para cima
            },
            aspectmode: 'data', // Garante proporção correta X/Y
            dragmode: 'pan' // Permite pan como em mapas 2D (limitado em 3D, mas ajuda)
        },
        plot_bgcolor: plotColors.plotBgColor,
        paper_bgcolor: plotColors.paperBgColor,
        font: { color: plotColors.textColor },
        margin: { l: 5, r: 5, b: 5, t: 5, pad: 2 }
    };

    const config = { responsive: true, scrollZoom: true };

    Plotly.newPlot(plotDivId, data, layout, config)
        .then(() => {
             // Força um resize/relayout após renderização inicial para garantir ajuste
             setTimeout(() => {
                Plotly.Plots.resize(plotDivId).then(() => {
                    plotDiv.classList.add('visible');
                    if (statusDiv && !statusDiv.textContent.startsWith("Erro")) {
                         statusDiv.textContent = `Mapa de Calor (${scaleType}) atualizado.`;
                    }
                });
             }, 100);
        })
        .catch(err => {
            console.error("Erro no Plotly Heatmap (Surface):", err);
            if (statusDiv) statusDiv.textContent = `Erro visualização Heatmap: ${err.message}`;
        });
}


// === 3D Plotting Function ===
function plotBeamPattern3D(uniquePhis_deg, uniqueThetas_deg, magnitudes_grid_dB, magnitudes_grid_linear_normalized, scaleType) {
    const plotDiv = document.getElementById(plotDivId);
    if (!plotDiv) {
        console.error(`Div de plot 3D "${plotDivId}" não encontrada.`);
        return;
    }

    const DEG_TO_RAD = Math.PI / 180;
    const x_surface = []; const y_surface = []; // Coordenadas X e Y para a superfície do plot 3D
    // Transforma coordenadas polares (Theta, Phi) em cartesianas para o plot de superfície.
    // Theta é usado como o raio no plano XY projetado.
    for (let i = 0; i < uniqueThetas_deg.length; i++) {
        const theta_val_for_radius_rad = uniqueThetas_deg[i] * DEG_TO_RAD;
        const x_row = []; const y_row = [];
        for (let j = 0; j < uniquePhis_deg.length; j++) {
            const phi_rad = uniquePhis_deg[j] * DEG_TO_RAD;
            x_row.push(theta_val_for_radius_rad * Math.cos(phi_rad));
            y_row.push(theta_val_for_radius_rad * Math.sin(phi_rad));
        }
        x_surface.push(x_row); y_surface.push(y_row);
    }
    const rootStyle = getComputedStyle(document.documentElement);
    const plotColors = {
        plotBgColor: rootStyle.getPropertyValue('--plot-bg-color').trim() || '#ffffff',
        paperBgColor: rootStyle.getPropertyValue('--card-bg-color').trim() || '#ffffff',
        textColor: rootStyle.getPropertyValue('--text-color').trim() || '#333333',
        gridColor: rootStyle.getPropertyValue('--plot-grid-color').trim() || '#eeeeee',
        axisColor: rootStyle.getPropertyValue('--border-color').trim() || '#cccccc',
        colorscale: 'Viridis', // Esquema de cores para o plot 3D
    };
    let z_data_to_plot, z_axis_title, z_axis_range_plot, colorbar_title;
    // Seleciona os dados Z e configura o eixo Z com base na escala (dB ou Linear).
    if (scaleType === 'dB') {
        z_data_to_plot = magnitudes_grid_dB; z_axis_title = 'Magnitude (dB)'; colorbar_title = 'dB'; z_axis_range_plot = [-100, 0];
    } else if (scaleType === 'sqrt') {
        z_data_to_plot = magnitudes_grid_linear_normalized.map(row => row.map(v => Math.sqrt(v)));
        z_axis_title = 'Magnitude (Sqrt)'; colorbar_title = 'Sqrt'; z_axis_range_plot = [0, 1];
    } else { // scaleType === 'linear'
        z_data_to_plot = magnitudes_grid_linear_normalized; z_axis_title = 'Magnitude (Linear Norm.)'; colorbar_title = 'Linear'; z_axis_range_plot = [0, 1];
    }

    const data = [{
        type: 'surface', x: x_surface, y: y_surface, z: z_data_to_plot, surfacecolor: z_data_to_plot, colorscale: plotColors.colorscale,
        showscale: true, colorbar: { title: colorbar_title, tickfont: { color: plotColors.textColor }, titlefont: { color: plotColors.textColor }, len: 0.75, yanchor: 'middle', y: 0.5, },
        cmin: z_axis_range_plot[0], cmax: z_axis_range_plot[1], hoverinfo: 'skip', // Desabilita hover para performance
        lighting: { ambient: 0.55, diffuse: 0.7, specular: 0.15, roughness: 0.5, fresnel: 0.1 }, // Configurações de iluminação
        lightposition: { x: 1000, y: 500, z: 5000 }
    }];
    let zScaleFactor = 0.8; // Fator de escala para o eixo Z para melhor visualização
    // Configuração inicial da câmera
    let initialCamera = { eye: { x: 1.5, y: 1.5, z: 1.5 }, up: { x: 0, y: 0, z: 1 }, center: { x: 0, y: 0, z: (scaleType === 'dB' ? -50 : 0.4) } };
    if (scaleType === 'dB') { initialCamera.eye = { x: 1.5, y: 1.5, z: 1.8 }; initialCamera.center = { x: 0, y: 0, z: -50 }; }
    
    const layout = {
        autosize: true,
        scene: {
            xaxis: { title: 'X = Θ·cos(Φ)', autorange: true, color: plotColors.textColor, gridcolor: plotColors.gridColor, zerolinecolor: plotColors.axisColor, linecolor: plotColors.axisColor, backgroundcolor: plotColors.plotBgColor, titlefont: {size: 10}, tickfont: {size: 9} },
            yaxis: { title: 'Y = Θ·sin(Φ)', autorange: true, color: plotColors.textColor, gridcolor: plotColors.gridColor, zerolinecolor: plotColors.axisColor, linecolor: plotColors.axisColor, backgroundcolor: plotColors.plotBgColor, titlefont: {size: 10}, tickfont: {size: 9} },
            zaxis: { title: z_axis_title, range: z_axis_range_plot, color: plotColors.textColor, gridcolor: plotColors.gridColor, zerolinecolor: plotColors.axisColor, linecolor: plotColors.axisColor, backgroundcolor: plotColors.plotBgColor, titlefont: {size: 10}, tickfont: {size: 9} },
            camera: initialCamera, aspectmode: 'manual', aspectratio: { x: 1, y: 1, z: zScaleFactor }, dragmode: 'turntable'
        },
        plot_bgcolor: plotColors.plotBgColor, paper_bgcolor: plotColors.paperBgColor, font: { color: plotColors.textColor },
        margin: { l: 5, r: 5, b: 5, t: 5, pad: 2 }
    };
    const config = { responsive: true, scrollZoom: true };

    Plotly.newPlot(plotDivId, data, layout, config)
        .then(() => {
            if (statusDiv && !statusDiv.textContent.startsWith("Erro")) {
                statusDiv.textContent = `Visualização 3D (${scaleType}) renderizada. Ajustando câmera...`;
            }
            // Pequeno atraso para permitir a renderização inicial antes de ajustar a câmera/layout
            setTimeout(() => {
                Plotly.Plots.resize(plotDivId) // Garante que o tamanho está correto
                    .then(() => {
                        // Tenta ajustar a câmera para auto-range após o resize inicial (pode ajudar)
                        const updateLayout = { 'scene.camera': null, 'scene.xaxis.autorange': true, 'scene.yaxis.autorange': true };
                        return Plotly.relayout(plotDivId, updateLayout);
                    })
                    .then(() => {
                        plotDiv.classList.add('visible'); // Torna o plot visível
                        if (statusDiv && statusDiv.textContent.endsWith("Ajustando câmera...")) {
                            statusDiv.textContent = `Visualização 3D (${scaleType}) pronta. Interaja com controles.`;
                        }
                    })
                    .catch(err => { // Erro no resize/relayout
                        console.warn("Falha ao tentar resize/relayout da câmera 3D:", err);
                        plotDiv.classList.add('visible'); // Ainda tenta tornar visível
                        if (statusDiv && statusDiv.textContent.endsWith("Ajustando câmera...")) {
                            statusDiv.textContent = `Visualização 3D (${scaleType}) carregada (erro no ajuste fino).`;
                        }
                    });
            }, 250);
        })
        .catch(err => { // Erro no Plotly.newPlot
            console.error("Erro ao renderizar Plotly 3D com newPlot:", err);
            if (statusDiv) statusDiv.textContent = `Erro ao gerar gráfico 3D: ${err.message.substring(0, 100)}`;
            plotDiv.classList.add('visible'); // Tenta tornar visível mesmo com erro para depuração
        });
}


// === Plot Scheduling and Processing ===
function schedulePlotUpdate() {
    const currentAntennaCoords = window.antennaGenerator ? window.antennaGenerator.getAllAntennas() : [];
    const currentPhi = phiInput ? parseFloat(phiInput.value) : 90;

    // Obtém a escala do select
    let currentScale = 'linear'; // Padrão linear
    if (scaleSelect) {
        currentScale = scaleSelect.value;
    }

    // Armazena os parâmetros da última solicitação de plot
    latestPlotRequestParams = {
        antennaCoords: currentAntennaCoords,
        phi: currentPhi,
        scale: currentScale,
        timestamp: Date.now() // Timestamp para identificar a solicitação mais recente
    };

    // Atualiza o status se não estiver processando e não houver erro de fetch
    if (statusDiv && !isProcessingPlot && !statusDiv.textContent.startsWith("Falha")) {
        statusDiv.textContent = `Solicitação 2D (Phi: ${currentPhi}, Ant: ${currentAntennaCoords.length}, Escala: ${currentScale}) pendente...`;
    }

    // Cancela qualquer timeout anterior para processar a solicitação (debounce)
    clearTimeout(processRequestTimeoutId);
    processRequestTimeoutId = setTimeout(processLatestPlotRequestIfIdle, PLOT_REQUEST_DEBOUNCE_DELAY);
}

async function processLatestPlotRequestIfIdle() {
    if (!latestPlotRequestParams) return; // Nenhuma solicitação pendente

    // Se um plot já estiver sendo processado, agenda para tentar novamente mais tarde
    if (isProcessingPlot) {
        clearTimeout(processRequestTimeoutId);
        processRequestTimeoutId = setTimeout(processLatestPlotRequestIfIdle, PLOT_REQUEST_DEBOUNCE_DELAY + 50);
        return;
    }

    isProcessingPlot = true; // Define a flag de processamento
    currentlyProcessingRequestTimestamp = latestPlotRequestParams.timestamp;
    const requestToProcess = { ...latestPlotRequestParams }; // Copia a solicitação para processar

    if (statusDiv && !statusDiv.textContent.startsWith("Falha")) {
        statusDiv.textContent = 'Preparando para gerar padrão de feixe 2D...';
    }

    const plotDivCurrent = document.getElementById(plotDivId);

    try {
        if (!window.antennaGenerator?.getAllAntennas) {
            throw new Error("Gerador de antenas não disponível.");
        }
        const { antennaCoords, phi: selectedPhiFromSlider, scale: selectedScale } = requestToProcess;

        // Se não houver antenas, limpa o plot e informa o usuário
        if (!antennaCoords || antennaCoords.length === 0) {
            if (statusDiv) statusDiv.textContent = 'Layout de antenas vazio. Gere um layout primeiro.';
            if (plotDivCurrent) {
                 Plotly.purge(plotDivCurrent);
                 plotDivCurrent.classList.remove('visible');
            }
            finalizePlotProcessing(true, '2D'); // Finaliza como "sucesso" no sentido de que a solicitação foi tratada
            return;
        }
        
        // Se o plot atual for 3D ou Heatmap, esconde-o antes de mostrar o 2D
        if (plotDivCurrent && plotDivCurrent.data && plotDivCurrent.data.length > 0 && (plotDivCurrent.data[0].type === 'surface' || plotDivCurrent.data[0].type === 'contour')) {
            console.log("Transição de 3D/Heatmap para 2D detectada. Escondendo plot.");
            plotDivCurrent.classList.remove('visible');
        }
        
        // Busca e parseia os dados do elemento para o Phi selecionado
        const elementDataForSelectedPhi = await fetchAndParseEFieldDataForSelectedPhi(selectedPhiFromSlider);

        if (!elementDataForSelectedPhi || !Array.isArray(elementDataForSelectedPhi) || elementDataForSelectedPhi.length === 0) {
            throw new Error(`Dados do elemento 2D para Phi=${selectedPhiFromSlider}° não carregados ou vazios.`);
        }
        
        // Armazena os parâmetros para uso no callback do worker
        storedWorkerPlotParams = { phi: selectedPhiFromSlider, scale: selectedScale };
        currentCalculationId++; // Incrementa o ID da cálculo para o worker

        if (beamCalculationWorker) {
            if (statusDiv && !statusDiv.textContent.startsWith("Falha")) {
                statusDiv.textContent = `Calculando padrão 2D (Phi: ${selectedPhiFromSlider}°)...`;
            }
            // Envia dados para o Web Worker 2D
            beamCalculationWorker.postMessage({
                id: currentCalculationId,
                antennaCoords: antennaCoords,
                filteredElementData: elementDataForSelectedPhi, // Dados do E-field para o Phi específico
                K_CONST: K,
                selectedPhiValue: selectedPhiFromSlider
            });
        } else {
            console.error("Web Worker 2D não disponível.");
            if (statusDiv) statusDiv.textContent = "Erro: Web Worker 2D não suportado ou falhou ao inicializar.";
            finalizePlotProcessing(false, '2D');
        }
    } catch (error) {
        console.error("Erro ao processar solicitação do padrão de feixe 2D:", error);
        // Atualiza o status apenas se não for um erro de fetch já reportado
        if (statusDiv && !statusDiv.textContent.startsWith("Falha")) {
            statusDiv.textContent = `Erro 2D: ${error.message.substring(0, 150)}`;
        }
        if (plotDivCurrent) { // Limpa o plot em caso de erro
            Plotly.purge(plotDivCurrent);
            plotDivCurrent.classList.remove('visible');
        }
        finalizePlotProcessing(false, '2D');
    }
}

// Renomeado para processFullDataPlotRequest para refletir que serve para Heatmap e 3D
async function processFullDataPlotRequest() {
    // Se já estiver processando um plot ou carregando dados 3D, informa o usuário e retorna
    if (isProcessingPlot || fullEFieldDataLoadingState === 'loading') {
        if (statusDiv && fullEFieldDataLoadingState === 'loading') {
            statusDiv.textContent = "Carregamento dos dados E-field Completos (IPFS) em andamento, aguarde...";
        } else if (statusDiv && !statusDiv.textContent.startsWith("Falha")) {
            statusDiv.textContent = "Processamento de outro gráfico em andamento. Aguarde...";
        }
        return;
    }
    isProcessingPlot = true; // Define a flag de processamento
    if (statusDiv && !statusDiv.textContent.startsWith("Falha")) statusDiv.textContent = 'Preparando dados completos (Heatmap/3D)...';

    // Desabilita botões durante processamento
    if (visualize3DBtn) visualize3DBtn.disabled = true;
    if (visualizeHeatmapBtn) visualizeHeatmapBtn.disabled = true;

    // Obtém a escala selecionada
    let selectedScale = 'linear'; // Padrão linear
    if (scaleSelect) {
        selectedScale = scaleSelect.value;
    }
    storedFullDataScaleType = selectedScale; // Armazena para uso no callback do worker

    try {
        const antennaCoords = window.antennaGenerator ? window.antennaGenerator.getAllAntennas() : [];
        if (!antennaCoords || antennaCoords.length === 0) {
            if (statusDiv) statusDiv.textContent = 'Layout de antenas vazio. Gere um layout primeiro.';
            const plotDiv = document.getElementById(plotDivId);
            if (plotDiv) { Plotly.purge(plotDiv); } // Limpa o plot se não houver antenas
            finalizePlotProcessing(true, '3D'); // Usa '3D' como genérico para plot completo
            return;
        }

        // Verifica o cache do resultado do cálculo
        const currentLayoutHash = getLayoutHash(antennaCoords);
        if (cachedCalculationResult3D && cachedCalculationParams3D && cachedCalculationParams3D.layoutHash === currentLayoutHash) {
             console.log("Usando resultado de cálculo 3D em cache (cliente). Re-plotando apenas.");
             if (statusDiv) statusDiv.textContent = `Atualizando visualização (${selectedScale})...`;

             // Usa os dados cacheados para plotar diretamente
             const { uniquePhis_deg, uniqueThetas_deg, magnitudes_grid_dB, magnitudes_grid_linear_normalized } = cachedCalculationResult3D;

             if (visualizeHeatmapBtn && visualizeHeatmapBtn.classList.contains('primary')) {
                plotBeamHeatmap(uniquePhis_deg, uniqueThetas_deg, magnitudes_grid_dB, magnitudes_grid_linear_normalized, selectedScale);
            } else {
                plotBeamPattern3D(uniquePhis_deg, uniqueThetas_deg, magnitudes_grid_dB, magnitudes_grid_linear_normalized, selectedScale);
            }

            finalizePlotProcessing(true, '3D');
            return;
        }

        // Se não houver cache válido, prossegue com o carregamento e cálculo
        const plotDiv = document.getElementById(plotDivId);
        if (plotDiv) { // Esconde o plot atual antes de gerar o novo (apenas se for recalcular)
            plotDiv.classList.remove('visible');
        }

        // Garante que os dados 3D completos estejam carregados
        const allEFieldData = await ensureFullEFieldData3DLoaded();
        if (!allEFieldData || allEFieldData.length === 0) {
            throw new Error("Dados E-field Completos (IPFS) não disponíveis após tentativa de carregamento.");
        }

        current3DCalculationId++; // Incrementa o ID do cálculo 3D (usado para Heatmap também)

        if (beamCalculationWorker3D) {
            if (statusDiv && !statusDiv.textContent.startsWith("Falha")) statusDiv.textContent = 'Calculando padrão completo... 0%';
            // Envia dados para o Web Worker 3D
            beamCalculationWorker3D.postMessage({
                id: current3DCalculationId,
                antennaCoords: antennaCoords,
                elementFieldData3D: allEFieldData, // Dados completos do E-field
                K_CONST: K
            });
            // O cache será atualizado no onmessage quando o resultado chegar
            cachedCalculationParams3D = { layoutHash: currentLayoutHash };

        } else {
            console.error("Web Worker 3D não disponível.");
            if (statusDiv) statusDiv.textContent = "Erro: Web Worker 3D não suportado ou falhou ao inicializar.";
            finalizePlotProcessing(false, '3D');
        }

    } catch (error) {
        console.error("Erro ao processar solicitação de dados completos:", error);
        if (statusDiv && !statusDiv.textContent.startsWith("Falha")) {
            statusDiv.textContent = `Erro no processamento: ${error.message.substring(0, 150)}`;
        }
        const plotDiv = document.getElementById(plotDivId);
        if (plotDiv) { Plotly.purge(plotDiv); } // Limpa o plot em caso de erro
        finalizePlotProcessing(false, '3D');
    }
}


// === Funções de Finalização, Setup de Workers, etc. ===

function finalizePlotProcessing(processedSuccessfully, plotType = '2D') {
    isProcessingPlot = false; // Reseta a flag de processamento
    if (plotType === '3D') { // Reabilita botões 3D/Heatmap
        if(visualize3DBtn) visualize3DBtn.disabled = false;
        if(visualizeHeatmapBtn) visualizeHeatmapBtn.disabled = false;
    }

    if (plotType === '2D') {
        // Se a solicitação processada foi a mais recente, limpa latestPlotRequestParams
        if (latestPlotRequestParams && latestPlotRequestParams.timestamp === currentlyProcessingRequestTimestamp) {
            if (processedSuccessfully) {
                latestPlotRequestParams = null;
            }
        }
        currentlyProcessingRequestTimestamp = null;
        // Se houver outra solicitação pendente, agenda seu processamento
        if (latestPlotRequestParams) {
            clearTimeout(processRequestTimeoutId);
            processRequestTimeoutId = setTimeout(processLatestPlotRequestIfIdle, PLOT_REQUEST_DEBOUNCE_DELAY);
        } else {
             // Lógica de status idle
        }
    } else { // plotType === '3D' (Full Data)
        const currentStatus = statusDiv ? statusDiv.textContent : "";
        if (!processedSuccessfully && statusDiv &&
            !currentStatus.startsWith("Erro") &&
            !currentStatus.startsWith("Falha") &&
            !currentStatus.includes("pronta") &&
            !currentStatus.includes("atualizado")) {
            statusDiv.textContent = "Falha ao gerar plot. Verifique o console e tente novamente.";
        }
    }
}

function setupWorkers() {
    if (window.Worker) {
        try {
            beamCalculationWorker = new Worker('js/beam_worker.js');
            beamCalculationWorker.onmessage = function(e) {
                const { id, type, data, error } = e.data;
                // Ignora resultados de cálculos antigos
                if (id !== currentCalculationId) {
                    console.log(`Worker 2D: Resultado ignorado (ID ${id} não corresponde ao atual ${currentCalculationId})`);
                    return;
                }
                let plotSuccessful = false;
                if (type === 'progress') { // Mensagem de progresso do worker
                    // Apenas mostra progresso se 2D estiver ativo
                    if (statusDiv && data && visualize2DBtn && visualize2DBtn.classList.contains('primary') && !statusDiv.textContent.startsWith("Erro") && !statusDiv.textContent.startsWith("Falha")) {
                         statusDiv.textContent = data;
                    }
                    return;
                }
                if (type === 'result') { // Resultado do cálculo 2D
                    let { thetaValues, resultingMagnitude } = data;
                    const { phi: plotPhi, scale: plotScale } = storedWorkerPlotParams;
                    // Downsample dos dados se houver muitos pontos
                    if (thetaValues.length > MAX_PLOT_POINTS_BEAM) {
                        const downsampled = downsampleData(thetaValues, resultingMagnitude, MAX_PLOT_POINTS_BEAM);
                        thetaValues = downsampled.x; resultingMagnitude = downsampled.y;
                    }
                    plotBeamPattern2D(thetaValues, resultingMagnitude, plotPhi, plotScale); 
                    if (statusDiv && !statusDiv.textContent.startsWith("Erro") && !statusDiv.textContent.startsWith("Falha")) statusDiv.textContent = `Padrão de feixe 2D para Phi=${plotPhi}° (${plotScale}) atualizado.`;
                    plotSuccessful = true;
                } else if (type === 'error') { // Erro do worker
                    console.error("Erro do Web Worker 2D:", error);
                    if (statusDiv) statusDiv.textContent = `Erro do Worker 2D: ${String(error).substring(0,150)}`;
                    const plotDivCurrent = document.getElementById(plotDivId);
                    if(plotDivCurrent) { Plotly.purge(plotDivCurrent); plotDivCurrent.classList.remove('visible'); }
                    plotSuccessful = false;
                }
                finalizePlotProcessing(plotSuccessful, '2D');
            };
            beamCalculationWorker.onerror = function(err) { // Erro fatal no worker
                console.error("Erro fatal no Web Worker 2D:", err);
                if (statusDiv) statusDiv.textContent = `Erro fatal no Worker 2D: ${err.message ? err.message.substring(0,100) : 'Erro desconhecido'}. Recarregue.`;
                finalizePlotProcessing(false, '2D');
                const plotDivCurrent = document.getElementById(plotDivId);
                if(plotDivCurrent) plotDivCurrent.classList.remove('visible');
                beamCalculationWorker = null; // Invalida o worker
            };
            console.log("Web Worker 2D para padrão de feixe inicializado.");
        } catch (e) {
            console.error("Falha ao criar Web Worker 2D:", e);
            if(statusDiv) statusDiv.textContent = "Erro: Web Worker 2D não pôde ser criado.";
            beamCalculationWorker = null;
        }
    } else { // Web Workers não suportados
        console.warn("Web Workers não suportados (para 2D). Plotagem de feixe pode ser lenta ou indisponível.");
        if(statusDiv) statusDiv.textContent = "Aviso: Web Workers não suportados. Cálculos podem ser lentos.";
    }

    // Configuração do Worker 3D (similar ao 2D)
    if (window.Worker) {
        try {
            beamCalculationWorker3D = new Worker('js/beam_worker_3d.js');
            beamCalculationWorker3D.onmessage = function(e) {
                const { id, type, data, error } = e.data;
                 if (id !== current3DCalculationId) { // Ignora resultados de cálculos antigos
                    console.log(`Worker 3D: Resultado ignorado (ID ${id} não corresponde ao atual ${current3DCalculationId})`);
                    return;
                 }
                let plotSuccessful = false;
                if (type === 'progress') {
                    if (statusDiv && data && !statusDiv.textContent.startsWith("Erro") && !statusDiv.textContent.startsWith("Falha")) statusDiv.textContent = data;
                    return;
                }
                if (type === 'result3D') { // Resultado do cálculo 3D
                    const { uniquePhis_deg, uniqueThetas_deg, magnitudes_grid_dB, magnitudes_grid_linear_normalized } = data;

                    // Armazena no cache para uso futuro (troca de views/escalas sem recálculo)
                    cachedCalculationResult3D = data;

                    // Decide qual plot renderizar com base no botão ativo
                    if (visualizeHeatmapBtn && visualizeHeatmapBtn.classList.contains('primary')) {
                        plotBeamHeatmap(uniquePhis_deg, uniqueThetas_deg, magnitudes_grid_dB, magnitudes_grid_linear_normalized, storedFullDataScaleType);
                    } else {
                        // Default fallback to 3D if no specific button (or if 3D is active)
                        plotBeamPattern3D(uniquePhis_deg, uniqueThetas_deg, magnitudes_grid_dB, magnitudes_grid_linear_normalized, storedFullDataScaleType);
                    }
                    plotSuccessful = true;
                } else if (type === 'error') {
                    console.error("Erro do Web Worker 3D:", error);
                    if (statusDiv) statusDiv.textContent = `Erro do Worker 3D: ${String(error).substring(0,150)}`;
                    const plotDivCurrent = document.getElementById(plotDivId);
                    if(plotDivCurrent) { Plotly.purge(plotDivCurrent); plotDivCurrent.classList.remove('visible'); }
                    plotSuccessful = false;
                }
                finalizePlotProcessing(plotSuccessful, '3D');
            };
            beamCalculationWorker3D.onerror = function(err) {
                console.error("Erro fatal no Web Worker 3D:", err);
                if (statusDiv) statusDiv.textContent = `Erro fatal no Worker 3D: ${err.message ? err.message.substring(0,100) : 'Erro desconhecido'}. Recarregue.`;
                finalizePlotProcessing(false, '3D');
                const plotDivCurrent = document.getElementById(plotDivId);
                if(plotDivCurrent) plotDivCurrent.classList.remove('visible');
                beamCalculationWorker3D = null;
             };
            console.log("Web Worker 3D para padrão de feixe inicializado.");
        } catch (e) {
            console.error("Falha ao criar Web Worker 3D:", e);
            if(statusDiv) statusDiv.textContent = "Erro: Web Worker 3D não pôde ser criado.";
            beamCalculationWorker3D = null;
        }
    } else {
        console.warn("Web Workers não suportados (para 3D). Plotagem 3D pode ser lenta ou indisponível.");
        if(statusDiv && !statusDiv.textContent.includes("Web Workers não suportados")) {
             statusDiv.textContent = "Aviso: Web Workers não suportados. Cálculos podem ser lentos.";
        }
    }
}

// Função para expor dados do módulo para outros (ex: psf_analyzer)
function getBeamPatternModuleData() {
    return {
        parsedEFieldData3D: fullEFieldDataCache, // Dados 3D cacheados
        K_CONST: K, // Constante K
        isEField3DLoaded: fullEFieldDataLoadingState === 'loaded' && fullEFieldDataCache !== null
    };
}

function initBeamPatternControls() {
    // Obtém referências aos elementos DOM
    phiSlider = document.getElementById('beam-phi-slider');
    phiInput = document.getElementById('beam-phi-input');
    scaleSelect = document.getElementById('beam-scale-select');
    visualize3DBtn = document.getElementById('visualize-3d-btn');
    visualize2DBtn = document.getElementById('visualize-2d-btn');
    visualizeHeatmapBtn = document.getElementById('visualize-heatmap-btn');
    statusDiv = document.getElementById('beam-status');

    // Verifica se todos os elementos foram encontrados
    if (!phiSlider || !phiInput || !scaleSelect || !statusDiv || !visualize3DBtn || !visualize2DBtn || !visualizeHeatmapBtn) {
        console.error("Falha na inicialização dos controles do padrão de feixe: Um ou mais elementos DOM não foram encontrados.");
        if(statusDiv) statusDiv.textContent = "Erro crítico: Controles do gráfico ausentes no DOM.";
        // Desabilita botões se possível
        [visualize2DBtn, visualize3DBtn, visualizeHeatmapBtn].forEach(btn => { if(btn) btn.disabled = true; });
        return;
    }

    setupWorkers(); // Inicializa os Web Workers

    // Função para acionar a atualização do plot 2D
    const activate2DMode = () => {
        // Atualiza classes dos botões
        visualize2DBtn.classList.add('primary'); visualize2DBtn.classList.remove('secondary');
        visualize3DBtn.classList.add('secondary'); visualize3DBtn.classList.remove('primary');
        visualizeHeatmapBtn.classList.add('secondary'); visualizeHeatmapBtn.classList.remove('primary');
        schedulePlotUpdate(); // Agenda 2D
    };

    const activate3DMode = () => {
        visualize3DBtn.classList.add('primary'); visualize3DBtn.classList.remove('secondary');
        visualize2DBtn.classList.add('secondary'); visualize2DBtn.classList.remove('primary');
        visualizeHeatmapBtn.classList.add('secondary'); visualizeHeatmapBtn.classList.remove('primary');
        processFullDataPlotRequest(); // Solicita 3D
    };

    const activateHeatmapMode = () => {
        visualizeHeatmapBtn.classList.add('primary'); visualizeHeatmapBtn.classList.remove('secondary');
        visualize3DBtn.classList.add('secondary'); visualize3DBtn.classList.remove('primary');
        visualize2DBtn.classList.add('secondary'); visualize2DBtn.classList.remove('primary');
        processFullDataPlotRequest(); // Solicita Full Data (Heatmap)
    };

    // Event listeners para os controles de Phi (slider e input numérico)
    phiSlider.addEventListener('input', () => {
        phiInput.value = phiSlider.value;
        if (visualize2DBtn.classList.contains('primary')) schedulePlotUpdate();
    });
    phiInput.addEventListener('input', () => {
        let value = parseFloat(phiInput.value);
        if (!isNaN(value)) {
            const min = parseFloat(phiSlider.min); const max = parseFloat(phiSlider.max);
            if (value >= min && value <= max) {
                phiSlider.value = value;
            }
        }
        if (visualize2DBtn.classList.contains('primary')) schedulePlotUpdate();
    });
    phiInput.addEventListener('change', () => {
        let value = parseFloat(phiInput.value);
        const min = parseFloat(phiSlider.min); const max = parseFloat(phiSlider.max);
        if (isNaN(value) || value < min) { value = min; }
        if (value > max) { value = max; }
        phiInput.value = value;
        phiSlider.value = value;
        if (visualize2DBtn.classList.contains('primary')) schedulePlotUpdate();
    });

    // Event Listeners para botões de modo
    visualize2DBtn.addEventListener('click', activate2DMode);
    visualize3DBtn.addEventListener('click', activate3DMode);
    visualizeHeatmapBtn.addEventListener('click', activateHeatmapMode);

    // Event listener para o Dropdown de Escala
    scaleSelect.addEventListener('change', () => {
        if (visualize2DBtn.classList.contains('primary')) {
            schedulePlotUpdate();
        } else {
            // Se estiver em modo 3D ou Heatmap, redesenha
            processFullDataPlotRequest();
        }
    });

    // Listener para o evento 'layoutGenerated'
    window.addEventListener('layoutGenerated', () => {
        // Se estiver em modo 2D, atualiza.
        if(visualize2DBtn.classList.contains('primary')) {
            schedulePlotUpdate();
        } else {
            // Se estiver em Heatmap ou 3D, também atualiza pois os dados mudaram
            processFullDataPlotRequest();
        }
    });

    // Listener para 'themeChanged'
    window.addEventListener('themeChanged', () => {
        const hasAntennas = window.antennaGenerator?.getAllAntennas().length > 0;
        const plotDivCurrent = document.getElementById(plotDivId);
        const isPlotDisplayed = plotDivCurrent && plotDivCurrent.data && plotDivCurrent.data.length > 0;

        if (!hasAntennas && isPlotDisplayed) {
            Plotly.purge(plotDivCurrent);
            plotDivCurrent.classList.remove('visible');
            return;
        }

        if (visualize2DBtn.classList.contains('primary')) {
            schedulePlotUpdate();
        } else {
             processFullDataPlotRequest();
        }
    });

    // Define o estado inicial: Heatmap como padrão
    visualizeHeatmapBtn.classList.add('primary'); visualizeHeatmapBtn.classList.remove('secondary');
    visualize3DBtn.classList.add('secondary'); visualize3DBtn.classList.remove('primary');
    visualize2DBtn.classList.add('secondary'); visualize2DBtn.classList.remove('primary');

    console.log("Controles do padrão de feixe inicializados.");
    if (statusDiv) statusDiv.textContent = 'Aguardando geração do layout inicial...';
}

// Inicializa os controles quando o DOM estiver pronto
document.addEventListener('DOMContentLoaded', initBeamPatternControls);