import { readFile } from 'node:fs/promises';
import { stdout } from 'node:process';

const chrome = await manifest('.output/chrome-mv3/manifest.json');
const firefox = await manifest('.output/firefox-mv3/manifest.json');

for (const [browser, value] of [
  ['Chromium', chrome],
  ['Firefox', firefox],
]) {
  assert(value.manifest_version === 3, `${browser} must use Manifest V3`);
  assert(
    value.incognito === 'not_allowed',
    `${browser} must exclude private browsing`,
  );
  assert(
    sameValues(value.permissions, ['activeTab', 'storage']),
    `${browser} has unexpected required permissions`,
  );
  assert(
    sameValues(value.optional_host_permissions, [
      'http://127.0.0.1/*',
      'http://localhost/*',
      'https://*/*',
    ]),
    `${browser} has unexpected optional hosts`,
  );
  assert(
    value.content_scripts?.[0]?.matches?.every(
      (match) =>
        match === 'https://soundcloud.com/*' ||
        match === 'https://*.soundcloud.com/*',
    ),
    `${browser} content script scope is too broad`,
  );
}

assert(
  typeof chrome.background?.service_worker === 'string',
  'Chromium service worker is missing',
);
assert(
  Array.isArray(firefox.background?.scripts),
  'Firefox background script is missing',
);
assert(
  firefox.browser_specific_settings?.gecko?.strict_min_version === '140.0',
  'Firefox minimum version is incorrect',
);
assert(
  sameValues(
    firefox.browser_specific_settings?.gecko?.data_collection_permissions
      ?.required,
    [
      'authenticationInfo',
      'browsingActivity',
      'personallyIdentifyingInfo',
      'websiteActivity',
    ],
  ),
  'Firefox data declarations are incomplete',
);

stdout.write('Generated manifests are valid.\n');

async function manifest(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

function sameValues(actual, expected) {
  return (
    Array.isArray(actual) &&
    actual.length === expected.length &&
    expected.every((value) => actual.includes(value))
  );
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
