import type { BoardSize, Point } from "@/lib/go/types";

export function centerPoint(size: BoardSize): Point {
  const center = Math.floor(size / 2);
  return { x: center, y: center };
}

export function starPointKeys(size: BoardSize): Set<string> {
  if (size === 5 || size === 7) {
    const center = Math.floor(size / 2);
    return new Set([`${center},${center}`]);
  }

  const lines = size === 9 ? [2, 4, 6] : size === 13 ? [3, 6, 9] : [3, 9, 15];
  return new Set(lines.flatMap((y) => lines.map((x) => `${x},${y}`)));
}
