// Draws the form from src/questions.js, saves answers in this browser,
// and shows a summary when the reviewer clicks Submit.

import { segments } from "./questions.js";

const STORAGE_KEY = "peer-review-answers";

const form = document.querySelector("#review-form");
const summary = document.querySelector("#summary");
const clearButton = document.querySelector("#clear-button");

// question id -> the input, textarea, select, or rating group
const controls = new Map();

function loadAnswers() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return {};
    const parsed = JSON.parse(saved);
    if (!parsed || typeof parsed !== "object") return {};
    return parsed;
  } catch {
    return {};
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

function saveAnswers() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(collectAnswers()));
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

  for (const question of segment.questions) {
    const value = answers[question.id] ?? "";
    section.append(renderQuestion(question, value));
  }

  return section;
}

function renderQuestion(question, value) {
  switch (question.type) {
    case "textarea":
      return renderTextarea(question, value);
    case "select":
      return renderSelect(question, value);
    case "rating":
      return renderRating(question, value);
    case "yesNoNa":
    case "radio":
      return renderRadio(question, value);
    case "date":
      return renderTextLike(question, value, "date");
    default:
      return renderTextLike(question, value, "text");
  }
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

function onSubmit(event) {
  event.preventDefault();
  const answers = collectAnswers();
  saveAnswers();
  showSummary(answers);
}

function onClear() {
  const confirmed = window.confirm(
    "Clear every answer? This removes the copy saved in this browser."
  );
  if (!confirmed) return;

  localStorage.removeItem(STORAGE_KEY);
  renderForm({});
  summary.hidden = true;
  summary.replaceChildren();
}

renderForm(loadAnswers());

form.addEventListener("input", saveAnswers);
form.addEventListener("change", saveAnswers);
form.addEventListener("submit", onSubmit);
clearButton.addEventListener("click", onClear);

// Reference PDF. The file is shown with the browser's own viewer.
// It stays in this tab only: nothing is uploaded, and a reload clears it.

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

// Keep a dropped file from opening as a new page, anywhere on this page.
window.addEventListener("dragover", (event) => {
  event.preventDefault();
}, true);

window.addEventListener("drop", (event) => {
  event.preventDefault();
  endFileDrag();
});

window.addEventListener("dragenter", (event) => {
  if (!draggingFiles(event)) return;
  // Cover the viewer so the drop lands on this page, not inside the PDF frame.
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
  // Moving between pieces of the panel still counts as inside it.
  if (pdfPanel.contains(event.relatedTarget)) return;
  pdfPanel.classList.remove("is-dragover");
});

pdfPanel.addEventListener("drop", (event) => {
  event.preventDefault();
  endFileDrag();
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
