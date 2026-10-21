# 服务器部署与维护

正式入口为 `https://xingchenli.top/`，HTTP 和 www 均跳转到该地址。首页、项目、博客与旅行页由独立 Nginx 提供预渲染文件；留言板与后台使用 Astro Node adapter 和 SQLite。当前服务器迁移验收事实见 `STATUS.md`。

- 目录：`/home/ubuntu/astro-bento-portfolio`；Compose 项目：`astro-bento`。
- web 容器 `astro-bento-portfolio`，内存上限 64 MiB，不发布宿主机端口。旧预览端口 8550 在 HTTPS 验收后关闭。
- web 连接本项目默认网络与外部 `backend_awards-net`，在后者使用别名 `mystarry-web`。app 容器 `mystarry-blog-app` 仅在默认网络，Node 24、UID/GID 1000:1000、内存上限 192 MiB。
- `current` 指向 `releases/<版本>/site`；`data/` 持久保存 SQLite、限流与管理会话。
- `.env` 存放镜像；权限 600 的 `.app.env` 存放站点地址和独立管理密钥，均不提交 Git。
- 静态页面允许索引；`/guestbook`、`/admin`、`/api` 保持 noindex。

## master 自动发布

`.github/workflows/deploy.yml` 每次推送 master 后执行，也可在 GitHub Actions 的 **Deploy personal website → Run workflow → master** 重试。其他分支不发布。工作流串行执行，不取消正在切换的发布。

GitHub runner 安装 Node 24/pnpm 11，完成 Node/Python 测试、类型检查、构建与 linux/amd64 镜像打包，经受限 SSH 上传。服务器不编译项目。

| 类型 | 名称 | 用途 |
| --- | --- | --- |
| Secret | `DEPLOY_SSH_KEY` | 专用 Ed25519 私钥，仅在上传步骤注入 |
| Variable | `PUBLIC_SITE_URL` | `https://xingchenli.top/`，构建时公开地址 |
| Variable | `DEPLOY_HOST` | 服务器 IP |
| Variable | `DEPLOY_PORT` | SSH 端口 22 |
| Variable | `DEPLOY_USER` | `mystarry-deploy` |
| Variable | `DEPLOY_KNOWN_HOSTS` | 已核验的固定 SSH 公钥，不动态 keyscan |

部署账号没有 Docker 组权限、交互 shell、PTY 或转发权限。授权密钥只执行 root 所有的 `/usr/local/lib/mystarry/gateway.sh`，通过有限 sudo 调用 `publisher.py`，仅接受 `check` 或 `deploy <完整commit SHA> <包SHA-256>`。留言密码与 HMAC 密钥仅在服务器 `.app.env`，不添加到 GitHub。

发布包仅有静态压缩包与镜像压缩包，不能替换 Compose、Nginx 或环境配置。发布器验证大小、路径、文件类型、镜像标签、OCI 配置和 commit，固定操作本项目 web/app。健康检查在 web 容器内部请求 8080，不依赖公网端口；`check` 与发布结果的 `endpoint` 为 `astro-bento-portfolio:8080`。每次发布前一致性备份 SQLite、检查完整性，并保存旧静态目录与不可变镜像 ID。

验收失败或捕获 SIGINT/SIGTERM/SIGHUP 时恢复旧代码和镜像，保留数据库、会话、限流及密钥。服务器 `deployments/*.json` 记录 `status`、`old_current`、`old_image`、`backup`、`rollback`。临时上传包自动清理，旧版本与备份保留。断电或 SIGKILL 无法触发进程内恢复，需根据记录手动回滚。

更新可信发布器是独立运维步骤：核对仓库程序与安装脚本后，通过管理员 SSH 上传，以 root 在部署目录运行 `sh install-publisher.sh <部署公钥文件>`。自动发布包不能更新发布器。不要重新生成已有私钥；轮换时先安装新公钥，再更新 GitHub Secret 并验证 check。

构建期 GitHub Variable、本地构建环境与服务器 `.app.env` 的 `PUBLIC_SITE_URL` 应统一为 `https://xingchenli.top/`，再运行 master 发布。

## 本地构建与手动发布

使用 Node 24、pnpm 11，复制 `.env.example` 为 `.env`，配置实际公开地址。

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm test
python3 -m unittest discover -s tests -p 'test_*.py' -v
pnpm check
pnpm build
docker build -f deployment/Dockerfile -t mystarry-blog:<版本> .
```

构建前检查项目元数据与图片。静态产物在 `dist/client/`，Node 入口在 `dist/server/entry.mjs`。Docker 上下文使用白名单，不含 SSH 凭据、运行密钥、数据库或原始简历。

上传版本化镜像归档、静态产物和本项目配置前，备份当前配置与 current 目标；已有留言库先做一致性备份。新建 `releases/<版本>/site`，设置 `.env` 中镜像与 `.app.env` 中站点地址；data 目录保持 700、UID/GID 1000。只重建本项目 web/app；旧版 Compose 在 Docker 29 直接 recreate 可能报错，先 stop/rm。

```sh
cd /home/ubuntu/astro-bento-portfolio
sudo docker-compose -p astro-bento stop web app
sudo docker-compose -p astro-bento rm -f web app
sudo docker-compose -p astro-bento up -d --no-build
sudo docker exec astro-bento-portfolio nginx -t
sudo docker exec astro-bento-portfolio wget -q -T 5 -O - http://127.0.0.1:8080/healthz
sudo docker exec astro-bento-portfolio wget -q -T 5 -O - 'http://127.0.0.1:8080/api/guestbook?page=1'
sudo docker exec astro-bento-portfolio wget -q -T 5 -O - http://127.0.0.1:8080/deployment.json
curl -fsS https://xingchenli.top/
```

切换静态链接后重建 web 更新挂载；重建 app 时同时重建 web 刷新上游地址。不操作其他 Compose 项目。自动发布还检查首页和 `/projects/`，并比对 deployment.json 中 commit。

## HTTPS 配置、信任来源与续期

现有 awards-nginx 继续持有 80/443。`nginx-https.conf` 是其 http context include，保留原虚拟主机全部内容，仅追加 include 行。证书真实存放在宿主机 `/home/lxc/awards/certs/manual/xingchenli.top/`，沿用已有只读证书挂载，在容器内为 `/etc/letsencrypt/manual/xingchenli.top/`。配置读取其中的 `fullchain.pem` 与 `privkey.pem`。边缘 include 文件也放在该已有挂载内，避免重建其他项目容器。证书与私钥不进入 Git、发布包或镜像。

首次安装先备份原 Nginx 配置、证书目录与本项目配置。共享网络必须已经存在；边缘使用 Docker DNS `127.0.0.11` 每 10 秒重新解析 `mystarry-web:8080`，本项目 web 替换后不需重载边缘。执行 `sudo docker exec awards-nginx nginx -t` 成功后，才运行 `sudo docker exec awards-nginx nginx -s reload`。

边缘覆盖 Host、X-Forwarded-Host、X-Real-IP、XFF 和 HTTPS 协议头，并清除外来的 `X-Portfolio-Client-IP`。内部 Nginx 仅信任已核验的边缘地址 `172.18.0.4` 的 X-Real-IP，基于原始 socket 地址 `$realip_remote_addr` 判定 HTTPS，再覆盖传给应用的专用来源头、XFF、X-Real-IP 和协议头。其他节点的转发头不能改变来源与协议。

**替换或重建 awards-nginx 前，重新核验其在 `backend_awards-net` 的地址，并同步本项目 nginx.conf。不要扩大为信任整个 `172.18.0.0/16`。**

迁移期间先用包含共享网络和原 8550 映射的临时服务器 Compose。Astro 的会话 Secure 设置与 security.allowedDomains 由构建期地址生成，因此仅更改运行环境不足以完成切换：先安装新版发布器，统一构建与运行期 HTTPS 地址，完成仓库审查后发布 HTTPS 构建，发布过程仍保留旧端口。验证 HTTPS 页面、API 同源写入、Secure Cookie 与外站 Origin 拒绝通过后，才安装仓库最终无端口 Compose，重建本项目 web 并验证旧端口已无监听和 Docker 绑定。失败则恢复本次配置与站点地址，保留旧入口直至验收通过。

证书为手动安装，当前配置不提供自动续期。到期前向签发机构续签，核验 SAN 覆盖 apex 和 www、证书与私钥匹配且日期正确。备份现有文件，将新 fullchain.pem 与 privkey.pem 安装到上述宿主机目录（目录 700、私钥 600），保持路径不变；运行边缘 nginx -t 后 graceful reload，再以正常 CA 与主机名验证检查两个 HTTPS 域名及跳转。失败时恢复文件并重新校验。仅更新证书不重启 app/web，不修改 SQLite 或其他项目证书。当前未配置 HSTS preload。

## 留言、后台与备份

管理入口 `/admin/guestbook` 不在导航或 sitemap，密码位于服务器 `.app.env` 的 `GUESTBOOK_ADMIN_PASSWORD`；本地交接文件在忽略目录 `.deploy/admin-access.txt`。

- 访客无需登录；昵称 1–32 字、正文 1–1000 字，网站仅 HTTP(S)。
- 留言与回复每来源 60 秒 1 条、每小时 10 条；点赞每分钟 30 次，同浏览器重复点赞不增加计数。
- 登录失败每来源 15 分钟最多 5 次；管理会话 30 分钟，删除会级联清理回复与点赞。
- `.app.env` 必须有至少 32 字符的独立 `GUESTBOOK_RATE_LIMIT_SECRET` 和正确 PUBLIC_SITE_URL。库内来源使用 HMAC；Nginx 日志仍有常规客户端地址。
- 数据库异常时 API 返回 503，静态页面独立可用。

```sh
sudo docker exec mystarry-blog-app node scripts/backup-guestbook.mjs /data/backups/guestbook-YYYYMMDD-HHMM.db
```

备份使用 SQLite VACUUM INTO，包含 WAL 中已提交数据，不直接复制活跃数据库；目标应为新文件。宿主机备份在 data/backups，建议定期异机复制。

恢复时先停 app，保留当前数据库及 WAL/SHM 作为回退，再安装已验证备份为 data/guestbook.db、所有者 1000:1000，重建 app/web。代码回滚不能恢复旧数据库：读取发布记录的 old_current 与 old_image，确认目录在本项目 releases 下且镜像仍在，仅更新 current 与 PORTFOLIO_IMAGE，再执行上方 stop/rm/up。保留会话、限流和运行密钥，不执行全局 Docker 清理。

## 日志

```sh
sudo docker-compose -p astro-bento ps
sudo docker-compose -p astro-bento logs --tail=50 app web
sudo docker stats --no-stream mystarry-blog-app astro-bento-portfolio
```
