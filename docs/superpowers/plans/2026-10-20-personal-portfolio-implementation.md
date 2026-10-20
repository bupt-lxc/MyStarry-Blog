# MyStarry-Blog Implementation Plan

> **For agentic workers:** Use subagent-driven-development and dispatching-parallel-agents for the independently owned content, profile UI and guestbook tasks. Review spec compliance before code quality; execute continuously under the user's explicit instruction to plan and begin implementation.

**Goal:** Implement the approved Chinese personal homepage, separate portfolio and persistent guestbook, then replace only this website's deployment on public port 8550.

**Architecture:** Preserve existing Astro components, yellow/Neon appearance and animation. Pre-render profile/projects/blog/travel, run existing guestbook through the official Node adapter with local SQLite, and place all routes behind this project's isolated Nginx service. Material source of truth is resume v2 plus supplied portfolio narrative/images.

**Tech Stack:** Astro 7, existing Solid/Svelte islands and UnoCSS, Astro content collections, PhotoSwipe, Drizzle/libSQL, Node 24, Node test runner via tsx, Docker Compose and Nginx.

## Task 0 — Preserve baseline and establish interfaces

- [x] Verify current `pnpm build`; record existing server container IDs and Nginx configuration hash.
- [x] Create `codex/personal-portfolio` in the current checkout and commit only the already deployed baseline. Keep root `.env` and `.deploy` ignored.
- [x] Add official Node adapter, PhotoSwipe and test runtime; controller exclusively owns `package.json`, `pnpm-lock.yaml`, `astro.config.mjs`, `.env.example` and `deployment/`.

Shared interfaces remain stable: `Layout.astro` and `BasicLayout.astro` accept `title`, `description`, existing blog/travel props and hide flags. Preserve `SITE.author.fullName`, `shortName`, `jobTitle`, `twitterHandle`, `SITE.links.github/linkedin/dribbble/behance/email`, `SITE.location.countryName/countryCode/timezone` for compatibility, while actual public links show only the user's accounts. Add `SITE.links.bilibili`, `SITE.links.phone`, `SITE.education`, `SITE.internships` and `SITE.skills` as needed by profile UI. Guestbook owns its own server configuration, not shared SITE fields.

## Task 1 — Canonical project content and Markdown pages

**Ownership:** `src/content.config.ts`, `src/data/projects/`, `src/assets/projects/`, `src/pages/projects/`, `src/pages/design-works.astro`, `src/pages/blog/`, `src/pages/rss.xml.js`, `src/components/projects/`, `src/layouts/ProjectLayout.astro`, `src/lib/projects.*`, `docs/source-materials/portfolio/`, `tests/projects.test.*`, `scripts/validate-projects.*`.

- [x] Copy the original Markdown and all 11 images from workspace `作品集整理/` to the repository source-material directory. Preserve originals and correct facts in website content.
- [x] Add a schema and validation test before implementation. Run `pnpm exec tsx --test tests/projects.test.ts`, first observe missing-module/schema failures, then implement validation.

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { validateProjectRecords } from '../src/lib/projects.ts';
test('reject duplicate slugs', () => {
  assert.throws(() => validateProjectRecords([{ slug: 'same' }, { slug: 'same' }]));
});
```

- [x] Use eight source project groups, preserving their order. AISHPerf contains separate evaluation/recommendation sections. Use v2: POMP 170+/4500+, Xinhua 97%, Huaxiaobo 11 venues/6000+, China Telecom ending 2026.10; dates and all other numbers follow the approved spec.
- [x] Give each project metadata: title, summary, context, role, dates, tags, outcomes, order, optional cover/repo/demo; slug is stable and unique. Validate referenced images before build, block duplicate or invalid records.
- [x] Build `/projects/` using one horizontal screenshot/text card per desktop row, stacked on mobile, with independent detail/source/demo links and no nested anchors.
- [x] Build `/projects/[slug]/` from existing Astro Markdown `render()` and common layouts, with heading TOC, PhotoSwipe image enlargement, code/table overflow and return navigation. No fake screenshots or invented outcomes.
- [x] Redirect `/design-works/` to `/projects/`; make blog index read existing collection, show Chinese empty state, localize blog/detail/RSS strings.
- [x] Verify content tests, all eight routes and all image references; commit only owned files.

## Task 2 — Chinese personal homepage, existing appearance and travel

**Ownership:** `src/site-config.ts`, `src/pages/index.astro`, `src/pages/travel.astro`, existing homepage components (except guestbook/projects), `src/layouts/BasicLayout.astro`, `src/layouts/Layout.astro`, `src/lib/appearance.ts`, `src/lib/avatar-sprite.mjs` if needed, `src/lib/travel.*`, `src/style.css`, `src/pages/playground/`, `public/profile-avatar.*`, public identity icons/manifest, `tests/appearance.test.*`, `tests/travel.test.*`.

- [x] Test appearance preference resolution and destination grouping before implementation. Required default: yellow-theme/style-neon/normal border/hidden companion; old-preview migration once, then preserve manual preference across page swaps. China and Taiwan polygons map to the single China destination.
- [x] Localize SITE and replace original identity using the approved GitHub/resume details. Preserve compatibility fields for other tasks; render actual user links only. Download the user's public GitHub avatar locally and remove walking/spinning author character rendering.
- [x] Keep desktop homepage as one-screen personal Bento at 1440×900. Include profile/contacts, three internships, right-side grouped core skills with a keyboard-accessible full-skill dialog, enlarged portfolio navigation tile using existing playground ripple, Beijing clock/blog/guestbook/travel/theme controls. No featured projects or previews.
- [x] Reuse original yellow/Neon switcher and CSS; replace residual red effects with primary variables. Localize default/bootstrap/panel/ARIA labels, use Chinese font fallback and reduced-motion support, avoid default-theme flash.
- [x] Map travel destinations to China (including Taiwan), France, Germany, Luxembourg and Belgium with Chinese labels and Asia/Shanghai date/time formatting.
- [x] Replace Playground public entry with redirect, remove public demo pages while retaining modules used by the ripple. Remove author's personal navigation, social data, status, favicons and star hint from rendered public UI; retain license attribution in docs.
- [x] Verify preference and travel behavior tests, frontend type check and desktop/mobile rendering; commit only owned files.

## Task 3 — Restore guestbook with SQLite, limits and admin deletion

**Ownership:** `src/lib/db.ts`, `src/lib/guestbook*.ts`, `src/lib/server/`, `src/pages/guestbook.astro`, `src/pages/admin/`, `src/pages/api/`, `src/components/guestbook/`, `tests/guestbook*.test.*`, `scripts/backup-guestbook.*`. Do not edit shared layout/config/package files.

- [x] Write real temporary-file SQLite behavior tests, then observe their failure before implementing the service. Test validation, persistence after reopening, 60s/hourly submission limits, 30/minute reactions, duplicate visitor reactions and cascading deletion.

```ts
test('a submitted message survives reopening the database', async () => {
  const first = await openGuestbook(tempFile, options);
  await first.create({ name: '访客', message: '你好' }, 'source-a');
  await first.close();
  const reopened = await openGuestbook(tempFile, options);
  assert.equal((await reopened.list(1)).total, 1);
  await reopened.close();
});
```

- [x] Restore reusable upstream form/card/pagination/heart behavior and Drizzle/libSQL schema. File URL `/data/guestbook.db` comes from server env; schema initialization is idempotent. Avoid Netlify cache and top-level database I/O during static prerender.
- [x] GET `/api/guestbook?page=1` returns `{ entries, total, page, totalPages }`; POST accepts `{ name, message, website?, parentId? }` and returns created entry immediately with 201. Validate trimmed name 1–32, message 1–1000 and optional HTTP(S) URL <=200; use pure text rendering.
- [x] Persist source-HMAC based write limits (1/60s and 10/hour), reactions (30/minute) and server-side per-visitor reaction uniqueness. Return 429 + Retry-After without clearing form. Trust only a dedicated source header overwritten by the isolated Nginx; Node has no public port.
- [x] Add replies within existing schema, localize date/UI errors, keep latest-first ten-item pagination. DB failure gives controlled 503 and leaves static pages usable.
- [x] Admin login uses `GUESTBOOK_ADMIN_PASSWORD`, constant-time credential comparison, built-in Astro session with 30-minute expiry, HttpOnly/SameSite cookie and Secure on HTTPS. Store sessions persistently, never ship secrets to browser. Five failed logins/15min/source, same-origin checks for all admin mutations, no admin nav/sitemap entry.
- [x] Authenticated DELETE `/api/admin/guestbook/:id` removes target and its replies transactionally, returns 404 for missing target; unauthorized requests return 401/403. Logout invalidates session. UI confirms deletion and refreshes count.
- [x] Add SQLite-consistent backup command, verify isolated reopen/restore tests, auth/session expiration/origin-spoof checks; commit only owned files.

## Task 4 — Controller integration and deployment

- [x] Configure `@astrojs/node` standalone adapter, `output: server`, static prerender on public content pages and persistent built-in sessions; remove obsolete Netlify adapter/cache dependencies when no imports remain.
- [x] Run all `pnpm test`, content validation, `pnpm check`, `pnpm build` in order; address failing behavior in its owning module. Keep tests aimed at actual behavior rather than source snapshots.
- [x] Create a Linux runtime image using local Docker (available Linux engine), production dependencies and Node 24. Build locally with bounded resources, run smoke tests and persistent-volume restart checks before upload.
- [x] Update only the website Compose project: Nginx 64 MiB on public 8550, internal Node 192 MiB with no published port, `/data` bind mount, restart/health/log limits. Static content is served directly; `/guestbook`, `/admin`, `/api` go to internal app. Overwrite upstream source/protocol headers and keep unknown routes 404.
- [x] Generate independent admin/rate-limit secrets into ignored local and server environment files without printing them. Record admin login instructions in a local ignored file; no credentials in Git, source assets, console output or deployment archive.
- [x] Capture existing container/start-time and original Nginx checksum baseline. Upload versioned build/image/config, validate new Nginx config, replace only this website's service, and preserve old release plus database backup.
- [x] Verify public 8550 pages, API status/headers, immediate submission, reply/reaction, login/deletion/logout, persistence across app restart, no public Node port and no effect on existing applications. Clean only acceptance-test messages via authenticated deletion.
- [x] Browser-check 1440×900 homepage, 390px mobile, all routes, theme persistence, avatar removal, Chinese text, gallery keyboard controls and guestbook; save actual deployed screenshots.

## Task 5 — Two-stage review, fixes and handoff

- [x] Dispatch fresh spec reviewer after implementation; resolve every missing approved requirement.
- [x] Dispatch fresh code-quality/security reviewer after spec review passes; fix correctness, authorization, storage and deployment risks and repeat affected checks.
- [x] Update `deployment/README.md` and `STATUS.md`, mark this plan complete, commit remaining related changes and verify clean status/secret exclusion. Do not force-push or create a PR unless needed/requested.
- [x] Report public URL, test evidence, admin credential-file location and any material limitation. Keep the local feature branch and checkout for further iteration; no remote push or merge was requested.
