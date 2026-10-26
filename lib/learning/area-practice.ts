import type { StoneSetup } from "@/lib/go/types";
import { isUnitUnlocked, type LearningProgress } from "@/lib/learning/progress";
import { STAGE_3_SHAPES } from "@/lib/learning/stage-3";
import type { PositionSpec } from "@/lib/learning/types";

export type AreaPracticeScenarioId = "balanced" | "shifted";
export type AreaPracticeScenario = {
  id: AreaPracticeScenarioId;
  title: string;
  description: string;
  initial: PositionSpec;
  allStonesAlive: true;
};
const description = "九路计分教学摆子：双方已停手，题设确认盘上棋子都按活子计算，无待确认死子。";
export const AREA_PRACTICE_SCENARIOS: AreaPracticeScenario[] = [
  {id:"balanced",title:"两边相同，贴目怎么算？",description,allStonesAlive:true,initial:STAGE_3_SHAPES.scoring},
  {id:"shifted",title:"白棋右移，再数一次",description,allStonesAlive:true,initial:{
    size:9,toPlay:"black",setupMoves:[{pass:true},{pass:true}],
    stones:Array.from({length:9},(_,y):StoneSetup[]=>[["black",3,y],["white",6,y]]).flat(),
  }},
];

export function canStartAreaPractice(progress: LearningProgress): boolean {
  return progress.completedUnitIds.includes("s3-chinese-area-komi") && isUnitUnlocked("s3-chinese-area-komi",progress);
}
