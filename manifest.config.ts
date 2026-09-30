import { defineManifest } from '@crxjs/vite-plugin';

export default defineManifest({
  manifest_version: 3,
  name: 'ChillYWait',
  version: '1.6.5',
  description: 'Play minigames while Gemini thinks. Auto-activates on gemini.google.com.',
  icons: {
    '16': 'public/icons/icon16.png',
    '48': 'public/icons/icon48.png',
    '128': 'public/icons/icon128.png',
  },
  action: {
    default_popup: 'popup.html',
    default_title: 'ChillYWait',
    default_icon: {
      '16': 'public/icons/icon16.png',
      '48': 'public/icons/icon48.png',
    },
  },
  background: {
    service_worker: 'src/background/service-worker.ts',
    type: 'module',
  },
  permissions: ['storage'],
  host_permissions: [
    'https://gemini.google.com/*',
    'https://chillywait.onrender.com/*',
  ],
  content_scripts: [
    {
      matches: ['https://gemini.google.com/*'],
      js: ['src/content/bootstrap.ts'],
      run_at: 'document_idle',
    },
  ],
  web_accessible_resources: [
    {
      resources: ['overlay.html', 'assets/*'],
      matches: ['https://gemini.google.com/*'],
    },
  ],
});
