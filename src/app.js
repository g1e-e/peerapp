import { driveConfigured, postToDrive } from "./drive.js";
import { openPdf } from "./pdfjs.js";
import { PROCEDURE_QUESTION_ID, formatProcedureLine, normalizeProcedureTimes } from "./procedure-times.js";
import { buildSegments, clampIncidentCount, MAX_INCIDENTS } from "./questions.js";
import { createReferenceView } from "./reference-view.js";
import { downloadReviewPdf } from "./review-transfer.js";

const STANDALONE_KEY = "peer-review-answers";
const OLD_INCIDENT_KEY = /^incident[12](PatientName|Mrn|SurgeryDate|Number|Surgeon|Procedure|EventReview|ReviewedBy|ReviewDate)$/;

const reviewId = new URLSearchParams(window.location.search).get("review") || "";
let reviewMode = false;
let reviewName = "";
let reviewPages = {};
let procedureTimes = { start: "", end: "" };
let incidentCount = 0;
let segments = buildSegments(0);
let activeQuestionId = "";

const form = document.querySelector("#review-form");
const summary = document.querySelector("#summary");
const clearButton = document.querySelector("#clear-button");
const submitButton = document.querySelector("#submit-button");
const submitStatus = document.querySelector("#submit-status");
const incidentActions = document.querySelector("#incident-actions");
const reviewBanner = document.querySelector("#review-banner");
const reviewViewRoot = document.querySelector("#review-view");
const referenceView = createReferenceView(reviewViewRoot);

const controls = new Map();

function storageKey() {
  return reviewId ? `${STANDALONE_KEY}:${reviewId}` : STANDALONE_KEY;
}

function cleanAnswers(answers) {
  const clean = {};
  for (const [key, value] of Object.entries(answers || {})) {
    if (OLD_INCIDENT_KEY.test(key)) continue;
    clean[key] = value;
  }
  return clean;
}

function loadState() {
  try {
    const saved = localStorage.getItem(storageKey());
    if (!saved) return { incidentCount: 0, answers: {} };
    const parsed = JSON.parse(saved);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { incidentCount: 0, answers: {} };
    }
    if (parsed.answers && typeof parsed.answers === "object" && !Array.isArray(parsed.answers)) {
      return {
        incidentCount: clampIncidentCount(parsed.incidentCount),
        answers: cleanAnswers(parsed.answers),
      };
    }
    return { incidentCount: 0, answers: cleanAnswers(parsed) };
  } catch {
    return { incidentCount: 0, answers: {} };
  }
}

function collectAnswers() {
  const answers = {};
  for (const segment of segments) {
    for (const question of segment.questions) {
      answers[question.id] = readControl(question);
    }
  }
  return answers;
}

function readControl(question) {
  const control = controls.get(question.id);
  if (!control) return "";

  if (question.type === "rating" || question.type === "yesNoNa" || question.type === "radio") {
    const checked = control.querySelector("input:checked");
    return checked ? checked.value : "";
  }

  return control.value;
}

function saveState() {
  localStorage.setItem(storageKey(), JSON.stringify({
    incidentCount,
    answers: collectAnswers(),
  }));
}

function renderForm(answers) {
  controls.clear();
  form.replaceChildren();

  for (const segment of segments) {
    form.append(renderSegment(segment, answers));
  }
}

function renderSegment(segment, answers) {
  const section = document.createElement("section");
  section.className = "segment";

  const heading = document.createElement("h2");
  heading.textContent = segment.title;
  section.append(heading);

  if (segment.note) {
    const note = document.createElement("p");
    note.className = "segment-note";
    note.textContent = segment.note;
    section.append(note);
  }

  const fields = document.createElement("div");
  fields.className = "segment-fields";

  for (const question of segment.questions) {
    const value = answers[question.id] ?? "";
    fields.append(renderQuestion(question, value));
  }

  section.append(fields);
  return section;
}

function renderQuestion(question, value) {
  let field;

  switch (question.type) {
    case "textarea":
      field = renderTextarea(question, value);
      break;
    case "select":
      field = renderSelect(question, value);
      break;
    case "rating":
      field = renderRating(question, value);
      break;
    case "yesNoNa":
    case "radio":
      field = renderRadio(question, value);
      break;
    case "date":
      field = renderTextLike(question, value, "date");
      break;
    default:
      field = renderTextLike(question, value, "text");
  }

  if (question.width === "half") field.classList.add("field-half");
  field.dataset.questionId = question.id;
  if (reviewMode) {
    field.addEventListener("click", () => activateQuestion(question.id));
    field.addEventListener("focusin", () => activateQuestion(question.id));
  }
  if (question.id === activeQuestionId) field.classList.add("is-active");
  if (reviewMode && question.id === PROCEDURE_QUESTION_ID) {
    const line = formatProcedureLine(procedureTimes);
    if (line) {
      const info = document.createElement("p");
      info.className = "procedure-times";
      info.textContent = line;
      const legend = field.querySelector("legend");
      if (legend) legend.after(info);
      else field.append(info);
    }
  }
  return field;
}

function activateQuestion(id) {
  activeQuestionId = id;
  for (const field of form.querySelectorAll(".field.is-active")) {
    field.classList.remove("is-active");
  }
  const field = form.querySelector(`[data-question-id="${CSS.escape(id)}"]`);
  if (field) field.classList.add("is-active");

  const pages = reviewPages[id] || [];
  if (!pages.length) {
    referenceView.showMessage("No reference pages for this question.");
    return;
  }
  referenceView.showPages(pages, `${questionHeading(id)} · ${pages.length} page${pages.length === 1 ? "" : "s"}`);
}

function questionHeading(id) {
  for (const segment of segments) {
    for (const question of segment.questions) {
      if (question.id !== id) continue;
      if (question.number != null && question.number !== "") return `${segment.title} ${question.number}`;
      return `${segment.title}: ${question.label}`;
    }
  }
  return "Reference";
}

function renderTextLike(question, value, inputType) {
  const label = document.createElement("label");
  label.className = "field";

  const caption = document.createElement("span");
  caption.className = "field-label";
  caption.textContent = question.label;

  const input = document.createElement("input");
  input.type = inputType;
  if (question.placeholder) input.placeholder = question.placeholder;
  input.value = value == null ? "" : String(value);

  label.append(caption, input);
  controls.set(question.id, input);
  return label;
}

function renderTextarea(question, value) {
  const label = document.createElement("label");
  label.className = "field";

  const caption = document.createElement("span");
  caption.className = "field-label";
  caption.textContent = question.label;

  const textarea = document.createElement("textarea");
  textarea.rows = Number.isFinite(question.rows) ? question.rows : 4;
  if (question.placeholder) textarea.placeholder = question.placeholder;
  textarea.value = value == null ? "" : String(value);

  label.append(caption, textarea);
  controls.set(question.id, textarea);
  return label;
}

function renderSelect(question, value) {
  const label = document.createElement("label");
  label.className = "field";

  const caption = document.createElement("span");
  caption.className = "field-label";
  caption.textContent = question.label;

  const select = document.createElement("select");

  const blank = document.createElement("option");
  blank.value = "";
  blank.textContent = "Choose…";
  select.append(blank);

  const options = Array.isArray(question.options) ? question.options : [];
  for (const optionLabel of options) {
    const option = document.createElement("option");
    option.value = String(optionLabel);
    option.textContent = String(optionLabel);
    select.append(option);
  }

  select.value = value == null ? "" : String(value);

  label.append(caption, select);
  controls.set(question.id, select);
  return label;
}

function questionText(question) {
  if (question.number == null || question.number === "") return question.label;
  return `${question.number}. ${question.label}`;
}

function renderRadio(question, value) {
  const choices = Array.isArray(question.options) && question.options.length > 0
    ? question.options
    : ["Yes", "No", "N/A"];

  const fieldset = document.createElement("fieldset");
  fieldset.className = "field";

  const legend = document.createElement("legend");
  legend.textContent = questionText(question);
  fieldset.append(legend);

  const row = document.createElement("div");
  row.className = "yes-no-na";

  for (const choice of choices) {
    const choiceLabel = document.createElement("label");
    const input = document.createElement("input");
    input.type = "radio";
    input.name = question.id;
    input.value = choice;
    input.checked = String(value) === choice;

    const text = document.createElement("span");
    text.textContent = choice;

    choiceLabel.append(input, text);
    row.append(choiceLabel);
  }

  fieldset.append(row);
  controls.set(question.id, fieldset);
  return fieldset;
}

function renderRating(question, value) {
  const min = Number.isFinite(question.min) ? question.min : 1;
  const max = Number.isFinite(question.max) ? question.max : 5;

  const fieldset = document.createElement("fieldset");
  fieldset.className = "field";

  const legend = document.createElement("legend");
  legend.textContent = question.label;
  fieldset.append(legend);

  const row = document.createElement("div");
  row.className = "rating";

  for (let score = min; score <= max; score += 1) {
    const choice = document.createElement("label");
    choice.className = "rating-choice";

    const input = document.createElement("input");
    input.type = "radio";
    input.name = question.id;
    input.value = String(score);
    input.checked = String(value) === String(score);

    const text = document.createElement("span");
    text.textContent = String(score);

    choice.append(input, text);
    row.append(choice);
  }

  fieldset.append(row);
  controls.set(question.id, fieldset);
  return fieldset;
}

function formatSummary(answers) {
  const blocks = [];

  for (const segment of segments) {
    const lines = [segment.title];
    for (const question of segment.questions) {
      const raw = answers[question.id];
      const text = raw == null ? "" : String(raw).trim();
      lines.push(`${questionText(question)}: ${text || "(blank)"}`);
      if (question.id === PROCEDURE_QUESTION_ID) {
        const line = formatProcedureLine(procedureTimes);
        if (line) lines.push(line);
      }
    }
    blocks.push(lines.join("\n"));
  }

  return blocks.join("\n\n");
}

function showSummary(answers) {
  summary.replaceChildren();

  const heading = document.createElement("h2");
  heading.textContent = "Review summary";

  const text = document.createElement("pre");
  text.className = "summary-text";
  text.textContent = formatSummary(answers);

  const copyButton = document.createElement("button");
  copyButton.type = "button";
  copyButton.className = "button button-secondary";
  copyButton.textContent = "Copy summary";
  copyButton.addEventListener("click", () => {
    copySummary(text.textContent, copyButton);
  });

  summary.append(heading, text, copyButton);
  summary.hidden = false;
  summary.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function copySummary(text, button) {
  const original = button.textContent;
  try {
    await navigator.clipboard.writeText(text);
    button.textContent = "Copied";
  } catch {
    button.textContent = "Copy failed — select the text above";
  }
  window.setTimeout(() => {
    button.textContent = original;
  }, 2000);
}

function answersForDrive(answers) {
  return segments.map((segment) => ({
    title: segment.title,
    fields: segment.questions.map((question) => ({
      id: question.id,
      label: questionText(question),
      value: answers[question.id] == null ? "" : String(answers[question.id]),
      ...(question.id === PROCEDURE_QUESTION_ID && (procedureTimes.start || procedureTimes.end)
        ? { procedureTimes: { start: procedureTimes.start || "", end: procedureTimes.end || "" } }
        : {}),
    })),
  }));
}

function showSubmitStatus(message, tone) {
  submitStatus.hidden = false;
  submitStatus.textContent = message;
  submitStatus.className = `submit-status ${tone}`;
}

function hideSubmitStatus() {
  submitStatus.hidden = true;
  submitStatus.textContent = "";
  submitStatus.className = "submit-status";
}

async function onSubmit(event) {
  event.preventDefault();
  const answers = collectAnswers();
  saveState();
  showSummary(answers);

  if (!driveConfigured()) {
    showSubmitStatus("Saving to Drive is not set up yet.", "notice");
    return;
  }

  submitButton.disabled = true;
  const label = submitButton.textContent;
  submitButton.textContent = "Submitting…";
  try {
    const payload = {
      action: "submit",
      answers: answersForDrive(answers),
    };
    if (reviewMode) {
      payload.reviewId = reviewId;
      payload.reviewName = reviewName;
    }
    await postToDrive(payload);
    showSubmitStatus("Submitted", "success");
  } catch (err) {
    showSubmitStatus(err.message || "Could not save to Drive.", "error");
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = label;
    submitStatus.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
}

function onClear() {
  const confirmed = window.confirm(
    "Clear every answer? This removes the copy saved in this browser."
  );
  if (!confirmed) return;

  localStorage.removeItem(storageKey());
  renderForm({});
  summary.hidden = true;
  summary.replaceChildren();
  hideSubmitStatus();
}

form.addEventListener("input", saveState);
form.addEventListener("change", saveState);
form.addEventListener("submit", onSubmit);
clearButton.addEventListener("click", onClear);

document.querySelector("#add-incident").addEventListener("click", () => {
  if (reviewMode || incidentCount >= MAX_INCIDENTS) return;
  const answers = collectAnswers();
  incidentCount += 1;
  segments = buildSegments(incidentCount);
  renderForm(answers);
  saveState();
  updateIncidentButtons();
});

document.querySelector("#remove-incident").addEventListener("click", () => {
  if (reviewMode || incidentCount <= 0) return;
  const answers = collectAnswers();
  const prefix = `incident${incidentCount}.`;
  const hasAnswers = Object.keys(answers).some((key) => key.startsWith(prefix) && String(answers[key] || "").trim());
  if (hasAnswers && !window.confirm("Remove the last incident and its answers?")) return;
  incidentCount -= 1;
  segments = buildSegments(incidentCount);
  renderForm(answers);
  saveState();
  updateIncidentButtons();
});

function updateIncidentButtons() {
  incidentActions.hidden = reviewMode;
  document.querySelector("#add-incident").disabled = incidentCount >= MAX_INCIDENTS;
  document.querySelector("#remove-incident").disabled = incidentCount === 0;
}

function showReviewFailure(message) {
  document.querySelector("#pdf-panel").classList.remove("is-review");
  reviewViewRoot.hidden = true;
  form.replaceChildren();
  const note = document.createElement("p");
  note.className = "load-note";
  note.textContent = message;
  form.append(note);
}

async function enterReview() {
  const panel = document.querySelector("#pdf-panel");
  panel.classList.add("is-review");
  reviewViewRoot.hidden = false;
  incidentActions.hidden = true;
  referenceView.showProgress("Loading review…", 0);

  const hold = document.createElement("p");
  hold.className = "segment-note";
  hold.textContent = "Loading review…";
  form.append(hold);

  if (!driveConfigured()) {
    showReviewFailure("This review link needs Google Drive, which is not set up yet.");
    return;
  }

  let review;
  try {
    const data = await postToDrive({ action: "getReview", reviewId });
    review = data.review;
  } catch (err) {
    showReviewFailure(err.message || "Could not open this review.");
    return;
  }

  reviewMode = true;
  reviewName = review.name || "Review";
  reviewPages = review.pages || {};
  procedureTimes = normalizeProcedureTimes(review.procedureTimes);
  incidentCount = clampIncidentCount(review.incidentCount);
  segments = buildSegments(incidentCount);
  renderForm(loadState().answers);
  saveState();
  updateIncidentButtons();
  reviewBanner.hidden = false;
  reviewBanner.textContent = reviewName;

  try {
    referenceView.showProgress("Loading reference PDF…", 0);
    const bytes = await downloadReviewPdf(reviewId, review.pdfChunkCount, (done, total) => {
      referenceView.showProgress(`Loading reference PDF… part ${done} of ${total}`, done / total);
    });
    referenceView.setPdf(await openPdf(bytes));
    referenceView.showMessage("Select a question to see its reference pages.");
  } catch (err) {
    referenceView.showMessage(err.message || "Could not load the reference PDF.");
  }
}

if (reviewId) {
  const hold = document.createElement("p");
  hold.className = "segment-note";
  hold.textContent = "Loading review…";
  form.append(hold);
  enterReview();
} else {
  const state = loadState();
  incidentCount = state.incidentCount;
  segments = buildSegments(incidentCount);
  renderForm(state.answers);
  saveState();
  updateIncidentButtons();
}

const pdfPanel = document.querySelector("#pdf-panel");
const pdfEmpty = document.querySelector("#pdf-empty");
const pdfViewer = document.querySelector("#pdf-viewer");
const pdfFrame = document.querySelector("#pdf-frame");
const pdfFilename = document.querySelector("#pdf-filename");
const pdfMessage = document.querySelector("#pdf-message");
const pdfOverlay = document.querySelector("#pdf-overlay");
const pdfInput = document.querySelector("#pdf-input");

let pdfUrl = "";

function isPdf(file) {
  if (!file) return false;
  if (file.type === "application/pdf") return true;
  return file.name.toLowerCase().endsWith(".pdf");
}

function showPdfMessage(text) {
  pdfMessage.hidden = false;
  pdfMessage.textContent = text;
}

function clearPdfMessage() {
  pdfMessage.hidden = true;
  pdfMessage.textContent = "";
}

function loadPdf(file) {
  if (!isPdf(file)) {
    showPdfMessage("Please choose a PDF file.");
    return;
  }

  const blob = file.type === "application/pdf"
    ? file
    : new File([file], file.name, { type: "application/pdf" });
  const nextUrl = URL.createObjectURL(blob);
  const previousUrl = pdfUrl;

  pdfUrl = nextUrl;
  pdfFrame.src = nextUrl;
  pdfFilename.textContent = file.name;
  pdfEmpty.hidden = true;
  pdfViewer.hidden = false;
  clearPdfMessage();

  if (previousUrl) URL.revokeObjectURL(previousUrl);
}

function removePdf() {
  if (pdfUrl) URL.revokeObjectURL(pdfUrl);
  pdfUrl = "";
  pdfFrame.src = "about:blank";
  pdfFilename.textContent = "";
  pdfViewer.hidden = true;
  pdfEmpty.hidden = false;
  clearPdfMessage();
}

function openPdfPicker() {
  pdfInput.click();
}

function draggingFiles(event) {
  const types = event.dataTransfer ? event.dataTransfer.types : [];
  return [...types].includes("Files");
}

function endFileDrag() {
  pdfPanel.classList.remove("is-dragover");
  pdfOverlay.hidden = true;
}

window.addEventListener("dragover", (event) => {
  event.preventDefault();
}, true);

window.addEventListener("drop", (event) => {
  event.preventDefault();
  endFileDrag();
});

window.addEventListener("dragenter", (event) => {
  if (!draggingFiles(event)) return;
  pdfOverlay.hidden = false;
});

window.addEventListener("dragleave", (event) => {
  const leftThePage = !event.relatedTarget
    && (event.target === document.documentElement || event.target === document.body);
  if (!leftThePage) return;
  endFileDrag();
});

pdfPanel.addEventListener("dragenter", (event) => {
  event.preventDefault();
  if (!draggingFiles(event)) return;
  pdfPanel.classList.add("is-dragover");
});

pdfPanel.addEventListener("dragover", (event) => {
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
});

pdfPanel.addEventListener("dragleave", (event) => {
  if (pdfPanel.contains(event.relatedTarget)) return;
  pdfPanel.classList.remove("is-dragover");
});

pdfPanel.addEventListener("drop", (event) => {
  event.preventDefault();
  endFileDrag();
  if (reviewId) return;
  const file = event.dataTransfer.files[0];
  if (!file) {
    showPdfMessage("Please choose a PDF file.");
    return;
  }
  loadPdf(file);
});

document.querySelector("#pdf-choose").addEventListener("click", openPdfPicker);
document.querySelector("#pdf-replace").addEventListener("click", openPdfPicker);
document.querySelector("#pdf-remove").addEventListener("click", removePdf);

pdfInput.addEventListener("change", () => {
  const file = pdfInput.files[0];
  pdfInput.value = "";
  if (file) loadPdf(file);
});
