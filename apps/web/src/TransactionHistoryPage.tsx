import { useState, useEffect, useCallback, useMemo } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { fetchWalletTransactions, WalletTransaction } from "./lib/transactions";

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
          // Deduplicate by signature
          const existing = new Set(prev.map(t => t.signature));
          const newTxs = result.transactions.filter(t => !existing.has(t.signature));
          return [...prev, ...newTxs];
        });
        
        setLastSignature(result.lastSignature);
        setHasMore(result.transactions.length >= 20); // rough heuristic
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
    return <div style={{ padding: "20px" }}>Connect wallet to view transaction history.</div>;
  }

  return (
    <div style={{ padding: "20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <h2 style={{ margin: 0 }}>Transaction History</h2>
        <button onClick={() => fetchTxs(true)} className="ghost" style={{ cursor: "pointer", fontSize: "0.9em" }}>
          ↻ Refresh
        </button>
      </div>

      <div style={{ display: "flex", gap: "10px", marginBottom: "20px" }}>
        {(["ALL", "PRISM", "TRANSFERS", "OTHER"] as const).map(f => (
          <button 
            key={f}
            onClick={() => setFilter(f)}
            style={{ 
              background: filter === f ? "#333" : "transparent",
              color: filter === f ? "#fff" : "#888",
              border: "1px solid #444",
              padding: "4px 8px",
              borderRadius: "4px",
              cursor: "pointer"
            }}
          >
            {f}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
        {displayedTxs.map((tx) => (
          <div key={tx.signature} style={{ borderBottom: "1px solid #333", paddingBottom: "15px" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <strong>
                {tx.type === "BUY" ? `BUY ${tx.outcome}` :
                 tx.type === "SELL" ? `SELL ${tx.outcome}` :
                 tx.type === "RESOLVE" ? "MARKET RESOLVED" :
                 tx.type === "FREEZE" ? "MARKET FROZEN" :
                 tx.type === "CREATE_MARKET" ? "CREATE MARKET" :
                 tx.type === "REDEEM" ? "REDEEM" :
                 tx.type === "TRANSFER" ? "TRANSFER" : "OTHER"}
              </strong>
              <span style={{ color: tx.status === "success" ? "#4caf50" : "#f44336", fontWeight: "bold" }}>
                {tx.status === "success" ? "SUCCESS" : "FAILED"}
              </span>
            </div>

            {tx.status === "failed" && tx.error && (
              <div style={{ color: "#f44336", fontSize: "0.85em", marginTop: "4px" }}>
                {tx.error}
              </div>
            )}

            <div style={{ fontSize: "0.9em", color: "#ccc", marginTop: "8px" }}>
              {tx.marketPda || tx.polymarketId ? (
                <div>Market: {tx.polymarketId || tx.marketPda}</div>
              ) : null}
              {tx.program !== "Unknown" && tx.program !== "6cD9BZG2bddZZ1xoNReLVEvdYVaxpxY97F7MfZyov7XW" && (
                <div>Program: {tx.program}</div>
              )}
              {tx.shares !== undefined && (
                <div>Shares: {tx.shares.toFixed(2)}</div>
              )}
              {tx.usdcAmount !== undefined && (
                <div style={{ color: tx.usdcAmount > 0 ? "#4caf50" : tx.usdcAmount < 0 ? "#f44336" : "inherit" }}>
                  {tx.usdcAmount > 0 ? "+" : ""}{tx.usdcAmount.toFixed(2)} USDC
                </div>
              )}
              {tx.type === "RESOLVE" && tx.outcome !== undefined && (
                <div>Winner: {tx.outcome}</div>
              )}
              {tx.feeSol !== undefined && (
                <div style={{ color: "#888", fontSize: "0.8em", marginTop: "4px" }}>Network fee: {tx.feeSol.toFixed(6)} SOL</div>
              )}
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "10px", fontSize: "0.85em", color: "#888" }}>
              <div>
                {tx.blockTime ? new Date(tx.blockTime * 1000).toLocaleString(undefined, {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit"
                }) : "Unknown time"}
              </div>
              <a href={tx.explorerUrl} target="_blank" rel="noreferrer" style={{ color: "#2196f3", textDecoration: "none" }}>
                View transaction ↗
              </a>
            </div>
          </div>
        ))}
      </div>

      {loading && <div style={{ marginTop: "15px", color: "#888" }}>Loading transactions...</div>}
      
      {!loading && hasMore && (
        <button 
          onClick={() => fetchTxs(false)} 
          style={{ marginTop: "20px", padding: "10px", width: "100%", background: "#222", border: "1px solid #444", color: "#fff", cursor: "pointer", borderRadius: "4px" }}
        >
          Load more
        </button>
      )}
      
      {!loading && !hasMore && transactions.length > 0 && (
        <div style={{ marginTop: "20px", textAlign: "center", color: "#555", fontSize: "0.9em" }}>
          No more transactions
        </div>
      )}
    </div>
  );
}
