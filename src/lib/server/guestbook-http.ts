import type { APIContext } from "astro";
import { GuestbookError } from "./guestbook-store";
import {
  isAdminSession,
  sourceDigest,
  verifyOrigin,
  visitorIdentity,
} from "./guestbook-policy";

export function json(
  data: unknown,
  status = 200,
  headers: Record<string, string> = {},
) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...headers,
    },
  });
}
export function errorResponse(error: unknown) {
  if (error instanceof GuestbookError)
    return json(
      { error: error.message },
      error.status,
      error.retryAfter ? { "Retry-After": String(error.retryAfter) } : {},
    );
  // Deliberately avoid logging request bodies, credentials, IPs, or SQLite paths.
  console.error("[guestbook] storage or configuration operation failed");
  return json({ error: "留言服务暂时不可用，请稍后再试。" }, 503);
}
export function sameOrigin(context: Pick<APIContext, "request">) {
  verifyOrigin(
    context.request,
    process.env.PUBLIC_SITE_URL ?? "",
    import.meta.env.DEV,
  );
}
export function source(context: APIContext) {
  return sourceDigest(
    context.request,
    import.meta.env.DEV ? context.clientAddress : "",
    process.env.GUESTBOOK_RATE_LIMIT_SECRET ?? "",
    import.meta.env.DEV,
  );
}
export function visitor(context: APIContext) {
  const identity = visitorIdentity(
    context.cookies.get("guestbook-visitor")?.value,
    process.env.GUESTBOOK_RATE_LIMIT_SECRET ?? "",
  );
  context.cookies.set("guestbook-visitor", identity.cookie, {
    path: "/",
    httpOnly: true,
    sameSite: "strict",
    secure: (process.env.PUBLIC_SITE_URL ?? "").startsWith("https://"),
    maxAge: 31536000,
  });
  return identity.digest;
}
export async function requireAdmin(context: Pick<APIContext, "session">) {
  if (!isAdminSession(await context.session?.get("guestbookAdmin")))
    throw new GuestbookError("请先登录管理后台。", 401);
}
export async function readJson(
  request: Request,
  maxBytes = 8192,
): Promise<unknown> {
  if (
    !request.headers
      .get("Content-Type")
      ?.toLowerCase()
      .startsWith("application/json")
  )
    throw new GuestbookError("请求需要使用 JSON 格式。");
  const declared = Number(request.headers.get("Content-Length") ?? 0);
  if (!Number.isFinite(declared) || declared > maxBytes)
    throw new GuestbookError("提交的内容过长。", 413);
  if (!request.body) throw new GuestbookError("请求内容不能为空。");
  const reader = request.body.getReader();
  let length = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maxBytes) {
        await reader.cancel();
        throw new GuestbookError("提交的内容过长。", 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new GuestbookError("JSON 内容格式无效。");
  }
}
