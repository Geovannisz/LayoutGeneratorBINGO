/**
 * preload.js (Electron)
 *
 * @fileoverview Script de preload para o Electron.
 * É executado em um contexto de renderer isolado antes que o conteúdo da página seja carregado.
 * Boas práticas de segurança do Electron recomendam ter este arquivo para expor APIs seguras.
 *
 * @author Geovanni Fernandes Garcia
 * @version 1.0.2
 */

'use strict';

// Este arquivo é intencionalmente mantido mínimo por razões de segurança.
// APIs específicas podem ser expostas aqui via contextBridge se necessário.
//
// Exemplo de como expor uma API segura:
//
// const { contextBridge, ipcRenderer } = require('electron');
//
// contextBridge.exposeInMainWorld('electronAPI', {
//     getVersion: () => process.versions.electron,
//     onUpdateAvailable: (callback) => ipcRenderer.on('update-available', callback)
// });
