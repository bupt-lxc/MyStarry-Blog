import rss from "@astrojs/rss";
import { getCollection } from "astro:content";
import sanitizeHtml from "sanitize-html";
import MarkdownIt from "markdown-it";
import { SITE } from "../site-config";
const parser = new MarkdownIt();
export const prerender = true;

export async function GET(context) {
  const blog = await getCollection("blog");
  return rss({
    title: `${SITE.author.fullName}的博客`,
    description: "智能体、大模型应用与软件工程实践的技术笔记和项目复盘。",
    site: context.site,
    items: blog.map((post) => ({
      title: post.data.title,
      pubDate: post.data.pubDate,
      description: post.data.description,
      content: sanitizeHtml(parser.render(post.body || "")),
      link: `/blog/${post.id}/`,
    })),
    customData: "<language>zh-cn</language>",
  });
}
