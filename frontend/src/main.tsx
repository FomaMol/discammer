import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles/globals.css';

import HeroTypewriter from './components/HeroTypewriter';
import ContentCarousel from './components/ContentCarousel';
import ScamTypesGrid from './components/ScamTypesGrid';
import HeroTerminal from './components/HeroTerminal';
import JournalBroadsheet from './components/JournalBroadsheet';
import CourseProgress from './components/CourseProgress';
import GameLauncher from './components/GameLauncher';
import ModuleLessons from './components/ModuleLessons';
import LessonWidget from './components/LessonWidget';
import LessonFooter from './components/LessonFooter';
import HeroShader from './components/HeroShader';
import SimulateTerminal from './components/SimulateTerminal';
import MissionBriefingTerminal from './components/MissionBriefingTerminal';
import ObjectivesPanel from './components/ObjectivesPanel';
import OpsDebriefPanel from './components/OpsDebriefPanel';
import WordmarkReveal from './components/WordmarkReveal';
import VideoPlayer from './components/VideoPlayer';
import MobileMenu from './components/MobileMenu';

// Component registry. Static imports on purpose: the build inlines all
// dynamic imports (vite.config.ts inlineDynamicImports), so React.lazy
// gave no code-splitting and the Suspense fallback blanked the preserved
// SSR markup for a frame.
const components: Record<string, React.ComponentType<any>> = {
  HeroTypewriter,
  ContentCarousel,
  ScamTypesGrid,
  HeroTerminal,
  JournalBroadsheet,
  CourseProgress,
  GameLauncher,
  MobileMenu,
  ModuleLessons,
  LessonWidget,
  LessonFooter,
  HeroShader,
  SimulateTerminal,
  MissionBriefingTerminal,
  ObjectivesPanel,
  OpsDebriefPanel,
  WordmarkReveal,
  VideoPlayer,
};

// If an island throws, restore its server-rendered markup (captured before
// the mount cleared it) instead of leaving a permanently blank box.
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
    root.render(
      <IslandErrorBoundary name={name} fallbackHtml={children}>
        <Component {...props} dangerouslySetInnerHTML={children ? { __html: children } : undefined} />
      </IslandErrorBoundary>
    );
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', hydrateIslands);
} else {
  hydrateIslands();
}
