# 服务器部署与维护

首页、作品集、博客与旅行页在本地预渲染，由独立 Nginx 提供。留言板和管理后台使用官方 Astro Node adapter，连接本地 SQLite。原有 80/443、8530 等项目不需要修改。

- 目录：`/home/ubuntu/astro-bento-portfolio`；Compose 项目：`astro-bento`。
- 公网预览端口：`8550`；Nginx 容器 `astro-bento-portfolio`，内存上限 64 MiB。
- Node 24 容器 `mystarry-blog-app`，内存上限 192 MiB，无宿主机端口，仅供本项目 Docker 网络访问。
- `current` 指向 `releases/<版本>/site`；`data/` 持久保存 SQLite、限流与管理会话。
- `.env` 存放镜像、端口；权限 600 的 `.app.env` 存放运行期站点地址和独立管理密钥，均不提交 Git。
- 页面默认使用原项目黄色 Neon。预览统一 noindex，正式域名准备好后再解除。

## master 自动发布

`.github/workflows/deploy.yml` 在每次推送 `master` 后触发，也可以在 GitHub Actions 的 **Deploy personal website → Run workflow → master** 手动重试。其他分支不会发布。工作流串行执行，不取消正在切换的发布。

GitHub 托管 runner 完成 Node 24/pnpm 11 依赖安装、Node/Python 测试、类型检查、Astro 构建和 linux/amd64 镜像打包，再通过受限 SSH 发布。服务器不编译项目。

本仓库的 Actions 配置如下；留言管理密码和 HMAC 密钥仍只保存在服务器 `.app.env`，不添加到 GitHub。

| 类型 | 名称 | 用途 |
| --- | --- | --- |
| Secret | `DEPLOY_SSH_KEY` | 专用 Ed25519 私钥，只在上传步骤注入 |
| Variable | `PUBLIC_SITE_URL` | `http://81.70.231.92:8550/`，构建时公开地址 |
| Variable | `DEPLOY_HOST` | 服务器 IP |
| Variable | `DEPLOY_PORT` | SSH 端口 22 |
| Variable | `DEPLOY_USER` | `mystarry-deploy` |
| Variable | `DEPLOY_KNOWN_HOSTS` | 已核验的固定服务器 SSH 公钥，不使用动态 keyscan |

专用账号没有 Docker 组权限、交互 shell、PTY、代理转发或端口转发。其唯一授权密钥只执行 root 所有的 `/usr/local/lib/mystarry/gateway.sh`，通过有限 sudo 调用 `publisher.py`，只接受 `check` 或 `deploy <完整commit SHA> <包SHA-256>`。

发布包只包含静态文件压缩包和镜像压缩包，不能替换服务器 Compose、Nginx、`.env` 或 `.app.env`。发布程序验证大小、路径、文件类型、镜像标签、OCI 配置和 commit，固定操作 `astro-bento` 的 web/app，继续使用 8550。每次发布前先一致性备份 SQLite 并检查完整性，再保存旧静态目录和不可变镜像 ID。

验收失败或捕获到 SIGINT/SIGTERM/SIGHUP 时，恢复旧代码与镜像，保留当时的数据库、会话、限流及运行密钥。发布记录在服务器 `deployments/*.json`，包含 `status`、`old_current`、`old_image`、`backup` 和 `rollback`；临时发布包会清理，旧版本和备份保留。突然断电或 SIGKILL 无法触发进程内恢复，重启后可根据记录手动回滚。

只想重试发布时，在 Actions 重跑失败任务或手动运行 master 即可。更新可信发布程序属于单独运维步骤：核对仓库的 `deployment/publisher.py` 和安装脚本后，用原有管理员 SSH 上传，以 root 在该目录运行 `sh install-publisher.sh <部署公钥文件>`。该步骤不会从自动发布包更新程序，避免上传权限扩展到任意主机命令。不要重新生成已有私钥；若要轮换，先安装新公钥，再更新 `DEPLOY_SSH_KEY` 并验证 `check`。

自动发布使用服务器现有配置。要修改端口、挂载、Nginx 或容器权限，应先人工审查并更新本项目服务器配置，再运行发布。当前 Node 固定 UID/GID 1000:1000，删除所有 Linux capabilities；数据目录权限保持不变。

手动代码回滚时，先读取指定发布记录的 `old_current` 与 `old_image`，确认目标位于本项目 `releases/` 内且镜像仍在，然后仅更新 `current` 和 `.env` 的 `PORTFOLIO_IMAGE`，按下方 stop/rm/up 命令重建 web/app。不要恢复旧数据库来回滚代码，也不要执行全局 Docker 清理命令。

正式域名启用时，还需更新 GitHub Variable `PUBLIC_SITE_URL` 和服务器 `.app.env` 的同名值，再运行一次 master 发布。

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
