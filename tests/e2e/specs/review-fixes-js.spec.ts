import { test, expect, Page } from '@playwright/test';
import { newPlayer, createTeam, joinAsPlayer, addPlayersViaApi, tableCard } from './helpers';

/**
 * R3 review (Andreas: all before the go-live), JS fixes:
 *   E1  the topic's Save/Undo also after pasting, dropping or dictating (input event, no keydown)
 *   E3  the overlay after being removed: "You were removed from the table"
 *   E5  touch: a tap next to the emoji bar closes the bar and the circles; a tap on the team name only closes
 *   E6  touch: alone at the table the own trash can shows after a tap only (tap mode without other cards)
 *   E7  copy link: where the clipboard is refused, the link shows to copy by hand
 */
const DESKTOP = { width: 1280, height: 800 };
const TABLET = { width: 1024, height: 768 };
const PHONE = { width: 390, height: 844 };

/** the clipboard API answers "copied" (headless browsers may refuse it) */
async function clipboardOk(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async () => { /* copied */ } },
    });
  });
}

test('topic: Save and Undo after text inserted without a key (E1)', async ({ browser }) => {
  const alice = await newPlayer(browser, { viewport: DESKTOP });
  const url = await createTeam(alice, 'Topic Paste');
  await joinAsPlayer(alice, url, 'Alice');
  await alice.locator('#topic_btn').click();
  const topic = alice.locator('#topic_txt');
  await expect(alice.locator('#topic_save')).toBeDisabled();
  await topic.focus();
  let keydowns = 0;
  await alice.exposeFunction('countKeydown', () => { keydowns++; });
  await topic.evaluate(el => el.addEventListener('keydown', () => (window as unknown as { countKeydown: () => void }).countKeydown()));
  await alice.keyboard.insertText('PROJ-42 Checkout'); // as paste, drop or dictation: an input event, no keydown
  await expect(topic).toHaveValue('PROJ-42 Checkout');
  expect(keydowns).toBe(0);
  await expect(alice.locator('#topic_save')).toBeEnabled();
  await expect(alice.locator('#topic_reset')).toBeEnabled();
  const saved = alice.waitForResponse(r => r.url().includes('/api/update_topic.php'));
  await alice.locator('#topic_save').click();
  await saved;
  await expect(alice.locator('#topic')).toHaveText('PROJ-42 Checkout');
});

test('removed: the overlay says "You were removed from the table" (E3)', async ({ browser }) => {
  const alice = await newPlayer(browser, { viewport: DESKTOP });
  const url = await createTeam(alice, 'Removed Text');
  await joinAsPlayer(alice, url, 'Alice');
  const own = tableCard(alice, 'Alice');
  await own.hover();
  await own.locator('.delete').click();
  await alice.locator('#rm_confirm').getByRole('button', { name: 'Remove' }).click();
  const msg = alice.locator('#removed_msg');
  await expect(msg).toBeVisible();
  await expect(msg.locator('h1')).toHaveText('You were removed from the table');
  await expect(msg.locator('span')).toHaveText(
    'This usually happens when you have been away for a while and someone removed you. What do you want to do now?');
});

test('touch: a tap next to the emoji bar closes it and the circles, the team name only closes (E5)', async ({ browser }) => {
  const alice = await newPlayer(browser, { viewport: TABLET, hasTouch: true });
  await clipboardOk(alice);
  const url = await createTeam(alice, 'Tap Away');
  await joinAsPlayer(alice, url, 'Alice');
  await addPlayersViaApi(alice, url, ['Bob']);
  await alice.reload();
  const bob = tableCard(alice, 'Bob');
  const bar = alice.locator('#react_bar');
  const toast = alice.locator('#toast');

  // the emoji bar open, a tap next to it on the table: bar and circles close
  await bob.locator('.pc').tap();
  await bob.locator('.react').tap();
  await expect(bar).toBeVisible();
  await expect(bob).toHaveClass(/is-open/);
  await alice.locator('#table').tap({ position: { x: 10, y: 10 } });
  await expect(bar).toBeHidden();
  await expect(bob).not.toHaveClass(/is-open/);

  // circles open, a tap on the team name only closes them (no link copied)
  await bob.locator('.pc').tap();
  await expect(bob).toHaveClass(/is-open/);
  await alice.locator('#team_name').tap();
  await expect(bob).not.toHaveClass(/is-open/);
  await alice.waitForTimeout(300);
  await expect(toast).not.toHaveClass(/toast-on/);

  // the emoji bar open, a tap on the team name: closes both, copies nothing
  await bob.locator('.pc').tap();
  await bob.locator('.react').tap();
  await expect(bar).toBeVisible();
  await alice.locator('#team_name').tap();
  await expect(bar).toBeHidden();
  await expect(bob).not.toHaveClass(/is-open/);
  await alice.waitForTimeout(300);
  await expect(toast).not.toHaveClass(/toast-on/);

  // nothing open: the team name copies the link
  await alice.locator('#team_name').tap();
  await expect(toast).toHaveText('Board link copied');
  await expect(toast).toHaveClass(/toast-on/);
});

test('touch: alone at the table the own trash can shows after a tap only (E6)', async ({ browser }) => {
  const bob = await newPlayer(browser, { viewport: PHONE, hasTouch: true });
  const url = await createTeam(bob, 'Alone Phone');
  await joinAsPlayer(bob, url, 'Bob');
  const own = tableCard(bob, 'Bob');
  await expect(own).toBeVisible();
  await expect(bob.locator('#table')).toHaveClass(/tap-mode/);
  await expect(own.locator('.delete')).toHaveCSS('opacity', '0');
  await own.locator('.pc').tap();
  await expect(own).toHaveClass(/is-open/);
  await expect(own.locator('.delete')).toHaveCSS('opacity', '1');
  await own.locator('.pc').tap();
  await expect(own).not.toHaveClass(/is-open/);
  await expect(own.locator('.delete')).toHaveCSS('opacity', '0');
});

for (const variant of ['refused', 'missing'] as const) {
  test(`copy link: the clipboard ${variant}, the link shows to copy by hand (E7)`, async ({ browser }) => {
    const alice = await newPlayer(browser, { viewport: DESKTOP });
    await alice.addInitScript(v => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: v === 'missing' ? undefined
          : { writeText: () => Promise.reject(new DOMException('Write permission denied.', 'NotAllowedError')) },
      });
    }, variant);
    const url = await createTeam(alice, 'Copy Refused');
    await joinAsPlayer(alice, url, 'Alice');
    const shown: { type: string; message: string; value: string }[] = [];
    alice.once('dialog', async d => {
      shown.push({ type: d.type(), message: d.message(), value: d.defaultValue() });
      await d.dismiss();
    });
    await alice.locator('#copy_link_btn').click();
    await expect.poll(() => shown.length).toBe(1);
    expect(shown[0]).toEqual({ type: 'prompt', message: 'Copy the board link:', value: alice.url() });
    await expect(alice.locator('#toast')).not.toHaveClass(/toast-on/);
  });
}
