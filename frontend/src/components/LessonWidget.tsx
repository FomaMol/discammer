import { Locale, normalizeLocale } from '../utils/i18n';
import QuizWidget, { QuizConfig } from './QuizWidget';
import ScenarioWidget, { ScenarioConfig } from './ScenarioWidget';
import RedFlagsWidget, { RedFlagsConfig } from './RedFlagsWidget';

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

  switch (type) {
    case 'quiz':
      return <QuizWidget config={config as unknown as QuizConfig} locale={lang} />;
    case 'scenario':
      return <ScenarioWidget config={config as unknown as ScenarioConfig} locale={lang} />;
    case 'redflags':
      return <RedFlagsWidget config={config as unknown as RedFlagsConfig} locale={lang} />;
    default:
      return (
        <div className="bg-[#131829] border border-[#1E2A42] p-5 text-sm text-[#8892A8]">
          {lang === 'ru'
            ? `Виджет «${type}» появится в следующем релизе.`
            : `The "${type}" widget is launching in a future release.`}
        </div>
      );
  }
}
