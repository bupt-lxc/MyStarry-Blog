import { defineCollection } from "astro:content";
import { z } from "astro/zod";
import { glob } from "astro/loaders";
import { rssSchema } from "@astrojs/rss";

const blog = defineCollection({
  loader: glob({ pattern: "**/[^_]*.md", base: "./src/data/blog" }),
  schema: rssSchema,
});

const projects = defineCollection({
  loader: glob({ pattern: "**/[^_]*.md", base: "./src/data/projects" }),
  schema: ({ image }) =>
    z.object({
      slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
      title: z.string().min(1),
      context: z.string().min(1),
      period: z.string().min(1),
      summary: z.string().min(1),
      role: z.string().min(1),
      outcomes: z.array(z.string().min(1)).min(1),
      tags: z.array(z.string().min(1)).min(1),
      order: z.number().int().positive(),
      cover: image().optional(),
      coverAlt: z.string().optional(),
      links: z.array(
        z.object({
          label: z.string().min(1),
          url: z.url({ protocol: /^https?$/ }),
        }),
      ),
    }),
});
export const collections = { blog, projects };
