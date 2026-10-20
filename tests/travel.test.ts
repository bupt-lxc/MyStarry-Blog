import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as travel from "../src/lib/travel.ts";

test("every map feature has a Chinese label rather than an unknown region placeholder", () => {
  const world = JSON.parse(
    readFileSync(new URL("../src/lib/world.json", import.meta.url), "utf8"),
  );
  for (const feature of world.features) {
    const label = travel.countryLabel(feature.properties.name);
    assert.ok(
      !/未知|其他地区|[A-Za-z]/.test(label),
      `${feature.properties.name}: ${label}`,
    );
  }
});

test("China and Taiwan map polygons belong to one destination", () => {
  assert.equal(typeof travel.destinationForCountry, "function");
  assert.equal(travel.destinationForCountry("China"), "China");
  assert.equal(travel.destinationForCountry("Taiwan"), "China");
  assert.equal(travel.countryLabel("Taiwan"), "中国·台湾");
});

test("visited destination list deduplicates China and Taiwan while preserving other places", () => {
  assert.equal(typeof travel.groupDestinations, "function");
  assert.deepEqual(
    travel.groupDestinations([
      "China",
      "Taiwan",
      "France",
      "Germany",
      "Luxembourg",
      "Belgium",
      "China",
    ]),
    ["China", "France", "Germany", "Luxembourg", "Belgium"],
  );
  assert.equal(travel.isVisitedCountry("Taiwan", ["China"]), true);
  assert.equal(travel.isVisitedCountry("Taiwan", ["France"]), false);
});
