"""Estrutura do ciclo básico (Turma XXX), extraída das fórmulas da planilha.

Fonte única de verdade: daqui saem o seed do banco e o mapeamento da importação.
Cada avaliação: (nome, peso, coluna_na_planilha). Pesos só importam em proporção
dentro da disciplina. Disciplinas de um mesmo semestre/componente têm peso igual
(a planilha usa AVERAGE), exceto o componente militar, que tem pesos explícitos.
"""

PADRAO = lambda c: [("VE 1", 0.5, c[0]), ("VE 2", 0.5, c[1]), ("VC", 1, c[2]), ("VF", 2, c[3])]
# ((VE1+VE2)/2 + VC + 2*VF)/4  ->  pesos 0.5, 0.5, 1, 2

SEMESTRES = {
    1: {
        "aba": "1º Semestre",
        "graduacao": [
            ("Física I", 1, PADRAO(["B", "C", "D", "E"])),
            ("Cálculo I", 1, PADRAO(["G", "H", "I", "J"])),
            ("Álgebra Linear I", 1, PADRAO(["L", "M", "N", "O"])),
            ("IC", 1, [("VE 1", 0.3, "Q"), ("VE 2", 0.3, "R"), ("VE 3", 0.4, "S")]),
            ("Química I", 1, PADRAO(["U", "V", "W", "X"])),
            ("Laboratório de Física I", 1, [("1º", 1, "Z"), ("2º", 1, "AA"), ("3º", 1, "AB"), ("4º", 1, "AC")]),
            ("Laboratório de Química I", 1, [("1º", 0.5, "AE"), ("2º", 1, "AF"), ("3º", 3, "AG"), ("4º", 4.5, "AH"), ("5º", 1, "AI")]),
        ],
        # 1º semestre: Média Militar = só Instrução Militar (o TAF é lançado mas não entra: AR = AP)
        "militar": [
            ("Instrução Militar I", 1, PADRAO(["AL", "AM", "AN", "AO"])),
            ("TAF I", 0, [("Nota", 1, "AQ")]),
        ],
    },
    2: {
        "aba": "2º Semestre",
        "graduacao": [
            ("Física II", 1, PADRAO(["B", "C", "D", "E"])),
            ("Cálculo II", 1, PADRAO(["G", "H", "I", "J"])),
            ("Álgebra Linear II", 1, PADRAO(["L", "M", "N", "O"])),
            ("Desenho Técnico", 1, PADRAO(["Q", "R", "S", "T"])),
            ("Química II", 1, PADRAO(["V", "W", "X", "Y"])),
            ("Laboratório de Física II", 1, [("VE 1", 1, "AA"), ("VE 2", 1, "AB")]),
            ("Laboratório de Química II", 1, [("1º", 1, "AD"), ("2º", 2, "AE"), ("3º", 2, "AF"), ("4º", 2, "AG"), ("5º", 3, "AH")]),
        ],
        # Militar = 0.5*IM + 0.5*TAF ; TAF = (Flexão + Corrida)/2 (abdominal não entra)
        "militar": [
            ("Instrução Militar II", 1, PADRAO(["AL", "AM", "AN", "AO"])),
            ("TAF II", 1, [("Flexão", 1, "AQ"), ("Corrida", 1, "AR"), ("Abdominal", 0, "AS")]),
        ],
    },
    3: {
        "aba": "3º Semestre",
        "graduacao": [
            ("Física III", 1, PADRAO(["C", "D", "E", "F"])),
            ("Cálculo III", 1, PADRAO(["H", "I", "J", "K"])),
            ("Mecânica I", 1, PADRAO(["M", "N", "O", "P"])),
            ("ICM", 1, [("VE 1", 0.3, "R"), ("VE 2", 0.5, "S"), ("VE 3", 0.2, "T"), ("VC", 1, "U"), ("VF", 2, "V")]),
            ("Eletricidade Técnica", 1, PADRAO(["X", "Y", "Z", "AA"])),
            # (soma(Forms)*(fator/4) + 3*VE2 + 4*VE3 + 2*VE4)/10, fator = 1 para todos na planilha
            ("IPE I", 1, [("Forms 1", 0.25, "AC"), ("Forms 2", 0.25, "AD"), ("Forms 3", 0.25, "AE"), ("Forms 4", 0.25, "AF"),
                          ("VE 2", 3, "AH"), ("VE 3", 4, "AI"), ("VE 4", 2, "AJ")]),
            ("Laboratório de Física III", 1, [("1º", 1, "AL"), ("2º", 2, "AM"), ("3º", 2, "AN"), ("4º", 2, "AO"), ("5º", 3, "AP")]),
        ],
        "militar": [
            ("Instrução Militar III", 1, PADRAO(["AU", "AV", "AW", "AX"])),
            ("TAF III", 1, [("Flexão", 1, "AZ"), ("Corrida", 1, "BA"), ("Abdominal", 0, "BB")]),
        ],
    },
    4: {
        "aba": "4º Semestre",
        "graduacao": [
            ("Física IV", 1, PADRAO(["C", "D", "E", "F"])),
            ("Cálculo IV", 1, PADRAO(["I", "J", "K", "L"])),
            ("Mecânica II", 1, PADRAO(["O", "P", "Q", "R"])),
            ("Resistência dos Materiais", 1, PADRAO(["U", "V", "W", "X"])),
            ("Cálculo Numérico", 1, [("VE 1", 0.6, "AA"), ("VE 2", 0.4, "AB"), ("VC", 1, "AC"), ("VF", 2, "AD")]),
            ("Probabilidade", 1, PADRAO(["AG", "AH", "AI", "AJ"])),
            ("IPE II", 1, [("Nota Final", 1, "AM")]),
            ("Laboratório de Física IV", 1, [("Nota Final", 1, "AP")]),
        ],
        "militar": [
            ("Instrução Militar IV", 1, [("VE 1", 0.3, "AU"), ("Conceito", 0.7, "AV"), ("VC", 1, "AW"), ("VF", 2, "AX")]),
            ("TAF IV", 1, [("Flexão", 1, "BA"), ("Corrida", 1, "BB"), ("Abdominal", 0, "BC")]),
        ],
    },
}

# NCF = peso_grad*MG + peso_mil*MM ; MG/MM = média dos 4 semestres (0.25 cada)
PESOS_NCF = {"ativa": (0.8, 0.2), "reserva": (0.9, 0.1)}  # 'Classificação OFICIAL'

ENGENHARIAS = [
    ("COMP", "Engenharia de Computação"),
    ("CART", "Engenharia Cartográfica"),
    ("MEC AUT", "Engenharia Mecânica e de Automóveis"),
    ("MEC ARM", "Engenharia Mecânica e de Armamento"),
    ("ELE", "Engenharia Elétrica"),
    ("ELO", "Engenharia Eletrônica"),
    ("TEL", "Engenharia de Telecomunicações"),
    ("FC", "Engenharia de Fortificação e Construção"),
    ("MAT", "Engenharia de Materiais"),
    ("QUI", "Engenharia Química"),
]
VAGAS = {
    "ativa":   {"COMP": 13, "CART": 8, "MEC AUT": 5, "MEC ARM": 5, "ELE": 4, "ELO": 7, "TEL": 6, "FC": 8, "MAT": 3, "QUI": 7},
    "reserva": {"COMP": 14, "CART": 7, "MEC AUT": 12, "MEC ARM": 12, "ELE": 12, "ELO": 12, "TEL": 12, "FC": 12, "MAT": 12, "QUI": 12},
}
