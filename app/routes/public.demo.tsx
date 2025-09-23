import type { MetaFunction } from "@remix-run/node";

export const meta: MetaFunction = () => {
  return [
    { title: "Demo - ShopDelta Analytics" },
    { name: "description", content: "See ShopDelta's powerful analytics features in action. Privacy-first Shopify analytics." },
    { name: "robots", content: "index, follow" },
  ];
};

export default function PublicDemo() {
  return (
    <div style={{ 
      fontFamily: "system-ui, -apple-system, sans-serif",
      lineHeight: "1.6",
      backgroundColor: "#f9fafb",
      minHeight: "100vh"
    }}>
      {/* Header */}
      <div style={{ 
        textAlign: "center", 
        padding: "4rem 2rem",
        background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
        color: "white"
      }}>
        <h1 style={{ margin: "0 0 1rem 0", fontSize: "3rem" }}>📊 ShopDelta Demo</h1>
        <p style={{ fontSize: "1.3rem", opacity: "0.9", maxWidth: "600px", margin: "0 auto 2rem" }}>
          Experience powerful, privacy-first analytics for your Shopify store
        </p>
        <div style={{ 
          display: "inline-block",
          padding: "16px 32px",
          background: "rgba(255, 255, 255, 0.2)",
          borderRadius: "12px",
          backdropFilter: "blur(10px)",
          border: "1px solid rgba(255, 255, 255, 0.3)"
        }}>
          🔒 <strong>Zero Data Storage</strong> • Live Processing Only
        </div>
      </div>

      <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "0 2rem" }}>
        
        {/* Key Features */}
        <div style={{ margin: "4rem 0" }}>
          <h2 style={{ textAlign: "center", fontSize: "2.5rem", marginBottom: "3rem", color: "#1f2937" }}>
            🚀 Key Features
          </h2>
          
          <div style={{ 
            display: "grid", 
            gridTemplateColumns: "repeat(auto-fit, minmax(350px, 1fr))", 
            gap: "2rem" 
          }}>
            {/* Feature 1 */}
            <div style={{ 
              backgroundColor: "white", 
              padding: "2rem", 
              borderRadius: "16px", 
              boxShadow: "0 4px 6px rgba(0, 0, 0, 0.1)",
              border: "2px solid #e5e7eb"
            }}>
              <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>📈</div>
              <h3 style={{ margin: "0 0 1rem 0", color: "#1f2937" }}>Advanced Analytics</h3>
              <p style={{ color: "#6b7280", margin: "0" }}>
                Interactive charts and tables showing sales trends, revenue analysis, and product performance with daily, weekly, or monthly granularity.
              </p>
            </div>

            {/* Feature 2 */}
            <div style={{ 
              backgroundColor: "white", 
              padding: "2rem", 
              borderRadius: "16px", 
              boxShadow: "0 4px 6px rgba(0, 0, 0, 0.1)",
              border: "2px solid #e5e7eb"
            }}>
              <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>🔄</div>
              <h3 style={{ margin: "0 0 1rem 0", color: "#1f2937" }}>Smart Comparisons</h3>
              <p style={{ color: "#6b7280", margin: "0" }}>
                Month-over-Month and Year-over-Year analysis with detailed delta calculations and percentage changes to track growth.
              </p>
            </div>

            {/* Feature 3 */}
            <div style={{ 
              backgroundColor: "white", 
              padding: "2rem", 
              borderRadius: "16px", 
              boxShadow: "0 4px 6px rgba(0, 0, 0, 0.1)",
              border: "2px solid #e5e7eb"
            }}>
              <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>🔒</div>
              <h3 style={{ margin: "0 0 1rem 0", color: "#1f2937" }}>Privacy First</h3>
              <p style={{ color: "#6b7280", margin: "0" }}>
                No customer data stored. All processing happens in-memory during your session. GDPR compliant by design.
              </p>
            </div>
          </div>
        </div>

        {/* Demo Screenshots */}
        <div style={{ margin: "4rem 0" }}>
          <h2 style={{ textAlign: "center", fontSize: "2.5rem", marginBottom: "3rem", color: "#1f2937" }}>
            📱 Interface Preview
          </h2>
          
          <div style={{ 
            backgroundColor: "white", 
            padding: "3rem", 
            borderRadius: "16px", 
            boxShadow: "0 8px 25px rgba(0, 0, 0, 0.1)",
            textAlign: "center"
          }}>
            <div style={{ 
              backgroundColor: "#f3f4f6", 
              padding: "4rem 2rem", 
              borderRadius: "12px",
              border: "2px dashed #d1d5db"
            }}>
              <div style={{ fontSize: "4rem", marginBottom: "1rem" }}>📊</div>
              <h3 style={{ margin: "0 0 1rem 0", color: "#1f2937" }}>Beautiful Analytics Dashboard</h3>
              <p style={{ color: "#6b7280", margin: "0" }}>
                Clean, modern interface built with Shopify's design system.<br/>
                Interactive charts, data tables, and export functionality.
              </p>
            </div>
          </div>
        </div>

        {/* Data Usage */}
        <div style={{ margin: "4rem 0" }}>
          <div style={{ 
            backgroundColor: "white", 
            padding: "3rem", 
            borderRadius: "16px", 
            boxShadow: "0 4px 6px rgba(0, 0, 0, 0.1)",
            border: "2px solid #10b981"
          }}>
            <div style={{ textAlign: "center", marginBottom: "2rem" }}>
              <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>🛡️</div>
              <h2 style={{ margin: "0 0 1rem 0", color: "#1f2937" }}>Data Usage Transparency</h2>
            </div>
            
            <div style={{ 
              display: "grid", 
              gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", 
              gap: "2rem" 
            }}>
              <div>
                <h4 style={{ color: "#059669", margin: "0 0 0.5rem 0" }}>✅ What We Access</h4>
                <ul style={{ color: "#6b7280", paddingLeft: "1.5rem" }}>
                  <li>Order IDs and totals</li>
                  <li>Product SKUs and quantities</li>
                  <li>Financial status</li>
                  <li>Fulfillment status</li>
                </ul>
              </div>
              
              <div>
                <h4 style={{ color: "#dc2626", margin: "0 0 0.5rem 0" }}>❌ What We Don't Access</h4>
                <ul style={{ color: "#6b7280", paddingLeft: "1.5rem" }}>
                  <li>Customer names</li>
                  <li>Email addresses</li>
                  <li>Phone numbers</li>
                  <li>Shipping addresses</li>
                </ul>
              </div>
            </div>
            
            <div style={{ 
              textAlign: "center", 
              marginTop: "2rem", 
              padding: "1.5rem", 
              backgroundColor: "#f0fdf4", 
              borderRadius: "8px",
              border: "1px solid #bbf7d0"
            }}>
              <strong style={{ color: "#059669" }}>
                🔒 Zero Data Storage Policy: All processing happens in-memory during your session only.
              </strong>
            </div>
          </div>
        </div>

        {/* CTA Section */}
        <div style={{ 
          textAlign: "center", 
          margin: "4rem 0", 
          padding: "4rem 2rem",
          backgroundColor: "white",
          borderRadius: "16px",
          boxShadow: "0 8px 25px rgba(0, 0, 0, 0.1)"
        }}>
          <h2 style={{ margin: "0 0 1rem 0", fontSize: "2.5rem", color: "#1f2937" }}>
            Ready to Get Started?
          </h2>
          <p style={{ fontSize: "1.2rem", color: "#6b7280", maxWidth: "600px", margin: "0 auto 2rem" }}>
            Install ShopDelta from the Shopify App Store and start analyzing your sales data with complete privacy protection.
          </p>
          
          <div style={{ display: "flex", gap: "1rem", justifyContent: "center", flexWrap: "wrap" }}>
            <a 
              href="https://apps.shopify.com" 
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "inline-block",
                padding: "16px 32px",
                background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                color: "white",
                textDecoration: "none",
                borderRadius: "12px",
                fontWeight: "600",
                fontSize: "1.1rem",
                transition: "transform 0.2s ease",
                boxShadow: "0 4px 15px rgba(102, 126, 234, 0.3)"
              }}
            >
              🏪 Install from Shopify App Store
            </a>
            
            <a 
              href="/public/privacy" 
              style={{
                display: "inline-block",
                padding: "16px 32px",
                background: "transparent",
                color: "#667eea",
                textDecoration: "none",
                borderRadius: "12px",
                fontWeight: "600",
                fontSize: "1.1rem",
                border: "2px solid #667eea",
                transition: "all 0.2s ease"
              }}
            >
              📋 View Privacy Policy
            </a>
          </div>
        </div>

        {/* Footer */}
        <div style={{ 
          textAlign: "center", 
          padding: "2rem", 
          color: "#6b7280",
          borderTop: "1px solid #e5e7eb",
          margin: "4rem 0 0 0"
        }}>
          <p style={{ margin: "0" }}>
            © 2025 ShopDelta. Built with privacy in mind for Shopify merchants.
          </p>
        </div>
      </div>
    </div>
  );
}
