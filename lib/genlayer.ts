import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { TransactionStatus } from "genlayer-js/types";
import { getAddress } from "viem";

export type VerifiedFinding = {
  id: string;
  category: string;
  severity: "high" | "moderate" | "low";
  clause_reference: string;
  summary: string;
  question: string;
};

export type VerifiedAssessment = {
  assessment_id: string;
  commitment: string;
  conclusion: "attention_required" | "no_high_attention" | "unable_to_determine";
  findings: VerifiedFinding[];
  missing_context: string[];
  uncertainty: string[];
};

export type AssessmentSummary = {
  assessment_id: string;
  title: string;
  assessed_at: string;
  conclusion: VerifiedAssessment["conclusion"];
  finding_count: number;
};

export type StoredAssessment = {
  assessment_id: string;
  title: string;
  assessed_at: string;
  contract_text: string;
  report: VerifiedAssessment;
};

export type BrowserProvider = {
  request: (request: { method: string; params?: unknown[] }) => Promise<unknown>;
  providers?: BrowserProvider[];
  isMetaMask?: boolean;
  isRabby?: boolean;
  isTrust?: boolean;
  isTrustWallet?: boolean;
};

export type WalletOption = {
  id: string;
  name: string;
  provider: BrowserProvider;
};

type ReceiptWithConsensus = {
  statusName?: string;
  // The SDK's simplified browser receipt converts statusName to snake_case.
  status_name?: string;
  resultName?: string;
  result_name?: string;
  consensus_data?: {
    leader_receipt?: Array<{ result?: unknown }>;
  };
};

const addressPattern = /^0x[a-fA-F0-9]{40}$/;
const historyAddressCache = new Map<string, string>();
const studionetChainId = "0xf22f";
let activeWalletProvider: BrowserProvider | null = null;

function walletName(provider: BrowserProvider, announcedName?: string) {
  if (provider.isRabby) return "Rabby Wallet";
  if (provider.isTrust || provider.isTrustWallet) return "Trust Wallet";
  if (provider.isMetaMask) return "MetaMask";
  return announcedName?.trim() || "Browser wallet";
}

function walletId(provider: BrowserProvider, index: number, announcedId?: string) {
  if (announcedId) return announcedId;
  if (provider.isRabby) return "io.rabby";
  if (provider.isTrust || provider.isTrustWallet) return "com.trustwallet";
  if (provider.isMetaMask) return "io.metamask";
  return `browser-wallet-${index}`;
}

export async function discoverWallets(): Promise<WalletOption[]> {
  if (typeof window === "undefined") return [];

  const options: WalletOption[] = [];
  const seenProviders = new Set<BrowserProvider>();
  const add = (provider: BrowserProvider | undefined, announced?: { name?: string; rdns?: string }) => {
    if (!provider || typeof provider.request !== "function" || seenProviders.has(provider)) return;
    seenProviders.add(provider);
    options.push({
      id: walletId(provider, options.length, announced?.rdns),
      name: walletName(provider, announced?.name),
      provider,
    });
  };

  const announce = (event: Event) => {
    const detail = (event as CustomEvent<{ info?: { name?: string; rdns?: string }; provider?: BrowserProvider }>).detail;
    add(detail?.provider, detail?.info);
  };

  window.addEventListener("eip6963:announceProvider", announce);
  window.dispatchEvent(new Event("eip6963:requestProvider"));

  const injected = (window as Window & { ethereum?: BrowserProvider }).ethereum;
  if (injected?.providers?.length) {
    injected.providers.forEach((provider) => add(provider));
  }
  add(injected);

  // EIP-6963 wallet extensions can announce asynchronously after the request.
  await new Promise<void>((resolve) => window.setTimeout(resolve, 120));
  window.removeEventListener("eip6963:announceProvider", announce);

  return options;
}

export function setActiveWalletProvider(provider: BrowserProvider | null) {
  activeWalletProvider = provider;
}

function historyAddressCandidates(walletAddress: string) {
  return [...new Set([
    historyAddressCache.get(walletAddress),
    walletAddress.toLowerCase(),
    walletAddress,
    getAddress(walletAddress),
  ].filter((address): address is string => Boolean(address)))];
}
const consensusPollIntervalMs = 3_000;
const consensusPollRetries = 120;

export const contractAddress = process.env.NEXT_PUBLIC_CLAUSE_CONTRACT_ADDRESS ?? "";
export const isContractConfigured = addressPattern.test(contractAddress);

function getBrowserProvider(): BrowserProvider {
  const provider = activeWalletProvider ?? (window as Window & { ethereum?: BrowserProvider }).ethereum;

  if (!provider) {
    throw new Error(
      "A compatible browser wallet is required. On a phone, open Clause in your wallet app's built-in browser, connect your wallet, and try again.",
    );
  }

  return provider;
}

export function userFacingSubmissionError(error: unknown): string {
  if (error && typeof error === "object") {
    const walletError = error as { code?: unknown; message?: unknown; shortMessage?: unknown };
    if (walletError.code === 4001) return "You cancelled the wallet request. No assessment was submitted.";
    if (walletError.code === 4900 || walletError.code === 4901) return "Your wallet disconnected. Reconnect it and try again.";
    if (walletError.code === 4902) return "Your wallet could not add or switch to GenLayer Studionet. Add the network in your wallet, then try again.";
    const message = typeof walletError.shortMessage === "string" ? walletError.shortMessage : walletError.message;
    if (typeof message === "string" && message.trim()) return message.trim();
  }

  if (error instanceof Error && error.message) return error.message;

  return "We could not submit the assessment. Check your wallet connection and try again.";
}

async function ensureStudionetNetwork(provider: BrowserProvider) {
  const chainParams = {
    chainId: studionetChainId,
    chainName: "GenLayer Studionet",
    nativeCurrency: { name: "GEN", symbol: "GEN", decimals: 18 },
    rpcUrls: ["https://studio.genlayer.com/api"],
    blockExplorerUrls: ["https://explorer-studio.genlayer.com"],
  };

  const currentChainId = await provider.request({ method: "eth_chainId" });
  if (currentChainId === studionetChainId) return;

  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: studionetChainId }],
    });
  } catch (switchError) {
    const code = switchError && typeof switchError === "object" ? (switchError as { code?: unknown }).code : undefined;
    if (code !== 4902) throw switchError;

    await provider.request({ method: "wallet_addEthereumChain", params: [chainParams] });
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: studionetChainId }],
    });
  }
}

function parseAssessment(value: string): VerifiedAssessment {
  let parsed: unknown = value;

  // Some RPC transports return a JSON string nested inside another JSON string.
  for (let index = 0; index < 2 && typeof parsed === "string"; index += 1) {
    parsed = JSON.parse(parsed);
  }

  if (
    !parsed ||
    typeof parsed !== "object" ||
    !Array.isArray((parsed as VerifiedAssessment).findings) ||
    typeof (parsed as VerifiedAssessment).assessment_id !== "string"
  ) {
    throw new Error("The transaction succeeded, but Clause could not read its assessment report.");
  }

  return parsed as VerifiedAssessment;
}

function getAssessmentResult(value: unknown): string {
  if (typeof value === "string") return value;

  // Studionet presents a GenVM return value in a user-friendly wrapper,
  // while other SDK paths expose the return value directly.
  if (value && typeof value === "object") {
    const result = value as { status?: unknown; payload?: { readable?: unknown } | null };
    const readable = result.payload?.readable;

    if (result.status === "return" && typeof readable === "string") return readable;
    if (typeof result.status === "string" && result.status !== "return") {
      throw new Error(`Consensus was accepted, but contract execution returned: ${result.status}.`);
    }
  }

  throw new Error("The assessment was accepted, but its report is not available from this receipt yet.");
}

function parseReadResult<T>(value: unknown, errorMessage: string): T {
  try {
    let parsed: unknown = getAssessmentResult(value);
    for (let index = 0; index < 2 && typeof parsed === "string"; index += 1) parsed = JSON.parse(parsed);
    return parsed as T;
  } catch {
    throw new Error(errorMessage);
  }
}

function readClient() {
  if (!isContractConfigured) {
    throw new Error("Assessment history will be available after a Clause history-enabled contract is configured.");
  }
  return createClient({ chain: studionet });
}

export async function getAssessmentSummaries(walletAddress: string): Promise<AssessmentSummary[]> {
  const walletAddressCandidates = historyAddressCandidates(walletAddress);
  const readSummaries = async (address: string) => {
    const result = await readClient().readContract({
      address: contractAddress as `0x${string}`,
      functionName: "get_assessment_summaries_for_wallet",
      args: [address],
    });
    const summaries = parseReadResult<unknown>(result, "Clause could not load assessment history from this contract.");
    if (!Array.isArray(summaries)) throw new Error("Clause received an invalid assessment history response.");
    return summaries as AssessmentSummary[];
  };

  for (const address of walletAddressCandidates) {
    const summaries = await readSummaries(address);
    if (summaries.length) {
      historyAddressCache.set(walletAddress, address);
      return summaries;
    }
  }
  return [];
}

export async function getAssessmentForWallet(walletAddress: string, assessmentId: string): Promise<StoredAssessment | null> {
  const walletAddressCandidates = historyAddressCandidates(walletAddress);
  const readAssessment = async (address: string) => {
    const result = await readClient().readContract({
      address: contractAddress as `0x${string}`,
      functionName: "get_assessment_for_wallet",
      args: [address, assessmentId],
    });
    const raw = getAssessmentResult(result);
    if (!raw) return null;
    const assessment = parseReadResult<unknown>(raw, "Clause could not load this assessment from the contract.");
    if (!assessment || typeof assessment !== "object") throw new Error("Clause received an invalid assessment record.");
    return assessment as StoredAssessment;
  };

  for (const address of walletAddressCandidates) {
    const assessment = await readAssessment(address);
    if (assessment) {
      historyAddressCache.set(walletAddress, address);
      return assessment;
    }
  }
  return null;
}

export async function connectStudionetWallet({
  onStage,
  requestAccountSelection = false,
  provider: suppliedProvider,
}: {
  onStage?: (stage: string) => void;
  requestAccountSelection?: boolean;
  provider?: BrowserProvider;
} = {}): Promise<string> {
  const provider = suppliedProvider ?? getBrowserProvider();
  onStage?.("Choose the wallet account you want to connect.");

  if (requestAccountSelection) {
    try {
      await provider.request({
        method: "wallet_requestPermissions",
        params: [{ eth_accounts: {} }],
      });
    } catch {
      // Some EIP-1193 providers do not support account-permission requests.
      // They can still present their own account selector on eth_requestAccounts.
    }
  }

  const accounts = await provider.request({ method: "eth_requestAccounts" });
  const account = Array.isArray(accounts) && typeof accounts[0] === "string" ? accounts[0] : null;

  if (!account || !addressPattern.test(account)) {
    throw new Error("Your wallet did not provide a valid account address.");
  }

  onStage?.("Switching your wallet to GenLayer Studionet…");
  // GenLayerJS 1.x's `client.connect()` also attempts to install a MetaMask
  // Snap. Clause uses the standard EIP-1193 path instead, which works with
  // wallets that support custom networks (MetaMask, Rabby, Trust, and others).
  await ensureStudionetNetwork(provider);
  setActiveWalletProvider(provider);
  return account;
}

export async function submitForStudionetAssessment({
  contractText,
  onStage,
}: {
  contractText: string;
  onStage?: (stage: string) => void;
}): Promise<{ assessment: VerifiedAssessment; transactionHash: string; account: string }> {
  if (!isContractConfigured) {
    throw new Error(
      "This Clause deployment has no Studionet contract address yet. Add NEXT_PUBLIC_CLAUSE_CONTRACT_ADDRESS to .env.local and restart the app.",
    );
  }

  const provider = getBrowserProvider();
  const account = await connectStudionetWallet({ onStage });

  const client = createClient({
    chain: studionet,
    account: account as `0x${string}`,
    provider,
  });

  onStage?.("Confirm the assessment transaction in your wallet…");
  const transactionHash = await client.writeContract({
    address: contractAddress as `0x${string}`,
    functionName: "assess_contract",
    args: [contractText],
    value: BigInt(0),
  });

  onStage?.("Your contract is being assessed. This can take a little while…");
  const receipt = (await client.waitForTransactionReceipt({
    hash: transactionHash,
    // FINALIZED is terminal: it covers both an accepted assessment and an
    // undetermined one. Waiting only for ACCEPTED makes an undetermined
    // transaction look like a timeout even after Studio has finished it.
    status: TransactionStatus.FINALIZED,
    interval: consensusPollIntervalMs,
    retries: consensusPollRetries,
  })) as ReceiptWithConsensus;

  const finalConsensusResult = receipt.resultName ?? receipt.result_name;
  if (finalConsensusResult === "MAJORITY_DISAGREE") {
    throw new Error("Clause finished assessing this contract, but the validators could not reach a shared result. No report was created or saved. You can revise the approved copy or try again.");
  }
  if (finalConsensusResult !== "MAJORITY_AGREE") {
    throw new Error("Clause finished processing this contract without a verified assessment result. No report was created or saved. Please try again.");
  }

  const leaderResult = getAssessmentResult(receipt.consensus_data?.leader_receipt?.[0]?.result);
  return { assessment: parseAssessment(leaderResult), transactionHash, account };
}
