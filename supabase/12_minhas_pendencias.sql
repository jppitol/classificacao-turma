-- =====================================================================
-- Lista das MINHAS pendências: avaliações que a turma já fez e eu não lancei.
-- Mesma regra do número "pendencias" do ranking (privado.avaliacoes_realizadas),
-- então a lista sempre tem o mesmo tamanho do aviso "faltam N notas".
-- Ordem: semestre, graduação antes de militar, ordem da disciplina, ordem da avaliação.
-- Rodar UMA vez no SQL Editor do Supabase, depois do 11.
-- =====================================================================
create function public.minhas_pendencias()
returns table (avaliacao_id integer, semestre smallint, disciplina text, avaliacao text)
language sql stable security definer set search_path = '' as $$
  select a.id, s.numero, d.nome, a.nome
  from privado.avaliacoes_realizadas r
  join public.avaliacoes a  on a.id = r.avaliacao_id
  join public.disciplinas d on d.id = a.disciplina_id
  join public.semestres s   on s.id = d.semestre_id
  where r.turma_id = privado.minha_turma_id()
    and not exists (select 1 from public.notas n
                    where n.aluno_id = privado.meu_aluno_id() and n.avaliacao_id = a.id)
  order by s.numero, d.componente, d.ordem, a.ordem
$$;

-- Só quem está logado chama (função nova nasce liberada para todos)
revoke all on function public.minhas_pendencias() from public, anon;
grant execute on function public.minhas_pendencias() to authenticated;
