"""Rebuild the portable HTML from its original bundle and reviewable UI overrides."""
from pathlib import Path
import re, json, subprocess

ROOT = Path(__file__).resolve().parents[1]
baseline = ROOT / 'backups/index.original.html'
if baseline.exists():
    original = baseline.read_text(encoding='utf-8')
else:
    original = subprocess.check_output(['git','show','0535e092a0ce334dc1355580b61e25f73e1241ac:index.html'],cwd=ROOT).decode('utf-8-sig')
(ROOT / 'inspection').mkdir(exist_ok=True)
def payload(name):
    return json.loads(re.search(r'<script type="__bundler/' + name + r'">(.*?)</script>', original, re.S)[1])
template, manifest = payload('template'), payload('manifest')
# An empty image URL emits a resource error even when its preview is hidden.
template = re.sub(r'(<img\b[^>]*?)\s+src=""', r'\1', template)
def replace(old, new):
    global template
    assert old in template, f'Missing patch target: {old[:80]}'
    template = template.replace(old, new)

# Keep only Noto Sans KR faces, deduplicate identical faces, remove unused assets.
seen = set()
def font_face(match):
    face = match[0]
    if "'Noto Sans KR'" not in face or face in seen: return ''
    seen.add(face)
    return face
template = re.sub(r'@font-face\s*\{[^}]*\}', font_face, template)
template = re.sub(r"font-family:\s*'Pretendard Variable'[^;]*;", "font-family: 'Noto Sans KR', sans-serif;", template)
template = template.replace("font-family: 'SF Mono', Menlo, Consolas, monospace", "font-family: 'Noto Sans KR', sans-serif")
manifest = {key: value for key, value in manifest.items() if key in template}

replace('<body>', '<body>\n<a class="skip-link" href="#main-content">본문 바로가기</a>')
replace('<title>KOAS R&amp;D</title>', '<title>KOAS R&D · 연구소 업무 관리</title>')
replace('<div class="login-card">', '<div class="login-card">')
replace('<div class="login-logo">', '<div class="login-logo">')
replace('  <div class="login-card">', '  <div class="login-card">')
logo_end = template.index('  <div class="login-card">')
before = template[:logo_end]
position = before.rfind('</div>')
template = before[:position] + '<h1>연구소 업무 관리</h1><p>프로젝트와 설계 일정을 한곳에서 확인하세요.</p>\n' + before[position:] + template[logo_end:]
replace('<div id="form-signup"', '<div id="form-signup"')
template = re.sub(r'<div class="foot-links">.*?</div>', '', template, flags=re.S)
replace('<!-- RENAME MODAL -->', '<!-- RENAME MODAL -->')
replace('<aside class="sidebar">', '<aside class="sidebar" id="workspace-nav" aria-label="주 메뉴"><button type="button" class="ux-menu-close" aria-label="메뉴 닫기">×</button>')
replace('<div class="app-body">', '<button class="ux-menu-backdrop" aria-label="메뉴 닫기" tabindex="-1"></button><div class="app-body">')
replace('<header class="app-hdr">', '<header class="app-hdr"><button type="button" class="ux-menu-toggle" aria-controls="workspace-nav" aria-expanded="false" aria-label="메뉴 열기">☰</button>')
replace('<div class="main">', '<div class="connection-banner" role="status">인터넷 연결이 끊겼습니다. 연결이 복구될 때까지 저장이 완료되지 않을 수 있습니다.</div><main class="main" id="main-content" tabindex="-1">')
# Main is the last .main container before the app module. Use its matching end via nesting.
start = template.index('<main class="main"')
tags = list(re.finditer(r'</?div\b[^>]*>|<main\b[^>]*>', template[start:]))
depth = 1
for match in tags[1:]:
    if match[0].startswith('</div'): depth -= 1
    else: depth += 1
    if depth == 0:
        pos = start + match.start()
        template = template[:pos] + '</main>' + template[pos + len(match[0]):]
        break
else: raise AssertionError('Main closing tag not found')
# Remove the notification button that has no behavior.
template, count = re.subn(r'<button class="icon-btn"><svg.*?<span class="badge"></span></button>', '', template, count=1, flags=re.S)
assert count == 1
replace('id="theme-toggle"', 'aria-label="밝은 화면 / 어두운 화면 전환" id="theme-toggle"')
replace('<div id="view-dashboard" class="view active">', '<div id="view-dashboard" class="view active"><div class="workspace-heading"><div><span class="workspace-eyebrow">KOAS R&D</span><h1>업무 대시보드</h1><p>프로젝트 진행 현황과 다가오는 일정을 확인하세요.</p></div><span id="save-status" class="save-status" role="status" aria-live="polite">저장 상태 확인 전</span></div>')
replace('<div class="stat-card" onclick="goTo(\'design\')"', '<div class="stat-card" onclick="goTo(\'dcchange\')"')
replace('<span class="stat-badge">실시간</span>', '<span class="stat-badge">등록 현황</span>')
replace('<div class="stat-label">진행 중인 설계 변경</div>', '<div class="stat-label">설계변경 등록 항목</div>')
replace('<div class="stat-val">14건</div>', '<div class="stat-val" id="ux-design-count">—</div>')
replace('클릭하여 설계변경 보기 →', '설계변경 관리대장 보기 →')
replace('<div class="stat-card" style="display:flex;flex-direction:column;align-items:center;justify-content:center;">', '<div class="stat-card" onclick="goTo(\'completed\')"><div class="stat-top"><span class="stat-badge">프로젝트</span></div><div class="stat-label">완료된 프로젝트</div><div class="stat-val" id="ux-completed-count">—</div><div class="stat-sub">완료 프로젝트 보기 →</div></div><div class="stat-card">')
replace('<div class="dc-wrap"><table', '<p class="table-hint">표를 좌우로 스크롤해 전체 항목을 확인하세요. 수정 후 저장 버튼을 눌러 반영합니다.</p><div class="dc-wrap"><table')

# Fix clear data and timer defects while preserving the existing database schema.
replace('function startClock(){', 'let dashboardClockTimer = null;\nfunction startClock(){\n  if(dashboardClockTimer) clearInterval(dashboardClockTimer);')
replace('  setInterval(tick,1000);', '  dashboardClockTimer = setInterval(tick,1000);')
replace('function renderDashboard(){', "function renderDashboard(){\n  document.getElementById('ux-design-count').textContent = dccRows.length + '건';\n  document.getElementById('ux-completed-count').textContent = Object.values(PROJ).filter(p=>p.group==='completed'||p.status==='completed').length + '건';")
replace('async function saveAppData(){\n  try {', "let unsavedChanges = false;\nlet appDataLoaded = false;\nlet saveSequence = 0;\nfunction updateSaveStatus(text, state='') { const el=document.getElementById('save-status'); if(el){el.textContent=text;el.dataset.state=state;} }\nwindow.addEventListener('beforeunload', e=>{if(unsavedChanges || em || dcEm || dccEm){e.preventDefault();e.returnValue='';}});\nasync function saveAppData(){\n  if(!appDataLoaded){updateSaveStatus('불러오기 실패 · 새로고침 필요','error');showToast('데이터를 먼저 불러와야 저장할 수 있습니다. 새로고침해 주세요.',6000);return false;}\n  unsavedChanges = true;\n  const sequence = ++saveSequence;\n  updateSaveStatus('저장 중…', 'saving');\n  try {")
replace("  } catch(e){ console.error('저장 실패:', e); }", "    if(sequence===saveSequence){unsavedChanges=false;updateSaveStatus('저장 완료 · '+new Date().toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'}));}\n    return true;\n  } catch(e){ console.error('저장 실패:', e);updateSaveStatus('저장 실패 · 다시 시도', 'error');showToast('저장하지 못했습니다. 연결과 권한을 확인하고 다시 저장해 주세요.',6000);return false; }")
replace("dcRows = (d.dcRows && d.dcRows.length > 0) ? d.dcRows : DEFAULT_DC;", "dcRows = Array.isArray(d.dcRows) ? d.dcRows : DEFAULT_DC;")
replace("dccRows= (d.dccRows && d.dccRows.length > 0) ? d.dccRows : DEFAULT_DCC;", "dccRows= Array.isArray(d.dccRows) ? d.dccRows : DEFAULT_DCC;")
replace("if(!dccRows||dccRows.length===0){dccRows=DEFAULT_DCC;saveAppData();}", "/* Preserve intentionally empty design-change lists. */")
replace('      return; // 성공하면 바로 리턴', "      updateSaveStatus('데이터 불러옴');\n      return; // 성공하면 바로 리턴")
replace('async function loadAppData(){', 'async function loadAppData(){\n  appDataLoaded = false;')
replace("      const snap = await getDoc(doc(db,'appData','main'));", "      const snap = await getDoc(doc(db,'appData','main'));\n      appDataLoaded = true;")
replace("    currentUser = null;\n    isAdmin = false;", "    currentUser = null;\n    isAdmin = false;\n    appDataLoaded = false;")
replace("  console.error('데이터 로드 최종 실패 - 기존 데이터 유지');", "  console.error('데이터 로드 최종 실패 - 기존 데이터 유지');\n  updateSaveStatus('불러오기 실패 · 새로고침 필요','error');\n  showToast('데이터를 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요.',8000);")
replace('function dcSave(){dcEm=false;', 'async function dcSave(){if(!await saveAppData())return;dcEm=false;')
replace('window.saveAppData&&window.saveAppData();renderDc();}', 'renderDc();}')
replace('function dccSave(){dccEm=false;', 'async function dccSave(){if(!await saveAppData())return;dccEm=false;')
replace('saveAppData();renderDcc();}', 'renderDcc();}')
# No misleading empty area for a group without projects.
replace('${cards}${moreBtn}', '${cards || \'<div class="empty-projects">등록된 프로젝트가 없습니다. 그룹에서 새 프로젝트를 추가하세요.</div>\'}${moreBtn}')

css = (ROOT / 'ui/improvements.css').read_text(encoding='utf-8')
from security_patch import apply_security
template, manifest = apply_security(template, manifest, ROOT)
js = (ROOT / 'ui/improvements.js').read_text(encoding='utf-8')
# Save feedback remains visible when editing tables and project details.
status = '<span id="save-status" class="save-status" role="status" aria-live="polite">저장 상태 확인 전</span>'
replace(status, '')
replace('<div class="hdr-right">', '<div class="hdr-right">'+status)
template = template.replace('</head>', '<style id="koas-ux-overrides">\n'+css+'\n</style></head>')
template = template.replace('</body>', '<script id="koas-ux-behavior">\n'+js+'\n</script></body>')
for name, value in [('template',template),('manifest',manifest)]:
    serialized = json.dumps(value, ensure_ascii=False, separators=(',',':')).replace('</script','<\\/script')
    original = re.sub(r'(<script type="__bundler/'+name+r'">).*?(</script>)',lambda m: m[1]+serialized+m[2],original,flags=re.S)
(ROOT / 'index.html').write_text(original,encoding='utf-8')
print(f'Built index.html: {(ROOT / "index.html").stat().st_size:,} bytes; {len(manifest)} embedded assets; {len(seen)} unique Noto font faces.')
