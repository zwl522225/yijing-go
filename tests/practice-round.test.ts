import { describe, expect, it } from "vitest";
import { getPracticeTopics, getWrongQuestionPractice, type PracticeItem } from "@/lib/learning/practice";
import { createDefaultProgress } from "@/lib/learning/progress";
import { LESSON_UNIT_IDS } from "@/lib/learning/types";
import {
  applyPracticeRoundEvent, createPracticeRound, isIndependentPractice,
  nextPracticeRound, retryPracticeRound,
  type PracticeRecord, type PracticeRound, type PracticeRoundEvent,
} from "@/lib/learning/practice-round";

const emptyRecord: PracticeRecord = { attempts: 0, errors: 0, hintUsed: false, resets: 0, completed: false };

function catalog(): PracticeItem[] {
  const progress = createDefaultProgress();
  progress.completedUnitIds = [...LESSON_UNIT_IDS];
  progress.bestQuizScores = { "stage-1": 100, "stage-2": 100 };
  return getPracticeTopics(progress).flatMap(topic => topic.items);
}

function roundFor(items = catalog(), offset = 0, id = 1): PracticeRound {
  const round = createPracticeRound(items, offset, id);
  if (!round) throw new Error("catalog must have practice items");
  return round;
}

function send(round: PracticeRound, event: { type: "answer"; completed: boolean } |
  { type: "hint" | "reset" | "next" | "finish" }): PracticeRound {
  return applyPracticeRoundEvent(round, {
    roundId: round.id, exerciseId: round.items[round.index].exercise.id, ...event,
  });
}

function finish(round: PracticeRound): PracticeRound {
  return send(round, { type: "finish" });
}

function complete(round: PracticeRound): PracticeRound {
  return applyPracticeRoundEvent(round, {
    roundId: round.id, exerciseId: round.items[round.index].exercise.id, type: "answer", completed: true,
  });
}

function freezeDeep(value: object): void {
  Object.values(value).forEach(child => {
    if (child && typeof child === "object") freezeDeep(child);
  });
  Object.freeze(value);
}

describe("practice round creation and source pagination", () => {
  it("returns null for empty input and creates zeroed one-item or five-item groups", () => {
    expect(createPracticeRound([])).toBeNull();
    for (const length of [1, 5]) {
      const items = catalog().slice(0, length);
      const round = roundFor(items);
      expect(round).toMatchObject({ id: 1, source: items, items, index: 0, phase: "active", nextOffset: length });
      expect(Object.keys(round.records)).toEqual(items.map(item => item.exercise.id));
      Object.values(round.records).forEach(record => expect(record).toEqual(emptyRecord));
    }
  });

  it("uses stable exercise IDs to deduplicate before taking the first five", () => {
    const items = catalog().slice(0, 7);
    const duplicate = { ...items[0], title: "later duplicate" };
    const round = roundFor([items[0], items[1], duplicate, ...items.slice(2)]);
    expect(round.source).toEqual(items);
    expect(round.items).toEqual(items.slice(0, 5));
    expect(round.items[0].title).toBe(items[0].title);
    expect(round.nextOffset).toBe(5);
  });

  it("snapshots nested source content so caller edits cannot change this round or later groups", () => {
    const input = structuredClone(catalog().slice(0, 7));
    const before = structuredClone(input);
    const round = roundFor(input);
    input[0].exercise.prompt = "changed";
    input[0].exercise.position.stones.push(["white", 0, 0]);
    input[0].exercise.hints[0].text = "changed hint";
    input[0].terms.push("komi");
    input[5].title = "changed later group";
    input.splice(1, 2);
    expect(round.source).toEqual(before);
    expect(round.items).toEqual(before.slice(0, 5));
    expect(nextPracticeRound(finish(round))?.items).toEqual(before.slice(5));
  });

  it("takes the remaining tail then restarts the original source at zero with new IDs", () => {
    const items = catalog().slice(0, 7);
    const first = roundFor(items, 0, 19);
    expect(nextPracticeRound(first)).toBeNull();
    const tail = nextPracticeRound(finish(first));
    expect(tail).toMatchObject({ id: 20, items: items.slice(5), nextOffset: 7 });
    const restarted = nextPracticeRound(finish(tail!));
    expect(restarted).toMatchObject({ id: 21, items: items.slice(0, 5), nextOffset: 5 });
    expect(restarted?.source).toEqual(items);
  });

  it("normalizes nonfinite, negative, fractional, and excessive offsets", () => {
    const items = catalog().slice(0, 7);
    for (const offset of [NaN, Infinity, -Infinity, -10]) {
      expect(roundFor(items, offset).items).toEqual(items.slice(0, 5));
    }
    expect(roundFor(items, 2.9).items).toEqual(items.slice(2, 7));
    expect(roundFor(items, 100).items).toEqual(items.slice(6));
  });

  it("uses existing topic unlock filtering without changing progress or the catalog", () => {
    const progress = createDefaultProgress();
    const before = structuredClone(progress);
    const items = getPracticeTopics(progress).flatMap(topic => topic.items);
    const beforeItems = structuredClone(items);
    freezeDeep(items);
    const round = roundFor(items);
    expect(new Set(round.source.map(item => item.unitId))).toEqual(new Set(["s1-intersections-turns"]));
    const summary = finish(complete(round));
    nextPracticeRound(summary);
    retryPracticeRound(summary);
    expect(progress).toEqual(before);
    expect(items).toEqual(beforeItems);
  });

  it("keeps only known unlocked wrong-question items supplied by the catalog", () => {
    const progress = createDefaultProgress();
    progress.completedUnitIds = [...LESSON_UNIT_IDS.slice(0, 7)];
    const quizzes = catalog().filter(item => item.unitId.endsWith("checkpoint"));
    const firstId = quizzes[0].exercise.id;
    const lockedId = quizzes.find(item => item.unitId === "s2-checkpoint")!.exercise.id;
    progress.wrongQuestionIds = [firstId, firstId, lockedId, "unknown"];
    const before = structuredClone(progress);
    const round = roundFor(getWrongQuestionPractice(progress));
    expect(round.source.map(item => item.exercise.id)).toEqual([firstId]);
    expect(progress).toEqual(before);
  });
});

describe("practice attempt records and guarded events", () => {
  it("records wrong attempts, hints and resets without erasing history, then locks success", () => {
    let round = roundFor();
    const initial = round;
    const currentId = round.items[0].exercise.id;
    round = applyPracticeRoundEvent(round, { roundId: round.id, exerciseId: currentId, type: "answer", completed: false });
    round = send(round, { type: "hint" });
    round = send(round, { type: "reset" });
    round = send(round, { type: "reset" });
    round = complete(round);
    expect(round.records[currentId]).toEqual({ attempts: 2, errors: 1, hintUsed: true, resets: 2, completed: true });
    expect(initial.records[currentId]).toEqual(emptyRecord);
    for (const event of [{ type: "hint" }, { type: "reset" }, { type: "answer", completed: false }, { type: "answer", completed: true }] as const) {
      expect(send(round, event)).toBe(round);
    }
  });

  it("advances only completed items and enters summary on the last next", () => {
    let round = roundFor(catalog().slice(0, 2));
    expect(send(round, { type: "next" })).toBe(round);
    round = send(complete(round), { type: "next" });
    expect(round.index).toBe(1);
    expect(round.phase).toBe("active");
    expect(round.records[round.items[1].exercise.id]).toEqual(emptyRecord);
    round = send(complete(round), { type: "next" });
    expect(round).toMatchObject({ index: 1, phase: "summary" });
    expect(Object.values(round.records).every(isIndependentPractice)).toBe(true);
  });

  it("ignores events for another round or another exercise", () => {
    const round = roundFor();
    for (const event of [
      { roundId: round.id - 1, exerciseId: round.items[0].exercise.id, type: "answer", completed: true },
      { roundId: round.id, exerciseId: round.items[1].exercise.id, type: "hint" },
      { roundId: round.id + 1, exerciseId: round.items[0].exercise.id, type: "finish" },
      { roundId: round.id, exerciseId: "unknown", type: "reset" },
    ] as PracticeRoundEvent[]) expect(applyPracticeRoundEvent(round, event)).toBe(round);
  });

  it("ignores a duplicate next from an old exercise even when the new exercise is complete", () => {
    const first = complete(roundFor());
    const event: PracticeRoundEvent = { roundId: first.id, exerciseId: first.items[0].exercise.id, type: "next" };
    const second = applyPracticeRoundEvent(first, event);
    expect(applyPracticeRoundEvent(second, event)).toBe(second);
    const completedSecond = complete(second);
    expect(applyPracticeRoundEvent(completedSecond, event)).toBe(completedSecond);
    expect(completedSecond.index).toBe(1);
  });

  it("allows finishing before any answer and retains all unattempted incomplete records", () => {
    const active = roundFor();
    const summary = finish(active);
    expect(summary).toMatchObject({ phase: "summary", index: 0 });
    Object.values(summary.records).forEach(record => expect(record).toEqual(emptyRecord));
    for (const event of [{ type: "next" }, { type: "finish" }, { type: "hint" }, { type: "reset" }, { type: "answer", completed: true }] as const) {
      expect(send(summary, event)).toBe(summary);
    }
    expect(active.phase).toBe("active");
  });

  it("does not mutate deeply frozen round input during answer, hint, reset, next or finish", () => {
    const round = roundFor();
    freezeDeep(round);
    const before = structuredClone(round);
    const answered = complete(round);
    freezeDeep(answered);
    expect(send(answered, { type: "next" }).index).toBe(1);
    expect(send(round, { type: "hint" }).records[round.items[0].exercise.id].hintUsed).toBe(true);
    expect(send(round, { type: "reset" }).records[round.items[0].exercise.id].resets).toBe(1);
    const summary = finish(round);
    freezeDeep(summary);
    expect(summary.phase).toBe("summary");
    expect(retryPracticeRound(summary)?.id).toBe(round.id + 1);
    expect(nextPracticeRound(summary)?.id).toBe(round.id + 1);
    expect(round).toEqual(before);
  });
});

describe("summary independent performance and retries", () => {
  it("recognizes independent completion only with one correct unaided attempt and no reset", () => {
    const independent: PracticeRecord = { ...emptyRecord, attempts: 1, completed: true };
    expect(isIndependentPractice(independent)).toBe(true);
    for (const change of [{ completed: false }, { attempts: 0 }, { attempts: 2 }, { errors: 1 }, { hintUsed: true }, { resets: 1 }]) {
      expect(isIndependentPractice({ ...independent, ...change })).toBe(false);
    }
  });

  it("retries nonindependent and unfinished items in order with fresh metrics", () => {
    let round = roundFor();
    expect(retryPracticeRound(round)).toBeNull();
    round = send(complete(round), { type: "next" });
    round = send(send(complete(send(round, { type: "hint" })), { type: "next" }), { type: "reset" });
    round = send(complete(round), { type: "next" });
    round = applyPracticeRoundEvent(round, {
      roundId: round.id, exerciseId: round.items[round.index].exercise.id, type: "answer", completed: false,
    });
    round = send(complete(round), { type: "next" });
    const summary = finish(round);
    const retry = retryPracticeRound(summary);
    expect(retry).toMatchObject({ id: 2, phase: "active", index: 0, nextOffset: 5 });
    expect(retry?.items).toEqual(summary.items.slice(1));
    Object.values(retry!.records).forEach(record => expect(record).toEqual(emptyRecord));
    expect(summary.records[summary.items[1].exercise.id].hintUsed).toBe(true);
    expect(summary.records[summary.items[2].exercise.id].resets).toBe(1);
    expect(summary.records[summary.items[3].exercise.id].errors).toBe(1);
  });

  it("preserves the original source cursor through repeated retries and ignores prior round callbacks", () => {
    const original = roundFor(catalog().slice(0, 12), 5, 40);
    const summary = finish(original);
    const firstRetry = retryPracticeRound(summary)!;
    const wrong = applyPracticeRoundEvent(firstRetry, { roundId: firstRetry.id, exerciseId: firstRetry.items[0].exercise.id, type: "answer", completed: false });
    const secondRetry = retryPracticeRound(finish(wrong))!;
    expect(secondRetry).toMatchObject({ id: 42, source: original.source, items: original.items, nextOffset: 10 });
    Object.values(secondRetry.records).forEach(record => expect(record).toEqual(emptyRecord));
    const stale: PracticeRoundEvent = { roundId: firstRetry.id, exerciseId: secondRetry.items[0].exercise.id, type: "answer", completed: true };
    expect(applyPracticeRoundEvent(secondRetry, stale)).toBe(secondRetry);
    expect(nextPracticeRound(finish(secondRetry))).toMatchObject({ id: 43, items: original.source.slice(10), nextOffset: 12 });
  });

  it("returns no retry after every item was completed independently", () => {
    let round = roundFor(catalog().slice(0, 2));
    round = send(complete(round), { type: "next" });
    round = send(complete(round), { type: "next" });
    expect(retryPracticeRound(round)).toBeNull();
  });
});
