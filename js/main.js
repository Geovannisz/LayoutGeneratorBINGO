/**
 * main.js
 * (Comentários anteriores mantidos)
 */

let resizeDebounceTimer;

function initApp() {
    console.log('Aplicação BINGO Layout Generator: Inicializando...');
    setTimeout(() => {
        checkComponentsAndSetup();
    }, 250); // Aumentado ligeiramente para garantir que psfAnalyzer também seja registrado
}

function checkComponentsAndSetup() {
     let allComponentsReady = true;
     const missingComponents = [];

     if (!window.BingoLayouts) { missingComponents.push('BingoLayouts'); allComponentsReady = false; }
     if (!window.antennaGenerator) { missingComponents.push('AntennaLayoutGenerator'); allComponentsReady = false; }
     if (!window.interactiveMap) { missingComponents.push('InteractiveMap'); allComponentsReady = false; }
     if (!window.oskarExporter) { missingComponents.push('OskarLayoutExporter'); allComponentsReady = false; }
     // beam_pattern.js é inicializado por DOMContentLoaded
     if (!window.psfAnalyzer) { missingComponents.push('PSFAnalyzer'); allComponentsReady = false; }


     if (allComponentsReady) {
         console.log('Todos os componentes principais foram carregados com sucesso!');
         setupGlobalEventListeners();
         setupDarkMode();

         // A geração do layout inicial e o disparo do 'layoutGenerated' são feitos por antennaGenerator
         if (window.antennaGenerator) {
            console.log("Chamando geração de layout inicial a partir de main.js...");
            window.antennaGenerator.resizeCanvas();
            window.antennaGenerator.generateLayout(); // Isso disparará 'layoutGenerated'
        }
     } else {
          console.error("Falha na inicialização: Componentes ausentes:", missingComponents);
          alert(`Erro crítico: Falha ao carregar componentes (${missingComponents.join(', ')}).`);
     }
}

/**
 * Atualiza o PSFAnalyzer com os dados necessários do arranjo e do campo do elemento.
 * Esta função será chamada após a geração de um layout e após os dados 3D do campo do elemento serem carregados.
 */
async function updatePSFAnalyzerData() {
    if (!window.psfAnalyzer || typeof window.psfAnalyzer.updateData !== 'function') {
        console.warn("PSFAnalyzer não está pronto para receber dados.");
        return;
    }

    const antennaCoords = window.antennaGenerator ? window.antennaGenerator.getAllAntennas() : [];

    // Tenta obter dados do módulo beam_pattern
    let beamData = null;
    if (typeof getBeamPatternModuleData === 'function') { // Verifica se a função existe
        beamData = getBeamPatternModuleData();
    } else if (window.beamPattern && typeof window.beamPattern.getModuleData === 'function') { // Alternativa se exposto no window
        beamData = window.beamPattern.getModuleData();
    }


    let elementFieldData3D = beamData ? beamData.parsedEFieldData3D : null;
    const K_CONST = beamData ? beamData.K_CONST : null;

    // Se os dados 3D não estiverem carregados ainda, tenta carregá-los.
    // A função fetchAndParseEFieldData3D é de beam_pattern.js
    if ((!elementFieldData3D || elementFieldData3D.length === 0) && typeof fetchAndParseEFieldData3D === 'function') {
        console.log("Main.js: Dados 3D não carregados, tentando buscar...");
        try {
            // Garante que o statusDiv de beam_pattern seja atualizado
            const statusDivBeam = document.getElementById('beam-status');
            if (statusDivBeam && (eField3DLoadingState === 'idle' || eField3DLoadingState === 'error')) { // eField3DLoadingState é de beam_pattern.js
                 statusDivBeam.textContent = 'Carregando dados E-field 3D para análise PSF...';
            }

            elementFieldData3D = await fetchAndParseEFieldData3D(); // Esta função é de beam_pattern.js

            // Atualiza novamente beamData após o fetch, caso getBeamPatternModuleData precise ser chamado
            if (typeof getBeamPatternModuleData === 'function') {
                beamData = getBeamPatternModuleData();
                elementFieldData3D = beamData.parsedEFieldData3D; // Pega o valor atualizado
            }

            if (statusDivBeam && statusDivBeam.textContent.includes('para análise PSF...')) {
                if (elementFieldData3D && elementFieldData3D.length > 0) {
                    statusDivBeam.textContent = 'Dados E-field 3D carregados.';
                } else {
                    statusDivBeam.textContent = 'Falha ao carregar dados E-field 3D para análise.';
                }
            }
        } catch (error) {
            console.error("Main.js: Erro ao buscar dados 3D para PSFAnalyzer:", error);
            // psfAnalyzer.updateData lidará com dados nulos
        }
    }

    // Envia os dados (mesmo que nulos, para que o psfAnalyzer possa desabilitar a UI)
    window.psfAnalyzer.updateData(antennaCoords, elementFieldData3D, K_CONST);
}


function setupGlobalEventListeners() {
    window.addEventListener('themeChanged', () => {
        console.log('Evento global "themeChanged" recebido em main.js.');
        // Os módulos generator, beam_pattern e psf_analyzer (implicitamente pelo tema do navegador)
        // já devem lidar com a mudança de tema.
    });

    window.addEventListener('resize', () => {
        clearTimeout(resizeDebounceTimer);
        resizeDebounceTimer = setTimeout(() => {
             console.log('Janela redimensionada.');
             if (window.antennaGenerator?.resizeCanvas) {
                window.antennaGenerator.resizeCanvas();
             }
             // Plotly deve redimensionar automaticamente.
        }, 250);
    });

    // Listener para quando um novo layout é gerado por generator.js
    window.addEventListener('layoutGenerated', () => {
        console.log("Main.js: Evento 'layoutGenerated' recebido.");
        // Quando um novo layout é gerado, precisamos atualizar o PSFAnalyzer com
        // as novas coordenadas das antenas e potencialmente recarregar/revalidar os dados 3D.
        // A função handleNewLayout do psfAnalyzer já é chamada internamente por ele escutar o evento.
        // Mas precisamos garantir que ele tenha os dados mais recentes.
        updatePSFAnalyzerData();
    });

    console.log('Listeners globais configurados.');
}

function setupDarkMode() {
    // ... (código existente de setupDarkMode - sem alterações)
    const darkModeToggle = document.getElementById('dark-mode-toggle');
    if (!darkModeToggle) {
        console.warn("Toggle de modo escuro não encontrado no DOM.");
        return;
    }
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
        darkModeToggle.checked = true;
    } else {
         document.documentElement.removeAttribute('data-theme');
         darkModeToggle.checked = false;
    }
    darkModeToggle.addEventListener('change', function() {
        const newTheme = this.checked ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        console.log(`Tema alterado para: ${newTheme}`);
        window.dispatchEvent(new CustomEvent('themeChanged'));
    });
    console.log('Funcionalidade de Modo Escuro configurada.');
}

document.addEventListener('DOMContentLoaded', initApp);