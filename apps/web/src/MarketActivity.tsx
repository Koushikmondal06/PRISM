import { useState, useEffect, useCallback } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { fetchMarketTransactions, WalletTransaction } from "./lib/transactions";
import { PublicKey } from "@solana/web3.js";
import { StoredMarket } from "@prism/shared";

function formatRelativeTime(timestamp: number) {
  const diff = Math.floor(Date.now() / 1000 - timestamp);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 2592000) return `${Math.floor(diff / 86400)}d ago`;
  
  return new Date(timestamp * 1000).toLocaleDateString();
}

export default function MarketActivity({ 
    market, 
    marketPda,
    refreshTrigger 
}: { 
    market: StoredMarket; 
    marketPda: string;
    refreshTrigger?: number; 
}) {
  const { connection } = useConnection();
  const { publicKey } = useWallet();

  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const fetchTxs = useCallback(async (force = false, signal?: AbortSignal) => {
    if (!marketPda) return;
    
    setLoading(true);
    if (force) setError(null); // Keep existing error unless forcing
    
    try {
      const options = { limit: 15, force }; // Fetch 15 max instead of 50
      const walletAddr = publicKey ? publicKey.toBase58() : null;
      const result = await fetchMarketTransactions(connection, marketPda, walletAddr, options);
      
      if (signal?.aborted) return;
      
      setTransactions(result.transactions);
      setError(null);
    } catch (err: any) {
      if (signal?.aborted) return;
      console.error("Failed to fetch market transactions", err);
      setError(err.message || String(err));
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
      }
    }
  }, [connection, marketPda, publicKey]);

  useEffect(() => {
    const controller = new AbortController();
    fetchTxs(false, controller.signal);
    return () => controller.abort();
  }, [fetchTxs, refreshTrigger]);

  const displayedTxs = showAll ? transactions : transactions.slice(0, 5);

  return (
    <div style={{ marginTop: "30px", borderTop: "1px solid #333", paddingTop: "20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "15px" }}>
        <h3 style={{ margin: 0, fontSize: "1.1em", fontWeight: "normal", color: "#ccc" }}>RECENT ACTIVITY</h3>
        <button onClick={() => fetchTxs(true)} className="ghost" style={{ cursor: "pointer", fontSize: "0.85em", padding: "4px 8px" }} title="Refresh Activity">
          ↻
        </button>
      </div>

      {loading && transactions.length === 0 && (
        <div style={{ color: "#888", fontSize: "0.9em" }}>Loading transactions...</div>
      )}

      {error && (
        <div style={{ color: "#f44336", fontSize: "0.9em" }}>
          Unable to load recent activity: {error}
          <button onClick={() => fetchTxs(true)} style={{ marginLeft: "10px", background: "none", border: "1px solid #444", color: "#ccc", cursor: "pointer", borderRadius: "4px" }}>Retry</button>
        </div>
      )}

      {!loading && !error && transactions.length === 0 && (
        <div style={{ color: "#888", fontSize: "0.9em", padding: "10px 0" }}>
          No transactions yet.<br />
          Be the first to trade this market.
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {displayedTxs.map(tx => (
          <div key={tx.signature} style={{ display: "flex", justifyContent: "space-between", fontSize: "0.9em", paddingBottom: "10px", borderBottom: "1px solid #222" }}>
            
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: "bold", color: tx.status === "failed" ? "#f44336" : "#ddd" }}>
                {tx.type === "BUY" ? `[BUY] ${tx.outcome}` :
                 tx.type === "SELL" ? `[SELL] ${tx.outcome}` :
                 tx.type === "RESOLVE" ? `[RESOLVE] ${tx.outcome}` :
                 tx.type === "FREEZE" ? "[FREEZE]" :
                 tx.type === "CREATE_MARKET" ? "[CREATE MARKET]" :
                 tx.type === "REDEEM" ? "[REDEEM]" : `[${tx.type}]`}

                {tx.status === "failed" && <span style={{ marginLeft: "6px", fontSize: "0.85em", color: "#f44336" }}>FAILED</span>}
              </div>

              {tx.status === "failed" && tx.error && (
                <div style={{ color: "#f44336", fontSize: "0.8em", marginTop: "2px" }}>
                  {tx.error}
                </div>
              )}
              
              {(tx.type === "BUY" || tx.type === "SELL") && tx.shares !== undefined && tx.status === "success" && (
                <div style={{ color: "#aaa", marginTop: "4px" }}>
                  {tx.shares.toFixed(2)} shares
                </div>
              )}
            </div>

            <div style={{ textAlign: "right" }}>
              {(tx.type === "BUY" || tx.type === "SELL" || tx.type === "REDEEM") && tx.usdcAmount !== undefined && tx.status === "success" && (
                <div style={{ color: tx.usdcAmount > 0 ? "#4caf50" : tx.usdcAmount < 0 ? "#f44336" : "#aaa", fontWeight: "bold" }}>
                  {tx.usdcAmount > 0 ? "+" : ""}{tx.usdcAmount.toFixed(2)} USDC
                </div>
              )}
              
              <div style={{ color: "#666", fontSize: "0.85em", marginTop: "4px", display: "flex", alignItems: "center", gap: "6px", justifyContent: "flex-end" }}>
                {tx.blockTime ? formatRelativeTime(tx.blockTime) : "Unknown"}
                <a href={tx.explorerUrl} target="_blank" rel="noreferrer" style={{ color: "#666", textDecoration: "none" }} title="View on Explorer">
                  ↗
                </a>
              </div>
            </div>

          </div>
        ))}
      </div>

      {!loading && transactions.length > 5 && (
        <button 
          onClick={() => setShowAll(!showAll)} 
          style={{ 
            marginTop: "15px", 
            background: "none", 
            border: "none", 
            color: "#aaa", 
            cursor: "pointer", 
            fontSize: "0.9em",
            padding: 0
          }}
        >
          {showAll ? "Show less ↑" : `View all ${transactions.length} transactions →`}
        </button>
      )}
    </div>
  );
}
