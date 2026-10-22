import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, winningLine } from '../web/game.mjs';

function fixture(options = {}) {
  let now = 0;
  const game = new Game({mode: 'local', now: () => now, ...options});
  return {game, advance: ms => { now += ms; }};
}
function turn(game, stones) { for (const [x,y] of stones) game.select(x,y); return game.confirm(); }

test('600 seconds each; only the active side loses elapsed time', () => {
  const {game:g, advance} = fixture();
  advance(10000); assert.equal(g.timeLeft(1), 600000);
  g.start(); advance(1234); assert.equal(g.timeLeft(1), 598766);
  assert.equal(g.timeLeft(-1), 600000);
  turn(g, [[7,7]]); advance(2500);
  assert.equal(g.timeLeft(1), 598766); assert.equal(g.timeLeft(-1), 597500);
});
test('preselection, cancellation and two-stone confirmation', () => {
  const {game:g, advance} = fixture(); g.start();
  assert.equal(g.select(-1,0), false); assert.equal(g.select(15,0), false);
  g.select(7,7); g.select(7,7); assert.equal(g.pending.length,0);
  turn(g, [[7,7]]); assert.equal(g.select(7,7),false);
  g.select(6,7); advance(3000); assert.equal(g.confirm(),false);
  assert.equal(g.timeLeft(-1),597000); g.select(7,6); assert.equal(g.confirm(),true);
  assert.equal(g.turn,1); assert.equal(g.history.length,2);
});
test('timestamp jumps count background elapsed time; timeout beats submission', () => {
  const {game:g, advance} = fixture(); g.start(); g.select(7,7); advance(600001);
  assert.equal(g.confirm(),false); assert.equal(g.result.reason,'timeout');
  assert.equal(g.result.winner,-1); assert.equal(g.history.length,0);
  assert.equal(g.select(1,1),false); assert.equal(g.undo(),false);
  advance(5000); assert.equal(g.timeLeft(-1),600000);
});
test('undo clears pending before undoing a full local turn and never refunds time', () => {
  const {game:g, advance} = fixture(); g.start(); advance(1000); turn(g,[[7,7]]);
  advance(2000); g.select(6,7); g.undo(); assert.equal(g.history.length,1);
  g.undo(); assert.equal(g.history.length,0); assert.equal(g.turn,1);
  assert.equal(g.timeLeft(1),599000); assert.equal(g.timeLeft(-1),598000);
  advance(1000); assert.equal(g.timeLeft(1),598000);
  g.reset(); assert.equal(g.timeLeft(1),600000); assert.equal(g.timeLeft(-1),600000);
  assert.equal(g.started,false);
});
test('AI wait is timed; undo restores the human turn without restoring either clock', () => {
  const {game:g, advance} = fixture({mode:'single',humanColor:1}); g.start();
  advance(1000); turn(g,[[7,7]]); const token = g.version;
  assert.equal(g.select(6,7),false); advance(3000);
  assert.equal(g.applyAI([[6,7],[7,6]],token),true); advance(2000);
  assert.equal(g.undo(),true); assert.equal(g.history.length,0);
  assert.equal(g.timeLeft(1),597000); assert.equal(g.timeLeft(-1),597000);
});
test('AI black opening is kept during undo; undo while AI is thinking invalidates response', () => {
  const {game:g} = fixture({mode:'single',humanColor:-1}); g.start();
  assert.equal(g.applyAI([[7,7]],g.version),true); assert.equal(g.undo(),false);
  turn(g,[[6,7],[7,6]]); const token = g.version;
  assert.equal(g.undo(),true); assert.equal(g.history.length,1);
  assert.equal(g.turn,-1); assert.equal(g.applyAI([[8,7],[7,8]],token),false);
});
test('reset and timeout both discard late AI moves', () => {
  const {game:g, advance} = fixture({mode:'single',humanColor:-1}); g.start();
  const token=g.version; g.reset(); g.start();
  assert.equal(g.applyAI([[7,7]],token),false);
  const fresh=g.version; advance(600000);
  assert.equal(g.applyAI([[7,7]],fresh),false); assert.equal(g.result.reason,'timeout');
});
test('reject malformed AI pairs atomically', () => {
  const {game:g} = fixture({mode:'single',humanColor:1}); g.start(); turn(g,[[7,7]]);
  const token=g.version;
  for (const stones of [[[6,7],[6,7]], [[6,7],[15,0]], [[6,7]], [[7,7],[6,6]]]) {
    assert.equal(g.applyAI(stones,token),false); assert.equal(g.history.length,1);
    assert.equal(g.board[6][7],0);
  }
});
test('six and overlines in all four directions, including board edges', () => {
  for (const [dx,dy,x,y] of [[1,0,0,0],[0,1,14,0],[1,1,0,0],[-1,1,14,0]]) {
    const board=Array.from({length:15},()=>Array(15).fill(0));
    for(let i=0;i<7;i++) board[x+i*dx][y+i*dy]=1;
    assert.equal(winningLine(board,x,y).length,7);
  }
});
test('one-stone win can be confirmed and stops both clocks', () => {
  const {game:g,advance} = fixture(); g.start();
  turn(g,[[0,0]]); turn(g,[[0,14],[2,14]]);
  turn(g,[[1,0],[2,0]]); turn(g,[[4,14],[6,14]]);
  turn(g,[[3,0],[4,0]]); turn(g,[[8,14],[10,14]]);
  g.select(5,0); assert.equal(g.canConfirm(),true); advance(1000); g.confirm();
  assert.equal(g.result.winner,1); assert.equal(g.result.line.length,6);
  const left=g.timeLeft(1); advance(10000); assert.equal(g.timeLeft(1),left);
  assert.equal(g.undo(),false);
});
test('last empty cell can finish a draw without requiring a second stone', () => {
  const {game:g,advance} = fixture(); g.start();
  // A pattern with no six in any direction; isolate the last-cell rule.
  g.board=Array.from({length:15},(_,x)=>Array.from({length:15},(_,y)=>(x+2*y)%4<2?1:-1));
  g.board[0][0]=0; g.history=[{color:1,stones:[[1,0]]}];
  g.select(0,0); assert.equal(g.required(),1); assert.equal(g.confirm(),true);
  assert.equal(g.result.reason,'draw'); assert.equal(g.result.winner,0);
  advance(600001); assert.equal(g.result.reason,'draw');
});
