(function () {
  "use strict";

  // Painel da home: sonhos (realizados em slideshow, em progresso, não começados) e a evolução
  // mês a mês de finanças, leitura, academia e cinema. Só lê o estado; quem grava são os módulos.

  var MONTHS = 6;
  var SLIDE_INTERVAL = 6500;
  var MONTH_NAMES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  var DREAM_CATEGORY_LABELS = {
    pessoal: "Pessoal", carreira: "Carreira", financeiro: "Financeiro", saude: "Saúde",
    familia: "Família", aventura: "Aventura", criativo: "Criativo", espiritual: "Espiritual"
  };
  var prefersReducedMotion = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  var slider = { index: 0, count: 0, timer: 0, paused: false, signature: "" };

  var U = window.SoterUtils || {};
  function esc(value) { return U.esc ? U.esc(value) : String(value == null ? "" : value); }
  function safeUrl(value) { return U.safeUrl ? U.safeUrl(value) : ""; }
  function iconHtml(value) { return U.icon ? U.icon(value) : esc(value); }
  function dateKey(value) { return U.localDateKey ? U.localDateKey(value) : ""; }

  function num(value) {
    var n = Number(value);
    return isFinite(n) ? n : 0;
  }

  function getData() {
    var state = window.SoterStorage && window.SoterStorage.getState ? window.SoterStorage.getState() : null;
    return state && state.data && typeof state.data === "object" ? state.data : {};
  }

  function pickArray(data, keys) {
    for (var i = 0; i < keys.length; i += 1) {
      if (Array.isArray(data[keys[i]])) return data[keys[i]];
    }
    return [];
  }

  function todayKey() { return dateKey(new Date()); }

  // Últimos MONTHS meses, do mais antigo ao atual: { key: "AAAA-MM", label: "out" }
  function recentMonths() {
    var now = new Date();
    var out = [];
    for (var i = MONTHS - 1; i >= 0; i -= 1) {
      var d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      out.push({
        key: d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"),
        label: MONTH_NAMES[d.getMonth()],
        year: d.getFullYear()
      });
    }
    return out;
  }

  function fmtBRL(value) {
    return num(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }

  function fmtBRLShort(value) {
    var v = num(value);
    var abs = Math.abs(v);
    var sign = v < 0 ? "−" : "";
    if (abs >= 1000000) return sign + "R$ " + (abs / 1000000).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " mi";
    if (abs >= 1000) return sign + "R$ " + (abs / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " mil";
    return sign + "R$ " + Math.round(abs).toLocaleString("pt-BR");
  }

  function fmtDate(value) {
    if (!value) return "";
    var d = /^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? new Date(value + "T12:00:00") : new Date(value);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
  }

  // ── Sonhos ──────────────────────────────────────────────────────────────

  function getDreams(data) {
    if (data.sonhosHub && Array.isArray(data.sonhosHub.sonhos)) return data.sonhosHub.sonhos;
    return Array.isArray(data.sonhos) ? data.sonhos : [];
  }

  // mesma conta da página de sonhos: valor inicial + depósitos registrados
  function dreamSaved(dream) {
    var hist = Array.isArray(dream.financeHistory) ? dream.financeHistory : [];
    return num(dream.acumulado) + hist.reduce(function (acc, h) {
      var v = num(h && h.valor);
      return acc + (v > 0 ? v : 0);
    }, 0);
  }

  function dreamProgress(dream) {
    var metas = Array.isArray(dream.metas) ? dream.metas : [];
    var doneMetas = metas.filter(function (m) { return m && m.feita; }).length;
    var custo = num(dream.custo);
    var saved = dreamSaved(dream);
    var parts = [];
    if (metas.length) parts.push(doneMetas / metas.length);
    if (custo > 0) parts.push(Math.min(1, saved / custo));
    var pct = parts.length ? Math.round(parts.reduce(function (a, b) { return a + b; }, 0) / parts.length * 100) : 0;
    var started = doneMetas > 0 || saved > 0 || (dream.dataInicio && String(dream.dataInicio) <= todayKey());
    return { pct: pct, metas: metas.length, doneMetas: doneMetas, custo: custo, saved: saved, started: !!started };
  }

  function classifyDreams(dreams) {
    var done = [];
    var progress = [];
    var todo = [];
    dreams.forEach(function (dream) {
      if (!dream || typeof dream !== "object") return;
      var info = dreamProgress(dream);
      var entry = { dream: dream, info: info };
      if (dream.realizado) done.push(entry);
      else if (info.started) progress.push(entry);
      else todo.push(entry);
    });
    done.sort(function (a, b) { return String(b.dream.realizadoAt || "").localeCompare(String(a.dream.realizadoAt || "")); });
    progress.sort(function (a, b) { return b.info.pct - a.info.pct; });
    return { done: done, progress: progress, todo: todo };
  }

  function dreamIcon(dream) {
    return '<span class="dream-icon">' + iconHtml(dream.icon || "🌙") + "</span>";
  }

  function renderOverview(groups) {
    var total = groups.done.length + groups.progress.length + groups.todo.length;
    var bar = document.getElementById("dreamOverviewBar");
    function seg(id, count) {
      var node = document.getElementById(id);
      if (!node) return;
      node.style.flexGrow = String(count);
      node.hidden = !count;
    }
    seg("dobDone", groups.done.length);
    seg("dobProgress", groups.progress.length);
    seg("dobTodo", groups.todo.length);
    if (bar) {
      bar.classList.toggle("is-empty", total === 0);
      bar.setAttribute("aria-label", total
        ? groups.done.length + " realizados, " + groups.progress.length + " em progresso e " + groups.todo.length + " não começados, de " + total + " sonhos"
        : "Sem sonhos cadastrados");
    }
    setText("dreamCountDone", groups.done.length);
    setText("dreamCountProgress", groups.progress.length);
    setText("dreamCountTodo", groups.todo.length);
    setText("statDreamsDone", groups.done.length);
  }

  function renderSlides(done) {
    var wrap = document.getElementById("dreamSlides");
    var dots = document.getElementById("dreamDots");
    var root = document.getElementById("dreamSlider");
    if (!wrap || !dots || !root) return;

    // não reinicia o slideshow quando nada mudou (o estado é reenviado a cada sincronização)
    var signature = done.map(function (e) { return [e.dream.id, e.dream.titulo, e.dream.img ? String(e.dream.img).length : 0, e.dream.realizadoAt].join("|"); }).join("~");
    if (signature === slider.signature && wrap.childElementCount) return;
    slider.signature = signature;

    slider.count = done.length;
    root.classList.toggle("is-empty", !done.length);
    root.classList.toggle("is-single", done.length === 1);

    if (!done.length) {
      wrap.innerHTML =
        '<div class="dream-slide is-active dream-slide-empty">' +
          '<div class="dream-slide-body">' +
            '<div class="dream-slide-tag">Primeira conquista a caminho</div>' +
            '<div class="dream-slide-title">Nenhum sonho realizado ainda</div>' +
            '<p class="dream-slide-desc">Quando você marcar um sonho como realizado, ele aparece aqui.</p>' +
          "</div>" +
        "</div>";
      dots.innerHTML = "";
      stopSlider();
      return;
    }

    wrap.innerHTML = done.map(function (entry, i) {
      var d = entry.dream;
      var img = safeUrl(d.img);
      var cat = DREAM_CATEGORY_LABELS[d.categoria] || "";
      var when = fmtDate(d.realizadoAt);
      var desc = String(d.desc || "");
      if (desc.length > 180) desc = desc.slice(0, 177).trim() + "…";
      var meta = [];
      if (when) meta.push("Realizado em " + when);
      if (entry.info.metas) meta.push(entry.info.doneMetas + "/" + entry.info.metas + " metas");
      if (entry.info.custo > 0) meta.push(fmtBRL(entry.info.custo));
      return '<a class="dream-slide' + (i === 0 ? " is-active" : "") + (img ? " has-img" : "") + '" href="sonhos.html" aria-roledescription="slide" aria-label="' + esc((i + 1) + " de " + done.length + ": " + (d.titulo || "Sonho")) + '"' + (i === 0 ? "" : ' aria-hidden="true" tabindex="-1"') + ">" +
        (img ? '<img class="dream-slide-img" src="' + esc(img) + '" alt="" loading="' + (i === 0 ? "eager" : "lazy") + '" decoding="async">' : '<div class="dream-slide-art">' + dreamIcon(d) + "</div>") +
        '<div class="dream-slide-shade"></div>' +
        '<div class="dream-slide-body">' +
          '<div class="dream-slide-tag"><i class="ico ico-trophy" aria-hidden="true"></i> Realizado' + (cat ? " &middot; " + esc(cat) : "") + "</div>" +
          '<div class="dream-slide-title">' + esc(d.titulo || "Sonho") + "</div>" +
          (desc ? '<p class="dream-slide-desc">' + esc(desc) + "</p>" : "") +
          (meta.length ? '<div class="dream-slide-meta">' + esc(meta.join("  ·  ")) + "</div>" : "") +
        "</div>" +
      "</a>";
    }).join("");

    dots.innerHTML = done.length > 1 ? done.map(function (entry, i) {
      return '<button type="button" class="dream-dot' + (i === 0 ? " is-active" : "") + '" role="tab" aria-selected="' + (i === 0 ? "true" : "false") + '" aria-label="' + esc("Ir para: " + (entry.dream.titulo || "Sonho " + (i + 1))) + '" data-slide="' + i + '"></button>';
    }).join("") : "";

    slider.index = 0;
    startSlider();
  }

  function goToSlide(index) {
    if (!slider.count) return;
    slider.index = (index + slider.count) % slider.count;
    document.querySelectorAll("#dreamSlides .dream-slide").forEach(function (node, i) {
      var active = i === slider.index;
      node.classList.toggle("is-active", active);
      if (active) {
        node.removeAttribute("aria-hidden");
        node.removeAttribute("tabindex");
      } else {
        node.setAttribute("aria-hidden", "true");
        node.setAttribute("tabindex", "-1");
      }
    });
    document.querySelectorAll("#dreamDots .dream-dot").forEach(function (node, i) {
      node.classList.toggle("is-active", i === slider.index);
      node.setAttribute("aria-selected", i === slider.index ? "true" : "false");
    });
  }

  function stopSlider() {
    if (slider.timer) clearInterval(slider.timer);
    slider.timer = 0;
  }

  function startSlider() {
    stopSlider();
    if (prefersReducedMotion || slider.count < 2) return;
    slider.timer = setInterval(function () {
      if (!slider.paused && !document.hidden) goToSlide(slider.index + 1);
    }, SLIDE_INTERVAL);
  }

  function bindSlider() {
    var root = document.getElementById("dreamSlider");
    if (!root) return;
    var prev = document.getElementById("dreamPrev");
    var next = document.getElementById("dreamNext");
    var dots = document.getElementById("dreamDots");
    if (prev) prev.addEventListener("click", function () { goToSlide(slider.index - 1); startSlider(); });
    if (next) next.addEventListener("click", function () { goToSlide(slider.index + 1); startSlider(); });
    if (dots) dots.addEventListener("click", function (e) {
      var btn = e.target.closest ? e.target.closest("[data-slide]") : null;
      if (!btn) return;
      goToSlide(Number(btn.getAttribute("data-slide")));
      startSlider();
    });
    root.addEventListener("mouseenter", function () { slider.paused = true; });
    root.addEventListener("mouseleave", function () { slider.paused = false; });
    root.addEventListener("focusin", function () { slider.paused = true; });
    root.addEventListener("focusout", function () { slider.paused = false; });
    root.addEventListener("keydown", function (e) {
      if (e.key === "ArrowLeft") { goToSlide(slider.index - 1); e.preventDefault(); }
      if (e.key === "ArrowRight") { goToSlide(slider.index + 1); e.preventDefault(); }
    });

    // arrastar para o lado no celular
    var startX = null;
    root.addEventListener("touchstart", function (e) {
      startX = e.touches && e.touches[0] ? e.touches[0].clientX : null;
    }, { passive: true });
    root.addEventListener("touchend", function (e) {
      if (startX == null || !e.changedTouches || !e.changedTouches[0]) return;
      var dx = e.changedTouches[0].clientX - startX;
      startX = null;
      if (Math.abs(dx) < 40) return;
      goToSlide(slider.index + (dx < 0 ? 1 : -1));
      startSlider();
    }, { passive: true });
  }

  function renderDreamLists(groups) {
    var progressNode = document.getElementById("dreamListProgress");
    var todoNode = document.getElementById("dreamListTodo");

    if (progressNode) {
      progressNode.innerHTML = groups.progress.length ? groups.progress.map(function (entry) {
        var d = entry.dream;
        var info = entry.info;
        var detail = [];
        if (info.metas) detail.push(info.doneMetas + "/" + info.metas + " metas");
        if (info.custo > 0) detail.push(fmtBRLShort(info.saved) + " de " + fmtBRLShort(info.custo));
        return '<a class="dream-row" href="sonhos.html">' +
          dreamIcon(d) +
          '<div class="dream-row-main">' +
            '<div class="dream-row-top"><span class="dream-row-title">' + esc(d.titulo || "Sonho") + '</span><span class="dream-row-pct">' + info.pct + "%</span></div>" +
            '<div class="dream-row-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + info.pct + '" aria-label="' + esc("Progresso de " + (d.titulo || "sonho")) + '"><span style="width:' + info.pct + '%"></span></div>' +
            (detail.length ? '<div class="dream-row-sub">' + esc(detail.join("  ·  ")) + "</div>" : "") +
          "</div>" +
        "</a>";
      }).join("") : '<div class="dream-empty">Nenhum sonho em andamento. Conclua uma meta ou faça um aporte para começar.</div>';
    }

    if (todoNode) {
      todoNode.innerHTML = groups.todo.length ? groups.todo.map(function (entry) {
        var d = entry.dream;
        var sub = [];
        if (d.horizonte) sub.push(String(d.horizonte));
        if (DREAM_CATEGORY_LABELS[d.categoria]) sub.push(DREAM_CATEGORY_LABELS[d.categoria]);
        if (d.dataInicio) sub.push("Início " + fmtDate(d.dataInicio));
        return '<a class="dream-row is-todo" href="sonhos.html">' +
          dreamIcon(d) +
          '<div class="dream-row-main">' +
            '<div class="dream-row-top"><span class="dream-row-title">' + esc(d.titulo || "Sonho") + "</span></div>" +
            (sub.length ? '<div class="dream-row-sub">' + esc(sub.join("  ·  ")) + "</div>" : "") +
          "</div>" +
        "</a>";
      }).join("") : '<div class="dream-empty">Todos os seus sonhos já saíram do papel.</div>';
    }
  }

  // ── Finanças ────────────────────────────────────────────────────────────

  function getFinance(data) {
    var tracker = data.financasTracker;
    if (tracker && Array.isArray(tracker.txs)) return { txs: tracker.txs, rules: Array.isArray(tracker.recurrenceRules) ? tracker.recurrenceRules : [] };
    return { txs: Array.isArray(data.financas) ? data.financas : [], rules: Array.isArray(data.financasRecurrenceRules) ? data.financasRecurrenceRules : [] };
  }

  // mesmo sinal da página de finanças: entrada e retirada da poupança somam; saída e aporte subtraem
  function txDelta(type, value) {
    var v = num(value);
    if (type === "in" || type === "save_withdraw") return v;
    if (type === "out" || type === "save") return -v;
    return 0;
  }

  function savingsDelta(type, value) {
    if (type === "save") return num(value);
    if (type === "save_withdraw") return -num(value);
    return 0;
  }

  // Percorre cada ocorrência real (até hoje) de lançamentos únicos, mensais, semanais e regras.
  function forEachFinanceOccurrence(fin, fn) {
    var today = todayKey();
    fin.txs.forEach(function (tx) {
      if (!tx || !tx.date || !(num(tx.value) > 0)) return;
      var date = String(tx.date).slice(0, 10);
      if (tx.recurrence === "monthly") {
        var y = Number(date.slice(0, 4));
        var m = Number(date.slice(5, 7)) - 1;
        var day = Number(date.slice(8, 10));
        var guard = 0;
        while (guard < 1200) {
          guard += 1;
          var last = new Date(y, m + 1, 0).getDate();
          var occ = y + "-" + String(m + 1).padStart(2, "0") + "-" + String(Math.min(day, last)).padStart(2, "0");
          if (occ > today) break;
          fn(occ, tx.type, tx.value);
          m += 1;
          if (m > 11) { m = 0; y += 1; }
        }
      } else if (tx.recurrence === "weekly") {
        var cur = new Date(date + "T12:00:00");
        var guardW = 0;
        while (guardW < 5200) {
          guardW += 1;
          var key = dateKey(cur);
          if (!key || key > today) break;
          fn(key, tx.type, tx.value);
          cur.setDate(cur.getDate() + 7);
        }
      } else if (date <= today) {
        fn(date, tx.type, tx.value);
      }
    });

    // regras recorrentes: uma ocorrência por mês a partir do início. O dia exato (dia útil, feriado)
    // só importa no mês atual; aqui uso o dia fixo, ou uma estimativa do n-ésimo dia útil.
    fin.rules.forEach(function (rule) {
      if (!rule || !rule.startDate || !(num(rule.value) > 0)) return;
      var start = String(rule.startDate).slice(0, 10);
      var day = rule.pattern === "fixed_day" ? Math.max(1, num(rule.day) || 1) : Math.min(28, Math.ceil(Math.max(1, num(rule.nth) || 5) * 7 / 5));
      var y = Number(start.slice(0, 4));
      var m = Number(start.slice(5, 7)) - 1;
      var guard = 0;
      while (guard < 1200) {
        guard += 1;
        var last = new Date(y, m + 1, 0).getDate();
        var occ = y + "-" + String(m + 1).padStart(2, "0") + "-" + String(Math.min(day, last)).padStart(2, "0");
        if (occ > today) break;
        if (occ >= start) fn(occ, rule.type, rule.value);
        m += 1;
        if (m > 11) { m = 0; y += 1; }
      }
    });
  }

  function renderFinance(data, months) {
    var fin = getFinance(data);
    var byMonth = {};
    var incomeByMonth = {};
    var balance = 0;
    var saved = 0;
    var count = 0;
    forEachFinanceOccurrence(fin, function (date, type, value) {
      var key = date.slice(0, 7);
      var delta = txDelta(type, value);
      balance += delta;
      saved += savingsDelta(type, value);
      byMonth[key] = (byMonth[key] || 0) + delta;
      if (type === "in") incomeByMonth[key] = (incomeByMonth[key] || 0) + num(value);
      count += 1;
    });

    var card = document.getElementById("evoFin");
    if (!card) return;
    if (!count) {
      fillCard(card, "R$ 0", "Saldo acumulado", "", "Registre entradas e saídas em Finanças para ver sua evolução.");
      return;
    }

    var current = months[months.length - 1];
    var previous = months[months.length - 2];
    var thisMonth = byMonth[current.key] || 0;
    var lastMonth = byMonth[previous.key] || 0;
    var bars = months.map(function (mo) {
      var v = Math.round((byMonth[mo.key] || 0) * 100) / 100;
      return { label: mo.label, value: v, tip: mo.label + " " + mo.year + ": " + (v >= 0 ? "+" : "−") + fmtBRL(Math.abs(v)), text: fmtBRLShort(v) };
    });
    var foot = "Resultado de " + current.label + ": <strong>" + esc((thisMonth >= 0 ? "+" : "−") + fmtBRL(Math.abs(thisMonth))) + "</strong>" +
      (lastMonth ? " &middot; " + esc(current.label) + " vs " + esc(previous.label) + " " + trendHtml(thisMonth - lastMonth, fmtBRLShort(Math.abs(thisMonth - lastMonth))) : "") +
      (saved > 0 ? "<br>Guardado nas caixinhas: <strong>" + esc(fmtBRL(saved)) + "</strong>" : "");
    fillCard(card, fmtBRL(balance), "Saldo acumulado disponível", barsHtml(bars, "Resultado mensal (entradas − saídas)"), foot, balance < 0);
  }

  // ── Biblioteca (leitura e cinema) ────────────────────────────────────────

  function finishedKey(item) {
    var stamp = num(item.finishedAt) || num(item.updatedAt);
    return stamp ? dateKey(stamp) : "";
  }

  function libraryGoal(data, key) {
    var hub = data.libraryHub;
    return Math.max(1, num(hub && hub.goals && hub.goals[key]) || 24);
  }

  function countFinishedByMonth(items) {
    var out = {};
    var year = String(new Date().getFullYear());
    var yearCount = 0;
    items.forEach(function (item) {
      if (!item || item.status !== "concluido") return;
      var key = finishedKey(item);
      if (!key) return;
      out[key.slice(0, 7)] = (out[key.slice(0, 7)] || 0) + 1;
      if (key.slice(0, 4) === year) yearCount += 1;
    });
    return { byMonth: out, year: yearCount };
  }

  function countBars(months, byMonth, singular, plural) {
    return months.map(function (mo) {
      var v = byMonth[mo.key] || 0;
      return { label: mo.label, value: v, tip: mo.label + " " + mo.year + ": " + v + " " + (v === 1 ? singular : plural), text: String(v) };
    });
  }

  function renderBooks(data, months) {
    var items = pickArray(data, ["trackerLivraria", "trackerLivros", "livros", "livraria"]);
    var card = document.getElementById("evoBooks");
    var stats = countFinishedByMonth(items);
    var goal = libraryGoal(data, "livros");
    setText("statBooksYear", stats.year);
    if (!card) return;

    var pages = items.reduce(function (acc, i) {
      if (!i) return acc;
      var total = num(i.paginas);
      var atual = num(i.atual);
      var read = i.status === "concluido" && total > 0 ? total : Math.min(total || atual, atual);
      return acc + Math.max(0, read);
    }, 0);
    var reading = items.filter(function (i) { return i && (i.status === "lendo" || i.status === "relendo"); });
    var foot = [];
    if (reading.length) {
      var r = reading[0];
      var pct = num(r.paginas) ? Math.min(100, Math.round(num(r.atual) / num(r.paginas) * 100)) : null;
      foot.push("Lendo agora: <strong>" + esc(r.titulo || "Livro") + "</strong>" + (pct != null ? " (" + pct + "%)" : "") + (reading.length > 1 ? " +" + (reading.length - 1) : ""));
    }
    if (pages) foot.push(pages.toLocaleString("pt-BR") + " páginas lidas no total");
    if (!items.length) foot.push("Adicione livros na Livraria para acompanhar sua leitura.");

    fillCard(card, stats.year + '<span class="evo-value-of"> / ' + goal + "</span>", "Livros concluídos em " + new Date().getFullYear(),
      barsHtml(countBars(months, stats.byMonth, "livro concluído", "livros concluídos"), "Livros concluídos por mês"), foot.join("<br>"), false, stats.year / goal);
  }

  function renderCinema(data, months) {
    var items = pickArray(data, ["trackerCinema", "trackerFilmes", "trackerSeries", "cinema", "filmes"]);
    var card = document.getElementById("evoCinema");
    if (!card) return;
    var stats = countFinishedByMonth(items);
    var goal = libraryGoal(data, "cinema");
    var done = items.filter(function (i) { return i && i.status === "concluido"; });
    var movies = done.filter(function (i) { return i.tipo !== "Série"; }).length;
    var series = done.length - movies;
    var watching = items.filter(function (i) { return i && (i.status === "assistindo" || i.status === "reassistindo"); });
    var foot = [];
    if (watching.length) foot.push("Assistindo: <strong>" + esc(watching[0].titulo || "Título") + "</strong>" + (watching.length > 1 ? " +" + (watching.length - 1) : ""));
    if (done.length) foot.push(movies + " " + (movies === 1 ? "filme" : "filmes") + " &middot; " + series + " " + (series === 1 ? "série" : "séries") + " concluídos no total");
    if (!items.length) foot.push("Adicione filmes e séries no Cinema para acompanhar.");

    fillCard(card, stats.year + '<span class="evo-value-of"> / ' + goal + "</span>", "Títulos concluídos em " + new Date().getFullYear(),
      barsHtml(countBars(months, stats.byMonth, "título concluído", "títulos concluídos"), "Filmes e séries concluídos por mês"), foot.join("<br>"), false, stats.year / goal);
  }

  // ── Academia ────────────────────────────────────────────────────────────

  function renderGym(data, months) {
    var gym = data.academiaTracker && typeof data.academiaTracker === "object" ? data.academiaTracker : {};
    var exercises = Array.isArray(gym.exercises) ? gym.exercises : [];
    var doneByDate = gym.todayDoneByDate && typeof gym.todayDoneByDate === "object" ? gym.todayDoneByDate : {};
    var card = document.getElementById("evoGym");

    // mesmo critério da página da academia: dia de treino completo = todos os exercícios do dia feitos
    var byMonth = {};
    Object.keys(doneByDate).forEach(function (key) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return;
      var dow = new Date(key + "T12:00:00").getDay();
      var dayExercises = exercises.filter(function (ex) { return ex && Array.isArray(ex.days) && ex.days.map(Number).indexOf(dow) >= 0; });
      var dayDone = doneByDate[key] || {};
      if (!dayExercises.length || !dayExercises.every(function (ex) { return !!dayDone[ex.id]; })) return;
      byMonth[key.slice(0, 7)] = (byMonth[key.slice(0, 7)] || 0) + 1;
    });
    var thisMonth = byMonth[months[months.length - 1].key] || 0;
    var lastMonth = byMonth[months[months.length - 2].key] || 0;
    setText("statGymMonth", thisMonth);
    if (!card) return;

    var weights = (Array.isArray(gym.weightLog) ? gym.weightLog : [])
      .filter(function (w) { return w && w.date && num(w.weight) > 0; })
      .slice()
      .sort(function (a, b) { return String(a.date).localeCompare(String(b.date)); });
    var foot = [];
    if (lastMonth || thisMonth) foot.push(esc(months[months.length - 1].label) + " vs " + esc(months[months.length - 2].label) + " " + trendHtml(thisMonth - lastMonth, Math.abs(thisMonth - lastMonth) + " " + (Math.abs(thisMonth - lastMonth) === 1 ? "treino" : "treinos")));
    if (weights.length) {
      var first = num(weights[0].weight);
      var last = num(weights[weights.length - 1].weight);
      var diff = Math.round((last - first) * 10) / 10;
      foot.push("Peso atual: <strong>" + esc(last.toLocaleString("pt-BR", { maximumFractionDigits: 1 })) + " kg</strong>" +
        (weights.length > 1 ? " (" + esc((diff > 0 ? "+" : diff < 0 ? "−" : "") + Math.abs(diff).toLocaleString("pt-BR", { maximumFractionDigits: 1 })) + " kg desde " + esc(fmtDate(weights[0].date)) + ")" : ""));
    }
    if (!exercises.length) foot.push("Monte seu treino na Academia para registrar a frequência.");

    fillCard(card, String(thisMonth), "Treinos completos em " + months[months.length - 1].label,
      barsHtml(countBars(months, byMonth, "treino completo", "treinos completos"), "Treinos completos por mês"), foot.join("<br>"));
  }

  // ── Cartões e gráfico ───────────────────────────────────────────────────

  function trendHtml(diff, text) {
    if (!diff) return '<span class="evo-trend is-flat">= estável</span>';
    return '<span class="evo-trend ' + (diff > 0 ? "is-up" : "is-down") + '"><i class="ico ' + (diff > 0 ? "ico-arrow-up-right" : "ico-arrow-down") + '" aria-hidden="true"></i> ' + esc(text) + "</span>";
  }

  function fillCard(card, valueHtml, sub, chartHtml, footHtml, negative, goalRatio) {
    var value = card.querySelector('[data-evo="value"]');
    var subNode = card.querySelector('[data-evo="sub"]');
    var chart = card.querySelector('[data-evo="chart"]');
    var foot = card.querySelector('[data-evo="foot"]');
    var goal = card.querySelector('[data-evo="goal"]');
    if (value) {
      value.innerHTML = valueHtml;
      value.classList.toggle("is-negative", !!negative);
    }
    if (subNode) subNode.textContent = sub;
    if (chart) chart.innerHTML = chartHtml || "";
    if (foot) foot.innerHTML = footHtml || "";
    if (goal) {
      var pct = Math.max(0, Math.min(100, Math.round(num(goalRatio) * 100)));
      goal.firstElementChild.style.width = pct + "%";
      goal.setAttribute("role", "progressbar");
      goal.setAttribute("aria-valuemin", "0");
      goal.setAttribute("aria-valuemax", "100");
      goal.setAttribute("aria-valuenow", String(pct));
      goal.setAttribute("aria-label", pct + "% da meta anual");
    }
  }

  // Barras em HTML (nítidas em qualquer largura). Valores negativos descem de uma linha de zero.
  // Só o mês atual leva rótulo de valor; os demais aparecem no tooltip.
  function barsHtml(bars, caption) {
    var max = Math.max(0, Math.max.apply(null, bars.map(function (b) { return b.value; })));
    var min = Math.min(0, Math.min.apply(null, bars.map(function (b) { return b.value; })));
    var span = max - min || 1;
    var zero = (max / span) * 100; // posição da linha de zero, em % a partir do topo
    var table = bars.map(function (b) { return b.label + ": " + b.text; }).join(", ");
    return '<div class="evo-bars" role="img" aria-label="' + esc(caption + ". " + table) + '" style="--zero:' + zero.toFixed(2) + '%">' +
      bars.map(function (b, i) {
        var h = Math.abs(b.value) / span * 100;
        var isLast = i === bars.length - 1;
        var neg = b.value < 0;
        return '<div class="evo-col' + (isLast ? " is-current" : "") + '" data-tip="' + esc(b.tip) + '">' +
          '<div class="evo-plot">' +
            (b.value ? '<span class="evo-bar' + (neg ? " is-neg" : "") + '" style="height:' + h.toFixed(2) + '%"></span>' : "") +
            (isLast && b.value ? '<span class="evo-bar-val' + (neg ? " is-neg" : "") + '" style="' + (neg ? "top:calc(" + (zero + h).toFixed(2) + "% + 4px)" : "bottom:calc(" + (100 - zero + h).toFixed(2) + "% + 4px)") + '">' + esc(b.text) + "</span>" : "") +
          "</div>" +
          '<div class="evo-col-lbl">' + esc(b.label) + "</div>" +
        "</div>";
      }).join("") +
    "</div>";
  }

  function bindTooltip() {
    var tip = document.getElementById("evoTooltip");
    var grid = document.querySelector(".evo-grid");
    if (!tip || !grid) return;
    function hide() { tip.classList.remove("is-visible"); }
    grid.addEventListener("mousemove", function (e) {
      var col = e.target.closest ? e.target.closest(".evo-col") : null;
      if (!col) { hide(); return; }
      tip.textContent = col.getAttribute("data-tip") || "";
      tip.classList.add("is-visible");
      var x = Math.min(window.innerWidth - tip.offsetWidth - 12, e.clientX + 14);
      var y = e.clientY - tip.offsetHeight - 12;
      tip.style.transform = "translate(" + Math.max(8, x) + "px," + Math.max(8, y) + "px)";
    });
    grid.addEventListener("mouseleave", hide);
    window.addEventListener("scroll", hide, { passive: true });
  }

  function setText(id, value) {
    var node = document.getElementById(id);
    if (node) node.textContent = String(value);
  }

  function render() {
    var data = getData();
    var months = recentMonths();
    var groups = classifyDreams(getDreams(data));
    renderOverview(groups);
    renderSlides(groups.done);
    renderDreamLists(groups);
    renderFinance(data, months);
    renderBooks(data, months);
    renderGym(data, months);
    renderCinema(data, months);
  }

  bindSlider();
  bindTooltip();
  render();
  window.addEventListener("soter:remote-state-applied", render);
  window.addEventListener("storage", render);
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) render();
  });
}());
