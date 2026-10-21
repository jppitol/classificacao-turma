// Página "Minhas notas": lançar, corrigir e apagar as próprias notas.
import { supabase } from './supabase.js';
import { iniciarPagina } from './layout.js';
import { esc, formatar, ROTULO_SEMESTRE, NOME_SEGMENTO, estiloCor, htmlPendencias } from './formato.js';

// ---------- Formatação ----------

// Valor guardado no campo: 7.5 -> "7,5" (sem zeros sobrando)
function formatarCampo(numero) {
  return Number(numero).toLocaleString('pt-BR', { maximumFractionDigits: 4, useGrouping: false });
}

// "7,5" ou "7.5" -> 7.5; vazio -> null; inválido -> NaN
function lerNota(texto) {
  texto = texto.trim().replace(',', '.');
  if (texto === '') return null;
  if (!/^\d+(\.\d+)?$/.test(texto)) return NaN;
  const valor = Number(texto);
  return valor >= 0 && valor <= 10 ? valor : NaN;
}

// ---------- Montagem da página ----------

async function montarPagina() {
  // Veio de um link de pendência (notas.html#av-123)? Lê agora, antes das abas trocarem o endereço
  const alvo = location.hash.match(/^#av-(\d+)$/)?.[1];
  // Estrutura e minhas notas (o RLS já filtra: só a minha turma e só as minhas notas)
  const [semestres, disciplinas, avaliacoes, notas] = await Promise.all([
    supabase.from('semestres').select('id, numero, peso').order('numero'),
    supabase.from('disciplinas').select('id, semestre_id, nome, componente, peso, ordem').order('ordem'),
    supabase.from('avaliacoes').select('id, disciplina_id, nome, peso, ordem').order('ordem'),
    supabase.from('notas').select('avaliacao_id, valor'),
  ]);
  const erro = semestres.error || disciplinas.error || avaliacoes.error || notas.error;
  if (erro) {
    console.error(erro);
    document.getElementById('semestres').innerHTML =
      '<p class="mensagem erro">Não foi possível carregar as disciplinas. Recarregue a página.</p>';
    return;
  }

  estrutura = { semestres: semestres.data, disciplinas: disciplinas.data, avaliacoes: avaliacoes.data };
  const minhaNota = new Map(notas.data.map((n) => [n.avaliacao_id, n.valor]));
  const abas = document.getElementById('abas-semestre');
  const container = document.getElementById('semestres');

  for (const semestre of semestres.data) {
    abas.insertAdjacentHTML('beforeend',
      `<button type="button" role="tab" data-semestre="${semestre.id}" data-numero="${semestre.numero}">${ROTULO_SEMESTRE[semestre.numero]}</button>`);

    const doSemestre = disciplinas.data.filter((d) => d.semestre_id === semestre.id);
    let html = '';
    for (const [componente, titulo] of [['graduacao', 'Graduação'], ['militar', 'Militar']]) {
      const lista = doSemestre.filter((d) => d.componente === componente);
      if (lista.length === 0) continue;
      html += `<h2 class="componente">${titulo}</h2>`;
      for (const disciplina of lista) {
        const dela = avaliacoes.data.filter((a) => a.disciplina_id === disciplina.id);
        html += htmlDisciplina(disciplina, dela, minhaNota);
      }
    }
    container.insertAdjacentHTML('beforeend',
      `<section data-painel-semestre="${semestre.id}" hidden>${html || '<p class="vazio">Nenhuma disciplina cadastrada.</p>'}</section>`);
  }

  // Abas: abre a do endereço (#s2), senão o último semestre em que já lancei nota
  abas.addEventListener('click', (evento) => {
    const botao = evento.target.closest('[data-semestre]');
    if (botao) abrirSemestre(botao.dataset.semestre);
  });
  const doEndereco = semestres.data.find((s) => location.hash === `#s${s.numero}`);
  const comNota = semestres.data.filter((s) =>
    container.querySelector(`[data-painel-semestre="${s.id}"] input[value]:not([value=""])`));
  const inicial = doEndereco || comNota.at(-1) || semestres.data[0];
  montarLancamento();
  if (inicial) abrirSemestre(inicial.id);

  // Prévia enquanto digita e gravação ao sair do campo
  container.addEventListener('input', (evento) => {
    if (evento.target.matches('input[data-avaliacao]')) {
      mostrarPrevia(evento.target);
      mostrarBotaoApagar(evento.target);
    }
  });

  // Botão "×": deixa a avaliação em branco (apaga a nota do banco)
  container.addEventListener('mousedown', (evento) => {
    // impede o campo de perder o foco antes, o que dispararia um "salvar" do texto antigo
    if (evento.target.matches('[data-apagar]')) evento.preventDefault();
  });
  container.addEventListener('click', (evento) => {
    const botao = evento.target.closest('[data-apagar]');
    if (!botao) return;
    const campo = document.getElementById(`av-${botao.dataset.apagar}`);
    campo.value = '';
    mostrarBotaoApagar(campo);
    salvar(campo);
  });
  container.addEventListener('change', (evento) => {
    if (evento.target.matches('input[data-avaliacao]')) salvar(evento.target);
  });

  // Link de pendência (#av-123), vindo do Ranking ou do aviso desta página: vai direto ao campo
  window.addEventListener('hashchange', irParaHash);

  await atualizarMedias();
  if (alvo) irParaAvaliacao(alvo);
}

function irParaHash() {
  const id = location.hash.match(/^#av-(\d+)$/)?.[1];
  if (id) irParaAvaliacao(id);
}

// Abre o semestre da avaliação, rola até o campo, foca (já abre o teclado no celular),
// pisca a linha e deixa o lançamento rápido apontando para ela.
function irParaAvaliacao(id) {
  const campo = document.getElementById(`av-${id}`);
  if (!campo) return;
  abrirSemestre(campo.closest('[data-painel-semestre]').dataset.painelSemestre);
  const linha = campo.closest('.avaliacao');
  linha.scrollIntoView({ behavior: 'smooth', block: 'center' });
  campo.focus({ preventScroll: true });
  linha.classList.remove('piscar');
  void linha.offsetWidth;
  linha.classList.add('piscar');

  const aval = estrutura.avaliacoes.find((a) => String(a.id) === String(id));
  lanc.disciplina.value = String(aval.disciplina_id);
  preencherAvaliacoes(String(id));
}

// Aviso "faltam N notas" no topo, com links, e marca os campos que faltam
function mostrarPendencias(lista) {
  const aviso = document.getElementById('aviso-pendencias');
  aviso.hidden = lista.length === 0;
  aviso.innerHTML = lista.length
    ? `${lista.length === 1 ? 'Falta 1 nota' : `Faltam ${lista.length} notas`} em avaliações que a turma já fez
       (contam como zero até você lançar). Toque para ir até ela: ${htmlPendencias(lista)}`
    : '';
  const faltam = new Set(lista.map((p) => String(p.avaliacao_id)));
  for (const campo of document.querySelectorAll('input[data-avaliacao]')) {
    campo.closest('.avaliacao').classList.toggle('pendente', faltam.has(campo.dataset.avaliacao));
  }
}

function htmlDisciplina(disciplina, avaliacoes, minhaNota) {
  const naoConta = Number(disciplina.peso) === 0 ? '<span class="etiqueta">não conta na média</span>' : '';
  const linhas = avaliacoes.map((a) => {
    const valor = minhaNota.has(a.id) ? formatarCampo(minhaNota.get(a.id)) : '';
    const etiqueta = Number(a.peso) === 0 ? ' <span class="etiqueta">não conta na média</span>' : '';
    return `
      <div class="avaliacao">
        <label for="av-${a.id}">${esc(a.nome)}${etiqueta}</label>
        <input id="av-${a.id}" type="text" inputmode="decimal" autocomplete="off" placeholder="-"
               data-avaliacao="${a.id}" data-peso="${a.peso}" value="${valor}" data-salvo="${valor}">
        <button type="button" class="apagar${valor === '' ? ' invisivel' : ''}" data-apagar="${a.id}"
                aria-label="Deixar ${esc(a.nome)} em branco" title="Deixar em branco">×</button>
        <div class="avaliacao-info">
          <span>Turma: <span data-turma-avaliacao="${a.id}">-</span> · ${NOME_SEGMENTO[aluno.segmento]}: <span data-segmento-avaliacao="${a.id}">-</span></span>
          <span class="status" aria-live="polite"></span>
        </div>
      </div>`;
  }).join('');

  return `
    <article class="disciplina" data-disciplina="${disciplina.id}"${estiloCor(disciplina.nome)}>
      <header class="disciplina-topo">
        <h3>${esc(disciplina.nome)}</h3>${naoConta}
      </header>
      <div class="disciplina-medias">
        <span>Minha média: <strong data-minha-media>-</strong> <small class="previa" hidden>prévia</small></span>
        <span>Turma: <strong data-media-turma>-</strong></span>
        <span>${NOME_SEGMENTO[aluno.segmento]}: <strong data-media-segmento>-</strong></span>
      </div>
      ${linhas || '<p class="vazio">Sem avaliações cadastradas.</p>'}
    </article>`;
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
  // o lançamento rápido acompanha a aba aberta
  if (lanc.semestre.value !== id) { lanc.semestre.value = id; preencherDisciplinas(); }
}

// ---------- Lançamento rápido (dropdowns no topo) ----------
// Escolhe semestre > disciplina > avaliação e digita a nota. Salvar usa o mesmo caminho dos
// campos da página (salvar), então validação, "Salvo" e médias funcionam igual.

let estrutura = { semestres: [], disciplinas: [], avaliacoes: [] };
let lanc = null;   // campos do formulário: lanc.semestre, lanc.disciplina, lanc.avaliacao, lanc.nota

function montarLancamento() {
  const form = document.getElementById('lancamento');
  const campo = (nome) => form.querySelector(`[name="${nome}"]`);
  lanc = { semestre: campo('semestre'), disciplina: campo('disciplina'), avaliacao: campo('avaliacao'), nota: campo('nota') };
  lanc.semestre.innerHTML = estrutura.semestres
    .map((s) => `<option value="${s.id}">${ROTULO_SEMESTRE[s.numero]}</option>`).join('');
  lanc.semestre.addEventListener('change', preencherDisciplinas);
  lanc.disciplina.addEventListener('change', preencherAvaliacoes);
  lanc.avaliacao.addEventListener('change', preencherNota);
  form.addEventListener('submit', (evento) => { evento.preventDefault(); salvarLancamento(); });
  preencherDisciplinas();
}

function preencherDisciplinas() {
  const doSemestre = estrutura.disciplinas.filter((d) => String(d.semestre_id) === lanc.semestre.value);
  lanc.disciplina.innerHTML = [['graduacao', 'Graduação'], ['militar', 'Militar']].map(([componente, titulo]) => {
    const lista = doSemestre.filter((d) => d.componente === componente);
    return lista.length
      ? `<optgroup label="${titulo}">${lista.map((d) => `<option value="${d.id}">${esc(d.nome)}</option>`).join('')}</optgroup>`
      : '';
  }).join('');
  preencherAvaliacoes();
}

// Cada opção mostra a nota que já está salva: "VE 1 · 8,5" ou "VE 1 · não lançada"
function preencherAvaliacoes(manterId) {
  const dela = estrutura.avaliacoes.filter((a) => String(a.disciplina_id) === lanc.disciplina.value);
  lanc.avaliacao.innerHTML = dela.map((a) => {
    const salvo = document.getElementById(`av-${a.id}`)?.dataset.salvo;
    return `<option value="${a.id}">${esc(a.nome)} · ${salvo ? salvo : 'não lançada'}</option>`;
  }).join('');
  if (typeof manterId === 'string' && dela.some((a) => String(a.id) === manterId)) lanc.avaliacao.value = manterId;
  preencherNota();
}

function preencherNota() {
  lanc.nota.value = document.getElementById(`av-${lanc.avaliacao.value}`)?.dataset.salvo ?? '';
  lanc.nota.removeAttribute('aria-invalid');
}

async function salvarLancamento() {
  const status = document.getElementById('lancamento-status');
  const campo = document.getElementById(`av-${lanc.avaliacao.value}`);
  if (!campo) return;
  if (Number.isNaN(lerNota(lanc.nota.value))) {
    lanc.nota.setAttribute('aria-invalid', 'true');
    mostrarStatus(status, 'Nota de 0 a 10', 'erro');
    return;
  }
  lanc.nota.removeAttribute('aria-invalid');

  const disciplina = lanc.disciplina.selectedOptions[0].textContent;
  const avaliacao = estrutura.avaliacoes.find((a) => String(a.id) === lanc.avaliacao.value).nome;
  campo.value = lanc.nota.value;           // escreve no campo da página e salva por ele
  mostrarStatus(status, 'Salvando...');
  const resultado = await salvar(campo);
  const textos = {
    salvo: [`Salvo: ${disciplina} · ${avaliacao} = ${campo.dataset.salvo}`, 'sucesso'],
    apagado: [`Apagado: ${disciplina} · ${avaliacao}`, 'sucesso'],
    igual: [`${disciplina} · ${avaliacao} já estava assim`, ''],
    erro: ['Erro ao salvar, tente de novo', 'erro'],
  };
  mostrarStatus(status, ...(textos[resultado] ?? ['', '']));

  // depois de salvar, já deixa a próxima avaliação da disciplina selecionada
  if (resultado === 'salvo' || resultado === 'apagado' || resultado === 'igual') {
    const proxima = lanc.avaliacao.selectedOptions[0].nextElementSibling;
    preencherAvaliacoes(proxima ? proxima.value : lanc.avaliacao.value);
    lanc.nota.focus();
    lanc.nota.select();
  }
}

// ---------- Médias (vêm do banco) ----------

// Busca as médias oficiais no banco e põe na tela, substituindo qualquer prévia.
// "pedido" evita que uma resposta antiga chegue depois de uma nova e sobrescreva.
let pedido = 0;
let feitas = new Set();   // avaliações que alguém da turma já lançou (para a prévia contar zero nelas)
async function atualizarMedias() {
  const meu = ++pedido;
  const [desempenho, estatisticas, pendencias] = await Promise.all([
    supabase.rpc('meu_desempenho'),
    supabase.rpc('estatisticas_avaliacoes'),
    supabase.rpc('minhas_pendencias'),
  ]);
  if (meu !== pedido) return;
  if (pendencias.error) console.error(pendencias.error);
  else mostrarPendencias(pendencias.data);
  if (desempenho.error || estatisticas.error) {
    console.error(desempenho.error || estatisticas.error);
    return;
  }

  const porDisciplina = new Map(desempenho.data.map((d) => [String(d.disciplina_id), d]));
  for (const card of document.querySelectorAll('[data-disciplina]')) {
    const d = porDisciplina.get(card.dataset.disciplina);
    card.querySelector('[data-minha-media]').textContent = formatar(d?.minha_media, 2, 4);
    card.querySelector('[data-media-turma]').textContent = formatar(d?.media_turma, 2, 4);
    card.querySelector('[data-media-segmento]').textContent = formatar(d?.media_segmento, 2, 4);
    card.querySelector('.previa').hidden = true;
  }

  const porAvaliacao = new Map(estatisticas.data.map((e) => [String(e.avaliacao_id), e]));
  feitas = new Set(porAvaliacao.keys());
  for (const campo of document.querySelectorAll('[data-turma-avaliacao]')) {
    campo.textContent = formatar(porAvaliacao.get(campo.dataset.turmaAvaliacao)?.media, 2, 4);
  }
  for (const campo of document.querySelectorAll('[data-segmento-avaliacao]')) {
    campo.textContent = formatar(porAvaliacao.get(campo.dataset.segmentoAvaliacao)?.media_segmento, 2, 4);
  }
}

// Prévia da média da disciplina enquanto digita (única conta permitida no front;
// some quando a nota é salva e o banco devolve a média oficial).
// Mesma regra do banco: campo vazio numa avaliação que a turma já fez conta zero.
function mostrarPrevia(campoDigitado) {
  const card = campoDigitado.closest('[data-disciplina]');
  let somaPesos = 0;
  let soma = 0;
  let temNota = false;
  for (const campo of card.querySelectorAll('input[data-avaliacao]')) {
    let valor = lerNota(campo.value);
    if (Number.isNaN(valor)) continue;
    if (valor == null) {
      if (!feitas.has(campo.dataset.avaliacao)) continue;   // ninguém fez ainda: fica de fora
      valor = 0;
    } else {
      temNota = true;
    }
    soma += Number(campo.dataset.peso) * valor;
    somaPesos += Number(campo.dataset.peso);
  }
  card.querySelector('[data-minha-media]').textContent = temNota && somaPesos > 0 ? formatar(soma / somaPesos, 2, 4) : '-';
  card.querySelector('.previa').hidden = false;
}

// ---------- Gravar / apagar ----------

// Devolve 'salvo', 'apagado', 'igual', 'invalido' ou 'erro' (o lançamento rápido mostra isso)
async function salvar(campo) {
  const status = campo.closest('.avaliacao').querySelector('.status');
  const valor = lerNota(campo.value);

  if (Number.isNaN(valor)) {
    campo.setAttribute('aria-invalid', 'true');
    mostrarStatus(status, 'Nota de 0 a 10', 'erro');
    return 'invalido';
  }
  campo.removeAttribute('aria-invalid');

  // Igual ao que já está no banco (ex.: trocou "7.5" por "7,5"): só arruma o texto
  const anterior = lerNota(campo.dataset.salvo);
  if (valor === anterior) {
    campo.value = campo.dataset.salvo;
    mostrarStatus(status, '');
    atualizarMedias();
    return 'igual';
  }

  mostrarStatus(status, 'Salvando...');
  const avaliacao_id = Number(campo.dataset.avaliacao);
  const { error } = valor == null
    ? await supabase.from('notas').delete().match({ aluno_id: aluno.id, avaliacao_id })
    : await supabase.from('notas').upsert({ aluno_id: aluno.id, avaliacao_id, valor });

  if (error) {
    console.error(error);
    mostrarStatus(status, 'Erro ao salvar, tente de novo', 'erro');
    return 'erro';
  }
  campo.dataset.salvo = valor == null ? '' : formatarCampo(valor);
  campo.value = campo.dataset.salvo;
  mostrarBotaoApagar(campo);
  mostrarStatus(status, valor == null ? 'Apagado' : 'Salvo', 'sucesso');
  atualizarMedias();
  // se a nota foi mudada direto no campo, o lançamento rápido também mostra o valor novo
  if (estrutura.avaliacoes.some((a) => String(a.id) === campo.dataset.avaliacao && String(a.disciplina_id) === lanc.disciplina.value)) {
    preencherAvaliacoes(lanc.avaliacao.value);
  }
  return valor == null ? 'apagado' : 'salvo';
}

// O "×" só aparece quando o campo tem alguma coisa
function mostrarBotaoApagar(campo) {
  campo.closest('.avaliacao').querySelector('[data-apagar]').classList.toggle('invisivel', campo.value.trim() === '');
}

function mostrarStatus(elemento, texto, tipo = '') {
  elemento.textContent = texto;
  elemento.className = `status ${tipo}`;
}

// ---------- Início ----------
// Fica no fim do arquivo para que todas as constantes acima já existam quando a página montar
const aluno = await iniciarPagina();
if (aluno) await montarPagina();
