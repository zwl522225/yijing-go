import { Children, createElement, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { ControlPanel } from "@/components/game/control-panel";
import { Select } from "@/components/ui/select";
import type { GoGameController } from "@/hooks/use-go-game";
import { createGame } from "@/lib/go/rules";

describe("ControlPanel", () => {
  it("shows a board-size control for the current game", () => {
    const game = {
      matchState: createGame({ size: 9 }),
      difficulty: "beginner",
      aiThinking: false,
      undo: vi.fn(),
      pass: vi.fn(),
      newGame: vi.fn(),
      startNewGame: vi.fn(),
      resign: vi.fn(),
      setDifficulty: vi.fn(),
    } as unknown as GoGameController;

    const markup = renderToStaticMarkup(createElement(ControlPanel, { game }));

    expect(markup).toContain("棋盘大小");
    expect(markup).toContain("选择棋盘大小");
  });

  it("starts a game at the newly selected board size", () => {
    const startNewGame = vi.fn();
    const game = {
      matchState: createGame({ size: 9 }),
      difficulty: "beginner",
      aiThinking: false,
      startNewGame,
    } as unknown as GoGameController;

    function findBoardSizeSelect(node: ReactNode): { onValueChange(value: string): void } | undefined {
      if (!isValidElement(node)) return undefined;
      const props = node.props as { value?: string; children?: ReactNode; onValueChange?: (value: string) => void };
      if (node.type === Select && props.value === "9") return props as { onValueChange(value: string): void };
      for (const child of Children.toArray(props.children)) {
        const found = findBoardSizeSelect(child);
        if (found) return found;
      }
      return undefined;
    }

    const select = findBoardSizeSelect(ControlPanel({ game }));
    expect(select).toBeDefined();
    select?.onValueChange("13");
    expect(startNewGame).toHaveBeenCalledExactlyOnceWith(13);
  });
});
