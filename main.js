const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');

function createWindow() {
  // Cria a janela do navegador.
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    icon: path.join(__dirname, 'favicon.ico')
  });

  // Carrega o index.html da sua aplicação.
  mainWindow.loadFile('index.html');

  // Opcional: Abre as ferramentas de desenvolvedor (DevTools).
  // mainWindow.webContents.openDevTools();
}

// Este método será chamado quando o Electron tiver finalizado
// a inicialização e estiver pronto para criar janelas do navegador.
app.whenReady().then(() => {
  createWindow();

  app.on('activate', function () {
    // No macOS, é comum recriar uma janela no aplicativo quando o
    // ícone do dock é clicado e não há outras janelas abertas.
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Encerra o aplicativo quando todas as janelas forem fechadas, exceto no macOS.
app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

// Cria um arquivo de preload vazio para conformidade com as boas práticas de segurança do Electron.
const fs = require('fs');
if (!fs.existsSync(path.join(__dirname, 'preload.js'))) {
    fs.writeFileSync(path.join(__dirname, 'preload.js'), '// Este arquivo é necessário para o Context Isolation do Electron.', 'utf-8');
}

// Remove o menu padrão para um visual mais limpo
Menu.setApplicationMenu(null);
