# Eased Scroll Implementation Plan

> **For agentic workers:** Use subagent-driven-development for the implementation task, with independent specification review followed by quality review. User authorized direct execution without additional approval questions.

**Goal:** Clicked same-page anchors ease in and out, and a circular back-to-top control appears when scrolled.

**Architecture:** A focused browser module owns cancelable Motion numeric animations and delegated same-page anchor enhancement. An Astro component renders the accessible circular control; BasicLayout owns lifecycle and floating toolbar placement. Astro remains responsible for URL/history navigation.

**Tech Stack:** Existing Astro ClientRouter, TypeScript, Motion, Node test runner/tsx and theme CSS.

**Specification:** `docs/superpowers/specs/2026-10-21-eased-scroll-design.md`.

## Setup — controller

- [ ] Create an isolated worktree and install pinned dependencies. Prefer existing ignored `.worktrees/`; use a short checkout path if Windows path limits recur. Native worktree creation cannot recognize this task's nested repository (verified earlier in this conversation); use Git fallback.
- [ ] Run `pnpm test` for a baseline. Keep `.env`, private SSH helpers and database files outside the worktree and commits. Build using the public URL as a process environment variable.

## Task 1 — scrolling controller and control

**Files:** create `src/lib/scroll-navigation.ts`, `src/components/BackToTop.astro`, `tests/scroll-navigation.test.ts`; modify `src/layouts/BasicLayout.astro`. Shared CSS changes are only allowed if needed to match existing themes; no unrelated changes.

- [ ] Write behavioral tests first. The controller should allow a small injected animation/browser adapter for deterministic tests. Verify duration is bounded and grows with distance, a middle interval travels farther than equal starting/ending intervals, cancellation prevents further writes/focus, restart replaces the previous animation, reduced-motion performs one immediate write and completion, and destinations clamp to the page range. Run focused tests and observe missing functionality fail.

```ts
assert.ok(scrollDuration(100) < scrollDuration(3000));
assert.ok(scrollDuration(10000) <= 1000);
// Drive the real controller through an injected deterministic animation scheduler.
// Record writes and completion; cancellation must suppress stale completion callbacks.
```

- [ ] Implement cancelable animation using existing `motion` numeric `animate` with an ease-in-out curve such as `[0.65, 0, 0.35, 1]`; duration values are seconds at the Motion boundary. Reuse reduced-motion detection. `cancel()` must stop and invalidate the old animation, including late callbacks; handle distance zero and scroll bounds.
- [ ] Enhance valid unmodified same-page anchor clicks. Preserve native hrefs and route handling for all other links. Use Astro public `navigate` to update fragment/history, capture the initial scroll position before its synchronous same-page positioning, restore it before the next frame, and animate to the target's current top minus scroll margin. Preserve scroll X. An intervening input/navigation must invalidate pending async completion as well as running animation. Repeated fragment clicks must still work.
- [ ] Keyboard users land focus on the target when animation completes, using temporary tabindex only where necessary and restoring it on blur. Do not change focus after canceled navigation.
- [ ] Create a 44px round button with upward SVG arrow and `aria-label/title="返回顶部"`. Initially hidden; keep it hidden/nonfocusable at `scrollY <= 8`, visible otherwise. Reuse theme variables for base/Glass/Neon appearance and focus outline, always preserving the circle. Clicking animates to 0, then focuses main content.
- [ ] Put the control above the current style/sound controls. Keep toolbar position and existing controls intact; render back-to-top even when hideSoundToggle hides the other controls. Bind/cleanup on Astro page-load and before-preparation/swap. Cancel on wheel, touch, pointer input, relevant scroll keys, popstate and resize; prevent duplicate listeners across navigation.
- [ ] Run focused and full Node tests, Python tests, Astro check, production build, actual output validator and diff checks. Commit scoped implementation. Report evidence and concerns to controller.

## Task reviews — controller

- [ ] Dispatch independent specification review against the spec and actual files, resolve findings and re-review.
- [ ] Dispatch independent code-quality/final integrated review after spec passes; resolve important findings and re-review.

## Browser and release — controller

- [ ] Inspect desktop and mobile. Verify capability navigation eases to its scroll margin, button absent at top and visible/circular below, click-to-top and focus, repeated clicks/input cancellation, detail TOC and history back, cross-page related links and theme changes. Save screenshot.
- [ ] Run fresh tests/typecheck/build/output gate appropriate to final changes. Mark verified local steps complete.
- [ ] Capture preservation baseline with ignored deployment helpers, merge reviewed branch into master and push; follow actual Actions deployment to success. Verify port8550 routes/commit, guestbook/session rows, existing containers/Nginx/runtime secrets and other public services. Record release receipt outside Git. Clean own worktree where safe, and confirm local master matches origin/master.
