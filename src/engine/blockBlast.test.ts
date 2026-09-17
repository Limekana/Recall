import { describe, expect, it } from 'vitest';
import {
  BLAST_BOARD_SIZE,
  BLAST_SHAPES,
  canPlaceShape,
  createBlastBoard,
  placeShape,
  shapeFitsBoard,
  trayHasMove
} from './blockBlast';

const shape = (id: string) => BLAST_SHAPES.find((candidate) => candidate.id === id)!;

describe('Block Blast engine', () => {
  it('rejects overlap and out-of-bounds placements', () => {
    const board = createBlastBoard();
    board[0][0] = true;
    expect(canPlaceShape(board, shape('dot'), 0, 0)).toBe(false);
    expect(canPlaceShape(board, shape('square'), 7, 7)).toBe(false);
    expect(canPlaceShape(board, shape('duo-h'), 4, 4)).toBe(true);
  });

  it('clears a completed row', () => {
    const board = createBlastBoard();
    for (let column = 0; column < BLAST_BOARD_SIZE - 1; column += 1) board[3][column] = true;
    const result = placeShape(board, shape('dot'), 3, BLAST_BOARD_SIZE - 1);
    expect(result.clearedRows).toEqual([3]);
    expect(result.clearedColumns).toEqual([]);
    expect(result.clearedCellCount).toBe(8);
    expect(result.board[3].every((cell) => !cell)).toBe(true);
  });

  it('clears crossing rows and columns without double-counting the intersection', () => {
    const board = createBlastBoard();
    for (let index = 0; index < BLAST_BOARD_SIZE - 1; index += 1) {
      board[7][index] = true;
      board[index][7] = true;
    }
    const result = placeShape(board, shape('dot'), 7, 7);
    expect(result.clearedRows).toEqual([7]);
    expect(result.clearedColumns).toEqual([7]);
    expect(result.clearedCellCount).toBe(15);
  });

  it('detects when a tray has no legal move', () => {
    const board = createBlastBoard().map((line) => line.map(() => true));
    board[0][0] = false;
    expect(shapeFitsBoard(board, shape('dot'))).toBe(true);
    expect(shapeFitsBoard(board, shape('duo-h'))).toBe(false);
    expect(trayHasMove(board, [shape('duo-h'), shape('square')])).toBe(false);
  });
});
