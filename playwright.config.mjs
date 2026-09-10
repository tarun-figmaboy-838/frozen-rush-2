import { defineConfig, devices } from '@playwright/test';

/* The game is a fixed 1920x1080 backbuffer letterboxed into a 16:9 stage, so the
   tests run at that size and at a phone landscape size — the two shapes that matter.
   The server is started for the run and torn down after it. */
export default defineConfig({
  testDir: './tests',
  // the game preloads its art set before it will run; a per-test 30s is too tight
  timeout: 120_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:8181',
    // Video and trace recording made the page run slower than real time, which was
    // itself causing timeouts, and left 250MB in test-results. A failure screenshot
    // is enough day to day; ask for the rest with --trace on when chasing something.
    trace: process.env.CI ? 'retain-on-failure' : 'off',
    video: 'off',
    screenshot: 'only-on-failure'
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1920, height: 1080 } } },
    { name: 'phone-landscape', use: { ...devices['Desktop Chrome'], viewport: { width: 844, height: 390 } } }
  ],
  webServer: [
    {
      command: 'node tools/serve.mjs 8181',
      url: 'http://127.0.0.1:8181/index.html',
      reuseExistingServer: true,
      timeout: 30_000
    },
    {
      // The deploy check (zzdeploy.spec.mjs) needs the Vercel simulator, which serves
      // the repo root under the real vercel.json. It used to be started by hand, so
      // the check only ran when someone remembered to.
      //
      // reuseExistingServer is false ON PURPOSE, unlike the dev server above: the sim
      // reads vercel.json once at startup, so a leftover process from an earlier run
      // keeps serving the OLD routing and the test passes against a config that no
      // longer exists. That is exactly how a broken deploy shipped. Fail loudly on a
      // busy port instead.
      command: 'node tools/zzvercel-sim.mjs root 8201',
      url: 'http://127.0.0.1:8201/game/',
      reuseExistingServer: false,
      timeout: 30_000
    },
    {
      /* The STRICT-CASE host, for zzcase.spec.mjs. That test has always fetched
         127.0.0.1:8321 and nothing here ever listened there, so it could only fail
         with ERR_CONNECTION_REFUSED — a missing server reported as a case bug on
         every run. Vercel serves from case-sensitive Linux and development happens on
         case-insensitive Windows, which makes this the one deploy fault nothing local
         could otherwise reproduce, so the server is now part of the run.

         reuseExistingServer is true, unlike the Vercel sim: this one reads no config,
         so a leftover process cannot serve stale routing. */
      command: 'node tools/zzcase-serve.mjs 8321',
      url: 'http://127.0.0.1:8321/index.html',
      reuseExistingServer: true,
      timeout: 30_000
    }
  ]
});
