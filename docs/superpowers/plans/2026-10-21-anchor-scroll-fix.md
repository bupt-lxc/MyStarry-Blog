# Same-page anchor animation repair

## Root cause

Capability and TOC clicks previously invoked Astro navigation before starting Motion. Astro performs native fragment navigation, including browser hash scrolling and a popstate event. Restoring the captured position and exempting the event until the navigation promise settles cannot control deferred browser scrolling or event timing. A native jump can therefore compete with or cancel Motion. Back-to-top already uses the direct controller and does not enter that path.

## Architecture and intentional URL behavior

Ordinary same-page anchor clicks now prevent native navigation and call the same scroll controller as back-to-top. The destination includes the target's scroll margin; focus moves with preventScroll only after completion. New clicks replace the active animation, and user input, history events, resize, page preparation, and disposal cancel it.

An enhanced same-page click intentionally does not update the fragment URL or add a history entry. Real href attributes stay intact for copying links, opening new tabs, and JavaScript fallback. Cross-page links, initial deep links, and browser history retain Astro/browser handling. No private router history manipulation or timing exemption is used.

This repair supersedes the Astro navigate/restore architecture for ordinary same-page clicks in `2026-10-21-eased-scroll-design.md` and `2026-10-21-eased-scroll.md`. The existing easing, duration, reduced-motion behavior, bounds, focus handling, and toolbar styling remain unchanged.

## Regression verification

The new delegated capability regression was run against the old implementation first. It failed because the navigation callback was invoked once when zero calls were expected. The updated regression asserts immediate Motion startup from the current position, no native position jump, unchanged href and location, and no history writes.

The focused suite also exercises all three capability targets and a TOC target, repeated clicks while the URL already contains that target, new-click replacement, cancellation without late writes or focus, back-to-top replacement, native-link exclusions, and reduced motion. Verification commands: `pnpm exec tsx --test tests/scroll-navigation.test.ts`, `pnpm test`, `python -m unittest discover -s tests -p 'test_*.py'`, `pnpm check`, `pnpm build`, and `python scripts/validate-project-output.py`.

Browser verification and production publication are owned by the parent task after code review.
