# 作品集内容维护

`src/data/projects/` 中每个 Markdown 文件对应一个独立项目。文件名与 `slug` 保持一致，`order` 控制列表展示顺序。前言区采用 JSON（合法的 YAML 子集），由 Astro 集合 schema 和独立校验脚本共同检查。

必填字段为 `slug`、`title`、`context`、`period`、`summary`、`role`、`outcomes`、`tags`、`order`、`links`。`cover` 与 `coverAlt` 用于真实项目图片；没有图片时省略，由卡片显示文字封面。项目链接仅填写有来源的公开 HTTP／HTTPS 地址。`cover` 和 Markdown 图片路径均相对于当前 Markdown 文件。

原始 Markdown 与全部 11 张图片原样保存在 `docs/source-materials/portfolio/`。网站图片副本位于 `src/assets/projects/`；校验脚本检查路径、使用情况与原图字节一致性。v2 简历仅用于校正内容，没有复制或发布 PDF。

v2 覆盖的主要信息：POMP 为 170+ 用户、4500+ 封邮件；新华医疗项目为 2025.05—2026.08、97% 查询正确率、Top-5 召回率 59% → 83%、View 命中场景 7min → 20s；华小博为 2026.01—2026.07、11 处场馆、6000 余名用户；电信实习为 2026.07—2026.10。AISHPerf 的两类职责合并在同一个项目中，并分别说明个人职责边界。

运行：

```sh
pnpm exec tsx --test tests/projects.test.ts
pnpm exec tsx scripts/validate-projects.ts
pnpm exec astro check
pnpm build
```

博客从 `src/data/blog/` 集合读取。没有文章时显示中文空状态；新增真实文章后列表按发布日期倒序显示，详情与 RSS 使用同一集合。
