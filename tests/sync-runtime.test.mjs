import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const core=fs.readFileSync(new URL('../ui/sync-core.js',import.meta.url),'utf8');
const runtime=fs.readFileSync(new URL('../ui/collaboration.js',import.meta.url),'utf8');
function setup(){
 const status={dataset:{}},message={textContent:''},notice={hidden:true,querySelector:()=>message};
 const base={PROJ:{p:{name:'initial',desc:'initial',persons:[]}},GRP:{},BOARD:{},dcRows:[],dccRows:[],boardId:100};
 let remote={...structuredClone(base),revision:0},writes=0,refreshed=0;
 const c=vm.createContext({console,PROJ:structuredClone(base.PROJ),GRP:{},BOARD:{},dcRows:[],dccRows:[],boardId:100,em:false,dcEm:false,dccEm:false,currentUser:{uid:'alice'},db:{},
  window:{addEventListener(){}},document:{getElementById:id=>id==='save-status'?status:id==='sync-notice'?notice:id==='canvas-modal'?{classList:{contains:()=>true}}:null,querySelector:()=>null,addEventListener(){}},
  showToast(){},doc:()=>({}),serverTimestamp:()=>0,rebuildDynamicNav:()=>refreshed++,
  runTransaction:async(_db,fn)=>fn({get:async()=>({exists:()=>true,data:()=>remote}),set:(_ref,data)=>{remote=structuredClone(data);writes++;}})
 });
 vm.runInContext(core+'\n'+runtime+'\nworkspaceBase=currentWorkspace();appDataLoaded=true;',c);
 return {c,status,notice,getRemote:()=>remote,setRemote:r=>remote=r,writes:()=>writes,refreshed:()=>refreshed,base};
}
test('transaction merges another editor, marks saved, and rejects conflicting edits without a write',async()=>{
 const t=setup();vm.runInContext('PROJ.p.name="mine"',t.c);
 t.setRemote({...structuredClone(t.base),PROJ:{p:{name:'initial',desc:'remote',persons:[]}},revision:1});
 assert.equal(await vm.runInContext('saveAppData()',t.c),true);
 assert.equal(t.getRemote().PROJ.p.desc,'remote');assert.equal(t.getRemote().PROJ.p.name,'mine');
 assert.equal(vm.runInContext('unsavedChanges',t.c),false);
 vm.runInContext('PROJ.p.name="second"',t.c);t.setRemote({...t.getRemote(),PROJ:{p:{name:'other',desc:'remote',persons:[]}},revision:3});
 assert.equal(await vm.runInContext('saveAppData()',t.c),false);assert.equal(t.writes(),1);assert.equal(t.getRemote().PROJ.p.name,'other');
 assert.equal(vm.runInContext('PROJ.p.name',t.c),'second');assert.equal(t.notice.hidden,false);
});
test('clean clients apply realtime data, active editors defer it until cancellation',()=>{
 const t=setup();t.c.snapshot={metadata:{hasPendingWrites:false},exists:()=>true,data:()=>({...structuredClone(t.base),PROJ:{p:{name:'remote',desc:'initial',persons:[]}},revision:1})};
 vm.runInContext('receiveWorkspace(snapshot)',t.c);assert.equal(vm.runInContext('PROJ.p.name',t.c),'remote');
 vm.runInContext('dcEm=true',t.c);t.c.snapshot.data=()=>({...structuredClone(t.base),PROJ:{p:{name:'next',desc:'initial',persons:[]}},revision:2});
 vm.runInContext('receiveWorkspace(snapshot)',t.c);assert.equal(vm.runInContext('PROJ.p.name',t.c),'remote');assert.equal(t.notice.hidden,false);
 vm.runInContext('dcEm=false;applyPendingWorkspace()',t.c);assert.equal(vm.runInContext('PROJ.p.name',t.c),'next');assert.equal(t.notice.hidden,true);
});
test('network rejection and unloaded data never overwrite the server',async()=>{
 const t=setup();t.c.runTransaction=async()=>{throw Error('offline');};vm.runInContext('PROJ.p.name="draft"',t.c);
 assert.equal(await vm.runInContext('saveAppData()',t.c),false);assert.equal(vm.runInContext('unsavedChanges',t.c),true);
 assert.equal(t.writes(),0);assert.equal(t.status.dataset.state,'error');
 vm.runInContext('appDataLoaded=false',t.c);assert.equal(await vm.runInContext('saveAppData()',t.c),false);assert.equal(t.writes(),0);
});
