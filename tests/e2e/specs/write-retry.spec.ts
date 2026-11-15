import { test, expect } from '@playwright/test';
import { teamWithTwoPlayers, pickCard, expectTableCard, deckCard } from './helpers';

/**
 * B-135: apiWrite() sends an idempotent write (e.g. setc.php) once more when fetch fails with a network
 * error (Safari "Load failed" after the server closed the HTTP/2 connection). Writes that add or move on
 * (e.g. newround.php) are never sent twice.
 */
test('a card write that fails with a network error is sent once more and the card lands', async ({ browser }) => {
  const { alice, bob } = await teamWithTwoPlayers(browser, 'RetryTeam');

  let calls = 0;
  await alice.route('**/api/setc.php*', route => {
    calls++;
    return calls === 1 ? route.abort('failed') : route.continue();
  });

  await pickCard(alice, 'five001');
  await expect.poll(() => calls).toBe(2);
  await expectTableCard(bob, 'Alice', 'done001'); // on the table (hidden until revealed)
  await expectTableCard(alice, 'Alice', 'done001');
});

test('a new round that fails with a network error is not sent twice', async ({ browser }) => {
  const { alice } = await teamWithTwoPlayers(browser, 'NoRetryTeam');
  await pickCard(alice, 'five001');
  await expect(alice.locator('#newroundbtn')).toBeEnabled();

  let calls = 0;
  await alice.route('**/api/newround.php*', route => {
    calls++;
    return route.abort('failed');
  });

  await alice.locator('#newroundbtn').click();
  await expect.poll(() => calls).toBe(1);
  await alice.waitForTimeout(1000); // longer than the retry delay (300 ms)
  expect(calls).toBe(1);
  await expectTableCard(alice, 'Alice', 'done001'); // the round did not restart
});

test('the retry of an older card write does not overwrite a newer pick', async ({ browser }) => {
  const { alice, bob } = await teamWithTwoPlayers(browser, 'RetryRaceTeam');

  const sent: string[] = [];
  await alice.route('**/api/setc.php*', route => {
    const key = new URL(route.request().url()).searchParams.get('cardkey') ?? '';
    sent.push(key);
    return sent.length === 1 ? route.abort('failed') : route.continue();
  });

  // the second pick comes before the retry of the first one (300 ms)
  await deckCard(alice, 'five001').click();
  await deckCard(alice, 'eight01').click();
  await expect.poll(() => sent.length).toBe(2);
  await alice.waitForTimeout(1000); // longer than the retry delay
  expect(sent).toEqual(['five001', 'eight01']);

  await pickCard(bob, 'five001'); // both ready: revealed
  await expectTableCard(bob, 'Alice', 'eight01');
  await expectTableCard(alice, 'Alice', 'eight01');
});
