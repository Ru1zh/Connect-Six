export const SIZE = 15;
export const INITIAL_TIME = 600000;
const emptyBoard = () => Array.from({length: SIZE}, () => Array(SIZE).fill(0));
const validPoint = p => Array.isArray(p) && p.length === 2 && p.every(n => Number.isInteger(n) && n >= 0 && n < SIZE);

// x is the column, y is the row. Return the complete winning run for highlighting.
export function winningLine(board, x, y) {
  const color = board[x]?.[y];
  if (!color) return [];
  for (const [dx,dy] of [[1,0],[0,1],[1,1],[1,-1]]) {
    const line = [[x,y]];
    for (const sign of [-1,1]) {
      let a=x+dx*sign, b=y+dy*sign;
      while (a>=0 && a<SIZE && b>=0 && b<SIZE && board[a][b]===color) {
        if (sign===-1) line.unshift([a,b]); else line.push([a,b]);
        a+=dx*sign; b+=dy*sign;
      }
    }
    if (line.length>=6) return line;
  }
  return [];
}

export class Game {
  constructor({mode='single', humanColor=1, now=()=>Date.now()}={}) {
    this.now=now;
    this.version=0;
    this.reset({mode,humanColor});
  }
  reset({mode=this.mode, humanColor=this.humanColor}={}) {
    this.mode=mode; this.humanColor=humanColor;
    this.board=emptyBoard(); this.history=[]; this.pending=[];
    this.turn=1; this.remaining={'1':INITIAL_TIME,'-1':INITIAL_TIME};
    this.started=false; this.result=null; this.anchor=null;
    this.version++;
  }
  start() {
    if (this.started) return false;
    this.started=true; this.anchor=this.now(); this.version++;
    return true;
  }
  timeLeft(color) {
    const elapsed=this.started && !this.result && color===this.turn ? Math.max(0,this.now()-this.anchor) : 0;
    return Math.max(0,this.remaining[color]-elapsed);
  }
  settle() {
    this.remaining[this.turn]=this.timeLeft(this.turn);
    this.anchor=this.now();
  }
  checkTimeout() {
    if (this.started && !this.result && this.timeLeft(this.turn)<=0) {
      this.remaining[this.turn]=0;
      this.result={reason:'timeout',winner:-this.turn,line:[]};
      this.pending=[]; this.version++;
    }
    return Boolean(this.result);
  }
  isAI() { return this.mode==='single' && this.turn!==this.humanColor; }
  required() {
    const free=this.board.flat().filter(v=>v===0).length;
    return Math.min(this.history.length===0 ? 1 : 2,free);
  }
  preview(stones=this.pending) {
    const board=this.board.map(column=>column.slice());
    let line=[];
    for (const [x,y] of stones) {
      board[x][y]=this.turn;
      line=winningLine(board,x,y);
      if (line.length) break;
    }
    return {board,line};
  }
  select(x,y) {
    if (this.checkTimeout() || !this.started || this.isAI() || !validPoint([x,y]) || this.board[x][y]) return false;
    const index=this.pending.findIndex(p=>p[0]===x && p[1]===y);
    if (index>=0) { this.pending.splice(index,1); return true; }
    if (this.pending.length>=this.required() || this.preview().line.length) return false;
    this.pending.push([x,y]); return true;
  }
  clearPending() {
    if (this.checkTimeout() || !this.started || this.isAI()) return false;
    this.pending=[]; return true;
  }
  canConfirm() {
    if (this.checkTimeout() || !this.started || this.isAI() || !this.pending.length) return false;
    return this.pending.length===this.required() || this.preview().line.length>0;
  }
  confirm() {
    if (!this.canConfirm()) return false;
    return this.commit(this.pending);
  }
  commit(stones) {
    if (this.checkTimeout()) return false;
    this.settle();
    const played=[]; let line=[];
    for (const [x,y] of stones) {
      this.board[x][y]=this.turn; played.push([x,y]);
      line=winningLine(this.board,x,y);
      if (line.length) break;
    }
    this.history.push({color:this.turn,stones:played}); this.pending=[];
    if (line.length) this.result={reason:'six',winner:this.turn,line};
    else if (this.board.every(column=>column.every(Boolean))) this.result={reason:'draw',winner:0,line:[]};
    else { this.turn=-this.turn; this.anchor=this.now(); }
    this.version++; return true;
  }
  applyAI(stones,version) {
    if (this.checkTimeout() || !this.started || !this.isAI() || version!==this.version) return false;
    if (!Array.isArray(stones) || stones.length<1 || stones.length>this.required()) return false;
    const seen=new Set();
    for (const point of stones) {
      if (!validPoint(point) || this.board[point[0]][point[1]]) return false;
      const key=point.join(','); if (seen.has(key)) return false; seen.add(key);
    }
    if (stones.length!==this.required() && !this.preview(stones).line.length) return false;
    return this.commit(stones);
  }
  canUndo() {
    if (!this.started || this.result) return false;
    return this.pending.length>0 || (this.mode==='local' ? this.history.length>0 : this.history.some(t=>t.color===this.humanColor));
  }
  undo() {
    if (this.checkTimeout() || !this.canUndo()) return false;
    if (this.pending.length) { this.pending=[]; return true; }
    this.settle();
    let index=this.history.length-1;
    if (this.mode==='single') while (index>=0 && this.history[index].color!==this.humanColor) index--;
    this.history=this.history.slice(0,index);
    this.board=emptyBoard();
    for (const round of this.history) for (const [x,y] of round.stones) this.board[x][y]=round.color;
    this.turn=this.history.length%2===0 ? 1 : -1;
    this.anchor=this.now(); this.version++; return true;
  }
}
