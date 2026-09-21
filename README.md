# Apex Pest Solutions

A marketing site for a local pest control business, built as a reusable template.
Vanilla HTML, CSS and JavaScript — no build step, no framework, no runtime dependencies.

The design goal was a site that looks like a real business hired a studio, not one that
looks generated: an editorial services index rather than a grid of cards, a serif display
face, square corners, asymmetric compositions, and a different structure in every section.

Booking is the primary interaction. Every call to action on the page — header, hero,
services, commercial, footer, the assistant, the mobile bar — opens the same six-step flow,
pre-selecting the service the visitor came from.

---

## Run it

Serve over HTTP rather than opening the file directly; self-hosted fonts need a real origin.

```bash
python3 -m http.server 8000
# → http://localhost:8000
```

Deploy by uploading the repository root to any static host. There is nothing to compile.

---

## Making it yours

Everything the visitor sees comes from one object in **`config.js`**. Nothing
business-specific is written into `index.html` or `script.js`.

Two ways to edit it:

1. **`config.js`** — change `DEFAULTS` and redeploy. Permanent, versioned in git.
2. **⚙ Business Setup** — the link at the very bottom of the footer. Opens a local admin
   panel, applies changes live, and saves to this browser's `localStorage`
   (key `businessConfig.v1`). Export as JSON, import it back, or reset to defaults.

Nothing from that panel is sent anywhere. The only outbound request the site can make is a
booking, and only once you set `booking.provider = 'webhook'` and a `booking.endpoint`.

### What lives in the config

| Group | Drives |
| --- | --- |
| `site` | canonical URL, Open Graph URL, locale, theme colour |
| `business` | name, tagline, phone, email, address, out-of-hours line |
| `hours` | footer table and `openingHoursSpecification` in the structured data |
| `trust` | the promises under the hero |
| `credentials` | licence, insurance, years, memberships — footer line and `foundingDate` |
| `cta` | every button label |
| `booking` | provider, endpoint, lead time, horizon, closed days, arrival windows |
| `services` | services index, footer links, booking step 01, `hasOfferCatalog` |
| `serviceAreas` | the line above the footer and `areaServed` |
| `social` | footer icons and `sameAs` |
| `images` | hero, services panel, process, commercial, social share card |
| `branding` | wordmark, logo image, favicon |
| `about` | the "How we work" heading and body |
| `faq` | the answers section and `FAQPage` structured data |
| `testimonials` | the reviews section — **empty by default** |

### Empty means hidden

Fields that are blank render nothing rather than a stand-in. No licence number is invented,
no review is written for you, no customer count is estimated. Specifically:

- `credentials.*` is blank — the footer legal line does not appear until you fill it in.
- `testimonials` is `[]` — the whole reviews section is absent from the DOM.
- `social.*` is blank — the icon row is hidden.
- `images.og.src` is blank — no `og:image` is advertised, because a share card that points
  at an SVG silently fails on every platform. Put a 1200×630 JPG or PNG there before launch.
- `site.domain` is blank — the canonical URL, Open Graph URL and structured data fall back
  to whatever origin the page is actually served from. **No domain is invented.** Set it
  once you have one:

  ```js
  site: { domain: 'https://www.yourbusiness.com', … }
  ```

There are no statistics anywhere on the page. If you want to claim "12 years in business",
put `12` in `credentials.yearsInBusiness` and it appears in the footer — otherwise nothing
does.

---

## Booking

`booking.provider` picks how a confirmed booking is handled:

| Value | Behaviour |
| --- | --- |
| `local` *(default)* | Resolves in the browser. Nothing is transmitted, and the confirmation screen says so plainly rather than claiming an email was sent. |
| `webhook` | `POST`s JSON to `booking.endpoint`. Network and non-2xx failures surface an inline message with a phone fallback. |
| `url` | Booking buttons open `booking.externalUrl` in a new tab (Calendly, Housecall Pro, …). |

The webhook payload:

```json
{
  "reference": "APE-260922-N9PJ",
  "business": "Apex Pest Solutions",
  "submittedAt": "2026-09-22T09:14:03.201Z",
  "service": "Termites", "serviceId": "termite",
  "property": "Home",
  "address": "1200 Commerce St", "zip": "77002",
  "date": "2026-09-23", "slot": "8:00 – 10:00 am", "slotId": "08-10",
  "name": "Jordan Alvarez", "phone": "(713) 555-0199", "email": "jordan@example.com",
  "notes": ""
}
```

The confirmation email is built from the same config as the page (`buildEmail` in
`script.js`), so the business name, address and phone in it always match the site.

**Availability** is generated in-browser from `leadTimeDays`, `horizonDays`,
`closedWeekdays` and `slots` — deterministic, so the same date always offers the same
windows. Replace `slotOpen()` with a call to your scheduling system when you have one.

**Deep links** both work and pre-select a service:

```
/?service=termite#booking
/#booking?service=termite
```

---

## Assistant

`Ask a question` answers from `config.faq` and the business details — pattern matching over
the configured content, no network call, nothing typed is transmitted. It recognises a
booking intent, a service name, opening hours, service areas and contact requests, and hands
off into the booking flow with the right service selected. Speech input and read-aloud use
the browser's own Web Speech APIs and hide themselves where unsupported. The launcher steps
aside while the booking form is on screen.

To swap in a real model, replace `answer()` in `script.js`; everything else stays.

---

## Files

```
index.html     structure and binding hooks — no business copy
styles.css     design system, layout, components
config.js      businessConfig: defaults, persistence, derived values
script.js      bindings, SEO, content, booking, setup panel, assistant
assets/fonts/  Fraunces (display) + Inter (text), self-hosted, subset, variable
assets/img/demo/  placeholder artwork, labelled as such — replace with photography
```

### How the binding works

`index.html` carries attributes, not content:

| Attribute | Effect |
| --- | --- |
| `data-bind-text="business.phone"` | writes text from that config path |
| `data-bind-href="$.telHref"` | writes an href from a derived value |
| `data-bind-src` / `data-bind-alt` | image source and alt text |
| `data-show` / `data-hide` | hides the element when the value is empty |
| `data-list="trust"` | renders one `<li>` per array entry |
| `data-seo="ogTitle"` | written by the SEO pass |

Paths starting with `$.` are derived, never stored: `telHref`, `mailto`, `canonical`,
`addressLine`, `areasLine`, `cityState`, `seoTitle`, `seoDescription`. Phone numbers become
`tel:` links and emails become `mailto:` links automatically, so there is one place to
change a number.

---

## Accessibility and performance

- Every text/background pair on the page and in every UI state measures at WCAG AA or
  better. The accent exists in three tones because one cannot clear AA on both a paper and a
  petrol ground.
- Semantic landmarks, one `<h1>`, labelled inputs, `role="alert"` validation, focus returned
  on dialog close, Escape closes overlays, visible focus rings, 30px minimum tap targets.
- `prefers-reduced-motion` disables every transition and animation.
- No libraries, no web fonts from a CDN, no tracking. Two variable font files, subset with
  `unicode-range` and preloaded; images lazy-loaded below the fold with explicit dimensions,
  so there is no layout shift.

---

## Before you launch

1. Set `site.domain`.
2. Replace `assets/img/demo/*` with real photography and clear the placeholder labels.
3. Add a 1200×630 raster share card at `images.og.src`.
4. Fill in `credentials` — or leave it blank and claim nothing.
5. Add `testimonials` only with the customers' permission.
6. Point `booking.provider` at a real endpoint.
7. Replace the inline favicon in `index.html` (or set `branding.favicon`).
