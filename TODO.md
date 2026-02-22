# ✅ BINGO Antenna Layout Generator - TODO List 📋

Este documento rastreia as tarefas concluídas durante o desenvolvimento do site Gerador de Layouts de Antenas BINGO e lista possíveis melhorias e adições futuras.

**Versão Atual:** 1.0.3 | **Última Atualização:** Fevereiro 2026

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
*   [x] **Reorganização da UI na Seção do Gerador:**
    *   [x] Trocar a posição da sub-seção "Baixar Imagem do Layout" com "Análise da PSF (Point Spread Function)".
    *   [x] Ajustar as proporções horizontais e CSS correspondentes (flex, bordas).

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
        *   [x] Input para `Θ_SLL`.
        *   [x] Cálculo do volume do cone e percentual SLL.
    *   [x] Implementar cálculo de EE (Encircled Energy):
        *   [x] Input para porcentagem de EE.
        *   [x] Cálculo do `Θ_EE` e volume fracionário.
    *   [x] Atualizar UI com resultados e status.
    *   [x] Lidar com reset da análise quando um novo layout é gerado.
    *   [x] Gerenciar estado de "calculando" para desabilitar inputs.
    *   [x] Modificar `triggerFullPSFVolumeCalculation` em `psf_analyzer.js` para retornar uma Promise.
    *   [x] Fazer `psf_analyzer.js` disparar um evento `psfTotalVolumeCalculated` após o cálculo bem-sucedido do volume total e Theta_pico.

## 📡 Fase 4: Simulação do Padrão de Feixe e Curva EE(Θ) da PSF

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
    *   [x] **Remover títulos dos gráficos** do padrão de feixe 2D e 3D para otimizar espaço vertical.
*   [x] **Implementação do Mapa de Calor (Heatmap):**
    *   [x] Criar Web Worker `heatmap_worker.js` para geração de heatmap.
    *   [x] Implementar supersampling adaptativo:
        *   [x] 9x9 samples (81 total) para θ < 5° (centro, alta densidade)
        *   [x] 5x5 samples (25 total) para θ > 5° (resto da imagem)
    *   [x] Implementar paleta HSV com 64 níveis de cor.
    *   [x] Implementar interpolação bilinear para dados polares.
    *   [x] Suporte a múltiplas escalas: dB, Linear, Sqrt, Quadrática, Raiz Quarta.
*   [x] **Implementação da Visualização da Curva EE(Θ) da PSF:**
    *   [x] **Estrutura HTML e CSS**:
        *   [x] Adicionar nova sub-seção no HTML dentro do contêiner do "Padrão de Feixe Simulado" para o gráfico da Curva EE(Θ).
        *   [x] Implementar um divisor visual (borda CSS) entre a área do gráfico do Padrão de Feixe e a nova área do gráfico da Curva EE(Θ).
        *   [x] Ajustar CSS para que a área do Padrão de Feixe seja significativamente maior verticalmente (ex: proporção 6:1) que a área da Curva EE(Θ).
        *   [x] Remover o título "Curva de Energia Circunscrita (EE vs. Θ)" e o botão "Gerar Curva" da UI.
    *   [x] **Desenvolvimento do Módulo `psf_ee_theta_plot.js`:**
        *   [x] Criar classe `PSFEeThetaPlotter`.
        *   [x] Inicializar e gerenciar elementos DOM (área do plot, status).
    *   [x] **Lógica de Geração da Curva no `psf_analysis_worker.js`:**
        *   [x] Adicionar novo comando `calculateEECurve` ao worker.
        *   [x] Reutilizar a `psfGrid` calculada.
        *   [x] Calcular pontos (Theta, EE) para a curva, com maior densidade de amostragem (precisão ~3x maior) em ângulos Theta menores.
        *   [x] Enviar dados da curva (`eeCurveData`) de volta para a thread principal.
    *   [x] **Integração e Plotagem no `psf_ee_theta_plot.js`:**
        *   [x] **Geração Automática**: Acionar o cálculo e plotagem da curva EE(Θ) automaticamente assim que o "Volume Total da PSF" for calculado com sucesso pelo `PSFAnalyzer`.
        *   [x] Comunicar-se com `psf_analysis_worker.js` (via referência do worker do `PSFAnalyzer`) para solicitar os dados da curva.
        *   [x] Plotar os dados recebidos usando Plotly.js.
        *   [x] **Zoom Horizontal**: Configurar o gráfico Plotly para permitir zoom apenas no eixo X (Theta), mantendo o eixo Y (EE) fixo entre 0-100%.
        *   [x] Atualizar mensagens de status.
        *   [x] Limpar o gráfico quando os dados base da PSF forem invalidados (ex: novo layout).
    *   [x] **Coordenação em `main.js`:**
        *   [x] Inicializar `PSFEeThetaPlotter`.
        *   [x] Garantir que `PSFEeThetaPlotter` receba os dados (`antennaCoords`, `elementFieldData3D`, `K_CONST`) e seja notificado quando o volume da PSF estiver pronto.

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
    *   [x] Coordenar comunicação entre módulos através de eventos globais (ex: `layoutGenerated`, `themeChanged`, `beamData3DLoaded`, `psfTotalVolumeCalculated`).
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

## 🛡️ Fase 8: Boas Práticas, SEO e Organização de Código (v1.0.2)

*   [x] **Organização de Código:**
    *   [x] Criar arquivo `js/constants.js` centralizando constantes físicas, CIDs IPFS e configurações.
    *   [x] Adicionar diretivas `'use strict'` em todos os módulos JavaScript.
    *   [x] Adicionar documentação JSDoc em todos os arquivos JavaScript.
    *   [x] Atualizar scripts Python para usar caminhos relativos.
    *   [x] Remover arquivo duplicado `todo.md`.
*   [x] **Arquivos de Configuração:**
    *   [x] Melhorar `.gitignore` com padrões para Node.js, Python, Electron, IDEs.
    *   [x] Criar `.editorconfig` para estilo de código consistente.
    *   [x] Atualizar `package.json` com metadados completos, keywords, scripts de build.
*   [x] **SEO (Search Engine Optimization):**
    *   [x] Adicionar meta tags completas: canonical, robots, theme-color, keywords, author.
    *   [x] Melhorar Open Graph e Twitter Cards com dimensões de imagem e alt text.
    *   [x] Adicionar dados estruturados Schema.org (WebApplication, SoftwareApplication).
    *   [x] Adicionar preconnect/dns-prefetch para recursos CDN.
    *   [x] Atualizar sitemap.xml com data atual.
    *   [x] Melhorar robots.txt com diretivas por bot.
*   [x] **Acessibilidade:**
    *   [x] Adicionar classe CSS `.sr-only` para conteúdo de leitores de tela.
    *   [x] Adicionar `.skip-link` para navegação por teclado.
    *   [x] Adicionar estilos `:focus-visible` para indicação de foco.
    *   [x] Adicionar `prefers-reduced-motion` media query.
    *   [x] Adicionar `prefers-contrast` media query.
    *   [x] Adicionar ARIA roles apropriados (header, main, footer, nav).
    *   [x] Adicionar `rel="noopener noreferrer"` em links externos.
*   [x] **Processamento de Dados:**
    *   [x] Criar objeto `PerformanceMetrics` para rastrear tempos de fetch/processamento/renderização.
    *   [x] Adicionar funções de validação: `validateAntennaCoords()`, `validateEFieldData()`.
    *   [x] Melhorar fetch IPFS com retry (2 tentativas/gateway) e backoff exponencial.
    *   [x] Melhorar parsing de CSV com validação completa e relatório de erros.
*   [x] **Segurança (Electron):**
    *   [x] Habilitar sandbox e contextIsolation.
    *   [x] Adicionar prevenção de navegação para URLs externas.
    *   [x] Melhorar auto-updater com tratamento de erros.
*   [x] **Verificações:**
    *   [x] Executar code review e corrigir issues.
    *   [x] Executar CodeQL scan (0 vulnerabilidades).

## 🚀 Fase 9: Módulos OSKAR, Estações, Sky Model e Cobertura UV (v1.0.3)

*   [x] **Sistema de Abas e Navegação:**
    *   [x] Implementar `TabManager` com botões `.tab-btn` e painéis `.tab-content`.
    *   [x] Disparar evento customizado `tabChanged` ao trocar de aba.
    *   [x] Adicionar acesso rápido às abas no `main.js`.
*   [x] **Gerenciador de Estações (`stations.js`):**
    *   [x] Implementar 10 tipos de layout: grid, circular, spiral, y_shape, cross, random, logarithmic, sunflower (Fibonacci), dual_ring, elliptical.
    *   [x] Adicionar geração automática em tempo real com debounce (150ms) ao alterar parâmetros.
    *   [x] Manter botões "Gerar" e "Randomizar" para controle explícito.
    *   [x] Geração inicial no carregamento da página.
    *   [x] Implementar parâmetros de espaçamento exponencial por tipo de layout.
*   [x] **Gerador INI OSKAR (`ini_generator.js`):**
    *   [x] Implementar `OskarIniGenerator` para `oskar_sim_interferometer` (73 parâmetros em 5 seções).
    *   [x] Implementar `OskarImagerGenerator` para `oskar_imager` (34 parâmetros).
    *   [x] Implementar `OskarBeamPatternGenerator` para `oskar_sim_beam_pattern` (42 parâmetros).
    *   [x] Alinhar todos os geradores com TutorialOSKAR.tex (tooltips, defaults, parâmetros faltantes).
    *   [x] Inputs de caminho de arquivo via clipboard paste (fa-paste) com fallback.
    *   [x] Utilitário `getOsLineEnding()` para detectar terminação de linha do SO.
    *   [x] Todos os geradores prepõem seção `[General] app=...`.
*   [x] **Gerador de Sky Model (`sky_model.js`):**
    *   [x] Implementar 4 modos de geração: single, grid, random, power_law.
    *   [x] Suporte completo a 12 colunas OSKAR (RA, Dec, I, Q, U, V, refFreq, spix, RM, major, minor, pa).
    *   [x] Helper `_buildGaussianFields(prefix)` para evitar duplicação.
    *   [x] Validação de fontes: RA ∈ [0°, 360°), Dec ∈ [-90°, +90°], Flux ≥ 0.
    *   [x] Tabela interativa com coluna "Tipo" (ponto vs Gaussiana) e ordenação por coluna.
    *   [x] Exportação no formato OSKAR de 12 colunas.
*   [x] **Cobertura UV (`uv_coverage.js`):**
    *   [x] Implementar visualização de cobertura UV com Plotly.js.
    *   [x] Aceleração WebGPU com shader WGSL (workgroup_size 64) para ≥10 estações.
    *   [x] Fallback automático para CPU (`_computeUVonCPU`).
    *   [x] Incluir componente Bz no cálculo de baselines 3D.
*   [x] **Exportação e Coordenadas:**
    *   [x] Corrigir ordem de coordenadas: `layout_wgs84.txt` e `position.txt` para lon,lat,alt.
    *   [x] Implementar seletor de formato (WGS84/ECEF/ENU) com radio buttons e tooltips.
    *   [x] Remover textarea WGS84 standalone; consolidar no seletor de rádio.
    *   [x] ZIP export lê de `export-layout-wgs84-alt`.
*   [x] **Mapa Interativo:**
    *   [x] Implementar Ctrl+scroll zoom com overlay de mensagem (1.5s).
    *   [x] Adicionar toggle de distância no mapa.
    *   [x] Atualizar Leaflet CDN de 1.7.1 → 1.9.4.
*   [x] **Correções de Bugs:**
    *   [x] Corrigir race condition no heatmap (worker retorna `layoutHash` para validação).
    *   [x] Corrigir cache de heatmap para evitar dados obsoletos.
    *   [x] Adicionar tooltip de intensidade no mapa de calor.
    *   [x] Melhorar sincronização de workers.
*   [x] **Infraestrutura:**
    *   [x] Atualizar BUILD.md com seções Linux e macOS.
    *   [x] Python `telescope_gen.py`: substituir caminhos hardcoded por `os.path.dirname` + `argparse`.
    *   [x] Adicionar campo de nome de arquivo de imagem customizável.
    *   [x] Habilitar carregamento local de dados.

---

## 🔮 Futuras Melhorias e Adições

### 🎯 Alta Prioridade

*   [ ] **Aceleração de Cálculos com WebGPU**:
    *   [ ] Expandir uso de WebGPU para cálculos de PSF e heatmap.
    *   [ ] Implementar fallback automático para CPU quando WebGPU não estiver disponível.
*   [ ] **Otimização de Performance do Heatmap**:
    *   [ ] Implementar renderização progressiva (baixa resolução → alta resolução).
    *   [ ] Adicionar cache de tiles renderizados.
    *   [ ] Considerar WebGL para renderização do heatmap.
*   [ ] **Modo Offline/PWA**:
    *   [ ] Implementar Service Worker para funcionamento offline.
    *   [ ] Armazenar dados E-field em IndexedDB após primeiro download.
    *   [ ] Adicionar manifest.json para instalação como PWA.

### 🔧 Funcionalidades Avançadas de Layout

*   [ ] **Mais Algoritmos de Layout**:
    *   [ ] Implementar layouts otimizados para baixa redundância (algoritmo de minimização de sidelobes).
    *   [ ] Layouts baseados em otimização por algoritmos genéticos.
    *   [x] Layout Y-shaped (formato em Y) comum em radioastronomia. *(implementado em v1.0.3 no StationManager)*
    *   [x] Layout logarítmico-espiral. *(implementado em v1.0.3 no StationManager)*
*   [ ] **Editor de Layout Manual Avançado**:
    *   [ ] Ferramentas de alinhamento (alinhar à grade, alinhar horizontalmente/verticalmente).
    *   [ ] Ferramentas de distribuição (distribuir uniformemente).
    *   [ ] Seleção múltipla de tiles com Shift+Click.
    *   [ ] Rotação de grupos de tiles.
*   [ ] **Layout de Múltiplas Estações (Outriggers)**:
    *   [ ] Visualizar e configurar layouts para múltiplas estações simultaneamente no gerador.
    *   [ ] Calcular baseline coverage UV para arranjo de múltiplas estações.

### 📊 Simulação e Análise Aprimoradas

*   [ ] **Padrões de Elemento de Antena Customizáveis**:
    *   [ ] Permitir upload de arquivos de padrão de elemento (formato OSKAR, CST, GRASP).
    *   [ ] Biblioteca de padrões de elemento pré-carregados (dipolo, Vivaldi, patch, horn).
*   [ ] **Análise de PSF Mais Detalhada**:
    *   [ ] Cálculo de FWHM (Full Width at Half Maximum) do lóbulo principal.
    *   [ ] Identificação e listagem dos níveis dos lóbulos laterais mais altos.
    *   [ ] Visualização 2D/3D da própria PSF como superfície.
    *   [ ] Comparação lado-a-lado de PSFs de diferentes layouts.
*   [x] **Análise de Cobertura UV**: *(implementado em v1.0.3)*
    *   [x] Plotar a cobertura no plano UV para o arranjo gerado.
    *   [x] Simular cobertura UV ao longo de diferentes horas de observação (Earth rotation synthesis).
    *   [ ] Calcular métricas de cobertura UV (filling factor, gaps).
*   [ ] **Simulação de Observação**:
    *   [ ] Simular imagem de fonte pontual com o beam pattern atual.
    *   [ ] Adicionar fontes estendidas e simular imagem resultante.
    *   [ ] Considerar efeitos de ruído térmico e sistemáticos básicos.

### 🖥️ Interface do Usuário e Experiência

*   [ ] **Desfazer/Refazer (Undo/Redo)**:
    *   [ ] Para ações no gerador de layout.
    *   [ ] Histórico de alterações navegável.
*   [ ] **Internacionalização (i18n)**:
    *   [ ] Suporte para múltiplos idiomas (Inglês, Português, Espanhol).
    *   [ ] Detecção automática de idioma do navegador.
*   [ ] **Guia do Usuário / Tutoriais Interativos**:
    *   [ ] Incorporar ajuda contextual com tooltips explicativos.
    *   [ ] Tour guiado interativo para novos usuários.
    *   [ ] Vídeos tutoriais incorporados.
*   [ ] **Melhorias de Acessibilidade (A11Y)**:
    *   [ ] Revisão completa para conformidade com WCAG 2.1 AA.
    *   [ ] Navegação completa por teclado.
    *   [ ] Suporte a leitores de tela melhorado.
*   [ ] **Salvar Estado da Aplicação**:
    *   [ ] Usar `localStorage` para persistir o estado da UI entre sessões.
    *   [ ] Permitir salvar/carregar múltiplos "projetos" nomeados.
*   [ ] **Dashboard de Comparação**:
    *   [ ] Permitir comparar métricas de múltiplos layouts lado a lado.
    *   [ ] Gráficos comparativos de PSF, beam width, SLL.

### 🚀 Performance e Backend

*   [ ] **Otimização de Performance**:
    *   [ ] Perfilamento de código JavaScript para identificar gargalos.
    *   [ ] Considerar WebAssembly para partes críticas de cálculo.
    *   [ ] Lazy loading de módulos não essenciais.
*   [ ] **Backend (Opcional, para funcionalidades avançadas)**:
    *   [ ] Contas de usuário para salvar layouts e configurações na nuvem.
    *   [ ] Compartilhamento de layouts via URL.
    *   [ ] Execução de simulações OSKAR mais complexas no servidor.
    *   [ ] API REST para integração com outros softwares.

### 🧪 Testes e Manutenção

*   [ ] **Testes Automatizados**:
    *   [ ] Implementar testes unitários para módulos JavaScript críticos (ex: `bingo_layouts.js`).
    *   [ ] Implementar testes de integração.
    *   [ ] Configurar testes End-to-End (E2E) com Playwright ou Cypress.
*   [ ] **CI/CD (Integração Contínua / Entrega Contínua)**:
    *   [ ] Configurar pipeline GitHub Actions para automação de testes.
    *   [ ] Deploy automático para GitHub Pages após merge em main.
    *   [ ] Verificação automática de vulnerabilidades com Dependabot.
*   [ ] **Atualização de Dependências**:
    *   [ ] Revisar e atualizar bibliotecas de terceiros periodicamente.
    *   [ ] Monitorar alertas de segurança de dependências.

### 📦 Exportação e Integração

*   [ ] **Mais Formatos de Exportação**:
    *   [ ] Exportar para formato CASA (Common Astronomy Software Applications).
    *   [ ] Exportar para formato MeerKAT/SKA.
    *   [ ] Exportar imagem do beam pattern em alta resolução.
    *   [ ] Exportar dados brutos em CSV/JSON.
*   [ ] **Validação de Configurações OSKAR**:
    *   [ ] Checagens básicas nos dados exportados para garantir compatibilidade.
    *   [ ] Warnings para configurações potencialmente problemáticas.
*   [ ] **Integração com Ferramentas Externas**:
    *   [ ] Plugin/extensão para CASA.
    *   [ ] Integração com JupyterLab.

### 🌐 Infraestrutura

*   [ ] **Migração de Dados E-field**:
    *   [ ] Considerar CDN próprio além de IPFS para maior confiabilidade.
    *   [ ] Implementar compressão de dados (gzip/brotli).
    *   [ ] Versionar dados E-field para diferentes configurações de antena.
*   [ ] **Monitoramento e Analytics**:
    *   [ ] Implementar analytics respeitando privacidade (Plausible, Umami).
    *   [ ] Monitorar erros em produção (Sentry).
    *   [ ] Dashboard de métricas de uso.