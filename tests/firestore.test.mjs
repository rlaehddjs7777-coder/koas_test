import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {initializeTestEnvironment,assertFails,assertSucceeds} from '@firebase/rules-unit-testing';
import {doc,getDoc,setDoc,updateDoc,deleteDoc,collection,query,where,getDocs,serverTimestamp,runTransaction} from 'firebase/firestore';
test('Firestore rules reject unauthorized access, escalation and obsolete clients; transactions preserve concurrent writes', {skip:!process.env.FIRESTORE_EMULATOR_HOST},async()=>{
 const projectId='demo-koas-security';
 const env=await initializeTestEnvironment({projectId,firestore:{rules:fs.readFileSync(new URL('../firestore.rules',import.meta.url),'utf8')}});
 const base={PROJ:{p:{name:'original',desc:'original'}},GRP:{},BOARD:{},dcRows:[],dccRows:[],boardId:100,completedProjects:[],revision:0};
 try{
  await env.withSecurityRulesDisabled(async c=>{
   const db=c.firestore();await setDoc(doc(db,'appData','main'),base);
   for(const uid of ['alice','bob','pending'])await setDoc(doc(db,'users',uid),{uid,name:uid,email:uid+'@example.test',role:'member',status:uid==='pending'?'pending':'approved',createdAt:serverTimestamp()});
  });
  const alice=env.authenticatedContext('alice',{email:'alice@example.test'}).firestore();
  const bob=env.authenticatedContext('bob',{email:'bob@example.test'}).firestore();
  const pending=env.authenticatedContext('pending',{email:'pending@example.test'}).firestore();
  const fake=env.authenticatedContext('fake',{email:'admin@koas.com'}).firestore();
  const admin=env.authenticatedContext('root',{email:'root@example.test',admin:true}).firestore();
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(),'appData','main')));
  await assertFails(getDoc(doc(pending,'appData','main')));
  await assertFails(getDoc(doc(fake,'appData','main')));
  await assertSucceeds(getDoc(doc(pending,'users','pending')));
  await assertFails(updateDoc(doc(pending,'users','pending'),{status:'approved',role:'admin'}));
  await assertFails(updateDoc(doc(alice,'users','alice'),{role:'admin'}));
  await assertFails(getDocs(collection(alice,'users')));
  await assertSucceeds(getDocs(query(collection(alice,'users'),where('status','==','approved'))));
  await assertSucceeds(updateDoc(doc(admin,'users','pending'),{status:'approved'}));
  await assertSucceeds(getDoc(doc(pending,'appData','main')));
  await assertFails(setDoc(doc(alice,'appData','main'),base));
  await assertFails(deleteDoc(doc(admin,'appData','main')));
  const c=vm.createContext({});vm.runInContext(fs.readFileSync(new URL('../ui/sync-core.js',import.meta.url),'utf8'),c);
  const merge=(b,l,r)=>{c.b=b;c.l=l;c.r=r;return JSON.parse(JSON.stringify(vm.runInContext('mergeData(b,l,r)',c)));};
  const normalized=raw=>{c.raw=raw;return JSON.parse(JSON.stringify(vm.runInContext('normalizeWorkspace(raw)',c)));};
  const initial=normalized(base),localA=structuredClone(initial),localB=structuredClone(initial);
  localA.PROJ.p.name='Alice';localB.PROJ.p.desc='Bob';
  const retry=vm.runInContext('transactionWithRevisionRetry',c);
  const save=(db,uid,local)=>retry(observeRevision=>runTransaction(db,async tx=>{
   const ref=doc(db,'appData','main'),remote=(await tx.get(ref)).data();
   observeRevision(remote.revision||0);
   tx.set(ref,{...merge(initial,local,normalized(remote)),completedProjects:[],revision:(remote.revision||0)+1,protocolVersion:2,updatedBy:uid,updatedAt:serverTimestamp()});
  }),async()=>(await getDoc(doc(db,'appData','main'))).data().revision||0);
  await Promise.all([save(alice,'alice',localA),save(bob,'bob',localB)]);
  const result=(await getDoc(doc(alice,'appData','main'))).data();
  assert.equal(result.PROJ.p.name,'Alice');assert.equal(result.PROJ.p.desc,'Bob');assert.equal(result.revision,2);
  const conflict=structuredClone(initial);conflict.PROJ.p.name='Overwrite';await assert.rejects(save(bob,'bob',conflict),/다른 사용자/);
  await assertFails(setDoc(doc(bob,'appData','main'),{...result,updatedBy:'bob',updatedAt:serverTimestamp()}));
  assert.equal((await getDoc(doc(alice,'appData','main'))).data().PROJ.p.name,'Alice');
  await assertSucceeds(updateDoc(doc(admin,'users','pending'),{status:'rejected'}));
  await assertFails(getDoc(doc(pending,'appData','main')));
 }finally{await env.cleanup();}
});
