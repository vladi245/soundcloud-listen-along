export function normalizeBackendUrl(value: string): string | null {
  try {
    const url = new URL(value.trim());
    const local =
      url.hostname === 'localhost' ||
      url.hostname === '127.0.0.1' ||
      url.hostname === '[::1]';
    if (
      (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) ||
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash
    ) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

export function backendPermission(url: string): string {
  return `${url}/*`;
}

export function roomSocketUrl(backendUrl: string, roomCode: string): string {
  const url = new URL(`/rooms/${roomCode}/socket`, backendUrl);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.toString();
}

export function randomOpaqueId(size = 16): string {
  const bytes = crypto.getRandomValues(new Uint8Array(size));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
}
