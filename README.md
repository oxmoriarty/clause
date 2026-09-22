# Clause

Clause is a privacy-first contract-reading workspace with an explicit GenLayer verification boundary.

## Run locally — free

```powershell
npm install
npm run dev
```

Open `http://localhost:3000`. The first version needs no account, API key, or cloud service: pasted text and local `.txt`, `.md`, or `.html` documents receive a private preview.

## Verification boundary

Never send a private document, signed private link, credential, or sensitive assessment detail to GenLayer. The contract in `contracts/clause_assessor.py` accepts only a user-approved public evidence packet. Both the URL and returned consensus result should be treated as public.

## Free-only choices

- GenLayer Studionet for development and contract testing.
- Open-source local parsers/OCR in the next document-processing milestone.
- Supabase free tier, optionally, for private accounts and storage.
- No paid LLM or extraction API is required by this foundation.

## Contract workflow

Before a Studionet deploy:

```powershell
genvm-lint check contracts/clause_assessor.py --json
gltest tests/integration/ -v -s --network studionet
genlayer network set studionet
genlayer network info
genlayer deploy --contract contracts/clause_assessor.py
```

Always inspect the receipt's execution result; accepted/finalized lifecycle status alone does not prove deployment execution succeeded.
