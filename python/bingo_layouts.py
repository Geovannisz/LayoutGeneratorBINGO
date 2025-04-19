# bingo_layouts.py
"""
Biblioteca para gerar layouts de centros de tiles para estações BINGO.

Funções nesta biblioteca retornam listas de coordenadas [x, y] em METROS,
representando os centros dos tiles dentro de uma estação.

Convenções de Parâmetros:
- `tile_width_m`, `tile_height_m`: Dimensões FÍSICAS do tile em metros,
                                   usadas como referência de escala.
- `..._factor`: Parâmetro adimensional que escala com base nas dimensões
                do tile (largura, altura ou diagonal).
- `..._m`: Parâmetro esperado diretamente em metros.
- `..._rad`: Parâmetro de ângulo esperado em radianos.
- `spacing_mode`: Controla como o espaçamento progride.
    - 'linear': Passos/espaçamentos constantes ou conforme definido pela lógica base da função.
    - 'exponential': (Para Spiral/Ring) Cada passo/anel é multiplicado por um fator constante.
    - 'center_exponential': (Para Grid, Rhombus, Hex, etc.) A distância de cada ponto ao centro (0,0) é
                           escalada exponencialmente *após* o cálculo inicial da posição.
- `center_exp_scale_factor`: Fator (>0) para `center_exponential` (1 = sem escala).
- `random_offset_stddev_m`: Desvio padrão (metros) de um ruído gaussiano. Se > 0, ativa
                             a checagem de colisão durante a aplicação do ruído.
- `min_separation_factor`: (Usado com `random_offset_stddev_m` > 0) Fator da diagonal do tile
                          para definir a distância mínima entre centros *após* o offset.
- `max_placement_attempts`: (Usado com `random_offset_stddev_m` > 0) Tentativas para posicionar
                             um tile com offset aleatório sem colisão.
- `center_layout`: Se True (padrão), centraliza as coordenadas finais na origem.

Todas as funções retornam: CoordList (List[List[float]])
"""

import numpy as np
import math
import random
from typing import List, Tuple, Optional, Literal, Callable

# ==================== Constantes e Tipos ====================
CoordList = List[List[float]]
SpacingMode = Literal['linear', 'exponential', 'center_exponential']
AngleMode = Literal['degree', 'radian']

# Precisão para coordenadas de saída
COORD_PRECISION = 6
# Ângulo Dourado em radianos para Phyllotaxis
GOLDEN_ANGLE_RAD = math.pi * (3. - math.sqrt(5.))
# Número padrão de tentativas para posicionamento aleatório com checagem
DEFAULT_MAX_PLACEMENT_ATTEMPTS = 10000

# ==================== Funções Auxiliares ====================

def _center_coords(coords: CoordList) -> CoordList:
    """Centraliza um conjunto de coordenadas 2D em torno da origem (0,0)."""
    if not coords:
        return []
    coords_array = np.array(coords)
    if coords_array.ndim != 2 or coords_array.shape[1] != 2:
        if coords_array.ndim == 1 and coords_array.shape[0] == 2:
            return coords # Já é [[x, y]]
        else:
            # Não imprime aviso aqui, pode ser chamado com arrays vazios ou inválidos intermediários
            return coords

    center = coords_array.mean(axis=0)
    centered_coords = coords_array - center
    return [[round(c[0], COORD_PRECISION), round(c[1], COORD_PRECISION)] for c in centered_coords]

def _apply_center_exponential_scaling(
    coords: CoordList,
    exp_scale_factor: float
    ) -> CoordList:
    """
    Escala a distância de cada ponto ao centro exponencialmente.
    Distância_nova = Distância_original * (exp_scale_factor ** (Distância_original / Distância_ref))
    """
    if not coords or not (0 < exp_scale_factor != 1): # Verifica se fator é válido e diferente de 1
        return coords

    coords_array = np.array(coords)
    # Calcula distâncias da origem (0,0) para cada ponto
    distances = np.sqrt(np.sum(coords_array**2, axis=1))

    # Ignora ponto(s) na origem para calcular distância de referência
    non_zero_distances = distances[distances > 1e-9]
    if len(non_zero_distances) == 0:
        return coords # Todos os pontos na origem ou lista vazia

    # Usa a distância média não nula como referência para normalizar o expoente
    ref_distance = np.mean(non_zero_distances)
    if ref_distance < 1e-9: # Caso raro de apenas pontos na origem terem sido filtrados
         ref_distance = 1.0 # Evita divisão por zero no expoente

    scaled_coords = []
    for i, (x, y) in enumerate(coords):
        dist = distances[i]
        if dist < 1e-9: # Não escala o ponto central
             scale_factor_pow = 1.0
        else:
             # Expoente é proporcional à distância relativa à referência
             exponent = dist / ref_distance
             scale_factor_pow = exp_scale_factor ** exponent

        scaled_coords.append([x * scale_factor_pow, y * scale_factor_pow])

    return scaled_coords

def _get_angle_rad(angle: float, mode: AngleMode) -> float:
    """Converte ângulo para radianos se estiver em graus."""
    if mode == 'degree':
        return math.radians(angle)
    elif mode == 'radian':
        return angle
    else:
        raise ValueError(f"Modo de ângulo inválido: {mode}")

def _place_with_random_offset_and_collision_check(
    base_x: float,
    base_y: float,
    offset_stddev_m: float,
    placed_coords: CoordList,
    min_dist_sq: float, # Distância mínima ao quadrado
    max_attempts: int
    ) -> Optional[List[float]]:
    """
    Tenta encontrar uma posição com offset aleatório que não colida com as já existentes.

    Args:
        base_x, base_y: Posição alvo inicial.
        offset_stddev_m: Desvio padrão do ruído gaussiano.
        placed_coords: Lista de coordenadas já posicionadas com sucesso.
        min_dist_sq: Quadrado da distância mínima permitida entre centros.
        max_attempts: Número máximo de tentativas.

    Returns:
        List[float] (x, y) da posição válida encontrada, ou None se falhar.
    """
    if offset_stddev_m <= 0: # Se não há offset, retorna a posição base (colisão não é verificada aqui)
        return [base_x, base_y]

    for _ in range(max_attempts):
        offset_x = random.gauss(0, offset_stddev_m)
        offset_y = random.gauss(0, offset_stddev_m)
        cand_x = base_x + offset_x
        cand_y = base_y + offset_y

        # Verifica colisão com todos os pontos já colocados
        collision = False
        for placed_x, placed_y in placed_coords:
            dist_sq = (cand_x - placed_x)**2 + (cand_y - placed_y)**2
            if dist_sq < min_dist_sq:
                collision = True
                break # Colidiu, tenta outra posição aleatória

        if not collision:
            return [cand_x, cand_y] # Posição válida encontrada

    # Se chegou aqui, falhou em encontrar posição válida após max_attempts
    return None

# ==================== Funções Geradoras de Layout ====================

def create_grid_layout(
    num_cols: int,
    num_rows: int,
    tile_width_m: float,
    tile_height_m: float,
    spacing_mode: SpacingMode = 'linear',
    spacing_x_factor: float = 1.0,
    spacing_y_factor: float = 1.0,
    center_exp_scale_factor: float = 1.1,
    random_offset_stddev_m: float = 0.0,
    min_separation_factor: float = 1.05,
    max_placement_attempts: int = DEFAULT_MAX_PLACEMENT_ATTEMPTS,
    center_layout: bool = True
) -> CoordList:
    """
    Gera um layout de grade retangular com espaçamento linear ou exponencial
    a partir do centro e checagem de colisão para offsets aleatórios.

    Args:
        num_cols, num_rows: Dimensões da grade.
        tile_width_m, tile_height_m: Dimensões de referência em metros.
        spacing_mode: 'linear' ou 'center_exponential'.
        spacing_x_factor, spacing_y_factor: Fator base de espaçamento.
        center_exp_scale_factor: Fator (>0) para 'center_exponential'.
        random_offset_stddev_m: Ruído gaussiano (metros). Ativa checagem de colisão.
        min_separation_factor: Fator da diagonal para distância mínima se offset > 0.
        max_placement_attempts: Tentativas para posicionar com offset sem colisão.
        center_layout: Centraliza o layout final.

    Returns:
        CoordList: Lista de coordenadas [x, y] em METROS.
    """
    if num_cols <= 0 or num_rows <= 0 or tile_width_m <= 0 or tile_height_m <= 0:
        print("Aviso (create_grid_layout): Dimensões e tamanhos devem ser positivos.")
        return []
    if spacing_mode == 'center_exponential' and center_exp_scale_factor <= 0:
        print("Aviso (create_grid_layout): center_exp_scale_factor deve ser > 0. Usando 1.0.")
        center_exp_scale_factor = 1.0

    tile_diagonal_m = math.sqrt(tile_width_m**2 + tile_height_m**2)
    min_dist_sq = (min_separation_factor * tile_diagonal_m)**2 if random_offset_stddev_m > 0 else 0

    spacing_x = tile_width_m * spacing_x_factor
    spacing_y = tile_height_m * spacing_y_factor

    base_coords = []
    col_indices = np.arange(num_cols) - (num_cols - 1) / 2.0
    row_indices = np.arange(num_rows) - (num_rows - 1) / 2.0
    for i in col_indices:
        for j in row_indices:
            x_base = i * spacing_x
            y_base = j * spacing_y
            base_coords.append([x_base, y_base])

    # Aplica scaling exponencial ANTES do offset aleatório
    scaled_coords = base_coords
    if spacing_mode == 'center_exponential':
        scaled_coords = _apply_center_exponential_scaling(base_coords, center_exp_scale_factor)
    elif spacing_mode != 'linear':
        print(f"Aviso (create_grid_layout): spacing_mode '{spacing_mode}' inválido. Usando 'linear'.")

    # Posiciona com offset e checagem de colisão (se aplicável)
    final_coords = []
    placed_count = 0
    skipped_count = 0
    if random_offset_stddev_m > 0:
        print(f"  Aplicando offset aleatório (stddev={random_offset_stddev_m:.3f}m) com checagem de colisão...")
        for x_base, y_base in scaled_coords:
            placed_coord = _place_with_random_offset_and_collision_check(
                x_base, y_base, random_offset_stddev_m, final_coords, min_dist_sq, max_placement_attempts
            )
            if placed_coord is not None:
                final_coords.append(placed_coord)
                placed_count += 1
            else:
                # Aviso se não conseguiu posicionar após tentativas
                print(f"  Aviso: Não foi possível posicionar tile perto de ({x_base:.2f}, {y_base:.2f}) após {max_placement_attempts} tentativas.")
                skipped_count += 1
        if skipped_count > 0:
             print(f"  {skipped_count}/{len(scaled_coords)} tiles foram pulados devido a colisões persistentes.")
    else:
        final_coords = scaled_coords # Sem offset, usa as coordenadas escaladas/base
        placed_count = len(final_coords)

    # Arredonda antes de centralizar
    rounded_coords = [[round(c[0], COORD_PRECISION), round(c[1], COORD_PRECISION)] for c in final_coords]

    # Centraliza o resultado final
    centered_coords = rounded_coords
    if center_layout:
        centered_coords = _center_coords(rounded_coords)

    print(f"Layout Grid ({num_cols}x{num_rows}, modo={spacing_mode}): Gerou {placed_count} centros.")
    return centered_coords


def create_spiral_layout(
    num_arms: int,
    tiles_per_arm: int,
    tile_width_m: float,
    tile_height_m: float,
    arm_spacing_mode: Literal['linear', 'exponential'] = 'linear',
    center_scale_mode: Literal['none', 'center_exponential'] = 'none', # Scaling adicional opcional
    radius_start_factor: float = 0.5,
    radius_step_factor: float = 0.2,
    center_exp_scale_factor: float = 1.1, # Usado se center_scale_mode='center_exponential'
    angle_step_rad: float = math.pi / 6,
    arm_offset_rad: float = 0.0,
    rotation_per_arm_rad: float = 0.0,
    random_offset_stddev_m: float = 0.0,
    min_separation_factor: float = 1.05,
    max_placement_attempts: int = DEFAULT_MAX_PLACEMENT_ATTEMPTS,
    center_layout: bool = True,
    include_center_tile: bool = False
) -> CoordList:
    """
    Gera layout em espiral com espaçamento linear/exponencial no braço,
    opção de scaling exponencial central e checagem de colisão para offsets.

    Args:
        num_arms, tiles_per_arm: Configuração.
        tile_width_m, tile_height_m: Dimensões de referência (metros).
        arm_spacing_mode: 'linear' ou 'exponential' para crescimento *no braço*.
        center_scale_mode: 'none' ou 'center_exponential' para escalar distâncias *gerais* do centro.
        radius_start_factor: Raio inicial (fator da diagonal).
        radius_step_factor: Incremento ('linear') ou Fator (>0, 'exponential') *no braço*.
        center_exp_scale_factor: Fator (>0) para 'center_exponential'.
        angle_step_rad: Incremento angular no braço (radianos).
        arm_offset_rad, rotation_per_arm_rad: Rotações (radianos).
        random_offset_stddev_m: Ruído gaussiano (metros). Ativa checagem de colisão.
        min_separation_factor: Fator da diagonal para distância mínima se offset > 0.
        max_placement_attempts: Tentativas para posicionar com offset sem colisão.
        center_layout: Centraliza o layout final.
        include_center_tile: Adiciona tile na origem.

    Returns:
        CoordList: Lista de coordenadas [x, y] em METROS.
    """
    # Validações
    if num_arms <= 0 or tiles_per_arm <= 0 or tile_width_m <= 0 or tile_height_m <= 0:
        print("Aviso (create_spiral_layout): Dimensões e contagens devem ser positivas.")
        return []
    if arm_spacing_mode == 'exponential' and radius_step_factor <= 0:
        print("Aviso (create_spiral_layout): radius_step_factor deve ser > 0 para modo 'exponential'. Usando 1.1.")
        radius_step_factor = 1.1
    if center_scale_mode == 'center_exponential' and center_exp_scale_factor <= 0:
         print("Aviso (create_spiral_layout): center_exp_scale_factor deve ser > 0. Usando 1.0.")
         center_exp_scale_factor = 1.0

    tile_diagonal_m = math.sqrt(tile_width_m**2 + tile_height_m**2)
    min_dist_sq = (min_separation_factor * tile_diagonal_m)**2 if random_offset_stddev_m > 0 else 0
    base_radius = radius_start_factor * tile_diagonal_m
    linear_radius_increment = radius_step_factor * tile_diagonal_m if arm_spacing_mode == 'linear' else 0

    # Gera coordenadas base da espiral
    base_coords = []
    seen_coords_tuples = set()
    if include_center_tile:
        center_coord_tuple = (round(0.0, COORD_PRECISION), round(0.0, COORD_PRECISION))
        base_coords.append([0.0, 0.0])
        seen_coords_tuples.add(center_coord_tuple)

    for p in range(num_arms):
        current_arm_angle = p * (2 * math.pi / num_arms) + p * rotation_per_arm_rad + arm_offset_rad
        current_radius = base_radius
        for i in range(tiles_per_arm):
            current_angle = current_arm_angle + i * angle_step_rad
            x_base = current_radius * math.cos(current_angle)
            y_base = current_radius * math.sin(current_angle)
            coord_tuple = (round(x_base, COORD_PRECISION), round(y_base, COORD_PRECISION))
            if coord_tuple not in seen_coords_tuples:
                base_coords.append([x_base, y_base])
                seen_coords_tuples.add(coord_tuple)

            if arm_spacing_mode == 'linear':
                current_radius += linear_radius_increment
            elif arm_spacing_mode == 'exponential':
                current_radius *= radius_step_factor

    # Aplica scaling exponencial central (opcional) ANTES do offset
    scaled_coords = base_coords
    if center_scale_mode == 'center_exponential':
        coords_to_scale = base_coords[1:] if include_center_tile and base_coords else base_coords
        scaled_part = _apply_center_exponential_scaling(coords_to_scale, center_exp_scale_factor)
        scaled_coords = ([base_coords[0]] + scaled_part) if include_center_tile and base_coords else scaled_part
    elif center_scale_mode != 'none':
         print(f"Aviso (create_spiral_layout): center_scale_mode '{center_scale_mode}' inválido. Usando 'none'.")


    # Posiciona com offset e checagem de colisão
    final_coords = []
    placed_count = 0
    skipped_count = 0
    # Adiciona o ponto central primeiro se existir e se houver offset
    if include_center_tile and scaled_coords and random_offset_stddev_m > 0:
        # Tenta posicionar o ponto central com offset (raramente útil, mas possível)
        placed_center = _place_with_random_offset_and_collision_check(
            scaled_coords[0][0], scaled_coords[0][1], random_offset_stddev_m,
            [], min_dist_sq, max_placement_attempts # Checa contra lista vazia
        )
        if placed_center is not None:
             final_coords.append(placed_center)
             placed_count = 1
        else: # Se falhar, adiciona sem offset? Ou pula? Vamos adicionar sem offset.
             final_coords.append(scaled_coords[0])
             placed_count = 1
             print("Aviso: Não foi possível aplicar offset aleatório ao tile central (conflito inicial?). Posicionado em (0,0).")

    elif include_center_tile and scaled_coords: # Sem offset
         final_coords.append(scaled_coords[0])
         placed_count = 1

    # Itera sobre os pontos restantes
    coords_to_process = scaled_coords[1:] if include_center_tile and scaled_coords else scaled_coords
    if random_offset_stddev_m > 0:
        print(f"  Aplicando offset aleatório (stddev={random_offset_stddev_m:.3f}m) com checagem de colisão...")
        for x_base, y_base in coords_to_process:
            placed_coord = _place_with_random_offset_and_collision_check(
                x_base, y_base, random_offset_stddev_m, final_coords, min_dist_sq, max_placement_attempts
            )
            if placed_coord is not None:
                final_coords.append(placed_coord)
                placed_count += 1
            else:
                print(f"  Aviso: Não foi possível posicionar tile perto de ({x_base:.2f}, {y_base:.2f}) após {max_placement_attempts} tentativas.")
                skipped_count += 1
        if skipped_count > 0:
            print(f"  {skipped_count}/{len(coords_to_process)} tiles foram pulados devido a colisões persistentes.")
    else:
        final_coords.extend(coords_to_process) # Adiciona o resto sem offset
        placed_count = len(final_coords)


    # Arredonda e centraliza
    rounded_coords = [[round(c[0], COORD_PRECISION), round(c[1], COORD_PRECISION)] for c in final_coords]
    centered_coords = rounded_coords
    if center_layout:
        centered_coords = _center_coords(rounded_coords)

    print(f"Layout Espiral ({num_arms} braços, {tiles_per_arm} tiles/braço, arm={arm_spacing_mode}, center={center_scale_mode}): Gerou {placed_count} centros.")
    return centered_coords


def create_ring_layout(
    num_rings: int,
    tiles_per_ring: List[int],
    tile_width_m: float,
    tile_height_m: float,
    ring_spacing_mode: Literal['linear', 'exponential'] = 'linear',
    center_scale_mode: Literal['none', 'center_exponential'] = 'none',
    radius_start_factor: float = 1.5,
    radius_step_factor: float = 1.0,
    center_exp_scale_factor: float = 1.1,
    add_center_tile: bool = True,
    random_offset_stddev_m: float = 0.0,
    min_separation_factor: float = 1.05,
    max_placement_attempts: int = DEFAULT_MAX_PLACEMENT_ATTEMPTS,
    center_layout: bool = True
) -> CoordList:
    """
    Gera layout de anéis concêntricos com espaçamento linear/exponencial entre anéis,
    opção de scaling exponencial central e checagem de colisão para offsets.

    Args:
        num_rings: Número de anéis.
        tiles_per_ring: Lista com número de tiles por anel (interno -> externo).
        tile_width_m, tile_height_m: Dimensões de referência (metros).
        ring_spacing_mode: 'linear' ou 'exponential' para espaçamento *entre anéis*.
        center_scale_mode: 'none' ou 'center_exponential' para escalar distâncias *gerais*.
        radius_start_factor: Raio do 1º anel (fator da diagonal).
        radius_step_factor: Incremento ('linear') ou Fator (>0, 'exponential') *entre anéis*.
        center_exp_scale_factor: Fator (>0) para 'center_exponential'.
        add_center_tile: Adiciona tile na origem.
        random_offset_stddev_m: Ruído gaussiano (metros). Ativa checagem de colisão.
        min_separation_factor: Fator da diagonal para distância mínima se offset > 0.
        max_placement_attempts: Tentativas para posicionar com offset sem colisão.
        center_layout: Centraliza o layout final.

    Returns:
        CoordList: Lista de coordenadas [x, y] em METROS.
    """
    # Validações
    if num_rings < 0 or tile_width_m <= 0 or tile_height_m <= 0:
        print("Aviso (create_ring_layout): num_rings >= 0 e dimensões > 0.")
        return []
    if num_rings > 0:
        if len(tiles_per_ring) != num_rings:
            print(f"Erro (create_ring_layout): 'tiles_per_ring' (len={len(tiles_per_ring)}) != 'num_rings' ({num_rings}).")
            return []
        if any(n <= 0 for n in tiles_per_ring):
            print("Aviso (create_ring_layout): Número de tiles por anel deve ser positivo.")
            return []
    if ring_spacing_mode == 'exponential' and radius_step_factor <= 0:
        print("Aviso (create_ring_layout): radius_step_factor > 0 para modo 'exponential'. Usando 1.5.")
        radius_step_factor = 1.5
    if center_scale_mode == 'center_exponential' and center_exp_scale_factor <= 0:
         print("Aviso (create_ring_layout): center_exp_scale_factor > 0. Usando 1.0.")
         center_exp_scale_factor = 1.0

    tile_diagonal_m = math.sqrt(tile_width_m**2 + tile_height_m**2)
    min_dist_sq = (min_separation_factor * tile_diagonal_m)**2 if random_offset_stddev_m > 0 else 0
    current_radius = radius_start_factor * tile_diagonal_m
    linear_radius_increment = radius_step_factor * tile_diagonal_m if ring_spacing_mode == 'linear' else 0

    # Gera coordenadas base dos anéis
    base_coords = []
    if add_center_tile:
        base_coords.append([0.0, 0.0])

    for r in range(num_rings):
        num_tiles_in_this_ring = tiles_per_ring[r]
        if num_tiles_in_this_ring <= 0: continue
        for i in range(num_tiles_in_this_ring):
            angle = i * 2 * math.pi / num_tiles_in_this_ring
            x_base = current_radius * math.cos(angle)
            y_base = current_radius * math.sin(angle)
            base_coords.append([x_base, y_base])

        if ring_spacing_mode == 'linear':
            current_radius += linear_radius_increment
        elif ring_spacing_mode == 'exponential':
            current_radius *= radius_step_factor

    # Aplica scaling exponencial central (opcional) ANTES do offset
    scaled_coords = base_coords
    if center_scale_mode == 'center_exponential':
        coords_to_scale = base_coords[1:] if add_center_tile and base_coords else base_coords
        scaled_part = _apply_center_exponential_scaling(coords_to_scale, center_exp_scale_factor)
        scaled_coords = ([base_coords[0]] + scaled_part) if add_center_tile and base_coords else scaled_part
    elif center_scale_mode != 'none':
         print(f"Aviso (create_ring_layout): center_scale_mode '{center_scale_mode}' inválido. Usando 'none'.")

    # Posiciona com offset e checagem de colisão
    final_coords = []
    placed_count = 0
    skipped_count = 0
    # Adiciona o ponto central primeiro se existir e houver offset
    if add_center_tile and scaled_coords and random_offset_stddev_m > 0:
        placed_center = _place_with_random_offset_and_collision_check(
            scaled_coords[0][0], scaled_coords[0][1], random_offset_stddev_m, [], min_dist_sq, max_placement_attempts)
        if placed_center is not None: final_coords.append(placed_center)
        else: final_coords.append(scaled_coords[0]); print("Aviso: Offset aleatório falhou para tile central.")
        placed_count = 1 if final_coords else 0
    elif add_center_tile and scaled_coords:
        final_coords.append(scaled_coords[0])
        placed_count = 1

    coords_to_process = scaled_coords[1:] if add_center_tile and scaled_coords else scaled_coords
    if random_offset_stddev_m > 0:
        print(f"  Aplicando offset aleatório (stddev={random_offset_stddev_m:.3f}m) com checagem de colisão...")
        for x_base, y_base in coords_to_process:
            placed_coord = _place_with_random_offset_and_collision_check(
                x_base, y_base, random_offset_stddev_m, final_coords, min_dist_sq, max_placement_attempts)
            if placed_coord is not None:
                final_coords.append(placed_coord)
                placed_count += 1
            else:
                 print(f"  Aviso: Falha ao posicionar tile perto de ({x_base:.2f}, {y_base:.2f}) após {max_placement_attempts} tentativas.")
                 skipped_count += 1
        if skipped_count > 0: print(f"  {skipped_count}/{len(coords_to_process)} tiles pulados.")
    else:
        final_coords.extend(coords_to_process)
        placed_count = len(final_coords)

    # Arredonda e centraliza
    rounded_coords = [[round(c[0], COORD_PRECISION), round(c[1], COORD_PRECISION)] for c in final_coords]
    centered_coords = rounded_coords
    if center_layout:
        centered_coords = _center_coords(rounded_coords)

    total_tiles_expected = sum(tiles_per_ring) + (1 if add_center_tile else 0)
    print(f"Layout Anéis ({num_rings} anéis, ring={ring_spacing_mode}, center={center_scale_mode}): Gerou {placed_count} centros (esperado {total_tiles_expected}).")
    return centered_coords


def create_rhombus_layout(
    num_rows_half: int,
    tile_width_m: float,
    tile_height_m: float,
    spacing_mode: SpacingMode = 'linear',
    side_length_factor: float = 0.65,
    h_compress_factor: float = 1.0,
    v_compress_factor: float = 1.0,
    center_exp_scale_factor: float = 1.1,
    random_offset_stddev_m: float = 0.0,
    min_separation_factor: float = 1.05,
    max_placement_attempts: int = DEFAULT_MAX_PLACEMENT_ATTEMPTS,
    center_layout: bool = True
) -> CoordList:
    """
    Gera layout losangular com espaçamento linear/exponencial central
    e checagem de colisão para offsets.

    Args:
        num_rows_half: Linhas na metade superior (ex: 6 para 36 tiles).
        tile_width_m, tile_height_m: Dimensões de referência (metros).
        spacing_mode: 'linear' ou 'center_exponential'.
        side_length_factor: Fator base do lado da célula (fator da diagonal).
        h_compress_factor, v_compress_factor: Compressão/expansão.
        center_exp_scale_factor: Fator (>0) para 'center_exponential'.
        random_offset_stddev_m: Ruído gaussiano (metros). Ativa checagem de colisão.
        min_separation_factor: Fator da diagonal para distância mínima se offset > 0.
        max_placement_attempts: Tentativas para posicionar com offset sem colisão.
        center_layout: Centraliza o layout final.

    Returns:
        CoordList: Lista de coordenadas [x, y] em METROS.
    """
    # Validações
    if num_rows_half <= 0 or tile_width_m <= 0 or tile_height_m <= 0:
         print("Aviso (create_rhombus_layout): Dimensões e contagens devem ser positivas.")
         return []
    if spacing_mode == 'center_exponential' and center_exp_scale_factor <= 0:
        print("Aviso (create_rhombus_layout): center_exp_scale_factor > 0. Usando 1.0.")
        center_exp_scale_factor = 1.0

    tile_diagonal_m = math.sqrt(tile_width_m**2 + tile_height_m**2)
    min_dist_sq = (min_separation_factor * tile_diagonal_m)**2 if random_offset_stddev_m > 0 else 0
    side_length = side_length_factor * tile_diagonal_m

    # Gera coordenadas base
    base_coords = []
    seen_coords_tuples = set()
    for i in range(num_rows_half):
        y_base = i * side_length * math.sqrt(3) / 2.0 * v_compress_factor
        num_tiles_in_row = num_rows_half - i
        start_x_base = - (num_tiles_in_row - 1) * side_length * h_compress_factor / 2.0
        for j in range(num_tiles_in_row):
            x_base = start_x_base + j * side_length * h_compress_factor
            coord_upper_tuple = (round(x_base, COORD_PRECISION), round(y_base, COORD_PRECISION))
            if coord_upper_tuple not in seen_coords_tuples:
                base_coords.append(list(coord_upper_tuple))
                seen_coords_tuples.add(coord_upper_tuple)
            if i != 0:
                coord_lower_tuple = (round(x_base, COORD_PRECISION), round(-y_base, COORD_PRECISION))
                if coord_lower_tuple not in seen_coords_tuples:
                    base_coords.append(list(coord_lower_tuple))
                    seen_coords_tuples.add(coord_lower_tuple)

    # Aplica scaling exponencial ANTES do offset
    scaled_coords = base_coords
    if spacing_mode == 'center_exponential':
        scaled_coords = _apply_center_exponential_scaling(base_coords, center_exp_scale_factor)
    elif spacing_mode != 'linear':
        print(f"Aviso (create_rhombus_layout): spacing_mode '{spacing_mode}' inválido. Usando 'linear'.")

    # Posiciona com offset e checagem
    final_coords = []
    placed_count = 0
    skipped_count = 0
    if random_offset_stddev_m > 0:
        print(f"  Aplicando offset aleatório (stddev={random_offset_stddev_m:.3f}m) com checagem de colisão...")
        for x_base, y_base in scaled_coords:
            placed_coord = _place_with_random_offset_and_collision_check(
                x_base, y_base, random_offset_stddev_m, final_coords, min_dist_sq, max_placement_attempts)
            if placed_coord is not None:
                final_coords.append(placed_coord)
                placed_count += 1
            else:
                print(f"  Aviso: Falha ao posicionar tile perto de ({x_base:.2f}, {y_base:.2f}) após {max_placement_attempts} tentativas.")
                skipped_count += 1
        if skipped_count > 0: print(f"  {skipped_count}/{len(scaled_coords)} tiles pulados.")
    else:
        final_coords = scaled_coords
        placed_count = len(final_coords)

    # Arredonda e centraliza
    rounded_coords = [[round(c[0], COORD_PRECISION), round(c[1], COORD_PRECISION)] for c in final_coords]
    centered_coords = rounded_coords
    if center_layout:
        centered_coords = _center_coords(rounded_coords)

    print(f"Layout Losangular (num_rows_half={num_rows_half}, modo={spacing_mode}): Gerou {placed_count} centros.")
    return centered_coords


def create_hex_grid_layout(
    num_rings_hex: int,
    tile_width_m: float,
    tile_height_m: float,
    spacing_mode: SpacingMode = 'linear',
    spacing_factor: float = 1.5,
    center_exp_scale_factor: float = 1.1,
    add_center_tile: bool = True,
    random_offset_stddev_m: float = 0.0,
    min_separation_factor: float = 1.05,
    max_placement_attempts: int = DEFAULT_MAX_PLACEMENT_ATTEMPTS,
    center_layout: bool = True
) -> CoordList:
    """
    Gera grade hexagonal com espaçamento linear/exponencial central
    e checagem de colisão para offsets.

    Args:
        num_rings_hex: Anéis hexagonais em torno do centro (0 = só centro).
        tile_width_m, tile_height_m: Dimensões de referência (metros).
        spacing_mode: 'linear' ou 'center_exponential'.
        spacing_factor: Fator base de espaçamento (fator da diagonal).
        center_exp_scale_factor: Fator (>0) para 'center_exponential'.
        add_center_tile: Inclui o tile central.
        random_offset_stddev_m: Ruído gaussiano (metros). Ativa checagem de colisão.
        min_separation_factor: Fator da diagonal para distância mínima se offset > 0.
        max_placement_attempts: Tentativas para posicionar com offset sem colisão.
        center_layout: Centraliza o layout final.

    Returns:
        CoordList: Lista de coordenadas [x, y] em METROS.
    """
    # Validações
    if num_rings_hex < 0 or tile_width_m <= 0 or tile_height_m <= 0:
        print("Aviso (create_hex_grid_layout): num_rings_hex >= 0 e dimensões > 0.")
        return []
    if spacing_mode == 'center_exponential' and center_exp_scale_factor <= 0:
         print("Aviso (create_hex_grid_layout): center_exp_scale_factor > 0. Usando 1.0.")
         center_exp_scale_factor = 1.0

    tile_diagonal_m = math.sqrt(tile_width_m**2 + tile_height_m**2)
    min_dist_sq = (min_separation_factor * tile_diagonal_m)**2 if random_offset_stddev_m > 0 else 0
    base_spacing = spacing_factor * tile_diagonal_m

    # Gera coordenadas base
    base_coords = []
    seen_coords_tuples = set()
    if add_center_tile:
        center_coord = (0.0, 0.0)
        base_coords.append(list(center_coord))
        seen_coords_tuples.add(center_coord)

    for ring in range(1, num_rings_hex + 1):
        x_base = ring * base_spacing; y_base = 0.0
        coord_tuple = (round(x_base, COORD_PRECISION), round(y_base, COORD_PRECISION))
        if coord_tuple not in seen_coords_tuples:
             base_coords.append(list(coord_tuple)); seen_coords_tuples.add(coord_tuple)
        for side in range(6):
            angle = math.pi / 3.0
            for _ in range(ring):
                 dx = base_spacing * math.cos((side + 2) * angle); dy = base_spacing * math.sin((side + 2) * angle)
                 x_base += dx; y_base += dy
                 coord_tuple = (round(x_base, COORD_PRECISION), round(y_base, COORD_PRECISION))
                 if coord_tuple not in seen_coords_tuples:
                    base_coords.append(list(coord_tuple)); seen_coords_tuples.add(coord_tuple)

    # Aplica scaling exponencial ANTES do offset
    scaled_coords = base_coords
    if spacing_mode == 'center_exponential':
        coords_to_scale = base_coords[1:] if add_center_tile and base_coords else base_coords
        scaled_part = _apply_center_exponential_scaling(coords_to_scale, center_exp_scale_factor)
        scaled_coords = ([base_coords[0]] + scaled_part) if add_center_tile and base_coords else scaled_part
    elif spacing_mode != 'linear':
        print(f"Aviso (create_hex_grid_layout): spacing_mode '{spacing_mode}' inválido. Usando 'linear'.")

    # Posiciona com offset e checagem
    final_coords = []
    placed_count = 0
    skipped_count = 0
    # Adiciona o ponto central primeiro se existir e houver offset
    if add_center_tile and scaled_coords and random_offset_stddev_m > 0:
        placed_center = _place_with_random_offset_and_collision_check(
            scaled_coords[0][0], scaled_coords[0][1], random_offset_stddev_m, [], min_dist_sq, max_placement_attempts)
        if placed_center is not None: final_coords.append(placed_center)
        else: final_coords.append(scaled_coords[0]); print("Aviso: Offset aleatório falhou para tile central.")
        placed_count = 1 if final_coords else 0
    elif add_center_tile and scaled_coords:
        final_coords.append(scaled_coords[0])
        placed_count = 1

    coords_to_process = scaled_coords[1:] if add_center_tile and scaled_coords else scaled_coords
    if random_offset_stddev_m > 0:
        print(f"  Aplicando offset aleatório (stddev={random_offset_stddev_m:.3f}m) com checagem de colisão...")
        for x_base, y_base in coords_to_process:
            placed_coord = _place_with_random_offset_and_collision_check(
                x_base, y_base, random_offset_stddev_m, final_coords, min_dist_sq, max_placement_attempts)
            if placed_coord is not None:
                final_coords.append(placed_coord); placed_count += 1
            else:
                 print(f"  Aviso: Falha ao posicionar tile perto de ({x_base:.2f}, {y_base:.2f}) após {max_placement_attempts} tentativas.")
                 skipped_count += 1
        if skipped_count > 0: print(f"  {skipped_count}/{len(coords_to_process)} tiles pulados.")
    else:
        final_coords.extend(coords_to_process)
        placed_count = len(final_coords)

    # Arredonda e centraliza
    rounded_coords = [[round(c[0], COORD_PRECISION), round(c[1], COORD_PRECISION)] for c in final_coords]
    centered_coords = rounded_coords
    if center_layout:
        centered_coords = _center_coords(rounded_coords)

    expected_tiles = (1 + sum(6 * r for r in range(1, num_rings_hex + 1))) if add_center_tile else sum(6*r for r in range(1, num_rings_hex + 1))
    print(f"Layout Grade Hexagonal (num_rings_hex={num_rings_hex}, modo={spacing_mode}): Gerou {placed_count} centros (esperado ~{expected_tiles}).")
    return centered_coords


def create_phyllotaxis_layout(
    num_tiles: int,
    tile_width_m: float,
    tile_height_m: float,
    spacing_mode: Literal['linear', 'center_exponential'] = 'linear', # linear é o natural aqui
    scale_factor: float = 0.5,
    center_offset_factor: float = 0.1,
    center_exp_scale_factor: float = 1.1,
    random_offset_stddev_m: float = 0.0,
    min_separation_factor: float = 1.05, # Pode precisar de ajuste para phyllotaxis
    max_placement_attempts: int = DEFAULT_MAX_PLACEMENT_ATTEMPTS,
    center_layout: bool = True
) -> CoordList:
    """
    Gera layout Phyllotaxis (Girassol) com opção de scaling exponencial central
    e checagem de colisão para offsets.

    Args:
        num_tiles: Número total de tiles.
        tile_width_m, tile_height_m: Dimensões de referência (metros).
        spacing_mode: 'linear' (natural) ou 'center_exponential' (pode distorcer).
        scale_factor: Fator de escala geral (multiplica sqrt(indice) e diagonal).
        center_offset_factor: Afastamento inicial do centro (fator da diagonal).
        center_exp_scale_factor: Fator (>0) para 'center_exponential'.
        random_offset_stddev_m: Ruído gaussiano (metros). Ativa checagem de colisão.
        min_separation_factor: Fator da diagonal para distância mínima se offset > 0.
        max_placement_attempts: Tentativas para posicionar com offset sem colisão.
        center_layout: Centraliza o layout final.

    Returns:
        CoordList: Lista de coordenadas [x, y] em METROS.
    """
    # Validações
    if num_tiles <= 0 or tile_width_m <= 0 or tile_height_m <= 0:
         print("Aviso (create_phyllotaxis_layout): Contagem e dimensões devem ser positivas.")
         return []
    if spacing_mode == 'center_exponential' and center_exp_scale_factor <= 0:
        print("Aviso (create_phyllotaxis_layout): center_exp_scale_factor > 0. Usando 1.0.")
        center_exp_scale_factor = 1.0

    tile_diagonal_m = math.sqrt(tile_width_m**2 + tile_height_m**2)
    min_dist_sq = (min_separation_factor * tile_diagonal_m)**2 if random_offset_stddev_m > 0 else 0
    scale = scale_factor * tile_diagonal_m
    center_offset = center_offset_factor * tile_diagonal_m

    # Gera coordenadas base
    base_coords = []
    for i in range(num_tiles):
        r = scale * math.sqrt(i + center_offset)
        theta = i * GOLDEN_ANGLE_RAD
        x_base = r * math.cos(theta)
        y_base = r * math.sin(theta)
        base_coords.append([x_base, y_base])

    # Aplica scaling exponencial ANTES do offset
    scaled_coords = base_coords
    if spacing_mode == 'center_exponential':
        scaled_coords = _apply_center_exponential_scaling(base_coords, center_exp_scale_factor)
    elif spacing_mode != 'linear':
         print(f"Aviso (create_phyllotaxis_layout): spacing_mode '{spacing_mode}' inválido. Usando 'linear'.")

    # Posiciona com offset e checagem
    final_coords = []
    placed_count = 0
    skipped_count = 0
    if random_offset_stddev_m > 0:
        print(f"  Aplicando offset aleatório (stddev={random_offset_stddev_m:.3f}m) com checagem de colisão...")
        for x_base, y_base in scaled_coords:
            placed_coord = _place_with_random_offset_and_collision_check(
                x_base, y_base, random_offset_stddev_m, final_coords, min_dist_sq, max_placement_attempts)
            if placed_coord is not None:
                final_coords.append(placed_coord); placed_count += 1
            else:
                 print(f"  Aviso: Falha ao posicionar tile perto de ({x_base:.2f}, {y_base:.2f}) após {max_placement_attempts} tentativas.")
                 skipped_count += 1
        if skipped_count > 0: print(f"  {skipped_count}/{len(scaled_coords)} tiles pulados.")
    else:
        final_coords = scaled_coords
        placed_count = len(final_coords)

    # Arredonda e centraliza
    rounded_coords = [[round(c[0], COORD_PRECISION), round(c[1], COORD_PRECISION)] for c in final_coords]
    centered_coords = rounded_coords
    if center_layout:
        centered_coords = _center_coords(rounded_coords)

    print(f"Layout Phyllotaxis (modo={spacing_mode}): Gerou {placed_count} centros.")
    return centered_coords

# --- Outras funções (Interlocking, SegmentedArc, RadialDensity, ManualCircular) ---
# Adicionar parâmetros `spacing_mode`, `center_exp_scale_factor`, `min_separation_factor`,
# `max_placement_attempts` e a lógica de checagem de colisão de forma similar
# às funções acima (Grid, Rhombus, HexGrid, Phyllotaxis).

# Exemplo para create_interlocking_rings_layout:
def create_interlocking_rings_layout(
    num_main_rings: int,
    tiles_per_ring: int,
    tile_width_m: float,
    tile_height_m: float,
    center_scale_mode: Literal['none', 'center_exponential'] = 'none', # Scaling adicional opcional
    ring_radius_factor: float = 1.0,
    main_ring_offset_factor: float = 1.5,
    center_exp_scale_factor: float = 1.1,
    add_center_tile: bool = False,
    random_offset_stddev_m: float = 0.0,
    min_separation_factor: float = 1.05,
    max_placement_attempts: int = DEFAULT_MAX_PLACEMENT_ATTEMPTS,
    center_layout: bool = True
) -> CoordList:
    """
    Gera layout de anéis interligados com scaling central opcional e checagem de colisão.

    Args:
        num_main_rings: Quantos anéis individuais.
        tiles_per_ring: Tiles por anel individual.
        tile_width_m, tile_height_m: Dimensões de referência (metros).
        center_scale_mode: 'none' ou 'center_exponential' para escalar distâncias *gerais*.
        ring_radius_factor: Raio de cada anel individual (fator da diagonal).
        main_ring_offset_factor: Distância do centro aos centros dos anéis (fator da diagonal).
        center_exp_scale_factor: Fator (>0) para 'center_exponential'.
        add_center_tile: Adiciona tile na origem global.
        random_offset_stddev_m: Ruído gaussiano (metros). Ativa checagem de colisão.
        min_separation_factor: Fator da diagonal para distância mínima se offset > 0.
        max_placement_attempts: Tentativas para posicionar com offset sem colisão.
        center_layout: Centraliza o layout final.

    Returns:
        CoordList: Lista de coordenadas [x, y] em METROS.
    """
    # Validações
    if num_main_rings <= 0 or tiles_per_ring <= 0 or tile_width_m <= 0 or tile_height_m <= 0:
         print("Aviso (create_interlocking_rings_layout): Contagens e dimensões devem ser positivas.")
         return []
    if center_scale_mode == 'center_exponential' and center_exp_scale_factor <= 0:
        print("Aviso (create_interlocking_rings_layout): center_exp_scale_factor > 0. Usando 1.0.")
        center_exp_scale_factor = 1.0

    tile_diagonal_m = math.sqrt(tile_width_m**2 + tile_height_m**2)
    min_dist_sq = (min_separation_factor * tile_diagonal_m)**2 if random_offset_stddev_m > 0 else 0
    ring_radius = ring_radius_factor * tile_diagonal_m
    main_offset = main_ring_offset_factor * tile_diagonal_m

    # Gera coordenadas base
    base_coords = []
    seen_coords_tuples = set()
    if add_center_tile:
        center_coord_tuple = (round(0.0, COORD_PRECISION), round(0.0, COORD_PRECISION))
        base_coords.append([0.0, 0.0])
        seen_coords_tuples.add(center_coord_tuple)

    for r_idx in range(num_main_rings):
        main_angle = r_idx * 2 * math.pi / num_main_rings
        center_x = main_offset * math.cos(main_angle)
        center_y = main_offset * math.sin(main_angle)
        for t_idx in range(tiles_per_ring):
            tile_angle = t_idx * 2 * math.pi / tiles_per_ring
            x_base = center_x + ring_radius * math.cos(tile_angle)
            y_base = center_y + ring_radius * math.sin(tile_angle)
            coord_tuple = (round(x_base, COORD_PRECISION), round(y_base, COORD_PRECISION))
            if coord_tuple not in seen_coords_tuples:
                 base_coords.append([x_base, y_base])
                 seen_coords_tuples.add(coord_tuple)

    # Aplica scaling exponencial ANTES do offset
    scaled_coords = base_coords
    if center_scale_mode == 'center_exponential':
        coords_to_scale = base_coords[1:] if add_center_tile and base_coords else base_coords
        scaled_part = _apply_center_exponential_scaling(coords_to_scale, center_exp_scale_factor)
        scaled_coords = ([base_coords[0]] + scaled_part) if add_center_tile and base_coords else scaled_part
    elif center_scale_mode != 'none':
         print(f"Aviso (create_interlocking_rings_layout): center_scale_mode '{center_scale_mode}' inválido. Usando 'none'.")

    # Posiciona com offset e checagem
    final_coords = []
    placed_count = 0
    skipped_count = 0
    # Adiciona o ponto central primeiro se existir e houver offset
    if add_center_tile and scaled_coords and random_offset_stddev_m > 0:
        placed_center = _place_with_random_offset_and_collision_check(
            scaled_coords[0][0], scaled_coords[0][1], random_offset_stddev_m, [], min_dist_sq, max_placement_attempts)
        if placed_center is not None: final_coords.append(placed_center)
        else: final_coords.append(scaled_coords[0]); print("Aviso: Offset aleatório falhou para tile central.")
        placed_count = 1 if final_coords else 0
    elif add_center_tile and scaled_coords:
        final_coords.append(scaled_coords[0])
        placed_count = 1

    coords_to_process = scaled_coords[1:] if add_center_tile and scaled_coords else scaled_coords
    if random_offset_stddev_m > 0:
        print(f"  Aplicando offset aleatório (stddev={random_offset_stddev_m:.3f}m) com checagem de colisão...")
        for x_base, y_base in coords_to_process:
            placed_coord = _place_with_random_offset_and_collision_check(
                x_base, y_base, random_offset_stddev_m, final_coords, min_dist_sq, max_placement_attempts)
            if placed_coord is not None:
                final_coords.append(placed_coord); placed_count += 1
            else:
                 print(f"  Aviso: Falha ao posicionar tile perto de ({x_base:.2f}, {y_base:.2f}) após {max_placement_attempts} tentativas.")
                 skipped_count += 1
        if skipped_count > 0: print(f"  {skipped_count}/{len(coords_to_process)} tiles pulados.")
    else:
        final_coords.extend(coords_to_process)
        placed_count = len(final_coords)

    # Arredonda e centraliza
    rounded_coords = [[round(c[0], COORD_PRECISION), round(c[1], COORD_PRECISION)] for c in final_coords]
    centered_coords = rounded_coords
    if center_layout:
        centered_coords = _center_coords(rounded_coords)

    print(f"Layout Anéis Interligados ({num_main_rings} anéis, center_scale={center_scale_mode}): Gerou {placed_count} centros.")
    return centered_coords


# (Repetir adaptação similar para create_segmented_arc_layout, create_radial_density_grid_layout [exceto modo exp], create_manual_circular_layout)
# ... (código adaptado para as outras funções omitido por brevidade, mas seguiria o mesmo padrão) ...

# Adaptação final para create_manual_circular_layout (exemplo)
def create_manual_circular_layout(
     tile_width_m: float,
     tile_height_m: float,
     spacing_mode: Literal['linear', 'center_exponential'] = 'linear', # 'linear' usa os fatores X/Y
     spacing_x_factor: float = 1.0,
     spacing_y_factor: float = 1.0,
     center_exp_scale_factor: float = 1.1,
     random_offset_stddev_m: float = 0.0,
     min_separation_factor: float = 1.05,
     max_placement_attempts: int = DEFAULT_MAX_PLACEMENT_ATTEMPTS,
     center_layout: bool = True,
) -> CoordList:
    """
    Recria layout "Circular Arrangement" (station1) com scaling opcional
    (linear ou exponencial central) e checagem de colisão para offsets.

    Args:
        tile_width_m, tile_height_m: Dimensões de referência (metros).
        spacing_mode: 'linear' (usa fatores X/Y) ou 'center_exponential'.
        spacing_x_factor, spacing_y_factor: Fatores para 'linear'.
        center_exp_scale_factor: Fator (>0) para 'center_exponential'.
        random_offset_stddev_m: Ruído gaussiano (metros). Ativa checagem de colisão.
        min_separation_factor: Fator da diagonal para distância mínima se offset > 0.
        max_placement_attempts: Tentativas para posicionar com offset sem colisão.
        center_layout: Centraliza o layout final.

    Returns:
        CoordList: Lista de coordenadas [x, y] em METROS.
    """
    # Validações
    if tile_width_m <= 0 or tile_height_m <= 0:
        print("Aviso (create_manual_circular_layout): Dimensões devem ser positivas.")
        return []
    if spacing_mode == 'center_exponential' and center_exp_scale_factor <= 0:
        print("Aviso (create_manual_circular_layout): center_exp_scale_factor > 0. Usando 1.0.")
        center_exp_scale_factor = 1.0

    tile_diagonal_m = math.sqrt(tile_width_m**2 + tile_height_m**2)
    min_dist_sq = (min_separation_factor * tile_diagonal_m)**2 if random_offset_stddev_m > 0 else 0

    # Gera coordenadas base usando fatores X/Y
    lenx = tile_width_m * spacing_x_factor
    leny = tile_height_m * spacing_y_factor
    base_coords = []
    # Bloco 1 - 6 (código omitido, igual ao anterior para gerar base_coords)
    base_coords.extend([[-5.5*lenx,0],[-4.5*lenx,-0.5*leny],[-4.5*lenx,0.5*leny],[-3.5*lenx,-1*leny],[-3.5*lenx,0],[-3.5*lenx,1*leny]])
    base_coords.extend([[0.5*lenx,0.5*leny],[0.5*lenx,1.5*leny],[1.5*lenx,0.5*leny],[1.5*lenx,1.5*leny],[2.5*lenx,0.5*leny],[2.5*lenx,1.5*leny]])
    base_coords.extend([[-0.5*lenx,0.5*leny],[-0.5*lenx,1.5*leny],[-1.5*lenx,0.5*leny],[-1.5*lenx,1.5*leny],[-2.5*lenx,0.5*leny],[-2.5*lenx,1.5*leny]])
    base_coords.extend([[0.5*lenx,-0.5*leny],[0.5*lenx,-1.5*leny],[1.5*lenx,-0.5*leny],[1.5*lenx,-1.5*leny],[2.5*lenx,-0.5*leny],[2.5*lenx,-1.5*leny]])
    base_coords.extend([[-0.5*lenx,-0.5*leny],[-0.5*lenx,-1.5*leny],[-1.5*lenx,-0.5*leny],[-1.5*lenx,-1.5*leny],[-2.5*lenx,-0.5*leny],[-2.5*lenx,-1.5*leny]])
    base_coords.extend([[5.5*lenx,0],[4.5*lenx,-0.5*leny],[4.5*lenx,0.5*leny],[3.5*lenx,-1*leny],[3.5*lenx,0],[3.5*lenx,1*leny]])


    # Aplica scaling exponencial ANTES do offset
    scaled_coords = base_coords
    if spacing_mode == 'center_exponential':
        # No modo exponencial, ignora fatores x/y e escala a versão base (fator=1)
        lenx_base = tile_width_m * 1.0
        leny_base = tile_height_m * 1.0
        exp_base_coords = []
        # Recalcula coords com fator 1 para scaling exponencial
        exp_base_coords.extend([[-5.5*lenx_base,0],[-4.5*lenx_base,-0.5*leny_base],[-4.5*lenx_base,0.5*leny_base],[-3.5*lenx_base,-1*leny_base],[-3.5*lenx_base,0],[-3.5*lenx_base,1*leny_base]])
        exp_base_coords.extend([[0.5*lenx_base,0.5*leny_base],[0.5*lenx_base,1.5*leny_base],[1.5*lenx_base,0.5*leny_base],[1.5*lenx_base,1.5*leny_base],[2.5*lenx_base,0.5*leny_base],[2.5*lenx_base,1.5*leny_base]])
        exp_base_coords.extend([[-0.5*lenx_base,0.5*leny_base],[-0.5*lenx_base,1.5*leny_base],[-1.5*lenx_base,0.5*leny_base],[-1.5*lenx_base,1.5*leny_base],[-2.5*lenx_base,0.5*leny_base],[-2.5*lenx_base,1.5*leny_base]])
        exp_base_coords.extend([[0.5*lenx_base,-0.5*leny_base],[0.5*lenx_base,-1.5*leny_base],[1.5*lenx_base,-0.5*leny_base],[1.5*lenx_base,-1.5*leny_base],[2.5*lenx_base,-0.5*leny_base],[2.5*lenx_base,-1.5*leny_base]])
        exp_base_coords.extend([[-0.5*lenx_base,-0.5*leny_base],[-0.5*lenx_base,-1.5*leny_base],[-1.5*lenx_base,-0.5*leny_base],[-1.5*lenx_base,-1.5*leny_base],[-2.5*lenx_base,-0.5*leny_base],[-2.5*lenx_base,-1.5*leny_base]])
        exp_base_coords.extend([[5.5*lenx_base,0],[4.5*lenx_base,-0.5*leny_base],[4.5*lenx_base,0.5*leny_base],[3.5*lenx_base,-1*leny_base],[3.5*lenx_base,0],[3.5*lenx_base,1*leny_base]])
        scaled_coords = _apply_center_exponential_scaling(exp_base_coords, center_exp_scale_factor)
    elif spacing_mode != 'linear':
        print(f"Aviso (create_manual_circular_layout): spacing_mode '{spacing_mode}' inválido. Usando 'linear'.")
        # scaled_coords já contém as coordenadas base com fatores x/y aplicados

    # Posiciona com offset e checagem
    final_coords = []
    placed_count = 0
    skipped_count = 0
    if random_offset_stddev_m > 0:
        print(f"  Aplicando offset aleatório (stddev={random_offset_stddev_m:.3f}m) com checagem de colisão...")
        for x_base, y_base in scaled_coords:
            placed_coord = _place_with_random_offset_and_collision_check(
                x_base, y_base, random_offset_stddev_m, final_coords, min_dist_sq, max_placement_attempts)
            if placed_coord is not None:
                final_coords.append(placed_coord); placed_count += 1
            else:
                 print(f"  Aviso: Falha ao posicionar tile perto de ({x_base:.2f}, {y_base:.2f}) após {max_placement_attempts} tentativas.")
                 skipped_count += 1
        if skipped_count > 0: print(f"  {skipped_count}/{len(scaled_coords)} tiles pulados.")
    else:
        final_coords = scaled_coords
        placed_count = len(final_coords)

    # Arredonda e centraliza
    rounded_coords = [[round(c[0], COORD_PRECISION), round(c[1], COORD_PRECISION)] for c in final_coords]
    centered_coords = rounded_coords
    if center_layout:
        centered_coords = _center_coords(rounded_coords)

    print(f"Layout Manual Circular (modo={spacing_mode}): Gerou {placed_count} centros.")
    return centered_coords


# ==================== Função para Layout Aleatório Puro (já tinha checagem) ====================
def create_random_layout(
    num_tiles: int,
    max_radius_m: float,
    tile_width_m: float,
    tile_height_m: float,
    min_separation_factor: float = 1.05,
    max_placement_attempts: int = DEFAULT_MAX_PLACEMENT_ATTEMPTS * 10, # Mais tentativas aqui
    center_layout: bool = True
) -> CoordList:
    """
    Gera um layout com posições aleatórias dentro de um raio, garantindo separação mínima.
    (Esta função já possuía a lógica de checagem de colisão).
    """
    if num_tiles <= 0: return []
    if max_radius_m <= 0 or tile_width_m <= 0 or tile_height_m <= 0:
         print("Aviso (create_random_layout): Raio e dimensões devem ser positivos.")
         return []

    tile_diagonal_m = math.sqrt(tile_width_m**2 + tile_height_m**2)
    min_dist_sq = (min_separation_factor * tile_diagonal_m)**2

    coords = []
    attempts_total = 0
    placed_count = 0
    skipped_count = 0

    print(f"  Tentando posicionar {num_tiles} tiles aleatoriamente (max_radius={max_radius_m:.2f}m)...")
    for _ in range(num_tiles):
        placed = False
        for attempt in range(max_placement_attempts):
            attempts_total += 1
            # Gera ponto aleatório dentro do círculo
            r = random.uniform(0, max_radius_m) # Distribuição uniforme de raio pode concentrar no centro
            # Para distribuição uniforme de área: r = max_radius_m * math.sqrt(random.random())
            theta = random.uniform(0, 2 * math.pi)
            x = r * math.cos(theta)
            y = r * math.sin(theta)

            # Verifica colisão com pontos já colocados
            valid = True
            for existing_x, existing_y in coords:
                dist_sq = (x - existing_x)**2 + (y - existing_y)**2
                if dist_sq < min_dist_sq:
                    valid = False
                    break
            if valid:
                coords.append([x, y])
                placed = True
                placed_count += 1
                break

        if not placed:
            print(f"  Aviso: Não foi possível posicionar o tile {len(coords)+1} após {max_placement_attempts} tentativas.")
            skipped_count += 1
            # Decide se para ou continua tentando os próximos
            # break # Descomente para parar se um falhar

    # Arredonda e centraliza
    rounded_coords = [[round(c[0], COORD_PRECISION), round(c[1], COORD_PRECISION)] for c in coords]
    centered_coords = rounded_coords
    if center_layout:
         centered_coords = _center_coords(rounded_coords)

    print(f"Layout Aleatório Puro (R={max_radius_m}m): Gerou {placed_count} centros ({skipped_count} pulados). Tentativas: {attempts_total}.")
    return centered_coords



# ==================== Exemplo de Uso (para teste) ====================
if __name__ == "__main__":
    print("--- Testando a Biblioteca bingo_layouts (vCom Colisão Check) ---")
    EXAMPLE_TILE_WIDTH = 0.35
    EXAMPLE_TILE_HEIGHT = 1.34

    print("\n1. Grid com offset e checagem (pode pular pontos):")
    grid_rand_check = create_grid_layout(5, 5, EXAMPLE_TILE_WIDTH, EXAMPLE_TILE_HEIGHT,
                                         spacing_x_factor=1.0, spacing_y_factor=1.0,
                                         random_offset_stddev_m=0.1, min_separation_factor=1.0)

    print("\n2. Espiral com offset e checagem (pode pular pontos):")
    spiral_rand_check = create_spiral_layout(4, 8, EXAMPLE_TILE_WIDTH, EXAMPLE_TILE_HEIGHT,
                                             random_offset_stddev_m=0.2, min_separation_factor=1.0)

    print("\n3. Phyllotaxis com offset e checagem (pode pular pontos):")
    phylo_rand_check = create_phyllotaxis_layout(50, EXAMPLE_TILE_WIDTH, EXAMPLE_TILE_HEIGHT,
                                                  scale_factor=0.4,
                                                  random_offset_stddev_m=0.1, min_separation_factor=0.95)

    print("\n4. Manual Circular com offset e checagem (pode pular pontos):")
    manual_rand_check = create_manual_circular_layout(EXAMPLE_TILE_WIDTH, EXAMPLE_TILE_HEIGHT,
                                                        spacing_x_factor=3, spacing_y_factor=3,
                                                        random_offset_stddev_m=0.1, min_separation_factor=1.0)

    print("\n5. Grid Exponencial Central:")
    grid_exp_center = create_grid_layout(7, 7, EXAMPLE_TILE_WIDTH, EXAMPLE_TILE_HEIGHT,
                                         spacing_mode='center_exponential', center_exp_scale_factor=1.2)

    print("\n6. Rhombus Exponencial Central:")
    rhombus_exp_center = create_rhombus_layout(7, EXAMPLE_TILE_WIDTH, EXAMPLE_TILE_HEIGHT,
                                              spacing_mode='center_exponential', center_exp_scale_factor=0.8)


    print("\n--- Testes Concluídos ---")