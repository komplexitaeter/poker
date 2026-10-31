import { test, expect } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * B-98 / B-99 (rollout 3, S3): card_catalog.json is consistent with the symbol library (src/cards.svg), the colour
 * tokens (style/cards.css) and the whitelists of the client (script/cards.js). No browser needed.
 */

const ROOT = path.resolve(__dirname, '../../..');
const read = (file: string) => fs.readFileSync(path.join(ROOT, file), 'utf8');

type Card = {
  card_key: string; value: string; symbol: string; color: string; numeric_value: number | null;
  sort_order: number; heading?: string; description?: string; legacy_index?: number;
};
type Group = { id: string; name: string; style: string; cards: Card[]; variants: { id: string; cards: string[] }[] };

const catalog = JSON.parse(read('card_catalog.json')) as {
  styles: string[]; default_deck: string; default_controls: string[]; controls: Card[]; groups: Group[];
};
const spriteIds = new Set([...read('src/cards.svg').matchAll(/<symbol id="([^"]+)"/g)].map(m => m[1]));
const colorTokens = new Set([...read('style/cards.css').matchAll(/--c-([A-Za-z0-9]+)\s*:/g)].map(m => m[1]));

/* the string literals of a `const NAME = new Set([...])` in script/cards.js */
function clientSet(name: string): Set<string> {
  const m = new RegExp(`const ${name} = new Set\\(\\[([^\\]]*)\\]`).exec(read('script/cards.js'));
  expect(m, `${name} in script/cards.js`).not.toBeNull();
  return new Set([...(m as RegExpExecArray)[1].matchAll(/'([^']+)'/g)].map(x => x[1]));
}

const allCards: Card[] = [...catalog.controls, ...catalog.groups.flatMap(g => g.cards)];

test('every card has a unique short key, a known symbol and colour and valid texts (B-98, B-99)', () => {
  const symbols = clientSet('CARD_SYMBOLS');
  const colors = clientSet('CARD_COLORS');
  const keys = new Set<string>();
  expect(allCards.length).toBeGreaterThan(60);
  for (const card of allCards) {
    const where = `card ${card.card_key}`;
    expect(card.card_key, where).toMatch(/^[a-z0-9]{1,7}$/); // varchar(7), '-' reserved for custom cards
    expect(keys.has(card.card_key), `${where} is unique`).toBe(false);
    keys.add(card.card_key);
    expect(typeof card.value === 'string' && card.value !== '', where).toBe(true);
    expect(spriteIds.has(card.symbol), `${where}: symbol ${card.symbol} in src/cards.svg`).toBe(true);
    expect(symbols.has(card.symbol), `${where}: symbol ${card.symbol} in CARD_SYMBOLS`).toBe(true);
    expect(colorTokens.has(card.color), `${where}: colour ${card.color} in style/cards.css`).toBe(true);
    expect(colors.has(card.color), `${where}: colour ${card.color} in CARD_COLORS`).toBe(true);
    expect(card.numeric_value === null || typeof card.numeric_value === 'number', where).toBe(true);
    expect(Number.isInteger(card.sort_order), where).toBe(true);
    if (card.heading !== undefined) expect(card.heading.length, where).toBeLessThanOrEqual(16);
    if (card.description !== undefined) expect(card.description.length, where).toBeLessThanOrEqual(160);
  }
});

test('groups have a style, variants use their own cards, one symbol at most once per group (B-98)', () => {
  const styles = clientSet('CARD_STYLES');
  const variantIds = new Set<string>();
  for (const group of catalog.groups) {
    expect(catalog.styles).toContain(group.style);
    expect(styles.has(group.style), `${group.id}: style in CARD_STYLES`).toBe(true);
    const own = new Set(group.cards.map(c => c.card_key));
    const groupSymbols = group.cards.map(c => c.symbol);
    expect(new Set(groupSymbols).size, `${group.id}: symbols unique`).toBe(groupSymbols.length);
    expect(group.variants.length).toBeGreaterThan(0);
    for (const variant of group.variants) {
      variantIds.add(variant.id);
      expect(variant.cards.length).toBeGreaterThan(0);
      for (const key of variant.cards) expect(own.has(key), `${variant.id}: ${key} in ${group.id}`).toBe(true);
    }
  }
  expect(variantIds.has(catalog.default_deck)).toBe(true);
  const controls = new Set(catalog.controls.map(c => c.card_key));
  for (const key of catalog.default_controls) expect(controls.has(key)).toBe(true);
});

test('texts per group as decided (B-99, Andreas 2026-10-31)', () => {
  const group = (id: string) => catalog.groups.find(g => g.id === id) as Group;
  for (const id of ['fib', 'numbers', 'tshirt'])
    for (const card of group(id).cards) {
      expect(card.heading, `${id} ${card.card_key}`).toBeUndefined();
      expect(card.description, `${id} ${card.card_key}`).toBeUndefined();
    }
  for (const card of group('emotions').cards) {
    expect(card.heading).toBeUndefined();
    expect(card.description).toMatch(/^[a-z]+$/);
  }
  expect(group('traffic').cards.map(c => c.heading)).toEqual(['green light', 'yellow light', 'red light']);
  expect(group('stars').cards.map(c => c.heading)).toEqual(['no stars', '1 star', '2 stars', '3 stars', '4 stars', '5 stars']);
  expect(group('judge').cards.map(c => c.heading)).toEqual(
    ['step aside', 'full support', 'slight concerns', 'severe concerns', 'step out', 'need to talk', 'veto']);
  expect(group('delegation').cards.map(c => c.heading)).toEqual(
    ['Tell', 'Sell', 'Consult', 'Agree', 'Advise', 'Inquire', 'Delegate']);
  expect(catalog.controls.map(c => c.heading)).toEqual(['need a break', 'question', 'important', 'veto']);
  for (const id of ['traffic', 'judge', 'delegation'])
    for (const card of group(id).cards) expect(card.description, `${id} ${card.card_key}`).toBeTruthy();
});
