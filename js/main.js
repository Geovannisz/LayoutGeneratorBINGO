/**
 * main.js
 * Ponto de entrada principal da aplicação.
 * Inicializa todos os módulos, configura listeners de eventos globais
 * e coordena a comunicação entre os módulos.
 */

let resizeDebounceTimer;

function initApp() {
    console.log('Aplicação BINGO Layout Generator: Inicializando...');
    setTimeout(() => {
        checkComponentsAndSetup();
    }, 250);
}

function checkComponentsAndSetup() {
     let allComponentsReady = true;
     const missingComponents = [];

     if (!window.BingoLayouts) { missingComponents.push('BingoLayouts'); allComponentsReady = false; }
     if (!window.antennaGenerator) { missingComponents.push('AntennaLayoutGenerator'); allComponentsReady = false; }
     if (!window.interactiveMap) { missingComponents.push('InteractiveMap'); allComponentsReady = false; }
     if (!window.oskarExporter) { missingComponents.push('OskarLayoutExporter'); allComponentsReady = false; }
     if (!window.psfAnalyzer) { missingComponents.push('PSFAnalyzer'); allComponentsReady = false; }


     if (allComponentsReady) {
         console.log('Todos os componentes principais foram carregados com sucesso!');
         setupGlobalEventListeners();
         setupDarkMode();

         if (window.antennaGenerator) {
            console.log("Chamando geração de layout inicial a partir de main.js...");
            window.antennaGenerator.resizeCanvas();
            window.antennaGenerator.generateLayout();
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
async function updatePSFAnalyzerData() { // Tornada async para aguardar o carregamento dos dados 3D
    if (!window.psfAnalyzer || typeof window.psfAnalyzer.updateData !== 'function') {
        console.warn("PSFAnalyzer não está pronto para receber dados.");
        return;
    }

    const antennaCoords = window.antennaGenerator ? window.antennaGenerator.getAllAntennas() : [];
    let K_CONST_val = null; // Renomeado para evitar conflito com K_CONST de beam_pattern
    let eFieldData3D_val = null; // Renomeado para evitar conflito

    // Tenta obter dados do módulo beam_pattern
    // Primeiro, tenta pegar K_CONST, que não depende de fetch
    if (typeof getBeamPatternModuleData === 'function') {
        const beamDataInitial = getBeamPatternModuleData();
        K_CONST_val = beamDataInitial.K_CONST;
        eFieldData3D_val = beamDataInitial.parsedEFieldData3D; // Pega o cache atual
    } else if (window.beamPattern && typeof window.beamPattern.getModuleData === 'function') {
        const beamDataInitial = window.beamPattern.getModuleData();
        K_CONST_val = beamDataInitial.K_CONST;
        eFieldData3D_val = beamDataInitial.parsedEFieldData3D;
    }

    // Se os dados 3D não estiverem carregados ainda (eFieldData3D_val é null ou vazio),
    // ou se o estado de carregamento indicar que não foi carregado ou deu erro, tenta carregar.
    let needsToLoad3DData = !eFieldData3D_val || eFieldData3D_val.length === 0;
    if (typeof fullEFieldDataLoadingState !== 'undefined') { // fullEFieldDataLoadingState é de beam_pattern.js
        needsToLoad3DData = needsToLoad3DData || (fullEFieldDataLoadingState !== 'loaded');
    }


    if (needsToLoad3DData && typeof ensureFullEFieldData3DLoaded === 'function') { // ensureFullEFieldData3DLoaded é de beam_pattern.js
        console.log("Main.js: Dados 3D não carregados ou estado não 'loaded', tentando buscar/garantir para análise PSF...");
        try {
            // ensureFullEFieldData3DLoaded já atualiza o statusDiv em beam_pattern.js
            eFieldData3D_val = await ensureFullEFieldData3DLoaded(); // Aguarda o carregamento
            console.log("Main.js: Dados 3D carregados/garantidos para PSFAnalyzer.");
        } catch (error) {
            console.error("Main.js: Erro ao buscar/garantir dados 3D para PSFAnalyzer:", error);
            // eFieldData3D_val permanecerá null ou com o valor anterior (se houver)
            // O psfAnalyzer.updateData lidará com dados nulos
        }
    } else if (eFieldData3D_val && eFieldData3D_val.length > 0) {
        console.log("Main.js: Usando dados 3D já cacheados para PSFAnalyzer.");
    }


    // Envia os dados (mesmo que eFieldData3D_val seja null após uma falha de fetch)
    window.psfAnalyzer.updateData(antennaCoords, eFieldData3D_val, K_CONST_val);
}


function setupGlobalEventListeners() {
    window.addEventListener('themeChanged', () => {
        console.log('Evento global "themeChanged" recebido em main.js.');
    });

    window.addEventListener('resize', () => {
        clearTimeout(resizeDebounceTimer);
        resizeDebounceTimer = setTimeout(() => {
             console.log('Janela redimensionada.');
             if (window.antennaGenerator?.resizeCanvas) {
                window.antennaGenerator.resizeCanvas();
             }
        }, 250);
    });

    window.addEventListener('layoutGenerated', async () => { // Tornada async
        console.log("Main.js: Evento 'layoutGenerated' recebido.");
        // Quando um novo layout é gerado, precisamos atualizar o PSFAnalyzer.
        // A função updatePSFAnalyzerData agora é async e vai aguardar ensureFullEFieldData3DLoaded se necessário.
        await updatePSFAnalyzerData();
    });

    // Adiciona um listener para quando os dados 3D forem carregados com sucesso pelo beam_pattern
    // Isso pode ser redundante se layoutGenerated sempre acionar updatePSFAnalyzerData corretamente,
    // mas pode ajudar em cenários onde os dados 3D são carregados independentemente (ex: pelo botão 3D).
    window.addEventListener('beamData3DLoaded', async () => {
        console.log("Main.js: Evento 'beamData3DLoaded' recebido.");
        await updatePSFAnalyzerData();
    });


    console.log('Listeners globais configurados.');
}

function setupDarkMode() {
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