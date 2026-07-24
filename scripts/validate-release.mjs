import { execFileSync } from 'node:child_process';
import { access, readFile } from 'node:fs/promises';
import process from 'node:process';

const packageJson = JSON.parse(await readFile('package.json', 'utf8'));
const version = packageJson.version;
if (!/^\d+\.\d+\.\d+$/.test(version)) {
  throw new Error(`Package version is not valid semver: ${version}`);
}

if (
  process.env.GITHUB_REF_TYPE === 'tag' &&
  process.env.GITHUB_REF_NAME !== `v${version}`
) {
  throw new Error(
    `Tag ${process.env.GITHUB_REF_NAME} does not match package version ${version}`,
  );
}

if (process.env.REQUIRE_RELEASE_TAG === '1') {
  const status = execFileSync('git', ['status', '--porcelain'], {
    encoding: 'utf8',
  }).trim();
  if (status) throw new Error('Release worktree is not clean');
  const tags = execFileSync('git', ['tag', '--points-at', 'HEAD'], {
    encoding: 'utf8',
  })
    .trim()
    .split('\n');
  if (!tags.includes(`v${version}`)) {
    throw new Error(`HEAD is not tagged v${version}`);
  }
}

for (const path of [
  '.output/chrome-mv3/manifest.json',
  '.output/firefox-mv3/manifest.json',
]) {
  const manifest = JSON.parse(await readFile(path, 'utf8'));
  if (manifest.version !== version) {
    throw new Error(
      `${path} has version ${manifest.version}, expected ${version}`,
    );
  }
}

for (const path of [
  `.output/soundcloud-listen-along-${version}-chrome.zip`,
  `.output/soundcloud-listen-along-${version}-firefox.zip`,
  `.output/soundcloud-listen-along-${version}-sources.zip`,
]) {
  await access(path);
}

process.stdout.write(`Release artifacts match v${version}.\n`);
