// Página "Perfil": meus dados, trocar a senha e sair.
import { supabase } from './supabase.js';
import { iniciarPagina, sair } from './layout.js';
import { NOME_SEGMENTO, traduzirErro } from './formato.js';

function mostrarMensagem(texto, tipo = 'erro') {
  const mensagem = document.getElementById('mensagem');
  mensagem.textContent = texto;
  mensagem.className = `mensagem ${tipo}`;
  mensagem.hidden = false;
}

function montarPagina(aluno) {
  // textContent: o que vem do banco nunca vira HTML
  document.getElementById('nome-guerra').textContent = aluno.nome_guerra;
  document.getElementById('segmento').textContent = NOME_SEGMENTO[aluno.segmento];
  document.getElementById('email').textContent = aluno.email;

  document.getElementById('form-senha').addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const form = evento.target;
    const dados = new FormData(form);
    if (dados.get('senha') !== dados.get('confirmar')) {
      return mostrarMensagem('As duas senhas não são iguais.');
    }
    const botao = form.querySelector('button[type="submit"]');
    botao.disabled = true;
    try {
      const { error } = await supabase.auth.updateUser({ password: dados.get('senha') });
      if (error) return mostrarMensagem(traduzirErro(error));
      form.reset();
      mostrarMensagem('Senha trocada. Use a nova senha no próximo login.', 'sucesso');
    } catch (e) {
      console.error(e);
      mostrarMensagem('Sem conexão com o servidor. Tente de novo.');
    } finally {
      botao.disabled = false;
    }
  });

  document.getElementById('sair').addEventListener('click', sair);
}

// ---------- Início ----------
// Fica no fim do arquivo para que tudo acima já exista quando a página montar
const aluno = await iniciarPagina();
if (aluno) montarPagina(aluno);
