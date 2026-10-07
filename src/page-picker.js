import { createReferenceView } from "./reference-view.js";
import { MAX_PAGES_PER_QUESTION } from "./page-range.js";

const SIZE_COLUMNS = { small: 4, medium: 3, large: 2, xlarge: 1 };
const SIZE_LABELS = { small: "Small", medium: "Medium", large: "Large", xlarge: "Extra large" };

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
  for (const name of Object.keys(SIZE_COLUMNS)) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "button button-secondary";
    button.textContent = SIZE_LABELS[name];
    button.addEventListener("click", () => setSize(name));
    sizeButtons[name] = button;
    sizes.append(button);
  }

  const contentsButton = document.createElement("button");
  contentsButton.type = "button";
  contentsButton.className = "button button-secondary";
  contentsButton.textContent = "Contents";

  toolbar.append(selectedOnly, clear, contentsButton, sizes);

  const message = document.createElement("p");
  message.className = "prep-page-count is-error";
  message.hidden = true;

  const tocDrawer = document.createElement("div");
  tocDrawer.className = "toc-drawer";
  tocDrawer.hidden = true;

  const grid = document.createElement("div");
  grid.className = "page-grid";

  const selectedHost = document.createElement("div");
  selectedHost.className = "page-selected-host";
  selectedHost.hidden = true;
  const selectedView = createReferenceView(selectedHost);

  container.append(title, toolbar, message, tocDrawer, grid, selectedHost);

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
  const overlayContents = document.createElement("button");
  overlayContents.type = "button";
  overlayContents.className = "button button-secondary";
  overlayContents.textContent = "Contents";
  const overlayToc = document.createElement("div");
  overlayToc.className = "toc-drawer toc-drawer-overlay";
  overlayToc.hidden = true;
  overlayBar.append(overlayPrev, overlayLabel, overlayNext, overlayToggle, overlayContents, overlayClose);
  const overlayStage = document.createElement("div");
  overlayStage.className = "page-overlay-stage";
  const overlayCanvas = document.createElement("canvas");
  overlayStage.append(overlayCanvas);
  overlay.append(overlayBar, overlayToc, overlayStage);
  document.body.append(overlay);

  const cache = new Map();
  let pdf = null;
  let pageList = [];
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
  let toc = [];

  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      paintThumb(entry.target);
    }
  }, { root: grid, rootMargin: "240px" });

  function cssWidth(cell) {
    return Math.max(72, (cell ? cell.clientWidth : 160) - 10);
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
      for (const number of pageList) {
        if (number < start || number > end) continue;
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
    for (const page of pageList) {
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
    const pdfPage = pdfPageFor(page);
    const width = cssWidth(cell);
    const key = `${pdfPage}@${width}`;
    const generation = renderGeneration;
    let source = cache.get(key);
    if (!source) {
      try {
        source = await renderPage(pdfPage, width, 1);
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
    container.classList.remove("is-small", "is-medium", "is-large", "is-xlarge");
    container.classList.add(`is-${name}`);
    for (const [key, button] of Object.entries(sizeButtons)) {
      button.classList.toggle("is-selected", key === name);
    }
    renderGeneration += 1;
    buildGrid();
  }

  function selectedHeading() {
    const name = activeTitle.replace(/^Selecting pages for:\s*/, "") || "Selected pages";
    const count = selected.length;
    return `${name} · ${count} page${count === 1 ? "" : "s"}`;
  }

  function pdfPageFor(original) {
    const index = pageList.indexOf(Number(original));
    return index < 0 ? 0 : index + 1;
  }

  function showSelectedView() {
    if (!selected.length) {
      selectedView.showMessage("No pages");
      return;
    }
    const pdfPages = selected.map((page) => pdfPageFor(page)).filter((page) => page > 0);
    selectedView.showPages(pdfPages, selectedHeading());
  }

  function scrollToPage(page) {
    if (showingSelected) {
      showingSelected = false;
      selectedOnly.textContent = "Show selected only";
      grid.hidden = false;
      selectedHost.hidden = true;
    }
    const cell = grid.querySelector(`[data-page="${page}"]`);
    if (!cell) return;
    cell.scrollIntoView({ block: "center", behavior: "smooth" });
    cell.classList.add("is-flash");
    window.setTimeout(() => cell.classList.remove("is-flash"), 1200);
  }

  function renderToc(host, onPick) {
    host.replaceChildren();
    if (!toc.length) {
      const empty = document.createElement("p");
      empty.className = "toc-empty";
      empty.textContent = "This PDF has no table of contents.";
      host.append(empty);
      return;
    }
    host.append(tocTree(toc, onPick, 0));
  }

  function tocTree(items, onPick, depth) {
    const list = document.createElement("ul");
    list.className = "toc-list";
    for (const item of items) {
      const entry = document.createElement("li");
      const row = document.createElement("button");
      row.type = "button";
      row.className = "toc-entry";
      row.style.paddingLeft = `${0.45 + depth * 0.85}rem`;
      const name = document.createElement("span");
      name.textContent = item.title;
      const page = document.createElement("span");
      page.className = "toc-page";
      page.textContent = item.pageNumber ? String(item.pageNumber) : "";
      row.append(name, page);
      if (item.pageNumber && pageList.includes(item.pageNumber)) {
        row.addEventListener("click", () => onPick(item.pageNumber));
      } else {
        row.disabled = true;
      }
      const header = document.createElement("div");
      header.className = "toc-row";
      if (item.items && item.items.length) {
        const nested = tocTree(item.items, onPick, depth + 1);
        nested.hidden = depth >= 1;
        const twist = document.createElement("button");
        twist.type = "button";
        twist.className = "toc-twist";
        twist.textContent = nested.hidden ? "▸" : "▾";
        twist.addEventListener("click", () => {
          nested.hidden = !nested.hidden;
          twist.textContent = nested.hidden ? "▸" : "▾";
        });
        header.append(twist, row);
        entry.append(header, nested);
      } else {
        entry.append(row);
      }
      list.append(entry);
    }
    return list;
  }

  async function walkOutline(doc, items) {
    const entries = [];
    for (const item of items || []) {
      let pageNumber = 0;
      try {
        let dest = item.dest;
        if (typeof dest === "string") dest = await doc.getDestination(dest);
        if (Array.isArray(dest) && dest[0]) {
          const pdfPage = (await doc.getPageIndex(dest[0])) + 1;
          pageNumber = pageList[pdfPage - 1] || 0;
        }
      } catch {
        pageNumber = 0;
      }
      entries.push({
        title: item.title || "Untitled",
        pageNumber,
        items: await walkOutline(doc, item.items),
      });
    }
    return entries;
  }

  async function loadOutline(doc) {
    toc = [];
    if (!doc) {
      renderToc(tocDrawer, scrollToPage);
      renderToc(overlayToc, (page) => {
        overlayPage = page;
        drawOverlay();
      });
      return;
    }
    try {
      const outline = await doc.getOutline();
      toc = outline && outline.length ? await walkOutline(doc, outline) : [];
    } catch {
      toc = [];
    }
    renderToc(tocDrawer, scrollToPage);
    renderToc(overlayToc, (page) => {
      overlayPage = page;
      drawOverlay();
    });
  }

  contentsButton.addEventListener("click", () => {
    tocDrawer.hidden = !tocDrawer.hidden;
  });
  overlayContents.addEventListener("click", () => {
    overlayToc.hidden = !overlayToc.hidden;
  });

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
    overlayLabel.textContent = `Page ${overlayPage}`;
    const pdfPage = pdfPageFor(overlayPage);
    const place = pageList.indexOf(overlayPage);
    overlayPrev.disabled = place <= 0;
    overlayNext.disabled = place < 0 || place >= pageList.length - 1;
    updateOverlayToggle();
    const width = Math.max(320, Math.min(900, overlayStage.clientWidth - 24));
    if (!pdfPage) {
      overlayLabel.textContent = "Could not draw this page.";
      return;
    }
    try {
      const rendered = await renderPage(pdfPage, width, Math.min(window.devicePixelRatio || 1, 2));
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
    const place = pageList.indexOf(overlayPage);
    const next = pageList[place + delta];
    if (!next) return;
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

  setSize("large");

  return {
    setPdf(doc, sourcePages) {
      pdf = doc;
      if (doc && Array.isArray(sourcePages) && sourcePages.length === doc.numPages) {
        pageList = sourcePages.map((page) => Number(page));
      } else if (doc) {
        pageList = Array.from({ length: doc.numPages }, (_, index) => index + 1);
      } else {
        pageList = [];
      }
      pageCount = pageList.length;
      cache.clear();
      selectedView.setPdf(doc);
      selectedView.setLabelFor((pdfPage) => pageList[pdfPage - 1] || pdfPage);
      buildGrid();
      paintSelection();
      if (showingSelected) showSelectedView();
      loadOutline(doc);
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
