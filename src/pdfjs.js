import { getDocument, GlobalWorkerOptions } from "https://cdn.jsdelivr.net/npm/pdfjs-dist@6.4.299/build/pdf.min.mjs";

const PDFJS_VERSION = "6.4.299";
const PDFJS_ROOT = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}`;

GlobalWorkerOptions.workerSrc = `${PDFJS_ROOT}/build/pdf.worker.min.mjs`;

export async function openPdf(data) {
  const task = getDocument({
    data: data instanceof Uint8Array ? data.slice() : data,
    wasmUrl: `${PDFJS_ROOT}/wasm/`,
    cMapUrl: `${PDFJS_ROOT}/cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${PDFJS_ROOT}/standard_fonts/`,
    iccUrl: `${PDFJS_ROOT}/iccs/`,
    useWasm: true,
  });
  return task.promise;
}
