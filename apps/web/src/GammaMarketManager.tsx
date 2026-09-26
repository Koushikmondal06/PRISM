import React, { useState, useEffect } from "react";
import { RefreshCw, PlayCircle, StopCircle, Info, Tag, Clock, Calendar, CheckCircle } from "lucide-react";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

export default function GammaMarketManager({ gammaMarkets, refreshGamma }: { gammaMarkets: any[], refreshGamma: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [selectedMarket, setSelectedMarket] = useState<any | null>(null);
  
  const [adminConfig, setAdminConfig] = useState<any>({});
  const [globalDateStr, setGlobalDateStr] = useState("");
  const [globalTimeStr, setGlobalTimeStr] = useState("");

  const loadConfig = () => {
    fetch(`${API_URL}/api/admin/config`, {
      headers: { "Authorization": "Bearer prism-admin-secret" }
    })
      .then(r => r.json())
      .then(data => {
        setAdminConfig(data);
        if (data.globalPrismEndTs) {
          const d = new Date(data.globalPrismEndTs * 1000);
          setGlobalDateStr(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
          setGlobalTimeStr(`${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`);
        }
      })
      .catch(console.error);
  };

  useEffect(() => {
    loadConfig();
  }, []);

  const saveConfig = async () => {
    if (!globalDateStr || !globalTimeStr) return alert("Select date and time first");
    const ts = Math.floor(new Date(`${globalDateStr}T${globalTimeStr}:00`).getTime() / 1000);
    
    setBusy("config");
    try {
      const res = await fetch(`${API_URL}/api/admin/config/prism-end-date`, {
        method: "PUT",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": "Bearer prism-admin-secret"
        },
        body: JSON.stringify({ prismEndTs: ts })
      });
      if (!res.ok) throw new Error("Failed to save config");
      alert("Config saved successfully!");
      loadConfig();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setBusy(null);
    }
  };
  
  const fetchGammaManual = async () => {
    setBusy("fetch");
    try {
      const res = await fetch(`${API_URL}/api/admin/gamma/fetch`, { 
        method: "POST",
        headers: { "Authorization": "Bearer prism-admin-secret" }
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Fetch failed");
      alert(`Gamma fetched successfully in ${data.duration}ms. ${data.fetched} markets fetched.`);
      refreshGamma();
      loadConfig();
    } catch (e: any) {
      alert(`Gamma fetch failed. Existing cached markets remain available.\n\nError: ${e.message}`);
    } finally {
      setBusy(null);
    }
  };

  const activateMarket = async (market: any) => {
    if (!adminConfig.globalPrismEndTs) {
      return alert("Please configure the Global PRISM End Date first.");
    }
    const endTsStr = new Date(adminConfig.globalPrismEndTs * 1000).toLocaleString();
    if (!confirm(`Activate PRISM Market?\n\nQuestion: ${market.question}\nPolymarket ID: ${market.polymarketId}\n\nGlobal PRISM End Date: ${endTsStr}\n\nInitial PRISM pricing:\nYES 50%\nNO 50%\n\n[ CANCEL ]        [ CREATE PRISM MARKET ]`)) {
      return;
    }
    
    setBusy(market.polymarketId);
    try {
      const res = await fetch(`${API_URL}/api/admin/markets/${market.polymarketId}/activate`, {
        method: "POST",
        headers: { "Authorization": "Bearer prism-admin-secret" }
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
      const res = await fetch(`${API_URL}/api/admin/markets/${market.prismMarketPubkey}/stop`, {
        method: "POST",
        headers: { "Authorization": "Bearer prism-admin-secret" }
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

  const totalMarkets = gammaMarkets.length;
  const eligibleCount = gammaMarkets.filter(m => m.validation?.eligible).length;
  const filteredCount = totalMarkets - eligibleCount;

  return (
    <div style={{ marginTop: "40px", display: "flex", flexDirection: "column", gap: "24px" }}>
      
      {/* Config Panel */}
      <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-subtle)", borderRadius: "12px", padding: "20px" }}>
        <h3 style={{ margin: "0 0 12px 0", color: "var(--ink-primary)", display: "flex", alignItems: "center", gap: "8px" }}><Calendar size={18} /> PRISM MARKET CONFIGURATION</h3>
        <p style={{ color: "var(--ink-muted)", fontSize: "0.85rem", margin: "0 0 16px 0" }}>All newly activated PRISM markets will use this date.</p>
        
        <div style={{ display: "flex", gap: "12px", alignItems: "flex-end" }}>
          <div>
            <label style={{ display: "block", fontSize: "0.8rem", color: "var(--ink-secondary)", marginBottom: "4px" }}>Global PRISM End Date</label>
            <input type="date" value={globalDateStr} onChange={e => setGlobalDateStr(e.target.value)} style={{ padding: "8px", background: "var(--bg-subtle)", border: "1px solid var(--border-subtle)", color: "var(--ink-primary)", borderRadius: "6px" }} />
          </div>
          <div>
            <label style={{ display: "block", fontSize: "0.8rem", color: "var(--ink-secondary)", marginBottom: "4px" }}>Time</label>
            <input type="time" value={globalTimeStr} onChange={e => setGlobalTimeStr(e.target.value)} style={{ padding: "8px", background: "var(--bg-subtle)", border: "1px solid var(--border-subtle)", color: "var(--ink-primary)", borderRadius: "6px" }} />
          </div>
          <button onClick={saveConfig} disabled={busy === "config"} style={{ background: "var(--accent-cyan)", color: "#fff", border: "none", padding: "8px 16px", borderRadius: "6px", cursor: busy === "config" ? "not-allowed" : "pointer", fontWeight: "bold" }}>
            {busy === "config" ? "SAVING..." : "SAVE END DATE"}
          </button>
        </div>
      </div>

      {/* Fetch Panel */}
      <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-subtle)", borderRadius: "12px", padding: "20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h3 style={{ margin: "0 0 12px 0", color: "var(--ink-primary)", display: "flex", alignItems: "center", gap: "8px" }}><RefreshCw size={18} /> GAMMA DATA</h3>
            <div style={{ fontSize: "0.85rem", color: "var(--ink-muted)", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
              <div><strong>Last fetched:</strong> {adminConfig.lastGammaFetchTs ? new Date(adminConfig.lastGammaFetchTs).toLocaleString() : "Never"}</div>
              <div><strong>Total Gamma Markets:</strong> {totalMarkets}</div>
              <div><strong>Eligible for PRISM:</strong> <span style={{ color: "var(--yes-color)", fontWeight: "bold" }}>{eligibleCount}</span></div>
              <div><strong>Filtered:</strong> <span style={{ color: "var(--amber-color)", fontWeight: "bold" }}>{filteredCount}</span></div>
            </div>
          </div>
          <div>
            <button 
              onClick={fetchGammaManual} 
              disabled={busy === "fetch"}
              style={{ background: "var(--bg-subtle)", color: "var(--ink-primary)", border: "1px solid var(--border-subtle)", padding: "10px 16px", borderRadius: "6px", cursor: busy === "fetch" ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: "8px", fontWeight: "bold" }}
            >
              {busy === "fetch" ? <RefreshCw size={16} className="animate-spin" /> : <PlayCircle size={16} />}
              {busy === "fetch" ? "FETCHING GAMMA..." : "FETCH GAMMA MARKETS"}
            </button>
          </div>
        </div>
      </div>

      {/* Market List */}
      <div>
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
                      <div><strong>Gamma End:</strong> {new Date((m.raw?.gammaEndTs || m.endTs) * 1000).toLocaleString()}</div>
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
                      {m.prismStatus !== "imported" && (
                        <div><strong>PRISM End:</strong> {new Date((m.raw?.prismEndTs || m.endTs) * 1000).toLocaleString()}</div>
                      )}
                      {m.prismMarketPubkey && (
                        <div><strong>Market PDA:</strong> <code>{m.prismMarketPubkey}</code></div>
                      )}
                    </div>
                    
                    <div style={{ marginTop: "16px", display: "flex", gap: "10px" }}>
                      {(!m.prismStatus || m.prismStatus === "imported") && (
                        <>
                          <button 
                            onClick={() => activateMarket(m)} 
                            disabled={busy === m.polymarketId || m.validation?.eligible === false}
                            style={{ background: m.validation?.eligible === false ? "var(--bg-subtle)" : "var(--yes-color)", color: m.validation?.eligible === false ? "var(--ink-muted)" : "#fff", border: "none", padding: "8px 16px", borderRadius: "6px", cursor: (busy || m.validation?.eligible === false) ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: "6px", fontWeight: "bold" }}
                          >
                            {busy === m.polymarketId ? <RefreshCw size={16} className="animate-spin" /> : <PlayCircle size={16} />}
                            {m.validation?.eligible === false ? "NOT ELIGIBLE" : "MAKE LIVE"}
                          </button>
                          {m.validation?.eligible === false && (
                            <span style={{ color: "var(--amber-color)", fontSize: "0.8rem", alignSelf: "center", fontWeight: "bold" }}>
                              REASON: {m.validation.rejectionReasons.join(", ")}
                            </span>
                          )}
                        </>
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
    </div>
  );
}
