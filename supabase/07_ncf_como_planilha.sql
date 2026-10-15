-- =====================================================================
-- NCF igual ao da planilha: avaliação sem nota conta como ZERO.
--   MG = soma(peso efetivo * nota) / soma dos pesos de TODAS as avaliações do curso
--   (idem MM). Com 4 semestres de peso 1, é exatamente
--   0,25*sem1 + 0,25*sem2 + 0,25*sem3 + 0,25*sem4, com zero no que ainda não saiu.
--   NCF = peso_graduacao * MG + peso_militar * MM.
-- Antes, a média era feita só sobre o que já tinha sido lançado.
-- Aluno sem nenhuma nota continua sem NCF (fica no fim do ranking, sem posição).
-- Rodar UMA vez no SQL Editor do Supabase, depois do 06.
-- =====================================================================
create or replace view privado.classificacao as
with total as (            -- peso de todas as avaliações do curso, por componente
  select turma_id, componente, sum(w) as w
  from privado.pesos_efetivos
  where w > 0
  group by turma_id, componente
), somas as (
  select al.id as aluno_id, al.turma_id, al.segmento,
         count(p.avaliacao_id) as lancadas,
         coalesce(sum(p.w * n.valor) filter (where p.componente = 'graduacao'), 0) as soma_g,
         coalesce(sum(p.w * n.valor) filter (where p.componente = 'militar'), 0)   as soma_m
  from public.alunos al
  left join public.notas n on n.aluno_id = al.id
  left join privado.pesos_efetivos p on p.avaliacao_id = n.avaliacao_id and p.w > 0
  group by al.id
), medias as (
  select s.aluno_id, s.turma_id, s.segmento,
         case when s.lancadas > 0 then s.soma_g / tg.w end as mg,
         case when s.lancadas > 0 then s.soma_m / tm.w end as mm
  from somas s
  join total tg on tg.turma_id = s.turma_id and tg.componente = 'graduacao'
  join total tm on tm.turma_id = s.turma_id and tm.componente = 'militar'
), ncf as (
  select m.*, pn.peso_graduacao * m.mg + pn.peso_militar * m.mm as ncf
  from medias m
  join public.pesos_ncf pn on pn.turma_id = m.turma_id and pn.segmento = m.segmento
), pend as (               -- igual antes: avaliações que a turma já fez e o aluno não lançou
  select al.id as aluno_id, count(*) filter (where n.aluno_id is null) as pendencias
  from public.alunos al
  join privado.avaliacoes_realizadas r on r.turma_id = al.turma_id
  left join public.notas n on n.aluno_id = al.id and n.avaliacao_id = r.avaliacao_id
  group by al.id
)
select ncf.aluno_id, ncf.turma_id, ncf.segmento, ncf.mg, ncf.mm, ncf.ncf,
       coalesce(pend.pendencias, 0) as pendencias,
       case when ncf.ncf is not null then
         rank() over (partition by ncf.turma_id, ncf.segmento, ncf.ncf is null order by ncf.ncf desc)
       end as posicao
from ncf
left join pend on pend.aluno_id = ncf.aluno_id;
