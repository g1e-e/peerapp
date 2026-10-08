import { REVIEW_LINK_PREFIX } from "./config.js";
import { INLINE_PDF_BYTES, isPdfFile, MAX_PDF_BYTES } from "./bytes.js";
import { postToDrive } from "./drive.js";
import { formatPageRange } from "./page-range.js";
import {
  EMPTY_PROCEDURE_TIMES,
  PROCEDURE_MISS,
  PROCEDURE_QUESTION_ID,
  durationLabel,
  findProcedureTimes,
  normalizeProcedureTimes,
} from "./procedure-times.js";
import { createPagePicker } from "./page-picker.js";
import { openPdf } from "./pdfjs.js";
import { basicDetailsSegment, buildSegments, clampIncidentCount, emptyBasicDetails, MAX_INCIDENTS } from "./questions.js";
import { downloadReviewPdf, uploadPdf } from "./review-transfer.js";
import { copyPdfPages } from "./trim-pdf.js";

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
    const questionId = state.activeId;
    if (pages.length) state.pages[questionId] = pages;
    else delete state.pages[questionId];
    const summary = editor.querySelector(`[data-summary-for="${CSS.escape(questionId)}"]`);
    if (summary) summary.textContent = pagesLabel(pages);
    picker.setUsage(usageCounts(questionId));
    if (questionId === PROCEDURE_QUESTION_ID) refreshProcedureTimes(pages);
  });

  let reviews = [];
  let pdfDoc = null;
  let pendingFile = null;
  let state = null;
  let openGeneration = 0;

  function token() {
    return options.getToken();
  }

  function showStatus(text, tone) {
    for (const target of [status, editor.querySelector(".prep-save-status")]) {
      if (!target) continue;
      target.hidden = !text;
      target.textContent = text || "";
      target.className = `submit-status${tone ? ` ${tone}` : ""}${target === status ? "" : " prep-save-status"}`;
    }
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
      procedureTimes: { ...EMPTY_PROCEDURE_TIMES },
      timeFound: null,
      accessCode: "",
      closed: false,
      pdfBytes: null,
      loadedSourcePages: null,
      basicDetails: emptyBasicDetails(),
    };
  }

  function normalizeCode(value) {
    return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  }

  function groupCode(value) {
    const raw = normalizeCode(value);
    return raw.replace(/(.{4})(?=.)/g, "$1-");
  }

  function generateAccessCode() {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const bytes = new Uint8Array(12);
    crypto.getRandomValues(bytes);
    let raw = "";
    for (let i = 0; i < 12; i += 1) raw += alphabet[bytes[i] % alphabet.length];
    return groupCode(raw);
  }

  function accessBadge(hasCode) {
    const badge = document.createElement("span");
    badge.className = hasCode ? "access-badge is-protected" : "access-badge is-open";
    badge.textContent = hasCode ? "Protected" : "No access code";
    return badge;
  }

  function assignedOriginals(pages) {
    const found = new Set();
    for (const list of Object.values(pages || {})) {
      for (const page of list || []) found.add(Number(page));
    }
    return [...found].sort((a, b) => a - b);
  }

  function samePageList(left, right) {
    if (!left || !right || left.length !== right.length) return false;
    for (let index = 0; index < left.length; index += 1) {
      if (Number(left[index]) !== Number(right[index])) return false;
    }
    return true;
  }

  function pdfPageFor(original) {
    if (!state.loadedSourcePages) return Number(original);
    const index = state.loadedSourcePages.indexOf(Number(original));
    return index < 0 ? 0 : index + 1;
  }

  function originalForPdfPage(pdfPage) {
    if (!pdfPage) return 0;
    if (!state.loadedSourcePages) return pdfPage;
    return state.loadedSourcePages[pdfPage - 1] || pdfPage;
  }

  function detailsFromReview(value) {
    const details = emptyBasicDetails();
    if (!value || typeof value !== "object") return details;
    for (const question of basicDetailsSegment.questions) {
      details[question.id] = value[question.id] == null ? "" : String(value[question.id]);
    }
    return details;
  }

  function toEditorPages(pages, sourcePages) {
    if (!sourcePages || !sourcePages.length) return { ...(pages || {}) };
    const converted = {};
    for (const [id, list] of Object.entries(pages || {})) {
      const originals = [];
      for (const index of list || []) {
        const original = sourcePages[Number(index) - 1];
        if (original) originals.push(Number(original));
      }
      if (originals.length) converted[id] = originals;
    }
    return converted;
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
      heading.append(accessBadge(!!review.hasCode));
      const title = document.createElement("span");
      title.textContent = review.name || "Untitled review";
      heading.append(title);

      const meta = document.createElement("p");
      meta.className = "admin-who";
      const count = Number(review.submissionCount) || 0;
      const incidents = clampIncidentCount(review.incidentCount);
      meta.textContent = `${incidents} incident${incidents === 1 ? "" : "s"} · ${count} submission${count === 1 ? "" : "s"}${review.closed ? " · Closed" : ""}`;

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

      const closedToggle = document.createElement("button");
      closedToggle.type = "button";
      closedToggle.className = "button button-secondary";
      closedToggle.textContent = review.closed ? "Reopen review" : "Close review";
      closedToggle.addEventListener("click", () => toggleClosed(review, closedToggle));

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "button button-secondary";
      remove.textContent = "Delete";
      remove.addEventListener("click", () => deleteReview(review));

      actions.append(open, copy, closedToggle, remove);
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

    const head = document.createElement("div");
    head.className = "prep-head";
    const back = document.createElement("button");
    back.type = "button";
    back.className = "button button-secondary";
    back.textContent = "Back";
    back.addEventListener("click", () => {
      openGeneration += 1;
      editor.hidden = true;
      editor.replaceChildren();
      state = null;
      showStatus("");
    });
    const accessRow = document.createElement("div");
    accessRow.className = "prep-access";
    const codeLabel = document.createElement("label");
    codeLabel.className = "field";
    const codeCaption = document.createElement("span");
    codeCaption.className = "field-label";
    codeCaption.textContent = "Access code";
    const codeInput = document.createElement("input");
    codeInput.type = "text";
    codeInput.id = "prep-access-code";
    codeInput.autocomplete = "off";
    codeInput.spellcheck = false;
    codeInput.value = state.accessCode || "";
    codeInput.addEventListener("input", () => {
      state.accessCode = codeInput.value;
      paintAccessBadge();
    });
    codeLabel.append(codeCaption, codeInput);
    const generate = document.createElement("button");
    generate.type = "button";
    generate.className = "button button-secondary";
    generate.textContent = "Generate";
    generate.addEventListener("click", () => {
      state.accessCode = generateAccessCode();
      codeInput.value = state.accessCode;
      paintAccessBadge();
    });
    const badge = accessBadge(normalizeCode(state.accessCode).length > 0);
    badge.classList.add("prep-access-badge");
    const closedToggle = document.createElement("button");
    closedToggle.type = "button";
    closedToggle.className = "button button-secondary";
    closedToggle.id = "prep-closed-toggle";
    closedToggle.textContent = state.closed ? "Reopen review" : "Close review";
    closedToggle.addEventListener("click", () => toggleClosed(state, closedToggle));
    accessRow.append(codeLabel, generate, badge, closedToggle);

    head.append(back, nameLabel, countLabel, accessRow, drop);

    const questions = document.createElement("div");
    questions.className = "prep-questions";
    renderQuestions(questions);

    const save = document.createElement("button");
    save.type = "button";
    save.className = "button button-primary";
    save.textContent = "Save review";
    save.addEventListener("click", () => saveReview(save));

    const linkBox = document.createElement("div");
    linkBox.className = "prep-link";
    linkBox.hidden = !state.savedId;
    if (state.savedId) fillLinkBox(linkBox, state.savedId);

    const left = document.createElement("div");
    left.className = "prep-left";
    const saveStatus = document.createElement("p");
    saveStatus.className = "submit-status prep-save-status";
    saveStatus.hidden = true;
    left.append(head, questions, save, saveStatus, linkBox);
    const right = document.createElement("div");
    right.className = "prep-right";
    right.append(pickerHost);
    const workspace = document.createElement("div");
    workspace.className = "prep-workspace";
    workspace.append(left, right);
    editor.append(workspace);
  }

  function pdfDropLabel() {
    if (pendingFile) return pendingFile.name;
    if (state.hasPdf) return "Reference PDF saved. Drop a new file to replace it.";
    return "Drop a reference PDF here, or choose a file.";
  }

  function renderBasicEditor() {
    const section = document.createElement("section");
    section.className = "segment";
    const heading = document.createElement("h2");
    heading.textContent = basicDetailsSegment.title;
    section.append(heading);
    const grid = document.createElement("div");
    grid.className = "segment-fields";
    for (const question of basicDetailsSegment.questions) {
      const label = document.createElement("label");
      label.className = `field${question.width === "half" ? " field-half" : ""}`;
      const caption = document.createElement("span");
      caption.className = "field-label";
      caption.textContent = question.label;
      let input;
      if (question.type === "select") {
        input = document.createElement("select");
        const blank = document.createElement("option");
        blank.value = "";
        blank.textContent = "Choose…";
        input.append(blank);
        for (const option of question.options || []) {
          const node = document.createElement("option");
          node.value = option;
          node.textContent = option;
          input.append(node);
        }
      } else {
        input = document.createElement("input");
        input.type = question.type === "date" ? "date" : "text";
        if (question.placeholder) input.placeholder = question.placeholder;
      }
      input.value = state.basicDetails[question.id] || "";
      input.addEventListener("input", () => {
        state.basicDetails[question.id] = input.value;
      });
      input.addEventListener("change", () => {
        state.basicDetails[question.id] = input.value;
      });
      label.append(caption, input);
      grid.append(label);
    }
    section.append(grid);
    return section;
  }

  function renderQuestions(host) {
    host.replaceChildren();
    host.append(renderBasicEditor());
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
        if (question.id === PROCEDURE_QUESTION_ID) row.append(procedureTimesBox());
        block.append(row);
      }
      host.append(block);
    }
    if (activeQuestion) activateQuestion(activeSegment, activeQuestion, activeRow);
  }

  function procedureTimesBox() {
    const box = document.createElement("div");
    box.className = "prep-times";
    const note = document.createElement("p");
    note.className = "prep-times-note";
    note.textContent = procedureNote();
    const row = document.createElement("div");
    row.className = "prep-times-inputs";
    const start = document.createElement("input");
    start.type = "time";
    start.value = state.procedureTimes.start || "";
    start.setAttribute("aria-label", "Procedure start");
    const end = document.createElement("input");
    end.type = "time";
    end.value = state.procedureTimes.end || "";
    end.setAttribute("aria-label", "Procedure end");
    const clear = document.createElement("button");
    clear.type = "button";
    clear.className = "button button-secondary";
    clear.textContent = "Clear times";
    start.addEventListener("input", () => {
      state.procedureTimes.start = start.value;
      note.textContent = procedureNote();
    });
    end.addEventListener("input", () => {
      state.procedureTimes.end = end.value;
      note.textContent = procedureNote();
    });
    clear.addEventListener("click", (event) => {
      event.stopPropagation();
      state.procedureTimes = { ...EMPTY_PROCEDURE_TIMES };
      state.timeFound = null;
      start.value = "";
      end.value = "";
      note.textContent = procedureNote();
    });
    row.append(start, end, clear);
    box.append(note, row);
    return box;
  }

  function procedureNote() {
    const pages = state.pages[PROCEDURE_QUESTION_ID] || [];
    const found = state.timeFound;
    const current = state.procedureTimes || EMPTY_PROCEDURE_TIMES;
    const lines = [];
    if (found && found.start && found.start === current.start) {
      lines.push(`Procedure start: ${found.start}${found.startPage ? ` (page ${found.startPage})` : ""}`);
    }
    if (found && found.end && found.end === current.end) {
      lines.push(`Procedure end: ${found.end}${found.endPage ? ` (page ${found.endPage})` : ""}`);
    }
    if (current.start && current.end) lines.push(`Duration: ${durationLabel(current.start, current.end)}`);
    if (!lines.length && pages.length && !current.start && !current.end) return PROCEDURE_MISS;
    return lines.join("\n");
  }

  async function refreshProcedureTimes(pages, keepOverrides) {
    if (!pdfDoc || !pages.length) {
      state.timeFound = null;
      if (!pages.length && !keepOverrides) state.procedureTimes = { ...EMPTY_PROCEDURE_TIMES };
      paintProcedureTimes();
      return;
    }
    const pdfPages = pages.map((page) => pdfPageFor(page)).filter((page) => page > 0);
    const found = await findProcedureTimes(pdfDoc, pdfPages);
    state.timeFound = {
      ...found,
      startPage: originalForPdfPage(found.startPage),
      endPage: originalForPdfPage(found.endPage),
    };
    if (!keepOverrides) {
      state.procedureTimes = {
        start: found.start || "",
        end: found.end || "",
      };
    }
    paintProcedureTimes();
  }

  function paintProcedureTimes() {
    const box = editor.querySelector(".prep-times");
    if (!box) return;
    const note = box.querySelector(".prep-times-note");
    const [start, end] = box.querySelectorAll("input");
    if (note) note.textContent = procedureNote();
    if (start) start.value = state.procedureTimes.start || "";
    if (end) end.value = state.procedureTimes.end || "";
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
    let bytes;
    try {
      bytes = new Uint8Array(await file.arrayBuffer());
      pdfDoc = await openPdf(bytes);
    } catch {
      showStatus("Could not read that PDF.", "error");
      return;
    }
    pendingFile = file;
    state.pdfBytes = bytes;
    state.loadedSourcePages = null;
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

  function paintAccessBadge() {
    const current = editor.querySelector(".prep-access-badge");
    if (!current || !state) return;
    const hasCode = normalizeCode(state.accessCode).length > 0;
    current.className = `access-badge prep-access-badge ${hasCode ? "is-protected" : "is-open"}`;
    current.textContent = hasCode ? "Protected" : "No access code";
  }

  async function toggleClosed(review, button) {
    const next = !review.closed;
    if (review === state && !state.savedId) {
      state.closed = next;
      button.textContent = next ? "Reopen review" : "Close review";
      return;
    }
    button.disabled = true;
    showStatus(next ? "Closing review…" : "Reopening review…", "notice");
    try {
      const data = await postToDrive({
        action: "setReviewClosed",
        token: token(),
        reviewId: review.id,
        closed: next,
      });
      upsertReview(data.review);
      showStatus(data.review && data.review.closed ? "Review closed." : "Review reopened.", "success");
      if (state && state.id === review.id) {
        state.closed = !!data.review.closed;
        const headerButton = editor.querySelector("#prep-closed-toggle");
        if (headerButton) headerButton.textContent = state.closed ? "Reopen review" : "Close review";
      }
    } catch (err) {
      if (authFailed(err)) return;
      showStatus(err.message || "Could not update the review.", "error");
    } finally {
      button.disabled = false;
    }
  }

  function editorStateFromReview(full, sourcePages) {
    return {
      id: full.id,
      name: full.name || "",
      incidentCount: clampIncidentCount(full.incidentCount),
      hasPdf: true,
      pageCount: sourcePages ? sourcePages.length : Number(full.pageCount) || 0,
      pages: toEditorPages(full.pages, sourcePages),
      activeId: "",
      savedId: full.id,
      procedureTimes: normalizeProcedureTimes(full.procedureTimes),
      timeFound: null,
      accessCode: full.accessCode || "",
      closed: !!full.closed,
      pdfBytes: null,
      loadedSourcePages: sourcePages,
      basicDetails: detailsFromReview(full.basicDetails),
    };
  }

  async function editReview(review) {
    const generation = ++openGeneration;
    state = {
      id: review.id,
      name: review.name || "",
      incidentCount: clampIncidentCount(review.incidentCount),
      hasPdf: true,
      pageCount: 0,
      pages: {},
      activeId: "",
      savedId: review.id,
      procedureTimes: { ...EMPTY_PROCEDURE_TIMES },
      timeFound: null,
      accessCode: "",
      closed: !!review.closed,
      pdfBytes: null,
      loadedSourcePages: null,
      basicDetails: emptyBasicDetails(),
    };
    pendingFile = null;
    pdfDoc = null;
    renderEditor();
    showStatus("Loading review details…", "notice");
    picker.showProgress("Loading review details…");

    const knownChunks = Number(review.pdfChunkCount) || 0;
    const reportPdf = (done, total) => {
      if (generation !== openGeneration) return;
      const text = `Loading reference PDF… part ${done} of ${total}`;
      showStatus(text, "notice");
      picker.showProgress(text);
    };
    let pdfFailure = null;
    const pdfTask = knownChunks
      ? downloadReviewPdf(review.id, knownChunks, reportPdf, { token: token() }).catch((err) => {
        pdfFailure = err;
        return null;
      })
      : null;

    let full;
    try {
      const data = await postToDrive({
        action: "getReviewAdmin",
        token: token(),
        reviewId: review.id,
      });
      full = data.review;
    } catch (err) {
      if (generation !== openGeneration) return;
      openGeneration += 1;
      if (authFailed(err)) return;
      showStatus(err.message || "Could not open the review.", "error");
      return;
    }
    if (generation !== openGeneration || !state || state.id !== review.id) return;

    const sourcePages = Array.isArray(full.sourcePages) && full.sourcePages.length
      ? full.sourcePages.map((page) => Number(page))
      : null;
    const draftName = state.name;
    const draftCode = state.accessCode;
    const draftCount = state.incidentCount;
    const draftClosed = state.closed;
    const draftDetails = state.basicDetails;
    state = editorStateFromReview(full, sourcePages);
    if (draftName !== (review.name || "")) state.name = draftName;
    if (normalizeCode(draftCode)) state.accessCode = draftCode;
    if (draftCount !== clampIncidentCount(review.incidentCount)) state.incidentCount = draftCount;
    if (draftClosed !== !!review.closed) state.closed = draftClosed;
    if (draftDetails && Object.values(draftDetails).some((value) => String(value || "").trim())) {
      state.basicDetails = { ...draftDetails };
    }
    renderEditor();
    showStatus("Loading reference PDF…", "notice");
    picker.showProgress("Loading reference PDF…");
    try {
      let bytes = null;
      if (pdfTask) {
        bytes = await pdfTask;
        if (pdfFailure && Number(full.pdfChunkCount) !== knownChunks) {
          pdfFailure = null;
          bytes = await downloadReviewPdf(full.id, full.pdfChunkCount, reportPdf, { token: token() });
        }
      } else {
        bytes = await downloadReviewPdf(full.id, full.pdfChunkCount, reportPdf, { token: token() });
      }
      if (pdfFailure) throw pdfFailure;
      if (generation !== openGeneration || !state || state.id !== review.id) return;
      if (!bytes) throw new Error("Could not load the reference PDF.");
      state.pdfBytes = bytes;
      pdfDoc = await openPdf(bytes);
      if (generation !== openGeneration || !state || state.id !== review.id) return;
      picker.setPdf(pdfDoc, sourcePages);
      picker.showMessage("Choose a question to select pages.");
      showStatus("");
      await refreshProcedureTimes(state.pages[PROCEDURE_QUESTION_ID] || [], true);
    } catch (err) {
      if (generation !== openGeneration) return;
      if (authFailed(err)) return;
      const message = err.message || "Could not load the reference PDF.";
      showStatus(message, "error");
      picker.showMessage(message);
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
    const code = groupCode(state && state.accessCode);
    if (!code) return;
    const codeCaption = document.createElement("p");
    codeCaption.className = "field-label";
    codeCaption.textContent = "Access code";
    const codeText = document.createElement("p");
    codeText.className = "prep-link-url";
    codeText.textContent = code;
    const copyCode = document.createElement("button");
    copyCode.type = "button";
    copyCode.className = "button button-secondary";
    copyCode.textContent = "Copy";
    copyCode.addEventListener("click", async () => {
      const original = copyCode.textContent;
      try {
        await navigator.clipboard.writeText(code);
        copyCode.textContent = "Copied";
      } catch {
        copyCode.textContent = code;
      }
      window.setTimeout(() => {
        copyCode.textContent = original;
      }, 2000);
    });
    const note = document.createElement("p");
    note.className = "prep-code-note";
    note.textContent = "Send the code separately from the link.";
    box.append(codeCaption, codeText, copyCode, note);
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
    const accessCode = groupCode(state.accessCode);
    if (!accessCode) {
      const ok = window.confirm("Without an access code, anyone with this link can see the PDF pages. Save without a code?");
      if (!ok) {
        showStatus("Not saved. Add an access code, or confirm saving without one.", "error");
        return;
      }
    }
    const sourcePages = assignedOriginals(collected.pages);
    if (!sourcePages.length) {
      showStatus("Assign at least one page before saving.", "error");
      return;
    }
    for (const original of sourcePages) {
      if (!pdfPageFor(original)) {
        showStatus(`Page ${original} is not in this PDF. Upload the original file to add it.`, "error");
        return;
      }
    }
    const storedPages = {};
    const place = new Map(sourcePages.map((original, index) => [original, index + 1]));
    for (const [id, list] of Object.entries(collected.pages)) {
      storedPages[id] = list.map((page) => place.get(Number(page)));
    }
    const unchangedTrim = samePageList(state.loadedSourcePages, sourcePages);

    button.disabled = true;
    try {
      const payload = {
        id: state.id,
        name,
        pageCount: sourcePages.length,
        incidentCount: state.incidentCount,
        pages: storedPages,
        sourcePages,
        procedureTimes: normalizeProcedureTimes(state.procedureTimes),
        basicDetails: { ...state.basicDetails },
        accessCode,
        closed: !!state.closed,
      };
      if (!unchangedTrim) {
        if (!state.pdfBytes) {
          showStatus("The reference PDF is not loaded yet.", "error");
          return;
        }
        showStatus("Preparing the selected pages...", "notice");
        let trimmed;
        try {
          const indexes = sourcePages.map((original) => pdfPageFor(original) - 1);
          trimmed = await copyPdfPages(state.pdfBytes, indexes);
        } catch {
          showStatus("Could not copy the selected pages.", "error");
          return;
        }
        const file = new File([trimmed], "review.pdf", { type: "application/pdf" });
        showStatus(file.size <= INLINE_PDF_BYTES ? "Preparing the PDF…" : "Uploading the PDF…", "notice");
        const uploaded = await uploadPdf(file, token(), (done, total) => {
          showStatus(`Uploading part ${done} of ${total}…`, "notice");
        });
        if (uploaded.inlinePdf) {
          payload.inlinePdf = uploaded.inlinePdf;
          payload.pdfSize = uploaded.pdfSize;
        } else {
          payload.pdfChunks = uploaded.pdfChunks;
          payload.folderId = uploaded.folderId;
          payload.pdfSize = uploaded.pdfSize;
        }
        payload._trimmedBytes = trimmed;
      }
      const trimmedBytes = payload._trimmedBytes;
      delete payload._trimmedBytes;
      showStatus("Saving review…", "notice");
      const saved = await postToDrive({
        action: "saveReview",
        token: token(),
        review: payload,
      });
      state.accessCode = accessCode;
      const codeInput = editor.querySelector("#prep-access-code");
      if (codeInput) codeInput.value = accessCode;
      paintAccessBadge();
      if (trimmedBytes) {
        pdfDoc = await openPdf(trimmedBytes);
        state.pdfBytes = trimmedBytes;
        state.loadedSourcePages = sourcePages.slice();
        state.pageCount = sourcePages.length;
        state.hasPdf = true;
        pendingFile = null;
        picker.setPdf(pdfDoc, sourcePages);
        const dropText = editor.querySelector(".prep-drop p");
        if (dropText) dropText.textContent = pdfDropLabel();
      }
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
    showStatus("Deleting review…", "notice");
    try {
      const data = await postToDrive({ action: "deleteReview", token: token(), reviewId: review.id });
      const removedId = data.reviewId || review.id;
      openGeneration += 1;
      if (state && state.id === removedId) {
        editor.hidden = true;
        editor.replaceChildren();
        state = null;
      }
      setReviews(reviews.filter((item) => item.id !== removedId));
      if (options.onReviewRemoved) options.onReviewRemoved(removedId);
      showStatus("");
    } catch (err) {
      if (authFailed(err)) return;
      showStatus(err.message || "Could not delete the review.", "error");
    }
  }

  newButton.addEventListener("click", () => {
    openGeneration += 1;
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
