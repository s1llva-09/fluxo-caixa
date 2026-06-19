// ============================================================================
//  views/dashboard.js — Visão geral do caixa
// ============================================================================

import Chart from "https://esm.sh/chart.js@4/auto";
import { el, $, emptyState, errorState, ICONS } from "../ui.js";
import { state, mesAtual } from "../state.js";
import { listarLancamentos, listarContas } from "../api.js";
import { formatBRL, formatDate } from "../money.js";

let chartRef = null;

export async function renderDashboard(root) {
  root.innerHTML = "";
  root.append(dashSkeleton());

  let todos;
  try {
    todos = await listarLancamentos({ companyId: state.company.id });
  } catch (err) {
    console.error(err);
    root.innerHTML = "";
    root.append(errorState("Não foi possível carregar o painel.", () => renderDashboard(root)));
    return;
  }

  const saldo = somaSaldo(todos);

  // Contas em aberto (não-fatal: se a migração não rodou ainda, ignora).
  let pendentes = [];
  try {
    pendentes = await listarContas(state.company.id, "pending");
  } catch (err) {
    console.error("Contas:", err);
  }
  const aReceber = pendentes.filter((c) => c.kind === "entrada").reduce((s, c) => s + c.amount_cents, 0);
  const aPagar = pendentes.filter((c) => c.kind === "saida").reduce((s, c) => s + c.amount_cents, 0);

  const { de, ate } = mesAtual();
  const doMes = todos.filter((t) => t.occurred_on >= de && t.occurred_on <= ate);
  const entradasMes = somaPorTipo(doMes, "entrada");
  const saidasMes = somaPorTipo(doMes, "saida");
  const resultadoMes = entradasMes - saidasMes;

  const mesAno = new Date().toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

  root.innerHTML = "";
  // .filter(Boolean): o root.append nativo transforma null em texto "null";
  // por isso filtramos os blocos opcionais (ex.: "Em aberto") antes.
  root.append(...[
    el("header", { class: "page-head page-head--row" },
      el("div", {},
        el("h1", { class: "page-title" }, saudacao()),
        el("p", { class: "page-sub" }, `Resumo de ${mesAno}`)
      )
    ),

    el("section", { class: `saldo ${saldo >= 0 ? "is-pos" : "is-neg"}` },
      el("span", { class: "saldo__label" }, "Saldo total acumulado"),
      el("span", { class: "saldo__value num" }, formatBRL(saldo)),
      el("span", { class: "saldo__hint" }, saldo >= 0
        ? "Seu negócio está no azul — continue assim!"
        : "Fique de olho nas saídas para voltar ao positivo.")
    ),

    el("section", { class: "stats" },
      statCard("Entradas do mês", entradasMes, "entrada"),
      statCard("Saídas do mês",   saidasMes,   "saida"),
      statCard("Resultado do mês", resultadoMes, resultadoMes >= 0 ? "entrada" : "saida")
    ),

    // Só aparece se houver contas em aberto.
    (aReceber || aPagar)
      ? el("section", { class: "stats admin-resumo" },
          statCard("A receber", aReceber, "entrada"),
          statCard("A pagar", aPagar, "saida"),
          (() => {
            const proj = saldo + aReceber - aPagar;
            return statCard("Saldo projetado", proj, proj >= 0 ? "entrada" : "saida");
          })()
        )
      : null,

    el("section", { class: "card chart-card" },
      el("div", { class: "card__head" },
        el("h2", { class: "card__title" }, "Histórico — Últimos 6 meses"),
        el("span", { class: "card__hint" }, "Compare entradas e saídas mês a mês")
      ),
      el("div", { class: "chart-wrap" }, el("canvas", { id: "chart-meses" }))
    ),

    el("section", { class: "card" },
      el("div", { class: "card__head" },
        el("h2", { class: "card__title" }, "Lançamentos recentes"),
        el("button", {
          class: "btn btn--tiny btn--ghost",
          onclick: () => document.querySelector('[data-tela="lancamentos"]')?.click(),
        }, "Ver todos →")
      ),
      listaRecentes(todos.slice(0, 8))
    )
  ].filter(Boolean));

  desenharGrafico(todos);
}

// ---- skeleton de carregamento (espelha o layout real) ---------------------

function dashSkeleton() {
  const stat = () => el("div", { class: "card stat" },
    el("div", { class: "sk sk--line sk--w40" }),
    el("div", { class: "sk sk--block", style: "height:26px;width:60%;margin-top:4px;" })
  );
  return el("div", { class: "dash-skeleton", "aria-hidden": "true" },
    el("div", { class: "saldo", style: "gap:14px;" },
      el("div", { class: "sk sk--line sk--w24" }),
      el("div", { class: "sk sk--block", style: "height:48px;width:46%;" }),
      el("div", { class: "sk sk--line sk--w40" })
    ),
    el("section", { class: "stats" }, stat(), stat(), stat()),
    el("section", { class: "card" },
      el("div", { class: "sk sk--line sk--w24", style: "margin-bottom:20px;" }),
      el("div", { class: "sk sk--block", style: "height:264px;" })
    )
  );
}

// ---- saudação baseada no horário -------------------------------------------

function saudacao() {
  const h = new Date().getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

// ---- pedacinhos de UI -------------------------------------------------------

const STAT_ICONS = {
  entrada: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>`,
  saida:   `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>`,
};

function statCard(label, cents, tipo) {
  return el("div", { class: `card stat stat--${tipo}` },
    el("div", { class: "stat__header" },
      el("span", { class: "stat__label" }, label),
      STAT_ICONS[tipo]
        ? el("span", { class: "stat__icon", html: STAT_ICONS[tipo] })
        : null
    ),
    el("span", { class: "stat__value num" }, formatBRL(cents))
  );
}

function listaRecentes(itens) {
  if (itens.length === 0) {
    const cta = el("button", {
      class: "btn btn--primary",
      style: "margin-top: 12px;",
      onclick: () => document.querySelector('[data-tela="lancamentos"]')?.click(),
    }, "+ Registrar primeiro lançamento");
    const wrap = el("div", { class: "empty-state" },
      el("div", { class: "empty-state__icon", html: ICONS.dashboard }),
      el("p", { class: "empty-state__text" }, "Nenhum lançamento ainda. Comece registrando uma entrada ou saída."),
      cta
    );
    return wrap;
  }
  const lista = el("ul", { class: "tx-list" });
  for (const t of itens) {
    lista.append(
      el("li", { class: `tx tx--${t.kind} ${t.is_reversed ? "is-reversed" : ""}` },
        el("div", { class: "tx__main" },
          el("span", { class: "tx__desc" }, el("span", {}, t.description || "(sem descrição)")),
          el("span", { class: "tx__meta" },
            `${formatDate(t.occurred_on)}${t.categories?.name ? " · " + t.categories.name : ""}`)
        ),
        el("span", { class: "tx__value num" },
          (t.kind === "entrada" ? "+ " : "− ") + formatBRL(t.amount_cents))
      )
    );
  }
  return lista;
}

// ---- cálculos ---------------------------------------------------------------

function somaPorTipo(itens, tipo) {
  return itens
    .filter((t) => t.kind === tipo)
    .reduce((acc, t) => acc + t.amount_cents, 0);
}

function somaSaldo(itens) {
  return itens.reduce(
    (acc, t) => acc + (t.kind === "entrada" ? t.amount_cents : -t.amount_cents),
    0
  );
}

// ---- gráfico ----------------------------------------------------------------

function desenharGrafico(todos) {
  const canvas = $("#chart-meses");
  if (!canvas) return;

  const meses = [];
  const base = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
    meses.push({
      chave: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      rotulo: d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", ""),
      entrada: 0,
      saida: 0,
    });
  }
  for (const t of todos) {
    const chave = t.occurred_on.slice(0, 7);
    const m = meses.find((x) => x.chave === chave);
    if (m) m[t.kind] += t.amount_cents;
  }

  if (chartRef) chartRef.destroy();

  const font = "'Inter', system-ui, sans-serif";
  const mono = "'Inter', system-ui, sans-serif";

  // Cores vindas do tema atual (claro/escuro) — lidas das variáveis CSS.
  const css = getComputedStyle(document.documentElement);
  const v = (nome, fallback) => (css.getPropertyValue(nome).trim() || fallback);
  const mutedColor   = v("--c-muted", "#8B9E98");
  const gridColor    = v("--c-border", "rgba(221, 229, 226, 0.8)");
  const corEntrada   = v("--c-entrada", "#0E9F6E");
  const corSaida     = v("--c-saida", "#D92D20");

  chartRef = new Chart(canvas, {
    type: "bar",
    data: {
      labels: meses.map((m) => m.rotulo),
      datasets: [
        {
          label: "Entradas",
          data: meses.map((m) => m.entrada / 100),
          backgroundColor: corEntrada,
          borderRadius: 7,
          borderSkipped: false,
        },
        {
          label: "Saídas",
          data: meses.map((m) => m.saida / 100),
          backgroundColor: corSaida,
          borderRadius: 7,
          borderSkipped: false,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            boxWidth: 10,
            boxHeight: 10,
            borderRadius: 3,
            useBorderRadius: true,
            font: { family: font, size: 12 },
            color: mutedColor,
            padding: 20,
          },
        },
        tooltip: {
          backgroundColor: "#1E293B",
          titleFont: { family: font, size: 12 },
          bodyFont: { family: mono, size: 12 },
          padding: 12,
          cornerRadius: 8,
          callbacks: {
            label: (ctx) =>
              `  ${ctx.dataset.label}: R$ ${ctx.raw.toLocaleString("pt-BR", {
                minimumFractionDigits: 2,
              })}`,
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          border: { display: false },
          ticks: { font: { family: font, size: 12 }, color: mutedColor },
        },
        y: {
          grid: { color: gridColor },
          border: { display: false, dash: [4, 4] },
          ticks: {
            callback: (v) =>
              "R$ " + v.toLocaleString("pt-BR", { minimumFractionDigits: 0 }),
            font: { family: font, size: 11 },
            color: mutedColor,
          },
        },
      },
    },
  });
}
