import type { APIRoute } from "astro";
import {
  getGuestbookStore,
  GuestbookError,
} from "../../../lib/server/guestbook-store";
import { passwordMatches } from "../../../lib/server/guestbook-policy";
import {
  errorResponse,
  json,
  readJson,
  sameOrigin,
  source,
} from "../../../lib/server/guestbook-http";
export const prerender = false;
export const POST: APIRoute = async (context) => {
  try {
    sameOrigin(context);
    const data = (await readJson(context.request, 2048)) as {
      password?: unknown;
    } | null;
    if (typeof data?.password !== "string" || data.password.length > 1024)
      throw new GuestbookError("请输入有效的管理密码。");
    const expected = process.env.GUESTBOOK_ADMIN_PASSWORD;
    if (!expected || !context.session)
      throw new GuestbookError("管理服务尚未配置完成。", 503);
    const digest = source(context),
      store = getGuestbookStore();
    const password = data.password;
    if (!(await store.loginAttempt(digest, () => passwordMatches(password, expected)))) {
      throw new GuestbookError("管理密码不正确。", 401);
    }
    await context.session.regenerate();
    context.session.set(
      "guestbookAdmin",
      { loginAt: Date.now() },
      { ttl: 1800 },
    );
    return json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
};
