export function createReferenceView(container) {
  container.classList.add("reference-view");
  container.replaceChildren();

  const sticky = document.createElement("p");
  sticky.className = "reference-sticky";
  sticky.hidden = true;

  const stage = document.createElement("div");
  stage.className = "reference-stage";

  const note = document.createElement("p");
  note.className = "reference-note";

  const progress = document.createElement("div");
  progress.className = "reference-progress";
  progress.hidden = true;
  const progressLabel = document.createElement("p");
  const bar = document.createElement("progress");
  bar.max = 100;
  bar.value = 0;
  progress.append(progressLabel, bar);

  stage.append(note, progress);
  container.append(sticky, stage);

  const cache = new Map();
  let pdf = null;
  let pages = [];
  let generation = 0;
  let labelFor = (pageNumber) => pageNumber;

  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      paintPage(entry.target);
    }
  }, { root: stage, rootMargin: "600px" });

  function showNote(text) {
    sticky.hidden = true;
    progress.hidden = true;
    clearPages();
    note.hidden = !text;
    note.textContent = text || "";
  }

  function clearPages() {
    observer.disconnect();
    for (const block of stage.querySelectorAll(".reference-page")) block.remove();
  }

  function panelWidth() {
    return Math.max(280, stage.clientWidth - 28);
  }

  function buildStack() {
    clearPages();
    note.hidden = true;
    const width = panelWidth();
    for (const pageNumber of pages) {
      const block = document.createElement("section");
      block.className = "reference-page";
      block.dataset.page = String(pageNumber);
      block.dataset.width = String(width);
      const label = document.createElement("p");
      label.className = "reference-page-label";
      label.textContent = `Page ${labelFor(pageNumber)}`;
      const slot = document.createElement("div");
      slot.className = "reference-page-slot";
      block.append(label, slot);
      stage.append(block);
      observer.observe(block);
    }
  }

  async function paintPage(block) {
    if (!pdf) return;
    const pageNumber = Number(block.dataset.page);
    const width = Number(block.dataset.width) || panelWidth();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const key = `${pageNumber}@${width}@${ratio}`;
    const token = generation;
    let rendered = cache.get(key);
    if (!rendered) {
      try {
        rendered = await drawPage(pageNumber, width, ratio);
      } catch {
        return;
      }
      if (token !== generation) return;
      cache.set(key, rendered);
    }
    if (token !== generation || !block.isConnected) return;
    const slot = block.querySelector(".reference-page-slot");
    if (!slot) return;
    const canvas = document.createElement("canvas");
    canvas.width = rendered.width;
    canvas.height = rendered.height;
    canvas.style.width = rendered.styleWidth;
    canvas.style.height = rendered.styleHeight;
    canvas.getContext("2d").drawImage(rendered.canvas, 0, 0);
    slot.replaceChildren(canvas);
    observer.unobserve(block);
  }

  async function drawPage(pageNumber, width, ratio) {
    const page = await pdf.getPage(pageNumber);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: width / base.width });
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.floor(viewport.width * ratio));
    canvas.height = Math.max(1, Math.floor(viewport.height * ratio));
    const styleWidth = `${Math.floor(viewport.width)}px`;
    const styleHeight = `${Math.floor(viewport.height)}px`;
    await page.render({
      canvasContext: canvas.getContext("2d"),
      viewport,
      transform: ratio === 1 ? null : [ratio, 0, 0, ratio, 0, 0],
    }).promise;
    return { canvas, width: canvas.width, height: canvas.height, styleWidth, styleHeight };
  }

  let resizeWidth = 0;
  const resizeObserver = new ResizeObserver(() => {
    const width = panelWidth();
    if (!pages.length || Math.abs(width - resizeWidth) < 8) return;
    resizeWidth = width;
    generation += 1;
    buildStack();
  });
  resizeObserver.observe(stage);

  return {
    setPdf(doc) {
      pdf = doc;
      cache.clear();
      generation += 1;
      if (pages.length) buildStack();
    },
    setLabelFor(fn) {
      labelFor = typeof fn === "function" ? fn : (pageNumber) => pageNumber;
    },
    showProgress(text, ratio) {
      sticky.hidden = true;
      clearPages();
      note.hidden = true;
      progress.hidden = false;
      progressLabel.textContent = text;
      bar.value = Math.round((ratio || 0) * 100);
    },
    showMessage(text) {
      pages = [];
      generation += 1;
      showNote(text);
    },
    showPages(pageNumbers, heading) {
      pages = pageNumbers || [];
      generation += 1;
      progress.hidden = true;
      if (!pdf) {
        showNote("The PDF is not loaded yet.");
        return;
      }
      if (!pages.length) {
        showNote("No reference pages for this question.");
        return;
      }
      sticky.hidden = !heading;
      sticky.textContent = heading || "";
      resizeWidth = panelWidth();
      buildStack();
      stage.scrollTop = 0;
    },
  };
}
