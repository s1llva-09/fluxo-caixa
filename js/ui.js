// ============================================================================
//  ui.js — Pequenos ajudantes de interface
// ============================================================================
//  Funções genéricas que várias telas usam: mostrar avisos, criar elementos
//  HTML mais fácil, abrir/fechar o modal. Mantém o resto do código limpo.
// ============================================================================

// Atalho pra document.querySelector
export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) =>
  Array.from(root.querySelectorAll(selector));

// Cria um elemento HTML de forma rápida.
// Ex.: el("button", { class: "btn", onclick: fn }, "Salvar")
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
// tipo: "ok" (verde), "erro" (vermelho) ou "info" (neutro)
export function toast(message, tipo = "info") {
  const box =
    $("#toast-area") ||
    document.body.appendChild(el("div", { id: "toast-area" }));
  const t = el("div", { class: `toast toast--${tipo}` }, message);
  box.append(t);
  // Anima a saída e remove depois de alguns segundos
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
