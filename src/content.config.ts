import { defineCollection } from "astro:content";
import { z } from "astro/zod";
import { glob } from "astro/loaders";
import { rssSchema } from "@astrojs/rss";
import { CAPABILITIES } from "./lib/project-capabilities";
import { validateProjects } from "./lib/projects";

const blog = defineCollection({
  loader: glob({ pattern: "**/[^_]*.md", base: "./src/data/blog" }),
  schema: rssSchema,
});

const projects = defineCollection({
  loader: glob({ pattern: "**/[^_]*.md", base: "./src/data/projects" }),
  schema: ({ image }) =>
    z
      .object({
        slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
        title: z.string().min(1),
        context: z.string().min(1),
        period: z.string().min(1),
        summary: z.string().min(1),
        role: z.string().min(1),
        primaryCapability: z.enum(
          CAPABILITIES.map((capability) => capability.id),
        ),
        secondaryEvidence: z
          .array(
            z.object({
              capability: z.enum(
                CAPABILITIES.map((capability) => capability.id),
              ),
              title: z.string().min(1),
              summary: z.string().min(1),
              anchor: z.string().regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/),
            }),
          )
          .default([]),
        outcomes: z
          .array(
            z.object({
              id: z.string().min(1),
              text: z.string().min(1),
              emphasis: z.string().min(1).optional(),
            }),
          )
          .min(1),
        card: z.object({
          contributions: z.array(z.string().min(1)).min(1).max(2),
          primaryOutcomeId: z.string().min(1),
          secondaryOutcomeId: z.string().min(1).optional(),
          tags: z.array(z.string().min(1)).min(1).max(3),
          sourceLinkIndex: z.number().int().nonnegative().optional(),
        }),
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
      })
      .superRefine((data, context) => {
        try {
          validateProjects([data]);
        } catch (error) {
          context.addIssue({
            code: "custom",
            message: error instanceof Error ? error.message : "无效项目元数据",
          });
        }
      }),
});
export const collections = { blog, projects };
