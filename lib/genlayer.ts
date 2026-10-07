import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { ExecutionResult, TransactionStatus } from "genlayer-js/types";

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

type BrowserProvider = {
  request: (request: { method: string; params?: unknown[] }) => Promise<unknown>;
};

type ReceiptWithConsensus = {
  statusName?: string;
  txExecutionResultName?: string;
  consensus_data?: {
    leader_receipt?: Array<{ result: string }>;
  };
};

const addressPattern = /^0x[a-fA-F0-9]{40}$/;

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

  onStage?.("Confirm the public assessment transaction in your wallet…");
  const transactionHash = await client.writeContract({
    address: contractAddress as `0x${string}`,
    functionName: "assess_contract",
    args: [contractText],
    value: BigInt(0),
  });

  onStage?.("Validators are independently assessing the approved text. This can take a little while…");
  const receipt = (await client.waitForTransactionReceipt({
    hash: transactionHash,
    status: TransactionStatus.ACCEPTED,
  })) as ReceiptWithConsensus;

  if (receipt.statusName !== TransactionStatus.ACCEPTED) {
    throw new Error(`The assessment did not reach consensus: ${receipt.statusName ?? "unknown status"}.`);
  }

  if (receipt.txExecutionResultName !== ExecutionResult.FINISHED_WITH_RETURN) {
    throw new Error(
      `Consensus was reached, but contract execution did not return a report: ${receipt.txExecutionResultName ?? "unknown execution result"}.`,
    );
  }

  const leaderResult = receipt.consensus_data?.leader_receipt?.[0]?.result;
  if (!leaderResult) {
    throw new Error("The assessment was accepted, but its report is not available from this receipt yet.");
  }

  return { assessment: parseAssessment(leaderResult), transactionHash, account };
}
