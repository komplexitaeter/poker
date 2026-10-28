import { test, expect, Page } from '@playwright/test';
import { newPlayer, createTeam, joinAsPlayer, gotoStats } from './helpers';

/**
 * B-57 "Ideas & Bugs", backend part: typed feedback with technical context, the public list
 * (get_roadmap.php / vote_roadmap.php) and the moderation in stats.php (POST with session form token).
 * stats.php needs a login (B-63): gotoStats() in helpers.ts logs in through the form.
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
async function createItem(page: Page, title: string, sid: string,
                          status = 'IN_PROGRESS', sortOrder = -100): Promise<number> {
  await gotoStats(page, '/stats.php?tab=ideas');
  const form = page.locator('form.rm').last();   // the "new entry" form
  await form.locator('input[name=title]').fill(title);
  await form.locator('textarea[name=description]').fill('Described <i>here</i>');
  await form.locator('select[name=status]').selectOption(status);
  await form.locator('input[name=sort_order]').fill(String(sortOrder));
  await form.locator('button[type=submit]').click();
  await expect(page.locator(`form.rm input[name=title][value="${title}"]`)).toHaveCount(1);

  const list = await (await page.request.get(`./api/get_roadmap.php?id=${encodeURIComponent(sid)}`)).json();
  const item = list.items.find((i: { title: string }) => i.title === title);
  expect(item).toMatchObject({
    type: 'FEATURE', title, description: 'Described <i>here</i>', status,
    reactions: { UP: 0, DOWN: 0 }, my_reaction: null,
  });
  return item.id;
}

/** The form of an entry in stats.php (page must show stats.php). */
const statsRow = (page: Page, title: string) =>
  page.locator('form.rm').filter({ has: page.locator(`input[name=title][value="${title}"]`) });

/** Sets the status of an entry through its form in stats.php. */
async function setStatus(page: Page, title: string, status: string) {
  await gotoStats(page, '/stats.php?tab=ideas');
  await statsRow(page, title).locator('select[name=status]').selectOption(status);
  await statsRow(page, title).getByRole('button', { name: 'Save' }).click();
  await expect(statsRow(page, title).locator('select[name=status]')).toHaveValue(status);
}

const roadmap = async (page: Page, sid: string) =>
  (await (await page.request.get(`./api/get_roadmap.php?id=${encodeURIComponent(sid)}`)).json()).items as
    { id: number; title: string; status: string; reactions: { UP: number; DOWN: number }; my_reaction: string | null }[];

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

  await gotoStats(page, '/stats.php?tab=ideas');
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
  await expect(page).toHaveURL(/tab=ideas&fb=open/);   // back in the Ideas & Bugs tab
  await expect(feedbackRow(page, bug)).toHaveCount(0);
  await gotoStats(page, '/stats.php?tab=ideas&fb=done');
  await expect(feedbackRow(page, bug)).toHaveClass(/done/);
  await feedbackRow(page, bug).getByRole('button', { name: 'Reopen' }).click();
  await expect(feedbackRow(page, bug)).toHaveCount(0);
  await gotoStats(page, '/stats.php?tab=ideas&fb=open');
  await expect(feedbackRow(page, bug).getByRole('button', { name: 'Done' })).toBeVisible();
});

test('stats.php rejects moderation POSTs without a valid form token', async ({ browser }) => {
  const page = await newPlayer(browser);
  await gotoStats(page, '/stats.php?tab=ideas');   // session exists, but the token is not sent
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

  let res = await vote(page, sid, item, 'UP');
  expect(res.ok()).toBeTruthy();
  expect(await res.json()).toMatchObject({ id: item, reactions: { UP: 1, DOWN: 0 }, my_reaction: 'UP' });

  res = await vote(page, sid, item, 'DOWN');    // change, still one reaction
  expect(await res.json()).toMatchObject({ reactions: { UP: 0, DOWN: 1 }, my_reaction: 'DOWN' });

  res = await vote(other, otherSid, item, 'UP');
  expect(await res.json()).toMatchObject({ reactions: { UP: 1, DOWN: 1 }, my_reaction: 'UP' });

  expect((await roadmap(page, sid)).find(i => i.id === item)).toMatchObject({ reactions: { UP: 1, DOWN: 1 }, my_reaction: 'DOWN' });

  res = await vote(page, sid, item, 'NONE');   // remove
  expect(await res.json()).toMatchObject({ reactions: { UP: 1, DOWN: 0 }, my_reaction: null });

  // counts in stats.php (both phases)
  await gotoStats(page, '/stats.php?tab=ideas');
  const row = statsRow(page, title);
  await expect(row.locator('.votes')).toHaveText('wanted: 👍 1 👎 0 · after done: 👍 0 👎 0');

  // hide: gone from the list, no more votes
  await row.locator('input[name=visible]').uncheck();
  await row.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('form.rm').filter({ has: page.locator(`input[name=title][value="${title}"]`) })
    .locator('input[name=visible]')).not.toBeChecked();
  const hidden = await (await page.request.get(`./api/get_roadmap.php?id=${encodeURIComponent(sid)}`)).json();
  expect(hidden.items.some((i: { id: number }) => i.id === item)).toBe(false);
  expect((await vote(page, sid, item, 'UP')).status()).toBe(404);
});

test('votes per phase: an entry set to DONE starts at 0, new votes count for DONE, stats.php shows both', async ({ browser }) => {
  const page = await newPlayer(browser);
  const sid = await boardUser(page);
  const other = await newPlayer(browser);
  const otherSid = await boardUser(other);
  const title = unique('Phase entry');
  const item = await createItem(page, title, sid, 'PLANNED');

  expect((await vote(page, sid, item, 'UP')).ok()).toBeTruthy();
  expect((await vote(other, otherSid, item, 'DOWN')).ok()).toBeTruthy();
  expect((await roadmap(page, sid)).find(i => i.id === item)).toMatchObject({ reactions: { UP: 1, DOWN: 1 }, my_reaction: 'UP' });

  // IN_PROGRESS is still the WANT phase
  await setStatus(page, title, 'IN_PROGRESS');
  expect((await roadmap(page, sid)).find(i => i.id === item)).toMatchObject({ reactions: { UP: 1, DOWN: 1 }, my_reaction: 'UP' });

  // DONE: public counts and own reaction start again
  await setStatus(page, title, 'DONE');
  expect((await roadmap(page, sid)).find(i => i.id === item)).toMatchObject({ status: 'DONE', reactions: { UP: 0, DOWN: 0 }, my_reaction: null });

  const res = await vote(page, sid, item, 'UP');
  expect(await res.json()).toMatchObject({ status: 'DONE', reactions: { UP: 1, DOWN: 0 }, my_reaction: 'UP' });
  expect((await roadmap(other, otherSid)).find(i => i.id === item)).toMatchObject({ reactions: { UP: 1, DOWN: 0 }, my_reaction: null });

  await gotoStats(page, '/stats.php?tab=ideas');
  await expect(statsRow(page, title).locator('.votes')).toHaveText('wanted: 👍 1 👎 1 · after done: 👍 1 👎 0');

  // removing the DONE vote keeps the WANT vote
  expect(await (await vote(page, sid, item, 'NONE')).json()).toMatchObject({ reactions: { UP: 0, DOWN: 0 }, my_reaction: null });
  await gotoStats(page, '/stats.php?tab=ideas');
  await expect(statsRow(page, title).locator('.votes')).toHaveText('wanted: 👍 1 👎 1 · after done: 👍 0 👎 0');

  // back to PLANNED: the WANT votes are shown again
  await setStatus(page, title, 'PLANNED');
  expect((await roadmap(page, sid)).find(i => i.id === item)).toMatchObject({ reactions: { UP: 1, DOWN: 1 }, my_reaction: 'UP' });
});

test('public list is sorted by status, then thumbs up minus down of the current phase, then order', async ({ browser }) => {
  const page = await newPlayer(browser);
  const sid = await boardUser(page);
  const other = await newPlayer(browser);
  const otherSid = await boardUser(other);
  // created in this order with ascending sort_order, so without votes: a, b, c
  const a = await createItem(page, unique('Sort a'), sid, 'PLANNED', -300);
  const b = await createItem(page, unique('Sort b'), sid, 'PLANNED', -200);
  const c = await createItem(page, unique('Sort c'), sid, 'PLANNED', -100);
  const pos = async () => {
    const ids = (await roadmap(page, sid)).map(i => i.id);
    return [a, b, c].map(id => ids.indexOf(id));
  };
  let [pa, pb, pc] = await pos();
  expect(pa).toBeLessThan(pb);
  expect(pb).toBeLessThan(pc);

  // c: +2, a: -1, b: 0 -> c, b, a
  expect((await vote(page, sid, c, 'UP')).ok()).toBeTruthy();
  expect((await vote(other, otherSid, c, 'UP')).ok()).toBeTruthy();
  expect((await vote(page, sid, a, 'DOWN')).ok()).toBeTruthy();
  [pa, pb, pc] = await pos();
  expect(pc).toBeLessThan(pb);
  expect(pb).toBeLessThan(pa);

  // status first: DONE, IN_PROGRESS, PLANNED over the whole list
  const rank = { DONE: 0, IN_PROGRESS: 1, PLANNED: 2 } as Record<string, number>;
  const ranks = (await roadmap(page, sid)).map(i => rank[i.status]);
  expect(ranks).toEqual([...ranks].sort((x, y) => x - y));
  // and within a status by (UP - DOWN) descending
  const list = await roadmap(page, sid);
  for (let i = 1; i < list.length; i++) {
    if (list[i].status === list[i - 1].status) {
      expect(list[i - 1].reactions.UP - list[i - 1].reactions.DOWN)
        .toBeGreaterThanOrEqual(list[i].reactions.UP - list[i].reactions.DOWN);
    }
  }
});

test('vote_roadmap.php rejects GET, invalid values and unknown users', async ({ browser }) => {
  const page = await newPlayer(browser);
  const sid = await boardUser(page);
  const list = await (await page.request.get(`./api/get_roadmap.php?id=${encodeURIComponent(sid)}`)).json();
  const item = list.items.find((i: { title: string }) => i.title === 'New look').id;

  expect((await page.request.get(`./api/vote_roadmap.php?id=${sid}&item=${item}&reaction=UP`)).status()).toBe(405);
  expect((await vote(page, sid, item, 'up')).status()).toBe(400);
  expect((await vote(page, sid, item, 'LOVE')).status()).toBe(400);   // the codes before thumbs up/down
  expect((await vote(page, sid, item, 'HATE')).status()).toBe(400);
  expect((await vote(page, sid, 'abc', 'UP')).status()).toBe(400);
  expect((await vote(page, sid, `${item}%20or%201=1`, 'UP')).status()).toBe(400);
  expect((await vote(page, '', item, 'UP')).status()).toBe(400);
  expect((await vote(page, 'E2EUNKNOWNUSER01', item, 'UP')).status()).toBe(403);

  // a user dao.php knows (pok_user_tbl), but who never joined a board, may not react either
  const lurker = 'E2ELURKER' + Date.now().toString(36).slice(-6).toUpperCase();
  expect((await page.request.get(`./api/get_roadmap.php?id=${lurker}`)).ok()).toBeTruthy();
  const t = new URL(page.url()).searchParams.get('t') as string;
  expect((await page.request.get(`./api/dao.php?id=${lurker}&t=${encodeURIComponent(t)}`)).ok()).toBeTruthy();
  expect((await vote(page, lurker, item, 'UP')).status()).toBe(403);
  expect((await vote(page, sid, 999999, 'UP')).status()).toBe(404);
});

test('delete_user.php removes the reactions of the user in all phases', async ({ browser }) => {
  const page = await newPlayer(browser);
  const sid = await boardUser(page);
  const title = unique('Delete me reaction');
  const item = await createItem(page, title, sid);
  expect((await vote(page, sid, item, 'UP')).ok()).toBeTruthy();
  await setStatus(page, title, 'DONE');
  expect((await vote(page, sid, item, 'DOWN')).ok()).toBeTruthy();
  await gotoStats(page, '/stats.php?tab=ideas');
  await expect(statsRow(page, title).locator('.votes')).toHaveText('wanted: 👍 1 👎 0 · after done: 👍 0 👎 1');

  expect((await page.request.post(`./api/delete_user.php?id=${encodeURIComponent(sid)}`)).ok()).toBeTruthy();
  await gotoStats(page, '/stats.php?tab=ideas');
  await expect(statsRow(page, title).locator('.votes')).toHaveText('wanted: 👍 0 👎 0 · after done: 👍 0 👎 0');
});
