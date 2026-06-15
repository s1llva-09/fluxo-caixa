// ============================================================================
//  state.js — Estado compartilhado entre as telas
// ============================================================================
//  Um lugarzinho só pra guardar coisas que várias telas precisam, tipo a
//  empresa atual e a lista de categorias (pra não buscar no banco toda hora).
// ============================================================================

export const state = {
  user: null, // usuário logado
  company: null, // empresa atual { id, name, ... }
  categorias: [], // cache das categorias da empresa
};

// Recorta o período do mês atual ({ de, ate }) no formato do banco.
// Usado como filtro padrão do dashboard e dos lançamentos.
export function mesAtual() {
  const hoje = new Date();
  const ano = hoje.getFullYear();
  const mes = hoje.getMonth(); // 0-11
  const primeiro = new Date(ano, mes, 1);
  const ultimo = new Date(ano, mes + 1, 0);
  const iso = (d) => d.toISOString().slice(0, 10);
  return { de: iso(primeiro), ate: iso(ultimo) };
}
