import { PDFDocument, StandardFonts, rgb } from "https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.esm.min.js";
import { basicDetailsSegment, segments } from "./questions.js";
import { formatProcedureLine } from "./procedure-times.js";

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 40;
const BLUE = rgb(0.357, 0.608, 0.835);
const LIGHT = rgb(0.867, 0.922, 0.969);
const INK = rgb(0.1, 0.12, 0.16);
const WHITE = rgb(1, 1, 1);
const LINE = rgb(0.15, 0.15, 0.15);

export function submissionPdfName(submission) {
  const name = String(submission.reviewName || "Review")
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim() || "Review";
  const day = String(submission.submittedAt || "").slice(0, 10) || "undated";
  return `${name} - ${day}.pdf`;
}

export async function buildSubmissionPdf(submission) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const details = basicDetailsOf(submission);
  const chart = sectionByTitle(submission, "Chart Review");
  const opportunity = sectionByTitle(submission, "Opportunity for Improvement");
  const comments = sectionByTitle(submission, "Comments");
  const incidents = (submission.answers || []).filter((section) =>
    String(section.title || "").startsWith("Peer Review - Incident")
  );
  const times = procedureTimesOf(submission, chart);

  let page = null;
  let pageNumber = 0;
  let y = 0;

  function contentWidth() {
    return PAGE_W - MARGIN * 2;
  }

  function addPage() {
    pageNumber += 1;
    page = doc.addPage([PAGE_W, PAGE_H]);
    const top = PAGE_H - 26;
    page.drawText("ASC WebQI", { x: MARGIN, y: top, size: 9, font, color: INK });
    const center1 = "East Hills Surgery Center";
    const center2 = "Physician Peer Review";
    page.drawText(center1, {
      x: (PAGE_W - bold.widthOfTextAtSize(center1, 11)) / 2,
      y: top + 2,
      size: 11,
      font: bold,
      color: INK,
    });
    page.drawText(center2, {
      x: (PAGE_W - bold.widthOfTextAtSize(center2, 11)) / 2,
      y: top - 12,
      size: 11,
      font: bold,
      color: INK,
    });
    const marker = `Page: ${pageNumber}`;
    page.drawText(marker, {
      x: PAGE_W - MARGIN - font.widthOfTextAtSize(marker, 9),
      y: top,
      size: 9,
      font,
      color: INK,
    });
    page.drawRectangle({
      x: MARGIN,
      y: top - 24,
      width: contentWidth(),
      height: 2.2,
      color: LINE,
    });
    y = top - 40;
  }

  function ensure(height) {
    if (!page || y - height < 36) addPage();
  }

  function bar(title) {
    ensure(22);
    page.drawRectangle({
      x: MARGIN,
      y: y - 16,
      width: contentWidth(),
      height: 16,
      color: BLUE,
    });
    page.drawText(safe(title), {
      x: MARGIN + 6,
      y: y - 12,
      size: 10,
      font: bold,
      color: WHITE,
    });
    y -= 22;
  }

  function drawPair(left, right) {
    ensure(18);
    const half = contentWidth() / 2;
    paintValue(MARGIN, left.label, left.value, half - 6);
    if (right) paintValue(MARGIN + half, right.label, right.value, half - 6);
    y -= 18;
  }

  function paintValue(x, label, value, width) {
    const labelW = Math.min(108, bold.widthOfTextAtSize(`${label} `, 8) + 4);
    page.drawText(safe(label), { x, y: y - 11, size: 8, font: bold, color: INK });
    page.drawRectangle({
      x: x + labelW,
      y: y - 15,
      width: Math.max(20, width - labelW),
      height: 14,
      color: LIGHT,
      borderColor: rgb(0.7, 0.78, 0.86),
      borderWidth: 0.4,
    });
    page.drawText(fit(font, value, 8, width - labelW - 6), {
      x: x + labelW + 3,
      y: y - 11,
      size: 8,
      font,
      color: INK,
    });
  }

  function questionBlock(label, options, selected, extra) {
    const lines = wrap(font, label, 9, contentWidth());
    ensure(lines.length * 12 + 18 + (extra ? 14 : 0));
    lines.forEach((line, index) => {
      page.drawText(safe(line), { x: MARGIN, y: y - 11, size: 9, font, color: INK });
      y -= 12;
      if (index === 0) return;
    });
    let x = MARGIN + 16;
    for (const option of options) {
      const checked = String(selected || "") === option;
      page.drawRectangle({
        x,
        y: y - 10,
        width: 8,
        height: 8,
        borderColor: INK,
        borderWidth: 0.7,
      });
      if (checked) {
        page.drawLine({ start: { x: x + 1.4, y: y - 6 }, end: { x: x + 3.2, y: y - 8.4 }, thickness: 0.9, color: INK });
        page.drawLine({ start: { x: x + 3.2, y: y - 8.4 }, end: { x: x + 6.8, y: y - 2.6 }, thickness: 0.9, color: INK });
      }
      page.drawText(option, { x: x + 12, y: y - 9, size: 9, font, color: INK });
      x += Math.max(78, font.widthOfTextAtSize(option, 9) + 28);
    }
    y -= 16;
    if (extra) {
      page.drawText(safe(extra), { x: MARGIN + 16, y: y - 2, size: 8, font, color: INK });
      y -= 14;
    }
  }

  function drawComments(text) {
    bar("Comments");
    const inner = contentWidth() - 16;
    const lines = wrap(font, text, 10, inner);
    const usable = lines.length ? lines : [""];
    let index = 0;
    let first = true;
    while (first || index < usable.length) {
      const available = y - 36;
      if (available < 48) {
        addPage();
        continue;
      }
      const minBox = first ? Math.min(available, 500) : available;
      const remaining = Math.max(1, usable.length - index);
      const boxH = Math.min(available, Math.max(minBox, remaining * 13 + 14));
      const fits = Math.max(1, Math.floor((boxH - 14) / 13));
      page.drawRectangle({
        x: MARGIN,
        y: y - boxH,
        width: contentWidth(),
        height: boxH,
        borderColor: INK,
        borderWidth: 1,
      });
      const slice = usable.slice(index, index + fits);
      slice.forEach((line, lineIndex) => {
        if (!line) return;
        page.drawText(safe(line), {
          x: MARGIN + 8,
          y: y - 16 - lineIndex * 13,
          size: 10,
          font,
          color: INK,
        });
      });
      index += slice.length;
      y -= boxH + 10;
      first = false;
      if (index >= usable.length) break;
      addPage();
    }
  }

  function underlineField(label, value, x, width) {
    const caption = `${label}:`;
    page.drawText(safe(caption), { x, y, size: 9, font: bold, color: INK });
    const captionW = bold.widthOfTextAtSize(caption, 9) + 4;
    const shown = fit(font, value, 9, Math.max(12, width - captionW - 2));
    page.drawText(shown, { x: x + captionW, y, size: 9, font, color: INK });
    page.drawLine({
      start: { x: x + captionW, y: y - 2 },
      end: { x: x + width, y: y - 2 },
      thickness: 0.5,
      color: INK,
    });
  }

  function drawIncident(section) {
    addPage();
    bar("Peer Review - Incident");
    const gap = 16;
    const half = (contentWidth() - gap) / 2;
    const shown = (id) => displayValue(valueOf(section, id), /date/i.test(id) ? "date" : "text");
    const row = (leftLabel, leftId, rightLabel, rightId) => {
      ensure(22);
      underlineField(leftLabel, shown(leftId), MARGIN, half);
      if (rightLabel) underlineField(rightLabel, shown(rightId), MARGIN + half + gap, half);
      y -= 22;
    };
    row("Patient name", "patientName", "MRN", "mrn");
    row("Date of Surgery", "surgeryDate", "Incident #", "incidentNumber");
    row("Surgeon", "surgeon");
    y -= 4;
    multiline("Procedure", valueOf(section, "procedure"), 2);
    multiline("Event/Routine review", valueOf(section, "eventReview"), 4);
    y -= 6;
    row("Reviewed by", "reviewedBy", "Date", "reviewDate");
  }

  function multiline(label, value, minLines) {
    ensure(16);
    page.drawText(safe(`${label}:`), { x: MARGIN, y, size: 9, font: bold, color: INK });
    y -= 4;
    const lines = wrap(font, value, 9, contentWidth() - 8);
    const count = Math.max(minLines, lines.length);
    for (let index = 0; index < count; index += 1) {
      ensure(16);
      if (lines[index]) {
        page.drawText(safe(lines[index]), { x: MARGIN + 4, y: y - 11, size: 9, font, color: INK });
      }
      page.drawLine({
        start: { x: MARGIN, y: y - 14 },
        end: { x: PAGE_W - MARGIN, y: y - 14 },
        thickness: 0.4,
        color: INK,
      });
      y -= 16;
    }
  }

  addPage();
  bar("Basic Details");
  const paired = basicDetailsSegment.questions.filter((question) => question.width === "half");
  for (let index = 0; index < paired.length; index += 2) {
    drawPair(
      { label: paired[index].label, value: displayValue(details[paired[index].id], paired[index].type) },
      paired[index + 1]
        ? { label: paired[index + 1].label, value: displayValue(details[paired[index + 1].id], paired[index + 1].type) }
        : null
    );
  }
  y -= 4;
  ensure(16);
  page.drawText("Incident Number:", { x: MARGIN, y: y - 10, size: 9, font: bold, color: INK });
  page.drawText(fit(font, details.incidentNumber || "", 9, contentWidth() - 110), {
    x: MARGIN + 102,
    y: y - 10,
    size: 9,
    font,
    color: INK,
  });
  y -= 22;

  drawSection(chartSegment(), "Chart Review", chart, times);
  drawSection(opportunitySegment(), "Opportunity for improvement", opportunity, null);
  drawComments(valueOf(comments, "comments"));
  for (const incident of incidents) drawIncident(incident);

  function drawSection(segment, title, section, procedureTimes) {
    if (!segment) return;
    bar(title);
    for (const question of segment.questions) {
      if (question.type === "textarea") continue;
      const options = question.type === "radio" ? question.options || [] : ["Yes", "No", "N/A"];
      const selected = valueOf(section, question.id);
      const extra = question.id === "chartProcedureTime" ? formatProcedureLine(procedureTimes) : "";
      questionBlock(questionText(question), options, selected, extra);
    }
  }

  return doc.save();
}

function chartSegment() {
  return segments.find((segment) => segment.title === "Chart Review");
}

function opportunitySegment() {
  return segments.find((segment) => segment.title === "Opportunity for Improvement");
}

function questionText(question) {
  if (question.number == null || question.number === "") return question.label;
  return `${question.number}. ${question.label}`;
}

function sectionByTitle(submission, title) {
  return (submission.answers || []).find((section) => section.title === title) || { fields: [] };
}

function valueOf(section, id) {
  const fields = section && section.fields ? section.fields : [];
  const field = fields.find((item) => item.id === id || String(item.id || "").endsWith(`.${id}`));
  return field && field.value != null ? String(field.value) : "";
}

function basicDetailsOf(submission) {
  const fromReview = submission.basicDetails && typeof submission.basicDetails === "object"
    ? submission.basicDetails
    : {};
  const section = sectionByTitle(submission, "Basic Details");
  const details = {};
  for (const question of basicDetailsSegment.questions) {
    details[question.id] = fromReview[question.id] || valueOf(section, question.id) || "";
  }
  return details;
}

function procedureTimesOf(submission, chart) {
  const field = (chart.fields || []).find((item) => item.id === "chartProcedureTime");
  if (field && field.procedureTimes) return field.procedureTimes;
  return submission.procedureTimes || {};
}

function displayValue(value, type) {
  const text = String(value || "");
  if (type === "date" && /^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const [year, month, day] = text.split("-");
    return `${month}/${day}/${year}`;
  }
  return text;
}

function safe(text) {
  return String(text || "").replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, "");
}

function fit(font, text, size, width) {
  const raw = safe(text);
  if (font.widthOfTextAtSize(raw, size) <= width) return raw;
  let kept = raw;
  while (kept.length > 1 && font.widthOfTextAtSize(`${kept}...`, size) > width) {
    kept = kept.slice(0, -1);
  }
  return `${kept}...`;
}

function wrap(font, text, size, maxWidth) {
  const raw = safe(text).replace(/\s+/g, " ").trim();
  if (!raw) return [];
  const lines = [];
  let line = "";
  for (const word of raw.split(" ")) {
    if (font.widthOfTextAtSize(word, size) > maxWidth) {
      if (line) {
        lines.push(line);
        line = "";
      }
      let chunk = "";
      for (const char of word) {
        const next = chunk + char;
        if (font.widthOfTextAtSize(next, size) <= maxWidth) chunk = next;
        else {
          if (chunk) lines.push(chunk);
          chunk = char;
        }
      }
      line = chunk;
      continue;
    }
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= maxWidth) line = next;
    else {
      if (line) lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}
