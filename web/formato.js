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
