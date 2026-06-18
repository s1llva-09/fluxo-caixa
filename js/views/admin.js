// ============================================================================
//  views/admin.js — Painel do Admin (só o admin acessa)
// ----------------------------------------------------------------------------
//  Lista todos os clientes (empresas), mostra uso e deixa bloquear/liberar o
//  acesso e definir o vencimento da mensalidade. A segurança de verdade está
//  no banco (RLS + funções is_admin): aqui é só a interface.
// ============================================================================

import { el, $, toast, openModal, closeModal, errorState, skeletonList, senhaInput } from "../ui.js";
import { listarClientesAdmin, definirStatusCliente, registrarPagamento, listarPagamentos } from "../api.js";
import { updateEmail, updatePassword } from "../auth.js";
import { state } from "../state.js";
import { formatDate, formatBRL, parseToCents, todayISO } from "../money.js";

// Janela (em dias) para o aviso de "mensalidade vencendo em breve".
const AVISO_DIAS = 7;

let clientes = [];
let filtro = "";

export async function renderAdmin(root) {
  root.innerHTML = "";
  root.append(
    el("header", { class: "page-head" },
      el("h1", { class: "page-title" }, "Painel do Admin"),
      el("p", { class: "page-sub" }, "Clientes do Fluxo de Caixa e controle de assinatura")
    ),
    el("section", { id: "admin-resumo", class: "stats admin-resumo" }),
    el("section", { class: "card" },
      el("div", { class: "card__head" },
        el("h2", { class: "card__title" }, "Clientes"),
        buscaInput()
      ),
      el("div", { id: "admin-lista" }, skeletonList(5))
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
  async function salvarEmail() {
    const v = emailInput.value.trim();
    if (!v) { toast("Digite o novo email", "erro"); return; }
    if (v === emailAtual) { toast("É o mesmo email atual", "info"); return; }
    btnEmail.disabled = true; btnEmail.textContent = "Enviando...";
    try {
      await updateEmail(v);
      toast("Confirme o novo email pela caixa de entrada", "info");
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
  const vencendo = clientes.filter((c) => venceEmBreve(c)).length;
  box.innerHTML = "";
  box.append(
    resumoCard("Clientes", total),
    resumoCard("Ativos", ativos, "entrada"),
    resumoCard(`Vencendo (${AVISO_DIAS}d)`, vencendo, vencendo > 0 ? "alerta" : ""),
    resumoCard("Bloqueados / vencidos", inativos, inativos > 0 ? "saida" : "")
  );
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
  const base = new Date((iso || todayISO()) + "T00:00:00");
  base.setMonth(base.getMonth() + 1);
  return base.toISOString().slice(0, 10);
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
            el("span", { class: st.cls }, st.label),
            venceEmBreve(c) ? el("span", { class: "badge badge--alerta" }, avisoVenc(c)) : null
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

  // ---- pagamentos ----
  const baseVenc = (c.plan_until && c.plan_until >= todayISO()) ? c.plan_until : todayISO();
  const valorInput = el("input", { class: "input", inputmode: "decimal", placeholder: "R$ (opcional)" });
  const dataPagInput = el("input", { class: "input", type: "date", value: todayISO() });
  const renovarInput = el("input", { class: "input", type: "date", value: addUmMes(baseVenc) });
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

      el("h3", { class: "admin-pay__titulo" }, "Registrar pagamento"),
      el("div", { class: "admin-pay__row" },
        el("label", { class: "field" }, el("span", { class: "field__label" }, "Valor"), valorInput),
        el("label", { class: "field" }, el("span", { class: "field__label" }, "Data do pagamento"), dataPagInput)
      ),
      el("label", { class: "field" },
        el("span", { class: "field__label" }, "Renovar acesso até"), renovarInput),
      el("label", { class: "field" },
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
