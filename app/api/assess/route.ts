import { createPrivatePreview } from "@/lib/assessment";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const text = typeof body?.text === "string" ? body.text.trim() : "";

  if (text.length < 80) {
    return Response.json({ error: "Paste at least a short contract excerpt to create a preview." }, { status: 400 });
  }

  if (text.length > 100_000) {
    return Response.json({ error: "For privacy and reliability, analyze a focused excerpt under 100,000 characters in this prototype." }, { status: 413 });
  }

  return Response.json(createPrivatePreview(text));
}
