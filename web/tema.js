// Tema claro / escuro / automático. Script comum (não módulo), carregado no <head> de
// todas as páginas ANTES do CSS, para a página já abrir no tema certo, sem piscar.
// A escolha fica guardada só neste navegador (localStorage).
(function () {
  const CHAVE = 'tema';   // 'claro', 'escuro' ou 'auto'
  const ORDEM = ['auto', 'claro', 'escuro'];   // ordem do botão do topo
  const NOMES = { auto: 'Automático', claro: 'Claro', escuro: 'Escuro' };
  // ícones do botão (desenhados com a cor do texto)
  const ICONES = {
    claro: '<circle cx="12" cy="12" r="4.5"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    escuro: '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z"/>',
    auto: '<circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 3.5a8.5 8.5 0 0 1 0 17z"/>',
  };

  function obter() {
    try {
      const salvo = localStorage.getItem(CHAVE);
      return salvo === 'claro' || salvo === 'escuro' ? salvo : 'auto';
    } catch (e) {
      return 'auto';   // navegador bloqueou o armazenamento: segue o sistema
    }
  }

  function aplicar(tema) {
    if (tema === 'auto') delete document.documentElement.dataset.tema;
    else document.documentElement.dataset.tema = tema;
  }

  let atual = obter();

  function definir(tema) {
    atual = tema;
    try {
      if (tema === 'auto') localStorage.removeItem(CHAVE);
      else localStorage.setItem(CHAVE, tema);
    } catch (e) { /* sem armazenamento: vale só até fechar a página */ }
    aplicar(tema);
    // avisa o botão do topo e o Perfil, para os dois mostrarem a mesma escolha
    window.dispatchEvent(new CustomEvent('tema-mudou', { detail: tema }));
  }

  // Botão que troca o tema a cada toque: Automático -> Claro -> Escuro -> Automático
  function criarBotao() {
    const botao = document.createElement('button');
    botao.type = 'button';
    botao.className = 'botao-tema';
    const desenhar = () => {
      botao.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">${ICONES[atual]}</svg>`;
      botao.title = `Tema: ${NOMES[atual]} (toque para trocar)`;
      botao.setAttribute('aria-label', botao.title);
    };
    botao.addEventListener('click', () => definir(ORDEM[(ORDEM.indexOf(atual) + 1) % ORDEM.length]));
    window.addEventListener('tema-mudou', desenhar);
    desenhar();
    return botao;
  }

  aplicar(atual);
  window.tema = { obter: () => atual, definir, criarBotao, NOMES };
})();
