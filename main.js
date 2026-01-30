/**
 * main.js (Electron)
 *
 * @fileoverview Ponto de entrada do aplicativo Electron.
 * Gerencia a criação de janelas, ciclo de vida da aplicação e atualizações automáticas.
 *
 * @author Geovanni Fernandes Garcia
 * @version 1.0.2
 */

'use strict';

const { app, BrowserWindow, Menu, shell } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');

/** @type {BrowserWindow|null} */
let mainWindow = null;

/**
 * Cria a janela principal do navegador.
 * @returns {void}
 */
function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        minWidth: 800,
        minHeight: 600,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true
        },
        icon: path.join(__dirname, 'favicon.ico'),
        title: 'BINGO Layout Generator',
        show: false // Mostra apenas quando estiver pronto
    });

    // Carrega o index.html da aplicação
    mainWindow.loadFile('index.html');

    // Mostra a janela quando estiver pronta para evitar flash branco
    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });

    // Abre links externos no navegador padrão
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url);
        return { action: 'deny' };
    });

    // Limpa a referência quando a janela é fechada
    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

/**
 * Configura o auto-updater com tratamento de erros.
 * @returns {void}
 */
function setupAutoUpdater() {
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;

    autoUpdater.on('error', (error) => {
        console.error('Auto-updater error:', error);
    });

    autoUpdater.on('update-available', (info) => {
        console.log('Update available:', info.version);
    });

    autoUpdater.on('update-not-available', () => {
        console.log('No updates available');
    });

    // Verifica atualizações silenciosamente
    autoUpdater.checkForUpdatesAndNotify().catch((err) => {
        console.error('Failed to check for updates:', err);
    });
}

// Este método será chamado quando o Electron tiver finalizado
// a inicialização e estiver pronto para criar janelas do navegador.
app.whenReady().then(() => {
    createWindow();
    setupAutoUpdater();

    app.on('activate', () => {
        // No macOS, é comum recriar uma janela no aplicativo quando o
        // ícone do dock é clicado e não há outras janelas abertas.
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

// Encerra o aplicativo quando todas as janelas forem fechadas, exceto no macOS.
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// Segurança: previne navegação para URLs externas na janela principal
app.on('web-contents-created', (event, contents) => {
    contents.on('will-navigate', (event, navigationUrl) => {
        const parsedUrl = new URL(navigationUrl);
        if (parsedUrl.protocol !== 'file:') {
            event.preventDefault();
        }
    });
});

// Remove o menu padrão para um visual mais limpo
Menu.setApplicationMenu(null);
