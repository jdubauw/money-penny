export function Brand() {
  return (
    <div className="brand" aria-label="Money Penny">
      <span className="brand-mark" aria-hidden="true">
        <svg viewBox="0 0 32 32" fill="none">
          <path
            d="M11 24V8h7a6 6 0 0 1 0 12h-7"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M7 13h12M7 17h12"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </span>
      <span className="brand-name">
        money<span className="font-normal text-muted-foreground">penny</span>
      </span>
    </div>
  );
}
