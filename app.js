/* 智囊團 — Firebase 版
   資料模型與畫面邏輯沿用 Trista 確認過的原型（prototype.html），
   差別只在儲存方式：window.storage → Firestore（多人即時同步），
   以及管理員登入：前端密碼雜湊 → 真正的 Firebase Auth（Email/密碼），
   權限檢查在 Firestore 安全性規則（伺服器端），不是只靠前端判斷。 */

const KINDS={issue:'問題',wish:'許願',sop:'SOP',assign:'交辦',todo:'待辦'};
const HINTS={issue:'看到的問題寫上來，所有人都看得到，也都可以回饋。',assign:'指派給特定的人處理。',todo:'自己或團隊要做、還沒做的事。',sop:'標準作業流程，大家都能查看。分店選「全分店」代表三間店通用。',wish:'員工福利、想新增的設備器具、同事相處、人力不夠太累……想說的都可以寫，大家可以按「我也想要」。'};
const DEFAULT_WISH=['員工福利','設備器具','人際相處','人力配置','其他'];
const DEFAULT_CATS=['門市營運','產品品質','設備維修','人員排班','食安衛生','客人意見','其他'];
const DEFAULT_STORES=['象山','A13','板橋'];

let wishCats=[...DEFAULT_WISH],sopCats=[],editing=null;
let STORES=[...DEFAULT_STORES];
let adminEmails=[];
let isAdmin=false;
let store='全部';
let items=[],cats=[...DEFAULT_CATS],me='',tab='issue',cat='全部',kind='issue',busy=false;
let listenersReady=false;

const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=t=>{if(!t)return'';const d=new Date(t),p=n=>String(n).padStart(2,'0');return`${d.getFullYear()}/${p(d.getMonth()+1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`};
const dur=(a,b)=>{const m=Math.round((b-a)/60000);if(m<60)return m+' 分鐘';const h=Math.floor(m/60);if(h<48)return h+' 小時'+(m%60?` ${m%60} 分`:'');return Math.floor(h/24)+' 天'};
function toast(msg){const t=$('#toast');t.textContent=msg;t.classList.add('show');clearTimeout(t._t);t._t=setTimeout(()=>t.classList.remove('show'),1800)}

/* ---------- Firebase ---------- */
firebase.initializeApp(window.FIREBASE_CONFIG);
const auth=firebase.auth();
const db=firebase.firestore();
try{db.enablePersistence({synchronizeTabs:true}).catch(()=>{})}catch(e){}

function setLive(ok){const dot=$('#liveDot');dot.classList.toggle('off',!ok);$('#sync').textContent=ok?'即時同步中':'離線（顯示快取資料，恢復連線後自動同步）'}

function currentEmail(){return auth.currentUser&&!auth.currentUser.isAnonymous?(auth.currentUser.email||''):''}
function computeIsAdmin(){const email=currentEmail();if(!email)return false;return window.BOOTSTRAP_ADMIN_EMAILS.includes(email)||adminEmails.includes(email)}
function updAdm(){isAdmin=computeIsAdmin();$('#admTag').innerHTML=isAdmin?'<span class="admbadge">管理員</span>':''}

/* ---------- 即時監聽 ---------- */
function startListeners(){
  if(listenersReady)return;listenersReady=true;

  db.collection('items').onSnapshot(snap=>{
    items=snap.docs.map(d=>({id:d.id,...d.data()}));
    setLive(!snap.metadata.fromCache);
    render();
  },err=>{console.error(err);toast('資料同步發生問題：'+err.message)});

  db.collection('config').doc('stores').onSnapshot(d=>{
    const v=d.data();if(v&&Array.isArray(v.list)&&v.list.length)STORES=v.list;render()
  });
  db.collection('config').doc('categories').onSnapshot(d=>{
    const v=d.data();if(v&&Array.isArray(v.list)&&v.list.length)cats=v.list;render()
  });
  db.collection('config').doc('wishcats').onSnapshot(d=>{
    const v=d.data();if(v&&Array.isArray(v.list)&&v.list.length)wishCats=v.list;render()
  });
  db.collection('config').doc('sopcats').onSnapshot(d=>{
    const v=d.data();sopCats=(v&&Array.isArray(v.list))?v.list:[];render()
  });
  db.collection('config').doc('admins').onSnapshot(d=>{
    const v=d.data();adminEmails=(v&&Array.isArray(v.emails))?v.emails:[];updAdm();renderAdm();render()
  });
}

async function ensureConfigDefaults(){
  // 只有在集合完全是空的（第一次上線）才寫入預設值；避免覆蓋別人已經改過的設定。
  const defs=[
    ['stores',{list:DEFAULT_STORES}],
    ['categories',{list:DEFAULT_CATS}],
    ['wishcats',{list:DEFAULT_WISH}],
    ['sopcats',{list:[]}]
  ];
  for(const[id,data]of defs){
    try{
      const ref=db.collection('config').doc(id);
      const snap=await ref.get();
      if(!snap.exists)await ref.set(data);
    }catch(e){/* 一般使用者沒有寫入權限很正常，忽略 */}
  }
}

/* ---------- 畫面 ---------- */
function renderChips(){
  $('#stores').innerHTML=['全部',...STORES].map(c=>`<button class="${c===store?'on':''}" data-s="${esc(c)}">${esc(c)}</button>`).join('');
  const list=tab==='sop'?sopCats:tab==='wish'?wishCats:tab==='done'?[...cats,...wishCats.filter(x=>!cats.includes(x))]:cats;
  if(cat!=='全部'&&!list.includes(cat))cat='全部';
  const all=['全部',...list];
  $('#chips').innerHTML=all.map(c=>`<button class="${c===cat?'on':''}" data-c="${esc(c)}">${esc(c)}</button>`).join('')+(tab==='sop'&&isAdmin?'<button class="addc" data-c="__add">＋ 新增分類</button>':'');
}
function render(){
  const inStore=i=>store==='全部'||i.store===store||i.store==='全分店';
  const cnt={issue:0,wish:0,sop:0,assign:0,todo:0,done:0};
  items.filter(inStore).forEach(i=>i.done?cnt.done++:cnt[i.kind]++);
  for(const k in cnt)$('#n-'+k).textContent=cnt[k];
  document.querySelectorAll('.tabs button').forEach(b=>b.setAttribute('aria-selected',b.dataset.tab===tab));
  renderChips();
  let list=items.filter(i=>tab==='done'?i.done:(!i.done&&i.kind===tab));
  list=list.filter(inStore);
  if(cat!=='全部')list=list.filter(i=>i.cat===cat);
  list.sort((a,b)=>tab==='sop'?((b.updatedAt||b.createdAt)-(a.updatedAt||a.createdAt)):tab==='done'?(b.doneAt-a.doneAt):tab==='wish'?(((b.votes||[]).length-(a.votes||[]).length)||b.createdAt-a.createdAt):(b.createdAt-a.createdAt));
  if(!list.length){$('#list').innerHTML=`<div class="empty">${tab==='done'?'還沒有完成的項目。':(tab==='sop'&&!sopCats.length?(isAdmin?'先按上方「＋ 新增分類」建立 SOP 分類，再按右下角「新增」寫第一份 SOP。':'還沒有 SOP 分類，請管理員到「管理後台」新增。'):'這裡目前是空的，按右下角「新增」寫第一筆。')}</div>`;return}
  $('#list').innerHTML=list.map(card).join('');
}
function card(i){
  const cls=i.done?'done':i.kind;
  const overdue=!i.done&&i.due&&new Date(i.due+'T23:59')<new Date();
  const cm=(i.comments||[]).map(c=>`<div class="c"><b>${esc(c.by)}</b>：${esc(c.text)}<div class="w">${fmt(c.at)}</div></div>`).join('')||'<div class="c w">還沒有回饋。</div>';
  return`<article class="slip ${cls}" data-id="${esc(i.id)}">
    <div class="top"><span class="kind" style="--k:var(--${i.kind})">${KINDS[i.kind]}</span><span class="store">${esc(i.store||'未分店')}</span><span class="cat">${esc(i.cat)}</span>${overdue?'<span style="color:var(--issue);font-weight:700">已逾期</span>':''}</div>
    <h3>${esc(i.title)}</h3>
    ${i.body?`<p class="body">${esc(i.body)}</p>`:''}
    <div class="meta">
      <span>${i.kind==='sop'?'建立':'提出'}：<b>${i.anon?'匿名':esc(i.by)}</b>　${fmt(i.createdAt)}</span>
      ${i.updatedAt?`<span>最後更新：<b>${esc(i.updatedBy)}</b>　${fmt(i.updatedAt)}</span>`:''}
      ${i.kind==='assign'?`<span>交辦給：<b>${esc(i.to||'未指定')}</b></span>`:''}
      ${i.due?`<span>期限：${esc(i.due.replace(/-/g,'/'))}</span>`:''}
      ${i.done?`<span>完成：<b>${esc(i.doneBy)}</b>　${fmt(i.doneAt)}（歷時 ${dur(i.createdAt,i.doneAt)}）</span>`:''}
    </div>
    ${i.done?`<span class="stamp">${i.kind==='wish'?'已實現':'已完成'}</span>`:''}
    <div class="acts">
      ${i.kind==='wish'?`<button class="vote ${(i.votes||[]).includes(me)?'on':''}" data-a="vote">我也想要（${(i.votes||[]).length}）</button>`:''}
      <button data-a="fb">回饋（${(i.comments||[]).length}）</button>
      ${i.kind==='sop'?'<button class="primary" data-a="edit">編輯</button>':i.done?'<button data-a="undo">移回未完成</button>':`<button class="primary" data-a="done">${i.kind==='wish'?'標記實現':'標記完成'}</button>`}
      ${!i.done&&i.kind==='issue'?'<button data-a="toAssign">轉成交辦</button>':''}
      <button class="ghost" data-a="del">刪除</button>
    </div>
    <div class="fb"><div class="cl">${cm}</div>
      <div class="cf"><input placeholder="寫下你的回饋或處理進度" maxlength="300"><button data-a="send">送出</button></div></div>
  </article>`;
}

/* ---------- 寫入（用 transaction 避免多人同時修改互相覆蓋） ---------- */
async function mutate(id,fn){
  const ref=db.collection('items').doc(id);
  try{
    await db.runTransaction(async tx=>{
      const snap=await tx.get(ref);
      if(!snap.exists)throw new Error('項目已被刪除');
      const fresh={id,...snap.data()};
      fn(fresh);
      const{id:_drop,...data}=fresh;
      tx.set(ref,data);
    });
  }catch(e){console.error(e);toast('儲存失敗，請再試一次：'+e.message);throw e}
}

$('#list').addEventListener('click',async e=>{
  const b=e.target.closest('button[data-a]');if(!b)return;
  const art=b.closest('.slip'),id=art.dataset.id,a=b.dataset.a;
  if(a==='fb'){art.querySelector('.fb').classList.toggle('open');art.querySelector('.fb input')?.focus();return}
  if(a==='edit'){openForm(items.find(x=>x.id===id));return}
  if(a==='vote'){await mutate(id,i=>{i.votes=i.votes||[];const k=i.votes.indexOf(me);k<0?i.votes.push(me):i.votes.splice(k,1)}).catch(()=>{});return}
  if(a==='done'){await mutate(id,i=>{i.done=true;i.doneAt=Date.now();i.doneBy=me}).catch(()=>{});toast('已移到完成區');return}
  if(a==='undo'){await mutate(id,i=>{i.done=false;i.doneAt=firebase.firestore.FieldValue.delete();i.doneBy=firebase.firestore.FieldValue.delete()}).catch(()=>{});toast('已移回');return}
  if(a==='send'){const inp=art.querySelector('.cf input'),text=inp.value.trim();if(!text)return;
    await mutate(id,i=>{(i.comments=i.comments||[]).push({by:me,text,at:Date.now()})}).catch(()=>{});
    document.querySelector(`.slip[data-id="${CSS.escape(id)}"] .fb`)?.classList.add('open');return}
  if(a==='toAssign'){const to=await ask('要交辦給誰？',true);if(!to)return;
    await mutate(id,i=>{i.kind='assign';i.to=to.trim();(i.comments=i.comments||[]).push({by:me,text:`已轉成交辦，負責人：${to.trim()}`,at:Date.now()})}).catch(()=>{});
    toast('已轉成交辦');return}
  if(a==='del'){if(!await ask('確定刪除這一筆？所有人都會看不到。'))return;
    try{await db.collection('items').doc(id).delete();toast('已刪除')}catch(err){toast('刪除失敗：'+err.message)}}
});
$('#list').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.isComposing&&e.target.matches('.cf input')){e.preventDefault();e.target.nextElementSibling.click()}});

document.querySelector('.tabs').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;tab=b.dataset.tab;render()});
$('#stores').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;store=b.dataset.s;render()});
$('#chips').addEventListener('click',async e=>{const b=e.target.closest('button');if(!b)return;
  if(b.dataset.c==='__add'){
    if(!isAdmin){toast('請先登入管理員');return}
    const n=((await ask('新的 SOP 分類名稱',true))||'').trim();if(!n)return;
    if(sopCats.includes(n)){toast('已經有這個名稱');return}
    const next=[...sopCats,n];
    try{await db.collection('config').doc('sopcats').set({list:next});cat=n;toast('已新增分類')}catch(err){toast('儲存失敗：'+err.message)}
    return}
  cat=b.dataset.c;render()});
$('#refresh').onclick=()=>{render();toast('已重新整理畫面（資料本來就是即時同步的）')};

/* ---------- 新增／編輯表單 ---------- */
function fillCats(){const l=kind==='sop'?sopCats:kind==='wish'?wishCats:cats;$('#fCat').innerHTML=l.map(c=>`<option>${esc(c)}</option>`).join('')+(isAdmin?'<option value="__new">＋ 新增分類…</option>':'');if(l.includes(cat))$('#fCat').value=cat;$('#newCatWrap').hidden=$('#fCat').value!=='__new'}
function fillStores(){const cur=$('#fStore').value;$('#fStore').innerHTML=(kind==='sop'?['全分店',...STORES]:STORES).map(c=>`<option>${c}</option>`).join('');if(cur&&[...$('#fStore').options].some(o=>o.value===cur))$('#fStore').value=cur;else if(store!=='全部')$('#fStore').value=store}
function setKind(k){kind=k;fillCats();fillStores();$('#fBody').placeholder=k==='sop'?'步驟一：…\n步驟二：…\n注意事項：…':'發生在哪裡、什麼狀況、需要什麼協助';$('#anonWrap').style.display=k==='wish'?'flex':'none';$('#dueWrap').hidden=k==='wish'||k==='sop';document.querySelectorAll('#seg button').forEach(b=>b.classList.toggle('on',b.dataset.k===k));$('#segHint').textContent=HINTS[k];$('#assignWrap').hidden=k!=='assign'}
$('#seg').addEventListener('click',e=>{const b=e.target.closest('button');if(b)setKind(b.dataset.k)});
$('#fCat').onchange=()=>{$('#newCatWrap').hidden=$('#fCat').value!=='__new'};
function openForm(it){
  if(!me){toast('請先設定你的名字');askName();return}
  editing=it||null;['#fTitle','#fBody','#fTo','#fDue','#fNewCat'].forEach(x=>$(x).value='');$('#fAnon').checked=false;$('#addErr').textContent='';$('#fStore').innerHTML='';
  $('#seg').style.display=it?'none':'grid';$('#dlgTitle').textContent=it?'編輯 SOP':'新增一筆';
  setKind(it?it.kind:(tab==='done'?'issue':tab));
  if(it){$('#fStore').value=it.store;$('#fCat').value=it.cat;$('#newCatWrap').hidden=true;$('#fTitle').value=it.title;$('#fBody').value=it.body||''}
  $('#addDlg').showModal();
}
$('#addBtn').onclick=()=>openForm();
$('#cancelAdd').onclick=()=>$('#addDlg').close();
$('#addOk').addEventListener('click',async e=>{
  const btn=e.currentTarget;
  if(!$('#fTitle').value.trim()){$('#addErr').textContent='請先填標題';return}
  let c=$('#fCat').value;
  if(!c){$('#addErr').textContent='這一類還沒有分類，請管理員到「管理後台」新增';return}
  btn.disabled=true;
  try{
    if(c==='__new'){
      c=$('#fNewCat').value.trim();if(!c){$('#addErr').textContent='請輸入新分類名稱';btn.disabled=false;return}
      if(!isAdmin){$('#addErr').textContent='只有管理員能新增分類，請改選現有分類';btn.disabled=false;return}
      if(kind==='sop'){if(!sopCats.includes(c)){await db.collection('config').doc('sopcats').set({list:[...sopCats,c]})}}
      else if(kind==='wish'){if(!wishCats.includes(c)){await db.collection('config').doc('wishcats').set({list:[...wishCats,c]})}}
      else if(!cats.includes(c)){await db.collection('config').doc('categories').set({list:[...cats,c]})}
    }
    if(kind==='assign'&&!$('#fTo').value.trim()){$('#addErr').textContent='交辦需要填寫負責人';btn.disabled=false;return}
    if(editing){
      const eid=editing.id;
      await mutate(eid,i=>{i.store=$('#fStore').value;i.cat=c;i.title=$('#fTitle').value.trim();i.body=$('#fBody').value.trim();i.updatedAt=Date.now();i.updatedBy=me});
      editing=null;$('#addDlg').close();toast('已更新');btn.disabled=false;return;
    }
    const id=Date.now().toString(36)+Math.random().toString(36).slice(2,6);
    const it={kind,store:$('#fStore').value,cat:c,title:$('#fTitle').value.trim(),body:$('#fBody').value.trim(),to:kind==='assign'?$('#fTo').value.trim():'',due:kind==='wish'||kind==='sop'?'':($('#fDue').value||''),anon:kind==='wish'&&$('#fAnon').checked,votes:[],by:(kind==='wish'&&$('#fAnon').checked)?'匿名':me,createdAt:Date.now(),done:false,comments:[]};
    await db.collection('items').doc(id).set(it);
    tab=kind;$('#addDlg').close();render();toast('已送出');
  }catch(err){$('#addErr').textContent='送出失敗：'+err.message}
  btn.disabled=false;
});

/* ---------- 名字 ---------- */
function askName(){$('#nameInput').value=me;$('#nameDlg').showModal()}
function saveName(){const v=$('#nameInput').value.trim();if(!v){$('#nameErr').textContent='請輸入名字';return}me=v;$('#meName').textContent=me;$('#nameErr').textContent='';$('#nameDlg').close();render();try{localStorage.setItem('zhinangtuan:me',me)}catch(e){}}
$('#nameOk').onclick=saveName;
$('#nameInput').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.isComposing){e.preventDefault();saveName()}});
function ask(msg,withInput){return new Promise(res=>{$('#askMsg').textContent=msg;const i=$('#askInput');i.value='';i.style.display=withInput?'block':'none';const d=$('#askDlg');
  const done=v=>{$('#askYes').onclick=$('#askNo').onclick=null;d.close();res(v)};
  $('#askYes').onclick=()=>done(withInput?i.value.trim():true);$('#askNo').onclick=()=>done(withInput?'':false);d.oncancel=()=>done(withInput?'':false);
  d.showModal();if(withInput)i.focus()})}
$('#nameDlg').addEventListener('cancel',e=>{if(!me)e.preventDefault()});
$('#changeMe').onclick=askName;

/* ---------- 管理員登入 ---------- */
$('#admBtn').onclick=()=>{if(isAdmin)openAdm();else openLogin()};
function openLogin(){$('#pw0').value=currentEmail();$('#pw1').value='';$('#loginErr').textContent='';$('#loginDlg').showModal();$('#pw0').focus()}
$('#loginNo').onclick=()=>$('#loginDlg').close();
$('#pw1').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.isComposing){e.preventDefault();$('#loginYes').click()}});
$('#loginYes').onclick=async()=>{
  const email=$('#pw0').value.trim(),pw=$('#pw1').value,err=$('#loginErr');
  if(!email||!pw){err.textContent='請輸入 Email 和密碼';return}
  try{
    await auth.signInWithEmailAndPassword(email,pw);
    $('#loginDlg').close();openAdm();
  }catch(e){
    err.textContent=e.code==='auth/user-not-found'?'查無這個帳號，請現有管理員先幫你建立':
      e.code==='auth/wrong-password'||e.code==='auth/invalid-credential'?'密碼不正確':
      e.code==='auth/invalid-email'?'Email 格式不對':('登入失敗：'+e.message);
  }
};

$('#pwChange').onclick=()=>{$('#admDlg').close();$('#npw1').value='';$('#npw2').value='';$('#pwChangeErr').textContent='';$('#pwChangeDlg').showModal()};
$('#pwChangeNo').onclick=()=>$('#pwChangeDlg').close();
$('#pwChangeYes').onclick=async()=>{
  const a=$('#npw1').value,b=$('#npw2').value,err=$('#pwChangeErr');
  if(a.length<6){err.textContent='密碼至少 6 個字';return}
  if(a!==b){err.textContent='兩次輸入的密碼不一樣';return}
  try{await auth.currentUser.updatePassword(a);$('#pwChangeDlg').close();toast('密碼已變更');openAdm()}
  catch(e){err.textContent=e.code==='auth/requires-recent-login'?'請先登出後重新登入，再變更密碼':('失敗：'+e.message)}
};

$('#admLogout').onclick=async()=>{await auth.signOut();$('#admDlg').close();toast('已登出管理員')};
$('#admClose').onclick=()=>$('#admDlg').close();

/* ---------- 分類管理 ---------- */
const LISTS=[
  {id:'stores',label:'分店（大分類）',key:'stores',get:()=>STORES,match:(i,o)=>i.store===o,apply:(i,n)=>i.store=n},
  {id:'cats',label:'問題、交辦、待辦的小分類',key:'categories',get:()=>cats,match:(i,o)=>['issue','assign','todo'].includes(i.kind)&&i.cat===o,apply:(i,n)=>i.cat=n},
  {id:'wish',label:'許願池的小分類',key:'wishcats',get:()=>wishCats,match:(i,o)=>i.kind==='wish'&&i.cat===o,apply:(i,n)=>i.cat=n},
  {id:'sop',label:'SOP 的小分類',key:'sopcats',get:()=>sopCats,match:(i,o)=>i.kind==='sop'&&i.cat===o,apply:(i,n)=>i.cat=n}];
function openAdm(){renderAdm();$('#admDlg').showModal()}
function renderAdm(){
  $('#admLists').innerHTML=LISTS.map(L=>`<h3>${L.label}</h3>`+
    (L.get().length?L.get().map((n,k)=>`<div class="lr"><span>${esc(n)}</span>${k?`<button data-l="${L.id}" data-op="up" data-k="${k}" aria-label="上移">上移</button>`:''}<button data-l="${L.id}" data-op="ren" data-k="${k}">改名</button><button class="x" data-l="${L.id}" data-op="del" data-k="${k}">刪除</button></div>`).join(''):'<p class="hint">目前沒有分類。</p>')+
    `<div class="ladd"><input class="f" data-in="${L.id}" maxlength="12" placeholder="新增名稱"><button data-l="${L.id}" data-op="add">新增</button></div>`).join('');
  const admList=[...new Set([...window.BOOTSTRAP_ADMIN_EMAILS,...adminEmails])];
  $('#admAdmins').innerHTML=admList.map(em=>`<div class="lr"><span>${esc(em)}${window.BOOTSTRAP_ADMIN_EMAILS.includes(em)?' <span class="admbadge">初始管理員</span>':''}</span>${window.BOOTSTRAP_ADMIN_EMAILS.includes(em)?'':`<button class="x" data-admdel="${esc(em)}">移除</button>`}</div>`).join('')
    +`<div class="ladd"><input class="f" id="newAdminEmail" type="email" placeholder="新管理員 Email"><button id="admAddBtn">新增</button></div>`;
}
async function saveList(L,v){if(!isAdmin){toast('請先登入管理員');return false}try{await db.collection('config').doc(L.key).set({list:v});return true}catch(e){toast('儲存失敗：'+e.message);return false}}
$('#admLists').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.isComposing&&e.target.dataset.in){e.preventDefault();e.target.nextElementSibling.click()}});
$('#admLists').addEventListener('click',async e=>{const b=e.target.closest('button[data-op]');if(!b)return;
  const L=LISTS.find(x=>x.id===b.dataset.l),list=[...L.get()],k=+b.dataset.k,op=b.dataset.op;
  if(op==='add'){const inp=$(`input[data-in="${L.id}"]`),n=inp.value.trim();if(!n)return;
    if(n==='全部'||n==='全分店'){toast('這個名稱不能使用');return}if(list.includes(n)){toast('已經有這個名稱');return}
    if(await saveList(L,[...list,n]))toast('已新增')}
  if(op==='up'){[list[k-1],list[k]]=[list[k],list[k-1]];await saveList(L,list)}
  if(op==='ren'){const old=list[k];const n=((await ask(`把「${old}」改成：`,true))||'').trim();if(!n||n===old)return;
    if(list.includes(n)){toast('已經有這個名稱');return}list[k]=n;if(!await saveList(L,list))return;
    const hit=items.filter(i=>L.match(i,old));for(const i of hit)await mutate(i.id,x=>{if(L.match(x,old))L.apply(x,n)}).catch(()=>{});
    if(store===old)store=n;if(cat===old)cat=n;toast(`已改名${hit.length?`，並更新 ${hit.length} 筆資料`:''}`)}
  if(op==='del'){const old=list[k],cnt=items.filter(i=>L.match(i,old)).length;
    if(!await ask(cnt?`「${old}」底下還有 ${cnt} 筆資料。刪除分類後，這些資料會保留，但只能在「全部」看到。確定刪除？`:`確定刪除「${old}」？`))return;
    list.splice(k,1);if(await saveList(L,list)){if(store===old)store='全部';if(cat===old)cat='全部';toast('已刪除')}}
  renderAdm();render()});
$('#admAdmins').addEventListener('click',async e=>{
  if(e.target.id==='admAddBtn'){
    const inp=$('#newAdminEmail'),em=inp.value.trim().toLowerCase();if(!em)return;
    if(window.BOOTSTRAP_ADMIN_EMAILS.includes(em)||adminEmails.includes(em)){toast('已經是管理員');return}
    try{await db.collection('config').doc('admins').set({emails:[...adminEmails,em]},{merge:true});toast('已新增管理員（對方要先在 Firebase Console 建立同一組 Email 的帳號）')}
    catch(err){toast('新增失敗：'+err.message)}
    return}
  const em=e.target.dataset.admdel;if(!em)return;
  if(!await ask(`移除管理員「${em}」？`))return;
  try{await db.collection('config').doc('admins').set({emails:adminEmails.filter(x=>x!==em)},{merge:true});toast('已移除')}
  catch(err){toast('移除失敗：'+err.message)}
});

/* ---------- 啟動 ---------- */
if('serviceWorker' in navigator){
  window.addEventListener('load',()=>{navigator.serviceWorker.register('sw.js').catch(e=>console.error('SW 註冊失敗',e))});
}

(async()=>{
  try{me=localStorage.getItem('zhinangtuan:me')||''}catch(e){me=''}
  $('#meName').textContent=me||'—';

  auth.onAuthStateChanged(user=>{
    updAdm();
    if(!user){auth.signInAnonymously().catch(err=>{console.error(err);toast('連線失敗：'+err.message)});return}
    startListeners();
    if(!user.isAnonymous)ensureConfigDefaults();
  });

  if(!me)askName();
})();
