/* ==========================================================================
   businessConfig — the single source of truth for this site.

   Everything the visitor sees (name, phone, copy, images, services, SEO,
   email templates) reads from here. Nothing business-specific is hardcoded
   in index.html or script.js.

   Two ways to edit:
     1. Change DEFAULTS below and redeploy — permanent, versioned in git.
     2. Use the "Business Setup" panel at the bottom of the page — saved to
        this browser's localStorage, applied live, exportable as JSON.

   Values left empty are HIDDEN rather than faked. A licence number you have
   not entered does not appear at all; it is never replaced by a placeholder
   that could read as real.
   ========================================================================== */
(() => {
  'use strict';

  const STORAGE_KEY = 'businessConfig.v1';

  /* ----------------------------------------------------------------------
     PRODUCTION DOMAIN
     Leave blank and the site derives canonical / Open Graph / schema URLs
     from wherever it is actually served. Set it once you have a real domain:
        domain: 'https://www.yourbusiness.com'
     No domain is ever invented on your behalf.
     ---------------------------------------------------------------------- */

  const DEFAULTS = {
    site: {
      domain: '',                 // e.g. 'https://www.yourbusiness.com' — blank = use current origin
      locale: 'en_US',
      themeColor: '#0B3B44',
    },

    business: {
      name: 'Apex Pest Solutions',
      shortName: 'Apex',
      tagline: 'Pest control for homes and businesses across Greater Houston.',
      phone: '(713) 555-0142',
      emergencyPhone: '(713) 555-0142',
      email: 'hello@apexpestsolutions.com',
      street: '1200 Commerce Street, Suite 400',
      city: 'Houston',
      state: 'TX',
      zip: '77002',
      country: 'US',
      // Blank unless you actually operate 24/7. Shown only when true.
      emergencyAvailable: true,
    },

    hours: {
      mon: '7:00 – 19:00', tue: '7:00 – 19:00', wed: '7:00 – 19:00',
      thu: '7:00 – 19:00', fri: '7:00 – 19:00',
      sat: '8:00 – 16:00', sun: 'Closed',
      note: 'Emergency line answered outside these hours.',
    },

    /* Only statements that are actually true of the business belong here.
       Delete any line you cannot stand behind. No numbers, no superlatives. */
    trust: [
      'Free inspection before any quote',
      'Fixed price agreed before work starts',
      'Family and pet conscious treatments',
      'Same-day and next-day appointments',
    ],

    /* Everything below is blank by design. Fill in only what is verifiable.
       Blank fields render nothing — they are never substituted with a number. */
    credentials: {
      licenceNumber: '',          // e.g. 'TPCL 12345'
      licenceAuthority: '',       // e.g. 'Texas Department of Agriculture'
      insured: false,             // true only if you carry liability cover
      yearsInBusiness: '',        // e.g. '12' — omitted entirely when blank
      foundedYear: '',            // e.g. '2014'
      affiliations: [],           // e.g. ['NPMA member']
    },

    cta: {
      primary: 'Book a free inspection',
      secondary: 'Call us',
      nav: 'Book inspection',
    },

    booking: {
      // 'local'   → the built-in 6-step flow, resolves in-browser (demo)
      // 'webhook' → POSTs the booking payload to `endpoint`
      // 'url'     → sends visitors to `externalUrl` (Calendly, etc.) instead
      provider: 'local',
      endpoint: '',
      externalUrl: '',
      leadTimeDays: 1,
      horizonDays: 75,
      closedWeekdays: [0],
      slots: [
        { id: '08-10', label: '8:00 – 10:00 am' },
        { id: '10-12', label: '10:00 am – 12:00 pm' },
        { id: '12-14', label: '12:00 – 2:00 pm' },
        { id: '14-16', label: '2:00 – 4:00 pm' },
        { id: '16-18', label: '4:00 – 6:00 pm' },
      ],
    },

    /* `image` is optional per service. Left blank, the services panel uses
       images.about instead — nothing is ever broken by an empty field. */
    services: [
      { id: 'general',   name: 'General pest control',  blurb: 'A perimeter treatment and interior sweep that covers the usual suspects in one visit.', detail: 'Covers ants, spiders, silverfish, earwigs and the seasonal nuisance insects. Quarterly plans available.' },
      { id: 'cockroach', name: 'Cockroaches',           blurb: 'Gel baiting and crack-and-crevice work that breaks the breeding cycle.',               detail: 'German and American roaches behave differently. We identify the species first, then bait accordingly — spraying alone tends to scatter them.' },
      { id: 'rodent',    name: 'Rodents',               blurb: 'Trapping, entry-point exclusion and clean-up.',                                        detail: 'Trapping alone is temporary. We find the entry points — usually a gap under a door or around a utility line — and seal them.' },
      { id: 'termite',   name: 'Termites',              blurb: 'Inspection, treatment and an annual check on the structure.',                          detail: 'Time-sensitive. Mud tubes and hollow-sounding timber mean the colony is already established, so these inspections get priority.' },
      { id: 'bedbug',    name: 'Bed bugs',              blurb: 'Full-room treatment with a scheduled follow-up.',                                      detail: 'Needs two visits, two to three weeks apart. Shop-bought sprays usually spread an infestation between rooms rather than ending it.' },
      { id: 'mosquito',  name: 'Mosquitoes',            blurb: 'Yard treatment plus removal of the water they breed in.',                              detail: 'Most of the work is finding standing water — blocked gutters, plant saucers, a tarp fold. Treatment without that is short-lived.' },
      { id: 'wasp',      name: 'Wasps and bees',        blurb: 'Nest removal, with live relocation for honeybees where possible.',                      detail: 'Honeybees are relocated rather than destroyed where the colony is reachable. Comb is removed so the cavity is not reused.' },
    ],

    serviceAreas: ['Houston', 'Katy', 'Sugar Land', 'Pearland', 'The Woodlands', 'Cypress', 'Spring', 'Pasadena'],

    social: { facebook: '', instagram: '', x: '', linkedin: '' },

    /* Demo artwork ships with the template so nothing is ever broken.
       Replace with your own photography: paste a path or URL here, or use the
       image fields in Business Setup. Recommended crops are noted per slot. */
    images: {
      hero:         { src: 'assets/img/demo/hero.svg',        alt: 'Technician treating a property', note: 'Square or portrait. Centre-cropped to 4:5 on desktop, 16:13 on mobile.' },
      about:        { src: 'assets/img/demo/about.svg',       alt: 'Inspection in progress',          note: 'Square. Centre-cropped to 4:5 on desktop, 4:3 on mobile.' },
      process:      { src: 'assets/img/demo/process.svg',     alt: 'Equipment prepared for a visit',  note: 'Square 1:1.' },
      commercial:   { src: 'assets/img/demo/commercial.svg',  alt: 'Commercial premises serviced',    note: 'Square. Centre-cropped to 1:1 on desktop, 16:10 on mobile.' },
      team:         { src: '',                                 alt: '',                                note: 'Optional — your team. Hidden when blank.' },
      // Social share card. Must be a raster image (JPG/PNG) — social platforms
      // do not render SVG. Left blank, no og:image is advertised at all.
      og:           { src: '',                                 alt: '',                                note: '1200 x 630 JPG or PNG' },
      gallery:      [],
    },

    branding: {
      logoText: 'Apex',
      logoTextAccent: 'Pest Solutions',
      logoImage: '',              // optional — overrides the wordmark when set
      favicon: '',                // optional — data URL or path
    },

    about: {
      heading: 'We find the way in, then we close it',
      body: 'Most pest problems are a building problem first. A gap under a door, a leaking trap, a vent without a screen. We treat what is there now, then we tell you what let it in — because a treatment that ignores the entry point is a treatment you will be paying for again next season.',
      signoff: '',
      steps: [
        { name: 'Inspect',    text: 'We walk the property and find the entry points, not just the activity.' },
        { name: 'Quote',      text: 'A written plan with a fixed price. Nothing starts until you say so.' },
        { name: 'Treat',      text: 'Targeted treatment, and we seal what let them in where we can.' },
        { name: 'Check back', text: 'We follow up. If activity returns between visits, we come back.' },
      ],
    },

    /* Every line of page copy. index.html holds structure only, so the same
       markup dresses a different business without being edited. */
    copy: {
      heroKicker:      'Residential and commercial',
      heroLine1:       'Something got in.',
      heroLine2:       'We find out how.',
      servicesMark:    'What we treat',
      servicesHeading: 'Pick the one that sounds like your week.',
      approachMark:    'How we work',
      commercialMark:  'For businesses',
      commercialHeading: 'A failed inspection costs more than the contract.',
      commercialBody:  'Scheduled visits outside trading hours, a digital log an inspector can read, and one person who picks up the phone. Restaurants, warehouses, multi-family and retail.',
      commercialCta:   'Request a commercial quote',
      bookingMark:     'Booking',
      faqMark:         'Straight answers',
      faqHeading:      'The things people ask before they book.',
      faqNote:         'Something not covered?',
      faqAsk:          'Ask us',
      saysMark:        'In their words',
      ctaHeading:      'Book the inspection. It costs nothing to know.',
      ctaAreasLabel:   'Serving',
      assistantNote:   'answers in a few seconds',
    },

    faq: [
      { q: 'How soon can someone come out?', a: 'Most inspections are same-day or next-day. If there is an active infestation, say so when you book and it moves up the list.' },
      { q: 'What does the inspection cost?', a: 'Nothing. You get a written plan with a fixed price, and no obligation to go ahead with it.' },
      { q: 'Is the treatment safe around children and pets?', a: 'We use low-toxicity, targeted products and tell you exactly when each room is safe to re-enter. Usually that is once surfaces are dry.' },
      { q: 'What if the problem comes back?', a: 'On a protection plan, re-treatment between scheduled visits is free. On a one-off treatment, tell us and we will look at it again.' },
      { q: 'Do I need to leave the house?', a: 'For most general treatments, no. Bed bug and whole-house work is the exception and we will tell you in advance.' },
    ],

    /* Real reviews only. Left empty, the section does not render at all.
       Add entries as { quote, name, location, source } once you have consent. */
    testimonials: [],
  };

  /* ======================================================================
     Persistence
     ====================================================================== */
  const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

  const deepMerge = (base, patch) => {
    const out = Array.isArray(base) ? base.slice() : { ...base };
    for (const [k, v] of Object.entries(patch || {})) {
      out[k] = isObj(v) && isObj(base?.[k]) ? deepMerge(base[k], v) : v;
    }
    return out;
  };

  const clone = (v) => (typeof structuredClone === 'function' ? structuredClone(v) : JSON.parse(JSON.stringify(v)));

  const load = () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? deepMerge(DEFAULTS, JSON.parse(raw)) : clone(DEFAULTS);
    } catch (err) {
      console.warn('[config] could not read saved settings; using defaults.', err);
      return clone(DEFAULTS);
    }
  };

  let current = load();
  const listeners = new Set();

  /* ======================================================================
     Derived values — computed, never stored, always consistent
     ====================================================================== */
  const digits = (s) => String(s || '').replace(/[^\d+]/g, '');

  const telHref = (phone) => {
    const d = digits(phone);
    if (!d) return '';
    return 'tel:' + (d.startsWith('+') ? d : (d.length === 10 ? '+1' + d : '+' + d));
  };

  const derive = (c) => {
    const b = c.business;
    const origin = typeof location !== 'undefined' ? location.origin + location.pathname.replace(/index\.html$/, '') : '';
    const base = (c.site.domain || origin).replace(/\/+$/, '');
    const cityState = [b.city, b.state].filter(Boolean).join(', ');
    return {
      base,
      // A canonical URL names a page, so it keeps its trailing slash.
      canonical: base ? base + '/' : '',
      telHref: telHref(b.phone),
      emergencyTelHref: telHref(b.emergencyPhone || b.phone),
      mailto: b.email ? 'mailto:' + b.email : '',
      cityState,
      addressLine: [b.street, cityState, b.zip].filter(Boolean).join(', '),
      areasLine: (c.serviceAreas || []).join(' · '),
      // Trust claims we can make without inventing a number
      hasLicence: !!(c.credentials.licenceNumber || '').trim(),
      // Rendered beside the hero kicker — but only once a real number exists.
      licenceLine: (c.credentials.licenceNumber || '').trim()
        ? 'Licence ' + String(c.credentials.licenceNumber).trim() : '',
      hasYears: !!String(c.credentials.yearsInBusiness || '').trim(),
      hasTestimonials: Array.isArray(c.testimonials) && c.testimonials.length > 0,
      hasTeamPhoto: !!(c.images.team && c.images.team.src),
      seoTitle: `${b.name}${cityState ? ' · Pest control in ' + cityState : ''}`,
      seoDescription: c.business.tagline,
    };
  };

  /* ======================================================================
     Public API
     ====================================================================== */
  const notify = () => { const snap = api.get(); listeners.forEach((fn) => { try { fn(snap); } catch (e) { console.error(e); } }); };

  const persist = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err && err.name === 'QuotaExceededError'
        ? 'Storage full — try a smaller image, or link to one by URL instead of uploading.'
        : 'Could not save to this browser.' };
    }
  };

  const api = {
    get() { const c = clone(current); c.$ = derive(current); return c; },
    defaults() { return clone(DEFAULTS); },

    set(patch, { silent = false } = {}) {
      current = deepMerge(current, patch);
      const res = persist();
      if (!silent) notify();
      return res;
    },

    replace(next) {
      current = deepMerge(DEFAULTS, next);
      const res = persist();
      notify();
      return res;
    },

    reset() {
      current = clone(DEFAULTS);
      try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
      notify();
      return { ok: true };
    },

    /** Only the keys that differ from DEFAULTS, so exports stay small and readable. */
    diff() {
      const walk = (base, cur) => {
        const out = {};
        for (const [k, v] of Object.entries(cur)) {
          if (JSON.stringify(v) === JSON.stringify(base?.[k])) continue;
          out[k] = isObj(v) && isObj(base?.[k]) ? walk(base[k], v) : v;
        }
        return out;
      };
      return walk(DEFAULTS, current);
    },

    exportJSON() { return JSON.stringify({ _format: 'businessConfig.v1', savedAt: new Date().toISOString(), config: api.diff() }, null, 2); },

    importJSON(text) {
      let parsed;
      try { parsed = JSON.parse(text); } catch (_) { return { ok: false, error: 'That is not valid JSON.' }; }
      const next = parsed && parsed.config ? parsed.config : parsed;
      if (!isObj(next)) return { ok: false, error: 'No settings found in that file.' };
      return api.replace(next);
    },

    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },

    storageUsed() {
      try { return new Blob([localStorage.getItem(STORAGE_KEY) || '']).size; } catch (_) { return 0; }
    },

    isCustomised() { return Object.keys(api.diff()).length > 0; },

    service(id) { return (current.services || []).find((s) => s.id === id) || null; },
  };

  window.businessConfig = api;
})();
