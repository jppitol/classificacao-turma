"""Liga cada aluno ao seu email institucional.

1) python scripts/gerar_emails_sql.py --modelo      -> cria emails.csv com todos os nomes de guerra
2) preencha a coluna "email" no emails.csv (Excel, Google Sheets, editor de texto...)
3) python scripts/gerar_emails_sql.py                -> cria supabase/04_emails.sql
4) rode o 04_emails.sql no SQL Editor do Supabase

emails.csv e 04_emails.sql têm dados pessoais: ficam fora do git (.gitignore).
"""
import csv
import re
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
CSV = RAIZ / "emails.csv"
IMPORT = RAIZ / "supabase" / "03_importar_planilha.sql"


def q(s):
    return "'" + s.replace("'", "''") + "'"


if "--modelo" in sys.argv:
    if not IMPORT.exists():
        sys.exit("Rode antes: python scripts/gerar_sql.py PLANILHA.xlsx")
    bloco = IMPORT.read_text(encoding="utf-8").split("insert into public.alunos", 1)[1].split(";\n", 1)[0]
    nomes = re.findall(r"\(\(select id from public\.turmas where nome = 'XXX'\), '((?:[^']|'')+)', '(ativa|reserva)'\)", bloco)
    with CSV.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["nome_guerra", "segmento", "email"])
        for nome, seg in nomes:
            w.writerow([nome.replace("''", "'"), seg, ""])
    print(f"ok: {CSV.name} com {len(nomes)} alunos. Preencha a coluna email.")
    sys.exit()

linhas, vistos, erros = [], set(), []
with CSV.open(encoding="utf-8-sig") as f:
    for r in csv.DictReader(f):
        nome, email = r["nome_guerra"].strip(), (r.get("email") or "").strip().lower()
        if not email:
            continue
        if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email):
            erros.append(f"email inválido para {nome}: {email}")
        if email in vistos:
            erros.append(f"email repetido: {email}")
        vistos.add(email)
        linhas.append(f"update public.alunos set email = {q(email)} where nome_guerra = {q(nome)};")
if erros:
    sys.exit("\n".join(erros))
(RAIZ / "supabase" / "04_emails.sql").write_text("begin;\n" + "\n".join(linhas) + "\ncommit;\n", encoding="utf-8")
print(f"ok: supabase/04_emails.sql com {len(linhas)} emails")
