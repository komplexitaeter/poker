import { test, expect, Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { newPlayer, createTeam, joinAsPlayer } from './helpers';

/**
 * B-69 (large screens): the deck has no scrollbar. When it overflows, a chevron bar shows at the
 * edge where more cards are hidden (more-left / more-right on #down-container); a click on it
 * scrolls the deck that way. Keys 1–9 and 0 bring a hidden card into view.
 * B-75 (phones): the deck is a carousel instead: no bars, the card in the middle larger, dots below
 * (display only), a tap picks and centers a card, a swipe never picks.
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
  await expect(alice.locator('#ctl img.on')).toHaveCount(46);
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
  await expect(alice.locator('#ctl img.on')).toHaveCount(4);
  await expect(tray).not.toHaveClass(/more-left/);
  await expect(tray).not.toHaveClass(/more-right/);
  await alice.context().close();
});

test('deck hints: a key brings a hidden card into view, the wheel scrolls sideways (B-69)', async ({ browser }) => {
  const alice = await newPlayer(browser, { viewport: { width: 1000, height: 800 }, reducedMotion: 'reduce' });
  const url = await createTeam(alice, 'Deck Keys');
  setDeck(new URL(url).searchParams.get('t')!, ALL);
  await joinAsPlayer(alice, url, 'Alice');
  await expect(alice.locator('#ctl img.on')).toHaveCount(46);
  const ctl = alice.locator('#ctl');
  await expect.poll(() => ctl.evaluate(el => el.scrollWidth > el.clientWidth)).toBe(true);

  // the mouse wheel (vertical) scrolls the deck sideways
  const deck = (await ctl.boundingBox())!;
  await alice.mouse.move(deck.x + deck.width / 2, deck.y + deck.height / 2);
  await alice.mouse.wheel(0, 300);
  await expect.poll(() => ctl.evaluate(el => el.scrollLeft)).toBeGreaterThan(0);

  // scrolled to the end, the first card is hidden; key 1 brings it back and picks it
  await ctl.evaluate(el => { el.scrollLeft = el.scrollWidth; });
  const first = alice.locator('#ctl img.on >> nth=0');
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
  await expect(alice.locator('#ctl img.on')).toHaveCount(46);
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
    [el.clientWidth, el.querySelector('img.on')!.getBoundingClientRect().width]);
  expect(Math.abs(step - (width - card))).toBeLessThan(2);
  await expect(tray).toHaveClass(/more-left/);

  // "<" scrolls back to the start
  await alice.getByRole('button', { name: 'Show previous cards' }).click();
  await expect.poll(scrollLeft).toBe(0);
  await expect(tray).not.toHaveClass(/more-left/);

  // the bars took the clicks: no card was picked
  await expect(alice.locator('#ctl img.selected')).toHaveCount(0);
  await alice.context().close();
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
  const cards = alice.locator('#ctl img.on');
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
    el.querySelectorAll('img.on').forEach(img => {
      const r = img.getBoundingClientRect();
      const d = Math.abs(r.left + r.width / 2 - mid);
      if (d < dist) { dist = d; best = img.id; }
    });
    return best;
  });
  const width = (id: string) => alice.locator(`#ctl img#${id}`).evaluate(img => img.getBoundingClientRect().width);
  const centered = await middle();
  const others = await cards.evaluateAll((imgs, id) => imgs.filter(i => i.id !== id)
    .map(i => i.getBoundingClientRect().width), centered);
  expect(await width(centered)).toBeGreaterThan(Math.max(...others));

  // a swipe moves the deck by cards, but never picks one
  const deck = (await ctl.boundingBox())!;
  const before = await ctl.evaluate(el => el.scrollLeft);
  await swipe(alice, deck.x + deck.width / 2 + 60, deck.y + deck.height / 2, -120);
  await expect.poll(() => ctl.evaluate(el => el.scrollLeft)).toBeGreaterThan(before);
  await expect.poll(middle).not.toBe(centered);
  await alice.waitForTimeout(500);
  await expect(alice.locator('#ctl img.selected')).toHaveCount(0);

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
