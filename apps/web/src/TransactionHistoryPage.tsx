import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { fetchWalletTransactions, WalletTransaction } from "./lib/transactions";
import { Activity, ExternalLink, RefreshCw, CheckCircle2, AlertTriangle, ArrowUpRight, ArrowDownRight } from "lucide-react";

export default function TransactionHistoryPage({ refreshTrigger }: { refreshTrigger?: number }) {
  const { connection } = useConnection();
  const { publicKey } = useWallet();

  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [lastSignature, setLastSignature] = useState<string | null>(null);
  const [filter, setFilter] = useState<"ALL" | "PRISM" | "TRANSFERS" | "OTHER">("ALL");

  const fetchTxs = useCallback(
    async (reset: boolean) => {
      if (!publicKey) return;
      setLoading(true);
      try {
        const options = reset ? { limit: 20 } : { limit: 20, before: lastSignature || undefined };
        const result = await fetchWalletTransactions(connection, publicKey.toBase58(), options);
        
        setTransactions((prev) => {
          if (reset) return result.transactions;
          const existing = new Set(prev.map(t => t.signature));
          const newTxs = result.transactions.filter(t => !existing.has(t.signature));
          return [...prev, ...newTxs];
        });
        
        setLastSignature(result.lastSignature);
        setHasMore(result.transactions.length >= 20);
      } catch (err) {
        console.error("Failed to fetch transactions", err);
      } finally {
        setLoading(false);
      }
    },
    [connection, publicKey, lastSignature]
  );

  useEffect(() => {
    setTransactions([]);
    setLastSignature(null);
    setHasMore(false);
    if (publicKey) {
      fetchTxs(true);
    }
  }, [publicKey, refreshTrigger]);

  const displayedTxs = useMemo(() => {
    return transactions.filter(t => {
      if (filter === "ALL") return true;
      if (filter === "PRISM") return t.program === "6cD9BZG2bddZZ1xoNReLVEvdYVaxpxY97F7MfZyov7XW";
      if (filter === "TRANSFERS") return t.type === "TRANSFER";
      if (filter === "OTHER") return t.program !== "6cD9BZG2bddZZ1xoNReLVEvdYVaxpxY97F7MfZyov7XW" && t.type !== "TRANSFER";
      return true;
    });
  }, [transactions, filter]);

  if (!publicKey) {
    return (
      <div style={{ maxWidth: "800px", margin: "60px auto", padding: "40px", textAlignment: "center", background: "var(--bg-card)", border: "1px solid var(--border-subtle)", borderRadius: "16px" } as any}>
        <Activity size={40} color="var(--accent-cyan)" style={{ marginBottom: "16px" }} />
        <h2>Connect Wallet</h2>
        <p style={{ color: "var(--ink-secondary)" }}>Connect your Solana wallet to view on-chain trading and transaction history.</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: "1000px", margin: "0 auto", padding: "30px 20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <Activity size={28} color="var(--accent-cyan)" />
          <h2 style={{ margin: 0, fontFamily: "var(--font-heading)", fontSize: "1.8rem" }}>TRANSACTION HISTORY</h2>
        </div>
        <button onClick={() => fetchTxs(true)} className="refresh-btn" style={{ fontSize: "0.85rem", padding: "0.5rem 0.85rem" }}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      <div className="filter-pills" style={{ maxWidth: "400px", marginBottom: "24px" }}>
        {(["ALL", "PRISM", "TRANSFERS", "OTHER"] as const).map(f => (
          <button 
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`filter-pill ${filter === f ? "active" : ""}`}
          >
            {f}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {displayedTxs.map((tx) => (
          <div key={tx.signature} style={{ background: "var(--bg-card)", border: "1px solid var(--border-subtle)", borderRadius: "12px", padding: "16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: "bold", fontSize: "1rem" }}>
                {tx.type === "BUY" ? <ArrowUpRight color="var(--yes-color)" size={20} /> : tx.type === "SELL" ? <ArrowDownRight color="var(--no-color)" size={20} /> : <Activity size={18} color="var(--accent-cyan)" />}
                <span>
                  {tx.type === "BUY" ? `BUY ${tx.outcome}` :
                   tx.type === "SELL" ? `SELL ${tx.outcome}` :
                   tx.type === "RESOLVE" ? "MARKET RESOLVED" :
                   tx.type === "FREEZE" ? "MARKET FROZEN" :
                   tx.type === "CREATE_MARKET" ? "CREATE MARKET" :
                   tx.type === "REDEEM" ? "REDEEM WINNINGS" :
                   tx.type === "TRANSFER" ? "TRANSFER" : "OTHER TRANSACTION"}
                </span>
              </div>
              <span style={{ color: tx.status === "success" ? "var(--yes-color)" : "var(--no-color)", fontWeight: "bold", fontSize: "0.82rem", display: "flex", alignItems: "center", gap: "4px" }}>
                {tx.status === "success" ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
                {tx.status === "success" ? "SUCCESS" : "FAILED"}
              </span>
            </div>

            {tx.status === "failed" && tx.error && (
              <div style={{ color: "var(--no-color)", fontSize: "0.82rem", marginBottom: "8px" }}>
                {tx.error}
              </div>
            )}

            <div style={{ fontSize: "0.85rem", color: "var(--ink-secondary)", display: "flex", flexDirection: "column", gap: "4px" }}>
              {tx.marketPda || tx.polymarketId ? (
                <div>Market: <code>{tx.polymarketId || tx.marketPda}</code></div>
              ) : null}
              {tx.shares !== undefined && (
                <div>Shares: <strong>{tx.shares.toFixed(2)}</strong></div>
              )}
              {tx.usdcAmount !== undefined && (
                <div style={{ color: tx.usdcAmount > 0 ? "var(--yes-color)" : tx.usdcAmount < 0 ? "var(--no-color)" : "inherit", fontWeight: "bold" }}>
                  {tx.usdcAmount > 0 ? "+" : ""}{tx.usdcAmount.toFixed(2)} USDC
                </div>
              )}
              {tx.feeSol !== undefined && (
                <div style={{ color: "var(--ink-muted)", fontSize: "0.78rem" }}>Network fee: {tx.feeSol.toFixed(6)} SOL</div>
              )}
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "12px", paddingTop: "12px", borderTop: "1px solid var(--border-subtle)", fontSize: "0.8rem", color: "var(--ink-muted)" }}>
              <div>
                {tx.blockTime ? new Date(tx.blockTime * 1000).toLocaleString() : "Unknown time"}
              </div>
              <a href={tx.explorerUrl} target="_blank" rel="noreferrer" style={{ color: "var(--accent-cyan)", textDecoration: "none", display: "flex", alignItems: "center", gap: "4px" }}>
                View on Explorer <ExternalLink size={12} />
              </a>
            </div>
          </div>
        ))}
      </div>

      {loading && <div style={{ marginTop: "20px", color: "var(--ink-muted)", textAlign: "center" }}>Loading transaction signatures...</div>}
      
      {!loading && hasMore && (
        <button 
          onClick={() => fetchTxs(false)} 
          style={{ marginTop: "24px", padding: "12px", width: "100%", background: "var(--bg-card)", border: "1px solid var(--border-subtle)", color: "#fff", cursor: "pointer", borderRadius: "8px", fontWeight: "bold" }}
        >
          Load More History
        </button>
      )}
      
      {!loading && !hasMore && transactions.length > 0 && (
        <div style={{ marginTop: "24px", textAlign: "center", color: "var(--ink-muted)", fontSize: "0.85rem" }}>
          End of transaction history
        </div>
      )}
    </div>
  );
}
