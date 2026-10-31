import { test, expect } from '@playwright/test';
import { teamWithTwoPlayers, pickCard, expectTableCard } from './helpers';

/**
 * B-92: answers of api/dao.php may come in any order. An answer older than the board state shown last is dropped,
 * otherwise it would set the whole board back (cards, topic, settings) until the next pull.
 */
test('an older board state that comes last is dropped (B-92)', async ({ browser }) => {
  const { alice, bob } = await teamWithTwoPlayers(browser, 'Dao Order');

  // the next board state Alice asks for (after Bob's card) is held back and marked (team name)
  let release!: () => void;
  const released = new Promise<void>(resolve => { release = resolve; });
  let read!: () => void;
  const stateRead = new Promise<void>(resolve => { read = resolve; });
  let delivered!: () => void;
  const stateDelivered = new Promise<void>(resolve => { delivered = resolve; });
  let hold = true;
  await alice.route('**/api/dao.php*', async route => {
    if (!hold) return route.continue();
    hold = false;
    const response = await route.fetch();
    const json = await response.json();
    read();
    await released;
    await route.fulfill({ response, json: { ...json, team_name: 'Older State' } });
    delivered();
  });

  await pickCard(bob, 'five001');
  await stateRead;

  // Alice's own card: her board loads a newer state, which has Bob's card too (both down: revealed)
  await pickCard(alice, 'three01');
  await expectTableCard(alice, 'Alice', 'three01');
  await expectTableCard(alice, 'Bob', 'five001');

  release();
  await stateDelivered;
  await alice.evaluate(() => new Promise(resolve => setTimeout(resolve, 300)));
  await expect(alice.locator('#team_name')).toHaveText('Dao Order');
  await expect(alice.locator('#ctl .ctl[data-card="three01"]')).toHaveClass(/selected/);
  await expectTableCard(alice, 'Alice', 'three01');
  await expectTableCard(alice, 'Bob', 'five001');
});
