import type { PracticeItem } from "@/lib/learning/practice";

export type PracticeRecord = {
  attempts: number;
  errors: number;
  hintUsed: boolean;
  resets: number;
  completed: boolean;
};

export type PracticeRound = {
  id: number;
  source: readonly PracticeItem[];
  items: readonly PracticeItem[];
  index: number;
  phase: "active" | "summary";
  nextOffset: number;
  records: Readonly<Record<string, PracticeRecord>>;
};

export type PracticeRoundEvent = { roundId: number; exerciseId: string } & (
  | { type: "answer"; completed: boolean }
  | { type: "hint" }
  | { type: "reset" }
  | { type: "next" }
  | { type: "finish" }
);

const GROUP_SIZE = 5;

function newRound(
  source: readonly PracticeItem[], items: readonly PracticeItem[], nextOffset: number, id: number,
): PracticeRound {
  return {
    id, source, items, index: 0, phase: "active", nextOffset,
    records: Object.fromEntries(items.map(item => [item.exercise.id, {
      attempts: 0, errors: 0, hintUsed: false, resets: 0, completed: false,
    }])),
  };
}

export function createPracticeRound(items: readonly PracticeItem[], offset = 0, id = 1): PracticeRound | null {
  const seen = new Set<string>();
  const unique = items.filter(item => {
    if (seen.has(item.exercise.id)) return false;
    seen.add(item.exercise.id);
    return true;
  });
  if (unique.length === 0) return null;
  // Snapshot nested positions, hints and choices as well as the source array.
  const source = structuredClone(unique);
  const start = Number.isFinite(offset) ? Math.min(Math.max(Math.trunc(offset), 0), source.length - 1) : 0;
  const group = source.slice(start, start + GROUP_SIZE);
  return newRound(source, group, start + group.length, id);
}

export function applyPracticeRoundEvent(round: PracticeRound, event: PracticeRoundEvent): PracticeRound {
  if (round.phase !== "active" || event.roundId !== round.id ||
    event.exerciseId !== round.items[round.index]?.exercise.id) return round;

  if (event.type === "finish") return { ...round, phase: "summary" };

  const record = round.records[event.exerciseId];
  if (event.type === "next") {
    if (!record.completed) return round;
    return round.index + 1 < round.items.length
      ? { ...round, index: round.index + 1 }
      : { ...round, phase: "summary" };
  }
  if (record.completed) return round;

  let updated: PracticeRecord;
  switch (event.type) {
    case "answer":
      updated = {
        ...record, attempts: record.attempts + 1,
        errors: record.errors + (event.completed ? 0 : 1), completed: event.completed,
      };
      break;
    case "hint":
      updated = { ...record, hintUsed: true };
      break;
    case "reset":
      updated = { ...record, resets: record.resets + 1 };
      break;
  }
  return { ...round, records: { ...round.records, [event.exerciseId]: updated } };
}

export function isIndependentPractice(record: PracticeRecord): boolean {
  return record.completed && record.attempts === 1 && record.errors === 0 && !record.hintUsed && record.resets === 0;
}

export function retryPracticeRound(round: PracticeRound): PracticeRound | null {
  if (round.phase !== "summary") return null;
  const items = round.items.filter(item => !isIndependentPractice(round.records[item.exercise.id]));
  return items.length ? newRound(round.source, items, round.nextOffset, round.id + 1) : null;
}

export function nextPracticeRound(round: PracticeRound): PracticeRound | null {
  if (round.phase !== "summary") return null;
  const start = round.nextOffset >= round.source.length ? 0 : round.nextOffset;
  const items = round.source.slice(start, start + GROUP_SIZE);
  return items.length ? newRound(round.source, items, start + items.length, round.id + 1) : null;
}
