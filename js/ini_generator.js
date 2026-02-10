/**
 * ini_generator.js
 *
 * @fileoverview Módulo gerador de arquivos .ini de configuração para o simulador OSKAR.
 *
 * @description Permite ao usuário configurar os parâmetros de simulação do OSKAR
 * organizados em categorias (Essenciais, Recomendados e Avançados), gerar a
 * pré-visualização do arquivo .ini, validar campos e exportar/copiar o resultado.
 *
 * @requires BingoConstants
 * @author Geovanni Fernandes Garcia
 * @version 1.0.2
 */

'use strict';

// Constantes do BINGO Central - usar BingoConstants quando disponível
const INI_BINGO_LATITUDE = (typeof BingoConstants !== 'undefined') ? BingoConstants.BINGO_LATITUDE : -7.04067;
const INI_BINGO_LONGITUDE = (typeof BingoConstants !== 'undefined') ? BingoConstants.BINGO_LONGITUDE : -38.26884;
const INI_BINGO_ALTITUDE = (typeof BingoConstants !== 'undefined') ? BingoConstants.BINGO_ALTITUDE : 396.4;

/**
 * Definição dos parâmetros OSKAR suportados pelo gerador.
 * Cada entrada descreve um parâmetro de configuração do .ini.
 * @constant {Array<Object>}
 */
const OSKAR_INI_PARAMS = Object.freeze([
    // =========================================================================
    // [simulator]
    // =========================================================================
    {
        key: 'max_sources_per_chunk',
        section: 'simulator',
        label: 'Fontes por bloco',
        tooltip: 'Número máximo de fontes de céu processadas simultaneamente por bloco de memória. ' +
                 'Valores maiores usam mais memória da GPU, mas podem ser mais rápidos. ' +
                 'Reduza se ocorrerem erros de falta de memória na GPU.',
        type: 'number',
        defaultValue: 16384,
        category: 'advanced'
    },
    {
        key: 'double_precision',
        section: 'simulator',
        label: 'Precisão dupla',
        tooltip: 'Ativa cálculos em precisão dupla (64 bits) em vez de precisão simples (32 bits). ' +
                 'Precisão dupla é mais exata, porém significativamente mais lenta na GPU. ' +
                 'Use "true" para simulações de alta fidelidade.',
        type: 'select',
        defaultValue: 'false',
        category: 'advanced',
        options: [
            { value: 'true', label: 'Sim (mais preciso, mais lento)' },
            { value: 'false', label: 'Não (mais rápido, precisão simples)' }
        ]
    },
    {
        key: 'keep_log_file',
        section: 'simulator',
        label: 'Manter log',
        tooltip: 'Quando habilitado, o OSKAR salva um arquivo de log detalhado com informações ' +
                 'sobre o progresso e eventuais erros da simulação. Útil para depuração.',
        type: 'select',
        defaultValue: 'true',
        category: 'advanced',
        options: [
            { value: 'true', label: 'Sim' },
            { value: 'false', label: 'Não' }
        ]
    },

    // =========================================================================
    // [sky]
    // =========================================================================
    {
        key: 'oskar_sky_model/file',
        section: 'sky',
        label: 'Arquivo do modelo de céu',
        tooltip: 'Caminho para o arquivo do modelo de céu (.osm ou .txt) contendo as fontes ' +
                 'a serem simuladas. Cada linha define uma fonte com posição (RA, Dec) e fluxo. ' +
                 'Este é um parâmetro obrigatório para executar a simulação.',
        type: 'text',
        defaultValue: '',
        category: 'essential',
        required: true
    },

    // =========================================================================
    // [observation]
    // =========================================================================
    {
        key: 'start_frequency_hz',
        section: 'observation',
        label: 'Frequência inicial (Hz)',
        tooltip: 'Frequência central do primeiro canal de observação, em Hertz. ' +
                 'Para o BINGO, a faixa de operação é de 980 MHz a 1260 MHz. ' +
                 'Exemplo: 980000000 para 980 MHz.',
        type: 'number',
        defaultValue: 980000000,
        category: 'essential',
        required: true
    },
    {
        key: 'num_channels',
        section: 'observation',
        label: 'Número de canais',
        tooltip: 'Quantidade de canais de frequência na observação. Cada canal é separado pelo ' +
                 'incremento de frequência definido abaixo. Para o BINGO com banda de 280 MHz ' +
                 'e resolução de 1 MHz, use 280 canais.',
        type: 'number',
        defaultValue: 1,
        category: 'essential',
        required: true
    },
    {
        key: 'frequency_inc_hz',
        section: 'observation',
        label: 'Incremento de frequência (Hz)',
        tooltip: 'Separação entre canais de frequência consecutivos, em Hertz. ' +
                 'Define a resolução espectral da simulação. ' +
                 'Exemplo: 1000000 para incrementos de 1 MHz.',
        type: 'number',
        defaultValue: 1000000,
        category: 'recommended'
    },
    {
        key: 'phase_centre_ra_deg',
        section: 'observation',
        label: 'Centro de fase - AR (graus)',
        tooltip: 'Ascensão reta do centro de fase da observação, em graus decimais. ' +
                 'Define a direção de apontamento do telescópio no eixo de ascensão reta. ' +
                 'Para trânsito no meridiano, use 0.0.',
        type: 'number',
        defaultValue: 0.0,
        category: 'essential',
        required: true
    },
    {
        key: 'phase_centre_dec_deg',
        section: 'observation',
        label: 'Centro de fase - Dec (graus)',
        tooltip: 'Declinação do centro de fase da observação, em graus decimais. ' +
                 'Para o BINGO, a declinação típica de apontamento é próxima da latitude ' +
                 'do sítio (-7.04°). Valores válidos: -90 a +90.',
        type: 'number',
        defaultValue: -7.04,
        category: 'essential',
        required: true
    },
    {
        key: 'start_time_utc',
        section: 'observation',
        label: 'Hora de início (UTC)',
        tooltip: 'Data e hora de início da observação no formato UTC. ' +
                 'Use o formato "dd-MM-yyyy HH:mm:ss.SSS" (ex: "01-01-2025 00:00:00.000"). ' +
                 'O horário afeta a posição aparente das fontes no céu.',
        type: 'text',
        defaultValue: '01-01-2025 00:00:00.000',
        category: 'essential',
        required: true
    },
    {
        key: 'length',
        section: 'observation',
        label: 'Duração da observação (s)',
        tooltip: 'Duração total da observação em segundos. ' +
                 'Exemplo: 3600 para uma observação de 1 hora, 86400 para 24 horas. ' +
                 'A duração afeta a cobertura (u,v) do interferômetro.',
        type: 'number',
        defaultValue: 3600,
        category: 'essential',
        required: true
    },
    {
        key: 'num_time_steps',
        section: 'observation',
        label: 'Número de passos de tempo',
        tooltip: 'Quantidade de amostras temporais dentro da duração total da observação. ' +
                 'O intervalo de integração será duração/num_time_steps. ' +
                 'Mais passos melhoram a cobertura (u,v), mas aumentam o tempo de simulação.',
        type: 'number',
        defaultValue: 24,
        category: 'essential',
        required: true
    },
    {
        key: 'mode',
        section: 'observation',
        label: 'Modo de observação',
        tooltip: 'Modo de operação do telescópio durante a observação. ' +
                 '"Tracking" acompanha uma posição fixa no céu (modo padrão para interferômetros). ' +
                 '"Drift Scan" mantém o telescópio fixo enquanto o céu se move (modo típico do BINGO).',
        type: 'select',
        defaultValue: 'Tracking',
        category: 'recommended',
        options: [
            { value: 'Tracking', label: 'Tracking (rastreio)' },
            { value: 'Drift Scan', label: 'Drift Scan (trânsito)' }
        ]
    },

    // =========================================================================
    // [telescope]
    // =========================================================================
    {
        key: 'input_dir',
        section: 'telescope',
        label: 'Diretório do telescópio',
        tooltip: 'Caminho para o diretório contendo os arquivos de definição do telescópio OSKAR. ' +
                 'Este diretório deve conter layout.txt, position.txt e subdiretórios das estações. ' +
                 'Use o módulo de exportação para gerar estes arquivos.',
        type: 'text',
        defaultValue: '',
        category: 'essential',
        required: true
    },
    {
        key: 'longitude_deg',
        section: 'telescope',
        label: 'Longitude do telescópio (graus)',
        tooltip: 'Longitude geodésica do centro de referência do telescópio, em graus decimais. ' +
                 'Para o BINGO, a longitude é ' + INI_BINGO_LONGITUDE + '° (Paraíba, Brasil). ' +
                 'Usada para converter coordenadas locais em celestes.',
        type: 'number',
        defaultValue: INI_BINGO_LONGITUDE,
        category: 'recommended'
    },
    {
        key: 'latitude_deg',
        section: 'telescope',
        label: 'Latitude do telescópio (graus)',
        tooltip: 'Latitude geodésica do centro de referência do telescópio, em graus decimais. ' +
                 'Para o BINGO, a latitude é ' + INI_BINGO_LATITUDE + '° (Paraíba, Brasil). ' +
                 'Usada para converter coordenadas locais em celestes.',
        type: 'number',
        defaultValue: INI_BINGO_LATITUDE,
        category: 'recommended'
    },
    {
        key: 'pol_mode',
        section: 'telescope',
        label: 'Modo de polarização',
        tooltip: 'Define o modo de polarização simulado. ' +
                 '"Scalar" simula apenas uma polarização (mais rápido). ' +
                 '"Full" simula as 4 correlações de polarização (XX, XY, YX, YY).',
        type: 'select',
        defaultValue: 'Scalar',
        category: 'advanced',
        options: [
            { value: 'Scalar', label: 'Scalar (uma polarização)' },
            { value: 'Full', label: 'Full (polarização completa)' }
        ]
    },

    // =========================================================================
    // [interferometer]
    // =========================================================================
    {
        key: 'oskar_vis_filename',
        section: 'interferometer',
        label: 'Arquivo de visibilidades',
        tooltip: 'Caminho e nome do arquivo de saída para as visibilidades simuladas (.vis). ' +
                 'Este arquivo conterá os dados de correlação cruzada entre todas as linhas de base. ' +
                 'Exemplo: "output/bingo_sim.vis".',
        type: 'text',
        defaultValue: 'output/bingo_sim.vis',
        category: 'essential',
        required: true
    },
    {
        key: 'channel_bandwidth_hz',
        section: 'interferometer',
        label: 'Largura de banda do canal (Hz)',
        tooltip: 'Largura de banda de cada canal de frequência individual, em Hertz. ' +
                 'Usado para a decorrelação em largura de banda (bandwidth smearing). ' +
                 'Geralmente igual ao incremento de frequência.',
        type: 'number',
        defaultValue: 1000000,
        category: 'recommended'
    },
    {
        key: 'time_average_sec',
        section: 'interferometer',
        label: 'Média temporal (s)',
        tooltip: 'Intervalo de média temporal das visibilidades, em segundos. ' +
                 'Usado para simular a decorrelação temporal (time smearing). ' +
                 'Valores típicos: 1 a 10 segundos.',
        type: 'number',
        defaultValue: 1.0,
        category: 'recommended'
    },
    {
        key: 'max_time_samples_per_block',
        section: 'interferometer',
        label: 'Amostras por bloco',
        tooltip: 'Número máximo de amostras temporais processadas por bloco na correlação. ' +
                 'Valores maiores usam mais memória. Reduza se a GPU ficar sem memória. ' +
                 'Valor padrão de 8 é adequado para a maioria dos casos.',
        type: 'number',
        defaultValue: 8,
        category: 'advanced'
    },
    {
        key: 'correlation_type',
        section: 'interferometer',
        label: 'Tipo de correlação',
        tooltip: 'Define quais correlações são calculadas. ' +
                 '"Cross-correlations" calcula apenas linhas de base cruzadas (padrão para interferometria). ' +
                 '"Auto-correlations" calcula apenas auto-correlações. ' +
                 '"Both" calcula ambas.',
        type: 'select',
        defaultValue: 'Cross-correlations',
        category: 'advanced',
        options: [
            { value: 'Cross-correlations', label: 'Cross-correlations (cruzadas)' },
            { value: 'Auto-correlations', label: 'Auto-correlations (auto)' },
            { value: 'Both', label: 'Both (ambas)' }
        ]
    }
]);

/**
 * Rótulos legíveis para as seções do INI.
 * @constant {Object<string, string>}
 */
const INI_SECTION_LABELS = Object.freeze({
    simulator: 'Simulador',
    sky: 'Modelo de Céu',
    observation: 'Observação',
    telescope: 'Telescópio',
    interferometer: 'Interferômetro'
});

/**
 * Rótulos e ordem das categorias de parâmetros.
 * @constant {Array<Object>}
 */
const INI_CATEGORIES = Object.freeze([
    { id: 'essential',    label: 'Essenciais',   icon: 'fa-star',       collapsible: false },
    { id: 'recommended',  label: 'Recomendados', icon: 'fa-thumbs-up',  collapsible: false },
    { id: 'advanced',     label: 'Avançados',    icon: 'fa-cogs',       collapsible: true  }
]);

// =============================================================================
// Classe principal
// =============================================================================

class OskarIniGenerator {
    constructor() {
        /** @type {Object<string, HTMLElement>} Referências aos inputs por chave composta seção.key */
        this.inputElements = {};

        /** @type {HTMLElement|null} */
        this.paramsContainer = document.getElementById('ini-params-container');
        /** @type {HTMLTextAreaElement|null} */
        this.previewTextarea = document.getElementById('ini-preview');
        /** @type {HTMLElement|null} */
        this.validationContainer = document.getElementById('ini-validation-messages');

        this._bindButtons();
        this.renderParameters();
        this.updatePreview();

        console.log('OskarIniGenerator inicializado com sucesso.');
    }

    // =========================================================================
    // Inicialização e bindagem de eventos
    // =========================================================================

    /**
     * Liga os botões da UI às suas respectivas ações.
     * @private
     */
    _bindButtons() {
        const copyBtn = document.getElementById('ini-copy-btn');
        const downloadBtn = document.getElementById('ini-download-btn');
        const fillBtn = document.getElementById('ini-fill-from-layout-btn');

        if (copyBtn) copyBtn.addEventListener('click', (e) => { e.preventDefault(); this.copyIni(); });
        if (downloadBtn) downloadBtn.addEventListener('click', (e) => { e.preventDefault(); this.downloadIni(); });
        if (fillBtn) fillBtn.addEventListener('click', (e) => { e.preventDefault(); this.fillFromLayout(); });
    }

    // =========================================================================
    // Renderização de parâmetros
    // =========================================================================

    /**
     * Renderiza todos os inputs de parâmetros agrupados por categoria e seção.
     */
    renderParameters() {
        if (!this.paramsContainer) {
            console.warn('Container ini-params-container não encontrado no DOM.');
            return;
        }
        this.paramsContainer.innerHTML = '';
        this.inputElements = {};

        INI_CATEGORIES.forEach(cat => {
            const params = OSKAR_INI_PARAMS.filter(p => p.category === cat.id);
            if (params.length === 0) return;

            // Wrapper da categoria
            const catWrapper = document.createElement('div');
            catWrapper.className = `ini-category ini-category--${cat.id}`;

            // Cabeçalho da categoria
            const catHeader = document.createElement('div');
            catHeader.className = 'ini-category__header';
            catHeader.innerHTML = `<i class="fas ${cat.icon}"></i> <span>${cat.label}</span>`;

            // Corpo (colapsável para avançados)
            const catBody = document.createElement('div');
            catBody.className = 'ini-category__body';

            if (cat.collapsible) {
                catBody.style.display = 'none';
                const toggleIcon = document.createElement('i');
                toggleIcon.className = 'fas fa-chevron-down ini-category__toggle';
                catHeader.appendChild(toggleIcon);
                catHeader.style.cursor = 'pointer';
                catHeader.addEventListener('click', () => {
                    const isHidden = catBody.style.display === 'none';
                    catBody.style.display = isHidden ? '' : 'none';
                    toggleIcon.classList.toggle('fa-chevron-down', !isHidden);
                    toggleIcon.classList.toggle('fa-chevron-up', isHidden);
                });
            }

            // Agrupa parâmetros desta categoria por seção
            const sectionOrder = ['simulator', 'sky', 'observation', 'telescope', 'interferometer'];
            const grouped = {};
            params.forEach(p => {
                if (!grouped[p.section]) grouped[p.section] = [];
                grouped[p.section].push(p);
            });

            sectionOrder.forEach(sec => {
                if (!grouped[sec]) return;
                const sectionDiv = document.createElement('fieldset');
                sectionDiv.className = 'ini-section';
                const legend = document.createElement('legend');
                legend.textContent = INI_SECTION_LABELS[sec] || sec;
                sectionDiv.appendChild(legend);

                grouped[sec].forEach(param => {
                    sectionDiv.appendChild(this._createParamRow(param));
                });

                catBody.appendChild(sectionDiv);
            });

            catWrapper.appendChild(catHeader);
            catWrapper.appendChild(catBody);
            this.paramsContainer.appendChild(catWrapper);
        });
    }

    /**
     * Cria a linha de input para um parâmetro individual.
     * @private
     * @param {Object} param Definição do parâmetro.
     * @returns {HTMLElement}
     */
    _createParamRow(param) {
        const row = document.createElement('div');
        row.className = 'ini-param-row';
        if (param.required) row.classList.add('ini-param-row--required');

        // Label
        const label = document.createElement('label');
        const inputId = `ini-input-${param.section}-${param.key.replace(/[/.]/g, '_')}`;
        label.setAttribute('for', inputId);
        label.textContent = param.label;
        if (param.required) {
            const req = document.createElement('span');
            req.className = 'ini-required-mark';
            req.textContent = ' *';
            label.appendChild(req);
        }

        // Tooltip
        const tooltipIcon = document.createElement('i');
        tooltipIcon.className = 'fas fa-question-circle ini-tooltip-icon';
        tooltipIcon.title = param.tooltip;
        label.appendChild(tooltipIcon);

        // Input
        let input;
        if (param.type === 'select' && param.options) {
            input = document.createElement('select');
            param.options.forEach(opt => {
                const option = document.createElement('option');
                option.value = opt.value;
                option.textContent = opt.label;
                if (String(opt.value) === String(param.defaultValue)) option.selected = true;
                input.appendChild(option);
            });
        } else if (param.type === 'checkbox') {
            input = document.createElement('input');
            input.type = 'checkbox';
            input.checked = !!param.defaultValue;
        } else {
            input = document.createElement('input');
            input.type = param.type === 'number' ? 'number' : 'text';
            if (param.type === 'number') input.step = 'any';
            input.value = param.defaultValue !== undefined ? param.defaultValue : '';
        }

        input.id = inputId;
        input.className = 'ini-param-input';
        input.dataset.iniKey = param.key;
        input.dataset.iniSection = param.section;

        // Atualiza preview ao alterar valor
        input.addEventListener('change', () => this.updatePreview());
        input.addEventListener('input', () => this.updatePreview());

        // Mensagem de erro inline
        const errorSpan = document.createElement('span');
        errorSpan.className = 'ini-field-error';

        // Armazena referência
        const compositeKey = `${param.section}.${param.key}`;
        this.inputElements[compositeKey] = input;

        row.appendChild(label);
        row.appendChild(input);
        row.appendChild(errorSpan);
        return row;
    }

    // =========================================================================
    // Geração do conteúdo INI
    // =========================================================================

    /**
     * Gera o conteúdo completo do arquivo .ini a partir dos valores atuais.
     * @returns {string} Conteúdo formatado do arquivo .ini.
     */
    generateIni() {
        const sections = {};

        OSKAR_INI_PARAMS.forEach(param => {
            const compositeKey = `${param.section}.${param.key}`;
            const input = this.inputElements[compositeKey];
            if (!input) return;

            let value;
            if (param.type === 'checkbox') {
                value = input.checked ? 'true' : 'false';
            } else {
                value = input.value;
            }

            // Omite parâmetros com valor vazio (não obrigatórios)
            if (value === '' && !param.required) return;

            if (!sections[param.section]) sections[param.section] = [];
            sections[param.section].push({ key: param.key, value });
        });

        // Monta string INI
        const sectionOrder = ['simulator', 'sky', 'observation', 'telescope', 'interferometer'];
        const lines = [];

        sectionOrder.forEach(sec => {
            if (!sections[sec] || sections[sec].length === 0) return;
            lines.push(`[${sec}]`);
            sections[sec].forEach(entry => {
                lines.push(`${entry.key}=${entry.value}`);
            });
            lines.push(''); // linha em branco entre seções
        });

        return lines.join('\n');
    }

    // =========================================================================
    // Preview
    // =========================================================================

    /**
     * Atualiza o textarea de pré-visualização com o conteúdo INI atual.
     */
    updatePreview() {
        if (!this.previewTextarea) return;
        this.previewTextarea.value = this.generateIni();
    }

    // =========================================================================
    // Validação
    // =========================================================================

    /**
     * Valida todos os campos e exibe mensagens de erro.
     * @returns {boolean} true se todos os campos estão válidos.
     */
    validateFields() {
        const errors = [];
        let allValid = true;

        OSKAR_INI_PARAMS.forEach(param => {
            const compositeKey = `${param.section}.${param.key}`;
            const input = this.inputElements[compositeKey];
            if (!input) return;

            const row = input.closest('.ini-param-row');
            const errorSpan = row ? row.querySelector('.ini-field-error') : null;
            let errorMsg = '';

            const value = (param.type === 'checkbox') ? input.checked : input.value;

            // Campo obrigatório vazio
            if (param.required && (value === '' || value === null || value === undefined)) {
                errorMsg = 'Campo obrigatório.';
            }

            // Validação numérica
            if (!errorMsg && param.type === 'number' && value !== '') {
                const num = Number(value);
                if (isNaN(num)) {
                    errorMsg = 'Valor numérico inválido.';
                }
            }

            // Validações cruzadas
            if (!errorMsg) {
                errorMsg = this._crossValidate(param, value);
            }

            if (errorMsg) {
                allValid = false;
                errors.push({ label: param.label, section: param.section, message: errorMsg });
                if (input.classList) input.classList.add('ini-input--error');
            } else {
                if (input.classList) input.classList.remove('ini-input--error');
            }

            if (errorSpan) errorSpan.textContent = errorMsg;
        });

        // Mostra resumo de validação
        if (this.validationContainer) {
            if (errors.length === 0) {
                this.validationContainer.innerHTML = '<span class="ini-validation-ok"><i class="fas fa-check-circle"></i> Todos os campos estão válidos.</span>';
            } else {
                const listHtml = errors.map(e =>
                    `<li><strong>[${INI_SECTION_LABELS[e.section] || e.section}] ${e.label}:</strong> ${e.message}</li>`
                ).join('');
                this.validationContainer.innerHTML =
                    `<span class="ini-validation-error"><i class="fas fa-exclamation-triangle"></i> ${errors.length} problema(s) encontrado(s):</span>` +
                    `<ul class="ini-validation-list">${listHtml}</ul>`;
            }
        }

        return allValid;
    }

    /**
     * Realiza validações cruzadas entre campos dependentes.
     * @private
     * @param {Object} param Definição do parâmetro sendo validado.
     * @param {*} value Valor atual do campo.
     * @returns {string} Mensagem de erro ou string vazia se válido.
     */
    _crossValidate(param, value) {
        // Frequência deve ser positiva
        if (param.key === 'start_frequency_hz' && value !== '') {
            if (Number(value) <= 0) return 'A frequência deve ser um valor positivo.';
        }

        // Número de canais >= 1
        if (param.key === 'num_channels' && value !== '') {
            if (Number(value) < 1) return 'Deve haver pelo menos 1 canal.';
        }

        // Incremento de frequência positivo quando há múltiplos canais
        if (param.key === 'frequency_inc_hz' && value !== '') {
            const numChannelsInput = this.inputElements['observation.num_channels'];
            if (numChannelsInput && Number(numChannelsInput.value) > 1 && Number(value) <= 0) {
                return 'O incremento deve ser positivo quando há múltiplos canais.';
            }
        }

        // Duração e passos de tempo devem ser positivos
        if (param.key === 'length' && value !== '') {
            if (Number(value) <= 0) return 'A duração deve ser positiva.';
        }
        if (param.key === 'num_time_steps' && value !== '') {
            if (Number(value) < 1) return 'Deve haver pelo menos 1 passo de tempo.';
        }

        // Declinação no intervalo válido
        if (param.key === 'phase_centre_dec_deg' && value !== '') {
            const dec = Number(value);
            if (dec < -90 || dec > 90) return 'A declinação deve estar entre -90° e +90°.';
        }

        return '';
    }

    // =========================================================================
    // Preenchimento automático a partir do layout
    // =========================================================================

    /**
     * Preenche os campos do telescópio a partir dos dados do layout/mapa atuais.
     */
    fillFromLayout() {
        // Longitude e latitude do BINGO
        const lonInput = this.inputElements['telescope.longitude_deg'];
        const latInput = this.inputElements['telescope.latitude_deg'];

        if (lonInput) { lonInput.value = INI_BINGO_LONGITUDE; }
        if (latInput) { latInput.value = INI_BINGO_LATITUDE; }

        // Tenta obter o diretório de exportação se disponível
        const dirInput = this.inputElements['telescope.input_dir'];
        if (dirInput && !dirInput.value) {
            dirInput.value = 'telescope';
        }

        // Declinação aproximada = latitude
        const decInput = this.inputElements['observation.phase_centre_dec_deg'];
        if (decInput) {
            decInput.value = INI_BINGO_LATITUDE;
        }

        // Frequência padrão do BINGO
        const freqInput = this.inputElements['observation.start_frequency_hz'];
        if (freqInput && !freqInput.value) {
            freqInput.value = 980000000;
        }

        this.updatePreview();
        console.log('Campos preenchidos a partir dos dados do layout BINGO.');
    }

    // =========================================================================
    // Download e cópia
    // =========================================================================

    /**
     * Faz o download do arquivo .ini gerado.
     */
    downloadIni() {
        if (!this.validateFields()) {
            console.warn('Download cancelado: há campos com erros de validação.');
            return;
        }

        const content = this.generateIni();
        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'oskar_sim.ini';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        console.log('Arquivo .ini baixado com sucesso.');
    }

    /**
     * Copia o conteúdo INI para a área de transferência.
     */
    copyIni() {
        const content = this.generateIni();
        const copyBtn = document.getElementById('ini-copy-btn');

        if (!navigator.clipboard) {
            // Fallback para navegadores mais antigos (execCommand é deprecated, mas necessário como fallback)
            try {
                if (this.previewTextarea) {
                    this.previewTextarea.select();
                    document.execCommand('copy');
                }
                this._showCopyFeedback(copyBtn, true, 'Copiado (legado)!');
            } catch (err) {
                console.error('Fallback de cópia falhou:', err);
                this._showCopyFeedback(copyBtn, false, 'Falha ao copiar.');
            }
            return;
        }

        navigator.clipboard.writeText(content).then(() => {
            this._showCopyFeedback(copyBtn, true, 'Copiado!');
            console.log('Conteúdo INI copiado para a área de transferência.');
        }).catch(err => {
            console.error('Erro ao copiar com Clipboard API:', err);
            this._showCopyFeedback(copyBtn, false, 'Erro ao copiar.');
        });
    }

    /**
     * Mostra feedback visual no botão de cópia.
     * @private
     * @param {HTMLButtonElement|null} button Botão alvo.
     * @param {boolean} success Indica sucesso.
     * @param {string} message Mensagem de title.
     */
    _showCopyFeedback(button, success, message) {
        if (!button) return;
        const icon = button.querySelector('i');
        if (!icon) return;

        const originalClass = 'fa-copy';
        const feedbackClass = success ? 'fa-check' : 'fa-times';
        const feedbackColor = success ? 'var(--success-color)' : 'var(--secondary-color)';

        icon.classList.remove(originalClass);
        icon.classList.add(feedbackClass);
        button.style.color = feedbackColor;
        button.title = message;

        setTimeout(() => {
            icon.classList.remove(feedbackClass);
            icon.classList.add(originalClass);
            button.style.color = '';
            button.title = 'Copiar para a área de transferência';
        }, 1500);
    }
}

// =============================================================================
// Inicialização
// =============================================================================

document.addEventListener('DOMContentLoaded', () => {
    if (!window.oskarIniGenerator) {
        try {
            window.oskarIniGenerator = new OskarIniGenerator();
            console.log('Instância de OskarIniGenerator criada e configurada.');
        } catch (error) {
            console.error('Erro ao instanciar OskarIniGenerator:', error);
        }
    } else {
        window.oskarIniGenerator.updatePreview();
    }
});
