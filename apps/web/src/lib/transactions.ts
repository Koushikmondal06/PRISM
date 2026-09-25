import { Connection, PublicKey, ParsedTransactionWithMeta } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { BorshCoder } from "@coral-xyz/anchor";
import idl from "../idl/prism.json";
export type WalletTransaction = {
    signature: string;
    slot: number;
    blockTime: number | null;
    status: "success" | "failed";
    type: "BUY" | "SELL" | "CREATE_MARKET" | "FREEZE" | "RESOLVE" | "REDEEM" | "TRANSFER" | "OTHER";
    program: string;
    marketPda?: string;
    polymarketId?: string;
    outcome?: "YES" | "NO";
    shares?: number;
    usdcAmount?: number;
    feeSol?: number;
    error?: string;
    explorerUrl: string;
};

const PRISM_PROGRAM_ID = "6cD9BZG2bddZZ1xoNReLVEvdYVaxpxY97F7MfZyov7XW";
const USDC_MINT = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
const coder = new BorshCoder(idl as any);

const transactionCache = new Map<string, { data: any, timestamp: number }>();
const inFlightRequests = new Map<string, Promise<any>>();
const CACHE_TTL = 30000; // 30 seconds

async function callWithRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
    let attempt = 0;
    while (attempt < maxRetries) {
        try {
            return await fn();
        } catch (error: any) {
            const msg = error.message?.toLowerCase() || String(error).toLowerCase();
            if (msg.includes("429") || msg.includes("too many requests") || msg.includes("rate limit")) {
                attempt++;
                if (attempt >= maxRetries) {
                    throw new Error("RPC rate limit reached. Please retry shortly.");
                }
                const delay = 500 * Math.pow(2, attempt - 1);
                await new Promise(r => setTimeout(r, delay));
            } else {
                throw error;
            }
        }
    }
    throw new Error("RPC rate limit reached. Please retry shortly.");
}

function calculateUsdcDelta(tx: ParsedTransactionWithMeta, walletAddress: string): number {
    if (!tx.meta?.preTokenBalances || !tx.meta?.postTokenBalances) return 0;
    
    const ownerMap = new Map<number, string>();
    for (const b of tx.meta.preTokenBalances) {
        if (b.owner) ownerMap.set(b.accountIndex, b.owner);
    }
    for (const b of tx.meta.postTokenBalances) {
        if (b.owner) ownerMap.set(b.accountIndex, b.owner);
    }

    const walletUsdcIndices = new Set<number>();
    for (const b of tx.meta.preTokenBalances) {
        const owner = b.owner || ownerMap.get(b.accountIndex);
        if (b.mint === USDC_MINT && owner === walletAddress) {
            walletUsdcIndices.add(b.accountIndex);
        }
    }
    for (const b of tx.meta.postTokenBalances) {
        const owner = b.owner || ownerMap.get(b.accountIndex);
        if (b.mint === USDC_MINT && owner === walletAddress) {
            walletUsdcIndices.add(b.accountIndex);
        }
    }

    let totalRawDelta = 0;
    for (const idx of walletUsdcIndices) {
        const pre = tx.meta.preTokenBalances.find(b => b.accountIndex === idx);
        const post = tx.meta.postTokenBalances.find(b => b.accountIndex === idx);

        const preRaw = pre ? Number(pre.uiTokenAmount.amount || 0) : 0;
        const postRaw = post ? Number(post.uiTokenAmount.amount || 0) : 0;
        totalRawDelta += (postRaw - preRaw);
    }

    return totalRawDelta / 1_000_000;
}

function toNumeric(value: unknown): number | null {
    if (value == null) return null;
    if (typeof value === "number") {
        return Number.isFinite(value) ? value : null;
    }
    if (typeof value === "bigint") {
        return Number(value);
    }
    if (typeof value === "string") {
        const n = Number(value);
        return Number.isFinite(n) ? n : null;
    }
    if (
        typeof value === "object" &&
        value !== null &&
        "toString" in value
    ) {
        const n = Number(String(value));
        return Number.isFinite(n) ? n : null;
    }
    return null;
}

export async function fetchWalletTransactions(
    connection: Connection,
    walletAddress: string,
    options?: { before?: string; limit?: number }
) {
    const pubkey = new PublicKey(walletAddress);
    
    // Find USDC ATA
    const usdcAta = getAssociatedTokenAddressSync(new PublicKey(USDC_MINT), pubkey, true);

    const [walletSigs, ataSigs] = await Promise.all([
        connection.getSignaturesForAddress(pubkey, {
            limit: options?.limit || 100,
            before: options?.before,
        }, "confirmed"),
        connection.getSignaturesForAddress(usdcAta, {
            limit: options?.limit || 100,
            before: options?.before, // Note: Before signature may not strictly align, but it's a good approximation
        }, "confirmed")
    ]);

    // Merge and deduplicate by signature, then sort by blockTime desc
    const sigMap = new Map<string, any>();
    for (const s of walletSigs) sigMap.set(s.signature, s);
    for (const s of ataSigs) sigMap.set(s.signature, s);
    
    const allSigs = Array.from(sigMap.values()).sort((a, b) => {
        const timeA = a.blockTime || 0;
        const timeB = b.blockTime || 0;
        if (timeA !== timeB) return timeB - timeA;
        return a.slot < b.slot ? 1 : -1;
    });

    const signatures = allSigs.slice(0, options?.limit || 100);

    if (signatures.length === 0) {
        return { transactions: [], lastSignature: null };
    }

    const txSignatures = signatures.map(s => s.signature);
    
    // Fetch in batches of 25
    const batchSize = 25;
    let parsedTxs: (ParsedTransactionWithMeta | null)[] = [];
    
    for (let i = 0; i < txSignatures.length; i += batchSize) {
        const batch = txSignatures.slice(i, i + batchSize);
        const fetched = await connection.getParsedTransactions(batch, { maxSupportedTransactionVersion: 0 });
        parsedTxs = parsedTxs.concat(fetched);
    }

    const transactions: WalletTransaction[] = [];

    for (let i = 0; i < parsedTxs.length; i++) {
        const tx = parsedTxs[i];
        const sigMeta = signatures[i];
        if (!tx) continue;

        let status: "success" | "failed" = tx.meta?.err === null ? "success" : "failed";
        let errorMsg = undefined;
        if (tx.meta?.err) {
            errorMsg = JSON.stringify(tx.meta.err);
            // try to parse anchor error if we can, or just display raw
            if (tx.meta.logMessages) {
                const anchorErrLog = tx.meta.logMessages.find(l => l.includes("Error Code:"));
                if (anchorErrLog) {
                    const match = anchorErrLog.match(/Error Message: (.*)/);
                    if (match) {
                        errorMsg = match[1];
                    } else {
                        const codeMatch = anchorErrLog.match(/Error Code: ([A-Za-z0-9_]+)/);
                        if (codeMatch) errorMsg = codeMatch[1];
                    }
                }
            }
        }

        const feeSol = (tx.meta?.fee || 0) / 1_000_000_000;
        
        let type: WalletTransaction["type"] = "OTHER";
        let program = "Unknown";
        let marketPda = undefined;
        let polymarketId = undefined;
        let outcome: "YES" | "NO" | undefined = undefined;
        let shares = undefined;
        
        let prismInst: any = null;

        // Inspect instructions
        const instructions = tx.transaction.message.instructions;
        for (const inst of instructions) {
            if (inst.programId.toBase58() === PRISM_PROGRAM_ID) {
                program = PRISM_PROGRAM_ID;
                if ('data' in inst) {
                    try {
                        const decoded = coder.instruction.decode(inst.data, "base58");
                        if (decoded) {
                            prismInst = decoded;
                            if (decoded.name === "createMarket" || decoded.name === "create_market") type = "CREATE_MARKET";
                            else if (decoded.name === "buy") type = "BUY";
                            else if (decoded.name === "sell") type = "SELL";
                            else if (decoded.name === "resolve") type = "RESOLVE";
                            else if (decoded.name === "freeze") type = "FREEZE";
                            else if (decoded.name === "redeem") type = "REDEEM";
                        }
                    } catch (e) {
                        console.error("Failed to decode instruction", e);
                    }
                }
            }
        }

        if (!prismInst && tx.transaction.message.instructions.some(i => i.programId.toBase58() === "11111111111111111111111111111111" || i.programId.toBase58() === "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA")) {
            program = "System/Token";
            type = "TRANSFER";
        } else if (!prismInst) {
            program = tx.transaction.message.instructions[0]?.programId.toBase58() || "Unknown";
        }

        // Calculate USDC delta
        let usdcDelta = 0;
        if (walletAddress) {
            usdcDelta = calculateUsdcDelta(tx, walletAddress);
        }
        
        if (prismInst) {
            if (prismInst.name === "createMarket" || prismInst.name === "create_market") {
                polymarketId = prismInst.data?.polymarketId ?? prismInst.data?.polymarket_id;
            }
            if (prismInst.name === "buy" || prismInst.name === "sell") {
                outcome = prismInst.data?.outcome === 0 ? "YES" : "NO";
                const rawAmount = toNumeric(prismInst.data?.shareAmount ?? prismInst.data?.share_amount);
                shares = rawAmount !== null ? rawAmount / 1_000_000 : undefined;
            }
            if (prismInst.name === "resolve") {
                outcome = prismInst.data?.winningOutcome === 0 || prismInst.data?.winning_outcome === 0 ? "YES" : "NO";
            }
        }

        // Attempt to extract market PDA from keys if prism transaction
        if (prismInst) {
            const prismInstRaw = tx.transaction.message.instructions.find(i => i.programId.toBase58() === PRISM_PROGRAM_ID);
            if (prismInstRaw && 'accounts' in prismInstRaw) {
                marketPda = prismInstRaw.accounts[1]?.toBase58();
            }
        }

        transactions.push({
            signature: sigMeta.signature,
            slot: tx.slot,
            blockTime: tx.blockTime ?? null,
            status,
            type,
            program,
            marketPda,
            polymarketId,
            outcome,
            shares,
            usdcAmount: usdcDelta !== 0 ? usdcDelta : undefined,
            feeSol,
            error: errorMsg,
            explorerUrl: `https://explorer.solana.com/tx/${sigMeta.signature}?cluster=devnet`,
        });
    }

    return {
        transactions,
        lastSignature: signatures[signatures.length - 1].signature
    };
}

export async function fetchMarketTransactions(
    connection: Connection,
    marketPda: string,
    walletAddress: string | null,
    options?: { before?: string; limit?: number; force?: boolean }
) {
    const cacheKey = `${marketPda}-${walletAddress || ''}`;
    
    if (!options?.force) {
        const cached = transactionCache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
            return cached.data;
        }
        if (inFlightRequests.has(cacheKey)) {
            return inFlightRequests.get(cacheKey);
        }
    }

    const promise = (async () => {
        const pubkey = new PublicKey(marketPda);
        const targetCount = options?.limit || 15;
        const MAX_PAGES = 3;
        const PAGE_SIZE = 15;
        
        let allTransactions: WalletTransaction[] = [];
        let beforeSig: string | undefined = options?.before;
        let lastSignature: string | null = null;
        let pagesFetched = 0;
        
        while (allTransactions.length < targetCount && pagesFetched < MAX_PAGES) {
            pagesFetched++;
            const signatures = await callWithRetry(() => 
                connection.getSignaturesForAddress(pubkey, {
                    limit: PAGE_SIZE,
                    before: beforeSig,
                }, "confirmed")
            );
            
            if (signatures.length === 0) break;
            
            lastSignature = signatures[signatures.length - 1].signature;
            beforeSig = lastSignature;
            
            const txSignatures = signatures.map(s => s.signature);
            
            const batchSize = 25;
            let parsedTxs: (ParsedTransactionWithMeta | null)[] = [];
            for (let i = 0; i < txSignatures.length; i += batchSize) {
                const batch = txSignatures.slice(i, i + batchSize);
                const fetched = await callWithRetry(() => 
                    connection.getParsedTransactions(batch, { maxSupportedTransactionVersion: 0 })
                );
                parsedTxs = parsedTxs.concat(fetched);
            }

            for (let i = 0; i < parsedTxs.length; i++) {
                const tx = parsedTxs[i];
                const sigMeta = signatures[i];
                if (!tx) continue;

                // Verify that this transaction contains the PRISM program AND the market PDA
                const accountKeys = tx.transaction.message.accountKeys.map(k => k.pubkey.toBase58());
                if (!accountKeys.includes(PRISM_PROGRAM_ID) || !accountKeys.includes(marketPda)) {
                    continue;
                }

                let status: "success" | "failed" = tx.meta?.err === null ? "success" : "failed";
                let errorMsg = undefined;
                if (tx.meta?.err) {
                    errorMsg = JSON.stringify(tx.meta.err);
                    if (tx.meta.logMessages) {
                        const anchorErrLog = tx.meta.logMessages.find(l => l.includes("Error Code:"));
                        if (anchorErrLog) {
                            const match = anchorErrLog.match(/Error Message: (.*)/);
                            if (match) errorMsg = match[1];
                            else {
                                const codeMatch = anchorErrLog.match(/Error Code: ([A-Za-z0-9_]+)/);
                                if (codeMatch) errorMsg = codeMatch[1];
                            }
                        }
                    }
                }

                const feeSol = (tx.meta?.fee || 0) / 1_000_000_000;
                let type: WalletTransaction["type"] = "OTHER";
                let outcome: "YES" | "NO" | undefined = undefined;
                let shares = undefined;
                let prismInst: any = null;

                const instructions = tx.transaction.message.instructions;
                for (const inst of instructions) {
                    if (inst.programId.toBase58() === PRISM_PROGRAM_ID) {
                        if ('data' in inst) {
                            try {
                                const decoded = coder.instruction.decode(inst.data, "base58");
                                if (decoded) {
                                    prismInst = decoded;
                                    if (decoded.name === "createMarket" || decoded.name === "create_market") type = "CREATE_MARKET";
                                    else if (decoded.name === "buy") type = "BUY";
                                    else if (decoded.name === "sell") type = "SELL";
                                    else if (decoded.name === "resolve") type = "RESOLVE";
                                    else if (decoded.name === "freeze") type = "FREEZE";
                                    else if (decoded.name === "redeem") type = "REDEEM";
                                }
                            } catch (e) { }
                        }
                    }
                }

                let usdcDelta = 0;
                if (walletAddress) {
                    usdcDelta = calculateUsdcDelta(tx, walletAddress);
                }

                if (prismInst) {
                    if (prismInst.name === "buy" || prismInst.name === "sell") {
                        outcome = prismInst.data?.outcome === 0 ? "YES" : "NO";
                        const rawAmount = toNumeric(prismInst.data?.shareAmount ?? prismInst.data?.share_amount);
                        shares = rawAmount !== null ? rawAmount / 1_000_000 : undefined;
                    }
                    if (prismInst.name === "resolve") {
                        outcome = prismInst.data?.winningOutcome === 0 || prismInst.data?.winning_outcome === 0 ? "YES" : "NO";
                    }
                }

                allTransactions.push({
                    signature: sigMeta.signature,
                    slot: tx.slot,
                    blockTime: tx.blockTime ?? null,
                    status,
                    type,
                    program: PRISM_PROGRAM_ID,
                    marketPda,
                    outcome,
                    shares,
                    usdcAmount: usdcDelta !== 0 ? usdcDelta : undefined,
                    feeSol,
                    error: errorMsg,
                    explorerUrl: `https://explorer.solana.com/tx/${sigMeta.signature}?cluster=devnet`,
                });
            }
        }

        return {
            transactions: allTransactions.slice(0, targetCount),
            lastSignature
        };
    })();

    inFlightRequests.set(cacheKey, promise);
    try {
        const result = await promise;
        transactionCache.set(cacheKey, { data: result, timestamp: Date.now() });
        return result;
    } finally {
        inFlightRequests.delete(cacheKey);
    }
}
