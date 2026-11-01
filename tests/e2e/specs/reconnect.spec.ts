import { test, expect, Page, WebSocketRoute } from '@playwright/test';
import { newPlayer, createTeam, joinAsPlayer, teamWithTwoPlayers, pickCard, expectTableCard } from './helpers';

/**
 * B-81: the connection to poker-msg only receives ('pull' after a change of the team, 'hb' every 30 s); the board
 * never sends 'push' and loads the board itself after an own write. A connection that is closed or silent for
 * more than 40 s (no 'hb', no 'pull') is rebuilt (B-82), and a new connection is built when the tab becomes
 * visible again. B-86: while the connection is down #conn_hint covers the board after a short delay and vanishes
 * by itself when the connection is back.
 *
 * page.routeWebSocket() sits between the board and poker-msg: messages are passed through, the test can close
 * the connection, refuse new ones, swallow everything from poker-msg or send an 'hb' itself.
 */

type MsgProxy = {
  connections: number;    // connections the page opened
  silent: boolean;        // swallow everything from poker-msg ('pull', 'hb'): a half open connection
  refuse: boolean;        // close new connections at once (poker-msg not reachable)
  sent: string[];         // messages the page sent to poker-msg
  current: WebSocketRoute | null;
};

async function proxyPokerMsg(page: Page): Promise<MsgProxy> {
  const proxy: MsgProxy = { connections: 0, silent: false, refuse: false, sent: [], current: null };
  await page.routeWebSocket(/\/poker-msg$/, ws => {
    proxy.connections++;
    if (proxy.refuse) {
      ws.close();
      return;
    }
    proxy.current = ws;
    const server = ws.connectToServer();
    ws.onMessage(message => {
      proxy.sent.push(String(message));
      server.send(message);
    });
    server.onMessage(message => {
      if (proxy.silent) return;
      ws.send(message);
    });
  });
  return proxy;
}

/** Board of a player with the proxy in front of poker-msg (reloads, so the proxy sees the connection). */
async function withProxy(page: Page): Promise<MsgProxy> {
  const proxy = await proxyPokerMsg(page);
  await page.reload();
  await expect.poll(() => page.evaluate('gConn.readyState')).toBe(1);
  await expect(page.locator('#conn_hint')).toBeHidden();
  return proxy;
}

/** Records whether #conn_hint was shown at any moment. */
async function watchConnHint(page: Page): Promise<void> {
  await page.evaluate(`(() => {
    window.connHintShown = false;
    const hint = document.getElementById('conn_hint');
    new MutationObserver(() => { if (!hint.hidden) window.connHintShown = true; })
      .observe(hint, { attributes: true, attributeFilter: ['hidden'] });
  })()`);
}

test('the board sends no push: writes update the own board without a pull, the others via the API (B-81)', async ({ browser }) => {
  const { alice, bob } = await teamWithTwoPlayers(browser, 'Reconnect No Push');
  const proxy = await withProxy(alice);

  // nothing reaches Alice from poker-msg: her board has to load itself after her writes
  proxy.silent = true;
  await pickCard(alice, 'three01');
  await expectTableCard(alice, 'Alice', 'done001');
  await expectTableCard(bob, 'Alice', 'done001');

  await alice.locator('#newroundbtn').click();
  await expectTableCard(alice, 'Alice', 'prgrss1');
  await expectTableCard(bob, 'Alice', 'prgrss1');

  // the page only subscribed, it never sent 'push'
  expect(proxy.sent.length).toBeGreaterThan(0);
  expect(proxy.sent.every(message => message.startsWith('subscribe:'))).toBe(true);
  expect(proxy.connections).toBe(1);
});

test('tab visible again: a new connection and the current board (B-82)', async ({ browser }) => {
  const { alice, bob } = await teamWithTwoPlayers(browser, 'Reconnect Visible');
  const proxy = await withProxy(alice);

  // Alice's connection is dead in the background: the pull for Bob's card never reaches her
  proxy.silent = true;
  await pickCard(bob, 'five001');
  await expectTableCard(bob, 'Bob', 'done001');
  await expectTableCard(alice, 'Bob', 'prgrss1');

  proxy.silent = false;
  await alice.evaluate(`(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
  })()`);
  await expectTableCard(alice, 'Bob', 'done001');
  expect(proxy.connections).toBe(2);
});

test('passive viewer, silent connection (no hb): rebuilt after 40 s, the hint until it is back (B-81, B-86)', async ({ browser }) => {
  const { alice, bob } = await teamWithTwoPlayers(browser, 'Reconnect Silent');
  // the board's timers and Date.now() run on a fake clock: 40 s pass in no time
  await alice.clock.install();
  const proxy = await withProxy(alice);
  const hint = alice.locator('#conn_hint');

  // half open: the connection looks open, but neither 'hb' nor 'pull' comes; Bob's card does not reach Alice
  proxy.silent = true;
  await pickCard(bob, 'five001');
  await alice.clock.runFor(30000);
  await expectTableCard(alice, 'Bob', 'prgrss1');
  expect(proxy.connections).toBe(1);

  // poker-msg cannot be reached for now: after the timeout the board gives up the connection and shows the hint
  proxy.refuse = true;
  await alice.clock.runFor(15000);
  await expect.poll(() => proxy.connections).toBeGreaterThan(1);
  await alice.clock.runFor(2000);
  await expect(hint).toBeVisible();
  await expect(hint).toHaveAttribute('role', 'alertdialog');
  await expect(hint).toContainText('Reconnecting to the server');
  await expect(hint).toBeFocused();

  // not dismissable: a click on it changes nothing
  await hint.click();
  await expect(hint).toBeVisible();

  // back: the next retry opens a connection, the hint goes and the board is current
  proxy.refuse = false;
  proxy.silent = false;
  await alice.clock.runFor(3000);
  await expect.poll(() => alice.evaluate('gConn.readyState')).toBe(1);
  await expect(hint).toBeHidden();
  await expectTableCard(alice, 'Bob', 'done001');
});

test('hb keeps a quiet connection: no reconnect while it comes (B-81)', async ({ browser }) => {
  const { alice } = await teamWithTwoPlayers(browser, 'Reconnect Heartbeat');
  await alice.clock.install();
  const proxy = await withProxy(alice);
  await watchConnHint(alice);

  // only the test's 'hb' every 30 s (fake clock), nothing from poker-msg
  proxy.silent = true;
  for (let i = 0; i < 4; i++) {
    await alice.clock.runFor(30000);
    proxy.current!.send('hb');
    await expect.poll(() => alice.evaluate('Date.now() - gWsLastMsgAt')).toBeLessThan(1000);
  }
  expect(proxy.connections).toBe(1);
  expect(await alice.evaluate('window.connHintShown')).toBe(false);

  // counter-check: without hb the same connection is given up after 40 s
  await alice.clock.runFor(45000);
  await expect.poll(() => proxy.connections).toBe(2);
});

test('short break below the delay: no reconnect hint (B-86)', async ({ browser }) => {
  const { alice, bob } = await teamWithTwoPlayers(browser, 'Reconnect Short');
  // the board's timers run on a fake clock: the reconnect (300 ms) comes before the hint (1.2 s)
  // no matter how slow the machine is
  await alice.clock.install();
  const proxy = await withProxy(alice);
  await watchConnHint(alice);

  await proxy.current!.close();
  await expect.poll(() => alice.evaluate('gConn.readyState')).toBe(3); // CLOSED
  await alice.clock.runFor(400);
  await expect.poll(() => proxy.connections).toBe(2);
  await expect.poll(() => alice.evaluate('gConn.readyState')).toBe(1);
  await alice.clock.runFor(2000); // well past the delay of the hint

  await expect(alice.locator('#conn_hint')).toBeHidden();
  expect(await alice.evaluate('window.connHintShown')).toBe(false);
  await pickCard(alice, 'three01');
  await expectTableCard(bob, 'Alice', 'done001');
});

test('phone with the menu open: the hint closes the menu sheet and gets the focus (B-86)', async ({ browser }) => {
  const page = await newPlayer(browser, { viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });
  const url = await createTeam(page, 'Reconnect Phone Menu');
  await joinAsPlayer(page, url, 'Alice');
  const proxy = await withProxy(page);

  await page.locator('#menu_btn').click();
  await expect(page.locator('dialog#menu')).toHaveAttribute('open');

  proxy.refuse = true;
  await proxy.current!.close();
  const hint = page.locator('#conn_hint');
  await expect(hint).toBeVisible();
  await expect(page.locator('dialog#menu')).not.toHaveAttribute('open');
  await expect(hint).toBeFocused();

  proxy.refuse = false;
  await expect(hint).toBeHidden();
});

test('while the hint is shown, keys do not pick cards and Tab stays out of the board (B-86)', async ({ browser }) => {
  const { alice } = await teamWithTwoPlayers(browser, 'Reconnect Keys');
  const proxy = await withProxy(alice);
  const hint = alice.locator('#conn_hint');

  proxy.refuse = true;
  await proxy.current!.close();
  await expect(hint).toBeVisible();
  await expect(hint).toBeFocused();

  await alice.keyboard.press('1');
  await alice.keyboard.press('Tab');
  expect(await alice.evaluate('document.activeElement.closest(".container") === null')).toBe(true);
  await expect(alice.locator('#ctl img.selected')).toHaveCount(0);

  proxy.refuse = false;
  await expect(hint).toBeHidden();
  await expect(alice.locator('#ctl img.selected')).toHaveCount(0);
});
