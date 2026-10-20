import { createClient } from "@libsql/client";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const target = process.argv[2];
if (!target) {
  console.error("用法：node scripts/backup-guestbook.mjs <新的备份文件路径>");
  process.exitCode = 1;
} else {
  const url = process.env.GUESTBOOK_DATABASE_URL ?? "file:/data/guestbook.db";
  if (!url.startsWith("file:"))
    throw new Error("备份仅支持本地 SQLite 数据库。");
  const client = createClient({ url });
  try {
    const path = resolve(target);
    await mkdir(dirname(path), { recursive: true });
    // VACUUM INTO makes a transactionally consistent snapshot, including WAL data.
    // SQLite refuses an existing non-empty target rather than overwriting a backup.
    await client.execute({ sql: "VACUUM INTO ?", args: [path] });
    console.log("留言数据库备份完成。");
  } finally {
    client.close();
  }
}
