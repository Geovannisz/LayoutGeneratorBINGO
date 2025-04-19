# oskar_telescope_generator.py
"""
Script principal para gerar estruturas de telescópio OSKAR para BINGO.

Este script utiliza a biblioteca 'bingo_layouts.py' para gerar diferentes
layouts de estação (posições dos centros dos tiles). Ele lê as posições
das estações (outriggers) de um arquivo CSV e cria a estrutura de diretórios
necessária para simulações OSKAR, combinando cada layout de estação com
cada arranjo definido no CSV.

O script gera 16 configurações de layout pré-definidas (4 formas x 4 variantes)
e pede confirmação visual para cada uma antes de gerar os arquivos.
"""

import csv
import os
import numpy as np
import matplotlib.pyplot as plt
import math
from collections import defaultdict
import traceback
from typing import Dict, Any, Callable, List

# Importa a biblioteca de layouts recém-criada
try:
    import bingo_layouts
except ImportError:
    print("Erro Crítico: Não foi possível encontrar a biblioteca 'bingo_layouts.py'.")
    print("Certifique-se de que 'bingo_layouts.py' está no mesmo diretório que este script.")
    exit()

# Importa a biblioteca de layouts recém-criada
try:
    import bingo_layouts
    # Importa a constante necessária da biblioteca
    from bingo_layouts import DEFAULT_MAX_PLACEMENT_ATTEMPTS
except ImportError:
    print("Erro Crítico: Não foi possível encontrar a biblioteca 'bingo_layouts.py'.")
    print("Certifique-se de que 'bingo_layouts.py' está no mesmo diretório que este script.")
    exit()

# ==================== Constantes Globais ====================

# --- Parâmetros do Tile (Elemento base de 64 antenas) ---
# Mantém os valores originais convertidos para METROS
SUBGROUP_DX_MM = 176.0695885 # Original em mm
SUBGROUP_DY_MM = 167.5843071 # Original em mm
SUBGROUP_DX = SUBGROUP_DX_MM / 1000.0 # Espaçamento X dos centros INTERNOS do tile em METROS
SUBGROUP_DY = SUBGROUP_DY_MM / 1000.0 # Espaçamento Y dos centros INTERNOS do tile em METROS
SUBGROUP_N = 2 # Número de centros internos na direção X
SUBGROUP_M = 8 # Número de centros internos na direção Y
N_SUBGROUPS = SUBGROUP_N * SUBGROUP_M # = 16

N_ANTENNAS_PER_SUBGROUP = 4 # Antenas por losango interno
DIAMOND_OFFSET = 0.05 # "Raio" do losango/diamante interno em METROS (5 cm).
N_ANTENNAS_PER_TILE = N_SUBGROUPS * N_ANTENNAS_PER_SUBGROUP # Deve ser 16 * 4 = 64

# --- Dimensões FÍSICAS GERAIS do tile (em METROS) ---
# Usadas como REFERÊNCIA DE ESCALA para as funções em bingo_layouts
TILE_WIDTH = 0.35  # Largura física do tile em METROS
TILE_HEIGHT = 1.34 # Altura física do tile em METROS
TILE_DIAGONAL_M = math.sqrt(TILE_WIDTH**2 + TILE_HEIGHT**2) # Diagonal para escala

# --- Configurações de Entrada/Saída ---
# Caminho para o arquivo CSV com posições dos outriggers (WGS84)
# Formato esperado: ArrangementName,StationID,Latitude,Longitude,Altitude
CSV_INPUT_FILE = r'C:\Users\gefer\Documents\particular\OSKAR\posicoes_outriggers.csv'

# Diretório base ONDE as pastas dos telescópios serão geradas
# Ex: Se OUTPUT_BASE_DIR = '.../layouts', as saídas serão '.../layouts/circulo_padrao_50km_a', etc.
OUTPUT_BASE_DIR = r'C:\Users\gefer\Desktop\Mestrado\Softwares\OSKAR\OSKAR-2.7-Example-Data\inputs\TELESCOPES\layouts'

# --- Ponto de Referência (BINGO Central) ---
# Coordenadas WGS84
BINGO_LATITUDE = -7.04067
BINGO_LONGITUDE = -38.26884
BINGO_ALTITUDE = 396.4 # Altitude já está em metros

# ==================== Layout do Tile (64 Antenas - Losangos Internos) ====================
# Esta função define a estrutura INTERNA de um único tile de 64 elementos.
# É a mesma função do seu script original. Ela NÃO usa a biblioteca bingo_layouts.

def create_tile_layout_64_antennas(
    center_spacing_x=SUBGROUP_DX, center_spacing_y=SUBGROUP_DY,
    centers_N=SUBGROUP_N, centers_M=SUBGROUP_M,
    diamond_offset=DIAMOND_OFFSET
    ) -> np.ndarray:
    """
    Cria o layout INTERNO do tile com 64 elementos (16x4), onde 4 elementos
    formam um losango/diamante ao redor de cada um dos 16 pontos centrais (grid NxM).
    Retorna posições (x, y) em METROS, centradas na origem (0,0).
    """
    if centers_N <= 0 or centers_M <= 0 or diamond_offset <= 0:
        print("Aviso: Parâmetros inválidos para create_tile_layout_64_antennas.")
        return np.empty((0, 2))

    subgroup_centers = []
    # 1. Gerar os 16 centros (grid NxM)
    for i in range(centers_N):
        pos_cx = (i - (centers_N - 1) / 2.0) * center_spacing_x
        for j in range(centers_M):
            pos_cy = (j - (centers_M - 1) / 2.0) * center_spacing_y
            subgroup_centers.append([pos_cx, pos_cy])

    subgroup_centers = np.array(subgroup_centers)
    # Nota: os centros já são gerados em torno da origem por causa da subtração da média dos índices.

    # 2. Para cada centro, gerar os 4 pontos do losango
    final_antenna_positions = []
    offsets = np.array([
        [0, diamond_offset],  # Norte relativo
        [diamond_offset, 0],  # Leste relativo
        [0, -diamond_offset], # Sul relativo
        [-diamond_offset, 0]  # Oeste relativo
    ])

    for center in subgroup_centers:
        for offset in offsets:
            final_antenna_positions.append(center + offset)

    tile_array = np.array(final_antenna_positions)

    # Re-centraliza o conjunto final de 64 antenas para garantir
    tile_array -= tile_array.mean(axis=0)

    # Verificação da contagem final
    expected_total_antennas = centers_N * centers_M * N_ANTENNAS_PER_SUBGROUP
    if tile_array.shape[0] != expected_total_antennas:
         print(f"AVISO: create_tile_layout_64_antennas gerou {tile_array.shape[0]} antenas, esperado {expected_total_antennas}.")

    return tile_array

# ==================== Funções de Formatação e Plotagem (Do script original) ====================

def format_layout_content_xy(layout_array: np.ndarray) -> str:
    """Formata um array numpy (N, 2) para string CSV (x, y em METROS)."""
    content = ""
    precision = 6 # Precisão padrão para x, y em metros (OSKAR)
    if not isinstance(layout_array, np.ndarray) or layout_array.ndim != 2 or layout_array.shape[1] != 2:
        print(f"Aviso: format_layout_content_xy recebeu array com shape inválido: {layout_array.shape if isinstance(layout_array, np.ndarray) else type(layout_array)}")
        return ""
    if layout_array.size == 0:
        return ""

    for row in layout_array:
        try:
            content += f"{float(row[0]):.{precision}f},{float(row[1]):.{precision}f}\n"
        except (ValueError, TypeError):
            content += "NaN,NaN\n"
    return content

def format_layout_content_wgs84(wgs84_coords_list: List[List[float]]) -> str:
    """Formata uma lista de coordenadas WGS84 [lat, lon, alt] para string."""
    content = ""
    lat_lon_precision = 7
    alt_precision = 1
    for row in wgs84_coords_list:
        if len(row) == 3:
            content += f"{row[0]:.{lat_lon_precision}f},{row[1]:.{lat_lon_precision}f},{row[2]:.{alt_precision}f}\n"
        else:
            content += "\n" # Linha vazia para entrada inválida
    return content

def plot_station_layout(
    station_antennas_layout_array: np.ndarray, # Layout de TODAS as antenas
    station_centers_layout_array: np.ndarray, # Layout dos CENTROS dos tiles
    title: str = "Layout da Estação"
    ) -> bool:
    """
    Plota a disposição das antenas individuais e os centros dos tiles.
    Ambos os arrays devem estar em METROS.
    """
    antennas_valid = isinstance(station_antennas_layout_array, np.ndarray) and station_antennas_layout_array.ndim == 2 and station_antennas_layout_array.shape[1] >= 2
    centers_valid = isinstance(station_centers_layout_array, np.ndarray) and station_centers_layout_array.ndim == 2 and station_centers_layout_array.shape[1] >= 2

    if not antennas_valid and not centers_valid:
        print("Erro: Nenhum dado válido para plotar (antenas ou centros).")
        return False
    if antennas_valid and station_antennas_layout_array.shape[0] == 0 and centers_valid and station_centers_layout_array.shape[0] == 0:
         print("Aviso: Arrays de antenas e centros vazios. Nada para plotar.")
         return True # Retorna True pois não houve erro, apenas nada a fazer

    plt.figure(figsize=(10, 10))

    # Plota antenas individuais (se houver)
    if antennas_valid and station_antennas_layout_array.shape[0] > 0:
        num_antennas = station_antennas_layout_array.shape[0]
        # Ajusta o tamanho do marcador baseado no número de antenas
        marker_size = max(1, 7 - np.log10(num_antennas)) if num_antennas > 1 else 5
        plt.scatter(station_antennas_layout_array[:, 0], station_antennas_layout_array[:, 1],
                    marker='.', s=marker_size, label=f"Antenas ({num_antennas})", alpha=0.5, zorder=1)

    # Plota centros dos tiles (se houver)
    if centers_valid and station_centers_layout_array.shape[0] > 0:
         num_centers = station_centers_layout_array.shape[0]
         plt.scatter(station_centers_layout_array[:, 0], station_centers_layout_array[:, 1],
                     marker='x', s=50, color='red', label=f"Centros Tiles ({num_centers})", zorder=2)

    plt.xlabel("X (metros)")
    plt.ylabel("Y (metros)")
    plt.title(title, fontsize=14)
    plt.gca().set_aspect('equal', adjustable='box')
    plt.grid(True, linestyle='--', alpha=0.6)
    plt.legend()
    print(f"\nExibindo gráfico: {title}")
    print(">>> FECHE a janela do gráfico para continuar ou cancelar <<<")
    try:
        plt.show()
        return True # Gráfico foi exibido
    except Exception as e:
        print(f"Erro ao exibir o gráfico: {e}")
        return False # Falha ao mostrar

# ==================== Função Principal de Geração OSKAR ====================

def create_oskar_structure_grouped(
    csv_input_path: str,
    output_base_path: str,
    layout_config: Dict[str, Any], # Dicionário contendo name, layout_function, params
    base_tile_layout: np.ndarray # Layout pré-calculado das 64 antenas do tile
    ):
    """
    Cria a estrutura OSKAR para um layout de estação específico, combinado com
    os arranjos definidos no CSV.

    Args:
        csv_input_path (str): Caminho para o arquivo CSV (formato BINGO v3).
        output_base_path (str): Caminho base para a pasta de saída dos telescópios (ex: .../layouts).
        layout_config (Dict): Dicionário descrevendo o layout da estação a ser gerado.
                               Deve conter 'name', 'layout_function', 'params'.
        base_tile_layout (np.ndarray): Array (64, 2) com as posições das antenas dentro de um tile.
    """
    layout_name = layout_config.get('name', 'layout_desconhecido')
    layout_function = layout_config.get('layout_function')
    layout_params = layout_config.get('params', {})

    if not layout_function or not callable(layout_function):
        print(f"Erro Crítico: Função de layout inválida para '{layout_name}'. Abortando este layout.")
        return

    print(f"\n--- Iniciando Geração para Layout de Estação: '{layout_name}' ---")
    print(f"Usando CSV: {csv_input_path}")
    print(f"Diretório Base de Saída: {output_base_path}")
    print(f"Função da Biblioteca: bingo_layouts.{layout_function.__name__}")
    print(f"Parâmetros: {layout_params}")

    # --- 1. Calcular Layout da Estação (Centros dos Tiles) ---
    print("Calculando layout da estação (centros dos tiles em METROS)...")
    station_centers_coords = []
    try:
        # Adiciona as dimensões do tile aos parâmetros, pois são necessárias pela biblioteca
        full_params = {
            **layout_params, # Parâmetros específicos do layout
            'tile_width_m': TILE_WIDTH,
            'tile_height_m': TILE_HEIGHT
        }
        # Chama a função da biblioteca bingo_layouts com os parâmetros corretos
        station_centers_coords = layout_function(**full_params)

        if not isinstance(station_centers_coords, list) or \
           (station_centers_coords and not isinstance(station_centers_coords[0], list)):
             print("Erro: Função de layout não retornou uma lista de listas. Abortando este layout.")
             return

        # Converte para numpy array para plotagem e formatação
        station_centers_array = np.array(station_centers_coords) if station_centers_coords else np.empty((0, 2))

    except Exception as e:
        print(f"Erro Crítico ao calcular layout da estação '{layout_name}': {e}")
        traceback.print_exc()
        return

    if station_centers_array.size == 0:
        print(f"Aviso: Layout da estação '{layout_name}' resultou em 0 tiles. Pulando este layout.")
        return

    num_tiles_per_station = station_centers_array.shape[0]
    print(f"Layout da estação '{layout_name}' calculado: {num_tiles_per_station} centros de tiles.")

    # --- 2. Calcular Posições de TODAS as Antenas (para plotagem) ---
    print("Calculando posições de todas as antenas individuais (para visualização)...")
    all_antennas_list = []
    if base_tile_layout.size > 0 and num_tiles_per_station > 0:
        for center_pos in station_centers_array:
            # Translada as 64 posições do tile base para o centro atual
            translated_tile_elements = base_tile_layout + center_pos
            all_antennas_list.extend(translated_tile_elements)
    all_antennas_array = np.array(all_antennas_list)
    num_total_antennas = all_antennas_array.shape[0]
    print(f"Total de antenas individuais calculadas: {num_total_antennas}")

    # --- 3. Visualizar Layout e Pedir Confirmação ---
    plot_title = f"Layout Estação: '{layout_name}' ({num_tiles_per_station} Tiles, {num_total_antennas} Antenas)"
    plot_shown = plot_station_layout(all_antennas_array, station_centers_array, title=plot_title)

    if not plot_shown:
         print("Aviso: Não foi possível exibir o gráfico do layout. Verifique o backend do Matplotlib.")
         # Poderíamos parar aqui ou continuar assumindo que o layout está OK
         # Por segurança, vamos parar se o plot falhar.
         # print("Abortando este layout devido à falha na visualização.")
         # return
         # OU, permitir continuar com um aviso extra:
         cont = input("AVISO: Gráfico não exibido. Continuar mesmo assim? (s/n): ").strip().lower()
         if cont != 's':
              print("Operação cancelada pelo usuário.")
              return

    # Confirmação do usuário
    while True:
        try:
            user_input = input(f"Layout '{layout_name}' parece correto? Gerar arquivos? (s/n): ").strip().lower()
            if user_input == 's':
                print(f"Confirmado. Gerando arquivos para o layout '{layout_name}'...")
                break
            elif user_input == 'n':
                print(f"Layout '{layout_name}' cancelado pelo usuário.")
                return # Aborta a geração para ESTE layout
            else:
                print("Entrada inválida. Digite 's' ou 'n'.")
        except EOFError:
             print("\nEntrada interrompida. Operação cancelada.")
             return # Aborta tudo

    # --- 4. Ler CSV e Agrupar por ArrangementName (SÓ EXECUTA SE CONFIRMADO) ---
    arrangements_data = defaultdict(list)
    try:
        print(f"Lendo e agrupando dados do CSV: {csv_input_path}")
        with open(csv_input_path, 'r', encoding='utf-8') as csvfile:
            reader = csv.DictReader(csvfile)
            expected_headers = ['ArrangementName', 'StationID', 'Latitude', 'Longitude', 'Altitude']
            if reader.fieldnames is None: raise ValueError("CSV vazio ou ilegível.")
            if not all(header in reader.fieldnames for header in expected_headers):
                raise ValueError(f"Cabeçalhos CSV ausentes/incorretos. Esperado: {expected_headers}, Encontrado: {reader.fieldnames}")

            line_num = 1
            for row in reader:
                 line_num += 1
                 try:
                     arr_name = row.get('ArrangementName','').strip()
                     st_id = row.get('StationID','').strip()
                     lat_str = row.get('Latitude')
                     lon_str = row.get('Longitude')
                     alt_str = row.get('Altitude')
                     if not arr_name or not st_id or lat_str is None or lon_str is None or alt_str is None:
                         raise ValueError("Campos obrigatórios faltando ou vazios.")
                     lat = float(lat_str); lon = float(lon_str); alt = float(alt_str)
                     station_info = {'StationID': st_id, 'Latitude': lat, 'Longitude': lon, 'Altitude': alt}
                     arrangements_data[arr_name].append(station_info)
                 except (ValueError, TypeError, KeyError) as e:
                      print(f"Aviso: Ignorando linha {line_num} inválida no CSV: {row} - Erro: {e}")

        num_arrangements = len(arrangements_data)
        num_total_stations = sum(len(stations) for stations in arrangements_data.values())
        if num_arrangements == 0: raise ValueError("Nenhum arranjo válido lido do CSV.")
        print(f"Dados lidos: {num_arrangements} arranjos do CSV, {num_total_stations} estações no total.")

    except FileNotFoundError: print(f"Erro Crítico: Arquivo CSV não encontrado: {csv_input_path}"); return
    except ValueError as e: print(f"Erro Crítico no formato ou conteúdo do CSV: {e}"); return
    except Exception as e: print(f"Erro Crítico inesperado ao ler CSV: {e}"); traceback.print_exc(); return

    # --- 5. Formatar Conteúdos Fixos (Layouts Internos) ---
    # Formata o layout do TILE (64 antenas) - Fixo para todos
    tile_layout_content_str = format_layout_content_xy(base_tile_layout)
    # Formata o layout da ESTAÇÃO (centros dos tiles) - Específico deste layout_config
    station_layout_content_str = format_layout_content_xy(station_centers_array)
    # Formata a posição do BINGO Central - Fixo para todos
    bingo_position_content = f"{BINGO_LATITUDE:.7f},{BINGO_LONGITUDE:.7f},{BINGO_ALTITUDE:.1f}\n"

    # --- 6. Criar Estrutura de Pastas e Arquivos por Arranjo CSV ---
    print(f"Criando estrutura de diretórios e arquivos para '{layout_name}'...")
    created_telescopes = 0
    error_telescopes = 0

    # Garante que o diretório base de saída exista
    os.makedirs(output_base_path, exist_ok=True)

    # Itera sobre cada ARRANJO definido no CSV (ex: '50km_a', '100km_b')
    for csv_arrangement_name, stations_list in arrangements_data.items():
        # Nome da pasta final combina o layout da estação e o arranjo do CSV
        telescope_folder_name = f"{layout_name}_{csv_arrangement_name.replace(' ', '_').lower()}"
        telescope_folder_path = os.path.join(output_base_path, telescope_folder_name)

        station_subfolder_path = os.path.join(telescope_folder_path, 'station')
        tile_subfolder_path = os.path.join(station_subfolder_path, 'tile')

        try:
            print(f"  Processando Telescópio: {telescope_folder_name} ({len(stations_list)} estações)")
            os.makedirs(tile_subfolder_path, exist_ok=True) # Cria toda a hierarquia

            # a) layout_wgs84.txt (Posições das Estações do CSV)
            wgs84_coords_for_arrangement = [[s['Latitude'], s['Longitude'], s['Altitude']] for s in stations_list]
            layout_wgs84_content_str = format_layout_content_wgs84(wgs84_coords_for_arrangement)
            wgs84_path = os.path.join(telescope_folder_path, 'layout_wgs84.txt')
            with open(wgs84_path, 'w', encoding='utf-8') as f: f.write(layout_wgs84_content_str)

            # b) position.txt (Posição do BINGO Central)
            position_path = os.path.join(telescope_folder_path, 'position.txt')
            with open(position_path, 'w', encoding='utf-8') as f: f.write(bingo_position_content)

            # c) station/layout.txt (Layout da Estação - CENTROS dos tiles)
            station_layout_path = os.path.join(station_subfolder_path, 'layout.txt')
            with open(station_layout_path, 'w', encoding='utf-8') as f: f.write(station_layout_content_str)

            # d) station/tile/layout.txt (Layout do Tile - 64 antenas)
            tile_layout_path = os.path.join(tile_subfolder_path, 'layout.txt')
            with open(tile_layout_path, 'w', encoding='utf-8') as f: f.write(tile_layout_content_str)

            created_telescopes += 1

        except OSError as e:
            print(f"  Erro de OS ao criar '{telescope_folder_name}': {e}")
            error_telescopes += 1
            continue # Pula para o próximo arranjo do CSV
        except Exception as e:
            print(f"  Erro inesperado ao criar '{telescope_folder_name}': {e}")
            traceback.print_exc()
            error_telescopes += 1
            continue # Pula para o próximo arranjo do CSV

    print(f"--- Geração para Layout '{layout_name}' Concluída ---")
    print(f"Telescópios criados com sucesso: {created_telescopes}")
    if error_telescopes > 0: print(f"Erros durante a criação: {error_telescopes}")


# ==================== Definição dos Layouts a Gerar ====================

# Dicionário mapeando nomes de variantes para parâmetros específicos
# Você pode ajustar esses valores para refinar o que cada variante significa
LAYOUT_VARIANTS = {
    "padrao": {
        # Usa os padrões de cada função de layout
        "desc": "Configuração padrão da forma."
    },
    "espacada": {
        # Aumenta fatores de espaçamento/raio
        "spacing_factor_mult": 3, # Multiplicador para fatores de espaçamento linear
        "radius_step_factor_mult": 1.5, # Multiplicador para passos/raios
        "desc": "Tiles mais afastados uns dos outros."
    },
    "aleatoria": {
        # Adiciona pequeno ruído gaussiano
        "random_offset_stddev_m": 0.3 * TILE_DIAGONAL_M, # 30% da diagonal como desvio padrão
        "desc": "Pequena perturbação aleatória nas posições."
    },
    "exponencial": {
        # Prioriza modos de espaçamento exponencial
        "spacing_mode": "center_exponential", # Para Grid, Rhombus, HexGrid
        "arm_spacing_mode": "exponential",    # Para Spiral
        "ring_spacing_mode": "exponential",   # Para Ring
        "center_exp_scale_factor": 2,      # Fator de escala para center_exponential
        "radius_step_factor_exp": 1.15,       # Fator multiplicativo para spiral/ring exponencial
        "desc": "Espaçamento aumenta exponencialmente do centro ou entre passos."
    }
}

# Lista de configurações de layout a serem geradas
# Cada entrada é um dicionário com:
#   - name: Nome descritivo (será usado no nome da pasta)
#   - layout_function: Referência à função em bingo_layouts
#   - params: Dicionário de parâmetros BASE para a função
# As variantes modificarão esses parâmetros base.
BASE_LAYOUT_CONFIGURATIONS = [
    # ... (definições de circulo, quadrado, losango, espiral, phyllotaxis) ...
    {
        "shape_name": "circulo",
        "base_params": {
            "spacing_mode": 'linear', # Adiciona modo padrão
            "spacing_x_factor": 1.0,
            "spacing_y_factor": 1.0,
            "center_exp_scale_factor": 4, # Padrão se mudar modo
            # Params de offset/colisão adicionados depois pelas variantes
        },
        "layout_function": bingo_layouts.create_manual_circular_layout
    },
    {
        "shape_name": "quadrado",
        "base_params": {
            "num_cols": 12,
            "num_rows": 3,
            "spacing_mode": 'linear',
            "spacing_x_factor": 1,
            "spacing_y_factor": 1,
            "center_exp_scale_factor": 4,
        },
        "layout_function": bingo_layouts.create_grid_layout
    },
    {
        "shape_name": "losango",
        "base_params": {
            "num_rows_half": 6,
            "spacing_mode": 'linear',
            "side_length_factor": 0.65,
            "h_compress_factor": 0.785,
            "v_compress_factor": 0.86,
            "center_exp_scale_factor": 4,
        },
        "layout_function": bingo_layouts.create_rhombus_layout
    },
    {
        "shape_name": "espiral",
        "base_params": {
            "num_arms": 3,
            "tiles_per_arm": 12,
            "arm_spacing_mode": 'linear',
            "center_scale_mode": 'none', # Adiciona modo padrão
            "radius_start_factor": 0.7,
            "radius_step_factor": 0.3,
            "center_exp_scale_factor": 1.1, # Padrão se mudar modo
            "angle_step_rad": math.pi / 9,
            "include_center_tile": False
        },
        "layout_function": bingo_layouts.create_spiral_layout
    },
    # {
    #     "shape_name": "phyllotaxis",
    #      "base_params": {
    #          "num_tiles": 36,
    #          "spacing_mode": 'linear', # Adiciona modo padrão
    #          "scale_factor": 0.6,
    #          "center_offset_factor": 0.05,
    #          "center_exp_scale_factor": 1.1, # Padrão se mudar modo
    #      },
    #     "layout_function": bingo_layouts.create_phyllotaxis_layout
    # },
]

# Gerar a lista final de configurações combinando formas e variantes
LAYOUT_CONFIGURATIONS_TO_RUN = []
print("Definindo configurações de layout para execução...") # Debug print

for base_config in BASE_LAYOUT_CONFIGURATIONS:
    shape_name = base_config["shape_name"]
    func = base_config["layout_function"]
    params_padrao = base_config["base_params"].copy()

    # --- Gerar parâmetros para "espacada" ---
    params_espacada = params_padrao.copy()
    variant_espacada_mods = LAYOUT_VARIANTS["espacada"]
    mult = variant_espacada_mods.get("spacing_factor_mult", 1.5)
    step_mult = variant_espacada_mods.get("radius_step_factor_mult", 1.5)
    # Aplicar multiplicações
    if "spacing_x_factor" in params_espacada: params_espacada["spacing_x_factor"] *= mult
    if "spacing_y_factor" in params_espacada: params_espacada["spacing_y_factor"] *= mult
    if "side_length_factor" in params_espacada: params_espacada["side_length_factor"] *= mult
    if "spacing_factor" in params_espacada: params_espacada["spacing_factor"] *= mult
    if "radius_step_factor" in params_espacada and params_espacada.get("arm_spacing_mode",'linear') == 'linear' : params_espacada["radius_step_factor"] *= step_mult # Apenas se linear
    if "scale_factor" in params_espacada: params_espacada["scale_factor"] *= mult

    # --- Gerar configurações para todas as variantes ---
    for variant_name, variant_mods in LAYOUT_VARIANTS.items():
        layout_name = f"{shape_name}_{variant_name}"
        current_params = {} # Começa vazio

        if variant_name == "padrao":
            current_params = params_padrao.copy()
            # Adiciona parâmetros de offset/colisão padrão (ou zero) se não definidos
            current_params.setdefault("random_offset_stddev_m", 0.0)
            current_params.setdefault("min_separation_factor", 1.05)
            current_params.setdefault("max_placement_attempts", DEFAULT_MAX_PLACEMENT_ATTEMPTS)

        elif variant_name == "espacada":
            current_params = params_espacada.copy()
            # Adiciona parâmetros de offset/colisão padrão (ou zero) se não definidos
            current_params.setdefault("random_offset_stddev_m", 0.0)
            current_params.setdefault("min_separation_factor", 1.05)
            current_params.setdefault("max_placement_attempts", DEFAULT_MAX_PLACEMENT_ATTEMPTS)

        elif variant_name == "aleatoria":
            # *** COMEÇA COM OS PARÂMETROS DE "ESPACADA" ***
            current_params = params_espacada.copy()
            # Aplica modificações específicas da variante "aleatoria"
            current_params["random_offset_stddev_m"] = variant_mods.get("random_offset_stddev_m", 0.05 * TILE_DIAGONAL_M)
            current_params["min_separation_factor"] = variant_mods.get("min_separation_factor", 1.01)
            current_params.setdefault("max_placement_attempts", DEFAULT_MAX_PLACEMENT_ATTEMPTS)

        elif variant_name == "exponencial":
            current_params = params_padrao.copy() # Começa com padrão
            # Aplica modificações de modo e fatores exponenciais
            if "spacing_mode" in current_params:
                 current_params["spacing_mode"] = variant_mods.get("spacing_mode", 'center_exponential')
                 current_params["center_exp_scale_factor"] = variant_mods.get("center_exp_scale_factor", 1.15)
            if "arm_spacing_mode" in current_params:
                 current_params["arm_spacing_mode"] = variant_mods.get("arm_spacing_mode", 'exponential')
                 current_params["radius_step_factor"] = variant_mods.get("radius_step_factor_exp", 1.15)
            if "ring_spacing_mode" in current_params:
                 current_params["ring_spacing_mode"] = variant_mods.get("ring_spacing_mode", 'exponential')
                 current_params["radius_step_factor"] = variant_mods.get("radius_step_factor_exp", 1.15)
            if "center_scale_mode" in current_params: # Para espiral, anel, etc.
                 current_params["center_scale_mode"] = variant_mods.get("spacing_mode", 'center_exponential') # Usa a chave 'spacing_mode' para definir isso
                 current_params["center_exp_scale_factor"] = variant_mods.get("center_exp_scale_factor", 1.15)

            # Comportamento especial para Manual Circular em modo exponencial (ex: mais espaçado)
            if shape_name == "circulo" and current_params.get("spacing_mode") == 'center_exponential':
                 # Poderia remover spacing_x/y_factor ou definir como 1.0, pois serão ignorados
                 # se a função create_manual_circular_layout foi adaptada corretamente.
                 # Vamos garantir que estejam como 1.0 para a base do scaling exp.
                 current_params["spacing_x_factor"] = 1.0
                 current_params["spacing_y_factor"] = 1.0
                 print(f"  Ajuste para {layout_name}: Usando spacing_mode='center_exponential', fatores X/Y ignorados para cálculo base.")

            # Adiciona parâmetros de offset/colisão padrão (ou zero) se não definidos
            current_params.setdefault("random_offset_stddev_m", 0.0)
            current_params.setdefault("min_separation_factor", 1.05)
            current_params.setdefault("max_placement_attempts", DEFAULT_MAX_PLACEMENT_ATTEMPTS)


        # Adiciona a configuração final à lista
        LAYOUT_CONFIGURATIONS_TO_RUN.append({
            "name": layout_name,
            "layout_function": func,
            "params": current_params
        })
        # Debug: Imprime os parâmetros finais para uma variante específica
        # if shape_name == "quadrado" and variant_name == "aleatoria":
        #    print(f"DEBUG Params for {layout_name}: {current_params}")

print(f"Total de {len(LAYOUT_CONFIGURATIONS_TO_RUN)} configurações de layout definidas.")


# ==================== Execução Principal ====================
if __name__ == "__main__":

    print("======================================================")
    print("   Gerador de Estrutura de Telescópio OSKAR (BINGO)   ")
    print("======================================================")
    print(f"Usando biblioteca de layouts: bingo_layouts.py")
    print(f"Dimensões de referência do Tile: {TILE_WIDTH:.2f}m x {TILE_HEIGHT:.2f}m")
    print(f"Arquivo CSV de entrada: {CSV_INPUT_FILE}")
    print(f"Diretório base de saída: {OUTPUT_BASE_DIR}")
    print(f"Número de layouts a processar: {len(LAYOUT_CONFIGURATIONS_TO_RUN)}")
    print("------------------------------------------------------")

    # Verifica se arquivos/diretórios existem
    if not os.path.isfile(CSV_INPUT_FILE):
        print(f"Erro Fatal: Arquivo CSV não encontrado em: {CSV_INPUT_FILE}")
        exit()
    # Diretório de saída será criado se não existir

    # Calcula o layout do TILE (64 antenas) uma única vez
    print("Calculando layout base do tile (64 antenas)...")
    the_base_tile_layout = create_tile_layout_64_antennas()
    if the_base_tile_layout.shape[0] != N_ANTENNAS_PER_TILE:
        print(f"Erro Fatal: Falha ao gerar layout base do tile ({the_base_tile_layout.shape[0]} antenas geradas). Abortando.")
        exit()
    print(f"Layout base do tile calculado ({the_base_tile_layout.shape[0]} antenas).")

    # Itera sobre cada configuração de layout definida
    for i, layout_conf in enumerate(LAYOUT_CONFIGURATIONS_TO_RUN):
        print(f"\n===== Processando Layout {i+1}/{len(LAYOUT_CONFIGURATIONS_TO_RUN)} =====")
        create_oskar_structure_grouped(
            csv_input_path=CSV_INPUT_FILE,
            output_base_path=OUTPUT_BASE_DIR,
            layout_config=layout_conf,
            base_tile_layout=the_base_tile_layout
        )
        print(f"===== Layout {layout_conf.get('name', 'desconhecido')} concluído =====")

    print("\n======================================================")
    print("Processamento de todos os layouts concluído.")
    print("======================================================")