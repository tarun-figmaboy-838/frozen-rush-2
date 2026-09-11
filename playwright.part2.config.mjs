/* A LIGHT RUNNER FOR PART 2, while a level is being built.
 *
 * The main config starts THREE servers — the dev server, the Vercel simulator and the
 * strict-case host — because the full suite checks the deployment as well as the game.
 * Part 2's specs check the game only, and on a machine short of memory spawning three
 * node servers plus a browser is what fails first: Windows kills one with 0xC0000409
 * and Playwright reports "webServer was not able to start", which looks like a broken
 * config rather than a full machine.
 *
 * So this starts the one server Part 2 actually needs. It is a DEVELOPMENT convenience
 * and deliberately not a replacement: `npx playwright test` still runs everything
 * against the real config before anything ships.
 *
 *   npx playwright test -c playwright.part2.config.mjs
 *
 * workers is 1 and not negotiable here. The game loads a 15MB art set per page and
 * composites a 1920x1080 canvas with no GPU; at higher concurrency the browsers are
 * killed mid-run and the failures read as assertion failures when they are not.
 */
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  /* ANY spec, not just Part 2's. This started as a Part-2-only runner and that was the
     wrong shape: what makes it useful is the single server, not the file list, and the
     specs most worth running after a gameplay change are the ones that were already
     here. The deploy checks (zzdeploy, zzcase, zzlive) need the other two servers and
     are skipped below rather than failed. */
  testIgnore: ['zzdeploy.spec.mjs', 'zzcase.spec.mjs', 'zzlive.spec.mjs'],
  timeout: 120_000,
  workers: 1,
  fullyParallel: false,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:8181',
    trace: 'off',
    video: 'off',
    screenshot: 'only-on-failure'
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1920, height: 1080 } } },
    { name: 'phone-landscape', use: { ...devices['Desktop Chrome'], viewport: { width: 844, height: 390 } } }
  ],
  webServer: {
    command: 'node tools/serve.mjs 8181',
    url: 'http://127.0.0.1:8181/index.html',
    reuseExistingServer: true,
    timeout: 30_000
  }
});
