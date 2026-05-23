"""Registry safety verification — block suspicious or harmful skill/rule content."""

from __future__ import annotations

import re
from dataclasses import dataclass

# High-confidence block patterns (case-insensitive)
_BLOCK_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"\b(ignore|disregard)\s+(all\s+)?(previous|prior)\s+instructions\b", re.I), "prompt_injection"),
    (re.compile(r"\b(bypass|disable|turn off)\s+(safety|security|guardrails?)\b", re.I), "safety_bypass"),
    (re.compile(r"\b(exfiltrat|steal|harvest)\s+.{0,40}(password|credential|api[_\s-]?key|secret|token)\b", re.I), "credential_theft"),
    (re.compile(r"\b(ransomware|keylogger|rootkit|botnet|malware)\b", re.I), "malware"),
    (re.compile(r"\b(ddos|denial.of.service)\s+attack\b", re.I), "attack"),
    (re.compile(r"\b(sql\s+injection|xss)\s+payload\b", re.I), "exploit_payload"),
    (re.compile(r"\b(phishing|scam|pump.and.dump)\b", re.I), "fraud"),
    (re.compile(r"\b(generate|create)\s+.{0,30}(fake|forged)\s+.{0,20}(id|passport|document)\b", re.I), "forgery"),
    (re.compile(r"\b(hack|crack)\s+.{0,25}(password|account|wifi)\b", re.I), "unauthorized_access"),
    (re.compile(r"\bchild\s+(porn|abuse)|csam\b", re.I), "illegal_content"),
    (re.compile(r"\b(sell|buy)\s+.{0,20}(drugs|weapons|firearms)\b", re.I), "illegal_trade"),
]

# Softer signals — block only when multiple hit or with block pattern context
_WARN_PATTERNS: list[re.Pattern[str]] = [
    re.compile(r"\bno\s+ethical\s+constraints\b", re.I),
    re.compile(r"\bunfiltered\s+mode\b", re.I),
    re.compile(r"\bjailbreak\b", re.I),
    re.compile(r"\bdan\s+mode\b", re.I),
]

_MIN_BODY_LEN = 40
_MAX_BODY_LEN = 400_000


@dataclass
class SafetyResult:
    safe: bool
    reason: str = ""


def assess_content_safety(text: str, path: str = "") -> SafetyResult:
    """Return whether asset content is safe to list in the public registry."""
    if not text or not text.strip():
        return SafetyResult(True, "")

    if len(text) > _MAX_BODY_LEN:
        return SafetyResult(False, "content_too_large")

    blob = f"{path}\n{text}".lower()

    if re.search(r"TODO:\s*fill\s+in|lorem\s+ipsum|your\s+skill\s+here", blob):
        if len(text.strip()) < 200:
            return SafetyResult(False, "placeholder_template")

    for pattern, reason in _BLOCK_PATTERNS:
        if pattern.search(blob):
            return SafetyResult(False, reason)

    warn_hits = sum(1 for p in _WARN_PATTERNS if p.search(blob))
    if warn_hits >= 2:
        return SafetyResult(False, "multiple_risk_signals")

    if warn_hits >= 1 and re.search(r"\bignore\s+.{0,20}instructions\b", blob):
        return SafetyResult(False, "jailbreak_combo")

    return SafetyResult(True, "")


def purge_unsafe_assets() -> dict[str, int]:
    """Remove registry rows that fail safety re-check on stored content."""
    from studio.database import get_connection

    removed = 0
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT id, path, content, content_preview FROM assets WHERE source_type != 'custom'"
        ).fetchall()
        for row in rows:
            text = row["content"] or row["content_preview"] or ""
            if not text.strip():
                continue
            result = assess_content_safety(text, row["path"] or "")
            if not result.safe:
                conn.execute("DELETE FROM assets WHERE id = ?", (row["id"],))
                removed += 1
        conn.commit()
    return {"removed": removed}
