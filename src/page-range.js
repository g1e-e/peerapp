// Turns "3-7, 12, 40-45" into a list of page numbers.
// Pages are the PDF's own page numbers, starting at 1.

export const MAX_PAGES_PER_QUESTION = 50;

export function parsePageRange(text, pageCount) {
  const raw = String(text || "").trim();
  if (!raw) return { pages: [], error: "" };

  const count = Number(pageCount);
  if (!Number.isFinite(count) || count < 1) {
    return { pages: [], error: "Add a PDF before assigning pages." };
  }

  const pages = new Set();
  for (const piece of raw.split(",")) {
    const part = piece.trim();
    if (!part) continue;

    const range = part.match(/^(\d+)\s*-\s*(\d+)$/);
    const single = part.match(/^(\d+)$/);
    if (range) {
      const start = Number(range[1]);
      const end = Number(range[2]);
      if (start > end) {
        return { pages: [], error: `"${part}" goes backwards. Put the smaller page first.` };
      }
      if (start < 1 || end > count) {
        return { pages: [], error: `Pages must be between 1 and ${count}.` };
      }
      for (let page = start; page <= end; page += 1) pages.add(page);
    } else if (single) {
      const page = Number(single[1]);
      if (page < 1 || page > count) {
        return { pages: [], error: `Pages must be between 1 and ${count}.` };
      }
      pages.add(page);
    } else {
      return { pages: [], error: `Could not read "${part}". Use 3-7, 12, 40-45.` };
    }
  }

  const sorted = [...pages].sort((a, b) => a - b);
  if (sorted.length > MAX_PAGES_PER_QUESTION) {
    return {
      pages: sorted,
      error: `A question can have at most ${MAX_PAGES_PER_QUESTION} pages.`,
    };
  }
  return { pages: sorted, error: "" };
}

export function formatPageRange(pages) {
  const sorted = [...(pages || [])].filter((page) => Number.isFinite(page)).sort((a, b) => a - b);
  if (sorted.length === 0) return "";

  const parts = [];
  let start = sorted[0];
  let previous = sorted[0];
  for (let index = 1; index <= sorted.length; index += 1) {
    const page = sorted[index];
    if (page === previous + 1) {
      previous = page;
      continue;
    }
    parts.push(start === previous ? String(start) : `${start}-${previous}`);
    start = page;
    previous = page;
  }
  return parts.join(", ");
}

export function pageCountLabel(count) {
  if (!count) return "";
  return count === 1 ? "1 page" : `${count} pages`;
}
