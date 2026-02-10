/**
 * tabs.js
 *
 * @fileoverview Módulo de gerenciamento de navegação por abas para o BINGO Layout Generator.
 *
 * @description Gerencia a navegação entre as abas da aplicação:
 * - Layout Principal (tab-layout)
 * - Configuração OSKAR (tab-oskar-config)
 * - Modelo de Céu (tab-sky-model)
 * - Cobertura UV (tab-uv-coverage)
 *
 * Utiliza arquitetura orientada a eventos com eventos customizados 'tabChanged',
 * suporte a navegação por teclado e troca programática de abas.
 *
 * @author Geovanni Fernandes Garcia
 * @version 1.0.2
 */

'use strict';

class TabManager {
    /**
     * Cria uma instância do TabManager.
     * Inicializa os botões de aba, painéis de conteúdo e configura os event listeners.
     */
    constructor() {
        /** @type {NodeListOf<HTMLElement>} */
        this.tabButtons = document.querySelectorAll('.tab-btn');

        /** @type {NodeListOf<HTMLElement>} */
        this.tabPanels = document.querySelectorAll('.tab-content');

        /** @type {string|null} ID da aba ativa atual */
        this.activeTabId = null;

        /** @type {string[]} Lista ordenada de IDs de abas para navegação por teclado */
        this.tabIds = [
            'tab-layout',
            'tab-oskar-config',
            'tab-sky-model',
            'tab-uv-coverage'
        ];

        this.init();
    }

    /**
     * Inicializa o gerenciador de abas.
     * Configura os listeners de clique e teclado, e ativa a primeira aba.
     */
    init() {
        this.tabButtons.forEach((btn) => {
            btn.addEventListener('click', () => {
                const tabId = btn.getAttribute('data-tab');
                if (tabId) {
                    this.switchToTab(tabId);
                }
            });

            btn.addEventListener('keydown', (e) => {
                this.handleKeyDown(e);
            });
        });

        // Ativa a primeira aba disponível
        const initialTab = this.findInitialTab();
        if (initialTab) {
            this.switchToTab(initialTab);
        }
    }

    /**
     * Determina a aba inicial a ser ativada.
     * Usa a aba já marcada como ativa ou a primeira da lista.
     * @returns {string|null} ID da aba inicial
     */
    findInitialTab() {
        const activeBtn = document.querySelector('.tab-btn.active');
        if (activeBtn) {
            const tabId = activeBtn.getAttribute('data-tab');
            if (tabId) {
                return tabId;
            }
        }
        return this.tabIds[0] || null;
    }

    /**
     * Troca para a aba especificada pelo ID.
     * Atualiza as classes ativas nos botões e painéis, e dispara o evento 'tabChanged'.
     * @param {string} tabId - ID do painel de conteúdo da aba destino
     */
    switchToTab(tabId) {
        if (tabId === this.activeTabId) {
            return;
        }

        const targetBtn = document.querySelector(`.tab-btn[data-tab="${tabId}"]`);
        const targetPanel = document.getElementById(tabId);

        if (!targetBtn || !targetPanel) {
            console.warn(`TabManager: aba "${tabId}" não encontrada.`);
            return;
        }

        const previousTabId = this.activeTabId;

        // Remove classe ativa de todos os botões e painéis
        this.tabButtons.forEach((btn) => btn.classList.remove('active'));
        this.tabPanels.forEach((panel) => panel.classList.remove('active'));

        // Ativa o botão e painel selecionados
        targetBtn.classList.add('active');
        targetPanel.classList.add('active');

        this.activeTabId = tabId;

        // Dispara evento customizado
        document.dispatchEvent(new CustomEvent('tabChanged', {
            detail: {
                tabId: tabId,
                previousTabId: previousTabId
            }
        }));
    }

    /**
     * Manipula a navegação por teclado entre as abas.
     * Setas esquerda/direita movem entre abas adjacentes.
     * Home/End movem para a primeira/última aba.
     * @param {KeyboardEvent} e - Evento de teclado
     */
    handleKeyDown(e) {
        const currentIndex = this.tabIds.indexOf(this.activeTabId);
        if (currentIndex === -1) {
            return;
        }

        let newIndex = -1;

        switch (e.key) {
            case 'ArrowRight':
            case 'ArrowDown':
                newIndex = (currentIndex + 1) % this.tabIds.length;
                break;
            case 'ArrowLeft':
            case 'ArrowUp':
                newIndex = (currentIndex - 1 + this.tabIds.length) % this.tabIds.length;
                break;
            case 'Home':
                newIndex = 0;
                break;
            case 'End':
                newIndex = this.tabIds.length - 1;
                break;
            default:
                return;
        }

        e.preventDefault();
        this.switchToTab(this.tabIds[newIndex]);

        // Move o foco para o botão da nova aba
        const newBtn = document.querySelector(`.tab-btn[data-tab="${this.tabIds[newIndex]}"]`);
        if (newBtn) {
            newBtn.focus();
        }
    }
}

// === Instanciação e Exportação Global ===
if (typeof window !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
        if (!window.tabManager) {
            window.tabManager = new TabManager();
        }
    });
}
