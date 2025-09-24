import type { MetaFunction } from "@remix-run/node";

export const meta: MetaFunction = () => {
  return [
    { title: "ShopDelta - Privacy-First Analytics for Shopify" },
    { name: "description", content: "Powerful analytics for Shopify merchants with zero data storage. View sales trends, product performance, and growth metrics while protecting customer privacy." },
    { name: "robots", content: "index, follow" },
  ];
};

export default function PublicIndex() {
  return (
    <div style={{ 
      fontFamily: "system-ui, -apple-system, sans-serif",
      lineHeight: "1.6",
      backgroundColor: "#f9fafb",
      minHeight: "100vh"
    }}>
      {/* Hero Section */}
      <div style={{ 
        textAlign: "center", 
        padding: "6rem 2rem",
        background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
        color: "white"
      }}>
        <h1 style={{ margin: "0 0 2rem 0", fontSize: "4rem" }}>📊 ShopDelta</h1>
        <p style={{ fontSize: "1.5rem", opacity: "0.9", maxWidth: "700px", margin: "0 auto 3rem" }}>
          Privacy-First Analytics for Shopify Merchants
        </p>
        <p style={{ fontSize: "1.2rem", opacity: "0.8", maxWidth: "600px", margin: "0 auto 3rem" }}>
          Powerful sales insights with zero data storage. All processing happens in-memory during your session only.
        </p>
        
        <div style={{ display: "flex", gap: "1.5rem", justifyContent: "center", flexWrap: "wrap" }}>
          <a 
            href="/public/demo" 
            style={{
              display: "inline-block",
              padding: "18px 36px",
              background: "rgba(255, 255, 255, 0.2)",
              color: "white",
              textDecoration: "none",
              borderRadius: "12px",
              fontWeight: "600",
              fontSize: "1.2rem",
              backdropFilter: "blur(10px)",
              border: "2px solid rgba(255, 255, 255, 0.3)",
              transition: "all 0.3s ease"
            }}
          >
            🚀 View Demo
          </a>
          
          <a 
            href="/connect" 
            style={{
              display: "inline-block",
              padding: "18px 36px",
              background: "white",
              color: "#667eea",
              textDecoration: "none",
              borderRadius: "12px",
              fontWeight: "600",
              fontSize: "1.2rem",
              transition: "all 0.3s ease",
              boxShadow: "0 4px 15px rgba(0, 0, 0, 0.1)"
            }}
          >
            🏪 Install App
          </a>
        </div>
      </div>

      <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "0 2rem" }}>
        
        {/* Key Benefits */}
        <div style={{ margin: "6rem 0" }}>
          <h2 style={{ textAlign: "center", fontSize: "3rem", marginBottom: "4rem", color: "#1f2937" }}>
            Why Choose ShopDelta?
          </h2>
          
          <div style={{ 
            display: "grid", 
            gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", 
            gap: "3rem" 
          }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ 
                fontSize: "4rem", 
                marginBottom: "1.5rem",
                background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text"
              }}>🔒</div>
              <h3 style={{ margin: "0 0 1rem 0", fontSize: "1.5rem", color: "#1f2937" }}>Privacy First</h3>
              <p style={{ color: "#6b7280", fontSize: "1.1rem" }}>
                Zero data storage policy. All analytics processing happens in-memory during your session only.
              </p>
            </div>

            <div style={{ textAlign: "center" }}>
              <div style={{ 
                fontSize: "4rem", 
                marginBottom: "1.5rem",
                background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text"
              }}>📈</div>
              <h3 style={{ margin: "0 0 1rem 0", fontSize: "1.5rem", color: "#1f2937" }}>Powerful Analytics</h3>
              <p style={{ color: "#6b7280", fontSize: "1.1rem" }}>
                Advanced sales insights, trend analysis, and product performance tracking with beautiful visualizations.
              </p>
            </div>

            <div style={{ textAlign: "center" }}>
              <div style={{ 
                fontSize: "4rem", 
                marginBottom: "1.5rem",
                background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text"
              }}>⚡</div>
              <h3 style={{ margin: "0 0 1rem 0", fontSize: "1.5rem", color: "#1f2937" }}>Easy to Use</h3>
              <p style={{ color: "#6b7280", fontSize: "1.1rem" }}>
                Built with Shopify's design system. Familiar interface that integrates seamlessly with your admin.
              </p>
            </div>
          </div>
        </div>

        {/* Privacy Guarantee */}
        <div style={{ 
          backgroundColor: "white", 
          padding: "4rem 3rem", 
          borderRadius: "20px", 
          boxShadow: "0 8px 25px rgba(0, 0, 0, 0.1)",
          textAlign: "center",
          margin: "6rem 0",
          border: "3px solid #10b981"
        }}>
          <div style={{ fontSize: "4rem", marginBottom: "2rem" }}>🛡️</div>
          <h2 style={{ margin: "0 0 2rem 0", fontSize: "2.5rem", color: "#1f2937" }}>
            Our Privacy Guarantee
          </h2>
          <p style={{ fontSize: "1.3rem", color: "#6b7280", maxWidth: "800px", margin: "0 auto 2rem" }}>
            We access only order data (IDs, totals, SKUs) - never customer names, emails, or addresses. 
            All processing is done live during your session with zero data retention.
          </p>
          <a 
            href="/public/privacy" 
            style={{
              display: "inline-block",
              padding: "16px 32px",
              background: "#10b981",
              color: "white",
              textDecoration: "none",
              borderRadius: "12px",
              fontWeight: "600",
              fontSize: "1.1rem",
              transition: "all 0.2s ease"
            }}
          >
            📋 Read Full Privacy Policy
          </a>
        </div>

        {/* Footer */}
        <div style={{ 
          textAlign: "center", 
          padding: "4rem 2rem", 
          color: "#6b7280",
          borderTop: "1px solid #e5e7eb"
        }}>
          <p style={{ margin: "0 0 2rem 0", fontSize: "1.1rem" }}>
            Ready to get privacy-first analytics for your Shopify store?
          </p>
          <div style={{ display: "flex", gap: "2rem", justifyContent: "center", flexWrap: "wrap" }}>
            <a href="/public/demo" style={{ color: "#667eea", textDecoration: "none", fontWeight: "600" }}>
              📊 View Demo
            </a>
            <a href="/public/privacy" style={{ color: "#667eea", textDecoration: "none", fontWeight: "600" }}>
              📋 Privacy Policy
            </a>
            <a href="https://apps.shopify.com" target="_blank" rel="noopener noreferrer" style={{ color: "#667eea", textDecoration: "none", fontWeight: "600" }}>
              🏪 Shopify App Store
            </a>
          </div>
          <p style={{ margin: "2rem 0 0 0", fontSize: "0.9rem" }}>
            © 2025 ShopDelta. Built with privacy in mind for Shopify merchants.
          </p>
        </div>
      </div>
    </div>
  );
}
