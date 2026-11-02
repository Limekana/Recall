import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { ArrowRight, Grid3X3, Lock, RotateCcw, Sparkles, ThumbsUp, Trophy, X } from 'lucide-react';
import { Link, Navigate, useParams } from 'react-router-dom';
import {
  BLAST_BOARD_SIZE,
  canPlaceShape,
  createBlastBoard,
  createBlastTray,
  placeShape,
  trayHasMove,
  type BlastBoard,
  type BlastShape
} from '../engine/blockBlast';
import { EMPTY_PROGRESS } from '../engine/learningEngine';
import { buildLearnQuestion } from '../engine/questions';
import { gradeAnswer, seededShuffle } from '../lib/utils';
import { useRecallStore } from '../store/useRecallStore';
import type { CardProgress, TestQuestion } from '../types';

type GamePhase = 'intro' | 'playing' | 'finished';

interface BlastPiece {
  instanceId: string;
  shape: BlastShape;
  charged: boolean;
}

interface ActiveQuestion {
  question: TestQuestion;
  turn: number;
}

interface MissFeedback {
  question: TestQuestion;
  given?: string;
  before: CardProgress | undefined;
}

interface BoardGeometry {
  originX: number;
  originY: number;
  pitch: number;
  cell: number;
}

interface DragState {
  pieceId: string;
  pointerId: number;
  pointerType: string;
  startX: number;
  startY: number;
  x: number;
  y: number;
  moved: boolean;
  geometry: BoardGeometry;
}

const DRAG_THRESHOLD = 6;
const TOUCH_LIFT = 34;
const TRAY_SIZE = 3;

function makeTray(round: number, seed: string): BlastPiece[] {
  return createBlastTray(`${seed}:shapes:${round}`, TRAY_SIZE).map((shape, index) => ({
    instanceId: `${round}:${index}:${shape.id}`,
    shape,
    charged: false
  }));
}

function shapeSize(shape: BlastShape) {
  return {
    rows: Math.max(...shape.cells.map(([row]) => row)) + 1,
    columns: Math.max(...shape.cells.map(([, column]) => column)) + 1
  };
}

function ShapeGlyph({ shape, cell, gap }: { shape: BlastShape; cell?: number; gap?: number }) {
  const { rows, columns } = shapeSize(shape);
  const filled = new Set(shape.cells.map(([row, column]) => `${row}:${column}`));
  const style = {
    '--shape-rows': rows,
    '--shape-columns': columns,
    ...(cell ? { '--shape-cell': `${cell}px` } : {}),
    ...(gap !== undefined ? { gap: `${gap}px` } : {})
  } as CSSProperties;
  return (
    <span className="blast-shape" style={style} aria-hidden="true">
      {Array.from({ length: rows * columns }, (_, index) => {
        const row = Math.floor(index / columns);
        const column = index % columns;
        return <i key={`${row}:${column}`} className={filled.has(`${row}:${column}`) ? 'is-filled' : ''} />;
      })}
    </span>
  );
}

function measureBoard(board: HTMLElement | null): BoardGeometry | null {
  const first = board?.children[0]?.getBoundingClientRect();
  const second = board?.children[1]?.getBoundingClientRect();
  if (!first || !second) return null;
  return { originX: first.left, originY: first.top, pitch: second.left - first.left, cell: first.width };
}

/** Top-left board cell the dragged piece would occupy, based on where its ghost is drawn. */
function ghostPosition(drag: DragState, shape: BlastShape) {
  const { rows, columns } = shapeSize(shape);
  const { pitch, cell } = drag.geometry;
  const width = columns * pitch - (pitch - cell);
  const height = rows * pitch - (pitch - cell);
  const left = drag.x - width / 2;
  const top = drag.pointerType === 'mouse' ? drag.y - height / 2 : drag.y - height - TOUCH_LIFT;
  return { left, top };
}

/**
 * Board cell under the ghost's top-left block. When the nearest cell doesn't fit, the other
 * surrounding cells are tried (closest first) so a slightly-off drop still snaps into place.
 */
function dragTarget(drag: DragState, shape: BlastShape, board: BlastBoard): [number, number] {
  const { left, top } = ghostPosition(drag, shape);
  const row = (top - drag.geometry.originY) / drag.geometry.pitch;
  const column = (left - drag.geometry.originX) / drag.geometry.pitch;
  const nearest: [number, number] = [Math.round(row), Math.round(column)];
  const candidates: [number, number][] = [];
  for (const r of [Math.floor(row), Math.ceil(row)]) {
    for (const c of [Math.floor(column), Math.ceil(column)]) candidates.push([r, c]);
  }
  candidates.sort((a, b) => Math.hypot(a[0] - row, a[1] - column) - Math.hypot(b[0] - row, b[1] - column));
  return candidates.find(([r, c]) => canPlaceShape(board, shape, r, c)) ?? nearest;
}

export function BlockBlastPage() {
  const { setId = '' } = useParams();
  const studySet = useRecallStore((state) => state.sets.find((item) => item.id === setId));
  const storedCards = useRecallStore((state) => state.cards);
  const sessions = useRecallStore((state) => state.sessions);
  const answerCard = useRecallStore((state) => state.answerCard);
  const reviseAnswer = useRecallStore((state) => state.reviseAnswer);
  const recordSession = useRecallStore((state) => state.recordSession);
  const cards = useMemo(() => storedCards.filter((card) => card.setId === setId), [setId, storedCards]);
  const [phase, setPhase] = useState<GamePhase>('intro');
  const [board, setBoard] = useState<BlastBoard>(() => createBlastBoard());
  const [tray, setTray] = useState<BlastPiece[]>([]);
  const [cardQueue, setCardQueue] = useState<string[]>([]);
  const [active, setActive] = useState<ActiveQuestion | null>(null);
  const [typedAnswer, setTypedAnswer] = useState('');
  const [miss, setMiss] = useState<MissFeedback | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredCell, setHoveredCell] = useState<[number, number] | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [invalidCell, setInvalidCell] = useState<string | null>(null);
  const [clearedCells, setClearedCells] = useState<Set<string>>(() => new Set());
  const [round, setRound] = useState(0);
  const [score, setScore] = useState(0);
  const [lines, setLines] = useState(0);
  const [combo, setCombo] = useState(0);
  const [bestCombo, setBestCombo] = useState(0);
  const [answers, setAnswers] = useState(0);
  const [correctAnswers, setCorrectAnswers] = useState(0);
  const startedAt = useRef(0);
  const gameSeed = useRef('');
  const turn = useRef(0);
  const weakCardIds = useRef(new Set<string>());
  const saved = useRef(false);
  const boardRef = useRef<HTMLDivElement>(null);
  const typedInput = useRef<HTMLInputElement>(null);
  const flashTimer = useRef<number | undefined>(undefined);
  const invalidTimer = useRef<number | undefined>(undefined);
  const clearTimer = useRef<number | undefined>(undefined);

  const draggedPiece = drag ? tray.find((piece) => piece.instanceId === drag.pieceId) : undefined;
  const selectedPiece = tray.find((piece) => piece.instanceId === selectedId && piece.charged);
  // Placed pieces were earned too, so the meter counts them alongside charged ones.
  const earned = TRAY_SIZE - tray.length + tray.filter((piece) => piece.charged).length;
  const bestScore = sessions
    .filter((session) => session.setId === setId && session.mode === 'blast')
    .reduce((best, session) => Math.max(best, Number(session.metadata?.score ?? 0)), 0);

  // Where the piece being dragged (or the tap-selected piece under the cursor) would land.
  const placement = useMemo(() => {
    let shape: BlastShape | undefined;
    let target: [number, number] | null = null;
    if (drag?.moved && draggedPiece) {
      shape = draggedPiece.shape;
      target = dragTarget(drag, shape, board);
    } else if (!drag && selectedPiece && hoveredCell) {
      shape = selectedPiece.shape;
      target = hoveredCell;
    }
    if (!shape || !target) return null;
    const [row, column] = target;
    if (!canPlaceShape(board, shape, row, column)) return null;
    const result = placeShape(board, shape, row, column);
    const clearing = new Set<string>();
    result.clearedRows.forEach((r) => { for (let c = 0; c < BLAST_BOARD_SIZE; c += 1) clearing.add(`${r}:${c}`); });
    result.clearedColumns.forEach((c) => { for (let r = 0; r < BLAST_BOARD_SIZE; r += 1) clearing.add(`${r}:${c}`); });
    return {
      cells: new Set(shape.cells.map(([dr, dc]) => `${row + dr}:${column + dc}`)),
      clearing
    };
  }, [board, drag, draggedPiece, hoveredCell, selectedPiece]);

  useEffect(() => () => {
    window.clearTimeout(flashTimer.current);
    window.clearTimeout(invalidTimer.current);
    window.clearTimeout(clearTimer.current);
  }, []);

  useEffect(() => {
    if (active?.question.kind !== 'typed' || miss) return;
    // Only auto-focus with a mouse; on phones the keyboard would cover the board every turn.
    if (window.matchMedia?.('(pointer: fine)').matches) typedInput.current?.focus();
  }, [active, miss]);

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

  /** Pull the next card from the rotation and build a question for it (format follows mastery). */
  function drawQuestion(queue: string[]): { question: ActiveQuestion | null; queue: string[] } {
    const [nextId, ...rest] = queue;
    const card = cards.find((item) => item.id === nextId);
    if (!card) return { question: null, queue };
    turn.current += 1;
    const progress = useRecallStore.getState().progress[card.id] ?? EMPTY_PROGRESS(card.id);
    return {
      question: { question: buildLearnQuestion(card, cards, progress, false), turn: turn.current },
      queue: [...rest, card.id]
    };
  }

  function askNext(queue: string[], nextTray: BlastPiece[]) {
    setTypedAnswer('');
    if (nextTray.every((piece) => piece.charged)) {
      setActive(null);
      setCardQueue(queue);
      return;
    }
    const drawn = drawQuestion(queue);
    setActive(drawn.question);
    setCardQueue(drawn.queue);
  }

  function chargeNextPiece(pieces: BlastPiece[]): BlastPiece[] {
    const index = pieces.findIndex((piece) => !piece.charged);
    return index < 0 ? pieces : pieces.map((piece, i) => (i === index ? { ...piece, charged: true } : piece));
  }

  function startGame() {
    const seed = String(Date.now());
    gameSeed.current = seed;
    turn.current = 0;
    weakCardIds.current = new Set();
    const firstTray = makeTray(0, seed);
    setBoard(createBlastBoard());
    setTray(firstTray);
    setSelectedId(null);
    setHoveredCell(null);
    setDrag(null);
    setMiss(null);
    setFlash(null);
    setClearedCells(new Set());
    setRound(0);
    setScore(0);
    setLines(0);
    setCombo(0);
    setBestCombo(0);
    setAnswers(0);
    setCorrectAnswers(0);
    askNext(seededShuffle(cards.map((card) => card.id), `${seed}:cards`), firstTray);
    setPhase('playing');
    saved.current = false;
    startedAt.current = Date.now();
  }

  function rewardCorrect(pieces: BlastPiece[], note?: string) {
    const nextTray = chargeNextPiece(pieces);
    setTray(nextTray);
    setCorrectAnswers((value) => value + 1);
    setScore((value) => value + 50);
    setFlash(note ?? (nextTray.every((piece) => piece.charged) ? 'All three charged — place them!' : 'Charged! Drag it onto the board.'));
    window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlash(null), note ? 3200 : 1600);
    return nextTray;
  }

  function submitAnswer(given: string) {
    if (!active || miss) return;
    const { question } = active;
    const typedGrade = question.kind === 'typed' ? gradeAnswer(given, question.answer) : null;
    const correct = typedGrade ? typedGrade !== 'wrong' : given === question.answer;
    const before = useRecallStore.getState().progress[question.cardId];
    void answerCard(question.cardId, { correct, kind: question.kind, answeredAt: Date.now() });
    setAnswers((value) => value + 1);
    if (correct) {
      askNext(cardQueue, rewardCorrect(tray, typedGrade === 'typo' ? `Close enough — it’s spelled “${question.answer}”.` : undefined));
      return;
    }
    weakCardIds.current.add(question.cardId);
    // Bring the missed card back after a couple of other questions.
    const queue = cardQueue.filter((id) => id !== question.cardId);
    queue.splice(Math.min(2, queue.length), 0, question.cardId);
    setCardQueue(queue);
    setMiss({ question, given: question.kind === 'typed' ? given.trim() : given, before });
  }

  function continueAfterMiss() {
    setMiss(null);
    askNext(cardQueue, tray);
  }

  function overrideMiss() {
    if (!miss) return;
    void reviseAnswer(miss.question.cardId, miss.before, { correct: true, kind: miss.question.kind, answeredAt: Date.now() });
    weakCardIds.current.delete(miss.question.cardId);
    setMiss(null);
    askNext(cardQueue, rewardCorrect(tray));
  }

  function rejectAt(row: number, column: number) {
    setInvalidCell(`${Math.max(0, Math.min(BLAST_BOARD_SIZE - 1, row))}:${Math.max(0, Math.min(BLAST_BOARD_SIZE - 1, column))}`);
    window.clearTimeout(invalidTimer.current);
    invalidTimer.current = window.setTimeout(() => setInvalidCell(null), 320);
  }

  function placePiece(piece: BlastPiece, row: number, column: number): boolean {
    if (!piece.charged) return false;
    if (!canPlaceShape(board, piece.shape, row, column)) {
      rejectAt(row, column);
      return false;
    }

    const result = placeShape(board, piece.shape, row, column);
    const clearedLines = result.clearedRows.length + result.clearedColumns.length;
    const nextCombo = clearedLines ? combo + 1 : 0;
    const points = piece.shape.cells.length * 10
      + result.clearedCellCount * 15
      + clearedLines * 100 * Math.max(1, nextCombo);
    let nextRound = round;
    let nextTray = tray.filter((item) => item.instanceId !== piece.instanceId);
    if (!nextTray.length) {
      nextRound += 1;
      nextTray = makeTray(nextRound, gameSeed.current);
    }

    if (clearedLines) {
      const cleared = new Set<string>();
      result.clearedRows.forEach((r) => { for (let c = 0; c < BLAST_BOARD_SIZE; c += 1) cleared.add(`${r}:${c}`); });
      result.clearedColumns.forEach((c) => { for (let r = 0; r < BLAST_BOARD_SIZE; r += 1) cleared.add(`${r}:${c}`); });
      setClearedCells(cleared);
      window.clearTimeout(clearTimer.current);
      clearTimer.current = window.setTimeout(() => setClearedCells(new Set()), 420);
    }

    setBoard(result.board);
    setTray(nextTray);
    setRound(nextRound);
    setScore((value) => value + points);
    setLines((value) => value + clearedLines);
    setCombo(nextCombo);
    setBestCombo((value) => Math.max(value, nextCombo));
    setSelectedId(null);
    setHoveredCell(null);
    // A fresh tray arrives uncharged, so resume questions if none is showing.
    if (!active && !miss) askNext(cardQueue, nextTray);

    if (!trayHasMove(result.board, nextTray.map((item) => item.shape))) setPhase('finished');
    return true;
  }

  function onPiecePointerDown(event: ReactPointerEvent<HTMLButtonElement>, piece: BlastPiece) {
    if (!piece.charged || (event.pointerType === 'mouse' && event.button !== 0)) return;
    const geometry = measureBoard(boardRef.current);
    if (!geometry) return;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Capture can fail for synthetic pointers; touch pointers are implicitly captured anyway.
    }
    setDrag({
      pieceId: piece.instanceId,
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      moved: false,
      geometry
    });
  }

  function onPiecePointerMove(event: ReactPointerEvent<HTMLButtonElement>) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const moved = drag.moved || Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > DRAG_THRESHOLD;
    setDrag({ ...drag, x: event.clientX, y: event.clientY, moved });
  }

  function onPiecePointerUp(event: ReactPointerEvent<HTMLButtonElement>, piece: BlastPiece) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    setDrag(null);
    if (!drag.moved) {
      // A tap still works: select the piece, then tap a board cell.
      setSelectedId((current) => (current === piece.instanceId ? null : piece.instanceId));
      return;
    }
    const [row, column] = dragTarget({ ...drag, x: event.clientX, y: event.clientY }, piece.shape, board);
    const onBoard = row > -2 && column > -2 && row < BLAST_BOARD_SIZE + 1 && column < BLAST_BOARD_SIZE + 1;
    if (onBoard) placePiece(piece, row, column);
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
        <p>Every correct answer charges one piece. Drag charged pieces onto the board to clear rows and columns — a new set of three only arrives once you’ve earned and placed them all.</p>
        {bestScore > 0 && <span className="blast-best"><Trophy size={14} /> Best {bestScore.toLocaleString()}</span>}
        <button className="button button--accent" onClick={startGame}>Build a mosaic <Sparkles size={18} /></button>
      </div>
    );
  }

  const question = active?.question;
  const ghost = drag?.moved && draggedPiece ? ghostPosition(drag, draggedPiece.shape) : null;

  return (
    <div className={`focus-page blast-game${drag?.moved ? ' is-dragging' : ''}`}>
      <header className="blast-hud">
        <Link to={`/sets/${setId}`} className="icon-button icon-button--bordered" aria-label="Leave Block Blast"><X /></Link>
        <div><small>Score</small><strong>{score.toLocaleString()}</strong></div>
        <div><small>Lines</small><strong>{lines}</strong></div>
        <div className={combo > 1 ? 'is-hot' : ''}><small>Combo</small><strong>×{Math.max(1, combo)}</strong></div>
      </header>

      <main className="blast-stage">
        <section className="blast-recall" aria-live="polite">
          <div className="blast-charge" aria-label={`${earned} of ${TRAY_SIZE} pieces earned this round`}>
            {Array.from({ length: TRAY_SIZE }, (_, index) => <i key={index} className={index < earned ? 'is-on' : ''} />)}
            <span>{earned}/{TRAY_SIZE} pieces earned</span>
          </div>
          {miss ? (
            <div className="blast-miss">
              <div className="blast-feedback is-wrong"><Sparkles /><span><strong>Not quite</strong>
                {miss.given !== undefined && miss.question.kind === 'typed' && <small>You wrote: {miss.given}</small>}
                <small>Answer: {miss.question.answer}</small></span></div>
              <div className="blast-miss__actions">
                {miss.question.kind === 'typed' && <button className="button button--secondary" onClick={overrideMiss}><ThumbsUp size={16} /> I was right</button>}
                <button className="button button--primary" onClick={continueAfterMiss} autoFocus>Next question <ArrowRight size={16} /></button>
              </div>
            </div>
          ) : question ? (
            <>
              <div className="blast-recall__heading"><span>{question.kind === 'typed' ? 'Type the term' : 'Choose the answer'}</span>{flash && <em className="blast-flash">{flash}</em>}</div>
              <h1>{question.prompt}</h1>
              {question.kind === 'typed' ? (
                <form className="blast-typed" onSubmit={(event) => { event.preventDefault(); if (typedAnswer.trim()) submitAnswer(typedAnswer); }}>
                  <input ref={typedInput} value={typedAnswer} onChange={(event) => setTypedAnswer(event.target.value)} placeholder="Type what you remember…" autoComplete="off" enterKeyHint="done" />
                  <button className="button button--primary" disabled={!typedAnswer.trim()}>Check</button>
                </form>
              ) : (
                <div className="blast-options">{question.options?.map((option) => <button key={option} onClick={() => submitAnswer(option)}>{option}</button>)}</div>
              )}
            </>
          ) : (
            <div className="blast-prompt"><Grid3X3 /><span><strong>{flash ?? 'All pieces charged'}</strong><small>Drag each piece onto the board. Placing all three deals a new set.</small></span></div>
          )}
        </section>

        <section className="blast-board-wrap">
          <div ref={boardRef} className="blast-board" role="grid" aria-label="Block Blast board" onMouseLeave={() => setHoveredCell(null)}>
            {board.flatMap((line, row) => line.map((filled, column) => {
              const key = `${row}:${column}`;
              const classes = [
                filled ? 'is-filled' : '',
                placement?.cells.has(key) ? 'is-preview' : '',
                placement?.clearing.has(key) ? 'is-clearing' : '',
                clearedCells.has(key) ? 'is-cleared' : '',
                invalidCell === key ? 'is-invalid' : ''
              ].filter(Boolean).join(' ');
              return (
                <button
                  key={key}
                  className={classes}
                  type="button"
                  tabIndex={selectedPiece ? 0 : -1}
                  aria-label={`Row ${row + 1}, column ${column + 1}${filled ? ', filled' : ''}`}
                  onMouseEnter={() => setHoveredCell([row, column])}
                  onFocus={() => setHoveredCell([row, column])}
                  onClick={() => { if (selectedPiece) placePiece(selectedPiece, row, column); }}
                />
              );
            }))}
          </div>
        </section>

        <section className="blast-tray" aria-label="Available pieces">
          {tray.map((piece) => {
            const isDragging = drag?.moved && drag.pieceId === piece.instanceId;
            return (
              <button
                key={piece.instanceId}
                className={[
                  piece.charged ? 'is-charged' : 'is-locked',
                  selectedId === piece.instanceId ? 'is-selected' : '',
                  isDragging ? 'is-dragging' : ''
                ].filter(Boolean).join(' ')}
                type="button"
                aria-pressed={selectedId === piece.instanceId}
                aria-label={piece.charged ? 'Charged piece: drag it onto the board, or tap it and then tap a cell' : 'Locked piece: answer a question correctly to charge it'}
                onPointerDown={(event) => onPiecePointerDown(event, piece)}
                onPointerMove={onPiecePointerMove}
                onPointerUp={(event) => onPiecePointerUp(event, piece)}
                onPointerCancel={() => setDrag(null)}
                onClick={(event) => {
                  // Keyboard activation (pointer taps are handled in pointerup).
                  if (event.detail === 0 && piece.charged) setSelectedId((current) => (current === piece.instanceId ? null : piece.instanceId));
                }}
              >
                <ShapeGlyph shape={piece.shape} />
                <span>{piece.charged ? 'drag' : <><Lock size={9} /> answer</>}</span>
              </button>
            );
          })}
        </section>
      </main>

      {ghost && draggedPiece && drag && (
        <div className="blast-ghost" style={{ left: ghost.left, top: ghost.top }} aria-hidden="true">
          <ShapeGlyph shape={draggedPiece.shape} cell={drag.geometry.cell} gap={drag.geometry.pitch - drag.geometry.cell} />
        </div>
      )}
    </div>
  );
}
