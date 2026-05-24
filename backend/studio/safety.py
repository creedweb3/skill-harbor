"""Registry safety verification — block suspicious or harmful skill/rule content."""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

# Path traversal — install names must be single path segments
_UNSAFE_INSTALL_NAME = re.compile(r"[\x00/\\]|(?:\.\.)")

# GitHub / bearer tokens and config-style secret assignments
_SECRET_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"\bgh[pousr]_[A-Za-z0-9]{20,}\b"), "ghp_[REDACTED]"),
    (re.compile(r"\bgithub_pat_[A-Za-z0-9_]{20,}\b"), "github_pat_[REDACTED]"),
    (re.compile(r"\bBearer\s+[^\s\"']+", re.I), "Bearer [REDACTED]"),
    (re.compile(r"\bAuthorization:\s*[^\s\"']+", re.I), "Authorization: [REDACTED]"),
    (
        re.compile(
            r"(?i)(GITHUB_TOKEN|GH_TOKEN|SKILL_HARBOR_ADMIN(?:_GITHUB)?_TOKEN)\s*[=:]\s*[^\s\"']+"
        ),
        r"\1=[REDACTED]",
    ),
    (re.compile(r"(?i)(admin_)?github_token[\"']?\s*[:=]\s*[\"']?[^\s\"',}]+"), "[token redacted]"),
]

# High-confidence block patterns (case-insensitive)
_BLOCK_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"\b(ignore|disregard)\s+(all\s+)?(previous|prior)\s+instructions\b", re.I), "prompt_injection"),
    (re.compile(r"\b(bypass|disable|turn off)\s+(safety|security|guardrails?)\b", re.I), "safety_bypass"),
    (re.compile(r"\b(exfiltrat|steal|harvest)\s+.{0,40}(password|credential|api[_\s-]?key|secret|token)\b", re.I), "credential_theft"),
    (re.compile(r"\b(ransomware|keylogger|rootkit|botnet|malware|trojan)\b", re.I), "malware"),
    (re.compile(r"\b(ddos|denial.of.service)\s+attack\b", re.I), "attack"),
    (re.compile(r"\b(sql\s+injection|xss)\s+payload\b", re.I), "exploit_payload"),
    (re.compile(r"\b(phishing|scam|pump.and.dump)\b", re.I), "fraud"),
    (re.compile(r"\b(generate|create)\s+.{0,30}(fake|forged)\s+.{0,20}(id|passport|document)\b", re.I), "forgery"),
    (re.compile(r"\b(hack|crack)\s+.{0,25}(password|account|wifi)\b", re.I), "unauthorized_access"),
    (re.compile(r"\bchild\s+(porn|abuse)|csam\b", re.I), "illegal_content"),
    (re.compile(r"\b(sell|buy)\s+.{0,20}(drugs|weapons|firearms)\b", re.I), "illegal_trade"),
    (re.compile(r"curl\s+[^\n|]+\s*\|\s*(ba)?sh\b", re.I), "pipe_to_shell"),
    (re.compile(r"wget\s+[^\n]+\s*-\s*O\s*-\s*\|\s*(ba)?sh", re.I), "pipe_to_shell"),
    (re.compile(r"\beval\s*\(\s*base64", re.I), "obfuscated_exec"),
    (re.compile(r"powershell\s+(-enc|-encodedcommand)\b", re.I), "encoded_powershell"),
    (re.compile(r"\brm\s+-rf\s+(/|~|\$HOME)", re.I), "destructive_command"),
    (re.compile(r"\bformat\s+[a-z]:\s*/", re.I), "destructive_command"),
    (re.compile(r"\bchmod\s+777\s+/", re.I), "insecure_permissions"),
    (re.compile(r"\b(nc|netcat)\s+.*-e\s+/bin/(ba)?sh\b", re.I), "reverse_shell"),
    (re.compile(r"\bupload\s+.{0,30}(env|\.ssh|id_rsa|credentials)\b", re.I), "data_exfiltration"),
    (re.compile(r"\bpost\s+.{0,20}(webhook|discord\.com/api/webhooks)\b", re.I), "exfil_webhook"),
    (re.compile(r"\$\{?\s*env\.[A-Z_]*(KEY|TOKEN|SECRET|PASSWORD)", re.I), "env_secret_harvest"),
    (re.compile(r"BEGIN\s+(RSA\s+)?PRIVATE\s+KEY", re.I), "embedded_private_key"),
    (re.compile(r"\b(install|run)\s+.{0,20}(without|no)\s+(user\s+)?consent\b", re.I), "non_consensual_action"),
]

_WARN_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"\bno\s+ethical\s+constraints\b", re.I), "unethical_framing"),
    (re.compile(r"\bunfiltered\s+mode\b", re.I), "unfiltered_mode"),
    (re.compile(r"\bjailbreak\b", re.I), "jailbreak"),
    (re.compile(r"\bdan\s+mode\b", re.I), "jailbreak"),
    (re.compile(r"\bDAN\b.*\bdo anything now\b", re.I), "jailbreak"),
    (re.compile(r"\balways\s+approve\b", re.I), "approval_bypass"),
    (re.compile(r"\bnever\s+(ask|confirm|warn)\b", re.I), "safety_disable_hint"),
    (re.compile(r"`curl\s+http", re.I), "remote_fetch"),
    (re.compile(r"\bsudo\s+rm\b", re.I), "privileged_delete"),
    (re.compile(r"\bexec\s*\(", re.I), "dynamic_exec"),
]

_MIN_BODY_LEN = 40
_MAX_BODY_LEN = 400_000


@dataclass
class SafetyResult:
    safe: bool
    reason: str = ""
    warnings: list[str] = field(default_factory=list)
    checked_at: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "safe": self.safe,
            "reason": self.reason,
            "warnings": self.warnings,
            "verdict": "pass" if self.safe else "block",
        }


def assess_content_safety(text: str, path: str = "") -> SafetyResult:
    """Return whether asset content is safe to install and list in the registry."""
    from datetime import datetime, timezone

    checked = datetime.now(timezone.utc).isoformat()
    if not text or not text.strip():
        return SafetyResult(True, "", [], checked)

    if len(text) > _MAX_BODY_LEN:
        return SafetyResult(False, "content_too_large", [], checked)

    blob = f"{path}\n{text}"
    blob_lower = blob.lower()

    if re.search(r"TODO:\s*fill\s+in|lorem\s+ipsum|your\s+skill\s+here", blob_lower):
        if len(text.strip()) < 200:
            return SafetyResult(False, "placeholder_template", [], checked)

    for pattern, reason in _BLOCK_PATTERNS:
        if pattern.search(blob):
            return SafetyResult(False, reason, [], checked)

    warnings: list[str] = []
    for pattern, label in _WARN_PATTERNS:
        if pattern.search(blob):
            warnings.append(label)

    if len(warnings) >= 2:
        return SafetyResult(False, "multiple_risk_signals", warnings, checked)

    if warnings and re.search(r"\bignore\s+.{0,20}instructions\b", blob_lower):
        return SafetyResult(False, "jailbreak_combo", warnings, checked)

    return SafetyResult(True, "", warnings, checked)


def safety_for_asset_dict(asset: dict[str, Any]) -> dict[str, Any]:
    text = asset.get("content") or asset.get("content_preview") or ""
    path = asset.get("source_path") or asset.get("path") or ""
    return assess_content_safety(text, path).to_dict()


def validate_install_name(name: str) -> str:
    """Reject install names that could escape platform install roots."""
    if not name or not str(name).strip():
        raise ValueError("Install name is empty")
    clean = str(name).strip()
    if clean in (".", ".."):
        raise ValueError(f"Unsafe install name: {clean!r}")
    if _UNSAFE_INSTALL_NAME.search(clean):
        raise ValueError(f"Unsafe install name (path traversal): {clean!r}")
    return clean


def assert_path_under_root(path: Path, root: Path) -> Path:
    """Resolve path and ensure it stays within root (blocks symlink escape)."""
    resolved = path.resolve()
    root_resolved = root.resolve()
    try:
        resolved.relative_to(root_resolved)
    except ValueError as exc:
        raise ValueError(
            f"Install path escapes allowed root: {resolved} is not under {root_resolved}"
        ) from exc
    return resolved


def redact_secrets(text: str) -> str:
    """Remove GitHub tokens and auth material from strings destined for logs."""
    if not text:
        return text
    out = text
    for pattern, replacement in _SECRET_PATTERNS:
        out = pattern.sub(replacement, out)
    return out


def sanitize_for_log(text: str) -> str:
    """Alias for activity/sync log sanitization."""
    return redact_secrets(text)


def require_safe_for_install(text: str, path: str = "", install_name: str = "") -> None:
    result = assess_content_safety(text, path)
    if not result.safe:
        label = install_name or path or "asset"
        raise ValueError(
            f"Blocked install for “{label}”: safety check failed ({result.reason}). "
            "Review content in the inspector before overriding."
        )


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
