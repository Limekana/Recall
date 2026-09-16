import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Check, CheckCircle2, Clock3, RefreshCw, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { EMPTY_PROGRESS, getDueCards } from '../engine/learningEngine';
import { buildLearnQuestion } from '../engine/questions';
import { isAnswerCorrect } from '../lib/utils';
import { useRecallStore } from '../store/useRecallStore';

export function ReviewPage() {
  const storedCards = useRecallStore((state) => state.cards);
  const sets = useRecallStore((state) => state.sets);
  const progress = useRecallStore((state) => state.progress);
  const answerCard = useRecallStore((state) => state.answerCard);
  const recordSession = useRecallStore((state) => state.recordSession);
  const dueCards = useMemo(() => getDueCards(storedCards, progress), [storedCards, progress]);
  const [queue, setQueue] = useState<string[] | null>(null);
  const [position, setPosition] = useState(0);
  const [typedAnswer, setTypedAnswer] = useState('');
  const [feedback, setFeedback] = useState<{ correct: boolean; answer: string } | null>(null);
  const [correctCount, setCorrectCount] = useState(0);
  const [weakIds, setWeakIds] = useState<string[]>([]);
  const startedAt = useRef(Date.now());
  const saved = useRef(false);
  const current = storedCards.find((card) => card.id === queue?.[position]);
  const currentSet = sets.find((item) => item.id === current?.setId);
  const setCards = current ? storedCards.filter((card) => card.setId === current.setId) : [];
  const question = current ? buildLearnQuestion(current, setCards, progress[current.id] ?? EMPTY_PROGRESS(current.id), false) : null;
  const complete = queue !== null && position >= queue.length;

  useEffect(() => {
    if (!complete || saved.current || !queue?.length) return;
    saved.current = true;
    void recordSession({
      setId: 'mixed-review',
      mode: 'review',
      startedAt: startedAt.current,
      finishedAt: Date.now(),
      score: correctCount,
      total: queue.length,
      weakCardIds: [...new Set(weakIds)]
    });
  }, [complete, correctCount, queue, recordSession, weakIds]);

  function start() {
    setQueue(dueCards.map((card) => card.id));
    setPosition(0);
    setCorrectCount(0);
    setWeakIds([]);
    startedAt.current = Date.now();
    saved.current = false;
  }

  async function grade(correct: boolean) {
    if (!current || !question || feedback) return;
    await answerCard(current.id, { correct, kind: question.kind, answeredAt: Date.now() });
    setFeedback({ correct, answer: question.answer });
    if (correct) setCorrectCount((value) => value + 1);
    else setWeakIds((items) => [...items, current.id]);
  }

  function next() {
    setPosition((value) => value + 1);
    setTypedAnswer('');
    setFeedback(null);
  }

  if (complete) {
    return (
      <div className="page review-page">
        <div className="review-complete">
          <CheckCircle2 size={34} />
          <p className="eyebrow">Review complete</p>
          <h1>Nothing due right now.</h1>
          <p>{correctCount} of {queue?.length} answered correctly. Recall has scheduled the next intervals.</p>
          <Link to="/" className="button button--primary">Back to today <ArrowRight size={18} /></Link>
        </div>
      </div>
    );
  }

  if (queue && current && question) {
    return (
      <div className="focus-page review-session">
        <header className="session-header">
          <button className="icon-button icon-button--bordered" onClick={() => setQueue(null)} aria-label="Exit review"><X /></button>
          <div className="session-header__title"><span>Due review</span><strong>{currentSet?.title ?? 'Mixed set'}</strong></div>
          <span className="session-count">{position + 1} / {queue.length}</span>
        </header>
        <div className="session-progress"><span style={{ width: `${Math.round((position / queue.length) * 100)}%` }} /></div>
        <section className="learn-stage review-question">
          <div className="learn-prompt"><p className="eyebrow">{question.kind === 'typed' ? 'Recall it' : 'Recognize it'}</p><h1>{question.prompt}</h1></div>
          {question.kind === 'choice' ? (
            <div className="answer-grid">
              {question.options?.map((option, index) => (
                <button key={option} className={`answer-option${feedback && option === question.answer ? ' is-correct' : ''}`} disabled={Boolean(feedback)} onClick={() => void grade(option === question.answer)}>
                  <span>{String.fromCharCode(65 + index)}</span>{option}
                </button>
              ))}
            </div>
          ) : (
            <form className="typed-answer" onSubmit={(event) => { event.preventDefault(); if (typedAnswer.trim()) void grade(isAnswerCorrect(typedAnswer, question.answer)); }}>
              <input value={typedAnswer} onChange={(event) => setTypedAnswer(event.target.value)} placeholder="Type your answer…" disabled={Boolean(feedback)} autoFocus />
              {!feedback && <button className="button button--primary" disabled={!typedAnswer.trim()}>Check answer</button>}
            </form>
          )}
          {feedback && (
            <div className={`answer-feedback${feedback.correct ? ' is-correct' : ' is-wrong'}`}>
              <div>{feedback.correct ? <Check size={22} /> : <X size={22} />}</div>
              <div><strong>{feedback.correct ? 'Held strong' : 'Memory refreshed'}</strong><span>{feedback.correct ? 'The next interval is longer.' : `Answer: ${feedback.answer}`}</span></div>
              <button className="button button--primary" onClick={next}>Next <ArrowRight size={17} /></button>
            </div>
          )}
        </section>
      </div>
    );
  }

  return (
    <div className="page review-page">
      <header className="review-hero">
        <div className="review-hero__icon"><RefreshCw /></div>
        <div><p className="eyebrow">Long-term retention</p><h1>Review what’s ready.</h1><p>Cards appear here only when their scheduled interval has passed.</p></div>
      </header>
      {dueCards.length ? (
        <section className="due-card">
          <div><Clock3 size={23} /><span><strong>{dueCards.length}</strong> {dueCards.length === 1 ? 'card' : 'cards'} due now</span></div>
          <p>About {Math.max(1, Math.ceil(dueCards.length * 0.35))} minutes · mixed from {new Set(dueCards.map((card) => card.setId)).size} sets</p>
          <button className="button button--accent" onClick={start}>Start review <ArrowRight size={18} /></button>
        </section>
      ) : (
        <section className="empty-state review-empty">
          <CheckCircle2 size={32} />
          <h2>You’re caught up.</h2>
          <p>Learned cards will appear here when they’re ready for another pass.</p>
          <Link to="/library" className="button button--secondary">Browse your sets</Link>
        </section>
      )}
      <section className="review-explainer">
        <p className="eyebrow">How it works</p>
        <div><strong>01</strong><h3>Answer honestly</h3><p>Typed recall earns more mastery than recognition.</p></div>
        <div><strong>02</strong><h3>Intervals adapt</h3><p>Correct cards wait longer. Missed cards return sooner.</p></div>
        <div><strong>03</strong><h3>Nothing is hidden</h3><p>Your mastery and next review are always explainable.</p></div>
      </section>
    </div>
  );
}
