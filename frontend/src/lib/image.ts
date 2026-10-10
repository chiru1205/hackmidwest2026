export class UnsupportedImageError extends Error {
  constructor() { super("This photo format isn't supported here. Choose a JPEG or PNG, or take the photo with the camera."); }
}

const isHeic = (f: File) => /hei[cf]/i.test(f.type) || /\.hei[cf]$/i.test(f.name);

/** Compress an image file to JPEG, max edge ~1280px. Throws UnsupportedImageError for HEIC/HEIF or anything that cannot be decoded. */
export async function compressImage(file: File, maxEdge = 1280, quality = 0.8): Promise<Blob> {
  const plain = /^image\/(jpeg|png|webp)$/i.test(file.type);
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, maxEdge / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * scale)), h = Math.max(1, Math.round(bmp.height * scale));
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    c.getContext("2d")!.drawImage(bmp, 0, 0, w, h);
    bmp.close?.();
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", quality));
    if (blob && blob.size > 0) return blob;
  } catch { /* fall through */ }
  if (plain && !isHeic(file)) return file;   // a normal JPEG/PNG the browser could not re-encode is still fine to send
  throw new UnsupportedImageError();
}
