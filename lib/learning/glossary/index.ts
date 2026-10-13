import { STAGE_1_TERMS } from "@/lib/learning/glossary/stage-1";
import { STAGE_2_TERMS } from "@/lib/learning/glossary/stage-2";
import { STAGE_3_TERMS } from "@/lib/learning/glossary/stage-3";

export const GLOSSARY = Object.freeze([...STAGE_1_TERMS, ...STAGE_2_TERMS, ...STAGE_3_TERMS]);
export const GLOSSARY_BY_ID = new Map(GLOSSARY.map((entry) => [entry.id, entry] as const));
