-- =====================================================================
-- Remove a opção "ocultar meu nome no ranking": todo mundo aparece com nome,
-- como na planilha. Rodar UMA vez no SQL Editor do Supabase, depois do 05.
-- =====================================================================

-- Ranking e distribuição passam a mostrar sempre o nome de guerra
-- (mesmas colunas de antes, então o site não precisa mudar nada nelas)
create or replace function public.ranking()
returns table (posicao bigint, nome text, segmento public.segmento,
               media_graduacao numeric, media_militar numeric, ncf numeric,
               pendencias bigint, sou_eu boolean)
language sql stable security definer set search_path = '' as $$
  select c.posicao, a.nome_guerra,
         c.segmento, round(c.mg, 4), round(c.mm, 4), round(c.ncf, 4), c.pendencias,
         a.id = privado.meu_aluno_id()
  from privado.classificacao c
  join public.alunos a on a.id = c.aluno_id
  where c.turma_id = privado.minha_turma_id()
  order by c.segmento, c.posicao nulls last, a.nome_guerra
$$;

create or replace function public.distribuicao()
returns table (segmento public.segmento, ordem_classificacao integer, nome text,
               engenharia text, opcao smallint, sou_eu boolean)
language sql stable security definer set search_path = '' as $$
  select x.segmento, x.ordem_classificacao, a.nome_guerra,
         x.engenharia, x.opcao, a.id = privado.meu_aluno_id()
  from privado.alocacao(privado.minha_turma_id()) x
  join public.alunos a on a.id = x.aluno_id
  order by x.segmento, x.ordem_classificacao
$$;

-- O aluno só podia editar essa coluna; sem ela, o próprio cadastro vira somente leitura
drop policy "editar meu cadastro" on public.alunos;
alter table public.alunos drop column ocultar_no_ranking;
