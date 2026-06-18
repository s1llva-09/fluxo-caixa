// ============================================================================
//  sw.js — Service Worker (PWA)
// ----------------------------------------------------------------------------
//  Deixa o app instalável e abre rápido offline (a "casca" do app).
//  Só mexe em arquivos do PRÓPRIO site (same-origin). Chamadas ao Supabase,
//  fontes do Google e módulos do esm.sh passam direto pra rede.
// ============================================================================

const CACHE = "fluxo-caixa-v1";

// Arquivos essenciais pra casca abrir offline.
const ASSETS = [
  "./",
  "./index.html",
  "./css/index.css",
  "./favicon.svg",
  "./icon.svg",
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

  // Navegações (abrir o app): rede primeiro, cai pro cache se offline.
  if (e.request.mode === "navigate") {
    e.respondWith(
      fetch(e.request).catch(() => caches.match("./index.html"))
    );
    return;
  }

  // Estáticos (css/js/imagens): cache primeiro, atualiza em segundo plano.
  e.respondWith(
    caches.match(e.request).then((cached) => {
      const rede = fetch(e.request).then((res) => {
        if (res && res.status === 200) {
          const copia = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copia));
        }
        return res;
      }).catch(() => cached);
      return cached || rede;
    })
  );
});
