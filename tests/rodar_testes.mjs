// Testes do banco num Postgres local (PGlite): números x planilha e regras de segurança.
// Uso: cd tests && npm install && node rodar_testes.mjs
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, existsSync, readdirSync } from 'node:fs';

const sql = (f) => readFileSync(new URL(f, import.meta.url), 'utf8');
const esperado = JSON.parse(sql('./esperado.json'));
let falhas = 0, ok = 0;
const check = (cond, msg) => { if (cond) ok++; else { falhas++; console.log('  FALHOU:', msg); } };
const perto = (a, b, tol = 1e-9) => a != null && b != null && Math.abs(Number(a) - Number(b)) <= tol;

async function novoBanco({ importar = true } = {}) {
  const db = new PGlite();
  await db.exec(sql('./supabase_stub.sql'));
  await db.exec(sql('../supabase/01_schema.sql'));
  await db.exec(sql('../supabase/02_seed.sql'));
  if (importar) await db.exec(sql('../supabase/03_importar_planilha.sql'));
  // mudanças posteriores (05_*.sql em diante), na ordem do nome, como no Supabase
  for (const f of readdirSync(new URL('../supabase/', import.meta.url)).filter((f) => /^(0[5-9]|[1-9]\d)_.*\.sql$/.test(f)).sort())
    await db.exec(sql(`../supabase/${f}`));
  return db;
}
// Executa como um usuário logado do site (papel authenticated + uid do JWT)
async function comoUsuario(db, uid, fn) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${uid ?? ''}', false);`);
  try { return await fn(); } finally { await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`); }
}
async function erro(p) { try { await p; return null; } catch (e) { return e.message; } }

if (!existsSync(new URL('../supabase/03_importar_planilha.sql', import.meta.url))) {
  console.log('Falta supabase/03_importar_planilha.sql (rode scripts/gerar_sql.py com a planilha).'); process.exit(1);
}

// ---------------------------------------------------------------- 1
console.log('1. NCF atual (nota que falta = zero) = recálculo independente em Python');
{
  const db = await novoBanco();
  const r = await db.query(`select a.nome_guerra, c.* from privado.classificacao c join alunos a on a.id = c.aluno_id`);
  check(r.rows.length === Object.keys(esperado.parcial).length, `nº de alunos ${r.rows.length}`);
  let maxErr = 0;
  for (const x of r.rows) {
    const e = esperado.parcial[x.nome_guerra];
    for (const k of ['mg', 'mm', 'ncf']) {
      if (e[k] === null) { check(x[k] === null, `${x.nome_guerra} ${k} deveria ser nulo`); continue; }
      maxErr = Math.max(maxErr, Math.abs(Number(x[k]) - e[k]));
      check(perto(x[k], e[k], 1e-9), `${x.nome_guerra} ${k}: sql ${x[k]} x py ${e[k]}`);
    }
  }
  console.log(`   ${r.rows.length} alunos, erro máximo ${maxErr.toExponential(2)}`);
  // NCF = o que a planilha mostra na aba Classificação OFICIAL
  // (exceto onde a planilha está errada ou incompleta: ver nomes abaixo)
  const excecoes = {
    SZPIGEL: 'Cálculo I do 1º semestre usa G57 (VE 1 do aluno de cima)',
    BUDZIAK: '1º semestre digitado à mão na OFICIAL, sem notas na aba do semestre',
  };
  let iguaisPlanilha = 0;
  for (const x of r.rows) {
    const p = esperado.ncf_planilha[x.nome_guerra];
    if (p == null || excecoes[x.nome_guerra]) continue;
    if (perto(x.ncf, p, 1e-9)) iguaisPlanilha++; else check(false, `${x.nome_guerra}: NCF ${x.ncf} x planilha ${p}`);
  }
  console.log(`   NCF igual ao da planilha em ${iguaisPlanilha} alunos (fora ${Object.keys(excecoes).join(', ')})`);
  // posição: rank dentro do segmento
  const pos = await db.query(`select segmento, count(*) n, count(distinct posicao) d, max(posicao) m from privado.classificacao group by 1`);
  for (const p of pos.rows) check(Number(p.m) === Number(p.n), `ranking ${p.segmento} vai de 1 a ${p.n}`);
}

// ---------------------------------------------------------------- 2
console.log('2. Só o 1º semestre: MG e MM = 0,25 x colunas AK e AR da planilha (resto conta zero)');
{
  const db = await novoBanco();
  await db.exec(`delete from notas n using avaliacoes a, disciplinas d, semestres s
                 where a.id = n.avaliacao_id and d.id = a.disciplina_id and s.id = d.semestre_id and s.numero <> 1`);
  const r = await db.query(`select a.nome_guerra, c.mg, c.mm from privado.classificacao c join alunos a on a.id = c.aluno_id`);
  let n = 0, maxErr = 0;
  for (const x of r.rows) {
    const e = esperado.sem1[x.nome_guerra];
    if (!e || x.nome_guerra === 'SZPIGEL') continue;   // SZPIGEL: a planilha tem erro de referência (G57)
    n++;
    maxErr = Math.max(maxErr, Math.abs(x.mg - 0.25 * e.mg), Math.abs(x.mm - 0.25 * e.mm));
    check(perto(x.mg, 0.25 * e.mg, 1e-7) && perto(x.mm, 0.25 * e.mm, 1e-7), `${x.nome_guerra}: ${x.mg}/${x.mm} x 0,25*${e.mg}/0,25*${e.mm}`);
  }
  console.log(`   ${n} alunos conferidos, erro máximo ${maxErr.toExponential(2)}`);
}

// ---------------------------------------------------------------- 3
console.log('3. Distribuição nas engenharias = aba Preferências (usando o NCF que a planilha usou)');
{
  const db = await novoBanco();
  // troca as notas por uma única "nota" = NCF da planilha, para isolar o algoritmo
  await db.exec(`delete from notas; update pesos_ncf set peso_graduacao = 1, peso_militar = 0;`);
  // vagas da planilha: ativa fixa; reserva = capacidade - ocupadas pela ativa, com a capacidade
  // ajustada pra sobrar pra reserva o que a planilha dava (+ vaga da ativa que sobrar)
  const VAGAS_PLANILHA = {
    'COMP': [13, 14], 'CART': [8, 7], 'MEC AUT': [5, 12], 'MEC ARM': [5, 12], 'ELE': [4, 12],
    'ELO': [7, 12], 'TEL': [6, 12], 'FC': [8, 12], 'MAT': [3, 12], 'QUI': [7, 12] };
  for (const [e, [at, rs]] of Object.entries(VAGAS_PLANILHA)) {
    await db.query(`update vagas set quantidade = $1 where segmento = 'ativa' and engenharia = $2`, [at, e]);
    await db.query(`update capacidades set capacidade = $1, cg = 0, ofa = 0, ona = 0, destrancamento = 0
                    where engenharia = $2`, [at + rs, e]);
  }
  const aval = (await db.query(`select a.id from avaliacoes a join disciplinas d on d.id = a.disciplina_id
                                 join semestres s on s.id = d.semestre_id
                                 where s.numero = 1 and d.nome = 'Cálculo I' and a.nome = 'VF'`)).rows[0].id;
  // as outras disciplinas sem nota não pesam; a média = a nota de Cálculo I VF
  for (const [nome, v] of Object.entries(esperado.ncf_planilha))
    await db.query(`insert into notas select id, $1, $2 from alunos where nome_guerra = $3`, [aval, v, nome]);
  const r = await db.query(`select a.nome_guerra, x.engenharia from privado.alocacao(1::smallint) x join alunos a on a.id = x.aluno_id`);
  let iguais = 0;
  for (const x of r.rows) { const e = esperado.alocacao[x.nome_guerra];
    if (e === x.engenharia) iguais++; else check(false, `${x.nome_guerra}: ${x.engenharia} x planilha ${e}`); }
  check(iguais === Object.keys(esperado.alocacao).length, 'todos alocados igual');
  console.log(`   ${iguais}/${Object.keys(esperado.alocacao).length} iguais à planilha`);

  // minha_engenharia: coerência da fila de espera e do corte
  const uid = (await db.query(`insert into auth.users (email) values ('teste@ime.eb.br') returning id`)).rows[0].id;
  await db.exec(`update alunos set user_id = '${uid}' where nome_guerra = 'BOEIRA'`);
  const me = await comoUsuario(db, uid, () => db.query(`select * from minha_engenharia()`));
  console.log('   BOEIRA (amostra):', me.rows.slice(0, 3).map(x => `${x.opcao}ª ${x.engenharia}: ${x.situacao}${x.posicao_espera ? ' #' + x.posicao_espera : ''}`).join(' | '));
  check(me.rows.filter(x => x.situacao === 'na vaga').length <= 1, 'no máximo uma "na vaga"');
  const res = await comoUsuario(db, uid, () => db.query(`select * from resumo_engenharias()`));
  for (const x of res.rows) check(Number(x.ocupadas) <= x.vagas, `${x.segmento} ${x.engenharia} não estoura vagas`);
}

// ---------------------------------------------------------------- 3b
console.log('3b. Vagas da reserva = o que sobra da sala depois da ativa (DIEx 326-A1)');
{
  const db = await novoBanco();
  const uid = (await db.query(`insert into auth.users (email) values ('t3b@ime.eb.br') returning id`)).rows[0].id;
  await db.exec(`update alunos set user_id = '${uid}' where nome_guerra = 'BOEIRA'`);
  const tot = (await db.query(`select (select sum(quantidade) from vagas where segmento='ativa') a,
                                      (select count(*) from vagas where segmento='reserva') r`)).rows[0];
  check(Number(tot.a) === 69 && Number(tot.r) === 0, `ativa 69 vagas fixas, reserva sem linhas em vagas (${tot.a}, ${tot.r})`);
  // todo mundo da ativa quer COMP em 1º: ativa lota COMP (14), reserva fica com 27-2-14 = 11
  const resumo = async () => Object.fromEntries((await comoUsuario(db, uid, () => db.query(`select * from resumo_engenharias()`)))
    .rows.map((x) => [`${x.segmento}/${x.engenharia}`, x]));
  let r = await resumo();
  for (const x of Object.values(r)) check(Number(x.ocupadas) <= x.vagas, `${x.segmento} ${x.engenharia} não estoura`);
  // a "vaga máxima da reserva" do documento só vale com a ativa lotada; aqui conferimos a fórmula
  const cap = Object.fromEntries((await db.query(`select * from capacidades`)).rows.map((c) => [c.engenharia, c]));
  for (const [e, c] of Object.entries(cap)) {
    const livre = c.capacidade - c.cg - c.ofa - c.ona - c.destrancamento;
    const at = r[`ativa/${e}`], rs = r[`reserva/${e}`];
    check(rs.vagas === Math.max(livre - Number(at.ocupadas), 0), `reserva ${e}: ${rs.vagas} = ${livre} - ${at.ocupadas}`);
  }
  // ninguém da ativa quer MAT: as 3 vagas da ativa sobram e vão pra reserva (8 - 0 - 0 = 8)
  await db.exec(`delete from preferencias p using alunos a where a.id = p.aluno_id and a.segmento = 'ativa' and p.engenharia = 'MAT'`);
  r = await resumo();
  check(Number(r['ativa/MAT'].ocupadas) === 0 && r['reserva/MAT'].vagas === 8, `MAT sem ativa: reserva ganha 8 vagas (${r['reserva/MAT'].vagas})`);
  // ativa lotando COMP: todo mundo da ativa com COMP em 1º
  await db.exec(`update preferencias p set ordem = ordem + 100 from alunos a where a.id = p.aluno_id and a.segmento = 'ativa'`);
  await db.exec(`update preferencias p set ordem = 1 from alunos a where a.id = p.aluno_id and a.segmento = 'ativa' and p.engenharia = 'COMP'`);
  r = await resumo();
  check(Number(r['ativa/COMP'].ocupadas) === 14 && r['reserva/COMP'].vagas === 11, `COMP lotada pela ativa: reserva 11 (${r['reserva/COMP'].vagas})`);
  console.log(`   reserva/MAT ${r['reserva/MAT'].vagas}, reserva/COMP ${r['reserva/COMP'].vagas}, reserva/TEL ${r['reserva/TEL'].vagas}`);
}

// ---------------------------------------------------------------- 4
console.log('4. Segurança: cadastro, RLS e funções');
{
  const db = await novoBanco();
  await db.exec(`update alunos set email = 'boeira@ime.eb.br' where nome_guerra = 'BOEIRA';
                 update alunos set email = 'pitol@ime.eb.br'  where nome_guerra = 'PITOL';`);
  // hook de cadastro
  const hook = async (email) => {   // roda como o serviço de Auth, igual no Supabase
    await db.exec('set role supabase_auth_admin');
    try { return (await db.query(`select public.hook_somente_alunos($1::jsonb) r`, [JSON.stringify({ user: { email } })])).rows[0].r; }
    finally { await db.exec('reset role'); } };
  check(JSON.stringify(await hook('BOEIRA@ime.eb.br')) === '{}', 'hook aceita email da lista (maiúsc. ok)');
  check((await hook('intruso@gmail.com')).error?.http_code === 403, 'hook barra email fora da lista');
  // trigger de vínculo
  const u1 = (await db.query(`insert into auth.users (email) values ('Boeira@ime.eb.br') returning id`)).rows[0].id;
  const u2 = (await db.query(`insert into auth.users (email) values ('pitol@ime.eb.br') returning id`)).rows[0].id;
  const v = await db.query(`select nome_guerra from alunos where user_id in ($1, $2) order by 1`, [u1, u2]);
  check(v.rows.map(x => x.nome_guerra).join() === 'BOEIRA,PITOL', 'contas vinculadas pelo email');
  check((await hook('boeira@ime.eb.br')).error?.http_code === 403, 'hook barra segunda conta no mesmo email');

  const idBoeira = (await db.query(`select id from alunos where nome_guerra='BOEIRA'`)).rows[0].id;
  const idPitol  = (await db.query(`select id from alunos where nome_guerra='PITOL'`)).rows[0].id;
  const avalId   = (await db.query(`select id from avaliacoes limit 1`)).rows[0].id;
  const total    = Number((await db.query(`select count(*) from notas`)).rows[0].count);

  await comoUsuario(db, u1, async () => {
    const n = await db.query(`select distinct aluno_id from notas`);
    check(n.rows.length === 1 && n.rows[0].aluno_id == idBoeira, 'só enxerga as próprias notas');
    check((await db.query(`select * from alunos`)).rows.length === 1, 'só enxerga o próprio cadastro');
    await db.query(`update notas set valor = 10 where aluno_id = $1`, [idPitol]);
    await db.query(`delete from notas where aluno_id = $1`, [idPitol]);
    check(/row-level security/.test(await erro(db.query(`insert into notas values ($1, $2, 10)`, [idPitol, avalId])) ?? ''), 'não lança nota para outro aluno');
    check(/permission denied/.test(await erro(db.query(`update alunos set email = 'x@x' where id = $1`, [idBoeira])) ?? ''), 'não muda o próprio email');
    check(/permission denied/.test(await erro(db.query(`update alunos set nome_guerra = 'X' where id = $1`, [idBoeira])) ?? ''), 'não edita o próprio cadastro');
    check(/permission denied/.test(await erro(db.query(`select * from privado.classificacao`)) ?? ''), 'não lê o schema privado direto');
    await db.query(`insert into notas values ($1, $2, 9.5) on conflict (aluno_id, avaliacao_id) do update set valor = excluded.valor`, [idBoeira, avalId]);
    check(/check constraint/.test(await erro(db.query(`update notas set valor = 11 where aluno_id = $1 and avaliacao_id = $2`, [idBoeira, avalId])) ?? ''), 'nota > 10 rejeitada');
    const rk = await db.query(`select * from ranking()`);
    check(rk.rows.length === 93, 'ranking com a turma toda');
    check(rk.rows.filter(x => x.sou_eu).length === 1, 'ranking marca "sou eu"');
    check(rk.rows.every(x => x.nome != null) && rk.rows.some(x => x.nome === 'PITOL'), 'ranking mostra o nome de todos');
    const md = await db.query(`select * from medias_turma()`);
    check(md.rows.length === 3, 'médias: ativa, reserva e geral');
    const de = await db.query(`select * from meu_desempenho()`);
    check(de.rows.length > 0 && de.rows.every(x => x.minha_media != null), 'feedback por disciplina');
    const es = await db.query(`select * from estatisticas_avaliacoes()`);
    check(es.rows.some(x => x.minha_nota != null), 'estatísticas por avaliação');
    check((await db.query(`select * from distribuicao()`)).rows.every(x => x.nome != null), 'distribuição mostra o nome de todos');
    await db.query(`select salvar_preferencias($1)`, [['COMP','ELO','TEL']]);
    const pf = await db.query(`select engenharia from preferencias order by ordem`);
    check(pf.rows.map(x => x.engenharia).join() === 'COMP,ELO,TEL', 'salvar_preferencias grava na ordem');
    check(/repetida/.test(await erro(db.query(`select salvar_preferencias($1)`, [['COMP','COMP']])) ?? ''), 'rejeita engenharia repetida');
    check(/foreign key/.test(await erro(db.query(`select salvar_preferencias($1)`, [['XYZ']])) ?? ''), 'rejeita engenharia inexistente');
    check((await db.query(`select count(*) from preferencias`)).rows[0].count == 3, 'lista anterior preservada após erro');
  });
  const depois = Number((await db.query(`select count(*) from notas`)).rows[0].count);
  check(depois === total, `notas de outros intactas (${depois} = ${total})`);

  // visitante sem login (anon) e usuário logado que não está na lista
  await db.exec(`set role anon`);
  check(/permission denied/.test(await erro(db.query(`select * from notas`)) ?? ''), 'anon não lê notas');
  check(/permission denied/.test(await erro(db.query(`select * from ranking()`)) ?? ''), 'anon não chama ranking');
  check(/permission denied/.test(await erro(db.query(`select * from alunos`)) ?? ''), 'anon não lê alunos');
  await db.exec(`reset role`);
  const estranho = (await db.query(`select gen_random_uuid() id`)).rows[0].id;
  await comoUsuario(db, estranho, async () => {
    check((await db.query(`select * from ranking()`)).rows.length === 0, 'logado fora da lista não vê ranking');
    check((await db.query(`select * from notas`)).rows.length === 0, 'logado fora da lista não vê notas');
  });
}

// ---------------------------------------------------------------- 05
console.log('05. Ordem das avaliações: VE 1, VC, VE 2, VF');
{
  const db = await novoBanco({ importar: false });
  const r = await db.query(`select string_agg(nome, ',' order by ordem) as lista,
                                   count(*) = count(distinct ordem) as sem_empate
                            from avaliacoes group by disciplina_id`);
  const quatro = r.rows.filter((x) => ['VE 1', 'VE 2', 'VC', 'VF'].every((n) => x.lista.split(',').includes(n)) && x.lista.split(',').length === 4);
  check(quatro.length > 0 && quatro.every((x) => x.lista === 'VE 1,VC,VE 2,VF'), 'VC vem antes da VE 2 nas disciplinas com VE 1, VE 2, VC e VF');
  check(r.rows.every((x) => x.sem_empate), 'nenhuma disciplina tem duas avaliações na mesma posição');
}

// ---------------------------------------------------------------- 09
console.log('09. Filas de espera por engenharia (aba "Turmas" da planilha)');
{
  const db = await novoBanco();
  // usuário de teste = o aluno que ficou na pior opção (para ter fila de espera)
  const pior = (await db.query(`select x.aluno_id from privado.alocacao(1::smallint) x
                                where x.opcao is not null order by x.opcao desc, x.ordem_classificacao limit 1`)).rows[0].aluno_id;
  const uid = (await db.query(`insert into auth.users (email) values ('fila@ime.eb.br') returning id`)).rows[0].id;
  await db.query(`update alunos set user_id = $1 where id = $2`, [uid, pior]);

  await comoUsuario(db, uid, async () => {
    const f = (await db.query(`select * from filas_espera()`)).rows;
    check(f.length > 0, 'filas_espera devolve linhas');
    // cada linha é uma opção MELHOR que a obtida pelo aluno (ou ele ficou sem vaga)
    const nomes = new Map((await db.query(`select * from distribuicao()`)).rows.map((d) => [`${d.segmento}|${d.nome}`, d]));
    check(f.every((x) => { const d = nomes.get(`${x.segmento}|${x.nome}`); return d && (d.opcao == null || x.opcao < d.opcao); }),
      'fila só tem opções melhores que a obtida');
    check(f.every((x) => { const d = nomes.get(`${x.segmento}|${x.nome}`); return d.engenharia !== x.engenharia; }),
      'ninguém espera na engenharia em que já está');
    // posições 1, 2, 3... em cada (segmento, engenharia), seguindo a classificação
    const grupos = Map.groupBy(f, (x) => `${x.segmento}|${x.engenharia}`);
    check([...grupos.values()].every((g) => g.every((x, i) => Number(x.posicao) === i + 1 && (i === 0 || g[i - 1].ordem_classificacao < x.ordem_classificacao))),
      'posição na fila segue a classificação');
    // bate com minha_engenharia()
    const minha = (await db.query(`select * from minha_engenharia() where situacao = 'espera'`)).rows;
    const eu = f.filter((x) => x.sou_eu);
    check(minha.length > 0 && minha.length === eu.length &&
          minha.every((m) => eu.some((x) => x.engenharia === m.engenharia && Number(x.posicao) === Number(m.posicao_espera))),
      'minhas filas = minha_engenharia()');
  });
  await db.exec(`set role anon`);
  check(/permission denied/.test(await erro(db.query(`select * from filas_espera()`)) ?? ''), 'anon não chama filas_espera');
  await db.exec(`reset role`);
}

// ---------------------------------------------------------------- 10
console.log('10. Comparação com o meu segmento (meu_desempenho e estatisticas_avaliacoes)');
{
  const db = await novoBanco();
  for (const seg of ['ativa', 'reserva']) {
    // um aluno do segmento com notas
    const aluno = (await db.query(`select a.id from alunos a join notas n on n.aluno_id = a.id
                                   where a.segmento = $1 group by a.id order by count(*) desc, a.id limit 1`, [seg])).rows[0].id;
    const uid = (await db.query(`insert into auth.users (email) values ($1) returning id`, [`seg-${seg}@ime.eb.br`])).rows[0].id;
    await db.query(`update alunos set user_id = $1 where id = $2`, [uid, aluno]);
    // conta independente, direto nas tabelas: média da disciplina = soma(peso*nota)/soma(peso)
    const esperadoDisc = new Map((await db.query(`
      with md as (  -- regra do 11: avaliação que alguém já fez e o aluno não lançou conta zero
        select c.aluno_id, a.disciplina_id, sum(a.peso * coalesce(n.valor, 0)) / nullif(sum(a.peso), 0) as m
        from (select distinct n.aluno_id, av.disciplina_id from notas n join avaliacoes av on av.id = n.avaliacao_id) c
        join avaliacoes a on a.disciplina_id = c.disciplina_id
        left join notas n on n.aluno_id = c.aluno_id and n.avaliacao_id = a.id
        where exists (select 1 from notas x where x.avaliacao_id = a.id)
        group by 1, 2)
      select md.disciplina_id, avg(md.m) as media, count(*) as n,
             1 + count(*) filter (where md.m > (select m from md eu where eu.aluno_id = $1 and eu.disciplina_id = md.disciplina_id)) as pos
      from md join alunos al on al.id = md.aluno_id
      where al.segmento = $2 and md.disciplina_id in (select disciplina_id from md where aluno_id = $1)
      group by md.disciplina_id`, [aluno, seg])).rows.map((x) => [x.disciplina_id, x]));
    const esperadoAval = new Map((await db.query(`
      select n.avaliacao_id, avg(n.valor) as media, count(*) as n
      from notas n join alunos al on al.id = n.aluno_id where al.segmento = $1 group by 1`, [seg])).rows.map((x) => [x.avaliacao_id, x]));

    await comoUsuario(db, uid, async () => {
      const de = (await db.query(`select * from meu_desempenho()`)).rows;
      check(de.length > 0 && de.every((x) => {
        const e = esperadoDisc.get(x.disciplina_id);
        return e && perto(x.media_segmento, Number(e.media), 1e-4) && Number(x.alunos_segmento) === Number(e.n)
          && Number(x.minha_posicao_segmento) === Number(e.pos)
          // as três colunas vêm arredondadas em 4 casas: a diferença pode variar até 1,5e-4
          && perto(x.diferenca_segmento, Number(x.minha_media) - Number(x.media_segmento), 2e-4);
      }), `${seg}: média, posição e diferença por segmento em cada disciplina`);
      check(de.every((x) => Number(x.alunos_segmento) <= Number(x.alunos_com_nota) && Number(x.minha_posicao_segmento) <= Number(x.minha_posicao)),
        `${seg}: segmento cabe dentro da turma (alunos e posição)`);
      const es = (await db.query(`select * from estatisticas_avaliacoes()`)).rows;
      check(es.length > 0 && es.every((x) => {
        const e = esperadoAval.get(x.avaliacao_id);
        return e ? perto(x.media_segmento, Number(e.media), 1e-4) && Number(x.alunos_segmento) === Number(e.n)
                 : x.media_segmento === null && Number(x.alunos_segmento) === 0;
      }), `${seg}: média por avaliação no segmento`);
      check(es.filter((x) => x.minha_nota != null).every((x) => x.minha_posicao_segmento != null && Number(x.minha_posicao_segmento) <= Number(x.minha_posicao)),
        `${seg}: minha posição no segmento em cada avaliação`);
    });
  }
  await db.exec(`set role anon`);
  check(/permission denied/.test(await erro(db.query(`select * from meu_desempenho()`)) ?? ''), 'anon não chama meu_desempenho');
  check(/permission denied/.test(await erro(db.query(`select * from estatisticas_avaliacoes()`)) ?? ''), 'anon não chama estatisticas_avaliacoes');
  await db.exec(`reset role`);
}

// ---------------------------------------------------------------- 11
console.log('11. Média de cada disciplina do 1º semestre = coluna de média da planilha (falta = zero)');
{
  const db = await novoBanco();
  const r = await db.query(`select a.nome_guerra, d.nome as disciplina, md.media
                            from privado.medias_disciplina md
                            join alunos a on a.id = md.aluno_id
                            join disciplinas d on d.id = md.disciplina_id
                            join semestres s on s.id = d.semestre_id where s.numero = 1`);
  let n = 0, maxErr = 0;
  for (const x of r.rows) {
    if (x.nome_guerra === 'SZPIGEL' && x.disciplina === 'Cálculo I') continue;   // erro da planilha (G57)
    const p = esperado.disc1[x.nome_guerra]?.[x.disciplina];
    if (p == null) continue;
    n++;
    maxErr = Math.max(maxErr, Math.abs(Number(x.media) - p));
    check(perto(x.media, p, 1e-9), `${x.nome_guerra} ${x.disciplina}: site ${x.media} x planilha ${p}`);
  }
  check(n > 400, `comparou ${n} médias de disciplina`);
  console.log(`   ${n} médias conferidas, erro máximo ${maxErr.toExponential(2)}`);
}

console.log(`\n${ok} verificações ok, ${falhas} falhas`);
process.exit(falhas ? 1 : 0);
