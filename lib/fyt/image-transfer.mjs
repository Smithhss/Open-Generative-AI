import { imageBlob } from '../../packages/studio/src/utils/imageBlob.js';
import { validateLocalImageFile } from '../../packages/studio/src/localImage.js';

export async function generatedImageFile(entry) {
  // Transfers only use the inline raster payload returned by our image adapter.
  // No fetch of external or user-supplied URLs is needed between local editors.
  if (!entry || typeof entry.url !== 'string' || !/^data:image\/(png|jpeg|webp);base64,/.test(entry.url)) throw new Error('INVALID_TRANSFER_IMAGE');
  const blob = await imageBlob(entry.url);
  const extension = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[blob.type];
  const file = new File([blob], `fyt-image-${Date.now()}.${extension}`, { type: blob.type });
  validateLocalImageFile(file);
  return file;
}
