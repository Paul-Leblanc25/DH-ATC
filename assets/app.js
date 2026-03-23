const qs = (sel, el = document) => el.querySelector(sel);
const qsa = (sel, el = document) => Array.from(el.querySelectorAll(sel));

const STORAGE_KEYS = {
  theme: "atc_theme",
  session: "atc_session",
  flights: "atc_flights",
  log: "atc_log",
  briefing: "atc_briefing",
  config: "atc_config",
  requests: "atc_requests",
  runways: "atc_runways",
};

const DEFAULT_CONFIG = {
  airport: "ZANC",
  map: {
    mode: "image",
    image: {
      url: "",
      bounds: [
        [0, 0],
        [509, 1024],
      ],
      minZoom: 0,
      maxZoom: 0,
      initialZoom: 0,
    },
  },
  runways: [
    { id: "30", name: "RWY 30", rect: null },
    { id: "12", name: "RWY 12", rect: null },
  ],
};

const STATUS_LABELS = {
  ground: "Sol",
  air: "Air",
  emergency: "Urgence",
  closed: "Clos",
};

const STATUS_PILL_CLASS = {
  ground: "pill--ground",
  air: "pill--air",
  emergency: "pill--emergency",
  closed: "pill--closed",
};

const REQUEST_STATUS_LABELS = {
  pending: "En attente",
  accepted: "Acceptée",
  denied: "Refusée",
};

const REQUEST_STATUS_BADGE_CLASS = {
  pending: "badge2--pending",
  accepted: "badge2--accepted",
  denied: "badge2--denied",
};

const RUNWAY_STATES = {
  free: { label: "Libre", className: "runway--free", color: "#16e1a3" },
  taxi: { label: "Taxi", className: "runway--taxi", color: "#7f5fff" },
  takeoff: { label: "Décollage", className: "runway--takeoff", color: "#ffb020" },
  landing: { label: "Atterrissage", className: "runway--landing", color: "#4b7dff" },
  closed: { label: "Fermée", className: "runway--closed", color: "#ff3b5c" },
};

const nowIso = () => new Date().toISOString();

function safeJsonParse(value, fallback) {
  try {
    const parsed = JSON.parse(value);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function loadStorage(key, fallback) {
  const raw = localStorage.getItem(key);
  if (raw == null) return fallback;
  return safeJsonParse(raw, fallback);
}

function saveStorage(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function uid(prefix = "id") {
  const n = crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}_${n}`;
}

function setActiveTopNav(route) {
  qsa(".topnav__link").forEach((a) => a.classList.toggle("topnav__link--active", a.dataset.route === route));
}

function setActivePage(route) {
  qsa(".page").forEach((p) => p.classList.toggle("page--active", p.dataset.page === route));
  setActiveTopNav(route);
}

function getRoute() {
  const hash = window.location.hash || "#/accueil";
  const m = hash.match(/^#\/([a-z0-9-]+)/i);
  return (m?.[1] || "accueil").toLowerCase();
}

function formatZulu(d = new Date()) {
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  const ss = String(d.getUTCSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}Z`;
}

const appState = {
  config: { ...DEFAULT_CONFIG, ...loadStorage(STORAGE_KEYS.config, {}) },
  theme: localStorage.getItem(STORAGE_KEYS.theme),
  session: loadStorage(STORAGE_KEYS.session, null),
  flights: loadStorage(STORAGE_KEYS.flights, null),
  log: loadStorage(STORAGE_KEYS.log, null),
  requests: loadStorage(STORAGE_KEYS.requests, null),
  runways: loadStorage(STORAGE_KEYS.runways, null),
  selectedFlightId: null,
  filter: { search: "", status: "all" },
  map: null,
  mapLayer: null,
  mapOverlay: null,
  markers: new Map(),
  requestMarkers: new Map(),
  runwayLayers: new Map(),
  mapMode: null,
  sync: null,
};

function seedFlights() {
  return [
    {
      id: uid("flt"),
      callsign: "EAGLE-11",
      type: "F/A-18",
      status: "ground",
      runway: "09L",
      route: "Start-up → Taxi → Hold short RWY 09L",
      position: null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    },
    {
      id: uid("flt"),
      callsign: "MED-3",
      type: "MEDEVAC",
      status: "air",
      runway: "27R",
      route: "Inbound → Priority landing",
      position: [33.98, -118.30],
      createdAt: nowIso(),
      updatedAt: nowIso(),
    },
    {
      id: uid("flt"),
      callsign: "SAR-5",
      type: "HELI",
      status: "emergency",
      runway: "",
      route: "Mayday declared → vectors requested",
      position: [33.92, -118.52],
      createdAt: nowIso(),
      updatedAt: nowIso(),
    },
  ];
}

function ensureState() {
  if (!Array.isArray(appState.flights)) {
    appState.flights = seedFlights();
    saveStorage(STORAGE_KEYS.flights, appState.flights);
  }
  if (!Array.isArray(appState.log)) {
    appState.log = [];
    saveStorage(STORAGE_KEYS.log, appState.log);
  }
  if (!Array.isArray(appState.requests)) {
    appState.requests = [];
    saveStorage(STORAGE_KEYS.requests, appState.requests);
  }
  if (!appState.runways || typeof appState.runways !== "object") {
    const initial = {};
    for (const r of appState.config?.runways || DEFAULT_CONFIG.runways) {
      initial[r.id] = "free";
    }
    appState.runways = initial;
    saveStorage(STORAGE_KEYS.runways, appState.runways);
  }
  if (typeof appState.config?.airport !== "string") {
    appState.config = { ...DEFAULT_CONFIG };
    saveStorage(STORAGE_KEYS.config, appState.config);
  }
  if (!Array.isArray(appState.config?.runways)) {
    appState.config = { ...DEFAULT_CONFIG, ...appState.config, runways: DEFAULT_CONFIG.runways };
    saveStorage(STORAGE_KEYS.config, appState.config);
  }
  if (appState.config?.map?.mode !== "image") {
    appState.config = { ...DEFAULT_CONFIG, ...appState.config, map: { ...DEFAULT_CONFIG.map, ...(appState.config.map || {}), mode: "image" } };
    saveStorage(STORAGE_KEYS.config, appState.config);
  }
}

function setTheme(theme) {
  const root = qs("#app");
  root.dataset.theme = theme;
  localStorage.setItem(STORAGE_KEYS.theme, theme);
  const label = theme === "light" ? "Clair" : "Sombre";
  qs("#themeLabel").textContent = `Thème: ${label}`;
}

function initTheme() {
  const prefersLight = window.matchMedia?.("(prefers-color-scheme: light)")?.matches ?? false;
  const theme = appState.theme || (prefersLight ? "light" : "dark");
  setTheme(theme);
}

function getSessionLabel() {
  if (!appState.session) return "Invité";
  const role = appState.session.role || "ATC";
  const name = appState.session.name || "Opérateur";
  return `${name} (${role})`;
}

function isAtcRole() {
  const role = appState.session?.role || "";
  return role === "ATC" || role === "TRMC" || role === "Admin";
}

function isPilotRole() {
  return (appState.session?.role || "") === "Pilot";
}

function setSession(session) {
  appState.session = session;
  if (session) saveStorage(STORAGE_KEYS.session, session);
  else localStorage.removeItem(STORAGE_KEYS.session);
  qs("#sessionBadge").textContent = getSessionLabel();
  qs("#loginBtn").textContent = session ? "Changer" : "Se connecter";
  renderRunways();
  renderRequests();
}

function addLogEntry(entry) {
  const normalized = {
    id: uid("log"),
    time: nowIso(),
    title: entry.title || "Action",
    text: entry.text || "",
    flightId: entry.flightId || null,
    actor: appState.session ? getSessionLabel() : "Invité",
  };
  appState.log.unshift(normalized);
  if (appState.log.length > 250) appState.log.length = 250;
  saveStorage(STORAGE_KEYS.log, appState.log);
  renderLog();
}

function setBriefing(text) {
  saveStorage(STORAGE_KEYS.briefing, text);
  const el = qs("#briefingText");
  if (el) el.textContent = text?.trim() ? text.trim() : "Ajoutez ici vos consignes du jour (meteo, NOTAM RP, exercices, zones actives).";
}

function statusPill(status) {
  const label = STATUS_LABELS[status] || status || "—";
  const cls = STATUS_PILL_CLASS[status] || "";
  return { label, cls };
}

function getFilteredFlights() {
  const search = appState.filter.search.trim().toLowerCase();
  const status = appState.filter.status;
  return appState.flights
    .filter((f) => (status === "all" ? true : f.status === status))
    .filter((f) => {
      if (!search) return true;
      const hay = `${f.callsign} ${f.type} ${f.status} ${f.runway} ${f.route}`.toLowerCase();
      return hay.includes(search);
    })
    .sort((a, b) => (b.updatedAt || b.createdAt).localeCompare(a.updatedAt || a.createdAt));
}

function renderFlights() {
  const list = qs("#flightList");
  if (!list) return;
  const flights = getFilteredFlights();
  list.innerHTML = "";

  qs("#flightCount").textContent = `${flights.filter((f) => f.status !== "closed").length} actifs`;

  for (const f of flights) {
    const item = document.createElement("div");
    item.className = "flight";
    if (f.id === appState.selectedFlightId) item.classList.add("flight--active");
    item.setAttribute("role", "listitem");
    item.dataset.id = f.id;

    const pill = statusPill(f.status);
    const runway = (f.runway || "").trim() ? `RWY ${f.runway}` : "—";
    item.innerHTML = `
      <div class="flight__top">
        <div>
          <div class="flight__callsign">${escapeHtml(f.callsign || "—")}</div>
          <div class="flight__type">${escapeHtml(f.type || "—")}</div>
        </div>
        <div class="pill ${pill.cls}">${escapeHtml(pill.label)}</div>
      </div>
      <div class="flight__meta">
        <div>${escapeHtml((f.route || "").slice(0, 80) || "—")}</div>
        <div>${escapeHtml(runway)}</div>
      </div>
    `;
    item.addEventListener("click", () => selectFlight(f.id));
    list.appendChild(item);
  }

  syncMarkers();
}

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function findFlight(id) {
  return appState.flights.find((f) => f.id === id) || null;
}

function saveFlights() {
  saveStorage(STORAGE_KEYS.flights, appState.flights);
}

function updateFlight(id, patch) {
  const f = findFlight(id);
  if (!f) return null;
  Object.assign(f, patch, { updatedAt: nowIso() });
  saveFlights();
  renderFlights();
  if (id === appState.selectedFlightId) renderStrip();
  return f;
}

function selectFlight(id) {
  appState.selectedFlightId = id;
  renderFlights();
  renderStrip();
  focusMarker(id);
}

function renderStrip() {
  const f = appState.selectedFlightId ? findFlight(appState.selectedFlightId) : null;
  qs("#selectedCallsign").textContent = f ? f.callsign : "Aucun vol sélectionné";
  const pill = statusPill(f?.status);
  const pillEl = qs("#selectedStatus");
  pillEl.className = `pill ${pill.cls}`;
  pillEl.textContent = pill.label;

  qs("#stripCallsign").value = f?.callsign || "";
  qs("#stripType").value = f?.type || "";
  qs("#stripStatus").value = f?.status || "ground";
  qs("#stripRunway").value = f?.runway || "";
  qs("#stripRoute").value = f?.route || "";

  const disabled = !f;
  qsa("#strip input, #strip select, #strip textarea, #strip button").forEach((el) => {
    el.disabled = disabled;
  });
}

function renderLog() {
  const root = qs("#log");
  if (!root) return;
  root.innerHTML = "";
  const items = appState.log.slice(0, 80);
  for (const it of items) {
    const node = document.createElement("div");
    node.className = "logitem";
    const time = new Date(it.time).toLocaleString("fr-FR", { hour12: false });
    const flight = it.flightId ? findFlight(it.flightId) : null;
    const title = flight ? `${it.title} — ${flight.callsign}` : it.title;
    const text = `${it.text}${it.actor ? `\n${it.actor}` : ""}`.trim();
    node.innerHTML = `
      <div class="logitem__top">
        <div class="logitem__title">${escapeHtml(title)}</div>
        <div class="logitem__time">${escapeHtml(time)}</div>
      </div>
      <div class="logitem__text">${escapeHtml(text).replaceAll("\n", "<br/>")}</div>
    `;
    root.appendChild(node);
  }
}

function bindStripInputs() {
  const callsign = qs("#stripCallsign");
  const type = qs("#stripType");
  const status = qs("#stripStatus");
  const runway = qs("#stripRunway");
  const route = qs("#stripRoute");

  const apply = () => {
    if (!appState.selectedFlightId) return;
    updateFlight(appState.selectedFlightId, {
      callsign: callsign.value.trim().slice(0, 16),
      type: type.value.trim().slice(0, 24),
      status: status.value,
      runway: runway.value.trim().slice(0, 8),
      route: route.value.trim().slice(0, 280),
    });
  };

  [callsign, type, runway].forEach((el) => el.addEventListener("input", debounce(apply, 120)));
  [route].forEach((el) => el.addEventListener("input", debounce(apply, 180)));
  [status].forEach((el) => el.addEventListener("change", () => {
    apply();
    addLogEntry({
      title: "Changement statut",
      text: `Statut → ${STATUS_LABELS[status.value] || status.value}`,
      flightId: appState.selectedFlightId,
    });
  }));
}

function debounce(fn, waitMs) {
  let t = null;
  return (...args) => {
    if (t) window.clearTimeout(t);
    t = window.setTimeout(() => fn(...args), waitMs);
  };
}

function openModal(title, bodyNode) {
  const modal = qs("#modal");
  qs("#modalTitle").textContent = title;
  const body = qs("#modalBody");
  body.innerHTML = "";
  body.appendChild(bodyNode);
  modal.classList.remove("modal--hidden");
  const focusable = qsa("button, [href], input, select, textarea", modal).filter((el) => !el.disabled);
  focusable[0]?.focus?.();
}

function closeModal() {
  qs("#modal").classList.add("modal--hidden");
}

function openLoginModal() {
  const wrap = document.createElement("div");
  wrap.className = "form";

  const row = document.createElement("div");
  row.className = "form__row";

  const nameField = document.createElement("div");
  nameField.className = "field";
  nameField.innerHTML = `<div class="field__label">Nom / Indicatif opérateur</div>`;
  const nameInput = document.createElement("input");
  nameInput.className = "input";
  nameInput.placeholder = "Ex: Alpha";
  nameInput.value = appState.session?.name || "";
  nameField.appendChild(nameInput);

  const roleField = document.createElement("div");
  roleField.className = "field";
  roleField.innerHTML = `<div class="field__label">Rôle</div>`;
  const roleSelect = document.createElement("select");
  roleSelect.className = "input";
  roleSelect.innerHTML = `
    <option value="ATC">ATC</option>
    <option value="TRMC">TRMC</option>
    <option value="Admin">Admin</option>
    <option value="Pilot">Pilote</option>
  `;
  roleSelect.value = appState.session?.role || "ATC";
  roleField.appendChild(roleSelect);

  row.appendChild(nameField);
  row.appendChild(roleField);

  const notice = document.createElement("div");
  notice.className = "notice";
  notice.textContent =
    "Connexion locale (navigateur). Pour du multi-opérateurs et de la sécurité réelle, branchez un backend (Discord OAuth / API).";

  const actions = document.createElement("div");
  actions.className = "form__actions";

  const logoutBtn = document.createElement("button");
  logoutBtn.className = "btn btn--ghost";
  logoutBtn.type = "button";
  logoutBtn.textContent = "Déconnexion";
  logoutBtn.disabled = !appState.session;
  logoutBtn.addEventListener("click", () => {
    setSession(null);
    addLogEntry({ title: "Session", text: "Déconnexion" });
    closeModal();
  });

  const saveBtn = document.createElement("button");
  saveBtn.className = "btn btn--primary";
  saveBtn.type = "button";
  saveBtn.textContent = "Valider";
  saveBtn.addEventListener("click", () => {
    const name = nameInput.value.trim().slice(0, 18) || "Opérateur";
    const role = roleSelect.value;
    setSession({ name, role });
    addLogEntry({ title: "Session", text: `Connexion: ${name} (${role})` });
    closeModal();
  });

  actions.appendChild(logoutBtn);
  actions.appendChild(saveBtn);

  wrap.appendChild(row);
  wrap.appendChild(notice);
  wrap.appendChild(actions);

  openModal("Connexion", wrap);
}

function openAddFlightModal() {
  const wrap = document.createElement("div");
  wrap.className = "form";

  const row = document.createElement("div");
  row.className = "form__row";

  const callsignField = document.createElement("div");
  callsignField.className = "field";
  callsignField.innerHTML = `<div class="field__label">Callsign</div>`;
  const callsign = document.createElement("input");
  callsign.className = "input";
  callsign.placeholder = "Ex: EAGLE-12";
  callsignField.appendChild(callsign);

  const typeField = document.createElement("div");
  typeField.className = "field";
  typeField.innerHTML = `<div class="field__label">Type</div>`;
  const type = document.createElement("input");
  type.className = "input";
  type.placeholder = "Ex: F-16 / HELI / CARGO";
  typeField.appendChild(type);

  row.appendChild(callsignField);
  row.appendChild(typeField);

  const row2 = document.createElement("div");
  row2.className = "form__row";

  const statusField = document.createElement("div");
  statusField.className = "field";
  statusField.innerHTML = `<div class="field__label">Statut</div>`;
  const status = document.createElement("select");
  status.className = "input";
  status.innerHTML = `
    <option value="ground">Sol</option>
    <option value="air">Air</option>
    <option value="emergency">Urgence</option>
  `;
  statusField.appendChild(status);

  const runwayField = document.createElement("div");
  runwayField.className = "field";
  runwayField.innerHTML = `<div class="field__label">Piste (optionnel)</div>`;
  const runway = document.createElement("input");
  runway.className = "input";
  runway.placeholder = "Ex: 09L";
  runwayField.appendChild(runway);

  row2.appendChild(statusField);
  row2.appendChild(runwayField);

  const routeField = document.createElement("div");
  routeField.className = "field";
  routeField.innerHTML = `<div class="field__label">Route / Notes</div>`;
  const route = document.createElement("textarea");
  route.className = "input textarea";
  route.rows = 4;
  route.placeholder = "Ex: Start-up, taxi via A, hold short RWY 09L...";
  routeField.appendChild(route);

  const actions = document.createElement("div");
  actions.className = "form__actions";

  const cancelBtn = document.createElement("button");
  cancelBtn.className = "btn btn--ghost";
  cancelBtn.type = "button";
  cancelBtn.textContent = "Annuler";
  cancelBtn.addEventListener("click", closeModal);

  const createBtn = document.createElement("button");
  createBtn.className = "btn btn--primary";
  createBtn.type = "button";
  createBtn.textContent = "Créer";
  createBtn.addEventListener("click", () => {
    const callsignValue = callsign.value.trim().slice(0, 16);
    if (!callsignValue) {
      callsign.focus();
      return;
    }
    const flight = {
      id: uid("flt"),
      callsign: callsignValue,
      type: type.value.trim().slice(0, 24) || "—",
      status: status.value,
      runway: runway.value.trim().slice(0, 8),
      route: route.value.trim().slice(0, 280),
      position: null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    appState.flights.unshift(flight);
    saveFlights();
    addLogEntry({ title: "Nouveau vol", text: `Création: ${flight.callsign}`, flightId: flight.id });
    closeModal();
    selectFlight(flight.id);
  });

  actions.appendChild(cancelBtn);
  actions.appendChild(createBtn);

  wrap.appendChild(row);
  wrap.appendChild(row2);
  wrap.appendChild(routeField);
  wrap.appendChild(actions);

  openModal("Nouveau vol", wrap);
  callsign.focus();
}

function bindTabs() {
  qsa(".tabs__btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      qsa(".tabs__btn").forEach((b) => b.classList.toggle("tabs__btn--active", b === btn));
      qsa(".tab").forEach((t) => t.classList.toggle("tab--active", t.dataset.tab === btn.dataset.tab));
    });
  });
}

function bindFilters() {
  const search = qs("#flightSearch");
  search.addEventListener("input", () => {
    appState.filter.search = search.value;
    renderFlights();
  });

  qsa(".segmented__btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      qsa(".segmented__btn").forEach((b) => b.classList.toggle("segmented__btn--active", b === btn));
      appState.filter.status = btn.dataset.filter;
      renderFlights();
    });
  });
}

function bindActions() {
  qs("#themeToggle").addEventListener("click", () => {
    const next = qs("#app").dataset.theme === "light" ? "dark" : "light";
    setTheme(next);
  });

  qs("#loginBtn").addEventListener("click", openLoginModal);
  qs("#addFlightBtn").addEventListener("click", openAddFlightModal);

  qs("#exportBtn").addEventListener("click", () => {
    downloadJson(`atc-log-${new Date().toISOString().slice(0, 10)}.json`, {
      exportedAt: nowIso(),
      config: appState.config,
      session: appState.session,
      flights: appState.flights,
      log: appState.log,
    });
  });

  qs("#resetBtn").addEventListener("click", () => {
    openConfirmResetModal();
  });

  qs("#actTaxi").addEventListener("click", () => act("Clairance", "Clear Taxi", { status: "ground" }));
  qs("#actTakeoff").addEventListener("click", () => act("Clairance", "Clear Takeoff", { status: "air" }));
  qs("#actHold").addEventListener("click", () => act("Instruction", "Hold position", null));
  qs("#actMayday").addEventListener("click", () => act("Urgence", "Mayday / PAN-PAN", { status: "emergency" }));

  qs("#saveBriefingBtn").addEventListener("click", () => {
    const val = qs("#briefingEditor").value;
    setBriefing(val);
    addLogEntry({ title: "Briefing", text: "Briefing mis à jour" });
  });
  qs("#clearBriefingBtn").addEventListener("click", () => {
    qs("#briefingEditor").value = "";
    setBriefing("");
    addLogEntry({ title: "Briefing", text: "Briefing effacé" });
  });

  const modal = qs("#modal");
  modal.addEventListener("click", (e) => {
    const t = e.target;
    if (t?.dataset?.close) closeModal();
  });

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModal();
    if (e.key === "/" && getRoute() === "dashboard") {
      e.preventDefault();
      qs("#flightSearch")?.focus();
    }
    if ((e.key === "n" || e.key === "N") && getRoute() === "dashboard") {
      e.preventDefault();
      openAddFlightModal();
    }
  });
}

function act(title, text, patch) {
  const id = appState.selectedFlightId;
  if (!id) return;
  const f = findFlight(id);
  if (!f) return;
  if (patch) updateFlight(id, patch);
  addLogEntry({ title, text: `${text} (${f.callsign})`, flightId: id });
}

function openConfirmResetModal() {
  const wrap = document.createElement("div");
  wrap.className = "form";

  const notice = document.createElement("div");
  notice.className = "notice";
  notice.textContent = "Cette action efface les vols, le briefing, le journal et la session sur CE navigateur.";

  const actions = document.createElement("div");
  actions.className = "form__actions";

  const cancelBtn = document.createElement("button");
  cancelBtn.className = "btn btn--ghost";
  cancelBtn.type = "button";
  cancelBtn.textContent = "Annuler";
  cancelBtn.addEventListener("click", closeModal);

  const confirmBtn = document.createElement("button");
  confirmBtn.className = "btn btn--danger";
  confirmBtn.type = "button";
  confirmBtn.textContent = "Réinitialiser";
  confirmBtn.addEventListener("click", () => {
    localStorage.removeItem(STORAGE_KEYS.session);
    localStorage.removeItem(STORAGE_KEYS.flights);
    localStorage.removeItem(STORAGE_KEYS.log);
    localStorage.removeItem(STORAGE_KEYS.briefing);
    localStorage.removeItem(STORAGE_KEYS.config);
    localStorage.removeItem(STORAGE_KEYS.requests);
    localStorage.removeItem(STORAGE_KEYS.runways);
    window.location.reload();
  });

  actions.appendChild(cancelBtn);
  actions.appendChild(confirmBtn);
  wrap.appendChild(notice);
  wrap.appendChild(actions);

  openModal("Réinitialiser", wrap);
}

function ensureMap() {
  if (getRoute() !== "dashboard") return;
  const mapEl = qs("#map");
  if (!mapEl) return;
  if (!window.L) {
    mapEl.innerHTML = `<div style="padding:14px;color:var(--muted)">Leaflet indisponible (CDN). Vérifiez la connexion internet.</div>`;
    return;
  }

  const mode = "image";
  if (appState.mapMode === mode && appState.map && appState.mapLayer) {
    appState.map.invalidateSize();
    syncMarkers();
    return;
  }

  appState.mapMode = mode;
  if (appState.map) {
    try {
      appState.map.remove();
    } catch {}
    appState.map = null;
    appState.mapLayer = null;
    appState.mapOverlay = null;
    appState.markers = new Map();
    mapEl.innerHTML = "";
  }

  const url = appState.config.map.image.url?.trim();
  const bounds = appState.config.map.image.bounds;
  if (!url) {
    mapEl.innerHTML = `<div style="padding:14px;color:var(--muted)">Aucune carte configurée. Mets ton image dans <b>assets/map/</b> (map.png / map.jpg) puis recharge.</div>`;
    return;
  }

  const crs = window.L.CRS.Simple;
  appState.map = window.L.map(mapEl, {
    crs,
    minZoom: appState.config.map.image.minZoom,
    maxZoom: appState.config.map.image.maxZoom,
    zoomControl: false,
    dragging: false,
    scrollWheelZoom: false,
    doubleClickZoom: false,
    boxZoom: false,
    keyboard: false,
    touchZoom: false,
    attributionControl: false,
    inertia: false,
  });
  appState.mapOverlay = window.L.imageOverlay(url, bounds).addTo(appState.map);
  appState.map.fitBounds(bounds);
  try {
    appState.map.setMaxBounds(bounds);
  } catch {}
  try {
    appState.map.setZoom(appState.config.map.image.initialZoom);
  } catch {}
  appState.mapLayer = appState.mapOverlay;
  appState.map.on("click", (e) => onMapClick(e.latlng));

  appState.map.invalidateSize();
  syncMarkers();
  syncRequestMarkers();
  syncRunwayLayers();
}

function clearMapLayers() {
  if (!appState.map) return;
  for (const [id, marker] of appState.markers.entries()) {
    appState.map.removeLayer(marker);
    appState.markers.delete(id);
  }
  if (appState.mapLayer) {
    try {
      appState.map.removeLayer(appState.mapLayer);
    } catch {}
  }
  appState.mapLayer = null;
  appState.mapOverlay = null;
}

function syncMarkers() {
  if (!appState.map || !window.L) return;
  const flights = appState.flights.filter((f) => Array.isArray(f.position) && f.position.length === 2 && f.status !== "closed");
  const existing = new Set(appState.markers.keys());
  for (const f of flights) {
    existing.delete(f.id);
    const pos = f.position;
    if (appState.markers.has(f.id)) {
      appState.markers.get(f.id).setLatLng(pos);
      continue;
    }
    const marker = window.L.marker(pos, { title: f.callsign });
    marker.addTo(appState.map);
    marker.bindPopup(`<b>${escapeHtml(f.callsign)}</b><br/>${escapeHtml(f.type || "")}`);
    marker.on("click", () => selectFlight(f.id));
    appState.markers.set(f.id, marker);
  }
  for (const id of existing) {
    const marker = appState.markers.get(id);
    if (marker) appState.map.removeLayer(marker);
    appState.markers.delete(id);
  }
}

function focusMarker(flightId) {
  if (!flightId || !appState.map) return;
  const marker = appState.markers.get(flightId);
  if (!marker) return;
  try {
    if (appState.mapMode !== "image") {
      appState.map.setView(marker.getLatLng(), Math.max(appState.map.getZoom(), 12), { animate: true });
    }
    marker.openPopup();
  } catch {}
}

function bindRouter() {
  const go = () => {
    const route = getRoute();
    if (route === "procedures") {
      openProceduresModal();
      try {
        history.replaceState(null, "", "#/dashboard");
      } catch {
        window.location.hash = "#/dashboard";
      }
      return;
    }
    if (route === "briefing") {
      setActivePage("dashboard");
      ensureMap();
      renderFlights();
      renderStrip();
      renderLog();
      renderRunways();
      renderRequests();
      setActiveTab("briefing");
      try {
        history.replaceState(null, "", "#/dashboard");
      } catch {}
      return;
    }

    const finalRoute = "dashboard";
    setActivePage(finalRoute);
    if (finalRoute === "dashboard") {
      if (!appState.config?.map?.image?.url && (appState.config?.map?.mode === "image" || true)) {
        detectLocalMap();
      }
      ensureMap();
      renderFlights();
      renderStrip();
      renderLog();
      renderRunways();
      renderRequests();
    }
  };
  window.addEventListener("hashchange", go);
  go();
}

function setActiveTab(tab) {
  qsa(".tabs__btn").forEach((b) => b.classList.toggle("tabs__btn--active", b.dataset.tab === tab));
  qsa(".tab").forEach((t) => t.classList.toggle("tab--active", t.dataset.tab === tab));
}

function openProceduresModal() {
  const src = qs("#page-procedures .content");
  if (!src) return;
  const clone = src.cloneNode(true);
  const editor = clone.querySelector("#briefingEditor");
  if (editor) editor.remove();
  const buttons = clone.querySelectorAll("#saveBriefingBtn, #clearBriefingBtn");
  buttons.forEach((b) => b.remove());
  openModal("Procédures", clone);
}

function initZuluClock() {
  const el = qs("#zuluTime");
  const tick = () => (el.textContent = formatZulu(new Date()));
  tick();
  window.setInterval(tick, 1000);
}

function initBriefing() {
  const val = localStorage.getItem(STORAGE_KEYS.briefing);
  const briefing = val ?? "";
  qs("#briefingEditor").value = briefing;
  setBriefing(briefing);
}

function initConfigUi() {
  qs("#activeAirportBadge").textContent = `Aéroport: ${appState.config.airport}`;
}

function initSync() {
  if (!("BroadcastChannel" in window)) return;
  const ch = new BroadcastChannel("atc_sync_v1");
  appState.sync = ch;
  ch.addEventListener("message", (e) => {
    const msg = e.data;
    if (!msg || typeof msg !== "object") return;
    if (msg.type === "requests") {
      appState.requests = loadStorage(STORAGE_KEYS.requests, []);
      renderRequests();
      syncRequestMarkers();
      return;
    }
    if (msg.type === "runways") {
      appState.runways = loadStorage(STORAGE_KEYS.runways, {});
      renderRunways();
      syncRunwayLayers();
      return;
    }
  });
}

function init() {
  ensureState();
  initTheme();
  initZuluClock();
  initBriefing();
  initConfigUi();
  initSync();
  setSession(appState.session);
  bindRouter();
  bindFilters();
  bindStripInputs();
  bindTabs();
  bindActions();

  addLogEntry({ title: "Système", text: "Interface chargée" });
}

init();

function notifySync(type) {
  try {
    appState.sync?.postMessage({ type, at: Date.now() });
  } catch {}
}

function saveRequests() {
  saveStorage(STORAGE_KEYS.requests, appState.requests);
  notifySync("requests");
}

function saveRunways() {
  saveStorage(STORAGE_KEYS.runways, appState.runways);
  notifySync("runways");
}

function getRunwayIds() {
  const ids = (appState.config?.runways || []).map((r) => r.id).filter(Boolean);
  return ids.length ? ids : Object.keys(appState.runways || {});
}

function getRunwayState(runwayId) {
  const s = appState.runways?.[runwayId];
  return RUNWAY_STATES[s] ? s : "free";
}

function setRunwayState(runwayId, state) {
  if (!RUNWAY_STATES[state]) state = "free";
  appState.runways = { ...(appState.runways || {}), [runwayId]: state };
  saveRunways();
  renderRunways();
  syncRunwayLayers();
}

function renderRunways() {
  const root = qs("#runways");
  if (!root) return;
  const runwayIds = getRunwayIds();
  root.innerHTML = "";
  for (const id of runwayIds) {
    const state = getRunwayState(id);
    const def = RUNWAY_STATES[state];
    const btn = document.createElement("div");
    btn.className = `runway ${def.className}`;
    btn.innerHTML = `
      <div class="runway__dot" aria-hidden="true"></div>
      <div class="runway__id">${escapeHtml(id)}</div>
      <div class="runway__state">${escapeHtml(def.label)}</div>
    `;
    btn.addEventListener("click", () => {
      if (!isAtcRole()) return;
      openRunwayStateModal(id);
    });
    root.appendChild(btn);
  }
}

function openRunwayStateModal(runwayId) {
  const wrap = document.createElement("div");
  wrap.className = "form";

  const field = document.createElement("div");
  field.className = "field";
  field.innerHTML = `<div class="field__label">État piste ${escapeHtml(runwayId)}</div>`;

  const sel = document.createElement("select");
  sel.className = "input";
  sel.innerHTML = Object.entries(RUNWAY_STATES)
    .map(([k, v]) => `<option value="${escapeHtml(k)}">${escapeHtml(v.label)}</option>`)
    .join("");
  sel.value = getRunwayState(runwayId);
  field.appendChild(sel);

  const actions = document.createElement("div");
  actions.className = "form__actions";

  const cancelBtn = document.createElement("button");
  cancelBtn.className = "btn btn--ghost";
  cancelBtn.type = "button";
  cancelBtn.textContent = "Annuler";
  cancelBtn.addEventListener("click", closeModal);

  const saveBtn = document.createElement("button");
  saveBtn.className = "btn btn--primary";
  saveBtn.type = "button";
  saveBtn.textContent = "Appliquer";
  saveBtn.addEventListener("click", () => {
    setRunwayState(runwayId, sel.value);
    addLogEntry({ title: "Piste", text: `RWY ${runwayId} → ${RUNWAY_STATES[sel.value]?.label || sel.value}` });
    closeModal();
  });

  actions.appendChild(cancelBtn);
  actions.appendChild(saveBtn);

  wrap.appendChild(field);
  wrap.appendChild(actions);
  openModal(`Piste ${runwayId}`, wrap);
}

function requestTypeOptions() {
  return [
    { id: "taxi", label: "Demande taxi" },
    { id: "takeoff", label: "Demande décollage" },
    { id: "landing", label: "Demande atterrissage" },
    { id: "parking", label: "Demande stationnement" },
    { id: "other", label: "Autre" },
  ];
}

function requestTypeToRunwayState(type) {
  if (type === "takeoff") return "takeoff";
  if (type === "landing") return "landing";
  return null;
}

function formatRequestLocation(pos) {
  if (!pos || typeof pos !== "object") return "—";
  const x = typeof pos.x === "number" ? pos.x : null;
  const y = typeof pos.y === "number" ? pos.y : null;
  if (x == null || y == null) return "—";
  return `x=${Math.round(x)} / y=${Math.round(y)}`;
}

function onMapClick(latlng) {
  if (appState.mapMode !== "image") return;
  if (isAtcRole()) return;
  openPilotRequestModal(latlng);
}

function openPilotRequestModal(latlng) {
  const wrap = document.createElement("div");
  wrap.className = "form";

  const row = document.createElement("div");
  row.className = "form__row";

  const csField = document.createElement("div");
  csField.className = "field";
  csField.innerHTML = `<div class="field__label">Callsign</div>`;
  const cs = document.createElement("input");
  cs.className = "input";
  cs.placeholder = "Ex: EAGLE-12 / SAR-5";
  cs.value = isPilotRole() ? (appState.session?.name || "") : "";
  csField.appendChild(cs);

  const craftField = document.createElement("div");
  craftField.className = "field";
  craftField.innerHTML = `<div class="field__label">Appareil</div>`;
  const craft = document.createElement("select");
  craft.className = "input";
  craft.innerHTML = `
    <option value="avion">Avion</option>
    <option value="helico">Hélico</option>
  `;
  craftField.appendChild(craft);

  row.appendChild(csField);
  row.appendChild(craftField);

  const row2 = document.createElement("div");
  row2.className = "form__row";

  const typeField = document.createElement("div");
  typeField.className = "field";
  typeField.innerHTML = `<div class="field__label">Type de demande</div>`;
  const type = document.createElement("select");
  type.className = "input";
  type.innerHTML = requestTypeOptions().map((o) => `<option value="${escapeHtml(o.id)}">${escapeHtml(o.label)}</option>`).join("");
  typeField.appendChild(type);

  const runwayField = document.createElement("div");
  runwayField.className = "field";
  runwayField.innerHTML = `<div class="field__label">Piste souhaitée</div>`;
  const runway = document.createElement("select");
  runway.className = "input";
  runway.innerHTML = getRunwayIds().map((id) => `<option value="${escapeHtml(id)}">${escapeHtml(id)}</option>`).join("");
  runwayField.appendChild(runway);

  row2.appendChild(typeField);
  row2.appendChild(runwayField);

  const notesField = document.createElement("div");
  notesField.className = "field";
  notesField.innerHTML = `<div class="field__label">Message</div>`;
  const notes = document.createElement("textarea");
  notes.className = "input textarea";
  notes.rows = 4;
  notes.placeholder = "Ex: ready for departure / short final / request taxi to RWY 30...";
  notesField.appendChild(notes);

  const loc = document.createElement("div");
  loc.className = "notice";
  const pos = { x: latlng?.lng, y: latlng?.lat };
  loc.textContent = `Position: ${formatRequestLocation(pos)}`;

  const actions = document.createElement("div");
  actions.className = "form__actions";

  const cancelBtn = document.createElement("button");
  cancelBtn.className = "btn btn--ghost";
  cancelBtn.type = "button";
  cancelBtn.textContent = "Annuler";
  cancelBtn.addEventListener("click", closeModal);

  const sendBtn = document.createElement("button");
  sendBtn.className = "btn btn--primary";
  sendBtn.type = "button";
  sendBtn.textContent = "Envoyer à l’ATC";
  sendBtn.addEventListener("click", () => {
    const callsign = cs.value.trim().slice(0, 16);
    if (!callsign) {
      cs.focus();
      return;
    }
    const req = {
      id: uid("req"),
      createdAt: nowIso(),
      updatedAt: nowIso(),
      status: "pending",
      callsign,
      craft: craft.value,
      type: type.value,
      runway: runway.value,
      notes: notes.value.trim().slice(0, 360),
      position: pos,
      decision: null,
    };
    appState.requests.unshift(req);
    saveRequests();
    addLogEntry({ title: "Demande", text: `Nouvelle demande: ${callsign} (${req.type})`, flightId: null });
    closeModal();
    renderRequests();
    syncRequestMarkers();
  });

  actions.appendChild(cancelBtn);
  actions.appendChild(sendBtn);

  wrap.appendChild(row);
  wrap.appendChild(row2);
  wrap.appendChild(notesField);
  wrap.appendChild(loc);
  wrap.appendChild(actions);

  openModal("Demande pilote", wrap);
  cs.focus();
}

function renderRequests() {
  const root = qs("#requests");
  if (!root) return;
  if (!Array.isArray(appState.requests)) return;

  const pendingCount = appState.requests.filter((r) => r.status === "pending").length;
  const countEl = qs("#requestsCount");
  if (countEl) countEl.textContent = `${pendingCount} en attente`;

  root.innerHTML = "";
  const items = [...appState.requests].sort((a, b) => (b.updatedAt || b.createdAt).localeCompare(a.updatedAt || a.createdAt));

  for (const r of items) {
    const node = document.createElement("div");
    node.className = "request";

    const badgeCls = REQUEST_STATUS_BADGE_CLASS[r.status] || "badge2--pending";
    const badgeLabel = REQUEST_STATUS_LABELS[r.status] || r.status;

    const time = new Date(r.createdAt).toLocaleString("fr-FR", { hour12: false });
    const runwayState = r.runway ? getRunwayState(r.runway) : "free";
    const runwayBlocked = requestTypeToRunwayState(r.type) && runwayState !== "free";

    node.innerHTML = `
      <div class="request__top">
        <div class="request__title">${escapeHtml(r.callsign)} — ${escapeHtml(requestTypeOptions().find((o) => o.id === r.type)?.label || r.type)}</div>
        <div class="badge2 ${badgeCls}">${escapeHtml(badgeLabel)}</div>
      </div>
      <div class="request__meta">
        <div>Piste: <b>${escapeHtml(r.runway || "—")}</b> ${runwayBlocked ? "(occupée)" : ""}</div>
        <div>Position: ${escapeHtml(formatRequestLocation(r.position))}</div>
        <div>${escapeHtml(time)} · ${escapeHtml(r.craft === "helico" ? "Hélico" : "Avion")}</div>
        ${r.notes ? `<div>${escapeHtml(r.notes)}</div>` : ""}
        ${r.decision?.reason ? `<div>Motif: ${escapeHtml(r.decision.reason)}</div>` : ""}
      </div>
    `;

    if (isAtcRole() && r.status === "pending") {
      const actions = document.createElement("div");
      actions.className = "request__actions";

      const acceptBtn = document.createElement("button");
      acceptBtn.className = "btn btn--primary btn--sm";
      acceptBtn.type = "button";
      acceptBtn.textContent = "Accepter";
      acceptBtn.disabled = Boolean(runwayBlocked);
      acceptBtn.addEventListener("click", () => acceptRequest(r.id));

      const denyBtn = document.createElement("button");
      denyBtn.className = "btn btn--danger btn--sm";
      denyBtn.type = "button";
      denyBtn.textContent = runwayBlocked ? "Refuser (occupée)" : "Refuser";
      denyBtn.addEventListener("click", () => openDenyRequestModal(r.id));

      actions.appendChild(denyBtn);
      actions.appendChild(acceptBtn);
      node.appendChild(actions);
    }

    root.appendChild(node);
  }
}

function findRequest(id) {
  return appState.requests.find((r) => r.id === id) || null;
}

function acceptRequest(id) {
  const r = findRequest(id);
  if (!r || r.status !== "pending") return;
  const runwayImpact = requestTypeToRunwayState(r.type);
  if (runwayImpact && r.runway) {
    const current = getRunwayState(r.runway);
    if (current !== "free") {
      denyRequest(id, "Piste occupée");
      return;
    }
    setRunwayState(r.runway, runwayImpact);
  }
  r.status = "accepted";
  r.updatedAt = nowIso();
  r.decision = { by: getSessionLabel(), at: nowIso(), reason: "" };
  saveRequests();
  addLogEntry({ title: "Demande", text: `Acceptée: ${r.callsign} (${r.type})` });
  renderRequests();
  syncRequestMarkers();
}

function denyRequest(id, reason) {
  const r = findRequest(id);
  if (!r || r.status !== "pending") return;
  r.status = "denied";
  r.updatedAt = nowIso();
  r.decision = { by: getSessionLabel(), at: nowIso(), reason: reason || "Refusée" };
  saveRequests();
  addLogEntry({ title: "Demande", text: `Refusée: ${r.callsign} (${r.type})` });
  renderRequests();
  syncRequestMarkers();
}

function openDenyRequestModal(id) {
  const r = findRequest(id);
  if (!r) return;
  const wrap = document.createElement("div");
  wrap.className = "form";

  const field = document.createElement("div");
  field.className = "field";
  field.innerHTML = `<div class="field__label">Motif de refus</div>`;
  const ta = document.createElement("textarea");
  ta.className = "input textarea";
  ta.rows = 4;
  ta.placeholder = "Ex: piste occupée / vent / trafic / mauvaise piste...";
  field.appendChild(ta);

  const actions = document.createElement("div");
  actions.className = "form__actions";

  const cancelBtn = document.createElement("button");
  cancelBtn.className = "btn btn--ghost";
  cancelBtn.type = "button";
  cancelBtn.textContent = "Annuler";
  cancelBtn.addEventListener("click", closeModal);

  const confirmBtn = document.createElement("button");
  confirmBtn.className = "btn btn--danger";
  confirmBtn.type = "button";
  confirmBtn.textContent = "Refuser";
  confirmBtn.addEventListener("click", () => {
    denyRequest(id, ta.value.trim().slice(0, 180));
    closeModal();
  });

  actions.appendChild(cancelBtn);
  actions.appendChild(confirmBtn);
  wrap.appendChild(field);
  wrap.appendChild(actions);
  openModal(`Refuser ${r.callsign}`, wrap);
  ta.focus();
}

function syncRequestMarkers() {
  if (!appState.map || !window.L || appState.mapMode !== "image") return;
  const existing = new Set(appState.requestMarkers.keys());
  for (const r of appState.requests) {
    if (r.status !== "pending") continue;
    if (!r.position || typeof r.position.x !== "number" || typeof r.position.y !== "number") continue;
    const id = r.id;
    existing.delete(id);
    const pos = [r.position.y, r.position.x];
    const color = "#ffb020";
    if (appState.requestMarkers.has(id)) {
      appState.requestMarkers.get(id).setLatLng(pos);
      continue;
    }
    const marker = window.L.circleMarker(pos, {
      radius: 8,
      color,
      weight: 2,
      fillColor: color,
      fillOpacity: 0.45,
      interactive: true,
    });
    marker.addTo(appState.map);
    marker.bindTooltip(`${escapeHtml(r.callsign)} (${escapeHtml(r.type)})`, { direction: "top" });
    marker.on("click", () => {
      window.location.hash = "#/dashboard";
      qsa(".tabs__btn").forEach((b) => b.classList.toggle("tabs__btn--active", b.dataset.tab === "demandes"));
      qsa(".tab").forEach((t) => t.classList.toggle("tab--active", t.dataset.tab === "demandes"));
    });
    appState.requestMarkers.set(id, marker);
  }
  for (const id of existing) {
    const marker = appState.requestMarkers.get(id);
    if (marker) {
      try {
        appState.map.removeLayer(marker);
      } catch {}
    }
    appState.requestMarkers.delete(id);
  }
}

function runwayRectFallback(bounds) {
  const y2 = bounds?.[1]?.[0];
  const x2 = bounds?.[1]?.[1];
  if (typeof y2 !== "number" || typeof x2 !== "number") return null;
  return [
    [y2 * 0.62, x2 * 0.06],
    [y2 * 0.74, x2 * 0.94],
  ];
}

function syncRunwayLayers() {
  if (!appState.map || !window.L || appState.mapMode !== "image") return;
  const bounds = appState.config.map.image.bounds;
  const runwayDefs = appState.config?.runways || [];
  const existing = new Set(appState.runwayLayers.keys());
  for (const r of runwayDefs) {
    const id = r.id;
    if (!id) continue;
    existing.delete(id);
    const rect = Array.isArray(r.rect) ? r.rect : runwayRectFallback(bounds);
    if (!rect) continue;
    const state = getRunwayState(id);
    const color = RUNWAY_STATES[state]?.color || RUNWAY_STATES.free.color;
    const style = {
      color,
      weight: 2,
      fillColor: color,
      fillOpacity: 0.12,
      interactive: false,
    };
    if (appState.runwayLayers.has(id)) {
      appState.runwayLayers.get(id).setStyle(style);
      continue;
    }
    const layer = window.L.rectangle(rect, style).addTo(appState.map);
    appState.runwayLayers.set(id, layer);
  }
  for (const id of existing) {
    const layer = appState.runwayLayers.get(id);
    if (layer) {
      try {
        appState.map.removeLayer(layer);
      } catch {}
    }
    appState.runwayLayers.delete(id);
  }
}

function loadImageDimensions(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth || img.width, height: img.naturalHeight || img.height });
    img.onerror = reject;
    img.src = url + (url.includes("?") ? "" : `?v=${Date.now()}`); // no-cache
  });
}

function setImageConfigFromSize(url, width, height) {
  if (!width || !height) return false;
  const next = structuredClone(appState.config);
  next.map.mode = "image";
  next.map.image.url = url;
  next.map.image.bounds = [
    [0, 0],
    [height, width],
  ];
  next.map.image.minZoom = 0;
  next.map.image.maxZoom = 0;
  next.map.image.initialZoom = 0;
  appState.config = next;
  saveStorage(STORAGE_KEYS.config, appState.config);
  return true;
}

function detectLocalMap() {
  if (appState.config?.map?.image?.url) return;
  const candidates = ["./assets/map/map.png", "./assets/map/map.jpg", "./assets/map/map.jpeg"];
  const tryNext = (i) => {
    if (i >= candidates.length) return;
    const url = candidates[i];
    loadImageDimensions(url)
      .then(({ width, height }) => {
        if (setImageConfigFromSize(url, width, height)) {
          ensureMap();
        }
      })
      .catch(() => tryNext(i + 1));
  };
  tryNext(0);
}
