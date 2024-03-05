import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles/globals.css';

// Component registry
const components: Record<string, React.LazyExoticComponent<React.ComponentType<any>>> = {
  HeroTypewriter: React.lazy(() => import('./components/HeroTypewriter')),
  ParticleBackground: React.lazy(() => import('./components/ParticleBackground')),
  ContentCarousel: React.lazy(() => import('./components/ContentCarousel')),
  ScamTypesGrid: React.lazy(() => import('./components/ScamTypesGrid')),
  GlitchText: React.lazy(() => import('./components/GlitchText')),
  TerminalBlock: React.lazy(() => import('./components/TerminalBlock')),
  HeroTerminal: React.lazy(() => import('./components/HeroTerminal')),
  ScanlineOverlay: React.lazy(() => import('./components/ScanlineOverlay')),
  JournalFilter: React.lazy(() => import('./components/JournalFilter')),
  JournalBroadsheet: React.lazy(() => import('./components/JournalBroadsheet')),
  CourseProgress: React.lazy(() => import('./components/CourseProgress')),
  GameLauncher: React.lazy(() => import('./components/GameLauncher')),
  MobileMenu: React.lazy(() => import('./components/MobileMenu')),
  ModuleLessons: React.lazy(() => import('./components/ModuleLessons')),
  LessonWidget: React.lazy(() => import('./components/LessonWidget')),
  LessonFooter: React.lazy(() => import('./components/LessonFooter')),
  HeroShader: React.lazy(() => import('./components/HeroShader')),
  IncidentFeed: React.lazy(() => import('./components/IncidentFeed')),
  SimulateTerminal: React.lazy(() => import('./components/SimulateTerminal')),
  MissionBriefingTerminal: React.lazy(() => import('./components/MissionBriefingTerminal')),
  ObjectivesPanel: React.lazy(() => import('./components/ObjectivesPanel')),
  OpsDebriefPanel: React.lazy(() => import('./components/OpsDebriefPanel')),
  ScrollReveal: React.lazy(() => import('./components/ScrollReveal')),
  WordmarkReveal: React.lazy(() => import('./components/WordmarkReveal')),
};

function hydrateIslands() {
  const islands = document.querySelectorAll<HTMLElement>('[data-component]');
  islands.forEach((el) => {
    const name = el.dataset.component;
    if (!name || !components[name]) return;
    const Component = components[name];
    const props = el.dataset.props ? JSON.parse(el.dataset.props) : {};
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
