import type { APIRoute } from "astro";
import {
  errorResponse,
  json,
  requireAdmin,
  sameOrigin,
} from "../../../lib/server/guestbook-http";
export const prerender = false;
export const POST: APIRoute = async (context) => {
  try {
    sameOrigin(context);
    await requireAdmin(context);
    context.session!.destroy();
    return json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
};
