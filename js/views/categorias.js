// ============================================================================
//  views/categorias.js — Gerenciar categorias
// ============================================================================
//  Categorias ajudam a organizar os lançamentos (Vendas, Aluguel, etc).
//  Diferente dos lançamentos, categoria PODE ser editada/apagada.
// ============================================================================

import { el, $, toast } from "../ui.js";
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

  async function adicionar() {
    if (!nome.value.trim()) {
      toast("Digite o nome", "erro");
      return;
    }
    try {
      await criarCategoria(state.company.id, nome.value.trim(), tipo.value || null);
      nome.value = "";
      state.categorias = []; // limpa o cache pra recarregar nas outras telas
      toast("Categoria criada", "ok");
      carregar();
    } catch (err) {
      toast("Erro ao criar", "erro");
      console.error(err);
    }
  }

  return el("section", { class: "card form-inline" },
    nome, tipo,
    el("button", { class: "btn btn--primary", onclick: adicionar }, "Adicionar")
  );
}

async function carregar() {
  const box = $("#lista-categorias");
  if (!box) return;
  const cats = await listarCategorias(state.company.id);
  state.categorias = cats;

  if (cats.length === 0) {
    box.innerHTML = "";
    box.append(el("p", { class: "empty" }, "Nenhuma categoria ainda."));
    return;
  }

  const lista = el("ul", { class: "cat-list" });
  for (const c of cats) {
    const rotuloTipo =
      c.kind === "entrada" ? "Entrada" : c.kind === "saida" ? "Saída" : "Ambos";
    lista.append(
      el("li", { class: "cat" },
        el("span", { class: "cat__name" }, c.name),
        el("span", { class: "badge" }, rotuloTipo),
        el("button", {
          class: "btn btn--tiny btn--ghost",
          onclick: async () => {
            try {
              await apagarCategoria(c.id);
              state.categorias = [];
              carregar();
            } catch {
              toast("Não foi possível apagar", "erro");
            }
          },
        }, "Apagar")
      )
    );
  }
  box.innerHTML = "";
  box.append(lista);
}
