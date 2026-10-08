import { APPS_SCRIPT_URL } from "./config.js";

const READ_ACTIONS = new Set([
  "unlock",
  "dashboard",
  "getSubmission",
  "getReviewAdmin",
  "getReview",
  "reviewGate",
  "getPdfChunk",
  "lock",
  "uploadChunk",
]);

const READ_ATTEMPTS = 4;
const RETRY_DELAYS_MS = [500, 1000, 2000];
const ATTEMPT_TIMEOUT_MS = 60000;

const READ_ERROR = "Google's servers didn't respond. Please try again in a moment.";
const WRITE_ERROR = "Google didn't respond properly. Your action may or may not have gone through — check the dashboard before trying again.";
const SUBMIT_ERROR = "Google didn't respond properly. Please wait a moment and try submitting again.";

export function driveConfigured() {
  return typeof APPS_SCRIPT_URL === "string" && APPS_SCRIPT_URL.trim() !== "";
}

export async function postToDrive(payload) {
  const action = payload && payload.action;
  const read = READ_ACTIONS.has(action);
  const attempts = read ? READ_ATTEMPTS : 1;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (attempt > 0) await delay(RETRY_DELAYS_MS[attempt - 1]);
    try {
      return await requestOnce(payload);
    } catch (err) {
      if (err && err.scriptResponse) throw err;
    }
  }
  throw new Error(read ? READ_ERROR : action === "submit" ? SUBMIT_ERROR : WRITE_ERROR);
}

async function requestOnce(payload) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ATTEMPT_TIMEOUT_MS);
  try {
    const response = await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      redirect: "follow",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    let data = null;
    try {
      data = JSON.parse(await response.text());
    } catch {
      data = null;
    }
    if (!data || typeof data !== "object") {
      throw new Error("unreadable");
    }
    if (data.ok === false || !response.ok) {
      throw scriptError(data.error || "Drive rejected the request.");
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

function scriptError(message) {
  const error = new Error(message);
  error.scriptResponse = true;
  return error;
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
