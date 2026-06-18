// ============================================================================
//  views/admin.js — Painel do Admin (só o admin acessa)
// ----------------------------------------------------------------------------
//  Lista todos os clientes (empresas), mostra uso e deixa bloquear/liberar o
//  acesso e definir o vencimento da mensalidade. A segurança de verdade está
//  no banco (RLS + funções is_admin): aqui é só a interface.
// ============================================================================

import { el, $, toast, openModal, closeModal, errorState, skeletonList } from "../ui.js";
import { listarClientesAdmin, definirStatusCliente } from "../api.js";
import { formatDate, todayISO } from "../money.js";

let clientes = [];
let filtro = "";

export async function renderAdmin(root) {
  root.innerHTML = "";
  root.append(
    el("header", { class: "page-head" },
      el("h1", { class: "page-title" }, "Painel do Admin"),
      el("p", { class: "page-sub" }, "Clientes do Fluxo de Caixa e controle de assinatura")
    ),
    el("section", { id: "admin-resumo", class: "stats" }),
    el("section", { class: "card" },
      el("div", { class: "card__head" },
        el("h2", { class: "card__title" }, "Clientes"),
        buscaInput()
      ),
      el("div", { id: "admin-lista" }, skeletonList(5))
    )
  );
  await carregar();
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
  desenharResumo();
  desenharLista();
}

// ---- resumo (cards de cima) ------------------------------------------------

function desenharResumo() {
  const box = $("#admin-resumo");
  if (!box) return;
  const total = clientes.length;
  const ativos = clientes.filter((c) => c.active).length;
  const inativos = total - ativos;
  box.innerHTML = "";
  box.append(
    resumoCard("Clientes", total),
    resumoCard("Ativos", ativos, "entrada"),
    resumoCard("Bloqueados / vencidos", inativos, inativos > 0 ? "saida" : "")
  );
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
  const itens = !termo
    ? clientes
    : clientes.filter((c) =>
        (c.name || "").toLowerCase().includes(termo) ||
        (c.owner_email || "").toLowerCase().includes(termo));

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
            el("span", { class: st.cls }, st.label)
          ),
          el("div", { class: "admin-cli__email" }, c.owner_email || "—"),
          el("div", { class: "admin-cli__meta" },
            metaItem("Lançamentos", String(c.tx_count ?? 0)),
            metaItem("Última atividade", c.last_activity ? formatDate(c.last_activity) : "—"),
            metaItem("Cadastro", c.created_at ? formatDate(c.created_at.slice(0, 10)) : "—"),
            metaItem("Vencimento", c.plan_until ? formatDate(c.plan_until) : "sem data")
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
      // Atualiza em memória pra refletir sem novo fetch
      Object.assign(c, {
        status: atualizada.status,
        plan_until: atualizada.plan_until,
        active: atualizada.status === "active" &&
          (!atualizada.plan_until || atualizada.plan_until >= todayISO()),
      });
      closeModal();
      toast("Cliente atualizado", "ok");
      desenharResumo();
      desenharLista();
    } catch (err) {
      console.error(err);
      toast("Não foi possível salvar", "erro");
      btnSalvar.disabled = false;
      btnSalvar.textContent = "Salvar";
    }
  }
  btnSalvar.addEventListener("click", salvar);

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
      el("p", { class: "config__note" },
        "Sem data, o acesso fica liberado até você bloquear na mão. " +
        "Com data, o acesso cai sozinho quando ela passa."),
      el("div", { class: "form__actions" },
        el("button", { class: "btn btn--ghost", onclick: closeModal }, "Cancelar"),
        btnSalvar
      )
    )
  );
}
