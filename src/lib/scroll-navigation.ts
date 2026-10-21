import { animate } from "motion";
import { prefersReducedMotion } from "./motion-gate";

type Position = { x: number; y: number };
type AnimationOptions = {
  duration: number;
  ease: [number, number, number, number];
  update: (value: number) => void;
  complete: () => void;
};
type ScrollAdapter = {
  read: () => Position;
  write: (position: Position) => void;
  maximum: () => number;
  reducedMotion: () => boolean;
  animate: (
    from: number,
    to: number,
    options: AnimationOptions,
  ) => { stop: () => void };
};

export function scrollDuration(distance: number): number {
  return Math.min(1000, 450 + Math.abs(distance) * 0.18);
}

const browserAdapter: ScrollAdapter = {
  read: () => ({ x: window.scrollX, y: window.scrollY }),
  write: ({ x, y }) =>
    window.scrollTo({ left: x, top: y, behavior: "instant" }),
  maximum: () =>
    Math.max(0, document.documentElement.scrollHeight - window.innerHeight),
  reducedMotion: prefersReducedMotion,
  animate: (from, to, { update, complete, ...options }) =>
    animate(from, to, { ...options, onUpdate: update, onComplete: complete }),
};

export function createScrollController(
  adapter: ScrollAdapter = browserAdapter,
) {
  let generation = 0;
  let animation: { stop: () => void } | undefined;

  function cancel() {
    generation++;
    animation?.stop();
    animation = undefined;
  }

  function scrollTo(destination: number, onComplete?: () => void) {
    cancel();
    const token = generation;
    const start = adapter.read();
    const end = Math.max(0, Math.min(destination, adapter.maximum()));
    const finish = () => {
      if (token !== generation) return;
      // Invalidate duplicate completion or queued onUpdate callbacks as well.
      generation++;
      animation = undefined;
      onComplete?.();
    };
    if (adapter.reducedMotion() || Math.abs(end - start.y) < 1) {
      adapter.write({ x: start.x, y: end });
      finish();
      return;
    }
    animation = adapter.animate(start.y, end, {
      duration: scrollDuration(end - start.y) / 1000,
      ease: [0.65, 0, 0.35, 1],
      update: (y) => {
        if (token === generation) adapter.write({ x: start.x, y });
      },
      complete: finish,
    });
  }

  async function navigateTo(
    navigate: () => Promise<void>,
    destination: () => number,
    onComplete?: () => void,
  ) {
    cancel();
    const token = generation;
    const start = adapter.read();
    await navigate();
    if (token !== generation) return;
    // Astro owns history and performs a synchronous hash jump. Restore before
    // the next paint so only our numeric animation is visible.
    adapter.write(start);
    scrollTo(destination(), onComplete);
  }

  return { cancel, scrollTo, navigateTo };
}

type FragmentLink = Pick<
  HTMLAnchorElement,
  "href" | "getAttribute" | "hasAttribute"
>;

export function resolveFragmentLink(
  link: FragmentLink,
  current: URL,
  findTarget: (id: string) => HTMLElement | null,
): { url: URL; target: HTMLElement } | null {
  if (
    (link.getAttribute("target") && link.getAttribute("target") !== "_self") ||
    link.hasAttribute("download") ||
    link.hasAttribute("data-astro-reload") ||
    link.getAttribute("rel")?.split(/\s+/).includes("external")
  )
    return null;
  try {
    const url = new URL(link.href, current);
    if (
      url.origin !== current.origin ||
      url.pathname !== current.pathname ||
      url.search !== current.search ||
      !url.hash
    )
      return null;
    const target = findTarget(decodeURIComponent(url.hash.slice(1)));
    return target ? { url, target } : null;
  } catch {
    return null;
  }
}

export function focusScrollTarget(target: HTMLElement) {
  if (!target.isConnected) return;
  if (target.tabIndex < 0 && !target.hasAttribute("tabindex")) {
    target.setAttribute("tabindex", "-1");
    target.addEventListener("blur", () => target.removeAttribute("tabindex"), {
      once: true,
    });
  }
  target.focus({ preventScroll: true });
}

/** Bind one page; the layout disposes this scope before Astro navigation. */
export function initScrollNavigation(
  navigate: (href: string) => Promise<void>,
  adapter: ScrollAdapter = browserAdapter,
): () => void {
  const controller = createScrollController(adapter);
  const scope = new AbortController();
  const { signal } = scope;
  document.addEventListener("astro:before-preparation", controller.cancel, {
    signal,
  });
  const button =
    document.querySelector<HTMLButtonElement>("[data-back-to-top]");
  const updateButton = () => {
    if (!button) return;
    const hidden = window.scrollY <= 8;
    button.hidden = hidden;
    button.tabIndex = hidden ? -1 : 0;
  };
  updateButton();
  window.addEventListener("scroll", updateButton, { passive: true, signal });

  document.addEventListener(
    "click",
    (event) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const link =
        event.target instanceof Element
          ? event.target.closest<HTMLAnchorElement>("a[href]")
          : null;
      if (!link) return;
      const fragment = resolveFragmentLink(
        link,
        new URL(window.location.href),
        (id) => document.getElementById(id),
      );
      if (!fragment) return;
      event.preventDefault();
      const { url, target } = fragment;
      void controller
        .navigateTo(
          () => navigate(url.href),
          () =>
            target.getBoundingClientRect().top +
            window.scrollY -
            (parseFloat(getComputedStyle(target).scrollMarginTop) || 0),
          () => focusScrollTarget(target),
        )
        .catch(() => {});
    },
    { capture: true, signal },
  );

  button?.addEventListener(
    "click",
    () => {
      controller.scrollTo(0, () => {
        const target =
          document.querySelector<HTMLElement>("main") ??
          document.querySelector<HTMLElement>("h1");
        if (target) focusScrollTarget(target);
      });
    },
    { signal },
  );

  for (const name of ["wheel", "touchstart", "pointerdown"] as const) {
    window.addEventListener(name, controller.cancel, {
      passive: true,
      capture: true,
      signal,
    });
  }
  const scrollKeys = new Set([
    "ArrowUp",
    "ArrowDown",
    "ArrowLeft",
    "ArrowRight",
    "PageUp",
    "PageDown",
    "Home",
    "End",
    " ",
  ]);
  window.addEventListener(
    "keydown",
    (event) => {
      if (scrollKeys.has(event.key)) controller.cancel();
    },
    { capture: true, signal },
  );
  window.addEventListener("popstate", controller.cancel, { signal });
  window.addEventListener("resize", controller.cancel, { signal });
  return () => {
    controller.cancel();
    scope.abort();
  };
}
