(function () {
  "use strict";

  // Conteúdo da página inicial. O fundo de estrelas fica em js/index.js.

  var NOTE_SAVE_DELAY = 600;
  var AGENDA_LIMIT = 7;
  var PROGRESS_LIMIT = 6;
  var MISSION_PAGES = {
    m_leitura: "livros.html",
    m_treino: "academia.html",
    m_tarefa: "tarefas.html",
    m_estudo: "revisao.html",
    m_sonho: "sonhos.html",
    m_cinema: "cinema.html",
    m_manga: "mangas.html",
    m_wishlist: "wishlist.html"
  };
  var RPG_TITLES = ["Iniciante", "Aprendiz", "Explorador", "Aventureiro", "Viajante", "Veterano", "Especialista", "Mestre", "Grão-Mestre", "Lendário"];
  var RPG_CLASS_NAMES = {
    scholar: "Sábio",
    warrior: "Guerreiro",
    explorer: "Explorador",
    artist: "Artista",
    mage: "Mago",
    ranger: "Ranger"
  };
  var ATTR_LABELS = {
    Forca: "Força",
    Exploracao: "Exploração",
    Prestigio: "Prestígio"
  };

  var noteSaveTimer = 0;
  var xpLiquid = null;

  // ---------- utilidades ----------

  function $(id) {
    return document.getElementById(id);
  }

  function setText(id, value) {
    var node = $(id);
    if (node) node.textContent = value;
  }

  function num(value) {
    var parsed = Number(value);
    return isFinite(parsed) ? parsed : 0;
  }

  function norm(value) {
    return String(value == null ? "" : value).trim().toLowerCase();
  }

  function pickArray(data, keys) {
    for (var i = 0; i < keys.length; i++) {
      if (Array.isArray(data[keys[i]])) return data[keys[i]];
    }
    return [];
  }

  function plural(amount, singular, pluralForm) {
    return amount + " " + (amount === 1 ? singular : pluralForm);
  }

  function joinPhrases(parts) {
    if (parts.length <= 1) return parts.join("");
    return parts.slice(0, -1).join(", ") + " e " + parts[parts.length - 1];
  }

  function isoDate(date) {
    var m = date.getMonth() + 1;
    var d = date.getDate();
    return date.getFullYear() + "-" + (m < 10 ? "0" : "") + m + "-" + (d < 10 ? "0" : "") + d;
  }

  function parseIso(value) {
    var text = String(value || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
    var date = new Date(text + "T12:00:00");
    return isNaN(date) ? null : date;
  }

  function daysBetween(fromIso, toIso) {
    var a = parseIso(fromIso);
    var b = parseIso(toIso);
    if (!a || !b) return 0;
    return Math.round((b - a) / 86400000);
  }

  function shortDate(value) {
    var date = parseIso(value);
    return date ? date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }).replace(".", "") : "";
  }

  // cria um elemento com classe e texto; o texto sempre entra como textContent
  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function icon(name) {
    var node = el("i", "ico " + name);
    node.setAttribute("aria-hidden", "true");
    return node;
  }

  // ---------- estado ----------

  function getState() {
    return window.SoterStorage && window.SoterStorage.getState ? window.SoterStorage.getState() : null;
  }

  function saveState(state) {
    if (window.SoterStorage && typeof window.SoterStorage.save === "function") {
      window.SoterStorage.save(state);
    }
  }

  function rpg(method, state, fallback) {
    var api = window.SoterRPG;
    if (!api || typeof api[method] !== "function") return fallback;
    try {
      var result = api[method](state);
      return result == null ? fallback : result;
    } catch (err) {
      return fallback;
    }
  }

  function getTasks(data) {
    return pickArray(data, ["tasks", "tarefas"]).filter(function (task) { return task && typeof task === "object"; });
  }

  function getDreams(data) {
    if (data.sonhosHub && Array.isArray(data.sonhosHub.sonhos)) return data.sonhosHub.sonhos;
    return pickArray(data, ["sonhos"]);
  }

  function getWishlist(data) {
    if (data.wishlistTracker && Array.isArray(data.wishlistTracker.items)) return data.wishlistTracker.items;
    return pickArray(data, ["wishlist"]);
  }

  function getFinanceTxs(data) {
    if (data.financasTracker && Array.isArray(data.financasTracker.txs)) return data.financasTracker.txs;
    return pickArray(data, ["financas"]);
  }

  // ---------- abertura ----------

  function greetingFor(hour) {
    if (hour < 5) return "Boa noite";
    if (hour < 12) return "Bom dia";
    if (hour < 18) return "Boa tarde";
    return "Boa noite";
  }

  function renderHero(state, today) {
    var now = new Date();
    var profileName = String(state && state.profile && state.profile.name || "").trim();
    var firstName = profileName && profileName !== "Usuário" ? profileName.split(/\s+/)[0] : "";
    var greeting = greetingFor(now.getHours());
    var h1 = $("homeGreeting");

    setText("homeDate", now.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" }));
    if (h1) {
      h1.textContent = "";
      if (firstName) {
        h1.appendChild(document.createTextNode(greeting + ", "));
        h1.appendChild(el("em", "", firstName));
        h1.appendChild(document.createTextNode("."));
      } else {
        var words = greeting.split(" ");
        h1.appendChild(document.createTextNode(words[0] + " "));
        h1.appendChild(el("em", "", words[1]));
        h1.appendChild(document.createTextNode("."));
      }
    }

    var parts = [];
    if (today.pending.length) {
      var next = today.pending.filter(function (task) { return task.hora; })[0];
      parts.push(plural(today.pending.length, "tarefa", "tarefas") + (next ? " (a próxima às " + next.hora + ")" : ""));
    }
    if (today.overdue.length) parts.push(plural(today.overdue.length, "tarefa atrasada", "tarefas atrasadas"));
    if (today.reviewDue) parts.push(plural(today.reviewDue, "card para revisar", "cards para revisar"));

    var brief;
    if (parts.length) {
      brief = "Hoje você tem " + joinPhrases(parts) + ".";
    } else if (today.all.length) {
      brief = "Tudo concluído por hoje. Bom trabalho.";
    } else {
      brief = "Nada marcado para hoje. Bom momento para planejar a semana.";
    }
    if (today.trip) brief += " " + today.trip.sentence;
    setText("homeBrief", brief);

    // a ação principal segue o que mais pede atenção
    var primary = $("homePrimaryAction");
    if (primary) {
      var onlyReviews = today.reviewDue && !today.pending.length && !today.overdue.length;
      primary.setAttribute("href", onlyReviews ? "revisao.html" : "tarefas.html");
      primary.querySelector("span").textContent = onlyReviews ? "Revisar cards" : "Abrir planejamento";
      primary.querySelector(".ico").className = "ico " + (onlyReviews ? "ico-brain" : "ico-calendar-check");
    }
  }

  // ---------- hoje ----------

  function collectToday(state, data, todayIso) {
    var tasks = getTasks(data);
    var all = tasks.filter(function (task) { return task.data === todayIso; });
    var byTime = function (a, b) {
      return String(a.hora || "99:99").localeCompare(String(b.hora || "99:99"));
    };
    var pending = all.filter(function (task) { return !task.done; }).sort(byTime);
    var done = all.filter(function (task) { return task.done; }).sort(byTime);
    var overdue = tasks.filter(function (task) {
      return !task.done && task.data && task.data < todayIso;
    }).sort(function (a, b) { return String(a.data).localeCompare(String(b.data)); });
    var reviewStats = rpg("getReviewStats", state, {});

    return {
      all: all,
      pending: pending,
      done: done,
      overdue: overdue,
      reviewDue: num(reviewStats.dueCount),
      reviewStreak: num(reviewStats.streak),
      trip: findTrip(data, todayIso)
    };
  }

  function findTrip(data, todayIso) {
    var trips = pickArray(data, ["viagens", "travels"]);
    var best = null;
    trips.forEach(function (trip) {
      if (!trip || ["feito", "feita", "visitado", "visitada", "concluido", "concluida"].indexOf(norm(trip.status)) >= 0) return;
      var start = String(trip.startDate || "").slice(0, 10);
      var end = String(trip.endDate || start).slice(0, 10);
      if (!parseIso(start) || end < todayIso) return;
      if (!best || start < best.start) best = { trip: trip, start: start, end: end };
    });
    if (!best) return null;

    var name = String(best.trip.destination || best.trip.destino || best.trip.titulo || best.trip.nome || "sua viagem");
    var days = daysBetween(todayIso, best.start);
    var when;
    var sentence;
    if (days <= 0) {
      when = "acontecendo agora";
      sentence = "Boa viagem para " + name + ".";
    } else if (days === 1) {
      when = "amanhã";
      sentence = "Amanhã começa a viagem para " + name + ".";
    } else {
      when = "em " + days + " dias";
      sentence = days <= 30 ? "Faltam " + days + " dias para " + name + "." : "";
    }
    return { name: name, start: best.start, days: days, when: when, sentence: sentence, item: best.trip };
  }

  function renderStats(today, missions) {
    var doneMissions = missions.filter(function (mission) { return mission.done; }).length;
    var xpLeft = missions.reduce(function (acc, mission) { return acc + (mission.done ? 0 : num(mission.xp)); }, 0);

    setText("statToday", String(today.pending.length));
    setText("statTodaySub", today.all.length ? "de " + plural(today.all.length, "tarefa", "tarefas") + " no dia" : "nenhuma tarefa no dia");
    setText("statOverdue", String(today.overdue.length));
    setText("statReview", String(today.reviewDue));
    setText("statReviewSub", today.reviewStreak ? "sequência de " + plural(today.reviewStreak, "dia", "dias") : "cards para revisar");
    setText("statMissions", doneMissions + "/" + missions.length);
    setText("statMissionsSub", xpLeft ? "+" + xpLeft + " XP disponíveis" : "todas concluídas");
    setText("missionsXp", xpLeft ? "+" + xpLeft + " XP" : "Completo");
  }

  function agendaItem(task, kind) {
    var li = el("li", "home-agenda-item is-" + kind);
    var link = el("a", "home-agenda-link");
    link.href = "tarefas.html";

    var mark = el("span", "home-agenda-mark");
    mark.setAttribute("aria-hidden", "true");
    if (kind === "done") mark.appendChild(icon("ico-check"));

    var when = el("span", "home-agenda-time", kind === "overdue" ? shortDate(task.data) : (task.hora || "—"));
    var body = el("span", "home-agenda-body");
    body.appendChild(el("span", "home-agenda-name", String(task.nome || task.titulo || "Tarefa")));
    var meta = [];
    if (kind === "overdue") meta.push("atrasada");
    if (kind === "done") meta.push("concluída");
    if (task.cat) meta.push(String(task.cat));
    if (meta.length) body.appendChild(el("span", "home-agenda-meta", meta.join(" · ")));

    link.appendChild(mark);
    link.appendChild(when);
    link.appendChild(body);
    li.appendChild(link);
    return li;
  }

  function renderAgenda(today) {
    var list = $("homeAgenda");
    if (!list) return;
    list.textContent = "";

    var rows = today.overdue.slice(0, 3).map(function (task) { return [task, "overdue"]; })
      .concat(today.pending.map(function (task) { return [task, "pending"]; }))
      .concat(today.done.map(function (task) { return [task, "done"]; }));

    if (!rows.length) {
      var empty = el("li", "home-empty");
      empty.appendChild(icon("ico-sparkles"));
      empty.appendChild(el("p", "", "Nenhuma tarefa para hoje."));
      var add = el("a", "ds-btn ds-btn--ghost ds-btn--sm", "+ Planejar o dia");
      add.href = "tarefas.html";
      empty.appendChild(add);
      list.appendChild(empty);
      return;
    }

    rows.slice(0, AGENDA_LIMIT).forEach(function (row) {
      list.appendChild(agendaItem(row[0], row[1]));
    });
    var hidden = Math.max(0, rows.length - AGENDA_LIMIT) + Math.max(0, today.overdue.length - 3);
    if (hidden > 0) {
      var more = el("li", "home-agenda-more");
      var moreLink = el("a", "", "+ " + plural(hidden, "tarefa", "tarefas") + " no planejamento");
      moreLink.href = "tarefas.html";
      more.appendChild(moreLink);
      list.appendChild(more);
    }
  }

  function renderMissions(missions) {
    var list = $("homeMissions");
    if (!list) return;
    list.textContent = "";
    missions.forEach(function (mission) {
      var li = el("li", "home-mission" + (mission.done ? " is-done" : ""));
      li.style.setProperty("--tone", mission.color || "var(--ds-gold)");
      var link = el("a", "home-mission-link");
      link.href = MISSION_PAGES[mission.id] || "rpg.html";

      var badge = el("span", "home-mission-icon");
      badge.appendChild(icon(mission.done ? "ico-check" : (mission.icon || "ico-target")));
      var body = el("span", "home-mission-body");
      body.appendChild(el("span", "home-mission-name", mission.name));
      body.appendChild(el("span", "home-mission-desc", mission.desc));
      var xp = el("span", "home-mission-xp", mission.done ? "Feita" : "+" + num(mission.xp) + " XP");

      link.appendChild(badge);
      link.appendChild(body);
      link.appendChild(xp);
      li.appendChild(link);
      list.appendChild(li);
    });
  }

  // ---------- em andamento ----------

  function progressCard(opts) {
    var card = el("a", "home-progress-card");
    card.href = opts.href;
    card.style.setProperty("--tone", opts.tone);

    var thumb = el("span", "home-progress-thumb");
    thumb.appendChild(icon(opts.icon));
    if (opts.img) {
      var img = el("img");
      img.alt = "";
      img.loading = "lazy";
      img.decoding = "async";
      img.addEventListener("error", function () { img.remove(); });
      img.src = opts.img;
      thumb.appendChild(img);
    }

    var body = el("span", "home-progress-body");
    body.appendChild(el("span", "home-progress-kind", opts.kind));
    body.appendChild(el("span", "home-progress-title", opts.title));
    if (opts.meta) body.appendChild(el("span", "home-progress-meta", opts.meta));
    if (opts.pct != null) {
      var bar = el("span", "home-progress-bar");
      bar.setAttribute("role", "progressbar");
      bar.setAttribute("aria-valuemin", "0");
      bar.setAttribute("aria-valuemax", "100");
      bar.setAttribute("aria-valuenow", String(opts.pct));
      bar.setAttribute("aria-label", "Progresso de " + opts.title);
      var fill = el("span");
      fill.style.width = opts.pct + "%";
      bar.appendChild(fill);
      body.appendChild(bar);
    }

    card.appendChild(thumb);
    card.appendChild(body);
    return card;
  }

  function pct(current, total) {
    return total > 0 ? Math.max(0, Math.min(100, Math.round(current / total * 100))) : null;
  }

  function byRecent(a, b) {
    return String(b.updatedAt || b.id || "").localeCompare(String(a.updatedAt || a.id || ""));
  }

  function isActive(item, statuses) {
    return item && statuses.indexOf(norm(item.status)) >= 0;
  }

  function collectProgress(data, today) {
    var cards = [];

    if (today.trip) {
      var trip = today.trip;
      cards.push({
        href: "viagens.html",
        tone: "var(--ds-sky)",
        icon: "ico-plane",
        img: trip.item.img || trip.item.imagem || trip.item.cover || "",
        kind: "Viagem · " + trip.when,
        title: trip.name,
        meta: trip.days > 0 ? "Saída em " + shortDate(trip.start) : "Em curso"
      });
    }

    pickArray(data, ["trackerLivraria", "trackerLivros", "livros", "livraria"])
      .filter(function (item) { return isActive(item, ["lendo", "relendo"]); })
      .sort(byRecent).forEach(function (book) {
        var total = num(book.paginas);
        var current = num(book.atual);
        cards.push({
          href: "livros.html",
          tone: "var(--ds-gold)",
          icon: "ico-library",
          img: book.img || "",
          kind: "Lendo",
          title: String(book.titulo || book.title || "Livro"),
          meta: total ? "pág. " + current + " de " + total : (book.autor ? String(book.autor) : ""),
          pct: pct(current, total)
        });
      });

    pickArray(data, ["trackerCinema", "trackerFilmes", "trackerSeries", "cinema", "filmes"])
      .filter(function (item) { return isActive(item, ["assistindo", "reassistindo"]); })
      .sort(byRecent).forEach(function (show) {
        var season = num(show.temporadaAtual);
        var episode = num(show.episodioAtual);
        var meta = season || episode
          ? (season ? "T" + season : "") + (season && episode ? " · " : "") + (episode ? "E" + episode + (num(show.episodioTotal) ? " de " + num(show.episodioTotal) : "") : "")
          : (show.tipo ? String(show.tipo) : "");
        cards.push({
          href: "cinema.html",
          tone: "var(--ds-amber)",
          icon: "ico-clapperboard",
          img: show.img || "",
          kind: "Assistindo",
          title: String(show.titulo || show.title || "Título"),
          meta: meta,
          pct: pct(episode, num(show.episodioTotal))
        });
      });

    pickArray(data, ["trackerMangas", "trackerManga", "mangas"])
      .filter(function (item) { return isActive(item, ["lendo", "relendo"]); })
      .sort(byRecent).forEach(function (manga) {
        var total = num(manga.capTotal);
        var current = num(manga.capAtual);
        cards.push({
          href: "mangas.html",
          tone: "var(--ds-rose)",
          icon: "ico-book-open",
          img: manga.img || "",
          kind: "Mangá",
          title: String(manga.titulo || manga.title || "Mangá"),
          meta: current ? "cap. " + current + (total ? " de " + total : "") : "",
          pct: pct(current, total)
        });
      });

    return cards;
  }

  function renderProgress(data, today) {
    var grid = $("homeProgress");
    if (!grid) return;
    grid.textContent = "";
    var cards = collectProgress(data, today);

    if (!cards.length) {
      var empty = el("div", "home-empty home-empty--wide");
      empty.appendChild(icon("ico-book-open"));
      empty.appendChild(el("p", "", "Nada em andamento. Marque um livro como “lendo”, uma série como “assistindo” ou planeje uma viagem."));
      var links = el("div", "home-empty-actions");
      [["livros.html", "Livraria"], ["cinema.html", "Cinema"], ["viagens.html", "Viagens"]].forEach(function (pair) {
        var link = el("a", "ds-btn ds-btn--ghost ds-btn--sm", pair[1]);
        link.href = pair[0];
        links.appendChild(link);
      });
      empty.appendChild(links);
      grid.appendChild(empty);
      return;
    }

    cards.slice(0, PROGRESS_LIMIT).forEach(function (opts) {
      grid.appendChild(progressCard(opts));
    });
  }

  // ---------- nota rápida ----------

  function renderNote(data) {
    var input = $("quickNote");
    var note = String(data.homeQuickNote || "");
    // não sobrescreve o que está sendo digitado antes de salvar
    if (input && !noteSaveTimer && input.value !== note) input.value = note;
  }

  function flushNote() {
    noteSaveTimer = 0;
    var state = getState();
    var input = $("quickNote");
    if (!state || !input) return;
    if (!state.data || typeof state.data !== "object") state.data = {};
    state.data.homeQuickNote = String(input.value || "");
    saveState(state);
    setText("quickNoteStatus", "Salvo ✓");
  }

  // salva só depois de uma pausa na digitação, em vez de a cada tecla
  function scheduleNoteSave() {
    if (noteSaveTimer) clearTimeout(noteSaveTimer);
    setText("quickNoteStatus", "Salvando…");
    noteSaveTimer = setTimeout(flushNote, NOTE_SAVE_DELAY);
  }

  // ---------- evolução ----------

  function renderEvolution(state, data, today) {
    var xp = Math.round(num(rpg("calcXP", state, 0)));
    var level = window.SoterRPG && typeof window.SoterRPG.getLevel === "function" ? num(window.SoterRPG.getLevel(xp)) || 1 : 1;
    var xpFor = window.SoterRPG && typeof window.SoterRPG.xpForLevel === "function" ? window.SoterRPG.xpForLevel : null;
    var xpThis = xpFor ? num(xpFor(level)) : 0;
    var xpNext = xpFor ? num(xpFor(level + 1)) : 0;
    var maxed = level >= RPG_TITLES.length || xpNext <= xpThis;
    var progress = maxed ? 100 : Math.max(0, Math.min(100, Math.round((xp - xpThis) / (xpNext - xpThis) * 100)));
    var className = RPG_CLASS_NAMES[String(data.rpg && data.rpg.classe || "")] || "";

    setText("rpgLevel", String(level));
    setText("rpgTitle", RPG_TITLES[Math.min(level, RPG_TITLES.length) - 1]);
    setText("rpgClass", className ? "· " + className : "");
    setText("rpgXpLabel", maxed
      ? xp + " XP · nível máximo"
      : xp + " XP · faltam " + Math.max(0, xpNext - xp) + " para o nível " + (level + 1));

    var bar = $("rpgXpBar");
    if (bar && window.createLiquidBar) {
      if (!xpLiquid) xpLiquid = window.createLiquidBar(bar);
      xpLiquid.set(progress);
    }

    var streaks = $("rpgStreaks");
    if (streaks) {
      streaks.textContent = "";
      var gym = rpg("getGymStreak", state, {});
      [
        ["ico-brain", "Revisão", today.reviewStreak],
        ["ico-dumbbell", "Treino", num(gym.streak)]
      ].forEach(function (row) {
        var chip = el("span", "home-streak" + (row[2] ? "" : " is-zero"));
        chip.appendChild(icon(row[0]));
        chip.appendChild(document.createTextNode(row[1] + " · " + plural(row[2], "dia", "dias")));
        streaks.appendChild(chip);
      });
    }

    var list = $("rpgAttrs");
    if (!list) return;
    list.textContent = "";
    rpg("getAttrs", state, []).forEach(function (attr) {
      var value = Math.max(0, Math.min(100, Math.round(num(attr.val))));
      var label = ATTR_LABELS[attr.label] || String(attr.label || "");
      var li = el("li", "home-attr");
      li.style.setProperty("--tone", attr.color || "var(--ds-gold)");
      var head = el("div", "home-attr-head");
      var name = el("span", "home-attr-name");
      name.appendChild(icon(attr.icon || "ico-sparkle"));
      name.appendChild(document.createTextNode(label));
      head.appendChild(name);
      head.appendChild(el("span", "home-attr-val", String(value)));
      var track = el("div", "home-attr-track");
      track.setAttribute("role", "progressbar");
      track.setAttribute("aria-label", label);
      track.setAttribute("aria-valuemin", "0");
      track.setAttribute("aria-valuemax", "100");
      track.setAttribute("aria-valuenow", String(value));
      var fill = el("span");
      fill.style.width = value + "%";
      track.appendChild(fill);
      li.appendChild(head);
      li.appendChild(track);
      list.appendChild(li);
    });
  }

  // ---------- módulos ----------

  function renderModuleMeta(state, data, today) {
    var tasks = getTasks(data);
    var monthPrefix = isoDate(new Date()).slice(0, 7);
    var countActive = function (items, statuses) {
      return items.filter(function (item) { return isActive(item, statuses); }).length;
    };
    var books = pickArray(data, ["trackerLivraria", "trackerLivros", "livros", "livraria"]);
    var shows = pickArray(data, ["trackerCinema", "trackerFilmes", "trackerSeries", "cinema", "filmes"]);
    var mangas = pickArray(data, ["trackerMangas", "trackerManga", "mangas"]);
    var dreams = getDreams(data);
    var wishlist = getWishlist(data);
    var monthTxs = getFinanceTxs(data).filter(function (tx) { return tx && String(tx.date || "").slice(0, 7) === monthPrefix; });
    var trips = pickArray(data, ["viagens", "travels"]);
    var gym = rpg("getGymStreak", state, {});
    var reviewTotal = num(rpg("getReviewStats", state, {}).totalCards);
    var xp = Math.round(num(rpg("calcXP", state, 0)));
    var readingBooks = countActive(books, ["lendo", "relendo"]);
    var watching = countActive(shows, ["assistindo", "reassistindo"]);
    var readingMangas = countActive(mangas, ["lendo", "relendo"]);
    var dreamsDone = dreams.filter(function (dream) { return dream && dream.realizado; }).length;

    var meta = {
      tarefas: tasks.length ? plural(tasks.filter(function (task) { return !task.done; }).length, "pendente", "pendentes") : "Comece aqui",
      financas: monthTxs.length ? plural(monthTxs.length, "lançamento", "lançamentos") + " no mês" : "Nada lançado no mês",
      sonhos: dreams.length ? plural(dreams.length, "sonho", "sonhos") + (dreamsDone ? " · " + dreamsDone + " realizado" + (dreamsDone === 1 ? "" : "s") : "") : "Comece um sonho",
      viagens: today.trip ? today.trip.name + " " + today.trip.when : plural(trips.length, "viagem", "viagens"),
      wishlist: plural(wishlist.length, "desejo", "desejos"),
      academia: num(gym.streak) ? "Sequência de " + plural(num(gym.streak), "dia", "dias") : "Monte seu treino",
      livros: readingBooks ? readingBooks + " lendo agora" : plural(books.length, "livro", "livros"),
      cinema: watching ? watching + " assistindo" : plural(shows.length, "título", "títulos"),
      mangas: readingMangas ? readingMangas + " lendo agora" : plural(mangas.length, "mangá", "mangás"),
      revisao: today.reviewDue ? plural(today.reviewDue, "card vencido", "cards vencidos") : (reviewTotal ? plural(reviewTotal, "card revisto", "cards revistos") : "Crie um deck"),
      rpg: xp + " XP acumulados"
    };

    document.querySelectorAll("[data-meta]").forEach(function (node) {
      var key = node.getAttribute("data-meta");
      if (meta[key] != null) node.textContent = meta[key];
    });
  }

  // ---------- montagem ----------

  function render() {
    var state = getState() || {};
    var data = state.data && typeof state.data === "object" ? state.data : {};
    var todayIso = isoDate(new Date());
    var today = collectToday(state, data, todayIso);
    var missions = rpg("getDailyMissions", state, []);

    renderHero(state, today);
    renderStats(today, missions);
    renderAgenda(today);
    renderMissions(missions);
    renderProgress(data, today);
    renderNote(data);
    renderEvolution(state, data, today);
    renderModuleMeta(state, data, today);
  }

  function initReveal() {
    var items = document.querySelectorAll(".home-section");
    var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || !("IntersectionObserver" in window)) return;
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.08, rootMargin: "0px 0px -40px 0px" });
    items.forEach(function (item) {
      item.classList.add("will-reveal");
      observer.observe(item);
    });
  }

  function bind() {
    var note = $("quickNote");
    if (note) note.addEventListener("input", scheduleNoteSave);
    window.addEventListener("pagehide", function () {
      if (noteSaveTimer) {
        clearTimeout(noteSaveTimer);
        flushNote();
      }
    });
    ["soter:notifications-changed", "soter:remote-state-applied", "storage"].forEach(function (name) {
      window.addEventListener(name, render);
    });
    // a virada do dia muda agenda, missões e saudação
    var lastDay = isoDate(new Date());
    setInterval(function () {
      var nowDay = isoDate(new Date());
      if (nowDay !== lastDay) {
        lastDay = nowDay;
        render();
      }
    }, 60000);
  }

  bind();
  initReveal();
  render();
}());
