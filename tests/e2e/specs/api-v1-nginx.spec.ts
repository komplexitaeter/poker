import { test, expect } from '@playwright/test';
import { newPlayer, newV1Member } from './helpers';

/**
 * B-150: nginx sends every request under /api/v1/ to the front controller api/v1/index.php (location ^~ /api/v1/,
 * docs/api-v1-concept.md section 13; tests/e2e/setup.sh has the same block as the servers). No file of api/v1/ is
 * reachable on its own or delivered as source; the doc page /api/v1/ is plain HTML with a strict CSP.
 */

const DOC_CSP = "default-src 'none'; style-src 'self'; img-src 'self'; base-uri 'none'; form-action 'none'";

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
  // for a malformed key (keys come with B-150 PR 2)
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

test('doc page /api/v1/: HTML from the table with CSP, no script, no inline style, no data', async ({ request, browser }) => {
  for (const path of ['/api/v1/', '/api/v1']) {
    const res = await request.get(path);
    expect(res.status(), path).toBe(200);
    expect(res.headers()['content-type']).toBe('text/html; charset=utf-8');
    expect(res.headers()['content-security-policy']).toBe(DOC_CSP);
    expect(res.headers()['x-content-type-options']).toBe('nosniff');
    expect(res.headers()['referrer-policy']).toBe('no-referrer');
    const html = await res.text();
    expect(html).not.toMatch(/<script|\sstyle=|\son[a-z]+=/i);
    expect(html).toContain('GET /api/v1/team');
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
  expect(blocked).toEqual([]);
});
