# HTTPS 迁移记录

2026-10-21：仓库配置迁移至 `https://xingchenli.top/`；服务器切换与公网验收由部署流程另行记录，本文件此时不声明上线已完成。

- HTTP 与 www 统一跳转到 HTTPS 主域名。
- 现有 awards-nginx 提供 TLS，保留其他站点配置；证书位于 `/home/lxc/awards/certs/manual/xingchenli.top/`，沿用已有只读挂载。
- 本项目目录 `/home/ubuntu/astro-bento-portfolio`，Compose 项目 `astro-bento`。
- web 容器 astro-bento-portfolio 连接默认网络与 backend_awards-net，别名 mystarry-web；最终配置不发布宿主机端口。
- app 容器 mystarry-blog-app 只连接默认网络；SQLite、限流、会话和运行密钥继续持久保存在原目录。
- 内部 Nginx 仅信任边缘地址 `172.18.0.4`，边缘容器重建时需重新核验。
- 发布器从 web 容器内请求 `127.0.0.1:8080` 验证页面、API、健康与提交身份，保留数据库备份及失败回滚检查。
- 静态页面解除预览 noindex；留言板、后台和 API 保持 noindex。

切换顺序：临时服务器 Compose 保留旧 8550 入口与共享网络，安装新版发布器并统一构建及运行期 HTTPS 地址，完成仓库审查后发布 HTTPS 构建。Astro 的会话 Secure 和允许域名来自构建期，不能仅更新运行环境。HTTPS 验收通过后才安装无端口 Compose 并确认旧入口关闭。最终验收需核对证书、同源写入、Secure Cookie、页面 canonical/sitemap、新部署提交，以及原数据与其他容器保持不变。

配置安装、内部健康检查、续期与回滚步骤见同目录 `README.md`。
