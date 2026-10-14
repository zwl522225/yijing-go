import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useGoGame } from "@/hooks/use-go-game";
import * as ai from "@/lib/go/ai";
import type { AiWorkerRequest, AiWorkerResponse } from "@/lib/go/ai.worker";

const host = vi.hoisted(() => ({
  values: [] as unknown[], refs: [] as { current: unknown }[],
  cursor: 0, refCursor: 0, effectCursor: 0, callbackCursor: 0,
  callbacks: [] as { deps: unknown[]; fn: unknown }[],
  effects: [] as { deps?: unknown[]; cleanup?: () => void }[],
  pending: [] as (() => void)[],
}));
vi.mock("react", async original => ({ ...await original<typeof import("react")>(),
  useState: (initial: unknown) => {
    const i = host.cursor++;
    if (!(i in host.values)) host.values[i] = typeof initial === "function" ? (initial as () => unknown)() : initial;
    return [host.values[i], (next: unknown) => { host.values[i] = typeof next === "function" ? (next as (value: unknown) => unknown)(host.values[i]) : next; }];
  },
  useRef: (initial: unknown) => { const i = host.refCursor++; return host.refs[i] ?? (host.refs[i] = { current: initial }); },
  useCallback: (callback: unknown, deps: unknown[]) => {
    const i = host.callbackCursor++, previous = host.callbacks[i];
    if (previous && deps.length === previous.deps.length && deps.every((v, n) => Object.is(v, previous.deps[n]))) return previous.fn;
    host.callbacks[i] = { deps, fn: callback }; return callback;
  },
  useEffect: (effect: () => void | (() => void), deps?: unknown[]) => {
    const i = host.effectCursor++, previous = host.effects[i];
    if (deps && previous?.deps && deps.length === previous.deps.length && deps.every((v, n) => Object.is(v, previous.deps![n]))) return;
    host.pending.push(() => { previous?.cleanup?.(); host.effects[i] = { deps, cleanup: effect() || undefined }; });
  },
}));

class TestWorker {
  static instances: TestWorker[] = [];
  onmessage: ((event: { data: AiWorkerResponse }) => void) | null = null;
  onerror: (() => void) | null = null;
  request: AiWorkerRequest | null = null;
  terminate = vi.fn();
  constructor(public script: string | URL, public options: WorkerOptions) { TestWorker.instances.push(this); }
  postMessage(request: AiWorkerRequest) { this.request = request; }
}

function renderHook<T>(hook: () => T): T {
  host.cursor = host.refCursor = host.effectCursor = host.callbackCursor = 0;
  const game = hook();
  host.pending.splice(0).forEach(fn => fn());
  return game;
}
const render = () => renderHook(() => useGoGame({ volume: .5, category: "pop", restore: vi.fn() }));
async function startMatch() {
  render(); await Promise.resolve();
  const game = render(); game.startNewGame(5); game.setDifficulty("challenge");
  return render();
}
beforeEach(() => {
  host.values = []; host.refs = []; host.effects = []; host.pending = []; host.callbacks = [];
  TestWorker.instances = [];
  vi.useFakeTimers();
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: vi.fn(), removeItem: vi.fn() });
  vi.stubGlobal("Worker", TestWorker);
});
afterEach(() => {
  host.effects.forEach(e => e.cleanup?.());
  vi.restoreAllMocks(); vi.useRealTimers(); vi.unstubAllGlobals();
});

describe("AI Worker loading", () => {
  it("loads a browser-served module and accepts the matching challenge reply without fallback", async () => {
    const fallback = vi.spyOn(ai, "chooseMove");
    const game = await startMatch();
    await game.play({ x: 2, y: 2 });
    const worker = TestWorker.instances[0];
    expect(String(worker.script)).toMatch(/^(?:\/(?!\/)|https?:\/\/)/);
    expect(worker.options).toEqual({ type: "module" });
    expect(worker.request).toMatchObject({ difficulty: "challenge", state: { toPlay: "white" } });
    expect(worker.request!.state.moves).toHaveLength(1);
    worker.onmessage!({ data: { id: worker.request!.id + 1, move: { x: 1, y: 2 } } });
    await Promise.resolve(); expect(render().matchState.moves).toHaveLength(1);
    worker.onmessage!({ data: { id: worker.request!.id, move: { x: 1, y: 2 } } });
    await vi.runAllTimersAsync();
    const next = render();
    expect(next.matchState.board[2][1]).toBe("white");
    expect(next.matchState.moves).toHaveLength(2);
    expect(next.aiThinking).toBe(false);
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(fallback).not.toHaveBeenCalled();
  });

  it.each(["unavailable", "constructor failure", "error", "timeout"] as const)(
    "completes a legal beginner fallback after Worker %s", async failure => {
      const fallback = vi.spyOn(ai, "chooseMove");
      if (failure === "unavailable") vi.stubGlobal("Worker", undefined);
      if (failure === "constructor failure") vi.stubGlobal("Worker", class { constructor() { throw new Error("blocked"); } });
      const game = await startMatch();
      await game.play({ x: 2, y: 2 });
      const worker = TestWorker.instances[0];
      if (failure === "error") worker.onerror!();
      if (failure === "timeout") {
        await vi.advanceTimersByTimeAsync(1_549);
        expect(fallback).not.toHaveBeenCalled(); expect(render().aiThinking).toBe(true);
      }
      await vi.runAllTimersAsync();
      const next = render();
      expect(fallback).toHaveBeenCalledOnce();
      expect(fallback).toHaveBeenCalledWith(expect.objectContaining({ toPlay: "white" }), "beginner");
      expect(next.matchState.moves).toHaveLength(2);
      expect(next.matchState.toPlay).toBe("black");
      expect(next.aiThinking).toBe(false);
      if (worker) expect(worker.terminate).toHaveBeenCalledOnce();
    },
  );
});
