export function createReferenceView(container) {
  container.classList.add("reference-view");
  container.replaceChildren();

  const toolbar = document.createElement("div");
  toolbar.className = "reference-toolbar";

  const prev = document.createElement("button");
  prev.type = "button";
  prev.className = "button button-secondary";
  prev.textContent = "Prev";

  const label = document.createElement("p");
  label.className = "reference-label";

  const next = document.createElement("button");
  next.type = "button";
  next.className = "button button-secondary";
  next.textContent = "Next";

  toolbar.append(prev, label, next);

  const stage = document.createElement("div");
  stage.className = "reference-stage";
  stage.tabIndex = 0;

  const canvas = document.createElement("canvas");
  canvas.hidden = true;

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

  stage.append(canvas, note, progress);
  container.append(toolbar, stage);

  const cache = new Map();
  let pdf = null;
  let pages = [];
  let index = 0;
  let renderToken = 0;
  let currentTask = null;

  function cssWidth() {
    return Math.max(280, stage.clientWidth - 24);
  }

  function showNote(text) {
    canvas.hidden = true;
    note.hidden = !text;
    note.textContent = text || "";
    prev.disabled = true;
    next.disabled = true;
    label.textContent = "";
  }

  function updateChrome() {
    const total = pages.length;
    prev.disabled = index <= 0;
    next.disabled = index >= total - 1;
    const pdfPage = pages[index];
    label.textContent = total
      ? `Page ${index + 1} of ${total} (PDF page ${pdfPage})`
      : "";
  }

  async function draw() {
    if (!pdf || pages.length === 0) return;
    const token = ++renderToken;
    if (currentTask) {
      currentTask.cancel();
      currentTask = null;
    }

    const pageNumber = pages[index];
    const width = cssWidth();
    const pixelRatio = window.devicePixelRatio || 1;
    const key = `${pageNumber}@${width}@${pixelRatio}`;
    const cached = cache.get(key);

    note.hidden = true;
    canvas.hidden = false;
    updateChrome();

    if (cached) {
      canvas.width = cached.width;
      canvas.height = cached.height;
      canvas.style.width = cached.styleWidth;
      canvas.style.height = cached.styleHeight;
      canvas.getContext("2d").drawImage(cached.canvas, 0, 0);
      return;
    }

    let page;
    try {
      page = await pdf.getPage(pageNumber);
    } catch {
      if (token !== renderToken) return;
      showNote("Could not open this page.");
      return;
    }
    if (token !== renderToken) return;

    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: width / base.width });
    const backing = document.createElement("canvas");
    backing.width = Math.floor(viewport.width * pixelRatio);
    backing.height = Math.floor(viewport.height * pixelRatio);
    backing.style.width = `${Math.floor(viewport.width)}px`;
    backing.style.height = `${Math.floor(viewport.height)}px`;

    const task = page.render({
      canvasContext: backing.getContext("2d"),
      viewport,
      transform: pixelRatio === 1 ? null : [pixelRatio, 0, 0, pixelRatio, 0, 0],
    });
    currentTask = task;
    try {
      await task.promise;
    } catch (err) {
      if (token !== renderToken) return;
      showNote("Could not draw this page.");
      return;
    }
    if (token !== renderToken) return;
    currentTask = null;

    cache.set(key, {
      canvas: backing,
      width: backing.width,
      height: backing.height,
      styleWidth: backing.style.width,
      styleHeight: backing.style.height,
    });

    canvas.width = backing.width;
    canvas.height = backing.height;
    canvas.style.width = backing.style.width;
    canvas.style.height = backing.style.height;
    canvas.getContext("2d").drawImage(backing, 0, 0);
  }

  function step(delta) {
    if (pages.length === 0) return;
    const nextIndex = index + delta;
    if (nextIndex < 0 || nextIndex >= pages.length) return;
    index = nextIndex;
    draw();
  }

  prev.addEventListener("click", () => step(-1));
  next.addEventListener("click", () => step(1));
  container.addEventListener("click", (event) => {
    if (event.target.closest("button")) return;
    stage.focus();
  });
  container.addEventListener("keydown", (event) => {
    const tag = event.target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      step(-1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      step(1);
    }
  });

  const observer = new ResizeObserver(() => {
    if (pages.length > 0) draw();
  });
  observer.observe(stage);

  return {
    setPdf(doc) {
      pdf = doc;
      cache.clear();
    },
    showProgress(text, ratio) {
      toolbar.hidden = true;
      canvas.hidden = true;
      note.hidden = true;
      progress.hidden = false;
      progressLabel.textContent = text;
      bar.value = Math.round(ratio * 100);
    },
    showMessage(text) {
      progress.hidden = true;
      toolbar.hidden = false;
      pages = [];
      index = 0;
      showNote(text);
    },
    showPages(pageNumbers) {
      progress.hidden = true;
      toolbar.hidden = false;
      pages = pageNumbers;
      index = 0;
      if (!pdf) {
        showNote("The PDF is not loaded yet.");
        return;
      }
      if (!pages.length) {
        showNote("No reference pages for this question.");
        return;
      }
      draw();
    },
    focus() {
      stage.focus();
    },
  };
}
