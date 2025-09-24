import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Form, useActionData, useNavigation, useSearchParams } from "@remix-run/react";
import { useEffect, useState } from "react";

function normaliseShop(shop: string): string | null {
  let s = shop.trim().toLowerCase();
  if (!s) return null;
  // Allow either full domain or just the prefix
  if (!s.endsWith(".myshopify.com")) {
    s = `${s}.myshopify.com`;
  }
  const valid = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(s);
  return valid ? s : null;
}

// Build Shopify Admin install deep link for a cleaner UX
// Values derived from shopify.app.toml
const CLIENT_ID = "1bfb615d6837e45ae34fb39a820c62ca";
const REDIRECT_URI = encodeURIComponent("https://shopdelta.vercel.app/auth/callback");
const SCOPES = encodeURIComponent("read_orders,read_all_orders,write_products");

function buildAdminInstallUrl(shopDomain: string) {
  return `https://${shopDomain}/admin/oauth/install?client_id=${CLIENT_ID}&redirect_uri=${REDIRECT_URI}&scope=${SCOPES}`;
}

export async function loader({ request }: LoaderFunctionArgs) {
  // If a shop param is present, we can 302 directly on the server to the Admin install link
  // to avoid rendering the page at all.
  const url = new URL(request.url);
  const shopParam = url.searchParams.get("shop");
  const normalised = shopParam ? normaliseShop(shopParam) : null;
  if (normalised) {
    const target = buildAdminInstallUrl(normalised);
    // Use a 302 server redirect for the cleanest hop
    throw redirect(target);
  }
  return json({});
}

export async function action({ request }: ActionFunctionArgs) {
  const form = await request.formData();
  const shop = String(form.get("shop") || "");
  const normalised = normaliseShop(shop);
  if (!normalised) {
    return json({ error: "Please enter a valid shop domain (e.g. example.myshopify.com)." }, { status: 400 });
  }
  // Deep link straight to Shopify Admin install flow
  const target = buildAdminInstallUrl(normalised);
  throw redirect(target);
}

export default function ConnectShop() {
  const actionData = useActionData<typeof action>();
  const nav = useNavigation();
  const [params] = useSearchParams();
  const [shop, setShop] = useState("");
  const submitting = nav.state === "submitting";

  // If a shop param is present, perform a TOP-LEVEL redirect to start OAuth.
  useEffect(() => {
    const p = params.get("shop");
    if (p) {
      const normalised = normaliseShop(p);
      if (normalised) {
        const target = buildAdminInstallUrl(normalised);
        if (typeof window !== "undefined") {
          // Ensure redirect happens at the top window, not the Admin iframe.
          (window.top || window).location.href = target;
        }
      }
    }
  }, [params]);

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      padding: '40px'
    }}>
      <div style={{
        width: '100%',
        maxWidth: '520px',
        background: 'white',
        borderRadius: '16px',
        boxShadow: '0 10px 30px rgba(0,0,0,0.15)',
        padding: '28px'
      }}>
        <div style={{ textAlign: 'center', marginBottom: '12px' }}>
          <h1 style={{ margin: 0, fontSize: '22px', color: '#111827' }}>Connect your Shopify store</h1>
          <p style={{ margin: '8px 0 0', color: '#6b7280' }}>
            Enter your shop domain to continue with secure authorisation.
          </p>
        </div>
        {actionData && (actionData as any).error ? (
          <div style={{
            marginTop: '12px',
            background: '#fef2f2',
            color: '#b91c1c',
            border: '1px solid #fecaca',
            padding: '10px 12px',
            borderRadius: '8px'
          }}>{(actionData as any).error}</div>
        ) : null}
        <Form method="post" target="_top" style={{ marginTop: '16px' }}>
          <label htmlFor="shop" style={{ display: 'block', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>
            Shop domain
          </label>
          <input
            id="shop"
            name="shop"
            value={shop}
            onChange={(e) => setShop(e.target.value)}
            placeholder="example.myshopify.com or example"
            autoComplete="off"
            style={{
              width: '100%',
              padding: '10px 12px',
              borderRadius: '8px',
              border: '1px solid #d1d5db',
              outline: 'none'
            }}
          />
          <button
            type="submit"
            disabled={submitting}
            style={{
              marginTop: '12px',
              width: '100%',
              padding: '12px',
              borderRadius: '8px',
              border: 'none',
              color: 'white',
              background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
              fontWeight: 700,
              cursor: submitting ? 'not-allowed' : 'pointer',
              opacity: submitting ? 0.7 : 1
            }}
          >
            {submitting ? 'Redirecting…' : 'Continue'}
          </button>
          <p style={{ marginTop: '8px', color: '#6b7280', fontSize: '12px' }}>
            Tip: You can enter just the store prefix (e.g. <strong>acme</strong>) or the full domain.
          </p>
        </Form>
      </div>
    </div>
  );
}
