import type { GlossaryEntry, TermId } from "@/lib/learning/types";

export function TermLink({entry,onOpen,disabled=false}: {
  entry: GlossaryEntry; onOpen(id:TermId):void; disabled?:boolean;
}) {
  return <button type="button" className="term-link" disabled={disabled}
    aria-label={`查看围棋术语：${entry.name}`} onClick={()=>{if(!disabled) onOpen(entry.id);}}>{entry.name}</button>;
}
