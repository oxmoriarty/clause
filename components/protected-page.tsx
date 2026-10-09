"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useWallet } from "@/components/wallet-provider";

export function ProtectedPage({ children }: Readonly<{ children: React.ReactNode }>) {
  const router = useRouter();
  const { address, isRestoring } = useWallet();

  useEffect(() => {
    if (!isRestoring && !address) router.replace("/");
  }, [address, isRestoring, router]);

  if (isRestoring || !address) {
    return <main className="access-gate shell"><p className="eyebrow">Clause</p><h1>{isRestoring ? "Checking your wallet…" : "A connected wallet is required."}</h1><p>{isRestoring ? "Restoring your private Clause session." : "Return home to connect your wallet and continue."}</p></main>;
  }

  return <>{children}</>;
}
