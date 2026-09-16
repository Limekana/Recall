import { useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, ClipboardCheck, RotateCcw, SlidersHorizontal, X } from 'lucide-react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { buildTest } from '../engine/questions';
import { isAnswerCorrect } from '../lib/utils';
import { useRecallStore } from '../store/useRecallStore';
import type { QuestionKind, TestQuestion } from '../types';

const kindLabels: Record<QuestionKind, string> = {
  choice: 'Multiple choice',
  typed: 'Written recall',
  'true-false': 'True / false'
};

function answerIsCorrect(question: TestQuestion, answer: string | boolean | undefined): boolean {
  if (question.kind === 'true-false') return answer === question.expectedBoolean;
  if (typeof answer !== 'string') return false;
  return question.kind === 'typed' ? isAnswerCorrect(answer, question.answer) : answer === question.answer;
}

export function TestPage() {
  const { setId = '' } = useParams();
  const studySet = useRecallStore((state) => state.sets.find((item) => item.id === setId));
  const storedCards = useRecallStore((state) => state.cards);
  const cards = storedCards.filter((card) => card.setId === setId);
  const answerCard = useRecallStore((state) => state.answerCard);
  const recordSession = useRecallStore((state) => state.recordSession);
  const [amount, setAmount] = useState(Math.min(10, cards.length));
  const [kinds, setKinds] = useState<QuestionKind[]>(['choice', 'typed', 'true-false']);
  const [reverse, setReverse] = useState(false);
  const [questions, setQuestions] = useState<TestQuestion[] | null>(null);
  const [answers, setAnswers] = useState<Record<string, string | boolean>>({});
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const startedAt = useRef(Date.now());

  const result = useMemo(() => {
    if (!questions || !submitted) return null;
    const correct = questions.filter((question) => answerIsCorrect(question, answers[question.id]));
    const weak = questions.filter((question) => !answerIsCorrect(question, answers[question.id]));
    return { correct, weak, percentage: Math.round((correct.length / questions.length) * 100) };
  }, [answers, questions, submitted]);

  if (!studySet) return <Navigate to="/library" replace />;
  if (!cards.length) return <Navigate to={`/sets/${setId}`} replace />;

  function toggleKind(kind: QuestionKind) {
    setKinds((items) => items.includes(kind) ? (items.length === 1 ? items : items.filter((item) => item !== kind)) : [...items, kind]);
  }

  function startTest() {
    startedAt.current = Date.now();
    setQuestions(buildTest(cards, amount, kinds, reverse));
    setAnswers({});
    setSubmitted(false);
  }

  async function submitTest() {
    if (!questions || submitting) return;
    setSubmitting(true);
    const weakIds: string[] = [];
    let correct = 0;
    for (const question of questions) {
      const isCorrect = answerIsCorrect(question, answers[question.id]);
      if (isCorrect) correct += 1;
      else weakIds.push(question.cardId);
      await answerCard(question.cardId, { correct: isCorrect, kind: question.kind, answeredAt: Date.now() });
    }
    await recordSession({
      setId,
      mode: 'test',
      startedAt: startedAt.current,
      finishedAt: Date.now(),
      score: correct,
      total: questions.length,
      weakCardIds: weakIds
    });
    setSubmitted(true);
    setSubmitting(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  if (!questions) {
    return (
      <div className="page test-setup-page">
        <Link to={`/sets/${setId}`} className="back-link"><ArrowLeft size={17} /> {studySet.title}</Link>
        <header className="test-setup-header">
          <div className="test-setup-header__icon"><ClipboardCheck /></div>
          <p className="eyebrow">Test mode</p>
          <h1>Prove what you know.</h1>
          <p>Build a balanced test, then turn any misses into a focused Learn session.</p>
        </header>
        <section className="test-settings">
          <div className="setting-group">
            <div><SlidersHorizontal size={19} /><span><strong>Question count</strong><small>{amount} of {cards.length} cards</small></span></div>
            <input type="range" min={1} max={cards.length} value={amount} onChange={(event) => setAmount(Number(event.target.value))} />
          </div>
          <div className="setting-group setting-group--stack">
            <div><ClipboardCheck size={19} /><span><strong>Question types</strong><small>Choose at least one format</small></span></div>
            <div className="toggle-grid">
              {(Object.keys(kindLabels) as QuestionKind[]).map((kind) => (
                <button key={kind} className={`select-tile${kinds.includes(kind) ? ' is-selected' : ''}`} onClick={() => toggleKind(kind)}>
                  <span>{kinds.includes(kind) ? <Check size={15} /> : null}</span>{kindLabels[kind]}
                </button>
              ))}
            </div>
          </div>
          <label className="switch-row"><span><strong>Reverse direction</strong><small>Show definitions and answer with terms</small></span><input type="checkbox" checked={reverse} onChange={(event) => setReverse(event.target.checked)} /></label>
          <button className="button button--accent button--full" onClick={startTest}>Start {amount}-question test <ArrowRight size={18} /></button>
        </section>
      </div>
    );
  }

  if (result) {
    const weakIds = [...new Set(result.weak.map((question) => question.cardId))];
    return (
      <div className="page test-result-page">
        <section className="test-score-card">
          <p className="eyebrow">Test complete</p>
          <strong>{result.percentage}%</strong>
          <h1>{result.percentage >= 90 ? 'Excellent recall.' : result.percentage >= 70 ? 'The foundation is there.' : 'Now you know what to target.'}</h1>
          <p>{result.correct.length} correct out of {questions.length}</p>
          <div className="button-row button-row--center">
            <button className="button button--secondary" onClick={() => setQuestions(null)}><RotateCcw size={18} /> New test</button>
            {weakIds.length > 0 ? (
              <Link className="button button--primary" to={`/study/${setId}/learn?cards=${weakIds.join(',')}`}>Study weak terms <ArrowRight size={18} /></Link>
            ) : (
              <Link className="button button--primary" to={`/sets/${setId}`}>Back to set <ArrowRight size={18} /></Link>
            )}
          </div>
        </section>
        {result.weak.length > 0 && (
          <section className="result-breakdown">
            <div className="section-heading"><div><p className="eyebrow">Needs another look</p><h2>{result.weak.length} missed {result.weak.length === 1 ? 'question' : 'questions'}</h2></div></div>
            {result.weak.map((question) => (
              <div className="result-row" key={question.id}><X size={18} /><div><strong>{question.prompt}</strong><span>Your answer: {String(answers[question.id] ?? 'No answer')}</span><em>Correct: {question.answer}</em></div></div>
            ))}
          </section>
        )}
      </div>
    );
  }

  const answeredCount = questions.filter((question) => answers[question.id] !== undefined && answers[question.id] !== '').length;

  return (
    <div className="page test-taking-page">
      <header className="test-taking-header">
        <Link to={`/sets/${setId}`} className="icon-button icon-button--bordered" aria-label="Exit test"><X /></Link>
        <div><span>Test mode</span><strong>{studySet.title}</strong></div>
        <span>{answeredCount} / {questions.length} answered</span>
      </header>
      <div className="test-question-list">
        {questions.map((question, index) => (
          <section key={question.id} className="test-question">
            <div className="test-question__number"><span>{String(index + 1).padStart(2, '0')}</span><small>{kindLabels[question.kind]}</small></div>
            <h2>{question.prompt}</h2>
            {question.kind === 'choice' && (
              <div className="test-options">{question.options?.map((option) => <label key={option} className={answers[question.id] === option ? 'is-selected' : ''}><input type="radio" name={question.id} value={option} checked={answers[question.id] === option} onChange={() => setAnswers((items) => ({ ...items, [question.id]: option }))} /><span>{option}</span></label>)}</div>
            )}
            {question.kind === 'typed' && <input className="test-written-input" value={(answers[question.id] as string) ?? ''} onChange={(event) => setAnswers((items) => ({ ...items, [question.id]: event.target.value }))} placeholder="Write your answer" autoComplete="off" />}
            {question.kind === 'true-false' && (
              <div className="true-false-block"><p>{question.shownStatement}</p><div>{[true, false].map((value) => <button key={String(value)} className={answers[question.id] === value ? 'is-selected' : ''} onClick={() => setAnswers((items) => ({ ...items, [question.id]: value }))}>{value ? 'True' : 'False'}</button>)}</div></div>
            )}
          </section>
        ))}
      </div>
      <div className="test-submit-bar"><span>{questions.length - answeredCount ? `${questions.length - answeredCount} unanswered` : 'Ready to score'}</span><button className="button button--accent" onClick={() => void submitTest()} disabled={submitting}>{submitting ? 'Scoring…' : 'Submit test'} <ArrowRight size={18} /></button></div>
    </div>
  );
}
