import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Grid3X3, RotateCcw, Sparkles, Trophy, X } from 'lucide-react';
import { Link, Navigate, useParams } from 'react-router-dom';
import {
  canPlaceShape,
  createBlastBoard,
  createBlastTray,
  placeShape,
  trayHasMove,
  type BlastBoard,
  type BlastShape
} from '../engine/blockBlast';
import { buildOptions } from '../engine/questions';
import { seededShuffle } from '../lib/utils';
import { useRecallStore } from '../store/useRecallStore';
import type { Card } from '../types';

type GamePhase = 'intro' | 'playing' | 'finished';

interface BlastPiece {
  instanceId: string;
  shape: BlastShape;
  cardId: string;
  answered: boolean;
  correct: boolean | null;
}

interface AnswerFeedback {
  correct: boolean;
  answer: string;
}

function makeTray(cards: Card[], round: number, seed: string): BlastPiece[] {
  const cardOrder = seededShuffle(cards, `${seed}:cards:${round}`);
  return createBlastTray(`${seed}:shapes:${round}`).map((shape, index) => ({
    instanceId: `${round}:${index}:${shape.id}`,
    shape,
    cardId: cardOrder[index % cardOrder.length].id,
    answered: false,
    correct: null
  }));
}

function ShapeGlyph({ shape }: { shape: BlastShape }) {
  const rows = Math.max(...shape.cells.map(([row]) => row)) + 1;
  const columns = Math.max(...shape.cells.map(([, column]) => column)) + 1;
  const filled = new Set(shape.cells.map(([row, column]) => `${row}:${column}`));
  return (
    <span className="blast-shape" style={{ '--shape-rows': rows, '--shape-columns': columns } as CSSProperties} aria-hidden="true">
      {Array.from({ length: rows * columns }, (_, index) => {
        const row = Math.floor(index / columns);
        const column = index % columns;
        return <i key={`${row}:${column}`} className={filled.has(`${row}:${column}`) ? 'is-filled' : ''} />;
      })}
    </span>
  );
}

export function BlockBlastPage() {
  const { setId = '' } = useParams();
  const studySet = useRecallStore((state) => state.sets.find((item) => item.id === setId));
  const storedCards = useRecallStore((state) => state.cards);
  const sessions = useRecallStore((state) => state.sessions);
  const answerCard = useRecallStore((state) => state.answerCard);
  const recordSession = useRecallStore((state) => state.recordSession);
  const cards = useMemo(() => storedCards.filter((card) => card.setId === setId), [setId, storedCards]);
  const [phase, setPhase] = useState<GamePhase>('intro');
  const [board, setBoard] = useState<BlastBoard>(() => createBlastBoard());
  const [tray, setTray] = useState<BlastPiece[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [questionId, setQuestionId] = useState<string | null>(null);
  const [hoveredCell, setHoveredCell] = useState<[number, number] | null>(null);
  const [invalidCell, setInvalidCell] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<AnswerFeedback | null>(null);
  const [round, setRound] = useState(0);
  const [score, setScore] = useState(0);
  const [lines, setLines] = useState(0);
  const [combo, setCombo] = useState(0);
  const [bestCombo, setBestCombo] = useState(0);
  const [answers, setAnswers] = useState(0);
  const [correctAnswers, setCorrectAnswers] = useState(0);
  const startedAt = useRef(0);
  const gameSeed = useRef('');
  const weakCardIds = useRef(new Set<string>());
  const saved = useRef(false);
  const feedbackTimer = useRef<number | undefined>(undefined);
  const invalidTimer = useRef<number | undefined>(undefined);

  const selectedPiece = tray.find((piece) => piece.instanceId === selectedId);
  const questionPiece = tray.find((piece) => piece.instanceId === questionId);
  const questionCard = cards.find((card) => card.id === questionPiece?.cardId);
  const options = useMemo(() => questionCard ? buildOptions(questionCard, cards, false) : [], [cards, questionCard]);
  const bestScore = sessions
    .filter((session) => session.setId === setId && session.mode === 'blast')
    .reduce((best, session) => Math.max(best, Number(session.metadata?.score ?? 0)), 0);
  const previewCells = useMemo(() => {
    if (!selectedPiece?.answered || !hoveredCell) return new Set<string>();
    const [row, column] = hoveredCell;
    if (!canPlaceShape(board, selectedPiece.shape, row, column)) return new Set<string>();
    return new Set(selectedPiece.shape.cells.map(([rowOffset, columnOffset]) => `${row + rowOffset}:${column + columnOffset}`));
  }, [board, hoveredCell, selectedPiece]);

  useEffect(() => () => {
    window.clearTimeout(feedbackTimer.current);
    window.clearTimeout(invalidTimer.current);
  }, []);

  useEffect(() => {
    if (phase !== 'finished' || saved.current) return;
    saved.current = true;
    void recordSession({
      setId,
      mode: 'blast',
      startedAt: startedAt.current,
      finishedAt: Date.now(),
      score: correctAnswers,
      total: answers,
      weakCardIds: [...weakCardIds.current],
      metadata: { score, lines, bestCombo }
    });
  }, [answers, bestCombo, correctAnswers, lines, phase, recordSession, score, setId]);

  if (!studySet) return <Navigate to="/library" replace />;

  function startGame() {
    const seed = String(Date.now());
    gameSeed.current = seed;
    weakCardIds.current = new Set();
    setBoard(createBlastBoard());
    setTray(makeTray(cards, 0, seed));
    setSelectedId(null);
    setQuestionId(null);
    setHoveredCell(null);
    setFeedback(null);
    setRound(0);
    setScore(0);
    setLines(0);
    setCombo(0);
    setBestCombo(0);
    setAnswers(0);
    setCorrectAnswers(0);
    setPhase('playing');
    saved.current = false;
    startedAt.current = Date.now();
  }

  function choosePiece(piece: BlastPiece) {
    setFeedback(null);
    if (piece.answered) {
      setSelectedId(piece.instanceId);
      setQuestionId(null);
      return;
    }
    setQuestionId(piece.instanceId);
    setSelectedId(null);
  }

  function answerQuestion(option: string) {
    if (!questionPiece || !questionCard) return;
    const correct = option === questionCard.definition;
    const answeredAt = Date.now();
    void answerCard(questionCard.id, { correct, kind: 'choice', answeredAt });
    setTray((pieces) => pieces.map((piece) => piece.instanceId === questionPiece.instanceId
      ? { ...piece, answered: true, correct }
      : piece));
    setAnswers((value) => value + 1);
    if (correct) {
      setCorrectAnswers((value) => value + 1);
      setScore((value) => value + 50);
    } else {
      weakCardIds.current.add(questionCard.id);
    }
    setSelectedId(questionPiece.instanceId);
    setQuestionId(null);
    setFeedback({ correct, answer: questionCard.definition });
    window.clearTimeout(feedbackTimer.current);
    feedbackTimer.current = window.setTimeout(() => setFeedback(null), 1800);
  }

  function placeSelected(row: number, column: number) {
    if (!selectedPiece?.answered) return;
    if (!canPlaceShape(board, selectedPiece.shape, row, column)) {
      const cell = `${row}:${column}`;
      setInvalidCell(cell);
      window.clearTimeout(invalidTimer.current);
      invalidTimer.current = window.setTimeout(() => setInvalidCell(null), 320);
      return;
    }

    const placement = placeShape(board, selectedPiece.shape, row, column);
    const clearedLines = placement.clearedRows.length + placement.clearedColumns.length;
    const nextCombo = clearedLines ? combo + 1 : 0;
    const placementPoints = selectedPiece.shape.cells.length * 10
      + placement.clearedCellCount * 15
      + clearedLines * 100 * Math.max(1, nextCombo);
    let nextRound = round;
    let nextTray = tray.filter((piece) => piece.instanceId !== selectedPiece.instanceId);
    if (!nextTray.length) {
      nextRound += 1;
      nextTray = makeTray(cards, nextRound, gameSeed.current);
    }

    setBoard(placement.board);
    setTray(nextTray);
    setRound(nextRound);
    setScore((value) => value + placementPoints);
    setLines((value) => value + clearedLines);
    setCombo(nextCombo);
    setBestCombo((value) => Math.max(value, nextCombo));
    setSelectedId(null);
    setHoveredCell(null);
    setFeedback(null);

    if (!trayHasMove(placement.board, nextTray.map((piece) => piece.shape))) setPhase('finished');
  }

  if (cards.length < 3) {
    return <div className="page game-empty"><Link to={`/sets/${setId}`} className="back-link">← {studySet.title}</Link><h1>Add at least three cards to play Block Blast.</h1><Link className="button button--primary" to={`/sets/${setId}`}>Back to set</Link></div>;
  }

  if (phase === 'finished') {
    return (
      <div className="focus-page game-complete blast-complete">
        <Trophy />
        <p className="eyebrow">Mosaic complete</p>
        <h1>{score.toLocaleString()}<small>points</small></h1>
        <p>{lines} {lines === 1 ? 'line' : 'lines'} cleared · {answers ? Math.round((correctAnswers / answers) * 100) : 0}% recall accuracy</p>
        <div className="button-row button-row--center"><button className="button button--secondary" onClick={startGame}><RotateCcw size={18} /> Again</button><Link className="button button--primary" to={`/sets/${setId}`}>Back to set</Link></div>
      </div>
    );
  }

  if (phase === 'intro') {
    return (
      <div className="focus-page game-intro blast-intro">
        <Link to={`/sets/${setId}`} className="icon-button icon-button--bordered game-exit" aria-label="Back to set"><X /></Link>
        <div className="blast-intro__mosaic" aria-hidden="true">{Array.from({ length: 36 }, (_, index) => <i key={index} className={[1, 2, 7, 8, 13, 14, 15, 20, 21, 26, 27, 28, 33, 34].includes(index) ? 'is-lit' : ''} />)}</div>
        <p className="eyebrow">Block Blast</p>
        <h1>Know it.<br />Place it.</h1>
        <p>Answer a card to charge its piece, then build complete rows and columns. No timer—just memory, space, and one move ahead.</p>
        {bestScore > 0 && <span className="blast-best"><Trophy size={14} /> Best {bestScore.toLocaleString()}</span>}
        <button className="button button--accent" onClick={startGame}>Build a mosaic <Sparkles size={18} /></button>
      </div>
    );
  }

  return (
    <div className="focus-page blast-game">
      <header className="blast-hud">
        <Link to={`/sets/${setId}`} className="icon-button icon-button--bordered" aria-label="Leave Block Blast"><X /></Link>
        <div><small>Score</small><strong>{score.toLocaleString()}</strong></div>
        <div><small>Lines</small><strong>{lines}</strong></div>
        <div className={combo > 1 ? 'is-hot' : ''}><small>Combo</small><strong>×{Math.max(1, combo)}</strong></div>
      </header>

      <main className="blast-stage">
        <section className="blast-recall" aria-live="polite">
          {questionCard ? (
            <>
              <div className="blast-recall__heading"><span>Charge the piece</span><ShapeGlyph shape={questionPiece!.shape} /></div>
              <h1>{questionCard.term}</h1>
              <div className="blast-options">{options.map((option) => <button key={option} onClick={() => answerQuestion(option)}>{option}</button>)}</div>
            </>
          ) : feedback ? (
            <div className={`blast-feedback ${feedback.correct ? 'is-correct' : 'is-wrong'}`}><Sparkles /><span><strong>{feedback.correct ? 'Charged' : 'Memory marked'}</strong><small>{feedback.correct ? 'Place the glowing piece.' : `Correct answer: ${feedback.answer}`}</small></span></div>
          ) : (
            <div className="blast-prompt"><Grid3X3 /><span><strong>{selectedPiece ? 'Piece charged' : 'Choose a piece'}</strong><small>{selectedPiece ? 'Tap the board to place it.' : 'Answer its card, then find it a home.'}</small></span></div>
          )}
        </section>

        <section className="blast-board-wrap">
          <div className="blast-board" role="grid" aria-label="Block Blast board" onMouseLeave={() => setHoveredCell(null)}>
            {board.flatMap((line, row) => line.map((filled, column) => {
              const key = `${row}:${column}`;
              return (
                <button
                  key={key}
                  className={`${filled ? 'is-filled' : ''}${previewCells.has(key) ? ' is-preview' : ''}${invalidCell === key ? ' is-invalid' : ''}`}
                  type="button"
                  disabled={!selectedPiece?.answered}
                  aria-label={`Row ${row + 1}, column ${column + 1}${filled ? ', filled' : ''}`}
                  onMouseEnter={() => setHoveredCell([row, column])}
                  onFocus={() => setHoveredCell([row, column])}
                  onClick={() => placeSelected(row, column)}
                />
              );
            }))}
          </div>
        </section>

        <section className="blast-tray" aria-label="Available pieces">
          {tray.map((piece) => (
            <button
              key={piece.instanceId}
              className={`${selectedId === piece.instanceId || questionId === piece.instanceId ? 'is-selected' : ''}${piece.answered ? ' is-charged' : ''}${piece.correct === false ? ' is-missed' : ''}`}
              type="button"
              aria-pressed={selectedId === piece.instanceId || questionId === piece.instanceId}
              aria-label={piece.answered ? 'Select charged piece' : 'Answer a card to charge this piece'}
              onClick={() => choosePiece(piece)}
            >
              <ShapeGlyph shape={piece.shape} />
              <span>{piece.answered ? 'ready' : 'recall'}</span>
            </button>
          ))}
        </section>
      </main>
    </div>
  );
}
