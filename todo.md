# ✅ BINGO Antenna Layout Generator - TODO List 📋

Este documento rastreia as tarefas concluídas durante o desenvolvimento do site Gerador de Layouts de Antenas BINGO e lista possíveis melhorias e adições futuras.

## 🚀 Fase 1: Fundação e Configuração Inicial

*   [x] **Análise de Requisitos e Definição do Escopo:**
    *   [x] Identificar os principais tipos de layouts de antena necessários (Grid, Espiral, Anéis, etc.).
    *   [x] Definir os parâmetros de entrada para cada tipo de layout.
    *   [x] Esboçar a interface do usuário e as principais seções (Gerador, Mapa, Exportação, Padrão de Feixe, PSF).
    *   [x] Pesquisar e selecionar bibliotecas JavaScript (Leaflet, Plotly, JSZip, FileSaver).
*   [x] **Configuração do Ambiente de Desenvolvimento:**
    *   [x] Criar estrutura de diretórios do projeto (`css/`, `js/`, `data/`, `python/`, `img/`).
    *   [x] Configurar `index.html` básico, `styles.css` e `main.js`.
    *   [x] Implementar sistema de temas (claro/escuro) e toggle na UI.
*   [x] **Desenvolvimento do Módulo `bingo_layouts.js`:**
    *   [x] Traduzir/adaptar algoritmos de `bingo_layouts.py` para JavaScript.
    *   [x] Implementar função `createGridLayout`.
    *   [x] Implementar função `createSpiralLayout`.
    *   [x] Implementar função `createRingLayout`.
    *   [x] Implementar função `createRhombusLayout`.
    *   [x] Implementar função `createHexGridLayout`.
    *   [x] Implementar função `createPhyllotaxisLayout`.
    *   [x] Implementar função `createManualCircularLayout`.
    *   [x] Implementar função `createRandomLayout`.
    *   [x] Implementar funções auxiliares (ex: `centerCoords`, `applyCenterExponentialScaling`, `placeWithRandomOffsetAndCollisionCheck`).

## 🎨 Fase 2: Interface do Gerador de Layout e Visualização

*   [x] **Desenvolvimento do Módulo `generator.js`:**
    *   [x] Criar classe `AntennaLayoutGenerator`.
    *   [x] Implementar seleção de tipo de layout (`#layout-type`).
    *   [x] Implementar geração dinâmica de controles de parâmetros (`#dynamic-params`).
    *   [x] Implementar lógica para ler parâmetros da UI.
    *   [x] Integrar com `BingoLayouts` para calcular posições dos tiles.
    *   [x] Implementar geração das 64 antenas dentro de cada tile.
    *   [x] Implementar desenho do layout (tiles, antenas) no Canvas (`#layout-canvas`).
    *   [x] Implementar cálculo e visualização de escala e eixos no canvas.
    *   [x] Implementar contagem e exibição de tiles/antenas (`#tile-count`, `#antenna-count`).
    *   [x] Implementar botão "Gerar Layout" e "Gerar Aleatório".
    *   [x] Implementar funcionalidade "Mostrar Colisões" e visualização no canvas.
    *   [x] Implementar exibição de detalhes das colisões.
    *   [x] Implementar funcionalidade de download da imagem do layout (PNG).
        *   [x] Adicionar opções de tema (claro/Dracula) e inclusão de eixos para a imagem.
        *   [x] Remover opções de formato JPEG e qualidade.
    *   [x] Adicionar responsividade ao canvas.
    *   [x] Disparar evento `layoutGenerated` após geração.

## 🔬 Fase 3: Análise da Point Spread Function (PSF)

*   [x] **Desenvolvimento do Módulo `psf_analyzer.js` e `psf_analysis_worker.js`:**
    *   [x] Criar interface HTML para controles e exibição da PSF (botão, inputs, displays de resultados).
    *   [x] Implementar classe `PSFAnalyzer` em `psf_analyzer.js`.
    *   [x] Criar Web Worker `psf_analysis_worker.js` para cálculos da PSF.
    *   [x] Implementar lógica de comunicação entre `PSFAnalyzer` e o worker.
    *   [x] Implementar cálculo do AF (Array Factor) no worker.
    *   [x] Implementar cálculo do valor da PSF (intensidade ou magnitude) no worker.
    *   [x] Implementar integração numérica 2D da PSF para obter o volume.
    *   [x] Implementar cálculo do Volume Total da PSF e Theta_pico.
    *   [x] Implementar cálculo de SLL (Side Lobe Level):
        *   Input para `Θ_SLL`.
        *   Cálculo do volume do cone e percentual SLL.
    *   [x] Implementar cálculo de EE (Encircled Energy):
        *   Input para porcentagem de EE.
        *   Cálculo do `Θ_EE` e volume fracionário.
    *   [x] Atualizar UI com resultados e status.
    *   [x] Lidar com reset da análise quando um novo layout é gerado.
    *   [x] Gerenciar estado de "calculando" para desabilitar inputs.

## 📡 Fase 4: Simulação do Padrão de Feixe

*   [x] **Desenvolvimento do Módulo `beam_pattern.js`, `beam_worker.js` e `beam_worker_3d.js`:**
    *   [x] Criar interface HTML para controles do padrão de feixe (Phi, escala, botões 2D/3D).
    *   [x] Implementar Web Worker `beam_worker.js` para cálculo do padrão de feixe 2D.
    *   [x] Implementar Web Worker `beam_worker_3d.js` para cálculo do padrão de feixe 3D.
    *   [x] Implementar carregamento e parseamento de dados E-field:
        *   [x] Para 2D: `efield_phi_X.csv` individuais (via IPFS).
        *   [x] Para 3D: arquivo CSV completo (via IPFS).
        *   [x] Implementar cache para dados carregados.
        *   [x] Implementar retentativas de fetch.
    *   [x] Implementar cálculo do Array Factor (AF) nos workers.
    *   [x] Aplicar AF ao campo do elemento individual nos workers.
    *   [x] Enviar dados resultantes para plotagem (Plotly.js).
    *   [x] Implementar plotagem 2D (Magnitude vs. Theta para Phi constante).
    *   [x] Implementar plotagem 3D (Superfície polar).
    *   [x] Implementar opções de escala (dB/Linear).
    *   [x] Gerenciar estado de "calculando" e exibir mensagens de status.
    *   [x] Atualizar plotagem quando o layout ou parâmetros mudam.
    *   [x] Adicionar downsampling para plots 2D com muitos pontos.
    *   [x] Disparar evento `beamData3DLoaded` após carregamento dos dados 3D.

## 🗺️ Fase 5: Mapa Interativo

*   [x] **Desenvolvimento do Módulo `map.js`:**
    *   [x] Integrar biblioteca Leaflet.js.
    *   [x] Inicializar mapa centrado no BINGO.
    *   [x] Adicionar camadas base (OSM, Satélite ESRI) e controle de camadas.
    *   [x] Adicionar marcador fixo para BINGO Central.
    *   [x] Implementar adição de marcadores de estação por clique.
    *   [x] Carregar e implementar seleção de arranjos pré-definidos de `data/posicoes_outriggers.csv`.
    *   [x] Implementar busca de altitude via API Open-Meteo para marcadores.
    *   [x] Implementar marcadores arrastáveis e atualização de coordenadas/altitude.
    *   [x] Exibir informações da estação selecionada (lat, lon, alt, dist. BINGO).
    *   [x] Exibir distância dinâmica do cursor ao BINGO.
    *   [x] Implementar lista de coordenadas com opções de centralizar/remover marcador.
    *   [x] Implementar ícones de cores diferentes para marcadores (BINGO, padrão, ativo).
    *   [x] Adicionar linhas de distância e tooltips entre estações e BINGO.
    *   [x] Implementar funcionalidade de visualização do arranjo de tiles/antenas em escala real no mapa.
        *   [x] Calcular posições geográficas dos elementos do arranjo.
        *   [x] Desenhar elementos como círculos (L.circle) com raio em metros.
        *   [x] Adicionar camada de overlay para o arranjo e controle no seletor de camadas.
        *   [x] Atualizar visualização do arranjo quando o layout muda ou marcadores são movidos.
    *   [x] Corrigir bug de "marcador duplicado" após arrastar (gerenciamento da flag `isDraggingMarker`).

## 📤 Fase 6: Exportação para OSKAR

*   [x] **Desenvolvimento do Módulo `export.js`:**
    *   [x] Criar interface HTML para os campos de exportação e botão de download ZIP.
    *   [x] Implementar classe `OskarLayoutExporter`.
    *   [x] Gerar conteúdo para `layout_wgs84.txt` (estações do mapa).
    *   [x] Gerar conteúdo para `position.txt` (BINGO Central fixo).
    *   [x] Gerar conteúdo para `station/layout.txt` (centros dos tiles do gerador).
    *   [x] Gerar conteúdo para `station/tile/layout.txt` (64 antenas do tile, layout fixo).
    *   [x] Exibir conteúdos nas textareas.
    *   [x] Adicionar botões "Copiar" para cada textarea.
    *   [x] Implementar download dos 4 arquivos como um ZIP.
        *   [x] Permitir nome de arquivo ZIP customizável.
        *   [x] Usar JSZip para criar o ZIP e FileSaver.js para download.
    *   [x] Atualizar campos de exportação quando os dados relevantes mudam (layout, posições no mapa).

## ⚙️ Fase 7: Integração, Refinamento e Testes

*   [x] **Desenvolvimento do Módulo `main.js`:**
    *   [x] Implementar lógica de inicialização da aplicação.
    *   [x] Coordenar comunicação entre módulos através de eventos globais (ex: `layoutGenerated`, `themeChanged`, `beamData3DLoaded`).
    *   [x] Configurar listeners de eventos globais (resize, etc.).
*   [x] **CSS e Estilização:**
    *   [x] Aplicar estilos consistentes em toda a aplicação.
    *   [x] Garantir responsividade para diferentes tamanhos de tela.
    *   [x] Estilizar componentes específicos (sliders, tabelas, listas, botões, etc.).
*   [x] **Testes e Depuração:**
    *   [x] Testar todas as funcionalidades em diferentes navegadores.
    *   [x] Verificar a precisão dos cálculos e dos dados exportados.
    *   [x] Depurar e corrigir quaisquer problemas encontrados.
    *   [x] Otimizar performance de cálculos e renderizações onde possível.
*   [x] **Documentação Inicial:**
    *   [x] Escrever um `README.md` inicial descrevendo o projeto.
    *   [x] Manter um `todo.md` (este arquivo) para rastrear progresso.

---

## 🔮 Futuras Melhorias e Adições

### Funcionalidades Avançadas de Layout
*   [ ] **Mais Algoritmos de Layout**:
    *   [ ] Implementar layouts otimizados para baixa redundância.
    *   [ ] Layouts baseados em funções de densidade.
    *   [ ] Layouts otimizados por algoritmos genéticos ou outras técnicas de IA.
*   [ ] **Importação/Exportação de Configurações de Layout**:
    *   [ ] Salvar/Carregar parâmetros de layout completos em formato JSON ou similar.
*   [ ] **Editor de Layout Manual Avançado**:
    *   [ ] Permitir arrastar e soltar tiles individuais no canvas do gerador.
    *   [ ] Ferramentas de alinhamento e distribuição.
*   [ ] **Layout de Múltiplas Estações (Outriggers)**:
    *   [ ] Visualizar e configurar layouts para múltiplas estações simultaneamente no gerador.

### Simulação e Análise Aprimoradas
*   [ ] **Padrões de Elemento de Antena Customizáveis**:
    *   [ ] Permitir upload de arquivos de padrão de elemento (ex: formato OSKAR ou CST).
    *   [ ] Selecionar entre diferentes padrões de elemento pré-carregados.
*   [ ] **Análise de PSF Mais Detalhada**:
    *   [ ] Cálculo de FWHM (Full Width at Half Maximum) do lóbulo principal.
    *   [ ] Identificação e listagem dos níveis dos lóbulos laterais mais altos.
    *   [ ] Visualização 2D/3D da própria PSF.
*   [ ] **Análise de Cobertura UV**:
    *   [ ] Plotar a cobertura no plano UV para o arranjo gerado.
*   [ ] **Consideração de Efeitos de Acoplamento Mútuo (Básico)**:
    *   [ ] Opção para introduzir fatores de correção simplificados.
*   [ ] **Análise de Sensibilidade**:
    *   [ ] Simular como pequenas variações nos parâmetros do layout afetam o desempenho.

### Interface do Usuário e Experiência
*   [ ] **Desfazer/Refazer (Undo/Redo)**:
    *   [ ] Para ações no gerador de layout.
*   [ ] **Internacionalização (i18n)**:
    *   [ ] Suporte para múltiplos idiomas (Inglês, Português).
*   [ ] **Guia do Usuário / Tutoriais Interativos**:
    *   [ ] Incorporar ajuda contextual e tutoriais guiados.
*   [ ] **Melhorias de Acessibilidade (A11Y)**:
    *   [ ] Revisão completa para conformidade com WCAG.
*   [ ] **Salvar Estado da Aplicação**:
    *   [ ] Usar `localStorage` para persistir o estado da UI entre sessões (ex: último layout gerado, posições no mapa).

### Performance e Backend
*   [ ] **Otimização de Performance**:
    *   [ ] Perfilamento de código JavaScript para identificar gargalos.
    *   [ ] Otimizar algoritmos de desenho e cálculo.
    *   [ ] Considerar WebAssembly para partes críticas de cálculo.
*   [ ] **Backend (Opcional, para funcionalidades avançadas)**:
    *   [ ] Contas de usuário para salvar layouts e configurações na nuvem.
    *   [ ] Execução de simulações OSKAR mais complexas no servidor.

### Testes e Manutenção
*   [ ] **Testes Automatizados**:
    *   [ ] Implementar testes unitários para módulos JavaScript críticos (ex: `bingo_layouts.js`).
    *   [ ] Implementar testes de integração.
    *   [ ] Configurar testes End-to-End (E2E) com ferramentas como Cypress ou Playwright.
*   [ ] **CI/CD (Integração Contínua / Entrega Contínua)**:
    *   [ ] Configurar pipeline para automação de testes e deploy (ex: GitHub Actions).
*   [ ] **Atualização de Dependências**:
    *   [ ] Revisar e atualizar bibliotecas de terceiros periodicamente.

### Exportação e Integração
*   [ ] **Mais Formatos de Exportação**:
    *   [ ] Suporte para outros formatos de simulação ou CAD.
*   [ ] **Validação de Configurações OSKAR**:
    *   [ ] Checagens básicas nos dados exportados para garantir compatibilidade.