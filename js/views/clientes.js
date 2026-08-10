// ============================================================================
//  views/clientes.js — Clientes e Fornecedores (módulo ERP)
// ----------------------------------------------------------------------------
//  Cadastro dos contatos do negócio. Base pro módulo de Vendas mais pra frente.
// ============================================================================

import { el, $, toast, openModal, closeModal, confirmar, emptyState, errorState, skeletonList, mascara } from "../ui.js";
import { formatDocumento, formatPhoneValue, soDigitos } from "../regras.js";
import { state } from "../state.js";
import { listarClientes, criarCliente, atualizarCliente, apagarCliente } from "../api.js";

const ICON_USERS = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`;

let clientes = [];
let filtro = "todos"; // todos | cliente | fornecedor

export async function renderClientes(root) {
  root.innerHTML = "";
  root.append(
    el("header", { class: "page-head page-head--row" },
      el("div", {},
        el("h1", { class: "page-title" }, "Clientes"),
        el("p", { class: "page-sub" }, "Clientes e fornecedores do seu negócio")
      ),
      el("button", { class: "btn btn--primary", onclick: () => abrirForm() }, "+ Novo contato")
    ),
    el("div", { id: "clientes-filtros", class: "admin-filtros" }),
    el("div", { id: "clientes-lista", class: "card" }, skeletonList(5))
  );
  await carregar();
}

async function carregar() {
  const box = $("#clientes-lista");
  if (!box) return;
  box.innerHTML = ""; box.append(skeletonList(5));
  try {
    clientes = await listarClientes(state.company.id);
  } catch (err) {
    console.error(err);
    box.innerHTML = "";
    box.append(errorState("Não foi possível carregar os contatos.", carregar));
    return;
  }
  desenharFiltros();
  desenharLista();
}

function desenharFiltros() {
  const box = $("#clientes-filtros");
  if (!box) return;
  const opcoes = [["todos", "Todos"], ["cliente", "Clientes"], ["fornecedor", "Fornecedores"]];
  box.innerHTML = "";
  for (const [id, label] of opcoes) {
    box.append(el("button", {
      class: `chip ${filtro === id ? "chip--on" : ""}`,
      onclick: () => { filtro = id; desenharFiltros(); desenharLista(); },
    }, label));
  }
}

function passaFiltro(c) {
  if (filtro === "todos") return true;
  return c.kind === filtro || !c.kind; // sem tipo = aparece nos dois
}

function desenharLista() {
  const box = $("#clientes-lista");
  if (!box) return;
  const itens = clientes.filter(passaFiltro);

  box.innerHTML = "";
  if (itens.length === 0) {
    box.append(emptyState(
      clientes.length === 0
        ? "Nenhum contato ainda.\nCadastre seu primeiro cliente ou fornecedor."
        : "Nenhum contato neste filtro.",
      ICON_USERS
    ));
    return;
  }

  const ul = el("ul", { class: "rec-list" });
  for (const c of itens) ul.append(item(c));
  box.append(ul);
}

function rotulo(kind) {
  if (kind === "cliente") return ["Cliente", "badge"];
  if (kind === "fornecedor") return ["Fornecedor", "badge badge--saida"];
  return ["Cliente e fornecedor", "badge badge--muted"];
}

function item(c) {
  const [txt, badgeClass] = rotulo(c.kind);
  const detalhes = [c.doc, c.phone, c.email].filter(Boolean).join(" · ");
  const acoes = el("div", { class: "rec__actions" },
    el("button", { class: "btn btn--tiny btn--ghost", onclick: () => abrirForm(c) }, "Editar"),
    el("button", { class: "btn btn--tiny btn--ghost", onclick: () => confirmarApagar(c) }, "Apagar")
  );
  return el("li", { class: "rec" },
    el("span", { class: `cat__dot ${c.kind === "fornecedor" ? "cat__dot--saida" : c.kind === "cliente" ? "cat__dot--entrada" : "cat__dot--ambos"}` }),
    el("div", { class: "rec__main" },
      el("span", { class: "rec__desc" }, c.name),
      detalhes ? el("span", { class: "rec__meta" }, detalhes) : null
    ),
    el("div", { class: "rec__right" },
      el("span", { class: badgeClass }, txt),
      acoes
    )
  );
}

// ---- criar / editar (modal) ------------------------------------------------

function abrirForm(contato = null) {
  const editando = !!contato;
  let kind = contato ? contato.kind : "cliente";
  const segCli = el("button", { class: `seg ${kind === "cliente" ? "seg--on" : ""}`, type: "button" }, "Cliente");
  const segFor = el("button", { class: `seg ${kind === "fornecedor" ? "seg--on" : ""}`, type: "button" }, "Fornecedor");
  const segAmb = el("button", { class: `seg ${!kind ? "seg--on" : ""}`, type: "button" }, "Ambos");
  const segs = [["cliente", segCli], ["fornecedor", segFor], [null, segAmb]];
  for (const [val, btn] of segs) {
    btn.onclick = () => {
      kind = val;
      for (const [, b] of segs) b.classList.remove("seg--on");
      btn.classList.add("seg--on");
    };
  }

  const nome = el("input", { class: "input", placeholder: "Nome ou razão social", value: contato ? contato.name : "" });
  // Máscara na tela; no banco vai só o dígito (ver salvar()).
  const doc = mascara(
    el("input", { class: "input", inputmode: "numeric", placeholder: "000.000.000-00 ou 00.000.000/0000-00", value: formatDocumento(contato?.doc || "") }),
    formatDocumento);
  const phone = mascara(
    el("input", { class: "input", inputmode: "tel", placeholder: "(11) 99999-9999", value: formatPhoneValue(contato?.phone || "") }),
    formatPhoneValue);
  const email = el("input", { class: "input", type: "email", placeholder: "Email (opcional)", value: contato?.email || "" });
  const notes = el("input", { class: "input", placeholder: "Observações (opcional)", value: contato?.notes || "" });
  const btn = el("button", { class: "btn btn--primary" }, "Salvar");

  async function salvar() {
    if (!nome.value.trim()) { toast("Digite o nome", "erro"); return; }
    btn.disabled = true; btn.textContent = "Salvando...";
    const dados = {
      name: nome.value.trim(), kind,
      // soDigitos e não o texto da tela: guardar "123.456.789-01" quebra
      // busca, comparação e qualquer integração depois.
      doc: soDigitos(doc.value) || null,
      phone: soDigitos(phone.value) || null,
      email: email.value.trim() || null,
      notes: notes.value.trim() || null,
    };
    try {
      if (editando) await atualizarCliente(contato.id, dados);
      else await criarCliente(state.company.id, dados);
      closeModal();
      toast(editando ? "Contato atualizado" : "Contato criado", "ok");
      await carregar();
    } catch (err) {
      console.error(err);
      toast("Não foi possível salvar", "erro");
      btn.disabled = false; btn.textContent = "Salvar";
    }
  }
  btn.addEventListener("click", salvar);
  nome.addEventListener("keydown", (e) => { if (e.key === "Enter") salvar(); });

  openModal(editando ? "Editar contato" : "Novo contato",
    el("div", { class: "form" },
      el("div", { class: "seg-group" }, segCli, segFor, segAmb),
      el("label", { class: "field" }, el("span", { class: "field__label" }, "Nome"), nome),
      el("div", { class: "admin-pay__row" },
        el("label", { class: "field" }, el("span", { class: "field__label" }, "CPF / CNPJ"), doc),
        el("label", { class: "field" }, el("span", { class: "field__label" }, "Telefone"), phone)
      ),
      el("label", { class: "field" }, el("span", { class: "field__label" }, "Email"), email),
      el("label", { class: "field" }, el("span", { class: "field__label" }, "Observações"), notes),
      el("div", { class: "form__actions" },
        el("button", { class: "btn btn--ghost", onclick: closeModal }, "Cancelar"), btn)
    )
  );
}

function confirmarApagar(c) {
  confirmar({
    titulo: "Apagar contato",
    texto: `Apagar "${c.name}"? Isso não afeta lançamentos já feitos.`,
    confirmar: "Apagar", perigo: true,
  }, async () => { await apagarCliente(c.id); await carregar(); });
}
