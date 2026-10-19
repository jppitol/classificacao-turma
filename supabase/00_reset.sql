-- APAGA TUDO deste projeto (tabelas, dados, funções) para recomeçar do 01_schema.sql.
-- Não mexe nas contas de usuário (Authentication > Users); apague-as lá se quiser.
drop trigger if exists vincular_aluno on auth.users;
drop schema if exists privado cascade;
drop function if exists public.ranking(), public.medias_turma(), public.meu_desempenho(),
  public.estatisticas_avaliacoes(), public.distribuicao(), public.resumo_engenharias(),
  public.minha_engenharia(), public.salvar_preferencias(text[]), public.hook_somente_alunos(jsonb) cascade;
drop table if exists public.capacidades, public.preferencias, public.vagas, public.engenharias, public.notas,
  public.avaliacoes, public.disciplinas, public.semestres, public.alunos, public.pesos_ncf,
  public.turmas cascade;
drop type if exists public.componente, public.segmento cascade;
