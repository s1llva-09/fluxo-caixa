// ============================================================================
//  index.js — Ponto de entrada da aplicação
// ============================================================================
//  É o "maestro": decide o que mostrar (login, criar empresa ou o app),
//  controla a navegação entre as telas e o botão de sair.
//  Carregado no index.html com <script type="module" src="js/index.js">.
// ============================================================================

import { $, $$, el, closeModal } from "./ui.js";
import { state, empresaAtiva } from "./state.js";
import { formatDate } from "./money.js";
import { initTheme } from "./theme.js";

// Janela (dias) para avisar o cliente que a mensalidade está perto de vencer.
const AVISO_VENC_DIAS = 7;
import { getUser, signOut, onAuthChange, onPasswordRecovery } from "./auth.js";
import { getMinhaEmpresa, souAdmin } from "./api.js";

import { renderAuth, renderOnboarding, renderBloqueado, renderRedefinir } from "./views/auth.js";
import { renderDashboard } from "./views/dashboard.js";
import { renderLancamentos } from "./views/lancamentos.js";
import { renderCategorias } from "./views/categorias.js";
import { renderRelatorios } from "./views/relatorios.js";
import { renderConfiguracoes } from "./views/configuracoes.js";
import { renderAdmin } from "./views/admin.js";

// Mapa: nome da tela -> função que desenha ela
const telas = {
  dashboard: renderDashboard,
  lancamentos: renderLancamentos,
  categorias: renderCategorias,
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
      mostrarOnboarding();
      return;
    }

    // Cliente com mensalidade vencida ou bloqueado perde o acesso ao app.
    // O admin nunca é bloqueado (precisa entrar pra gerenciar).
    if (!state.isAdmin && !empresaAtiva(state.company)) {
      mostrarBloqueado();
      return;
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
  irPara("dashboard");
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

  // Animação de entrada da view
  const view = $("#view");
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

  // Abrir/fechar menu no celular
  $("#btn-menu")?.addEventListener("click", () =>
    $("#app-shell").classList.toggle("nav-open")
  );

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
