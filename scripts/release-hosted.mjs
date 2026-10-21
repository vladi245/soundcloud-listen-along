// Packages the extension for the public server: signs the Firefox build as an
// unlisted add-on, writes the Firefox update manifest, adds the Chromium zip,
// and deploys the server with those files.
//
// Signing needs AMO API credentials in .env.amo (AMO_JWT_ISSUER and
// AMO_JWT_SECRET). Without them only the Chromium package is published.
import { execFileSync } from 'node:child_process';
import {
  copyFile,
  mkdir,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { stderr, stdout } from 'node:process';

const root = path.resolve(import.meta.dirname, '..');
const assets = path.join(root, 'server/hosted-assets');
const output = path.join(root, '.output');
const run = (command, args) =>
  execFileSync(command, args, { cwd: root, stdio: 'inherit' });

const { version } = JSON.parse(
  await readFile(path.join(root, 'package.json'), 'utf8'),
);
const hosted = (await readFile(path.join(root, 'lib/hosted.ts'), 'utf8')).match(
  /'(https:\/\/[^']+)'/,
)?.[1];
if (!hosted) throw new Error('HOSTED_BACKEND_URL is not set in lib/hosted.ts');
const credentials = await readEnv(path.join(root, '.env.amo'));

run('npm', ['run', 'build:all']);
run('npm', ['run', 'zip']);
run('npm', ['run', 'zip:firefox']);
await mkdir(assets, { recursive: true });
await copyFile(
  path.join(output, `soundcloud-listen-along-${version}-chrome.zip`),
  path.join(assets, 'listen-along-chrome.zip'),
);
// Unpacked Chromium installs read this to offer updates.
await writeFile(
  path.join(assets, 'version.json'),
  `${JSON.stringify({ version, download: '/listen-along-chrome.zip' }, null, 2)}\n`,
);

if (credentials.AMO_JWT_ISSUER && credentials.AMO_JWT_SECRET) {
  const signed = path.join(output, 'signed');
  await rm(signed, { recursive: true, force: true });
  run('npx', [
    '--yes',
    'web-ext@10.8.0',
    'sign',
    '--channel=unlisted',
    `--source-dir=${path.join(output, 'firefox-mv3')}`,
    `--artifacts-dir=${signed}`,
    `--upload-source-code=${path.join(output, `soundcloud-listen-along-${version}-sources.zip`)}`,
    `--api-key=${credentials.AMO_JWT_ISSUER}`,
    `--api-secret=${credentials.AMO_JWT_SECRET}`,
    '--approval-timeout=1800000',
  ]);
  const xpi = (await readdir(signed)).find((name) => name.endsWith('.xpi'));
  if (!xpi) throw new Error('Signing produced no .xpi file');
  await copyFile(path.join(signed, xpi), path.join(assets, 'listen-along.xpi'));
  await copyFile(
    path.join(signed, xpi),
    path.join(assets, `listen-along-${version}.xpi`),
  );
  const { id } = JSON.parse(
    await readFile(path.join(output, 'firefox-mv3/manifest.json'), 'utf8'),
  ).browser_specific_settings.gecko;
  await writeFile(
    path.join(assets, 'updates.json'),
    `${JSON.stringify(
      {
        addons: {
          [id]: {
            updates: [
              {
                version,
                update_link: `${hosted}/listen-along-${version}.xpi`,
              },
            ],
          },
        },
      },
      null,
      2,
    )}\n`,
  );
} else {
  stderr.write(
    'No AMO credentials in .env.amo; publishing the Chromium package only.\n',
  );
}

for (const name of await readdir(assets)) {
  const { size } = await stat(path.join(assets, name));
  stdout.write(`hosted-assets/${name} (${size} bytes)\n`);
}
run('npm', ['--prefix', 'server', 'run', 'deploy:hosted']);

async function readEnv(file) {
  const text = await readFile(file, 'utf8').catch(() => '');
  return Object.fromEntries(
    text
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const index = line.indexOf('=');
        return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
      }),
  );
}
