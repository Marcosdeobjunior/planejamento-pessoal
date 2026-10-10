"use strict";

const DATA_KEY = "sonhosHub";
const DREAM_OPEN_KEY = "soter_open_dream_id";
const S = { sonhos: [] };

function getAppState() {
  return window.SoterStorage && window.SoterStorage.getState
    ? window.SoterStorage.getState()
    : { data: {} };
}

function saveAppState(next) {
  if (window.SoterStorage && window.SoterStorage.save) window.SoterStorage.save(next);
}

function normalizeCategory(cat) {
  const m = {
    "pessoal": "pessoal",
    "profissional": "carreira",
    "carreira": "carreira",
    "financeiro": "financeiro",
    "saúde": "saude",
    "saude": "saude",
    "relacionamento": "familia",
    "família": "familia",
    "familia": "familia",
    "educação": "criativo",
    "educacao": "criativo",
    "viagem": "aventura",
    "hobby": "criativo",
    "espiritual": "espiritual"
  };
  const k = String(cat || "pessoal").trim().toLowerCase();
  return m[k] || "pessoal";
}

function load() {
  const app = getAppState();
  const raw = app.data && app.data[DATA_KEY];
  if (!raw || typeof raw !== "object") return;

  if (Array.isArray(raw.sonhos) && raw.sonhos.length && Array.isArray(raw.sonhos[0].metas)) {
    S.sonhos = raw.sonhos;
    return;
  }

  if (Array.isArray(raw.sonhos) && Array.isArray(raw.metas)) {
    const metasById = new Map(raw.metas.map((m) => [String(m.id), m]));
    S.sonhos = raw.sonhos.map((d) => {
      const ids = Array.isArray(d.metaIds) ? d.metaIds : [];
      const metas = ids.map((id) => metasById.get(String(id))).filter(Boolean).map((m) => ({
        id: Number(String(m.id).replace(/\D+/g, "")) || Date.now() + Math.floor(Math.random() * 999),
        texto: m.titulo || m.descricao || "Meta",
        feita: m.status === "concluida",
        prioridade: m.prioridade || "media",
        dataInicio: "",
        prazo: m.prazo || ""
      }));
      return {
        id: Number(String(d.id).replace(/\D+/g, "")) || Date.now() + Math.floor(Math.random() * 999),
        titulo: d.titulo || "Sonho",
        icon: "🌙",
        horizonte: "Longo prazo",
        categoria: normalizeCategory(d.categoria),
        desc: d.descricao || "",
        dataInicio: "",
        dataFim: d.prazo || "",
        img: d.imagem || "",
        metas,
        realizado: false
      };
    });
    return;
  }

  if (Array.isArray(raw.sonhos)) {
    S.sonhos = raw.sonhos;
  }
}

function save() {
  const app = getAppState();
  if (!app.data || typeof app.data !== "object") app.data = {};
  app.data[DATA_KEY] = { sonhos: S.sonhos };
  try {
    saveAppState(app);
  } catch (err) {
    const msg = String((err && err.message) || "");
    if (msg.toLowerCase().indexOf("quota") >= 0) {
      alert("Armazenamento do navegador cheio. Algumas imagens foram removidas automaticamente. Tente salvar novamente.");
      return;
    }
    throw err;
  }
}

function addNotif() {}

function num(v) {
  if (v === null || v === undefined || v === "") return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  var t = String(v).replace(/[^\d,.\-]/g, "");
  if (t.indexOf(",") >= 0) t = t.replace(/\./g, "").replace(",", ".");   // 1.500,50 -> 1500.50
  var n = Number(t);
  return Number.isFinite(n) ? n : 0;
}

function fmtBRL(v) {
  return "R$ " + num(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function ymFromDate(d) {
  if (!d) return "";
  var dt = new Date(d);
  if (isNaN(dt)) return "";
  var y = dt.getFullYear();
  var m = String(dt.getMonth() + 1).padStart(2, "0");
  return y + "-" + m;
}

function nowYm() {
  var d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
}

function buildFinanceInfo(s) {
  var base = num(s.acumulado);
  var custo = num(s.custo);
  var hist = Array.isArray(s.financeHistory) ? s.financeHistory.slice() : [];
  hist = hist
    .map(function (h, i) {
      var mes = String((h && h.mes) || "");
      if (mes.length > 7 && /^\d{4}-\d{2}/.test(mes)) mes = mes.slice(0, 7);
      return { id: (h && h.id) || ("d" + i), mes: mes, valor: num(h && h.valor) };
    })
    .filter(function (h) { return h.mes && h.valor > 0; })
    .sort(function (a, b) { return a.mes.localeCompare(b.mes); });

  var depSum = hist.reduce(function (acc, h) { return acc + h.valor; }, 0);
  var atual = base + depSum;
  var restante = Math.max(0, custo - atual);
  var media = hist.length ? (depSum / hist.length) : 0;
  var mesesPrev = media > 0 ? Math.ceil(restante / media) : null;

  return { base: base, custo: custo, hist: hist, depSum: depSum, atual: atual, restante: restante, media: media, mesesPrev: mesesPrev };
}

function snMigrateData() {
  S.sonhos = (S.sonhos || []).map(s => {
    if (!s.metas)     s.metas     = [];
    if (!s.categoria) s.categoria = 'pessoal';
    if (!s.icon)      s.icon      = '🌙';
    if (!s.createdAt) s.createdAt = new Date(Number(s.id) || Date.now()).toISOString();
    if (typeof s.custo !== "number") s.custo = num(s.custo);
    if (typeof s.acumulado !== "number") s.acumulado = num(s.acumulado);
    if (!Array.isArray(s.financeHistory)) s.financeHistory = [];
    s.financeHistory = s.financeHistory
      .map(function (h) { return { id: h.id || Date.now(), mes: String(h.mes || ""), valor: num(h.valor) }; })
      .filter(function (h) { return h.mes && h.valor > 0; });
    if (!s.realizadoAt) s.realizadoAt = '';
    s.metas = s.metas.map(m => {
      if (!m.prioridade) m.prioridade = 'media';
      if (!m.dataInicio) m.dataInicio = '';
      if (!m.prazo)      m.prazo      = '';
      if (!m.dataConclusao) m.dataConclusao = '';
      return m;
    });
    return s;
  });
}

// ── Helpers ──────────────────────────────────────────────────────────────
const SN_CAT_COLORS = {
  pessoal:'#7c6fcd', carreira:'#4ab0e8', financeiro:'#c8a96e',
  saude:'#5ec4a8',   familia:'#e06b8b',  aventura:'#e8864a',
  criativo:'#b06be8', espiritual:'#c8a96e',
};
const SN_CAT_LABELS = {
  pessoal:'🧠 Pessoal', carreira:'💼 Carreira', financeiro:'💰 Financeiro',
  saude:'💪 Saúde',     familia:'🏡 Família',   aventura:'🌍 Aventura',
  criativo:'🎨 Criativo', espiritual:'✨ Espiritual',
};

function snFmtDate(ds) {
  if (!ds) return null;
  const d = new Date(ds + 'T00:00:00');
  if (isNaN(d)) return null;
  return d.toLocaleDateString('pt-BR',{day:'2-digit',month:'short',year:'numeric'});
}
function snFmtDateShort(ds) {
  if (!ds) return null;
  const d = new Date(ds + 'T00:00:00');
  if (isNaN(d)) return null;
  return d.toLocaleDateString('pt-BR',{day:'2-digit',month:'short'});
}
function snDaysDiff(ds) {
  if (!ds) return null;
  const d = new Date(ds + 'T00:00:00');
  const n = new Date(); n.setHours(0,0,0,0);
  return Math.round((d - n) / 86400000);
}
function snIsLate(prazo, feita) {
  if (feita || !prazo) return false;
  return snDaysDiff(prazo) < 0;
}

// ── Segurança / ids / imagens ─────────────────────────────────────────────
function snEsc(v) {
  return String(v == null ? '' : v).replace(/[&<>"']/g, function (ch) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
  });
}

function snFind(id) {
  return S.sonhos.find(function (x) { return String(x.id) === String(id); });
}

// id único (numérico) dentro de uma lista
function snUid(list) {
  let id = Date.now();
  const used = new Set((list || []).map(function (x) { return String(x.id); }));
  while (used.has(String(id))) id++;
  return id;
}

// Só aceita URLs http(s), data:image, blob: ou caminhos relativos
function snSafeImg(u) {
  const v = String(u || '').trim();
  if (!v) return '';
  const scheme = /^([a-z][a-z0-9+.\-]*):/i.exec(v);
  if (!scheme) return v;
  const sc = scheme[1].toLowerCase();
  if (sc === 'http' || sc === 'https' || sc === 'blob') return v;
  if (sc === 'data' && /^data:image\//i.test(v)) return v;
  return '';
}

// Compressão única para capa: mesmo tamanho/qualidade no modal e no drawer.
const SN_IMG_MAX_W = 960, SN_IMG_MAX_H = 540, SN_IMG_MAX_BYTES = 140 * 1024;
function snCompressImage(file, done) {
  if (!file || !/^image\//.test(file.type || '')) { alert('Selecione um arquivo de imagem.'); return; }
  const reader = new FileReader();
  reader.onerror = function () { alert('Não foi possível ler a imagem.'); };
  reader.onload = function (ev) {
    const im = new Image();
    im.onerror = function () { alert('Não foi possível abrir esta imagem.'); };
    im.onload = function () {
      let scale = Math.min(1, SN_IMG_MAX_W / im.width, SN_IMG_MAX_H / im.height);
      let q = 0.82, out = '';
      for (let i = 0; i < 12; i++) {
        const w = Math.max(1, Math.round(im.width * scale));
        const h = Math.max(1, Math.round(im.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#0c0b1a'; ctx.fillRect(0, 0, w, h);
        ctx.drawImage(im, 0, 0, w, h);
        out = canvas.toDataURL('image/jpeg', q);
        if (out.length * 0.75 <= SN_IMG_MAX_BYTES) break;
        if (q > 0.5) q -= 0.08; else scale *= 0.85;
      }
      done(out);
    };
    im.src = ev.target.result;
  };
  reader.readAsDataURL(file);
}

// ══════════════════════════════════════════════════════════════════════════
// HUB STATE
// ══════════════════════════════════════════════════════════════════════════
let hubSonhoId   = null;
let hubEditMetaId = null;   // meta em edição inline no hub
let snModalEditId = null;   // meta em edição no modal de criação
let hubEditImg   = '';   // image data during inline edit

// ── Open / Close ──────────────────────────────────────────────────────────
function snOpenHub(id) {
  const s = snFind(id);
  if (!s) return;
  hubSonhoId = String(s.id);
  hubEditMetaId = null;
  const hub = document.getElementById('sn-hub');
  hub.scrollTop = 0;
  hub.classList.add('open');
  document.body.style.overflow = 'hidden';
  const header = document.querySelector('.site-header');
  if (header) header.style.zIndex = '1';
  hubRender(s);
}

function snHubClose() {
  document.getElementById('sn-hub').classList.remove('open');
  document.body.style.overflow = '';
  const header = document.querySelector('.site-header');
  if (header) header.style.zIndex = '';
  hubSonhoId = null;
  hubEditMetaId = null;
  hubLockScroll(false);
}

// ── Drawer de edição ──────────────────────────────────────────────────────
let _drawerImg = '';
let _drawerSnap = null;
const HD_FIELDS = ['hd-titulo','hd-icon','hd-categoria','hd-horizonte','hd-inicio','hd-fim',
                   'hd-desc','hd-intencao','hd-nota','hd-custo','hd-acumulado'];

function hubDrawerSnapshot() {
  const vals = HD_FIELDS.map(function (id) { const el = document.getElementById(id); return el ? el.value : ''; });
  const zone = document.getElementById('hd-cover-zone');
  return JSON.stringify([vals, _drawerImg, !!(zone && zone.classList.contains('hci'))]);
}
function hubDrawerIsDirty() { return _drawerSnap !== null && hubDrawerSnapshot() !== _drawerSnap; }

// Fechamento iniciado pelo usuário (X, Cancelar, fundo, Esc): avisa se há alterações.
function hubDrawerRequestClose() {
  if (hubDrawerIsDirty() && !confirm('Você tem alterações não salvas. Descartar e fechar?')) return;
  hubDrawerClose();
}

function hubDrawerOpen() {
  if (!hubSonhoId) return;
  const s = snFind(hubSonhoId); if (!s) return;
  document.getElementById('hd-titulo').value    = s.titulo      || '';
  document.getElementById('hd-icon').value      = s.icon        || '🌙';
  document.getElementById('hd-categoria').value = s.categoria   || 'pessoal';
  document.getElementById('hd-horizonte').value = s.horizonte   || '1 ano';
  document.getElementById('hd-inicio').value    = s.dataInicio  || '';
  document.getElementById('hd-fim').value       = s.dataFim     || '';
  document.getElementById('hd-desc').value      = s.desc        || '';
  document.getElementById('hd-intencao').value  = s.intencao    || '';
  document.getElementById('hd-nota').value      = s.nota        || '';
  document.getElementById('hd-custo').value     = s.custo       || '';
  document.getElementById('hd-acumulado').value = s.acumulado   || '';
  document.getElementById('hd-head-title').textContent = s.titulo || 'Editar sonho';
  _drawerImg = snSafeImg(s.img);
  const zone = document.getElementById('hd-cover-zone');
  const img  = document.getElementById('hd-cover-img');
  img.src = _drawerImg; zone.classList.toggle('hci', !!_drawerImg);
  document.getElementById('hd-img-web').value = s.img || '';
  _drawerSnap = hubDrawerSnapshot();
  document.getElementById('hub-drawer').classList.add('open');
  document.getElementById('hub-drawer-bd').classList.add('open');
  hubLockScroll(true);
  const hdBody = document.querySelector('#hub-drawer .hd-body'); if (hdBody) hdBody.scrollTop = 0;
  setTimeout(() => document.getElementById('hd-titulo').focus({ preventScroll: true }), 180);
}

function hubDrawerClose() {
  document.getElementById('hub-drawer').classList.remove('open');
  document.getElementById('hub-drawer-bd').classList.remove('open');
  _drawerSnap = null;
  hubLockScroll(false);
}

// Com o drawer aberto, só o .hd-body rola; hub e página ficam travados.
function hubLockScroll(lock) {
  const hub = document.getElementById('sn-hub');
  if (hub) hub.classList.toggle('drawer-open', !!lock);
  document.documentElement.classList.toggle('sn-drawer-lock', !!lock);
  document.body.classList.toggle('sn-drawer-lock', !!lock);
}

function hubDrawerRemoveImg() {
  _drawerImg = '';
  document.getElementById('hd-cover-img').src = '';
  document.getElementById('hd-cover-zone').classList.remove('hci');
  document.getElementById('hd-img-input').value = '';
  document.getElementById('hd-img-web').value = '';
}

function hubDrawerApplyWebImg() {
  const input = document.getElementById('hd-img-web');
  const value = snSafeImg(input.value);
  if (!String(input.value || '').trim()) return;
  if (!value) { alert('URL de imagem inválida. Use um endereço http(s).'); return; }
  _drawerImg = value;
  document.getElementById('hd-cover-img').src = _drawerImg;
  document.getElementById('hd-cover-zone').classList.add('hci');
}

function hubDrawerHandleImg(e) {
  const file = e.target.files[0]; if (!file) return;
  snCompressImage(file, function (dataUrl) {
    _drawerImg = dataUrl;
    document.getElementById('hd-cover-img').src = _drawerImg;
    document.getElementById('hd-cover-zone').classList.add('hci');
  });
}

function hubDrawerSalvar() {
  const titulo = document.getElementById('hd-titulo').value.trim();
  if (!titulo) {
    const el = document.getElementById('hd-titulo');
    el.focus(); el.style.borderColor='rgba(224,107,139,.65)';
    setTimeout(()=>el.style.borderColor='',1400); return;
  }
  const idx = S.sonhos.findIndex(x => String(x.id) === String(hubSonhoId)); if (idx<0) return;
  S.sonhos[idx] = Object.assign({}, S.sonhos[idx], {
    titulo,
    icon:       document.getElementById('hd-icon').value.trim() || '🌙',
    categoria:  document.getElementById('hd-categoria').value,
    horizonte:  document.getElementById('hd-horizonte').value,
    dataInicio: document.getElementById('hd-inicio').value,
    dataFim:    document.getElementById('hd-fim').value,
    desc:       document.getElementById('hd-desc').value.trim(),
    intencao:   document.getElementById('hd-intencao').value.trim(),
    nota:       document.getElementById('hd-nota').value.trim(),
    custo:      num(document.getElementById('hd-custo').value),
    acumulado:  num(document.getElementById('hd-acumulado').value),
    img:        document.getElementById('hd-cover-zone').classList.contains('hci') ? (_drawerImg || S.sonhos[idx].img) : '',
  });
  save(); hubDrawerClose(); hubRender(S.sonhos[idx]); renderSonhos();
}

function hubDrawerDeletar() {
  const s = S.sonhos.find(x=>String(x.id)===String(hubSonhoId));
  if (!confirm('Excluir "' + (s ? s.titulo : 'este sonho') + '"? Esta ação não pode ser desfeita.')) return;
  S.sonhos = S.sonhos.filter(x=>String(x.id)!==String(hubSonhoId));
  save(); renderSonhos(); hubDrawerClose(); snHubClose();
}

// ── Main render ───────────────────────────────────────────────────────────
function hubRender(s) {
  const isReal   = s.realizado;
  const catColor = SN_CAT_COLORS[s.categoria] || '#7c6fcd';
  const catLabel = SN_CAT_LABELS[s.categoria]  || s.categoria;
  const metas    = s.metas || [];

  // Hero image
  const hero = document.getElementById('hub-hero');
  const heroImg = document.getElementById('hub-hero-img');
  heroImg.src = s.img || '';
  hero.classList.toggle('has-img', !!s.img);

  // Icon & title
  document.getElementById('hub-icon').textContent  = s.icon || '🌙';
  document.getElementById('hub-title').textContent = s.titulo;

  // Cat badge
  const badge = document.getElementById('hub-cat-badge');
  badge.textContent = catLabel;
  badge.style.cssText = `background:${catColor}18;border-color:${catColor}44;color:${catColor}`;

  // Hero meta chips
  const metaRow = document.getElementById('hub-hero-meta');
  if (metaRow) {
    const chips = [];
    if (s.dataInicio) chips.push(`<div class="hub-hero-chip">📅 ${snFmtDateShort(s.dataInicio)}</div>`);
    if (s.dataFim) {
      const diff = snDaysDiff(s.dataFim);
      const cls  = !isReal && diff < 0 ? 'warning' : isReal ? 'success' : '';
      const txt  = isReal ? '✓ ' + snFmtDateShort(s.dataFim)
                 : diff < 0  ? '⚠ ' + Math.abs(diff) + 'd atrasado'
                 : diff === 0 ? '✦ Vence hoje!'
                 : '🏁 ' + diff + 'd restantes';
      chips.push(`<div class="hub-hero-chip ${cls}">${txt}</div>`);
    }
    if (s.horizonte) chips.push(`<div class="hub-hero-chip">⏳ ${s.horizonte}</div>`);
    metaRow.innerHTML = chips.join('');
  }

  // Realizado buttons
  const navDoneBtn  = document.getElementById('hub-nav-done-btn');
  const navDoneIcon = document.getElementById('hub-nav-done-icon');
  const navDoneLbl  = document.getElementById('hub-nav-done-lbl');
  if (navDoneBtn) {
    navDoneBtn.classList.toggle('realizado', isReal);
    if (navDoneIcon) navDoneIcon.classList.toggle('is-done', isReal);
    navDoneLbl.textContent = 'Realizado';
  }
  const doneBtn  = document.getElementById('hub-done-btn');
  const doneIcon = document.getElementById('hub-done-icon');
  const doneLbl  = document.getElementById('hub-done-lbl');
  if (doneBtn) {
    doneBtn.className = 'hub-done-btn ' + (isReal ? 'done-state' : 'pending');
    if (doneIcon) doneIcon.classList.toggle('is-done', isReal);
    doneLbl.textContent = isReal ? 'Realizado! (clique para desfazer)' : 'Marcar como realizado';
  }

  // Description
  const descEl = document.getElementById('hub-desc-text');
  if (descEl) {
    if (s.desc) { descEl.className = 'hub-desc-text'; descEl.textContent = s.desc; }
    else { descEl.className = 'hub-desc-empty'; descEl.textContent = 'Sem descrição. Clique em Editar para adicionar.'; }
  }

  // Progress ring (r=44, circumference=276.46)
  const total  = metas.length;
  const done   = metas.filter(m => m.feita).length;
  const late   = metas.filter(m => snIsLate(m.prazo, m.feita)).length;
  const pct    = total > 0 ? Math.round(done / total * 100) : 0;
  const circum = 2 * Math.PI * 44;
  const ringFill = document.getElementById('hub-ring-fill');
  if (ringFill) { ringFill.style.strokeDasharray = circum; setTimeout(() => { ringFill.style.strokeDashoffset = circum * (1 - pct / 100); }, 80); }
  const ringPct = document.getElementById('hub-ring-pct'); if (ringPct) ringPct.textContent = pct + '%';
  const ringSub = document.getElementById('hub-ring-sub'); if (ringSub) ringSub.textContent = done + '/' + total + ' metas';
  const ringStats = document.getElementById('hub-ring-stats');
  if (ringStats) ringStats.innerHTML =
    `<div class="hub-ring-stat"><span class="hub-ring-stat-lbl">Total</span><span class="hub-ring-stat-val">${total}</span></div>` +
    `<div class="hub-ring-stat"><span class="hub-ring-stat-lbl">Concluídas</span><span class="hub-ring-stat-val" style="color:var(--accent3)">${done}</span></div>` +
    (late > 0 ? `<div class="hub-ring-stat"><span class="hub-ring-stat-lbl">Atrasadas</span><span class="hub-ring-stat-val" style="color:var(--accent4)">${late}</span></div>` : '');

  // Priority bars
  const pCount = {alta:0,media:0,baixa:0};
  metas.forEach(m => { pCount[m.prioridade||'media']++; });
  const maxP = Math.max(...Object.values(pCount), 1);
  const pColorMap = {alta:'var(--accent4)',media:'var(--accent1)',baixa:'var(--accent3)'};
  const pLblMap   = {alta:'🔴 Alta',media:'🟡 Média',baixa:'🟢 Baixa'};
  const prioRows = document.getElementById('hub-prio-rows');
  if (prioRows) prioRows.innerHTML = ['alta','media','baixa'].map(p =>
    `<div class="hub-prio-row">
      <div class="hub-prio-info"><span class="hub-prio-lbl">${pLblMap[p]}</span><span class="hub-prio-val">${pCount[p]} meta${pCount[p]!==1?'s':''}</span></div>
      <div class="hub-prio-track"><div class="hub-prio-fill" style="width:${pCount[p]/maxP*100}%;background:${pColorMap[p]}"></div></div>
    </div>`
  ).join('');

  hubRenderDates(s);
  hubRenderMetaList(s);
  hubRenderTips(s);
  hubRenderExtras(s);
}

function hubRenderExtras(s) {
  hubRenderFinance(s);

  // ── Intenção do dia ──────────────────────────────────────────────
  const intEl = document.getElementById('hub-intencao-display');
  if (intEl) intEl.textContent = s.intencao || '';

  // ── Nota rápida ──────────────────────────────────────────────────
  const notaSection = document.getElementById('hub-nota-section');
  const notaEl      = document.getElementById('hub-nota-display');
  if (notaSection && notaEl) {
    const hasNota = !!(s.nota && s.nota.trim());
    notaSection.style.display = hasNota ? '' : 'none';
    if (hasNota) notaEl.textContent = s.nota.trim();
  }

  // ── Jornada (dias desde início) ──────────────────────────────────
  const jorSection = document.getElementById('hub-jornada-section');
  const jorContent = document.getElementById('hub-jornada-content');
  if (jorSection && jorContent && s.dataInicio) {
    jorSection.style.display = '';
    const ini   = new Date(s.dataInicio + 'T00:00:00');
    const hoje  = new Date(); hoje.setHours(0,0,0,0);
    const dias  = Math.max(0, Math.round((hoje - ini) / 86400000));
    let pct = 0, totalDias = 0, restam = null;
    if (s.dataFim) {
      const fim = new Date(s.dataFim + 'T00:00:00');
      totalDias = Math.max(1, Math.round((fim - ini) / 86400000));
      pct = Math.min(100, Math.round(dias / totalDias * 100));
      restam = Math.max(0, Math.round((fim - hoje) / 86400000));
    }
    jorContent.innerHTML =
      `<div class="hub-jornada-dias">
        <span class="hub-jornada-num">${dias}</span>
        <span class="hub-jornada-unit">dias de jornada</span>
      </div>` +
      (s.dataFim ? `<div class="hub-jornada-bar"><div class="hub-jornada-fill" style="width:0%" id="hub-jornada-fill"></div></div>
        <div class="hub-jornada-sub">${restam === 0 ? '🏁 Prazo final hoje!' : restam > 0 ? `Faltam ${restam} dias para o prazo` : `${Math.abs(restam)}d além do prazo`}</div>` : '');
    // anima a barra
    if (s.dataFim) setTimeout(() => {
      const fill = document.getElementById('hub-jornada-fill');
      if (fill) fill.style.width = pct + '%';
    }, 200);
  } else if (jorSection) { jorSection.style.display = 'none'; }
}

function hubRenderFinance(s) {
  const section = document.getElementById('hub-finance-section');
  if (!section) return;
  const info = buildFinanceInfo(s);
  const fmt = function (v) { return "R$ " + num(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };

  const restEl = document.getElementById('hub-fin-restante');
  const medEl = document.getElementById('hub-fin-media');
  const prevEl = document.getElementById('hub-fin-prev');
  if (restEl) restEl.textContent = fmt(info.restante);
  if (medEl) medEl.textContent = fmt(info.media);
  if (prevEl) {
    if (info.mesesPrev === null) prevEl.textContent = "Sem previsão";
    else if (info.mesesPrev <= 0) prevEl.textContent = "Meta atingida";
    else {
      const d = new Date();
      d.setMonth(d.getMonth() + info.mesesPrev);
      prevEl.textContent = info.mesesPrev + " mes(es) • " + d.toLocaleDateString("pt-BR", { month: "short", year: "numeric" });
    }
  }

  hubDrawFinChart(s, info);

  const list = document.getElementById('hub-fin-list');
  if (list) {
    list.innerHTML = !info.hist.length
      ? `<div class="hub-meta-empty" style="padding:10px 0">Sem aportes registrados.</div>`
      : info.hist.slice().reverse().slice(0,12).map(function (h) {
          return `<div class="hub-fin-item">
            <div><div class="meta">${snEsc(h.mes)}</div><div class="val">${fmt(h.valor)}</div></div>
            <button class="hub-fin-del" data-sn-act="hub-del-deposito" data-sn-id="${snEsc(h.id)}" title="Remover">✕</button>
          </div>`;
        }).join('');
  }

  const monthInp = document.getElementById('hub-fin-mes');
  if (monthInp && !monthInp.value) monthInp.value = nowYm();
}

// ── Gráfico financeiro (SVG medido em px: 1 unidade do viewBox = 1 px) ─────
let hubFinChartW = 0;
let hubFinChartRO = null;

function hubFinNiceMax(v) {
  if (v <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / pow;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return step * pow;
}
function hubFinCompact(v) {
  const a = Math.abs(v);
  const f = function (x, suf) { return x.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + suf; };
  if (a >= 1e6) return f(v / 1e6, ' mi');
  if (a >= 1e3) return f(v / 1e3, ' mil');
  return Math.round(v).toLocaleString('pt-BR');
}
function hubFinMonthIdx(ym) { const p = String(ym).split('-'); return (+p[0]) * 12 + (+p[1] - 1); }
function hubFinIdxMonth(i) { return Math.floor(i / 12) + '-' + String((i % 12) + 1).padStart(2, '0'); }
function hubFinMonthLbl(ym) {
  const n = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
  const p = String(ym).split('-');
  return (n[(+p[1]) - 1] || p[1]) + '/' + String(p[0]).slice(2);
}

function hubDrawFinChart(s, info) {
  const chart = document.getElementById('hub-fin-chart'); if (!chart) return;
  info = info || buildFinanceInfo(s);

  // observa mudança de largura (hub abrindo, resize, rotação do celular)
  if (!hubFinChartRO && typeof ResizeObserver !== 'undefined') {
    hubFinChartRO = new ResizeObserver(function () {
      const el = document.getElementById('hub-fin-chart');
      const cur = hubSonhoId && snFind(hubSonhoId);
      if (!el || !cur) return;
      const w = Math.round(el.getBoundingClientRect().width);
      if (w && Math.abs(w - hubFinChartW) > 1) hubDrawFinChart(cur);
    });
    hubFinChartRO.observe(chart);
  }

  const rect = chart.getBoundingClientRect();
  const W = Math.round(rect.width) || (chart.parentNode && chart.parentNode.clientWidth) || 560;
  const H = Math.round(rect.height) || 220;
  hubFinChartW = W;
  chart.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
  chart.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  chart.setAttribute('role', 'img');

  const fmt = function (v) { return 'R$ ' + num(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };

  // legenda: item "Meta" só quando há custo definido
  const legend = document.querySelector('#hub-finance-section .hub-fin-legend');
  if (legend) {
    let g = legend.querySelector('.hub-fin-legend-goal');
    if (info.custo > 0 && !g) {
      g = document.createElement('span');
      g.className = 'hub-fin-legend-goal';
      g.innerHTML = '<span class="hub-fin-dot goal"></span>Meta';
      legend.appendChild(g);
    } else if (!(info.custo > 0) && g) g.remove();
  }

  if (!info.hist.length) {
    chart.setAttribute('aria-label', 'Sem depósitos no histórico');
    chart.innerHTML =
      '<text class="hfc-empty-t" x="' + (W / 2) + '" y="' + (H / 2 - 4) + '" text-anchor="middle">Sem depósitos no histórico</text>' +
      '<text class="hfc-empty-s" x="' + (W / 2) + '" y="' + (H / 2 + 14) + '" text-anchor="middle">Registre um aporte abaixo para ver a evolução</text>';
    return;
  }

  // 1) agrupa depósitos por mês e monta uma linha do tempo contínua (meses sem aporte = 0)
  const byMonth = {};
  info.hist.forEach(function (d) { byMonth[d.mes] = (byMonth[d.mes] || 0) + d.valor; });
  const keys = Object.keys(byMonth).sort();
  const endI = hubFinMonthIdx(keys[keys.length - 1]);
  const startI = Math.max(hubFinMonthIdx(keys[0]), endI - 11);
  const months = [];
  for (let i = startI; i <= endI; i++) { const ym = hubFinIdxMonth(i); months.push({ ym: ym, v: byMonth[ym] || 0 }); }
  let acc = info.base;
  keys.forEach(function (k) { if (hubFinMonthIdx(k) < startI) acc += byMonth[k]; });
  const acum = months.map(function (m) { acc += m.v; return acc; });

  // 2) escala
  const goal = info.custo > 0 ? info.custo : 0;
  const dataMax = Math.max.apply(null, acum.concat(months.map(function (m) { return m.v; }), [1]));
  // meta só entra na escala se estiver perto; longe demais, ela achataria as barras
  const goalInScale = goal > 0 && goal <= dataMax * 2;
  const maxRaw = goalInScale ? Math.max(dataMax, goal) : dataMax;
  const tickStep = hubFinNiceMax(maxRaw * 1.05 / 4);          // passo redondo: 1, 2, 2.5, 5 × 10^k
  const ticks = Math.max(1, Math.ceil(maxRaw * 1.05 / tickStep));
  const maxV = tickStep * ticks;
  const labW = Math.max(30, hubFinCompact(maxV).length * 6 + 10);
  const pl = labW, pr = 14, pt = 26, pb = 26;
  const innerW = Math.max(40, W - pl - pr), innerH = Math.max(40, H - pt - pb);
  const n = months.length, band = innerW / n;
  const barW = Math.max(4, Math.min(44, band * 0.52));
  const cx = function (i) { return pl + band * i + band / 2; };
  const toY = function (v) { return pt + innerH - (Math.min(v, maxV) / maxV) * innerH; };
  const y0 = toY(0);

  let svg =
    '<defs>' +
    '<linearGradient id="hfc-bar-grad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="hfc-s-bar-a"/><stop offset="1" class="hfc-s-bar-b"/></linearGradient>' +
    '<linearGradient id="hfc-area-grad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="hfc-s-area-a"/><stop offset="1" class="hfc-s-area-b"/></linearGradient>' +
    '</defs>';

  // grade + eixo Y
  for (let t = 0; t <= ticks; t++) {
    const v = (maxV / ticks) * t, y = toY(v);
    svg += '<line class="' + (t === 0 ? 'hfc-axis' : 'hfc-grid') + '" x1="' + pl + '" y1="' + y + '" x2="' + (W - pr) + '" y2="' + y + '"/>' +
           '<text class="hfc-tick" x="' + (pl - 6) + '" y="' + (y + 3) + '" text-anchor="end">' + hubFinCompact(v) + '</text>';
  }

  // meta (linha tracejada)
  if (goalInScale) {
    const gy = toY(goal);
    svg += '<line class="hfc-goal" x1="' + pl + '" y1="' + gy + '" x2="' + (W - pr) + '" y2="' + gy + '"/>' +
           '<text class="hfc-goal-lbl" x="' + (W - pr) + '" y="' + (gy - 5) + '" text-anchor="end">Meta ' + hubFinCompact(goal) + '</text>';
  } else if (goal > 0) {
    // meta acima da escala: etiqueta no topo com seta
    const tx = W - pr;
    svg += '<polygon class="hfc-goal-arrow" points="' + (tx - 4) + ',13 ' + tx + ',5 ' + (tx + 4) + ',13"/>' +
           '<text class="hfc-goal-lbl" x="' + (tx - 9) + '" y="13" text-anchor="end">Meta ' + hubFinCompact(goal) + '</text>';
  }

  // área + linha do acumulado
  const pts = acum.map(function (v, i) { return [cx(i), toY(v)]; });
  if (n > 1) {
    svg += '<path class="hfc-area" d="M' + pts[0][0] + ',' + y0 + ' L' + pts.map(function (q) { return q[0] + ',' + q[1]; }).join(' L') + ' L' + pts[n - 1][0] + ',' + y0 + ' Z"/>';
  }

  // barras de aporte (topo arredondado)
  months.forEach(function (m, i) {
    if (m.v <= 0) return;
    const top = toY(m.v), bh = Math.max(3, y0 - top), r = Math.min(5, barW / 2, bh), x = cx(i) - barW / 2, y = y0 - bh;
    svg += '<path class="hfc-bar" d="M' + x + ',' + y0 + ' L' + x + ',' + (y + r) + ' Q' + x + ',' + y + ' ' + (x + r) + ',' + y +
           ' L' + (x + barW - r) + ',' + y + ' Q' + (x + barW) + ',' + y + ' ' + (x + barW) + ',' + (y + r) + ' L' + (x + barW) + ',' + y0 + ' Z">' +
           '<title>' + snEsc(hubFinMonthLbl(m.ym)) + ': ' + fmt(m.v) + '</title></path>';
  });

  if (n > 1) svg += '<polyline class="hfc-line" points="' + pts.map(function (q) { return q[0] + ',' + q[1]; }).join(' ') + '"/>';
  pts.forEach(function (q, i) {
    svg += '<circle class="hfc-dot" cx="' + q[0] + '" cy="' + q[1] + '" r="' + (i === n - 1 ? 4.5 : 3.5) + '"><title>Acumulado em ' + snEsc(hubFinMonthLbl(months[i].ym)) + ': ' + fmt(acum[i]) + '</title></circle>';
  });

  // destaque do valor acumulado atual (último ponto), sempre dentro do quadro
  const last = pts[n - 1], txt = 'R$ ' + hubFinCompact(acum[n - 1]);
  const pw = txt.length * 6.2 + 14, ph = 18;
  const px = Math.min(Math.max(last[0] - pw / 2, pl), W - pr - pw);
  const py = Math.max(last[1] - ph - 9, (goal > 0 && !goalInScale) ? 20 : 4);   // não colide com a etiqueta da meta
  svg += '<rect class="hfc-pill" x="' + px + '" y="' + py + '" width="' + pw + '" height="' + ph + '" rx="9"/>' +
         '<text class="hfc-pill-t" x="' + (px + pw / 2) + '" y="' + (py + 12.5) + '" text-anchor="middle">' + txt + '</text>';

  // rótulos de mês (pula alguns se não couberem)
  const step = Math.max(1, Math.ceil(42 / band));
  months.forEach(function (m, i) {
    if ((n - 1 - i) % step) return;   // sempre rotula o último mês
    svg += '<text class="hfc-month" x="' + cx(i) + '" y="' + (H - 8) + '" text-anchor="middle">' + hubFinMonthLbl(m.ym) + '</text>';
  });

  chart.setAttribute('aria-label', 'Evolução dos depósitos: acumulado de ' + fmt(acum[n - 1]) + (goal > 0 ? ' da meta de ' + fmt(goal) : ''));
  chart.innerHTML = svg;
}

function hubAddDeposito() {
  const s = snFind(hubSonhoId); if (!s) return;
  const mesEl = document.getElementById('hub-fin-mes');
  const valEl = document.getElementById('hub-fin-valor');
  let mes = (mesEl && mesEl.value) || nowYm();
  if (mes.length > 7 && /^\d{4}-\d{2}/.test(mes)) mes = mes.slice(0, 7);
  const valor = num(valEl && valEl.value);
  if (valor <= 0) {
    if (valEl) { valEl.focus(); valEl.style.borderColor = 'rgba(224,107,139,.65)'; setTimeout(function () { valEl.style.borderColor = ''; }, 1400); }
    return;
  }
  if (!Array.isArray(s.financeHistory)) s.financeHistory = [];
  s.financeHistory.push({ id: Date.now() + "_" + Math.floor(Math.random() * 9999), mes: mes, valor: valor });
  if (valEl) valEl.value = '';
  save(); hubRenderFinance(s); renderSonhos();
}

function hubDelDeposito(depId) {
  const s = S.sonhos.find(x => String(x.id) === String(hubSonhoId)); if (!s) return;
  s.financeHistory = (s.financeHistory || []).filter(function (d) { return String(d.id) !== String(depId); });
  save(); hubRenderFinance(s); renderSonhos();
}

function hubRenderDates(s) {
  const grid = document.getElementById('hub-dates-grid'); if (!grid) return;
  const ini  = snFmtDate(s.dataInicio), fim = snFmtDate(s.dataFim);
  const iniDiff = snDaysDiff(s.dataInicio), fimDiff = snDaysDiff(s.dataFim);
  grid.innerHTML =
    `<div class="hub-date-card"><div class="hub-date-lbl">📅 Início</div><div class="hub-date-val">${ini||'—'}</div>${ini&&iniDiff!==null?`<div class="hub-date-sub">${iniDiff<0?Math.abs(iniDiff)+'d atrás':'daqui '+iniDiff+'d'}</div>`:''}</div>` +
    `<div class="hub-date-card"><div class="hub-date-lbl">🏁 Conclusão</div><div class="hub-date-val" style="${fimDiff!==null&&fimDiff<0&&!s.realizado?'color:var(--accent4)':''}">${fim||'—'}</div>${fim&&fimDiff!==null&&!s.realizado?`<div class="hub-date-sub" style="${fimDiff<0?'color:var(--accent4)':''}">${fimDiff<0?Math.abs(fimDiff)+'d atrasado':fimDiff===0?'Vence hoje':'Faltam '+fimDiff+'d'}</div>`:''}</div>`;
  const tlWrap = document.getElementById('hub-tl-wrap');
  const tlFill = document.getElementById('hub-tl-fill');
  const tlToday = document.getElementById('hub-tl-today');
  const tlLbls  = document.getElementById('hub-tl-labels');
  if (s.dataInicio && s.dataFim && tlWrap) {
    const dStart = new Date(s.dataInicio+'T00:00:00').getTime();
    const dEnd   = new Date(s.dataFim  +'T00:00:00').getTime();
    const span   = dEnd - dStart;
    if (span > 0) {
      const todayPct = Math.min(100, Math.max(0, (Date.now() - dStart) / span * 100));
      tlWrap.style.display = '';
      setTimeout(() => { tlFill.style.width = todayPct+'%'; tlToday.style.left = todayPct+'%'; }, 120);
      if (tlLbls) tlLbls.innerHTML = `<span>${ini}</span><span style="color:var(--accent4)">Hoje</span><span>${fim}</span>`;
    } else { tlWrap.style.display = 'none'; }
  } else if (tlWrap) { tlWrap.style.display = 'none'; }
}

function hubRenderMetaList(s) {
  const list  = document.getElementById('hub-meta-list'); if (!list) return;
  const metas = s.metas || [];
  if (!metas.length) {
    list.innerHTML = `<div class="hub-meta-empty"><span class="hub-meta-empty-icon">◈</span>Nenhuma meta adicionada ainda.<br>Clique em <strong>+ Nova meta</strong> para começar.</div>`;
    return;
  }
  const order = {alta:0,media:1,baixa:2};
  const sorted = [...metas].sort((a,b) => {
    if (a.feita !== b.feita) return a.feita ? 1 : -1;
    const po = (order[a.prioridade||'media']||1) - (order[b.prioridade||'media']||1);
    if (po !== 0) return po;
    if (a.prazo && b.prazo) return a.prazo < b.prazo ? -1 : 1;
    return 0;
  });
  const pColorMap = {alta:'prio-alta',media:'prio-media',baixa:'prio-baixa'};
  const pLblMap   = {alta:'🔴 Alta',media:'🟡 Média',baixa:'🟢 Baixa'};
  list.innerHTML = sorted.map((m, i) => {
    const isLate = snIsLate(m.prazo, m.feita);
    const diff   = snDaysDiff(m.prazo);
    const checkCls = m.feita ? 'done' : isLate ? 'late' : '';
    const chips = [];
    if (m.dataInicio) chips.push(`<span class="hub-meta-chip date">📅 ${snFmtDateShort(m.dataInicio)}</span>`);
    if (m.prazo) {
      let cls = 'date', lbl = '🏁 ' + snFmtDateShort(m.prazo);
      if      (m.feita)   { cls='ondone'; lbl='✓ '+snFmtDateShort(m.prazo); }
      else if (isLate)    { cls='late';   lbl='⚠ '+Math.abs(diff)+'d atrasada'; }
      else if (diff===0)  { cls='soon';   lbl='🔥 Vence hoje'; }
      else if (diff<=3)   { cls='soon';   lbl='⏰ '+diff+'d'; }
      chips.push(`<span class="hub-meta-chip ${cls}">${lbl}</span>`);
    }
    chips.push(`<span class="hub-meta-chip ${pColorMap[m.prioridade||'media']}">${pLblMap[m.prioridade||'media']}</span>`);
    if (String(m.id) === String(hubEditMetaId)) {
      const pr = m.prioridade || 'media';
      const opt = (v, l) => `<option value="${v}"${pr === v ? ' selected' : ''}>${l}</option>`;
      return `<div class="hub-meta-item sn-meta-editing">
        <div class="sn-meta-edit">
          <input type="text" class="sn-me-input" id="hub-me-texto" value="${snEsc(m.texto)}" placeholder="Descrição da meta" aria-label="Descrição da meta">
          <div class="sn-me-row">
            <label>Prioridade<select id="hub-me-prio">${opt('alta','🔴 Alta')}${opt('media','🟡 Média')}${opt('baixa','🟢 Baixa')}</select></label>
            <label>Início<input type="date" id="hub-me-inicio" value="${snEsc(m.dataInicio || '')}"></label>
            <label>Prazo<input type="date" id="hub-me-prazo" value="${snEsc(m.prazo || '')}"></label>
          </div>
          <div class="sn-me-actions">
            <button type="button" class="sn-me-btn ghost" data-sn-act="hub-cancel-meta">Cancelar</button>
            <button type="button" class="sn-me-btn" data-sn-act="hub-save-meta" data-sn-id="${snEsc(m.id)}">Salvar</button>
          </div>
        </div>
      </div>`;
    }
    return `<div class="hub-meta-item" style="animation-delay:${i*0.035}s">
      <button class="hub-meta-check ${checkCls}" data-sn-act="hub-toggle-meta" data-sn-id="${snEsc(m.id)}" title="${m.feita?'Desmarcar':'Concluir'}">${m.feita?'✓':''}</button>
      <div class="hub-meta-body">
        <div class="hub-meta-name ${m.feita?'done':''}" data-sn-act="hub-edit-meta" data-sn-id="${snEsc(m.id)}" title="Clique duas vezes para editar">${snEsc(m.texto)}</div>
        ${chips.length ? `<div class="hub-meta-chips">${chips.join('')}</div>` : ''}
      </div>
      <div class="hub-meta-side">
        <button class="hub-meta-side-btn" data-sn-act="hub-edit-meta" data-sn-id="${snEsc(m.id)}" title="Editar">✎</button>
        <button class="hub-meta-side-btn" data-sn-act="hub-del-meta" data-sn-id="${snEsc(m.id)}" title="Remover">✕</button>
      </div>
    </div>`;
  }).join('');
  if (hubEditMetaId !== null) {
    const inp = document.getElementById('hub-me-texto');
    if (inp) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
  }
}

function hubRenderTips(s) {
  const metas  = s.metas||[], total=metas.length;
  const done   = metas.filter(m=>m.feita).length;
  const late   = metas.filter(m=>snIsLate(m.prazo,m.feita)).length;
  const noDate = metas.filter(m=>!m.prazo&&!m.feita).length;
  const pct    = total>0?Math.round(done/total*100):0;
  const CG='rgba(200,169,110,.6)',CP='rgba(124,111,205,.6)',
        CT='rgba(94,196,168,.6)', CR='rgba(224,107,139,.6)',CB='rgba(74,176,232,.6)';
  const dyn=[];
  if(!s.img)      dyn.push({e:'🖼️',n:'Adicione uma imagem de capa',d:'Sonhos com imagem são visualmente mais poderosos. Abra "Editar" e faça upload de uma foto inspiradora.',t:'Visual',c:CG,p:9});
  if(!s.desc)     dyn.push({e:'📝',n:'Escreva seu "porquê"',d:'A motivação por trás de um sonho é mais forte que o próprio sonho. Descreva o que este objetivo significa para você.',t:'Clareza',c:CP,p:9});
  if(total===0)   dyn.push({e:'🎯',n:'Quebre em metas menores',d:'Adicione 3 a 7 metas concretas e mensuráveis. Cada pequena conquista gera momentum para a próxima.',t:'Planejamento',c:CT,p:8});
  if(late>0)      dyn.push({e:'⚠️',n:late+' meta'+(late>1?'s':'')+' atrasada'+(late>1?'s':''),d:'Revise os prazos ou divida em passos menores para voltar ao ritmo.',t:'Urgente',c:CR,p:10});
  if(noDate>0)    dyn.push({e:'📅',n:'Defina prazos para as metas',d:noDate+' meta'+(noDate>1?'s':'')+' sem prazo. Metas com data têm 2× mais chance de serem concluídas.',t:'Urgência',c:CG,p:7});
  if(!s.dataFim)  dyn.push({e:'🏁',n:'Defina um prazo final',d:'Sonhos sem data vivem no "algum dia". Escolha uma data e comprometa-se com você mesmo.',t:'Foco',c:CB,p:7});
  if(pct>=70&&pct<100) dyn.push({e:'🔥',n:'Quase lá! '+pct+'% concluído',d:'Você está na fase final — onde a maioria desiste. Revise o que falta e termine o que começou.',t:'Momentum',c:CT,p:9});
  if(pct===100&&total>0&&!s.realizado) dyn.push({e:'🎉',n:'100% das metas concluídas!',d:'Parabéns! Clique em "Marcar como realizado" e celebre esta conquista — você merece.',t:'Conquista',c:CT,p:10});
  if(total>=6&&!metas.find(m=>m.prioridade==='alta')) dyn.push({e:'🔴',n:'Defina prioridades claras',d:'Com '+total+' metas, marque as mais críticas como Alta para focar sua energia onde importa.',t:'Estratégia',c:CP,p:6});
  const fix=[
    {e:'🌙',n:'Revisão semanal de 10 min',d:'Todo domingo: revise metas, atualize progresso, defina o próximo passo. Consistência supera intensidade — sempre.',t:'Hábito',c:CG,p:5},
    {e:'✨',n:'Visualização ativa diária',d:'5 min pela manhã visualizando este sonho já realizado. Ativa o sistema de ativação reticular — seu cérebro começa a buscar oportunidades.',t:'Mentalidade',c:CP,p:4},
    {e:'🤝',n:'Declare seu sonho',d:'Compartilhar um objetivo com alguém de confiança aumenta em 65% a chance de realizá-lo. Tem alguém que pode te acompanhar?',t:'Accountability',c:CR,p:4},
    {e:'⚡',n:'Próxima ação em 2 minutos',d:'Qual a menor ação possível que você pode fazer hoje? Identifique agora — não amanhã.',t:'Ação imediata',c:CT,p:5},
    {e:'📊',n:'Retrospectiva mensal',d:'No último dia do mês: o que avançou, o que travou, o que muda. Ajuste o plano sem abandonar o sonho.',t:'Processo',c:CB,p:3},
    {e:'🆕',n:'Mais recursos chegando',d:'Notas diárias, gráfico de consistência, conquistas desbloqueáveis e integração com tarefas estão sendo desenvolvidos.',t:'Novidade',c:CP,p:1},
  ];
  const final=[...dyn,...fix].sort((a,b)=>b.p-a.p).slice(0,6);
  document.getElementById('hub-tips-grid').innerHTML=final.map(t=>
    `<div class="hub-tip-card" style="--tip-color:${t.c}">
      <div class="hub-tip-top">
        <div class="hub-tip-emoji">${t.e}</div>
        <span class="hub-tip-badge">${t.t}</span>
      </div>
      <div class="hub-tip-title">${t.n}</div>
      <div class="hub-tip-desc">${t.d}</div>
    </div>`
  ).join('');
}


// ── Meta actions ──────────────────────────────────────────────────────────
function hubToggleMetaForm() {
  const form = document.getElementById('hub-meta-form');
  const open = form.classList.toggle('open');
  if (open) {
    document.getElementById('hub-meta-texto').value   = '';
    document.getElementById('hub-meta-prazo').value   = '';
    document.getElementById('hub-meta-inicio').value  = '';
    document.getElementById('hub-meta-prioridade').value = 'media';
    setTimeout(() => document.getElementById('hub-meta-texto').focus(), 60);
  }
}

function hubAddMeta() {
  const texto = document.getElementById('hub-meta-texto').value.trim();
  if (!texto || !hubSonhoId) return;
  const s = snFind(hubSonhoId);
  if (!s) return;
  if (!s.metas) s.metas = [];
  s.metas.push({
    id:         snUid(s.metas),
    texto,
    feita:      false,
    prioridade: document.getElementById('hub-meta-prioridade').value,
    dataInicio: document.getElementById('hub-meta-inicio').value,
    prazo:      document.getElementById('hub-meta-prazo').value,
  });
  save();
  document.getElementById('hub-meta-form').classList.remove('open');
  hubRender(s);
  renderSonhos();
}

function snFlash(el) {
  if (!el) return;
  el.focus(); el.style.borderColor = 'rgba(224,107,139,.65)';
  setTimeout(function () { el.style.borderColor = ''; }, 1400);
}

function hubEditMeta(metaId) {
  const s = snFind(hubSonhoId); if (!s) return;
  hubEditMetaId = String(metaId);
  hubRenderMetaList(s);
}

function hubCancelMeta() {
  const s = snFind(hubSonhoId); hubEditMetaId = null;
  if (s) hubRenderMetaList(s);
}

function hubSaveMeta(metaId) {
  const s = snFind(hubSonhoId); if (!s) return;
  const m = (s.metas||[]).find(x => String(x.id) === String(metaId)); if (!m) return;
  const tEl = document.getElementById('hub-me-texto');
  const iEl = document.getElementById('hub-me-inicio');
  const pEl = document.getElementById('hub-me-prazo');
  const texto = (tEl ? tEl.value : '').trim();
  if (!texto) { snFlash(tEl); return; }
  const inicio = iEl ? iEl.value : '', prazo = pEl ? pEl.value : '';
  if (inicio && prazo && prazo < inicio) { snFlash(pEl); return; }
  m.texto = texto;
  m.prioridade = (document.getElementById('hub-me-prio') || {}).value || 'media';
  m.dataInicio = inicio;
  m.prazo = prazo;
  hubEditMetaId = null;
  save(); hubRender(s); renderSonhos();
}

function hubToggleMeta(metaId) {
  const s = snFind(hubSonhoId); if (!s) return;
  const m = (s.metas||[]).find(x => String(x.id) === String(metaId)); if (!m) return;
  m.feita = !m.feita;
  m.dataConclusao = m.feita ? new Date().toISOString() : '';
  save(); hubRender(s); renderSonhos();
}

function hubDelMeta(metaId) {
  const s = snFind(hubSonhoId); if (!s) return;
  s.metas = (s.metas||[]).filter(x => String(x.id) !== String(metaId));
  save(); hubRender(s); renderSonhos();
}

function hubToggleRealizado() {
  const s = snFind(hubSonhoId); if (!s) return;
  s.realizado = !s.realizado;
  s.realizadoAt = s.realizado ? new Date().toISOString() : '';
  if (s.realizado) addNotif('Sonho realizado! 🎉', '"'+s.titulo+'"', 'sonho');
  save(); hubRender(s); renderSonhos();
}

// ── Modal: usado SOMENTE para criar. A edição é feita no hub-drawer. ──────
let snImgData  = '';
let snModalMetas = [];

function snSetModalUiOpen(isOpen) {
  if (!document || !document.body) return;
  document.body.classList.toggle('sn-modal-open', !!isOpen);
}

function snOpenModal() {
  snImgData = ''; snModalMetas = []; snModalEditId = null;
  const modal     = document.getElementById('sn-modal');
  const coverZone = document.getElementById('sn-modal-cover-zone');
  const coverImg  = document.getElementById('sn-modal-cover-img');

  ['sn-m-titulo','sn-m-icon','sn-m-desc','sn-m-data-inicio','sn-m-data-fim','sn-m-custo','sn-m-acumulado','sn-m-nova-meta']
    .forEach(id => { const el=document.getElementById(id); if(el) el.value=''; });
  document.getElementById('sn-m-horizonte').value = '1 ano';
  document.getElementById('sn-m-categoria').value = 'pessoal';
  coverZone.classList.remove('has-img'); coverImg.src='';
  document.getElementById('sn-img-input').value='';
  document.getElementById('sn-img-web').value='';

  snRenderModalMetas();
  modal.classList.add('open');
  snSetModalUiOpen(true);
  setTimeout(()=>document.getElementById('sn-m-titulo').focus(),100);
}

function snCloseModal() {
  document.getElementById('sn-modal').classList.remove('open');
  snSetModalUiOpen(false);
}
function snCloseModalOutside(e) { if(e.target.id==='sn-modal') snCloseModal(); }

function snHandleImg(e) {
  const file=e.target.files[0]; if(!file) return;
  snCompressImage(file, function (dataUrl) {
    snImgData = dataUrl;
    document.getElementById('sn-modal-cover-img').src = snImgData;
    document.getElementById('sn-modal-cover-zone').classList.add('has-img');
  });
}

function snApplyWebImg() {
  const input = document.getElementById('sn-img-web');
  if (!String(input.value || '').trim()) return;
  const value = snSafeImg(input.value);
  if (!value) { alert('URL de imagem inválida. Use um endereço http(s).'); return; }
  snImgData = value;
  document.getElementById('sn-modal-cover-img').src = snImgData;
  document.getElementById('sn-modal-cover-zone').classList.add('has-img');
}

function snModalAddMeta() {
  const inp=document.getElementById('sn-m-nova-meta');
  const t=inp.value.trim(); if(!t) return;
  snModalMetas.push({id:snUid(snModalMetas),texto:t,feita:false,prioridade:'media',dataInicio:'',prazo:''});
  inp.value=''; snRenderModalMetas();
}
function snModalToggleMeta(id){const m=snModalMetas.find(x=>String(x.id)===String(id));if(m){m.feita=!m.feita;snRenderModalMetas();}}
function snModalDelMeta(id){snModalMetas=snModalMetas.filter(x=>String(x.id)!==String(id));if(String(snModalEditId)===String(id))snModalEditId=null;snRenderModalMetas();}
function snModalEditMeta(id){snModalEditId=String(id);snRenderModalMetas();}
function snModalCancelMeta(){snModalEditId=null;snRenderModalMetas();}
function snModalSaveMeta(id){
  const m=snModalMetas.find(x=>String(x.id)===String(id));if(!m)return;
  const inp=document.getElementById('sn-me-texto');
  const t=(inp?inp.value:'').trim();
  if(!t){snFlash(inp);return;}
  m.texto=t;snModalEditId=null;snRenderModalMetas();
}
function snRenderModalMetas(){
  const list=document.getElementById('sn-modal-metas-list');if(!list)return;
  if(!snModalMetas.length){list.innerHTML='';return;}
  list.innerHTML=snModalMetas.map(m=>
    String(m.id)===String(snModalEditId)?
    '<div class="sn-meta-item sn-meta-editing">'+
    '<input type="text" class="sn-me-input" id="sn-me-texto" value="'+snEsc(m.texto)+'" aria-label="Editar meta">'+
    '<button type="button" class="sn-me-btn" data-sn-act="modal-save-meta" data-sn-id="'+snEsc(m.id)+'">Salvar</button>'+
    '<button type="button" class="sn-me-btn ghost" data-sn-act="modal-cancel-meta">Cancelar</button>'+
    '</div>':
    '<div class="sn-meta-item">'+
    '<button type="button" class="sn-meta-check '+(m.feita?'done':'')+'" data-sn-act="modal-toggle-meta" data-sn-id="'+snEsc(m.id)+'" aria-label="'+(m.feita?'Desmarcar meta':'Concluir meta')+'">'+(m.feita?'✓':'')+'</button>'+
    '<span class="sn-meta-text '+(m.feita?'done':'')+'" data-sn-act="modal-edit-meta" data-sn-id="'+snEsc(m.id)+'" title="Clique duas vezes para editar">'+snEsc(m.texto)+'</span>'+
    '<button type="button" class="sn-meta-del" data-sn-act="modal-edit-meta" data-sn-id="'+snEsc(m.id)+'" aria-label="Editar meta" title="Editar">✎</button>'+
    '<button type="button" class="sn-meta-del" data-sn-act="modal-del-meta" data-sn-id="'+snEsc(m.id)+'" aria-label="Remover meta">✕</button>'+
    '</div>'
  ).join('');
  if(snModalEditId!==null){const ei=document.getElementById('sn-me-texto');if(ei){ei.focus();ei.setSelectionRange(ei.value.length,ei.value.length);}}
}

function snSalvar() {
  const titulo=document.getElementById('sn-m-titulo').value.trim();
  if(!titulo){document.getElementById('sn-m-titulo').focus();return;}
  const di=document.getElementById('sn-m-data-inicio');
  const df=document.getElementById('sn-m-data-fim');
  const item={
    id:snUid(S.sonhos), titulo,
    icon:document.getElementById('sn-m-icon').value.trim()||'🌙',
    horizonte:document.getElementById('sn-m-horizonte').value,
    categoria:document.getElementById('sn-m-categoria').value,
    desc:document.getElementById('sn-m-desc').value.trim(),
    dataInicio:di?di.value:'', dataFim:df?df.value:'',
    custo:num(document.getElementById('sn-m-custo').value),
    acumulado:num(document.getElementById('sn-m-acumulado').value),
    img:snImgData,
    metas:snModalMetas.map(m=>Object.assign({},m)),
    realizado:false,
    createdAt:new Date().toISOString(),
    realizadoAt:'',
    financeHistory:[],
  };
  S.sonhos.push(item);
  addNotif('Sonho adicionado','"'+titulo+'"','sonho');
  save(); renderSonhos(); snCloseModal();
}

function snToggleRealizado(id,e){
  if(e&&e.stopPropagation)e.stopPropagation();
  const s=snFind(id);if(!s)return;
  s.realizado=!s.realizado;
  s.realizadoAt = s.realizado ? new Date().toISOString() : '';
  if(s.realizado)addNotif('Sonho realizado! 🎉','"'+s.titulo+'"','sonho');
  save();snMigrateData();renderSonhos();
}
function snToggleMeta(sonhoId,metaId,e){
  if(e&&e.stopPropagation)e.stopPropagation();
  const s=snFind(sonhoId);if(!s)return;
  const m=(s.metas||[]).find(x=>String(x.id)===String(metaId));if(!m)return;
  m.feita=!m.feita;
  m.dataConclusao = m.feita ? new Date().toISOString() : '';
  save();renderSonhos();
}

// ── Render cards ──────────────────────────────────────────────────────────
function snInjectFinStyle() {
  if (document.getElementById('sn-fin-style')) return;
  const st = document.createElement('style');
  st.id = 'sn-fin-style';
  st.textContent =
    '.sn-fin-section{margin-top:10px}' +
    '.sn-fin-bar{margin-top:5px}' +
    '.sn-fin-fill{background:linear-gradient(90deg,var(--accent1),var(--accent3))!important;transition:width .6s ease}' +
    '.sn-fin-values{display:flex;justify-content:space-between;gap:8px;margin-top:5px;font-size:10px;font-family:var(--font-mono);color:var(--muted)}' +
    '.sn-fin-section + .sn-metas-section{margin-top:12px}' +
    '.hub-meta-name[data-sn-act],.sn-meta-text[data-sn-act]{cursor:text}' +
    '.sn-meta-editing{display:flex;gap:8px;align-items:center;width:100%}' +
    '.sn-meta-edit{display:flex;flex-direction:column;gap:10px;width:100%;padding:4px 0}' +
    '.sn-me-input,.sn-meta-edit select,.sn-meta-edit input[type=date]{background:rgba(255,255,255,.04);border:1px solid rgba(124,111,205,.35);border-radius:8px;color:inherit;font:inherit;font-size:13px;padding:8px 10px;outline:none;min-width:0}' +
    '.sn-me-input{flex:1;width:100%}' +
    '.sn-me-input:focus,.sn-meta-edit select:focus,.sn-meta-edit input[type=date]:focus{border-color:var(--accent2,#7c6fcd)}' +
    '.sn-me-row{display:flex;flex-wrap:wrap;gap:10px}' +
    '.sn-me-row label{display:flex;flex-direction:column;gap:4px;font-size:10px;font-family:var(--font-mono);color:var(--muted);text-transform:uppercase;letter-spacing:.5px;flex:1;min-width:120px}' +
    '.sn-me-actions{display:flex;justify-content:flex-end;gap:8px}' +
    '.sn-me-btn{background:var(--accent1,#c8a96e);color:#14121f;border:0;border-radius:8px;padding:7px 14px;font:inherit;font-size:12px;font-weight:600;cursor:pointer}' +
    '.sn-me-btn.ghost{background:transparent;color:var(--muted);border:1px solid rgba(122,117,144,.35)}';
  document.head.appendChild(st);
}

function renderSonhos() {
  snInjectFinStyle();
  snMigrateData();
  const grid=document.getElementById('sonhos-grid');if(!grid)return;
  const total    =S.sonhos.length;
  const feitos   =S.sonhos.filter(s=>s.realizado).length;
  const allMetas =S.sonhos.reduce((a,s)=>a+(s.metas||[]).length,0);
  const doneMetas=S.sonhos.reduce((a,s)=>a+(s.metas||[]).filter(m=>m.feita).length,0);
  const pctGeral =allMetas>0?Math.round(doneMetas/allMetas*100):0;
  const setEl=(id,v)=>{const el=document.getElementById(id);if(el)el.textContent=v;};
  setEl('sn-stat-total',total);setEl('sn-stat-feitos',feitos);
  setEl('sn-stat-metas',doneMetas+' / '+allMetas);setEl('sn-stat-pct',pctGeral+'%');

  if(!total){
    grid.innerHTML='<div class="empty" style="grid-column:span 3"><div class="empty-icon">🌙</div>Adicione seu primeiro sonho!</div>';
    return;
  }

  grid.innerHTML=S.sonhos.map(s=>{
    const id=snEsc(s.id), titulo=snEsc(s.titulo), icon=snEsc(s.icon||'🌙'), horizonte=snEsc(s.horizonte||'—');
    const img=snSafeImg(s.img);
    const metas=s.metas||[];
    const totalM=metas.length,doneM=metas.filter(m=>m.feita).length;
    const pct=totalM>0?Math.round(doneM/totalM*100):0;
    const catColor=SN_CAT_COLORS[s.categoria]||'var(--accent2)';
    const isReal=s.realizado;
    const metaRows=metas.slice(0,3).map(m=>
      '<div class="sn-meta-item">'+
      '<button type="button" class="sn-meta-check '+(m.feita?'done':'')+'" data-sn-act="toggle-card-meta" data-sn-id="'+id+'" data-sn-id2="'+snEsc(m.id)+'" aria-label="'+(m.feita?'Desmarcar meta':'Concluir meta')+'">'+(m.feita?'✓':'')+'</button>'+
      '<span class="sn-meta-text '+(m.feita?'done':'')+'">'+snEsc(m.texto)+'</span>'+
      '</div>'
    ).join('');
    const fi=buildFinanceInfo(s);
    const finPct=fi.custo>0?Math.min(100,Math.round(fi.atual/fi.custo*100)):0;
    const finHtml=fi.custo>0?
      '<div class="sn-fin-section">'+
        '<div class="sn-metas-header"><span class="sn-metas-label">💰 Meta financeira</span><span class="sn-metas-pct">'+finPct+'%</span></div>'+
        '<div class="sn-progress-bar sn-fin-bar"><div class="sn-progress-fill sn-fin-fill" style="width:'+finPct+'%"></div></div>'+
        '<div class="sn-fin-values"><span>'+snEsc(fmtBRL(fi.atual))+'</span><span>de '+snEsc(fmtBRL(fi.custo))+'</span></div>'+
      '</div>':'';
    const moreLabel=totalM>3?'<div style="font-size:10px;font-family:var(--font-mono);color:var(--muted);padding:3px 0 0 24px">+'+(totalM-3)+' mais…</div>':'';
    return '<div class="sn-card '+(isReal?'realizado':'')+'" data-sn-act="open-card" data-sn-id="'+id+'" tabindex="0" role="group" aria-haspopup="menu" aria-label="Sonho: '+titulo+'. Enter para abrir, tecla de menu para ações rápidas.">'+
      '<div class="sn-cover '+(img?'has-img':'')+'" style="border-bottom:2px solid '+catColor+'22">'+
        (img?'<img class="sn-cover-img" src="'+snEsc(img)+'" alt="">':'')+
        '<div class="sn-cover-placeholder"><div class="sn-cover-placeholder-icon">'+icon+'</div><div class="sn-cover-placeholder-label">Sem imagem</div></div>'+
        '<div class="sn-cover-overlay" style="background:linear-gradient(180deg,rgba(0,0,0,.05) 0%,'+(isReal?'rgba(10,30,24,.93)':'rgba(12,11,26,.93)')+' 100%)"></div>'+
        '<span class="sn-horizonte-badge">⏳ '+horizonte+'</span>'+
        (isReal?'<span class="sn-realizado-badge">✓ Realizado</span>':'')+
      '</div>'+
      '<div class="sn-body">'+
        '<div class="sn-top">'+
          '<div class="sn-titulo">'+titulo+'</div>'+
          '<div class="sn-actions" data-sn-act="noop">'+
            '<button type="button" class="sn-action-btn done-btn" data-sn-act="toggle-realizado" data-sn-id="'+id+'" title="'+(isReal?'Marcar como pendente':'Marcar como realizado')+'" aria-label="'+(isReal?'Marcar como pendente':'Marcar como realizado')+'" aria-pressed="'+(isReal?'true':'false')+'">'+(isReal?'✅':'○')+'</button>'+
            '<button type="button" class="sn-action-btn more-btn" data-sn-act="card-menu" data-sn-id="'+id+'" title="Ações rápidas" aria-label="Ações rápidas" aria-haspopup="menu">⋯</button>'+
          '</div>'+
        '</div>'+
        (s.desc?'<div class="sn-desc">'+snEsc(s.desc)+'</div>':'')+
        finHtml+
        (totalM>0?
          '<div class="sn-metas-section">'+
            '<div class="sn-metas-header"><span class="sn-metas-label">Metas</span><span class="sn-metas-pct">'+pct+'%</span></div>'+
            '<div class="sn-progress-bar"><div class="sn-progress-fill" style="width:'+pct+'%"></div></div>'+
            metaRows+moreLabel+
          '</div>'
        :(fi.custo>0?'':'<div style="font-size:11px;font-family:var(--font-mono);color:rgba(122,117,144,.35);letter-spacing:.5px;margin-top:4px">Clique para ver detalhes</div>'))+
      '</div>'+
      '<div class="sn-footer">'+
        '<span class="sn-footer-horizonte">'+icon+' '+horizonte+'</span>'+
        (totalM>0?'<span class="sn-footer-metas-count">'+doneM+'/'+totalM+'</span>':'')+
      '</div>'+
    '</div>';
  }).join('');

  const analytics = document.getElementById("sn-analytics");
  if (analytics && analytics.classList.contains("open")) sanRender();
}

// ══════════════════════════════════════════════════════════════════════════
// SONHOS ANALYTICS
// ══════════════════════════════════════════════════════════════════════════

function snOpenAnalytics() {
  const el = document.getElementById('sn-analytics');
  if (!el) return;
  el.classList.add('open');
  document.body.style.overflow = 'hidden';
  sanRender();
}
function snCloseAnalytics() {
  const el = document.getElementById('sn-analytics');
  if (!el) return;
  el.classList.remove('open');
  document.body.style.overflow = '';
}

function sanRender() {
  const sonhos = S.sonhos || [];
  const total  = sonhos.length;
  const kpiRow = document.getElementById('san-kpi-row');
  if (!kpiRow) return;
  if (!total) {
    kpiRow.innerHTML =
      '<div class="san-kpi" style="grid-column:1/-1;text-align:center;color:var(--muted);font-family:var(--font-mono);font-size:12px;padding:40px">Nenhum sonho cadastrado ainda. Adicione seus primeiros sonhos para ver os analytics!</div>';
    ['san-progress-bars','san-donut-legend','san-health-factors','san-deadline-list','san-horizonte-bars','san-metas-prio','san-top-progress']
      .forEach(id => { const el=document.getElementById(id); if(el) el.innerHTML=''; });
    return;
  }

  const realizados = sonhos.filter(s => s.realizado).length;
  const emAndamento = sonhos.filter(s => !s.realizado).length;
  const allMetas   = sonhos.flatMap(s => s.metas||[]);
  const totalMetas = allMetas.length;
  const doneMetas  = allMetas.filter(m => m.feita).length;
  const lateMetas  = allMetas.filter(m => snIsLate(m.prazo, m.feita)).length;
  const pctGeral   = total > 0 ? Math.round(
    sonhos.reduce((acc, s) => {
      const m = s.metas||[]; return acc + (m.length ? m.filter(x=>x.feita).length/m.length : 0);
    }, 0) / total * 100
  ) : 0;

  const kpis = [
    { lbl:'Total de sonhos',  val: total,       sub: realizados+' realizados', icon:'🌙', color:'rgba(124,111,205,.5)' },
    { lbl:'Em andamento',     val: emAndamento, sub: 'sonhos ativos',           icon:'⚡', color:'rgba(200,169,110,.5)' },
    { lbl:'Realizados',       val: realizados,  sub: total>0?Math.round(realizados/total*100)+'% do total':'',  icon:'✅', color:'rgba(94,196,168,.5)' },
    { lbl:'Metas concluídas', val: doneMetas,   sub: totalMetas+' no total',   icon:'◈',  color:'rgba(74,176,232,.5)' },
    { lbl:'Progresso geral',  val: pctGeral+'%',sub: lateMetas>0 ? lateMetas+' metas atrasadas':'Todas em dia', icon:'◎', color: lateMetas>0?'rgba(224,107,139,.5)':'rgba(94,196,168,.5)' },
  ];
  kpiRow.innerHTML = kpis.map(k =>
    `<div class="san-kpi" style="--kpi-color:${k.color}">
      <div class="san-kpi-icon">${k.icon}</div>
      <div class="san-kpi-lbl">${k.lbl}</div>
      <div class="san-kpi-val">${k.val}</div>
      <div class="san-kpi-sub">${k.sub}</div>
    </div>`
  ).join('');

  const progressData = sonhos.map(s => {
    const m = s.metas||[];
    const pct = m.length ? Math.round(m.filter(x=>x.feita).length/m.length*100) : 0;
    return { nome: s.titulo, icon: s.icon||'🌙', pct, cat: s.categoria||'pessoal', real: s.realizado };
  }).sort((a,b) => b.pct - a.pct).slice(0, 8);

  const pbEl = document.getElementById('san-progress-bars');
  if (pbEl) {
    pbEl.innerHTML = progressData.map(d => {
      const color = SN_CAT_COLORS[d.cat] || '#7c6fcd';
      const fill  = d.real ? 'rgba(94,196,168,.6)' : color;
      return `<div class="san-bar-item">
        <div class="san-bar-label">${snEsc(d.icon)} ${snEsc(d.nome)}</div>
        <div class="san-bar-track"><div class="san-bar-fill" style="width:0%;background:${fill}" data-w="${d.pct}"></div></div>
        <div class="san-bar-val">${d.pct}%</div>
      </div>`;
    }).join('');
    setTimeout(() => pbEl.querySelectorAll('.san-bar-fill').forEach(el => el.style.width = el.dataset.w+'%'), 80);
  }

  const catCount = {};
  sonhos.forEach(s => { const c2 = s.categoria||'pessoal'; catCount[c2] = (catCount[c2]||0)+1; });
  const catEntries = Object.entries(catCount).sort((a,b)=>b[1]-a[1]);
  const donutR = 44, donutCx = 65, donutCy = 65, strokeW = 18;
  const circum = 2*Math.PI*donutR;
  let offset = 0;
  const donutSegs = catEntries.map(([cat, cnt]) => {
    const pct  = cnt / total;
    const dash = pct * circum;
    const seg  = { cat, cnt, pct, dash, offset };
    offset += dash;
    return seg;
  });
  const svgEl = document.getElementById('san-donut-svg');
  if (svgEl) {
    svgEl.innerHTML = `<circle cx="${donutCx}" cy="${donutCy}" r="${donutR}" fill="none" stroke="rgba(255,255,255,.04)" stroke-width="${strokeW}"/>` +
      donutSegs.map(seg => {
        const color = SN_CAT_COLORS[seg.cat] || '#7c6fcd';
        return `<circle cx="${donutCx}" cy="${donutCy}" r="${donutR}" fill="none"
          stroke="${color}" stroke-width="${strokeW}"
          stroke-dasharray="${seg.dash} ${circum - seg.dash}"
          stroke-dashoffset="${circum - seg.offset}"
          transform="rotate(-90 ${donutCx} ${donutCy})"
          opacity=".85"/>`;
      }).join('') +
      `<text x="${donutCx}" y="${donutCy-3}" text-anchor="middle" fill="var(--text)" font-family="var(--font-display)" font-size="20" font-weight="700">${total}</text>
       <text x="${donutCx}" y="${donutCy+13}" text-anchor="middle" fill="var(--muted)" font-family="var(--font-mono)" font-size="9" letter-spacing="1">sonhos</text>`;
  }
  const legendEl = document.getElementById('san-donut-legend');
  if (legendEl) {
    legendEl.className = 'san-donut-legend';
    legendEl.innerHTML = catEntries.slice(0, 6).map(([cat, cnt]) =>
      `<div class="san-legend-item">
        <div class="san-legend-dot" style="background:${SN_CAT_COLORS[cat]||'#7c6fcd'}"></div>
        <span class="san-legend-lbl">${snEsc(SN_CAT_LABELS[cat]||cat)}</span>
        <span class="san-legend-val">${cnt}</span>
      </div>`
    ).join('');
  }

  const factors = [
    { lbl:'Com imagem de capa', score: sonhos.filter(s=>!!s.img).length/total, color:'rgba(200,169,110,.7)' },
    { lbl:'Com descrição',      score: sonhos.filter(s=>!!s.desc).length/total, color:'rgba(124,111,205,.7)' },
    { lbl:'Com metas definidas',score: sonhos.filter(s=>(s.metas||[]).length>0).length/total, color:'rgba(74,176,232,.7)' },
    { lbl:'Com prazo definido', score: sonhos.filter(s=>!!s.dataFim).length/total, color:'rgba(94,196,168,.7)' },
    { lbl:'Sem metas atrasadas',score: sonhos.filter(s=>!(s.metas||[]).some(m=>snIsLate(m.prazo,m.feita))).length/total, color:'rgba(232,134,74,.7)' },
  ];
  const healthScore = Math.round(factors.reduce((a,f)=>a+f.score,0)/factors.length*100);
  const healthColor = healthScore >= 80 ? 'rgba(94,196,168,.8)' : healthScore >= 50 ? 'rgba(200,169,110,.8)' : 'rgba(224,107,139,.8)';
  const healthLabel = healthScore >= 80 ? 'Excelente' : healthScore >= 60 ? 'Bom' : healthScore >= 40 ? 'Regular' : 'Atenção';

  const hsvg = document.getElementById('san-health-svg');
  if (hsvg) {
    const hR = 36, hCx = 45, hCy = 45, hW = 10, hCirc = 2*Math.PI*hR;
    hsvg.innerHTML =
      `<circle cx="${hCx}" cy="${hCy}" r="${hR}" fill="none" stroke="rgba(255,255,255,.05)" stroke-width="${hW}"/>` +
      `<circle cx="${hCx}" cy="${hCy}" r="${hR}" fill="none" stroke="${healthColor}" stroke-width="${hW}"
        stroke-dasharray="${healthScore/100*hCirc} ${hCirc}"
        stroke-dashoffset="${hCirc/4}"
        transform="rotate(-90 ${hCx} ${hCy})"
        style="transition:stroke-dasharray 1.3s cubic-bezier(.22,1,.36,1)"/>` +
      `<text x="${hCx}" y="${hCy-2}" text-anchor="middle" fill="var(--text)" font-family="var(--font-display)" font-size="16" font-weight="700">${healthScore}</text>
       <text x="${hCx}" y="${hCy+12}" text-anchor="middle" fill="${healthColor}" font-family="var(--font-mono)" font-size="8">${healthLabel}</text>`;
  }
  const hfEl = document.getElementById('san-health-factors');
  if (hfEl) {
    hfEl.innerHTML = factors.map(f =>
      `<div class="san-health-factor">
        <div class="san-health-factor-row">
          <span class="san-health-factor-lbl">${f.lbl}</span>
          <span class="san-health-factor-val">${Math.round(f.score*100)}%</span>
        </div>
        <div class="san-health-bar"><div class="san-health-fill" style="width:0%;background:${f.color}" data-w="${f.score*100}"></div></div>
      </div>`
    ).join('');
    const lbl = document.getElementById('san-score-lbl');
    if (lbl) lbl.textContent = healthLabel;
    setTimeout(() => hfEl.querySelectorAll('.san-health-fill').forEach(el => el.style.width = el.dataset.w+'%'), 100);
  }

  const comPrazo = sonhos.filter(s => s.dataFim && !s.realizado)
    .map(s => ({ ...s, diff: snDaysDiff(s.dataFim) }))
    .sort((a,b) => a.diff - b.diff)
    .slice(0, 5);
  const dlEl = document.getElementById('san-deadline-list');
  if (dlEl) {
    if (!comPrazo.length) { dlEl.innerHTML = '<div style="color:var(--muted);font-size:12px;font-family:var(--font-mono)">Nenhum sonho com prazo definido.</div>'; }
    else dlEl.innerHTML = comPrazo.map((s, i) => {
      const diff = s.diff;
      const diffTxt = diff < 0 ? `${Math.abs(diff)}d atrasado` : diff === 0 ? 'Vence hoje' : `${diff}d restantes`;
      const diffColor = diff < 0 ? 'var(--accent4)' : diff <= 7 ? 'var(--accent1)' : 'var(--muted)';
      const metas = s.metas||[];
      const pct   = metas.length ? Math.round(metas.filter(m=>m.feita).length/metas.length*100) : 0;
      return `<div class="san-rank-item" data-sn-act="open-analytics-dream" data-sn-id="${snEsc(s.id)}">
        <div class="san-rank-pos">${i+1}</div>
        <div class="san-rank-icon">${snEsc(s.icon||'🌙')}</div>
        <div class="san-rank-info">
          <div class="san-rank-name">${snEsc(s.titulo)}</div>
          <div class="san-rank-meta" style="color:${diffColor}">${diffTxt}</div>
        </div>
        <div class="san-rank-pct" style="color:${SN_CAT_COLORS[s.categoria]||'#7c6fcd'}">${pct}%</div>
      </div>`;
    }).join('');
  }

  const horizMap = {};
  sonhos.forEach(s => { const h = s.horizonte||'Longo prazo'; horizMap[h]=(horizMap[h]||0)+1; });
  const hOrder = ['1 ano','3 anos','5 anos','10 anos','Longo prazo'];
  const hEntries = hOrder.filter(h=>horizMap[h]).map(h=>[h,horizMap[h]]);
  const maxH = Math.max(...hEntries.map(e=>e[1]), 1);
  const hEl = document.getElementById('san-horizonte-bars');
  if (hEl) {
    hEl.innerHTML = hEntries.map(([h,n]) =>
      `<div class="san-bar-item">
        <div class="san-bar-label" style="width:90px">⏳ ${h}</div>
        <div class="san-bar-track"><div class="san-bar-fill" style="width:0%;background:rgba(124,111,205,.6)" data-w="${n/maxH*100}"></div></div>
        <div class="san-bar-val">${n}</div>
      </div>`
    ).join('');
    setTimeout(() => hEl.querySelectorAll('.san-bar-fill').forEach(el => el.style.width = el.dataset.w+'%'), 120);
  }

  const prioMap = {alta:0, media:0, baixa:0};
  allMetas.forEach(m => { prioMap[m.prioridade||'media']++; });
  const maxPr = Math.max(...Object.values(prioMap), 1);
  const prioColors = {alta:'rgba(224,107,139,.6)',media:'rgba(200,169,110,.6)',baixa:'rgba(94,196,168,.6)'};
  const prioLabels = {alta:'🔴 Alta prioridade',media:'🟡 Média prioridade',baixa:'🟢 Baixa prioridade'};
  const mpEl = document.getElementById('san-metas-prio');
  if (mpEl) {
    mpEl.innerHTML = ['alta','media','baixa'].map(p =>
      `<div class="san-bar-item">
        <div class="san-bar-label">${prioLabels[p]}</div>
        <div class="san-bar-track"><div class="san-bar-fill" style="width:0%;background:${prioColors[p]}" data-w="${prioMap[p]/maxPr*100}"></div></div>
        <div class="san-bar-val">${prioMap[p]}</div>
      </div>`
    ).join('');
    setTimeout(() => mpEl.querySelectorAll('.san-bar-fill').forEach(el => el.style.width = el.dataset.w+'%'), 140);
  }

  const tpEl = document.getElementById('san-top-progress');
  if (tpEl) {
    const ranked = sonhos.map(s => {
      const m = s.metas||[];
      const pct = m.length ? Math.round(m.filter(x=>x.feita).length/m.length*100) : 0;
      return { ...s, pct };
    }).sort((a,b)=>b.pct-a.pct).slice(0,5);
    tpEl.innerHTML = ranked.map((s,i) =>
      `<div class="san-rank-item" data-sn-act="open-analytics-dream" data-sn-id="${snEsc(s.id)}">
        <div class="san-rank-pos">${i+1}</div>
        <div class="san-rank-icon">${snEsc(s.icon||'🌙')}</div>
        <div class="san-rank-info">
          <div class="san-rank-name">${snEsc(s.titulo)}</div>
          <div class="san-rank-meta">${snEsc(SN_CAT_LABELS[s.categoria]||s.categoria)} · ${snEsc(s.horizonte||'—')}</div>
        </div>
        <div class="san-rank-pct" style="color:${s.realizado?'var(--accent3)':SN_CAT_COLORS[s.categoria]||'#7c6fcd'}">${s.pct}%</div>
      </div>`
    ).join('');
  }

  // ── Risco de atraso (preditivo) ────────────────────────────────────────
  const riskWrap = document.getElementById('san-risk-list');
  if (riskWrap) {
    const today = new Date(); today.setHours(0,0,0,0);
    const riskData = sonhos.filter(s => !s.realizado).map(s => {
      const metas = s.metas || [];
      const progresso = metas.length ? Math.round(metas.filter(m => m.feita).length / metas.length * 100) : 0;
      let elapsed = 0;
      let score = 0;
      if (s.dataInicio && s.dataFim) {
        const ini = new Date(s.dataInicio + 'T00:00:00');
        const fim = new Date(s.dataFim + 'T00:00:00');
        const span = Math.max(1, (fim - ini));
        elapsed = Math.max(0, Math.min(100, Math.round(((today - ini) / span) * 100)));
        score = Math.max(0, elapsed - progresso);
        if (today > fim) score += 45;
      } else if (s.dataFim) {
        score = Math.max(0, 30 - Math.max(0, snDaysDiff(s.dataFim)));
      } else {
        score = 5;
      }
      let label = 'Baixo';
      let cls = 'risk-low';
      if (score >= 45) { label = 'Alto'; cls = 'risk-high'; }
      else if (score >= 20) { label = 'Médio'; cls = 'risk-mid'; }
      return { sonho: s, progresso, score, label, cls };
    }).sort((a,b)=>b.score-a.score).slice(0,5);

    riskWrap.innerHTML = !riskData.length
      ? '<div style="color:var(--muted);font-size:12px;font-family:var(--font-mono)">Sem sonhos ativos para análise de risco.</div>'
      : riskData.map((r, i) =>
        `<div class="san-rank-item" data-sn-act="open-analytics-dream" data-sn-id="${snEsc(r.sonho.id)}">
          <div class="san-rank-pos">${i+1}</div>
          <div class="san-rank-icon">${snEsc(r.sonho.icon||'🌙')}</div>
          <div class="san-rank-info">
            <div class="san-rank-name">${snEsc(r.sonho.titulo)}</div>
            <div class="san-rank-meta">Progresso ${r.progresso}%</div>
          </div>
          <span class="risk-chip ${r.cls}">${r.label}</span>
        </div>`
      ).join('');
  }

  // ── Meta financeira integrada ──────────────────────────────────────────
  const financeWrap = document.getElementById('san-finance-list');
  if (financeWrap) {
    const money = sonhos.filter(s => num(s.custo) > 0).map(s => {
      const fi = buildFinanceInfo(s);
      return { sonho: s, restante: fi.restante, media: fi.media, meses: fi.mesesPrev };
    }).sort((a,b)=>b.restante-a.restante).slice(0,5);

    financeWrap.innerHTML = !money.length
      ? '<div style="color:var(--muted);font-size:12px;font-family:var(--font-mono)">Defina custo no sonho para ver projeções financeiras.</div>'
      : money.map((m, i) => {
        const restTxt = 'R$ ' + m.restante.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const prevTxt = m.meses === null ? 'sem histórico' : (m.meses + ' mes(es)');
        return `<div class="san-rank-item" data-sn-act="open-analytics-dream" data-sn-id="${snEsc(m.sonho.id)}">
          <div class="san-rank-pos">${i+1}</div>
          <div class="san-rank-icon">${snEsc(m.sonho.icon||'🌙')}</div>
          <div class="san-rank-info">
            <div class="san-rank-name">${snEsc(m.sonho.titulo)}</div>
            <div class="san-rank-meta">Falta ${restTxt} • previsão: ${prevTxt}</div>
          </div>
          <div class="san-rank-pct" style="color:var(--accent1)">${m.media>0 ? 'R$ '+m.media.toLocaleString('pt-BR', { maximumFractionDigits: 0 }) : '—'}</div>
        </div>`;
      }).join('');
  }

  // ── Resumo mensal automático ───────────────────────────────────────────
  const monthWrap = document.getElementById('san-month-summary');
  if (monthWrap) {
    const now = new Date();
    const m0 = new Date(now.getFullYear(), now.getMonth(), 1);
    const m1 = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const metasMes = sonhos.reduce((acc, s) => acc + (s.metas||[]).filter(m => m.dataConclusao && new Date(m.dataConclusao) >= m0 && new Date(m.dataConclusao) < m1).length, 0);
    const sonhosMes = sonhos.filter(s => s.createdAt && new Date(s.createdAt) >= m0 && new Date(s.createdAt) < m1).length;
    const realizadosMes = sonhos.filter(s => s.realizadoAt && new Date(s.realizadoAt) >= m0 && new Date(s.realizadoAt) < m1).length;
    const criticos = sonhos.filter(s => !s.realizado && s.dataFim).filter(s => {
      const d = snDaysDiff(s.dataFim);
      return d >= 0 && d <= 30;
    }).length;

    monthWrap.innerHTML =
      `<div class="san-summary-item">
        <div class="san-summary-title">Metas concluídas no mês</div>
        <div class="san-summary-value">${metasMes}</div>
      </div>
      <div class="san-summary-item">
        <div class="san-summary-title">Sonhos criados no mês</div>
        <div class="san-summary-value">${sonhosMes}</div>
      </div>
      <div class="san-summary-item">
        <div class="san-summary-title">Sonhos realizados no mês</div>
        <div class="san-summary-value">${realizadosMes}</div>
      </div>
      <div class="san-summary-item">
        <div class="san-summary-title">Prazos críticos (30 dias)</div>
        <div class="san-summary-value" style="color:${criticos>0?'var(--accent4)':'var(--accent3)'}">${criticos}</div>
      </div>`;
  }
}


// ══════════════════════════════════════════════════════════════════════════
// AÇÕES RÁPIDAS (clique direito, botão ⋯, toque longo e teclado)
// ══════════════════════════════════════════════════════════════════════════
let snCtxEl = null;
let snCtxAuto = false;          // fecha ao sair com o mouse (só quando aberto por mouse)
let snCtxReturnFocus = null;
let snSuppressClickUntil = 0;

function snCtxClose(restoreFocus) {
  if (!snCtxEl) return;
  snCtxEl.remove(); snCtxEl = null; snCtxAuto = false;
  const rf = snCtxReturnFocus; snCtxReturnFocus = null;
  if (restoreFocus === true && rf && document.contains(rf)) rf.focus({ preventScroll: true });
}
function snCtxCloseSoft() { snCtxClose(false); }

function snCtxShow(x, y, items, title, opts) {
  opts = opts || {};
  snCtxClose();
  snCtxAuto = !!opts.auto;
  snCtxReturnFocus = opts.returnFocus || null;
  const el = document.createElement('div');
  el.className = 'tk-quick-actions open';
  el.setAttribute('role', 'menu');
  el.innerHTML =
    '<div class="tk-quick-actions-head">' +
      '<div class="tk-quick-actions-kicker">Ações rápidas</div>' +
      '<div class="tk-quick-actions-title">' + snEsc(title) + '</div>' +
    '</div>' +
    '<div class="tk-quick-actions-list">' +
    items.map(function (it, i) {
      return '<button type="button" role="menuitem" class="tk-quick-action-btn' + (it.danger ? ' danger' : '') + '" data-i="' + i + '">' +
        snEsc(it.label) + '</button>';
    }).join('') +
    '</div>';
  document.body.appendChild(el);
  snCtxEl = el;

  el.addEventListener('click', function (e) {
    const btn = e.target.closest('.tk-quick-action-btn'); if (!btn) return;
    const it = items[Number(btn.dataset.i)];
    snCtxClose();
    if (it && it.action) it.action();
  });
  el.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  el.addEventListener('keydown', function (e) {
    const btns = Array.prototype.slice.call(el.querySelectorAll('.tk-quick-action-btn'));
    const i = btns.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); btns[(i + 1) % btns.length].focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); btns[(i - 1 + btns.length) % btns.length].focus(); }
    else if (e.key === 'Home') { e.preventDefault(); btns[0].focus(); }
    else if (e.key === 'End') { e.preventDefault(); btns[btns.length - 1].focus(); }
    else if (e.key === 'Escape' || e.key === 'Tab') { e.preventDefault(); e.stopPropagation(); snCtxClose(true); }
  });

  // posiciona dentro da viewport mantendo o cursor SEMPRE dentro do menu
  const r = el.getBoundingClientRect();
  const pad = 8, inset = 10;
  let nx = x - inset, ny = y - inset;
  nx = Math.max(pad, Math.min(nx, window.innerWidth  - r.width  - pad));
  ny = Math.max(pad, Math.min(ny, window.innerHeight - r.height - pad));
  if (x < nx + 2) nx = x - 2;
  if (x > nx + r.width - 2) nx = x - r.width + 2;
  if (y < ny + 2) ny = y - 2;
  if (y > ny + r.height - 2) ny = y - r.height + 2;
  el.style.left = nx + 'px';
  el.style.top  = ny + 'px';

  if (opts.focusFirst) { const b = el.querySelector('.tk-quick-action-btn'); if (b) b.focus({ preventScroll: true }); }
}

function snCtxCardActions(id) {
  const s = snFind(id);
  if (!s) return [];
  return [
    { label: 'Abrir sonho', action: function () { snOpenHub(s.id); } },
    { label: 'Editar', action: function () { snOpenHub(s.id); hubDrawerOpen(); } },
    { label: s.realizado ? 'Marcar como pendente' : 'Marcar como realizado',
      action: function () { snToggleRealizado(s.id); } },
    { label: 'Excluir', danger: true,
      action: function () {
        if (!confirm('Excluir "' + s.titulo + '"? Esta ação não pode ser desfeita.')) return;
        S.sonhos = S.sonhos.filter(function (x) { return String(x.id) !== String(s.id); });
        save(); renderSonhos();
      } }
  ];
}

function snCtxOpenForCard(id, x, y, opts) {
  const s = snFind(id); if (!s) return;
  snCtxShow(x, y, snCtxCardActions(s.id), s.titulo, opts);
}

function snCtxPointFromEl(el) {
  const r = el.getBoundingClientRect();
  return { x: r.left + Math.min(r.width / 2, 48), y: r.top + Math.min(r.height / 2, 32) };
}

function snCtxIsBlocked() {
  const open = function (id) { const el = document.getElementById(id); return el && el.classList.contains('open'); };
  return open('sn-hub') || open('sn-analytics') || open('sn-modal');
}

function snInitInteractions() {
  // ── cliques (delegação: sem onclick inline nem ids dentro de strings) ──
  document.addEventListener('click', function (e) {
    const el = e.target.closest && e.target.closest('[data-sn-act]');
    if (!el) return;
    const act = el.dataset.snAct, id = el.dataset.snId, id2 = el.dataset.snId2;
    switch (act) {
      case 'noop': return;
      case 'open-card':
        if (Date.now() < snSuppressClickUntil) return;
        snOpenHub(id); return;
      case 'toggle-realizado':     snToggleRealizado(id); return;
      case 'toggle-card-meta':     snToggleMeta(id, id2); return;
      case 'card-menu': {
        const kb = e.detail === 0;                       // ativado por teclado
        const r = el.getBoundingClientRect();
        snCtxOpenForCard(id, kb ? r.left + r.width / 2 : e.clientX, kb ? r.bottom - 4 : e.clientY,
          { auto: !kb, focusFirst: kb, returnFocus: el });
        return;
      }
      case 'hub-edit-meta':
        if (!el.classList.contains('hub-meta-name')) hubEditMeta(id);   // o nome só edita no duplo clique
        return;
      case 'hub-save-meta':        hubSaveMeta(id); return;
      case 'hub-cancel-meta':      hubCancelMeta(); return;
      case 'modal-edit-meta':
        if (!el.classList.contains('sn-meta-text')) snModalEditMeta(id);
        return;
      case 'modal-save-meta':      snModalSaveMeta(id); return;
      case 'modal-cancel-meta':    snModalCancelMeta(); return;
      case 'hub-toggle-meta':      hubToggleMeta(id); return;
      case 'hub-del-meta':         hubDelMeta(id); return;
      case 'hub-add-deposito':     hubAddDeposito(); return;
      case 'hub-del-deposito':     hubDelDeposito(id); return;
      case 'modal-toggle-meta':    snModalToggleMeta(id); return;
      case 'modal-del-meta':       snModalDelMeta(id); return;
      case 'open-analytics-dream': snOpenHub(id); snCloseAnalytics(); return;
    }
  });

  // ── duplo clique no texto da meta = editar ──
  document.addEventListener('dblclick', function (e) {
    const el = e.target.closest && e.target.closest('.hub-meta-name[data-sn-id], .sn-meta-text[data-sn-id]');
    if (!el) return;
    if (el.classList.contains('hub-meta-name')) hubEditMeta(el.dataset.snId);
    else snModalEditMeta(el.dataset.snId);
  });

  // ── Enter salva / Esc cancela dentro dos campos de edição de meta ──
  document.addEventListener('keydown', function (e) {
    const t = e.target;
    if (!t || !t.closest || !t.closest('.sn-meta-editing')) return;
    const inModal = !!t.closest('#sn-modal');
    if (e.key === 'Enter' && t.tagName === 'INPUT') {
      e.preventDefault();
      if (inModal) snModalSaveMeta(snModalEditId); else hubSaveMeta(hubEditMetaId);
    } else if (e.key === 'Escape') {
      e.preventDefault(); e.stopImmediatePropagation();
      if (inModal) snModalCancelMeta(); else hubCancelMeta();
    }
  }, true);

  // ── clique direito (e tecla de menu) ──
  document.addEventListener('contextmenu', function (e) {
    if (snCtxIsBlocked()) { snCtxClose(); return; }
    const t = e.target;
    if (!t || !t.closest) return;
    if (t.closest('input, textarea, select')) return;      // mantém o menu nativo nos campos
    const card = t.closest('.sn-card[data-sn-id]');
    if (!card) { snCtxClose(); return; }
    e.preventDefault();
    const mouse = e.button === 2 || e.ctrlKey || e.pointerType === 'mouse';
    if (snCtxEl && (!mouse || Date.now() < snSuppressClickUntil)) return;   // já aberto (toque longo / teclado)
    let x = e.clientX, y = e.clientY;
    if (!x && !y) { const p = snCtxPointFromEl(card); x = p.x; y = p.y; }
    snCtxOpenForCard(card.dataset.snId, x, y,
      { auto: mouse, focusFirst: !mouse && document.activeElement === card, returnFocus: card });
  });

  // ── teclado no card: Enter/Espaço abrem; tecla de menu / Shift+F10 = ações rápidas ──
  document.addEventListener('keydown', function (e) {
    const card = e.target && e.target.classList && e.target.classList.contains('sn-card') ? e.target : null;
    if (!card) return;
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); snOpenHub(card.dataset.snId); }
    else if (e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) {
      e.preventDefault();
      const p = snCtxPointFromEl(card);
      snCtxOpenForCard(card.dataset.snId, p.x, p.y, { auto: false, focusFirst: true, returnFocus: card });
    }
  });

  // ── toque longo (celular) ──
  let lpTimer = null, lpX = 0, lpY = 0;
  document.addEventListener('pointerdown', function (e) {
    if (snCtxEl && !snCtxEl.contains(e.target)) snCtxClose();   // clique/toque fora fecha
    if (e.pointerType !== 'touch') return;
    const card = e.target.closest && e.target.closest('.sn-card[data-sn-id]');
    if (!card || snCtxIsBlocked()) return;
    lpX = e.clientX; lpY = e.clientY;
    clearTimeout(lpTimer);
    lpTimer = setTimeout(function () {
      lpTimer = null;
      snSuppressClickUntil = Date.now() + 700;
      snCtxOpenForCard(card.dataset.snId, lpX, lpY, { auto: false });
      if (navigator.vibrate) navigator.vibrate(10);
    }, 550);
  });
  ['pointerup', 'pointercancel'].forEach(function (ev) {
    document.addEventListener(ev, function () { clearTimeout(lpTimer); lpTimer = null; });
  });
  document.addEventListener('pointermove', function (e) {
    if (lpTimer && (Math.abs(e.clientX - lpX) > 10 || Math.abs(e.clientY - lpY) > 10)) {
      clearTimeout(lpTimer); lpTimer = null;
    }
  });

  // ── saiu da área do popup (aberto por mouse) → fecha sozinho ──
  document.addEventListener('mousemove', function (e) {
    if (!snCtxEl || !snCtxAuto) return;
    const r = snCtxEl.getBoundingClientRect();
    const inside = e.clientX >= r.left && e.clientX <= r.right &&
                   e.clientY >= r.top  && e.clientY <= r.bottom;
    if (!inside) snCtxClose();
  });
  document.addEventListener('mouseleave', function () { if (snCtxAuto) snCtxClose(); });
  window.addEventListener('scroll', snCtxCloseSoft, true);
  window.addEventListener('resize', snCtxCloseSoft);
  window.addEventListener('blur', snCtxCloseSoft);
}

(function initSonhosPage() {
  const app = getAppState();
  if (app && app.data) {
    app.data.lastVisitedPage = "sonhos";
    app.data.lastVisitedAt = new Date().toISOString();
    saveAppState(app);
  }

  load();
  renderSonhos();
  snInitInteractions();

  const pendingDreamId = sessionStorage.getItem(DREAM_OPEN_KEY);
  if (pendingDreamId) {
    sessionStorage.removeItem(DREAM_OPEN_KEY);
    setTimeout(function () {
      const exists = S.sonhos.find(function (sonho) { return String(sonho.id) === String(pendingDreamId); });
      if (exists) snOpenHub(pendingDreamId);
    }, 80);
  }

  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    if (snCtxEl) { snCtxClose(true); return; }
    const drawer = document.getElementById('hub-drawer');
    if (drawer && drawer.classList.contains('open')) { hubDrawerRequestClose(); return; }
    snCloseModal();
    snCloseAnalytics();
  });
}());

Object.assign(globalThis, {
  snOpenModal: snOpenModal,
  snCloseModal: snCloseModal,
  snCloseModalOutside: snCloseModalOutside,
  snHandleImg: snHandleImg,
  snApplyWebImg: snApplyWebImg,
  snModalAddMeta: snModalAddMeta,
  snModalToggleMeta: snModalToggleMeta,
  snModalDelMeta: snModalDelMeta,
  snSalvar: snSalvar,
  snOpenHub: snOpenHub,
  snHubClose: snHubClose,
  snOpenAnalytics: snOpenAnalytics,
  snCloseAnalytics: snCloseAnalytics,
  snToggleRealizado: snToggleRealizado,
  snToggleMeta: snToggleMeta,
  hubDrawerOpen: hubDrawerOpen,
  hubDrawerClose: hubDrawerClose,
  hubDrawerRequestClose: hubDrawerRequestClose,
  hubDrawerRemoveImg: hubDrawerRemoveImg,
  hubDrawerHandleImg: hubDrawerHandleImg,
  hubDrawerApplyWebImg: hubDrawerApplyWebImg,
  hubDrawerSalvar: hubDrawerSalvar,
  hubDrawerDeletar: hubDrawerDeletar,
  hubToggleMetaForm: hubToggleMetaForm,
  hubAddMeta: hubAddMeta,
  hubEditMeta: hubEditMeta,
  hubSaveMeta: hubSaveMeta,
  hubCancelMeta: hubCancelMeta,
  snModalEditMeta: snModalEditMeta,
  snModalSaveMeta: snModalSaveMeta,
  snModalCancelMeta: snModalCancelMeta,
  hubAddDeposito: hubAddDeposito,
  hubDelDeposito: hubDelDeposito,
  hubToggleMeta: hubToggleMeta,
  hubDelMeta: hubDelMeta,
  hubToggleRealizado: hubToggleRealizado
});
