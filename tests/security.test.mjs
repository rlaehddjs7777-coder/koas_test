import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {JSDOM} from 'jsdom';
import createDOMPurify from 'dompurify';
const core=fs.readFileSync(new URL('../ui/sync-core.js',import.meta.url),'utf8');
const source=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const template=JSON.parse(source.match(/<script type="__bundler\/template">([\s\S]*?)<\/script>/)[1]);
const app=template.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
test('different project fields merge, same-field and delete/edit conflicts preserve remote',()=>{
 const c=vm.createContext({});vm.runInContext(core,c);
 c.base={PROJ:{p:{name:'old',desc:'old'},q:{name:'q'}},rows:[{x:1}]};
 c.local={PROJ:{p:{name:'mine',desc:'old'},q:{name:'q'}},rows:[{x:1}]};
 c.remote={PROJ:{p:{name:'old',desc:'theirs'},q:{name:'q'}},rows:[{x:1}]};
 assert.equal(vm.runInContext('mergeData(base,local,remote).PROJ.p.desc',c),'theirs');
 assert.equal(vm.runInContext('mergeData(base,local,remote).PROJ.p.name',c),'mine');
 c.remote.PROJ.p.name='conflict';assert.throws(()=>vm.runInContext('mergeData(base,local,remote)',c),/다른 사용자/);
 delete c.local.PROJ.p;assert.throws(()=>vm.runInContext('mergeData(base,local,remote)',c),/다른 사용자/);
});
test('arrays conflict conservatively and empty arrays remain empty',()=>{
 const c=vm.createContext({});vm.runInContext(core,c);
 assert.equal(vm.runInContext('normalizeWorkspace({dcRows:[],dccRows:[]}).dcRows.length',c),0);
 assert.throws(()=>vm.runInContext('mergeData([1],[2],[3])',c),/다른 사용자/);
 assert.equal(vm.runInContext('mergeData([1],[],[1]).length',c),0);
});
function domContext(full=false){
 const dom=new JSDOM(full?template.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,''):'<body></body>',{url:'http://localhost/',runScripts:'outside-only'});
 const w=dom.window;w.DOMPurify=createDOMPurify(w);w.setInterval=()=>1;w.clearInterval=()=>{};w.setTimeout=()=>1;w.alert=()=>{};w.confirm=()=>true;
 return {dom,w,context:dom.getInternalVMContext()};
}
test('hostile HTML, attribute and JS-string payloads remain inert; rich text retains only allowed formatting',()=>{
 const {dom,w,context}=domContext();
 vm.runInContext(fs.readFileSync(new URL('../ui/safe-render.js',import.meta.url),'utf8'),context);
 w.payload=`');window.pwned=1;//" autofocus onfocus="window.pwned=2"><img src=x onerror=alert(1)>`;
 w.captured=null;w.selectMember=value=>w.captured=value;
 const html=vm.runInContext('renderHTML(safeHTML`<button onclick="selectMember(\'${payload}\')">${payload}</button>`)',context);
 w.document.body.innerHTML=html;
 assert.equal(w.document.querySelectorAll('img').length,0);
 const handler=w.document.querySelector('button').getAttribute('onclick');vm.runInContext(handler,context);
 assert.equal(w.captured,w.payload);assert.equal(w.pwned,undefined);
 const rich=vm.runInContext('String(richHTML(`<b>bold</b><img src=x onerror="alert(1)"><svg onload="alert(1)"></svg><span style="position:fixed;color:red;background-image:url(https://bad.example)">red</span>`))',context);
 assert(rich.includes('<b>bold</b>'));assert(!/onerror|onload|<img|<svg|position|url\(/.test(rich));
 assert.equal(vm.runInContext('imageURL("javascript:alert(1)")',context),'');
 dom.window.close();
});
test('complete generated app renders hostile project names and retains navigation handlers',async()=>{
 const {dom,w,context}=domContext(true);
 Object.assign(w,{initializeApp:()=>({}),getAuth:()=>({}),getFirestore:()=>({}),onAuthStateChanged:()=>{},onSnapshot:()=>()=>{},getIdTokenResult:async()=>({claims:{}}),doc:()=>({}),collection:()=>({}),query:()=>({}),where:()=>({}),getDocs:async()=>({docs:[],forEach(){}}),serverTimestamp:()=>0});
 vm.runInContext(app.replace(/import\s*\{[\s\S]*?\}\s*from\s*["'][^"']+["'];?/g,''),context);
 w.testData={GRP:{groupA:{title:'Group <img onerror=alert(1)>',projects:['p']},groupB:{title:'B',projects:[]}},PROJ:{p:{name:'<img src=x onerror=alert(1)>',desc:'" autofocus onfocus="alert(2)',status:'active',statusLabel:'진행',group:'groupA',tl:[],persons:[]}},BOARD:{p:[{id:1,ca:'2026-09-09',text:'<svg onload=alert(1)>',imgs:['javascript:alert(1)']}]},dcRows:[],dccRows:[]};
 vm.runInContext('assignWorkspace(testData);rebuildDynamicNav();renderDashboard();',context);
 assert(w.document.getElementById('dash-groups').textContent.includes('<img src=x onerror=alert(1)>'));
 assert.equal(w.document.querySelectorAll('#dash-groups [onerror],#dash-groups [onfocus]').length,0);
 assert(w.document.querySelector('#dash-groups .proj-card').getAttribute('onclick').includes('goToDetail'));
 vm.runInContext('goToDetail("p");',context);
 assert(w.document.getElementById('board-list').textContent.includes('<svg onload=alert(1)>'));
 assert.equal(w.document.querySelectorAll('#board-list svg').length,0);
 dom.window.close();
});
