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
    "Outros": "#7a7590"
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
      return;
    }
    if (Array.isArray(data.financas)) {
      txs = data.financas.slice();
      savingsGoal = Number(data.financasSavingsGoal || 0);
      categorySets = normalizeCategorySets(data.financasCategorySets);
      recurrenceRules = normalizeRecurrenceRules(data.financasRecurrenceRules);
      persist();
      return;
    }
    categorySets = normalizeCategorySets(categorySets);
    recurrenceRules = normalizeRecurrenceRules(recurrenceRules);
  }

  function persist() {
    var state = getState();
    if (!state.data || typeof state.data !== "object") state.data = {};
    state.data[DATA_KEY] = { txs: txs.slice(), savingsGoal: savingsGoal, categorySets: cloneCategorySets(categorySets), recurrenceRules: cloneRecurrenceRules(recurrenceRules) };
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
        holidays: Array.isArray(rule.holidays) ? rule.holidays.filter(Boolean) : []
      };
    });
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
    var parts = dateStr.split("-");
    return parts[2] + "/" + parts[1] + "/" + parts[0];
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

  function getRuleOccurrencesForMonth(year, month) {
    return recurrenceRules.filter(function (rule) {
      return !!rule && Number(rule.value) > 0;
    }).map(function (rule) {
      var date = buildRuleDate(rule, year, month);
      if (date < rule.startDate) return null;
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
        note: rule.note || ""
      };
    }).filter(Boolean);
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
    var icons = { ok: "fa-check-circle", err: "fa-exclamation-circle", info: "fa-info-circle" };
    var cols = { ok: "var(--fin-teal)", err: "var(--fin-rose)", info: "var(--fin-sky)" };
    var container = document.getElementById("toasts");
    if (!container) return;
    var el = document.createElement("div");
    el.className = "fin-toast " + type;
    el.innerHTML = '<i class="fas ' + icons[type] + '" style="color:' + cols[type] + '"></i> ' + msg;
    container.appendChild(el);
    setTimeout(function () {
      el.style.animation = "fin-tOut .3s ease forwards";
      setTimeout(function () { el.remove(); }, 300);
    }, 2800);
  }

  function expandRecurring(year, month) {
    var result = [];
    txs.forEach(function (tx) {
      var baseDate = new Date(tx.date + "T12:00:00");
      var txYear = baseDate.getFullYear();
      var txMonth = baseDate.getMonth();

      if (tx.recurrence === "monthly") {
        if (year > txYear || (year === txYear && month >= txMonth)) {
          var monthlyDate = year + "-" + String(month + 1).padStart(2, "0") + "-" + String(baseDate.getDate()).padStart(2, "0");
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
        var lastOfMonth = new Date(year, month + 1, 0);
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

  function getSavingsBalanceUntil(dateStr, ignoreTxId) {
    var balance = 0;
    txs.forEach(function (tx) {
      if (ignoreTxId && tx.id === ignoreTxId) return;
      if (!isSavingsType(tx.type)) return;
      if (tx.recurrence === "monthly") {
        var monthlyCur = new Date(tx.date + "T12:00:00");
        var endMonthly = new Date(dateStr + "T12:00:00");
        while (monthlyCur <= endMonthly) {
          balance += getSavingsDelta(tx);
          monthlyCur.setMonth(monthlyCur.getMonth() + 1);
        }
      } else if (tx.recurrence === "weekly") {
        var weeklyCur = new Date(tx.date + "T12:00:00");
        var endWeekly = new Date(dateStr + "T12:00:00");
        while (weeklyCur <= endWeekly) {
          balance += getSavingsDelta(tx);
          weeklyCur.setDate(weeklyCur.getDate() + 7);
        }
      } else if (tx.date <= dateStr) {
        balance += getSavingsDelta(tx);
      }
    });
    getRuleOccurrencesUntil(dateStr).forEach(function (tx) {
      if (isSavingsType(tx.type)) balance += getSavingsDelta(tx);
    });
    return balance;
  }

  function getSavingsDepositOccurrencesUntil(dateStr, ignoreTxId) {
    var occurrences = [];
    txs.forEach(function (tx) {
      if (ignoreTxId && tx.id === ignoreTxId) return;
      if (tx.type !== "save") return;
      if (tx.recurrence === "monthly") {
        var monthlyCur = new Date(tx.date + "T12:00:00");
        var endMonthly = new Date(dateStr + "T12:00:00");
        while (monthlyCur <= endMonthly) {
          occurrences.push({
            date: getMonthDateStr(monthlyCur.getFullYear(), monthlyCur.getMonth(), monthlyCur.getDate()),
            value: Number(tx.value || 0)
          });
          monthlyCur.setMonth(monthlyCur.getMonth() + 1);
        }
      } else if (tx.recurrence === "weekly") {
        var weeklyCur = new Date(tx.date + "T12:00:00");
        var endWeekly = new Date(dateStr + "T12:00:00");
        while (weeklyCur <= endWeekly) {
          occurrences.push({
            date: getMonthDateStr(weeklyCur.getFullYear(), weeklyCur.getMonth(), weeklyCur.getDate()),
            value: Number(tx.value || 0)
          });
          weeklyCur.setDate(weeklyCur.getDate() + 7);
        }
      } else if (tx.date <= dateStr) {
        occurrences.push({ date: tx.date, value: Number(tx.value || 0) });
      }
    });
    getRuleOccurrencesUntil(dateStr).forEach(function (tx) {
      if (tx.type !== "save") return;
      occurrences.push({ date: tx.date, value: Number(tx.value || 0) });
    });
    occurrences.sort(function (a, b) { return a.date.localeCompare(b.date); });
    return occurrences;
  }

  var SAVINGS_PROJECTION_CFG = {
    windowMonths: 12,
    minDeposits: 4,
    minMonthsWithDeposit: 3,
    recentWeight: 0.85,
    outlierCap: 2.5
  };

  function monthIdxOf(dateStr) {
    return Number(dateStr.slice(0, 4)) * 12 + (Number(dateStr.slice(5, 7)) - 1);
  }

  function medianOf(list) {
    if (!list.length) return 0;
    var sorted = list.slice().sort(function (x, y) { return x - y; });
    var half = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[half] : (sorted[half - 1] + sorted[half]) / 2;
  }

  // Projeção mensal baseada no histórico de aportes (tempo + valor).
  // mode "history": média ponderada dos meses (recentes pesam mais, meses sem aporte contam como 0).
  // mode "monthly": padrão — média mensal simples quando o histórico é insuficiente.
  function getSavingsProjection(reserve, goal) {
    var cfg = SAVINGS_PROJECTION_CFG;
    var missing = Math.max(0, Number(goal || 0) - Number(reserve || 0));
    var nowIdx = monthIdxOf(today());
    var deposits = getSavingsDepositOccurrencesUntil(today()).filter(function (item) {
      return Number(item.value) > 0 && monthIdxOf(item.date) >= nowIdx - cfg.windowMonths;
    });
    var base = { mode: "none", monthlyRate: 0, missing: missing, monthsToGoal: null, etaDate: null, daysToGoal: null };
    if (!deposits.length) return base;

    var totals = {};
    deposits.forEach(function (item) {
      var idx = monthIdxOf(item.date);
      totals[idx] = (totals[idx] || 0) + Number(item.value);
    });
    var firstIdx = monthIdxOf(deposits[0].date);
    var lastIdx = nowIdx - 1 >= firstIdx ? nowIdx - 1 : nowIdx; // só meses fechados, se houver
    var months = [];
    for (var i = firstIdx; i <= lastIdx; i += 1) months.push({ idx: i, total: totals[i] || 0 });

    var paid = months.filter(function (m) { return m.total > 0; });
    var cap = medianOf(paid.map(function (m) { return m.total; })) * cfg.outlierCap;
    var historyOk = deposits.length >= cfg.minDeposits && paid.length >= cfg.minMonthsWithDeposit;
    var rate;
    var mode;
    if (historyOk) {
      mode = "history";
      var num = 0;
      var den = 0;
      months.forEach(function (m) {
        var weight = Math.pow(cfg.recentWeight, lastIdx - m.idx);
        num += Math.min(m.total, cap) * weight;
        den += weight;
      });
      rate = num / den;
    } else {
      mode = "monthly";
      rate = months.reduce(function (sum, m) { return sum + m.total; }, 0) / Math.max(1, months.length);
    }
    if (!(rate > 0)) return base;

    var typicalDay = Math.round(medianOf(deposits.map(function (item) { return Number(item.date.slice(8, 10)); })));
    var result = { mode: mode, monthlyRate: rate, missing: missing, monthsToGoal: 0, etaDate: null, daysToGoal: 0, typicalDay: typicalDay };
    if (missing > 0) {
      var steps = Math.ceil(missing / rate);
      var t = new Date(today() + "T12:00:00");
      var target = new Date(t.getFullYear(), t.getMonth() + steps, 1, 12, 0, 0);
      var lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
      target.setDate(Math.min(Math.max(1, typicalDay), lastDay));
      if (target <= t) target = new Date(target.getFullYear(), target.getMonth() + 1, Math.min(Math.max(1, typicalDay), 28), 12, 0, 0);
      result.monthsToGoal = steps;
      result.etaDate = getMonthDateStr(target.getFullYear(), target.getMonth(), target.getDate());
      result.daysToGoal = Math.max(1, diffDays(today(), result.etaDate));
    }
    return result;
  }

  function getSavingsPaceEstimate(reserve, goal) {
    if (goal <= 0) {
      return { summary: "Defina uma meta para calcular a estimativa.", metaLeft: "Meta atual" };
    }
    if (Math.max(0, goal - reserve) <= 0) {
      return { summary: "Objetivo concluído. A meta já foi atingida.", metaLeft: "Meta atingida" };
    }
    var p = getSavingsProjection(reserve, goal);
    if (p.mode === "none") {
      return { summary: "Adicione aportes na poupança para estimar o tempo até a meta.", metaLeft: "Meta atual" };
    }
    var origem = p.mode === "history" ? "pelo seu histórico de aportes" : "em média mensal";
    var meses = p.monthsToGoal === 1 ? "1 mês" : p.monthsToGoal + " meses";
    return {
      summary: "Guardando cerca de " + fmtR(p.monthlyRate) + " por mês (" + origem + "), a meta chega em ~" + meses + ".",
      metaLeft: "Estimativa " + fmtD(p.etaDate)
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
        var monthlyCur = new Date(tx.date + "T12:00:00");
        var now = new Date();
        while (monthlyCur <= now) {
          saldo += getTxDelta(tx);
          savingsTotal += getSavingsDelta(tx);
          monthlyCur.setMonth(monthlyCur.getMonth() + 1);
        }
      } else if (tx.recurrence === "weekly") {
        var weeklyCur = new Date(tx.date + "T12:00:00");
        var nowWeekly = new Date();
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

    var reserve = Math.max(0, savingsTotal);
    var reservePct = savingsGoal > 0 ? Math.max(0, Math.min(100, Math.round((reserve / savingsGoal) * 100))) : 0;
    var reserveMonth = monthTxs.reduce(function (sum, tx) {
      return sum + getSavingsDelta(tx);
    }, 0);
    var reserveHistory = [];
    txs.forEach(function (tx) {
      if (!isSavingsType(tx.type)) return;
      if (tx.recurrence === "monthly") {
        var monthlyCur = new Date(tx.date + "T12:00:00");
        var nowMonthly = new Date();
        while (monthlyCur <= nowMonthly) {
          reserveHistory.push({ date: getMonthDateStr(monthlyCur.getFullYear(), monthlyCur.getMonth(), monthlyCur.getDate()), value: getSavingsDelta(tx) });
          monthlyCur.setMonth(monthlyCur.getMonth() + 1);
        }
      } else if (tx.recurrence === "weekly") {
        var weeklyCur = new Date(tx.date + "T12:00:00");
        var nowWeeklyHistory = new Date();
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
    var reserveMissing = Math.max(0, Number(savingsGoal || 0) - reserve);
    var reserveMonthSeries = reserveMonths.map(function (key) {
      return { key: key, value: reserveMonthsMap[key] };
    });
    var savingsProjection = getSavingsProjection(reserve, savingsGoal);
    var reserveAverage = savingsProjection.monthlyRate;
    var projectedDate = null;
    var projectedDays = null;
    var projectionSeries = [];
    if (savingsGoal > 0) {
      if (reserve >= savingsGoal) {
        projectedDate = today();
        projectedDays = 0;
        projectionSeries.push({ label: "Hoje", value: reserve, current: true });
      } else if (reserveAverage > 0) {
        var runningReserve = reserve;
        var todayDate = new Date(today() + "T12:00:00");
        projectionSeries.push({ label: "Hoje", value: reserve, current: true });
        var stepMonth = 0;
        while (runningReserve < savingsGoal && stepMonth < 60) {
          stepMonth += 1;
          var future = new Date(todayDate.getFullYear(), todayDate.getMonth() + stepMonth, 1, 12, 0, 0);
          runningReserve += reserveAverage;
          projectionSeries.push({
            label: MONTHS_PT[future.getMonth()].slice(0, 3) + "/" + String(future.getFullYear()).slice(-2),
            value: Math.min(runningReserve, savingsGoal)
          });
        }
        if (runningReserve >= savingsGoal) {
          projectedDate = savingsProjection.etaDate;
          projectedDays = savingsProjection.daysToGoal;
        }
      }
    }
    var reserveAmount = document.getElementById("fin-savings-amount");
    var reserveBadge = document.getElementById("fin-savings-badge");
    var reserveFill = document.getElementById("fin-savings-fill");
    var reserveRight = document.getElementById("fin-savings-meta-right");
    var reserveSub = document.getElementById("fin-savings-sub");
    var reserveEstimate = document.getElementById("fin-savings-estimate");
    var reserveGoalInput = document.getElementById("fin-savings-goal-input");
    var reserveGoalDisplay = document.getElementById("fin-savings-goal-display");
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
    if (reserveAmount) reserveAmount.textContent = fmtR(reserve);
    if (reserveBadge) reserveBadge.textContent = reservePct + "%";
    if (reserveFill) reserveFill.style.width = reservePct + "%";
    if (reserveRight) reserveRight.textContent = fmtR(savingsGoal);
    if (reserveGoalInput) reserveGoalInput.value = savingsGoal ? String(savingsGoal) : "";
    if (reserveGoalDisplay) reserveGoalDisplay.textContent = savingsGoal > 0 ? fmtR(savingsGoal) : "Clique para editar";
    var paceEstimate = getSavingsPaceEstimate(reserve, savingsGoal);
    if (reserveEstimate) reserveEstimate.textContent = paceEstimate.summary;
    document.getElementById("fin-savings-meta-left").textContent = paceEstimate.metaLeft;
    if (analyticsSaveAmount) analyticsSaveAmount.textContent = fmtR(reserve);
    if (analyticsSavePct) analyticsSavePct.textContent = reservePct + "%";
    if (analyticsSaveFill) analyticsSaveFill.style.width = reservePct + "%";
    if (analyticsSaveRight) analyticsSaveRight.textContent = "Meta " + fmtR(savingsGoal);
    if (analyticsSaveMonth) analyticsSaveMonth.textContent = fmtR(reserveMonth);
    if (analyticsSaveAverage) analyticsSaveAverage.textContent = fmtR(reserveAverage);
    if (analyticsSaveMissing) analyticsSaveMissing.textContent = fmtR(reserveMissing);
    if (analyticsSaveDays) analyticsSaveDays.textContent = projectedDays === null ? "Sem média suficiente" : (projectedDays === 0 ? "0 dias" : projectedDays + " dias");
    if (analyticsSaveDate) analyticsSaveDate.textContent = projectedDate ? fmtD(projectedDate) : "Sem projeção";
    if (reserveSub) {
      reserveSub.textContent = reserve > 0 ? "Movido entre saldo e poupança, sem tratar como gasto." : "Use guardar e retirar para mover valores entre saldo e poupança.";
    }
    if (analyticsSaveSub) {
      analyticsSaveSub.textContent = reserve > 0 ? "Saldo líquido acumulado na poupança, já considerando retiradas." : "Use transferências de poupança para construir sua reserva.";
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
        var monthlyCur = new Date(tx.date + "T12:00:00");
        var now = new Date();
        while (monthlyCur <= now) {
          baseSaldo += getTxDelta(tx);
          monthlyCur.setMonth(monthlyCur.getMonth() + 1);
        }
      } else if (tx.recurrence === "weekly") {
        var weeklyCur = new Date(tx.date + "T12:00:00");
        var nowWeekly = new Date();
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
    var hasData = txs.length > 0 || recurrenceRules.length > 0;

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
        (function (dateStr) {
          cell.setAttribute("role", "button");
          cell.setAttribute("tabindex", "0");
          cell.setAttribute("aria-label", "Adicionar transação em " + fmtD(dateStr));
          cell.addEventListener("click", function (event) {
            if (event.target.closest(".fin-cal-ev")) return;
            openCreateAtDate(dateStr);
          });
          cell.addEventListener("keydown", function (event) {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              openCreateAtDate(dateStr);
            }
          });
        }(ds));
        if (ds === todayStr) cell.classList.add("today");
        if (dayNum === bestDay) cell.classList.add("best-buy");

        var evs = document.createElement("div");
        evs.className = "fin-cal-events";
        var dayEvs = evMap[ds] || [];
        dayEvs.sort(function (a, b) { return (isFuture(a) ? 1 : 0) - (isFuture(b) ? 1 : 0); });
        dayEvs.forEach(function (tx) {
          var ev = document.createElement("div");
          var fut = isFuture(tx);
          var txClass = getTxClass(tx.type);
          ev.className = "fin-cal-ev " + (fut ? "future-" + txClass : txClass);
          ev.setAttribute("role", "button");
          ev.setAttribute("tabindex", "0");
          ev.textContent = getTxSign(tx.type) + fmtR(tx.value).replace("R$ ", "");
          ev.title = tx.description + " — " + fmtR(tx.value) + (fut ? " (futuro)" : "");
          ev.addEventListener("click", function (event) {
            event.stopPropagation();
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

        if (hasData) {
          var dayBal = dayBalances[ds] || 0;
          var balEl = document.createElement("div");
          balEl.className = "fin-cal-bal " + (dayBal < 0 ? "neg" : "pos") + (ds > todayStr ? " future" : "");
          balEl.textContent = (dayBal < 0 ? "-" : "") + fmtR(Math.abs(dayBal)).replace("R$ ", "");
          balEl.title = "Saldo em " + fmtD(ds) + ": " + fmtR(dayBal) + (ds > todayStr ? " (projetado)" : "");
          cell.appendChild(balEl);
        }

      } else {
        dayNum = i - firstDay - daysInMonth + 1;
        cell.classList.add("other-month");
      }

      dn.textContent = dayNum;
      cell.insertBefore(dn, cell.firstChild);
      grid.appendChild(cell);
    }
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
      list.innerHTML = '<div class="fin-empty"><i class="fas fa-receipt"></i><p>Nenhuma transação este mês</p></div>';
      return;
    }

    list.innerHTML = "";
    filtered.forEach(function (tx) {
      var fut = isFuture(tx);
      var div = document.createElement("div");
      var catClr = CAT_COLORS[tx.category] || "#7a7590";
      var catIco = CAT_ICONS[tx.category] || "\uD83D\uDCCC";
      var txClass = getTxClass(tx.type);
      div.className = "fin-tx-item" + (fut ? " fin-tx-future" : "");
      div.innerHTML =
        '<div class="fin-tx-dot ' + txClass + '" style="background:rgba(' + hexToRgb(catClr) + ',.15)">' + catIco + "</div>" +
        '<div class="fin-tx-body">' +
          '<div class="fin-tx-name">' + tx.description + '<span class="fin-tx-cat-badge" style="background:rgba(' + hexToRgb(catClr) + ',.15);color:' + catClr + '">' + tx.category + "</span></div>" +
          '<div class="fin-tx-meta">' + fmtD(tx.date) + (tx.recurrence ? ' · <span style="color:var(--fin-amber)">↻ ' + (tx.recurrence === "monthly" ? "Mensal" : "Semanal") + "</span>" : "") + "</div>" +
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
      list.innerHTML = '<div class="fin-empty" style="padding:20px"><i class="fas fa-tags"></i><p>Sem saídas este mês</p></div>';
      return;
    }

    list.innerHTML = "";
    entries.slice(0, 6).forEach(function (entry) {
      var clr = CAT_COLORS[entry.name] || "#7a7590";
      var pct = Math.round((entry.val / total) * 100);
      var row = document.createElement("div");
      row.className = "fin-cat-item";
      row.innerHTML =
        '<div class="fin-cat-dot" style="background:' + clr + '"></div>' +
        '<div class="fin-cat-name">' + entry.name + "</div>" +
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

  function finOpenSavingsEdit() {
    var card = document.getElementById("fin-savings-card");
    var input = document.getElementById("fin-savings-goal-input");
    if (!card || !input) return;
    card.classList.add("editing");
    input.focus();
    input.select();
  }

  function finCommitSavingsGoal() {
    var card = document.getElementById("fin-savings-card");
    var input = document.getElementById("fin-savings-goal-input");
    if (!card || !input) return;
    var value = parseFloat(input.value);
    savingsGoal = Number.isFinite(value) && value > 0 ? value : 0;
    card.classList.remove("editing");
    persist();
    renderAll();
    toast("Meta de poupança atualizada!", "ok");
  }

  function addCategoryManagerRow(container, type, category) {
    if (!container) return;
    var row = document.createElement("div");
    var locked = category === "Outros";
    row.className = "fin-cat-manager-row" + (locked ? " locked" : "");
    row.innerHTML =
      '<input type="text" class="fin-fi fin-cat-manager-input" value="' + category + '"' + (locked ? " disabled" : "") + ">" +
      '<button class="fin-btn fin-btn-rose fin-btn-sm fin-cat-manager-del" type="button"' + (locked ? " disabled" : "") + '><i class="fas fa-trash"></i></button>';
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

  function syncRuleCategoryOptions(type) {
    var catSel = document.getElementById("mr-category");
    if (!catSel) return;
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
    syncRuleCategoryOptions(rule.type);
    document.getElementById("mr-category").value = rule.category || getCategoriesForType(rule.type)[0] || "";
    document.getElementById("mr-delete").style.display = "inline-flex";
    toggleRulePattern(rule.pattern);
  }

  function collectRuleForm() {
    var pattern = document.getElementById("mr-pattern").value;
    var holidays = document.getElementById("mr-holidays").value.split(/\r?\n/).map(function (item) { return item.trim(); }).filter(Boolean);
    return {
      id: editRuleId || uid(),
      name: document.getElementById("mr-name").value.trim(),
      startDate: document.getElementById("mr-start-date").value,
      description: document.getElementById("mr-description").value.trim(),
      type: document.getElementById("mr-type").value,
      value: parseFloat(document.getElementById("mr-value").value),
      category: document.getElementById("mr-category").value,
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
        '<div class="fin-recurring-card-title">' + rule.name + '</div>' +
        '<div class="fin-recurring-card-meta">' + fmtR(rule.value) + ' · ' + rule.category + '</div>' +
        '<div class="fin-recurring-card-sub">' + (rule.pattern === "fixed_day" ? ("Dia " + rule.day + " com ajuste") : (rule.nth + "º dia útil com sábado contando")) + '</div>';
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

  function syncCategoryOptions(type) {
    var catSel = document.getElementById("mtx-cat");
    var cats = getCategoriesForType(type);
    catSel.innerHTML = "";
    cats.forEach(function (cat) {
      var option = document.createElement("option");
      option.value = cat;
      option.textContent = cat;
      catSel.appendChild(option);
    });
  }

  function setTxType(type) {
    txType = type;
    document.getElementById("tt-in").className = "fin-tt-btn" + (type === "in" ? " active-in" : "");
    document.getElementById("tt-out").className = "fin-tt-btn" + (type === "out" ? " active-out" : "");
    document.getElementById("tt-save").className = "fin-tt-btn" + (type === "save" ? " active-save" : "");
    document.getElementById("tt-save-withdraw").className = "fin-tt-btn" + (type === "save_withdraw" ? " active-save-withdraw" : "");
    syncCategoryOptions(type);
  }

  function resetModal() {
    editId = null;
    txType = "in";
    document.getElementById("mtx-title").textContent = "Nova Transação";
    document.getElementById("mtx-save").innerHTML = '<i class="fas fa-plus"></i> Adicionar';
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
    setTxType(tx.type);
    document.getElementById("mtx-title").textContent = "Editar Transação";
    document.getElementById("mtx-save").innerHTML = '<i class="fas fa-save"></i> Salvar';
    document.getElementById("mtx-del").style.display = "inline-flex";
    document.getElementById("mtx-desc").value = tx.description;
    document.getElementById("mtx-val").value = tx.value;
    document.getElementById("mtx-date").value = tx.date;
    document.getElementById("mtx-cat").value = tx.category;
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
    document.getElementById("fin-savings-card").addEventListener("click", function (event) {
      if (event.target.id === "fin-savings-goal-input") return;
      finOpenSavingsEdit();
    });
    document.getElementById("fin-savings-card").addEventListener("keydown", function (event) {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        finOpenSavingsEdit();
      }
    });
    document.getElementById("fin-savings-goal-input").addEventListener("click", function (event) {
      event.stopPropagation();
    });
    document.getElementById("fin-savings-goal-input").addEventListener("keydown", function (event) {
      if (event.key === "Enter") {
        event.preventDefault();
        finCommitSavingsGoal();
      }
      if (event.key === "Escape") {
        document.getElementById("fin-savings-card").classList.remove("editing");
        renderAll();
      }
    });
    document.getElementById("fin-savings-goal-input").addEventListener("blur", function () {
      if (document.getElementById("fin-savings-card").classList.contains("editing")) finCommitSavingsGoal();
    });

    document.getElementById("mtx-save").addEventListener("click", function () {
      var desc = document.getElementById("mtx-desc").value.trim();
      var value = parseFloat(document.getElementById("mtx-val").value);
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

      if (tx.type === "save_withdraw") {
        var savingsBalance = getSavingsBalanceUntil(tx.date, editId);
        if (tx.value > savingsBalance) {
          toast("Esse valor é maior do que a poupança disponível até essa data.", "err");
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
        if (document.getElementById("modal-tx").classList.contains("open")) closeModal("modal-tx");
        if (document.getElementById("modal-categories").classList.contains("open")) closeModal("modal-categories");
        if (document.getElementById("modal-recurring").classList.contains("open")) closeModal("modal-recurring");
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

    // Quando os dados da nuvem são aplicados (login/sincronização), recarrega e redesenha,
    // refazendo a projeção da poupança com o histórico atualizado.
    window.addEventListener("soter:remote-state-applied", function () {
      loadData();
      renderAll();
    });
  }

  init();
}());
