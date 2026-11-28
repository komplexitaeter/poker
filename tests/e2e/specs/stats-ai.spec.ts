import { test, expect, APIRequestContext } from '@playwright/test';
import { execFileSync } from 'child_process';
import { createHash } from 'crypto';
import { bearer, gotoStats, v1Join } from './helpers';

/**
 * B-160: usage of the public API and the MCP server. Every call of /api/v1 and every tools/call of /mcp is counted per
 * day, channel, operation and status (ok or the error code); persons and teams of successful calls only as hashes.
 * The tab "AI & API" of stats.php shows it, the tab "Trends" has a chart "AI & API". The DB is shared with other specs,
 * so counts are checked with "at least".
 */

const SHOT = process.env.B160_SCREENSHOT;

const mysql = (statement: string) => execFileSync('mysql', ['-h127.0.0.1', '-upok_e2e', '-ppok_e2e', 'pok_e2e',
  '-N', '-B', '-e', statement], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

const usageHash = (value: string) => createHash('sha256').update('usage:' + value).digest('hex').slice(0, 16);

let rpcId = 0;
async function toolCall(request: APIRequestContext, name: string, args: Record<string, unknown>) {
  const res = await request.post('/mcp', { data: { jsonrpc: '2.0', id: ++rpcId, method: 'tools/call', params: { name, arguments: args } } });
  expect(res.status()).toBe(200);
  return res.json();
}

const num = async (page: import('@playwright/test').Page, id: string) =>
  Number(((await page.locator('#' + id).innerText()).match(/^[\d\s]+/) ?? ['NaN'])[0].replace(/\s/g, ''));

test('usage of REST and MCP is counted (hashes only, failures separately) and shown in the stats', async ({ request, page }) => {
  const run = Date.now().toString(36);

  // MCP: a new board (counted with the new seat), the board, a failing tool call and an unknown tool
  const created = await toolCall(request, 'create_team', { name: `Usage ${run}`, member_name: 'Ada', role: 'player' });
  expect(created.result.isError, JSON.stringify(created)).toBeFalsy();
  const { team, you } = created.result.structuredContent;
  const seat = { team_id: team.id as string, uid: you.uid as string };
  const board = await toolCall(request, 'get_board', seat);
  expect(board.result.isError).toBeFalsy();
  const badCard = await toolCall(request, 'play_card', { ...seat, action: 'play', card: 'no-such-card' });
  expect(badCard.result.isError).toBe(true);
  const unknownTool = `no_such_tool_${run}`;
  const unknown = await toolCall(request, unknownTool, seat);
  expect(unknown.error).toBeTruthy();

  // REST: a key for a new person in the board's team, one call with it and one failing call (unknown parameter)
  const member = await v1Join(request, seat.team_id, 'Jira');
  expect((await request.get('/api/v1/board', { headers: member.headers })).status()).toBe(200);
  const bad = await request.get('/api/v1/board?no_such_param=1', { headers: member.headers });
  expect(bad.status()).toBe(400);
  expect((await bad.json()).error).toBe('unknown_param');

  // stored: counters per op and status, the seat and team only as hashes, never the uid, team id or unknown tool name
  const count = (where: string) => Number(mysql(`select ifnull(sum(calls), 0) from pok_api_usage_stats_tbl where day = curdate() and ${where}`));
  expect(count("channel = 'mcp' and op = 'create_team' and status = 'ok'")).toBeGreaterThanOrEqual(1);
  expect(count("channel = 'mcp' and op = 'get_board' and status = 'ok'")).toBeGreaterThanOrEqual(1);
  expect(count("channel = 'mcp' and op = 'play_card:play' and status <> 'ok'")).toBeGreaterThanOrEqual(1);
  expect(count("channel = 'mcp' and op = '(unknown)' and status = 'unknown_tool'")).toBeGreaterThanOrEqual(1);
  expect(count(`op like '%${run}%'`)).toBe(0);
  expect(count("channel = 'rest' and op = 'team_join' and status = 'ok'")).toBeGreaterThanOrEqual(1);
  expect(count("channel = 'rest' and op = 'board_get' and status = 'ok'")).toBeGreaterThanOrEqual(1);
  expect(count("channel = 'rest' and op = 'board_get' and status = 'unknown_param'")).toBeGreaterThanOrEqual(1);
  expect(mysql(`select count(1) from pok_api_users_day_tbl where day = curdate() and channel = 'mcp'
                  and user_hash = '${usageHash(seat.uid)}' and team_hash = '${usageHash(seat.team_id)}'`)).toBe('1');
  expect(mysql(`select count(1) from pok_api_users_day_tbl where day = curdate() and channel = 'rest'
                  and team_hash = '${usageHash(seat.team_id)}'`)).toBe('1');
  expect(mysql(`select count(1) from pok_api_users_day_tbl
                 where user_hash in ('${seat.uid}', '${seat.team_id}') or team_hash = '${seat.team_id}'`)).toBe('0');

  // tab "AI & API"
  await gotoStats(page, '/stats.php?tab=ai');
  await expect(page.locator('.tabs a[aria-current="page"]')).toHaveText('AI & API');
  expect(await num(page, 'ai_mcp_persons_1')).toBeGreaterThanOrEqual(1);
  expect(await num(page, 'ai_mcp_teams_28')).toBeGreaterThanOrEqual(1);
  expect(await num(page, 'ai_rest_persons_7')).toBeGreaterThanOrEqual(1);
  expect(await num(page, 'ai_mcp_calls_1')).toBeGreaterThanOrEqual(2);
  expect(await num(page, 'ai_mcp_errors_1')).toBeGreaterThanOrEqual(2);
  expect(await num(page, 'ai_rest_errors_28')).toBeGreaterThanOrEqual(1);
  expect(await num(page, 'ai_now_seats')).toBeGreaterThanOrEqual(1);
  expect(await num(page, 'ai_keys_total')).toBeGreaterThanOrEqual(1);
  await expect(page.locator('#ai_ops_mcp td.op', { hasText: /^create_team$/ })).toHaveCount(1);
  await expect(page.locator('#ai_ops_mcp td.op', { hasText: /^get_board$/ })).toHaveCount(1);
  await expect(page.locator('#ai_ops_rest td.op', { hasText: /^board_get$/ }).first()).toBeVisible();
  const errorRow = (channel: string, op: string, code: string) => page.locator('#ai_errors tr')
    .filter({ has: page.locator('td', { hasText: new RegExp(`^${channel.replace(/[()]/g, '\\$&')}$`) }) })
    .filter({ has: page.locator('td.op', { hasText: new RegExp(`^${op.replace(/[()]/g, '\\$&')}$`) }) })
    .filter({ has: page.locator('td.op', { hasText: new RegExp(`^${code}$`) }) });
  await expect(errorRow('API (key)', 'board_get', 'unknown_param')).toHaveCount(1);
  await expect(errorRow('MCP', '(unknown)', 'unknown_tool')).toHaveCount(1);
  await expect(page.locator('main')).not.toContainText(seat.uid);
  if (SHOT) await page.screenshot({ path: SHOT, fullPage: true });

  // tab "Trends": the chart "AI & API" with today's persons
  await gotoStats(page, '/stats.php?tab=trends');
  await expect(page.locator('#trend_ai')).toBeVisible();
  const titles = await page.locator('#trend_ai rect.hov title').allTextContents();
  expect(titles.some(t => /\(so far\): MCP persons [1-9]\d*, API persons [1-9]/.test(t)), titles.slice(-2).join(' | ')).toBeTruthy();
  await expect(page.locator('#trend_peaks, .trends .no-data').first()).toBeVisible();
});
