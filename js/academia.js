(function () {
  "use strict";

  // Dados do usuário escapados antes de entrar em innerHTML (SoterUtils vem do js/app-shell.js).
  var esc = window.SoterUtils.esc;
  var safeUrl = window.SoterUtils.safeUrl;

  var DATA_KEY = "academiaTracker";
  var profile = { name: "Marcos", age: 25, height: 1.75, goalWeight: 80, kcalGoal: 2000, trainDays: [1, 2, 3, 4, 5], photo: "" };
  var weightLog = [];
  var exercises = [];
  var exerciseHistory = {};
  var diet = { breakfast: [], lunch: [], snack: [], dinner: [] };
  var todayDone = {};
  var todayDoneDate = "";
  // a página pode ficar aberta depois da meia-noite: "todayDone" é sempre o do dia de hoje
  function ensureTodayDone() {
    var key = todayStr();
    if (todayDoneDate !== key) {
      todayDone = Object.assign({}, doneByDate[key] || {});
      todayDoneDate = key;
    }
    return todayDone;
  }
  var doneByDate = {};
  var skippedByDate = {};
  var exFilter = "all";
  var editExId = null;
  var exImageData = "";
  var exerciseHubId = null;

  var DAYS_PT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  var DAYS_FULL = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
  var TAG_LABELS = { peito: "Peito", costas: "Costas", pernas: "Pernas", ombros: "Ombros", triceps: "Tríceps", biceps: "Bíceps", abdomen: "Abdômen", cardio: "Cardio", outro: "Outro" };
  var MEAL_NAMES = { breakfast: "Café da manhã", lunch: "Almoço", snack: "Lanche", dinner: "Jantar" };
  var MEAL_ICONS = { breakfast: "☕", lunch: "🍽️", snack: "🥜", dinner: "🌙" };

  function getState() {
    if (window.SoterStorage && window.SoterStorage.getState) return window.SoterStorage.getState();
    return { data: {} };
  }

  function saveState(nextState) {
    if (window.SoterStorage && window.SoterStorage.save) window.SoterStorage.save(nextState);
  }
  function syncStorageNow() {
    if (window.SoterStorage && typeof window.SoterStorage.syncFirebaseNow === "function") {
      window.SoterStorage.syncFirebaseNow().catch(function () { });
    }
  }

  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2); }
  function todayStr() { return formatDateLocal(new Date()); }
  function todayDOW() { return new Date().getDay(); }
  function parseDateLocal(str) {
    if (!str) return null;
    var parts = String(str).split("-");
    if (parts.length !== 3) return null;
    return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  }
  function formatDateLocal(date) {
    var y = date.getFullYear();
    var m = String(date.getMonth() + 1).padStart(2, "0");
    var d = String(date.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + d;
  }
  function exerciseRunsOnDow(ex, dow) {
    return Array.isArray(ex.days) && ex.days.map(Number).includes(dow);
  }
  function getExercisesForDate(dateStr) {
    var date = parseDateLocal(dateStr);
    if (!date) return [];
    var dow = date.getDay();
    return exercises.filter(function (ex) { return exerciseRunsOnDow(ex, dow); });
  }
  function getCompletedExerciseCount(dateStr) {
    var dayDone = doneByDate[dateStr] || {};
    return Object.keys(dayDone).filter(function (id) { return !!dayDone[id]; }).length;
  }
  function isTrainingDayCompleted(dateStr) {
    var dayExercises = getExercisesForDate(dateStr);
    if (!dayExercises.length) return false;
    var dayDone = doneByDate[dateStr] || {};
    return dayExercises.every(function (ex) { return !!dayDone[ex.id]; });
  }
  function isTrainingDaySkipped(dateStr) {
    return !!skippedByDate[dateStr];
  }
  function resumeTrainingDay(dateStr) {
    delete skippedByDate[dateStr];
    if (!doneByDate[dateStr]) doneByDate[dateStr] = {};
    if (dateStr === todayStr()) { todayDone = Object.assign({}, doneByDate[dateStr]); todayDoneDate = dateStr; }
    save();
    syncStorageNow();
  }
  function getMonthCompletedTrainingDays(referenceDate) {
    var year = referenceDate.getFullYear();
    var month = referenceDate.getMonth();
    return Object.keys(doneByDate).filter(function (dateStr) {
      var date = parseDateLocal(dateStr);
      return date && date.getFullYear() === year && date.getMonth() === month && isTrainingDayCompleted(dateStr);
    }).length;
  }
  function getMonthCompletedExercises(referenceDate) {
    var year = referenceDate.getFullYear();
    var month = referenceDate.getMonth();
    return Object.keys(doneByDate).reduce(function (sum, dateStr) {
      var date = parseDateLocal(dateStr);
      if (!date || date.getFullYear() !== year || date.getMonth() !== month) return sum;
      return sum + getCompletedExerciseCount(dateStr);
    }, 0);
  }
  function getTrainingDaysUntil(referenceDate) {
    var days = [];
    var cursor = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());
    for (var i = 0; i < 120; i += 1) {
      if (profile.trainDays.includes(cursor.getDay())) days.push(formatDateLocal(cursor));
      cursor.setDate(cursor.getDate() - 1);
    }
    return days;
  }
  function getTrainingStreak(referenceDate) {
    var trainingDays = getTrainingDaysUntil(referenceDate);
    var referenceKey = formatDateLocal(referenceDate);
    var streak = 0;
    for (var i = 0; i < trainingDays.length; i += 1) {
      if (isTrainingDayCompleted(trainingDays[i])) streak += 1;
      else if (isTrainingDaySkipped(trainingDays[i])) continue;
      else if (trainingDays[i] === referenceKey) continue; // hoje ainda pode ser feito: não zera
      else if (!getExercisesForDate(trainingDays[i]).length) continue; // dia marcado sem exercícios
      else break;
    }
    return streak;
  }
  function getTrainingStreakTier(streak) {
    if (streak >= 60) return { tier: "tier-crown", icon: "👑", title: "Coroa do Guerreiro", desc: "Dois meses sem falhar nos dias marcados. Classe pronta para ser liberada.", target: 60 };
    if (streak >= 30) return { tier: "tier-blaze", icon: "🔥", title: "Forja Viva", desc: "Seu treino já virou ritmo de combate. Agora falta sustentar a disciplina.", target: 60 };
    if (streak >= 14) return { tier: "tier-flare", icon: "⚡", title: "Ritmo de Aço", desc: "Você criou consistência real na agenda de treino.", target: 60 };
    if (streak >= 5) return { tier: "tier-spark", icon: "✦", title: "Faísca", desc: "A cadência começou. O foco agora é não quebrar os dias marcados.", target: 60 };
    return { tier: "tier-dormant", icon: "◌", title: "Dormante", desc: "Complete os treinos previstos para iniciar sua sequência.", target: 60 };
  }
  function renderTrainingStreakDisplay(streak) {
    var panel = document.getElementById("gym-streak-panel");
    if (!panel) return;
    var tier = getTrainingStreakTier(streak);
    var pct = Math.max(0, Math.min(100, Math.round((streak / tier.target) * 100)));
    panel.className = "gym-streak-panel " + tier.tier;
    document.getElementById("gym-streak-count").textContent = String(streak);
    document.getElementById("gym-streak-title").textContent = tier.title;
    document.getElementById("gym-streak-desc").textContent = tier.desc;
    document.getElementById("gym-streak-fill").style.width = pct + "%";
    document.getElementById("gym-streak-meta").textContent = streak + "/60 treinos para liberar Guerreiro";
  }
  function getWeightGoalProgress(start, curr, goal) {
    if (!(start && curr && goal)) return 0;
    var total = Math.abs(goal - start);
    if (total === 0) return curr === goal ? 1 : 0;
    var progressed = Math.abs(curr - start);
    var overshot = (goal >= start && curr >= goal) || (goal <= start && curr <= goal);
    return Math.max(0, Math.min(1, overshot ? 1 : progressed / total));
  }
  function getLoadNumber(loadValue) {
    var match = String(loadValue || "").replace(",", ".").match(/-?\d+(\.\d+)?/);
    return match ? parseFloat(match[0]) : null;
  }
  function getPositiveNumber(value) {
    var n = parseFloat(String(value || "").replace(",", "."));
    return isFinite(n) && n > 0 ? n : null;
  }
  function getCurrentWeightForCalories() {
    var latest = weightLog.length ? getPositiveNumber(weightLog[weightLog.length - 1].weight) : null;
    return latest || getPositiveNumber(profile.goalWeight) || 70;
  }
  function isCardioExercise(ex) {
    return ex && ex.tag === "cardio";
  }
  function getCardioTypeLabel(value) {
    if (value === "run") return "Corrida";
    if (value === "bike") return "Bicicleta";
    return "Caminhada";
  }
  function getExerciseMet(ex) {
    var intensity = ex.intensity || "moderate";
    if (isCardioExercise(ex)) {
      var cardioType = ex.cardioType || "walk";
      var cardioMet = {
        walk: { light: 3.0, moderate: 3.8, hard: 5.0 },
        run: { light: 6.0, moderate: 8.3, hard: 10.5 },
        bike: { light: 4.0, moderate: 6.8, hard: 8.8 }
      };
      return (cardioMet[cardioType] || cardioMet.walk)[intensity] || cardioMet.walk.moderate;
    }
    var table = {
      light: { cardio: 5.5, abdomen: 2.8, defaultValue: 3.0 },
      moderate: { cardio: 7.0, abdomen: 3.8, defaultValue: 4.0 },
      hard: { cardio: 9.0, abdomen: 5.0, defaultValue: 6.0 }
    };
    var row = table[intensity] || table.moderate;
    return row[ex.tag] || row.defaultValue;
  }
  function estimateExerciseDuration(ex) {
    var explicit = getPositiveNumber(ex.duration);
    if (explicit) return explicit;
    if (isCardioExercise(ex)) return 30;
    var sets = getPositiveNumber(ex.sets) || 3;
    return Math.max(5, Math.round((sets * 2.5) + 4));
  }
  function estimateExerciseCalories(ex) {
    var minutes = estimateExerciseDuration(ex);
    var weight = getCurrentWeightForCalories();
    var met = getExerciseMet(ex);
    var kcal = Math.round((met * 3.5 * weight / 200) * minutes);
    return {
      kcal: kcal,
      minutes: minutes,
      weight: weight,
      met: met
    };
  }
  function getIntensityLabel(value) {
    return value === "light" ? "Leve" : value === "hard" ? "Intensa" : "Moderada";
  }
  function formatKm(value) {
    var n = getPositiveNumber(value);
    return n ? n.toFixed(n >= 10 ? 1 : 2).replace(".", ",") + " km" : "—";
  }
  function formatPace(distance, duration) {
    var km = getPositiveNumber(distance);
    var min = getPositiveNumber(duration);
    if (!km || !min) return "—";
    var pace = min / km;
    var paceMin = Math.floor(pace);
    var paceSec = Math.round((pace - paceMin) * 60);
    if (paceSec === 60) {
      paceMin += 1;
      paceSec = 0;
    }
    return paceMin + ":" + String(paceSec).padStart(2, "0") + "/km";
  }
  function getExerciseSummary(ex) {
    var estimate = estimateExerciseCalories(ex);
    if (isCardioExercise(ex)) {
      return getCardioTypeLabel(ex.cardioType) + " · " + formatKm(ex.distance) + " · " + estimate.minutes + " min · " + estimate.kcal + " kcal";
    }
    return (ex.sets ? ex.sets + "x " : "") + (ex.reps || "") + (ex.load ? " · " + ex.load : "") + " · " + estimate.kcal + " kcal";
  }
  function getExerciseDraftFromForm() {
    var tag = document.getElementById("ex-tag").value;
    return {
      tag: tag,
      sets: document.getElementById("ex-sets").value,
      cardioType: tag === "cardio" ? document.getElementById("ex-cardio-type").value : "",
      distance: tag === "cardio" ? document.getElementById("ex-distance").value : "",
      duration: tag === "cardio" ? document.getElementById("ex-duration").value : "",
      intensity: tag === "cardio" ? document.getElementById("ex-intensity").value : "moderate"
    };
  }
  function renderExerciseCaloriePreview() {
    var el = document.getElementById("ex-calorie-preview");
    if (!el) return;
    var draft = getExerciseDraftFromForm();
    var estimate = estimateExerciseCalories(draft);
    var pace = isCardioExercise(draft) ? " · ritmo " + formatPace(draft.distance, estimate.minutes) : "";
    el.textContent = "Estimativa: " + estimate.kcal + " kcal em " + estimate.minutes + " min" + pace + " (" + getIntensityLabel(draft.intensity).toLowerCase() + ")";
  }
  function syncExerciseFormMode() {
    var tag = document.getElementById("ex-tag").value;
    var modal = document.querySelector("#modal-ex .modal");
    var isCardio = tag === "cardio";
    if (modal) modal.classList.toggle("cardio-mode", isCardio);
    document.getElementById("ex-duration-label").textContent = "Tempo (min)";
    document.getElementById("ex-duration").placeholder = "Ex: 35";
    renderExerciseCaloriePreview();
  }
  function fmtShortDate(dateStr) {
    if (!dateStr) return "—";
    var parts = String(dateStr).split("-");
    return parts.length === 3 ? parts[2] + "/" + parts[1] + "/" + parts[0] : dateStr;
  }
  function trackExerciseCompletion(exerciseId, dateStr) {
    var ex = exercises.find(function (item) { return item.id === exerciseId; });
    if (!ex) return;
    if (!exerciseHistory[exerciseId]) exerciseHistory[exerciseId] = [];
    var existing = exerciseHistory[exerciseId].find(function (entry) { return entry.date === dateStr; });
    var next = {
      date: dateStr,
      load: getLoadNumber(ex.load),
      loadLabel: ex.load || "—",
      sets: ex.sets || "",
      reps: ex.reps || "",
      distance: getPositiveNumber(ex.distance),
      duration: estimateExerciseDuration(ex),
      cardioType: ex.cardioType || "",
      calories: estimateExerciseCalories(ex).kcal
    };
    if (existing) {
      Object.assign(existing, next);
    } else {
      exerciseHistory[exerciseId].push(next);
      exerciseHistory[exerciseId].sort(function (a, b) { return String(a.date).localeCompare(String(b.date)); });
    }
  }
  function setExerciseDaySelection(days) {
    var selected = (days || []).map(Number);
    document.querySelectorAll("#ex-days .ex-day-chip").forEach(function (chip) {
      var day = parseInt(chip.dataset.day, 10);
      chip.classList.toggle("active", selected.includes(day));
    });
  }
  function setExerciseImagePreview(src) {
    exImageData = safeUrl(src);
    var previewImg = document.getElementById("ex-img-preview-img");
    var previewLbl = document.getElementById("ex-img-preview-label");
    if (exImageData) {
      previewImg.src = exImageData;
      previewImg.style.display = "block";
      previewLbl.style.display = "none";
    } else {
      previewImg.src = "";
      previewImg.style.display = "none";
      previewLbl.style.display = "block";
    }
  }
  function applyExerciseWebImage() {
    var input = document.getElementById("ex-img-web");
    var url = input.value.trim();
    if (!url) {
      setExerciseImagePreview("");
      return;
    }
    if (!/^https?:\/\//i.test(url)) {
      toast("Use um link começando com http:// ou https://", "err");
      return;
    }
    setExerciseImagePreview(url);
    toast("Imagem web aplicada.", "ok");
  }
  function getExerciseDaySelection() {
    return Array.from(document.querySelectorAll("#ex-days .ex-day-chip.active")).map(function (chip) {
      return parseInt(chip.dataset.day, 10);
    });
  }

  function isSyntheticWeightSeed(list) {
    if (!Array.isArray(list) || list.length !== 6) return false;
    var base = new Date();
    for (var i = 0; i < list.length; i += 1) {
      var item = list[i];
      if (!item || typeof item.date !== "string" || typeof item.weight !== "number") return false;
      var expectedDate = window.SoterUtils.localDateKey(new Date(base.getFullYear(), base.getMonth() - (list.length - 1 - i), 12, 12, 0, 0));
      if (item.date !== expectedDate) return false;
    }
    for (var j = 1; j < list.length; j += 1) {
      var step = Number((list[j - 1].weight - list[j].weight).toFixed(1));
      if (Math.abs(step - 0.7) > 0.05 && Math.abs(step - 0.8) > 0.15) return false;
    }
    return true;
  }

  function toast(msg, type) {
    type = type || "ok";
    var icons = { ok: "fa-check-circle", err: "fa-exclamation-circle", info: "fa-info-circle" };
    var cols = { ok: "var(--teal)", err: "var(--rose)", info: "var(--sky)" };
    var c = document.getElementById("toasts");
    var el = document.createElement("div");
    el.className = "t " + type;
    el.innerHTML = '<i class="fas ' + icons[type] + '" style="color:' + cols[type] + '"></i> ' + msg;
    c.appendChild(el);
    setTimeout(function () {
      el.style.animation = "tOut .3s ease forwards";
      setTimeout(function () { el.remove(); }, 300);
    }, 2600);
  }

  function openModal(id) { document.getElementById(id).classList.add("open"); }
  function closeModal(id) { document.getElementById(id).classList.remove("open"); }

  function save() {
    var state = getState();
    if (!state.data || typeof state.data !== "object") state.data = {};
    state.data[DATA_KEY] = {
      profile: profile,
      weightLog: weightLog,
      exercises: exercises,
      exerciseHistory: exerciseHistory,
      diet: diet,
      skippedByDate: skippedByDate,
      todayDoneByDate: (function () {
        ensureTodayDone();
        doneByDate[todayStr()] = todayDone;
        return Object.assign({}, doneByDate);
      }())
    };
    state.data.lastVisitedPage = "academia";
    state.data.lastVisitedAt = new Date().toISOString();
    saveState(state);
  }

  function loadAll() {
    var state = getState();
    var data = state.data || {};
    if (data[DATA_KEY]) {
      profile = Object.assign(profile, data[DATA_KEY].profile || {});
      weightLog = Array.isArray(data[DATA_KEY].weightLog) ? data[DATA_KEY].weightLog : [];
      exercises = Array.isArray(data[DATA_KEY].exercises) ? data[DATA_KEY].exercises : [];
      exerciseHistory = data[DATA_KEY].exerciseHistory && typeof data[DATA_KEY].exerciseHistory === "object" ? Object.assign({}, data[DATA_KEY].exerciseHistory) : {};
      diet = Object.assign({ breakfast: [], lunch: [], snack: [], dinner: [] }, data[DATA_KEY].diet || {});
      skippedByDate = data[DATA_KEY].skippedByDate && typeof data[DATA_KEY].skippedByDate === "object" ? Object.assign({}, data[DATA_KEY].skippedByDate) : {};
      doneByDate = data[DATA_KEY].todayDoneByDate && typeof data[DATA_KEY].todayDoneByDate === "object" ? Object.assign({}, data[DATA_KEY].todayDoneByDate) : {};
      todayDone = doneByDate[todayStr()] ? Object.assign({}, doneByDate[todayStr()]) : {};
      todayDoneDate = todayStr();
    }

    if (isSyntheticWeightSeed(weightLog)) weightLog = [];

    save();
  }

  function renderProfile() {
    document.getElementById("profile-name-display").innerHTML = esc(profile.name || "Atleta");
    document.getElementById("disp-age").textContent = (profile.age || "—") + " anos";
    document.getElementById("disp-height").textContent = profile.height ? profile.height.toFixed(2).replace(".", ",") + " m" : "—";

    var lastW = weightLog.length ? weightLog[weightLog.length - 1].weight : null;
    if (lastW && profile.height) {
      var imc = (lastW / (profile.height * profile.height)).toFixed(1);
      var imcLbl = imc < 18.5 ? "Abaixo" : imc < 25 ? "Normal" : imc < 30 ? "Sobrepeso" : "Obeso";
      var imcCol = imc < 18.5 ? "var(--sky)" : imc < 25 ? "var(--teal)" : imc < 30 ? "var(--amber)" : "var(--rose)";
      document.getElementById("disp-imc").innerHTML = '<span style="color:' + imcCol + '">' + imc + " — " + imcLbl + "</span>";
    } else {
      document.getElementById("disp-imc").textContent = "—";
    }

    if (profile.photo) {
      var img = document.getElementById("profile-photo-img");
      img.src = profile.photo;
      img.className = "loaded";
      document.getElementById("profile-photo-placeholder").style.display = "none";
    }

    if (lastW) document.getElementById("weight-input").value = lastW;

    document.querySelectorAll(".day-pill").forEach(function (btn) {
      var d = parseInt(btn.dataset.day, 10);
      btn.classList.remove("active", "today-active", "today-rest");
      var isToday = d === todayDOW();
      var isTrain = profile.trainDays.includes(d);
      if (isToday && isTrain) btn.classList.add("today-active");
      else if (isToday) btn.classList.add("today-rest");
      else if (isTrain) btn.classList.add("active");
    });

    var dow = todayDOW();
    var isTrain = profile.trainDays.includes(dow);
    document.getElementById("today-tag").textContent = DAYS_FULL[dow];
    document.getElementById("today-tag").style.color = isTrain ? "var(--teal)" : "var(--rose)";
  }

  function setRing(id, pct) {
    var circ = 138.2;
    var el = document.getElementById(id);
    if (el) el.style.strokeDashoffset = circ * (1 - pct);
  }

  function renderWeightStats() {
    var curr = weightLog.length ? weightLog[weightLog.length - 1].weight : null;
    var start = weightLog.length ? weightLog[0].weight : null;
    var goal = profile.goalWeight;

    document.getElementById("ws-current").textContent = curr ? curr + "kg" : "—";
    document.getElementById("ws-start").textContent = start ? start + "kg" : "—";

    if (curr && start) {
      var diff = (curr - start).toFixed(1);
      var el = document.getElementById("ws-diff");
      el.textContent = (diff > 0 ? "+" : "") + diff + "kg";
      el.style.color = diff < 0 ? "var(--teal)" : diff > 0 ? "var(--rose)" : "var(--muted2)";
    } else {
      document.getElementById("ws-diff").textContent = "—";
    }

    document.getElementById("ws-goal").textContent = goal ? goal + "kg" : "—";

    if (weightLog.length >= 2) {
      var recent = weightLog.slice(-3).map(function (x) { return x.weight; });
      var trend = recent[recent.length - 1] - recent[0];
      var el2 = document.getElementById("weight-trend");
      if (trend < 0) el2.innerHTML = '<i class="fas fa-arrow-down" style="color:var(--teal)"></i> ' + trend.toFixed(1) + "kg";
      else if (trend > 0) el2.innerHTML = '<i class="fas fa-arrow-up" style="color:var(--rose)"></i> +' + trend.toFixed(1) + "kg";
      else el2.textContent = "Estável";
    }

    var now = new Date();
    var trainCount = getMonthCompletedTrainingDays(now);
    setRing("ring-treinos", Math.min(trainCount, Math.max(profile.trainDays.length * 4, 1)) / Math.max(profile.trainDays.length * 4, 1));
    document.getElementById("ring-treinos-val").textContent = trainCount;

    var metaPct = getWeightGoalProgress(start, curr, goal);
    setRing("ring-meta", metaPct);
    document.getElementById("ring-meta-val").textContent = Math.round(metaPct * 100) + "%";

    var streak = getTrainingStreak(now);
    setRing("ring-streak", Math.min(streak, 12) / 12);
    document.getElementById("ring-streak-val").textContent = streak;
    renderTrainingStreakDisplay(streak);

    var completedExercises = getMonthCompletedExercises(now);
    setRing("ring-ex", Math.min(completedExercises, 40) / 40);
    document.getElementById("ring-ex-val").textContent = completedExercises;
  }

  function drawWeightChart() {
    var canvas = document.getElementById("weight-chart");
    if (!canvas) return;
    var dpr = window.devicePixelRatio || 1;
    canvas.width = canvas.offsetWidth * dpr;
    canvas.height = 220 * dpr;
    var ctx = canvas.getContext("2d");
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    var W = canvas.offsetWidth;
    var H = 220;
    ctx.clearRect(0, 0, W, H);

    if (weightLog.length < 2) {
      ctx.fillStyle = "rgba(255,255,255,.2)";
      ctx.font = "13px Syne, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Adicione registros de peso para ver o gráfico", W / 2, H / 2);
      return;
    }

    var vals = weightLog.map(function (x) { return x.weight; });
    var minV = Math.min.apply(null, vals) - 1;
    var maxV = Math.max.apply(null, vals) + 1;
    var rng = Math.max(maxV - minV, 1);
    var pad = { l: 36, r: 16, t: 16, b: 28 };
    var cW = W - pad.l - pad.r;
    var cH = H - pad.t - pad.b;
    var n = weightLog.length;
    function px(i) { return pad.l + i / (n - 1) * cW; }
    function py(v) { return pad.t + cH - (v - minV) / rng * cH; }

    ctx.strokeStyle = "rgba(255,255,255,.055)";
    ctx.lineWidth = 1;
    for (var g = 0; g <= 4; g += 1) {
      var gy = pad.t + cH * (1 - g / 4);
      ctx.beginPath();
      ctx.moveTo(pad.l, gy);
      ctx.lineTo(W - pad.r, gy);
      ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,.3)";
      ctx.font = "10px DM Mono, monospace";
      ctx.textAlign = "right";
      ctx.fillText((minV + rng * g / 4).toFixed(1), pad.l - 4, gy + 3);
    }

    if (profile.goalWeight && profile.goalWeight >= minV && profile.goalWeight <= maxV) {
      var gy2 = py(profile.goalWeight);
      ctx.strokeStyle = "rgba(94,196,168,.4)";
      ctx.lineWidth = 1.2;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(pad.l, gy2);
      ctx.lineTo(W - pad.r, gy2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(94,196,168,.7)";
      ctx.font = "10px DM Mono, monospace";
      ctx.textAlign = "left";
      ctx.fillText("meta " + profile.goalWeight + "kg", pad.l + 4, gy2 - 4);
    }

    ctx.beginPath();
    ctx.moveTo(px(0), py(vals[0]));
    for (var i = 1; i < n; i += 1) ctx.lineTo(px(i), py(vals[i]));
    ctx.lineTo(px(n - 1), H - pad.b);
    ctx.lineTo(px(0), H - pad.b);
    ctx.closePath();
    var af = ctx.createLinearGradient(0, pad.t, 0, H - pad.b);
    af.addColorStop(0, "rgba(200,169,110,.22)");
    af.addColorStop(1, "rgba(200,169,110,.02)");
    ctx.fillStyle = af;
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(px(0), py(vals[0]));
    for (i = 1; i < n; i += 1) ctx.lineTo(px(i), py(vals[i]));
    ctx.strokeStyle = "rgba(200,169,110,.9)";
    ctx.lineWidth = 2.2;
    ctx.stroke();

    for (i = 0; i < n; i += 1) {
      ctx.beginPath();
      ctx.arc(px(i), py(vals[i]), 3.5, 0, Math.PI * 2);
      ctx.fillStyle = i === n - 1 ? "rgba(200,169,110,1)" : "rgba(200,169,110,.6)";
      ctx.fill();
    }

    var step = Math.max(1, Math.floor(n / 6));
    for (i = 0; i < n; i += step) {
      var d = weightLog[i].date.slice(5);
      ctx.fillStyle = "rgba(255,255,255,.35)";
      ctx.font = "9px DM Mono, monospace";
      ctx.textAlign = "center";
      ctx.fillText(d.replace("-", "/"), px(i), H - 8);
    }
  }

  function drawExerciseHubChart(exerciseId) {
    var canvas = document.getElementById("gym-hub-chart");
    if (!canvas) return;
    var ex = exercises.find(function (item) { return item.id === exerciseId; }) || {};
    var metricKey = isCardioExercise(ex) ? "distance" : "load";
    var history = (exerciseHistory[exerciseId] || []).filter(function (item) { return typeof item[metricKey] === "number" && !isNaN(item[metricKey]); });
    var dpr = window.devicePixelRatio || 1;
    var width = canvas.offsetWidth || 480;
    var height = 260;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    var ctx = canvas.getContext("2d");
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    if (history.length < 2) {
      ctx.fillStyle = "rgba(255,255,255,.2)";
      ctx.font = "13px Syne, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(isCardioExercise(ex) ? "Conclua mais sessões para ver a evolução da distância" : "Conclua o exercício mais vezes para ver a evolução da carga", width / 2, height / 2);
      return;
    }

    var vals = history.map(function (item) { return item[metricKey]; });
    var minV = Math.min.apply(null, vals);
    var maxV = Math.max.apply(null, vals);
    var rng = Math.max(maxV - minV, 1);
    var pad = { l: 38, r: 18, t: 18, b: 28 };
    var cW = width - pad.l - pad.r;
    var cH = height - pad.t - pad.b;
    function px(i) { return pad.l + i / (history.length - 1) * cW; }
    function py(v) { return pad.t + cH - ((v - minV) / rng) * cH; }

    ctx.strokeStyle = "rgba(255,255,255,.06)";
    ctx.lineWidth = 1;
    for (var g = 0; g <= 4; g += 1) {
      var gy = pad.t + cH * (1 - g / 4);
      ctx.beginPath();
      ctx.moveTo(pad.l, gy);
      ctx.lineTo(width - pad.r, gy);
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.moveTo(px(0), py(vals[0]));
    for (var i = 1; i < vals.length; i += 1) ctx.lineTo(px(i), py(vals[i]));
    ctx.strokeStyle = "rgba(200,169,110,.95)";
    ctx.lineWidth = 2.5;
    ctx.stroke();

    for (i = 0; i < vals.length; i += 1) {
      ctx.beginPath();
      ctx.arc(px(i), py(vals[i]), 3.5, 0, Math.PI * 2);
      ctx.fillStyle = i === vals.length - 1 ? "rgba(94,196,168,1)" : "rgba(200,169,110,.75)";
      ctx.fill();
    }

    ctx.fillStyle = "rgba(255,255,255,.35)";
    ctx.font = "10px DM Mono, monospace";
    ctx.textAlign = "center";
    var step = Math.max(1, Math.floor(history.length / 4));
    for (i = 0; i < history.length; i += step) {
      ctx.fillText(history[i].date.slice(5).replace("-", "/"), px(i), height - 8);
    }
  }

  function renderExerciseHub(exerciseId) {
    var ex = exercises.find(function (item) { return item.id === exerciseId; });
    if (!ex) return;
    exerciseHubId = exerciseId;
    var history = (exerciseHistory[exerciseId] || []).slice().sort(function (a, b) { return String(a.date).localeCompare(String(b.date)); });
    var bestLoad = history.reduce(function (best, item) {
      return typeof item.load === "number" && !isNaN(item.load) ? Math.max(best, item.load) : best;
    }, -Infinity);
    var lastEntry = history.length ? history[history.length - 1] : null;
    var daysLabel = (ex.days || []).map(function (d) { return DAYS_PT[d]; }).join(", ") || "—";
    var calorieEstimate = estimateExerciseCalories(ex);
    var isCardio = isCardioExercise(ex);
    var paceLabel = formatPace(ex.distance, calorieEstimate.minutes);
    var infoRows = isCardio ? [
      ["Atividade", getCardioTypeLabel(ex.cardioType)],
      ["Distância", formatKm(ex.distance)],
      ["Tempo", calorieEstimate.minutes + " min"],
      ["Ritmo médio", paceLabel],
      ["Intensidade", getIntensityLabel(ex.intensity)],
      ["Gasto estimado", calorieEstimate.kcal + " kcal"],
      ["Dias", daysLabel],
      ["Observações", ex.notes || "Sem observações"]
    ] : [
      ["Grupo", TAG_LABELS[ex.tag] || ex.tag || "—"],
      ["Séries", ex.sets || "—"],
      ["Repetições", ex.reps || "—"],
      ["Carga", ex.load || "—"],
      ["Gasto estimado", calorieEstimate.kcal + " kcal"],
      ["Dias", daysLabel],
      ["Observações", ex.notes || "Sem observações"]
    ];

    document.getElementById("gym-hub-icon").textContent = getExEmoji(ex.tag);
    document.getElementById("gym-hub-badge").textContent = TAG_LABELS[ex.tag] || "Treino";
    document.getElementById("gym-hub-title").textContent = ex.name;
    document.getElementById("gym-hub-meta").textContent = isCardio ? getCardioTypeLabel(ex.cardioType) + " · " + daysLabel : daysLabel;
    document.getElementById("gym-hub-primary-label").textContent = isCardio ? "Distância" : "Carga atual";
    document.getElementById("gym-hub-primary-sub").textContent = isCardio ? getCardioTypeLabel(ex.cardioType).toLowerCase() : "configurada";
    document.getElementById("gym-hub-current-load").textContent = isCardio ? formatKm(ex.distance) : ex.load || "—";
    document.getElementById("gym-hub-session-count").textContent = String(history.length);
    document.getElementById("gym-hub-calories").textContent = calorieEstimate.kcal + " kcal";
    document.getElementById("gym-hub-calories-sub").textContent = calorieEstimate.minutes + " min · " + getIntensityLabel(ex.intensity).toLowerCase();
    document.getElementById("gym-hub-best-label").textContent = isCardio ? "Ritmo médio" : "Melhor carga";
    document.getElementById("gym-hub-best-sub").textContent = isCardio ? "min/km" : "histórico";
    document.getElementById("gym-hub-chart-title").textContent = isCardio ? "Evolução da Distância" : "Evolução da Carga";
    document.getElementById("gym-hub-best-load").textContent = isCardio ? paceLabel : bestLoad > -Infinity ? String(bestLoad).replace(".", ",") + " kg" : "—";
    document.getElementById("gym-hub-last-date").textContent = lastEntry ? fmtShortDate(lastEntry.date) : "—";
    document.getElementById("gym-hub-info-list").innerHTML = infoRows.map(function (row) {
      return '<div class="gym-hub-info-row"><div class="gym-hub-info-label">' + esc(row[0]) + '</div><div class="gym-hub-info-value">' + esc(row[1]) + '</div></div>';
    }).join("");
    document.getElementById("gym-hub-history").innerHTML = history.length
      ? history.slice().reverse().map(function (entry) {
          var histValue = isCardio
            ? formatKm(entry.distance) + " · " + (entry.duration || calorieEstimate.minutes) + " min" + (entry.calories ? " · " + entry.calories + " kcal" : "")
            : (entry.loadLabel || "—") + (entry.calories ? " · " + entry.calories + " kcal" : "");
          return '<div class="gym-hub-history-row"><div class="gym-hub-history-dot"></div><div class="gym-hub-history-label">Treino concluído</div><div class="gym-hub-history-value">' + esc(histValue) + '</div><div class="gym-hub-history-date">' + fmtShortDate(entry.date) + '</div></div>';
        }).join("")
      : '<div class="ex-empty" style="padding:18px 8px;text-align:left"><p>Nenhuma sessão registrada ainda.</p></div>';
    var heroBg = document.getElementById("gym-hub-hero-bg");
    var heroImage = safeUrl(ex.image);
    heroBg.style.backgroundImage = heroImage ? "url(" + JSON.stringify(heroImage) + ")" : "none";
    heroBg.style.backgroundColor = heroImage ? "transparent" : "rgba(124,111,205,.18)";
    openModal("exercise-hub");
    setTimeout(function () { drawExerciseHubChart(exerciseId); }, 40);
  }

  function renderDiet() {
    var grid = document.getElementById("meal-grid");
    var meals = ["breakfast", "lunch", "snack", "dinner"];
    var totalKcal = 0;
    meals.forEach(function (m) {
      (diet[m] || []).forEach(function (item) { totalKcal += parseInt(item.kcal || 0, 10); });
    });

    grid.innerHTML = "";
    meals.forEach(function (m) {
      var col = document.createElement("div");
      col.className = "meal-col";
      col.innerHTML = '<div class="meal-header"><span class="meal-icon">' + MEAL_ICONS[m] + '</span><span class="meal-name">' + MEAL_NAMES[m] + '</span></div><div class="meal-items" id="meal-items-' + m + '"></div>';
      var itemsDiv = col.querySelector(".meal-items");
      (diet[m] || []).forEach(function (item, idx) {
        var el = document.createElement("div");
        el.className = "meal-item";
        el.innerHTML = '<div class="meal-item-left"><span class="meal-item-name">' + esc(item.name) + '</span><span style="font-size:10px;color:var(--muted);margin-left:4px">' + esc(item.qty || "") + '</span></div>' + (item.kcal ? '<span class="meal-item-kcal">' + esc(item.kcal) + ' kcal</span>' : "") + ' <button class="meal-item-del" data-meal="' + m + '" data-idx="' + idx + '"><i class="fas fa-times"></i></button>';
        itemsDiv.appendChild(el);
      });
      var addBtn = document.createElement("button");
      addBtn.className = "meal-add-btn";
      addBtn.dataset.meal = m;
      addBtn.innerHTML = '<i class="fas fa-plus" style="font-size:10px"></i> Adicionar';
      addBtn.addEventListener("click", function () {
        document.getElementById("meal-target").value = this.dataset.meal;
        document.getElementById("meal-item-name").value = "";
        document.getElementById("meal-item-qty").value = "";
        document.getElementById("meal-item-kcal").value = "";
        openModal("modal-meal");
      });
      col.appendChild(addBtn);
      grid.appendChild(col);
    });

    document.querySelectorAll(".meal-item-del").forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        var m = this.dataset.meal;
        var idx = parseInt(this.dataset.idx, 10);
        diet[m].splice(idx, 1);
        save();
        renderDiet();
      });
    });

    var goal = profile.kcalGoal || 2000;
    document.getElementById("kcal-num").textContent = totalKcal;
    document.getElementById("kcal-goal-lbl").textContent = "/ " + goal;
    document.getElementById("kcal-bar").style.width = Math.min(100, totalKcal / goal * 100) + "%";
    document.getElementById("diet-kcal-display").textContent = totalKcal + " kcal";
  }

  function getExEmoji(tag) {
    var m = { peito: "💪", costas: "🏋️", pernas: "🦵", ombros: "🙆", triceps: "💪", biceps: "🦾", abdomen: "🔥", cardio: "🏃", outro: "⚡" };
    return m[tag] || "⚡";
  }

  function renderDayWorkout() {
    var dow = todayDOW();
    var isTrain = profile.trainDays.includes(dow);
    var body = document.getElementById("day-workout-body");
    var dateKey = todayStr();
    var skippedToday = isTrainingDaySkipped(dateKey);

    if (!isTrain) {
      body.innerHTML = '<div class="rest-msg"><i class="fas fa-moon"></i><p>Dia de descanso.<br>Aproveite a recuperação!</p></div>';
      return;
    }

    var dayExs = exercises.filter(function (e) { return (e.days || []).map(Number).includes(dow); });
    if (dayExs.length === 0) {
      body.innerHTML = '<div class="rest-msg"><i class="fas fa-dumbbell"></i><p>Nenhum exercício configurado para hoje.<br>Adicione exercícios e selecione este dia.</p></div>';
      return;
    }

    if (skippedToday) {
      body.innerHTML = '<div class="skip-workout-state"><i class="fas fa-forward"></i><p>Treino pulado hoje.</p><button class="btn btn-ghost btn-sm" id="btn-unskip-workout"><i class="fas fa-undo"></i> Retomar treino</button></div>';
      document.getElementById("btn-unskip-workout").addEventListener("click", function () {
        resumeTrainingDay(dateKey);
        renderDayWorkout();
        renderWeightStats();
        toast("Treino retomado e visivel em Tarefas.", "info");
      });
      return;
    }

    var list = document.createElement("div");
    list.className = "day-ex-list";
    var done = 0;
    ensureTodayDone();
    dayExs.forEach(function (ex) {
      var isDone = !!todayDone[ex.id];
      if (isDone) done += 1;
      var item = document.createElement("div");
      item.className = "day-ex-item";
      var thumbHtml = safeUrl(ex.image) ? '<div class="day-ex-thumb"><img src="' + esc(safeUrl(ex.image)) + '" alt=""></div>' : '<div class="day-ex-thumb">' + getExEmoji(ex.tag) + "</div>";
      item.innerHTML = thumbHtml +
        '<div class="day-ex-body">' +
        '<div class="day-ex-name"' + (isDone ? ' style="text-decoration:line-through;opacity:.5"' : "") + ">" + esc(ex.name) + "</div>" +
        '<div class="day-ex-meta">' + esc(getExerciseSummary(ex)) + "</div>" +
        "</div>" +
        '<span class="day-ex-tag tag-' + esc(ex.tag) + '">' + esc(TAG_LABELS[ex.tag]) + "</span>" +
        '<div class="done-check' + (isDone ? " done" : "") + '" data-id="' + esc(ex.id) + '">' +
        '<i class="fas fa-check"></i>' +
        "</div>";
      list.appendChild(item);
    });
    body.innerHTML = "";

    var pbar = document.createElement("div");
    pbar.className = "day-workout-progress";
    pbar.innerHTML = '<div class="day-workout-track"><div class="day-workout-fill" style="width:' + Math.round(done / dayExs.length * 100) + '%"></div></div><span>' + done + "/" + dayExs.length + '</span><button class="btn btn-ghost btn-sm skip-workout-btn" id="btn-skip-workout"><i class="fas fa-forward"></i> Pular treino</button>';
    body.appendChild(pbar);
    body.appendChild(list);

    document.getElementById("btn-skip-workout").addEventListener("click", function () {
      skippedByDate[dateKey] = true;
      save();
      syncStorageNow();
      renderDayWorkout();
      renderWeightStats();
      toast("Treino de hoje pulado.", "info");
    });

    body.querySelectorAll(".done-check").forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        var id = this.dataset.id;
        // a lista foi desenhada antes da meia-noite: redesenha com o dia novo em vez de marcar
        if (dateKey !== todayStr()) { renderDayWorkout(); return; }
        ensureTodayDone();
        delete skippedByDate[dateKey];
        todayDone[id] = !todayDone[id];
        doneByDate[dateKey] = Object.assign({}, todayDone);
        if (todayDone[id]) trackExerciseCompletion(id, dateKey);
        save();
        renderDayWorkout();
        renderWeightStats();
      });
    });

    list.querySelectorAll(".day-ex-item").forEach(function (item, i) {
      item.addEventListener("click", function (e) {
        if (e.target.closest(".done-check")) return;
        renderExerciseHub(dayExs[i].id);
      });
    });
  }

  function renderExSheet() {
    var grid = document.getElementById("ex-grid");
    var filtered = exFilter === "all" ? exercises : exercises.filter(function (e) { return e.tag === exFilter; });
    grid.innerHTML = "";
    if (filtered.length === 0) {
      grid.innerHTML = '<div class="ex-empty"><i class="fas fa-dumbbell"></i><p>Nenhum exercício' + (exFilter !== "all" ? " nesta categoria" : "") + ".<br>Adicione o primeiro!</p></div>";
      return;
    }
    filtered.forEach(function (ex) {
      var card = document.createElement("div");
      card.className = "ex-card";
      var imgHtml = safeUrl(ex.image) ? '<div class="ex-card-img"><img src="' + esc(safeUrl(ex.image)) + '" alt="' + esc(ex.name) + '"></div>' : '<div class="ex-card-img placeholder">' + getExEmoji(ex.tag) + "</div>";
      var daysLabel = (ex.days || []).map(function (d) { return DAYS_PT[d]; }).join(", ") || "—";
      card.innerHTML = imgHtml +
        '<div class="ex-card-body">' +
        '<div class="ex-card-name">' + esc(ex.name) + "</div>" +
        '<span class="ex-card-tag tag-' + esc(ex.tag) + '">' + esc(TAG_LABELS[ex.tag]) + "</span>" +
        '<div class="ex-card-sets">' + esc(getExerciseSummary(ex)) + ' <span style="color:var(--muted)">' + daysLabel + "</span></div>" +
        "</div>" +
        '<button class="ex-card-del" data-id="' + esc(ex.id) + '"><i class="fas fa-times"></i></button>';
      card.addEventListener("click", function (e) { if (e.target.closest(".ex-card-del")) return; renderExerciseHub(ex.id); });
      grid.appendChild(card);
    });

    grid.querySelectorAll(".ex-card-del").forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        if (!window.confirm("Excluir exercício?")) return;
        exercises = exercises.filter(function (x) { return x.id !== btn.dataset.id; });
        delete exerciseHistory[btn.dataset.id];
        save();
        renderAll();
        toast("Exercício removido.", "info");
      });
    });
  }

  function openExModal(id) {
    editExId = id || null;
    exImageData = "";
    var ex = id ? exercises.find(function (x) { return x.id === id; }) : null;
    document.getElementById("modal-ex-title").textContent = ex ? "Editar Exercício" : "Novo Exercício";
    document.getElementById("ex-del-btn").style.display = ex ? "inline-flex" : "none";
    document.getElementById("btn-save-ex").innerHTML = ex ? '<i class="fas fa-save"></i> Salvar' : '<i class="fas fa-plus"></i> Adicionar';

    setExerciseImagePreview(ex && ex.image ? ex.image : "");
    document.getElementById("ex-img-web").value = ex && ex.image && /^https?:\/\//i.test(ex.image) ? ex.image : "";

    document.getElementById("ex-name").value = ex ? ex.name : "";
    document.getElementById("ex-tag").value = ex ? ex.tag : "peito";
    document.getElementById("ex-sets").value = ex ? ex.sets || "" : "";
    document.getElementById("ex-reps").value = ex ? ex.reps || "" : "";
    document.getElementById("ex-cardio-type").value = ex ? ex.cardioType || "walk" : "walk";
    document.getElementById("ex-distance").value = ex ? ex.distance || "" : "";
    document.getElementById("ex-duration").value = ex ? ex.duration || "" : "";
    document.getElementById("ex-intensity").value = ex ? ex.intensity || "moderate" : "moderate";
    document.getElementById("ex-load").value = ex ? ex.load || "" : "";
    document.getElementById("ex-notes").value = ex ? ex.notes || "" : "";

    setExerciseDaySelection(ex ? (ex.days || []) : []);
    syncExerciseFormMode();

    openModal("modal-ex");
  }

  function renderAll() {
    renderProfile();
    renderWeightStats();
    setTimeout(drawWeightChart, 60);
    renderDiet();
    renderDayWorkout();
    renderExSheet();
  }

  function bindEvents() {
    document.getElementById("profile-photo-trigger").addEventListener("click", function () {
      document.getElementById("profile-photo-input").click();
    });
    document.getElementById("profile-photo-input").addEventListener("change", function (e) {
      var file = e.target.files[0];
      if (!file) return;
      var r = new FileReader();
      r.onload = function () {
        profile.photo = String(r.result || "");
        var img = document.getElementById("profile-photo-img");
        img.src = profile.photo;
        img.className = "loaded";
        document.getElementById("profile-photo-placeholder").style.display = "none";
        save();
        toast("Foto atualizada!", "ok");
      };
      r.readAsDataURL(file);
      e.target.value = "";
    });

    document.getElementById("btn-update-weight").addEventListener("click", function () {
      var v = parseFloat(document.getElementById("weight-input").value);
      if (!v || v < 30 || v > 400) { toast("Valor inválido.", "err"); return; }
      weightLog.push({ date: todayStr(), weight: v });
      save();
      renderWeightStats();
      setTimeout(drawWeightChart, 60);
      toast("Peso atualizado: " + v + "kg", "ok");
    });

    document.getElementById("train-days").addEventListener("click", function (e) {
      var btn = e.target.closest(".day-pill");
      if (!btn) return;
      var d = parseInt(btn.dataset.day, 10);
      var idx = profile.trainDays.indexOf(d);
      if (idx >= 0) profile.trainDays.splice(idx, 1);
      else profile.trainDays.push(d);
      save();
      renderProfile();
      renderDayWorkout();
    });

    document.getElementById("btn-edit-profile").addEventListener("click", function () {
      document.getElementById("p-name").value = profile.name || "";
      document.getElementById("p-age").value = profile.age || "";
      document.getElementById("p-height").value = profile.height || "";
      document.getElementById("p-goal-weight").value = profile.goalWeight || "";
      document.getElementById("p-kcal-goal").value = profile.kcalGoal || 2000;
      openModal("modal-profile");
    });

    document.getElementById("btn-save-profile").addEventListener("click", function () {
      profile.name = document.getElementById("p-name").value.trim() || profile.name;
      profile.age = parseInt(document.getElementById("p-age").value, 10) || profile.age;
      profile.height = parseFloat(document.getElementById("p-height").value) || profile.height;
      profile.goalWeight = parseFloat(document.getElementById("p-goal-weight").value) || profile.goalWeight;
      profile.kcalGoal = parseInt(document.getElementById("p-kcal-goal").value, 10) || 2000;
      save();
      renderAll();
      closeModal("modal-profile");
      toast("Perfil salvo!", "ok");
    });

    document.getElementById("btn-add-ex2").addEventListener("click", function () { openExModal(null); });
    document.getElementById("gym-hub-edit-btn").addEventListener("click", function () {
      if (!exerciseHubId) return;
      closeModal("exercise-hub");
      openExModal(exerciseHubId);
    });
    document.getElementById("ex-days").addEventListener("click", function (e) {
      var chip = e.target.closest(".ex-day-chip");
      if (!chip) return;
      chip.classList.toggle("active");
    });
    ["ex-tag", "ex-sets", "ex-cardio-type", "ex-distance", "ex-duration", "ex-intensity"].forEach(function (id) {
      var field = document.getElementById(id);
      if (!field) return;
      field.addEventListener("input", id === "ex-tag" ? syncExerciseFormMode : renderExerciseCaloriePreview);
      field.addEventListener("change", id === "ex-tag" ? syncExerciseFormMode : renderExerciseCaloriePreview);
    });

    document.getElementById("ex-img-preview").addEventListener("click", function () {
      document.getElementById("ex-img-input").click();
    });
    document.getElementById("ex-img-input").addEventListener("change", function (e) {
      var file = e.target.files[0];
      if (!file) return;
      var r = new FileReader();
      r.onload = function () {
        setExerciseImagePreview(String(r.result || ""));
        document.getElementById("ex-img-web").value = "";
      };
      r.readAsDataURL(file);
      e.target.value = "";
    });
    document.getElementById("btn-use-ex-img-web").addEventListener("click", applyExerciseWebImage);
    document.getElementById("ex-img-web").addEventListener("keydown", function (e) {
      if (e.key !== "Enter") return;
      e.preventDefault();
      applyExerciseWebImage();
    });

    document.getElementById("btn-save-ex").addEventListener("click", function () {
      var name = document.getElementById("ex-name").value.trim();
      if (!name) { toast("Insira um nome.", "err"); return; }
      var days = getExerciseDaySelection();
      var tag = document.getElementById("ex-tag").value;
      if (tag === "cardio" && !getPositiveNumber(document.getElementById("ex-distance").value)) {
        toast("Informe a distância em km.", "err");
        return;
      }
      if (tag === "cardio" && !getPositiveNumber(document.getElementById("ex-duration").value)) {
        toast("Informe o tempo da atividade.", "err");
        return;
      }
      var current = editExId ? (exercises.find(function (x) { return x.id === editExId; }) || {}) : {};
      var ex = {
        id: editExId || uid(),
        name: name,
        tag: tag,
        days: days,
        sets: document.getElementById("ex-sets").value,
        reps: document.getElementById("ex-reps").value,
        cardioType: tag === "cardio" ? document.getElementById("ex-cardio-type").value : "",
        distance: tag === "cardio" ? document.getElementById("ex-distance").value : "",
        duration: tag === "cardio" ? document.getElementById("ex-duration").value : "",
        intensity: tag === "cardio" ? document.getElementById("ex-intensity").value : "moderate",
        load: document.getElementById("ex-load").value,
        notes: document.getElementById("ex-notes").value.trim(),
        image: exImageData || current.image || ""
      };
      if (editExId) {
        var idx = exercises.findIndex(function (x) { return x.id === editExId; });
        if (idx >= 0) exercises[idx] = ex;
        toast("Exercício atualizado!", "ok");
      } else {
        exercises.push(ex);
        toast("Exercício adicionado!", "ok");
      }
      save();
      renderAll();
      closeModal("modal-ex");
    });

    document.getElementById("ex-del-btn").addEventListener("click", function () {
      if (!editExId) return;
      if (!window.confirm("Excluir exercício?")) return;
      exercises = exercises.filter(function (x) { return x.id !== editExId; });
      delete exerciseHistory[editExId];
      save();
      renderAll();
      closeModal("modal-ex");
      toast("Exercício removido.", "info");
    });

    document.getElementById("btn-save-meal").addEventListener("click", function () {
      var name = document.getElementById("meal-item-name").value.trim();
      if (!name) { toast("Insira o nome do alimento.", "err"); return; }
      var m = document.getElementById("meal-target").value;
      if (!diet[m]) diet[m] = [];
      diet[m].push({
        name: name,
        qty: document.getElementById("meal-item-qty").value.trim(),
        kcal: parseInt(document.getElementById("meal-item-kcal").value, 10) || 0
      });
      save();
      renderDiet();
      closeModal("modal-meal");
      toast("Alimento adicionado!", "ok");
    });

    document.getElementById("ex-filters").addEventListener("click", function (e) {
      var chip = e.target.closest(".ex-filter-chip");
      if (!chip) return;
      document.querySelectorAll(".ex-filter-chip").forEach(function (c) { c.classList.remove("active"); });
      chip.classList.add("active");
      exFilter = chip.dataset.tag;
      renderExSheet();
    });

    document.querySelectorAll("[data-close]").forEach(function (btn) {
      btn.addEventListener("click", function () { closeModal(this.dataset.close); });
    });
    document.querySelectorAll(".overlay").forEach(function (ov) {
      ov.addEventListener("click", function (e) { if (e.target === ov) ov.classList.remove("open"); });
    });
    document.addEventListener("click", function (e) {
      var profileBtn = e.target.closest("#btn-edit-profile");
      if (profileBtn) {
        document.getElementById("p-name").value = profile.name || "";
        document.getElementById("p-age").value = profile.age || "";
        document.getElementById("p-height").value = profile.height || "";
        document.getElementById("p-goal-weight").value = profile.goalWeight || "";
        document.getElementById("p-kcal-goal").value = profile.kcalGoal || 2000;
        openModal("modal-profile");
      }
    });

    window.addEventListener("resize", function () {
      setTimeout(drawWeightChart, 60);
      if (exerciseHubId && document.getElementById("exercise-hub").classList.contains("open")) {
        setTimeout(function () { drawExerciseHubChart(exerciseHubId); }, 60);
      }
    });
  }

  window.addEventListener("pageshow", function (event) {
    if (!event.persisted) return;
    loadAll();
    renderAll();
  });
  // dados da nuvem chegaram depois da abertura: relê para não regravar a lista antiga
  window.addEventListener("soter:remote-state-applied", function () {
    loadAll();
    renderAll();
  });

  loadAll();
  bindEvents();
  renderAll();
}());
