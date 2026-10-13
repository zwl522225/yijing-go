/// <reference lib="webworker" />

import { chooseMove, type Difficulty } from "./ai";
import type { GameState } from "./types";

export type AiWorkerRequest = {
  id: number;
  state: GameState;
  difficulty: Difficulty;
};

export type AiWorkerResponse = {
  id: number;
  move: ReturnType<typeof chooseMove>;
};

self.onmessage = (event: MessageEvent<AiWorkerRequest>) => {
  const { id, state, difficulty } = event.data;
  const response: AiWorkerResponse = {
    id,
    move: chooseMove(state, difficulty),
  };
  self.postMessage(response);
};

export {};
