import { LESSON_UNIT_IDS } from "@/lib/learning/types";
import { expect, it } from "vitest";
import { KO_PRACTICE_SCENARIO, canStartKoPractice } from "@/lib/learning/ko-practice";
import { createDefaultProgress } from "@/lib/learning/progress";
it("provides an independent five-line ko scenario and rejects forged completion", () => {
 expect(KO_PRACTICE_SCENARIO.id).toBe("ko");
 expect(KO_PRACTICE_SCENARIO.initial.size).toBe(5);
 const p = createDefaultProgress(); p.completedUnitIds = ["s1-ko-threat"];
 expect(canStartKoPractice(p)).toBe(false);
});

it("uses board coordinates starting at one in the final hints",()=>{
 expect(KO_PRACTICE_SCENARIO.threatHints[2]).toContain("（2，2）");
 expect(KO_PRACTICE_SCENARIO.threatHints[2]).toContain("（1，3）");
 expect(KO_PRACTICE_SCENARIO.branches[0].followUpHints[2]).toContain("（4，3）");
 expect(KO_PRACTICE_SCENARIO.branches[1].followUpHints[2]).toContain("（1，3）");
});

it("opens only after completing the actual course prerequisites and ko lesson",()=>{
 const p=createDefaultProgress();const index=LESSON_UNIT_IDS.indexOf("s1-ko-threat");
 p.completedUnitIds=LESSON_UNIT_IDS.slice(0,index);expect(canStartKoPractice(p)).toBe(false);
 p.completedUnitIds=LESSON_UNIT_IDS.slice(0,index+1);expect(canStartKoPractice(p)).toBe(true);
});
