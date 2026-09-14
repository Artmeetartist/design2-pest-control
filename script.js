/* ==========================================================================
   Apex Pest Solutions — script.js
   Vanilla JS, no dependencies.

   Integration points are isolated in CONFIG + the three adapter objects
   (AIProvider, BookingAPI, LeadAPI) so a real backend can be connected
   without touching any UI code.
   ========================================================================== */
(() => {
  'use strict';

  /* ======================================================================
     0. CONFIG — the only block you normally need to edit
     ====================================================================== */
  const CONFIG = {
    business: {
      name: 'Apex Pest Solutions',
      phone: '+17135550142',
      phoneDisplay: '(713) 555-0142',
      email: 'hello@apexpestsolutions.com',
      // ZIP prefixes we service. Anything else triggers the out-of-area flow.
      serviceZipPrefixes: ['770', '771', '772', '773', '774', '775', '776', '778'],
    },

    ai: {
      /* 'mock'  → the built-in rule-based receptionist (no network calls)
         'api'   → POST {messages, context} to `endpoint`, expects
                   { reply: string, quickReplies?: string[], action?: string }

         Example wiring for OpenAI / Anthropic / your own gateway:
           provider: 'api',
           endpoint: '/api/assistant',
           headers: { 'Content-Type': 'application/json' },
         Never put a provider API key in client-side code — proxy it. */
      provider: 'mock',
      endpoint: '',
      headers: { 'Content-Type': 'application/json' },
      systemPrompt:
        'You are the virtual receptionist for Apex Pest Solutions, a licensed pest control ' +
        'company in Houston, TX. Be concise, warm and practical. Identify the pest, confirm ' +
        'the service area by ZIP, then offer a free inspection booking.',
      typingSpeed: [520, 1150], // simulated "thinking" window, ms
      speech: { enabled: true, lang: 'en-US' },
    },

    booking: {
      /* 'mock'     → resolves locally (demo mode)
         'webhook'  → POST the payload to `endpoint` (Web3Forms, Formspree,
                      Make/Zapier, or your own API route)
         Downstream adapters (Google Calendar, Calendly, CRM, SMS) are
         intentionally server-side concerns: send them one payload from
         `endpoint` and fan out there. */
      provider: 'mock',
      endpoint: '',
      leadTimeDays: 1,      // earliest bookable day from today
      horizonDays: 75,      // furthest bookable day
      closedWeekdays: [0],  // 0 = Sunday
      slots: [
        { id: '08-10', label: '8:00 – 10:00 AM', note: 'Early window' },
        { id: '10-12', label: '10:00 – 12:00 PM', note: 'Most requested' },
        { id: '12-14', label: '12:00 – 2:00 PM', note: 'Midday' },
        { id: '14-16', label: '2:00 – 4:00 PM', note: 'Afternoon' },
        { id: '16-18', label: '4:00 – 6:00 PM', note: 'After work' },
      ],
    },

    lead: {
      /* Newsletter / lead capture. Same pattern as booking. */
      provider: 'mock',
      endpoint: '',
    },

    /* Drop-in photography.
       Every <img> carries a data-photo path pointing at the .jpg that should
       replace the bundled brand art (e.g. assets/img/hero-technician.jpg).
       Save your licensed photos at those paths, flip this to true, and they
       are picked up automatically — no markup changes. Left false by default
       so the browser never logs 404s for files that aren't there yet. */
    photoSwap: false,
  };

  const SERVICE_LABELS = {
    general: 'General Pest Control',
    cockroach: 'Cockroach Control',
    rodent: 'Rodent Removal',
    termite: 'Termite Treatment',
    bedbug: 'Bed Bug Treatment',
    mosquito: 'Mosquito Control',
    other: 'Other / Not sure',
  };

  /* ======================================================================
     1. UTILITIES
     ====================================================================== */
  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const on = (el, ev, fn, opts) => el && el.addEventListener(ev, fn, opts);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const rand = (min, max) => Math.random() * (max - min) + min;
  const prefersReduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* Assistant replies may contain light emphasis markup. When the reply comes
     from a remote endpoint we still only trust <strong>, <em> and <br>. */
  const sanitizeRich = (html) =>
    String(html)
      .replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))
      .replace(/&lt;(\/?(?:strong|em|b|i))&gt;/gi, '<$1>')
      .replace(/&lt;br\s*\/?&gt;/gi, '<br>');

  const escapeHtml = (str) =>
    String(str).replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const toISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const fromISO = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

  const formatDate = (iso, opts) =>
    fromISO(iso).toLocaleDateString('en-US', opts || { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

  /* Deterministic per-date "availability" so the calendar behaves
     consistently between renders. Replace with a real availability API. */
  const hash = (str) => {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return Math.abs(h);
  };

  const isValidEmail = (v) => /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(v.trim());
  const isValidPhone = (v) => (v.replace(/\D/g, '').length >= 10);
  const isValidZip   = (v) => /^\d{5}$/.test(v.trim());
  const inServiceArea = (zip) =>
    CONFIG.business.serviceZipPrefixes.some((p) => zip.startsWith(p));

  /* ======================================================================
     2. HEADER, NAV, SCROLL STATE
     ====================================================================== */
  const initHeader = () => {
    const header = $('[data-header]');
    const bar = $('[data-mobile-bar]');
    const hero = $('.hero');
    if (!header) return;

    let ticking = false;
    const update = () => {
      const y = window.scrollY;
      header.classList.toggle('is-stuck', y > 24);
      if (bar) bar.classList.toggle('is-visible', y > (hero ? hero.offsetHeight * 0.55 : 500));
      ticking = false;
    };
    on(window, 'scroll', () => {
      if (!ticking) { ticking = true; requestAnimationFrame(update); }
    }, { passive: true });
    update();
  };

  const initDrawer = () => {
    const drawer = $('#mobile-nav');
    const burger = $('[data-menu-open]');
    if (!drawer || !burger) return;

    let lastFocus = null;

    const open = () => {
      lastFocus = document.activeElement;
      drawer.hidden = false;
      requestAnimationFrame(() => drawer.classList.add('is-open'));
      burger.setAttribute('aria-expanded', 'true');
      document.body.classList.add('is-locked');
      const first = $('.drawer__nav a', drawer);
      if (first) setTimeout(() => first.focus(), 120);
    };

    const close = () => {
      drawer.classList.remove('is-open');
      burger.setAttribute('aria-expanded', 'false');
      document.body.classList.remove('is-locked');
      setTimeout(() => { drawer.hidden = true; }, 420);
      if (lastFocus) lastFocus.focus();
    };

    on(burger, 'click', () => (drawer.hidden ? open() : close()));
    $$('[data-menu-close]').forEach((el) => on(el, 'click', close));
    $$('.drawer__nav a, .drawer__foot a', drawer).forEach((a) => on(a, 'click', close));
    on(document, 'keydown', (e) => { if (e.key === 'Escape' && !drawer.hidden) close(); });

    // Focus trap
    on(drawer, 'keydown', (e) => {
      if (e.key !== 'Tab') return;
      const focusables = $$('a[href], button:not([disabled]), input', drawer)
        .filter((el) => el.offsetParent !== null);
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
  };

  const initScrollSpy = () => {
    const links = $$('.nav__link');
    const map = new Map();
    links.forEach((l) => {
      const id = l.getAttribute('href');
      const section = id && id.startsWith('#') ? $(id) : null;
      if (section) map.set(section, l);
    });
    if (!map.size) return;

    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        links.forEach((l) => l.classList.remove('is-current'));
        const link = map.get(entry.target);
        if (link) link.classList.add('is-current');
      });
    }, { rootMargin: '-45% 0px -50% 0px', threshold: 0 });

    map.forEach((_, section) => io.observe(section));
  };

  /* ======================================================================
     3. SCROLL REVEAL + COUNTERS
     ====================================================================== */
  const initReveal = () => {
    const items = $$('[data-reveal]');
    if (!items.length) return;
    if (prefersReduced() || !('IntersectionObserver' in window)) {
      items.forEach((el) => el.classList.add('is-revealed'));
      return;
    }
    items.forEach((el) => {
      const d = el.getAttribute('data-reveal-delay');
      if (d) el.style.setProperty('--reveal-delay', d);
    });
    const io = new IntersectionObserver((entries, obs) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-revealed');
        obs.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
    items.forEach((el) => io.observe(el));
  };

  const initCounters = () => {
    const nodes = $$('[data-count]');
    if (!nodes.length) return;

    const run = (el) => {
      const target = parseFloat(el.getAttribute('data-count-to')) || 0;
      const suffix = el.getAttribute('data-count-suffix') || '';
      if (prefersReduced()) { el.textContent = target.toLocaleString('en-US') + suffix; return; }

      const duration = 1700;
      const start = performance.now();
      const tick = (now) => {
        const p = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - p, 4);
        el.textContent = Math.round(target * eased).toLocaleString('en-US') + suffix;
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    };

    if (!('IntersectionObserver' in window)) { nodes.forEach(run); return; }
    const io = new IntersectionObserver((entries, obs) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        run(entry.target);
        obs.unobserve(entry.target);
      });
    }, { threshold: 0.5 });
    nodes.forEach((el) => io.observe(el));
  };

  /* ======================================================================
     4. ACCORDION
     ====================================================================== */
  const initAccordion = () => {
    const root = $('[data-accordion]');
    if (!root) return;
    const items = $$('.accordion__item', root);

    items.forEach((item) => {
      const trigger = $('.accordion__trigger', item);
      const panel = $('.accordion__panel', item);
      if (!trigger || !panel) return;

      on(trigger, 'click', () => {
        const isOpen = item.classList.contains('is-open');
        items.forEach((other) => {
          const t = $('.accordion__trigger', other);
          other.classList.remove('is-open');
          if (t) t.setAttribute('aria-expanded', 'false');
        });
        if (!isOpen) {
          item.classList.add('is-open');
          trigger.setAttribute('aria-expanded', 'true');
        }
      });
    });
  };

  /* ======================================================================
     5. TESTIMONIAL CAROUSEL
     ====================================================================== */
  const initCarousel = () => {
    const root = $('[data-carousel]');
    if (!root) return;
    const track = $('[data-carousel-track]', root);
    const dotsWrap = $('[data-carousel-dots]', root);
    const prev = $('[data-carousel-prev]');
    const next = $('[data-carousel-next]');
    if (!track) return;

    const slides = $$('.quote', track);

    const perView = () => {
      const first = slides[0];
      if (!first) return 1;
      return Math.max(1, Math.round(track.clientWidth / (first.offsetWidth + 16)));
    };
    const pages = () => Math.max(1, slides.length - perView() + 1);

    const buildDots = () => {
      if (!dotsWrap) return;
      dotsWrap.innerHTML = '';
      for (let i = 0; i < pages(); i++) {
        const b = document.createElement('button');
        b.type = 'button';
        b.setAttribute('role', 'tab');
        b.setAttribute('aria-label', `Go to testimonial ${i + 1}`);
        on(b, 'click', () => goTo(i));
        dotsWrap.appendChild(b);
      }
      syncDots();
    };

    const index = () => {
      const first = slides[0];
      if (!first) return 0;
      return Math.round(track.scrollLeft / (first.offsetWidth + 16));
    };

    const syncDots = () => {
      if (!dotsWrap) return;
      const i = Math.min(index(), pages() - 1);
      $$('button', dotsWrap).forEach((b, n) => {
        b.classList.toggle('is-active', n === i);
        b.setAttribute('aria-selected', n === i ? 'true' : 'false');
      });
      if (prev) prev.disabled = i <= 0;
      if (next) next.disabled = i >= pages() - 1;
    };

    const goTo = (i) => {
      const first = slides[0];
      if (!first) return;
      track.scrollTo({ left: i * (first.offsetWidth + 16), behavior: prefersReduced() ? 'auto' : 'smooth' });
    };

    on(prev, 'click', () => goTo(Math.max(0, index() - 1)));
    on(next, 'click', () => goTo(Math.min(pages() - 1, index() + 1)));

    let raf;
    on(track, 'scroll', () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(syncDots);
    }, { passive: true });

    on(track, 'keydown', (e) => {
      if (e.key === 'ArrowRight') { e.preventDefault(); goTo(Math.min(pages() - 1, index() + 1)); }
      if (e.key === 'ArrowLeft')  { e.preventDefault(); goTo(Math.max(0, index() - 1)); }
    });

    let resizeT;
    on(window, 'resize', () => { clearTimeout(resizeT); resizeT = setTimeout(buildDots, 200); });
    buildDots();
  };

  /* ======================================================================
     6. DROP-IN PHOTOGRAPHY
     Ship your own licensed photos by saving them next to the bundled SVG
     art using the same basename (e.g. assets/img/hero-technician.jpg).
     They are picked up automatically — no markup changes needed.
     ====================================================================== */
  const initPhotoSwap = () => {
    if (!CONFIG.photoSwap) return;
    const swap = (img) => {
      const src = img.getAttribute('data-photo');
      if (!src) return;
      const probe = new Image();
      probe.onload = () => {
        img.src = src;
        img.removeAttribute('srcset');
      };
      probe.src = src;
    };
    const nodes = $$('img[data-photo]');
    if ('requestIdleCallback' in window) requestIdleCallback(() => nodes.forEach(swap), { timeout: 2500 });
    else setTimeout(() => nodes.forEach(swap), 1200);
  };

  /* ======================================================================
     7. BOOKING API ADAPTER
     Swap `CONFIG.booking.provider` to 'webhook' and point `endpoint` at a
     route that fans out to Google Calendar / Calendly / your CRM / SMS +
     email automation. The payload shape below is what that route receives.
     ====================================================================== */
  const BookingAPI = {
    buildPayload(state, reference) {
      return {
        reference,
        submittedAt: new Date().toISOString(),
        source: 'website-booking-widget',
        service: { id: state.service, label: SERVICE_LABELS[state.service] || state.service },
        property: state.property,
        appointment: {
          date: state.date,
          slotId: state.time,
          slotLabel: (CONFIG.booking.slots.find((s) => s.id === state.time) || {}).label || state.time,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
        customer: {
          name: state.name,
          phone: state.phone,
          email: state.email,
          address: state.address,
          zip: state.zip,
          notes: state.notes,
          consent: !!state.consent,
        },
      };
    },

    async submit(payload) {
      const { provider, endpoint } = CONFIG.booking;

      if (provider === 'webhook' && endpoint) {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(`Booking failed with status ${res.status}`);
        return res.json().catch(() => ({ ok: true }));
      }

      // Demo mode — simulates network latency, always succeeds.
      await wait(rand(900, 1500));
      return { ok: true, mock: true };
    },
  };

  /* ======================================================================
     8. BOOKING WIZARD
     ====================================================================== */
  const Booking = (() => {
    const form = $('[data-booking-form]');
    if (!form) return { prefill() {}, goto() {}, scrollIn() {}, step: 0 };

    const railItems = $$('[data-booking-rail] .booking__rail-item');
    const steps = $$('.booking__step', form);
    const backBtn = $('[data-booking-back]', form);
    const nextBtn = $('[data-booking-next]', form);
    const nextLabel = $('[data-next-label]', form);
    const submitBtn = $('[data-booking-submit]', form);
    const submitLabel = $('[data-submit-label]', form);
    const alertBox = $('[data-booking-alert]', form);
    const calGrid = $('[data-cal-grid]');
    const calMonth = $('[data-cal-month]');
    const slotsWrap = $('[data-slots]');

    const TOTAL_INPUT_STEPS = 5;
    let step = 1;
    let viewMonth = startOfDay(new Date());
    let submitting = false;

    const state = {
      service: '', property: '', date: '', time: '',
      name: '', phone: '', email: '', address: '', zip: '', notes: '', consent: false,
    };

    /* ---------- summary ---------- */
    const setSummary = (key, value) => {
      const el = $(`[data-summary="${key}"]`);
      if (!el) return;
      el.textContent = value || (key === 'contact' ? 'Not provided' : 'Not selected');
      el.classList.toggle('is-set', !!value);
    };

    const refreshSummary = () => {
      setSummary('service', SERVICE_LABELS[state.service] || '');
      setSummary('property', state.property);
      setSummary('date', state.date ? formatDate(state.date) : '');
      const slot = CONFIG.booking.slots.find((s) => s.id === state.time);
      setSummary('time', slot ? slot.label : '');
      setSummary('contact', state.name ? `${state.name}${state.phone ? ' · ' + state.phone : ''}` : '');
    };

    /* ---------- step navigation ---------- */
    const showStep = (n, focus = true) => {
      step = n;
      steps.forEach((s) => { s.hidden = Number(s.dataset.step) !== n; });
      railItems.forEach((item) => {
        const idx = Number(item.dataset.rail);
        item.classList.toggle('is-active', idx === n);
        item.classList.toggle('is-done', idx < n);
      });

      const done = n > TOTAL_INPUT_STEPS;
      backBtn.hidden = n === 1 || done;
      nextBtn.hidden = n >= TOTAL_INPUT_STEPS;
      submitBtn.hidden = n !== TOTAL_INPUT_STEPS;
      if (nextLabel) nextLabel.textContent = n === 4 ? 'Continue to details' : 'Continue';
      if (alertBox) alertBox.hidden = true;

      const rail = $('[data-booking-rail]');
      const active = railItems[n - 1];
      if (rail && active) rail.scrollTo({ left: Math.max(0, active.offsetLeft - 60), behavior: 'smooth' });

      if (focus) {
        const target = steps.find((s) => Number(s.dataset.step) === n);
        const firstField = target && $('input:not([type="hidden"]), button, textarea', target);
        if (firstField && n > 1) firstField.focus({ preventScroll: true });
      }
    };

    /* ---------- validation ---------- */
    const setFieldError = (name, message) => {
      const msg = $(`[data-error-for="${name}"]`, form);
      const input = $(`[name="${name}"]`, form);
      const field = input ? input.closest('.field') : null;
      if (msg) { msg.hidden = !message; if (message) msg.textContent = message; }
      if (field) field.classList.toggle('is-invalid', !!message);
      if (input) input.setAttribute('aria-invalid', message ? 'true' : 'false');
    };

    const validateStep = (n) => {
      if (n === 1) {
        if (!state.service) { setFieldError('service', 'Please choose a service to continue.'); return false; }
        setFieldError('service', '');
      }
      if (n === 2) {
        if (!state.property) { setFieldError('property', 'Please select a property type.'); return false; }
        setFieldError('property', '');
      }
      if (n === 3) {
        if (!state.date) { setFieldError('date', 'Please choose an available date.'); return false; }
        setFieldError('date', '');
      }
      if (n === 4) {
        if (!state.time) { setFieldError('time', 'Please pick an available time window.'); return false; }
        setFieldError('time', '');
      }
      if (n === 5) {
        let ok = true;
        const checks = [
          ['name', state.name.trim().length >= 2, 'Please enter your full name.'],
          ['phone', isValidPhone(state.phone), 'Enter a valid phone number (at least 10 digits).'],
          ['email', isValidEmail(state.email), 'Enter a valid email address.'],
          ['zip', isValidZip(state.zip), 'Enter a valid 5-digit ZIP code.'],
          ['address', state.address.trim().length >= 6, 'Please enter the address we should visit.'],
          ['consent', state.consent, 'Please confirm we can contact you about the booking.'],
        ];
        checks.forEach(([name, valid, msg]) => {
          setFieldError(name, valid ? '' : msg);
          if (!valid && ok) {
            ok = false;
            const input = $(`[name="${name}"]`, form);
            if (input) input.focus({ preventScroll: true });
          }
        });
        return ok;
      }
      return true;
    };

    /* ---------- calendar ---------- */
    const isBookable = (date) => {
      const today = startOfDay(new Date());
      const min = new Date(today); min.setDate(min.getDate() + CONFIG.booking.leadTimeDays);
      const max = new Date(today); max.setDate(max.getDate() + CONFIG.booking.horizonDays);
      if (date < min || date > max) return false;
      if (CONFIG.booking.closedWeekdays.includes(date.getDay())) return false;
      return true;
    };

    const renderCalendar = () => {
      if (!calGrid || !calMonth) return;
      calMonth.textContent = viewMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      calGrid.innerHTML = '';

      const year = viewMonth.getFullYear();
      const month = viewMonth.getMonth();
      const firstDay = new Date(year, month, 1);
      // Monday-first offset
      const offset = (firstDay.getDay() + 6) % 7;
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const todayISO = toISO(new Date());

      for (let i = 0; i < offset; i++) {
        const blank = document.createElement('span');
        blank.className = 'cal-day is-empty';
        blank.setAttribute('aria-hidden', 'true');
        calGrid.appendChild(blank);
      }

      for (let d = 1; d <= daysInMonth; d++) {
        const date = new Date(year, month, d);
        const iso = toISO(date);
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'cal-day';
        btn.textContent = String(d);
        btn.dataset.date = iso;
        btn.setAttribute('aria-label', formatDate(iso, { weekday: 'long', day: 'numeric', month: 'long' }));

        if (iso === todayISO) btn.classList.add('is-today');
        if (!isBookable(date)) { btn.disabled = true; btn.setAttribute('aria-disabled', 'true'); }
        if (state.date === iso) { btn.classList.add('is-selected'); btn.setAttribute('aria-selected', 'true'); }

        on(btn, 'click', () => {
          state.date = iso;
          state.time = '';
          $('[name="date"]', form).value = iso;
          $('[name="time"]', form).value = '';
          setFieldError('date', '');
          renderCalendar();
          renderSlots();
          refreshSummary();
        });

        calGrid.appendChild(btn);
      }

      // Disable back-navigation past the current month
      const prevBtn = $('[data-cal-prev]');
      if (prevBtn) {
        const today = startOfDay(new Date());
        prevBtn.disabled = year === today.getFullYear() && month === today.getMonth();
      }
    };

    const renderSlots = () => {
      if (!slotsWrap) return;
      slotsWrap.innerHTML = '';

      if (!state.date) {
        slotsWrap.innerHTML = '<p class="slots__empty">Pick a date first and we\'ll show the open arrival windows.</p>';
        return;
      }

      const seed = hash(state.date);
      let available = 0;

      CONFIG.booking.slots.forEach((slot, i) => {
        const taken = (seed >> (i * 2)) % 5 === 0; // deterministic pseudo-availability
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'slot';
        btn.style.animationDelay = `${i * 45}ms`;
        btn.setAttribute('role', 'radio');
        btn.setAttribute('aria-checked', state.time === slot.id ? 'true' : 'false');
        btn.innerHTML = `<strong>${slot.label}</strong><span>${taken ? 'Fully booked' : slot.note}</span>`;

        if (taken) { btn.disabled = true; }
        else {
          available++;
          if (state.time === slot.id) btn.classList.add('is-selected');
          on(btn, 'click', () => {
            state.time = slot.id;
            $('[name="time"]', form).value = slot.id;
            setFieldError('time', '');
            renderSlots();
            refreshSummary();
          });
        }
        slotsWrap.appendChild(btn);
      });

      if (!available) {
        slotsWrap.innerHTML = '<p class="slots__empty">No windows left on that date — please choose another day.</p>';
      }
    };

    /* ---------- submission ---------- */
    const makeReference = () => {
      const stamp = Date.now().toString(36).slice(-4).toUpperCase();
      const noise = Math.random().toString(36).slice(2, 4).toUpperCase();
      return `APX-${stamp}${noise}`;
    };

    const showReceipt = (reference) => {
      const slot = CONFIG.booking.slots.find((s) => s.id === state.time);
      const set = (key, val) => { const el = $(`[data-receipt="${key}"]`); if (el) el.textContent = val; };
      set('ref', reference);
      set('service', SERVICE_LABELS[state.service] || state.service);
      set('property', state.property);
      set('when', `${formatDate(state.date, { weekday: 'long', day: 'numeric', month: 'long' })} · ${slot ? slot.label : ''}`);
      set('address', `${state.address}, ${state.zip}`);
      set('contact', `${state.phone} · ${state.email}`);
    };

    const submit = async (e) => {
      e.preventDefault();
      if (submitting) return;                 // prevents double submission
      if (!validateStep(5)) return;

      submitting = true;
      submitBtn.classList.add('is-loading');
      submitBtn.disabled = true;
      if (submitLabel) submitLabel.textContent = 'Confirming…';
      if (alertBox) alertBox.hidden = true;

      const reference = makeReference();
      const payload = BookingAPI.buildPayload(state, reference);

      try {
        await BookingAPI.submit(payload);
        showReceipt(reference);
        showStep(6, false);
        document.dispatchEvent(new CustomEvent('apex:booked', { detail: payload }));
        $('#booking').scrollIntoView({ behavior: prefersReduced() ? 'auto' : 'smooth', block: 'start' });
      } catch (err) {
        if (alertBox) {
          alertBox.hidden = false;
          alertBox.textContent =
            `We couldn't confirm that booking just now. Please try again, or call us on ${CONFIG.business.phoneDisplay} and we'll book it for you.`;
        }
        console.error('[Apex] Booking submission failed:', err);
      } finally {
        submitting = false;
        submitBtn.classList.remove('is-loading');
        submitBtn.disabled = false;
        if (submitLabel) submitLabel.textContent = 'Confirm Booking';
      }
    };

    const reset = () => {
      form.reset();
      Object.assign(state, {
        service: '', property: '', date: '', time: '',
        name: '', phone: '', email: '', address: '', zip: '', notes: '', consent: false,
      });
      ['service', 'property', 'date', 'time', 'name', 'phone', 'email', 'zip', 'address', 'consent']
        .forEach((n) => setFieldError(n, ''));
      viewMonth = startOfDay(new Date());
      renderCalendar();
      renderSlots();
      refreshSummary();
      showStep(1);
    };

    /* ---------- bindings ---------- */
    on(form, 'change', (e) => {
      const t = e.target;
      if (!t.name) return;
      if (t.type === 'checkbox') state[t.name] = t.checked;
      else if (t.name in state) state[t.name] = t.value;
      if (['service', 'property', 'consent'].includes(t.name)) setFieldError(t.name, '');
      if (t.type === 'radio') {
        $$(`[name="${t.name}"]`, form).forEach((r) => {
          const chip = r.closest('.chip');
          if (chip) chip.classList.toggle('is-checked', r.checked);
        });
      }
      refreshSummary();
    });

    on(form, 'input', (e) => {
      const t = e.target;
      if (t.name && t.name in state && t.type !== 'checkbox') state[t.name] = t.value;
      if (t.name === 'zip') t.value = t.value.replace(/\D/g, '').slice(0, 5);
      const field = t.closest && t.closest('.field');
      if (field && field.classList.contains('is-invalid')) setFieldError(t.name, '');
      refreshSummary();
    });

    on(nextBtn, 'click', () => { if (validateStep(step)) showStep(Math.min(step + 1, TOTAL_INPUT_STEPS)); });
    on(backBtn, 'click', () => showStep(Math.max(1, step - 1)));
    on(form, 'submit', submit);
    on($('[data-booking-reset]'), 'click', reset);

    on($('[data-cal-prev]'), 'click', () => { viewMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1); renderCalendar(); });
    on($('[data-cal-next]'), 'click', () => { viewMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1); renderCalendar(); });

    // Enter should advance rather than submit while on early steps
    on(form, 'keydown', (e) => {
      if (e.key !== 'Enter' || e.target.tagName === 'TEXTAREA') return;
      if (step < TOTAL_INPUT_STEPS) { e.preventDefault(); nextBtn.click(); }
    });

    renderCalendar();
    renderSlots();
    refreshSummary();
    showStep(1, false);

    /* ---------- public surface (used by the AI assistant + service cards) -- */
    return {
      prefill(serviceId) {
        if (!serviceId || !(serviceId in SERVICE_LABELS)) return;
        const input = $(`[name="service"][value="${serviceId}"]`, form);
        if (!input) return;
        input.checked = true;
        input.dispatchEvent(new Event('change', { bubbles: true }));
      },
      goto(n) { showStep(n); },
      scrollIn() {
        const section = $('#booking');
        if (section) section.scrollIntoView({ behavior: prefersReduced() ? 'auto' : 'smooth', block: 'start' });
      },
      get step() { return step; },
    };
  })();

  const initServiceShortcuts = () => {
    $$('[data-service-book]').forEach((btn) => {
      on(btn, 'click', () => {
        Booking.prefill(btn.getAttribute('data-service-book'));
        Booking.goto(2);
        Booking.scrollIn();
      });
    });
  };

  /* ======================================================================
     9. AI PROVIDER ADAPTER
     `provider: 'mock'` runs the rule-based receptionist below.
     `provider: 'api'`  POSTs to CONFIG.ai.endpoint and expects
        { reply: string, quickReplies?: [{label, value, action?}], action?: string }
     Both return the same shape, so the UI never changes.
     ====================================================================== */
  const PESTS = {
    cockroach: { match: /roach|cockroach|palmetto|water\s?bug/i, service: 'cockroach', label: 'cockroaches',
      line: 'Cockroaches are one of the most common calls we get, and they respond very well to gel baiting.' },
    rodent: { match: /rat\b|rats|mice|mouse|rodent|gnaw|scratching in the (wall|attic|ceiling)/i, service: 'rodent', label: 'rodents',
      line: 'Rodents need trapping plus entry-point exclusion — otherwise they come straight back.' },
    termite: { match: /termite|wood\s?damage|mud tube/i, service: 'termite', label: 'termites',
      line: 'Termites are time-sensitive, so we treat those inspections as a priority.' },
    bedbug: { match: /bed\s?bug|bedbug|bites at night|itchy bites/i, service: 'bedbug', label: 'bed bugs',
      line: 'Bed bugs need a full-room treatment and a follow-up visit — DIY sprays usually spread them.' },
    mosquito: { match: /mosquito|mosquitos|mosquitoes/i, service: 'mosquito', label: 'mosquitoes',
      line: 'Mosquito control works best as a yard treatment plus removing standing-water breeding sites.' },
    ant: { match: /\bants?\b|fire ant/i, service: 'general', label: 'ants',
      line: 'Ants are usually a trail-and-nest problem, so we bait the colony rather than just the trail.' },
    spider: { match: /spider|web|widow|recluse/i, service: 'general', label: 'spiders',
      line: 'We clear webbing, treat harbourage points and put a perimeter barrier down.' },
    flea: { match: /flea/i, service: 'general', label: 'fleas',
      line: 'Fleas need the full life cycle treated — adults, eggs and larvae — inside and in the yard.' },
    fly: { match: /\bflies\b|\bfly\b|gnat|fruit fly/i, service: 'general', label: 'flies',
      line: 'Flies almost always trace back to a breeding source, so we find that first.' },
    bee: { match: /bee\b|bees|wasp|hornet|yellow ?jacket|hive|nest/i, service: 'other', label: 'bees or wasps',
      line: 'We relocate honeybees live where we can, and remove the comb so they do not return.' },
  };

  const DEFAULT_QUICK = [
    { label: 'Book an inspection', value: 'I would like to book an inspection' },
    { label: 'Get a quote', value: 'How much does it cost?' },
    { label: 'I have a pest problem', value: 'I have a pest problem' },
    { label: 'Talk to a human', value: 'I want to talk to a human' },
  ];

  const AIProvider = (() => {
    const ctx = { pest: null, zip: null, stage: 'greeting', asked: 0 };

    const bookQuick = (service) => ([
      { label: 'Book inspection', value: 'Yes, book the inspection', action: 'book', service, primary: true },
      { label: 'Get a quote', value: 'How much does it cost?' },
      { label: 'Talk to a human', value: 'I want to talk to a human' },
    ]);

    const detectPest = (text) => {
      for (const [key, def] of Object.entries(PESTS)) if (def.match.test(text)) return { key, ...def };
      return null;
    };

    const askZip = (prefix) => {
      ctx.stage = 'awaiting_zip';
      return {
        text: `${prefix} What ZIP code are you located in?`,
        quick: [{ label: 'Talk to a human', value: 'I want to talk to a human' }],
      };
    };

    const offerBooking = () => {
      ctx.stage = 'offered_booking';
      const service = ctx.pest ? PESTS[ctx.pest].service : 'general';
      return {
        text: 'Thanks. We service that area. Would you like to book a free inspection?',
        quick: bookQuick(service),
      };
    };

    /* ---------- the rule-based receptionist ---------- */
    const mockReply = (raw) => {
      const text = raw.trim();
      const t = text.toLowerCase();
      ctx.asked++;

      const zipMatch = text.match(/\b\d{5}\b/);

      // Human handoff always wins
      if (/human|person|agent|representative|real (person|someone)|speak to someone|call me/i.test(t)) {
        ctx.stage = 'human';
        return {
          text: `Of course — you can reach the team directly on <strong>${CONFIG.business.phoneDisplay}</strong>, 24 hours a day. ` +
                `If you'd rather we call you, book an inspection and a coordinator will confirm by phone within the hour.`,
          quick: [
            { label: 'Call now', value: '', action: 'call', primary: true },
            { label: 'Book inspection instead', value: 'Book an inspection', action: 'book', service: ctx.pest ? PESTS[ctx.pest].service : 'general' },
          ],
        };
      }

      // ZIP handling
      if (zipMatch) {
        ctx.zip = zipMatch[0];
        if (inServiceArea(ctx.zip)) return offerBooking();
        ctx.stage = 'out_of_area';
        return {
          text: `We're mainly covering Greater Houston right now, and ${ctx.zip} sits outside our standard routes. ` +
                `Call <strong>${CONFIG.business.phoneDisplay}</strong> and we'll check whether a technician covers your street — we often can.`,
          quick: [{ label: 'Call now', value: '', action: 'call', primary: true }, { label: 'Start over', value: 'Hello' }],
        };
      }

      if (ctx.stage === 'awaiting_zip' && /^\d{1,4}$/.test(t)) {
        return { text: 'That looks like a partial ZIP — could you give me all five digits?', quick: [] };
      }

      // Confirming a booking we already offered — must be checked before the
      // generic booking intent, otherwise "yes, book it" just re-offers.
      const confirmBooking = () => {
        ctx.stage = 'booking';
        return {
          text: "Great — I've opened the booking form and pre-selected your service. Pick a date and time and you're done.",
          quick: [],
          action: 'book',
          service: ctx.pest ? PESTS[ctx.pest].service : 'general',
        };
      };

      if (ctx.stage === 'offered_booking' &&
          /^(yes|yeah|yep|yes please|sure|ok|okay|please|please do|go ahead|book it|do it|lets do it|let's do it)\b/i.test(t)) {
        return confirmBooking();
      }

      // Booking intent
      if (/book|appointment|schedule|inspection|come out|visit/i.test(t) && !/how much|price|cost/i.test(t)) {
        if (!ctx.zip) return askZip("Happy to get that booked.");
        if (ctx.stage === 'offered_booking' || ctx.stage === 'booking') return confirmBooking();
        return offerBooking();
      }

      // Pricing
      if (/how much|price|pricing|cost|quote|estimate|charge|fee/i.test(t)) {
        return {
          text: 'The inspection and written treatment plan are always <strong>free</strong>. Pricing after that depends on the pest, ' +
                'the size of the property and whether you want a one-off treatment or an ongoing plan — your technician gives you a fixed number before any work starts.',
          quick: ctx.zip ? bookQuick(ctx.pest ? PESTS[ctx.pest].service : 'general')
                         : [{ label: 'Book free inspection', value: 'Book an inspection', action: 'book', primary: true },
                            { label: 'What pests do you treat?', value: 'What pests do you treat?' }],
        };
      }

      // Safety
      if (/\b(safe|safety|pets?|dogs?|cats?|children|child|kids?|baby|toxic|chemicals?|pregnant|allerg\w*)\b/i.test(t)) {
        return {
          text: 'Yes — we use low-toxicity, precisely targeted products applied by licensed technicians. ' +
                'Most treatments are safe to return to once surfaces are dry, and your technician gives you exact re-entry times for pets and children before they leave.',
          quick: [{ label: 'Book inspection', value: 'Book an inspection', action: 'book', primary: true },
                  { label: 'I have a pest problem', value: 'I have a pest problem' }],
        };
      }

      // Urgency / hours
      if (/emergency|urgent|asap|right now|tonight|today|tomorrow|how (soon|fast|quick)|same day/i.test(t)) {
        return {
          text: 'Most inspections go out same-day or next-day, and the support line is staffed 24/7 for active infestations. ' +
                `If it's urgent, call <strong>${CONFIG.business.phoneDisplay}</strong> and we'll prioritise you.`,
          quick: [{ label: 'Call now', value: '', action: 'call', primary: true },
                  { label: 'Book earliest slot', value: 'Book an inspection', action: 'book' }],
        };
      }

      if (/hours|open|closed|weekend|saturday|sunday/i.test(t)) {
        return {
          text: 'We run Monday–Friday 7am–7pm and Saturday 8am–4pm, with the emergency line open 24/7. Sundays are reserved for emergency call-outs only.',
          quick: [{ label: 'Book inspection', value: 'Book an inspection', action: 'book', primary: true }],
        };
      }

      // Service area
      if (/area|cover|service (area|my)|where are you|do you come to|located/i.test(t)) {
        return askZip('We cover Houston, Katy, Sugar Land, Pearland, The Woodlands, Cypress, Spring and the surrounding suburbs.');
      }

      // Pest identification
      const pest = detectPest(t);
      if (pest) {
        ctx.pest = pest.key;
        if (!ctx.zip) return askZip(`I can help with that. ${pest.line}`);
        return offerBooking();
      }

      if (/pest problem|infestation|problem|issue|consultation|consult|advice|\bhelp\b/i.test(t)) {
        ctx.stage = 'identify_pest';
        return {
          text: "I can help with that. What are you seeing — roaches, rodents, termites, bed bugs, ants, spiders, fleas, mosquitoes or something else?",
          quick: [
            { label: 'Roaches', value: 'I have roaches' },
            { label: 'Rodents', value: 'I have rodents' },
            { label: 'Termites', value: 'I think I have termites' },
            { label: 'Bed bugs', value: 'I have bed bugs' },
          ],
        };
      }

      if (/what pests|which pests|services|what do you (do|treat|offer)/i.test(t)) {
        return {
          text: 'We treat cockroaches, rodents, termites, bed bugs, mosquitoes, ants, spiders, fleas, flies, bees and wasps — ' +
                'for homes, apartments, offices and commercial properties.',
          quick: [{ label: 'Book inspection', value: 'Book an inspection', action: 'book', primary: true },
                  { label: 'Get a quote', value: 'How much does it cost?' }],
        };
      }

      if (/^(hi|hey|hello|good (morning|afternoon|evening)|yo)\b/i.test(t)) {
        return { text: 'Hi! How can I help you today?', quick: DEFAULT_QUICK.slice() };
      }

      if (/thank|thanks|cheers|appreciate/i.test(t)) {
        return {
          text: "You're welcome. Anything else I can sort out before you go?",
          quick: [{ label: 'Book inspection', value: 'Book an inspection', action: 'book', primary: true },
                  { label: "No, that's all", value: 'No thanks' }],
        };
      }

      if (/^(no|nope|nothing|that.s all)\b/i.test(t)) {
        return { text: `Perfect. We're here 24/7 on ${CONFIG.business.phoneDisplay} whenever you need us.`, quick: [] };
      }

      // Fallback — stays useful instead of apologising
      return {
        text: "I want to make sure I get this right. Tell me which pest you're dealing with and your ZIP code, " +
              "and I'll check availability — or I can put you straight through to the team.",
        quick: [
          { label: 'I have a pest problem', value: 'I have a pest problem' },
          { label: 'Book an inspection', value: 'Book an inspection', action: 'book' },
          { label: 'Talk to a human', value: 'I want to talk to a human' },
        ],
      };
    };

    return {
      reset() { ctx.pest = null; ctx.zip = null; ctx.stage = 'greeting'; ctx.asked = 0; },
      get context() { return { ...ctx }; },

      async reply(text, history) {
        if (CONFIG.ai.provider === 'api' && CONFIG.ai.endpoint) {
          const res = await fetch(CONFIG.ai.endpoint, {
            method: 'POST',
            headers: CONFIG.ai.headers,
            body: JSON.stringify({
              messages: [{ role: 'system', content: CONFIG.ai.systemPrompt }, ...history],
              context: { ...ctx },
            }),
          });
          if (!res.ok) throw new Error(`Assistant error ${res.status}`);
          const data = await res.json();
          return {
            text: data.reply || '',
            quick: data.quickReplies || [],
            action: data.action,
            service: data.service,
          };
        }
        await wait(rand(CONFIG.ai.typingSpeed[0], CONFIG.ai.typingSpeed[1]));
        return mockReply(text);
      },
    };
  })();

  /* ======================================================================
     10. AI ASSISTANT UI — docking, speech, message rendering
     ====================================================================== */
  const Assistant = (() => {
    const el = $('[data-ai]');
    const dock = $('#ai-dock');
    const fab = $('[data-ai-fab]');
    if (!el) return { open() {} };

    const log = $('[data-ai-log]', el);
    const quickWrap = $('[data-ai-quick]', el);
    const typing = $('[data-ai-typing]', el);
    const form = $('[data-ai-form]', el);
    const input = $('[data-ai-input]', el) || $('.ai__input', el);
    const micBtn = $('[data-ai-mic]', el);
    const ttsBtn = $('[data-ai-tts]', el);
    const minBtn = $('[data-ai-minimise]', el);
    const hint = $('[data-ai-hint]', el);

    const desktop = window.matchMedia('(min-width: 1080px)');
    const history = [];

    let userClosed = false;          // set only when the visitor minimises it
    let floating = false;            // shown as an overlay rather than docked
    let heroVisible = true;
    let greeted = false;
    let busy = false;
    let ttsOn = false;

    /* ---------- rendering ---------- */
    const scrollLog = () => { log.scrollTop = log.scrollHeight; };

    const addMessage = (role, html) => {
      const div = document.createElement('div');
      div.className = `msg msg--${role}`;
      div.innerHTML = html;
      log.appendChild(div);
      scrollLog();
      return div;
    };

    const addSystem = (text) => addMessage('system', escapeHtml(text));

    const setQuick = (items) => {
      quickWrap.innerHTML = '';
      (items || []).forEach((item, i) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'qr' + (item.primary ? ' qr--primary' : '');
        btn.textContent = item.label;
        btn.style.animationDelay = `${i * 50}ms`;
        on(btn, 'click', () => {
          quickWrap.innerHTML = '';
          if (item.action === 'call') { window.location.href = `tel:${CONFIG.business.phone}`; return; }
          if (item.action === 'book' && !item.value) { handoffToBooking(item.service); return; }
          send(item.value || item.label);
        });
        quickWrap.appendChild(btn);
      });
    };

    const showTyping = (show) => {
      typing.hidden = !show;
      if (show) scrollLog();
    };

    /* ---------- speech ---------- */
    const speak = (html) => {
      if (!ttsOn || !('speechSynthesis' in window)) return;
      const text = html.replace(/<[^>]+>/g, '');
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = CONFIG.ai.speech.lang;
      utter.rate = 1.02;
      utter.pitch = 1;
      window.speechSynthesis.speak(utter);
    };

    const initSpeechInput = () => {
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SR || !CONFIG.ai.speech.enabled) {
        if (micBtn) micBtn.hidden = true;
        return;
      }
      const recog = new SR();
      recog.lang = CONFIG.ai.speech.lang;
      recog.interimResults = true;
      recog.continuous = false;
      let listening = false;
      let finalText = '';

      recog.onstart = () => {
        listening = true;
        finalText = '';
        micBtn.classList.add('is-listening');
        micBtn.setAttribute('aria-label', 'Stop listening');
        if (hint) hint.textContent = 'Listening… speak now.';
      };
      recog.onresult = (e) => {
        let interim = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const chunk = e.results[i][0].transcript;
          if (e.results[i].isFinal) finalText += chunk;
          else interim += chunk;
        }
        input.value = (finalText + interim).trim();
      };
      recog.onerror = () => {
        if (hint) hint.textContent = "I couldn't hear that — try again, or type your question.";
      };
      recog.onend = () => {
        listening = false;
        micBtn.classList.remove('is-listening');
        micBtn.setAttribute('aria-label', 'Talk to us');
        if (hint) hint.textContent = 'Press the mic to talk to us — or ask anything about pests, pricing or scheduling.';
        const said = input.value.trim();
        if (said) { input.value = ''; send(said); }
      };

      on(micBtn, 'click', () => {
        if (listening) { recog.stop(); return; }
        try { recog.start(); } catch (_) { /* already started */ }
      });
    };

    /* ---------- conversation ---------- */
    const handoffToBooking = (service) => {
      Booking.prefill(service || 'general');
      Booking.goto(service ? 2 : 1);
      Booking.scrollIn();
      addSystem('Booking form opened below');
      if (!desktop.matches) closeAssistant();
    };

    const send = async (text) => {
      if (!text || busy) return;
      busy = true;
      addMessage('user', escapeHtml(text));
      history.push({ role: 'user', content: text });
      setQuick([]);
      showTyping(true);

      try {
        const res = await AIProvider.reply(text, history.slice(-10));
        showTyping(false);
        const bodyHtml = sanitizeRich(res.text || "Sorry — I didn't catch that.");
        addMessage('bot', bodyHtml);
        history.push({ role: 'assistant', content: bodyHtml.replace(/<[^>]+>/g, '') });
        setQuick(res.quick);
        speak(bodyHtml);

        if (res.action === 'book') setTimeout(() => handoffToBooking(res.service), 700);
      } catch (err) {
        showTyping(false);
        addMessage('bot',
          `I'm having trouble reaching the assistant right now. Call <strong>${CONFIG.business.phoneDisplay}</strong> ` +
          `and a coordinator will help you straight away.`);
        setQuick([{ label: 'Call now', value: '', action: 'call', primary: true }]);
        console.error('[Apex] Assistant error:', err);
      } finally {
        busy = false;
      }
    };

    const greet = () => {
      if (greeted) return;
      greeted = true;
      addMessage('bot', 'Hi! How can I help you today?');
      setQuick(DEFAULT_QUICK.slice());
    };

    /* ---------- placement ----------
       Desktop: docked inside the hero while the hero is on screen, otherwise
       collapsed to the launcher. Mobile: launcher only, opening a bottom sheet.
       The same DOM node is reparented so conversation state is never lost. */
    const render = () => {
      const canDock = desktop.matches && heroVisible && !userClosed && !floating;
      const showOverlay = floating && !userClosed;

      if (canDock) {
        if (el.parentElement !== dock) dock.appendChild(el);
        el.classList.remove('is-floating');
        el.hidden = false;
      } else if (showOverlay) {
        if (el.parentElement !== document.body) document.body.appendChild(el);
        el.classList.add('is-floating');
        el.hidden = false;
      } else {
        el.hidden = true;
      }

      if (fab) fab.hidden = !el.hidden;
      if (!el.hidden) greet();
    };

    const openAssistant = () => {
      userClosed = false;
      floating = !(desktop.matches && heroVisible);
      render();
      setTimeout(() => { if (input) input.focus({ preventScroll: true }); }, 260);
    };

    const closeAssistant = () => {
      userClosed = true;
      floating = false;
      render();
    };

    /* ---------- bindings ---------- */
    on(form, 'submit', (e) => {
      e.preventDefault();
      const value = input.value.trim();
      if (!value) return;
      input.value = '';
      send(value);
    });

    on(minBtn, 'click', closeAssistant);
    on(fab, 'click', openAssistant);

    on(ttsBtn, 'click', () => {
      ttsOn = !ttsOn;
      ttsBtn.setAttribute('aria-pressed', String(ttsOn));
      ttsBtn.setAttribute('aria-label', ttsOn ? 'Disable voice replies' : 'Enable voice replies');
      if (!ttsOn && 'speechSynthesis' in window) window.speechSynthesis.cancel();
      addSystem(ttsOn ? 'Voice replies on' : 'Voice replies off');
    });

    if (!('speechSynthesis' in window) && ttsBtn) ttsBtn.hidden = true;

    // Buttons elsewhere on the page that open the assistant with intent
    $$('[data-ai-open]').forEach((btn) => {
      on(btn, 'click', () => {
        const intent = btn.getAttribute('data-ai-intent');
        openAssistant();
        const seed = {
          consultation: 'I would like a consultation',
          pest: 'I have a pest problem',
          human: 'I want to talk to a human',
          quote: 'How much does it cost?',
        }[intent];
        if (seed) setTimeout(() => send(seed), 420);
      });
    });

    on(document, 'keydown', (e) => {
      if (e.key === 'Escape' && el.classList.contains('is-floating') && !el.hidden) closeAssistant();
    });

    // Dock/undock as the hero enters and leaves the viewport
    const hero = $('.hero');
    if (hero && 'IntersectionObserver' in window) {
      new IntersectionObserver((entries) => {
        heroVisible = entries[0].isIntersecting;
        // Returning to the hero re-docks an overlay instead of stacking both.
        if (heroVisible && floating && desktop.matches) floating = false;
        render();
      }, { threshold: 0.18 }).observe(hero);
    }

    on(desktop, 'change', () => { floating = false; render(); });

    initSpeechInput();
    render();

    return { open: openAssistant, close: closeAssistant, send };
  })();

  /* ======================================================================
     11. LEAD CAPTURE (footer) — same adapter pattern as booking
     ====================================================================== */
  const LeadAPI = {
    async submit(payload) {
      const { provider, endpoint } = CONFIG.lead;
      if (provider === 'webhook' && endpoint) {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(`Lead capture failed with status ${res.status}`);
        return res.json().catch(() => ({ ok: true }));
      }
      await wait(rand(600, 1000));
      return { ok: true, mock: true };
    },
  };

  const initLeadForm = () => {
    const form = $('[data-lead-form]');
    if (!form) return;
    const input = $('input[name="email"]', form);
    const btn = $('button[type="submit"]', form);
    const label = $('[data-lead-label]', form);
    const msg = $('[data-lead-msg]', form);
    let sending = false;

    on(form, 'submit', async (e) => {
      e.preventDefault();
      if (sending) return;

      const email = input.value.trim();
      if (!isValidEmail(email)) {
        input.classList.add('is-invalid');
        msg.textContent = 'Please enter a valid email address.';
        msg.classList.add('is-error');
        input.focus();
        return;
      }

      input.classList.remove('is-invalid');
      msg.classList.remove('is-error');
      msg.textContent = '';
      sending = true;
      btn.classList.add('is-loading');
      if (label) label.textContent = '';

      try {
        await LeadAPI.submit({ email, source: 'footer-subscribe', submittedAt: new Date().toISOString() });
        form.reset();
        msg.textContent = "You're on the list — seasonal pest alerts and prevention tips, nothing else.";
      } catch (err) {
        msg.textContent = `Something went wrong. Email us at ${CONFIG.business.email} instead.`;
        msg.classList.add('is-error');
        console.error('[Apex] Lead capture failed:', err);
      } finally {
        sending = false;
        btn.classList.remove('is-loading');
        if (label) label.textContent = 'Join';
      }
    });

    on(input, 'input', () => {
      input.classList.remove('is-invalid');
      msg.classList.remove('is-error');
    });
  };

  /* ======================================================================
     12. MISC
     ====================================================================== */
  const initMisc = () => {
    const year = $('[data-year]');
    if (year) year.textContent = new Date().getFullYear();

    // Smooth scroll with header offset for same-page anchors
    $$('a[href^="#"]').forEach((link) => {
      on(link, 'click', (e) => {
        const id = link.getAttribute('href');
        if (!id || id === '#' || id.length < 2) return;
        const target = document.getElementById(id.slice(1));
        if (!target) return;
        e.preventDefault();
        target.scrollIntoView({ behavior: prefersReduced() ? 'auto' : 'smooth', block: 'start' });
        if (history.pushState) history.pushState(null, '', id);
      });
    });
  };

  /* ======================================================================
     13. BOOT
     ====================================================================== */
  const boot = () => {
    initHeader();
    initDrawer();
    initScrollSpy();
    initReveal();
    initCounters();
    initAccordion();
    initCarousel();
    initPhotoSwap();
    initServiceShortcuts();
    initLeadForm();
    initMisc();

    // Expose a tiny surface for future integrations / analytics.
    window.Apex = {
      config: CONFIG,
      booking: Booking,
      assistant: Assistant,
      version: '1.0.0',
    };
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
