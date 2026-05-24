# Skill Harbor — Safety verification

Harbor scans every asset before it enters the registry and again at **install time**.

## What we check

Pattern-based analysis (no external API) for:

- Prompt injection (“ignore previous instructions”)
- Safety / guardrail bypass
- Credential theft and env secret harvesting
- Malware, reverse shells, pipe-to-shell (`curl | bash`)
- Destructive commands (`rm -rf /`, encoded PowerShell)
- Fraud, illegal content, and similar high-risk phrases

Assets with **warnings only** may still install; **blocked** assets cannot install and show a red **Blocked** badge.

## CLI

```powershell
python scripts/verify_registry_safety.py
python scripts/verify_registry_safety.py --purge
python scripts/verify_registry_safety.py --json
```

## API

- `GET /api/safety/verify` — purge unsafe rows from `harbor.db`
- Each catalog asset includes a `safety` object: `{ safe, reason, warnings, verdict }`

Registry ingest (`registry_expand`, `registry_evolve`) already calls `assess_content_safety`; install uses `require_safe_for_install`.

**Note:** This is heuristic scanning, not a substitute for reviewing source repos yourself. Custom/private skills should always be inspected before install.
