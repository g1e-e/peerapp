import { getDocument, GlobalWorkerOptions } from "https://cdn.jsdelivr.net/npm/pdfjs-dist@6.4.299/build/pdf.min.mjs";

const PDFJS_VERSION = "6.4.299";

GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build/pdf.worker.min.mjs`;

export async function openPdf(data) {
  const task = getDocument({ data });
  return task.promise;
}
