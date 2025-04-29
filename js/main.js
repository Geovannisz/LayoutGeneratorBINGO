/**
 * Arquivo principal para inicialização e integração dos componentes da aplicação.
 */

// Debounce timer for resize events
let resizeDebounceTimer;

/**
 * Função principal de inicialização da aplicação.
 */
function initApp() {
    console.log('Inicializando aplicação...');
    // Use requestAnimationFrame for smoother initialization if needed, but setTimeout is often fine
    setTimeout(() => {
        checkComponentsAndSetup();
    }, 100);
}

/**
 * Verifica a disponibilidade dos componentes e configura a comunicação.
 */
function checkComponentsAndSetup() {
     let allComponentsReady = true;
     // ... (component checks remain the same) ...
     if (!window.BingoLayouts) { console.error('BingoLayouts lib not found!'); allComponentsReady = false; }
     if (!window.antennaGenerator) { console.error('Antenna generator not found!'); allComponentsReady = false; }
     if (!window.interactiveMap) { console.error('Interactive map not found!'); allComponentsReady = false; }
     if (!window.oskarExporter) { console.error('OSKAR exporter not found!'); allComponentsReady = false; }


     if (allComponentsReady) {
         console.log('Todos os componentes carregados!');
         setupComponentCommunication();
         setupDarkMode();
         setupThemeChangeListener();
         setupResizeListener(); // Add resize listener

         // Gera o layout inicial após um pequeno atraso
        if (window.antennaGenerator) {
            setTimeout(() => {
                console.log("Chamando generateLayout inicial (main.js)");
                window.antennaGenerator.resizeCanvas(); // Ensure correct size
                window.antennaGenerator.generateLayout(); // Generates layout AND dispatches 'layoutGenerated'

                // <<<--- REMOVIDO: O evento agora é disparado DENTRO de generateLayout --- >>>
                // console.log("Dispatching initial 'layoutGenerated' event (main.js)");
                // window.dispatchEvent(new CustomEvent('layoutGenerated')); // Trigger initial beam plot
                // <<<--- Fim da remoção --- >>>

            }, 150); // Slightly longer delay maybe needed
        }
     } else {
          console.error("Falha na inicialização de componentes.");
          // ... (error message display) ...
     }
}


/** Configura comunicação (event-based now primarily) */
function setupComponentCommunication() {
    console.log('Comunicação baseada em eventos está ativa.');
}

/** Configura modo escuro */
function setupDarkMode() {
    // ... (dark mode setup remains the same) ...
     const darkModeToggle = document.getElementById('dark-mode-toggle');
    if (!darkModeToggle) return;
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
        console.log(`Tema alterado para ${newTheme}`);
        console.log('Disparando evento themeChanged');
        window.dispatchEvent(new CustomEvent('themeChanged')); // Dispara o evento
    });
    console.log('Modo escuro configurado.');
}

/** Configura listener para mudança de tema (redesenha canvas layout) */
function setupThemeChangeListener() {
     window.addEventListener('themeChanged', () => {
        console.log('Evento themeChanged recebido em main.js');
        if (window.antennaGenerator?.drawLayout) {
            console.log('Redesenhando canvas do layout...');
            window.antennaGenerator.drawLayout();
            // Note: Beam pattern plot currently uses fixed Dracula theme colors
            // To make it theme-aware, plotBeamPattern would need updates
        }
    });
    console.log('Listener para themeChanged configurado.');
}

/** Configura listener para redimensionamento da janela (redesenha canvas layout) */
function setupResizeListener() {
    window.addEventListener('resize', () => {
        clearTimeout(resizeDebounceTimer);
        resizeDebounceTimer = setTimeout(() => {
             console.log('Janela redimensionada, atualizando canvas do layout...');
             if (window.antennaGenerator?.resizeCanvas) {
                window.antennaGenerator.resizeCanvas(); // Redraws layout canvas
             }
             // Optional: Trigger beam pattern replot if needed after resize,
             // though Plotly often handles responsive resize itself.
             // if (typeof generateBeamPatternPlot === 'function') {
             //    generateBeamPatternPlot();
             // }
        }, 250); // Debounce resize events
    });
     console.log('Listener para resize configurado.');
}

// --- Inicialização ---
document.addEventListener('DOMContentLoaded', initApp);