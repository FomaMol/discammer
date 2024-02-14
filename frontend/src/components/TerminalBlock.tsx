interface TerminalBlockProps {
  title: string;
  content?: string;
  dangerouslySetInnerHTML?: { __html: string };
}

export default function TerminalBlock({ title, content, dangerouslySetInnerHTML }: TerminalBlockProps) {
  const hasHtml = dangerouslySetInnerHTML && dangerouslySetInnerHTML.__html.trim().length > 0;
  const hasContent = content && content.trim().length > 0;

  return (
    <div className="bg-bg-panel border border-border-default rounded-md overflow-hidden">
      {/* Title bar */}
      <div className="flex items-center gap-2 px-4 py-2 bg-bg-secondary border-b border-border-default">
        <span className="text-accent-red text-xs">&#9679;</span>
        <span className="text-accent-amber text-xs">&#9679;</span>
        <span className="text-accent-green text-xs">&#9679;</span>
        <span
          className="ml-2 text-text-secondary text-xs uppercase tracking-widest"
          style={{ fontFamily: '"JetBrains Mono", monospace' }}
        >
          {title}
        </span>
      </div>
      {/* Content */}
      <div className="border-l-2 border-accent-cyan p-4">
        {hasHtml ? (
          <div
            className="text-text-primary text-sm leading-relaxed"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}
            dangerouslySetInnerHTML={dangerouslySetInnerHTML}
          />
        ) : hasContent ? (
          <p
            className="text-[#aab2c4] text-sm leading-relaxed"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}
          >
            {content}
          </p>
        ) : (
          <div
            className="text-text-muted text-sm"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}
          >
            &gt; _
          </div>
        )}
      </div>
    </div>
  );
}
