import type { APIRoute } from "astro";
import {
  getGuestbookStore,
  positiveInteger,
} from "../../../../lib/server/guestbook-store";
import {
  errorResponse,
  json,
  requireAdmin,
  sameOrigin,
} from "../../../../lib/server/guestbook-http";
export const prerender = false;
export const DELETE: APIRoute = async (context) => {
  try {
    sameOrigin(context);
    await requireAdmin(context);
    await getGuestbookStore().delete(positiveInteger(context.params.id));
    return json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
};
