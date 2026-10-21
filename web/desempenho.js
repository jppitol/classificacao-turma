// Página "Meu desempenho": minha média x média da turma, por disciplina e por avaliação.
// Todas as médias, diferenças e posições vêm prontas do banco (meu_desempenho e
// estatisticas_avaliacoes). O JavaScript só escolhe o tamanho das barras.
import { supabase } from './supabase.js';
import { iniciarPagina } from './layout.js';
import { esc, formatar, ROTULO_SEMESTRE, NOME_SEGMENTO, estiloCor } from './formato.js';

const NOTA_EXPLICATIVA = `<p class="dica nota-explicativa">Como na planilha, a média de cada disciplina conta zero
  nas avaliações que a turma já fez e você não lançou. As que ninguém fez ainda ficam de fora.</p>`;
const NAO_CONTA = '<span class="etiqueta">não conta na média</span>';

// ---------- Formatação ----------

// 1.2 -> "+1,20"; -0.85 -> "−0,85" (sinal de menos, não travessão); 0 -> "0,00"
function formatarDiferenca(dif) {
  const texto = formatar(Math.abs(dif), 2);
  if (texto === '0,00') return texto;
  return (dif > 0 ? '+' : '−') + texto;
}

function lado(dif) {
  if (formatar(Math.abs(dif), 2) === '0,00') return 'neutro';
  return dif > 0 ? 'acima' : 'abaixo';
}

function posicao(pos, total) {
  return pos == null ? '' : `${pos}º de ${total}`;
}

// ---------- Montagem da página ----------

async function montarPagina() {
  const [semestres, disciplinas, avaliacoes, desempenho, estatisticas] = await Promise.all([
    supabase.from('semestres').select('id, numero').order('numero'),
    supabase.from('disciplinas').select('id, semestre_id, nome, componente, peso, ordem').order('ordem'),
    supabase.from('avaliacoes').select('id, disciplina_id, nome, peso, ordem').order('ordem'),
    supabase.rpc('meu_desempenho'),
    supabase.rpc('estatisticas_avaliacoes'),
  ]);
  const erro = semestres.error || disciplinas.error || avaliacoes.error || desempenho.error || estatisticas.error;
  if (erro) {
    console.error(erro);
    document.getElementById('semestres').innerHTML =
      '<p class="mensagem erro">Não foi possível carregar seu desempenho. Recarregue a página.</p>';
    return;
  }

  const porDisciplina = new Map(desempenho.data.map((d) => [d.disciplina_id, d]));
  const porAvaliacao = new Map(estatisticas.data.map((e) => [e.avaliacao_id, e]));
  const abas = document.getElementById('abas-semestre');
  const container = document.getElementById('semestres');

  for (const semestre of semestres.data) {
    abas.insertAdjacentHTML('beforeend',
      `<button type="button" role="tab" data-semestre="${semestre.id}" data-numero="${semestre.numero}">${ROTULO_SEMESTRE[semestre.numero]}</button>`);

    const doSemestre = disciplinas.data.filter((d) => d.semestre_id === semestre.id);
    // Tamanho das barras: a maior diferença do semestre (turma ou segmento) ocupa o lado todo
    const maior = Math.max(0, ...doSemestre.flatMap((d) => [
      Math.abs(porDisciplina.get(d.id)?.diferenca ?? 0),
      Math.abs(porDisciplina.get(d.id)?.diferenca_segmento ?? 0),
    ]));

    let html = htmlResumo(semestre, doSemestre, porDisciplina) + NOTA_EXPLICATIVA;
    for (const [componente, titulo] of [['graduacao', 'Graduação'], ['militar', 'Militar']]) {
      const lista = doSemestre.filter((d) => d.componente === componente);
      if (lista.length === 0) continue;
      html += `<h2 class="componente">${titulo}</h2>`;
      for (const disciplina of lista) {
        const dela = avaliacoes.data.filter((a) => a.disciplina_id === disciplina.id);
        html += htmlDisciplina(disciplina, porDisciplina.get(disciplina.id), dela, porAvaliacao, maior);
      }
    }
    container.insertAdjacentHTML('beforeend',
      `<section data-painel-semestre="${semestre.id}" hidden>${html}</section>`);
  }

  abas.addEventListener('click', (evento) => {
    const botao = evento.target.closest('[data-semestre]');
    if (botao) abrirSemestre(botao.dataset.semestre);
  });

  // Tocar na disciplina abre/fecha o detalhe por avaliação
  container.addEventListener('click', (evento) => {
    const botao = evento.target.closest('[aria-controls]');
    if (!botao) return;
    const aberto = botao.getAttribute('aria-expanded') === 'true';
    botao.setAttribute('aria-expanded', !aberto);
    document.getElementById(botao.getAttribute('aria-controls')).hidden = aberto;
  });

  // Abre a aba do endereço (#s2), senão o último semestre em que tenho nota
  const doEndereco = semestres.data.find((s) => location.hash === `#s${s.numero}`);
  const comNota = semestres.data.filter((s) => desempenho.data.some((d) => d.semestre === s.numero));
  const inicial = doEndereco || comNota.at(-1) || semestres.data[0];
  if (inicial) abrirSemestre(inicial.id);
}

function abrirSemestre(id) {
  id = String(id);
  for (const botao of document.querySelectorAll('#abas-semestre [data-semestre]')) {
    botao.setAttribute('aria-selected', botao.dataset.semestre === id);
    if (botao.dataset.semestre === id) history.replaceState(null, '', `#s${botao.dataset.numero}`);
  }
  for (const painel of document.querySelectorAll('[data-painel-semestre]')) {
    painel.hidden = painel.dataset.painelSemestre !== id;
  }
}

// ---------- Resumo do semestre ----------

function htmlResumo(semestre, doSemestre, porDisciplina) {
  // Só disciplinas que contam na média e em que tenho nota
  const minhas = doSemestre
    .filter((d) => Number(d.peso) > 0 && porDisciplina.get(d.id)?.diferenca != null)
    .map((d) => ({
      nome: d.nome,
      dif: Number(porDisciplina.get(d.id).diferenca),
      difSeg: Number(porDisciplina.get(d.id).diferenca_segmento),
    }));

  if (minhas.length === 0) {
    return `<div class="cartao resumo">
      <p class="vazio" style="margin:0">Você ainda não tem notas neste semestre. <a href="notas.html#s${semestre.numero}">Lançar notas</a></p>
    </div>`;
  }

  // "Acima da turma em 5 de 8 disciplinas. Abaixo em 3." (e o mesmo para o segmento)
  const contagem = (campo, grupo) => {
    const acima = minhas.filter((d) => lado(d[campo]) === 'acima').length;
    const abaixo = minhas.filter((d) => lado(d[campo]) === 'abaixo').length;
    const naMedia = minhas.length - acima - abaixo;
    return `<p class="resumo-contagem">Acima da ${grupo} em <strong>${acima} de ${minhas.length}</strong> disciplinas.
      Abaixo em <strong>${abaixo}</strong>.${naMedia ? ` Na média em <strong>${naMedia}</strong>.` : ''}</p>`;
  };
  const ordenadas = [...minhas].sort((a, b) => b.dif - a.dif);
  const melhor = ordenadas[0];
  const pior = ordenadas.at(-1);
  const linhaDisciplina = (rotulo, d) => `
    <div class="resumo-linha"><span>${rotulo}: ${esc(d.nome)}</span>
      <strong class="${lado(d.dif)}">${formatarDiferenca(d.dif)}</strong></div>`;

  return `<div class="cartao resumo">
    <h2 class="cartao-titulo">Resumo do ${ROTULO_SEMESTRE[semestre.numero]}</h2>
    ${contagem('dif', 'turma')}
    ${contagem('difSeg', aluno.segmento)}
    <p class="dica" style="margin:0.25rem 0">Melhor e pior em relação à turma:</p>
    ${linhaDisciplina('Melhor', melhor)}
    ${minhas.length > 1 ? linhaDisciplina('Pior', pior) : ''}
  </div>`;
}

// ---------- Disciplina: barra divergente + detalhe ----------

function htmlBarra(dif, maior, grupo) {
  const classe = lado(dif);
  const largura = maior > 0 ? (Math.abs(dif) / maior) * 100 : 0;
  const rotulo = `<span class="rotulo-dif">${formatarDiferenca(dif)}</span>`;
  const barra = `<span class="barra" style="width:${largura.toFixed(1)}%"></span>`;
  const descricao = classe === 'neutro' ? `na média da ${grupo}`
    : `${formatar(Math.abs(dif), 2)} ${classe === 'acima' ? 'acima' : 'abaixo'} da média da ${grupo}`;
  return `
    <span class="barra-dif ${classe}" role="img" aria-label="${descricao}">
      <span class="lado-esq">${classe === 'abaixo' ? rotulo + barra : ''}</span>
      <span class="lado-dir">${classe === 'abaixo' ? '' : barra + rotulo}</span>
    </span>`;
}

function htmlDisciplina(disciplina, d, avaliacoes, porAvaliacao, maior) {
  const etiqueta = Number(disciplina.peso) === 0 ? NAO_CONTA : '';
  const meio = d
    ? `<span class="disc-numeros">Minha média <strong>${formatar(d.minha_media, 2, 4)}</strong></span>
       ${htmlComparacao('Turma', 'turma', d.diferenca, d.media_turma, d.minha_posicao, d.alunos_com_nota, maior)}
       ${htmlComparacao(NOME_SEGMENTO[aluno.segmento], aluno.segmento, d.diferenca_segmento, d.media_segmento,
                        d.minha_posicao_segmento, d.alunos_segmento, maior)}`
    : '<span class="disc-numeros">Sem nota sua ainda</span>';

  return `
    <article class="disciplina desempenho"${estiloCor(disciplina.nome)}>
      <button type="button" class="disc-botao" aria-expanded="false" aria-controls="det-${disciplina.id}">
        <span class="disc-titulo"><span class="disc-nome">${esc(disciplina.nome)}</span>${etiqueta}<span class="seta" aria-hidden="true">▾</span></span>
        ${meio}
      </button>
      <div class="detalhe" id="det-${disciplina.id}" hidden>
        ${avaliacoes.map((a) => htmlAvaliacao(a, porAvaliacao.get(a.id))).join('') || '<p class="vazio">Sem avaliações cadastradas.</p>'}
      </div>
    </article>`;
}

// Uma linha de comparação: "Turma · média 7,13 · 3º de 85" e a barra embaixo
function htmlComparacao(rotulo, grupo, dif, media, pos, total, maior) {
  return `
    <span class="comparacao">
      <span class="disc-numeros"><strong>${rotulo}</strong> · média ${formatar(media, 2, 4)}${pos != null ? ` · ${posicao(pos, total)}` : ''}</span>
      ${htmlBarra(Number(dif), maior, grupo)}
    </span>`;
}

function htmlAvaliacao(a, e) {
  const etiqueta = Number(a.peso) === 0 ? ' ' + NAO_CONTA : '';
  const minha = e?.minha_nota != null
    ? `<strong>${formatar(e.minha_nota, 2, 4)}</strong>`
    : '<span class="nao-lancada">não lançada</span>';
  const turma = e
    ? [`turma ${formatar(e.media, 2, 4)}`,
       `${formatar(e.minima, 2, 4)} a ${formatar(e.maxima, 2, 4)}`,
       posicao(e.minha_posicao, e.alunos)].filter(Boolean).join(' · ')
    : 'ainda sem notas da turma';
  const segmento = e
    ? (Number(e.alunos_segmento) > 0
        ? [`${aluno.segmento} ${formatar(e.media_segmento, 2, 4)}`, posicao(e.minha_posicao_segmento, e.alunos_segmento)].filter(Boolean).join(' · ')
        : `${aluno.segmento}: ainda sem notas`)
    : '';
  return `
    <div class="aval-linha">
      <div class="aval-topo"><span>${esc(a.nome)}${etiqueta}</span>${minha}</div>
      <div class="aval-turma">${turma}</div>
      ${segmento ? `<div class="aval-turma">${segmento}</div>` : ''}
    </div>`;
}

// ---------- Início ----------
// Fica no fim do arquivo para que tudo acima já exista quando a página montar
const aluno = await iniciarPagina();
if (aluno) await montarPagina();
