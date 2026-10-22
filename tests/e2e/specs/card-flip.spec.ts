import { test, expect, Page } from '@playwright/test';
import { newPlayer, createTeam, joinAsPlayer, tableCard, expectTableCard, pickCard } from './helpers';

/**
 * B-41: Cards glide to their new place when the order changes (FLIP via the Web Animations API,
 * id 'flip'), and the height of #cbox glides when the number of rows changes (id 'height').
 * The tests record every animate() call with an id instead of watching positions over time,
 * so they do not depend on timing.
 */
type Recorded = { id: string; target: string; from: string };

async function recordAnimations(page: Page): Promise<void> {
  await page.addInitScript(() => {
    (window as any).__flips = [];
    const original = Element.prototype.animate;
    Element.prototype.animate = function (keyframes: any, options: any) {
      if (options && typeof options === 'object' && options.id) {
        const first = Array.isArray(keyframes) ? keyframes[0] : {};
        (window as any).__flips.push({
          id: options.id,
          target: (this as Element).id,
          from: String(first.transform ?? first.height ?? ''),
        });
      }
      return original.call(this, keyframes, options);
    };
  });
}

const recorded = (page: Page) => page.evaluate(() => (window as any).__flips as Recorded[]);
const cardId = (page: Page, name: string) => tableCard(page, name).getAttribute('id') as Promise<string>;

test('cards glide to their new place when the order changes, also across rows (B-41)', async ({ browser }) => {
  const alice = await newPlayer(browser);
  await recordAnimations(alice);
  // narrow board: two cards per row, so a re-sort moves a card into the next row
  await alice.setViewportSize({ width: 250, height: 900 });
  const url = await createTeam(alice, 'Flip Team');
  await joinAsPlayer(alice, url, 'Alice');
  const bob = await newPlayer(browser);
  await joinAsPlayer(bob, url, 'Bob');
  await expect(tableCard(alice, 'Bob')).toBeVisible();
  const aliceId = await cardId(alice, 'Alice');
  const bobId = await cardId(alice, 'Bob');
  await alice.waitForTimeout(300);
  const before = (await recorded(alice)).length;

  // Aaron sorts in front of Alice and Bob: Alice moves right, Bob moves into the second row
  const aaron = await newPlayer(browser);
  await joinAsPlayer(aaron, url, 'Aaron');
  await expect(tableCard(alice, 'Aaron')).toBeVisible();
  await expect(alice.locator('#cbox .c').first()).toHaveAttribute('id', await cardId(alice, 'Aaron'));

  await expect.poll(async () => (await recorded(alice)).slice(before).map(r => `${r.id}:${r.target}`))
    .toEqual(expect.arrayContaining([`flip:${aliceId}`, `flip:${bobId}`, 'height:cbox']));

  const flips = (await recorded(alice)).slice(before).filter(r => r.id === 'flip');
  const bobFlip = flips.find(r => r.target === bobId)!;
  // Bob starts in the first row: inverted upwards (negative y)
  const [, dy] = bobFlip.from.match(/translate\((-?[\d.]+)px, (-?[\d.]+)px\)/)!.slice(1).map(Number);
  expect(dy).toBeLessThan(-50);
  // the new card fades in, it does not glide
  expect(flips.map(r => r.target)).not.toContain(await cardId(alice, 'Aaron'));
});

test('anonymous mode: revealing the cards does not glide (B-41)', async ({ browser }) => {
  const alice = await newPlayer(browser);
  await recordAnimations(alice);
  const url = await createTeam(alice, 'Anon Flip');
  const t = new URL(url).searchParams.get('t')!;
  const res = await alice.request.post(`/api/update_team.php?t=${encodeURIComponent(t)}&anonymous_request_toggle=1`);
  expect(res.ok()).toBeTruthy();
  await joinAsPlayer(alice, url, 'Alice');
  const bob = await newPlayer(browser);
  await joinAsPlayer(bob, url, 'Bob');
  await expect(tableCard(alice, 'Bob')).toBeVisible();
  const bobId = await cardId(alice, 'Bob');
  await expect(alice.locator('#cbox .c').first()).not.toHaveAttribute('id', bobId);

  // anonymous results are sorted by value: Bob (3) moves in front of Alice (8)
  await pickCard(alice, 'eight01');
  await pickCard(bob, 'three01');
  await expect(alice.locator(`#cbox .c[id="${bobId}"] img.card_image`)).toHaveAttribute('src', 'src/c_three01.png');
  await expect(alice.locator('#cbox .c').first()).toHaveAttribute('id', bobId);
  await alice.waitForTimeout(300);

  expect((await recorded(alice)).filter(r => r.id === 'flip')).toEqual([]);
});

test('cards do not glide with prefers-reduced-motion (B-41)', async ({ browser }) => {
  const alice = await newPlayer(browser);
  await alice.emulateMedia({ reducedMotion: 'reduce' });
  await recordAnimations(alice);
  const url = await createTeam(alice, 'Calm Team');
  await joinAsPlayer(alice, url, 'Alice');
  const bob = await newPlayer(browser);
  await joinAsPlayer(bob, url, 'Bob');
  await expect(tableCard(alice, 'Bob')).toBeVisible();

  // Aaron sorts in front of the others: the order changes, but nothing glides
  const aaron = await newPlayer(browser);
  await joinAsPlayer(aaron, url, 'Aaron');
  await expectTableCard(alice, 'Aaron', 'prgrss1');
  await expect(alice.locator('#cbox .c').first()).toHaveAttribute('id', await cardId(alice, 'Aaron'));
  await alice.waitForTimeout(300);

  expect(await recorded(alice)).toEqual([]);
});
