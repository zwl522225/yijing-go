import type { CoachTurn } from "@/lib/go/coach";
import type { TermId } from "@/lib/learning/types";
import { GLOSSARY_BY_ID } from "@/lib/learning/glossary";
import { TermLink } from "@/components/learning/term-link";

export function CoachPanel({ turns, onOpenTerm }: { turns: CoachTurn[]; onOpenTerm(id: TermId): void }) {
  if (!turns.length) return null;
  return <section className="panel coach-panel" aria-label="最近一回合讲解">
    <h2>最近一回合</h2>
    <div role="status" aria-live="polite">{turns.slice(-2).map(turn=><article key={`${turn.actor}-${turn.moveNumber}`} data-coach-actor={turn.actor}>
      <h3>{turn.actor === "black" ? "你 · 黑棋" : "电脑 · 白棋"} · 第 {turn.moveNumber} 手</h3>
      <p>{turn.summary}</p><p className="coach-question">想一想：{turn.question}</p>
    </article>)}</div>
    <div className="term-links">{[...new Set(turns.flatMap(turn=>turn.terms))].map(id=><TermLink key={id} entry={GLOSSARY_BY_ID.get(id)!} onOpen={onOpenTerm}/>)}</div>
  </section>;
}
