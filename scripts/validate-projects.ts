import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { validateProjects, type ProjectMetadata } from "../src/lib/projects";

// These existing CommonJS development tools do not ship TypeScript declarations.
const require = createRequire(import.meta.url);
const markdown = new (require("markdown-it"))({ html: true });
const sanitizeHtml = require("sanitize-html");

/** Frontmatter uses JSON, a YAML subset, so validation needs no parser dependency. */
export function readProjectFiles(root: string) {
  const directory = resolve(root, "src/data/projects");
  if (!existsSync(directory)) return [];
  return readdirSync(directory)
    .filter((file) => file.endsWith(".md"))
    .map((file) => {
      const path = resolve(directory, file);
      const source = readFileSync(path, "utf8");
      const match = source.match(/^---\r?\n([\s\S]+?)\r?\n---\r?\n/);
      if (!match) throw new Error(`${file} 缺少项目元数据`);
      const data = JSON.parse(match[1]) as ProjectMetadata & {
        cover?: string;
        coverAlt?: string;
      };
      return { path, data, body: source.slice(match[0].length) };
    });
}

export function validateProjectFiles(root: string) {
  const records = readProjectFiles(root);
  validateProjects(records.map(({ data }) => data));
  const usedImages = new Set<string>();
  for (const { path, data, body } of records) {
    if (data.slug !== path.split(/[\\/]/).pop()?.replace(/\.md$/, ""))
      throw new Error(`文件名与 slug 不一致: ${data.slug}`);
    const explicitIds: string[] = [];
    // Markdown rendering escapes code examples; the HTML parser then ignores
    // comments and distinguishes real attributes from text inside other values.
    sanitizeHtml(markdown.render(body), {
      transformTags: {
        "*": (tagName: string, attribs: Record<string, string>) => {
          if (attribs.id !== undefined) explicitIds.push(attribs.id);
          return { tagName, attribs };
        },
      },
    });
    for (const evidence of data.secondaryEvidence ?? []) {
      if (explicitIds.filter((id) => id === evidence.anchor).length !== 1)
        throw new Error(
          `${data.slug} secondaryEvidence.anchor: ${evidence.anchor} 必须在正文中有且只有一个显式 ID`,
        );
    }
    const imageLinks = [...body.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].map(
      (match) => match[1],
    );
    if (data.cover) imageLinks.push(data.cover);
    for (const href of imageLinks) {
      if (/^https?:/.test(href))
        throw new Error(`项目截图必须使用提供的本地图片: ${href}`);
      const image = resolve(dirname(path), decodeURI(href));
      if (!existsSync(image)) throw new Error(`项目图片缺失: ${href}`);
      usedImages.add(image);
    }
  }
  const sourceDir = resolve(root, "docs/source-materials/portfolio/图片和附件");
  const sourceImages = existsSync(sourceDir)
    ? readdirSync(sourceDir).filter((file) => /\.(png|jpe?g|webp)$/i.test(file))
    : [];
  for (const file of sourceImages) {
    const publicCopy = resolve(root, "src/assets/projects", file);
    if (!usedImages.has(publicCopy))
      throw new Error(`原始图片未进入作品集: ${file}`);
    if (
      !readFileSync(publicCopy).equals(readFileSync(resolve(sourceDir, file)))
    )
      throw new Error(`原始图片发生改变: ${file}`);
  }
  return {
    projectCount: records.length,
    imageCount: usedImages.size,
    sourceImageCount: sourceImages.length,
  };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const result = validateProjectFiles(process.cwd());
  if (result.projectCount !== 8)
    throw new Error(`预期 8 个项目，实际 ${result.projectCount}`);
  console.log(
    `作品集校验通过：${result.projectCount} 个项目，${result.imageCount} 张图片。`,
  );
}
