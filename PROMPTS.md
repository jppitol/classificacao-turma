# Roteiro para construir o site com o Claude Code

Abra o terminal na pasta do projeto e rode `claude`. Ele lê o `CLAUDE.md` sozinho.
Mande **uma etapa por vez**. Só passe para a próxima depois de testar no navegador
(`cd web && python3 -m http.server 8000`, abrir http://localhost:8000) e fazer um commit:

```bash
git add . && git commit -m "etapa N"
```

Se algo quebrar, descreva o que você fez, o que esperava e o que apareceu (copie o erro do console:
F12 > Console). Se a etapa ficou ruim, `git checkout .` volta para o último commit.

---

### Etapa 1: esqueleto e login
> Leia o CLAUDE.md e o supabase/01_schema.sql. Crie a pasta web/ com index.html, config.js
> (com placeholders e um comentário dizendo onde achar a URL e a publishable key no painel),
> supabase.js e estilo.css. Faça a página de entrar / criar conta / esqueci a senha, e depois do
> login uma barra de navegação com as páginas do CLAUDE.md (ainda vazias) e o nome de guerra do
> usuário. Me explique em poucas linhas como o login funciona.

Teste: crie tua conta com o teu email (que tem que estar na tabela alunos), confirme pelo email,
entre, saia, use "esqueci a senha". Tente criar conta com um email que não está na lista: tem que dar erro.

### Etapa 2: minhas notas
> Faça a página "Minhas notas" conforme o CLAUDE.md.

Teste: lance uma nota, recarregue a página (tem que continuar lá), apague, digite 11 (tem que recusar),
digite 7,5 com vírgula. Confira no Supabase em Table Editor > notas.

### Etapa 3: ranking e médias
> Faça a página "Ranking" conforme o CLAUDE.md.

Teste: confira teu NCF e tua posição contra a aba "Classificação OFICIAL" da planilha (têm que ser iguais,
salvo onde a planilha tem erro: ver tests/rodar_testes.mjs).

### Etapa 4: meu desempenho
> Faça a página "Meu desempenho" com os gráficos de minha média x média da turma por disciplina.
> Antes de codar, me mostre em texto como pretende organizar a tela.

### Etapa 5: engenharias e perfil
> Faça as páginas "Engenharias" e "Perfil" conforme o CLAUDE.md.

Teste: troque a ordem das preferências e veja a "minha situação" mudar.

### Etapa 6: revisão de segurança e publicação
> Revise o projeto inteiro procurando: chave secreta no código, dado real que poderia ir pro git,
> lugar onde o front calcula média em vez de usar o banco, erro não tratado que deixaria a tela em branco.
> Rode git status --ignored e me mostre o que vai e o que não vai para o GitHub.

Depois siga o passo 11 do README.

---

### Ideias para depois
- Página de admin (só para ti) para editar vagas e pesos sem entrar no painel do Supabase.
- Gráfico da evolução da minha posição ao longo do tempo (precisa guardar histórico: pedir ao Claude Code um `05_historico.sql`).
- Aviso por email quando sair nota de corte nova.
