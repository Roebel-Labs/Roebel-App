/**
 * Flow Capture Script
 *
 * Walks through three multi-step flows in the Expo app on web and captures
 * one PNG per step at iPhone 15 Pro dimensions (393x852 @3x):
 *   1. Citizen Verification (reachable subset)
 *   2. Marketplace listing creation
 *   3. Org creation ("Starte durch in Röbel")
 *
 * Output: apps/expo/screenshots/flows/<citizen|markt|org>/NN_<name>.png
 *
 * Prerequisites:
 *   - Expo web running: npx expo start --web --port 8081
 *
 * Usage:
 *   npx tsx scripts/capture-flows.ts
 */

import { chromium, type Page, type Browser } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const BASE_URL = 'http://localhost:8081';
const ROOT_DIR = path.join(__dirname, '..', 'screenshots', 'flows');
const VIEWPORT = { width: 393, height: 852 };
const SETTLE_MS = 2500;

type RunLogEntry = {
  flow: string;
  step: number;
  name: string;
  route: string;
  ok: boolean;
  note?: string;
};

const runLog: RunLogEntry[] = [];

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function settle(page: Page, ms: number = SETTLE_MS): Promise<void> {
  await page.waitForTimeout(ms);
}

async function dismissConsentIfPresent(page: Page): Promise<void> {
  try {
    const consentBtn = page.getByText('Alle akzeptieren', { exact: true }).last();
    if (await consentBtn.isVisible({ timeout: 1500 })) {
      await consentBtn.tap({ force: true });
      await page.waitForTimeout(2000);
    }
  } catch {
    /* gate not present */
  }
}

/**
 * Expo dev LogBox / RedBox covers the screen on warnings/errors. Dismiss it
 * by clicking the close icon or pressing Escape so subsequent selectors work.
 */
async function dismissLogBoxIfPresent(page: Page): Promise<void> {
  try {
    // Most reliable: hide LogBox via JS by removing its DOM root.
    const dismissed = await page.evaluate(() => {
      const candidates = Array.from(
        document.querySelectorAll('[aria-modal], [role="dialog"], [data-testid*="LogBox"], [data-testid*="logbox"]')
      );
      let removed = 0;
      candidates.forEach((el) => {
        if (
          el.textContent?.includes('Console Error') ||
          el.textContent?.includes('Console Warning') ||
          el.textContent?.includes('LogBox')
        ) {
          (el as HTMLElement).style.display = 'none';
          removed++;
        }
      });
      // Also: top-level full-viewport overlays containing "Console Error" text
      document.querySelectorAll('div').forEach((el) => {
        const r = el.getBoundingClientRect();
        if (
          r.width >= window.innerWidth - 4 &&
          r.height >= window.innerHeight - 4 &&
          el.textContent?.includes('Console Error')
        ) {
          (el as HTMLElement).style.display = 'none';
          removed++;
        }
      });
      return removed;
    });
    if (dismissed > 0) {
      await page.waitForTimeout(300);
    }
  } catch {
    /* ignore */
  }
}

/**
 * SPA navigation: pushes a new URL into history and dispatches popstate so
 * expo-router picks it up — without a full page reload (which would re-mount
 * the consent gate, since SecureStore has no web persistence).
 */
async function gotoAndSettle(page: Page, route: string): Promise<void> {
  await page.evaluate((r) => {
    history.pushState(null, '', r);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, route);
  await settle(page);
  await dismissConsentIfPresent(page);
  await dismissLogBoxIfPresent(page);
}

async function snap(
  flow: string,
  flowDir: string,
  page: Page,
  step: number,
  name: string,
  route: string,
  note?: string
): Promise<void> {
  const filename = `${String(step).padStart(2, '0')}_${name}.png`;
  const filepath = path.join(flowDir, filename);
  try {
    await page.screenshot({ path: filepath, fullPage: false, type: 'png' });
    console.log(`  ✓ [${flow}] ${filename}`);
    runLog.push({ flow, step, name, route, ok: true, note });
  } catch (err) {
    console.error(`  ✗ [${flow}] ${filename} — ${err}`);
    runLog.push({ flow, step, name, route, ok: false, note: String(err) });
  }
}

async function fillByPlaceholder(page: Page, placeholder: string, value: string): Promise<boolean> {
  try {
    const locator = page.getByPlaceholder(placeholder).first();
    if ((await locator.count()) === 0) throw new Error('not found');
    await locator.scrollIntoViewIfNeeded({ timeout: 2000 }).catch(() => {});
    await locator.fill(value, { force: true, timeout: 4000 });
    await page.waitForTimeout(200);
    return true;
  } catch (err) {
    console.warn(`  ! could not fill placeholder "${placeholder}": ${(err as Error).message?.split('\n')[0]}`);
    return false;
  }
}

type FlowStep = [route: string, name: string];

async function runFlow(
  page: Page,
  flow: string,
  label: string,
  steps: FlowStep[]
): Promise<void> {
  const dir = path.join(ROOT_DIR, flow);
  ensureDir(dir);
  console.log(`\n=== ${label} ===`);
  for (let i = 0; i < steps.length; i++) {
    const [route, name] = steps[i];
    await gotoAndSettle(page, route);
    await snap(flow, dir, page, i + 1, name, route);
  }
}

// ---------------- Citizen Verification ----------------
async function captureCitizenFlow(page: Page): Promise<void> {
  await runFlow(page, 'citizen', 'Citizen Verification', [
    ['/profile', 'profile-entry'],
    ['/verification/request-citizen', 'request-citizen'],
    ['/verification/my-request', 'my-request-qr'],
    ['/verification/scan', 'scan'],
  ]);
  // Bonus: capture the request-citizen form filled with dummy data — fills work
  // here because it's a plain form (no Pressable navigation involved).
  const flow = 'citizen';
  const dir = path.join(ROOT_DIR, flow);
  await gotoAndSettle(page, '/verification/request-citizen');
  await fillByPlaceholder(page, 'Max Mustermann', 'Max Mustermann');
  await fillByPlaceholder(page, 'Musterstraße 123, 17207 Röbel', 'Musterstraße 12, 17207 Röbel');
  await fillByPlaceholder(
    page,
    'Ich bin Bürger von Röbel/Müritz und möchte an der Stadtentwicklung teilnehmen.',
    'Ich wohne in Röbel und möchte an der Stadtentwicklung teilnehmen.'
  );
  await page.keyboard.press('Tab');
  await settle(page, 800);
  await snap(flow, dir, page, 5, 'request-citizen-filled', '/verification/request-citizen');
  console.log('  · approve drawer & success modal skipped (require 2nd wallet)');
}

// ---------------- Marketplace Listing ----------------
async function captureMarketFlow(page: Page): Promise<void> {
  await runFlow(page, 'markt', 'Marketplace Listing', [
    ['/create-listing', 'intro'],
    ['/create-listing/type', 'type'],
    ['/create-listing/details', 'details'],
    ['/create-listing/pricing', 'pricing'],
    ['/create-listing/photos', 'photos'],
    ['/create-listing/location', 'location'],
    ['/create-listing/review', 'review'],
    ['/create-listing/success', 'success'],
  ]);
}

// ---------------- Org Creation "Starte durch in Röbel" ----------------
async function captureOrgFlow(page: Page): Promise<void> {
  await runFlow(page, 'org', 'Org Creation: Starte durch in Röbel', [
    ['/create-org', 'intro'],
    ['/create-org/type', 'type'],
    ['/create-org/info', 'info'],
    ['/create-org/location', 'location'],
    ['/create-org/contact', 'contact'],
    ['/create-org/photos', 'photos'],
    ['/create-org/review', 'review'],
    ['/create-org/success', 'success'],
  ]);
}

async function main() {
  ensureDir(ROOT_DIR);

  console.log('Launching headless Chromium at iPhone 15 Pro viewport...');
  const browser: Browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  });
  // Suppress noisy console.errors that trigger Expo's LogBox overlay
  // (these are warnings only — they don't break the capture flows).
  await context.addInitScript(() => {
    const SUPPRESS = [
      'usePostHog was called without',
      'PostHogProvider',
      'react-native/Libraries/LogBox',
    ];
    const origError = console.error;
    console.error = (...args: unknown[]) => {
      try {
        const text = args.map((a) => (typeof a === 'string' ? a : '')).join(' ');
        if (SUPPRESS.some((s) => text.includes(s))) return;
      } catch {}
      origError.apply(console, args as []);
    };
  });

  // Auto-hide Expo LogBox / RedBox via MutationObserver — runs on every document.
  await context.addInitScript(() => {
    const HIDE_PHRASES = ['Console Error', 'Console Warning', 'LogBox'];
    const hideOverlays = () => {
      document.querySelectorAll('div').forEach((el) => {
        const r = el.getBoundingClientRect();
        if (
          r.width >= window.innerWidth - 4 &&
          r.height >= window.innerHeight - 4 &&
          HIDE_PHRASES.some((p) => el.textContent?.includes(p))
        ) {
          (el as HTMLElement).style.display = 'none';
        }
      });
    };
    const start = () => {
      hideOverlays();
      const obs = new MutationObserver(hideOverlays);
      obs.observe(document.documentElement, { childList: true, subtree: true });
    };
    if (document.readyState !== 'loading') start();
    else document.addEventListener('DOMContentLoaded', start);
  });

  const page = await context.newPage();

  // Boot the app on a lightweight route + flip extended_mode + dismiss DSGVO consent gate
  await page.goto(`${BASE_URL}/create-listing`, { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(4000);
  await page.evaluate(() => {
    try {
      localStorage.setItem('extended_mode', 'true');
      // Pre-set consent so the gate doesn't block flow screens
      localStorage.setItem(
        'roebel:consent:v1',
        JSON.stringify({
          analytics: true,
          crashReporting: true,
          maps: true,
          ai: true,
          acceptedAt: new Date().toISOString(),
          version: 1,
        })
      );
    } catch {}
  });

  // If the consent gate is rendered, click the "Alle akzeptieren" button (exact match
   // — the same string appears in body copy too).
  try {
    const consentBtn = page.getByText('Alle akzeptieren', { exact: true }).last();
    if (await consentBtn.isVisible({ timeout: 3000 })) {
      await consentBtn.tap({ force: true });
      await page.waitForTimeout(2500);
      console.log('  · Dismissed DSGVO consent gate');
    }
  } catch {
    /* gate not present — fine */
  }
  await page.waitForTimeout(1000);

  try {
    await captureCitizenFlow(page);
  } catch (err) {
    console.error('Citizen flow crashed:', err);
  }

  try {
    await captureMarketFlow(page);
  } catch (err) {
    console.error('Marketplace flow crashed:', err);
  }

  try {
    await captureOrgFlow(page);
  } catch (err) {
    console.error('Org flow crashed:', err);
  }

  await browser.close();

  // Run log
  const logPath = path.join(ROOT_DIR, 'run-log.json');
  fs.writeFileSync(
    logPath,
    JSON.stringify(
      {
        capturedAt: new Date().toISOString(),
        viewport: VIEWPORT,
        deviceScaleFactor: 3,
        steps: runLog,
        summary: {
          total: runLog.length,
          succeeded: runLog.filter((e) => e.ok).length,
          failed: runLog.filter((e) => !e.ok).length,
        },
      },
      null,
      2
    )
  );

  const ok = runLog.filter((e) => e.ok).length;
  const fail = runLog.filter((e) => !e.ok).length;
  console.log(`\n========================================`);
  console.log(`Done. ${ok} captured, ${fail} failed.`);
  console.log(`Output: ${ROOT_DIR}`);
  console.log(`========================================`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
