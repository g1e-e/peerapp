const START_RULES = [
  [/procedure\s+start(?:\s+time)?/i, 1],
  [/proc(?:edure)?\s+start/i, 1],
  [/procedure\s+begin/i, 1],
  [/surgery\s+start/i, 2],
  [/op(?:eration)?\s+start/i, 2],
  [/\bincision(?:\s+time)?\b/i, 2],
  [/start\s+time/i, 3],
  [/in\s+room/i, 5],
];

const END_RULES = [
  [/procedure\s+end(?:\s+time)?/i, 1],
  [/proc(?:edure)?\s+end/i, 1],
  [/surgery\s+end/i, 2],
  [/op(?:eration)?\s+end/i, 2],
  [/\bclosure(?:\s+time)?\b/i, 2],
  [/\bclose(?:\s+time)?\b/i, 2],
  [/end\s+time/i, 3],
  [/stop\s+time/i, 3],
  [/out\s+of\s+room/i, 5],
];

export const EMPTY_PROCEDURE_TIMES = { start: "", end: "" };
export const PROCEDURE_QUESTION_ID = "chartProcedureTime";
export const PROCEDURE_MISS = "Couldn't find procedure times on these pages; enter them manually.";

export function normalizeProcedureTimes(value) {
  const start = clockOrEmpty(value && value.start);
  const end = clockOrEmpty(value && value.end);
  return { start, end };
}

export function formatProcedureLine(times) {
  const start = times && times.start;
  const end = times && times.end;
  if (!start && !end) return "";
  if (start && end) return `Procedure start ${start}, end ${end} (${durationLabel(start, end)})`;
  if (start) return `Procedure start ${start}`;
  return `Procedure end ${end}`;
}

export function durationLabel(start, end) {
  const [startHour, startMinute] = start.split(":").map(Number);
  const [endHour, endMinute] = end.split(":").map(Number);
  let minutes = endHour * 60 + endMinute - (startHour * 60 + startMinute);
  if (minutes < 0) minutes += 24 * 60;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours && rest) return `${hours} h ${rest} min`;
  if (hours) return `${hours} h`;
  return `${rest} min`;
}

export async function findProcedureTimes(pdf, pageNumbers) {
  const starts = [];
  const ends = [];
  for (const pageNumber of pageNumbers) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const lines = linesFromItems(content.items || []);
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const next = lines[index + 1] || "";
      collectHits(line, next, pageNumber, START_RULES, starts);
      collectHits(line, next, pageNumber, END_RULES, ends);
    }
  }
  const startHit = bestHit(starts);
  const endHit = bestHit(ends);
  return {
    start: startHit ? startHit.clock : "",
    end: endHit ? endHit.clock : "",
    startPage: startHit ? startHit.page : 0,
    endPage: endHit ? endHit.page : 0,
  };
}

function collectHits(line, nextLine, pageNumber, rules, bucket) {
  for (const [pattern, rank] of rules) {
    const match = pattern.exec(line);
    if (!match) continue;
    const after = line.slice(match.index + match[0].length);
    const time = firstTime(after) || firstTime(line) || firstTime(nextLine);
    if (!time) continue;
    bucket.push({ rank, clock: time, page: pageNumber });
  }
}

function bestHit(hits) {
  if (!hits.length) return null;
  hits.sort((a, b) => a.rank - b.rank || a.page - b.page);
  return hits[0];
}

function linesFromItems(items) {
  const rows = [];
  for (const item of items) {
    const text = item && item.str ? item.str.trim() : "";
    if (!text) continue;
    const y = item.transform ? item.transform[5] : 0;
    const x = item.transform ? item.transform[4] : 0;
    let row = null;
    for (const candidate of rows) {
      if (Math.abs(candidate.y - y) <= 3) {
        row = candidate;
        break;
      }
    }
    if (!row) {
      row = { y, parts: [] };
      rows.push(row);
    }
    row.parts.push({ x, text });
  }
  rows.sort((a, b) => b.y - a.y);
  return rows.map((row) => row.parts
    .sort((a, b) => a.x - b.x)
    .map((part) => part.text)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim());
}

function firstTime(text) {
  if (!text) return "";
  const clock = text.match(/\b(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)?\b/i);
  if (clock) {
    const parsed = fromClock(Number(clock[1]), Number(clock[2]), clock[3]);
    if (parsed) return parsed;
  }
  const compact = text.match(/(^|[^\d])([01]\d|2[0-3])([0-5]\d)(?!\d)/);
  if (!compact) return "";
  const hours = Number(compact[2]);
  const minutes = Number(compact[3]);
  const stamp = hours * 100 + minutes;
  if (stamp >= 1900 && stamp <= 2099) return "";
  return fromClock(hours, minutes, "");
}

function fromClock(hours, minutes, suffix) {
  if (minutes > 59) return "";
  let hour = hours;
  const marker = String(suffix || "").toLowerCase();
  if (marker) {
    if (hour > 12) return "";
    if (marker === "am") hour = hour === 12 ? 0 : hour;
    if (marker === "pm") hour = hour === 12 ? 12 : hour + 12;
  }
  if (hour > 23) return "";
  return `${String(hour).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function clockOrEmpty(value) {
  const text = String(value || "").trim();
  const match = text.match(/^(\d{2}):(\d{2})$/);
  if (!match) return "";
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return "";
  return text;
}
