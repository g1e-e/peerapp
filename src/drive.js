// Talks to the Apps Script web app. The body is text/plain so the
// browser does not send a CORS preflight.

import { APPS_SCRIPT_URL } from "./config.js";

export function driveConfigured() {
  return typeof APPS_SCRIPT_URL === "string" && APPS_SCRIPT_URL.trim() !== "";
}

export async function postToDrive(payload) {
  let response;
  try {
    response = await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      redirect: "follow",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error("Could not reach Google Drive.");
  }

  let data = null;
  try {
    data = JSON.parse(await response.text());
  } catch {
    data = null;
  }

  if (!data || typeof data !== "object") {
    throw new Error("Drive did not return a readable response. Check the web app URL and deployment.");
  }
  if (data.ok === false) {
    throw new Error(data.error || "Drive rejected the request.");
  }
  if (!response.ok) {
    throw new Error(data.error || "Drive rejected the request.");
  }
  return data;
}
