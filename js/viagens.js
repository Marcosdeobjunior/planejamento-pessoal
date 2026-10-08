(function () {
  "use strict";

  var storage = window.SoterStorage || null;
  var state = storage ? storage.getState() : null;
  var STORAGE_KEY = "viagens";
  var LEAFLET_SRCS = [
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js",
    "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js",
    "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
  ];
  var T = [];
  var lmap = null;
  var MKS = [];
  var GCC = {};
  var edit = false;
  var editIdx = -1;
  var filt = "all";
  var pendingFilt = "all";
  var searchTerm = "";
  var page = 1;
  var PER = 6;
  var listResizeTimer = null;

  var SEED = [
    {
      destination: "Kyoto, Japao",
      startDate: "2027-10-12",
      endDate: "2027-10-22",
      budget: 14000,
      category: "Cidade/Pais",
      localDescription: "Templos, bairros historicos e uma temporada focada no outono japones.",
      descricao: "Templos, bairros historicos e uma temporada focada no outono japones.",
      image: "https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?auto=format&fit=crop&w=1200&q=80",
      imagem: "https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?auto=format&fit=crop&w=1200&q=80",
      coords: { lat: 35.0116, lng: 135.7681 }
    },
    {
      destination: "Lisboa, Portugal",
      startDate: "2025-06-10",
      endDate: "2025-06-17",
      budget: 6200,
      category: "Cidade/Pais",
      localDescription: "Miradouros, eletricos, azulejos e bairros historicos.",
      descricao: "Miradouros, eletricos, azulejos e bairros historicos.",
      image: "https://images.unsplash.com/photo-1513735492246-483525079686?auto=format&fit=crop&w=1200&q=80",
      imagem: "https://images.unsplash.com/photo-1513735492246-483525079686?auto=format&fit=crop&w=1200&q=80",
      coords: { lat: 38.7223, lng: -9.1393 }
    },
    {
      destination: "Sukiyabashi Jiro, Toquio",
      budget: 2800,
      category: "Restaurante",
      localDescription: "Reserva desejada para uma experiencia gastronomica icone.",
      descricao: "Reserva desejada para uma experiencia gastronomica icone.",
      image: "https://images.unsplash.com/photo-1559339352-11d035aa65de?auto=format&fit=crop&w=1200&q=80",
      imagem: "https://images.unsplash.com/photo-1559339352-11d035aa65de?auto=format&fit=crop&w=1200&q=80"
    },
    {
      destination: "Museu d'Orsay, Paris",
      budget: 300,
      category: "Museu",
      localDescription: "Parada obrigatoria para um dia inteiro de impressionismo.",
      descricao: "Parada obrigatoria para um dia inteiro de impressionismo.",
      image: "https://images.unsplash.com/photo-1549144511-f099e773c147?auto=format&fit=crop&w=1200&q=80",
      imagem: "https://images.unsplash.com/photo-1549144511-f099e773c147?auto=format&fit=crop&w=1200&q=80"
    }
  ];

  function norm(v) {
    return String(v == null ? "" : v).trim();
  }

  function getTravelBudget(item) {
    return parseFloat(
      item && (item.budget != null
        ? item.budget
        : item.orcamento != null
          ? item.orcamento
          : item.valor != null
            ? item.valor
            : item.preco)
    ) || 0;
  }

  function ensureTravelShape(item) {
    var image = norm(item && (item.image || item.imagem));
    return {
      destination: norm(item && (item.destination || item.destino || item.titulo || item.nome)),
      startDate: norm(item && item.startDate),
      endDate: norm(item && item.endDate),
      status: norm(item && item.status) || "planejada",
      budget: getTravelBudget(item),
      category: norm(item && (item.category || item.categoria)),
      localDescription: norm(item && (item.localDescription || item.descricaoLocal || item.descricao)),
      descricao: norm(item && (item.descricao || item.localDescription || item.descricaoLocal)),
      image: image,
      imagem: image,
      weather: item && item.weather ? item.weather : null,
      createdAt: norm(item && item.createdAt) || new Date().toISOString(),
      updatedAt: norm(item && item.updatedAt),
      coords: item && item.coords && isFinite(Number(item.coords.lat)) && isFinite(Number(item.coords.lng))
        ? { lat: Number(item.coords.lat), lng: Number(item.coords.lng) }
        : null
    };
  }

  function readStore() {
    var saved;
    if (state && state.data) {
      state.data.lastVisitedPage = "viagens";
      state.data.lastVisitedAt = new Date().toISOString();
      storage.save(state);
    }
    saved = storage ? storage.getData(STORAGE_KEY) : null;
    if (Array.isArray(saved)) {
      T = saved.map(ensureTravelShape);
      return;
    }
    T = [];
  }

  function save() {
    if (!storage) {
      return;
    }
    state = storage.getState();
    state.data.lastVisitedPage = "viagens";
    state.data.lastVisitedAt = new Date().toISOString();
    state.data[STORAGE_KEY] = T.slice();
    storage.save(state);
  }

  function toast(msg, type) {
    var cls = type === "s" ? "ts" : type === "e" ? "te" : "ti";
    var el = document.createElement("div");
    el.className = "toast " + cls;
    el.textContent = msg;
    document.getElementById("tc").appendChild(el);
    setTimeout(function () {
      el.style.animation = "tOut .28s ease forwards";
      setTimeout(function () {
        el.remove();
      }, 280);
    }, 3000);
  }

  function initMap(noMap) {
    if (noMap || typeof window.L === "undefined") {
      document.getElementById("map").innerHTML = '<div style="height:500px;display:flex;align-items:center;justify-content:center;color:#7a7590;font-family:DM Mono,monospace;font-size:11px;flex-direction:column;gap:8px"><span>Mapa indisponivel - sem conexao</span></div>';
      return;
    }
    lmap = window.L.map("map", { worldCopyJump: true, minZoom: 2, maxZoom: 18, zoomControl: true }).setView([-14, -51], 3);
    window.L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; <a href=\"https://www.openstreetmap.org/copyright\">OpenStreetMap</a> contributors",
      maxZoom: 19
    }).addTo(lmap);
    setTimeout(function () {
      if (lmap) lmap.invalidateSize();
    }, 300);
  }

  function geocode(dest, cb) {
    if (!dest) { cb(null); return; }
    if (Object.prototype.hasOwnProperty.call(GCC, dest)) { cb(GCC[dest]); return; }
    fetch("https://geocoding-api.open-meteo.com/v1/search?name=" + encodeURIComponent(dest) + "&count=1&language=pt&format=json")
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d && d.results && d.results.length > 0) {
          GCC[dest] = { lat: parseFloat(d.results[0].latitude), lng: parseFloat(d.results[0].longitude) };
          cb(GCC[dest]);
          return;
        }
        return fetch("https://nominatim.openstreetmap.org/search?format=json&q=" + encodeURIComponent(dest) + "&limit=1")
          .then(function (r) { return r.json(); })
          .then(function (d2) {
            if (d2 && d2.length > 0) {
              GCC[dest] = { lat: parseFloat(d2[0].lat), lng: parseFloat(d2[0].lon) };
            } else {
              GCC[dest] = null;
            }
            cb(GCC[dest]);
          });
      })
      .catch(function () {
        GCC[dest] = null;
        cb(null);
      });
  }

  function mstyle(cat, dest) {
    var c = norm(cat).toLowerCase();
    var d = norm(dest).toLowerCase();
    if (d.indexOf("montanha") >= 0 || d.indexOf("serra") >= 0 || d.indexOf("trilha") >= 0) return { color: "#a855f7", r: 10 };
    if (c.indexOf("restaurante") >= 0) return { color: "#f97316", r: 9 };
    if (c.indexOf("parque") >= 0) return { color: "#22c55e", r: 9 };
    if (c.indexOf("hotel") >= 0) return { color: "#3b82f6", r: 9 };
    if (c.indexOf("ponto") >= 0 || c.indexOf("museu") >= 0) return { color: "#eab308", r: 9 };
    if (c.indexOf("cidade") >= 0) return { color: "#10b981", r: 9 };
    if (c.indexOf("desejo") >= 0) return { color: "#ec4899", r: 8 };
    return { color: "#3b82f6", r: 9 };
  }

  function addMark(t, i, done) {
    function place(c) {
      var s;
      var icon;
      var m;
      var bud;
      var ds;
      if (!c || !lmap) { done && done(); return; }
      if (!t.coords) t.coords = c;
      s = mstyle(t.category, t.destination);
      icon = window.L.divIcon({
        html: '<svg width="28" height="36" viewBox="0 0 28 36" xmlns="http://www.w3.org/2000/svg"><path d="M14 0C6.27 0 0 6.27 0 14c0 10.5 14 22 14 22S28 24.5 28 14C28 6.27 21.73 0 14 0z" fill="' + s.color + '" stroke="rgba(0,0,0,.3)" stroke-width="1"/><circle cx="14" cy="14" r="6" fill="rgba(255,255,255,.9)"/></svg>',
        className: "",
        iconSize: [28, 36],
        iconAnchor: [14, 36],
        popupAnchor: [0, -36]
      });
      m = window.L.marker([c.lat, c.lng], { icon: icon }).addTo(lmap);
      bud = t.budget ? "R$ " + parseFloat(t.budget).toFixed(2) : "-";
      ds = t.startDate ? fmt(t.startDate) + (t.endDate ? " -> " + fmt(t.endDate) : "") : "-";
      m.bindPopup(
        '<div style="font-family:Syne,sans-serif;min-width:165px">' +
        '<div style="font-weight:700;font-size:13px;margin-bottom:7px;color:#e8e4f0">' + esc(t.destination) + "</div>" +
        '<div style="font-size:10px;color:#7a7590;margin-bottom:2px">' + esc(t.category || "Local") + "</div>" +
        '<div style="font-size:10px;color:#7a7590;margin-bottom:2px">' + esc(ds) + "</div>" +
        '<div style="font-size:10px;color:#5ec4a8">' + esc(bud) + "</div>" +
        "</div>"
      );
      m.bindTooltip(t.destination, { direction: "top", offset: [0, -36], className: "" });
      m.on("click", function () { openEdit(i); });
      MKS.push({ m: m, i: i });
      done && done();
    }
    if (t.coords) { place(t.coords); } else { geocode(t.destination, place); }
  }

  function clearMarks() {
    MKS.forEach(function (x) { if (lmap) lmap.removeLayer(x.m); });
    MKS = [];
  }

  function updateMap() {
    var i = 0;
    if (!lmap) { document.getElementById("m-cnt").textContent = "0 pins"; return; }
    lmap.invalidateSize();
    clearMarks();
    function nx() {
      var g;
      if (i >= T.length) {
        save();
        document.getElementById("m-cnt").textContent = MKS.length + " " + (MKS.length === 1 ? "pin" : "pins");
        if (MKS.length > 1) {
          g = window.L.featureGroup(MKS.map(function (x) { return x.m; }));
          lmap.fitBounds(g.getBounds(), { padding: [40, 40], maxZoom: 7 });
        } else if (MKS.length === 1) {
          lmap.setView(MKS[0].m.getLatLng(), 6);
        }
        return;
      }
      addMark(T[i], i, function () { i += 1; nx(); });
    }
    nx();
  }

  function fmt(s) {
    if (!s) return "";
    return new Date(s).toLocaleDateString("pt-BR");
  }

  function dur(a, b) {
    var d;
    if (!a || !b) return null;
    d = new Date(b) - new Date(a);
    return d < 0 ? null : Math.ceil(d / 86400000) || 1;
  }

  function tcls(cat) {
    var c = norm(cat).toLowerCase();
    if (c.indexOf("cidade") >= 0) return "tc";
    if (c.indexOf("restaurante") >= 0) return "tr";
    if (c.indexOf("hotel") >= 0) return "th";
    if (c.indexOf("museu") >= 0 || c.indexOf("ponto") >= 0) return "tm";
    if (c.indexOf("parque") >= 0) return "tp";
    if (c.indexOf("desejo") >= 0) return "tw";
    return "to";
  }

  function ac(i) {
    return ["#89b4fa", "#f38ba8", "#a6e3a1", "#f9e2af", "#fab387", "#cba6f7", "#94e2d5", "#f5c2e7"][i % 8];
  }

  function fl(d) {
    var p = d.split(",");
    var c = (p.length > 1 ? p[p.length - 1] : "").trim().toLowerCase();
    var m = {
      "brasil": "BR", "portugal": "PT", "france": "FR", "franca": "FR", "italia": "IT", "italy": "IT",
      "espanha": "ES", "spain": "ES", "alemanha": "DE", "germany": "DE", "reino unido": "UK", "uk": "UK",
      "estados unidos": "US", "usa": "US", "eua": "US", "canada": "CA", "argentina": "AR", "chile": "CL",
      "mexico": "MX", "japao": "JP", "japan": "JP", "china": "CN", "australia": "AU"
    };
    return m[c] || null;
  }

  function em(cat, dest) {
    var c = norm(cat).toLowerCase();
    var d = norm(dest).toLowerCase();
    if (d.indexOf("praia") >= 0 || d.indexOf("beach") >= 0) return "BR";
    if (d.indexOf("montanha") >= 0 || d.indexOf("serra") >= 0) return "MT";
    if (c.indexOf("restaurante") >= 0) return "RS";
    if (c.indexOf("hotel") >= 0) return "HT";
    if (c.indexOf("museu") >= 0) return "MS";
    if (c.indexOf("parque") >= 0) return "PK";
    if (c.indexOf("ponto") >= 0) return "PT";
    if (c.indexOf("desejo") >= 0) return "WL";
    return "VG";
  }

  function stats() {
    document.getElementById("s-total").textContent = T.length;
    document.getElementById("s-wish").textContent = T.filter(function (t) { return t.category === "Desejo"; }).length;
    document.getElementById("s-budget").textContent = "R$ " + T.reduce(function (s, t) { return s + getTravelBudget(t); }, 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 });
    document.getElementById("s-cities").textContent = T.filter(function (t) { return t.category === "Cidade/Pais"; }).length;
  }

  function filtered() {
    return T.filter(function (t) {
      var matchesFilter = filt === "all" ? true : t.category === filt;
      var haystack = (t.destination + " " + (t.category || "") + " " + (t.localDescription || "")).toLowerCase();
      var matchesSearch = !searchTerm || haystack.indexOf(searchTerm) >= 0;
      return matchesFilter && matchesSearch;
    });
  }

  function renderCards() {
    var el = document.getElementById("cards");
    var f = filtered();
    document.getElementById("c-cnt").textContent = f.length + " destino" + (f.length !== 1 ? "s" : "");
    if (!f.length) {
      el.innerHTML = '<div class="es"><span class="es-ico">::</span><h4>Nenhuma viagem encontrada</h4><p>' + (filt === "all" ? "Adicione sua primeira viagem!" : "Nenhum destino nesta categoria.") + "</p></div>";
      document.getElementById("pag").style.display = "none";
      return;
    }
    el.innerHTML = "";
    f.forEach(function (t) {
      var gi = T.indexOf(t);
      var cover = t.image || t.imagem || "";
      var flag = fl(t.destination);
      var d = dur(t.startDate, t.endDate);
      var desc = t.localDescription || t.descricaoLocal || t.descricao || "";
      var isDone = norm(t.status).toLowerCase() === "concluida";
      var div = document.createElement("div");
      div.className = "vc";
      div.dataset.i = gi;
      div.innerHTML =
        '<div class="vcbar" style="background:' + ac(gi) + '"></div>' +
        '<div class="vcb">' +
        '<div class="vct">' + (cover ? '<img src="' + cover.replace(/"/g, "%22") + '" alt="" loading="lazy">' : em(t.category, t.destination)) + "</div>" +
        '<div class="vci">' +
        '<div class="vcd">' + esc(t.destination) + (flag ? " " + flag : "") + "</div>" +
        '<div class="vcm">' +
        (t.category ? '<span class="vctg ' + tcls(t.category) + '">' + esc(t.category) + "</span>" : "") +
        (isDone ? '<span class="vcst">Concluída</span>' : "") +
        (t.startDate ? '<span class="vcdt">' + esc(fmt(t.startDate)) + (d ? " &middot; " + d + "d" : "") + "</span>" : "") +
        "</div>" +
        (t.budget ? '<div class="vcbg">R$ ' + parseFloat(t.budget).toFixed(2) + "</div>" : "") +
        (desc ? '<div class="vcds">' + esc(desc) + "</div>" : "") +
        "</div></div>" +
        '<div class="vch">editar</div>';
      div.addEventListener("click", function () { openEdit(parseInt(div.dataset.i, 10)); });
      Array.prototype.slice.call(div.querySelectorAll("img")).forEach(function (img) {
        if (img.complete) return;
        img.addEventListener("load", scheduleListViewportUpdate, { once: true });
        img.addEventListener("error", scheduleListViewportUpdate, { once: true });
      });
      el.appendChild(div);
    });
    document.getElementById("pag").style.display = "none";
    scheduleListViewportUpdate();
  }

  function lockListToFiveCards() {
    var list = document.getElementById("cards");
    var cards = list ? Array.prototype.slice.call(list.querySelectorAll(".vc")) : [];
    var visibleCards = cards.slice(0, 5);
    var total = 24;
    var gap = 9;
    var i;

    if (!list) return;

    if (window.innerWidth <= 960) {
      list.style.height = "";
      list.style.maxHeight = "";
      return;
    }

    if (!visibleCards.length) {
      list.style.height = "";
      list.style.maxHeight = "";
      return;
    }

    for (i = 0; i < visibleCards.length; i += 1) {
      total += visibleCards[i].offsetHeight;
      if (i < visibleCards.length - 1) total += gap;
    }

    list.style.height = total + "px";
    list.style.maxHeight = total + "px";
  }

  function scheduleListViewportUpdate() {
    if (listResizeTimer) window.clearTimeout(listResizeTimer);
    listResizeTimer = window.setTimeout(function () {
      lockListToFiveCards();
      listResizeTimer = null;
    }, 40);
  }

  function syncFilterUi() {
    var btn = document.getElementById("travel-filter-btn");
    var badge = document.getElementById("travel-filter-badge");
    Array.prototype.slice.call(document.querySelectorAll("[data-panel-filter]")).forEach(function (chip) {
      chip.classList.toggle("selected", chip.getAttribute("data-panel-filter") === pendingFilt);
    });
    if (btn) btn.classList.toggle("active", filt !== "all");
    if (badge) badge.textContent = filt === "all" ? "0" : "1";
  }

  function closeTravelFilterPanel() {
    var panel = document.getElementById("travel-filter-panel");
    if (panel) panel.classList.remove("open");
  }

  function toggleTravelFilterPanel() {
    var panel = document.getElementById("travel-filter-panel");
    var wrap = document.getElementById("travel-filter-wrap");
    if (!panel || !wrap) return;
    panel.classList.toggle("open");
    if (!panel.classList.contains("open")) return;
    setTimeout(function () {
      function closeOnOutside(event) {
        if (wrap.contains(event.target)) return;
        panel.classList.remove("open");
        document.removeEventListener("click", closeOnOutside);
      }
      document.addEventListener("click", closeOnOutside);
    }, 0);
  }

  function render() {
    stats();
    renderCards();
    updateMap();
  }

  function weather(dest, cb) {
    geocode(dest, function (c) {
      if (!c) { cb(null); return; }
      fetch("https://api.open-meteo.com/v1/forecast?latitude=" + c.lat + "&longitude=" + c.lng + "&current_weather=true&forecast_days=1")
        .then(function (r) { return r.json(); })
        .then(function (d) {
          var wc;
          var desc = "Condicoes variadas";
          if (d && d.current_weather) {
            wc = d.current_weather.weathercode;
            if (wc === 0) desc = "Ceu limpo";
            else if (wc < 4) desc = "Parcialmente nublado";
            else if (wc >= 51 && wc <= 67) desc = "Chuva";
            else if (wc >= 71 && wc <= 75) desc = "Neve";
            else if (wc >= 95 && wc <= 99) desc = "Tempestade";
            cb({ temp: d.current_weather.temperature + " C", desc: desc });
          } else {
            cb(null);
          }
        })
        .catch(function () { cb(null); });
    });
  }

  function open(id) { document.getElementById(id).classList.add("open"); }
  function close(id) { document.getElementById(id).classList.remove("open"); }

  function resetForm() {
    document.getElementById("tform").reset();
    document.getElementById("f-idata").value = "";
    document.getElementById("mo-title").textContent = "Nova Viagem";
    document.getElementById("btn-sub").textContent = "Adicionar";
    document.getElementById("btn-del").style.display = "none";
    document.getElementById("btn-done").style.display = "none";
    edit = false;
    editIdx = -1;
  }

  function openEdit(i) {
    var t = T[i];
    var img;
    if (!t) return;
    edit = true;
    editIdx = i;
    document.getElementById("mo-title").textContent = "Editar Viagem";
    document.getElementById("btn-sub").textContent = "Salvar";
    document.getElementById("btn-del").style.display = "inline-flex";
    document.getElementById("btn-done").style.display = norm(t.status).toLowerCase() === "concluida" ? "none" : "inline-flex";
    document.getElementById("f-dest").value = t.destination || "";
    document.getElementById("f-type").value = t.category || "";
    document.getElementById("f-s").value = t.startDate || "";
    document.getElementById("f-e").value = t.endDate || "";
    document.getElementById("f-bud").value = t.budget || "";
    document.getElementById("f-desc").value = t.localDescription || t.descricaoLocal || t.descricao || "";
    img = t.image || t.imagem || "";
    document.getElementById("f-iurl").value = img && img.indexOf("data:") !== 0 ? img : "";
    document.getElementById("f-idata").value = img && img.indexOf("data:") === 0 ? img : "";
    open("mo-travel");
  }

  function bindForm() {
    document.getElementById("tform").addEventListener("submit", function (e) {
      var dest;
      var sv;
      var ev;
      var btn;
      var orig;
      e.preventDefault();
      dest = document.getElementById("f-dest").value.trim();
      if (!dest) { toast("Insira um destino.", "e"); return; }
      sv = document.getElementById("f-s").value;
      ev = document.getElementById("f-e").value;
      if (sv && ev && new Date(sv) > new Date(ev)) { toast("Data inicio maior que termino.", "e"); return; }
      btn = document.getElementById("btn-sub");
      orig = btn.textContent;
      btn.textContent = "Processando...";
      btn.disabled = true;
      function go(img) {
        weather(dest, function (w) {
          var td = ensureTravelShape({
            destination: dest,
            startDate: sv,
            endDate: ev,
            budget: parseFloat(document.getElementById("f-bud").value) || 0,
            category: document.getElementById("f-type").value,
            localDescription: document.getElementById("f-desc").value.trim(),
            descricao: document.getElementById("f-desc").value.trim(),
            image: img,
            imagem: img,
            status: edit ? (T[editIdx].status || "planejada") : "planejada",
            weather: w,
            createdAt: edit ? T[editIdx].createdAt : new Date().toISOString(),
            updatedAt: edit ? new Date().toISOString() : "",
            coords: edit ? T[editIdx].coords : null
          });
          if (edit) { T[editIdx] = td; toast("Viagem atualizada!", "s"); } else { T.push(td); toast("Viagem adicionada!", "s"); }
          save();
          render();
          close("mo-travel");
          btn.textContent = orig;
          btn.disabled = false;
        });
      }
      if (document.getElementById("f-ifile").files && document.getElementById("f-ifile").files[0]) {
        (function () {
          var rd = new FileReader();
          rd.onload = function () { go(String(rd.result || "")); };
          rd.onerror = function () { go(""); };
          rd.readAsDataURL(document.getElementById("f-ifile").files[0]);
        }());
      } else {
        go(document.getElementById("f-iurl").value.trim() || document.getElementById("f-idata").value || (edit ? (T[editIdx].image || T[editIdx].imagem || "") : ""));
      }
    });
  }

  function bindUi() {
    document.getElementById("btn-del").addEventListener("click", function () {
      if (!edit || editIdx === -1) return;
      T.splice(editIdx, 1);
      page = 1;
      save();
      render();
      close("mo-travel");
      toast("Viagem excluida.", "i");
    });
    document.getElementById("btn-done").addEventListener("click", function () {
      var today;
      if (!edit || editIdx === -1 || !T[editIdx]) return;
      today = new Date().toISOString().slice(0, 10);
      T[editIdx].status = "concluida";
      if (!T[editIdx].endDate) T[editIdx].endDate = today;
      T[editIdx].updatedAt = new Date().toISOString();
      save();
      render();
      close("mo-travel");
      toast("Viagem concluida!", "s");
    });
    if (document.getElementById("travel-search")) {
      document.getElementById("travel-search").addEventListener("input", function (event) {
        searchTerm = event.target.value.trim().toLowerCase();
        page = 1;
        renderCards();
      });
    }
    if (document.getElementById("travel-filter-btn")) {
      document.getElementById("travel-filter-btn").addEventListener("click", function (event) {
        event.stopPropagation();
        toggleTravelFilterPanel();
      });
    }
    Array.prototype.slice.call(document.querySelectorAll("[data-panel-filter]")).forEach(function (chip) {
      chip.addEventListener("click", function () {
        pendingFilt = chip.getAttribute("data-panel-filter") || "all";
        syncFilterUi();
      });
    });
    if (document.getElementById("travel-filter-clear")) {
      document.getElementById("travel-filter-clear").addEventListener("click", function () {
        pendingFilt = "all";
        filt = "all";
        page = 1;
        syncFilterUi();
        closeTravelFilterPanel();
        renderCards();
      });
    }
    if (document.getElementById("travel-filter-apply")) {
      document.getElementById("travel-filter-apply").addEventListener("click", function () {
        filt = pendingFilt;
        page = 1;
        syncFilterUi();
        closeTravelFilterPanel();
        renderCards();
      });
    }
    document.getElementById("p-prev").addEventListener("click", function () { page -= 1; renderCards(); });
    document.getElementById("p-next").addEventListener("click", function () { page += 1; renderCards(); });
    document.getElementById("btn-add").addEventListener("click", function () { resetForm(); open("mo-travel"); });
    document.getElementById("mo-close").addEventListener("click", function () { close("mo-travel"); });
    document.getElementById("btn-can").addEventListener("click", function () { close("mo-travel"); });
    document.getElementById("mo-travel").addEventListener("click", function (e) { if (e.target === e.currentTarget) close("mo-travel"); });
    if (document.getElementById("btn-data")) {
      document.getElementById("btn-data").addEventListener("click", function () { open("mo-data"); });
    }
    document.getElementById("mo-data-close").addEventListener("click", function () { close("mo-data"); });
    document.getElementById("mo-data").addEventListener("click", function (e) { if (e.target === e.currentTarget) close("mo-data"); });
    document.getElementById("btn-exp").addEventListener("click", function () {
      var b = new Blob([JSON.stringify({ travels: T, exportDate: new Date().toISOString(), version: "1.0" }, null, 2)], { type: "application/json" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(b);
      a.download = "viagens_" + new Date().toISOString().split("T")[0] + ".json";
      a.click();
      toast("Exportado!", "s");
      close("mo-data");
    });
    document.getElementById("btn-imp").addEventListener("click", function () { document.getElementById("f-json").click(); });
    document.getElementById("f-json").addEventListener("change", function (e) {
      var f = e.target.files[0];
      var r;
      if (!f) return;
      r = new FileReader();
      r.onload = function (ev) {
        var d;
        try {
          d = JSON.parse(ev.target.result);
          if (d.travels && Array.isArray(d.travels)) {
            T = d.travels.map(ensureTravelShape);
            page = 1;
            save();
            render();
            toast("Importado!", "s");
            close("mo-data");
          } else {
            toast("Arquivo invalido.", "e");
          }
        } catch (err) {
          toast("Erro ao importar.", "e");
        }
      };
      r.readAsText(f);
      e.target.value = "";
    });
    window.addEventListener("resize", function () {
      scheduleListViewportUpdate();
      if (lmap) lmap.invalidateSize();
    });
  }

  function esc(v) {
    return String(v == null ? "" : v)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function boot(noMap) {
    readStore();
    initMap(noMap);
    bindForm();
    bindUi();
    syncFilterUi();
    render();
    scheduleListViewportUpdate();
  }

  (function loadLeaflet() {
    var idx = 0;
    function tryNext() {
      var s;
      if (typeof window.L !== "undefined") { boot(false); return; }
      if (idx >= LEAFLET_SRCS.length) { boot(true); return; }
      s = document.createElement("script");
      s.src = LEAFLET_SRCS[idx];
      idx += 1;
      s.onload = function () { boot(false); };
      s.onerror = function () { s.remove(); tryNext(); };
      document.head.appendChild(s);
    }
    tryNext();
  }());
}());
