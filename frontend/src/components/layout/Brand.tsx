export function Brand() {
  return (
    <header className="brand">
      <div className="brand-mark" aria-hidden>
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M12 2L14.2 9.8L22 12L14.2 14.2L12 22L9.8 14.2L2 12L9.8 9.8L12 2Z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <div>
        <h1>Skill Harbor</h1>
        <p>Agent skills marketplace — Cursor, Claude, Codex, Gemini & more</p>
      </div>
    </header>
  );
}
