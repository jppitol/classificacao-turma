-- =====================================================================
-- Ordem das avaliações na tela = ordem em que as provas acontecem:
--   VE 1, VC, VE 2, VF   (antes era VE 1, VE 2, VC, VF)
-- Só muda a coluna "ordem" (posição na lista); pesos, notas e médias não mudam.
-- Rodar UMA vez no SQL Editor do Supabase, depois do 01 ao 04.
-- =====================================================================
-- Troca VE 2 (posição 2) com VC (posição 3), só nas disciplinas que estão
-- exatamente assim. ICM (VE 1, VE 2, VE 3, VC, VF) e Instrução Militar IV
-- (VE 1, Conceito, VC, VF) ficam como estão.
update public.avaliacoes
set ordem = case nome when 'VC' then 2 else 3 end
where ((nome = 'VC' and ordem = 3) or (nome = 'VE 2' and ordem = 2))
  and disciplina_id in (select disciplina_id from public.avaliacoes where nome = 'VC'   and ordem = 3)
  and disciplina_id in (select disciplina_id from public.avaliacoes where nome = 'VE 2' and ordem = 2);
