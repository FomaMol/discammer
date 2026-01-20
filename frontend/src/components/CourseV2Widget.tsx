import { useEffect, useRef, useState } from 'react';
import { Locale } from '../utils/i18n';

export type CaseBlock = {
  type: 'case'; title: string; situation: string; analysis: string;
  legitimate: boolean;
};
export type DecisionChoice = {
  text: string; consequence: string; explanation: string; recommended: boolean;
  next?: string;
};
export type DecisionStep = { id?: string; prompt: string; choices: DecisionChoice[] };
export type PracticeBlock = {
  type: 'practice'; title: string; setup: string; synthetic: true;
  mode?: 'sequence' | 'graph'; steps: DecisionStep[]; debrief: string;
};
export type CheckBlock = {
  type: 'check'; title: string;
  questions: { prompt: string; choices: { text: string; explanation: string; correct: boolean }[] }[];
};
export type CourseBlock = CaseBlock | PracticeBlock | CheckBlock;
export type CourseV2Config = {
  version: 2; revision: string; goal: string; blocks: CourseBlock[]; today_action: string;
  checked_at: string; scope: string;
  sources: { title: string; url: string; scope: string }[];
};

type Ui = {
  goal: string; legitimate: string; synthetic: string; step: string; of: string;
  consequence: string; why: string; next: string; finish: string;
  retryStep: string; retryAll: string; debrief: string; recommended: string;
  other: string; today: string; sources: string; checked: string;
  check: string; retryQuestion: string;
};
const UI: Record<Locale, Ui> = {
  en: {
    goal: 'Skill goal', legitimate: 'Legitimate but confusing', synthetic: 'Synthetic training scenario',
    step: 'Decision', of: 'of', consequence: 'Consequence', why: 'Why', next: 'Next decision',
    finish: 'View debrief', retryStep: 'Try this decision again', retryAll: 'Restart scenario',
    debrief: 'Debrief', recommended: 'Safer choice', other: 'Risk to consider',
    today: 'Do this today', sources: 'Sources and limits', checked: 'Checked',
    check: 'Knowledge check', retryQuestion: 'Try this question again',
  },
  ru: {
    goal: 'Цель урока', legitimate: 'Законная, но неоднозначная ситуация', synthetic: 'Учебный вымышленный сценарий',
    step: 'Решение', of: 'из', consequence: 'Последствие', why: 'Почему', next: 'Следующее решение',
    finish: 'Перейти к разбору', retryStep: 'Попробовать ещё раз', retryAll: 'Начать сценарий заново',
    debrief: 'Разбор', recommended: 'Более безопасный выбор', other: 'Учитывайте риск',
    today: 'Что сделать сегодня', sources: 'Источники и ограничения', checked: 'Проверено',
    check: 'Проверка понимания', retryQuestion: 'Ответить ещё раз',
  },
};

const panel = 'rounded-[4px] border border-[var(--border-strong)] bg-[var(--panel)] p-4 sm:p-6';
const button = 'min-h-11 w-full rounded-[3px] border border-[var(--border-strong)] px-4 py-3 text-left text-[16px] leading-relaxed text-[var(--text)] hover:border-[var(--brand)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]';
const action = 'min-h-11 rounded-[3px] border border-[var(--brand)] px-4 py-2 text-[15px] text-[var(--brand)] hover:bg-[var(--brand)]/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]';

export function resolveNextStep(block: PracticeBlock, step: number, choice: number): number | null {
  if (block.mode === 'graph') {
    const next = block.steps[step]?.choices[choice]?.next;
    if (!next || next === 'end') return null;
    const index = block.steps.findIndex(candidate => candidate.id === next);
    return index < 0 ? null : index;
  }
  return step + 1 < block.steps.length ? step + 1 : null;
}

function Practice({ block, ui }: { block: PracticeBlock; ui: Ui }) {
  const [step, setStep] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [finished, setFinished] = useState(false);
  const [history, setHistory] = useState<{ step: number; choice: number }[]>([]);
  const feedback = useRef<HTMLDivElement>(null);
  const prompt = useRef<HTMLHeadingElement>(null);
  const debriefHeading = useRef<HTMLHeadingElement>(null);
  const transition = useRef(false);
  useEffect(() => { if (picked !== null) feedback.current?.focus(); }, [picked]);
  useEffect(() => {
    if (!transition.current) return;
    if (finished) debriefHeading.current?.focus();
    else prompt.current?.focus();
    transition.current = false;
  }, [step, finished]);
  const current = block.steps[step];
  const chosen = picked === null ? null : current?.choices[picked];
  function advance() {
    if (picked === null) return;
    setHistory([...history, { step, choice: picked }]);
    setPicked(null);
    const next = resolveNextStep(block, step, picked);
    transition.current = true;
    if (next === null) setFinished(true);
    else setStep(next);
  }
  function restart() { transition.current = true; setStep(0); setPicked(null); setHistory([]); setFinished(false); }
  return <section className={panel} aria-label={block.title}>
    <p className="font-mono text-[12px] uppercase tracking-[0.1em] text-[var(--brand)]">{ui.synthetic}</p>
    <h2 className="mt-2 text-xl font-semibold text-[var(--text-strong)]">{block.title}</h2>
    <p className="mt-3 text-[16px] leading-relaxed text-[var(--text-medium)]">{block.setup}</p>
    {finished ? <div className="mt-5" aria-live="polite">
      <h3 ref={debriefHeading} tabIndex={-1} className="text-lg font-semibold text-[var(--text-strong)] outline-none">{ui.debrief}</h3>
      <ol className="mt-3 space-y-3 list-decimal pl-6">
        {history.map(({ step: i, choice }) => <li key={i} className="text-[16px] text-[var(--text-medium)]">
          <strong>{block.steps[i].prompt}</strong> {block.steps[i].choices[choice].consequence}
        </li>)}
      </ol>
      <p className="mt-4 text-[16px] leading-relaxed text-[var(--text-medium)]">{block.debrief}</p>
      <button className={`${action} mt-5`} onClick={restart} type="button">{ui.retryAll}</button>
    </div> : current ? <div className="mt-5">
      <p className="font-mono text-[12px] text-[var(--text-soft)]">{ui.step} {block.mode === 'graph' ? history.length + 1 : step + 1}{block.mode === 'graph' ? '' : ` ${ui.of} ${block.steps.length}`}</p>
      <h3 ref={prompt} tabIndex={-1} className="mt-2 text-lg font-semibold text-[var(--text-strong)] outline-none">{current.prompt}</h3>
      <div className="mt-4 space-y-2" role="group" aria-label={current.prompt}>
        {current.choices.map((choice, i) => <button key={i} className={button} type="button"
          onClick={() => { if (picked === null) setPicked(i); }} disabled={picked !== null}
          aria-pressed={picked === i}>{choice.text}</button>)}
      </div>
      {chosen && <div ref={feedback} tabIndex={-1} role="status" className="mt-4 rounded-[3px] border border-[var(--border-strong)] p-4 outline-none">
        <p className="font-semibold text-[var(--text-strong)]">{chosen.recommended ? ui.recommended : ui.other}</p>
        <p className="mt-2 text-[16px] leading-relaxed text-[var(--text-medium)]"><strong>{ui.consequence}:</strong> {chosen.consequence}</p>
        <p className="mt-2 text-[16px] leading-relaxed text-[var(--text-medium)]"><strong>{ui.why}:</strong> {chosen.explanation}</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <button className={action} type="button" onClick={() => { prompt.current?.focus(); setPicked(null); }}>{ui.retryStep}</button>
          <button className={action} type="button" onClick={advance}>{resolveNextStep(block, step, picked!) !== null ? ui.next : ui.finish}</button>
        </div>
      </div>}
    </div> : null}
  </section>;
}

function Question({ question, ui, index }: { question: CheckBlock['questions'][number]; ui: Ui; index: number }) {
  const [picked, setPicked] = useState<number | null>(null);
  const feedback = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (picked !== null) feedback.current?.focus(); }, [picked]);
  const chosen = picked === null ? null : question.choices[picked];
  return <li className="border-t border-[var(--border)] pt-4 first:border-t-0 first:pt-0">
    <h3 ref={heading} tabIndex={-1} className="text-[17px] font-semibold text-[var(--text-strong)] outline-none">{index + 1}. {question.prompt}</h3>
    <div role="group" aria-label={question.prompt} className="mt-3 space-y-2">
      {question.choices.map((choice, i) => <button className={button} type="button" key={i}
        onClick={() => setPicked(i)} disabled={picked !== null} aria-pressed={picked === i}>{choice.text}</button>)}
    </div>
    {chosen && <div ref={feedback} tabIndex={-1} role="status" className="mt-3 text-[16px] leading-relaxed text-[var(--text-medium)] outline-none">
      <strong>{chosen.correct ? ui.recommended : ui.other}.</strong> {chosen.explanation}
      {!chosen.correct && <p className="mt-2">{question.choices.find(c => c.correct)?.text}</p>}
      <button className={`${action} mt-3`} type="button" onClick={() => { heading.current?.focus(); setPicked(null); }}>{ui.retryQuestion}</button>
    </div>}
  </li>;
}

export default function CourseV2Widget({ config, locale }: { config: CourseV2Config; locale: Locale }) {
  const ui = UI[locale] || UI.en;
  if (config.version !== 2 || !Array.isArray(config.blocks)) return null;
  return <div className="space-y-6" data-course-version="2">
    <section className={panel}><h2 className="text-lg font-semibold text-[var(--text-strong)]">{ui.goal}</h2><p className="mt-2 text-[16px] leading-relaxed text-[var(--text-medium)]">{config.goal}</p></section>
    {config.blocks.map((block, i) => block.type === 'case' ?
      <section key={i} className={panel}>
        <p className="font-mono text-[12px] text-[var(--brand)]">{block.legitimate ? ui.legitimate : ui.synthetic}</p>
        <h2 className="mt-2 text-xl font-semibold text-[var(--text-strong)]">{block.title}</h2>
        <p className="mt-3 text-[16px] leading-relaxed text-[var(--text-medium)]">{block.situation}</p>
        <p className="mt-3 text-[16px] leading-relaxed text-[var(--text-medium)]">{block.analysis}</p>
      </section> : block.type === 'practice' ? <Practice key={i} block={block} ui={ui} /> :
      block.type === 'check' ? <section key={i} className={panel}>
        <h2 className="text-xl font-semibold text-[var(--text-strong)]">{block.title || ui.check}</h2>
        <ol className="mt-4 space-y-5">{block.questions.map((q, j) => <Question key={j} question={q} index={j} ui={ui} />)}</ol>
      </section> : null)}
    <section className={panel}><h2 className="text-lg font-semibold text-[var(--text-strong)]">{ui.today}</h2><p className="mt-2 text-[16px] leading-relaxed text-[var(--text-medium)]">{config.today_action}</p></section>
    <section className={panel}><h2 className="text-lg font-semibold text-[var(--text-strong)]">{ui.sources}</h2>
      <p className="mt-2 text-[14px] text-[var(--text-soft)]">{ui.checked}: {config.checked_at}. {config.scope}</p>
      <ul className="mt-3 list-disc space-y-2 pl-5 text-[15px] text-[var(--text-medium)]">{config.sources.map((s, i) => <li key={i}><a className="underline underline-offset-2 hover:text-[var(--brand)]" href={s.url} rel="noopener noreferrer" target="_blank">{s.title}</a> — {s.scope}</li>)}</ul>
    </section>
  </div>;
}
