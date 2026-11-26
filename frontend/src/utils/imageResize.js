// Photos from a phone are several megabytes. Sending one as-is would be refused by the server
// (and would make the map slow), so images are scaled down in the browser first.

export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
export const MAX_IMAGE_FILE_BYTES = 15 * 1024 * 1024;

/** Largest size that fits inside max x max and keeps the proportions. Never enlarges. */
export function fitWithin(width, height, max) {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export function validateImageFile(file) {
  if (!file) return "No file selected.";
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) return "Use a JPEG, PNG, WebP or GIF image.";
  if (file.size > MAX_IMAGE_FILE_BYTES) return `That image is ${(file.size / 1048576).toFixed(1)} MB; the limit is ${MAX_IMAGE_FILE_BYTES / 1048576} MB.`;
  return null;
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("That file could not be read as an image."));
    };
    img.src = url;
  });
}

/**
 * Scales the picture down and re-encodes it as JPEG.
 * @param {File} file
 * @param {{ maxSize?: number, quality?: number, maxChars?: number }} options
 *   maxChars = the largest data URL accepted (the server's limit is 700 000; stay well below it)
 * @returns {Promise<{ dataUrl: string, width: number, height: number, originalWidth: number, originalHeight: number, bytes: number }>}
 */
export async function resizeImageFile(file, { maxSize = 1280, quality = 0.82, maxChars = 450000 } = {}) {
  const problem = validateImageFile(file);
  if (problem) throw new Error(problem);

  const img = await loadImage(file);
  const originalWidth = img.naturalWidth || img.width;
  const originalHeight = img.naturalHeight || img.height;
  let size = maxSize;
  let q = quality;

  for (let attempt = 0; attempt < 8; attempt++) {
    const { width, height } = fitWithin(originalWidth, originalHeight, size);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("This browser cannot resize images.");
    ctx.fillStyle = "#ffffff"; // JPEG has no transparency
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    const dataUrl = canvas.toDataURL("image/jpeg", q);
    if (dataUrl.length <= maxChars) {
      return { dataUrl, width, height, originalWidth, originalHeight, bytes: Math.round((dataUrl.length * 3) / 4) };
    }
    // still too big: lower the quality first, then the size
    if (q > 0.5) q -= 0.12;
    else size = Math.round(size * 0.8);
  }
  throw new Error("This image is too detailed to shrink enough. Try a smaller picture.");
}

/** Reads an image as a data URL at (nearly) full quality, scaling down only when it is huge. For terrain maps. */
export async function prepareTerrainImage(file, { maxSize = 4096 } = {}) {
  const problem = validateImageFile(file);
  if (problem) throw new Error(problem);
  const img = await loadImage(file);
  const originalWidth = img.naturalWidth || img.width;
  const originalHeight = img.naturalHeight || img.height;

  const raw = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Failed to read the image."));
    reader.readAsDataURL(file);
  });

  const { width, height } = fitWithin(originalWidth, originalHeight, maxSize);
  if (width === originalWidth && height === originalHeight && file.size <= 8 * 1024 * 1024) {
    return { dataUrl: raw, width, height };
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return { dataUrl: raw, width: originalWidth, height: originalHeight };
  ctx.drawImage(img, 0, 0, width, height);
  return { dataUrl: canvas.toDataURL("image/jpeg", 0.9), width, height };
}
