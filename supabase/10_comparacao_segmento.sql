-- =====================================================================
-- Comparação também com o MEU segmento (ativa ou reserva), além da turma toda.
-- meu_desempenho() e estatisticas_avaliacoes() ganham colunas no fim
-- (as antigas continuam iguais, na mesma ordem):
--   meu_desempenho:          media_segmento, diferenca_segmento, minha_posicao_segmento, alunos_segmento
--   estatisticas_avaliacoes: media_segmento, alunos_segmento, minha_posicao_segmento
-- Mudar as colunas de uma função exige apagar e criar de novo (e refazer as permissões).
-- Rodar UMA vez no SQL Editor do Supabase, depois do 09.
-- =====================================================================

drop function public.meu_desempenho();
create function public.meu_desempenho()
returns table (semestre smallint, disciplina_id integer, disciplina text, componente public.componente,
               minha_media numeric, media_turma numeric, diferenca numeric,
               minha_posicao bigint, alunos_com_nota bigint,
               media_segmento numeric, diferenca_segmento numeric,
               minha_posicao_segmento bigint, alunos_segmento bigint)
language sql stable security definer set search_path = '' as $$
  with turma as (
    select md.aluno_id, md.disciplina_id, md.media,
           rank() over (partition by md.disciplina_id order by md.media desc) as pos,
           avg(md.media) over (partition by md.disciplina_id) as media_turma,
           count(*)      over (partition by md.disciplina_id) as n,
           -- o mesmo, só entre os alunos do mesmo segmento
           rank() over (partition by md.disciplina_id, a.segmento order by md.media desc) as pos_seg,
           avg(md.media) over (partition by md.disciplina_id, a.segmento) as media_seg,
           count(*)      over (partition by md.disciplina_id, a.segmento) as n_seg
    from privado.medias_disciplina md
    join public.alunos a on a.id = md.aluno_id
    where a.turma_id = privado.minha_turma_id()
  )
  select s.numero, d.id, d.nome, d.componente,
         round(t.media, 4), round(t.media_turma, 4), round(t.media - t.media_turma, 4),
         t.pos, t.n,
         round(t.media_seg, 4), round(t.media - t.media_seg, 4),
         t.pos_seg, t.n_seg
  from turma t
  join public.disciplinas d on d.id = t.disciplina_id
  join public.semestres s on s.id = d.semestre_id
  where t.aluno_id = privado.meu_aluno_id()
  order by s.numero, d.componente, d.ordem
$$;

drop function public.estatisticas_avaliacoes();
create function public.estatisticas_avaliacoes()
returns table (avaliacao_id integer, minha_nota numeric, media numeric, desvio numeric,
               minima numeric, maxima numeric, alunos bigint, minha_posicao bigint,
               media_segmento numeric, alunos_segmento bigint, minha_posicao_segmento bigint)
language sql stable security definer set search_path = '' as $$
  with eu as (
    select id, segmento from public.alunos where id = privado.meu_aluno_id()
  ), t as (
    select n.avaliacao_id, n.aluno_id, n.valor, a.segmento,
           rank() over (partition by n.avaliacao_id order by n.valor desc) as pos,
           rank() over (partition by n.avaliacao_id, a.segmento order by n.valor desc) as pos_seg
    from public.notas n
    join public.alunos a on a.id = n.aluno_id
    where a.turma_id = privado.minha_turma_id()
  )
  select t.avaliacao_id,
         max(t.valor) filter (where t.aluno_id = eu.id),
         round(avg(t.valor), 4), round(stddev_samp(t.valor), 4),
         min(t.valor), max(t.valor), count(*),
         max(t.pos) filter (where t.aluno_id = eu.id),
         round(avg(t.valor) filter (where t.segmento = eu.segmento), 4),
         count(*) filter (where t.segmento = eu.segmento),
         max(t.pos_seg) filter (where t.aluno_id = eu.id)
  from t cross join eu
  group by t.avaliacao_id
$$;

-- Permissões como antes: só quem está logado chama
revoke all on function public.meu_desempenho(), public.estatisticas_avaliacoes() from public, anon;
grant execute on function public.meu_desempenho(), public.estatisticas_avaliacoes() to authenticated;
