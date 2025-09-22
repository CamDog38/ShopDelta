import "@shopify/shopify-app-remix/adapters/node";
import { ApiVersion, AppDistribution, shopifyApp } from "@shopify/shopify-app-remix/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
let RedisSessionStorage: any = null;
try {
  // Optional dependency; only used in production when configured
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  RedisSessionStorage = require("@shopify/shopify-app-session-storage-redis").RedisSessionStorage;
} catch {}
function buildSessionStorage() {
  const useRedis = !!(process.env.REDIS_URL || process.env.UPSTASH_REDIS_REST_URL);
  if (useRedis && RedisSessionStorage) {
    const url = process.env.REDIS_URL || process.env.UPSTASH_REDIS_REST_URL!;
    const token = process.env.REDIS_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || process.env.REDIS_PASSWORD;
    try {
      return new RedisSessionStorage({
        connection: token ? { url, token } : { url },
      });
    } catch (e) {
      // Fallback to Prisma if Redis misconfigured
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const prisma = require("./db.server").default;
      return new PrismaSessionStorage(prisma);
    }
  }
  // Lazy import prisma only if needed
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const prisma = require("./db.server").default;
  return new PrismaSessionStorage(prisma);
}

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.January25,
  scopes: process.env.SCOPES?.split(","),
  appUrl: process.env.SHOPIFY_APP_URL || "",
  authPathPrefix: "/auth",
  sessionStorage: buildSessionStorage(),
  distribution: AppDistribution.AppStore,
  future: {
    unstable_newEmbeddedAuthStrategy: true,
    removeRest: true,
  },
  ...(process.env.SHOP_CUSTOM_DOMAIN
    ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
    : {}),
});

export default shopify;
export const apiVersion = ApiVersion.January25;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;
