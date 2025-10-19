import { Locale, makeTranslator, normalizeLocale } from '../utils/i18n';
import QuizWidget, { QuizConfig } from './QuizWidget';
import ScenarioWidget, { ScenarioConfig } from './ScenarioWidget';
import RedFlagsWidget, { RedFlagsConfig } from './RedFlagsWidget';
import ExamWidget, { ExamConfig } from './ExamWidget';
import CertificateWidget, { CertificateConfig } from './CertificateWidget';

interface Props {
  type: string;
  config: Record<string, unknown>;
  moduleSlug: string;
  lessonSlug: string;
  locale: Locale;
}

/**
 * Dispatcher island — picks the right widget based on `type`. Adding a new
 * interactive type means importing a new component here and adding a case.
 */
export default function LessonWidget({ type, config, locale }: Props) {
  const lang = normalizeLocale(locale);
  const tr = makeTranslator('lessonWidget');

  switch (type) {
    case 'quiz':
      return <QuizWidget config={config as unknown as QuizConfig} locale={lang} />;
    case 'scenario':
      return <ScenarioWidget config={config as unknown as ScenarioConfig} locale={lang} />;
    case 'redflags':
      return <RedFlagsWidget config={config as unknown as RedFlagsConfig} locale={lang} />;
    case 'exam':
      return <ExamWidget config={config as unknown as ExamConfig} locale={lang} />;
    case 'certificate':
      return (
        <CertificateWidget config={config as unknown as CertificateConfig} locale={lang} />
      );
    default:
      return (
        <div className="bg-[var(--panel)] border border-[var(--border)] p-5 rounded-[4px]">
          <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--warning)] mb-2">
            {tr('unavailable_header')}
          </div>
          <p className="font-sans text-[14px] text-[var(--text-soft)] leading-relaxed">
            {tr('unavailable_body', { type })}
          </p>
        </div>
      );
  }
}
