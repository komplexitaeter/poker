import { test, expect } from '@playwright/test';
import { newPlayer, newV1Member } from './helpers';

/**
 * B-150: nginx sends every request under /api/v1/ to the front controller api/v1/index.php (location ^~ /api/v1/,
 * docs/api-v1-concept.md section 13; tests/e2e/setup.sh has the same block as the servers). No file of api/v1/ is
 * reachable on its own or delivered as source; the doc page /api/v1/ is plain HTML with a strict CSP.
 */

const DOC_CSP = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; base-uri 'none'; form-action 'none'";

test('files under /api/v1/ are never delivered or run on their own: 404 not_found from the router', async ({ request }) => {
  for (const path of ['/api/v1/routes.php', '/api/v1/lib_v1.php', '/api/v1/index.php', '/api/v1/../v1/routes.php',
                      '/api/v1/routes.php/x', '/api/v1/nothing', '/api/v1/team/', '/api/v1//team']) {
    const res = await request.get(path);
    const body = await res.text();
    expect(body, path).not.toContain('<?php');
    expect(res.status(), path).toBe(404);
    expect(JSON.parse(body), path).toMatchObject({ error: 'not_found' });
  }
  // the migration tools of the repo answer 404 by URL (CLI only)
  expect((await request.get('/tools/migration/common.php')).status()).toBe(404);
  expect((await request.get('/tools/migration/b150_item_keys.php')).status()).toBe(404);
});

test('the Authorization header reaches the router (key mode); other schemes fall back to the board headers', async ({ request }) => {
  const member = await newV1Member(request, 'V1 Nginx Auth');
  // Bearer pok_... is always the key mode, decided by the prefix alone: no fallback to valid board headers, also not
  // for a malformed or unknown key
  for (const key of ['pok_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', 'pok_A B', 'pok_', 'pok_abc', 'pok_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA x']) {
    const res = await request.get('/api/v1/team', { headers: { ...member.headers, Authorization: `Bearer ${key}` } });
    expect(res.status(), key).toBe(401);
    expect(await res.json(), key).toMatchObject({ error: 'invalid_key' });
  }
  // Basic (e.g. a proxy in front of staging) and Bearer without pok_ are ignored
  for (const authorization of ['Basic dXNlcjpwYXNz', 'Bearer pk_test']) {
    const res = await request.get('/api/v1/team', { headers: { ...member.headers, Authorization: authorization } });
    expect(res.status(), authorization).toBe(200);
  }
});

test('doc page /api/v1/: HTML from the table with CSP, only its own script file, no inline style, no data', async ({ request, browser }) => {
  for (const path of ['/api/v1/', '/api/v1']) {
    const res = await request.get(path);
    expect(res.status(), path).toBe(200);
    expect(res.headers()['content-type']).toBe('text/html; charset=utf-8');
    expect(res.headers()['content-security-policy']).toBe(DOC_CSP);
    expect(res.headers()['x-content-type-options']).toBe('nosniff');
    expect(res.headers()['referrer-policy']).toBe('no-referrer');
    const html = await res.text();
    // one script, from a file (scroll-spy, B-150 PR 5); no inline script, no inline style, no event handler attributes
    expect(html.match(/<script/gi)).toHaveLength(1);
    expect(html).toMatch(/<script src="\/script\/api_doc\.js\?v=\d+" defer><\/script>/);
    expect(html).not.toMatch(/\sstyle=|\son[a-z]+=|javascript:/i);
    expect(html).toMatch(/api-method-get">GET<\/span> <code class="api-path">\/api\/v1\/team<\/code>/);
    expect(html).toContain('href="/api/v1/openapi.json"');
    expect(html).toContain('Bearer &lt;API_KEY&gt;');
    expect(html).not.toContain('127.0.0.1'); // never built from the Host header
  }
  expect((await request.post('/api/v1/', { data: {} })).status()).toBe(405);

  // in a browser: the stylesheet loads under the CSP, nothing is blocked
  const page = await newPlayer(browser);
  const blocked: string[] = [];
  page.on('console', msg => { if (/Content Security Policy/i.test(msg.text())) blocked.push(msg.text()); });
  const css = page.waitForResponse(r => r.url().includes('/style/style.css'));
  await page.goto('/api/v1/');
  expect((await css).status()).toBe(200);
  await expect(page.locator('h1')).toHaveText('Agile Poker API v1');
  // body starts with opacity 0 for the board (script.js fades it in); the doc page has no JS and must show itself
  expect(await page.evaluate(() => getComputedStyle(document.body).opacity)).toBe('1');
  expect(blocked).toEqual([]);
});

test('doc page /api/v1/ designed (B-150 PR 5): logo, intro, table of contents, operation cards, light and dark, phones', async ({ browser }) => {
  const page = await newPlayer(browser);
  const blocked: string[] = [];
  page.on('console', msg => { if (/Content Security Policy|Refused/i.test(msg.text())) blocked.push(msg.text()); });
  page.on('pageerror', err => blocked.push(err.message));
  const failed: string[] = [];
  page.on('response', r => { if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`); });

  for (const scheme of ['dark', 'light'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    const logo = page.waitForResponse(r => r.url().includes(`/src/brand_${scheme}.svg`));
    await page.goto('/api/v1/');
    expect((await logo).status(), scheme).toBe(200);
    const img = page.locator('.api-doc-head img');
    await expect(img).toBeVisible();
    // the <picture> picked the logo of the scheme and it is decoded (naturalWidth > 0)
    expect(await img.evaluate((el: HTMLImageElement) => el.currentSrc), scheme).toContain(`brand_${scheme}.svg`);
    expect(await img.evaluate((el: HTMLImageElement) => el.naturalWidth), scheme).toBeGreaterThan(0);
    // the theme follows the system: page background of the app's dark / light tokens
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bg, scheme).toBe(scheme === 'dark' ? 'rgb(12, 14, 18)' : 'rgb(247, 246, 241)');
  }

  await expect(page.locator('h1')).toHaveText('Agile Poker API v1');
  await expect(page.locator('#key h2')).toHaveText('Get an API key');
  await expect(page.locator('#key')).toContainText('works only for this team and acts as you');
  await expect(page.locator('#jira')).toContainText('audit log');
  // the recipe: an issue becomes an item by its key (PUT /items/{key}, B-150 PR 4)
  await expect(page.locator('#jira')).toContainText('/api/v1/items/{{issue.key}}');
  await expect(page.locator('#jira')).toContainText('{"heading": "{{issue.summary.jsonEncode}}"}');
  await expect(page.locator('.api-doc-main a[href="/api/v1/openapi.json"]').first()).toBeVisible();

  // every operation card is in the table of contents (sidebar), the links lead to it
  const ids = await page.locator('section.api-op').evaluateAll(els => els.map(el => el.id));
  expect(ids.length).toBeGreaterThan(3);
  expect(ids).not.toContain('key_create'); // not public
  const side = page.locator('nav.api-toc-side');
  await expect(side).toBeVisible();
  await expect(page.locator('details.api-toc-top')).toBeHidden();
  for (const id of ids) await expect(side.locator(`a[href="#${id}"]`)).toHaveCount(1);
  const card = page.locator('#team_get');
  await expect(card.locator('.api-op-head .api-method')).toHaveText('GET');
  await expect(card.locator('.api-op-head .api-path')).toHaveText('/api/v1/team');
  await expect(card.locator('.api-auth')).toHaveText('API key');
  await expect(card.locator('pre.api-code').first()).toContainText('curl -X GET');
  await expect(page.locator('#team_create .api-auth')).toHaveText('No API key');
  await expect(page.locator('#team_join table.api-params')).toContainText('team_id');
  // the error codes of an operation link into the error table
  const errLinks = await card.locator('.api-op-errors a').evaluateAll(els => els.map(el => el.getAttribute('href')));
  expect(errLinks).toContain('#error-invalid_key');
  for (const href of errLinks) await expect(page.locator(href as string)).toHaveCount(1);

  // the sidebar stays in place while scrolling; jumping marks the section in view (scroll-spy, script/api_doc.js)
  await side.locator('a[href="#team_note_set"]').click();
  await expect(page).toHaveURL(/#team_note_set$/);
  await expect(page.locator('#team_note_set')).toBeInViewport();
  await expect(side).toBeInViewport();
  await expect(side.locator('a[aria-current="location"]')).toHaveAttribute('href', '#team_note_set');
  await expect(side.locator('a[aria-current]')).toHaveCount(1);
  await page.evaluate(() => document.getElementById('errors')!.scrollIntoView({ block: 'start' }));
  await expect(side.locator('a[aria-current="location"]')).toHaveAttribute('href', '#errors');

  // phone width: nothing sticks out of the page; tables and code scroll inside their card
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/api/v1/');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await expect(page.locator('.api-doc-head img')).toBeVisible();
  // phones: no sidebar; the contents fold open at the top and still jump
  await expect(page.locator('nav.api-toc-side')).toBeHidden();
  const top = page.locator('details.api-toc-top');
  await expect(top).toBeVisible();
  await expect(top.locator('a[href="#key_list"]')).toBeHidden();
  await top.locator('summary').click();
  await top.locator('a[href="#key_list"]').click();
  await expect(page.locator('#key_list')).toBeInViewport();
  const wrap = page.locator('#team_create .api-table');
  expect(await wrap.evaluate(el => getComputedStyle(el).overflowX)).toBe('auto');
  const box = await wrap.boundingBox();
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);

  expect(blocked).toEqual([]);
  expect(failed).toEqual([]);
});

test('doc page /api/v1/ without JavaScript: contents still jump, nothing marked', async ({ browser }) => {
  const page = await newPlayer(browser, { javaScriptEnabled: false });
  await page.goto('/api/v1/');
  await expect(page.locator('h1')).toHaveText('Agile Poker API v1');
  const side = page.locator('nav.api-toc-side');
  await side.locator('a[href="#key_delete"]').click();
  await expect(page).toHaveURL(/#key_delete$/);
  await expect(page.locator('#key_delete')).toBeInViewport();
  await expect(side.locator('a[aria-current]')).toHaveCount(0);
});
