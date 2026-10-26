const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_HISTORY_BYTES = 16 * 1024 * 1024;
export function validateLocalImageFile(file) {
  if (!file || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('LOCAL_IMAGE_TYPE');
  if (!Number.isFinite(file.size) || file.size <= 0 || file.size > MAX_FILE_BYTES) throw new Error('LOCAL_IMAGE_SIZE');
}
export function validateLocalImageDimensions(width, height) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0 ||
      width > 8192 || height > 8192 || width * height > 16000000) throw new Error('LOCAL_IMAGE_DIMENSIONS');
}
export function limitDrawingHistory(stack, index, snapshot) {
  const next = [...stack.slice(0, index + 1), snapshot].slice(-20);
  let size = next.reduce((sum, value) => sum + value.length, 0);
  while (next.length && size > MAX_HISTORY_BYTES) size -= next.shift().length;
  return next;
}
export function loadLocalImage(file, { signal } = {}) {
  validateLocalImageFile(file);
  signal?.throwIfAborted();
  const url = URL.createObjectURL(file);
  let released = false;
  const release = () => { if (!released) { released = true; URL.revokeObjectURL(url); } };
  return new Promise((resolve, reject) => {
    const image = new Image();
    const cleanup = () => { image.onload = null; image.onerror = null; signal?.removeEventListener('abort', abort); };
    const fail = error => { cleanup(); release(); reject(error); };
    const abort = () => { fail(new DOMException('Import cancelled', 'AbortError')); image.src = ''; };
    image.onload = () => {
      try { validateLocalImageDimensions(image.naturalWidth, image.naturalHeight); }
      catch (error) { fail(error); return; }
      cleanup(); resolve({ image, url, release });
    };
    image.onerror = () => fail(new Error('LOCAL_IMAGE_DECODE'));
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) { abort(); return; }
    image.src = url;
  });
}

// A visible reference must retain its original File; never downgrade a stale edit to text-to-image.
export function resolveLocalReference(urls, files) {
  if (!urls.length) return null;
  const file = urls.length === 1 ? files.get(urls[0]) : null;
  if (!file) throw new Error('INVALID_REFERENCE_IMAGE');
  validateLocalImageFile(file);
  return file;
}
