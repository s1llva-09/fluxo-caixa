// ============================================================================
//  ui.js — Pequenos ajudantes de interface
// ============================================================================

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) =>
  Array.from(root.querySelectorAll(selector));

// Cria um elemento HTML de forma rápida.
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === "class") node.className = value;
    else if (key === "html") node.innerHTML = value;
    else if (key.startsWith("on") && typeof value === "function") {
      node.addEventListener(key.slice(2), value);
    } else if (value != null) {
      node.setAttribute(key, value);
    }
  }
  for (const child of children.flat()) {
    if (child == null) continue;
    node.append(child.nodeType ? child : document.createTextNode(child));
  }
  return node;
}

// Mostra um aviso temporário no canto da tela (toast).
export function toast(message, tipo = "info") {
  const box =
    $("#toast-area") ||
    document.body.appendChild(el("div", { id: "toast-area" }));
  const t = el("div", { class: `toast toast--${tipo}` }, message);
  box.append(t);
  setTimeout(() => t.classList.add("toast--out"), 3000);
  setTimeout(() => t.remove(), 3400);
}

// Abre o modal com um título e um conteúdo (elemento HTML).
export function openModal(title, contentEl) {
  const overlay = $("#modal-overlay");
  $("#modal-title").textContent = title;
  const body = $("#modal-body");
  body.innerHTML = "";
  body.append(contentEl);
  overlay.classList.add("is-open");
}

export function closeModal() {
  $("#modal-overlay")?.classList.remove("is-open");
}

// ---- Campo de senha com olhinho ----------------------------------------

const SVG_EYE = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
const SVG_EYE_OFF = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;

// Retorna { wrap, input } — coloque wrap no form e use input.value para ler.
export function senhaInput(attrs = {}) {
  const input = el("input", { type: "password", class: "input", ...attrs });
  const toggle = el("button", {
    type: "button",
    class: "input-pass__toggle",
    "aria-label": "Mostrar senha",
    html: SVG_EYE,
  });
  toggle.addEventListener("click", () => {
    const mostrar = input.type === "password";
    input.type = mostrar ? "text" : "password";
    toggle.innerHTML = mostrar ? SVG_EYE_OFF : SVG_EYE;
    toggle.setAttribute("aria-label", mostrar ? "Ocultar senha" : "Mostrar senha");
    input.focus();
  });
  const wrap = el("div", { class: "input-pass" });
  wrap.append(input, toggle);
  return { wrap, input };
}

// ---- Estado vazio com ícone --------------------------------------------

export function emptyState(texto, svgIcon = "") {
  const children = [];
  if (svgIcon) children.push(el("div", { class: "empty-state__icon", html: svgIcon }));
  children.push(el("p", { class: "empty-state__text" }, texto));
  return el("div", { class: "empty-state" }, ...children);
}

// SVGs para cada contexto de estado vazio
export const ICONS = {
  lancamentos: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>`,
  categorias:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>`,
  relatorio:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/><line x1="2" y1="20" x2="22" y2="20"/></svg>`,
  dashboard:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>`,
};
