// ============================================================================
//  state.js — Estado compartilhado entre as telas
// ============================================================================
//  Um lugarzinho só pra guardar coisas que várias telas precisam, tipo a
//  empresa atual e a lista de categorias (pra não buscar no banco toda hora).
// ============================================================================

export const state = {
  user: null, // usuário logado
  company: null, // empresa atual { id, name, status, plan_until, ... }
  categorias: [], // cache das categorias da empresa
  isAdmin: false, // se o usuário logado é o admin do sistema
};

// Diz se uma empresa está com o acesso liberado (não bloqueada e não vencida).
// Espelha a regra company_active() do banco, pra decidir o que mostrar no front.
export function empresaAtiva(company) {
  if (!company) return false;
  if (company.status === "blocked") return false;
  if (company.plan_until) {
    const hoje = new Date().toISOString().slice(0, 10);
    if (company.plan_until < hoje) return false;
  }
  return true;
}

// "YYYY-MM" do mês corrente — a chave que o <input type="month"> usa.
export function mesChaveAtual() {
  const hoje = new Date();
  return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;
}

// Recorta o período de um mês ({ de, ate }) no formato do banco, a partir da
// chave "YYYY-MM".
//
// Monta as datas como texto em vez de passar Date por toISOString(): aquele
// caminho converte pra UTC, e a meia-noite local de um fuso positivo cai no
// dia anterior em UTC — o primeiro dia do mês voltava como o último do mês
// passado. Com fuso do Brasil (negativo) nunca deu problema, mas é uma
// armadilha que não precisa existir num recorte que é só aritmética de calendário.
export function periodoDoMes(chave) {
  const [ano, mes] = chave.split("-").map(Number);
  // Dia 0 do mês seguinte = último dia deste mês. getDate() lê o componente
  // local, sem passar por UTC.
  const ultimoDia = new Date(ano, mes, 0).getDate();
  const pad = (n) => String(n).padStart(2, "0");
  return { de: `${ano}-${pad(mes)}-01`, ate: `${ano}-${pad(mes)}-${pad(ultimoDia)}` };
}

// Mês anterior a uma chave "YYYY-MM".
export function mesAnterior(chave) {
  const [ano, mes] = chave.split("-").map(Number);
  return mes === 1
    ? `${ano - 1}-12`
    : `${ano}-${String(mes - 1).padStart(2, "0")}`;
}

// Período do mês corrente. Filtro padrão do dashboard, lançamentos e relatórios.
export function mesAtual() {
  return periodoDoMes(mesChaveAtual());
}
