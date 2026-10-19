// Página de entrar / criar conta / esqueci a senha.
import { supabase } from './supabase.js';
import { traduzirErro } from './formato.js';

// Para onde os links dos emails (confirmação e nova senha) trazem a pessoa de volta
const URL_INICIAL = new URL('index.html', location.href).href;
const PRIMEIRA_PAGINA = 'notas.html';

// Lido antes do Supabase limpar o endereço: o link de "esqueci a senha" chega com
// "#...type=recovery" e um link vencido chega com "#error_description=..."
const parametrosDoLink = new URLSearchParams(location.hash.slice(1));
let trocandoSenha = parametrosDoLink.get('type') === 'recovery';

const mensagem = document.getElementById('mensagem');
const abas = document.getElementById('abas');

function mostrarMensagem(texto, tipo = 'erro') {
  mensagem.textContent = texto;
  mensagem.className = `mensagem ${tipo}`;
  mensagem.hidden = false;
}

function abrirPainel(nome) {
  mensagem.hidden = true;
  for (const botao of abas.querySelectorAll('[data-aba]')) {
    botao.setAttribute('aria-selected', botao.dataset.aba === nome);
  }
  for (const form of document.querySelectorAll('[data-painel]')) {
    form.hidden = form.dataset.painel !== nome;
  }
  abas.hidden = nome === 'nova-senha';
}

// Desativa o botão enquanto espera o Supabase, para não enviar duas vezes
async function enviando(form, acao) {
  const botao = form.querySelector('button[type="submit"]');
  botao.disabled = true;
  try {
    await acao(new FormData(form));
  } catch (e) {
    mostrarMensagem('Sem conexão com o servidor. Tente de novo.');
    console.error(e);
  } finally {
    botao.disabled = false;
  }
}

abas.addEventListener('click', (evento) => {
  const botao = evento.target.closest('[data-aba]');
  if (botao) abrirPainel(botao.dataset.aba);
});

document.getElementById('form-entrar').addEventListener('submit', (evento) => {
  evento.preventDefault();
  enviando(evento.target, async (dados) => {
    const { error } = await supabase.auth.signInWithPassword({
      email: dados.get('email').trim(),
      password: dados.get('senha'),
    });
    if (error) return mostrarMensagem(traduzirErro(error));
    location.replace(PRIMEIRA_PAGINA);
  });
});

document.getElementById('form-criar').addEventListener('submit', (evento) => {
  evento.preventDefault();
  enviando(evento.target, async (dados) => {
    if (dados.get('senha') !== dados.get('confirmar')) {
      return mostrarMensagem('As duas senhas não são iguais.');
    }
    const email = dados.get('email').trim().toLowerCase();
    const { error } = await supabase.auth.signUp({
      email,
      password: dados.get('senha'),
      options: { emailRedirectTo: URL_INICIAL },
    });
    if (error) return mostrarMensagem(traduzirErro(error));
    evento.target.reset();
    mostrarMensagem(`Conta criada. Enviamos um email para ${email}: abra o link para confirmar e depois entre.`, 'sucesso');
  });
});

document.getElementById('form-esqueci').addEventListener('submit', (evento) => {
  evento.preventDefault();
  enviando(evento.target, async (dados) => {
    const { error } = await supabase.auth.resetPasswordForEmail(dados.get('email').trim(), {
      redirectTo: URL_INICIAL,
    });
    if (error) return mostrarMensagem(traduzirErro(error));
    mostrarMensagem('Se esse email tiver conta, enviamos um link para criar uma senha nova. Veja também o spam.', 'sucesso');
  });
});

document.getElementById('form-nova-senha').addEventListener('submit', (evento) => {
  evento.preventDefault();
  enviando(evento.target, async (dados) => {
    if (dados.get('senha') !== dados.get('confirmar')) {
      return mostrarMensagem('As duas senhas não são iguais.');
    }
    const { error } = await supabase.auth.updateUser({ password: dados.get('senha') });
    if (error) return mostrarMensagem(traduzirErro(error));
    location.replace(PRIMEIRA_PAGINA);
  });
});

// O Supabase avisa quando a sessão muda:
//  - PASSWORD_RECOVERY: a pessoa chegou pelo link de "esqueci a senha"
//  - INITIAL_SESSION: estado ao abrir a página; se já está logado, vai direto para as notas
supabase.auth.onAuthStateChange((evento, sessao) => {
  if (evento === 'PASSWORD_RECOVERY') {
    trocandoSenha = true;
    abrirPainel('nova-senha');
  } else if (evento === 'INITIAL_SESSION' && sessao && !trocandoSenha) {
    location.replace(PRIMEIRA_PAGINA);
  }
});

if (trocandoSenha) {
  abrirPainel('nova-senha');
} else if (parametrosDoLink.get('error_description')) {
  mostrarMensagem('Este link não vale mais (já foi usado ou venceu). Peça outro.');
}
