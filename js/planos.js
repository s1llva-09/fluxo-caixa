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

// Quantas pessoas podem acessar a empresa, por plano. A landing vende "até 3
// usuários" no Pro e "ilimitado" no Empresarial desde sempre; até agora nada
// no código contava ninguém, então a promessa não valia nos dois sentidos —
// nem limitava quem devia, nem dava o que estava vendido.
//
// O trial acompanha o Pro: é uma prévia do plano, não um plano melhor.
//
// ATENÇÃO: isto é a trava da INTERFACE. A trava de verdade é no banco (RLS na
// tabela invites); aqui é só pra não oferecer o que vai ser recusado.
const LIMITE_USUARIOS = { trial: 3, pro: 3, empresarial: Infinity };

export function limiteUsuarios(plan) {
  return LIMITE_USUARIOS[plan] ?? LIMITE_USUARIOS.trial;
}

// Cabe mais alguém? `usados` = membros atuais + convites pendentes, porque um
// convite pendente já é uma vaga prometida.
export function cabeMaisUsuario(plan, usados) {
  return usados < limiteUsuarios(plan);
}

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
