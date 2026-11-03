import { test, expect, Page } from '@playwright/test';
import { teamWithTwoPlayers, deckCard, deckCards, pickCard, expectTableCard, tableCard, chooseCardSet } from './helpers';

/* R3 F5 (B-98): the deck menu (Board settings -> Deck, mock-up variant C). Every change is written at once
 * (api/update_deck.php, api/update_controls.php) and every board follows. */

const trayKeys = (page: Page) => deckCards(page).evaluateAll(cards => cards.map(c => c.getAttribute('data-card')));
const toggle = (page: Page, key: string) => page.locator(`#deck_cards [data-card="${key}"]`);
const control = (page: Page, key: string) => page.locator(`#deck_controls [data-card="${key}"]`);
// R3 review (Andreas, final): every message of the deck menu is a toast, a little longer than others
const toast = (page: Page) => page.locator('#toast');
// no message in the menu itself: the card set box as always, no status, error or refusal line
const calm = async (page: Page) => {
  await expect(page.locator('#deck_change .dm-t small')).toHaveText('Card set');
  await expect(page.locator('#deck_change .dm-fan')).toBeVisible();
  await expect(page.locator('#deck_status, #deck_status_live, #deck_menu .dm-error, #deck_menu .dm-refusal')).toHaveCount(0);
};

test('choose a card set: Consent decision and Delegation Poker with headings, for everybody', async ({ browser }) => {
  const { alice, bob } = await teamWithTwoPlayers(browser, 'Deck Menu Sets');
  await alice.locator('#cset_btn').click();
  await expect(alice.locator('#deck_change')).toBeFocused();
  await expect(alice.locator('#deck_change')).toContainText('Fibonacci');
  // B-99 (F6): no deck row with card count and card row above it; the card set tile is the only way in
  await expect(alice.locator('#deck_menu .dm-pv, #deck_menu .dm-pv-row')).toHaveCount(0);
  await expect(alice.locator('#deck_menu')).not.toContainText(/\d+ cards/);

  // the list: every set group with a fan of its cards, the current one marked
  await alice.locator('#deck_change').click();
  const rows = alice.locator('#deck_menu .dm-prow-b');
  await expect(rows).toHaveCount(8);
  await expect(rows.filter({ hasText: 'Fibonacci' })).toHaveAttribute('aria-current', 'true');
  // Andreas (compact list): one line per set, its name only, no line below it and no tooltip
  await expect(rows.locator('.dm-t small')).toHaveCount(0);
  await expect(alice.locator('#deck_menu .dm-plist [title]')).toHaveCount(0);
  await expect(rows.first().locator('.dm-t')).toHaveText('Fibonacci');
  // the current set: the check icon (#i-check), fully inside its row (Andreas: it was cut off on the right)
  const tick = rows.filter({ hasText: 'Fibonacci' }).locator('.dm-tick');
  await expect(tick.locator('use')).toHaveAttribute('href', '#i-check');
  const [tickBox, rowBox] = [(await tick.boundingBox())!, (await rows.filter({ hasText: 'Fibonacci' }).boundingBox())!];
  expect(tickBox.x + tickBox.width).toBeLessThanOrEqual(rowBox.x + rowBox.width - 4);
  await expect(rows.filter({ hasText: 'Consent decision' }).locator('.dm-fan .dkc')).toHaveCount(4);
  await expect(alice.locator('#deck_pick_title')).toBeFocused();
  await rows.filter({ hasText: 'Consent decision' }).click();

  // back on the overview; both trays hold the set plus the team's control cards
  await expect(alice.locator('#deck_change')).toContainText('Consent decision');
  // F7, R3 review (Andreas, final): the result as a toast (role=status), nothing in the menu
  await expect(toast(alice)).toHaveText('Card set changed for everyone');
  await expect(toast(alice)).toHaveClass(/toast-on/);
  await expect(toast(alice)).toHaveAttribute('role', 'status');
  await calm(alice);
  const judge = ['jdg0', 'jdg1', 'jdg2', 'jdg3', 'jdg4', 'jdg5', 'jdg6', 'break01', 'qstmrk1'];
  for (const page of [alice, bob]) {
    await expect.poll(() => trayKeys(page)).toEqual(judge);
    await expect(deckCard(page, 'jdg3').locator('.dh')).toHaveText('serious concerns');
  }
  await pickCard(bob, 'jdg3');
  await pickCard(alice, 'jdg1');
  await expect(tableCard(alice, 'Bob').locator('.pc .ttl')).toHaveText('serious concerns');
  await expect(tableCard(alice, 'Bob').locator('.pc')).toHaveClass(/sty-inverted/);

  // Delegation Poker: a new round starts (cards were down), headings from the catalog
  await chooseCardSet(alice, 'Delegation Poker');
  for (const page of [alice, bob]) {
    await expect(deckCard(page, 'dlg3').locator('.dh')).toHaveText('Consult');
    await expectTableCard(page, 'Bob', 'prgrss1');
  }
});

test('variant and single cards: Short, a card off and on again, at least two cards stay', async ({ browser }) => {
  const { alice, bob } = await teamWithTwoPlayers(browser, 'Deck Menu Cards');
  await alice.locator('#cset_btn').click();

  // Fibonacci variants; keyboard: an arrow key only moves the choice, Enter saves it (no write, no round per key)
  const variant = (name: string) => alice.locator('#deck_variant').getByRole('radio', { name });
  let deckWrites = 0;
  alice.on('request', request => { if (request.url().includes('/api/update_deck.php')) deckWrites++; });
  await variant('Classic').focus();
  await alice.keyboard.press('ArrowRight');
  await expect(variant('Short')).toBeChecked();
  await expect(variant('Short')).toBeFocused();
  await alice.waitForTimeout(500);
  expect(deckWrites).toBe(0);
  await expect.poll(() => trayKeys(bob)).toContain('hundro1');
  await alice.keyboard.press('Enter');
  await expect.poll(() => trayKeys(bob)).not.toContain('hundro1');
  expect(deckWrites).toBe(1);
  // mouse: back to Classic and to Short again
  await variant('Classic').check();
  await expect(toast(alice)).toHaveText('Cards changed for everyone');
  await expect.poll(() => trayKeys(bob)).toContain('hundro1');
  await variant('Short').check();
  for (const page of [alice, bob]) {
    await expect.poll(() => trayKeys(page)).toEqual(['zero001', 'one0001', 'two0001', 'three01', 'five001', 'eight01',
      'thrtn01', 'twnty01', '4ty0001', 'break01', 'qstmrk1']);
  }

  // a card off: gone from both trays and from the spread
  await expect(toggle(alice, 'five001')).toHaveAttribute('aria-pressed', 'true');
  await toggle(alice, 'five001').click();
  await expect(toggle(alice, 'five001')).toHaveAttribute('aria-pressed', 'false');
  for (const page of [alice, bob]) {
    await expect(deckCard(page, 'five001')).toHaveCount(0);
    await expect(page.locator('#spread_bars [data-card="five001"]')).toHaveCount(0);
  }
  // and on again, in its place
  await toggle(alice, 'five001').click();
  await expect(deckCard(bob, 'five001')).toHaveCount(1);
  await expect.poll(() => trayKeys(bob)).toContain('five001');

  // Traffic lights: two of three off, the last two stay
  await alice.locator('#deck_change').click();
  await alice.locator('#deck_menu .dm-prow-b').filter({ hasText: 'Traffic lights' }).click();
  await expect(toggle(alice, 'red0001')).toBeVisible();
  await toggle(alice, 'red0001').click();
  await expect(deckCard(bob, 'red0001')).toHaveCount(0);
  await toggle(alice, 'yellow1').click();
  await expect(toggle(alice, 'yellow1')).toHaveAttribute('aria-pressed', 'true');
  // R3 review (Andreas, final): the refusal as a toast, the toggle shakes; nothing in the menu
  await expect(toast(alice)).toHaveText('A card set needs at least two cards.');
  await expect(toast(alice)).toHaveClass(/toast-on/);
  await expect(toggle(alice, 'yellow1')).toHaveClass(/is-refused/);
  await calm(alice);
  await expect(deckCard(bob, 'yellow1')).toHaveCount(1);
  // a card on again: written as usual
  await toggle(alice, 'red0001').click();
  await expect(toast(alice)).toHaveText('Cards changed for everyone');
  await expect(deckCard(bob, 'red0001')).toHaveCount(1);
});

test('control cards per team: switched on and off, they stay when the set changes', async ({ browser }) => {
  const { alice, bob } = await teamWithTwoPlayers(browser, 'Deck Menu Controls');
  await alice.locator('#cset_btn').click();
  await expect(control(alice, 'break01')).toHaveAttribute('aria-pressed', 'true');
  await expect(control(alice, 'veto')).toHaveAttribute('aria-pressed', 'false');
  await expect(control(alice, 'veto')).toHaveAttribute('aria-label', 'veto');

  await control(alice, 'veto').click();
  await control(alice, 'break01').click();
  for (const page of [alice, bob]) {
    await expect(deckCard(page, 'veto')).toHaveCount(1);
    await expect(deckCard(page, 'break01')).toHaveCount(0);
  }

  await chooseCardSet(alice, 'T-shirt sizes');
  for (const page of [alice, bob]) {
    await expect.poll(() => trayKeys(page)).toEqual(['xxs0001', 'xs00001', 's000001', 'm000001', 'l000001', 'xl00001',
      'xxl0001', 'qstmrk1', 'veto']);
  }
});

test('a new deck while cards are down: the note, then a new round for everybody', async ({ browser }) => {
  const { alice, bob } = await teamWithTwoPlayers(browser, 'Deck Menu Round');
  await alice.locator('#cset_btn').click();
  await expect(alice.locator('#deck_round_hint')).toHaveCount(0);

  await pickCard(bob, 'five001');
  await expect(alice.locator('#deck_round_hint')).toHaveText(/^Changing the set starts a new round\.$/);
  await alice.locator('#deck_change').click();
  await expect(alice.locator('#deck_round_hint')).toBeVisible(); // also in the list of sets

  // a control card does not end the round
  await alice.locator('#deck_menu .dm-back').click();
  await control(alice, 'xclam01').click();
  await expect(toast(alice)).toHaveText('Cards changed for everyone');
  await expect(deckCard(bob, 'xclam01')).toHaveCount(1);
  await expectTableCard(alice, 'Bob', 'done001');

  // a card of the set does
  await toggle(alice, 'zero001').click();
  await expect(toast(alice)).toHaveText('Cards changed for everyone – new round started');
  await calm(alice);
  for (const page of [alice, bob]) {
    await expectTableCard(page, 'Bob', 'prgrss1');
    await expect(deckCard(page, 'zero001')).toHaveCount(0);
  }
  await expect(bob.locator('#ctl .ctl.selected')).toHaveCount(0);
  await expect(alice.locator('#deck_round_hint')).toHaveCount(0);
});

test('a variant is a preset: Pure, then 100 on as well (custom), Classic sets its cards again', async ({ browser }) => {
  const { alice, bob } = await teamWithTwoPlayers(browser, 'Deck Menu Preset');
  await alice.locator('#cset_btn').click();
  const variant = (name: string) => alice.locator('#deck_variant').getByRole('radio', { name });

  // every card of the group is shown, in catalog order; the ones outside the variant are off
  const all = ['zero001', '1pnt501', 'one0001', 'two0001', 'three01', 'five001', 'eight01', 'thrtn01', 'twnty01',
    '2tyone1', '3tyfr01', '4ty0001', '5tyfve1', 'sixty01', 'eighty9', 'hundro1', 'infin01'];
  await expect.poll(() => alice.locator('#deck_cards .dm-tg')
    .evaluateAll(buttons => buttons.map(b => b.getAttribute('data-card')))).toEqual(all);
  await expect(variant('Classic')).toBeChecked();
  await expect(toggle(alice, '2tyone1')).toHaveAttribute('aria-pressed', 'false');
  // 60 and 89 are in no variant, only to be switched on (Andreas, 2026-10-31)
  await expect(toggle(alice, 'sixty01')).toHaveAttribute('aria-pressed', 'false');
  await expect(toggle(alice, 'eighty9')).toHaveAttribute('aria-pressed', 'false');

  // Pure: its cards on, the others off
  await variant('Pure').check();
  await expect(toggle(alice, 'hundro1')).toHaveAttribute('aria-pressed', 'false');
  await expect(toggle(alice, '2tyone1')).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => trayKeys(bob)).not.toContain('hundro1');

  // 100 on as well: stays on, no variant is marked, the hint tells the custom selection
  await toggle(alice, 'hundro1').click();
  await expect(toggle(alice, 'hundro1')).toHaveAttribute('aria-pressed', 'true');
  await expect(alice.locator('#deck_variant input:checked')).toHaveCount(0);
  await expect(alice.locator('#deck_variant_hint')).toHaveCount(0); // R3 review: no "Custom: …" line
  for (const page of [alice, bob]) {
    await expect.poll(() => trayKeys(page)).toEqual(['zero001', 'one0001', 'two0001', 'three01', 'five001', 'eight01',
      'thrtn01', '2tyone1', '3tyfr01', '5tyfve1', 'hundro1', 'break01', 'qstmrk1']);
  }
  // after a reload it is still the custom selection
  await alice.reload();
  await alice.locator('#cset_btn').click();
  await expect(toggle(alice, 'hundro1')).toHaveAttribute('aria-pressed', 'true');
  await expect(alice.locator('#deck_variant input:checked')).toHaveCount(0);

  // 100 off again: exactly Pure, marked again
  await toggle(alice, 'hundro1').click();
  await expect(variant('Pure')).toBeChecked();

  // Classic sets its cards again
  await toggle(alice, 'infin01').click();
  await variant('Classic').check();
  await expect(variant('Classic')).toBeChecked();
  await expect(toggle(alice, '2tyone1')).toHaveAttribute('aria-pressed', 'false');
  await expect.poll(() => trayKeys(bob)).toEqual(['zero001', '1pnt501', 'one0001', 'two0001', 'three01', 'five001',
    'eight01', 'thrtn01', 'twnty01', '4ty0001', 'hundro1', 'infin01', 'break01', 'qstmrk1']);
});

test('the selection decides the variant: Short plus the Classic cards is Classic', async ({ browser }) => {
  const { alice } = await teamWithTwoPlayers(browser, 'Deck Menu Match');
  await alice.locator('#cset_btn').click();
  const variant = (name: string) => alice.locator('#deck_variant').getByRole('radio', { name });
  const deckId = () => alice.evaluate(async () => {
    const answer = await fetch('./api/dao.php?id=' + localStorage.getItem('SID') + '&t=' + new URLSearchParams(location.search).get('t'));
    return (await answer.json()).deck.id;
  });

  await variant('Short').check();
  await expect.poll(deckId).toBe('fib-short');
  await toggle(alice, '1pnt501').click();
  await expect(alice.locator('#deck_variant input:checked')).toHaveCount(0);
  await expect(alice.locator('#deck_variant_hint')).toHaveCount(0);
  await toggle(alice, 'hundro1').click();
  await toggle(alice, 'infin01').click();
  await expect(variant('Classic')).toBeChecked();
  await expect.poll(deckId).toBe('fib-classic');
});

test('shruggie: off by default, switched on and placed; Emotions: Short and Full (B-106, B-107)', async ({ browser }) => {
  const { alice, bob } = await teamWithTwoPlayers(browser, 'Deck Menu Shruggie Mood');
  await alice.locator('#cset_btn').click();
  await expect(control(alice, 'shrug01')).toHaveAttribute('aria-pressed', 'false');
  await expect(deckCard(bob, 'shrug01')).toHaveCount(0);

  await control(alice, 'shrug01').click();
  await expect(control(alice, 'shrug01')).toHaveAttribute('aria-pressed', 'true');
  await expect(deckCard(bob, 'shrug01')).toHaveCount(1);
  await expect(deckCard(bob, 'shrug01').locator('.dh')).toHaveText('shruggie');
  await pickCard(bob, 'shrug01');
  await expectTableCard(alice, 'Bob', 'done001');

  // Emotions: Short (the six known faces) is the first variant, Full has all twelve
  await chooseCardSet(alice, 'Emotions');
  const variant = (name: string) => alice.locator('#deck_variant').getByRole('radio', { name });
  await expect(variant('Short')).toBeChecked();
  const assessment = ['satis01', 'annoy01', 'sad0001', 'unint01', 'angry01', 'enthu01'];
  for (const page of [alice, bob])
    await expect.poll(() => trayKeys(page)).toEqual([...assessment, 'break01', 'qstmrk1', 'shrug01']);
  // the faces switched on below the variants (R3 review: no line with the values any more)
  const on = alice.locator('#deck_cards .dm-tg[aria-pressed="true"]');
  await expect(on).toHaveCount(6);
  await expect(alice.locator('#deck_variant_hint')).toHaveCount(0);
  await variant('Full').check();
  await expect(on).toHaveCount(12);
  for (const page of [alice, bob]) {
    await expect.poll(() => trayKeys(page)).toEqual([...assessment, 'curio01', 'confu01', 'worri01', 'surpr01',
      'tired01', 'relie01', 'break01', 'qstmrk1', 'shrug01']);
  }
  await pickCard(bob, 'worri01');
  await pickCard(alice, 'shrug01');
  await expectTableCard(alice, 'Bob', 'worri01');
  await expectTableCard(bob, 'Alice', 'shrug01');
});

test('a failed deck write: a toast, a little longer than others, nothing in the menu (R3 review)', async ({ browser }) => {
  const { alice, bob } = await teamWithTwoPlayers(browser, 'Deck Menu Error');
  await alice.locator('#cset_btn').click();
  await alice.route('**/api/update_controls.php*', route => route.fulfill({ status: 500, body: '' }));
  await control(alice, 'veto').click();
  await expect(toast(alice)).toHaveText('Not saved – please try again');
  await expect(toast(alice)).toHaveClass(/toast-on/);
  await calm(alice);
  await expect(deckCard(bob, 'veto')).toHaveCount(0);
  // longer than the usual 2.2 s, then gone
  await alice.waitForTimeout(3000);
  await expect(toast(alice)).toHaveClass(/toast-on/);
  await expect(toast(alice)).not.toHaveClass(/toast-on/, { timeout: 3000 });
});

test('the deck menu does not jump: no message in the menu, done or error (R3 review)', async ({ browser }) => {
  const { alice } = await teamWithTwoPlayers(browser, 'Deck Menu Steady');
  await alice.locator('#cset_btn').click();
  const where = async () => {
    const [box, cards, variants, ctl] = [(await alice.locator('#deck_change').boundingBox())!,
      (await alice.locator('#deck_cards').boundingBox())!, (await alice.locator('#deck_variant').boundingBox())!,
      (await alice.locator('#deck_controls').boundingBox())!];
    return { boxY: box.y, boxH: box.height, cardsY: cards.y, cardsH: cards.height, variantsY: variants.y,
      ctlY: ctl.y, ctlH: ctl.height };
  };
  const same = (a: Awaited<ReturnType<typeof where>>, b: typeof a) => {
    for (const k of Object.keys(a) as (keyof typeof a)[]) expect(Math.abs(a[k] - b[k])).toBeLessThanOrEqual(1);
  };
  await calm(alice);
  const before = await where();

  // a card off: a toast, nothing moves; no variant checked, no extra line below the variants
  await toggle(alice, 'hundro1').click();
  await expect(toast(alice)).toHaveText('Cards changed for everyone');
  await expect(alice.locator('#deck_variant input:checked')).toHaveCount(0);
  await calm(alice);
  same(before, await where());
  // on again: Classic again, still in place
  await toggle(alice, 'hundro1').click();
  await expect(alice.locator('#deck_variant').getByRole('radio', { name: 'Classic' })).toBeChecked();
  same(before, await where());

  // an error: a toast, nothing moves
  await alice.route('**/api/update_deck.php*', route => route.fulfill({ status: 500, body: '' }));
  await toggle(alice, 'zero001').click();
  await expect(toast(alice)).toHaveText('Not saved – please try again');
  await calm(alice);
  same(before, await where());
});

/* Andreas (compact list): 1280×800, the 8 built-in sets and 5 own sets, the last one visible without scrolling */
test('the list of card sets fits on a desktop screen: the last set visible without scrolling', async ({ browser }) => {
  const { alice, url } = await teamWithTwoPlayers(browser, 'Deck Menu Compact');
  const t = new URL(url).searchParams.get('t') as string;
  for (let i = 1; i <= 5; i++) {
    const res = await alice.request.post(`/api/custom_set_create.php?t=${encodeURIComponent(t)}`, {
      data: JSON.stringify({ name: `Set ${i}`, style: 'plain', cards: [{ symbol: 's-1', color: 'blue' }, { symbol: 's-2', color: 'blue' }] }),
      headers: { 'Content-Type': 'application/json' } });
    expect(res.ok()).toBeTruthy();
  }
  await alice.setViewportSize({ width: 1280, height: 800 });
  await alice.locator('#cset_btn').click();
  await alice.locator('#deck_change').click();
  const rows = alice.locator('#deck_menu .dm-prow-b');
  await expect(rows).toHaveCount(13);
  // every row is a full tap target (--tap) with its fan
  const tap = await alice.evaluate(() => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--tap')));
  for (const height of await rows.evaluateAll(els => els.map(e => e.getBoundingClientRect().height))) {
    expect(height).toBeGreaterThanOrEqual(tap);
  }
  await expect(rows.locator('.dm-fan')).toHaveCount(13);
  const last = rows.last();
  await expect(last).toContainText('Set 5');
  const scrolled = await alice.locator('#deck_menu').evaluate(el => {
    let n: Element | null = el;
    let top = 0;
    while (n !== null) { top += n.scrollTop; n = n.parentElement; }
    return top;
  });
  expect(scrolled).toBe(0);
  const box = (await last.boundingBox())!;
  expect(box.y + box.height).toBeLessThanOrEqual(800);
  await expect(last).toBeInViewport({ ratio: 1 });
});
