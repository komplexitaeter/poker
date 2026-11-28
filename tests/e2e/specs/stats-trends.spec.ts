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
