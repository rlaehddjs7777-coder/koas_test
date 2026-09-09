// Non-data UI behavior. Firebase operations stay in the original module.
(() => {
  const q = s => document.querySelector(s);
  const sidebar = q('.sidebar'), toggle = q('.ux-menu-toggle'), backdrop = q('.ux-menu-backdrop');
  function menu(open) {
    sidebar.classList.toggle('ux-open', open);
    backdrop.classList.toggle('ux-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    if (open) q('.ux-menu-close').focus(); else toggle.focus();
  }
  toggle.addEventListener('click', () => menu(!sidebar.classList.contains('ux-open')));
  q('.ux-menu-close').addEventListener('click', () => menu(false));
  backdrop.addEventListener('click', () => menu(false));
  sidebar.addEventListener('click', e => { if(e.target.closest('.nav-item,.util-item') && !e.target.closest('.nav-gear') && sidebar.classList.contains('ux-open')) menu(false); });
  document.addEventListener('keydown', e => {
    if(e.key === 'Escape' && sidebar.classList.contains('ux-open')) menu(false);
    if(e.key === 'Tab' && sidebar.classList.contains('ux-open')) {
      const items = [...sidebar.querySelectorAll('button,[tabindex="0"]')].filter(el => el.getClientRects().length);
      const first=items[0], last=items.at(-1);
      if(e.shiftKey && document.activeElement===first){e.preventDefault();last?.focus();}
      else if(!e.shiftKey && document.activeElement===last){e.preventDefault();first?.focus();}
    }
    if((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' && q('#pg-app.active')){e.preventDefault();q('#search-inp').focus();}
  });
  document.querySelectorAll('.fg').forEach(group => {const input=group.querySelector('input'),label=group.querySelector('label');if(input&&label)label.htmlFor=input.id;});
  const fields={'li-email':['email','username'],'li-pw':['password','current-password'],'su-name':['text','name'],'su-email':['email','email'],'su-pw':['password','new-password'],'su-pw2':['password','new-password']};
  for(const [id,[type,autocomplete]] of Object.entries(fields)) {
    const input=document.getElementById(id);if(!input)continue;input.type=type;input.autocomplete=autocomplete;input.required=true;
    if(type==='email'){input.inputMode='email';input.spellcheck=false;input.autocapitalize='none';}
    if(type==='password'){
      const button=document.createElement('button');button.type='button';button.className='password-toggle';button.textContent='보기';button.setAttribute('aria-label','비밀번호 표시');button.setAttribute('aria-pressed','false');
      button.addEventListener('click',()=>{const show=input.type==='password';input.type=show?'text':'password';button.textContent=show?'숨김':'보기';button.setAttribute('aria-label',show?'비밀번호 숨기기':'비밀번호 표시');button.setAttribute('aria-pressed',String(show));});input.parentElement.append(button);
    }
  }
  q('#search-inp').setAttribute('aria-label','프로젝트, 게시글 또는 팀원 검색');q('#search-inp').title='검색 (Ctrl 또는 ⌘ + K)';
  q('#auth-error').setAttribute('role','alert');
  function offline(){q('.connection-banner').classList.toggle('visible',!navigator.onLine);}
  window.addEventListener('online',offline);window.addEventListener('offline',offline);offline();
  // Enhance dynamic cards/navigation without replacing existing event handlers.
  function enhance(root) {
    root.querySelectorAll('.nav-item,.util-item,.lnk-more,.proj-card[onclick],.stat-card[onclick],.sb-logo').forEach(el=>{
      if(el.dataset.uxKeyboard)return;el.dataset.uxKeyboard='1';el.tabIndex=0;el.setAttribute('role','button');
      el.addEventListener('keydown',e=>{if(e.target===el&&(e.key==='Enter'||e.key===' ')){e.preventDefault();el.click();}});
    });
    root.querySelectorAll('.nav-gear').forEach(el=>el.setAttribute('aria-label','그룹 이름 및 설정 변경'));
    root.querySelectorAll('.nav-item').forEach(el=>{if(el.classList.contains('active'))el.setAttribute('aria-current','page');else el.removeAttribute('aria-current');});
    root.querySelectorAll('.dc-wrap').forEach(el=>{el.tabIndex=0;el.setAttribute('role','region');el.setAttribute('aria-label','설계 관리대장, 가로 및 세로 스크롤 가능');});
  }
  enhance(document);
  let queued=false;new MutationObserver(()=>{if(!queued){queued=true;requestAnimationFrame(()=>{queued=false;enhance(document);});}}).observe(q('.main'),{childList:true,subtree:true});
  new MutationObserver(()=>enhance(document)).observe(q('.sb-nav'),{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
})();
