export type Attention = "high" | "moderate" | "low" | "unable_to_determine";

export type Finding = {
  id: string;
  category: string;
  attention: Attention;
  title: string;
  explanation: string;
  ask: string;
  evidence: string;
};

export type Assessment = {
  contractType: string;
  confidenceNote: string | null;
  summary: string;
  findings: Finding[];
  obligations: string[];
  missingContext: string[];
};

type Rule = Omit<Finding, "id" | "evidence"> & { expressions: RegExp[]; evidence: string };

const rules: Rule[] = [
  {
    category: "Liability",
    attention: "high",
    title: "Potentially uncapped exposure",
    explanation: "The agreement uses wording that may leave financial exposure without a stated ceiling.",
    ask: "Can liability be limited to fees paid, insurance proceeds, or another agreed cap?",
    evidence: "Matched terms relating to unlimited or uncapped liability.",
    expressions: [/unlimited liability/i, /uncapped liability/i, /liable for all (loss|losses|damages)/i]
  },
  {
    category: "Termination",
    attention: "high",
    title: "Immediate termination language",
    explanation: "One party may be able to end the relationship immediately; the remedy or notice available to you may be narrower.",
    ask: "Which breaches permit immediate termination, and is there a reasonable cure period?",
    evidence: "Matched immediate termination wording."
    ,expressions: [/terminate immediately/i, /immediate termination/i, /without notice/i]
  },
  {
    category: "Intellectual property",
    attention: "high",
    title: "Broad ownership assignment",
    explanation: "The text appears to assign or transfer rights broadly. It may reach pre-existing tools, templates, or unrelated work unless expressly excluded.",
    ask: "Does the assignment exclude pre-existing materials and limit ownership to paid-for deliverables?",
    evidence: "Matched IP assignment wording.",
    expressions: [/assign(?:s|ment)? .*all .*intellectual property/i, /work made for hire/i, /irrevocably assign/i]
  },
  {
    category: "Confidentiality",
    attention: "moderate",
    title: "Continuing confidentiality obligation",
    explanation: "Confidentiality duties may continue after the agreement ends. The duration and exceptions deserve a close read.",
    ask: "How long does confidentiality last, and are independently developed or legally compelled disclosures excluded?",
    evidence: "Matched survival/confidentiality wording.",
    expressions: [/confidential(?:ity)? .*surviv/i, /in perpetuity/i, /shall remain confidential/i]
  },
  {
    category: "Disputes",
    attention: "moderate",
    title: "Dispute forum or arbitration requirement",
    explanation: "The agreement may require a particular forum or private arbitration, which can affect cost, location, and appeal rights.",
    ask: "Where must a dispute be brought, and who bears arbitration costs?",
    evidence: "Matched arbitration/forum-selection wording.",
    expressions: [/binding arbitration/i, /exclusive jurisdiction/i, /venue.*courts?/i]
  },
  {
    category: "Renewal",
    attention: "moderate",
    title: "Automatic renewal detected",
    explanation: "The agreement may renew unless notice is given by a stated deadline.",
    ask: "What is the renewal date and the latest safe date for non-renewal notice?",
    evidence: "Matched auto-renewal wording.",
    expressions: [/automatically renew/i, /auto.?renew/i, /renew(?:ed|al) .*unless/i]
  }
];

export function createPrivatePreview(text: string): Assessment {
  const findings = rules
    .filter((rule) => rule.expressions.some((expression) => expression.test(text)))
    .map((rule, index) => ({
      id: `finding-${index + 1}`,
      category: rule.category,
      attention: rule.attention,
      title: rule.title,
      explanation: rule.explanation,
      ask: rule.ask,
      evidence: rule.evidence
    }));

  const contractType = /non[- ]disclosure|\bnda\b/i.test(text)
    ? "Non-disclosure agreement"
    : /independent contractor|services? agreement|statement of work/i.test(text)
      ? "Service agreement"
      : /employment agreement|employee/i.test(text)
        ? "Employment agreement"
        : "Agreement — type not confirmed";

  const obligations = [
    /pay(?:ment|able)|fee|invoice/i.test(text) ? "Payment or invoicing terms appear in the document." : "Confirm whether payment terms are contained in a missing schedule.",
    /notice/i.test(text) ? "A notice requirement appears; confirm delivery method and deadlines." : "No clear notice clause was detected in this preview.",
    /confidential/i.test(text) ? "The document includes confidentiality-related obligations." : "No clear confidentiality clause was detected in this preview."
  ];

  const missingContext = [/schedule|exhibit|appendix|statement of work/i.test(text)
    ? "The document refers to a schedule, exhibit, appendix, or statement of work. Confirm every referenced attachment was supplied."
    : "No referenced attachment was detected by this preview."];

  return {
    contractType,
    confidenceNote: "This is a local, rules-based private preview. It is not legal advice and is not GenLayer-verified.",
    summary: findings.length
      ? `${findings.length} clause${findings.length === 1 ? "" : "s"} deserves attention before you sign.`
      : "No high-signal pattern was found. Read the full agreement and confirm all attachments before signing.",
    findings,
    obligations,
    missingContext
  };
}
