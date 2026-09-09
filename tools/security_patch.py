from pathlib import Path
import re, subprocess, base64, gzip

def apply_security(template, manifest, root):
    match=re.search(r'<script type="module">(.*?)</script>',template,re.S)
    app=match[1]
    app=app.replace('onAuthStateChanged, updateProfile, deleteUser','onAuthStateChanged, getIdTokenResult, updateProfile, deleteUser')
    app=app.replace('collection, updateDoc, deleteDoc, onSnapshot, serverTimestamp, query, where','collection, updateDoc, deleteDoc, onSnapshot, serverTimestamp, query, where, runTransaction')
    app=app.replace("const ADMIN_EMAILS = ['admin@koas.com'];",'// Administrator role is issued by Firebase Admin SDK custom claims.')
    start=app.index('onAuthStateChanged(auth,')
    end=app.index('function updateHeader(user)',start)
    app=app[:start]+(root/'ui/auth-session.js').read_text(encoding='utf-8')+'\n'+app[end:]
    start=app.index('let unsavedChanges = false;')
    end=app.index('// 저장 + 렌더를 같이 하는 헬퍼',start)
    app=app[:start]+(root/'ui/sync-core.js').read_text(encoding='utf-8')+'\n'+(root/'ui/collaboration.js').read_text(encoding='utf-8')+'\n'+app[end:]
    # Use safe rich text only at the explicit memo boundaries; all other data is text.
    app=app.replace("row.메모Html||row.메모||''", "richHTML(row.메모Html || escapeHTML(row.메모 || ''))")
    app=app.replace("row.비고Html||row.비고||''", "richHTML(row.비고Html || escapeHTML(row.비고 || ''))")
    app=app.replace("row.메모Html=richDiv.innerHTML", "row.메모Html=String(richHTML(richDiv.innerHTML))")
    app=app.replace("row.비고Html=richDiv.innerHTML", "row.비고Html=String(richHTML(richDiv.innerHTML))")
    app=app.replace("preview.src='';", "preview.removeAttribute('src');")
    # Do not re-render or discard project/post editors until the write succeeds.
    app=app.replace('function saveEdit(){','async function saveEdit(){')
    app=app.replace('  em=false;\n  saveAppData();', '  if(!await saveAppData())return;\n  em=false;')
    app=app.replace('function submitPost(){','async function submitPost(){')
    app=app.replace("  BOARD[curKey].unshift({id:++boardId,ca:ts(),ua:null,text:t,imgs:safeImgs});", "  const form=$('new-pf');\n  const retryId=Number(form.dataset.pendingPost);\n  const retryPost=BOARD[curKey].find(post=>post.id===retryId);\n  if(retryPost){retryPost.text=t;retryPost.imgs=safeImgs;}else{const id=++boardId;form.dataset.pendingPost=String(id);BOARD[curKey].unshift({id,ca:ts(),ua:null,text:t,imgs:safeImgs});}")
    app=app.replace('  newImgs=[];cancelAdd();saveAppData();renderBoard();','  if(!await saveAppData())return;\n  newImgs=[];cancelAdd();renderBoard();')
    app=app.replace('function savePost(i){','async function savePost(i){')
    app=app.replace('  delete editImgs[i];saveAppData();renderBoard();','  if(!await saveAppData())return;\n  delete editImgs[i];renderBoard();')
    # Ordinary approved members may query approved profiles, but not pending accounts.
    start=app.index('async function loadDashMembers(')
    end=app.index('\n}',start)+2
    chunk=app[start:end].replace("getDocs(collection(db, 'users'))", "getDocs(query(collection(db, 'users'),where('status','==','approved')))")
    app=app[:start]+chunk+app[end:]
    # Guard navigation while a local draft is active; explicit cancel remains available.
    app=app.replace('function goTo(v){', "function goTo(v){\n  if(v!=='login' && hasWorkspaceEdits() && document.getElementById('pg-app')?.classList.contains('active')){showToast('편집을 저장하거나 취소한 뒤 화면을 이동해 주세요.',4000);return;}")
    app=app.replace('function goToDetail(k){', "function goToDetail(k){\n  if(hasWorkspaceEdits()){showToast('현재 편집을 저장하거나 취소해 주세요.',4000);return;}")
    # Render transformations are AST-based so nested templates stay correctly escaped.
    source=root/'inspection/security-input.mjs';output=root/'inspection/security-output.mjs'
    source.write_text(app,encoding='utf-8')
    subprocess.run(['node',str(root/'tools/secure-render.mjs'),str(source),str(output)],check=True)
    app=(root/'ui/safe-render.js').read_text(encoding='utf-8')+'\n'+output.read_text(encoding='utf-8')
    template=template[:match.start(1)]+app+template[match.end(1):]
    notice='<div id="sync-notice" class="sync-notice" hidden role="status"><span class="sync-message"></span><div><button type="button" onclick="saveAppData()">저장 다시 시도</button><button type="button" onclick="downloadWorkspaceDraft()">내 편집본 다운로드</button><button type="button" onclick="reloadWorkspace()">최신 내용 불러오기</button></div></div>'
    template=template.replace('<main class="main" id="main-content" tabindex="-1">','<main class="main" id="main-content" tabindex="-1">'+notice)
    vendor_key='koas-dompurify-vendor'
    vendor=(root/'node_modules/dompurify/dist/purify.min.js').read_bytes()
    manifest[vendor_key]={'mime':'application/javascript','compressed':True,'data':base64.b64encode(gzip.compress(vendor)).decode('ascii')}
    template=template.replace('</head>',f'<script src="{vendor_key}"></script></head>')
    return template,manifest
