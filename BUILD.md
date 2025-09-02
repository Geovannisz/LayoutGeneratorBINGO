# Guia de Build - BINGO Layout Generator

Este documento descreve os passos necessários para compilar e executar a aplicação desktop do BINGO Layout Generator a partir do código-fonte.

## Pré-requisitos

Antes de começar, você precisará ter os seguintes softwares instalados em sua máquina:

1.  **Node.js e npm:** Essencial para gerenciar as dependências do projeto e executar os scripts.
    * [Baixe aqui (versão LTS recomendada)](https://nodejs.org/)
2.  **Git:** Necessário para clonar o repositório.
    * [Baixe aqui](https://git-scm.com/downloads)

## Passos para Instalação e Execução

### 1. Clonar o Repositório

Abra um terminal (Prompt de Comando, PowerShell ou Terminal) e clone o repositório do projeto para o seu computador usando o seguinte comando:

```bash
git clone <URL_DO_SEU_REPOSITORIO_GIT>
```

### 2. Navegar para a Pasta do Projeto

Entre na pasta do projeto que você acabou de clonar:

```bash
cd LayoutGeneratorBINGO
```

### 3. Instalar as Dependências

Dentro da pasta do projeto, execute o comando abaixo para instalar todas as dependências necessárias (como Electron e Electron Builder), que estão listadas no arquivo `package.json`.

```bash
npm install
```

Este comando criará uma pasta `node_modules` no seu diretório.

### 4. Executar em Modo de Desenvolvimento

Para abrir o aplicativo e testá-lo em modo de desenvolvimento, use o seguinte comando:

```bash
npm start
```

Uma janela do aplicativo deverá aparecer na sua tela.

### 5. Compilar a Versão Final (Instalador)

Quando quiser gerar a versão final e distribuível do aplicativo (por exemplo, um arquivo `.exe` para Windows), execute o comando de build:

```bash
npm run dist
```

Este comando utilizará o `electron-builder` para empacotar a aplicação. Ao final do processo, uma nova pasta chamada `release` será criada na raiz do projeto, contendo o programa instalável pronto para ser distribuído.
