import { useMemo } from "react";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-wallets";
import "@solana/wallet-adapter-react-ui/styles.css";

const getRpcEndpoint = () => {
  let url = import.meta.env.VITE_SOLANA_RPC_URL || "https://api.devnet.solana.com";
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    if (typeof window !== "undefined") {
      url = `${window.location.origin}${url.startsWith("/") ? "" : "/"}${url}`;
    } else {
      url = "https://api.devnet.solana.com";
    }
  }
  return url;
};

const endpoint = getRpcEndpoint();

export function WalletContext({ children }: { children: React.ReactNode }) {
  const wallets = useMemo(() => [new PhantomWalletAdapter()], []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
