import { test, expect, Page, Request } from '@playwright/test';
import { newPlayer, createTeam, joinAsPlayer } from './helpers';

/**
 * B-57 "Ideas & Bugs", frontend part: the feedback panel with the tabs "Send feedback" (type, bug context,
 * toast) and "Backlog" (public list with status badge and reactions).
 */

const unique = (prefix: string) => `${prefix} ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Board with one player; returns the team id. */
async function boardWithPlayer(page: Page, name: string): Promise<string> {
  const url = await createTeam(page, 'FeedbackTeam');
  await joinAsPlayer(page, url, name);
  return new URL(url).searchParams.get('t') as string;
}

async function openFeedback(page: Page) {
  await page.locator('#feedback_btn').click();
  await expect(page.locator('dialog#menu[open] #feedback_box')).toBeVisible();
}

/** Creates a visible entry of the public list through stats.php (in a separate page, the board stays as it is). */
async function createItem(page: Page, title: string, description: string) {
  const admin = await page.context().newPage();
  await admin.goto('/stats.php');
  const form = admin.locator('form.rm').last();   // the "new entry" form
  await form.locator('input[name=title]').fill(title);
  await form.locator('textarea[name=description]').fill(description);
  await form.locator('select[name=status]').selectOption('PLANNED');
  await form.locator('input[name=sort_order]').fill('-1000');
  await form.locator('button[type=submit]').click();
  await expect.poll(() => admin.locator('form.rm input[name=title]')
    .evaluateAll((els, t) => els.some(e => (e as HTMLInputElement).value === t), title)).toBe(true);
  await admin.close();
}

test('feedback tabs: click and arrow keys, the panel reopens on "Send feedback"', async ({ browser }) => {
  const page = await newPlayer(browser);
  await boardWithPlayer(page, 'Tabby');
  await openFeedback(page);

  const send = page.locator('#fb_tab_send');
  const backlog = page.locator('#fb_tab_backlog');
  await expect(send).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#fb_panel_send')).toBeVisible();
  await expect(page.locator('#fb_panel_backlog')).toBeHidden();

  await backlog.click();
  await expect(backlog).toHaveAttribute('aria-selected', 'true');
  await expect(send).toHaveAttribute('aria-selected', 'false');
  await expect(page.locator('#fb_panel_backlog')).toBeVisible();
  await expect(page.locator('#fb_panel_send')).toBeHidden();

  await backlog.focus();
  await page.keyboard.press('ArrowRight');   // wraps around to the first tab
  await expect(send).toBeFocused();
  await expect(send).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#fb_panel_send')).toBeVisible();
  await page.keyboard.press('ArrowLeft');
  await expect(backlog).toBeFocused();
  await expect(page.locator('#fb_panel_backlog')).toBeVisible();

  // close on the backlog tab, reopen: "Send feedback" again
  await page.keyboard.press('Escape');
  await expect(page.locator('dialog#menu')).not.toHaveAttribute('open');
  await openFeedback(page);
  await expect(send).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#fb_panel_send')).toBeVisible();
  await expect(page.locator('#feedback_txt')).toBeFocused();
});

test('send feedback: type and bug context (no team id, no name) are sent, empty text is not, toast', async ({ browser }) => {
  const page = await newPlayer(browser);
  const t = await boardWithPlayer(page, 'Bugsy');
  const requests: Request[] = [];
  page.on('request', r => { if (r.url().includes('/api/feedback.php')) requests.push(r); });

  await openFeedback(page);
  const txt = page.locator('#feedback_txt');
  const sendBtn = page.getByRole('button', { name: 'Send feedback' });

  // placeholder per type
  await expect(page.locator('input[name=fb_type][value=OTHER]')).toBeChecked();
  await expect(txt).toHaveAttribute('placeholder', 'Anything on your mind?');
  await page.locator('#fb_type label', { hasText: 'Bug' }).click();
  await expect(txt).toHaveAttribute('placeholder', 'What happened? What did you expect?');
  await page.locator('#fb_type label', { hasText: 'Feature' }).click();
  await expect(txt).toHaveAttribute('placeholder', 'What would help your team?');
  await page.locator('#fb_type label', { hasText: 'Bug' }).click();

  // empty (or blank) text: nothing is sent, the panel stays open
  await txt.fill('   ');
  await sendBtn.click();
  await expect(page.locator('dialog#menu[open]')).toBeVisible();
  await expect(txt).toBeFocused();
  expect(requests).toHaveLength(0);

  const text = unique('Cards & <b>flicker</b> #2');
  await txt.fill(text);
  const [request] = await Promise.all([
    page.waitForRequest(r => r.url().includes('/api/feedback.php')),
    sendBtn.click(),
  ]);
  expect(request.method()).toBe('POST');
  const params = new URL(request.url()).searchParams;
  expect(params.get('type')).toBe('BUG');
  expect(params.get('text')).toBe(text);
  expect(params.get('t')).toBeNull();
  const raw = params.get('context') as string;
  expect(raw.length).toBeLessThanOrEqual(500);
  expect(raw).not.toContain(t);
  expect(raw).not.toContain('Bugsy');
  expect(raw).not.toContain('FeedbackTeam');
  const context = JSON.parse(raw);
  expect(Object.keys(context).sort()).toEqual(['browser', 'theme', 'touch', 'version', 'window']);
  expect(context.browser).toContain('Chrome');
  expect(context.window).toBe('1280x900');
  expect(context.touch).toBe(false);
  expect(context.version).toMatch(/^js \d+\.\d+, css \d+\.\d+$/);
  expect(['light', 'dark']).toContain(context.theme);

  await expect(page.locator('#toast')).toHaveText('Thanks – we read every message.');
  await expect(page.locator('#toast')).toHaveClass(/toast-on/);
  await expect(page.locator('dialog#menu')).not.toHaveAttribute('open');

  // stored with type and context (stats.php shows the inbox)
  const admin = await page.context().newPage();
  await admin.goto('/stats.php');
  const row = admin.locator('tr.feedback_row').filter({ has: admin.locator('td.fb_text', { hasText: text }) });
  await expect(row.locator('td').nth(1)).toHaveText('BUG');
  await expect(row.locator('td.fb_context')).toHaveText(raw);
  await admin.close();

  // reopened: type is back to "Other", text empty; non-bugs carry no context
  await openFeedback(page);
  await expect(page.locator('input[name=fb_type][value=OTHER]')).toBeChecked();
  await expect(txt).toHaveValue('');
  await expect(txt).toHaveAttribute('placeholder', 'Anything on your mind?');
  await txt.fill('An idea');
  await page.locator('#fb_type label', { hasText: 'Feature' }).click();
  const [second] = await Promise.all([
    page.waitForRequest(r => r.url().includes('/api/feedback.php')),
    sendBtn.click(),
  ]);
  const p2 = new URL(second.url()).searchParams;
  expect(p2.get('type')).toBe('FEATURE');
  expect(p2.get('context')).toBeNull();
  expect(requests).toHaveLength(2);
});

test('backlog: seed entry with badge, titles as text, reactions set / change / remove', async ({ browser }) => {
  const page = await newPlayer(browser);
  await boardWithPlayer(page, 'Voter');
  const title = unique('Sort <b>by</b> name & "more"');
  const description = 'Shown <i>as text</i>';
  await createItem(page, title, description);

  await openFeedback(page);
  await page.locator('#fb_tab_backlog').click();

  const seed = page.locator('#fb_backlog li.fb-item').filter({ has: page.locator('.fb-title', { hasText: /^New look$/ }) });
  await expect(seed).toHaveCount(1);
  await expect(seed.locator('.fb-status')).toHaveText('done ✅');
  await expect(seed.locator('.fb-status')).toHaveAttribute('data-status', 'DONE');
  await expect(page.locator('#fb_backlog_empty')).toBeHidden();

  const item = page.locator('#fb_backlog li.fb-item').filter({ has: page.locator('.fb-title', { hasText: title }) });
  await expect(item.locator('.fb-title')).toHaveText(title);   // markup stays text
  await expect(item.locator('.fb-title b')).toHaveCount(0);
  await expect(item.locator('.fb-desc')).toHaveText(description);
  await expect(item.locator('.fb-desc i')).toHaveCount(0);
  await expect(item.locator('.fb-status')).toHaveText('planned');
  await expect(item.locator('.fb-status')).toHaveAttribute('data-status', 'PLANNED');

  const love = item.locator('.fb-react-btn[data-reaction=UP]');
  const meh = item.locator('.fb-react-btn[data-reaction=DOWN]');
  await expect(love).toHaveAttribute('aria-pressed', 'false');
  await expect(love.locator('.fb-count')).toHaveText('0');
  await expect(meh.locator('.fb-count')).toHaveText('0');

  // set
  const [vote] = await Promise.all([
    page.waitForRequest(r => r.url().includes('/api/vote_roadmap.php')),
    love.click(),
  ]);
  expect(vote.method()).toBe('POST');
  expect(new URL(vote.url()).searchParams.get('reaction')).toBe('UP');
  await expect(love).toHaveAttribute('aria-pressed', 'true');
  await expect(love.locator('.fb-count')).toHaveText('1');
  await expect(meh).toHaveAttribute('aria-pressed', 'false');
  await expect(love).toBeEnabled();

  // change
  await meh.click();
  await expect(meh).toHaveAttribute('aria-pressed', 'true');
  await expect(love).toHaveAttribute('aria-pressed', 'false');
  await expect(love.locator('.fb-count')).toHaveText('0');
  await expect(meh.locator('.fb-count')).toHaveText('1');

  // a second user sees the counts, not the reaction of the first one
  const other = await newPlayer(browser);
  await boardWithPlayer(other, 'Other');
  await openFeedback(other);
  await other.locator('#fb_tab_backlog').click();
  const otherItem = other.locator('#fb_backlog li.fb-item').filter({ has: other.locator('.fb-title', { hasText: title }) });
  await expect(otherItem.locator('.fb-react-btn[data-reaction=DOWN] .fb-count')).toHaveText('1');
  await expect(otherItem.locator('.fb-react-btn[data-reaction=DOWN]')).toHaveAttribute('aria-pressed', 'false');

  // remove (the same reaction again)
  const [remove] = await Promise.all([
    page.waitForRequest(r => r.url().includes('/api/vote_roadmap.php')),
    meh.click(),
  ]);
  expect(new URL(remove.url()).searchParams.get('reaction')).toBe('NONE');
  await expect(meh).toHaveAttribute('aria-pressed', 'false');
  await expect(meh.locator('.fb-count')).toHaveText('0');

  // reopened later: loaded again, the state from the server
  await page.keyboard.press('Escape');
  await openFeedback(page);
  await page.locator('#fb_tab_backlog').click();
  await expect(item.locator('.fb-react-btn[aria-pressed=true]')).toHaveCount(0);
  await expect(meh.locator('.fb-count')).toHaveText('0');
});

test('backlog while loading: no "Nothing here yet." flash; a pull update leaves the open panel alone', async ({ browser }) => {
  const page = await newPlayer(browser);
  const url = await createTeam(page, 'PullTeam');
  await joinAsPlayer(page, url, 'Reader');

  let release: () => void = () => {};
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/get_roadmap.php*', async route => { await gate; await route.continue(); });

  await openFeedback(page);
  await page.locator('#fb_tab_backlog').click();
  await expect(page.locator('#fb_backlog')).toHaveAttribute('aria-busy', 'true');
  await expect(page.locator('#fb_backlog_empty')).toBeHidden();
  release();
  await expect(page.locator('#fb_backlog li.fb-item').first()).toBeVisible();
  await expect(page.locator('#fb_backlog')).not.toHaveAttribute('aria-busy', 'true');
  await expect(page.locator('#fb_backlog_empty')).toBeHidden();

  // another player joins (pull to all boards): the panel stays open on the backlog tab
  const other = await newPlayer(browser);
  await joinAsPlayer(other, url, 'Joiner');
  await expect(page.locator('#cbox .c')).toHaveCount(2);
  await expect(page.locator('dialog#menu[open] #fb_panel_backlog')).toBeVisible();
  await expect(page.locator('#fb_tab_backlog')).toHaveAttribute('aria-selected', 'true');
});

test('start page: backlog is shown, reactions are disabled with a hint', async ({ browser }) => {
  const page = await newPlayer(browser);
  await page.goto('/');
  await openFeedback(page);
  await page.locator('#fb_tab_backlog').click();

  const seed = page.locator('#fb_backlog li.fb-item').filter({ has: page.locator('.fb-title', { hasText: /^New look$/ }) });
  await expect(seed.locator('.fb-status')).toHaveText('done ✅');
  await expect(seed.locator('.fb-react-btn')).toHaveCount(2);
  for (const btn of await seed.locator('.fb-react-btn').all()) await expect(btn).toBeDisabled();
  await expect(page.locator('#fb_react_hint')).toHaveText('Join a board to react.');
  await expect(page.locator('#fb_react_hint')).toBeVisible();

  // sending works on the start page as well, with the toast
  await page.locator('#fb_tab_send').click();
  await page.locator('#feedback_txt').fill('From the start page');
  await Promise.all([
    page.waitForRequest(r => r.url().includes('/api/feedback.php')),
    page.getByRole('button', { name: 'Send feedback' }).click(),
  ]);
  await expect(page.locator('#toast')).toHaveText('Thanks – we read every message.');
});
