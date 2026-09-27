/* 智囊團 — Firebase 版
   資料模型與畫面邏輯沿用 Trista 確認過的原型（prototype.html），
   差別只在儲存方式：window.storage → Firestore（多人即時同步），
   以及管理員登入：前端密碼雜湊 → 真正的 Firebase Auth（Email/密碼），
   權限檢查在 Firestore 安全性規則（伺服器端），不是只靠前端判斷。 */

const KINDS={urgent:'緊急',issue:'問題',wish:'許願',sop:'SOP',obs:'觀察',assign:'交辦',todo:'待辦'};
const HINTS={urgent:'需要馬上處理的緊急狀況，用最顯眼的顏色排在最前面。可標記完成、可轉成交辦。',issue:'看到的問題寫上來，所有人都看得到，也都可以回饋。',assign:'指派給特定的人處理。',todo:'自己或團隊要做、還沒做的事。',sop:'標準作業流程，大家都能查看。分店選「全分店」代表三間店通用。',obs:'客人反應、活動、營運、營銷的觀察記錄，當作持續累積的日誌，不會消失、也不會進完成區，但可以編輯更新。',wish:'員工福利、想新增的設備器具、同事相處、人力不夠太累……想說的都可以寫，大家可以按「我也想要」。'};
const DEFAULT_WISH=['員工福利','設備器具','人際相處','人力配置','其他'];
const DEFAULT_CATS=['門市營運','產品品質','設備維修','人員排班','食安衛生','客人意見','其他'];
const DEFAULT_OBS=['客人','活動','營運','營銷'];
const DEFAULT_STORES=['象山','A13','板橋'];

let wishCats=[...DEFAULT_WISH],sopCats=[],obsCats=[...DEFAULT_OBS],editing=null;
let STORES=[...DEFAULT_STORES];
let adminEmails=[];
let isAdmin=false;
let store='全部';
let items=[],cats=[...DEFAULT_CATS],me='',tab='urgent',cat='全部',kind='urgent',busy=false;
let listenersReady=false;
let pendingPhotos=[];
const commentDraftText={};
const commentPhotoDrafts={};
const openFeedback=new Set();
const MAX_PHOTOS=4,MAX_COMMENT_PHOTOS=2,PHOTO_MAX_DIM=1280,PHOTO_QUALITY=0.65,MAX_DOC_BYTES=900000;

const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=t=>{if(!t)return'';const d=new Date(t),p=n=>String(n).padStart(2,'0');return`${d.getFullYear()}/${p(d.getMonth()+1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`};
const dur=(a,b)=>{const m=Math.round((b-a)/60000);if(m<60)return m+' 分鐘';const h=Math.floor(m/60);if(h<48)return h+' 小時'+(m%60?` ${m%60} 分`:'');return Math.floor(h/24)+' 天'};
function toast(msg){const t=$('#toast');t.textContent=msg;t.classList.add('show');clearTimeout(t._t);t._t=setTimeout(()=>t.classList.remove('show'),1800)}
function roughSize(obj){try{return new Blob([JSON.stringify(obj)]).size}catch(e){return 0}}
function compressImage(file,maxDim,quality){
  return new Promise((resolve,reject)=>{
    const url=URL.createObjectURL(file);
    const img=new Image();
    img.onload=()=>{
      URL.revokeObjectURL(url);
      let{width,height}=img;
      const scale=Math.min(1,maxDim/Math.max(width,height));
      width=Math.max(1,Math.round(width*scale));height=Math.max(1,Math.round(height*scale));
      const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
      canvas.getContext('2d').drawImage(img,0,0,width,height);
      resolve(canvas.toDataURL('image/jpeg',quality));
    };
    img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('圖片讀取失敗'))};
    img.src=url;
  });
}
function openLightbox(src){$('#lightboxImg').src=src;$('#lightbox').classList.add('show')}
function closeLightbox(){$('#lightbox').classList.remove('show');$('#lightboxImg').src=''}

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
  db.collection('config').doc('obscats').onSnapshot(d=>{
    const v=d.data();if(v&&Array.isArray(v.list)&&v.list.length)obsCats=v.list;render()
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
    ['sopcats',{list:[]}],
    ['obscats',{list:DEFAULT_OBS}]
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
  const list=tab==='sop'?sopCats:tab==='obs'?obsCats:tab==='wish'?wishCats:tab==='done'?[...cats,...wishCats.filter(x=>!cats.includes(x))]:cats;
  if(cat!=='全部'&&!list.includes(cat))cat='全部';
  const all=['全部',...list];
  $('#chips').innerHTML=all.map(c=>`<button class="${c===cat?'on':''}" data-c="${esc(c)}">${esc(c)}</button>`).join('')+((tab==='sop'||tab==='obs')&&isAdmin?'<button class="addc" data-c="__add">＋ 新增分類</button>':'');
}
function render(){
  const inStore=i=>store==='全部'||i.store===store||i.store==='全分店';
  const cnt={urgent:0,issue:0,wish:0,sop:0,obs:0,assign:0,todo:0,done:0};
  items.filter(inStore).forEach(i=>i.done?cnt.done++:cnt[i.kind]++);
  for(const k in cnt)$('#n-'+k).textContent=cnt[k];
  document.querySelectorAll('.tabs button').forEach(b=>b.setAttribute('aria-selected',b.dataset.tab===tab));
  renderChips();
  let list=items.filter(i=>tab==='done'?i.done:(!i.done&&i.kind===tab));
  list=list.filter(inStore);
  if(cat!=='全部')list=list.filter(i=>i.cat===cat);
  list.sort((a,b)=>(tab==='sop'||tab==='obs')?((b.updatedAt||b.createdAt)-(a.updatedAt||a.createdAt)):tab==='done'?(b.doneAt-a.doneAt):tab==='wish'?(((b.votes||[]).length-(a.votes||[]).length)||b.createdAt-a.createdAt):(b.createdAt-a.createdAt));
  if(!list.length){
    let msg;
    const catLabel=tab==='sop'?'SOP':'觀察';
    const catList=tab==='sop'?sopCats:obsCats;
    if(tab==='done')msg='還沒有完成的項目。';
    else if((tab==='sop'||tab==='obs')&&!catList.length)msg=isAdmin?`先按上方「＋ 新增分類」建立${catLabel}分類，再按右下角「新增」寫第一筆。`:`還沒有${catLabel}分類，請管理員到「管理後台」新增。`;
    else msg='這裡目前是空的，按右下角「新增」寫第一筆。';
    $('#list').innerHTML=`<div class="empty">${msg}</div>`;return;
  }
  $('#list').innerHTML=list.map(card).join('');
}
function photoGrid(arr){
  if(!arr||!arr.length)return'';
  return`<div class="photo-grid">${arr.map(src=>`<div class="photo-thumb"><img src="${src}" class="photo-open" data-src="${esc(src)}"></div>`).join('')}</div>`;
}
function commentDraftPhotoGrid(id){
  const arr=commentPhotoDrafts[id]||[];
  if(!arr.length)return'';
  return`<div class="photo-grid commentPending">${arr.map((src,idx)=>`<div class="photo-thumb"><img src="${src}" class="photo-open" data-src="${esc(src)}"><button type="button" class="rm" data-a="rmCommentPhoto" data-cid="${esc(id)}" data-idx="${idx}">×</button></div>`).join('')}</div>`;
}
function card(i){
  const cls=i.done?'done':i.kind;
  const overdue=!i.done&&i.due&&new Date(i.due+'T23:59')<new Date();
  const editable=i.kind==='sop'||i.kind==='obs';
  const cm=(i.comments||[]).map(c=>`<div class="c"><b>${esc(c.by)}</b>：${esc(c.text)}<div class="w">${fmt(c.at)}</div>${photoGrid(c.photos)}</div>`).join('')||'<div class="c w">還沒有回饋。</div>';
  return`<article class="slip ${cls}" data-id="${esc(i.id)}">
    <div class="top"><span class="kind" style="--k:var(--${i.kind})">${KINDS[i.kind]}</span><span class="store">${esc(i.store||'未分店')}</span><span class="cat">${esc(i.cat)}</span>${overdue?'<span style="color:var(--issue);font-weight:700">已逾期</span>':''}</div>
    <h3>${esc(i.title)}</h3>
    ${i.body?`<p class="body">${esc(i.body)}</p>`:''}
    ${photoGrid(i.photos)}
    <div class="meta">
      <span>${editable?'建立':'提出'}：<b>${i.anon?'匿名':esc(i.by)}</b>　${fmt(i.createdAt)}</span>
      ${i.updatedAt?`<span>最後更新：<b>${esc(i.updatedBy)}</b>　${fmt(i.updatedAt)}</span>`:''}
      ${i.kind==='assign'?`<span>交辦給：<b>${esc(i.to||'未指定')}</b></span>`:''}
      ${i.due?`<span>期限：${esc(i.due.replace(/-/g,'/'))}</span>`:''}
      ${i.done?`<span>完成：<b>${esc(i.doneBy)}</b>　${fmt(i.doneAt)}（歷時 ${dur(i.createdAt,i.doneAt)}）</span>`:''}
    </div>
    ${i.done?`<span class="stamp">${i.kind==='wish'?'已實現':'已完成'}</span>`:''}
    <div class="acts">
      ${i.kind==='wish'?`<button class="vote ${(i.votes||[]).includes(me)?'on':''}" data-a="vote">我也想要（${(i.votes||[]).length}）</button>`:''}
      <button data-a="fb">回饋（${(i.comments||[]).length}）</button>
      ${editable?'<button class="primary" data-a="edit">編輯</button>':i.done?'<button data-a="undo">移回未完成</button>':`<button class="primary" data-a="done">${i.kind==='wish'?'標記實現':'標記完成'}</button>`}
      ${!i.done&&(i.kind==='issue'||i.kind==='urgent')?'<button data-a="toAssign">轉成交辦</button>':''}
      <button class="ghost" data-a="del">刪除</button>
    </div>
    <div class="fb ${openFeedback.has(i.id)?'open':''}"><div class="cl">${cm}</div>
      ${commentDraftPhotoGrid(i.id)}
      <div class="cf">
        <input placeholder="寫下你的回饋或處理進度" maxlength="300" value="${esc(commentDraftText[i.id]||'')}">
        <label class="photo-add">📷 照片<input type="file" accept="image/*" multiple class="commentPhotoInput" data-id="${esc(i.id)}"></label>
        <button data-a="send">送出</button>
      </div>
    </div>
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
  if(e.target.matches('.photo-open')){openLightbox(e.target.dataset.src);return}
  const b=e.target.closest('button[data-a]');if(!b)return;
  const art=b.closest('.slip'),id=art.dataset.id,a=b.dataset.a;
  if(a==='fb'){
    const willOpen=!openFeedback.has(id);
    willOpen?openFeedback.add(id):openFeedback.delete(id);
    const fb=art.querySelector('.fb');fb.classList.toggle('open',willOpen);
    if(willOpen)fb.querySelector('.cf input')?.focus();
    return}
  if(a==='edit'){openForm(items.find(x=>x.id===id));return}
  if(a==='vote'){await mutate(id,i=>{i.votes=i.votes||[];const k=i.votes.indexOf(me);k<0?i.votes.push(me):i.votes.splice(k,1)}).catch(()=>{});return}
  if(a==='done'){await mutate(id,i=>{i.done=true;i.doneAt=Date.now();i.doneBy=me}).catch(()=>{});toast('已移到完成區');return}
  if(a==='undo'){await mutate(id,i=>{i.done=false;i.doneAt=firebase.firestore.FieldValue.delete();i.doneBy=firebase.firestore.FieldValue.delete()}).catch(()=>{});toast('已移回');return}
  if(a==='send'){
    const inp=art.querySelector('.cf input'),text=inp.value.trim();
    const photos=commentPhotoDrafts[id]||[];
    if(!text&&!photos.length)return;
    const current=items.find(x=>x.id===id);if(!current)return;
    const comment={by:me,text,at:Date.now()};
    if(photos.length)comment.photos=photos;
    const preview={...current,comments:[...(current.comments||[]),comment]};
    if(roughSize(preview)>MAX_DOC_BYTES){toast('這則附件太大了，請減少照片數量再試一次');return}
    await mutate(id,i=>{(i.comments=i.comments||[]).push(comment)}).catch(()=>{});
    delete commentDraftText[id];delete commentPhotoDrafts[id];openFeedback.add(id);
    document.querySelector(`.slip[data-id="${CSS.escape(id)}"] .fb`)?.classList.add('open');return}
  if(a==='rmCommentPhoto'){
    const cid=b.dataset.cid,idx=+b.dataset.idx;
    if(commentPhotoDrafts[cid]){commentPhotoDrafts[cid].splice(idx,1);if(!commentPhotoDrafts[cid].length)delete commentPhotoDrafts[cid]}
    openFeedback.add(cid);render();return}
  if(a==='toAssign'){const to=await ask('要交辦給誰？',true);if(!to)return;
    await mutate(id,i=>{i.kind='assign';i.to=to.trim();(i.comments=i.comments||[]).push({by:me,text:`已轉成交辦，負責人：${to.trim()}`,at:Date.now()})}).catch(()=>{});
    toast('已轉成交辦');return}
  if(a==='del'){if(!await ask('確定刪除這一筆？所有人都會看不到。'))return;
    try{await db.collection('items').doc(id).delete();toast('已刪除')}catch(err){toast('刪除失敗：'+err.message)}}
});
$('#list').addEventListener('input',e=>{
  if(e.target.matches('.cf input')){const id=e.target.closest('.slip').dataset.id;commentDraftText[id]=e.target.value}
});
$('#list').addEventListener('change',async e=>{
  if(!e.target.matches('.commentPhotoInput'))return;
  const id=e.target.dataset.id;
  const files=[...e.target.files];e.target.value='';
  commentPhotoDrafts[id]=commentPhotoDrafts[id]||[];
  for(const f of files){
    if(commentPhotoDrafts[id].length>=MAX_COMMENT_PHOTOS){toast(`回饋最多附 ${MAX_COMMENT_PHOTOS} 張照片`);break}
    try{commentPhotoDrafts[id].push(await compressImage(f,PHOTO_MAX_DIM,PHOTO_QUALITY))}
    catch(err){toast('這張照片讀取失敗，換一張試試')}
  }
  openFeedback.add(id);render();
});
$('#list').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.isComposing&&e.target.matches('.cf input')){e.preventDefault();e.target.closest('.cf').querySelector('button[data-a="send"]').click()}});

document.querySelector('.tabs').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;tab=b.dataset.tab;render()});
$('#stores').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;store=b.dataset.s;render()});
$('#chips').addEventListener('click',async e=>{const b=e.target.closest('button');if(!b)return;
  if(b.dataset.c==='__add'){
    if(!isAdmin){toast('請先登入管理員');return}
    const key=tab==='obs'?'obscats':'sopcats';
    const curList=tab==='obs'?obsCats:sopCats;
    const n=((await ask(`新的${tab==='obs'?'觀察':'SOP'}分類名稱`,true))||'').trim();if(!n)return;
    if(curList.includes(n)){toast('已經有這個名稱');return}
    const next=[...curList,n];
    try{await db.collection('config').doc(key).set({list:next});cat=n;toast('已新增分類')}catch(err){toast('儲存失敗：'+err.message)}
    return}
  cat=b.dataset.c;render()});
$('#refresh').onclick=()=>{render();toast('已重新整理畫面（資料本來就是即時同步的）')};
$('#lightbox').addEventListener('click',closeLightbox);

/* ---------- 新增／編輯表單 ---------- */
function catsFor(k){return k==='sop'?sopCats:k==='obs'?obsCats:k==='wish'?wishCats:cats}
function fillCats(){const l=catsFor(kind);$('#fCat').innerHTML=l.map(c=>`<option>${esc(c)}</option>`).join('')+(isAdmin?'<option value="__new">＋ 新增分類…</option>':'');if(l.includes(cat))$('#fCat').value=cat;$('#newCatWrap').hidden=$('#fCat').value!=='__new'}
function fillStores(){const cur=$('#fStore').value;$('#fStore').innerHTML=(kind==='sop'?['全分店',...STORES]:STORES).map(c=>`<option>${c}</option>`).join('');if(cur&&[...$('#fStore').options].some(o=>o.value===cur))$('#fStore').value=cur;else if(store!=='全部')$('#fStore').value=store}
function renderFormPhotoPreview(){
  $('#fPhotoPreview').innerHTML=pendingPhotos.map((src,idx)=>`<div class="photo-thumb"><img src="${src}" class="photo-open" data-src="${src}"><button type="button" class="rm" data-rmphoto="${idx}">×</button></div>`).join('');
}
function setKind(k){kind=k;fillCats();fillStores();$('#fBody').placeholder=k==='sop'?'步驟一：…\n步驟二：…\n注意事項：…':k==='obs'?'看到／聽到什麼、什麼時候、有什麼影響':'發生在哪裡、什麼狀況、需要什麼協助';$('#anonWrap').style.display=k==='wish'?'flex':'none';$('#dueWrap').hidden=k==='wish'||k==='sop'||k==='obs';document.querySelectorAll('#seg button').forEach(b=>b.classList.toggle('on',b.dataset.k===k));$('#segHint').textContent=HINTS[k];$('#assignWrap').hidden=k!=='assign'}
$('#seg').addEventListener('click',e=>{const b=e.target.closest('button');if(b)setKind(b.dataset.k)});
$('#fCat').onchange=()=>{$('#newCatWrap').hidden=$('#fCat').value!=='__new'};
$('#fPhotos').addEventListener('change',async e=>{
  const files=[...e.target.files];e.target.value='';
  for(const f of files){
    if(pendingPhotos.length>=MAX_PHOTOS){toast(`最多只能附 ${MAX_PHOTOS} 張照片`);break}
    try{pendingPhotos.push(await compressImage(f,PHOTO_MAX_DIM,PHOTO_QUALITY))}
    catch(err){toast('這張照片讀取失敗，換一張試試')}
  }
  renderFormPhotoPreview();
});
$('#fPhotoPreview').addEventListener('click',e=>{
  const rm=e.target.closest('[data-rmphoto]');
  if(rm){pendingPhotos.splice(+rm.dataset.rmphoto,1);renderFormPhotoPreview();return}
  if(e.target.matches('.photo-open'))openLightbox(e.target.dataset.src);
});
function openForm(it){
  if(!me){toast('請先設定你的名字');askName();return}
  editing=it||null;['#fTitle','#fBody','#fTo','#fDue','#fNewCat'].forEach(x=>$(x).value='');$('#fAnon').checked=false;$('#addErr').textContent='';$('#fStore').innerHTML='';
  pendingPhotos=it&&it.photos?[...it.photos]:[];renderFormPhotoPreview();
  $('#seg').style.display=it?'none':'grid';$('#dlgTitle').textContent=it?'編輯 '+KINDS[it.kind]:'新增一筆';
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
      else if(kind==='obs'){if(!obsCats.includes(c)){await db.collection('config').doc('obscats').set({list:[...obsCats,c]})}}
      else if(kind==='wish'){if(!wishCats.includes(c)){await db.collection('config').doc('wishcats').set({list:[...wishCats,c]})}}
      else if(!cats.includes(c)){await db.collection('config').doc('categories').set({list:[...cats,c]})}
    }
    if(kind==='assign'&&!$('#fTo').value.trim()){$('#addErr').textContent='交辦需要填寫負責人';btn.disabled=false;return}
    if(editing){
      const eid=editing.id;
      const preview={...editing,store:$('#fStore').value,cat:c,title:$('#fTitle').value.trim(),body:$('#fBody').value.trim(),photos:pendingPhotos};
      if(roughSize(preview)>MAX_DOC_BYTES){$('#addErr').textContent='附的照片太大了，請減少張數或選更小的照片';btn.disabled=false;return}
      await mutate(eid,i=>{i.store=$('#fStore').value;i.cat=c;i.title=$('#fTitle').value.trim();i.body=$('#fBody').value.trim();i.photos=pendingPhotos;i.updatedAt=Date.now();i.updatedBy=me});
      editing=null;pendingPhotos=[];$('#addDlg').close();toast('已更新');btn.disabled=false;return;
    }
    const id=Date.now().toString(36)+Math.random().toString(36).slice(2,6);
    const it={kind,store:$('#fStore').value,cat:c,title:$('#fTitle').value.trim(),body:$('#fBody').value.trim(),photos:pendingPhotos,to:kind==='assign'?$('#fTo').value.trim():'',due:kind==='wish'||kind==='sop'||kind==='obs'?'':($('#fDue').value||''),anon:kind==='wish'&&$('#fAnon').checked,votes:[],by:(kind==='wish'&&$('#fAnon').checked)?'匿名':me,createdAt:Date.now(),done:false,comments:[]};
    if(roughSize(it)>MAX_DOC_BYTES){$('#addErr').textContent='附的照片太大了，請減少張數或選更小的照片';btn.disabled=false;return}
    await db.collection('items').doc(id).set(it);
    pendingPhotos=[];tab=kind;$('#addDlg').close();render();toast('已送出');
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
  {id:'cats',label:'問題、緊急、交辦、待辦的小分類',key:'categories',get:()=>cats,match:(i,o)=>['issue','urgent','assign','todo'].includes(i.kind)&&i.cat===o,apply:(i,n)=>i.cat=n},
  {id:'wish',label:'許願池的小分類',key:'wishcats',get:()=>wishCats,match:(i,o)=>i.kind==='wish'&&i.cat===o,apply:(i,n)=>i.cat=n},
  {id:'sop',label:'SOP 的小分類',key:'sopcats',get:()=>sopCats,match:(i,o)=>i.kind==='sop'&&i.cat===o,apply:(i,n)=>i.cat=n},
  {id:'obs',label:'觀察的小分類',key:'obscats',get:()=>obsCats,match:(i,o)=>i.kind==='obs'&&i.cat===o,apply:(i,n)=>i.cat=n}];
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
