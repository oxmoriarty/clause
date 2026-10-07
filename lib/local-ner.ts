import type { RedactionResult } from "@/lib/redaction";

const MODEL_ID = "Xenova/bert-base-NER";
const MINIMUM_CONFIDENCE = 0.75;

type EntityKind = "PER" | "ORG" | "LOC";

type EntityToken = {
  entity: string;
  score: number;
  start?: number;
  end?: number;
};

type EntitySpan = {
  kind: EntityKind;
  start: number;
  end: number;
};

type NerClassifier = (text: string, options?: { ignore_labels?: string[] }) => Promise<EntityToken[]>;

let classifierPromise: Promise<NerClassifier> | null = null;

function entityKind(entity: string): EntityKind | null {
  const normalized = entity.toUpperCase().replace(/^[BI]-/, "");
  if (normalized === "PER" || normalized === "PERSON") return "PER";
  if (normalized === "ORG" || normalized === "ORGANIZATION") return "ORG";
  if (normalized === "LOC" || normalized === "LOCATION" || normalized === "GPE") return "LOC";
  return null;
}

async function getClassifier(): Promise<NerClassifier> {
  if (!classifierPromise) {
    classifierPromise = import("@huggingface/transformers")
      .then(async ({ env, pipeline }) => {
        // The inference runtime is local. These are only the free, public WASM
        // binaries it needs to execute the downloaded NER model in the browser.
        const wasm = env.backends.onnx.wasm;
        if (wasm) wasm.wasmPaths = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.21.0/dist/";
        const classifier = await pipeline("token-classification", MODEL_ID, {
          // The browser caches the model artifacts after their first download.
          dtype: "q8",
        });
        return classifier as NerClassifier;
      })
      .catch((error) => {
        classifierPromise = null;
        throw error;
      });
  }

  return classifierPromise;
}

function toEntitySpans(tokens: EntityToken[]): EntitySpan[] {
  const spans: EntitySpan[] = [];

  for (const token of tokens) {
    const kind = entityKind(token.entity);
    if (!kind || token.score < MINIMUM_CONFIDENCE || token.start === undefined || token.end === undefined) continue;

    const previous = spans.at(-1);
    if (previous && previous.kind === kind && token.start <= previous.end + 1) {
      previous.end = Math.max(previous.end, token.end);
    } else {
      spans.push({ kind, start: token.start, end: token.end });
    }
  }

  return spans;
}

function replacementFor(kind: EntityKind) {
  if (kind === "PER") return "[PERSON NAME REDACTED]";
  if (kind === "ORG") return "[ORGANIZATION REDACTED]";
  return "[LOCATION REDACTED]";
}

function labelFor(kind: EntityKind) {
  if (kind === "PER") return "person names (local model)";
  if (kind === "ORG") return "organization names (local model)";
  return "locations (local model)";
}

/**
 * Runs entirely in the browser. The model is downloaded and cached by the
 * browser on first use; contract text is never posted to the model host.
 */
export async function detectEntityRedactions(source: string): Promise<{ text: string; counts: Record<string, number> }> {
  const classifier = await getClassifier();
  const tokens = await classifier(source, { ignore_labels: ["O"] });
  const spans = toEntitySpans(tokens);
  const counts: Record<string, number> = {};
  let text = source;

  // Apply from the end so model offsets stay valid.
  for (const span of [...spans].reverse()) {
    const label = labelFor(span.kind);
    text = `${text.slice(0, span.start)}${replacementFor(span.kind)}${text.slice(span.end)}`;
    counts[label] = (counts[label] ?? 0) + 1;
  }

  return { text, counts };
}

export type HybridRedactionResult = RedactionResult & {
  entityDetection: "local_model" | "rules_only";
  entityDetectionNote?: string;
};
