import React, { useState, useMemo, useEffect } from "react";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { AnchorProvider, Program, BN, utils } from "@coral-xyz/anchor";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { ShieldCheck, PlusCircle, Lock, Award, AlertTriangle, CheckCircle2, RefreshCw } from "lucide-react";
import idl from "./idl/prism.json";

const PROGRAM_ID = new PublicKey(
  import.meta.env.VITE_PROGRAM_ID || (idl as any).address
);

function configPda() {
  return PublicKey.findProgramAddressSync([Buffer.from("config_v3")], PROGRAM_ID);
}

function marketPda(polymarketId: string) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("market"), Buffer.from(polymarketId)],
    PROGRAM_ID
  );
}

function vaultPda(market: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), market.toBuffer()],
    PROGRAM_ID
  );
}

function AdminMarketItem({ m, program, wallet, setMarkets }: any) {
  const { connection } = useConnection();
  const [isResolving, setIsResolving] = useState(false);

  const handleResolve = async (outcome: number) => {
    if (!program || !wallet.publicKey) return;
    setIsResolving(true);
    try {
      const marketPubkey = new PublicKey(m.pubkey);
      const account = await program.account.market.fetch(marketPubkey);
      
      const statusObj = account.status || {};
      if ("resolved" in statusObj) {
        alert("Market has already been resolved.");
        setMarkets((prev: any) => prev.map((market: any) => 
          market.pubkey === m.pubkey ? { ...market, status: "resolved", winningOutcome: Number(account.winningOutcome), raw: { ...market.raw, aiResolutionConfidence: Number(account.aiResolutionConfidence) } } : market
        ));
        return;
      }
      
      if (!("frozen" in statusObj)) {
        throw new Error("Market must be frozen before resolution.");
      }

      console.log(`Resolving ${m.pubkey} to ${outcome === 0 ? "YES" : "NO"} (${outcome})`);
      const tx = await program.methods.resolve(outcome, 100).accounts({
        oracle: wallet.publicKey,
        market: marketPubkey
      }).rpc();
      
      const refreshedAccount = await program.account.market.fetch(marketPubkey);

      setMarkets((prev: any) => prev.map((market: any) => 
        market.pubkey === m.pubkey ? { ...market, status: "resolved", winningOutcome: Number(refreshedAccount.winningOutcome), resolveTx: tx, raw: { ...market.raw, aiResolutionConfidence: Number(refreshedAccount.aiResolutionConfidence) } } : market
      ));
      
      alert(`RESOLVED ${outcome === 0 ? "YES" : "NO"}! TX: ${tx}`);
    } catch (err: any) {
      console.error(err);
      alert("Resolve Failed: " + err.message);
    } finally {
      setIsResolving(false);
    }
  };

  const handleCloseMarket = async () => {
    if (!program || !wallet.publicKey) return;
    if (!confirm(`Are you sure you want to CLOSE this market permanently?\n\nQuestion: ${m.question}\nPDA: ${m.pubkey}\nYES supply: ${m.raw?.yesSupply || 0}\nNO supply: ${m.raw?.noSupply || 0}\n\nWARNING: Ensure the vault is safe to close.`)) {
      return;
    }
    try {
      const marketPubkey = new PublicKey(m.pubkey);
      
      // Check if already closed
      const currentAccountInfo = await connection.getAccountInfo(marketPubkey);
      if (currentAccountInfo === null) {
        setMarkets((prev: any) => prev.filter((market: any) => market.pubkey !== m.pubkey));
        alert("Market is already closed.");
        return;
      }

      const [vaultPdaAddr] = vaultPda(marketPubkey);
      const account = await program.account.market.fetch(marketPubkey);
      const usdcMint = account.usdcMint;
      
      const authorityUsdcInfo = await connection.getParsedTokenAccountsByOwner(
        wallet.publicKey,
        { mint: usdcMint }
      );
      
      if (authorityUsdcInfo.value.length === 0) {
        alert("Admin has no USDC account to receive vault funds.");
        return;
      }
      
      const authorityUsdc = authorityUsdcInfo.value[0].pubkey;

      console.log("[CLOSE MARKET DEBUG]", {
        connectionEndpoint: connection.rpcEndpoint,
        wallet: wallet?.publicKey?.toBase58(),
        marketPda: marketPubkey.toBase58(),
        source: m.source,
      });

      const tx = await program.methods
        .closeMarket()
        .accounts({
          authority: wallet.publicKey,
          market: marketPubkey,
          vault: vaultPdaAddr,
          authorityUsdc,
          tokenProgram: utils.token.TOKEN_PROGRAM_ID,
        })
        .rpc();

      console.log("[CLOSE MARKET SUCCESS]", tx);
      alert(`Market Closed Successfully! TX: ${tx}`);
      
      // Verification phase
      const closedAccount = await connection.getAccountInfo(marketPubkey);
      if (closedAccount === null) {
        alert("Verified: Market PDA no longer exists on-chain.");
        setMarkets((prev: any) => prev.filter((market: any) => market.pubkey !== m.pubkey));
      } else {
        alert("ERROR: Market PDA still exists on-chain!");
      }

    } catch (err: any) {
      console.error("[CLOSE MARKET ERROR]", {
        message: err?.message,
        logs: err?.logs,
        stack: err?.stack,
      });
      alert("Close Market Failed: " + err.message);
    }
  };


  return (
    <div style={{ padding: "20px", background: "var(--bg-card)", border: "1px solid var(--border-subtle)", borderRadius: "12px", boxShadow: "var(--shadow-card)" }}>
      <h4 style={{ margin: "0 0 12px 0", color: "var(--ink-primary)", fontSize: "1.05rem" }}>{m.question}</h4>
      <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: "6px", fontSize: "0.85em", color: "var(--ink-secondary)" }}>
        <strong>Source:</strong> <span>{m.source?.toUpperCase() || "PRISM"}</span>
        <strong>Market PDA:</strong> <code>{m.pubkey}</code>
        <strong>Vault PDA:</strong> <code>{m.pubkey ? vaultPda(new PublicKey(m.pubkey))[0].toBase58() : "..."}</code>
        <strong>End Date:</strong> <span>{new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(m.endTs * 1000))}</span>
        <strong>Status:</strong> <span style={{ textTransform: "uppercase", fontWeight: "bold", color: m.status === "open" ? "var(--yes-color)" : m.status === "frozen" ? "var(--amber-color)" : "var(--no-color)" }}>{m.status || "OPEN"}</span>
        <strong>YES Supply:</strong> <span>{m.raw?.yesSupply?.toString() || "0"}</span>
        <strong>NO Supply:</strong> <span>{m.raw?.noSupply?.toString() || "0"}</span>
      </div>
      
      <div style={{ marginTop: "16px", paddingTop: "16px", borderTop: "1px solid var(--border-subtle)" }}>
        {m.status === "open" && Math.floor(Date.now() / 1000) < m.endTs && (
          <span style={{ color: "var(--yes-color)", fontWeight: "bold", fontSize: "0.88rem" }}>[ Active Trading Window ]</span>
        )}
        
        {m.status === "open" && Math.floor(Date.now() / 1000) >= m.endTs && (
          <button 
            type="button"
            onClick={async () => {
              if (!program || !wallet.publicKey) return;
              try {
                const tx = await program.methods.freeze().accounts({
                  oracle: wallet.publicKey,
                  market: new PublicKey(m.pubkey)
                }).rpc();
                alert(`FROZEN! TX: ${tx}`);
              } catch (err: any) {
                console.error(err);
                alert("Freeze Failed: " + err.message);
              }
            }}
            style={{ padding: "8px 16px", background: "var(--amber-color)", color: "#ffffff", border: "none", borderRadius: "6px", fontWeight: "bold", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "6px" }}>
            <Lock size={16} /> Freeze Market for Oracle
          </button>
        )}
        
        {m.status === "frozen" && (
          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            <strong style={{ color: "var(--ink-primary)" }}>SUBMIT ORACLE WINNER:</strong>
            <button 
              type="button"
              disabled={isResolving}
              onClick={() => handleResolve(0)}
              style={{ padding: "8px 16px", background: isResolving ? "#94a3b8" : "var(--yes-color)", color: "#ffffff", border: "none", borderRadius: "6px", fontWeight: "bold", cursor: isResolving ? "not-allowed" : "pointer" }}>
              {isResolving ? "Submitting..." : "YES WON (0)"}
            </button>
            <button 
              type="button"
              disabled={isResolving}
              onClick={() => handleResolve(1)}
              style={{ padding: "8px 16px", background: isResolving ? "#94a3b8" : "var(--no-color)", color: "#ffffff", border: "none", borderRadius: "6px", fontWeight: "bold", cursor: isResolving ? "not-allowed" : "pointer" }}>
              {isResolving ? "Submitting..." : "NO WON (1)"}
            </button>
          </div>
        )}
        
        {m.status === "resolved" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <span style={{ color: "var(--accent-cyan)", fontWeight: "bold", display: "flex", alignItems: "center", gap: "6px" }}>
              <CheckCircle2 size={16} /> Market Settled On-Chain
            </span>
            <div style={{ fontSize: "0.85em", color: "var(--ink-secondary)", display: "grid", gridTemplateColumns: "150px 1fr" }}>
              <strong>Winning Outcome:</strong> <span style={{ color: m.winningOutcome === 0 ? "var(--yes-color)" : "var(--no-color)", fontWeight: "bold" }}>{m.winningOutcome === 0 ? "YES" : "NO"}</span>
              <strong>AI Resolution Confidence:</strong> <span>{m.raw?.aiResolutionConfidence ?? 100}%</span>
              {m.resolveTx && (
                <>
                  <strong>Resolution TX:</strong> <code style={{ wordBreak: "break-all" }}>{m.resolveTx}</code>
                </>
              )}
            </div>
          </div>
        )}
        
        {m.source === "prism" && (
          <div style={{ marginTop: "15px", paddingTop: "10px", borderTop: "1px dashed #444", textAlign: "right" }}>
            <button 
              onClick={handleCloseMarket}
              style={{ padding: "6px 12px", background: "#7f1d1d", color: "#fca5a5", border: "1px solid #991b1b", borderRadius: "4px", fontSize: "0.85em", fontWeight: "bold", cursor: "pointer" }}>
              [ CLOSE MARKET ]
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function AdminPage() {
  const wallet = useWallet();
  const { connection } = useConnection();
  
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [authority, setAuthority] = useState<string | null>(null);
  
  const [question, setQuestion] = useState("");
  const [desc, setDesc] = useState("");
  const [yesLabel, setYesLabel] = useState("YES");
  const [noLabel, setNoLabel] = useState("NO");
  
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  
  const defaultEnd = new Date(Date.now() + 60 * 60 * 1000);
  const defaultTime = `${String(defaultEnd.getHours()).padStart(2, "0")}:${String(defaultEnd.getMinutes()).padStart(2, "0")}`;
  
  const [endDate, setEndDate] = useState(today);
  const [endTime, setEndTime] = useState(defaultTime);
  
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  
  const [markets, setMarkets] = useState<any[]>([]);
  const [gammaMarkets, setGammaMarkets] = useState<any[]>([]);

  const loadGammaMarkets = () => {
    fetch("https://api.002014.xyz/api/admin/gamma")
      .then(r => r.json())
      .then(data => setGammaMarkets(data))
      .catch(console.error);
  };

  const toggleGammaMarket = async (polymarketId: string, enabled: boolean) => {
    try {
      await fetch("https://api.002014.xyz/api/admin/gamma/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ polymarketId, enabled }),
      });
      setGammaMarkets(prev => prev.map(m => m.polymarketId === polymarketId ? { ...m, enabled } : m));
    } catch (e) {
      console.error(e);
      alert("Failed to toggle market");
    }
  };

  const loadMarkets = () => {
    fetch("https://api.002014.xyz/markets.json?utm_source=chatgpt.com", { cache: "no-store" })
      .then(r => r.json())
      .then(data => {
        const list = Object.values(data).filter((m: any) => m.source === "prism");
        list.sort((a: any, b: any) => b.endTs - a.endTs);
        setMarkets(list);
      })
      .catch(console.error);
  };

  useEffect(() => {
    loadMarkets();
    if (isAdmin) {
      loadGammaMarkets();
    }
  }, [isAdmin]);

  const walletPubkeyStr = wallet.publicKey?.toBase58();

  const program = useMemo(() => {
    if (!wallet.publicKey || !wallet.connected) return null;
    const provider = new AnchorProvider(
      connection,
      wallet as unknown as AnchorProvider["wallet"],
      { commitment: "confirmed" }
    );
    return new Program(idl as never, provider);
  }, [walletPubkeyStr, wallet.connected, connection]);

  useEffect(() => {
    if (!program || !wallet.publicKey || !wallet.connected) {
      setIsAdmin(null);
      return;
    }
    
    let isMounted = true;
    
    const checkAdmin = async () => {
      try {
        const [confPda] = configPda();
        const confData = await (program.account as any).config.fetch(confPda);
        if (!isMounted) return;
        
        setAuthority(confData.authority.toBase58());
        setIsAdmin(confData.authority.equals(wallet.publicKey));
      } catch (err: any) {
        if (!isMounted) return;
        console.error("Failed to fetch config", err);
        setAuthority(`Error: ${err.message}`);
        setIsAdmin(false);
      }
    };
    
    checkAdmin();
    
    return () => {
      isMounted = false;
    };
  }, [program, walletPubkeyStr, wallet.connected]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!program || !wallet.publicKey || !isAdmin) return;
    
    if (!confirm(`CREATE PRISM NATIVE MARKET\n\nQuestion: ${question}\nEnd: ${endDate} ${endTime}\nNetwork: Solana Devnet\n\nProceed?`)) {
      return;
    }
    
    setBusy(true);
    setStatus("Preparing transaction...");
    try {
      if (!question || !endDate || !endTime) {
        throw new Error("Missing required fields");
      }
      
      const selectedDate = new Date(`${endDate}T${endTime}:00`);
      const currentTime = new Date();
      
      if (selectedDate.getTime() <= currentTime.getTime()) {
        throw new Error("End time must be in the future");
      }
      
      const endTs = Math.floor(selectedDate.getTime() / 1000);
      
      const randomSuffix = Math.random().toString(36).substring(2, 8);
      const polyId = `prism:${randomSuffix}`;
      
      const [mPda] = marketPda(polyId);
      const [vPda] = vaultPda(mPda);
      const [confPda] = configPda();
      const confData = await (program.account as any).config.fetch(confPda);
      
      setStatus("Waiting for wallet signature...");
      const tx = await program.methods
        .createMarket(polyId, question, new BN(endTs), 5000)
        .accounts({
          authority: wallet.publicKey,
          config: confPda,
          usdcMint: confData.usdcMint,
          market: mPda,
          vault: vPda,
          tokenProgram: utils.token.TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
        
      setStatus(`Market created! TX: ${tx} | PDA: ${mPda.toBase58()}`);
      setQuestion("");
    } catch (err: any) {
      console.error(err);
      setStatus(`Error: ${err.message || String(err)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ maxWidth: "1000px", margin: "0 auto", padding: "30px 20px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "20px" }}>
        <ShieldCheck size={28} color="var(--accent-cyan)" />
        <h2 style={{ margin: 0, fontFamily: "var(--font-heading)", fontSize: "1.8rem", color: "var(--ink-primary)" }}>PRISM ADMIN CONTROL CENTER</h2>
      </div>

      <div style={{ margin: "0 0 30px", padding: "16px", background: "var(--bg-card)", border: "1px solid var(--border-subtle)", borderRadius: "12px", fontSize: "0.9rem", boxShadow: "var(--shadow-card)" }}>
        <p style={{ margin: "0 0 6px" }}><strong>Authority Admin Key:</strong> <code>{authority || "Loading..."}</code></p>
        <p style={{ margin: "0 0 6px" }}><strong>Connected Wallet:</strong> <code>{wallet.publicKey?.toBase58() || "None"}</code></p>
        <p style={{ margin: 0 }}>
          <strong>Admin Access:</strong>{" "}
          {isAdmin === null ? (
            "Checking status..."
          ) : isAdmin ? (
            <span style={{ color: "var(--yes-color)", fontWeight: "bold" }}>✓ AUTHORIZED ADMIN</span>
          ) : (
            <span style={{ color: "var(--no-color)", fontWeight: "bold" }}>✕ ACCESS DENIED</span>
          )}
        </p>
      </div>

      {isAdmin && (
        <form onSubmit={handleCreate} style={{ display: "flex", flexDirection: "column", gap: "14px", background: "var(--bg-card)", padding: "24px", borderRadius: "16px", border: "1px solid var(--border-subtle)", marginBottom: "40px", boxShadow: "var(--shadow-card)" }}>
          <h3 style={{ margin: "0 0 10px 0", fontFamily: "var(--font-heading)", fontSize: "1.2rem", display: "flex", alignItems: "center", gap: "8px", color: "var(--ink-primary)" }}>
            <PlusCircle size={20} color="var(--accent-cyan)" /> Create New Native Market
          </h3>
          
          <label style={{ fontSize: "0.85rem", color: "var(--ink-secondary)" }}>Market Question</label>
          <input required type="text" value={question} onChange={e => setQuestion(e.target.value)} placeholder="Will Solana reach $300 before Q4 2026?" className="amount-input" style={{ fontSize: "1rem" }} />
          
          <label style={{ fontSize: "0.85rem", color: "var(--ink-secondary)" }}>Description (Optional)</label>
          <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={3} className="amount-input" style={{ fontSize: "0.9rem" }} />
          
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div>
              <label style={{ fontSize: "0.85rem", color: "var(--ink-secondary)" }}>YES Label</label>
              <input required type="text" value={yesLabel} onChange={e => setYesLabel(e.target.value)} className="amount-input" style={{ fontSize: "1rem" }} />
            </div>
            <div>
              <label style={{ fontSize: "0.85rem", color: "var(--ink-secondary)" }}>NO Label</label>
              <input required type="text" value={noLabel} onChange={e => setNoLabel(e.target.value)} className="amount-input" style={{ fontSize: "1rem" }} />
            </div>
          </div>
          
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div>
              <label style={{ fontSize: "0.85rem", color: "var(--ink-secondary)" }}>End Date</label>
              <input required type="date" value={endDate} min={today} onChange={e => setEndDate(e.target.value)} className="amount-input" style={{ fontSize: "1rem" }} />
            </div>
            <div>
              <label style={{ fontSize: "0.85rem", color: "var(--ink-secondary)" }}>End Time</label>
              <input required type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className="amount-input" style={{ fontSize: "1rem" }} />
            </div>
          </div>
          
          <button type="submit" disabled={busy} className="submit-trade-btn buy-yes" style={{ marginTop: "10px" }}>
            {busy ? <RefreshCw className="animate-spin" size={20} /> : "CREATE MARKET ON DEVNET"}
          </button>
          
          {status && <p style={{ marginTop: "10px", fontSize: "0.88rem", color: "var(--accent-cyan)", wordBreak: "break-all" }}>{status}</p>}
        </form>
      )}

      {isAdmin && (
        <div>
          <h3 style={{ fontFamily: "var(--font-heading)", fontSize: "1.3rem", marginBottom: "16px", color: "var(--ink-primary)" }}>PRISM NATIVE MARKETS MANAGEMENT</h3>
          {markets.length === 0 ? (
            <p style={{ color: "var(--ink-muted)" }}>No native PRISM markets found.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              {markets.map((m: any) => (
                <AdminMarketItem key={m.pubkey || m.polymarketId} m={m} program={program} wallet={wallet} setMarkets={setMarkets} />
              ))}
            </div>
          )}
        </div>
      )}

      {isAdmin && (
        <div style={{ marginTop: "40px" }}>
          <h3>POLYMARKET MARKETS (ADMIN)</h3>
          <p style={{ color: "#888", fontSize: "0.9em" }}>Select which Polymarket markets are publicly visible. These markets are fetched by the indexer.</p>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {gammaMarkets.length === 0 ? <p>No cached Gamma markets found.</p> : gammaMarkets.map((m: any) => (
              <div key={m.polymarketId} style={{ padding: "10px", background: "#1a1a1a", border: "1px solid #333", borderRadius: "8px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <h5 style={{ margin: "0 0 5px 0", color: "#fff" }}>{m.question}</h5>
                  <div style={{ fontSize: "0.8em", color: "#888", display: "flex", gap: "15px" }}>
                    <span>ID: {m.polymarketId}</span>
                    <span>Active: {m.active ? "Yes" : "No"}</span>
                    <span>Closed: {m.closed ? "Yes" : "No"}</span>
                    <span>Prices: Y:{(m.yesPrice*100).toFixed(1)}% N:{(m.noPrice*100).toFixed(1)}%</span>
                  </div>
                </div>
                <div>
                  {m.enabled ? (
                    <button onClick={() => toggleGammaMarket(m.polymarketId, false)} style={{ background: "#7f1d1d", color: "#fff", border: "none", padding: "6px 12px", borderRadius: "4px", cursor: "pointer" }}>DISABLE</button>
                  ) : (
                    <button onClick={() => toggleGammaMarket(m.polymarketId, true)} style={{ background: "#065f46", color: "#fff", border: "none", padding: "6px 12px", borderRadius: "4px", cursor: "pointer" }}>ENABLE</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
