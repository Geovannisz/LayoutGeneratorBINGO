# Plano de Desenvolvimento: Gerador de Layout BINGO

Este documento rastreia as tarefas concluídas, em andamento e futuras para o projeto.

## Legenda
- `[x]` Tarefa Concluída
- `[ ]` Tarefa Pendente
- `[~]` Tarefa Supersedida/Removida
- `[-]` Item Adiado ou Descopado (Pode ser reavaliado no futuro)

---

## 🎯 Objetivos de Curto Prazo (Sprint Atual / Próximo)

- `[ ]` **Testes Unitários e de Integração:**
    - `[ ]` Expandir cobertura de testes para `bingo_layouts.js`.
    - `[ ]` Adicionar testes para `generator.js`, especialmente para interações de UI e lógica de import/export.
- `[ ]` **Refinamentos de UI/UX:**
    - `[ ]` Melhorar feedback visual durante operações de arrastar e soltar (ex: tile semi-transparente).
    - `[ ]` Considerar um mini-mapa ou zoom/pan mais robusto para layouts grandes.
    - `[ ]` Adicionar tooltips descritivos para parâmetros complexos.
- `[ ]` **Documentação:**
    - `[ ]` Gerar JSDoc para `bingo_layouts.js` e `generator.js`.
    - `[ ]` Atualizar `README.md` com as novas funcionalidades e instruções de uso.

---

## 🔮 Futuras Melhorias e Adições

### Interface e Visualização
- `[ ]` **Visualização de Antenas Individuais:**
    - `[ ]` Opção para mostrar/ocultar antenas individuais dentro dos tiles.
    - `[ ]` Zoom para nível de antena.
- `[ ]` **Temas Adicionais:**
    - `[ ]` Permitir mais customização de cores ou temas predefinidos (ex: alto contraste).
- `[ ]` **Informações Detalhadas do Tile:**
    - `[ ]` Ao clicar em um tile, mostrar suas coordenadas exatas e status.

### Funcionalidades Avançadas de Layout
- `[~]` Mais Algoritmos de Layout: (Superseded by Densidade Avançada)
    - `[~]` Layouts otimizados para baixa redundância ou outras métricas específicas.
- `[~]` Layouts baseados em funções de densidade. (Replaced by Densidade Avançada)
- `[x]` **Layouts de Densidade Avançada Implementados**
    - `[x]` Suporte para múltiplos perfis de densidade: Gaussiana, Exponencial, Linear Decrescente, Log-Normal, Cauchy, Weibull.
    - `[x]` UI dinâmica para parâmetros específicos de cada perfil.
    - `[x]` Implementado 'Fator de Influência da Densidade' para balancear o perfil com aleatoriedade.
    - `[x]` Parâmetros padrão ajustados para maior clareza visual dos perfis.
- `[x]` **Importação/Exportação de Configurações de Layout:** Salvar/Carregar parâmetros de layout e **posições atuais dos tiles** em formato JSON.
- `[~]` Editor de Layout Manual Avançado dedicated mode. (Replaced by universal drag-and-drop)
    - `[-]` Ferramentas de alinhamento e distribuição. (Removidas, podem ser reavaliadas)
- `[x]` **Universal Tile Drag-and-Drop:** Permitir arrastar e soltar tiles individuais no canvas para todos os tipos de layout.
    - `[x]` Funcionalidade de arrastar e soltar tiles habilitada para todos os tipos de layout diretamente no canvas.
    - `[x]` Atualizações em tempo real da visualização, colisões e dados relacionados durante o arraste.
- `[x]` **Melhoria na Importação/Exportação de Configurações**
    - `[x]` Exportação agora salva as posições exatas dos tiles (`currentTileLayout`) além dos parâmetros de geração.
    - `[x]` Importação prioriza `currentTileLayout` se presente, restaurando modificações manuais.
    - `[x]` Texto dos botões de Importar/Exportar atualizados para "(ícone) Importar" e "(ícone) Exportar".
    - `[x]` Estilo (tamanho, cores) dos botões de Importar/Exportar ajustados para consistência visual.
- `[ ]` **Otimização de Layout Pós-Geração:**
    - `[ ]` Algoritmos para ajustar posições para minimizar colisões ou melhorar espaçamento após a geração inicial ou modificação manual.
- `[ ]` **Layouts Multi-Camadas/Agrupados:**
    - `[ ]` Suporte para definir grupos de tiles com diferentes parâmetros ou tipos de layout dentro de uma cena maior.

### Performance
- `[ ]` **Otimização de Desenho:**
    - `[ ]` Investigar técnicas de renderização mais eficientes para layouts muito grandes (ex: WebGL ou offscreen canvas para partes estáticas).
- `[ ]` **Cálculos em Web Workers:**
    - `[ ]` Descarregar cálculos pesados de geração de layout ou checagem de colisão para Web Workers para não bloquear a UI.

### Outras
- `[ ]` **Integração com Mapa Interativo (se aplicável):**
    - `[ ]` Melhorar a comunicação e sincronização de dados se houver um componente de mapa externo.
- `[ ]` **Desfazer/Refazer (Undo/Redo):**
    - `[ ]` Implementar histórico de ações para operações de edição manual (drag-and-drop, etc.).

---

## ✅ Concluído Recentemente
*Ver itens marcados com `[x]` nas seções acima.*

---

Este `TODO.md` será atualizado conforme o projeto evolui.
Prioridades podem mudar baseadas em feedback e necessidades emergentes.
Última atualização: (Data da última modificação - a ser preenchida manualmente ou por script)
