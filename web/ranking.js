// Página "Ranking": classificação por segmento e médias da turma.
// Todos os números vêm prontos do banco (RPCs ranking e medias_turma).
import { supabase } from './supabase.js';
import { iniciarPagina } from './layout.js';
import { esc, formatar } from './formato.js';

const NOME_SEGMENTO = { ativa: 'Ativa', reserva: 'Reserva' };

let ranking = [];        // linhas de ranking()
let medias = [];         // linhas de medias_turma()

async function montarPagina(aluno) {
  const [respRanking, respMedias] = await Promise.all([
    supabase.rpc('ranking'),
    supabase.rpc('medias_turma'),
  ]);
  if (respRanking.error || respMedias.error) {
    console.error(respRanking.error || respMedias.error);
    document.getElementById('linhas-ranking').innerHTML =
      '<tr><td colspan="5" class="mensagem erro">Não foi possível carregar o ranking. Recarregue a página.</td></tr>';
    return;
  }
  ranking = respRanking.data;
  medias = respMedias.data;

  mostrarAvisoPendencias();

  document.getElementById('abas-segmento').addEventListener('click', (evento) => {
    const botao = evento.target.closest('[data-segmento]');
    if (botao) abrirSegmento(botao.dataset.segmento);
  });
  document.getElementById('ir-para-mim').addEventListener('click', irParaMim);

  // Abre a aba do endereço (#reserva), senão a do meu segmento
  const doEndereco = location.hash.slice(1);
  abrirSegmento(NOME_SEGMENTO[doEndereco] ? doEndereco : aluno.segmento);
}

function abrirSegmento(segmento) {
  for (const botao of document.querySelectorAll('#abas-segmento [data-segmento]')) {
    botao.setAttribute('aria-selected', botao.dataset.segmento === segmento);
  }
  history.replaceState(null, '', `#${segmento}`);

  desenharMedias(segmento);

  const linhas = ranking.filter((r) => r.segmento === segmento);
  document.getElementById('linhas-ranking').innerHTML = linhas.length
    ? linhas.map(htmlLinha).join('')
    : '<tr><td colspan="5" class="vazio">Ninguém neste segmento ainda.</td></tr>';

  // "Ir para mim" só aparece na aba onde eu estou
  document.getElementById('ir-para-mim').hidden = !linhas.some((r) => r.sou_eu);
}

function htmlLinha(r) {
  const falta = r.pendencias > 0
    ? `<span class="pendencia">${r.pendencias === 1 ? 'falta 1 nota' : `faltam ${r.pendencias} notas`}</span>`
    : '';
  return `
    <tr${r.sou_eu ? ' class="eu" id="minha-linha" tabindex="-1"' : ''}>
      <td class="num">${r.posicao ?? '-'}</td>
      <td>${esc(r.nome)}${falta}</td>
      <td class="num">${formatar(r.media_graduacao, 4)}</td>
      <td class="num">${formatar(r.media_militar, 4)}</td>
      <td class="num ncf">${formatar(r.ncf, 4)}</td>
    </tr>`;
}

// Cartão com as médias do segmento da aba e da turma toda (linha com segmento null)
function desenharMedias(segmento) {
  const doSegmento = medias.find((m) => m.segmento === segmento) ?? {};
  const turmaToda = medias.find((m) => m.segmento == null) ?? {};
  const linha = (rotulo, campo, casas = 4) => `
    <tr><th>${rotulo}</th><td class="num">${formatar(doSegmento[campo], casas)}</td><td class="num">${formatar(turmaToda[campo], casas)}</td></tr>`;

  document.getElementById('medias-turma').innerHTML = `
    <h2 class="cartao-titulo">Médias da turma</h2>
    <table class="tabela-medias">
      <thead><tr><th></th><th class="num">${NOME_SEGMENTO[segmento]}</th><th class="num">Turma toda</th></tr></thead>
      <tbody>
        ${linha('Graduação', 'media_graduacao')}
        ${linha('Militar', 'media_militar')}
        ${linha('NCF', 'media_ncf')}
        ${linha('Alunos com nota', 'alunos', 0)}
      </tbody>
    </table>`;
}

// Aviso em cima se EU tenho notas faltando (nota não lançada conta como zero no NCF)
function mostrarAvisoPendencias() {
  const eu = ranking.find((r) => r.sou_eu);
  if (!eu || eu.pendencias === 0) return;
  const aviso = document.getElementById('aviso-pendencias');
  const texto = eu.pendencias === 1 ? 'Falta 1 nota sua' : `Faltam ${eu.pendencias} notas suas`;
  aviso.innerHTML = `${texto} em avaliações que a turma já fez. Enquanto não lançar, elas contam como zero no seu NCF. <a href="notas.html">Lançar notas</a>`;
  aviso.hidden = false;
}

function irParaMim() {
  const minhaLinha = document.getElementById('minha-linha');
  if (!minhaLinha) return;
  minhaLinha.scrollIntoView({ behavior: 'smooth', block: 'center' });
  minhaLinha.focus({ preventScroll: true });
  // pisca a linha para o olho achar
  minhaLinha.classList.remove('piscar');
  void minhaLinha.offsetWidth;
  minhaLinha.classList.add('piscar');
}

// ---------- Início ----------
// Fica no fim do arquivo para que tudo acima já exista quando a página montar
const aluno = await iniciarPagina();
if (aluno) await montarPagina(aluno);
