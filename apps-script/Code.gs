// Peer review web app.
//
// Deploy: Execute as Me, Who has access: Anyone.
// Project Settings > Script properties: add ADMIN_PASSWORD.
// Do not put the password in this file.
//
// The browser posts JSON with Content-Type text/plain so there is no
// CORS preflight. Drive files stay in this account. Callers only receive
// what these actions return.
//
// Folders created on first use:
//   peerapp submissions  — answer files (a subfolder per review id)
//   peerapp reviews      — review config JSON and the reference PDFs
//   peerapp tmp          — upload pieces, deleted when the PDF is assembled

var FOLDER_NAME = "peerapp submissions";
var REVIEWS_FOLDER_NAME = "peerapp reviews";
var TMP_FOLDER_NAME = "peerapp tmp";
var FOLDER_ID_KEY = "SUBMISSIONS_FOLDER_ID";
var REVIEWS_FOLDER_ID_KEY = "REVIEWS_FOLDER_ID";
var TMP_FOLDER_ID_KEY = "TMP_FOLDER_ID";
var PASSWORD_KEY = "ADMIN_PASSWORD";
var FAIL_KEY = "ADMIN_FAILS";
var LOCK_KEY = "ADMIN_LOCK_UNTIL";
var MAX_FAILS = 5;
var WINDOW_MS = 15 * 60 * 1000;
var CHUNK_BYTES = 5 * 1024 * 1024;
var MAX_PDF_BYTES = 45 * 1024 * 1024;
var MAX_PAGES_PER_QUESTION = 50;

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
    if (body.action === "getReview") return jsonResponse(handleGetReview(body));
    if (body.action === "getPdfChunk") return jsonResponse(handleGetPdfChunk(body));

    if (isAdminAction(body.action)) {
      var auth = authorize(body.password);
      if (!auth.ok) return jsonResponse(auth);
      if (body.action === "list") return jsonResponse(handleList());
      if (body.action === "delete") return jsonResponse(handleDelete(body));
      if (body.action === "uploadStart") return jsonResponse(handleUploadStart(body));
      if (body.action === "uploadChunk") return jsonResponse(handleUploadChunk(body));
      if (body.action === "uploadFinish") return jsonResponse(handleUploadFinish(body));
      if (body.action === "saveReview") return jsonResponse(handleSaveReview(body));
      if (body.action === "listReviews") return jsonResponse(handleListReviews());
      if (body.action === "deleteReview") return jsonResponse(handleDeleteReview(body));
    }

    return jsonResponse({ ok: false, error: "Unknown action." });
  } catch (err) {
    return jsonResponse({ ok: false, error: "Could not complete the request." });
  }
}

function isAdminAction(action) {
  return action === "list" || action === "delete"
    || action === "uploadStart" || action === "uploadChunk" || action === "uploadFinish"
    || action === "saveReview" || action === "listReviews" || action === "deleteReview";
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

  var review = null;
  if (body.reviewId) {
    review = loadReview(body.reviewId);
    if (!review) return { ok: false, error: "Review not found." };
  }

  var submittedAt = new Date().toISOString();
  var record = {
    submittedAt: submittedAt,
    reviewId: review ? review.id : "",
    reviewName: review ? review.name : "",
    answers: body.answers,
  };
  var filename = submittedAt + " - MRN " + safeMrn(mrnFromAnswers(body.answers)) + ".json";
  var folder = review ? reviewSubmissionsFolder(review.id, true) : getFolder();
  var blob = Utilities.newBlob(JSON.stringify(record, null, 2), MimeType.JSON, filename);
  var file = folder.createFile(blob);
  return { ok: true, id: file.getId() };
}

function handleGetReview(body) {
  var review = loadReview(body.reviewId);
  if (!review) return { ok: false, error: "Review not found." };
  return { ok: true, review: publicReview(review) };
}

function handleGetPdfChunk(body) {
  var review = loadReview(body.reviewId);
  if (!review) return { ok: false, error: "Review not found." };

  var file;
  try {
    file = DriveApp.getFileById(review.pdfFileId);
  } catch (err) {
    return { ok: false, error: "The reference PDF is missing." };
  }

  var bytes = file.getBlob().getBytes();
  var total = Math.max(1, Math.ceil(bytes.length / CHUNK_BYTES));
  var index = Number(body.index);
  if (!isFinite(index)) index = 0;
  index = Math.floor(index);
  if (index < 0 || index >= total) {
    return { ok: false, error: "That part of the PDF does not exist." };
  }

  var start = index * CHUNK_BYTES;
  var end = Math.min(bytes.length, start + CHUNK_BYTES);
  var slice = sliceBytes(bytes, start, end);
  return {
    ok: true,
    index: index,
    total: total,
    data: Utilities.base64Encode(slice),
  };
}

function handleList() {
  var submissions = [];
  eachSubmissionFile(function (file) {
    submissions.push(readSubmission(file));
  });
  submissions.sort(function (a, b) {
    return String(b.submittedAt).localeCompare(String(a.submittedAt));
  });
  return { ok: true, submissions: submissions };
}

function handleDelete(body) {
  if (!body.id) return { ok: false, error: "Missing file id." };

  var file;
  try {
    file = DriveApp.getFileById(body.id);
  } catch (err) {
    return { ok: false, error: "File not found." };
  }
  if (!fileInSubmissions(file)) return { ok: false, error: "File not found." };

  file.setTrashed(true);
  return { ok: true };
}

function handleUploadStart(body) {
  var size = Number(body.size);
  var chunkCount = Number(body.chunkCount);
  if (!isFinite(size) || size <= 0) return { ok: false, error: "Missing PDF size." };
  if (size > MAX_PDF_BYTES) {
    return { ok: false, error: "This PDF is over 45 MB. Compress it and try again." };
  }
  chunkCount = Math.floor(chunkCount);
  if (chunkCount < 1 || chunkCount > 20) {
    return { ok: false, error: "Could not split that PDF." };
  }

  cleanupOldTempFiles();
  var uploadId = Utilities.getUuid();
  var meta = {
    uploadId: uploadId,
    name: String(body.name || "reference.pdf"),
    size: size,
    chunkCount: chunkCount,
    createdAt: new Date().toISOString(),
  };
  writeTempJson(uploadId, meta);
  return { ok: true, uploadId: uploadId };
}

function handleUploadChunk(body) {
  var meta = readTempJson(body.uploadId);
  if (!meta) return { ok: false, error: "That upload has expired. Start again." };

  var index = Number(body.index);
  if (!isFinite(index) || index < 0 || index >= meta.chunkCount) {
    return { ok: false, error: "Unexpected PDF piece." };
  }
  if (!body.data) return { ok: false, error: "Missing PDF piece." };

  var bytes;
  try {
    bytes = Utilities.base64Decode(body.data);
  } catch (err) {
    return { ok: false, error: "Could not read a PDF piece." };
  }

  var name = partName(body.uploadId, index);
  var folder = getTmpFolder();
  trashNamed(folder, name);
  folder.createFile(Utilities.newBlob(bytes, "application/octet-stream", name));
  return { ok: true };
}

function handleUploadFinish(body) {
  var meta = readTempJson(body.uploadId);
  if (!meta) return { ok: false, error: "That upload has expired. Start again." };

  var folder = getTmpFolder();
  var parts = [];
  var total = 0;
  for (var index = 0; index < meta.chunkCount; index++) {
    var files = folder.getFilesByName(partName(body.uploadId, index));
    if (!files.hasNext()) {
      return { ok: false, error: "Upload is missing a piece. Try again." };
    }
    var bytes = files.next().getBlob().getBytes();
    parts.push(bytes);
    total += bytes.length;
  }
  if (total !== meta.size) {
    return { ok: false, error: "The PDF arrived incomplete. Try again." };
  }
  if (total > MAX_PDF_BYTES) {
    return { ok: false, error: "This PDF is over 45 MB. Compress it and try again." };
  }

  var merged = mergeBytes(parts);
  var pdfName = body.uploadId + ".pdf";
  var reviews = getReviewsFolder();
  var pdf = reviews.createFile(Utilities.newBlob(merged, MimeType.PDF, pdfName));

  trashNamed(folder, body.uploadId + ".json");
  for (var done = 0; done < meta.chunkCount; done++) {
    trashNamed(folder, partName(body.uploadId, done));
  }
  return { ok: true, pdfFileId: pdf.getId() };
}

function handleSaveReview(body) {
  var review = body.review;
  if (!review || !validReviewId(review.id)) {
    return { ok: false, error: "Review id is not valid." };
  }
  var name = String(review.name || "").trim();
  if (!name) return { ok: false, error: "Give the review a name." };
  if (!review.pdfFileId) return { ok: false, error: "Upload a PDF first." };

  var incidentCount = clampCount(review.incidentCount);
  if (incidentCount === null) {
    return { ok: false, error: "Number of incidents must be from 0 to 10." };
  }

  var pageCount = Number(review.pageCount);
  if (!isFinite(pageCount) || pageCount < 1) {
    return { ok: false, error: "The PDF has no pages." };
  }
  pageCount = Math.floor(pageCount);

  var folder = getReviewsFolder();
  var pdf;
  try {
    pdf = DriveApp.getFileById(review.pdfFileId);
  } catch (err) {
    return { ok: false, error: "PDF not found." };
  }
  if (!fileInFolder(pdf, folder)) return { ok: false, error: "PDF not found." };

  var pages = sanitizePages(review.pages, pageCount);
  if (pages.error) return { ok: false, error: pages.error };

  var existing = loadReview(review.id);
  var record = {
    id: review.id,
    name: name,
    createdAt: existing && existing.createdAt ? existing.createdAt : new Date().toISOString(),
    pdfFileId: review.pdfFileId,
    pageCount: pageCount,
    incidentCount: incidentCount,
    pages: pages.value,
  };

  trashNamed(folder, review.id + ".json");
  folder.createFile(Utilities.newBlob(JSON.stringify(record, null, 2), MimeType.JSON, review.id + ".json"));
  if (existing && existing.pdfFileId && existing.pdfFileId !== review.pdfFileId) {
    trashFileById(existing.pdfFileId);
  }
  return { ok: true, review: record };
}

function handleListReviews() {
  var folder = getReviewsFolder();
  var files = folder.getFiles();
  var reviews = [];
  while (files.hasNext()) {
    var file = files.next();
    if (!isJsonName(file.getName())) continue;
    try {
      var review = JSON.parse(file.getBlob().getDataAsString());
      if (!review || !review.id) continue;
      review.submissionCount = countSubmissions(review.id);
      reviews.push(review);
    } catch (err) {
      // Skip a file that is not a review.
    }
  }
  reviews.sort(function (a, b) {
    return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
  });
  return { ok: true, reviews: reviews };
}

function handleDeleteReview(body) {
  var review = loadReview(body.reviewId);
  if (!review) return { ok: false, error: "Review not found." };

  trashNamed(getReviewsFolder(), review.id + ".json");
  trashFileById(review.pdfFileId);
  var subs = getFolder().getFoldersByName(review.id);
  if (subs.hasNext()) subs.next().setTrashed(true);
  return { ok: true };
}

function publicReview(review) {
  return {
    id: review.id,
    name: review.name,
    createdAt: review.createdAt,
    pageCount: review.pageCount,
    incidentCount: clampCount(review.incidentCount) || 0,
    pages: review.pages || {},
  };
}

function loadReview(id) {
  if (!validReviewId(id)) return null;
  var files = getReviewsFolder().getFilesByName(id + ".json");
  if (!files.hasNext()) return null;
  try {
    var review = JSON.parse(files.next().getBlob().getDataAsString());
    if (!review || review.id !== id) return null;
    return review;
  } catch (err) {
    return null;
  }
}

function validReviewId(id) {
  return typeof id === "string" && /^[A-Za-z0-9_-]{24,80}$/.test(id);
}

function clampCount(value) {
  var number = Number(value);
  if (!isFinite(number)) return null;
  number = Math.floor(number);
  if (number < 0 || number > 10) return null;
  return number;
}

function sanitizePages(pages, pageCount) {
  var clean = {};
  if (!pages || typeof pages !== "object") return { value: clean };
  var ids = Object.keys(pages);
  for (var i = 0; i < ids.length; i++) {
    var list = pages[ids[i]];
    if (!list || !list.length) continue;
    var seen = {};
    var kept = [];
    for (var p = 0; p < list.length; p++) {
      var page = Number(list[p]);
      if (!isFinite(page) || Math.floor(page) !== page || page < 1 || page > pageCount) {
        return { error: "A page assignment is outside the PDF." };
      }
      if (!seen[page]) {
        seen[page] = true;
        kept.push(page);
      }
    }
    if (kept.length > MAX_PAGES_PER_QUESTION) {
      return { error: "A question can have at most 50 pages." };
    }
    kept.sort(function (a, b) { return a - b; });
    clean[ids[i]] = kept;
  }
  return { value: clean };
}

function readSubmission(file) {
  var submittedAt = fileCreatedAt(file);
  var answers = null;
  var reviewId = "";
  var reviewName = "";
  try {
    var data = JSON.parse(file.getBlob().getDataAsString());
    if (data && data.submittedAt) submittedAt = data.submittedAt;
    if (data && data.answers) answers = data.answers;
    if (data && data.reviewId) reviewId = data.reviewId;
    if (data && data.reviewName) reviewName = data.reviewName;
  } catch (err) {
    answers = null;
  }
  return {
    id: file.getId(),
    name: file.getName(),
    submittedAt: submittedAt,
    reviewId: reviewId,
    reviewName: reviewName,
    answers: answers,
  };
}

function eachSubmissionFile(visitor) {
  var parent = getFolder();
  var files = parent.getFiles();
  while (files.hasNext()) {
    var file = files.next();
    if (isJsonName(file.getName())) visitor(file);
  }
  var folders = parent.getFolders();
  while (folders.hasNext()) {
    var nested = folders.next().getFiles();
    while (nested.hasNext()) {
      var child = nested.next();
      if (isJsonName(child.getName())) visitor(child);
    }
  }
}

function countSubmissions(reviewId) {
  var folders = getFolder().getFoldersByName(reviewId);
  if (!folders.hasNext()) return 0;
  var count = 0;
  var files = folders.next().getFiles();
  while (files.hasNext()) {
    if (isJsonName(files.next().getName())) count++;
  }
  return count;
}

function reviewSubmissionsFolder(reviewId, create) {
  var parent = getFolder();
  var found = parent.getFoldersByName(reviewId);
  if (found.hasNext()) return found.next();
  if (!create) return null;
  return parent.createFolder(reviewId);
}

function fileInSubmissions(file) {
  var rootId = getFolder().getId();
  var parents = file.getParents();
  while (parents.hasNext()) {
    var folder = parents.next();
    if (folder.getId() === rootId) return true;
    var grandparents = folder.getParents();
    while (grandparents.hasNext()) {
      if (grandparents.next().getId() === rootId) return true;
    }
  }
  return false;
}

// Global failed-attempt counter. Five wrong passwords in 15 minutes
// locks admin actions for the next 15 minutes.
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
  return getNamedFolder(FOLDER_NAME, FOLDER_ID_KEY);
}

function getReviewsFolder() {
  return getNamedFolder(REVIEWS_FOLDER_NAME, REVIEWS_FOLDER_ID_KEY);
}

function getTmpFolder() {
  return getNamedFolder(TMP_FOLDER_NAME, TMP_FOLDER_ID_KEY);
}

function getNamedFolder(name, propKey) {
  var props = PropertiesService.getScriptProperties();
  var cachedId = props.getProperty(propKey);
  if (cachedId) {
    try {
      var cached = DriveApp.getFolderById(cachedId);
      if (!cached.isTrashed()) return cached;
    } catch (err) {
      // The saved folder is gone. Find or create it below.
    }
  }

  var found = DriveApp.getFoldersByName(name);
  var folder = found.hasNext() ? found.next() : DriveApp.createFolder(name);
  if (folder.isTrashed()) folder = DriveApp.createFolder(name);
  props.setProperty(propKey, folder.getId());
  return folder;
}

function fileInFolder(file, folder) {
  var parents = file.getParents();
  var folderId = folder.getId();
  while (parents.hasNext()) {
    if (parents.next().getId() === folderId) return true;
  }
  return false;
}

function writeTempJson(uploadId, meta) {
  var folder = getTmpFolder();
  var name = uploadId + ".json";
  trashNamed(folder, name);
  folder.createFile(Utilities.newBlob(JSON.stringify(meta), MimeType.JSON, name));
}

function readTempJson(uploadId) {
  if (!uploadId) return null;
  var files = getTmpFolder().getFilesByName(uploadId + ".json");
  if (!files.hasNext()) return null;
  try {
    return JSON.parse(files.next().getBlob().getDataAsString());
  } catch (err) {
    return null;
  }
}

function partName(uploadId, index) {
  return uploadId + "." + index + ".part";
}

function trashNamed(folder, name) {
  var files = folder.getFilesByName(name);
  while (files.hasNext()) files.next().setTrashed(true);
}

function trashFileById(id) {
  if (!id) return;
  try {
    DriveApp.getFileById(id).setTrashed(true);
  } catch (err) {
    // Already gone.
  }
}

function cleanupOldTempFiles() {
  var folder = getTmpFolder();
  var cutoff = Date.now() - 24 * 60 * 60 * 1000;
  var files = folder.getFiles();
  while (files.hasNext()) {
    var file = files.next();
    if (file.getDateCreated().getTime() < cutoff) file.setTrashed(true);
  }
}

function sliceBytes(bytes, start, end) {
  if (bytes.slice) return bytes.slice(start, end);
  var out = [];
  for (var i = start; i < end; i++) out.push(bytes[i]);
  return out;
}

function mergeBytes(parts) {
  var total = 0;
  for (var i = 0; i < parts.length; i++) total += parts[i].length;
  var out = [];
  out.length = total;
  var offset = 0;
  for (var p = 0; p < parts.length; p++) {
    var part = parts[p];
    for (var j = 0; j < part.length; j++) out[offset++] = part[j];
  }
  return out;
}

function isJsonName(name) {
  return String(name || "").slice(-5).toLowerCase() === ".json";
}

function fileCreatedAt(file) {
  try {
    return file.getDateCreated().toISOString();
  } catch (err) {
    return "";
  }
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
