# Classificação da Turma XXX (IME)

Site onde cada aluno da turma lança as próprias notas e vê ranking, médias da turma, feedback por
disciplina e a simulação da escolha de engenharia. Substitui uma planilha do Google.

O dono do projeto sabe o básico de HTML/CSS/JS e nunca mexeu com banco. Explique em português,
de forma curta, o que cada mudança faz. Prefira código simples e legível a abstrações espertas.

## Stack (não trocar sem perguntar)

- **Front:** HTML + CSS + JavaScript puro (ES modules), sem build, sem framework, sem npm no site.
  Tudo dentro de `web/`. Roda com `cd web && python3 -m http.server 8000`.
- **Bibliotecas via CDN, versão fixa:**
  - `import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/+esm'`
  - Chart.js 4.5.1 (`https://cdn.jsdelivr.net/npm/chart.js@4.5.1/+esm`) só onde houver gráfico.
- **Backend:** Supabase (Postgres + Auth). O banco já está pronto em `supabase/01_schema.sql`.
- **Deploy:** GitHub Pages via `.github/workflows/pages.yml` (publica a pasta `web/`).

## Regras invioláveis

1. **Nunca** coloque a secret key (`sb_secret_...`), service_role ou senha do banco no código.
   No front vai só `SUPABASE_URL` e a publishable key, em `web/config.js`.
2. **Nunca** versione dados reais: `*.xlsx`, `*.csv`, `supabase/03_*`, `supabase/04_*`, `tests/esperado.json` (já no `.gitignore`; confira antes de qualquer commit).
3. **Não reimplemente cálculos no JavaScript.** Média, NCF, ranking, posições e distribuição vêm
   prontos das funções do banco. O front só exibe. (A única conta permitida no front é a prévia
   da média da disciplina enquanto o aluno digita, e ela deve ser descartada ao salvar.)
4. Mudança no banco = arquivo novo `supabase/05_<descricao>.sql` (nunca editar os já rodados),
   e rodar `cd tests && node rodar_testes.mjs` antes de dizer que terminou.
5. Interface em português, mobile first (a maioria vai abrir no celular), funcionando no tema claro e escuro.
6. Não use travessão (—) em textos da interface.

## Banco: o que o front pode usar

O usuário logado só enxerga os próprios dados nas tabelas; tudo que envolve a turma vem por RPC.

### Tabelas (leitura com `supabase.from(...)`)
| tabela | colunas | acesso |
|---|---|---|
| `alunos` | id, turma_id, nome_guerra, segmento ('ativa'/'reserva'), email, user_id | só a própria linha, somente leitura |
| `semestres` | id, turma_id, numero (1 a 4), peso | leitura |
| `disciplinas` | id, semestre_id, nome, componente ('graduacao'/'militar'), peso, ordem | leitura |
| `avaliacoes` | id, disciplina_id, nome, peso, ordem | leitura |
| `notas` | aluno_id, avaliacao_id, valor (0 a 10), atualizado_em | só as próprias: select/insert/update/delete |
| `engenharias` | sigla, nome | leitura |
| `vagas` | turma_id, segmento, engenharia, quantidade | leitura (só linhas da ativa; a reserva é calculada) |
| `capacidades` | turma_id, engenharia, capacidade, cg, ofa, ona, destrancamento | leitura |
| `preferencias` | aluno_id, engenharia, ordem | só as próprias (para gravar use a RPC) |

Disciplina com `peso = 0` ou avaliação com `peso = 0` (TAF do 1º semestre, Abdominal) é lançada mas não conta: mostre com a etiqueta "não conta na média".

Lançar/corrigir nota: `supabase.from('notas').upsert({ aluno_id, avaliacao_id, valor })`.
Apagar (campo esvaziado): `delete().match({ aluno_id, avaliacao_id })`. O `aluno_id` vem de `alunos` (a única linha visível).

### RPCs (`supabase.rpc('nome')`, sem parâmetros salvo indicado)
| função | retorna (uma linha por) |
|---|---|
| `ranking` | aluno da turma: posicao, nome, segmento, media_graduacao, media_militar, ncf, pendencias, sou_eu |
| `medias_turma` | segmento ('ativa', 'reserva' e null = turma toda): alunos, media_graduacao, media_militar, media_ncf |
| `meu_desempenho` | disciplina com nota minha: semestre, disciplina_id, disciplina, componente, minha_media, media_turma, diferenca, minha_posicao, alunos_com_nota, e o mesmo no meu segmento: media_segmento, diferenca_segmento, minha_posicao_segmento, alunos_segmento |
| `estatisticas_avaliacoes` | avaliação com alguma nota na turma: avaliacao_id, minha_nota, media, desvio, minima, maxima, alunos, minha_posicao, media_segmento, alunos_segmento, minha_posicao_segmento |
| `distribuicao` | aluno: segmento, ordem_classificacao, nome, engenharia (null = sem vaga nas opções), opcao, sou_eu |
| `resumo_engenharias` | (segmento, engenharia): vagas (na reserva, o que sobrou da sala), ocupadas, ncf_corte (NCF do último que entrou) |
| `minha_engenharia` | minha opção, em ordem: opcao, engenharia, situacao ('na vaga' / 'espera' / 'abaixo'), posicao_espera, ncf_corte, meu_ncf, falta |
| `filas_espera` | (segmento, engenharia, aluno esperando): posicao na fila, ordem_classificacao, nome, opcao (que opção essa engenharia é para ele), sou_eu |
| `salvar_preferencias({ lista: ['COMP','ELO',...] })` | grava a lista inteira de uma vez (atômico) |

Média da disciplina (supabase/11_media_disciplina_com_zero.sql): avaliação que alguém da turma já lançou e o
aluno não lançou conta zero (como na planilha; recuperação = só a VF). As que ninguém fez ficam de fora. A prévia
em Minhas notas segue a mesma regra.

Comparações com a média da turma (Minhas notas e Meu desempenho) mostram também a do segmento do
aluno (ativa ou reserva), com as colunas `_segmento` (supabase/10_comparacao_segmento.sql). O Ranking não muda.

`pendencias` = quantas avaliações já feitas pela turma o aluno ainda não lançou. Mostrar como aviso
("faltam 3 notas") porque nota não lançada conta como zero no NCF.

Vagas das engenharias (supabase/08_vagas_capacidade.sql):
- **Ativa:** vagas fixas por engenharia, na tabela `vagas`.
- **Reserva:** fica com o que sobra da sala: `capacidade - cg - ofa - ona - destrancamento - alunos da ativa
  que ficaram naquela engenharia` (tabela `capacidades`). Por isso as vagas da reserva mudam conforme a ativa escolhe.
- A distribuição roda a ativa inteira primeiro e depois a reserva. Na ordem da classificação, cada aluno
  fica com a primeira opção que ainda tem vaga.
- Números de referência: DIEx nº 326-A1/GPG/DCT, de 15 JAN 26 (turma anterior). Trocar pelos da turma
  quando sair o DIEx dela (Table Editor > vagas / capacidades).

NCF igual ao da planilha: MG e MM dividem pelo peso de **todas** as avaliações do curso, então o que
ainda não aconteceu conta como zero (supabase/07_ncf_como_planilha.sql).

### Cadastro e login (Supabase Auth, email + senha)
- Só emails presentes em `alunos.email` conseguem criar conta (hook no banco). Mensagem de erro do
  hook vem em `error.message`: mostre ela.
- `signUp({ email, password, options: { emailRedirectTo: <url da página inicial> } })` envia email de confirmação.
- Esqueci a senha: `resetPasswordForEmail(email, { redirectTo })` e, no evento `PASSWORD_RECOVERY`
  de `onAuthStateChange`, mostrar formulário de nova senha com `updateUser({ password })`.
- Logado mas sem linha em `alunos` (não deveria acontecer): mostrar "conta não vinculada, fale com o administrador".

## Páginas

1. **Entrar / Criar conta / Esqueci a senha** (uma página com abas).
2. **Minhas notas:** abas por semestre; para cada disciplina, campos das avaliações em ordem,
   prévia da média, média da turma ao lado (de `estatisticas_avaliacoes`). Salva ao sair do campo,
   com indicação "salvo". Aceita vírgula ou ponto; valida 0 a 10.
3. **Ranking:** abas Ativa / Reserva; minha linha destacada e com botão "ir para mim";
   cartão com médias da turma; aviso de pendências.
4. **Meu desempenho:** para cada disciplina, minha média x média da turma (barras lado a lado ou
   barra de diferença, verde acima / vermelho abaixo), posição na disciplina; detalhe por avaliação.
5. **Engenharias:** editar a lista de 10 preferências (botões subir/descer, funciona no celular);
   "minha situação" (em qual entro hoje, em qual fila de espera estou e quanto falta de NCF);
   tabela de vagas e notas de corte; "Turmas" como na planilha: um bloco por engenharia com
   quem está na vaga e quem está na fila de espera (`distribuicao` + `filas_espera`).
6. **Perfil:** nome de guerra, segmento, email, trocar a senha, sair.

## Estrutura sugerida de `web/`
```
web/
├── index.html        login + navegação
├── config.js         SUPABASE_URL e SUPABASE_PUBLISHABLE_KEY
├── supabase.js       cria e exporta o client
├── estilo.css
└── <uma página .html + .js por item acima>
```

## Testes
- Banco: `cd tests && npm install && node rodar_testes.mjs` (precisa de `tests/esperado.json`, gerado por `python3 tests/esperado.py PLANILHA.xlsx`).
- Front: testar no navegador com pelo menos duas contas, conferindo que uma não vê/edita as notas da outra.
