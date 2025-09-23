import { getRedis } from "./redis.server";

export type ShopPlan = "free" | "starter" | "pro";

const planKey = (shop: string) => `shop:${shop}:plan`;

export async function getPlan(shop: string): Promise<ShopPlan | null> {
  const redis = getRedis();
  const plan = await redis.get(planKey(shop));
  if (!plan) return null;
  if (plan === "free" || plan === "starter" || plan === "pro") return plan;
  return null;
}

export async function setPlan(shop: string, plan: ShopPlan): Promise<void> {
  const redis = getRedis();
  // Only store the minimal data required: shop domain + plan string
  await redis.set(planKey(shop), plan);
}
