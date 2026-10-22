import { Game, SIZE, INITIAL_TIME } from './game.mjs';

const game=new Game();
const $=id=>document.getElementById(id);
const svgNS='http://www.w3.org/2000/svg';
const name=color=>color===1?'黑方':'白方';
const coordinate=([x,y])=>String.fromCharCode(65+x)+(15-y);
let aiRequest=null;
let aiError='';
let renderedVersion=-1;
let lastPending='';
let historyKey='';
let boardFocus=[7,7];

function svg(tag,attributes={},parent=null) {
  const node=document.createElementNS(svgNS,tag);
  for(const [key,value] of Object.entries(attributes)) node.setAttribute(key,value);
  if(parent) parent.append(node);
  return node;
}
function initializeBoard() {
  const board=$('board');
  const defs=svg('defs',{},board);
  for(const [id,inner,outer] of [['black-stone','#61655b','#242822'],['white-stone','#ffffff','#e9e6da']]) {
    const gradient=svg('radialGradient',{id,cx:'.32',cy:'.25',r:'.8'},defs);
    svg('stop',{offset:'0%','stop-color':inner},gradient);
    svg('stop',{offset:'100%','stop-color':outer},gradient);
  }
  const shadow=svg('filter',{id:'stone-shadow',x:'-50%',y:'-50%',width:'200%',height:'200%'},defs);
  svg('feDropShadow',{dx:'1',dy:'2',stdDeviation:'1.4','flood-color':'#49321b','flood-opacity':'.28'},shadow);
  const grid=svg('g',{'aria-hidden':'true'},board);
  for(let i=0;i<SIZE;i++) {
    const p=40+i*40;
    svg('line',{x1:p,y1:40,x2:p,y2:600,class:'grid-line'+(i===0||i===14?' grid-edge':'')},grid);
    svg('line',{x1:40,y1:p,x2:600,y2:p,class:'grid-line'+(i===0||i===14?' grid-edge':'')},grid);
    for(const y of [18,622]) svg('text',{x:p,y,class:'board-coord'},grid).textContent=String.fromCharCode(65+i);
    for(const x of [18,622]) svg('text',{x,y:p,class:'board-coord'},grid).textContent=15-i;
  }
  for(const [x,y] of [[3,3],[11,3],[7,7],[3,11],[11,11]]) svg('circle',{cx:40+x*40,cy:40+y*40,r:3,class:'star'},grid);
  svg('g',{id:'stones','aria-hidden':'true'},board);
  svg('g',{id:'win-line','aria-hidden':'true'},board);
  const targets=svg('g',{},board);
  for(let y=0;y<SIZE;y++) for(let x=0;x<SIZE;x++) {
    svg('rect',{x:22+x*40,y:22+y*40,width:36,height:36,rx:6,'data-x':x,'data-y':y,
      class:'hit-target',role:'button',tabindex:x===7&&y===7?'0':'-1','aria-label':coordinate([x,y])+'，空位'},targets);
  }
  board.addEventListener('click',event=>{
    const target=event.target.closest('.hit-target'); if(!target) return;
    boardFocus=[Number(target.dataset.x),Number(target.dataset.y)];
    if(game.select(...boardFocus)) render();
  });
  board.addEventListener('keydown',event=>{
    const target=event.target.closest('.hit-target'); if(!target) return;
    let x=Number(target.dataset.x),y=Number(target.dataset.y);
    const delta={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[event.key];
    if(delta) {
      event.preventDefault(); x=Math.max(0,Math.min(14,x+delta[0])); y=Math.max(0,Math.min(14,y+delta[1]));
      boardFocus=[x,y]; target.setAttribute('tabindex','-1');
      const next=board.querySelector(`[data-x="${x}"][data-y="${y}"]`);
      next.setAttribute('tabindex','0'); next.focus();
    } else if(event.key==='Enter'||event.key===' ') {
      event.preventDefault(); game.select(x,y); render();
    } else if(event.key==='Escape') {
      game.clearPending(); render();
    }
  });
}

function drawBoard() {
  const layer=$('stones'); layer.replaceChildren();
  const pending=new Map(game.pending.map((p,i)=>[p.join(','),i+1]));
  const last=game.history.at(-1)?.stones??[];
  for(let x=0;x<SIZE;x++) for(let y=0;y<SIZE;y++) {
    const order=pending.get(`${x},${y}`);
    const color=game.board[x][y]||(order?game.turn:0);
    const target=$('board').querySelector(`[data-x="${x}"][data-y="${y}"]`);
    target.setAttribute('tabindex',boardFocus[0]===x&&boardFocus[1]===y?'0':'-1');
    target.setAttribute('aria-label',coordinate([x,y])+'，'+(order?'预选第'+order+'子':color?name(color)+'棋子':'空位'));
    target.setAttribute('aria-pressed',order?'true':'false');
    if(!color) continue;
    const cx=40+x*40,cy=40+y*40;
    svg('circle',{cx,cy,r:16.5,class:`stone-${color===1?'black':'white'} stone-shadow${order?' pending-stone':''}`},layer);
    if(order) svg('text',{x:cx,y:cy,class:'pending-number'+(color===-1?' on-white':'')},layer).textContent=order;
    else if(last.some(p=>p[0]===x&&p[1]===y)) svg('rect',{x:cx-2.5,y:cy-2.5,width:5,height:5,class:'recent-mark'},layer);
  }
  const winLayer=$('win-line'); winLayer.replaceChildren();
  if(game.result?.line.length) {
    const points=game.result.line.map(([x,y])=>`${40+x*40},${40+y*40}`).join(' ');
    svg('polyline',{points,class:'winning-path'},winLayer);
  }
}

function renderHistory() {
  const key=JSON.stringify(game.history);
  if(key===historyKey) return;
  historyKey=key;
  $('history-list').replaceChildren();
  $('history-empty').hidden=game.history.length>0;
  $('history-count').textContent=String(game.history.length).padStart(2,'0')+' 手';
  game.history.forEach((turn,index)=>{
    const li=document.createElement('li'); li.className='history-row';
    const number=document.createElement('span'); number.className='round-number'; number.textContent=String(index+1).padStart(2,'0');
    const side=document.createElement('span'); side.className='history-side';
    const stone=document.createElement('i'); stone.className='mini-stone '+(turn.color===1?'black':'white');
    side.append(stone,document.createTextNode(name(turn.color)));
    const positions=document.createElement('span'); positions.className='history-coordinates';
    positions.textContent=turn.stones.map(coordinate).join(' · ');
    li.append(number,side,positions); $('history-list').append(li);
  });
  $('history-list').scrollTop=$('history-list').scrollHeight;
}

function formattedTime(ms) {
  const seconds=Math.ceil(ms/1000);
  return String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');
}
function refreshClocks() {
  const expired=game.checkTimeout();
  for(const [color,prefix] of [[1,'black'],[-1,'white']]) {
    const left=game.timeLeft(color);
    $(prefix+'-clock').textContent=formattedTime(left);
    $(prefix+'-clock-card').classList.toggle('active',game.started&&!game.result&&game.turn===color);
    $(prefix+'-clock-card').classList.toggle('low',left<60000);
    $(prefix+'-clock-card').classList.toggle('winner',game.result?.winner===color);
    $(prefix+'-progress').style.width=(left/INITIAL_TIME*100)+'%';
  }
  if(expired&&renderedVersion!==game.version) render();
}

function render() {
  game.checkTimeout();
  if(aiRequest && (aiRequest.version!==game.version || game.result)) {
    aiRequest.controller.abort(); aiRequest=null; aiError='';
  }
  const pendingKey=JSON.stringify(game.pending);
  if(renderedVersion!==game.version||lastPending!==pendingKey) drawBoard();
  renderedVersion=game.version; lastPending=pendingKey;
  const active=game.started&&!game.result;
  const isAI=active&&game.isAI();
  const canConfirm=game.canConfirm();
  const missing=game.required()-game.pending.length;
  let title,message,hint,primary;
  if(!game.started) {
    title='准备好，下一局。'; message='棋盘就绪，等你开局。';
    hint='选择对局模式，点击「开始对局」。'; primary='开始对局';
  } else if(game.result) {
    const {reason,winner}=game.result;
    title=reason==='draw'?'棋满和局。':name(winner)+'获胜。';
    message=reason==='timeout'?name(-winner)+'用时耗尽，'+name(winner)+'获胜。':reason==='six'?name(winner)+'连成六子，对局结束。':'棋盘已满，本局和棋。';
    hint='本局已结束，重新开始可再下一局。'; primary='再来一局';
  } else if(isAI) {
    title=name(game.turn)+'思考中。';
    message=aiError?'AI 本次计算未完成，累计时间继续扣除。':'AI 正在思考，'+name(game.turn)+'计时中。';
    hint='等待 AI 落子 · 可以悔棋或重新开始'; primary=aiError?'重试 AI 落子':'AI 思考中…';
  } else {
    title=name(game.turn)+'，请落子。';
    message=canConfirm?'落点已选好，确认后交给对方。':'本回合'+(game.history.length===0?'一':'两')+'子，还需选择 '+missing+' 个落点。';
    hint=game.pending.length?'已预选 '+game.pending.map(coordinate).join(' · ')+'，再次点击可取消。':'点击交叉点预选棋子，再确认落子。';
    primary='确认落子'+(game.pending.length?' · '+game.pending.length+'/'+game.required():'');
  }
  $('status-title').textContent=title;
  $('turn-message').textContent=message;
  $('board-hint').textContent=hint;
  $('round-badge').textContent=!game.started?'等待开局':game.result?'本局结束':'第 '+String(game.history.length+1).padStart(2,'0')+' 回合';
  $('primary-action').textContent=primary;
  $('primary-action').disabled=active&&(isAI?!aiError:!canConfirm);
  $('clear-action').disabled=!active||isAI||!game.pending.length;
  $('undo-action').disabled=!game.canUndo();
  $('restart-action').disabled=!game.started;
  $('turn-dot').classList.toggle('thinking',isAI&&!aiError);
  $('ai-error').hidden=!aiError; $('ai-error').textContent=aiError;
  for(const [color,prefix] of [[1,'black'],[-1,'white']]) {
    $(prefix+'-role').textContent=game.mode==='local'?'玩家':game.humanColor===color?'你':'AI';
    $(prefix+'-state').textContent=active&&game.turn===color?'正在计时 · '+(isAI?'AI 思考中':'等待确认落子'):(color===1?'先手 · 首回合一子':'后手 · 每回合两子');
  }
  document.querySelectorAll('[data-mode]').forEach(button=>{
    const selected=button.dataset.mode===game.mode;
    button.classList.toggle('selected',selected); button.setAttribute('aria-pressed',String(selected));
  });
  document.querySelectorAll('[data-color]').forEach(button=>{
    const selected=Number(button.dataset.color)===game.humanColor;
    button.classList.toggle('selected',selected); button.setAttribute('aria-pressed',String(selected));
  });
  $('color-setting').hidden=game.mode!=='single';
  renderHistory(); refreshClocks();
  if(isAI&&!aiRequest&&!aiError) void playAI();
}

async function playAI() {
  const request={version:game.version,controller:new AbortController()};
  aiRequest=request;
  const timer=setTimeout(()=>request.controller.abort('request-timeout'),35000);
  try {
    const response=await fetch('/api/ai',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({history:game.history,aiColor:game.turn}),signal:request.controller.signal,
    });
    const data=await response.json();
    if(game.version!==request.version||game.checkTimeout()) return;
    if(!response.ok) throw new Error(data.error||'AI 服务暂时不可用，请重试。');
    if(!game.applyAI(data.stones,request.version)) throw new Error('AI 返回了非法落点，请重试。');
    aiError='';
  } catch(error) {
    if(game.version===request.version&&!game.checkTimeout()) {
      aiError=request.controller.signal.aborted?'AI 请求等待超时，请重试；累计时钟继续计时。':error.message||'无法连接 AI 服务，请检查本地服务是否仍在运行。';
    }
  } finally {
    clearTimeout(timer);
    if(aiRequest===request) aiRequest=null;
    render();
  }
}

function confirmReset(title,action) {
  if(!game.started) { action(); render(); return; }
  const dialog=$('confirm-dialog'); if(dialog.open) return;
  $('dialog-title').textContent=title;
  dialog.returnValue='cancel';
  dialog.addEventListener('close',()=>{ if(dialog.returnValue==='confirm') action(); render(); },{once:true});
  dialog.showModal();
}
function reset(options={}) {
  game.reset(options); aiError='';
}
$('primary-action').addEventListener('click',()=>{
  // A confirmation that discovers a timeout must never become a replay click.
  const replay=Boolean(game.result)&&renderedVersion===game.version;
  game.checkTimeout();
  if(game.result&&!replay) {render();return;}
  if(game.result) { reset(); game.start(); }
  else if(!game.started) game.start();
  else if(game.isAI()) { if(aiError) aiError=''; }
  else game.confirm();
  render();
});
$('clear-action').addEventListener('click',()=>{game.clearPending();render();});
$('undo-action').addEventListener('click',()=>{if(game.undo()) aiError='';render();});
$('restart-action').addEventListener('click',()=>confirmReset('重新开始这一局？',()=>reset()));
document.querySelectorAll('[data-mode]').forEach(button=>button.addEventListener('click',()=>{
  if(button.dataset.mode!==game.mode) confirmReset('切换对局模式？',()=>reset({mode:button.dataset.mode}));
}));
document.querySelectorAll('[data-color]').forEach(button=>button.addEventListener('click',()=>{
  const color=Number(button.dataset.color);
  if(color!==game.humanColor) confirmReset('更换执子颜色？',()=>reset({humanColor:color}));
}));
document.addEventListener('visibilitychange',()=>{game.checkTimeout();render();});
window.addEventListener('pageshow',()=>{game.checkTimeout();render();});
initializeBoard(); render();
setInterval(refreshClocks,100);
