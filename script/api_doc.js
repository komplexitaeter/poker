/*
 * B-150: scroll-spy of the API doc page /api/v1/ (api/v1/lib_v1.php, v1_doc_page()). Marks the link of the section in
 * view in the table of contents (sidebar and phone list) with aria-current="location"; style.css highlights it.
 * The only script of the page (CSP script-src 'self', no inline script); without it the page works the same.
 */
(function () {
    'use strict';
    if (!('IntersectionObserver' in window)) return;

    const links = Array.from(document.querySelectorAll('.api-toc-list a[href^="#"]'));
    const sections = [];
    for (const a of links) {
        const el = document.getElementById(a.getAttribute('href').slice(1));
        if (el && !sections.includes(el)) sections.push(el);
    }
    const visible = new Set();

    // the current section: at the end of the page the last one (it may be too short to reach the top), otherwise the
    // last one (in page order) reaching into the upper quarter of the screen; none there: the last mark stays
    function mark() {
        const root = document.documentElement;
        const atEnd = window.innerHeight + window.scrollY >= root.scrollHeight - 2;
        const current = atEnd ? sections[sections.length - 1] : sections.filter(el => visible.has(el)).pop();
        if (!current) return;
        const href = '#' + current.id;
        for (const a of links) {
            if (a.getAttribute('href') === href) a.setAttribute('aria-current', 'location');
            else a.removeAttribute('aria-current');
        }
    }

    const observer = new IntersectionObserver(entries => {
        for (const e of entries) {
            if (e.isIntersecting) visible.add(e.target);
            else visible.delete(e.target);
        }
        mark();
    }, { rootMargin: '0px 0px -75% 0px' });
    for (const el of sections) observer.observe(el);
    // the end of the page changes no intersection when the last section is short
    window.addEventListener('scroll', () => {
        if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2) mark();
    }, { passive: true });
})();
