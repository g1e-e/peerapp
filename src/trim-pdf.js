import { PDFDocument } from "https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.esm.min.js";

export async function copyPdfPages(bytes, zeroBasedIndexes) {
  const source = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const trimmed = await PDFDocument.create();
  const copied = await trimmed.copyPages(source, zeroBasedIndexes);
  for (const page of copied) trimmed.addPage(page);
  return trimmed.save();
}
