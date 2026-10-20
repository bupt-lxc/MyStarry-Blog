import test from "node:test";
import assert from "node:assert/strict";
import * as appearance from "../src/lib/appearance.ts";

test("first visit and old preview preferences migrate to yellow Neon with normal borders", () => {
  assert.equal(typeof appearance.resolveAppearance, "function");
  for (const saved of [
    {},
    {
      theme: "blue-theme",
      portfolioStyle: "style-glass",
      cardBorder: "custom",
    },
  ]) {
    assert.deepEqual(appearance.resolveAppearance(saved), {
      theme: "yellow-theme",
      style: "style-neon",
      border: "normal",
      version: appearance.APPEARANCE_VERSION,
    });
  }
});

test("versioned manual selections survive reload and page swaps, including the original red theme", () => {
  assert.equal(typeof appearance.resolveAppearance, "function");
  const saved = {
    theme: "default",
    portfolioStyle: "style-glass",
    cardBorder: "custom",
    version: appearance.APPEARANCE_VERSION,
  };
  assert.deepEqual(appearance.resolveAppearance(saved), {
    theme: "default",
    style: "style-glass",
    border: "custom",
    version: appearance.APPEARANCE_VERSION,
  });
});

test("invalid persisted theme, style, and border fall back to approved defaults", () => {
  assert.equal(typeof appearance.resolveAppearance, "function");
  assert.deepEqual(
    appearance.resolveAppearance({
      theme: "unexpected",
      portfolioStyle: "broken",
      cardBorder: "other",
      version: appearance.APPEARANCE_VERSION,
    }),
    {
      theme: "yellow-theme",
      style: "style-neon",
      border: "normal",
      version: appearance.APPEARANCE_VERSION,
    },
  );
});
