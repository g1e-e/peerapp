// Shared limits for sending a PDF through Apps Script in pieces.
// Each chunk is about 5 MB of the file itself. Base64 makes the request a bit larger.
// Apps Script cannot store a blob bigger than about 45 MB.

export const CHUNK_BYTES = 5 * 1024 * 1024;
export const MAX_PDF_BYTES = 45 * 1024 * 1024;

export function isPdfFile(file) {
  if (!file) return false;
  if (file.type === "application/pdf") return true;
  return file.name.toLowerCase().endsWith(".pdf");
}

export function uint8ToBase64(bytes) {
  let binary = "";
  const block = 0x8000;
  for (let index = 0; index < bytes.length; index += block) {
    binary += String.fromCharCode(...bytes.subarray(index, index + block));
  }
  return btoa(binary);
}

export function base64ToBytes(data) {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export function concatBytes(parts) {
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}
