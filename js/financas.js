(function () {
  "use strict";

  var STORAGE_KEY = "fin-txs";
  var DATA_KEY = "financasTracker";
  var editId = null;
  var calYear;
  var calMonth;
  var chartView = "month";
  var txFilter = "all";
  var txType = "in";
  var txs = [];
  var savingsGoal = 0;
  var categorySets = null;
  var recurrenceRules = [];
  var editRuleId = null;
  var savingsAnalyticsModel = null;

  // Caixinhas: cada aporte/retirada pertence a uma caixinha (tx.boxId / rule.boxId).
  // Lançamentos antigos, sem caixinha, caem na caixinha padrão "Poupança".
  var DEFAULT_BOX_ID = "poupanca";
  var savingsBoxes = [];
  var boxView = { tab: "active", query: "", sort: "featured", screen: "list", detailId: null, editId: null };
  var BOX_FEATURED_LIMIT = 3;
  var BOX_EMOJIS = ["\uD83C\uDFE6", "\uD83D\uDEDF", "\u2708\uFE0F", "\uD83C\uDFE0", "\uD83D\uDE97", "\uD83C\uDF93", "\uD83D\uDC8D", "\uD83C\uDF81", "\uD83D\uDCBB", "\uD83D\uDCF1", "\uD83C\uDFD6\uFE0F", "\uD83D\uDC36", "\uD83C\uDFAE", "\uD83D\uDCB0", "\uD83E\uDE7A", "\u2764\uFE0F"];
  var BOX_COLORS = ["#c8a96e", "#5ec4a8", "#7c6fcd", "#4ab0e8", "#e06b8b", "#e8864a", "#4ade80", "#f5c2e7"];

  // Interações do calendário: seleção múltipla, arraste e cópia.
  // IDs sempre apontam para transações-base, não para instâncias visuais de recorrência.
  var finCalSelection = {
    ids: new Set(),
    boxActive: false,
    justBoxSelected: false,
    justDragged: false,
    pointerCardId: null,
    pointerStartX: 0,
    pointerStartY: 0,
    pointerDragging: false,
    sourceId: null,
    sourceDate: null,
    sourceTx: null,
    sourceIsRule: false,
    dragIds: [],
    copyOnDrag: false,
    hoverDate: null
  };
  var finCalPointerState = null;
  var finCalDragGhost = null;

  var DEFAULT_CATEGORY_SETS = {
    in: ["Sal\u00e1rio", "Freelance", "Investimento", "Presente", "Outros"],
    out: ["Alimenta\u00e7\u00e3o", "Moradia", "Transporte", "Sa\u00fade", "Lazer", "Educa\u00e7\u00e3o", "Assinaturas", "Roupas", "Eletr\u00f4nicos", "Outros"],
    save: ["Poupan\u00e7a"]
  };

  var CAT_COLORS = {
    "Sal\u00e1rio": "#5ec4a8",
    "Freelance": "#4ab0e8",
    "Investimento": "#c8a96e",
    "Presente": "#cba6f7",
    "Alimenta\u00e7\u00e3o": "#e06b8b",
    "Moradia": "#e8864a",
    "Transporte": "#f9e2af",
    "Sa\u00fade": "#f38ba8",
    "Lazer": "#89b4fa",
    "Educa\u00e7\u00e3o": "#a6e3a1",
    "Assinaturas": "#94e2d5",
    "Roupas": "#f5c2e7",
    "Eletr\u00f4nicos": "#7c6fcd",
    "Poupan\u00e7a": "#c8a96e",
    "Outros": "#858099"
  };

  var CAT_ICONS = {
    "Sal\u00e1rio": "\uD83D\uDCBC",
    "Freelance": "\uD83D\uDCBB",
    "Investimento": "\uD83D\uDCC8",
    "Presente": "\uD83C\uDF81",
    "Alimenta\u00e7\u00e3o": "\uD83C\uDF7D\uFE0F",
    "Moradia": "\uD83C\uDFE0",
    "Transporte": "\uD83D\uDE97",
    "Sa\u00fade": "\uD83C\uDFE5",
    "Lazer": "\uD83C\uDFAE",
    "Educa\u00e7\u00e3o": "\uD83D\uDCDA",
    "Assinaturas": "\uD83D\uDCE6",
    "Roupas": "\uD83D\uDC55",
    "Eletr\u00f4nicos": "\uD83D\uDCF1",
    "Poupan\u00e7a": "\uD83C\uDFE6",
    "Outros": "\uD83D\uDCCC"
  };

  var MONTHS_PT = ["Janeiro", "Fevereiro", "Mar\u00e7o", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
  var DAYS_PT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "S\u00e1b"];

  function getState() {
    if (window.SoterStorage && window.SoterStorage.getState) return window.SoterStorage.getState();
    return { data: {} };
  }

  function saveState(nextState) {
    if (window.SoterStorage && window.SoterStorage.save) window.SoterStorage.save(nextState);
  }

  function loadData() {
    var state = getState();
    var data = state.data || {};
    if (data[DATA_KEY] && Array.isArray(data[DATA_KEY].txs)) {
      txs = data[DATA_KEY].txs.slice();
      savingsGoal = Number(data[DATA_KEY].savingsGoal || 0);
      categorySets = normalizeCategorySets(data[DATA_KEY].categorySets);
      recurrenceRules = normalizeRecurrenceRules(data[DATA_KEY].recurrenceRules);
      savingsBoxes = normalizeSavingsBoxes(data[DATA_KEY].savingsBoxes, savingsGoal);
      reconcileSavingsBoxes();
      return;
    }
    if (Array.isArray(data.financas)) {
      txs = data.financas.slice();
      savingsGoal = Number(data.financasSavingsGoal || 0);
      categorySets = normalizeCategorySets(data.financasCategorySets);
      recurrenceRules = normalizeRecurrenceRules(data.financasRecurrenceRules);
      savingsBoxes = normalizeSavingsBoxes(null, savingsGoal);
      reconcileSavingsBoxes();
      persist();
      return;
    }
    // conta (ou visitante) sem finanças: começa vazio — nunca herda o que estava na tela
    txs = [];
    savingsGoal = 0;
    categorySets = normalizeCategorySets();
    recurrenceRules = normalizeRecurrenceRules();
    savingsBoxes = normalizeSavingsBoxes();
  }

  function persist() {
    var state = getState();
    if (!state.data || typeof state.data !== "object") state.data = {};
    savingsGoal = getActiveBoxesGoal();
    state.data[DATA_KEY] = { txs: txs.slice(), savingsGoal: savingsGoal, savingsBoxes: cloneRecurrenceRules(savingsBoxes), categorySets: cloneCategorySets(categorySets), recurrenceRules: cloneRecurrenceRules(recurrenceRules) };
    state.data.financas = txs.slice();
    state.data.financasSavingsGoal = savingsGoal;
    state.data.financasCategorySets = cloneCategorySets(categorySets);
    state.data.financasRecurrenceRules = cloneRecurrenceRules(recurrenceRules);
    state.data.lastVisitedPage = "financas";
    state.data.lastVisitedAt = new Date().toISOString();
    saveState(state);
  }

  function cloneCategorySets(source) {
    return {
      in: source.in.slice(),
      out: source.out.slice(),
      save: source.save.slice()
    };
  }

  function cloneRecurrenceRules(source) {
    return (source || []).map(function (rule) {
      return JSON.parse(JSON.stringify(rule));
    });
  }

  function normalizeRecurrenceRules(source) {
    return (Array.isArray(source) ? source : []).map(function (rule) {
      return {
        id: rule.id || uid(),
        name: String(rule.name || "").trim() || "Nova recorrência",
        description: String(rule.description || "").trim(),
        note: String(rule.note || "").trim(),
        startDate: String(rule.startDate || today()),
        type: rule.type === "out" || rule.type === "save" || rule.type === "save_withdraw" ? rule.type : "in",
        value: Number(rule.value || 0),
        category: String(rule.category || ""),
        pattern: rule.pattern === "fixed_day" ? "fixed_day" : "nth_counted_day",
        nth: Math.max(1, Number(rule.nth || 5)),
        countSaturday: !!rule.countSaturday,
        avoidHoliday: rule.avoidHoliday !== false,
        shift: rule.shift === "next_business_day" ? "next_business_day" : "previous_business_day",
        day: Math.max(1, Number(rule.day || 20)),
        avoidWeekend: rule.avoidWeekend !== false,
        fixedAvoidHoliday: !!rule.fixedAvoidHoliday,
        holidays: Array.isArray(rule.holidays) ? rule.holidays.filter(Boolean) : [],
        boxId: String(rule.boxId || "")
      };
    });
  }

  function normalizeSavingsBoxes(source, legacyGoal) {
    var seen = {};
    var boxes = (Array.isArray(source) ? source : []).map(function (box, index) {
      var id = String(box && box.id || "") || uid();
      return {
        id: id,
        name: String(box.name || "").trim() || "Caixinha",
        emoji: String(box.emoji || "") || BOX_EMOJIS[0],
        color: /^#[0-9a-f]{6}$/i.test(String(box.color || "")) ? box.color : BOX_COLORS[index % BOX_COLORS.length],
        goal: Math.max(0, cents(box.goal)),
        deadline: /^\d{4}-\d{2}-\d{2}$/.test(String(box.deadline || "")) ? box.deadline : "",
        note: String(box.note || "").trim(),
        pinned: !!box.pinned,
        archived: !!box.archived,
        createdAt: String(box.createdAt || today())
      };
    }).filter(function (box) {
      if (seen[box.id]) return false;
      seen[box.id] = true;
      return true;
    });
    // primeira vez (ou dados antigos): a poupança única vira a caixinha padrão, com a meta que já existia
    if (!boxes.length) {
      boxes.push({
        id: DEFAULT_BOX_ID,
        name: "Poupan\u00e7a",
        emoji: BOX_EMOJIS[0],
        color: BOX_COLORS[0],
        goal: Math.max(0, cents(legacyGoal)),
        deadline: "",
        note: "",
        pinned: true,
        archived: false,
        createdAt: today()
      });
    }
    return boxes;
  }

  // Garante que todo aporte/retirada aponte para uma caixinha existente.
  function reconcileSavingsBoxes() {
    var fallback = savingsBoxes[0].id;
    txs.forEach(function (tx) {
      if (isSavingsType(tx.type) && !getBoxById(tx.boxId)) tx.boxId = fallback;
    });
    recurrenceRules.forEach(function (rule) {
      if (isSavingsType(rule.type) && !getBoxById(rule.boxId)) rule.boxId = fallback;
    });
  }

  function getBoxById(id) {
    if (!id) return null;
    for (var i = 0; i < savingsBoxes.length; i += 1) {
      if (savingsBoxes[i].id === id) return savingsBoxes[i];
    }
    return null;
  }

  function getTxBoxId(tx) {
    if (!tx) return "";
    return getBoxById(tx.boxId) ? tx.boxId : (savingsBoxes[0] ? savingsBoxes[0].id : "");
  }

  function matchesBox(tx, boxId) {
    return !boxId || getTxBoxId(tx) === boxId;
  }

  function getActiveBoxesGoal() {
    return cents(savingsBoxes.reduce(function (sum, box) {
      return sum + (box.archived ? 0 : Number(box.goal || 0));
    }, 0));
  }

  function normalizeCategorySets(source) {
    var base = source || {};
    var next = {
      in: Array.isArray(base.in) && base.in.length ? base.in.slice() : DEFAULT_CATEGORY_SETS.in.slice(),
      out: Array.isArray(base.out) && base.out.length ? base.out.slice() : DEFAULT_CATEGORY_SETS.out.slice(),
      save: ["Poupan\u00e7a"]
    };
    if (next.in.indexOf("Outros") === -1) next.in.push("Outros");
    if (next.out.indexOf("Outros") === -1) next.out.push("Outros");
    return next;
  }

  function getCategoriesForType(type) {
    if (!categorySets) categorySets = normalizeCategorySets();
    return (categorySets[getCategorySetKey(type)] || DEFAULT_CATEGORY_SETS[getCategorySetKey(type)] || []).slice();
  }

  function getCategorySetKey(type) {
    return isSavingsType(type) ? "save" : type;
  }

  function isSavingsType(type) {
    return type === "save" || type === "save_withdraw";
  }

  // dinheiro em reais com 2 casas: soma de floats (0,70 + 0,10 = 0,7999…) não pode decidir comparação
  function cents(value) {
    return Math.round(Number(value || 0) * 100) / 100;
  }

  function getSavingsDelta(tx) {
    if (!tx) return 0;
    if (tx.type === "save") return Number(tx.value || 0);
    if (tx.type === "save_withdraw") return -Number(tx.value || 0);
    return 0;
  }

  function getTxClass(type) {
    if (type === "save_withdraw") return "save-withdraw";
    return type === "in" ? "in" : type === "save" ? "save" : "out";
  }

  function getTxSign(type) {
    return getTxDelta({ type: type, value: 1 }) >= 0 ? "+" : "-";
  }

  function getTxDelta(tx) {
    if (tx.type === "in") return Number(tx.value);
    if (tx.type === "save_withdraw") return Number(tx.value);
    if (tx.type === "out" || tx.type === "save") return -Number(tx.value);
    return 0;
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2);
  }

  function fmtR(value) {
    return "R$ " + Number(value || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function fmtD(dateStr) {
    if (!dateStr) return "";
    var parts = String(dateStr).split("-");
    return esc(parts[2] + "/" + parts[1] + "/" + parts[0]);
  }

  // Escapa texto digitado pelo usuário antes de inseri-lo em HTML (evita injeção de scripts).
  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  // Data local (AAAA-MM-DD): toISOString() usa UTC e adianta o dia no Brasil a partir das 21h.
  function today() {
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  function diffDays(dateA, dateB) {
    return Math.round((new Date(dateB + "T12:00:00").getTime() - new Date(dateA + "T12:00:00").getTime()) / 86400000);
  }

  function nowYM() {
    var date = new Date();
    return { y: date.getFullYear(), m: date.getMonth() };
  }

  function isFuture(tx) {
    return !!(tx.date > today());
  }

  function isHoliday(dateStr, holidays) {
    return (holidays || []).indexOf(dateStr) >= 0;
  }

  function getMonthDateStr(year, month, day) {
    return year + "-" + String(month + 1).padStart(2, "0") + "-" + String(day).padStart(2, "0");
  }

  function isCountableBusinessDay(dateObj, countSaturday, holidays) {
    var dayOfWeek = dateObj.getDay();
    var dateStr = getMonthDateStr(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate());
    if (isHoliday(dateStr, holidays)) return false;
    if (dayOfWeek === 0) return false;
    if (dayOfWeek === 6) return !!countSaturday;
    return true;
  }

  function isReceivableBusinessDay(dateObj, holidays) {
    var dayOfWeek = dateObj.getDay();
    var dateStr = getMonthDateStr(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate());
    if (isHoliday(dateStr, holidays)) return false;
    return dayOfWeek !== 0 && dayOfWeek !== 6;
  }

  function shiftToBusinessDay(dateObj, direction, holidays) {
    var next = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate());
    var step = direction === "next_business_day" ? 1 : -1;
    while (!isReceivableBusinessDay(next, holidays)) {
      next.setDate(next.getDate() + step);
    }
    return next;
  }

  function buildNthCountedDay(rule, year, month) {
    var lastDay = new Date(year, month + 1, 0).getDate();
    var count = 0;
    var candidate = null;
    var day;
    for (day = 1; day <= lastDay; day += 1) {
      var dateObj = new Date(year, month, day);
      if (!isCountableBusinessDay(dateObj, rule.countSaturday, rule.holidays)) continue;
      count += 1;
      if (count >= rule.nth) {
        candidate = dateObj;
        break;
      }
    }
    if (!candidate) candidate = new Date(year, month, lastDay);
    if (!isReceivableBusinessDay(candidate, rule.holidays)) {
      candidate = shiftToBusinessDay(candidate, rule.shift, rule.holidays);
    }
    return getMonthDateStr(candidate.getFullYear(), candidate.getMonth(), candidate.getDate());
  }

  function buildFixedDay(rule, year, month) {
    var lastDay = new Date(year, month + 1, 0).getDate();
    var candidate = new Date(year, month, Math.min(rule.day, lastDay));
    var needsShift = false;
    if (rule.avoidWeekend && (candidate.getDay() === 0 || candidate.getDay() === 6)) needsShift = true;
    if (rule.fixedAvoidHoliday && isHoliday(getMonthDateStr(year, month, candidate.getDate()), rule.holidays)) needsShift = true;
    if (needsShift) candidate = shiftToBusinessDay(candidate, rule.shift, rule.holidays);
    return getMonthDateStr(candidate.getFullYear(), candidate.getMonth(), candidate.getDate());
  }

  function buildRuleDate(rule, year, month) {
    return rule.pattern === "fixed_day" ? buildFixedDay(rule, year, month) : buildNthCountedDay(rule, year, month);
  }

  // O ajuste para dia útil pode jogar a ocorrência para o mês vizinho (dia 1 num sábado com "dia
  // útil anterior" cai no fim do mês anterior). Por isso olha as ocorrências do mês anterior, do
  // próprio mês e do seguinte e fica só com as que caem neste mês.
  function getRuleDatesInMonth(rule, year, month) {
    var monthKey = getMonthDateStr(year, month, 1).slice(0, 7);
    var dates = [];
    [-1, 0, 1].forEach(function (offset) {
      var ref = new Date(year, month + offset, 1);
      var date = buildRuleDate(rule, ref.getFullYear(), ref.getMonth());
      if (date.slice(0, 7) === monthKey && dates.indexOf(date) < 0) dates.push(date);
    });
    return dates;
  }

  function getRuleOccurrencesForMonth(year, month) {
    var occurrences = [];
    recurrenceRules.filter(function (rule) {
      return !!rule && Number(rule.value) > 0;
    }).forEach(function (rule) {
      getRuleDatesInMonth(rule, year, month).forEach(function (date) {
        if (date < rule.startDate) return;
        occurrences.push(buildRuleOccurrence(rule, date));
      });
    });
    return occurrences;
  }

  function buildRuleOccurrence(rule, date) {
    return {
      id: rule.id + "_rule_" + date,
      _ruleId: rule.id,
      _source: "rule",
      date: date,
      type: rule.type,
      description: rule.description || rule.name,
      value: Number(rule.value),
      category: rule.category || (isSavingsType(rule.type) ? "Poupança" : "Outros"),
      recurrence: "rule",
      future: date > today(),
      note: rule.note || "",
      boxId: rule.boxId || ""
    };
  }

  function getRuleOccurrencesUntil(endDate) {
    if (!recurrenceRules.length) return [];
    var end = new Date(endDate + "T12:00:00");
    var startYear = end.getFullYear() - 2;
    var startMonth = 0;
    recurrenceRules.forEach(function (rule) {
      if (!rule || !rule.startDate) return;
      var start = new Date(rule.startDate + "T12:00:00");
      if (start.getFullYear() < startYear) {
        startYear = start.getFullYear();
        startMonth = start.getMonth();
      } else if (start.getFullYear() === startYear) {
        startMonth = Math.min(startMonth, start.getMonth());
      }
    });
    var occurrences = [];
    var year = startYear;
    var month = startMonth;
    while (year < end.getFullYear() || (year === end.getFullYear() && month <= end.getMonth())) {
      Array.prototype.push.apply(occurrences, getRuleOccurrencesForMonth(year, month));
      month += 1;
      if (month > 11) {
        month = 0;
        year += 1;
      }
    }
    return occurrences.filter(function (tx) { return tx.date <= endDate; });
  }

  function hexToRgb(hex) {
    var r = parseInt(hex.slice(1, 3), 16);
    var g = parseInt(hex.slice(3, 5), 16);
    var b = parseInt(hex.slice(5, 7), 16);
    return r + "," + g + "," + b;
  }

  function toast(msg, type) {
    type = type || "ok";
    var icons = { ok: "ico-circle-check", err: "ico-circle-alert", info: "ico-info" };
    var cols = { ok: "var(--fin-teal)", err: "var(--fin-rose)", info: "var(--fin-sky)" };
    var container = document.getElementById("toasts");
    if (!container) return;
    var el = document.createElement("div");
    el.className = "fin-toast " + type;
    el.innerHTML = '<i class="ico ' + icons[type] + '" style="color:' + cols[type] + '" aria-hidden="true"></i> ' + msg;
    container.appendChild(el);
    setTimeout(function () {
      el.style.animation = "fin-tOut .3s ease forwards";
      setTimeout(function () { el.remove(); }, 300);
    }, 2800);
  }

  // Ocorrências mensais a partir da data-âncora, sem deriva: o dia original é preservado
  // e, em meses mais curtos, usa o último dia do mês (ex.: dia 31 -> 28/29 em fevereiro, 30 em abril).
  function getMonthlyOccurrenceDates(startStr, endStr) {
    var out = [];
    var year = Number(String(startStr).slice(0, 4));
    var month = Number(String(startStr).slice(5, 7)) - 1;
    var day = Number(String(startStr).slice(8, 10));
    if (!year || !(month >= 0 && month <= 11) || !day) return out;
    var guard = 0;
    while (guard < 2400) {
      guard += 1;
      var lastDay = new Date(year, month + 1, 0).getDate();
      var dateStr = year + "-" + String(month + 1).padStart(2, "0") + "-" + String(Math.min(day, lastDay)).padStart(2, "0");
      if (dateStr > endStr) break;
      out.push(dateStr);
      month += 1;
      if (month > 11) { month = 0; year += 1; }
    }
    return out;
  }

  function expandRecurring(year, month) {
    var result = [];
    txs.forEach(function (tx) {
      var baseDate = new Date(tx.date + "T12:00:00");
      var txYear = baseDate.getFullYear();
      var txMonth = baseDate.getMonth();

      if (tx.recurrence === "monthly") {
        if (year > txYear || (year === txYear && month >= txMonth)) {
          var monthlyDay = Math.min(baseDate.getDate(), new Date(year, month + 1, 0).getDate());
          var monthlyDate = year + "-" + String(month + 1).padStart(2, "0") + "-" + String(monthlyDay).padStart(2, "0");
          result.push(Object.assign({}, tx, {
            date: monthlyDate,
            id: tx.id + "_" + year + "_" + month,
            _original: tx.id,
            future: monthlyDate > today()
          }));
        }
      } else if (tx.recurrence === "weekly") {
        var cur = new Date(tx.date + "T12:00:00");
        var firstOfMonth = new Date(year, month, 1);
        var lastOfMonth = new Date(year, month + 1, 0, 23, 59, 59); // cur fica às 12h: o último dia conta
        while (cur < firstOfMonth) cur.setDate(cur.getDate() + 7);
        while (cur <= lastOfMonth) {
          var weeklyDate = cur.getFullYear() + "-" + String(cur.getMonth() + 1).padStart(2, "0") + "-" + String(cur.getDate()).padStart(2, "0");
          result.push(Object.assign({}, tx, {
            date: weeklyDate,
            id: tx.id + "_w_" + weeklyDate,
            _original: tx.id,
            future: weeklyDate > today()
          }));
          cur.setDate(cur.getDate() + 7);
        }
      } else if (txYear === year && txMonth === month) {
        result.push(tx);
      }
    });
    Array.prototype.push.apply(result, getRuleOccurrencesForMonth(year, month));
    return result;
  }

  // Percorre cada ocorrência de aporte/retirada (únicos, mensais, semanais e regras) até endStr.
  function forEachSavingsOccurrenceUntil(endStr, fn) {
    txs.forEach(function (tx) {
      if (!isSavingsType(tx.type)) return;
      if (tx.recurrence === "monthly") {
        getMonthlyOccurrenceDates(tx.date, endStr).forEach(function (occurrenceDate) {
          fn(tx, occurrenceDate);
        });
      } else if (tx.recurrence === "weekly") {
        var weeklyCur = new Date(tx.date + "T12:00:00");
        var endWeekly = new Date(endStr + "T12:00:00");
        while (weeklyCur <= endWeekly) {
          fn(tx, getMonthDateStr(weeklyCur.getFullYear(), weeklyCur.getMonth(), weeklyCur.getDate()));
          weeklyCur.setDate(weeklyCur.getDate() + 7);
        }
      } else if (tx.date <= endStr) {
        fn(tx, tx.date);
      }
    });
    getRuleOccurrencesUntil(endStr).forEach(function (tx) {
      if (isSavingsType(tx.type)) fn(tx, tx.date);
    });
  }

  function getSavingsBalanceUntil(dateStr, ignoreTxId, boxId) {
    var balance = 0;
    forEachSavingsOccurrenceUntil(dateStr, function (tx) {
      if (ignoreTxId && tx.id === ignoreTxId) return;
      if (!matchesBox(tx, boxId)) return;
      balance += getSavingsDelta(tx);
    });
    return cents(balance);
  }

  // Saldo atual, movimento do mês e última movimentação de cada caixinha.
  function getBoxStats() {
    var todayStr = today();
    var monthKey = todayStr.slice(0, 7);
    var stats = {};
    savingsBoxes.forEach(function (box) {
      stats[box.id] = { balance: 0, month: 0, count: 0, lastDate: "" };
    });
    forEachSavingsOccurrenceUntil(todayStr, function (tx, date) {
      var entry = stats[getTxBoxId(tx)];
      if (!entry) return;
      var delta = getSavingsDelta(tx);
      entry.balance += delta;
      entry.count += 1;
      if (date.slice(0, 7) === monthKey) entry.month += delta;
      if (date > entry.lastDate) entry.lastDate = date;
    });
    Object.keys(stats).forEach(function (id) {
      // saldo real, mesmo negativo: assim a soma das caixinhas sempre bate com o total guardado
      stats[id].balance = cents(stats[id].balance);
      stats[id].month = cents(stats[id].month);
    });
    return stats;
  }

  function getBoxMovements(boxId, limit) {
    var items = [];
    forEachSavingsOccurrenceUntil(today(), function (tx, date) {
      if (!matchesBox(tx, boxId)) return;
      items.push({ tx: tx, date: date, delta: getSavingsDelta(tx) });
    });
    items.sort(function (a, b) { return b.date.localeCompare(a.date); });
    return items.slice(0, limit || 8);
  }

  // Projeção da meta com base nos lançamentos já cadastrados no sistema:
  // aportes e retiradas da poupança (únicos, mensais, semanais e regras recorrentes).
  // Não usa histórico nem média: percorre os lançamentos futuros em ordem de data
  // e encontra o primeiro dia em que o saldo da poupança alcança a meta.
  // Não há limite de meses para lançamentos únicos: qualquer data futura é considerada.
  // Para lançamentos recorrentes (que se repetem para sempre) a busca se amplia em etapas
  // e para assim que a meta é atingida; o teto de 100 anos é só trava contra laço infinito.
  var SAVINGS_SCHEDULE_YEARS_STEPS = [5, 10, 25, 50, 100];
  var SAVINGS_CHART_MAX_POINTS = 36;

  function getSavingsScheduledEvents(startExclusive, endStr, boxId) {
    var events = [];
    function add(date, delta) {
      if (!delta) return;
      if (date <= startExclusive || date > endStr) return;
      events.push({ date: date, delta: delta });
    }
    txs.forEach(function (tx) {
      if (!isSavingsType(tx.type) || !matchesBox(tx, boxId)) return;
      var delta = getSavingsDelta(tx);
      if (tx.recurrence === "monthly") {
        getMonthlyOccurrenceDates(tx.date, endStr).forEach(function (occurrenceDate) {
          add(occurrenceDate, delta);
        });
      } else if (tx.recurrence === "weekly") {
        var weeklyCur = new Date(tx.date + "T12:00:00");
        var endWeekly = new Date(endStr + "T12:00:00");
        while (weeklyCur <= endWeekly) {
          add(getMonthDateStr(weeklyCur.getFullYear(), weeklyCur.getMonth(), weeklyCur.getDate()), delta);
          weeklyCur.setDate(weeklyCur.getDate() + 7);
        }
      } else {
        add(tx.date, delta);
      }
    });
    getRuleOccurrencesUntil(endStr).forEach(function (tx) {
      if (isSavingsType(tx.type) && matchesBox(tx, boxId)) add(tx.date, getSavingsDelta(tx));
    });
    events.sort(function (a, b) { return a.date.localeCompare(b.date); });
    return events;
  }

  function simulateSavingsSchedule(reserve, goal, events) {
    // agrupa por dia (aporte e retirada no mesmo dia se compensam) e aplica na ordem
    var byDate = {};
    var dates = [];
    events.forEach(function (ev) {
      if (!(ev.date in byDate)) { byDate[ev.date] = 0; dates.push(ev.date); }
      byDate[ev.date] += ev.delta;
    });
    var sim = { running: reserve, monthEnd: {}, plannedTotal: 0, plannedCount: 0, etaDate: null, lastEventDate: null };
    var i;
    for (i = 0; i < dates.length; i += 1) {
      var d = dates[i];
      sim.running = Math.max(0, sim.running + byDate[d]);
      sim.plannedTotal += byDate[d];
      sim.plannedCount += 1;
      sim.monthEnd[d.slice(0, 7)] = sim.running;
      sim.lastEventDate = d;
      if (cents(sim.running) >= cents(goal)) { sim.etaDate = d; break; }
    }
    return sim;
  }

  function getSavingsProjection(reserve, goal, boxId) {
    reserve = Number(reserve || 0);
    goal = Number(goal || 0);
    var missing = Math.max(0, cents(goal - reserve));
    var result = {
      mode: "none", missing: missing, monthlyRate: 0, monthsToGoal: null,
      etaDate: null, daysToGoal: null, plannedTotal: 0, plannedCount: 0,
      lastEventDate: null, finalBalance: reserve, series: [], endless: false
    };
    if (goal <= 0) return result;
    if (cents(reserve) >= cents(goal)) {
      result.mode = "reached";
      result.etaDate = today();
      result.daysToGoal = 0;
      result.monthsToGoal = 0;
      result.series = [{ label: "Hoje", value: reserve, current: true }];
      return result;
    }

    var t = new Date(today() + "T12:00:00");
    var hasRecurring = txs.some(function (tx) {
      return isSavingsType(tx.type) && matchesBox(tx, boxId) && (tx.recurrence === "monthly" || tx.recurrence === "weekly");
    }) || recurrenceRules.some(function (rule) {
      return !!rule && isSavingsType(rule.type) && matchesBox(rule, boxId) && Number(rule.value) > 0;
    });
    // sem recorrência, todos os lançamentos são finitos: uma única busca de 100 anos pega qualquer data futura.
    // com recorrência, amplia por etapas e para assim que a meta é atingida.
    var steps = hasRecurring ? SAVINGS_SCHEDULE_YEARS_STEPS : [SAVINGS_SCHEDULE_YEARS_STEPS[SAVINGS_SCHEDULE_YEARS_STEPS.length - 1]];
    var sim = null;
    var s;
    for (s = 0; s < steps.length; s += 1) {
      var horizon = new Date(t.getFullYear() + steps[s], t.getMonth() + 1, 0, 12, 0, 0);
      var horizonStr = getMonthDateStr(horizon.getFullYear(), horizon.getMonth(), horizon.getDate());
      var events = getSavingsScheduledEvents(today(), horizonStr, boxId);
      if (!events.length) return result;
      sim = simulateSavingsSchedule(reserve, goal, events);
      if (sim.etaDate) break;
    }
    if (!sim) return result;
    result.endless = hasRecurring && !sim.etaDate;

    result.finalBalance = sim.running;
    result.plannedTotal = sim.plannedTotal;
    result.plannedCount = sim.plannedCount;
    result.lastEventDate = sim.lastEventDate;

    // série mensal para o gráfico: saldo ao fim de cada mês, de hoje até o mês da meta (ou do último lançamento)
    var lastKey = sim.lastEventDate.slice(0, 7);
    var y = t.getFullYear();
    var m = t.getMonth();
    var carry = reserve;
    var months = [];
    var guard = 0;
    while (guard < 1300) {
      guard += 1;
      var key = y + "-" + String(m + 1).padStart(2, "0");
      if (key in sim.monthEnd) carry = sim.monthEnd[key];
      months.push({
        label: MONTHS_PT[m].slice(0, 3) + "/" + String(y).slice(-2),
        value: Math.min(carry, goal)
      });
      if (key >= lastKey) break;
      m += 1;
      if (m > 11) { m = 0; y += 1; }
    }
    // sem meta à vista, mostra só os primeiros meses; com muitos meses, amostra para manter o gráfico legível
    if (!sim.etaDate && months.length > 60) months = months.slice(0, 60);
    if (months.length > SAVINGS_CHART_MAX_POINTS) {
      var sampled = [];
      var k;
      for (k = 0; k < SAVINGS_CHART_MAX_POINTS; k += 1) {
        sampled.push(months[Math.round(k * (months.length - 1) / (SAVINGS_CHART_MAX_POINTS - 1))]);
      }
      months = sampled;
    }
    result.series = [{ label: "Hoje", value: reserve, current: true }].concat(months);

    if (sim.etaDate) {
      var monthSteps = (Number(sim.etaDate.slice(0, 4)) - t.getFullYear()) * 12 + (Number(sim.etaDate.slice(5, 7)) - 1 - t.getMonth());
      result.mode = "scheduled";
      result.etaDate = sim.etaDate;
      result.daysToGoal = Math.max(1, diffDays(today(), sim.etaDate));
      result.monthsToGoal = Math.max(0, monthSteps);
      result.monthlyRate = sim.plannedTotal / Math.max(1, monthSteps || 1);
    } else {
      result.mode = "insufficient";
    }
    return result;
  }

  function getSavingsPaceEstimate(reserve, goal, boxId) {
    if (goal <= 0) {
      return { summary: "Defina uma meta para calcular a estimativa.", metaLeft: "Meta atual" };
    }
    if (cents(goal - reserve) <= 0) {
      return { summary: "Objetivo concluído. A meta já foi atingida.", metaLeft: "Meta atingida" };
    }
    var p = getSavingsProjection(reserve, goal, boxId);
    if (p.mode === "none") {
      return { summary: "Não há aportes futuros lançados" + (boxId ? " nesta caixinha" : " nas caixinhas") + ". Lance aportes para ver quando a meta será atingida.", metaLeft: "Meta atual" };
    }
    if (p.mode === "insufficient" && p.endless) {
      return {
        summary: "Mesmo repetindo os lançamentos recorrentes por décadas, o saldo não alcança a meta. Aumente os aportes ou reduza as retiradas.",
        metaLeft: "Sem data prevista"
      };
    }
    if (p.mode === "insufficient") {
      return {
        summary: "Os lançamentos até " + fmtD(p.lastEventDate) + " levam o saldo a " + fmtR(p.finalBalance) + ". Ainda faltam " + fmtR(Math.max(0, goal - p.finalBalance)) + " — lance mais aportes para ver a data.",
        metaLeft: "Sem data prevista"
      };
    }
    var qtd = p.plannedCount === 1 ? "1 lançamento" : p.plannedCount + " lançamentos";
    return {
      summary: "Com os " + qtd + " já programados, a meta é atingida em " + fmtD(p.etaDate) + ".",
      metaLeft: "Previsto " + fmtD(p.etaDate)
    };
  }

  function computeStats() {
    var ym = nowYM();
    var monthTxs = expandRecurring(ym.y, ym.m);
    var inAmt = 0;
    var inCount = 0;
    var outAmt = 0;
    var outCount = 0;

    monthTxs.forEach(function (tx) {
      if (tx.type === "in") {
        inAmt += Number(tx.value);
        inCount += 1;
      } else if (tx.type === "out") {
        outAmt += Number(tx.value);
        outCount += 1;
      }
    });

    var saldo = 0;
    var savingsTotal = 0;
    txs.forEach(function (tx) {
      if (tx.recurrence === "monthly") {
        getMonthlyOccurrenceDates(tx.date, today()).forEach(function () {
          saldo += getTxDelta(tx);
          savingsTotal += getSavingsDelta(tx);
        });
      } else if (tx.recurrence === "weekly") {
        var weeklyCur = new Date(tx.date + "T12:00:00");
        var nowWeekly = new Date(today() + "T12:00:00"); // mesma hora de weeklyCur: a ocorrência de hoje conta
        while (weeklyCur <= nowWeekly) {
          saldo += getTxDelta(tx);
          savingsTotal += getSavingsDelta(tx);
          weeklyCur.setDate(weeklyCur.getDate() + 7);
        }
      } else if (!isFuture(tx)) {
        saldo += getTxDelta(tx);
        savingsTotal += getSavingsDelta(tx);
      }
    });
    getRuleOccurrencesUntil(today()).forEach(function (tx) {
      saldo += getTxDelta(tx);
      savingsTotal += getSavingsDelta(tx);
    });

    var proj = saldo;
    monthTxs.forEach(function (tx) {
      if (isFuture(tx)) proj += getTxDelta(tx);
    });

    var eco = inAmt > 0 ? Math.round(((inAmt - outAmt) / inAmt) * 100) : 0;

    document.getElementById("st-saldo").textContent = fmtR(saldo);
    document.getElementById("st-saldo").className = "fin-tile-val " + (inAmt === 0 ? (outAmt > 0 ? "fin-neg" : "fin-pos") : (outAmt > inAmt * 0.4 ? "fin-neg" : "fin-pos"));
    document.getElementById("st-saldo-sub").textContent = saldo >= 0 ? "Positivo" : "Atenção: negativo";
    document.getElementById("st-in").textContent = fmtR(inAmt);
    document.getElementById("st-out").textContent = fmtR(outAmt);
    document.getElementById("st-in-sub").textContent = inCount + " transaç" + (inCount !== 1 ? "ões" : "ão");
    document.getElementById("st-out-sub").textContent = outCount + " transaç" + (outCount !== 1 ? "ões" : "ão");
    document.getElementById("st-proj").textContent = fmtR(proj);
    document.getElementById("st-proj").className = "fin-tile-val " + (proj >= 0 ? "" : "fin-neg");
    document.getElementById("st-eco").textContent = eco + "%";
    document.getElementById("st-eco").style.color = eco >= 20 ? "var(--fin-teal)" : eco >= 0 ? "var(--fin-amber)" : "var(--fin-rose)";
    document.getElementById("st-eco-sub").textContent = eco >= 20 ? "Ótima economia" : eco >= 0 ? "Equilibrado" : "Gastos acima da renda";

    savingsGoal = getActiveBoxesGoal();
    var reserve = Math.max(0, savingsTotal);
    var reservePct = savingsGoal > 0 ? Math.max(0, Math.min(100, Math.round((reserve / savingsGoal) * 100))) : 0;
    var reserveMonth = monthTxs.reduce(function (sum, tx) {
      return sum + getSavingsDelta(tx);
    }, 0);
    var reserveHistory = [];
    txs.forEach(function (tx) {
      if (!isSavingsType(tx.type)) return;
      if (tx.recurrence === "monthly") {
        getMonthlyOccurrenceDates(tx.date, today()).forEach(function (occurrenceDate) {
          reserveHistory.push({ date: occurrenceDate, value: getSavingsDelta(tx) });
        });
      } else if (tx.recurrence === "weekly") {
        var weeklyCur = new Date(tx.date + "T12:00:00");
        var nowWeeklyHistory = new Date(today() + "T12:00:00");
        while (weeklyCur <= nowWeeklyHistory) {
          reserveHistory.push({ date: getMonthDateStr(weeklyCur.getFullYear(), weeklyCur.getMonth(), weeklyCur.getDate()), value: getSavingsDelta(tx) });
          weeklyCur.setDate(weeklyCur.getDate() + 7);
        }
      } else if (tx.date <= today()) {
        reserveHistory.push({ date: tx.date, value: getSavingsDelta(tx) });
      }
    });
    reserveHistory = reserveHistory.concat(getRuleOccurrencesUntil(today()).filter(function (tx) {
      return isSavingsType(tx.type);
    }).map(function (tx) {
      return { date: tx.date, value: getSavingsDelta(tx) };
    }));
    var reserveMonthsMap = {};
    reserveHistory.forEach(function (tx) {
      var key = String(tx.date || "").slice(0, 7);
      if (!key) return;
      reserveMonthsMap[key] = (reserveMonthsMap[key] || 0) + Number(tx.value || 0);
    });
    var reserveMonths = Object.keys(reserveMonthsMap);
    reserveMonths.sort();
    var reserveMissing = Math.max(0, cents(Number(savingsGoal || 0) - reserve));
    var reserveMonthSeries = reserveMonths.map(function (key) {
      return { key: key, value: reserveMonthsMap[key] };
    });
    var savingsProjection = getSavingsProjection(reserve, savingsGoal);
    var reserveAverage = savingsProjection.monthlyRate;
    var projectedDate = savingsProjection.etaDate;
    var projectedDays = savingsProjection.daysToGoal;
    var projectionSeries = savingsProjection.series;
    var analyticsSaveAmount = document.getElementById("st-save-amount");
    var analyticsSavePct = document.getElementById("st-save-pct");
    var analyticsSaveFill = document.getElementById("st-save-fill");
    var analyticsSaveSub = document.getElementById("st-save-sub");
    var analyticsSaveRight = document.getElementById("st-save-right");
    var analyticsSaveMonth = document.getElementById("st-save-month");
    var analyticsSaveAverage = document.getElementById("st-save-average");
    var analyticsSaveMissing = document.getElementById("st-save-missing");
    var analyticsSaveDays = document.getElementById("st-save-days");
    var analyticsSaveDate = document.getElementById("st-save-date");
    if (analyticsSaveAmount) analyticsSaveAmount.textContent = fmtR(reserve);
    if (analyticsSavePct) analyticsSavePct.textContent = reservePct + "%";
    if (analyticsSaveFill) analyticsSaveFill.style.width = reservePct + "%";
    if (analyticsSaveRight) analyticsSaveRight.textContent = "Meta " + fmtR(savingsGoal);
    if (analyticsSaveMonth) analyticsSaveMonth.textContent = fmtR(reserveMonth);
    if (analyticsSaveAverage) analyticsSaveAverage.textContent = fmtR(reserveAverage);
    if (analyticsSaveMissing) analyticsSaveMissing.textContent = fmtR(reserveMissing);
    if (analyticsSaveDays) analyticsSaveDays.textContent = projectedDays === null ? "Sem aportes futuros suficientes" : (projectedDays === 0 ? "0 dias" : projectedDays + " dias");
    if (analyticsSaveDate) analyticsSaveDate.textContent = projectedDate ? fmtD(projectedDate) : "Sem projeção";
    if (analyticsSaveSub) {
      analyticsSaveSub.textContent = reserve > 0 ? "Soma de todas as caixinhas, já considerando retiradas." : "Use guardar e retirar para construir suas caixinhas.";
    }
    savingsAnalyticsModel = {
      reserve: reserve,
      goal: savingsGoal,
      month: reserveMonth,
      average: reserveAverage,
      missing: reserveMissing,
      projectedDate: projectedDate,
      projectedDays: projectedDays,
      monthSeries: reserveMonthSeries,
      projectionSeries: projectionSeries
    };
    renderBoxesSummary(getBoxStats(), reserve);
  }

  function drawSimpleLineChart(canvasId, points, options) {
    var canvas = document.getElementById(canvasId);
    if (!canvas || !points || !points.length) return;
    var dpr = window.devicePixelRatio || 1;
    var height = Number(canvas.getAttribute("height") || 180);
    canvas.width = canvas.offsetWidth * dpr;
    canvas.height = height * dpr;
    var ctx = canvas.getContext("2d");
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);

    var W = canvas.offsetWidth;
    var H = height;
    ctx.clearRect(0, 0, W, H);

    var vals = points.map(function (point) { return Number(point.value || 0); });
    var minV = Math.min.apply(null, vals.concat([0]));
    var maxV = Math.max.apply(null, vals.concat([1]));
    var range = Math.max(maxV - minV, 1);
    var pad = { l: 14, r: 14, t: 18, b: 28 };
    var cW = W - pad.l - pad.r;
    var cH = H - pad.t - pad.b;
    var color = options && options.color ? options.color : "rgba(94,196,168,.95)";
    var fillTop = options && options.fillTop ? options.fillTop : "rgba(94,196,168,.22)";
    var fillBottom = options && options.fillBottom ? options.fillBottom : "rgba(94,196,168,.03)";

    function px(index) { return pad.l + (index / Math.max(points.length - 1, 1)) * cW; }
    function py(value) { return pad.t + cH - ((value - minV) / range) * cH; }

    var i;
    ctx.strokeStyle = "rgba(255,255,255,.06)";
    ctx.lineWidth = 1;
    for (i = 0; i <= 3; i += 1) {
      var gy = pad.t + cH * (1 - i / 3);
      ctx.beginPath();
      ctx.moveTo(pad.l, gy);
      ctx.lineTo(W - pad.r, gy);
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.moveTo(px(0), py(points[0].value));
    points.forEach(function (point, index) {
      ctx.lineTo(px(index), py(point.value));
    });
    ctx.lineTo(px(points.length - 1), H - pad.b);
    ctx.lineTo(px(0), H - pad.b);
    ctx.closePath();
    var fill = ctx.createLinearGradient(0, pad.t, 0, H - pad.b);
    fill.addColorStop(0, fillTop);
    fill.addColorStop(1, fillBottom);
    ctx.fillStyle = fill;
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(px(0), py(points[0].value));
    points.forEach(function (point, index) {
      ctx.lineTo(px(index), py(point.value));
    });
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.stroke();

    points.forEach(function (point, index) {
      var x = px(index);
      var y = py(point.value);
      ctx.beginPath();
      ctx.arc(x, y, point.current ? 4.5 : 3.5, 0, Math.PI * 2);
      ctx.fillStyle = point.current ? "var(--fin-gold)" : color;
      ctx.fill();
    });

    var tickIndexes = [];
    if (points.length <= 4) {
      for (i = 0; i < points.length; i += 1) tickIndexes.push(i);
    } else {
      tickIndexes = [0, Math.floor((points.length - 1) / 2), points.length - 1];
    }
    tickIndexes.forEach(function (index) {
      ctx.fillStyle = "rgba(255,255,255,.45)";
      ctx.font = "10px Syne, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(points[index].label, px(index), H - 8);
    });
  }

  function drawSavingsHistoryChart() {
    if (!savingsAnalyticsModel) return;
    var series = savingsAnalyticsModel.monthSeries.slice(-8);
    if (!series.length) {
      series = [{ label: "Sem dados", value: 0, current: true }];
    } else {
      series = series.map(function (point, index) {
        return {
          label: point.key.slice(5, 7) + "/" + point.key.slice(2, 4),
          value: point.value,
          current: index === series.length - 1
        };
      });
    }
    drawSimpleLineChart("chart-save-history", series, {
      color: "rgba(94,196,168,.95)",
      fillTop: "rgba(94,196,168,.20)",
      fillBottom: "rgba(94,196,168,.03)"
    });
  }

  function drawSavingsProjectionChart() {
    if (!savingsAnalyticsModel) return;
    var series = savingsAnalyticsModel.projectionSeries.slice();
    if (!series.length) {
      series = [{ label: "Sem projeção", value: savingsAnalyticsModel.reserve || 0, current: true }];
    }
    drawSimpleLineChart("chart-save-projection", series, {
      color: "rgba(200,169,110,.95)",
      fillTop: "rgba(200,169,110,.18)",
      fillBottom: "rgba(200,169,110,.03)"
    });
  }

  function getProjectedBalances(year, month) {
    var daysInMonth = new Date(year, month + 1, 0).getDate();
    var daily = {};
    var day;

    for (day = 1; day <= daysInMonth; day += 1) {
      daily[year + "-" + String(month + 1).padStart(2, "0") + "-" + String(day).padStart(2, "0")] = 0;
    }

    var baseSaldo = 0;
    txs.forEach(function (tx) {
      if (tx.recurrence === "monthly") {
        getMonthlyOccurrenceDates(tx.date, today()).forEach(function () {
          baseSaldo += getTxDelta(tx);
        });
      } else if (tx.recurrence === "weekly") {
        var weeklyCur = new Date(tx.date + "T12:00:00");
        var nowWeekly = new Date(today() + "T12:00:00"); // mesma hora de weeklyCur: a ocorrência de hoje conta
        while (weeklyCur <= nowWeekly) {
          baseSaldo += getTxDelta(tx);
          weeklyCur.setDate(weeklyCur.getDate() + 7);
        }
      } else if (!isFuture(tx)) {
        baseSaldo += getTxDelta(tx);
      }
    });
    getRuleOccurrencesUntil(today()).forEach(function (tx) {
      baseSaldo += getTxDelta(tx);
    });

    expandRecurring(year, month).forEach(function (tx) {
      if (isFuture(tx) && Object.prototype.hasOwnProperty.call(daily, tx.date)) {
        daily[tx.date] += getTxDelta(tx);
      }
    });

    var cumulative = [];
    var running = baseSaldo;
    for (day = 1; day <= daysInMonth; day += 1) {
      var ds = year + "-" + String(month + 1).padStart(2, "0") + "-" + String(day).padStart(2, "0");
      running += daily[ds] || 0;
      cumulative.push({ day: day, date: ds, bal: running });
    }
    return cumulative;
  }

  function getMonthlyAccumulatedBalances(year, month) {
    var daysInMonth = new Date(year, month + 1, 0).getDate();
    var daily = {};
    var day;

    for (day = 1; day <= daysInMonth; day += 1) {
      daily[getMonthDateStr(year, month, day)] = 0;
    }

    expandRecurring(year, month).forEach(function (tx) {
      if (!Object.prototype.hasOwnProperty.call(daily, tx.date)) return;
      daily[tx.date] += getTxDelta(tx);
    });

    var cumulative = [];
    var running = 0;
    for (day = 1; day <= daysInMonth; day += 1) {
      var ds = getMonthDateStr(year, month, day);
      running += daily[ds] || 0;
      cumulative.push({ day: day, date: ds, bal: running, future: ds > today() });
    }
    return cumulative;
  }

  function getSafePurchaseBalances(cumulative) {
    var safe = [];
    var minAhead = Infinity;
    var idx;
    for (idx = cumulative.length - 1; idx >= 0; idx -= 1) {
      minAhead = Math.min(minAhead, Number(cumulative[idx].bal || 0));
      safe[idx] = Object.assign({}, cumulative[idx], { safeBal: minAhead });
    }
    return safe;
  }

  function computeBestDay() {
    var ym = nowYM();
    var cumulative = getProjectedBalances(ym.y, ym.m);
    var safeCumulative = getSafePurchaseBalances(cumulative);
    var remaining = safeCumulative.filter(function (entry) { return entry.date >= today(); });
    if (!remaining.length) remaining = safeCumulative;

    var best = remaining[0];
    remaining.forEach(function (entry) {
      if (entry.safeBal > best.safeBal) best = entry;
    });

    var bars = document.getElementById("bd-bars");
    bars.innerHTML = "";
    var maxBal = Math.max.apply(null, safeCumulative.map(function (entry) { return Math.abs(entry.safeBal) || 1; }));
    var daysInMonth = cumulative.length;
    var step = Math.max(1, Math.floor(daysInMonth / 15));
    var idx;

    for (idx = 0; idx < daysInMonth; idx += step) {
      var item = cumulative[idx];
      var pct = Math.max(4, Math.min(100, (Math.abs(item.safeBal) / maxBal) * 100));
      var cls = item.day === best.day ? "hi" : item.safeBal >= 0 ? "ok" : "lo";
      var bar = document.createElement("div");
      bar.className = "fin-bd-bar " + cls;
      bar.style.height = pct + "%";
      bars.appendChild(bar);
    }

    if (!txs.length && !recurrenceRules.length) {
      document.getElementById("bd-day-text").innerHTML = "Adicione transações";
      document.getElementById("bd-day-sub").textContent = "para calcular o melhor dia do mês";
      return;
    }

    var dow = new Date(best.date + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "long" });
    document.getElementById("bd-day-text").innerHTML = 'Dia <em>' + best.day + " de " + MONTHS_PT[ym.m] + "</em> (" + dow + ")";
    document.getElementById("bd-day-sub").textContent = "Saldo projetado: " + fmtR(best.safeBal) + " — considerando saídas futuras programadas";
  }

  function getCalendarDailyBalances(year, month) {
    var earliest = null;
    txs.forEach(function (tx) {
      if (tx && tx.date && (!earliest || tx.date < earliest)) earliest = tx.date;
    });
    recurrenceRules.forEach(function (rule) {
      if (rule && rule.startDate && (!earliest || rule.startDate < earliest)) earliest = rule.startDate;
    });

    var running = 0;
    if (earliest) {
      var start = new Date(earliest + "T12:00:00");
      var y = start.getFullYear();
      var m = start.getMonth();
      while (y < year || (y === year && m < month)) {
        expandRecurring(y, m).forEach(function (tx) {
          running += getTxDelta(tx);
        });
        m += 1;
        if (m > 11) {
          m = 0;
          y += 1;
        }
      }
    }

    var daysInMonth = new Date(year, month + 1, 0).getDate();
    var daily = {};
    var day;
    for (day = 1; day <= daysInMonth; day += 1) {
      daily[getMonthDateStr(year, month, day)] = 0;
    }
    expandRecurring(year, month).forEach(function (tx) {
      if (Object.prototype.hasOwnProperty.call(daily, tx.date)) daily[tx.date] += getTxDelta(tx);
    });

    var balances = {};
    for (day = 1; day <= daysInMonth; day += 1) {
      var ds = getMonthDateStr(year, month, day);
      running += daily[ds];
      balances[ds] = Math.round(running * 100) / 100;
    }
    return balances;
  }

  // Total acumulado na poupança ao fim de cada dia do mês (mesma lógica do saldo diário do calendário,
  // mas somando só aportes e retiradas da poupança; lançamentos futuros entram como projeção).
  function getCalendarDailySavings(year, month) {
    var earliest = null;
    txs.forEach(function (tx) {
      if (tx && tx.date && (!earliest || tx.date < earliest)) earliest = tx.date;
    });
    recurrenceRules.forEach(function (rule) {
      if (rule && rule.startDate && (!earliest || rule.startDate < earliest)) earliest = rule.startDate;
    });

    var running = 0;
    if (earliest) {
      var start = new Date(earliest + "T12:00:00");
      var y = start.getFullYear();
      var m = start.getMonth();
      while (y < year || (y === year && m < month)) {
        expandRecurring(y, m).forEach(function (tx) {
          running = Math.max(0, running + getSavingsDelta(tx));
        });
        m += 1;
        if (m > 11) {
          m = 0;
          y += 1;
        }
      }
    }

    var daysInMonth = new Date(year, month + 1, 0).getDate();
    var daily = {};
    var day;
    for (day = 1; day <= daysInMonth; day += 1) {
      daily[getMonthDateStr(year, month, day)] = 0;
    }
    expandRecurring(year, month).forEach(function (tx) {
      if (Object.prototype.hasOwnProperty.call(daily, tx.date)) daily[tx.date] += getSavingsDelta(tx);
    });

    var totals = {};
    for (day = 1; day <= daysInMonth; day += 1) {
      var ds = getMonthDateStr(year, month, day);
      running = Math.max(0, running + daily[ds]);
      totals[ds] = Math.round(running * 100) / 100;
    }
    return totals;
  }

  function finCalApplySelection(ids) {
    var availableIds = new Set(txs.map(function (tx) { return String(tx.id); }));
    finCalSelection.ids.clear();
    Array.from(ids || []).forEach(function (id) {
      var key = String(id);
      if (availableIds.has(key)) finCalSelection.ids.add(key);
    });
    document.querySelectorAll('.fin-cal-ev[data-fin-tx-id]').forEach(function (ev) {
      ev.classList.toggle('selected', finCalSelection.ids.has(String(ev.dataset.finTxId)));
    });
  }

  function finCalClearSelection() {
    finCalApplySelection([]);
  }

  function finCalEnsureSelectionBox() {
    var grid = document.getElementById('cal-grid');
    if (!grid) return null;
    var box = document.getElementById('fin-cal-select-box');
    if (!box) {
      box = document.createElement('div');
      box.id = 'fin-cal-select-box';
      box.className = 'fin-cal-select-box';
      box.setAttribute('aria-hidden', 'true');
      grid.appendChild(box);
    }
    return box;
  }

  function finCalSelectByRect(rect, additiveIds) {
    var ids = new Set(Array.from(additiveIds || []).map(String));
    document.querySelectorAll('.fin-cal-ev[data-fin-tx-id]').forEach(function (ev) {
      var cardRect = ev.getBoundingClientRect();
      var hit = !(cardRect.right < rect.left || cardRect.left > rect.right || cardRect.bottom < rect.top || cardRect.top > rect.bottom);
      if (hit) ids.add(String(ev.dataset.finTxId));
    });
    finCalApplySelection(ids);
  }

  function finCalStartSelection(event) {
    if (event.button !== 0 || event.target.closest('.fin-cal-ev')) return;
    // toque e celular: tocar escolhe o dia e deslizar troca o mês (sem seleção por caixa)
    if (event.pointerType === 'touch' || finCalIsMobile()) return;
    var grid = document.getElementById('cal-grid');
    var box = finCalEnsureSelectionBox();
    if (!grid || !box) return;
    var rect = grid.getBoundingClientRect();
    finCalPointerState = {
      rect: rect,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
      additive: event.ctrlKey || event.metaKey,
      baseIds: new Set(finCalSelection.ids)
    };
    finCalSelection.boxActive = true;
    if (!finCalPointerState.additive) finCalClearSelection();
    box.style.display = 'block';
    box.style.left = (event.clientX - rect.left) + 'px';
    box.style.top = (event.clientY - rect.top) + 'px';
    box.style.width = '0px';
    box.style.height = '0px';
  }

  function finCalMoveSelection(event) {
    if (!finCalSelection.boxActive || !finCalPointerState) return;
    var box = finCalEnsureSelectionBox();
    if (!box) return;
    var state = finCalPointerState;
    var rect = state.rect;
    if (Math.abs(event.clientX - state.startX) > 4 || Math.abs(event.clientY - state.startY) > 4) {
      state.moved = true;
      document.body.classList.add('fin-cal-dragging');
      event.preventDefault();
    }
    var left = Math.max(0, Math.min(event.clientX, state.startX) - rect.left);
    var top = Math.max(0, Math.min(event.clientY, state.startY) - rect.top);
    var right = Math.min(rect.width, Math.max(event.clientX, state.startX) - rect.left);
    var bottom = Math.min(rect.height, Math.max(event.clientY, state.startY) - rect.top);
    box.style.left = left + 'px';
    box.style.top = top + 'px';
    box.style.width = Math.max(0, right - left) + 'px';
    box.style.height = Math.max(0, bottom - top) + 'px';
    finCalSelectByRect(
      { left: left + rect.left, top: top + rect.top, right: right + rect.left, bottom: bottom + rect.top },
      state.additive ? state.baseIds : []
    );
  }

  function finCalEndSelection() {
    var hadBoxPointer = !!finCalPointerState;
    if (finCalPointerState && finCalPointerState.moved) {
      finCalSelection.justBoxSelected = true;
      setTimeout(function () { finCalSelection.justBoxSelected = false; }, 120);
    }
    finCalSelection.boxActive = false;
    finCalPointerState = null;
    if (hadBoxPointer) document.body.classList.remove('fin-cal-dragging');
    var box = document.getElementById('fin-cal-select-box');
    if (box) box.style.display = 'none';
  }

  function finCalSetHoverDate(dateStr) {
    finCalSelection.hoverDate = dateStr || null;
    document.querySelectorAll('.fin-cal-cell[data-date]').forEach(function (cell) {
      cell.classList.toggle('drop-target', cell.dataset.date === finCalSelection.hoverDate);
    });
  }

  function finCalFindDateAtPoint(clientX, clientY) {
    var target = document.elementFromPoint(clientX, clientY);
    var cell = target ? target.closest('.fin-cal-cell[data-date]') : null;
    return cell ? cell.dataset.date : null;
  }

  function finCalResetPointerDrag() {
    finCalSelection.pointerCardId = null;
    finCalSelection.pointerStartX = 0;
    finCalSelection.pointerStartY = 0;
    finCalSelection.pointerDragging = false;
    finCalSelection.sourceId = null;
    finCalSelection.sourceDate = null;
    finCalSelection.sourceTx = null;
    finCalSelection.sourceIsRule = false;
    finCalSelection.dragIds = [];
    finCalSelection.copyOnDrag = false;
    finCalSetHoverDate(null);
    document.body.classList.remove('fin-cal-dragging');
    if (finCalDragGhost && finCalDragGhost.parentNode) finCalDragGhost.parentNode.removeChild(finCalDragGhost);
    finCalDragGhost = null;
  }

  function finCalEnsureDragGhost() {
    if (finCalDragGhost) return finCalDragGhost;
    finCalDragGhost = document.createElement('div');
    finCalDragGhost.className = 'fin-cal-drag-ghost';
    document.body.appendChild(finCalDragGhost);
    return finCalDragGhost;
  }

  function finCalUpdateDragGhost(clientX, clientY) {
    if (!finCalSelection.pointerDragging || !finCalSelection.sourceTx) return;
    var ghost = finCalEnsureDragGhost();
    var ids = finCalSelection.dragIds.slice();
    var sourceName = finCalSelection.sourceTx.description || 'Transação';
    ghost.classList.toggle('copy-mode', !!finCalSelection.copyOnDrag);
    ghost.innerHTML = finCalSelection.copyOnDrag
      ? '<span class="fin-cal-drag-ghost-count">＋</span><span>Duplicar · ' + esc(sourceName) + '</span>'
      : '<span class="fin-cal-drag-ghost-count">' + (ids.length || 1) + '</span><span>' + (ids.length > 1 ? 'Mover ' + ids.length + ' transações' : 'Mover · ' + esc(sourceName)) + '</span>';
    ghost.style.left = Math.min(clientX + 16, window.innerWidth - 300) + 'px';
    ghost.style.top = Math.min(clientY + 16, window.innerHeight - 64) + 'px';
    ghost.classList.add('show');
  }

  function finCalTxPointerDown(event, tx) {
    if (event.button !== 0 || !tx) return;
    var isRule = tx._source === 'rule';
    // Ocorrências de regras são editadas no gerenciador; Alt+arraste pode copiá-las como lançamento único.
    if (isRule && !event.altKey) return;
    event.stopPropagation();
    event.preventDefault();

    var id = String(tx._original || tx.id);
    if (isRule) {
      finCalClearSelection();
    } else if (event.altKey) {
      finCalClearSelection();
      finCalSelection.ids.add(id);
    } else if (event.ctrlKey || event.metaKey) {
      if (finCalSelection.ids.has(id)) finCalSelection.ids.delete(id);
      else finCalSelection.ids.add(id);
    } else if (!finCalSelection.ids.has(id)) {
      finCalClearSelection();
      finCalSelection.ids.add(id);
    }
    finCalApplySelection(finCalSelection.ids);

    finCalSelection.pointerCardId = id;
    finCalSelection.pointerStartX = event.clientX;
    finCalSelection.pointerStartY = event.clientY;
    finCalSelection.pointerDragging = false;
    finCalSelection.sourceId = isRule ? null : id;
    finCalSelection.sourceDate = tx.date || null;
    finCalSelection.sourceTx = Object.assign({}, tx);
    finCalSelection.sourceIsRule = isRule;
    finCalSelection.copyOnDrag = !!event.altKey;
    finCalSelection.dragIds = isRule || event.altKey
      ? [id]
      : (finCalSelection.ids.has(id) ? Array.from(finCalSelection.ids) : [id]);
  }

  function finCalHandleDragMove(event) {
    if (!finCalSelection.pointerCardId || finCalSelection.boxActive) return;
    var dx = Math.abs(event.clientX - finCalSelection.pointerStartX);
    var dy = Math.abs(event.clientY - finCalSelection.pointerStartY);
    if (event.altKey) finCalSelection.copyOnDrag = true;
    if (!finCalSelection.pointerDragging && (dx > 6 || dy > 6)) {
      finCalSelection.pointerDragging = true;
      document.body.classList.add('fin-cal-dragging');
    }
    if (!finCalSelection.pointerDragging) return;
    finCalSetHoverDate(finCalFindDateAtPoint(event.clientX, event.clientY));
    finCalUpdateDragGhost(event.clientX, event.clientY);
  }

  function finCalAddDays(dateStr, amount) {
    if (!dateStr) return dateStr;
    var date = new Date(dateStr + 'T12:00:00');
    if (isNaN(date.getTime())) return dateStr;
    date.setDate(date.getDate() + amount);
    return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
  }

  function finCalDuplicateTransactionAtDate(source, targetDate) {
    if (!source || !targetDate) return false;
    // Copiar uma ocorrência gera uma transação única, sem duplicar uma série/regra inteira.
    var copy = {
      id: uid(),
      type: source.type,
      description: source.description,
      value: Number(source.value || 0),
      date: targetDate,
      category: source.category || (isSavingsType(source.type) ? 'Poupança' : 'Outros'),
      recurrence: '',
      note: source.note || ''
    };
    if (isSavingsType(copy.type)) copy.boxId = getTxBoxId(source);
    txs.push(copy);
    if (copy.type === 'save_withdraw' && copy.value > getSavingsBalanceUntil(copy.date, copy.id, copy.boxId)) {
      txs = txs.filter(function (item) { return item.id !== copy.id; });
      toast('Não é possível duplicar essa retirada: o valor supera o saldo da caixinha na data escolhida.', 'err');
      return false;
    }
    finCalClearSelection();
    persist();
    renderAll();
    toast('Transação duplicada!', 'ok');
    return true;
  }

  function finCalMoveTransactions(ids, dayDelta) {
    if (!dayDelta || !ids.length) return false;
    var idSet = new Set(ids.map(String));
    var moving = txs.filter(function (tx) { return idSet.has(String(tx.id)); });
    if (!moving.length) return false;
    var previousDates = moving.map(function (tx) { return { tx: tx, date: tx.date }; });
    moving.forEach(function (tx) { tx.date = finCalAddDays(tx.date, dayDelta); });

    // Mantém a regra já existente: uma retirada nunca pode exceder a poupança disponível.
    var invalidWithdrawal = moving.some(function (tx) {
      return tx.type === 'save_withdraw' && Number(tx.value || 0) > getSavingsBalanceUntil(tx.date, tx.id, getTxBoxId(tx));
    });
    if (invalidWithdrawal) {
      previousDates.forEach(function (entry) { entry.tx.date = entry.date; });
      toast('Não é possível mover: uma retirada ficaria acima do saldo da caixinha nessa data.', 'err');
      return false;
    }

    finCalClearSelection();
    persist();
    renderAll();
    toast(moving.length === 1 ? 'Data da transação atualizada!' : 'Datas das transações atualizadas!', 'ok');
    return true;
  }

  function finCalHandleDragEnd(event) {
    if (!finCalSelection.pointerCardId) return;
    var wasDragging = finCalSelection.pointerDragging;
    var sourceDate = finCalSelection.sourceDate;
    var sourceId = finCalSelection.sourceId;
    var sourceTx = finCalSelection.sourceTx;
    var sourceIsRule = finCalSelection.sourceIsRule;
    var ids = finCalSelection.dragIds.slice();
    var copyOnDrag = !!finCalSelection.copyOnDrag;
    var targetDate = finCalFindDateAtPoint(event.clientX, event.clientY);
    finCalResetPointerDrag();
    if (!wasDragging || !targetDate) return;

    if (copyOnDrag) {
      finCalDuplicateTransactionAtDate(sourceTx, targetDate);
      finCalSelection.justDragged = true;
      setTimeout(function () { finCalSelection.justDragged = false; }, 120);
      return;
    }
    // Itens provenientes de regras mantêm seu funcionamento atual; movê-los exigiria editar a regra.
    if (sourceIsRule || !sourceDate || !sourceId || !ids.length) return;
    var delta = diffDays(sourceDate, targetDate);
    if (!delta) {
      finCalSelection.justDragged = true;
      setTimeout(function () { finCalSelection.justDragged = false; }, 100);
      return;
    }
    finCalMoveTransactions(ids, delta);
    finCalSelection.justDragged = true;
    setTimeout(function () { finCalSelection.justDragged = false; }, 120);
  }

  function finCalInitInteractions() {
    var grid = document.getElementById('cal-grid');
    if (!grid || grid.dataset.finInteractionsReady === '1') return;
    grid.dataset.finInteractionsReady = '1';
    grid.addEventListener('pointerdown', finCalStartSelection);
    document.addEventListener('pointermove', finCalMoveSelection);
    document.addEventListener('pointerup', finCalEndSelection);
    document.addEventListener('pointermove', finCalHandleDragMove);
    document.addEventListener('pointerup', finCalHandleDragEnd);
  }

  // Celular (≤ 640px): o mês fica compacto (número do dia + pontinhos) e o dia tocado mostra seus
  // lançamentos logo abaixo ("agenda do dia"). Deslizar na grade troca de mês. No desktop nada muda.
  var finCalMobileMq = window.matchMedia ? window.matchMedia("(max-width: 640px)") : null;
  var finCalSelectedDate = null;
  var FIN_WEEKDAYS_LONG = ["Domingo", "Segunda", "Ter\u00e7a", "Quarta", "Quinta", "Sexta", "S\u00e1bado"];

  function finCalIsMobile() {
    return !!(finCalMobileMq && finCalMobileMq.matches);
  }

  function finCalShiftMonth(delta) {
    calMonth += delta;
    if (calMonth < 0) { calMonth = 11; calYear -= 1; }
    if (calMonth > 11) { calMonth = 0; calYear += 1; }
    renderCalendar();
  }

  function finCalSelectDay(dateStr) {
    finCalSelectedDate = dateStr;
    document.querySelectorAll(".fin-cal-cell[data-date]").forEach(function (cell) {
      var on = cell.dataset.date === dateStr;
      cell.classList.toggle("is-selected", on);
      cell.setAttribute("aria-pressed", on ? "true" : "false");
    });
    renderCalAgenda();
  }

  function renderCalAgenda() {
    var grid = document.getElementById("cal-grid");
    if (!grid) return;
    var box = document.getElementById("fin-cal-agenda");
    if (!box) {
      box = document.createElement("div");
      box.id = "fin-cal-agenda";
      box.className = "fin-cal-agenda";
      box.setAttribute("aria-live", "polite");
      grid.parentNode.insertBefore(box, grid.nextSibling);
    }
    var ds = finCalSelectedDate;
    box.innerHTML = "";
    if (!ds) return;
    var parts = ds.split("-");
    var dateObj = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    var dayTxs = expandRecurring(dateObj.getFullYear(), dateObj.getMonth()).filter(function (tx) { return tx.date === ds; });
    dayTxs.sort(function (a, b) { return (isFuture(a) ? 1 : 0) - (isFuture(b) ? 1 : 0); });

    var head = document.createElement("div");
    head.className = "fin-cal-ag-hd";
    var titleWrap = document.createElement("div");
    var dateEl = document.createElement("div");
    dateEl.className = "fin-cal-ag-date";
    dateEl.textContent = FIN_WEEKDAYS_LONG[dateObj.getDay()] + ", " + dateObj.getDate() + " de " + MONTHS_PT[dateObj.getMonth()].toLowerCase();
    titleWrap.appendChild(dateEl);
    if (txs.length || recurrenceRules.length) {
      var bal = getCalendarDailyBalances(dateObj.getFullYear(), dateObj.getMonth())[ds] || 0;
      var balEl = document.createElement("div");
      balEl.className = "fin-cal-ag-bal " + (bal < 0 ? "neg" : "pos");
      balEl.textContent = (ds > today() ? "Saldo previsto: " : "Saldo do dia: ") + fmtR(bal);
      titleWrap.appendChild(balEl);
    }
    head.appendChild(titleWrap);
    var add = document.createElement("button");
    add.type = "button";
    add.className = "fin-cal-ag-add";
    add.innerHTML = '<i class="ico ico-plus" aria-hidden="true"></i> Adicionar';
    add.setAttribute("aria-label", "Adicionar transa\u00e7\u00e3o em " + fmtD(ds));
    add.addEventListener("click", function () { openCreateAtDate(ds); });
    head.appendChild(add);
    box.appendChild(head);

    if (!dayTxs.length) {
      var empty = document.createElement("p");
      empty.className = "fin-cal-ag-empty";
      empty.textContent = "Nenhum lan\u00e7amento neste dia.";
      box.appendChild(empty);
      return;
    }
    var list = document.createElement("div");
    list.className = "fin-cal-ag-list";
    dayTxs.forEach(function (tx) {
      var fut = isFuture(tx);
      var item = document.createElement("button");
      item.type = "button";
      item.className = "fin-cal-ag-item " + getTxClass(tx.type) + (fut ? " is-future" : "");
      var dot = document.createElement("span");
      dot.className = "fin-cal-ag-dot";
      dot.setAttribute("aria-hidden", "true");
      var main = document.createElement("span");
      main.className = "fin-cal-ag-main";
      var name = document.createElement("span");
      name.className = "fin-cal-ag-name";
      name.textContent = tx.description || tx.category || "Lan\u00e7amento";
      var meta = document.createElement("span");
      meta.className = "fin-cal-ag-cat";
      var bits = [tx.category || ""];
      if (tx.recurrence === "monthly") bits.push("mensal");
      else if (tx.recurrence === "weekly") bits.push("semanal");
      else if (tx._source === "rule") bits.push("recorrente");
      if (fut) bits.push("futuro");
      meta.textContent = bits.filter(Boolean).join(" \u00b7 ");
      main.appendChild(name);
      main.appendChild(meta);
      var val = document.createElement("span");
      val.className = "fin-cal-ag-val";
      val.textContent = getTxSign(tx.type) + fmtR(tx.value);
      item.appendChild(dot);
      item.appendChild(main);
      item.appendChild(val);
      item.addEventListener("click", function () { openGeneratedSource(tx); });
      list.appendChild(item);
    });
    box.appendChild(list);
  }

  function finCalInitSwipe() {
    var grid = document.getElementById("cal-grid");
    if (!grid || grid.dataset.finSwipeReady === "1") return;
    grid.dataset.finSwipeReady = "1";
    var start = null;
    grid.addEventListener("touchstart", function (event) {
      if (!finCalIsMobile() || event.touches.length !== 1) { start = null; return; }
      start = { x: event.touches[0].clientX, y: event.touches[0].clientY };
    }, { passive: true });
    grid.addEventListener("touchend", function (event) {
      if (!start || !event.changedTouches.length) return;
      var dx = event.changedTouches[0].clientX - start.x;
      var dy = event.changedTouches[0].clientY - start.y;
      start = null;
      if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      finCalShiftMonth(dx < 0 ? 1 : -1);
    }, { passive: true });
    if (finCalMobileMq) {
      var onChange = function () { renderCalendar(); };
      if (finCalMobileMq.addEventListener) finCalMobileMq.addEventListener("change", onChange);
      else if (finCalMobileMq.addListener) finCalMobileMq.addListener(onChange);
    }
  }

  function renderCalendar() {
    var title = document.getElementById("cal-title");
    title.innerHTML = "<em>" + MONTHS_PT[calMonth] + "</em> " + calYear;

    var grid = document.getElementById("cal-grid");
    grid.innerHTML = "";
    DAYS_PT.forEach(function (dow) {
      var label = document.createElement("div");
      label.className = "fin-cal-dow";
      label.textContent = dow;
      grid.appendChild(label);
    });

    var firstDay = new Date(calYear, calMonth, 1).getDay();
    var daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
    var prevDays = new Date(calYear, calMonth, 0).getDate();
    var todayStr = today();
    var ym = nowYM();
    var bestDay = null;

    if (calYear === ym.y && calMonth === ym.m) {
      var monthProjection = getSafePurchaseBalances(getProjectedBalances(calYear, calMonth));
      var remaining = monthProjection.filter(function (entry) { return entry.date >= todayStr; });
      if (!remaining.length) remaining = monthProjection;
      if (remaining.length) {
        var best = remaining[0];
        remaining.forEach(function (entry) {
          if (entry.safeBal > best.safeBal) best = entry;
        });
        bestDay = best.day;
      }
    }

    var evMap = {};
    expandRecurring(calYear, calMonth).forEach(function (tx) {
      if (!evMap[tx.date]) evMap[tx.date] = [];
      evMap[tx.date].push(tx);
    });

    var dayBalances = getCalendarDailyBalances(calYear, calMonth);
    var daySavings = getCalendarDailySavings(calYear, calMonth);
    var hasData = txs.length > 0 || recurrenceRules.length > 0;

    var monthKey = calYear + "-" + String(calMonth + 1).padStart(2, "0");
    if (!finCalSelectedDate || finCalSelectedDate.slice(0, 7) !== monthKey) {
      finCalSelectedDate = todayStr.slice(0, 7) === monthKey ? todayStr : monthKey + "-01";
    }
    var mobileCal = finCalIsMobile();

    var totalCells = Math.ceil((firstDay + daysInMonth) / 7) * 7;
    var weekRows = totalCells / 7;
    grid.style.gridTemplateRows = "auto repeat(" + weekRows + ", minmax(0, 1fr))";
    var i;
    for (i = 0; i < totalCells; i += 1) {
      var cell = document.createElement("div");
      cell.className = "fin-cal-cell";
      var dn = document.createElement("div");
      dn.className = "fin-cal-dn";
      var dayNum;

      if (i < firstDay) {
        dayNum = prevDays - firstDay + i + 1;
        cell.classList.add("other-month");
      } else if (i < firstDay + daysInMonth) {
        dayNum = i - firstDay + 1;
        var ds = calYear + "-" + String(calMonth + 1).padStart(2, "0") + "-" + String(dayNum).padStart(2, "0");
        cell.dataset.date = ds;
        (function (dateStr) {
          cell.setAttribute("role", "button");
          cell.setAttribute("tabindex", "0");
          cell.setAttribute("aria-label", (mobileCal ? "Ver lançamentos de " : "Adicionar transação em ") + fmtD(dateStr));
          cell.addEventListener("click", function (event) {
            if (event.target.closest(".fin-cal-ev")) return;
            if (finCalSelection.justBoxSelected) {
              finCalSelection.justBoxSelected = false;
              return;
            }
            if (finCalIsMobile()) finCalSelectDay(dateStr);
            else openCreateAtDate(dateStr);
          });
          cell.addEventListener("keydown", function (event) {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              if (finCalIsMobile()) finCalSelectDay(dateStr);
              else openCreateAtDate(dateStr);
            }
          });
        }(ds));
        if (ds === todayStr) cell.classList.add("today");
        if (dayNum === bestDay) cell.classList.add("best-buy");
        if (mobileCal) {
          cell.classList.toggle("is-selected", ds === finCalSelectedDate);
          cell.setAttribute("aria-pressed", ds === finCalSelectedDate ? "true" : "false");
        }

        var evs = document.createElement("div");
        evs.className = "fin-cal-events";
        var dayEvs = evMap[ds] || [];
        dayEvs.sort(function (a, b) { return (isFuture(a) ? 1 : 0) - (isFuture(b) ? 1 : 0); });
        dayEvs.forEach(function (tx) {
          var ev = document.createElement("div");
          var fut = isFuture(tx);
          var txClass = getTxClass(tx.type);
          var baseTxId = tx._original || tx.id;
          var canInteract = tx._source !== "rule";
          ev.className = "fin-cal-ev " + (fut ? "future-" + txClass : txClass) +
            (canInteract && finCalSelection.ids.has(String(baseTxId)) ? " selected" : "");
          ev.setAttribute("role", "button");
          ev.setAttribute("tabindex", "0");
          if (canInteract) {
            ev.dataset.finTxId = String(baseTxId);
            ev.dataset.finTxDate = tx.date;
          }
          // Regras não podem ser movidas sem editar sua configuração, mas Alt+arraste pode criar um lançamento único.
          ev.addEventListener("pointerdown", function (event) { finCalTxPointerDown(event, tx); });
          ev.textContent = getTxSign(tx.type) + fmtR(tx.value).replace("R$ ", "");
          ev.title = tx.description + " — " + fmtR(tx.value) + (fut ? " (futuro)" : "") +
            (canInteract ? " · Arraste para mover · Ctrl/Cmd+clique para selecionar · Alt+arraste para duplicar" : " · Clique para editar a regra");
          ev.addEventListener("click", function (event) {
            event.stopPropagation();
            if (finCalSelection.justDragged || finCalSelection.justBoxSelected || event.ctrlKey || event.metaKey || event.altKey) return;
            openGeneratedSource(tx);
          });
          ev.addEventListener("keydown", function (event) {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              event.stopPropagation();
              openGeneratedSource(tx);
            }
          });
          evs.appendChild(ev);
        });
        cell.appendChild(evs);

        // celular: um pontinho por tipo de lançamento do dia (o resto fica na agenda abaixo)
        var dotKinds = {};
        dayEvs.forEach(function (tx) {
          var kind = getTxClass(tx.type);
          var fut = isFuture(tx);
          if (!dotKinds[kind] || !fut) dotKinds[kind] = fut ? "future" : "now";
        });
        var dotKeys = Object.keys(dotKinds);
        if (dotKeys.length) {
          var dots = document.createElement("div");
          dots.className = "fin-cal-dots";
          dots.setAttribute("aria-hidden", "true");
          dotKeys.slice(0, 4).forEach(function (kind) {
            var dot = document.createElement("span");
            dot.className = "fin-cal-dot " + kind + (dotKinds[kind] === "future" ? " is-future" : "");
            dots.appendChild(dot);
          });
          cell.appendChild(dots);
        }

        if (hasData) {
          var dayBal = dayBalances[ds] || 0;
          var balEl = document.createElement("div");
          balEl.className = "fin-cal-bal " + (dayBal < 0 ? "neg" : "pos") + (ds > todayStr ? " future" : "");
          balEl.textContent = (dayBal < 0 ? "-" : "") + fmtR(Math.abs(dayBal)).replace("R$ ", "");
          balEl.title = "Saldo em " + fmtD(ds) + ": " + fmtR(dayBal) + (ds > todayStr ? " (projetado)" : "");
          cell.appendChild(balEl);

          var daySave = daySavings[ds] || 0;
          if (daySave > 0) {
            var savEl = document.createElement("div");
            savEl.className = "fin-cal-bal fin-cal-sav pos future";
            savEl.innerHTML = '<i class="ico ico-piggy-bank" aria-hidden="true"></i> ' + fmtR(daySave).replace("R$ ", "");
            savEl.title = "Poupança em " + fmtD(ds) + ": " + fmtR(daySave) + (ds > todayStr ? " (projetado)" : "");
            cell.classList.add("has-sav");
            cell.appendChild(savEl);
          }
        }

      } else {
        dayNum = i - firstDay - daysInMonth + 1;
        cell.classList.add("other-month");
      }

      dn.textContent = dayNum;
      cell.insertBefore(dn, cell.firstChild);
      grid.appendChild(cell);
    }
    finCalInitInteractions();
    finCalInitSwipe();
    finCalApplySelection(finCalSelection.ids);
    renderCalAgenda();
  }

  function renderTxList() {
    var list = document.getElementById("tx-list");
    var ym = nowYM();
    var filtered = expandRecurring(ym.y, ym.m).filter(function (tx) {
      if (txFilter === "in") return tx.type === "in" || tx.type === "save_withdraw";
      if (txFilter === "out") return tx.type === "out" || tx.type === "save";
      return true;
    });

    filtered.sort(function (a, b) { return b.date.localeCompare(a.date); });

    if (!filtered.length) {
      list.innerHTML = '<div class="fin-empty"><i class="ico ico-receipt" aria-hidden="true"></i><p>Nenhuma transação este mês</p></div>';
      return;
    }

    list.innerHTML = "";
    filtered.forEach(function (tx) {
      var fut = isFuture(tx);
      var div = document.createElement("div");
      var catClr = CAT_COLORS[tx.category] || "#858099";
      var catIco = CAT_ICONS[tx.category] || "\uD83D\uDCCC";
      var catName = tx.category;
      var txBox = isSavingsType(tx.type) ? getBoxById(getTxBoxId(tx)) : null;
      if (txBox) {
        catClr = txBox.color;
        catIco = txBox.emoji;
        catName = txBox.name;
      }
      var txClass = getTxClass(tx.type);
      div.className = "fin-tx-item" + (fut ? " fin-tx-future" : "");
      div.innerHTML =
        '<div class="fin-tx-dot ' + txClass + '" style="background:rgba(' + hexToRgb(catClr) + ',.15)">' + catIco + "</div>" +
        '<div class="fin-tx-body">' +
          '<div class="fin-tx-name">' + esc(tx.description) + '<span class="fin-tx-cat-badge" style="background:rgba(' + hexToRgb(catClr) + ',.15);color:' + catClr + '">' + esc(catName) + "</span></div>" +
          '<div class="fin-tx-meta">' + fmtD(tx.date) + (tx.recurrence ? ' · <span style="color:var(--fin-amber)"><i class="ico ico-repeat" aria-hidden="true"></i> ' + (tx.recurrence === "monthly" ? "Mensal" : "Semanal") + "</span>" : "") + "</div>" +
        "</div>" +
        '<div class="fin-tx-amt ' + txClass + '">' + getTxSign(tx.type) + fmtR(tx.value) + "</div>";
      div.addEventListener("click", function () {
        openGeneratedSource(tx);
      });
      list.appendChild(div);
    });
  }

  function renderCategories() {
    var ym = nowYM();
    var mTxs = expandRecurring(ym.y, ym.m);
    var cats = {};
    mTxs.forEach(function (tx) {
      if (tx.type === "out") cats[tx.category] = (cats[tx.category] || 0) + Number(tx.value);
    });

    var entries = Object.keys(cats).map(function (name) {
      return { name: name, val: cats[name] };
    }).sort(function (a, b) {
      return b.val - a.val;
    });

    var total = entries.reduce(function (sum, entry) { return sum + entry.val; }, 0) || 1;
    var list = document.getElementById("cat-list");
    if (!entries.length) {
      list.innerHTML = '<div class="fin-empty" style="padding:20px"><i class="ico ico-tags" aria-hidden="true"></i><p>Sem saídas este mês</p></div>';
      return;
    }

    list.innerHTML = "";
    entries.slice(0, 6).forEach(function (entry) {
      var clr = CAT_COLORS[entry.name] || "#858099";
      var pct = Math.round((entry.val / total) * 100);
      var row = document.createElement("div");
      row.className = "fin-cat-item";
      row.innerHTML =
        '<div class="fin-cat-dot" style="background:' + clr + '"></div>' +
        '<div class="fin-cat-name">' + esc(entry.name) + "</div>" +
        '<div class="fin-cat-bar-bg"><div class="fin-cat-bar-fill" style="width:' + pct + "%;background:" + clr + '"></div></div>' +
        '<div class="fin-cat-val">' + fmtR(entry.val) + "</div>";
      list.appendChild(row);
    });
  }

  function roundRect(ctx, x, y, w, h, r) {
    if (h <= 0) h = 0;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h);
    ctx.lineTo(x, y + h);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
    ctx.fill();
  }

  function drawFluxChart() {
    var canvas = document.getElementById("chart-flux");
    var dpr = window.devicePixelRatio || 1;
    canvas.width = canvas.offsetWidth * dpr;
    canvas.height = 200 * dpr;
    var ctx = canvas.getContext("2d");
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);

    var W = canvas.offsetWidth;
    var H = 200;
    ctx.clearRect(0, 0, W, H);

    var labels = [];
    var ins = [];
    var outs = [];
    var now = new Date();
    var periods = chartView === "year" ? 12 : 6;
    var i;

    for (i = periods - 1; i >= 0; i -= 1) {
      var date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      labels.push(MONTHS_PT[date.getMonth()].slice(0, 3));
      var monthTxs = expandRecurring(date.getFullYear(), date.getMonth());
      var inA = 0;
      var outA = 0;
      monthTxs.forEach(function (tx) {
        if (tx.type === "in") inA += Number(tx.value);
        else if (tx.type === "out") outA += Number(tx.value);
      });
      ins.push(inA);
      outs.push(outA);
    }

    var maxVal = Math.max.apply(null, ins.concat(outs).concat([1]));
    var pad = { l: 14, r: 14, t: 16, b: 32 };
    // rótulos do eixo Y alinhados à direita de pad.l: a margem tem de caber o maior deles
    ctx.font = "10px DM Mono, monospace";
    pad.l = Math.max(pad.l, Math.ceil(ctx.measureText(fmtR(maxVal).replace("R$ ", "")).width) + 8);
    var bw = Math.floor((W - pad.l - pad.r) / labels.length);
    var bPad = Math.floor(bw * 0.18);
    var bInner = bw - bPad * 2;
    var bHalf = Math.floor(bInner / 2);
    var chartH = H - pad.t - pad.b;

    ctx.strokeStyle = "rgba(255,255,255,.06)";
    ctx.lineWidth = 1;
    for (i = 0; i <= 4; i += 1) {
      var gy = pad.t + chartH * (1 - i / 4);
      ctx.beginPath();
      ctx.moveTo(pad.l, gy);
      ctx.lineTo(W - pad.r, gy);
      ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,.25)";
      ctx.font = "10px DM Mono, monospace";
      ctx.textAlign = "right";
      ctx.fillText(fmtR((maxVal * i) / 4).replace("R$ ", ""), pad.l - 2, gy + 3);
    }

    labels.forEach(function (label, index) {
      var x = pad.l + index * bw + bPad;
      var inH = (ins[index] / maxVal) * chartH;
      var outH = (outs[index] / maxVal) * chartH;

      var gIn = ctx.createLinearGradient(0, pad.t + chartH - inH, 0, pad.t + chartH);
      gIn.addColorStop(0, "rgba(94,196,168,.9)");
      gIn.addColorStop(1, "rgba(94,196,168,.35)");
      ctx.fillStyle = gIn;
      roundRect(ctx, x, pad.t + chartH - inH, bHalf - 1, inH, 3);

      var gOut = ctx.createLinearGradient(0, pad.t + chartH - outH, 0, pad.t + chartH);
      gOut.addColorStop(0, "rgba(224,107,139,.9)");
      gOut.addColorStop(1, "rgba(224,107,139,.35)");
      ctx.fillStyle = gOut;
      roundRect(ctx, x + bHalf + 1, pad.t + chartH - outH, bHalf - 1, outH, 3);

      ctx.fillStyle = "rgba(255,255,255,.45)";
      ctx.font = "10px Syne, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(label, x + bInner / 2, H - 8);
    });
  }

  function drawBalanceChart() {
    var canvas = document.getElementById("chart-balance");
    if (!canvas || !canvas.offsetWidth) return;
    var dpr = window.devicePixelRatio || 1;
    canvas.width = canvas.offsetWidth * dpr;
    canvas.height = 200 * dpr;
    var ctx = canvas.getContext("2d");
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);

    var W = canvas.offsetWidth;
    var H = 200;
    ctx.clearRect(0, 0, W, H);

    var ym = nowYM();
    var points = getMonthlyAccumulatedBalances(ym.y, ym.m).map(function (entry) {
      return { day: entry.day, val: entry.bal, future: entry.future };
    });
    if (!points.length) return;
    var daysInMonth = points.length;
    var minV = Math.min.apply(null, points.map(function (point) { return point.val; }));
    var maxV = Math.max.apply(null, points.map(function (point) { return point.val; }));
    var range = Math.max(maxV - minV, 1);
    var pad = { l: 14, r: 14, t: 16, b: 28 };
    ctx.font = "10px DM Mono, monospace";
    pad.l = Math.max(pad.l, Math.ceil(Math.max(ctx.measureText(fmtR(minV).replace("R$ ", "")).width, ctx.measureText(fmtR(minV + range).replace("R$ ", "")).width)) + 8);
    var cW = W - pad.l - pad.r;
    var cH = H - pad.t - pad.b;

    function px(index) { return pad.l + (index / Math.max(daysInMonth - 1, 1)) * cW; }
    function py(value) { return pad.t + cH - ((value - minV) / range) * cH; }

    var i;
    ctx.strokeStyle = "rgba(255,255,255,.06)";
    ctx.lineWidth = 1;
    for (i = 0; i <= 3; i += 1) {
      var gy = pad.t + cH * (1 - i / 3);
      ctx.beginPath();
      ctx.moveTo(pad.l, gy);
      ctx.lineTo(W - pad.r, gy);
      ctx.stroke();
      var lv = minV + (range * i) / 3;
      ctx.fillStyle = "rgba(255,255,255,.25)";
      ctx.font = "10px DM Mono, monospace";
      ctx.textAlign = "right";
      ctx.fillText(fmtR(lv).replace("R$ ", ""), pad.l - 2, gy + 3);
    }

    if (minV < 0 && maxV > 0) {
      var zy = py(0);
      ctx.strokeStyle = "rgba(255,255,255,.15)";
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(pad.l, zy);
      ctx.lineTo(W - pad.r, zy);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    var realPts = points.filter(function (point) { return !point.future; });
    if (realPts.length) {
      ctx.beginPath();
      ctx.moveTo(px(realPts[0].day - 1), py(realPts[0].val));
      realPts.forEach(function (point) {
        ctx.lineTo(px(point.day - 1), py(point.val));
      });
      ctx.lineTo(px(realPts[realPts.length - 1].day - 1), H - pad.b);
      ctx.lineTo(px(realPts[0].day - 1), H - pad.b);
      ctx.closePath();
      var aFill = ctx.createLinearGradient(0, pad.t, 0, H - pad.b);
      aFill.addColorStop(0, "rgba(94,196,168,.25)");
      aFill.addColorStop(1, "rgba(94,196,168,.02)");
      ctx.fillStyle = aFill;
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(px(realPts[0].day - 1), py(realPts[0].val));
      realPts.forEach(function (point) {
        ctx.lineTo(px(point.day - 1), py(point.val));
      });
      ctx.strokeStyle = "rgba(94,196,168,.9)";
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }

    var futurePts = points.filter(function (point) { return point.future; });
    if (futurePts.length) {
      ctx.beginPath();
      if (realPts.length) {
        ctx.moveTo(px(realPts[realPts.length - 1].day - 1), py(realPts[realPts.length - 1].val));
      } else {
        ctx.moveTo(px(futurePts[0].day - 1), py(futurePts[0].val));
      }
      futurePts.forEach(function (point) {
        ctx.lineTo(px(point.day - 1), py(point.val));
      });
      ctx.strokeStyle = "rgba(200,169,110,.95)";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 5]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    points.forEach(function (point) {
      var x = px(point.day - 1);
      var y = py(point.val);
      ctx.beginPath();
      ctx.arc(x, y, point.future ? 2.5 : 3, 0, Math.PI * 2);
      ctx.fillStyle = point.future ? "rgba(200,169,110,.95)" : "rgba(94,196,168,.95)";
      ctx.fill();
    });

    var futurePts = points.filter(function (point) { return point.future; });
    if (futurePts.length && realPts.length) {
      var lastReal = realPts[realPts.length - 1];
      ctx.beginPath();
      ctx.moveTo(px(lastReal.day - 1), py(lastReal.val));
      futurePts.forEach(function (point) {
        ctx.lineTo(px(point.day - 1), py(point.val));
      });
      ctx.strokeStyle = "rgba(200,169,110,.55)";
      ctx.lineWidth = 1.8;
      ctx.setLineDash([5, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    var todayDay = new Date().getDate();
    if (todayDay >= 1 && todayDay <= daysInMonth) {
      var todayPoint = points[todayDay - 1];
      var tx = px(todayDay - 1);
      var ty = py(todayPoint.val);
      ctx.beginPath();
      ctx.arc(tx, ty, 4, 0, Math.PI * 2);
      ctx.fillStyle = "var(--fin-gold)";
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,.5)";
      ctx.font = "10px Syne, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("hoje", tx, H - 8);
    }

    [1, 7, 14, 21, daysInMonth].forEach(function (day) {
      ctx.fillStyle = "rgba(255,255,255,.35)";
      ctx.font = "10px Syne, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(String(day), px(day - 1), H - 8);
    });
  }

  function renderAll() {
    computeStats();
    computeBestDay();
    renderCalendar();
    renderTxList();
    renderCategories();
    setTimeout(function () {
      drawFluxChart();
      drawBalanceChart();
      drawSavingsHistoryChart();
      drawSavingsProjectionChart();
    }, 50);
  }

  function finOpenAnalytics() {
    var el = document.getElementById("fin-analytics");
    if (!el) return;
    el.classList.add("open");
    document.body.classList.add("fin-analytics-open");
    renderAll();
  }

  function finCloseAnalytics() {
    var el = document.getElementById("fin-analytics");
    if (!el) return;
    el.classList.remove("open");
    document.body.classList.remove("fin-analytics-open");
  }

  function openModal(id) {
    var el = document.getElementById(id);
    if (el) el.classList.add("open");
  }

  function closeModal(id) {
    var el = document.getElementById(id);
    if (el) el.classList.remove("open");
  }

  // ===== Caixinhas =====
  // O card lateral mostra só o total e até 3 caixinhas em destaque (fixadas primeiro,
  // depois as movimentadas mais recentemente). A lista completa fica no modal, separada
  // em abas (ativas / concluídas / arquivadas), com busca e ordenação.

  function getBoxProgress(box, stat) {
    var balance = stat ? stat.balance : 0;
    var goal = Number(box.goal || 0);
    var pct = goal > 0 ? Math.max(0, Math.min(100, Math.round((balance / goal) * 100))) : 0;
    return { balance: balance, goal: goal, pct: pct, done: goal > 0 && cents(balance) >= cents(goal), missing: Math.max(0, cents(goal - Math.max(0, balance))), negative: balance < 0 };
  }

  function getBoxStatus(box, stat) {
    if (box.archived) return "archived";
    return getBoxProgress(box, stat).done ? "done" : "active";
  }

  // Prazo opcional: quanto guardar por mês para chegar à meta na data escolhida.
  function getBoxDeadlineInfo(box, progress) {
    if (!box.deadline || progress.goal <= 0 || progress.done) return null;
    var days = diffDays(today(), box.deadline);
    if (days < 0) return { late: true, text: "Prazo venceu em " + fmtD(box.deadline) };
    var months = Math.max(1, Math.ceil(days / 30.44));
    return {
      late: false,
      days: days,
      perMonth: cents(progress.missing / months),
      text: (days === 0 ? "Prazo é hoje" : (days === 1 ? "Falta 1 dia" : "Faltam " + days + " dias")) + " · guarde " + fmtR(cents(progress.missing / months)) + "/mês"
    };
  }

  function sortBoxes(list, stats, mode) {
    var copy = list.slice();
    copy.sort(function (a, b) {
      var pa = getBoxProgress(a, stats[a.id]);
      var pb = getBoxProgress(b, stats[b.id]);
      if (mode === "balance") return pb.balance - pa.balance;
      if (mode === "progress") return pb.pct - pa.pct || pa.missing - pb.missing;
      if (mode === "deadline") return (a.deadline || "9999") .localeCompare(b.deadline || "9999");
      if (mode === "name") return a.name.localeCompare(b.name, "pt-BR");
      // destaques: fixadas, depois movimentadas recentemente, depois maior saldo
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      var la = (stats[a.id] && stats[a.id].lastDate) || a.createdAt || "";
      var lb = (stats[b.id] && stats[b.id].lastDate) || b.createdAt || "";
      return lb.localeCompare(la) || pb.balance - pa.balance;
    });
    return copy;
  }

  function getFeaturedBoxes(stats) {
    var visible = savingsBoxes.filter(function (box) { return !box.archived; });
    return sortBoxes(visible, stats, "featured").slice(0, BOX_FEATURED_LIMIT);
  }

  function boxBarHtml(box, progress) {
    return '<div class="fbx-bar"><div class="fbx-bar-fill" style="width:' + progress.pct + '%;background:' + box.color + '"></div></div>';
  }

  function boxGoalText(progress) {
    if (progress.goal <= 0) return "Sem meta";
    if (progress.done) return "Meta de " + fmtR(progress.goal) + " atingida";
    return progress.pct + "% de " + fmtR(progress.goal);
  }

  function renderBoxesSummary(stats, total) {
    var totalEl = document.getElementById("fin-boxes-total");
    if (!totalEl) return;
    var visible = savingsBoxes.filter(function (box) { return !box.archived; });
    var goal = getActiveBoxesGoal();
    totalEl.textContent = fmtR(total);
    document.getElementById("fin-boxes-count").textContent = visible.length === 1 ? "1 caixinha" : visible.length + " caixinhas";
    document.getElementById("fin-boxes-sub").textContent = goal > 0
      ? "Guardado de " + fmtR(goal) + " em metas · fora do saldo disponível"
      : "Guardado e fora do saldo disponível";

    // barra empilhada: quanto cada caixinha representa do total guardado
    var dist = document.getElementById("fin-boxes-dist");
    var withMoney = savingsBoxes.filter(function (box) { return stats[box.id] && stats[box.id].balance > 0; });
    dist.innerHTML = total > 0
      ? withMoney.map(function (box) {
        var share = (stats[box.id].balance / total) * 100;
        return '<span style="width:' + share.toFixed(2) + '%;background:' + box.color + '" title="' + esc(box.name) + ": " + fmtR(stats[box.id].balance) + '"></span>';
      }).join("")
      : "";
    dist.classList.toggle("empty", total <= 0);

    var list = document.getElementById("fin-boxes-featured");
    var featured = getFeaturedBoxes(stats);
    list.innerHTML = featured.map(function (box) {
      var progress = getBoxProgress(box, stats[box.id]);
      return '<button type="button" class="fbx-row" data-box-open="' + esc(box.id) + '" style="--box-color:' + box.color + '">' +
        '<span class="fbx-emoji">' + esc(box.emoji) + "</span>" +
        '<span class="fbx-row-body">' +
          '<span class="fbx-row-name">' + esc(box.name) + (box.pinned ? ' <i class="ico ico-pin" aria-hidden="true"></i>' : "") + "</span>" +
          '<span class="fbx-row-top"><span class="fbx-row-val' + (progress.negative ? " fbx-neg" : "") + '">' + fmtR(progress.balance) + '</span><span class="fbx-row-meta">' +
            (progress.negative ? '<i class="ico ico-triangle-alert" aria-hidden="true"></i> Retiradas maiores que aportes' : progress.goal <= 0 ? "Sem meta" : progress.done ? '<i class="ico ico-circle-check" aria-hidden="true"></i> Concluída' : progress.pct + "% de " + fmtR(progress.goal)) + "</span></span>" +
          (progress.goal > 0 ? boxBarHtml(box, progress) : "") +
        "</span>" +
      "</button>";
    }).join("");

    var hidden = savingsBoxes.length - featured.length;
    var more = document.getElementById("fin-boxes-more");
    more.innerHTML = '<i class="ico ico-layout-grid" aria-hidden="true"></i> ' + (hidden > 0 ? "Ver todas · +" + hidden : "Gerenciar caixinhas");

    if (document.getElementById("modal-boxes").classList.contains("open")) renderBoxesModal(stats);
  }

  function openBoxesModal(screen, id) {
    boxView.screen = screen || "list";
    boxView.detailId = screen === "detail" ? id : boxView.detailId;
    boxView.editId = screen === "form" ? (id || null) : null;
    if (boxView.screen === "list") {
      // nada na aba atual mas há caixinhas em outra: não abre numa aba vazia
      var stats = getBoxStats();
      var counts = { active: 0, done: 0, archived: 0 };
      savingsBoxes.forEach(function (box) { counts[getBoxStatus(box, stats[box.id])] += 1; });
      if (!counts[boxView.tab]) boxView.tab = counts.active ? "active" : counts.done ? "done" : "archived";
      document.getElementById("fbx-search").value = boxView.query;
      document.getElementById("fbx-sort").value = boxView.sort;
    }
    if (boxView.screen === "form") fillBoxForm(boxView.editId);
    renderBoxesModal();
    openModal("modal-boxes");
  }

  function renderBoxesModal(stats) {
    stats = stats || getBoxStats();
    var screen = boxView.screen;
    if (screen === "detail" && !getBoxById(boxView.detailId)) screen = boxView.screen = "list";
    document.getElementById("fbx-list-view").hidden = screen !== "list";
    document.getElementById("fbx-detail-view").hidden = screen !== "detail";
    document.getElementById("fbx-form-view").hidden = screen !== "form";
    document.getElementById("fbx-title").textContent = screen === "form" ? (boxView.editId ? "Editar caixinha" : "Nova caixinha") : "Caixinhas";
    if (screen === "list") renderBoxesList(stats);
    if (screen === "detail") renderBoxDetail(stats);
  }

  function renderBoxesList(stats) {
    var counts = { active: 0, done: 0, archived: 0 };
    savingsBoxes.forEach(function (box) { counts[getBoxStatus(box, stats[box.id])] += 1; });
    document.querySelectorAll("#fbx-tabs .fin-seg-btn").forEach(function (btn) {
      btn.classList.toggle("active", btn.dataset.tab === boxView.tab);
      var count = btn.querySelector(".fbx-tab-count");
      if (count) count.textContent = counts[btn.dataset.tab];
    });

    var total = 0;
    savingsBoxes.forEach(function (box) { total += stats[box.id] ? stats[box.id].balance : 0; });
    var month = 0;
    savingsBoxes.forEach(function (box) { month += stats[box.id] ? stats[box.id].month : 0; });
    document.getElementById("fbx-overview").innerHTML =
      '<div class="fbx-ov-item"><span>Total guardado</span><strong>' + fmtR(total) + "</strong></div>" +
      '<div class="fbx-ov-item"><span>Metas ativas</span><strong>' + fmtR(getActiveBoxesGoal()) + "</strong></div>" +
      '<div class="fbx-ov-item"><span>Movimento no mês</span><strong class="' + (month < 0 ? "fbx-neg" : "fbx-pos") + '">' + (month < 0 ? "-" : "+") + fmtR(Math.abs(month)) + "</strong></div>";

    var query = boxView.query.trim().toLowerCase();
    var list = savingsBoxes.filter(function (box) {
      if (getBoxStatus(box, stats[box.id]) !== boxView.tab) return false;
      return !query || box.name.toLowerCase().indexOf(query) >= 0 || box.note.toLowerCase().indexOf(query) >= 0;
    });
    list = sortBoxes(list, stats, boxView.sort);

    var grid = document.getElementById("fbx-grid");
    if (!list.length) {
      grid.innerHTML = '<div class="fbx-empty"><i class="ico ico-piggy-bank" aria-hidden="true"></i><p>' +
        (query ? "Nenhuma caixinha encontrada para essa busca." : boxView.tab === "archived" ? "Nenhuma caixinha arquivada." : boxView.tab === "done" ? "Nenhuma meta concluída ainda." : "Crie uma caixinha para cada objetivo.") +
        "</p></div>";
      return;
    }
    grid.innerHTML = list.map(function (box) {
      var progress = getBoxProgress(box, stats[box.id]);
      var deadline = getBoxDeadlineInfo(box, progress);
      return '<button type="button" class="fbx-card" data-box-open="' + esc(box.id) + '" style="--box-color:' + box.color + '">' +
        '<span class="fbx-card-hd"><span class="fbx-emoji">' + esc(box.emoji) + '</span>' +
          (box.pinned ? '<i class="ico ico-pin fbx-card-pin" aria-label="Fixada"></i>' : "") + "</span>" +
        '<span class="fbx-card-name">' + esc(box.name) + "</span>" +
        '<span class="fbx-card-val' + (progress.negative ? " fbx-neg" : "") + '">' + fmtR(progress.balance) + "</span>" +
        (progress.goal > 0 ? boxBarHtml(box, progress) : '<span class="fbx-bar fbx-bar-none"></span>') +
        '<span class="fbx-card-meta">' + esc(boxGoalText(progress)) + "</span>" +
        (progress.negative ? '<span class="fbx-card-deadline late"><i class="ico ico-triangle-alert" aria-hidden="true"></i> Retiradas maiores que aportes</span>' : "") +
        (deadline ? '<span class="fbx-card-deadline' + (deadline.late ? " late" : "") + '"><i class="ico ico-calendar" aria-hidden="true"></i> ' + deadline.text + "</span>" : "") +
      "</button>";
    }).join("");
  }

  function renderBoxDetail(stats) {
    var box = getBoxById(boxView.detailId);
    var view = document.getElementById("fbx-detail-view");
    if (!box) return;
    var stat = stats[box.id];
    var progress = getBoxProgress(box, stat);
    var deadline = getBoxDeadlineInfo(box, progress);
    var estimate = getSavingsPaceEstimate(progress.balance, progress.goal, box.id);
    var movements = getBoxMovements(box.id, 8);
    var canDelete = savingsBoxes.length > 1;

    view.innerHTML =
      '<button type="button" class="fbx-back" data-box-action="back"><i class="ico ico-arrow-left" aria-hidden="true"></i> Todas as caixinhas</button>' +
      '<div class="fbx-hero" style="--box-color:' + box.color + '">' +
        '<div class="fbx-hero-top">' +
          '<span class="fbx-emoji fbx-emoji-lg">' + esc(box.emoji) + "</span>" +
          '<div class="fbx-hero-info">' +
            '<div class="fbx-hero-name">' + esc(box.name) + (box.archived ? ' <span class="fbx-chip">Arquivada</span>' : progress.done ? ' <span class="fbx-chip done">Concluída</span>' : "") + "</div>" +
            (box.note ? '<div class="fbx-hero-note">' + esc(box.note) + "</div>" : "") +
          "</div>" +
          '<div class="fbx-hero-pct">' + (progress.goal > 0 ? progress.pct + "%" : "—") + "</div>" +
        "</div>" +
        '<div class="fbx-hero-val' + (progress.negative ? " fbx-neg" : "") + '">' + fmtR(progress.balance) + "</div>" +
        (progress.goal > 0 ? boxBarHtml(box, progress) : "") +
        '<div class="fbx-hero-meta"><span>' + (progress.goal > 0 ? "Meta " + fmtR(progress.goal) : "Sem meta definida") + "</span><span>" + (progress.goal > 0 && !progress.done ? "Faltam " + fmtR(progress.missing) : "") + "</span></div>" +
      "</div>" +
      (progress.negative
        ? '<div class="fbx-warn"><i class="ico ico-triangle-alert" aria-hidden="true"></i><span>As retiradas desta caixinha somam ' + fmtR(Math.abs(progress.balance)) +
          ' a mais que os aportes. Provavelmente algum aporte (ou regra recorrente) foi para outra caixinha, ou a retirada era de outra. Abra a movimentação abaixo e escolha a caixinha certa.</span></div>'
        : "") +
      '<div class="fbx-actions">' +
        '<button type="button" class="fin-btn fin-btn-gold fin-btn-sm" data-box-action="save"><i class="ico ico-piggy-bank" aria-hidden="true"></i> Guardar</button>' +
        '<button type="button" class="fin-btn fin-btn-ghost fin-btn-sm" data-box-action="withdraw"' + (progress.balance > 0 ? "" : " disabled") + '><i class="ico ico-coins" aria-hidden="true"></i> Retirar</button>' +
        '<button type="button" class="fin-btn fin-btn-ghost fin-btn-sm" data-box-action="edit"><i class="ico ico-pencil" aria-hidden="true"></i> Editar</button>' +
        '<button type="button" class="fin-btn fin-btn-ghost fin-btn-sm" data-box-action="pin" aria-pressed="' + (box.pinned ? "true" : "false") + '"><i class="ico ico-pin" aria-hidden="true"></i> ' + (box.pinned ? "Desafixar" : "Fixar no resumo") + "</button>" +
        '<button type="button" class="fin-btn fin-btn-ghost fin-btn-sm" data-box-action="archive"><i class="ico ico-archive" aria-hidden="true"></i> ' + (box.archived ? "Desarquivar" : "Arquivar") + "</button>" +
        (canDelete ? '<button type="button" class="fin-btn fin-btn-rose fin-btn-sm" data-box-action="delete"><i class="ico ico-trash-2" aria-hidden="true"></i> Excluir</button>' : "") +
      "</div>" +
      '<div class="fbx-info-grid">' +
        '<div class="fbx-info"><span>Previsão</span><p>' + estimate.summary + "</p></div>" +
        '<div class="fbx-info"><span>Prazo</span><p>' + (box.deadline ? (deadline ? deadline.text : "Até " + fmtD(box.deadline)) : "Sem prazo. Defina um em Editar para saber quanto guardar por mês.") + "</p></div>" +
      "</div>" +
      '<div class="fbx-mov-title">Últimas movimentações</div>' +
      (movements.length
        ? '<div class="fbx-mov-list">' + movements.map(function (item) {
          return '<button type="button" class="fbx-mov" data-box-tx="' + esc(item.tx._source === "rule" ? "rule:" + item.tx._ruleId : item.tx.id) + '">' +
            '<span class="fbx-mov-desc">' + esc(item.tx.description) + '<small>' + fmtD(item.date) + (item.tx.recurrence ? " · recorrente" : "") + "</small></span>" +
            '<span class="fbx-mov-val ' + (item.delta < 0 ? "fbx-neg" : "fbx-pos") + '">' + (item.delta < 0 ? "-" : "+") + fmtR(Math.abs(item.delta)) + "</span>" +
          "</button>";
        }).join("") + "</div>"
        : '<div class="fbx-empty fbx-empty-sm"><p>Nenhuma movimentação ainda. Use Guardar para fazer o primeiro aporte.</p></div>');
  }

  function renderBoxPickers(emoji, color) {
    document.getElementById("fbx-emojis").innerHTML = BOX_EMOJIS.map(function (item) {
      return '<button type="button" class="fbx-pick' + (item === emoji ? " active" : "") + '" data-emoji="' + item + '" aria-pressed="' + (item === emoji) + '">' + item + "</button>";
    }).join("");
    document.getElementById("fbx-colors").innerHTML = BOX_COLORS.map(function (item) {
      return '<button type="button" class="fbx-swatch' + (item === color ? " active" : "") + '" data-color="' + item + '" style="background:' + item + '" aria-label="Cor ' + item + '" aria-pressed="' + (item === color) + '"></button>';
    }).join("");
  }

  function fillBoxForm(id) {
    var box = getBoxById(id);
    document.getElementById("fbx-name").value = box ? box.name : "";
    document.getElementById("fbx-goal").value = box && box.goal ? box.goal : "";
    document.getElementById("fbx-deadline").value = box ? box.deadline : "";
    document.getElementById("fbx-note").value = box ? box.note : "";
    renderBoxPickers(box ? box.emoji : BOX_EMOJIS[savingsBoxes.length % BOX_EMOJIS.length], box ? box.color : BOX_COLORS[savingsBoxes.length % BOX_COLORS.length]);
  }

  function saveBoxForm() {
    var name = document.getElementById("fbx-name").value.trim();
    if (!name) {
      toast("Dê um nome para a caixinha.", "err");
      return;
    }
    var goal = parseFloat(document.getElementById("fbx-goal").value);
    var emojiBtn = document.querySelector("#fbx-emojis .fbx-pick.active");
    var colorBtn = document.querySelector("#fbx-colors .fbx-swatch.active");
    var existing = getBoxById(boxView.editId);
    var next = normalizeSavingsBoxes([{
      id: existing ? existing.id : uid(),
      name: name,
      emoji: emojiBtn ? emojiBtn.dataset.emoji : BOX_EMOJIS[0],
      color: colorBtn ? colorBtn.dataset.color : BOX_COLORS[0],
      goal: Number.isFinite(goal) && goal > 0 ? goal : 0,
      deadline: document.getElementById("fbx-deadline").value,
      note: document.getElementById("fbx-note").value,
      pinned: existing ? existing.pinned : false,
      archived: existing ? existing.archived : false,
      createdAt: existing ? existing.createdAt : today()
    }])[0];
    if (existing) savingsBoxes[savingsBoxes.indexOf(existing)] = next;
    else savingsBoxes.push(next);
    persist();
    boxView.screen = "detail";
    boxView.detailId = next.id;
    renderAll();
    renderBoxesModal();
    toast(existing ? "Caixinha atualizada!" : "Caixinha criada!", "ok");
  }

  function deleteBox(box) {
    var used = txs.some(function (tx) { return isSavingsType(tx.type) && getTxBoxId(tx) === box.id; }) ||
      recurrenceRules.some(function (rule) { return isSavingsType(rule.type) && getTxBoxId(rule) === box.id; });
    if (used) {
      toast("Essa caixinha tem movimentações. Arquive-a para tirá-la da lista sem perder o histórico.", "err");
      return;
    }
    if (!window.confirm('Excluir a caixinha "' + box.name + '"?')) return;
    savingsBoxes = savingsBoxes.filter(function (item) { return item.id !== box.id; });
    persist();
    boxView.screen = "list";
    renderAll();
    renderBoxesModal();
    toast("Caixinha excluída.", "info");
  }

  function openBoxTx(box, type) {
    resetModal();
    setTxType(type, box.id);
    document.getElementById("mtx-desc").value = (type === "save" ? "Guardar em " : "Retirar de ") + box.name;
    openModal("modal-tx");
    document.getElementById("mtx-val").focus();
  }

  function handleBoxAction(action) {
    var box = getBoxById(boxView.detailId);
    if (action === "new") { openBoxesModal("form"); return; }
    if (action === "back") { boxView.screen = "list"; renderBoxesModal(); return; }
    if (action === "cancel-form") {
      boxView.screen = boxView.editId && getBoxById(boxView.editId) ? "detail" : "list";
      renderBoxesModal();
      return;
    }
    if (action === "save-form") { saveBoxForm(); return; }
    if (!box) return;
    if (action === "save") openBoxTx(box, "save");
    else if (action === "withdraw") openBoxTx(box, "save_withdraw");
    else if (action === "edit") openBoxesModal("form", box.id);
    else if (action === "delete") deleteBox(box);
    else if (action === "pin" || action === "archive") {
      if (action === "pin") box.pinned = !box.pinned;
      else {
        if (!box.archived && savingsBoxes.filter(function (item) { return !item.archived; }).length <= 1) {
          toast("Mantenha pelo menos uma caixinha ativa.", "err");
          return;
        }
        box.archived = !box.archived;
        if (box.archived) box.pinned = false;
      }
      persist();
      renderAll();
      renderBoxesModal();
      toast(action === "pin" ? (box.pinned ? "Caixinha fixada no resumo." : "Caixinha desafixada.") : (box.archived ? "Caixinha arquivada." : "Caixinha reativada."), "ok");
    }
  }

  function bindBoxEvents() {
    document.getElementById("fin-savings-card").addEventListener("click", function (event) {
      var row = event.target.closest("[data-box-open]");
      if (row) { openBoxesModal("detail", row.dataset.boxOpen); return; }
      if (event.target.closest("#fin-boxes-new")) { openBoxesModal("form"); return; }
      if (event.target.closest("#fin-boxes-more")) openBoxesModal("list");
    });
    var modal = document.getElementById("modal-boxes");
    modal.addEventListener("click", function (event) {
      if (event.target === event.currentTarget) { closeModal("modal-boxes"); return; }
      var open = event.target.closest("[data-box-open]");
      if (open) { openBoxesModal("detail", open.dataset.boxOpen); return; }
      var txBtn = event.target.closest("[data-box-tx]");
      if (txBtn) {
        var ref = txBtn.dataset.boxTx;
        if (ref.indexOf("rule:") === 0) openRecurringManager(ref.slice(5));
        else openEdit(ref);
        return;
      }
      var tab = event.target.closest("#fbx-tabs [data-tab]");
      if (tab) { boxView.tab = tab.dataset.tab; renderBoxesModal(); return; }
      var emoji = event.target.closest("[data-emoji]");
      var color = event.target.closest("[data-color]");
      if (emoji || color) {
        var current = document.querySelector("#fbx-emojis .fbx-pick.active");
        var currentColor = document.querySelector("#fbx-colors .fbx-swatch.active");
        renderBoxPickers(emoji ? emoji.dataset.emoji : (current && current.dataset.emoji), color ? color.dataset.color : (currentColor && currentColor.dataset.color));
        return;
      }
      var action = event.target.closest("[data-box-action]");
      if (action && !action.disabled) handleBoxAction(action.dataset.boxAction);
    });
    document.getElementById("fbx-close").addEventListener("click", function () { closeModal("modal-boxes"); });
    document.getElementById("fbx-search").addEventListener("input", function () {
      boxView.query = this.value;
      renderBoxesModal();
    });
    document.getElementById("fbx-sort").addEventListener("change", function () {
      boxView.sort = this.value;
      renderBoxesModal();
    });
    document.getElementById("fbx-form-view").addEventListener("keydown", function (event) {
      if (event.key === "Enter" && event.target.tagName === "INPUT") {
        event.preventDefault();
        saveBoxForm();
      }
    });
  }

  function addCategoryManagerRow(container, type, category) {
    if (!container) return;
    var row = document.createElement("div");
    var locked = category === "Outros";
    row.className = "fin-cat-manager-row" + (locked ? " locked" : "");
    row.innerHTML =
      '<input type="text" class="fin-fi fin-cat-manager-input" value="' + esc(category) + '"' + (locked ? " disabled" : "") + ">" +
      '<button class="fin-btn fin-btn-rose fin-btn-sm fin-cat-manager-del" type="button" aria-label="Excluir categoria"' + (locked ? " disabled" : "") + '><i class="ico ico-trash-2" aria-hidden="true"></i></button>';
    row.dataset.original = category;
    row.dataset.type = type;
    container.appendChild(row);
  }

  function renderCategoryManagerSection(type, containerId) {
    var container = document.getElementById(containerId);
    if (!container) return;
    var categories = getCategoriesForType(type);
    container.innerHTML = "";
    categories.forEach(function (category) {
      addCategoryManagerRow(container, type, category);
    });
  }

  function renderCategoryManager() {
    renderCategoryManagerSection("in", "fin-cat-manager-in");
    renderCategoryManagerSection("out", "fin-cat-manager-out");
  }

  function openCategoryManager() {
    renderCategoryManager();
    openModal("modal-categories");
  }

  function collectCategoryManager(type, containerId) {
    var rows = Array.prototype.slice.call(document.querySelectorAll("#" + containerId + " .fin-cat-manager-row"));
    var names = [];
    var renames = [];
    rows.forEach(function (row) {
      var input = row.querySelector(".fin-cat-manager-input");
      var original = row.dataset.original;
      var nextName = (input ? input.value : "").trim();
      if (!nextName) return;
      if (names.indexOf(nextName) === -1) names.push(nextName);
      if (original && original !== nextName) renames.push({ from: original, to: nextName, type: type });
    });
    if (names.indexOf("Outros") === -1) names.push("Outros");
    return { names: names, renames: renames };
  }

  function remapTransactionsCategory(type, oldName, newName) {
    txs.forEach(function (tx) {
      if (tx.type === type && tx.category === oldName) tx.category = newName;
    });
    recurrenceRules.forEach(function (rule) {
      if (rule.type === type && rule.category === oldName) rule.category = newName;
    });
  }

  function saveCategoryManager() {
    var nextIn = collectCategoryManager("in", "fin-cat-manager-in");
    var nextOut = collectCategoryManager("out", "fin-cat-manager-out");
    var removedIn = getCategoriesForType("in").filter(function (name) { return nextIn.names.indexOf(name) === -1; });
    var removedOut = getCategoriesForType("out").filter(function (name) { return nextOut.names.indexOf(name) === -1; });
    var nextSets = {
      in: nextIn.names,
      out: nextOut.names,
      save: ["Poupan\u00e7a"]
    };
    nextIn.renames.concat(nextOut.renames).forEach(function (change) {
      remapTransactionsCategory(change.type, change.from, change.to);
    });
    removedIn.forEach(function (name) {
      if (name !== "Outros") remapTransactionsCategory("in", name, "Outros");
    });
    removedOut.forEach(function (name) {
      if (name !== "Outros") remapTransactionsCategory("out", name, "Outros");
    });
    categorySets = normalizeCategorySets(nextSets);
    persist();
    syncCategoryOptions(txType);
    renderAll();
    closeModal("modal-categories");
    toast("Categorias atualizadas!", "ok");
  }

  function syncRuleCategoryOptions(type, boxId) {
    var catSel = document.getElementById("mr-category");
    if (!catSel) return;
    var label = document.getElementById("mr-category-label");
    if (label) label.textContent = isSavingsType(type) ? "Caixinha" : "Categoria";
    if (isSavingsType(type)) {
      fillBoxOptions(catSel, boxId);
      return;
    }
    var cats = getCategoriesForType(type);
    catSel.innerHTML = "";
    cats.forEach(function (cat) {
      var option = document.createElement("option");
      option.value = cat;
      option.textContent = cat;
      catSel.appendChild(option);
    });
  }

  function toggleRulePattern(pattern) {
    document.getElementById("mr-pattern-nth").hidden = pattern !== "nth_counted_day";
    document.getElementById("mr-pattern-fixed").hidden = pattern !== "fixed_day";
  }

  function resetRuleForm() {
    editRuleId = null;
    document.getElementById("mr-name").value = "";
    document.getElementById("mr-start-date").value = today();
    document.getElementById("mr-description").value = "";
    document.getElementById("mr-type").value = "in";
    document.getElementById("mr-value").value = "";
    document.getElementById("mr-pattern").value = "nth_counted_day";
    document.getElementById("mr-nth").value = 5;
    document.getElementById("mr-count-saturday").checked = true;
    document.getElementById("mr-avoid-holiday").checked = true;
    document.getElementById("mr-shift").value = "previous_business_day";
    document.getElementById("mr-day").value = 20;
    document.getElementById("mr-fixed-shift").value = "previous_business_day";
    document.getElementById("mr-avoid-weekend").checked = true;
    document.getElementById("mr-fixed-avoid-holiday").checked = false;
    document.getElementById("mr-holidays").value = "";
    document.getElementById("mr-note").value = "";
    document.getElementById("mr-delete").style.display = "none";
    syncRuleCategoryOptions("in");
    document.getElementById("mr-category").value = "Salário";
    toggleRulePattern("nth_counted_day");
  }

  function fillRuleForm(ruleId) {
    var rule = recurrenceRules.find(function (item) { return item.id === ruleId; });
    if (!rule) return;
    editRuleId = rule.id;
    document.getElementById("mr-name").value = rule.name;
    document.getElementById("mr-start-date").value = rule.startDate;
    document.getElementById("mr-description").value = rule.description;
    document.getElementById("mr-type").value = rule.type;
    document.getElementById("mr-value").value = rule.value;
    document.getElementById("mr-pattern").value = rule.pattern;
    document.getElementById("mr-nth").value = rule.nth;
    document.getElementById("mr-count-saturday").checked = rule.countSaturday;
    document.getElementById("mr-avoid-holiday").checked = rule.avoidHoliday;
    document.getElementById("mr-shift").value = rule.shift;
    document.getElementById("mr-day").value = rule.day;
    document.getElementById("mr-fixed-shift").value = rule.shift;
    document.getElementById("mr-avoid-weekend").checked = rule.avoidWeekend;
    document.getElementById("mr-fixed-avoid-holiday").checked = rule.fixedAvoidHoliday;
    document.getElementById("mr-holidays").value = (rule.holidays || []).join("\n");
    document.getElementById("mr-note").value = rule.note || "";
    syncRuleCategoryOptions(rule.type, rule.boxId);
    if (!isSavingsType(rule.type)) document.getElementById("mr-category").value = rule.category || getCategoriesForType(rule.type)[0] || "";
    document.getElementById("mr-delete").style.display = "inline-flex";
    toggleRulePattern(rule.pattern);
  }

  function collectRuleForm() {
    var pattern = document.getElementById("mr-pattern").value;
    var holidays = document.getElementById("mr-holidays").value.split(/\r?\n/).map(function (item) { return item.trim(); }).filter(Boolean);
    var type = document.getElementById("mr-type").value;
    var picked = document.getElementById("mr-category").value;
    return {
      id: editRuleId || uid(),
      name: document.getElementById("mr-name").value.trim(),
      startDate: document.getElementById("mr-start-date").value,
      description: document.getElementById("mr-description").value.trim(),
      type: type,
      value: parseFloat(document.getElementById("mr-value").value),
      category: isSavingsType(type) ? "Poupan\u00e7a" : picked,
      boxId: isSavingsType(type) ? picked : "",
      pattern: pattern,
      nth: parseInt(document.getElementById("mr-nth").value, 10),
      countSaturday: document.getElementById("mr-count-saturday").checked,
      avoidHoliday: document.getElementById("mr-avoid-holiday").checked,
      shift: pattern === "fixed_day" ? document.getElementById("mr-fixed-shift").value : document.getElementById("mr-shift").value,
      day: parseInt(document.getElementById("mr-day").value, 10),
      avoidWeekend: document.getElementById("mr-avoid-weekend").checked,
      fixedAvoidHoliday: document.getElementById("mr-fixed-avoid-holiday").checked,
      holidays: holidays,
      note: document.getElementById("mr-note").value.trim()
    };
  }

  function renderRuleList() {
    var list = document.getElementById("fin-recurring-list");
    if (!list) return;
    if (!recurrenceRules.length) {
      list.innerHTML = '<div class="fin-recurring-empty">Nenhuma regra criada ainda.</div>';
      return;
    }
    list.innerHTML = "";
    recurrenceRules.forEach(function (rule) {
      var card = document.createElement("button");
      card.type = "button";
      card.className = "fin-recurring-card" + (rule.id === editRuleId ? " active" : "");
      card.innerHTML =
        '<div class="fin-recurring-card-title">' + esc(rule.name) + '</div>' +
        '<div class="fin-recurring-card-meta">' + fmtR(rule.value) + ' · ' + esc(isSavingsType(rule.type) && getBoxById(rule.boxId) ? getBoxById(rule.boxId).name : rule.category) + '</div>' +
        '<div class="fin-recurring-card-sub">' + (rule.pattern === "fixed_day" ? ("Dia " + esc(rule.day) + " com ajuste") : (esc(rule.nth) + "º dia útil com sábado contando")) + '</div>';
      card.addEventListener("click", function () {
        fillRuleForm(rule.id);
        renderRuleList();
      });
      list.appendChild(card);
    });
  }

  function openRecurringManager(ruleId) {
    renderRuleList();
    if (ruleId) fillRuleForm(ruleId);
    else resetRuleForm();
    renderRuleList();
    openModal("modal-recurring");
  }

  function saveRecurringRule() {
    var rule = collectRuleForm();
    if (!rule.name || !rule.startDate || !rule.description || !Number.isFinite(rule.value) || rule.value <= 0) {
      toast("Preencha nome, início, descrição e valor da regra.", "err");
      return;
    }
    if (rule.pattern === "nth_counted_day" && (!Number.isFinite(rule.nth) || rule.nth < 1)) {
      toast("Defina um número válido para o dia útil contado.", "err");
      return;
    }
    if (rule.pattern === "fixed_day" && (!Number.isFinite(rule.day) || rule.day < 1 || rule.day > 31)) {
      toast("Defina um dia fixo válido do mês.", "err");
      return;
    }
    rule = normalizeRecurrenceRules([rule])[0];
    var idx = recurrenceRules.findIndex(function (item) { return item.id === rule.id; });
    if (idx >= 0) recurrenceRules[idx] = rule;
    else recurrenceRules.push(rule);
    editRuleId = rule.id;
    persist();
    renderAll();
    renderRuleList();
    toast("Regra de recorrência salva!", "ok");
  }

  function deleteRecurringRule() {
    if (!editRuleId) return;
    var rule = recurrenceRules.find(function (item) { return item.id === editRuleId; });
    if (!rule) return;
    if (!window.confirm('Excluir a regra "' + rule.name + '"?')) return;
    recurrenceRules = recurrenceRules.filter(function (item) { return item.id !== editRuleId; });
    resetRuleForm();
    persist();
    renderAll();
    renderRuleList();
    toast("Regra de recorrência excluída.", "info");
  }

  // Lista as caixinhas num <select>; arquivadas só aparecem se já forem a escolhida.
  function fillBoxOptions(select, selectedId) {
    select.innerHTML = "";
    savingsBoxes.forEach(function (box) {
      if (box.archived && box.id !== selectedId) return;
      var option = document.createElement("option");
      option.value = box.id;
      option.textContent = box.emoji + " " + box.name + (box.archived ? " (arquivada)" : "");
      select.appendChild(option);
    });
    if (selectedId && getBoxById(selectedId)) select.value = selectedId;
  }

  function syncCategoryOptions(type, boxId) {
    var catSel = document.getElementById("mtx-cat");
    var label = document.getElementById("mtx-cat-label");
    if (label) label.textContent = isSavingsType(type) ? "Caixinha" : "Categoria";
    if (isSavingsType(type)) {
      fillBoxOptions(catSel, boxId);
      return;
    }
    var cats = getCategoriesForType(type);
    catSel.innerHTML = "";
    cats.forEach(function (cat) {
      var option = document.createElement("option");
      option.value = cat;
      option.textContent = cat;
      catSel.appendChild(option);
    });
  }

  function setTxType(type, boxId) {
    var keepBox = isSavingsType(txType) ? document.getElementById("mtx-cat").value : "";
    txType = type;
    document.getElementById("tt-in").className = "fin-tt-btn" + (type === "in" ? " active-in" : "");
    document.getElementById("tt-out").className = "fin-tt-btn" + (type === "out" ? " active-out" : "");
    document.getElementById("tt-save").className = "fin-tt-btn" + (type === "save" ? " active-save" : "");
    document.getElementById("tt-save-withdraw").className = "fin-tt-btn" + (type === "save_withdraw" ? " active-save-withdraw" : "");
    syncCategoryOptions(type, boxId || keepBox);
  }

  function resetModal() {
    editId = null;
    txType = "in";
    document.getElementById("mtx-title").textContent = "Nova Transação";
    document.getElementById("mtx-save").innerHTML = '<i class="ico ico-plus" aria-hidden="true"></i> Adicionar';
    document.getElementById("mtx-del").style.display = "none";
    document.getElementById("mtx-desc").value = "";
    document.getElementById("mtx-val").value = "";
    document.getElementById("mtx-date").value = today();
    document.getElementById("mtx-rec").value = "";
    document.getElementById("mtx-note").value = "";
    setTxType("in");
    document.getElementById("mtx-cat").value = "Salário";
  }

  function openEdit(id) {
    var tx = txs.find(function (item) { return item.id === id; });
    if (!tx) return;
    editId = id;
    setTxType(tx.type, isSavingsType(tx.type) ? getTxBoxId(tx) : "");
    document.getElementById("mtx-title").textContent = "Editar Transação";
    document.getElementById("mtx-save").innerHTML = '<i class="ico ico-save" aria-hidden="true"></i> Salvar';
    document.getElementById("mtx-del").style.display = "inline-flex";
    document.getElementById("mtx-desc").value = tx.description;
    document.getElementById("mtx-val").value = tx.value;
    document.getElementById("mtx-date").value = tx.date;
    if (!isSavingsType(tx.type)) document.getElementById("mtx-cat").value = tx.category;
    document.getElementById("mtx-rec").value = tx.recurrence || "";
    document.getElementById("mtx-note").value = tx.note || "";
    openModal("modal-tx");
  }

  function openGeneratedSource(tx) {
    if (tx && tx._source === "rule" && tx._ruleId) {
      openRecurringManager(tx._ruleId);
      return;
    }
    openEdit(tx && (tx._original || tx.id));
  }

  function openCreateAtDate(date) {
    resetModal();
    document.getElementById("mtx-date").value = date;
    openModal("modal-tx");
  }

  function bindEvents() {
    document.getElementById("btn-open-fin-analytics").addEventListener("click", finOpenAnalytics);
    document.getElementById("btn-close-fin-analytics").addEventListener("click", finCloseAnalytics);
    document.getElementById("btn-add-tx").addEventListener("click", function () {
      resetModal();
      openModal("modal-tx");
    });
    document.getElementById("mtx-close").addEventListener("click", function () { closeModal("modal-tx"); });
    document.getElementById("mtx-cancel").addEventListener("click", function () { closeModal("modal-tx"); });
    document.getElementById("modal-tx").addEventListener("click", function (event) {
      if (event.target === event.currentTarget) closeModal("modal-tx");
    });
    document.getElementById("modal-categories").addEventListener("click", function (event) {
      if (event.target === event.currentTarget) closeModal("modal-categories");
    });
    document.getElementById("modal-recurring").addEventListener("click", function (event) {
      if (event.target === event.currentTarget) closeModal("modal-recurring");
    });
    document.getElementById("tt-in").addEventListener("click", function () { setTxType("in"); });
    document.getElementById("tt-out").addEventListener("click", function () { setTxType("out"); });
    document.getElementById("tt-save").addEventListener("click", function () { setTxType("save"); });
    document.getElementById("tt-save-withdraw").addEventListener("click", function () { setTxType("save_withdraw"); });
    document.getElementById("fin-manage-categories").addEventListener("click", openCategoryManager);
    document.getElementById("fin-manage-recurring").addEventListener("click", function () { openRecurringManager(); });
    document.getElementById("mc-close").addEventListener("click", function () { closeModal("modal-categories"); });
    document.getElementById("mc-cancel").addEventListener("click", function () { closeModal("modal-categories"); });
    document.getElementById("mc-save").addEventListener("click", saveCategoryManager);
    document.getElementById("mr-close").addEventListener("click", function () { closeModal("modal-recurring"); });
    document.getElementById("mr-cancel").addEventListener("click", function () { closeModal("modal-recurring"); });
    document.getElementById("mr-new").addEventListener("click", function () {
      resetRuleForm();
      renderRuleList();
    });
    document.getElementById("mr-save").addEventListener("click", saveRecurringRule);
    document.getElementById("mr-delete").addEventListener("click", deleteRecurringRule);
    document.getElementById("mr-type").addEventListener("change", function () {
      syncRuleCategoryOptions(this.value);
    });
    document.getElementById("mr-pattern").addEventListener("change", function () {
      toggleRulePattern(this.value);
    });
    document.getElementById("fin-cat-add-in").addEventListener("click", function () {
      var input = document.getElementById("fin-cat-new-in");
      var value = input.value.trim();
      if (!value) return;
      addCategoryManagerRow(document.getElementById("fin-cat-manager-in"), "in", value);
      input.value = "";
    });
    document.getElementById("fin-cat-add-out").addEventListener("click", function () {
      var input = document.getElementById("fin-cat-new-out");
      var value = input.value.trim();
      if (!value) return;
      addCategoryManagerRow(document.getElementById("fin-cat-manager-out"), "out", value);
      input.value = "";
    });
    document.getElementById("fin-cat-manager-in").addEventListener("click", function (event) {
      var btn = event.target.closest(".fin-cat-manager-del");
      if (!btn) return;
      btn.closest(".fin-cat-manager-row").remove();
    });
    document.getElementById("fin-cat-manager-out").addEventListener("click", function (event) {
      var btn = event.target.closest(".fin-cat-manager-del");
      if (!btn) return;
      btn.closest(".fin-cat-manager-row").remove();
    });
    bindBoxEvents();

    document.getElementById("mtx-save").addEventListener("click", function () {
      var desc = document.getElementById("mtx-desc").value.trim();
      var value = cents(parseFloat(document.getElementById("mtx-val").value));
      var date = document.getElementById("mtx-date").value;
      if (!desc || !value || value <= 0 || !date) {
        toast("Preencha descrição, valor e data.", "err");
        return;
      }

      var tx = {
        id: editId || uid(),
        type: txType,
        description: desc,
        value: value,
        date: date,
        category: document.getElementById("mtx-cat").value,
        recurrence: document.getElementById("mtx-rec").value,
        note: document.getElementById("mtx-note").value.trim()
      };
      if (isSavingsType(tx.type)) {
        tx.boxId = tx.category;
        tx.category = "Poupan\u00e7a";
        if (!getBoxById(tx.boxId)) {
          toast("Escolha uma caixinha.", "err");
          return;
        }
      }

      if (tx.type === "save_withdraw") {
        var savingsBalance = getSavingsBalanceUntil(tx.date, editId, tx.boxId);
        if (tx.value > savingsBalance) {
          toast("Esse valor é maior do que o saldo da caixinha até essa data.", "err");
          return;
        }
      }

      if (editId) {
        var idx = txs.findIndex(function (item) { return item.id === editId; });
        if (idx >= 0) txs[idx] = tx;
        toast("Transação atualizada!", "ok");
      } else {
        txs.push(tx);
        toast("Transação adicionada!", "ok");
      }

      persist();
      renderAll();
      closeModal("modal-tx");
    });

    document.getElementById("mtx-del").addEventListener("click", function () {
      if (!editId) return;
      var tx = txs.find(function (item) { return item.id === editId; });
      if (!tx) return;
      if (!window.confirm('Excluir "' + tx.description + '"?')) return;
      txs = txs.filter(function (item) { return item.id !== editId; });
      finCalSelection.ids.delete(String(editId));
      persist();
      renderAll();
      closeModal("modal-tx");
      toast("Transação excluída.", "info");
    });

    document.getElementById("seg-chart").addEventListener("click", function (event) {
      var btn = event.target.closest(".fin-seg-btn");
      if (!btn) return;
      document.querySelectorAll("#seg-chart .fin-seg-btn").forEach(function (item) { item.classList.remove("active"); });
      btn.classList.add("active");
      chartView = btn.dataset.v;
      drawFluxChart();
    });

    document.getElementById("seg-tx").addEventListener("click", function (event) {
      var btn = event.target.closest(".fin-seg-btn");
      if (!btn) return;
      document.querySelectorAll("#seg-tx .fin-seg-btn").forEach(function (item) { item.classList.remove("active"); });
      btn.classList.add("active");
      txFilter = btn.dataset.v;
      renderTxList();
    });

    document.getElementById("cal-prev").addEventListener("click", function () {
      calMonth -= 1;
      if (calMonth < 0) {
        calMonth = 11;
        calYear -= 1;
      }
      renderCalendar();
    });

    document.getElementById("cal-next").addEventListener("click", function () {
      calMonth += 1;
      if (calMonth > 11) {
        calMonth = 0;
        calYear += 1;
      }
      renderCalendar();
    });

    document.getElementById("cal-today").addEventListener("click", function () {
      var ym = nowYM();
      calYear = ym.y;
      calMonth = ym.m;
      finCalSelectedDate = today();
      renderCalendar();
    });

    window.addEventListener("resize", function () {
      drawFluxChart();
      drawBalanceChart();
      drawSavingsHistoryChart();
      drawSavingsProjectionChart();
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        // fecha só a camada de cima: a transação aberta a partir de uma caixinha volta para a caixinha
        if (document.getElementById("modal-tx").classList.contains("open")) { closeModal("modal-tx"); return; }
        if (document.getElementById("modal-recurring").classList.contains("open")) { closeModal("modal-recurring"); return; }
        if (document.getElementById("modal-categories").classList.contains("open")) closeModal("modal-categories");
        if (document.getElementById("modal-boxes").classList.contains("open")) { closeModal("modal-boxes"); return; }
        if (document.getElementById("fin-analytics").classList.contains("open")) finCloseAnalytics();
      }
    });
  }

  function init() {
    loadData();
    var ym = nowYM();
    calYear = ym.y;
    calMonth = ym.m;
    resetModal();
    bindEvents();
    renderAll();
    finCalInitInteractions();

    // Quando os dados da nuvem são aplicados (login/sincronização), recarrega e redesenha,
    // refazendo a projeção da poupança com os lançamentos atualizados.
    window.addEventListener("soter:remote-state-applied", function () {
      loadData();
      renderAll();
    });
  }

  init();
}());
