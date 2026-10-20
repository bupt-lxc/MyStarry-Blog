# 版本验收记录

版本 `20261020-234939` 已发布到 `http://81.70.231.92:8550/`，使用独立 Nginx 与内部 Node 容器。

- `pnpm test`：20 项通过，无跳过；包括真实 SQLite 重开、级联删除、限流持久化、并发登录锁定及一致性备份恢复。
- `pnpm check`：0 errors、0 warnings、3 hints（含 HTTP 复制回退所用旧剪贴板 API 的弃用提示）。
- `pnpm build` 与 Linux Docker 构建通过；8 组项目、11 张图片引用通过构建前校验。
- 规格审查与代码安全审查完成；修复 RSS/旧地址预渲染、技能遗漏、指标单位、国家中文名与并发登录限流。
- 实际 Nginx/Node 容器本地及公网各完成 38 项 HTTP 检查，覆盖公开页面、RSS、sitemap、验证错误、同源与权限校验、提交、点赞幂等、重启持久化、回复、删除及退出。
- 公网浏览器验证：留言立即展示、限流后输入保留、后台登录退出、非 HTTPS 地址复制回退、技能弹窗与焦点恢复。临时验收留言已删除。
- 浏览器检查：1440×900 首页页面高度 900；390px 自然滚动、无横向溢出；作品集手机单列，详情图片支持 PhotoSwipe 与方向键、Esc。主题偏好刷新和页面跳转后保留。
- 故障注入：SQLite 目录不可写时 API 503，首页与作品集仍 200。
- 生产备份 `/data/backups/verified-clean-20261020.db` 的 `PRAGMA integrity_check` 为 `ok`；测试清理后留言总数 0。
- 原有其他容器 ID、启动时间未变；原 Nginx 配置 SHA-256 保持 `d8d3e69e04ff15bae1cae074d4b20dab51de57cca20560614aedddde9c75f455`；已有域名与 8530 项目均 200。
- Node 没有公网端口；实测 Node 约 45 MiB、Nginx 约 6 MiB，限额分别 192/64 MiB。

博客尚无文章，使用中文空状态。正式域名和 HTTPS 待备案完成后绑定；当前预览保持 noindex。管理凭据在本地忽略目录 `.deploy/admin-access.txt`，未进入 Git、构建产物或镜像。
