import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Client } from "@libsql/client";
import { count, desc, isNull } from "drizzle-orm";
import { createDatabase, Guestbook } from "../db";

export class GuestbookError extends Error {
  constructor(
    message: string,
    public status = 400,
    public retryAfter?: number,
  ) {
    super(message);
  }
}

export function positiveInteger(value: unknown): number {
  if (
    (typeof value !== "string" && typeof value !== "number") ||
    !/^[1-9]\d*$/.test(String(value))
  )
    throw new GuestbookError("页码或留言编号无效。");
  const result = Number(value);
  if (!Number.isSafeInteger(result))
    throw new GuestbookError("页码或留言编号无效。");
  return result;
}

export function validateEntry(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new GuestbookError("留言格式无效。");
  const data = input as Record<string, unknown>;
  const name = typeof data.name === "string" ? data.name.trim() : "";
  const message = typeof data.message === "string" ? data.message.trim() : "";
  if (!name || name.length > 32)
    throw new GuestbookError("昵称需要 1–32 个字符。");
  if (!message || message.length > 1000)
    throw new GuestbookError("留言需要 1–1000 个字符。");
  let website: string | null = null;
  if (
    data.website !== undefined &&
    data.website !== null &&
    data.website !== ""
  ) {
    if (typeof data.website !== "string")
      throw new GuestbookError("网站地址无效。");
    website = data.website.trim();
    if (website) {
      let parsed: URL;
      try {
        parsed = new URL(website);
      } catch {
        throw new GuestbookError("请填写完整的 HTTP 或 HTTPS 网站地址。");
      }
      if (
        website.length > 200 ||
        !["http:", "https:"].includes(parsed.protocol) ||
        !parsed.hostname
      )
        throw new GuestbookError(
          "网站地址仅支持 HTTP 或 HTTPS，最多 200 个字符。",
        );
    } else website = null;
  }
  let parentId: number | null = null;
  if (data.parentId !== undefined && data.parentId !== null) {
    if (typeof data.parentId !== "number")
      throw new GuestbookError("回复的留言编号无效。");
    parentId = positiveInteger(data.parentId);
  }
  return { name, message, website, parentId };
}

export type StoredEntry = {
  id: number;
  name: string;
  message: string;
  website: string | null;
  parentId: number | null;
  heartCount: number;
  createdAt: string;
  replies: StoredEntry[];
};
const asEntry = (row: Record<string, unknown>): StoredEntry => ({
  id: Number(row.id),
  name: String(row.name),
  message: String(row.message),
  website: row.website === null ? null : String(row.website),
  parentId: row.parentId === null ? null : Number(row.parentId),
  heartCount: Number(row.heartCount ?? 0),
  createdAt:
    row.createdAt instanceof Date
      ? row.createdAt.toISOString()
      : String(row.createdAt),
  replies: [],
});

export function createGuestbookStore(
  url: string,
  options: { now?: () => number } = {},
) {
  const now = options.now ?? Date.now;
  let connection: ReturnType<typeof createDatabase> | undefined;
  let initialized: Promise<void> | undefined;
  async function ready() {
    initialized ??= (async () => {
      if (!url.startsWith("file:"))
        throw new Error("Guestbook requires a local SQLite file URL.");
      const path = url.startsWith("file://")
        ? fileURLToPath(url)
        : url.slice(5);
      if (path !== ":memory:")
        await mkdir(dirname(resolve(path)), { recursive: true });
      connection = createDatabase(url);
      await connection.client.execute("PRAGMA journal_mode=WAL");
      await connection.client.execute("PRAGMA busy_timeout=5000");
      await connection.client.batch(
        [
          `CREATE TABLE IF NOT EXISTS Guestbook (id INTEGER PRIMARY KEY, name TEXT NOT NULL, message TEXT NOT NULL, website TEXT, parentId INTEGER, heartCount INTEGER DEFAULT 0, createdAt TEXT NOT NULL)`,
          `CREATE INDEX IF NOT EXISTS Guestbook_parent_created ON Guestbook(parentId, createdAt DESC, id DESC)`,
          `CREATE TABLE IF NOT EXISTS GuestbookReaction (messageId INTEGER NOT NULL, visitorHash TEXT NOT NULL, PRIMARY KEY(messageId,visitorHash))`,
          `CREATE TABLE IF NOT EXISTS GuestbookRateLimit (id INTEGER PRIMARY KEY, sourceHash TEXT NOT NULL, action TEXT NOT NULL, createdAt INTEGER NOT NULL)`,
          `CREATE INDEX IF NOT EXISTS GuestbookRateLimit_source ON GuestbookRateLimit(sourceHash,action,createdAt)`,
        ],
        "write",
      );
    })().catch((error) => {
      connection?.client.close();
      connection = undefined;
      initialized = undefined;
      throw error;
    });
    await initialized;
    return connection!;
  }
  let writeQueue = Promise.resolve();
  async function write<T>(
    fn: (tx: Pick<Client, "execute">) => Promise<T>,
  ): Promise<T> {
    await ready();
    const previous = writeQueue;
    let release!: () => void;
    writeQueue = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    // libsql's transaction.close() releases the transaction but leaves its
    // detached native SQLite connection open until GC. Own this connection so
    // close() deterministically releases WAL handles, including on Windows.
    let client: Client | undefined;
    try {
      client = createDatabase(url).client;
      await client.execute("PRAGMA busy_timeout=5000");
      await client.execute("BEGIN IMMEDIATE");
      try {
        const result = await fn(client);
        await client.execute("COMMIT");
        return result;
      } catch (error) {
        await client.execute("ROLLBACK");
        throw error;
      }
    } finally {
      client?.close();
      release();
    }
  }
  async function rate(
    tx: Pick<Client, "execute">,
    source: string,
    action: string,
    limits: [number, number][],
    record = true,
  ) {
    const at = now();
    await tx.execute({
      sql: "DELETE FROM GuestbookRateLimit WHERE createdAt <= ?",
      args: [at - 3600000],
    });
    for (const [window, limit] of limits) {
      const result = await tx.execute({
        sql: "SELECT COUNT(*) AS total, MIN(createdAt) AS first FROM GuestbookRateLimit WHERE sourceHash=? AND action=? AND createdAt>?",
        args: [source, action, at - window],
      });
      if (Number(result.rows[0].total) >= limit)
        throw new GuestbookError(
          "操作太频繁，请稍后再试。",
          429,
          Math.max(
            1,
            Math.ceil((Number(result.rows[0].first) + window - at) / 1000),
          ),
        );
    }
    if (record)
      await tx.execute({
        sql: "INSERT INTO GuestbookRateLimit(sourceHash,action,createdAt) VALUES(?,?,?)",
        args: [source, action, at],
      });
  }
  return {
    async list(page = 1) {
      positiveInteger(page);
      // Bounding the offset avoids unsafe arithmetic, even for valid safe integers.
      if (page > 100000000) throw new GuestbookError("页码超出范围。");
      const { db, client } = await ready();
      const [{ total }] = await db
        .select({ total: count() })
        .from(Guestbook)
        .where(isNull(Guestbook.parentId));
      const roots = await db
        .select()
        .from(Guestbook)
        .where(isNull(Guestbook.parentId))
        .orderBy(desc(Guestbook.createdAt), desc(Guestbook.id))
        .limit(10)
        .offset((page - 1) * 10);
      const entries = roots.map((row) => asEntry(row));
      if (entries.length) {
        const ids = entries.map((entry) => entry.id);
        const children = await client.execute({
          sql: `WITH RECURSIVE descendants AS (SELECT * FROM Guestbook WHERE parentId IN (${ids.map(() => "?").join(",")}) UNION ALL SELECT g.* FROM Guestbook g JOIN descendants d ON g.parentId=d.id) SELECT * FROM descendants ORDER BY createdAt,id`,
          args: ids,
        });
        const all = new Map(entries.map((entry) => [entry.id, entry]));
        const replies = children.rows.map((row) => asEntry(row));
        replies.forEach((reply) => all.set(reply.id, reply));
        replies.forEach((reply) =>
          all.get(reply.parentId!)?.replies.push(reply),
        );
      }
      return {
        entries,
        total,
        page,
        totalPages: Math.max(1, Math.ceil(total / 10)),
      };
    },
    async create(input: unknown, source: string) {
      const entry = validateEntry(input);
      return write(async (tx) => {
        if (entry.parentId !== null) {
          const parent = await tx.execute({
            sql: "SELECT id FROM Guestbook WHERE id=?",
            args: [entry.parentId],
          });
          if (!parent.rows.length)
            throw new GuestbookError("回复的留言不存在。");
        }
        await rate(tx, source, "create", [
          [60000, 1],
          [3600000, 10],
        ]);
        const result = await tx.execute({
          sql: "INSERT INTO Guestbook(name,message,website,parentId,heartCount,createdAt) VALUES(?,?,?,?,0,?) RETURNING *",
          args: [
            entry.name,
            entry.message,
            entry.website,
            entry.parentId,
            new Date(now()).toISOString(),
          ],
        });
        return asEntry(result.rows[0]);
      });
    },
    async react(id: number, visitor: string, source: string) {
      positiveInteger(id);
      return write(async (tx) => {
        const found = await tx.execute({
          sql: "SELECT heartCount FROM Guestbook WHERE id=?",
          args: [id],
        });
        if (!found.rows.length) throw new GuestbookError("留言不存在。", 404);
        await rate(tx, source, "react", [[60000, 30]]);
        const existing = await tx.execute({
          sql: "SELECT 1 FROM GuestbookReaction WHERE messageId=? AND visitorHash=?",
          args: [id, visitor],
        });
        if (existing.rows.length)
          return { id, heartCount: Number(found.rows[0].heartCount ?? 0) };
        await tx.execute({
          sql: "INSERT INTO GuestbookReaction(messageId,visitorHash) VALUES(?,?)",
          args: [id, visitor],
        });
        const result = await tx.execute({
          sql: "UPDATE Guestbook SET heartCount=COALESCE(heartCount,0)+1 WHERE id=? RETURNING heartCount",
          args: [id],
        });
        return { id, heartCount: Number(result.rows[0].heartCount) };
      });
    },
    async delete(id: number) {
      positiveInteger(id);
      return write(async (tx) => {
        const found = await tx.execute({
          sql: "SELECT id FROM Guestbook WHERE id=?",
          args: [id],
        });
        if (!found.rows.length) throw new GuestbookError("留言不存在。", 404);
        const descendants = `WITH RECURSIVE removed(id) AS (SELECT id FROM Guestbook WHERE id=? UNION ALL SELECT g.id FROM Guestbook g JOIN removed r ON g.parentId=r.id)`;
        await tx.execute({
          sql: `${descendants} DELETE FROM GuestbookReaction WHERE messageId IN (SELECT id FROM removed)`,
          args: [id],
        });
        await tx.execute({
          sql: `${descendants} DELETE FROM Guestbook WHERE id IN (SELECT id FROM removed)`,
          args: [id],
        });
      });
    },
    async loginAttempt(source: string, verify: () => boolean) {
      return write(async (tx) => {
        await rate(tx, source, "login", [[900000, 5]], false);
        if (verify()) return true;
        // Commit failed attempts before returning 401 outside the transaction.
        await rate(tx, source, "login", [[900000, 5]]);
        return false;
      });
    },
    async failedLogin(source: string) {
      return write((tx) => rate(tx, source, "login", [[900000, 5]]));
    },
    async checkLogin(source: string) {
      return write((tx) => rate(tx, source, "login", [[900000, 5]], false));
    },
    async backup(destination: string) {
      const { client } = await ready();
      await client.execute({
        sql: "VACUUM INTO ?",
        args: [resolve(destination)],
      });
    },
    close() {
      connection?.client.close();
      connection = undefined;
      initialized = undefined;
    },
  };
}

let defaultStore: ReturnType<typeof createGuestbookStore> | undefined;
export function getGuestbookStore() {
  return (defaultStore ??= createGuestbookStore(
    process.env.GUESTBOOK_DATABASE_URL ?? "file:/data/guestbook.db",
  ));
}
