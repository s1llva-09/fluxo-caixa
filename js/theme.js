// ============================================================================
//  theme.js — Tema claro / escuro / automático
// ----------------------------------------------------------------------------
//  Guarda a preferência no localStorage e aplica no <html> via data-theme.
//  "system" acompanha o tema do sistema operacional (prefers-color-scheme).
//  Para evitar "flash" ao carregar, o tema também é aplicado por um pequeno
//  script inline no <head> do index.html.
// ============================================================================

const STORAGE_KEY = "fc-theme";
export const THEMES = ["light", "dark", "system"];

const media = window.matchMedia("(prefers-color-scheme: dark)");

// Lê a preferência salva; cai para "light" se não houver nada válido.
export function getTheme() {
  const saved = localStorage.getItem(STORAGE_KEY);
  return THEMES.includes(saved) ? saved : "light";
}

// Converte a preferência num tema concreto ("light" ou "dark").
function resolve(theme) {
  if (theme === "system") return media.matches ? "dark" : "light";
  return theme === "dark" ? "dark" : "light";
}

// Aplica o tema no documento (sem salvar).
export function applyTheme(theme) {
  const resolvido = resolve(theme);
  document.documentElement.setAttribute("data-theme", resolvido);
  // Cor da barra de status no mobile / PWA acompanha o tema. Os valores são
  // os mesmos de --c-bg nos dois temas: quando divergem, a barra de status
  // fica num tom diferente do fundo do app e a emenda aparece.
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", resolvido === "dark" ? "#0B0E1A" : "#F0EFF4");

  // Quem desenha em <canvas> não é repintado pelo CSS: o Chart.js copia as
  // cores das CSS vars uma vez, na hora de desenhar. Sem este aviso, trocar
  // de tema no dashboard deixava grade e eixos na cor do tema anterior até
  // navegar pra outra tela e voltar.
  window.dispatchEvent(new CustomEvent("temachange", { detail: resolvido }));
}

// Salva e aplica.
export function setTheme(theme) {
  const t = THEMES.includes(theme) ? theme : "light";
  localStorage.setItem(STORAGE_KEY, t);
  applyTheme(t);
}

// Garante que o tema salvo esteja aplicado (chamado no boot) e, no modo
// "system", reage quando o usuário muda o tema do sistema operacional.
export function initTheme() {
  applyTheme(getTheme());
  media.addEventListener("change", () => {
    if (getTheme() === "system") applyTheme("system");
  });
}
