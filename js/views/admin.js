// ============================================================================
//  views/admin.js — Painel do Admin (só o admin acessa)
// ----------------------------------------------------------------------------
//  Lista todos os clientes (empresas), mostra uso e deixa bloquear/liberar o
//  acesso e definir o vencimento da mensalidade. A segurança de verdade está
//  no banco (RLS + funções is_admin): aqui é só a interface.
// ============================================================================

import Chart from "https://esm.sh/chart.js@4/auto";
import { el, $, toast, openModal, closeModal, errorState, skeletonList, senhaInput } from "../ui.js";
import { listarClientesAdmin, definirStatusCliente, atualizarDadosCliente, registrarPagamento, listarPagamentos, receitaPeriodo, receitaMensal } from "../api.js";
import { updateEmail, updatePassword } from "../auth.js";
import { state, mesAtual } from "../state.js";
import { formatDate, formatBRL, parseToCents, todayISO } from "../money.js";

// Janela (em dias) para o aviso de "mensalidade vencendo em breve".
const AVISO_DIAS = 7;

let clientes = [];
let filtro = "";
let filtroStatus = "todos"; // todos | ativos | vencendo | inativos
let receitaMes = 0;
let chartRef = null;

export async function renderAdmin(root) {
  root.innerHTML = "";
  root.append(
    el("header", { class: "page-head page-head--row" },
      el("div", {},
        el("h1", { class: "page-title" }, "Painel do Admin"),
        el("p", { class: "page-sub" }, "Clientes do Monetta e controle de assinatura")
      ),
      el("button", { class: "btn btn--ghost", onclick: exportarCSV,
        "data-tip": "Baixar a lista de clientes em planilha" }, "↓ Exportar clientes")
    ),
    el("section", { id: "admin-resumo", class: "stats admin-resumo" }),
    el("section", { class: "card" },
      el("div", { class: "card__head" },
        el("h2", { class: "card__title" }, "Clientes"),
        buscaInput()
      ),
      el("div", { id: "admin-filtros", class: "admin-filtros" }),
      el("div", { id: "admin-lista" }, skeletonList(5))
    ),
    el("section", { class: "card chart-card" },
      el("div", { class: "card__head" },
        el("h2", { class: "card__title" }, "Receita — últimos 6 meses"),
        el("span", { class: "card__hint", id: "rec-comp" }, "Soma das mensalidades recebidas por mês")
      ),
      el("div", { class: "chart-wrap" }, el("canvas", { id: "chart-receita" }))
    ),
    secaoConta()
  );
  await carregar();
}

// ---- conta do admin (trocar email / senha) ---------------------------------

function secaoConta() {
  const emailAtual = state.user?.email ?? "";

  // -- email --
  const emailInput = el("input", {
    class: "input", type: "email", placeholder: emailAtual, autocomplete: "email",
  });
  const btnEmail = el("button", { class: "btn btn--primary" }, "Atualizar email");
  const avisoEmail = el("p", { class: "config__sucesso", hidden: "" });
  async function salvarEmail() {
    const v = emailInput.value.trim();
    if (!v) { toast("Digite o novo email", "erro"); return; }
    if (v === emailAtual) { toast("É o mesmo email atual", "info"); return; }
    btnEmail.disabled = true; btnEmail.textContent = "Enviando...";
    try {
      await updateEmail(v);
      avisoEmail.textContent =
        `Enviamos um link de confirmação para ${v}. ` +
        `O email só muda depois que você abrir esse email e clicar no link.`;
      avisoEmail.hidden = false;
      emailInput.value = "";
    } catch (err) {
      toast(traduzErroConta(err), "erro");
    } finally {
      btnEmail.disabled = false; btnEmail.textContent = "Atualizar email";
    }
  }
  btnEmail.addEventListener("click", salvarEmail);

  // -- senha --
  const { wrap: w1, input: s1 } = senhaInput({ placeholder: "Mínimo 6 caracteres", autocomplete: "new-password" });
  const { wrap: w2, input: s2 } = senhaInput({ placeholder: "Repita a nova senha", autocomplete: "new-password" });
  const btnSenha = el("button", { class: "btn btn--primary" }, "Atualizar senha");
  async function salvarSenha() {
    if (s1.value.length < 6) { toast("A senha precisa ter pelo menos 6 caracteres", "erro"); return; }
    if (s1.value !== s2.value) { toast("As senhas não coincidem", "erro"); return; }
    btnSenha.disabled = true; btnSenha.textContent = "Salvando...";
    try {
      await updatePassword(s1.value);
      toast("Senha atualizada!", "ok");
      s1.value = ""; s2.value = "";
    } catch (err) {
      toast(traduzErroConta(err), "erro");
    } finally {
      btnSenha.disabled = false; btnSenha.textContent = "Atualizar senha";
    }
  }
  btnSenha.addEventListener("click", salvarSenha);

  return el("section", { class: "card", style: "margin-top: var(--gap);" },
    el("h2", { class: "card__title" }, "Conta do admin"),
    el("p", { class: "config__hint" },
      `Logado como ${emailAtual}. Trocar o email NÃO tira seu acesso de admin — ele segue a sua conta, não o endereço.`),
    el("label", { class: "field" },
      el("span", { class: "field__label" }, "Novo email"), emailInput),
    el("p", { class: "config__note" },
      "O email não muda na hora: enviamos um link de confirmação, e a troca só " +
      "acontece depois que você clica nele."),
    avisoEmail,
    el("div", { class: "form__actions" }, btnEmail),
    el("hr", { class: "admin-conta__sep" }),
    el("label", { class: "field" },
      el("span", { class: "field__label" }, "Nova senha"), w1),
    el("label", { class: "field" },
      el("span", { class: "field__label" }, "Confirmar nova senha"), w2),
    el("div", { class: "form__actions" }, btnSenha)
  );
}

function traduzErroConta(err) {
  const m = (err?.message || "").toLowerCase();
  if (m.includes("email") && m.includes("taken")) return "Este email já está em uso";
  if (m.includes("same password")) return "A nova senha não pode ser igual à atual";
  if (m.includes("password") && m.includes("6")) return "A senha precisa ter pelo menos 6 caracteres";
  if (m.includes("rate") || m.includes("too many")) return "Muitas tentativas. Aguarde e tente de novo.";
  return "Algo deu errado. Tente de novo.";
}

function buscaInput() {
  const inp = el("input", {
    class: "input admin-busca",
    type: "search",
    placeholder: "Buscar por nome ou email…",
    value: filtro,
  });
  inp.addEventListener("input", () => { filtro = inp.value; desenharLista(); });
  return inp;
}

async function carregar() {
  const box = $("#admin-lista");
  if (!box) return;
  box.innerHTML = "";
  box.append(skeletonList(5));

  try {
    clientes = await listarClientesAdmin();
  } catch (err) {
    console.error(err);
    box.innerHTML = "";
    box.append(errorState("Não foi possível carregar os clientes.", carregar));
    return;
  }
  // Receita do mês (não-fatal: se falhar, mostra 0).
  try {
    const { de, ate } = mesAtual();
    receitaMes = await receitaPeriodo(de, ate);
  } catch (err) {
    console.error(err);
    receitaMes = 0;
  }
  desenharResumo();
  desenharFiltros();
  desenharLista();

  // Gráfico de receita dos últimos meses (não-fatal).
  try {
    const serie = await receitaMensal(6);
    desenharGraficoReceita(serie);
  } catch (err) {
    console.error(err);
  }
}

// ---- gráfico de receita -----------------------------------------------------

function desenharGraficoReceita(serie) {
  const canvas = $("#chart-receita");
  if (!canvas) return;
  if (chartRef) chartRef.destroy();

  const labels = serie.map((p) =>
    new Date(p.mes + "T00:00:00").toLocaleDateString("pt-BR", { month: "short" }).replace(".", ""));
  const valores = serie.map((p) => (p.total || 0) / 100);

  // Comparativo: este mês vs mês passado (no hint do card).
  const hint = $("#rec-comp");
  if (hint && serie.length) {
    const atual = serie[serie.length - 1].total || 0;
    const anterior = serie.length > 1 ? (serie[serie.length - 2].total || 0) : 0;
    let txt = `Este mês: ${formatBRL(atual)}`;
    if (anterior > 0) {
      const pct = Math.round(((atual - anterior) / anterior) * 100);
      txt += ` · ${pct >= 0 ? "+" : "−"}${Math.abs(pct)}% vs mês passado (${formatBRL(anterior)})`;
    } else {
      txt += ` · mês passado: ${formatBRL(anterior)}`;
    }
    hint.textContent = txt;
  }

  const css = getComputedStyle(document.documentElement);
  const v = (nome, fb) => (css.getPropertyValue(nome).trim() || fb);
  const cor = v("--c-primary", "#4F46E5");
  const muted = v("--c-muted", "#8B9E98");
  const grid = v("--c-border", "rgba(221,229,226,0.8)");
  const font = "'Inter', system-ui, sans-serif";

  chartRef = new Chart(canvas, {
    type: "bar",
    data: {
      labels,
      datasets: [{ label: "Receita", data: valores, backgroundColor: cor, borderRadius: 7, borderSkipped: false }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "#1E293B",
          padding: 12,
          cornerRadius: 8,
          titleFont: { family: font, size: 12 },
          bodyFont: { family: font, size: 12 },
          callbacks: { label: (ctx) => "  R$ " + ctx.raw.toLocaleString("pt-BR", { minimumFractionDigits: 2 }) },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          border: { display: false },
          ticks: { font: { family: font, size: 12 }, color: muted },
        },
        y: {
          grid: { color: grid },
          border: { display: false },
          ticks: {
            callback: (val) => "R$ " + val.toLocaleString("pt-BR", { minimumFractionDigits: 0 }),
            font: { family: font, size: 11 },
            color: muted,
          },
        },
      },
    },
  });
}

// ---- resumo (cards de cima) ------------------------------------------------

function desenharResumo() {
  const box = $("#admin-resumo");
  if (!box) return;
  const total = clientes.length;
  const ativos = clientes.filter((c) => c.active).length;
  const inativos = total - ativos;
  const vencendo = clientes.filter((c) => venceEmBreve(c)).length;
  // MRR = soma das mensalidades dos clientes ativos (receita recorrente prevista).
  const mrr = clientes.reduce((s, c) => s + (c.active ? (c.plan_value_cents || 0) : 0), 0);
  box.innerHTML = "";
  box.append(
    resumoCard("Clientes", total),
    resumoCard("Ativos", ativos, "entrada"),
    resumoCard(`Vencendo (${AVISO_DIAS}d)`, vencendo, vencendo > 0 ? "alerta" : ""),
    resumoCard("Bloqueados / vencidos", inativos, inativos > 0 ? "saida" : ""),
    resumoCard("Receita do mês", formatBRL(receitaMes), "entrada"),
    resumoCard("MRR (recorrente)", formatBRL(mrr))
  );
}

// ---- filtro por status ------------------------------------------------------

function desenharFiltros() {
  const box = $("#admin-filtros");
  if (!box) return;
  const opcoes = [
    ["todos", "Todos"],
    ["ativos", "Ativos"],
    ["vencendo", "Vencendo"],
    ["inativos", "Bloqueados / vencidos"],
  ];
  box.innerHTML = "";
  for (const [id, label] of opcoes) {
    const chip = el("button", {
      class: `chip ${filtroStatus === id ? "chip--on" : ""}`,
      onclick: () => { filtroStatus = id; desenharFiltros(); desenharLista(); },
    }, label);
    box.append(chip);
  }
}

// Aplica o filtro de status escolhido na lista.
function passaStatus(c) {
  if (filtroStatus === "ativos") return !!c.active;
  if (filtroStatus === "inativos") return !c.active;
  if (filtroStatus === "vencendo") return venceEmBreve(c);
  return true;
}

// True se o cliente está ativo e a mensalidade vence dentro da janela de aviso.
function venceEmBreve(c) {
  if (!c.active || !c.plan_until) return false;
  const d = diasAte(c.plan_until);
  return d !== null && d >= 0 && d <= AVISO_DIAS;
}

// Texto do aviso de vencimento ("Vence hoje" / "Vence amanhã" / "Vence em Xd").
function avisoVenc(c) {
  const d = diasAte(c.plan_until);
  if (d === 0) return "Vence hoje";
  if (d === 1) return "Vence amanhã";
  return `Vence em ${d}d`;
}

// Dias entre hoje e uma data ISO (negativo = no passado).
function diasAte(iso) {
  if (!iso) return null;
  const ms = new Date(iso + "T00:00:00") - new Date(todayISO() + "T00:00:00");
  return Math.round(ms / 86400000);
}

// Soma 1 mês a uma data ISO (YYYY-MM-DD), devolvendo ISO.
function addUmMes(iso) {
  return addMeses(iso, 1);
}

// Soma N meses a uma data ISO (a base é a data dada, ou hoje).
function addMeses(iso, n) {
  const base = new Date((iso || todayISO()) + "T00:00:00");
  base.setMonth(base.getMonth() + n);
  return base.toISOString().slice(0, 10);
}

// ---- exportar clientes em CSV ----------------------------------------------

function exportarCSV() {
  if (!clientes.length) { toast("Nenhum cliente para exportar", "info"); return; }
  const cab = ["Cliente", "Email", "Status", "Vencimento", "Mensalidade (R$)", "Lançamentos", "Última atividade", "Observações"];
  const linhas = clientes.map((c) => [
    c.name || "",
    c.owner_email || "",
    statusInfo(c).label,
    c.plan_until ? formatDate(c.plan_until) : "",
    c.plan_value_cents != null ? (c.plan_value_cents / 100).toFixed(2).replace(".", ",") : "",
    String(c.tx_count ?? 0),
    c.last_activity ? formatDate(c.last_activity) : "",
    (c.notes || "").replace(/"/g, '""'),
  ]);
  const csv = [cab, ...linhas].map((l) => l.map((x) => `"${x}"`).join(";")).join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = el("a", { href: url, download: `clientes-${todayISO()}.csv` });
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function resumoCard(label, valor, tipo = "") {
  return el("div", { class: `card stat ${tipo ? "stat--" + tipo : ""}` },
    el("div", { class: "stat__header" }, el("span", { class: "stat__label" }, label)),
    el("span", { class: "stat__value num" }, String(valor))
  );
}

// ---- lista de clientes ------------------------------------------------------

function desenharLista() {
  const box = $("#admin-lista");
  if (!box) return;

  const termo = filtro.trim().toLowerCase();
  const itens = clientes.filter((c) => {
    if (!passaStatus(c)) return false;
    if (!termo) return true;
    return (c.name || "").toLowerCase().includes(termo) ||
           (c.owner_email || "").toLowerCase().includes(termo);
  });

  box.innerHTML = "";
  if (itens.length === 0) {
    box.append(el("div", { class: "empty" },
      clientes.length === 0 ? "Nenhum cliente ainda." : "Nenhum cliente encontrado."));
    return;
  }

  const lista = el("ul", { class: "admin-list" });
  for (const c of itens) {
    const st = statusInfo(c);
    lista.append(
      el("li", { class: "admin-cli" },
        el("div", { class: "admin-cli__main" },
          el("div", { class: "admin-cli__top" },
            el("span", { class: "admin-cli__name" }, c.name || "(sem nome)"),
            el("span", { class: st.cls }, st.label),
            venceEmBreve(c) ? el("span", { class: "badge badge--alerta" }, avisoVenc(c)) : null
          ),
          el("div", { class: "admin-cli__email" }, c.owner_email || "—"),
          el("div", { class: "admin-cli__meta" },
            metaItem("Mensalidade", c.plan_value_cents != null ? formatBRL(c.plan_value_cents) : "—"),
            metaItem("Vencimento", c.plan_until ? formatDate(c.plan_until) : "sem data"),
            metaItem("Lançamentos", String(c.tx_count ?? 0)),
            metaItem("Última atividade", c.last_activity ? formatDate(c.last_activity) : "—"),
            metaItem("Cadastro", c.created_at ? formatDate(c.created_at.slice(0, 10)) : "—")
          )
        ),
        el("div", { class: "admin-cli__actions" },
          el("button", { class: "btn btn--ghost btn--tiny", onclick: () => gerenciar(c) }, "Gerenciar")
        )
      )
    );
  }
  box.append(lista);
}

function metaItem(label, valor) {
  return el("span", { class: "admin-cli__metaitem" },
    el("span", { class: "admin-cli__metalabel" }, label),
    el("span", { class: "admin-cli__metavalue" }, valor)
  );
}

// status: 'blocked' manual; ou 'active' mas com plan_until vencido = "Vencido".
function statusInfo(c) {
  if (c.status === "blocked") return { label: "Bloqueado", cls: "badge badge--saida" };
  if (c.plan_until && c.plan_until < todayISO()) return { label: "Vencido", cls: "badge badge--saida" };
  return { label: "Ativo", cls: "badge" };
}

// ---- modal de gerenciar ----------------------------------------------------

function gerenciar(c) {
  // estado local do modal
  let status = c.status === "blocked" ? "blocked" : "active";

  const segAtivo = el("button", { class: "seg" }, "Ativo");
  const segBloq = el("button", { class: "seg" }, "Bloqueado");
  function pintarSeg() {
    segAtivo.classList.toggle("seg--on", status === "active");
    segBloq.classList.toggle("seg--on", status === "blocked");
  }
  segAtivo.addEventListener("click", () => { status = "active"; pintarSeg(); });
  segBloq.addEventListener("click", () => { status = "blocked"; pintarSeg(); });
  pintarSeg();

  const dataInput = el("input", { class: "input", type: "date", value: c.plan_until || "" });

  const btnSalvar = el("button", { class: "btn btn--primary" }, "Salvar");

  async function salvar() {
    btnSalvar.disabled = true;
    btnSalvar.textContent = "Salvando...";
    try {
      const atualizada = await definirStatusCliente(c.id, status, dataInput.value || null);
      aplicarNaMemoria(atualizada.status, atualizada.plan_until);
      toast("Acesso atualizado", "ok");
      desenharResumo();
      desenharLista();
    } catch (err) {
      console.error(err);
      toast("Não foi possível salvar", "erro");
    } finally {
      btnSalvar.disabled = false;
      btnSalvar.textContent = "Salvar acesso";
    }
  }
  btnSalvar.textContent = "Salvar acesso";
  btnSalvar.addEventListener("click", salvar);

  // Reflete mudanças no objeto em memória + nos campos do modal.
  function aplicarNaMemoria(novoStatus, novoVenc) {
    Object.assign(c, {
      status: novoStatus,
      plan_until: novoVenc,
      active: novoStatus === "active" && (!novoVenc || novoVenc >= todayISO()),
    });
    dataInput.value = c.plan_until || "";
    status = c.status === "blocked" ? "blocked" : "active";
    pintarSeg();
  }

  // ---- plano e anotações ----
  const valorPadrao = c.plan_value_cents != null
    ? (c.plan_value_cents / 100).toFixed(2).replace(".", ",") : "";
  const planValorInput = el("input", { class: "input", inputmode: "decimal", placeholder: "Valor por mês (opcional)", value: valorPadrao });
  const notasInput = el("textarea", { class: "input admin-notas", rows: "3", placeholder: "Anotações sobre o cliente (só você vê)" }, c.notes || "");
  const btnDados = el("button", { class: "btn btn--primary" }, "Salvar plano e anotações");
  async function salvarDados() {
    const cents = parseToCents(planValorInput.value); // null se vazio
    btnDados.disabled = true; btnDados.textContent = "Salvando...";
    try {
      const at = await atualizarDadosCliente(c.id, cents, notasInput.value.trim());
      Object.assign(c, { plan_value_cents: at.plan_value_cents, notes: at.notes });
      toast("Dados atualizados", "ok");
      desenharResumo();
      desenharLista();
    } catch (err) {
      console.error(err);
      toast("Não foi possível salvar", "erro");
    } finally {
      btnDados.disabled = false; btnDados.textContent = "Salvar plano e anotações";
    }
  }
  btnDados.addEventListener("click", salvarDados);

  // ---- pagamentos ----
  const baseVenc = (c.plan_until && c.plan_until >= todayISO()) ? c.plan_until : todayISO();
  const valorInput = el("input", { class: "input", inputmode: "decimal", placeholder: "Valor (opcional)", value: valorPadrao });
  const dataPagInput = el("input", { class: "input", type: "date", value: todayISO() });
  const renovarInput = el("input", { class: "input", type: "date", value: addUmMes(baseVenc) });
  const renovarRapido = el("div", { class: "admin-renew" },
    ...[["+1 mês", 1], ["+3 meses", 3], ["+1 ano", 12]].map(([lbl, n]) =>
      el("button", { type: "button", class: "btn btn--ghost btn--tiny",
        onclick: () => { renovarInput.value = addMeses(baseVenc, n); } }, lbl))
  );
  const obsInput = el("input", { class: "input", placeholder: "Observação (opcional)" });
  const btnPagar = el("button", { class: "btn btn--primary" }, "Registrar pagamento");
  const histBox = el("div", { class: "admin-pay__hist" }, el("div", { class: "loading" }, "Carregando..."));

  async function carregarHist() {
    histBox.innerHTML = "";
    try {
      const pags = await listarPagamentos(c.id);
      if (pags.length === 0) {
        histBox.append(el("p", { class: "admin-pay__vazio" }, "Nenhum pagamento registrado ainda."));
        return;
      }
      const ul = el("ul", { class: "admin-pay__list" });
      for (const p of pags) {
        ul.append(
          el("li", { class: "admin-pay__item" },
            el("span", { class: "admin-pay__data" }, formatDate(p.paid_on)),
            el("span", { class: "admin-pay__val num" }, p.amount_cents != null ? formatBRL(p.amount_cents) : "—"),
            p.note ? el("span", { class: "admin-pay__obs" }, p.note) : null
          )
        );
      }
      histBox.append(ul);
    } catch (err) {
      console.error(err);
      histBox.append(el("p", { class: "admin-pay__vazio" }, "Não foi possível carregar o histórico."));
    }
  }

  async function pagar() {
    const cents = parseToCents(valorInput.value); // null se vazio/!número (valor é opcional)
    btnPagar.disabled = true;
    btnPagar.textContent = "Registrando...";
    try {
      await registrarPagamento(
        c.id, cents, dataPagInput.value || todayISO(), obsInput.value.trim(), renovarInput.value || null
      );
      if (renovarInput.value) aplicarNaMemoria("active", renovarInput.value);
      valorInput.value = "";
      obsInput.value = "";
      toast("Pagamento registrado", "ok");
      desenharResumo();
      desenharLista();
      carregarHist();
    } catch (err) {
      console.error(err);
      toast("Não foi possível registrar o pagamento", "erro");
    } finally {
      btnPagar.disabled = false;
      btnPagar.textContent = "Registrar pagamento";
    }
  }
  btnPagar.addEventListener("click", pagar);

  openModal("Gerenciar cliente",
    el("div", {},
      el("div", { class: "admin-modal__id" },
        el("div", { class: "admin-cli__name" }, c.name || "(sem nome)"),
        el("div", { class: "admin-cli__email" }, c.owner_email || "—")
      ),

      el("label", { class: "field" },
        el("span", { class: "field__label" }, "Acesso"),
        el("div", { class: "seg-group", style: "margin-bottom:0" }, segAtivo, segBloq)
      ),
      el("label", { class: "field" },
        el("span", { class: "field__label" }, "Mensalidade vence em (opcional)"),
        dataInput
      ),
      el("div", { class: "form__actions" }, btnSalvar),

      el("hr", { class: "admin-conta__sep" }),

      el("h3", { class: "admin-pay__titulo" }, "Plano e anotações"),
      el("label", { class: "field" },
        el("span", { class: "field__label" }, "Valor da mensalidade"), planValorInput),
      el("label", { class: "field" },
        el("span", { class: "field__label" }, "Anotações"), notasInput),
      el("div", { class: "form__actions" }, btnDados),

      el("hr", { class: "admin-conta__sep" }),

      el("h3", { class: "admin-pay__titulo" }, "Registrar pagamento"),
      el("div", { class: "admin-pay__row" },
        el("label", { class: "field" }, el("span", { class: "field__label" }, "Valor"), valorInput),
        el("label", { class: "field" }, el("span", { class: "field__label" }, "Data do pagamento"), dataPagInput)
      ),
      el("label", { class: "field" },
        el("span", { class: "field__label" }, "Renovar acesso até"), renovarInput),
      renovarRapido,
      el("label", { class: "field", style: "margin-top:14px" },
        el("span", { class: "field__label" }, "Observação"), obsInput),
      el("div", { class: "form__actions" }, btnPagar),

      el("hr", { class: "admin-conta__sep" }),
      el("h3", { class: "admin-pay__titulo" }, "Histórico de pagamentos"),
      histBox,

      el("div", { class: "form__actions", style: "margin-top:18px" },
        el("button", { class: "btn btn--ghost", onclick: closeModal }, "Fechar")
      )
    )
  );

  carregarHist();
}
