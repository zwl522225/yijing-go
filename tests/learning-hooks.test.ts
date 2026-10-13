import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useLearningSession } from "@/hooks/use-learning-session";
import { useGoGame } from "@/hooks/use-go-game";
import { createDefaultProgress } from "@/lib/learning/progress";
import { LESSON_UNIT_IDS } from "@/lib/learning/types";
const host = vi.hoisted(() => ({ values: [] as unknown[], refs: [] as {
        current: unknown;
    }[], cursor: 0, refCursor: 0 }));
vi.mock("react", async (importOriginal) => ({
    ...await importOriginal<typeof import("react")>(),
    useState: (initial: unknown) => {
        const index = host.cursor++;
        if (!(index in host.values))
            host.values[index] = typeof initial === "function" ? (initial as () => unknown)() : initial;
        return [host.values[index], (next: unknown) => { host.values[index] = typeof next === "function" ? (next as (current: unknown) => unknown)(host.values[index]) : next; }];
    },
    useRef: (value: unknown) => { const index = host.refCursor++; return host.refs[index] ?? (host.refs[index] = { current: value }); },
    useCallback: (callback: unknown) => callback,
    useEffect: () => { },
}));
function render<T>(hook: () => T): T { host.cursor = 0; host.refCursor = 0; return hook(); }
beforeEach(() => { host.values = []; host.refs = []; vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
describe("learning hook behavior", () => {
    it("preserves an awarded quiz score across repeated submissions before a render", () => {
        const progress = createDefaultProgress();
        progress.completedUnitIds = [...LESSON_UNIT_IDS.slice(0,7)];
        const change = vi.fn();
        let learning = render(() => useLearningSession({progress, onProgressChange:change}));
        learning.startUnit("s1-checkpoint");
        learning = render(() => useLearningSession({progress, onProgressChange:change}));
        if(learning.unit.kind !== "quiz") throw new Error("quiz");
        const answer = (action: typeof learning.unit.questions[number]["expected"]) => {
            if(action.kind === "move") learning.submitMove(action.point);
            else if(action.kind === "choice") learning.submitChoice(action.choiceId);
            else if(action.kind === "pass") learning.submitPass();
        };
        for(const question of learning.unit.questions) answer(question.expected);
        expect(change.mock.lastCall![0].bestQuizScores["stage-1"]).toBe(100);
        learning.resetUnit();
        for(const question of learning.unit.questions) {
            learning.submitChoice("incorrect");
            answer(question.expected);
        }
        expect(change.mock.lastCall![0].bestQuizScores["stage-1"]).toBe(100);
    });
    it("starts only unlocked units and awards progress after the last practice", () => {
        let progress = createDefaultProgress();
        const change = vi.fn(next => { progress = next; });
        const useTestLearning = () => useLearningSession({ progress, onProgressChange: change });
        let learning = render(useTestLearning);
        expect(learning.startUnit("s1-liberties-groups")).toBe(false);
        expect(learning.session.unitId).toBe("s1-intersections-turns");
        for (let index = 0; index < 3; index++) {
            learning = render(useTestLearning);
            const expected = learning.session.exercise!.expected;
            if (expected.kind === "move")
                learning.submitMove(expected.point);
            if (expected.kind === "choice")
                learning.submitChoice(expected.choiceId);
            if (index < 2)
                expect(change).not.toHaveBeenCalled();
        }
        expect(change).toHaveBeenCalledOnce();
        learning = render(useTestLearning);
        learning.undoExercise();
        expect(render(useTestLearning).session.completed).toBe(false);
        expect(progress.completedUnitIds).toEqual(["s1-intersections-turns"]);
        expect(render(useTestLearning).startUnit("s1-liberties-groups")).toBe(true);
    });
    it("selecting a dead stone does not submit until explicit confirmation", () => {
        const progress = createDefaultProgress();
        progress.completedUnitIds = [...LESSON_UNIT_IDS];
        progress.bestQuizScores = { "stage-1": 100, "stage-2": 100 };
        const change = vi.fn();
        const useTestLearning = () => useLearningSession({ progress, onProgressChange: change });
        let learning = render(useTestLearning);
        learning.startUnit("s3-pass-dead-stones");
        learning = render(useTestLearning);
        learning.submitPass();
        learning = render(useTestLearning);
        learning.submitPass();
        learning = render(useTestLearning);
        learning.selectDeadStone({ x: 2, y: 2 });
        learning = render(useTestLearning);
        expect(learning.session.exerciseIndex).toBe(2);
        expect(change).not.toHaveBeenCalled();
        expect(learning.selectedDeadStone).toEqual({ x: 2, y: 2 });
        learning.submitDeadStone(learning.selectedDeadStone!);
        expect(render(useTestLearning).session.completed).toBe(true);
    });
});
describe("match and academy integration", () => {
    it("retains term progress and assist preferences across interleaved lesson events before rerender", () => {
        const useTestGame=()=>useGoGame({volume:.5,category:"pop",restore:vi.fn()});
        let game=render(useTestGame);
        expect(game.openTerm("liberty")).toBe(true);
        game.recordTermPractice("liberty");
        game.setLearningAssist("autoOpenTerms",true);
        for(let index=0;index<3;index++) {
            const expected=game.learningSession.session.exercise!.expected;
            if(expected.kind==="move") game.learningSession.submitMove(expected.point);
            else if(expected.kind==="choice") game.learningSession.submitChoice(expected.choiceId);
            game=render(useTestGame);
        }
        expect(game.learningProgress.completedUnitIds).toContain("s1-intersections-turns");
        expect(game.learningProgress.termStates.liberty).toBe("practiced");
        expect(game.learningProgress.assists.autoOpenTerms).toBe(true);
        game.openTerm("liberty");
        expect(render(useTestGame).learningProgress.termStates.liberty).toBe("practiced");
    });
    it("blocks all glossary entry points during an active quiz and resumes after completion", () => {
        const useTestGame=()=>useGoGame({volume:.5,category:"pop",restore:vi.fn()});
        let game=render(useTestGame);
        // Complete the first seven lessons through actual actions.
        for(const id of LESSON_UNIT_IDS.slice(0,7)) {
            game.startUnit(id); game=render(useTestGame);
            if(game.learningSession.unit.kind!=="lesson") throw new Error("lesson");
            for(const ex of game.learningSession.unit.exercises) {
                const action=ex.expected;
                if(action.kind==="move") game.learningSession.submitMove(action.point);
                else if(action.kind==="choice") game.learningSession.submitChoice(action.choiceId);
                else if(action.kind==="pass") game.learningSession.submitPass();
                else if(action.kind==="select-group") game.learningSession.submitGroup(action.point);
            }
            game=render(useTestGame);
        }
        game.openDictionary(); game.startUnit("s1-checkpoint"); game=render(useTestGame);
        expect(game.glossaryOpen).toBe(false);
        expect(game.glossaryBlocked).toBe(true);
        expect(game.openTerm("liberty")).toBe(false);
        expect(game.openDictionary()).toBe(false);
        // Normal play supports lookup; starting the quiz anew blocks it again.
        game.startPlay(); game=render(useTestGame); expect(game.openTerm("liberty")).toBe(true);
        game.startUnit("s1-checkpoint"); game=render(useTestGame); expect(game.openTerm("liberty")).toBe(false);
        if(game.learningSession.unit.kind!=="quiz") throw new Error("quiz");
        for(const question of game.learningSession.unit.questions) {
            const action=question.expected;
            if(action.kind==="move") game.learningSession.submitMove(action.point);
            else if(action.kind==="choice") game.learningSession.submitChoice(action.choiceId);
            else if(action.kind==="pass") game.learningSession.submitPass();
        }
        game=render(useTestGame); expect(game.openTerm("liberty")).toBe(true);
        expect(render(useTestGame).learningProgress.termStates.liberty).toBe("mastered");
    });
    it("opens the fresh academy on a 5-line lesson", () => {
        const game = render(() => useGoGame({ volume: .5, category: "pop", restore: vi.fn() }));
        expect(game.mode).toBe("lesson");
        expect(game.state.size).toBe(5);
    });
    it("resumes a pending AI turn after visiting the academy", async () => {
        class FakeWorker {
            onmessage: ((event: {
                data: {
                    id: number;
                    move: {
                        x: number;
                        y: number;
                    };
                };
            }) => void) | null = null;
            onerror: unknown = null;
            request: {
                id: number;
            } | null = null;
            postMessage(request: {
                id: number;
            }) { this.request = request; }
            terminate = vi.fn();
            static instances: FakeWorker[] = [];
            constructor() { FakeWorker.instances.push(this); }
        }
        vi.stubGlobal("Worker", FakeWorker);
        const useTestGame = () => useGoGame({ volume: .5, category: "pop", restore: vi.fn() });
        let game = render(useTestGame);
        game.startPlay();
        game = render(useTestGame);
        await game.play({ x: 4, y: 4 });
        game = render(useTestGame);
        expect(game.matchState.toPlay).toBe("white");
        expect(game.aiThinking).toBe(true);
        game.startUnit("s1-intersections-turns");
        game = render(useTestGame);
        game.startPlay();
        game = render(useTestGame);
        expect(game.aiThinking).toBe(true);
        expect(FakeWorker.instances).toHaveLength(2);
        const worker = FakeWorker.instances[1];
        worker.onmessage!({ data: { id: worker.request!.id, move: { x: 5, y: 4 } } });
        await vi.advanceTimersByTimeAsync(0);
        game = render(useTestGame);
        expect(game.matchState.toPlay).toBe("black");
        expect(game.matchState.moves).toHaveLength(2);
        expect(game.aiThinking).toBe(false);
        game.startNewGame(9);
        expect(render(useTestGame).state.size).toBe(9);
    });
});
