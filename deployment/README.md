# 服务器部署与维护

首页、作品集、博客与旅行页在本地预渲染，由独立 Nginx 提供。留言板和管理后台使用官方 Astro Node adapter，连接本地 SQLite。原有 80/443、8530 等项目不需要修改。

- 目录：`/home/ubuntu/astro-bento-portfolio`；Compose 项目：`astro-bento`。
- 公网预览端口：`8550`；Nginx 容器 `astro-bento-portfolio`，内存上限 64 MiB。
- Node 24 容器 `mystarry-blog-app`，内存上限 192 MiB，无宿主机端口，仅供本项目 Docker 网络访问。
- `current` 指向 `releases/<版本>/site`；`data/` 持久保存 SQLite、限流与管理会话。
- `.env` 存放镜像、端口；权限 600 的 `.app.env` 存放运行期站点地址和独立管理密钥，均不提交 Git。
- 页面默认使用原项目黄色 Neon。预览统一 noindex，正式域名准备好后再解除。

## 本地构建

使用 Node 24、pnpm 11。复制 `.env.example` 为 `.env`，设置实际 `PUBLIC_SITE_URL`。

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm test
pnpm check
pnpm build
docker build -f deployment/Dockerfile -t mystarry-blog:<版本> .
```

构建前校验八组项目元数据及图片引用。静态文件在 `dist/client/`，Node 入口在 `dist/server/entry.mjs`。Docker 上下文使用白名单，仅包含产物、依赖声明和备份脚本，不包含 SSH 凭据、运行密钥、数据库或原始简历。

## 发布

本地完成 Linux 容器验收后，上传版本化镜像归档、`dist/client/`、本目录三个配置文件。服务器 `docker load` 导入镜像，无需编译。

1. 备份配置、`current` 目标；已有留言库先执行一致性备份。
2. 新建 `releases/<版本>/site`，设置 `.env` 的 `PORTFOLIO_IMAGE`；配置 `.app.env`。
3. `data/` 权限 700、所有者 UID/GID 1000，Node 以该普通用户运行。
4. 仅重建本项目 web/app。旧版 Compose 在 Docker 29 上直接 recreate 可能报错，先 stop/rm。
5. 检查 app 健康、`nginx -t`、页面、留言及其他项目；失败则还原本项目配置和 `current`。

```sh
cd /home/ubuntu/astro-bento-portfolio
sudo docker-compose -p astro-bento stop web app
sudo docker-compose -p astro-bento rm -f web app
sudo docker-compose -p astro-bento up -d --no-build
sudo docker exec astro-bento-portfolio nginx -t
curl -fsS http://127.0.0.1:8550/healthz
curl -fsS http://127.0.0.1:8550/api/guestbook?page=1
```

切换静态目录符号链接后重建 web 以更新挂载。重建 app 时同时重建 web，刷新上游地址。不要操作其他 Compose 项目。

## 留言与后台

管理入口 `/admin/guestbook` 不出现在导航或 sitemap。密码位于服务器 `.app.env` 的 `GUESTBOOK_ADMIN_PASSWORD`；本地交接文件在工作区忽略目录 `.deploy/admin-access.txt`。

- 访客无需登录，提交后立即展示；昵称 1–32 字符，正文 1–1000 字符，网站只接受 HTTP(S)。
- 留言与回复每来源 60 秒 1 条、每小时 10 条；点赞每分钟 30 次，同浏览器重复点赞不增加计数。
- 登录失败每来源 15 分钟最多 5 次；管理会话 30 分钟。删除前确认，级联清理回复与点赞。
- `.app.env` 还需至少 32 字符的 `GUESTBOOK_RATE_LIMIT_SECRET`，以及与访问地址一致的 `PUBLIC_SITE_URL`。库内来源使用 HMAC；Nginx 访问日志仍有常规客户端地址。
- Nginx 覆盖专用来源头与 XFF，应用不信任任意转发链。数据库异常时 API 返回 503，静态页面独立可用。

## 备份、恢复与回滚

```sh
sudo docker exec mystarry-blog-app node scripts/backup-guestbook.mjs /data/backups/guestbook-YYYYMMDD-HHMM.db
```

备份使用 SQLite `VACUUM INTO`，包含 WAL 中已提交数据，不直接复制正在写入的数据库。目标应为新文件。宿主机文件在 `data/backups/`，建议定期复制到异机。

恢复先停 app，保留当前数据库及 `-wal`、`-shm` 为回退，再将已验证备份放为 `data/guestbook.db`、所有者 1000:1000，重建 app/web。数据库不是发布产物，代码回滚不要覆盖它。

回滚代码时恢复 `backups/pre-<版本>/` 的 Compose/Nginx/.env 及 `current-target`，重建本项目容器。若同时改了密钥，还原备份 `app.env`。不删除旧版本或留言数据。

## 日志与正式域名

```sh
sudo docker-compose -p astro-bento ps
sudo docker-compose -p astro-bento logs --tail=50 app web
sudo docker stats --no-stream mystarry-blog-app astro-bento-portfolio
```

备案完成后，同时更新构建期及运行期 `PUBLIC_SITE_URL` 为正式 HTTPS 地址，重新构建发布，保证同源校验和 Secure Cookie 正常。为原 Nginx 添加独立虚拟主机及证书时，容器内 `127.0.0.1` 指向容器本身，需使用已核验宿主机网关或共享网络转发至 8550。最后移除本项目 Nginx 的预览 noindex 头。
