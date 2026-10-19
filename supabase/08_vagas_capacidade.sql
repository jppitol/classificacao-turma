-- =====================================================================
-- Vagas das engenharias como no documento oficial:
--   * Ativa: número fixo de vagas por engenharia (coluna CFG-Ativa).
--   * Reserva: fica com o que SOBRA na sala depois de todo o resto:
--       vagas reserva = capacidade - CG - OFA - ONA - destrancamentos
--                       - alunos da ATIVA que ficaram naquela engenharia
--     Então, se a ativa não lotar uma engenharia, a vaga que sobrou vai pra reserva.
-- Números de referência: DIEx nº 326-A1/GPG/DCT, de 15 JAN 26 (turma anterior).
-- Trocar pelos da nossa turma quando sair o DIEx dela (Table Editor > vagas / capacidades).
-- Rodar UMA vez no SQL Editor do Supabase, depois do 07.
-- =====================================================================

-- Capacidade da sala e vagas que saem antes da reserva, por engenharia
create table public.capacidades (
  turma_id       smallint not null references public.turmas on delete cascade,
  engenharia     text     not null references public.engenharias on update cascade,
  capacidade     integer  not null check (capacidade >= 0),
  cg             integer  not null default 0 check (cg >= 0),
  ofa            integer  not null default 0 check (ofa >= 0),
  ona            integer  not null default 0 check (ona >= 0),
  destrancamento integer  not null default 0 check (destrancamento >= 0),  -- 1º + 2º semestre
  primary key (turma_id, engenharia)
);
alter table public.capacidades enable row level security;
revoke all on public.capacidades from anon, authenticated;
grant select on public.capacidades to authenticated;
create policy "ler capacidades da minha turma" on public.capacidades
  for select to authenticated using (turma_id = privado.minha_turma_id());

insert into public.capacidades (turma_id, engenharia, capacidade, cg, ofa, ona, destrancamento)
select t.id, x.eng, x.cap, x.cg, 0, 0, x.dest
from public.turmas t,
     (values ('FC', 27, 1, 1), ('TEL', 10, 1, 1), ('ELE', 10, 1, 2), ('ELO', 10, 1, 1),
             ('QUI', 12, 1, 0), ('MEC ARM', 15, 1, 0), ('MEC AUT', 15, 0, 0), ('CART', 15, 1, 0),
             ('MAT', 8, 0, 0), ('COMP', 27, 2, 0)) as x(eng, cap, cg, dest)
where t.nome = 'XXX';

-- Ativa: vagas fixas. Reserva não usa mais a tabela vagas (é calculada).
update public.vagas v set quantidade = x.q
from (values ('FC', 8), ('TEL', 7), ('ELE', 4), ('ELO', 7), ('QUI', 7), ('MEC ARM', 6),
             ('MEC AUT', 5), ('CART', 8), ('MAT', 3), ('COMP', 14)) as x(eng, q)
where v.turma_id = (select id from public.turmas where nome = 'XXX')
  and v.segmento = 'ativa' and v.engenharia = x.eng;
delete from public.vagas where segmento = 'reserva';

-- Nomes como no documento oficial
update public.engenharias set nome = 'Engenharia de Comunicações' where sigla = 'TEL';
update public.engenharias set nome = 'Engenharia Metalúrgica'     where sigla = 'MAT';

-- Distribuição: primeiro a ativa inteira, depois a reserva com o que sobrou
create or replace function privado.alocacao(p_turma smallint)
returns table (aluno_id bigint, segmento public.segmento, ordem_classificacao integer,
               engenharia text, opcao smallint)
language plpgsql stable security definer set search_path = '' as $$
declare
  restantes jsonb;
  ocupadas_ativa jsonb := '{}';
  al record;
  pr record;
  k integer;
  seg public.segmento;
begin
  foreach seg in array array['ativa', 'reserva']::public.segmento[] loop
    if seg = 'ativa' then
      select coalesce(jsonb_object_agg(v.engenharia, v.quantidade), '{}') into restantes
        from public.vagas v where v.turma_id = p_turma and v.segmento = 'ativa';
    else
      select coalesce(jsonb_object_agg(c.engenharia, greatest(
               c.capacidade - c.cg - c.ofa - c.ona - c.destrancamento
               - coalesce((ocupadas_ativa ->> c.engenharia)::int, 0), 0)), '{}') into restantes
        from public.capacidades c where c.turma_id = p_turma;
    end if;
    k := 0;
    for al in
      select c.aluno_id from privado.classificacao c
      join public.alunos a on a.id = c.aluno_id
      where c.turma_id = p_turma and c.segmento = seg and c.ncf is not null
      order by c.ncf desc, a.nome_guerra
    loop
      k := k + 1;
      aluno_id := al.aluno_id; segmento := seg; ordem_classificacao := k;
      engenharia := null; opcao := null;
      for pr in select p.engenharia, p.ordem from public.preferencias p
                where p.aluno_id = al.aluno_id order by p.ordem loop
        if coalesce((restantes ->> pr.engenharia)::int, 0) > 0 then
          restantes := jsonb_set(restantes, array[pr.engenharia],
                                 to_jsonb((restantes ->> pr.engenharia)::int - 1));
          if seg = 'ativa' then
            ocupadas_ativa := jsonb_set(ocupadas_ativa, array[pr.engenharia],
                                        to_jsonb(coalesce((ocupadas_ativa ->> pr.engenharia)::int, 0) + 1));
          end if;
          engenharia := pr.engenharia; opcao := pr.ordem;
          exit;
        end if;
      end loop;
      return next;
    end loop;
  end loop;
end $$;

-- Resumo: mesmas colunas de antes (o site não muda). Na reserva, "vagas" = o que sobrou.
create or replace function public.resumo_engenharias()
returns table (segmento public.segmento, engenharia text, vagas integer,
               ocupadas bigint, ncf_corte numeric)
language sql stable security definer set search_path = '' as $$
  with x as (
    select * from privado.alocacao(privado.minha_turma_id())
  ), ativa_ocupadas as (
    select x.engenharia, count(*) as n from x
    where x.segmento = 'ativa' and x.engenharia is not null group by x.engenharia
  ), vg as (
    select v.segmento, v.engenharia, v.quantidade
    from public.vagas v
    where v.turma_id = privado.minha_turma_id() and v.segmento = 'ativa'
    union all
    select 'reserva'::public.segmento, c.engenharia,
           greatest(c.capacidade - c.cg - c.ofa - c.ona - c.destrancamento - coalesce(o.n, 0), 0)::integer
    from public.capacidades c
    left join ativa_ocupadas o on o.engenharia = c.engenharia
    where c.turma_id = privado.minha_turma_id()
  )
  select vg.segmento, vg.engenharia, vg.quantidade,
         count(x.aluno_id),
         round(min(c.ncf), 4)
  from vg
  left join x on x.segmento = vg.segmento and x.engenharia = vg.engenharia
  left join privado.classificacao c on c.aluno_id = x.aluno_id
  group by vg.segmento, vg.engenharia, vg.quantidade
  order by vg.segmento, vg.engenharia
$$;
