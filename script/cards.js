/* B-99 (R3, step F2): rendered cards. A card face is built at runtime from the card model (deck.js):
 * frame, a coloured bar on top, the symbol (from the sprite src/cards.svg, <use>) or the value as text,
 * the heading and the description. Colours come from the tokens in style/cards.css (--c-<name>,
 * --on-c-<name>), so light/dark follow the theme. Layout per level and style in style/style.css
 * ("Rendered cards").
 *
 * Levels:  'table'  a card on the table: every level the card has (symbol, heading, description)
 *          'deck'   a card in the tray / carousel: symbol (+ heading); the description goes to the info line
 *          'mini'   a small symbol (spread)
 * Styles per set (card.style): plain | badge | banner | inverted; control and status cards are always plain.
 *
 * Only createElement / textContent / setAttribute; symbol ids and colour tokens only from the whitelists
 * below (never free text in href, class or style). No innerHTML here. */

const CARDS_SPRITE = 'src/cards.svg?v=8'; // bump with the sprite (tools/cards/gen_symbols.py)
const SVG_NS = 'http://www.w3.org/2000/svg';

/* the symbols of the sprite (tools/cards/README.md) */
const CARD_SYMBOLS = new Set([
    's-0', 's-1', 's-2', 's-3', 's-4', 's-5', 's-6', 's-7', 's-8', 's-9', 's-10', 's-13', 's-20', 's-21', 's-34',
    's-40', 's-55', 's-60', 's-89', 's-100', 's-half', 's-inf',
    's-xxs', 's-xs', 's-s', 's-m', 's-l', 's-xl', 's-xxl',
    's-light-green', 's-light-yellow', 's-light-red',
    's-face-satisfied', 's-face-annoyed', 's-face-sad', 's-face-uninterested', 's-face-angry', 's-face-enthusiastic',
    's-stars-0', 's-stars-1', 's-stars-2', 's-stars-3', 's-stars-4', 's-stars-5',
    's-coffee', 's-question', 's-exclam', 's-hand', 's-check', 's-thought', 's-late', 's-mask', 's-frame-inv',
]);

/* B-99 (F6): how each symbol is shown small (spread labels, info line, carousel hint line, "you picked", tips).
 * Every symbol of CARD_SYMBOLS is in exactly one of the two sets (tests/e2e/specs/card-catalog.spec.ts):
 *   text     the value as mono text (digits, ½, ∞, 100, XXS–XXL)
 *   drawing  a mini symbol from the sprite (faces, traffic lights, stars, coffee, ?, !, hand, status symbols;
 *            F7, Andreas: ? and ! as drawings too)
 * Never a system emoji. A card without a library symbol (a custom text value) is always text. */
const CARD_SMALL_TEXT = new Set([
    's-0', 's-1', 's-2', 's-3', 's-4', 's-5', 's-6', 's-7', 's-8', 's-9', 's-10', 's-13', 's-20', 's-21', 's-34',
    's-40', 's-55', 's-60', 's-89', 's-100', 's-half', 's-inf',
    's-xxs', 's-xs', 's-s', 's-m', 's-l', 's-xl', 's-xxl',
]);
const CARD_SMALL_DRAWING = new Set([
    's-light-green', 's-light-yellow', 's-light-red',
    's-face-satisfied', 's-face-annoyed', 's-face-sad', 's-face-uninterested', 's-face-angry', 's-face-enthusiastic',
    's-stars-0', 's-stars-1', 's-stars-2', 's-stars-3', 's-stars-4', 's-stars-5',
    's-coffee', 's-question', 's-exclam', 's-hand', 's-check', 's-thought', 's-late', 's-mask', 's-frame-inv',
]);

/* the colour tokens of style/cards.css (catalogue and palette) */
const CARD_COLORS = new Set([
    'v0', 'vh', 'v1', 'v2', 'v3', 'v4', 'v5', 'v6', 'v7', 'v8', 'v9', 'v10', 'v13', 'v20', 'v21', 'v34', 'v40', 'v55',
    'v60', 'v89', 'v100', 'vinf', 'vbrk', 'vq', 'vx', 'vveto', 'vthink', 'vdone',
    'tXXS', 'tXS', 'tS', 'tM', 'tL', 'tXL', 'tXXL', 'agreen', 'ayellow', 'ared',
    'esatis', 'eannoy', 'esad', 'eunint', 'eangry', 'eenthu', 'star',
    'j0', 'j1', 'j2', 'j3', 'j4', 'j5', 'j6', 'g1', 'g2', 'g3', 'g4', 'g5', 'g6', 'g7',
    'red', 'orange', 'amber', 'yellow', 'lime', 'green', 'teal', 'cyan', 'blue', 'indigo', 'violet', 'pink', 'brown', 'grey',
]);

const CARD_STYLES = new Set(['plain', 'badge', 'banner', 'inverted']);

/* symbol and colour of a value text that is not a plain number */
const CARD_VALUE_LOOK = {
    '½': ['s-half', 'vh'], '∞': ['s-inf', 'vinf'],
    '☕': ['s-coffee', 'vbrk'], '?': ['s-question', 'vq'], '!': ['s-exclam', 'vx'], '✋': ['s-hand', 'vveto'],
    '🟢': ['s-light-green', 'agreen'], '🟡': ['s-light-yellow', 'ayellow'], '🔴': ['s-light-red', 'ared'],
    '🙂': ['s-face-satisfied', 'esatis'], '😒': ['s-face-annoyed', 'eannoy'], '😢': ['s-face-sad', 'esad'],
    '😐': ['s-face-uninterested', 'eunint'], '😡': ['s-face-angry', 'eangry'], '🤩': ['s-face-enthusiastic', 'eenthu'],
};

/* names for screen readers where the value is no word */
const CARD_VALUE_NAMES = { '½': 'one half', '∞': 'infinity' };

/* status cards on the table (no value shown yet) */
const STATUS_CARDS = {
    done001: { key: 'done001', status: true, symbol: 's-check', color: 'vdone', caption: 'ready', aria: 'card played' },
    prgrss1: { key: 'prgrss1', status: true, symbol: 's-thought', color: 'vthink', caption: 'thinking', aria: 'thinking, no card yet' },
    prgrss2: { key: 'prgrss2', status: true, symbol: 's-mask', color: 'vthink', caption: 'thinking', aria: 'thinking, no card yet' },
};

/* the symbol id (or null: the value is shown as text) and the colour token of a card */
function cardLook(card) {
    const text = String(card.text || '');
    let symbol = typeof card.symbol === 'string' ? card.symbol : null;
    let color = typeof card.color === 'string' ? card.color : null;
    const group = card.group || '';
    let guess = CARD_VALUE_LOOK[text];
    if (guess === undefined) {
        let m;
        if (/^\d{1,3}$/.test(text)) guess = ['s-' + text, 'v' + text];
        else if ((m = /^([0-5])★$/.exec(text)) !== null) guess = ['s-stars-' + m[1], 'star'];
        else if (/^(XXS|XS|S|M|L|XL|XXL)$/.test(text)) guess = ['s-' + text.toLowerCase(), 't' + text];
        else guess = [null, null];
    }
    if (symbol === null) symbol = guess[0];
    if (color === null) {
        if (group === 'judge' && /^[0-6]$/.test(text)) color = 'j' + text;
        else if (group === 'delegation' && /^[1-7]$/.test(text)) color = 'g' + text;
        else color = guess[1];
    }
    return {
        symbol: symbol !== null && CARD_SYMBOLS.has(symbol) ? symbol : null,
        color: color !== null && CARD_COLORS.has(color) ? color : null,
    };
}

/* B-99 (F6): 'drawing' (a mini symbol) or 'text' (the value as mono text) for small places.
 * F8 (Andreas): a card of a set in the style "inverted" (J.U.D.G.E.) with a symbol is 'inverted': a mini square
 * in the card colour with the white value in a black outline, as on the card. The rule follows the set's style,
 * not a list of cards; control cards (always plain) keep their kind. */
function cardSmallKind(card) {
    if (card.status !== true && !card.controlCard && card.style === 'inverted' && cardLook(card).symbol !== null) {
        return 'inverted';
    }
    const symbol = card.status === true ? card.symbol : cardLook(card).symbol;
    return symbol !== null && CARD_SMALL_DRAWING.has(symbol) ? 'drawing' : 'text';
}

/* the value of a card for small places: span.sm-text (mono text), span.mini.sm-draw with the symbol or
 * span.mini.sm-inv with the inverted square (F8; named: plus its
 * name for screen readers and as tooltip; not where its heading follows anyway). A text that is a system emoji
 * (a legacy card without a library symbol) never shows: its name instead. */
function cardSmall(card, named = true) {
    const kind = cardSmallKind(card);
    if (kind === 'drawing' || kind === 'inverted') {
        const face = cardFace(card, 'mini');
        face.classList.add(kind === 'inverted' ? 'sm-inv' : 'sm-draw');
        if (named) {
            face.appendChild(textElement('span', 'sr-only', cardName(card)));
            face.title = cardName(card);
        }
        return face;
    }
    const text = String(card.text || card.label || card.key);
    return textElement('span', 'sm-text', /\p{Extended_Pictographic}/u.test(text) ? cardName(card) : text);
}

/* the name of a card for screen readers: the value (a word for ½, ∞), else heading / description */
function cardName(card) {
    if (card.status) return card.aria;
    const text = String(card.text || '');
    if (CARD_VALUE_NAMES[text]) return CARD_VALUE_NAMES[text];
    if (/^[0-9A-Za-z.]+$/.test(text)) return text;
    return card.heading || card.info || card.description || text;
}

/* deck: "3, Consult"; table: "3, Consult. I will consult and then decide" */
function cardAriaLabel(card, withInfo) {
    const name = cardName(card);
    let label = name;
    if (card.heading && card.heading !== name) label += ', ' + card.heading;
    if (withInfo && card.info && card.info !== name) label += '. ' + card.info;
    return label;
}

function svgElement(tag) {
    return document.createElementNS(SVG_NS, tag);
}

function useSymbol(id) {
    const use = svgElement('use');
    use.setAttribute('href', CARDS_SPRITE + '#' + id);
    return use;
}

/* the symbol as an <svg> (decorative), or null without a known symbol */
function cardSymbolSvg(look, inverted) {
    if (look.symbol === null) return null;
    const svg = svgElement('svg');
    svg.setAttribute('class', 'mot');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    if (inverted) {
        // J.U.D.G.E.: the value in white with a black ink outline on the coloured square (tools/cards/README.md)
        svg.setAttribute('viewBox', '0 0 100 100');
        const frame = useSymbol('s-frame-inv');
        frame.setAttribute('class', 'inv-frame');
        const value = useSymbol(look.symbol);
        value.setAttribute('class', 'inv-value');
        value.setAttribute('x', '10');
        value.setAttribute('y', '.4');
        value.setAttribute('width', '80');
        value.setAttribute('height', '96');
        svg.append(frame, value);
    } else {
        svg.setAttribute('viewBox', '0 0 100 120');
        svg.appendChild(useSymbol(look.symbol));
    }
    return svg;
}

function textElement(tag, className, text) {
    const element = document.createElement(tag);
    element.className = className;
    element.textContent = text;
    return element;
}

/* the value colour as custom properties (--a value colour, --on text on it); token from the whitelist only */
function setCardColor(element, color) {
    if (color === null) return;
    element.style.setProperty('--a', 'var(--c-' + color + ')');
    element.style.setProperty('--on', 'var(--on-c-' + color + ')');
}

/* the heading: plain text, a pill (badge), on a band (banner) or in a dash-dot frame (inverted) */
function cardHeading(className, heading, style) {
    const element = document.createElement('span');
    element.className = className;
    const inner = textElement('span', 'hd-' + style, heading);
    if (style === 'inverted') {
        // the frame is drawn by CSS (dash-dot border image would not scale): an svg rect
        const frame = svgElement('svg');
        frame.setAttribute('class', 'hd-frame');
        frame.setAttribute('aria-hidden', 'true');
        frame.setAttribute('focusable', 'false');
        const rect = svgElement('rect');
        rect.setAttribute('width', '100%');
        rect.setAttribute('height', '100%');
        rect.setAttribute('rx', '5');
        frame.appendChild(rect);
        element.appendChild(frame);
    }
    element.appendChild(inner);
    return element;
}

/* B-99: the face of a card.
 *   card   the card model (deck.js) or a status card (STATUS_CARDS)
 *   level  'table' | 'deck' | 'mini'
 *   texts  true: heading and description; 'heading': the heading only (F7: control cards in decks without
 *          or with one-word texts, the description stays in the aria-label); false: the symbol only
 * F7 (Andreas): a card that shows exactly one text (only a heading, only a description, a status caption)
 * gets the class one-text: that text is set like a heading (mono, bold; style.css).
 * Returns the element: table div.pc (role img, aria-label), deck span.dkc, mini span.mini (both decorative:
 * the button / the column carries the name). */
function cardFace(card, level, texts = true) {
    const status = card.status === true;
    const look = status ? { symbol: card.symbol, color: card.color } : cardLook(card);
    const style = status || card.controlCard || !CARD_STYLES.has(card.style) ? 'plain' : card.style;
    const inverted = style === 'inverted' && look.symbol !== null;
    const tag = level === 'table' ? 'div' : 'span';
    const face = document.createElement(tag);
    face.className = level === 'table' ? 'pc' : level === 'deck' ? 'dkc' : 'mini';
    face.classList.add('sty-' + style);
    if (status) face.classList.add('is-status');
    if (card.controlCard) face.classList.add('is-ctl');
    setCardColor(face, look.color);

    const symbol = cardSymbolSvg(look, inverted);
    if (symbol !== null) face.appendChild(symbol);
    else if (!status) {
        const value = String(card.text || card.key);
        const tv = textElement('span', 'tv', value);
        if ([...value].length > 3) tv.classList.add('tv-long'); // up to 6 characters (custom values)
        face.appendChild(tv);
    }
    if (level === 'mini') return face;

    const heading = !status && texts && card.heading ? card.heading : '';
    const info = !status && texts === true && card.info ? card.info : '';
    if (status) {
        face.appendChild(textElement('span', 'stl', card.caption));
    } else if (level === 'deck') {
        if (heading) face.appendChild(cardHeading('dh', heading, style));
    } else {
        if (heading) face.appendChild(cardHeading('ttl', heading, style));
        if (info) face.appendChild(textElement('span', 'txt', info));
    }
    face.classList.toggle('has-head', heading !== '');
    face.classList.toggle('has-info', level === 'table' && info !== '');
    const shown = status ? 1 : (heading !== '' ? 1 : 0) + (level === 'table' && info !== '' ? 1 : 0);
    face.classList.toggle('one-text', shown === 1);

    if (level === 'table') {
        face.setAttribute('role', 'img');
        face.setAttribute('aria-label', status ? card.aria : cardAriaLabel(card, texts !== false));
        // no title tooltip (B-99 D5): it repeated the text shown on the card
    }
    return face;
}
