import type { APIRoute } from "astro";
import {
  getGuestbookStore,
  positiveInteger,
} from "../../lib/server/guestbook-store";
import {
  errorResponse,
  json,
  readJson,
  sameOrigin,
  source,
  visitor,
} from "../../lib/server/guestbook-http";
export const prerender = false;
export const POST: APIRoute = async (context) => {
  try {
    sameOrigin(context);
    const data = (await readJson(context.request)) as { id?: unknown } | null;
    const id = positiveInteger(data?.id);
    return json(
      await getGuestbookStore().react(id, visitor(context), source(context)),
    );
  } catch (error) {
    return errorResponse(error);
  }
};
