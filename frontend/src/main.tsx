import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles/globals.css';

// Component registry
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
};

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
    root.render(
      <React.Suspense fallback={null}>
        <Component {...props} dangerouslySetInnerHTML={children ? { __html: children } : undefined} />
      </React.Suspense>
    );
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', hydrateIslands);
} else {
  hydrateIslands();
}
