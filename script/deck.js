/* B-99 (R3, step F1): the deck model. The board logic (table, deck, carousel, keys, spread, tips)
 * works on cards by their key, not on the images that show them, so the way a card is drawn can
 * change (R3: rendered cards instead of PNGs) without touching that logic.
 *
 * A card:  { key, label, description, value, infinite, control, talk }
 *   key          card_key (also the id of the deck element and data-card in the DOM)
 *   label        short text for the spread, the range, the tips and "you picked" (symbol, else description)
 *   description  long text (alt text today)
 *   value        numeric value or null (average, lowest/highest)
 *   infinite     the infinity card: the top end of the range, not part of the average
 *   control      control card (coffee, ?, !): neutral in the tips
 *   talk         emotions / traffic lights: the tip asks to talk instead of naming the sides
 * A deck:  { rev, cards }  cards in deck order; rev changes whenever the deck changes.
 *
 * Today the cards come from cards.json (v1) and the team's cardset_flags (adapter below). Later
 * (R3, F4) the server sends the deck (dao "deck"); the adapter stays as the fallback.
 * No DOM here. */

/* the card model of a cards.json (v1) entry */
function cardFromLegacy(config) {
    return {
        key: config.card_key,
        label: config.symbol || config.description,
        description: config.description,
        value: config.numeric_value != null ? config.numeric_value : null,
        infinite: config.card_key === 'infin01' || config.description === 'infinity',
        control: config.flow_control === true,
        talk: config.talk === true,
    };
}

/* all cards of cards.json (v1) in deck order (sort_order); each with its index in cardset_flags */
function catalogFromLegacy(configs) {
    return configs
        .slice()
        .sort((a, b) => a.sort_order - b.sort_order)
        .map(config => ({ index: config.index, card: cardFromLegacy(config) }));
}

/* the deck of a team from the catalog (catalogFromLegacy) and its cardset_flags: one '1' or '0'
 * per card index; missing flags count as '0' */
function deckFromLegacy(catalog, flags) {
    const str = typeof flags === 'string' ? flags : '';
    const cards = catalog.filter(entry => str.charAt(entry.index) === '1').map(entry => entry.card);
    return { rev: cards.map(card => card.key).join(','), cards };
}

/* status cards on the table: no value is shown yet (thinking, thinking anonymous, ready) */
function isStatusCardKey(key) {
    return key === 'done001' || String(key).startsWith('prgrss');
}
