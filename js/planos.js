// ============================================================================
//  planos.js — Planos e quais módulos cada um libera
// ----------------------------------------------------------------------------
//  O plano fica em companies.plan. Módulos "core" (dashboard, lançamentos,
//  contas, categorias, relatórios, config, admin) estão SEMPRE liberados;
//  só os módulos abaixo são controlados por plano.
// ============================================================================

// Módulos controlados por plano (o resto é sempre liberado).
export const MODULOS_GATED = ["vendas", "estoque", "clientes", "funcionarios"];

export const PLANOS = {
  // Trial (padrão de quem cria conta): acesso total pra experimentar.
  trial:       { nome: "Trial", modulos: ["vendas", "estoque", "clientes", "funcionarios"] },
  pro:         { nome: "Pro", modulos: ["vendas", "estoque", "clientes"] },
  empresarial: { nome: "Empresarial", modulos: ["vendas", "estoque", "clientes", "funcionarios"] },
};

export function planoDe(company) {
  return (company && company.plan) || "trial";
}

export function moduloLiberado(plan, tela) {
  if (!MODULOS_GATED.includes(tela)) return true; // core: sempre
  const p = PLANOS[plan] || PLANOS.trial;
  return p.modulos.includes(tela);
}

export function nomePlano(plan) {
  return (PLANOS[plan] || PLANOS.trial).nome;
}
