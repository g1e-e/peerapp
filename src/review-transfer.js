// Upload and download a review PDF in chunks so each request stays
// under the Apps Script size limit.

import { postToDrive } from "./drive.js";
import {
  CHUNK_BYTES,
  MAX_PDF_BYTES,
  base64ToBytes,
  concatBytes,
  uint8ToBase64,
} from "./bytes.js";

export { MAX_PDF_BYTES };

export async function uploadPdf(file, password, onProgress) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.length > MAX_PDF_BYTES) {
    throw new Error("This PDF is over 45 MB. Compress it and try again.");
  }
  if (bytes.length === 0) {
    throw new Error("That PDF is empty.");
  }

  const chunkCount = Math.ceil(bytes.length / CHUNK_BYTES);
  const started = await postToDrive({
    action: "uploadStart",
    password,
    name: file.name,
    size: bytes.length,
    chunkCount,
  });

  for (let index = 0; index < chunkCount; index += 1) {
    const slice = bytes.subarray(index * CHUNK_BYTES, (index + 1) * CHUNK_BYTES);
    await postToDrive({
      action: "uploadChunk",
      password,
      uploadId: started.uploadId,
      index,
      data: uint8ToBase64(slice),
    });
    if (onProgress) onProgress(index + 1, chunkCount);
  }

  const finished = await postToDrive({
    action: "uploadFinish",
    password,
    uploadId: started.uploadId,
  });
  return finished.pdfFileId;
}

export async function downloadReviewPdf(reviewId, onProgress) {
  const first = await postToDrive({ action: "getPdfChunk", reviewId, index: 0 });
  const total = Number(first.total) || 1;
  const parts = new Array(total);
  parts[0] = base64ToBytes(first.data || "");
  if (onProgress) onProgress(1, total);

  for (let index = 1; index < total; index += 1) {
    const chunk = await postToDrive({ action: "getPdfChunk", reviewId, index });
    parts[index] = base64ToBytes(chunk.data || "");
    if (onProgress) onProgress(index + 1, total);
  }
  return concatBytes(parts);
}
