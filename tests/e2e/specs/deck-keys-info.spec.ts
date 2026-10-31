import { test, expect, Page } from '@playwright/test';
import { newPlayer, createTeam, joinAsPlayer, addPlayersViaApi, deckCard, deckCards, selectedDeckCards, pickCard,
  tableCard, setTeamDeck, FIB_ALL, CONTROLS_ALL } from './helpers';

/* B-99 F8 (Andreas):
 *   15  control cards on the table show heading and description in every set (small cards: a few whole lines)
 *   19  sets in the style "inverted" (J.U.D.G.E.) show small values as a mini square, not as grey digits
 *   21  the info line: one block in the middle, the text left-aligned next to the chip
 *   22  the letter rows pick the cards (Q–P, A–L, Y–M, physical keys), labels in the user's layout
 *   23  the average pointer close below the spread's labels */

const DESKTOP = { width: 1400, height: 900 };

function teamParam(url: string): string {
  return encodeURIComponent(new URL(url).searchParams.get('t')!);
}

async function setCard(page: Page, url: string, id: string, key: string): Promise<void> {
  expect((await page.request.post(`/api/setc.php?id=${id}&cardkey=${key}&t=${teamParam(url)}`)).ok()).toBeTruthy();
}

/* navigator.keyboard as a browser without it (Firefox, Safari) or with a given layout map (Chromium) */
async function withLayout(page: Page, layout: Record<string, string> | null): Promise<void> {
  await page.addInitScript(map => {
    Object.defineProperty(navigator, 'keyboard', {
      configurable: true,
      value: map === null ? undefined : { getLayoutMap: async () => new Map(Object.entries(map)) },
    });
  }, layout);
}

const KEY_LABELS = (page: Page) => page.locator('#ctl .ctl-key').allTextContents();

test('letter keys pick the cards row by row; labels QWERTZ without a layout map (F8, 22)', async ({ browser }) => {
  const alice = await newPlayer(browser, { viewport: DESKTOP });
  await withLayout(alice, null);
  const url = await createTeam(alice, 'Letter Keys');
  await setTeamDeck(alice, url, 'fib-classic', FIB_ALL, CONTROLS_ALL); // 21 cards
  await joinAsPlayer(alice, url, 'Alice');
  await expect(deckCards(alice)).toHaveCount(21);
  expect((await KEY_LABELS(alice)).join('')).toBe('QWERTZUIOPASDFGHJKLYX');
  await expect(alice.locator('.deck-hint')).toHaveText('keys Q–X pick a card');
  // shown in small letters like the rest of the app (CSS text-transform, Andreas #25)
  await expect(alice.locator('#ctl .ctl-key').first()).toHaveText('q', { useInnerText: true });
  await expect(alice.locator('.deck-hint')).toHaveCSS('text-transform', 'lowercase'); // hidden here (hint-off)

  // the physical keys: top row, then the middle row, then the bottom row (control cards included)
  await alice.keyboard.press('KeyY'); // the 6th key of the top row (Z on QWERTZ)
  await expect(deckCard(alice, 'five001')).toHaveClass(/selected/);
  await alice.keyboard.press('KeyA'); // the 11th card
  await expect(deckCards(alice).nth(10)).toHaveClass(/selected/);
  await alice.keyboard.press('KeyX'); // the 21st card, the last control card
  await expect(deckCards(alice).nth(20)).toHaveClass(/selected/);
  await expect(deckCards(alice).nth(20)).toHaveAttribute('data-card', 'veto');

  // no other card: digits (gone), modifiers (browser and system shortcuts), a key without a card
  for (const key of ['Digit1', 'Shift+KeyQ', 'Control+KeyQ', 'Alt+KeyQ', 'KeyC']) await alice.keyboard.press(key);
  await alice.waitForTimeout(300);
  await expect(selectedDeckCards(alice)).toHaveCount(1);
  await expect(deckCards(alice).nth(20)).toHaveClass(/selected/);

  // typing in a field picks nothing
  await alice.locator('#topic_btn').click();
  const topic = alice.locator('#topic_txt');
  await topic.click();
  await topic.press('KeyQ');
  await expect(topic).toHaveValue('q');
  await expect(deckCards(alice).nth(20)).toHaveClass(/selected/);
});

test('labels follow the layout map, the key stays physical (QWERTY, AZERTY) (F8, 22)', async ({ browser }) => {
  const alice = await newPlayer(browser, { viewport: DESKTOP });
  // AZERTY: the top row starts with A Z, the middle row with Q, the bottom row with W
  await withLayout(alice, { KeyQ: 'a', KeyW: 'z', KeyE: 'e', KeyR: 'r', KeyT: 't', KeyY: 'y', KeyU: 'u', KeyI: 'i',
    KeyO: 'o', KeyP: 'p', KeyA: 'q', KeyS: 's', KeyD: 'd', KeyF: 'f', KeyG: 'g', KeyH: 'h', KeyJ: 'j', KeyK: 'k',
    KeyL: 'l', KeyZ: 'w', KeyX: 'x', KeyC: 'c', KeyV: 'v', KeyB: 'b', KeyN: 'n', KeyM: ',' });
  const url = await createTeam(alice, 'Layout Keys');
  await setTeamDeck(alice, url, 'fib-classic', FIB_ALL, CONTROLS_ALL);
  await joinAsPlayer(alice, url, 'Alice');
  await expect(deckCards(alice)).toHaveCount(21);
  await expect.poll(async () => (await KEY_LABELS(alice)).join('')).toBe('AZERTYUIOPQSDFGHJKLWX');
  await expect(alice.locator('.deck-hint')).toHaveText('keys A–X pick a card');
  await expect(alice.locator('#ctl .ctl-key').first()).toHaveText('a', { useInnerText: true });
  // the key in the top left corner picks the first card, whatever is printed on it
  await alice.keyboard.press('KeyQ');
  await expect(deckCards(alice).first()).toHaveClass(/selected/);
});

test('control cards on the table: heading and description in every set, whole lines on small cards (F8, 15)', async ({ browser }) => {
  const alice = await newPlayer(browser, { viewport: DESKTOP });
  const url = await createTeam(alice, 'Control Texts');
  const ids = await addPlayersViaApi(alice, url, ['Bob', 'Carol', 'Dan']);
  await setTeamDeck(alice, url, 'fib-classic', null, CONTROLS_ALL);
  await joinAsPlayer(alice, url, 'Alice');
  await setCard(alice, url, ids[0], 'qstmrk1');
  await setCard(alice, url, ids[1], 'xclam01');
  await setCard(alice, url, ids[2], 'veto');
  await pickCard(alice, 'five001');
  await expect(alice.locator('#cbox')).toHaveAttribute('data-text-size', 'none');
  const question = tableCard(alice, 'Bob').locator('.pc');
  await expect(question.locator('.ttl')).toHaveText('question');
  await expect(question.locator('.txt')).toHaveText('I have a question before I can estimate.');
  await expect(tableCard(alice, 'Alice').locator('.pc :is(.ttl, .txt)')).toHaveCount(0); // numbers stay without text

  // every description ends inside its card, on a whole line (line clamp), at any card size
  const inside = () => alice.locator('#cbox .pc.is-ctl').evaluateAll(cards => cards.every(card => {
    const txt = card.querySelector('.txt')!;
    const lines = parseInt(getComputedStyle(txt).webkitLineClamp, 10);
    const lineHeight = parseFloat(getComputedStyle(txt).lineHeight);
    const box = txt.getBoundingClientRect();
    return box.bottom <= card.getBoundingClientRect().bottom + 0.5 && box.height <= lines * lineHeight + 1;
  }));
  expect(await inside()).toBe(true);
  for (const viewport of [{ width: 820, height: 600 }, { width: 390, height: 700 }]) {
    await alice.setViewportSize(viewport);
    await expect.poll(inside).toBe(true);
  }
  // the emotions (one word per card) as well
  await setTeamDeck(alice, url, 'emotions', null, CONTROLS_ALL); // a new deck starts a new round
  await expect(alice.locator('#cbox')).toHaveAttribute('data-text-size', 'word');
  await setCard(alice, url, ids[0], 'qstmrk1');
  await setCard(alice, url, ids[1], 'xclam01');
  await setCard(alice, url, ids[2], 'veto');
  await pickCard(alice, 'sad0001');
  await expect(tableCard(alice, 'Dan').locator('.pc .txt')).toHaveText("I object. Let's not go ahead like this.");
  await expect.poll(inside).toBe(true);
});

test('J.U.D.G.E.: small values as inverted mini squares, control cards as drawings, Fibonacci as text (F8, 19)', async ({ browser }) => {
  const alice = await newPlayer(browser, { viewport: DESKTOP });
  const url = await createTeam(alice, 'Inverted Small');
  const [bob, carol] = await addPlayersViaApi(alice, url, ['Bob', 'Carol']);
  await setTeamDeck(alice, url, 'judge', null, ['qstmrk1', 'veto']);
  await joinAsPlayer(alice, url, 'Alice');
  await setCard(alice, url, bob, 'jdg6');
  await setCard(alice, url, carol, 'qstmrk1');
  await pickCard(alice, 'jdg3');

  const value = (key: string) => alice.locator(`#spread_bars [data-card="${key}"] .spread-value`);
  const square = value('jdg3').locator('.mini.sm-inv');
  await expect(square).toHaveText('3'); // the name for screen readers
  await expect(square.locator('use.inv-frame')).toHaveAttribute('href', /#s-frame-inv$/);
  await expect(square.locator('use.inv-value')).toHaveAttribute('href', /#s-3$/);
  await expect(value('jdg3').locator('.sm-text')).toHaveCount(0);
  // the square in the card colour, centred in the label's line like the mini symbols
  expect(await square.evaluate(el => getComputedStyle(el).color)).not.toBe(
    await value('jdg3').evaluate(el => getComputedStyle(el).color));
  const [sq, line] = await value('jdg3').evaluate(el => [el.querySelector('.sm-inv')!.getBoundingClientRect(), el.getBoundingClientRect()]
    .map(r => ({ top: r.top, bottom: r.bottom, width: r.width, height: r.height })));
  expect(Math.abs(sq.width - sq.height)).toBeLessThan(0.5);
  expect(sq.top).toBeGreaterThanOrEqual(line.top - 1);
  expect(sq.bottom).toBeLessThanOrEqual(line.bottom + 1);
  await expect(value('qstmrk1').locator('.mini.sm-draw')).toHaveCount(1); // control cards: drawings

  // range, tip, info line
  await expect(alice.locator('#spread_range .sm-inv')).toHaveCount(2);
  await expect(alice.locator('#round_tip .sm-inv').first()).toBeVisible();
  await deckCard(alice, 'jdg4').hover();
  await expect(alice.locator('#deck_info .deck-info-value .sm-inv')).toHaveText('');
  await expect(alice.locator('#deck_info .deck-info-value .sm-inv use.inv-value')).toHaveAttribute('href', /#s-4$/);

  // Fibonacci: the digits stay text
  await setTeamDeck(alice, url, 'fib-classic', null, ['qstmrk1']);
  await expect(value('five001').locator('.sm-text')).toHaveText('5');
  await expect(alice.locator('#spread_bars .sm-inv')).toHaveCount(0);
});

test('touch: the carousel hint shows the inverted square, left-aligned in a centred block (F8, 19, 21)', async ({ browser }) => {
  const alice = await newPlayer(browser, { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const url = await createTeam(alice, 'Inverted Carousel');
  await setTeamDeck(alice, url, 'judge', null, ['veto']);
  await joinAsPlayer(alice, url, 'Alice');
  await expect(deckCards(alice)).toHaveCount(8);
  await deckCard(alice, 'jdg4').evaluate(el => el.parentElement!.scrollIntoView({ inline: 'center' }));
  const line = alice.locator('#deck_pick');
  await expect(line.locator('b .sm-inv use.inv-value')).toHaveAttribute('href', /#s-4$/);
  await expect(line).toContainText('step out');
  // the description below starts where the first line starts
  const lefts = await line.evaluate(el => {
    const body = el.querySelector('.deck-pick-body')!;
    const first = body.firstChild!;
    const range = document.createRange();
    range.selectNodeContents(first);
    const info = body.querySelector('.deck-pick-info')!;
    return [body.getBoundingClientRect().left, info.getBoundingClientRect().left, range.getClientRects()[0].left];
  });
  expect(Math.abs(lefts[0] - lefts[1])).toBeLessThan(1);
  expect(lefts[2]).toBeGreaterThanOrEqual(lefts[0] - 1);
});

test('info line: a centred block, the text left-aligned, its second line under the first one\'s start (F8, 21)', async ({ browser }) => {
  const alice = await newPlayer(browser, { viewport: DESKTOP });
  const url = await createTeam(alice, 'Info Block');
  await setTeamDeck(alice, url, 'judge', null, ['veto']);
  await joinAsPlayer(alice, url, 'Alice');
  await deckCard(alice, 'jdg4').hover(); // "step out — Disagreements are so serious …": two lines
  const info = alice.locator('#deck_info');
  await expect(info.locator('.deck-info-text b')).toHaveText('step out');
  const m = await info.evaluate(el => {
    const text = el.querySelector('.deck-info-text')!;
    const range = document.createRange();
    range.selectNodeContents(text);
    const lines = Array.from(range.getClientRects()).filter(r => r.width > 0);
    const tops = [...new Set(lines.map(r => Math.round(r.top)))];
    const firstLeft = Math.min(...lines.filter(r => Math.round(r.top) === tops[0]).map(r => r.left));
    const lastLeft = Math.min(...lines.filter(r => Math.round(r.top) === tops[tops.length - 1]).map(r => r.left));
    const box = el.getBoundingClientRect();
    const tray = document.getElementById('down-container')!.getBoundingClientRect();
    const chip = el.querySelector('.deck-info-value')!.getBoundingClientRect();
    return { lines: tops.length, firstLeft, lastLeft, align: getComputedStyle(text).textAlign,
      centre: box.left + box.width / 2 - (tray.left + tray.width / 2), chipRight: chip.right, textLeft: text.getBoundingClientRect().left };
  });
  expect(m.lines).toBe(2);
  expect(m.align).toBe('left');
  expect(Math.abs(m.firstLeft - m.lastLeft)).toBeLessThan(1);
  expect(m.textLeft).toBeGreaterThan(m.chipRight); // the chip on the left, the text beside it
  expect(Math.abs(m.centre)).toBeLessThan(1.5);
});

test('the average pointer sits close below the spread labels, desktop and phone (F8, 23)', async ({ browser }) => {
  for (const viewport of [DESKTOP, { width: 390, height: 844 }]) {
    const alice = await newPlayer(browser, { viewport });
    const url = await createTeam(alice, 'Pointer Gap');
    const [bob] = await addPlayersViaApi(alice, url, ['Bob']);
    await setTeamDeck(alice, url, 'fib-classic', null, ['break01', 'qstmrk1']);
    await joinAsPlayer(alice, url, 'Alice');
    expect((await alice.request.post(`/api/update_show_avg.php?t=${teamParam(url)}&show_avg=1`)).ok()).toBeTruthy();
    await setCard(alice, url, bob, 'three01');
    await pickCard(alice, 'five001');
    const pointer = alice.locator('#spread_index');
    await expect(pointer).toHaveClass(/visible/);
    const gap = await alice.evaluate(() => {
      const p = document.getElementById('spread_index')!.getBoundingClientRect();
      // the lowest drawn part of any label (text glyphs or a mini symbol)
      const bottoms = Array.from(document.querySelectorAll('#spread_bars .spread-value > *')).map(el => el.getBoundingClientRect().bottom);
      return p.top - Math.max(...bottoms);
    });
    expect(gap).toBeGreaterThanOrEqual(0);
    expect(gap).toBeLessThanOrEqual(6);
    await alice.context().close();
  }
});
