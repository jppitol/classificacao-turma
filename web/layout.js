// Parte comum das páginas logadas: confere o login, busca o cadastro do aluno
// e desenha o topo com o nome de guerra e a barra de navegação.
import { supabase } from './supabase.js';

const PAGINAS = [
  { arquivo: 'notas.html',       nome: 'Minhas notas' },
  { arquivo: 'ranking.html',     nome: 'Ranking' },
  { arquivo: 'desempenho.html',  nome: 'Meu desempenho' },
  { arquivo: 'engenharias.html', nome: 'Engenharias' },
  { arquivo: 'perfil.html',      nome: 'Perfil' },
];

export async function sair() {
  await supabase.auth.signOut();
  location.replace('index.html');
}

// Chame no começo de cada página. Devolve a linha do aluno em "alunos"
// ou null (sem login ou conta não vinculada; nesse caso a página não deve fazer mais nada).
export async function iniciarPagina() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    location.replace('index.html');
    return null;
  }

  // Se sair em outra aba, esta também volta para o login
  supabase.auth.onAuthStateChange((evento) => {
    if (evento === 'SIGNED_OUT') location.replace('index.html');
  });

  // O RLS só deixa ver a própria linha, então não precisa de filtro
  const { data: aluno, error } = await supabase
    .from('alunos')
    .select('id, nome_guerra, segmento, ocultar_no_ranking')
    .maybeSingle();

  desenharTopo(aluno?.nome_guerra ?? session.user.email);
  const conteudo = document.getElementById('conteudo');
  document.getElementById('carregando')?.remove();
  conteudo.hidden = false;

  if (error) {
    conteudo.innerHTML = '<p class="mensagem erro">Não foi possível carregar seus dados. Recarregue a página.</p>';
    console.error(error);
    return null;
  }
  if (!aluno) {
    conteudo.innerHTML = '<p class="mensagem erro">Conta não vinculada, fale com o administrador.</p>';
    return null;
  }
  return aluno;
}

function desenharTopo(nome) {
  const atual = location.pathname.split('/').pop();
  const topo = document.createElement('header');
  topo.className = 'topo';
  topo.innerHTML = `
    <div class="topo-linha">
      <a class="marca" href="notas.html">Turma XXX</a>
      <span class="usuario"><strong></strong> <button type="button" class="botao-link">Sair</button></span>
    </div>
    <nav class="nav">
      ${PAGINAS.map((p) => `<a href="${p.arquivo}"${p.arquivo === atual ? ' aria-current="page"' : ''}>${p.nome}</a>`).join('')}
    </nav>`;
  topo.querySelector('strong').textContent = nome;   // textContent: nome nunca vira HTML
  topo.querySelector('button').addEventListener('click', sair);
  document.body.prepend(topo);
  topo.querySelector('[aria-current]')?.scrollIntoView({ inline: 'center', block: 'nearest' });
}
