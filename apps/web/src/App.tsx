import { useCallback, useEffect, useMemo, useState } from "react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { BN, Program, AnchorProvider } from "@coral-xyz/anchor";
import {
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  getAccount,
} from "@solana/spl-token";
import { type StoredMarket, calculateLmsrCost, calculateLmsrPrices } from "@prism/shared";
import idl from "./idl/prism.json";
import AdminPage from "./AdminPage";
import TransactionHistoryPage from "./TransactionHistoryPage";
import MarketActivity from "./MarketActivity";

const PROGRAM_ID = new PublicKey(
  import.meta.env.VITE_PROGRAM_ID || idl.address
);
const USDC_MINT = new PublicKey(
  import.meta.env.VITE_USDC_MINT || "Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr"
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

function positionPda(market: PublicKey, user: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("position"), market.toBuffer(), user.toBuffer()],
    PROGRAM_ID
  );
}

function formatUsd(micro: number) {
  return (micro / 1_000_000).toFixed(2);
}

import React, { Component, ErrorInfo, ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: "20px", color: "red", background: "#fee" }}>
          <h2>Something went wrong in this section.</h2>
          <details style={{ whiteSpace: "pre-wrap" }}>
            {this.state.error && this.state.error.toString()}
          </details>
        </div>
      );
    }
    return this.props.children;
  }
}



export default function App() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [markets, setMarkets] = useState<StoredMarket[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [sourceFilter, setSourceFilter] = useState<"ALL" | "POLYMARKET" | "PRISM">("ALL");
  const [currentRoute, setCurrentRoute] = useState(window.location.hash);
  const [shares, setShares] = useState("1");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [position, setPosition] = useState<{ yes: number; no: number } | null>(null);
  const [tradeOutcome, setTradeOutcome] = useState<0 | 1>(0);
  const [onChainState, setOnChainState] = useState<{
    yesSupply: number;
    noSupply: number;
    lmsrB: number;
    aiResolutionConfidence: number;
    winningOutcome: number | null;
    status: string;
    usdcMint?: string;
  } | null>(null);
  
  const [refreshCounter, setRefreshCounter] = useState(0);

  useEffect(() => {
    const handleHash = () => setCurrentRoute(window.location.hash);
    window.addEventListener("hashchange", handleHash);
    return () => window.removeEventListener("hashchange", handleHash);
  }, []);

  const loadMarkets = useCallback(async () => {
    try {
      console.log("=== MARKET LOAD START ===");
      const response = await fetch(`/markets.json?t=${Date.now()}`, { cache: "no-store" });
      console.log("MARKET RESPONSE:", response.status, response.url);
      const data = await response.json();
      const safeDataList = Array.isArray(data) ? data : Object.values(data || {});
      console.log("MARKET DATA COUNT:", safeDataList.length);
      console.log(
        "LIFECYCLE MARKET:",
        safeDataList.find(
          (m: any) =>
            m.id === "lifecycle-test-001" ||
            m.polymarketId === "lifecycle-test-001"
        )
      );
      if (!data) {
        setMarkets([]);
        return;
      }
      const dataObj: Record<string, StoredMarket> = Array.isArray(data)
        ? Object.fromEntries(
            data.map((m: any) => [
              m.polymarket_id || m.polymarketId,
              {
                polymarketId: m.polymarket_id || m.polymarketId,
                question: m.question,
                endTs: Number(m.end_ts || m.endTs),
                priceYesBps: Number(m.price_yes_bps || m.priceYesBps),
                lmsr_b: m.lmsr_b || 1_000_000,
                closed: Boolean(m.closed),
                winningOutcome: m.winning_outcome ?? m.winningOutcome ?? null,
                status: m.status || (m.closed ? "resolved" : "open"),
                createdAt: m.created_at || m.createdAt,
                pubkey: m.pubkey,
                aiScore: m.ai_score ?? m.aiScore,
                aiReason: m.ai_reason ?? m.aiReason,
                aiTitle: m.ai_title ?? m.aiTitle,
                aiTags: m.ai_tags ?? m.aiTags,
                aiSummary: m.ai_summary ?? m.aiSummary,
                source: m.source || "polymarket",
                raw: m.raw || m,
              },
            ])
          )
        : data;
      const list = Object.values(dataObj).sort((a, b) => b.endTs - a.endTs);
      setMarkets(list);
      if (list[0]) setSelected((prev) => prev || (list[0].source === "prism" && list[0].pubkey ? list[0].pubkey : list[0].polymarketId));
    } catch {
      setMarkets([]);
    }
  }, []);

  useEffect(() => {
    loadMarkets();
    const t = setInterval(loadMarkets, 15_000);
    return () => clearInterval(t);
  }, [loadMarkets]);

  const active = useMemo(
    () => markets.find((m) => (m.source === "prism" && m.pubkey ? m.pubkey : m.polymarketId) === selected) ?? null,
    [markets, selected]
  );

  const program = useMemo(() => {
    if (!wallet.publicKey || !wallet.signTransaction) return null;
    const provider = new AnchorProvider(
      connection,
      wallet as unknown as AnchorProvider["wallet"],
      { commitment: "confirmed" }
    );
    return new Program(idl as never, provider);
  }, [connection, wallet]);

  const refreshMarketData = useCallback(async () => {
    if (!active) {
      setOnChainState(null);
      return;
    }
    try {
      const marketKey = active.pubkey ? new PublicKey(active.pubkey) : marketPda(active.polymarketId)[0];
      const accountInfo = await connection.getAccountInfo(marketKey);
      if (accountInfo && program) {
        const decoded: any = await (program.account as any).market.fetch(marketKey);
        setOnChainState({
          yesSupply: Number(decoded.yesSupply || 0),
          noSupply: Number(decoded.noSupply || 0),
          lmsrB: Number(decoded.lmsrB || 1_000_000),
          aiResolutionConfidence: Number(decoded.aiResolutionConfidence ?? 100),
          winningOutcome: decoded.winningOutcome !== null && decoded.winningOutcome !== undefined ? Number(decoded.winningOutcome) : null,
          status: Object.keys(decoded.status || {})[0]?.toLowerCase() || active.status,
          usdcMint: decoded.usdcMint?.toString(),
        });
      } else {
        setOnChainState({
          yesSupply: 0,
          noSupply: 0,
          lmsrB: active.lmsr_b || 1_000_000,
          aiResolutionConfidence: 100,
          winningOutcome: active.winningOutcome,
          status: active.status,
          usdcMint: USDC_MINT.toBase58(),
        });
      }
    } catch {
      setOnChainState(null);
    }
  }, [active, connection, program]);

  const refreshPosition = useCallback(async () => {
    if (!wallet.publicKey || !active) {
      setPosition(null);
      return;
    }
    try {
      const marketKey = active.pubkey ? new PublicKey(active.pubkey) : marketPda(active.polymarketId)[0];
      const [posKey] = positionPda(marketKey, wallet.publicKey);
      const info = await connection.getAccountInfo(posKey);
      if (!info || !program) {
        setPosition({ yes: 0, no: 0 });
        return;
      }
      const decoded = await (program.account as any).position.fetch(posKey);
      setPosition({
        yes: Number(decoded.yesShares),
        no: Number(decoded.noShares),
      });
    } catch {
      setPosition({ yes: 0, no: 0 });
    }
  }, [wallet.publicKey, active, connection, program]);

  useEffect(() => {
    refreshPosition();
    refreshMarketData();
  }, [refreshPosition, refreshMarketData]);

  async function trade(side: "buy" | "sell", outcome: 0 | 1) {
    if (!program || !wallet.publicKey || !active) {
      setMsg("Connect wallet and select a market");
      return;
    }
    const shareAmount = Math.round(Number(shares) * 1_000_000);
    if (!Number.isFinite(shareAmount) || shareAmount <= 0) {
      setMsg("Enter a valid share amount");
      return;
    }

    setBusy(true);
    setMsg(null);
    try {
      const marketKey = active.pubkey ? new PublicKey(active.pubkey) : marketPda(active.polymarketId)[0];
      const [vaultKey] = vaultPda(marketKey);
      const [positionKey] = positionPda(marketKey, wallet.publicKey);
      const marketUsdcMint = onChainState?.usdcMint ? new PublicKey(onChainState.usdcMint) : USDC_MINT;
      const userUsdc = getAssociatedTokenAddressSync(marketUsdcMint, wallet.publicKey);

      const rawCost = side === "buy" 
        ? calculateLmsrCost(onChainState?.lmsrB || 1_000_000, onChainState?.yesSupply || 0, onChainState?.noSupply || 0, shareAmount, outcome, "buy")
        : calculateLmsrCost(onChainState?.lmsrB || 1_000_000, onChainState?.yesSupply || 0, onChainState?.noSupply || 0, shareAmount, outcome, "sell");

      console.log("BUY DEBUG", {
        shareInput: shares,
        shareAmountRaw: shareAmount,
        displayedCost: rawCost / 1_000_000,
        rawCost,
        usdcMint: marketUsdcMint.toBase58(),
      });

      const method =
        side === "buy"
          ? program.methods.buy(outcome, new BN(shareAmount))
          : program.methods.sell(outcome, new BN(shareAmount));

      console.log("=== BUY DEBUG ===");
      console.log({
        wallet: wallet.publicKey?.toBase58(),
        market: marketKey?.toBase58(),
        usdcMint: marketUsdcMint.toBase58(),
        userUsdc: userUsdc?.toBase58(),
        amountRaw: rawCost,
        amountHuman: rawCost / 1_000_000,
      });

      console.log("BUY ACCOUNTS", {
        user: wallet.publicKey?.toBase58(),
        userUsdc: userUsdc?.toBase58(),
        vault: vaultKey?.toBase58(),
        market: marketKey?.toBase58(),
        tokenProgram: TOKEN_PROGRAM_ID.toBase58(),
      });

      let builder = method.accounts({
        user: wallet.publicKey,
        market: marketKey,
        position: positionKey,
        vault: vaultKey,
        userUsdc,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      });

      // Check if user's USDC ATA exists; if not, prepend creation instruction
      let ataInfo = null;
      try {
        ataInfo = await connection.getAccountInfo(userUsdc);
      } catch {
        // network fetch error, continue
      }
      if (!ataInfo) {
        const createAtaIx = createAssociatedTokenAccountInstruction(
          wallet.publicKey,
          userUsdc,
          wallet.publicKey,
          marketUsdcMint
        );
        builder = builder.preInstructions([createAtaIx]);
      }

      await builder.rpc();

      setMsg(`${side.toUpperCase()} ${outcome === 0 ? "YES" : "NO"} confirmed!`);
      await refreshPosition();
      await refreshMarketData();
      setRefreshCounter(prev => prev + 1);
    } catch (err: any) {
      console.error("Trade error:", err);
      let errorMsg = err?.message || String(err);
      if (err?.logs || (typeof err?.getLogs === "function")) {
        const logs = err?.logs || (err?.getLogs ? err.getLogs() : []);
        console.error("Transaction simulation logs:", logs);
        if (logs && logs.length > 0) {
          errorMsg += ` (Logs: ${logs.join(" | ")})`;
        }
      }
      setMsg(errorMsg);
    } finally {
      setBusy(false);
    }
  }

  async function redeem() {
    if (!program || !wallet.publicKey || !active) return;
    setBusy(true);
    setMsg(null);
    try {
      const marketKey = active.pubkey ? new PublicKey(active.pubkey) : marketPda(active.polymarketId)[0];
      const [vaultKey] = vaultPda(marketKey);
      const [positionKey] = positionPda(marketKey, wallet.publicKey);
      const marketUsdcMint = onChainState?.usdcMint ? new PublicKey(onChainState.usdcMint) : USDC_MINT;
      const userUsdc = getAssociatedTokenAddressSync(marketUsdcMint, wallet.publicKey);

      let builder = program.methods
        .redeem()
        .accounts({
          user: wallet.publicKey,
          market: marketKey,
          position: positionKey,
          vault: vaultKey,
          userUsdc,
          tokenProgram: TOKEN_PROGRAM_ID,
        });

      let ataInfo = null;
      try {
        ataInfo = await connection.getAccountInfo(userUsdc);
      } catch {
        // network fetch error, continue
      }
      if (!ataInfo) {
        const createAtaIx = createAssociatedTokenAccountInstruction(
          wallet.publicKey,
          userUsdc,
          wallet.publicKey,
          marketUsdcMint
        );
        builder = builder.preInstructions([createAtaIx]);
      }

      const txSig = await builder.rpc();

      setMsg(`Redeemed winning shares for USDC!|${winningShares.toFixed(2)}|${txSig}`);
      await refreshPosition();
      await refreshMarketData();
      setRefreshCounter(prev => prev + 1);
    } catch (err: any) {
      console.error("Redeem error:", err);
      let errorMsg = err?.message || String(err);
      if (err?.logs || (typeof err?.getLogs === "function")) {
        const logs = err?.logs || (err?.getLogs ? err.getLogs() : []);
        console.error("Transaction simulation logs:", logs);
        if (logs && logs.length > 0) {
          errorMsg += ` (Logs: ${logs.join(" | ")})`;
        }
      }
      setMsg(errorMsg);
    } finally {
      setBusy(false);
    }
  }

  // Odds and probabilities
  let yesPctNum = active ? (active.yesPrice ? active.yesPrice * 100 : active.priceYesBps / 100) : 50;
  let noPctNum = active ? (active.noPrice ? active.noPrice * 100 : 100 - (active.priceYesBps / 100)) : 50;

  if (onChainState && active?.source === "prism") {
    const prices = calculateLmsrPrices(onChainState.lmsrB, onChainState.yesSupply, onChainState.noSupply);
    yesPctNum = prices.yesPrice * 100;
    noPctNum = prices.noPrice * 100;
  }

  const yesPct = yesPctNum.toFixed(2);
  const noPct = noPctNum.toFixed(2);

  const currentStatus = onChainState?.status || active?.status || "open";

  // LMSR Cost estimate calculation
  const shareNum = Math.round((Number(shares) || 1) * 1_000_000);
  const estimatedBuyYesCost = onChainState
    ? calculateLmsrCost(onChainState.lmsrB, onChainState.yesSupply, onChainState.noSupply, shareNum, 0, "buy")
    : shareNum;
  const estimatedBuyNoCost = onChainState
    ? calculateLmsrCost(onChainState.lmsrB, onChainState.yesSupply, onChainState.noSupply, shareNum, 1, "buy")
    : shareNum;

  // Polymarket-style payout calculation
  const selectedCostRaw = tradeOutcome === 0 ? estimatedBuyYesCost : estimatedBuyNoCost;
  const selectedCost = selectedCostRaw / 1_000_000;
  const expectedShares = (Number(shares) || 1);
  const toWin = expectedShares;
  const avgPrice = expectedShares > 0 ? selectedCost / expectedShares : 0;
  const potentialProfit = toWin - selectedCost;
  
  if (onChainState) {
    console.log("[LMSR DEBUG]", {
      yesSupply: onChainState.yesSupply,
      noSupply: onChainState.noSupply,
      lmsrB: onChainState.lmsrB,
      amount: shareNum,
      selectedOutcome: tradeOutcome,
      calculatedCost: selectedCostRaw,
      calculatedCostUsdc: selectedCost
    });
  }

  useEffect(() => {
    if (active) {
      console.log("=== CALCULATION LOG ===");
      console.log("selected outcome", tradeOutcome === 0 ? "YES" : "NO");
      console.log("requested shares", expectedShares);
      console.log("calculated trade cost", selectedCost);
      console.log("average price", avgPrice);
      console.log("expected payout", toWin);
      console.log("potential profit", potentialProfit);
      console.log("current yes supply", onChainState?.yesSupply ?? 0);
      console.log("current no supply", onChainState?.noSupply ?? 0);
      console.log("LMSR b", onChainState?.lmsrB ?? 0);
      const marketKey = active.pubkey ? new PublicKey(active.pubkey) : marketPda(active.polymarketId)[0];
      console.log("market PDA", marketKey.toBase58());
      if (wallet.publicKey) {
        console.log("position PDA", positionPda(marketKey, wallet.publicKey)[0].toBase58());
      }
    }
  }, [active, tradeOutcome, expectedShares, selectedCost, avgPrice, toWin, potentialProfit, onChainState, wallet.publicKey]);

  // Post-trade price preview
  let yesPriceAfterYesTrade = yesPctNum;
  let noPriceAfterNoTrade = noPctNum;

  if (onChainState && active?.source === "prism") {
    const postYesTradePrices = calculateLmsrPrices(onChainState.lmsrB, onChainState.yesSupply + shareNum, onChainState.noSupply);
    yesPriceAfterYesTrade = postYesTradePrices.yesPrice * 100;

    const postNoTradePrices = calculateLmsrPrices(onChainState.lmsrB, onChainState.yesSupply, onChainState.noSupply + shareNum);
    noPriceAfterNoTrade = postNoTradePrices.noPrice * 100;
  }

  const winningShares = currentStatus === "resolved"
    ? onChainState?.winningOutcome === 0
      ? (position?.yes || 0) / 1_000_000
      : onChainState?.winningOutcome === 1
      ? (position?.no || 0) / 1_000_000
      : 0
    : 0;

  const losingShares = currentStatus === "resolved"
    ? onChainState?.winningOutcome === 0
      ? (position?.no || 0) / 1_000_000
      : onChainState?.winningOutcome === 1
      ? (position?.yes || 0) / 1_000_000
      : 0
    : 0;

  const userYesShares = (position?.yes || 0) / 1_000_000;
  const userNoShares = (position?.no || 0) / 1_000_000;
  
  const estimatedYesValue = userYesShares * yesPctNum / 100;
  const estimatedNoValue = userNoShares * noPctNum / 100;

  const isRedeemable = currentStatus === "resolved" && (onChainState?.aiResolutionConfidence ?? 100) >= 60 && winningShares > 0;
  
  const handleRedeem = async () => {
    if (!confirm(`You are redeeming:\n\n${winningShares.toFixed(2)} winning shares\n\nExpected payout:\n${winningShares.toFixed(2)} USDC\n\nProceed to sign?`)) {
      return;
    }
    await redeem();
  };

  console.log(
    "MARKETS BEFORE RENDER:",
    markets
  );
  console.log(
    "LIFECYCLE BEFORE RENDER:",
    markets.find(
      m =>
        m.polymarketId === "lifecycle-test-001" || m.polymarketId === "prism:lifecycle-test-001"
    )
  );

  const visibleMarkets = useMemo(() => {
    return markets.filter(m => {
      if (sourceFilter === "ALL") return true;
      if (sourceFilter === "POLYMARKET") return m.source === "polymarket";
      if (sourceFilter === "PRISM") return m.source === "prism";
      return true;
    });
  }, [markets, sourceFilter]);

  if (currentRoute.startsWith("#/admin")) {
    return (
      <div className="page">
        <header className="top">
          <div className="brand">
            <span className="mark">PRISM</span>
            <span className="tag">Polymarket → Solana (LMSR + AI QA)</span>
          </div>
          <div>
            <a href="#/" style={{marginRight: "20px", color: "#ccc"}}>← Back to Public App</a>
            <WalletMultiButton />
          </div>
        </header>
        <AdminPage />
      </div>
    );
  }

  if (currentRoute.startsWith("#/transactions")) {
    return (
      <div className="page">
        <header className="top">
          <div className="brand">
            <span className="mark">PRISM</span>
            <span className="tag">Polymarket → Solana (LMSR + AI QA)</span>
          </div>
          <div>
            <a href="#/" style={{marginRight: "20px", color: "#ccc"}}>← Back to Public App</a>
            <WalletMultiButton />
          </div>
        </header>
        <TransactionHistoryPage refreshTrigger={refreshCounter} />
      </div>
    );
  }

  return (
    <div className="page">
      <header className="top">
        <div className="brand">
          <span className="mark">PRISM</span>
          <span className="tag">Polymarket → Solana (LMSR + AI QA)</span>
        </div>
        <div>
          <a href="#/transactions" style={{marginRight: "20px", color: "#ccc"}}>Transactions</a>
          <a href="#/admin" style={{marginRight: "20px", color: "#ccc"}}>Admin Panel</a>
          <WalletMultiButton />
        </div>
      </header>

      <main className="layout">
        <section className="rail">
          <div className="rail-head">
            <h2>Markets</h2>
            <button type="button" className="ghost" onClick={loadMarkets}>
              Refresh
            </button>
          </div>
          
          <div style={{ padding: "0 20px 10px", display: "flex", gap: "10px", fontSize: "0.8em" }}>
            <button style={{ background: sourceFilter === "ALL" ? "#333" : "transparent", color: sourceFilter === "ALL" ? "#fff" : "#888", border: "1px solid #444", padding: "4px 8px", borderRadius: "4px" }} onClick={() => setSourceFilter("ALL")}>ALL</button>
            <button style={{ background: sourceFilter === "POLYMARKET" ? "#333" : "transparent", color: sourceFilter === "POLYMARKET" ? "#fff" : "#888", border: "1px solid #444", padding: "4px 8px", borderRadius: "4px" }} onClick={() => setSourceFilter("POLYMARKET")}>POLYMARKET</button>
            <button style={{ background: sourceFilter === "PRISM" ? "#333" : "transparent", color: sourceFilter === "PRISM" ? "#fff" : "#888", border: "1px solid #444", padding: "4px 8px", borderRadius: "4px" }} onClick={() => setSourceFilter("PRISM")}>PRISM</button>
          </div>

          {visibleMarkets.length === 0 ? (
            <p className="empty">
              No active markets loaded for this filter.
            </p>
          ) : (
            <ul className="market-list">
              {visibleMarkets.map((m) => {
                const uniqueId = m.source === "prism" && m.pubkey ? m.pubkey : m.polymarketId;
                return (
                <li key={uniqueId}>
                  <button
                    type="button"
                    className={uniqueId === selected ? "market active" : "market"}
                    onClick={() => setSelected(uniqueId)}
                  >
                    <div style={{ fontSize: "0.7em", opacity: 0.6, marginBottom: "4px", textAlign: "left" }}>
                      [ {m.source?.toUpperCase() || "POLYMARKET"} ]
                    </div>
                    <span className="q">{m.aiTitle || m.question}</span>
                    <span className={`st ${m.status}`}>{m.status === "resolved" ? "RESOLVED" : m.status}</span>
                  </button>
                </li>
              )})}
            </ul>
          )}
        </section>

        <section className="stage">
          <ErrorBoundary>
          {!active ? (
            <div className="empty-stage" style={{ padding: "40px", textAlign: "center", color: "#888" }}>
              <h2>Market not found</h2>
              <p>Please select a market from the list.</p>
            </div>
          ) : (
            <>
              <div className="eyebrow-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <p className="eyebrow">
                  SOURCE: {active.source?.toUpperCase() || "POLYMARKET"} · Solana Anchor Contract · LMSR Pricing
                </p>
                {active.aiScore !== undefined && active.aiScore !== null && (
                  <span className="ai-badge" title={active.aiReason || "AI Curation Score"}>
                    🤖 AI Score: {active.aiScore}/100
                  </span>
                )}
              </div>
              
              <div style={{ marginBottom: "20px", padding: "10px", background: "#111", borderRadius: "8px", fontSize: "0.85em", color: "#888", border: "1px solid #222" }}>
                {active.source === "prism" ? (
                  <>
                    <p><strong>Market PDA:</strong> {active.pubkey}</p>
                    <p><strong>Creator:</strong> PRISM Admin</p>
                    <p><strong>Config PDA:</strong> {configPda()[0].toBase58()}</p>
                    <p><strong>Vault:</strong> {active.pubkey ? vaultPda(new PublicKey(active.pubkey))[0].toBase58() : "..."}</p>
                    <p><strong>Collateral Mint:</strong> {USDC_MINT.toBase58()}</p>
                  </>
                ) : (
                  <>
                    <p><strong>Polymarket ID:</strong> {active.polymarketId}</p>
                    {active.raw?.slug && <p><strong>Slug:</strong> {active.raw.slug}</p>}
                  </>
                )}
              </div>

              <h1>{active.aiTitle || active.question}</h1>

              {active.aiTags && active.aiTags.length > 0 && (
                <div className="ai-tags">
                  {active.aiTags.map((tag, idx) => (
                    <span key={idx} className="ai-tag">#{tag}</span>
                  ))}
                </div>
              )}

              {active.aiSummary && (
                <div className="ai-summary-box">
                  <h4>AI Market Summary</h4>
                  <p>{active.aiSummary}</p>
                </div>
              )}

              <p className="meta">
                Ends {new Date(active.endTs * 1000).toLocaleString()} · Status:{" "}
                <strong style={{ textTransform: "uppercase" }}>{currentStatus}</strong>
              </p>

              {/* LMSR Probability Bar */}
              <div className="prob-container">
                <div className="prob-labels">
                  <span className="prob-yes">{currentStatus === "resolved" ? "FINAL OUTCOME" : "CURRENT PRICE"} YES {yesPct}%</span>
                  <span className="prob-no">{currentStatus === "resolved" ? "FINAL OUTCOME" : "CURRENT PRICE"} NO {noPct}%</span>
                </div>
                <div className="prob-bar">
                  <div className="prob-fill-yes" style={{ width: `${yesPctNum}%` }} />
                </div>
              </div>

              {/* Cost estimates removed from global view, they will be inside the trade panel */}

              {/* Resolution QA Confidence Card - Removed in favor of settlement panel */}

              {/* Trade Panel */}
              {currentStatus === "open" && (
                <div className="trade-card" style={{ background: "#1a1a2e", padding: "20px", borderRadius: "12px", border: "1px solid #333", marginTop: "20px" }}>
                  <div style={{ display: "flex", gap: "10px", marginBottom: "20px" }}>
                    <button 
                      type="button" 
                      style={{ flex: 1, padding: "12px", background: tradeOutcome === 0 ? "var(--yes)" : "transparent", color: tradeOutcome === 0 ? "#000" : "var(--yes)", border: "1px solid var(--yes)", borderRadius: "8px", fontWeight: "bold" }}
                      onClick={() => setTradeOutcome(0)}
                    >
                      YES {yesPct}%
                    </button>
                    <button 
                      type="button" 
                      style={{ flex: 1, padding: "12px", background: tradeOutcome === 1 ? "var(--no)" : "transparent", color: tradeOutcome === 1 ? "#000" : "var(--no)", border: "1px solid var(--no)", borderRadius: "8px", fontWeight: "bold" }}
                      onClick={() => setTradeOutcome(1)}
                    >
                      NO {noPct}%
                    </button>
                  </div>
                  
                  <div style={{ marginBottom: "20px" }}>
                    <label style={{ display: "block", color: "#888", marginBottom: "8px" }}>Amount</label>
                    <input
                      style={{ width: "100%", padding: "12px", background: "#111", border: "1px solid #333", borderRadius: "8px", color: "#fff", fontSize: "1.1em", boxSizing: "border-box" }}
                      value={shares}
                      onChange={(e) => setShares(e.target.value)}
                      inputMode="decimal"
                      placeholder="1"
                    />
                  </div>

                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "10px", fontSize: "0.95em" }}>
                    <span style={{ color: "#888" }}>Amount / Cost</span>
                    <strong>${selectedCost.toFixed(2)} USDC</strong>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "10px", fontSize: "0.95em" }}>
                    <span style={{ color: "#888" }}>To win</span>
                    <strong style={{ color: "var(--yes)" }}>${toWin.toFixed(2)} USDC</strong>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "10px", fontSize: "0.95em" }}>
                    <span style={{ color: "#888" }}>Avg. Price</span>
                    <strong>${avgPrice.toFixed(2)}</strong>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "20px", fontSize: "0.95em" }}>
                    <span style={{ color: "#888" }}>Potential Profit</span>
                    <strong style={{ color: "var(--yes)" }}>+${potentialProfit.toFixed(2)} USDC</strong>
                  </div>

                  <button
                    type="button"
                    style={{ width: "100%", padding: "15px", background: tradeOutcome === 0 ? "var(--yes)" : "var(--no)", color: "#000", border: "none", borderRadius: "8px", fontWeight: "bold", fontSize: "1.1em", cursor: busy ? "not-allowed" : "pointer" }}
                    disabled={busy}
                    onClick={() => trade("buy", tradeOutcome)}
                  >
                    BUY {tradeOutcome === 0 ? "YES" : "NO"}
                  </button>
                  
                  {/* Keep Sell buttons as secondary actions so we don't break functionality */}
                  <div style={{ display: "flex", gap: "10px", marginTop: "15px" }}>
                    <button
                      type="button"
                      className="ghost"
                      style={{ flex: 1, padding: "8px", fontSize: "0.9em", background: "#222", border: "1px solid #444", borderRadius: "4px", color: "#aaa" }}
                      disabled={busy}
                      onClick={() => trade("sell", 0)}
                    >
                      Sell YES
                    </button>
                    <button
                      type="button"
                      className="ghost"
                      style={{ flex: 1, padding: "8px", fontSize: "0.9em", background: "#222", border: "1px solid #444", borderRadius: "4px", color: "#aaa" }}
                      disabled={busy}
                      onClick={() => trade("sell", 1)}
                    >
                      Sell NO
                    </button>
                  </div>
                </div>
              )}

              {currentStatus === "frozen" && (
                <div className="trade" style={{ textAlign: "center", padding: "20px", color: "#f59e0b", border: "1px solid #f59e0b" }}>
                  <h3 style={{ margin: 0 }}>TRADING CLOSED</h3>
                  <p style={{ margin: "10px 0 0", fontSize: "0.9em" }}>Market is frozen pending resolution.</p>
                </div>
              )}

              {currentStatus === "resolved" && (
                <div className="trade" style={{ border: "1px solid var(--border)", background: "var(--panel)" }}>
                  <h3 style={{ margin: "0 0 15px", borderBottom: "1px solid var(--border)", paddingBottom: "10px" }}>
                    FINAL OUTCOME
                  </h3>
                  
                  <div style={{ marginBottom: "20px" }}>
                    <div style={{ fontSize: "1.2em", fontWeight: "bold", color: onChainState?.winningOutcome === 0 ? "var(--yes)" : "var(--no)" }}>
                      {onChainState?.winningOutcome === 0 ? "✓ YES WON" : onChainState?.winningOutcome === 1 ? "✓ NO WON" : "UNKNOWN"}
                    </div>
                  </div>

                  <div style={{ marginBottom: "20px" }}>
                    <div style={{ fontSize: "0.8em", color: "#888", marginBottom: "5px" }}>Your Position</div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>YES Shares:</span>
                      <span>{userYesShares.toFixed(2)}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>NO Shares:</span>
                      <span>{userNoShares.toFixed(2)}</span>
                    </div>
                  </div>

                  {msg && msg.startsWith("Redeemed winning shares") ? (
                    <div style={{ marginBottom: "20px", background: "rgba(16, 185, 129, 0.1)", padding: "15px", borderRadius: "8px", border: "1px solid var(--yes)" }}>
                      <div style={{ color: "var(--yes)", fontWeight: "bold", fontSize: "1.2em", textAlign: "center", marginBottom: "15px" }}>
                        REDEEMED ✓
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "5px" }}>
                        <span>USDC RECEIVED</span>
                        <strong>${msg.split("|")[1] || "0.00"}</strong>
                      </div>
                      <div style={{ marginTop: "15px", fontSize: "0.8em", wordBreak: "break-all", color: "#888" }}>
                        Transaction: <br/> {msg.split("|")[2] || msg}
                      </div>
                    </div>
                  ) : winningShares > 0 ? (
                    <div style={{ marginBottom: "20px", background: "rgba(16, 185, 129, 0.1)", padding: "10px", borderRadius: "8px", border: "1px solid var(--yes)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "5px" }}>
                        <span>Winning Shares</span>
                        <strong>{winningShares.toFixed(2)}</strong>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "5px" }}>
                        <span>Payout / Share</span>
                        <span>$1.00 USDC</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px dashed var(--yes)", paddingTop: "5px", marginTop: "5px" }}>
                        <strong>YOU WIN</strong>
                        <strong style={{ color: "var(--yes)" }}>${winningShares.toFixed(2)} USDC</strong>
                      </div>
                      
                      <div style={{ marginTop: "15px" }}>
                        <button
                          type="button"
                          className="yes"
                          style={{ width: "100%", padding: "12px", fontSize: "1.1em" }}
                          disabled={busy || !isRedeemable}
                          onClick={handleRedeem}
                        >
                          [ REDEEM ]
                        </button>
                        {!isRedeemable && (onChainState?.aiResolutionConfidence ?? 100) < 60 && (
                          <div style={{ fontSize: "0.8em", color: "var(--no)", marginTop: "8px", textAlign: "center" }}>
                            Redemption locked: AI confidence below 60%.
                          </div>
                        )}
                      </div>
                    </div>
                  ) : losingShares > 0 ? (
                    <div style={{ marginBottom: "20px", background: "rgba(239, 68, 68, 0.1)", padding: "10px", borderRadius: "8px", border: "1px solid var(--no)" }}>
                      <div style={{ color: "var(--no)", fontWeight: "bold", marginBottom: "10px" }}>
                        ✕ YOUR POSITION DID NOT WIN
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "5px" }}>
                        <span>Winning Shares</span>
                        <strong>0.00</strong>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span>Payout</span>
                        <strong>$0.00 USDC</strong>
                      </div>
                    </div>
                  ) : (
                    <div style={{ fontSize: "0.9em", color: "#888", textAlign: "center", fontStyle: "italic" }}>
                      Already Redeemed or No Position
                    </div>
                  )}
                </div>
              )}

              {position && currentStatus !== "resolved" && (
                <div className="pos" style={{ background: "#1a1a2e", padding: "15px", borderRadius: "8px", border: "1px solid #333", marginTop: "20px" }}>
                  <h4 style={{ margin: "0 0 10px", color: "#ccc" }}>Your Position</h4>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "5px" }}>
                    <span>YES shares:</span>
                    <strong>{userYesShares.toFixed(2)}</strong>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "15px" }}>
                    <span>NO shares:</span>
                    <strong>{userNoShares.toFixed(2)}</strong>
                  </div>
                  <div style={{ borderTop: "1px solid #333", paddingTop: "10px", display: "flex", justifyContent: "space-between", color: "#888" }}>
                    <span>Estimated Current Value:</span>
                    <strong style={{ color: "#fff" }}>${(estimatedYesValue + estimatedNoValue).toFixed(2)} USDC</strong>
                  </div>
                </div>
              )}
              {msg && currentStatus !== "resolved" && !msg.startsWith("Redeemed") && <p className="msg">{msg}</p>}

              <MarketActivity 
                market={active} 
                marketPda={active.pubkey || marketPda(active.polymarketId)[0].toBase58()} 
                refreshTrigger={refreshCounter} 
              />
            </>
          )}
          </ErrorBoundary>
        </section>
      </main>
    </div>
  );
}
