import { test, expect, Page } from '@playwright/test';
import { newPlayer, createTeam, joinAsPlayer, getSid, bearer } from './helpers';

/**
 * B-150 PR 5 (docs/api-v1-concept.md, section 5.5): "API keys" in the You menu. A person creates, lists and deletes
 * their own keys of this team. The new key is shown exactly once (dialog with copy button), never stored in the
 * browser and never sent to analytics. Next to "Create key" and in the dialog: the key works only for this team and
 * acts as you, with links to the API docs and the OpenAPI spec.
 */
const LARGE = { width: 1280, height: 900 };
const KEY = /^pok_[A-Z2-7]{32}$/;

async function openYou(page: Page) {
  await page.locator('#user_settings_btn').click();
  await expect(page.locator('#user_settings_box')).toBeVisible();
}

async function boardWithAlice(browser: import('@playwright/test').Browser, team: string) {
  const page = await newPlayer(browser, { viewport: LARGE, permissions: ['clipboard-read', 'clipboard-write'] });
  const url = await createTeam(page, team);
  await joinAsPlayer(page, url, 'Alice');
  const t = new URL(url).searchParams.get('t')!;
  return { page, t, headers: { 'X-Poker-User': await getSid(page), 'X-Poker-Team': t } };
}

test('create a key: shown once with copy, scope text and links, not stored, works against /api/v1/team', async ({ browser }) => {
  const { page } = await boardWithAlice(browser, 'Keys UI Create');
  // everything the page sends to analytics (URL and body)
  const measured: string[] = [];
  page.on('request', r => {
    if (r.url().includes('measure_event')) measured.push(r.url() + ' ' + (r.postData() ?? ''));
  });

  await openYou(page);
  const box = page.locator('#api_keys');
  await expect(box.getByRole('heading', { name: 'API keys' })).toBeVisible();
  // empty state, scope sentence with the team name and both links
  await expect(page.locator('#api_keys_empty')).toHaveText(/^No API keys yet\./);
  await expect(page.locator('#api_keys_scope')).toHaveText(
    'This key works only for team Keys UI Create and acts as you. See the API docs · OpenAPI spec');
  await expect(page.locator('#api_keys_scope a', { hasText: 'API docs' })).toHaveAttribute('href', './api/v1/');
  await expect(page.locator('#api_keys_scope a', { hasText: 'OpenAPI spec' })).toHaveAttribute('href', './api/v1/openapi.json');

  // the button waits for a name
  const create = page.locator('#api_key_create');
  await expect(create).toBeDisabled();
  await page.locator('#api_key_name').fill('Jira');
  await expect(create).toBeEnabled();
  await create.click();

  const dialog = page.locator('dialog#api_key_new');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'Your new API key' })).toBeVisible();
  await expect(page.locator('#api_key_new_text')).toContainText('it is shown only once');
  await expect(page.locator('#api_key_new_text')).toContainText('only for team Keys UI Create and acts as you');
  await expect(dialog.getByRole('link', { name: 'API docs' })).toHaveAttribute('href', './api/v1/');
  await expect(dialog.getByRole('link', { name: 'OpenAPI spec' })).toHaveAttribute('href', './api/v1/openapi.json');
  const key = await page.locator('#api_key_value').inputValue();
  expect(key).toMatch(KEY);
  await expect(page.locator('#api_key_name')).toHaveValue('');

  // copy: the key is in the clipboard, the button confirms
  await page.locator('#api_key_copy').click();
  await expect(page.locator('#api_key_copy')).toHaveText('Copied');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(key);

  // never stored in the browser, never sent to analytics
  const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }));
  expect(stored).not.toContain(key);
  expect(stored).not.toContain(key.slice(4));
  await expect.poll(() => measured.some(m => m.includes('API_KEY_CREATED'))).toBe(true);
  expect(measured.join('\n')).not.toContain(key.slice(4));

  // the key works as Alice in this team
  const res = await page.request.get('/api/v1/team', { headers: bearer(key) });
  expect(res.status()).toBe(200);
  expect(await res.json()).toMatchObject({ team: { name: 'Keys UI Create' }, member: { name: 'Alice' } });

  // Done: the key is gone from the page; the list shows name, hint and dates
  await page.locator('#api_key_done').click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('#api_key_value')).toHaveValue('');
  expect(await page.content()).not.toContain(key);
  const row = page.locator('#api_keys_list > li');
  await expect(row).toHaveCount(1);
  await expect(row.locator('.api-key-name')).toHaveText('Jira');
  await expect(row.locator('.api-key-hint')).toHaveText('••••' + key.slice(-4));
  await expect(row.locator('.api-key-meta')).toHaveText(/^Created today · (never used|last used today)$/);
  await expect(page.locator('#api_keys_empty')).toBeHidden();

  // reopened later: "last used" from the call above
  await page.locator('#user_settings_btn').click();
  await expect(page.locator('#user_settings_box')).toBeHidden();
  await openYou(page);
  await expect(row.locator('.api-key-meta')).toHaveText('Created today · last used today');
});

test('Escape closes the key dialog, the menu stays open', async ({ browser }) => {
  const { page } = await boardWithAlice(browser, 'Keys UI Escape');
  await openYou(page);
  await page.locator('#api_key_name').fill('Script');
  await page.locator('#api_key_name').press('Enter'); // Enter creates as well
  await expect(page.locator('dialog#api_key_new')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('dialog#api_key_new')).toBeHidden();
  await expect(page.locator('#api_key_value')).toHaveValue('');
  await expect(page.locator('#user_settings_box')).toBeVisible();
  await expect(page.locator('#api_keys_list > li')).toHaveCount(1);
});

test('delete a key: asks first, Keep cancels, Delete removes it and the key stops working', async ({ browser }) => {
  const { page, headers } = await boardWithAlice(browser, 'Keys UI Delete');
  const created = await (await page.request.post('/api/v1/keys', { headers, data: { name: 'Old script' } })).json();
  await openYou(page);
  const row = page.locator('#api_keys_list > li');
  await expect(row).toHaveCount(1);

  await row.getByRole('button', { name: 'Delete key: Old script' }).click();
  await expect(row).toContainText('Delete key “Old script”? Tools using it stop working right away.');
  await row.getByRole('button', { name: 'Keep' }).click();
  await expect(row).not.toContainText('Tools using it');
  expect((await page.request.get('/api/v1/team', { headers: bearer(created.key) })).status()).toBe(200);

  await row.getByRole('button', { name: 'Delete key: Old script' }).click();
  await row.locator('[data-key-act="delete-sure"]').click();
  await expect(page.locator('#toast')).toHaveText('Key deleted');
  await expect(row).toHaveCount(0);
  await expect(page.locator('#api_keys_empty')).toBeVisible();
  expect((await page.request.get('/api/v1/team', { headers: bearer(created.key) })).status()).toBe(401);
});

test('limit reached and network error show an error toast, nothing is shown as a key', async ({ browser }) => {
  const { page, headers } = await boardWithAlice(browser, 'Keys UI Limit');
  for (let i = 1; i <= 20; i++) {
    expect((await page.request.post('/api/v1/keys', { headers, data: { name: `Key ${i}` } })).status()).toBe(201);
  }
  await openYou(page);
  await expect(page.locator('#api_keys_list > li')).toHaveCount(20);
  await page.locator('#api_key_name').fill('One more');
  await page.locator('#api_key_create').click();
  await expect(page.locator('#toast')).toHaveText(/Limit reached – delete a key first/);
  await expect(page.locator('#toast')).toHaveClass(/toast-error/);
  await expect(page.locator('dialog#api_key_new')).toBeHidden();
  await expect(page.locator('#api_keys_list > li')).toHaveCount(20);

  // network gone: "Not created"
  await page.route('**/api/v1/keys', route => route.request().method() === 'POST' ? route.abort() : route.continue());
  await page.locator('#api_key_name').fill('Offline');
  await page.locator('#api_key_create').click();
  await expect(page.locator('#toast')).toHaveText('Not created – please try again');
  await expect(page.locator('dialog#api_key_new')).toBeHidden();
});
