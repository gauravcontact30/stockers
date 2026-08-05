export function LogoMark({
  size = 40,
  className = "",
  gradientId = "stockers-logo-gradient",
}: {
  size?: number;
  className?: string;
  gradientId?: string;
}) {
  const glossId = `${gradientId}-gloss`;
  const sparkId = `${gradientId}-spark`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`shrink-0 ${className}`}
      role="img"
      aria-label="Stockers.AI"
    >
      <rect width="40" height="40" rx="11" fill={`url(#${gradientId})`} />
      <rect width="40" height="40" rx="11" fill={`url(#${glossId})`} />
      <rect x="0.75" y="0.75" width="38.5" height="38.5" rx="10.25" stroke="white" strokeOpacity="0.14" />

      <path
        d="M7.5 27L14.5 19.5L19.5 23.5L27.5 14"
        stroke="white"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M22.5 14H28.5V20" stroke="white" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="7.5" cy="27" r="1.9" fill="white" />
      <circle cx="19.5" cy="23.5" r="1.9" fill="white" />

      <path
        d="M31.5 24.5L32.4 26.6L34.5 27.5L32.4 28.4L31.5 30.5L30.6 28.4L28.5 27.5L30.6 26.6L31.5 24.5Z"
        fill={`url(#${sparkId})`}
      />

      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
          <stop stopColor="#34d399" />
          <stop offset="0.55" stopColor="#10b981" />
          <stop offset="1" stopColor="#065f46" />
        </linearGradient>
        <linearGradient id={glossId} x1="20" y1="0" x2="20" y2="22" gradientUnits="userSpaceOnUse">
          <stop stopColor="white" stopOpacity="0.16" />
          <stop offset="1" stopColor="white" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={sparkId} x1="28.5" y1="24.5" x2="34.5" y2="30.5" gradientUnits="userSpaceOnUse">
          <stop stopColor="#fef08a" />
          <stop offset="1" stopColor="#fbbf24" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`font-semibold tracking-tight ${className}`}>
      <span className="text-slate-900 dark:text-white">Stockers</span>
      <span className="bg-gradient-to-r from-emerald-500 to-teal-500 bg-clip-text text-transparent dark:from-emerald-400 dark:to-teal-300">
        .AI
      </span>
    </span>
  );
}

export function Logo({
  size = 40,
  showWordmark = true,
  showTagline = false,
  stacked = false,
  wordmarkClassName = "text-xl",
  gradientId,
}: {
  size?: number;
  showWordmark?: boolean;
  showTagline?: boolean;
  stacked?: boolean;
  wordmarkClassName?: string;
  gradientId?: string;
}) {
  if (stacked) {
    return (
      <span className="flex flex-col items-center gap-1.5">
        <LogoMark size={size} gradientId={gradientId} />
        {showWordmark && (
          <span className="flex flex-col items-center leading-none">
            <Wordmark className={wordmarkClassName} />
            {showTagline && (
              <span className="mt-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400 dark:text-slate-500">
                AI Market Research
              </span>
            )}
          </span>
        )}
      </span>
    );
  }

  return (
    <span className="flex items-center gap-3">
      <LogoMark size={size} gradientId={gradientId} />
      {showWordmark && (
        <span className="flex flex-col leading-none">
          <Wordmark className={wordmarkClassName} />
          {showTagline && (
            <span className="mt-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400 dark:text-slate-500">
              AI Market Research
            </span>
          )}
        </span>
      )}
    </span>
  );
}
