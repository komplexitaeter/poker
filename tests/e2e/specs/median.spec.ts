import { test, expect, Page } from '@playwright/test';
import { newPlayer, createTeam, joinAsPlayer, addPlayersViaApi, setTeamDeck, CONTROLS_ALL } from './helpers';

/**
 * B-53: the median as a dashed line in the spread of the results panel (#spread_median), coupled to the team switch
 * "Average and median" (show_avg). Only votes on cards with a numeric value count (no control cards, no ∞), only
 * for decks that aim to agree, from two such votes on. Positioned by value like the average pointer: the median is
 * the middle vote (odd) or the mean of the two middle votes (even); a column with exactly that value: through its
 * middle, else between its neighbouring columns by value.
 */
const DESKTOP = { width: 1280, height: 800 };
const SHOTS = process.env.MEDIAN_SHOTS; // directory for manual look checks (screenshots), unset in CI

async function post(page: Page, script: string, params: Record<string, string>) {
  const res = await page.request.post(`/api/${script}?${new URLSearchParams(params).toString()}`);
  expect(res.ok()).toBeTruthy();
}

/* the horizontal middle of a column of the spread, relative to the chart (as the line's left) */
async function colCenter(page: Page, key: string): Promise<number> {
  return page.evaluate(k => {
    const col = document.querySelector(`#spread_bars [data-card="${k}"]`)!.getBoundingClientRect();
    const chart = document.querySelector('.spread-chart')!.getBoundingClientRect();
    return col.left + col.width / 2 - chart.left;
  }, key);
}

async function lineLeft(page: Page): Promise<number> {
  return page.locator('#spread_median').evaluate(el => {
    const r = el.getBoundingClientRect();
    return r.left + r.width / 2 - el.parentElement!.getBoundingClientRect().left;
  });
}

test('median line: on the middle column, between two columns by value, ignores control cards and ∞, follows the switch and the deck aim (B-53)',
  async ({ browser }) => {
  const alice = await newPlayer(browser, { viewport: DESKTOP });
  const url = await createTeam(alice, 'Median Line');
  const t = new URL(url).searchParams.get('t')!;
  await joinAsPlayer(alice, url, 'Alice');
  const me = await alice.evaluate(() => localStorage.getItem('SID')!);
  await setTeamDeck(alice, url, 'fib-classic', null, CONTROLS_ALL);
  await post(alice, 'update_show_avg.php', { t, show_avg: '1' });
  const [bob, carol, dan] = await addPlayersViaApi(alice, url, ['Bob', 'Carol', 'Dan']);
  await alice.reload();

  const line = alice.locator('#spread_median');
  const status = alice.locator('#round_status');
  const vote = async (cards: string[]) => {
    for (const [i, id] of [me, bob, carol, dan].entries()) await post(alice, 'setc.php', { t, id, cardkey: cards[i] });
    await expect(status).toHaveText('revealed');
  };
  const newRound = async () => {
    await post(alice, 'newround.php', { t, id: me });
    await expect(status).not.toHaveText('revealed');
    await expect(line).toBeHidden();
  };

  // one vote with a value (?, ☕ and ∞ have none): no line
  await vote(['five001', 'qstmrk1', 'break01', 'infin01']);
  await expect(alice.locator('#spread_bars [data-card="five001"] .spread-count')).toHaveText('1');
  await expect(line).toBeHidden();

  // odd (3, 5, 13; the ? does not count): through the middle of the 5
  await newRound();
  await vote(['three01', 'five001', 'thrtn01', 'qstmrk1']);
  await expect(line).toBeVisible();
  await expect(line).toHaveAttribute('data-median', '5');
  await expect(line.locator('.sr-only')).toHaveText('Median 5');
  expect(Math.abs(await lineLeft(alice) - await colCenter(alice, 'five001'))).toBeLessThan(1.5);
  // over the bars: from above the bar to its foot, above the value labels (the average pointer stays free)
  const lineBox = (await line.boundingBox())!;
  const bar = (await alice.locator('#spread_bars [data-card="five001"] .spread-bar').boundingBox())!;
  const value = (await alice.locator('#spread_bars [data-card="five001"] .spread-value').boundingBox())!;
  expect(lineBox.y).toBeLessThanOrEqual(bar.y);
  expect(lineBox.y + lineBox.height).toBeLessThanOrEqual(value.y + 1);
  // B-53 fix: it starts on the baseline (the foot of the bar) and lies behind the bars and counts (no patch behind
  // the count any more)
  expect(Math.abs(lineBox.y + lineBox.height - (bar.y + bar.height))).toBeLessThan(1.5);
  expect(await alice.evaluate(() => {
    const z = (sel: string) => Number(getComputedStyle(document.querySelector(sel)!).zIndex);
    return z('#spread_median') < z('#spread_bars')
      && getComputedStyle(document.querySelector('.spread-chart')!).isolation === 'isolate';
  })).toBe(true);
  expect(await alice.locator('#spread_bars [data-card="five001"] .spread-count')
    .evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
  if (SHOTS) await alice.locator('#spread').screenshot({ path: `${SHOTS}/median-odd-dark.png` });

  // even, the middle votes on different cards (3, 3, 8, 13): median 5.5, between the 5 and the 8 by value (a sixth)
  await newRound();
  await vote(['three01', 'three01', 'eight01', 'thrtn01']);
  await expect(line).toHaveAttribute('data-median', '5.5');
  await expect(line.locator('.sr-only')).toHaveText('Median 5.5');
  const c5 = await colCenter(alice, 'five001');
  expect(Math.abs(await lineLeft(alice) - (c5 + (await colCenter(alice, 'eight01') - c5) / 6))).toBeLessThan(1.5);
  if (SHOTS) await alice.locator('#spread').screenshot({ path: `${SHOTS}/median-even-dark.png` });

  // even, both middle votes on the same card (3, 5, 5, ∞ – ∞ does not count: 3, 5, 5): on the 5
  await newRound();
  await vote(['three01', 'five001', 'five001', 'infin01']);
  await expect(line).toHaveAttribute('data-median', '5');
  expect(Math.abs(await lineLeft(alice) - await colCenter(alice, 'five001'))).toBeLessThan(1.5);

  // the switch "Average and median" off in the menu: no line (and no pointer)
  await alice.locator('#cset_btn').click();
  await alice.locator('#cset_tab_results').click();
  await expect(alice.locator('#cet_dark_side legend')).toHaveText('Average and median');
  await alice.locator('input[name=cet_dark_side][value="0"]').check();
  await expect(line).toBeHidden();
  await expect(alice.locator('#spread_index')).toHaveClass(/hidden/);
  await alice.locator('input[name=cet_dark_side][value="1"]').check();
  await expect(line).toBeVisible();
  await alice.keyboard.press('Escape');

  // traffic lights (deck aim perspectives): no line, although the lights have internal values
  await setTeamDeck(alice, url, 'traffic');
  await expect(status).not.toHaveText('revealed');
  await vote(['green01', 'yellow1', 'red0001', 'red0001']);
  await expect(alice.locator('#spread_bars [data-card="red0001"] .spread-count')).toHaveText('2');
  await expect(line).toBeHidden();
});

test('median line by value: 1 and 5 through the empty column 3 (unbroken), 5 and 13 a fifth of the way from 8 to 13 (B-53 fix)',
  async ({ browser }) => {
  // Andreas' cases: two votes; the line used to sit halfway between the two middle columns (1, 5: between 2 and 3)
  const alice = await newPlayer(browser, { viewport: DESKTOP, colorScheme: 'dark', deviceScaleFactor: 2 });
  const url = await createTeam(alice, 'Median Value');
  const t = new URL(url).searchParams.get('t')!;
  await joinAsPlayer(alice, url, 'Alice');
  const me = await alice.evaluate(() => localStorage.getItem('SID')!);
  await setTeamDeck(alice, url, 'fib-classic', null, CONTROLS_ALL);
  await post(alice, 'update_show_avg.php', { t, show_avg: '1' });
  const [bob, carol] = await addPlayersViaApi(alice, url, ['Bob', 'Carol']);
  await alice.reload();
  const line = alice.locator('#spread_median');
  const status = alice.locator('#round_status');
  const vote = async (votes: [string, string][]) => {
    for (const [id, cardkey] of votes) await post(alice, 'setc.php', { t, id, cardkey });
    await expect(status).toHaveText('revealed');
  };
  const newRound = async () => {
    await post(alice, 'newround.php', { t, id: me });
    await expect(status).not.toHaveText('revealed');
  };

  // 1 and 5 (Carol: ?): median 3, through the middle of the empty column 3
  await vote([[me, 'one0001'], [bob, 'five001'], [carol, 'qstmrk1']]);
  await expect(line).toBeVisible();
  if (SHOTS) await alice.locator('#spread').screenshot({ path: `${SHOTS}/median-1-5-dark.png` });
  await expect(line).toHaveAttribute('data-median', '3');
  await expect(line.locator('.sr-only')).toHaveText('Median 3');
  expect(Math.abs(await lineLeft(alice) - await colCenter(alice, 'three01'))).toBeLessThan(1.5);
  // unbroken from the baseline up: the empty count has no patch and no width of its own (its patch cut the line)
  const empty = alice.locator('#spread_bars [data-card="three01"]');
  await expect(empty.locator('.spread-count')).toHaveText('');
  const patch = await empty.locator('.spread-count').evaluate(el => {
    const s = getComputedStyle(el);
    return { bg: s.backgroundColor, w: el.getBoundingClientRect().width };
  });
  expect(patch.bg).toBe('rgba(0, 0, 0, 0)');
  expect(patch.w).toBe(0);
  const lineBox = (await line.boundingBox())!;
  const bar = (await empty.locator('.spread-bar').boundingBox())!;
  expect(Math.abs(lineBox.y + lineBox.height - (bar.y + bar.height))).toBeLessThan(1.5);

  // 5 and 13: median 9, between the 8 and the 13, a fifth of the way from the 8
  await newRound();
  await vote([[me, 'five001'], [bob, 'thrtn01'], [carol, 'qstmrk1']]);
  await expect(line).toHaveAttribute('data-median', '9');
  if (SHOTS) await alice.locator('#spread').screenshot({ path: `${SHOTS}/median-5-13-dark.png` });
  await expect(line.locator('.sr-only')).toHaveText('Median 9');
  const c8 = await colCenter(alice, 'eight01');
  expect(Math.abs(await lineLeft(alice) - (c8 + (await colCenter(alice, 'thrtn01') - c8) / 5))).toBeLessThan(1.5);

  // over a column with votes (5, 13, 13: on the 13): behind its bar and count, which keep no patch
  await newRound();
  await vote([[me, 'five001'], [bob, 'thrtn01'], [carol, 'thrtn01']]);
  await expect(line).toHaveAttribute('data-median', '13');
  expect(Math.abs(await lineLeft(alice) - await colCenter(alice, 'thrtn01'))).toBeLessThan(1.5);
  const count = alice.locator('#spread_bars [data-card="thrtn01"] .spread-count');
  await expect(count).toHaveText('2');
  expect(await count.evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
  if (SHOTS) {
    await alice.locator('#spread').screenshot({ path: `${SHOTS}/median-on-bar-dark.png` });
    await alice.evaluate(() => document.body.classList.add('light-theme'));
    await alice.locator('#spread').screenshot({ path: `${SHOTS}/median-on-bar-light.png` });
    await alice.setViewportSize({ width: 390, height: 844 });
    await expect(line).toBeVisible();
    await alice.locator('#spread').screenshot({ path: `${SHOTS}/median-on-bar-phone-light.png` });
  }
});

test('median line rises above the columns, also above the frame of the current estimate (B-53 fix 2)', async ({ browser }) => {
  // Andreas' case: 5 and 8, median 6.5 between them; the 8 is the current estimate (.est, the highest card while an
  // item is active). The line used to end at the top of the count row, level with the frame of the 8.
  const alice = await newPlayer(browser, { viewport: DESKTOP, colorScheme: 'dark', deviceScaleFactor: 2 });
  const url = await createTeam(alice, 'Median Top');
  const t = new URL(url).searchParams.get('t')!;
  await joinAsPlayer(alice, url, 'Alice');
  const me = await alice.evaluate(() => localStorage.getItem('SID')!);
  await setTeamDeck(alice, url, 'fib-classic', null, CONTROLS_ALL);
  await post(alice, 'update_show_avg.php', { t, show_avg: '1' });
  const [bob] = await addPlayersViaApi(alice, url, ['Bob']);
  await alice.reload();
  const line = alice.locator('#spread_median');
  const status = alice.locator('#round_status');

  /* top and bottom of the line, of the frame of the estimate (or the top of the columns) and of the baseline */
  const geometry = () => alice.evaluate(() => {
    const box = (el: Element) => el.getBoundingClientRect();
    const line = box(document.getElementById('spread_median')!);
    const est = document.querySelector('#spread_bars .spread-col.est');
    const col = box(est ?? document.querySelector('#spread_bars .spread-col')!);
    const bar = box(document.querySelector('#spread_bars [data-card="eight01"] .spread-bar')!);
    const side = box(document.querySelector('.side')!);
    const sideStyle = getComputedStyle(document.querySelector('.side')!);
    return {
      lineTop: line.top, lineBottom: line.bottom, colTop: col.top, base: bar.bottom,
      sideTop: side.top + parseFloat(sideStyle.borderTopWidth), // the top of the padding box: nothing above is shown
    };
  });

  // without an item: no .est, the line still rises above the columns, down to the baseline
  for (const [id, cardkey] of [[me, 'five001'], [bob, 'eight01']]) await post(alice, 'setc.php', { t, id, cardkey });
  await expect(status).toHaveText('revealed');
  await expect(line).toHaveAttribute('data-median', '6.5');
  await expect(alice.locator('#spread_bars .spread-col.est')).toHaveCount(0);
  let g = await geometry();
  expect(g.colTop - g.lineTop).toBeGreaterThanOrEqual(5);
  expect(Math.abs(g.lineBottom - g.base)).toBeLessThan(1.5);

  // an active item: the 8 is the current estimate (blue frame); the line's top lies above the frame's top
  const res = await alice.request.post(`/api/topic_item_add.php?t=${encodeURIComponent(t)}`, { form: { heading: 'Login' } });
  expect(res.ok()).toBeTruthy();
  // a round counts only for the item that was active at its first card (B-52 S1d): play it again under the item
  await post(alice, 'newround.php', { t, id: me });
  for (const [id, cardkey] of [[me, 'five001'], [bob, 'eight01']]) await post(alice, 'setc.php', { t, id, cardkey });
  await expect(status).toHaveText('revealed');
  const est = alice.locator('#spread_bars .spread-col.est');
  await expect(est).toHaveAttribute('data-card', 'eight01');
  await expect(line).toBeVisible();
  g = await geometry();
  expect(g.colTop - g.lineTop).toBeGreaterThanOrEqual(5);
  expect(g.colTop - g.lineTop).toBeLessThanOrEqual(9);
  expect(Math.abs(g.lineBottom - g.base)).toBeLessThan(1.5);
  expect(g.lineTop).toBeGreaterThanOrEqual(g.sideTop); // not cut off on top
  if (SHOTS) await alice.locator('#spread').screenshot({ path: `${SHOTS}/median-5-8-est-dark.png` });
  if (SHOTS) {
    await alice.evaluate(() => document.body.classList.add('light-theme'));
    await alice.locator('#spread').screenshot({ path: `${SHOTS}/median-5-8-est-light.png` });
  }

  // phone: the same, and .side (overflow-y auto) does not clip it
  await alice.setViewportSize({ width: 390, height: 844 });
  await expect(line).toBeVisible();
  g = await geometry();
  expect(g.colTop - g.lineTop).toBeGreaterThanOrEqual(5);
  expect(Math.abs(g.lineBottom - g.base)).toBeLessThan(1.5);
  expect(g.lineTop).toBeGreaterThanOrEqual(g.sideTop);
  if (SHOTS) await alice.locator('#spread').screenshot({ path: `${SHOTS}/median-5-8-est-phone.png` });
});
