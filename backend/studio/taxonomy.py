"""
Profession- and discipline-oriented taxonomy for the skills marketplace.
"""

from __future__ import annotations

import re
from typing import Any

# Primary marketplace domains (what users shop by)
DOMAIN_CATEGORIES: dict[str, list[str]] = {
    "web-development": [
        "web dev",
        "website",
        "html",
        "css",
        "javascript",
        "typescript",
        "react",
        "vue",
        "svelte",
        "next.js",
        "nextjs",
        "vite",
        "frontend",
        "front-end",
    ],
    "full-stack": [
        "fullstack",
        "full-stack",
        "full stack",
        "mern",
        "t3",
        "remix",
        "nuxt",
        "monorepo",
    ],
    "backend-apis": [
        "backend",
        "api",
        "rest",
        "graphql",
        "node",
        "express",
        "fastapi",
        "django",
        "nestjs",
        "microservice",
        "server",
    ],
    "mobile-apps": [
        "mobile",
        "react native",
        "expo",
        "ios",
        "android",
        "pwa",
        "flutter",
        "capacitor",
    ],
    "marketing-seo": [
        "seo",
        "marketing",
        "content",
        "copywriting",
        "sitemap",
        "metadata",
        "aeo",
        "geo",
        "analytics",
        "conversion",
    ],
    "product-design": [
        "design",
        "ui",
        "ux",
        "figma",
        "wireframe",
        "typography",
        "accessibility",
        "a11y",
        "brand",
        "design system",
    ],
    "data-ml": [
        "data",
        "machine learning",
        "ml",
        "pandas",
        "numpy",
        "jupyter",
        "etl",
        "analytics",
        "sql",
        "postgres",
    ],
    "devops-infra": [
        "devops",
        "docker",
        "kubernetes",
        "ci/cd",
        "terraform",
        "aws",
        "azure",
        "github actions",
        "deployment",
    ],
    "crypto-web3": [
        "crypto",
        "web3",
        "blockchain",
        "solidity",
        "ethereum",
        "defi",
        "nft",
        "smart contract",
        "wallet",
    ],
    "agent-ai": [
        "agent",
        "llm",
        "claude",
        "cursor",
        "mcp",
        "prompt",
        "rag",
        "openai",
        "anthropic",
        "orchestrator",
        "subagent",
    ],
    "database": [
        "database",
        "postgres",
        "mysql",
        "mongodb",
        "redis",
        "prisma",
        "supabase",
        "migration",
        "orm",
    ],
    "performance": [
        "performance",
        "lighthouse",
        "core web vitals",
        "optimization",
        "bundle",
        "lazy load",
    ],
    "game-dev": [
        "game",
        "unity",
        "unreal",
        "godot",
        "gamedev",
    ],
    "writing-docs": [
        "documentation",
        "technical writing",
        "readme",
        "docs",
        "markdown",
    ],
    "finance": [
        "finance",
        "fintech",
        "trading",
        "accounting",
        "spreadsheet",
    ],
    "legal-compliance": [
        "legal",
        "compliance",
        "gdpr",
        "privacy",
        "contract",
    ],
    "healthcare": [
        "healthcare",
        "medical",
        "hipaa",
        "clinical",
    ],
    "ecommerce": [
        "ecommerce",
        "shopify",
        "woocommerce",
        "stripe",
        "checkout",
        "cart",
    ],
}

# UI grouping for filters
CATEGORY_GROUPS: list[dict[str, Any]] = [
    {
        "id": "build",
        "label": "Build & ship",
        "categories": [
            "web-development",
            "full-stack",
            "backend-apis",
            "mobile-apps",
            "database",
            "devops-infra",
            "performance",
        ],
    },
    {
        "id": "grow",
        "label": "Grow & design",
        "categories": ["marketing-seo", "product-design", "ecommerce", "writing-docs"],
    },
    {
        "id": "specialist",
        "label": "Specialist",
        "categories": [
            "agent-ai",
            "crypto-web3",
            "data-ml",
            "game-dev",
            "finance",
            "legal-compliance",
            "healthcare",
        ],
    },
]

ASSET_TYPE_LABELS: dict[str, str] = {
    "skill": "Skill",
    "rule": "Rule",
    "command": "Command",
    "agent": "Subagent",
    "agents_md": "Agents doc",
}


def all_domain_categories() -> list[str]:
    return sorted(DOMAIN_CATEGORIES.keys())


def slugify_category(text: str) -> str:
    text = text.lower().strip()
    text = re.sub(r"[^a-z0-9]+", "-", text)
    return (text[:48] or "general").strip("-")


def classify_domains(text: str, path: str = "", manifest_category: str | None = None) -> list[str]:
    """Return 1–3 domain slugs; create a dynamic slug if nothing matches."""
    blob = f"{path}\n{text}\n{manifest_category or ''}".lower()
    scores: list[tuple[str, float]] = []
    for domain, keywords in DOMAIN_CATEGORIES.items():
        hits = sum(1 for kw in keywords if kw in blob)
        if hits:
            scores.append((domain, float(hits)))
    if manifest_category:
        mc = manifest_category.lower().replace("_", "-")
        legacy_map = _LEGACY_TO_DOMAIN.get(mc, mc)
        if legacy_map in DOMAIN_CATEGORIES and legacy_map not in [s[0] for s in scores]:
            scores.append((legacy_map, 2.0))

    if not scores:
        token = re.search(r"name:\s*([a-z0-9-]+)", blob)
        if token:
            return [f"topic-{slugify_category(token.group(1))}"]
        return ["general"]

    scores.sort(key=lambda x: x[1], reverse=True)
    top = scores[0][1]
    primary = [d for d, s in scores if s >= max(1.0, top * 0.45)]
    return primary[:3]


def detect_asset_type(path: str) -> str:
    lower = path.replace("\\", "/").lower()
    name = path.split("/")[-1].lower()
    if "subagent" in lower or "/agents/" in lower and name.endswith(".md") and "skill" not in lower:
        return "agent"
    if name == "skill.md" or "/skills/" in lower and name.endswith(".md"):
        return "skill"
    if name.endswith(".mdc") or ".cursor/rules" in lower or name == ".cursorrules":
        return "rule"
    if "/commands/" in lower and name.endswith(".md"):
        return "command"
    if "/agents/" in lower and name.endswith(".md"):
        return "agent"
    if name == "agents.md":
        return "agents_md"
    if "orchestrat" in lower or "sub-agent" in lower:
        return "agent"
    return "skill"


def expand_category_filter(categories: list[str]) -> list[str]:
    """Map marketplace domains to legacy manifest category ids."""
    if not categories:
        return []
    out: set[str] = set(categories)
    for sel in categories:
        for legacy, domain in _LEGACY_TO_DOMAIN.items():
            if sel == domain:
                out.add(legacy)
            if sel == legacy:
                out.add(domain)
    return list(out)


_LEGACY_TO_DOMAIN: dict[str, str] = {
    "frontend": "web-development",
    "fullstack": "full-stack",
    "backend": "backend-apis",
    "seo": "marketing-seo",
    "geo-aeo": "marketing-seo",
    "gsc": "marketing-seo",
    "design": "product-design",
    "ui": "product-design",
    "ux": "product-design",
    "intelligence": "agent-ai",
    "claude": "agent-ai",
    "cursor": "agent-ai",
    "orchestrator": "agent-ai",
    "mobile-responsive": "mobile-apps",
    "mobile-native": "mobile-apps",
    "database": "database",
    "performance": "performance",
}
