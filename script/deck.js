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
 *   text         the value as shown (R3, F2: "5", "½", "☕", "XL"; card_catalog.json value)
 *   heading      short heading or null (card_catalog.json, e.g. "need a break")
 *   info         long description or null (card_catalog.json; not the v1 description)
 *   controlCard  one of the control cards of card_catalog.json (☕ ? ! ✋): drawn plain, texts only in the info line
 *   group, style the set group (card_catalog.json) and its style (plain | badge | banner | inverted)
 *   symbol, color  symbol id / colour token from card_catalog.json (R3 S3); missing: derived from the value (cards.js)
 * A deck:  { rev, cards }  cards in deck order; rev changes whenever the deck changes.
 *
 * R3 F4: the server sends the deck (dao "deck": {id, group, cards, controls, rev}); the card data comes from
 * card_catalog.json (catalogV2Cards). The adapter from cards.json (v1) and cardset_flags stays as the fallback
 * when dao has no deck (card_catalog.json missing or broken on the server).
 * No DOM here. */

/* the card model of a cards.json (v1) entry; v2 = its entry in card_catalog.json ({card, group}) or undefined */
function cardFromLegacy(config, v2) {
    const entry = v2 ? v2.card : {};
    return {
        key: config.card_key,
        label: config.symbol || config.description,
        description: config.description,
        value: config.numeric_value != null ? config.numeric_value : null,
        infinite: config.card_key === 'infin01' || config.description === 'infinity',
        control: config.flow_control === true,
        controlCard: config.flow_control === true || (v2 !== undefined && v2.group === null),
        talk: config.talk === true,
        text: typeof entry.value === 'string' ? entry.value : (config.symbol || config.description),
        heading: typeof entry.heading === 'string' && entry.heading !== '' ? entry.heading : null,
        info: typeof entry.description === 'string' && entry.description !== '' ? entry.description : null,
        symbol: typeof entry.symbol === 'string' && entry.symbol !== '' ? entry.symbol : null,
        color: typeof entry.color === 'string' && entry.color !== '' ? entry.color : null,
        group: v2 && v2.group ? v2.group.id : null,
        style: v2 && v2.group ? v2.group.style : 'plain',
    };
}

/* card_catalog.json (v2) by card key: {card, group}; group null for the control cards. Empty for a missing file. */
function catalogV2Index(catalog) {
    const index = new Map();
    if (!catalog || typeof catalog !== 'object') return index;
    (Array.isArray(catalog.controls) ? catalog.controls : []).forEach(card => index.set(card.card_key, { card, group: null }));
    (Array.isArray(catalog.groups) ? catalog.groups : []).forEach(group => {
        (Array.isArray(group.cards) ? group.cards : []).forEach(card => {
            if (!index.has(card.card_key)) index.set(card.card_key, { card, group });
        });
    });
    return index;
}

/* all cards of cards.json (v1) in deck order (sort_order); each with its index in cardset_flags; texts, group
 * and style from card_catalog.json (catalogV2Index) */
function catalogFromLegacy(configs, v2Index = new Map()) {
    return configs
        .slice()
        .sort((a, b) => a.sort_order - b.sort_order)
        .map(config => ({ index: config.index, card: cardFromLegacy(config, v2Index.get(config.card_key)) }));
}

/* the deck of a team from the catalog (catalogFromLegacy) and its cardset_flags: one '1' or '0'
 * per card index; missing flags count as '0' */
function deckFromLegacy(catalog, flags) {
    const str = typeof flags === 'string' ? flags : '';
    const cards = catalog.filter(entry => str.charAt(entry.index) === '1').map(entry => entry.card);
    return { rev: cards.map(card => card.key).join(','), cards };
}

/* B-102: the system card of a player who joined while the cards were revealed (api/lib.php LATE_CARD_KEY).
 * It keeps the round revealed but is no vote: left out of the spread, range, average and tips. */
const LATE_CARD_KEY = 'late001';

function isLateCardKey(key) {
    return key === LATE_CARD_KEY;
}

/* status cards on the table: no value is shown (thinking, thinking anonymous, ready; B-102: joined in) */
function isStatusCardKey(key) {
    return key === 'done001' || isLateCardKey(key) || String(key).startsWith('prgrss');
}

/* R3 F4: values of a catalog card that are given (strings only); null when missing or empty */
function catalogText(value) {
    return typeof value === 'string' && value !== '' ? value : null;
}

/* B-79: the tip asks to talk instead of naming the sides (catalog flag "talk", else these groups) */
const TALK_GROUPS = new Set(['traffic', 'emotions']);

/* R3 F4: the card model of a card_catalog.json (v2) entry; group null for the control cards (☕ ? ! ✋).
 * Values in the catalog win (symbol, color, heading, description, style); what is missing is derived as before
 * (symbol and colour from the value in cards.js, style from the group). */
function cardFromCatalog(entry, group) {
    const text = catalogText(entry.value) || String(entry.card_key);
    const heading = catalogText(entry.heading);
    const info = catalogText(entry.description);
    const value = typeof entry.numeric_value === 'number' && isFinite(entry.numeric_value) ? entry.numeric_value : null;
    const style = catalogText(entry.style) || (group ? catalogText(group.style) : null) || 'plain';
    const talk = typeof entry.talk === 'boolean' ? entry.talk
        : group && typeof group.talk === 'boolean' ? group.talk : group !== null && TALK_GROUPS.has(group.id);
    return {
        key: entry.card_key,
        label: text,
        description: heading || info || text,
        value,
        infinite: entry.infinite === true || text === '∞',
        // neutral in the tips: ☕ ? ! (veto counts as a vote, as before)
        control: group === null && entry.card_key !== 'veto',
        controlCard: group === null,
        talk,
        text,
        heading,
        info,
        symbol: catalogText(entry.symbol),
        color: catalogText(entry.color),
        group: group ? group.id : null,
        style,
    };
}

/* R3 F4: all cards of card_catalog.json (v2) by key: the control cards and the cards of every group */
function catalogV2Cards(catalog) {
    const cards = new Map();
    if (!catalog || typeof catalog !== 'object') return cards;
    (Array.isArray(catalog.controls) ? catalog.controls : []).forEach(entry => {
        if (entry && typeof entry.card_key === 'string') cards.set(entry.card_key, cardFromCatalog(entry, null));
    });
    (Array.isArray(catalog.groups) ? catalog.groups : []).forEach(group => {
        (Array.isArray(group.cards) ? group.cards : []).forEach(entry => {
            if (entry && typeof entry.card_key === 'string' && !cards.has(entry.card_key)) {
                cards.set(entry.card_key, cardFromCatalog(entry, group));
            }
        });
    });
    return cards;
}

/* R3 F4: the deck from dao ({id, group, cards, controls, rev}): the set's cards, then the control cards. Keys the
 * catalog does not know are left out. null when there is no usable deck (then the adapter decides). */
function deckFromServer(deck, cardsByKey) {
    if (!deck || typeof deck !== 'object' || !Array.isArray(deck.cards)) return null;
    const keys = deck.cards.concat(Array.isArray(deck.controls) ? deck.controls : []);
    const cards = keys.map(key => cardsByKey.get(key)).filter(card => card !== undefined);
    if (cards.length === 0) return null;
    return { rev: 'd' + deck.rev + ':' + cards.map(card => card.key).join(','), cards, id: deck.id, group: deck.group };
}
