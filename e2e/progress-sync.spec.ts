import { test, expect, type Page } from '@playwright/test';
import { assertNoNetworkLeak } from './helpers';

/**
 * UX-4 · progress sync, end to end.
 *
 * The DoD of UX-4 is one sentence — "progress survives a device change via the
 * sync code" — and it is the only claim in this wave that no unit test can make.
 * The backend suite proves the store is opaque, the Vitest suite proves the
 * crypto round-trips, and neither of them proves the product works: they never
 * meet across a real server, a real DB row, and two browsers that share nothing.
 * That gap is this file.
 *
 * "Device" here is a fresh BrowserContext — separate localStorage, separate
 * cookies, no shared state with its sibling beyond the server. That is exactly
 * the part of a device change that matters to this feature.
 */

const REVISIONS_KEY = 'discammer:lesson-revisions:v1';
const MODULE = 'threat-fundamentals';
const LESSON = 'attack-vectors';

/** Read the fact under test straight out of storage, not out of the DOM. */
async function lessonIsComplete(page: Page, revision: string): Promise<boolean> {
  const raw = await page.evaluate((k) => localStorage.getItem(k), REVISIONS_KEY);
  if (!raw) return false;
  try {
    return JSON.parse(raw)?.[`${MODULE}/${LESSON}@${revision}`] === true;
  } catch {
    return false;
  }
}

test('progress survives a device change via the sync code', async ({ browser }) => {
  const deviceA = await browser.newContext();
  const deviceB = await browser.newContext();

  try {
    const a = await deviceA.newPage();
    const manifestResponse = await a.request.get('/api/course/lesson-manifest?lang=en');
    expect(manifestResponse.ok()).toBe(true);
    const manifest = await manifestResponse.json() as { module_slug: string; slug: string; content_revision: string | null }[];
    const revision = manifest.find((lesson) => lesson.module_slug === MODULE && lesson.slug === LESSON)?.content_revision;
    expect(revision).toBeTruthy();

    // Everything device A puts on the wire, kept for the privacy assertions
    // below. Registered before the first navigation so nothing is missed.
    const wire: { url: string; body: string | null }[] = [];
    a.on('request', (req) => wire.push({ url: req.url(), body: req.postData() }));

    // --- Device A: finish a lesson the way a user does ----------------------
    // Seeding storage would test the sync code against a fixture. Clicking the
    // button tests it against the app.
    await a.goto(`/en/course/${MODULE}/${LESSON}`);
    const markComplete = a.getByRole('button', { name: /mark updated lesson complete/i });
    await expect(markComplete).toBeVisible({ timeout: 10_000 });
    await markComplete.click();
    await expect(a.getByRole('button', { name: /updated lesson complete/i })).toBeVisible();
    expect(await lessonIsComplete(a, revision!), 'device A never recorded the lesson').toBe(true);

    // --- Device A: create a code and link ------------------------------------
    await a.goto('/en/course');
    const createBtn = a.getByTestId('sync-create');
    await expect(createBtn).toBeVisible({ timeout: 10_000 });
    await createBtn.click();

    // The one moment the full code exists on screen. This is the only channel
    // the design gives a user for moving it between devices, so the test uses
    // that channel and no other.
    const code = (await a.getByTestId('sync-code-reveal').textContent())!.trim();
    expect(code, 'the revealed code is not a DSCM code').toMatch(/^DSCM-/);

    await a.getByTestId('sync-confirm-saved').click();
    await expect(a.getByTestId('sync-status')).toHaveText(/progress sent/i, { timeout: 15_000 });

    // --- What actually left device A ----------------------------------------
    // The wave's hard constraint, checked where it can no longer be arranged by
    // a mock: over a real socket, against a real server.
    const pushes = wire.filter((r) => r.url.includes('/api/sync/push'));
    expect(pushes.length, 'confirming the code never pushed anything').toBeGreaterThan(0);

    const body = JSON.parse(pushes[0].body!);
    expect(Object.keys(body).sort()).toEqual(['blob', 'blob_id']);
    expect(body.blob_id).toMatch(/^[0-9a-f]{64}$/);

    // The lesson slug is in the dossier; it must not be in the payload.
    expect(pushes[0].body!, 'the push carried readable progress').not.toContain(LESSON);
    // The code is the decryption key. It may never ride inside its own blob.
    const bare = code.replace(/^DSCM-/, '').replace(/-/g, '');
    expect(pushes[0].body!, 'the push carried the code itself').not.toContain(bare);

    // blob_id grants read + delete on the blob, so a URL is the wrong place for
    // it: nginx would log every one. It travels in the body or not at all.
    for (const req of wire) {
      expect(req.url, `blob_id leaked into a URL:\n${req.url}`).not.toContain(body.blob_id);
    }

    // --- Device B: a browser that has never seen this progress ---------------
    const b = await deviceB.newPage();
    await b.goto('/en/course');
    const codeInput = b.getByTestId('sync-code-input');
    await expect(codeInput).toBeVisible({ timeout: 10_000 });
    expect(await lessonIsComplete(b, revision!), 'device B was not a clean device').toBe(false);

    await codeInput.fill(code);
    await b.getByTestId('sync-link').click();
    await expect(b.getByTestId('sync-status')).toHaveText(/merged in/i, { timeout: 15_000 });
    await expect(b.getByTestId('sync-linked')).toBeVisible();

    // The claim, in storage…
    expect(await lessonIsComplete(b, revision!), 'the synced copy did not carry the lesson').toBe(true);

    // …and on the page the user would actually go look at. Storage alone could
    // be true while the app still showed the lesson as untouched.
    await b.goto(`/en/course/${MODULE}/${LESSON}`);
    await expect(b.getByRole('button', { name: /updated lesson complete/i })).toBeVisible({
      timeout: 10_000,
    });
  } finally {
    await deviceA.close();
    await deviceB.close();
  }
});

/**
 * Deliberately NOT here: "the checker ships nothing even on a device linked for
 * sync". That test lived here and was removed, because no repair could make it
 * mean what it claimed.
 *
 * It named a real threat — auto-push subscribes to progress events, so the day
 * someone routes a checker result through progress state, the text the user
 * pasted starts riding out inside a blob. But it reached for assertNoNetworkLeak,
 * which greps request bodies for plaintext needles, and the blob is AES-GCM
 * ciphertext that by construction never contains the plaintext of its own input.
 * The instrument cannot see the leak it was aimed at: it would have stayed green
 * straight through the failure. (It was also inert for two duller reasons — its
 * code constant was 25 chars where decodeCode demands 26, and ProgressSync mounts
 * only on /en/course while MessageChecker mounts only on /en/, so the auto-push
 * it meant to outlast never ran at all.)
 *
 * The guard now lives in frontend/src/utils/sync-client.test.ts, asserting the
 * dossier's key set and content BEFORE encryption — the last point where the
 * payload is still readable, and therefore the only place the check can fail
 * when it should. It is verified against an injected leak, not merely asserted.
 */

test('the no-leak guard itself can still fail', async ({ page }) => {
  // Every privacy claim in checker.spec.ts and inspector.spec.ts rests on
  // assertNoNetworkLeak throwing. Weaken it — an empty capture list, a loop that
  // never runs — and all of them stay green while proving nothing, silently. A
  // guard nothing verifies is a guard nobody can trust, so: hand it a request
  // that plainly leaks and require it to object.
  await page.goto('/en/');

  let threw = false;
  try {
    await assertNoNetworkLeak(page, ['canary-nonce-4f1c'], async () => {
      await page.evaluate(() =>
        fetch('/api/health?probe=canary-nonce-4f1c').catch(() => undefined),
      );
    });
  } catch {
    threw = true;
  }

  expect(threw, 'assertNoNetworkLeak accepted a request that carried the needle').toBe(true);
});
