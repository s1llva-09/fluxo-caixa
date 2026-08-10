// ============================================================================
//  views/dashboard.js — Visão geral do caixa
// ----------------------------------------------------------------------------
//  Layout inspirado no design de referência: cards de resumo, gráfico de área
//  "Fluxo de caixa", painel de "Composição de despesas" e lançamentos recentes.
//  Mantém a identidade Monetta (roxo) e as cores semânticas (verde/vermelho).
// ============================================================================

import Chart from "https://esm.sh/chart.js@4/auto";
import { el, $, emptyState, errorState, ICONS } from "../ui.js";
import { state, periodoDoMes, mesAnterior, mesChaveAtual } from "../state.js";
import { listarLancamentos, listarContas } from "../api.js";
import { formatBRL, formatDate, splitMoeda } from "../money.js";
import { variacaoPercentual } from "../regras.js";

let chartRef = null;
// Últimos lançamentos desenhados, pra poder repintar o gráfico numa troca de
// tema sem ir buscar tudo na API de novo.
let ultimosDados = null;

// Um único listener no módulo (não por render): ao trocar o tema, redesenha o
// gráfico se ele ainda estiver na tela. Se o usuário já navegou pra outra
// view, o canvas não existe mais e desenharGrafico() sai na primeira linha.
window.addEventListener("temachange", () => {
  if (ultimosDados) desenharGrafico(ultimosDados);
});

// Mês em foco ("YYYY-MM"). Mora no módulo, não no render, pra sobreviver a uma
// ida e volta a outra tela — quem estava conferindo março não volta pro mês
// corrente só por ter passado em Lançamentos.
let mesSelecionado = mesChaveAtual();

// <input type="month"> em vez de um seletor próprio: é um controle nativo, já
// vem com teclado, calendário e localização do sistema de graça.
function seletorDeMes(root) {
  const input = el("input", {
    type: "month",
    class: "input input--mes",
    value: mesSelecionado,
    "aria-label": "Mês do resumo",
  });
  input.addEventListener("change", () => {
    if (!input.value) return; // o campo aceita ser esvaziado; ignoramos
    mesSelecionado = input.value;
    renderDashboard(root);
  });
  return input;
}

// "2026-08" -> "Agosto 2026"
function nomeDoMes(chave) {
  const [ano, mes] = chave.split("-").map(Number);
  const nome = new Date(ano, mes - 1, 1).toLocaleDateString("pt-BR", { month: "long" });
  return `${nome.charAt(0).toUpperCase()}${nome.slice(1)} ${ano}`;
}

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

  // Conta nova: cinco indicadores zerados, um gráfico vazio e um "nenhuma
  // saída registrada" não ensinam nada e parecem defeito. Enquanto não houver
  // NENHUM lançamento, a tela tem um assunto só: o primeiro passo.
  if (todos.length === 0) {
    root.innerHTML = "";
    root.append(primeiroDia());
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

  const { de, ate } = periodoDoMes(mesSelecionado);
  const doMes = todos.filter((t) => t.occurred_on >= de && t.occurred_on <= ate);
  const entradasMes = somaPorTipo(doMes, "entrada");
  const saidasMes = somaPorTipo(doMes, "saida");
  const resultadoMes = entradasMes - saidasMes;

  // Mês anterior ao escolhido (pra tendência "vs mês passado").
  const mp = periodoDoMes(mesAnterior(mesSelecionado));
  const doMesPassado = todos.filter((t) => t.occurred_on >= mp.de && t.occurred_on <= mp.ate);
  const entradasAnt = somaPorTipo(doMesPassado, "entrada");
  const saidasAnt = somaPorTipo(doMesPassado, "saida");

  const ehMesCorrente = mesSelecionado === mesChaveAtual();
  const mesAno = nomeDoMes(mesSelecionado);

  root.innerHTML = "";
  root.append(...[
    el("header", { class: "page-head page-head--row" },
      el("div", {},
        // A saudação só faz sentido olhando o mês corrente. Num mês passado o
        // título passa a dizer o que a tela está mostrando de verdade.
        el("h1", { class: "page-title" }, ehMesCorrente ? saudacao() : mesAno),
        el("p", { class: "page-sub" },
          ehMesCorrente ? `Aqui está o resumo de ${mesAno}` : "Resumo do período selecionado")
      ),
      el("div", { class: "page-head__acoes" },
        seletorDeMes(root),
        el("button", {
          class: "btn btn--primary",
          onclick: () => document.querySelector('[data-tela="lancamentos"]')?.click(),
        }, "+ Novo lançamento")
      )
    ),

    // ---- resumo ----
    // Grade assimétrica: a placa de saldo ocupa a largura toda e entradas e
    // saídas ficam embaixo, em corpo menor. Três cards iguais diziam que as
    // três informações valem o mesmo, e não valem — o saldo é o que o dono
    // abriu o app pra ver.
    el("section", { class: "metrics metrics--dash" },
      // Saldo total é acumulado desde sempre, não do mês — por isso não muda
      // com o seletor; só o rodapé (o resultado do período) acompanha.
      metricCard("Saldo total", saldo, "saldo", deltaFoot(resultadoMes, ehMesCorrente), true),
      metricCard("Entradas do mês", entradasMes, "entrada", trendFoot(entradasMes, entradasAnt, "entrada")),
      metricCard("Saídas do mês", saidasMes, "saida", trendFoot(saidasMes, saidasAnt, "saida"))
    ),

    // ---- gráfico + composição ----
    el("section", { class: "dash-grid" },
      el("div", { class: "card" },
        el("div", { class: "card__head" },
          el("h2", { class: "card__title" }, "Fluxo de caixa"),
          el("span", { class: "card__hint" }, `6 meses até ${mesAno}`)
        ),
        el("div", { class: "chart-wrap" }, el("canvas", { id: "chart-meses" }))
      ),
      el("div", { class: "card" },
        el("div", { class: "card__head" },
          el("h2", { class: "card__title" }, "Composição de despesas"),
          el("span", { class: "card__hint" }, mesAno)
        ),
        composicaoDespesas(doMes)
      )
    ),

    // ---- contas em aberto (só se houver) ----
    (aReceber || aPagar)
      ? el("section", { class: "metrics metrics--3" },
          metricCard("A receber", aReceber, "entrada"),
          metricCard("A pagar", aPagar, "saida"),
          (() => {
            const proj = saldo + aReceber - aPagar;
            return metricCard("Saldo projetado", proj, proj >= 0 ? "entrada" : "saida");
          })()
        )
      : null,

    // ---- lançamentos recentes ----
    el("section", { class: "card" },
      el("div", { class: "card__head" },
        el("h2", { class: "card__title" }, "Lançamentos recentes"),
        el("button", {
          class: "btn btn--tiny btn--ghost",
          onclick: () => document.querySelector('[data-tela="lancamentos"]')?.click(),
        }, "Ver todos →")
      ),
      listaRecentes(todos.slice(0, 6))
    )
  ].filter(Boolean));

  desenharGrafico(todos);
}

// ---- primeiro dia -----------------------------------------------------------

function irPara(tela) {
  document.querySelector(`[data-tela="${tela}"]`)?.click();
}

function primeiroDia() {
  const passo = (n, titulo, texto, acao) =>
    el("li", { class: "primeiro__passo" },
      el("span", { class: "primeiro__n num" }, n),
      el("div", {},
        el("h3", { class: "primeiro__titulo" }, titulo),
        el("p", { class: "primeiro__texto" }, texto),
        acao || null
      )
    );

  return el("div", {},
    el("header", { class: "page-head" },
      el("h1", { class: "page-title" }, `${saudacao()}, tudo pronto`),
      el("p", { class: "page-sub" },
        `${state.company?.name || "Sua empresa"} está criada e as categorias mais usadas já vieram junto.`)
    ),
    el("section", { class: "card" },
      el("h2", { class: "card__title" }, "Comece por aqui"),
      el("ol", { class: "primeiro" },
        passo("1", "Registre o que entrou ou saiu hoje",
          "Um lançamento basta pra tela ganhar vida. Valor, data e pronto.",
          el("button", { class: "btn btn--primary", style: "margin-top:10px",
            onclick: () => irPara("lancamentos") }, "+ Novo lançamento")),
        passo("2", "Cadastre o que ainda vai vencer",
          "Contas a pagar e a receber não entram no saldo de hoje, mas entram no projetado: é ele que responde se o mês fecha no azul.",
          el("button", { class: "btn btn--ghost", style: "margin-top:10px",
            onclick: () => irPara("contas") }, "Ir para Contas")),
        passo("3", "Volte aqui no fim do dia",
          "Com lançamentos na mão, esta tela passa a mostrar saldo, entradas e saídas do mês e a comparação com o mês passado.")
      )
    )
  );
}

// ---- skeleton de carregamento ----------------------------------------------

function dashSkeleton() {
  const metric = () => el("div", { class: "card metric" },
    el("div", { class: "sk sk--line sk--w40" }),
    el("div", { class: "sk sk--block", style: "height:28px;width:65%;margin-top:6px;" }),
    el("div", { class: "sk sk--line sk--w24", style: "margin-top:6px;" })
  );
  const placa = () => el("div", { class: "card metric metric--placa" },
    el("div", { class: "sk sk--line sk--w24" }),
    el("div", { class: "sk sk--block", style: "height:58px;width:52%;margin-top:14px;" }),
    el("div", { class: "sk sk--line sk--w40", style: "margin-top:12px;" })
  );
  return el("div", { class: "dash-skeleton", "aria-hidden": "true" },
    el("section", { class: "metrics metrics--dash" }, placa(), metric(), metric()),
    el("section", { class: "dash-grid" },
      el("div", { class: "card" },
        el("div", { class: "sk sk--line sk--w24", style: "margin-bottom:20px;" }),
        el("div", { class: "sk sk--block", style: "height:264px;" })
      ),
      el("div", { class: "card" },
        el("div", { class: "sk sk--line sk--w40", style: "margin-bottom:20px;" }),
        el("div", { class: "sk sk--block", style: "height:200px;" })
      )
    )
  );
}

// ---- saudação --------------------------------------------------------------

function saudacao() {
  const h = new Date().getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

// ---- cards de resumo (metric) ----------------------------------------------

const METRIC_ICONS = {
  saldo:   `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/></svg>`,
  entrada: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></svg>`,
  saida:   `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="17" y1="7" x2="7" y2="17"/><polyline points="17 17 7 17 7 7"/></svg>`,
};

// `placa` transforma o card no elemento-assinatura: número em condensada
// pesada com a cifra pequena e erguida ao lado, do jeito que preço é escrito
// numa placa de banca. Fora da placa a cifra fica junto do número mesmo — em
// corpo pequeno, separá-la só abriria um buraco no meio do valor.
function metricCard(label, cents, tipo, foot, placa = false) {
  const cls = tipo === "entrada" || tipo === "saida" ? `metric--${tipo}` : "";
  const { cifra, valor } = splitMoeda(cents);
  return el("div", { class: `card metric ${cls} ${placa ? "metric--placa" : ""}` },
    el("div", { class: "metric__head" },
      el("span", { class: "metric__label" }, label),
      // O ícone repete o que o rótulo e a cor já dizem. Na placa ele sai:
      // ali o número é o assunto e nada mais disputa com ele.
      !placa && METRIC_ICONS[tipo]
        ? el("span", { class: `metric__icon metric__icon--${tipo}`, html: METRIC_ICONS[tipo] })
        : null
    ),
    placa
      ? el("span", { class: "metric__value num" },
          el("span", { class: "metric__cifra" }, cifra),
          el("span", {}, valor)
        )
      : el("span", { class: "metric__value num" }, formatBRL(cents)),
    foot || null
  );
}

// Rodapé do card Saldo: resultado do período (▲/▼ R$ X este mês / no mês).
function deltaFoot(cents, ehMesCorrente) {
  const quando = ehMesCorrente ? "este mês" : "no mês";
  if (!cents) return el("span", { class: "metric__foot" }, `Sem movimento ${quando}`);
  const pos = cents > 0;
  return el("span", { class: `metric__foot ${pos ? "is-up" : "is-down"}` },
    `${pos ? "▲" : "▼"} ${formatBRL(Math.abs(cents))} ${quando}`);
}

// Rodapé de tendência vs mês passado. Pra saídas, subir é "ruim" (vermelho).
function trendFoot(atual, anterior, tipo) {
  if (!anterior) {
    return el("span", { class: "metric__foot metric__foot--muted" },
      atual ? "Sem base do mês passado" : "Sem movimento");
  }
  const pct = variacaoPercentual(atual, anterior);
  const subiu = pct >= 0;
  const bom = tipo === "entrada" ? subiu : !subiu; // entrada subir = bom; saída subir = ruim
  return el("span", { class: `metric__foot ${bom ? "is-up" : "is-down"}` },
    `${subiu ? "▲" : "▼"} ${Math.abs(pct)}% vs mês passado`);
}

// ---- composição de despesas ------------------------------------------------

function composicaoDespesas(doMes) {
  const saidas = doMes.filter((t) => t.kind === "saida");
  const total = saidas.reduce((s, t) => s + t.amount_cents, 0);
  if (total === 0) {
    return el("p", { class: "config__hint", style: "margin:0" }, "Nenhuma saída registrada no mês.");
  }
  const grupos = {};
  for (const t of saidas) {
    const nome = t.categories?.name || "Sem categoria";
    grupos[nome] = (grupos[nome] || 0) + t.amount_cents;
  }
  const linhas = Object.entries(grupos).sort((a, b) => b[1] - a[1]).slice(0, 5);

  const box = el("div", { class: "compo" });
  for (const [nome, valor] of linhas) {
    const pct = Math.round((valor / total) * 100);
    box.append(
      el("div", { class: "compo__item" },
        el("div", { class: "compo__top" },
          el("span", { class: "compo__nome" }, nome),
          el("span", { class: "compo__pct num" }, `${pct}%`)
        ),
        el("div", { class: "compo__bar" }, el("div", { class: "compo__fill", style: `width:${pct}%` })),
        el("span", { class: "compo__val num" }, formatBRL(valor))
      )
    );
  }
  return box;
}

// ---- lançamentos recentes --------------------------------------------------

function listaRecentes(itens) {
  if (itens.length === 0) {
    const cta = el("button", {
      class: "btn btn--primary",
      style: "margin-top: 12px;",
      onclick: () => document.querySelector('[data-tela="lancamentos"]')?.click(),
    }, "+ Registrar primeiro lançamento");
    return el("div", { class: "empty-state" },
      el("div", { class: "empty-state__icon", html: ICONS.dashboard }),
      el("p", { class: "empty-state__text" }, "Nenhum lançamento ainda. Comece registrando uma entrada ou saída."),
      cta
    );
  }
  const lista = el("ul", { class: "tx-list" });
  for (const t of itens) {
    const cat = t.categories?.name;
    lista.append(
      el("li", { class: `tx tx--${t.kind} ${t.is_reversed ? "is-reversed" : ""}` },
        el("div", { class: "tx__main" },
          el("span", { class: "tx__desc" }, el("span", {}, t.description || "(sem descrição)")),
          el("span", { class: "tx__meta" },
            `${formatDate(t.occurred_on)}${t.party_name ? " · " + t.party_name : ""}`)
        ),
        cat ? el("span", { class: "tx__cat" }, cat) : null,
        el("span", { class: "tx__value num" },
          (t.kind === "entrada" ? "+ " : "− ") + formatBRL(t.amount_cents))
      )
    );
  }
  return lista;
}

// ---- cálculos --------------------------------------------------------------

function somaPorTipo(itens, tipo) {
  return itens.filter((t) => t.kind === tipo).reduce((acc, t) => acc + t.amount_cents, 0);
}

function somaSaldo(itens) {
  return itens.reduce((acc, t) => acc + (t.kind === "entrada" ? t.amount_cents : -t.amount_cents), 0);
}

// ---- gráfico (área) --------------------------------------------------------

function desenharGrafico(todos) {
  const canvas = $("#chart-meses");
  if (!canvas) return;
  ultimosDados = todos;

  // Os 6 meses terminam no mês escolhido, não no de hoje: olhando março, o
  // gráfico mostra out–mar, e não uma janela que ignora o seletor.
  const meses = [];
  const [anoBase, mesBase] = mesSelecionado.split("-").map(Number);
  for (let i = 5; i >= 0; i--) {
    const d = new Date(anoBase, mesBase - 1 - i, 1);
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

  // Colunas, não área com gradiente: o mês é uma quantidade discreta, e duas
  // barras lado a lado deixam comparar entrada e saída do mesmo mês sem ler
  // duas curvas sobrepostas. A área suave também era o desenho que todo
  // painel de SaaS financeiro usa.
  const font = "'Archivo', system-ui, sans-serif";
  const css = getComputedStyle(document.documentElement);
  const v = (nome, fallback) => (css.getPropertyValue(nome).trim() || fallback);
  const mutedColor = v("--c-muted", "#5E6178");
  const inkColor = v("--c-ink", "#141726");
  const gridColor = v("--c-line", "rgba(20,23,38,0.12)");
  const axisColor = v("--c-line-strong", "rgba(20,23,38,0.26)");
  const corEntrada = v("--c-entrada", "#0F6B47");
  const corSaida = v("--c-saida", "#B3261E");
  const surface = v("--c-surface", "#FFFFFF");

  chartRef = new Chart(canvas, {
    type: "bar",
    data: {
      labels: meses.map((m) => m.rotulo),
      datasets: [
        {
          label: "Entradas",
          data: meses.map((m) => m.entrada / 100),
          backgroundColor: corEntrada,
          borderWidth: 0,
          borderRadius: 4,     // acompanha o --radius-xs do resto do sistema
          borderSkipped: false,
          categoryPercentage: 0.66,
          barPercentage: 0.92,
        },
        {
          label: "Saídas",
          data: meses.map((m) => m.saida / 100),
          backgroundColor: corSaida,
          borderWidth: 0,
          borderRadius: 0,
          categoryPercentage: 0.66,
          barPercentage: 0.92,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            boxWidth: 10, boxHeight: 10, borderRadius: 3, useBorderRadius: true,
            font: { family: font, size: 11, weight: 700 },
            color: mutedColor, padding: 16,
          },
        },
        tooltip: {
          // Tinta sólida com a cor do texto do tema: no claro fica preto sobre
          // a placa branca, no escuro fica claro sobre o carvão. Um valor fixo
          // some contra uma das duas superfícies.
          backgroundColor: inkColor,
          titleColor: surface,
          bodyColor: surface,
          titleFont: { family: font, size: 11, weight: 700 },
          bodyFont: { family: font, size: 12 },
          padding: 10,
          cornerRadius: 6,
          displayColors: false,
          callbacks: {
            // formatBRL e não "R$" fixo: a moeda é configurável entre 7 opções
            // e o rótulo do gráfico era o único lugar que ignorava isso.
            label: (c) => `${c.dataset.label}: ${formatBRL(Math.round(c.raw * 100))}`,
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          border: { color: axisColor, width: 1 },
          ticks: {
            font: { family: font, size: 11, weight: 700 },
            color: mutedColor,
          },
        },
        y: {
          grid: { color: gridColor },
          border: { display: false },
          ticks: {
            callback: (val) => formatBRL(Math.round(val * 100)),
            font: { family: font, size: 11 }, color: mutedColor, maxTicksLimit: 5,
          },
        },
      },
    },
  });
}
