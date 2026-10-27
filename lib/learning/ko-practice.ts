import { STAGE_1_KO_STONES, STAGE_1_KO_CAPTURE } from "@/lib/learning/stage-1";
import { isUnitUnlocked, type LearningProgress } from "@/lib/learning/progress";
import type { Point } from "@/lib/go/types";
import type { PositionSpec } from "@/lib/learning/types";
export type KoPracticeScenario = {
 id:"ko"; initial:PositionSpec; capture:Point; recapture:Point; threat:Point; cornerTarget:Point;
 threatHints:[string,string,string];
 branches:{id:"answer"|"fill";label:string;reply:Point;followUp:Point;followUpHints:[string,string,string]}[];
};
export const KO_PRACTICE_SCENARIO:KoPracticeScenario = {
 id:"ko", initial:{size:5,toPlay:"black",stones:structuredClone(STAGE_1_KO_STONES)},
 capture:structuredClone(STAGE_1_KO_CAPTURE) as Point,recapture:{x:2,y:2},threat:{x:1,y:1},cornerTarget:{x:0,y:0},
 threatHints:["先观察角上黑棋的气。","寻找能让角上黑棋只剩一口气的白棋落点。","白棋下在（2，2），角上黑棋只剩（1，3）一口气。"],
 branches:[
 {id:"answer",label:"看黑棋应劫救棋",reply:{x:0,y:2},followUp:{x:2,y:2},followUpHints:["黑棋已经在角上应了一手。","现在检查原来的劫点。","白棋下在（3，3），提掉（4，3）的一颗黑子。"]},
 {id:"fill",label:"看黑棋填劫",reply:{x:2,y:2},followUp:{x:0,y:2},followUpHints:["原劫点已有黑棋。","角上黑棋还剩哪一口气？","白棋下在（1，3），提掉角上的两颗黑子。"]},
 ],
};
export function canStartKoPractice(progress:LearningProgress):boolean {
 return progress.completedUnitIds.includes("s1-ko-threat") && isUnitUnlocked("s1-ko-threat",progress);
}
