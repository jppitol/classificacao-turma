// Página "Engenharias": minha situação, minhas preferências e vagas/cortes.
// Distribuição, filas de espera, cortes e "quanto falta" vêm prontos do banco
// (minha_engenharia, resumo_engenharias, distribuicao, filas_espera). O JavaScript só reordena a lista.
import { supabase } from './supabase.js';
import { iniciarPagina } from './layout.js';
import { esc, formatar, NOME_SEGMENTO } from './formato.js';

let nomes = new Map();      // sigla -> nome completo
let lista = [];             // ordem atual na tela (siglas)
let salva = null;           // ordem salva no banco (null = nunca salvou)
let segmentoAberto = 'ativa';
let resumo = [];            // linhas de resumo_engenharias()
let distribuicao = [];      // linhas de distribuicao()
let filas = [];             // linhas de filas_espera()
let mexeu = false;          // mexi na lista desde a última vez que salvei

const alterada = () => salva == null || lista.join() !== salva.join();

// ---------- Montagem da página ----------

async function montarPagina(aluno) {
  const [engenharias, preferencias] = await Promise.all([
    supabase.from('engenharias').select('sigla, nome').order('nome'),
    supabase.from('preferencias').select('engenharia, ordem').order('ordem'),
  ]);
  if (engenharias.error || preferencias.error) {
    console.error(engenharias.error || preferencias.error);
    mostrarErro();
    return;
  }

  nomes = new Map(engenharias.data.map((e) => [e.sigla, e.nome]));
  if (preferencias.data.length > 0) {
    salva = preferencias.data.map((p) => p.engenharia);
    // se a lista salva não tiver todas, as que faltam entram no fim
    lista = [...salva, ...engenharias.data.map((e) => e.sigla).filter((s) => !salva.includes(s))];
  } else {
    lista = engenharias.data.map((e) => e.sigla);
  }
  desenharLista();

  document.getElementById('lista-pref').addEventListener('click', (evento) => {
    const botao = evento.target.closest('[data-mover]');
    if (botao) mover(botao.dataset.sigla, Number(botao.dataset.mover));
  });
  document.getElementById('salvar').addEventListener('click', salvar);

  // Aviso do navegador ao sair da página com a lista mexida e não salva
  window.addEventListener('beforeunload', (evento) => {
    if (mexeu && alterada()) evento.preventDefault();
  });

  document.getElementById('abas-segmento').addEventListener('click', (evento) => {
    const botao = evento.target.closest('[data-segmento]');
    if (botao) abrirSegmento(botao.dataset.segmento);
  });
  segmentoAberto = aluno.segmento;

  await carregarResultados();
}

function mostrarErro() {
  document.getElementById('situacao').innerHTML =
    '<p class="mensagem erro">Não foi possível carregar as engenharias. Recarregue a página.</p>';
}

// Busca no banco a situação, as vagas e a distribuição (de novo depois de salvar)
async function carregarResultados() {
  const [minha, resp, dist, esp] = await Promise.all([
    supabase.rpc('minha_engenharia'),
    supabase.rpc('resumo_engenharias'),
    supabase.rpc('distribuicao'),
    supabase.rpc('filas_espera'),
  ]);
  const erro = minha.error || resp.error || dist.error || esp.error;
  if (erro) {
    console.error(erro);
    mostrarErro();
    return;
  }
  resumo = resp.data;
  distribuicao = dist.data;
  filas = esp.data;
  desenharSituacao(minha.data);
  abrirSegmento(segmentoAberto);
}

// ---------- 1. Minha situação ----------

function nomeEng(sigla) {
  return `${esc(nomes.get(sigla) ?? sigla)} <span class="sigla">${esc(sigla)}</span>`;
}

function desenharSituacao(opcoes) {
  const div = document.getElementById('situacao');
  if (salva == null) {
    div.innerHTML = '<p class="vazio">Salve suas preferências abaixo para ver em qual engenharia você entra hoje.</p>';
    return;
  }
  if (opcoes.length === 0) {
    div.innerHTML = '<p class="vazio">Você ainda não tem NCF. Lance suas notas para entrar na distribuição.</p>';
    return;
  }

  const naVaga = opcoes.find((o) => o.situacao === 'na vaga');
  const espera = opcoes.filter((o) => o.situacao === 'espera');
  const abaixo = opcoes.filter((o) => o.situacao === 'abaixo');
  const meuNcf = formatar(opcoes[0].meu_ncf, 4);

  let html = naVaga
    ? `<div class="destaque-eng">
         <span class="dica" style="margin:0">Hoje você entra em</span>
         <strong class="destaque-nome">${esc(nomes.get(naVaga.engenharia) ?? naVaga.engenharia)}</strong>
         <span>${esc(naVaga.engenharia)} · sua ${naVaga.opcao}ª opção · seu NCF ${meuNcf}</span>
       </div>`
    : `<div class="destaque-eng sem-vaga">
         <strong class="destaque-nome">Hoje você não entra em nenhuma das suas opções</strong>
         <span>seu NCF ${meuNcf}</span>
       </div>`;

  if (espera.length) {
    html += `<h3 class="subtitulo">${naVaga ? 'Opções melhores' : 'Suas opções'}</h3><ul class="lista-espera">`;
    for (const o of espera) {
      const corte = o.ncf_corte == null
        ? 'nenhuma vaga ocupada ainda'
        : `faltam ${formatar(o.falta, 4)} de NCF (corte ${formatar(o.ncf_corte, 4)})`;
      html += `<li><strong>${o.opcao}ª ${nomeEng(o.engenharia)}</strong>
                 <span>fila de espera, ${o.posicao_espera}º lugar</span>
                 <span class="dica" style="margin:0">${corte}</span></li>`;
    }
    html += '</ul>';
  }
  if (abaixo.length) {
    html += `<p class="dica opcoes-abaixo">Opções abaixo: ${abaixo.map((o) => esc(o.engenharia)).join(', ')}</p>`;
  }
  div.innerHTML = html;
}

// ---------- 2. Minhas preferências ----------

function desenharLista() {
  document.getElementById('lista-pref').innerHTML = lista.map((sigla, i) => `
    <li>
      <span class="pref-num">${i + 1}</span>
      <span class="pref-nome">${nomeEng(sigla)}</span>
      <button type="button" class="botao-icone" data-mover="-1" data-sigla="${esc(sigla)}"
              aria-label="Subir ${esc(sigla)}"${i === 0 ? ' disabled' : ''}>↑</button>
      <button type="button" class="botao-icone" data-mover="1" data-sigla="${esc(sigla)}"
              aria-label="Descer ${esc(sigla)}"${i === lista.length - 1 ? ' disabled' : ''}>↓</button>
    </li>`).join('');

  document.getElementById('aviso-sem-lista').hidden = salva != null;
  const estado = document.getElementById('estado-lista');
  estado.textContent = salva == null ? 'Ainda não salva' : alterada() ? 'Alterações não salvas' : 'Salva';
  estado.className = `dica ${salva != null && !alterada() ? 'acima' : ''}`;
}

// Troca a engenharia de lugar com a vizinha (direcao -1 = subir, 1 = descer)
function mover(sigla, direcao) {
  const i = lista.indexOf(sigla);
  const j = i + direcao;
  if (j < 0 || j >= lista.length) return;
  [lista[i], lista[j]] = [lista[j], lista[i]];
  mexeu = true;
  desenharLista();
  // o foco acompanha a engenharia movida, para dar para tocar várias vezes seguidas
  const ol = document.getElementById('lista-pref');
  const mesmo = ol.querySelector(`[data-sigla="${sigla}"][data-mover="${direcao}"]`);
  const outro = ol.querySelector(`[data-sigla="${sigla}"][data-mover="${-direcao}"]`);
  (mesmo.disabled ? outro : mesmo).focus();
}

async function salvar() {
  const botao = document.getElementById('salvar');
  const estado = document.getElementById('estado-lista');
  botao.disabled = true;
  estado.textContent = 'Salvando...';
  try {
    const { error } = await supabase.rpc('salvar_preferencias', { lista });
    if (error) {
      console.error(error);
      estado.textContent = `Erro ao salvar: ${error.message}`;
      estado.className = 'dica abaixo';
      return;
    }
    salva = [...lista];
    mexeu = false;
    desenharLista();
    await carregarResultados();
  } catch (e) {
    console.error(e);
    estado.textContent = 'Sem conexão com o servidor. Tente de novo.';
    estado.className = 'dica abaixo';
  } finally {
    botao.disabled = false;
  }
}

// ---------- 3. Vagas e cortes ----------

function abrirSegmento(segmento) {
  segmentoAberto = segmento;
  for (const botao of document.querySelectorAll('#abas-segmento [data-segmento]')) {
    botao.setAttribute('aria-selected', botao.dataset.segmento === segmento);
  }
  document.getElementById('aviso-reserva').hidden = segmento !== 'reserva';

  const vagas = resumo.filter((r) => r.segmento === segmento);
  document.getElementById('linhas-vagas').innerHTML = vagas.length
    ? vagas.map((r) => `
        <tr>
          <td>${nomeEng(r.engenharia)}</td>
          <td class="num">${r.vagas}</td>
          <td class="num">${r.ocupadas}</td>
          <td class="num">${formatar(r.ncf_corte, 4)}</td>
        </tr>`).join('')
    : `<tr><td colspan="4" class="vazio">Sem vagas cadastradas para a ${NOME_SEGMENTO[segmento]}.</td></tr>`;

  desenharTurmas(segmento, vagas);
}

// Um bloco por engenharia, como a aba "Turmas" da planilha: na vaga | em espera
function desenharTurmas(segmento, vagas) {
  const naVaga = distribuicao.filter((d) => d.segmento === segmento);
  const espera = filas.filter((f) => f.segmento === segmento);
  const minha = naVaga.find((d) => d.sou_eu)?.engenharia;
  const div = document.getElementById('turmas');
  if (naVaga.length === 0) {
    div.innerHTML = '<p class="vazio">Ninguém com NCF neste segmento ainda.</p>';
    return;
  }

  let html = vagas.map((r) => {
    const dentro = naVaga.filter((d) => d.engenharia === r.engenharia);
    const fila = espera.filter((f) => f.engenharia === r.engenharia);
    return `
      <details class="turma"${r.engenharia === minha ? ' open' : ''}>
        <summary><span>${nomeEng(r.engenharia)}</span><span class="dica" style="margin:0">${r.ocupadas} de ${r.vagas} vagas</span></summary>
        <div class="turma-listas">
          ${htmlListaTurma('Na vaga', dentro, 'Ninguém na vaga.')}
          ${htmlListaTurma('Em espera', fila, 'Ninguém esperando.')}
        </div>
      </details>`;
  }).join('');

  const semVaga = naVaga.filter((d) => !d.engenharia);
  if (semVaga.length) {
    html += `
      <details class="turma"${semVaga.some((d) => d.sou_eu) ? ' open' : ''}>
        <summary><span>Sem vaga nas opções</span><span class="dica" style="margin:0">${semVaga.length}</span></summary>
        <div class="turma-listas">${htmlListaTurma('Alunos', semVaga, '')}</div>
      </details>`;
  }
  div.innerHTML = html;
}

// Tabela "Class. | Nome | Opção" (classificação no segmento e qual opção a engenharia é para a pessoa)
function htmlListaTurma(titulo, linhas, vazio) {
  const corpo = linhas.length
    ? linhas.map((d) => `
        <tr${d.sou_eu ? ' class="eu"' : ''}>
          <td class="num">${d.ordem_classificacao}º</td>
          <td>${esc(d.nome)}</td>
          <td class="num">${d.opcao != null ? `${d.opcao}ª` : '-'}</td>
        </tr>`).join('')
    : `<tr><td colspan="3" class="vazio">${vazio}</td></tr>`;
  return `
    <div>
      <h4 class="turma-titulo">${titulo}</h4>
      <table class="tabela-ranking">
        <thead><tr><th class="num">Class.</th><th>Nome</th><th class="num">Opção</th></tr></thead>
        <tbody>${corpo}</tbody>
      </table>
    </div>`;
}

// ---------- Início ----------
// Fica no fim do arquivo para que tudo acima já exista quando a página montar
const aluno = await iniciarPagina();
if (aluno) await montarPagina(aluno);
