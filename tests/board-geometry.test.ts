import { readFileSync } from "node:fs";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { GoBoard } from "@/components/game/go-board";
import { centerPoint, starPointKeys } from "@/lib/go/board-geometry";
import { createGame } from "@/lib/go/rules";

const boardCss = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

function insetFraction(selector: string, size: number) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const rule = boardCss.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`));
  const inset = rule?.[1].match(
    /\binset:\s*calc\(\s*([\d.]+)%\s*\/\s*var\(--(board-size|board-intervals)\)\s*\)/,
  );

  if (!inset) throw new Error(`Missing calculated inset for ${selector}`);

  const divisor = inset[2] === "board-size" ? size : size - 1;
  return Number(inset[1]) / 100 / divisor;
}

describe("board geometry", () => {
  it("constrains desktop width while retaining a square aspect ratio", () => {
    const rule = boardCss.match(/\.go-board\s*\{([^}]*)\}/)![1];
    expect(rule).toContain("width: min(100%, calc(100vh - 190px))");
    expect(rule).toContain("aspect-ratio: 1");
    expect(rule).not.toContain("max-height");
  });
  it.each([5,7,9,13,19] as const)("includes every full horizontal and vertical line on a %i-line board", size => {
    const markup = renderToStaticMarkup(createElement(GoBoard, {
      state:createGame({size}),mode:"lesson",title:"网格测试",eyebrow:"测试",prompt:"请落子",hints:[],deadStones:new Set<string>(),aiThinking:false,onPlay(){},onToggleDead(){}
    }));
    expect(markup).toContain(`viewBox="0 0 ${size-1} ${size-1}"`);
    expect(markup).toContain("vector-effect=\"non-scaling-stroke\"");
    for(let index=0;index<size;index++) {
      expect(markup).toContain(`M 0 ${index} H ${size-1}`);
      expect(markup).toContain(`M ${index} 0 V ${size-1}`);
    }
  });
  it("returns the center for every supported odd board", () => {
    expect(centerPoint(5)).toEqual({ x: 2, y: 2 });
    expect(centerPoint(9)).toEqual({ x: 4, y: 4 });
    expect(centerPoint(19)).toEqual({ x: 9, y: 9 });
  });

  it("uses standard star layouts", () => {
    expect(starPointKeys(5)).toEqual(new Set(["2,2"]));
    expect(starPointKeys(9)).toContain("4,4");
    expect(starPointKeys(19).size).toBe(9);
  });

  it("renders the current board size and accessible point count", () => {
    const markup = renderToStaticMarkup(
      createElement(GoBoard, {
        state: createGame({ size: 9 }),
        mode: "play",
        title: "测试棋盘",
        eyebrow: "测试",
        prompt: "请落子",
        hints: [],
        deadStones: new Set<string>(),
        aiThinking: false,
        onPlay() {},
        onToggleDead() {},
      }),
    );

    expect(markup).toContain('aria-label="9路围棋棋盘"');
    expect(markup.match(/role="gridcell"/g)).toHaveLength(81);
    expect(markup).toContain("--board-size:9");
    expect(markup.match(/data-star="true"/g)).toHaveLength(9);
  });

  it.each([5, 9, 13, 19])(
    "aligns every point center with its grid lines on a %i-line board",
    (size) => {
      const gridInset = insetFraction(".go-grid-lines", size);
      const pointInset = insetFraction(".go-points", size);
      const gridInterval = (1 - 2 * gridInset) / (size - 1);
      const pointCell = (1 - 2 * pointInset) / size;

      for (let index = 0; index < size; index += 1) {
        const linePosition = gridInset + index * gridInterval;
        const pointCenter = pointInset + (index + 0.5) * pointCell;

        expect(pointCenter).toBeCloseTo(linePosition, 12);
      }
    },
  );
});
