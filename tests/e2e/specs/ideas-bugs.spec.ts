import { test, expect, Page } from '@playwright/test';
import { newPlayer, createTeam, joinAsPlayer } from './helpers';

/**
 * B-57 "Ideas & Bugs", backend part: typed feedback with technical context, the public list
 * (get_roadmap.php / vote_roadmap.php) and the moderation in stats.php (POST with session form token).
 * In the e2e setup stats.php has no basic auth (that is nginx config on the servers only).
 */

const unique = (prefix: string) => `${prefix} ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Creates a board and joins it (only users in pok_players_tbl may react), returns the SID. */
async function boardUser(page: Page): Promise<string> {
  await joinAsPlayer(page, await createTeam(page, 'IdeasTeam'), 'Ida');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('SID'))).not.toBeNull();
  const sid = (await page.evaluate(() => localStorage.getItem('SID'))) as string;
  const t = new URL(page.url()).searchParams.get('t') as string;
  // dao.php creates the user row (the board calls it on load as well)
  const res = await page.request.get(`./api/dao.php?id=${encodeURIComponent(sid)}&t=${encodeURIComponent(t)}`);
  expect(res.ok()).toBeTruthy();
  return sid;
}

function feedbackRow(page: Page, text: string) {
  return page.locator('tr.feedback_row').filter({ has: page.locator('td.fb_text', { hasText: text }) });
}

/** Creates an entry of the public list through the form in stats.php and returns its id from get_roadmap.php. */
async function createItem(page: Page, title: string, sid: string): Promise<number> {
  await page.goto('/stats.php');
  const form = page.locator('form.rm').last();   // the "new entry" form
  await form.locator('input[name=title]').fill(title);
  await form.locator('textarea[name=description]').fill('Described <i>here</i>');
  await form.locator('select[name=status]').selectOption('IN_PROGRESS');
  await form.locator('input[name=sort_order]').fill('-100');
  await form.locator('button[type=submit]').click();
  await expect(page.locator(`form.rm input[name=title][value="${title}"]`)).toHaveCount(1);

  const list = await (await page.request.get(`./api/get_roadmap.php?id=${encodeURIComponent(sid)}`)).json();
  const item = list.items.find((i: { title: string }) => i.title === title);
  expect(item).toMatchObject({
    type: 'FEATURE', title, description: 'Described <i>here</i>', status: 'IN_PROGRESS',
    reactions: { LOVE: 0, MEH: 0 }, my_reaction: null,
  });
  return item.id;
}

const vote = (page: Page, sid: string, item: number | string, reaction: string) =>
  page.request.post(`./api/vote_roadmap.php?id=${encodeURIComponent(sid)}&item=${item}&reaction=${reaction}`);

test('feedback is stored with type, context only for bugs, shown escaped in stats.php and can be ticked off', async ({ browser }) => {
  const page = await newPlayer(browser);
  const bug = unique('Bug 🙈 <b>bold</b> & "quotes"');
  const idea = unique('Idea');
  const other = unique('Other');
  const context = JSON.stringify({ browser: 'Chrome 130', viewport: '1280x900', touch: false, theme: 'dark' });

  const post = (text: string, type: string) => page.request.post(
    `./api/feedback.php?id=E2EFEEDBACK01&stars=0&type=${type}&context=${encodeURIComponent(context)}&text=${encodeURIComponent(text)}`);
  expect((await post(bug, 'BUG')).ok()).toBeTruthy();
  expect((await post(idea, 'FEATURE')).ok()).toBeTruthy();
  expect((await post(other, 'nonsense')).ok()).toBeTruthy();
  expect((await page.request.get(`./api/feedback.php?id=E2EFEEDBACK01&type=BUG&text=get`)).status()).toBe(405);

  await page.goto('/stats.php');
  const bugRow = feedbackRow(page, bug);
  await expect(bugRow.locator('td.fb_text')).toHaveText(bug);        // stored raw (emoji), escaped on output
  await expect(bugRow.locator('td.fb_text b')).toHaveCount(0);
  await expect(bugRow.locator('td').nth(1)).toHaveText('BUG');
  await expect(bugRow.locator('td.fb_context')).toHaveText(context);
  await expect(feedbackRow(page, idea).locator('td').nth(1)).toHaveText('FEATURE');
  await expect(feedbackRow(page, idea).locator('td.fb_context')).toHaveText('');  // context only for bugs
  await expect(feedbackRow(page, other).locator('td').nth(1)).toHaveText('OTHER');

  // tick off: leaves the open inbox, shows up under "done", can be reopened
  await bugRow.getByRole('button', { name: 'Done' }).click();
  await expect(page).toHaveURL(/fb=open/);
  await expect(feedbackRow(page, bug)).toHaveCount(0);
  await page.goto('/stats.php?fb=done');
  await expect(feedbackRow(page, bug)).toHaveClass(/done/);
  await feedbackRow(page, bug).getByRole('button', { name: 'Reopen' }).click();
  await expect(feedbackRow(page, bug)).toHaveCount(0);
  await page.goto('/stats.php?fb=open');
  await expect(feedbackRow(page, bug).getByRole('button', { name: 'Done' })).toBeVisible();
});

test('stats.php rejects moderation POSTs without a valid form token', async ({ browser }) => {
  const page = await newPlayer(browser);
  await page.goto('/stats.php');   // session exists, but the token is not sent
  const form = { action: 'roadmap_save', type: 'FEATURE', title: unique('CSRF'), status: 'PLANNED', sort_order: '0', visible: '1' };

  expect((await page.request.post('./stats.php', { form })).status()).toBe(403);
  expect((await page.request.post('./stats.php', { form: { ...form, csrf: 'wrong' } })).status()).toBe(403);
  expect((await page.request.post('./stats.php', { form: { action: 'feedback_done', fb_id: '1', done: '1' } })).status()).toBe(403);

  const list = await (await page.request.get('./api/get_roadmap.php')).json();
  expect(list.items.some((i: { title: string }) => i.title === form.title)).toBe(false);
});

test('public list: seed entry, one reaction per user (set, change, remove), hidden entries', async ({ browser }) => {
  const page = await newPlayer(browser);
  const sid = await boardUser(page);
  const other = await newPlayer(browser);
  const otherSid = await boardUser(other);

  const seed = await (await page.request.get(`./api/get_roadmap.php?id=${encodeURIComponent(sid)}`)).json();
  expect(seed.items.find((i: { title: string }) => i.title === 'New look')).toMatchObject({ type: 'FEATURE', status: 'DONE' });

  const title = unique('Dark mode for cards');
  const item = await createItem(page, title, sid);

  let res = await vote(page, sid, item, 'LOVE');
  expect(res.ok()).toBeTruthy();
  expect(await res.json()).toMatchObject({ id: item, reactions: { LOVE: 1, MEH: 0 }, my_reaction: 'LOVE' });

  res = await vote(page, sid, item, 'MEH');    // change, still one reaction
  expect(await res.json()).toMatchObject({ reactions: { LOVE: 0, MEH: 1 }, my_reaction: 'MEH' });

  res = await vote(other, otherSid, item, 'LOVE');
  expect(await res.json()).toMatchObject({ reactions: { LOVE: 1, MEH: 1 }, my_reaction: 'LOVE' });

  const mine = await (await page.request.get(`./api/get_roadmap.php?id=${encodeURIComponent(sid)}`)).json();
  expect(mine.items.find((i: { id: number }) => i.id === item)).toMatchObject({ reactions: { LOVE: 1, MEH: 1 }, my_reaction: 'MEH' });

  res = await vote(page, sid, item, 'NONE');   // remove
  expect(await res.json()).toMatchObject({ reactions: { LOVE: 1, MEH: 0 }, my_reaction: null });

  // counts in stats.php
  await page.goto('/stats.php');
  const row = page.locator('form.rm').filter({ has: page.locator(`input[name=title][value="${title}"]`) });
  await expect(row.locator('.votes')).toHaveText('❤️ 1 · 🙈 0');

  // hide: gone from the list, no more votes
  await row.locator('input[name=visible]').uncheck();
  await row.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('form.rm').filter({ has: page.locator(`input[name=title][value="${title}"]`) })
    .locator('input[name=visible]')).not.toBeChecked();
  const hidden = await (await page.request.get(`./api/get_roadmap.php?id=${encodeURIComponent(sid)}`)).json();
  expect(hidden.items.some((i: { id: number }) => i.id === item)).toBe(false);
  expect((await vote(page, sid, item, 'LOVE')).status()).toBe(404);
});

test('vote_roadmap.php rejects GET, invalid values and unknown users', async ({ browser }) => {
  const page = await newPlayer(browser);
  const sid = await boardUser(page);
  const list = await (await page.request.get(`./api/get_roadmap.php?id=${encodeURIComponent(sid)}`)).json();
  const item = list.items.find((i: { title: string }) => i.title === 'New look').id;

  expect((await page.request.get(`./api/vote_roadmap.php?id=${sid}&item=${item}&reaction=LOVE`)).status()).toBe(405);
  expect((await vote(page, sid, item, 'love')).status()).toBe(400);
  expect((await vote(page, sid, item, 'HATE')).status()).toBe(400);
  expect((await vote(page, sid, 'abc', 'LOVE')).status()).toBe(400);
  expect((await vote(page, sid, `${item}%20or%201=1`, 'LOVE')).status()).toBe(400);
  expect((await vote(page, '', item, 'LOVE')).status()).toBe(400);
  expect((await vote(page, 'E2EUNKNOWNUSER01', item, 'LOVE')).status()).toBe(403);

  // a user dao.php knows (pok_user_tbl), but who never joined a board, may not react either
  const lurker = 'E2ELURKER' + Date.now().toString(36).slice(-6).toUpperCase();
  expect((await page.request.get(`./api/get_roadmap.php?id=${lurker}`)).ok()).toBeTruthy();
  const t = new URL(page.url()).searchParams.get('t') as string;
  expect((await page.request.get(`./api/dao.php?id=${lurker}&t=${encodeURIComponent(t)}`)).ok()).toBeTruthy();
  expect((await vote(page, lurker, item, 'LOVE')).status()).toBe(403);
  expect((await vote(page, sid, 999999, 'LOVE')).status()).toBe(404);
});

test('delete_user.php removes the reactions of the user', async ({ browser }) => {
  const page = await newPlayer(browser);
  const sid = await boardUser(page);
  const title = unique('Delete me reaction');
  const item = await createItem(page, title, sid);
  expect((await vote(page, sid, item, 'LOVE')).ok()).toBeTruthy();

  const count = async () => (await (await page.request.get(`./api/get_roadmap.php?id=${encodeURIComponent(sid)}`)).json())
    .items.find((i: { id: number }) => i.id === item).reactions.LOVE;
  expect(await count()).toBe(1);

  expect((await page.request.post(`./api/delete_user.php?id=${encodeURIComponent(sid)}`)).ok()).toBeTruthy();
  expect(await count()).toBe(0);
});
