# 📡 Gerador de Layouts de Antenas BINGO 🛰️

**Acesse o site:** [https://geovannisz.github.io/LayoutGeneratorBINGO/](https://geovannisz.github.io/LayoutGeneratorBINGO/)

**Versão:** 1.0.3 | **Autor:** Geovanni Fernandes Garcia | **Licença:** MIT

---

O "Gerador de Layouts de Antenas BINGO" é uma aplicação web interativa e abrangente, meticulosamente projetada para facilitar o design, simulação e análise de arranjos de antenas (tiles) para o projeto BINGO (Baryon Acoustic Oscillations from Integrated Neutral Gas Observations). A interface do usuário é intuitiva e dividida em seções funcionais, cada uma dedicada a um aspecto específico do fluxo de trabalho de design de arranjos.

## 🌟 Visão Geral da Interface

A aplicação recebe o usuário com um cabeçalho limpo, contendo o título e um prático **Seletor de Tema (Modo Escuro/Claro)**, permitindo a personalização da aparência para maior conforto visual. A estrutura principal da página organiza as ferramentas em seções bem definidas:

1.  **Gerador de Layout, Download de Imagem & Análise PSF**: Criação e visualização de arranjos, download de imagens do layout e análise da função de dispersão do ponto (PSF).
2.  **Padrão de Feixe Simulado & Curva EE(Θ)**: Simulação e visualização dos padrões de radiação 2D/3D do arranjo, e visualização da curva de Energia Circunscrita (EE) em função do ângulo de integração Θ da PSF.
3.  **Mapa Interativo**: Seleção geoespacial e gerenciamento de posições de estações.
4.  **Exportação (Estrutura OSKAR)**: Geração de arquivos de configuração para o software de simulação OSKAR.

## 💠 Seção 1: Gerador de Layout, Download de Imagem & Análise PSF

Esta é a primeira e uma das mais interativas seções, combinando a criação do arranjo físico com sua análise de desempenho inicial e opções de exportação visual.

### 📐 Gerador de Layout

O núcleo desta seção permite a criação de diversos tipos de arranjos de antenas (tiles).

*   **Tipo de Layout**: O usuário pode escolher entre uma vasta gama de algoritmos pré-definidos:
    *   `Grid`: Arranjo retangular simples.
    *   `Espiral`: Tiles dispostos em braços espirais.
    *   `Anéis`: Tiles em anéis concêntricos.
    *   `Losango`: Arranjo em forma de diamante.
    *   `Grade Hexagonal`: Tiles em uma grade hexagonal compacta.
    *   `Phyllotaxis`: Padrão inspirado na natureza (como sementes de girassol).
    *   `Circular Manual`: Um layout circular específico e pré-definido.
    *   `Aleatório`: Distribuição aleatória de tiles dentro de um raio.
    *   `Densidade Avançada`: Permite criar layouts com densidade de tiles variando radialmente usando perfis como Gaussiana, Exponencial, Log-Normal, Weibull, Cauchy e Linear Decrescente. Inclui um "Fator de Influência da Densidade" para balancear o perfil com aleatoriedade.
*   **Parâmetros Dinâmicos**: Ao selecionar um tipo de layout, um conjunto de controles específicos aparece, permitindo ajustar finamente propriedades como número de elementos, espaçamento, fatores de escala, offset aleatório, e outros atributos pertinentes ao algoritmo escolhido. Para o layout de "Densidade Avançada", parâmetros específicos do perfil selecionado são exibidos dinamicamente.
*   **Controles de Geração**:
    *   `Gerar Layout`: Cria o arranjo com os parâmetros atuais.
    *   `Gerar Aleatório`: Randomiza os parâmetros do tipo de layout selecionado e gera um novo arranjo.
*   **Edição Manual Universal**: Todos os layouts gerados podem ser manualmente ajustados arrastando e soltando os tiles individuais diretamente na tela de visualização (canvas).
*   **Visualização em Canvas**: O layout resultante é renderizado dinamicamente em uma área de canvas. Centros de tiles e as antenas individuais (64 por tile) são exibidos.
    *   **Estatísticas**: Número total de `Tiles` e `Antenas` no arranjo atual.
    *   **Mostrar Colisões**: Caixa de seleção para ativar/desativar a visualização de colisões retangulares entre tiles. Se ativa e colisões são detectadas, são indicadas no canvas e listadas.
*   **Importação/Exportação de Configurações**:
    *   Botões `Importar` e `Exportar` permitem carregar e salvar configurações de layout.
    *   O formato JSON é utilizado, armazenando o tipo de layout, seus parâmetros de geração e, crucialmente, as **posições exatas dos tiles (`currentTileLayout`)**. Isso garante que quaisquer modificações manuais feitas via drag-and-drop sejam preservadas e restauradas.

### 🖼️ Baixar Imagem do Layout (Sub-seção)

Integrada à seção de geração, esta funcionalidade permite salvar uma representação visual do arranjo gerado.

*   **Opções de Imagem**:
    *   `Tema da Imagem`: Escolha entre `Claro` (padrão) ou `Dracula` (escuro).
    *   `Incluir Eixos`: Sim/Não para incluir eixos e escala na imagem.
*   **Botão de Download**: Ao clicar em "Baixar Imagem", a configuração atual do canvas é salva como um arquivo PNG.

### 📊 Análise da PSF (Point Spread Function) (Sub-seção)

Também integrada à seção de geração de layout, esta sub-seção permite analisar a qualidade do feixe principal do arranjo através da PSF.

*   **Cálculo de Volume e Θ<sub>pico</sub>**:
    *   Um botão "Calcular Volume da PSF" inicia os cálculos no background usando um Web Worker.
    *   Após o cálculo, o `Volume Total` sob a PSF e o `Θ_pico` (largura estimada do lóbulo principal) são exibidos.
*   **Métricas da PSF**: Uma tabela detalha métricas chave:
    *   **SLL (Side Lobe Level)**: O usuário pode inserir um ângulo `Θ_SLL`. O sistema calcula o volume da PSF contido neste cone e o `Resultado` percentual em relação ao volume total da PSF.
    *   **EE (Encircled Energy)**: O usuário define uma `Porcentagem de Energia Circunscrita` desejada. O sistema calcula o volume fracionário correspondente e o ângulo `Θ_EE` que engloba essa porcentagem.
*   **Status da Análise**: Uma mensagem informa o estado atual dos cálculos da PSF.

## 📡 Padrão de Feixe Simulado & Curva EE(Θ)

Localizada ao lado do gerador de layouts, esta seção foca na simulação e visualização detalhada do padrão de radiação do arranjo, e agora também inclui a visualização da curva de Energia Circunscrita.

### 📡 Padrão de Feixe Simulado

*   **Controles de Simulação**:
    *   **Ângulo Phi (0°-90°)**: Slider e campo numérico para selecionar o ângulo azimutal (Phi) para o corte 2D.
    *   **Escala de Magnitude**: Seletores para diferentes escalas de visualização: `dB`, `Linear`, `Sqrt`, `Quadrática`, `Raiz Quarta`.
    *   **Modo de Visualização**: Botões para `Mapa de Calor`, `3D` ou `2D`.
*   **Visualização do Padrão de Feixe**: 
    *   **Mapa de Calor**: Visualização 2D em coordenadas polares com supersampling adaptativo para suavizar a imagem:
        - 5x5 samples (25 total) perto do centro (θ < 5°) onde a singularidade polar causa artefatos
        - 3x3 samples (9 total) para o resto da imagem
        - Usa paleta HSV com 64 níveis de cor para máxima discriminação de dados
    *   **Gráfico 2D**: Magnitude normalizada vs. ângulo Theta para o Phi selecionado (via Plotly.js).
    *   **Gráfico 3D**: Superfície colorida do feixe em toda a esfera visível (via Plotly.js).
*   **Status do Padrão de Feixe**: Mensagem sobre o estado dos cálculos.
*   **Fonte de Dados E-Field**: Dados de campo elétrico do elemento individual são carregados de gateways IPFS, processados pelo script `python/preprocess_efield_csv.py` a partir de `rE_table_vivaldi.csv`.
    *   **Plots 2D**: Arquivos CSV específicos por ângulo Phi.
    *   **Plots 3D/Heatmap**: Arquivo CSV completo.
*   **Web Workers**: Cálculos intensivos do padrão de feixe são delegados a Web Workers (`beam_worker.js` para 2D, `beam_worker_3d.js` para 3D, `heatmap_worker.js` para mapa de calor).

### 📈 Curva de Energia Circunscrita (EE vs. Θ) da PSF

Abaixo do gráfico do padrão de feixe, esta sub-seção visualiza a relação entre a Energia Circunscrita (EE) e o ângulo de integração Theta (Θ) da PSF.

*   **Geração Automática**: O gráfico é gerado automaticamente assim que o cálculo do "Volume Total da PSF" (na Seção 1) é concluído. Não há botão de geração manual para este gráfico.
*   **Visualização**: Um gráfico Plotly.js mostra a porcentagem de EE (0-100%) no eixo Y em função do ângulo de integração Θ (0-90 graus) no eixo X.
*   **Otimização**: O cálculo dos pontos da curva é otimizado, com maior densidade de amostragem em ângulos Theta menores, onde a curva EE tende a variar mais rapidamente.
*   **Interatividade**: O zoom é restrito ao eixo horizontal (Θ), mantendo o eixo EE fixo de 0 a 100%.
*   **Status da Curva EE(Θ)**: Mensagem sobre o estado da geração do gráfico.
*   **Dados Dependentes**: A geração deste gráfico depende do `psfGrid` e do `totalPSFVolume` calculados pelo `psf_analysis_worker.js`.

## 🗺️ Mapa Interativo

Esta seção oferece uma interface geoespacial para posicionar e gerenciar as estações do arranjo.

*   **Tecnologia**: Utiliza a biblioteca Leaflet.js.
*   **Visualização**: Mapa inicializado e centralizado nas coordenadas do BINGO Central.
    *   **Camadas Base**: Opções para `Satélite (ESRI)` e `Mapa (OSM)`.
    *   **Camadas de Sobreposição**: `Nomes e Limites (ESRI)` e `Visualizar o Arranjo`.
*   **Marcadores**:
    *   **BINGO Central**: Marcador fixo azul.
    *   **Marcadores de Estação**: Adicionáveis por clique ou seleção de arranjos pré-definidos (`data/posicoes_outriggers.csv`). São arrastáveis, com altitude obtida via API Open-Meteo. Marcador ativo em verde, outros em vermelho.
*   **Informações do Mapa**: Exibe coordenadas da estação ativa, distância ao BINGO, distância do cursor ao BINGO, e uma lista interativa das estações com opções de centralizar/remover.
*   **Visualização do Arranjo no Mapa**: Quando a camada "Visualizar o Arranjo" está ativa, o layout de tiles/antenas é desenhado em escala real sobre cada marcador de estação.

## 📤 Exportação (Estrutura OSKAR)

A seção final permite exportar os dados configurados em formatos compatíveis com o software de simulação OSKAR.

*   **Campos de Texto**: Quatro áreas de texto exibem os dados para:
    1.  `layout_wgs84.txt`: Coordenadas WGS84 das estações.
    2.  `position.txt`: Coordenadas WGS84 fixas do BINGO Central.
    3.  `station/layout.txt`: Coordenadas XY relativas dos centros dos tiles.
    4.  `station/tile/layout.txt`: Coordenadas XY relativas das 64 antenas de um tile.
*   **Botões de Copiar**: Para cada área de texto.
*   **Download ZIP**: Agrupa os quatro arquivos de texto em um ZIP com estrutura de diretórios OSKAR e nome de arquivo opcionalmente customizável.

## 🛠️ Tecnologias e Arquitetura

*   **Frontend**: HTML5, CSS3, JavaScript (ES6+ com 'use strict').
*   **Bibliotecas JavaScript**: Leaflet.js, Plotly.js, JSZip, FileSaver.js, Font Awesome.
*   **Estrutura JavaScript Modular**:
    *   `constants.js`: Constantes físicas, dimensões e configurações centralizadas.
    *   `main.js`: Ponto de entrada e orquestração.
    *   `tabs.js`: Gerenciador de navegação por abas (TabManager).
    *   `bingo_layouts.js`: Algoritmos de geração de layouts.
    *   `generator.js`: UI e lógica do "Gerador de Layout".
    *   `stations.js`: Gerenciador de estações com 10 tipos de layout.
    *   `map.js`: Funcionalidades do mapa interativo.
    *   `export.js`: Exportação de dados OSKAR (WGS84, ECEF, ENU).
    *   `ini_generator.js`: Geradores de arquivos INI OSKAR (Interferometer, Imager, Beam Pattern).
    *   `sky_model.js`: Gerador de Sky Model OSKAR (12 colunas, 4 modos).
    *   `uv_coverage.js`: Visualização de cobertura UV com aceleração WebGPU.
    *   `beam_pattern.js`: Simulação do padrão de feixe.
        *   `beam_worker.js` (2D), `beam_worker_3d.js` (3D), `beam_gpu.js` (WebGPU), `heatmap_worker.js` (Mapa de Calor).
    *   `psf_analyzer.js`: UI da Análise da PSF.
    *   `psf_ee_theta_plot.js`: UI e lógica do gráfico EE(Θ) da PSF.
        *   `psf_analysis_worker.js`: Web Worker para cálculos da PSF.
*   **Scripts de Apoio Python** (`python/`):
    *   `bingo_layouts.py`: Implementação Python dos layouts.
    *   `preprocess_efield_csv.py`: Processamento de dados E-field.
    *   `csv_filter.py`: Filtro de dados CSV.
    *   `telescope_gen.py`: Geração de configurações de telescópio (desenvolvimento).

## 🔧 Melhorias Recentes (v1.0.3)

### 🆕 Novos Módulos

*   **Sistema de Abas (TabManager)**: Navegação por abas com botões `.tab-btn` e painéis `.tab-content`, evento `tabChanged` customizado.
*   **Gerenciador de Estações (`stations.js`)**: 10 tipos de layout de estação (grid, circular, spiral, y_shape, cross, random, logarithmic, sunflower, dual_ring, elliptical) com geração em tempo real (debounce 150ms) ao alterar parâmetros.
*   **Gerador INI OSKAR (`ini_generator.js`)**: Três geradores — `oskar_sim_interferometer` (73 parâmetros), `oskar_imager` (34 parâmetros), `oskar_sim_beam_pattern` (42 parâmetros) — alinhados com TutorialOSKAR.tex. Inputs de caminho de arquivo usam colagem via clipboard (fa-paste).
*   **Gerador de Sky Model (`sky_model.js`)**: 4 modos (single, grid, random, power_law) com suporte completo a 12 colunas OSKAR (RA, Dec, I, Q, U, V, refFreq, spectralIndex, RM, major, minor, pa). Validação de fontes e tabela interativa com ordenação por coluna.
*   **Cobertura UV (`uv_coverage.js`)**: Visualização de cobertura UV com aceleração WebGPU (≥10 estações), shader WGSL (workgroup_size 64), fallback CPU automático. Componente Bz incluído no cálculo de baselines 3D.

### 📐 Exportação e Coordenadas

*   **Correção de ordem de coordenadas**: `layout_wgs84.txt` e `position.txt` agora usam lon,lat,alt conforme convenção OSKAR.
*   **Seletor de formato de coordenadas**: Radio buttons para alternar entre WGS84 (padrão), ECEF e ENU na seção de exportação, com tooltips explicativos (ℹ️).
*   **Consolidação WGS84**: Textarea standalone removida; dados WGS84 servidos exclusivamente via seletor de rádio.

### 🗺️ Mapa e Interação

*   **Ctrl+scroll zoom**: Zoom no mapa desabilitado por scroll simples; mensagem overlay "Use Ctrl + scroll para dar zoom" exibida por 1.5s.
*   **Toggle de distância no mapa**: Exibição de linhas de distância entre estações.
*   **Leaflet atualizado**: CDN de 1.7.1 → 1.9.4.

### 🔧 Correções e Melhorias

*   **Heatmap race condition**: Worker agora retorna `layoutHash` para validar resultados contra o layout atual, evitando resultados descartados incorretamente.
*   **Heatmap tooltip**: Exibição de intensidade interpolada no tooltip do mapa de calor.
*   **BUILD.md**: Seções adicionadas para Linux e macOS, detecção de LFS melhorada.
*   **Python `telescope_gen.py`**: Caminhos hardcoded substituídos por `os.path.dirname` + `argparse` CLI.
*   **Terminação de linha adaptativa**: `getOsLineEnding()` detecta Windows via `navigator.userAgentData.platform` com fallback para `navigator.platform`.

### 🔧 Melhorias da v1.0.2

### Organização do Código
*   Criado arquivo `js/constants.js` centralizando constantes físicas, CIDs IPFS e configurações compartilhadas
*   Adicionadas diretivas `'use strict'` e documentação JSDoc em todos os módulos JavaScript
*   Melhorado `.gitignore` e adicionado `.editorconfig` para estilo de código consistente

### SEO e Acessibilidade
*   Meta tags completas: canonical, robots, theme-color, keywords, author
*   Dados estruturados Schema.org (WebApplication, SoftwareApplication)
*   Preconnect/dns-prefetch para recursos CDN
*   Classes CSS de acessibilidade: `.sr-only`, `.skip-link`, `:focus-visible`
*   Suporte a `prefers-reduced-motion` e `prefers-contrast`

### Processamento de Dados
*   Objeto `PerformanceMetrics` para rastrear tempos de fetch, processamento e renderização
*   Funções de validação: `validateAntennaCoords()`, `validateEFieldData()`
*   Fetch IPFS melhorado com retry (2 tentativas/gateway), backoff exponencial, timeout de 8s
*   Parsing de CSV com validação completa de valores e relatório de erros

### Segurança (Electron)
*   Sandbox e contextIsolation habilitados
*   Prevenção de navegação para URLs externas
*   Auto-updater com tratamento de erros

## 📋 Requisitos do Sistema

*   **Navegador**: Moderno com suporte a HTML5 Canvas e JavaScript ES6+
*   **WebGPU** (opcional): Para cálculos acelerados de padrão de feixe
*   **Conexão com Internet**: Para carregar dados E-field via IPFS

## 📜 Licença

Este projeto é licenciado sob a [Licença MIT](LICENSE).

---

Este gerador de layouts visa fornecer uma ferramenta poderosa e flexível para pesquisadores e engenheiros envolvidos no projeto BINGO, simplificando o processo de design e análise de arranjos de antenas.
