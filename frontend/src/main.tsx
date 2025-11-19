import React from 'react';
import { initAnalytics } from './utils/analytics';
import { createRoot } from 'react-dom/client';
import './styles/globals.css';
import { reportClientError } from './utils/beacon';
import { registerServiceWorker } from './utils/sw-register';

// Component registry — lazy on purpose. Each () => import(...)
// becomes its own hashed dynamic chunk, so an island's deps (e.g. Plyr inside
// VideoPlayer) only download on pages that actually mount it. The home page no
// longer ships Plyr or the course widgets.
//
// Safety: vite.config.ts keeps `resolve.dedupe: ['react','react-dom',
// 'react/jsx-runtime']`, so every dynamic chunk shares the single React
// instance from the entry — no second React, no error #321. Filenames are
// content-hashed (no `?v=` query cache-busting), which is the other half of
// keeping the lazy-import URLs stable and single-instanced.
const components: Record<string, () => Promise<{ default: React.ComponentType<any> }>> = {
  HeroTypewriter: () => import('./components/HeroTypewriter'),
  ContentCarousel: () => import('./components/ContentCarousel'),
  ScamTypesGrid: () => import('./components/ScamTypesGrid'),
  HeroTerminal: () => import('./components/HeroTerminal'),
  JournalBroadsheet: () => import('./components/JournalBroadsheet'),
  CourseProgress: () => import('./components/CourseProgress'),
  ProgressSync: () => import('./components/ProgressSync'),
  GameLauncher: () => import('./components/GameLauncher'),
  ThemeSwitcher: () => import('./components/ThemeSwitcher'),
  MobileMenu: () => import('./components/MobileMenu'),
  ModuleLessons: () => import('./components/ModuleLessons'),
  LessonWidget: () => import('./components/LessonWidget'),
  LessonFooter: () => import('./components/LessonFooter'),
  HeroShader: () => import('./components/HeroShader'),
  SimulateTerminal: () => import('./components/SimulateTerminal'),
  MissionBriefingTerminal: () => import('./components/MissionBriefingTerminal'),
  ObjectivesPanel: () => import('./components/ObjectivesPanel'),
  OpsDebriefPanel: () => import('./components/OpsDebriefPanel'),
  WordmarkReveal: () => import('./components/WordmarkReveal'),
  VideoPlayer: () => import('./components/VideoPlayer'),
  SearchConsole: () => import('./components/SearchConsole'),
  MessageAnalyzer: () => import('./components/MessageAnalyzer'),
  MessageChecker: () => import('./components/MessageChecker'),
  KnowledgeCheck: () => import('./components/KnowledgeCheck'),
  LinkInspector: () => import('./components/LinkInspector'),
};

// If an island throws, restore its server-rendered markup (captured before
// the mount cleared it) instead of leaving a permanently blank box. Import failures leave the untouched SSR nodes in place.
class IslandErrorBoundary extends React.Component<
  { name: string; fallbackHtml: string; children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(err: Error) {
    console.warn('[islands]', this.props.name, 'crashed — restoring SSR fallback', err);
    // Report a scrubbed, sampled, fire-and-forget signal (O1). This never
    // blocks and never ships the raw message/stack — see utils/beacon.ts.
    reportClientError(err, this.props.name);
  }

  render() {
    if (this.state.hasError) {
      return <div dangerouslySetInnerHTML={{ __html: this.props.fallbackHtml }} />;
    }
    return this.props.children;
  }
}

function hydrateIslands() {
  initAnalytics();
  const islands = document.querySelectorAll<HTMLElement>('[data-component]');
  islands.forEach(async (el) => {
    const name = el.dataset.component;
    if (!name || !components[name]) return;
    // Theme controls enhance on intent. Do not download appearance UI on the
    // critical path; this real JS-created button is absent when JS is disabled.
    let themeButton: HTMLButtonElement | undefined;
    let themeOpen = false;
    let intent: (() => void) | undefined;
    const onThemeClick = () => { themeOpen = true; intent?.(); };
    if (name === 'ThemeSwitcher') {
      themeButton = document.createElement('button');
      themeButton.className = 'theme-trigger';
      const label = window.__DISCAMMER_I18N__?.strings?.theme?.label;
      themeButton.setAttribute('aria-label', typeof label === 'string' ? label : 'Appearance');
      themeButton.title = themeButton.getAttribute('aria-label')!;
      themeButton.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 4v16M12 4a8 8 0 0 1 0 16" fill="currentColor"/></svg>';
      el.append(themeButton);
      await new Promise<void>(resolve => {
        intent = resolve;
        themeButton!.addEventListener('pointerenter', resolve as unknown as EventListener, { once: true });
        themeButton!.addEventListener('focus', resolve as unknown as EventListener, { once: true });
        themeButton!.addEventListener('click', onThemeClick);
      });
    }
    // Leave the actual SSR nodes in place while the chunk loads, including
    // user input/focus. Reconstructing fallback HTML during Suspense loses edits.
    let Component: React.ComponentType<any>;
    try { Component = (await components[name]()).default; }
    catch (err) { if (themeButton) themeButton.remove(); reportClientError(err instanceof Error ? err : { name: 'ChunkLoadError' }, name); return; }
    // Parse data-props defensively — a single malformed payload must NOT
    // abort the whole forEach (otherwise every island after it silently
    // fails to mount, which is how ScrollReveal broke previously).
    let props: Record<string, unknown> = {};
    if (el.dataset.props) {
      try {
        props = JSON.parse(el.dataset.props);
      } catch (err) {
        console.warn('[islands] invalid data-props on', el, err);
        return;
      }
    }
    if (themeButton) {
      props.initialOpen = themeOpen;
      props.focusTrigger = document.activeElement === themeButton;
      themeButton.removeEventListener('click', onThemeClick);
    }
    if (name === 'MobileMenu') {
      const menu = el.querySelector<HTMLDetailsElement>('details');
      props.initialOpen = Boolean(menu?.open);
      props.focusTrigger = el.contains(document.activeElement);
    }
    const searchInput = el.querySelector<HTMLInputElement>('input[type="search"]');
    if (name === 'SearchConsole' && searchInput) {
      props.query = searchInput.value;
      if (searchInput.value !== searchInput.defaultValue) props.initialResults = [];
      searchInput.setAttribute('value', searchInput.value);
    }
    const hadSearchFocus = searchInput === document.activeElement;
    const children = el.innerHTML;
    el.innerHTML = '';
    const root = createRoot(el);
    // Only replace the foundation after its component has loaded. Runtime
    // render failures still restore captured SSR markup.
    root.render(
      <IslandErrorBoundary name={name} fallbackHtml={children}>
        <Component {...props} restoreInputFocus={hadSearchFocus} dangerouslySetInnerHTML={children ? { __html: children } : undefined} />
      </IslandErrorBoundary>
    );
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', hydrateIslands);
} else {
  hydrateIslands();
}

// PERF-3: register the offline/PWA service worker (network-first HTML, cache-first
// hashed assets). No-op on unsupported browsers; registration failures never
// break the page. Registered after islands are scheduled so it can't delay them.
registerServiceWorker();
