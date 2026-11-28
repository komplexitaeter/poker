import { test, expect, Page, Request } from '@playwright/test';
import { newPlayer, createTeam, joinAsPlayer, gotoStats } from './helpers';

/**
 * B-57 "Ideas & Bugs", frontend part; B-165: the feedback panel on one page, no tabs. On top "Tell the makers"
 * (text, type chips Bug | Idea | Other, bug context, inline confirmation), below "What others asked for" (the public
 * list as a table: status label, "Want it" | "Don't need" resp. "Like it" | "Don't", filter Open | Done).
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

/** A row of the list by its title. */
function row(page: Page, title: string | RegExp) {
  return page.locator('#fb_backlog tr.fb-item').filter({ has: page.locator('.fb-title', { hasText: title }) });
}

/** Creates a visible entry of the public list through stats.php (in a separate page, the board stays as it is). */
async function createItem(page: Page, title: string, description: string) {
  const admin = await page.context().newPage();
  await gotoStats(admin, '/stats.php?tab=ideas');
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

test('one page: write box on top with the focus, the list below with filter Open | Done; reopening resets', async ({ browser }) => {
  const page = await newPlayer(browser);
  await boardWithPlayer(page, 'Tabby');
  const openF = page.locator('#feedback_box [data-filter=open]');
  const doneF = page.locator('#feedback_box [data-filter=done]');

  await openFeedback(page);
  await expect(page.locator('#feedback_box [role=tab]')).toHaveCount(0);   // no tabs any more
  await expect(page.locator('#fb_ask_title')).toHaveText('Tell the makers');
  await expect(page.locator('#feedback_txt')).toBeFocused();
  await expect(page.locator('#fb_hint')).toContainText("Your team won't see this.");
  await expect(page.locator('#fb_list_title')).toHaveText('What others asked for');

  // Open: no done entries, the words of the open phase; counts in the filter
  await expect(openF).toHaveAttribute('aria-pressed', 'true');
  await expect(doneF).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#fb_n_done')).toHaveText(/^[1-9]\d*$/);   // the seed "New look" is done
  await expect(page.locator('#fb_th_up')).toHaveText('Want it');
  await expect(page.locator('#fb_th_down')).toHaveText("Don't need");
  await expect(row(page, /^New look$/)).toHaveCount(0);
  const statuses = await page.locator('#fb_backlog .fb-status').evaluateAll(els => els.map(e => e.getAttribute('data-status')));
  expect(statuses.every(st => st === 'PLANNED' || st === 'IN_PROGRESS')).toBe(true);
  expect(Number(await page.locator('#fb_n_open').textContent())).toBe(await page.locator('#fb_backlog tr.fb-item').count());

  // Done: only done entries, "Like it" | "Don't", no status label (the filter says it)
  await doneF.click();
  await expect(doneF).toHaveAttribute('aria-pressed', 'true');
  await expect(openF).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#fb_th_title')).toHaveText('Built');
  await expect(page.locator('#fb_th_up')).toHaveText('Like it');
  await expect(page.locator('#fb_th_down')).toHaveText("Don't");
  const seed = row(page, /^New look$/);
  await expect(seed).toHaveCount(1);
  await expect(seed.locator('.fb-status')).toBeHidden();
  expect(Number(await page.locator('#fb_n_done').textContent())).toBe(await page.locator('#fb_backlog tr.fb-item').count());

  // closed on Done, reopened: Open again, the list loaded anew
  await page.keyboard.press('Escape');
  await expect(page.locator('dialog#menu')).not.toHaveAttribute('open');
  const reload = page.waitForRequest(r => r.url().includes('/api/get_roadmap.php'));
  await openFeedback(page);
  await reload;
  await expect(openF).toHaveAttribute('aria-pressed', 'true');
  await expect(row(page, /^New look$/)).toHaveCount(0);
  await expect(page.locator('#feedback_txt')).toBeFocused();
});

test('send from the top field: type chips and bug context (no team id, no name), empty text is not sent, inline thanks', async ({ browser }) => {
  const page = await newPlayer(browser);
  const t = await boardWithPlayer(page, 'Bugsy');
  const requests: Request[] = [];
  page.on('request', r => { if (r.url().includes('/api/feedback.php')) requests.push(r); });

  await openFeedback(page);
  const txt = page.locator('#feedback_txt');
  const sendBtn = page.locator('#feedback_send');
  const sent = page.locator('#fb_sent');
  const chip = (name: string) => page.locator('#fb_type label', { hasText: name });

  // placeholder per type; "Other" preset
  await expect(sendBtn).toHaveText('Send');
  await expect(page.locator('input[name=fb_type][value=OTHER]')).toBeChecked();
  await expect(txt).toHaveAttribute('placeholder', 'Anything you want to tell the Komplexitäter team?');
  await expect(page.locator('#fb_bug_hint')).toBeHidden();
  await chip('Bug').click();
  await expect(txt).toHaveAttribute('placeholder', 'What happened? What did you expect?');
  await expect(page.locator('#fb_bug_hint')).toBeVisible();
  await chip('Idea').click();
  await expect(txt).toHaveAttribute('placeholder', 'What would help your team?');
  await chip('Bug').click();

  // empty (or blank) text: nothing is sent, the panel stays open
  await txt.fill('   ');
  await sendBtn.click();
  await expect(page.locator('dialog#menu[open]')).toBeVisible();
  await expect(txt).toBeFocused();
  expect(requests).toHaveLength(0);
  await expect(sent).toBeHidden();

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

  // B-165: the panel stays open and confirms inline; the draft is cleared, the type back to "Other"
  await expect(sent).toHaveText('Thanks – sent! We read every message.');
  await expect(sent).toHaveAttribute('role', 'status');
  await expect(sendBtn).toBeFocused();   // disabled while waiting, the focus comes back
  await expect(page.locator('dialog#menu[open] #feedback_box')).toBeVisible();
  await expect(page.locator('#toast')).not.toHaveClass(/toast-on/);
  await expect(txt).toHaveValue('');
  await expect(page.locator('input[name=fb_type][value=OTHER]')).toBeChecked();
  await expect(txt).toHaveAttribute('placeholder', 'Anything you want to tell the Komplexitäter team?');

  // stored with type and context (stats.php shows the inbox)
  const admin = await page.context().newPage();
  await gotoStats(admin, '/stats.php?tab=ideas');
  const fbRow = admin.locator('tr.feedback_row').filter({ has: admin.locator('td.fb_text', { hasText: text }) });
  await expect(fbRow.locator('td').nth(1)).toHaveText('BUG');
  await expect(fbRow.locator('td.fb_context')).toHaveText(raw);
  await admin.close();

  // typing again hides the confirmation; non-bugs carry no context
  await txt.fill('An idea');
  await expect(sent).toBeHidden();
  await chip('Idea').click();
  const [second] = await Promise.all([
    page.waitForRequest(r => r.url().includes('/api/feedback.php')),
    sendBtn.click(),
  ]);
  const p2 = new URL(second.url()).searchParams;
  expect(p2.get('type')).toBe('FEATURE');
  expect(p2.get('context')).toBeNull();
  expect(requests).toHaveLength(2);
  await expect(sent).toBeVisible();

  // closed and reopened: no old confirmation
  await page.keyboard.press('Escape');
  await openFeedback(page);
  await expect(sent).toBeHidden();
});

test('send feedback fails (500, network): error toast with icon, text and menu stay, retry works', async ({ browser }) => {
  const page = await newPlayer(browser);
  await boardWithPlayer(page, 'Failsy');
  await openFeedback(page);
  const txt = page.locator('#feedback_txt');
  const sendBtn = page.locator('#feedback_send');
  const toast = page.locator('#toast');
  const text = unique('Lost message');

  // HTTP error: the button is disabled while waiting, then the error toast; nothing is cleared or closed
  let release!: () => void;
  const gate = new Promise<void>(r => { release = r; });
  await page.route('**/api/feedback.php*', async route => { await gate; await route.fulfill({ status: 500, body: '' }); });
  await page.locator('#fb_type label', { hasText: 'Idea' }).click();
  await txt.fill(text);
  await sendBtn.click();
  await expect(sendBtn).toBeDisabled();
  await expect(toast).not.toHaveClass(/toast-on/);
  release();
  await expect(toast).toHaveText('Not sent – please try again');
  await expect(toast).toHaveClass(/toast-on/);
  await expect(toast).toHaveClass(/toast-error/);
  await expect(toast.locator('svg.toast-ico use')).toHaveAttribute('href', '#i-alert');
  await expect(page.locator('dialog#menu[open]')).toBeVisible();
  await expect(txt).toHaveValue(text);
  await expect(page.locator('input[name=fb_type][value=FEATURE]')).toBeChecked();
  await expect(sendBtn).toBeEnabled();
  await expect(sendBtn).toBeFocused();
  await expect(page.locator('#fb_sent')).toBeHidden();

  // network failure: the same
  await page.unroute('**/api/feedback.php*');
  await page.evaluate(() => { (document.getElementById('toast') as HTMLElement).textContent = ''; });
  await page.route('**/api/feedback.php*', route => route.abort('failed'));
  await sendBtn.click();
  await expect(toast).toHaveText('Not sent – please try again');
  await expect(toast).toHaveClass(/toast-error/);
  await expect(txt).toHaveValue(text);
  await expect(page.locator('dialog#menu[open]')).toBeVisible();

  // retry with the server back: thanks in the panel, cleared, still open
  await page.unroute('**/api/feedback.php*');
  await sendBtn.click();
  await expect(page.locator('#fb_sent')).toHaveText('Thanks – sent! We read every message.');
  await expect(page.locator('dialog#menu[open]')).toBeVisible();
  await expect(txt).toHaveValue('');
});

test('vote in the table: titles as text, status label, set / change / take back, own vote marked', async ({ browser }) => {
  const page = await newPlayer(browser);
  await boardWithPlayer(page, 'Voter');
  const title = unique('Sort <b>by</b> name & "more"');
  const description = 'Shown <i>as text</i>';
  await createItem(page, title, description);

  await openFeedback(page);   // filter Open
  await expect(page.locator('#fb_backlog_empty')).toBeHidden();

  const item = row(page, title);
  await expect(item.locator('.fb-title')).toHaveText(title);   // markup stays text
  await expect(item.locator('.fb-title b')).toHaveCount(0);
  await expect(item.locator('.fb-desc')).toHaveText(description);
  await expect(item.locator('.fb-desc i')).toHaveCount(0);
  await expect(item.locator('.fb-status')).toHaveText('planned');
  await expect(item.locator('.fb-status')).toHaveAttribute('data-status', 'PLANNED');

  const want = item.locator('.fb-react-btn[data-reaction=UP]');
  const nope = item.locator('.fb-react-btn[data-reaction=DOWN]');
  await expect(want).toHaveAttribute('aria-pressed', 'false');
  await expect(want).toHaveAttribute('aria-label', 'Want it, 0');
  await expect(nope).toHaveAttribute('aria-label', "Don't need, 0");
  await expect(item).not.toHaveClass(/\bmine\b/);

  // set
  const [vote] = await Promise.all([
    page.waitForRequest(r => r.url().includes('/api/vote_roadmap.php')),
    want.click(),
  ]);
  expect(vote.method()).toBe('POST');
  expect(new URL(vote.url()).searchParams.get('reaction')).toBe('UP');
  await expect(want).toHaveAttribute('aria-pressed', 'true');
  await expect(want.locator('.fb-count')).toHaveText('1');
  await expect(want).toHaveAttribute('aria-label', 'Want it, 1, your vote');
  await expect(nope).toHaveAttribute('aria-pressed', 'false');
  await expect(item).toHaveClass(/\bmine\b/);
  await expect(want).toBeEnabled();

  // change
  await nope.click();
  await expect(nope).toHaveAttribute('aria-pressed', 'true');
  await expect(want).toHaveAttribute('aria-pressed', 'false');
  await expect(want.locator('.fb-count')).toHaveText('0');
  await expect(nope.locator('.fb-count')).toHaveText('1');

  // the row keeps its place across a filter switch, the vote stays (from the stored list)
  await page.locator('#feedback_box [data-filter=done]').click();
  await expect(item).toHaveCount(0);
  await page.locator('#feedback_box [data-filter=open]').click();
  await expect(item.locator('.fb-react-btn[data-reaction=DOWN]')).toHaveAttribute('aria-pressed', 'true');

  // a second user sees the counts, not the reaction of the first one
  const other = await newPlayer(browser);
  await boardWithPlayer(other, 'Other');
  await openFeedback(other);
  const otherItem = row(other, title);
  await expect(otherItem.locator('.fb-react-btn[data-reaction=DOWN] .fb-count')).toHaveText('1');
  await expect(otherItem.locator('.fb-react-btn[data-reaction=DOWN]')).toHaveAttribute('aria-pressed', 'false');
  await expect(otherItem).not.toHaveClass(/\bmine\b/);

  // take back (the same reaction again)
  const [remove] = await Promise.all([
    page.waitForRequest(r => r.url().includes('/api/vote_roadmap.php')),
    nope.click(),
  ]);
  expect(new URL(remove.url()).searchParams.get('reaction')).toBe('NONE');
  await expect(nope).toHaveAttribute('aria-pressed', 'false');
  await expect(nope.locator('.fb-count')).toHaveText('0');
  await expect(item).not.toHaveClass(/\bmine\b/);

  // keyboard: Tab onto the button, Enter votes and takes back; the focus stays on the button
  await want.focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  await expect(want).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(want).toHaveAttribute('aria-pressed', 'true');
  await expect(want).toBeEnabled();
  await expect(want).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(want).toHaveAttribute('aria-pressed', 'false');
  await expect(want).toBeEnabled();
  await expect(want).toBeFocused();

  // reopened later: loaded again, the state from the server
  await page.keyboard.press('Escape');
  await openFeedback(page);
  await expect(item.locator('.fb-react-btn[aria-pressed=true]')).toHaveCount(0);
  await expect(nope.locator('.fb-count')).toHaveText('0');
});

test('done entries: "Like it" | "Don\'t", vote and take back', async ({ browser }) => {
  const page = await newPlayer(browser);
  await boardWithPlayer(page, 'Liker');
  await openFeedback(page);
  await page.locator('#feedback_box [data-filter=done]').click();
  const seed = row(page, /^New look$/);
  const like = seed.locator('.fb-react-btn[data-reaction=UP]');
  await expect(like).toHaveAttribute('aria-pressed', 'false');
  const before = Number(await like.locator('.fb-count').textContent());
  await expect(like).toHaveAttribute('aria-label', `Like it, ${before}`);
  await expect(seed.locator('.fb-react-btn[data-reaction=DOWN]')).toHaveAttribute('aria-label', /^Don't like it, \d+$/);

  await like.click();
  await expect(like).toHaveAttribute('aria-pressed', 'true');
  await expect(like.locator('.fb-count')).toHaveText(String(before + 1));
  await expect(like).toHaveAttribute('aria-label', `Like it, ${before + 1}, your vote`);
  await like.click();
  await expect(like).toHaveAttribute('aria-pressed', 'false');
  await expect(like.locator('.fb-count')).toHaveText(String(before));
});

test('list while loading: no "Nothing here yet." flash; a pull update leaves the open panel alone', async ({ browser }) => {
  const page = await newPlayer(browser);
  const url = await createTeam(page, 'PullTeam');
  await joinAsPlayer(page, url, 'Reader');

  let release: () => void = () => {};
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/get_roadmap.php*', async route => { await gate; await route.continue(); });

  await openFeedback(page);
  await expect(page.locator('#fb_backlog')).toHaveAttribute('aria-busy', 'true');
  await expect(page.locator('#fb_backlog_empty')).toBeHidden();
  release();
  await expect(page.locator('#fb_backlog tr.fb-item').first()).toBeVisible();
  await expect(page.locator('#fb_backlog')).not.toHaveAttribute('aria-busy', 'true');
  await expect(page.locator('#fb_backlog_empty')).toBeHidden();

  // a draft and the filter Done; another player joins (pull to all boards): the panel stays as it is
  await page.locator('#feedback_txt').fill('half a thought');
  await page.locator('#feedback_box [data-filter=done]').click();
  const other = await newPlayer(browser);
  await joinAsPlayer(other, url, 'Joiner');
  await expect(page.locator('#cbox .c')).toHaveCount(2);
  await expect(page.locator('dialog#menu[open] #feedback_box')).toBeVisible();
  await expect(page.locator('#feedback_box [data-filter=done]')).toHaveAttribute('aria-pressed', 'true');
  await expect(row(page, /^New look$/)).toHaveCount(1);
  await expect(page.locator('#feedback_txt')).toHaveValue('half a thought');
});

test('touch tablet (800px and up): opening focuses the heading, not the text field (no keyboard over the list)', async ({ browser }) => {
  const page = await newPlayer(browser, { viewport: { width: 1024, height: 768 }, hasTouch: true, isMobile: true });
  await boardWithPlayer(page, 'Tablet');
  expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches && !matchMedia('(max-width: 799.98px)').matches)).toBe(true);
  await page.locator('#feedback_btn').click();
  await expect(page.locator('dialog#menu[open] #feedback_box')).toBeVisible();
  await expect(page.locator('#fb_ask_title')).toBeFocused();
  await expect(page.locator('#feedback_txt')).not.toBeFocused();
});

for (const vp of [
  { n: 'desktop', colorScheme: 'light' as const, viewport: { width: 1280, height: 900 }, mobile: false },
  { n: 'phone', colorScheme: 'dark' as const, viewport: { width: 390, height: 844 }, mobile: true },
]) {
  test(`panel layout (${vp.n}, ${vp.colorScheme}): fits without horizontal scrolling, touch targets`, async ({ browser }) => {
    const page = await newPlayer(browser, { viewport: vp.viewport, colorScheme: vp.colorScheme, isMobile: vp.mobile, hasTouch: vp.mobile });
    await boardWithPlayer(page, 'Looker');
    // the board keeps its own mode (dark first); switch to the one of this run
    const light = await page.evaluate(() => document.body.classList.contains('light-theme'));
    if (light !== (vp.colorScheme === 'light')) await page.locator('#cmode_btn').click();
    await expect(page.locator('body')).toHaveClass(vp.colorScheme === 'light' ? /\blight-theme\b/ : /^(?!.*\blight-theme\b)/);
    if (vp.mobile) {
      await page.locator('#menu_btn').click();
      await page.locator('#menu_index [data-open="feedback"]').click();
      await expect(page.locator('#menu_index [data-open="feedback"] small')).toHaveText('Report bugs, vote on ideas');
      await expect(page.locator('dialog#menu[open] #feedback_box')).toBeVisible();
      await expect(page.locator('#fb_ask_title')).toBeFocused();   // no keyboard popping up over the sheet
    } else {
      await openFeedback(page);
    }
    await expect(page.locator('#fb_backlog tr.fb-item').first()).toBeVisible();
    const box = page.locator('#feedback_box');
    expect(await box.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    if (vp.mobile) {
      const h = await page.locator('#fb_backlog .fb-react-btn').first().evaluate(el => el.getBoundingClientRect().height);
      expect(h).toBeGreaterThanOrEqual(44);
      const c = await page.locator('#feedback_box [data-filter=open]').evaluate(el => el.getBoundingClientRect().height);
      expect(c).toBeGreaterThanOrEqual(44);
    }
    if (process.env.SHOT_DIR) {
      await page.locator('#feedback_txt').blur();
      await page.screenshot({ path: `${process.env.SHOT_DIR}/b165-${vp.n}.png` });
    }
  });
}
