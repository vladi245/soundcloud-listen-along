import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: 'SoundCloud Listen Along (Unofficial)',
    description:
      'Synchronize SoundCloud playback in self-hosted, private rooms.',
    permissions: ['activeTab', 'storage'],
    optional_host_permissions: ['https://*/*', 'http://localhost/*'],
    browser_specific_settings: {
      gecko: {
        id: 'soundcloud-listen-along@vladi245.github.io',
      },
    },
  },
});
