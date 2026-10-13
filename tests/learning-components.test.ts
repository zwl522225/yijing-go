import { createElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { LearningRoadmap } from "@/components/learning/learning-roadmap";
import { LessonPanel } from "@/components/learning/lesson-panel";
import { LessonDemo } from "@/components/learning/lesson-demo";
import { GoBoard } from "@/components/game/go-board";
import { createLearningSession, type LearningSessionController } from "@/hooks/use-learning-session";
import { CURRICULUM_BY_ID } from "@/lib/learning/curriculum";
import { createDefaultProgress } from "@/lib/learning/progress";
import { LESSON_UNIT_IDS, type LessonUnitId } from "@/lib/learning/types";
import { createPosition } from "@/lib/learning/positions";
function controller(id: LessonUnitId): LearningSessionController {
    const session = createLearningSession(id);
    return { getSession:()=>session, session, unit: CURRICULUM_BY_ID.get(id)!, state: session.state, feedback: null, visibleHints: session.exercise?.hints.slice(0, session.hintLevel) ?? [], selectedDeadStone: null, startUnit: vi.fn(), isQuizActive: vi.fn(), submitMove: vi.fn(), submitPass: vi.fn(), submitGroup: vi.fn(), submitDeadStone: vi.fn(), selectDeadStone: vi.fn(), submitChoice: vi.fn(), requestHint: vi.fn(), retryExercise: vi.fn(), undoExercise: vi.fn(), resetUnit: vi.fn() };
}
function elements(node: ReactNode): ReactElement<Record<string, unknown>>[] {
    if (!node || typeof node !== "object")
        return [];
    if (Array.isArray(node))
        return node.flatMap(elements);
    const element = node as ReactElement<Record<string, unknown>>;
    return [element, ...elements(element.props?.children as ReactNode)];
}
const markup = (node: ReactNode) => renderToStaticMarkup(node);
describe("academy controls", () => {
    it("does not display graduation as complete from a stale completed-unit mark",()=>{
        const progress=createDefaultProgress();progress.completedUnitIds=[...LESSON_UNIT_IDS];progress.bestQuizScores={"stage-1":80,"stage-2":80};
        const text=markup(createElement(LearningRoadmap,{progress,currentUnitId:"s3-graduation",onSelectUnit:vi.fn()}));
        expect(text).toContain("已完成 23 / 24 单元");
        const button=elements(LearningRoadmap({progress,currentUnitId:"s3-graduation",onSelectUnit:vi.fn()})).find(e=>e.props["data-unit-id"]==="s3-graduation")!;
        expect(button.props.className).not.toBe("complete");
    });
    it("lists every current lesson term and disables explanations until the quiz is complete", () => {
        const learning=controller("s1-liberties-groups"); const open=vi.fn();
        const tree=LessonPanel({learning,onOpenTerm:open});
        const text=markup(tree); expect(text).toContain("本课术语"); expect(text).toContain("查看围棋术语：气");
        expect(text).toContain("查看围棋术语：棋块");
        const quiz=controller("s1-checkpoint");
        expect(markup(LessonPanel({learning:quiz,onOpenTerm:open}))).toContain("完成测验后查词");
        quiz.session.completed=true;
        expect(markup(LessonPanel({learning:quiz,onOpenTerm:open}))).not.toContain("完成测验后查词");
    });
    it("announces a selected dead-stone candidate without marking it dead before confirmation", () => {
        const learning = controller("s3-pass-dead-stones");
        if (learning.unit.kind !== "lesson") throw new Error("lesson");
        const state = createPosition(learning.unit.exercises[2].position);
        const text = markup(createElement(GoBoard, {state, mode:"lesson", title:"确认死子", eyebrow:"测试",prompt:"选择后确认",hints:[],deadStones:new Set<string>(),selectedPoints:[{x:2,y:2}],aiThinking:false,onPlay:vi.fn(),onToggleDead:vi.fn()}));
        expect(text).toContain('data-selected="true"');
        expect(text).toContain("已选择");
        expect(text).not.toContain("已标为死子");
    });
    it("shows the three stages, disabled future stage, current unit, locks and recommendation", () => {
        const progress = createDefaultProgress();
        const text = markup(createElement(LearningRoadmap, { progress, currentUnitId: "s1-intersections-turns", onSelectUnit: vi.fn() }));
        for (const label of ["规则启蒙", "吃子与死活", "完整 9 路对局", "标准棋盘 · 敬请期待"])
            expect(text).toContain(label);
        expect(text).toContain('aria-current="step"');
        expect(text).toContain('aria-disabled="true"');
        expect(text).toContain("推荐下一课");
        const select = vi.fn();
        const tree = elements(LearningRoadmap({ progress, currentUnitId: "s1-intersections-turns", onSelectUnit: select }));
        const locked = tree.find(e => e.props["data-unit-id"] === "s1-liberties-groups")!;
        (locked.props.onClick as () => void)();
        expect(select).not.toHaveBeenCalled();
    });
    it("offers a direct pass button, ordered hints, retry, reset and undo in the task card", () => {
        const learning = controller("s1-pass-ending");
        const tree = LessonPanel({ learning });
        const text = markup(tree);
        const demoDisclosure = elements(tree).find(element => element.type === "details" && element.props.className === "demo-disclosure");
        expect(demoDisclosure).toBeDefined();
        expect(demoDisclosure?.props.open).toBeUndefined();
        for (const label of ["停一手", "思考方向", "重来本题", "重学本课", "悔棋"])
            expect(text).toContain(label);
        const button = elements(tree).find(e => e.props["data-action"] === "pass")!;
        (button.props.onClick as () => void)();
        expect(learning.submitPass).toHaveBeenCalledOnce();
    });
    it("renders all choice answers with their own callbacks", () => {
        const learning = controller("s1-intersections-turns");
        const unit = learning.unit;
        if (unit.kind !== "lesson")
            throw new Error("lesson");
        learning.session = { ...learning.session, exerciseIndex: 2, exercise: unit.exercises[2] };
        const tree = LessonPanel({ learning });
        expect(markup(tree)).toContain("选择答案");
        for (const choice of unit.exercises[2].choices!) {
            const button = elements(tree).find(e => e.props["data-choice-id"] === choice.id)!;
            (button.props.onClick as () => void)();
            expect(learning.submitChoice).toHaveBeenCalledWith(choice.id);
        }
    });
    it("requires a selected dead stone and a visible confirmation action", () => {
        const learning = controller("s3-pass-dead-stones");
        if (learning.unit.kind !== "lesson")
            throw new Error("lesson");
        learning.session = { ...learning.session, exerciseIndex: 2, exercise: learning.unit.exercises[2] };
        let tree = LessonPanel({ learning });
        expect(markup(tree)).toContain("在棋盘上选择死子");
        expect(elements(tree).find(e => e.props["data-action"] === "mark-dead")!.props.disabled).toBe(true);
        learning.selectedDeadStone = { x: 2, y: 2 };
        tree = LessonPanel({ learning });
        (elements(tree).find(e => e.props["data-action"] === "mark-dead")!.props.onClick as () => void)();
        expect(learning.submitDeadStone).toHaveBeenCalledWith({ x: 2, y: 2 });
    });
    it("never renders hints, demonstrations or answer candidates during a quiz", () => {
        const learning = controller("s1-checkpoint");
        learning.visibleHints = learning.session.exercise!.hints;
        const text = markup(LessonPanel({ learning }));
        expect(text).not.toContain("思考方向");
        expect(text).not.toContain("提示落点");
        expect(text).not.toContain("lesson-demo");
        for (const hint of learning.visibleHints)
            expect(text).not.toContain(hint.text);
    });
    it("renders pauseable demonstration controls and its caption", () => {
        const unit = CURRICULUM_BY_ID.get("s1-intersections-turns")!;
        if (unit.kind !== "lesson")
            throw new Error("lesson");
        const text = markup(createElement(LessonDemo, { unit }));
        for (const label of ["上一步", "播放", "下一步", unit.demo[0].caption])
            expect(text).toContain(label);
    });
    it("renders the connecting stone that the demonstration caption describes", () => {
        const unit = CURRICULUM_BY_ID.get("s2-connect-cut")!;
        if(unit.kind !== "lesson") throw new Error("lesson");
        const text = markup(createElement(LessonDemo,{unit}));
        expect(text.match(/class="mini-stone black"/g)).toHaveLength(3);
        expect(text).toContain("轮到白棋");
        expect(text).toContain("黑方提子 0");
    });
    it("renders an illegal attempted point and its Chinese rejection while retaining the ko board", () => {
        const unit = CURRICULUM_BY_ID.get("s1-ko-threat")!;
        if(unit.kind !== "lesson") throw new Error("lesson");
        const attempt = {...unit, demo:[{...unit.demo[1],move:{kind:"move" as const,point:{x:2,y:2}}}]};
        const text = markup(createElement(LessonDemo,{unit:attempt}));
        expect(text).toContain('data-attempted="true"');
        expect(text).toContain("非法尝试落点");
        expect(text).toContain("操作被拒绝");
        expect(text).toContain("重复之前的棋形");
        expect(text).toContain("白棋尝试在第 3 列、第 3 行落子");
        expect(text).toContain("轮到白棋");
        expect(text).toContain("黑方提子 1");
    });
});
