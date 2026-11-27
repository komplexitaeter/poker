import { test, expect, APIRequestContext, Page } from '@playwright/test';
import { mkdirSync } from 'fs';
import { join } from 'path';
import { UID_HEADER, bearer, createTeam, getSid, joinAsPlayer, newPlayer, v1CreateKey } from './helpers';

/**
 * B-151 allow ai (Andreas, data protection: the team can object): team setting "Allow AI assistants"
 * (pok_teams_tbl.allow_ai, default on), Board settings -> Team, written through api/update_team.php (allow_ai = 0/1).
 * Off: every /mcp call of the team is refused with ai_not_allowed (join with the invite link, seat calls, api_key,
 * wait_for_change - a waiting call wakes up through the notify), the board hides #ai_btn and #join_mcp_hint, the live
 * view in the chat stops with a calm line. The REST API with API keys stays open; MCP board_settings cannot change it.
 * ALLOW_AI_SHOTS=<dir> saves screenshots of the setting (light, dark, phone).
 */

const MCP = '/mcp';
const HOST = '/_e2e/mcp-host';
const SHOTS = process.env.ALLOW_AI_SHOTS;
const DESKTOP = { width: 1400, height: 800 };
let rpcId = 0;

async function call(request: APIRequestContext, name: string, args: Record<string, unknown>) {
  const res = await request.post(MCP, { data: { jsonrpc: '2.0', id: ++rpcId, method: 'tools/call',
                                                params: { name, arguments: args } } });
  expect(res.status(), await res.text()).toBe(200);
  return (await res.json()).result as { content: { text: string }[]; structuredContent: any; isError?: boolean };
}

async function ok(request: APIRequestContext, name: string, args: Record<string, unknown>) {
  const result = await call(request, name, args);
  expect(result.isError, JSON.stringify(result)).toBeFalsy();
  return result.structuredContent;
}

async function refused(request: APIRequestContext, name: string, args: Record<string, unknown>) {
  const result = await call(request, name, args);
  expect(result.isError, JSON.stringify(result)).toBe(true);
  expect(result.structuredContent).toEqual({ error: 'ai_not_allowed', message: "This team does not allow AI "
    + "assistants. Ask the team to switch on 'Allow AI assistants' in the board settings." });
}

function setAllowAi(request: APIRequestContext, t: string, value: string) {
  return request.post(`/api/update_team.php?t=${encodeURIComponent(t)}&allow_ai=${encodeURIComponent(value)}`);
}

async function daoOf(request: APIRequestContext, t: string, uid: string) {
  const res = await request.get(`/api/dao.php?t=${encodeURIComponent(t)}`, { headers: { [UID_HEADER]: uid } });
  expect(res.ok()).toBeTruthy();
  return res.json();
}

async function openTeamTab(page: Page) {
  await page.locator('#cset_btn').click();
  await page.locator('#cset_box').getByRole('tab', { name: 'Team' }).click();
  await expect(page.locator('#cet_allow_ai')).toBeVisible();
}

const aiRadio = (page: Page, value: '0' | '1') => page.locator(`input[name=cet_allow_ai][value="${value}"]`);

test('allow_ai: default on, old endpoint toggles it (only 0/1), MCP refused while off, REST keys stay open', async ({ request }) => {
  const created = await ok(request, 'create_team', { name: 'Allow AI', member_name: 'Anna', role: 'player' });
  const t = created.team.id as string;
  const seat = { team_id: t, uid: created.you.uid as string };
  const bob = await ok(request, 'join_team', { invite: t, name: 'Bob', role: 'player' });
  const bobSeat = { team_id: t, uid: bob.you.uid as string };
  const key = await v1CreateKey(request, { headers: { [UID_HEADER]: seat.uid, 'X-Poker-Team': t } }, 'Jira');
  expect((await daoOf(request, t, seat.uid)).allow_ai).toBe(1);

  // MCP cannot change the setting (no such parameter of board_settings)
  const viaMcp = await call(request, 'board_settings', { ...seat, action: 'set', allow_ai: false });
  expect(viaMcp.structuredContent).toMatchObject({ error: 'unknown_param', param: 'allow_ai' });

  expect((await setAllowAi(request, t, '0')).status()).toBe(200);
  expect((await daoOf(request, t, seat.uid)).allow_ai).toBe(0);
  for (const value of ['1abc', '2', 'true', ' 1', '']) { // only exactly "0" or "1"
    expect((await setAllowAi(request, t, value)).status(), `allow_ai=${value}`).toBe(200);
    expect((await daoOf(request, t, seat.uid)).allow_ai, `allow_ai=${value}`).toBe(0);
  }
  expect((await request.get(`/api/update_team.php?t=${t}&allow_ai=1`)).status()).toBe(405); // never via GET

  // off: every way in through /mcp is refused, no new seat appears
  const before = (await daoOf(request, t, seat.uid)).players.length;
  await refused(request, 'join_team', { invite: `https://example.org/?t=${t}`, name: 'Carl', role: 'player' });
  await refused(request, 'join_team', { api_key: key.key });
  await refused(request, 'get_board', seat);
  await refused(request, 'play_card', { ...bobSeat, action: 'play', card: '5' });
  await refused(request, 'show_board', seat);
  await refused(request, 'wait_for_change', { ...seat, since: 'abc', timeout: 2 });
  await refused(request, 'get_board', { api_key: key.key });
  expect((await daoOf(request, t, seat.uid)).players.length).toBe(before);
  // a wrong uid still gets not_a_member (no hint about the team's setting for strangers)
  expect((await call(request, 'get_board', { team_id: t, uid: 'AAAAAAAAAAAAAAAA' })).structuredContent.error).toBe('not_a_member');

  // the REST API with the same key keeps working
  const rest = await request.get('/api/v1/team', { headers: bearer(key.key) });
  expect(rest.status(), await rest.text()).toBe(200);
  expect((await rest.json()).team.id).toBe(t);

  // on again: the seats work as before
  expect((await setAllowAi(request, t, '1')).status()).toBe(200);
  expect((await daoOf(request, t, seat.uid)).allow_ai).toBe(1);
  expect((await ok(request, 'get_board', seat)).you.name).toBe('Anna');
  expect((await ok(request, 'get_board', { api_key: key.key })).you.name).toBe('Anna');
});

test('allow_ai off wakes a waiting wait_for_change, which answers ai_not_allowed', async ({ request }) => {
  const created = await ok(request, 'create_team', { name: 'Allow AI Wait', member_name: 'Anna', role: 'player' });
  const t = created.team.id as string;
  const seat = { team_id: t, uid: created.you.uid as string };
  const version = (await ok(request, 'get_board', seat)).version as string;
  const started = Date.now();
  const waiting = call(request, 'wait_for_change', { ...seat, since: version, timeout: 20 });
  await new Promise(resolve => setTimeout(resolve, 1_000)); // the call waits at poker-msg
  expect((await setAllowAi(request, t, '0')).status()).toBe(200);
  const result = await waiting;
  expect(Date.now() - started).toBeLessThan(10_000);
  expect(result.isError, JSON.stringify(result)).toBe(true);
  expect(result.structuredContent.error).toBe('ai_not_allowed');
});

test('Board settings -> Team: "Allow AI assistants" hides the AI button and the join hint on every board', async ({ browser }) => {
  const alice = await newPlayer(browser, { viewport: DESKTOP });
  const url = await createTeam(alice, 'Allow AI UI');
  await joinAsPlayer(alice, url, 'Alice');
  const bob = await newPlayer(browser, { viewport: DESKTOP });
  await joinAsPlayer(bob, url, 'Bob');
  const t = new URL(url).searchParams.get('t') as string;

  const measured: string[] = [];
  alice.on('request', r => {
    if (r.url().includes('/api/measure_event.php')) measured.push(new URL(r.url()).searchParams.get('event_code') ?? '');
  });
  for (const page of [alice, bob]) await expect(page.locator('#ai_btn')).toBeVisible();

  await openTeamTab(alice);
  await expect(aiRadio(alice, '1')).toBeChecked();
  await expect(alice.locator('#cet_allow_ai legend')).toHaveText('Allow AI assistants');
  await expect(alice.locator('#cet_allow_ai .hint')).toHaveText('Members can join or follow this board with an AI '
    + 'assistant (Claude, ChatGPT …). Their board content goes to that AI provider.');

  // off: the AI button disappears on both boards without a reload
  await aiRadio(alice, '0').check();
  for (const page of [alice, bob]) await expect(page.locator('#ai_btn')).toBeHidden();
  await expect.poll(() => measured).toContain('AI_ALLOW_OFF');
  const sid = await getSid(alice);
  expect((await (await alice.request.get(`/api/dao.php?t=${encodeURIComponent(t)}`,
    { headers: { [UID_HEADER]: sid } })).json()).allow_ai).toBe(0);

  // a new visitor: the join overlay has no AI hint
  const carl = await newPlayer(browser, { viewport: DESKTOP });
  await carl.goto(url);
  await expect(carl.locator('#overlay_name_input')).toBeVisible();
  await expect(carl.locator('#become_player_btn')).toBeVisible();
  await expect(carl.locator('#join_mcp_hint')).toBeHidden();

  // survives a reload; Bob switches it on again, both boards show the button again
  await bob.reload();
  await expect(bob.locator('#team_name')).toHaveText('Allow AI UI');
  await expect(bob.locator('#ai_btn')).toBeHidden();
  await openTeamTab(bob);
  await expect(aiRadio(bob, '0')).toBeChecked();
  await aiRadio(bob, '1').check();
  for (const page of [alice, bob]) await expect(page.locator('#ai_btn')).toBeVisible();
  await expect(carl.locator('#join_mcp_hint')).toBeVisible();
});

test('the live view in the chat stops with a calm line when the team switches AI assistants off', async ({ request, browser }) => {
  test.setTimeout(60_000);
  const created = await ok(request, 'create_team', { name: 'Allow AI View', member_name: 'Anna', role: 'player' });
  const seat = { team_id: created.team.id as string, uid: created.you.uid as string };
  const host = await newPlayer(browser);
  await host.route(`**${HOST}`, route => route.fulfill({ path: join(__dirname, '../fixtures/mcp-host.html'),
                                                          contentType: 'text/html; charset=utf-8' }));
  await host.goto(HOST);
  await host.evaluate(s => (window as any).openView(s, 'light'), seat);
  const view = host.frameLocator('iframe[data-view="0"]');
  await expect(view.locator('#conn')).toHaveText('Live');
  await expect.poll(() => host.evaluate(() => (window as any).toolCalls.includes('wait_for_change'))).toBe(true);

  expect((await setAllowAi(request, seat.team_id, '0')).status()).toBe(200);
  await expect(view.locator('#conn')).toHaveText('AI assistants are switched off for this board.', { timeout: 5_000 });
  await expect(view.locator('#status')).toHaveText('AI assistants are switched off for this board.');
  await expect(view.locator('#error')).toBeHidden();
  await expect(view.locator('#hand-wrap')).toBeHidden();
  await expect(view.locator('#resume')).toBeHidden();
  const calls = await host.evaluate(() => (window as any).toolCalls.length);
  await host.waitForTimeout(1_500);
  expect(await host.evaluate(() => (window as any).toolCalls.length)).toBe(calls); // no more calls
});

test('help page /mcp and the AI dialog say that a team can switch AI assistants off', async ({ request, browser }) => {
  const help = await request.get(MCP);
  expect(await help.text()).toContain('A team can switch AI assistants off for its board');
  const page = await newPlayer(browser, { viewport: DESKTOP });
  const url = await createTeam(page, 'Allow AI Dialog');
  await joinAsPlayer(page, url, 'Alice');
  await page.locator('#ai_btn').click();
  await expect(page.locator('#ai_dialog')).toContainText('The team can switch AI assistants off in the board settings.');
});

test('screenshots of the setting (light, dark, phone)', async ({ browser }) => {
  test.skip(!SHOTS, 'ALLOW_AI_SHOTS not set');
  mkdirSync(SHOTS as string, { recursive: true });
  const cases = [
    { name: 'allow-ai-light.png', options: { viewport: DESKTOP, colorScheme: 'light' as const } },
    { name: 'allow-ai-dark.png', options: { viewport: DESKTOP, colorScheme: 'dark' as const } },
    { name: 'allow-ai-phone.png', options: { viewport: { width: 390, height: 844 }, colorScheme: 'light' as const,
                                             isMobile: true, hasTouch: true } },
  ];
  for (const c of cases) {
    const page = await newPlayer(browser, c.options);
    const url = await createTeam(page, 'Allow AI Shot');
    await joinAsPlayer(page, url, 'Alice');
    await page.evaluate(m => { if ((window as any).gColorMode !== m) (window as any).switchColorMode(); }, c.options.colorScheme);
    if (c.options.viewport.width < 600) {
      await page.locator('#menu_btn').click();
      await page.locator('#menu_index button[data-open=cset]').click();
      await page.locator('#cset_box').getByRole('tab', { name: 'Team' }).click();
    } else {
      await openTeamTab(page);
    }
    await expect(page.locator('#cet_allow_ai')).toBeVisible();
    await page.waitForTimeout(400);
    await page.screenshot({ path: join(SHOTS as string, c.name) });
    await page.close();
  }
});
