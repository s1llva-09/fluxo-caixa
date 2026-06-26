// ============================================================================
//  sw.js — Service Worker (PWA)
// ----------------------------------------------------------------------------
//  Deixa o app instalável e abre rápido offline (a "casca" do app).
//  Só mexe em arquivos do PRÓPRIO site (same-origin). Chamadas ao Supabase,
//  fontes do Google e módulos do esm.sh passam direto pra rede.
// ============================================================================

const CACHE = "fluxo-caixa-v3";

// Arquivos essenciais pra casca abrir offline.
const ASSETS = [
  "./",
  "./index.html",
  "./css/index.css",
  "./favicon.svg",
  "./icon.svg",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-180.png",
  "./manifest.webmanifest",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  // Só cuidamos de GET do próprio site. O resto (API, fontes, CDN) vai pra rede.
  if (e.request.method !== "GET" || url.origin !== location.origin) return;

  // REDE PRIMEIRO: o código (js/css/html) fica sempre atualizado quando online.
  // O cache é só reserva pra abrir offline. (Antes era cache-first, o que fazia
  // o app continuar rodando JS antigo mesmo depois de um deploy.)
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res && res.status === 200) {
          const copia = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copia));
        }
        return res;
      })
      .catch(() =>
        caches.match(e.request).then((cached) =>
          cached || (e.request.mode === "navigate" ? caches.match("./index.html") : undefined)
        )
      )
  );
});
