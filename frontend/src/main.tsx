import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles/globals.css';

// Component registry — lazy on purpose. Each React.lazy(() => import(...))
// becomes its own hashed dynamic chunk, so an island's deps (e.g. Plyr inside
// VideoPlayer) only download on pages that actually mount it. The home page no
// longer ships Plyr or the course widgets.
//
// Safety: vite.config.ts keeps `resolve.dedupe: ['react','react-dom',
// 'react/jsx-runtime']`, so every dynamic chunk shares the single React
// instance from the entry — no second React, no error #321. Filenames are
// content-hashed (no `?v=` query cache-busting), which is the other half of
// keeping the lazy-import URLs stable and single-instanced.
const components: Record<string, React.LazyExoticComponent<React.ComponentType<any>>> = {
  HeroTypewriter: React.lazy(() => import('./components/HeroTypewriter')),
  ContentCarousel: React.lazy(() => import('./components/ContentCarousel')),
  ScamTypesGrid: React.lazy(() => import('./components/ScamTypesGrid')),
  HeroTerminal: React.lazy(() => import('./components/HeroTerminal')),
  JournalBroadsheet: React.lazy(() => import('./components/JournalBroadsheet')),
  CourseProgress: React.lazy(() => import('./components/CourseProgress')),
  GameLauncher: React.lazy(() => import('./components/GameLauncher')),
  MobileMenu: React.lazy(() => import('./components/MobileMenu')),
  ModuleLessons: React.lazy(() => import('./components/ModuleLessons')),
  LessonWidget: React.lazy(() => import('./components/LessonWidget')),
  LessonFooter: React.lazy(() => import('./components/LessonFooter')),
  HeroShader: React.lazy(() => import('./components/HeroShader')),
  SimulateTerminal: React.lazy(() => import('./components/SimulateTerminal')),
  MissionBriefingTerminal: React.lazy(() => import('./components/MissionBriefingTerminal')),
  ObjectivesPanel: React.lazy(() => import('./components/ObjectivesPanel')),
  OpsDebriefPanel: React.lazy(() => import('./components/OpsDebriefPanel')),
  WordmarkReveal: React.lazy(() => import('./components/WordmarkReveal')),
  VideoPlayer: React.lazy(() => import('./components/VideoPlayer')),
};

// If an island throws, restore its server-rendered markup (captured before
// the mount cleared it) instead of leaving a permanently blank box. Suspense
// is nested INSIDE this boundary, so a failed *chunk load* (network error)
// also falls back to the SSR markup rather than a blank frame.
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
  }

  render() {
    if (this.state.hasError) {
      return <div dangerouslySetInnerHTML={{ __html: this.props.fallbackHtml }} />;
    }
    return this.props.children;
  }
}

function hydrateIslands() {
  const islands = document.querySelectorAll<HTMLElement>('[data-component]');
  islands.forEach((el) => {
    const name = el.dataset.component;
    if (!name || !components[name]) return;
    const Component = components[name];
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
    const children = el.innerHTML;
    el.innerHTML = '';
    const root = createRoot(el);
    // Suspense fallback re-renders the captured SSR markup so there is NO blank
    // frame while the island's chunk downloads (the previous code-splitting
    // regression). Same markup the ErrorBoundary restores on crash.
    root.render(
      <IslandErrorBoundary name={name} fallbackHtml={children}>
        <React.Suspense fallback={<div dangerouslySetInnerHTML={{ __html: children }} />}>
          <Component {...props} dangerouslySetInnerHTML={children ? { __html: children } : undefined} />
        </React.Suspense>
      </IslandErrorBoundary>
    );
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', hydrateIslands);
} else {
  hydrateIslands();
}
