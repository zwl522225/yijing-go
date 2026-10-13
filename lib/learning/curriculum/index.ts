import { STAGE_1_UNITS } from "@/lib/learning/stage-1";
import { STAGE_2_UNITS } from "@/lib/learning/stage-2";
import { STAGE_3_UNITS } from "@/lib/learning/stage-3";
import { GLOSSARY } from "@/lib/learning/glossary";
import { assertValidLearningCatalog } from "@/lib/learning/validate";

export const CURRICULUM = Object.freeze([...STAGE_1_UNITS, ...STAGE_2_UNITS, ...STAGE_3_UNITS]);
export const CURRICULUM_BY_ID = new Map(CURRICULUM.map((unit) => [unit.id, unit] as const));

assertValidLearningCatalog(CURRICULUM, GLOSSARY);
