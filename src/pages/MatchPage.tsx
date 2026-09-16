import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Clock3, RotateCcw, Trophy, X } from 'lucide-react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { seededShuffle } from '../lib/utils';
import { useRecallStore } from '../store/useRecallStore';

interface MatchTile {
  id: string;
  cardId: string;
  value: string;
  side: 'term' | 'definition';
}

export function MatchPage() {
  const { setId = '' } = useParams();
  const studySet = useRecallStore((state) => state.sets.find((item) => item.id === setId));
  const storedCards = useRecallStore((state) => state.cards);
  const cards = storedCards.filter((card) => card.setId === setId);
  const sessions = useRecallStore((state) => state.sessions);
  const recordSession = useRecallStore((state) => state.recordSession);
  const [round, setRound] = useState(0);
  const roundCards = useMemo(() => seededShuffle(cards, `${setId}:${round}`).slice(0, 8), [cards, round, setId]);
  const tiles = useMemo<MatchTile[]>(() => seededShuffle(roundCards.flatMap((card) => [
    { id: `${card.id}:term`, cardId: card.id, value: card.term, side: 'term' as const },
    { id: `${card.id}:definition`, cardId: card.id, value: card.definition, side: 'definition' as const }
  ]), `tiles:${round}`), [round, roundCards]);
  const [started, setStarted] = useState(false);
  const [selected, setSelected] = useState<MatchTile | null>(null);
  const [matched, setMatched] = useState<string[]>([]);
  const [mismatch, setMismatch] = useState<string[]>([]);
  const [locked, setLocked] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [previousBest, setPreviousBest] = useState(Number.POSITIVE_INFINITY);
  const startedAt = useRef(0);
  const saved = useRef(false);
  const complete = started && matched.length === roundCards.length && roundCards.length > 0;
  const best = sessions
    .filter((session) => session.setId === setId && session.mode === 'match')
    .map((session) => Number(session.metadata?.seconds ?? Number.POSITIVE_INFINITY))
    .reduce((lowest, value) => Math.min(lowest, value), Number.POSITIVE_INFINITY);

  useEffect(() => {
    if (!started || complete) return;
    const timer = window.setInterval(() => setElapsed((Date.now() - startedAt.current) / 1000), 100);
    return () => window.clearInterval(timer);
  }, [complete, started]);

  useEffect(() => {
    if (!complete || saved.current) return;
    saved.current = true;
    const seconds = Number(elapsed.toFixed(1));
    void recordSession({
      setId,
      mode: 'match',
      startedAt: startedAt.current,
      finishedAt: Date.now(),
      score: roundCards.length,
      total: roundCards.length,
      weakCardIds: [],
      metadata: { seconds }
    });
  }, [complete, elapsed, recordSession, roundCards.length, setId]);

  if (!studySet) return <Navigate to="/library" replace />;

  function startRound() {
    setPreviousBest(best);
    setRound((value) => value + 1);
    setSelected(null);
    setMatched([]);
    setMismatch([]);
    setElapsed(0);
    setStarted(true);
    setLocked(false);
    saved.current = false;
    startedAt.current = Date.now();
  }

  function selectTile(tile: MatchTile) {
    if (locked || matched.includes(tile.cardId) || selected?.id === tile.id) return;
    if (!selected) {
      setSelected(tile);
      return;
    }
    if (selected.cardId === tile.cardId && selected.side !== tile.side) {
      setMatched((items) => [...items, tile.cardId]);
      setSelected(null);
      return;
    }
    setMismatch([selected.id, tile.id]);
    setLocked(true);
    window.setTimeout(() => {
      setMismatch([]);
      setSelected(null);
      setLocked(false);
    }, 520);
  }

  if (cards.length < 2) {
    return (
      <div className="page game-empty"><Link to={`/sets/${setId}`} className="back-link"><ArrowLeft size={17} /> {studySet.title}</Link><h1>Add at least two cards to play Match.</h1><Link className="button button--primary" to={`/sets/${setId}`}>Back to set</Link></div>
    );
  }

  if (!started) {
    return (
      <div className="focus-page game-intro match-intro">
        <Link to={`/sets/${setId}`} className="icon-button icon-button--bordered game-exit" aria-label="Exit game"><X /></Link>
        <div className="game-intro__art" aria-hidden="true"><span>term</span><span>meaning</span></div>
        <p className="eyebrow">Match</p><h1>Find the pair.<br />Beat the clock.</h1>
        <p>Clear {Math.min(cards.length, 8)} pairs as quickly as you can. Terms and definitions are shuffled every round.</p>
        {Number.isFinite(best) && <div className="personal-best"><Trophy size={17} /> Personal best <strong>{best.toFixed(1)}s</strong></div>}
        <button className="button button--accent" onClick={startRound}>Start matching</button>
      </div>
    );
  }

  if (complete) {
    const isBest = !Number.isFinite(previousBest) || elapsed < previousBest;
    return (
      <div className="focus-page game-complete">
        <Trophy />
        <p className="eyebrow">{isBest ? 'New personal best' : 'Board cleared'}</p>
        <h1>{elapsed.toFixed(1)}<small>seconds</small></h1>
        <p>{roundCards.length} pairs matched without a hint.</p>
        <div className="button-row button-row--center"><button className="button button--secondary" onClick={startRound}><RotateCcw size={18} /> Play again</button><Link to={`/sets/${setId}`} className="button button--primary">Back to set</Link></div>
      </div>
    );
  }

  return (
    <div className="focus-page match-game">
      <header className="game-header"><Link to={`/sets/${setId}`} className="icon-button icon-button--bordered"><X /></Link><div><span>Match</span><strong>{studySet.title}</strong></div><p><Clock3 size={17} /> {elapsed.toFixed(1)}s</p></header>
      <div className="match-grid">
        {tiles.map((tile) => {
          const isMatched = matched.includes(tile.cardId);
          const isSelected = selected?.id === tile.id;
          const isMismatch = mismatch.includes(tile.id);
          return <button key={tile.id} className={`match-tile match-tile--${tile.side}${isSelected ? ' is-selected' : ''}${isMatched ? ' is-matched' : ''}${isMismatch ? ' is-mismatch' : ''}`} disabled={isMatched} onClick={() => selectTile(tile)}><small>{tile.side}</small><span>{tile.value}</span></button>;
        })}
      </div>
    </div>
  );
}
