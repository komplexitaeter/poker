import { test, expect } from '@playwright/test';
import { execFileSync } from 'child_process';
import { newPlayer, createTeam, joinAsPlayer, pickCard, gotoStats, deckCard } from './helpers';

/**
 * B-13: tab "Trends" in stats.php (replaces the Grafana dashboard): range (?range=) and granularity (?gran=) as
 * whitelisted GET parameters, four charts from the statistics tables. The event jobs do not run in the test DB, so the
 * test writes a few rows into the statistics tables itself.
 */

const mysql = (statement: string) => execFileSync('mysql', ['-h127.0.0.1', '-upok_e2e', '-ppok_e2e', 'pok_e2e',
  '-N', '-B', '-e', statement], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

test.beforeAll(() => {
  const run = Date.now().toString(36);
  // Monday of last week two teams (one recurring, one exploring), the recurring one also on Tuesday (same ISO week)
  const monday = 'curdate() - interval (weekday(curdate()) + 7) day';
  mysql(`insert ignore into pok_daily_teams_stats (creation_date, id, name, team_creation_date, active_players, team_type)
         values (${monday}, 'trA${run}', 'Trend A', now(), 4, 'RECURRING'),
                (${monday}, 'trB${run}', 'Trend B', now(), 1, 'EXPLORING'),
                (${monday} + interval 1 day, 'trA${run}', 'Trend A', now(), 3, 'RECURRING')`);
  mysql(`insert into pok_active_user_stats values
           (now() - interval 1 day, 120, 40, 25, 12, 3),
           (now() - interval 1 day + interval 1 minute, 130, 45, 30, 15, 0),
           (now() - interval 2 hour, 90, 20, 10, 5, 2)`);
  mysql(`insert ignore into pok_active_use_stats_tbl values
           (now() - interval 1 day + interval 7 second, 14, 3),
           (now() - interval 3 hour + interval 7 second, 9, 2)`);
});

test('trends tab: range and granularity links, charts with seeded data', async ({ browser }) => {
  // one finished round, so "New rounds" has data for today
  const page = await newPlayer(browser);
  const url = await createTeam(page, `Trends ${Date.now().toString(36)}`);
  await joinAsPlayer(page, url, 'Tre');
  await pickCard(page, 'three01');
  await page.locator('#newroundbtn').click();
  await expect(deckCard(page, 'three01')).not.toHaveClass(/selected/);

  const admin = await page.context().newPage();
  await gotoStats(admin, '/stats.php?tab=trends');
  await expect(admin.locator('.tabs a[aria-current="page"]')).toHaveText('Trends');
  await expect(admin.locator('meta[http-equiv="refresh"]')).toHaveCount(0);

  // default: 4 weeks per day
  await expect(admin.locator('#trend_range a.active')).toHaveText('4 weeks');
  await expect(admin.locator('#trend_gran a.active')).toHaveText('Days');
  await expect(admin.locator('#trend_teams .day')).toHaveCount(28);
  await expect(admin.locator('#trend_rounds .day')).toHaveCount(28);
  await expect(admin.locator('#trend_rounds .day.current')).toHaveCount(1);
  expect(Number(await admin.locator('#trend_rounds .day.current').getAttribute('data-value'))).toBeGreaterThanOrEqual(1);
  const teamValues = await admin.locator('#trend_teams .day').evaluateAll(els => els.map(e => Number(e.getAttribute('data-value'))));
  expect(Math.max(...teamValues)).toBeGreaterThanOrEqual(2);
  await expect(admin.locator('#trend_teams .day.weekend')).toHaveCount(8);
  await expect(admin.locator('#trend_peaks rect.hov')).toHaveCount(28);
  expect(await admin.locator('#trend_peaks polyline').count()).toBeGreaterThanOrEqual(5);
  await expect(admin.locator('#trend_active_use rect.hov')).toHaveCount(28);
  // tooltip of the peak with all five series
  const peakTitles = await admin.locator('#trend_peaks rect.hov title').allTextContents();
  expect(peakTitles.some(t => /day 1\d\d, hour \d+, 30 min \d+, 10 min \d+, 1 min \d+/.test(t))).toBeTruthy();

  // granularity link keeps the range
  await admin.locator('#trend_gran a', { hasText: 'Weeks' }).click();
  await expect(admin).toHaveURL(/tab=trends&range=4w&gran=week/);
  await expect(admin.locator('#trend_gran a.active')).toHaveText('Weeks');
  const weeks = await admin.locator('#trend_teams .day').count();
  expect(weeks).toBeGreaterThanOrEqual(4);
  expect(weeks).toBeLessThanOrEqual(5);
  // distinct teams per week: team A on two days counts once
  const weekValues = await admin.locator('#trend_teams .day').evaluateAll(els => els.map(e => Number(e.getAttribute('data-value'))));
  expect(weekValues.reduce((a, b) => a + b, 0)).toBeLessThan(teamValues.reduce((a, b) => a + b, 0));

  // range link keeps an explicitly chosen granularity
  await admin.locator('#trend_range a', { hasText: '1 year' }).click();
  await expect(admin).toHaveURL(/tab=trends&range=1y&gran=week/);
  const yearWeeks = await admin.locator('#trend_rounds .day').count();
  expect(yearWeeks).toBeGreaterThanOrEqual(53);
  expect(yearWeeks).toBeLessThanOrEqual(54);

  // without gran the range brings its default (All: months, from the first period with data)
  await gotoStats(admin, '/stats.php?tab=trends&range=all');
  await expect(admin.locator('#trend_gran a.active')).toHaveText('Months');
  expect(await admin.locator('#trend_rounds .day').count()).toBeGreaterThanOrEqual(1);

  // unknown values: defaults
  await gotoStats(admin, '/stats.php?tab=trends&range=x&gran=%3Cb%3E');
  await expect(admin.locator('#trend_range a.active')).toHaveText('4 weeks');
  await expect(admin.locator('#trend_gran a.active')).toHaveText('Days');

  // every combination renders without a query error
  for (const range of ['1w', '4w', '6m', '1y', '2y', 'all']) {
    for (const gran of ['day', 'week', 'month']) {
      const res = await admin.request.get(`./stats.php?tab=trends&range=${range}&gran=${gran}`);
      expect(res.ok()).toBeTruthy();
      const html = await res.text();
      expect(html, `${range}/${gran}`).not.toContain('Query failed');
      expect(html, `${range}/${gran}`).toContain('id="trend_peaks"');
    }
  }
});

test('milestones: no list under the charts, label in the tooltips, switch hides the lines (remembered)', async ({ page }) => {
  // one year per week: the rollouts of MILESTONES (from 2026-10-28) are inside for a year
  await gotoStats(page, '/stats.php?tab=trends&range=1y&gran=week');
  const main = page.locator('main');
  await expect(page.locator('.milestone-label, .trend-ms')).toHaveCount(0);
  await expect(main).not.toContainText('Rollout 1 (2026-10-28)', { useInnerText: true });

  // tooltips: bar column of the week and the wide hit area of the SVG line name the milestone
  const msBar = page.locator('#trend_rounds .day.milestone').first();
  await expect(msBar).toHaveAttribute('title', /· Milestones?: .*\(20\d\d-\d\d-\d\d\)/);
  const hit = page.locator('#trend_peaks line.ms-hit title').first();
  await expect(hit).toHaveText(/Milestones?: .*\(20\d\d-\d\d-\d\d\)/);
  // a vertical SVG line has no width, so Playwright's visibility does not apply: the computed display
  const shown = (loc: import('@playwright/test').Locator) => loc.evaluate(e => getComputedStyle(e).display !== 'none');
  const line = page.locator('#trend_peaks line.ms').first();
  expect(await shown(line)).toBe(true);

  // the switch: off hides the lines on the page, stays off after a reload and on other tabs
  const toggle = page.locator('#ms_toggle');
  await expect(toggle).toBeChecked();
  await toggle.uncheck();
  await expect(page.locator('html')).toHaveClass(/(^|\s)no-ms(\s|$)/);
  expect(await shown(line)).toBe(false);
  expect(await shown(page.locator('#trend_peaks line.ms-hit').first())).toBe(false);
  expect(await msBar.evaluate(e => getComputedStyle(e).boxShadow)).toBe('none');
  await page.reload();
  await expect(page.locator('html')).toHaveClass(/(^|\s)no-ms(\s|$)/);
  await expect(page.locator('#ms_toggle')).not.toBeChecked();
  expect(await shown(page.locator('#trend_peaks line.ms').first())).toBe(false);
  await gotoStats(page, '/stats.php?tab=usage');
  await expect(page.locator('#ms_toggle')).not.toBeChecked();
  await expect(page.locator('.milestone-label')).toHaveCount(0);
  await page.locator('#ms_toggle').check();
  await expect(page.locator('html')).not.toHaveClass(/(^|\s)no-ms(\s|$)/);
  await gotoStats(page, '/stats.php?tab=trends&range=1y&gran=week');
  expect(await shown(page.locator('#trend_peaks line.ms').first())).toBe(true);
  expect(await page.locator('#trend_rounds .day.milestone').first().evaluate(e => getComputedStyle(e).boxShadow)).not.toBe('none');
});

test('SVG chart tooltip stays inside the viewport, legend of "Active use", note on the heartbeat', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await gotoStats(page, '/stats.php?tab=trends&range=4w');
  const tip = page.locator('#chart_tip');
  await expect(tip).toBeHidden();
  const plot = page.locator('.trend-plot:has(#trend_peaks)');
  await plot.scrollIntoViewIfNeeded();
  const box = (await plot.boundingBox())!;
  // first and last period: centred over the pointer the text would run over the left / right edge
  for (const x of [box.x + 2, box.x + box.width - 2]) {
    await page.mouse.move(x, box.y + box.height / 2);
    await expect(tip).toBeVisible();
    await expect(tip).toContainText(/20\d\d-\d\d-\d\d/); // a period or a milestone line at the edge
    const t = (await tip.boundingBox())!;
    expect(t.x).toBeGreaterThanOrEqual(0);
    expect(t.x + t.width).toBeLessThanOrEqual(390);
    expect(t.y).toBeGreaterThanOrEqual(0);
  }
  // the native <title> is gone after the first hover (no double tooltip)
  expect(await page.locator('#trend_peaks [data-tip]').count()).toBeGreaterThanOrEqual(2);
  await expect(page.locator('#trend_peaks [data-tip] > title')).toHaveCount(0);
  await page.mouse.move(5, 5);
  await expect(tip).toBeHidden();

  const legend = page.locator('h3:has-text("Active use") + p.legend');
  await expect(legend).toContainText('players');
  await expect(legend).toContainText('teams');
  await expect(page.locator('p.note', { hasText: 'counts open boards rather than active people' })).toContainText('pok_active_user_stats');
  await expect(page.locator('main')).not.toContainText('disabled on live');
});

test('trends cache: the first load fills completed days, the next reads them, today stays live', async ({ page }) => {
  mysql('delete from pok_trend_daily_tbl');
  await gotoStats(page, '/stats.php?tab=trends&range=4w');
  const titles = () => page.locator('#trend_peaks rect.hov title').allTextContents();
  const first = await titles();
  // completed days stored (with the row marker), never today or later in the viewer's offset
  expect(Number(mysql("select count(1) from pok_trend_daily_tbl where metric = 'peak_n'"))).toBeGreaterThanOrEqual(1); // from the first day with data
  expect(mysql(`select count(1) from pok_trend_daily_tbl
                 where day >= date(convert_tz(utc_timestamp(), '+00:00', tz))`)).toBe('0');

  // second load: the same values, now from the cache
  await page.reload();
  expect(await titles()).toEqual(first);
  const [tz, day] = mysql(`select tz, day from pok_trend_daily_tbl where metric = 'peak_1m'
                            order by day desc limit 1`).split('\t');
  mysql(`update pok_trend_daily_tbl set val = 4242 where tz = '${tz}' and day = '${day}' and metric = 'peak_1m'`);
  await page.reload();
  expect((await titles()).find(t => t.includes(day))).toContain('1 min 4 242');

  // today is computed on every load
  mysql(`insert into pok_active_user_stats values (now() + interval 13 second, 900, 800, 700, 600, 777)`);
  await page.reload();
  expect((await titles()).find(t => t.includes('(so far)'))).toContain('1 min 777');
  mysql('delete from pok_trend_daily_tbl');
});
