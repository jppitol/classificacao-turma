-- =====================================================================
-- Média da disciplina: avaliação que a turma JÁ FEZ (alguém lançou nota nela)
-- e que o aluno não lançou conta como ZERO, como na planilha.
-- Ex.: quem ficou de recuperação tem só a VF na planilha (o resto zerado), então
-- fica com ((0+0)/2 + 0 + 2*VF)/4 = VF/2, e não com média = VF.
-- Avaliação que ninguém fez ainda continua fora da conta.
-- Só vale para disciplinas em que o aluno tem pelo menos uma nota.
-- Usada por meu_desempenho() (Minhas notas e Meu desempenho). O NCF não muda.
-- Rodar UMA vez no SQL Editor do Supabase, depois do 10.
-- =====================================================================
create or replace view privado.medias_disciplina as
with feitas as (       -- avaliações que alguém da turma já lançou
  select distinct al.turma_id, n.avaliacao_id
  from public.notas n
  join public.alunos al on al.id = n.aluno_id
), cursadas as (       -- (aluno, disciplina) em que o aluno tem pelo menos uma nota
  select distinct n.aluno_id, a.disciplina_id
  from public.notas n
  join public.avaliacoes a on a.id = n.avaliacao_id
)
select c.aluno_id, c.disciplina_id,
       sum(a.peso * coalesce(n.valor, 0)) / nullif(sum(a.peso), 0) as media
from cursadas c
join public.alunos al     on al.id = c.aluno_id
join public.avaliacoes a  on a.disciplina_id = c.disciplina_id
join feitas f             on f.avaliacao_id = a.id and f.turma_id = al.turma_id
left join public.notas n  on n.aluno_id = c.aluno_id and n.avaliacao_id = a.id
group by c.aluno_id, c.disciplina_id;
