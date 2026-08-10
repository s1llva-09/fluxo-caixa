// ============================================================================
//  sw.js — Service Worker (PWA)
// ----------------------------------------------------------------------------
//  Deixa o app instalável e abre rápido offline (a "casca" do app).
//  Só mexe em arquivos do PRÓPRIO site (same-origin). Chamadas ao Supabase,
//  fontes do Google e módulos do esm.sh passam direto pra rede.
// ============================================================================

// v13: tema escuro e movimento na landing; criar segunda empresa.
// Sem bumpar a versão, quem já tem o PWA instalado continuaria servindo o
// css/index.css e os módulos antigos do cache.
//
// REGRA: todo deploy que muda CSS ou JS bumpa este número. É ele que apaga o
// cache velho no 'activate'.
const CACHE = "fluxo-caixa-v13";

// Arquivos essenciais pra casca abrir offline.
// Obs.: usamos URLs "limpas" (/ e /app) porque o Vercel está com cleanUrls,
// então /index.html e /app.html respondem com redirect — e cache.addAll quebra
// se um asset vier redirecionado.
const ASSETS = [
  "/",
  "/app",
  "/css/index.css",
  "/favicon.svg",
  "/icon.svg",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-180.png",
  "/manifest.webmanifest",
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

  // STALE-WHILE-REVALIDATE: responde do cache NA HORA (reload instantâneo) e
  // atualiza o cache por baixo pra o próximo load pegar o mais novo. Deploy novo
  // muda o nome do CACHE (v8, v9...), o que apaga o cache velho no 'activate' e
  // força buscar o código fresco — então não fica rodando JS antigo.
  e.respondWith(
    caches.open(CACHE).then((cache) =>
      cache.match(e.request).then((cached) => {
        const rede = fetch(e.request)
          .then((res) => {
            if (res && res.status === 200) cache.put(e.request, res.clone());
            return res;
          })
          .catch(() =>
            cached || (e.request.mode === "navigate" ? cache.match("/app") : undefined)
          );
        // Se tem no cache, devolve já (rápido) e atualiza em segundo plano.
        return cached || rede;
      })
    )
  );
});
