"use strict";

// Dados do usuário escapados antes de entrar em innerHTML (SoterUtils vem do js/app-shell.js).
const esc = value => window.SoterUtils.esc(value);

var appState = null;
var S = {};

function ensureState() {
  if (appState && typeof appState === "object") {
    return appState;
  }
  if (window.SoterStorage && window.SoterStorage.getState) {
    appState = window.SoterStorage.getState();
  }
  if (!appState || typeof appState !== "object") {
    appState = { profile: { name: "Usuário", avatar: "" }, data: {} };
  }
  if (!appState.profile || typeof appState.profile !== "object") appState.profile = { name: "Usuário", avatar: "" };
  if (!appState.data || typeof appState.data !== "object") appState.data = {};
  if (!Array.isArray(appState.data.tasks)) appState.data.tasks = [];
  return appState;
}

Object.defineProperty(S, "tasks", {
  get: function () {
    ensureState();
    return appState.data.tasks;
  },
  set: function (value) {
    ensureState();
    appState.data.tasks = Array.isArray(value) ? value : [];
  }
});

function touchPageMeta() {
  ensureState();
  appState.data.lastVisitedPage = "tarefas";
  appState.data.lastVisitedAt = new Date().toISOString();
}

function save() {
  touchPageMeta();
  if (window.SoterStorage && window.SoterStorage.save) {
    window.SoterStorage.save(appState);
  }
}

function syncStorageNow() {
  if (window.SoterStorage && typeof window.SoterStorage.syncFirebaseNow === 'function') {
    window.SoterStorage.syncFirebaseNow().catch(function () { });
  }
}

function getDreams() {
  ensureState();
  var hub = appState.data && appState.data.sonhosHub;
  if (!hub || !Array.isArray(hub.sonhos)) return [];
  return hub.sonhos;
}

function getDreamCalendarEntries(year, month) {
  return getDreams().filter(function (dream) {
    var parts;
    if (!dream || dream.realizado || !dream.dataFim) return false;
    parts = String(dream.dataFim).slice(0, 10).split("-").map(Number);
    return parts[0] === year && parts[1] === month + 1;
  }).map(function (dream) {
    return {
      id: dream.id,
      nome: dream.titulo || "Sonho",
      data: String(dream.dataFim).slice(0, 10),
      icon: dream.icon || "🌙",
      isDream: true
    };
  });
}

function tkOpenDreamDeadline(id) {
  try {
    sessionStorage.setItem("soter_open_dream_id", String(id));
  } catch (err) { }
  window.location.href = "sonhos.html";
}

function getDreamListEntries(tab) {
  var today = tkToday();
  return getDreams().filter(function (dream) {
    var due = dream && dream.dataFim ? String(dream.dataFim).slice(0, 10) : "";
    if (!dream || dream.realizado || !due) return false;
    switch (tab) {
      case "pendentes": return due >= today;
      case "hoje": return due === today;
      case "vencidas": return due < today;
      case "sem-data": return false;
      case "concluidas": return false;
      default: return true;
    }
  }).map(function (dream) {
    var due = String(dream.dataFim).slice(0, 10);
    return {
      kind: "dream",
      id: dream.id,
      nome: dream.titulo || "Sonho",
      nota: dream.desc || dream.intencao || "",
      cat: dream.categoria || "Sonhos",
      icon: dream.icon || "🌙",
      data: due,
      overdue: due < today,
      dueToday: due === today
    };
  });
}

function getReviewPlanner() {
  ensureState();
  var planner = appState.data && appState.data.revisaoPlanner && typeof appState.data.revisaoPlanner === "object"
    ? appState.data.revisaoPlanner
    : {};
  return {
    decks: Array.isArray(planner.decks) ? planner.decks : [],
    cards: Array.isArray(planner.cards) ? planner.cards : []
  };
}

function getReviewDeckMap() {
  var map = {};
  getReviewPlanner().decks.forEach(function (deck) {
    if (!deck || deck.id == null) return;
    map[String(deck.id)] = deck;
  });
  return map;
}

function getReviewCalendarEntries(year, month) {
  var today = tkToday();
  var decks = getReviewDeckMap();
  return getReviewPlanner().cards.filter(function (card) {
    var parts;
    if (!card || !card.nextDue) return false;
    parts = String(card.nextDue).slice(0, 10).split("-").map(Number);
    return parts[0] === year && parts[1] === month + 1;
  }).map(function (card) {
    var deck = decks[String(card.deckId)] || {};
    var due = String(card.nextDue).slice(0, 10);
    return {
      id: card.id,
      nome: card.front || "Revisão",
      data: due,
      deckName: deck.name || "Revisão",
      icon: deck.icon || "🧠",
      isReview: true,
      isOverdue: due < today,
      isDueToday: due === today
    };
  });
}

function getReviewListEntries(tab) {
  var today = tkToday();
  var decks = getReviewDeckMap();
  return getReviewPlanner().cards.filter(function (card) {
    var due = card && card.nextDue ? String(card.nextDue).slice(0, 10) : "";
    if (!due) return false;
    switch (tab) {
      case "pendentes": return due >= today;
      case "hoje": return due === today;
      case "vencidas": return due < today;
      case "sem-data": return false;
      case "concluidas": return false;
      default: return true;
    }
  }).map(function (card) {
    var due = String(card.nextDue).slice(0, 10);
    var deck = decks[String(card.deckId)] || {};
    return {
      kind: "review",
      id: card.id,
      nome: card.front || "Revisão",
      nota: card.back || card.note || "",
      cat: deck.name || "Revisão",
      icon: deck.icon || "🧠",
      data: due,
      overdue: due < today,
      dueToday: due === today
    };
  });
}

function tkOpenReviewPlanner() {
  try {
    sessionStorage.setItem("soter_review_focus", "due");
  } catch (err) { }
  window.location.href = "revisao.html";
}

function load() {
  appState = null;
  ensureState();
  touchPageMeta();
  save();
}

const TK_COLORS = [
  '#c8a96e','#7c6fcd','#5ec4a8','#e06b8b','#e8864a',
  '#4ab0e8','#b06be8','#e8d44a'
];
const TK_PRIOR_COLOR  = { alta:'#e06b8b', media:'#c8a96e', baixa:'#5ec4a8' };
const TK_PRIOR_LABEL  = { alta:'🔴 Alta', media:'🟡 Média', baixa:'🟢 Baixa' };
const TK_MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                   'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const TK_MONTHS_SHORT = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
const TK_NATIONAL_HOLIDAY_DEFS = [
  { month: 1, day: 1, name: 'Confraternização Universal' },
  { month: 4, day: 21, name: 'Tiradentes' },
  { month: 5, day: 1, name: 'Dia do Trabalho' },
  { month: 9, day: 7, name: 'Independência do Brasil' },
  { month: 10, day: 12, name: 'Nossa Senhora Aparecida' },
  { month: 11, day: 2, name: 'Finados' },
  { month: 11, day: 15, name: 'Proclamação da República' },
  { month: 11, day: 20, name: 'Dia Nacional de Zumbi e da Consciência Negra' },
  { month: 12, day: 25, name: 'Natal' }
];
const TK_RECURRENCE_LABEL = {
  none: 'Não recorrente',
  daily: 'Diariamente',
  weekly: 'Semanalmente',
  monthly: 'Mensalmente',
  semiannual: 'Semestralmente',
  yearly: 'Anualmente'
};
const TK_RECURRENCE_LIMIT = { daily: 30, weekly: 16, monthly: 12, semiannual: 6, yearly: 4 };
const tkCalendarSelection = {
  ids: new Set(),
  boxActive: false,
  dragTaskId: null,
  dragDate: null,
  dragIds: [],
  justDragged: false,
  pointerCardId: null,
  pointerStartX: 0,
  pointerStartY: 0,
  pointerDragging: false,
  hoverDate: null,
  copyOnDrag: false
};
var tkCalDragGhost = null;
const taskLinkBoardState = { x: 18, y: 18, scale: 1, dragging: false, startX: 0, startY: 0 };
const taskLinkPickerState = { open: false, kind: null };
var taskLinkPendingCreate = null;

// Helpers
function tkDateLocalString(date) {
  var y = date.getFullYear();
  var m = String(date.getMonth() + 1).padStart(2, '0');
  var d = String(date.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + d;
}
function tkToday() { return tkDateLocalString(new Date()); }
function tkFmtDate(ds) {
  if (!ds) return '—';
  const [y,m,d] = ds.split('-');
  return `${d}/${m}/${y}`;
}
function tkFmtDateLong(ds) {
  if (!ds) return '';
  const d = new Date(ds + 'T00:00:00');
  return d.toLocaleDateString('pt-BR',{weekday:'long',day:'numeric',month:'long'});
}
function tkDaysFromNow(ds) {
  const d = new Date(ds + 'T00:00:00'), n = new Date(); n.setHours(0,0,0,0);
  return Math.round((d - n) / 86400000);
}

function tkParseDate(ds) {
  return ds ? new Date(ds + 'T00:00:00') : null;
}

function tkToDateString(date) {
  return tkDateLocalString(date);
}

function tkGetNationalHolidayEntries(year, month) {
  return TK_NATIONAL_HOLIDAY_DEFS.filter(function (holiday) {
    return holiday.month === month + 1;
  }).map(function (holiday) {
    var ds = year + '-' + String(holiday.month).padStart(2, '0') + '-' + String(holiday.day).padStart(2, '0');
    return {
      id: 'holiday-' + ds,
      nome: holiday.name,
      data: ds,
      icon: '🎉',
      isHoliday: true,
      holidayType: 'Feriado nacional'
    };
  });
}

function tkAddDays(ds, amount) {
  const date = tkParseDate(ds);
  if (!date) return ds;
  date.setDate(date.getDate() + amount);
  return tkToDateString(date);
}

function tkAddMonths(ds, amount) {
  const date = tkParseDate(ds);
  if (!date) return ds;
  const day = date.getDate();
  date.setDate(1);
  date.setMonth(date.getMonth() + amount);
  const maxDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  date.setDate(Math.min(day, maxDay));
  return tkToDateString(date);
}

function tkAdvanceRecurrence(ds, recurrence, step) {
  if (!ds || recurrence === 'none' || !step) return ds;
  if (recurrence === 'daily') return tkAddDays(ds, step);
  if (recurrence === 'weekly') return tkAddDays(ds, step * 7);
  if (recurrence === 'monthly') return tkAddMonths(ds, step);
  if (recurrence === 'semiannual') return tkAddMonths(ds, step * 6);
  if (recurrence === 'yearly') return tkAddMonths(ds, step * 12);
  return ds;
}

function tkRewindRecurrence(ds, recurrence, step) {
  if (!ds || recurrence === 'none' || !step) return ds;
  if (recurrence === 'daily') return tkAddDays(ds, -step);
  if (recurrence === 'weekly') return tkAddDays(ds, -step * 7);
  if (recurrence === 'monthly') return tkAddMonths(ds, -step);
  if (recurrence === 'semiannual') return tkAddMonths(ds, -step * 6);
  if (recurrence === 'yearly') return tkAddMonths(ds, -step * 12);
  return ds;
}

function tkDiffDays(fromDate, toDate) {
  const a = tkParseDate(fromDate);
  const b = tkParseDate(toDate);
  if (!a || !b) return 0;
  return Math.round((b - a) / 86400000);
}

function tkNormalizeRecurringMeta(task) {
  if (!task || task.isRecurringClone) return task;
  if (!task.recurrence || task.recurrence === 'none') {
    task.recurrenceSeedDate = task.data || '';
    task.recurrenceExceptions = [];
    task.recurrenceMasterId = task.id;
    task.recurrenceIndex = 0;
    return task;
  }
  if (!task.recurrenceSeedDate) task.recurrenceSeedDate = task.data || '';
  if (!Array.isArray(task.recurrenceExceptions)) task.recurrenceExceptions = [];
  task.recurrenceMasterId = task.id;
  if (typeof task.recurrenceIndex !== 'number' || task.recurrenceIndex < 0) task.recurrenceIndex = 0;
  return task;
}

function tkGetRecurringMaster(task) {
  if (!task) return null;
  if (!task.isRecurringClone) return task;
  return S.tasks.find(function (item) { return item.id === task.recurrenceMasterId; }) || null;
}

function tkGetNextRecurringIndex(seedDate, recurrence, exceptionsSet, startIndex) {
  var step = Math.max(0, Number(startIndex) || 0);
  var guard = 0;
  while (guard < 1000) {
    var occurrenceDate = tkAdvanceRecurrence(seedDate, recurrence, step);
    if (!exceptionsSet.has(occurrenceDate)) return step;
    step += 1;
    guard += 1;
  }
  return Math.max(0, Number(startIndex) || 0);
}

function tkGetChildren(taskId) {
  return S.tasks.filter(function (item) { return item.parentId === taskId; });
}

function tkHasOpenChildren(task) {
  return tkGetChildren(task.id).some(function (child) { return !child.done; });
}

function tkWouldCreateCycle(taskId, parentId) {
  var current = parentId;
  while (current) {
    if (current === taskId) return true;
    var task = S.tasks.find(function (item) { return item.id === current; });
    current = task ? task.parentId : null;
  }
  return false;
}

function tkSelectionHas(id) {
  return tkCalendarSelection.ids.has(id);
}

function tkClearSelection() {
  tkCalendarSelection.ids.clear();
}

function tkCanCompleteTask(task) {
  return !task || !tkHasOpenChildren(task);
}

function tkGetAcademiaState() {
  ensureState();
  return appState.data && appState.data.academiaTracker ? appState.data.academiaTracker : null;
}

function tkGetGymExercisesForDay(academia, dow) {
  var exercises = academia && Array.isArray(academia.exercises) ? academia.exercises : [];
  return exercises.filter(function (exercise) {
    return (exercise.days || []).map(Number).includes(dow);
  });
}

function tkHasGymWorkoutOnDate(academia, date) {
  if (!academia || !academia.profile || !Array.isArray(academia.profile.trainDays)) return false;
  var dow = date.getDay();
  var trainDays = academia.profile.trainDays.map(function (day) { return Number(day); });
  return trainDays.includes(dow) && tkGetGymExercisesForDay(academia, dow).length > 0;
}

function tkIsGymWorkoutSkipped(academia, dateStr) {
  return !!(academia && academia.skippedByDate && academia.skippedByDate[dateStr]);
}

function tkGetGymTaskEntryForDate(dateStr) {
  var academia = tkGetAcademiaState();
  var date = tkParseDate(dateStr);
  var doneByDate = academia && academia.todayDoneByDate && typeof academia.todayDoneByDate === 'object' ? academia.todayDoneByDate : {};
  var doneMap = doneByDate[dateStr] || {};
  var exercises;
  var doneCount;
  if (!date || !tkHasGymWorkoutOnDate(academia, date)) return null;
  if (tkIsGymWorkoutSkipped(academia, dateStr)) return null;
  exercises = tkGetGymExercisesForDay(academia, date.getDay());
  doneCount = exercises.filter(function (exercise) { return !!doneMap[exercise.id]; }).length;
  return {
    id: 'gym-' + dateStr,
    kind: 'gym',
    nome: 'Treino',
    nota: exercises.length + ' exercício' + (exercises.length !== 1 ? 's' : '') + ' programado' + (exercises.length !== 1 ? 's' : '') + '.',
    data: dateStr,
    cat: 'Academia',
    prior: 'media',
    cor: '#5ec4a8',
    done: exercises.length > 0 && doneCount === exercises.length,
    isGym: true,
    subtarefas: exercises.map(function (exercise) {
      return {
        texto: exercise.name || 'Exercício',
        done: !!doneMap[exercise.id]
      };
    })
  };
}

function tkGetGymListEntries(tab) {
  var today = tkToday();
  var base = tkParseDate(today);
  var entries = tkGetGymCalendarEntries(base.getFullYear(), base.getMonth());
  switch (tab) {
    case 'pendentes': return entries.filter(function (item) { return !item.done && tkDaysFromNow(item.data) >= 0; });
    case 'hoje': return entries.filter(function (item) { return item.data === today; });
    case 'vencidas': return entries.filter(function (item) { return !item.done && tkDaysFromNow(item.data) < 0; });
    case 'concluidas': return entries.filter(function (item) { return item.done; });
    case 'sem-data': return [];
    default: return entries;
  }
}

function tkRemoveResidualGymTasks() {
  var before = S.tasks.length;
  S.tasks = S.tasks.filter(function (task) {
    return !(task && (task.isGym || String(task.id || '').indexOf('gym-') === 0));
  });
  return S.tasks.length !== before;
}

function tkGetGymCalendarEntries(year, month) {
  var academia = tkGetAcademiaState();
  if (!academia || !academia.profile || !Array.isArray(academia.profile.trainDays)) return [];
  var daysInMonth = new Date(year, month + 1, 0).getDate();
  var entries = [];

  for (var day = 1; day <= daysInMonth; day += 1) {
    var date = new Date(year, month, day);
    var ds = tkToDateString(date);
    if (tkIsGymWorkoutSkipped(academia, ds)) continue;
    if (!tkHasGymWorkoutOnDate(academia, date)) continue;
    var entry = tkGetGymTaskEntryForDate(ds);
    if (entry) entries.push(entry);
  }

  return entries;
}

function tkOpenGymDay(dateStr) {
  try {
    sessionStorage.setItem('academia_focus_date', dateStr);
  } catch (err) { }
  window.location.href = 'academia.html';
}

function tkDeleteGymWorkout(dateStr) {
  var academia = tkGetAcademiaState();
  if (!academia || !dateStr) return;
  if (!academia.skippedByDate || typeof academia.skippedByDate !== 'object') academia.skippedByDate = {};
  if (!academia.todayDoneByDate || typeof academia.todayDoneByDate !== 'object') academia.todayDoneByDate = {};
  if (!academia.exerciseHistory || typeof academia.exerciseHistory !== 'object') academia.exerciseHistory = {};

  academia.skippedByDate[dateStr] = true;
  delete academia.todayDoneByDate[dateStr];
  Object.keys(academia.exerciseHistory).forEach(function (exerciseId) {
    if (!Array.isArray(academia.exerciseHistory[exerciseId])) return;
    academia.exerciseHistory[exerciseId] = academia.exerciseHistory[exerciseId].filter(function (entry) {
      return entry && entry.date !== dateStr;
    });
  });

  save();
  syncStorageNow();
  renderTasks();
}

function tkRequestDeleteGymWorkout(dateStr) {
  if (!dateStr) return;
  tkDeletePopupOpen({
    kicker: 'Treino da academia',
    title: 'Excluir treino de ' + tkFmtDate(dateStr) + '?',
    text: 'Esse treino sera removido das tarefas e marcado como pulado na Academia. A sua sequencia vai ignorar esse dia.',
    meta: [tkFmtDate(dateStr), 'Academia'],
    actions: [
      {
        value: 'delete-gym',
        title: 'Excluir treino',
        sub: 'Remove este dia de treino e recalcula a sequencia.',
        className: 'danger'
      },
      {
        value: 'cancel',
        title: 'Cancelar',
        sub: 'Volta sem fazer alteracoes.',
        className: 'ghost'
      }
    ],
    onChoice: function (mode) {
      if (mode === 'delete-gym') tkDeleteGymWorkout(dateStr);
    }
  });
}

function tkSyncRecurringSeries(masterId) {
  var master = S.tasks.find(function (item) { return item.id === masterId; });
  if (!master || master.isRecurringClone) return;
  tkNormalizeRecurringMeta(master);
  var existingClones = S.tasks.filter(function (item) {
    return item.isRecurringClone && item.recurrenceMasterId === masterId;
  });
  var cloneByIndex = {};
  existingClones.forEach(function (item) {
    cloneByIndex[item.recurrenceIndex] = item;
  });
  S.tasks = S.tasks.filter(function (item) {
    return !(item.isRecurringClone && item.recurrenceMasterId === masterId);
  });
  var limit = TK_RECURRENCE_LIMIT[master.recurrence] || 0;
  if (!master.recurrence || master.recurrence === 'none' || !limit) return;
  var seedDate = master.recurrenceSeedDate || master.data;
  var exceptions = new Set(master.recurrenceExceptions || []);
  var masterIndex = tkGetNextRecurringIndex(seedDate, master.recurrence, exceptions, 0);
  master.data = tkAdvanceRecurrence(seedDate, master.recurrence, masterIndex);
  master.recurrenceIndex = masterIndex;
  master.recurrenceMasterId = master.id;
  var nextIndex = masterIndex + 1;
  for (var i = 0; i < limit; i++) {
    var occurrenceIndex = tkGetNextRecurringIndex(seedDate, master.recurrence, exceptions, nextIndex);
    var existing = cloneByIndex[occurrenceIndex];
    S.tasks.push({
      id: existing ? existing.id : Date.now() + Math.floor(Math.random() * 100000) + i + 1,
      nome: master.nome,
      nota: master.nota,
      prior: master.prior,
      cat: master.cat,
      hora: master.hora,
      data: tkAdvanceRecurrence(seedDate, master.recurrence, occurrenceIndex),
      dataFim: master.dataFim ? tkAddDays(tkAdvanceRecurrence(seedDate, master.recurrence, occurrenceIndex), tkDiffDays(seedDate, master.dataFim)) : '',
      cor: master.cor,
      done: existing ? existing.done : false,
      subtarefas: existing ? existing.subtarefas || [] : tkCloneSubtasks(master.subtarefas),
      recurrence: master.recurrence,
      parentId: existing ? existing.parentId || null : null,
      isRecurringClone: true,
      recurrenceMasterId: master.id,
      recurrenceIndex: occurrenceIndex
    });
    nextIndex = occurrenceIndex + 1;
  }
}

function tkApplyRecurringEdits(taskId, updates) {
  var task = S.tasks.find(function (item) { return item.id === taskId; });
  if (!task) return null;
  if (!task.recurrence || task.recurrence === 'none') {
    Object.assign(task, updates);
    return task;
  }

  var masterId = task.isRecurringClone ? task.recurrenceMasterId : task.id;
  var master = S.tasks.find(function (item) { return item.id === masterId; });
  if (!master) {
    Object.assign(task, updates);
    return task;
  }

  var hasNextRecurrence = Object.prototype.hasOwnProperty.call(updates, 'recurrence');
  var hasNextDate = Object.prototype.hasOwnProperty.call(updates, 'data');
  var nextRecurrence = hasNextRecurrence ? updates.recurrence : (task.recurrence || master.recurrence || 'none');
  var nextDate = hasNextDate ? updates.data : (task.data || master.data);
  var nextMasterDate = nextDate;
  if (task.recurrenceIndex) {
    nextMasterDate = tkRewindRecurrence(nextDate, nextRecurrence, task.recurrenceIndex);
  }
  var nextEndDate = Object.prototype.hasOwnProperty.call(updates, 'dataFim') ? updates.dataFim : (task.dataFim || master.dataFim || '');
  var nextMasterEndDate = nextEndDate;
  if (task.recurrenceIndex && nextEndDate && nextDate) {
    nextMasterEndDate = tkAddDays(nextMasterDate, tkDiffDays(nextDate, nextEndDate));
  }

  Object.assign(master, updates, {
    data: nextMasterDate,
    dataFim: nextMasterEndDate,
    recurrenceSeedDate: nextMasterDate
  });
  master.isRecurringClone = false;
  master.recurrenceMasterId = master.id;
  if (!Array.isArray(master.recurrenceExceptions)) master.recurrenceExceptions = [];
  tkSyncRecurringSeries(master.id);
  return S.tasks.find(function (item) { return item.id === taskId; }) || master;
}

function tkMoveTaskSeries(ids, dayDelta) {
  if (!dayDelta || !ids.length) return;
  var normalizedIds = ids.map(function (id) { return Number(id); });
  S.tasks.forEach(function (task) {
    if (normalizedIds.indexOf(Number(task.id)) >= 0 && task.data) {
      task.data = tkAddDays(task.data, dayDelta);
      if (task.dataFim) task.dataFim = tkAddDays(task.dataFim, dayDelta);
    }
  });
}


// Migrar dados antigos
function tkMigrate() {
  S.tasks = (S.tasks || []).map(t => {
    if (!t.subtarefas) t.subtarefas = [];
    if (typeof t.data === 'undefined' || t.data === null) t.data = tkToday();
    if (typeof t.dataFim === 'undefined' || t.dataFim === null) t.dataFim = '';
    if (!t.cor)  t.cor  = TK_COLORS[0];
    if (!t.nota) t.nota = '';
    if (!t.hora) t.hora = '';
    if (!t.recurrence) t.recurrence = 'none';
    if (typeof t.parentId === 'undefined') t.parentId = null;
    if (typeof t.isRecurringClone === 'undefined') t.isRecurringClone = false;
    if (typeof t.recurrenceMasterId === 'undefined' || t.recurrenceMasterId === null) t.recurrenceMasterId = t.isRecurringClone ? null : t.id;
    if (typeof t.recurrenceIndex === 'undefined') t.recurrenceIndex = 0;
    if (typeof t.recurrenceSeedDate === 'undefined' || t.recurrenceSeedDate === null) t.recurrenceSeedDate = t.isRecurringClone ? null : (t.data || '');
    if (!Array.isArray(t.recurrenceExceptions)) t.recurrenceExceptions = [];
    return t;
  });
  tkEnsureRecurringTasks();
}

function tkCloneSubtasks(subs) {
  return (subs || []).map(function (sub) {
    return { texto: sub.texto, done: false };
  });
}

function tkEnsureRecurringTasks() {
  var masterIds = new Set(S.tasks.filter(function (task) {
    return !task.isRecurringClone;
  }).map(function (task) {
    return task.id;
  }));

  S.tasks = S.tasks.filter(function (task) {
    return !task.isRecurringClone || masterIds.has(task.recurrenceMasterId);
  });

  S.tasks.forEach(function (task) {
    if (!task.isRecurringClone) tkNormalizeRecurringMeta(task);
  });

  S.tasks.filter(function (task) {
    return !task.isRecurringClone && task.recurrence && task.recurrence !== 'none';
  }).map(function (task) {
    return task.id;
  }).forEach(function (masterId) {
    tkSyncRecurringSeries(masterId);
  });
}

// KPIs
function renderTasks() {
  tkMigrate();
  if (tkRemoveResidualGymTasks()) save();
  const tk    = S.tasks;
  const today = tkToday();
  const gymPend = tkGetGymListEntries('pendentes').length;
  const gymHoje = tkGetGymListEntries('hoje').length;
  const gymVenc = tkGetGymListEntries('vencidas').length;
  const gymDone = tkGetGymListEntries('concluidas').length;
  const gymTodas = tkGetGymListEntries('todas').length;
  const dreamPend = getDreamListEntries('pendentes').length;
  const dreamHoje = getDreamListEntries('hoje').length;
  const dreamVenc = getDreamListEntries('vencidas').length;
  const dreamTodas = getDreamListEntries('todas').length;
  const reviewPend = getReviewListEntries('pendentes').length;
  const reviewHoje = getReviewListEntries('hoje').length;
  const reviewVenc = getReviewListEntries('vencidas').length;
  const reviewTodas = getReviewListEntries('todas').length;
  const done  = tk.filter(x => x.done).length;
  const pct   = tk.length ? Math.round(done / tk.length * 100) : 0;
  const g = id => document.getElementById(id);
  if (g('tk-total')) g('tk-total').textContent = tk.length;
  if (g('tk-pend'))  g('tk-pend').textContent  = tk.filter(x=>!x.done).length;
  if (g('tk-done'))  g('tk-done').textContent  = done;
  if (g('tk-pct'))   g('tk-pct').textContent   = pct + '%';
  // Contadores das abas
  const counts = {
    pendentes:  tk.filter(t => !t.done && t.data && tkDaysFromNow(t.data) >= 0).length + dreamPend + reviewPend + gymPend,
    hoje:       tk.filter(t => t.data === today).length + dreamHoje + reviewHoje + gymHoje,
    vencidas:   tk.filter(t => !t.done && t.data && tkDaysFromNow(t.data) < 0).length + dreamVenc + reviewVenc + gymVenc,
    'sem-data': tk.filter(t => !t.data || t.data === '').length,
    concluidas: tk.filter(t => t.done).length + gymDone,
    todas:      tk.length + dreamTodas + reviewTodas + gymTodas,
  };
  Object.entries(counts).forEach(([tab, n]) => {
    const el = g('tktc-' + tab);
    if (el) el.textContent = n > 0 ? n : '';
  });
  tkRenderFocus();
  tkRenderList();
  tkCalRender();
}

// ======================================================================
// FOCO DE HOJE
// ============================================================================
function tkRenderFocus() {
  const today   = tkToday();
  const gymToday = tkGetGymTaskEntryForDate(today);
  const tasks   = S.tasks.filter(t => t.data === today)
                         .concat(gymToday ? [gymToday] : [])
                         .sort((a,b) => {
                           if (a.done !== b.done) return a.done ? 1 : -1;
                           return (a.hora||'99:99').localeCompare(b.hora||'99:99');
                         });
  const listEl  = document.getElementById('tk-focus-list');
  const subEl   = document.getElementById('tk-focus-sub');
  if (!listEl) return;

  const pending = tasks.filter(t => !t.done).length;
  const total   = tasks.length;
  if (subEl) {
    if (!total) subEl.textContent = 'Nenhuma tarefa hoje · aproveite! ✨';
    else subEl.textContent = `${pending} pendente${pending!==1?'s':''} · ${total-pending} concluída${(total-pending)!==1?'s':''} hoje`;
  }

  if (!tasks.length) {
    listEl.innerHTML = '<div class="tk-focus-empty">Nenhuma tarefa para hoje ✨ <br><small style="opacity:.5">Use o botão acima para adicionar.</small></div>';
    return;
  }

  listEl.innerHTML = tasks.map(t => {
    const color = t.cor || TK_PRIOR_COLOR[t.prior] || '#c8a96e';
    const subs  = t.subtarefas || [];
    const sDone = subs.filter(s=>s.done).length;
    const sPct  = subs.length ? Math.round(sDone/subs.length*100) : (t.done ? 100 : 0);
    if (t.kind === 'gym') {
      return `<div class="tk-focus-card ${t.done?'done-card':''}" style="--tk-color:${color}"
          onclick="tkOpenGymDay('${t.data}')">
        <div class="tk-focus-card-top">
          <div class="tk-focus-card-check ${t.done?'checked':''}">${t.done?'✓':''}</div>
          <div class="tk-focus-card-nome">${esc(t.nome)}</div>
        </div>
        <div class="tk-focus-card-meta">
          <span class="tk-focus-card-pill">Média</span>
          <span class="tk-focus-card-pill" style="background:rgba(255,255,255,.06);color:var(--muted);border-color:rgba(255,255,255,.1)">Academia</span>
        </div>
        <div class="tk-focus-card-prog">
          <div class="tk-focus-card-prog-fill" style="width:${sPct}%"></div>
        </div>
      </div>`;
    }
    return `<div class="tk-focus-card ${t.done?'done-card':''}" style="--tk-color:${color}"
        oncontextmenu="return tkQuickActionsOpen(event, ${t.id})"
        onclick="taskHubOpen(${t.id})">
      <div class="tk-focus-card-top">
        <div class="tk-focus-card-check ${t.done?'checked':''}"
          onclick="event.stopPropagation();tkQuickToggle(${t.id})">
          ${t.done?'✓':''}
        </div>
        <div class="tk-focus-card-nome">${esc(t.nome)}</div>
      </div>
      <div class="tk-focus-card-meta">
        ${t.hora ? `<span class="tk-focus-card-hora">🕒 ${esc(t.hora)}</span>` : ''}
        <span class="tk-focus-card-pill">${TK_PRIOR_LABEL[t.prior]||'•'}</span>
        ${t.cat ? `<span class="tk-focus-card-pill" style="background:rgba(255,255,255,.06);color:var(--muted);border-color:rgba(255,255,255,.1)">${esc(t.cat)}</span>` : ''}
      </div>
      ${subs.length>0||t.done ? `<div class="tk-focus-card-prog">
        <div class="tk-focus-card-prog-fill" style="width:${sPct}%"></div>
      </div>` : ''}
    </div>`;
  }).join('');
}

// ============================================================================
// LISTA COM ABAS
let tkListTab = 'hoje';
let tkListPage = 1;
let tkQuickActionState = null;
const tkDeletePopupState = { onChoice: null };

function tkGetListPageSize() {
  return 8;
}

function tkRenderListPagination(totalItems, pageSize, currentPage) {
  const pagination = document.getElementById('tk-list-pagination');
  if (!pagination) return;

  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  pagination.dataset.totalPages = String(totalPages);
  if (totalPages <= 1) {
    pagination.className = 'tk-list-pagination';
    pagination.innerHTML = '';
    return;
  }

  pagination.className = 'tk-list-pagination visible';
  pagination.innerHTML = `
    <span class="tk-list-page-indicator">Página ${currentPage} de ${totalPages}</span>
    <button class="tk-list-page-btn" type="button" onclick="tkListGoToPage(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''}>‹</button>
    <button class="tk-list-page-btn" type="button" onclick="tkListGoToPage(${currentPage + 1})" ${currentPage === totalPages ? 'disabled' : ''}>›</button>
  `;
}

function tkListGoToPage(page) {
  const pagination = document.getElementById('tk-list-pagination');
  const totalPages = pagination ? Number(pagination.dataset.totalPages || '1') : 1;
  tkListPage = Math.min(Math.max(1, page), totalPages);
  tkRenderList();
}

function tkListSetTab(tab) {
  tkListTab = tab;
  tkListPage = 1;
  document.querySelectorAll('.tk-list-tab').forEach(el => {
    el.classList.toggle('active', el.dataset.tab === tab);
  });
  tkRenderList();
}

function tkRenderList() {
  const today  = tkToday();
  const all    = S.tasks;
  const gymItems = tkGetGymListEntries(tkListTab);
  const dreamItems = getDreamListEntries(tkListTab);
  const reviewItems = getReviewListEntries(tkListTab);
  let items;
  switch (tkListTab) {
    case 'pendentes':  items = all.filter(t => !t.done && t.data && tkDaysFromNow(t.data) >= 0).concat(dreamItems, reviewItems, gymItems); break;
    case 'hoje':       items = all.filter(t => t.data === today).concat(dreamItems, reviewItems, gymItems); break;
    case 'vencidas':   items = all.filter(t => !t.done && t.data && tkDaysFromNow(t.data) < 0).concat(dreamItems, reviewItems, gymItems); break;
    case 'sem-data':   items = all.filter(t => !t.data || t.data === ''); break;
    case 'concluidas': items = all.filter(t => t.done).concat(gymItems); break;
    default:           items = [...all].concat(dreamItems, reviewItems, gymItems);
  }
  // sort: vencidas por data asc, resto por data asc depois done
  items.sort((a,b) => {
    if (!!a.kind !== !!b.kind) {
      if (a.kind === 'dream' && b.kind !== 'dream') return -1;
      if (b.kind === 'dream' && a.kind !== 'dream') return 1;
      if (a.kind === 'review' && a.data === today) return -1;
      if (b.kind === 'review' && b.data === today) return 1;
    }
    if (tkListTab === 'todas') {
      if (a.done !== b.done) return a.done ? 1 : -1;
    }
    if (a.data && b.data) return a.data.localeCompare(b.data);
    if (a.data) return -1;
    if (b.data) return 1;
    return 0;
  });

  const grid  = document.getElementById('tk-list-grid');
  const count = document.getElementById('tk-list-count');
  if (!grid) return;
  if (count) count.textContent = `${items.length} item${items.length!==1?'s':''}`;

  if (!items.length) {
    const msgs = {
      pendentes:'Nenhuma tarefa pendente! ✨',hoje:'Nenhuma tarefa para hoje.',
      vencidas:'Nenhuma tarefa vencida! ⏰',
      'sem-data':'Todas as tarefas têm data definida.',
      concluidas:'Nenhuma tarefa concluída ainda.',todas:'Nenhuma tarefa cadastrada.'
    };
    grid.innerHTML = `<div class="tk-list-empty">
      <div class="tk-list-empty-icon">${tkListTab==='vencidas'?'⏰':tkListTab==='concluidas'?'✅':'✨'}</div>
      ${msgs[tkListTab]||'Nenhuma tarefa.'}
    </div>`;
    tkRenderListPagination(0, 1, 1);
    return;
  }

  const pageSize = tkGetListPageSize();
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  tkListPage = Math.min(tkListPage, totalPages);
  const start = (tkListPage - 1) * pageSize;
  const visibleItems = items.slice(start, start + pageSize);

  grid.innerHTML = visibleItems.map(t => {
    if (t.kind === 'dream') {
      const diff = t.data ? tkDaysFromNow(t.data) : null;
      const dateCls = diff===null?'': diff<0?'late': diff===0?'today-date':'';
      const dateLbl = diff===null?'Sem data': diff===0?'Hoje': diff===1?'Amanhã': diff===-1?'Ontem':
                      diff<0?`${Math.abs(diff)}d atrás`:`em ${diff}d`;
      return `<div class="tk-task-card tk-dream-card" onclick="tkOpenDreamDeadline('${String(t.id)}')">
        <div class="tk-task-card-top">
          <div class="tk-task-card-dream-icon">${t.icon}</div>
          <div class="tk-task-card-nome">${esc(t.nome)}</div>
        </div>
        ${t.nota ? `<div class="tk-task-card-nota">${esc(t.nota)}</div>` : ''}
        <div class="tk-task-card-footer">
          <span class="tk-task-card-pill tk-dream-pill">Sonho</span>
          ${t.cat ? `<span class="tk-task-card-pill" style="background:rgba(124,111,205,.12);color:#e8e0ff;border:1px solid rgba(124,111,205,.22)">${esc(t.cat)}</span>` : ''}
          <span class="tk-task-card-date ${dateCls}">${dateLbl}</span>
        </div>
      </div>`;
    }
    if (t.kind === 'review') {
      const diff = t.data ? tkDaysFromNow(t.data) : null;
      const dateCls = diff===null?'': diff<0?'late': diff===0?'today-date':'';
      const dateLbl = diff===null?'Sem data': diff===0?'Hoje': diff===1?'Amanhã': diff===-1?'Ontem':
                      diff<0?`${Math.abs(diff)}d atrás`:`em ${diff}d`;
      return `<div class="tk-task-card tk-review-card" onclick="tkOpenReviewPlanner()">
        <div class="tk-task-card-top">
          <div class="tk-task-card-review-icon">${t.icon}</div>
          <div class="tk-task-card-nome">${esc(t.nome)}</div>
        </div>
        ${t.nota ? `<div class="tk-task-card-nota">${esc(t.nota)}</div>` : ''}
        <div class="tk-task-card-footer">
          <span class="tk-task-card-pill tk-review-pill">Revisão</span>
          ${t.cat ? `<span class="tk-task-card-pill" style="background:rgba(124,111,205,.12);color:#d8d1ff;border:1px solid rgba(124,111,205,.22)">${esc(t.cat)}</span>` : ''}
          <span class="tk-task-card-date ${dateCls}">${dateLbl}</span>
        </div>
      </div>`;
    }
    if (t.kind === 'gym') {
      const color  = t.cor || '#5ec4a8';
      const subs   = t.subtarefas || [];
      const sDone  = subs.filter(s=>s.done).length;
      const sPct   = subs.length ? Math.round(sDone/subs.length*100) : (t.done?100:0);
      const diff   = t.data ? tkDaysFromNow(t.data) : null;
      const dateCls = diff===null?'': diff<0&&!t.done?'late': diff===0?'today-date':'';
      const dateLbl = diff===null?'Sem data': diff===0?'Hoje': diff===1?'Amanhã': diff===-1?'Ontem':
                      diff<0?`${Math.abs(diff)}d atrás`:`em ${diff}d`;
      return `<div class="tk-task-card ${t.done?'done-card':''}" style="--tk-color:${color}"
          onclick="tkOpenGymDay('${t.data}')">
        <div class="tk-task-card-top">
          <div class="tk-task-card-check ${t.done?'checked':''}">${t.done?'✓':''}</div>
          <div class="tk-task-card-nome">${esc(t.nome)}</div>
          <button type="button" class="tk-gym-delete-btn" onclick="event.stopPropagation();tkRequestDeleteGymWorkout('${t.data}')" title="Excluir treino">
            🗑
          </button>
        </div>
        ${t.nota ? `<div class="tk-task-card-nota">${esc(t.nota)}</div>` : ''}
        <div class="tk-task-card-footer">
          <span class="tk-task-card-pill" style="background:${color}1a;color:${color};border:1px solid ${color}33">Média</span>
          <span class="tk-task-card-pill" style="background:rgba(255,255,255,.05);color:var(--muted);border:1px solid rgba(255,255,255,.08)">Academia</span>
          <span class="tk-task-card-date ${dateCls}">${dateLbl}</span>
        </div>
        ${subs.length>0 ? `<div class="tk-task-card-sub-prog">
          <div class="tk-task-card-sub-track">
            <div class="tk-task-card-sub-fill" style="width:${sPct}%"></div>
          </div>
          <span class="tk-task-card-sub-lbl">${sDone}/${subs.length}</span>
        </div>` : ''}
      </div>`;
    }
    const color  = t.cor || TK_PRIOR_COLOR[t.prior] || '#c8a96e';
    const pColor = TK_PRIOR_COLOR[t.prior] || color;
    const subs   = t.subtarefas || [];
    const sDone  = subs.filter(s=>s.done).length;
    const sPct   = subs.length ? Math.round(sDone/subs.length*100) : (t.done?100:0);
    const diff   = t.data ? tkDaysFromNow(t.data) : null;
    const dateCls = diff===null?'': diff<0&&!t.done?'late': diff===0?'today-date':'';
    const dateLbl = diff===null?'Sem data': diff===0?'Hoje': diff===1?'Amanhã': diff===-1?'Ontem':
                    diff<0?`${Math.abs(diff)}d atrás`:`em ${diff}d`;
    return `<div class="tk-task-card ${t.done?'done-card':''}" style="--tk-color:${color}"
        oncontextmenu="return tkQuickActionsOpen(event, ${t.id})"
        onclick="taskHubOpen(${t.id})">
      <div class="tk-task-card-top">
        <div class="tk-task-card-check ${t.done?'checked':''}"
          onclick="event.stopPropagation();tkQuickToggle(${t.id})">
          ${t.done?'✓':''}
        </div>
        <div class="tk-task-card-nome">${esc(t.nome)}</div>
      </div>
      ${t.nota ? `<div class="tk-task-card-nota">${esc(t.nota)}</div>` : ''}
      <div class="tk-task-card-footer">
        <span class="tk-task-card-pill" style="background:${pColor}1a;color:${pColor};border:1px solid ${pColor}33">
          ${TK_PRIOR_LABEL[t.prior]||'•'}
        </span>
        ${t.cat ? `<span class="tk-task-card-pill" style="background:rgba(255,255,255,.05);color:var(--muted);border:1px solid rgba(255,255,255,.08)">${esc(t.cat)}</span>` : ''}
        <span class="tk-task-card-date ${dateCls}">${dateLbl}</span>
      </div>
      ${subs.length>0 ? `<div class="tk-task-card-sub-prog">
        <div class="tk-task-card-sub-track">
          <div class="tk-task-card-sub-fill" style="width:${sPct}%"></div>
        </div>
        <span class="tk-task-card-sub-lbl">${sDone}/${subs.length}</span>
      </div>` : ''}
    </div>`;
  }).join('');

  tkRenderListPagination(items.length, pageSize, tkListPage);
}

// ============================================================================
// CALENDÁRIO FULL-WIDTH COM MINI-CARDS
const tkCalState = { year: new Date().getFullYear(), month: new Date().getMonth(), selected: tkToday() };

function tkCalPrev() { tkCalState.month--; if (tkCalState.month<0){tkCalState.month=11;tkCalState.year--;} tkCalRender(); }
function tkCalNext() { tkCalState.month++; if (tkCalState.month>11){tkCalState.month=0;tkCalState.year++;} tkCalRender(); }
function tkCalGoToday() {
  const n=new Date(); tkCalState.year=n.getFullYear(); tkCalState.month=n.getMonth(); tkCalState.selected=tkToday();
  tkCalRender();
}

function tkCalRender() {
  const titleEl = document.getElementById('tk-cal-title');
  if (titleEl) titleEl.textContent = TK_MONTHS[tkCalState.month]+' '+tkCalState.year;

  const { year, month, selected } = tkCalState;
  const today     = tkToday();
  const firstDay  = new Date(year, month, 1).getDay();
  const daysInMo  = new Date(year, month+1, 0).getDate();
  const daysInPrev= new Date(year, month, 0).getDate();
  const MAX_CARDS = 3; // mini-cards por célula antes do "+N mais"

  // index tasks by day
  const byDay = {};
  S.tasks.forEach(t => {
    if (!t.data) return;
    const [ty,tm,td] = t.data.split('-').map(Number);
    if (ty===year && tm===month+1) { if(!byDay[td])byDay[td]=[]; byDay[td].push(t); }
  });

  const grid  = document.getElementById('tk-cal-days');
  if (!grid) return;
  const cells = [];

  // dias do mês anterior (placeholder)
  for (let i=firstDay-1;i>=0;i--) {
    cells.push(`<div class="tk-day other-month"><span class="tk-day-num">${daysInPrev-i}</span></div>`);
  }

  // dias do mês atual
  for (let d=1;d<=daysInMo;d++) {
    const ds  = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const tks = byDay[d] || [];
    const isToday = ds===today, isSel = ds===selected;
    const cls = ['tk-day', isToday ? 'today' : '', isSel ? 'selected' : ''].filter(Boolean).join(' ');

    // sort: pendentes antes, depois por hora
    const sorted = [...tks].sort((a,b)=>{
      if(a.done!==b.done) return a.done ? 1 : -1;
      return (a.hora||'99:99').localeCompare(b.hora||'99:99');
    });
    const miniCards = sorted.map(t => {
      const col = t.cor || TK_PRIOR_COLOR[t.prior] || '#c8a96e';
      return `<div class="tk-cal-task-card ${t.done ? 'done-mini' : ''}"
          style="--tk-color:${col}"
          oncontextmenu="return tkQuickActionsOpen(event, ${t.id})"
          onclick="event.stopPropagation();taskHubOpen(${t.id})"
          title="${esc(t.nome)}">
        ${t.hora ? `<span style="opacity:.6;margin-right:3px">${esc(t.hora)}</span>` : ''}${esc(t.nome)}
      </div>`;
    }).join('');

    cells.push(`<div class="${cls}"
        onclick="tkCalSelectDay('${ds}')"
        ondblclick="tkModalOpenForDate('${ds}')"
        title="Clique para selecionar · Duplo clique para adicionar tarefa">
      <span class="tk-day-num">${d}</span>
      <div class="tk-day-tasks">${miniCards}</div>
    </div>`);
  }

  // completar última linha
  const rem = cells.length%7===0 ? 0 : 7-(cells.length%7);
  for (let d=1;d<=rem;d++) cells.push(`<div class="tk-day other-month"><span class="tk-day-num">${d}</span></div>`);

  grid.innerHTML = cells.join('');
}

function tkCalSelectDay(ds) {
  tkCalState.selected = ds;
  tkCalRender();
  // Double-click abre modal; single click só seleciona e scroll
  const listEl = document.getElementById('tk-list-section') || document.querySelector('.tk-list-section');
  if (listEl) listEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ======================================================================
// ANALYTICS DE TAREFAS
// ======================================================================
function tkOpenAnalytics() {
  const el = document.getElementById('tk-analytics');
  if (!el) return;
  tkRenderAnalytics();
  el.classList.add('open');
  document.body.style.overflow = 'hidden';
  document.body.classList.add('tk-analytics-open');
}
function tkCloseAnalytics() {
  document.getElementById('tk-analytics').classList.remove('open');
  document.body.style.overflow = '';
  document.body.classList.remove('tk-analytics-open');
}

function tkRenderAnalytics() {
  const el = document.getElementById('tk-analytics');
  if (!el) return;
  tkMigrate();

  const tasks = S.tasks;
  const today = tkToday();
  const total = tasks.length;
  const done = tasks.filter(t => t.done).length;
  const pend = total - done;
  const pct = total ? Math.round(done / total * 100) : 0;
  const venc = tasks.filter(t => !t.done && t.data && tkDaysFromNow(t.data) < 0).length;
  const hoje = tasks.filter(t => t.data === today).length;
  const hojeD = tasks.filter(t => t.data === today && t.done).length;
  const semData = tasks.filter(t => !t.data).length;
  const getTaskChildren = task => tasks.filter(item => item.parentId === task.id);
  const getTaskComplexity = task => {
    const subtasks = task.subtarefas || [];
    const children = getTaskChildren(task);
    const totalItems = subtasks.length + children.length;
    const doneItems = subtasks.filter(s => s.done).length + children.filter(child => child.done).length;
    return { totalItems, doneItems };
  };
  const subTotal = tasks.reduce((a, t) => a + getTaskComplexity(t).totalItems, 0);
  const subDone = tasks.reduce((a, t) => a + getTaskComplexity(t).doneItems, 0);
  const detailRate = Math.round(tasks.filter(t => t.nota).length / Math.max(1, total) * 100);
  const subtaskRate = Math.round(tasks.filter(t => getTaskComplexity(t).totalItems > 0).length / Math.max(1, total) * 100);
  const datedRate = Math.round(tasks.filter(t => t.data).length / Math.max(1, total) * 100);

  const byCat = {};
  const byCatD = {};
  tasks.forEach(t => {
    const cat = t.cat || 'Outros';
    byCat[cat] = (byCat[cat] || 0) + 1;
    byCatD[cat] = (byCatD[cat] || 0) + (t.done ? 1 : 0);
  });

  const monthly = {};
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    monthly[key] = { label: TK_MONTHS_SHORT[d.getMonth()], done: 0, total: 0 };
  }
  tasks.forEach(t => {
    if (!t.data) return;
    const key = t.data.slice(0, 7);
    if (monthly[key]) {
      monthly[key].total++;
      if (t.done) monthly[key].done++;
    }
  });
  const maxMonth = Math.max(1, ...Object.values(monthly).map(m => m.total));

  const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  const catColors = ['#c8a96e', '#7c6fcd', '#5ec4a8', '#e06b8b', '#e8864a', '#4ab0e8', '#b06be8'];
  const totalCats = cats.reduce((s, [, v]) => s + v, 0);
  let cumAngle = -90;
  const donutPaths = cats.map(([, count], i) => {
    const angle = (count / Math.max(1, totalCats)) * 360;
    const color = catColors[i % catColors.length];
    if (angle >= 359.99) {
      return `<circle cx="65" cy="65" r="44" fill="${color}" opacity=".88"/>`;
    }
    const r = 44;
    const cx = 65;
    const cy = 65;
    const sA = cumAngle * Math.PI / 180;
    const eA = (cumAngle + angle) * Math.PI / 180;
    const x1 = cx + r * Math.cos(sA);
    const y1 = cy + r * Math.sin(sA);
    const x2 = cx + r * Math.cos(eA);
    const y2 = cy + r * Math.sin(eA);
    const path = `<path d="M${cx},${cy} L${x1.toFixed(1)},${y1.toFixed(1)} A${r},${r} 0 ${angle > 180 ? 1 : 0},1 ${x2.toFixed(1)},${y2.toFixed(1)} Z" fill="${color}" opacity=".88"/>`;
    cumAngle += angle;
    return path;
  }).join('');

  const priorRate = ['alta', 'media', 'baixa'].map(k => {
    const tot = tasks.filter(t => t.prior === k).length;
    const dn = tasks.filter(t => t.prior === k && t.done).length;
    return { k, tot, dn, pct: tot ? Math.round(dn / tot * 100) : 0 };
  });

  const topSub = [...tasks]
    .filter(t => getTaskComplexity(t).totalItems > 0)
    .sort((a, b) => getTaskComplexity(b).totalItems - getTaskComplexity(a).totalItems)
    .slice(0, 5);

  const proximas = [...tasks]
    .filter(t => !t.done && t.data && tkDaysFromNow(t.data) >= 0)
    .sort((a, b) => a.data.localeCompare(b.data))
    .slice(0, 5);

  const vencTasks = tasks
    .filter(t => !t.done && t.data && tkDaysFromNow(t.data) < 0)
    .sort((a, b) => a.data.localeCompare(b.data))
    .slice(0, 6);

  let healthScore = 0;
  if (pct >= 50) healthScore += 25;
  if (venc === 0) healthScore += 25;
  if (detailRate > 50) healthScore += 15;
  if (subtaskRate > 30) healthScore += 15;
  if (datedRate > 70) healthScore += 20;
  const healthLabel = healthScore >= 80 ? 'Excelente' : healthScore >= 60 ? 'Bom' : healthScore >= 40 ? 'Regular' : 'Atenção';
  const healthColor = healthScore >= 80 ? '#5ec4a8' : healthScore >= 60 ? '#c8a96e' : healthScore >= 40 ? '#e8864a' : '#e06b8b';
  const ringC = 2 * Math.PI * 32;

  const categoryLegend = cats.length
    ? cats.slice(0, 6).map(([name, count], i) => {
        const rate = byCatD[name] ? Math.round(byCatD[name] / count * 100) : 0;
        return `<div class="san-legend-item">
          <div class="san-legend-dot" style="background:${catColors[i % catColors.length]}"></div>
          <span class="san-legend-lbl">${esc(name)}</span>
          <span class="san-legend-val">${count} <span style="opacity:.5;font-size:9px">${rate}% ok</span></span>
        </div>`;
      }).join('')
    : '<div style="font-size:12px;color:var(--muted);font-family:var(--font-mono);font-style:italic">Nenhuma categoria registrada</div>';

  const priorityLabel = { alta: 'Alta', media: 'Média', baixa: 'Baixa' };

  el.innerHTML = `
    <div class="san-body">
      <div class="san-intro">
        <div class="san-intro-head">
          <div>
            <div class="san-header-title">Analytics de <em>Tarefas</em></div>
            <div class="san-header-sub">Visao completa do seu planejamento pessoal</div>
          </div>
          <button class="san-back-btn" onclick="tkCloseAnalytics()">Voltar</button>
        </div>
      </div>

      <div class="san-kpi-row">
        <div class="san-kpi" style="--kpi-color:#c8a96e">
          <div class="san-kpi-icon">📋</div><div class="san-kpi-val">${total}</div>
          <div class="san-kpi-lbl">Total de tarefas</div>
        </div>
        <div class="san-kpi" style="--kpi-color:#e8864a">
          <div class="san-kpi-icon">⏳</div><div class="san-kpi-val">${pend}</div>
          <div class="san-kpi-lbl">Pendentes</div>
        </div>
        <div class="san-kpi" style="--kpi-color:#5ec4a8">
          <div class="san-kpi-icon">✅</div><div class="san-kpi-val">${done}</div>
          <div class="san-kpi-lbl">Concluídas</div>
          <div class="san-kpi-sub">${pct}% do total</div>
        </div>
        <div class="san-kpi" style="--kpi-color:#e06b8b">
          <div class="san-kpi-icon">🔴</div><div class="san-kpi-val">${venc}</div>
          <div class="san-kpi-lbl">Vencidas</div>
        </div>
        <div class="san-kpi" style="--kpi-color:#4ab0e8">
          <div class="san-kpi-icon">📅</div><div class="san-kpi-val">${hoje}</div>
          <div class="san-kpi-lbl">Para hoje</div>
          <div class="san-kpi-sub">${hojeD} concluídas</div>
        </div>
      </div>

      <div class="san-charts-row">
        <div class="san-card" style="flex:2">
          <div class="san-card-title"><span class="san-card-title-icon">📈</span>Atividade mensal - últimos 6 meses</div>
          <div class="san-bar-chart">
            ${Object.values(monthly).map(m => {
              const pTot = Math.round(m.total / maxMonth * 100);
              const pDone = Math.round(m.done / maxMonth * 100);
              return `<div class="san-bar-item">
                <div class="san-bar-label">${m.label}</div>
                <div class="san-bar-track" style="position:relative">
                  <div class="san-bar-fill" style="background:rgba(124,111,205,.2);width:0" data-w="${pTot}"></div>
                  <div class="san-bar-fill" style="position:absolute;top:0;left:0;height:100%;border-radius:6px;background:var(--accent3);width:0;transition:width 1.1s .1s cubic-bezier(.22,1,.36,1)" data-w="${pDone}"></div>
                </div>
                <div class="san-bar-val">${m.total}</div>
              </div>`;
            }).join('')}
          </div>
          <div style="display:flex;gap:16px;margin-top:12px">
            <div style="display:flex;align-items:center;gap:6px;font-size:10px;font-family:var(--font-mono);color:var(--muted)">
              <div style="width:10px;height:10px;border-radius:3px;background:rgba(124,111,205,.2)"></div>Total
            </div>
            <div style="display:flex;align-items:center;gap:6px;font-size:10px;font-family:var(--font-mono);color:var(--muted)">
              <div style="width:10px;height:10px;border-radius:3px;background:var(--accent3)"></div>Concluídas
            </div>
          </div>
        </div>
        <div class="san-card" style="flex:1">
          <div class="san-card-title"><span class="san-card-title-icon">🗂️</span>Por categoria</div>
          <div class="san-donut-wrap">
            <svg class="san-donut-svg" viewBox="0 0 130 130">
              ${donutPaths}
              <circle cx="65" cy="65" r="28" fill="#05040f"/>
              <text x="65" y="61" text-anchor="middle" fill="var(--text)" font-family="var(--font-display)" font-size="16" font-weight="700">${total}</text>
              <text x="65" y="75" text-anchor="middle" fill="var(--muted)" font-family="var(--font-mono)" font-size="7">tarefas</text>
            </svg>
            <div class="san-donut-legend">${categoryLegend}</div>
          </div>
        </div>
      </div>

      <div class="san-charts-row-3">
        <div class="san-card">
          <div class="san-card-title"><span class="san-card-title-icon">🎯</span>Taxa por prioridade</div>
          <div class="san-bar-chart" style="gap:12px">
            ${priorRate.map(({ k, tot, dn, pct: p }) => {
              const col = TK_PRIOR_COLOR[k];
              return `<div class="san-bar-item">
                <div class="san-bar-label">${priorityLabel[k]}</div>
                <div class="san-bar-track">
                  <div class="san-bar-fill" data-w="${p}" style="background:${col};width:0"></div>
                </div>
                <div class="san-bar-val">${dn}/${tot}</div>
              </div>`;
            }).join('')}
          </div>
          <div style="margin-top:14px;display:flex;flex-direction:column;gap:8px">
            <div style="display:flex;justify-content:space-between;font-size:11px;font-family:var(--font-mono)">
              <span style="color:var(--muted)">Subtarefas totais</span>
              <span style="color:var(--text);font-weight:700">${subTotal}</span>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:11px;font-family:var(--font-mono)">
              <span style="color:var(--muted)">Subtarefas concluídas</span>
              <span style="color:var(--accent3);font-weight:700">${subDone}</span>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:11px;font-family:var(--font-mono)">
              <span style="color:var(--muted)">Sem data definida</span>
              <span style="color:var(--accent5);font-weight:700">${semData}</span>
            </div>
          </div>
        </div>

        <div class="san-card">
          <div class="san-card-title"><span class="san-card-title-icon">💠</span>Score de saúde</div>
          <div class="san-health-ring-wrap">
            <svg width="120" height="120" viewBox="0 0 80 80">
              <circle cx="40" cy="40" r="32" fill="none" stroke="rgba(255,255,255,.05)" stroke-width="8"/>
              <circle cx="40" cy="40" r="32" fill="none" stroke="${healthColor}" stroke-width="8"
                stroke-dasharray="${ringC.toFixed(2)}"
                stroke-dashoffset="${(ringC * (1 - healthScore / 100)).toFixed(2)}"
                transform="rotate(-90 40 40)" stroke-linecap="round"
                style="transition:stroke-dashoffset 1.4s cubic-bezier(.22,1,.36,1)"/>
              <text x="40" y="37" text-anchor="middle" fill="${healthColor}" font-family="var(--font-display)" font-size="16" font-weight="700">${healthScore}</text>
              <text x="40" y="50" text-anchor="middle" fill="var(--muted)" font-family="var(--font-mono)" font-size="7">/100</text>
            </svg>
            <div class="san-score-lbl" style="color:${healthColor}">${healthLabel}</div>
          </div>
          <div class="san-health-factors">
            ${[
              ['Taxa de conclusão >= 50%', pct >= 50, `${pct}%`],
              ['Sem tarefas vencidas', venc === 0, venc === 0 ? 'OK' : `${venc} venc.`],
              ['Mais de 50% com detalhes', detailRate > 50, `${detailRate}%`],
              ['Mais de 30% com subtarefas', subtaskRate > 30, `${subtaskRate}%`],
              ['Mais de 70% com data', datedRate > 70, `${datedRate}%`]
            ].map(([lbl, ok, val]) => `
              <div class="san-health-factor">
                <div class="san-health-factor-row">
                  <span class="san-health-factor-lbl">${lbl}</span>
                  <span class="san-health-factor-val" style="color:${ok ? 'var(--accent3)' : 'var(--accent4)'}">${val}</span>
                </div>
                <div class="san-health-bar">
                  <div class="san-health-fill" style="background:${ok ? 'var(--accent3)' : 'var(--accent4)'};width:${ok ? '100' : '30'}%"></div>
                </div>
              </div>`).join('')}
          </div>
        </div>

        <div class="san-card">
          <div class="san-card-title"><span class="san-card-title-icon">⏭️</span>Próximas tarefas</div>
          ${proximas.length === 0
            ? '<div style="font-size:12px;color:var(--muted);font-family:var(--font-mono);font-style:italic;padding:12px 0">Nenhuma tarefa futura pendente</div>'
            : `<div class="san-rank-list">
              ${proximas.map((t, i) => {
                const diff = tkDaysFromNow(t.data);
                const urgColor = diff === 0 ? '#e8864a' : diff <= 2 ? '#e06b8b' : '#5ec4a8';
                const urgLabel = diff === 0 ? 'Hoje' : diff === 1 ? 'Amanhã' : `em ${diff}d`;
                const pColor = TK_PRIOR_COLOR[t.prior] || '#c8a96e';
                return `<div class="san-rank-item" onclick="taskHubOpen(${t.id})" style="cursor:pointer">
                  <div class="san-rank-pos" style="background:${t.cor || pColor}22;color:${t.cor || pColor}">${i + 1}</div>
                  <div class="san-rank-info">
                    <div class="san-rank-name">${esc(t.nome)}</div>
                    <div class="san-rank-meta">${esc(t.cat)} · ${priorityLabel[t.prior] || ''}</div>
                  </div>
                  <div style="font-size:10px;font-family:var(--font-mono);font-weight:700;color:${urgColor};flex-shrink:0">${urgLabel}</div>
                </div>`;
              }).join('')}
            </div>`}
        </div>
      </div>

      <div class="san-charts-row">
        <div class="san-card" style="flex:1">
          <div class="san-card-title"><span class="san-card-title-icon">?</span>Mais complexas (subtarefas)</div>
          ${topSub.length === 0
            ? '<div style="font-size:12px;color:var(--muted);font-family:var(--font-mono);font-style:italic">Nenhuma tarefa com subtarefas</div>'
            : `<div class="san-rank-list">
              ${topSub.map((t, i) => {
                const complexity = getTaskComplexity(t);
                const subD = complexity.doneItems;
                const subT = complexity.totalItems;
                const sp = Math.round(subD / subT * 100);
                const col = t.cor || TK_PRIOR_COLOR[t.prior] || '#c8a96e';
                return `<div class="san-rank-item" onclick="taskHubOpen(${t.id})" style="cursor:pointer">
                  <div class="san-rank-pos" style="background:${col}22;color:${col}">${i + 1}</div>
                  <div class="san-rank-info">
                    <div class="san-rank-name">${esc(t.nome)}</div>
                    <div class="san-rank-meta">${subD}/${subT} subtarefas ? ${sp}%</div>
                  </div>
                  <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;flex-shrink:0">
                    <div style="font-size:11px;font-weight:700;color:${col}">${sp}%</div>
                    <div style="width:60px;height:4px;border-radius:3px;background:rgba(255,255,255,.06)">
                      <div style="height:100%;border-radius:3px;background:${col};width:${sp}%;transition:width 1s"></div>
                    </div>
                  </div>
                </div>`;
              }).join('')}
            </div>`}
        </div>

        <div class="san-card" style="flex:1">
          <div class="san-card-title"><span class="san-card-title-icon">?</span>Tarefas vencidas por prioridade</div>
          ${!vencTasks.length
            ? '<div style="font-size:12px;color:var(--accent3);font-family:var(--font-mono);font-style:italic;padding:12px 0">OK Nenhuma tarefa vencida</div>'
            : `<div class="san-rank-list">
              ${vencTasks.map(t => {
                const diff = Math.abs(tkDaysFromNow(t.data));
                const col = TK_PRIOR_COLOR[t.prior] || '#e06b8b';
                return `<div class="san-rank-item" onclick="taskHubOpen(${t.id})" style="cursor:pointer">
                  <div class="san-rank-pos" style="background:${col}22;color:${col}">!</div>
                  <div class="san-rank-info">
                    <div class="san-rank-name">${esc(t.nome)}</div>
                    <div class="san-rank-meta">${esc(t.cat)} ? ${tkFmtDate(t.data)}</div>
                  </div>
                  <div style="font-size:10px;font-family:var(--font-mono);font-weight:700;color:var(--accent4);flex-shrink:0">${diff}d atras</div>
                </div>`;
              }).join('')}
            </div>`}
        </div>
      </div>
    </div>`;

  setTimeout(() => {
    el.querySelectorAll('[data-w]').forEach(bar => {
      bar.style.width = bar.dataset.w + '%';
    });
  }, 120);
}

function tkQuickToggle(id) {
  const t = S.tasks.find(x => x.id === id);
  if (!t) return;
  t.done = !t.done;
  save(); renderTasks();
  // se o hub estiver aberto para este item, atualiza
  if (taskHubState.id === id) taskHubRender(t);
}

// ======================================================================
// MODAL NOVA TAREFA
// ======================================================================
let tkModalDate = '';
let tkModalColor = TK_COLORS[0];

function tkNormalizeHexColor(value, fallback) {
  var normalized = String(value || '').trim();
  if (/^#[0-9a-fA-F]{6}$/.test(normalized)) return normalized.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(normalized)) {
    return ('#' + normalized[1] + normalized[1] + normalized[2] + normalized[2] + normalized[3] + normalized[3]).toLowerCase();
  }
  return typeof fallback === 'string' ? fallback : '';
}

function tkBuildColorPicker(containerId, selectedColor, onPickFn) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const normalizedColor = tkNormalizeHexColor(selectedColor, TK_COLORS[0]);
  const isPreset = TK_COLORS.indexOf(normalizedColor) >= 0;
  el.innerHTML =
    `<div class="tk-color-picker-shell">
      <div class="tk-color-preset-grid">
        ${TK_COLORS.map(col =>
          `<button type="button"
            class="tk-color-opt ${col===normalizedColor ? 'sel' : ''}"
            style="background:${col}"
            onclick="(${onPickFn})('${col}')"
            aria-label="Selecionar cor ${col.toUpperCase()}"></button>`
        ).join('')}
      </div>
      <label class="tk-color-custom-trigger ${!isPreset ? 'sel' : ''}" style="--picker-color:${normalizedColor}">
        <input class="tk-color-native" type="color" value="${normalizedColor}" onchange="tkHandleCustomColorPick('${onPickFn}', this.value)">
        <span class="tk-color-custom-chip" aria-hidden="true"></span>
        <span class="tk-color-custom-copy">
          <strong>Personalizar</strong>
          <small>${normalizedColor.toUpperCase()}</small>
        </span>
      </label>
    </div>`;
}

function tkHandleCustomColorPick(onPickFn, value) {
  var normalizedColor = tkNormalizeHexColor(value, TK_COLORS[0]);
  if (typeof window[onPickFn] === 'function') window[onPickFn](normalizedColor);
}

function tkUpdateEndDateMin(prefix) {
  var startInput = document.getElementById(prefix + '-data');
  var endInput = document.getElementById(prefix + '-data-fim');
  var checkbox = document.getElementById(prefix + '-tem-data-fim');
  if (!startInput || !endInput || !checkbox) return;
  endInput.min = startInput.value || '';
  if (checkbox.checked && startInput.value && (!endInput.value || endInput.value < startInput.value)) {
    endInput.value = startInput.value;
  }
}

function tkToggleEndDateFields(prefix) {
  var checkbox = document.getElementById(prefix + '-tem-data-fim');
  var wrap = document.getElementById(prefix + '-data-fim-wrap');
  var endInput = document.getElementById(prefix + '-data-fim');
  if (!checkbox || !wrap || !endInput) return;
  wrap.hidden = !checkbox.checked;
  endInput.required = checkbox.checked;
  if (!checkbox.checked) {
    endInput.value = '';
    endInput.min = '';
    return;
  }
  tkUpdateEndDateMin(prefix);
}

function tkReadEndDate(prefix, startDate) {
  var checkbox = document.getElementById(prefix + '-tem-data-fim');
  var endInput = document.getElementById(prefix + '-data-fim');
  if (!checkbox || !checkbox.checked) return '';
  if (!startDate) {
    alert('Defina a Data de início antes de informar a Data de Término.');
    var startInput = document.getElementById(prefix + '-data');
    if (startInput) startInput.focus();
    return null;
  }
  if (!endInput || !endInput.value) {
    alert('Informe a Data de Término.');
    if (endInput) endInput.focus();
    return null;
  }
  if (endInput.value < startDate) {
    alert('A Data de Término não pode ser anterior à Data de início.');
    endInput.focus();
    return null;
  }
  return endInput.value;
}

function tkTaskHasDateRange(task) {
  return !!(task && task.data && task.dataFim && String(task.dataFim).slice(0, 10) > String(task.data).slice(0, 10));
}

function tkDuplicateTaskAtDate(taskId, targetDate) {
  var original = S.tasks.find(function (item) { return Number(item.id) === Number(taskId); });
  if (!original || !targetDate) return false;
  var newId = Date.now() + Math.floor(Math.random() * 1000000) + 1;
  var duration = tkTaskHasDateRange(original) ? tkDiffDays(original.data, original.dataFim) : 0;
  var copy = Object.assign({}, original, {
    id: newId,
    nome: original.nome || '',
    data: targetDate,
    dataFim: original.dataFim ? tkAddDays(targetDate, duration) : '',
    done: false,
    subtarefas: tkCloneSubtasks(original.subtarefas),
    recurrence: 'none',
    parentId: null,
    isRecurringClone: false,
    recurrenceMasterId: newId,
    recurrenceIndex: 0,
    recurrenceSeedDate: targetDate,
    recurrenceExceptions: []
  });
  S.tasks.push(copy);
  save();
  renderTasks();
  return true;
}

function tkModalOpenForDate(ds) {
  tkModalDate = ds || tkToday();
  tkModalColor = TK_COLORS[0];
  document.getElementById('tkm-nome').value  = '';
  document.getElementById('tkm-nota').value  = '';
  document.getElementById('tkm-hora').value  = '';
  document.getElementById('tkm-data').value  = tkModalDate;
  document.getElementById('tkm-tem-data-fim').checked = false;
  document.getElementById('tkm-data-fim').value = '';
  tkToggleEndDateFields('tkm');
  document.getElementById('tkm-recorrencia').value = 'none';
  document.getElementById('tkm-prior').value = 'media';
  document.getElementById('tkm-cat').value   = 'Pessoal';
  document.getElementById('tk-modal-date-label').textContent = tkFmtDateLong(tkModalDate);
  tkBuildColorPicker('tkm-colors', tkModalColor, 'tkModalPickColor');
  document.getElementById('tk-modal-bd').classList.add('open');
  setTimeout(() => document.getElementById('tkm-nome').focus(), 150);
}

function tkModalPickColor(col) {
  tkModalColor = col;
  tkBuildColorPicker('tkm-colors', tkModalColor, 'tkModalPickColor');
}

function tkModalSetDate(value) {
  tkModalDate = value || '';
  document.getElementById('tk-modal-date-label').textContent = tkModalDate ? tkFmtDateLong(tkModalDate) : 'Sem data';
  tkUpdateEndDateMin('tkm');
}

function tkModalClose() {
  document.getElementById('tk-modal-bd').classList.remove('open');
  taskLinkPendingCreate = null;
}
function tkModalCloseOutside(e) { if (e.target.id === 'tk-modal-bd') tkModalClose(); }

function tkModalSave() {
  const nome = document.getElementById('tkm-nome').value.trim();
  if (!nome) { document.getElementById('tkm-nome').focus(); return; }
  const selectedDate = document.getElementById('tkm-data').value;
  tkModalSetDate(selectedDate);
  const task = {
    id:         Date.now(),
    nome,
    nota:       document.getElementById('tkm-nota').value.trim(),
    prior:      document.getElementById('tkm-prior').value,
    cat:        document.getElementById('tkm-cat').value,
    hora:       document.getElementById('tkm-hora').value,
    recurrence: document.getElementById('tkm-recorrencia').value,
    data:       selectedDate,
    cor:        tkModalColor,
    done:       false,
    subtarefas: [],
    parentId:   null,
    isRecurringClone: false,
    recurrenceMasterId: null,
    recurrenceIndex: 0,
    recurrenceSeedDate: selectedDate,
    recurrenceExceptions: [],
  };
  task.recurrenceMasterId = task.id;
  S.tasks.push(task);
  save(); renderTasks();
  tkModalClose();
}

// Compatibilidade com código antigo
function addTask() { tkModalOpenForDate(tkCalState.selected); }
function toggleTask(id) { tkQuickToggle(id); }
function delTask(id) { tkDeleteTaskById(id); }

function tkGetTaskById(id) {
  return S.tasks.find(function (item) { return item.id === id; }) || null;
}

function tkDeleteTaskSeriesById(id) {
  const task = tkGetTaskById(id);
  if (!task) return false;
  const master = tkGetRecurringMaster(task) || task;
  const targetId = master.id;
  const removedIds = new Set([targetId]);
  S.tasks.forEach(function (item) {
    if (item.isRecurringClone && item.recurrenceMasterId === targetId) removedIds.add(item.id);
  });
  const nextParentId = master.parentId || null;
  S.tasks.forEach(function (item) {
    if (removedIds.has(item.parentId)) item.parentId = nextParentId;
  });
  S.tasks = S.tasks.filter(function (item) {
    return !removedIds.has(item.id);
  });
  tkCalendarSelection.ids.delete(targetId);
  tkCalendarSelection.ids.delete(id);
  if (taskHubState.id === id || taskHubState.id === targetId) {
    taskHubDrawerClose();
    taskHubClose();
  }
  save();
  renderTasks();
  return true;
}

function tkDeleteTaskById(id) {
  const task = tkGetTaskById(id);
  if (!task) return false;
  if (task.recurrence && task.recurrence !== 'none') {
    return tkDeleteTaskSeriesById(id);
  }
  const nextParentId = task.parentId || null;
  S.tasks.forEach(function (item) {
    if (item.parentId === id) item.parentId = nextParentId;
  });
  S.tasks = S.tasks.filter(function (item) {
    if (item.id === id) return false;
    if (!task.isRecurringClone && item.isRecurringClone && item.recurrenceMasterId === task.id) return false;
    return true;
  });
  tkCalendarSelection.ids.delete(id);
  if (taskHubState.id === id) {
    taskHubDrawerClose();
    taskHubClose();
  }
  save();
  renderTasks();
  return true;
}

function tkDeleteRecurringOccurrence(id) {
  const task = tkGetTaskById(id);
  if (!task) return false;
  if (!task.recurrence || task.recurrence === 'none') return tkDeleteTaskById(id);
  const master = tkGetRecurringMaster(task);
  if (!master) return tkDeleteTaskById(id);
  tkNormalizeRecurringMeta(master);

  const occurrenceDate = task.data || '';
  if (occurrenceDate && master.recurrenceExceptions.indexOf(occurrenceDate) === -1) {
    master.recurrenceExceptions.push(occurrenceDate);
  }

  if (task.id !== master.id) {
    const nextParentId = task.parentId || null;
    S.tasks.forEach(function (item) {
      if (item.parentId === id) item.parentId = nextParentId;
    });
    S.tasks = S.tasks.filter(function (item) { return item.id !== id; });
    tkCalendarSelection.ids.delete(id);
  }

  tkSyncRecurringSeries(master.id);
  if (taskHubState.id === id && task.id !== master.id) {
    taskHubDrawerClose();
    taskHubClose();
  }
  save();
  renderTasks();
  if (taskHubState.id === master.id) taskHubRender(master);
  return true;
}

function tkDeletePopupClose() {
  const backdrop = document.getElementById('tk-delete-bd');
  if (backdrop) backdrop.classList.remove('open');
  tkDeletePopupState.onChoice = null;
}

function tkDeletePopupCloseOutside(event) {
  if (event.target && event.target.id === 'tk-delete-bd') tkDeletePopupClose();
}

function tkDeletePopupChoose(choice) {
  const onChoice = tkDeletePopupState.onChoice;
  tkDeletePopupClose();
  if (typeof onChoice === 'function') onChoice(choice);
}

function tkDeletePopupOpen(config) {
  const backdrop = document.getElementById('tk-delete-bd');
  const kicker = document.getElementById('tk-delete-kicker');
  const title = document.getElementById('tk-delete-title');
  const text = document.getElementById('tk-delete-text');
  const meta = document.getElementById('tk-delete-meta');
  const actions = document.getElementById('tk-delete-actions');
  if (!backdrop || !kicker || !title || !text || !meta || !actions) return;

  kicker.textContent = config.kicker || 'Excluir tarefa';
  title.textContent = config.title || 'Tem certeza?';
  text.textContent = config.text || '';
  meta.innerHTML = (config.meta || []).map(function (item) {
    return '<span class="tk-delete-chip">' + esc(item) + '</span>';
  }).join('');
  meta.classList.toggle('has-meta', !!(config.meta && config.meta.length));
  actions.innerHTML = (config.actions || []).map(function (action) {
    return '<button type="button" class="tk-delete-action ' + (action.className || '') + '" onclick="tkDeletePopupChoose(\'' + action.value + '\')">' +
      '<span class="tk-delete-action-title">' + action.title + '</span>' +
      (action.sub ? '<span class="tk-delete-action-sub">' + action.sub + '</span>' : '') +
      '</button>';
  }).join('');
  tkDeletePopupState.onChoice = config.onChoice || null;
  backdrop.classList.add('open');
}

function tkRequestDeleteTask(task, onChoice) {
  if (!task) return;
  const isRecurring = !!(task.recurrence && task.recurrence !== 'none');
  const meta = [];
  if (task.data) meta.push(tkFmtDate(task.data));
  if (task.cat) meta.push(task.cat);
  if (isRecurring) meta.push(TK_RECURRENCE_LABEL[task.recurrence] || 'Recorrente');

  if (isRecurring) {
    tkDeletePopupOpen({
      kicker: 'Tarefa recorrente',
      title: 'Como voce quer excluir "' + task.nome + '"?',
      text: 'Voce pode remover somente esta ocorrencia ou apagar toda a repeticao.',
      meta: meta,
      actions: [
        {
          value: 'occurrence',
          title: 'Excluir apenas esta data',
          sub: 'Remove somente a ocorrencia atual e mantem as proximas repeticoes.',
          className: 'primary'
        },
        {
          value: 'series',
          title: 'Excluir serie inteira',
          sub: 'Apaga esta tarefa recorrente e todas as outras ocorrencias da repeticao.',
          className: 'danger'
        },
        {
          value: 'cancel',
          title: 'Manter tarefa',
          sub: 'Fecha o popup sem excluir nada.',
          className: 'ghost'
        }
      ],
      onChoice: onChoice
    });
    return;
  }

  tkDeletePopupOpen({
    kicker: 'Confirmar exclusao',
    title: 'Excluir "' + task.nome + '"?',
    text: 'Essa acao remove a tarefa atual da sua lista.',
    meta: meta,
    actions: [
      {
        value: 'delete',
        title: 'Excluir tarefa',
        sub: 'Remove esta tarefa imediatamente.',
        className: 'danger'
      },
      {
        value: 'cancel',
        title: 'Cancelar',
        sub: 'Volta sem fazer alteracoes.',
        className: 'ghost'
      }
    ],
    onChoice: onChoice
  });
}

function tkDuplicateTask(id) {
  const original = tkGetTaskById(id);
  if (!original) return null;
  const copyId = Date.now();
  const duplicated = {
    id: copyId,
    nome: (original.nome || 'Tarefa') + ' (cópia)',
    nota: original.nota || '',
    prior: original.prior || 'media',
    cat: original.cat || 'Pessoal',
    hora: original.hora || '',
    recurrence: original.recurrence || 'none',
    data: original.data || '',
    cor: original.cor || TK_COLORS[0],
    done: false,
    subtarefas: (original.subtarefas || []).map(function (sub) {
      return { texto: sub.texto, done: false };
    }),
    parentId: original.parentId || null,
    isRecurringClone: false,
    recurrenceMasterId: copyId,
    recurrenceIndex: 0,
    recurrenceSeedDate: original.data || '',
    recurrenceExceptions: []
  };
  S.tasks.push(duplicated);
  if (duplicated.recurrence && duplicated.recurrence !== 'none') tkSyncRecurringSeries(duplicated.id);
  save();
  renderTasks();
  return duplicated;
}

function tkQuickActionFocusField(task) {
  if (!task) return;
  if (task.done) {
    document.getElementById('tkd-nome')?.focus();
    return;
  }
  if (task.subtarefas && task.subtarefas.length) {
    document.getElementById('taskh-new-sub')?.focus();
    return;
  }
  document.getElementById('tkd-nota')?.focus();
}

function tkQuickActionsClose() {
  const menu = document.getElementById('tk-quick-actions');
  if (menu) menu.classList.remove('open');
  tkQuickActionState = null;
}

function tkQuickActionsOpen(event, id) {
  event.preventDefault();
  event.stopPropagation();
  const task = tkGetTaskById(id);
  const menu = document.getElementById('tk-quick-actions');
  const title = document.getElementById('tk-quick-actions-title');
  const list = document.getElementById('tk-quick-actions-list');
  if (!task || !menu || !title || !list) return false;
  tkQuickActionState = { id: id };
  title.textContent = task.nome || 'Tarefa';
  list.innerHTML = [
    '<button type="button" class="tk-quick-action-btn" onclick="tkQuickActionOpenTask()">Abrir tarefa</button>',
    '<button type="button" class="tk-quick-action-btn" onclick="tkQuickActionEditTask()">Editar</button>',
    '<button type="button" class="tk-quick-action-btn" onclick="tkQuickActionToggleDone()">' + (task.done ? 'Reabrir' : 'Concluir') + '</button>',
    '<button type="button" class="tk-quick-action-btn" onclick="tkQuickActionDuplicateTask()">Duplicar</button>',
    '<button type="button" class="tk-quick-action-btn danger" onclick="tkQuickActionDeleteTask()">Excluir</button>'
  ].join('');
  menu.classList.add('open');
  const padding = 12;
  const rect = menu.getBoundingClientRect();
  const left = Math.min(event.clientX, window.innerWidth - rect.width - padding);
  const top = Math.min(event.clientY, window.innerHeight - rect.height - padding);
  menu.style.left = Math.max(padding, left) + 'px';
  menu.style.top = Math.max(padding, top) + 'px';
  return false;
}

function tkQuickActionOpenTask() {
  if (!tkQuickActionState) return;
  const task = tkGetTaskById(tkQuickActionState.id);
  tkQuickActionsClose();
  if (!task) return;
  taskHubOpen(task.id);
}

function tkQuickActionEditTask() {
  if (!tkQuickActionState) return;
  const task = tkGetTaskById(tkQuickActionState.id);
  tkQuickActionsClose();
  if (!task) return;
  taskHubOpen(task.id);
  taskHubDrawerOpen();
  setTimeout(function () { tkQuickActionFocusField(task); }, 220);
}

function tkQuickActionToggleDone() {
  if (!tkQuickActionState) return;
  const task = tkGetTaskById(tkQuickActionState.id);
  if (!task) return;
  tkQuickActionsClose();
  tkQuickToggle(task.id);
}

function tkQuickActionDuplicateTask() {
  if (!tkQuickActionState) return;
  const duplicated = tkDuplicateTask(tkQuickActionState.id);
  tkQuickActionsClose();
  if (duplicated) taskHubOpen(duplicated.id);
}

function tkQuickActionDeleteTask() {
  if (!tkQuickActionState) return;
  const task = tkGetTaskById(tkQuickActionState.id);
  if (!task) return;
  tkQuickActionsClose();
  tkRequestDeleteTask(task, function (mode) {
    if (mode === 'occurrence') tkDeleteRecurringOccurrence(task.id);
    else if (mode === 'series') tkDeleteTaskSeriesById(task.id);
    else if (mode === 'delete') tkDeleteTaskById(task.id);
  });
}

// ======================================================================
// TASK HUB FULLSCREEN
// ======================================================================
const taskHubState = { id: null };
let taskHubDrawerColor = TK_COLORS[0];

function taskHubOpen(id) {
  tkQuickActionsClose();
  const t = S.tasks.find(x => x.id === id); if (!t) return;
  taskHubState.id = id;
  const hub = document.getElementById('task-hub');
  hub.scrollTop = 0;
  hub.classList.add('open');
  document.body.style.overflow = 'hidden';
  const header = document.querySelector('.site-header');
  if (header) header.style.zIndex = '1';
  taskHubRender(t);
}

function taskHubClose() {
  tkQuickActionsClose();
  document.getElementById('task-hub').classList.remove('open');
  document.body.style.overflow = '';
  const header = document.querySelector('.site-header');
  if (header) header.style.zIndex = '';
  taskHubState.id = null;
}

function taskHubRender(t) {
  const pColor = TK_PRIOR_COLOR[t.prior] || '#c8a96e';
  const color  = t.cor || pColor;

  const heroEl = document.getElementById('taskh-hero');
  heroEl.style.background = `linear-gradient(160deg, ${color}22 0%, #06051a 60%, #100820 100%)`;
  document.getElementById('taskh-accent-bar').style.background =
    `linear-gradient(90deg, transparent 0%, ${color}aa 30%, ${color} 60%, transparent 100%)`;
  document.getElementById('taskh-hero-img').src = '';
  heroEl.classList.remove('has-img');

  const priorIcons = { alta:'\u25c6', media:'\u25c8', baixa:'\u2726' };
  document.getElementById('taskh-icon').textContent = priorIcons[t.prior] || '\u25ce';
  const badgeEl = document.getElementById('taskh-badge');
  badgeEl.textContent = t.cat || 'Tarefa';
  badgeEl.style.color = color;
  badgeEl.style.borderColor = color+'44';
  badgeEl.style.background = color+'18';
  document.getElementById('taskh-title').textContent = t.nome;

  const chips = [];
  chips.push(`<div class="hub-hero-chip" style="color:${pColor}">${TK_PRIOR_LABEL[t.prior] || '?'}</div>`);
  if (t.data) {
    const diff = tkDaysFromNow(t.data);
    const cls = diff < 0 && !t.done ? 'warning' : diff === 0 ? 'success' : '';
    const lbl = diff === 0 ? 'Hoje' : diff === 1 ? 'Amanhã' : diff < 0 ? `${Math.abs(diff)}d atrasada` : `em ${diff}d`;
    chips.push(`<div class="hub-hero-chip ${cls}">📅 ${tkFmtDate(t.data)}${t.dataFim ? ' – ' + tkFmtDate(t.dataFim) : ''} · ${lbl}</div>`);
  }
  if (t.hora) chips.push(`<div class="hub-hero-chip">🕒 ${esc(t.hora)}</div>`);
  const subTotal = (t.subtarefas || []).length;
  const subDone = (t.subtarefas || []).filter(s => s.done).length;
  if (subTotal > 0) chips.push(`<div class="hub-hero-chip">\u25c8 ${subDone}/${subTotal} subtarefas</div>`);
  document.getElementById('taskh-meta').innerHTML = chips.join('');

  const notaEl = document.getElementById('taskh-nota-display');
  if (t.nota && t.nota.trim()) {
    notaEl.className = 'taskh-nota-text';
    notaEl.textContent = t.nota;
  } else {
    notaEl.className = 'taskh-nota-empty';
    notaEl.textContent = 'Sem detalhes. Edite para adicionar contexto.';
  }

  taskHubRenderSubs(t);
  taskHubRenderRing(t);

  const schedEl = document.getElementById('taskh-sched-content');
  const diff = t.data ? tkDaysFromNow(t.data) : null;
  schedEl.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:10px">
      <div style="display:flex;justify-content:space-between">
        <span style="font-size:11px;font-family:var(--font-mono);color:var(--muted)">Data de início</span>
        <span style="font-size:13px;font-weight:700;color:var(--text)">${t.data ? tkFmtDate(t.data) : '—'}</span>
      </div>
      ${t.dataFim ? `<div style="display:flex;justify-content:space-between"><span style="font-size:11px;font-family:var(--font-mono);color:var(--muted)">Data de Término</span><span style="font-size:13px;font-weight:700;color:var(--text)">${tkFmtDate(t.dataFim)}</span></div>` : ''}
      ${t.hora ? `<div style="display:flex;justify-content:space-between">
        <span style="font-size:11px;font-family:var(--font-mono);color:var(--muted)">Hora</span>
        <span style="font-size:13px;font-weight:700;color:var(--text)">${esc(t.hora)}</span>
      </div>` : ''}
      ${diff !== null ? `<div style="display:flex;justify-content:space-between">
        <span style="font-size:11px;font-family:var(--font-mono);color:var(--muted)">Status</span>
        <span style="font-size:12px;font-weight:700;color:${diff < 0 && !t.done ? 'var(--accent4)' : diff === 0 ? 'var(--accent3)' : 'var(--muted)'}">
          ${t.done ? '✓ Concluída' : diff === 0 ? 'Hoje' : diff < 0 ? Math.abs(diff) + 'd atrasada' : 'em ' + diff + 'd'}
        </span>
      </div>` : ''}
    </div>`;

  document.getElementById('taskh-class-content').innerHTML = `
    <div style="display:flex;flex-direction:column;gap:10px">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <span style="font-size:11px;font-family:var(--font-mono);color:var(--muted)">Prioridade</span>
        <span style="font-size:12px;font-weight:700;padding:4px 12px;border-radius:20px;
          color:${pColor};border:1px solid ${pColor}44;background:${pColor}18">
          ${TK_PRIOR_LABEL[t.prior] || '?'}
        </span>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center">
        <span style="font-size:11px;font-family:var(--font-mono);color:var(--muted)">Categoria</span>
        <span style="font-size:12px;font-weight:700;color:var(--text)">${esc(t.cat || '?')}</span>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center">
        <span style="font-size:11px;font-family:var(--font-mono);color:var(--muted)">Cor</span>
        <div style="width:20px;height:20px;border-radius:50%;background:${color};border:2px solid rgba(255,255,255,.2)"></div>
      </div>
    </div>`;

  taskHubRenderDoneBtn(t);
  taskHubRenderTips(t);
}

function taskHubRenderSubs(t) {
  const subs = t.subtarefas || [];
  const childTasks = tkGetChildren(t.id);
  const listEl = document.getElementById('taskh-sub-list');
  const pctEl  = document.getElementById('taskh-sub-pct');
  if (!listEl) return;
  const done = subs.filter(s=>s.done).length;
  const childDone = childTasks.filter(child => child.done).length;
  const totalItems = subs.length + childTasks.length;
  const totalDone = done + childDone;
  if (pctEl) pctEl.textContent = totalItems ? `${totalDone}/${totalItems}` : '';
  listEl.innerHTML = subs.length
    ? subs.map((s,i) => `
        <div class="taskh-sub-item">
          <div class="taskh-sub-check ${s.done?'done':''}" onclick="taskHubToggleSub(${i})">
            ${s.done?'✓':''}
          </div>
          <div class="taskh-sub-text ${s.done?'done':''}">${esc(s.texto)}</div>
          <button class="taskh-sub-del" onclick="taskHubDelSub(${i})">✕</button>
        </div>`).join('')
    : '<div style="font-size:12px;color:rgba(122,117,144,.4);font-family:var(--font-mono);font-style:italic;padding:4px 0">Nenhuma subtarefa. Adicione passos menores abaixo.</div>';
}

function taskHubRenderRing(t) {
  const subs = t.subtarefas || [];
  const total = subs.length;
  const done = subs.filter(s=>s.done).length;
  const pct = total > 0 ? Math.round(done/total*100) : (t.done ? 100 : 0);
  const circum = 2 * Math.PI * 40;
  const fill = document.getElementById('taskh-ring-fill');
  const pctEl = document.getElementById('taskh-ring-pct');
  const subEl = document.getElementById('taskh-ring-sub');
  const statsEl = document.getElementById('taskh-ring-stats');
  if (pctEl) pctEl.textContent = pct + '%';
  if (subEl) subEl.textContent = total > 0 ? 'subtarefas' : (t.done ? 'concluída' : 'pendente');
  if (fill) setTimeout(() => fill.style.strokeDashoffset = circum * (1 - pct/100), 80);
  if (statsEl) statsEl.innerHTML = `
    <div class="taskh-ring-stat">
      <span class="taskh-ring-stat-lbl">Total</span>
      <span class="taskh-ring-stat-val">${total}</span>
    </div>
    <div class="taskh-ring-stat">
      <span class="taskh-ring-stat-lbl">Concluídas</span>
      <span class="taskh-ring-stat-val" style="color:var(--accent3)">${done}</span>
    </div>
    <div class="taskh-ring-stat">
      <span class="taskh-ring-stat-lbl">Pendentes</span>
      <span class="taskh-ring-stat-val" style="color:var(--accent5)">${total - done}</span>
    </div>`;
}

function taskHubRenderDoneBtn(t) {
  const btn  = document.getElementById('taskh-done-btn');
  const icon = document.getElementById('taskh-done-icon');
  const lbl  = document.getElementById('taskh-done-lbl');
  const navIcon = document.getElementById('taskh-nav-done-icon');
  const navLbl  = document.getElementById('taskh-nav-done-lbl');
  if (!btn) return;
  btn.className = 'taskh-done-btn ' + (t.done ? 'done-state' : 'pending');
  if (icon) icon.textContent = t.done ? '\u2713' : '\u25cb';
  if (lbl)  lbl.textContent  = t.done ? 'Concluída! Clique para reabrir' : 'Marcar como concluída';
  if (navIcon) navIcon.textContent = t.done ? '\u2713' : '\u25cb';
  if (navLbl)  navLbl.textContent  = t.done ? 'Reabrir' : 'Concluir';
}

function taskHubRenderTips(t) {
  const grid = document.getElementById('taskh-tips-grid');
  if (!grid) return;
  const subs = t.subtarefas || [];
  const diff = t.data ? tkDaysFromNow(t.data) : null;
  const tips = [];

  if (!t.nota) tips.push({ icon:'📝', color:'#c8a96e', badge:'Detalhe', title:'Adicione contexto', desc:'Uma boa descrição evita esquecimentos e ajuda a retomar o foco rapidamente.' });
  if (subs.length === 0) tips.push({ icon:'◈', color:'#7c6fcd', badge:'Estrutura', title:'Divida em subtarefas', desc:'Tarefas com passos menores são concluídas 2x mais rápido.' });
  if (diff !== null && diff < 0 && !t.done) tips.push({ icon:'⏰', color:'#e06b8b', badge:'Urgente', title:'Tarefa atrasada!', desc:`Esta tarefa está ${Math.abs(diff)} dia(s) atrasada. Priorize agora.` });
  if (diff !== null && diff === 0 && !t.done) tips.push({ icon:'📍', color:'#e8864a', badge:'Hoje', title:'Vence hoje!', desc:'Foco! Esta tarefa precisa ser concluída antes do fim do dia.' });
  if (t.prior === 'alta' && !t.done) tips.push({ icon:'🔥', color:'#e06b8b', badge:'Alta prio', title:'Tarefa de alta prioridade', desc:'Considere trabalhar nesta tarefa antes de qualquer outra pendente.' });
  if (subs.length > 0 && subs.every(s=>s.done) && !t.done) tips.push({ icon:'✅', color:'#5ec4a8', badge:'Quase lá!', title:'Subtarefas 100% concluídas', desc:'Todas as subtarefas foram feitas. Marque a tarefa principal como concluída!' });

  const fixed = [
    { icon:'⏳', color:'#4ab0e8', badge:'Produtividade', title:'Use a técnica Pomodoro', desc:'25 min de foco + 5 min de pausa. Ideal para tarefas complexas.' },
    { icon:'🌅', color:'#7c6fcd', badge:'Hábito', title:'Tarefas difíceis pela manhã', desc:'Sua energia e foco são maiores no início do dia.' },
    { icon:'🔕', color:'#c8a96e', badge:'Foco', title:'Silencie notificações', desc:'Interrupções reduzem produtividade em até 40%.' },
    { icon:'🎉', color:'#5ec4a8', badge:'Recompensa', title:'Celebre cada conclusão', desc:'Pequenas recompensas reforçam o hábito de completar tarefas.' },
  ];
  while (tips.length < 6) tips.push(fixed[tips.length % fixed.length]);
  const show = tips.slice(0,6);
  grid.innerHTML = show.map(tp => `
    <div class="hub-tip-card" style="--tip-color:${tp.color}">
      <div class="hub-tip-top">
        <div class="hub-tip-emoji">${tp.icon}</div>
        <div class="hub-tip-badge">${tp.badge}</div>
      </div>
      <div class="hub-tip-title">${tp.title}</div>
      <div class="hub-tip-desc">${tp.desc}</div>
    </div>`).join('');
}

function taskHubToggleDone() {
  const t = S.tasks.find(x => x.id === taskHubState.id); if (!t) return;
  t.done = !t.done;
  save(); renderTasks();
  taskHubRender(t);
}

function taskHubToggleSub(idx) {
  const t = S.tasks.find(x => x.id === taskHubState.id); if (!t) return;
  t.subtarefas[idx].done = !t.subtarefas[idx].done;
  // auto-marcar tarefa se todas as subs concluídas
  if (t.subtarefas.length && t.subtarefas.every(s=>s.done)) t.done = true;
  save(); renderTasks();
  taskHubRenderSubs(t); taskHubRenderRing(t); taskHubRenderDoneBtn(t);
}

function taskHubDelSub(idx) {
  const t = S.tasks.find(x => x.id === taskHubState.id); if (!t) return;
  t.subtarefas.splice(idx, 1);
  save(); renderTasks();
  taskHubRenderSubs(t); taskHubRenderRing(t);
}

function taskHubAddSub() {
  const inp = document.getElementById('taskh-new-sub');
  const texto = inp.value.trim(); if (!texto) return;
  const t = S.tasks.find(x => x.id === taskHubState.id); if (!t) return;
  t.subtarefas.push({ texto, done: false });
  inp.value = '';
  save(); renderTasks();
  taskHubRenderSubs(t); taskHubRenderRing(t);
}

// Drawer de edicao
function taskHubDrawerOpen() {
  const t = S.tasks.find(x => x.id === taskHubState.id); if (!t) return;
  taskHubDrawerColor = t.cor || TK_COLORS[0];
  document.getElementById('tkd-nome').value  = t.nome  || '';
  document.getElementById('tkd-nota').value  = t.nota  || '';
  document.getElementById('tkd-prior').value = t.prior || 'media';
  document.getElementById('tkd-cat').value   = t.cat   || 'Pessoal';
  document.getElementById('tkd-data').value  = t.data  || '';
  document.getElementById('tkd-tem-data-fim').checked = !!t.dataFim;
  document.getElementById('tkd-data-fim').value = t.dataFim || '';
  tkToggleEndDateFields('tkd');
  document.getElementById('tkd-hora').value  = t.hora  || '';
  document.getElementById('tkd-recorrencia').value = t.recurrence || 'none';
  document.getElementById('taskh-drawer-icon').textContent  = TK_PRIOR_COLOR[t.prior] ? ({alta:'\u25c6', media:'\u25c8', baixa:'\u2726'}[t.prior]) : '\u2726';
  document.getElementById('taskh-drawer-title').textContent = t.nome;
  tkBuildColorPicker('tkd-colors', taskHubDrawerColor, 'taskHubPickColor');
  document.getElementById('taskh-drawer').classList.add('open');
  document.getElementById('taskh-drawer-bd').classList.add('open');
  setTimeout(() => document.getElementById('tkd-nome').focus(), 160);
}

function taskHubPickColor(col) {
  taskHubDrawerColor = col;
  tkBuildColorPicker('tkd-colors', taskHubDrawerColor, 'taskHubPickColor');
}

function taskHubDrawerClose() {
  document.getElementById('taskh-drawer').classList.remove('open');
  document.getElementById('taskh-drawer-bd').classList.remove('open');
}

function taskHubDrawerSalvar() {
  const nome = document.getElementById('tkd-nome').value.trim();
  if (!nome) { document.getElementById('tkd-nome').focus(); return; }
  const idx = S.tasks.findIndex(x => x.id === taskHubState.id); if (idx < 0) return;
  S.tasks[idx] = {
    ...S.tasks[idx],
    nome,
    nota:  document.getElementById('tkd-nota').value.trim(),
    prior: document.getElementById('tkd-prior').value,
    cat:   document.getElementById('tkd-cat').value,
    data:  document.getElementById('tkd-data').value,
    hora:  document.getElementById('tkd-hora').value,
    cor:   taskHubDrawerColor,
    recurrence: document.getElementById('tkd-recorrencia').value,
  };
  save(); renderTasks();
  taskHubDrawerClose();
  taskHubRender(S.tasks[idx]);
}

function taskHubDelete() {
  const task = S.tasks.find(x => x.id === taskHubState.id);
  if (!task) return;
  tkRequestDeleteTask(task, function (mode) {
    if (mode === 'occurrence') tkDeleteRecurringOccurrence(task.id);
    else if (mode === 'series') tkDeleteTaskSeriesById(task.id);
    else if (mode === 'delete') tkDeleteTaskById(taskHubState.id);
  });
}

var tkCalPointerState = null;
taskLinkBoardState.x = 0;
taskLinkBoardState.y = 0;

function tkCalEnsureSelectionBox() {
  var wrap = document.querySelector('.tk-cal-wrap');
  if (!wrap) return null;
  var box = document.getElementById('tk-cal-select-box');
  if (!box) {
    box = document.createElement('div');
    box.id = 'tk-cal-select-box';
    box.className = 'tk-cal-select-box';
    wrap.appendChild(box);
  }
  return box;
}

function tkCalApplySelection(ids) {
  var normalizedIds = Array.from(ids || []).map(function (id) { return Number(id); });
  tkCalendarSelection.ids.clear();
  normalizedIds.forEach(function (id) { tkCalendarSelection.ids.add(id); });
  document.querySelectorAll('.tk-cal-task-card').forEach(function (card) {
    var id = Number(card.dataset.taskId);
    card.classList.toggle('selected', tkSelectionHas(id));
  });
}

function tkCalSetHoverDate(date) {
  tkCalendarSelection.hoverDate = date || null;
  document.querySelectorAll('.tk-day[data-date]').forEach(function (day) {
    day.classList.toggle('drop-target', day.dataset.date === tkCalendarSelection.hoverDate);
  });
}

function tkCalSelectByRect(rect, additiveIds) {
  var ids = new Set(additiveIds || []);
  document.querySelectorAll('.tk-cal-task-card').forEach(function (card) {
    var cardRect = card.getBoundingClientRect();
    var hit = !(cardRect.right < rect.left || cardRect.left > rect.right || cardRect.bottom < rect.top || cardRect.top > rect.bottom);
    if (hit) ids.add(Number(card.dataset.taskId));
  });
  tkCalApplySelection(ids);
}

function tkCalStartSelection(event) {
  if (event.button !== 0) return;
  var wrap = document.querySelector('.tk-cal-wrap');
  var box = tkCalEnsureSelectionBox();
  if (!wrap || !box) return;
  var rect = wrap.getBoundingClientRect();
  tkCalPointerState = {
    rect: rect,
    startX: event.clientX,
    startY: event.clientY,
    moved: false,
    additive: event.ctrlKey || event.metaKey,
    baseIds: new Set(tkCalendarSelection.ids)
  };
  tkCalendarSelection.boxActive = true;
  if (!tkCalPointerState.additive) tkClearSelection();
  box.style.display = 'block';
  box.style.left = (event.clientX - rect.left) + 'px';
  box.style.top = (event.clientY - rect.top) + 'px';
  box.style.width = '0px';
  box.style.height = '0px';
}

function tkCalMoveSelection(event) {
  if (!tkCalendarSelection.boxActive || !tkCalPointerState) return;
  var box = tkCalEnsureSelectionBox();
  if (!box) return;
  var rect = tkCalPointerState.rect;
  if (Math.abs(event.clientX - tkCalPointerState.startX) > 4 || Math.abs(event.clientY - tkCalPointerState.startY) > 4) {
    tkCalPointerState.moved = true;
  }
  var left = Math.max(0, Math.min(event.clientX, tkCalPointerState.startX) - rect.left);
  var top = Math.max(0, Math.min(event.clientY, tkCalPointerState.startY) - rect.top);
  var right = Math.min(rect.width, Math.max(event.clientX, tkCalPointerState.startX) - rect.left);
  var bottom = Math.min(rect.height, Math.max(event.clientY, tkCalPointerState.startY) - rect.top);
  box.style.left = left + 'px';
  box.style.top = top + 'px';
  box.style.width = Math.max(0, right - left) + 'px';
  box.style.height = Math.max(0, bottom - top) + 'px';
  tkCalSelectByRect(
    { left: left + rect.left, top: top + rect.top, right: right + rect.left, bottom: bottom + rect.top },
    tkCalPointerState.additive ? tkCalPointerState.baseIds : []
  );
}

function tkCalEndSelection() {
  if (tkCalPointerState && tkCalPointerState.moved) {
    tkCalendarSelection.justBoxSelected = true;
    setTimeout(function () { tkCalendarSelection.justBoxSelected = false; }, 80);
  }
  tkCalendarSelection.boxActive = false;
  tkCalPointerState = null;
  var box = document.getElementById('tk-cal-select-box');
  if (box) box.style.display = 'none';
}

function tkCalFindDayAtPoint(clientX, clientY) {
  var target = document.elementFromPoint(clientX, clientY);
  var day = target ? target.closest('.tk-day[data-date]') : null;
  if (day) return day.dataset.date;
  var week = target ? target.closest('.tk-cal-week') : null;
  if (!week) {
    var underPointer = document.elementFromPoint(clientX, clientY);
    week = underPointer ? underPointer.closest('.tk-cal-week') : null;
  }
  if (!week) return null;
  var days = week.querySelectorAll('.tk-day');
  for (var i = 0; i < days.length; i++) {
    var rect = days[i].getBoundingClientRect();
    if (clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom) {
      return days[i].dataset.date || null;
    }
  }
  return null;
}

function tkCalResetPointerDrag() {
  tkCalendarSelection.pointerCardId = null;
  tkCalendarSelection.pointerStartX = 0;
  tkCalendarSelection.pointerStartY = 0;
  tkCalendarSelection.pointerDragging = false;
  tkCalendarSelection.dragTaskId = null;
  tkCalendarSelection.dragDate = null;
  tkCalendarSelection.dragIds = [];
  tkCalendarSelection.copyOnDrag = false;
  tkCalSetHoverDate(null);
  document.body.classList.remove('tk-cal-dragging');
  if (tkCalDragGhost && tkCalDragGhost.parentNode) tkCalDragGhost.parentNode.removeChild(tkCalDragGhost);
  tkCalDragGhost = null;
}

function tkCalEnsureDragGhost() {
  if (tkCalDragGhost) return tkCalDragGhost;
  tkCalDragGhost = document.createElement('div');
  tkCalDragGhost.className = 'tk-cal-drag-ghost';
  document.body.appendChild(tkCalDragGhost);
  return tkCalDragGhost;
}

function tkCalUpdateDragGhost(clientX, clientY) {
  if (!tkCalendarSelection.pointerDragging) return;
  var ghost = tkCalEnsureDragGhost();
  var ids = tkCalendarSelection.dragIds.slice();
  var tasks = ids.map(function (id) {
    return S.tasks.find(function (item) { return item.id === Number(id); });
  }).filter(Boolean);
  if (!tasks.length) return;
  ghost.classList.toggle('copy-mode', !!tkCalendarSelection.copyOnDrag);
  ghost.innerHTML = tkCalendarSelection.copyOnDrag
    ? `<span class="tk-cal-drag-ghost-count">＋</span><span>Duplicar · ${esc(tasks[0].nome)}</span>`
    : ids.length === 1
      ? `<span class="tk-cal-drag-ghost-count">1</span><span>${esc(tasks[0].nome)}</span>`
      : `<span class="tk-cal-drag-ghost-count">${ids.length}</span><span>${esc(tasks[0].nome)}</span>`;
  ghost.style.left = (clientX + 16) + 'px';
  ghost.style.top = (clientY + 16) + 'px';
  ghost.classList.add('show');
}

function tkCalInitInteractions() {
  var wrap = document.querySelector('.tk-cal-wrap');
  if (!wrap || wrap.dataset.selectionReady === '1') return;
  wrap.dataset.selectionReady = '1';
  wrap.addEventListener('pointerdown', function (event) {
    if (event.target.closest('.tk-cal-task-card')) return;
    tkCalStartSelection(event);
  });
  document.addEventListener('pointermove', tkCalMoveSelection);
  document.addEventListener('pointerup', tkCalEndSelection);
  document.addEventListener('pointermove', tkCalHandlePointerDragMove);
  document.addEventListener('pointerup', tkCalHandlePointerDragEnd);
}

function tkCalCardPointerDown(event, id) {
  event.stopPropagation();
  event.preventDefault();
  if (tkCalendarSelection.justDragged) {
    tkCalendarSelection.justDragged = false;
    return;
  }
  if (event.altKey) {
    tkClearSelection();
    tkCalendarSelection.ids.add(id);
  } else if (event.ctrlKey || event.metaKey) {
    if (tkSelectionHas(id)) tkCalendarSelection.ids.delete(id);
    else tkCalendarSelection.ids.add(id);
  } else if (!tkSelectionHas(id)) {
    tkClearSelection();
    tkCalendarSelection.ids.add(id);
  }
  tkCalApplySelection(tkCalendarSelection.ids);
  tkCalendarSelection.pointerCardId = id;
  tkCalendarSelection.pointerStartX = event.clientX;
  tkCalendarSelection.pointerStartY = event.clientY;
  tkCalendarSelection.pointerDragging = false;
  tkCalendarSelection.dragTaskId = id;
  tkCalendarSelection.dragDate = (S.tasks.find(function (item) { return item.id === id; }) || {}).data || null;
  tkCalendarSelection.copyOnDrag = !!event.altKey;
  tkCalendarSelection.dragIds = event.altKey ? [id] : (tkSelectionHas(id) ? Array.from(tkCalendarSelection.ids) : [id]);
}

function tkCalCardActivate(event, id) {
  event.stopPropagation();
  if (tkCalendarSelection.justDragged || tkCalendarSelection.pointerDragging) return;
  if (event.ctrlKey || event.metaKey) return;
  taskHubOpen(id);
}

function tkCalHandlePointerDragMove(event) {
  if (!tkCalendarSelection.pointerCardId || tkCalendarSelection.boxActive) return;
  var dx = Math.abs(event.clientX - tkCalendarSelection.pointerStartX);
  var dy = Math.abs(event.clientY - tkCalendarSelection.pointerStartY);
  if (event.altKey) tkCalendarSelection.copyOnDrag = true;
  if (!tkCalendarSelection.pointerDragging && (dx > 6 || dy > 6)) {
    tkCalendarSelection.pointerDragging = true;
    document.body.classList.add('tk-cal-dragging');
  }
  if (!tkCalendarSelection.pointerDragging) return;
  tkCalSetHoverDate(tkCalFindDayAtPoint(event.clientX, event.clientY));
  tkCalUpdateDragGhost(event.clientX, event.clientY);
}

function tkCalHandlePointerDragEnd(event) {
  if (!tkCalendarSelection.pointerCardId) return;
  var wasDragging = tkCalendarSelection.pointerDragging;
  var sourceDate = tkCalendarSelection.dragDate;
  var sourceTaskId = tkCalendarSelection.dragTaskId;
  var ids = tkCalendarSelection.dragIds.slice();
  var copyOnDrag = !!tkCalendarSelection.copyOnDrag;
  var targetDate = tkCalFindDayAtPoint(event.clientX, event.clientY);
  tkCalResetPointerDrag();
  if (!wasDragging || !sourceDate || !targetDate || !ids.length) return;
  if (copyOnDrag) {
    tkDuplicateTaskAtDate(sourceTaskId, targetDate);
    tkClearSelection();
    tkCalendarSelection.justDragged = true;
    setTimeout(function () { tkCalendarSelection.justDragged = false; }, 100);
    return;
  }
  var delta = tkDiffDays(sourceDate, targetDate);
  if (!delta) {
    tkCalendarSelection.justDragged = true;
    setTimeout(function () { tkCalendarSelection.justDragged = false; }, 80);
    return;
  }
  tkMoveTaskSeries(ids, delta);
  tkClearSelection();
  tkCalendarSelection.justDragged = true;
  setTimeout(function () { tkCalendarSelection.justDragged = false; }, 80);
  save();
  renderTasks();
}

const renderTasksBase = renderTasks;
renderTasks = function () {
  renderTasksBase();
  tkCalInitInteractions();
  if (taskHubState.id) {
    var openTask = S.tasks.find(function (item) { return item.id === taskHubState.id; });
    if (openTask) taskHubRenderLinks(openTask);
  }
};

tkCalRender = function () {
  const titleEl = document.getElementById('tk-cal-title');
  if (titleEl) titleEl.textContent = TK_MONTHS[tkCalState.month] + ' ' + tkCalState.year;
  const year = tkCalState.year;
  const month = tkCalState.month;
  const selected = tkCalState.selected;
  const today = tkToday();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMo = new Date(year, month + 1, 0).getDate();
  const daysInPrev = new Date(year, month, 0).getDate();
  const weeksCount = Math.ceil((firstDay + daysInMo) / 7);
  const totalCells = weeksCount * 7;
  const firstVisibleDate = tkDateLocalString(new Date(year, month, 1 - firstDay));
  const lastVisibleDate = tkAddDays(firstVisibleDate, totalCells - 1);
  const byDay = {};
  const holidayMap = {};
  const weekSpans = Array.from({ length: weeksCount }, function () { return []; });
  const weekLaneOccupancy = Array.from({ length: weeksCount }, function () { return []; });

  // Tarefas que terminam depois da data de início viram barras contínuas por semana.
  const rangedTasks = S.tasks.filter(function (task) {
    return tkTaskHasDateRange(task) && task.data <= lastVisibleDate && task.dataFim >= firstVisibleDate;
  }).sort(function (a, b) {
    return a.data.localeCompare(b.data) || a.dataFim.localeCompare(b.dataFim) || String(a.nome || '').localeCompare(String(b.nome || ''));
  });

  // Tarefas de um único dia permanecem dentro da respectiva célula.
  S.tasks.forEach(function (task) {
    if (!task.data || tkTaskHasDateRange(task)) return;
    const parts = task.data.split('-').map(Number);
    if (parts[0] === year && parts[1] === month + 1) {
      if (!byDay[parts[2]]) byDay[parts[2]] = [];
      byDay[parts[2]].push(task);
    }
  });

  tkGetNationalHolidayEntries(year, month).forEach(function (holiday) {
    const day = Number(holiday.data.slice(-2));
    holidayMap[day] = holiday;
    if (!byDay[day]) byDay[day] = [];
    byDay[day].push(holiday);
  });
  getDreamCalendarEntries(year, month).forEach(function (dream) {
    const day = Number(dream.data.slice(-2));
    if (!byDay[day]) byDay[day] = [];
    byDay[day].push(dream);
  });
  getReviewCalendarEntries(year, month).forEach(function (review) {
    const day = Number(review.data.slice(-2));
    if (!byDay[day]) byDay[day] = [];
    byDay[day].push(review);
  });
  tkGetGymCalendarEntries(year, month).forEach(function (task) {
    const day = Number(task.data.slice(-2));
    if (!byDay[day]) byDay[day] = [];
    byDay[day].push(task);
  });

  // Aloca cada barra em uma faixa livre da semana para que durações sobrepostas não se sobreponham.
  rangedTasks.forEach(function (task) {
    const startOffset = tkDiffDays(firstVisibleDate, task.data);
    const endOffset = tkDiffDays(firstVisibleDate, task.dataFim);
    if (endOffset < 0 || startOffset >= totalCells) return;
    const firstWeek = Math.max(0, Math.floor(startOffset / 7));
    const lastWeek = Math.min(weeksCount - 1, Math.floor(endOffset / 7));
    for (let weekIndex = firstWeek; weekIndex <= lastWeek; weekIndex++) {
      const segmentStartOffset = Math.max(startOffset, weekIndex * 7);
      const segmentEndOffset = Math.min(endOffset, weekIndex * 7 + 6);
      const startCol = segmentStartOffset - weekIndex * 7;
      const endCol = segmentEndOffset - weekIndex * 7;
      const lanes = weekLaneOccupancy[weekIndex];
      let lane = 0;
      while (lanes[lane] && lanes[lane].some(function (range) {
        return !(endCol < range.start || startCol > range.end);
      })) lane++;
      if (!lanes[lane]) lanes[lane] = [];
      lanes[lane].push({ start: startCol, end: endCol });
      weekSpans[weekIndex].push({
        task: task,
        lane: lane,
        startCol: startCol,
        endCol: endCol,
        segmentStartDate: tkAddDays(firstVisibleDate, segmentStartOffset),
        segmentEndDate: tkAddDays(firstVisibleDate, segmentEndOffset),
        isStart: task.data >= tkAddDays(firstVisibleDate, segmentStartOffset) && task.data <= tkAddDays(firstVisibleDate, segmentEndOffset),
        isEnd: task.dataFim >= tkAddDays(firstVisibleDate, segmentStartOffset) && task.dataFim <= tkAddDays(firstVisibleDate, segmentEndOffset)
      });
    }
  });

  const grid = document.getElementById('tk-cal-days');
  if (!grid) return;
  const weekMarkup = [];
  for (let weekIndex = 0; weekIndex < weeksCount; weekIndex++) {
    const weekCells = [];
    const weekStartOffset = weekIndex * 7;
    const laneCount = weekLaneOccupancy[weekIndex].length;
    for (let colIndex = 0; colIndex < 7; colIndex++) {
      const visibleDate = tkAddDays(firstVisibleDate, weekStartOffset + colIndex);
      const dateObj = tkParseDate(visibleDate);
      const dayNumber = dateObj.getDate();
      const isCurrentMonth = dateObj.getFullYear() === year && dateObj.getMonth() === month;
      if (!isCurrentMonth) {
        weekCells.push(`<div class="tk-day other-month" style="grid-column:${colIndex + 1}"><span class="tk-day-num">${dayNumber}</span></div>`);
        continue;
      }

      const ds = visibleDate;
      const holiday = holidayMap[dayNumber] || null;
      const cls = ['tk-day', ds === today ? 'today' : '', ds === selected ? 'selected' : '', holiday ? 'holiday' : ''].filter(Boolean).join(' ');
      const miniCards = (byDay[dayNumber] || []).slice().sort(function (a, b) {
        if (!!a.isHoliday !== !!b.isHoliday) return a.isHoliday ? -1 : 1;
        if (!!a.isDream !== !!b.isDream) return a.isDream ? -1 : 1;
        if (!!a.isReview !== !!b.isReview) return a.isReview ? -1 : 1;
        if (a.done !== b.done) return a.done ? 1 : -1;
        return (a.hora || '99:99').localeCompare(b.hora || '99:99');
      }).map(function (task) {
        if (task.isHoliday) {
          return `<div class="tk-cal-task-card tk-cal-holiday-card" onclick="event.stopPropagation()" title="${task.holidayType}: ${esc(task.nome)}"><span class="tk-cal-holiday-icon">${task.icon}</span>${esc(task.nome)}</div>`;
        }
        if (task.isDream) {
          return `<div class="tk-cal-task-card tk-cal-dream-card" style="--tk-color:#7c6fcd" onclick="event.stopPropagation();tkOpenDreamDeadline('${String(task.id)}')" title="Prazo do sonho: ${esc(task.nome)}"><span class="tk-cal-dream-icon">${task.icon}</span>${esc(task.nome)}</div>`;
        }
        if (task.isReview) {
          return `<div class="tk-cal-task-card tk-cal-review-card" onclick="event.stopPropagation();tkOpenReviewPlanner()" title="Revisão agendada: ${esc(task.nome)}"><span class="tk-cal-review-icon">${task.icon}</span>${esc(task.nome)}</div>`;
        }
        const col = task.cor || TK_PRIOR_COLOR[task.prior] || '#c8a96e';
        if (task.isGym) {
          return `<div class="tk-cal-task-card ${task.done ? 'done-mini' : ''}" style="--tk-color:${col}" onclick="event.stopPropagation();tkOpenGymDay('${task.data}')" title="Treino programado">🏋️ ${esc(task.nome)}</div>`;
        }
        return `<div class="tk-cal-task-card ${task.done ? 'done-mini' : ''} ${tkSelectionHas(task.id) ? 'selected' : ''}"
            data-task-id="${task.id}" data-date="${task.data}" style="--tk-color:${col}"
            oncontextmenu="return tkQuickActionsOpen(event, ${task.id})"
            onclick="tkCalCardActivate(event, ${task.id})"
            onpointerdown="tkCalCardPointerDown(event, ${task.id})" title="${esc(task.nome)}">
          ${task.hora ? `<span style="opacity:.6;margin-right:3px">${esc(task.hora)}</span>` : ''}${esc(task.nome)}
        </div>`;
      }).join('');
      weekCells.push(`<div class="${cls}" data-date="${ds}" style="grid-column:${colIndex + 1}"
          onclick="tkCalSelectDay('${ds}')" ondblclick="tkModalOpenForDate('${ds}')"
          title="${holiday ? holiday.holidayType + ': ' + holiday.nome + ' · ' : ''}Clique para selecionar · Duplo clique para adicionar tarefa">
        <span class="tk-day-num">${dayNumber}</span>
        <div class="tk-day-tasks">${miniCards}</div>
      </div>`);
    }

    const spanMarkup = weekSpans[weekIndex].slice().sort(function (a, b) { return a.lane - b.lane || a.startCol - b.startCol; }).map(function (segment) {
      const task = segment.task;
      const col = task.cor || TK_PRIOR_COLOR[task.prior] || '#c8a96e';
      const classes = [
        'tk-cal-task-card', 'tk-cal-span-task',
        task.done ? 'done-mini' : '',
        tkSelectionHas(task.id) ? 'selected' : '',
        segment.isStart ? 'span-start' : 'span-continuation-left',
        segment.isEnd ? 'span-end' : 'span-continuation-right'
      ].filter(Boolean).join(' ');
      const titleText = task.nome || 'Tarefa';
      const shownName = segment.isStart ? titleText : '↤ ' + titleText;
      const timeLabel = segment.isStart && task.hora ? `<span class="tk-cal-span-time">${esc(task.hora)}</span>` : '';
      return `<div class="${classes}" data-task-id="${task.id}" data-span-start="${segment.segmentStartDate}"
          style="--tk-color:${col};grid-column:${segment.startCol + 1}/span ${segment.endCol - segment.startCol + 1};grid-row:${segment.lane + 1}"
          oncontextmenu="return tkQuickActionsOpen(event, ${task.id})"
          onclick="tkCalCardActivate(event, ${task.id})"
          onpointerdown="tkCalCardPointerDown(event, ${task.id})"
          title="${titleText} · ${tkFmtDate(task.data)} – ${tkFmtDate(task.dataFim)}">${timeLabel}${shownName}</div>`;
    }).join('');

    weekMarkup.push(`<div class="tk-cal-week" style="--tk-span-lanes:${laneCount}">
      ${weekCells.join('')}
      <div class="tk-cal-week-spans" style="--tk-span-lanes:${laneCount}" aria-label="Tarefas com duração de vários dias">${spanMarkup}</div>
    </div>`);
  }
  grid.innerHTML = weekMarkup.join('');
  tkCalEnsureSelectionBox();
  tkCalApplySelection(tkCalendarSelection.ids);
};

tkCalSelectDay = function (ds) {
  if (tkCalendarSelection.justBoxSelected) return;
  tkCalState.selected = ds;
  tkCalRender();
  const listEl = document.getElementById('tk-list-section') || document.querySelector('.tk-list-section');
  if (listEl) listEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

const taskHubRenderBase = taskHubRender;
taskHubRender = function (task) {
  taskHubRenderBase(task);
  const schedEl = document.getElementById('taskh-sched-content');
  const classEl = document.getElementById('taskh-class-content');
  const recurrenceLabel = TK_RECURRENCE_LABEL[task.recurrence || 'none'] || TK_RECURRENCE_LABEL.none;
  const children = tkGetChildren(task.id);
  const parent = task.parentId ? S.tasks.find(function (item) { return item.id === task.parentId; }) : null;
  if (schedEl) {
    schedEl.insertAdjacentHTML('beforeend', `
      <div style="display:flex;justify-content:space-between;margin-top:10px">
        <span style="font-size:11px;font-family:var(--font-mono);color:var(--muted)">Recorrência</span>
        <span style="font-size:12px;font-weight:700;color:var(--text)">${recurrenceLabel}</span>
      </div>`);
  }
  if (classEl) {
    classEl.insertAdjacentHTML('beforeend', `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px">
        <span style="font-size:11px;font-family:var(--font-mono);color:var(--muted)">Estrutura</span>
        <span style="font-size:12px;font-weight:700;color:var(--text)">${parent ? 'Filha de ' + esc(parent.nome) : 'Raiz'} · ${children.length} filha(s)</span>
      </div>`);
  }
  taskHubRenderLinks(task);
  taskHubRenderDoneBtn(task);
};

taskHubRenderDoneBtn = function (task) {
  const btn = document.getElementById('taskh-done-btn');
  const icon = document.getElementById('taskh-done-icon');
  const lbl = document.getElementById('taskh-done-lbl');
  const navIcon = document.getElementById('taskh-nav-done-icon');
  const navLbl = document.getElementById('taskh-nav-done-lbl');
  const blocked = !task.done && !tkCanCompleteTask(task);
  if (!btn) return;
  btn.className = 'taskh-done-btn ' + (task.done ? 'done-state' : 'pending');
  btn.disabled = blocked;
  btn.style.opacity = blocked ? '.58' : '';
  btn.title = blocked ? 'Conclua todas as tarefas filhas antes.' : '';
  if (icon) icon.textContent = task.done ? '\u2713' : '\u25cb';
  if (lbl) lbl.textContent = task.done ? 'Concluída! Clique para reabrir' : blocked ? 'Conclua as tarefas filhas primeiro' : 'Marcar como concluída';
  if (navIcon) navIcon.textContent = task.done ? '\u2713' : '\u25cb';
  if (navLbl) navLbl.textContent = task.done ? 'Reabrir' : blocked ? 'Bloqueada' : 'Concluir';
};

function taskHubRenderLinks(task) {
  const lane = document.getElementById('taskh-links-lane');
  const board = document.getElementById('taskh-links-board');
  const canvas = document.getElementById('taskh-links-canvas');
  if (!lane || !board || !canvas || !task) return;
  var parent = task.parentId ? S.tasks.find(function (item) { return item.id === task.parentId; }) : null;
  var child = tkGetChildren(task.id)[0] || null;
  lane.innerHTML = `
    ${parent ? `<button class="taskh-link-node parent" type="button" onclick="taskHubOpen(${parent.id})">
      <span class="taskh-link-role">Tarefa mãe</span>
      <span class="taskh-link-title">${esc(parent.nome)}</span>
    </button>` : `<div class="taskh-link-empty">Sem tarefa mãe</div>`}
    <div class="taskh-link-connector"></div>
    <div class="taskh-link-node current">
      <span class="taskh-link-role">Tarefa atual</span>
      <span class="taskh-link-title">${esc(task.nome)}</span>
    </div>
    <div class="taskh-link-connector"></div>
    ${child ? `<button class="taskh-link-node child" type="button" onclick="taskHubOpen(${child.id})">
      <span class="taskh-link-role">Tarefa filha</span>
      <span class="taskh-link-title">${esc(child.nome)}</span>
    </button>` : `<div class="taskh-link-empty">Sem tarefa filha</div>`}
  `;
  requestAnimationFrame(function () {
    taskLinkBoardState.x = Math.max(18, Math.round((canvas.clientWidth - (board.offsetWidth * taskLinkBoardState.scale)) / 2));
    taskLinkBoardState.y = Math.max(18, Math.round((canvas.clientHeight - (board.offsetHeight * taskLinkBoardState.scale)) / 2));
    taskHubApplyBoardTransform();
  });
}

function taskHubApplyBoardTransform() {
  const board = document.getElementById('taskh-links-board');
  const readout = document.getElementById('taskh-links-zoom-readout');
  if (!board) return;
  board.style.transform = `translate(${taskLinkBoardState.x}px, ${taskLinkBoardState.y}px) scale(${taskLinkBoardState.scale})`;
  if (readout) readout.textContent = Math.round(taskLinkBoardState.scale * 100) + '%';
}

function taskHubClampBoardPosition() {
  const canvas = document.getElementById('taskh-links-canvas');
  const board = document.getElementById('taskh-links-board');
  if (!canvas || !board) return;
  const maxX = Math.max(18, canvas.clientWidth - (board.offsetWidth * taskLinkBoardState.scale) - 18);
  const maxY = Math.max(18, canvas.clientHeight - (board.offsetHeight * taskLinkBoardState.scale) - 18);
  taskLinkBoardState.x = Math.max(18, Math.min(maxX, taskLinkBoardState.x));
  taskLinkBoardState.y = Math.max(18, Math.min(maxY, taskLinkBoardState.y));
  taskHubApplyBoardTransform();
}

function taskHubSetZoom(nextScale) {
  const clamped = Math.max(0.7, Math.min(1.8, Number(nextScale.toFixed(2))));
  taskLinkBoardState.scale = clamped;
  taskHubClampBoardPosition();
}

function taskHubZoomIn() {
  taskHubSetZoom(taskLinkBoardState.scale + 0.1);
}

function taskHubZoomOut() {
  taskHubSetZoom(taskLinkBoardState.scale - 0.1);
}

function taskHubLinksWheel(event) {
  event.preventDefault();
  taskHubSetZoom(taskLinkBoardState.scale + (event.deltaY < 0 ? 0.08 : -0.08));
}

function taskHubCanLink(kind, current, candidate) {
  if (!current || !candidate || current.id === candidate.id) return false;
  if (kind === 'parent') {
    if (tkWouldCreateCycle(current.id, candidate.id)) return false;
    return true;
  }
  if (candidate.id === current.parentId) return false;
  if (tkWouldCreateCycle(candidate.id, current.id)) return false;
  return true;
}

function taskHubLinkTasks(kind, candidateId) {
  const current = S.tasks.find(function (item) { return item.id === taskHubState.id; });
  const candidate = S.tasks.find(function (item) { return item.id === Number(candidateId); });
  if (!current || !candidate || !taskHubCanLink(kind, current, candidate)) return;
  if (kind === 'parent') {
    current.parentId = candidate.id;
  } else {
    candidate.parentId = current.id;
  }
  save();
  renderTasks();
  taskHubLinkPickerClose();
  taskHubRender(current);
}

function taskHubLinkPickerRender() {
  const list = document.getElementById('taskh-link-picker-list');
  const search = document.getElementById('taskh-link-picker-search');
  const current = S.tasks.find(function (item) { return item.id === taskHubState.id; });
  if (!list || !current || !taskLinkPickerState.kind) return;
  var query = search ? search.value.trim().toLowerCase() : '';
  var items = S.tasks.filter(function (item) {
    if (!taskHubCanLink(taskLinkPickerState.kind, current, item)) return false;
    if (!query) return true;
    return (item.nome || '').toLowerCase().indexOf(query) >= 0;
  }).sort(function (a, b) {
    return (a.nome || '').localeCompare(b.nome || '');
  });
  list.innerHTML = items.length ? items.map(function (item) {
    return `<button class="taskh-link-picker-item" type="button" onclick="taskHubLinkTasks('${taskLinkPickerState.kind}', ${item.id})">
      <span class="taskh-link-picker-item-main">
        <span class="taskh-link-picker-item-title">${esc(item.nome)}</span>
        <span class="taskh-link-picker-item-meta">${esc(item.cat || 'Sem categoria')} · ${item.data ? tkFmtDate(item.data) : 'Sem data'}</span>
      </span>
      <span class="taskh-link-picker-item-meta">${item.done ? 'Concluída' : 'Pendente'}</span>
    </button>`;
  }).join('') : '<div class="taskh-link-empty">Nenhuma tarefa encontrada.</div>';
}

function taskHubLinkPickerOpen(kind) {
  const current = S.tasks.find(function (item) { return item.id === taskHubState.id; });
  const title = document.getElementById('taskh-link-picker-title');
  const sub = document.getElementById('taskh-link-picker-sub');
  const bd = document.getElementById('taskh-link-picker-bd');
  const search = document.getElementById('taskh-link-picker-search');
  if (!current || !bd) return;
  taskLinkPickerState.kind = kind;
  taskLinkPickerState.open = true;
  if (title) title.textContent = kind === 'parent' ? 'Selecionar tarefa mãe' : 'Selecionar tarefa filha';
  if (sub) sub.textContent = kind === 'parent'
    ? 'Escolha uma tarefa existente para ser a tarefa mãe da atual.'
    : 'Escolha uma tarefa existente para ser a tarefa filha da atual.';
  if (search) search.value = '';
  bd.classList.add('open');
  taskHubLinkPickerRender();
  if (search) setTimeout(function () { search.focus(); }, 60);
}

function taskHubLinkPickerClose(event) {
  if (event && event.target && event.target.id !== 'taskh-link-picker-bd') return;
  const bd = document.getElementById('taskh-link-picker-bd');
  if (bd) bd.classList.remove('open');
  taskLinkPickerState.kind = null;
  taskLinkPickerState.open = false;
}

function taskHubLinkPickerCreateNew() {
  const current = S.tasks.find(function (item) { return item.id === taskHubState.id; });
  if (!current || !taskLinkPickerState.kind) return;
  taskLinkPendingCreate = taskLinkPickerState.kind;
  taskHubLinkPickerClose();
  tkModalOpenForDate(current.data || tkToday());
}

function taskHubLinksPointerDown(event) {
  if (event.button !== 0) return;
  if (event.target.closest('.taskh-link-add') || event.target.closest('button.taskh-link-node')) return;
  const board = document.getElementById('taskh-links-board');
  if (!board) return;
  taskLinkBoardState.dragging = true;
  taskLinkBoardState.startX = event.clientX - taskLinkBoardState.x;
  taskLinkBoardState.startY = event.clientY - taskLinkBoardState.y;
  board.classList.add('dragging');
}

document.addEventListener('pointermove', function (event) {
  if (!taskLinkBoardState.dragging) return;
  const canvas = document.getElementById('taskh-links-canvas');
  const board = document.getElementById('taskh-links-board');
  if (!canvas || !board) return;
  const maxX = Math.max(18, canvas.clientWidth - (board.offsetWidth * taskLinkBoardState.scale) - 18);
  const maxY = Math.max(18, canvas.clientHeight - (board.offsetHeight * taskLinkBoardState.scale) - 18);
  taskLinkBoardState.x = Math.max(18, Math.min(maxX, event.clientX - taskLinkBoardState.startX));
  taskLinkBoardState.y = Math.max(18, Math.min(maxY, event.clientY - taskLinkBoardState.startY));
  taskHubApplyBoardTransform();
});

document.addEventListener('pointerup', function () {
  if (!taskLinkBoardState.dragging) return;
  taskLinkBoardState.dragging = false;
  const board = document.getElementById('taskh-links-board');
  if (board) board.classList.remove('dragging');
});

function taskHubCreateLinkedTask(kind) {
  taskHubLinkPickerOpen(kind);
}

tkQuickToggle = function (id) {
  const task = S.tasks.find(function (item) { return item.id === id; });
  if (!task) return;
  if (!task.done && !tkCanCompleteTask(task)) {
    alert('Conclua todas as tarefas filhas antes de finalizar a tarefa mãe.');
    return;
  }
  task.done = !task.done;
  save();
  renderTasks();
  if (taskHubState.id === id) taskHubRender(task);
};

taskHubToggleDone = function () {
  const task = S.tasks.find(function (item) { return item.id === taskHubState.id; });
  if (!task) return;
  if (!task.done && !tkCanCompleteTask(task)) {
    alert('Conclua todas as tarefas filhas antes de finalizar a tarefa mãe.');
    return;
  }
  task.done = !task.done;
  save();
  renderTasks();
  taskHubRender(task);
};

taskHubToggleSub = function (idx) {
  const task = S.tasks.find(function (item) { return item.id === taskHubState.id; });
  if (!task) return;
  task.subtarefas[idx].done = !task.subtarefas[idx].done;
  if (task.subtarefas.length && task.subtarefas.every(function (sub) { return sub.done; }) && tkCanCompleteTask(task)) {
    task.done = true;
  } else if (!task.subtarefas[idx].done) {
    task.done = false;
  }
  save();
  renderTasks();
  taskHubRender(task);
};

taskHubRenderSubs = function (task) {
  const subs = task.subtarefas || [];
  const childTasks = tkGetChildren(task.id);
  const listEl = document.getElementById('taskh-sub-list');
  const pctEl = document.getElementById('taskh-sub-pct');
  if (!listEl) return;
  const done = subs.filter(function (sub) { return sub.done; }).length;
  const childDone = childTasks.filter(function (child) { return child.done; }).length;
  const totalItems = subs.length + childTasks.length;
  const totalDone = done + childDone;
  if (pctEl) pctEl.textContent = totalItems ? `${totalDone}/${totalItems}` : '';
  const subMarkup = subs.map(function (sub, index) {
    return `
      <div class="taskh-sub-item">
        <div class="taskh-sub-check ${sub.done ? 'done' : ''}" onclick="taskHubToggleSub(${index})">
          ${sub.done ? '\u2713' : ''}
        </div>
        <div class="taskh-sub-text ${sub.done ? 'done' : ''}">${esc(sub.texto)}</div>
        <button class="taskh-sub-del" onclick="taskHubDelSub(${index})">\u2715</button>
      </div>`;
  }).join('');
  const childMarkup = childTasks.map(function (child) {
    return `
      <button class="taskh-sub-item taskh-sub-item-linked" type="button" onclick="taskHubOpen(${child.id})">
        <div class="taskh-sub-check ${child.done ? 'done' : ''}">
          ${child.done ? '\u2713' : '\u2192'}
        </div>
        <div class="taskh-sub-text ${child.done ? 'done' : ''}">
          ${esc(child.nome)}
          <span class="taskh-sub-linked-meta">Tarefa filha</span>
        </div>
        <span class="taskh-sub-open">Abrir</span>
      </button>`;
  }).join('');
  listEl.innerHTML = (subMarkup || childMarkup)
    ? subMarkup + childMarkup
    : '<div style="font-size:12px;color:rgba(122,117,144,.4);font-family:var(--font-mono);font-style:italic;padding:4px 0">Nenhuma subtarefa. Adicione passos menores abaixo.</div>';
};

tkModalSave = function () {
  const nome = document.getElementById('tkm-nome').value.trim();
  if (!nome) { document.getElementById('tkm-nome').focus(); return; }
  const selectedDate = document.getElementById('tkm-data').value;
  tkModalSetDate(selectedDate);
  const endDate = tkReadEndDate('tkm', selectedDate);
  if (endDate === null) return;
  const task = {
    id: Date.now(),
    nome: nome,
    nota: document.getElementById('tkm-nota').value.trim(),
    prior: document.getElementById('tkm-prior').value,
    cat: document.getElementById('tkm-cat').value,
    hora: document.getElementById('tkm-hora').value,
    recurrence: document.getElementById('tkm-recorrencia').value,
    data: selectedDate,
    dataFim: endDate,
    cor: tkModalColor,
    done: false,
    subtarefas: [],
    parentId: null,
    isRecurringClone: false,
    recurrenceMasterId: null,
    recurrenceIndex: 0,
    recurrenceSeedDate: selectedDate,
    recurrenceExceptions: []
  };
  task.recurrenceMasterId = task.id;
  if (taskLinkPendingCreate === 'child') task.parentId = taskHubState.id;
  S.tasks.push(task);
  if (taskLinkPendingCreate === 'parent') {
    var current = S.tasks.find(function (item) { return item.id === taskHubState.id; });
    if (current) current.parentId = task.id;
  }
  tkSyncRecurringSeries(task.id);
  taskLinkPendingCreate = null;
  save();
  renderTasks();
  tkModalClose();
};

taskHubDrawerSalvar = function () {
  const nome = document.getElementById('tkd-nome').value.trim();
  if (!nome) { document.getElementById('tkd-nome').focus(); return; }
  const idx = S.tasks.findIndex(function (item) { return item.id === taskHubState.id; });
  if (idx < 0) return;
  const startDate = document.getElementById('tkd-data').value;
  const endDate = tkReadEndDate('tkd', startDate);
  if (endDate === null) return;
  const savedTask = tkApplyRecurringEdits(taskHubState.id, {
    nome: nome,
    nota: document.getElementById('tkd-nota').value.trim(),
    prior: document.getElementById('tkd-prior').value,
    cat: document.getElementById('tkd-cat').value,
    data: startDate,
    dataFim: endDate,
    hora: document.getElementById('tkd-hora').value,
    cor: taskHubDrawerColor,
    recurrence: document.getElementById('tkd-recorrencia').value
  });
  save();
  renderTasks();
  taskHubDrawerClose();
  taskHubRender(savedTask || S.tasks[idx]);
};

taskHubDelete = function () {
  const task = S.tasks.find(function (item) { return item.id === taskHubState.id; });
  if (!task) return;
  tkRequestDeleteTask(task, function (mode) {
    if (mode === 'occurrence') tkDeleteRecurringOccurrence(task.id);
    else if (mode === 'series') tkDeleteTaskSeriesById(task.id);
    else if (mode === 'delete') tkDeleteTaskById(taskHubState.id);
  });
};


load();
renderTasks();
document.addEventListener('click', function (event) {
  if (!event.target.closest('#tk-quick-actions')) tkQuickActionsClose();
});
document.addEventListener('scroll', tkQuickActionsClose, true);
window.addEventListener('keydown', function (event) {
  if (event.key === 'Escape') {
    tkDeletePopupClose();
    tkQuickActionsClose();
  }
});
window.addEventListener('resize', tkRenderList);
window.addEventListener('resize', tkQuickActionsClose);
window.addEventListener('resize', taskHubClampBoardPosition);
window.addEventListener('pageshow', function (event) {
  if (!event.persisted) return;
  load();
  renderTasks();
});


