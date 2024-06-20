import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { currentLang, makeTranslator, type Locale } from '../utils/i18n';

/**
 * SearchConsole — progressive enhancement of the SSR search form in
 * search.html. The server renders a real <form method="get"> plus the result
 * list; this island takes over with a debounced, abortable /api/search fetch,
 * arrow-key result navigation, and a polite aria-live result count.
 *
 * Security: ``snippet_html`` from /api/search is the ONLY value passed to
 * dangerouslySetInnerHTML. The server produces it by HTML-escaping the raw
 * snippet FIRST and only THEN swapping the highlight markers for
 * <mark>/</mark>, so no content angle bracket can survive as a live tag.
 */

interface SearchResult {
  kind: 'post' | 'guide';
  slug: string;
  title: string;
  snippet_html: string;
}

interface SearchConsoleProps {
  lang?: Locale;
  query?: string;
  apiPath?: string;
  placeholder?: string;
  submitLabel?: string;
  inputLabel?: string;
  noResultsLabel?: string;
  postBadge?: string;
  guideBadge?: string;
}

const DEBOUNCE_MS = 200;

function resultHref(lang: Locale, r: SearchResult): string {
  const seg = r.kind === 'guide' ? 'guide' : 'journal';
  return `/${lang}/${seg}/${r.slug}`;
}

export default function SearchConsole({
  lang: langProp,
  query: initialQuery = '',
  apiPath = '/api/search',
  placeholder,
  submitLabel,
  inputLabel,
  noResultsLabel,
  postBadge,
  guideBadge,
}: SearchConsoleProps) {
  const lang = currentLang(langProp);
  const tr = makeTranslator('search');

  const resolvedPlaceholder = placeholder ?? tr('placeholder');
  const resolvedSubmit = submitLabel ?? tr('submit');
  const resolvedInputLabel = inputLabel ?? tr('input_label');
  const resolvedNoResults = noResultsLabel ?? tr('no_results');
  const resolvedPostBadge = postBadge ?? tr('badge_post');
  const resolvedGuideBadge = guideBadge ?? tr('badge_guide');

  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [active, setActive] = useState(-1); // -1 = no roving selection
  const [searched, setSearched] = useState(initialQuery.trim().length > 0);

  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const listboxId = useId();

  // Debounced, abortable fetch. A blank query clears results without a request.
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      abortRef.current?.abort();
      setResults([]);
      setActive(-1);
      setSearched(false);
      return;
    }

    const handle = window.setTimeout(() => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const url = `${apiPath}?q=${encodeURIComponent(q)}&lang=${lang}&limit=20`;
      fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } })
        .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
        .then((data: SearchResult[]) => {
          setResults(Array.isArray(data) ? data : []);
          setActive(-1);
          setSearched(true);
        })
        .catch((err) => {
          if (err?.name === 'AbortError') return; // superseded request
          setResults([]);
          setActive(-1);
          setSearched(true);
        });
    }, DEBOUNCE_MS);

    return () => window.clearTimeout(handle);
  }, [query, lang, apiPath]);

  // Cancel any in-flight request on unmount.
  useEffect(() => () => abortRef.current?.abort(), []);

  // Keep the active option scrolled into view (reduced-motion safe).
  useEffect(() => {
    if (active < 0 || !listRef.current) return;
    const el = listRef.current.querySelectorAll<HTMLElement>('[role="option"]')[active];
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    el?.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
  }, [active]);

  const navigate = useCallback(
    (r: SearchResult) => {
      window.location.href = resultHref(lang, r);
    },
    [lang],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'ArrowDown') {
        if (results.length === 0) return;
        e.preventDefault();
        setActive((i) => (i + 1) % results.length);
      } else if (e.key === 'ArrowUp') {
        if (results.length === 0) return;
        e.preventDefault();
        setActive((i) => (i <= 0 ? results.length - 1 : i - 1));
      } else if (e.key === 'Enter') {
        // With an active selection, follow it. With none, let the form submit
        // natively (SSR fallback) — do NOT preventDefault.
        if (active >= 0 && results[active]) {
          e.preventDefault();
          navigate(results[active]);
        }
      } else if (e.key === 'Escape') {
        setActive(-1);
      }
    },
    [active, results, navigate],
  );

  const activeId = active >= 0 ? `${listboxId}-opt-${active}` : undefined;
  const showEmpty = searched && results.length > 0 ? false : searched && query.trim().length > 0;

  return (
    <div>
      <form
        ref={formRef}
        method="get"
        action={`/${lang}/search`}
        role="search"
        className="flex items-stretch gap-2"
        onSubmit={(e) => {
          // If JS handled navigation via an active selection, the input keydown
          // already prevented default. Otherwise allow the native GET submit.
          if (active >= 0) e.preventDefault();
        }}
      >
        <label htmlFor={`${listboxId}-input`} className="sr-only">
          {resolvedInputLabel}
        </label>
        <input
          id={`${listboxId}-input`}
          ref={inputRef}
          type="search"
          name="q"
          value={query}
          autoComplete="off"
          spellCheck={false}
          role="combobox"
          aria-expanded={results.length > 0}
          aria-controls={listboxId}
          aria-activedescendant={activeId}
          aria-autocomplete="list"
          placeholder={resolvedPlaceholder}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          className="flex-1 min-w-0 bg-[#0a0d16] border border-[#202a44] focus:border-[#3a8b9a] focus:outline-none rounded-[4px] px-3 py-2.5 font-mono text-[14px] text-[#e7ecf5] placeholder:text-[#7e879b]"
        />
        <button
          type="submit"
          className="shrink-0 px-4 sm:px-5 py-2.5 font-mono uppercase text-[12px] tracking-[0.14em] font-bold bg-[#65def0] text-[#0b0f1a] hover:bg-[#9eecf6] transition-colors rounded-[4px] cursor-pointer"
        >
          {resolvedSubmit}
        </button>
      </form>

      {/* Polite result-count announcement. Singular key avoids "1 results".
          Literal tr() calls per branch so the i18n audit sees both keys used. */}
      <p aria-live="polite" className="sr-only">
        {!searched
          ? ''
          : results.length === 1
            ? tr('result_count_one', { count: results.length })
            : tr('result_count', { count: results.length })}
      </p>

      {results.length > 0 && (
        <>
          <p className="mt-6 mb-3 font-mono text-[11px] uppercase tracking-[0.14em] text-[#868fa3] tabular-nums" aria-hidden="true">
            {results.length === 1
              ? tr('result_count_one', { count: results.length })
              : tr('result_count', { count: results.length })}
          </p>
          <ul
            ref={listRef}
            id={listboxId}
            role="listbox"
            aria-label={tr('results_label')}
            className="space-y-3"
          >
            {results.map((r, i) => (
              <li key={`${r.kind}-${r.slug}`} role="presentation">
                <a
                  id={`${listboxId}-opt-${i}`}
                  role="option"
                  aria-selected={i === active}
                  href={resultHref(lang, r)}
                  onMouseEnter={() => setActive(i)}
                  className={`block border bg-[#121828] transition-colors rounded-[4px] px-4 py-3.5 ${
                    i === active
                      ? 'border-[#3a8b9a] bg-[#1a2236]'
                      : 'border-[#202a44] hover:border-[#3a8b9a] hover:bg-[#1a2236]'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    {r.kind === 'guide' ? (
                      <span className="text-[10px] font-mono uppercase px-2 py-0.5 bg-[#e76670]/10 text-[#e76670] border border-[#e76670]/40 rounded-sm" style={{ letterSpacing: '0.14em', fontWeight: 600 }}>
                        {resolvedGuideBadge}
                      </span>
                    ) : (
                      <span className="text-[10px] font-mono uppercase px-2 py-0.5 bg-[#65def0]/10 text-[#65def0] border border-[#65def0]/40 rounded-sm" style={{ letterSpacing: '0.14em', fontWeight: 600 }}>
                        {resolvedPostBadge}
                      </span>
                    )}
                  </div>
                  <h2 className="font-mono font-bold text-[#e7ecf5] text-[15px]" style={{ letterSpacing: '-0.01em' }}>
                    {r.title}
                  </h2>
                  {/* snippet_html is the only sanctioned dangerouslySetInnerHTML
                      field — server-escaped THEN marked (see module docstring). */}
                  <p
                    className="mt-1 font-sans text-[13px] leading-[1.55] text-[#aab2c4] dcm-snippet"
                    dangerouslySetInnerHTML={{ __html: r.snippet_html }}
                  />
                </a>
              </li>
            ))}
          </ul>
        </>
      )}

      {showEmpty && (
        <p className="mt-6 font-mono text-[12px] uppercase tracking-[0.14em] text-[#868fa3]">
          {resolvedNoResults}
        </p>
      )}
    </div>
  );
}
