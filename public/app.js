const CACHE_KEY = "catalogo-etiquetas:data:v3";
const PAGE_SIZE = 32;

const state = {
  items: [],
  filtered: [],
  current: null,
  rendered: 0,
  previousView: "catalog"
};

const PLACEHOLDER = "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="540" viewBox="0 0 720 540">
    <rect width="720" height="540" fill="#f2f5f7"/>
    <g fill="none" stroke="#c2ccd5" stroke-width="5">
      <rect x="242" y="148" width="236" height="188" rx="12"/>
      <circle cx="306" cy="210" r="24"/>
      <path d="M264 316l82-82 48 48 38-38 45 45"/>
    </g>
    <text x="360" y="405" text-anchor="middle" font-family="Arial,sans-serif" font-size="18" fill="#8b99a8">Imagem não disponível</text>
  </svg>`
);

let imageObserver;

document.addEventListener("DOMContentLoaded", init);

async function init() {
  bindEvents();
  configureLazyImages();
  registerServiceWorker();

  const local = readCache();
  const bootstrap = window.__CATALOGO_BOOTSTRAP__;

  if (local?.data?.length) {
    applyPayload(local, "Base salva");
  } else if (bootstrap?.data?.length) {
    applyPayload(bootstrap, "Base inicial");
  }

  showApp();

  try {
    await refreshCatalog(false);
  } catch (error) {
    if (!state.items.length) showFatal(error.message);
    else setSyncStatus("Base salva", false);
  }
}

function bindEvents() {
  document.addEventListener("click", (event) => {
    const action = event.target.closest("[data-action]")?.dataset.action;
    if (!action) return;
    if (action === "home") openHome();
    if (action === "catalog") openCatalog();
    if (action === "back-catalog") openCatalog(true);
  });

  byId("home-search-btn").addEventListener("click", executeHomeSearch);
  byId("home-search").addEventListener("keydown", (event) => {
    if (event.key === "Enter") executeHomeSearch();
  });

  byId("catalog-search").addEventListener("input", filterCatalog);
  byId("clear-catalog-search").addEventListener("click", () => {
    byId("catalog-search").value = "";
    filterCatalog();
    byId("catalog-search").focus();
  });

  byId("load-more").addEventListener("click", renderNextPage);

  byId("refresh-btn").addEventListener("click", async () => {
    const button = byId("refresh-btn");
    button.disabled = true;
    button.textContent = "…";
    try {
      await refreshCatalog(true);
      toast("Catálogo atualizado.");
    } catch {
      toast("Não foi possível atualizar. A última base continua disponível.");
    } finally {
      button.disabled = false;
      button.textContent = "↻";
    }
  });

  document.querySelectorAll("[data-image-slot]").forEach((button) => {
    button.addEventListener("click", () => openModal(Number(button.dataset.imageSlot)));
  });

  byId("modal-close").addEventListener("click", closeModal);
  byId("image-modal").addEventListener("click", (event) => {
    if (event.target.id === "image-modal") closeModal();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeModal();
  });

  document.querySelectorAll(".pill").forEach((pill) => {
    pill.addEventListener("click", () => {
      document.querySelectorAll(".pill").forEach((p) => p.classList.remove("active"));
      pill.classList.add("active");
      filterCatalog();
    });
  });
}

async function refreshCatalog(fresh) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), fresh ? 12000 : 7500);

  try {
    const response = await fetch(`/api/catalogo${fresh ? "?fresh=1" : ""}`, {
      headers: { accept: "application/json" },
      cache: fresh ? "no-store" : "default",
      signal: controller.signal
    });
    const payload = await response.json();
    if (!response.ok || !payload.success) {
      throw new Error(payload.error || "Falha ao carregar catálogo.");
    }
    writeCache(payload);
    applyPayload(payload, "Base online");
    setSyncStatus("Base online", true);
  } catch (error) {
    if (error?.name === "AbortError") throw new Error("A conexão demorou demais.");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function applyPayload(payload, label) {
  state.items = (payload.data || [])
    .filter((item) => item && item.codigo)
    .map((item) => ({
      codigo: String(item.codigo || "").trim(),
      descricao: String(item.descricao || "Sem descrição cadastrada").trim(),
      um: String(item.um || "").trim(),
      data: formatSheetDate(item.data),
      responsavel: String(item.responsavel || "").trim(),
      imagem1: String(item.imagem1 || "").trim(),
      imagem2: String(item.imagem2 || "").trim()
    }))
    .sort((a,b) => a.codigo.localeCompare(b.codigo, "pt-BR", {numeric:true,sensitivity:"base"}));

  byId("home-total").textContent = `${state.items.length} ${state.items.length === 1 ? "material cadastrado" : "materiais cadastrados"}`;
  byId("footer-status").textContent = `${label} · ${state.items.length} materiais`;

  renderHomeCards();
  if (isViewActive("catalog")) filterCatalog();

  if (state.current) {
    const updated = state.items.find((item) => item.codigo === state.current.codigo);
    if (updated && isViewActive("details")) showDetails(updated, false);
  }
}

function renderHomeCards() {
  const grid = byId("home-grid");
  grid.innerHTML = "";
  state.items.slice(0, 8).forEach((item) => grid.appendChild(createCard(item, true)));
}

function executeHomeSearch() {
  const raw = byId("home-search").value.trim();
  if (!raw) return openCatalog();

  const query = normalize(raw);
  const exact = state.items.find((item) => normalize(item.codigo) === query);

  if (exact) {
    showDetails(exact);
    return;
  }

  byId("catalog-search").value = raw;
  openCatalog();
  filterCatalog();
}

function openHome() {
  switchView("home");
  window.scrollTo({top:0,behavior:"instant"});
}

function openCatalog(keepSearch = false) {
  if (!keepSearch && !byId("catalog-search").value) {
    byId("catalog-search").value = "";
  }
  switchView("catalog");
  filterCatalog();
  window.scrollTo({top:0,behavior:"instant"});
}

function filterCatalog() {
  const query = normalize(byId("catalog-search").value);
  state.filtered = state.items.filter((item) => {
    if (!query) return true;
    return normalize(item.codigo).includes(query) || normalize(item.descricao).includes(query);
  });

  state.rendered = 0;
  byId("catalog-grid").innerHTML = "";
  byId("results-count").textContent =
    `${state.filtered.length} ${state.filtered.length === 1 ? "material encontrado" : "materiais encontrados"}`;

  byId("empty-state").hidden = state.filtered.length !== 0;

  if (state.filtered.length) renderNextPage();
  updateLoadMore();
}

function renderNextPage() {
  const grid = byId("catalog-grid");
  const end = Math.min(state.rendered + PAGE_SIZE, state.filtered.length);
  const fragment = document.createDocumentFragment();

  for (let i = state.rendered; i < end; i++) {
    fragment.appendChild(createCard(state.filtered[i], false));
  }

  grid.appendChild(fragment);
  state.rendered = end;
  observePendingImages();
  updateLoadMore();
}

function updateLoadMore() {
  byId("load-more").hidden = state.rendered >= state.filtered.length;
}

function createCard(item, homeCard) {
  const card = document.createElement("article");
  card.className = "card";
  card.tabIndex = 0;
  card.setAttribute("role","button");
  card.setAttribute("aria-label", `Abrir ${item.codigo}`);

  const imageWrap = document.createElement("div");
  imageWrap.className = "card-image";

  const image = document.createElement("img");
  image.alt = `Etiqueta ${item.codigo}`;
  image.src = PLACEHOLDER;
  image.decoding = "async";
  image.loading = "lazy";
  image.setAttribute("fetchpriority","low");

  if (item.imagem1) {
    image.dataset.src = imageUrl(item.imagem1, cardImageWidth());
  } else {
    image.classList.add("img-placeholder");
  }

  image.onerror = () => {
    image.onerror = null;
    image.removeAttribute("data-src");
    image.src = PLACEHOLDER;
    image.classList.add("img-placeholder");
  };

  imageWrap.appendChild(image);

  const body = document.createElement("div");
  body.className = "card-body";

  const badge = document.createElement("span");
  badge.className = "badge";
  badge.textContent = "Etiqueta";

  const code = document.createElement("div");
  code.className = "card-code";
  code.textContent = item.codigo;

  const desc = document.createElement("div");
  desc.className = "card-desc";
  desc.textContent = item.descricao;

  body.append(badge, code, desc);
  card.append(imageWrap, body);

  const open = () => showDetails(item);
  card.addEventListener("click", open);
  card.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      open();
    }
  });

  if (homeCard) setTimeout(() => observePendingImages(), 0);
  return card;
}

function showDetails(item, changeView = true) {
  state.current = item;
  state.previousView = isViewActive("home") ? "home" : "catalog";

  byId("detail-code").textContent = item.codigo;
  byId("detail-description").textContent = item.descricao || "Sem descrição cadastrada";
  byId("detail-um").textContent = item.um || "—";
  byId("detail-date").textContent = item.data || "—";
  byId("detail-owner").textContent = item.responsavel || "—";

  setDetailImage(1, item.imagem1, item.codigo);
  setDetailImage(2, item.imagem2, item.codigo);

  if (changeView) {
    switchView("details");
    window.scrollTo({top:0,behavior:"instant"});
  }
}

function setDetailImage(slot, id, code) {
  const image = byId(`detail-image-${slot}`);
  const button = document.querySelector(`[data-image-slot="${slot}"]`);
  image.dataset.fileId = id || "";
  image.alt = id ? `Imagem ${slot} da etiqueta ${code}` : "Imagem não disponível";
  image.src = id ? imageUrl(id, detailImageWidth()) : PLACEHOLDER;
  image.classList.toggle("img-placeholder", !id);
  button.disabled = !id;

  image.onerror = () => {
    image.onerror = null;
    image.src = PLACEHOLDER;
    image.classList.add("img-placeholder");
    image.dataset.fileId = "";
    button.disabled = true;
  };
}

function openModal(slot) {
  const source = byId(`detail-image-${slot}`);
  const id = source.dataset.fileId;
  if (!id) return;
  byId("modal-image").src = imageUrl(id, modalImageWidth());
  byId("modal-image").alt = source.alt;
  byId("image-modal").hidden = false;
  document.body.style.overflow = "hidden";
}

function closeModal() {
  const modal = byId("image-modal");
  if (modal.hidden) return;
  modal.hidden = true;
  byId("modal-image").src = "";
  document.body.style.overflow = "";
}

function switchView(name) {
  document.querySelectorAll(".view").forEach((view) => view.classList.remove("active"));
  byId(`view-${name}`).classList.add("active");
}

function configureLazyImages() {
  if (!("IntersectionObserver" in window)) return;
  imageObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      loadLazyImage(entry.target);
      imageObserver.unobserve(entry.target);
    }
  }, {rootMargin:"280px 0px"});
}

function observePendingImages() {
  document.querySelectorAll("img[data-src]").forEach((image) => {
    if (imageObserver) imageObserver.observe(image);
    else loadLazyImage(image);
  });
}

function loadLazyImage(image) {
  const src = image.dataset.src;
  if (!src) return;
  image.src = src;
  image.removeAttribute("data-src");
}

function imageUrl(id, width) {
  return `/img/${encodeURIComponent(id)}?w=${width}`;
}

function cardImageWidth() {
  return window.matchMedia("(max-width:700px)").matches ? 320 : 480;
}
function detailImageWidth() {
  return window.matchMedia("(max-width:700px)").matches ? 720 : 960;
}
function modalImageWidth() {
  return window.matchMedia("(max-width:700px)").matches ? 960 : 1600;
}

function setSyncStatus(text, online) {
  const element = byId("sync-status");
  element.textContent = text;
  element.classList.toggle("online", !!online);
  element.classList.toggle("offline", !online);
}

function writeCache(payload) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({...payload,cachedAt:Date.now()}));
  } catch {}
}

function readCache() {
  try {
    const value = localStorage.getItem(CACHE_KEY);
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

function showApp() {
  byId("loader").hidden = true;
  byId("app").hidden = false;
  observePendingImages();
}

function showFatal(message) {
  byId("loader").innerHTML = `
    <div style="max-width:560px;padding:28px;text-align:center">
      <h2 style="margin:0 0 10px;color:#172033">Não foi possível abrir o catálogo</h2>
      <p style="color:#667085;line-height:1.55">${escapeHtml(message)}</p>
      <button onclick="location.reload()" style="border:0;border-radius:10px;padding:12px 18px;background:#00549f;color:#fff;font-weight:700;cursor:pointer">
        Tentar novamente
      </button>
    </div>`;
}

function toast(message) {
  const element = byId("toast");
  element.textContent = message;
  element.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => element.hidden = true, 2800);
}

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g,"")
    .toLowerCase()
    .trim();
}

function formatSheetDate(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  const match = text.match(/^Date\((\d{4}),(\d{1,2}),(\d{1,2})\)$/);
  if (match) {
    const day = String(Number(match[3])).padStart(2,"0");
    const month = String(Number(match[2]) + 1).padStart(2,"0");
    return `${day}/${month}/${match[1]}`;
  }
  return text;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;")
    .replace(/'/g,"&#039;");
}

function isViewActive(name) {
  return byId(`view-${name}`).classList.contains("active");
}

function byId(id) {
  return document.getElementById(id);
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch(()=>{});
    });
  }
}
