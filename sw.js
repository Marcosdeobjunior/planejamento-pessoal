var CACHE = "soter-v3";

// Respostas maiores que isso não vão para o cache (imagens pesadas, vídeos)
var MAX_CACHE_BYTES = 1024 * 1024;

// Arquivos críticos pré-cacheados na instalação. Caminhos relativos ao sw.js: o site é
// servido em um subcaminho (GitHub Pages /planejamento-pessoal/), não na raiz do domínio.
var PRECACHE = [
  "./",
  "./index.html",
  "./apresentacao.html",
  "./css/design-system.css",
  "./css/icons.css",
  "./css/app-shell.css",
  "./css/apresentacao.css",
  "./js/firebase-config.js",
  "./js/app-shell.js",
  "./js/apresentacao.js",
  "./img/favicon-32.png",
];

// Rotas que nunca devem ser servidas do cache (Firebase, Google Fonts CDN)
function isNetworkOnly(url) {
  return (
    url.includes("firebaseio.com") ||
    url.includes("firestore.googleapis.com") ||
    url.includes("googleapis.com/identitytoolkit") ||
    url.includes("securetoken.googleapis.com") ||
    url.includes("fonts.googleapis.com") ||
    url.includes("fonts.gstatic.com")
  );
}

self.addEventListener("install", function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (cache) {
      return cache.addAll(PRECACHE);
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (k) { return k !== CACHE; }).map(function (k) {
          return caches.delete(k);
        })
      );
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener("fetch", function (e) {
  var req = e.request;

  // Só intercepta GET
  if (req.method !== "GET") return;

  // Rotas de API/auth: sempre busca na rede
  if (isNetworkOnly(req.url)) return;

  // Estratégia: network-first com fallback para cache
  e.respondWith(
    fetch(req).then(function (res) {
      // Cacheia respostas válidas de mesma origem
      if (res && res.status === 200 && req.url.startsWith(self.location.origin)) {
        var clone = res.clone();
        var declared = Number(res.headers.get("Content-Length") || 0);
        if (declared <= MAX_CACHE_BYTES) {
          clone.blob().then(function (body) {
            if (body.size > MAX_CACHE_BYTES) return;
            return caches.open(CACHE).then(function (cache) {
              return cache.put(req, new Response(body, {
                status: clone.status,
                statusText: clone.statusText,
                headers: clone.headers
              }));
            });
          }).catch(function () { });
        }
      }
      return res;
    }).catch(function () {
      // Rede falhou — serve do cache se disponível
      return caches.match(req).then(function (cached) {
        return cached || new Response("Sem conexão. Recarregue quando online.", {
          status: 503,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
      });
    })
  );
});
