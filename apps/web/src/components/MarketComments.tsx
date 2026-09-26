import React, { useState, useEffect } from "react";
import { useWallet } from "@solana/wallet-adapter-react";

interface Comment {
  id: number;
  prism_market_id: string;
  polymarket_id: string | null;
  username: string;
  wallet_address: string | null;
  message: string;
  created_at: string;
}

export const MarketComments: React.FC<{ marketId: string }> = ({ marketId }) => {
  const { publicKey } = useWallet();
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [username, setUsername] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const fetchComments = async () => {
    try {
      // We assume the API runs on the same origin or via vite proxy, 
      // but App.tsx uses https://api.002014.xyz or similar.
      // We'll use the relative path if proxy is set, or window.location.origin
      // Let's use the env var or default to localhost:3000 for local dev
      const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:3000";
      const res = await fetch(`${apiUrl}/api/markets/${marketId}/comments`);
      if (!res.ok) throw new Error("Failed to load comments");
      const data = await res.json();
      setComments(data.comments || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchComments();
  }, [marketId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !message.trim()) return;
    
    setSubmitting(true);
    setError(null);
    try {
      const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:3000";
      const res = await fetch(`${apiUrl}/api/markets/${marketId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username,
          message,
          walletAddress: publicKey ? publicKey.toBase58() : undefined
        })
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to post comment");
      
      setMessage("");
      fetchComments();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ marginTop: "32px", padding: "24px", background: "var(--glass-bg)", borderRadius: "16px", border: "1px solid var(--glass-border)" }}>
      <h3 style={{ margin: "0 0 16px 0", color: "var(--ink-base)", display: "flex", alignItems: "center", gap: "8px" }}>
        Market Discussion
      </h3>
      
      {error && (
        <div style={{ padding: "12px", background: "rgba(255, 60, 60, 0.1)", color: "#ff4d4d", borderRadius: "8px", marginBottom: "16px" }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ padding: "20px", textAlign: "center", color: "var(--ink-muted)" }}>Loading comments...</div>
      ) : comments.length === 0 ? (
        <div style={{ padding: "20px", textAlign: "center", color: "var(--ink-muted)", fontStyle: "italic" }}>
          No comments yet. Be the first to share your thoughts!
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px", marginBottom: "24px", maxHeight: "400px", overflowY: "auto" }}>
          {comments.map(c => (
            <div key={c.id} style={{ padding: "12px 16px", background: "rgba(255,255,255,0.03)", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.05)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "6px" }}>
                <span style={{ fontWeight: 600, color: "var(--brand-primary)" }}>{c.username}</span>
                <span style={{ fontSize: "0.8rem", color: "var(--ink-muted)" }}>
                  {new Date(c.created_at).toLocaleString()}
                </span>
              </div>
              <div style={{ color: "var(--ink-base)", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                {c.message}
              </div>
              {c.wallet_address && (
                <div style={{ marginTop: "8px", fontSize: "0.75rem", color: "var(--ink-muted)" }}>
                  <code style={{ background: "rgba(0,0,0,0.2)", padding: "2px 6px", borderRadius: "4px" }}>
                    {c.wallet_address.substring(0, 4)}...{c.wallet_address.substring(c.wallet_address.length - 4)}
                  </code>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "12px", marginTop: "24px" }}>
        <input
          type="text"
          placeholder="Display Name"
          value={username}
          onChange={e => setUsername(e.target.value)}
          maxLength={64}
          disabled={submitting}
          required
          style={{
            padding: "12px 16px",
            background: "rgba(0,0,0,0.2)",
            border: "1px solid var(--glass-border)",
            borderRadius: "8px",
            color: "var(--ink-base)",
            fontSize: "1rem"
          }}
        />
        <textarea
          placeholder="What do you think about this market?"
          value={message}
          onChange={e => setMessage(e.target.value)}
          maxLength={2000}
          disabled={submitting}
          required
          rows={3}
          style={{
            padding: "12px 16px",
            background: "rgba(0,0,0,0.2)",
            border: "1px solid var(--glass-border)",
            borderRadius: "8px",
            color: "var(--ink-base)",
            fontSize: "1rem",
            resize: "vertical"
          }}
        />
        <button
          type="submit"
          disabled={submitting || !username.trim() || !message.trim()}
          style={{
            padding: "12px",
            background: submitting ? "rgba(255,255,255,0.1)" : "var(--brand-primary)",
            color: submitting ? "var(--ink-muted)" : "black",
            border: "none",
            borderRadius: "8px",
            fontWeight: 600,
            cursor: submitting ? "not-allowed" : "pointer",
            transition: "all 0.2s ease"
          }}
        >
          {submitting ? "Posting..." : "Post Comment"}
        </button>
      </form>
    </div>
  );
};
