// Pure, conservative three-way merge. Arrays are atomic editing units.
function cloneData(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
function equalData(a,b) {
  if(a===b)return true;
  if(!a||!b||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b))return false;
  const ak=Object.keys(a),bk=Object.keys(b);
  return ak.length===bk.length&&ak.every(k=>Object.hasOwn(b,k)&&equalData(a[k],b[k]));
}
function mergeData(base, local, remote, path = '') {
  if(equalData(local,base))return cloneData(remote);
  if(equalData(remote,base)||equalData(local,remote))return cloneData(local);
  const map=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
  if(map(base)&&map(local)&&map(remote)){
    const result=Object.create(null);
    for(const key of new Set([...Object.keys(base),...Object.keys(local),...Object.keys(remote)])){
      const value=mergeData(base[key],local[key],remote[key],path?`${path}.${key}`:key);
      if(value!==undefined)result[key]=value;
    }
    return result;
  }
  const error=new Error('다른 사용자가 같은 항목을 변경했습니다.');
  error.code='edit-conflict';error.path=path;throw error;
}
function normalizeWorkspace(data={}) {
  const projects=cloneData(data.PROJ||{}),groups=cloneData(data.GRP||{});
  delete groups.completed;
  for(const project of Object.values(projects))project.persons=(project.persons||[]).map(person=>Array.isArray(person)?{c:person[0],cl:person[1]}:person);
  return {PROJ:projects,GRP:groups,BOARD:cloneData(data.BOARD||{}),dcRows:cloneData(data.dcRows||[]),dccRows:cloneData(data.dccRows||[]),boardId:data.boardId||100};
}
// A revision rule may reject a racing commit before the SDK reports ABORTED.
// Retry only if a permitted fresh read proves another revision was committed.
async function transactionWithRevisionRetry(transaction, readRevision) {
  for(let attempt=0;attempt<3;attempt++){
    let observedRevision=null;
    try{return await transaction(revision=>{observedRevision=revision;});}
    catch(error){
      if(attempt===2||error.code!=='permission-denied'||observedRevision===null)throw error;
      let latest;try{latest=await readRevision();}catch{throw error;}
      if(latest<=observedRevision)throw error;
    }
  }
}
