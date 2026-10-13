"use client";

import { useEffect } from "react";

import type { GoGameController } from "@/hooks/use-go-game";
import type { SoundscapeController } from "@/hooks/use-soundscape";
import {
  parseLearningUnitInput,
  parseGlossaryInput,
  parseMoveInput,
  parseMusicInput,
  parseStartGameInput,
} from "@/lib/webmcp";
import { LESSON_UNIT_IDS, TERM_IDS } from "@/lib/learning/types";

export function useWebMcp(
  game: GoGameController,
  soundscape: SoundscapeController,
) {
  useEffect(() => {
    const context = document.modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();

    const tools: WebMcpTool[] = [
      {
        name: "start_go_game",
        title: "开始围棋对局",
        description: "按指定电脑难度和棋盘大小开始一盘新的人机对局。",
        inputSchema: {
          type: "object",
          properties: {
            difficulty: { enum: ["beginner", "intermediate", "challenge"] },
            boardSize: { type: "integer", enum: [9, 13, 19] },
          },
          required: ["difficulty"],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        execute(input) {
          const { difficulty, boardSize } = parseStartGameInput(input);
          game.setDifficulty(difficulty);
          game.startNewGame(boardSize);
          return { accepted: true, difficulty, boardSize, toPlay: "black" };
        },
      },
      {
        name: "play_go_move",
        title: "落一手围棋",
        description: "在当前人机对局的棋盘上按零起始坐标落一枚黑棋。",
        inputSchema: {
          type: "object",
          properties: {
            x: { type: "integer", minimum: 0, maximum: game.matchState.size - 1 },
            y: { type: "integer", minimum: 0, maximum: game.matchState.size - 1 },
          },
          required: ["x", "y"],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        async execute(input) {
          if (game.mode !== "play") throw new Error("请先开始人机对局");
          if (game.aiThinking) throw new Error("电脑正在思考，请稍候");
          const point = parseMoveInput(input, game.matchState.size);
          const result = await game.play(point);
          if (!result.ok) throw new Error(`落子失败：${result.reason}`);
          return {
            accepted: true,
            move: point,
            moveNumber: result.state.moves.length,
            toPlay: result.state.toPlay,
          };
        },
      },
      {
        name: "open_go_learning_unit",
        title: "开始围棋教学",
        description: "打开新手学堂中已解锁的指定课程单元。",
        inputSchema: {
          type: "object",
          properties: {
            unitId: {
              type: "string",
              enum: [...LESSON_UNIT_IDS],
            },
          },
          required: ["unitId"],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        execute(input) {
          const { unitId } = parseLearningUnitInput(input);
          if (!game.startUnit(unitId)) throw new Error("课程尚未解锁，请先完成前置课程与阶段测验");
          return { accepted: true, unitId };
        },
      },
      {
        name: "open_go_glossary_term",
        title: "打开围棋术语",
        description: "查看指定围棋术语；测验作答期间无法查词。查看不会完成练习或授予掌握状态。",
        inputSchema: {
          type: "object",
          properties: { termId: { type: "string", enum: [...TERM_IDS] } },
          required: ["termId"],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        execute(input) {
          const { termId } = parseGlossaryInput(input);
          if (!game.openTerm(termId)) throw new Error("正在进行阶段测验，请完成作答后再查词");
          return { accepted: true, termId };
        },
      },
      {
        name: "set_go_music",
        title: "设置对局音乐",
        description: "播放或暂停原创对局音乐，并可切换流行氛围或纯音乐分类。",
        inputSchema: {
          type: "object",
          properties: {
            playing: { type: "boolean" },
            category: { enum: ["pop", "instrumental"] },
          },
          required: ["playing"],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        async execute(input) {
          const { playing, category } = parseMusicInput(input);
          if (category) soundscape.setCategory(category);
          if (playing) await soundscape.play();
          else soundscape.pause();
          return {
            accepted: true,
            playing,
            category: category ?? soundscape.category,
          };
        },
      },
    ];

    for (const tool of tools) {
      try {
        void Promise.resolve(
          context.registerTool(tool, { signal: lifecycle.signal }),
        ).catch((error: unknown) => {
          console.warn(`WebMCP tool registration failed: ${tool.name}`, error);
        });
      } catch (error) {
        console.warn(`WebMCP tool registration failed: ${tool.name}`, error);
      }
    }

    return () => lifecycle.abort();
  }, [game, soundscape]);
}
