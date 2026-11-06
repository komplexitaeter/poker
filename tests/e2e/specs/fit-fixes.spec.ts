import { test, expect, Page } from '@playwright/test';
import { newPlayer, createTeam, joinAsPlayer, addPlayersViaApi, tableCard, pickCard, setTimer } from './helpers';

/**
 * B-49 follow-up: the card size depends on the number of players and the table only.
 * B-68: the round actions (.dock, New Round + timer) and the spread lie outside the table with a
 * fixed height (large screens: the column; phones: a strip above the deck), so switching the
 * timer, the first vote or a new round neither resizes the cards nor lets the dock cover
 * them; the outer cards keep a side gutter to the edge of the table.
 * The delete icon depends on the input device, not on the width; hidden by opacity, so it stays in the tab order (B-99 D16).
 * SHOT_DIR (optional): screenshots of the cases.
 */
const PHONE = { width: 375, height: 667 };
const DESKTOP = { width: 1280, height: 800 };

const names = (n: number) => Array.from({ length: n }, (_, i) => `P${String(i + 1).padStart(2, '0')}`);

/** --card-w as the layout uses it (no running transform). */
const layoutWidth = (page: Page) => tableCard(page, 'Alice').evaluate(card => (card as HTMLElement).offsetWidth);

async function settledWidth(page: Page): Promise<number> {
  await page.waitForTimeout(1200); // glides and pending pulls are over
  return layoutWidth(page);
}


/** Lowest card bottom (incl. the delete icon), top of the dock, scroll overflow, smallest side gap. */
const geometry = (page: Page) => page.evaluate(() => {
  const table = document.getElementById('table')!;
  const t = table.getBoundingClientRect();
  const cards = Array.from(document.querySelectorAll('#cbox .c'));
  const rects = cards.map(card => card.getBoundingClientRect());
  const bottoms = cards.map(card => Math.max(...Array.from(card.querySelectorAll('.pc, .delete'))
    .map(img => img.getBoundingClientRect().bottom), card.getBoundingClientRect().bottom));
  return {
    cardsBottom: Math.max(...bottoms),
    dockTop: document.querySelector('.dock')!.getBoundingClientRect().top,
    tableBottom: t.bottom,
    overflow: table.scrollHeight - table.clientHeight,
    sideGap: Math.min(...rects.map(r => Math.min(r.left - t.left, t.right - r.right))),
  };
});

async function shot(page: Page, name: string): Promise<void> {
  if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/${name}.png` });
}

// The table height limits the card size: 2 rows in a smaller window (as on staging), 3 rows at 1280 x 800.
for (const { viewport, players, rows } of [
  { viewport: { width: 1000, height: 600 }, players: 10, rows: 2 },
  { viewport: DESKTOP, players: 25, rows: 3 }, // B-68: the column takes 380px of the width, the deck row is higher
]) {
  test(`desktop ${viewport.width}x${viewport.height}, ${rows} rows: the timer neither covers nor resizes the cards (B-49, B-66)`, async ({ browser }) => {
    const alice = await newPlayer(browser, { viewport });
    const url = await createTeam(alice, 'Fit Desktop');
    await addPlayersViaApi(alice, url, names(players - 1));
    await joinAsPlayer(alice, url, 'Alice');
    await expect(alice.locator('#cbox .c')).toHaveCount(players);
    await pickCard(alice, 'three01');
    await expect(alice.locator('#newroundbtn')).toBeEnabled();
    const off = await settledWidth(alice);
    expect(await alice.evaluate(() =>
      new Set(Array.from(document.querySelectorAll<HTMLElement>('#cbox .c')).map(c => c.offsetTop)).size)).toBe(rows);

    await setTimer(alice, true);
    // right after the switch, and fitted anew after a reload
    for (const reload of [false, true]) {
      if (reload) {
        await alice.reload();
        await expect(alice.locator('#timer')).toBeVisible();
      }
      expect(await settledWidth(alice)).toBe(off);
      const g = await geometry(alice);
      expect(g.cardsBottom).toBeLessThanOrEqual(g.dockTop);
      // B-68: at the foot of the column, below the table
      expect(g.dockTop).toBeGreaterThanOrEqual(g.tableBottom - 0.5);
      expect(g.overflow).toBeLessThanOrEqual(0);
      expect(g.sideGap).toBeGreaterThanOrEqual(16); // 8px table padding + gutter of at least 8px
    }
    await shot(alice, `desktop-${viewport.width}-timer-on`);

    await setTimer(alice, false);
    expect(await settledWidth(alice)).toBe(off);
  });
}

test('phone: the card width ignores timer, first vote and new round (B-49)', async ({ browser }) => {
  const alice = await newPlayer(browser, { viewport: PHONE, hasTouch: true, isMobile: true });
  const url = await createTeam(alice, 'Fit Phone');
  await addPlayersViaApi(alice, url, names(9));
  await joinAsPlayer(alice, url, 'Alice');
  await expect(alice.locator('#cbox .c')).toHaveCount(10);
  const base = await settledWidth(alice);
  await shot(alice, 'phone-before-vote');

  await setTimer(alice, true);
  expect(await settledWidth(alice)).toBe(base);
  await pickCard(alice, 'three01');
  await expect(alice.locator('#newroundbtn')).toBeEnabled();
  expect(await settledWidth(alice)).toBe(base);
  const g = await geometry(alice);
  expect(g.cardsBottom).toBeLessThanOrEqual(g.dockTop);
  expect(g.overflow).toBeLessThanOrEqual(0);
  expect(g.sideGap).toBeGreaterThanOrEqual(8);
  await shot(alice, 'phone-timer-on-voted');

  await setTimer(alice, false);
  expect(await settledWidth(alice)).toBe(base);
  await alice.locator('#newroundbtn').click();
  await expect(alice.locator('#newroundbtn')).toBeDisabled(); // B-67: always there, disabled until a vote
  expect(await settledWidth(alice)).toBe(base);
});

test('narrow window: a full row keeps a gutter to the edge of the table (B-49)', async ({ browser }) => {
  const alice = await newPlayer(browser, { viewport: { width: 600, height: 800 } });
  const url = await createTeam(alice, 'Fit Gutter');
  await addPlayersViaApi(alice, url, names(7));
  await joinAsPlayer(alice, url, 'Alice');
  await expect(alice.locator('#cbox .c')).toHaveCount(8);
  await settledWidth(alice);
  const g = await geometry(alice);
  expect(g.sideGap).toBeGreaterThanOrEqual(8);
  expect(g.overflow).toBeLessThanOrEqual(0);
  await shot(alice, 'narrow-gutter');
});

test('delete icon: by input device, not by width (B-49)', async ({ browser }) => {
  // a narrow desktop window with a mouse: on hover only
  const alice = await newPlayer(browser, { viewport: { width: 600, height: 800 } });
  const url = await createTeam(alice, 'Fit Delete');
  await joinAsPlayer(alice, url, 'Alice');
  await alice.mouse.move(0, 0);
  await expect(tableCard(alice, 'Alice').locator('.delete')).toHaveCSS('opacity', '0');
  await tableCard(alice, 'Alice').hover();
  await expect(tableCard(alice, 'Alice').locator('.delete')).toHaveCSS('opacity', '1');

  // a phone: after a tap on the card (B-110: with other players at the table the circles show on the tapped card)
  const bob = await newPlayer(browser, { viewport: PHONE, hasTouch: true, isMobile: true });
  await joinAsPlayer(bob, url, 'Bob');
  await expect(tableCard(bob, 'Alice').locator('.delete')).toHaveCSS('opacity', '0');
  await tableCard(bob, 'Alice').locator('.pc').tap();
  await expect(tableCard(bob, 'Alice')).toHaveClass(/is-open/);
  await expect(tableCard(bob, 'Alice').locator('.delete')).toHaveCSS('opacity', '1');
  await expect(tableCard(bob, 'Alice').locator('.react')).toHaveCSS('opacity', '1');
  await tableCard(bob, 'Bob').locator('.pc').tap();
  await expect(tableCard(bob, 'Alice')).not.toHaveClass(/is-open/);
  await expect(tableCard(bob, 'Bob').locator('.delete')).toHaveCSS('opacity', '1');
});

test('delete button: named, reachable by keyboard, removes the player (B-99 D16)', async ({ browser }) => {
  const alice = await newPlayer(browser, { viewport: DESKTOP });
  const url = await createTeam(alice, 'Fit Remove');
  await joinAsPlayer(alice, url, 'Alice');
  await addPlayersViaApi(alice, url, ['Bob']);
  await alice.reload();
  await expect(tableCard(alice, 'Bob')).toBeVisible();

  // a real button, named after the player
  const remove = tableCard(alice, 'Bob').getByRole('button', { name: 'Remove Bob from the table' });
  await expect(remove).toHaveCount(1);

  // reachable with Tab (hidden until the focus is on it, then shown by :focus-within)
  await alice.mouse.move(0, 0);
  let focused = false;
  for (let i = 0; i < 80 && !focused; i++) {
    await alice.keyboard.press('Tab');
    focused = await remove.evaluate(el => el === document.activeElement);
  }
  expect(focused).toBe(true);
  await expect(remove).toBeVisible();

  // B-110: on the trash can the nudge and the smiley fade out
  const bob = tableCard(alice, 'Bob');
  await expect(bob.locator('.react')).toHaveCSS('opacity', '0');
  await expect(bob.locator('.nudge')).toHaveCSS('opacity', '0');

  // B-110 (Andreas): removing always asks first, also with the keyboard; Esc cancels, the focus goes back
  const confirm = alice.locator('#rm_confirm');
  await alice.keyboard.press('Enter');
  await expect(confirm).toBeVisible();
  await expect(confirm.locator('#rm_confirm_text')).toContainText('Remove Bob from the table?');
  await expect(confirm.locator('#rm_confirm_text small')).toHaveText('Bob can rejoin at any time.');
  await expect(confirm.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await expect(remove).toHaveCSS('opacity', '1');
  await expect(bob.locator('.react')).toHaveCSS('opacity', '0');
  await alice.keyboard.press('Escape');
  await expect(confirm).toBeHidden();
  await expect(remove).toBeFocused();
  await expect(bob).toBeVisible();

  await alice.keyboard.press('Enter');
  await expect(confirm).toBeVisible();
  await alice.keyboard.press('Tab'); // Cancel -> Remove
  await expect(confirm.getByRole('button', { name: 'Remove' })).toBeFocused();
  await alice.keyboard.press('Enter');
  await expect(confirm).toBeHidden();
  await expect(tableCard(alice, 'Bob')).toHaveCount(0);
  await expect(tableCard(alice, 'Alice')).toBeVisible();
});

test('remove with the mouse: the circles fade on the trash can, it asks first (B-110)', async ({ browser }) => {
  const alice = await newPlayer(browser, { viewport: DESKTOP });
  const url = await createTeam(alice, 'Fit Remove Mouse');
  await joinAsPlayer(alice, url, 'Alice');
  await addPlayersViaApi(alice, url, ['Bob']);
  await alice.reload();
  const bob = tableCard(alice, 'Bob');
  await expect(bob).toBeVisible();
  const del = bob.locator('.delete');
  const react = bob.locator('.react');
  const nudge = bob.locator('.nudge');

  await bob.hover();
  await expect(react).toHaveCSS('opacity', '1');
  await del.hover();
  await expect(react).toHaveCSS('opacity', '0');
  await expect(nudge).toHaveCSS('opacity', '0');
  await expect(del).toHaveCSS('opacity', '1');

  // back to the smiley over the gap (the bridge keeps the card hovered): the circles come back
  const d = (await del.boundingBox())!;
  const r = (await react.boundingBox())!;
  const y = d.y + d.height * 0.75;
  for (let x = d.x + d.width / 2; x >= r.x + r.width / 2; x -= 4) await alice.mouse.move(x, y);
  await expect(react).toHaveCSS('opacity', '1');
  await expect(nudge).toHaveCSS('opacity', '1');

  // a click asks first; a click elsewhere closes it, nothing removed
  const confirm = alice.locator('#rm_confirm');
  await del.click();
  await expect(confirm).toBeVisible();
  await alice.mouse.move(0, 0);
  await expect(del).toHaveCSS('opacity', '1'); // stays at the popover without hover
  await expect(react).toHaveCSS('opacity', '0');
  await alice.mouse.click(5, 300);
  await expect(confirm).toBeHidden();
  await expect(bob).toBeVisible();

  await bob.hover();
  await del.click();
  await confirm.getByRole('button', { name: 'Remove' }).click();
  await expect(tableCard(alice, 'Bob')).toHaveCount(0);
});

test('the own trash can asks "Remove yourself from the table?" (B-110)', async ({ browser }) => {
  const alice = await newPlayer(browser, { viewport: DESKTOP });
  const url = await createTeam(alice, 'Fit Remove Self');
  await joinAsPlayer(alice, url, 'Alice');
  await addPlayersViaApi(alice, url, ['Bob']);
  await alice.reload();
  const me = tableCard(alice, 'Alice');
  await expect(me).toHaveClass(/is-me/);
  const del = me.locator('.delete');
  await expect(del).toHaveAttribute('aria-label', 'Remove yourself from the table');
  await expect(tableCard(alice, 'Bob').locator('.delete')).toHaveAttribute('aria-label', 'Remove Bob from the table');

  await me.hover();
  await del.click();
  const confirm = alice.locator('#rm_confirm');
  await expect(confirm).toBeVisible();
  await expect(confirm.locator('#rm_confirm_text')).toContainText('Remove yourself from the table?');
  await expect(confirm.locator('#rm_confirm_text small')).toHaveText('You can rejoin at any time.');
  await confirm.getByRole('button', { name: 'Cancel' }).click();
  await expect(confirm).toBeHidden();
  await expect(me).toBeVisible();

  // a foreign card afterwards gets its own name again
  const bob = tableCard(alice, 'Bob');
  await bob.hover();
  await bob.locator('.delete').click();
  await expect(confirm.locator('#rm_confirm_text')).toContainText('Remove Bob from the table?');
  await expect(confirm.locator('#rm_confirm_text small')).toHaveText('Bob can rejoin at any time.');
});

test('a long name stays inside the card and ends with an ellipsis (B-49)', async ({ browser }) => {
  const long = 'Andreas Paul Na'; // 15 characters, the maximum of the name field
  for (const viewport of [PHONE, { width: 1920, height: 1080 }]) {
    const page = await newPlayer(browser, { viewport });
    const url = await createTeam(page, 'Fit Name');
    await joinAsPlayer(page, url, long);
    const span = tableCard(page, long).locator('.card_player_name');
    await expect(span).toHaveAttribute('title', long);
    await page.waitForTimeout(1200);
    const m = await span.evaluate(el => {
      const card = el.parentElement!.getBoundingClientRect();
      const box = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      // the text itself, clipped to the content box of the span
      const range = document.createRange();
      range.selectNodeContents(el);
      const text = range.getBoundingClientRect();
      return {
        inside: box.left >= card.left - 0.5 && box.right <= card.right + 0.5,
        textLeft: Math.max(text.left, box.left + parseFloat(style.paddingLeft)) - card.left,
        textRight: card.right - Math.min(text.right, box.right - parseFloat(style.paddingRight)),
        overflow: style.overflow, ellipsis: style.textOverflow, width: card.width,
      };
    });
    expect(m.inside).toBe(true);
    expect(m.overflow).toBe('hidden');
    expect(m.ellipsis).toBe('ellipsis');
    // a visible margin left and right of the text (B-99: the name tag above the card, its padding)
    expect(m.textLeft).toBeGreaterThanOrEqual(5);
    expect(m.textRight).toBeGreaterThanOrEqual(5);
    await shot(page, `name-${viewport.width}`);
  }
});
