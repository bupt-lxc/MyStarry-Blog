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
} from "../../lib/server/guestbook-http";
export const prerender = false;
export const GET: APIRoute = async ({ url }) => {
  try {
    return json(
      await getGuestbookStore().list(
        positiveInteger(url.searchParams.get("page") ?? "1"),
      ),
    );
  } catch (error) {
    return errorResponse(error);
  }
};
export const POST: APIRoute = async (context) => {
  try {
    sameOrigin(context);
    const input = await readJson(context.request);
    return json(await getGuestbookStore().create(input, source(context)), 201);
  } catch (error) {
    return errorResponse(error);
  }
};
