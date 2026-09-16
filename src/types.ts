export type StudyMode = 'flashcards' | 'learn' | 'review' | 'test' | 'match' | 'rapid';
export type QuestionKind = 'choice' | 'typed' | 'true-false';

export interface StudySet {
  id: string;
  title: string;
  subject: string;
  tags: string[];
  archived: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface Card {
  id: string;
  setId: string;
  term: string;
  definition: string;
  starred: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface CardProgress {
  cardId: string;
  mastery: number;
  timesSeen: number;
  correctCount: number;
  incorrectCount: number;
  streak: number;
  lastSeen: number | null;
  nextReview: number;
}

export interface StudySession {
  id: string;
  setId: string;
  mode: StudyMode;
  startedAt: number;
  finishedAt: number;
  score: number;
  total: number;
  weakCardIds: string[];
  metadata?: Record<string, number | string | boolean>;
}

export interface AnswerEvent {
  correct: boolean;
  kind: QuestionKind;
  answeredAt: number;
}

export interface TestQuestion {
  id: string;
  cardId: string;
  kind: QuestionKind;
  prompt: string;
  answer: string;
  options?: string[];
  shownStatement?: string;
  expectedBoolean?: boolean;
}

export interface ImportRow {
  index: number;
  cells: string[];
  valid: boolean;
  error?: string;
}
