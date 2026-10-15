-- =====================================================================
-- Classificação da Turma: schema completo
-- Rodar UMA vez no SQL Editor do Supabase (projeto novo), antes do 02_seed.
-- =====================================================================

-- Schema "privado": cálculos internos. NÃO é exposto pela API do Supabase
-- (a API só enxerga o schema public), então ninguém consulta isso direto
-- do navegador. O site só acessa o que as funções do public devolvem.
create schema if not exists privado;
revoke all on schema privado from public;

create type public.segmento   as enum ('ativa', 'reserva');
create type public.componente as enum ('graduacao', 'militar');

-- ---------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------
create table public.turmas (
  id   smallint generated always as identity primary key,
  nome text not null unique
);

-- NCF = peso_graduacao * MG + peso_militar * MM, por segmento
create table public.pesos_ncf (
  turma_id       smallint not null references public.turmas on delete cascade,
  segmento       public.segmento not null,
  peso_graduacao numeric not null check (peso_graduacao >= 0),
  peso_militar   numeric not null check (peso_militar >= 0),
  primary key (turma_id, segmento)
);

-- Lista oficial da turma. O cadastro no site só é aceito para emails daqui.
create table public.alunos (
  id                 bigint generated always as identity primary key,
  turma_id           smallint not null references public.turmas on delete cascade,
  nome_guerra        text not null,
  segmento           public.segmento not null,
  email              text unique check (email = lower(email)),
  user_id            uuid unique references auth.users (id) on delete set null,
  ocultar_no_ranking boolean not null default false,
  unique (turma_id, nome_guerra)
);

create table public.semestres (
  id       smallint generated always as identity primary key,
  turma_id smallint not null references public.turmas on delete cascade,
  numero   smallint not null check (numero between 1 and 4),
  peso     numeric not null default 1 check (peso >= 0),   -- peso do semestre em MG/MM
  unique (turma_id, numero)
);

create table public.disciplinas (
  id          integer generated always as identity primary key,
  semestre_id smallint not null references public.semestres on delete cascade,
  nome        text not null,
  componente  public.componente not null,
  peso        numeric not null default 1 check (peso >= 0), -- peso dentro do semestre/componente
  ordem       smallint not null default 0,
  unique (semestre_id, nome)
);

create table public.avaliacoes (
  id            integer generated always as identity primary key,
  disciplina_id integer not null references public.disciplinas on delete cascade,
  nome          text not null,
  peso          numeric not null check (peso >= 0),          -- peso dentro da disciplina
  ordem         smallint not null default 0,
  unique (disciplina_id, nome)
);

create table public.notas (
  aluno_id      bigint  not null references public.alunos on delete cascade,
  avaliacao_id  integer not null references public.avaliacoes on delete cascade,
  valor         numeric not null check (valor between 0 and 10),
  atualizado_em timestamptz not null default now(),
  primary key (aluno_id, avaliacao_id)
);
create index on public.notas (avaliacao_id);

create table public.engenharias (
  sigla text primary key,
  nome  text not null
);

create table public.vagas (
  turma_id   smallint not null references public.turmas on delete cascade,
  segmento   public.segmento not null,
  engenharia text not null references public.engenharias on update cascade,
  quantidade integer not null check (quantidade >= 0),
  primary key (turma_id, segmento, engenharia)
);

-- ordem 1 = primeira opção
create table public.preferencias (
  aluno_id   bigint not null references public.alunos on delete cascade,
  engenharia text   not null references public.engenharias on update cascade,
  ordem      smallint not null check (ordem >= 1),
  primary key (aluno_id, engenharia),
  unique (aluno_id, ordem) deferrable initially deferred  -- permite trocar a ordem numa transação
);

create function privado.carimbar_atualizacao() returns trigger
language plpgsql set search_path = '' as $$
begin new.atualizado_em := now(); return new; end $$;

create trigger notas_atualizado_em before update on public.notas
for each row execute function privado.carimbar_atualizacao();

-- ---------------------------------------------------------------------
-- Quem é o usuário logado
-- ---------------------------------------------------------------------
create function privado.meu_aluno_id() returns bigint
language sql stable security definer set search_path = '' as $$
  select id from public.alunos where user_id = auth.uid()
$$;

create function privado.minha_turma_id() returns smallint
language sql stable security definer set search_path = '' as $$
  select turma_id from public.alunos where user_id = auth.uid()
$$;

grant usage on schema privado to authenticated;
grant execute on function privado.meu_aluno_id(), privado.minha_turma_id() to authenticated;

-- ---------------------------------------------------------------------
-- Cálculo (tudo dentro de "privado")
-- ---------------------------------------------------------------------
-- Peso efetivo de cada avaliação na média do componente (graduação ou militar):
--   w = peso_semestre * (peso_disc / soma peso_disc do semestre+componente)
--                     * (peso_aval / soma peso_aval da disciplina)
-- Média do componente = soma(w * nota) / soma(w), somando SÓ as notas lançadas.
-- Com tudo lançado, isso é exatamente a fórmula da planilha
-- (média ponderada da disciplina -> média simples das disciplinas -> 0.25 por semestre).
-- Com o semestre em andamento, cada avaliação ainda não feita simplesmente
-- não entra (mesma ideia das colunas "relativo" da planilha).
create view privado.pesos_efetivos as
with d as (
  select d.id, d.semestre_id, d.componente, s.turma_id, s.numero as semestre,
         s.peso * coalesce(d.peso / nullif(sum(d.peso) over (partition by d.semestre_id, d.componente), 0), 0) as fd
  from public.disciplinas d
  join public.semestres s on s.id = d.semestre_id
), a as (
  select a.id, a.disciplina_id,
         coalesce(a.peso / nullif(sum(a.peso) over (partition by a.disciplina_id), 0), 0) as fa
  from public.avaliacoes a
)
select a.id as avaliacao_id, a.disciplina_id, d.semestre_id, d.semestre, d.turma_id, d.componente,
       d.fd * a.fa as w
from a join d on d.id = a.disciplina_id;

-- Avaliação "realizada" = alguém da turma já lançou nota nela.
create view privado.avaliacoes_realizadas as
select distinct p.avaliacao_id, p.turma_id
from privado.pesos_efetivos p
join public.notas n on n.avaliacao_id = p.avaliacao_id
where p.w > 0;

create view privado.classificacao as
with medias as (
  select al.id as aluno_id, al.turma_id, al.segmento,
         sum(p.w * n.valor) filter (where p.componente = 'graduacao')
           / nullif(sum(p.w) filter (where p.componente = 'graduacao'), 0) as mg,
         sum(p.w * n.valor) filter (where p.componente = 'militar')
           / nullif(sum(p.w) filter (where p.componente = 'militar'), 0) as mm
  from public.alunos al
  left join public.notas n on n.aluno_id = al.id
  left join privado.pesos_efetivos p on p.avaliacao_id = n.avaliacao_id and p.w > 0
  group by al.id
), pend as (
  select al.id as aluno_id, count(*) filter (where n.aluno_id is null) as pendencias
  from public.alunos al
  join privado.avaliacoes_realizadas r on r.turma_id = al.turma_id
  left join public.notas n on n.aluno_id = al.id and n.avaliacao_id = r.avaliacao_id
  group by al.id
), ncf as (
  select m.*,
         -- se um dos componentes ainda não tem nota, o NCF parcial usa só o outro
         (coalesce(pn.peso_graduacao * m.mg, 0) + coalesce(pn.peso_militar * m.mm, 0))
           / nullif(case when m.mg is not null then pn.peso_graduacao else 0 end
                  + case when m.mm is not null then pn.peso_militar   else 0 end, 0) as ncf
  from medias m
  join public.pesos_ncf pn on pn.turma_id = m.turma_id and pn.segmento = m.segmento
)
select ncf.aluno_id, ncf.turma_id, ncf.segmento, ncf.mg, ncf.mm, ncf.ncf,
       coalesce(pend.pendencias, 0) as pendencias,
       case when ncf.ncf is not null then
         rank() over (partition by ncf.turma_id, ncf.segmento, ncf.ncf is null order by ncf.ncf desc)
       end as posicao
from ncf
left join pend on pend.aluno_id = ncf.aluno_id;

-- Média de cada aluno em cada disciplina (só com as avaliações lançadas)
create view privado.medias_disciplina as
select n.aluno_id, a.disciplina_id,
       sum(a.peso * n.valor) / nullif(sum(a.peso), 0) as media
from public.notas n
join public.avaliacoes a on a.id = n.avaliacao_id
group by n.aluno_id, a.disciplina_id;

-- Distribuição nas engenharias (escolha serial, igual à aba "Preferências"):
-- na ordem da classificação, cada aluno fica com a primeira opção que ainda
-- tem vaga. Empate de NCF: ordem alfabética do nome de guerra.
create function privado.alocacao(p_turma smallint)
returns table (aluno_id bigint, segmento public.segmento, ordem_classificacao integer,
               engenharia text, opcao smallint)
language plpgsql stable security definer set search_path = '' as $$
declare
  restantes jsonb;
  al record;
  pr record;
  k integer;
  seg public.segmento;
begin
  foreach seg in array enum_range(null::public.segmento) loop
    select coalesce(jsonb_object_agg(v.engenharia, v.quantidade), '{}')
      into restantes
      from public.vagas v where v.turma_id = p_turma and v.segmento = seg;
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
          engenharia := pr.engenharia; opcao := pr.ordem;
          exit;
        end if;
      end loop;
      return next;
    end loop;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Funções que o site chama (supabase.rpc('nome')). Sempre restritas à
-- turma de quem está logado; quem não está na lista recebe vazio.
-- ---------------------------------------------------------------------

-- Ranking por segmento. Quem marcou "ocultar" aparece sem nome para os outros.
create function public.ranking()
returns table (posicao bigint, nome text, segmento public.segmento,
               media_graduacao numeric, media_militar numeric, ncf numeric,
               pendencias bigint, sou_eu boolean)
language sql stable security definer set search_path = '' as $$
  select c.posicao,
         case when a.ocultar_no_ranking and a.id is distinct from privado.meu_aluno_id()
              then null else a.nome_guerra end,
         c.segmento, round(c.mg, 4), round(c.mm, 4), round(c.ncf, 4), c.pendencias,
         a.id = privado.meu_aluno_id()
  from privado.classificacao c
  join public.alunos a on a.id = c.aluno_id
  where c.turma_id = privado.minha_turma_id()
  order by c.segmento, c.posicao nulls last, a.nome_guerra
$$;

-- Médias da turma (por segmento e geral)
create function public.medias_turma()
returns table (segmento public.segmento, alunos bigint,
               media_graduacao numeric, media_militar numeric, media_ncf numeric)
language sql stable security definer set search_path = '' as $$
  select c.segmento, count(c.ncf), round(avg(c.mg), 4), round(avg(c.mm), 4), round(avg(c.ncf), 4)
  from privado.classificacao c
  where c.turma_id = privado.minha_turma_id()
  group by rollup (c.segmento)        -- linha com segmento = null é a turma toda
  order by c.segmento nulls last
$$;

-- Feedback por disciplina: minha média x média da turma
create function public.meu_desempenho()
returns table (semestre smallint, disciplina_id integer, disciplina text, componente public.componente,
               minha_media numeric, media_turma numeric, diferenca numeric,
               minha_posicao bigint, alunos_com_nota bigint)
language sql stable security definer set search_path = '' as $$
  with turma as (
    select md.aluno_id, md.disciplina_id, md.media,
           rank() over (partition by md.disciplina_id order by md.media desc) as pos,
           avg(md.media) over (partition by md.disciplina_id) as media_turma,
           count(*)      over (partition by md.disciplina_id) as n
    from privado.medias_disciplina md
    join public.alunos a on a.id = md.aluno_id
    where a.turma_id = privado.minha_turma_id()
  )
  select s.numero, d.id, d.nome, d.componente,
         round(t.media, 4), round(t.media_turma, 4), round(t.media - t.media_turma, 4),
         t.pos, t.n
  from turma t
  join public.disciplinas d on d.id = t.disciplina_id
  join public.semestres s on s.id = d.semestre_id
  where t.aluno_id = privado.meu_aluno_id()
  order by s.numero, d.componente, d.ordem
$$;

-- Estatística de cada avaliação + minha nota (para gráficos)
create function public.estatisticas_avaliacoes()
returns table (avaliacao_id integer, minha_nota numeric, media numeric, desvio numeric,
               minima numeric, maxima numeric, alunos bigint, minha_posicao bigint)
language sql stable security definer set search_path = '' as $$
  with t as (
    select n.avaliacao_id, n.aluno_id, n.valor,
           rank() over (partition by n.avaliacao_id order by n.valor desc) as pos
    from public.notas n
    join public.alunos a on a.id = n.aluno_id
    where a.turma_id = privado.minha_turma_id()
  )
  select t.avaliacao_id,
         max(t.valor) filter (where t.aluno_id = privado.meu_aluno_id()),
         round(avg(t.valor), 4), round(stddev_samp(t.valor), 4),
         min(t.valor), max(t.valor), count(*),
         max(t.pos) filter (where t.aluno_id = privado.meu_aluno_id())
  from t group by t.avaliacao_id
$$;

-- Simulação da distribuição nas engenharias com as notas e preferências atuais
create function public.distribuicao()
returns table (segmento public.segmento, ordem_classificacao integer, nome text,
               engenharia text, opcao smallint, sou_eu boolean)
language sql stable security definer set search_path = '' as $$
  select x.segmento, x.ordem_classificacao,
         case when a.ocultar_no_ranking and a.id is distinct from privado.meu_aluno_id()
              then null else a.nome_guerra end,
         x.engenharia, x.opcao, a.id = privado.meu_aluno_id()
  from privado.alocacao(privado.minha_turma_id()) x
  join public.alunos a on a.id = x.aluno_id
  order by x.segmento, x.ordem_classificacao
$$;

-- Resumo por engenharia: vagas, ocupação e NCF de corte (último que entrou)
create function public.resumo_engenharias()
returns table (segmento public.segmento, engenharia text, vagas integer,
               ocupadas bigint, ncf_corte numeric)
language sql stable security definer set search_path = '' as $$
  with x as (select * from privado.alocacao(privado.minha_turma_id()))
  select v.segmento, v.engenharia, v.quantidade,
         count(x.aluno_id),
         round(min(c.ncf), 4)
  from public.vagas v
  left join x on x.segmento = v.segmento and x.engenharia = v.engenharia
  left join privado.classificacao c on c.aluno_id = x.aluno_id
  where v.turma_id = privado.minha_turma_id()
  group by v.segmento, v.engenharia, v.quantidade
  order by v.segmento, v.engenharia
$$;

-- Minha situação em cada opção, na ordem da minha preferência:
--   'na vaga'  = é a engenharia que eu pego hoje
--   'espera'   = prefiro essa à que eu pego; posicao_espera = meu lugar na fila
--                (todos que também prefeririam ela à que pegaram, por classificação)
--   'abaixo'   = opção pior que a que eu já pego
create function public.minha_engenharia()
returns table (opcao smallint, engenharia text, situacao text, posicao_espera bigint,
               ncf_corte numeric, meu_ncf numeric, falta numeric)
language sql stable security definer set search_path = '' as $$
  with x as (
    select * from privado.alocacao(privado.minha_turma_id())
  ), espera as (          -- (aluno, engenharia) para cada opção melhor que a obtida
    select x.aluno_id, x.segmento, x.ordem_classificacao, p.engenharia
    from x join public.preferencias p on p.aluno_id = x.aluno_id
    where x.opcao is null or p.ordem < x.opcao
  ), fila as (
    select e.*, row_number() over (partition by e.segmento, e.engenharia
                                   order by e.ordem_classificacao) as pos
    from espera e
  ), corte as (
    select x.segmento, x.engenharia, min(c.ncf) as ncf_corte
    from x join privado.classificacao c on c.aluno_id = x.aluno_id
    where x.engenharia is not null
    group by x.segmento, x.engenharia
  ), eu as (
    select x.*, c.ncf from x join privado.classificacao c on c.aluno_id = x.aluno_id
    where x.aluno_id = privado.meu_aluno_id()
  )
  select p.ordem, p.engenharia,
         case when p.engenharia = eu.engenharia then 'na vaga'
              when eu.opcao is null or p.ordem < eu.opcao then 'espera'
              else 'abaixo' end,
         f.pos,
         round(k.ncf_corte, 4), round(eu.ncf, 4),
         case when eu.opcao is null or p.ordem < eu.opcao
              then round(greatest(k.ncf_corte - eu.ncf, 0), 4) end
  from eu
  join public.preferencias p on p.aluno_id = eu.aluno_id
  left join fila f  on f.aluno_id = eu.aluno_id and f.engenharia = p.engenharia
  left join corte k on k.segmento = eu.segmento and k.engenharia = p.engenharia
  order by p.ordem
$$;

-- Salva a lista de preferências inteira de uma vez (ex.: array['COMP','ELO',...]).
-- Roda com as permissões de quem chama (security invoker), então o RLS vale.
create function public.salvar_preferencias(lista text[]) returns void
language plpgsql security invoker set search_path = '' as $$
declare eu bigint := privado.meu_aluno_id();
begin
  if eu is null then raise exception 'Usuário não está na lista da turma'; end if;
  if cardinality(lista) <> (select count(distinct x) from unnest(lista) x) then
    raise exception 'Engenharia repetida na lista';
  end if;
  delete from public.preferencias where aluno_id = eu;
  insert into public.preferencias (aluno_id, engenharia, ordem)
  select eu, x.e, x.i from unnest(lista) with ordinality as x(e, i);
end $$;

-- ---------------------------------------------------------------------
-- Segurança (RLS + permissões)
-- ---------------------------------------------------------------------
alter table public.turmas       enable row level security;
alter table public.pesos_ncf    enable row level security;
alter table public.alunos       enable row level security;
alter table public.semestres    enable row level security;
alter table public.disciplinas  enable row level security;
alter table public.avaliacoes   enable row level security;
alter table public.notas        enable row level security;
alter table public.engenharias  enable row level security;
alter table public.vagas        enable row level security;
alter table public.preferencias enable row level security;

-- Começa do zero: ninguém de fora (anon) acessa nada; logado só o que for liberado abaixo
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;
revoke all on all functions in schema privado from public, anon;

-- Estrutura (somente leitura, da própria turma)
grant select on public.turmas, public.pesos_ncf, public.semestres, public.disciplinas,
                public.avaliacoes, public.engenharias, public.vagas to authenticated;

create policy "ler minha turma" on public.turmas
  for select to authenticated using (id = privado.minha_turma_id());
create policy "ler pesos da minha turma" on public.pesos_ncf
  for select to authenticated using (turma_id = privado.minha_turma_id());
create policy "ler semestres da minha turma" on public.semestres
  for select to authenticated using (turma_id = privado.minha_turma_id());
create policy "ler disciplinas da minha turma" on public.disciplinas
  for select to authenticated using (
    exists (select 1 from public.semestres s
            where s.id = semestre_id and s.turma_id = privado.minha_turma_id()));
create policy "ler avaliacoes da minha turma" on public.avaliacoes
  for select to authenticated using (
    exists (select 1 from public.disciplinas d join public.semestres s on s.id = d.semestre_id
            where d.id = disciplina_id and s.turma_id = privado.minha_turma_id()));
create policy "ler engenharias" on public.engenharias
  for select to authenticated using (true);
create policy "ler vagas da minha turma" on public.vagas
  for select to authenticated using (turma_id = privado.minha_turma_id());

-- Alunos: cada um lê o próprio cadastro e só pode mudar "ocultar_no_ranking"
grant select on public.alunos to authenticated;
grant update (ocultar_no_ranking) on public.alunos to authenticated;
create policy "ler meu cadastro" on public.alunos
  for select to authenticated using (user_id = auth.uid());
create policy "editar meu cadastro" on public.alunos
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Notas: cada um lê/lança/corrige/apaga SÓ as próprias, e só em avaliações da própria turma
grant select, insert, update, delete on public.notas to authenticated;
create policy "ler minhas notas" on public.notas
  for select to authenticated using (aluno_id = privado.meu_aluno_id());
create policy "lancar minhas notas" on public.notas
  for insert to authenticated with check (
    aluno_id = privado.meu_aluno_id()
    and exists (select 1 from public.avaliacoes a
                join public.disciplinas d on d.id = a.disciplina_id
                join public.semestres s on s.id = d.semestre_id
                where a.id = avaliacao_id and s.turma_id = privado.minha_turma_id()));
create policy "corrigir minhas notas" on public.notas
  for update to authenticated
  using (aluno_id = privado.meu_aluno_id())
  with check (aluno_id = privado.meu_aluno_id());
create policy "apagar minhas notas" on public.notas
  for delete to authenticated using (aluno_id = privado.meu_aluno_id());

-- Preferências de engenharia: idem
grant select, insert, update, delete on public.preferencias to authenticated;
create policy "ler minhas preferencias" on public.preferencias
  for select to authenticated using (aluno_id = privado.meu_aluno_id());
create policy "gravar minhas preferencias" on public.preferencias
  for insert to authenticated with check (aluno_id = privado.meu_aluno_id());
create policy "mudar minhas preferencias" on public.preferencias
  for update to authenticated
  using (aluno_id = privado.meu_aluno_id()) with check (aluno_id = privado.meu_aluno_id());
create policy "apagar minhas preferencias" on public.preferencias
  for delete to authenticated using (aluno_id = privado.meu_aluno_id());

grant execute on function public.ranking(), public.medias_turma(), public.meu_desempenho(),
  public.estatisticas_avaliacoes(), public.distribuicao(), public.resumo_engenharias(),
  public.minha_engenharia(), public.salvar_preferencias(text[]) to authenticated;

-- ---------------------------------------------------------------------
-- Cadastro: só emails que estão na tabela alunos
-- ---------------------------------------------------------------------
-- Hook "Before User Created": o Supabase chama isso antes de criar a conta.
-- Precisa ser ativado no painel: Authentication > Hooks > Before User Created
-- > Postgres > função public.hook_somente_alunos (ver README, passo 6).
create function public.hook_somente_alunos(event jsonb) returns jsonb
language plpgsql stable set search_path = '' as $$
begin
  if exists (select 1 from public.alunos
             where email = lower(event -> 'user' ->> 'email') and user_id is null) then
    return '{}'::jsonb;
  end if;
  return jsonb_build_object('error', jsonb_build_object(
    'http_code', 403,
    'message', 'Este email não está na lista da turma (ou já tem conta). Fale com o administrador.'));
end $$;

-- Permissões do jeito que a documentação do Supabase recomenda para hooks:
-- só o serviço de Auth (supabase_auth_admin) executa, e ele precisa poder ler alunos.
revoke all on function public.hook_somente_alunos(jsonb) from public, anon, authenticated;
grant usage on schema public to supabase_auth_admin;
grant execute on function public.hook_somente_alunos(jsonb) to supabase_auth_admin;
grant select (email, user_id) on public.alunos to supabase_auth_admin;
create policy "auth le lista de emails" on public.alunos
  for select to supabase_auth_admin using (true);

-- Quando a conta é criada, liga ela ao aluno com o mesmo email
create function privado.vincular_aluno() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.alunos set user_id = new.id
  where email = lower(new.email) and user_id is null;
  return new;
end $$;

create trigger vincular_aluno after insert on auth.users
for each row execute function privado.vincular_aluno();
