import { test, expect, APIRequestContext, Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { createTeam, expectTableCard, joinAsPlayer, newPlayer } from './helpers';

/**
 * B-151 PR F2: the MCP tools timer and feedback (docs/mcp-concept.md 5.3) - same core functions as the board
 * (timer.php -> api/lib_core_timer.php; feedback.php, vote_roadmap.php -> api/lib_core_feedback.php).
 */

const MCP = '/mcp';
const DB_ARGS = ['-h127.0.0.1', '-upok_e2e', '-ppok_e2e', 'pok_e2e'];
let rpcId = 0;

type ToolResult = { content: { type: string; text: string }[]; structuredContent: any; isError?: boolean };

async function call(request: APIRequestContext, name: string, args: Record<string, unknown> = {}): Promise<ToolResult> {
  const res = await request.post(MCP, { data: { jsonrpc: '2.0', id: ++rpcId, method: 'tools/call', params: { name, arguments: args } } });
  expect(res.status(), await res.text()).toBe(200);
  const answer = await res.json();
  expect(answer.error, JSON.stringify(answer)).toBeUndefined();
  return answer.result;
}

async function ok(request: APIRequestContext, name: string, args: Record<string, unknown> = {}) {
  const result = await call(request, name, args);
  expect(result.isError, JSON.stringify(result)).toBeFalsy();
  return { data: result.structuredContent, text: result.content[0].text };
}

async function fails(request: APIRequestContext, name: string, args: Record<string, unknown>, error: string, param?: string) {
  const result = await call(request, name, args);
  expect(result.isError, JSON.stringify(result)).toBe(true);
  expect(result.structuredContent).toMatchObject(param === undefined ? { error } : { error, param });
}

const shown = (page: Page, expression: string) => expect.poll(() => page.evaluate(`gLastJson && (${expression})`));

async function tableWithAgent(browser: any, request: APIRequestContext, teamName: string) {
  const alice = await newPlayer(browser);
  const url = await createTeam(alice, teamName);
  await joinAsPlayer(alice, url, 'Alice');
  const t = new URL(url).searchParams.get('t') as string;
  const anna = (await ok(request, 'join_team', { invite: url, name: 'Anna', role: 'observer' })).data.you;
  await expect(alice.locator('#observers')).toContainText('Anna');
  return { alice, t, seat: { team_id: t, uid: anna.uid as string } };
}

test('timer: every web function, the browser follows', async ({ browser, request }) => {
  const { alice, seat } = await tableWithAgent(browser, request, 'MCP Timer');

  await fails(request, 'timer', { ...seat, action: 'set_timebox' }, 'missing_param', 'minutes');
  await fails(request, 'timer', { ...seat, action: 'set_timebox', minutes: 241 }, 'invalid_param', 'minutes');
  await fails(request, 'timer', { ...seat, action: 'set_mode', mode: 'hourglass' }, 'invalid_param', 'mode');
  await fails(request, 'timer', { ...seat, action: 'toggle' }, 'invalid_param', 'action');

  let r = await ok(request, 'timer', { ...seat, action: 'set_mode', mode: 'timer' });
  r = await ok(request, 'timer', { ...seat, action: 'set_timebox', minutes: 5 });
  expect(r.data.board.timer).toMatchObject({ mode: 'timer', timebox_seconds: 300, status: 'paused', visible: false });
  r = await ok(request, 'timer', { ...seat, action: 'show' });
  expect(r.data.board.timer.visible).toBe(true);
  await shown(alice, 'gLastJson.timer_visibility').toBe(1);
  await shown(alice, 'gLastJson.timer_timebox').toBe(300);
  await shown(alice, 'gLastJson.timer_mode').toBe('TIMER');

  r = await ok(request, 'timer', { ...seat, action: 'start' });
  expect(r.data.board.timer.status).toBe('running');
  expect(r.text).toContain('timer running');
  expect(r.text).toContain('countdown (timebox 5 min)');
  await shown(alice, 'gLastJson.timer_status').toBe('RUNNING');
  // start while running changes nothing (the web would only offer pause)
  expect((await ok(request, 'timer', { ...seat, action: 'start' })).text).toContain('Nothing to do');

  r = await ok(request, 'timer', { ...seat, action: 'pause' });
  expect(r.data.board.timer.status).toBe('paused');
  await shown(alice, 'gLastJson.timer_status').toBe('PAUSED');
  expect((await ok(request, 'timer', { ...seat, action: 'pause' })).text).toContain('Nothing to do');
  r = await ok(request, 'timer', { ...seat, action: 'reset' });
  expect(r.data.board.timer).toMatchObject({ status: 'paused', seconds: 0 });

  r = await ok(request, 'timer', { ...seat, action: 'set_auto_start', auto_start: 'next_item' });
  expect(r.data.board.timer.auto_start).toBe('next_item');
  await shown(alice, 'gLastJson.timer_auto_restart').toBe(2);
  r = await ok(request, 'timer', { ...seat, action: 'hide' });
  expect(r.data.board.timer.visible).toBe(false);
  await shown(alice, 'gLastJson.timer_visibility').toBe(0);
});

test('feedback: send to the makers, roadmap list and vote', async ({ browser, request }) => {
  const { seat } = await tableWithAgent(browser, request, 'MCP Feedback');

  await fails(request, 'feedback', { ...seat, action: 'send', type: 'bug' }, 'missing_param', 'text');
  await fails(request, 'feedback', { ...seat, action: 'send', type: 'bug', text: '   ' }, 'invalid_param', 'text');
  await fails(request, 'feedback', { ...seat, action: 'send', type: 'praise', text: 'x' }, 'invalid_param', 'type');
  const text = `MCP bug report ${Date.now()}`;
  const sent = await ok(request, 'feedback', { ...seat, action: 'send', type: 'bug', text });
  expect(sent.text).toContain('sent to the makers');
  const row = execFileSync('mysql', [...DB_ARGS, '-N', '-B', '-e',
    `select fb_type, fb_stars, coalesce(fb_context, '-'), id = '${seat.uid}' from pok_feedback_tbl where fb_text = '${text}'`],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  expect(row).toBe('BUG\t0\tMCP (AI assistant)\t1'); // the person, no team

  const roadmap = await ok(request, 'feedback', { ...seat, action: 'roadmap' });
  expect(roadmap.data.entries.length).toBeGreaterThan(0);
  const entry = roadmap.data.entries[0];
  expect(Object.keys(entry)).toEqual(['entry', 'type', 'title', 'description', 'status', 'up', 'down', 'your_vote']);
  expect(entry.your_vote).toBe('none');
  expect(roadmap.text).toContain(`entry ${entry.entry}`);

  const up = await ok(request, 'feedback', { ...seat, action: 'vote', entry: entry.entry, reaction: 'up' });
  expect(up.data.entry).toMatchObject({ entry: entry.entry, up: entry.up + 1, your_vote: 'up' });
  const none = await ok(request, 'feedback', { ...seat, action: 'vote', entry: entry.entry, reaction: 'none' });
  expect(none.data.entry).toMatchObject({ up: entry.up, your_vote: 'none' });
  await fails(request, 'feedback', { ...seat, action: 'vote', entry: 999999, reaction: 'up' }, 'entry_not_found', 'entry');
  await fails(request, 'feedback', { ...seat, action: 'vote', entry: entry.entry, reaction: 'maybe' }, 'invalid_param', 'reaction');
});
