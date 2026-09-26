import React, { useState } from "react";
import { RefreshCw, PlayCircle, StopCircle, Info, Tag, Clock } from "lucide-react";

export default function GammaMarketManager({ gammaMarkets, refreshGamma }: { gammaMarkets: any[], refreshGamma: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [selectedMarket, setSelectedMarket] = useState<any | null>(null);
  
  const activateMarket = async (market: any) => {
    if (!confirm(`Activate PRISM Market?\n\nQuestion: ${market.question}\nPolymarket ID: ${market.polymarketId}\nEnd: ${new Date(market.endTs * 1000).toLocaleString()}\n\nInitial PRISM pricing:\nYES 50%\nNO 50%\n\n[ CANCEL ]        [ CREATE PRISM MARKET ]`)) {
      return;
    }
    
    setBusy(market.polymarketId);
    try {
      const res = await fetch(`https://api.002014.xyz/api/admin/markets/${market.polymarketId}/activate`, {
        method: "POST",
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Failed to activate");
      alert(`Success! PRISM Market created: ${data.prismMarketPubkey}`);
      refreshGamma();
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setBusy(null);
      setSelectedMarket(null);
    }
  };

  const stopMarket = async (market: any) => {
    if (!market.prismMarketPubkey) return;
    
    if (!confirm(`Stop PRISM Market?\n\nQuestion: ${market.question}\n\nThis will stop trading but will NOT resolve the market.\n\n[ CANCEL ]        [ STOP MARKET ]`)) {
      return;
    }
    
    setBusy(market.polymarketId);
    try {
      const res = await fetch(`https://api.002014.xyz/api/admin/markets/${market.prismMarketPubkey}/stop`, {
        method: "POST",
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Failed to stop");
      alert(`Success! Market frozen.`);
      refreshGamma();
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setBusy(null);
      setSelectedMarket(null);
    }
  };

  const filtered = gammaMarkets.filter(m => {
    if (search && !m.question.toLowerCase().includes(search.toLowerCase()) && !m.polymarketId.includes(search)) {
      return false;
    }
    if (statusFilter !== "ALL") {
      const status = (m.prismStatus || "imported").toUpperCase();
      if (status !== statusFilter) return false;
    }
    return true;
  });

  return (
    <div style={{ marginTop: "40px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
        <div>
          <h3 style={{ margin: "0 0 4px 0", color: "var(--ink-primary)" }}>POLYMARKET GAMMA MARKETS</h3>
          <p style={{ color: "var(--ink-muted)", fontSize: "0.9em", margin: 0 }}>Control which external events are live on PRISM.</p>
        </div>
        <button onClick={refreshGamma} style={{ background: "var(--bg-card)", border: "1px solid var(--border-subtle)", color: "var(--ink-secondary)", padding: "6px 12px", borderRadius: "6px", cursor: "pointer", display: "flex", alignItems: "center", gap: "6px" }}>
          <RefreshCw size={14} /> REFRESH GAMMA CACHE
        </button>
      </div>

      <div style={{ display: "flex", gap: "10px", marginBottom: "16px" }}>
        <input 
          type="text" 
          placeholder="Search by question or ID..." 
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ flex: 1, padding: "8px 12px", background: "var(--bg-card)", border: "1px solid var(--border-subtle)", color: "var(--ink-primary)", borderRadius: "6px" }}
        />
        <select 
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          style={{ padding: "8px 12px", background: "var(--bg-card)", border: "1px solid var(--border-subtle)", color: "var(--ink-primary)", borderRadius: "6px" }}
        >
          <option value="ALL">All Status</option>
          <option value="IMPORTED">Imported (Not Live)</option>
          <option value="OPEN">Live / Open</option>
          <option value="FROZEN">Stopped / Frozen</option>
          <option value="RESOLVED">Resolved</option>
        </select>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        {filtered.length === 0 ? <p style={{ color: "var(--ink-muted)" }}>No markets found matching criteria.</p> : filtered.map(m => (
          <div key={m.polymarketId} style={{ background: "var(--bg-card)", border: "1px solid var(--border-subtle)", borderRadius: "8px", overflow: "hidden" }}>
            <div 
              style={{ padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}
              onClick={() => setSelectedMarket(selectedMarket?.polymarketId === m.polymarketId ? null : m)}
            >
              <div>
                <h5 style={{ margin: "0 0 6px 0", color: "var(--ink-primary)", fontSize: "1rem" }}>{m.question}</h5>
                <div style={{ fontSize: "0.8em", color: "var(--ink-muted)", display: "flex", gap: "12px", alignItems: "center" }}>
                  <span><Tag size={12} style={{ display: "inline", verticalAlign: "middle", marginRight: "4px" }} /> ID: {m.polymarketId}</span>
                  <span><Clock size={12} style={{ display: "inline", verticalAlign: "middle", marginRight: "4px" }} /> {new Date(m.endTs * 1000).toLocaleDateString()}</span>
                  <span><strong>Gamma YES:</strong> {(m.yesPrice*100).toFixed(1)}%</span>
                </div>
              </div>
              <div>
                {m.prismStatus === "open" ? (
                  <span style={{ background: "var(--yes-color-muted)", color: "var(--yes-color)", padding: "4px 8px", borderRadius: "4px", fontSize: "0.75rem", fontWeight: "bold" }}>LIVE ON PRISM</span>
                ) : m.prismStatus === "frozen" ? (
                  <span style={{ background: "var(--amber-color-muted)", color: "var(--amber-color)", padding: "4px 8px", borderRadius: "4px", fontSize: "0.75rem", fontWeight: "bold" }}>STOPPED</span>
                ) : m.prismStatus === "resolved" ? (
                  <span style={{ background: "var(--bg-subtle)", color: "var(--ink-muted)", padding: "4px 8px", borderRadius: "4px", fontSize: "0.75rem", fontWeight: "bold" }}>RESOLVED</span>
                ) : (
                  <span style={{ background: "var(--bg-subtle)", color: "var(--ink-secondary)", padding: "4px 8px", borderRadius: "4px", fontSize: "0.75rem", fontWeight: "bold" }}>IMPORTED</span>
                )}
              </div>
            </div>

            {selectedMarket?.polymarketId === m.polymarketId && (
              <div style={{ padding: "16px", background: "var(--bg-subtle)", borderTop: "1px solid var(--border-subtle)", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px" }}>
                <div>
                  <h4 style={{ margin: "0 0 12px 0", color: "var(--ink-secondary)", fontSize: "0.85rem", textTransform: "uppercase" }}>Polymarket Reference</h4>
                  <div style={{ fontSize: "0.85rem", color: "var(--ink-muted)", display: "flex", flexDirection: "column", gap: "6px" }}>
                    <div><strong>ID:</strong> {m.polymarketId}</div>
                    <div><strong>Ends:</strong> {new Date(m.endTs * 1000).toLocaleString()}</div>
                    <div><strong>Active:</strong> {m.raw?.active ? "Yes" : "No"}</div>
                    <div><strong>Closed:</strong> {m.raw?.closed ? "Yes" : "No"}</div>
                    <div><strong>Liquidity:</strong> {m.raw?.liquidity ? `$${m.raw.liquidity}` : "N/A"}</div>
                    <div><strong>Outcomes:</strong> {m.raw?.outcomes ? JSON.parse(m.raw.outcomes).join(", ") : "Yes, No"}</div>
                  </div>
                </div>
                <div>
                  <h4 style={{ margin: "0 0 12px 0", color: "var(--ink-secondary)", fontSize: "0.85rem", textTransform: "uppercase" }}>PRISM Market</h4>
                  <div style={{ fontSize: "0.85rem", color: "var(--ink-muted)", display: "flex", flexDirection: "column", gap: "6px" }}>
                    <div><strong>Status:</strong> <span style={{ textTransform: "uppercase", fontWeight: "bold", color: "var(--ink-primary)" }}>{m.prismStatus || "Imported"}</span></div>
                    {m.prismMarketPubkey && (
                      <div><strong>Market PDA:</strong> <code>{m.prismMarketPubkey}</code></div>
                    )}
                  </div>
                  
                  <div style={{ marginTop: "16px", display: "flex", gap: "10px" }}>
                    {(!m.prismStatus || m.prismStatus === "imported") && (
                      <button 
                        onClick={() => activateMarket(m)} 
                        disabled={busy === m.polymarketId}
                        style={{ background: "var(--yes-color)", color: "#fff", border: "none", padding: "8px 16px", borderRadius: "6px", cursor: busy ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: "6px", fontWeight: "bold" }}
                      >
                        {busy === m.polymarketId ? <RefreshCw size={16} className="animate-spin" /> : <PlayCircle size={16} />}
                        MAKE LIVE
                      </button>
                    )}
                    
                    {m.prismStatus === "open" && (
                      <button 
                        onClick={() => stopMarket(m)} 
                        disabled={busy === m.polymarketId}
                        style={{ background: "var(--amber-color)", color: "#fff", border: "none", padding: "8px 16px", borderRadius: "6px", cursor: busy ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: "6px", fontWeight: "bold" }}
                      >
                        {busy === m.polymarketId ? <RefreshCw size={16} className="animate-spin" /> : <StopCircle size={16} />}
                        STOP MARKET
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
