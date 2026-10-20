export interface ProjectMetadata {
  slug: string;
  title: string;
  context: string;
  period: string;
  summary: string;
  role: string;
  outcomes: string[];
  tags: string[];
  order: number;
  links: { label: string; url: string }[];
}

/** Reject ambiguous routes or incomplete cards before publishing. */
export function validateProjects(records: ProjectMetadata[]): void {
  const slugs = new Set<string>();
  for (const record of records) {
    for (const key of [
      "slug",
      "title",
      "context",
      "period",
      "summary",
      "role",
    ] as const) {
      if (!record[key]?.trim()) throw new Error(`项目缺少 ${key}`);
    }
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(record.slug))
      throw new Error(`无效 slug: ${record.slug}`);
    if (slugs.has(record.slug))
      throw new Error(`重复项目 slug: ${record.slug}`);
    slugs.add(record.slug);
    for (const key of ["outcomes", "tags"] as const) {
      if (
        !Array.isArray(record[key]) ||
        !record[key].length ||
        record[key].some((item) => !item.trim())
      )
        throw new Error(`${record.slug} 缺少 ${key}`);
    }
    if (!Number.isInteger(record.order) || record.order < 1)
      throw new Error(`${record.slug} 缺少 order`);
    if (!Array.isArray(record.links))
      throw new Error(`${record.slug} 缺少 links`);
    for (const link of record.links) {
      if (!link.label?.trim() || !/^https?:\/\//.test(link.url))
        throw new Error(`${record.slug} 项目链接无效`);
    }
  }
}

export function sortProjects<T extends { data: { order: number } }>(
  projects: T[],
): T[] {
  return [...projects].sort((a, b) => a.data.order - b.data.order);
}
