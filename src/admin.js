// Password gate for the Drive submissions. The password stays in this tab.

import { driveConfigured, postToDrive } from "./drive.js";

const PASSWORD_KEY = "peerapp-admin-password";

const configNote = document.querySelector("#admin-config");
const loginForm = document.querySelector("#admin-login");
const passwordInput = document.querySelector("#admin-password");
const unlockButton = document.querySelector("#admin-unlock");
const loginMessage = document.querySelector("#admin-login-message");
const board = document.querySelector("#admin-board");
const boardMessage = document.querySelector("#admin-board-message");
const list = document.querySelector("#admin-list");
const detail = document.querySelector("#admin-detail");

let adminPassword = "";
let submissions = [];
let selectedId = "";

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
  const mrn = fieldValue(submission, ["mrn"], ["MRN #", "MRN"]);
  const patient = fieldValue(submission, [], ["Patient name"]);
  const provider = fieldValue(submission, ["providerName"], ["Provider Name"]);
  if (mrn) parts.push(`MRN ${mrn}`);
  if (patient) parts.push(patient);
  if (provider) parts.push(provider);
  return parts.join(" · ");
}

function renderList() {
  list.replaceChildren();
  if (submissions.length === 0) {
    const item = document.createElement("li");
    item.className = "admin-empty";
    item.textContent = "No submissions yet.";
    list.append(item);
    return;
  }

  for (const submission of submissions) {
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
    button.addEventListener("click", () => {
      selectedId = submission.id;
      renderList();
      renderDetail(submission);
    });
    item.append(button);
    list.append(item);
  }
}

function renderDetail(submission) {
  detail.replaceChildren();

  const heading = document.createElement("h2");
  heading.textContent = formatWhen(submission.submittedAt);
  detail.append(heading);

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
        fields.append(row);
      }
      block.append(fields);
      detail.append(block);
    }
  }

  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "button button-secondary";
  remove.textContent = "Delete";
  remove.addEventListener("click", () => deleteSubmission(submission));
  detail.append(remove);
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

async function loadSubmissions() {
  showMessage(boardMessage, "");
  const data = await postToDrive({ action: "list", password: adminPassword });
  submissions = Array.isArray(data.submissions) ? data.submissions : [];
  if (selectedId && !submissions.some((item) => item.id === selectedId)) {
    selectedId = "";
    resetDetail();
  }
  renderList();
  const selected = submissions.find((item) => item.id === selectedId);
  if (selected) renderDetail(selected);
}

async function unlock(password) {
  adminPassword = password;
  unlockButton.disabled = true;
  showMessage(loginMessage, "");
  try {
    await loadSubmissions();
    sessionStorage.setItem(PASSWORD_KEY, password);
    showBoard();
  } catch (err) {
    adminPassword = "";
    sessionStorage.removeItem(PASSWORD_KEY);
    showLogin();
    showMessage(loginMessage, err.message || "Could not unlock.", "error");
  } finally {
    unlockButton.disabled = false;
  }
}

function lock() {
  adminPassword = "";
  submissions = [];
  selectedId = "";
  sessionStorage.removeItem(PASSWORD_KEY);
  passwordInput.value = "";
  list.replaceChildren();
  resetDetail();
  showMessage(boardMessage, "");
  showLogin();
}

function authFailure(message) {
  return message === "Wrong password"
    || message === "Too many attempts, try again later"
    || message === "Admin password is not set";
}

async function deleteSubmission(submission) {
  const confirmed = window.confirm("Delete this submission? It will be moved to the trash in Google Drive.");
  if (!confirmed) return;

  showMessage(boardMessage, "");
  try {
    await postToDrive({ action: "delete", password: adminPassword, id: submission.id });
    submissions = submissions.filter((item) => item.id !== submission.id);
    if (selectedId === submission.id) {
      selectedId = "";
      resetDetail();
    }
    renderList();
  } catch (err) {
    const message = err.message || "Could not delete the submission.";
    if (authFailure(message)) {
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
      await loadSubmissions();
    } catch (err) {
      const message = err.message || "Could not refresh.";
      if (authFailure(message)) {
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

  const saved = sessionStorage.getItem(PASSWORD_KEY);
  if (saved) {
    passwordInput.value = saved;
    unlock(saved);
  }
}
