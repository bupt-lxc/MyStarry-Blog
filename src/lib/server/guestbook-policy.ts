import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { isIP } from "node:net";
import { GuestbookError } from "./guestbook-store";

export function passwordMatches(candidate: string, expected: string) {
  // Hash both values to a fixed length before the constant-time comparison.
  return (
    Boolean(expected) &&
    timingSafeEqual(
      createHash("sha256").update(candidate).digest(),
      createHash("sha256").update(expected).digest(),
    )
  );
}
export function isAdminSession(value: unknown, now = Date.now()) {
  if (!value || typeof value !== "object") return false;
  const at = (value as { loginAt?: unknown }).loginAt;
  return (
    typeof at === "number" &&
    Number.isFinite(at) &&
    at <= now &&
    now - at < 1800000
  );
}
export function verifyOrigin(
  request: Request,
  configured: string,
  development: boolean,
) {
  let trusted: string;
  try {
    trusted = new URL(configured || (development ? request.url : "")).origin;
  } catch {
    throw new GuestbookError("站点地址未正确配置。", 503);
  }
  const origin = request.headers.get("Origin");
  if (!origin || origin !== trusted)
    throw new GuestbookError("请求来源校验失败，请从本站重新操作。", 403);
}
function hmac(value: string, secret: string) {
  if (secret.length < 32)
    throw new GuestbookError("留言服务尚未配置完成。", 503);
  return createHmac("sha256", secret).update(value).digest("hex");
}
export function sourceDigest(
  request: Request,
  clientAddress: string,
  secret: string,
  development: boolean,
) {
  const address =
    request.headers.get("X-Portfolio-Client-IP") ||
    (development ? clientAddress : "");
  if (!isIP(address))
    throw new GuestbookError("无法确认请求来源，请稍后再试。", 503);
  return hmac(`source:${address}`, secret);
}
export function visitorIdentity(cookie: string | undefined, secret: string) {
  const [value, signature, ...extra] = (cookie ?? "").split(".");
  const valid =
    extra.length === 0 &&
    /^[a-f0-9]{64}$/.test(value ?? "") &&
    /^[a-f0-9]{64}$/.test(signature ?? "") &&
    passwordMatches(signature, hmac(`cookie:${value}`, secret));
  const identity = valid ? value : randomBytes(32).toString("hex");
  return {
    cookie: `${identity}.${hmac(`cookie:${identity}`, secret)}`,
    digest: hmac(`visitor:${identity}`, secret),
  };
}
