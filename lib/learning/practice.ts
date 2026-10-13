import { CURRICULUM } from "@/lib/learning/curriculum";
import { isUnitUnlocked, type LearningProgress } from "@/lib/learning/progress";
import type { Exercise, LessonUnitId, TermId } from "@/lib/learning/types";

export type PracticeItem = { unitId: LessonUnitId; title: string; exercise: Exercise; terms: TermId[] };
export type PracticeTopic = { id: string; title: string; items: PracticeItem[] };
const TOPICS: {id:string;title:string;units:LessonUnitId[]}[] = [
  {id:"placement",title:"基础落子",units:["s1-intersections-turns","s3-corner-side-center","s3-territory-boundary","s3-invasion-reduction"]},
  {id:"liberties",title:"气与棋块",units:["s1-liberties-groups","s1-escape-connect","s2-connect-cut","s3-weak-groups"]},
  {id:"capture",title:"打吃与提子",units:["s1-atari-capture","s1-suicide-exception","s2-ladder","s2-net","s2-snapback"]},
  {id:"eyes",title:"真假眼",units:["s2-real-false-eyes"]},
  {id:"life",title:"死活与双活",units:["s2-two-eyes","s2-dead-seki"]},
  {id:"ko",title:"劫与劫材",units:["s1-ko-threat"]},
  {id:"ending",title:"停手与终局",units:["s1-pass-ending","s3-sente-gote-endgame","s3-pass-dead-stones","s3-chinese-area-komi"]},
  {id:"checkpoint",title:"阶段测验重练",units:["s1-checkpoint","s2-checkpoint"]},
];
function availableItems(progress: LearningProgress): PracticeItem[] {
  return CURRICULUM.flatMap(unit => unit.kind === "graduation" || !isUnitUnlocked(unit.id,progress) ? [] :
    (unit.kind === "lesson" ? unit.exercises : unit.questions).map(exercise => ({unitId:unit.id,title:unit.title,exercise,terms:unit.terms})));
}
export function getPracticeTopics(progress: LearningProgress): PracticeTopic[] {
  const items = availableItems(progress);
  return TOPICS.map(topic => ({id:topic.id,title:topic.title,items:items.filter(item => topic.units.includes(item.unitId))}));
}
export function getWrongQuestionPractice(progress: LearningProgress): PracticeItem[] {
  const known = new Set(CURRICULUM.flatMap(unit => unit.kind === "quiz" ? unit.questions.map(question => question.id) : []));
  const wanted = new Set(progress.wrongQuestionIds.filter(id => known.has(id)));
  return availableItems(progress).filter(item => wanted.has(item.exercise.id));
}
