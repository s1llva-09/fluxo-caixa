// ============================================================================
//  index.js — Ponto de entrada da aplicação
// ============================================================================
//  É o "maestro": decide o que mostrar (login, criar empresa ou o app),
//  controla a navegação entre as telas e o botão de sair.
//  Carregado no index.html com <script type="module" src="js/index.js">.
// ============================================================================

import { $, $$, el, toast, openModal, closeModal } from "./ui.js";
import { moduloLiberado, planoDe, MODULOS_GATED } from "./planos.js";
import { setTheme, THEMES } from "./theme.js";

const SUN_SVG = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>`;
const MOON_SVG = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;
import { state, empresaAtiva } from "./state.js";
import { formatDate, todayISO, setMoeda } from "./money.js";
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
import { renderFuncionarios } from "./views/funcionarios.js";
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
  funcionarios: renderFuncionarios,
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

    // Tema e moeda da CONTA mandam sobre o que este aparelho tinha guardado:
    // quem trocou o tema no celular espera achar o app assim no computador.
    aplicarPreferencias(state.user.user_metadata);

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

// Aplica as preferências salvas na conta. setTheme/setMoeda também gravam no
// localStorage, então o cache local do aparelho fica em dia de brinde.
function aplicarPreferencias(meta) {
  if (!meta) return;
  if (THEMES.includes(meta.theme)) setTheme(meta.theme);
  if (meta.moeda) setMoeda(meta.moeda);
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
  // Mês atual na topbar (ex.: "Agosto 2026").
  const mesEl = $("#topbar-mes");
  if (mesEl) {
    const m = new Date().toLocaleDateString("pt-BR", { month: "long" });
    mesEl.textContent = `${m.charAt(0).toUpperCase()}${m.slice(1)} ${new Date().getFullYear()}`;
  }
  // Mostra o item "Admin" no menu só pra quem é admin.
  $$(".nav__admin").forEach((b) => { b.hidden = !state.isAdmin; });
  // Gating por plano: esconde os módulos que o plano da empresa não libera.
  const plano = planoDe(state.company);
  for (const tela of MODULOS_GATED) {
    const ok = moduloLiberado(plano, tela);
    $$(`[data-tela="${tela}"]`).forEach((b) => { b.hidden = !ok; });
  }
  // Esconde o rótulo de grupos que ficaram sem nenhum item visível.
  $$(".nav__group").forEach((g) => {
    const temItem = [...g.querySelectorAll(".nav__item")].some((b) => !b.hidden);
    g.hidden = !temItem;
  });
  mostrarAvisoVencimento();
  configurarNotificacoes();
  configurarSeletorEmpresa();
  // Abre na tela que a URL pede — é o que faz o F5 e o link direto caírem no
  // lugar certo em vez de sempre no dashboard.
  irPara(telaDoHash());
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
//
// A tela atual mora no hash da URL (#/lancamentos). Antes ela só existia numa
// troca de innerHTML, e isso custava três coisas: F5 sempre voltava pro
// dashboard, o botão voltar do Android fechava o app (não havia histórico
// nenhum pra desempilhar) e não dava pra mandar link de tela pra ninguém.
//
// Fluxo: quem clica chama navegar(), que só mexe no hash; o hashchange é o
// único lugar que manda desenhar. Assim clique do menu e botão voltar do
// navegador percorrem exatamente o mesmo caminho.

// Nome da tela pedida pela URL. Cai no dashboard se o hash estiver vazio ou
// apontar pra algo que não existe (link velho, tela renomeada).
function telaDoHash() {
  const nome = location.hash.replace(/^#\/?/, "");
  return telas[nome] ? nome : "dashboard";
}

// Pede uma tela. Empilha no histórico e deixa o hashchange desenhar.
function navegar(nome) {
  const alvo = `#/${nome}`;
  if (location.hash === alvo) {
    // Já está nela: não empilha duplicata no histórico nem redesenha. Mas o
    // drawer do celular precisa fechar mesmo assim — sem isso, tocar no item
    // da tela atual deixava o menu aberto sem nada acontecer.
    $("#app-shell").classList.remove("nav-open");
    $("#btn-mais")?.setAttribute("aria-expanded", "false");
    return;
  }
  location.hash = alvo;
}

window.addEventListener("hashchange", () => {
  // Fora do app (login, onboarding, redefinir senha) o hash tem outros donos:
  // a auth.js usa "#criar" e o link de recuperação do Supabase usa
  // "#type=recovery". Roteia só quando o app está de fato na tela.
  if ($("#app-shell").hidden) return;
  irPara(telaDoHash());
});

function irPara(nome) {
  // Bloqueia telas fora do plano (ex.: link direto/atalho).
  if (!moduloLiberado(planoDe(state.company), nome)) {
    toast("Esse módulo não está no seu plano.", "info");
    nome = "dashboard";
  }

  // Deixa a URL contando a verdade quando o pedido foi corrigido acima (tela
  // fora do plano, hash inexistente). replaceState em vez de mexer no
  // location.hash de propósito: não dispara hashchange, então não reentra
  // aqui, e corrigir um destino inválido não vira uma entrada no histórico.
  const alvo = `#/${nome}`;
  if (location.hash !== alvo) history.replaceState(null, "", alvo);
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
  $("#btn-mais")?.setAttribute("aria-expanded", "false");
  window.scrollTo({ top: 0, behavior: "instant" });
}

// ---- liga os botões da interface -------------------------------------------

function ligarEventos() {
  // Navegação — sidebar e bottom nav
  $$(".nav__item, .bottom-nav__item").forEach((btn) => {
    if (!btn.dataset.tela) return;
    btn.addEventListener("click", () => navegar(btn.dataset.tela));
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

  // Toggle de tema (claro/escuro) na topbar.
  const btnTema = $("#btn-tema");
  if (btnTema) {
    const pintarTema = () => {
      const dark = document.documentElement.getAttribute("data-theme") === "dark";
      btnTema.innerHTML = dark ? SUN_SVG : MOON_SVG;
    };
    pintarTema();
    btnTema.addEventListener("click", () => {
      const dark = document.documentElement.getAttribute("data-theme") === "dark";
      setTheme(dark ? "light" : "dark");
      pintarTema();
    });
  }

  // "Mais" na barra inferior: abre o mesmo drawer do hamburger, onde ficam os
  // destinos que não couberam nas 5 abas.
  const btnMais = $("#btn-mais");
  btnMais?.addEventListener("click", () => {
    const aberto = $("#app-shell").classList.toggle("nav-open");
    btnMais.setAttribute("aria-expanded", String(aberto));
  });

  // Fechar menu ao clicar no overlay escuro (mobile)
  document.addEventListener("click", (e) => {
    const shell = $("#app-shell");
    if (!shell?.classList.contains("nav-open")) return;
    // #btn-mais entra na lista de exceções junto com #btn-menu: sem isso, o
    // clique que abre o drawer continua subindo até aqui e o fecha no mesmo
    // instante — o drawer nunca chegaria a aparecer.
    if (!e.target.closest(".nav") && !e.target.closest("#btn-menu") && !e.target.closest("#btn-mais")) {
      shell.classList.remove("nav-open");
      btnMais?.setAttribute("aria-expanded", "false");
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
