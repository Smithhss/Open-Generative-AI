// crypto.randomUUID 只在安全上下文（HTTPS / localhost）可用。
// 预发是 HTTP + 自定义域名，工作台里多处用它生成 id，会直接抛
// "crypto.randomUUID is not a function"，导致生成成功却报错。
// 这里补一个等价实现，只在缺失时生效。
if (typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.randomUUID !== 'function') {
  const randomUUID = () => {
    const bytes = new Uint8Array(16);
    if (typeof globalThis.crypto.getRandomValues === 'function') {
      globalThis.crypto.getRandomValues(bytes);
    } else {
      for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
    }
    // RFC 4122 version 4
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  };
  try {
    Object.defineProperty(globalThis.crypto, 'randomUUID', { value: randomUUID, configurable: true, writable: true });
  } catch {
    // 极少数环境下 crypto 不可写，退而求其次挂到全局
    globalThis.crypto.randomUUID = randomUUID;
  }
}
