// Livraria, Cinema e Mangás: funções idênticas nas três páginas (antes repetidas dentro de
// cada HTML). Carregado antes do script da página, que tem as constantes, as funções próprias
// de cada tracker e a inicialização. Só declarações de função: nada roda ao carregar.

function syncAppShellLibraryState() {
  if (!window.SoterStorage || typeof window.SoterStorage.getState !== 'function') return;
  try {
    const appState = window.SoterStorage.getState();
    if (!appState.data || typeof appState.data !== 'object') appState.data = {};
    appState.data.trackerLivraria = Array.isArray(S.livros) ? S.livros : [];
    appState.data.trackerCinema = Array.isArray(S.cinema) ? S.cinema : [];
    appState.data.trackerMangas = Array.isArray(S.mangas) ? S.mangas : [];
    appState.data.libraryHub = {
      quotes: Array.isArray(HUB_STATE.quotes) ? HUB_STATE.quotes : [],
      activeQuoteId: HUB_STATE.activeQuoteId || '',
      goals: {
        livros: +HUB_STATE.goals.livros || 24,
        cinema: +HUB_STATE.goals.cinema || 24,
        mangas: +HUB_STATE.goals.mangas || 24
      }
    };
    syncAbandonNotificationsToHeader(appState);
    window.SoterStorage.save(appState);
    window.dispatchEvent(new CustomEvent('soter:notifications-changed'));
  } catch (e) {}
}

function save() {
  syncAppShellLibraryState();
}

function load() {
  try {
    if (window.SoterStorage && typeof window.SoterStorage.getState === 'function') {
      const appState = window.SoterStorage.getState();
      const data = appState && appState.data ? appState.data : {};
      const hasCanonical = Array.isArray(data.trackerLivraria) || Array.isArray(data.trackerCinema) || Array.isArray(data.trackerMangas);
      if (hasCanonical) {
        S.livros = Array.isArray(data.trackerLivraria) ? data.trackerLivraria : [];
        S.cinema = Array.isArray(data.trackerCinema) ? data.trackerCinema : [];
        S.mangas = Array.isArray(data.trackerMangas) ? data.trackerMangas : [];
        return;
      }
    }
    S.livros = [];
    S.cinema = [];
    S.mangas = [];
  } catch(e){}
}

function saveHubState() {
  syncAppShellLibraryState();
}

function loadHubState() {
  try {
    if (window.SoterStorage && typeof window.SoterStorage.getState === 'function') {
      const appState = window.SoterStorage.getState();
      const hub = appState && appState.data && appState.data.libraryHub && typeof appState.data.libraryHub === 'object'
        ? appState.data.libraryHub
        : null;
      if (hub) {
        if (Array.isArray(hub.quotes) && hub.quotes.length) HUB_STATE.quotes = hub.quotes;
        if (typeof hub.activeQuoteId === 'string') HUB_STATE.activeQuoteId = hub.activeQuoteId;
        if (hub.goals && typeof hub.goals === 'object') {
          HUB_STATE.goals.livros = +hub.goals.livros || HUB_STATE.goals.livros;
          HUB_STATE.goals.cinema = +hub.goals.cinema || HUB_STATE.goals.cinema;
          HUB_STATE.goals.mangas = +hub.goals.mangas || HUB_STATE.goals.mangas;
        }
        return;
      }
    }
  } catch (e) {}
}

function reloadLibraryFromScopedState() {
  loadHubState();
  load();
  if (!HUB_STATE.quotes.length) {
    HUB_STATE.quotes = [{ id: 'q1', text: 'Ler é sonhar pela mão de outrem.', author: 'Fernando Pessoa' }];
    HUB_STATE.activeQuoteId = 'q1';
  }
  if (!HUB_STATE.activeQuoteId || !HUB_STATE.quotes.some(q => q.id === HUB_STATE.activeQuoteId)) {
    HUB_STATE.activeQuoteId = HUB_STATE.quotes[0].id;
  }
  renderSharedQuotePanels();
  renderTracker('livros');
  renderTracker('cinema');
  renderTracker('mangas');
}

function fmtDate(ts) {
  return ts ? new Date(ts).toLocaleDateString('pt-BR', { day:'2-digit', month:'short', year:'numeric' }) : 'Sem data';
}

function progressValueByTracker(tracker, item) {
  const pct = TRACKER_CFG[tracker].progressFn(item);
  if (pct !== null && !Number.isNaN(pct)) return Math.max(0, pct);
  return item.status === 'concluido' ? 100 : 0;
}

function progressSnapshotValue(tracker, item) {
  if (tracker === 'livros') return +item.atual || 0;
  if (tracker === 'mangas') return +item.capAtual || 0;
  if (tracker === 'cinema' && item.tipo === 'Série') return +item.episodioAtual || +item.temporadaAtual || 0;
  return item.status === 'concluido' ? 1 : 0;
}

function progressSnapshotLabel(tracker, item, value) {
  if (tracker === 'livros') return `Página ${value}`;
  if (tracker === 'mangas') return `Capítulo ${value}`;
  if (tracker === 'cinema' && item.tipo === 'Série') return `Episódio ${value}`;
  return value > 0 ? 'Concluído' : 'Sem progresso';
}

function ensureProgressHistory(item) {
  if (!Array.isArray(item.progressHistory)) item.progressHistory = [];
  item.progressHistory = item.progressHistory.slice(0, 24);
}

function pushProgressHistory(tracker, item, at = Date.now()) {
  ensureProgressHistory(item);
  const value = progressSnapshotValue(tracker, item);
  const last = item.progressHistory[0];
  if (last && last.value === value) return;
  item.progressHistory.unshift({ at, value, pct: progressValueByTracker(tracker, item), label: progressSnapshotLabel(tracker, item, value) });
  item.progressHistory = item.progressHistory.slice(0, 18);
}

function ensureTimeline(item) {
  if (!Array.isArray(item.timeline)) item.timeline = [];
  item.timeline = item.timeline.slice(0, 24);
}

function pushTimeline(item, label, at = Date.now(), tone = 'default') {
  ensureTimeline(item);
  item.timeline.unshift({ at, label, tone });
  item.timeline = item.timeline.slice(0, 18);
}

function getTimelineRows(item) {
  const rows = Array.isArray(item.timeline) ? item.timeline.slice() : [];
  if (item.createdAt) rows.push({ at:item.createdAt, label:'Adicionado ao tracker', tone:'default' });
  if (item.finishedAt) rows.push({ at:item.finishedAt, label:'Marcado como concluído', tone:'done' });
  const seen = new Set();
  return rows.filter(r => {
    const key = `${r.label}|${r.at}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((a,b)=>b.at-a.at).slice(0,8);
}

function getItemLastTouch(item) {
  const stamps = [+item.updatedAt || 0, +item.createdAt || 0, +item.finishedAt || 0];
  if (Array.isArray(item.timeline)) item.timeline.forEach(row => stamps.push(+row.at || 0));
  if (Array.isArray(item.progressHistory)) item.progressHistory.forEach(row => stamps.push(+row.at || 0));
  return Math.max.apply(null, stamps.concat(0));
}

function formatElapsedDays(days) {
  if (days <= 0) return 'hoje';
  if (days === 1) return '1 dia';
  return `${days} dias`;
}

function getAbandonState(tracker, item) {
  const lastTouch = getItemLastTouch(item);
  const days = lastTouch ? Math.max(0, Math.floor((Date.now() - lastTouch) / 86400000)) : 0;
  const isActive = !!(ABANDON_ACTIVE_STATUSES[tracker] && ABANDON_ACTIVE_STATUSES[tracker].has(item.status));
  if (!isActive) {
    return {
      active: false,
      key: 'off',
      label: 'Fora da regra',
      days,
      daysText: 'Monitoramento inativo',
      summary: 'Esse status não entra no ante-abandono.',
      detail: lastTouch ? `Última atualização em ${fmtDate(lastTouch)}.` : 'Sem histórico de atualização ainda.',
      lastTouch,
      notify: false
    };
  }
  let key = 'fresh';
  let label = 'Seguro';
  let detail = 'Ritmo saudável por enquanto.';
  if (days >= ABANDON_RULES.critical) {
    key = 'critical';
    label = 'Crítico';
    detail = 'Entrou no alerta do header por muito tempo sem avanço.';
  } else if (days >= ABANDON_RULES.risk) {
    key = 'risk';
    label = 'Risco';
    detail = 'Pede retomada para não virar abandono.';
  } else if (days >= ABANDON_RULES.watch) {
    key = 'watch';
    label = 'Atenção';
    detail = 'Começa a pedir revisão de ritmo.';
  }
  return {
    active: true,
    key,
    label,
    days,
    daysText: `Sem atualização há ${formatElapsedDays(days)}.`,
    summary: `Atualizado há ${formatElapsedDays(days)}.`,
    detail: lastTouch ? `${detail} Última atualização em ${fmtDate(lastTouch)}.` : detail,
    lastTouch,
    notify: days >= ABANDON_RULES.watch
  };
}

function buildAbandonNotification(tracker, item, state) {
  return {
    id: `${ABANDON_NOTIF_PREFIX}${tracker}-${item.id}`,
    text: `${ABANDON_TRACKER_LABELS[tracker]}: "${item.titulo}" está há ${state.days} dias sem atualização.`
  };
}

function syncAbandonNotificationsToHeader(appState) {
  if (!appState || typeof appState !== 'object') return appState;
  if (!appState.data || typeof appState.data !== 'object') appState.data = {};
  const current = Array.isArray(appState.data.notifications) ? appState.data.notifications : [];
  const foreign = current.filter(n => !String((n && n.id) || '').startsWith(ABANDON_NOTIF_PREFIX));
  const generated = [];
  ['livros', 'cinema', 'mangas'].forEach(tracker => {
    (S[tracker] || []).forEach(item => {
      const state = getAbandonState(tracker, item);
      if (state.notify) generated.push({ ...buildAbandonNotification(tracker, item, state), days: state.days });
    });
  });
  generated.sort((a, b) => b.days - a.days || String(a.text).localeCompare(String(b.text), 'pt-BR'));
  appState.data.notifications = foreign.concat(generated.map(({ days, ...rest }) => rest));
  return appState;
}

function renderHubAbandonment(tracker, item) {
  const card = document.getElementById('th-abandon-card');
  const badge = document.getElementById('th-abandon-badge');
  const days = document.getElementById('th-abandon-days');
  const summary = document.getElementById('th-abandon-text');
  const detail = document.getElementById('th-abandon-sub');
  if (!card || !badge || !days || !summary || !detail) return;
  const state = getAbandonState(tracker, item);
  card.className = `hub-section hub-abandon-card is-${state.key}`;
  badge.textContent = state.label;
  days.textContent = state.daysText;
  summary.textContent = state.summary;
  detail.textContent = state.detail;
}

function getBaseTitle(title) {
  return normalizeTitle(title)
    .replace(/\b(?:part|parte|vol\.?|volume|livro|book|tomo|temporada|season|cap\.?|capitulo|capítulo|episodio|episódio|ep)\s*[ivxlcdm\d]+\b.*$/i,'')
    .replace(/\b[ivxlcdm\d]+\b$/i,'')
    .trim();
}

function getActiveQuote() {
  if (!HUB_STATE.quotes.length) return { text: 'Sem citação cadastrada.', author: 'Sol de Sóter' };
  const found = HUB_STATE.quotes.find(q => q.id === HUB_STATE.activeQuoteId);
  return found || HUB_STATE.quotes[0];
}

function renderSharedQuotePanels() {
  const quote = getActiveQuote();
  document.querySelectorAll('[data-quote-panel]').forEach(panel => {
    const textEl = panel.querySelector('.quote-text');
    const authorEl = panel.querySelector('.quote-author');
    if (textEl) textEl.textContent = '"' + (quote.text || '') + '"';
    if (authorEl) authorEl.textContent = '- ' + (quote.author || 'Autor desconhecido');
  });
}

// ─── NAV ─────────────────────────────────────────────────────────────────
function goTo(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-' + id).classList.add('active');
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  const tab = document.getElementById('tab-' + id);
  if (tab) tab.classList.add('active');
}

function toggleMobileNav() {
  const nav = document.getElementById('mobile-nav');
  const overlay = document.getElementById('overlay');
  const btn = document.getElementById('hamburger-btn');
  const open = nav.classList.toggle('open');
  overlay.classList.toggle('open', open);
  btn.textContent = open ? '✕' : '☰';
}

function closeMobileNav() {
  document.getElementById('mobile-nav').classList.remove('open');
  document.getElementById('overlay').classList.remove('open');
  document.getElementById('hamburger-btn').textContent = '☰';
}

function updateGoalDisplay(prefix, done, target) {
  const doneEl = document.getElementById(prefix + '-goal-done');
  const targetEl = document.getElementById(prefix + '-goal-target');
  const fillEl = document.getElementById(prefix + '-goal-fill');
  const pctEl = document.getElementById(prefix + '-goal-pct');
  const yearEl = document.getElementById(prefix + '-goal-year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();
  if (!doneEl || !targetEl || !fillEl || !pctEl) return;
  const safeTarget = Math.max(1, +target || 1);
  const safeDone = Math.max(0, +done || 0);
  const pct = Math.min(100, Math.round((safeDone / safeTarget) * 100));
  doneEl.textContent = String(safeDone);
  targetEl.textContent = String(safeTarget);
  fillEl.style.width = pct + '%';
  pctEl.textContent = pct + '% concluído';
}

function openQuoteModal() {
  currentQuoteId = getActiveQuote().id || (HUB_STATE.quotes[0] && HUB_STATE.quotes[0].id) || null;
  renderQuoteModalList();
  fillQuoteEditor();
  document.getElementById('quote-hub').classList.add('open');
}

function closeQuoteModal() { document.getElementById('quote-hub').classList.remove('open'); }

function closeQuoteHubOutside(event) { if (event.target.id === 'quote-hub') closeQuoteModal(); }

function renderQuoteModalList() {
  const list = document.getElementById('quote-list');
  if (!list) return;
  list.innerHTML = HUB_STATE.quotes.map(q => `
    <button type="button" class="quote-item ${q.id===currentQuoteId?'active':''}" onclick="selectQuote(${escJs(q.id)})">
      <div class="quote-item-text">"${esc(q.text||'')}"</div>
      <div class="quote-item-author">- ${esc(q.author||'Autor desconhecido')}</div>
    </button>
  `).join('');
}

function fillQuoteEditor() {
  const quote = HUB_STATE.quotes.find(q => q.id === currentQuoteId) || HUB_STATE.quotes[0];
  if (!quote) return;
  currentQuoteId = quote.id;
  const textEl = document.getElementById('quote-text-input');
  const authorEl = document.getElementById('quote-author-input');
  if (textEl) textEl.value = quote.text || '';
  if (authorEl) authorEl.value = quote.author || '';
  renderQuoteModalList();
}

function selectQuote(id) { currentQuoteId = id; fillQuoteEditor(); }

function addNewQuote() {
  currentQuoteId = 'q' + Date.now();
  const textEl = document.getElementById('quote-text-input');
  const authorEl = document.getElementById('quote-author-input');
  if (textEl) textEl.value = '';
  if (authorEl) authorEl.value = '';
  renderQuoteModalList();
}

function saveQuoteDraft() {
  const text = (document.getElementById('quote-text-input') || { value: '' }).value.trim();
  const author = (document.getElementById('quote-author-input') || { value: '' }).value.trim();
  if (!text) return;
  const quote = { id: currentQuoteId || ('q' + Date.now()), text, author: author || 'Autor desconhecido' };
  const idx = HUB_STATE.quotes.findIndex(q => q.id === quote.id);
  if (idx >= 0) HUB_STATE.quotes[idx] = quote;
  else HUB_STATE.quotes.unshift(quote);
  HUB_STATE.activeQuoteId = quote.id;
  currentQuoteId = quote.id;
  saveHubState();
  renderQuoteModalList();
  renderSharedQuotePanels();
}

function deleteCurrentQuote() {
  if (!currentQuoteId || HUB_STATE.quotes.length <= 1) return;
  HUB_STATE.quotes = HUB_STATE.quotes.filter(q => q.id !== currentQuoteId);
  HUB_STATE.activeQuoteId = HUB_STATE.quotes[0].id;
  currentQuoteId = HUB_STATE.activeQuoteId;
  saveHubState();
  renderQuoteModalList();
  fillQuoteEditor();
  renderSharedQuotePanels();
}

function openGoalHub(tracker) {
  currentGoalHubTracker = tracker;
  renderGoalHub(tracker);
  document.getElementById('goal-hub').classList.add('open');
}

function closeGoalHub() { document.getElementById('goal-hub').classList.remove('open'); }

function closeGoalHubOutside(event) { if (event.target.id === 'goal-hub') closeGoalHub(); }

function saveHubGoalTarget() {
  const inp = document.getElementById('hub-goal-target-input');
  const val = Math.max(1, +((inp && inp.value) || 0) || 1);
  HUB_STATE.goals[currentGoalHubTracker] = val;
  saveHubState();
  renderTracker(currentGoalHubTracker);
  renderGoalHub(currentGoalHubTracker);
}

function getYearDailyCounts(items, year) {
  const out = {};
  items.forEach(item => {
    const ts = +item.finishedAt || +item.updatedAt || +item.createdAt || 0;
    if (!ts) return;
    const dt = new Date(ts);
    if (dt.getFullYear() !== year) return;
    const key = SoterUtils.localDateKey(dt);
    out[key] = (out[key] || 0) + 1;
  });
  return out;
}

function renderHeatmap(containerId, dailyCounts, year) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const jan1 = new Date(year, 0, 1);
  const dec31 = new Date(year, 11, 31);
  const totalDays = Math.floor((dec31 - jan1) / 86400000) + 1;
  const cells = [];
  for (let i = 0; i < totalDays; i += 1) {
    const d = new Date(year, 0, 1 + i);
    const key = SoterUtils.localDateKey(d);
    const v = dailyCounts[key] || 0;
    const cls = v >= 5 ? 'lv4' : v >= 3 ? 'lv3' : v >= 2 ? 'lv2' : v >= 1 ? 'lv1' : '';
    cells.push(`<div class="hub-day ${cls}" title="${key}: ${v}"></div>`);
  }
  const startOffset = jan1.getDay();
  let html = '';
  for (let w = 0; w < 53; w += 1) {
    html += '<div class="hub-week">';
    for (let d = 0; d < 7; d += 1) {
      const idx = (w * 7 + d) - startOffset;
      html += idx >= 0 && idx < cells.length ? cells[idx] : '<div class="hub-day"></div>';
    }
    html += '</div>';
  }
  container.innerHTML = html;
}

function renderHubBars(containerId, rows) {
  const wrap = document.getElementById(containerId);
  if (!wrap) return;
  if (!rows.length) {
    wrap.innerHTML = '<div class="s">Sem dados suficientes ainda.</div>';
    return;
  }
  const max = rows[0].count || 1;
  wrap.innerHTML = rows.slice(0, 5).map(row => {
    const pct = Math.max(8, Math.round((row.count / max) * 100));
    return `<div class="hub-bar"><div>${esc(row.label)}</div><div class="hub-bar-track"><div class="hub-bar-fill" style="width:${pct}%"></div></div><div>${row.count}</div></div>`;
  }).join('');
}

function renderGoalRecommendation(tracker) {
  const el = document.getElementById('hub-recommendation');
  if (!el) return;
  const items = (S[tracker] || []).filter(item => item.status !== 'concluido');
  const rec = items.sort((a,b) => progressValueByTracker(tracker, b) - progressValueByTracker(tracker, a) || (+b.nota||0) - (+a.nota||0))[0];
  if (!rec) {
    el.innerHTML = '<div class="tracker-count">Nada pendente por aqui.</div>';
    return;
  }
  const meta = [rec.autor, rec.genero, TRACKER_CFG[tracker].statusLabels[rec.status] || rec.status].filter(Boolean).join(' • ');
  el.innerHTML = `<div style="display:grid;gap:8px"><div style="font-size:16px;font-weight:700">${esc(rec.titulo)}</div><div class="tracker-count">${esc(meta || 'Sem metadados')}</div><div style="font-size:12px;color:var(--text)">Maior potencial agora por progresso e prioridade atual.</div><button class="btn btn-primary" type="button" onclick="openModal('${tracker}',${escJs(rec.id)})">Abrir item</button></div>`;
}

// ─── MODAL UI HELPERS ─────────────────────────────────────────────────────
function updateModalHero() {
  const t = (document.getElementById('m-titulo')||{value:''}).value;
  const el = document.getElementById('modal-hero-title');
  const pretitleEl = document.getElementById('modal-pretitle');
  if (el) el.textContent = t;
  if (pretitleEl) pretitleEl.textContent = t;
}

function updateModalHeroImage(src) {
  const el = document.getElementById('modal-hero-blur');
  if (!el) return;
  const safeSrc = window.SoterUtils.safeUrl(src);
  el.style.backgroundImage = safeSrc ? `url(${JSON.stringify(safeSrc)})` : '';
  el.style.opacity = safeSrc ? '1' : '0';
}

function updateModalStatusPill() {
  if (!modalTracker) return;
  const cfg = TRACKER_CFG[modalTracker];
  const sel = document.getElementById('m-status');
  const pill = document.getElementById('modal-status-pill');
  const row  = document.getElementById('modal-status-row');
  if (!sel||!pill||!row) return;
  const color = cfg.statusColors[sel.value]||'#7a7590';
  pill.textContent = cfg.statusLabels[sel.value]||sel.value;
  pill.style.color = color;
  pill.style.borderColor = color+'44';
  pill.style.background  = color+'18';
  row.style.display = 'flex';
}

function getAutoStatusForItem(tracker, item, fallbackStatus = 'quero') {
  const stickyStatuses = new Set(['pausado','abandonado','relendo','reassistindo']);
  if (stickyStatuses.has(fallbackStatus)) return fallbackStatus;
  if (tracker === 'livros') {
    const total = +item.paginas || 0;
    const atual = +item.atual || 0;
    if (atual <= 0) return 'quero';
    if (total > 0 && atual >= total) return 'concluido';
    return 'lendo';
  }
  if (tracker === 'mangas') {
    const total = +item.capTotal || 0;
    const atual = +item.capAtual || 0;
    if (atual <= 0) return 'quero';
    if (total > 0 && atual >= total) return 'concluido';
    return 'lendo';
  }
  if (tracker === 'cinema') {
    const tipo = item.tipo || 'Filme';
    if (tipo === 'Série') {
      const epTotal = +item.episodioTotal || 0;
      const epAtual = +item.episodioAtual || 0;
      const tempTotal = +item.temporadaTotal || 0;
      const tempAtual = +item.temporadaAtual || 0;
      if (epTotal > 0) {
        if (epAtual <= 0) return 'quero';
        if (epAtual >= epTotal) return 'concluido';
        return 'assistindo';
      }
      if (tempTotal > 0) {
        if (tempAtual <= 0) return 'quero';
        if (tempAtual >= tempTotal) return 'concluido';
        return 'assistindo';
      }
      return 'quero';
    }
    return fallbackStatus === 'concluido' ? 'concluido' : 'quero';
  }
  return fallbackStatus;
}

function applyAutoStatusToModal() {
  if (!modalTracker) return;
  const statusEl = document.getElementById('m-status');
  if (!statusEl) return;
  const draft = {
    paginas: +((document.getElementById('m-paginas') || { value: 0 }).value || 0),
    atual: +((document.getElementById('m-atual-pag') || { value: 0 }).value || 0),
    capTotal: +((document.getElementById('m-cap-total') || { value: 0 }).value || 0),
    capAtual: +((document.getElementById('m-cap-atual') || { value: 0 }).value || 0),
    tipo: (document.getElementById('m-tipo-cinema') || { value: 'Filme' }).value,
    episodioTotal: +((document.getElementById('m-ep-total') || { value: 0 }).value || 0),
    episodioAtual: +((document.getElementById('m-ep-atual') || { value: 0 }).value || 0),
    temporadaTotal: +((document.getElementById('m-temp-total') || { value: 0 }).value || 0),
    temporadaAtual: +((document.getElementById('m-temp-atual') || { value: 0 }).value || 0),
  };
  const auto = getAutoStatusForItem(modalTracker, draft, statusEl.value);
  statusEl.value = auto;
  updateModalStatusPill();
}

function updateModalProgress() {
  // Livros
  const pags = +(document.getElementById('m-paginas')||{value:0}).value||0;
  const atual= +(document.getElementById('m-atual-pag')||{value:0}).value||0;
  const wrap=document.getElementById('modal-progress-wrap'), fill=document.getElementById('modal-progress-fill'), pct=document.getElementById('modal-progress-pct');
  if (wrap&&fill&&pct) { if(pags>0){const p=Math.min(100,Math.round(atual/pags*100));wrap.style.display='';fill.style.width=p+'%';pct.textContent=p+'% · pág. '+atual+'/'+pags;}else{wrap.style.display='none';} }
  // Mangás
  const capT=+(document.getElementById('m-cap-total')||{value:0}).value||0;
  const capA=+(document.getElementById('m-cap-atual')||{value:0}).value||0;
  const wM=document.getElementById('modal-progress-wrap-mg'),fM=document.getElementById('modal-progress-fill-mg'),pM=document.getElementById('modal-progress-pct-mg');
  if(wM&&fM&&pM){if(capT>0){const p=Math.min(100,Math.round(capA/capT*100));wM.style.display='';fM.style.width=p+'%';pM.textContent=p+'% · cap. '+capA+'/'+capT;}else{wM.style.display='none';}}
  // Cinema (Séries)
  const tipo = (document.getElementById('m-tipo-cinema')||{value:''}).value;
  const tempA=+(document.getElementById('m-temp-atual')||{value:0}).value||0;
  const tempT=+(document.getElementById('m-temp-total')||{value:0}).value||0;
  const epA=+(document.getElementById('m-ep-atual')||{value:0}).value||0;
  const epT=+(document.getElementById('m-ep-total')||{value:0}).value||0;
  const wC=document.getElementById('modal-progress-wrap-ci'),fC=document.getElementById('modal-progress-fill-ci'),pC=document.getElementById('modal-progress-pct-ci');
  if(wC&&fC&&pC){
    if(modalTracker==='cinema' && tipo==='Série' && (epT>0 || tempT>0)){
      const p = epT>0 ? Math.min(100,Math.round(epA/epT*100)) : Math.min(100,Math.round(tempA/tempT*100));
      wC.style.display='';
      fC.style.width=p+'%';
      if(epT>0){ pC.textContent=p+'% · EP '+epA+'/'+epT; }
      else { pC.textContent=p+'% · T '+tempA+'/'+tempT; }
    }else{
      wC.style.display='none';
    }
  }
  applyAutoStatusToModal();
}

function updateCinemaTypeFields() {
  const wrap = document.getElementById('m-cinema-serie-extra');
  const tipo = document.getElementById('m-tipo-cinema');
  if (!wrap || !tipo) return;
  const showSerie = modalTracker === 'cinema' && tipo.value === 'Série';
  wrap.style.display = showSerie ? '' : 'none';
  updateModalProgress();
}

function updateFavToggle(cb) {
  const icon = cb.nextElementSibling;
  if (icon) icon.textContent = cb.checked ? '❤️' : '🤍';
}

function closeModal() { document.getElementById('tracker-modal').classList.remove('open'); }

function closeModalOutside(e) { if(e.target.id==='tracker-modal') closeModal(); }

// ─── IMAGE UPLOAD ─────────────────────────────────────────────────────────
function handleImgUpload(e) {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const maxW=300, maxH=450; let w=img.width, h=img.height;
      if(w/h>maxW/maxH){w=maxW;h=Math.round(img.height*maxW/img.width);}else{h=maxH;w=Math.round(img.width*maxH/img.height);}
      canvas.width=w; canvas.height=h; canvas.getContext('2d').drawImage(img,0,0,w,h);
      modalImgData = canvas.toDataURL('image/jpeg', 0.82);
      document.getElementById('modal-preview').src = modalImgData;
      document.getElementById('img-zone').classList.add('has-img');
      updateModalHeroImage(modalImgData);
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
}

function applyImgUrl() {
  const input = document.getElementById('m-img-url');
  if (!input) return;
  const raw = input.value.trim();
  if (!raw) return;
  const url = window.SoterUtils.safeUrl(raw);
  if (!url) { alert('URL de imagem inválida. Use um endereço http:// ou https://.'); return; }
  modalImgData = url;
  document.getElementById('modal-preview').src = url;
  document.getElementById('img-zone').classList.add('has-img');
  updateModalHeroImage(url);
}

// ─── STARS ────────────────────────────────────────────────────────────────
function setModalStar(n) {
  modalStarVal = n;
  document.querySelectorAll('.mstar').forEach(b => b.classList.toggle('on', +b.dataset.v <= n));
  const labels = ['','★ Fraco','★★ Regular','★★★ Bom','★★★★ Ótimo','★★★★★ Incrível!'];
  document.getElementById('modal-star-label').textContent = labels[n]||'Sem nota';
}

function resetModalStars() {
  modalStarVal = 0;
  document.querySelectorAll('.mstar').forEach(b => b.classList.remove('on'));
  document.getElementById('modal-star-label').textContent = 'Sem nota';
}

function modalDeleteItem() {
  if (!modalTracker || modalEditId === null || modalEditId === undefined) return;
  if (!confirm('Excluir este item?')) return;
  S[modalTracker] = S[modalTracker].filter(x=>x.id!==modalEditId);
  save(); renderTracker(modalTracker); closeModal();
}

function thOpen(tracker, itemId) {
  thTracker = tracker;
  thItemId  = itemId;
  const item = (S[tracker] || []).find(x => x.id === itemId);
  if (!item) return;
  const cfg  = TRACKER_CFG[tracker];
  const hub = document.getElementById('tracker-hub');
  hub.scrollTop = 0;
  hub.classList.add('open');
  document.body.style.overflow = 'hidden';
  const header = document.querySelector('.site-header');
  if (header) header.style.zIndex = '1';
  thRender(item, cfg);
}

function thClose() {
  document.getElementById('tracker-hub').classList.remove('open');
  document.body.style.overflow = '';
  const header = document.querySelector('.site-header');
  if (header) header.style.zIndex = '';
  thTracker = null; thItemId = null;
}

function renderHubTimeline(item) {
  const el = document.getElementById('th-timeline');
  if (!el) return;
  const rows = getTimelineRows(item);
  el.innerHTML = rows.length
    ? rows.map(row => `<div class="hub-timeline-row"><div class="hub-timeline-dot"></div><div class="hub-timeline-label">${esc(row.label)}</div><div class="hub-timeline-date">${fmtDate(row.at)}</div></div>`).join('')
    : '<div class="th-obs-empty">Sem eventos registrados.</div>';
}

function renderHubHistory(tracker, item) {
  const el = document.getElementById('th-history');
  if (!el) return;
  const rows = Array.isArray(item.progressHistory) ? item.progressHistory.slice(0, 6) : [];
  el.innerHTML = rows.length
    ? rows.map(row => `<div class="hub-history-row"><div class="hub-history-dot"></div><div class="hub-history-label">${esc(row.label)}</div><div class="hub-history-value">${row.pct ?? 0}%</div><div class="hub-history-date">${fmtDate(row.at)}</div></div>`).join('')
    : '<div class="th-obs-empty">Sem histórico suficiente ainda.</div>';
}

function thDrawerClose() {
  document.getElementById('th-drawer').classList.remove('open');
  document.getElementById('th-drawer-bd').classList.remove('open');
}

function thDrawerHandleImg(e) {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    const img = new Image();
    img.onload = () => {
      const MAX = 900;
      const scale = Math.min(1, MAX / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      thImgData = canvas.toDataURL('image/jpeg', 0.82);
      document.getElementById('th-cover-img').src = thImgData;
      document.getElementById('th-cover-zone').classList.add('hci');
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
}

function thDrawerRemoveImg() {
  thImgData = '';
  document.getElementById('th-cover-img').src = '';
  document.getElementById('th-cover-zone').classList.remove('hci');
  document.getElementById('th-img-input').value = '';
}

function thSetStar(n) {
  thStarVal = thStarVal === n ? 0 : n;
  thUpdateStars(thStarVal);
}

function thUpdateStars(n) {
  document.querySelectorAll('#th-stars-edit .th-star').forEach((el, i) => el.classList.toggle('on', i < n));
}

function thDeleteItem() {
  if (!thTracker || !thItemId) return;
  const item = (S[thTracker]||[]).find(x=>x.id===thItemId);
  const nome = item ? item.titulo : 'este item';
  if (!confirm('Excluir "' + nome + '"? Esta ação não pode ser desfeita.')) return;
  S[thTracker] = S[thTracker].filter(x => x.id !== thItemId);
  save();
  renderTracker(thTracker);
  thDrawerClose();
  thClose();
}

function getItemByTrackerId(tracker, itemId) {
  return (S[tracker] || []).find(item => item.id === itemId) || null;
}

function getQuickActionPrimaryLabel(tracker, item) {
  if (tracker === 'livros') return 'Atualizar leitura';
  if (tracker === 'mangas') return 'Atualizar capítulos';
  if (tracker === 'cinema' && item && item.tipo === 'Série') return 'Atualizar progresso';
  return 'Editar item';
}

function closeTrackerQuickActions() {
  document.getElementById('tracker-quick-actions')?.classList.remove('open');
  quickActionState = null;
}

function openTrackerQuickActions(event, tracker, itemId) {
  event.preventDefault();
  event.stopPropagation();
  const item = getItemByTrackerId(tracker, itemId);
  const menu = document.getElementById('tracker-quick-actions');
  const title = document.getElementById('quick-actions-title');
  const list = document.getElementById('quick-actions-list');
  if (!item || !menu || !title || !list) return false;
  quickActionState = { tracker, itemId };
  title.textContent = item.titulo || 'Item';
  list.innerHTML = [
    `<button type="button" class="quick-action-btn" onclick="quickActionOpenEditor()">${getQuickActionPrimaryLabel(tracker, item)}</button>`,
    `<button type="button" class="quick-action-btn" onclick="quickActionEditItem()">Editar</button>`,
    `<button type="button" class="quick-action-btn" onclick="quickActionToggleFavorite()">${item.fav ? 'Remover dos favoritos' : 'Favoritar'}</button>`,
    `<button type="button" class="quick-action-btn" onclick="quickActionMarkDone()">Concluir</button>`,
    `<button type="button" class="quick-action-btn danger" onclick="quickActionDeleteItem()">Excluir</button>`
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

function quickActionEditItem() {
  if (!quickActionState) return;
  const { tracker, itemId } = quickActionState;
  closeTrackerQuickActions();
  thOpen(tracker, itemId);
  thDrawerOpen();
}

function quickActionToggleFavorite() {
  if (!quickActionState) return;
  const { tracker, itemId } = quickActionState;
  const item = getItemByTrackerId(tracker, itemId);
  if (!item) return;
  item.fav = !item.fav;
  pushTimeline(item, item.fav ? 'Adicionado aos favoritos' : 'Removido dos favoritos', Date.now(), item.fav ? 'fav' : 'default');
  save();
  renderTracker(tracker);
  if (thTracker === tracker && thItemId === itemId) thRender(item, TRACKER_CFG[tracker]);
  closeTrackerQuickActions();
}

function quickActionMarkDone() {
  if (!quickActionState) return;
  const { tracker, itemId } = quickActionState;
  const item = getItemByTrackerId(tracker, itemId);
  if (!item) return;
  const now = Date.now();
  if (tracker === 'livros' && (+item.paginas || 0) > 0) item.atual = +item.paginas || 0;
  if (tracker === 'mangas' && (+item.capTotal || 0) > 0) item.capAtual = +item.capTotal || 0;
  if (tracker === 'cinema' && item.tipo === 'Série') {
    if ((+item.temporadaTotal || 0) > 0) item.temporadaAtual = +item.temporadaTotal || 0;
    if ((+item.episodioTotal || 0) > 0) item.episodioAtual = +item.episodioTotal || 0;
  }
  item.status = 'concluido';
  item.finishedAt = item.finishedAt || now;
  item.updatedAt = now;
  pushTimeline(item, 'Marcado como concluído', now, 'done');
  pushProgressHistory(tracker, item, now);
  save();
  renderTracker(tracker);
  if (thTracker === tracker && thItemId === itemId) thRender(item, TRACKER_CFG[tracker]);
  closeTrackerQuickActions();
}

function quickActionDeleteItem() {
  if (!quickActionState) return;
  const { tracker, itemId } = quickActionState;
  const item = getItemByTrackerId(tracker, itemId);
  if (!item) return;
  if (!confirm('Excluir "' + item.titulo + '"?')) return;
  S[tracker] = (S[tracker] || []).filter(entry => entry.id !== itemId);
  save();
  renderTracker(tracker);
  if (thTracker === tracker && thItemId === itemId) {
    thDrawerClose();
    thClose();
  }
  closeTrackerQuickActions();
}

function getCollectionVisibleItems(group) {
  const items = group.items || [];
  if (!items.length) return [];
  const state = COLLECTION_STACK_STATE[group.id];
  const start = (((state && state.index) || 0) % items.length + items.length) % items.length;
  const count = Math.min(3, items.length);
  return Array.from({ length: count }, (_, offset) => items[(start + offset) % items.length]).filter(Boolean);
}

function cycleCollection(event, tracker, groupId, direction) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }
  const groups = getCollectionGroups(tracker, S[tracker] || []);
  const group = groups.find(g => g.id === groupId);
  if (!group || !group.items.length) return;
  const current = (COLLECTION_STACK_STATE[groupId] && COLLECTION_STACK_STATE[groupId].index) || 0;
  const next = (current + direction + group.items.length) % group.items.length;
  COLLECTION_STACK_STATE[groupId] = { index: next, dir: direction > 0 ? 'next' : 'prev', stamp: Date.now() };
  renderTracker(tracker);
}

function wheelCollection(event, tracker, groupId) {
  const direction = event.deltaY > 0 ? 1 : -1;
  cycleCollection(event, tracker, groupId, direction);
}

function getQuickTabsConfig(key) {
  if (key === 'cinema') {
    return [
      { id: 'all', label: 'Todos' },
      { id: 'collections', label: 'Coleções' },
      { id: 'fav', label: 'Favoritos' },
      { id: 'reading', label: 'Assistindo' },
      { id: 'want', label: 'Quero ver' },
      { id: 'done', label: 'Assistidos' },
      { id: 'genres', label: 'Gêneros' },
    ];
  }
  if (key === 'mangas') {
    return [
      { id: 'all', label: 'Todos' },
      { id: 'collections', label: 'Coleções' },
      { id: 'fav', label: 'Favoritos' },
      { id: 'reading', label: 'Lendo' },
      { id: 'want', label: 'Quero ler' },
      { id: 'done', label: 'Lido' },
      { id: 'genres', label: 'Gêneros' },
    ];
  }
  return [
    { id: 'all', label: 'Todos' },
    { id: 'collections', label: 'Coleções' },
    { id: 'fav', label: 'Favoritos' },
    { id: 'reading', label: 'A ler' },
    { id: 'want', label: 'Quero ler' },
    { id: 'done', label: 'Lido' },
    { id: 'genres', label: 'Gêneros' },
  ];
}

function getReadingStatusByTracker(key) { return key === 'cinema' ? 'assistindo' : 'lendo'; }

function splitGenres(raw) {
  return String(raw || '')
    .split(/[;,/|]/)
    .map(s => s.trim())
    .filter(Boolean);
}

function getTrackerGenres(key) {
  const set = new Set();
  (S[key] || []).forEach(item => splitGenres(item.genero).forEach(g => set.add(g)));
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

function setQuickTab(key, tab) {
  QUICK_VIEW[key].tab = tab;
  if (tab !== 'genres') QUICK_VIEW[key].genre = 'all';
  renderTracker(key);
}

function setQuickGenre(key, genre) {
  QUICK_VIEW[key].tab = 'genres';
  QUICK_VIEW[key].genre = genre;
  renderTracker(key);
}

function renderQuickControls(key) {
  const pfx = PFX_MAP[key];
  const tabsEl = document.getElementById(pfx + '-quick-tabs');
  const stripEl = document.getElementById(pfx + '-genre-strip');
  const chipsEl = document.getElementById(pfx + '-genre-chips');
  if (!tabsEl || !stripEl || !chipsEl) return;
  const state = QUICK_VIEW[key];
  const tabs = getQuickTabsConfig(key);
  tabsEl.innerHTML = tabs.map(t => `<button type="button" class="quick-tab ${state.tab===t.id?'active':''}" onclick="setQuickTab('${key}','${t.id}')">${t.label}</button>`).join('');
  const genres = getTrackerGenres(key);
  const showGenres = state.tab === 'genres';
  stripEl.classList.toggle('open', showGenres);
  if (!showGenres) return;
  const allActive = state.genre === 'all';
  chipsEl.innerHTML = [
    `<button type="button" class="filter-chip genre-chip ${allActive?'active':''}" onclick="setQuickGenre('${key}','all')">Todos</button>`,
    ...genres.map(g => `<button type="button" class="filter-chip genre-chip ${state.genre===g?'active':''}" onclick="setQuickGenre('${key}',${escJs(g)})">${esc(g)}</button>`)
  ].join('');
}

function applyQuickView(key, items) {
  const state = QUICK_VIEW[key];
  if (!state) return items;
  let out = items;
  if (state.tab === 'fav') out = out.filter(i => !!i.fav);
  else if (state.tab === 'reading') out = out.filter(i => i.status === getReadingStatusByTracker(key));
  else if (state.tab === 'want') out = out.filter(i => i.status === 'quero');
  else if (state.tab === 'done') out = out.filter(i => i.status === 'concluido');
  else if (state.tab === 'genres' && state.genre !== 'all') out = out.filter(i => splitGenres(i.genero).includes(state.genre));
  return out;
}

function toggleFilterPanel(key) {
  const pfx = PFX_MAP[key];
  const panel = document.getElementById(pfx+'-filter-panel');
  const btn   = document.getElementById(pfx+'-filter-btn');
  const isOpen = panel.classList.toggle('open');
  btn.classList.toggle('open', isOpen);
  if (isOpen) {
    const close = (e) => {
      const wrap = document.getElementById(pfx+'-filter-wrap');
      if (!wrap.contains(e.target)) { panel.classList.remove('open'); btn.classList.remove('open'); document.removeEventListener('click', close); }
    };
    setTimeout(()=>document.addEventListener('click', close), 0);
  }
}

function toggleFilterChip(key, chip) {
  const f = chip.dataset.filter, v = chip.dataset.val;
  FILTER_PENDING[key] = {};
  // sync all chips into PENDING
  const pfx = PFX_MAP[key];
  if (f === 'sort') {
    document.querySelectorAll(`#${pfx}-filter-panel .filter-chip[data-filter="sort"]`).forEach(c => c.classList.remove('selected'));
    chip.classList.add('selected');
  }
  document.querySelectorAll(`#${pfx}-filter-panel .filter-chip`).forEach(c => {
    if (c === chip && f !== 'sort') c.classList.toggle('selected');
    if (c.classList.contains('selected')) {
      const ff=c.dataset.filter, vv=c.dataset.val;
      if (!FILTER_PENDING[key][ff]) FILTER_PENDING[key][ff] = [];
      FILTER_PENDING[key][ff].push(vv);
    }
  });
}

function applyFilters(key) {
  FILTER_APPLIED[key] = JSON.parse(JSON.stringify(FILTER_PENDING[key]));
  const count = Object.values(FILTER_APPLIED[key]).flat().length;
  const pfx = PFX_MAP[key];
  const btn = document.getElementById(pfx+'-filter-btn');
  const badge = document.getElementById(pfx+'-filter-badge');
  btn.classList.toggle('active', count>0);
  if(badge) badge.textContent = count;
  document.getElementById(pfx+'-filter-panel').classList.remove('open');
  btn.classList.remove('open');
  renderTracker(key);
}

function clearFilters(key) {
  FILTER_PENDING[key] = {}; FILTER_APPLIED[key] = {};
  const pfx = PFX_MAP[key];
  document.querySelectorAll(`#${pfx}-filter-panel .filter-chip`).forEach(c=>c.classList.remove('selected'));
  const btn = document.getElementById(pfx+'-filter-btn');
  btn.classList.remove('active','open');
  const badge = document.getElementById(pfx+'-filter-badge');
  if (badge) badge.textContent = '0';
  document.getElementById(pfx+'-filter-panel').classList.remove('open');
  renderTracker(key);
}

function applyFilterLogic(key, items) {
  const af = FILTER_APPLIED[key]; if (!Object.keys(af).length) return items;
  return items.filter(item => {
    if (af.status?.length && !af.status.includes(item.status)) return false;
    if (af.nota?.length   && item.nota < +af.nota[0]) return false;
    if (af.fav?.length    && !item.fav) return false;
    if (af.comImg?.length && !item.img) return false;
    if (af.tipo?.length   && !af.tipo.includes(item.tipo)) return false;
    return true;
  });
}

function applySortLogic(key, items) {
  const af = FILTER_APPLIED[key];
  const sort = af.sort && af.sort[0];
  if (!sort) return items;
  const arr = items.slice();
  const progressOf = (item) => {
    const p = TRACKER_CFG[key].progressFn(item);
    return (p === null || Number.isNaN(p)) ? -1 : p;
  };
  const pagesOf = (item) => {
    if (key === 'livros') return +item.paginas || 0;
    if (key === 'mangas') return +item.capTotal || 0;
    if (key === 'cinema') return +item.episodioTotal || 0;
    return 0;
  };
  const createdOf = (item) => +item.createdAt || +item.id || 0;
  const finishedOf = (item) => +item.finishedAt || 0;
  const durationOf = (item) => {
    if (item.finishedAt && item.createdAt) return Math.max(0, (+item.finishedAt) - (+item.createdAt));
    return 0;
  };
  const cmpStr = (a, b) => (a || '').localeCompare((b || ''), 'pt-BR');
  switch (sort) {
    case 'recent': arr.sort((a,b) => createdOf(b) - createdOf(a)); break;
    case 'title_az': arr.sort((a,b) => cmpStr(a.titulo, b.titulo)); break;
    case 'title_za': arr.sort((a,b) => cmpStr(b.titulo, a.titulo)); break;
    case 'author_az': arr.sort((a,b) => cmpStr(a.autor, b.autor)); break;
    case 'pages_asc': arr.sort((a,b) => pagesOf(a) - pagesOf(b)); break;
    case 'pages_desc': arr.sort((a,b) => pagesOf(b) - pagesOf(a)); break;
    case 'progress_desc': arr.sort((a,b) => progressOf(b) - progressOf(a)); break;
    case 'start_recent': arr.sort((a,b) => createdOf(b) - createdOf(a)); break;
    case 'start_old': arr.sort((a,b) => createdOf(a) - createdOf(b)); break;
    case 'end_recent': arr.sort((a,b) => finishedOf(b) - finishedOf(a)); break;
    case 'rating_desc': arr.sort((a,b) => (+b.nota||0) - (+a.nota||0)); break;
    case 'read_duration': arr.sort((a,b) => durationOf(b) - durationOf(a)); break;
    case 'mangas_first':
      arr.sort((a,b) => {
        const aM = ((a.genero || '').toLowerCase().includes('mangá') || (a.genero || '').toLowerCase().includes('manga')) ? 1 : 0;
        const bM = ((b.genero || '').toLowerCase().includes('mangá') || (b.genero || '').toLowerCase().includes('manga')) ? 1 : 0;
        if (aM !== bM) return bM - aM;
        return cmpStr(a.titulo, b.titulo);
      });
      break;
    default: break;
  }
  return arr;
}

// ─── RENDER TRACKER ───────────────────────────────────────────────────────
function renderTracker(key) {
  let changed = false;
  S[key].forEach(item => {
    const next = getAutoStatusForItem(key, item, item.status);
    if (item.status !== next) {
      item.status = next;
      changed = true;
    }
  });
  if (changed) save();

  const cfg = TRACKER_CFG[key];
  renderQuickControls(key);
  const searchIds = { livros:'lv-search', cinema:'ci-search', mangas:'mg-search' };
  const sq = (document.getElementById(searchIds[key])||{value:''}).value.toLowerCase();
  let items = S[key].filter(x => !sq || x.titulo.toLowerCase().includes(sq) || (x.autor||'').toLowerCase().includes(sq) || (x.genero||'').toLowerCase().includes(sq));
  items = applyFilterLogic(key, items);
  const isCollectionTab = QUICK_VIEW[key]?.tab === 'collections';
  if (!isCollectionTab) items = applyQuickView(key, items);
  items = applySortLogic(key, items);

  // Stats
  if (key==='livros') {
    document.getElementById('lv-total').textContent = S.livros.length;
    document.getElementById('lv-lendo').textContent = S.livros.filter(x=>x.status==='lendo').length;
    const done = S.livros.filter(x=>x.status==='concluido').length;
    document.getElementById('lv-done').textContent  = done;
    document.getElementById('lv-fav').textContent   = S.livros.filter(x=>x.fav).length;
    updateGoalDisplay('lv', done, TRACKER_GOALS.livros);
    const lbl=document.getElementById('lv-count-label'); if(lbl) lbl.textContent=`${items.length} ${items.length===1?'livro':'livros'}${sq?' encontrados':''}`;
  }
  if (key==='cinema') {
    document.getElementById('ci-total').textContent = S.cinema.length;
    document.getElementById('ci-watch').textContent = S.cinema.filter(x=>x.status==='assistindo').length;
    const done = S.cinema.filter(x=>x.status==='concluido').length;
    document.getElementById('ci-done').textContent  = done;
    document.getElementById('ci-fav').textContent   = S.cinema.filter(x=>x.fav).length;
    updateGoalDisplay('ci', done, TRACKER_GOALS.cinema);
    const lbl=document.getElementById('ci-count-label'); if(lbl) lbl.textContent=`${items.length} ${items.length===1?'título':'títulos'}${sq?' encontrados':''}`;
  }
  if (key==='mangas') {
    document.getElementById('mg-total').textContent = S.mangas.length;
    document.getElementById('mg-lendo').textContent = S.mangas.filter(x=>x.status==='lendo').length;
    const done = S.mangas.filter(x=>x.status==='concluido').length;
    document.getElementById('mg-done').textContent  = done;
    document.getElementById('mg-fav').textContent   = S.mangas.filter(x=>x.fav).length;
    updateGoalDisplay('mg', done, TRACKER_GOALS.mangas);
    const lbl=document.getElementById('mg-count-label'); if(lbl) lbl.textContent=`${items.length} ${items.length===1?'mangá':'mangás'}${sq?' encontrados':''}`;
  }

  const totalPages = Math.max(1, Math.ceil(items.length/PER_PAGE));
  if (!TRACKER_PAGES[key]) TRACKER_PAGES[key]=1;
  if (TRACKER_PAGES[key]>totalPages) TRACKER_PAGES[key]=totalPages;
  const curPage = TRACKER_PAGES[key];

  const tabsEl = document.getElementById(key+'-tabs');
  const gridEl = document.getElementById(key+'-grid');
  if (isCollectionTab) {
    const groups = getCollectionGroups(key, items);
    const countEl = document.getElementById(PFX_MAP[key] + '-count-label');
    if (countEl) countEl.textContent = `${groups.length} ${groups.length === 1 ? 'coleção' : 'coleções'}`;
    const collectionPages = Math.max(1, Math.ceil(groups.length / 12));
    if (TRACKER_PAGES[key] > collectionPages) TRACKER_PAGES[key] = collectionPages;
    tabsEl.innerHTML = collectionPages<=1 ? '' : Array.from({length:collectionPages},(_,i)=>`<button class="ttab ${TRACKER_PAGES[key]===i+1?'active':''}" onclick="goTrackerPage('${key}',${i+1})">Página ${i+1}</button>`).join('');
    if (!groups.length) { gridEl.className = 'collection-grid'; gridEl.innerHTML=`<div class="empty" style="grid-column:span 4"><div class="empty-icon">${cfg.icon}</div>Nenhuma coleção formada ainda.</div>`; return; }
    gridEl.className = 'collection-grid';
    gridEl.innerHTML = groups.slice((TRACKER_PAGES[key]-1)*12, TRACKER_PAGES[key]*12).map(group => buildCollectionCard(key, group)).join('');
    return;
  }
  tabsEl.innerHTML = totalPages<=1 ? '' : Array.from({length:totalPages},(_,i)=>{
    const start=i*PER_PAGE+1, end=Math.min((i+1)*PER_PAGE,items.length);
    return `<button class="ttab ${curPage===i+1?'active':''}" onclick="goTrackerPage('${key}',${i+1})">Página ${i+1} <span style="font-size:9px;opacity:.6">(${start}–${end})</span></button>`;
  }).join('');
  const pageItems = items.slice((curPage-1)*PER_PAGE, curPage*PER_PAGE);
  gridEl.className = 'tracker-grid';
  if (!items.length) { gridEl.innerHTML=`<div class="empty" style="grid-column:span 5"><div class="empty-icon">${cfg.icon}</div>${sq?'Nenhum resultado para "'+esc(sq)+'"':cfg.emptyMsg}</div>`; return; }
  gridEl.innerHTML = pageItems.map(item => buildCard(item, cfg)).join('');
}

function goTrackerPage(key, page) { TRACKER_PAGES[key]=page; renderTracker(key); }

// ─── RELATED ITEMS ────────────────────────────────────────────────────────
function normalizeTitle(t) {
  return (t || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s*\([^)]*\)\s*$/g, ' ')
    .replace(/[:\-–_#.,]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function romanToInt(token) {
  const map = { i: 1, v: 5, x: 10, l: 50, c: 100 };
  const value = (token || '').toLowerCase();
  if (!/^[ivxlc]+$/.test(value)) return NaN;
  let total = 0;
  let prev = 0;
  for (let i = value.length - 1; i >= 0; i -= 1) {
    const curr = map[value[i]] || 0;
    total += curr < prev ? -curr : curr;
    prev = curr;
  }
  return total;
}

function parseOrdinalToken(token) {
  if (!token) return NaN;
  const clean = String(token).toLowerCase().replace(/[º°ª.]/g, '').trim();
  if (/^\d+$/.test(clean)) return Number(clean);
  return romanToInt(clean);
}

function extractContinuationIndex(title) {
  const normalized = normalizeTitle(title);
  if (!normalized) return NaN;
  const tagged = normalized.match(/\b(?:part|parte|vol|volume|livro|book|tomo|temporada|season|seasons?|cap|capitulo|capitulos|episodio|episodios|ep)\s+([ivxlc]+|\d+)\b/i);
  if (tagged) return parseOrdinalToken(tagged[1]);
  const trailing = normalized.match(/\b([ivxlc]+|\d+)\b$/i);
  if (trailing && normalized.split(/\s+/).length > 1) return parseOrdinalToken(trailing[1]);
  return NaN;
}

function extractSeriesBaseTitle(title) {
  return normalizeTitle(title)
    .replace(/\b(?:part|parte|vol|volume|livro|book|tomo|temporada|season|seasons?|cap|capitulo|capitulos|episodio|episodios|ep)\s+([ivxlc]+|\d+)\b.*$/i, '')
    .replace(/\b([ivxlc]+|\d+)\b$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function titleSimilarity(a, b) {
  const na = extractSeriesBaseTitle(a);
  const nb = extractSeriesBaseTitle(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const wa = new Set(na.split(/\s+/).filter(Boolean));
  const wb = new Set(nb.split(/\s+/).filter(Boolean));
  const shared = [...wa].filter(w => wb.has(w)).length;
  const union = new Set([...wa, ...wb]).size || 1;
  return shared / union;
}

function authorSimilarity(a, b) {
  if (!a || !b) return 0;
  const na = normalizeTitle(a);
  const nb = normalizeTitle(b);
  if (na === nb) return 1;
  const lastA = na.split(/\s+/).pop();
  const lastB = nb.split(/\s+/).pop();
  if (lastA && lastA.length > 2 && lastA === lastB) return 0.85;
  const partsA = new Set(na.split(/\s+/).filter(p => p.length > 2));
  const partsB = new Set(nb.split(/\s+/).filter(p => p.length > 2));
  const shared = [...partsA].filter(p => partsB.has(p)).length;
  return shared >= 2 ? 0.92 : 0;
}

function renderModalRelated(tracker, currentItem) {
  const related=getRelatedItems(tracker,currentItem);
  const section=document.getElementById('modal-related');
  const scroll =document.getElementById('modal-related-scroll');
  const label  =document.getElementById('modal-related-label');
  if(!related.length){section.style.display='none';return;}
  const hasSeries=related.some(r=>r.reason==='série'||r.reason==='continuação');
  const hasAuthor=related.some(r=>r.reason==='autor');
  const hasContinuation=related.some(r=>r.reason==='continuação');
  if(hasContinuation&&hasAuthor) label.textContent='Continuações & mesmo autor';
  else if(hasContinuation) label.textContent='Continuações da obra';
  else if(hasSeries&&hasAuthor) label.textContent='Da mesma série & autor';
  else if(hasSeries) label.textContent='Outros da série';
  else label.textContent='Do mesmo autor';
  const cfg=TRACKER_CFG[tracker];
  scroll.innerHTML=related.map(({item})=>{
    const stars=item.nota?'★'.repeat(item.nota):'';
    const statusColor=cfg.statusColors[item.status]||'#7a7590';
    const thumb=item.img?`<img loading="lazy" decoding="async" src="${escUrl(item.img)}" alt="${esc(item.titulo)}">`:`<span style="font-size:24px;opacity:.5">${cfg.icon}</span>`;
    return `<div class="rel-card" onclick="openModal('${tracker}',${escJs(item.id)})" title="${esc(item.titulo)}">
      <div class="rel-thumb">${thumb}<div class="rel-status-bar" style="background:${statusColor}88"></div></div>
      <div class="rel-name">${esc(item.titulo)}</div>
      ${item.autor?`<div class="rel-meta">${esc(item.autor)}</div>`:''}
      ${stars?`<div class="rel-stars">${stars}</div>`:''}
    </div>`;
  }).join('');
  section.style.display='block';
}
