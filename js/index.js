// ============================================================================
//  index.js — Ponto de entrada da aplicação
// ============================================================================
//  É o "maestro": decide o que mostrar (login, criar empresa ou o app),
//  controla a navegação entre as telas e o botão de sair.
//  Carregado no index.html com <script type="module" src="js/index.js">.
// ============================================================================

import { $, $$ } from "./ui.js";
import { state } from "./state.js";
import { getUser, signOut, onAuthChange } from "./auth.js";
import { getMinhaEmpresa } from "./api.js";

import { renderAuth, renderOnboarding } from "./views/auth.js";
import { renderDashboard } from "./views/dashboard.js";
import { renderLancamentos } from "./views/lancamentos.js";
import { renderCategorias } from "./views/categorias.js";
import { renderRelatorios } from "./views/relatorios.js";
import { renderConfiguracoes } from "./views/configuracoes.js";

// Mapa: nome da tela -> função que desenha ela
const telas = {
  dashboard: renderDashboard,
  lancamentos: renderLancamentos,
  categorias: renderCategorias,
  relatorios: renderRelatorios,
  configuracoes: renderConfiguracoes,
};

// ---- decide o que mostrar na tela ------------------------------------------

async function iniciar() {
  try {
    state.user = await getUser();

    if (!state.user) {
      mostrarAuth();
      return;
    }

    state.company = await getMinhaEmpresa();
    if (!state.company) {
      mostrarOnboarding();
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

function mostrarApp() {
  $("#auth-root").hidden = true;
  $("#app-shell").hidden = false;
  $("#empresa-nome").textContent = state.company.name;
  irPara("dashboard");
}

// ---- navegação entre as telas ----------------------------------------------

function irPara(nome) {
  // Marca o item ativo no menu
  $$(".nav__item").forEach((b) =>
    b.classList.toggle("is-active", b.dataset.tela === nome)
  );
  // Desenha a tela escolhida dentro de #view
  const render = telas[nome];
  if (render) render($("#view"));
  // Fecha o menu no celular e volta ao topo
  $("#app-shell").classList.remove("nav-open");
  window.scrollTo({ top: 0, behavior: "instant" });
}

// ---- liga os botões da interface -------------------------------------------

function ligarEventos() {
  // Navegação (cada botão tem data-tela="dashboard", etc.)
  $$(".nav__item").forEach((btn) => {
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

  // Fechar o modal (X, clique fora ou Escape)
  $("#modal-close")?.addEventListener("click", () =>
    $("#modal-overlay").classList.remove("is-open")
  );
  $("#modal-overlay")?.addEventListener("click", (e) => {
    if (e.target.id === "modal-overlay")
      $("#modal-overlay").classList.remove("is-open");
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape")
      $("#modal-overlay")?.classList.remove("is-open");
  });
}

// Se o login mudar em outra aba, reage.
onAuthChange((user) => {
  if (!user) {
    state.company = null;
    mostrarAuth();
  }
});

// Liga tudo e inicia
ligarEventos();
iniciar();
