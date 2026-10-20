var CACHE = "soter-v4";
// Dono dos lembretes deste aparelho (uid), gravado pelo site; fica fora do cache de arquivos.
var PUSH_CACHE = "soter-push";
var PUSH_OWNER_URL = "./__push_owner";

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
  "./img/icon-192.png",
  "./manifest.webmanifest",
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
        keys.filter(function (k) { return k !== CACHE && k !== PUSH_CACHE; }).map(function (k) {
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

// ── Lembretes no celular (Web Push, enviados por push/send.mjs) ─────────────────────────
// Cada aviso traz o uid da conta. Só mostra o conteúdo se for a conta dona deste aparelho;
// senão (aparelho trocou de conta e o aviso já estava a caminho) cancela a inscrição e mostra
// um aviso genérico, sem nada da outra conta.
function readPushOwner() {
  return caches.open(PUSH_CACHE).then(function (cache) {
    return cache.match(PUSH_OWNER_URL);
  }).then(function (res) {
    return res ? res.text() : "";
  }).catch(function () { return ""; });
}

self.addEventListener("push", function (e) {
  var data = {};
  try { data = e.data ? e.data.json() : {}; } catch (err) { data = {}; }
  e.waitUntil(readPushOwner().then(function (owner) {
    var icon = "img/icon-192.png";
    if (!owner || !data.uid || data.uid !== owner) {
      return self.registration.pushManager.getSubscription().then(function (sub) {
        return sub ? sub.unsubscribe() : false;
      }).catch(function () { return false; }).then(function () {
        return self.registration.showNotification("Sól de Sóter", {
          body: "Os lembretes deste aparelho foram desligados. Ative de novo no site, se quiser.",
          icon: icon,
          tag: "soter-push-off"
        });
      });
    }
    var url = /^[a-z0-9-]+\.html(\?[A-Za-z0-9=&_-]*)?$/.test(String(data.url || "")) ? data.url : "tarefas.html";
    return self.registration.showNotification(String(data.title || "Sól de Sóter"), {
      body: String(data.body || ""),
      icon: icon,
      badge: "img/badge-96.png",
      tag: String(data.tag || data.id || "soter"),
      data: { url: url }
    });
  }));
});

self.addEventListener("notificationclick", function (e) {
  e.notification.close();
  var target = new URL((e.notification.data && e.notification.data.url) || "tarefas.html", self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (list) {
    for (var i = 0; i < list.length; i += 1) {
      if (list[i].url.indexOf(self.registration.scope) === 0 && "focus" in list[i]) {
        return list[i].focus().then(function (client) {
          return client && "navigate" in client ? client.navigate(target) : client;
        });
      }
    }
    return self.clients.openWindow(target);
  }));
});
