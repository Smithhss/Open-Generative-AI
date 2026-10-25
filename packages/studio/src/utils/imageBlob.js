// Inline generation results must not use fetch(data:) under the fyt CSP.
export async function imageBlob(url) {
  if (typeof url === 'string' && url.startsWith('data:')) {
    const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(url);
    if (!match || match[2].length > 28 * 1024 * 1024) throw new Error('Invalid inline image');
    const raw = atob(match[2]);
    return new Blob([Uint8Array.from(raw, char => char.charCodeAt(0))], { type: match[1] });
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error('Image download failed');
  return response.blob();
}
