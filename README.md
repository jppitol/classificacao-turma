# Classificação da Turma XXX

Site para substituir a planilha de classificação: cada aluno lança as próprias notas e vê
ranking, médias da turma, feedback por disciplina e a simulação da escolha de engenharia.

- **Banco + login:** Supabase (plano grátis)
- **Site:** HTML + JavaScript puro, hospedado no GitHub Pages (grátis)
- **Cálculos:** feitos dentro do banco, conferidos contra a planilha (ver "Testes")

```
classificacao-turma/
├── CLAUDE.md                 especificação do site (o Claude Code lê isso sozinho)
├── PROMPTS.md                roteiro de prompts para construir o site em etapas
├── supabase/
│   ├── 00_reset.sql          apaga tudo (só se precisar recomeçar)
│   ├── 01_schema.sql         tabelas, cálculos, segurança (RLS), regras de cadastro
│   ├── 02_seed.sql           disciplinas, pesos, engenharias e vagas da Turma XXX
│   └── 03_importar_planilha.sql   alunos, notas e preferências atuais (DADOS REAIS, fora do git)
├── scripts/
│   ├── estrutura.py          pesos de cada avaliação (fonte única de verdade)
│   ├── gerar_sql.py          gera 02 e 03 a partir de estrutura.py e da planilha
│   └── gerar_emails_sql.py   gera 04_emails.sql a partir de um CSV nome -> email
├── tests/                    testes do banco num Postgres local
└── .github/workflows/pages.yml   publica a pasta web/ no GitHub Pages a cada push
```

---

## Passo a passo do setup (uma vez só)

Tempo estimado: 40 min. Faça na ordem; cada passo depende do anterior.

### 1. Contas e programas

1. Crie conta no [GitHub](https://github.com) e no [Supabase](https://supabase.com) (dá pra entrar no Supabase com a conta do GitHub).
2. No seu computador: [Git](https://git-scm.com), [Python 3.8+](https://python.org), [Node.js 20+](https://nodejs.org) (só para os testes) e o Claude Code.
3. Confira no terminal:
   ```bash
   git --version
   python3 --version
   node --version
   ```

### 2. Criar o projeto no Supabase

1. Supabase > **New project**.
2. Nome: `classificacao-xxx`. Região: **South America (São Paulo)**.
3. **Database password:** gere uma e guarde num gerenciador de senhas (quase nunca vai precisar, mas não tem como recuperar).
4. Espere uns 2 minutos até o projeto ficar pronto.

### 3. (Opcional) Regerar os SQLs a partir da planilha

O `03_importar_planilha.sql` que veio no pacote já foi gerado da planilha que tu mandou.
Só precisa refazer se a planilha mudou:

```bash
cd classificacao-turma
pip install openpyxl
python3 scripts/gerar_sql.py "CLASSIFICAÇÃO XXX.xlsx"
```

### 4. Criar o banco

No Supabase: menu lateral > **SQL Editor** > **New query**. Para cada arquivo abaixo, **nesta ordem**:
abra o arquivo num editor de texto, copie tudo, cole no SQL Editor e clique **Run**.

1. `supabase/01_schema.sql` (deve terminar com "Success. No rows returned")
2. `supabase/02_seed.sql`
3. `supabase/03_importar_planilha.sql` (opcional, mas assim ninguém precisa redigitar o 1º semestre)

Conferência rápida (cole e rode):
```sql
select (select count(*) from alunos) alunos, (select count(*) from notas) notas,
       (select count(*) from avaliacoes) avaliacoes;
```
Esperado: `93 | 3807 | 140`.

> Se der erro no meio, nada fica pela metade (cada arquivo roda numa transação).
> Para recomeçar do zero, rode `supabase/00_reset.sql` e volte ao item 1.

### 5. Cadastrar os emails institucionais

O site só aceita cadastro de quem tem email na tabela `alunos`.

```bash
python3 scripts/gerar_emails_sql.py --modelo     # cria emails.csv com os 93 nomes
# abra o emails.csv (Excel/Sheets), preencha a coluna "email", salve como CSV
python3 scripts/gerar_emails_sql.py              # cria supabase/04_emails.sql
```
Rode o `04_emails.sql` no SQL Editor. Dá também pra editar direto em **Table Editor > alunos**
(sempre em minúsculas; o banco recusa maiúsculas).

**Teste primeiro com o teu email:** coloca só o teu, faz o setup inteiro e cria a tua conta.
Se o email de confirmação não chegar no email institucional (filtro de spam do servidor), dá tempo de mudar a estratégia antes de envolver a turma.

### 6. Email de confirmação (SMTP)

O email padrão do Supabase **só envia para membros da equipe do projeto e no máximo 2 por hora**.
Para a turma conseguir se cadastrar, é obrigatório configurar um SMTP próprio. O jeito grátis mais simples é um Gmail:

1. Crie (ou use) uma conta Gmail para o site, por exemplo `classificacao.xxx@gmail.com`.
2. Ative a **verificação em duas etapas** nela (myaccount.google.com > Segurança).
3. Gere uma **senha de app**: myaccount.google.com > Segurança > Senhas de app > nome "Supabase". Copie os 16 caracteres.
4. Supabase > **Authentication > Emails > SMTP Settings** > ative **Enable custom SMTP**:
   - Sender email: `classificacao.xxx@gmail.com`
   - Sender name: `Classificação XXX`
   - Host: `smtp.gmail.com`
   - Port: `587`
   - Username: `classificacao.xxx@gmail.com`
   - Password: a senha de app (sem espaços)
   - Salve.
5. **Authentication > Rate Limits**: suba "Rate limit for sending emails" para `100` por hora
   (o Gmail aguenta uns 500 por dia).
6. (Opcional) **Authentication > Emails > Templates > Confirm signup**: traduza o texto para português.

### 7. Barrar cadastro de quem não é da turma

**Authentication > Hooks** > **Before User Created** > tipo **Postgres** (pode aparecer como "SQL")
> schema `public` > função `hook_somente_alunos` > **Create/Enable**.

Sem esse passo, qualquer pessoa conseguiria criar conta (ela não veria nada, porque não está ligada a nenhum aluno, mas é melhor barrar na porta).

### 8. Configurações de login

1. **Authentication > Sign In / Providers > Email**: Email ligado, **Confirm email** ligado.
2. **Authentication > URL Configuration**:
   - Site URL: por enquanto `http://localhost:8000`. Depois do deploy (passo 11), troque para `https://SEU_USUARIO.github.io/classificacao-turma/`.
   - Redirect URLs: adicione `http://localhost:8000/**` e, depois do deploy, `https://SEU_USUARIO.github.io/classificacao-turma/**`.

### 9. Chaves do projeto

**Settings > API Keys**: copie a **Project URL** e a **Publishable key** (`sb_publishable_...`).
Elas vão no `web/config.js` (o Claude Code cria esse arquivo na etapa 1 do PROMPTS.md).

A publishable key **pode** ficar no site público: quem protege os dados são as regras de RLS do `01_schema.sql`.
A **secret key** (`sb_secret_...`) e a senha do banco **nunca** vão para o código.

### 10. Construir o site

```bash
cd classificacao-turma
git init
claude
```
Siga o `PROMPTS.md`, uma etapa por vez, testando cada uma no navegador antes de seguir.
Para rodar o site localmente:
```bash
cd web
python3 -m http.server 8000
# abra http://localhost:8000
```

### 11. Publicar no GitHub Pages

1. Confira que os dados reais **não** vão subir:
   ```bash
   git status --ignored
   ```
   `03_importar_planilha.sql`, `04_emails.sql`, `emails.csv`, `tests/esperado.json` e qualquer `.xlsx` têm que aparecer como ignorados.
2. Crie um repositório **público** chamado `classificacao-turma` no GitHub (Pages grátis exige repositório público) e suba:
   ```bash
   git add .
   git commit -m "Primeira versão"
   git branch -M main
   git remote add origin https://github.com/SEU_USUARIO/classificacao-turma.git
   git push -u origin main
   ```
3. No repositório: **Settings > Pages** > Source: **GitHub Actions**. O workflow `.github/workflows/pages.yml` já vem pronto e publica a pasta `web/` a cada push; acompanhe na aba **Actions**.
4. Volte no passo 8 e coloque a URL do site em Site URL e Redirect URLs.

---

## Como o cálculo funciona

Tudo igual à planilha, tirado das fórmulas dela:

- **Média da disciplina** = média ponderada das avaliações. Ex.: padrão `((VE1+VE2)/2 + VC + 2·VF)/4`, IC `0,3·VE1 + 0,3·VE2 + 0,4·VE3`, labs com os pesos de cada aba.
- **Graduação do semestre** = média simples das disciplinas. **Militar do semestre** = Instrução Militar no 1º; `0,5·IM + 0,5·TAF` do 2º em diante, com TAF = `(Flexão + Corrida)/2`.
- **MG e MM** = média dos 4 semestres (0,25 cada).
- **NCF** = `0,8·MG + 0,2·MM` na ativa e `0,9·MG + 0,1·MM` na reserva. Ranking separado por segmento.
- **Engenharias:** na ordem da classificação, cada aluno fica com a primeira opção que ainda tem vaga (igual à aba Preferências).
- **Semestre em andamento:** avaliação sem nota simplesmente não entra. Cada avaliação pesa o que pesaria no NCF final, e a média é feita só sobre o que já foi lançado (mesma ideia das colunas "relativo" da planilha). Quando tudo estiver lançado, dá exatamente a fórmula oficial.

Os pesos ficam nas tabelas `semestres`, `disciplinas`, `avaliacoes`, `pesos_ncf` e `vagas`. Para mudar algo (ex.: vagas do ano), edite em **Table Editor** que o site recalcula sozinho.

## Testes

Conferem os cálculos do banco contra a planilha e as regras de segurança:

```bash
python3 tests/esperado.py "CLASSIFICAÇÃO XXX.xlsx"     # gera tests/esperado.json
cd tests && npm install && node rodar_testes.mjs
```
Resultado atual: **397 verificações, 0 falhas**: NCF dos 93 alunos igual a um recálculo independente em Python (erro < 10⁻¹⁴),
MG e MM do 1º semestre iguais às colunas da planilha para os 65 alunos com o semestre completo (erro < 10⁻⁹),
distribuição nas engenharias idêntica à aba Preferências para 93 de 93, e todas as regras de acesso.

## Manutenção

- **Projeto pausado:** no plano grátis o Supabase pausa o projeto depois de 1 semana sem uso. Em período de aula não acontece; nas férias, entre no painel e clique **Restore**.
- **Aluno trocou de email / errou o email:** Table Editor > alunos > edite o email e apague o `user_id` daquela linha; em Authentication > Users, apague a conta antiga.
- **Backup:** Table Editor > notas > Export to CSV, de vez em quando.
