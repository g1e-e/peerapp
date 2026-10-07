// Peer review submissions, deployed as a web app.
//
// Deploy: Execute as Me, Who has access: Anyone.
// Project Settings > Script properties: add ADMIN_PASSWORD.
// Do not put the password in this file.
//
// The browser posts JSON with Content-Type text/plain so there is no
// CORS preflight. Each action is a field on that JSON body.

var FOLDER_NAME = "peerapp submissions";
var FOLDER_ID_KEY = "SUBMISSIONS_FOLDER_ID";
var PASSWORD_KEY = "ADMIN_PASSWORD";
var FAIL_KEY = "ADMIN_FAILS";
var LOCK_KEY = "ADMIN_LOCK_UNTIL";
var MAX_FAILS = 5;
var WINDOW_MS = 15 * 60 * 1000;

function doGet() {
  return jsonResponse({ ok: true });
}

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return jsonResponse({ ok: false, error: "Empty request." });
    }

    var body = JSON.parse(e.postData.contents);
    if (body.action === "submit") return jsonResponse(handleSubmit(body));
    if (body.action === "list") return jsonResponse(handleList(body));
    if (body.action === "delete") return jsonResponse(handleDelete(body));
    return jsonResponse({ ok: false, error: "Unknown action." });
  } catch (err) {
    return jsonResponse({ ok: false, error: "Could not complete the request." });
  }
}

function jsonResponse(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function handleSubmit(body) {
  if (!Array.isArray(body.answers)) {
    return { ok: false, error: "Missing answers." };
  }

  var submittedAt = new Date().toISOString();
  var record = {
    submittedAt: submittedAt,
    answers: body.answers,
  };
  var filename = submittedAt + " - MRN " + safeMrn(mrnFromAnswers(body.answers)) + ".json";
  var blob = Utilities.newBlob(JSON.stringify(record, null, 2), MimeType.JSON, filename);
  var file = getFolder().createFile(blob);
  return { ok: true, id: file.getId() };
}

function handleList(body) {
  var auth = authorize(body.password);
  if (!auth.ok) return auth;

  var files = getFolder().getFiles();
  var submissions = [];
  while (files.hasNext()) {
    var file = files.next();
    if (file.getName().slice(-5).toLowerCase() !== ".json") continue;
    submissions.push(readSubmission(file));
  }

  submissions.sort(function (a, b) {
    return String(b.submittedAt).localeCompare(String(a.submittedAt));
  });
  return { ok: true, submissions: submissions };
}

function handleDelete(body) {
  var auth = authorize(body.password);
  if (!auth.ok) return auth;
  if (!body.id) return { ok: false, error: "Missing file id." };

  var folder = getFolder();
  var file;
  try {
    file = DriveApp.getFileById(body.id);
  } catch (err) {
    return { ok: false, error: "File not found." };
  }
  if (!fileInFolder(file, folder)) {
    return { ok: false, error: "File not found." };
  }

  file.setTrashed(true);
  return { ok: true };
}

function readSubmission(file) {
  var submittedAt = fileCreatedAt(file);
  var answers = null;
  try {
    var data = JSON.parse(file.getBlob().getDataAsString());
    if (data && data.submittedAt) submittedAt = data.submittedAt;
    if (data && data.answers) answers = data.answers;
  } catch (err) {
    answers = null;
  }
  return {
    id: file.getId(),
    name: file.getName(),
    submittedAt: submittedAt,
    answers: answers,
  };
}

// Global failed-attempt counter. Five wrong passwords in 15 minutes
// locks list and delete for the next 15 minutes.
function authorize(password) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (err) {
    return { ok: false, error: "Try again in a moment." };
  }
  try {
    return checkPassword(password);
  } finally {
    lock.releaseLock();
  }
}

function checkPassword(password) {
  var props = PropertiesService.getScriptProperties();
  var now = Date.now();
  var lockUntil = Number(props.getProperty(LOCK_KEY) || "0");
  if (lockUntil > now) {
    return { ok: false, error: "Too many attempts, try again later" };
  }

  var expected = props.getProperty(PASSWORD_KEY);
  if (!expected) {
    return { ok: false, error: "Admin password is not set" };
  }

  if (String(password || "") === String(expected)) {
    props.deleteProperty(FAIL_KEY);
    props.deleteProperty(LOCK_KEY);
    return { ok: true };
  }

  var fails = [];
  try {
    fails = JSON.parse(props.getProperty(FAIL_KEY) || "[]");
  } catch (err) {
    fails = [];
  }
  if (!Array.isArray(fails)) fails = [];

  fails = fails.filter(function (time) {
    return now - Number(time) < WINDOW_MS;
  });
  fails.push(now);

  if (fails.length >= MAX_FAILS) {
    props.setProperty(LOCK_KEY, String(now + WINDOW_MS));
    props.deleteProperty(FAIL_KEY);
    return { ok: false, error: "Too many attempts, try again later" };
  }

  props.setProperty(FAIL_KEY, JSON.stringify(fails));
  return { ok: false, error: "Wrong password" };
}

function getFolder() {
  var props = PropertiesService.getScriptProperties();
  var cachedId = props.getProperty(FOLDER_ID_KEY);
  if (cachedId) {
    try {
      var cached = DriveApp.getFolderById(cachedId);
      if (!cached.isTrashed()) return cached;
    } catch (err) {
      // The saved folder is gone. Find or create it below.
    }
  }

  var found = DriveApp.getFoldersByName(FOLDER_NAME);
  var folder = found.hasNext() ? found.next() : DriveApp.createFolder(FOLDER_NAME);
  if (folder.isTrashed()) folder = DriveApp.createFolder(FOLDER_NAME);
  props.setProperty(FOLDER_ID_KEY, folder.getId());
  return folder;
}

function fileCreatedAt(file) {
  try {
    return file.getDateCreated().toISOString();
  } catch (err) {
    return "";
  }
}

function fileInFolder(file, folder) {
  var parents = file.getParents();
  var folderId = folder.getId();
  while (parents.hasNext()) {
    if (parents.next().getId() === folderId) return true;
  }
  return false;
}

function mrnFromAnswers(answers) {
  return answerValue(answers, ["mrn"], ["MRN #", "MRN"]);
}

function answerValue(answers, ids, labels) {
  if (!answers || !answers.length) return "";
  for (var s = 0; s < answers.length; s++) {
    var fields = answers[s].fields || [];
    for (var f = 0; f < fields.length; f++) {
      var field = fields[f];
      var value = field.value == null ? "" : String(field.value).trim();
      if (!value) continue;
      if (ids.indexOf(field.id) !== -1 || labels.indexOf(field.label) !== -1) return value;
    }
  }
  return "";
}

function safeMrn(value) {
  var text = String(value || "").replace(/[\r\n\t]/g, " ").trim();
  if (!text) return "none";
  text = text.replace(/[\\/:*?"<>|]/g, "-");
  if (text.length > 80) text = text.slice(0, 80).trim();
  return text || "none";
}
