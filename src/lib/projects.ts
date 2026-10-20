import { CAPABILITIES, type CapabilityId } from "./project-capabilities";

export interface ProjectOutcome {
  id: string;
  text: string;
  emphasis?: string;
}
export interface SecondaryEvidence {
  capability: CapabilityId;
  title: string;
  summary: string;
  anchor: string;
}
export interface ProjectCardMetadata {
  contributions: string[];
  primaryOutcomeId: string;
  secondaryOutcomeId?: string;
  tags: string[];
  sourceLinkIndex?: number;
}
export interface ProjectMetadata {
  slug: string;
  title: string;
  context: string;
  period: string;
  summary: string;
  role: string;
  primaryCapability: CapabilityId;
  secondaryEvidence: SecondaryEvidence[];
  outcomes: ProjectOutcome[];
  card: ProjectCardMetadata;
  tags: string[];
  order: number;
  links: { label: string; url: string }[];
}

const nonblank = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;
const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isCapability = (value: unknown): value is CapabilityId =>
  CAPABILITIES.some((capability) => capability.id === value);
const strings = (
  value: unknown,
  min: number,
  max = Infinity,
): value is string[] =>
  Array.isArray(value) &&
  value.length >= min &&
  value.length <= max &&
  value.every(nonblank);
const httpUrl = (value: unknown): boolean => {
  if (typeof value !== "string" || !/^https?:\/\//.test(value)) return false;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && Boolean(url.hostname);
  } catch {
    return false;
  }
};

/** Reject ambiguous routes, evidence, or incomplete cards before publishing. */
export function validateProjects(records: ProjectMetadata[]): void {
  if (!Array.isArray(records)) throw new Error("projects 必须是数组");
  const slugs = new Set<string>();
  for (const record of records) {
    const slug =
      isObject(record) && nonblank(record.slug) ? record.slug : "<unknown>";
    const fail = (field: string, reason: string): never => {
      throw new Error(`${slug} ${field}: ${reason}`);
    };
    if (!isObject(record)) fail("metadata", "必须是对象");
    for (const key of [
      "slug",
      "title",
      "context",
      "period",
      "summary",
      "role",
    ] as const) {
      if (!nonblank(record[key])) fail(key, "缺少非空文本");
    }
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(record.slug))
      fail("slug", "无效 slug");
    if (slugs.has(record.slug)) fail("slug", "重复项目 slug");
    slugs.add(record.slug);
    if (!isCapability(record.primaryCapability))
      fail("primaryCapability", "无效能力分类");
    const evidence =
      record.secondaryEvidence === undefined ? [] : record.secondaryEvidence;
    if (!Array.isArray(evidence)) fail("secondaryEvidence", "必须是数组");
    const seenCapabilities = new Set<CapabilityId>();
    for (const item of evidence) {
      if (!isObject(item) || !isCapability(item.capability))
        fail("secondaryEvidence", "无效能力分类");
      if (
        item.capability === record.primaryCapability ||
        seenCapabilities.has(item.capability)
      )
        fail("secondaryEvidence", "能力重复或等于 primaryCapability");
      seenCapabilities.add(item.capability);
      if (!nonblank(item.title) || !nonblank(item.summary))
        fail("secondaryEvidence", "title 与 summary 必须是非空文本");
      if (
        typeof item.anchor !== "string" ||
        !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(item.anchor)
      )
        fail("secondaryEvidence.anchor", "必须是安全的非空 fragment ID");
    }
    if (!Array.isArray(record.outcomes) || !record.outcomes.length)
      fail("outcomes", "必须是非空数组");
    const outcomeIds = new Set<string>();
    for (const outcome of record.outcomes) {
      if (
        !isObject(outcome) ||
        !nonblank(outcome.id) ||
        !nonblank(outcome.text)
      )
        fail("outcomes", "id 与 text 必须是非空文本");
      if (outcomeIds.has(outcome.id)) fail("outcomes", `重复 id ${outcome.id}`);
      outcomeIds.add(outcome.id);
      if (outcome.emphasis !== undefined) {
        const first = nonblank(outcome.emphasis)
          ? outcome.text.indexOf(outcome.emphasis)
          : -1;
        if (
          first < 0 ||
          outcome.text.indexOf(outcome.emphasis, first + 1) !== -1
        )
          fail("outcomes.emphasis", "必须在 text 中恰好出现一次");
      }
    }
    if (!strings(record.tags, 1)) fail("tags", "必须是非空文本数组");
    if (!Number.isInteger(record.order) || record.order < 1)
      fail("order", "必须是正整数");
    if (!Array.isArray(record.links)) fail("links", "必须是数组");
    for (const link of record.links) {
      if (!isObject(link) || !nonblank(link.label) || !httpUrl(link.url))
        fail("links", "项目链接无效");
    }
    const card = record.card;
    if (!isObject(card)) fail("card", "必须是对象");
    if (!strings(card.contributions, 1, 2))
      fail("card.contributions", "需要 1—2 条非空贡献");
    if (
      !strings(card.tags, 1, 3) ||
      card.tags.some((tag) => !record.tags.includes(tag))
    )
      fail("card.tags", "需要 1—3 个完整 tags 中的标签");
    if (
      !nonblank(card.primaryOutcomeId) ||
      !outcomeIds.has(card.primaryOutcomeId)
    )
      fail("card.primaryOutcomeId", "必须引用已有 outcome");
    if (
      card.secondaryOutcomeId !== undefined &&
      (!outcomeIds.has(card.secondaryOutcomeId) ||
        card.secondaryOutcomeId === card.primaryOutcomeId)
    )
      fail("card.secondaryOutcomeId", "必须引用不同的已有 outcome");
    if (
      card.sourceLinkIndex !== undefined &&
      (!Number.isInteger(card.sourceLinkIndex) ||
        card.sourceLinkIndex < 0 ||
        card.sourceLinkIndex >= record.links.length)
    )
      fail("card.sourceLinkIndex", "必须引用已有 links 的零基整数索引");
  }
}

export function sortProjects<T extends { data: { order: number } }>(
  projects: T[],
): T[] {
  return [...projects].sort((a, b) => a.data.order - b.data.order);
}

export function getProjectSections<T extends { data: ProjectMetadata }>(
  projects: T[],
) {
  const sorted = sortProjects(projects);
  return CAPABILITIES.map((capability) => ({
    ...capability,
    projects: sorted.filter(
      (project) => project.data.primaryCapability === capability.id,
    ),
    related: sorted.flatMap((project) =>
      (project.data.secondaryEvidence ?? [])
        .filter((evidence) => evidence.capability === capability.id)
        .map((evidence) => ({ project, evidence })),
    ),
  }));
}

export function getCardOutcomes(data: ProjectMetadata): {
  primary: ProjectOutcome;
  secondary?: ProjectOutcome;
} {
  const primary = data.outcomes.find(
    (outcome) => outcome.id === data.card.primaryOutcomeId,
  );
  if (!primary)
    throw new Error(`${data.slug} card.primaryOutcomeId: 未找到 outcome`);
  if (data.card.secondaryOutcomeId === undefined) return { primary };
  const secondary = data.outcomes.find(
    (outcome) => outcome.id === data.card.secondaryOutcomeId,
  );
  if (!secondary || secondary === primary)
    throw new Error(`${data.slug} card.secondaryOutcomeId: 无效 outcome 引用`);
  return { primary, secondary };
}
