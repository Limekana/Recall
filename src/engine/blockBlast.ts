import { seededNumber } from '../lib/utils';

export const BLAST_BOARD_SIZE = 8;

export type BlastBoard = boolean[][];
export type BlastCell = readonly [row: number, column: number];

export interface BlastShape {
  id: string;
  cells: readonly BlastCell[];
}

export interface BlastPlacement {
  board: BlastBoard;
  clearedRows: number[];
  clearedColumns: number[];
  clearedCellCount: number;
}

export const BLAST_SHAPES: readonly BlastShape[] = [
  { id: 'dot', cells: [[0, 0]] },
  { id: 'duo-h', cells: [[0, 0], [0, 1]] },
  { id: 'duo-v', cells: [[0, 0], [1, 0]] },
  { id: 'trio-h', cells: [[0, 0], [0, 1], [0, 2]] },
  { id: 'trio-v', cells: [[0, 0], [1, 0], [2, 0]] },
  { id: 'square', cells: [[0, 0], [0, 1], [1, 0], [1, 1]] },
  { id: 'corner', cells: [[0, 0], [1, 0], [1, 1]] },
  { id: 'corner-flip', cells: [[0, 1], [1, 0], [1, 1]] },
  { id: 'tee', cells: [[0, 0], [0, 1], [0, 2], [1, 1]] },
  { id: 'four-h', cells: [[0, 0], [0, 1], [0, 2], [0, 3]] },
  { id: 'four-v', cells: [[0, 0], [1, 0], [2, 0], [3, 0]] },
  { id: 'stair', cells: [[0, 0], [0, 1], [1, 1], [1, 2]] }
] as const;

export function createBlastBoard(): BlastBoard {
  return Array.from({ length: BLAST_BOARD_SIZE }, () => Array<boolean>(BLAST_BOARD_SIZE).fill(false));
}

export function canPlaceShape(board: BlastBoard, shape: BlastShape, row: number, column: number): boolean {
  return shape.cells.every(([rowOffset, columnOffset]) => {
    const targetRow = row + rowOffset;
    const targetColumn = column + columnOffset;
    return targetRow >= 0
      && targetColumn >= 0
      && targetRow < BLAST_BOARD_SIZE
      && targetColumn < BLAST_BOARD_SIZE
      && !board[targetRow]?.[targetColumn];
  });
}

export function placeShape(board: BlastBoard, shape: BlastShape, row: number, column: number): BlastPlacement {
  if (!canPlaceShape(board, shape, row, column)) throw new RangeError('Shape cannot be placed at that position.');

  const next = board.map((line) => [...line]);
  shape.cells.forEach(([rowOffset, columnOffset]) => {
    next[row + rowOffset][column + columnOffset] = true;
  });

  const clearedRows = next
    .map((line, index) => line.every(Boolean) ? index : -1)
    .filter((index) => index >= 0);
  const clearedColumns = Array.from({ length: BLAST_BOARD_SIZE }, (_, index) => index)
    .filter((columnIndex) => next.every((line) => line[columnIndex]));
  const clearedCells = new Set<string>();

  clearedRows.forEach((rowIndex) => {
    for (let columnIndex = 0; columnIndex < BLAST_BOARD_SIZE; columnIndex += 1) {
      clearedCells.add(`${rowIndex}:${columnIndex}`);
      next[rowIndex][columnIndex] = false;
    }
  });
  clearedColumns.forEach((columnIndex) => {
    for (let rowIndex = 0; rowIndex < BLAST_BOARD_SIZE; rowIndex += 1) {
      clearedCells.add(`${rowIndex}:${columnIndex}`);
      next[rowIndex][columnIndex] = false;
    }
  });

  return {
    board: next,
    clearedRows,
    clearedColumns,
    clearedCellCount: clearedCells.size
  };
}

export function shapeFitsBoard(board: BlastBoard, shape: BlastShape): boolean {
  for (let row = 0; row < BLAST_BOARD_SIZE; row += 1) {
    for (let column = 0; column < BLAST_BOARD_SIZE; column += 1) {
      if (canPlaceShape(board, shape, row, column)) return true;
    }
  }
  return false;
}

export function trayHasMove(board: BlastBoard, shapes: readonly BlastShape[]): boolean {
  return shapes.some((shape) => shapeFitsBoard(board, shape));
}

export function createBlastTray(seed: string, count = 3): BlastShape[] {
  return Array.from({ length: count }, (_, index) => {
    const shapeIndex = seededNumber(`${seed}:${index}`) % BLAST_SHAPES.length;
    return BLAST_SHAPES[shapeIndex];
  });
}
