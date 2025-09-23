import type { MetaFunction } from "@remix-run/node";

export const meta: MetaFunction = () => {
  return [
    { title: "Privacy Policy - ShopDelta" },
    { name: "description", content: "ShopDelta Privacy Policy - How we handle merchant and customer data" },
    { name: "robots", content: "index, follow" },
  ];
};

export default function PublicPrivacy() {
  return (
    <div style={{ 
      maxWidth: "800px", 
      margin: "0 auto", 
      padding: "2rem",
      fontFamily: "system-ui, -apple-system, sans-serif",
      lineHeight: "1.6",
      backgroundColor: "#f9fafb",
      minHeight: "100vh"
    }}>
      {/* Header */}
      <div style={{ 
        textAlign: "center", 
        marginBottom: "3rem",
        padding: "2rem",
        background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
        borderRadius: "16px",
        color: "white"
      }}>
        <h1 style={{ margin: "0 0 1rem 0", fontSize: "2.5rem" }}>📊 ShopDelta</h1>
        <p style={{ margin: "0", fontSize: "1.2rem", opacity: "0.9" }}>Privacy-First Analytics for Shopify</p>
      </div>

      {/* Privacy Policy Content */}
      <div style={{ 
        backgroundColor: "white", 
        padding: "3rem", 
        borderRadius: "12px", 
        boxShadow: "0 4px 6px rgba(0, 0, 0, 0.1)" 
      }}>
        <h1>Privacy Policy — ShopDelta</h1>
        
        <p><strong>Effective date:</strong> 23/09/2025<br />
        <strong>Last updated:</strong> 23/09/2025</p>

        <p>ShopDelta ("we," "our," "us") provides analytics services to Shopify merchants. We respect the privacy of merchants and their customers. This policy explains what data we access and how we handle it.</p>

        <h2>Data We Access</h2>
        <p><strong>Order data:</strong> order ID, totals, financial/fulfillment status, line items (product IDs, SKUs, quantity, and prices).</p>
        <p><strong>No personal identifiers:</strong> we do not use customer names, emails, phone numbers, or addresses.</p>

        <h2>Purpose of Data Use</h2>
        <p>We temporarily access order data only to:</p>
        <ul>
          <li>Generate analytics dashboards for merchants, such as revenue, sales trends, and product performance.</li>
        </ul>

        <h2>Data Retention</h2>
        <ul>
          <li><strong>No data is stored or retained.</strong></li>
          <li>All processing happens in-memory during a merchant's session.</li>
          <li>Once results are displayed, no order or customer data is kept in our systems.</li>
        </ul>

        <h2>Data Sharing</h2>
        <ul>
          <li>We do not sell, rent, or trade any data.</li>
          <li>We do not share data with third parties.</li>
        </ul>

        <h2>Security</h2>
        <ul>
          <li>All API requests are encrypted in transit (TLS).</li>
          <li>No customer data is persisted at rest.</li>
        </ul>

        <h2>Merchant & Customer Rights</h2>
        <ul>
          <li>Since no data is retained, there is nothing to delete.</li>
          <li>We still honour Shopify's GDPR webhook requests (<code>/customers/redact</code>, <code>/shop/redact</code>, etc.) to confirm to Shopify and merchants that no customer data is stored.</li>
        </ul>

        <h2>Contact Information</h2>
        <p>If you have any questions about this Privacy Policy, please contact us at:</p>
        <ul>
          <li><strong>Email:</strong> [Your contact email]</li>
          <li><strong>Website:</strong> <a href="https://shopdelta.vercel.app">https://shopdelta.vercel.app</a></li>
        </ul>

        <h2>Changes to This Policy</h2>
        <p>We may update this Privacy Policy from time to time. We will notify merchants of any changes by posting the new Privacy Policy on this page and updating the "Last updated" date.</p>

        <hr style={{ margin: "2rem 0", border: "none", borderTop: "1px solid #ccc" }} />
        
        <p style={{ fontSize: "0.9rem", color: "#666" }}>
          <em>This privacy policy is designed to comply with GDPR, CCPA, and Shopify's privacy requirements for app developers.</em>
        </p>
      </div>

      {/* Footer */}
      <div style={{ 
        textAlign: "center", 
        marginTop: "3rem", 
        padding: "2rem",
        backgroundColor: "white",
        borderRadius: "12px",
        boxShadow: "0 2px 4px rgba(0, 0, 0, 0.1)"
      }}>
        <p style={{ margin: "0 0 1rem 0", color: "#666" }}>
          Want to see ShopDelta in action?
        </p>
        <a 
          href="/public/demo" 
          style={{
            display: "inline-block",
            padding: "12px 24px",
            background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
            color: "white",
            textDecoration: "none",
            borderRadius: "8px",
            fontWeight: "600",
            transition: "transform 0.2s ease"
          }}
          onMouseOver={(e) => e.currentTarget.style.transform = "translateY(-2px)"}
          onMouseOut={(e) => e.currentTarget.style.transform = "translateY(0)"}
        >
          📊 View Demo
        </a>
      </div>
    </div>
  );
}
