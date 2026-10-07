// Peer review web app.
//
// Deploy: Execute as Me, Who has access: Anyone.
// Project Settings > Script properties: add ADMIN_PASSWORD.
// Do not put the password in this file.
//
// The browser posts JSON with Content-Type text/plain so there is no
// CORS preflight. Drive files stay in this account.
//
// Folders:
//   peerapp submissions — answer files, plus peerapp index.json
//   peerapp reviews     — one JSON file per review, and a subfolder of PDF chunks per upload
//
// A review stores pdfChunks (file ids in order) and pdfSize. The script
// does not stitch those chunks into one PDF.

var FOLDER_NAME = "peerapp submissions";
var REVIEWS_FOLDER_NAME = "peerapp reviews";
var FOLDER_ID_KEY = "SUBMISSIONS_FOLDER_ID";
var REVIEWS_FOLDER_ID_KEY = "REVIEWS_FOLDER_ID";
var INDEX_FILE_ID_KEY = "INDEX_FILE_ID";
var PASSWORD_KEY = "ADMIN_PASSWORD";
var FAIL_KEY = "ADMIN_FAILS";
var LOCK_KEY = "ADMIN_LOCK_UNTIL";
var MAX_FAILS = 5;
var WINDOW_MS = 15 * 60 * 1000;
var MAX_PDF_BYTES = 45 * 1024 * 1024;
var MAX_PAGES_PER_QUESTION = 50;
var CACHE_TTL = 300;
var CACHE_VALUE_LIMIT = 90000;
var RESAVE = "This review needs to be re-saved";

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
      if (body.action === "dashboard") return jsonResponse(handleDashboard());
      if (body.action === "getSubmission") return jsonResponse(handleGetSubmission(body));
      if (body.action === "delete") return jsonResponse(handleDelete(body));
      if (body.action === "uploadStart") return jsonResponse(handleUploadStart(body));
      if (body.action === "uploadChunk") return jsonResponse(handleUploadChunk(body));
      if (body.action === "uploadFinish") return jsonResponse(handleUploadFinish(body));
      if (body.action === "saveReview") return jsonResponse(handleSaveReview(body));
      if (body.action === "deleteReview") return jsonResponse(handleDeleteReview(body));
    }

    return jsonResponse({ ok: false, error: "Unknown action." });
  } catch (err) {
    return jsonResponse({ ok: false, error: "Could not complete the request." });
  }
}

function isAdminAction(action) {
  return action === "dashboard" || action === "getSubmission" || action === "delete"
    || action === "uploadStart" || action === "uploadChunk" || action === "uploadFinish"
    || action === "saveReview" || action === "deleteReview";
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
    if (!hasChunks(review)) return { ok: false, error: RESAVE };
  }

  var submittedAt = new Date().toISOString();
  var record = {
    submittedAt: submittedAt,
    reviewId: review ? review.id : "",
    reviewName: review ? review.name : "",
    answers: body.answers,
  };
  var filename = submittedAt + " - MRN " + safeMrn(mrnFromAnswers(body.answers)) + ".json";
  var folder = review ? submissionsFolderFor(review) : getFolder();
  var file = folder.createFile(Utilities.newBlob(JSON.stringify(record, null, 2), MimeType.JSON, filename));
  var summary = submissionSummary(file.getId(), record);

  updateIndex(function (index) {
    index.submissions.unshift(summary);
    if (summary.reviewId) bumpReviewCount(index, summary.reviewId, 1);
  });
  return { ok: true, id: file.getId() };
}

function handleGetReview(body) {
  var review = loadReview(body.reviewId);
  if (!review) return { ok: false, error: "Review not found." };
  if (!hasChunks(review)) return { ok: false, error: RESAVE };
  return { ok: true, review: publicReview(review) };
}

function handleGetPdfChunk(body) {
  var review = loadReview(body.reviewId);
  if (!review) return { ok: false, error: "Review not found." };
  if (!hasChunks(review)) return { ok: false, error: RESAVE };

  var index = Math.floor(Number(body.index));
  if (!isFinite(index) || index < 0 || index >= review.pdfChunks.length) {
    return { ok: false, error: "That part of the PDF does not exist." };
  }

  var file;
  try {
    file = DriveApp.getFileById(review.pdfChunks[index]);
  } catch (err) {
    return { ok: false, error: "The reference PDF is missing." };
  }
  return {
    ok: true,
    index: index,
    total: review.pdfChunks.length,
    data: Utilities.base64Encode(file.getBlob().getBytes()),
  };
}

function handleDashboard() {
  var index = readIndex();
  return {
    ok: true,
    reviews: index.reviews.map(publicReviewSummary),
    submissions: index.submissions,
  };
}

function handleGetSubmission(body) {
  if (!body.id) return { ok: false, error: "Missing file id." };
  var index = readIndex();
  if (!indexHasSubmission(index, body.id)) return { ok: false, error: "File not found." };
  try {
    var file = DriveApp.getFileById(body.id);
    return { ok: true, submission: readSubmission(file) };
  } catch (err) {
    return { ok: false, error: "File not found." };
  }
}

function handleDelete(body) {
  if (!body.id) return { ok: false, error: "Missing file id." };
  var removed = null;
  updateIndex(function (index) {
    if (!indexHasSubmission(index, body.id)) return;
    try {
      DriveApp.getFileById(body.id).setTrashed(true);
    } catch (err) {
      // Already gone. Still drop it from the index.
    }
    var kept = [];
    for (var i = 0; i < index.submissions.length; i++) {
      if (index.submissions[i].id === body.id) removed = index.submissions[i];
      else kept.push(index.submissions[i]);
    }
    index.submissions = kept;
    if (removed && removed.reviewId) bumpReviewCount(index, removed.reviewId, -1);
  });
  if (!removed) return { ok: false, error: "File not found." };
  return { ok: true };
}

function handleUploadStart(body) {
  var size = Number(body.size);
  var chunkCount = Math.floor(Number(body.chunkCount));
  if (!isFinite(size) || size <= 0) return { ok: false, error: "Missing PDF size." };
  if (size > MAX_PDF_BYTES) {
    return { ok: false, error: "This PDF is over 45 MB. Compress it and try again." };
  }
  if (chunkCount < 1 || chunkCount > 20) return { ok: false, error: "Could not split that PDF." };

  var uploadId = Utilities.getUuid();
  var folder = getReviewsFolder().createFolder(uploadId);
  var meta = { size: size, chunkCount: chunkCount, folderId: folder.getId() };
  CacheService.getScriptCache().put("upload:" + uploadId, JSON.stringify(meta), 21600);
  return { ok: true, uploadId: uploadId, folderId: folder.getId() };
}

function handleUploadChunk(body) {
  if (!body.folderId || body.data == null || body.data === "") {
    return { ok: false, error: "Missing PDF piece." };
  }
  var folder;
  try {
    folder = DriveApp.getFolderById(body.folderId);
  } catch (err) {
    return { ok: false, error: "Upload folder not found." };
  }
  if (!folderParentIs(folder, getReviewsFolder().getId())) {
    return { ok: false, error: "Upload folder not found." };
  }

  var bytes;
  try {
    bytes = Utilities.base64Decode(body.data);
  } catch (err) {
    return { ok: false, error: "Could not read a PDF piece." };
  }
  var file = folder.createFile(Utilities.newBlob(bytes, "application/octet-stream", String(body.index) + ".part"));
  return { ok: true, fileId: file.getId(), index: Number(body.index), size: bytes.length };
}

function handleUploadFinish(body) {
  var raw = CacheService.getScriptCache().get("upload:" + body.uploadId);
  if (!raw) return { ok: false, error: "That upload has expired. Start again." };
  var meta = JSON.parse(raw);
  var ids = body.fileIds;
  if (!ids || ids.length !== meta.chunkCount) {
    return { ok: false, error: "Upload is missing a piece. Try again." };
  }

  var sum = 0;
  for (var i = 0; i < ids.length; i++) {
    try {
      sum += DriveApp.getFileById(ids[i]).getSize();
    } catch (err) {
      return { ok: false, error: "Upload is missing a piece. Try again." };
    }
  }
  if (sum !== meta.size) return { ok: false, error: "The PDF arrived incomplete. Try again." };
  return { ok: true, pdfChunks: ids, pdfSize: sum, folderId: meta.folderId };
}

function handleSaveReview(body) {
  var review = body.review;
  if (!review || !validReviewId(review.id)) return { ok: false, error: "Review id is not valid." };
  var name = String(review.name || "").trim();
  if (!name) return { ok: false, error: "Give the review a name." };

  var incidentCount = clampCount(review.incidentCount);
  if (incidentCount === null) return { ok: false, error: "Number of incidents must be from 0 to 10." };

  var pageCount = Math.floor(Number(review.pageCount));
  if (!isFinite(pageCount) || pageCount < 1) return { ok: false, error: "The PDF has no pages." };

  var pages = sanitizePages(review.pages, pageCount);
  if (pages.error) return { ok: false, error: pages.error };

  var existing = loadReview(review.id);
  var pdfChunks;
  var folderId;
  var pdfSize;
  if (review.pdfChunks && review.pdfChunks.length) {
    pdfChunks = review.pdfChunks;
    folderId = review.folderId;
    pdfSize = Number(review.pdfSize) || 0;
    if (existing && existing.folderId && existing.folderId !== folderId) trashFolder(existing.folderId);
  } else if (existing && hasChunks(existing)) {
    pdfChunks = existing.pdfChunks;
    folderId = existing.folderId;
    pdfSize = existing.pdfSize;
    if (!pageCount) pageCount = existing.pageCount;
  } else if (existing && existing.pdfFileId && !hasChunks(existing)) {
    return { ok: false, error: RESAVE };
  } else {
    return { ok: false, error: "Upload a PDF first." };
  }

  var record = {
    id: review.id,
    name: name,
    createdAt: existing && existing.createdAt ? existing.createdAt : new Date().toISOString(),
    pdfChunks: pdfChunks,
    pdfSize: pdfSize,
    folderId: folderId || "",
    submissionsFolderId: existing && existing.submissionsFolderId ? existing.submissionsFolderId : "",
    reviewFileId: existing && existing.reviewFileId ? existing.reviewFileId : "",
    pageCount: pageCount,
    incidentCount: incidentCount,
    pages: pages.value,
  };

  var saved = persistReview(record);
  invalidateReview(saved.id);
  cacheReview(saved);

  var summary = publicReviewSummary(saved);
  updateIndex(function (index) {
    var found = false;
    for (var i = 0; i < index.reviews.length; i++) {
      if (index.reviews[i].id === saved.id) {
        summary.submissionCount = index.reviews[i].submissionCount || 0;
        index.reviews[i] = internalReviewSummary(saved, summary.submissionCount);
        found = true;
        break;
      }
    }
    if (!found) index.reviews.unshift(internalReviewSummary(saved, 0));
  });
  summary.submissionCount = summary.submissionCount || 0;
  return { ok: true, review: summary };
}

function handleDeleteReview(body) {
  var review = loadReview(body.reviewId);
  if (!review) return { ok: false, error: "Review not found." };

  if (review.reviewFileId) trashFileById(review.reviewFileId);
  else trashNamed(getReviewsFolder(), review.id + ".json");
  if (review.folderId) trashFolder(review.folderId);
  if (review.pdfFileId) trashFileById(review.pdfFileId);
  if (review.submissionsFolderId) trashFolder(review.submissionsFolderId);

  invalidateReview(review.id);
  updateIndex(function (index) {
    var reviews = [];
    for (var i = 0; i < index.reviews.length; i++) {
      if (index.reviews[i].id !== review.id) reviews.push(index.reviews[i]);
    }
    index.reviews = reviews;
    var submissions = [];
    for (var s = 0; s < index.submissions.length; s++) {
      if (index.submissions[s].reviewId !== review.id) submissions.push(index.submissions[s]);
    }
    index.submissions = submissions;
  });
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
    pdfChunkCount: review.pdfChunks ? review.pdfChunks.length : 0,
  };
}

function publicReviewSummary(review) {
  return {
    id: review.id,
    name: review.name,
    createdAt: review.createdAt,
    incidentCount: review.incidentCount || 0,
    submissionCount: review.submissionCount || 0,
  };
}

function internalReviewSummary(review, submissionCount) {
  return {
    id: review.id,
    name: review.name,
    createdAt: review.createdAt,
    incidentCount: review.incidentCount || 0,
    submissionCount: submissionCount || 0,
    reviewFileId: review.reviewFileId || "",
    folderId: review.folderId || "",
  };
}

function hasChunks(review) {
  return review && review.pdfChunks && review.pdfChunks.length > 0;
}

function loadReview(id) {
  if (!validReviewId(id)) return null;
  var cache = CacheService.getScriptCache();
  var hit = cache.get("review:" + id);
  if (hit) {
    try {
      return JSON.parse(hit);
    } catch (err) {
      // Cache entry was cut off. Read Drive below.
    }
  }

  var review = null;
  var index = readIndex();
  var reviewFileId = "";
  for (var i = 0; i < index.reviews.length; i++) {
    if (index.reviews[i].id === id) reviewFileId = index.reviews[i].reviewFileId || "";
  }
  if (reviewFileId) {
    try {
      review = JSON.parse(DriveApp.getFileById(reviewFileId).getBlob().getDataAsString());
    } catch (err) {
      review = null;
    }
  }
  if (!review) review = loadReviewByName(id);
  if (review) cacheReview(review);
  return review;
}

function loadReviewByName(id) {
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

function cacheReview(review) {
  var json = JSON.stringify(review);
  if (json.length > CACHE_VALUE_LIMIT) return;
  CacheService.getScriptCache().put("review:" + review.id, json, CACHE_TTL);
}

function invalidateReview(id) {
  CacheService.getScriptCache().remove("review:" + id);
}

function persistReview(record) {
  var json = JSON.stringify(record, null, 2);
  if (record.reviewFileId) {
    try {
      var existing = DriveApp.getFileById(record.reviewFileId);
      existing.setContent(json);
      return record;
    } catch (err) {
      record.reviewFileId = "";
    }
  }
  var file = getReviewsFolder().createFile(Utilities.newBlob(json, MimeType.JSON, record.id + ".json"));
  record.reviewFileId = file.getId();
  file.setContent(JSON.stringify(record, null, 2));
  return record;
}

function submissionsFolderFor(review) {
  if (review.submissionsFolderId) {
    try {
      var existing = DriveApp.getFolderById(review.submissionsFolderId);
      if (!existing.isTrashed()) return existing;
    } catch (err) {
      review.submissionsFolderId = "";
    }
  }
  var created = getFolder().createFolder(review.id);
  review.submissionsFolderId = created.getId();
  if (review.reviewFileId || review.id) {
    var saved = persistReview(review);
    review.reviewFileId = saved.reviewFileId;
    cacheReview(review);
  }
  return created;
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

function submissionSummary(id, record) {
  return {
    id: id,
    reviewId: record.reviewId || "",
    reviewName: record.reviewName || "",
    submittedAt: record.submittedAt || "",
    mrn: mrnFromAnswers(record.answers),
    patientName: answerValue(record.answers, [], ["Patient name"]),
    provider: answerValue(record.answers, ["providerName"], ["Provider Name"]),
  };
}

function readIndex() {
  var cached = readIndexCache();
  if (cached) return cached;
  var index = readIndexFromDrive();
  writeIndexCache(index);
  return index;
}

function readIndexFromDrive() {
  var file = getIndexFile();
  if (!file) return rebuildIndex();
  try {
    var index = JSON.parse(file.getBlob().getDataAsString());
    if (!index || !index.reviews || !index.submissions) return rebuildIndex();
    return index;
  } catch (err) {
    return rebuildIndex();
  }
}

function getIndexFile() {
  var id = PropertiesService.getScriptProperties().getProperty(INDEX_FILE_ID_KEY);
  if (!id) return null;
  try {
    var file = DriveApp.getFileById(id);
    if (!file.isTrashed()) return file;
  } catch (err) {
    // Rebuild below.
  }
  return null;
}

function rebuildIndex() {
  var reviews = [];
  var reviewFiles = getReviewsFolder().getFiles();
  while (reviewFiles.hasNext()) {
    var file = reviewFiles.next();
    if (!isJsonName(file.getName()) || file.getName() === "index.json") continue;
    try {
      var review = JSON.parse(file.getBlob().getDataAsString());
      if (!review || !review.id) continue;
      if (!review.reviewFileId) review.reviewFileId = file.getId();
      reviews.push(internalReviewSummary(review, 0));
    } catch (err) {
      // Skip a file that is not a review.
    }
  }

  var submissions = [];
  eachSubmissionFile(function (file) {
    try {
      var data = JSON.parse(file.getBlob().getDataAsString());
      if (!data || !data.answers) return;
      submissions.push(submissionSummary(file.getId(), data));
    } catch (err) {
      // Skip.
    }
  });
  for (var i = 0; i < reviews.length; i++) {
    var count = 0;
    for (var s = 0; s < submissions.length; s++) {
      if (submissions[s].reviewId === reviews[i].id) count++;
    }
    reviews[i].submissionCount = count;
  }
  submissions.sort(function (a, b) {
    return String(b.submittedAt).localeCompare(String(a.submittedAt));
  });
  var index = { reviews: reviews, submissions: submissions };
  writeIndexFile(index);
  return index;
}

function updateIndex(mutator) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var index = readIndexFromDrive();
    mutator(index);
    writeIndexFile(index);
    writeIndexCache(index);
  } finally {
    lock.releaseLock();
  }
}

function writeIndexFile(index) {
  var json = JSON.stringify(index);
  var existing = getIndexFile();
  if (existing) {
    existing.setContent(json);
    return;
  }
  var file = getFolder().createFile(Utilities.newBlob(json, MimeType.JSON, "peerapp index.json"));
  PropertiesService.getScriptProperties().setProperty(INDEX_FILE_ID_KEY, file.getId());
}

function writeIndexCache(index) {
  var cache = CacheService.getScriptCache();
  clearIndexCache(cache);
  var json = JSON.stringify(index);
  if (json.length <= CACHE_VALUE_LIMIT) {
    cache.put("peerapp-index", json, CACHE_TTL);
    return;
  }
  var parts = Math.ceil(json.length / CACHE_VALUE_LIMIT);
  if (parts > 20) return;
  cache.put("peerapp-index-n", String(parts), CACHE_TTL);
  for (var i = 0; i < parts; i++) {
    cache.put("peerapp-index-" + i, json.substring(i * CACHE_VALUE_LIMIT, (i + 1) * CACHE_VALUE_LIMIT), CACHE_TTL);
  }
}

function readIndexCache() {
  var cache = CacheService.getScriptCache();
  var whole = cache.get("peerapp-index");
  if (whole) {
    try {
      return JSON.parse(whole);
    } catch (err) {
      return null;
    }
  }
  var count = Number(cache.get("peerapp-index-n") || "0");
  if (!count) return null;
  var json = "";
  for (var i = 0; i < count; i++) {
    var part = cache.get("peerapp-index-" + i);
    if (!part) return null;
    json += part;
  }
  try {
    return JSON.parse(json);
  } catch (err) {
    return null;
  }
}

function clearIndexCache(cache) {
  var keys = ["peerapp-index", "peerapp-index-n"];
  for (var i = 0; i < 20; i++) keys.push("peerapp-index-" + i);
  cache.removeAll(keys);
}

function indexHasSubmission(index, id) {
  for (var i = 0; i < index.submissions.length; i++) {
    if (index.submissions[i].id === id) return true;
  }
  return false;
}

function bumpReviewCount(index, reviewId, delta) {
  for (var i = 0; i < index.reviews.length; i++) {
    if (index.reviews[i].id === reviewId) {
      index.reviews[i].submissionCount = Math.max(0, (index.reviews[i].submissionCount || 0) + delta);
    }
  }
}

function eachSubmissionFile(visitor) {
  var parent = getFolder();
  var files = parent.getFiles();
  while (files.hasNext()) {
    var file = files.next();
    if (file.getName() === "peerapp index.json") continue;
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

function folderParentIs(folder, parentId) {
  var parents = folder.getParents();
  while (parents.hasNext()) {
    if (parents.next().getId() === parentId) return true;
  }
  return false;
}

function trashFolder(id) {
  if (!id) return;
  try {
    DriveApp.getFolderById(id).setTrashed(true);
  } catch (err) {
    // Already gone.
  }
}

// A correct password only reads Script Properties.
// The script lock is taken only while recording a wrong password.
function authorize(password) {
  var props = PropertiesService.getScriptProperties();
  var now = Date.now();
  var lockUntil = Number(props.getProperty(LOCK_KEY) || "0");
  if (lockUntil > now) {
    return { ok: false, error: "Too many attempts, try again later" };
  }

  var expected = props.getProperty(PASSWORD_KEY);
  if (!expected) return { ok: false, error: "Admin password is not set" };
  if (String(password || "") === String(expected)) return { ok: true };
  return recordFailedPassword(now);
}

function recordFailedPassword(now) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (err) {
    return { ok: false, error: "Try again in a moment." };
  }
  try {
    var props = PropertiesService.getScriptProperties();
    var lockUntil = Number(props.getProperty(LOCK_KEY) || "0");
    if (lockUntil > Date.now()) {
      return { ok: false, error: "Too many attempts, try again later" };
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
  } finally {
    lock.releaseLock();
  }
}

function getFolder() {
  return getNamedFolder(FOLDER_NAME, FOLDER_ID_KEY);
}

function getReviewsFolder() {
  return getNamedFolder(REVIEWS_FOLDER_NAME, REVIEWS_FOLDER_ID_KEY);
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
