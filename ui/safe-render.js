// Only compiler-tagged templates are trusted; database strings never gain this type.
class TrustedMarkup extends String {}
function staticHTML(value){return new TrustedMarkup(value);}
function escapeHTML(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function imageURL(value){
  const text=String(value??'').trim();
  if(/^data:image\/(?:png|jpeg|gif|webp);base64,[a-z0-9+/=]+$/i.test(text))return text;
  try{const url=new URL(text,location.href);if(url.protocol==='https:'||url.protocol==='blob:'||(url.protocol==='http:'&&url.origin===location.origin))return url.href;}catch{}
  return '';
}
function richHTML(value){
  return new TrustedMarkup(DOMPurify.sanitize(String(value??''),{
    ALLOWED_TAGS:['b','strong','i','em','u','s','strike','br','p','div','span','font'],
    ALLOWED_ATTR:['style','color'],ALLOW_DATA_ATTR:false,ALLOW_ARIA_ATTR:false
  }));
}
DOMPurify.addHook('uponSanitizeAttribute',(_node,data)=>{
  if(data.attrName==='style'){
    const declaration=document.createElement('span').style;declaration.cssText=data.attrValue;
    const result=[];
    for(const name of ['color','background-color','font-weight','font-style','text-decoration','text-align']){
      const value=declaration.getPropertyValue(name);
      if(value&&!/url\s*\(|var\s*\(|expression|[<>]/i.test(value))result.push(`${name}:${value}`);
    }
    data.attrValue=result.join(';');
  }
});
function safeHTML(strings,...values){
  let result=strings[0];
  values.forEach((value,index)=>{
    // Static context, never reconstructed from previously interpolated user data.
    const prefix=strings.slice(0,index+1).join('PLACEHOLDER');
    const event=prefix.match(/\bon\w+="([^"<>]*)$/);
    const attr=prefix.match(/\b(src|href)=["']([^"'<>]*)$/i);
    if(event){
      const insideSingle=(event[1].match(/(?<!\\)'/g)||[]).length%2===1;
      if(insideSingle){value=String(value??'').replace(/[\s\S]/g,c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0'));}
      else if(typeof value!=='number'||!Number.isFinite(value))throw new Error('Unsafe dynamic event argument');
      result+=escapeHTML(value);
    }else if(attr){result+=escapeHTML(imageURL(value));}
    else if(value instanceof TrustedMarkup){result+=String(value);}
    else {result+=escapeHTML(value);}
    result+=strings[index+1];
  });
  return new TrustedMarkup(result);
}
function htmlJoin(items,separator=','){
  if(!Array.isArray(items))return items.join(separator);
  if(items.some(item=>item instanceof TrustedMarkup))return new TrustedMarkup(items.map(item=>item instanceof TrustedMarkup?String(item):escapeHTML(item)).join(escapeHTML(separator)));
  return items.join(separator);
}
function renderHTML(value){return value instanceof TrustedMarkup?String(value):String(richHTML(value));}
