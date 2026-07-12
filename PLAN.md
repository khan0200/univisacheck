# Enterprise UI/UX & Business Upgrade Plan — VisaCheck / KoreaVisa

## Where things stand

This is a Korean student-visa consulting agency's toolset: a public marketing site, a free public visa-status checker, and an internal CRM for consultants — built as four independent static HTML pages on Vercel serverless functions + Turso (SQLite) DB. No framework, no build step.

The individual pieces are better-crafted than average vanilla-CSS work (real spacing/elevation scales, dark mode, reduced-motion handling, a thoughtful mobile card-table pattern). The problem is **fragmentation, not craftsmanship**: the product currently looks like three different companies stapled together, plus a handful of trust and correctness gaps that undercut "enterprise" positioning specifically.

Fixed already (this session): a live production database credential was hardcoded and committed to git in `reset-password.js`. It now reads from env vars / gitignored config like the rest of the codebase does. **Action still required from you: rotate the Turso auth token** in the Turso dashboard — the old token remains valid and exposed in git history until you do.

---

## Priority 0 — Trust & correctness (do before any visual work)

These aren't design problems, but they will actively undermine an "enterprise/business" impression no matter how polished the UI becomes.

1. **Rotate the leaked Turso token** (see above) — you own this step.
2. **Fix the broken primary CTA**: `index.html`'s main conversion button links to `https://forms.gle/` — a bare, incomplete URL. This is the single most important link on the homepage and it 404s. Needs a real form ID or an in-house lead form.
3. **Reconcile the brand name**: "KoreaVisa" (public pages) vs. "VisaCheck" (auth/dashboard) — pick one and apply it everywhere (title tags, favicon, footer, emails, Telegram bot messages).
4. **Add legal/trust pages**: Privacy Policy and Terms of Service are currently missing entirely, despite collecting passport numbers, names, and DOBs and charging fees. This is close to a legal requirement in most jurisdictions and is table-stakes for any enterprise-facing product.
5. **Substantiate marketing claims**: "200+ successful students," "90%+ success rate" appear with no source, testimonial, or case study anywhere. Either back these with real names/logos/testimonials or soften the copy.
6. **Fix README drift**: it still describes a Firebase/Firestore architecture; actual stack is Turso + Vercel serverless. Any new engineer or partner reading it gets the wrong mental model.
7. **Remove the stray `git_diff_index.txt`** (175KB garbled dump) from the repo root.

---

## Priority 1 — Unify the design system (the core "make it look enterprise" lever)

**Decision: standardize on the "Quiet Luxury" system** already built for `auth.html`/`cabinet.html`/`style.css`. It's the most mature of the three — real light/dark theming, documented spacing/elevation scales, Montserrat + blue accent, WCAG-aware structure. Rebuild `index.html` and `visa-status.html` on top of it rather than inventing a fourth system.

Concretely:

1. **Extract a shared `style.css`** (and a shared `header.js`/`footer.js` or literal include pattern) — one nav bar, one logo treatment, one footer, one button/card/badge/form component vocabulary, used by all four pages. Kill the ~1,500 lines of duplicated/drifted embedded `<style>` blocks in `index.html` and `visa-status.html`.
2. **One color system, one type scale, one radius/shadow scale** — currently index.html and visa-status.html define near-identical-but-not-identical tokens (`--radius-xl: 24px` vs `28px`, `--nav-h: 64px` vs `60px`). Collapse to a single `:root` token set.
3. **One logo asset** (real SVG/PNG, not text + emoji-derived icon chips) used consistently as `<img>`/`<svg>` across all four pages, plus a proper favicon set (one favicon, not three different treatments including a page with none at all and a page with two conflicting `<link>` tags).
4. **Decide on light-by-default or dark-by-default** and make all four pages support the same toggle. Right now two pages are dark-only with no toggle and two pages are light-default-with-dark-toggle — pick one behavior everywhere.
5. **Replace native browser dialogs** (`confirm()` for delete in `cabinet.html`) with the app's own modal component — a single native `confirm()` popup breaks immersion instantly in an otherwise polished UI.

This is the highest-leverage item on the whole plan: it's what actually reads as "enterprise-grade" vs. "several contractors built four pages independently."

---

## Priority 2 — Language & localization strategy

`index.html` is 100% Uzbek; every other page (status checker, login, dashboard) is 100% English, with no switcher and no warning. For an Uzbek student customer base, this is most jarring exactly where trust matters most (checking visa status, creating an account).

Recommended: pick one of two coherent strategies rather than the current accidental split —
- **(A) Full bilingual site** with an explicit language switcher and both locales covering every page (real i18n — even a simple JSON dictionary + data-i18n attributes would work given there's no framework), or
- **(B) Uzbek-only for customer-facing pages** (`index.html`, `visa-status.html`) since that's the actual customer base, **English reserved for internal tooling** (`auth.html`, `cabinet.html`) since consultants may work across languages — but make this an explicit, documented choice, not silent drift.

Given this is a consulting business serving Uzbek students, (A) is likely worth the investment if you plan to scale; (B) is the pragmatic minimum if resources are tight.

---

## Priority 3 — Business-page completeness

An enterprise consulting service typically needs pages that don't exist yet:
- **Testimonials/case studies page** (backs up the trust-claim numbers from P0).
- **Pricing/services breakdown** beyond the single `$60` mention buried in the document checklist.
- **Contact page** with real contact channels (the Telegram bot integration suggests Telegram is a channel — surface it as a contact option, not just an internal notification pipe).
- **About/team page** — for a consulting service, credibility often comes from visible human consultants, not just a form.

---

## Priority 4 — Forms, validation, and admin UX polish

1. Wire the existing `PASSPORT_REGEX`/`DATE_REGEX` constants in `config.js` into the `cabinet.html` add/edit-student modal — they're defined but not enforced there, so the CRM currently accepts malformed passport numbers/dates that the public checker would reject.
2. Enforce (not just visually suggest) a minimum password strength in `auth.html` — currently the strength meter is cosmetic; anything ≥6 characters passes server-side regardless of strength.
3. Add a **self-service "forgot password" flow** — today password reset is a CLI script requiring direct database/machine access, which doesn't scale past a single admin and isn't viable for a real multi-consultant product.
4. Add Open Graph / Twitter Card meta tags across all pages — currently zero exist, so any link shared via Telegram (already a core channel) or social media shows no preview.

---

## Priority 5 — Performance & technical hygiene (supports, doesn't block, the above)

1. Compress/responsive-size `korea-hero.png` (735KB, no `srcset`/WebP) — direct load-time hit on the first-impression page.
2. Split `app.js` (1,879 lines, ~40 functions, one file) into modules (`auth.js`, `students.js`, `render.js`, `dark-mode.js`, etc.) now that it already loads as `type="module"` — makes future UI work safer and faster to review.
3. Consolidate `config.js`'s environment-detection logic (duplicated independently in `visa-status.html`) into one shared import used everywhere.

---

## Suggested sequencing

1. **Week 1**: P0 items (credential rotation, broken CTA, brand name decision, legal pages skeleton, README fix, remove stray file). These are cheap and remove active liabilities.
2. **Weeks 2–4**: P1 design-system unification — this is the biggest visible jump in perceived quality and should be done as one coherent pass (shared CSS/tokens/header/footer/logo) rather than page-by-page patches, or you'll just create a fourth inconsistent variant.
3. **Week 4–5**: P2 localization decision + implementation, in parallel with P1 since it touches the same templates.
4. **Week 5–6**: P3 business pages (testimonials, pricing, contact, about) — content-heavy, can be drafted while P1/P2 engineering is underway.
5. **Ongoing**: P4 form/admin polish and P5 performance/hygiene, picked up as capacity allows — none of these block the visual relaunch.

---

## What I'd need a decision on before implementing

- Final brand name: **KoreaVisa** or **VisaCheck** (or a new third name)?
- Localization strategy: full bilingual (A) vs. Uzbek-public/English-internal (B)?
- Whether to scrub the leaked credential from git history entirely (`git filter-repo` + force-push + all collaborators re-clone) or rely on rotation alone — rotation is sufficient for security once done, history-scrubbing is only about hygiene/compliance optics.
