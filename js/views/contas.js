// ============================================================================
//  views/contas.js — Contas a pagar / a receber + saldo projetado
// ----------------------------------------------------------------------------
//  Compromissos futuros (a pagar = saída, a receber = entrada) com vencimento.
//  Não entram no saldo atual; entram no PROJETADO. Ao marcar como pago, vira
//  um lançamento real (via pagar_conta no banco).
// ============================================================================

import { el, $, toast, openModal, closeModal, confirmar, errorState, skeletonList, numCard } from "../ui.js";
import { state } from "../state.js";
import {
  listarContas, criarConta, atualizarConta, pagarConta, cancelarConta, apagarConta,
  listarLancamentos, listarCategorias,
} from "../api.js";
import { formatBRL, formatDate, parseToCents, todayISO } from "../money.js";

let contas = [];
let saldoAtual = 0;
let filtroTipo = "abertas"; // abertas | pagar | receber | pagas

export async function renderContas(root) {
  if (state.categorias.length === 0) {
    try { state.categorias = await listarCategorias(state.company.id); } catch (e) { console.error(e); }
  }

  root.innerHTML = "";
  root.append(
    el("header", { class: "page-head page-head--row" },
      el("div", {},
        el("h1", { class: "page-title" }, "Contas"),
        el("p", { class: "page-sub" }, "A pagar, a receber e saldo projetado")
      ),
      el("button", { class: "btn btn--primary", onclick: () => abrirForm() }, "+ Nova conta")
    ),
    el("section", { id: "contas-resumo", class: "metrics" }),
    el("div", { id: "contas-filtros", class: "admin-filtros" }),
    el("div", { id: "contas-lista", class: "card" }, skeletonList(5))
  );
  await carregar();
}

async function carregar() {
  const box = $("#contas-lista");
  if (!box) return;
  box.innerHTML = ""; box.append(skeletonList(5));

  try {
    const [todos, lista] = await Promise.all([
      listarLancamentos({ companyId: state.company.id }),
      listarContas(state.company.id),
    ]);
    saldoAtual = todos.reduce((s, t) => s + (t.kind === "entrada" ? t.amount_cents : -t.amount_cents), 0);
    contas = lista;
  } catch (err) {
    console.error(err);
    box.innerHTML = "";
    box.append(errorState("Não foi possível carregar as contas.", carregar));
    return;
  }
  desenharResumo();
  desenharFiltros();
  desenharLista();
}

// ---- resumo (a receber / a pagar / projetado) ------------------------------

function desenharResumo() {
  const box = $("#contas-resumo");
  if (!box) return;
  const pend = contas.filter((c) => c.status === "pending");
  const aReceber = pend.filter((c) => c.kind === "entrada").reduce((s, c) => s + c.amount_cents, 0);
  const aPagar = pend.filter((c) => c.kind === "saida").reduce((s, c) => s + c.amount_cents, 0);
  const projetado = saldoAtual + aReceber - aPagar;
  box.innerHTML = "";
  // O projetado é o que esta tela existe pra responder — "sobra ou falta
  // dinheiro depois que tudo isso entrar e sair?". Vira placa.
  box.append(
    numCard("Saldo projetado", formatBRL(projetado), projetado >= 0 ? "entrada" : "saida",
      { placa: true, foot: "Saldo de hoje mais o que ainda entra, menos o que ainda sai" }),
    numCard("Saldo atual", formatBRL(saldoAtual)),
    numCard("A receber", formatBRL(aReceber), aReceber > 0 ? "entrada" : ""),
    numCard("A pagar", formatBRL(aPagar), aPagar > 0 ? "saida" : "")
  );
}

// ---- filtros ---------------------------------------------------------------

function desenharFiltros() {
  const box = $("#contas-filtros");
  if (!box) return;
  const opcoes = [
    ["abertas", "Abertas"],
    ["pagar", "A pagar"],
    ["receber", "A receber"],
    ["pagas", "Pagas"],
  ];
  box.innerHTML = "";
  for (const [id, label] of opcoes) {
    box.append(el("button", {
      class: `chip ${filtroTipo === id ? "chip--on" : ""}`,
      onclick: () => { filtroTipo = id; desenharFiltros(); desenharLista(); },
    }, label));
  }
}

function passaFiltro(c) {
  if (filtroTipo === "pagas") return c.status === "paid";
  if (filtroTipo === "pagar") return c.status === "pending" && c.kind === "saida";
  if (filtroTipo === "receber") return c.status === "pending" && c.kind === "entrada";
  return c.status === "pending"; // abertas
}

// ---- lista -----------------------------------------------------------------

function desenharLista() {
  const box = $("#contas-lista");
  if (!box) return;
  const itens = contas.filter(passaFiltro);

  box.innerHTML = "";
  if (itens.length === 0) {
    box.append(el("div", { class: "empty" }, "Nenhuma conta aqui."));
    return;
  }
  const ul = el("ul", { class: "rec-list" });
  for (const c of itens) ul.append(contaItem(c));
  box.append(ul);
}

function contaItem(c) {
  const venc = vencInfo(c);
  const acoes = el("div", { class: "rec__actions" });
  if (c.status === "pending") {
    const bPagar = el("button", { class: "btn btn--tiny btn--primary" }, "Marcar pago");
    bPagar.addEventListener("click", () => abrirPagar(c));
    const bEditar = el("button", { class: "btn btn--tiny btn--ghost" }, "Editar");
    bEditar.addEventListener("click", () => abrirForm(c));
    const bApagar = el("button", { class: "btn btn--tiny btn--ghost" }, "Apagar");
    bApagar.addEventListener("click", () => {
      confirmar({
        titulo: "Apagar conta",
        texto: `Apagar "${c.description || "(sem descrição)"}" de ${formatBRL(c.amount_cents)}? Isso não mexe em lançamentos já feitos.`,
        confirmar: "Apagar", perigo: true,
      }, async () => { await apagarConta(c.id); await carregar(); });
    });
    acoes.append(bPagar, bEditar, bApagar);
  }

  return el("li", { class: `rec ${c.status !== "pending" ? "is-pausada" : ""}` },
    el("span", { class: `cat__dot cat__dot--${c.kind}` }),
    el("div", { class: "rec__main" },
      el("span", { class: "rec__desc" }, c.description || "(sem descrição)"),
      el("span", { class: "rec__meta" },
        `${c.kind === "entrada" ? "A receber" : "A pagar"}` +
        `${c.categories?.name ? " · " + c.categories.name : ""}` +
        `${c.status === "paid" ? " · pago" : c.status === "canceled" ? " · cancelada" : ""}`),
      venc.badge
    ),
    el("div", { class: "rec__right" },
      el("span", { class: `tx__value num ${c.kind === "entrada" ? "c-entrada" : "c-saida"}` },
        (c.kind === "entrada" ? "+ " : "− ") + formatBRL(c.amount_cents)),
      acoes
    )
  );
}

// Badge de vencimento (vermelho se vencida, âmbar se vence em breve).
function vencInfo(c) {
  if (c.status !== "pending") {
    return { badge: el("span", { class: "conta__venc" }, "Venc.: " + formatDate(c.due_on)) };
  }
  const hoje = todayISO();
  const ms = new Date(c.due_on + "T00:00:00") - new Date(hoje + "T00:00:00");
  const dias = Math.round(ms / 86400000);
  if (dias < 0) return { badge: el("span", { class: "badge badge--saida" }, "Vencida " + formatDate(c.due_on)) };
  if (dias === 0) return { badge: el("span", { class: "badge badge--alerta" }, "Vence hoje") };
  if (dias <= 7) return { badge: el("span", { class: "badge badge--alerta" }, `Vence em ${dias}d`) };
  return { badge: el("span", { class: "conta__venc" }, "Vence " + formatDate(c.due_on)) };
}

// ---- nova / editar conta (modal) -------------------------------------------

function abrirForm(conta = null) {
  const editando = !!conta;
  let kind = conta ? conta.kind : "saida"; // padrão: a pagar
  const segPagar = el("button", { class: `seg ${kind === "saida" ? "seg--on" : ""}`, type: "button" }, "A pagar");
  const segReceber = el("button", { class: `seg ${kind === "entrada" ? "seg--on" : ""}`, type: "button" }, "A receber");
  segPagar.onclick = () => { kind = "saida"; segPagar.classList.add("seg--on"); segReceber.classList.remove("seg--on"); };
  segReceber.onclick = () => { kind = "entrada"; segReceber.classList.add("seg--on"); segPagar.classList.remove("seg--on"); };

  const valorPadrao = conta ? (conta.amount_cents / 100).toFixed(2).replace(".", ",") : "";
  const valor = el("input", { class: "input", placeholder: "0,00", inputmode: "decimal", value: valorPadrao });
  const venc = el("input", { class: "input", type: "date", value: conta ? conta.due_on : todayISO() });
  const desc = el("input", { class: "input", placeholder: "Ex.: Fornecedor, conta de luz, cliente X…", value: conta ? conta.description : "" });
  const cat = el("select", { class: "input" },
    el("option", { value: "" }, "Sem categoria"),
    ...state.categorias.map((c) => el("option", { value: c.id }, c.name))
  );
  if (conta && conta.category_id) cat.value = conta.category_id;
  const btn = el("button", { class: "btn btn--primary" }, "Salvar");

  async function salvar() {
    const cents = parseToCents(valor.value);
    if (!cents || cents <= 0) { toast("Digite um valor válido", "erro"); return; }
    if (!venc.value) { toast("Escolha o vencimento", "erro"); return; }
    btn.disabled = true; btn.textContent = "Salvando...";
    const dados = { kind, amount_cents: cents, description: desc.value.trim(), category_id: cat.value || null, due_on: venc.value };
    try {
      if (editando) await atualizarConta(conta.id, dados);
      else await criarConta(state.company.id, dados);
      closeModal();
      toast(editando ? "Conta atualizada" : "Conta criada", "ok");
      await carregar();
    } catch (err) {
      console.error(err);
      toast("Não foi possível salvar", "erro");
      btn.disabled = false; btn.textContent = "Salvar";
    }
  }
  btn.addEventListener("click", salvar);

  openModal(editando ? "Editar conta" : "Nova conta",
    el("div", { class: "form" },
      el("div", { class: "seg-group" }, segPagar, segReceber),
      el("div", { class: "admin-pay__row" },
        el("label", { class: "field" }, el("span", { class: "field__label" }, "Valor"), valor),
        el("label", { class: "field" }, el("span", { class: "field__label" }, "Vencimento"), venc)
      ),
      el("label", { class: "field" }, el("span", { class: "field__label" }, "Descrição"), desc),
      el("label", { class: "field" }, el("span", { class: "field__label" }, "Categoria"), cat),
      el("div", { class: "form__actions" },
        el("button", { class: "btn btn--ghost", onclick: closeModal }, "Cancelar"), btn)
    )
  );
}

// ---- marcar como pago (modal) ----------------------------------------------

function abrirPagar(c) {
  const data = el("input", { class: "input", type: "date", value: todayISO() });
  const btn = el("button", { class: "btn btn--primary" }, "Confirmar pagamento");

  async function confirmar() {
    btn.disabled = true; btn.textContent = "Registrando...";
    try {
      await pagarConta(c.id, data.value || todayISO());
      closeModal();
      toast(c.kind === "entrada" ? "Recebimento registrado" : "Pagamento registrado", "ok");
      await carregar();
    } catch (err) {
      console.error(err);
      toast("Não foi possível registrar", "erro");
      btn.disabled = false; btn.textContent = "Confirmar pagamento";
    }
  }
  btn.addEventListener("click", confirmar);

  openModal(c.kind === "entrada" ? "Registrar recebimento" : "Registrar pagamento",
    el("div", { class: "form" },
      el("div", { class: "tx-preview" },
        `${c.kind === "entrada" ? "A receber" : "A pagar"} de ${formatBRL(c.amount_cents)} — ${c.description || "(sem descrição)"}`),
      el("p", { class: "config__note" }, "Isso cria um lançamento real no caixa, na data abaixo."),
      el("label", { class: "field" }, el("span", { class: "field__label" }, "Data"), data),
      el("div", { class: "form__actions" },
        el("button", { class: "btn btn--ghost", onclick: closeModal }, "Cancelar"), btn)
    )
  );
}
