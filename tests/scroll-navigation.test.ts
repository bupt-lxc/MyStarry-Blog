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
    const dispose = navigation.initScrollNavigation(adapter);
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

function withPage(
  run: (page: ReturnType<typeof createPage>) => void,
  options: { y?: number; reduced?: boolean; current?: string } = {},
) {
  const state = createPage(options);
  const replacements = {
    window: state.browser,
    document: state.document,
    Element: state.TestElement,
    getComputedStyle: () => ({ scrollMarginTop: "32px" }),
  };
  const originals = Object.fromEntries(
    Object.keys(replacements).map((key) => [
      key,
      Object.getOwnPropertyDescriptor(globalThis, key),
    ]),
  );
  for (const [key, value] of Object.entries(replacements))
    Object.defineProperty(globalThis, key, { value, configurable: true });
  const dispose = navigation.initScrollNavigation(state.h.adapter);
  try {
    run(state);
  } finally {
    dispose();
    for (const [key, descriptor] of Object.entries(originals)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
}

function createPage({
  y = 420,
  reduced = false,
  current = "https://example.com/projects/",
} = {}) {
  const h = harness({ y, reduced });
  class TestElement extends EventTarget {
    href: string;
    constructor(
      href: string,
      private attributes: Record<string, string> = {},
    ) {
      super();
      this.href = new URL(href, current).href;
    }
    closest() {
      return this;
    }
    getAttribute(key: string) {
      return this.attributes[key] ?? null;
    }
    hasAttribute(key: string) {
      return key in this.attributes;
    }
  }
  function target(absoluteTop: number) {
    return {
      isConnected: true,
      tabIndex: 0,
      focused: 0,
      getBoundingClientRect: () => ({ top: absoluteTop - h.position().y }),
      focus(options: FocusOptions) {
        assert.deepEqual(options, { preventScroll: true });
        this.focused++;
      },
    };
  }
  const targets = {
    "training-inference": target(1532),
    agents: target(2532),
    fullstack: target(3532),
    overview: target(732),
  };
  const main = target(0);
  const button = Object.assign(new EventTarget(), {
    hidden: true,
    tabIndex: -1,
  });
  const document = Object.assign(new EventTarget(), {
    querySelector: (selector: string) =>
      selector === "[data-back-to-top]"
        ? button
        : selector === "main"
          ? main
          : null,
    getElementById: (id: string) => targets[id as keyof typeof targets] ?? null,
  });
  let locationWrites = 0;
  let historyWrites = 0;
  const location = {
    get href() {
      return current;
    },
    set href(value: string) {
      current = value;
      locationWrites++;
    },
  };
  const browser = Object.assign(new EventTarget(), {
    location,
    history: {
      pushState: () => {
        historyWrites++;
      },
      replaceState: () => {
        historyWrites++;
      },
    },
  });
  Object.defineProperty(browser, "scrollY", { get: () => h.position().y });
  function click(
    href: string,
    properties: Record<string, unknown> = {},
    attributes = {},
  ) {
    const link = new TestElement(href, attributes);
    const event = new Event("click", { bubbles: true, cancelable: true });
    for (const [key, value] of Object.entries({
      target: link,
      button: 0,
      ...properties,
    }))
      Object.defineProperty(event, key, { value });
    document.dispatchEvent(event);
    return { event, link };
  }
  return {
    h,
    TestElement,
    targets,
    main,
    document,
    browser,
    button,
    click,
    locationWrites: () => locationWrites,
    historyWrites: () => historyWrites,
  };
}

test("ordinary capability click starts Motion without navigation or a native fragment jump", () => {
  withPage(({ h, click, browser, locationWrites, historyWrites }) => {
    const { event, link } = click("#training-inference");
    assert.equal(event.defaultPrevented, true);
    assert.equal(locationWrites(), 0);
    assert.equal(historyWrites(), 0);
    assert.equal(browser.location.href, "https://example.com/projects/");
    assert.equal(link.href, "https://example.com/projects/#training-inference");
    assert.equal(h.position().y, 420);
    assert.deepEqual(h.writes, []);
    assert.equal(h.animations.length, 1);
    assert.equal(h.animations[0].from, 420);
    assert.equal(h.animations[0].to, 1500);
  });
});

test("all capability and TOC links use direct scrolling and focus only on completion", () => {
  withPage(({ h, click, targets }) => {
    for (const [id, destination] of [
      ["training-inference", 1500],
      ["agents", 2500],
      ["fullstack", 3500],
      ["overview", 700],
    ] as const) {
      const previous = h.position().y;
      assert.equal(click(`#${id}`).event.defaultPrevented, true);
      const animation = h.animations.at(-1)!;
      assert.equal(animation.from, previous);
      assert.equal(animation.to, destination);
      animation.update(destination - 10);
      assert.equal(targets[id].focused, 0);
      animation.update(destination);
      animation.complete();
      assert.equal(targets[id].focused, 1);
    }
  });
});

test("repeated same-URL clicks animate and a new click replaces the current scroll", () => {
  withPage(
    ({ h, click, targets, browser, locationWrites, historyWrites }) => {
      click("#training-inference");
      h.animations[0].update(650);
      click("#training-inference");
      assert.equal(h.animations[0].stopped, true);
      assert.equal(h.animations[1].from, 650);
      assert.equal(h.animations[1].to, 1500);
      h.animations[1].update(800);
      click("#overview");
      assert.equal(h.animations[1].stopped, true);
      assert.equal(h.animations[2].from, 800);
      assert.equal(h.animations[2].to, 700);
      h.animations[0].update(1500);
      h.animations[0].complete();
      h.animations[1].complete();
      assert.equal(h.position().y, 800);
      assert.equal(targets["training-inference"].focused, 0);
      h.animations[2].update(700);
      h.animations[2].complete();
      assert.equal(targets.overview.focused, 1);
      assert.equal(
        browser.location.href,
        "https://example.com/projects/#training-inference",
      );
      assert.equal(locationWrites(), 0);
      assert.equal(historyWrites(), 0);
    },
    { current: "https://example.com/projects/#training-inference" },
  );
});

test("manual input, history, preparation, and resize cancel direct scrolling without late focus", () => {
  for (const interruption of [
    "wheel",
    "touchstart",
    "pointerdown",
    "keydown",
    "popstate",
    "astro:before-preparation",
    "resize",
  ]) {
    withPage(({ h, click, targets, browser, document }) => {
      click("#training-inference");
      h.animations[0].update(600);
      const event = new Event(interruption);
      if (interruption === "keydown")
        Object.defineProperty(event, "key", { value: "PageDown" });
      (interruption.startsWith("astro:") ? document : browser).dispatchEvent(
        event,
      );
      h.animations[0].update(1500);
      h.animations[0].complete();
      assert.equal(h.animations[0].stopped, true, interruption);
      assert.equal(h.position().y, 600, interruption);
      assert.equal(targets["training-inference"].focused, 0, interruption);
    });
  }
});

test("back-to-top replaces a capability scroll through the same controller", () => {
  withPage(({ h, click, targets, button, main }) => {
    click("#training-inference");
    h.animations[0].update(650);
    button.dispatchEvent(new Event("click"));
    assert.equal(h.animations[0].stopped, true);
    assert.equal(h.animations[1].from, 650);
    assert.equal(h.animations[1].to, 0);
    h.animations[0].complete();
    assert.equal(targets["training-inference"].focused, 0);
    h.animations[1].update(0);
    h.animations[1].complete();
    assert.equal(main.focused, 1);
  });
});

test("modified clicks, cross-page links, missing targets, and explicit native links stay untouched", () => {
  withPage(({ h, click, browser }) => {
    for (const properties of [
      { ctrlKey: true },
      { metaKey: true },
      { shiftKey: true },
      { altKey: true },
      { button: 1 },
      { defaultPrevented: true },
    ])
      assert.equal(
        click("#training-inference", properties).event.defaultPrevented,
        Boolean(properties.defaultPrevented),
      );
    for (const href of [
      "/other/#agents",
      "?other=1#agents",
      "https://other.com/projects/#agents",
      "#missing",
      "#%broken",
      "#",
    ])
      assert.equal(click(href).event.defaultPrevented, false);
    for (const attributes of [
      { target: "_blank" },
      { download: "" },
      { rel: "external" },
      { "data-astro-reload": "" },
    ])
      assert.equal(
        click("#training-inference", {}, attributes).event.defaultPrevented,
        false,
      );
    assert.equal(h.animations.length, 0);
    assert.deepEqual(h.writes, []);
    assert.equal(browser.location.href, "https://example.com/projects/");
  });
});

test("initial deep links remain untouched and reduced-motion clicks finish directly", () => {
  withPage(
    ({ h, click, targets, browser }) => {
      assert.deepEqual(h.writes, []);
      assert.equal(h.animations.length, 0);
      click("#training-inference");
      assert.deepEqual(h.writes, [{ x: 37, y: 1500 }]);
      assert.equal(h.animations.length, 0);
      assert.equal(targets["training-inference"].focused, 1);
      assert.equal(
        browser.location.href,
        "https://example.com/projects/#overview",
      );
    },
    { current: "https://example.com/projects/#overview", reduced: true },
  );
});
