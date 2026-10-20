import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, copyFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

// The native libsql Windows binding can retain prepared-statement WAL handles
// until finalization. Assert all behavior in a child process, then clean actual
// files after the OS has closed its handles. This does not skip any assertions.
function sqliteTest(name: string, body: (dir: string) => Promise<void>) {
  test(name, async () => {
    if (process.env.GUESTBOOK_SQLITE_TEST_DIR)
      return body(process.env.GUESTBOOK_SQLITE_TEST_DIR);
    const dir = await mkdtemp(join(tmpdir(), "portfolio-guestbook-"));
    try {
      const pattern = "^" + name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$";
      const env: NodeJS.ProcessEnv = {
        ...process.env,
        GUESTBOOK_SQLITE_TEST_DIR: dir,
      };
      delete env.NODE_TEST_CONTEXT;
      const { stdout } = await promisify(execFile)(
        process.execPath,
        [
          "--import",
          "tsx",
          "--test",
          "--test-reporter=tap",
          "--test-name-pattern",
          pattern,
          import.meta.filename,
        ],
        { env, timeout: 120000 },
      );
      assert.match(
        stdout,
        /# pass 1\b/,
        "The isolated SQLite test must actually execute and pass.",
      );
    } finally {
      await rm(dir, {
        recursive: true,
        force: true,
        maxRetries: 10,
        retryDelay: 100,
      });
    }
  });
}

test("database import is lazy and guestbook storage is available without remote credentials", async () => {
  const module = await import("../src/lib/server/guestbook-store.ts");
  assert.equal(typeof module.createGuestbookStore, "function");
});

test("validates boundaries and rejects unsafe links, non-numeric ids and pages", async () => {
  const { validateEntry, positiveInteger } =
    await import("../src/lib/server/guestbook-store.ts");
  assert.deepEqual(
    validateEntry({
      name: " 张三 ",
      message: " 你好\n世界 ",
      website: "https://example.com",
    }),
    {
      name: "张三",
      message: "你好\n世界",
      website: "https://example.com",
      parentId: null,
    },
  );
  for (const data of [
    { name: " ", message: "x" },
    { name: "x".repeat(33), message: "x" },
    { name: "x", message: "x".repeat(1001) },
    { name: "x", message: "x", website: "javascript:alert(1)" },
    { name: "x", message: "x", website: "https://" + "x".repeat(200) },
    { name: "x", message: "x", parentId: "2" },
  ])
    assert.throws(() => validateEntry(data));
  assert.equal(
    validateEntry({ name: "x".repeat(32), message: "x".repeat(1000) }).name
      .length,
    32,
  );
  for (const value of ["1x", "-1", "0", "1.2", "Infinity", "9007199254740992"])
    assert.throws(() => positiveInteger(value));
});

sqliteTest(
  "concurrent login attempts cannot bypass the persisted five-failure lockout",
  async (dir) => {
    const { createGuestbookStore } = await import("../src/lib/server/guestbook-store.ts");
    const store = createGuestbookStore(pathToFileURL(join(dir, "concurrent.db")).href);
    let comparisons = 0;
    try {
      const outcomes = await Promise.allSettled(Array.from({length:20}, (_, index) =>
        store.loginAttempt("same-source", () => { comparisons++; return index === 19; })
      ));
      assert.equal(comparisons, 5);
      assert.equal(outcomes.filter(item => item.status === "fulfilled" && item.value === false).length, 5);
      assert.equal(outcomes.filter(item => item.status === "rejected" && item.reason.status === 429).length, 15);
      assert.equal(outcomes.some(item => item.status === "fulfilled" && item.value === true), false);
      store.close();
      const reopened = createGuestbookStore(pathToFileURL(join(dir, "concurrent.db")).href);
      try { await assert.rejects(reopened.loginAttempt("same-source", () => true), (error:any) => error.status === 429); }
      finally { reopened.close(); }
    } finally { store.close(); }
  },
);

sqliteTest(
  "real SQLite persists messages, pages roots, rejects orphan replies, and deletes descendants and hearts",
  async (dir) => {
    const { createGuestbookStore } =
      await import("../src/lib/server/guestbook-store.ts");
    const url = pathToFileURL(join(dir, "messages.db")).href;
    let now = 1800000000000;
    let store = createGuestbookStore(url, { now: () => now });
    try {
      const first = await store.create(
        { name: "访客", message: "<script>纯文本</script>\n第二行" },
        "source-1",
      );
      await assert.rejects(
        store.create({ name: "访客", message: "太快" }, "source-1"),
        (e: any) => e.status === 429 && e.retryAfter === 60,
      );
      now += 60001;
      const reply = await store.create(
        { name: "回复者", message: "回复", parentId: first.id },
        "source-1",
      );
      await assert.rejects(
        store.create(
          { name: "访客", message: "孤立回复", parentId: 99999 },
          "source-2",
        ),
        (e: any) => e.status === 400,
      );
      for (let i = 0; i < 10; i++) {
        now++;
        await store.create({ name: "访客", message: `留言${i}` }, `other-${i}`);
      }
      let page = await store.list(1);
      assert.equal(page.total, 11);
      assert.equal(page.entries.length, 10);
      assert.equal(page.totalPages, 2);
      page = await store.list(2);
      assert.equal(page.entries[0].replies.length, 1);
      assert.equal(page.entries[0].message, "<script>纯文本</script>\n第二行");
      assert.equal(
        (await store.react(first.id, "visitor-1", "source-2")).heartCount,
        1,
      );
      assert.equal(
        (await store.react(first.id, "visitor-1", "source-2")).heartCount,
        1,
      );
      store.close();
      store = createGuestbookStore(url, { now: () => now });
      assert.equal((await store.list(2)).entries[0].heartCount, 1);
      await store.react(reply.id, "reply-visitor", "source-2");
      await store.delete(first.id);
      assert.equal((await store.list(1)).total, 10);
      await assert.rejects(
        store.react(first.id, "visitor-2", "source-2"),
        (e: any) => e.status === 404,
      );
      await assert.rejects(
        store.delete(first.id),
        (e: any) => e.status === 404,
      );
      await assert.rejects(
        store.react(reply.id, "reply-visitor", "source-2"),
        (e: any) => e.status === 404,
      );
      const { createClient } = await import("@libsql/client");
      const inspection = createClient({ url });
      try {
        assert.equal(
          Number(
            (
              await inspection.execute(
                "SELECT COUNT(*) AS total FROM GuestbookReaction",
              )
            ).rows[0].total,
          ),
          0,
        );
      } finally {
        inspection.close();
      }
    } finally {
      store.close();
    }
  },
);

sqliteTest(
  "rate windows and failed-login lockout survive reopening; backups can restore actual SQLite",
  async (dir) => {
    const { createGuestbookStore } =
      await import("../src/lib/server/guestbook-store.ts");
    const url = pathToFileURL(join(dir, "messages.db")).href;
    let now = 1800000000000;
    let store = createGuestbookStore(url, { now: () => now });
    try {
      for (let i = 0; i < 10; i++) {
        await store.create({ name: "访客", message: "留言" }, "same-source");
        now += 60001;
      }
      store.close();
      store = createGuestbookStore(url, { now: () => now });
      await assert.rejects(
        store.create({ name: "访客", message: "第十一条" }, "same-source"),
        (e: any) => e.status === 429 && e.retryAfter > 1,
      );
      for (let i = 0; i < 5; i++) await store.failedLogin("login-source");
      store.close();
      store = createGuestbookStore(url, { now: () => now });
      await assert.rejects(
        store.checkLogin("login-source"),
        (e: any) => e.status === 429,
      );
      now += 900001;
      await store.checkLogin("login-source");
      const first = (await store.list(1)).entries[0];
      for (let i = 0; i < 30; i++)
        await store.react(first.id, `visitor-${i}`, "reaction-source");
      await assert.rejects(
        store.react(first.id, "visitor-31", "reaction-source"),
        (e: any) => e.status === 429,
      );
      await assert.rejects(
        store.react(first.id, "visitor-1", "reaction-source"),
        (e: any) => e.status === 429,
      );
      // Repeated reactions never increment the count, but still respect the
      // request window; once that window expires the count remains unchanged.
      now += 60001;
      assert.equal(
        (await store.react(first.id, "visitor-1", "reaction-source"))
          .heartCount,
        30,
      );
      const backup = join(dir, "backup.db");
      await store.backup(backup);
      const cliBackup = join(dir, "cli-backup.db");
      await promisify(execFile)(
        process.execPath,
        [
          fileURLToPath(
            new URL("../scripts/backup-guestbook.mjs", import.meta.url),
          ),
          cliBackup,
        ],
        { env: { ...process.env, GUESTBOOK_DATABASE_URL: url } },
      );
      store.close();
      await copyFile(backup, join(dir, "restored.db"));
      store = createGuestbookStore(
        pathToFileURL(join(dir, "restored.db")).href,
      );
      assert.equal((await store.list(1)).total, 10);
      const fromCli = createGuestbookStore(pathToFileURL(cliBackup).href);
      try {
        assert.equal((await fromCli.list(1)).total, 10);
      } finally {
        fromCli.close();
      }
    } finally {
      store.close();
    }
  },
);
