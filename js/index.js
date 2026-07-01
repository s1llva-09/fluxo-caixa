// ============================================================================
//  index.js — Ponto de entrada da aplicação
// ============================================================================
//  É o "maestro": decide o que mostrar (login, criar empresa ou o app),
//  controla a navegação entre as telas e o botão de sair.
//  Carregado no index.html com <script type="module" src="js/index.js">.
// ============================================================================

import { $, $$, el, toast, openModal, closeModal } from "./ui.js";
import { state, empresaAtiva } from "./state.js";
import { formatDate, todayISO } from "./money.js";
import { initTheme } from "./theme.js";

// Janela (dias) para avisar o cliente que a mensalidade está perto de vencer.
const AVISO_VENC_DIAS = 7;
import { getUser, signOut, onAuthChange, onPasswordRecovery } from "./auth.js";
import {
  getMinhaEmpresa, souAdmin, processarRecorrencias, meusConvites, aceitarConvite,
  setEmpresaAtiva, minhasEmpresas, listarCategorias, listarContas, listarMembros,
} from "./api.js";

import { renderAuth, renderOnboarding, renderBloqueado, renderRedefinir, renderConvites } from "./views/auth.js";
import { renderDashboard } from "./views/dashboard.js";
import { renderLancamentos } from "./views/lancamentos.js";
import { renderContas } from "./views/contas.js";
import { renderCategorias } from "./views/categorias.js";
import { renderVendas } from "./views/vendas.js";
import { renderEstoque } from "./views/estoque.js";
import { renderClientes } from "./views/clientes.js";
import { renderRelatorios } from "./views/relatorios.js";
import { renderConfiguracoes } from "./views/configuracoes.js";
import { renderAdmin } from "./views/admin.js";

// Mapa: nome da tela -> função que desenha ela
const telas = {
  dashboard: renderDashboard,
  lancamentos: renderLancamentos,
  contas: renderContas,
  categorias: renderCategorias,
  vendas: renderVendas,
  estoque: renderEstoque,
  clientes: renderClientes,
  relatorios: renderRelatorios,
  configuracoes: renderConfiguracoes,
  admin: renderAdmin,
};

// ---- decide o que mostrar na tela ------------------------------------------

async function iniciar() {
  try {
    state.user = await getUser();

    if (!state.user) {
      mostrarAuth();
      return;
    }

    // Descobre se é o admin (não-fatal: se falhar, segue como cliente comum).
    try {
      state.isAdmin = await souAdmin();
    } catch {
      state.isAdmin = false;
    }

    state.company = await getMinhaEmpresa();
    if (!state.company) {
      // Sem empresa: se tem convite pendente, mostra pra aceitar; senão, cria a sua.
      let convites = [];
      try { convites = await meusConvites(); } catch (err) { console.error(err); }
      if (convites.length) { mostrarConvites(convites); return; }
      mostrarOnboarding();
      return;
    }

    // Cliente com mensalidade vencida ou bloqueado perde o acesso ao app.
    // O admin nunca é bloqueado (precisa entrar pra gerenciar).
    if (!state.isAdmin && !empresaAtiva(state.company)) {
      mostrarBloqueado();
      return;
    }

    // Pré-carrega as categorias (pra Lançamentos/Contas abrirem na hora, sem
    // aquele instante de tela anterior). Não-fatal.
    try {
      state.categorias = await listarCategorias(state.company.id);
    } catch (err) {
      console.error("Categorias:", err);
    }

    // Gera os lançamentos recorrentes que já venceram (não-fatal).
    try {
      state.recorrenciasGeradas = await processarRecorrencias(state.company.id);
    } catch (err) {
      console.error("Recorrências:", err);
      state.recorrenciasGeradas = 0;
    }

    mostrarApp();
  } catch (err) {
    console.error("Erro ao iniciar:", err);
    mostrarAuth();
  }
}

function mostrarAuth() {
  $("#app-shell").hidden = true;
  $("#auth-root").hidden = false;
  renderAuth($("#auth-root"), iniciar);
}

function mostrarOnboarding() {
  $("#app-shell").hidden = true;
  $("#auth-root").hidden = false;
  renderOnboarding($("#auth-root"), iniciar);
}

// Tela de convites recebidos (quando o usuário ainda não tem empresa).
function mostrarConvites(convites) {
  $("#app-shell").hidden = true;
  $("#auth-root").hidden = false;
  renderConvites($("#auth-root"), convites, {
    onAceitar: async (c) => { await aceitarConvite(c.id); setEmpresaAtiva(c.company_id); await iniciar(); },
    onCriarPropria: () => mostrarOnboarding(),
  });
}

// Tela de criar nova senha (quando a pessoa volta pelo link de redefinição).
let redefinindo = false;
function mostrarRedefinir() {
  if (redefinindo) return;
  redefinindo = true;
  $("#app-shell").hidden = true;
  $("#auth-root").hidden = false;
  renderRedefinir($("#auth-root"), async () => {
    // Limpa o hash de "recovery" da URL e segue o fluxo normal já logado.
    history.replaceState({}, "", window.location.pathname + window.location.search);
    redefinindo = false;
    await iniciar();
  });
}

// Tela de acesso suspenso (mensalidade vencida / cliente bloqueado).
function mostrarBloqueado() {
  $("#app-shell").hidden = true;
  $("#auth-root").hidden = false;
  renderBloqueado($("#auth-root"), async () => {
    await signOut();
    state.company = null;
    mostrarAuth();
  });
}

function mostrarApp() {
  $("#auth-root").hidden = true;
  $("#app-shell").hidden = false;
  const badge = $("#empresa-nome");
  badge.textContent = state.company.name;
  badge.setAttribute("title", state.company.name);
  // Mostra o item "Admin" no menu só pra quem é admin.
  $$(".nav__admin").forEach((b) => { b.hidden = !state.isAdmin; });
  mostrarAvisoVencimento();
  configurarNotificacoes();
  configurarSeletorEmpresa();
  irPara("dashboard");
}

// Sininho de notificações no topo (sempre visível; badge com a contagem).
async function configurarNotificacoes() {
  const btn = $("#btn-notif");
  if (!btn) return;
  btn.hidden = false; // o sino fica sempre na barra
  const notifs = await coletarNotificacoes();
  const badge = $("#notif-count");
  if (notifs.length) { badge.textContent = String(notifs.length); badge.hidden = false; }
  else { badge.hidden = true; }
  btn.onclick = () => abrirNotificacoes(notifs);
}

// Junta tudo que vale notificar: convites, contas vencidas/vencendo, mensalidade.
async function coletarNotificacoes() {
  const out = [];
  const dias = (iso) =>
    Math.round((new Date(iso + "T00:00:00") - new Date(todayISO() + "T00:00:00")) / 86400000);

  // Convites recebidos.
  try {
    let convites = await meusConvites();
    convites = convites.filter((c) => c.company_id !== state.company.id);
    for (const c of convites) {
      out.push({
        titulo: `Convite: ${c.company_name}`,
        sub: "Você foi convidado para entrar nesta empresa.",
        acaoLabel: "Entrar nesta empresa",
        acao: async () => { await aceitarConvite(c.id); setEmpresaAtiva(c.company_id); closeModal(); await iniciar(); },
      });
    }
  } catch (err) { /* migração de equipe pode não ter rodado */ }

  // Contas a pagar/receber vencidas ou vencendo.
  try {
    const pend = await listarContas(state.company.id, "pending");
    const hoje = todayISO();
    const vencidas = pend.filter((c) => c.due_on < hoje).length;
    const vencendo = pend.filter((c) => c.due_on >= hoje && dias(c.due_on) <= 7).length;
    const verContas = () => { closeModal(); document.querySelector('[data-tela="contas"]')?.click(); };
    if (vencidas) out.push({ titulo: `${vencidas} conta(s) vencida(s)`, sub: "Contas a pagar/receber em atraso.", acaoLabel: "Ver contas", acao: verContas });
    if (vencendo) out.push({ titulo: `${vencendo} conta(s) vencendo`, sub: "Vencem nos próximos 7 dias.", acaoLabel: "Ver contas", acao: verContas });
  } catch (err) { /* migração de contas pode não ter rodado */ }

  // Mensalidade do próprio cliente perto de vencer.
  if (!state.isAdmin && state.company?.plan_until) {
    const d = dias(state.company.plan_until);
    if (d >= 0 && d <= 7) {
      out.push({
        titulo: d === 0 ? "Mensalidade vence hoje" : d === 1 ? "Mensalidade vence amanhã" : `Mensalidade vence em ${d} dias`,
        sub: "Regularize para não perder o acesso.",
      });
    }
  }

  // Lançamentos recorrentes gerados neste acesso.
  if (state.recorrenciasGeradas > 0) {
    const n = state.recorrenciasGeradas;
    out.push({
      titulo: `${n} lançamento(s) recorrente(s) gerado(s)`,
      sub: "Criados automaticamente a partir das suas recorrências.",
      acaoLabel: "Ver lançamentos",
      acao: () => { closeModal(); document.querySelector('[data-tela="lancamentos"]')?.click(); },
    });
  }

  // Membro(s) novo(s) na equipe (só pro dono; entraram nos últimos 3 dias).
  if (state.company?.owner_id === state.user?.id) {
    try {
      const membros = await listarMembros(state.company.id);
      const novos = membros.filter((m) =>
        m.user_id !== state.user.id && m.created_at && dias(m.created_at.slice(0, 10)) >= -3 && dias(m.created_at.slice(0, 10)) <= 0);
      if (novos.length) {
        out.push({
          titulo: novos.length === 1 ? "Novo membro na equipe" : `${novos.length} novos membros na equipe`,
          sub: novos.map((m) => m.email).join(", "),
          acaoLabel: "Ver equipe",
          acao: () => { closeModal(); document.querySelector('[data-tela="configuracoes"]')?.click(); },
        });
      }
    } catch (err) { /* equipe pode não ter rodado */ }
  }

  return out;
}

function abrirNotificacoes(notifs) {
  const lista = el("div", {});
  if (!notifs.length) {
    lista.append(el("p", { class: "notif-vazio" }, "Nenhuma notificação no momento."));
  } else {
    for (const n of notifs) {
      const item = el("div", { class: "notif-item" },
        el("div", { class: "notif-item__nome" }, n.titulo),
        el("div", { class: "notif-item__sub" }, n.sub)
      );
      if (n.acao) {
        const b = el("button", { class: "btn btn--primary btn--block", style: "margin-top:8px" }, n.acaoLabel || "Abrir");
        b.addEventListener("click", async () => {
          b.disabled = true;
          try { await n.acao(); }
          catch (err) { console.error(err); toast("Não foi possível", "erro"); b.disabled = false; }
        });
        item.append(b);
      }
      lista.append(item);
    }
  }
  openModal("Notificações", lista);
}

// Deixa trocar de empresa (badge no topo + atalho no menu), se participa de várias.
async function configurarSeletorEmpresa() {
  const badge = $("#empresa-nome");
  let empresas = [];
  try { empresas = await minhasEmpresas(); } catch (err) { return; }
  const tem = empresas.length > 1;

  if (badge) {
    badge.classList.toggle("topbar__empresa--switch", tem);
    badge.onclick = tem ? () => abrirTrocaEmpresa(empresas) : null;
  }
  // Item "Trocar empresa" no menu lateral — só aparece com mais de uma empresa.
  $$(".nav__trocar").forEach((b) => {
    b.hidden = !tem;
    b.onclick = tem ? () => abrirTrocaEmpresa(empresas) : null;
  });
}

function abrirTrocaEmpresa(empresas) {
  $("#app-shell").classList.remove("nav-open");
  const lista = el("div", {});
  for (const e of empresas) {
    const atual = e.id === state.company.id;
    const item = el("button", {
      class: `btn btn--ghost btn--block troca-empresa ${atual ? "is-atual" : ""}`,
      style: "justify-content:space-between; margin-bottom:8px;",
      onclick: async () => {
        if (atual) { closeModal(); return; }
        setEmpresaAtiva(e.id);
        closeModal();
        await iniciar();
      },
    }, el("span", {}, e.name), el("span", { class: "troca-empresa__papel" }, atual ? "atual" : (e.role === "owner" ? "dono" : "membro")));
    lista.append(item);
  }
  openModal("Trocar de empresa", lista);
}

// Banner de "mensalidade vencendo" no topo do app (só pro cliente, não pro admin).
function mostrarAvisoVencimento() {
  const slot = $("#sub-banner");
  if (!slot) return;
  slot.innerHTML = "";
  if (state.isAdmin) return;

  const c = state.company;
  if (!c || !empresaAtiva(c) || !c.plan_until) return;

  const ms = new Date(c.plan_until + "T00:00:00") -
             new Date(new Date().toISOString().slice(0, 10) + "T00:00:00");
  const dias = Math.round(ms / 86400000);
  if (dias < 0 || dias > AVISO_VENC_DIAS) return;

  // Se já fechou o aviso pra ESTA data de vencimento, não mostra de novo.
  if (sessionStorage.getItem("sub-banner-dismiss") === c.plan_until) return;

  const quando = dias === 0 ? "hoje" : dias === 1 ? "amanhã" : `em ${dias} dias`;
  slot.append(
    el("div", { class: "sub-banner" },
      el("span", { class: "sub-banner__text" },
        `Sua mensalidade vence ${quando} (${formatDate(c.plan_until)}). Regularize para não perder o acesso.`),
      el("button", {
        class: "sub-banner__close",
        "aria-label": "Fechar aviso",
        onclick: () => {
          slot.innerHTML = "";
          sessionStorage.setItem("sub-banner-dismiss", c.plan_until);
        },
      }, "×")
    )
  );
}

// ---- navegação entre as telas ----------------------------------------------

function irPara(nome) {
  // Marca o item ativo no menu lateral e na bottom nav
  $$(".nav__item, .bottom-nav__item").forEach((b) =>
    b.classList.toggle("is-active", b.dataset.tela === nome)
  );

  // Limpa o conteúdo ANTES de desenhar a nova tela. Sem isso, telas que fazem
  // await (ex.: carregar categorias) deixavam a página anterior aparecendo por
  // um instante durante o fetch.
  const view = $("#view");
  view.innerHTML = "";

  // Animação de entrada da view
  view.classList.remove("is-entering");
  void view.offsetWidth; // força reflow para reiniciar a animação
  view.classList.add("is-entering");

  // Desenha a tela escolhida dentro de #view
  const render = telas[nome];
  if (render) render(view);

  // Fecha o menu no celular e volta ao topo
  $("#app-shell").classList.remove("nav-open");
  window.scrollTo({ top: 0, behavior: "instant" });
}

// ---- liga os botões da interface -------------------------------------------

function ligarEventos() {
  // Navegação — sidebar e bottom nav
  $$(".nav__item, .bottom-nav__item").forEach((btn) => {
    if (!btn.dataset.tela) return;
    btn.addEventListener("click", () => irPara(btn.dataset.tela));
  });

  // Sair
  const btnSair = $("#btn-sair");
  btnSair.addEventListener("click", async () => {
    btnSair.disabled = true;
    try {
      await signOut();
      state.company    = null;
      state.categorias = [];
      mostrarAuth();
    } catch {
      btnSair.disabled = false;
    }
  });

  // Botão de menu: no desktop recolhe/expande a sidebar (estado salvo);
  // no celular abre/fecha o drawer lateral.
  const COLLAPSE_KEY = "fc-sidebar-collapsed";
  if (localStorage.getItem(COLLAPSE_KEY) === "1") {
    $("#app-shell").classList.add("nav-collapsed");
  }
  $("#btn-menu")?.addEventListener("click", () => {
    const shell = $("#app-shell");
    if (window.matchMedia("(min-width: 761px)").matches) {
      const colapsada = shell.classList.toggle("nav-collapsed");
      try { localStorage.setItem(COLLAPSE_KEY, colapsada ? "1" : "0"); } catch {}
    } else {
      shell.classList.toggle("nav-open");
    }
  });

  // Fechar menu ao clicar no overlay escuro (mobile)
  document.addEventListener("click", (e) => {
    const shell = $("#app-shell");
    if (!shell?.classList.contains("nav-open")) return;
    if (!e.target.closest(".nav") && !e.target.closest("#btn-menu")) {
      shell.classList.remove("nav-open");
    }
  });

  // Fechar o modal (X, clique fora ou Escape) — com animação de saída
  $("#modal-close")?.addEventListener("click", closeModal);
  $("#modal-overlay")?.addEventListener("click", (e) => {
    if (e.target.id === "modal-overlay") closeModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModal();
  });
}

// Se o login mudar em outra aba, reage.
onAuthChange((user) => {
  if (!user) {
    state.company = null;
    mostrarAuth();
  }
});

// Quando a pessoa volta pelo link de redefinição de senha.
onPasswordRecovery(() => mostrarRedefinir());

// Registra o Service Worker (PWA) — sem travar o boot se falhar.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}

// Liga tudo e inicia
initTheme();
ligarEventos();

// Se a URL é o retorno do link de redefinição, mostra a tela de nova senha
// em vez do fluxo normal (evita "piscar" o app antes de pedir a senha).
if (window.location.hash.includes("type=recovery")) {
  mostrarRedefinir();
} else {
  iniciar();
}
