export type RedactionSummary = {
  total: number;
  categories: Array<{ label: string; count: number }>;
};

export type RedactionResult = {
  text: string;
  summary: RedactionSummary;
};

type RedactionCounter = Record<string, number>;

function replaceAll(
  text: string,
  expression: RegExp,
  replacement: string,
  label: string,
  counter: RedactionCounter,
) {
  return text.replace(expression, () => {
    counter[label] = (counter[label] ?? 0) + 1;
    return replacement;
  });
}

function escapeExpression(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findNamedParties(text: string) {
  const parties = new Set<string>();
  const expression = /\b((?:[A-Z][\p{L}'’.-]+|[A-Z]{2,})(?:\s+(?:[A-Z][\p{L}'’.-]+|[A-Z]{2,})){1,4})\s*\(\s*[“"]?(?:the\s+)?(?:company|client|customer|contributor|consultant|contractor|employee|employer|disclosing party|receiving party|vendor|supplier|landlord|tenant|licensor|licensee|party)[”"]?\s*\)/gu;

  for (const match of text.matchAll(expression)) {
    parties.add(match[1]);
  }

  return [...parties];
}

function redactHeadingParties(text: string, counter: RedactionCounter) {
  return text.replace(/(^|\n)([^\n]*?\bBETWEEN[ \t]+)([A-Z][A-Z0-9&.'’-]*(?:[ \t]+[A-Z][A-Z0-9&.'’-]*){0,3})([ \t]+AND[ \t]+)(?:(?:MR|MRS|MS|DR|ENGR|ENGINEER|PROF)\.?[ \t]+)?([A-Z][A-Z'’-]*(?:[ \t]+[A-Z][A-Z'’-]*){0,3})(?=[ \t]+(?:FOR|UNDER|ON|WITH)\b|[,.]|$)/gim, (_match, lineStart, before, _organization, and, _person) => {
    counter["party names"] = (counter["party names"] ?? 0) + 2;
    return `${lineStart}${before}[ORGANIZATION REDACTED]${and}[PERSON NAME REDACTED]`;
  });
}

/**
 * A deliberately conservative, in-browser redactor. It removes high-confidence
 * identifiers but cannot prove that every identifying detail in every language or
 * contract format was found. The editable result must always be reviewed.
 */
export function redactSensitiveText(source: string): RedactionResult {
  const counter: RedactionCounter = {};
  let text = source;

  text = replaceAll(text, /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[EMAIL REDACTED]", "email addresses", counter);
  text = replaceAll(text, /(?:\+?\d[\d\s().-]{7,}\d)/g, "[PHONE REDACTED]", "phone numbers", counter);
  text = replaceAll(text, /\b(?:https?:\/\/|www\.)[^\s<>()]+/gi, "[LINK REDACTED]", "links", counter);
  text = replaceAll(text, /\b(?:password|passcode|api[ _-]?key|secret(?: key)?|token)\s*[:=]\s*[^\s,;]+/gi, "[CREDENTIAL REDACTED]", "credentials", counter);
  text = replaceAll(text, /\b(?:iban|swift|bic|account(?: number| no\.?| #)?|bank account|routing number|sort code|passport(?: number)?|national id|social security(?: number)?)\s*[:#-]?\s*[A-Z0-9][A-Z0-9 -]{5,}/gi, "[IDENTIFIER REDACTED]", "account and identity numbers", counter);
  text = replaceAll(text, /\b(?:\d[ -]*?){13,19}\b/g, "[CARD NUMBER REDACTED]", "payment-card numbers", counter);

  text = replaceAll(text, /\b\d[\d,]*(?:\.\d+)?\s*(?:thousand|million|billion|trillion|k|m|bn|b)\s+(?:naira|dollars?|pounds?|euros?|usd|eur|gbp|ngn|cad|aud|kes|zar)\b/gi, "[AMOUNT REDACTED]", "payment amounts", counter);
  text = replaceAll(text, /(?:[$€£₦₹¥]\s?\d[\d,]*(?:\.\d{1,2})?|\b(?:USD|EUR|GBP|NGN|CAD|AUD|KES|ZAR)\s?\d[\d,]*(?:\.\d{1,2})?\b|\b\d[\d,]*(?:\.\d{1,2})?\s?(?:dollars?|naira|pounds?|euros?)\b)/gi, "[AMOUNT REDACTED]", "payment amounts", counter);
  text = replaceAll(text, /\b(?:\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}|\d{4}[\/-]\d{1,2}[\/-]\d{1,2}|(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2},?\s+\d{4})\b/gi, "[DATE REDACTED]", "dates", counter);

  text = replaceAll(text, /\b(?:registered office|business address|residential address|mailing address|address|location|place of business|residing at|located at)\s*[:,-]\s*[^\n]+/gi, "[LOCATION OR ADDRESS REDACTED]", "locations and addresses", counter);
  text = replaceAll(text, /\b\d{1,6}\s+[A-Z][\p{L}'’.-]*(?:\s+[A-Z][\p{L}'’.-]*){0,4}\s+(?:street|st\.?|road|rd\.?|avenue|ave\.?|close|drive|lane|way|boulevard|blvd\.?|suite|floor|apartment|apt\.?)\b[^\n,;]*/giu, "[ADDRESS REDACTED]", "locations and addresses", counter);
  text = replaceAll(text, /\b(?:Nigeria|United States(?: of America)?|USA|United Kingdom|England|Wales|Scotland|Canada|Australia|South Africa|Kenya|Ghana|Lagos|Abuja|London|Delaware|New York)\b/gi, "[LOCATION REDACTED]", "locations and addresses", counter);

  text = redactHeadingParties(text, counter);
  text = replaceAll(text, /\b(?:MR|MRS|MS|DR|ENGR|ENGINEER|PROF)\.?\s+[A-Z][A-Z'’-]*(?:\s+[A-Z][A-Z'’-]*){0,3}\b/g, "[PERSON NAME REDACTED]", "party names", counter);

  for (const party of findNamedParties(source)) {
    text = replaceAll(text, new RegExp(`\\b${escapeExpression(party)}\\b`, "g"), "[PARTY NAME REDACTED]", "party names", counter);
  }

  text = replaceAll(text, /\b[A-Z][\p{L}'’.-]*(?:\s+[A-Z][\p{L}'’.-]*){0,4}\s+(?:Ltd\.?|Limited|Inc\.?|LLC|LLP|PLC|GmbH|Corp\.?|Corporation|Foundation|University|Bank)\b/giu, "[ORGANIZATION REDACTED]", "organization names", counter);
  text = replaceAll(text, /(?:^|\n)\s*(?:signed(?: by)?|signature|by|name)\s*[:.]?\s*[^\n]*/gim, "\n[SIGNATURE REDACTED]", "signatures", counter);

  const categories = Object.entries(counter)
    .map(([label, count]) => ({ label, count }))
    .sort((left, right) => right.count - left.count);

  return {
    text,
    summary: {
      total: categories.reduce((total, category) => total + category.count, 0),
      categories,
    },
  };
}

export function combineRedactionCounts(result: RedactionResult, additionalCounts: Record<string, number>): RedactionResult {
  const counts = new Map(result.summary.categories.map((category) => [category.label, category.count]));
  for (const [label, count] of Object.entries(additionalCounts)) {
    counts.set(label, (counts.get(label) ?? 0) + count);
  }

  const categories = [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((left, right) => right.count - left.count);

  return { text: result.text, summary: { total: categories.reduce((total, category) => total + category.count, 0), categories } };
}

/**
 * Adds browser-only named entity recognition to the deterministic privacy rules.
 * A failure to download or run the optional model never sends the contract away
 * and never blocks the user from reviewing the rules-only version.
 */
export async function redactSensitiveTextWithLocalNer(source: string): Promise<HybridRedactionResult> {
  try {
    const entities = await detectEntityRedactions(source);
    const ruleResult = redactSensitiveText(entities.text);
    const result = combineRedactionCounts(ruleResult, entities.counts);
    return { ...result, entityDetection: "local_model" };
  } catch {
    return {
      ...redactSensitiveText(source),
      entityDetection: "rules_only",
      entityDetectionNote: "The optional local name-and-place detector could not load. Clause used its built-in privacy rules instead; review the editable copy especially carefully.",
    };
  }
}
import { detectEntityRedactions, type HybridRedactionResult } from "@/lib/local-ner";
