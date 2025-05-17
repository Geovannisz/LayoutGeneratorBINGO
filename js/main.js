/**
 * main.js
 *
 * Arquivo principal para inicialização e coordenação dos componentes da aplicação
 * Gerador de Layouts de Antenas BINGO.
 *
 * Responsabilidades:
 * - Inicializar a aplicação após o carregamento do DOM.
 * - Verificar a disponibilidade de todos os módulos JS necessários.
 * - Configurar a comunicação e listeners de eventos globais (mudança de tema, redimensionamento).
 * - Gerenciar o modo escuro/claro.
 * - Disparar a geração do layout inicial.
 */

// Timer para debounce de eventos de redimensionamento da janela.
let resizeDebounceTimer;

/**
 * Função principal de inicialização da aplicação.
 * Chamada quando o DOM está completamente carregado.
 */
function initApp() {
    console.log('Aplicação BINGO Layout Generator: Inicializando...');

    // Pequeno atraso para garantir que todos os scripts (especialmente os de bibliotecas externas)
    // tenham tido tempo de carregar e executar completamente antes de tentarmos usá-los.
    setTimeout(() => {
        checkComponentsAndSetup();
    }, 150); // Aumentado ligeiramente para maior robustez em conexões lentas.
}

/**
 * Verifica a disponibilidade dos componentes principais da aplicação
 * e, se todos estiverem prontos, configura a comunicação e listeners.
 */
function checkComponentsAndSetup() {
     let allComponentsReady = true;
     const missingComponents = [];

     // Verifica cada módulo/componente essencial.
     if (!window.BingoLayouts) { missingComponents.push('BingoLayouts (bingo_layouts.js)'); allComponentsReady = false; }
     if (!window.antennaGenerator) { missingComponents.push('AntennaLayoutGenerator (generator.js)'); allComponentsReady = false; }
     if (!window.interactiveMap) { missingComponents.push('InteractiveMap (map.js)'); allComponentsReady = false; }
     if (!window.oskarExporter) { missingComponents.push('OskarLayoutExporter (export.js)'); allComponentsReady = false; }
     // O módulo beam_pattern.js é inicializado via 'DOMContentLoaded' e não expõe um objeto global principal,
     // mas suas funções são chamadas por eventos ou por outros módulos. Sua ausência seria notada
     // por erros quando suas funcionalidades fossem invocadas.

     if (allComponentsReady) {
         console.log('Todos os componentes principais foram carregados com sucesso!');
         // Configura listeners de eventos globais e outras funcionalidades.
         setupGlobalEventListeners();
         setupDarkMode();
         
         // Gera o layout inicial e dispara o primeiro cálculo de padrão de feixe.
         // O próprio antennaGenerator.generateLayout() agora dispara o evento 'layoutGenerated'.
         if (window.antennaGenerator) {
            console.log("Chamando geração de layout inicial a partir de main.js...");
            window.antennaGenerator.resizeCanvas(); // Garante que o canvas tenha o tamanho correto.
            window.antennaGenerator.generateLayout(); // Gera o layout e dispara 'layoutGenerated'.
        }
     } else {
          console.error("Falha na inicialização: Um ou mais componentes essenciais não foram carregados:", missingComponents);
          // Poderia exibir uma mensagem mais proeminente para o usuário aqui.
          alert(`Erro crítico: Falha ao carregar componentes essenciais da aplicação (${missingComponents.join(', ')}). Algumas funcionalidades podem não estar disponíveis. Verifique o console para mais detalhes.`);
     }
}

/**
 * Configura listeners de eventos globais, como mudança de tema e redimensionamento da janela.
 */
function setupGlobalEventListeners() {
    // Listener para mudança de tema (claro/escuro)
    // Disparado pelo toggle de modo escuro.
    window.addEventListener('themeChanged', () => {
        console.log('Evento global "themeChanged" recebido em main.js.');
        // O módulo `generator.js` já tem seu próprio listener para `themeChanged`
        // para redesenhar o canvas do layout.
        // O módulo `beam_pattern.js` também escuta `themeChanged` para redesenhar o gráfico.
    });
    console.log('Listener global para "themeChanged" configurado (outros módulos podem escutá-lo).');

    // Listener para redimensionamento da janela (com debounce)
    window.addEventListener('resize', () => {
        clearTimeout(resizeDebounceTimer);
        resizeDebounceTimer = setTimeout(() => {
             console.log('Janela redimensionada. Atualizando componentes sensíveis ao tamanho.');
             // O gerador de layout (canvas) precisa ser redimensionado e redesenhado.
             if (window.antennaGenerator?.resizeCanvas) {
                window.antennaGenerator.resizeCanvas();
             }
             // Plotly geralmente lida com responsividade, mas um `Plotly.Plots.resize(plotDivId)`
             // poderia ser chamado aqui se necessário, dentro do módulo beam_pattern.js
             // ou via um evento 'windowResized' se múltiplos componentes precisassem reagir.
             // Por ora, o `autosize: true` do Plotly e o `responsive: true` na config devem ser suficientes.
        }, 250); // Atraso de 250ms para debounce.
    });
    console.log('Listener global para "resize" com debounce configurado.');
}

/**
 * Configura a funcionalidade de modo escuro/claro.
 * Lê a preferência do localStorage e adiciona listener ao toggle.
 */
function setupDarkMode() {
    const darkModeToggle = document.getElementById('dark-mode-toggle');
    if (!darkModeToggle) {
        console.warn("Toggle de modo escuro não encontrado no DOM.");
        return;
    }

    // Verifica se há um tema salvo no localStorage.
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
        darkModeToggle.checked = true;
    } else {
         // Default para tema claro se nada salvo ou se 'light'.
         document.documentElement.removeAttribute('data-theme');
         darkModeToggle.checked = false;
    }

    // Adiciona listener para o evento 'change' do toggle.
    darkModeToggle.addEventListener('change', function() {
        const newTheme = this.checked ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme); // Salva a preferência.
        console.log(`Tema alterado para: ${newTheme}`);
        // Dispara um evento global para que outros componentes possam reagir.
        window.dispatchEvent(new CustomEvent('themeChanged'));
    });
    console.log('Funcionalidade de Modo Escuro configurada.');
}

// --- Ponto de Entrada da Aplicação ---
// Adiciona listener para iniciar `initApp` quando o DOM estiver completamente carregado.
document.addEventListener('DOMContentLoaded', initApp);