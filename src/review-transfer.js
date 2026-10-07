import { postToDrive } from "./drive.js";
import {
  CHUNK_BYTES,
  MAX_PDF_BYTES,
  base64ToBytes,
  concatBytes,
  uint8ToBase64,
} from "./bytes.js";

export { MAX_PDF_BYTES };

const CONCURRENCY = 4;

export async function uploadPdf(file, password, onProgress) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.length > MAX_PDF_BYTES) {
    throw new Error("This PDF is over 45 MB. Compress it and try again.");
  }
  if (bytes.length === 0) throw new Error("That PDF is empty.");

  const chunkCount = Math.ceil(bytes.length / CHUNK_BYTES);
  const started = await postToDrive({
    action: "uploadStart",
    password,
    name: file.name,
    size: bytes.length,
    chunkCount,
  });

  const fileIds = new Array(chunkCount);
  let finished = 0;
  await runPool(chunkCount, CONCURRENCY, async (index) => {
    const slice = bytes.subarray(index * CHUNK_BYTES, (index + 1) * CHUNK_BYTES);
    const saved = await withRetry(() => postToDrive({
      action: "uploadChunk",
      password,
      folderId: started.folderId,
      index,
      data: uint8ToBase64(slice),
    }));
    fileIds[index] = saved.fileId;
    finished += 1;
    if (onProgress) onProgress(finished, chunkCount);
  });

  return postToDrive({
    action: "uploadFinish",
    password,
    uploadId: started.uploadId,
    fileIds,
  });
}

export async function downloadReviewPdf(reviewId, chunkCount, onProgress) {
  const total = Number(chunkCount);
  if (!total) throw new Error("This review needs to be re-saved");

  const parts = new Array(total);
  let finished = 0;
  await runPool(total, CONCURRENCY, async (index) => {
    const chunk = await withRetry(() => postToDrive({
      action: "getPdfChunk",
      reviewId,
      index,
    }));
    parts[index] = base64ToBytes(chunk.data || "");
    finished += 1;
    if (onProgress) onProgress(finished, total);
  });
  return concatBytes(parts);
}

async function runPool(count, limit, worker) {
  let cursor = 0;
  async function run() {
    while (cursor < count) {
      const index = cursor;
      cursor += 1;
      await worker(index);
    }
  }
  const workers = [];
  const width = Math.min(limit, count);
  for (let i = 0; i < width; i += 1) workers.push(run());
  await Promise.all(workers);
}

async function withRetry(fn) {
  let error;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      error = err;
    }
  }
  throw error;
}
