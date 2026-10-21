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

// Cor de cada disciplina, igual aos cabeçalhos da planilha (a cor segue a "posição" da
// disciplina no semestre: Física, Cálculo, Álgebra/Mecânica...). Só aparência, não vai pro banco.
const CORES_PLANILHA = {
  '#A2C4C9': ['Física I', 'Física II', 'Física III', 'Física IV'],
  '#93C47D': ['Cálculo I', 'Cálculo II', 'Cálculo III', 'Cálculo IV'],
  '#8E7CC3': ['Álgebra Linear I', 'Álgebra Linear II', 'Mecânica I', 'Mecânica II'],
  '#E69138': ['IC', 'Desenho Técnico', 'ICM', 'Resistência dos Materiais'],
  '#EA9999': ['Química I', 'Química II', 'Eletricidade Técnica', 'Cálculo Numérico'],
  '#D5A6BD': ['Probabilidade'],
  '#4A86E8': ['Laboratório de Física I', 'Laboratório de Física II', 'IPE I', 'IPE II',
              'TAF II', 'TAF III', 'TAF IV'],
  '#6AA84F': ['Laboratório de Química I', 'Laboratório de Química II',
              'Laboratório de Física III', 'Laboratório de Física IV'],
  '#9FC5E8': ['Instrução Militar I', 'Instrução Militar II', 'Instrução Militar III', 'Instrução Militar IV', 'TAF I'],
};
const COR_POR_DISCIPLINA = new Map(
  Object.entries(CORES_PLANILHA).flatMap(([cor, nomes]) => nomes.map((nome) => [nome, cor])));

// style="--cor: #..." para pôr no cartão da disciplina (vazio se a disciplina não estiver na lista)
export function estiloCor(nomeDisciplina) {
  const cor = COR_POR_DISCIPLINA.get(nomeDisciplina);
  return cor ? ` style="--cor: ${cor}"` : '';
}

// Lista de notas que faltam (de minhas_pendencias), cada uma é um link que abre Minhas notas
// direto no campo dela (notas.html#av-123). Mostra as primeiras e "e mais N".
export function htmlPendencias(lista, limite = 6) {
  const itens = lista.slice(0, limite).map((p) =>
    `<li><a href="notas.html#av-${p.avaliacao_id}">${ROTULO_SEMESTRE[p.semestre]} · ${esc(p.disciplina)} · ${esc(p.avaliacao)}</a></li>`).join('');
  const resto = lista.length > limite ? `<li class="dica" style="margin:0">e mais ${lista.length - limite}</li>` : '';
  return `<ul class="lista-pendencias">${itens}${resto}</ul>`;
}
