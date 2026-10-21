# HTTPS 迁移记录

2026-10-21（北京时间）：正式域名 `https://xingchenli.top/` 已上线并通过公网 HTTPS 与浏览器验收；确认可用后，已撤掉宿主机 8550 端口映射。

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

## 本次验收

- HTTPS 构建发布 `ee67e121704d949be7a17b096b0177bcfdd34231` 成功，Actions 记录：https://github.com/bupt-lxc/MyStarry-Blog/actions/runs/39536565829 。
- 证书包含 `xingchenli.top`、`www.xingchenli.top`，私钥匹配；公网证书链、域名与证书指纹校验通过，TLS 1.3 握手正常。到期时间为北京时间 2027-01-19 08:59:59。
- 首页、作品集、项目详情、留言板、留言 API、健康检查及 sitemap 返回 200；HTTP/www 保留路径及查询参数跳转到 HTTPS 主域名；canonical/sitemap 使用正式地址。
- 留言提交 201、管理登录与会话正常，访客和管理 Cookie 均为 Secure；不可信 Origin 返回 403，伪造客户端来源头仍受限流并返回 429。验收留言已通过管理接口删除。
- 8550 无宿主机监听、无 Docker PortBindings，公网连接被拒绝；撤掉端口后，发布器仍通过 web 容器内探针验证正确提交。
- 64 个其他容器的 ID 和启动时间保持不变，原 Nginx 配置仅追加本站 include，原站证书保持不变，原可用页面响应未变。
- 原留言数据、会话文件与运行密钥保留；限流验收按原应用逻辑记录请求及清理过期项，没有直接修改或恢复数据库。
- 原配置、静态目录目标和不可变镜像已保存到服务器 `backups/https-20261021T025401Z/`，未触发回退；临时私钥上传目录已清理，正式证书和回退备份保留。
- GitHub 构建变量与服务器运行地址统一为 HTTPS，首页二维码同步更新为正式域名。
