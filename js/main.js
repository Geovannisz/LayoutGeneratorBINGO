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
    }, 250); // Aumenta um pouco o timeout para garantir que todos os scripts carreguem
}

function checkComponentsAndSetup() {
     let allComponentsReady = true;
     const missingComponents = [];

     if (!window.BingoLayouts) { missingComponents.push('BingoLayouts'); allComponentsReady = false; }
     if (!window.antennaGenerator) { missingComponents.push('AntennaLayoutGenerator'); allComponentsReady = false; }
     if (!window.interactiveMap) { missingComponents.push('InteractiveMap'); allComponentsReady = false; }
     if (!window.oskarExporter) { missingComponents.push('OskarLayoutExporter'); allComponentsReady = false; }
     if (!window.psfAnalyzer) { missingComponents.push('PSFAnalyzer'); allComponentsReady = false; }
     // Adiciona verificação para o novo plotter
     if (!window.psfEeThetaPlotter) { missingComponents.push('PSFEeThetaPlotter'); allComponentsReady = false; }


     if (allComponentsReady) {
         console.log('Todos os componentes principais foram carregados com sucesso!');
         setupGlobalEventListeners();
         setupDarkMode();

         if (window.antennaGenerator) {
            console.log("Chamando geração de layout inicial a partir de main.js...");
            window.antennaGenerator.resizeCanvas(); // Garante que o canvas tenha o tamanho certo
            window.antennaGenerator.generateLayout(); // Gera o layout inicial
        }
     } else {
          console.error("Falha na inicialização: Componentes ausentes:", missingComponents);
          alert(`Erro crítico: Falha ao carregar componentes (${missingComponents.join(', ')}). A página pode não funcionar corretamente.`);
     }
}

/**
 * Atualiza o PSFAnalyzer e o novo PSFEeThetaPlotter com os dados necessários.
 */
async function updatePSFModulesData() {
    const antennaCoords = window.antennaGenerator ? window.antennaGenerator.getAllAntennas() : [];
    let K_CONST_val = null;
    let eFieldData3D_val = null;

    // Tenta obter K_CONST e eFieldData3D cacheados do beam_pattern.js
    if (typeof getBeamPatternModuleData === 'function') {
        const beamData = getBeamPatternModuleData();
        K_CONST_val = beamData.K_CONST;
        eFieldData3D_val = beamData.parsedEFieldData3D;
    }

    // Se eFieldData3D não estiver carregado, tenta carregar
    let needsToLoad3DData = !eFieldData3D_val || eFieldData3D_val.length === 0;
    if (typeof fullEFieldDataLoadingState !== 'undefined') { // de beam_pattern.js
        needsToLoad3DData = needsToLoad3DData || (fullEFieldDataLoadingState !== 'loaded');
    }

    if (needsToLoad3DData && typeof ensureFullEFieldData3DLoaded === 'function') {
        console.log("Main.js: Dados E-Field 3D não carregados/prontos. Buscando...");
        try {
            eFieldData3D_val = await ensureFullEFieldData3DLoaded();
            console.log("Main.js: Dados E-Field 3D carregados/garantidos.");
        } catch (error) {
            console.error("Main.js: Erro ao buscar/garantir dados E-Field 3D:", error);
            // Os módulos de PSF lidarão com eFieldData3D_val sendo null
        }
    }

    // Atualiza PSFAnalyzer
    if (window.psfAnalyzer && typeof window.psfAnalyzer.updateData === 'function') {
        window.psfAnalyzer.updateData(antennaCoords, eFieldData3D_val, K_CONST_val);
    } else {
        console.warn("PSFAnalyzer ou sua função updateData não está pronta.");
    }

    // Atualiza PSFEeThetaPlotter
    if (window.psfEeThetaPlotter && typeof window.psfEeThetaPlotter.updateCoreData === 'function') {
        window.psfEeThetaPlotter.updateCoreData(antennaCoords, eFieldData3D_val, K_CONST_val);
    } else {
        console.warn("PSFEeThetaPlotter ou sua função updateCoreData não está pronta.");
    }
}


function setupGlobalEventListeners() {
    window.addEventListener('themeChanged', () => {
        console.log('Evento global "themeChanged" recebido em main.js.');
        // Outros módulos podem ouvir isso diretamente, se necessário para redesenhar seus próprios plots.
        // Ex: antennaGenerator já redesenha seu canvas.
        // Plotly graphs são atualizados por seus respectivos módulos (beam_pattern, psf_ee_theta_plot)
        // ao receberem o evento ou ao serem redesenhados explicitamente.
    });

    window.addEventListener('resize', () => {
        clearTimeout(resizeDebounceTimer);
        resizeDebounceTimer = setTimeout(() => {
             console.log('Janela redimensionada.');
             if (window.antennaGenerator?.resizeCanvas) {
                window.antennaGenerator.resizeCanvas(); // O gerador redesenha seu canvas
             }
             // Plotly graphs com responsive: true devem se ajustar, mas podemos forçar um resize se necessário
             // Ex: Plotly.Plots.resize('beam-pattern-plot'); Plotly.Plots.resize('psf-ee-theta-plot');
        }, 250);
    });

    // Quando um novo layout é gerado
    window.addEventListener('layoutGenerated', async () => {
        console.log("Main.js: Evento 'layoutGenerated' recebido.");
        // Atualiza os dados para os módulos PSF.
        // Isso pode acionar o carregamento de dados E-field 3D se ainda não estiverem carregados.
        await updatePSFModulesData();
    });

    // Quando os dados 3D do padrão de feixe são carregados com sucesso
    window.addEventListener('beamData3DLoaded', async () => {
        console.log("Main.js: Evento 'beamData3DLoaded' recebido.");
        // Garante que os módulos PSF tenham os dados E-field 3D mais recentes.
        await updatePSFModulesData();
    });
    
    // Listener para quando o volume total da PSF é calculado pelo PSFAnalyzer
    window.addEventListener('psfTotalVolumeCalculated', (event) => {
        console.log("Main.js: Evento 'psfTotalVolumeCalculated' recebido.", event.detail);
        if (window.psfEeThetaPlotter && typeof window.psfEeThetaPlotter.updateCoreData === 'function') {
            // Passa todos os dados novamente, incluindo o volume total atualizado.
            // updatePSFModulesData() já teria sido chamado, mas aqui garantimos que o totalPSFVolume
            // no psfEeThetaPlotter seja explicitamente atualizado se ele depende desse evento.
            // No entanto, a lógica atual de psfEeThetaPlotter.triggerPlotGeneration()
            // já busca o volume de psfAnalyzer.cachedTotalPSFVolume, então
            // este listener em main.js para este evento específico pode não ser estritamente necessário
            // para o EE(Theta) plotter, mas é bom para logar.
            // Apenas para garantir que o plotter tenha o volume mais recente, se ele o armazenar:
            if (window.psfEeThetaPlotter.currentLayoutData && event.detail && typeof event.detail.totalVolume === 'number') {
                 window.psfEeThetaPlotter.currentLayoutData.totalPSFVolume = event.detail.totalVolume;
                 // Reavalia se o botão de gerar curva EE(Theta) deve ser habilitado
                 if (window.psfEeThetaPlotter._hasRequiredDataForCurve && window.psfEeThetaPlotter._hasRequiredDataForCurve() && !window.psfEeThetaPlotter.isCalculating) {
                    window.psfEeThetaPlotter.generatePlotBtn.disabled = false;
                    window.psfEeThetaPlotter._updateStatus('Pronto para gerar curva EE(Θ).');
                 }
            }
        }
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