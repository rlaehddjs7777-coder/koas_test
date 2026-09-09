let unsavedChanges=false, appDataLoaded=false, workspaceBase=null, workspaceRevision=0;
let workspaceUnsubscribe=null, pendingWorkspace=null, workspaceSaving=false, workspaceSession=0;
function updateSaveStatus(text,state='') {
  const el=document.getElementById('save-status');if(el){el.textContent=text;el.dataset.state=state;}
}
function currentWorkspace(){return normalizeWorkspace({PROJ,GRP,BOARD,dcRows,dccRows,boardId});}
function hasWorkspaceEdits(){return !!(em||dcEm||dccEm||document.getElementById('new-pf')||document.querySelector('textarea[id^="et-"],#proj-add-modal,#edit-members-modal,#add-group-modal,#rename-grp-modal')||!document.getElementById('canvas-modal')?.classList.contains('hidden'));}
function isWorkspaceDirty(){return unsavedChanges||hasWorkspaceEdits()||(workspaceBase&&!equalData(currentWorkspace(),workspaceBase));}
function assignWorkspace(data){const d=normalizeWorkspace(data);PROJ=d.PROJ;GRP=d.GRP;BOARD=d.BOARD;dcRows=d.dcRows;dccRows=d.dccRows;boardId=d.boardId;}
function showSyncNotice(message){const el=document.getElementById('sync-notice');el.hidden=false;el.querySelector('.sync-message').textContent=message;}
function hideSyncNotice(){document.getElementById('sync-notice').hidden=true;}
function refreshWorkspaceView(){
  rebuildDynamicNav();
  const view=document.querySelector('.main>.view.active');if(!view)return;
  if(view.id==='view-detail'){
    if(PROJ[curKey]){goToDetail(curKey);}else{goTo('dashboard');showToast('이 프로젝트가 다른 사용자에 의해 삭제되었습니다.');}
  }else if(view.id==='view-group'){goTo(GRP[curGrp]?curGrp:'dashboard');}
  else if(view.id.startsWith('view-grp-')){const key=view.id.slice(9);goTo(GRP[key]?key:'dashboard');}
  else goTo(view.id.replace('view-',''));
}
function stopWorkspaceSync(){workspaceSession++;workspaceUnsubscribe?.();workspaceUnsubscribe=null;pendingWorkspace=null;appDataLoaded=false;workspaceBase=null;hideSyncNotice();}
function receiveWorkspace(snapshot){
  if(snapshot.metadata.hasPendingWrites)return;
  if(!snapshot.exists()){appDataLoaded=false;showSyncNotice('업무 데이터가 삭제되었습니다. 관리자에게 문의해 주세요.');return;}
  const raw=snapshot.data(),revision=raw.revision||0;
  if(revision<=workspaceRevision)return;
  const incoming={data:normalizeWorkspace(raw),revision};
  if(workspaceSaving||isWorkspaceDirty()){
    pendingWorkspace=incoming;
    showSyncNotice('다른 사용자의 변경이 있습니다. 현재 편집을 저장하면 충돌 여부를 확인해 합칩니다.');return;
  }
  assignWorkspace(incoming.data);workspaceBase=cloneData(incoming.data);workspaceRevision=revision;
  updateSaveStatus('최신 변경 반영됨');hideSyncNotice();refreshWorkspaceView();
}
function startWorkspaceSync(){
  workspaceUnsubscribe?.();
  workspaceUnsubscribe=onSnapshot(doc(db,'appData','main'),receiveWorkspace,error=>{
    console.error('실시간 동기화 실패',error);updateSaveStatus('동기화 연결 실패','error');
    showSyncNotice('실시간 연결을 확인하지 못했습니다. 저장 시 서버의 최신 데이터와 다시 비교합니다.');
  });
}
async function loadAppData(){
  appDataLoaded=false;
  const session=workspaceSession;
  try{
    const snapshot=await getDoc(doc(db,'appData','main'));
    if(session!==workspaceSession)return false;
    if(!snapshot.exists())throw new Error('업무 데이터가 없습니다. 관리자가 초기 데이터를 설정해야 합니다.');
    const raw=snapshot.data();assignWorkspace(raw);workspaceBase=currentWorkspace();workspaceRevision=raw.revision||0;
    appDataLoaded=true;unsavedChanges=false;pendingWorkspace=null;updateSaveStatus('최신 데이터 연결됨');return true;
  }catch(error){console.error('데이터 불러오기 실패',error);updateSaveStatus('불러오기 실패','error');showToast('데이터를 불러오지 못했습니다. 권한과 연결을 확인해 주세요.',7000);return false;}
}
async function saveAppData(){
  if(!appDataLoaded||!workspaceBase||!currentUser){showToast('데이터를 먼저 불러와야 저장할 수 있습니다.',5000);return false;}
  if(workspaceSaving){unsavedChanges=true;showToast('앞선 저장이 진행 중입니다. 완료 후 다시 저장해 주세요.',5000);return false;}
  workspaceSaving=true;unsavedChanges=true;updateSaveStatus('변경 비교 및 저장 중…','saving');
  const request=currentWorkspace(),base=cloneData(workspaceBase),uid=currentUser.uid,session=workspaceSession;
  try{
    const result=await transactionWithRevisionRetry(observeRevision=>runTransaction(db,async transaction=>{
      const ref=doc(db,'appData','main'),snapshot=await transaction.get(ref);
      if(!snapshot.exists())throw new Error('삭제된 업무 데이터에는 저장할 수 없습니다.');
      const remote=snapshot.data();observeRevision(remote.revision||0);const merged=mergeData(base,request,normalizeWorkspace(remote));
      const revision=(remote.revision||0)+1;
      transaction.set(ref,{...merged,completedProjects:Object.keys(merged.PROJ).filter(key=>merged.PROJ[key].group==='completed'),revision,protocolVersion:2,updatedBy:uid,updatedAt:serverTimestamp()});
      return {data:merged,revision};
    }),async()=>{const latest=await getDoc(doc(db,'appData','main'));if(!latest.exists())throw new Error('업무 데이터가 삭제되었습니다.');return latest.data().revision||0;});
    if(session!==workspaceSession)return false;
    const current=currentWorkspace();
    try{assignWorkspace(mergeData(request,current,result.data));}catch{showSyncNotice('저장 중 추가 편집이 있었습니다. 현재 내용을 유지했습니다. 다음 저장에서 다시 비교합니다.');}
    workspaceBase=cloneData(result.data);workspaceRevision=result.revision;
    unsavedChanges=!equalData(currentWorkspace(),workspaceBase);
    updateSaveStatus(unsavedChanges?'추가 변경 미저장':'저장 완료');
    if(pendingWorkspace?.revision<=result.revision){pendingWorkspace=null;hideSyncNotice();}
    return true;
  }catch(error){
    if(session!==workspaceSession)return false;
    updateSaveStatus(error.code==='edit-conflict'?'편집 충돌 · 내용 보존됨':'저장 실패 · 내용 보존됨','error');
    showSyncNotice(error.code==='edit-conflict'?'같은 항목이 변경되어 저장을 중단했습니다. 내 편집본을 내려받은 뒤 최신 내용을 불러와 다시 편집하세요.':'저장하지 못했습니다. 현재 편집 내용을 유지하고 있습니다. 연결과 권한을 확인한 뒤 다시 시도하세요.');
    showToast(error.code==='edit-conflict'?'동시 편집 충돌입니다. 다른 사용자의 내용은 덮어쓰지 않았습니다.':'저장에 실패했습니다. 다시 시도해 주세요.',7000);return false;
  }finally{workspaceSaving=false;}
}
window.saveAppData=saveAppData;
window.addEventListener('beforeunload',event=>{if(isWorkspaceDirty()||workspaceSaving){event.preventDefault();event.returnValue='';}});
window.downloadWorkspaceDraft=function(){
  const draftFields=[...document.querySelectorAll('.main input:not([type="password"]),.main textarea,.main [contenteditable="true"]')].filter(el=>el.getClientRects().length).map(el=>({id:el.id,value:el.value??el.textContent}));
  const blob=new Blob([JSON.stringify({savedAt:new Date().toISOString(),baseRevision:workspaceRevision,data:currentWorkspace(),draftFields},null,2)],{type:'application/json'});
  const link=document.createElement('a'),url=URL.createObjectURL(blob);link.href=url;link.download='koas-edit-backup.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
window.reloadWorkspace=async function(){
  if(workspaceSaving){showToast('저장이 완료된 뒤 다시 시도하세요.');return;}
  if(isWorkspaceDirty()&&!confirm('저장하지 않은 편집을 버리고 최신 내용을 불러올까요? 필요하면 먼저 내 편집본을 내려받으세요.'))return;
  if(await loadAppData()){em=false;dcEm=false;dccEm=false;document.getElementById('new-pf')?.remove();document.querySelectorAll('textarea[id^="et-"]').forEach(el=>el.remove());hideSyncNotice();refreshWorkspaceView();startWorkspaceSync();}
};
function applyPendingWorkspace(){
  if(!pendingWorkspace||workspaceSaving||isWorkspaceDirty())return;
  const next=pendingWorkspace;pendingWorkspace=null;
  if(next.revision<=workspaceRevision)return;
  assignWorkspace(next.data);workspaceBase=cloneData(next.data);workspaceRevision=next.revision;
  hideSyncNotice();updateSaveStatus('최신 변경 반영됨');refreshWorkspaceView();
}
document.addEventListener('click',()=>setTimeout(applyPendingWorkspace,0));
