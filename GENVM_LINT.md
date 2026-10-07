GenVM Lint


GenVM Lint
Static analysis and validation for GenLayer intelligent contracts. Always lint before testing.

Commands
Command	What It Does	Speed
genvm-lint check	Lint + validate (recommended)	~250ms
genvm-lint lint	AST checks only	~50ms
genvm-lint validate	SDK semantic checks	~200ms
genvm-lint schema	Extract ABI	~100ms
genvm-lint typecheck	Pyright/Pylance type checking	~1s
What It Catches
Forbidden imports: os, sys, subprocess, random
Non-deterministic patterns: bare float operations
Type validity: TreeMap, DynArray, Address usage
Decorator correctness: @gl.public.view, @gl.public.write
Storage field types: no dict/list in state
Agent Workflow
1. Run check with --json
2. Parse errors
3. Fix iteratively
4. Re-run until ok=true
Exit Codes
0 — All checks passed
1 — Lint or validation errors
2 — Contract file not found
3 — SDK download failed
Install: pip install genvm-linter