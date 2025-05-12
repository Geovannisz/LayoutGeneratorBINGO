import pandas as pd
import os
import numpy as np

# --- Configurações ---
INPUT_CSV_PATH = r"C:\Users\gefer\Documents\LayoutGeneratorBINGO\data\rE_table_vivaldi.csv"  # Seu arquivo CSV original
OUTPUT_DIR = r"C:\Users\gefer\Documents\LayoutGeneratorBINGO\data\efield_phi_data"    # Pasta para salvar os arquivos divididos (nome diferente para clareza)
PHI_VALUES_TO_EXTRACT = range(0, 91)   # Phi de 0 a 90 graus (inteiros)
RELEVANT_COLUMNS = ['theta [deg]', 'phi [deg]', 're(retheta) [v]', 'im(retheta) [v]', 're(rephi) [v]', 'im(rephi) [v]']
# --------------------

if not os.path.exists(OUTPUT_DIR):
    os.makedirs(OUTPUT_DIR)

print(f"Lendo o arquivo CSV original: {INPUT_CSV_PATH}...")
try:
    df = pd.read_csv(INPUT_CSV_PATH, usecols=lambda col_name: col_name.strip().lower().replace('"', '') in RELEVANT_COLUMNS or col_name.startswith("Freq"), dtype=str)
    print("Arquivo CSV lido com sucesso.")
except FileNotFoundError:
    print(f"ERRO: Arquivo de entrada '{INPUT_CSV_PATH}' não encontrado.")
    exit()
except Exception as e:
    print(f"ERRO ao ler o CSV: {e}")
    exit()

df.columns = [col.strip().lower().replace('"', '') for col in df.columns]
print("Colunas após normalização:", df.columns.tolist())

missing_cols = [col for col in RELEVANT_COLUMNS if col not in df.columns]
if missing_cols:
    print(f"ERRO: Colunas esperadas não encontradas no CSV: {missing_cols}")
    exit()

print("Convertendo colunas para numérico...")
for col in RELEVANT_COLUMNS:
    if 'deg' in col or 'v' in col:
        df[col] = df[col].str.replace(',', '.', regex=False)
        df[col] = pd.to_numeric(df[col], errors='coerce')

df.dropna(subset=RELEVANT_COLUMNS, inplace=True)
print(f"Total de linhas após conversão e remoção de NaNs: {len(df)}")

freq_col_name = next((col for col in df.columns if 'freq' in col.lower()), None)
if freq_col_name:
    print(f"Filtrando por frequência ({freq_col_name} = 1)...")
    df[freq_col_name] = pd.to_numeric(df[freq_col_name].str.replace(',', '.', regex=False), errors='coerce')
    df = df[np.isclose(df[freq_col_name], 1.0)]
    print(f"Linhas após filtro de frequência: {len(df)}")
else:
    print("AVISO: Coluna de frequência não encontrada explicitamente.")

df['phi_int'] = df['phi [deg]'].round().astype(int)
header_line = '"' + '","'.join(RELEVANT_COLUMNS) + '"\n'

for phi_val in PHI_VALUES_TO_EXTRACT:
    phi_specific_df = df[df['phi_int'] == phi_val]

    if not phi_specific_df.empty:
        output_filename = os.path.join(OUTPUT_DIR, f'efield_phi_{phi_val}.csv')
        print(f"Processando Phi = {phi_val} -> {output_filename} ({len(phi_specific_df)} linhas)")
        phi_specific_df_to_save = phi_specific_df[RELEVANT_COLUMNS]
        with open(output_filename, 'w', encoding='utf-8') as f:
            f.write(header_line)
            for _, row in phi_specific_df_to_save.iterrows():
                formatted_row = []
                for col_name in RELEVANT_COLUMNS:
                    val = row[col_name]
                    if '[deg]' in col_name:
                        formatted_row.append(f'{val:.2f}')
                    elif '[v]' in col_name:
                        formatted_row.append(f'{val:.15e}')
                    else:
                        formatted_row.append(str(val))
                f.write('"' + '","'.join(formatted_row) + '"\n')
    else:
        print(f"Sem dados para Phi = {phi_val}")

print(f"\nPré-processamento concluído. Arquivos salvos em '{OUTPUT_DIR}'.")
print(f"IMPORTANTE: Copie a pasta '{OUTPUT_DIR}' para a pasta 'data/' do seu projeto no GitHub.")
print("Ou seja, você deve ter 'data/efield_phi_data_github/efield_phi_0.csv', etc.")