import "@shopify/shopify-app-remix/adapters/node";
import { ApiVersion, AppDistribution, shopifyApp } from "@shopify/shopify-app-remix/server";
import { RedisSessionStorage } from "@shopify/shopify-app-session-storage-redis";

function buildSessionStorage() {
  // The Redis adapter expects a standard Redis connection string (redis/rediss)
  // Example (Upstash TLS): rediss://default:PASSWORD@infinite-impala-8590.upstash.io:6379
  const connectionString = process.env.REDIS_URL;

  if (!connectionString) {
    // If the user only configured the REST vars, guide them to supply the TLS URL + password
    if (process.env.UPSTASH_REDIS_REST_URL || process.env.UPSTASH_REDIS_REST_TOKEN) {
      throw new Error(
        "Redis session storage requires REDIS_URL as a standard redis/rediss connection string. " +
        "For Upstash, use the TLS endpoint and password, e.g. rediss://default:PASSWORD@<host>:6379"
      );
    }
    
    // Temporary fallback: use memory storage for testing (NOT for production)
    console.warn("⚠️  Using memory storage - sessions will not persist across deployments!");
    const { MemorySessionStorage } = require("@shopify/shopify-app-session-storage-memory");
    return new MemorySessionStorage();
  }

  // Pass a single redis/rediss connection string to the adapter
  // e.g., rediss://default:PASSWORD@host:6379
  return new RedisSessionStorage(connectionString);
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
