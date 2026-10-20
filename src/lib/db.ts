import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import {
  customType,
  integer,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

export { count, desc, eq, sql } from "drizzle-orm";

const isoDate = customType<{ data: Date; driverData: string }>({
  dataType: () => "text",
  toDriver: (value) => value.toISOString(),
  fromDriver: (value) => new Date(/Z$/.test(value) ? value : `${value}Z`),
});

export const Guestbook = sqliteTable("Guestbook", {
  id: integer("id").primaryKey(),
  name: text("name").notNull(),
  message: text("message").notNull(),
  website: text("website"),
  parentId: integer("parentId"),
  heartCount: integer("heartCount"),
  createdAt: isoDate("createdAt").notNull(),
});

// A factory keeps imports and prerendered builds free of database I/O.
export function createDatabase(url: string) {
  const client = createClient({ url });
  return { client, db: drizzle(client) };
}
