import { test, expect, Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { newPlayer, createTeam, joinAsPlayer, deckCard, deckCards, selectedDeckCards } from './helpers';

/**
 * B-69 (large screens): the deck has no scrollbar. When it overflows, a chevron bar shows at the
 * edge where more cards are hidden (more-left / more-right on #down-container); a click on it
 * scrolls the deck that way. Keys 1–9 and 0 bring a hidden card into view.
 * B-75 (touch phones): the deck is a carousel instead: no bars, the card in the middle larger, dots below
 * (display only), a tap picks and centers a card, a swipe never picks. A narrow window with a mouse
 * keeps the deck row with the bars (Andreas, 2026-10-29). B-77: touch at any width (tablets: the
 * floating tray), the falloff relative to the tray's width.
 */
const PHONE = { width: 390, height: 844 };
const NARROW = { width: 1000, height: 800 }; // large screen layout, 46 cards overflow the tray

function setDeck(t: string, indexes: number[]) {
  expect(t).toMatch(/^[A-Za-z0-9_-]+$/); // checked before it goes into the statement
  const flags = Array(46).fill('0');
  indexes.forEach(i => flags[i] = '1');
  execFileSync('mysql', ['-h127.0.0.1', '-upok_e2e', '-ppok_e2e', 'pok_e2e', '-e',
    `update pok_teams_tbl set cardset_flags='${flags.join('')}' where id='${t}'`]);
}

const ALL = Array.from({ length: 46 }, (_, i) => i);

const barOpacity = (page: Page, side: 'left' | 'right') =>
  page.locator(`.deck-more-${side}`).evaluate(el => getComputedStyle(el).opacity);

test('deck hints: ">" at the start, "<" at the end, no scrollbar (B-69)', async ({ browser }) => {
  const alice = await newPlayer(browser, { viewport: NARROW });
  const url = await createTeam(alice, 'Deck Hints');
  const t = new URL(url).searchParams.get('t')!;
  setDeck(t, ALL);
  await joinAsPlayer(alice, url, 'Alice');
  await expect(deckCards(alice)).toHaveCount(46);
  const tray = alice.locator('#down-container');
  const ctl = alice.locator('#ctl');

  // no scrollbar takes room below the cards
  expect(await ctl.evaluate(el => [getComputedStyle(el).scrollbarWidth, el.offsetHeight - el.clientHeight]))
    .toEqual(['none', 0]);
  const height = (await tray.boundingBox())!.height;

  // at the start: only ">"
  await expect(tray).toHaveClass(/more-right/);
  await expect(tray).not.toHaveClass(/more-left/);
  await expect.poll(() => barOpacity(alice, 'right')).toBe('1');
  expect(await barOpacity(alice, 'left')).toBe('0');
  // a hidden bar is not in the way (and not in the accessibility tree)
  await expect(alice.locator('.deck-more-left')).toBeHidden();

  // in the middle: both
  await ctl.evaluate(el => { el.scrollLeft = 200; });
  await expect(tray).toHaveClass(/more-left/);
  await expect(tray).toHaveClass(/more-right/);

  // at the end: only "<"; the tray keeps its height
  await ctl.evaluate(el => { el.scrollLeft = el.scrollWidth; });
  await expect(tray).toHaveClass(/more-left/);
  await expect(tray).not.toHaveClass(/more-right/);
  expect(Math.abs((await tray.boundingBox())!.height - height)).toBeLessThan(1);

  // a deck that fits: no bars
  setDeck(t, [0, 2, 3, 4]);
  await alice.reload();
  await expect(deckCards(alice)).toHaveCount(4);
  await expect(tray).not.toHaveClass(/more-left/);
  await expect(tray).not.toHaveClass(/more-right/);
  await alice.context().close();
});

test('deck hints: a key brings a hidden card into view, the wheel scrolls sideways (B-69)', async ({ browser }) => {
  const alice = await newPlayer(browser, { viewport: { width: 1000, height: 800 }, reducedMotion: 'reduce' });
  const url = await createTeam(alice, 'Deck Keys');
  setDeck(new URL(url).searchParams.get('t')!, ALL);
  await joinAsPlayer(alice, url, 'Alice');
  await expect(deckCards(alice)).toHaveCount(46);
  const ctl = alice.locator('#ctl');
  await expect.poll(() => ctl.evaluate(el => el.scrollWidth > el.clientWidth)).toBe(true);

  // the mouse wheel (vertical) scrolls the deck sideways
  const deck = (await ctl.boundingBox())!;
  await alice.mouse.move(deck.x + deck.width / 2, deck.y + deck.height / 2);
  await alice.mouse.wheel(0, 300);
  await expect.poll(() => ctl.evaluate(el => el.scrollLeft)).toBeGreaterThan(0);

  // scrolled to the end, the first card is hidden; key 1 brings it back and picks it
  await ctl.evaluate(el => { el.scrollLeft = el.scrollWidth; });
  const first = deckCards(alice).first();
  const visible = () => first.evaluate(img => {
    const c = img.closest('#ctl')!.getBoundingClientRect();
    const r = img.getBoundingClientRect();
    return r.left >= c.left - 1 && r.right <= c.right + 1;
  });
  expect(await visible()).toBe(false);
  await alice.keyboard.press('1');
  await expect.poll(visible).toBe(true);
  await expect(first).toHaveClass(/selected/);
  // the first card scrolls the deck back to its start: no bar covers it
  await expect.poll(() => ctl.evaluate(el => el.scrollLeft)).toBe(0);
  await expect(alice.locator('#down-container')).not.toHaveClass(/more-left/);
  await alice.context().close();
});

test('deck hints: a click on a bar scrolls the deck, no card is picked (B-69)', async ({ browser }) => {
  const alice = await newPlayer(browser, { viewport: NARROW, reducedMotion: 'reduce' });
  const url = await createTeam(alice, 'Deck Bars');
  setDeck(new URL(url).searchParams.get('t')!, ALL);
  await joinAsPlayer(alice, url, 'Alice');
  await expect(deckCards(alice)).toHaveCount(46);
  const tray = alice.locator('#down-container');
  const ctl = alice.locator('#ctl');
  const scrollLeft = () => ctl.evaluate(el => el.scrollLeft);
  await expect(tray).toHaveClass(/more-right/);

  // ">" scrolls right by about one visible width minus one card
  const more = alice.getByRole('button', { name: 'Show more cards' });
  await more.click();
  await expect.poll(scrollLeft).toBeGreaterThan(0);
  const step = await scrollLeft();
  const [width, card] = await ctl.evaluate(el =>
    [el.clientWidth, el.querySelector('.ctl')!.getBoundingClientRect().width]);
  expect(Math.abs(step - (width - card))).toBeLessThan(2);
  await expect(tray).toHaveClass(/more-left/);

  // "<" scrolls back to the start
  await alice.getByRole('button', { name: 'Show previous cards' }).click();
  await expect.poll(scrollLeft).toBe(0);
  await expect(tray).not.toHaveClass(/more-left/);

  // the bars took the clicks: no card was picked
  await expect(selectedDeckCards(alice)).toHaveCount(0);
  await alice.context().close();
});

test('narrow window with a mouse: no carousel, the edge bars scroll the deck, keys pick (B-75, B-69)', async ({ browser }) => {
  const alice = await newPlayer(browser, { viewport: PHONE, reducedMotion: 'reduce' }); // no touch
  const url = await createTeam(alice, 'Deck Narrow Mouse');
  setDeck(new URL(url).searchParams.get('t')!, ALL);
  await joinAsPlayer(alice, url, 'Alice');
  await expect(deckCards(alice)).toHaveCount(46);
  const tray = alice.locator('#down-container');
  const ctl = alice.locator('#ctl');
  const scrollLeft = () => ctl.evaluate(el => el.scrollLeft);

  // the deck row of B-69: no dots, no "picked" line, no snapping, all cards the same size
  await expect(alice.locator('#deck_dots')).toBeHidden();
  await expect(alice.locator('#deck_dots .deck-dot')).toHaveCount(0);
  await expect(alice.locator('#deck_pick')).toBeHidden();
  expect(await ctl.evaluate(el => getComputedStyle(el).scrollSnapType)).toBe('none');
  const widths = await deckCards(alice).evaluateAll(imgs =>
    imgs.slice(0, 5).map(i => Math.round(i.getBoundingClientRect().width)));
  expect(new Set(widths).size).toBe(1);

  // ">" visible and clickable: scrolls the deck, "<" shows up and scrolls back; nothing picked
  await expect(tray).toHaveClass(/more-right/);
  await expect(alice.locator('.deck-more-right')).toBeVisible();
  await expect(alice.locator('.deck-more-left')).toBeHidden();
  await alice.getByRole('button', { name: 'Show more cards' }).click();
  await expect.poll(scrollLeft).toBeGreaterThan(0);
  await expect(alice.locator('.deck-more-left')).toBeVisible();
  await alice.getByRole('button', { name: 'Show previous cards' }).click();
  await expect.poll(scrollLeft).toBe(0);
  await expect(selectedDeckCards(alice)).toHaveCount(0);

  // the wheel scrolls sideways, a key picks a card and brings it into view
  const deck = (await ctl.boundingBox())!;
  await alice.mouse.move(deck.x + deck.width / 2, deck.y + deck.height / 2);
  await alice.mouse.wheel(0, 200);
  await expect.poll(scrollLeft).toBeGreaterThan(0);
  await alice.keyboard.press('1');
  await expect(deckCards(alice).nth(0)).toHaveClass(/selected/);
  await expect.poll(scrollLeft).toBe(0);

  // a click picks the card without moving the deck to the middle
  const card = deckCards(alice).nth(3);
  await card.click();
  await expect(card).toHaveClass(/selected/);
  await alice.waitForTimeout(300);
  expect(await scrollLeft()).toBe(0);
  await alice.context().close();
});

test('touch device: the carousel stays at any width, no traces left when a mouse takes over (B-75, B-77)', async ({ browser }) => {
  const alice = await newPlayer(browser, { viewport: PHONE, hasTouch: true, isMobile: true, reducedMotion: 'reduce' });
  const url = await createTeam(alice, 'Deck Switch');
  setDeck(new URL(url).searchParams.get('t')!, [0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  await joinAsPlayer(alice, url, 'Alice');
  const cards = deckCards(alice);
  await expect(cards).toHaveCount(11);
  await expect(alice.locator('#deck_dots .deck-dot')).toHaveCount(11);
  expect(await cards.nth(0).evaluate(img => img.style.transform)).not.toBe('');

  // B-77: across 800px (large screen layout, the floating tray) touch keeps the carousel, a card in the middle
  await alice.setViewportSize({ width: 1000, height: 800 });
  await expect(alice.locator('#deck_dots')).toBeVisible();
  await expect(alice.locator('#deck_dots .deck-dot.current')).toHaveCount(1);
  await expect(alice.locator('.deck-more-right')).toBeHidden();
  expect(await offCenterOfCurrent(alice)).toBeLessThanOrEqual(1);

  await alice.setViewportSize(PHONE);
  await expect(alice.locator('#deck_dots')).toBeVisible();
  await expect(alice.locator('#deck_dots .deck-dot.current')).toHaveCount(1);
  expect(await offCenterOfCurrent(alice)).toBeLessThanOrEqual(1);

  // a mouse takes over (touch emulation off: hover / fine pointer): the deck row, no traces of the carousel
  const cdp = await alice.context().newCDPSession(alice);
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: false });
  await expect(alice.locator('#deck_dots')).toBeHidden();
  await expect.poll(() => cards.evaluateAll(imgs => imgs.every(i => i.style.transform === '' && i.style.opacity === ''))).toBe(true);
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
  await expect(alice.locator('#deck_dots')).toBeVisible();
  await expect(alice.locator('#deck_dots .deck-dot.current')).toHaveCount(1);
  await cdp.detach();
  await alice.context().close();
});

/** distance of the card in the middle (its dot is the ring) from the middle of the deck, in px */
const offCenterOfCurrent = (page: Page) => page.evaluate(() => {
  const ctl = document.getElementById('ctl')!;
  const i = Array.from(document.querySelectorAll('#deck_dots .deck-dot')).findIndex(d => d.classList.contains('current'));
  const slot = (ctl.querySelectorAll('.ctl')[i] as HTMLElement).parentElement!.getBoundingClientRect();
  const deck = ctl.getBoundingClientRect();
  return Math.abs(slot.left + slot.width / 2 - (deck.left + deck.width / 2));
});

/** a horizontal finger swipe over the deck (real touch events, the browser scrolls natively) */
async function swipe(page: Page, x: number, y: number, dx: number) {
  const cdp = await page.context().newCDPSession(page);
  const touch = (type: string, px: number) => cdp.send('Input.dispatchTouchEvent', {
    type, touchPoints: type === 'touchEnd' ? [] : [{ x: px, y }],
  });
  await touch('touchStart', x);
  for (let i = 1; i <= 10; i++) await touch('touchMove', x + dx * i / 10);
  await touch('touchEnd', x + dx);
  await cdp.detach();
}

test('phone deck: a carousel with dots, a tap picks, a swipe does not, no edge bars (B-75)', async ({ browser }) => {
  const alice = await newPlayer(browser, { viewport: PHONE, hasTouch: true, isMobile: true, reducedMotion: 'reduce' });
  const url = await createTeam(alice, 'Deck Carousel');
  setDeck(new URL(url).searchParams.get('t')!, [0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  await joinAsPlayer(alice, url, 'Alice');
  const cards = deckCards(alice);
  await expect(cards).toHaveCount(11);
  const ctl = alice.locator('#ctl');
  const line = alice.locator('#deck_pick');

  // no "<" / ">" bars and no key hint on phones; one dot per card, a ring for the card in the middle
  await expect(alice.locator('.deck-more-left')).toBeHidden();
  await expect(alice.locator('.deck-more-right')).toBeHidden();
  await expect(alice.locator('#deck_dots .deck-dot')).toHaveCount(11);
  await expect(alice.locator('#deck_dots .deck-dot.current')).toHaveCount(1);
  await expect(alice.locator('#deck_dots')).toHaveAttribute('aria-hidden', 'true');
  await expect(line).toHaveText('tap to pick a card');

  // the card in the middle: larger than its neighbours, centered
  const middle = () => ctl.evaluate(el => {
    const c = el.getBoundingClientRect();
    const mid = c.left + c.width / 2;
    let best = '';
    let dist = Infinity;
    el.querySelectorAll('.ctl').forEach(img => {
      const r = img.getBoundingClientRect();
      const d = Math.abs(r.left + r.width / 2 - mid);
      if (d < dist) { dist = d; best = img.getAttribute('data-card')!; }
    });
    return best;
  });
  const width = (id: string) => deckCard(alice, id).evaluate(img => img.getBoundingClientRect().width);
  const centered = await middle();
  const others = await cards.evaluateAll((imgs, id) => imgs.filter(i => i.getAttribute('data-card') !== id)
    .map(i => i.getBoundingClientRect().width), centered);
  expect(await width(centered)).toBeGreaterThan(Math.max(...others));

  // a swipe moves the deck by cards, but never picks one
  const deck = (await ctl.boundingBox())!;
  const before = await ctl.evaluate(el => el.scrollLeft);
  await swipe(alice, deck.x + deck.width / 2 + 60, deck.y + deck.height / 2, -120);
  await expect.poll(() => ctl.evaluate(el => el.scrollLeft)).toBeGreaterThan(before);
  await expect.poll(middle).not.toBe(centered);
  await alice.waitForTimeout(500);
  await expect(selectedDeckCards(alice)).toHaveCount(0);

  // a tap picks the card and brings it to the middle; its dot is filled, the line names it
  const target = cards.nth(2);
  const id = await target.getAttribute('id');
  await target.tap();
  await expect(target).toHaveClass(/selected/);
  await expect.poll(middle).toBe(id);
  await expect(alice.locator('#deck_dots .deck-dot.picked')).toHaveCount(1);
  await expect(alice.locator('#deck_dots .deck-dot').nth(2)).toHaveClass(/picked/);
  await expect(line).toHaveText(/^you picked \S+/);

  // a pull from the server does not move the deck
  const scrolled = await ctl.evaluate(el => el.scrollLeft);
  await alice.evaluate('updateDao(false)');
  await alice.waitForTimeout(500);
  expect(await ctl.evaluate(el => el.scrollLeft)).toBe(scrolled);

  // a swipe that cannot move (left at the first card) does not lock the deck: the next tap still picks
  await ctl.evaluate(el => { el.scrollLeft = 0; });
  await expect.poll(middle).toBe(await cards.nth(0).getAttribute('id'));
  await alice.waitForTimeout(300);
  await swipe(alice, deck.x + deck.width / 2, deck.y + deck.height / 2, 120);
  await alice.waitForTimeout(400);
  await cards.nth(0).tap();
  await expect(cards.nth(0)).toHaveClass(/selected/);
  await alice.context().close();
});

test('phone deck: a tap on a card further out brings it exactly to the middle, no settle bounce (B-75)', async ({ browser }) => {
  // smooth scrolling (no reduced motion): snapping is off on the way, the card lands centered
  const alice = await newPlayer(browser, { viewport: PHONE, hasTouch: true, isMobile: true });
  const url = await createTeam(alice, 'Deck Carousel Tap');
  setDeck(new URL(url).searchParams.get('t')!, [0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  // start from this deck, not from the start deck the board showed before (its size moved the carousel, B-98 S2)
  await alice.reload();
  await joinAsPlayer(alice, url, 'Alice');
  const cards = deckCards(alice);
  await expect(cards).toHaveCount(11);
  const ctl = alice.locator('#ctl');

  // any "settle" class on the deck, ever
  await ctl.evaluate(el => {
    (window as any).__settle = 0;
    new MutationObserver(list => list.forEach(m => {
      if ((m.target as Element).classList.contains('settle')) (window as any).__settle++;
    })).observe(el, { attributes: true, attributeFilter: ['class'], subtree: true });
  });
  // distance of a card's slot from the middle of the deck, in px
  const offCenter = (i: number) => cards.nth(i).evaluate(img => {
    const deck = img.closest('#ctl')!.getBoundingClientRect();
    const slot = img.parentElement!.getBoundingClientRect();
    return Math.abs(slot.left + slot.width / 2 - (deck.left + deck.width / 2));
  });

  const start = await ctl.evaluate(el => el.scrollLeft);
  for (const i of [8, 9, 2]) { // two and more cards away from the middle, both directions
    expect(await offCenter(i)).toBeGreaterThan(50);
    await cards.nth(i).tap();
    await expect(cards.nth(i)).toHaveClass(/selected/);
    await expect.poll(() => offCenter(i)).toBeLessThanOrEqual(1);
    await expect(ctl).not.toHaveClass(/steering/); // snapping is on again at rest
    await alice.waitForTimeout(300);
    expect(await offCenter(i)).toBeLessThanOrEqual(1); // and stays there
  }
  expect(await ctl.evaluate(el => el.scrollLeft)).not.toBe(start);
  expect(await alice.evaluate(() => (window as any).__settle)).toBe(0);

  // a finger on the deck stops the tween at once: snapping on again, the deck stays where it is
  const [steering, afterDown] = await ctl.evaluate(el => {
    (el.querySelectorAll('.ctl')[9] as HTMLElement).click(); // starts the tween (keyboard-like click)
    const steering = el.classList.contains('steering');
    el.dispatchEvent(new PointerEvent('pointerdown', { isPrimary: true, bubbles: true }));
    return [steering, el.classList.contains('steering')];
  });
  expect(steering).toBe(true);
  expect(afterDown).toBe(false);
  const stopped = await ctl.evaluate(el => el.scrollLeft);
  await alice.waitForTimeout(400);
  expect(Math.abs(await ctl.evaluate(el => el.scrollLeft) - stopped)).toBeLessThanOrEqual(1);
  await expect(alice.locator('#ctl .settle')).toHaveCount(0);
  await alice.context().close();
});

/** B-77: the column's round button and the floating tray (large screens): the button ends a little above the tray */
async function expectDockAligned(page: Page) {
  const tray = (await page.locator('#down-container').boundingBox())!;
  const btn = (await page.locator('#newroundbtn').boundingBox())!;
  const lift = tray.y + tray.height - (btn.y + btn.height);
  expect(lift).toBeGreaterThanOrEqual(12);
  expect(lift).toBeLessThanOrEqual(28);
  expect(btn.x).toBeGreaterThan(tray.x + tray.width); // in the column, right of the tray
}

for (const [name, viewport] of [['portrait', { width: 820, height: 1180 }], ['landscape', { width: 1180, height: 820 }]] as const) {
  test(`tablet ${name}: the carousel in the floating tray, a tap picks and centers, the column's button aligned (B-77)`, async ({ browser }) => {
    const alice = await newPlayer(browser, { viewport, hasTouch: true, isMobile: true, reducedMotion: 'reduce' });
    const url = await createTeam(alice, `Deck Tablet ${name}`);
    setDeck(new URL(url).searchParams.get('t')!, ALL.slice(0, 17).filter(i => i !== 1));
    await joinAsPlayer(alice, url, 'Alice');
    const cards = deckCards(alice);
    await expect(cards).toHaveCount(16);
    const tray = alice.locator('#down-container');

    // large screen layout (the column on the right), the deck a carousel: dots, the line, no edge bars, no key hint
    await expect(alice.locator('#newroundbtn')).toBeVisible();
    await expect(alice.locator('#deck_dots .deck-dot')).toHaveCount(16);
    await expect(alice.locator('#deck_dots .deck-dot.current')).toHaveCount(1);
    await expect(alice.locator('#deck_pick')).toHaveText('tap to pick a card');
    await expect(alice.locator('.deck-more-left')).toBeHidden();
    await expect(alice.locator('.deck-more-right')).toBeHidden();
    await expect(alice.locator('.deck-hint')).toBeHidden();

    // the cards stay a comfortable size: every card within half the tray at least 44px wide, the middle one larger
    const widths = await alice.evaluate(() => {
      const ctl = document.getElementById('ctl')!;
      const deck = ctl.getBoundingClientRect();
      const mid = deck.left + deck.width / 2;
      return Array.from(ctl.querySelectorAll('.ctl')).map(img => {
        const r = img.getBoundingClientRect();
        return { d: Math.abs(r.left + r.width / 2 - mid), w: r.width, half: deck.width / 2 };
      });
    });
    const middle = widths.reduce((a, b) => (b.d < a.d ? b : a));
    expect(middle.w).toBeGreaterThanOrEqual(60);
    widths.filter(c => c !== middle && c.d < c.half / 2).forEach(c => {
      expect(c.w).toBeGreaterThanOrEqual(44);
      expect(c.w).toBeLessThan(middle.w);
    });
    await expectDockAligned(alice);

    // a tap picks a card further out and brings it to the middle; the tray keeps its height
    const height = (await tray.boundingBox())!.height;
    const target = cards.nth(9);
    await target.tap();
    await expect(target).toHaveClass(/selected/);
    await expect.poll(() => offCenterOfCurrent(alice)).toBeLessThanOrEqual(1);
    await expect(alice.locator('#deck_dots .deck-dot').nth(9)).toHaveClass(/current/);
    await expect(alice.locator('#deck_dots .deck-dot').nth(9)).toHaveClass(/picked/);
    await expect(alice.locator('#deck_pick')).toHaveText(/^you picked \S+/);
    expect((await tray.boundingBox())!.height).toBe(height);

    // the timer comes: the button stays where it is
    const btn = (await alice.locator('#newroundbtn').boundingBox())!;
    execFileSync('mysql', ['-h127.0.0.1', '-upok_e2e', '-ppok_e2e', 'pok_e2e', '-e',
      `update pok_teams_tbl set timer_visibility=1 where id='${new URL(url).searchParams.get('t')}'`]);
    await alice.evaluate('updateDao(false)');
    await expect(alice.locator('#timer')).toBeVisible();
    expect(await alice.locator('#newroundbtn').boundingBox()).toEqual(btn);
    await expectDockAligned(alice);
    await alice.context().close();
  });
}
