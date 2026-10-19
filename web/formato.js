// Funções de formatação usadas por várias páginas.

// Nome das abas de semestre: ano.semestre (o 3º semestre é o 1º semestre do 2º ano)
export const ROTULO_SEMESTRE = { 1: '1.1', 2: '1.2', 3: '2.1', 4: '2.2' };

// Escapa texto vindo do banco antes de pôr no HTML
export function esc(texto) {
  const div = document.createElement('div');
  div.textContent = texto;
  return div.innerHTML;
}

// formatar(7.5) -> "7,50"; formatar(7.5, 4) -> "7,5000"; null -> "-"
// Com máximo maior que o mínimo, não corta casas: formatar(8.325, 2, 4) -> "8,325"
export function formatar(numero, casas = 2, maxCasas = casas) {
  if (numero == null) return '-';
  return Number(numero).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: maxCasas });
}

export const NOME_SEGMENTO = { ativa: 'Ativa', reserva: 'Reserva' };

// Mensagens do Supabase em inglês -> português. O erro do cadastro de email fora
// da lista já vem em português do banco, então cai no "error.message".
export function traduzirErro(error) {
  const traducoes = {
    invalid_credentials: 'Email ou senha incorretos.',
    email_not_confirmed: 'Confirme seu email antes de entrar (veja a caixa de entrada e o spam).',
    weak_password: 'Senha fraca. Use pelo menos 6 caracteres.',
    same_password: 'A senha nova precisa ser diferente da atual.',
    over_email_send_rate_limit: 'Muitos emails enviados. Espere alguns minutos e tente de novo.',
    over_request_rate_limit: 'Muitas tentativas. Espere alguns minutos e tente de novo.',
    user_already_exists: 'Já existe conta com este email. Use "Entrar" ou "Esqueci a senha".',
    reauthentication_needed: 'Por segurança, saia, entre de novo e tente outra vez.',
  };
  return traducoes[error.code] || error.message;
}
