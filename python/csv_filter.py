import pandas as pd
import csv # Para usar csv.QUOTE_MINIMAL ou csv.QUOTE_NONNUMERIC

# Caminho para o arquivo de entrada
input_file_path = r"C:\Users\gefer\Documents\LayoutGeneratorBINGO\data\rE_table_vivaldi.csv"

# Caminho para o arquivo de saída (com as colunas filtradas e tabela reduzida)
output_file_path = r"C:\Users\gefer\Documents\LayoutGeneratorBINGO\data\rE_table_vivaldi_filtrado_reduzido.csv"

# Nomes exatos das colunas chave (ajuste se necessário, após verificar seu arquivo)
col_freq_name = "Freq [GHz]"
col_phi_name = "Phi [deg]"
col_theta_name = "Theta [deg]"

try:
    print(f"Tentando ler o arquivo: {input_file_path}...")
    df = None
    
    # Tentativa 1: Assumir CSV padrão (vírgula como separador)
    try:
        print("Tentando ler com sep=',' e quotechar='\"' (engine python)...")
        # Ler tudo como string inicialmente para maior controle sobre a conversão e nomes de colunas
        df_temp = pd.read_csv(input_file_path, sep=',', quotechar='"', skipinitialspace=True, engine='python', dtype=str)
        
        # Limpar nomes das colunas lidas (remover espaços extras)
        df_temp.columns = [str(col).strip() for col in df_temp.columns]

        # Verificar se colunas essenciais foram encontradas após a limpeza
        if (col_freq_name in df_temp.columns and 
            col_phi_name in df_temp.columns and 
            col_theta_name in df_temp.columns and 
            len(df_temp.columns) > 1):
            df = df_temp
            print("Arquivo lido com sucesso usando sep=','.")
        else:
            print(f"Leitura com sep=',' não produziu as colunas esperadas ou produziu apenas uma coluna. Colunas detectadas: {df_temp.columns.tolist()}. Tentando sep='\t'.")
            df = None # Resetar para forçar a próxima tentativa
    except Exception as e_comma:
        print(f"Falha ao ler com sep=',' (detalhes: {e_comma}). Tentando com sep='\t'.")

    # Tentativa 2: Se a primeira falhou ou não foi ideal, tentar com tabulação
    if df is None:
        try:
            print("Tentando ler com sep='\t' e quotechar='\"' (engine python)...")
            df_temp = pd.read_csv(input_file_path, sep='\t', quotechar='"', skipinitialspace=True, engine='python', dtype=str)
            df_temp.columns = [str(col).strip() for col in df_temp.columns]

            if (col_freq_name in df_temp.columns and 
                col_phi_name in df_temp.columns and 
                col_theta_name in df_temp.columns and 
                len(df_temp.columns) > 1):
                df = df_temp
                print("Arquivo lido com sucesso usando sep='\t'.")
            else:
                print(f"Leitura com sep='\t' não produziu as colunas esperadas ou produziu apenas uma coluna. Colunas detectadas: {df_temp.columns.tolist()}.")
                # Se ainda assim resultou em uma coluna, pode ser um problema mais sério.
                if len(df_temp.columns) == 1:
                    print(f"AVISO: Leitura com sep='\t' resultou em uma única coluna: {df_temp.columns.tolist()}")
                # Mesmo que não ideal, atribuímos para análise posterior ou erro.
                df = df_temp 
        except Exception as e_tab:
            print(f"Falha ao ler com sep='\t' (detalhes: {e_tab}).")
            error_msg_comma = f", Erro com vírgula: {e_comma}" if 'e_comma' in locals() and e_comma else ""
            raise RuntimeError(f"Não foi possível ler o arquivo CSV/TSV corretamente. Verifique o formato do arquivo{error_msg_comma}. Erro com tab: {e_tab}")

    if df is None:
        print("Não foi possível carregar o DataFrame após tentativas. Verifique os erros anteriores.")
        exit()

    print(f"\nColunas originais lidas ({len(df.columns)}): {df.columns.tolist()}")
    
    # Verificação crítica: Se ainda temos uma única coluna com todos os nomes concatenados.
    if len(df.columns) == 1 and (df.columns[0].count(',') > 5 or df.columns[0].count('\t') > 5): # Heurística
        print("\nERRO CRÍTICO: O arquivo foi lido como tendo uma única coluna que parece conter todos os nomes de cabeçalho.")
        print(f"Conteúdo da coluna única: '{df.columns[0]}'")
        print("Isso indica que o delimitador (',' ou '\t') não foi interpretado corretamente para o cabeçalho.")
        print("Por favor, verifique manualmente o delimitador real e a formatação do cabeçalho no seu arquivo CSV.")
        exit()

    # 1. Conversão de Tipos
    # Converter colunas relevantes para numérico.
    # Todas as colunas de dados (re, im, Gain, Dir, Freq, Phi, Theta) devem ser numéricas.
    print("\nConvertendo colunas para tipo numérico (onde aplicável)...")
    for col_name in df.columns:
        # Se a coluna não for puramente de texto descritivo, tente convertê-la.
        # Para este dataset, quase todas as colunas são numéricas.
        try:
            # Tenta converter para float64, que é um tipo numérico comum.
            # Se for inteiro, pandas pode otimizar, mas float é mais geral para esses dados.
            df[col_name] = pd.to_numeric(df[col_name], errors='coerce')
        except Exception as e_conv:
            print(f"  Não foi possível converter a coluna '{col_name}' para numérica (erro: {e_conv}). Mantendo como string/object.")
            
    # Verificar se as colunas chave para processamento (Phi, Theta) são numéricas
    for key_col in [col_phi_name, col_theta_name, col_freq_name]:
        if key_col in df.columns and not pd.api.types.is_numeric_dtype(df[key_col]):
            print(f"AVISO: A coluna '{key_col}' não é numérica após a tentativa de conversão. Isso pode afetar a filtragem ou cálculos.")
        elif key_col not in df.columns:
             print(f"AVISO: A coluna chave '{key_col}' não foi encontrada no DataFrame.")


    # 2. Remover colunas indesejadas ("Gain", "Dir", "Freq")
    keywords_to_drop = ["Gain", "Dir"] # Palavras-chave para identificar colunas a remover
    
    cols_to_drop_list = []
    for col_name_iter in df.columns:
        for keyword in keywords_to_drop:
            if keyword in str(col_name_iter): # str() para o caso de o nome da coluna não ser string
                cols_to_drop_list.append(col_name_iter)
                break # Evita adicionar a mesma coluna múltiplas vezes
    
    # Adicionar a coluna de frequência específica para remoção
    if col_freq_name in df.columns:
        cols_to_drop_list.append(col_freq_name)
    else:
        print(f"AVISO: Coluna de frequência '{col_freq_name}' não encontrada para remoção (já pode ter sido removida ou nome incorreto).")

    # Remover duplicatas da lista de colunas a serem dropadas
    cols_to_drop_list = list(set(cols_to_drop_list)) 

    # Filtrar apenas colunas que realmente existem no DataFrame para evitar erros no drop
    actual_cols_to_drop = [col for col in cols_to_drop_list if col in df.columns]
    
    df_filtered = df.copy() # Trabalhar com uma cópia para não alterar o df original neste estágio

    if not actual_cols_to_drop:
        print("\nNenhuma coluna correspondente a 'Gain', 'Dir' ou o nome da frequência foi encontrada para remover.")
    else:
        print(f"\nColunas a serem removidas: {actual_cols_to_drop}")
        df_filtered.drop(columns=actual_cols_to_drop, inplace=True)
        print(f"Colunas após a remoção ({len(df_filtered.columns)}): {df_filtered.columns.tolist()}")

    # 3. Reduzir a tabela (amostragem por Theta)
    # Assume que a tabela está ordenada de forma que Theta incrementa 0.05 por linha.
    # Selecionar linhas alternadas para mudar o passo de Theta para 0.1.
    print(f"\nReduzindo a tabela (passo de Theta de 0.05 para 0.1)...")
    print(f"Número de linhas antes da redução: {len(df_filtered)}")
    if len(df_filtered) > 0:
        # .iloc[::2] seleciona a linha 0, 2, 4, ...
        df_final = df_filtered.iloc[::2].copy() # .copy() para garantir que é um novo DataFrame
    else:
        df_final = df_filtered.copy() # Se já estiver vazio, apenas copia
    print(f"Número de linhas após a redução: {len(df_final)}")

    # 4. Obter e printar Phi e Theta iniciais e finais da tabela *final*
    print("\n--- Informações da Tabela Final ---")
    if not df_final.empty:
        # Para Phi
        if col_phi_name in df_final.columns and pd.api.types.is_numeric_dtype(df_final[col_phi_name]):
            phi_min = df_final[col_phi_name].min()
            phi_max = df_final[col_phi_name].max()
            print(f"Intervalo de '{col_phi_name}': de {phi_min} a {phi_max}")
        else:
            print(f"AVISO: Coluna '{col_phi_name}' não encontrada ou não é numérica na tabela final. Não é possível calcular min/max.")

        # Para Theta
        if col_theta_name in df_final.columns and pd.api.types.is_numeric_dtype(df_final[col_theta_name]):
            theta_min = df_final[col_theta_name].min()
            theta_max = df_final[col_theta_name].max()
            print(f"Intervalo de '{col_theta_name}': de {theta_min} a {theta_max}")
        else:
            print(f"AVISO: Coluna '{col_theta_name}' não encontrada ou não é numérica na tabela final. Não é possível calcular min/max.")
    else:
        print("Tabela final está vazia. Não é possível calcular intervalos de Phi e Theta.")

    # 5. Salvar o DataFrame resultante em um novo arquivo CSV
    # Usar vírgula como separador para melhor compatibilidade com Excel na maioria das regiões.
    # O Excel usa as configurações regionais do Windows para interpretar CSVs.
    # Se ',' não funcionar (tudo em uma coluna), tente ';'.
    print(f"\nSalvando arquivo filtrado e reduzido em: {output_file_path}")
    if not df_final.empty:
        df_final.to_csv(output_file_path, sep=',', decimal='.', index=False, quoting=csv.QUOTE_MINIMAL)
        print("Arquivo salvo com sucesso.")
        print("Nota: O arquivo foi salvo com vírgula (,) como separador e ponto (.) como decimal.")
        print("Se o Excel abrir este arquivo em uma única coluna, tente usar a opção 'Texto para Colunas' do Excel,")
        print("ou ajuste o código para salvar com sep=';' e decimal=',' se sua configuração regional do Excel assim o exigir.")
    else:
        print("Tabela final está vazia, nenhum arquivo foi salvo.")


except FileNotFoundError:
    print(f"Erro Crítico: O arquivo '{input_file_path}' não foi encontrado.")
except pd.errors.EmptyDataError:
    print(f"Erro Crítico: O arquivo '{input_file_path}' está vazio ou não é um CSV válido.")
except RuntimeError as e_rt: # Captura o erro levantado pelas tentativas de leitura
    print(f"Erro Crítico de Leitura: {e_rt}")
except Exception as e:
    print(f"Ocorreu um erro inesperado: {e}")
    import traceback
    traceback.print_exc()