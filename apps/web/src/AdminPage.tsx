import { useState, useMemo, useEffect } from "react";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { AnchorProvider, Program, BN, utils } from "@coral-xyz/anchor";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
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

function positionPda(market: PublicKey, owner: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("position"), market.toBuffer(), owner.toBuffer()],
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

  return (
    <div style={{ padding: "15px", background: "#111", border: "1px solid #333", borderRadius: "8px" }}>
      <h4 style={{ margin: "0 0 10px 0", color: "#fff" }}>{m.question}</h4>
      <div style={{ display: "grid", gridTemplateColumns: "100px 1fr", gap: "5px", fontSize: "0.85em", color: "#888" }}>
        <strong>Source:</strong> <span>{m.source?.toUpperCase() || "PRISM"}</span>
        <strong>Market PDA:</strong> <span>{m.pubkey}</span>
        <strong>Vault PDA:</strong> <span>{m.pubkey ? vaultPda(new PublicKey(m.pubkey))[0].toBase58() : "..."}</span>
        <strong>End:</strong> <span>{new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(m.endTs * 1000))}</span>
        <strong>Status:</strong> <span>{m.status?.toUpperCase() || "OPEN"}</span>
        <strong>YES Supply:</strong> <span>{m.raw?.yesSupply?.toString() || "0"}</span>
        <strong>NO Supply:</strong> <span>{m.raw?.noSupply?.toString() || "0"}</span>
      </div>
      
      <div style={{ marginTop: "15px", paddingTop: "15px", borderTop: "1px solid #333" }}>
        {m.status === "open" && Math.floor(Date.now() / 1000) < m.endTs && (
          <span style={{ color: "#4ade80", fontWeight: "bold" }}>[ Trading Active ]</span>
        )}
        
        {m.status === "open" && Math.floor(Date.now() / 1000) >= m.endTs && (
          <button 
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
            style={{ padding: "8px 16px", background: "#f59e0b", color: "#000", border: "none", borderRadius: "4px", fontWeight: "bold", cursor: "pointer" }}>
            [ Freeze Market ]
          </button>
        )}
        
        {m.status === "frozen" && (
          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            <strong style={{ color: "#fff" }}>FINAL OUTCOME:</strong>
            <button 
              disabled={isResolving}
              onClick={() => handleResolve(0)}
              style={{ padding: "8px 16px", background: isResolving ? "#555" : "#10b981", color: "#fff", border: "none", borderRadius: "4px", fontWeight: "bold", cursor: isResolving ? "not-allowed" : "pointer" }}>
              {isResolving ? "Submitting..." : "[ YES ]"}
            </button>
            <button 
              disabled={isResolving}
              onClick={() => handleResolve(1)}
              style={{ padding: "8px 16px", background: isResolving ? "#555" : "#ef4444", color: "#fff", border: "none", borderRadius: "4px", fontWeight: "bold", cursor: isResolving ? "not-allowed" : "pointer" }}>
              {isResolving ? "Submitting..." : "[ NO ]"}
            </button>
          </div>
        )}
        
        {m.status === "resolved" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
            <span style={{ color: "#3b82f6", fontWeight: "bold" }}>
              [ Market Resolved ]
            </span>
            <div style={{ fontSize: "0.85em", color: "#888", display: "grid", gridTemplateColumns: "150px 1fr" }}>
              <strong>Winner:</strong> <span style={{ color: m.winningOutcome === 0 ? "var(--yes)" : "var(--no)" }}>{m.winningOutcome === 0 ? "YES" : "NO"}</span>
              <strong>AI Confidence:</strong> <span>{m.raw?.aiResolutionConfidence ?? 100}%</span>
              {m.resolveTx && (
                <>
                  <strong>Resolution TX:</strong> <span style={{ wordBreak: "break-all" }}>{m.resolveTx}</span>
                </>
              )}
            </div>
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

  const loadMarkets = () => {
    fetch("/markets.json", { cache: "no-store" })
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
  }, []);

  const program = useMemo(() => {
    if (!wallet.publicKey) return null;
    const provider = new AnchorProvider(
      connection,
      wallet as unknown as AnchorProvider["wallet"],
      { commitment: "confirmed" }
    );
    return new Program(idl as never, provider);
  }, [wallet.publicKey, connection]);

  useEffect(() => {
    if (!program || !wallet.publicKey) {
      setIsAdmin(null);
      return;
    }
    const checkAdmin = async () => {
      try {
        const [confPda] = configPda();
        const confData = await (program.account as any).config.fetch(confPda);
        setAuthority(confData.authority.toBase58());
        setIsAdmin(confData.authority.toBase58() === wallet.publicKey?.toBase58());
      } catch (err) {
        console.error("Failed to fetch config", err);
        setIsAdmin(false);
      }
    };
    checkAdmin();
  }, [program, wallet.publicKey]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!program || !wallet.publicKey || !isAdmin) return;
    
    if (!confirm(`CREATE PRISM MARKET\n\nQuestion: ${question}\nEnd: ${endDate} ${endTime}\nSource: PRISM\n\nThe market will be created on Solana Devnet.`)) {
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
    <div className="admin-page" style={{ padding: "40px" }}>
      <h2>PRISM ADMIN</h2>
      <div className="admin-status" style={{ margin: "20px 0", padding: "10px", background: "#222", color: "#ddd", borderRadius: "8px" }}>
        <p><strong>Admin Wallet:</strong> {authority || "Loading..."}</p>
        <p><strong>Connected Wallet:</strong> {wallet.publicKey?.toBase58() || "None"}</p>
        <p><strong>Status:</strong> {isAdmin === null ? "..." : isAdmin ? <span style={{color: "#4ade80"}}>AUTHORIZED</span> : <span style={{color: "#f87171"}}>ADMIN ACCESS DENIED</span>}</p>
      </div>

      {isAdmin && (
        <form onSubmit={handleCreate} style={{ display: "flex", flexDirection: "column", gap: "10px", maxWidth: "400px", background: "#111", padding: "20px", borderRadius: "8px", border: "1px solid #333" }}>
          <h3 style={{ margin: "0 0 10px 0" }}>CREATE PRISM MARKET</h3>
          
          <label>Market Question</label>
          <input required type="text" value={question} onChange={e => setQuestion(e.target.value)} placeholder="Will Bitcoin reach $150k before January 2027?" style={{ padding: "8px", borderRadius: "4px", border: "1px solid #444", background: "#000", color: "#fff" }} />
          
          <label>Description (Optional)</label>
          <textarea value={desc} onChange={e => setDesc(e.target.value)} style={{ padding: "8px", borderRadius: "4px", border: "1px solid #444", background: "#000", color: "#fff" }} />
          
          <label>YES outcome label</label>
          <input required type="text" value={yesLabel} onChange={e => setYesLabel(e.target.value)} style={{ padding: "8px", borderRadius: "4px", border: "1px solid #444", background: "#000", color: "#fff" }} />
          
          <label>NO outcome label</label>
          <input required type="text" value={noLabel} onChange={e => setNoLabel(e.target.value)} style={{ padding: "8px", borderRadius: "4px", border: "1px solid #444", background: "#000", color: "#fff" }} />
          
          <label>End Date</label>
          <input required type="date" value={endDate} min={today} onChange={e => setEndDate(e.target.value)} style={{ padding: "8px", borderRadius: "4px", border: "1px solid #444", background: "#000", color: "#fff", colorScheme: "dark" }} />
          
          <label>End Time</label>
          <input required type="time" value={endTime} onChange={e => setEndTime(e.target.value)} style={{ padding: "8px", borderRadius: "4px", border: "1px solid #444", background: "#000", color: "#fff", colorScheme: "dark" }} />
          
          <div style={{ marginTop: "10px", fontSize: "0.9em", color: "#888" }}>
            <p>Collateral Mint: {authority ? "(Fetched from config)" : "..."}</p>
            <p>Source: PRISM</p>
          </div>
          
          <button type="submit" disabled={busy} style={{ background: busy ? "#555" : "#fff", color: busy ? "#aaa" : "#000", padding: "10px", border: "none", borderRadius: "4px", fontWeight: "bold", cursor: busy ? "not-allowed" : "pointer", marginTop: "10px" }}>
            {busy ? "Processing..." : "Create Market"}
          </button>
          
          {status && <p style={{ marginTop: "10px", fontSize: "0.9em", color: "#ffb86c", wordBreak: "break-all" }}>{status}</p>}
        </form>
      )}

      {isAdmin && (
        <div style={{ marginTop: "40px" }}>
          <h3>ADMIN HISTORY</h3>
          {markets.length === 0 ? (
            <p style={{ color: "#888" }}>No native PRISM markets found.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              {markets.map((m: any) => (
                <AdminMarketItem key={m.pubkey || m.polymarketId} m={m} program={program} wallet={wallet} setMarkets={setMarkets} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
