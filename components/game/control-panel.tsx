import { Flag, RotateCcw, Sparkles, Swords } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { GoGameController } from "@/hooks/use-go-game";
import type { Difficulty } from "@/lib/go/ai";
import type { BoardSize } from "@/lib/go/types";

const difficultyText: Record<Difficulty, { name: string; detail: string }> = {
  beginner: { name: "入门", detail: "落子轻松，适合初学" },
  intermediate: { name: "进阶", detail: "重视提子与连接" },
  challenge: { name: "挑战", detail: "会预判你的应手" },
};

type ControlPanelProps = {
  game: GoGameController;
};

export function ControlPanel({ game }: ControlPanelProps) {
  return (
    <section className="panel control-card" aria-labelledby="control-title">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">人机对局</span>
          <h2 id="control-title">执黑先行</h2>
        </div>
        <span>{game.matchState.moves.length} 手</span>
      </div>

      <label className="difficulty-select">
        <span>棋盘大小</span>
        <Select
          value={String(game.matchState.size)}
          onValueChange={(value) => game.startNewGame(Number(value) as BoardSize)}
          disabled={game.aiThinking}
        >
          <SelectTrigger aria-label="选择棋盘大小"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="9">9路（新手推荐）</SelectItem>
            <SelectItem value="13">13路（过渡练习）</SelectItem>
            <SelectItem value="19">19路（标准棋盘）</SelectItem>
          </SelectContent>
        </Select>
      </label>

      <label className="difficulty-select">
        <span>电脑棋力</span>
        <Select
          value={game.difficulty}
          onValueChange={(value) => game.setDifficulty(value as Difficulty)}
          disabled={game.aiThinking}
        >
          <SelectTrigger aria-label="选择电脑棋力"><SelectValue /></SelectTrigger>
          <SelectContent>
            {Object.entries(difficultyText).map(([value, text]) => (
              <SelectItem value={value} key={value}>{text.name} · {text.detail}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>

      <div className="turn-summary" aria-live="polite">
        <span className="turn-stone" />
        <div>
          <strong>{game.aiThinking ? "电脑正在思考…" : game.matchState.toPlay === "black" ? "轮到你落子" : "等待电脑落子"}</strong>
          <small>{difficultyText[game.difficulty].detail}</small>
        </div>
      </div>

      <TooltipProvider>
        <div className="control-actions">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" onClick={game.undo} disabled={game.matchState.past.length === 0}>
                <RotateCcw />悔一回合
              </Button>
            </TooltipTrigger>
            <TooltipContent>电脑还未落子时，只撤回你刚下的一手；已经应手时，撤回你和电脑最近的一轮。</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" onClick={game.pass} disabled={game.aiThinking}>
                <Flag />停一手
              </Button>
            </TooltipTrigger>
            <TooltipContent>停一手会把回合交给对方。本游戏的入门电脑会跟随停一手，连续两次停一手进入计分。</TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>
      <p className="pass-explanation">停一手会把回合交给对方。本游戏的入门电脑会跟随停一手，连续两次停一手进入计分；棋盘不必填满。真实对局中，对方也可以继续落子。</p>

      <div className="control-secondary">
        <AlertDialog>
          <AlertDialogTrigger asChild><Button variant="ghost"><Sparkles />新开一局</Button></AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>重新摆开棋盘？</AlertDialogTitle>
              <AlertDialogDescription>当前对局会被新棋局覆盖，教学进度仍会保留。</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>继续当前局</AlertDialogCancel>
              <AlertDialogAction onClick={game.newGame}>开始新局</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog>
          <AlertDialogTrigger asChild><Button variant="ghost"><Swords />认输</Button></AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>确认认输？</AlertDialogTitle>
              <AlertDialogDescription>本局将判白方获胜，你可以马上开始下一局。</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>再想想</AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={game.resign}>确认认输</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </section>
  );
}
