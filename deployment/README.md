# 服务器部署

该版本在本地生成静态文件，由独立 Nginx 容器提供访问。原有 80/443 端口和 Nginx 项目不需要修改。

- 服务器目录：`/home/ubuntu/astro-bento-portfolio`
- Compose 项目：`astro-bento`
- 容器：`astro-bento-portfolio`
- 默认端口：`8550`，容器内部端口 `8080`
- 健康检查：`/healthz`
- 常驻内存上限：64 MiB；CPU 上限：0.25 核
- 自动重启：`unless-stopped`
- 发布目录：`releases/<release-id>`；`current` 指向当前版本

## 本地构建

本项目使用 Node.js 24。首次运行 `pnpm install --frozen-lockfile --ignore-scripts`。
复制 `.env.example` 为项目自己的 `.env`，设置 `PUBLIC_SITE_URL` 为实际公开地址，然后运行：

```powershell
pnpm build
```

工作区根目录 `.env` 内的 SSH 凭据仅用于本地连接，不会进入构建产物或上传到服务器。

## 服务器维护

```sh
cd /home/ubuntu/astro-bento-portfolio
sudo docker-compose -p astro-bento ps
sudo docker-compose -p astro-bento logs --tail=50 web
sudo docker exec astro-bento-portfolio nginx -t
curl -fsS http://127.0.0.1:8550/healthz
```

`docker-compose.yml` 复用服务器已有的 `nginx:1.25-alpine` 镜像。
更新 Nginx 配置时先 `nginx -t`，通过后才对本项目的容器执行 `nginx -s reload`。

## 发布和回滚

将本地 `dist/` 上传到新的 `releases/<release-id>/`，再把 `current` 符号链接指向新版本。
Docker 会解析宿主机符号链接，因此切换版本后应执行以下命令重新挂载：

```sh
sudo docker-compose -p astro-bento stop web
sudo docker-compose -p astro-bento rm -f web
sudo docker-compose -p astro-bento up -d --no-build web
```

旧发布目录会保留。回滚时把 `current` 指回之前的目录，再重新创建本项目 web 容器。

## 后续绑定域名

备案完成后，将 `PUBLIC_SITE_URL` 改为正式 HTTPS 域名并重新构建、发布。
现有 Nginx 在 `awards-nginx` 容器中运行；它的 `127.0.0.1` 指向容器本身。
为域名增加独立虚拟主机时，应通过已核验的宿主机网关访问 8550，或显式加入共享网络，
不要直接填写 `proxy_pass http://127.0.0.1:8550`。
配置独立域名及证书后，移除本项目 `nginx.conf` 的 `X-Robots-Tag` 预览限制。

## 当前内容范围

首页、作品展示、交互演示和博客页面可访问；仓库目前没有博客文章。
个人姓名、头像、社交账号和作品仍是模板作者的示例，发布个人求职内容前需要替换。
留言板页面仅显示未开启提示；动态 API 返回 503，不接入数据库。
没有配置统计 ID 时，不加载 Umami 或 Ahrefs 统计脚本。
