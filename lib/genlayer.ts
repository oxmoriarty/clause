import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { TransactionStatus } from "genlayer-js/types";

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

type BrowserProvider = {
  request: (request: { method: string; params?: unknown[] }) => Promise<unknown>;
};

type ReceiptWithConsensus = {
  statusName?: string;
  // The SDK's simplified browser receipt converts statusName to snake_case.
  status_name?: string;
  consensus_data?: {
    leader_receipt?: Array<{ result?: unknown }>;
  };
};

const addressPattern = /^0x[a-fA-F0-9]{40}$/;
const consensusPollIntervalMs = 3_000;
const consensusPollRetries = 120;

export const contractAddress = process.env.NEXT_PUBLIC_CLAUSE_CONTRACT_ADDRESS ?? "";
export const isContractConfigured = addressPattern.test(contractAddress);

function getBrowserProvider(): BrowserProvider {
  const provider = (window as Window & { ethereum?: BrowserProvider }).ethereum;

  if (!provider) {
    throw new Error(
      "A browser wallet is required for a Studionet submission. Install or unlock a compatible wallet, then try again.",
    );
  }

  return provider;
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
  const result = await readClient().readContract({
    address: contractAddress as `0x${string}`,
    functionName: "get_assessment_summaries_for_wallet",
    args: [walletAddress],
  });
  const summaries = parseReadResult<unknown>(result, "Clause could not load assessment history from this contract.");
  if (!Array.isArray(summaries)) throw new Error("Clause received an invalid assessment history response.");
  return summaries as AssessmentSummary[];
}

export async function getAssessmentForWallet(walletAddress: string, assessmentId: string): Promise<StoredAssessment | null> {
  const result = await readClient().readContract({
    address: contractAddress as `0x${string}`,
    functionName: "get_assessment_for_wallet",
    args: [walletAddress, assessmentId],
  });
  const raw = getAssessmentResult(result);
  if (!raw) return null;
  const assessment = parseReadResult<unknown>(raw, "Clause could not load this assessment from the contract.");
  if (!assessment || typeof assessment !== "object") throw new Error("Clause received an invalid assessment record.");
  return assessment as StoredAssessment;
}

export async function connectStudionetWallet({
  onStage,
  requestAccountSelection = false,
}: {
  onStage?: (stage: string) => void;
  requestAccountSelection?: boolean;
} = {}): Promise<string> {
  const provider = getBrowserProvider();
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

  const client = createClient({
    chain: studionet,
    account: account as `0x${string}`,
    provider,
  });

  onStage?.("Switching your wallet to GenLayer Studionet…");
  await client.connect("studionet");
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
    status: TransactionStatus.ACCEPTED,
    // GenLayer validators must independently analyse the contract before
    // consensus can be accepted. The SDK defaults to a 30-second wait, which
    // is routinely too short for an LLM-backed Studionet assessment.
    interval: consensusPollIntervalMs,
    retries: consensusPollRetries,
  })) as ReceiptWithConsensus;

  const consensusStatus = receipt.statusName ?? receipt.status_name;
  if (consensusStatus !== TransactionStatus.ACCEPTED) {
    throw new Error(`The assessment did not reach consensus: ${consensusStatus ?? "unknown status"}.`);
  }

  const leaderResult = getAssessmentResult(receipt.consensus_data?.leader_receipt?.[0]?.result);
  return { assessment: parseAssessment(leaderResult), transactionHash, account };
}
