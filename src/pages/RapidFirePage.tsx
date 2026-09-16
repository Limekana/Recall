import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Flame, RotateCcw, Target, Timer, X } from 'lucide-react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { buildOptions } from '../engine/questions';
import { seededShuffle } from '../lib/utils';
import { useRecallStore } from '../store/useRecallStore';

type LimitMode = 'time' | 'mistakes';

export function RapidFirePage() {
  const { setId = '' } = useParams();
  const studySet = useRecallStore((state) => state.sets.find((item) => item.id === setId));
  const storedCards = useRecallStore((state) => state.cards);
  const cards = storedCards.filter((card) => card.setId === setId);
  const recordSession = useRecallStore((state) => state.recordSession);
  const [limitMode, setLimitMode] = useState<LimitMode>('time');
  const [playing, setPlaying] = useState(false);
  const [finished, setFinished] = useState(false);
  const [order, setOrder] = useState<string[]>([]);
  const [position, setPosition] = useState(0);
  const [seconds, setSeconds] = useState(60);
  const [mistakes, setMistakes] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [score, setScore] = useState(0);
  const [flash, setFlash] = useState<'correct' | 'wrong' | null>(null);
  const startedAt = useRef(0);
  const saved = useRef(false);
  const current = cards.find((card) => card.id === order[position % Math.max(1, order.length)]);
  const options = useMemo(() => current ? buildOptions(current, cards, false) : [], [cards, current]);
  const multiplier = Math.min(5, 1 + Math.floor(streak / 3));

  useEffect(() => {
    if (!playing || finished || limitMode !== 'time') return;
    const timer = window.setInterval(() => {
      setSeconds((value) => {
        if (value <= 1) {
          setFinished(true);
          setPlaying(false);
          return 0;
        }
        return value - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [finished, limitMode, playing]);

  useEffect(() => {
    if (!finished || saved.current) return;
    saved.current = true;
    void recordSession({
      setId,
      mode: 'rapid',
      startedAt: startedAt.current,
      finishedAt: Date.now(),
      score,
      total: position,
      weakCardIds: [],
      metadata: { score, bestStreak, limitMode }
    });
  }, [bestStreak, finished, limitMode, position, recordSession, score, setId]);

  if (!studySet) return <Navigate to="/library" replace />;

  function start() {
    setOrder(seededShuffle(cards.map((card) => card.id), `${Date.now()}`));
    setPosition(0);
    setSeconds(60);
    setMistakes(0);
    setStreak(0);
    setBestStreak(0);
    setScore(0);
    setFlash(null);
    setFinished(false);
    setPlaying(true);
    saved.current = false;
    startedAt.current = Date.now();
  }

  function answer(option: string) {
    if (!current || flash) return;
    const correct = option === current.definition;
    if (correct) {
      const nextStreak = streak + 1;
      setStreak(nextStreak);
      setBestStreak((value) => Math.max(value, nextStreak));
      setScore((value) => value + 100 * multiplier);
      setFlash('correct');
    } else {
      setStreak(0);
      setMistakes((value) => {
        const next = value + 1;
        if (limitMode === 'mistakes' && next >= 3) {
          window.setTimeout(() => { setFinished(true); setPlaying(false); }, 400);
        }
        return next;
      });
      setFlash('wrong');
    }
    window.setTimeout(() => {
      setFlash(null);
      setPosition((value) => {
        const next = value + 1;
        if (next > 0 && next % order.length === 0) setOrder((items) => seededShuffle(items, `${Date.now()}`));
        return next;
      });
    }, 420);
  }

  if (cards.length < 3) {
    return <div className="page game-empty"><Link to={`/sets/${setId}`} className="back-link">← {studySet.title}</Link><h1>Add at least three cards to play Rapid Fire.</h1><Link className="button button--primary" to={`/sets/${setId}`}>Back to set</Link></div>;
  }

  if (finished) {
    return (
      <div className="focus-page game-complete rapid-complete"><Flame /><p className="eyebrow">Run complete</p><h1>{score.toLocaleString()}<small>points</small></h1><p>Best streak: {bestStreak} · {mistakes} {mistakes === 1 ? 'miss' : 'misses'}</p><div className="button-row button-row--center"><button className="button button--secondary" onClick={start}><RotateCcw size={18} /> Again</button><Link className="button button--primary" to={`/sets/${setId}`}>Back to set</Link></div></div>
    );
  }

  if (!playing) {
    return (
      <div className="focus-page game-intro rapid-intro">
        <Link to={`/sets/${setId}`} className="icon-button icon-button--bordered game-exit"><X /></Link>
        <div className="rapid-symbol"><Flame /></div><p className="eyebrow">Rapid Fire</p><h1>Think fast.<br />Stay sharp.</h1><p>Every three correct answers raises your multiplier. Pick a limit and keep the streak alive.</p>
        <div className="limit-picker">
          <button className={limitMode === 'time' ? 'is-selected' : ''} onClick={() => setLimitMode('time')}><Timer /><span><strong>60 seconds</strong><small>Score before time runs out</small></span></button>
          <button className={limitMode === 'mistakes' ? 'is-selected' : ''} onClick={() => setLimitMode('mistakes')}><Target /><span><strong>3 mistakes</strong><small>Play until the third miss</small></span></button>
        </div>
        <button className="button button--accent" onClick={start}>Start run <ArrowRight size={18} /></button>
      </div>
    );
  }

  if (!current) return null;

  return (
    <div className={`focus-page rapid-game${flash ? ` flash-${flash}` : ''}`}>
      <header className="rapid-hud"><Link to={`/sets/${setId}`} className="icon-button icon-button--bordered"><X /></Link><div><small>Score</small><strong>{score.toLocaleString()}</strong></div><div className="rapid-hud__streak"><Flame size={18} /><span><small>Streak</small><strong>{streak} <em>×{multiplier}</em></strong></span></div><div><small>{limitMode === 'time' ? 'Time' : 'Mistakes'}</small><strong>{limitMode === 'time' ? `${seconds}s` : `${mistakes}/3`}</strong></div></header>
      <section className="rapid-question"><p className="eyebrow">Choose the definition</p><h1>{current.term}</h1><div className="rapid-options">{options.map((option) => <button key={option} onClick={() => answer(option)} disabled={Boolean(flash)}>{option}</button>)}</div></section>
    </div>
  );
}
