-- =====================================================================
-- Fila de espera de cada engenharia (como as listas "EM ESPERA" da aba
-- "Turmas (ATIVA)" da planilha): quem preferia essa engenharia à que pegou,
-- na ordem da classificação. Mesma regra da fila em minha_engenharia().
-- Rodar UMA vez no SQL Editor do Supabase, depois do 08.
-- =====================================================================
create function public.filas_espera()
returns table (segmento public.segmento, engenharia text, posicao bigint,
               ordem_classificacao integer, nome text, opcao smallint, sou_eu boolean)
language sql stable security definer set search_path = '' as $$
  with x as (
    select * from privado.alocacao(privado.minha_turma_id())
  ), espera as (          -- (aluno, engenharia) para cada opção melhor que a obtida
    select x.aluno_id, x.segmento, x.ordem_classificacao, p.engenharia, p.ordem
    from x join public.preferencias p on p.aluno_id = x.aluno_id
    where x.opcao is null or p.ordem < x.opcao
  )
  select e.segmento, e.engenharia,
         row_number() over (partition by e.segmento, e.engenharia order by e.ordem_classificacao),
         e.ordem_classificacao, a.nome_guerra, e.ordem,
         a.id = privado.meu_aluno_id()
  from espera e
  join public.alunos a on a.id = e.aluno_id
  order by e.segmento, e.engenharia, e.ordem_classificacao
$$;

-- Só quem está logado chama (função nova nasce liberada para todos)
revoke all on function public.filas_espera() from public, anon;
grant execute on function public.filas_espera() to authenticated;
