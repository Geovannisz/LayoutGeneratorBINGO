# 📡 Gerador de Layouts de Antenas BINGO 🛰️

**Acesse o site:** [https://geovannisz.github.io/LayoutGeneratorBINGO/](https://geovannisz.github.io/LayoutGeneratorBINGO/)

---

O "Gerador de Layouts de Antenas BINGO" é uma aplicação web interativa e abrangente, meticulosamente projetada para facilitar o design, simulação e análise de arranjos de antenas (tiles) para o projeto BINGO (Baryon Acoustic Oscillations from Integrated Neutral Gas Observations). A interface do usuário é intuitiva e dividida em seções funcionais, cada uma dedicada a um aspecto específico do fluxo de trabalho de design de arranjos.

## 🌟 Visão Geral da Interface

A aplicação recebe o usuário com um cabeçalho limpo, contendo o título e um prático **Seletor de Tema (Modo Escuro/Claro)**, permitindo a personalização da aparência para maior conforto visual. A estrutura principal da página organiza as ferramentas em seções bem definidas:

1.  **Gerador de Layout & Análise PSF**: Criação e visualização de arranjos, análise da função de dispersão do ponto (PSF) e download de imagens.
2.  **Padrão de Feixe Simulado**: Simulação e visualização dos padrões de radiação 2D e 3D do arranjo.
3.  **Mapa Interativo**: Seleção geoespacial e gerenciamento de posições de estações.
4.  **Exportação (Estrutura OSKAR)**: Geração de arquivos de configuração para o software de simulação OSKAR.

## 💠 Seção 1: Gerador de Layout & Análise PSF

Esta é a primeira e uma das mais interativas seções, combinando a criação do arranjo físico com sua análise de desempenho inicial.

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
*   **Parâmetros Dinâmicos**: Ao selecionar um tipo de layout, um conjunto de controles específicos aparece, permitindo ajustar finamente propriedades como número de elementos, espaçamento, fatores de escala, offset aleatório, e outros atributos pertinentes ao algoritmo escolhido. Por exemplo, para o layout "Grid", o usuário pode definir o número de colunas e linhas; para "Espiral", o número de braços e tiles por braço.
*   **Controles de Geração**:
    *   `Gerar Layout`: Cria o arranjo com os parâmetros atuais.
    *   `Gerar Aleatório`: Randomiza os parâmetros do tipo de layout selecionado e gera um novo arranjo, útil para exploração rápida de configurações.
*   **Visualização em Canvas**: O layout resultante é renderizado dinamicamente em uma área de canvas. Centros de tiles e as antenas individuais (64 por tile) são exibidos.
    *   **Estatísticas**: Abaixo do canvas, são mostrados o número total de `Tiles` e `Antenas` no arranjo atual.
    *   **Mostrar Colisões**: Uma caixa de seleção permite ativar/desativar a visualização de colisões retangulares entre tiles. Se ativa e colisões são detectadas, elas são indicadas no canvas, e uma seção expansível abaixo das estatísticas lista os pares de tiles em colisão.

### 📊 Análise da PSF (Point Spread Function)

Integrada à seção de geração de layout, esta sub-seção permite analisar a qualidade do feixe principal do arranjo através da PSF.

*   **Cálculo de Volume e Θ<sub>pico</sub>**:
    *   Um botão "Calcular Volume da PSF" inicia os cálculos no background usando um Web Worker.
    *   Após o cálculo, o `Volume Total` sob a PSF e o `Θ_pico` (uma estimativa da largura do lóbulo principal, baseada no primeiro mínimo significativo) são exibidos.
*   **Métricas da PSF**: Uma tabela detalha métricas chave:
    *   **SLL (Side Lobe Level)**: O usuário pode inserir um ângulo `Θ_SLL` (em graus). O sistema calcula o volume da PSF contido dentro deste cone e o `Resultado` percentual em relação ao volume total da PSF.
    *   **EE (Encircled Energy)**: O usuário define uma `Porcentagem de Energia Circunscrita` desejada (ex: 60%). O sistema calcula o volume fracionário correspondente e o ângulo `Θ_EE` (em graus) que engloba essa porcentagem da energia total da PSF.
*   **Status da Análise**: Uma mensagem informa o estado atual dos cálculos da PSF.

### 🖼️ Baixar Imagem do Layout

Permite ao usuário salvar uma representação visual do arranjo gerado.

*   **Opções de Imagem**:
    *   `Tema da Imagem`: Escolha entre `Claro` (padrão) ou `Dracula` (escuro).
    *   `Incluir Eixos`: Sim/Não para incluir eixos e escala na imagem.
*   **Botão de Download**: Ao clicar em "Baixar Imagem", a configuração atual do canvas é salva como um arquivo PNG.

## 빔 Padrão de Feixe Simulado

Localizada ao lado do gerador de layouts, esta seção foca na simulação e visualização detalhada do padrão de radiação do arranjo.

*   **Controles de Simulação**:
    *   **Ângulo Phi (0°-90°)**: Um slider e um campo numérico permitem selecionar o ângulo azimutal (Phi) para o qual o corte 2D do padrão de feixe será calculado e exibido.
    *   **Escala Y (2D/3D)**: Seletores de rádio para escolher entre `dB` (decibéis) ou `Linear` para a escala vertical dos gráficos.
    *   **Modo de Visualização**:
        *   `Padrão 2D`: Calcula e exibe o padrão de feixe para o ângulo Phi selecionado.
        *   `Padrão 3D`: Calcula e exibe uma varredura completa do padrão de feixe em 3D.
*   **Visualização do Padrão**: Um gráfico Plotly.js renderiza o padrão de feixe.
    *   **Gráfico 2D**: Mostra a magnitude normalizada (dB ou linear) em função do ângulo Theta para o Phi constante selecionado.
    *   **Gráfico 3D**: Apresenta uma superfície colorida representando a magnitude do feixe em toda a esfera visível (Theta e Phi).
*   **Status**: Uma mensagem informa o estado do carregamento de dados e dos cálculos do padrão de feixe.
*   **Fonte de Dados E-Field**: Os dados de campo elétrico do elemento individual, cruciais para a simulação, são carregados dinamicamente:
    *   **Para Plots 2D**: Arquivos CSV específicos para cada ângulo Phi inteiro (ex: `efield_phi_0.csv`, `efield_phi_1.csv`, etc.) são buscados de um gateway IPFS (Pinata). Estes são derivados do arquivo `data/efield_phi_data/efield_phi_X.csv` localmente, que por sua vez é pré-processado pelo script `python/preprocess_efield_csv.py` a partir de um arquivo de dados mais completo (`rE_table_vivaldi.csv`).
    *   **Para Plots 3D**: Um arquivo CSV completo contendo dados para todas as combinações de Theta e Phi é carregado de um gateway IPFS (Pinata), originado do mesmo `rE_table_vivaldi.csv`.
*   **Web Workers**: Cálculos intensivos do padrão de feixe (Array Factor) são delegados a Web Workers (`beam_worker.js` para 2D, `beam_worker_3d.js` para 3D) para manter a interface responsiva.

## 🗺️ Mapa Interativo

Esta seção oferece uma interface geoespacial para posicionar e gerenciar as estações do arranjo.

*   **Tecnologia**: Utiliza a biblioteca Leaflet.js.
*   **Visualização**: O mapa é inicializado e centralizado nas coordenadas do BINGO Central.
    *   **Camadas Base**: Opções para `Satélite (ESRI)` e `Mapa (OSM)`.
    *   **Camadas de Sobreposição**: `Nomes e Limites (ESRI)` e uma camada para `Visualizar o Arranjo` (mostra os tiles/antenas em escala no mapa).
*   **Marcadores**:
    *   **BINGO Central**: Um marcador fixo (azul) indica a localização de referência.
    *   **Marcadores de Estação**: O usuário pode adicionar marcadores clicando no mapa ou selecionando um `Arranjo` pré-definido na lista suspensa (dados de `data/posicoes_outriggers.csv`).
        *   Marcadores de estação são arrastáveis.
        *   A altitude é obtida via API Open-Meteo ao adicionar/mover um marcador.
        *   O marcador ativo/selecionado é destacado em verde, os demais em vermelho.
*   **Informações do Mapa**:
    *   `Coordenadas selecionadas`: Exibe lat/lon/alt da estação ativa.
    *   `Distância ao BINGO`: Distância da estação ativa ao BINGO Central.
    *   `Distância do cursor ao BINGO`: Distância dinâmica do cursor do mouse ao BINGO Central.
    *   `Lista de Coordenadas`: Uma lista interativa de todas as estações adicionadas, com nome, coordenadas, altitude e distância. Cada item possui botões para centralizar o mapa na estação ou removê-la.
*   **Visualização do Arranjo no Mapa**: Quando a camada "Visualizar o Arranjo" está ativa, o layout de tiles/antenas gerado na primeira seção é desenhado em escala real sobre cada marcador de estação no mapa, permitindo uma compreensão espacial da cobertura do arranjo.

## 📤 Exportação (Estrutura OSKAR)

A seção final permite exportar os dados configurados em formatos compatíveis com o software de simulação OSKAR.

*   **Campos de Texto**: Quatro áreas de texto exibem os dados para os seguintes arquivos:
    1.  `layout_wgs84.txt`: Coordenadas WGS84 (latitude, longitude, altitude) das estações selecionadas no mapa.
    2.  `position.txt`: Coordenadas WGS84 fixas do BINGO Central (referência).
    3.  `station/layout.txt`: Coordenadas XY relativas (em metros) dos centros dos tiles, conforme gerado na seção "Gerador de Layout".
    4.  `station/tile/layout.txt`: Coordenadas XY relativas (em metros) das 64 antenas dentro de um único tile (layout interno fixo de 4x16 antenas).
*   **Botões de Copiar**: Cada área de texto possui um botão para copiar seu conteúdo para a área de transferência.
*   **Download ZIP**:
    *   Um campo de entrada permite ao usuário especificar um nome para o arquivo ZIP (opcional).
    *   O botão "Baixar Layout (ZIP)" agrupa os quatro arquivos de texto (.txt) em um arquivo ZIP com a estrutura de diretórios esperada pelo OSKAR (`station/` e `station/tile/`) e inicia o download.

## 🛠️ Tecnologias e Arquitetura

*   **Frontend**: HTML5, CSS3, JavaScript (ES6+).
*   **Bibliotecas JavaScript**:
    *   **Leaflet.js**: Para o mapa interativo.
    *   **Plotly.js**: Para os gráficos de padrão de feixe.
    *   **JSZip**: Para criar arquivos ZIP no cliente.
    *   **FileSaver.js**: Para facilitar o download de arquivos.
    *   **Font Awesome**: Para ícones.
*   **Estrutura JavaScript Modular**:
    *   `main.js`: Ponto de entrada, inicialização e orquestração global.
    *   `bingo_layouts.js`: Lógica e algoritmos para geração dos layouts de tiles.
    *   `generator.js`: Controla a interface e a lógica da seção "Gerador de Layout", incluindo a comunicação com `bingo_layouts.js` e o desenho no canvas.
    *   `map.js`: Gerencia todas as funcionalidades do mapa interativo.
    *   `export.js`: Lida com a formatação e exportação dos dados para a estrutura OSKAR.
    *   `beam_pattern.js`: Orquestra a simulação do padrão de feixe, incluindo o carregamento de dados E-field e a comunicação com os Web Workers.
        *   `beam_worker.js`: Web Worker para cálculos 2D do padrão de feixe.
        *   `beam_worker_3d.js`: Web Worker para cálculos 3D do padrão de feixe.
    *   `psf_analyzer.js`: Controla a interface da Análise da PSF.
        *   `psf_analysis_worker.js`: Web Worker para os cálculos da PSF.
*   **Scripts de Apoio Python** (localizados no diretório `python/`):
    *   `bingo_layouts.py`: Implementação Python dos algoritmos de layout, usada para desenvolvimento e verificação.
    *   `preprocess_efield_csv.py`: Script para processar o arquivo CSV completo de dados E-field (`rE_table_vivaldi.csv`) e gerar os arquivos CSV menores por ângulo Phi (`efield_phi_X.csv`) usados para os plots 2D, e o arquivo CSV completo otimizado para o plot 3D (que são hospedados no Pinata/IPFS).
    *   `telescope_gen.py`: Script Python (provavelmente para desenvolvimento ou teste inicial) relacionado à geração de configurações de telescópio.

Este gerador de layouts visa fornecer uma ferramenta poderosa e flexível para pesquisadores e engenheiros envolvidos no projeto BINGO, simplificando o processo de design e análise de arranjos de antenas.