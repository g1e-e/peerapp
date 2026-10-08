import { driveConfigured, postToDrive } from "./drive.js";
import { buildSubmissionPdf, submissionPdfName } from "./submission-pdf.js";
import { formatProcedureLine } from "./procedure-times.js";
import { mountPrep } from "./prep.js";

const TOKEN_KEY = "peerapp-admin-token";
const OLD_PASSWORD_KEY = "peerapp-admin-password";

const configNote = document.querySelector("#admin-config");
const loginForm = document.querySelector("#admin-login");
const passwordInput = document.querySelector("#admin-password");
const unlockButton = document.querySelector("#admin-unlock");
const loginMessage = document.querySelector("#admin-login-message");
const board = document.querySelector("#admin-board");
const boardMessage = document.querySelector("#admin-board-message");
const list = document.querySelector("#admin-list");
const detail = document.querySelector("#admin-detail");
const reviewsPanel = document.querySelector("#reviews-panel");
const submissionsPanel = document.querySelector("#submissions-panel");
const submissionFilter = document.querySelector("#submission-filter");

let adminToken = "";
let submissions = [];
let selectedId = "";
let submissionFilterValue = "all";
let prep = null;

function showMessage(element, text, tone) {
  element.hidden = !text;
  element.textContent = text || "";
  element.className = `submit-status${tone ? ` ${tone}` : ""}`;
}

function fieldValue(submission, ids, labels) {
  const sections = Array.isArray(submission.answers) ? submission.answers : [];
  for (const section of sections) {
    for (const field of section.fields || []) {
      const value = field.value == null ? "" : String(field.value).trim();
      if (!value) continue;
      if (ids.includes(field.id) || labels.includes(field.label)) return value;
    }
  }
  return "";
}

function formatWhen(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso || "Unknown time";
  return date.toLocaleString();
}

function preview(submission) {
  const parts = [];
  const mrn = submission.mrn || fieldValue(submission, ["mrn"], ["MRN #", "MRN"]);
  const patient = submission.patientName || fieldValue(submission, [], ["Patient name"]);
  const provider = submission.provider || fieldValue(submission, ["providerName"], ["Provider Name"]);
  if (mrn) parts.push(`MRN ${mrn}`);
  if (patient) parts.push(patient);
  if (provider) parts.push(provider);
  return parts.join(" · ");
}

function visibleSubmissions() {
  if (submissionFilterValue === "all") return submissions;
  if (submissionFilterValue === "none") return submissions.filter((item) => !item.reviewId);
  return submissions.filter((item) => item.reviewId === submissionFilterValue);
}

function renderList() {
  list.replaceChildren();
  const visible = visibleSubmissions();
  if (visible.length === 0) {
    const item = document.createElement("li");
    item.className = "admin-empty";
    item.textContent = "No submissions to show.";
    list.append(item);
    return;
  }

  for (const submission of visible) {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "admin-item";
    if (submission.id === selectedId) button.classList.add("is-selected");

    const when = document.createElement("span");
    when.className = "admin-when";
    when.textContent = formatWhen(submission.submittedAt);

    const who = document.createElement("span");
    who.className = "admin-who";
    who.textContent = preview(submission) || submission.name;

    button.append(when, who);
    button.addEventListener("click", () => openSubmission(submission));
    item.append(button);
    list.append(item);
  }
}

function renderDetail(submission) {
  detail.replaceChildren();

  const heading = document.createElement("h2");
  heading.textContent = formatWhen(submission.submittedAt);
  detail.append(heading);
  if (submission.reviewName) {
    const reviewLine = document.createElement("p");
    reviewLine.className = "admin-who";
    reviewLine.textContent = submission.reviewName;
    detail.append(reviewLine);
  }

  const sections = Array.isArray(submission.answers) ? submission.answers : null;
  if (!sections) {
    const empty = document.createElement("p");
    empty.textContent = "This file has no readable answers.";
    detail.append(empty);
  } else {
    for (const section of sections) {
      const block = document.createElement("section");
      block.className = "segment";

      const title = document.createElement("h2");
      title.textContent = section.title || "Section";
      block.append(title);

      const fields = document.createElement("div");
      fields.className = "admin-fields";
      for (const field of section.fields || []) {
        const row = document.createElement("div");
        const label = document.createElement("dt");
        label.textContent = field.label || field.id || "Field";
        const value = document.createElement("dd");
        const text = field.value == null ? "" : String(field.value).trim();
        value.textContent = text || "(blank)";
        row.append(label, value);
        const procedureLine = formatProcedureLine(field.procedureTimes);
        if (procedureLine) {
          const times = document.createElement("p");
          times.className = "procedure-times";
          times.textContent = procedureLine;
          row.append(times);
        }
        fields.append(row);
      }
      block.append(fields);
      detail.append(block);
    }
  }

  const actions = document.createElement("div");
  actions.className = "actions";
  const download = document.createElement("button");
  download.type = "button";
  download.className = "button button-primary";
  download.textContent = "Download PDF";
  download.addEventListener("click", () => downloadPdf(submission, download));
  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "button button-secondary";
  remove.textContent = "Delete";
  remove.addEventListener("click", () => deleteSubmission(submission));
  actions.append(download, remove);
  detail.append(actions);
}

async function downloadPdf(submission, button) {
  const original = button.textContent;
  button.disabled = true;
  button.textContent = "Preparing PDF…";
  try {
    const bytes = await buildSubmissionPdf(submission);
    const blob = new Blob([bytes], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = submissionPdfName(submission);
    link.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    showMessage(boardMessage, err.message || "Could not build the PDF.", "error");
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
}

function resetDetail() {
  detail.replaceChildren();
  const placeholder = document.createElement("p");
  placeholder.className = "admin-placeholder";
  placeholder.textContent = "Select a submission.";
  detail.append(placeholder);
}

function showLogin() {
  board.hidden = true;
  loginForm.hidden = false;
}

function showBoard() {
  loginForm.hidden = true;
  board.hidden = false;
  showMessage(loginMessage, "");
}

function showTab(name) {
  const reviews = name === "reviews";
  reviewsPanel.hidden = !reviews;
  submissionsPanel.hidden = reviews;
  document.querySelector("#tab-reviews").classList.toggle("is-selected", reviews);
  document.querySelector("#tab-submissions").classList.toggle("is-selected", !reviews);
}

function fillReviewFilter(reviews) {
  const current = submissionFilterValue;
  submissionFilter.replaceChildren();
  const all = document.createElement("option");
  all.value = "all";
  all.textContent = "All submissions";
  const none = document.createElement("option");
  none.value = "none";
  none.textContent = "No review";
  submissionFilter.append(all, none);
  for (const review of reviews) {
    const option = document.createElement("option");
    option.value = review.id;
    option.textContent = review.name || review.id;
    submissionFilter.append(option);
  }
  const stillThere = [...submissionFilter.options].some((option) => option.value === current);
  submissionFilter.value = stillThere ? current : "all";
  submissionFilterValue = submissionFilter.value;
}

function applyDashboard(data) {
  submissions = Array.isArray(data.submissions) ? data.submissions : [];
  prep.setReviews(Array.isArray(data.reviews) ? data.reviews : []);
  if (selectedId && !submissions.some((item) => item.id === selectedId)) {
    selectedId = "";
    resetDetail();
  }
  renderList();
}

async function loadDashboard() {
  showMessage(boardMessage, "");
  const data = await postToDrive({ action: "dashboard", token: adminToken });
  applyDashboard(data);
}

async function openSubmission(summary) {
  selectedId = summary.id;
  renderList();
  detail.replaceChildren();
  const loading = document.createElement("p");
  loading.className = "admin-placeholder";
  loading.textContent = "Loading submission…";
  detail.append(loading);
  try {
    const data = await postToDrive({
      action: "getSubmission",
      token: adminToken,
      id: summary.id,
    });
    if (selectedId !== summary.id) return;
    renderDetail(data.submission);
  } catch (err) {
    if (isAuthFailure(err.message)) {
      lock();
      showMessage(loginMessage, err.message, "error");
      return;
    }
    detail.replaceChildren();
    const note = document.createElement("p");
    note.className = "submit-status error";
    note.textContent = err.message || "Could not open that submission.";
    detail.append(note);
  }
}

async function unlock(password) {
  unlockButton.disabled = true;
  showMessage(loginMessage, "");
  try {
    const data = await postToDrive({ action: "unlock", password });
    adminToken = data.token || "";
    if (adminToken.length < 32) throw new Error("Could not unlock.");
    sessionStorage.setItem(TOKEN_KEY, adminToken);
    passwordInput.value = "";
    await loadDashboard();
    showBoard();
    showTab("reviews");
  } catch (err) {
    adminToken = "";
    sessionStorage.removeItem(TOKEN_KEY);
    showLogin();
    showMessage(loginMessage, err.message || "Could not unlock.", "error");
  } finally {
    unlockButton.disabled = false;
  }
}

function lock() {
  const token = adminToken;
  adminToken = "";
  submissions = [];
  selectedId = "";
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(OLD_PASSWORD_KEY);
  passwordInput.value = "";
  list.replaceChildren();
  resetDetail();
  showMessage(boardMessage, "");
  showLogin();
  if (token) {
    postToDrive({ action: "lock", token }).catch(() => {});
  }
}

function isAuthFailure(message) {
  return message === "Wrong password"
    || message === "Too many attempts, try again later"
    || message === "Admin password is not set"
    || message === "Admin session expired. Unlock again.";
}

async function deleteSubmission(submission) {
  const confirmed = window.confirm("Delete this submission? It will be moved to the trash in Google Drive.");
  if (!confirmed) return;

  showMessage(boardMessage, "");
  try {
    await postToDrive({ action: "delete", token: adminToken, id: submission.id });
    submissions = submissions.filter((item) => item.id !== submission.id);
    if (selectedId === submission.id) {
      selectedId = "";
      resetDetail();
    }
    renderList();
  } catch (err) {
    const message = err.message || "Could not delete the submission.";
    if (isAuthFailure(message)) {
      lock();
      showMessage(loginMessage, message, "error");
      return;
    }
    showMessage(boardMessage, message, "error");
  }
}

if (!driveConfigured()) {
  configNote.hidden = false;
  loginForm.hidden = true;
} else {
  loginForm.addEventListener("submit", (event) => {
    event.preventDefault();
    unlock(passwordInput.value);
  });

  document.querySelector("#admin-refresh").addEventListener("click", async () => {
    const button = document.querySelector("#admin-refresh");
    button.disabled = true;
    try {
      await loadDashboard();
    } catch (err) {
      const message = err.message || "Could not refresh.";
      if (isAuthFailure(message)) {
        lock();
        showMessage(loginMessage, message, "error");
        return;
      }
      showMessage(boardMessage, message, "error");
    } finally {
      button.disabled = false;
    }
  });

  document.querySelector("#admin-lock").addEventListener("click", lock);

  document.querySelector("#tab-reviews").addEventListener("click", () => showTab("reviews"));
  document.querySelector("#tab-submissions").addEventListener("click", () => showTab("submissions"));
  submissionFilter.addEventListener("change", () => {
    submissionFilterValue = submissionFilter.value;
    selectedId = "";
    resetDetail();
    renderList();
  });

  prep = mountPrep(reviewsPanel, {
    getToken: () => adminToken,
    isAuthFailure,
    onAuthFailure(message) {
      lock();
      showMessage(loginMessage, message, "error");
    },
    onReviews: fillReviewFilter,
  });

  sessionStorage.removeItem(OLD_PASSWORD_KEY);
  const saved = sessionStorage.getItem(TOKEN_KEY);
  if (saved && saved.length >= 32) {
    adminToken = saved;
    loadDashboard().then(() => {
      showBoard();
      showTab("reviews");
    }).catch((err) => {
      lock();
      showMessage(loginMessage, err.message || "Admin session expired. Unlock again.", "error");
    });
  }
}
