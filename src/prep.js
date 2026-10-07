import { REVIEW_LINK_PREFIX } from "./config.js";
import { isPdfFile, MAX_PDF_BYTES } from "./bytes.js";
import { postToDrive } from "./drive.js";
import { formatPageRange } from "./page-range.js";
import { createPagePicker } from "./page-picker.js";
import { openPdf } from "./pdfjs.js";
import { buildSegments, clampIncidentCount, MAX_INCIDENTS } from "./questions.js";
import { downloadReviewPdf, uploadPdf } from "./review-transfer.js";

export function mountPrep(root, options) {
  root.replaceChildren();

  const toolbar = document.createElement("div");
  toolbar.className = "actions";
  const newButton = document.createElement("button");
  newButton.type = "button";
  newButton.className = "button button-primary";
  newButton.textContent = "New review";
  toolbar.append(newButton);

  const status = document.createElement("p");
  status.className = "submit-status";
  status.hidden = true;

  const list = document.createElement("ul");
  list.className = "admin-list";

  const editor = document.createElement("div");
  editor.className = "prep-editor-wrap";
  editor.hidden = true;

  root.append(toolbar, status, list, editor);

  const pickerHost = document.createElement("div");
  const picker = createPagePicker(pickerHost);
  picker.onChange((pages) => {
    if (!state || !state.activeId) return;
    if (pages.length) state.pages[state.activeId] = pages;
    else delete state.pages[state.activeId];
    const summary = editor.querySelector(`[data-summary-for="${CSS.escape(state.activeId)}"]`);
    if (summary) summary.textContent = pagesLabel(pages);
    picker.setUsage(usageCounts(state.activeId));
  });

  let reviews = [];
  let pdfDoc = null;
  let pendingFile = null;
  let state = null;

  function password() {
    return options.getPassword();
  }

  function showStatus(text, tone) {
    status.hidden = !text;
    status.textContent = text || "";
    status.className = `submit-status${tone ? ` ${tone}` : ""}`;
  }

  function authFailed(error) {
    if (!options.isAuthFailure(error.message)) return false;
    options.onAuthFailure(error.message);
    return true;
  }

  function reviewLink(id) {
    return `${REVIEW_LINK_PREFIX}${id}`;
  }

  async function copyLink(id, button) {
    const link = reviewLink(id);
    const original = button.textContent;
    try {
      await navigator.clipboard.writeText(link);
      button.textContent = "Copied";
    } catch {
      button.textContent = link;
    }
    window.setTimeout(() => {
      button.textContent = original;
    }, 2000);
  }

  function questionText(question) {
    if (question.number == null || question.number === "") return question.label;
    return `${question.number}. ${question.label}`;
  }

  function selectionTitle(segment, question) {
    if (question.number != null && question.number !== "") return `${segment.title} ${question.number}`;
    return `${segment.title}: ${question.label}`;
  }

  function pagesLabel(pages) {
    if (!pages || !pages.length) return "No pages";
    return `Pages ${formatPageRange(pages)} (${pages.length})`;
  }

  function usageCounts(activeId) {
    const counts = {};
    for (const [id, pages] of Object.entries(state.pages || {})) {
      if (id === activeId) continue;
      for (const page of pages || []) counts[page] = (counts[page] || 0) + 1;
    }
    return counts;
  }

  function blankState() {
    return {
      id: newReviewId(),
      name: "",
      incidentCount: 0,
      hasPdf: false,
      pageCount: 0,
      pages: {},
      activeId: "",
    };
  }

  function setReviews(next) {
    reviews = Array.isArray(next) ? next : [];
    renderList();
    if (options.onReviews) options.onReviews(reviews);
  }

  function upsertReview(review) {
    const index = reviews.findIndex((item) => item.id === review.id);
    if (index >= 0) reviews[index] = { ...reviews[index], ...review };
    else reviews.unshift(review);
    setReviews(reviews);
  }

  function renderList() {
    list.replaceChildren();
    if (reviews.length === 0) {
      const item = document.createElement("li");
      item.className = "admin-empty";
      item.textContent = "No reviews yet.";
      list.append(item);
      return;
    }

    for (const review of reviews) {
      const item = document.createElement("li");
      item.className = "prep-review";

      const heading = document.createElement("p");
      heading.className = "admin-when";
      heading.textContent = review.name || "Untitled review";

      const meta = document.createElement("p");
      meta.className = "admin-who";
      const count = Number(review.submissionCount) || 0;
      const incidents = clampIncidentCount(review.incidentCount);
      meta.textContent = `${incidents} incident${incidents === 1 ? "" : "s"} · ${count} submission${count === 1 ? "" : "s"}`;

      const actions = document.createElement("div");
      actions.className = "prep-review-actions";

      const open = document.createElement("button");
      open.type = "button";
      open.className = "button button-secondary";
      open.textContent = "Open";
      open.addEventListener("click", () => editReview(review));

      const copy = document.createElement("button");
      copy.type = "button";
      copy.className = "button button-secondary";
      copy.textContent = "Copy link";
      copy.addEventListener("click", () => copyLink(review.id, copy));

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "button button-secondary";
      remove.textContent = "Delete";
      remove.addEventListener("click", () => deleteReview(review));

      actions.append(open, copy, remove);
      item.append(heading, meta, actions);
      list.append(item);
    }
  }

  function renderEditor() {
    editor.replaceChildren();
    editor.hidden = false;

    const nameLabel = document.createElement("label");
    nameLabel.className = "field";
    const nameCaption = document.createElement("span");
    nameCaption.className = "field-label";
    nameCaption.textContent = "Review name";
    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.value = state.name;
    nameInput.addEventListener("input", () => {
      state.name = nameInput.value;
    });
    nameLabel.append(nameCaption, nameInput);

    const countLabel = document.createElement("label");
    countLabel.className = "field prep-count-field";
    const countCaption = document.createElement("span");
    countCaption.className = "field-label";
    countCaption.textContent = "Number of incidents";
    const countInput = document.createElement("input");
    countInput.type = "number";
    countInput.min = "0";
    countInput.max = String(MAX_INCIDENTS);
    countInput.step = "1";
    countInput.value = String(state.incidentCount);
    countInput.addEventListener("change", () => applyIncidentCount(countInput));
    countLabel.append(countCaption, countInput);

    const drop = document.createElement("div");
    drop.className = "prep-drop";
    const dropText = document.createElement("p");
    dropText.textContent = pdfDropLabel();
    const choose = document.createElement("button");
    choose.type = "button";
    choose.className = "button button-secondary";
    choose.textContent = "Choose PDF";
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = "application/pdf,.pdf";
    fileInput.className = "pdf-input";
    choose.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", () => {
      const file = fileInput.files[0];
      fileInput.value = "";
      if (file) usePdfFile(file, dropText);
    });
    drop.addEventListener("dragover", (event) => {
      event.preventDefault();
      drop.classList.add("is-dragover");
    });
    drop.addEventListener("dragleave", () => drop.classList.remove("is-dragover"));
    drop.addEventListener("drop", (event) => {
      event.preventDefault();
      drop.classList.remove("is-dragover");
      const file = event.dataTransfer.files[0];
      if (file) usePdfFile(file, dropText);
    });
    drop.append(dropText, choose, fileInput);

    const columns = document.createElement("div");
    columns.className = "prep-columns";
    const questions = document.createElement("div");
    questions.className = "prep-questions";
    renderQuestions(questions);
    columns.append(questions, pickerHost);

    const save = document.createElement("button");
    save.type = "button";
    save.className = "button button-primary";
    save.textContent = "Save review";
    save.addEventListener("click", () => saveReview(save));

    const linkBox = document.createElement("div");
    linkBox.className = "prep-link";
    linkBox.hidden = !state.savedId;
    if (state.savedId) fillLinkBox(linkBox, state.savedId);

    editor.append(nameLabel, countLabel, drop, columns, save, linkBox);
  }

  function pdfDropLabel() {
    if (pendingFile) return pendingFile.name;
    if (state.hasPdf) return "Reference PDF saved. Drop a new file to replace it.";
    return "Drop a reference PDF here, or choose a file.";
  }

  function renderQuestions(host) {
    host.replaceChildren();
    let activeRow = null;
    let activeSegment = null;
    let activeQuestion = null;
    for (const segment of buildSegments(state.incidentCount)) {
      const block = document.createElement("section");
      block.className = "segment";
      const heading = document.createElement("h2");
      heading.textContent = segment.title;
      block.append(heading);

      for (const question of segment.questions) {
        const row = document.createElement("div");
        row.className = "prep-question";
        if (question.id === state.activeId) {
          row.classList.add("is-active");
          activeRow = row;
          activeSegment = segment;
          activeQuestion = question;
        }

        const button = document.createElement("button");
        button.type = "button";
        button.className = "prep-question-label";
        button.textContent = questionText(question);

        const summary = document.createElement("p");
        summary.className = "prep-page-count";
        summary.dataset.summaryFor = question.id;
        summary.textContent = pagesLabel(state.pages[question.id]);

        button.addEventListener("click", () => activateQuestion(segment, question, row));
        row.addEventListener("click", (event) => {
          if (event.target.closest("button")) return;
          activateQuestion(segment, question, row);
        });

        row.append(button, summary);
        block.append(row);
      }
      host.append(block);
    }
    if (activeQuestion) activateQuestion(activeSegment, activeQuestion, activeRow);
  }

  function activateQuestion(segment, question, row) {
    state.activeId = question.id;
    for (const item of editor.querySelectorAll(".prep-question")) {
      item.classList.toggle("is-active", item === row);
    }
    picker.setActive(
      `Selecting pages for: ${selectionTitle(segment, question)}`,
      state.pages[question.id] || [],
      usageCounts(question.id),
    );
  }

  function applyIncidentCount(input) {
    const next = clampIncidentCount(input.value);
    if (next < state.incidentCount && removedAssignments(next).length) {
      const ok = window.confirm("Lowering the number of incidents removes page assignments for the incidents you drop. Continue?");
      if (!ok) {
        input.value = String(state.incidentCount);
        return;
      }
    }
    for (const id of Object.keys(state.pages)) {
      const match = id.match(/^incident(\d+)\./);
      if (match && Number(match[1]) > next) delete state.pages[id];
    }
    state.incidentCount = next;
    input.value = String(next);
    const host = editor.querySelector(".prep-questions");
    if (host) renderQuestions(host);
    if (state.activeId) picker.setUsage(usageCounts(state.activeId));
  }

  function removedAssignments(next) {
    return Object.keys(state.pages).filter((id) => {
      const match = id.match(/^incident(\d+)\./);
      return match && Number(match[1]) > next && (state.pages[id] || []).length;
    });
  }

  async function usePdfFile(file, label) {
    if (!isPdfFile(file)) {
      showStatus("Please choose a PDF file.", "error");
      return;
    }
    if (file.size > MAX_PDF_BYTES) {
      showStatus("This PDF is over 45 MB. Compress it and try again.", "error");
      return;
    }
    showStatus("");
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      pdfDoc = await openPdf(bytes);
    } catch {
      showStatus("Could not read that PDF.", "error");
      return;
    }
    pendingFile = file;
    state.pageCount = pdfDoc.numPages;
    picker.setPdf(pdfDoc);
    label.textContent = file.name;
    if (state.activeId) {
      const active = findQuestion(state.activeId);
      if (active) activateQuestion(active.segment, active.question, active.row);
    } else {
      picker.showMessage("Choose a question to select pages.");
    }
  }

  function findQuestion(id) {
    for (const segment of buildSegments(state.incidentCount)) {
      for (const question of segment.questions) {
        if (question.id !== id) continue;
        const row = editor.querySelector(`[data-summary-for="${CSS.escape(id)}"]`)?.closest(".prep-question");
        return { segment, question, row };
      }
    }
    return null;
  }

  async function editReview(review) {
    showStatus("");
    let full;
    try {
      const data = await postToDrive({ action: "getReview", reviewId: review.id });
      full = data.review;
    } catch (err) {
      if (authFailed(err)) return;
      showStatus(err.message || "Could not open the review.", "error");
      return;
    }

    state = {
      id: full.id,
      name: full.name || "",
      incidentCount: clampIncidentCount(full.incidentCount),
      hasPdf: true,
      pageCount: Number(full.pageCount) || 0,
      pages: { ...(full.pages || {}) },
      activeId: "",
      savedId: full.id,
    };
    pendingFile = null;
    pdfDoc = null;
    renderEditor();
    picker.showProgress("Loading reference PDF…");
    try {
      const bytes = await downloadReviewPdf(full.id, full.pdfChunkCount, (done, total) => {
        picker.showProgress(`Loading reference PDF… part ${done} of ${total}`);
      });
      pdfDoc = await openPdf(bytes);
      picker.setPdf(pdfDoc);
      picker.showMessage("Choose a question to select pages.");
    } catch (err) {
      if (authFailed(err)) return;
      picker.showMessage(err.message || "Could not load the reference PDF.");
    }
  }

  function fillLinkBox(box, id) {
    box.replaceChildren();
    box.hidden = false;
    const caption = document.createElement("p");
    caption.className = "field-label";
    caption.textContent = "Subject link";
    const link = document.createElement("p");
    link.className = "prep-link-url";
    link.textContent = reviewLink(id);
    const copy = document.createElement("button");
    copy.type = "button";
    copy.className = "button button-secondary";
    copy.textContent = "Copy";
    copy.addEventListener("click", () => copyLink(id, copy));
    box.append(caption, link, copy);
  }

  function collectPages() {
    const pages = {};
    for (const segment of buildSegments(state.incidentCount)) {
      for (const question of segment.questions) {
        const list = state.pages[question.id] || [];
        if (list.length > 50) {
          return { error: `${questionText(question)}: A question can have at most 50 pages.` };
        }
        if (list.length) pages[question.id] = list;
      }
    }
    return { pages };
  }

  async function saveReview(button) {
    const name = state.name.trim();
    if (!name) {
      showStatus("Give the review a name.", "error");
      return;
    }
    if (!state.pageCount || (!pendingFile && !state.hasPdf)) {
      showStatus("Add a PDF first.", "error");
      return;
    }
    const collected = collectPages();
    if (collected.error) {
      showStatus(collected.error, "error");
      return;
    }

    button.disabled = true;
    try {
      const payload = {
        id: state.id,
        name,
        pageCount: state.pageCount,
        incidentCount: state.incidentCount,
        pages: collected.pages,
      };
      if (pendingFile) {
        const uploaded = await uploadPdf(pendingFile, password(), (done, total) => {
          showStatus(`Uploading ${done} of ${total}...`, "notice");
        });
        payload.pdfChunks = uploaded.pdfChunks;
        payload.folderId = uploaded.folderId;
        payload.pdfSize = uploaded.pdfSize;
        pendingFile = null;
        state.hasPdf = true;
      }
      showStatus("Saving...", "notice");
      const saved = await postToDrive({
        action: "saveReview",
        password: password(),
        review: payload,
      });
      state.pages = collected.pages;
      state.savedId = state.id;
      const linkBox = editor.querySelector(".prep-link");
      if (linkBox) fillLinkBox(linkBox, state.id);
      showStatus("Saved.", "success");
      upsertReview(saved.review);
    } catch (err) {
      if (authFailed(err)) return;
      showStatus(err.message || "Could not save the review.", "error");
    } finally {
      button.disabled = false;
    }
  }

  async function deleteReview(review) {
    const ok = window.confirm("Delete this review? The PDF and its submissions will be moved to the trash in Google Drive.");
    if (!ok) return;
    showStatus("");
    try {
      await postToDrive({ action: "deleteReview", password: password(), reviewId: review.id });
      if (state && state.id === review.id) {
        editor.hidden = true;
        editor.replaceChildren();
        state = null;
      }
      setReviews(reviews.filter((item) => item.id !== review.id));
    } catch (err) {
      if (authFailed(err)) return;
      showStatus(err.message || "Could not delete the review.", "error");
    }
  }

  newButton.addEventListener("click", () => {
    state = blankState();
    pendingFile = null;
    pdfDoc = null;
    picker.setPdf(null);
    showStatus("");
    renderEditor();
    picker.showMessage("Choose a question to select pages.");
  });

  window.addEventListener("dragover", (event) => event.preventDefault());
  window.addEventListener("drop", (event) => event.preventDefault());

  return { setReviews };
}

function newReviewId() {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
