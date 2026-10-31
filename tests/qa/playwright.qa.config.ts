import { defineConfig, devices } from '@playwright/test';
import path from 'path';

// QA exploration against the LIVE deployment. This config deliberately has no webServer and no
// database wiring: the spec only drives the public site as a browser would.
const QA_BASE_URL = process.env.QA_BASE_URL || 'https://civic-pulse-cyan-ten.vercel.app';
const fixtures = path.resolve(__dirname, 'fixtures');

const cameraArgs = (video: string) => [
  '--use-fake-ui-for-media-stream',
  '--use-fake-device-for-media-stream',
  `--use-file-for-fake-video-capture=${path.join(fixtures, video)}`,
];

export default defineConfig({
  testDir: __dirname,
  testMatch: /citizen-explore\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 45 * 60 * 1000,
  reporter: [['list'], ['json', { outputFile: path.resolve(__dirname, '../../qa-evidence/citizen/playwright-results.json') }]],
  outputDir: path.resolve(__dirname, '../../qa-evidence/citizen/test-output'),
  use: {
    baseURL: QA_BASE_URL,
    headless: true,
    // Trace + video are recorded by the spec itself (tracing paused while credentials are typed).
    trace: 'off',
    video: 'off',
    bypassCSP: true,
    actionTimeout: 20000,
    navigationTimeout: 60000,
  },
  projects: [
    {
      name: 'desktop',
      grepInvert: /@recapture/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
        launchOptions: { args: cameraArgs('pothole.y4m') },
      },
    },
    {
      name: 'mobile',
      grepInvert: /@recapture/,
      use: {
        ...devices['Pixel 7'],
        launchOptions: { args: cameraArgs('pothole.y4m') },
      },
    },
    {
      name: 'desktop-recapture',
      grep: /@recapture/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
        launchOptions: { args: cameraArgs('laptop-screen.y4m') },
      },
    },
  ],
});
