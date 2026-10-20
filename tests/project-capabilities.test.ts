import assert from "node:assert/strict";
import test from "node:test";
import * as projects from "../src/lib/projects";
import { readProjectFiles } from "../scripts/validate-projects";

const good = {
  slug: "demo",
  title: "示例",
  context: "业务",
  period: "2026",
  summary: "摘要",
  role: "开发",
  primaryCapability: "fullstack",
  secondaryEvidence: [],
  outcomes: [
    { id: "usage", text: "服务 100 人", emphasis: "100 人" },
    { id: "speed", text: "响应 20s" },
  ],
  tags: ["Python", "Vue"],
  order: 1,
  links: [{ label: "源码", url: "https://example.com/repo" }],
  card: {
    contributions: ["完成业务开发", "交付部署"],
    primaryOutcomeId: "usage",
    secondaryOutcomeId: "speed",
    tags: ["Python"],
    sourceLinkIndex: 0,
  },
} as projects.ProjectMetadata;
const validate = (record: unknown) =>
  projects.validateProjects([record as projects.ProjectMetadata]);

test("accepts the complete capability metadata contract", () => {
  assert.doesNotThrow(() => validate(good));
});

test("defines the three equally weighted capabilities in approved order", async () => {
  const { CAPABILITIES } = await import("../src/lib/project-capabilities");
  assert.deepEqual(
    CAPABILITIES.map((item) => item.id),
    ["fullstack", "agents", "training-inference"],
  );
  assert.deepEqual(
    CAPABILITIES.map((item) => item.name),
    ["全栈开发与项目落地", "大模型应用与智能体", "AI 训练与推理优化"],
  );
  assert.ok(
    CAPABILITIES.every(
      (item) => item.description && item.keywords.length === 3,
    ),
  );
});

const invalid: [string, (data: any) => void, RegExp][] = [
  [
    "missing primary capability",
    (d) => delete d.primaryCapability,
    /primaryCapability/,
  ],
  [
    "unknown primary capability",
    (d) => (d.primaryCapability = "other"),
    /primaryCapability/,
  ],
  [
    "invalid secondary array",
    (d) => (d.secondaryEvidence = {}),
    /secondaryEvidence/,
  ],
  [
    "null secondary array",
    (d) => (d.secondaryEvidence = null),
    /secondaryEvidence/,
  ],
  [
    "unknown secondary capability",
    (d) =>
      (d.secondaryEvidence = [
        {
          capability: "other",
          title: "标题",
          summary: "摘要",
          anchor: "guide",
        },
      ]),
    /secondaryEvidence/,
  ],
  [
    "primary-equal secondary",
    (d) =>
      (d.secondaryEvidence = [
        {
          capability: "fullstack",
          title: "标题",
          summary: "摘要",
          anchor: "guide",
        },
      ]),
    /secondaryEvidence/,
  ],
  [
    "duplicate secondary",
    (d) =>
      (d.secondaryEvidence = [1, 2].map(() => ({
        capability: "agents",
        title: "标题",
        summary: "摘要",
        anchor: "guide",
      }))),
    /secondaryEvidence/,
  ],
  [
    "blank secondary title",
    (d) =>
      (d.secondaryEvidence = [
        { capability: "agents", title: " ", summary: "摘要", anchor: "guide" },
      ]),
    /secondaryEvidence/,
  ],
  [
    "blank secondary summary",
    (d) =>
      (d.secondaryEvidence = [
        { capability: "agents", title: "标题", summary: " ", anchor: "guide" },
      ]),
    /secondaryEvidence/,
  ],
  [
    "unsafe secondary anchor",
    (d) =>
      (d.secondaryEvidence = [
        {
          capability: "agents",
          title: "标题",
          summary: "摘要",
          anchor: "#guide bad",
        },
      ]),
    /anchor/,
  ],
  [
    "blank secondary anchor",
    (d) =>
      (d.secondaryEvidence = [
        { capability: "agents", title: "标题", summary: "摘要", anchor: "" },
      ]),
    /anchor/,
  ],
  ["invalid outcome array", (d) => (d.outcomes = {}), /outcomes/],
  [
    "duplicate outcome IDs",
    (d) => d.outcomes.push({ ...d.outcomes[0] }),
    /outcomes/,
  ],
  ["blank outcome ID", (d) => (d.outcomes[0].id = " "), /outcomes/],
  ["blank outcome text", (d) => (d.outcomes[0].text = " "), /outcomes/],
  [
    "emphasis absent from text",
    (d) => (d.outcomes[0].emphasis = "200"),
    /emphasis/,
  ],
  [
    "repeated emphasis",
    (d) => {
      d.outcomes[0].text = "100 人，新增 100 人";
    },
    /emphasis/,
  ],
  [
    "overlapping emphasis",
    (d) => {
      d.outcomes[0].text = "aaa";
      d.outcomes[0].emphasis = "aa";
    },
    /emphasis/,
  ],
  ["blank emphasis", (d) => (d.outcomes[0].emphasis = ""), /emphasis/],
  ["missing card", (d) => delete d.card, /card/],
  ["empty contributions", (d) => (d.card.contributions = []), /contributions/],
  [
    "too many contributions",
    (d) => (d.card.contributions = ["一", "二", "三"]),
    /contributions/,
  ],
  [
    "blank contribution",
    (d) => (d.card.contributions = [" "]),
    /contributions/,
  ],
  ["empty card tags", (d) => (d.card.tags = []), /card.tags/],
  [
    "too many card tags",
    (d) => (d.card.tags = ["Python", "Vue", "Go", "SQL"]),
    /card.tags/,
  ],
  ["unknown card tag", (d) => (d.card.tags = ["Go"]), /card.tags/],
  [
    "missing primary outcome",
    (d) => delete d.card.primaryOutcomeId,
    /primaryOutcomeId/,
  ],
  [
    "invalid primary outcome reference",
    (d) => (d.card.primaryOutcomeId = "missing"),
    /primaryOutcomeId/,
  ],
  [
    "invalid secondary outcome reference",
    (d) => (d.card.secondaryOutcomeId = "missing"),
    /secondaryOutcomeId/,
  ],
  [
    "repeated card outcomes",
    (d) => (d.card.secondaryOutcomeId = "usage"),
    /secondaryOutcomeId/,
  ],
  [
    "negative source index",
    (d) => (d.card.sourceLinkIndex = -1),
    /sourceLinkIndex/,
  ],
  [
    "fractional source index",
    (d) => (d.card.sourceLinkIndex = 0.5),
    /sourceLinkIndex/,
  ],
  [
    "source index out of range",
    (d) => (d.card.sourceLinkIndex = 1),
    /sourceLinkIndex/,
  ],
  ["bad tags array", (d) => (d.tags = [null]), /tags/],
  ["bad link object", (d) => (d.links = [null]), /links|链接/],
  ["bad HTTP URL", (d) => (d.links[0].url = "https://"), /links|链接/],
];
for (const [name, mutate, reason] of invalid) {
  test(`rejects ${name} with project and field context`, () => {
    const data = structuredClone(good);
    mutate(data);
    assert.throws(
      () => validate(data),
      (error: Error) =>
        error.message.includes("demo") && reason.test(error.message),
    );
  });
}

test("selects canonical card outcomes and preserves metric conditions", () => {
  const selected = projects.getCardOutcomes(good);
  assert.equal(selected.primary, good.outcomes[0]);
  assert.equal(selected.secondary, good.outcomes[1]);
  const single = structuredClone(good);
  delete single.card.secondaryOutcomeId;
  assert.deepEqual(projects.getCardOutcomes(single), {
    primary: single.outcomes[0],
  });
  const records = readProjectFiles(process.cwd());
  const primary = (slug: string) =>
    projects.getCardOutcomes(records.find((r) => r.data.slug === slug)!.data)
      .primary.text;
  assert.match(primary("aishperf"), /固定评测矩阵.*42h.*17h/);
  const xinhua = records.find((r) => r.data.slug === "xinhua-nl2sql")!.data;
  assert.match(
    projects.getCardOutcomes(xinhua).secondary!.text,
    /View 命中.*7min.*20s/,
  );
  assert.match(primary("dcu-watermark"), /1080p.*1\.12.*0\.20.*秒／图/);
});

test("groups eight complete projects exactly once and derives two separate Agent rows", () => {
  const records = readProjectFiles(process.cwd()).reverse();
  const sections = projects.getProjectSections(records);
  assert.deepEqual(
    sections.map((section) =>
      section.projects.map((project) => project.data.slug),
    ),
    [
      ["pomp", "huaxiaobo", "poly-awards"],
      ["xinhua-nl2sql", "audi-diagnostics"],
      ["aishperf", "dcu-watermark", "china-mobile-alignment"],
    ],
  );
  assert.equal(
    new Set(
      sections.flatMap((section) =>
        section.projects.map((project) => project.data.slug),
      ),
    ).size,
    8,
  );
  assert.deepEqual(
    sections.map((section) =>
      section.related.map((row) => [
        row.project.data.slug,
        row.evidence.anchor,
      ]),
    ),
    [
      [],
      [
        ["aishperf", "agent-selection"],
        ["huaxiaobo", "rag-guide"],
      ],
      [],
    ],
  );
  assert.ok(
    records.every((record) => record.data.card.contributions.length === 2),
  );
  assert.deepEqual(
    records.map((record) => record.data.slug),
    readProjectFiles(process.cwd())
      .reverse()
      .map((record) => record.data.slug),
  );
});
