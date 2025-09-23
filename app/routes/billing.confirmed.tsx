import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { setPlan } from "../utils/plan.server";

// Handles Partner Dashboard welcome link: /billing/confirmed?plan=free
export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);

  const url = new URL(request.url);
  const plan = url.searchParams.get("plan");

  if (plan === "free") {
    await setPlan(session.shop, "free");
  }

  // Always return to app home after confirming
  throw redirect("/app");
}
