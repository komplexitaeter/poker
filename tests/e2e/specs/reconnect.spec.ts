import { test, expect, Page, WebSocketRoute } from '@playwright/test';
import { teamWithTwoPlayers, pickCard, expectTableCard } from './helpers';

/**
 * B-82: a board whose WebSocket to poker-msg broke in the background sends its push again once a new
 * connection is open, and rebuilds the connection when the tab becomes visible again.
 * B-86: while the connection is down (or the pull for the own push does not come), #conn_hint covers
 * the board after a short delay and vanishes by itself when the connection is back.
 *
 * page.routeWebSocket() sits between the board and poker-msg: messages are passed through, the test
 * can close the connection, refuse new ones or swallow the 'pull' messages.
 */

type MsgProxy = {
  connections: number;    // connections the page opened
  dropPull: boolean;      // swallow 'pull' from poker-msg (half open connection)
  refuse: boolean;        // close new connections at once (poker-msg not reachable)
  current: WebSocketRoute | null;
};

async function proxyPokerMsg(page: Page): Promise<MsgProxy> {
  const proxy: MsgProxy = { connections: 0, dropPull: false, refuse: false, current: null };
  await page.routeWebSocket(/\/poker-msg$/, ws => {
    proxy.connections++;
    if (proxy.refuse) {
      ws.close();
      return;
    }
    proxy.current = ws;
    const server = ws.connectToServer();
    ws.onMessage(message => server.send(message));
    server.onMessage(message => {
      if (proxy.dropPull && String(message).includes('pull')) return;
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

test('connection closed in the background: the push is sent again and the other boards update (B-82)', async ({ browser }) => {
  const { alice, bob } = await teamWithTwoPlayers(browser, 'Reconnect Push');
  const proxy = await withProxy(alice);

  await proxy.current!.close();
  await expect.poll(() => alice.evaluate('gConn.readyState')).toBe(3); // CLOSED, before the retry

  await pickCard(alice, 'three01');
  await expectTableCard(bob, 'Alice', 'done001');
  await expectTableCard(alice, 'Alice', 'done001');
  expect(proxy.connections).toBe(2);
});

test('tab visible again: a new connection and the current board (B-82)', async ({ browser }) => {
  const { alice, bob } = await teamWithTwoPlayers(browser, 'Reconnect Visible');
  const proxy = await withProxy(alice);

  // Alice's connection is dead in the background: the pull for Bob's card never reaches her
  proxy.dropPull = true;
  await pickCard(bob, 'five001');
  await expectTableCard(bob, 'Bob', 'done001');
  await expectTableCard(alice, 'Bob', 'prgrss1');

  proxy.dropPull = false;
  await alice.evaluate(`(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
  })()`);
  await expectTableCard(alice, 'Bob', 'done001');
  expect(proxy.connections).toBe(2);
});

test('pull does not come: the reconnect hint covers the board until the connection is back (B-86)', async ({ browser }) => {
  const { alice, bob } = await teamWithTwoPlayers(browser, 'Reconnect Hint');
  const proxy = await withProxy(alice);
  const hint = alice.locator('#conn_hint');

  // half open: poker-msg seems to be there, but nothing comes back; reconnects are refused
  proxy.dropPull = true;
  await pickCard(alice, 'three01');
  await expect(hint).toBeVisible();
  await expect(hint).toHaveAttribute('role', 'alertdialog');
  await expect(hint).toContainText('Reconnecting to the server');
  await expect(hint).toBeFocused();
  proxy.refuse = true;

  // not dismissable: a click on it changes nothing
  await hint.click();
  await expect(hint).toBeVisible();

  proxy.refuse = false;
  proxy.dropPull = false;
  await expect(hint).toBeHidden();
  await expectTableCard(bob, 'Alice', 'done001');
  await expectTableCard(alice, 'Alice', 'done001');
});

test('short break below the delay: no reconnect hint (B-86)', async ({ browser }) => {
  const { alice, bob } = await teamWithTwoPlayers(browser, 'Reconnect Short');
  const proxy = await withProxy(alice);
  await watchConnHint(alice);

  await proxy.current!.close();
  await expect.poll(() => proxy.connections).toBe(2);
  await expect.poll(() => alice.evaluate('gConn.readyState')).toBe(1);

  await pickCard(alice, 'three01');
  await expectTableCard(bob, 'Alice', 'done001');
  expect(await alice.evaluate('window.connHintShown')).toBe(false);
});
