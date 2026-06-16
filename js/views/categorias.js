// ============================================================================
//  views/categorias.js — Gerenciar categorias
// ============================================================================

import { el, $, toast, openModal, closeModal, emptyState, ICONS } from "../ui.js";
import { state } from "../state.js";
import { listarCategorias, criarCategoria, apagarCategoria } from "../api.js";

export async function renderCategorias(root) {
  root.innerHTML = "";
  root.append(
    el("header", { class: "page-head" },
      el("h1", { class: "page-title" }, "Categorias"),
      el("p", { class: "page-sub" }, "Organize seus lançamentos")
    ),
    formularioNova(),
    el("div", { id: "lista-categorias", class: "card" },
      el("div", { class: "loading" }, "Carregando..."))
  );
  await carregar();
}

function formularioNova() {
  const nome = el("input", { class: "input", placeholder: "Nome da categoria" });
  const tipo = el("select", { class: "input" },
    el("option", { value: "" }, "Entrada e saída"),
    el("option", { value: "entrada" }, "Só entrada"),
    el("option", { value: "saida" }, "Só saída")
  );
  const btn = el("button", { class: "btn btn--primary" }, "Adicionar");

  async function adicionar() {
    if (!nome.value.trim()) {
      toast("Digite o nome", "erro");
      return;
    }
    btn.disabled    = true;
    btn.textContent = "Adicionando...";
    try {
      await criarCategoria(state.company.id, nome.value.trim(), tipo.value || null);
      nome.value      = "";
      state.categorias = [];
      toast("Categoria criada", "ok");
      await carregar();
    } catch (err) {
      toast("Erro ao criar", "erro");
      console.error(err);
    } finally {
      btn.disabled    = false;
      btn.textContent = "Adicionar";
    }
  }

  btn.addEventListener("click", adicionar);
  nome.addEventListener("keydown", (e) => { if (e.key === "Enter") adicionar(); });

  return el("section", { class: "card form-inline" }, nome, tipo, btn);
}

async function carregar() {
  const box = $("#lista-categorias");
  if (!box) return;

  const cats = await listarCategorias(state.company.id);
  state.categorias = cats;

  if (cats.length === 0) {
    box.innerHTML = "";
    box.append(emptyState("Nenhuma categoria ainda.\nCrie uma acima para organizar seus lançamentos.", ICONS.categorias));
    return;
  }

  const lista = el("ul", { class: "cat-list" });
  for (const c of cats) {
    const [rotuloTipo, badgeClass] =
      c.kind === "entrada"
        ? ["Entrada", "badge"]
        : c.kind === "saida"
        ? ["Saída", "badge badge--saida"]
        : ["Ambos", "badge badge--muted"];
    lista.append(
      el("li", { class: "cat" },
        el("span", { class: "cat__name" }, c.name),
        el("span", { class: badgeClass }, rotuloTipo),
        el("button", {
          class: "btn btn--tiny btn--ghost",
          onclick: () => confirmarApagar(c),
        }, "Apagar")
      )
    );
  }
  box.innerHTML = "";
  box.append(lista);
}

function confirmarApagar(c) {
  const btnApagar = el("button", { class: "btn btn--danger" }, "Apagar");

  async function apagar() {
    btnApagar.disabled    = true;
    btnApagar.textContent = "Apagando...";
    try {
      await apagarCategoria(c.id);
      state.categorias = [];
      closeModal();
      await carregar();
    } catch {
      toast("Não foi possível apagar", "erro");
      btnApagar.disabled    = false;
      btnApagar.textContent = "Apagar";
    }
  }

  btnApagar.addEventListener("click", apagar);

  openModal("Apagar categoria",
    el("div", {},
      el("p", { style: "margin:0 0 24px;color:var(--c-text-2,#6a7870);line-height:1.6;" },
        `Tem certeza que deseja apagar "${c.name}"? Os lançamentos vinculados não serão afetados.`),
      el("div", { class: "form__actions" },
        el("button", { class: "btn btn--ghost", onclick: closeModal }, "Cancelar"),
        btnApagar
      )
    )
  );
}
