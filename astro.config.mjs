import { defineConfig, fontProviders, sessionDrivers } from "astro/config";
import node from "@astrojs/node";
import sitemap from "@astrojs/sitemap";
import { existsSync } from "node:fs";
import robotsTxt from "astro-robots-txt";
import UnoCSS from "@unocss/astro";
import icon from "astro-icon";

import solidJs from "@astrojs/solid-js";
import { remarkReadingTime } from "./src/lib/remark-reading-time.mjs";

import svelte from "@astrojs/svelte";

import { unified } from "@astrojs/markdown-remark";

if (existsSync(".env")) process.loadEnvFile(".env");
const envSiteUrl = process.env.SITE_URL ?? process.env.PUBLIC_SITE_URL ?? "http://localhost:4321/";
const site = envSiteUrl.endsWith("/") ? envSiteUrl : `${envSiteUrl}/`;
const siteNoTrailingSlash = site.endsWith("/") ? site.slice(0, -1) : site;
const siteAddress = new URL(site);

// https://astro.build/config
export default defineConfig({
  fonts: [
    {
      provider: fontProviders.local(),
      name: "CabinetGrotesk",
      cssVariable: "--font-cabinet-grotesk",
      display: "swap",
      fallbacks: ["system-ui", "sans-serif"],
      optimizedFallbacks: true,
      options: {
        variants: [
          {
            weight: "100 1000",
            style: "normal",
            src: ["./src/assets/fonts/CabinetGrotesk-Variable.woff2"],
          },
        ],
      },
    },
    {
      provider: fontProviders.local(),
      name: "Satoshi",
      cssVariable: "--font-satoshi",
      display: "swap",
      fallbacks: ["system-ui", "sans-serif"],
      optimizedFallbacks: true,
      options: {
        variants: [
          {
            weight: "100 1000",
            style: "normal",
            src: ["./src/assets/fonts/Satoshi-Variable.woff2"],
          },
          {
            weight: "100 1000",
            style: "italic",
            src: ["./src/assets/fonts/Satoshi-VariableItalic.woff2"],
          },
        ],
      },
    },
  ],
  site,
  integrations: [
    sitemap({ filter: (url) => !/\/(admin|api)(\/|$)/.test(new URL(url).pathname) }),
    robotsTxt({
      sitemap: [
        `${siteNoTrailingSlash}/sitemap-index.xml`,
        `${siteNoTrailingSlash}/sitemap-0.xml`,
      ],
    }),
    solidJs(),
    UnoCSS({ injectReset: true }),
    icon(),
    svelte(),
  ],
  markdown: unified({
    remarkPlugins: [remarkReadingTime],
  }),
  prefetch: {
    prefetchAll: true,
    defaultStrategy: "hover",
  },
  output: "server",
  security: {
    allowedDomains: [{
      protocol: siteAddress.protocol.slice(0, -1),
      hostname: siteAddress.hostname,
      port: siteAddress.port || undefined,
    }],
  },
  adapter: node({ mode: "standalone" }),
  session: {
    driver: sessionDrivers.fsLite({ base: ".data/sessions" }),
    ttl: 1800,
    cookie: {
      name: "mystarry-session",
      sameSite: "strict",
      secure: site.startsWith("https:"),
      path: "/",
    },
  },
  vite: {
    assetsInclude: "**/*.riv",
  },
});
