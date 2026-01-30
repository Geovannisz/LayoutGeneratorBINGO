# 🔧 Guia de Build - BINGO Layout Generator

Guia completo para compilar e executar a aplicação desktop do BINGO Layout Generator.

---

## 📋 Pré-requisitos

| Software | Descrição | Download |
|----------|-----------|----------|
| **Node.js** | Runtime JavaScript (inclui npm) | [nodejs.org](https://nodejs.org/) (versão LTS) |
| **Git** | Controle de versão | [git-scm.com](https://git-scm.com/downloads) |

---

## 🐧 Linux

### Instalar pré-requisitos

```bash
# Ubuntu/Debian
sudo apt update
sudo apt install -y nodejs npm git

# Fedora
sudo dnf install -y nodejs npm git

# Arch Linux
sudo pacman -S nodejs npm git
```

### Clonar, instalar e executar

```bash
# Clonar o repositório
git clone https://github.com/Geovannisz/LayoutGeneratorBINGO
cd LayoutGeneratorBINGO

# Instalar dependências
npm install

# Executar em modo de desenvolvimento
npm start

# Compilar instalador (.AppImage e .deb)
npm run dist:linux
```

Os arquivos gerados estarão na pasta `release/`.

---

## 🍎 macOS

### Instalar pré-requisitos

```bash
# Usando Homebrew (recomendado)
brew install node git

# Ou baixe manualmente:
# Node.js: https://nodejs.org/
# Git: https://git-scm.com/downloads
```

### Clonar, instalar e executar

```bash
# Clonar o repositório
git clone https://github.com/Geovannisz/LayoutGeneratorBINGO
cd LayoutGeneratorBINGO

# Instalar dependências
npm install

# Executar em modo de desenvolvimento
npm start

# Compilar instalador (.dmg)
npm run dist:mac
```

Os arquivos gerados estarão na pasta `release/`.

---

## 🪟 Windows

### Instalar pré-requisitos

1. Baixe e instale o [Node.js](https://nodejs.org/) (versão LTS)
2. Baixe e instale o [Git](https://git-scm.com/downloads)

### Clonar, instalar e executar

Abra o **PowerShell** ou **Prompt de Comando**:

```bash
# Clonar o repositório
git clone https://github.com/Geovannisz/LayoutGeneratorBINGO
cd LayoutGeneratorBINGO

# Instalar dependências
npm install

# Executar em modo de desenvolvimento
npm start

# Compilar instalador (.exe)
npm run dist:win
```

Os arquivos gerados estarão na pasta `release/`.

---

## 📁 Estrutura de Build

| Comando | Descrição |
|---------|-----------|
| `npm start` | Executa em modo de desenvolvimento |
| `npm run dist` | Compila para o sistema atual |
| `npm run dist:linux` | Compila para Linux (.AppImage, .deb) |
| `npm run dist:mac` | Compila para macOS (.dmg) |
| `npm run dist:win` | Compila para Windows (.exe) |

---

## ❓ Problemas comuns

**Erro de permissão no Linux/macOS:**
```bash
sudo chown -R $USER ~/.npm
```

**Node.js desatualizado:**
```bash
# Linux/macOS - instalar Node Version Manager (nvm)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install --lts
```

**Limpar cache e reinstalar:**
```bash
rm -rf node_modules package-lock.json
npm install
```
