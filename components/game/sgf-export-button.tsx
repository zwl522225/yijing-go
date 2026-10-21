"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { SgfExportResult } from "@/lib/go/sgf";

export type SgfExportProps = {
  onExport(): SgfExportResult;
  blockedReason: string | null;
  context: string;
  description?: string;
};

/** Downloads are initiated only by an explicit click, from a synchronous controller snapshot. */
export function SgfExportButton({ onExport, blockedReason, context, description = "下载到本机，用棋谱工具打开复盘" }: SgfExportProps) {
  const descriptionId = useId();
  const [status, setStatus] = useState<{context:string;text:string} | null>(null);
  const currentContext = useRef<string | null>(context);
  useEffect(() => {
    currentContext.current = context;
    return () => { currentContext.current = null; };
  }, [context]);
  const clicking = useRef(false);

  function download() {
    if (clicking.current || blockedReason) return;
    clicking.current = true;
    // The same event turn cannot start two operations; a later independent click can.
    queueMicrotask(() => { clicking.current = false; });
    const operationContext = context;
    const report = (text: string) => {
      if (currentContext.current === operationContext) setStatus({context:operationContext,text});
    };
    let url: string | undefined;
    let anchor: HTMLAnchorElement | undefined;
    let triggered = false;
    try {
      const result = onExport();
      if (!result.ok) { report(result.error); return; }
      if (typeof Blob !== "function" || typeof URL === "undefined" ||
        typeof URL.createObjectURL !== "function" || typeof URL.revokeObjectURL !== "function" ||
        typeof document === "undefined") throw Error("Download unavailable");
      anchor = document.createElement("a");
      if (!("download" in anchor)) throw Error("Download unavailable");
      const date = new Date();
      const localDate = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
      url = URL.createObjectURL(new Blob([result.content], {type:"application/x-go-sgf;charset=utf-8"}));
      anchor.href = url;
      anchor.download = `yijing-go-${result.size}x${result.size}-${localDate}-${result.moves}moves.sgf`;
      document.body.appendChild(anchor);
      anchor.click();
      triggered = true;
      report("已发起棋谱下载，请检查浏览器下载列表");
    } catch {
      report("无法发起棋谱下载，请稍后重试或使用支持文件下载的浏览器。");
    } finally {
      try { anchor?.remove(); }
      catch { report(triggered ? "下载已发起，但无法移除临时下载链接。" : "无法发起棋谱下载，且无法移除临时下载链接。"); }
      if (url !== undefined) {
        const objectUrl = url;
        // Give the browser a chance to consume the URL, including when click throws.
        setTimeout(() => {
          try { URL.revokeObjectURL(objectUrl); }
          catch { report(triggered ? "下载已发起，但无法释放临时文件链接。" : "无法发起棋谱下载，且无法释放临时文件链接。"); }
        }, 0);
      }
    }
  }

  return <div className="sgf-export">
    <button type="button" className="dictionary-button" data-action="export-sgf" disabled={!!blockedReason} aria-describedby={descriptionId} onClick={download}>导出整盘棋谱</button>
    <p id={descriptionId}>{description}{blockedReason ? `。${blockedReason}` : ""}</p>
    <p role="status" aria-live="polite">{status?.context === context ? status.text : ""}</p>
  </div>;
}
