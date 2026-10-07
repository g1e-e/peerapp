import { createReferenceView } from "./reference-view.js";
import { MAX_PAGES_PER_QUESTION } from "./page-range.js";

const SIZES = { small: 88, medium: 128, large: 188 };

export function createPagePicker(container) {
  container.classList.add("page-picker");
  container.replaceChildren();

  const title = document.createElement("p");
  title.className = "page-picker-title";
  title.textContent = "Choose a question to select pages.";

  const toolbar = document.createElement("div");
  toolbar.className = "page-picker-toolbar";

  const selectedOnly = document.createElement("button");
  selectedOnly.type = "button";
  selectedOnly.className = "button button-secondary";
  selectedOnly.textContent = "Show selected only";

  const clear = document.createElement("button");
  clear.type = "button";
  clear.className = "button button-secondary";
  clear.textContent = "Clear selection";

  const sizes = document.createElement("div");
  sizes.className = "page-size";
  const sizeButtons = {};
  for (const name of ["small", "medium", "large"]) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "button button-secondary";
    button.textContent = name[0].toUpperCase() + name.slice(1);
    button.addEventListener("click", () => setSize(name));
    sizeButtons[name] = button;
    sizes.append(button);
  }

  toolbar.append(selectedOnly, clear, sizes);

  const message = document.createElement("p");
  message.className = "prep-page-count is-error";
  message.hidden = true;

  const grid = document.createElement("div");
  grid.className = "page-grid";

  const selectedHost = document.createElement("div");
  selectedHost.hidden = true;
  const selectedView = createReferenceView(selectedHost);

  container.append(title, toolbar, message, grid, selectedHost);

  const overlay = document.createElement("div");
  overlay.className = "page-overlay";
  overlay.hidden = true;
  const overlayBar = document.createElement("div");
  overlayBar.className = "page-overlay-bar";
  const overlayPrev = document.createElement("button");
  overlayPrev.type = "button";
  overlayPrev.className = "button button-secondary";
  overlayPrev.textContent = "Prev";
  const overlayLabel = document.createElement("p");
  overlayLabel.className = "reference-label";
  const overlayNext = document.createElement("button");
  overlayNext.type = "button";
  overlayNext.className = "button button-secondary";
  overlayNext.textContent = "Next";
  const overlayToggle = document.createElement("button");
  overlayToggle.type = "button";
  overlayToggle.className = "button button-primary";
  overlayToggle.textContent = "Select";
  const overlayClose = document.createElement("button");
  overlayClose.type = "button";
  overlayClose.className = "button button-secondary";
  overlayClose.textContent = "Close";
  overlayBar.append(overlayPrev, overlayLabel, overlayNext, overlayToggle, overlayClose);
  const overlayStage = document.createElement("div");
  overlayStage.className = "page-overlay-stage";
  const overlayCanvas = document.createElement("canvas");
  overlayStage.append(overlayCanvas);
  overlay.append(overlayBar, overlayStage);
  document.body.append(overlay);

  const cache = new Map();
  let pdf = null;
  let pageCount = 0;
  let size = "medium";
  let selected = [];
  let usage = {};
  let activeTitle = "";
  let lastClicked = 0;
  let onChange = () => {};
  let showingSelected = false;
  let overlayPage = 1;
  let renderGeneration = 0;

  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      paintThumb(entry.target);
    }
  }, { root: grid, rootMargin: "240px" });

  function cssWidth() {
    return SIZES[size];
  }

  function showLimit() {
    message.hidden = false;
    message.textContent = `A question can have at most ${MAX_PAGES_PER_QUESTION} pages.`;
  }

  function hideLimit() {
    message.hidden = true;
    message.textContent = "";
  }

  function commit(next) {
    const pages = [...next].sort((a, b) => a - b);
    if (pages.length > MAX_PAGES_PER_QUESTION) {
      showLimit();
      return;
    }
    hideLimit();
    selected = pages;
    onChange(pages);
    paintSelection();
    if (showingSelected) showSelectedView();
    if (!overlay.hidden) updateOverlayToggle();
  }

  function togglePage(page, shiftKey) {
    if (!activeTitle) {
      message.hidden = false;
      message.textContent = "Choose a question first.";
      return;
    }
    const have = new Set(selected);
    if (shiftKey && lastClicked) {
      const start = Math.min(lastClicked, page);
      const end = Math.max(lastClicked, page);
      const turningOn = !have.has(page);
      for (let number = start; number <= end; number += 1) {
        if (turningOn) have.add(number);
        else have.delete(number);
      }
    } else if (have.has(page)) {
      have.delete(page);
    } else {
      have.add(page);
    }
    lastClicked = page;
    commit(have);
  }

  function paintSelection() {
    const chosen = new Set(selected);
    for (const cell of grid.querySelectorAll(".thumb")) {
      const page = Number(cell.dataset.page);
      cell.classList.toggle("is-selected", chosen.has(page));
      cell.querySelector(".thumb-check").hidden = !chosen.has(page);
      const others = usage[page] || 0;
      const badge = cell.querySelector(".thumb-badge");
      badge.hidden = others < 1;
      badge.textContent = String(others);
    }
  }

  function buildGrid() {
    observer.disconnect();
    grid.replaceChildren();
    if (!pdf || !pageCount) {
      const note = document.createElement("p");
      note.className = "admin-placeholder";
      note.textContent = "Add a PDF to choose pages.";
      grid.append(note);
      return;
    }
    for (let page = 1; page <= pageCount; page += 1) {
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "thumb";
      cell.dataset.page = String(page);

      const slot = document.createElement("span");
      slot.className = "thumb-slot";
      const check = document.createElement("span");
      check.className = "thumb-check";
      check.textContent = "✓";
      check.hidden = true;
      const badge = document.createElement("span");
      badge.className = "thumb-badge";
      badge.hidden = true;
      const zoom = document.createElement("span");
      zoom.className = "thumb-zoom";
      zoom.textContent = "Magnify";
      const number = document.createElement("span");
      number.className = "thumb-num";
      number.textContent = String(page);

      cell.append(slot, check, badge, zoom, number);
      cell.addEventListener("click", (event) => {
        if (event.target.closest(".thumb-zoom")) return;
        togglePage(page, event.shiftKey);
      });
      cell.addEventListener("dblclick", (event) => {
        event.preventDefault();
        openOverlay(page);
      });
      zoom.addEventListener("click", (event) => {
        event.stopPropagation();
        openOverlay(page);
      });
      grid.append(cell);
      observer.observe(cell);
    }
    paintSelection();
  }

  async function paintThumb(cell) {
    const page = Number(cell.dataset.page);
    const width = cssWidth();
    const key = `${page}@${width}`;
    const generation = renderGeneration;
    let source = cache.get(key);
    if (!source) {
      try {
        source = await renderPage(page, width, 1);
      } catch {
        return;
      }
      if (generation !== renderGeneration) return;
      cache.set(key, source);
    }
    if (generation !== renderGeneration) return;
    const slot = cell.querySelector(".thumb-slot");
    if (!slot) return;
    const copy = document.createElement("canvas");
    copy.width = source.width;
    copy.height = source.height;
    copy.style.width = source.styleWidth;
    copy.style.height = source.styleHeight;
    copy.getContext("2d").drawImage(source.canvas, 0, 0);
    slot.replaceChildren(copy);
    observer.unobserve(cell);
  }

  async function renderPage(pageNumber, width, ratio) {
    const page = await pdf.getPage(pageNumber);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: width / base.width });
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.floor(viewport.width * ratio));
    canvas.height = Math.max(1, Math.floor(viewport.height * ratio));
    const styleWidth = `${Math.floor(viewport.width)}px`;
    const styleHeight = `${Math.floor(viewport.height)}px`;
    canvas.style.width = styleWidth;
    canvas.style.height = styleHeight;
    await page.render({
      canvasContext: canvas.getContext("2d"),
      viewport,
      transform: ratio === 1 ? null : [ratio, 0, 0, ratio, 0, 0],
    }).promise;
    return { canvas, width: canvas.width, height: canvas.height, styleWidth, styleHeight };
  }

  function setSize(name) {
    size = name;
    container.classList.remove("is-small", "is-medium", "is-large");
    container.classList.add(`is-${name}`);
    for (const [key, button] of Object.entries(sizeButtons)) {
      button.classList.toggle("is-selected", key === name);
    }
    renderGeneration += 1;
    buildGrid();
  }

  function showSelectedView() {
    if (!selected.length) {
      selectedView.showMessage("No pages");
      return;
    }
    selectedView.showPages(selected);
  }

  function openOverlay(page) {
    if (!pdf) return;
    overlayPage = page;
    overlay.hidden = false;
    drawOverlay();
  }

  function closeOverlay() {
    overlay.hidden = true;
  }

  async function drawOverlay() {
    overlayLabel.textContent = `PDF page ${overlayPage}`;
    overlayPrev.disabled = overlayPage <= 1;
    overlayNext.disabled = overlayPage >= pageCount;
    updateOverlayToggle();
    const width = Math.max(320, Math.min(900, overlayStage.clientWidth - 24));
    try {
      const rendered = await renderPage(overlayPage, width, Math.min(window.devicePixelRatio || 1, 2));
      overlayCanvas.width = rendered.width;
      overlayCanvas.height = rendered.height;
      overlayCanvas.style.width = rendered.styleWidth;
      overlayCanvas.style.height = rendered.styleHeight;
      overlayCanvas.getContext("2d").drawImage(rendered.canvas, 0, 0);
    } catch {
      overlayLabel.textContent = "Could not draw this page.";
    }
  }

  function updateOverlayToggle() {
    overlayToggle.textContent = selected.includes(overlayPage) ? "Deselect" : "Select";
  }

  function moveOverlay(delta) {
    const next = overlayPage + delta;
    if (next < 1 || next > pageCount) return;
    overlayPage = next;
    drawOverlay();
  }

  selectedOnly.addEventListener("click", () => {
    showingSelected = !showingSelected;
    selectedOnly.textContent = showingSelected ? "Show all pages" : "Show selected only";
    grid.hidden = showingSelected;
    selectedHost.hidden = !showingSelected;
    if (showingSelected) showSelectedView();
  });

  clear.addEventListener("click", () => {
    if (!activeTitle || selected.length === 0) return;
    if (!window.confirm("Clear every page selected for this question?")) return;
    lastClicked = 0;
    commit([]);
  });

  overlayPrev.addEventListener("click", () => moveOverlay(-1));
  overlayNext.addEventListener("click", () => moveOverlay(1));
  overlayToggle.addEventListener("click", () => {
    lastClicked = overlayPage;
    togglePage(overlayPage, false);
  });
  overlayClose.addEventListener("click", closeOverlay);
  document.addEventListener("keydown", (event) => {
    if (overlay.hidden) return;
    if (event.key === "Escape") {
      event.preventDefault();
      closeOverlay();
      return;
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      moveOverlay(-1);
      return;
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      moveOverlay(1);
      return;
    }
    if (event.key === " " && !event.target.closest("button, input, textarea, select")) {
      event.preventDefault();
      lastClicked = overlayPage;
      togglePage(overlayPage, false);
    }
  });

  setSize("medium");

  return {
    setPdf(doc) {
      pdf = doc;
      pageCount = doc ? doc.numPages : 0;
      cache.clear();
      selectedView.setPdf(doc);
      buildGrid();
    },
    setActive(nextTitle, pages, nextUsage) {
      activeTitle = nextTitle || "";
      title.textContent = activeTitle || "Choose a question to select pages.";
      selected = [...(pages || [])];
      usage = nextUsage || {};
      hideLimit();
      paintSelection();
      if (showingSelected) showSelectedView();
    },
    setUsage(nextUsage) {
      usage = nextUsage || {};
      paintSelection();
    },
    onChange(callback) {
      onChange = callback;
    },
    showMessage(text) {
      title.textContent = text;
    },
    showProgress(text) {
      title.textContent = text;
    },
  };
}
