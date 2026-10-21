export interface LatestRelease {
  version: string;
  download: string;
}

const versionPattern = /^\d+\.\d+\.\d+$/;

export function isNewerVersion(candidate: string, current: string): boolean {
  if (!versionPattern.test(candidate) || !versionPattern.test(current)) {
    return false;
  }
  const a = candidate.split('.').map(Number);
  const b = current.split('.').map(Number);
  for (let i = 0; i < 3; i += 1) {
    if (a[i] !== b[i]) return a[i] > b[i];
  }
  return false;
}

// Reads the server's version.json, written by `npm run release:hosted`.
export function parseLatestRelease(
  value: unknown,
  serverUrl: string,
): LatestRelease | null {
  if (typeof value !== 'object' || value === null) return null;
  const { version, download } = value as Record<string, unknown>;
  if (
    typeof version !== 'string' ||
    !versionPattern.test(version) ||
    typeof download !== 'string' ||
    !/^\/[\w.-]+$/.test(download)
  ) {
    return null;
  }
  return { version, download: new URL(download, serverUrl).toString() };
}
