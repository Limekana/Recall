import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Eye,
  RotateCcw,
  Shuffle,
  Sparkles,
  X
} from 'lucide-react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { EMPTY_PROGRESS } from '../engine/learningEngine';
import { buildLearnQuestion } from '../engine/questions';
import { getCardSide, isAnswerCorrect, seededShuffle } from '../lib/utils';
import { useRecallStore } from '../store/useRecallStore';
import type { QuestionKind } from '../types';

interface Feedback {
  correct: boolean;
  answer: string;
}

export function StudyPage() {
  const { setId = '', mode = 'flashcards' } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const studySet = useRecallStore((state) => state.sets.find((item) => item.id === setId));
  const storedCards = useRecallStore((state) => state.cards);
  const allCards = storedCards.filter((card) => card.setId === setId);
  const progress = useRecallStore((state) => state.progress);
  const answerCard = useRecallStore((state) => state.answerCard);
  const recordSession = useRecallStore((state) => state.recordSession);
  const requestedIds = searchParams.get('cards')?.split(',').filter(Boolean) ?? [];
  const targetedCards = requestedIds.length ? allCards.filter((card) => requestedIds.includes(card.id)) : allCards;
  const [reverse, setReverse] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const [queue, setQueue] = useState<string[]>(() => targetedCards.map((card) => card.id));
  const [position, setPosition] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [typedAnswer, setTypedAnswer] = useState('');
  const [correctCount, setCorrectCount] = useState(0);
  const [weakIds, setWeakIds] = useState<string[]>([]);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const startedAt = useRef(Date.now());
  const sessionSaved = useRef(false);
  const typedInput = useRef<HTMLInputElement>(null);
  const isLearn = mode === 'learn';
  const currentId = queue[position];
  const currentCard = allCards.find((card) => card.id === currentId);
  const isComplete = queue.length > 0 && position >= queue.length;
  const question = useMemo(() => {
    if (!currentCard || !isLearn) return null;
    return buildLearnQuestion(currentCard, allCards, progress[currentCard.id] ?? EMPTY_PROGRESS(currentCard.id), reverse);
  }, [allCards, currentCard, isLearn, progress, reverse]);

  useEffect(() => {
    if (question?.kind === 'typed' && !feedback) typedInput.current?.focus();
  }, [feedback, question]);

  useEffect(() => {
    if (!isComplete || sessionSaved.current) return;
    sessionSaved.current = true;
    void recordSession({
      setId,
      mode: isLearn ? 'learn' : 'flashcards',
      startedAt: startedAt.current,
      finishedAt: Date.now(),
      score: correctCount,
      total: Math.max(targetedCards.length, correctCount + weakIds.length),
      weakCardIds: [...new Set(weakIds)]
    });
  }, [correctCount, isComplete, isLearn, recordSession, setId, targetedCards.length, weakIds]);

  const advanceFlashcard = useCallback(async (correct: boolean) => {
    if (!currentCard) return;
    await answerCard(currentCard.id, { correct, kind: 'choice', answeredAt: Date.now() });
    if (correct) setCorrectCount((value) => value + 1);
    else setWeakIds((items) => [...items, currentCard.id]);
    setPosition((value) => value + 1);
    setFlipped(false);
  }, [answerCard, currentCard]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (isLearn || isComplete) return;
      if (event.key === ' ' || event.key === 'Enter') {
        event.preventDefault();
        setFlipped((value) => !value);
      }
      if (event.key === 'ArrowRight') void advanceFlashcard(true);
      if (event.key === 'ArrowLeft') void advanceFlashcard(false);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [advanceFlashcard, isComplete, isLearn]);

  if (!studySet) return <Navigate to="/library" replace />;
  if (!targetedCards.length) return <Navigate to={`/sets/${setId}`} replace />;
  if (mode !== 'flashcards' && mode !== 'learn') return <Navigate to={`/sets/${setId}`} replace />;

  function toggleShuffle() {
    const next = !shuffle;
    setShuffle(next);
    const remaining = queue.slice(position);
    setQueue(next ? seededShuffle(remaining, `${setId}:${Date.now()}`) : targetedCards.map((card) => card.id));
    setPosition(0);
    setFlipped(false);
    setFeedback(null);
  }

  async function gradeLearn(correct: boolean, kind: QuestionKind) {
    if (!currentCard || !question || feedback) return;
    await answerCard(currentCard.id, { correct, kind, answeredAt: Date.now() });
    setFeedback({ correct, answer: question.answer });
    if (correct) setCorrectCount((value) => value + 1);
    else {
      setWeakIds((items) => [...items, currentCard.id]);
      setQueue((items) => [...items, currentCard.id]);
    }
  }

  function submitTyped(event: React.FormEvent) {
    event.preventDefault();
    if (!question || !typedAnswer.trim()) return;
    void gradeLearn(isAnswerCorrect(typedAnswer, question.answer), 'typed');
  }

  function nextLearn() {
    setPosition((value) => value + 1);
    setFeedback(null);
    setTypedAnswer('');
  }

  function restart() {
    sessionSaved.current = false;
    startedAt.current = Date.now();
    setQueue(shuffle ? seededShuffle(targetedCards.map((card) => card.id), `${Date.now()}`) : targetedCards.map((card) => card.id));
    setPosition(0);
    setFlipped(false);
    setFeedback(null);
    setTypedAnswer('');
    setCorrectCount(0);
    setWeakIds([]);
  }

  if (isComplete) {
    const percentage = Math.round((correctCount / Math.max(1, correctCount + weakIds.length)) * 100);
    return (
      <div className="focus-page completion-screen">
        <div className="completion-orbit"><CheckCircle2 /></div>
        <p className="eyebrow">Session complete</p>
        <h1>{percentage >= 80 ? 'That memory is taking hold.' : 'A useful first pass.'}</h1>
        <p>You answered {correctCount} correctly. {weakIds.length ? `${new Set(weakIds).size} cards need another look.` : 'Nothing slipped through.'}</p>
        <div className="completion-score"><strong>{percentage}%</strong><span>accuracy</span></div>
        <div className="button-row button-row--center">
          <button className="button button--secondary" onClick={restart}><RotateCcw size={18} /> Again</button>
          <button className="button button--primary" onClick={() => navigate(`/sets/${setId}`)}>Back to set <ArrowRight size={18} /></button>
        </div>
      </div>
    );
  }

  if (!currentCard) return null;
  const cardSide = getCardSide(currentCard, reverse);
  const progressPercent = Math.min(100, Math.round((position / Math.max(1, queue.length)) * 100));

  return (
    <div className="focus-page study-session">
      <header className="session-header">
        <Link to={`/sets/${setId}`} className="icon-button icon-button--bordered" aria-label="Exit session"><X /></Link>
        <div className="session-header__title"><span>{isLearn ? 'Learn' : 'Flashcards'}</span><strong>{studySet.title}</strong></div>
        <div className="session-tools">
          <button className={`icon-button icon-button--bordered${shuffle ? ' is-active' : ''}`} onClick={toggleShuffle} aria-label="Shuffle cards"><Shuffle size={18} /></button>
          <button className={`direction-toggle${reverse ? ' is-active' : ''}`} onClick={() => setReverse((value) => !value)} aria-label="Reverse term and definition">A ↔ B</button>
        </div>
      </header>
      <div className="session-progress"><span style={{ width: `${progressPercent}%` }} /></div>
      <p className="session-counter">{position + 1} / {queue.length}</p>

      {isLearn && question ? (
        <section className="learn-stage">
          <div className="learn-prompt">
            <p className="eyebrow">{question.kind === 'typed' ? 'Type the answer' : 'Choose the answer'}</p>
            <h1>{question.prompt}</h1>
          </div>

          {question.kind === 'choice' ? (
            <div className="answer-grid">
              {question.options?.map((option, index) => {
                const isAnswer = option === question.answer;
                const state = feedback ? (isAnswer ? ' is-correct' : '') : '';
                return (
                  <button key={option} className={`answer-option${state}`} disabled={Boolean(feedback)} onClick={() => void gradeLearn(isAnswer, 'choice')}>
                    <span>{String.fromCharCode(65 + index)}</span>{option}
                  </button>
                );
              })}
            </div>
          ) : (
            <form className="typed-answer" onSubmit={submitTyped}>
              <input ref={typedInput} value={typedAnswer} onChange={(event) => setTypedAnswer(event.target.value)} placeholder="Type what you remember…" disabled={Boolean(feedback)} autoComplete="off" />
              {!feedback && <button className="button button--primary" disabled={!typedAnswer.trim()}>Check answer</button>}
            </form>
          )}

          {feedback && (
            <div className={`answer-feedback${feedback.correct ? ' is-correct' : ' is-wrong'}`}>
              <div>{feedback.correct ? <Check size={22} /> : <X size={22} />}</div>
              <div><strong>{feedback.correct ? 'Correct' : 'Not quite'}</strong><span>{feedback.correct ? 'That answer will return at a longer interval.' : `The answer is: ${feedback.answer}`}</span></div>
              <button className="button button--primary" onClick={nextLearn}>Continue <ArrowRight size={17} /></button>
            </div>
          )}
        </section>
      ) : (
        <section className="flashcard-stage">
          <button
            className={`flip-card${flipped ? ' is-flipped' : ''}`}
            onClick={() => setFlipped((value) => !value)}
            onTouchStart={(event) => setTouchStart(event.touches[0].clientX)}
            onTouchEnd={(event) => {
              if (touchStart === null) return;
              const movement = event.changedTouches[0].clientX - touchStart;
              if (Math.abs(movement) > 70) void advanceFlashcard(movement > 0);
              setTouchStart(null);
            }}
          >
            <span className="flip-card__face flip-card__front"><small>{reverse ? 'Definition' : 'Term'}</small><strong>{cardSide.prompt}</strong><em><Eye size={16} /> Tap to reveal</em></span>
            <span className="flip-card__face flip-card__back"><small>{reverse ? 'Term' : 'Definition'}</small><strong>{cardSide.answer}</strong><em>Tap to see the prompt</em></span>
          </button>
          <div className={`recall-controls${flipped ? ' is-visible' : ''}`} aria-hidden={!flipped}>
            <button className="recall-button recall-button--again" disabled={!flipped} onClick={() => void advanceFlashcard(false)}><ArrowLeft size={19} /><span><small>Still learning</small>Show sooner</span></button>
            <button className="recall-button recall-button--know" disabled={!flipped} onClick={() => void advanceFlashcard(true)}><span><small>Know it</small>Longer interval</span><ArrowRight size={19} /></button>
          </div>
          <p className="keyboard-hint"><Sparkles size={15} /> Space to flip · arrows to grade</p>
        </section>
      )}
    </div>
  );
}
