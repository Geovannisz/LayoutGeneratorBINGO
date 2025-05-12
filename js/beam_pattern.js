// js/beam_pattern.js

/**
 * beam_pattern.js
 *
 * Handles fetching antenna element data PER PHI ANGLE from individual CSV files
 * (hosted on Raw GitHub User Content), calculating Array Factor (AF) via Web Worker,
 * and plotting the beam pattern.
 * Includes downsampling for large datasets and caching for fetched/parsed phi data.
 * Uses Plotly.js and includes options for dB/linear scale and Phi angle selection.
 */

// === Constants ===
const FREQUENCY = 1e9;
const C_LIGHT = 299792458;
const LAMBDA = C_LIGHT / FREQUENCY;
const K = (2 * Math.PI) / LAMBDA;

// Caminho base para os CSVs de E-field divididos por Phi
const E_FIELD_CSV_BASE_PATH = 'https://raw.githubusercontent.com/Geovannisz/LayoutGeneratorBINGO/main/data/efield_phi_data/efield_phi_';
// OBSOLETO:
// const E_FIELD_CSV_PATH ='https://gateway.pinata.cloud/ipfs/bafybeigdx5ssprf2wmgjbv56sfv36yawvyw6k2usorxacx63bbmtw3udvq';

const DEBOUNCE_DELAY = 300;
const MAX_PLOT_POINTS_BEAM = 2000;

// Cache & State
// MODIFICADO: Caches para dados e promessas, indexados por valor de phi
let parsedEFieldDataCache = {}; // Ex: { 0: dataForPhi0, 10: dataForPhi10 }
let fetchPromisesCache = {};    // Ex: { 0: promiseForPhi0, 10: promiseForPhi10 }
let debounceTimeout = null;
let isPlotting = false;

// Web Worker
let beamCalculationWorker = null;
let currentCalculationId = 0;
let storedPlotParams = {};

// References to DOM elements
let phiSlider = null;
let phiInput = null;
let scaleRadios = null;
let plotDivId = 'beam-pattern-plot';
let statusDiv = null;

// === Helper Function ===
// Função para obter o caminho completo do CSV para um dado Phi
function getEFieldCsvPath(phiValue) {
    // Arredonda phiValue para o inteiro mais próximo, pois os arquivos são nomeados com inteiros
    const roundedPhi = Math.round(parseFloat(phiValue));
    return `${E_FIELD_CSV_BASE_PATH}${roundedPhi}.csv`;
}

// === Debounce Function (sem alterações) ===
function debounce(func, delay) {
    return function(...args) {
        clearTimeout(debounceTimeout);
        debounceTimeout = setTimeout(() => {
            func.apply(this, args);
        }, delay);
    };
}

// === Data Fetching and Parsing (MODIFICADO para buscar por Phi) ===
async function fetchAndParseEFieldData(phiValue) {
    const roundedPhi = Math.round(parseFloat(phiValue)); // Chave do cache é o Phi arredondado

    if (parsedEFieldDataCache[roundedPhi]) {
        console.log(`Using cached E-field data for Phi = ${roundedPhi}°`);
        return parsedEFieldDataCache[roundedPhi];
    }
    if (fetchPromisesCache[roundedPhi]) {
        console.log(`Waiting for existing fetch promise for Phi = ${roundedPhi}°`);
        return fetchPromisesCache[roundedPhi];
    }

    const csvPath = getEFieldCsvPath(roundedPhi);
    console.log(`Fetching E-field data for Phi = ${roundedPhi}° from: ${csvPath}`);
    if (statusDiv) statusDiv.textContent = `Carregando dados para Phi = ${roundedPhi}° (CSV)...`;

    fetchPromisesCache[roundedPhi] = new Promise(async (resolve, reject) => {
        try {
            const response = await fetch(csvPath);
            if (!response.ok) {
                console.error(`HTTP error! Status: ${response.status} ao buscar ${csvPath}`);
                // Limpa a promessa do cache em caso de erro para permitir nova tentativa
                delete fetchPromisesCache[roundedPhi];
                throw new Error(`Falha ao buscar CSV para Phi ${roundedPhi} (${response.status}). Verifique o arquivo/caminho.`);
            }
            const csvText = await response.text();

            // Git LFS check (mantido, embora menos provável com arquivos menores)
            if (csvText.startsWith("version https://git-lfs.github.com/spec/v1")) {
                console.error("ERRO: O arquivo CSV baixado ainda é um ponteiro Git LFS.");
                 delete fetchPromisesCache[roundedPhi];
                throw new Error("Falha ao buscar CSV: Recebido ponteiro Git LFS. Verifique o estado do arquivo no branch.");
            }

            console.log(`CSV data for Phi = ${roundedPhi}° fetched. Parsing...`);
            if (statusDiv) statusDiv.textContent = `Analisando dados do CSV para Phi = ${roundedPhi}°...`;

            const lines = csvText.trim().split('\n');
            if (lines.length < 2) {
                delete fetchPromisesCache[roundedPhi];
                throw new Error(`CSV para Phi ${roundedPhi}° vazio ou apenas com cabeçalho.`);
            }
            
            // Normaliza cabeçalhos (mantido)
            const headersRaw = lines[0].split(',');
            const headers = headersRaw.map(h => h.replace(/"/g, '').trim().toLowerCase());

            // Mapeamento de colunas (mantido)
            // NOTA: As colunas esperadas no seu CSV original são:
            // "Freq [GHz]","Phi [deg]","Theta [deg]","re(rEPhi) [V]","im(rEPhi) [V]","re(rETheta) [V]","im(rETheta) [V]",...
            // O código usa nomes ligeiramente diferentes para as colunas de campo. Ajuste se os arquivos CSV divididos tiverem nomes de coluna diferentes.
            // Assumindo que os arquivos divididos mantêm a estrutura de colunas original.
            const indices = {
                theta: headers.indexOf('theta [deg]'), // Mantido como 'theta [deg]'
                phi: headers.indexOf('phi [deg]'),     // Mantido como 'phi [deg]'
                reTheta: headers.indexOf('re(retheta) [v]'),
                imTheta: headers.indexOf('im(retheta) [v]'),
                rePhi: headers.indexOf('re(rephi) [v]'),
                imPhi: headers.indexOf('im(rephi) [v]')
            };
            
            // Verificação de cabeçalhos (mantida)
            if (Object.values(indices).some(index => index === -1)) {
                console.error(`Colunas requeridas não encontradas para Phi = ${roundedPhi}°. Cabeçalhos processados:`, headers);
                console.error("Esperados (lowercase): ['theta [deg]', 'phi [deg]', 're(retheta) [v]', 'im(retheta) [v]', 're(rephi) [v]', 'im(rephi) [v]']");
                console.error("Índices encontrados:", indices);
                delete fetchPromisesCache[roundedPhi];
                throw new Error(`CSV para Phi ${roundedPhi}°: cabeçalho incompleto. Verifique o console.`);
            }

            const data = [];
            for (let i = 1; i < lines.length; i++) {
                 const valuesRaw = lines[i].split(',');
                 if(valuesRaw.length !== headers.length) {
                     if(lines[i].trim() !== '') { // Não avisa para linhas completamente vazias
                        console.warn(`Phi ${roundedPhi}° CSV: Pulando linha ${i+1}: Esperadas ${headers.length} colunas, encontradas ${valuesRaw.length}. Conteúdo: "${lines[i]}"`);
                     }
                     continue;
                 }
                 const values = valuesRaw.map(v => v.replace(/"/g, '').trim());

                try {
                    // Parse dos valores (mantido)
                    const thetaVal = parseFloat(values[indices.theta]);
                    const phiVal = parseFloat(values[indices.phi]); // Este valor deve ser igual a `roundedPhi`
                    const reThetaV = parseFloat(values[indices.reTheta]);
                    const imThetaV = parseFloat(values[indices.imTheta]);
                    const rePhiV = parseFloat(values[indices.rePhi]);
                    const imPhiV = parseFloat(values[indices.imPhi]);

                    if ([thetaVal, phiVal, reThetaV, imThetaV, rePhiV, imPhiV].some(isNaN)) {
                        console.warn(`Phi ${roundedPhi}° CSV: Pulando linha ${i+1} devido a valor numérico inválido. Linha: "${lines[i]}"`);
                        continue;
                    }
                    
                    // Adicional: Verificar se o phiVal do arquivo CSV corresponde ao roundedPhi esperado
                    // Isso é uma sanidade, mas o filtro principal será feito em `generateBeamPatternPlot`
                    if (Math.abs(phiVal - roundedPhi) > 1e-3) { // Tolerância para comparação de float
                        // console.warn(`Phi ${roundedPhi}° CSV: Linha ${i+1} tem Phi ${phiVal}, esperado ~${roundedPhi}. Será filtrado posteriormente se necessário.`);
                        // Não pular, pois a filtragem mais precisa ocorrerá depois
                    }

                    const rETheta = { re: reThetaV, im: imThetaV };
                    const rEPhi = { re: rePhiV, im: imPhiV };
                    const rETotalMag = Math.sqrt(rETheta.re**2 + rETheta.im**2 + rEPhi.re**2 + rEPhi.im**2);

                    data.push({ theta: thetaVal, phi: phiVal, rETheta, rEPhi, rETotal: rETotalMag });
                } catch (parseError) {
                    console.warn(`Phi ${roundedPhi}° CSV: Erro ao processar dados na linha ${i + 1}: ${lines[i]}. Erro: ${parseError.message}`);
                }
            }
            
            if (data.length === 0 && lines.length > 1) {
                console.warn(`Phi ${roundedPhi}° CSV: Parsing resultou em dataset vazio, embora o arquivo não estivesse. Verifique formato e cabeçalhos.`);
            }
            console.log(`Phi ${roundedPhi}° CSV: Parsing completo. ${data.length} pontos carregados.`);
            parsedEFieldDataCache[roundedPhi] = data; // Adiciona ao cache
            delete fetchPromisesCache[roundedPhi];    // Limpa a promessa do cache
            resolve(data);
        } catch (error) {
            console.error(`Erro ao buscar/analisar dados para Phi = ${roundedPhi}°:`, error);
            if (statusDiv) statusDiv.textContent = `Erro ao carregar CSV (Phi ${roundedPhi}°): ${error.message.substring(0,100)}`;
            delete fetchPromisesCache[roundedPhi]; // Limpa a promessa do cache em caso de erro
            reject(error);
        }
    });
    return fetchPromisesCache[roundedPhi];
}

// === Downsampling Function (sem alterações) ===
function downsampleData(xData, yData, maxPoints) {
    if (xData.length <= maxPoints) {
        return { x: xData, y: yData };
    }
    const factor = Math.ceil(xData.length / maxPoints);
    const sampledX = [];
    const sampledY = [];
    for (let i = 0; i < xData.length; i += factor) {
        sampledX.push(xData[i]);
        sampledY.push(yData[i]);
    }
    if ((xData.length - 1) % factor !== 0) { // Garante que o último ponto seja incluído
         sampledX.push(xData[xData.length - 1]);
         sampledY.push(yData[yData.length - 1]);
    }
    console.log(`Dados amostrados de ${xData.length} para ${sampledX.length} pontos.`);
    return { x: sampledX, y: sampledY };
}

// === Plotting (sem alterações na lógica de plotagem em si, mas as cores são importantes) ===
function plotBeamPattern(theta, fieldMagnitude, phiValue, scaleType) {
    console.log(`Plotando padrão de feixe para Phi = ${phiValue}°, Escala = ${scaleType}, Pontos = ${theta.length}`);
    const plotDiv = document.getElementById(plotDivId);
    if (!plotDiv) {
        console.error(`Div alvo "${plotDivId}" não encontrada para plotagem.`);
        return;
    }

    Plotly.purge(plotDiv); // Limpa o gráfico anterior

    let yData;
    let yAxisTitle;
    // Evita dividir por zero ou valor muito pequeno; garante que o pico seja ao menos um valor pequeno positivo.
    const peakMagnitude = Math.max(0.0000000001, ...fieldMagnitude); 

    if (scaleType === 'dB') {
        yData = fieldMagnitude.map(mag => {
            if (mag <= 0) return -100; // Valor piso para magnitudes não positivas em dB
            const normalizedMag = mag / peakMagnitude;
            // Garante que o valor para log10 não seja zero ou negativo, mesmo após normalização
            const magForDb = Math.max(normalizedMag, 1e-10); // 1e-10 é -100dB
            return 20 * Math.log10(magForDb);
        });
        yAxisTitle = 'Magnitude Normalizada (dB)';
    } else { // Escala Linear
        yData = fieldMagnitude.map(mag => mag / peakMagnitude);
        yAxisTitle = 'Magnitude Normalizada (Linear)';
    }

    // Cores baseadas no tema CSS (importante para consistência)
    const rootStyle = getComputedStyle(document.documentElement);
    const plotBgColor = rootStyle.getPropertyValue('--plot-bg-color').trim() || '#ffffff';
    const paperBgColor = rootStyle.getPropertyValue('--card-bg-color').trim() || '#ffffff'; // Fundo do "papel" do gráfico
    const textColor = rootStyle.getPropertyValue('--text-color').trim() || '#333333';
    const gridColor = rootStyle.getPropertyValue('--plot-grid-color').trim() || '#eeeeee';
    const lineColor = rootStyle.getPropertyValue('--primary-color').trim() || '#3498db'; // Cor da linha principal do gráfico
    const axisColor = rootStyle.getPropertyValue('--border-color').trim() || '#cccccc'; // Cor dos eixos e ticks

    const trace = {
        x: theta,
        y: yData,
        mode: 'lines',
        type: 'scatter',
        name: `Phi = ${phiValue}°`,
        line: { color: lineColor }
    };

    const layout = {
        title: `Padrão de Feixe (Phi = ${phiValue}°, Escala ${scaleType === 'dB' ? 'dB' : 'Linear'})`,
        xaxis: {
            title: 'Theta (graus)',
            gridcolor: gridColor,
            zerolinecolor: axisColor,
            linecolor: axisColor, // Cor da linha do eixo X
            tickcolor: textColor, // Cor dos números dos ticks
            titlefont: { color: textColor },
            tickfont: { color: textColor },
            automargin: true
        },
        yaxis: {
            title: yAxisTitle,
            gridcolor: gridColor,
            zerolinecolor: axisColor,
            linecolor: axisColor, // Cor da linha do eixo Y
            tickcolor: textColor,
            titlefont: { color: textColor },
            tickfont: { color: textColor },
            automargin: true
        },
        plot_bgcolor: plotBgColor,    // Fundo da área de plotagem
        paper_bgcolor: paperBgColor,  // Fundo geral do gráfico
        font: { color: textColor },
        showlegend: false, // Legenda simples já está no título
        autosize: true     // Permite que o Plotly gerencie o tamanho
    };
    
    // `config` pode ser usado para opções como remover botões de modo do Plotly, etc.
    Plotly.newPlot(plotDivId, [trace], layout, {responsive: true})
        .then(() => console.log(`Gráfico Plotly renderizado: Phi = ${phiValue}°, Escala = ${scaleType}.`))
        .catch(err => console.error("Erro ao renderizar gráfico Plotly:", err));
}


// === Main Generation Function (MODIFICADO para usar fetch por Phi) ===
async function generateBeamPatternPlot() {
    if (isPlotting && beamCalculationWorker) {
        console.log("Cálculo do padrão de feixe já em andamento no worker. Nova solicitação ignorada.");
        return;
    }
    isPlotting = true;
    console.log("Tentando gerar gráfico do padrão de feixe...");

    if (!phiInput || !scaleRadios || !statusDiv) {
        console.error("Controles do padrão de feixe não inicializados corretamente.");
        isPlotting = false; return;
    }
    statusDiv.textContent = 'Preparando para gerar padrão de feixe...';

    try {
        if (!window.antennaGenerator?.getAllAntennas) { // Verifica se o gerador de layout está disponível
            throw new Error("Gerador de antenas (window.antennaGenerator) não disponível.");
        }
        const antennaCoords = window.antennaGenerator.getAllAntennas();
        if (!antennaCoords || antennaCoords.length === 0) {
            statusDiv.textContent = 'Layout de antenas vazio. Gere um layout primeiro.';
            const plotDiv = document.getElementById(plotDivId);
            if (plotDiv) Plotly.purge(plotDiv); // Limpa o gráfico se não houver antenas
            isPlotting = false; return;
        }
        console.log(`Usando ${antennaCoords.length} antenas para o padrão de feixe.`);

        const selectedPhi = parseFloat(phiInput.value); // Phi selecionado pelo usuário
        let selectedScale = 'dB';
        for (const radio of scaleRadios) { if (radio.checked) { selectedScale = radio.value; break; } }

        // MODIFICADO: Chama fetchAndParseEFieldData com o Phi selecionado
        const elementDataFull = await fetchAndParseEFieldData(selectedPhi); 
        if (!elementDataFull || elementDataFull.length === 0) {
             throw new Error(`Dados do elemento irradiante para Phi = ${selectedPhi}° não puderam ser carregados ou estão vazios.`);
        }
        
        // FILTRAGEM ADICIONAL (RECOMENDADO):
        // Mesmo que o arquivo CSV seja específico para um Phi, pode haver pequenas variações
        // ou dados para Phis ligeiramente diferentes se o processo de divisão não foi perfeito.
        // Esta filtragem garante que apenas os dados EXATAMENTE para o `selectedPhi` (com tolerância) sejam usados.
        // Se os arquivos CSVs divididos são perfeitos (contêm apenas o phi inteiro exato), esta filtragem fará pouco, mas é segura.
        statusDiv.textContent = `Filtrando dados do elemento para Phi = ${selectedPhi}°...`;
        const filteredElementData = elementDataFull.filter(point => Math.abs(point.phi - selectedPhi) < 1e-6); // Tolerância pequena
        
        if (filteredElementData.length === 0) {
            // Isso pode acontecer se o selectedPhi for, por exemplo, 10.5, mas o arquivo efield_phi_10.csv (ou 11.csv)
            // contiver apenas dados para phi=10 (ou phi=11).
            console.warn(`Nenhum dado encontrado EXATAMENTE para Phi = ${selectedPhi}° após filtragem final. Verifique o conteúdo do CSV ${getEFieldCsvPath(selectedPhi)} e a precisão de Phi no arquivo.`);
            statusDiv.textContent = `Dados não encontrados para Phi = ${selectedPhi}° no CSV. Verifique o arquivo.`;
            const plotDiv = document.getElementById(plotDivId);
            if (plotDiv) Plotly.purge(plotDiv);
            isPlotting = false; return;
        }

        storedPlotParams = { phi: selectedPhi, scale: selectedScale }; // Armazena para uso no callback do worker
        currentCalculationId++; // Incrementa ID para invalidar cálculos antigos

        if (beamCalculationWorker) {
            statusDiv.textContent = 'Enviando dados para cálculo em background (Worker)...';
            beamCalculationWorker.postMessage({
                id: currentCalculationId,
                antennaCoords,
                filteredElementData: filteredElementData, // Envia os dados filtrados finais
                K_CONST: K,
                selectedPhiValue: selectedPhi // Envia o Phi que foi usado para filtrar
            });
        } else {
            console.error("Web Worker não está disponível. Não é possível calcular o padrão de feixe.");
            statusDiv.textContent = "Erro: Web Workers não suportados. Cálculo não pode ser realizado.";
            isPlotting = false;
        }

    } catch (error) {
        console.error("Erro ao preparar para gerar padrão de feixe:", error);
        statusDiv.textContent = `Erro: ${error.message.substring(0,150)}`;
        const plotDiv = document.getElementById(plotDivId);
        if (plotDiv) Plotly.purge(plotDiv); // Limpa o gráfico em caso de erro
        isPlotting = false;
    }
}

// Debounced version da função de geração (sem alterações)
const debouncedGenerateBeamPatternPlot = debounce(generateBeamPatternPlot, DEBOUNCE_DELAY);

// === Initialization and Event Handling (sem alterações na lógica principal, mas o comportamento muda devido às modificações acima) ===
function initBeamPatternControls() {
    phiSlider = document.getElementById('beam-phi-slider');
    phiInput = document.getElementById('beam-phi-input');
    scaleRadios = document.querySelectorAll('input[name="beamScale"]');
    statusDiv = document.getElementById('beam-status');

    if (!phiSlider || !phiInput || !scaleRadios || scaleRadios.length === 0 || !statusDiv) {
        console.error("Inicialização dos controles do padrão de feixe falhou: elementos DOM ausentes.");
        if(statusDiv) statusDiv.textContent = "Erro: Controles do gráfico não encontrados.";
        return;
    }

    // Inicialização do Web Worker (sem alterações)
    if (window.Worker) {
        beamCalculationWorker = new Worker('js/beam_worker.js');
        beamCalculationWorker.onmessage = function(e) {
            const { id, type, data, error } = e.data;

            // Verifica se a mensagem é para o cálculo atual
            if (id !== currentCalculationId) {
                console.log("Worker retornou para uma tarefa antiga/invalidada (ID: " + id + ", Esperado: " + currentCalculationId + "). Ignorando.");
                return;
            }
            if (type === 'progress') { // Mensagens de progresso do worker
                if (e.data.data) { // data.data aqui é a string de progresso
                    statusDiv.textContent = e.data.data;
                }
                return;
            }

            isPlotting = false; // Cálculo (sucesso ou erro) terminou

            if (type === 'result') {
                let { thetaValues, resultingMagnitude, phiValue: phiFromWorker } = data;
                // Usa os parâmetros armazenados no momento da chamada, não os do worker, para consistência
                const { phi: callTimePhi, scale: callTimeScale } = storedPlotParams;

                // Verificação de consistência do Phi (opcional)
                if (Math.abs(phiFromWorker - callTimePhi) > 1e-6) {
                     console.warn(`Disparidade de Phi: Worker usou ${phiFromWorker}, chamada foi para ${callTimePhi}. Usando ${callTimePhi} para plotagem.`);
                }

                // Downsample se necessário (sem alterações)
                if (thetaValues.length > MAX_PLOT_POINTS_BEAM) {
                    statusDiv.textContent = `Amostrando ${thetaValues.length} pontos para ~${MAX_PLOT_POINTS_BEAM} para plotagem...`;
                    const downsampled = downsampleData(thetaValues, resultingMagnitude, MAX_PLOT_POINTS_BEAM);
                    thetaValues = downsampled.x;
                    resultingMagnitude = downsampled.y;
                }

                statusDiv.textContent = 'Renderizando gráfico do padrão de feixe...';
                plotBeamPattern(thetaValues, resultingMagnitude, callTimePhi, callTimeScale); // Usa callTimePhi
                statusDiv.textContent = `Padrão de feixe para Phi = ${callTimePhi}° atualizado (Escala: ${callTimeScale}).`;

            } else if (type === 'error') {
                console.error("Erro retornado pelo Web Worker:", error);
                statusDiv.textContent = `Erro do Worker: ${String(error).substring(0,150)}`;
                const plotDiv = document.getElementById(plotDivId);
                if (plotDiv) Plotly.purge(plotDiv); // Limpa gráfico em caso de erro do worker
            }
        };
        beamCalculationWorker.onerror = function(err) { // Erro fatal no worker
            console.error("Erro fatal no Web Worker:", err.message, err.filename, err.lineno);
            statusDiv.textContent = `Erro fatal no Worker: ${err.message.substring(0,100)}`;
            isPlotting = false;
            const plotDiv = document.getElementById(plotDivId);
            if (plotDiv) Plotly.purge(plotDiv);
            beamCalculationWorker = null; // Tentar recriar pode ser uma opção, mas por ora, apenas loga.
        };
        console.log("Web Worker para cálculo do padrão de feixe inicializado.");
    } else {
        console.warn("Web Workers não são suportados neste navegador. Cálculos do padrão de feixe podem ser lentos ou indisponíveis.");
        statusDiv.textContent = "Aviso: Web Workers não suportados. Performance pode ser afetada.";
    }

    // Listeners dos controles (sem alterações na lógica de chamada, mas o comportamento de fetch muda)
    phiSlider.addEventListener('input', () => {
        phiInput.value = phiSlider.value; // Sincroniza input numérico
        statusDiv.textContent = `Phi = ${phiSlider.value}°. Atualizando...`; // Feedback imediato
        debouncedGenerateBeamPatternPlot(); // Chama a geração (debounced)
    });
    phiInput.addEventListener('input', () => { // Para digitação direta no campo numérico
        let value = parseFloat(phiInput.value);
        if (isNaN(value)) return; // Ignora se não for número
        // Validação de min/max
        const min = parseFloat(phiSlider.min); const max = parseFloat(phiSlider.max);
        if (!isNaN(min)) value = Math.max(min, value);
        if (!isNaN(max)) value = Math.min(max, value);
        phiInput.value = value; // Atualiza o próprio campo com valor validado
        phiSlider.value = value; // Sincroniza slider
        statusDiv.textContent = `Phi = ${value}°. Atualizando...`;
        debouncedGenerateBeamPatternPlot();
    });
     phiInput.addEventListener('change', () => { // Quando o foco sai do input ou Enter é pressionado
        let value = parseFloat(phiInput.value);
        if (isNaN(value)) { // Se inválido, reverte para o valor do slider
            value = parseFloat(phiSlider.value);
        }
        // Validação final de min/max
        const min = parseFloat(phiSlider.min); const max = parseFloat(phiSlider.max);
        if (!isNaN(min)) value = Math.max(min, value);
        if (!isNaN(max)) value = Math.min(max, value);
        phiInput.value = value; // Garante que o input reflita o valor final
        phiSlider.value = value; // Sincroniza slider
        // Chama generateBeamPatternPlot diretamente (sem debounce) para resposta mais rápida ao 'change'
        // pois 'change' geralmente significa que o usuário terminou a edição.
        generateBeamPatternPlot(); 
     });

    scaleRadios.forEach(radio => {
        radio.addEventListener('change', () => {
            if (radio.checked) {
                 statusDiv.textContent = `Escala = ${radio.value}. Atualizando...`;
                generateBeamPatternPlot(); // Atualiza imediatamente ao mudar escala
            }
        });
    });

    // Listener para evento 'layoutGenerated' (quando o layout das antenas muda)
    window.addEventListener('layoutGenerated', () => {
        console.log("Evento 'layoutGenerated' recebido por beam_pattern.js.");
        statusDiv.textContent = 'Layout alterado. Atualizando padrão de feixe...';
        generateBeamPatternPlot(); // Regenera o padrão de feixe com o novo layout
    });

    // Listener para evento 'themeChanged' (para redesenhar o gráfico com as novas cores do tema)
    window.addEventListener('themeChanged', () => {
        console.log('Evento themeChanged recebido por beam_pattern.js');
        // Verifica se há dados no cache (qualquer phi) e se há antenas para evitar plotar um gráfico vazio
        const hasCachedData = Object.keys(parsedEFieldDataCache).length > 0;
        const hasAntennas = window.antennaGenerator?.getAllAntennas().length > 0;

        if (hasCachedData && hasAntennas) {
            statusDiv.textContent = 'Tema alterado. Redesenhando gráfico...';
            // Regenera o gráfico com os dados atuais (usará dados do cache para o phi atual)
            // Isso fará com que plotBeamPattern use as novas variáveis CSS de cor.
            generateBeamPatternPlot(); 
        } else {
            statusDiv.textContent = 'Tema alterado. Gere um layout para ver o gráfico.';
        }
    });

    console.log("Controles do padrão de feixe inicializados e listeners de eventos configurados.");
    // NOTA: A chamada inicial para `generateBeamPatternPlot` acontecerá quando o evento 'layoutGenerated'
    // for disparado pela primeira vez pelo `main.js` (após o gerador de layout criar o layout inicial).
}

// Inicializa os controles quando o DOM estiver pronto
document.addEventListener('DOMContentLoaded', initBeamPatternControls);