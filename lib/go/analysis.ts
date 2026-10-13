import type { Board, BoardSize, Color, Point } from "@/lib/go/types";

export type GroupAnalysis = { color: Color; stones: Point[]; liberties: Point[] };
const keyOf = ({x,y}: Point) => `${x},${y}`;
const onBoard = ({x,y}: Point, size: BoardSize) => Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < size && y < size;
const neighbors = ({x,y}: Point): Point[] => [{x:x-1,y},{x:x+1,y},{x,y:y-1},{x,y:y+1}];
const ordered = (points: Point[]) => points.sort((a,b) => a.y-b.y || a.x-b.x);

function collect(board: Board, size: BoardSize, point: Point, visited: Set<string>): GroupAnalysis {
  const color = board[point.y][point.x]!;
  const stones: Point[] = [];
  const liberties = new Map<string, Point>();
  const pending = [point];
  visited.add(keyOf(point));
  while(pending.length) {
    const current = pending.pop()!;
    stones.push(current);
    for(const neighbor of neighbors(current)) {
      if(!onBoard(neighbor,size)) continue;
      const key = keyOf(neighbor);
      const occupant = board[neighbor.y][neighbor.x];
      if(occupant === null) liberties.set(key,neighbor);
      else if(occupant === color && !visited.has(key)) {
        visited.add(key);
        pending.push(neighbor);
      }
    }
  }
  return {color,stones:ordered(stones),liberties:ordered([...liberties.values()])};
}

export function groupAt(board: Board, size: BoardSize, point: Point): GroupAnalysis | null {
  return onBoard(point,size) && board[point.y]?.[point.x] ? collect(board,size,point,new Set()) : null;
}

/** Row-major anchors and unique liberties make UI placement stable across renders. */
export function analyzeGroups(board: Board, size: BoardSize): GroupAnalysis[] {
  const groups: GroupAnalysis[] = [];
  const visited = new Set<string>();
  for(let y=0;y<size;y++) for(let x=0;x<size;x++) {
    const point={x,y};
    if(board[y][x] && !visited.has(keyOf(point))) groups.push(collect(board,size,point,visited));
  }
  return groups;
}
