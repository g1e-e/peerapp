// Ara prepares a review: name, PDF, how many incidents, and page assignments.

import { REVIEW_LINK_PREFIX } from "./config.js";
import { isPdfFile, MAX_PDF_BYTES } from "./bytes.js";
import { postToDrive } from "./drive.js";
import { formatPageRange, pageCountLabel, parsePageRange } from "./page-range.js";
import { openPdf } from "./pdfjs.js";
import { buildSegments, clampIncidentCount, MAX_INCIDENTS } from "./questions.js";
import { createReferenceView } from "./reference-view.js";
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

  const viewHost = document.createElement("div");
  const view = createReferenceView(viewHost);

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

  function blankState() {
    return {
      id: newReviewId(),
      name: "",
      incidentCount: 0,
      pdfFileId: "",
      pageCount: 0,
      pages: {},
      ranges: {},
      activeId: "",
    };
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

      const title = document.createElement("p");
      title.className = "admin-when";
      title.textContent = review.name || "Untitled review";

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
      item.append(title, meta, actions);
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
    dropText.textContent = pendingFile
      ? pendingFile.name
      : (state.pdfFileId ? "Reference PDF saved. Drop a new file to replace it." : "Drop a reference PDF here, or choose a file.");
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
    columns.append(questions, viewHost);

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

  function renderQuestions(host) {
    host.replaceChildren();
    for (const segment of buildSegments(state.incidentCount)) {
      const block = document.createElement("section");
      block.className = "segment";
      const heading = document.createElement("h2");
      heading.textContent = segment.title;
      block.append(heading);

      for (const question of segment.questions) {
        const row = document.createElement("div");
        row.className = "prep-question";
        if (question.id === state.activeId) row.classList.add("is-active");

        const button = document.createElement("button");
        button.type = "button";
        button.className = "prep-question-label";
        button.textContent = questionText(question);

        const range = document.createElement("input");
        range.type = "text";
        range.placeholder = "3-7, 12, 40-45";
        range.value = state.ranges[question.id] || "";

        const count = document.createElement("p");
        count.className = "prep-page-count";
        paintCount(count, range.value);

        const select = () => previewQuestion(question.id, row);
        button.addEventListener("click", select);
        range.addEventListener("focus", select);
        range.addEventListener("input", () => {
          state.ranges[question.id] = range.value;
          paintCount(count, range.value);
          if (state.activeId === question.id) previewQuestion(question.id, row);
        });

        row.append(button, range, count);
        block.append(row);
      }
      host.append(block);
    }
  }

  function paintCount(element, text) {
    const parsed = parsePageRange(text, state.pageCount);
    element.textContent = parsed.error || pageCountLabel(parsed.pages.length);
    element.classList.toggle("is-error", Boolean(parsed.error));
    return parsed;
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
      if (match && Number(match[1]) > next) {
        delete state.pages[id];
        delete state.ranges[id];
      }
    }
    state.incidentCount = next;
    input.value = String(next);
    const host = editor.querySelector(".prep-questions");
    if (host) renderQuestions(host);
  }

  function removedAssignments(next) {
    return Object.keys(state.pages).filter((id) => {
      const match = id.match(/^incident(\d+)\./);
      return match && Number(match[1]) > next && state.pages[id].length;
    });
  }

  function previewQuestion(id, row) {
    state.activeId = id;
    for (const item of editor.querySelectorAll(".prep-question")) {
      item.classList.toggle("is-active", item === row);
    }
    const parsed = parsePageRange(state.ranges[id] || "", state.pageCount);
    if (!parsed.error) state.pages[id] = parsed.pages;
    if (!pdfDoc) {
      view.showMessage("Add a PDF to preview these pages.");
      return;
    }
    if (parsed.error) {
      view.showMessage(parsed.error);
      return;
    }
    if (!parsed.pages.length) {
      view.showMessage("No reference pages for this question.");
      return;
    }
    view.showPages(parsed.pages);
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
    state.pdfFileId = "";
    view.setPdf(pdfDoc);
    view.showMessage("Click a question to preview its pages.");
    label.textContent = file.name;
    const host = editor.querySelector(".prep-questions");
    if (host) renderQuestions(host);
  }

  async function editReview(review) {
    state = {
      id: review.id,
      name: review.name || "",
      incidentCount: clampIncidentCount(review.incidentCount),
      pdfFileId: review.pdfFileId || "",
      pageCount: Number(review.pageCount) || 0,
      pages: { ...(review.pages || {}) },
      ranges: {},
      activeId: "",
      savedId: review.id,
    };
    for (const [id, pages] of Object.entries(state.pages)) {
      state.ranges[id] = formatPageRange(pages);
    }
    pendingFile = null;
    pdfDoc = null;
    renderEditor();
    view.showProgress("Loading reference PDF…", 0);
    try {
      const bytes = await downloadReviewPdf(review.id, (done, total) => {
        view.showProgress(`Loading reference PDF… part ${done} of ${total}`, done / total);
      });
      pdfDoc = await openPdf(bytes);
      view.setPdf(pdfDoc);
      view.showMessage("Click a question to preview its pages.");
    } catch (err) {
      if (authFailed(err)) return;
      view.showMessage(err.message || "Could not load the reference PDF.");
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
        const parsed = parsePageRange(state.ranges[question.id] || "", state.pageCount);
        if (parsed.error) {
          return { error: `${questionText(question)}: ${parsed.error}` };
        }
        if (parsed.pages.length) pages[question.id] = parsed.pages;
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
    if (!state.pageCount || (!pendingFile && !state.pdfFileId)) {
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
      let pdfFileId = state.pdfFileId;
      if (pendingFile) {
        showStatus("Uploading PDF…", "notice");
        pdfFileId = await uploadPdf(pendingFile, password(), (done, total) => {
          showStatus(`Uploading PDF… part ${done} of ${total}`, "notice");
        });
        state.pdfFileId = pdfFileId;
        pendingFile = null;
      }
      showStatus("Saving review…", "notice");
      await postToDrive({
        action: "saveReview",
        password: password(),
        review: {
          id: state.id,
          name,
          pdfFileId,
          pageCount: state.pageCount,
          incidentCount: state.incidentCount,
          pages: collected.pages,
        },
      });
      state.pages = collected.pages;
      state.savedId = state.id;
      const linkBox = editor.querySelector(".prep-link");
      if (linkBox) fillLinkBox(linkBox, state.id);
      showStatus("Saved.", "success");
      await refresh();
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
      await refresh();
    } catch (err) {
      if (authFailed(err)) return;
      showStatus(err.message || "Could not delete the review.", "error");
    }
  }

  async function refresh() {
    const data = await postToDrive({ action: "listReviews", password: password() });
    reviews = Array.isArray(data.reviews) ? data.reviews : [];
    renderList();
    if (options.onReviews) options.onReviews(reviews);
  }

  newButton.addEventListener("click", () => {
    state = blankState();
    pendingFile = null;
    pdfDoc = null;
    showStatus("");
    renderEditor();
    view.showMessage("Add a PDF, then click a question to preview its pages.");
  });

  window.addEventListener("dragover", (event) => event.preventDefault());
  window.addEventListener("drop", (event) => event.preventDefault());

  return {
    refresh,
    getReviews() {
      return reviews;
    },
  };
}

function newReviewId() {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
