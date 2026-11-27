import { test, expect, APIRequestContext } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { newPlayer, createTeam, joinAsPlayer, addPlayersViaApi, asUser, tableCard, pageReady, pickCard } from './helpers';

/**
 * B-151 (MCP PR G): the AI assistant in the board.
 * - #ai_btn right of "Invite" opens #ai_dialog: the connector URL (origin + /mcp) with Copy, the board link to copy;
 *   Escape closes it and the focus goes back to #ai_btn.
 * - a seat taken via /mcp (JSON-RPC join_team) shows the AI mark (.via-ai) in front of its name on the card and next to
 *   an observer's name, for everybody else in the browser, with the tooltip "<name> – joined via an AI assistant".
 * - anonymous mode after the reveal: no mark and no "away" on the cards, one line below them (#table_summary) with
 *   ai_count (players and observers) and away_count from dao.php.
 * Times are moved back per SQL (away), the test does not wait.
 */

// same credentials as the test config written by tests/e2e/setup.sh
const DB_ARGS = ['-h127.0.0.1', '-upok_e2e', '-ppok_e2e', 'pok_e2e'];

function sql(statement: string): string {
  return execFileSync('mysql', [...DB_ARGS, '-N', '-B', '-e', statement],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function safe(value: string): string {
  expect(value).toMatch(/^[A-Za-z0-9_-]+$/); // safe to put into the SQL below
  return value;
}

let rpcId = 0;

/** an MCP tool call that must succeed: its structuredContent */
async function mcp(request: APIRequestContext, name: string, args: Record<string, unknown>) {
  const res = await request.post('/mcp', { data: { jsonrpc: '2.0', id: ++rpcId, method: 'tools/call',
                                                   params: { name, arguments: args } } });
  expect(res.status(), await res.text()).toBe(200);
  const result = (await res.json()).result;
  expect(result.isError, JSON.stringify(result)).toBeFalsy();
  return result.structuredContent;
}

test('the AI button opens the dialog: connector URL, copy, Escape returns the focus', async ({ browser }) => {
  const page = await newPlayer(browser, { permissions: ['clipboard-read', 'clipboard-write'] });
  const url = await createTeam(page, 'AI Dialog');
  await joinAsPlayer(page, url, 'Alice');
  await pageReady(page);

  const button = page.locator('#ai_btn');
  const dialog = page.locator('#ai_dialog');
  await expect(button).toBeVisible();
  await expect(button).toHaveAccessibleName('AI assistant');
  await expect(dialog).toBeHidden();

  await button.click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'Play via your AI assistant' })).toBeVisible();
  const origin = new URL(page.url()).origin;
  await expect(page.locator('#ai_url')).toHaveValue(origin + '/mcp');
  await expect(page.locator('#ai_url_copy')).toBeFocused();
  await expect(dialog.locator('.ai-howto')).toHaveAttribute('href', './mcp');
  await expect(dialog).toContainText('Everybody at the table sees this mark next to your name.');

  // copy the connector URL, then the board link
  await page.locator('#ai_url_copy').click();
  await expect(page.locator('#ai_url_copy')).toHaveText('Copied');
  await expect(page.locator('#ai_copy_status')).toHaveText('Connector URL copied');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(origin + '/mcp');
  await page.locator('#ai_board_copy').click();
  await expect(page.locator('#ai_board_copy')).toHaveText('copied');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(url);
  await expect(page.locator('#ai_url_copy')).toHaveText('Copy', { timeout: 5_000 }); // back after 2 s
  await expect(page.locator('#ai_board_copy')).toHaveText('copy link');

  // Escape closes, the focus is back on the button
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(button).toBeFocused();

  // a click into the box's padding keeps it open, a click beside it (backdrop) closes it
  await button.click();
  await expect(dialog).toBeVisible();
  const box = (await dialog.boundingBox())!;
  await page.mouse.click(box.x + 4, box.y + box.height / 2); // left padding: the dialog itself is the target
  await expect(dialog).toBeVisible();
  expect(box.x).toBeGreaterThan(10);
  await page.mouse.click(5, box.y + box.height / 2); // the backdrop left of the box
  await expect(dialog).toBeHidden();
  await expect(button).toBeFocused();

  // copying refused (no clipboard permission here): the board link shows in a prompt, the status says so
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('denied')) } });
  });
  page.once('dialog', d => d.dismiss());
  await button.click();
  await page.locator('#ai_board_copy').click();
  await expect(page.locator('#ai_copy_status')).toHaveText('Copy the board link by hand.');
  await page.locator('#ai_url_copy').click();
  await expect(page.locator('#ai_copy_status')).toHaveText('Copy the selected URL by hand.');
  await expect(page.locator('#ai_url')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  // "Done" closes too; Invite stays one click (no menu)
  await button.click();
  await expect(dialog).toBeVisible();
  await page.locator('#ai_dialog_done').click();
  await expect(dialog).toBeHidden();
  await expect(button).toBeFocused();
  await expect(page.locator('#invite_btn')).not.toHaveAttribute('aria-haspopup', /.*/);
});

test('MCP seats carry the AI mark; anonymous mode after the reveal: only the summary line', async ({ browser }) => {
  test.setTimeout(60_000);
  const page = await newPlayer(browser);
  const url = await createTeam(page, 'AI Marks');
  await joinAsPlayer(page, url, 'Alice');
  await pageReady(page);
  const t = safe(new URL(url).searchParams.get('t') as string);

  // Bob plays via his AI assistant, Mo watches via his; Eve uses the browser (through the API here)
  const bob = (await mcp(page.request, 'join_team', { invite: t, name: 'Bob', role: 'player' })).you;
  await mcp(page.request, 'join_team', { invite: t, name: 'Mo', role: 'observer' });
  const [eve] = await addPlayersViaApi(page, url, ['Eve']);

  const bobCard = tableCard(page, 'Bob');
  await expect(bobCard).toHaveClass(/(^|\s)via-ai(\s|$)/);
  await expect(bobCard.locator('.card_player_name')).toHaveAttribute('title', 'Bob – joined via an AI assistant');
  await expect(tableCard(page, 'Alice')).not.toHaveClass(/(^|\s)via-ai(\s|$)/);
  await expect(tableCard(page, 'Alice').locator('.card_player_name')).toHaveAttribute('title', 'Alice');
  await expect(tableCard(page, 'Eve')).not.toHaveClass(/(^|\s)via-ai(\s|$)/);
  const mo = page.locator('#observers .obs').filter({ hasText: 'Mo' });
  await expect(mo).toHaveClass(/(^|\s)via-ai(\s|$)/);
  await expect(mo.locator('.obs-name')).toHaveAttribute('title', 'Mo – joined via an AI assistant');
  await expect(page.locator('#table_summary')).toBeHidden(); // not anonymous

  // Eve has a card down, then loses her connection (no dao.php load for 2 minutes): "away" on her card
  const res = await page.request.post(`/api/setc.php?${new URLSearchParams({ t, cardkey: 'eight01' })}`, asUser(eve));
  expect(res.ok()).toBeTruthy();
  sql(`update pok_players_tbl set last_callback_time = current_timestamp - interval 120 second
        where team_id = '${t}' and id = '${safe(eve)}'`);
  await page.reload();
  await pageReady(page);
  await expect(tableCard(page, 'Eve')).toHaveClass(/(^|\s)is-away(\s|$)/);
  await expect(bobCard).toHaveClass(/(^|\s)via-ai(\s|$)/);

  // anonymous mode; Bob and Alice play, the cards are revealed
  sql(`update pok_teams_tbl set anonymous_mode = 1, anonymous_request_toggle = 1 where id = '${t}'`);
  await mcp(page.request, 'play_card', { team_id: t, uid: bob.uid, action: 'play', card: '5' });
  await pickCard(page, 'three01');

  const summary = page.locator('#table_summary');
  await expect(summary).toBeVisible();
  await expect(summary.locator('.ts-ai')).toHaveText('2 via AI assistant'); // Bob and Mo
  await expect(summary.locator('.ts-away')).toHaveText('1 away'); // Eve
  await expect(summary).toBeInViewport(); // the cards make room for it (fitCardsToTable)
  await expect(page.locator('#cbox .c')).toHaveCount(3);
  await expect(page.locator('#cbox .c.via-ai')).toHaveCount(0);
  await expect(page.locator('#cbox .c.is-away')).toHaveCount(0);
  await expect(page.locator('#cbox .card_player_name[title*="AI assistant"]')).toHaveCount(0);
  await expect(mo).toHaveClass(/(^|\s)via-ai(\s|$)/); // observers have no card: the mark stays

  // Eve is back: her part drops out
  sql(`update pok_players_tbl set last_callback_time = current_timestamp where team_id = '${t}' and id = '${safe(eve)}'`);
  await page.reload();
  await pageReady(page);
  await expect(summary).toBeVisible();
  await expect(summary.locator('.ts-ai')).toHaveText('2 via AI assistant');
  await expect(summary.locator('.ts-away')).toBeHidden();

  // a new round: covered again, the line goes and the mark is back on Bob's card
  await mcp(page.request, 'round', { team_id: t, uid: bob.uid, action: 'new_round' });
  await expect(summary).toBeHidden();
  await expect(page.locator('#cbox .c.via-ai')).toHaveCount(1);
});
