// Testes do banco num Postgres local (PGlite): números x planilha e regras de segurança.
// Uso: cd tests && npm install && node rodar_testes.mjs
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, existsSync } from 'node:fs';

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
console.log('1. NCF parcial atual (todas as notas) = recálculo independente em Python');
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
  // posição: rank dentro do segmento
  const pos = await db.query(`select segmento, count(*) n, count(distinct posicao) d, max(posicao) m from privado.classificacao group by 1`);
  for (const p of pos.rows) check(Number(p.m) === Number(p.n), `ranking ${p.segmento} vai de 1 a ${p.n}`);
}

// ---------------------------------------------------------------- 2
console.log('2. Só o 1º semestre: MG e MM = colunas AK e AR da planilha');
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
    maxErr = Math.max(maxErr, Math.abs(x.mg - e.mg), Math.abs(x.mm - e.mm));
    check(perto(x.mg, e.mg, 1e-7) && perto(x.mm, e.mm, 1e-7), `${x.nome_guerra}: ${x.mg}/${x.mm} x ${e.mg}/${e.mm}`);
  }
  console.log(`   ${n} alunos conferidos, erro máximo ${maxErr.toExponential(2)}`);
}

// ---------------------------------------------------------------- 3
console.log('3. Distribuição nas engenharias = aba Preferências (usando o NCF que a planilha usou)');
{
  const db = await novoBanco();
  // troca as notas por uma única "nota" = NCF da planilha, para isolar o algoritmo
  await db.exec(`delete from notas; update pesos_ncf set peso_graduacao = 1, peso_militar = 0;`);
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

// ---------------------------------------------------------------- 4
console.log('4. Segurança: cadastro, RLS e funções');
{
  const db = await novoBanco();
  await db.exec(`update alunos set email = 'boeira@ime.eb.br' where nome_guerra = 'BOEIRA';
                 update alunos set email = 'pitol@ime.eb.br'  where nome_guerra = 'PITOL';
                 update alunos set ocultar_no_ranking = true where nome_guerra = 'PITOL';`);
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
    await db.query(`update alunos set ocultar_no_ranking = true where id = $1`, [idBoeira]);
    await db.query(`update alunos set ocultar_no_ranking = false where id = $1`, [idBoeira]);
    check(/permission denied/.test(await erro(db.query(`select * from privado.classificacao`)) ?? ''), 'não lê o schema privado direto');
    await db.query(`insert into notas values ($1, $2, 9.5) on conflict (aluno_id, avaliacao_id) do update set valor = excluded.valor`, [idBoeira, avalId]);
    check(/check constraint/.test(await erro(db.query(`update notas set valor = 11 where aluno_id = $1 and avaliacao_id = $2`, [idBoeira, avalId])) ?? ''), 'nota > 10 rejeitada');
    const rk = await db.query(`select * from ranking()`);
    check(rk.rows.length === 93, 'ranking com a turma toda');
    check(rk.rows.filter(x => x.sou_eu).length === 1, 'ranking marca "sou eu"');
    check(rk.rows.some(x => x.nome === null) && !rk.rows.some(x => x.nome === 'PITOL'), 'quem ocultou aparece sem nome');
    const md = await db.query(`select * from medias_turma()`);
    check(md.rows.length === 3, 'médias: ativa, reserva e geral');
    const de = await db.query(`select * from meu_desempenho()`);
    check(de.rows.length > 0 && de.rows.every(x => x.minha_media != null), 'feedback por disciplina');
    const es = await db.query(`select * from estatisticas_avaliacoes()`);
    check(es.rows.some(x => x.minha_nota != null), 'estatísticas por avaliação');
    await db.query(`select * from distribuicao()`);
    await db.query(`select salvar_preferencias($1)`, [['COMP','ELO','TEL']]);
    const pf = await db.query(`select engenharia from preferencias order by ordem`);
    check(pf.rows.map(x => x.engenharia).join() === 'COMP,ELO,TEL', 'salvar_preferencias grava na ordem');
    check(/repetida/.test(await erro(db.query(`select salvar_preferencias($1)`, [['COMP','COMP']])) ?? ''), 'rejeita engenharia repetida');
    check(/foreign key/.test(await erro(db.query(`select salvar_preferencias($1)`, [['XYZ']])) ?? ''), 'rejeita engenharia inexistente');
    check((await db.query(`select count(*) from preferencias`)).rows[0].count == 3, 'lista anterior preservada após erro');
  });
  const depois = Number((await db.query(`select count(*) from notas`)).rows[0].count);
  check(depois === total, `notas de outros intactas (${depois} = ${total})`);
  check((await db.query(`select ocultar_no_ranking from alunos where nome_guerra='PITOL'`)).rows[0].ocultar_no_ranking === true, 'PITOL não foi alterado');

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
  // como o PITOL (oculto), ele vê o próprio nome
  await comoUsuario(db, u2, async () => {
    check((await db.query(`select * from ranking() where sou_eu`)).rows[0].nome === 'PITOL', 'oculto vê o próprio nome');
  });
}

console.log(`\n${ok} verificações ok, ${falhas} falhas`);
process.exit(falhas ? 1 : 0);
