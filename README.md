# Clause

Clause is a privacy-first, global contract-reading workspace. Version 1 identifies practical contractual risks, obligations, unclear wording, broad terms, and missing context. It does not make legal, enforceability, validity, compliance, or jurisdiction-specific claims.

## Privacy boundary

The private preview stays in the browser. Clause reads `.txt`, `.md`, `.html`, `.docx`, PNG, JPEG, and WebP files locally. It can also capture a single hardcopy page from the device camera. Image text extraction uses Tesseract.js in the browser; the image itself is not uploaded. Clause combines local pattern-based redaction with a small, MIT-licensed named-entity model for people, organizations, and locations. The model and its WebAssembly runtime download to the user's browser on first use and are cached there; Clause never sends contract text to a redaction API or model provider. If the optional model cannot load, the built-in local privacy rules still create an editable fallback.

Never submit a private agreement, signed link, credential, personal data, or confidential material to GenLayer.

The Intelligent Contract receives only the redacted, user-approved contract text. That text is public blockchain calldata; the resulting assessment and stored report are public too.

## Intelligent Contract

`contracts/clause_assessor.py` has one write method:

```text
assess_contract(contract_text)
```

The contract creates serial assessment IDs internally, hashes the submitted text, and returns the complete public JSON report: conclusion, findings, severity, clause references, questions, missing context, and uncertainty. The leader and each validator reason independently, then explicitly compare an overall conclusion, highest severity, and substantial material-risk-category overlap. Retrieve the same report later with `get_assessment_report(assessment_id)`.

## Checks

```powershell
python -m pip install -r requirements.txt
genvm-lint check contracts/clause_assessor.py --json
pytest tests/ -v
npm run check
npm run build
```

`npm run build` uses Next's Webpack compiler because the default Windows Turbopack path cannot package the browser inference runtime without symlink privileges.

## Studionet

Deploy this revised contract as a new Studionet instance. Call `assess_contract` with only a non-sensitive, redacted contract text. Confirm transaction execution result is `SUCCESS`; its output contains the findings and generated serial ID.

### Clause app connection

The app uses the free `genlayer-js` browser-wallet SDK. It does not hold a private key or need a paid backend. Create a local `.env.local` file from `.env.example`, then set the public address of the deployed `ClauseAssessor` instance:

```text
NEXT_PUBLIC_CLAUSE_CONTRACT_ADDRESS=0xYourDeployedContractAddress
```

Restart `npm run dev`. Clause first creates only a private redacted copy; it does not assess contract risk locally. To request the first and only assessment, the user must explicitly approve the exact public text that will be passed to `assess_contract`. The app waits for an `ACCEPTED` result with a successful execution return, then displays the on-chain report.

The standalone campaign package is in `contract-risk-assessor/`.
