/* ==========================================================================
   script.js — everything the page does at runtime.

   Reads businessConfig (config.js) and never hardcodes business detail.
   Structure:
     1  helpers
     2  binding engine        — data-bind-* / data-show / data-hide / data-list
     3  SEO + structured data — title, canonical, Open Graph, JSON-LD
     4  content renderers     — services, FAQ, hours, footer, credentials
     5  chrome                — header, drawer, scrollspy, reveal
     6  booking               — the six-step flow
     7  business setup        — the local configuration panel
     8  assistant             — answers from the FAQ, no network calls
   ========================================================================== */
(() => {
  'use strict';

  const CFG = window.businessConfig;
  if (!CFG) { console.error('[app] config.js did not load.'); return; }

  /* ===================== 1. helpers ====================== */
  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const on = (el, ev, fn, opts) => el && el.addEventListener(ev, fn, opts);

  /** Resolve 'business.phone' or '$.telHref' against a config snapshot. */
  const read = (obj, path) =>
    String(path).split('.').reduce((acc, key) => (acc == null ? acc : acc[key]), obj);

  /** Build a nested patch object from a dotted path: ('a.b', 1) -> {a:{b:1}} */
  const patchOf = (path, value) => {
    const keys = String(path).split('.');
    const root = {};
    let node = root;
    keys.forEach((k, i) => {
      if (i === keys.length - 1) node[k] = value;
      else { node[k] = {}; node = node[k]; }
    });
    return root;
  };

  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  const el = (tag, attrs = {}, kids = []) => {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v === false || v == null) continue;
      if (k === 'class') node.className = v;
      else if (k === 'text') node.textContent = v;
      else if (k === 'html') node.innerHTML = v;
      else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v === true ? '' : v);
    }
    (Array.isArray(kids) ? kids : [kids]).forEach((k) => k && node.append(k));
    return node;
  };

  const icon = (id, cls) => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('aria-hidden', 'true');
    if (cls) svg.setAttribute('class', cls);
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', '#' + id);
    svg.append(use);
    return svg;
  };

  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const DAYS = [
    ['mon', 'Monday'], ['tue', 'Tuesday'], ['wed', 'Wednesday'], ['thu', 'Thursday'],
    ['fri', 'Friday'], ['sat', 'Saturday'], ['sun', 'Sunday'],
  ];

  let cfg = CFG.get();

  /* ===================== 2. binding engine ====================== */
  /* Every business string in index.html carries a data-bind-* attribute, so
     the markup stays free of business detail and one config change updates
     the whole page. */
  function bind(c) {
    $$('[data-bind-text]').forEach((n) => {
      const v = read(c, n.dataset.bindText);
      n.textContent = v == null ? '' : String(v);
    });

    $$('[data-bind-href]').forEach((n) => {
      const v = read(c, n.dataset.bindHref);
      if (v) { n.setAttribute('href', v); n.removeAttribute('aria-disabled'); }
      else { n.removeAttribute('href'); n.setAttribute('aria-disabled', 'true'); }
    });

    $$('[data-bind-src]').forEach((n) => {
      const v = read(c, n.dataset.bindSrc);
      if (v) n.setAttribute('src', v);
    });

    $$('[data-bind-alt]').forEach((n) => {
      const v = read(c, n.dataset.bindAlt);
      n.setAttribute('alt', v == null ? '' : String(v));
    });

    // Empty means hidden. Nothing is ever filled in with a stand-in value.
    $$('[data-show]').forEach((n) => { n.hidden = !truthy(read(c, n.dataset.show)); });
    $$('[data-hide]').forEach((n) => { n.hidden = truthy(read(c, n.dataset.hide)); });

    $$('[data-list]').forEach((n) => {
      const items = read(c, n.dataset.list);
      n.replaceChildren(...(Array.isArray(items) ? items : []).map((t) => el('li', { text: t })));
      n.hidden = !(Array.isArray(items) && items.length);
    });

    const steps = $('[data-steps]');
    if (steps) steps.replaceChildren(...((c.about.steps || []).map((s) =>
      el('li', {}, [el('span', { text: s.name }), el('p', { text: s.text })]))));

    const year = $('[data-year]');
    if (year) year.textContent = String(new Date().getFullYear());
  }

  const truthy = (v) => Array.isArray(v) ? v.length > 0 : !!(v && String(v).trim());

  /* ===================== 3. SEO + structured data ====================== */
  function seo(c) {
    const b = c.business;
    const title = c.$.seoTitle;
    const desc  = c.$.seoDescription;
    const canonical = c.$.canonical;

    document.title = title;
    document.documentElement.lang = (c.site.locale || 'en_US').split('_')[0];

    const map = {
      description: desc,
      ogSiteName: b.name,
      ogTitle: title,
      ogDescription: desc,
      ogLocale: c.site.locale,
      twitterTitle: title,
      twitterDescription: desc,
      themeColor: c.site.themeColor,
    };
    $$('[data-seo]').forEach((n) => {
      const key = n.dataset.seo;
      if (key === 'favicon') { if (c.branding.favicon) n.setAttribute('href', c.branding.favicon); return; }
      if (map[key] == null) return;
      n.setAttribute('content', map[key]);
    });

    // One canonical, written from the configured domain — or from wherever the
    // page is actually being served when no domain has been set. Never invented.
    if (canonical) {
      link('canonical', canonical);
      meta('og:url', canonical, 'property');
      // Only a raster image is advertised: social platforms do not render SVG,
      // and a share card that silently fails is worse than none at all.
      const share = (c.images.og && c.images.og.src) || '';
      const img = /\.svg($|\?)/i.test(share) ? '' : absolute(share, canonical);
      if (img) {
        meta('og:image', img, 'property');
        meta('twitter:image', img);
        if (c.images.og.alt) meta('og:image:alt', c.images.og.alt, 'property');
      } else {
        ['og:image', 'og:image:alt'].forEach((k) => { const n = $(`meta[property="${k}"]`); if (n) n.remove(); });
        const t = $('meta[name="twitter:image"]'); if (t) t.remove();
      }
    } else {
      const old = $('link[rel="canonical"]'); if (old) old.remove();
    }

    jsonLd(c, canonical);
  }

  function link(rel, href) {
    let n = $(`link[rel="${rel}"]`);
    if (!n) { n = el('link', { rel }); document.head.append(n); }
    n.setAttribute('href', href);
  }

  function meta(name, content, attr = 'name') {
    let n = $(`meta[${attr}="${name}"]`);
    if (!n) { n = el('meta', { [attr]: name }); document.head.append(n); }
    n.setAttribute('content', content);
  }

  function absolute(src, base) {
    if (!src || !base) return '';
    if (/^(https?:|data:)/.test(src)) return src;
    try { return new URL(src, base.endsWith('/') ? base : base + '/').href; } catch (_) { return ''; }
  }

  /* Structured data describes only what the business has actually entered.
     No ratings, no review counts, no awards are synthesised. */
  function jsonLd(c, canonical) {
    const b = c.business;
    const graph = [];

    const biz = {
      '@type': 'PestControlService',
      '@id': (canonical || '') + '#business',
      name: b.name,
      description: b.tagline,
      telephone: b.phone || undefined,
      email: b.email || undefined,
    };
    if (canonical) biz.url = canonical;
    const share = (c.images.og && c.images.og.src) || '';
    const img = /\.svg($|\?)/i.test(share) ? '' : absolute(share, canonical);
    if (img) biz.image = img;

    if (b.street || b.city || b.zip) {
      biz.address = {
        '@type': 'PostalAddress',
        streetAddress: b.street || undefined,
        addressLocality: b.city || undefined,
        addressRegion: b.state || undefined,
        postalCode: b.zip || undefined,
        addressCountry: b.country || undefined,
      };
    }
    if ((c.serviceAreas || []).length) {
      biz.areaServed = c.serviceAreas.map((a) => ({ '@type': 'City', name: a }));
    }

    const hours = DAYS
      .filter(([k]) => c.hours[k] && !/closed/i.test(c.hours[k]))
      .map(([k, label]) => {
        const [from, to] = String(c.hours[k]).split(/[–-]/).map((s) => s.trim());
        if (!from || !to) return null;
        return { '@type': 'OpeningHoursSpecification', dayOfWeek: label, opens: pad(from), closes: pad(to) };
      })
      .filter(Boolean);
    if (hours.length) biz.openingHoursSpecification = hours;

    if (c.credentials.foundedYear) biz.foundingDate = String(c.credentials.foundedYear);
    const social = Object.values(c.social || {}).filter(Boolean);
    if (social.length) biz.sameAs = social;

    if ((c.services || []).length) {
      biz.hasOfferCatalog = {
        '@type': 'OfferCatalog',
        name: 'Pest control services',
        itemListElement: c.services.map((s) => ({
          '@type': 'Offer',
          itemOffered: { '@type': 'Service', name: s.name, description: s.blurb },
        })),
      };
    }
    graph.push(biz);

    if ((c.faq || []).length) {
      graph.push({
        '@type': 'FAQPage',
        mainEntity: c.faq.map((f) => ({
          '@type': 'Question', name: f.q,
          acceptedAnswer: { '@type': 'Answer', text: f.a },
        })),
      });
    }

    let script = $('#ld-json');
    if (!script) { script = el('script', { type: 'application/ld+json', id: 'ld-json' }); document.head.append(script); }
    script.textContent = JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }, null, 0);
  }

  const pad = (t) => {
    const m = String(t).match(/^(\d{1,2})(?::(\d{2}))?/);
    return m ? `${String(m[1]).padStart(2, '0')}:${m[2] || '00'}` : t;
  };

  /* ===================== 4. content renderers ====================== */
  const svcList  = $('[data-svc-list]');
  const svcPanel = $('[data-svc-panel]');
  let activeSvc = null;

  function renderServices(c) {
    if (!svcList) return;
    const list = c.services || [];
    if (!list.some((s) => s.id === activeSvc)) activeSvc = list[0] ? list[0].id : null;

    svcList.replaceChildren(...list.map((s, i) => {
      const btn = el('button', {
        class: 'idx__btn', type: 'button',
        'aria-expanded': String(s.id === activeSvc),
        onclick: () => selectService(s.id),
      }, [
        el('span', { class: 'idx__n', text: String(i + 1).padStart(2, '0') }),
        el('span', { class: 'idx__name', text: s.name }),
        icon('i-arrow', 'idx__go'),
        el('span', { class: 'idx__blurb', text: s.blurb || '' }),
      ]);
      return el('li', { class: 'idx__row' + (s.id === activeSvc ? ' on' : ''), 'data-svc': s.id }, btn);
    }));

    paintPanel(c);
  }

  function paintPanel(c) {
    if (!svcPanel) return;
    const s = (c.services || []).find((x) => x.id === activeSvc);
    if (!s) { svcPanel.hidden = true; return; }
    svcPanel.hidden = false;
    const fig = $('.idx__fig img', svcPanel);
    if (fig) {
      const src = s.image || c.images.about.src;
      if (src && fig.getAttribute('src') !== src) fig.setAttribute('src', src);
      fig.alt = s.image ? (s.imageAlt || s.name) : (c.images.about.alt || '');
    }
    const name = $('[data-svc-name]', svcPanel);
    const detail = $('[data-svc-detail]', svcPanel);
    const book = $('[data-svc-book]', svcPanel);
    if (name) name.textContent = s.name;
    if (detail) detail.textContent = s.detail || s.blurb || '';
    if (book) {
      book.dataset.book = '';          // routes through the single booking handler
      book.dataset.bookService = s.id;
      book.replaceChildren(document.createTextNode('Book ' + s.name.toLowerCase() + ' '), icon('i-arrow'));
    }
  }

  function selectService(id) {
    activeSvc = id;
    $$('.idx__row', svcList).forEach((row) => {
      const on = row.dataset.svc === id;
      row.classList.toggle('on', on);
      const b = $('.idx__btn', row); if (b) b.setAttribute('aria-expanded', String(on));
    });
    paintPanel(cfg);
    if (window.matchMedia('(max-width: 900px)').matches && svcPanel) {
      svcPanel.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'nearest' });
    }
  }

  /* --- FAQ accordion ------------------------------------------------- */
  function renderFaq(c) {
    const host = $('[data-faq]');
    if (!host) return;
    host.replaceChildren(...(c.faq || []).map((f, i) => {
      const id = 'qa-' + i;
      const answer = el('div', { class: 'qa__a', id, role: 'region' }, el('p', { text: f.a }));
      const q = el('button', {
        class: 'qa__q', type: 'button', 'aria-expanded': 'false', 'aria-controls': id,
      }, [el('span', { text: f.q }), el('span', { class: 'qa__i' }, icon('i-plus'))]);
      const item = el('div', { class: 'qa' }, [q, answer]);
      on(q, 'click', () => {
        const open = item.classList.toggle('on');
        q.setAttribute('aria-expanded', String(open));
        if (open) $$('.qa.on', host).forEach((other) => {
          if (other === item) return;
          other.classList.remove('on');
          const ob = $('.qa__q', other); if (ob) ob.setAttribute('aria-expanded', 'false');
        });
      });
      return item;
    }));
  }

  /* --- footer -------------------------------------------------------- */
  function renderFooter(c) {
    const hours = $('[data-hours]');
    if (hours) hours.replaceChildren(...DAYS.map(([k, label]) =>
      el('li', {}, [el('b', { text: label.slice(0, 3) }), el('span', { text: c.hours[k] || '—' })])));

    const svcLinks = $('[data-ft-services]');
    if (svcLinks) svcLinks.replaceChildren(...(c.services || []).map((s) =>
      el('li', {}, el('a', {
        href: '#booking', text: s.name,
        onclick: (e) => { e.preventDefault(); openBooking(s.id); },
      }))));

    const social = $('[data-social]');
    if (social) {
      const entries = Object.entries(c.social || {}).filter(([, url]) => url);
      social.replaceChildren(...entries.map(([k, url]) =>
        el('li', {}, el('a', {
          href: url, rel: 'noopener', target: '_blank',
          'aria-label': k.charAt(0).toUpperCase() + k.slice(1),
        }, socialGlyph(k)))));
      social.hidden = entries.length === 0;
    }

    // Credentials appear only when the business has actually entered them.
    const legal = $('[data-credentials]');
    if (legal) {
      const cr = c.credentials || {};
      const lines = [];
      if (cr.licenceNumber) lines.push(`Licence ${cr.licenceNumber}${cr.licenceAuthority ? ' · ' + cr.licenceAuthority : ''}`);
      if (cr.insured) lines.push('Liability insured');
      if (cr.yearsInBusiness) lines.push(`${cr.yearsInBusiness} years in business`);
      else if (cr.foundedYear) lines.push(`Established ${cr.foundedYear}`);
      (cr.affiliations || []).filter(Boolean).forEach((a) => lines.push(a));
      legal.replaceChildren(...lines.map((t) => el('span', { text: t })));
    }
  }

  const SOCIAL_PATHS = {
    facebook: 'M13.4 21v-8h2.7l.4-3.1h-3.1V7.9c0-.9.25-1.5 1.55-1.5H16.6V3.6A22 22 0 0 0 14.2 3.5c-2.4 0-4 1.45-4 4.12V9.9H7.5V13h2.7v8z',
    instagram:'M12 2.2c3.2 0 3.6 0 4.85.07 1.17.05 1.8.25 2.23.41.56.22.96.48 1.38.9.42.42.68.82.9 1.38.16.42.36 1.06.41 2.23.06 1.25.07 1.63.07 4.81s0 3.56-.07 4.81c-.05 1.17-.25 1.8-.41 2.23-.22.56-.48.96-.9 1.38-.42.42-.82.68-1.38.9-.42.16-1.06.36-2.23.41-1.25.06-1.63.07-4.85.07s-3.6 0-4.85-.07c-1.17-.05-1.8-.25-2.23-.41a3.8 3.8 0 0 1-1.38-.9 3.8 3.8 0 0 1-.9-1.38c-.16-.42-.36-1.06-.41-2.23C2.21 15.56 2.2 15.18 2.2 12s0-3.56.07-4.81c.05-1.17.25-1.8.41-2.23.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.42-.16 1.06-.36 2.23-.41C8.44 2.21 8.82 2.2 12 2.2Zm0 1.98c-3.13 0-3.5.01-4.73.07-1.14.05-1.76.24-2.17.4-.55.21-.94.47-1.35.88-.41.41-.67.8-.88 1.35-.16.41-.35 1.03-.4 2.17-.06 1.23-.07 1.6-.07 4.73s.01 3.5.07 4.73c.05 1.14.24 1.76.4 2.17.21.55.47.94.88 1.35.41.41.8.67 1.35.88.41.16 1.03.35 2.17.4 1.23.06 1.6.07 4.73.07s3.5-.01 4.73-.07c1.14-.05 1.76-.24 2.17-.4.55-.21.94-.47 1.35-.88.41-.41.67-.8.88-1.35.16-.41.35-1.03.4-2.17.06-1.23.07-1.6.07-4.73s-.01-3.5-.07-4.73c-.05-1.14-.24-1.76-.4-2.17a3.6 3.6 0 0 0-.88-1.35 3.6 3.6 0 0 0-1.35-.88c-.41-.16-1.03-.35-2.17-.4-1.23-.06-1.6-.07-4.73-.07Zm0 3.36a4.46 4.46 0 1 1 0 8.92 4.46 4.46 0 0 1 0-8.92Zm0 7.35a2.89 2.89 0 1 0 0-5.78 2.89 2.89 0 0 0 0 5.78Zm5.68-7.55a1.04 1.04 0 1 1-2.08 0 1.04 1.04 0 0 1 2.08 0Z',
    x:        'M17.2 3h3.3l-7.2 8.2L21.8 21h-6.6l-5.2-6.3L4 21H.7l7.7-8.8L.4 3H7l4.7 5.8Zm-1.2 16h1.8L6.9 4.8H5z',
    linkedin: 'M6.9 21H3.5V9.1h3.4V21ZM5.2 7.6A2 2 0 1 1 5.2 3.5a2 2 0 0 1 0 4.1ZM21 21h-3.4v-5.8c0-1.38-.03-3.16-1.93-3.16-1.93 0-2.22 1.5-2.22 3.06V21H10V9.1h3.3v1.63h.05c.46-.87 1.58-1.79 3.26-1.79 3.49 0 4.13 2.3 4.13 5.28V21Z',
  };

  function socialGlyph(key) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', SOCIAL_PATHS[key] || SOCIAL_PATHS.facebook);
    svg.append(p);
    return svg;
  }

  /* --- testimonials: real ones or nothing ----------------------------- */
  function renderTestimonials(c) {
    const sec = $('[data-says]');
    const list = $('[data-says-list]');
    if (!sec || !list) return;
    const items = Array.isArray(c.testimonials) ? c.testimonials.filter((t) => t && t.quote) : [];
    sec.hidden = items.length === 0;
    if (!items.length) { list.replaceChildren(); return; }
    list.replaceChildren(...items.map((t) => {
      const kids = [];
      if (Number(t.rating) > 0) {
        kids.push(el('div', { class: 'say__stars', 'aria-label': `${t.rating} out of 5` },
          Array.from({ length: Math.round(Number(t.rating)) }, () => icon('i-star'))));
      }
      kids.push(el('p', { class: 'say__q', text: '“' + t.quote + '”' }));
      kids.push(el('p', { class: 'say__who' }, [
        el('b', { text: t.name || '' }),
        el('span', { text: [t.location, t.source].filter(Boolean).join(' · ') }),
      ]));
      return el('article', { class: 'say' }, kids);
    }));
  }

  /* ===================== 5. chrome ====================== */
  function chrome() {
    const hdr = $('[data-hdr]');
    const onScroll = () => hdr && hdr.classList.toggle('stuck', window.scrollY > 12);
    onScroll();
    on(window, 'scroll', onScroll, { passive: true });

    /* drawer */
    const drawer = $('#drawer');
    const burger = $('[data-menu]');
    const openMenu = (open) => {
      if (!drawer || !burger) return;
      if (open) { drawer.hidden = false; requestAnimationFrame(() => drawer.classList.add('on')); }
      else { drawer.classList.remove('on'); setTimeout(() => { drawer.hidden = true; }, 340); }
      burger.setAttribute('aria-expanded', String(open));
      document.body.classList.toggle('lock', open);
      if (open) { const f = $('.drawer__x', drawer); if (f) f.focus(); } else burger.focus();
    };
    on(burger, 'click', () => openMenu(burger.getAttribute('aria-expanded') !== 'true'));
    $$('[data-menu-close]').forEach((b) => on(b, 'click', () => openMenu(false)));
    $$('.drawer__nav a').forEach((a) => on(a, 'click', () => openMenu(false)));
    on(document, 'keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (drawer && !drawer.hidden) openMenu(false);
    });

    /* scrollspy */
    const links = $$('.nav a[href^="#"]');
    const targets = links.map((a) => $(a.getAttribute('href'))).filter(Boolean);
    if (targets.length && 'IntersectionObserver' in window) {
      const spy = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          links.forEach((a) => a.classList.toggle('on', a.getAttribute('href') === '#' + entry.target.id));
        });
      }, { rootMargin: '-45% 0px -50% 0px' });
      targets.forEach((t) => spy.observe(t));
    }

    /* reveal — added from script so the markup stays clean */
    if ('IntersectionObserver' in window && !reduceMotion()) {
      const groups = [
        ['.hero__type > *', true], ['.sec__head > *', true], ['.idx__list', false],
        ['.idx__panel', false], ['.apr__fig', false], ['.apr__body > *', true],
        ['.com__l > *', true], ['.com__fig', false], ['.bk__top > *', true],
        ['.faq__head > *', true], ['.qa', true], ['.say', true], ['.cta > *', true],
      ];
      const seen = new Set();
      groups.forEach(([sel, stagger]) => $$(sel).forEach((n, i) => {
        if (seen.has(n)) return;
        seen.add(n);
        n.classList.add('rev');
        if (stagger && i < 4) n.classList.add('rev-d' + Math.min(i, 3));
      }));
      const io = new IntersectionObserver((entries) => {
        entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
      }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
      seen.forEach((n) => io.observe(n));
    }

    /* The assistant launcher steps aside while someone is mid-booking,
       rather than floating over the controls. */
    const fab = $('.ai-fab');
    const bookForm = $('[data-bk-form]');
    if (fab && bookForm && 'IntersectionObserver' in window) {
      // Only while the form actually fills the middle of the screen, so the
      // launcher is back the moment the visitor scrolls on.
      new IntersectionObserver(([e]) => {
        const panel = $('[data-ai]');
        if (panel && !panel.hidden) return;
        fab.hidden = e.isIntersecting;
      }, { rootMargin: '-30% 0px -30% 0px' }).observe(bookForm);
    }

    /* any booking CTA anywhere opens the same flow */
    on(document, 'click', (e) => {
      const trigger = e.target.closest('[data-book]');
      if (!trigger) return;
      e.preventDefault();
      openBooking(trigger.dataset.bookService || null);
    });
  }

  /* ===================== 6. booking ====================== */
  const bk = {
    node: $('[data-bk]'),
    form: $('[data-bk-form]'),
    rail: $('[data-bk-rail]'),
    step: 1,
    max: 6,
    busy: false,
    date: null,        // Date at local midnight
    month: null,       // first of the displayed month
    slot: null,
    data: {},
  };

  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const fmtDate = (d) => d ? d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }) : '';
  const midnight = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  const addDays = (d, n) => { const x = midnight(d); x.setDate(x.getDate() + n); return x; };
  const sameDay = (a, b) => a && b && a.toDateString() === b.toDateString();

  function openBooking(serviceId) {
    const c = cfg;
    if (c.booking.provider === 'url' && c.booking.externalUrl) {
      window.open(c.booking.externalUrl, '_blank', 'noopener');
      return;
    }
    if (serviceId) {
      const input = $(`[data-bk-services] input[value="${CSS.escape(serviceId)}"]`);
      if (input) { input.checked = true; markPicked(input); }
    }
    if (bk.step === 7) resetBooking(serviceId);
    else if (serviceId && bk.step === 1) goStep(2);
    const sec = $('#booking');
    if (sec) sec.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'start' });
    setTimeout(() => {
      const focusable = $(`[data-step="${bk.step}"] input, [data-step="${bk.step}"] button, [data-step="${bk.step}"] textarea`);
      if (focusable) focusable.focus({ preventScroll: true });
    }, reduceMotion() ? 0 : 480);
  }

  function markPicked(input) {
    const group = input.closest('.pick');
    if (!group) return;
    $$('.opt', group).forEach((o) => o.classList.toggle('on', $('input', o) === input));
  }

  function renderBookingServices(c) {
    const host = $('[data-bk-services]');
    if (!host) return;
    const prev = $('input:checked', host);
    const keep = prev ? prev.value : null;
    host.replaceChildren(...(c.services || []).map((s) => {
      const input = el('input', { type: 'radio', name: 'service', value: s.id });
      if (s.id === keep) input.checked = true;
      const label = el('label', { class: 'opt' + (s.id === keep ? ' on' : '') }, [
        input,
        el('span', {}, [document.createTextNode(s.name), el('small', { text: s.blurb || '' })]),
      ]);
      on(input, 'change', () => { markPicked(input); hideErr('service'); });
      return label;
    }));
  }

  function renderSlots(c) {
    const host = $('[data-bk-slots]');
    if (!host) return;
    if (!bk.date) {
      host.replaceChildren(el('p', { class: 'slots__none', text: 'Choose a date first.' }));
      return;
    }
    const open = c.booking.slots.filter((s) => slotOpen(bk.date, s.id));
    if (!open.length) {
      bk.slot = null;
      host.replaceChildren(el('p', { class: 'slots__none', text: 'Nothing left on that day — try another.' }));
      return;
    }
    if (bk.slot && !open.some((s) => s.id === bk.slot)) bk.slot = null;
    host.replaceChildren(...open.map((s) => {
      const btn = el('button', {
        class: 'slot' + (bk.slot === s.id ? ' on' : ''), type: 'button',
        role: 'radio', 'aria-checked': String(bk.slot === s.id),
      }, el('span', { text: s.label }));
      on(btn, 'click', () => { bk.slot = s.id; hideErr('when'); renderSlots(cfg); });
      return btn;
    }));
  }

  /* Deterministic pseudo-availability so the demo behaves consistently
     instead of looking random. A real deployment replaces this with the
     availability its booking endpoint returns. */
  function slotOpen(date, slotId) {
    const seed = date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate();
    let h = seed;
    for (const ch of slotId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return h % 7 !== 0;
  }

  function dayDisabled(c, d) {
    const first = addDays(new Date(), Math.max(0, c.booking.leadTimeDays || 0));
    const last = addDays(new Date(), c.booking.horizonDays || 60);
    if (d < first || d > last) return true;
    return (c.booking.closedWeekdays || []).includes(d.getDay());
  }

  function renderCalendar(c) {
    const grid = $('[data-cal-grid]');
    const label = $('[data-cal-month]');
    if (!grid) return;
    if (!bk.month) bk.month = new Date(midnight(new Date()).setDate(1));
    const y = bk.month.getFullYear(), m = bk.month.getMonth();
    if (label) label.textContent = `${MONTHS[m]} ${y}`;

    const firstDow = (new Date(y, m, 1).getDay() + 6) % 7;  // Monday-first
    const days = new Date(y, m + 1, 0).getDate();
    const today = midnight(new Date());
    const cells = [];
    for (let i = 0; i < firstDow; i++) cells.push(el('span', { class: 'day void', 'aria-hidden': 'true' }));
    for (let d = 1; d <= days; d++) {
      const date = new Date(y, m, d);
      const off = dayDisabled(c, date);
      const btn = el('button', {
        class: 'day' + (sameDay(date, today) ? ' today' : '') + (sameDay(date, bk.date) ? ' on' : ''),
        type: 'button', text: String(d), disabled: off || undefined,
        'aria-pressed': String(sameDay(date, bk.date)),
        'aria-label': date.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }),
      });
      if (!off) on(btn, 'click', () => { bk.date = date; hideErr('when'); renderCalendar(cfg); renderSlots(cfg); });
      cells.push(btn);
    }
    grid.replaceChildren(...cells);

    const prev = $('[data-cal-prev]'), next = $('[data-cal-next]');
    const floor = new Date(midnight(new Date()).setDate(1));
    const ceil = addDays(new Date(), c.booking.horizonDays || 60);
    if (prev) prev.disabled = new Date(y, m, 1) <= floor;
    if (next) next.disabled = new Date(y, m + 1, 1) > ceil;
  }

  const showErr = (key, msg) => {
    const n = $(`[data-err="${key}"]`);
    if (!n) return;
    if (msg) n.textContent = msg;
    n.hidden = false;
    const field = n.closest('.f'); if (field) field.classList.add('bad');
  };
  const hideErr = (key) => {
    const n = $(`[data-err="${key}"]`);
    if (!n) return;
    n.hidden = true;
    const field = n.closest('.f'); if (field) field.classList.remove('bad');
  };

  function validate(step) {
    const f = bk.form;
    if (!f) return true;
    if (step === 1) {
      const v = $('[data-bk-services] input:checked');
      if (!v) { showErr('service'); return false; }
      hideErr('service'); return true;
    }
    if (step === 2) {
      const v = $('input[name="property"]:checked', f);
      if (!v) { showErr('property'); return false; }
      hideErr('property'); return true;
    }
    if (step === 3) {
      let ok = true;
      const addr = f.elements.address, zip = f.elements.zip;
      if (!addr.value.trim() || addr.value.trim().length < 4) { showErr('address'); ok = false; } else hideErr('address');
      if (!/^\d{5}$/.test(zip.value.trim())) { showErr('zip'); ok = false; } else hideErr('zip');
      return ok;
    }
    if (step === 4) {
      if (!bk.date || !bk.slot) { showErr('when'); return false; }
      hideErr('when'); return true;
    }
    if (step === 5) {
      let ok = true;
      const { name, phone, email, consent } = f.elements;
      if (name.value.trim().length < 2) { showErr('name'); ok = false; } else hideErr('name');
      if (String(phone.value).replace(/\D/g, '').length < 10) { showErr('phone'); ok = false; } else hideErr('phone');
      if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email.value.trim())) { showErr('email'); ok = false; } else hideErr('email');
      if (!consent.checked) { showErr('consent'); ok = false; } else hideErr('consent');
      return ok;
    }
    return true;
  }

  function collect() {
    const f = bk.form;
    const service = cfg.services.find((s) => s.id === ($('[data-bk-services] input:checked') || {}).value);
    const slot = cfg.booking.slots.find((s) => s.id === bk.slot);
    const prop = $('input[name="property"]:checked', f);
    return {
      serviceId: service ? service.id : '',
      service: service ? service.name : '',
      property: prop ? prop.value : '',
      address: f.elements.address.value.trim(),
      zip: f.elements.zip.value.trim(),
      date: bk.date,
      dateISO: bk.date ? bk.date.toISOString().slice(0, 10) : '',
      dateLabel: fmtDate(bk.date),
      slotId: bk.slot || '',
      slot: slot ? slot.label : '',
      name: f.elements.name.value.trim(),
      phone: f.elements.phone.value.trim(),
      email: f.elements.email.value.trim(),
      notes: f.elements.notes.value.trim(),
    };
  }

  function renderRecap() {
    const host = $('[data-bk-recap]');
    if (!host) return;
    const d = collect();
    const rows = [
      ['Service', d.service, 1],
      ['Property', d.property, 2],
      ['Address', [d.address, d.zip].filter(Boolean).join(', '), 3],
      ['When', [d.dateLabel, d.slot].filter(Boolean).join(' · '), 4],
      ['Name', d.name, 5],
      ['Phone', d.phone, 5],
      ['Email', d.email, 5],
    ];
    if (d.notes) rows.push(['Notes', d.notes, 5]);
    host.replaceChildren(...rows.map(([k, v, step]) => {
      const edit = el('button', { class: 'edit', type: 'button', text: 'Change' });
      on(edit, 'click', () => goStep(step));
      return el('div', {}, [el('dt', { text: k }), el('dd', {}, [document.createTextNode(v || '—'), edit])]);
    }));
  }

  function railPaint() {
    if (!bk.rail) return;
    $$('li', bk.rail).forEach((li) => {
      const n = Number(li.dataset.rail);
      li.classList.toggle('on', n === bk.step);
      li.classList.toggle('done', n < bk.step);
      li.setAttribute('aria-current', n === bk.step ? 'step' : 'false');
    });
    bk.rail.hidden = bk.step > bk.max;
  }

  function goStep(n) {
    bk.step = n;
    $$('[data-step]', bk.form).forEach((fs) => {
      const active = Number(fs.dataset.step) === n;
      fs.hidden = !active;
      fs.classList.toggle('is-on', active);
    });
    railPaint();

    const back = $('[data-bk-back]'), next = $('[data-bk-next]'), submit = $('[data-bk-submit]');
    const nav = $('.bk__nav');
    if (nav) nav.hidden = n === 7;
    if (back) back.hidden = n === 1 || n === 7;
    if (next) next.hidden = n >= 6;
    if (submit) submit.hidden = n !== 6;

    if (n === 4) { renderCalendar(cfg); renderSlots(cfg); }
    if (n === 6) renderRecap();

    const heading = $(`[data-step="${n}"] .bk__q`);
    if (heading) heading.setAttribute('tabindex', '-1');
  }

  function bookingRef(d) {
    const src = (d.zip || '') + (d.dateISO || '') + (d.slotId || '') + (d.email || '');
    let h = 0x811c9dc5;
    for (const ch of src) { h ^= ch.charCodeAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
    const letters = (cfg.business.shortName || cfg.business.name || 'BK').replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase() || 'BKG';
    return `${letters}-${(d.dateISO || '').replace(/-/g, '').slice(2)}-${h.toString(36).toUpperCase().slice(0, 4)}`;
  }

  /* The confirmation email is built from the same config as the page, so the
     business name, phone and address in it always match the site. */
  function buildEmail(c, d, ref) {
    const b = c.business;
    const lines = [
      `${b.name} — booking confirmed`,
      '',
      `Hi ${d.name},`,
      '',
      `Your ${d.service.toLowerCase()} appointment is booked.`,
      '',
      `Reference   ${ref}`,
      `Service     ${d.service}`,
      `Property    ${d.property}`,
      `When        ${d.dateLabel}, ${d.slot}`,
      `Address     ${[d.address, d.zip].filter(Boolean).join(', ')}`,
      d.notes ? `Notes       ${d.notes}` : '',
      '',
      'We will text you before the technician sets off. To change or cancel,',
      `call ${b.phone}${b.email ? ' or reply to this email' : ''}.`,
      '',
      b.name,
      c.$.addressLine,
      [b.phone, b.email].filter(Boolean).join(' · '),
    ].filter((l) => l !== '');
    return { subject: `${b.name} — booking ${ref}`, text: lines.join('\n') };
  }

  async function submitBooking(e) {
    e.preventDefault();
    if (bk.busy || !validate(5)) return;
    const c = cfg;
    const d = collect();
    const alert = $('[data-bk-alert]');
    const submit = $('[data-bk-submit]');
    const label = $('[data-bk-submit-label]');

    bk.busy = true;
    if (submit) { submit.disabled = true; submit.classList.add('busy'); }
    if (label) label.textContent = 'Confirming…';
    if (alert) alert.hidden = true;

    const ref = bookingRef(d);
    const email = buildEmail(c, d, ref);
    const payload = {
      reference: ref, business: c.business.name, submittedAt: new Date().toISOString(),
      service: d.service, serviceId: d.serviceId, property: d.property,
      address: d.address, zip: d.zip, date: d.dateISO, slot: d.slot, slotId: d.slotId,
      name: d.name, phone: d.phone, email: d.email, notes: d.notes,
    };

    let ok = true;
    // Nothing leaves the browser unless an endpoint has been configured.
    if (c.booking.provider === 'webhook' && c.booking.endpoint) {
      try {
        const res = await fetch(c.booking.endpoint, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
        });
        ok = res.ok;
        if (!ok && alert) { alert.textContent = 'We could not reach the booking system. Call us and we will sort it out.'; alert.hidden = false; }
      } catch (err) {
        ok = false;
        if (alert) { alert.textContent = 'No connection. Check your network, or call us and we will book it for you.'; alert.hidden = false; }
      }
    } else {
      await new Promise((r) => setTimeout(r, 620));
    }

    bk.busy = false;
    if (submit) { submit.disabled = false; submit.classList.remove('busy'); }
    if (label) label.textContent = 'Confirm appointment';
    if (!ok) return;

    showDone(c, d, ref, email);
  }

  function showDone(c, d, ref, email) {
    const receipt = $('[data-bk-receipt]');
    if (receipt) {
      const rows = [
        ['Service', d.service], ['Date', d.dateLabel], ['Time', d.slot],
        ['Address', [d.address, d.zip].filter(Boolean).join(', ')], ['Reference', ref],
      ];
      receipt.replaceChildren(...rows.map(([k, v]) =>
        el('div', {}, [el('dt', { text: k }), el('dd', { text: v || '—' })])));
    }

    const who = $('[data-done="email"]');
    if (who) who.textContent = d.email;

    // Say exactly what happened. No claim that an email was sent when no
    // booking endpoint is connected.
    const sub = $('.done__sub');
    const connected = c.booking.provider === 'webhook' && !!c.booking.endpoint;
    if (sub) {
      sub.replaceChildren(
        ...(connected
          ? [document.createTextNode('A confirmation is on its way to '), el('b', { text: d.email }),
             document.createTextNode('. We will text you before the technician sets off.')]
          : [document.createTextNode('Your request is saved in this browser. No email has been sent — connect a booking endpoint in Business Setup to deliver confirmations to '),
             el('b', { text: d.email }), document.createTextNode(' automatically.')])
      );
    }

    const acts = $('.done__act');
    if (acts && !$('[data-bk-mail]', acts)) {
      const mail = el('button', { class: 'btn btn--ghost', type: 'button', 'data-bk-mail': '', text: 'Open confirmation email' });
      on(mail, 'click', () => {
        const to = encodeURIComponent(d.email);
        window.location.href = `mailto:${to}?subject=${encodeURIComponent(email.subject)}&body=${encodeURIComponent(email.text)}`;
      });
      acts.append(mail);
    }

    try { sessionStorage.setItem('lastBooking', JSON.stringify({ ref, ...d, date: d.dateISO })); } catch (_) {}

    goStep(7);
    const h = $('.done__h');
    if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
    const sec = $('#booking');
    if (sec) sec.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'start' });
  }

  function resetBooking(serviceId) {
    if (bk.form) bk.form.reset();
    $$('.opt.on').forEach((o) => o.classList.remove('on'));
    $$('.err').forEach((n) => { n.hidden = true; });
    $$('.f.bad').forEach((n) => n.classList.remove('bad'));
    bk.date = null; bk.slot = null; bk.month = null;
    const mail = $('[data-bk-mail]'); if (mail) mail.remove();
    renderBookingServices(cfg);
    if (serviceId) {
      const input = $(`[data-bk-services] input[value="${CSS.escape(serviceId)}"]`);
      if (input) { input.checked = true; markPicked(input); }
    }
    goStep(1);
  }

  function initBooking() {
    if (!bk.form) return;
    on($('[data-bk-next]'), 'click', () => { if (validate(bk.step)) goStep(Math.min(bk.step + 1, 6)); });
    on($('[data-bk-back]'), 'click', () => goStep(Math.max(bk.step - 1, 1)));
    on(bk.form, 'submit', submitBooking);
    on($('[data-bk-reset]'), 'click', () => resetBooking(null));
    on($('[data-cal-prev]'), 'click', () => { bk.month = new Date(bk.month.getFullYear(), bk.month.getMonth() - 1, 1); renderCalendar(cfg); });
    on($('[data-cal-next]'), 'click', () => { bk.month = new Date(bk.month.getFullYear(), bk.month.getMonth() + 1, 1); renderCalendar(cfg); });

    $$('input[name="property"]', bk.form).forEach((input) =>
      on(input, 'change', () => { markPicked(input); hideErr('property'); }));
    ['address', 'zip', 'name', 'phone', 'email'].forEach((key) =>
      on(bk.form.elements[key], 'input', () => hideErr(key)));
    on(bk.form.elements.consent, 'change', () => hideErr('consent'));

    // "Are we in your area?" — answered from the configured list, not invented.
    const area = $('[data-bk-area]');
    const checkArea = () => {
      if (!area) return;
      const zip = bk.form.elements.zip.value.trim();
      if (zip.length < 5) { area.textContent = ''; return; }
      area.replaceChildren(document.createTextNode('We cover '), el('b', { text: cfg.$.areasLine }),
        document.createTextNode('. Not on the list? Book anyway and we will tell you straight away.'));
    };
    on(bk.form.elements.zip, 'input', checkArea);

    goStep(1);
  }

  /* ===================== 7. business setup ====================== */
  /* A small local admin. It writes to localStorage through businessConfig
     and nowhere else — no network call is made from this panel. */
  const SETUP_TABS = [
    { id: 'business', label: 'Business' },
    { id: 'hours',    label: 'Hours' },
    { id: 'services', label: 'Services' },
    { id: 'content',  label: 'Content' },
    { id: 'brand',    label: 'Brand' },
    { id: 'booking',  label: 'Booking' },
  ];

  const setup = {
    node: $('[data-setup]'),
    body: $('[data-setup-body]'),
    tabs: $('[data-setup-tabs]'),
    state: $('[data-setup-state]'),
    tab: 'business',
    lastFocus: null,
  };

  const note = (t) => el('p', { class: 'setup__note', text: t });

  function field(c, spec) {
    const value = read(c, spec.path);
    const dflt = read(CFG.defaults(), spec.path);
    const id = 'set-' + spec.path.replace(/\./g, '-');
    const changed = JSON.stringify(value) !== JSON.stringify(dflt);

    let input;
    if (spec.type === 'check') {
      input = el('input', { type: 'checkbox', id });
      input.checked = !!value;
      on(input, 'change', () => save(spec.path, input.checked));
      const row = el('label', { class: 'fld fld--row', for: id }, [input, el('span', { text: spec.label })]);
      if (spec.hint) return el('div', {}, [row, el('small', { class: 'setup__note', text: spec.hint })]);
      return row;
    }

    if (spec.type === 'select') {
      input = el('select', { id });
      spec.options.forEach(([v, l]) => {
        const o = el('option', { value: v, text: l });
        if (String(value) === v) o.selected = true;
        input.append(o);
      });
      on(input, 'change', () => save(spec.path, input.value));
    } else if (spec.type === 'textarea' || spec.type === 'lines') {
      input = el('textarea', { id, rows: spec.rows || 4 });
      input.value = spec.type === 'lines' ? (Array.isArray(value) ? value : []).join('\n') : (value || '');
      on(input, 'input', debounce(() => {
        save(spec.path, spec.type === 'lines'
          ? input.value.split('\n').map((s) => s.trim()).filter(Boolean)
          : input.value);
      }, 380));
    } else {
      input = el('input', { type: spec.type || 'text', id, placeholder: spec.placeholder || '' });
      input.value = value == null ? '' : String(value);
      if (spec.type === 'number') { if (spec.min != null) input.min = spec.min; if (spec.max != null) input.max = spec.max; }
      on(input, 'input', debounce(() => {
        save(spec.path, spec.type === 'number' ? Number(input.value || 0) : input.value);
      }, 380));
    }

    const kids = [el('span', { text: spec.label }), input];
    if (spec.hint) kids.splice(1, 0, el('small', { text: spec.hint }));
    return el('label', { class: 'fld' + (changed ? ' fld--changed' : ''), for: id }, kids);
  }

  function imageField(c, key, label) {
    const path = `images.${key}.src`;
    const src = read(c, path) || '';
    const meta = read(c, `images.${key}`) || {};
    const thumb = el('img', { class: 'setup__thumb', alt: '', src: src || '', loading: 'lazy' });
    const file = el('input', { type: 'file', accept: 'image/*', hidden: true });
    const pick = el('button', { class: 'btn btn--ghost btn--sm', type: 'button', text: 'Upload' });
    const clear = el('button', { class: 'btn btn--ghost btn--sm', type: 'button', text: 'Clear' });

    on(pick, 'click', () => file.click());
    on(file, 'change', () => {
      const f = file.files && file.files[0];
      if (!f) return;
      if (f.size > 900 * 1024) { flash('That image is over 900 KB — link to it by URL instead.', 'warn'); return; }
      const reader = new FileReader();
      reader.onload = () => { thumb.src = String(reader.result); save(path, String(reader.result)); };
      reader.readAsDataURL(f);
    });
    on(clear, 'click', () => { const d = read(CFG.defaults(), path) || ''; thumb.src = d; save(path, d); });

    const url = el('input', { type: 'text', value: src, placeholder: 'assets/img/your-photo.jpg' });
    on(url, 'input', debounce(() => { thumb.src = url.value; save(path, url.value); }, 400));

    const alt = el('input', { type: 'text', value: meta.alt || '', placeholder: 'Describe the photo for screen readers' });
    on(alt, 'input', debounce(() => save(`images.${key}.alt`, alt.value), 400));

    return el('div', { class: 'setup__card' }, [
      el('header', {}, [el('b', { text: label }), el('span', { class: 'setup__note', text: meta.note || '' })]),
      thumb,
      el('label', { class: 'fld' }, [el('span', { text: 'Path or URL' }), url]),
      el('label', { class: 'fld' }, [el('span', { text: 'Alt text' }), alt]),
      el('div', { class: 'setup__acts' }, [pick, clear, file]),
    ]);
  }

  /* Repeatable lists — services, FAQ, arrival windows. */
  function repeater(c, opts) {
    const items = (read(c, opts.path) || []).slice();
    const write = (next) => save(opts.path, next);

    const cards = items.map((item, i) => {
      const kids = [el('header', {}, [
        el('b', { text: `${opts.singular} ${String(i + 1).padStart(2, '0')}` }),
        el('span', { class: 'setup__acts' }, [
          el('button', { class: 'btn btn--ghost btn--sm', type: 'button', text: '↑', 'aria-label': 'Move up',
            onclick: () => { if (i === 0) return; const n = items.slice(); [n[i - 1], n[i]] = [n[i], n[i - 1]]; write(n); redrawSetup(); } }),
          el('button', { class: 'btn btn--ghost btn--sm', type: 'button', text: '↓', 'aria-label': 'Move down',
            onclick: () => { if (i === items.length - 1) return; const n = items.slice(); [n[i + 1], n[i]] = [n[i], n[i + 1]]; write(n); redrawSetup(); } }),
          el('button', { class: 'btn btn--ghost btn--sm setup__reset', type: 'button', text: 'Remove',
            onclick: () => { const n = items.slice(); n.splice(i, 1); write(n); redrawSetup(); } }),
        ]),
      ])];

      opts.fields.forEach((f) => {
        const input = f.type === 'textarea'
          ? el('textarea', { rows: f.rows || 2 })
          : el('input', { type: 'text', placeholder: f.placeholder || '' });
        input.value = item[f.key] == null ? '' : String(item[f.key]);
        on(input, 'input', debounce(() => {
          const n = items.slice();
          n[i] = { ...n[i], [f.key]: input.value };
          if (opts.slug && f.key === opts.slug.from && !item.idLocked) n[i][opts.slug.to] = slugify(input.value) || n[i][opts.slug.to];
          write(n);
        }, 400));
        kids.push(el('label', { class: 'fld' }, [el('span', { text: f.label }), input]));
      });

      return el('div', { class: 'setup__card' }, kids);
    });

    const add = el('button', { class: 'btn btn--ghost btn--sm', type: 'button', text: `Add ${opts.singular.toLowerCase()}`,
      onclick: () => { write(items.concat([{ ...opts.blank }])); redrawSetup(); } });

    return el('div', { class: 'setup__grp' }, [
      el('h3', { text: opts.title }),
      opts.note ? note(opts.note) : null,
      ...cards,
      add,
    ].filter(Boolean));
  }

  const slugify = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 24);

  function group(title, kids, hint) {
    return el('div', { class: 'setup__grp' }, [el('h3', { text: title }), hint ? note(hint) : null, ...kids].filter(Boolean));
  }

  function buildTab(c, tab) {
    const F = (spec) => field(c, spec);

    if (tab === 'business') return [
      group('Identity', [
        F({ path: 'business.name', label: 'Business name' }),
        el('div', { class: 'fld--2' }, [
          F({ path: 'business.shortName', label: 'Short name', hint: 'Used where space is tight' }),
          F({ path: 'branding.logoText', label: 'Wordmark' }),
        ]),
        F({ path: 'business.tagline', label: 'Tagline', type: 'textarea', rows: 2,
            hint: 'One plain sentence. It is also the meta description.' }),
      ]),
      group('Contact', [
        el('div', { class: 'fld--2' }, [
          F({ path: 'business.phone', label: 'Phone', type: 'tel' }),
          F({ path: 'business.email', label: 'Email', type: 'email' }),
        ]),
        F({ path: 'business.emergencyAvailable', label: 'We answer an out-of-hours line', type: 'check' }),
        F({ path: 'business.emergencyPhone', label: 'Emergency phone', type: 'tel' }),
      ], 'Phone numbers become tel: links and emails become mailto: links automatically.'),
      group('Address', [
        F({ path: 'business.street', label: 'Street' }),
        el('div', { class: 'fld--3' }, [
          F({ path: 'business.city', label: 'City' }),
          F({ path: 'business.state', label: 'State' }),
          F({ path: 'business.zip', label: 'ZIP' }),
        ]),
        F({ path: 'business.country', label: 'Country code', placeholder: 'US' }),
      ]),
      group('Service areas', [
        F({ path: 'serviceAreas', label: 'One area per line', type: 'lines', rows: 6 }),
      ]),
    ];

    if (tab === 'hours') return [
      group('Opening hours', DAYS.map(([k, label]) =>
        F({ path: `hours.${k}`, label, placeholder: '7:00 – 19:00 or Closed' })),
        'Written as “7:00 – 19:00”. Type “Closed” for a day you do not open.'),
      group('Note', [F({ path: 'hours.note', label: 'Shown under the hours', type: 'textarea', rows: 2 })]),
    ];

    if (tab === 'services') return [
      repeater(c, {
        path: 'services', title: 'Services', singular: 'Service',
        note: 'These drive the services list, the footer links and the first booking step.',
        blank: { id: 'new-service', name: 'New service', blurb: '', detail: '' },
        slug: { from: 'name', to: 'id' },
        fields: [
          { key: 'name', label: 'Name' },
          { key: 'blurb', label: 'One line', type: 'textarea', rows: 2 },
          { key: 'detail', label: 'Longer description', type: 'textarea', rows: 3 },
          { key: 'image', label: 'Photo (optional)', placeholder: 'assets/img/rodents.jpg' },
        ],
      }),
    ];

    if (tab === 'content') return [
      group('Headlines', [
        el('div', { class: 'fld--2' }, [
          F({ path: 'copy.heroLine1', label: 'Hero, first line' }),
          F({ path: 'copy.heroLine2', label: 'Hero, second line', hint: 'Set in italic' }),
        ]),
        F({ path: 'copy.heroKicker', label: 'Above the headline' }),
        F({ path: 'copy.servicesHeading', label: 'Services heading' }),
        F({ path: 'copy.faqHeading', label: 'Answers heading' }),
        F({ path: 'copy.ctaHeading', label: 'Closing heading' }),
      ]),
      group('For businesses', [
        F({ path: 'copy.commercialHeading', label: 'Heading' }),
        F({ path: 'copy.commercialBody', label: 'Body', type: 'textarea', rows: 3 }),
        F({ path: 'copy.commercialCta', label: 'Button' }),
      ]),
      group('Section labels', [
        el('div', { class: 'fld--2' }, [
          F({ path: 'copy.servicesMark', label: '01' }),
          F({ path: 'copy.approachMark', label: '02' }),
        ]),
        el('div', { class: 'fld--2' }, [
          F({ path: 'copy.commercialMark', label: '03' }),
          F({ path: 'copy.bookingMark', label: '04' }),
        ]),
        el('div', { class: 'fld--2' }, [
          F({ path: 'copy.faqMark', label: '05' }),
          F({ path: 'copy.saysMark', label: '06' }),
        ]),
        F({ path: 'copy.ctaAreasLabel', label: 'Before the service areas' }),
      ]),
      group('Buttons', [
        F({ path: 'cta.primary', label: 'Primary call to action' }),
        el('div', { class: 'fld--2' }, [
          F({ path: 'cta.nav', label: 'Header button' }),
          F({ path: 'cta.secondary', label: 'Secondary label' }),
        ]),
      ]),
      group('How we work', [
        F({ path: 'about.heading', label: 'Heading' }),
        F({ path: 'about.body', label: 'Body', type: 'textarea', rows: 5 }),
      ]),
      repeater(c, {
        path: 'about.steps', title: 'The steps', singular: 'Step',
        blank: { name: '', text: '' },
        fields: [
          { key: 'name', label: 'Name' },
          { key: 'text', label: 'What happens', type: 'textarea', rows: 2 },
        ],
      }),
      group('Promises', [
        F({ path: 'trust', label: 'One per line', type: 'lines', rows: 5 }),
      ], 'Only things you actually do. No numbers, no percentages, no awards.'),
      group('Credentials', [
        el('div', { class: 'fld--2' }, [
          F({ path: 'credentials.licenceNumber', label: 'Licence number', placeholder: 'Leave blank if none',
              hint: 'Shown beside the hero kicker and in the footer once entered.' }),
          F({ path: 'credentials.licenceAuthority', label: 'Issued by' }),
        ]),
        el('div', { class: 'fld--2' }, [
          F({ path: 'credentials.yearsInBusiness', label: 'Years in business' }),
          F({ path: 'credentials.foundedYear', label: 'Founded' }),
        ]),
        F({ path: 'credentials.insured', label: 'We carry liability insurance', type: 'check' }),
        F({ path: 'credentials.affiliations', label: 'Memberships, one per line', type: 'lines', rows: 3 }),
      ], 'Anything left blank is not shown anywhere. Nothing here is ever filled in for you.'),
      repeater(c, {
        path: 'faq', title: 'Questions', singular: 'Question',
        blank: { q: '', a: '' },
        fields: [
          { key: 'q', label: 'Question' },
          { key: 'a', label: 'Answer', type: 'textarea', rows: 3 },
        ],
      }),
      repeater(c, {
        path: 'testimonials', title: 'Reviews', singular: 'Review',
        note: 'Real reviews only, with the customer’s permission. Leave this empty and the section does not appear.',
        blank: { quote: '', name: '', location: '', source: '', rating: '' },
        fields: [
          { key: 'quote', label: 'What they said', type: 'textarea', rows: 3 },
          { key: 'name', label: 'Name' },
          { key: 'location', label: 'Area' },
          { key: 'source', label: 'Where it was left', placeholder: 'Google, Yelp…' },
          { key: 'rating', label: 'Stars out of 5', placeholder: 'Leave blank to hide' },
        ],
      }),
    ];

    if (tab === 'brand') return [
      group('Wordmark', [
        el('div', { class: 'fld--2' }, [
          F({ path: 'branding.logoText', label: 'First word' }),
          F({ path: 'branding.logoTextAccent', label: 'Second word' }),
        ]),
        F({ path: 'branding.logoImage', label: 'Logo image URL', hint: 'Replaces the wordmark when set' }),
        F({ path: 'branding.favicon', label: 'Favicon URL or data URI' }),
        F({ path: 'site.themeColor', label: 'Browser theme colour', placeholder: '#0B3B44' }),
      ]),
      group('Photography', [
        imageField(c, 'hero', 'Hero'),
        imageField(c, 'about', 'Services panel'),
        imageField(c, 'process', 'How we work'),
        imageField(c, 'commercial', 'Commercial'),
        imageField(c, 'og', 'Social share card'),
      ], 'Swap the demo artwork for your own photographs. Upload keeps the image in this browser; a path or URL is better for a live site.'),
    ];

    if (tab === 'booking') return [
      group('How bookings are handled', [
        F({ path: 'booking.provider', label: 'Mode', type: 'select', options: [
          ['local', 'Built-in flow — stays in this browser'],
          ['webhook', 'Send to my endpoint'],
          ['url', 'Send visitors to another booking page'],
        ] }),
        F({ path: 'booking.endpoint', label: 'Endpoint URL', type: 'url', placeholder: 'https://…', hint: 'Bookings are POSTed here as JSON. Nothing is sent anywhere until this is set.' }),
        F({ path: 'booking.externalUrl', label: 'External booking page', type: 'url', placeholder: 'https://calendly.com/…' }),
      ]),
      group('Availability', [
        el('div', { class: 'fld--2' }, [
          F({ path: 'booking.leadTimeDays', label: 'Earliest booking (days out)', type: 'number', min: 0, max: 30 }),
          F({ path: 'booking.horizonDays', label: 'Latest booking (days out)', type: 'number', min: 7, max: 365 }),
        ]),
      ]),
      repeater(c, {
        path: 'booking.slots', title: 'Arrival windows', singular: 'Window',
        blank: { id: 'new', label: '' },
        slug: { from: 'label', to: 'id' },
        fields: [{ key: 'label', label: 'Shown to the customer', placeholder: '8:00 – 10:00 am' }],
      }),
      group('Website', [
        F({ path: 'site.domain', label: 'Production domain', type: 'url', placeholder: 'https://www.yourbusiness.com',
            hint: 'Sets the canonical URL, Open Graph URL and structured data. Left blank, the site uses whatever address it is served from — no domain is invented.' }),
        F({ path: 'site.locale', label: 'Locale', placeholder: 'en_US' }),
      ]),
    ];

    return [];
  }

  function redrawSetup() {
    if (!setup.body) return;
    const c = CFG.get();
    setup.body.replaceChildren(...buildTab(c, setup.tab));
    setup.body.scrollTop = 0;
  }

  function drawTabs() {
    if (!setup.tabs) return;
    setup.tabs.replaceChildren(...SETUP_TABS.map((t) =>
      el('button', {
        class: 'setup__tab', type: 'button', role: 'tab', text: t.label,
        'aria-selected': String(t.id === setup.tab),
        onclick: () => { setup.tab = t.id; drawTabs(); redrawSetup(); },
      })));
  }

  let flashTimer;
  function flash(msg, tone) {
    if (!setup.state) return;
    setup.state.replaceChildren(...(tone === 'warn' ? [] : [icon('i-check')]), document.createTextNode(' ' + msg));
    setup.state.dataset.tone = tone || 'ok';
    clearTimeout(flashTimer);
    flashTimer = setTimeout(idleState, 3200);
  }

  function idleState() {
    if (!setup.state) return;
    const kb = Math.round(CFG.storageUsed() / 102.4) / 10;
    setup.state.dataset.tone = 'ok';
    setup.state.replaceChildren(document.createTextNode(
      CFG.isCustomised() ? `Saved in this browser · ${kb} KB` : 'Using the default settings'));
  }

  function save(path, value) {
    const res = CFG.set(patchOf(path, value));
    if (res && res.ok === false) flash(res.error, 'warn');
    else flash('Changes saved locally', 'ok');
  }

  function openSetup(open) {
    if (!setup.node) return;
    if (open) {
      setup.lastFocus = document.activeElement;
      drawTabs(); redrawSetup(); idleState();
      setup.node.hidden = false;
      document.body.classList.add('lock');
      const first = $('.setup__tab', setup.node); if (first) first.focus();
    } else {
      setup.node.hidden = true;
      document.body.classList.remove('lock');
      if (setup.lastFocus) setup.lastFocus.focus();
    }
  }

  function initSetup() {
    if (!setup.node) return;
    $$('[data-setup-open]').forEach((b) => on(b, 'click', () => openSetup(true)));
    $$('[data-setup-close]').forEach((b) => on(b, 'click', () => openSetup(false)));
    on(document, 'keydown', (e) => { if (e.key === 'Escape' && !setup.node.hidden) openSetup(false); });

    on($('[data-setup-export]'), 'click', () => {
      const blob = new Blob([CFG.exportJSON()], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = el('a', { href: url, download: 'business-settings.json' });
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      flash('Settings downloaded', 'ok');
    });

    const file = $('[data-setup-file]');
    on($('[data-setup-import]'), 'click', () => file && file.click());
    on(file, 'change', () => {
      const f = file.files && file.files[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = () => {
        const res = CFG.importJSON(String(reader.result));
        if (res.ok === false) flash(res.error, 'warn');
        else { drawTabs(); redrawSetup(); flash('Settings imported', 'ok'); }
        file.value = '';
      };
      reader.readAsText(f);
    });

    on($('[data-setup-reset]'), 'click', () => {
      if (!window.confirm('Reset every setting back to the defaults? Anything you have changed in this browser will be lost.')) return;
      CFG.reset();
      redrawSetup();
      flash('Reset to defaults', 'ok');
    });
  }

  /* ===================== 8. assistant ====================== */
  /* Answers come from the FAQ and the business details in config — there is
     no model call and nothing typed here leaves the browser. */
  const ai = {
    node: $('[data-ai]'),
    log: $('[data-ai-log]'),
    form: $('[data-ai-form]'),
    input: $('#ai-in'),
    quick: $('[data-ai-quick]'),
    typing: $('[data-ai-typing]'),
    speak: false,
    started: false,
  };

  function say(text, who = 'bot', links = []) {
    if (!ai.log) return;
    const msg = el('div', { class: 'msg msg--' + (who === 'me' ? 'me' : 'bot') });
    text.split('\n').forEach((line, i) => {
      if (i) msg.append(el('br'));
      msg.append(document.createTextNode(line));
    });
    links.forEach((l) => {
      msg.append(document.createTextNode(' '));
      msg.append(el('a', { href: l.href, text: l.text, ...(l.action ? { 'data-ai-act': l.action } : {}) }));
    });
    ai.log.append(msg);
    ai.log.scrollTop = ai.log.scrollHeight;
    if (who === 'bot' && ai.speak) speak(text);
  }

  function speak(text) {
    if (!('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text.replace(/\s+/g, ' ').slice(0, 320));
      u.rate = 1.02; u.pitch = 1;
      window.speechSynthesis.speak(u);
    } catch (_) {}
  }

  function quickReplies(items) {
    if (!ai.quick) return;
    ai.quick.replaceChildren(...items.map((q) =>
      el('button', { type: 'button', text: q.label, onclick: () => { ai.quick.replaceChildren(); q.run(); } })));
  }

  const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const STOP = new Set(['the','a','an','is','are','do','does','i','you','we','my','to','for','of','and','it','in','on','can','with','what','how','when','will']);

  function bestFaq(c, q) {
    const words = norm(q).split(' ').filter((w) => w.length > 2 && !STOP.has(w));
    if (!words.length) return null;
    let best = null, bestScore = 0;
    (c.faq || []).forEach((f) => {
      const hay = norm(f.q + ' ' + f.a);
      let score = 0;
      words.forEach((w) => { if (hay.includes(w)) score += w.length > 5 ? 2 : 1; });
      if (score > bestScore) { bestScore = score; best = f; }
    });
    return bestScore >= 2 ? best : null;
  }

  function answer(c, q) {
    const n = norm(q);
    const svc = (c.services || []).find((s) => {
      const key = norm(s.name).split(' ')[0];
      return key.length > 3 && n.includes(key.replace(/s$/, ''));
    });

    // An explicit booking verb — not just the word "inspection", which turns
    // up in plenty of questions that are not a request to book.
    if (/\b(book|booking|schedule|arrange|come out|send someone|make an appointment)\b/.test(n)) {
      return { text: svc
        ? `I can start that now — ${svc.name.toLowerCase()}, free inspection first.`
        : 'I can start a booking now. It takes about a minute and the inspection is free.',
        quick: [
          { label: svc ? `Book ${svc.name.toLowerCase()}` : 'Start booking', run: () => { closeAi(); openBooking(svc ? svc.id : null); } },
          { label: 'Call instead', run: () => { if (c.$.telHref) window.location.href = c.$.telHref; } },
        ] };
    }

    // The business's own answers come before anything generated here.
    const faqHit = bestFaq(c, q);
    if (faqHit) {
      return { text: faqHit.a, quick: svc
        ? [{ label: `Book ${svc.name.toLowerCase()}`, run: () => { closeAi(); openBooking(svc.id); } }]
        : [{ label: 'Book an inspection', run: () => { closeAi(); openBooking(null); } }] };
    }

    if (svc) {
      return { text: `${s2(svc.detail || svc.blurb)}`,
        quick: [{ label: `Book ${svc.name.toLowerCase()}`, run: () => { closeAi(); openBooking(svc.id); } }] };
    }

    if (/\b(hour|open|close|today|tonight|weekend|sunday|saturday)\b/.test(n)) {
      const line = DAYS.map(([k, l]) => `${l.slice(0, 3)} ${c.hours[k] || '—'}`).join('\n');
      return { text: 'Here are the hours:\n' + line + (c.hours.note ? '\n' + c.hours.note : '') };
    }

    if (/\b(where|area|cover|serve|located|address|zip)\b/.test(n)) {
      return { text: `We are at ${c.$.addressLine}, and we cover ${c.$.areasLine}.` };
    }

    if (/\b(call|phone|number|speak|talk|human)\b/.test(n)) {
      return { text: `${c.business.phone} gets you a person.`,
        quick: [{ label: 'Call now', run: () => { if (c.$.telHref) window.location.href = c.$.telHref; } }] };
    }

    if (/\b(email|mail|write)\b/.test(n) && c.business.email) {
      return { text: `${c.business.email} — we usually reply the same working day.` };
    }

    return { text: 'I am not sure about that one — it is worth asking a technician directly.',
      quick: [
        { label: 'Call us', run: () => { if (c.$.telHref) window.location.href = c.$.telHref; } },
        { label: 'Book an inspection', run: () => { closeAi(); openBooking(null); } },
      ] };
  }

  const s2 = (t) => String(t || '').trim();

  function ask(text) {
    const c = cfg;
    say(text, 'me');
    if (ai.quick) ai.quick.replaceChildren();
    if (ai.typing) ai.typing.hidden = false;
    setTimeout(() => {
      if (ai.typing) ai.typing.hidden = true;
      const res = answer(c, text);
      say(res.text, 'bot');
      if (res.quick) quickReplies(res.quick);
    }, reduceMotion() ? 120 : 460 + Math.min(text.length * 8, 420));
  }

  function openAi(open) {
    if (!ai.node) return;
    const fab = $('.ai-fab');
    ai.node.hidden = !open;
    if (fab) fab.hidden = open;
    if (!open) { if ('speechSynthesis' in window) window.speechSynthesis.cancel(); return; }
    if (!ai.started) {
      ai.started = true;
      const c = cfg;
      say(`Hi — ask me anything about ${c.business.name.toLowerCase().includes('pest') ? 'pest control' : 'what we do'}, or I can book you in.`, 'bot');
      quickReplies([
        { label: 'Book an inspection', run: () => { closeAi(); openBooking(null); } },
        { label: 'What does it cost?', run: () => ask('What does the inspection cost?') },
        { label: 'Is it safe for pets?', run: () => ask('Is the treatment safe around pets?') },
      ]);
    }
    if (ai.input) ai.input.focus();
  }
  const closeAi = () => openAi(false);

  function initAi() {
    if (!ai.node) return;
    $$('[data-ai-open]').forEach((b) => on(b, 'click', () => openAi(true)));
    on($('[data-ai-close]'), 'click', () => openAi(false));
    on(ai.form, 'submit', (e) => {
      e.preventDefault();
      const v = ai.input.value.trim();
      if (!v) return;
      ai.input.value = '';
      ask(v);
    });

    const tts = $('[data-ai-tts]');
    if (!('speechSynthesis' in window)) { if (tts) tts.hidden = true; }
    else on(tts, 'click', () => {
      ai.speak = !ai.speak;
      tts.setAttribute('aria-pressed', String(ai.speak));
      if (!ai.speak) window.speechSynthesis.cancel();
    });

    const mic = $('[data-ai-mic]');
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { if (mic) mic.hidden = true; }
    else {
      let rec = null, listening = false;
      on(mic, 'click', () => {
        if (listening && rec) { rec.stop(); return; }
        rec = new SR();
        rec.lang = (cfg.site.locale || 'en_US').replace('_', '-');
        rec.interimResults = false;
        rec.maxAlternatives = 1;
        rec.onstart = () => { listening = true; mic.setAttribute('aria-pressed', 'true'); };
        rec.onend = () => { listening = false; mic.setAttribute('aria-pressed', 'false'); };
        rec.onerror = () => { listening = false; mic.setAttribute('aria-pressed', 'false'); };
        rec.onresult = (e) => {
          const said = e.results[0] && e.results[0][0] && e.results[0][0].transcript;
          if (said) ask(said.trim());
        };
        try { rec.start(); } catch (_) {}
      });
    }
  }

  /* ===================== boot ====================== */
  function apply(next) {
    cfg = next || CFG.get();
    bind(cfg);
    seo(cfg);
    renderServices(cfg);
    renderFaq(cfg);
    renderFooter(cfg);
    renderTestimonials(cfg);
    renderBookingServices(cfg);
    if (bk.step === 4) { renderCalendar(cfg); renderSlots(cfg); }
    if (bk.step === 6) renderRecap();
  }

  apply(cfg);
  chrome();
  initBooking();
  initSetup();
  initAi();
  CFG.subscribe(apply);

  /* Deep links. Both forms work, so a campaign URL and an in-page anchor
     behave the same:  ?service=termite#booking  and  #booking?service=termite  */
  function deepLink() {
    const hash = window.location.hash || '';
    if (!hash.startsWith('#booking')) return;
    const fromHash = hash.match(/service=([\w-]+)/);
    const fromQuery = new URLSearchParams(window.location.search).get('service');
    const id = (fromHash && fromHash[1]) || fromQuery || null;
    const known = id && (cfg.services || []).some((s) => s.id === id);
    setTimeout(() => openBooking(known ? id : null), 120);
  }
  deepLink();
  on(window, 'hashchange', deepLink);
})();
