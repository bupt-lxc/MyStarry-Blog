import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { validateProjects } from "../src/lib/projects";
import {
  validateProjectFiles,
  readProjectFiles,
} from "../scripts/validate-projects";

const good = {
  slug: "demo",
  title: "示例",
  context: "真实业务",
  period: "2026",
  summary: "摘要",
  role: "开发",
  outcomes: ["成果"],
  tags: ["Python"],
  order: 1,
  links: [],
};

test("rejects duplicate project slugs", () => {
  assert.throws(
    () => validateProjects([good, { ...good, order: 2 }]),
    /重复.*slug/,
  );
});

test("rejects missing slugs and required metadata", () => {
  for (const key of ["slug", "title", "context", "period", "summary", "role"]) {
    assert.throws(
      () => validateProjects([{ ...good, [key]: "" }]),
      new RegExp(key),
    );
  }
  assert.throws(
    () => validateProjects([{ ...good, outcomes: [] }]),
    /outcomes/,
  );
  assert.throws(
    () =>
      validateProjects([
        { ...good, links: [{ label: "源码", url: "javascript:alert(1)" }] },
      ]),
    /链接/,
  );
});

test("publishes the eight source groups in approved order with unique slugs", () => {
  const records = readProjectFiles(process.cwd());
  validateProjects(records.map((record) => record.data));
  assert.deepEqual(
    records
      .sort((a, b) => a.data.order - b.data.order)
      .map((record) => record.data.slug),
    [
      "aishperf",
      "pomp",
      "xinhua-nl2sql",
      "audi-diagnostics",
      "huaxiaobo",
      "poly-awards",
      "dcu-watermark",
      "china-mobile-alignment",
    ],
  );
});

test("all source screenshots are preserved and referenced by real project images", () => {
  const result = validateProjectFiles(process.cwd());
  assert.equal(result.projectCount, 8);
  assert.equal(result.imageCount, 11);
  assert.equal(result.sourceImageCount, 11);
});

test("broken local Markdown image references stop validation", () => {
  const root = mkdtempSync(resolve(tmpdir(), "portfolio-validation-"));
  mkdirSync(resolve(root, "src/data/projects"), { recursive: true });
  writeFileSync(
    resolve(root, "src/data/projects/demo.md"),
    `---\n${JSON.stringify(good)}\n---\n![缺失截图](../../assets/projects/missing.png)`,
  );
  assert.throws(() => validateProjectFiles(root), /missing\.png/);
});

test("canonical v2 metrics replace superseded source metrics", () => {
  const content = (slug: string) =>
    readFileSync(resolve("src/data/projects", `${slug}.md`), "utf8");
  assert.match(content("pomp"), /170\+/);
  assert.match(content("pomp"), /4500\+/);
  assert.match(content("xinhua-nl2sql"), /97%/);
  assert.match(content("xinhua-nl2sql"), /59%.*83%/);
  assert.match(content("huaxiaobo"), /6000/);
  assert.doesNotMatch(content("huaxiaobo"), /12 处场馆|4,000|2025 年至今/);
  assert.match(content("china-mobile-alignment"), /5\.9%/);
  assert.match(content("china-mobile-alignment"), /3\.8%/);
  assert.match(content("china-mobile-alignment"), /1\.6%/);
  assert.doesNotMatch(content("china-mobile-alignment"), /5\.9 个百分点|3\.8 个百分点|1\.6 个百分点/);
});
