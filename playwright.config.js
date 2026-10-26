// Tests de la sauvegarde. Local : npx playwright test. Site en ligne : BASE_URL=https://…/heaven-omega/ npx playwright test
const { defineConfig } = require('@playwright/test');
const live = !!process.env.BASE_URL;
module.exports = defineConfig({
  testDir: './tests', timeout: 60000, workers: 2, reporter: [['list']],
  use: { baseURL: process.env.BASE_URL || 'http://127.0.0.1:4173/', acceptDownloads: true },
  webServer: live ? undefined : { command: 'node tests/server.mjs', url: 'http://127.0.0.1:4173/index.html', reuseExistingServer: true },
});
