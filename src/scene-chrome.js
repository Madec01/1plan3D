/** Floating scene controls. Hiding a drawer never rebuilds its forms or changes selection. */
const MENUS = '.header-menu,.display-menu,.view-menu,.scene-add-menu,#scene-settings-host > .scene-settings-menu';
export function setupSceneChrome({document:doc=globalThis.document,getContext=()=>({}),onResize=()=>{},onCloseContext=()=>{}}={}) {
 const body=doc.body, sidebar=doc.getElementById('sidebar'), scene=doc.getElementById('scene-area'), inspector=doc.getElementById('inspector');
 const marker=doc.createComment('Original pieces panel');sidebar.before(marker);
 let compact=false, context={}, open={pieces:false,properties:false}, pinned={pieces:false,properties:false};
 try{const saved=JSON.parse(doc.defaultView.localStorage.getItem('atelier.drawers.v1')||'{}');for(const key of Object.keys(pinned))pinned[key]=saved[key]===true;}catch{}
 const panel=name=>name==='pieces'?sidebar:inspector;
 const menus=()=>[...doc.querySelectorAll(MENUS)];
 function closeMenus(except=null,focus=false){let closed=false;for(const menu of menus())if(menu!==except&&menu.open){menu.open=false;closed=true;if(focus)menu.querySelector('summary')?.focus();}return closed;}
 function controls(name){const node=panel(name);let head=node.querySelector(':scope > .drawer-controls');if(!head){head=doc.createElement('div');head.className='drawer-controls';head.innerHTML=`<strong>${name==='pieces'?'Pièces & projet':'Propriétés'}</strong><button type="button" data-drawer-pin="${name}" title="Garder ce panneau ouvert">Épingler</button><button type="button" data-drawer-close="${name}" aria-label="Replier ${name==='pieces'?'les pièces':'les propriétés'}">×</button>`;node.prepend(head);}head.querySelector('[data-drawer-pin]').setAttribute('aria-pressed',String(pinned[name]));head.querySelector('[data-drawer-pin]').textContent=pinned[name]?'Épinglé':'Épingler';}
 function paint(){
  for(const name of Object.keys(open)){
   const node=panel(name),available=name==='pieces'||context.selectedCount>0,visible=available&&(open[name]||pinned[name]);
   if(compact)controls(name);
   node.classList.toggle('drawer-visible',compact&&visible);node.classList.toggle('drawer-pinned',pinned[name]);
   // Mobile owns inertness and sheets; desktop drawers retain their exact DOM.
   if(!body.classList.contains('mobile-ui'))node.inert=compact&&!visible;
   for(const button of doc.querySelectorAll(`[data-drawer-toggle="${name}"]`)){button.setAttribute('aria-expanded',String(compact&&visible));button.disabled=!available;}
  }
 }
 function show(name){if(!compact)return false;closeMenus();onCloseContext();for(const other of Object.keys(open))if(other!==name&&!pinned[other])open[other]=false;open[name]=true;paint();return true;}
 function hide(name){open[name]=false;pinned[name]=false;savePins();paint();}
 function savePins(){try{doc.defaultView.localStorage.setItem('atelier.drawers.v1',JSON.stringify(pinned));}catch{}}
 function refresh(){
  context=getContext();const next=context.page==='design'&&context.mode==='scene';
  if(next!==compact){compact=next;closeMenus();if(compact)scene.append(sidebar);else marker.after(sidebar);queueMicrotask(onResize);}
  body.classList.toggle('compact-scene',compact);
  if(compact){
   const toolbar=doc.getElementById('editor-toolbar');toolbar?.classList.toggle('hidden',!context.selectedCount);
   for(const el of toolbar?.querySelectorAll('[data-tool], [data-editor], #context-actions-open, [data-context-action]')||[])el.hidden=!context.editable;
   const resize=toolbar?.querySelector('[data-tool="resize"]');if(resize)resize.hidden=!context.canResize;
   for(const [action,available] of Object.entries({align:context.selectedCount>1,group:context.selectedCount>1,ungroup:context.canUngroup,link:context.canLink})){
    const button=toolbar?.querySelector(`[data-context-action="${action}"]`);if(button)button.hidden=!context.editable||!available;
   }
   const count=doc.getElementById('selection-count');if(count)count.textContent=`${context.selectedCount||0} sélection`+(context.selectedCount>1?'s':'');
   for(const button of doc.querySelectorAll('.scene-add-menu [data-plan-add]'))button.disabled=!context.editable;
   const notice=doc.querySelector('.scene-add-menu .parametric-notice');if(notice)notice.hidden=context.editable;
  }
  if(!compact)for(const button of doc.querySelectorAll('#editor-toolbar [data-tool],#editor-toolbar [data-editor],#context-actions-open'))button.hidden=false;
  const view=doc.getElementById('view-menu-label');if(view)view.textContent={iso:'Vue 3D',top:'Dessus',front:'Face',side:'Côté',workplane:'Plan de travail'}[context.view]||'Vue 3D';
  paint();
 }
 function outside(event){
  const target=event.target;if(!target?.closest)return;
  for(const menu of menus())if(menu.open&&!menu.contains(target))menu.open=false;
  if(!compact||body.classList.contains('mobile-ui')||target.closest('dialog,#scene-context-menu,.scene-settings-body,.scene-capsule,.editor-toolbar,.view-toolbar'))return;
  for(const name of Object.keys(open))if(!pinned[name]&&!panel(name).contains(target))open[name]=false;
  paint();
 }
 function click(event){
  const target=event.target?.closest?.('button,summary');if(!target)return;
  const menu=target.closest(MENUS);
  if(target.tagName==='SUMMARY'&&menu&&target.parentElement===menu){if(!menu.open){closeMenus(menu);onCloseContext();}return;}
  if(menu&&target.tagName==='BUTTON'&&!target.disabled&&!target.matches('[data-layer],[data-layer-preset],[data-step]')){
   // A setting form stays open for repeated adjustments. Commands close immediately.
   if(!target.closest('.scene-settings-body')||target.matches('[data-editor],[data-assist-action],[data-preset],[data-attachment-action]'))menu.open=false;
  }
  if(!compact||body.classList.contains('mobile-ui'))return;
  const toggle=target.dataset.drawerToggle,close=target.dataset.drawerClose,pin=target.dataset.drawerPin;
  if(toggle||close||pin){event.preventDefault();event.stopImmediatePropagation();if(toggle){if(open[toggle]||pinned[toggle])hide(toggle);else show(toggle);}if(close)hide(close);if(pin){pinned[pin]=!pinned[pin];open[pin]=true;savePins();paint();}return;}
  if(target.closest('#inspector .inspector-head')&&target.matches('[data-editor="none"],[data-action="close-inspector"]')){event.preventDefault();event.stopImmediatePropagation();hide('properties');doc.querySelector('[data-drawer-toggle="properties"]')?.focus();}
 }
 function keydown(event){
  if(event.key!=='Escape'||doc.querySelector('dialog[open],#scene-context-menu'))return;
  if(closeMenus(null,true)){event.preventDefault();event.stopImmediatePropagation();return;}
  if(!compact||body.classList.contains('mobile-ui'))return;
  const name=Object.keys(open).find(name=>open[name]&&!pinned[name]);if(name){open[name]=false;paint();doc.querySelector(`[data-drawer-toggle="${name}"]`)?.focus();event.preventDefault();event.stopImmediatePropagation();}
 }
 function toggled(event){if(event.target.matches?.(MENUS)&&event.target.open){closeMenus(event.target);onCloseContext();}}
 doc.addEventListener('pointerdown',outside,true);doc.addEventListener('click',click,true);doc.addEventListener('keydown',keydown,true);doc.addEventListener('toggle',toggled,true);
 return {refresh,show,closeMenus,getState:()=>({compact,open:{...open},pinned:{...pinned}}),destroy(){doc.removeEventListener('pointerdown',outside,true);doc.removeEventListener('click',click,true);doc.removeEventListener('keydown',keydown,true);doc.removeEventListener('toggle',toggled,true);marker.after(sidebar);marker.remove();body.classList.remove('compact-scene');sidebar.inert=inspector.inert=false;}};
}

export const sceneChromeStyles=`
/* V0.28: fixed capsules, non-destructive drawers, and one transient menu. */
.scene-capsule{display:none}.drawer-controls{display:none}.view-menu>summary{list-style:none;cursor:pointer}.view-menu>summary::-webkit-details-marker{display:none}.view-menu{position:relative}.view-menu-panel{position:absolute;top:calc(100% + 9px);left:0;right:auto;min-width:245px;padding:12px;background:#fffefa;border:1px solid #ccd7c4;border-radius:12px;box-shadow:0 12px 32px #243e2926;z-index:32}.view-menu-panel .segmented{display:flex}.view-menu-panel .navigation-mode{display:flex!important}.view-menu-panel .menu-label{display:block;margin:12px 0 7px}.view-menu-panel .view-utilities{display:flex;align-items:center;gap:6px;margin-top:10px}.view-menu-panel .view-orientation{display:block;margin-top:10px;font-size:11px}.view-menu>summary{display:flex;align-items:center;gap:8px;padding:9px 12px;background:#fffefa;border:1px solid #ccd7c4;border-radius:9px;font-size:12px;min-height:38px}
body.compact-scene:not(.mobile-ui) .app-shell{grid-template-columns:76px minmax(0,1fr)}
body.compact-scene .scene-area{isolation:isolate}
body.compact-scene .scene-capsule{display:flex;align-items:center;gap:3px;position:absolute;z-index:25;border:1px solid #cdd8c5;border-radius:13px;padding:4px;background:#fffefa;box-shadow:0 3px 12px #243e2914}
body.compact-scene .scene-create{top:14px;left:14px}
.scene-capsule button,.scene-capsule summary{min-height:36px;padding:8px 11px;border:0;background:transparent;color:#34553b;border-radius:8px;font:inherit;font-size:12px;cursor:pointer;white-space:nowrap}
.scene-capsule button:hover,.scene-capsule summary:hover{background:#e9f0e3}.scene-capsule button[aria-expanded=true]{background:#e5eedc}.scene-capsule summary{list-style:none}.scene-capsule summary::-webkit-details-marker{display:none}.scene-add-menu{position:relative}.scene-add-panel{position:absolute;top:calc(100% + 12px);left:-4px;width:272px;padding:12px;background:#fffefa;border:1px solid #cdd8c5;border-radius:12px;box-shadow:0 10px 30px #243e2926;max-height:calc(100dvh - 260px);overflow:auto}.scene-add-panel .add-grid{display:grid;grid-template-columns:1fr 1fr;margin:0;gap:6px}.scene-add-panel .add-grid button{min-height:44px;border:1px solid #e0e5d8;white-space:normal;text-align:left}.scene-add-panel .add-grid button:disabled{opacity:.45}
body.compact-scene .view-menu-panel{left:auto;right:0}
body.compact-scene .view-toolbar{top:14px;right:14px;left:auto;z-index:26;gap:6px;flex-wrap:nowrap}body.compact-scene .view-toolbar>details>summary{min-height:44px;border-radius:12px;box-shadow:0 3px 12px #243e2914}
body.compact-scene #scene-settings-host{top:auto;bottom:14px;left:14px;z-index:27}body.compact-scene #scene-settings-host .scene-settings-menu>summary{border-radius:12px;min-height:42px;gap:8px;box-shadow:0 3px 12px #243e2914}body.compact-scene #scene-settings-host .scene-settings-body{top:auto;bottom:calc(100% + 10px);max-height:calc(100dvh - 310px)}.precision-status{display:inline-flex;gap:8px;align-items:center}.precision-status span+span{border-left:1px solid #dbe3d4;padding-left:8px}.snap-off{color:#97612b}
body.compact-scene:not(.mobile-ui) #sidebar{display:none;position:absolute;left:14px;top:70px;bottom:72px;width:300px;max-width:calc(100% - 28px);height:auto;margin:0;padding:0 16px 18px;border:1px solid #ccd7c4;border-radius:13px;background:#fffefa;box-shadow:0 10px 30px #243e2926;z-index:23;overflow:auto;overscroll-behavior:contain}
body.compact-scene:not(.mobile-ui) #inspector{display:none;left:auto;right:14px;top:70px;bottom:124px;width:310px;max-width:calc(100% - 28px);height:auto;max-height:none;padding:0 16px 18px;border-radius:13px;background:#fffefa;z-index:23;box-shadow:0 10px 30px #243e2926}
body.compact-scene:not(.mobile-ui) #sidebar.drawer-visible,body.compact-scene:not(.mobile-ui) #inspector.drawer-visible:not(.hidden){display:block!important}
body.compact-scene:not(.mobile-ui) .drawer-controls{display:flex;align-items:center;gap:5px;position:sticky;top:0;z-index:3;padding:10px 0;margin-bottom:12px;background:#fffefa;border-bottom:1px solid #e0e6d8}.drawer-controls strong{margin-right:auto;font-size:12px}.drawer-controls button{background:#f0f4eb;border:0;border-radius:6px;min-height:32px;padding:5px 8px;color:#3b5b42;font:inherit;font-size:11px;cursor:pointer}.drawer-controls button[aria-pressed=true]{background:#dcebd2}.drawer-controls [data-drawer-close]{font-size:21px;width:32px}.compact-scene:not(.mobile-ui) #sidebar .add-piece-menu{display:none}.compact-scene:not(.mobile-ui) #inspector .inspector-head{position:static}.compact-scene:not(.mobile-ui) #inspector .inspector-head>button{display:none}
body.compact-scene .editor-toolbar{align-items:center;left:50%;right:auto;top:auto;bottom:70px;width:max-content;transform:translateX(-50%);max-width:calc(100% - 28px);z-index:22;flex-wrap:nowrap;overflow-x:auto;scrollbar-width:thin;padding:5px;border-radius:13px;background:#fffefa;box-shadow:0 4px 18px #243e291c;gap:2px}body.compact-scene .editor-toolbar button{min-height:38px;flex-shrink:0;padding:7px 9px;border-radius:8px;white-space:nowrap}body.compact-scene .editor-toolbar button[hidden]{display:none!important}body.compact-scene .editor-toolbar .toolbar-divider,body.compact-scene .editor-toolbar>[data-editor]{display:none}#selection-count{font-size:10px;white-space:nowrap;color:#748269;padding:0 7px}.selection-extra{display:none}body.compact-scene .selection-extra{display:inline-flex}
body.compact-scene .scene-label{display:none}body.compact-scene .scene-hint{left:auto;right:72px;bottom:14px}body.compact-scene .scene-hint #navigation-hint,body.compact-scene .scene-hint>[data-icon]{display:none}body.compact-scene .zoom-tools{bottom:14px;right:14px}body.compact-scene .scene-interaction-bar{bottom:122px;left:50%;transform:translateX(-50%);max-width:calc(100% - 28px);z-index:21}body.compact-scene #attachment-status{top:70px;left:50%;transform:translateX(-50%);max-width:calc(100% - 40px)}
body.compact-scene .editor-toolbar #multi-toggle,body.compact-scene .editor-toolbar #touch-rotate{display:none}body.compact-scene .editor-toolbar [data-tool=select]{display:none}
body:not(.compact-scene) #selection-count,body:not(.compact-scene) .selection-extra,body:not(.compact-scene) [data-drawer-toggle=properties]{display:none}
@media(max-width:1050px){body.compact-scene .editor-toolbar #selection-count{display:none}body.compact-scene .editor-toolbar button{font-size:11px;padding:7px}body.compact-scene:not(.mobile-ui) #sidebar{width:270px}body.compact-scene:not(.mobile-ui) #inspector{width:280px}}
body.mobile-ui .scene-create{display:none!important}body.mobile-ui .view-toolbar,body.mobile-ui.compact-scene .view-toolbar{top:8px;right:8px;left:auto;z-index:26}.mobile-ui .view-menu-panel{left:auto;right:0;width:min(285px,calc(100vw - 28px))}.mobile-ui .view-menu-panel button{min-height:44px}.mobile-ui .view-menu>summary{min-height:44px}.mobile-ui.compact-scene .editor-toolbar{top:auto;bottom:64px;left:50%;right:auto;max-width:calc(100% - 16px);transform:translateX(-50%);overflow-x:auto;flex-wrap:nowrap}.mobile-ui.compact-scene .editor-toolbar button{min-height:44px;min-width:44px}.mobile-ui.compact-scene .editor-toolbar button[data-tool]>span{display:inline}.mobile-ui.compact-scene .editor-toolbar #measure-toggle>span:last-child{display:inline}.mobile-ui.compact-scene .editor-toolbar [data-drawer-toggle=properties],.mobile-ui.compact-scene .editor-toolbar .selection-extra{display:none}.mobile-ui.compact-scene .scene-interaction-bar{bottom:115px}.mobile-ui .drawer-controls{display:none!important}.mobile-ui.compact-scene .scene-hint{left:auto;right:62px;bottom:10px}.mobile-ui.compact-scene .zoom-tools{bottom:10px;right:8px}.mobile-ui.compact-scene .scene-area:has(.inspector:not(.hidden)) .zoom-tools,.mobile-ui.compact-scene .scene-area:has(.inspector:not(.hidden)) .scene-hint{display:flex}
/* The legacy inspector reserved canvas width even when its drawer was closed. */
body.compact-scene #scene-area{height:auto;min-height:320px;flex:1}
body.compact-scene #scene-area>.scene-frame{inset:0}
body.compact-scene #scene-area>.view-toolbar{left:auto;right:14px;top:14px}
body.compact-scene #scene-area>.editor-toolbar{top:auto;bottom:70px;left:50%;right:auto;max-width:calc(100% - 28px)}
body.compact-scene #scene-area>.zoom-tools{right:14px;bottom:14px;display:flex}
body.compact-scene #scene-area>.fallback{left:35px;right:35px}
body.compact-scene #scene-area>.scene-interaction-bar{left:50%;bottom:122px;max-width:calc(100% - 28px)}
body.compact-scene #scene-area>.scene-hint{left:auto;right:72px;bottom:14px;display:flex;max-width:none}
body.compact-scene #scene-area .view-orientation{display:block}
body.compact-scene #scene-area .attachment-status{max-width:calc(100% - 40px)}
.view-menu-panel{max-height:calc(100dvh - 280px);overflow:auto}.view-utilities{flex-wrap:wrap}
body.mobile-ui.compact-scene #scene-area{min-height:0}
body.mobile-ui.compact-scene #scene-area>.view-toolbar{top:8px;right:8px;left:auto}
body.mobile-ui.compact-scene #scene-area>.editor-toolbar{top:auto;bottom:64px;left:50%;right:auto;max-width:calc(100% - 16px)}
body.mobile-ui.compact-scene #scene-area>.scene-interaction-bar{bottom:115px;max-width:calc(100% - 28px)}
body.mobile-ui.compact-scene #scene-area>.zoom-tools{right:8px;bottom:10px}
body.mobile-ui.compact-scene #scene-area>.scene-hint{right:62px;bottom:10px}
body.compact-scene.scene-focus #scene-area{min-height:0;height:100%}
@media print{.scene-capsule,.drawer-controls,.view-menu,.editor-toolbar{display:none!important}}
`;
