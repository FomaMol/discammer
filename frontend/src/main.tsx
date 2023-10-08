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
  ScanlineOverlay: React.lazy(() => import('./components/ScanlineOverlay')),
  JournalFilter: React.lazy(() => import('./components/JournalFilter')),
  CourseProgress: React.lazy(() => import('./components/CourseProgress')),
  GameEmbed: React.lazy(() => import('./components/GameEmbed')),
  GameLauncher: React.lazy(() => import('./components/GameLauncher')),
  MobileMenu: React.lazy(() => import('./components/MobileMenu')),
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
