import { describe, expect, it } from "vitest";

import { createGame } from "@/lib/go/rules";
import { scoreArea } from "@/lib/go/scoring";

describe("scoreArea", () => {
  it("scores the complete area of a five-line board", () => {
    const game = createGame({
      size: 5,
      stones: [
        ["black", 0, 0],
        ["white", 4, 4],
      ],
    });
    const score = scoreArea(game.board, new Set(), 0.5);

    expect(score.black.stones).toBe(1);
    expect(score.white.stones).toBe(1);
    expect(score.black.territory).toBe(0);
    expect(score.white.territory).toBe(0);
    expect(score.neutral).toBe(23);
    expect(
      score.black.stones + score.white.stones + score.neutral +
      score.black.territory + score.white.territory,
    ).toBe(25);
  });

  it("counts living stones and surrounded empty points with komi", () => {
    const game = createGame({
      stones: [
        ["black", 0, 1],
        ["black", 1, 0],
        ["black", 1, 1],
        ["white", 18, 18],
      ],
      toPlay: "black",
    });

    const score = scoreArea(game.board, new Set<string>(), 7.5);

    expect(score.black.area).toBe(4);
    expect(score.white.total).toBe(8.5);
    expect(score.winner).toBe("white");
  });

  it("removes marked dead stones before assigning territory", () => {
    const game = createGame({
      stones: [
        ["black", 0, 1],
        ["black", 1, 0],
        ["black", 1, 1],
        ["white", 0, 0],
        ["white", 18, 18],
      ],
      toPlay: "black",
    });

    const score = scoreArea(game.board, new Set(["0,0"]), 0.5);

    expect(score.black.area).toBe(4);
    expect(score.dead.white).toBe(1);
  });
});
