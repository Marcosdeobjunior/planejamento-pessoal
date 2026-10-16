(function () {
  "use strict";

  var _rpgXpLiquid = null;

  var XP_PER_TREINO = 25;
  var XP_PER_HORA_ESTUDO = 20;
  var XP_PER_SONHO = 15;
  var XP_PER_VIAGEM = 50;

  var XP_PER_PAGINA_LIVRO = 0.14;
  var XP_PER_CAPITULO_MANGA = 4;
  var XP_PER_EPISODIO = 8;
  var XP_PER_FILME = 18;
  var XP_BONUS_CONCLUSAO_LIVRO = 10;
  var XP_BONUS_CONCLUSAO_MANGA = 8;
  var XP_BONUS_CONCLUSAO_SERIE = 12;
  var XP_BASE_TAREFA = { baixa: 8, media: 14, alta: 22 };

  var RPG_TITLES = [
    "Iniciante", "Aprendiz", "Explorador", "Aventureiro", "Viajante",
    "Veterano", "Especialista", "Mestre", "Grão-Mestre", "Lendário"
  ];

  var RPG_CLASSES = {
    initiate: { name: "Despertando", icon: "✦", bonus: "Sem especialização fixa", passive: "Base neutra para construir sua rota.", color: "#c8a96e" },
    scholar: { name: "Sábio", icon: "\uD83D\uDCDA", bonus: "Leitura, estudo e revisão", passive: "+12% XP em Livraria, Estudo e Revisão.", color: "#c8a96e" },
    warrior: { name: "Guerreiro", icon: "\u2694", bonus: "Treino e disciplina", passive: "+14% XP em Academia e +6% em Tarefas.", color: "#e06b8b" },
    explorer: { name: "Explorador", icon: "\uD83E\uDDED", bonus: "Expansão de mundo", passive: "+14% XP em Viagens e +3% em Cinema.", color: "#5ec4a8" },
    artist: { name: "Artista", icon: "\uD83C\uDFA8", bonus: "Expressão e sensibilidade", passive: "+12% XP em Sonhos e +10% em Wishlist.", color: "#7c6fcd" },
    mage: { name: "Mago", icon: "\uD83D\uDD2E", bonus: "Memória e precisão mental", passive: "+14% XP em Revisão e +10% em Estudo.", color: "#4ab0e8" },
    ranger: { name: "Ranger", icon: "\uD83C\uDFF9", bonus: "Versatilidade consistente", passive: "+8% XP em Tarefas, Academia e Viagens.", color: "#e8864a" }
  };

  var RPG_SKILLS = [
    { id: "reading", icon: "\uD83D\uDCD6", name: "Devorador de Páginas", desc: "Leia livros para evoluir", color: "#c8a96e", reqLevel: 1, reqXP: 0, reqAch: null, getLevel: function () { return Math.min(10, getLivros().filter(isDoneLivro).length); } },
    { id: "cinema", icon: "\uD83C\uDFAC", name: "Olhos de Lince", desc: "Assista filmes e séries", color: "#e8864a", reqLevel: 1, reqXP: 0, reqAch: null, getLevel: function () { return Math.min(10, getCinema().filter(isDoneCinema).length); } },
    { id: "fitness", icon: "\uD83D\uDCAA", name: "Corpo de Ferro", desc: "Complete treinos na academia", color: "#e06b8b", reqLevel: 1, reqXP: 0, reqAch: null, getLevel: function () { return Math.min(10, Math.floor(getGym().length / 3)); } },
    { id: "study", icon: "\uD83C\uDF93", name: "Mente Afiada", desc: "Acumule horas de estudo", color: "#4ab0e8", reqLevel: 2, reqXP: 50, reqAch: null, getLevel: function () { return Math.min(10, Math.floor(getEstudosHoras() / 5)); } },
    { id: "travel", icon: "\u2708\uFE0F", name: "Passaporte Dourado", desc: "Visite novos destinos", color: "#5ec4a8", reqLevel: 3, reqXP: 100, reqAch: null, getLevel: function () { return Math.min(10, getViagens().filter(isVisitedViagem).length * 2); } },
    { id: "dreams", icon: "\uD83C\uDF19", name: "Arquiteto dos Sonhos", desc: "Registre e conquiste sonhos", color: "#7c6fcd", reqLevel: 4, reqXP: 150, reqAch: "dreamer", getLevel: function () { return Math.min(10, getSonhos().length); } },
    { id: "planning", icon: "\uD83D\uDCCB", name: "Estrategista", desc: "Conclua tarefas e planeje", color: "#5ec4a8", reqLevel: 5, reqXP: 200, reqAch: "taskmaster", getLevel: function () { return Math.min(10, Math.floor(getTasks().filter(isDoneTask).length / 5)); } },
    { id: "manga", icon: "\uD83D\uDCD6", name: "Espírito Otaku", desc: "Leia mangás e light novels", color: "#e06b8b", reqLevel: 6, reqXP: 250, reqAch: "manga_fan", getLevel: function () { return Math.min(10, getMangas().filter(isDoneManga).length); } }
  ];

  var ACHIEVEMENT_GROUP_IMAGES = {
    Leitura: "img/conquista-leitura.png",
    Cinema: "img/conquista-cinema.png",
    Academia: "img/conquista-academia.png",
    Estudo: "img/conquista-estudos.png",
    Sonhos: "img/conquista-sonhos.png",
    Viagens: "img/conquista-viagens.png",
    Mangas: "img/conquista-mangas.png",
    Tarefas: "img/conquista-tarefas.png",
    "Evolução": "img/conquista-evolucao.png",
    "Coleção": "img/conquista-colecao.png",
    Wishlist: "img/conquista-wishlist.png"
  };

  var achievementGroupsCache = {};
  var achievementStatusCache = {};
  var accountPanelState = {
    status: null,
    action: "",
    code: "",
    busy: false,
    feedback: "",
    tone: ""
  };

  var ACH_STAGE_WORDS = [
    "da Fresta", "da Centelha", "da Vigilia", "do Atlas", "do Ritual",
    "do Folego", "da Mare", "da Cupula", "do Zenith", "da Lenda"
  ];

  var ACHIEVEMENTS = buildAchievements();

  function arcNames(prefix) {
    return ACH_STAGE_WORDS.map(function (label) { return prefix + " " + label; });
  }

  function reqLabel(value, singular, plural) {
    return value + " " + (value === 1 ? singular : plural);
  }

  function toNumber(value) {
    var num = Number(value || 0);
    return Number.isFinite(num) ? num : 0;
  }

  function normalizeText(value) {
    return String(value || "").trim().toLowerCase();
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function getTextField(item, fields) {
    var i;
    if (!item) return "";
    for (i = 0; i < fields.length; i += 1) {
      if (item[fields[i]] == null) continue;
      if (Array.isArray(item[fields[i]])) return item[fields[i]].join(" ").trim();
      return String(item[fields[i]] || "").trim();
    }
    return "";
  }

  function countItemsWithText(items, fields) {
    return items.filter(function (item) { return !!getTextField(item, fields); }).length;
  }

  function countItemsWithRating(items) {
    return items.filter(function (item) { return toNumber(item && (item.nota || item.rating || item.score)) > 0; }).length;
  }

  function countItemsWithFavorite(items) {
    return items.filter(function (item) { return !!(item && item.fav); }).length;
  }

  function countDistinctValues(items, fields) {
    var seen = {};
    items.forEach(function (item) {
      fields.forEach(function (field) {
        var raw = item && item[field];
        if (Array.isArray(raw)) {
          raw.forEach(function (entry) {
            var value = normalizeText(entry);
            if (value) seen[value] = true;
          });
          return;
        }
        var value = normalizeText(raw);
        if (value) seen[value] = true;
      });
    });
    return Object.keys(seen).length;
  }

  function getState() {
    var state = window.SoterStorage && window.SoterStorage.getState ? window.SoterStorage.getState() : { profile: {}, data: {} };
    if (!state.profile || typeof state.profile !== "object") state.profile = { name: "Usuário", avatar: "" };
    if (!state.data || typeof state.data !== "object") state.data = {};
    if (!state.data.rpg || typeof state.data.rpg !== "object") state.data.rpg = { classe: "initiate", missions: {}, log: [] };
    if (!state.data.rpg.missions || typeof state.data.rpg.missions !== "object") state.data.rpg.missions = {};
    return state;
  }

  function saveState(state) {
    if (window.SoterStorage && window.SoterStorage.save) window.SoterStorage.save(state);
  }

  function getClassStates(state) {
    if (window.SoterRPG && window.SoterRPG.getClassStates) return window.SoterRPG.getClassStates(state || getState());
    return {
      initiate: { id: "initiate", unlocked: true, requirement: "Base inicial", progress: "Sempre disponível" },
      scholar: { id: "scholar", unlocked: false, requirement: "30 dias seguidos de leitura", progress: "0/30 dias" },
      warrior: { id: "warrior", unlocked: false, requirement: "60 treinos seguidos nos dias marcados", progress: "0/60 treinos" },
      explorer: { id: "explorer", unlocked: false, requirement: "5 viagens concluídas", progress: "0/5 viagens" },
      artist: { id: "artist", unlocked: false, requirement: "Definição pendente", progress: "Classe ainda sem regra" },
      mage: { id: "mage", unlocked: false, requirement: "Definição pendente", progress: "Classe ainda sem regra" },
      ranger: { id: "ranger", unlocked: false, requirement: "Definição pendente", progress: "Classe ainda sem regra" }
    };
  }

  function getSkillCatalog(state) {
    if (window.SoterRPG && window.SoterRPG.getSkillStates) return window.SoterRPG.getSkillStates(state || getState());
    return RPG_SKILLS.map(function (skill) {
      return {
        id: skill.id,
        icon: skill.icon,
        color: skill.color,
        name: skill.name,
        desc: skill.desc,
        utility: "",
        reqLevel: skill.reqLevel || 1,
        unlocked: false,
        level: 0,
        rawLevel: 0
      };
    });
  }

  function getQuickStats(state) {
    if (window.SoterRPG && window.SoterRPG.getQuickStats) return window.SoterRPG.getQuickStats(state || getState());
    return {
      livros: getLivros().filter(isDoneLivro).length,
      cinema: getCinema().filter(isDoneCinema).length,
      gym: getGym().length,
      tarefas: getTasks().filter(isDoneTask).length,
      revisao: 0
    };
  }

  function pickArray(data, keys) {
    var i;
    for (i = 0; i < keys.length; i += 1) {
      if (Array.isArray(data[keys[i]])) return data[keys[i]];
    }
    return [];
  }

  function getLivros() { return pickArray(getState().data, ["trackerLivraria", "trackerLivros", "livros", "livraria"]); }
  function getCinema() { return pickArray(getState().data, ["trackerCinema", "trackerFilmes", "trackerSeries", "cinema", "filmes"]); }
  function getMangas() { return pickArray(getState().data, ["trackerMangas", "trackerManga", "mangas"]); }
  function getTasks() { return pickArray(getState().data, ["tasks", "tarefas"]); }
  function getWishlist() { return pickArray(getState().data, ["wishlist"]); }
  function getGym() { return pickArray(getState().data, ["academia", "gym", "treinos", "workouts"]); }
  function getEstudos() { return pickArray(getState().data, ["estudos"]); }
  function getViagens() { return pickArray(getState().data, ["viagens", "travels"]); }

  function getSonhos() {
    var data = getState().data;
    if (data.sonhosHub && Array.isArray(data.sonhosHub.sonhos)) return data.sonhosHub.sonhos;
    return pickArray(data, ["sonhos"]);
  }

  function getEstudosHoras() {
    return getEstudos().reduce(function (acc, item) { return acc + Number(item.horas || 0); }, 0);
  }

  function isDoneLivro(item) { return item && item.status === "concluido"; }
  function isDoneCinema(item) { return item && item.status === "concluido"; }
  function isDoneManga(item) { return item && item.status === "concluido"; }
  function isDoneTask(item) { return item && !!item.done; }
  function isVisitedViagem(item) { return item && ["feito", "visitado", "concluido"].indexOf(String(item.status || "").toLowerCase()) >= 0; }

  function getFavoritosCount() {
    return getLivros().concat(getCinema(), getMangas()).filter(function (item) { return !!item.fav; }).length;
  }

  function getCompletedBooksCount() {
    return getLivros().filter(isDoneLivro).length;
  }

  function getReadPagesTotal() {
    return getLivros().reduce(function (acc, item) { return acc + getLivroPagesRead(item); }, 0);
  }

  function getBooksWithNotesCount() {
    return getLivros().filter(function (item) {
      return !!String(item && (item.obs || item.notas || item.resenha) || "").trim();
    }).length;
  }

  function getRatedBooksCount() {
    return getLivros().filter(function (item) { return Number(item && item.nota || 0) > 0; }).length;
  }

  function getFavoriteBooksCount() {
    return getLivros().filter(function (item) { return !!(item && item.fav); }).length;
  }

  function getCinemaEntriesCount() {
    return getCinema().length;
  }

  function getCinemaCompletedCount() {
    return getCinema().filter(isDoneCinema).length;
  }

  function getCinemaUnitsTotal() {
    return getCinema().reduce(function (acc, item) { return acc + getCinemaUnits(item); }, 0);
  }

  function getCinemaRatedCount() {
    return countItemsWithRating(getCinema());
  }

  function getCinemaFavoriteCount() {
    return countItemsWithFavorite(getCinema());
  }

  function getGymMinutesTotal() {
    return getGym().reduce(function (acc, item) {
      var direct = toNumber(item && (item.minutos || item.duracao || item.tempo));
      var hours = toNumber(item && item.horas) * 60;
      return acc + Math.max(direct, hours);
    }, 0);
  }

  function getGymTypeDiversityCount() {
    return countDistinctValues(getGym(), ["tipo", "categoria", "nome", "modalidade"]);
  }

  function getGymDetailedCount() {
    return getGym().filter(function (item) {
      var filled = 0;
      ["tipo", "categoria", "obs", "descricao", "peso", "carga", "series", "reps", "minutos", "duracao", "tempo", "distancia"].forEach(function (field) {
        if (item && item[field] != null && String(item[field]).trim() !== "" && String(item[field]) !== "0") filled += 1;
      });
      return filled >= 2;
    }).length;
  }

  function getGymEffortScore() {
    return Math.round(getGym().reduce(function (acc, item) {
      return acc +
        toNumber(item && (item.minutos || item.duracao || item.tempo)) +
        (toNumber(item && item.horas) * 60) +
        toNumber(item && item.reps) +
        (toNumber(item && item.series) * 5) +
        Math.round(toNumber(item && (item.peso || item.carga)) / 5) +
        Math.round(toNumber(item && item.distancia) * 10);
    }, 0));
  }

  function getStudySessionsCount() {
    return getEstudos().length;
  }

  function getStudySubjectCount() {
    return countDistinctValues(getEstudos(), ["materia", "disciplina", "tema", "assunto"]);
  }

  function getStudyNotesCount() {
    return countItemsWithText(getEstudos(), ["obs", "resumo", "notas", "descricao", "comentario"]);
  }

  function getStudyLongSessionsCount() {
    return getEstudos().filter(function (item) { return toNumber(item && item.horas) >= 2; }).length;
  }

  function isCompletedDream(item) {
    var status = normalizeText(item && item.status);
    return status.indexOf("concl") >= 0 || status.indexOf("feito") >= 0 || status.indexOf("real") >= 0;
  }

  function getDreamsWithPlanCount() {
    return countItemsWithText(getSonhos(), ["metas", "objetivos", "etapas", "plano", "proximosPassos"]);
  }

  function getDreamsCompletedCount() {
    return getSonhos().filter(isCompletedDream).length;
  }

  function getDreamsReflectionCount() {
    return countItemsWithText(getSonhos(), ["obs", "notas", "motivo", "porque", "reflexao", "descricao"]);
  }

  function getDreamCategoryCount() {
    return countDistinctValues(getSonhos(), ["categoria", "tipo", "area", "tag", "tags"]);
  }

  function getTripNotesCount() {
    return countItemsWithText(getViagens(), ["obs", "descricao", "roteiro", "notas"]);
  }

  function getPlannedTripsCount() {
    return getViagens().filter(function (item) { return !isVisitedViagem(item); }).length;
  }

  function getUniqueTripDestinationsCount() {
    return countDistinctValues(getViagens(), ["dest", "destino", "local", "cidade", "pais"]);
  }

  function getCompletedMangasCount() {
    return getMangas().filter(isDoneManga).length;
  }

  function getMangaChaptersTotal() {
    return getMangas().reduce(function (acc, item) { return acc + getMangaChaptersRead(item); }, 0);
  }

  function getMangaEntriesCount() {
    return getMangas().length;
  }

  function getMangaRatedCount() {
    return countItemsWithRating(getMangas());
  }

  function getMangaFavoriteCount() {
    return countItemsWithFavorite(getMangas());
  }

  function clampProgress(current, total) {
    var safeCurrent = Math.max(0, Number(current || 0));
    var safeTotal = Math.max(0, Number(total || 0));
    if (!safeTotal) return safeCurrent;
    return Math.min(safeCurrent, safeTotal);
  }

  function getLivroPagesRead(item) {
    if (!item) return 0;
    var total = Number(item.paginas || 0);
    var current = Number(item.atual || 0);
    if (item.status === "concluido" && total > 0) return total;
    return clampProgress(current, total);
  }

  function getMangaChaptersRead(item) {
    if (!item) return 0;
    var total = Number(item.capTotal || 0);
    var current = Number(item.capAtual || 0);
    if (item.status === "concluido" && total > 0) return total;
    return clampProgress(current, total);
  }

  function getCinemaUnits(item) {
    if (!item) return 0;
    if (item.tipo === "Série") {
      var epTotal = Number(item.episodioTotal || 0);
      var epAtual = Number(item.episodioAtual || 0);
      if (item.status === "concluido" && epTotal > 0) return epTotal;
      if (epTotal > 0 || epAtual > 0) return clampProgress(epAtual, epTotal);
      var tempTotal = Number(item.temporadaTotal || 0);
      var tempAtual = Number(item.temporadaAtual || 0);
      if (item.status === "concluido" && tempTotal > 0) return tempTotal;
      return clampProgress(tempAtual, tempTotal);
    }
    return item.status === "concluido" ? 1 : 0;
  }

  function calcLivroXP(item) {
    var pages = getLivroPagesRead(item);
    var bonus = item && item.status === "concluido" ? XP_BONUS_CONCLUSAO_LIVRO : 0;
    return Math.round(pages * XP_PER_PAGINA_LIVRO + bonus);
  }

  function calcMangaXP(item) {
    var chapters = getMangaChaptersRead(item);
    var bonus = item && item.status === "concluido" ? XP_BONUS_CONCLUSAO_MANGA : 0;
    return Math.round(chapters * XP_PER_CAPITULO_MANGA + bonus);
  }

  function calcCinemaXP(item) {
    if (!item) return 0;
    if (item.tipo === "Série") {
      var units = getCinemaUnits(item);
      var bonus = item.status === "concluido" ? XP_BONUS_CONCLUSAO_SERIE : 0;
      return Math.round(units * XP_PER_EPISODIO + bonus);
    }
    return item.status === "concluido" ? XP_PER_FILME : 0;
  }

  function getTaskComplexity(task) {
    if (!task) return 0;
    var subtasks = Array.isArray(task.subtarefas) ? task.subtarefas.length : 0;
    var childTasks = getTasks().filter(function (item) { return item.parentId === task.id; }).length;
    var complexity = subtasks * 3 + childTasks * 6;
    if (task.parentId) complexity += 4;
    if (subtasks >= 3) complexity += 6;
    if (childTasks > 0) complexity += 8;
    return complexity;
  }

  function calcTaskXP(task) {
    if (!task || !task.done) return 0;
    var base = XP_BASE_TAREFA[String(task.prior || "media").toLowerCase()] || XP_BASE_TAREFA.media;
    return base + getTaskComplexity(task);
  }

  function getTaskCompletedCount() {
    return getTasks().filter(isDoneTask).length;
  }

  function getTaskTotalCount() {
    return getTasks().length;
  }

  function isHighPriorityTask(task) {
    var prior = normalizeText(task && (task.prior || task.prioridade));
    return prior === "alta" || prior === "high" || prior === "urgent";
  }

  function getHighPriorityTasksDoneCount() {
    return getTasks().filter(function (task) { return isDoneTask(task) && isHighPriorityTask(task); }).length;
  }

  function getComplexTasksDoneCount() {
    return getTasks().filter(function (task) { return isDoneTask(task) && getTaskComplexity(task) >= 10; }).length;
  }

  function getSubtasksTotalCount() {
    return getTasks().reduce(function (acc, task) {
      return acc + (Array.isArray(task && task.subtarefas) ? task.subtarefas.length : 0);
    }, 0);
  }

  function getLibraryEntriesCount() {
    return getLivros().length + getCinema().length + getMangas().length;
  }

  function getCompletedMediaCount() {
    return getCompletedBooksCount() + getCinemaCompletedCount() + getCompletedMangasCount();
  }

  function getAllRatedCount() {
    return countItemsWithRating(getLivros()) + countItemsWithRating(getCinema()) + countItemsWithRating(getMangas());
  }

  function getAllNotedCount() {
    return countItemsWithText(getLivros(), ["obs", "notas", "resenha"]) +
      countItemsWithText(getCinema(), ["obs", "notas", "review", "comentario"]) +
      countItemsWithText(getMangas(), ["obs", "notas", "review", "comentario"]);
  }

  function getWishlistPriorityCount() {
    return getWishlist().filter(function (item) { return isHighPriorityTask(item); }).length;
  }

  function getWishlistPricedCount() {
    return getWishlist().filter(function (item) {
      return toNumber(item && (item.preco || item.valor || item.price)) > 0;
    }).length;
  }

  function getWishlistCategorizedCount() {
    return getWishlist().filter(function (item) {
      return !!getTextField(item, ["categoria", "tipo", "grupo", "tag"]);
    }).length;
  }

  function isAcquiredWishlist(item) {
    var status = normalizeText(item && item.status);
    return status.indexOf("compr") >= 0 || status.indexOf("obt") >= 0 || status.indexOf("done") >= 0 || status.indexOf("concl") >= 0;
  }

  function getWishlistAcquiredCount() {
    return getWishlist().filter(isAcquiredWishlist).length;
  }

  function isSkillRequirementUnlocked(reqAch) {
    if (!reqAch) return true;
    if (reqAch === "dreamer") return getSonhos().length >= 5;
    if (reqAch === "taskmaster") return getTaskCompletedCount() >= 20;
    if (reqAch === "manga_fan") return getCompletedMangasCount() >= 5;
    var achievement = ACHIEVEMENTS.find(function (item) { return item.id === reqAch; });
    if (!achievement) return false;
    return achievementStatusCache[reqAch] != null ? achievementStatusCache[reqAch] : achievement.check();
  }

  function getSkillsUnlockedCount() {
    var xp = Math.round(calcXP());
    var currentLevel = getLevel(xp);
    return RPG_SKILLS.filter(function (skill) {
      var requiredLevel = Math.max(1, Math.ceil(Number(skill.reqXP || 0) / 100));
      return currentLevel >= requiredLevel && isSkillRequirementUnlocked(skill.reqAch) && skill.getLevel() > 0;
    }).length;
  }

  function getAttrTotal() {
    return rpgCalcAttrs().reduce(function (acc, attr) { return acc + toNumber(attr && attr.val); }, 0);
  }

  function getActiveSourceCount() {
    var breakdown = getXPBreakdown();
    return Object.keys(breakdown).filter(function (key) { return toNumber(breakdown[key]) > 0; }).length;
  }

  function makeSeries(config) {
    return config.thresholds.map(function (threshold, index) {
      var metric = config.metric;
      return {
        id: config.ids && config.ids[index] ? config.ids[index] : config.idPrefix + "_" + (index + 1),
        group: config.group,
        icon: config.icon,
        name: config.names[index],
        col: config.col,
        desc: config.desc(threshold, index),
        req: config.req(threshold, index),
        check: function () { return metric() >= threshold; }
      };
    });
  }

  function buildAchievements() {
    return []
      .concat(buildLeituraAchievements())
      .concat(buildCinemaAchievements())
      .concat(buildAcademiaAchievements())
      .concat(buildEstudoAchievements())
      .concat(buildSonhosAchievements())
      .concat(buildViagensAchievements())
      .concat(buildMangasAchievements())
      .concat(buildTarefasAchievements())
      .concat(buildEvolucaoAchievements())
      .concat(buildColecaoAchievements())
      .concat(buildWishlistAchievements());
  }

  function getXPBreakdown() {
    if (window.SoterRPG && window.SoterRPG.getBreakdown) return window.SoterRPG.getBreakdown(getState());
    return {
      livros: getLivros().reduce(function (acc, item) { return acc + calcLivroXP(item); }, 0),
      cinema: getCinema().reduce(function (acc, item) { return acc + calcCinemaXP(item); }, 0),
      mangas: getMangas().reduce(function (acc, item) { return acc + calcMangaXP(item); }, 0),
      treinos: getGym().length * XP_PER_TREINO,
      estudos: Math.round(getEstudosHoras() * XP_PER_HORA_ESTUDO),
      tarefas: getTasks().reduce(function (acc, item) { return acc + calcTaskXP(item); }, 0),
      sonhos: getSonhos().length * XP_PER_SONHO,
      viagens: getViagens().filter(isVisitedViagem).length * XP_PER_VIAGEM,
      financas: 0,
      wishlist: 0,
      missoes: 0
    };
  }

  function buildLeituraAchievements() {
    return []
      .concat(makeSeries({ group: "Leitura", col: "#c8a96e", icon: "\uD83D\uDCD6", idPrefix: "reading_books", names: arcNames("Biblioteca"), thresholds: [1, 2, 3, 5, 8, 10, 15, 20, 30, 50], ids: ["first_book", "reading_triplet", null, "reading_hand", null, "bookworm", "reading_shelf", "bookmaster", "reading_legend", null], metric: getCompletedBooksCount, desc: function (v) { return "Conclua " + reqLabel(v, "livro", "livros") + " completos."; }, req: function (v) { return reqLabel(v, "livro", "livros"); } }))
      .concat(makeSeries({ group: "Leitura", col: "#c8a96e", icon: "\uD83D\uDCC4", idPrefix: "reading_pages", names: arcNames("Marcapagina"), thresholds: [100, 200, 350, 500, 800, 1200, 1800, 2600, 4000, 6000], metric: getReadPagesTotal, desc: function (v) { return "Leia " + v + " paginas no total da jornada."; }, req: function (v) { return v + " paginas"; } }))
      .concat(makeSeries({ group: "Leitura", col: "#c8a96e", icon: "\u270D", idPrefix: "reading_notes", names: arcNames("Margem Viva"), thresholds: [1, 2, 3, 5, 8, 10, 14, 20, 28, 40], metric: getBooksWithNotesCount, desc: function (v) { return "Deixe notas ou resenhas em " + reqLabel(v, "livro", "livros") + "."; }, req: function (v) { return reqLabel(v, "nota", "notas"); } }))
      .concat(makeSeries({ group: "Leitura", col: "#c8a96e", icon: "\u2B50", idPrefix: "reading_ratings", names: arcNames("Curadoria"), thresholds: [1, 2, 4, 6, 10, 15, 20, 30, 40, 60], metric: getRatedBooksCount, desc: function (v) { return "Avalie " + reqLabel(v, "livro", "livros") + " da estante."; }, req: function (v) { return reqLabel(v, "avaliacao", "avaliacoes"); } }))
      .concat(makeSeries({ group: "Leitura", col: "#c8a96e", icon: "\u2764", idPrefix: "reading_favorites", names: arcNames("Estante Dourada"), thresholds: [1, 2, 3, 5, 8, 10, 12, 15, 20, 30], metric: getFavoriteBooksCount, desc: function (v) { return "Marque " + reqLabel(v, "livro favorito", "livros favoritos") + "."; }, req: function (v) { return reqLabel(v, "favorito", "favoritos"); } }));
  }

  function buildCinemaAchievements() {
    return []
      .concat(makeSeries({ group: "Cinema", col: "#e8864a", icon: "\uD83C\uDFAC", idPrefix: "cinema_done", names: arcNames("Claquete"), thresholds: [1, 2, 3, 5, 8, 12, 18, 25, 40, 60], ids: [null, null, null, "cinephile", null, null, null, "cinelord", null, null], metric: getCinemaCompletedCount, desc: function (v) { return "Conclua " + reqLabel(v, "titulo", "titulos") + " entre filmes e series."; }, req: function (v) { return reqLabel(v, "titulo", "titulos"); } }))
      .concat(makeSeries({ group: "Cinema", col: "#e8864a", icon: "\uD83C\uDFA5", idPrefix: "cinema_entries", names: arcNames("Catalogo de Cena"), thresholds: [1, 3, 5, 8, 12, 20, 30, 45, 60, 80], metric: getCinemaEntriesCount, desc: function (v) { return "Cadastre " + reqLabel(v, "titulo", "titulos") + " no cinema."; }, req: function (v) { return reqLabel(v, "cadastro", "cadastros"); } }))
      .concat(makeSeries({ group: "Cinema", col: "#e8864a", icon: "\uD83C\uDF9E", idPrefix: "cinema_units", names: arcNames("Tela Viva"), thresholds: [1, 5, 10, 20, 35, 60, 90, 140, 220, 320], metric: getCinemaUnitsTotal, desc: function (v) { return "Assista " + v + " unidades entre filmes, episodios ou temporadas."; }, req: function (v) { return v + " unidades"; } }))
      .concat(makeSeries({ group: "Cinema", col: "#e8864a", icon: "\uD83D\uDCDD", idPrefix: "cinema_ratings", names: arcNames("Critica de Bolso"), thresholds: [1, 2, 4, 6, 10, 15, 20, 30, 40, 60], metric: getCinemaRatedCount, desc: function (v) { return "Avalie " + reqLabel(v, "obra", "obras") + " do cinema."; }, req: function (v) { return reqLabel(v, "avaliacao", "avaliacoes"); } }))
      .concat(makeSeries({ group: "Cinema", col: "#e8864a", icon: "\u2728", idPrefix: "cinema_favorites", names: arcNames("Arquivo de Cena"), thresholds: [1, 2, 3, 5, 8, 12, 18, 25, 35, 50], metric: getCinemaFavoriteCount, desc: function (v) { return "Marque " + reqLabel(v, "titulo favorito", "titulos favoritos") + " no cinema."; }, req: function (v) { return reqLabel(v, "favorito", "favoritos"); } }));
  }

  function buildAcademiaAchievements() {
    return []
      .concat(makeSeries({ group: "Academia", col: "#e06b8b", icon: "\uD83D\uDCAA", idPrefix: "gym_count", names: arcNames("Forja"), thresholds: [1, 2, 3, 5, 8, 12, 18, 25, 40, 60], ids: ["gym_start", null, null, null, null, null, "gym_warrior", null, "gym_legend", null], metric: function () { return getGym().length; }, desc: function (v) { return "Registre " + reqLabel(v, "treino", "treinos") + " na academia."; }, req: function (v) { return reqLabel(v, "treino", "treinos"); } }))
      .concat(makeSeries({ group: "Academia", col: "#e06b8b", icon: "\u23F1", idPrefix: "gym_minutes", names: arcNames("Cadencia"), thresholds: [30, 60, 120, 240, 400, 700, 1000, 1500, 2200, 3000], metric: getGymMinutesTotal, desc: function (v) { return "Acumule " + v + " minutos registrados de treino."; }, req: function (v) { return v + " min"; } }))
      .concat(makeSeries({ group: "Academia", col: "#e06b8b", icon: "\uD83E\uDDF7", idPrefix: "gym_types", names: arcNames("Variedade"), thresholds: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], metric: getGymTypeDiversityCount, desc: function (v) { return "Registre " + reqLabel(v, "estilo de treino", "estilos de treino") + " diferente."; }, req: function (v) { return reqLabel(v, "estilo", "estilos"); } }))
      .concat(makeSeries({ group: "Academia", col: "#e06b8b", icon: "\uD83D\uDCDD", idPrefix: "gym_detail", names: arcNames("Registro Brutal"), thresholds: [1, 2, 3, 5, 8, 12, 18, 25, 35, 50], metric: getGymDetailedCount, desc: function (v) { return "Detalhe " + reqLabel(v, "treino", "treinos") + " com dados alem do basico."; }, req: function (v) { return reqLabel(v, "registro rico", "registros ricos"); } }))
      .concat(makeSeries({ group: "Academia", col: "#e06b8b", icon: "\u2699", idPrefix: "gym_effort", names: arcNames("Volume de Aco"), thresholds: [10, 30, 60, 100, 150, 220, 320, 450, 650, 900], metric: getGymEffortScore, desc: function (v) { return "Atinga score de esforco " + v + " somando volume, tempo e carga."; }, req: function (v) { return v + " score"; } }));
  }

  function buildEstudoAchievements() {
    return []
      .concat(makeSeries({ group: "Estudo", col: "#4ab0e8", icon: "\uD83C\uDF93", idPrefix: "study_sessions", names: arcNames("Caderno Aberto"), thresholds: [1, 2, 3, 5, 8, 12, 18, 25, 40, 60], ids: [null, null, null, null, null, "scholar", null, null, null, null], metric: getStudySessionsCount, desc: function (v) { return "Registre " + reqLabel(v, "sessao de estudo", "sessoes de estudo") + "."; }, req: function (v) { return reqLabel(v, "sessao", "sessoes"); } }))
      .concat(makeSeries({ group: "Estudo", col: "#4ab0e8", icon: "\u23F3", idPrefix: "study_hours", names: arcNames("Sessao Clara"), thresholds: [1, 3, 5, 8, 12, 20, 30, 50, 80, 120], ids: [null, null, null, null, null, null, null, "professor", null, null], metric: getEstudosHoras, desc: function (v) { return "Acumule " + v + " horas de estudo registradas."; }, req: function (v) { return v + "h"; } }))
      .concat(makeSeries({ group: "Estudo", col: "#4ab0e8", icon: "\uD83D\uDCD8", idPrefix: "study_subjects", names: arcNames("Mapa Mental"), thresholds: [1, 2, 3, 4, 5, 6, 8, 10, 12, 15], metric: getStudySubjectCount, desc: function (v) { return "Estude " + reqLabel(v, "tema diferente", "temas diferentes") + "."; }, req: function (v) { return reqLabel(v, "tema", "temas"); } }))
      .concat(makeSeries({ group: "Estudo", col: "#4ab0e8", icon: "\u270D", idPrefix: "study_notes", names: arcNames("Margem Atenta"), thresholds: [1, 2, 3, 5, 8, 12, 18, 25, 35, 50], metric: getStudyNotesCount, desc: function (v) { return "Anexe resumo, nota ou comentario em " + reqLabel(v, "sessao", "sessoes") + "."; }, req: function (v) { return reqLabel(v, "nota", "notas"); } }))
      .concat(makeSeries({ group: "Estudo", col: "#4ab0e8", icon: "\uD83D\uDD25", idPrefix: "study_long", names: arcNames("Imersao"), thresholds: [1, 2, 3, 5, 8, 12, 16, 20, 30, 40], metric: getStudyLongSessionsCount, desc: function (v) { return "Complete " + reqLabel(v, "sessao longa", "sessoes longas") + " de 2h ou mais."; }, req: function (v) { return reqLabel(v, "sessao longa", "sessoes longas"); } }));
  }

  function buildSonhosAchievements() {
    return []
      .concat(makeSeries({ group: "Sonhos", col: "#7c6fcd", icon: "\uD83C\uDF19", idPrefix: "dream_count", names: arcNames("Nebulosa"), thresholds: [1, 2, 3, 5, 8, 12, 18, 25, 35, 50], ids: [null, null, null, "dreamer", null, null, null, null, null, null], metric: function () { return getSonhos().length; }, desc: function (v) { return "Registre " + reqLabel(v, "sonho", "sonhos") + " no hub."; }, req: function (v) { return reqLabel(v, "sonho", "sonhos"); } }))
      .concat(makeSeries({ group: "Sonhos", col: "#7c6fcd", icon: "\uD83E\uDDED", idPrefix: "dream_plan", names: arcNames("Mapa de Desejos"), thresholds: [1, 2, 3, 5, 7, 10, 14, 18, 24, 30], metric: getDreamsWithPlanCount, desc: function (v) { return "Estruture plano, metas ou etapas em " + reqLabel(v, "sonho", "sonhos") + "."; }, req: function (v) { return reqLabel(v, "plano", "planos"); } }))
      .concat(makeSeries({ group: "Sonhos", col: "#7c6fcd", icon: "\u2728", idPrefix: "dream_done", names: arcNames("Sonho Vivo"), thresholds: [1, 2, 3, 5, 8, 12, 16, 20, 25, 30], metric: getDreamsCompletedCount, desc: function (v) { return "Marque " + reqLabel(v, "sonho realizado", "sonhos realizados") + "."; }, req: function (v) { return reqLabel(v, "realizado", "realizados"); } }))
      .concat(makeSeries({ group: "Sonhos", col: "#7c6fcd", icon: "\uD83D\uDCDD", idPrefix: "dream_reflection", names: arcNames("Reflexo Noturno"), thresholds: [1, 2, 3, 5, 7, 10, 14, 18, 24, 30], metric: getDreamsReflectionCount, desc: function (v) { return "Escreva reflexoes ou contexto em " + reqLabel(v, "sonho", "sonhos") + "."; }, req: function (v) { return reqLabel(v, "reflexao", "reflexoes"); } }))
      .concat(makeSeries({ group: "Sonhos", col: "#7c6fcd", icon: "\uD83C\uDF0C", idPrefix: "dream_categories", names: arcNames("Horizonte Intimo"), thresholds: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], metric: getDreamCategoryCount, desc: function (v) { return "Organize sonhos em " + reqLabel(v, "categoria", "categorias") + " distintas."; }, req: function (v) { return reqLabel(v, "categoria", "categorias"); } }));
  }

  function buildViagensAchievements() {
    return []
      .concat(makeSeries({ group: "Viagens", col: "#5ec4a8", icon: "\u2708\uFE0F", idPrefix: "travel_all", names: arcNames("Passaporte"), thresholds: [1, 2, 3, 5, 8, 12, 18, 25, 35, 50], ids: ["traveler", null, null, "globetrotter", null, null, null, null, null, null], metric: function () { return getViagens().length; }, desc: function (v) { return "Cadastre " + reqLabel(v, "viagem", "viagens") + " no mapa."; }, req: function (v) { return reqLabel(v, "viagem", "viagens"); } }))
      .concat(makeSeries({ group: "Viagens", col: "#5ec4a8", icon: "\uD83C\uDF0D", idPrefix: "travel_visited", names: arcNames("Rota Viva"), thresholds: [1, 2, 3, 5, 8, 12, 18, 25, 35, 50], metric: function () { return getViagens().filter(isVisitedViagem).length; }, desc: function (v) { return "Marque " + reqLabel(v, "destino visitado", "destinos visitados") + "."; }, req: function (v) { return reqLabel(v, "visitado", "visitados"); } }))
      .concat(makeSeries({ group: "Viagens", col: "#5ec4a8", icon: "\uD83D\uDDFA", idPrefix: "travel_planned", names: arcNames("Roteiro Aberto"), thresholds: [1, 2, 3, 5, 8, 12, 18, 25, 35, 50], metric: getPlannedTripsCount, desc: function (v) { return "Mantenha " + reqLabel(v, "viagem planejada", "viagens planejadas") + " no radar."; }, req: function (v) { return reqLabel(v, "planejada", "planejadas"); } }))
      .concat(makeSeries({ group: "Viagens", col: "#5ec4a8", icon: "\uD83E\uDDED", idPrefix: "travel_unique", names: arcNames("Atlas"), thresholds: [1, 2, 3, 5, 8, 12, 18, 25, 35, 50], metric: getUniqueTripDestinationsCount, desc: function (v) { return "Registre " + reqLabel(v, "destino unico", "destinos unicos") + " na trilha."; }, req: function (v) { return reqLabel(v, "destino", "destinos"); } }))
      .concat(makeSeries({ group: "Viagens", col: "#5ec4a8", icon: "\uD83D\uDCDD", idPrefix: "travel_notes", names: arcNames("Caderno de Bordo"), thresholds: [1, 2, 3, 5, 7, 10, 14, 18, 24, 30], metric: getTripNotesCount, desc: function (v) { return "Anote roteiros, notas ou memorias em " + reqLabel(v, "viagem", "viagens") + "."; }, req: function (v) { return reqLabel(v, "anotacao", "anotacoes"); } }));
  }

  function buildMangasAchievements() {
    return []
      .concat(makeSeries({ group: "Mangas", col: "#e06b8b", icon: "\uD83D\uDDBC", idPrefix: "manga_done", names: arcNames("Painel"), thresholds: [1, 2, 3, 5, 8, 12, 18, 25, 35, 50], ids: [null, null, null, "manga_fan", null, null, null, null, null, null], metric: getCompletedMangasCount, desc: function (v) { return "Conclua " + reqLabel(v, "manga", "mangas") + "."; }, req: function (v) { return reqLabel(v, "manga", "mangas"); } }))
      .concat(makeSeries({ group: "Mangas", col: "#e06b8b", icon: "\uD83D\uDCD6", idPrefix: "manga_chapters", names: arcNames("Capitulo"), thresholds: [10, 25, 50, 80, 120, 180, 260, 360, 500, 700], metric: getMangaChaptersTotal, desc: function (v) { return "Leia " + v + " capitulos no total."; }, req: function (v) { return v + " capitulos"; } }))
      .concat(makeSeries({ group: "Mangas", col: "#e06b8b", icon: "\uD83D\uDCDA", idPrefix: "manga_entries", names: arcNames("Estante Otaku"), thresholds: [1, 2, 3, 5, 8, 12, 18, 25, 35, 50], metric: getMangaEntriesCount, desc: function (v) { return "Cadastre " + reqLabel(v, "serie", "series") + " de manga."; }, req: function (v) { return reqLabel(v, "cadastro", "cadastros"); } }))
      .concat(makeSeries({ group: "Mangas", col: "#e06b8b", icon: "\u2B50", idPrefix: "manga_ratings", names: arcNames("Curadoria Otaku"), thresholds: [1, 2, 3, 5, 8, 12, 18, 25, 35, 50], metric: getMangaRatedCount, desc: function (v) { return "Avalie " + reqLabel(v, "manga", "mangas") + " lidos."; }, req: function (v) { return reqLabel(v, "avaliacao", "avaliacoes"); } }))
      .concat(makeSeries({ group: "Mangas", col: "#e06b8b", icon: "\u2764", idPrefix: "manga_favorites", names: arcNames("Favoritos Otaku"), thresholds: [1, 2, 3, 5, 8, 12, 18, 25, 35, 50], metric: getMangaFavoriteCount, desc: function (v) { return "Marque " + reqLabel(v, "manga favorito", "mangas favoritos") + "."; }, req: function (v) { return reqLabel(v, "favorito", "favoritos"); } }));
  }

  function buildTarefasAchievements() {
    return []
      .concat(makeSeries({ group: "Tarefas", col: "#5ec4a8", icon: "\u2705", idPrefix: "tasks_done", names: arcNames("Checklist"), thresholds: [1, 3, 5, 8, 12, 20, 30, 45, 65, 90], ids: [null, null, null, null, null, "taskmaster", null, "planner", null, null], metric: getTaskCompletedCount, desc: function (v) { return "Conclua " + reqLabel(v, "tarefa", "tarefas") + "."; }, req: function (v) { return reqLabel(v, "tarefa", "tarefas"); } }))
      .concat(makeSeries({ group: "Tarefas", col: "#5ec4a8", icon: "\uD83D\uDCCB", idPrefix: "tasks_all", names: arcNames("Fluxo"), thresholds: [3, 5, 8, 12, 18, 25, 35, 50, 70, 100], metric: getTaskTotalCount, desc: function (v) { return "Mantenha " + reqLabel(v, "tarefa", "tarefas") + " no sistema."; }, req: function (v) { return reqLabel(v, "registro", "registros"); } }))
      .concat(makeSeries({ group: "Tarefas", col: "#5ec4a8", icon: "\u26A0", idPrefix: "tasks_high", names: arcNames("Prioridade"), thresholds: [1, 2, 3, 5, 8, 12, 18, 25, 35, 50], metric: getHighPriorityTasksDoneCount, desc: function (v) { return "Feche " + reqLabel(v, "tarefa critica", "tarefas criticas") + "."; }, req: function (v) { return reqLabel(v, "prioridade alta", "prioridades altas"); } }))
      .concat(makeSeries({ group: "Tarefas", col: "#5ec4a8", icon: "\u2699", idPrefix: "tasks_complex", names: arcNames("Engenharia"), thresholds: [1, 2, 3, 5, 8, 12, 18, 25, 35, 50], metric: getComplexTasksDoneCount, desc: function (v) { return "Conclua " + reqLabel(v, "tarefa complexa", "tarefas complexas") + "."; }, req: function (v) { return reqLabel(v, "complexa", "complexas"); } }))
      .concat(makeSeries({ group: "Tarefas", col: "#5ec4a8", icon: "\uD83E\uDDF5", idPrefix: "tasks_subtasks", names: arcNames("Costura"), thresholds: [3, 5, 8, 12, 18, 25, 35, 50, 70, 100], metric: getSubtasksTotalCount, desc: function (v) { return "Crie " + reqLabel(v, "subtarefa", "subtarefas") + " conectadas ao plano."; }, req: function (v) { return reqLabel(v, "subtarefa", "subtarefas"); } }));
  }

  function buildEvolucaoAchievements() {
    return []
      .concat(makeSeries({ group: "Evolução", col: "#c8a96e", icon: "\u2694", idPrefix: "evo_level", names: arcNames("Nível"), thresholds: [2, 3, 4, 5, 6, 8, 10, 12, 15, 20], ids: [null, null, null, "level5", null, null, "legend", null, null, null], metric: function () { return getLevel(Math.round(calcXP())); }, desc: function (v) { return "Alcance o nível " + v + " no sistema RPG."; }, req: function (v) { return "Nível " + v; } }))
      .concat(makeSeries({ group: "Evolução", col: "#c8a96e", icon: "\u2728", idPrefix: "evo_xp", names: arcNames("Prestígio"), thresholds: [100, 250, 500, 800, 1200, 1800, 2600, 3600, 5000, 7000], metric: function () { return Math.round(calcXP()); }, desc: function (v) { return "Acumule " + v + " pontos de XP total."; }, req: function (v) { return v + " XP"; } }))
      .concat(makeSeries({ group: "Evolução", col: "#c8a96e", icon: "\uD83D\uDEE1", idPrefix: "evo_skills", names: arcNames("Arsenal"), thresholds: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], metric: getSkillsUnlockedCount, desc: function (v) { return "Desbloqueie " + reqLabel(v, "habilidade", "habilidades") + " do personagem."; }, req: function (v) { return reqLabel(v, "skill", "skills"); } }))
      .concat(makeSeries({ group: "Evolução", col: "#c8a96e", icon: "\uD83E\uDDE0", idPrefix: "evo_attrs", names: arcNames("Atributo"), thresholds: [120, 180, 240, 300, 360, 420, 480, 540, 580, 600], metric: getAttrTotal, desc: function (v) { return "Some " + v + " pontos entre todos os atributos."; }, req: function (v) { return v + " atributos"; } }))
      .concat(makeSeries({ group: "Evolução", col: "#c8a96e", icon: "\uD83C\uDF0C", idPrefix: "evo_sources", names: arcNames("Constelação"), thresholds: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], metric: getActiveSourceCount, desc: function (v) { return "Ative " + reqLabel(v, "fonte de XP", "fontes de XP") + " no ecossistema."; }, req: function (v) { return reqLabel(v, "fonte", "fontes"); } }));
  }

  function buildColecaoAchievements() {
    return []
      .concat(makeSeries({ group: "Coleção", col: "#c8a96e", icon: "\u2B50", idPrefix: "collection_favorites", names: arcNames("Favoritos"), thresholds: [1, 3, 5, 8, 10, 15, 25, 35, 50, 70], ids: [null, null, null, null, "collector", null, null, null, null, null], metric: getFavoritosCount, desc: function (v) { return "Some " + reqLabel(v, "favorito", "favoritos") + " entre todas as mídias."; }, req: function (v) { return reqLabel(v, "favorito", "favoritos"); } }))
      .concat(makeSeries({ group: "Coleção", col: "#c8a96e", icon: "\uD83D\uDCC2", idPrefix: "collection_size", names: arcNames("Museu"), thresholds: [5, 10, 15, 25, 40, 60, 90, 130, 180, 250], metric: getLibraryEntriesCount, desc: function (v) { return "Reúna " + reqLabel(v, "item", "itens") + " entre livros, cinema e mangás."; }, req: function (v) { return reqLabel(v, "item", "itens"); } }))
      .concat(makeSeries({ group: "Coleção", col: "#c8a96e", icon: "\uD83C\uDFC6", idPrefix: "collection_done", names: arcNames("Arquivo"), thresholds: [1, 3, 5, 8, 12, 18, 25, 35, 50, 70], metric: getCompletedMediaCount, desc: function (v) { return "Conclua " + reqLabel(v, "obra", "obras") + " no acervo geral."; }, req: function (v) { return reqLabel(v, "concluída", "concluídas"); } }))
      .concat(makeSeries({ group: "Coleção", col: "#c8a96e", icon: "\uD83D\uDCDD", idPrefix: "collection_rated", names: arcNames("Curadoria"), thresholds: [1, 3, 5, 8, 12, 18, 25, 35, 50, 70], metric: getAllRatedCount, desc: function (v) { return "Avalie " + reqLabel(v, "item", "itens") + " do acervo."; }, req: function (v) { return reqLabel(v, "avaliação", "avaliações"); } }))
      .concat(makeSeries({ group: "Coleção", col: "#c8a96e", icon: "\u270D", idPrefix: "collection_notes", names: arcNames("Margem do Acervo"), thresholds: [1, 3, 5, 8, 12, 18, 25, 35, 50, 70], metric: getAllNotedCount, desc: function (v) { return "Escreva notas ou reviews em " + reqLabel(v, "item", "itens") + " da coleção."; }, req: function (v) { return reqLabel(v, "nota", "notas"); } }));
  }

  function buildWishlistAchievements() {
    return []
      .concat(makeSeries({ group: "Wishlist", col: "#7c6fcd", icon: "\uD83C\uDF20", idPrefix: "wishlist_count", names: arcNames("Desejo"), thresholds: [1, 3, 5, 8, 10, 15, 25, 35, 50, 70], ids: [null, null, null, null, "wishmaster", null, null, null, null, null], metric: function () { return getWishlist().length; }, desc: function (v) { return "Adicione " + reqLabel(v, "item", "itens") + " a wishlist."; }, req: function (v) { return reqLabel(v, "item", "itens"); } }))
      .concat(makeSeries({ group: "Wishlist", col: "#7c6fcd", icon: "\u26A0", idPrefix: "wishlist_priority", names: arcNames("Radar"), thresholds: [1, 2, 3, 5, 8, 12, 18, 25, 35, 50], metric: getWishlistPriorityCount, desc: function (v) { return "Defina " + reqLabel(v, "item prioritario", "itens prioritarios") + "."; }, req: function (v) { return reqLabel(v, "prioridade", "prioridades"); } }))
      .concat(makeSeries({ group: "Wishlist", col: "#7c6fcd", icon: "\uD83D\uDCB8", idPrefix: "wishlist_price", names: arcNames("Etiqueta"), thresholds: [1, 2, 3, 5, 8, 12, 18, 25, 35, 50], metric: getWishlistPricedCount, desc: function (v) { return "Informe preco ou valor em " + reqLabel(v, "item", "itens") + " desejados."; }, req: function (v) { return reqLabel(v, "preco", "precos"); } }))
      .concat(makeSeries({ group: "Wishlist", col: "#7c6fcd", icon: "\uD83D\uDCC1", idPrefix: "wishlist_categories", names: arcNames("Prateleira Futura"), thresholds: [1, 2, 3, 5, 8, 12, 18, 25, 35, 50], metric: getWishlistCategorizedCount, desc: function (v) { return "Categorize " + reqLabel(v, "item", "itens") + " da wishlist."; }, req: function (v) { return reqLabel(v, "categoria", "categorias"); } }))
      .concat(makeSeries({ group: "Wishlist", col: "#7c6fcd", icon: "\uD83C\uDFC6", idPrefix: "wishlist_acquired", names: arcNames("Tesouro Pretendido"), thresholds: [1, 2, 3, 5, 8, 12, 18, 25, 35, 50], metric: getWishlistAcquiredCount, desc: function (v) { return "Transforme " + reqLabel(v, "desejo em conquista", "desejos em conquistas") + "."; }, req: function (v) { return reqLabel(v, "conquista", "conquistas"); } }));
  }

  function calcXP() {
    if (window.SoterRPG && window.SoterRPG.calcXP) return window.SoterRPG.calcXP(getState());
    var breakdown = getXPBreakdown();
    return breakdown.livros + breakdown.cinema + breakdown.mangas + breakdown.treinos +
      (breakdown.estudos || breakdown.estudo || 0) + breakdown.tarefas + breakdown.sonhos + breakdown.viagens +
      (breakdown.financas || 0) + (breakdown.wishlist || 0) + (breakdown.missoes || 0);
  }

  function xpForLevel(level) {
    if (window.SoterRPG && window.SoterRPG.xpForLevel) return window.SoterRPG.xpForLevel(level);
    return level * 100 + (level - 1) * 50;
  }

  function getLevel(xp) {
    if (window.SoterRPG && window.SoterRPG.getLevel) return window.SoterRPG.getLevel(xp);
    var level = 1;
    while (xp >= xpForLevel(level + 1)) level += 1;
    return level;
  }

  function rpgGetMissions() {
    if (window.SoterRPG && window.SoterRPG.getDailyMissions) {
      return window.SoterRPG.getDailyMissions(getState());
    }
    var state = getState();
    if (window.SoterRPG && window.SoterRPG.syncState) {
      state = window.SoterRPG.syncState(state, getState());
    }
    var today = new Date().toISOString().slice(0, 10);
    if (state.data.rpg.missionsDate !== today) {
      state.data.rpg.missions = {};
      state.data.rpg.missionsDate = today;
      saveState(state);
    }
    var pool = [
      { id: "m_leitura", icon: "\uD83D\uDCDA", name: "Sessao de Leitura", desc: "Abra a pagina de livros e registre progresso", xp: 20, color: "#c8a96e" },
      { id: "m_treino", icon: "\uD83D\uDCAA", name: "Treino do Dia", desc: "Registre um treino na Academia", xp: 30, color: "#e06b8b" },
      { id: "m_tarefa", icon: "\u2705", name: "Conclua uma Tarefa", desc: "Marque ao menos 1 tarefa como concluida hoje", xp: 15, color: "#5ec4a8" },
      { id: "m_estudo", icon: "\uD83C\uDF93", name: "Hora de Estudo", desc: "Adicione uma sessao de estudo", xp: 25, color: "#4ab0e8" },
      { id: "m_sonho", icon: "\uD83C\uDF19", name: "Registro de Sonho", desc: "Adicione ou revise um sonho", xp: 10, color: "#7c6fcd" },
      { id: "m_cinema", icon: "\uD83C\uDFAC", name: "Sessao de Cinema", desc: "Registre um filme ou serie", xp: 15, color: "#e8864a" },
      { id: "m_manga", icon: "\uD83D\uDDBC", name: "Capitulo de Manga", desc: "Atualize seu progresso de manga", xp: 12, color: "#e06b8b" },
      { id: "m_wishlist", icon: "\uD83C\uDF20", name: "Atualizar Wishlist", desc: "Adicione ou revise um item da wishlist", xp: 8, color: "#7c6fcd" }
    ];
    var seed = parseInt(today.replace(/-/g, ""), 10) % pool.length;
    return [0, 1, 2, 3].map(function (offset) {
      var mission = pool[(seed + offset) % pool.length];
      return {
        id: mission.id,
        icon: mission.icon,
        name: mission.name,
        desc: mission.desc,
        xp: mission.xp,
        color: mission.color,
        done: !!state.data.rpg.missions[mission.id]
      };
    });
  }

  function rpgSetClass(cls) {
    var state = getState();
    var classStates = getClassStates(state);
    if (!classStates[cls] || !classStates[cls].unlocked) return;
    state.data.rpg.classe = cls;
    saveState(state);
    rpgRender();
  }

  function rpgCalcAttrs() {
    if (window.SoterRPG && window.SoterRPG.getAttrs) return window.SoterRPG.getAttrs(getState());
    var livros = getLivros().filter(isDoneLivro).length;
    var cinema = getCinema().filter(isDoneCinema).length;
    var gym = getGym().length;
    var estudo = getEstudosHoras();
    var tarefas = getTasks().filter(isDoneTask).length;
    var viagens = getViagens().filter(isVisitedViagem).length;
    var xp = Math.round(calcXP());
    function cap100(val) { return Math.min(100, val); }
    return [
      { icon: "\uD83E\uDDE0", label: "Intelecto", val: cap100(livros * 4 + estudo * 2), color: "#c8a96e" },
      { icon: "\uD83D\uDCAA", label: "Forca", val: cap100(gym * 3), color: "#e06b8b" },
      { icon: "\uD83E\uDDED", label: "Sabedoria", val: cap100(livros * 2 + estudo * 3), color: "#4ab0e8" },
      { icon: "\u26A1", label: "Disciplina", val: cap100(tarefas * 2 + gym), color: "#5ec4a8" },
      { icon: "\uD83C\uDF0D", label: "Exploracao", val: cap100(viagens * 10 + cinema * 2), color: "#7c6fcd" },
      { icon: "\u2728", label: "Prestigio", val: cap100(Math.floor(xp / 20)), color: "#e8864a" }
    ];
  }

  function rpgBuildLog() {
    if (window.SoterRPG && window.SoterRPG.getLog) return window.SoterRPG.getLog(getState());
    var entries = [];
    var now = Date.now();

    getLivros().filter(function (item) { return getLivroPagesRead(item) > 0; }).slice(-3).forEach(function (item) {
      entries.push({ icon: "\uD83D\uDCD6", text: 'Leitura registrada: "' + (item.titulo || item.title || "Livro") + '"', xp: calcLivroXP(item), t: item.updatedAt || item.id || now });
    });
    getCinema().filter(function (item) { return calcCinemaXP(item) > 0; }).slice(-3).forEach(function (item) {
      entries.push({ icon: "\uD83C\uDFAC", text: 'Progresso no cinema: "' + (item.titulo || item.title || "Titulo") + '"', xp: calcCinemaXP(item), t: item.updatedAt || item.id || now });
    });
    getMangas().filter(function (item) { return getMangaChaptersRead(item) > 0; }).slice(-3).forEach(function (item) {
      entries.push({ icon: "\uD83D\uDDBC", text: 'Leitura de manga: "' + (item.titulo || item.title || "Manga") + '"', xp: calcMangaXP(item), t: item.updatedAt || item.id || now });
    });
    getGym().slice(-4).forEach(function (item) {
      entries.push({ icon: "\uD83D\uDCAA", text: "Treino registrado" + (item.tipo ? " - " + item.tipo : ""), xp: XP_PER_TREINO, t: item.updatedAt || item.id || now });
    });
    getTasks().filter(isDoneTask).slice(-3).forEach(function (item) {
      entries.push({ icon: "\u2705", text: 'Tarefa concluida: "' + (item.nome || "Tarefa") + '"', xp: calcTaskXP(item), t: item.updatedAt || item.id || now });
    });
    getViagens().filter(isVisitedViagem).slice(-2).forEach(function (item) {
      entries.push({ icon: "\u2708\uFE0F", text: "Visitou " + (item.flag || "") + " " + (item.dest || item.destino || "Destino"), xp: XP_PER_VIAGEM, t: item.updatedAt || item.id || now });
    });
    getEstudos().slice(-2).forEach(function (item) {
      entries.push({ icon: "\uD83C\uDF93", text: "Estudou " + Number(item.horas || 0) + "h - " + (item.materia || "Estudo"), xp: Math.round(Number(item.horas || 0) * XP_PER_HORA_ESTUDO), t: item.updatedAt || item.id || now });
    });
    return entries.sort(function (a, b) { return b.t - a.t; }).slice(0, 12);
  }

  function renderAchievements() {
    var container = document.getElementById("rpg-achievements");
    var sub = document.getElementById("rpg-ach-sub");
    var groups = {};
    var unlockCount = 0;

    achievementStatusCache = {};
    ACHIEVEMENTS.forEach(function (item) {
      var unlocked = item.check();
      achievementStatusCache[item.id] = unlocked;
      if (unlocked) unlockCount += 1;
      var key = item.group || "Geral";
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    });

    if (sub) sub.textContent = unlockCount + "/" + ACHIEVEMENTS.length + " desbloqueadas";
    if (!container) return;
    achievementGroupsCache = groups;

    function buildBadge(item) {
      var unlocked = !!achievementStatusCache[item.id];
      return '<div class="rpg-badge ' + (unlocked ? "" : "locked") + '" style="--badge-color:' + item.col + '">' +
        '<div class="rpg-badge-icon-wrap">' + item.icon + '</div>' +
        '<div style="flex:1;min-width:0"><div class="rpg-badge-name">' + item.name + '</div><div class="rpg-badge-desc">' + item.desc + '</div></div>' +
        '<div class="rpg-badge-status">' + (unlocked ? "\u2713 Obtida" : "\uD83D\uDD12 " + item.req) + '</div></div>';
    }

    container.innerHTML = Object.keys(groups).map(function (groupName) {
      var items = groups[groupName];
      var unlockedInGroup = items.filter(function (item) { return !!achievementStatusCache[item.id]; }).length;
      var imagePath = ACHIEVEMENT_GROUP_IMAGES[groupName];
      var progress = items.length ? Math.round((unlockedInGroup / items.length) * 100) : 0;
      if (imagePath) {
        return '<button class="rpg-ach-group" type="button" onclick="openAchievementGroup(\'' + groupName + '\')">' +
          '<img class="rpg-ach-group-cover" src="' + imagePath + '" alt="Conquistas de ' + groupName + '">' +
          '<div class="rpg-ach-group-body">' +
          '<div class="rpg-ach-group-title">' + groupName + '</div>' +
          '<div class="rpg-ach-group-progress"><div class="rpg-ach-group-progress-fill" style="width:' + progress + '%"></div></div>' +
          '<div class="rpg-ach-group-meta">' + unlockedInGroup + "/" + items.length + " conquistas</div>" +
          "</div></button>";
      }
      return '<section class="rpg-ach-group">' +
        '<div class="rpg-ach-group-head"><div class="rpg-ach-group-title">' + groupName + '</div><div class="rpg-ach-group-meta">' + unlockedInGroup + "/" + items.length + '</div></div>' +
        '<div class="rpg-ach-group-grid">' + items.map(buildBadge).join("") + "</div></section>";
    }).join("");
  }

  function openAchievementGroup(groupName) {
    var overlay = document.getElementById("rpg-reading-achievements");
    var grid = document.getElementById("rpg-reading-grid");
    var items = achievementGroupsCache[groupName] || [];
    if (!overlay) return;
    if (grid) {
      grid.innerHTML = items.map(function (item) {
        var unlocked = achievementStatusCache[item.id] != null ? achievementStatusCache[item.id] : item.check();
        return '<div class="rpg-badge ' + (unlocked ? "" : "locked") + '" style="--badge-color:' + item.col + '">' +
          '<div class="rpg-badge-icon-wrap">' + item.icon + '</div>' +
          '<div style="flex:1;min-width:0"><div class="rpg-badge-name">' + item.name + '</div><div class="rpg-badge-desc">' + item.desc + '</div></div>' +
          '<div class="rpg-badge-status">' + (unlocked ? "\u2713 Obtida" : "\uD83D\uDD12 " + item.req) + '</div></div>';
      }).join("");
    }
    overlay.scrollTop = 0;
    overlay.classList.add("open");
    document.body.classList.add("rpg-reading-open");
  }

  function closeAchievementGroup() {
    var overlay = document.getElementById("rpg-reading-achievements");
    if (!overlay) return;
    overlay.classList.remove("open");
    document.body.classList.remove("rpg-reading-open");
  }

  function buildAccountStatusFallback() {
    return {
      configured: false,
      signedIn: false,
      uid: "",
      email: "",
      displayName: "",
      providerIds: []
    };
  }

  function getAccountStatus() {
    if (!window.SoterStorage || !window.SoterStorage.getFirebaseAuthStatus) {
      return Promise.resolve(buildAccountStatusFallback());
    }
    return window.SoterStorage.getFirebaseAuthStatus().catch(function () {
      return buildAccountStatusFallback();
    });
  }

  function getDeleteAccountHint(status) {
    var providerIds = status && Array.isArray(status.providerIds) ? status.providerIds : [];
    if (providerIds.indexOf("password") >= 0) {
      return "Fator 2: confirme sua identidade digitando a senha atual da conta.";
    }
    return "Fator 2: confirme sua identidade na etapa de segurança aberta pelo login atual.";
  }

  function buildAccountStatusText(status) {
    if (!status || !status.configured) {
      return "Firebase não configurado nesta instalação. Os controles de conta ficam indisponíveis até a configuração estar ativa.";
    }
    if (!status.signedIn) {
      return "Nenhuma conta conectada no momento. Entre pelo menu de perfil para liberar os controles de desconexão e exclusão.";
    }
    return "Conta conectada: " + escapeHtml(status.displayName || status.email || "Usuário");
  }

  function formatAccountError(err) {
    var message = String(err && (err.code || err.message) || err || "").trim();
    if (!message) return "Falha ao concluir a operação.";
    if (message.indexOf("password_required") >= 0) return "Digite a senha atual para confirmar a exclusão.";
    if (message.indexOf("auth/wrong-password") >= 0 || message.indexOf("INVALID_LOGIN_CREDENTIALS") >= 0) return "A senha informada não confere.";
    if (message.indexOf("auth/popup-closed-by-user") >= 0) return "A confirmação de identidade foi cancelada.";
    if (message.indexOf("auth/requires-recent-login") >= 0) return "Confirme novamente sua identidade para concluir a exclusão.";
    if (message.indexOf("logout_cancelled_unsynced") >= 0) return "Saída cancelada: ainda há alterações não enviadas para a nuvem.";
    if (message.indexOf("not_authenticated") >= 0) return "Nenhuma conta conectada para executar esta ação.";
    if (message.indexOf("unsupported_provider") >= 0) return "O método atual de login não suporta exclusão automática por esta interface.";
    return message;
  }

  function setAccountFeedback(message, tone) {
    accountPanelState.feedback = String(message || "");
    accountPanelState.tone = String(tone || "");
  }

  function clearAccountAction(keepFeedback) {
    accountPanelState.action = "";
    accountPanelState.code = "";
    accountPanelState.busy = false;
    if (!keepFeedback) setAccountFeedback("", "");
  }

  function renderAccountPanel() {
    var statusEl = document.getElementById("rpg-account-status");
    var verifyEl = document.getElementById("rpg-account-verify");
    var logoutBtn = document.getElementById("rpg-account-logout-btn");
    var deleteBtn = document.getElementById("rpg-account-delete-btn");
    var status = accountPanelState.status || buildAccountStatusFallback();
    var action = accountPanelState.action;
    var deleteNeedsPassword = action === "delete" && status.providerIds.indexOf("password") >= 0;

    if (statusEl) statusEl.innerHTML = buildAccountStatusText(status);
    if (logoutBtn) logoutBtn.disabled = accountPanelState.busy || !status.signedIn || !status.configured;
    if (deleteBtn) deleteBtn.disabled = accountPanelState.busy || !status.signedIn || !status.configured;
    if (!verifyEl) return;

    if (!action) {
      verifyEl.hidden = true;
      verifyEl.innerHTML = "";
      return;
    }

    verifyEl.hidden = false;
    verifyEl.innerHTML = [
      '<div class="rpg-account-verify-head">',
      '  <div>',
      '    <div class="rpg-account-verify-title">' + (action === "delete" ? "Excluir conta" : "Desconectar conta") + '</div>',
      '    <div class="rpg-account-verify-copy">Conclua os fatores de confirmação abaixo antes de seguir.</div>',
      '  </div>',
      '  <button class="rpg-account-verify-close" id="rpg-account-cancel-btn" type="button" aria-label="Fechar">✕</button>',
      '</div>',
      '<div class="rpg-account-factor-list">',
      '  <div class="rpg-account-factor">',
      '    <span class="rpg-account-factor-label">Fator 1 · Código de segurança</span>',
      '    <div class="rpg-account-code">' + escapeHtml(accountPanelState.code) + '</div>',
      '    <div class="rpg-account-hint">Digite o código acima para autorizar ' + (action === "delete" ? "a exclusão." : "o logout.") + '</div>',
      '    <input class="rpg-account-input" id="rpg-account-code-input" type="text" inputmode="numeric" placeholder="Repita o código exibido">',
      '  </div>',
      action === "delete" ? (
        '<div class="rpg-account-factor">' +
        '  <span class="rpg-account-factor-label">Fator 2 · Reautenticação</span>' +
        '  <div class="rpg-account-hint">' + escapeHtml(getDeleteAccountHint(status)) + '</div>' +
        (deleteNeedsPassword
          ? '<input class="rpg-account-input" id="rpg-account-password-input" type="password" placeholder="Digite sua senha atual">'
          : '<div class="rpg-account-hint">Ao confirmar, uma janela segura será aberta para validar sua conta.</div>') +
        '</div>'
      ) : "",
      '</div>',
      '<div class="rpg-account-feedback ' + escapeHtml(accountPanelState.tone) + '" id="rpg-account-feedback">' + escapeHtml(accountPanelState.feedback) + '</div>',
      '<div class="rpg-account-verify-actions">',
      '  <button class="rpg-account-btn" id="rpg-account-confirm-btn" type="button">' + (accountPanelState.busy ? "Processando..." : (action === "delete" ? "Confirmar exclusão" : "Confirmar desconexão")) + '</button>',
      '  <button class="rpg-account-btn" id="rpg-account-abort-btn" type="button">Cancelar</button>',
      '</div>'
    ].join("");

    if (accountPanelState.busy) {
      var confirmBtn = document.getElementById("rpg-account-confirm-btn");
      var abortBtn = document.getElementById("rpg-account-abort-btn");
      if (confirmBtn) confirmBtn.disabled = true;
      if (abortBtn) abortBtn.disabled = true;
    }

    document.getElementById("rpg-account-cancel-btn").addEventListener("click", function () {
      clearAccountAction(false);
      renderAccountPanel();
    });
    document.getElementById("rpg-account-abort-btn").addEventListener("click", function () {
      clearAccountAction(false);
      renderAccountPanel();
    });
    document.getElementById("rpg-account-confirm-btn").addEventListener("click", submitAccountAction);
  }

  function refreshAccountPanel() {
    return getAccountStatus().then(function (status) {
      accountPanelState.status = status;
      renderAccountPanel();
      return status;
    }).then(function (status) {
      rpgRender();
      return status;
    });
  }

  function startAccountAction(action) {
    return refreshAccountPanel().then(function (status) {
      if (!status.signedIn || !status.configured || accountPanelState.busy) return;
      accountPanelState.action = action;
      accountPanelState.code = String(Math.floor(100000 + Math.random() * 900000));
      setAccountFeedback("", "");
      renderAccountPanel();
    });
  }

  function submitAccountAction() {
    var typedCode = String((document.getElementById("rpg-account-code-input") || {}).value || "").trim();
    var password = String((document.getElementById("rpg-account-password-input") || {}).value || "");
    var action = accountPanelState.action;
    if (!action || accountPanelState.busy) return;
    if (typedCode !== accountPanelState.code) {
      setAccountFeedback("O código de segurança não confere.", "error");
      renderAccountPanel();
      return;
    }

    accountPanelState.busy = true;
    setAccountFeedback("", "");
    renderAccountPanel();

    Promise.resolve().then(function () {
      if (action === "delete") {
        return window.SoterStorage.deleteFirebaseAccount({ password: password });
      }
      return window.SoterStorage.logoutFirebase();
    }).then(function () {
      clearAccountAction(true);
      setAccountFeedback(action === "delete" ? "Conta excluída com sucesso." : "Conta desconectada com sucesso.", "ok");
      return refreshAccountPanel();
    }).catch(function (err) {
      accountPanelState.busy = false;
      setAccountFeedback(formatAccountError(err), "error");
      renderAccountPanel();
    });
  }

  function initAccountControls() {
    var logoutBtn = document.getElementById("rpg-account-logout-btn");
    var deleteBtn = document.getElementById("rpg-account-delete-btn");
    if (logoutBtn) {
      logoutBtn.addEventListener("click", function () {
        startAccountAction("logout");
      });
    }
    if (deleteBtn) {
      deleteBtn.addEventListener("click", function () {
        startAccountAction("delete");
      });
    }
    window.addEventListener("soter:firebase-auth-changed", function () {
      clearAccountAction(true);
      refreshAccountPanel();
      rpgRender();
    });
    window.addEventListener("soter:storage-hydrated", function () {
      refreshAccountPanel();
      rpgRender();
    });
    refreshAccountPanel();
  }

  function handleAvatarUpload(event) {
    var file = event && event.target && event.target.files ? event.target.files[0] : null;
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function (loadEvent) {
      var img = new Image();
      img.onload = function () {
        var canvas = document.createElement("canvas");
        var ctx = canvas.getContext("2d");
        var size = 200;
        var min = Math.min(img.width, img.height);
        var sx = (img.width - min) / 2;
        var sy = (img.height - min) / 2;
        canvas.width = size;
        canvas.height = size;
        ctx.drawImage(img, sx, sy, min, min, 0, 0, size, size);
        var state = getState();
        state.profile.avatar = canvas.toDataURL("image/jpeg", 0.85);
        saveState(state);
        rpgRender();
      };
      img.src = loadEvent.target.result;
    };
    reader.readAsDataURL(file);
  }

  function touchPageMeta() {
    var state = getState();
    state.data.lastVisitedPage = "rpg";
    state.data.lastVisitedAt = new Date().toISOString();
    saveState(state);
  }

  function openRpgTutorial() {
    var tutorial = document.getElementById("rpg-tutorial");
    if (!tutorial) return;
    tutorial.scrollTop = 0;
    tutorial.classList.add("open");
    document.body.classList.add("rpg-tutorial-open");
  }

  function closeRpgTutorial() {
    var tutorial = document.getElementById("rpg-tutorial");
    if (!tutorial) return;
    tutorial.classList.remove("open");
    document.body.classList.remove("rpg-tutorial-open");
  }

  function rpgRender() {
    var state = getState();
    var classStates = getClassStates(state);
    var xp = Math.round(calcXP());
    var level = getLevel(xp);
    var xpThisLevel = xpForLevel(level);
    var xpNext = xpForLevel(level + 1);
    var pct = Math.min(100, Math.round((xp - xpThisLevel) / (xpNext - xpThisLevel) * 100));
    if (!classStates[state.data.rpg.classe] || !classStates[state.data.rpg.classe].unlocked) {
      state.data.rpg.classe = "initiate";
      saveState(state);
    }
    var cls = RPG_CLASSES[state.data.rpg.classe] || RPG_CLASSES.initiate;
    var title = RPG_TITLES[Math.min(level - 1, RPG_TITLES.length - 1)];
    var name = (state.profile.name || "Usuário").trim() || "Usuário";
    var initials = name.split(/\s+/).map(function (word) { return word.charAt(0); }).join("").slice(0, 2).toUpperCase() || "?";
    var avatar = state.profile.avatar || "";
    var breakdown = getXPBreakdown();
    var quickStats = getQuickStats(state);
    var skillStates = getSkillCatalog(state);

    function setText(id, value) {
      var element = document.getElementById(id);
      if (element) element.textContent = value;
    }

    setText("rpg-hero-name", name);
    setText("rpg-hero-title", cls.icon + " " + cls.name + " · Nível " + level);
    setText("rpg-class-badge", cls.name);
    setText("rpg-xp-label", xp.toLocaleString("pt-BR") + " XP");
    setText("rpg-xp-next-label", (xpNext - xp).toLocaleString("pt-BR") + " XP para o próximo nível " + (level + 1));
    setText("rpg-orb-level", String(level));
    setText("rpg-level-big", String(level));
    setText("rpg-level-title", title);
    setText("rpg-level-sub", cls.icon + " " + cls.name + " - " + (cls.passive || cls.bonus));
    setText("rpg-qs-livros", String(quickStats.livros || 0));
    setText("rpg-qs-cinema", String(quickStats.cinema || 0));
    setText("rpg-qs-gym", String(quickStats.gym || 0));
    setText("rpg-qs-tarefas", String(quickStats.tarefas || 0));

    var xpBar = document.getElementById("rpg-xp-bar");
    if (xpBar) {
      if (xpBar.tagName === 'CANVAS' && window.createLiquidBar) {
        if (!_rpgXpLiquid) {
          _rpgXpLiquid = window.createLiquidBar(xpBar, {
            col0: 'rgba(158, 146, 235, 0.95)',
            col1: '#9278c8',
            col2: '#c8a96e',
            horizontal: true,
            causticRGB: '220,215,255'
          });
        }
        _rpgXpLiquid.set(pct);
      } else {
        xpBar.style.width = pct + "%";
      }
    }

    var avatarWrap = document.getElementById("rpg-avatar");
    var avatarImg = document.getElementById("rpg-avatar-img");
    var initialsEl = document.getElementById("rpg-initials");
    if (avatarWrap && avatarImg) {
      if (avatar) {
        avatarWrap.classList.add("has-photo");
        avatarImg.src = avatar;
      } else {
        avatarWrap.classList.remove("has-photo");
        avatarImg.removeAttribute("src");
      }
    }
    if (initialsEl) initialsEl.textContent = initials;

    var attrsEl = document.getElementById("rpg-attrs");
    if (attrsEl) {
      attrsEl.innerHTML = rpgCalcAttrs().map(function (attr) {
        return '<div class="rpg-attr"><div class="rpg-attr-icon">' + attr.icon + '</div><div class="rpg-attr-main"><div class="rpg-attr-label">' + attr.label + '</div><div class="rpg-attr-bar-wrap"><div class="rpg-attr-bar" style="width:0%;background:' + attr.color + '" data-w="' + attr.val + '"></div></div></div><div class="rpg-attr-val">' + attr.val + "</div></div>";
      }).join("");
      setTimeout(function () {
        attrsEl.querySelectorAll("[data-w]").forEach(function (bar) { bar.style.width = bar.getAttribute("data-w") + "%"; });
      }, 80);
    }

    document.querySelectorAll(".rpg-class-opt").forEach(function (node) {
      var classId = node.getAttribute("data-class");
      var classState = classStates[classId] || { unlocked: false, requirement: "Indisponível", progress: "" };
      var nameEl = node.querySelector(".rpg-class-opt-name");
      var metaEl = node.querySelector(".rpg-class-opt-meta");
      var classMeta = RPG_CLASSES[classId] || {};
      node.classList.toggle("active", classId === state.data.rpg.classe);
      node.classList.toggle("locked", !classState.unlocked);
      node.setAttribute("aria-disabled", classState.unlocked ? "false" : "true");
      node.title = classState.unlocked
        ? ((classMeta.passive || classMeta.bonus || "") + (classState.progress ? " · " + classState.progress : ""))
        : (classState.requirement + " · " + classState.progress);
      if (nameEl) nameEl.textContent = classMeta.name || classId;
      if (metaEl) metaEl.textContent = classState.unlocked ? (classMeta.passive || classMeta.bonus || "Classe ativa") : (classState.progress || classState.requirement || "Bloqueada");
    });

    var xpSources = document.getElementById("rpg-xp-sources");
    if (xpSources) {
      var sources = [
        { icon: "\uD83D\uDCDA", label: "Livraria", val: breakdown.livros },
        { icon: "\uD83C\uDFAC", label: "Cinema", val: breakdown.cinema },
        { icon: "\uD83D\uDDBC", label: "Mangas", val: breakdown.mangas },
        { icon: "\uD83D\uDCAA", label: "Treinos", val: breakdown.treinos },
        { icon: "\u2705", label: "Tarefas", val: breakdown.tarefas },
        { icon: "\uD83C\uDF93", label: "Estudos", val: breakdown.estudos || breakdown.estudo || 0 },
        { icon: "\uD83E\uDDE0", label: "Revisão", val: breakdown.revisao || 0 },
        { icon: "\uD83C\uDF19", label: "Sonhos", val: breakdown.sonhos },
        { icon: "\u2708\uFE0F", label: "Viagens", val: breakdown.viagens },
        { icon: "\uD83D\uDCB0", label: "Financas", val: breakdown.financas || 0 },
        { icon: "\uD83C\uDF20", label: "Wishlist", val: breakdown.wishlist || 0 },
        { icon: "\u2728", label: "Missoes", val: breakdown.missoes || 0 }
      ].filter(function (item) { return item.val > 0; });
      xpSources.innerHTML = sources.map(function (item) {
        return '<div class="rpg-xp-source">' + item.icon + " " + item.label + ' <span class="rpg-xp-source-val">+' + item.val + "</span></div>";
      }).join("");
    }

    var missions = rpgGetMissions();
    setText("rpg-missions-sub", missions.filter(function (mission) { return mission.done; }).length + "/" + missions.length + " concluidas");
    var missionsEl = document.getElementById("rpg-missions");
    if (missionsEl) {
      missionsEl.innerHTML = missions.map(function (mission) {
        return '<div class="rpg-mission ' + (mission.done ? "done locked" : "") + '" style="--m-color:' + mission.color + '" title="' + (mission.done ? "Missao concluida automaticamente apos a acao correspondente." : "Conclua a acao descrita para liberar esta missao automaticamente.") + '">' +
          '<div class="rpg-mission-check">' + (mission.done ? "\u2713" : "") + '</div><div class="rpg-mission-info"><div class="rpg-mission-name">' + mission.icon + " " + mission.name + '</div><div class="rpg-mission-meta">' + mission.desc + '</div></div><div class="rpg-mission-xp">+' + mission.xp + " XP</div></div>";
      }).join("");
    }

    var skillsEl = document.getElementById("rpg-skills-grid");
    var skillsUnlocked = skillStates.filter(function (skill) { return !!skill.unlocked; }).length;
    setText("rpg-skills-sub", skillsUnlocked + "/" + skillStates.length + " desbloqueadas");
    if (skillsEl) {
      skillsEl.innerHTML = skillStates.map(function (skill) {
        var requiredLevel = Math.max(1, Number(skill.reqLevel || 0));
        var unlocked = !!skill.unlocked;
        var levelNum = unlocked ? Number(skill.level || 0) : 0;
        return '<div class="rpg-skill ' + (unlocked ? "" : "locked") + '" style="--skill-color:' + skill.color + '">' +
          '<div class="rpg-skill-header"><div class="rpg-skill-icon">' + skill.icon + '</div>' +
          (unlocked ? '<div class="rpg-skill-active-badge">\u2713 Ativa</div>' : '<div class="rpg-skill-lock-badge">Nv' + requiredLevel + " req.</div>") +
          '</div><div class="rpg-skill-name">' + skill.name + '</div><div class="rpg-skill-desc">' + skill.desc + '</div>' +
          '<div class="rpg-skill-utility">' + (skill.utility || "Sem efeito adicional definido.") + '</div>' +
          '<div class="rpg-skill-foot"><span class="rpg-skill-lvl-txt">Nível ' + levelNum + '/10</span><span class="rpg-skill-lvl-num">' + (levelNum > 0 ? "\u25AE".repeat(Math.min(levelNum, 5)) + (levelNum > 5 ? "+" : "") : "-") + '</span></div>' +
          '<div class="rpg-skill-lvl-bar"><div class="rpg-skill-lvl-fill" style="width:' + (levelNum * 10) + '%"></div></div></div>';
      }).join("");
    }

    renderAchievements();

    var logEl = document.getElementById("rpg-log");
    if (logEl) {
      var log = rpgBuildLog();
      logEl.innerHTML = log.length ? log.map(function (entry) {
        return '<div class="rpg-log-item"><div class="rpg-log-icon">' + entry.icon + '</div><div class="rpg-log-text">' + entry.text + '</div><div class="rpg-log-xp">+' + entry.xp + "</div></div>";
      }).join("") : '<div class="rpg-log-empty">\u2726 Nenhuma atividade ainda. Comece a explorar o universo! \u2726</div>';
    }
  }

  window.rpgSetClass = rpgSetClass;
  window.openAchievementGroup = openAchievementGroup;
  window.closeAchievementGroup = closeAchievementGroup;
  window.openReadingAchievements = function () { openAchievementGroup("Leitura"); };
  window.closeReadingAchievements = closeAchievementGroup;
  window.handleAvatarUpload = handleAvatarUpload;
  window.openRpgTutorial = openRpgTutorial;
  window.closeRpgTutorial = closeRpgTutorial;

  touchPageMeta();
  rpgRender();
  initAccountControls();
  setTimeout(rpgRender, 300);
}());



