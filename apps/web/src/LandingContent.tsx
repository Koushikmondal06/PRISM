import React from "react";
import {
  TrendingUp,
  Sparkles,
  Zap,
  ShieldCheck,
  BrainCircuit,
  ArrowRight,
  CheckCircle2,
  Activity,
  Layers,
  Globe,
  Coins,
  Award,
  Lock
} from "lucide-react";

function GithubIcon({ size = 19, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
      <path d="M9 18c-4.51 2-5-2-7-2" />
    </svg>
  );
}

interface LandingContentProps {
  onGetStarted: () => void;
  marketCount?: number;
}

export default function LandingContent({ onGetStarted, marketCount = 3 }: LandingContentProps) {
  const handleGithubClick = () => {
    window.open("https://github.com/ashad1718/PRISM", "_blank", "noopener,noreferrer");
  };

  return (
    <div className="landing-content-wrapper" style={{ padding: "2.5rem 1.5rem 4rem", maxWidth: "1200px", margin: "0 auto" }}>
      {/* Entry Hero Header: Full Form of PRISM */}
      <section
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
          gap: "1.5rem",
          padding: "2rem 1rem 3.5rem"
        }}
      >
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.5rem",
            padding: "0.45rem 1.25rem",
            borderRadius: "9999px",
            background: "rgba(3, 122, 107, 0.12)",
            border: "1px solid rgba(3, 122, 107, 0.35)",
            color: "#037A6B",
            fontFamily: "var(--font-heading)",
            fontSize: "0.9rem",
            fontWeight: 700,
            letterSpacing: "0.04em",
            textTransform: "uppercase"
          }}
        >
          <Sparkles size={16} />
          <span>Prediction and Real-World Intelligence Settlement Market</span>
        </div>

        {/* Full Form Title of PRISM */}
        <h1
          style={{
            fontFamily: "var(--font-heading)",
            fontSize: "clamp(2.2rem, 5vw, 3.8rem)",
            fontWeight: 800,
            color: "#1B2129",
            lineHeight: 1.15,
            margin: 0,
            maxWidth: "900px"
          }}
        >
          Decentralized Intelligence & Automated LMSR Settlement on Solana
        </h1>

        <p
          style={{
            fontSize: "clamp(1rem, 2vw, 1.2rem)",
            color: "#4A5264",
            maxWidth: "720px",
            lineHeight: 1.6,
            margin: 0
          }}
        >
          PRISM merges Polymarket's external truth discovery with Solana's high-speed execution, 
          continuous LMSR bonding curve liquidity, and automated AI oracle resolution.
        </p>

        {/* Action Buttons: Get Started & GitHub Repo */}
        <div style={{ display: "flex", alignItems: "center", gap: "1.1rem", flexWrap: "wrap", justifyContent: "center", marginTop: "1rem" }}>
          <button
            type="button"
            className="get-started-btn"
            onClick={onGetStarted}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.65rem",
              padding: "0.95rem 2.25rem",
              borderRadius: "8px",
              fontFamily: "var(--font-heading)",
              fontSize: "1.1rem",
              fontWeight: 700,
              color: "#ffffff",
              background: "#037A6B",
              border: "none",
              cursor: "pointer",
              boxShadow: "0 4px 14px rgba(3, 122, 107, 0.3)",
              transition: "all 0.2s ease"
            }}
          >
            <span>GET STARTED</span>
            <ArrowRight size={18} />
          </button>

          <button
            type="button"
            className="github-repo-btn"
            onClick={handleGithubClick}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.65rem",
              padding: "0.95rem 1.8rem",
              borderRadius: "8px",
              fontFamily: "var(--font-heading)",
              fontSize: "1.05rem",
              fontWeight: 600,
              color: "#1B2129",
              background: "#FFFFFF",
              border: "1px solid #C2E7E0",
              cursor: "pointer",
              boxShadow: "0 2px 8px rgba(3, 122, 107, 0.08)",
              transition: "all 0.2s ease"
            }}
          >
            <GithubIcon size={19} color="#1B2129" />
            <span>GitHub Repository</span>
          </button>
        </div>
      </section>

      {/* Live Metrics Stats Bar */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "1.25rem",
          background: "rgba(255, 255, 255, 0.95)",
          border: "1px solid #C2E7E0",
          borderRadius: "12px",
          padding: "1.5rem",
          marginBottom: "3.5rem",
          boxShadow: "0 2px 12px rgba(3, 122, 107, 0.08)"
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem", textAlign: "center" }}>
          <span style={{ fontFamily: "var(--font-heading)", fontSize: "1.85rem", fontWeight: 800, color: "#037A6B" }}>
            {marketCount}+
          </span>
          <span style={{ fontSize: "0.78rem", color: "#4A5264", fontWeight: 700, textTransform: "uppercase" }}>
            Active Markets
          </span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem", textAlign: "center" }}>
          <span style={{ fontFamily: "var(--font-heading)", fontSize: "1.85rem", fontWeight: 800, color: "#1B2129" }}>
            LMSR
          </span>
          <span style={{ fontSize: "0.78rem", color: "#4A5264", fontWeight: 700, textTransform: "uppercase" }}>
            Bonding Curve Pricing
          </span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem", textAlign: "center" }}>
          <span style={{ fontFamily: "var(--font-heading)", fontSize: "1.85rem", fontWeight: 800, color: "#037A6B" }}>
            100%
          </span>
          <span style={{ fontSize: "0.78rem", color: "#4A5264", fontWeight: 700, textTransform: "uppercase" }}>
            USDC Collateralized
          </span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem", textAlign: "center" }}>
          <span style={{ fontFamily: "var(--font-heading)", fontSize: "1.85rem", fontWeight: 800, color: "#1B2129" }}>
            AI QA
          </span>
          <span style={{ fontSize: "0.78rem", color: "#4A5264", fontWeight: 700, textTransform: "uppercase" }}>
            Automated Settlement
          </span>
        </div>
      </div>

      {/* About PRISM & Architecture Cards */}
      <section style={{ marginBottom: "3.5rem" }}>
        <div style={{ textAlign: "center", marginBottom: "2.25rem" }}>
          <h2 style={{ fontFamily: "var(--font-heading)", fontSize: "clamp(1.6rem, 3.5vw, 2.2rem)", fontWeight: 800, color: "#1B2129", margin: "0 0 0.5rem" }}>
            Engineered for Precision, Speed & Liquidity
          </h2>
          <p style={{ color: "#4A5264", maxWidth: "620px", margin: "0 auto", fontSize: "0.98rem" }}>
            PRISM provides a robust infrastructure for real-world event trading with instant automated settlement.
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "1.5rem" }}>
          <div
            style={{
              background: "rgba(255, 255, 255, 0.95)",
              border: "1px solid #C2E7E0",
              borderRadius: "12px",
              padding: "1.6rem",
              display: "flex",
              flexDirection: "column",
              gap: "0.85rem",
              boxShadow: "0 2px 10px rgba(3, 122, 107, 0.06)"
            }}
          >
            <div style={{ width: "42px", height: "42px", borderRadius: "8px", background: "rgba(3, 122, 107, 0.12)", border: "1px solid rgba(3, 122, 107, 0.35)", display: "flex", alignItems: "center", justifyContent: "center", color: "#037A6B" }}>
              <Zap size={22} />
            </div>
            <h3 style={{ fontFamily: "var(--font-heading)", fontSize: "1.15rem", fontWeight: 700, margin: 0, color: "#1B2129" }}>
              LMSR Automated Liquidity
            </h3>
            <p style={{ fontSize: "0.9rem", color: "#4A5264", lineHeight: 1.5, margin: 0 }}>
              Logarithmic Market Scoring Rule (LMSR) bonding curves guarantee constant market liquidity, bounded loss for market creators, and continuous price discovery.
            </p>
          </div>

          <div
            style={{
              background: "rgba(255, 255, 255, 0.95)",
              border: "1px solid #C2E7E0",
              borderRadius: "12px",
              padding: "1.6rem",
              display: "flex",
              flexDirection: "column",
              gap: "0.85rem",
              boxShadow: "0 2px 10px rgba(3, 122, 107, 0.06)"
            }}
          >
            <div style={{ width: "42px", height: "42px", borderRadius: "8px", background: "rgba(3, 122, 107, 0.12)", border: "1px solid rgba(3, 122, 107, 0.35)", display: "flex", alignItems: "center", justifyContent: "center", color: "#037A6B" }}>
              <BrainCircuit size={22} />
            </div>
            <h3 style={{ fontFamily: "var(--font-heading)", fontSize: "1.15rem", fontWeight: 700, margin: 0, color: "#1B2129" }}>
              AI Market Curation & QA
            </h3>
            <p style={{ fontSize: "0.9rem", color: "#4A5264", lineHeight: 1.5, margin: 0 }}>
              LLM models score incoming markets for resolution clarity, rewrite titles into crisp copy, generate tag taxonomies, and extract market summaries.
            </p>
          </div>

          <div
            style={{
              background: "rgba(255, 255, 255, 0.95)",
              border: "1px solid #C2E7E0",
              borderRadius: "12px",
              padding: "1.6rem",
              display: "flex",
              flexDirection: "column",
              gap: "0.85rem",
              boxShadow: "0 2px 10px rgba(3, 122, 107, 0.06)"
            }}
          >
            <div style={{ width: "42px", height: "42px", borderRadius: "8px", background: "rgba(3, 122, 107, 0.12)", border: "1px solid rgba(3, 122, 107, 0.35)", display: "flex", alignItems: "center", justifyContent: "center", color: "#037A6B" }}>
              <ShieldCheck size={22} />
            </div>
            <h3 style={{ fontFamily: "var(--font-heading)", fontSize: "1.15rem", fontWeight: 700, margin: 0, color: "#1B2129" }}>
              Automated Oracle Verification
            </h3>
            <p style={{ fontSize: "0.9rem", color: "#4A5264", lineHeight: 1.5, margin: 0 }}>
              Web-search-backed confidence checks verify resolution outcomes before signing on-chain payouts, safeguarding user collateral and integrity.
            </p>
          </div>
        </div>
      </section>

      {/* How it Works Step Card */}
      <section
        style={{
          background: "rgba(255, 255, 255, 0.95)",
          border: "1px solid #C2E7E0",
          borderRadius: "14px",
          padding: "2.5rem 2rem",
          marginBottom: "3.5rem",
          boxShadow: "0 2px 12px rgba(3, 122, 107, 0.06)"
        }}
      >
        <h2 style={{ fontFamily: "var(--font-heading)", fontSize: "1.8rem", fontWeight: 800, textAlign: "center", margin: "0 0 2rem", color: "#1B2129" }}>
          How PRISM Works
        </h2>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "1.5rem" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
            <div style={{ fontSize: "0.85rem", fontWeight: 800, color: "#037A6B", textTransform: "uppercase" }}>
              Step 01
            </div>
            <h4 style={{ fontFamily: "var(--font-heading)", fontSize: "1.1rem", fontWeight: 700, margin: 0, color: "#1B2129" }}>
              Select a Market
            </h4>
            <p style={{ fontSize: "0.88rem", color: "#4A5264", lineHeight: 1.5, margin: 0 }}>
              Explore real-world prediction markets curated across technology, crypto, economics, and global intelligence.
            </p>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
            <div style={{ fontSize: "0.85rem", fontWeight: 800, color: "#037A6B", textTransform: "uppercase" }}>
              Step 02
            </div>
            <h4 style={{ fontFamily: "var(--font-heading)", fontSize: "1.1rem", fontWeight: 700, margin: 0, color: "#1B2129" }}>
              Trade Outcome Shares
            </h4>
            <p style={{ fontSize: "0.88rem", color: "#4A5264", lineHeight: 1.5, margin: 0 }}>
              Buy YES or NO positions with instant pricing calculated dynamically by on-chain LMSR bonding curves.
            </p>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
            <div style={{ fontSize: "0.85rem", fontWeight: 800, color: "#037A6B", textTransform: "uppercase" }}>
              Step 03
            </div>
            <h4 style={{ fontFamily: "var(--font-heading)", fontSize: "1.1rem", fontWeight: 700, margin: 0, color: "#1B2129" }}>
              Instant USDC Redemption
            </h4>
            <p style={{ fontSize: "0.88rem", color: "#4A5264", lineHeight: 1.5, margin: 0 }}>
              Once resolved, winning share positions redeem 1:1 for USDC directly to your Solana wallet.
            </p>
          </div>
        </div>
      </section>

      {/* Bottom CTA Card */}
      <section
        style={{
          background: "rgba(255, 255, 255, 0.95)",
          border: "1px solid #C2E7E0",
          borderRadius: "14px",
          padding: "3rem 2rem",
          textAlign: "center",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "1.25rem",
          boxShadow: "0 4px 20px rgba(3, 122, 107, 0.08)"
        }}
      >
        <h2 style={{ fontFamily: "var(--font-heading)", fontSize: "clamp(1.8rem, 4vw, 2.5rem)", fontWeight: 800, margin: 0, color: "#1B2129" }}>
          Ready to Trade Real-World Intelligence?
        </h2>
        <p style={{ color: "#4A5264", maxWidth: "580px", margin: 0, fontSize: "1rem", lineHeight: 1.5 }}>
          Connect your Solana wallet to explore active markets, trade LMSR positions, or audit our open-source codebase on GitHub.
        </p>

        <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap", justifyContent: "center", marginTop: "0.5rem" }}>
          <button
            type="button"
            className="get-started-btn"
            onClick={onGetStarted}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.65rem",
              padding: "0.95rem 2.25rem",
              borderRadius: "8px",
              fontFamily: "var(--font-heading)",
              fontSize: "1.1rem",
              fontWeight: 700,
              color: "#ffffff",
              background: "#037A6B",
              border: "none",
              cursor: "pointer",
              boxShadow: "0 4px 14px rgba(3, 122, 107, 0.3)"
            }}
          >
            <span>GET STARTED TRADING</span>
            <ArrowRight size={18} />
          </button>

          <button
            type="button"
            className="github-repo-btn"
            onClick={handleGithubClick}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.65rem",
              padding: "0.95rem 1.8rem",
              borderRadius: "8px",
              fontFamily: "var(--font-heading)",
              fontSize: "1.05rem",
              fontWeight: 600,
              color: "#1B2129",
              background: "#FFFFFF",
              border: "1px solid #C2E7E0",
              cursor: "pointer"
            }}
          >
            <GithubIcon size={19} color="#1B2129" />
            <span>GitHub Repository</span>
          </button>
        </div>
      </section>
    </div>
  );
}
