import { defineConfig } from 'wxt';
import { HOSTED_BACKEND_URL } from './lib/hosted';

export default defineConfig({
  manifest: {
    name: 'SoundCloud Listen Along (Unofficial)',
    description:
      'Listen to SoundCloud together in private, synchronized rooms.',
    incognito: 'not_allowed',
    permissions: ['activeTab', 'storage'],
    ...(HOSTED_BACKEND_URL
      ? { host_permissions: [`${HOSTED_BACKEND_URL}/*`] }
      : {}),
    optional_host_permissions: [
      'https://*/*',
      'http://localhost/*',
      'http://127.0.0.1/*',
    ],
    browser_specific_settings: {
      gecko: {
        id: 'soundcloud-listen-along@vladi245.github.io',
        strict_min_version: '140.0',
        // Self-distributed signed builds update from the public server.
        ...(HOSTED_BACKEND_URL
          ? { update_url: `${HOSTED_BACKEND_URL}/updates.json` }
          : {}),
        data_collection_permissions: {
          required: ['browsingActivity', 'websiteActivity'],
        },
      },
    },
  },
});
