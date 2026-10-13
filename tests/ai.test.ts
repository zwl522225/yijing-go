import { describe, expect, it } from "vitest";

import { chooseMove, suggestMoves } from "@/lib/go/ai";
import { createGame, playMove } from "@/lib/go/rules";

describe("chooseMove", () => {
  it("suggests the center on a five-line board", () => {
    expect(suggestMoves(createGame({ size: 5 }), 1)).toEqual([{ x: 2, y: 2 }]);
  });

  it("suggests an efficient line near the center on a nine-line board", () => {
    expect(suggestMoves(createGame({ size: 9 }), 1)).toEqual([{ x: 4, y: 3 }]);
  });

  it.each(["beginner", "intermediate", "challenge"] as const)(
    "returns a legal %s move on a nine-line board",
    (difficulty) => {
      const state = createGame({ size: 9 });
      const move = chooseMove(state, difficulty, 7);
      expect("pass" in move).toBe(false);
      if ("pass" in move) throw new Error("Expected a move on an empty board");
      expect(move.x).toBeLessThan(9);
      expect(move.y).toBeLessThan(9);
      expect(playMove(state, move).ok).toBe(true);
    },
  );

  it.each(["beginner", "intermediate", "challenge"] as const)(
    "returns a legal %s move",
    (difficulty) => {
      const state = createGame({
        stones: [
          ["black", 3, 3],
          ["white", 15, 15],
        ],
        toPlay: "black",
      });
      const move = chooseMove(state, difficulty, 42);
      expect("pass" in move || playMove(state, move).ok).toBe(true);
    },
  );

  it("takes an immediate capture even on beginner", () => {
    const state = createGame({
      stones: [
        ["white", 1, 1],
        ["black", 0, 1],
        ["black", 1, 0],
        ["black", 2, 1],
      ],
      toPlay: "black",
    });

    expect(chooseMove(state, "beginner", 7)).toEqual({ x: 1, y: 2 });
  });

  it("returns reproducible suggestions that are unique and legal", () => {
    const state = createGame({ stones: [["black", 9, 9]], toPlay: "white" });
    const suggestions = suggestMoves(state, 3);

    expect(suggestions).toHaveLength(3);
    expect(new Set(suggestions.map(({ x, y }) => `${x},${y}`)).size).toBe(3);
    expect(suggestions.every((move) => playMove(state, move).ok)).toBe(true);
  });

  it("passes after the game has finished", () => {
    const state = { ...createGame(), consecutivePasses: 2 };
    expect(chooseMove(state, "challenge", 1)).toEqual({ pass: true });
  });
});
