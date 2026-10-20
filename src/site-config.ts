const siteUrl = import.meta.env.PUBLIC_SITE_URL ?? "http://localhost:4321/";
export const DOMAIN = new URL(siteUrl).host;
export const SITE = {
  site: { domain: DOMAIN, url: siteUrl },
  author: {
    firstName: "星辰",
    lastName: "李",
    fullName: "李星辰",
    shortName: "星辰",
    jobTitle: "AI 与软件开发",
    twitterHandle: "",
  },
  location: {
    countryName: "中国",
    countryCode: "CN",
    city: "北京",
    timezone: "Asia/Shanghai",
  },
  links: {
    github: "https://github.com/bupt-lxc",
    repo: "https://github.com/Ladvace/astro-bento-portfolio",
    bilibili: "https://space.bilibili.com/22835579",
    email: "lxc983@bupt.edu.cn",
    phone: "+86 18915790233",
    linkedin: "",
    medium: "",
    dribbble: "",
    behance: "",
  },
  visitedCountries: ["China", "France", "Germany", "Luxembourg", "Belgium"],
};
