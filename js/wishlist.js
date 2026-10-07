(function () {
  "use strict";

  var STORAGE_KEY = "wishlistTracker";
  var LEGACY_KEYS = ["wishlist-v2", "wishlist"];
  var W = [];
  var listGroups = [];
  var acquisitionHistory = [];
  var goalData = { saved: 0, goal: 0 };
  var editIdx = -1;
  var editListGroupId = null;
  var activeTab = "wishlist";
  var activeListGroupId = null;
  var historyRange = "1m";
  var ITEMS_PER_PAGE = 50;
  var pageState = {
    wishlist: 1,
    listas: 1
  };
  var DEFAULT_FILTERS = {
    sort: "priority-desc",
    status: "all",
    priority: "all",
    category: "all"
  };
  var filters = {
    applied: {
      sort: DEFAULT_FILTERS.sort,
      status: DEFAULT_FILTERS.status,
      priority: DEFAULT_FILTERS.priority,
      category: DEFAULT_FILTERS.category
    },
    pending: {
      sort: DEFAULT_FILTERS.sort,
      status: DEFAULT_FILTERS.status,
      priority: DEFAULT_FILTERS.priority,
      category: DEFAULT_FILTERS.category
    }
  };

  var CATS = {
    Tecnologia: "\uD83D\uDCBB",
    Roupas: "\uD83D\uDC57",
    Livros: "\uD83D\uDCDA",
    Games: "\uD83C\uDFAE",
    Casa: "\uD83C\uDFE0",
    Esporte: "\u26BD",
    Outros: "\u2728"
  };

  var PRIO_ORDER = { alta: 0, media: 1, baixa: 2 };
  var BADGE_LABELS = {
    alta: "Alta Prior.",
    media: "Media Prior.",
    baixa: "Baixa Prior."
  };
  var ADD_BUTTON_HTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg> Adicionar';
  var SAVE_BUTTON_HTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v14a2 2 0 01-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg> Salvar';
  var DEFAULT_LIST_GROUPS = [
    {
      id: "quarto",
      name: "Quarto",
      icon: "\uD83D\uDECF",
      description: "Itens e ideias para o meu quarto",
      itemIds: []
    }
  ];

  function st() {
    return window.SoterStorage && window.SoterStorage.getState
      ? window.SoterStorage.getState()
      : { data: {} };
  }

  function saveSiteState(nextState) {
    if (window.SoterStorage && window.SoterStorage.save) {
      window.SoterStorage.save(nextState);
    }
  }

  function esc(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function normalizeNumber(value) {
    var number = Number(value);
    return Number.isFinite(number) ? number : 0;
  }

  function money(value, withDecimals) {
    return "R$ " + normalizeNumber(value).toLocaleString("pt-BR", withDecimals
      ? { minimumFractionDigits: 2, maximumFractionDigits: 2 }
      : { maximumFractionDigits: 0 });
  }

  function clampPage(page, totalItems) {
    var totalPages = Math.max(1, Math.ceil(totalItems / ITEMS_PER_PAGE));
    var nextPage = Number(page) || 1;
    return Math.min(Math.max(1, nextPage), totalPages);
  }

  function buildPageSlice(items, page) {
    var safePage = clampPage(page, items.length);
    var start = (safePage - 1) * ITEMS_PER_PAGE;
    return {
      page: safePage,
      totalPages: Math.max(1, Math.ceil(items.length / ITEMS_PER_PAGE)),
      items: items.slice(start, start + ITEMS_PER_PAGE)
    };
  }

  function getNode(id) {
    return document.getElementById(id);
  }

  function setText(id, value) {
    var node = getNode(id);
    if (node) node.textContent = value;
  }

  function setWidth(id, value) {
    var node = getNode(id);
    if (node) node.style.width = value;
  }

  function setValue(id, value) {
    var node = getNode(id);
    if (node) node.value = value;
  }

  function isHttpImage(url) {
    return /^https?:\/\//i.test(String(url || "").trim());
  }

  function normalizeStock(value, fallback) {
    var stock = Math.floor(Number(value));
    if (!Number.isFinite(stock) || stock < 0) stock = fallback;
    if (!Number.isFinite(stock) || stock < 0) stock = 1;
    return stock;
  }

  function normalizeItem(item) {
    var normalized = item && typeof item === "object" ? item : {};
    var legacyDone = !!normalized.done || normalized.priority === "comprado";
    var stock = normalizeStock(normalized.stock, legacyDone ? 0 : 1);

    return {
      id: normalized.id || (Date.now() + Math.random()),
      name: String(normalized.name || normalized.nome || "").trim(),
      emoji: String(normalized.emoji || "").trim(),
      category: String(normalized.category || "Outros").trim() || "Outros",
      priority: String(normalized.priority || normalized._prevPrio || "media").trim() || "media",
      price: normalizeNumber(normalized.price || normalized.preco),
      stock: stock,
      store: String(normalized.store || "").trim(),
      link: String(normalized.link || "").trim(),
      img: String(normalized.img || "").trim(),
      notes: String(normalized.notes || normalized.notas || "").trim(),
      createdAt: normalizeNumber(normalized.createdAt) || Date.now()
    };
  }

  function normalizeHistoryEntry(entry) {
    var normalized = entry && typeof entry === "object" ? entry : {};
    return {
      id: String(normalized.id || ("hist-" + Date.now() + Math.random())),
      itemId: String(normalized.itemId || ""),
      name: String(normalized.name || "").trim(),
      category: String(normalized.category || "Outros").trim() || "Outros",
      priority: String(normalized.priority || "media").trim() || "media",
      price: normalizeNumber(normalized.price),
      store: String(normalized.store || "").trim(),
      img: String(normalized.img || "").trim(),
      emoji: String(normalized.emoji || "").trim(),
      notes: String(normalized.notes || "").trim(),
      acquiredAt: normalizeNumber(normalized.acquiredAt) || Date.now()
    };
  }

  function normalizeListGroup(group) {
    var normalized = group && typeof group === "object" ? group : {};
    return {
      id: String(normalized.id || ("grupo-" + Date.now() + Math.random())),
      name: String(normalized.name || "Lista").trim() || "Lista",
      icon: String(normalized.icon || "\u2728"),
      description: String(normalized.description || "").trim(),
      itemIds: Array.isArray(normalized.itemIds) ? normalized.itemIds.map(String) : []
    };
  }

  function buildDefaultListGroups(items) {
    var roomIds = items.filter(function (item) {
      var text = ((item.name || "") + " " + (item.notes || "") + " " + (item.category || "")).toLowerCase();
      return item.category === "Casa" || text.indexOf("quarto") >= 0;
    }).map(function (item) {
      return String(item.id);
    });

    return DEFAULT_LIST_GROUPS.map(function (group) {
      var next = normalizeListGroup(group);
      if (next.id === "quarto") next.itemIds = roomIds;
      return next;
    });
  }

  function save() {
    var state = st();
    if (!state.data || typeof state.data !== "object") state.data = {};

    state.data[STORAGE_KEY] = {
      items: W.slice(),
      listGroups: listGroups.slice(),
      acquisitionHistory: acquisitionHistory.slice(),
      goal: { saved: goalData.saved, goal: goalData.goal },
      ts: Date.now()
    };
    state.data.wishlist = W.slice();
    state.data.wishlistHistory = acquisitionHistory.slice();
    state.data.wishlistGoal = { saved: goalData.saved, goal: goalData.goal };
    state.data.lastVisitedPage = document.body.getAttribute("data-page") || "wishlist";
    state.data.lastVisitedAt = new Date().toISOString();

    saveSiteState(state);

  }

  function parseLegacyLocalStorage() {
    return null;
  }

  function load() {
    var state = st();
    var data = state.data && typeof state.data === "object" ? state.data : {};
    var tracker = data[STORAGE_KEY];
    var migrated = false;
    var depleted = [];

    if (tracker && typeof tracker === "object" && Array.isArray(tracker.items)) {
      W = tracker.items.map(normalizeItem);
      acquisitionHistory = Array.isArray(tracker.acquisitionHistory)
        ? tracker.acquisitionHistory.map(normalizeHistoryEntry)
        : [];
      depleted = W.filter(function (item) { return item.stock <= 0; });
      if (depleted.length) {
        depleted.forEach(function (item) {
          acquisitionHistory.push(normalizeHistoryEntry({
            itemId: item.id,
            name: item.name,
            category: item.category,
            price: item.price,
            acquiredAt: item.createdAt || Date.now()
          }));
        });
      }
      W = W.filter(function (item) { return item.stock > 0; });
      listGroups = Array.isArray(tracker.listGroups) && tracker.listGroups.length
        ? tracker.listGroups.map(normalizeListGroup)
        : buildDefaultListGroups(W);
      goalData = tracker.goal && typeof tracker.goal === "object"
        ? { saved: normalizeNumber(tracker.goal.saved), goal: normalizeNumber(tracker.goal.goal) }
        : { saved: 0, goal: 0 };
      return;
    }

    if (Array.isArray(data.wishlist)) {
      W = data.wishlist.map(normalizeItem);
      acquisitionHistory = Array.isArray(data.wishlistHistory)
        ? data.wishlistHistory.map(normalizeHistoryEntry)
        : [];
      depleted = W.filter(function (item) { return item.stock <= 0; });
      if (depleted.length) {
        depleted.forEach(function (item) {
          acquisitionHistory.push(normalizeHistoryEntry({
            itemId: item.id,
            name: item.name,
            category: item.category,
            price: item.price,
            acquiredAt: item.createdAt || Date.now()
          }));
        });
      }
      W = W.filter(function (item) { return item.stock > 0; });
      listGroups = buildDefaultListGroups(W);
      goalData = data.wishlistGoal && typeof data.wishlistGoal === "object"
        ? { saved: normalizeNumber(data.wishlistGoal.saved), goal: normalizeNumber(data.wishlistGoal.goal) }
        : { saved: 0, goal: 0 };
      migrated = true;
    } else {
      var legacy = parseLegacyLocalStorage();
      if (legacy) {
        W = legacy.items.map(normalizeItem);
        acquisitionHistory = Array.isArray(legacy.acquisitionHistory)
          ? legacy.acquisitionHistory.map(normalizeHistoryEntry)
          : [];
        depleted = W.filter(function (item) { return item.stock <= 0; });
        if (depleted.length) {
          depleted.forEach(function (item) {
            acquisitionHistory.push(normalizeHistoryEntry({
              itemId: item.id,
              name: item.name,
              category: item.category,
              price: item.price,
              acquiredAt: item.createdAt || Date.now()
            }));
          });
        }
        W = W.filter(function (item) { return item.stock > 0; });
        listGroups = buildDefaultListGroups(W);
        goalData = {
          saved: normalizeNumber(legacy.goal.saved),
          goal: normalizeNumber(legacy.goal.goal)
        };
        migrated = true;
      } else {
        W = [];
        listGroups = buildDefaultListGroups(W);
        acquisitionHistory = [];
        goalData = { saved: 0, goal: 0 };
      }
    }

    if (migrated) save();
  }

  function toast(message, type) {
    var host = getNode("tc");
    if (!host) return;

    var cls = { s: "ts", e: "te", i: "ti" }[type || "s"] || "ti";
    var el = document.createElement("div");
    el.className = "toast " + cls;
    el.textContent = message;
    host.appendChild(el);

    window.setTimeout(function () {
      el.style.animation = "tOut .28s ease forwards";
      window.setTimeout(function () {
        if (el.parentNode) el.parentNode.removeChild(el);
      }, 280);
    }, 3000);
  }

  function openMo() {
    var mo = getNode("mo");
    if (mo) mo.classList.add("open");
  }

  function closeMo() {
    var mo = getNode("mo");
    if (mo) mo.classList.remove("open");
  }

  function openListModal(groupId) {
    activeListGroupId = groupId;
    renderListModal();
    var mo = getNode("ws-list-modal");
    if (mo) mo.classList.add("open");
  }

  function closeListModal() {
    var mo = getNode("ws-list-modal");
    if (mo) mo.classList.remove("open");
  }

  function openListEditor(groupId) {
    editListGroupId = groupId || null;
    renderListEditor();
    var mo = getNode("ws-list-edit-modal");
    if (mo) mo.classList.add("open");
  }

  function closeListEditor() {
    var mo = getNode("ws-list-edit-modal");
    if (mo) mo.classList.remove("open");
  }

  function resetForm() {
    var form = getNode("wform");
    if (form) form.reset();

    getNode("mo-title").textContent = "Novo Item";
    getNode("btn-sub").innerHTML = ADD_BUTTON_HTML;
    getNode("btn-del").hidden = true;
    getNode("f-stock").value = 1;
    editIdx = -1;
  }

  function slugify(value) {
    return String(value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function makeListId(name) {
    var base = slugify(name) || ("lista-" + Date.now());
    var candidate = base;
    var count = 2;
    while (listGroups.some(function (group) { return group.id === candidate && group.id !== editListGroupId; })) {
      candidate = base + "-" + count;
      count += 1;
    }
    return candidate;
  }

  function renderListEditor() {
    var title = getNode("ws-list-edit-title");
    var nameInput = getNode("ws-list-name");
    var iconInput = getNode("ws-list-icon");
    var descriptionInput = getNode("ws-list-description");
    var picker = getNode("ws-list-picker");
    var deleteButton = getNode("ws-list-delete");
    var submitButton = getNode("ws-list-submit");
    var group = editListGroupId
      ? listGroups.find(function (entry) { return entry.id === editListGroupId; }) || null
      : null;
    var selectedIds = new Set(group ? (group.itemIds || []).map(String) : []);

    if (!title || !nameInput || !iconInput || !descriptionInput || !picker || !deleteButton || !submitButton) return;

    title.textContent = group ? "Editar Lista" : "Nova Lista";
    nameInput.value = group ? group.name : "";
    iconInput.value = group ? group.icon : "";
    descriptionInput.value = group ? group.description : "";
    deleteButton.hidden = !group;
    submitButton.innerHTML = (group ? SAVE_BUTTON_HTML : ADD_BUTTON_HTML).replace(/Salvar|Adicionar/g, group ? "Salvar Lista" : "Criar Lista");

    if (!W.length) {
      picker.innerHTML = '<div class="ws-list-pick-empty">Adicione itens na wishlist antes de montar uma lista.</div>';
      return;
    }

    picker.innerHTML = W.map(function (item) {
      var thumb = item.emoji || CATS[item.category] || "\u2728";
      var checked = selectedIds.has(String(item.id));
      return '' +
        '<label class="ws-list-pick-item' + (checked ? ' is-selected' : '') + '">' +
        '<input type="checkbox" value="' + esc(item.id) + '"' + (checked ? ' checked' : '') + '>' +
        '<span class="ws-list-pick-thumb">' +
        (isHttpImage(item.img)
          ? '<img src="' + esc(item.img) + '" alt="' + esc(item.name) + '" loading="lazy">'
          : esc(thumb)) +
        '</span>' +
        '<span class="ws-list-pick-copy">' +
        '<span class="ws-list-pick-name">' + esc(item.name) + '</span>' +
        '<span class="ws-list-pick-meta">' + esc(item.category || "Outros") + ' &middot; estoque ' + item.stock + (item.price ? ' &middot; ' + esc(money(item.price, true)) : '') + '</span>' +
        '</span>' +
        '</label>';
    }).join("");
  }

  function fillForm(item) {
    getNode("f-name").value = item.name || "";
    getNode("f-emoji").value = item.emoji || "";
    getNode("f-cat").value = item.category || "Outros";
    getNode("f-prio").value = item.priority || "media";
    getNode("f-price").value = item.price || "";
    getNode("f-stock").value = item.stock || 1;
    getNode("f-store").value = item.store || "";
    getNode("f-link").value = item.link || "";
    getNode("f-img").value = item.img || "";
    getNode("f-notes").value = item.notes || "";
  }

  function openEdit(index) {
    var item = W[index];
    if (!item) return;

    editIdx = index;
    getNode("mo-title").textContent = "Editar Item";
    getNode("btn-sub").innerHTML = SAVE_BUTTON_HTML;
    getNode("btn-del").hidden = false;
    fillForm(item);
    openMo();
  }

  function getFiltered() {
    var query = String((getNode("search").value || "")).toLowerCase();
    var applied = filters.applied;

    var items = W.filter(function (item) {
      var matchQuery = !query ||
        item.name.toLowerCase().indexOf(query) >= 0 ||
        item.notes.toLowerCase().indexOf(query) >= 0 ||
        item.category.toLowerCase().indexOf(query) >= 0;

      var matchStatus = applied.status === "all" ||
        (applied.status === "estoque" && item.stock > 0) ||
        (applied.status === "baixo" && item.stock > 0 && item.stock <= 2);

      var matchPriority = applied.priority === "all" ||
        item.priority === applied.priority;

      var matchCategory = applied.category === "all" ||
        item.category === applied.category;

      return matchQuery && matchStatus && matchPriority && matchCategory;
    });

    function prioRank(priority) {
      return Object.prototype.hasOwnProperty.call(PRIO_ORDER, priority) ? PRIO_ORDER[priority] : 3;
    }

    items.sort(function (a, b) {
      if (applied.sort === "name") return a.name.localeCompare(b.name, "pt-BR");
      if (applied.sort === "price-asc") return a.price - b.price;
      if (applied.sort === "price-desc") return b.price - a.price;
      if (applied.sort === "priority-desc" || applied.sort === "priority-asc") {
        var diff = prioRank(a.priority) - prioRank(b.priority);
        if (applied.sort === "priority-asc") diff = -diff;
        if (diff !== 0) return diff;
        return b.createdAt - a.createdAt;
      }
      return b.createdAt - a.createdAt;
    });

    return items;
  }

  function getActiveFilterCount() {
    var count = 0;
    if (filters.applied.sort !== DEFAULT_FILTERS.sort) count += 1;
    if (filters.applied.status !== DEFAULT_FILTERS.status) count += 1;
    if (filters.applied.priority !== DEFAULT_FILTERS.priority) count += 1;
    if (filters.applied.category !== DEFAULT_FILTERS.category) count += 1;
    return count;
  }

  function syncFilterUi() {
    var button = getNode("wishlist-filter-btn");
    var badge = getNode("wishlist-filter-badge");
    var count = getActiveFilterCount();

    document.querySelectorAll(".ws-filter-chips").forEach(function (group) {
      var key = group.getAttribute("data-filter-group");
      var current = filters.pending[key];
      group.querySelectorAll(".ws-filter-chip").forEach(function (chip) {
        chip.classList.toggle("selected", chip.getAttribute("data-filter-value") === current);
      });
    });

    if (badge) badge.textContent = String(count);
    if (button) button.classList.toggle("active", count > 0);
  }

  function openFilterPanel() {
    var panel = getNode("wishlist-filter-panel");
    var button = getNode("wishlist-filter-btn");
    filters.pending = {
      sort: filters.applied.sort,
      status: filters.applied.status,
      priority: filters.applied.priority,
      category: filters.applied.category
    };
    syncFilterUi();
    if (panel) panel.classList.add("open");
    if (button) button.setAttribute("aria-expanded", "true");
  }

  function closeFilterPanel() {
    var panel = getNode("wishlist-filter-panel");
    var button = getNode("wishlist-filter-btn");
    if (panel) panel.classList.remove("open");
    if (button) button.setAttribute("aria-expanded", "false");
  }

  function applyFilters() {
    filters.applied = {
      sort: filters.pending.sort,
      status: filters.pending.status,
      priority: filters.pending.priority,
      category: filters.pending.category
    };
    pageState.wishlist = 1;
    syncFilterUi();
    closeFilterPanel();
    renderItems();
  }

  function clearFilters() {
    filters.pending = {
      sort: DEFAULT_FILTERS.sort,
      status: DEFAULT_FILTERS.status,
      priority: DEFAULT_FILTERS.priority,
      category: DEFAULT_FILTERS.category
    };
    filters.applied = {
      sort: DEFAULT_FILTERS.sort,
      status: DEFAULT_FILTERS.status,
      priority: DEFAULT_FILTERS.priority,
      category: DEFAULT_FILTERS.category
    };
    pageState.wishlist = 1;
    syncFilterUi();
    closeFilterPanel();
    renderItems();
  }

  function renderPagination(containerId, type, page, totalItems) {
    var container = getNode(containerId);
    var totalPages = Math.max(1, Math.ceil(totalItems / ITEMS_PER_PAGE));
    var startPage = Math.max(1, page - 2);
    var endPage = Math.min(totalPages, startPage + 4);
    var pages = [];
    var current;

    if (!container) return;

    if (totalPages <= 1) {
      container.classList.remove("is-visible");
      container.innerHTML = "";
      return;
    }

    startPage = Math.max(1, endPage - 4);
    for (current = startPage; current <= endPage; current += 1) {
      pages.push(current);
    }

    container.classList.add("is-visible");
    container.innerHTML =
      '<button class="ws-page-btn" type="button" data-page-type="' + type + '" data-page="' + (page - 1) + '"' + (page <= 1 ? ' disabled' : '') + '>Anterior</button>' +
      pages.map(function (entry) {
        return '<button class="ws-page-btn' + (entry === page ? ' is-active' : '') + '" type="button" data-page-type="' + type + '" data-page="' + entry + '">' + entry + '</button>';
      }).join("") +
      '<button class="ws-page-btn" type="button" data-page-type="' + type + '" data-page="' + (page + 1) + '"' + (page >= totalPages ? ' disabled' : '') + '>Proxima</button>';
  }

  function renderItems() {
    var grid = getNode("igrid");
    var items = getFiltered();
    var pageData;

    if (!grid) return;

    pageData = buildPageSlice(items, pageState.wishlist);
    pageState.wishlist = pageData.page;

    if (!items.length) {
      grid.innerHTML = '<div class="ws-empty"><span class="ws-empty-ico">\uD83D\uDED2</span><h4>Nenhum item encontrado</h4><p>' +
        (W.length ? "Tente outro filtro ou busca." : "Adicione seu primeiro desejo!") +
        "</p></div>";
      renderPagination("ws-items-pagination", "wishlist", 1, 0);
      return;
    }

    grid.innerHTML = pageData.items.map(function (item) {
      var index = W.indexOf(item);
      return buildWishlistCardMarkup(item, {
        editIndex: index,
        stockLabel: "Estoque: " + item.stock,
        footerPrice: item.price ? money(item.price, true) : "&ndash;",
        footerExtra: item.link ? '<a class="ws-card-link" href="' + esc(item.link) + '" target="_blank" rel="noopener" data-stop-click="true">Ver produto &rarr;</a>' : "",
        actionButton: '<button class="ws-card-check" type="button" title="Registrar aquisicao" data-toggle-index="' + index + '">' +
          '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>' +
          "</button>"
      });
    }).join("");
    renderPagination("ws-items-pagination", "wishlist", pageState.wishlist, items.length);
  }

  function buildWishlistCardMarkup(item, options) {
    var opts = options || {};
    var badge = item.priority;
    var thumb = item.emoji || CATS[item.category] || "\u2728";
    var categoryLine = esc(item.category || "Outros") + (item.store ? " &middot; " + esc(item.store) : "");
    var attrs = typeof opts.editIndex === "number" && opts.editIndex >= 0 ? ' data-edit-index="' + opts.editIndex + '"' : "";

    return '' +
      '<article class="ws-card"' + attrs + '>' +
      '<div class="ws-card-priority ' + badge + '"></div>' +
      '<div class="ws-card-image">' +
      (isHttpImage(item.img)
        ? '<img src="' + esc(item.img) + '" alt="' + esc(item.name) + '" loading="lazy">'
        : '<span class="ws-card-fallback">' + esc(thumb) + "</span>") +
      '<div class="ws-card-image-overlay"></div>' +
      '<span class="ws-card-badge ' + badge + '">' + esc(opts.badgeLabel || BADGE_LABELS[badge] || badge) + "</span>" +
      "</div>" +
      '<div class="ws-card-body">' +
      '<div class="ws-card-cat">' + categoryLine + "</div>" +
      '<div class="ws-card-name">' + esc(item.name) + "</div>" +
      (item.notes ? '<div class="ws-card-notes">' + esc(item.notes) + "</div>" : "") +
      '<div class="ws-card-footer">' +
      '<span class="ws-card-stock">' + (opts.stockLabel || "") + "</span>" +
      '<span class="ws-card-price">' + (opts.footerPrice || "&ndash;") + "</span>" +
      (opts.footerExtra || "") +
      (opts.actionButton || "") +
      "</div>" +
      "</div>" +
      "</article>";
  }

  function renderStats() {
    var total = W.length;
    var done = acquisitionHistory.length;
    var alta = W.filter(function (item) { return item.priority === "alta"; }).length;
    var media = W.filter(function (item) { return item.priority === "media"; }).length;
    var baixa = W.filter(function (item) { return item.priority === "baixa"; }).length;
    var valor = W.reduce(function (sum, item) {
      return sum + (item.price || 0);
    }, 0);

    setText("s-total", String(total));
    setText("s-alta", String(alta));
    setText("s-done", String(done));
    setText("s-valor", money(valor, false));

    setText("p-alta", String(alta));
    setText("p-media", String(media));
    setText("p-baixa", String(baixa));
    setText("p-done", String(done));

    var goal = normalizeNumber(goalData.goal);
    var saved = normalizeNumber(goalData.saved);
    var pct = goal > 0 ? Math.min(Math.round(saved / goal * 100), 100) : 0;
    var left = Math.max(goal - saved, 0);

    setText("s-pct", pct + "%");
    setWidth("s-pbar", pct + "%");
    setText("g-saved", money(saved, true));
    setText("g-goal", goal ? money(goal, true) : "R$ -");
    setWidth("g-bar", pct + "%");
    setText("g-left", goal ? money(left, true) : "R$ -");
    setValue("g-saved-inp", saved || "");
    setValue("g-goal-inp", goal || "");
  }

  function getGroupItems(group) {
    var ids = new Set((group.itemIds || []).map(String));
    var baseItems = W.filter(function (item) {
      return ids.has(String(item.id));
    });

    if (group.id === "quarto") {
      var inferred = W.filter(function (item) {
        var text = ((item.name || "") + " " + (item.notes || "") + " " + (item.category || "")).toLowerCase();
        return item.category === "Casa" || text.indexOf("quarto") >= 0;
      });
      inferred.forEach(function (item) {
        if (!ids.has(String(item.id))) baseItems.push(item);
      });
    }

    return baseItems;
  }

  function renderListCards() {
    var grid = getNode("ws-lists-grid");
    var pageData;
    if (!grid) return;

    pageData = buildPageSlice(listGroups, pageState.listas);
    pageState.listas = pageData.page;

    if (!listGroups.length) {
      grid.innerHTML = '<div class="ws-empty"><span class="ws-empty-ico">\uD83D\uDCC2</span><h4>Nenhuma lista criada</h4><p>Adicione agrupamentos para organizar seus itens.</p></div>';
      renderPagination("ws-lists-pagination", "listas", 1, 0);
      return;
    }

    grid.innerHTML = pageData.items.map(function (group) {
      var items = getGroupItems(group).slice(0, 3);
      return '' +
        '<article class="ws-list-card" data-list-group="' + esc(group.id) + '">' +
        '<div class="ws-list-card-head">' +
        '<div>' +
        '<div class="ws-list-card-icon">' + esc(group.icon) + '</div>' +
        '</div>' +
        '<div style="flex:1">' +
        '<div class="ws-list-card-name">' + esc(group.name) + '</div>' +
        '<div class="ws-list-card-meta">' + esc(group.description || "Agrupamento de itens") + '</div>' +
        '</div>' +
        '<span class="ws-list-card-count">' + getGroupItems(group).length + ' itens</span>' +
        '</div>' +
        (items.length
          ? '<div class="ws-list-card-gallery">' + items.map(function (item) {
            return '<div class="ws-list-card-thumb">' +
              (isHttpImage(item.img)
                ? '<img src="' + esc(item.img) + '" alt="' + esc(item.name) + '" loading="lazy">'
                : esc(item.emoji || CATS[item.category] || "\u2728")) +
              '</div>';
          }).join("") + '</div>'
          : '<div class="ws-list-card-empty">Nenhum item associado ainda</div>') +
        '</article>';
    }).join("");
    renderPagination("ws-lists-pagination", "listas", pageState.listas, listGroups.length);
  }

  function renderListModal() {
    var title = getNode("ws-list-modal-title");
    var subtitle = getNode("ws-list-modal-subtitle");
    var grid = getNode("ws-list-modal-grid");
    var group = listGroups.find(function (entry) { return entry.id === activeListGroupId; }) || null;
    var items = group ? getGroupItems(group) : [];

    if (!title || !subtitle || !grid) return;

    title.textContent = group ? group.name : "Lista";
    subtitle.textContent = group ? (group.description || "Itens agrupados") : "Itens agrupados";
    if (getNode("ws-list-modal-edit")) {
      getNode("ws-list-modal-edit").hidden = !group;
    }

    if (!group || !items.length) {
      grid.innerHTML = '<div class="ws-empty"><span class="ws-empty-ico">\uD83D\uDED2</span><h4>Nenhum item encontrado</h4><p>Adicione itens da wishlist que se encaixem nesta lista.</p></div>';
      return;
    }

    grid.innerHTML = items.map(function (item) {
      var badge = item.priority;
      var thumb = item.emoji || CATS[item.category] || "\u2728";
      var categoryLine = esc(item.category || "Outros") + (item.store ? " &middot; " + esc(item.store) : "");

      return '' +
        '<article class="ws-card">' +
        '<div class="ws-card-priority ' + badge + '"></div>' +
        '<div class="ws-card-image">' +
        (isHttpImage(item.img)
          ? '<img src="' + esc(item.img) + '" alt="' + esc(item.name) + '" loading="lazy">'
          : '<span class="ws-card-fallback">' + esc(thumb) + "</span>") +
        '<div class="ws-card-image-overlay"></div>' +
        '<span class="ws-card-badge ' + badge + '">' + esc(BADGE_LABELS[badge] || badge) + "</span>" +
        '</div>' +
        '<div class="ws-card-body">' +
        '<div class="ws-card-cat">' + categoryLine + '</div>' +
        '<div class="ws-card-name">' + esc(item.name) + '</div>' +
        (item.notes ? '<div class="ws-card-notes">' + esc(item.notes) + '</div>' : '') +
        '<div class="ws-card-footer"><span class="ws-card-stock">Estoque: ' + item.stock + '</span><span class="ws-card-price">' + (item.price ? money(item.price, true) : "&ndash;") + '</span></div>' +
        '</div>' +
        '</article>';
    }).join("");
  }

  function setActiveTab(nextTab) {
    activeTab = nextTab === "listas" || nextTab === "historico" ? nextTab : "wishlist";
    document.querySelectorAll(".ws-tab").forEach(function (tab) {
      var isActive = tab.getAttribute("data-tab") === activeTab;
      tab.classList.toggle("is-active", isActive);
      tab.setAttribute("aria-selected", isActive ? "true" : "false");
    });
    document.querySelectorAll(".ws-view").forEach(function (view) {
      view.classList.toggle("is-active", view.getAttribute("data-view") === activeTab);
    });
  }

  function renderCatBreakdown() {
    var counts = {};
    var container = getNode("cat-breakdown");

    W.forEach(function (item) {
      counts[item.category] = (counts[item.category] || 0) + 1;
    });

    var sorted = Object.keys(counts).sort(function (a, b) {
      return counts[b] - counts[a];
    });

    if (!sorted.length) {
      container.innerHTML = '<div class="ws-empty-note">Nenhum item ainda</div>';
      return;
    }

    container.innerHTML = sorted.map(function (category) {
      return '' +
        '<div class="ws-catrow">' +
        '<div class="ws-catleft"><span class="ws-catico">' + esc(CATS[category] || "\u2728") + '</span><span class="ws-catname">' + esc(category) + "</span></div>" +
        '<span class="ws-catcnt">' + counts[category] + "</span>" +
        "</div>";
    }).join("");
  }

  function renderTop() {
    var container = getNode("top-list");
    var sorted = W.filter(function (item) {
      return item.price > 0;
    }).sort(function (a, b) {
      return b.price - a.price;
    }).slice(0, 4);

    if (!sorted.length) {
      container.innerHTML = '<div class="ws-empty-note">Nenhum item com preco</div>';
      return;
    }

    container.innerHTML = sorted.map(function (item) {
      return '' +
        '<div class="ws-catrow">' +
        '<div class="ws-catleft"><span class="ws-catico">' + esc(item.emoji || CATS[item.category] || "\u2728") + '</span><span class="ws-top-item">' + esc(item.name) + "</span></div>" +
        '<span class="ws-top-price">' + money(item.price, false) + "</span>" +
        "</div>";
    }).join("");
  }

  function renderHistory() {
    var container = getNode("acq-history");
    var now = new Date();
    var cutoff = null;
    var items;
    if (historyRange === "1m") cutoff = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate()).getTime();
    else if (historyRange === "3m") cutoff = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate()).getTime();
    else if (historyRange === "6m") cutoff = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate()).getTime();
    else if (historyRange === "1y") cutoff = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()).getTime();
    items = acquisitionHistory.filter(function (entry) {
      return cutoff == null || entry.acquiredAt >= cutoff;
    }).slice().sort(function (a, b) {
      return b.acquiredAt - a.acquiredAt;
    });

    if (!container) return;

    if (!items.length) {
      container.innerHTML = '<div class="ws-empty-note">Nenhuma aquisição encontrada neste período</div>';
      return;
    }

    container.innerHTML = '<div class="ws-igrid ws-history-grid">' + items.map(function (entry) {
      var currentItem = W.find(function (item) { return String(item.id) === String(entry.itemId); }) || null;
      var visualItem = normalizeItem({
        id: currentItem ? currentItem.id : entry.itemId,
        name: entry.name || (currentItem && currentItem.name) || "Item adquirido",
        category: entry.category || (currentItem && currentItem.category) || "Outros",
        priority: (currentItem && currentItem.priority) || entry.priority || "media",
        price: entry.price || (currentItem && currentItem.price) || 0,
        store: (currentItem && currentItem.store) || entry.store || "",
        img: (currentItem && currentItem.img) || entry.img || "",
        emoji: (currentItem && currentItem.emoji) || entry.emoji || "",
        notes: (currentItem && currentItem.notes) || entry.notes || "",
        stock: currentItem ? currentItem.stock : 0
      });
      return buildWishlistCardMarkup(visualItem, {
        editIndex: currentItem ? W.indexOf(currentItem) : -1,
        badgeLabel: "Adquirido",
        stockLabel: "Em " + new Date(entry.acquiredAt).toLocaleDateString("pt-BR"),
        footerPrice: entry.price ? money(entry.price, true) : "&ndash;"
      });
    }).join("") + "</div>";
  }

  function bindHistoryFilters() {
    var wrap = getNode("acq-history-filters");
    if (!wrap) return;
    wrap.addEventListener("click", function (event) {
      var button = event.target.closest("[data-history-range]");
      if (!button) return;
      historyRange = button.getAttribute("data-history-range") || "1m";
      Array.prototype.forEach.call(wrap.querySelectorAll("[data-history-range]"), function (chip) {
        chip.classList.toggle("is-active", chip === button);
      });
      renderHistory();
    });
  }

  function renderAll() {
    renderStats();
    renderCatBreakdown();
    renderTop();
    renderHistory();
    renderItems();
    renderListCards();
  }

  function onListPickerToggle(event) {
    var checkbox = event.target.closest("input[type='checkbox']");
    if (!checkbox) return;
    var item = checkbox.closest(".ws-list-pick-item");
    if (item) item.classList.toggle("is-selected", checkbox.checked);
  }

  function onListFormSubmit(event) {
    event.preventDefault();

    var name = getNode("ws-list-name").value.trim();
    var icon = getNode("ws-list-icon").value.trim() || "\u2728";
    var description = getNode("ws-list-description").value.trim();
    var itemIds = Array.prototype.slice.call(document.querySelectorAll("#ws-list-picker input:checked"))
      .map(function (input) { return String(input.value); });

    if (!name) {
      toast("Informe o nome da lista.", "e");
      return;
    }

    var payload = normalizeListGroup({
      id: editListGroupId || makeListId(name),
      name: name,
      icon: icon,
      description: description,
      itemIds: itemIds
    });

    if (editListGroupId) {
      var index = listGroups.findIndex(function (group) { return group.id === editListGroupId; });
      if (index >= 0) listGroups[index] = payload;
      if (activeListGroupId === editListGroupId) activeListGroupId = payload.id;
      toast("Lista atualizada! \u2713", "s");
    } else {
      listGroups.push(payload);
      pageState.listas = clampPage(listGroups.length, listGroups.length);
      toast("Lista criada! \u2713", "s");
    }

    save();
    renderAll();
    closeListEditor();
  }

  function onDeleteList() {
    if (!editListGroupId) return;
    var group = listGroups.find(function (entry) { return entry.id === editListGroupId; }) || null;
    if (!group) return;
    if (!window.confirm('Excluir a lista "' + group.name + '"?')) return;

    listGroups = listGroups.filter(function (entry) { return entry.id !== editListGroupId; });
    pageState.listas = clampPage(pageState.listas, listGroups.length);
    if (activeListGroupId === editListGroupId) {
      activeListGroupId = null;
      closeListModal();
    }
    save();
    renderAll();
    closeListEditor();
    toast("Lista excluida.", "i");
  }

  function removeItemReferences(itemId) {
    var target = String(itemId);
    listGroups = listGroups.map(function (group) {
      var next = normalizeListGroup(group);
      next.itemIds = next.itemIds.filter(function (entryId) {
        return String(entryId) !== target;
      });
      return next;
    });
  }

  function registerAcquisition(item) {
    acquisitionHistory.push(normalizeHistoryEntry({
      itemId: item.id,
      name: item.name,
      category: item.category,
      priority: item.priority,
      price: item.price,
      store: item.store,
      img: item.img,
      emoji: item.emoji,
      notes: item.notes,
      acquiredAt: Date.now()
    }));
  }

  function saveGoal() {
    if (!getNode("g-saved-inp") || !getNode("g-goal-inp")) return;
    goalData = {
      saved: parseFloat(getNode("g-saved-inp").value) || 0,
      goal: parseFloat(getNode("g-goal-inp").value) || 0
    };
    save();
    renderStats();
    toast("Meta salva! \u2713", "s");
  }

  function buildItemFromForm() {
    var current = editIdx >= 0 ? W[editIdx] : null;

    return normalizeItem({
      id: current ? current.id : (Date.now() + Math.random()),
      name: getNode("f-name").value.trim(),
      emoji: getNode("f-emoji").value.trim(),
      category: getNode("f-cat").value,
      priority: getNode("f-prio").value,
      price: parseFloat(getNode("f-price").value) || 0,
      stock: Math.max(1, parseInt(getNode("f-stock").value, 10) || 1),
      store: getNode("f-store").value.trim(),
      link: getNode("f-link").value.trim(),
      img: getNode("f-img").value.trim(),
      notes: getNode("f-notes").value.trim(),
      createdAt: current ? current.createdAt : Date.now()
    });
  }

  function onFormSubmit(event) {
    event.preventDefault();

    var name = getNode("f-name").value.trim();
    if (!name) {
      toast("Informe o nome do item.", "e");
      return;
    }

    var item = buildItemFromForm();
    if (editIdx >= 0) {
      W[editIdx] = item;
      toast("Item atualizado! \u2713", "s");
    } else {
      W.push(item);
      toast("Item adicionado! \u2713", "s");
    }

    save();
    renderAll();
    closeMo();
  }

  function onDelete() {
    if (editIdx < 0 || !W[editIdx]) return;
    if (!window.confirm('Excluir "' + W[editIdx].name + '"?')) return;

    removeItemReferences(W[editIdx].id);
    W.splice(editIdx, 1);
    save();
    renderAll();
    closeMo();
    toast("Item excluido.", "i");
  }

  function acquireOne(index) {
    var item = W[index];
    if (!item) return;

    registerAcquisition(item);
    item.stock = Math.max(0, item.stock - 1);

    if (item.stock <= 0) {
      removeItemReferences(item.id);
      W.splice(index, 1);
      pageState.wishlist = clampPage(pageState.wishlist, W.length);
      toast('"' + item.name + '" saiu da wishlist: estoque zerado.', "i");
    } else {
      toast("Aquisicao registrada! \u2713", "s");
    }

    save();
    renderAll();
  }

  function wireEvents() {
    getNode("search").addEventListener("input", function () {
      pageState.wishlist = 1;
      renderItems();
    });
    getNode("btn-add").addEventListener("click", function () {
      resetForm();
      openMo();
    });
    if (getNode("btn-export")) {
      getNode("btn-export").addEventListener("click", function () {
        var blob = new Blob([JSON.stringify({
          items: W,
          goal: goalData,
          exportDate: new Date().toISOString(),
          version: "2.0"
        }, null, 2)], { type: "application/json" });
        var link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = "wishlist_" + new Date().toISOString().split("T")[0] + ".json";
        link.click();
        window.setTimeout(function () {
          URL.revokeObjectURL(link.href);
        }, 1000);
        toast("Exportado!", "s");
      });
    }
    if (getNode("btn-goal-save")) {
      getNode("btn-goal-save").addEventListener("click", saveGoal);
    }
    getNode("mo-close").addEventListener("click", closeMo);
    getNode("btn-can").addEventListener("click", closeMo);
    getNode("btn-del").addEventListener("click", onDelete);
    getNode("wform").addEventListener("submit", onFormSubmit);
    document.querySelectorAll(".ws-tab").forEach(function (tab) {
      tab.addEventListener("click", function () {
        setActiveTab(tab.getAttribute("data-tab"));
      });
    });
    getNode("wishlist-filter-btn").addEventListener("click", function () {
      var panel = getNode("wishlist-filter-panel");
      if (panel.classList.contains("open")) {
        closeFilterPanel();
      } else {
        openFilterPanel();
      }
    });
    getNode("wishlist-filter-clear").addEventListener("click", clearFilters);
    getNode("wishlist-filter-apply").addEventListener("click", applyFilters);
    getNode("wishlist-filter-panel").addEventListener("click", function (event) {
      var chip = event.target.closest(".ws-filter-chip");
      if (!chip) return;
      var group = chip.parentNode.getAttribute("data-filter-group");
      var value = chip.getAttribute("data-filter-value");
      if (!group) return;
      filters.pending[group] = value;
      syncFilterUi();
    });
    getNode("mo").addEventListener("click", function (event) {
      if (event.target === event.currentTarget) closeMo();
    });
    getNode("ws-list-modal-close").addEventListener("click", closeListModal);
    getNode("ws-list-modal-edit").addEventListener("click", function () {
      if (!activeListGroupId) return;
      closeListModal();
      openListEditor(activeListGroupId);
    });
    getNode("ws-list-modal").addEventListener("click", function (event) {
      if (event.target === event.currentTarget) closeListModal();
    });
    getNode("ws-list-add-btn").addEventListener("click", function () {
      openListEditor(null);
    });
    getNode("ws-list-edit-close").addEventListener("click", closeListEditor);
    getNode("ws-list-cancel").addEventListener("click", closeListEditor);
    getNode("ws-list-delete").addEventListener("click", onDeleteList);
    getNode("ws-list-form").addEventListener("submit", onListFormSubmit);
    getNode("ws-list-edit-modal").addEventListener("click", function (event) {
      if (event.target === event.currentTarget) closeListEditor();
    });
    getNode("ws-list-picker").addEventListener("change", onListPickerToggle);
    getNode("ws-items-pagination").addEventListener("click", function (event) {
      var button = event.target.closest("[data-page-type='wishlist']");
      if (!button || button.disabled) return;
      pageState.wishlist = parseInt(button.getAttribute("data-page"), 10) || 1;
      renderItems();
    });
    getNode("ws-lists-pagination").addEventListener("click", function (event) {
      var button = event.target.closest("[data-page-type='listas']");
      if (!button || button.disabled) return;
      pageState.listas = parseInt(button.getAttribute("data-page"), 10) || 1;
      renderListCards();
    });
    document.addEventListener("click", function (event) {
      var wrap = event.target.closest(".ws-filter-wrap");
      if (!wrap) closeFilterPanel();
    });
    getNode("igrid").addEventListener("click", function (event) {
      var stopLink = event.target.closest("[data-stop-click='true']");
      if (stopLink) {
        event.stopPropagation();
        return;
      }

      var toggle = event.target.closest("[data-toggle-index]");
      if (toggle) {
        acquireOne(parseInt(toggle.getAttribute("data-toggle-index"), 10));
        return;
      }

      var card = event.target.closest("[data-edit-index]");
      if (card) {
        openEdit(parseInt(card.getAttribute("data-edit-index"), 10));
      }
    });
    getNode("ws-lists-grid").addEventListener("click", function (event) {
      var card = event.target.closest("[data-list-group]");
      if (!card) return;
      openListModal(card.getAttribute("data-list-group"));
    });
    getNode("acq-history").addEventListener("click", function (event) {
      var stopLink = event.target.closest("[data-stop-click='true']");
      var card = event.target.closest("[data-edit-index]");
      if (stopLink || !card) return;
      openEdit(parseInt(card.getAttribute("data-edit-index"), 10));
    });
  }

  function initVisitedState() {
    var state = st();
    if (!state.data || typeof state.data !== "object") state.data = {};
    state.data.lastVisitedPage = document.body.getAttribute("data-page") || "wishlist";
    state.data.lastVisitedAt = new Date().toISOString();
    saveSiteState(state);
  }

  load();
  initVisitedState();
  syncFilterUi();
  bindHistoryFilters();
  renderAll();
  wireEvents();

  window.acquireOne = acquireOne;
  window.openEdit = openEdit;
}());
