import { test, expect, Page } from '@playwright/test';
import { newPlayer, createTeam, joinAsPlayer, addPlayersViaApi, setTeamDeck, CONTROLS_ALL } from './helpers';

/**
 * B-53: the median as a dashed line in the spread of the results panel (#spread_median), coupled to the team switch
 * "Average and median" (show_avg). Only votes on cards with a numeric value count (no control cards, no ∞), only
 * for decks that aim to agree, from two such votes on. Odd number: through the middle of the column of the middle
 * vote; even: halfway between the columns of the two middle votes.
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

test('median line: on the middle column, between two columns, ignores control cards and ∞, follows the switch and the deck aim (B-53)',
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
  await expect(line).toHaveAttribute('data-median', 'five001');
  await expect(line.locator('.sr-only')).toHaveText('Median 5');
  expect(Math.abs(await lineLeft(alice) - await colCenter(alice, 'five001'))).toBeLessThan(1.5);
  // the count of the column it runs through stays readable (on a patch of the background)
  await expect(alice.locator('#spread_bars .spread-col.median')).toHaveCount(1);
  await expect(alice.locator('#spread_bars [data-card="five001"]')).toHaveClass(/median/);
  // over the bars: from above the bar to its foot, above the value labels (the average pointer stays free)
  const lineBox = (await line.boundingBox())!;
  const bar = (await alice.locator('#spread_bars [data-card="five001"] .spread-bar').boundingBox())!;
  const value = (await alice.locator('#spread_bars [data-card="five001"] .spread-value').boundingBox())!;
  expect(lineBox.y).toBeLessThanOrEqual(bar.y);
  expect(lineBox.y + lineBox.height).toBeLessThanOrEqual(value.y + 1);
  if (SHOTS) await alice.locator('#spread').screenshot({ path: `${SHOTS}/median-odd-dark.png` });

  // even, the middle votes on different cards (3, 3, 8, 13): halfway between the 3 and the 8 (the 5 lies between)
  await newRound();
  await vote(['three01', 'three01', 'eight01', 'thrtn01']);
  await expect(line).toHaveAttribute('data-median', 'three01,eight01');
  await expect(alice.locator('#spread_bars [data-card="three01"]')).not.toHaveClass(/median/);
  await expect(line.locator('.sr-only')).toHaveText('Median between 3 and 8');
  const between = (await colCenter(alice, 'three01') + await colCenter(alice, 'eight01')) / 2;
  expect(Math.abs(await lineLeft(alice) - between)).toBeLessThan(1.5);
  expect(Math.abs(between - await colCenter(alice, 'five001'))).toBeLessThan(1.5);
  if (SHOTS) await alice.locator('#spread').screenshot({ path: `${SHOTS}/median-even-dark.png` });

  // even, both middle votes on the same card (3, 5, 5, ∞ – ∞ does not count: 3, 5, 5): on the 5
  await newRound();
  await vote(['three01', 'five001', 'five001', 'infin01']);
  await expect(line).toHaveAttribute('data-median', 'five001');
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
