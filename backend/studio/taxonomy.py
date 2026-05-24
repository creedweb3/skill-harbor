"""
Taxonomy v2 — primary domain, secondary tags, and tech-stack facets.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

# --- Primary domains (Discovery + main filters) ---

DOMAIN_CATEGORIES: dict[str, list[str]] = {
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
        "copilot",
        "tool use",
    ],
    "languages": [
        "python",
        "golang",
        " go ",
        "rust",
        "java",
        "kotlin",
        "csharp",
        "c#",
        "ruby",
        "php",
        "elixir",
        "language",
        "rules/python",
        "rules/go",
        "rules/rust",
        "rules/java",
    ],
    "web-frameworks": [
        "react",
        "next.js",
        "nextjs",
        "vue",
        "nuxt",
        "svelte",
        "astro",
        "remix",
        "angular",
        "frontend",
        "front-end",
        "vite",
        "webpack",
        "tailwind",
        "shadcn",
    ],
    "backend-apis": [
        "backend",
        " api ",
        "rest api",
        "api design",
        "api-design",
        "openapi",
        "swagger",
        "rest",
        "graphql",
        "grpc",
        "endpoint",
        "microservice",
        "node",
        "express",
        "fastapi",
        "django",
        "flask",
        "nestjs",
        "spring",
        "server",
    ],
    "testing-security": [
        "test",
        "testing",
        "vitest",
        "jest",
        "playwright",
        "cypress",
        "e2e",
        "tdd",
        "security",
        "owasp",
        "auth",
        "jwt",
        "oauth",
        "vulnerability",
        "audit",
    ],
    "devops-infra": [
        "devops",
        "docker",
        "kubernetes",
        "k8s",
        "ci/cd",
        "terraform",
        "aws",
        "azure",
        "github actions",
        "deployment",
        "infra",
    ],
    "design-ux": [
        "ui design",
        "ux design",
        "user experience",
        "user interface",
        "figma",
        "wireframe",
        "typography",
        "accessibility",
        "a11y",
        "brand voice",
        "design system",
        "visual design",
        "mockup",
    ],
    "growth-seo": [
        "seo",
        "marketing",
        "sitemap",
        "metadata",
        "opengraph",
        "aeo",
        "geo",
        "analytics",
        "conversion",
        "schema.org",
        "json-ld",
    ],
    "docs-workflow": [
        "documentation",
        "readme",
        "docs",
        "markdown",
        "code review",
        "pull request",
        "git",
        "changelog",
        "adr",
        "workflow",
        "conventional commit",
    ],
    "data-ml": [
        "data",
        "machine learning",
        "ml",
        "pandas",
        "numpy",
        "jupyter",
        "etl",
        "notebook",
        "sql",
        "postgres",
        "warehouse",
    ],
}

DOMAIN_LABELS: dict[str, str] = {
    "agent-ai": "AI & Agents",
    "languages": "Languages",
    "web-frameworks": "Web Frameworks",
    "backend-apis": "Backend & APIs",
    "testing-security": "Testing & Security",
    "devops-infra": "DevOps & Cloud",
    "design-ux": "Design & UX",
    "growth-seo": "Growth & SEO",
    "docs-workflow": "Docs & Workflow",
    "data-ml": "Data & ML",
}

DISCOVERY_PROFESSIONS: list[dict[str, str]] = [
    {"domain": d, "label": DOMAIN_LABELS[d]}
    for d in [
        "agent-ai",
        "languages",
        "web-frameworks",
        "backend-apis",
        "testing-security",
        "devops-infra",
        "design-ux",
        "growth-seo",
        "docs-workflow",
        "data-ml",
    ]
]

CATEGORY_GROUPS: list[dict[str, Any]] = [
    {
        "id": "build",
        "label": "Build & ship",
        "categories": [
            "languages",
            "web-frameworks",
            "backend-apis",
            "testing-security",
            "devops-infra",
        ],
    },
    {
        "id": "grow",
        "label": "Grow & design",
        "categories": ["design-ux", "growth-seo", "docs-workflow"],
    },
    {
        "id": "specialist",
        "label": "Specialist",
        "categories": ["agent-ai", "data-ml"],
    },
]

# Map v1 domain slugs and legacy manifest categories → v2 primary
DOMAIN_V1_TO_V2: dict[str, str] = {
    "web-development": "web-frameworks",
    "full-stack": "web-frameworks",
    "mobile-apps": "web-frameworks",
    "performance": "web-frameworks",
    "marketing-seo": "growth-seo",
    "product-design": "design-ux",
    "writing-docs": "docs-workflow",
    "database": "backend-apis",
    "crypto-web3": "backend-apis",
    "game-dev": "languages",
    "finance": "data-ml",
    "legal-compliance": "docs-workflow",
    "healthcare": "data-ml",
    "ecommerce": "growth-seo",
    "general": "docs-workflow",
    "frontend": "web-frameworks",
    "fullstack": "web-frameworks",
    "backend": "backend-apis",
    "seo": "growth-seo",
    "geo-aeo": "growth-seo",
    "gsc": "growth-seo",
    "design": "design-ux",
    "ui": "design-ux",
    "ux": "design-ux",
    "intelligence": "agent-ai",
    "claude": "agent-ai",
    "cursor": "agent-ai",
    "orchestrator": "agent-ai",
    "mobile-responsive": "web-frameworks",
    "mobile-native": "web-frameworks",
    "devops": "devops-infra",
    "security": "testing-security",
    "testing": "testing-security",
    "writing": "docs-workflow",
    "data": "data-ml",
    "crypto": "backend-apis",
}

TECH_STACK_TAGS: dict[str, list[str]] = {
    "python": ["python", ".py", "fastapi", "django", "flask", "pandas"],
    "typescript": ["typescript", ".ts", "tsx", "tsconfig"],
    "javascript": ["javascript", ".js", "nodejs", "node.js"],
    "go": ["golang", " go ", "rules/go", "-go-", "/go/"],
    "rust": ["rust", "rules/rust", "-rust-"],
    "java": ["java", "spring", "rules/java", "kotlin"],
    "csharp": ["csharp", "c#", ".cs", "dotnet"],
    "ruby": ["ruby", "rails", ".rb"],
    "php": ["php", "laravel", "wordpress"],
    "nextjs": ["next.js", "nextjs", "next.config"],
    "react": ["react", "jsx", "react-dom"],
    "vue": ["vue", "nuxt", "vue.config"],
    "svelte": ["svelte", "sveltekit"],
    "fastapi": ["fastapi"],
    "django": ["django"],
    "fastify": ["fastify"],
    "spring": ["spring boot", "springboot"],
    "prisma": ["prisma"],
    "tailwind": ["tailwind"],
    "playwright": ["playwright"],
    "vitest": ["vitest"],
    "graphql": ["graphql"],
    "docker": ["docker", "dockerfile"],
    "kubernetes": ["kubernetes", "k8s", "helm"],
}

TECH_STACK_LABELS: dict[str, str] = {
    "python": "Python",
    "typescript": "TypeScript",
    "javascript": "JavaScript",
    "go": "Go",
    "rust": "Rust",
    "java": "Java",
    "csharp": "C#",
    "ruby": "Ruby",
    "php": "PHP",
    "nextjs": "Next.js",
    "react": "React",
    "vue": "Vue",
    "svelte": "Svelte",
    "fastapi": "FastAPI",
    "django": "Django",
    "fastify": "Fastify",
    "spring": "Spring",
    "prisma": "Prisma",
    "tailwind": "Tailwind",
    "playwright": "Playwright",
    "vitest": "Vitest",
    "graphql": "GraphQL",
    "docker": "Docker",
    "kubernetes": "Kubernetes",
}

# Path segment → domain boost
_PATH_DOMAIN_HINTS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"rules/(python|py)-", re.I), "languages"),
    (re.compile(r"rules/(go|golang)-", re.I), "languages"),
    (re.compile(r"rules/(rust|java|ruby|php|csharp)-", re.I), "languages"),
    (re.compile(r"rules/(next|react|vue|svelte)-", re.I), "web-frameworks"),
    (re.compile(r"/skills/(react|next|vue|frontend)", re.I), "web-frameworks"),
    (re.compile(r"seo|sitemap|metadata", re.I), "growth-seo"),
    (re.compile(r"agent|mcp|prompt", re.I), "agent-ai"),
]

_PATH_TECH_HINTS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"rules/(python|py)-", re.I), "python"),
    (re.compile(r"rules/(go|golang)-", re.I), "go"),
    (re.compile(r"rules/(rust)-", re.I), "rust"),
    (re.compile(r"rules/(java)-", re.I), "java"),
    (re.compile(r"rules/(next|nextjs)-", re.I), "nextjs"),
    (re.compile(r"rules/(react)-", re.I), "react"),
    (re.compile(r"skills/react", re.I), "react"),
    (re.compile(r"skills/next", re.I), "nextjs"),
    (re.compile(r"fastapi", re.I), "fastapi"),
    (re.compile(r"django", re.I), "django"),
    (re.compile(r"fastify", re.I), "fastify"),
    (re.compile(r"playwright", re.I), "playwright"),
    (re.compile(r"vitest", re.I), "vitest"),
]

ASSET_TYPE_LABELS: dict[str, str] = {
    "skill": "Skill",
    "rule": "Rule",
    "command": "Command",
    "agent": "Subagent",
    "agents_md": "Agents doc",
}


@dataclass
class ClassifyResult:
    primary_domain: str
    secondary_domains: list[str]


def all_domain_categories() -> list[str]:
    return sorted(DOMAIN_CATEGORIES.keys())


def slugify_category(text: str) -> str:
    text = text.lower().strip()
    text = re.sub(r"[^a-z0-9]+", "-", text)
    return (text[:48] or "docs-workflow").strip("-")


def normalize_domain(slug: str) -> str:
    s = slug.lower().replace("_", "-").strip()
    if s in DOMAIN_CATEGORIES:
        return s
    if s in DOMAIN_V1_TO_V2:
        return DOMAIN_V1_TO_V2[s]
    if s.startswith("topic-"):
        return "docs-workflow"
    return DOMAIN_V1_TO_V2.get(s, s if s in DOMAIN_CATEGORIES else "docs-workflow")


def extract_skill_metadata(text: str) -> dict[str, str]:
    meta: dict[str, str] = {}
    if not text.startswith("---"):
        return meta
    m = re.match(r"^---\s*\n(.*?)\n---", text, re.S)
    if not m:
        return meta
    for line in m.group(1).splitlines():
        if ":" in line:
            key, val = line.split(":", 1)
            meta[key.strip().lower()] = val.strip()
    return meta


def build_classification_blob(
    text: str, path: str, manifest_category: str | None = None
) -> tuple[str, str]:
    """Rich blob for classification: path + YAML frontmatter + body sample."""
    path_norm = path.replace("\\", "/").lower()
    meta = extract_skill_metadata(text)
    meta_parts = [f"{k} {v}" for k, v in meta.items()]
    body = text
    if text.startswith("---"):
        parts = re.split(r"^---\s*$", text, maxsplit=2, flags=re.M)
        if len(parts) >= 3:
            body = parts[2]
    body_sample = re.sub(r"```[\s\S]*?```", " ", body)[:8000]
    blob = "\n".join(
        [
            path_norm,
            " ".join(meta_parts),
            body_sample,
            manifest_category or "",
        ]
    ).lower()
    return blob, path_norm


# Strong signals for one domain only (avoid "api design" → design-ux).
_DOMAIN_DISAMBIGUATION: list[tuple[re.Pattern[str], str, float]] = [
    (re.compile(r"\bapi[- ]?design\b", re.I), "backend-apis", 12.0),
    (re.compile(r"\b(rest|graphql|grpc|openapi|swagger)\b.*\bapi\b", re.I), "backend-apis", 8.0),
    (re.compile(r"\bapi\b.*\b(rest|graphql|grpc|endpoint|schema)\b", re.I), "backend-apis", 8.0),
    (re.compile(r"\b(figma|wireframe|a11y|accessibility|brand voice|design system)\b", re.I), "design-ux", 10.0),
    (re.compile(r"\b(ui|ux)\s+(design|research|audit)\b", re.I), "design-ux", 9.0),
    (re.compile(r"\bseo\b|\baeo\b|\bjson-ld\b", re.I), "growth-seo", 8.0),
    (re.compile(r"\bplaywright\b|\bvitest\b|\bowasp\b", re.I), "testing-security", 7.0),
]


def _score_domains(blob: str, path: str, manifest_category: str | None) -> list[tuple[str, float]]:
    scores: list[tuple[str, float]] = []
    for domain, keywords in DOMAIN_CATEGORIES.items():
        hits = 0
        for kw in keywords:
            if len(kw.strip()) <= 4 and not kw.startswith(" "):
                if re.search(rf"\b{re.escape(kw.strip())}\b", blob):
                    hits += 1
            elif kw in blob:
                hits += 1
        if hits:
            scores.append((domain, float(hits) * 2.0))
    for pattern, domain in _PATH_DOMAIN_HINTS:
        if pattern.search(path) or pattern.search(blob):
            scores.append((domain, 3.5))
    if manifest_category:
        mc = normalize_domain(manifest_category.lower().replace("_", "-"))
        if mc in DOMAIN_CATEGORIES:
            scores.append((mc, 2.5))
    return scores


def _apply_domain_disambiguation(blob: str, merged: dict[str, float]) -> None:
    for pattern, domain, boost in _DOMAIN_DISAMBIGUATION:
        if pattern.search(blob):
            merged[domain] = merged.get(domain, 0) + boost
    # "api design" / backend API context — suppress visual-design bucket
    if merged.get("backend-apis", 0) >= 6 and merged.get("design-ux", 0) > 0:
        if not re.search(r"\b(figma|wireframe|a11y|brand voice|design system|ui kit)\b", blob, re.I):
            merged["design-ux"] = merged["design-ux"] * 0.15


def classify_asset(
    text: str, path: str = "", manifest_category: str | None = None
) -> ClassifyResult:
    """Assign exactly one primary domain per asset (no secondary overlap)."""
    blob, path_norm = build_classification_blob(text, path, manifest_category)
    scores = _score_domains(blob, path_norm, manifest_category)

    if not scores:
        return ClassifyResult("docs-workflow", [])

    merged: dict[str, float] = {}
    for domain, score in scores:
        d = normalize_domain(domain)
        merged[d] = merged.get(d, 0) + score

    _apply_domain_disambiguation(blob, merged)

    ranked = sorted(merged.items(), key=lambda x: x[1], reverse=True)
    primary = ranked[0][0]
    return ClassifyResult(primary, [])


def classify_tech_tags(text: str, path: str = "", limit: int = 5) -> list[str]:
    blob, path_norm = build_classification_blob(text, path)
    scores: dict[str, float] = {}

    for tag, keywords in TECH_STACK_TAGS.items():
        hits = sum(1 for kw in keywords if kw in blob or kw in path_norm)
        if hits:
            scores[tag] = scores.get(tag, 0) + float(hits)

    for pattern, tag in _PATH_TECH_HINTS:
        if pattern.search(path_norm) or pattern.search(blob):
            scores[tag] = scores.get(tag, 0) + 3.0

    if not scores:
        return []

    ranked = sorted(scores.items(), key=lambda x: x[1], reverse=True)
    return [t for t, _ in ranked[:limit]]


def classify_domains(text: str, path: str = "", manifest_category: str | None = None) -> list[str]:
    """Backward-compatible: single domain only."""
    r = classify_asset(text, path, manifest_category)
    return [r.primary_domain]


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
    if not categories:
        return []
    out: set[str] = set()
    for sel in categories:
        out.add(normalize_domain(sel))
        out.add(sel)
    return list(out)


_LEGACY_TO_DOMAIN: dict[str, str] = {
    k: normalize_domain(v) for k, v in DOMAIN_V1_TO_V2.items()
}
