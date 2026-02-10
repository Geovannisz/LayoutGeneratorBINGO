/**
 * tabs.js
 *
 * @fileoverview Gerenciamento do sistema de navegação por abas.
 * Controla a exibição e troca entre diferentes seções da aplicação.
 *
 * @author Geovanni Fernandes Garcia
 * @version 1.0.3
 */

'use strict';

/**
 * TabManager - Gerencia a navegação por abas da aplicação
 */
class TabManager {
    constructor() {
        this.currentTab = 'layout';
        this.tabs = {};
        this.initialized = false;
    }

    /**
     * Inicializa o sistema de abas
     */
    init() {
        if (this.initialized) return;

        // Registra todas as abas disponíveis
        this.registerTab('layout', 'Layout Principal', 'fas fa-th');
        this.registerTab('oskar-ini', 'Configuração OSKAR', 'fas fa-cog');
        this.registerTab('sky-model', 'Modelo de Céu', 'fas fa-star');
        this.registerTab('uv-coverage', 'Cobertura UV', 'fas fa-chart-scatter');

        // Configura event listeners
        this.setupEventListeners();

        // Mostra a primeira aba
        this.showTab('layout');

        this.initialized = true;
        console.log('TabManager inicializado com sucesso');
    }

    /**
     * Registra uma nova aba
     * @param {string} id - ID da aba
     * @param {string} title - Título da aba
     * @param {string} icon - Classe do ícone Font Awesome
     */
    registerTab(id, title, icon) {
        this.tabs[id] = {
            id: id,
            title: title,
            icon: icon,
            enabled: true
        };
    }

    /**
     * Configura os event listeners para as abas
     */
    setupEventListeners() {
        const tabButtons = document.querySelectorAll('.tab-button');
        tabButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                const tabId = button.getAttribute('data-tab');
                if (tabId) {
                    this.showTab(tabId);
                }
            });
        });
    }

    /**
     * Mostra uma aba específica
     * @param {string} tabId - ID da aba a ser mostrada
     */
    showTab(tabId) {
        if (!this.tabs[tabId]) {
            console.error(`Aba não encontrada: ${tabId}`);
            return;
        }

        // Atualiza botões de navegação
        const tabButtons = document.querySelectorAll('.tab-button');
        tabButtons.forEach(button => {
            const btnTabId = button.getAttribute('data-tab');
            if (btnTabId === tabId) {
                button.classList.add('active');
            } else {
                button.classList.remove('active');
            }
        });

        // Atualiza conteúdo das abas
        const tabContents = document.querySelectorAll('.tab-content');
        tabContents.forEach(content => {
            const contentTabId = content.getAttribute('data-tab-content');
            if (contentTabId === tabId) {
                content.classList.add('active');
                content.style.display = 'block';
            } else {
                content.classList.remove('active');
                content.style.display = 'none';
            }
        });

        this.currentTab = tabId;

        // Dispara evento customizado para outras partes da aplicação
        window.dispatchEvent(new CustomEvent('tabChanged', {
            detail: { tabId: tabId }
        }));

        console.log(`Aba ativada: ${tabId}`);
    }

    /**
     * Obtém a aba atual
     * @returns {string} ID da aba atual
     */
    getCurrentTab() {
        return this.currentTab;
    }

    /**
     * Habilita ou desabilita uma aba
     * @param {string} tabId - ID da aba
     * @param {boolean} enabled - Se a aba deve estar habilitada
     */
    setTabEnabled(tabId, enabled) {
        if (!this.tabs[tabId]) return;

        this.tabs[tabId].enabled = enabled;
        const button = document.querySelector(`.tab-button[data-tab="${tabId}"]`);
        if (button) {
            if (enabled) {
                button.removeAttribute('disabled');
                button.classList.remove('disabled');
            } else {
                button.setAttribute('disabled', 'true');
                button.classList.add('disabled');
            }
        }
    }
}

// Cria instância global
window.tabManager = new TabManager();
