import test from "node:test";
import assert from "node:assert/strict";
import { cubicBezier } from "motion";
import * as navigation from "../src/lib/scroll-navigation.ts";

function harness({ y = 100, reduced = false, maximum = 4000 } = {}) {
  assert.equal(typeof navigation?.createScrollController, "function");
  let position = { x: 37, y };
  const writes: (typeof position)[] = [];
  const animations: {
    from: number;
    to: number;
    duration: number;
    ease: [number, number, number, number];
    update: (value: number) => void;
    complete: () => void;
    stopped: boolean;
  }[] = [];
  const adapter = {
    read: () => position,
    write: (next: { x: number; y: number }) => {
      position = next;
      writes.push(next);
    },
    maximum: () => maximum,
    reducedMotion: () => reduced,
    animate(
      from: number,
      to: number,
      options: Omit<(typeof animations)[number], "from" | "to" | "stopped">,
    ) {
      const animation = { from, to, ...options, stopped: false };
      animations.push(animation);
      return {
        stop: () => {
          animation.stopped = true;
        },
      };
    },
  };
  const controller = navigation!.createScrollController(adapter);
  return {
    controller,
    adapter,
    animations,
    writes,
    position: () => position,
    nativeJump: (y: number) => {
      position = { ...position, y };
    },
  };
}

test("scroll duration grows with distance within 450–1000ms", () => {
  assert.equal(typeof navigation?.scrollDuration, "function");
  assert.ok(navigation!.scrollDuration(100) < navigation!.scrollDuration(3000));
  for (const distance of [0, 1, 100, 3000, 100000]) {
    assert.ok(navigation!.scrollDuration(distance) >= 450);
    assert.ok(navigation!.scrollDuration(distance) <= 1000);
    assert.equal(
      navigation!.scrollDuration(-distance),
      navigation!.scrollDuration(distance),
    );
  }
});

test("real Motion easing moves farther in a middle interval than at either end", () => {
  const { controller, animations, writes } = harness({ y: 0 });
  controller.scrollTo(2000);
  const animation = animations[0];
  const ease = cubicBezier(...animation.ease);
  for (const fraction of [0, 0.2, 0.4, 0.6, 0.8, 1]) {
    animation.update(
      animation.from + (animation.to - animation.from) * ease(fraction),
    );
  }
  const travel = (a: number, b: number) => writes[b].y - writes[a].y;
  assert.ok(travel(2, 3) > travel(0, 1));
  assert.ok(travel(2, 3) > travel(4, 5));
  assert.equal(animation.duration, navigation!.scrollDuration(2000) / 1000);
  assert.ok(writes.every(({ x }) => x === 37));
});

test("cancel stops animation and invalidates late writes and completion", () => {
  const { controller, animations, writes } = harness();
  let completed = 0;
  controller.scrollTo(2000, () => completed++);
  animations[0].update(300);
  controller.cancel();
  animations[0].update(1800);
  animations[0].complete();
  assert.equal(animations[0].stopped, true);
  assert.deepEqual(writes, [{ x: 37, y: 300 }]);
  assert.equal(completed, 0);
});

test("restart replaces the prior animation from the current position", () => {
  const { controller, animations, position } = harness();
  let oldCompleted = false;
  let completed = 0;
  controller.scrollTo(2500, () => {
    oldCompleted = true;
  });
  animations[0].update(600);
  controller.scrollTo(0, () => completed++);
  animations[0].update(2000);
  animations[0].complete();
  assert.equal(animations[0].stopped, true);
  assert.equal(animations[1].from, 600);
  animations[1].update(0);
  animations[1].complete();
  animations[1].complete();
  assert.deepEqual(position(), { x: 37, y: 0 });
  assert.equal(oldCompleted, false);
  assert.equal(completed, 1);
});

test("reduced motion writes the destination once and completes immediately", () => {
  const { controller, animations, writes } = harness({ reduced: true });
  let completed = 0;
  controller.scrollTo(2000, () => completed++);
  assert.deepEqual(writes, [{ x: 37, y: 2000 }]);
  assert.equal(animations.length, 0);
  assert.equal(completed, 1);
});

test("destinations clamp to page bounds and zero distance completes without animation", () => {
  const { controller, animations } = harness({ maximum: 900 });
  controller.scrollTo(5000);
  assert.equal(animations[0].to, 900);
  controller.scrollTo(-100);
  assert.equal(animations[1].to, 0);
  const stationary = harness({ y: 0, maximum: 0 });
  let completed = false;
  stationary.controller.scrollTo(3000, () => {
    completed = true;
  });
  assert.equal(stationary.animations.length, 0);
  assert.equal(completed, true);
});

test("Astro navigation restores the captured position before animation", async () => {
  const { controller, animations, writes, nativeJump } = harness();
  await controller.navigateTo(
    async () => {
      nativeJump(1500);
    },
    () => 1500,
  );
  assert.deepEqual(writes, [{ x: 37, y: 100 }]);
  assert.equal(animations[0].from, 100);
  assert.equal(animations[0].to, 1500);
});

test("interrupted pending navigation cannot restore position, animate, or complete", async () => {
  const { controller, animations, writes } = harness();
  let resolve!: () => void;
  let completed = false;
  const pending = controller.navigateTo(
    () =>
      new Promise<void>((done) => {
        resolve = done;
      }),
    () => 1500,
    () => {
      completed = true;
    },
  );
  controller.cancel();
  resolve();
  await pending;
  assert.deepEqual(writes, []);
  assert.equal(animations.length, 0);
  assert.equal(completed, false);
});

test("latest fragment navigation wins even if an older promise resolves last", async () => {
  const { controller, animations, writes } = harness();
  let resolve!: () => void;
  const first = controller.navigateTo(
    () =>
      new Promise<void>((done) => {
        resolve = done;
      }),
    () => 2500,
  );
  await controller.navigateTo(
    async () => {},
    () => 700,
  );
  resolve();
  await first;
  assert.equal(writes.length, 1);
  assert.equal(animations.length, 1);
  assert.equal(animations[0].to, 700);
});

test("only ordinary same-page fragment links resolve an existing target", () => {
  assert.equal(typeof navigation?.resolveFragmentLink, "function");
  const current = new URL("https://example.com/projects/?view=all");
  const target = {} as HTMLElement;
  const link = (href: string, attributes: Record<string, string> = {}) => ({
    href: new URL(href, current).href,
    getAttribute: (key: string) => attributes[key] ?? null,
    hasAttribute: (key: string) => key in attributes,
  });
  const find = (id: string) => (id === "能力" ? target : null);
  const resolve = (href: string, attrs = {}) =>
    navigation!.resolveFragmentLink(link(href, attrs), current, find);
  assert.equal(resolve("#%E8%83%BD%E5%8A%9B")?.target, target);
  for (const href of [
    "#missing",
    "#",
    "#%broken",
    "/other/#能力",
    "?view=one#能力",
    "https://other.com/projects/?view=all#能力",
  ]) {
    assert.equal(resolve(href), null);
  }
  for (const attrs of [
    { target: "_blank" },
    { download: "" },
    { rel: "external" },
    { "data-astro-reload": "" },
  ]) {
    assert.equal(resolve("#能力", attrs), null);
  }
});

test("focus preserves existing tabindex and removes only an introduced one on blur", () => {
  assert.equal(typeof navigation?.focusScrollTarget, "function");
  function target(initial?: string) {
    const attrs = new Map(initial === undefined ? [] : [["tabindex", initial]]);
    let blur: () => void = () => {};
    let focusOptions: FocusOptions | undefined;
    const element = {
      tabIndex: initial === undefined ? -1 : Number(initial),
      hasAttribute: (key: string) => attrs.has(key),
      setAttribute: (key: string, value: string) => attrs.set(key, value),
      removeAttribute: (key: string) => attrs.delete(key),
      addEventListener: (_: string, callback: () => void) => {
        blur = callback;
      },
      focus: (options: FocusOptions) => {
        focusOptions = options;
      },
      isConnected: true,
    };
    navigation!.focusScrollTarget(element as unknown as HTMLElement);
    return { attrs, blur, focusOptions };
  }
  const introduced = target();
  assert.equal(introduced.attrs.get("tabindex"), "-1");
  assert.deepEqual(introduced.focusOptions, { preventScroll: true });
  introduced.blur();
  assert.equal(introduced.attrs.has("tabindex"), false);
  const existing = target("-1");
  existing.blur();
  assert.equal(existing.attrs.get("tabindex"), "-1");
});

test("preparation cancellation keeps current-page controls bound until disposal", () => {
  const button = Object.assign(new EventTarget(), {
    hidden: true,
    tabIndex: -1,
  });
  const page = Object.assign(new EventTarget(), {
    documentElement: { scrollHeight: 3000 },
    querySelector: (selector: string) =>
      selector === "[data-back-to-top]" ? button : null,
  });
  const { adapter, animations, writes } = harness({ y: 300 });
  const browser = Object.assign(new EventTarget(), {
    scrollX: 0,
    scrollY: 300,
    innerHeight: 900,
    matchMedia: () => ({ matches: true }),
  });
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const previousDocument = Object.getOwnPropertyDescriptor(
    globalThis,
    "document",
  );
  Object.defineProperty(globalThis, "window", {
    value: browser,
    configurable: true,
  });
  Object.defineProperty(globalThis, "document", {
    value: page,
    configurable: true,
  });
  try {
    const dispose = navigation.initScrollNavigation(async () => {}, adapter);
    assert.equal(button.hidden, false);
    button.dispatchEvent(new Event("click"));
    assert.equal(animations.length, 1);
    page.dispatchEvent(new Event("astro:before-preparation"));
    animations[0].update(200);
    animations[0].complete();
    assert.deepEqual(writes, []);
    browser.scrollY = 0;
    browser.dispatchEvent(new Event("scroll"));
    assert.equal(button.hidden, true);
    assert.equal(button.tabIndex, -1);
    browser.scrollY = 300;
    browser.dispatchEvent(new Event("scroll"));
    button.dispatchEvent(new Event("click"));
    assert.equal(animations.length, 2);
    dispose();
    animations[1].update(100);
    button.dispatchEvent(new Event("click"));
    assert.equal(animations.length, 2);
    assert.deepEqual(writes, []);
  } finally {
    if (previousWindow)
      Object.defineProperty(globalThis, "window", previousWindow);
    else Reflect.deleteProperty(globalThis, "window");
    if (previousDocument)
      Object.defineProperty(globalThis, "document", previousDocument);
    else Reflect.deleteProperty(globalThis, "document");
  }
});

test("delegated fragments survive Astro's own hash popstate but cancel for history and input", async () => {
  for (const interruption of ["none", "history", "wheel"] as const) {
    const h = harness({ y: 0 });
    let focused = false;
    class TestElement extends EventTarget {
      href = "https://example.com/projects/#training-inference";
      closest() {
        return this;
      }
      getAttribute() {
        return null;
      }
      hasAttribute() {
        return false;
      }
    }
    const link = new TestElement();
    const target = {
      isConnected: true,
      tabIndex: 0,
      getBoundingClientRect: () => ({ top: 1532 - h.position().y }),
      focus: () => {
        focused = true;
      },
    };
    const page = Object.assign(new EventTarget(), {
      querySelector: () => null,
      getElementById: () => target,
    });
    const browser = Object.assign(new EventTarget(), {
      location: { href: "https://example.com/projects/" },
    });
    Object.defineProperty(browser, "scrollY", { get: () => h.position().y });
    const replacements = {
      window: browser,
      document: page,
      Element: TestElement,
      getComputedStyle: () => ({ scrollMarginTop: "32px" }),
    };
    const originals = Object.fromEntries(
      Object.keys(replacements).map((key) => [
        key,
        Object.getOwnPropertyDescriptor(globalThis, key),
      ]),
    );
    for (const [key, value] of Object.entries(replacements)) {
      Object.defineProperty(globalThis, key, { value, configurable: true });
    }
    let dispose = () => {};
    try {
      let navigations = 0;
      dispose = navigation.initScrollNavigation(async (href) => {
        navigations++;
        browser.location.href = href;
        h.nativeJump(1500);
        // Astro's native hash assignment generates a same-target popstate
        // before its public navigate promise settles.
        browser.dispatchEvent(new Event("popstate"));
        if (interruption === "history") {
          browser.location.href = "https://example.com/projects/#agents";
          browser.dispatchEvent(new Event("popstate"));
        } else if (interruption === "wheel") {
          browser.dispatchEvent(new Event("wheel"));
        }
      }, h.adapter);
      const clickLink = () => {
        const event = new Event("click", { bubbles: true, cancelable: true });
        Object.defineProperties(event, {
          target: { value: link },
          button: { value: 0 },
        });
        page.dispatchEvent(event);
        return event;
      };
      const click = clickLink();
      await new Promise<void>((resolve) => queueMicrotask(resolve));
      assert.equal(click.defaultPrevented, true);
      assert.equal(navigations, 1);
      if (interruption === "none") {
        assert.deepEqual(h.writes, [{ x: 37, y: 0 }]);
        assert.equal(h.animations.length, 1);
        assert.equal(h.animations[0].to, 1500);
        h.animations[0].complete();
        assert.equal(focused, true);
        // After navigation settles, even a popstate at the same URL cancels.
        clickLink();
        await new Promise<void>((resolve) => queueMicrotask(resolve));
        browser.dispatchEvent(new Event("popstate"));
        assert.equal(h.animations[1].stopped, true);
      } else {
        assert.deepEqual(h.writes, []);
        assert.equal(h.animations.length, 0);
        assert.equal(focused, false);
      }
    } finally {
      dispose();
      for (const [key, descriptor] of Object.entries(originals)) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else Reflect.deleteProperty(globalThis, key);
      }
    }
  }
});
