let memberUnsubscribe=null, authGeneration=0, activatedUid=null, permissionEpoch=0;
onAuthStateChanged(auth,async user=>{
  const generation=++authGeneration;
  memberUnsubscribe?.();memberUnsubscribe=null;stopWorkspaceSync();activatedUid=null;
  currentUser=user;isAdmin=false;
  if(!user){stopIdleWatch();unsavedChanges=false;assignWorkspace({});goTo('login');
    const button=document.getElementById('btn-login-do');if(button)button.disabled=false;
    document.getElementById('btn-login-txt').textContent='로그인';return;}
  try{
    const token=await getIdTokenResult(user);
    if(generation!==authGeneration)return;
    isAdmin=token.claims.admin===true;
    memberUnsubscribe=onSnapshot(doc(db,'users',user.uid),async snapshot=>{
      if(generation!==authGeneration)return;
      const permission=++permissionEpoch;
      const approved=isAdmin||(snapshot.exists()&&snapshot.data().status==='approved');
      if(!approved){activatedUid=null;stopWorkspaceSync();stopIdleWatch();showPendingScreen();document.getElementById('pending-user-name').textContent=user.displayName||user.email;return;}
      if(activatedUid===user.uid)return;
      activatedUid=user.uid;
      const loaded=await loadAppData();
      if(generation!==authGeneration||permission!==permissionEpoch)return;
      updateHeader(user);applyRoleRestrictions();rebuildDynamicNav();goTo('dashboard');startIdleWatch();
      if(loaded)startWorkspaceSync();else{activatedUid=null;showSyncNotice('업무 데이터를 불러오지 못했습니다. 권한과 연결을 확인한 뒤 최신 내용 불러오기를 눌러 주세요.');}
    },error=>{if(generation!==authGeneration)return;stopWorkspaceSync();stopIdleWatch();console.error('회원 권한 확인 실패',error);goTo('login');showError('회원 권한을 확인하지 못했습니다. Firebase 보안 규칙과 연결을 확인해 주세요.');document.getElementById('btn-login-do').disabled=false;});
  }catch(error){if(generation!==authGeneration)return;goTo('login');showError('로그인 권한을 확인하지 못했습니다. 다시 시도해 주세요.');document.getElementById('btn-login-do').disabled=false;}
});
