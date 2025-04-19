/**
 * Arquivo principal para inicialização e integração dos componentes da aplicação.
 */

/**
 * Função principal de inicialização da aplicação.
 * Chamada quando o DOM está pronto.
 */
function initApp() {
    console.log('Inicializando aplicação...');

    // Verifica se os componentes principais estão disponíveis no objeto window
    // Adiciona um pequeno delay para dar tempo aos outros scripts de inicializarem,
    // especialmente se houver código assíncrono neles.
    setTimeout(() => {
        checkComponentsAndSetup();
    }, 100); // Espera 100ms

}

/**
 * Verifica a disponibilidade dos componentes e configura a comunicação.
 */
function checkComponentsAndSetup() {
     let allComponentsReady = true;

    if (!window.BingoLayouts) {
        console.error('Biblioteca BingoLayouts (bingo_layouts.js) não encontrada!');
        allComponentsReady = false;
        // Poderia exibir uma mensagem para o usuário aqui
        // alert("Erro: Falha ao carregar a biblioteca de layouts.");
    }

    if (!window.antennaGenerator) {
        console.error('Gerador de antenas (generator.js) não encontrado ou inicializado!');
        allComponentsReady = false;
         // alert("Erro: Falha ao carregar o gerador de layouts.");
    }

    if (!window.interactiveMap) {
        console.error('Mapa interativo (map.js) não encontrado ou inicializado!');
         allComponentsReady = false;
         // alert("Erro: Falha ao carregar o mapa interativo.");
    }

    // Verifica o nome correto do exportador
    if (!window.oskarExporter) { // Verifica o nome correto da instância
        console.error('Exportador de layout OSKAR (export.js) não encontrado ou inicializado!');
         allComponentsReady = false;
         // alert("Erro: Falha ao carregar o módulo de exportação.");
    }

     if (allComponentsReady) {
         console.log('Todos os componentes carregados com sucesso!');
         // Configura a comunicação entre componentes (se necessário além das chamadas globais)
         setupComponentCommunication();
         // Inicializa o modo escuro
         setupDarkMode();
         // Configura o listener para redesenhar o canvas no tema alterado
         setupThemeChangeListener(); // <-- Nova chamada
     } else {
          console.error("Aplicação não pôde ser inicializada completamente devido a componentes ausentes.");
          // Informa o usuário que algo deu errado
          const header = document.querySelector('header');
          if (header) {
               const errorMsg = document.createElement('p');
               errorMsg.textContent = "Erro ao carregar alguns componentes da página. Funcionalidades podem estar indisponíveis. Verifique o console (F12).";
               errorMsg.style.color = 'red';
               errorMsg.style.textAlign = 'center';
               header.parentNode.insertBefore(errorMsg, header.nextSibling);
          }
     }
}


/**
 * Configura a comunicação entre os componentes (se necessário).
 * Atualmente, a comunicação principal é feita através da função
 * global `window.updateExportFields`, chamada pelo gerador e pelo mapa.
 */
function setupComponentCommunication() {
    // A comunicação principal é feita via funções globais e agora, eventos ('themeChanged').
    console.log('Comunicação entre componentes (via updateExportFields e eventos) está ativa.');
}

/**
 * Configura a funcionalidade de alternância do modo escuro.
 * Lê a preferência do localStorage e adiciona o event listener ao toggle.
 * Dispara um evento 'themeChanged' quando o tema é alterado.
 */
function setupDarkMode() {
    const darkModeToggle = document.getElementById('dark-mode-toggle');
    if (!darkModeToggle) {
         console.warn("Toggle de modo escuro não encontrado.");
         return;
    }

    // Verifica preferência salva no localStorage
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
        darkModeToggle.checked = true;
    } else {
         // Garante que o tema claro seja aplicado se não houver preferência salva ou for 'light'
         document.documentElement.removeAttribute('data-theme');
         darkModeToggle.checked = false;
    }

    // Adiciona listener para alternar o tema
    darkModeToggle.addEventListener('change', function() {
        if (this.checked) {
            document.documentElement.setAttribute('data-theme', 'dark');
            localStorage.setItem('theme', 'dark');
            console.log('Tema alterado para Escuro');
        } else {
            document.documentElement.removeAttribute('data-theme');
            localStorage.setItem('theme', 'light'); // Salva explicitamente como light
            console.log('Tema alterado para Claro');
        }
        // Dispara um evento customizado para que outros componentes (mapa, canvas) possam reagir
        console.log('Disparando evento themeChanged');
        window.dispatchEvent(new CustomEvent('themeChanged')); // <-- Dispara o evento
    });

    console.log('Modo escuro configurado!');
}

/**
 * Configura o listener global que reage à mudança de tema.
 * Este listener chamará a função de redesenho do gerador de layout.
 */
function setupThemeChangeListener() {
    window.addEventListener('themeChanged', () => {
        console.log('Evento themeChanged recebido em main.js');
        // Verifica se o gerador de antenas existe e tem o método drawLayout
        if (window.antennaGenerator && typeof window.antennaGenerator.drawLayout === 'function') {
            console.log('Chamando antennaGenerator.drawLayout() para atualizar cores...');
            // Chama o método para redesenhar o canvas com as novas cores do tema
            window.antennaGenerator.drawLayout();
        } else {
            console.warn('Instância antennaGenerator ou método drawLayout não encontrado para redesenhar no tema.');
        }
    });
    console.log('Listener para themeChanged configurado.');
}


// --- Inicialização ---
// Garante que a inicialização só ocorra após o DOM estar completamente carregado
document.addEventListener('DOMContentLoaded', initApp);