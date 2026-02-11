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
 * Detecta a quebra de linha adequada para o SO do usuário.
 * Windows usa CRLF (\r\n), Linux/Mac usam LF (\n). Sempre UTF-8.
 * @returns {string} '\r\n' para Windows, '\n' para outros.
 */
function getOsLineEnding() {
    if (typeof navigator === 'undefined') return '\n';
    // Prefere navigator.userAgentData.platform (moderno) com fallback
    const platform = navigator.userAgentData?.platform || navigator.platform || '';
    if (/Win/i.test(platform)) return '\r\n';
    if (/Windows/i.test(navigator.userAgent || '')) return '\r\n';
    return '\n';
}

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
        key: 'double_precision',
        section: 'simulator',
        label: 'Precisão dupla',
        tooltip: 'Ativa cálculos em precisão dupla (64 bits). Mais exato, porém mais lento na GPU.',
        type: 'select',
        defaultValue: 'true',
        category: 'recommended',
        options: [
            { value: 'true', label: 'Sim (mais preciso)' },
            { value: 'false', label: 'Não (mais rápido)' }
        ]
    },
    {
        key: 'use_gpus',
        section: 'simulator',
        label: 'Usar GPUs',
        tooltip: 'Se habilitado, usa dispositivos GPU disponíveis para a simulação.',
        type: 'select',
        defaultValue: 'true',
        category: 'recommended',
        options: [
            { value: 'true', label: 'Sim' },
            { value: 'false', label: 'Não' }
        ]
    },
    {
        key: 'cuda_device_ids',
        section: 'simulator',
        label: 'IDs de dispositivos CUDA',
        tooltip: 'Lista separada por vírgulas de IDs de GPUs, ou "all" para usar todos os dispositivos.',
        type: 'text',
        defaultValue: 'all',
        category: 'advanced'
    },
    {
        key: 'num_devices',
        section: 'simulator',
        label: 'Número de dispositivos',
        tooltip: 'Número de dispositivos de computação (CPU cores ou GPUs). "auto" detecta automaticamente.',
        type: 'text',
        defaultValue: 'auto',
        category: 'advanced'
    },
    {
        key: 'max_sources_per_chunk',
        section: 'simulator',
        label: 'Fontes por bloco',
        tooltip: 'Máximo de fontes processadas por bloco. Reduza se a GPU ficar sem memória.',
        type: 'number',
        defaultValue: 16384,
        category: 'advanced'
    },
    {
        key: 'keep_log_file',
        section: 'simulator',
        label: 'Manter log',
        tooltip: 'Salva um arquivo de log no disco com informações da simulação.',
        type: 'select',
        defaultValue: 'false',
        category: 'advanced',
        options: [
            { value: 'true', label: 'Sim' },
            { value: 'false', label: 'Não' }
        ]
    },
    {
        key: 'write_status_to_log_file',
        section: 'simulator',
        label: 'Status no log',
        tooltip: 'Se habilitado, escreve mensagens de progresso no arquivo de log.',
        type: 'select',
        defaultValue: 'false',
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
        tooltip: 'Caminho para o arquivo do modelo de céu (.osm ou .txt). ' +
                 'Cada linha define uma fonte com posição (RA, Dec), fluxo e outros parâmetros.',
        type: 'text',
        defaultValue: '',
        category: 'essential',
        required: true,
        isFilePath: true,
        fileAccept: '.osm,.txt,.sky'
    },
    {
        key: 'fits_image/file',
        section: 'sky',
        label: 'Arquivo FITS (imagem)',
        tooltip: 'Caminho para arquivo(s) FITS para usar como modelo de céu.',
        type: 'text',
        defaultValue: '',
        category: 'advanced',
        isFilePath: true,
        fileAccept: '.fits,.fit'
    },
    {
        key: 'fits_image/default_map_units',
        section: 'sky',
        label: 'Unidade padrão do mapa FITS',
        tooltip: 'Unidade física dos pixels do mapa FITS, se não especificada no arquivo.',
        type: 'select',
        defaultValue: 'Jy/beam',
        category: 'advanced',
        options: [
            { value: 'Jy/beam', label: 'Jy/beam' },
            { value: 'Jy/pixel', label: 'Jy/pixel' },
            { value: 'K', label: 'K (Kelvin)' }
        ]
    },
    {
        key: 'fits_image/spectral_index',
        section: 'sky',
        label: 'Índice espectral (FITS)',
        tooltip: 'Índice espectral atribuído a cada pixel do mapa FITS.',
        type: 'number',
        defaultValue: 0.0,
        category: 'advanced'
    },
    {
        key: 'fits_image/min_peak_fraction',
        section: 'sky',
        label: 'Fração mín. do pico (FITS)',
        tooltip: 'Valor mínimo de pixel como fração do pico. 0 ou negativo desativa o filtro.',
        type: 'number',
        defaultValue: 0.02,
        category: 'advanced'
    },
    {
        key: 'healpix_fits/file',
        section: 'sky',
        label: 'Arquivo HEALPix FITS',
        tooltip: 'Caminho para arquivo(s) HEALPix FITS (esquema RING apenas).',
        type: 'text',
        defaultValue: '',
        category: 'advanced',
        isFilePath: true,
        fileAccept: '.fits,.fit'
    },
    {
        key: 'healpix_fits/default_map_units',
        section: 'sky',
        label: 'Unidade padrão do HEALPix',
        tooltip: 'Unidade dos pixels no mapa HEALPix, se não especificada no arquivo.',
        type: 'select',
        defaultValue: 'K',
        category: 'advanced',
        options: [
            { value: 'K', label: 'K (Kelvin)' },
            { value: 'Jy/pixel', label: 'Jy/pixel' },
            { value: 'Jy/beam', label: 'Jy/beam' }
        ]
    },
    {
        key: 'healpix_fits/spectral_index',
        section: 'sky',
        label: 'Índice espectral (HEALPix)',
        tooltip: 'Índice espectral de cada pixel HEALPix.',
        type: 'number',
        defaultValue: -0.7,
        category: 'advanced'
    },
    {
        key: 'healpix_fits/coord_sys',
        section: 'sky',
        label: 'Sistema de coordenadas (HEALPix)',
        tooltip: 'Sistema de coordenadas esféricas para o HEALPix.',
        type: 'select',
        defaultValue: 'G',
        category: 'advanced',
        options: [
            { value: 'G', label: 'Galáctico (G)' },
            { value: 'C', label: 'Celeste/Equatorial (C)' }
        ]
    },
    {
        key: 'healpix_fits/freq_hz',
        section: 'sky',
        label: 'Frequência de referência HEALPix (Hz)',
        tooltip: 'Frequência para conversão de temperatura de brilho para Jy/pixel.',
        type: 'number',
        defaultValue: 408e6,
        category: 'advanced'
    },
    {
        key: 'spectral_index/override',
        section: 'sky',
        label: 'Sobrescrever índice espectral',
        tooltip: 'Se habilitado, sobrescreve todos os índices espectrais das fontes.',
        type: 'select',
        defaultValue: 'false',
        category: 'advanced',
        options: [
            { value: 'true', label: 'Sim' },
            { value: 'false', label: 'Não' }
        ]
    },
    {
        key: 'spectral_index/ref_frequency_hz',
        section: 'sky',
        label: 'Freq. de referência do índice (Hz)',
        tooltip: 'Frequência de referência para todos os índices espectrais no modelo final.',
        type: 'number',
        defaultValue: 0.0,
        category: 'advanced'
    },
    {
        key: 'spectral_index/mean',
        section: 'sky',
        label: 'Média do índice espectral',
        tooltip: 'Média dos índices espectrais no modelo de céu final.',
        type: 'number',
        defaultValue: 0.0,
        category: 'advanced'
    },
    {
        key: 'spectral_index/std_dev',
        section: 'sky',
        label: 'Desvio padrão do índice espectral',
        tooltip: 'Desvio padrão dos índices espectrais no modelo de céu final.',
        type: 'number',
        defaultValue: 0.0,
        category: 'advanced'
    },
    {
        key: 'common_flux_filter/flux_min',
        section: 'sky',
        label: 'Fluxo mínimo (Jy)',
        tooltip: 'Fluxo mínimo permitido pelo filtro, em Jy. "min" desativa.',
        type: 'text',
        defaultValue: 'min',
        category: 'advanced'
    },
    {
        key: 'common_flux_filter/flux_max',
        section: 'sky',
        label: 'Fluxo máximo (Jy)',
        tooltip: 'Fluxo máximo permitido pelo filtro, em Jy. "max" desativa.',
        type: 'text',
        defaultValue: 'max',
        category: 'advanced'
    },
    {
        key: 'zero_failed_gaussians',
        section: 'sky',
        label: 'Zerar Gaussianas falhas',
        tooltip: 'Se true, fontes com parâmetros Gaussianos inválidos são removidas em vez de modeladas como pontuais.',
        type: 'select',
        defaultValue: 'false',
        category: 'advanced',
        options: [
            { value: 'true', label: 'Sim' },
            { value: 'false', label: 'Não' }
        ]
    },
    {
        key: 'apply_horizon_clip',
        section: 'sky',
        label: 'Recorte no horizonte',
        tooltip: 'Recorta fontes abaixo do horizonte. Útil para modelos de céu inteiro. Desative para modelos locais.',
        type: 'select',
        defaultValue: 'true',
        category: 'advanced',
        options: [
            { value: 'true', label: 'Sim' },
            { value: 'false', label: 'Não' }
        ]
    },
    {
        key: 'output_text_file',
        section: 'sky',
        label: 'Saída sky model (texto)',
        tooltip: 'Caminho para salvar o modelo de céu final como arquivo texto (útil para depuração).',
        type: 'text',
        defaultValue: '',
        category: 'advanced',
        isFilePath: true
    },

    // =========================================================================
    // [observation]
    // =========================================================================
    {
        key: 'mode',
        section: 'observation',
        label: 'Modo de observação',
        tooltip: '"Tracking" acompanha uma posição fixa no céu. ' +
                 '"Drift Scan" mantém o telescópio fixo (modo típico do BINGO).',
        type: 'select',
        defaultValue: 'Tracking',
        category: 'recommended',
        options: [
            { value: 'Tracking', label: 'Tracking (rastreio)' },
            { value: 'Drift Scan', label: 'Drift Scan (trânsito)' }
        ]
    },
    {
        key: 'phase_centre_ra_deg',
        section: 'observation',
        label: 'Centro de fase - AR (graus)',
        tooltip: 'Ascensão reta do centro de fase, em graus decimais.',
        type: 'number',
        defaultValue: 0.0,
        category: 'essential',
        required: true
    },
    {
        key: 'phase_centre_dec_deg',
        section: 'observation',
        label: 'Centro de fase - Dec (graus)',
        tooltip: 'Declinação do centro de fase, em graus decimais. Valores: -90 a +90.',
        type: 'number',
        defaultValue: -7.04,
        category: 'essential',
        required: true
    },
    {
        key: 'pointing_file',
        section: 'observation',
        label: 'Arquivo de apontamento',
        tooltip: 'Caminho para arquivo de apontamento de estação (opcional). Sobrescreve direção de feixe.',
        type: 'text',
        defaultValue: '',
        category: 'advanced',
        isFilePath: true
    },
    {
        key: 'start_frequency_hz',
        section: 'observation',
        label: 'Frequência inicial (Hz)',
        tooltip: 'Frequência central do primeiro canal, em Hz. BINGO: 980 MHz a 1260 MHz.',
        type: 'number',
        defaultValue: 980000000,
        category: 'essential',
        required: true
    },
    {
        key: 'num_channels',
        section: 'observation',
        label: 'Número de canais',
        tooltip: 'Quantidade de canais de frequência. BINGO com 280 MHz e resolução 1 MHz → 280.',
        type: 'number',
        defaultValue: 1,
        category: 'essential',
        required: true
    },
    {
        key: 'frequency_inc_hz',
        section: 'observation',
        label: 'Incremento de frequência (Hz)',
        tooltip: 'Separação entre canais consecutivos, em Hz.',
        type: 'number',
        defaultValue: 1000000,
        category: 'recommended'
    },
    {
        key: 'start_time_utc',
        section: 'observation',
        label: 'Hora de início (UTC)',
        tooltip: 'Data/hora de início no formato "dd-MM-yyyy HH:mm:ss.SSS".',
        type: 'text',
        defaultValue: '01-01-2025 00:00:00.000',
        category: 'essential',
        required: true
    },
    {
        key: 'length',
        section: 'observation',
        label: 'Duração da observação (s)',
        tooltip: 'Duração total em segundos. Ex: 3600 = 1 hora.',
        type: 'number',
        defaultValue: 3600,
        category: 'essential',
        required: true
    },
    {
        key: 'num_time_steps',
        section: 'observation',
        label: 'Número de passos de tempo',
        tooltip: 'Amostras temporais na observação. Mais passos = melhor cobertura UV.',
        type: 'number',
        defaultValue: 24,
        category: 'essential',
        required: true
    },

    // =========================================================================
    // [telescope]
    // =========================================================================
    {
        key: 'input_directory',
        section: 'telescope',
        label: 'Diretório do telescópio',
        tooltip: 'Caminho para o diretório com os arquivos de definição do telescópio OSKAR.',
        type: 'text',
        defaultValue: '',
        category: 'essential',
        required: true,
        isFilePath: true,
        isDirectory: true
    },
    {
        key: 'normalise_beams_at_phase_centre',
        section: 'telescope',
        label: 'Normalizar beams no centro de fase',
        tooltip: 'Escala amplitude do beam de cada estação para 1.0 no centro de fase.',
        type: 'select',
        defaultValue: 'true',
        category: 'recommended',
        options: [
            { value: 'true', label: 'Sim' },
            { value: 'false', label: 'Não' }
        ]
    },
    {
        key: 'allow_station_beam_duplication',
        section: 'telescope',
        label: 'Duplicar beams de estações idênticas',
        tooltip: 'Usa mapa de tipos de estação para duplicar beams. Pode acelerar significativamente.',
        type: 'select',
        defaultValue: 'false',
        category: 'advanced',
        options: [
            { value: 'true', label: 'Sim' },
            { value: 'false', label: 'Não' }
        ]
    },
    {
        key: 'pol_mode',
        section: 'telescope',
        label: 'Modo de polarização',
        tooltip: '"Scalar" simula apenas Stokes I (mais rápido). "Full" simula XX, XY, YX, YY.',
        type: 'select',
        defaultValue: 'Full',
        category: 'recommended',
        options: [
            { value: 'Scalar', label: 'Scalar (uma polarização)' },
            { value: 'Full', label: 'Full (polarização completa)' }
        ]
    },
    {
        key: 'station_type',
        section: 'telescope',
        label: 'Tipo de estação',
        tooltip: 'Tipo de estação: A = Aperture array, G = Gaussian beam, I = Isotropic beam.',
        type: 'select',
        defaultValue: 'A',
        category: 'advanced',
        options: [
            { value: 'A', label: 'A (Aperture Array)' },
            { value: 'G', label: 'G (Gaussian beam)' },
            { value: 'I', label: 'I (Isotropic beam)' }
        ]
    },
    {
        key: 'aperture_array/array_pattern/enable',
        section: 'telescope',
        label: 'Habilitar array pattern',
        tooltip: 'Habilita contribuição do array pattern (beamforming) ao beam da estação.',
        type: 'select',
        defaultValue: 'true',
        category: 'advanced',
        options: [
            { value: 'true', label: 'Sim' },
            { value: 'false', label: 'Não' }
        ]
    },
    {
        key: 'aperture_array/array_pattern/normalise',
        section: 'telescope',
        label: 'Normalizar array pattern',
        tooltip: 'Se sim, divide amplitude do beam pelo número de antenas na estação.',
        type: 'select',
        defaultValue: 'false',
        category: 'advanced',
        options: [
            { value: 'true', label: 'Sim' },
            { value: 'false', label: 'Não' }
        ]
    },
    {
        key: 'aperture_array/element_pattern/enable_numerical',
        section: 'telescope',
        label: 'Usar padrão numérico de elemento',
        tooltip: 'Usa arquivos de padrão numérico de elemento se disponíveis.',
        type: 'select',
        defaultValue: 'true',
        category: 'advanced',
        options: [
            { value: 'true', label: 'Sim' },
            { value: 'false', label: 'Não' }
        ]
    },
    {
        key: 'aperture_array/element_pattern/functional_type',
        section: 'telescope',
        label: 'Tipo funcional de elemento',
        tooltip: 'Tipo de padrão funcional aplicado aos elementos (quando não usando padrão numérico).',
        type: 'select',
        defaultValue: 'Dipole',
        category: 'advanced',
        options: [
            { value: 'Dipole', label: 'Dipole' },
            { value: 'Isotropic', label: 'Isotropic' }
        ]
    },
    {
        key: 'aperture_array/element_pattern/dipole_length',
        section: 'telescope',
        label: 'Comprimento do dipolo',
        tooltip: 'Comprimento do dipolo (na unidade definida abaixo).',
        type: 'number',
        defaultValue: 0.5,
        category: 'advanced'
    },
    {
        key: 'aperture_array/element_pattern/dipole_length_units',
        section: 'telescope',
        label: 'Unidade do comprimento do dipolo',
        tooltip: 'Unidade para especificar o comprimento do dipolo.',
        type: 'select',
        defaultValue: 'Wavelengths',
        category: 'advanced',
        options: [
            { value: 'Wavelengths', label: 'Comprimentos de onda' },
            { value: 'Metres', label: 'Metros' }
        ]
    },
    {
        key: 'gaussian_beam/fwhm_deg',
        section: 'telescope',
        label: 'FWHM do beam Gaussiano (°)',
        tooltip: 'Largura a meia-altura do beam Gaussiano na freq. de referência, em graus.',
        type: 'number',
        defaultValue: 0.0,
        category: 'advanced'
    },
    {
        key: 'gaussian_beam/ref_freq_hz',
        section: 'telescope',
        label: 'Freq. referência do beam Gaussiano (Hz)',
        tooltip: 'Frequência de referência do FWHM especificado, em Hz.',
        type: 'number',
        defaultValue: 0.0,
        category: 'advanced'
    },
    {
        key: 'ionosphere_screen_type',
        section: 'telescope',
        label: 'Tipo de tela ionosférica',
        tooltip: 'Tipo de tela de fase ionosférica. "None" desativa.',
        type: 'select',
        defaultValue: 'None',
        category: 'advanced',
        options: [
            { value: 'None', label: 'None (desativado)' },
            { value: 'External', label: 'External (arquivo FITS)' }
        ]
    },

    // =========================================================================
    // [interferometer]
    // =========================================================================
    {
        key: 'channel_bandwidth_hz',
        section: 'interferometer',
        label: 'Largura de banda do canal (Hz)',
        tooltip: 'Largura de cada canal para simular bandwidth smearing.',
        type: 'number',
        defaultValue: 0,
        category: 'recommended'
    },
    {
        key: 'time_average_sec',
        section: 'interferometer',
        label: 'Média temporal (s)',
        tooltip: 'Duração de média temporal do correlacionador, em segundos.',
        type: 'number',
        defaultValue: 0.0,
        category: 'recommended'
    },
    {
        key: 'max_time_samples_per_block',
        section: 'interferometer',
        label: 'Amostras por bloco',
        tooltip: 'Máximo de amostras temporais por bloco antes de escrever em disco.',
        type: 'number',
        defaultValue: 8,
        category: 'advanced'
    },
    {
        key: 'correlation_type',
        section: 'interferometer',
        label: 'Tipo de correlação',
        tooltip: 'Tipo de correlações calculadas.',
        type: 'select',
        defaultValue: 'Cross-correlations',
        category: 'recommended',
        options: [
            { value: 'Cross-correlations', label: 'Cross-correlations (cruzadas)' },
            { value: 'Auto-correlations', label: 'Auto-correlations (auto)' },
            { value: 'Both', label: 'Both (ambas)' }
        ]
    },
    {
        key: 'uv_filter_min',
        section: 'interferometer',
        label: 'Filtro UV mínimo',
        tooltip: 'Comprimento UV mínimo permitido. Baselines menores não são avaliadas.',
        type: 'text',
        defaultValue: 'min',
        category: 'advanced'
    },
    {
        key: 'uv_filter_max',
        section: 'interferometer',
        label: 'Filtro UV máximo',
        tooltip: 'Comprimento UV máximo permitido. Baselines maiores não são avaliadas.',
        type: 'text',
        defaultValue: 'max',
        category: 'advanced'
    },
    {
        key: 'uv_filter_units',
        section: 'interferometer',
        label: 'Unidade do filtro UV',
        tooltip: 'Unidade dos valores de filtro UV.',
        type: 'select',
        defaultValue: 'Wavelengths',
        category: 'advanced',
        options: [
            { value: 'Wavelengths', label: 'Comprimentos de onda (W)' },
            { value: 'Metres', label: 'Metros' }
        ]
    },
    {
        key: 'oskar_vis_filename',
        section: 'interferometer',
        label: 'Arquivo de visibilidades (.vis)',
        tooltip: 'Caminho do arquivo de saída OSKAR visibility (.vis).',
        type: 'text',
        defaultValue: 'output/bingo_sim.vis',
        category: 'essential',
        required: true,
        isFilePath: true
    },
    {
        key: 'ms_filename',
        section: 'interferometer',
        label: 'Arquivo Measurement Set (.ms)',
        tooltip: 'Caminho do Measurement Set de saída. Deixe em branco se não necessário.',
        type: 'text',
        defaultValue: '',
        category: 'recommended',
        isFilePath: true
    },
    {
        key: 'force_polarised_ms',
        section: 'interferometer',
        label: 'Forçar MS polarizado',
        tooltip: 'Se sim, escreve o MS sempre em formato polarizado mesmo no modo Scalar.',
        type: 'select',
        defaultValue: 'false',
        category: 'advanced',
        options: [
            { value: 'true', label: 'Sim' },
            { value: 'false', label: 'Não' }
        ]
    },
    {
        key: 'ignore_w_components',
        section: 'interferometer',
        label: 'Ignorar componentes W',
        tooltip: 'Se habilitado, zera coordenadas W das baselines. Desativa W-smearing.',
        type: 'select',
        defaultValue: 'false',
        category: 'advanced',
        options: [
            { value: 'true', label: 'Sim' },
            { value: 'false', label: 'Não' }
        ]
    },

    // =========================================================================
    // [noise]
    // =========================================================================
    {
        key: 'enable',
        section: 'noise',
        label: 'Habilitar ruído',
        tooltip: 'Se habilitado, adiciona ruído térmico à simulação.',
        type: 'select',
        defaultValue: 'false',
        category: 'advanced',
        options: [
            { value: 'true', label: 'Sim' },
            { value: 'false', label: 'Não' }
        ]
    },
    {
        key: 'seed',
        section: 'noise',
        label: 'Semente do ruído',
        tooltip: 'Semente do gerador de números aleatórios para o ruído.',
        type: 'number',
        defaultValue: 1,
        category: 'advanced'
    },
    {
        key: 'rms/start',
        section: 'noise',
        label: 'RMS início (Jy)',
        tooltip: 'Valor RMS de início da faixa de ruído por estação, em Jy.',
        type: 'number',
        defaultValue: 0,
        category: 'advanced'
    },
    {
        key: 'rms/end',
        section: 'noise',
        label: 'RMS fim (Jy)',
        tooltip: 'Valor RMS de fim da faixa de ruído por estação, em Jy.',
        type: 'number',
        defaultValue: 0,
        category: 'advanced'
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
    interferometer: 'Interferômetro',
    noise: 'Ruído'
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
        const useSkyBtn = document.getElementById('ini-use-sky-model-btn');

        if (copyBtn) copyBtn.addEventListener('click', (e) => { e.preventDefault(); this.copyIni(); });
        if (downloadBtn) downloadBtn.addEventListener('click', (e) => { e.preventDefault(); this.downloadIni(); });
        if (fillBtn) fillBtn.addEventListener('click', (e) => { e.preventDefault(); this.fillFromLayout(); });
        if (useSkyBtn) useSkyBtn.addEventListener('click', (e) => { e.preventDefault(); this.useSkyModel(); });
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
            const sectionOrder = ['simulator', 'sky', 'observation', 'telescope', 'interferometer', 'noise'];
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

        // Para campos de arquivo/diretório, cria um wrapper com botão para digitar caminho
        if (param.isFilePath) {
            const inputWrapper = document.createElement('div');
            inputWrapper.className = 'ini-file-input-wrapper';
            input.placeholder = param.isDirectory
                ? 'Ex: /home/user/telescope'
                : 'Ex: /home/user/data/output.vis';
            inputWrapper.appendChild(input);

            const browseBtn = document.createElement('button');
            browseBtn.type = 'button';
            browseBtn.className = 'ini-browse-btn';
            browseBtn.title = 'Inserir caminho completo do ' + (param.isDirectory ? 'diretório' : 'arquivo');
            browseBtn.innerHTML = '<i class="fas fa-folder-open"></i>';

            // Navegadores não permitem acesso ao caminho completo por segurança.
            // Abre um prompt para o usuário colar o caminho completo do seu sistema.
            browseBtn.addEventListener('click', (e) => {
                e.preventDefault();
                const label = param.isDirectory ? 'diretório' : 'arquivo';
                const currentVal = input.value || '';
                const path = prompt(
                    `Cole o caminho completo do ${label} no seu computador:`,
                    currentVal
                );
                if (path !== null && path.trim() !== '') {
                    input.value = path.trim();
                    input.dispatchEvent(new Event('input'));
                }
            });

            inputWrapper.appendChild(browseBtn);
            row.appendChild(inputWrapper);
        } else {
            row.appendChild(input);
        }

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
        const eol = getOsLineEnding();
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

        // Monta string INI com [General] no topo
        const sectionOrder = ['simulator', 'sky', 'observation', 'telescope', 'interferometer', 'noise'];
        const lines = [];

        // Seção [General] obrigatória no topo
        lines.push('[General]');
        lines.push('app=oskar_sim_interferometer');
        lines.push('');

        sectionOrder.forEach(sec => {
            if (!sections[sec] || sections[sec].length === 0) return;
            lines.push(`[${sec}]`);
            sections[sec].forEach(entry => {
                lines.push(`${entry.key}=${entry.value}`);
            });
            lines.push(''); // linha em branco entre seções
        });

        return lines.join(eol);
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
        // Diretório do telescópio
        const dirInput = this.inputElements['telescope.input_directory'];
        if (dirInput && !dirInput.value) {
            dirInput.value = 'telescope';
        }

        // Declinação aproximada = latitude do BINGO
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

    /**
     * Preenche o campo sky model com o nome do arquivo gerado na aba Sky Model.
     */
    useSkyModel() {
        const skyInput = this.inputElements['sky.oskar_sky_model/file'];
        if (skyInput) {
            if (window.skyModelGenerator && window.skyModelGenerator.sources.length > 0) {
                skyInput.value = 'bingo_sky_model.osm';
                this.updatePreview();
                console.log('Campo sky model preenchido com o modelo de céu gerado.');
            } else {
                alert('Nenhuma fonte foi gerada no Modelo de Céu. Vá à aba "Modelo de Céu" e adicione fontes primeiro.');
            }
        }
    }

    // =========================================================================
    // Download e cópia
    // =========================================================================

    /**
     * Faz o download do arquivo .ini gerado.
     * Se houver um sky model gerado, baixa ambos em um ZIP.
     */
    downloadIni() {
        if (!this.validateFields()) {
            console.warn('Download cancelado: há campos com erros de validação.');
            return;
        }

        const iniContent = this.generateIni();

        // Verifica se há sky model disponível para bundling
        const skyModelContent = (window.skyModelGenerator && window.skyModelGenerator.sources.length > 0)
            ? window.skyModelGenerator.exportOskarFormat()
            : null;

        if (skyModelContent && typeof JSZip !== 'undefined') {
            // Baixa ambos em um ZIP
            const zip = new JSZip();
            zip.file('oskar_sim.ini', iniContent);
            zip.file('bingo_sky_model.osm', skyModelContent);

            zip.generateAsync({ type: 'blob' }).then(blob => {
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'oskar_config.zip';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                console.log('Arquivo ZIP (INI + Sky Model) baixado com sucesso.');
            }).catch(err => {
                console.error('Erro ao gerar ZIP:', err);
                this._downloadSingleFile(iniContent, 'oskar_sim.ini');
            });
        } else {
            if (skyModelContent && typeof JSZip === 'undefined') {
                console.warn('JSZip não disponível. Baixando apenas o arquivo .ini (sem sky model).');
            }
            this._downloadSingleFile(iniContent, 'oskar_sim.ini');
        }
    }

    /**
     * Faz download de um único arquivo de texto.
     * @private
     * @param {string} content Conteúdo do arquivo.
     * @param {string} filename Nome do arquivo.
     */
    _downloadSingleFile(content, filename) {
        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        console.log(`Arquivo ${filename} baixado com sucesso.`);
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
// OSKAR Imager - Parâmetros e Gerador
// =============================================================================

/**
 * Definição dos parâmetros do oskar_imager.
 * @constant {Array<Object>}
 */
const OSKAR_IMAGER_PARAMS = Object.freeze([
    // =========================================================================
    // [image] - Configuração geral
    // =========================================================================
    {
        key: 'double_precision',
        section: 'image',
        label: 'Precisão dupla',
        tooltip: 'Ativa cálculos em precisão dupla (64 bits).',
        type: 'select',
        defaultValue: 'true',
        category: 'recommended',
        options: [
            { value: 'true', label: 'Sim' },
            { value: 'false', label: 'Não' }
        ]
    },
    {
        key: 'use_gpus',
        section: 'image',
        label: 'Usar GPUs',
        tooltip: 'Se habilitado, usa dispositivos GPU disponíveis.',
        type: 'select',
        defaultValue: 'true',
        category: 'recommended',
        options: [
            { value: 'true', label: 'Sim' },
            { value: 'false', label: 'Não' }
        ]
    },
    {
        key: 'cuda_device_ids',
        section: 'image',
        label: 'IDs de dispositivos CUDA',
        tooltip: 'Lista separada por vírgulas de IDs de GPUs, ou "all" para usar todos.',
        type: 'text',
        defaultValue: 'all',
        category: 'advanced'
    },
    {
        key: 'num_devices',
        section: 'image',
        label: 'Número de dispositivos',
        tooltip: 'Número de dispositivos de computação (CPU cores ou GPUs). "auto" detecta.',
        type: 'text',
        defaultValue: 'auto',
        category: 'advanced'
    },
    {
        key: 'specify_cellsize',
        section: 'image',
        label: 'Especificar tamanho de célula',
        tooltip: 'Se habilitado, especifica o tamanho da célula em arcsec; caso contrário, usa FOV.',
        type: 'select',
        defaultValue: 'false',
        category: 'recommended',
        options: [
            { value: 'true', label: 'Sim (cellsize)' },
            { value: 'false', label: 'Não (FOV)' }
        ]
    },
    {
        key: 'fov_deg',
        section: 'image',
        label: 'Campo de visão (°)',
        tooltip: 'Campo de visão total da imagem em graus.',
        type: 'number',
        defaultValue: 2.0,
        category: 'essential',
        required: true
    },
    {
        key: 'cellsize_arcsec',
        section: 'image',
        label: 'Tamanho da célula (arcsec)',
        tooltip: 'Tamanho do pixel em segundos de arco. Usado se specify_cellsize = true.',
        type: 'number',
        defaultValue: 1.0,
        category: 'recommended'
    },
    {
        key: 'size',
        section: 'image',
        label: 'Tamanho da imagem (pixels)',
        tooltip: 'Largura da imagem em pixels (deve ser par). Ex: 256 gera imagem 256×256.',
        type: 'number',
        defaultValue: 256,
        category: 'essential',
        required: true
    },
    {
        key: 'image_type',
        section: 'image',
        label: 'Tipo de imagem',
        tooltip: 'Tipo de imagem a gerar. I, Q, U, V são parâmetros de Stokes. PSF gera a função de espalhamento pontual.',
        type: 'select',
        defaultValue: 'I',
        category: 'essential',
        required: true,
        options: [
            { value: 'I', label: 'Stokes I' },
            { value: 'Q', label: 'Stokes Q' },
            { value: 'U', label: 'Stokes U' },
            { value: 'V', label: 'Stokes V' },
            { value: 'PSF', label: 'PSF' },
            { value: 'LINEAR', label: 'Linear (XX, XY, YX, YY)' }
        ]
    },
    {
        key: 'channel_snapshots',
        section: 'image',
        label: 'Snapshots por canal',
        tooltip: 'Se true, produz cubo de imagens com snapshot por canal. Se false, usa síntese de frequência.',
        type: 'select',
        defaultValue: 'false',
        category: 'recommended',
        options: [
            { value: 'true', label: 'Sim' },
            { value: 'false', label: 'Não (síntese)' }
        ]
    },
    {
        key: 'freq_min_hz',
        section: 'image',
        label: 'Frequência mínima (Hz)',
        tooltip: 'Frequência mínima a incluir na imagem, em Hz. 0.0 = sem filtro.',
        type: 'number',
        defaultValue: 0.0,
        category: 'advanced'
    },
    {
        key: 'freq_max_hz',
        section: 'image',
        label: 'Frequência máxima (Hz)',
        tooltip: 'Frequência máxima a incluir na imagem. "max" = sem limite superior.',
        type: 'text',
        defaultValue: 'max',
        category: 'advanced'
    },
    {
        key: 'time_min_utc',
        section: 'image',
        label: 'Tempo mínimo (UTC)',
        tooltip: 'Tempo mínimo dos dados de visibilidade a incluir. Formato MJD ou dd-MM-yyyy HH:mm:ss.SSS.',
        type: 'text',
        defaultValue: '0.0',
        category: 'advanced'
    },
    {
        key: 'time_max_utc',
        section: 'image',
        label: 'Tempo máximo (UTC)',
        tooltip: 'Tempo máximo dos dados de visibilidade a incluir. Formato MJD ou dd-MM-yyyy HH:mm:ss.SSS.',
        type: 'text',
        defaultValue: '0.0',
        category: 'advanced'
    },
    {
        key: 'uv_filter_min',
        section: 'image',
        label: 'Filtro UV mínimo (λ)',
        tooltip: 'Comprimento mínimo de baseline UV a imagear, em comprimentos de onda.',
        type: 'number',
        defaultValue: 0.0,
        category: 'advanced'
    },
    {
        key: 'uv_filter_max',
        section: 'image',
        label: 'Filtro UV máximo (λ)',
        tooltip: 'Comprimento máximo de baseline UV a imagear. "max" = sem limite.',
        type: 'text',
        defaultValue: 'max',
        category: 'advanced'
    },
    {
        key: 'algorithm',
        section: 'image',
        label: 'Algoritmo de transformada',
        tooltip: 'Tipo de transformada para gerar a imagem.',
        type: 'select',
        defaultValue: 'FFT',
        category: 'recommended',
        options: [
            { value: 'FFT', label: 'FFT' },
            { value: 'DFT 2D', label: 'DFT 2D' },
            { value: 'DFT 3D', label: 'DFT 3D' },
            { value: 'W-projection', label: 'W-projection' }
        ]
    },
    {
        key: 'weighting',
        section: 'image',
        label: 'Ponderação (weighting)',
        tooltip: 'Esquema de ponderação das visibilidades.',
        type: 'select',
        defaultValue: 'Natural',
        category: 'recommended',
        options: [
            { value: 'Natural', label: 'Natural' },
            { value: 'Uniform', label: 'Uniform' },
            { value: 'Radial', label: 'Radial' }
        ]
    },
    {
        key: 'weight_taper/u_wavelengths',
        section: 'image',
        label: 'Taper em U (λ)',
        tooltip: 'Escala de tapering em U para pesos, em comprimentos de onda. 0 = desativado.',
        type: 'number',
        defaultValue: 0.0,
        category: 'advanced'
    },
    {
        key: 'weight_taper/v_wavelengths',
        section: 'image',
        label: 'Taper em V (λ)',
        tooltip: 'Escala de tapering em V para pesos, em comprimentos de onda. 0 = desativado.',
        type: 'number',
        defaultValue: 0.0,
        category: 'advanced'
    },

    // =========================================================================
    // [image/fft] - Configuração FFT
    // =========================================================================
    {
        key: 'fft/use_gpu',
        section: 'image',
        label: 'FFT na GPU',
        tooltip: 'Se true, usa a GPU para executar a FFT.',
        type: 'select',
        defaultValue: 'false',
        category: 'advanced',
        options: [
            { value: 'true', label: 'Sim' },
            { value: 'false', label: 'Não' }
        ]
    },
    {
        key: 'fft/grid_on_gpu',
        section: 'image',
        label: 'Gridding na GPU',
        tooltip: 'Se true, usa a GPU para o gridding das visibilidades.',
        type: 'select',
        defaultValue: 'false',
        category: 'advanced',
        options: [
            { value: 'true', label: 'Sim' },
            { value: 'false', label: 'Não' }
        ]
    },
    {
        key: 'fft/kernel_type',
        section: 'image',
        label: 'Tipo de kernel de gridding',
        tooltip: 'Tipo de kernel usado para gridding.',
        type: 'select',
        defaultValue: 'Spheroidal',
        category: 'advanced',
        options: [
            { value: 'Spheroidal', label: 'Spheroidal' },
            { value: 'Pillbox', label: 'Pillbox' }
        ]
    },
    {
        key: 'fft/support',
        section: 'image',
        label: 'Suporte do kernel',
        tooltip: 'Tamanho do suporte do kernel de gridding.',
        type: 'number',
        defaultValue: 3,
        category: 'advanced'
    },
    {
        key: 'fft/oversample',
        section: 'image',
        label: 'Fator de oversampling',
        tooltip: 'Fator de oversampling do kernel de gridding.',
        type: 'number',
        defaultValue: 100,
        category: 'advanced'
    },

    // =========================================================================
    // [image/wproj] - W-projection
    // =========================================================================
    {
        key: 'wproj/generate_w_kernels_on_gpu',
        section: 'image',
        label: 'W-kernels na GPU',
        tooltip: 'Se true, gera os W-kernels na GPU.',
        type: 'select',
        defaultValue: 'true',
        category: 'advanced',
        options: [
            { value: 'true', label: 'Sim' },
            { value: 'false', label: 'Não' }
        ]
    },
    {
        key: 'wproj/num_w_planes',
        section: 'image',
        label: 'Número de W-planes',
        tooltip: 'Número de planos W. Valores < 1 significam "automático".',
        type: 'number',
        defaultValue: 0,
        category: 'advanced'
    },

    // =========================================================================
    // [image/direction] - Direção da imagem
    // =========================================================================
    {
        key: 'direction',
        section: 'image',
        label: 'Direção do centro de fase',
        tooltip: '"Obs" usa a direção da observação. "RA, Dec." usa valores customizados.',
        type: 'select',
        defaultValue: 'Obs',
        category: 'recommended',
        options: [
            { value: 'Obs', label: 'Observação (Obs)' },
            { value: 'RA, Dec.', label: 'RA, Dec. (customizado)' }
        ]
    },
    {
        key: 'direction/ra_deg',
        section: 'image',
        label: 'RA do centro de fase (°)',
        tooltip: 'Ascensão reta do centro de fase da imagem, em graus.',
        type: 'number',
        defaultValue: 0,
        category: 'recommended'
    },
    {
        key: 'direction/dec_deg',
        section: 'image',
        label: 'Dec do centro de fase (°)',
        tooltip: 'Declinação do centro de fase da imagem, em graus.',
        type: 'number',
        defaultValue: 0,
        category: 'recommended'
    },

    // =========================================================================
    // [image] - Entrada/Saída
    // =========================================================================
    {
        key: 'input_vis_data',
        section: 'image',
        label: 'Arquivo de visibilidades de entrada',
        tooltip: 'Caminho para o arquivo de visibilidades OSKAR (.vis) ou Measurement Set (.ms).',
        type: 'text',
        defaultValue: '',
        category: 'essential',
        required: true,
        isFilePath: true,
        fileAccept: '.vis,.ms'
    },
    {
        key: 'scale_norm_with_num_input_files',
        section: 'image',
        label: 'Escalar normalização pelo nº de arquivos',
        tooltip: 'Se true, escala a normalização pelo número de arquivos de entrada. Use true se arquivos representam múltiplos modelos de céu com mesma config de telescópio.',
        type: 'select',
        defaultValue: 'false',
        category: 'advanced',
        options: [
            { value: 'true', label: 'Sim' },
            { value: 'false', label: 'Não' }
        ]
    },
    {
        key: 'ms_column',
        section: 'image',
        label: 'Coluna do MS',
        tooltip: 'Nome da coluna no Measurement Set para usar (se aplicável).',
        type: 'text',
        defaultValue: 'DATA',
        category: 'advanced'
    },
    {
        key: 'root_path',
        section: 'image',
        label: 'Caminho raiz de saída',
        tooltip: 'Nome base do arquivo FITS de saída. Sufixo será adicionado automaticamente (_I.fits, etc.).',
        type: 'text',
        defaultValue: '',
        category: 'essential',
        required: true,
        isFilePath: true
    }
]);

/**
 * Rótulos de seções para o oskar_imager.
 * @constant {Object<string, string>}
 */
const IMAGER_SECTION_LABELS = Object.freeze({
    image: 'Imagem'
});

/**
 * Classe geradora do arquivo .ini do oskar_imager.
 * Reutiliza a mesma lógica de UI/validação, mas com parâmetros e [General] diferentes.
 */
class OskarImagerGenerator {
    constructor() {
        /** @type {Object<string, HTMLElement>} */
        this.inputElements = {};

        this.paramsContainer = document.getElementById('imager-params-container');
        this.previewTextarea = document.getElementById('imager-preview');
        this.validationContainer = document.getElementById('imager-validation-messages');

        this._bindButtons();
        this.renderParameters();
        this.updatePreview();

        console.log('OskarImagerGenerator inicializado com sucesso.');
    }

    _bindButtons() {
        const copyBtn = document.getElementById('imager-copy-btn');
        const downloadBtn = document.getElementById('imager-download-btn');
        const useInterfBtn = document.getElementById('imager-use-interf-output-btn');

        if (copyBtn) copyBtn.addEventListener('click', (e) => { e.preventDefault(); this.copyIni(); });
        if (downloadBtn) downloadBtn.addEventListener('click', (e) => { e.preventDefault(); this.downloadIni(); });
        if (useInterfBtn) useInterfBtn.addEventListener('click', (e) => { e.preventDefault(); this.useInterferometerOutput(); });
    }

    /**
     * Preenche o campo de entrada de visibilidades com o caminho de saída do interferômetro.
     */
    useInterferometerOutput() {
        const visInput = this.inputElements['image.input_vis_data'];
        if (!visInput) return;

        // Tenta obter o caminho de saída definido no interferômetro
        let visPath = '';
        if (window.oskarIniGenerator && window.oskarIniGenerator.inputElements['interferometer.oskar_vis_filename']) {
            visPath = window.oskarIniGenerator.inputElements['interferometer.oskar_vis_filename'].value || '';
        }
        if (!visPath) {
            alert('Nenhum caminho de saída .vis foi definido no bloco do interferômetro. Defina-o primeiro.');
            return;
        }
        visInput.value = visPath;
        visInput.dispatchEvent(new Event('input'));
        console.log('Campo de entrada do imager preenchido com saída do interferômetro:', visPath);
    }

    /**
     * Renderiza os inputs de parâmetros agrupados por categoria.
     */
    renderParameters() {
        if (!this.paramsContainer) {
            console.warn('Container imager-params-container não encontrado no DOM.');
            return;
        }
        this.paramsContainer.innerHTML = '';
        this.inputElements = {};

        INI_CATEGORIES.forEach(cat => {
            const params = OSKAR_IMAGER_PARAMS.filter(p => p.category === cat.id);
            if (params.length === 0) return;

            const catWrapper = document.createElement('div');
            catWrapper.className = `ini-category ini-category--${cat.id}`;

            const catHeader = document.createElement('div');
            catHeader.className = 'ini-category__header';
            catHeader.innerHTML = `<i class="fas ${cat.icon}"></i> <span>${cat.label}</span>`;

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

            // Agrupa por seção
            const grouped = {};
            params.forEach(p => {
                if (!grouped[p.section]) grouped[p.section] = [];
                grouped[p.section].push(p);
            });

            ['image'].forEach(sec => {
                if (!grouped[sec]) return;
                const sectionDiv = document.createElement('fieldset');
                sectionDiv.className = 'ini-section';
                const legend = document.createElement('legend');
                legend.textContent = IMAGER_SECTION_LABELS[sec] || sec;
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
     * Cria a linha de input para um parâmetro (reutiliza lógica do interferometer).
     * @private
     */
    _createParamRow(param) {
        const row = document.createElement('div');
        row.className = 'ini-param-row';
        if (param.required) row.classList.add('ini-param-row--required');

        const label = document.createElement('label');
        const inputId = `imager-input-${param.section}-${param.key.replace(/[/.]/g, '_')}`;
        label.setAttribute('for', inputId);
        label.textContent = param.label;
        if (param.required) {
            const req = document.createElement('span');
            req.className = 'ini-required-mark';
            req.textContent = ' *';
            label.appendChild(req);
        }

        const tooltipIcon = document.createElement('i');
        tooltipIcon.className = 'fas fa-question-circle ini-tooltip-icon';
        tooltipIcon.title = param.tooltip;
        label.appendChild(tooltipIcon);

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

        input.addEventListener('change', () => this.updatePreview());
        input.addEventListener('input', () => this.updatePreview());

        const errorSpan = document.createElement('span');
        errorSpan.className = 'ini-field-error';

        const compositeKey = `${param.section}.${param.key}`;
        this.inputElements[compositeKey] = input;

        row.appendChild(label);

        if (param.isFilePath) {
            const inputWrapper = document.createElement('div');
            inputWrapper.className = 'ini-file-input-wrapper';
            input.placeholder = param.isDirectory
                ? 'Ex: /home/user/telescope'
                : 'Ex: /home/user/data/output.vis';
            inputWrapper.appendChild(input);

            const browseBtn = document.createElement('button');
            browseBtn.type = 'button';
            browseBtn.className = 'ini-browse-btn';
            browseBtn.title = 'Inserir caminho completo do ' + (param.isDirectory ? 'diretório' : 'arquivo');
            browseBtn.innerHTML = '<i class="fas fa-folder-open"></i>';

            browseBtn.addEventListener('click', (e) => {
                e.preventDefault();
                const label = param.isDirectory ? 'diretório' : 'arquivo';
                const currentVal = input.value || '';
                const path = prompt(
                    `Cole o caminho completo do ${label} no seu computador:`,
                    currentVal
                );
                if (path !== null && path.trim() !== '') {
                    input.value = path.trim();
                    input.dispatchEvent(new Event('input'));
                }
            });

            inputWrapper.appendChild(browseBtn);
            row.appendChild(inputWrapper);
        } else {
            row.appendChild(input);
        }

        row.appendChild(errorSpan);
        return row;
    }

    /**
     * Gera o conteúdo do arquivo .ini do imager.
     */
    generateIni() {
        const eol = getOsLineEnding();
        const sections = {};

        OSKAR_IMAGER_PARAMS.forEach(param => {
            const compositeKey = `${param.section}.${param.key}`;
            const input = this.inputElements[compositeKey];
            if (!input) return;

            let value;
            if (param.type === 'checkbox') {
                value = input.checked ? 'true' : 'false';
            } else {
                value = input.value;
            }

            if (value === '' && !param.required) return;

            if (!sections[param.section]) sections[param.section] = [];
            sections[param.section].push({ key: param.key, value });
        });

        const lines = [];
        lines.push('[General]');
        lines.push('app=oskar_imager');
        lines.push('');

        ['image'].forEach(sec => {
            if (!sections[sec] || sections[sec].length === 0) return;
            lines.push(`[${sec}]`);
            sections[sec].forEach(entry => {
                lines.push(`${entry.key}=${entry.value}`);
            });
            lines.push('');
        });

        return lines.join(eol);
    }

    updatePreview() {
        if (!this.previewTextarea) return;
        this.previewTextarea.value = this.generateIni();
    }

    validateFields() {
        let allValid = true;
        OSKAR_IMAGER_PARAMS.forEach(param => {
            const compositeKey = `${param.section}.${param.key}`;
            const input = this.inputElements[compositeKey];
            if (!input) return;

            const row = input.closest('.ini-param-row');
            const errorSpan = row ? row.querySelector('.ini-field-error') : null;
            let errorMsg = '';

            const value = (param.type === 'checkbox') ? input.checked : input.value;
            if (param.required && (value === '' || value === null || value === undefined)) {
                errorMsg = 'Campo obrigatório.';
            }
            if (!errorMsg && param.type === 'number' && value !== '') {
                if (isNaN(Number(value))) errorMsg = 'Valor numérico inválido.';
            }

            if (errorMsg) {
                allValid = false;
                if (input.classList) input.classList.add('ini-input--error');
            } else {
                if (input.classList) input.classList.remove('ini-input--error');
            }
            if (errorSpan) errorSpan.textContent = errorMsg;
        });

        if (this.validationContainer) {
            this.validationContainer.innerHTML = allValid
                ? '<span class="ini-validation-ok"><i class="fas fa-check-circle"></i> Todos os campos estão válidos.</span>'
                : '<span class="ini-validation-error"><i class="fas fa-exclamation-triangle"></i> Campos com erros.</span>';
        }
        return allValid;
    }

    downloadIni() {
        if (!this.validateFields()) {
            console.warn('Download cancelado: campos com erro.');
            return;
        }
        const content = this.generateIni();
        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'oskar_imager.ini';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        console.log('Arquivo oskar_imager.ini baixado com sucesso.');
    }

    copyIni() {
        const content = this.generateIni();
        const copyBtn = document.getElementById('imager-copy-btn');

        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(content).then(() => {
                this._showCopyFeedback(copyBtn, true);
            }).catch(() => {
                this._showCopyFeedback(copyBtn, false);
            });
        } else if (this.previewTextarea) {
            this.previewTextarea.select();
            document.execCommand('copy');
            this._showCopyFeedback(copyBtn, true);
        }
    }

    _showCopyFeedback(button, success) {
        if (!button) return;
        const icon = button.querySelector('i');
        if (!icon) return;
        const orig = 'fa-copy';
        const feedback = success ? 'fa-check' : 'fa-times';
        icon.classList.remove(orig);
        icon.classList.add(feedback);
        button.style.color = success ? 'var(--success-color)' : 'var(--secondary-color)';
        setTimeout(() => {
            icon.classList.remove(feedback);
            icon.classList.add(orig);
            button.style.color = '';
        }, 1500);
    }
}

// =============================================================================
// OSKAR Sim Beam Pattern - Parâmetros e Gerador
// =============================================================================

/**
 * Definição dos parâmetros do oskar_sim_beam_pattern.
 * @constant {Array<Object>}
 */
const OSKAR_BEAM_PATTERN_PARAMS = Object.freeze([
    // =========================================================================
    // [simulator]
    // =========================================================================
    {
        key: 'double_precision',
        section: 'simulator',
        label: 'Precisão dupla',
        tooltip: 'Ativa cálculos em precisão dupla (64 bits). Mais exato, porém mais lento na GPU.',
        type: 'select',
        defaultValue: 'true',
        category: 'recommended',
        options: [
            { value: 'true', label: 'Sim (mais preciso)' },
            { value: 'false', label: 'Não (mais rápido)' }
        ]
    },
    {
        key: 'use_gpus',
        section: 'simulator',
        label: 'Usar GPUs',
        tooltip: 'Se habilitado, usa dispositivos GPU disponíveis para a simulação.',
        type: 'select',
        defaultValue: 'true',
        category: 'recommended',
        options: [
            { value: 'true', label: 'Sim' },
            { value: 'false', label: 'Não' }
        ]
    },
    {
        key: 'cuda_device_ids',
        section: 'simulator',
        label: 'IDs de dispositivos CUDA',
        tooltip: 'Lista separada por vírgulas de IDs de GPUs, ou "all" para usar todos os dispositivos.',
        type: 'text',
        defaultValue: 'all',
        category: 'advanced'
    },
    {
        key: 'num_devices',
        section: 'simulator',
        label: 'Número de dispositivos',
        tooltip: 'Número de dispositivos de computação. "auto" usa todos disponíveis. Não ultrapasse o número de cores da CPU.',
        type: 'text',
        defaultValue: 'auto',
        category: 'advanced'
    },
    {
        key: 'max_sources_per_chunk',
        section: 'simulator',
        label: 'Máx. fontes por chunk',
        tooltip: 'Número máximo de fontes/pixels processados por vez em cada dispositivo. Reduza se a GPU ficar sem memória.',
        type: 'number',
        defaultValue: 16384,
        category: 'advanced'
    },
    {
        key: 'keep_log_file',
        section: 'simulator',
        label: 'Manter arquivo de log',
        tooltip: 'Se habilitado, mantém o arquivo de log em disco após a simulação.',
        type: 'select',
        defaultValue: 'false',
        category: 'advanced',
        options: [
            { value: 'true', label: 'Sim' },
            { value: 'false', label: 'Não' }
        ]
    },
    {
        key: 'write_status_to_log_file',
        section: 'simulator',
        label: 'Gravar status no log',
        tooltip: 'Se habilitado, mensagens de progresso são gravadas no arquivo de log.',
        type: 'select',
        defaultValue: 'false',
        category: 'advanced',
        options: [
            { value: 'true', label: 'Sim' },
            { value: 'false', label: 'Não' }
        ]
    },

    // =========================================================================
    // [observation]
    // =========================================================================
    {
        key: 'mode',
        section: 'observation',
        label: 'Modo de observação',
        tooltip: 'Modo: Tracking (acompanhamento) ou Drift Scan (varredura por deriva).',
        type: 'select',
        defaultValue: 'Tracking',
        category: 'essential',
        options: [
            { value: 'Tracking', label: 'Tracking' },
            { value: 'Drift Scan', label: 'Drift Scan' }
        ]
    },
    {
        key: 'phase_centre_ra_deg',
        section: 'observation',
        label: 'Ascensão Reta do centro de fase (°)',
        tooltip: 'Ascensão Reta do apontamento (centro de fase), em graus.',
        type: 'number',
        defaultValue: 0,
        category: 'essential'
    },
    {
        key: 'phase_centre_dec_deg',
        section: 'observation',
        label: 'Declinação do centro de fase (°)',
        tooltip: 'Declinação do apontamento (centro de fase), em graus.',
        type: 'number',
        defaultValue: 0,
        category: 'essential'
    },
    {
        key: 'pointing_file',
        section: 'observation',
        label: 'Arquivo de apontamento',
        tooltip: 'Caminho para arquivo opcional de apontamento de stations, que pode sobrescrever a direção do feixe.',
        type: 'text',
        defaultValue: '',
        category: 'advanced',
        isFilePath: true
    },
    {
        key: 'start_frequency_hz',
        section: 'observation',
        label: 'Frequência inicial (Hz)',
        tooltip: 'Frequência no ponto médio do primeiro canal, em Hz.',
        type: 'number',
        defaultValue: '',
        category: 'essential',
        required: true
    },
    {
        key: 'num_channels',
        section: 'observation',
        label: 'Número de canais',
        tooltip: 'Número de canais de frequência a utilizar.',
        type: 'number',
        defaultValue: 1,
        category: 'essential'
    },
    {
        key: 'frequency_inc_hz',
        section: 'observation',
        label: 'Incremento de frequência (Hz)',
        tooltip: 'Incremento de frequência entre canais sucessivos, em Hz.',
        type: 'number',
        defaultValue: 0,
        category: 'recommended'
    },
    {
        key: 'start_time_utc',
        section: 'observation',
        label: 'Hora de início (UTC)',
        tooltip: 'Data/hora de início da observação. Pode ser MJD ou formato: yyyy-M-d h:m:s.z',
        type: 'text',
        defaultValue: '',
        category: 'essential',
        required: true
    },
    {
        key: 'length',
        section: 'observation',
        label: 'Duração da observação',
        tooltip: 'Duração em segundos, ou no formato h:m:s.z',
        type: 'text',
        defaultValue: '',
        category: 'essential',
        required: true
    },
    {
        key: 'num_time_steps',
        section: 'observation',
        label: 'Número de passos de tempo',
        tooltip: 'Número de snapshots do beam pattern durante a observação.',
        type: 'number',
        defaultValue: 1,
        category: 'essential'
    },

    // =========================================================================
    // [telescope]
    // =========================================================================
    {
        key: 'input_directory',
        section: 'telescope',
        label: 'Diretório do telescópio',
        tooltip: 'Caminho para o diretório com os dados de configuração do telescópio OSKAR.',
        type: 'text',
        defaultValue: '',
        category: 'essential',
        required: true,
        isFilePath: true,
        isDirectory: true
    },
    {
        key: 'normalise_beams_at_phase_centre',
        section: 'telescope',
        label: 'Normalizar feixes no centro de fase',
        tooltip: 'Se true, escala a amplitude de cada station beam no centro de fase para 1.0 em cada snapshot.',
        type: 'select',
        defaultValue: 'true',
        category: 'recommended',
        options: [
            { value: 'true', label: 'Sim' },
            { value: 'false', label: 'Não' }
        ]
    },
    {
        key: 'allow_station_beam_duplication',
        section: 'telescope',
        label: 'Permitir duplicação de beams',
        tooltip: 'Se habilitado, duplica beams de configurações de stations comuns. Reduz tempo mas pode causar erros com baselines longas.',
        type: 'select',
        defaultValue: 'false',
        category: 'advanced',
        options: [
            { value: 'true', label: 'Sim' },
            { value: 'false', label: 'Não' }
        ]
    },
    {
        key: 'pol_mode',
        section: 'telescope',
        label: 'Modo de polarização',
        tooltip: 'Full: simula ambas polarizações. Scalar: apenas Stokes I (mais rápido).',
        type: 'select',
        defaultValue: 'Full',
        category: 'recommended',
        options: [
            { value: 'Full', label: 'Full (completo)' },
            { value: 'Scalar', label: 'Scalar (apenas Stokes I)' }
        ]
    },
    {
        key: 'station_type',
        section: 'telescope',
        label: 'Tipo de station',
        tooltip: 'Tipo de cada station: Aperture Array (padrão), Gaussian beam (teste), ou Isotropic (sem efeito de beam).',
        type: 'select',
        defaultValue: 'A',
        category: 'recommended',
        options: [
            { value: 'A', label: 'Aperture Array (A)' },
            { value: 'G', label: 'Gaussian Beam (G)' },
            { value: 'I', label: 'Isotropic Beam (I)' }
        ]
    },
    {
        key: 'aperture_array/array_pattern/enable',
        section: 'telescope',
        label: 'Habilitar array pattern',
        tooltip: 'Se true, avalia a contribuição do array pattern (beamforming das antenas) no beam da station.',
        type: 'select',
        defaultValue: 'true',
        category: 'advanced',
        options: [
            { value: 'true', label: 'Sim' },
            { value: 'false', label: 'Não' }
        ]
    },
    {
        key: 'aperture_array/array_pattern/normalise',
        section: 'telescope',
        label: 'Normalizar array pattern',
        tooltip: 'Se true, divide a amplitude do station beam pelo número de antenas na station.',
        type: 'select',
        defaultValue: 'false',
        category: 'advanced',
        options: [
            { value: 'true', label: 'Sim' },
            { value: 'false', label: 'Não' }
        ]
    },
    {
        key: 'aperture_array/element_pattern/enable_numerical',
        section: 'telescope',
        label: 'Habilitar padrão numérico de elemento',
        tooltip: 'Se true, usa arquivos de padrão numérico quando disponíveis. Caso contrário, usa o tipo funcional.',
        type: 'select',
        defaultValue: 'true',
        category: 'advanced',
        options: [
            { value: 'true', label: 'Sim' },
            { value: 'false', label: 'Não' }
        ]
    },
    {
        key: 'aperture_array/element_pattern/functional_type',
        section: 'telescope',
        label: 'Tipo funcional do elemento',
        tooltip: 'Tipo de padrão funcional aplicado aos elementos (se não usando padrão numérico).',
        type: 'select',
        defaultValue: 'Dipole',
        category: 'advanced',
        options: [
            { value: 'Dipole', label: 'Dipolo' },
            { value: 'Geometric dipole', label: 'Dipolo geométrico' }
        ]
    },
    {
        key: 'aperture_array/element_pattern/dipole_length',
        section: 'telescope',
        label: 'Comprimento do dipolo',
        tooltip: 'Comprimento do dipolo (valor padrão 0.5 comprimentos de onda).',
        type: 'number',
        defaultValue: 0.5,
        category: 'advanced'
    },
    {
        key: 'aperture_array/element_pattern/dipole_length_units',
        section: 'telescope',
        label: 'Unidades do comprimento do dipolo',
        tooltip: 'Unidades para o comprimento do dipolo: metros ou comprimentos de onda.',
        type: 'select',
        defaultValue: 'Wavelengths',
        category: 'advanced',
        options: [
            { value: 'Wavelengths', label: 'Comprimentos de onda' },
            { value: 'Metres', label: 'Metros' }
        ]
    },
    {
        key: 'aperture_array/element_pattern/taper/type',
        section: 'telescope',
        label: 'Tipo de tapering do elemento',
        tooltip: 'Tipo de função de tapering aplicada ao padrão do elemento.',
        type: 'select',
        defaultValue: 'None',
        category: 'advanced',
        options: [
            { value: 'None', label: 'Nenhum' },
            { value: 'Cosine', label: 'Cosseno' },
            { value: 'Gaussian', label: 'Gaussiana' }
        ]
    },
    {
        key: 'aperture_array/element_pattern/taper/cosine_power',
        section: 'telescope',
        label: 'Potência do taper cosseno',
        tooltip: 'Potência da função cos(θ) se tapering tipo cosseno estiver selecionado.',
        type: 'number',
        defaultValue: 1.0,
        category: 'advanced'
    },
    {
        key: 'aperture_array/element_pattern/taper/gaussian_fwhm_deg',
        section: 'telescope',
        label: 'FWHM do taper gaussiano (°)',
        tooltip: 'Largura a meia altura (FWHM) do tapering gaussiano, em graus.',
        type: 'number',
        defaultValue: 45.0,
        category: 'advanced'
    },
    {
        key: 'gaussian_beam/fwhm_deg',
        section: 'telescope',
        label: 'FWHM do Gaussian beam (°)',
        tooltip: 'Para stations com beam gaussiano simples: FWHM na frequência de referência, em graus.',
        type: 'number',
        defaultValue: 0.0,
        category: 'advanced'
    },
    {
        key: 'gaussian_beam/ref_freq_hz',
        section: 'telescope',
        label: 'Freq. de referência do Gaussian beam (Hz)',
        tooltip: 'Frequência de referência do FWHM especificado, em Hz.',
        type: 'number',
        defaultValue: 0.0,
        category: 'advanced'
    },
    {
        key: 'ionosphere_screen_type',
        section: 'telescope',
        label: 'Tipo de tela ionosférica',
        tooltip: 'Tipo de phase screen ionosférica a utilizar.',
        type: 'select',
        defaultValue: 'None',
        category: 'advanced',
        options: [
            { value: 'None', label: 'Nenhum' },
            { value: 'External', label: 'Externo (FITS)' }
        ]
    },
    {
        key: 'external_tec_screen/input_fits_file',
        section: 'telescope',
        label: 'Arquivo FITS da tela TEC',
        tooltip: 'Caminho para arquivo FITS (ARatmospy) para a tela TEC.',
        type: 'text',
        defaultValue: '',
        category: 'advanced',
        isFilePath: true
    },
    {
        key: 'external_tec_screen/screen_height_km',
        section: 'telescope',
        label: 'Altura da tela ionosférica (km)',
        tooltip: 'Altura da tela ionosférica, em quilômetros.',
        type: 'number',
        defaultValue: 300,
        category: 'advanced'
    },

    // =========================================================================
    // [beam_pattern]
    // =========================================================================
    {
        key: 'all_stations',
        section: 'beam_pattern',
        label: 'Todas as stations',
        tooltip: 'Se habilitado, produz beams para todas as stations do modelo de telescópio.',
        type: 'select',
        defaultValue: 'false',
        category: 'essential',
        options: [
            { value: 'true', label: 'Sim (todas)' },
            { value: 'false', label: 'Não (selecionadas)' }
        ]
    },
    {
        key: 'station_ids',
        section: 'beam_pattern',
        label: 'IDs de stations',
        tooltip: 'IDs (base-zero) das stations para gerar beam patterns. Separados por vírgula (CSV).',
        type: 'text',
        defaultValue: '0',
        category: 'essential'
    },
    {
        key: 'coordinate_frame',
        section: 'beam_pattern',
        label: 'Sistema de coordenadas',
        tooltip: 'Sistema de coordenadas para avaliar o beam pattern. Horizon cobre o céu inteiro.',
        type: 'select',
        defaultValue: 'Equatorial',
        category: 'recommended',
        options: [
            { value: 'Equatorial', label: 'Equatorial' },
            { value: 'Horizon', label: 'Horizon' }
        ]
    },
    {
        key: 'coordinate_type',
        section: 'beam_pattern',
        label: 'Tipo de coordenadas',
        tooltip: 'Beam image: imagem no plano tangente centrada no phase centre. Sky model: avalia apenas nas coordenadas fornecidas.',
        type: 'select',
        defaultValue: 'Beam image',
        category: 'recommended',
        options: [
            { value: 'Beam image', label: 'Beam image (plano tangente)' },
            { value: 'Sky model', label: 'Sky model (coordenadas fornecidas)' }
        ]
    },
    {
        key: 'beam_image/specify_cellsize',
        section: 'beam_pattern',
        label: 'Especificar cellsize',
        tooltip: 'Se habilitado, especifica cellsize; caso contrário, especifica campo de visão (FOV).',
        type: 'select',
        defaultValue: 'false',
        category: 'recommended',
        options: [
            { value: 'true', label: 'Sim (cellsize)' },
            { value: 'false', label: 'Não (FOV)' }
        ]
    },
    {
        key: 'beam_image/size',
        section: 'beam_pattern',
        label: 'Dimensões da imagem (px)',
        tooltip: 'Dimensões da imagem. Valor único = quadrado (ex: 256 → 256×256). Pode ser "256,128" para largura×altura.',
        type: 'text',
        defaultValue: '256',
        category: 'essential'
    },
    {
        key: 'beam_image/fov_deg',
        section: 'beam_pattern',
        label: 'Campo de visão (°)',
        tooltip: 'FOV total em graus (máx 180). Valor único = igual em ambas dimensões. Pode ser "2.0,1.0".',
        type: 'text',
        defaultValue: '2.0',
        category: 'essential'
    },
    {
        key: 'beam_image/cellsize_arcsec',
        section: 'beam_pattern',
        label: 'Cellsize (arcsec)',
        tooltip: 'Tamanho do pixel em arco-segundos (usado se "Especificar cellsize" = Sim).',
        type: 'number',
        defaultValue: 1.0,
        category: 'recommended'
    },
    {
        key: 'sky_model/file',
        section: 'beam_pattern',
        label: 'Arquivo do modelo de céu',
        tooltip: 'Caminho para arquivo de sky model de entrada (para avaliar beam em coordenadas específicas).',
        type: 'text',
        defaultValue: '',
        category: 'advanced',
        isFilePath: true
    },
    {
        key: 'root_path',
        section: 'beam_pattern',
        label: 'Caminho raiz de saída',
        tooltip: 'Nome raiz dos arquivos de saída. Sufixos e extensões serão adicionados automaticamente.',
        type: 'text',
        defaultValue: '',
        category: 'essential',
        required: true,
        isFilePath: true
    },
    {
        key: 'output/separate_time_and_channel',
        section: 'beam_pattern',
        label: 'Separar tempo e canal',
        tooltip: 'Se true, gera arquivos de saída sem fazer média sobre tempo ou canal.',
        type: 'select',
        defaultValue: 'true',
        category: 'recommended',
        options: [
            { value: 'true', label: 'Sim' },
            { value: 'false', label: 'Não' }
        ]
    },
    {
        key: 'output/average_time_and_channel',
        section: 'beam_pattern',
        label: 'Média de tempo e canal',
        tooltip: 'Se true, gera arquivos com média sobre tempo e canal.',
        type: 'select',
        defaultValue: 'false',
        category: 'recommended',
        options: [
            { value: 'true', label: 'Sim' },
            { value: 'false', label: 'Não' }
        ]
    },
    {
        key: 'output/average_single_axis',
        section: 'beam_pattern',
        label: 'Média em eixo único',
        tooltip: 'Se definido, faz média sobre o eixo selecionado.',
        type: 'select',
        defaultValue: 'None',
        category: 'advanced',
        options: [
            { value: 'None', label: 'Nenhum' },
            { value: 'Time', label: 'Tempo' },
            { value: 'Channel', label: 'Canal' }
        ]
    },

    // Station outputs - text
    {
        key: 'station_outputs/text_file/raw_complex',
        section: 'beam_pattern',
        label: 'Texto: complexo bruto',
        tooltip: 'Se true, salva o padrão complexo bruto em arquivos de texto.',
        type: 'select',
        defaultValue: 'false',
        category: 'advanced',
        options: [{ value: 'true', label: 'Sim' }, { value: 'false', label: 'Não' }]
    },
    {
        key: 'station_outputs/text_file/amp',
        section: 'beam_pattern',
        label: 'Texto: amplitude',
        tooltip: 'Se true, salva a amplitude (voltagem) em arquivos de texto.',
        type: 'select',
        defaultValue: 'false',
        category: 'advanced',
        options: [{ value: 'true', label: 'Sim' }, { value: 'false', label: 'Não' }]
    },
    {
        key: 'station_outputs/text_file/phase',
        section: 'beam_pattern',
        label: 'Texto: fase',
        tooltip: 'Se true, salva o padrão de fase em arquivos de texto.',
        type: 'select',
        defaultValue: 'false',
        category: 'advanced',
        options: [{ value: 'true', label: 'Sim' }, { value: 'false', label: 'Não' }]
    },
    {
        key: 'station_outputs/text_file/auto_power',
        section: 'beam_pattern',
        label: 'Texto: auto-potência',
        tooltip: 'Se true, salva o beam de auto-correlação (intensidade total) em texto.',
        type: 'select',
        defaultValue: 'false',
        category: 'advanced',
        options: [{ value: 'true', label: 'Sim' }, { value: 'false', label: 'Não' }]
    },

    // Station outputs - FITS
    {
        key: 'station_outputs/fits_image/amp',
        section: 'beam_pattern',
        label: 'FITS: amplitude',
        tooltip: 'Se true, salva a amplitude em imagens FITS.',
        type: 'select',
        defaultValue: 'false',
        category: 'advanced',
        options: [{ value: 'true', label: 'Sim' }, { value: 'false', label: 'Não' }]
    },
    {
        key: 'station_outputs/fits_image/phase',
        section: 'beam_pattern',
        label: 'FITS: fase',
        tooltip: 'Se true, salva a fase em imagens FITS.',
        type: 'select',
        defaultValue: 'false',
        category: 'advanced',
        options: [{ value: 'true', label: 'Sim' }, { value: 'false', label: 'Não' }]
    },
    {
        key: 'station_outputs/fits_image/auto_power',
        section: 'beam_pattern',
        label: 'FITS: auto-potência',
        tooltip: 'Se true, salva o beam de auto-correlação em imagens FITS.',
        type: 'select',
        defaultValue: 'false',
        category: 'recommended',
        options: [{ value: 'true', label: 'Sim' }, { value: 'false', label: 'Não' }]
    },
    {
        key: 'station_outputs/fits_image/auto_power_phase',
        section: 'beam_pattern',
        label: 'FITS: fase auto-potência',
        tooltip: 'Se true, salva a fase da auto-correlação em imagens FITS.',
        type: 'select',
        defaultValue: 'false',
        category: 'advanced',
        options: [{ value: 'true', label: 'Sim' }, { value: 'false', label: 'Não' }]
    },
    {
        key: 'station_outputs/fits_image/auto_power_real',
        section: 'beam_pattern',
        label: 'FITS: parte real auto-potência',
        tooltip: 'Se true, salva a parte real do beam auto-correlação em FITS.',
        type: 'select',
        defaultValue: 'false',
        category: 'advanced',
        options: [{ value: 'true', label: 'Sim' }, { value: 'false', label: 'Não' }]
    },
    {
        key: 'station_outputs/fits_image/auto_power_imag',
        section: 'beam_pattern',
        label: 'FITS: parte imaginária auto-potência',
        tooltip: 'Se true, salva a parte imaginária do beam auto-correlação em FITS.',
        type: 'select',
        defaultValue: 'false',
        category: 'advanced',
        options: [{ value: 'true', label: 'Sim' }, { value: 'false', label: 'Não' }]
    },

    // Telescope outputs - text
    {
        key: 'telescope_outputs/text_file/cross_power_raw_complex',
        section: 'beam_pattern',
        label: 'Telescópio texto: cross-power complexo',
        tooltip: 'Se true, salva a resposta bruta do cross-power beam médio de todas as stations em texto.',
        type: 'select',
        defaultValue: 'false',
        category: 'advanced',
        options: [{ value: 'true', label: 'Sim' }, { value: 'false', label: 'Não' }]
    },
    {
        key: 'telescope_outputs/text_file/cross_power_amp',
        section: 'beam_pattern',
        label: 'Telescópio texto: cross-power amplitude',
        tooltip: 'Se true, salva a amplitude do cross-power beam médio em texto.',
        type: 'select',
        defaultValue: 'false',
        category: 'advanced',
        options: [{ value: 'true', label: 'Sim' }, { value: 'false', label: 'Não' }]
    },
    {
        key: 'telescope_outputs/text_file/cross_power_phase',
        section: 'beam_pattern',
        label: 'Telescópio texto: cross-power fase',
        tooltip: 'Se true, salva a fase do cross-power beam médio em texto.',
        type: 'select',
        defaultValue: 'false',
        category: 'advanced',
        options: [{ value: 'true', label: 'Sim' }, { value: 'false', label: 'Não' }]
    },

    // Telescope outputs - FITS
    {
        key: 'telescope_outputs/fits_image/cross_power_amp',
        section: 'beam_pattern',
        label: 'Telescópio FITS: cross-power amplitude',
        tooltip: 'Se true, salva a amplitude do cross-power beam médio em FITS.',
        type: 'select',
        defaultValue: 'false',
        category: 'advanced',
        options: [{ value: 'true', label: 'Sim' }, { value: 'false', label: 'Não' }]
    },
    {
        key: 'telescope_outputs/fits_image/cross_power_phase',
        section: 'beam_pattern',
        label: 'Telescópio FITS: cross-power fase',
        tooltip: 'Se true, salva a fase do cross-power beam médio em FITS.',
        type: 'select',
        defaultValue: 'false',
        category: 'advanced',
        options: [{ value: 'true', label: 'Sim' }, { value: 'false', label: 'Não' }]
    },
    {
        key: 'telescope_outputs/fits_image/cross_power_real',
        section: 'beam_pattern',
        label: 'Telescópio FITS: cross-power real',
        tooltip: 'Se true, salva a parte real do cross-power beam médio em FITS.',
        type: 'select',
        defaultValue: 'false',
        category: 'advanced',
        options: [{ value: 'true', label: 'Sim' }, { value: 'false', label: 'Não' }]
    },
    {
        key: 'telescope_outputs/fits_image/cross_power_imag',
        section: 'beam_pattern',
        label: 'Telescópio FITS: cross-power imaginário',
        tooltip: 'Se true, salva a parte imaginária do cross-power beam médio em FITS.',
        type: 'select',
        defaultValue: 'false',
        category: 'advanced',
        options: [{ value: 'true', label: 'Sim' }, { value: 'false', label: 'Não' }]
    },

    // Test source
    {
        key: 'test_source/stokes_i',
        section: 'beam_pattern',
        label: 'Fonte de teste Stokes I',
        tooltip: 'Se true, usa uma fonte de teste Stokes I.',
        type: 'select',
        defaultValue: 'true',
        category: 'recommended',
        options: [{ value: 'true', label: 'Sim' }, { value: 'false', label: 'Não' }]
    },
    {
        key: 'test_source/custom',
        section: 'beam_pattern',
        label: 'Fonte de teste customizada',
        tooltip: 'Se true, usa uma fonte de teste customizada com os valores Stokes abaixo.',
        type: 'select',
        defaultValue: 'false',
        category: 'advanced',
        options: [{ value: 'true', label: 'Sim' }, { value: 'false', label: 'Não' }]
    },
    {
        key: 'test_source/custom_stokes_i',
        section: 'beam_pattern',
        label: 'Stokes I (fonte custom)',
        tooltip: 'Valor Stokes I para a fonte de teste customizada.',
        type: 'number',
        defaultValue: 1.0,
        category: 'advanced'
    },
    {
        key: 'test_source/custom_stokes_q',
        section: 'beam_pattern',
        label: 'Stokes Q (fonte custom)',
        tooltip: 'Valor Stokes Q para a fonte de teste customizada.',
        type: 'number',
        defaultValue: 0.0,
        category: 'advanced'
    },
    {
        key: 'test_source/custom_stokes_u',
        section: 'beam_pattern',
        label: 'Stokes U (fonte custom)',
        tooltip: 'Valor Stokes U para a fonte de teste customizada.',
        type: 'number',
        defaultValue: 0.0,
        category: 'advanced'
    },
    {
        key: 'test_source/custom_stokes_v',
        section: 'beam_pattern',
        label: 'Stokes V (fonte custom)',
        tooltip: 'Valor Stokes V para a fonte de teste customizada.',
        type: 'number',
        defaultValue: 0.0,
        category: 'advanced'
    }
]);

/**
 * Rótulos de seções para o oskar_sim_beam_pattern.
 * @constant {Object<string, string>}
 */
const BEAM_PATTERN_SECTION_LABELS = Object.freeze({
    simulator: 'Simulador',
    observation: 'Observação',
    telescope: 'Telescópio',
    beam_pattern: 'Beam Pattern'
});

/**
 * Classe geradora do arquivo .ini do oskar_sim_beam_pattern.
 */
class OskarBeamPatternGenerator {
    constructor() {
        /** @type {Object<string, HTMLElement>} */
        this.inputElements = {};

        this.paramsContainer = document.getElementById('beam-pattern-ini-params-container');
        this.previewTextarea = document.getElementById('beam-pattern-ini-preview');
        this.validationContainer = document.getElementById('beam-pattern-ini-validation-messages');

        this._bindButtons();
        this.renderParameters();
        this.updatePreview();

        console.log('OskarBeamPatternGenerator inicializado com sucesso.');
    }

    _bindButtons() {
        const copyBtn = document.getElementById('beam-pattern-ini-copy-btn');
        const downloadBtn = document.getElementById('beam-pattern-ini-download-btn');

        if (copyBtn) copyBtn.addEventListener('click', (e) => { e.preventDefault(); this.copyIni(); });
        if (downloadBtn) downloadBtn.addEventListener('click', (e) => { e.preventDefault(); this.downloadIni(); });
    }

    renderParameters() {
        if (!this.paramsContainer) {
            console.warn('Container beam-pattern-ini-params-container não encontrado no DOM.');
            return;
        }
        this.paramsContainer.innerHTML = '';
        this.inputElements = {};

        const sectionOrder = ['simulator', 'observation', 'telescope', 'beam_pattern'];

        INI_CATEGORIES.forEach(cat => {
            const params = OSKAR_BEAM_PATTERN_PARAMS.filter(p => p.category === cat.id);
            if (params.length === 0) return;

            const catWrapper = document.createElement('div');
            catWrapper.className = `ini-category ini-category--${cat.id}`;

            const catHeader = document.createElement('div');
            catHeader.className = 'ini-category__header';
            catHeader.innerHTML = `<i class="fas ${cat.icon}"></i> <span>${cat.label}</span>`;

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
                legend.textContent = BEAM_PATTERN_SECTION_LABELS[sec] || sec;
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

    _createParamRow(param) {
        const row = document.createElement('div');
        row.className = 'ini-param-row';
        if (param.required) row.classList.add('ini-param-row--required');

        const label = document.createElement('label');
        const inputId = `bp-input-${param.section}-${param.key.replace(/[/.]/g, '_')}`;
        label.setAttribute('for', inputId);
        label.textContent = param.label;
        if (param.required) {
            const req = document.createElement('span');
            req.className = 'ini-required-mark';
            req.textContent = ' *';
            label.appendChild(req);
        }

        const tooltipIcon = document.createElement('i');
        tooltipIcon.className = 'fas fa-question-circle ini-tooltip-icon';
        tooltipIcon.title = param.tooltip;
        label.appendChild(tooltipIcon);

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

        input.addEventListener('change', () => this.updatePreview());
        input.addEventListener('input', () => this.updatePreview());

        const errorSpan = document.createElement('span');
        errorSpan.className = 'ini-field-error';

        const compositeKey = `${param.section}.${param.key}`;
        this.inputElements[compositeKey] = input;

        row.appendChild(label);

        if (param.isFilePath) {
            const inputWrapper = document.createElement('div');
            inputWrapper.className = 'ini-file-input-wrapper';
            input.placeholder = param.isDirectory
                ? 'Ex: /home/user/telescope'
                : 'Ex: /home/user/data/beam_output';
            inputWrapper.appendChild(input);

            const browseBtn = document.createElement('button');
            browseBtn.type = 'button';
            browseBtn.className = 'ini-browse-btn';
            browseBtn.title = 'Inserir caminho completo do ' + (param.isDirectory ? 'diretório' : 'arquivo');
            browseBtn.innerHTML = '<i class="fas fa-folder-open"></i>';

            browseBtn.addEventListener('click', (e) => {
                e.preventDefault();
                const lbl = param.isDirectory ? 'diretório' : 'arquivo';
                const currentVal = input.value || '';
                const path = prompt(
                    `Cole o caminho completo do ${lbl} no seu computador:`,
                    currentVal
                );
                if (path !== null && path.trim() !== '') {
                    input.value = path.trim();
                    input.dispatchEvent(new Event('input'));
                }
            });

            inputWrapper.appendChild(browseBtn);
            row.appendChild(inputWrapper);
        } else {
            row.appendChild(input);
        }

        row.appendChild(errorSpan);
        return row;
    }

    generateIni() {
        const eol = getOsLineEnding();
        const sections = {};

        OSKAR_BEAM_PATTERN_PARAMS.forEach(param => {
            const compositeKey = `${param.section}.${param.key}`;
            const input = this.inputElements[compositeKey];
            if (!input) return;

            let value;
            if (param.type === 'checkbox') {
                value = input.checked ? 'true' : 'false';
            } else {
                value = input.value;
            }

            if (value === '' && !param.required) return;

            if (!sections[param.section]) sections[param.section] = [];
            sections[param.section].push({ key: param.key, value });
        });

        const sectionOrder = ['simulator', 'observation', 'telescope', 'beam_pattern'];
        const lines = [];
        lines.push('[General]');
        lines.push('app=oskar_sim_beam_pattern');
        lines.push('');

        sectionOrder.forEach(sec => {
            if (!sections[sec] || sections[sec].length === 0) return;
            lines.push(`[${sec}]`);
            sections[sec].forEach(entry => {
                lines.push(`${entry.key}=${entry.value}`);
            });
            lines.push('');
        });

        return lines.join(eol);
    }

    updatePreview() {
        if (!this.previewTextarea) return;
        this.previewTextarea.value = this.generateIni();
    }

    validateFields() {
        let allValid = true;
        OSKAR_BEAM_PATTERN_PARAMS.forEach(param => {
            const compositeKey = `${param.section}.${param.key}`;
            const input = this.inputElements[compositeKey];
            if (!input) return;

            const row = input.closest('.ini-param-row');
            const errorSpan = row ? row.querySelector('.ini-field-error') : null;
            let errorMsg = '';

            const value = (param.type === 'checkbox') ? input.checked : input.value;
            if (param.required && (value === '' || value === null || value === undefined)) {
                errorMsg = 'Campo obrigatório.';
            }
            if (!errorMsg && param.type === 'number' && value !== '') {
                if (isNaN(Number(value))) errorMsg = 'Valor numérico inválido.';
            }

            if (errorMsg) {
                allValid = false;
                if (input.classList) input.classList.add('ini-input--error');
            } else {
                if (input.classList) input.classList.remove('ini-input--error');
            }
            if (errorSpan) errorSpan.textContent = errorMsg;
        });

        if (this.validationContainer) {
            this.validationContainer.innerHTML = allValid
                ? '<span class="ini-validation-ok"><i class="fas fa-check-circle"></i> Todos os campos estão válidos.</span>'
                : '<span class="ini-validation-error"><i class="fas fa-exclamation-triangle"></i> Campos com erros.</span>';
        }
        return allValid;
    }

    downloadIni() {
        if (!this.validateFields()) {
            console.warn('Download cancelado: campos com erro.');
            return;
        }
        const content = this.generateIni();
        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'oskar_sim_beam_pattern.ini';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        console.log('Arquivo oskar_sim_beam_pattern.ini baixado com sucesso.');
    }

    copyIni() {
        const content = this.generateIni();
        const copyBtn = document.getElementById('beam-pattern-ini-copy-btn');

        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(content).then(() => {
                this._showCopyFeedback(copyBtn, true);
            }).catch(() => {
                this._showCopyFeedback(copyBtn, false);
            });
        } else if (this.previewTextarea) {
            this.previewTextarea.select();
            document.execCommand('copy');
            this._showCopyFeedback(copyBtn, true);
        }
    }

    _showCopyFeedback(button, success) {
        if (!button) return;
        const icon = button.querySelector('i');
        if (!icon) return;
        const orig = 'fa-copy';
        const feedback = success ? 'fa-check' : 'fa-times';
        icon.classList.remove(orig);
        icon.classList.add(feedback);
        button.style.color = success ? 'var(--success-color)' : 'var(--secondary-color)';
        setTimeout(() => {
            icon.classList.remove(feedback);
            icon.classList.add(orig);
            button.style.color = '';
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

    if (!window.oskarImagerGenerator) {
        try {
            window.oskarImagerGenerator = new OskarImagerGenerator();
            console.log('Instância de OskarImagerGenerator criada e configurada.');
        } catch (error) {
            console.error('Erro ao instanciar OskarImagerGenerator:', error);
        }
    } else {
        window.oskarImagerGenerator.updatePreview();
    }

    if (!window.oskarBeamPatternGenerator) {
        try {
            window.oskarBeamPatternGenerator = new OskarBeamPatternGenerator();
            console.log('Instância de OskarBeamPatternGenerator criada e configurada.');
        } catch (error) {
            console.error('Erro ao instanciar OskarBeamPatternGenerator:', error);
        }
    } else {
        window.oskarBeamPatternGenerator.updatePreview();
    }
});
