# 自动发布验收记录

日期：2026-10-21。目标仓库：`bupt-lxc/MyStarry-Blog`，发布分支：`master`。

## 发布配置

- GitHub 托管 runner 构建静态页面与 Linux/amd64 Node 镜像，服务器继续使用 8550。
- 专用 `mystarry-deploy` 账号不属于 Docker 组；SSH 公钥固定 forced command，禁止 PTY、代理和端口转发。实际测试 `check` 成功，任意 shell 命令及端口转发请求被拒绝。
- 部署私钥存入仓库 Secret，主机、公钥指纹和公开地址存入 Variables。服务器 `.app.env` 未进入仓库、构建包或 Actions。
- 每次发布先备份 SQLite 并执行完整性检查。失败时恢复旧静态目录与不可变镜像，数据库不回退。

## 本地验证

- Node 测试：20/20 通过。
- Python 部署测试：19/19 通过，包括路径穿越、链接、重复成员、解压上限、镜像标签/OCI 元数据攻击、备份失败、不可变镜像回滚和中断信号恢复。
- `pnpm check`：0 errors，0 warnings，3 条已有 hints；`pnpm build` 成功。
- actionlint 1.7.12、Git diff 空白检查、Git 可见文件密钥排查通过。
- 真实 Docker Linux 镜像打包后，通过发布程序的 Docker/OCI 归档校验。
- 独立代码审查的中断恢复问题已修复，并通过信号回归测试及复审。

## master 推送验收

首次推送触发 [Actions 39462296824](https://github.com/bupt-lxc/MyStarry-Blog/actions/runs/39462296824)。测试、检查和构建通过，但跨境 SSH 上传速度不足，主动取消；取消后临时上传目录自动清理，线上仍为原版本。

上传重试启用 runner 侧可用的 BBR，并设置 SSH `IPQoS=none`，服务器网络配置不变。重试：[Actions 39463007867](https://github.com/bupt-lxc/MyStarry-Blog/actions/runs/39463007867)，触发提交 `cbb4c507889ad20532006453786d22226326b9fc`。

该次运行已成功，服务器发布记录为 `succeeded`，无需回滚。网站 `/deployment.json` 返回上述完整 commit，web/app 均为 healthy；Node 的实际用户是 `1000:1000`，capabilities 为 `ALL` dropped。

- `/`、`/projects/`、留言 API、`/healthz` 验证通过。
- 发布前创建临时留言及一个点赞，登录管理后台，再对 SQLite 三张表的既有记录与会话文件取摘要。发布后既有记录和会话文件逐项一致，同一管理会话继续有效；临时留言、内容和点赞保持。仅删除本次临时留言并退出测试会话。
- `.app.env` 与原有 Nginx 配置 SHA-256 一致。
- 其他运行容器的 ID、StartedAt 与部署前快照一致；会议项目 8530 与既有 HTTPS 域名均返回 200。
- 服务器生成一致性备份 `data/backups/deploy-20261020T171204Z-cbb4c507889ad20532006453786d22226326b9fc-dca15901.db`，发布前完整性检查通过。

上述记录不包含访客内容、会话凭据、SSH 私钥或运行密钥。后续当前版本以 `/deployment.json` 与对应的 Actions 运行记录核对。

运维入口与重试、回滚、域名切换说明见 [部署文档](../../../deployment/README.md)。
