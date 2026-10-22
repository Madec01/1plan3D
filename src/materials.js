/** Matériaux et plans de débit. Longueurs en mm, prix par conditionnement. */
const object = v => v && typeof v === 'object' && !Array.isArray(v) ? v : {};
const number = (v, d = 0, min = 0, max = 1e7) => Math.min(max, Math.max(min, v === null || v === '' || typeof v === 'boolean' || !Number.isFinite(Number(v)) ? d : Number(v)));
const text = (v, d = '', limit = 240) => typeof v === 'string' ? v.replace(/[<>\u0000-\u001f]/g, '').slice(0, limit) : d;
const round = v => Math.round((v + Number.EPSILON) * 1000) / 1000;
const choice = (v, values, fallback) => values.includes(v) ? v : fallback;
const bool = v => v === true || v === 'true' || v === 'on';
const speciesList = ['pin', 'douglas', 'meleze', 'chene', 'other'];
const units = ['pièce', 'u', 'kit', 'barre', 'plaque', 'rouleau', 'm', 'm²', 'm³', 'L', 'ml', 'kg', 'sac'];
const validId = id => typeof id === 'string' && /^[\w.:-]{1,100}$/.test(id) && !['__proto__', 'constructor', 'prototype'].includes(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = value => Number(value).toLocaleString('fr-FR', {maximumFractionDigits: 3});
const sectionKey = (w, h) => [round(w), round(h)].sort((a,b) => a-b).join('x');
const timberKey = p => `${p.species}|${sectionKey(p.width, p.height)}`;
export const COMMON_TIMBER_LENGTHS = [2400,3000,4000,5000,6000];
const commercialSource = 'quick-lengths';
const rawLengthTokens = values => (Array.isArray(values)?values:[values]).flatMap(v=>typeof v==='string'?v.trim().split(/[;\s]+/).filter(Boolean):v===undefined||v===null?[]:[v]);
const normalizedLengths = values => [...new Set(rawLengthTokens(values).map(v=>Number(typeof v==='string'?v.replace(',','.'):v)).filter(n=>Number.isFinite(n)&&n>=1&&n<=100000).map(round))].sort((a,b)=>a-b).slice(0,32);

/** Les espaces et points-virgules séparent les formats ; la virgule peut être décimale. */
export function parseCommercialLengths(values){
  const tokens=rawLengthTokens(values);
  if(!tokens.length)throw new Error('Choisissez au moins une longueur commerciale.');
  if(tokens.some(v=>typeof v==='boolean'||!Number.isFinite(Number(typeof v==='string'?v.replace(',','.'):v))||Number(typeof v==='string'?v.replace(',','.'):v)<1||Number(typeof v==='string'?v.replace(',','.'):v)>100000))throw new Error('Longueurs en mm : nombres entre 1 et 100 000, séparés par des espaces ou des points-virgules.');
  const lengths=normalizedLengths(tokens);
  if(new Set(tokens.map(v=>round(Number(typeof v==='string'?v.replace(',','.'):v)))).size>32)throw new Error('Choisissez au maximum 32 longueurs commerciales.');
  return lengths;
}

/** Arrondi d'affichage exclusivement : les longueurs de débit ne sont jamais modifiées. */
export function formatCutDimension(value,precision=1){
  const step=Number(precision)===.5?.5:1,n=Number(value);
  return Number.isFinite(n)?(Math.round((n+Number.EPSILON)/step)*step).toLocaleString('fr-FR',{maximumFractionDigits:step===.5?1:0}):'—';
}

export function normalizeWorkshop(raw = {}) {
  const v = object(raw), used = new Set();
  const list = (items, prefix, convert) => (Array.isArray(items) ? items : []).slice(0, 500).map((item, i) => {
    item = object(item); let id = validId(item.id) && !used.has(item.id) ? item.id : `${prefix}-${i+1}`;
    while (used.has(id)) id += '-1'; used.add(id); return {id, ...convert(item)};
  });
  const commercial = a => ({label: text(a.label, 'Article'), unit: choice(a.unit, units, 'pièce'), packSize: number(a.packSize, 1, .001), price: number(a.price, 0), supplier: text(a.supplier), reference: text(a.reference)});
  const stock = a => ({kind: choice(a.kind, ['stock','offcut','purchase'], 'purchase'), qty: Math.floor(number(a.qty, 0, 0, 10000)), price: number(a.price, 0)});
  return {
    useTimberStock: bool(v.useTimberStock), usePanelStock: bool(v.usePanelStock),
    commercialLengths: normalizedLengths(v.commercialLengths),
    migratedTimberStockRows: [...new Set((Array.isArray(v.migratedTimberStockRows)?v.migratedTimberStockRows:[]).filter(validId))].slice(0,1000),
    legacyTimberStockWarnings: (Array.isArray(v.legacyTimberStockWarnings)?v.legacyTimberStockWarnings:[]).slice(0,1000).filter(a=>validId(a?.rowId)).map(a=>({rowId:a.rowId,fraction:number(a.fraction,0,0,1),length:number(a.length,3000,1,100000)})),
    catalogue: list(v.catalogue, 'CAT', a => ({...commercial(a), rowId: text(a.rowId, '', 200)})),
    extras: list(v.extras, 'EXTRA', a => ({...commercial(a), qty: number(a.qty, 1), stock: number(a.stock, 0), catalogueId: text(a.catalogueId, '', 100)})),
    timberStock: list(v.timberStock, 'BOIS', a => ({...stock(a), species: choice(a.species,speciesList,'pin'), width: number(a.width,45,.1,2000), height: number(a.height,70,.1,2000), length: number(a.length,3000,1,100000),...(a.generated===commercialSource&&a.kind==='purchase'?{generated:commercialSource}:{}),...(validId(a.legacyStockRow)?{legacyStockRow:a.legacyStockRow}:{})})),
    panelStock: list(v.panelStock, 'PAN', a => ({...stock(a), material: choice(a.material,['wood','roof'],'wood'), species: choice(a.species,speciesList,'pin'), width: number(a.width,1250,1,20000), height: number(a.height,2500,1,20000), thickness: number(a.thickness,18,.1,2000), allowRotate: bool(a.allowRotate)}))
  };
}

function legacyTimberId(id,defaultSpecies='pin'){
  const match=String(id).match(/^wood-(?:(pin|douglas|meleze|chene|other)-)?(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)$/);
  if(!match)return null;
  const species=match[1]||choice(defaultSpecies,speciesList,'pin'),width=Number(match[2]),height=Number(match[3]),length=Number(match[4]);
  if(width<.1||width>2000||height<.1||height>2000||length<1||length>100000)return null;
  return {rowId:`wood-${species}-${width}x${height}-${length}`,species,width,height,length,explicit:!!match[1],sourceId:id};
}
function legacyTimberEntries(project){
  const entries=new Map();
  for(const [id,value] of Object.entries(object(project.stock))){const parsed=legacyTimberId(id,project.material);if(!parsed)continue;const qty=number(value,0),previous=entries.get(parsed.rowId);if(!previous||parsed.explicit&&!previous.explicit)entries.set(parsed.rowId,{...parsed,qty});}
  return [...entries.values()].filter(a=>a.qty>0);
}
function legacyTimberPrice(project,source){
  const w=normalizeWorkshop(project.workshop),prices=[],references=new Map();
  for(const id of new Set([...Object.keys(object(project.prices)),...w.catalogue.map(c=>c.rowId)])){
    const parsed=legacyTimberId(id,project.material);if(!parsed||timberKey(parsed)!==timberKey(source)||parsed.length!==source.length)continue;
    const previous=references.get(parsed.rowId);if(!previous||parsed.explicit&&!previous.explicit)references.set(parsed.rowId,parsed);
  }
  for(const {sourceId:id} of references.values()){
    const cat=w.catalogue.find(c=>c.rowId===id&&c.unit==='barre'),price=Object.hasOwn(project.prices||{},id)?number(project.prices[id],0):cat?.price||0;
    prices.push(price/(cat?.packSize||1));
  }
  return prices.length&&prices.every(p=>Math.abs(p-prices[0])<1e-6)?prices[0]:0;
}
function migrateLegacyTimberStock(project,workshop){
  const w=normalizeWorkshop(workshop),migrated=new Set(w.migratedTimberStockRows),used=new Set([...w.catalogue,...w.extras,...w.timberStock,...w.panelStock].map(s=>s.id));
  for(const entry of legacyTimberEntries(project)){
    if(migrated.has(entry.rowId))continue;
    const whole=Math.floor(entry.qty),fraction=round(entry.qty-whole);let remaining=whole,index=0;
    while(remaining>0){const qty=Math.min(10000,remaining),base=`HIST-${entry.rowId}${index?'-'+index:''}`;let id=base,n=1;while(used.has(id))id=`${base}-${++n}`;used.add(id);
      w.timberStock.push({id,kind:'stock',qty,species:entry.species,width:entry.width,height:entry.height,length:entry.length,price:legacyTimberPrice(project,entry),legacyStockRow:entry.rowId});remaining-=qty;index++;
    }
    if(fraction>0)w.legacyTimberStockWarnings.push({rowId:entry.rowId,fraction,length:entry.length});
    migrated.add(entry.rowId);
  }
  w.migratedTimberStockRows=[...migrated];return w;
}

function currentLegacyTimberWorkshop(project,model){
  // Le mode historique n’utilise que le stock de sa longueur commerciale active.
  const length=number(project.woodStockLength,3000,1,100000),groups=new Map();
  for(const p of model?.parts||[])if(p.material==='wood'&&p.kind!=='panel')groups.set(timberKey({...p,species:p.species||project.material||'pin'}),{species:p.species||project.material||'pin',width:p.width,height:p.height,length});
  const sources=[];
  for(const entry of legacyTimberEntries(project))if(entry.length===length&&groups.has(timberKey(entry))&&Math.floor(entry.qty)>0){let remaining=Math.floor(entry.qty),index=0;while(remaining>0){const qty=Math.min(10000,remaining);sources.push({...entry,id:`ACTUEL-${entry.rowId}-${index++}`,kind:'stock',qty});remaining-=qty;}}
  for(const [key,group] of groups)sources.push({id:`CURRENT-${key.replace('|','-')}`,kind:'purchase',qty:0,...group,price:legacyTimberPrice(project,group)});
  return {useTimberStock:true,timberStock:sources};
}

/** Prépare des formats pour chaque section présente, sans consommer le stock physique. */
export function applyCommercialLengths(project,lengths,model){
  const selected=parseCommercialLengths(lengths),w=migrateLegacyTimberStock(project,project.workshop),oldGenerated=w.timberStock.filter(s=>s.kind==='purchase'&&s.generated===commercialSource);
  const preserved=w.timberStock.filter(s=>!(s.kind==='purchase'&&s.generated===commercialSource));
  const groups=new Map();
  for(const part of model?.parts||project.freeParts||[])if(part.material==='wood'&&part.kind!=='panel'){
    const species=choice(part.species||project.material,speciesList,'pin'),dims=[number(part.width,45,.1,2000),number(part.height,70,.1,2000)].sort((a,b)=>a-b),group={species,width:dims[0],height:dims[1]};
    groups.set(timberKey(group),group);
  }
  const used=new Set([...w.catalogue,...w.extras,...preserved,...w.panelStock].map(s=>s.id)),generated=[];
  for(const [key,g] of [...groups.entries()].sort(([a],[b])=>a.localeCompare(b)))for(const length of selected){
    // Une référence manuelle, même limitée, garde sa disponibilité et son tarif.
    if(preserved.some(s=>s.kind==='purchase'&&timberKey(s)===key&&s.length===length))continue;
    const old=oldGenerated.find(s=>timberKey(s)===key&&s.length===length),base=`QUICK-${g.species}-${sectionKey(g.width,g.height)}-${length}`;
    let id=old?.id||base,n=1;while(used.has(id))id=`${base}-${++n}`;used.add(id);
    generated.push({id,...g,length,kind:'purchase',qty:0,price:old?.price??legacyTimberPrice(project,{...g,length}),generated:commercialSource});
  }
  if(preserved.length+generated.length>500)throw new Error('Ces longueurs produisent plus de 500 références. Réduisez le nombre de formats ou utilisez vos références manuelles.');
  return normalizeWorkshop({...w,useTimberStock:true,commercialLengths:selected,timberStock:[...preserved,...generated]});
}

export function compareTimberLengths(project,model,lengths){
  const options={kerf:project.kerf,defaultLength:project.woodStockLength,defaultSpecies:project.material},workshop=applyCommercialLengths(project,lengths,model);
  const current=planTimber(model?.parts||[],project.workshop?.useTimberStock?project.workshop:currentLegacyTimberWorkshop(project,model),options),proposed=planTimber(model?.parts||[],workshop,options);
  const summary=plan=>({boards:plan.boards.length,purchaseBoards:plan.stats.purchaseBoards,stockBoards:plan.stats.stockBoards,purchaseLength:round(plan.purchases.reduce((n,p)=>n+p.qty*p.length,0)),reusableOffcuts:plan.stats.reusableOffcuts,sawWaste:plan.stats.sawWaste,missing:plan.missing.length,knownPrice:Math.round(plan.purchases.reduce((n,p)=>n+p.qty*p.price,0)*100)/100,priceComplete:plan.purchases.every(p=>p.price>0)&&!plan.missing.length});
  return {current,proposed,workshop,currentSummary:summary(current),proposedSummary:summary(proposed)};
}

const buyRow = (p, id, label, unit, required, packSize, price, stock = 0, extra = {}) => {
  const toBuy = Math.max(0, required-stock), packs = Math.ceil((toBuy-1e-9)/packSize), unitPrice = Object.hasOwn(p.prices || {},id) ? p.prices[id] : price;
  return {id, category:'Compléments', label, unit, required:round(required), marginQty:0, stock, toBuy:round(toBuy), packSize, packs, purchaseQty:round(packs*packSize), unitPrice, total:Math.round(packs*unitPrice*100)/100, priced:unitPrice>0 || packs===0, estimated:false, spec:'',detail:'',source:'',partIds:[], ...extra};
};

export function extraBOMRows(project) {
  const w = normalizeWorkshop(project.workshop);
  return w.extras.filter(a=>a.qty>0).map(item=>{
    const cat=w.catalogue.find(c=>c.id===item.catalogueId), a=cat?{...item,...cat,id:item.id}:item, id=`extra-${item.id}`;
    return buyRow(project,id,a.label,a.unit,item.qty,a.packSize,a.price,Object.hasOwn(project.stock||{},id)?project.stock[id]:item.stock,{spec:a.reference, supplier:a.supplier, detail:'Quantité complémentaire saisie. Réserve incluse dans la quantité demandée.', catalogueId:cat?.id||''});
  });
}

export function applyCatalogue(rows, project) {
  const w=normalizeWorkshop(project.workshop);
  return rows.map(row=>{
    const cat=w.catalogue.find(a=>a.rowId===row.id); if(!cat || cat.unit!==row.unit || row.id==='mesh-roll'&&Math.abs(cat.packSize-row.packSize)>1e-6) return {...row};
    const packs=Math.max(Math.ceil((row.toBuy-1e-9)/cat.packSize),row.id==='mesh-roll'?row.packs:0), price=Object.hasOwn(project.prices||{},row.id)?project.prices[row.id]:cat.price;
    return {...row,label:cat.label||row.label,spec:cat.reference||row.spec,supplier:cat.supplier,packSize:cat.packSize,packs,purchaseQty:round(packs*cat.packSize),unitPrice:price,total:Math.round(packs*price*100)/100,priced:price>0||packs===0,catalogueId:cat.id};
  });
}

/** Best-fit décroissant, stock et chutes avant achats. Aucun minimum global garanti. */
export function planTimber(parts = [], workshop = {}, options = {}) {
  const w=normalizeWorkshop(workshop), kerf=number(options.kerf,3,0,20), boards=[], missing=[];
  const pieces=parts.filter(p=>p.material==='wood'&&p.kind!=='panel').map(p=>({...p, species:p.species||options.defaultSpecies||'pin', length:number(p.length,Array.isArray(p.a)&&Array.isArray(p.b)?Math.hypot(...p.a.map((v,i)=>p.b[i]-v)):0)})).filter(p=>p.length>0).sort((a,b)=>b.length-a.length||String(a.id).localeCompare(String(b.id)));
  let stock=w.timberStock.map(s=>({...s,remaining:s.qty}));
  if(!w.useTimberStock) stock=[...new Map(pieces.map(p=>[timberKey(p),{id:`DEFAULT-${timberKey(p)}`,kind:'purchase',qty:0,remaining:0,species:p.species,width:p.width,height:p.height,length:number(options.defaultLength,3000,1,100000),price:0}])).values()];
  for(const [pieceIndex,piece] of pieces.entries()){
    const key=timberKey(piece); let board=boards.filter(b=>b.key===key && b.remaining+1e-6>=piece.length).sort((a,b)=>a.remaining-b.remaining)[0];
    if(!board){
      const candidates=stock.filter(s=>timberKey(s)===key && s.length+1e-6>=piece.length && (s.kind==='purchase'&&s.qty===0 || s.remaining>0));
      candidates.sort((a,b)=>({offcut:0,stock:1,purchase:2}[a.kind]-{offcut:0,stock:1,purchase:2}[b.kind])||a.length-b.length||a.price-b.price);
      let chosen=candidates[0];
      if(chosen?.kind==='purchase'){
        // Compare plusieurs formats commerciaux avec les pièces encore à débiter.
        // Les 32 formats les plus courts suffisent à borner le coût interactif.
        const seenLengths=new Set(),formats=candidates.filter(s=>!seenLengths.has(s.length)&&seenLengths.add(s.length)).slice(0,32);
        const pending=pieces.slice(pieceIndex).filter(p=>timberKey(p)===key);
        const scored=formats.map(s=>{let rest=s.length,net=0;for(const p of pending)if(p.length<=rest+1e-6){const saw=Math.min(kerf,Math.max(0,rest-p.length));rest=round(Math.max(0,rest-p.length-saw));net+=p.length;}return {source:s,efficiency:net/s.length};});
        scored.sort((a,b)=>b.efficiency-a.efficiency||a.source.length-b.source.length||a.source.price-b.source.price);chosen=scored[0]?.source||chosen;
      }
      if(!chosen){missing.push({...piece,reason:'Aucune longueur disponible dans cette essence et cette section.'});continue;}
      if(chosen.qty>0 || chosen.kind!=='purchase') chosen.remaining--;
      board={id:`DEBIT-${boards.length+1}`,stockId:chosen.id,key,species:chosen.species,width:chosen.width,height:chosen.height,section:`${chosen.width} × ${chosen.height} mm · ${chosen.species}`,stockLength:chosen.length,length:chosen.length,remaining:chosen.length,kind:chosen.kind,price:chosen.price,cuts:[],sawWaste:0};boards.push(board);
    }
    const saw=Math.min(kerf,Math.max(0,board.remaining-piece.length)), start=board.length-board.remaining;
    board.cuts.push({id:piece.id,label:piece.label||piece.id,length:piece.length,start:round(start),kerf:round(saw)});
    board.remaining=round(Math.max(0,board.remaining-piece.length-saw));board.sawWaste=round(board.sawWaste+saw);
  }
  const purchases=[];
  for(const board of boards.filter(b=>b.kind==='purchase')) {let entry=purchases.find(s=>s.stockId===board.stockId);if(!entry){entry={stockId:board.stockId,species:board.species,width:board.width,height:board.height,length:board.length,qty:0,price:board.price,partIds:[]};purchases.push(entry);}entry.qty++;entry.partIds.push(...board.cuts.map(c=>c.id));}
  const totalStock=boards.reduce((s,b)=>s+b.length,0), totalLength=boards.flatMap(b=>b.cuts).reduce((s,c)=>s+c.length,0), totalWaste=boards.reduce((s,b)=>s+b.remaining,0), sawWaste=boards.reduce((s,b)=>s+b.sawWaste,0);
  return {boards,bars:boards,missing,unplaced:missing,purchases,unusedStock:stock.filter(s=>s.remaining>0).map(s=>({...s,qty:s.remaining})),cuts:boards.flatMap(b=>b.cuts.map(c=>({...c,boardId:b.id,stockId:b.stockId}))),kerf,stats:{boards:boards.length,purchaseBoards:purchases.reduce((s,a)=>s+a.qty,0),stockBoards:boards.filter(b=>b.kind!=='purchase').length,totalStock:round(totalStock),totalLength:round(totalLength),reusableOffcuts:round(totalWaste),sawWaste:round(sawWaste),efficiency:totalStock?totalLength/totalStock:0},totalStock,totalUsed:totalLength+sawWaste,totalWaste,efficiency:totalStock?totalLength/totalStock:0};
}

function panelSize(p){
  if(Array.isArray(p.corners)&&p.corners.length===4){
    const c=p.corners, dist=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
    const u=c[1].map((v,i)=>v-c[0][i]), v=c[3].map((n,i)=>n-c[0][i]), width=dist(c[0],c[1]),height=dist(c[0],c[3]);
    const rectangular=width>0&&height>0&&Math.abs(u.reduce((s,n,i)=>s+n*v[i],0)/(width*height))<1e-6&&dist(c[2],c[0].map((n,i)=>n+u[i]+v[i]))<.01;
    return {width,height,rectangular};
  }
  return {width:number(p.surfaceWidth),height:number(p.surfaceHeight),rectangular:false};
}
const panelKey=p=>`${p.material}|${p.material==='wood'?p.species||'pin':''}|${round(p.thickness??p.width)}`;

/** Découpe guillotine rectangulaire. Rotation explicitement autorisée par format. */
export function planPanels(parts=[],workshop={},options={}){
  const w=normalizeWorkshop(workshop), kerf=number(options.kerf,3,0,20), sheets=[],missing=[],stock=w.panelStock.map(s=>({...s,remaining:s.qty}));
  const panels=parts.filter(p=>(p.kind==='panel'||p.material==='roof')&&['wood','roof'].includes(p.material)).map(p=>({...p,...panelSize(p),thickness:p.width,species:p.species||options.defaultSpecies||'pin'})).sort((a,b)=>b.width*b.height-a.width*a.height);
  for(const p of panels){
    if(!p.rectangular){missing.push({...p,reason:'Forme non rectangulaire : découpe manuelle à tracer.'});continue;}
    const key=panelKey(p), fits=(r,s)=>[{width:p.width,height:p.height,rotated:false},...(s.allowRotate?[{width:p.height,height:p.width,rotated:true}]:[])].filter(d=>d.width<=r.width+1e-6&&d.height<=r.height+1e-6);
    let candidates=[];
    for(const sheet of sheets.filter(s=>s.key===key)) for(const [i,r] of sheet.free.entries()) for(const d of fits(r,sheet)) candidates.push({sheet,i,r,d,waste:r.width*r.height-d.width*d.height});
    candidates.sort((a,b)=>a.waste-b.waste);let target=candidates[0];
    if(!target){
      const available=stock.filter(s=>panelKey(s)===key&&(s.kind==='purchase'&&s.qty===0||s.remaining>0)).flatMap(s=>fits(s,s).map(d=>({s,d})));
      available.sort((a,b)=>({offcut:0,stock:1,purchase:2}[a.s.kind]-{offcut:0,stock:1,purchase:2}[b.s.kind])||a.s.width*a.s.height-b.s.width*b.s.height);
      const chosen=available[0];if(!chosen){missing.push({...p,reason:'Aucun format compatible disponible (matériau, essence, épaisseur, sens de découpe).'});continue;}
      if(chosen.s.qty>0||chosen.s.kind!=='purchase')chosen.s.remaining--;
      const sheet={...chosen.s,id:`PLAQUE-${sheets.length+1}`,stockId:chosen.s.id,key,free:[{x:0,y:0,width:chosen.s.width,height:chosen.s.height}],cuts:[]};sheets.push(sheet);target={sheet,i:0,r:sheet.free[0],d:chosen.d};
    }
    const {sheet,i,r,d}=target;sheet.free.splice(i,1);
    sheet.cuts.push({id:p.id,label:p.label||p.id,x:r.x,y:r.y,width:round(d.width),height:round(d.height),rotated:d.rotated});
    // Première coupe verticale sur toute la hauteur, puis coupe horizontale dans la bande.
    const right=r.width-d.width-kerf,bottom=r.height-d.height-kerf;
    if(right>1e-6)sheet.free.push({x:round(r.x+d.width+kerf),y:r.y,width:round(right),height:r.height});
    if(bottom>1e-6)sheet.free.push({x:r.x,y:round(r.y+d.height+kerf),width:round(d.width),height:round(bottom)});
  }
  const purchases=[];for(const sheet of sheets.filter(s=>s.kind==='purchase')){let item=purchases.find(s=>s.stockId===sheet.stockId);if(!item){item={stockId:sheet.stockId,material:sheet.material,species:sheet.species,width:sheet.width,height:sheet.height,thickness:sheet.thickness,qty:0,price:sheet.price,partIds:[]};purchases.push(item);}item.qty++;item.partIds.push(...sheet.cuts.map(c=>c.id));}
  return {sheets,missing,purchases,kerf,area:round(sheets.reduce((s,p)=>s+p.width*p.height/1e6,0)),cutArea:round(sheets.flatMap(s=>s.cuts).reduce((n,c)=>n+c.width*c.height/1e6,0)),offcutArea:round(sheets.flatMap(s=>s.free).reduce((n,c)=>n+c.width*c.height/1e6,0))};
}

/** Lés de grillage : enveloppes rectangulaires avec recouvrement, sans réutilisation en largeur. */
export function planMeshRolls(parts=[],project={}){
  const width=number(project.meshRollWidth,1000,1,20000),length=number(project.meshRollLength,25000,1,1000000),overlap=number(project.meshOverlap,50,0,width-.001),strips=[],missing=[];
  for(const p of parts.filter(a=>a.material==='mesh')){
    const size=panelSize(p),pw=number(p.surfaceWidth,size.width),ph=number(p.surfaceHeight,size.height);
    const variants=[{span:pw+2*overlap,cut:ph+2*overlap,orientation:'verticale'},{span:ph+2*overlap,cut:pw+2*overlap,orientation:'horizontale'}].map(v=>({...v,count:Math.max(1,Math.ceil((v.span-overlap)/(width-overlap)))})).filter(v=>v.cut<=length&&v.cut>0&&v.span>0).sort((a,b)=>a.count*a.cut-b.count*b.cut);
    if(!variants.length){missing.push({...p,reason:'Aucun lé ne tient dans la longueur du rouleau.'});continue;}
    const v=variants[0];if(v.count>10000){missing.push({...p,reason:'Trop de lés : vérifier la largeur du rouleau et le recouvrement.'});continue;}
    for(let i=0;i<v.count;i++)strips.push({id:`${p.id}-LE${i+1}`,partId:p.id,length:round(v.cut),width:round(Math.min(width,v.span-i*(width-overlap))),orientation:v.orientation});
  }
  const pack=(input,prefix)=>{const bins=[];for(const strip of [...input].sort((a,b)=>b.length-a.length)){let roll=bins.filter(r=>r.remaining>=strip.length-1e-6).sort((a,b)=>a.remaining-b.remaining)[0];if(!roll){roll={id:`${prefix}-${bins.length+1}`,length,width,remaining:length,cuts:[]};bins.push(roll);}roll.cuts.push(strip);roll.remaining=round(roll.remaining-strip.length);}return bins;};
  strips.sort((a,b)=>b.length-a.length);
  const rolls=pack(strips,'ROULEAU'),stockMetres=number(project.stock?.['mesh-roll'],0),stockLength=stockMetres*1000;
  let fullStock=Math.floor(stockLength/length);const stockRest=stockLength%length,stockRolls=stockRest>0?[{id:'STOCK-RESTE',length:stockRest,width,remaining:stockRest,cuts:[]}]:[],remainingStrips=[];
  for(const strip of strips){let roll=stockRolls.filter(r=>r.remaining>=strip.length-1e-6).sort((a,b)=>a.remaining-b.remaining)[0];if(!roll&&fullStock>0){roll={id:`STOCK-${stockRolls.length+1}`,length,width,remaining:length,cuts:[]};stockRolls.push(roll);fullStock--;}
    if(roll){roll.cuts.push(strip);roll.remaining=round(roll.remaining-strip.length);}else remainingStrips.push(strip);
  }
  const purchaseRolls=pack(remainingStrips,'ACHAT'),rawLength=strips.reduce((s,a)=>s+a.length,0),reserveLength=rawLength*number(project.margin,0,0,100)/100;
  const purchaseCount=Math.max(purchaseRolls.length,Math.ceil((Math.max(0,rawLength+reserveLength-stockLength)-1e-6)/length));
  return {rolls,strips,missing,width,length,overlap,totalLength:round(rawLength),stockMetres,stockRolls:stockRolls.filter(r=>r.cuts.length),purchaseRolls,purchaseCount,reserveRolls:Math.max(0,purchaseCount-purchaseRolls.length),reserveLength:round(reserveLength),stockUnused:round(fullStock*length+stockRolls.reduce((s,r)=>s+r.remaining,0))};
}

export function applyWorkshopBOM(rows,project,model){
  const w=normalizeWorkshop(project.workshop);let result=rows.map(r=>({...r}));
  if(w.useTimberStock){
    result=result.filter(r=>r.category!=='Bois');
    const plan=planTimber(model.parts,w,{kerf:project.kerf,defaultSpecies:project.material});
    for(const a of plan.purchases)result.push(buyRow(project,`workshop-timber-${a.stockId}`,`Bois ${a.species} · ${a.width} × ${a.height} × ${a.length} mm`,'pièce',a.qty,1,a.price,0,{category:'Bois',spec:'Longueur commerciale du plan de débit',detail:'Stocks et chutes disponibles déjà affectés au plan. Ne pas les déduire une seconde fois.',partIds:a.partIds}));
    for(const p of plan.missing)result.push(buyRow(project,`workshop-timber-missing-${p.id}`,`Bois à approvisionner : ${p.id}`,'pièce',1,1,0,0,{category:'Bois',needsQuote:true,needsReview:true,priced:false,spec:`${p.width} × ${p.height} × ${p.length} mm · ${p.species}`,detail:p.reason,partIds:[p.id]}));
  }
  if(w.usePanelStock){
    const plan=planPanels(model.parts,w,{kerf:project.kerf,defaultSpecies:project.material});
    result=result.filter(r=>!r.id.startsWith('wood-panel-')&&r.id!=='roof-cover');
    for(const a of plan.purchases)result.push(buyRow(project,`workshop-panel-${a.stockId}`,`Plaque ${a.material==='wood'?'bois '+a.species:'couverture'} · ${a.width} × ${a.height} × ${a.thickness} mm`,'pièce',a.qty,1,a.price,0,{category:'Panneaux',spec:'Format du calepinage',detail:'Stocks déjà affectés au plan. Sens de découpe selon l’option de rotation.',partIds:a.partIds}));
    for(const p of plan.missing)result.push(buyRow(project,`workshop-panel-missing-${p.id}`,`Panneau à approvisionner : ${p.id}`,'pièce',1,1,0,0,{category:'Panneaux',needsQuote:true,needsReview:true,priced:false,spec:`Enveloppe ${round(p.width)} × ${round(p.height)} mm · ép. ${p.thickness} mm`,detail:p.reason,partIds:[p.id]}));
  }
  return applyCatalogue([...result,...extraBOMRows(project)],project);
}

/** Mutateur pur pour les formulaires. Le projet doit ensuite être normalisé par l'application. */
export function workshopAction(raw,action,data={}){
  const w=normalizeWorkshop(raw), d=object(data), mapping={catalogue:'catalogue',extra:'extras',timber:'timberStock',panel:'panelStock'};
  if(action==='acknowledge-legacy-stock'){w.legacyTimberStockWarnings=w.legacyTimberStockWarnings.filter(a=>a.rowId!==d.id);return w;}
  if(action==='settings'){w.useTimberStock=bool(d.useTimberStock);w.usePanelStock=bool(d.usePanelStock);return w;}
  const [verb,kind]=action.split('-'),list=mapping[kind];if(!list)throw new Error('Action matériaux inconnue.');
  if(verb==='remove'){w[list]=w[list].filter(a=>a.id!==d.id);return w;}
  if(verb!=='save')throw new Error('Action matériaux inconnue.');
  const existing=w[list].find(a=>a.id===d.id);if(!existing&&w[list].length>=500)throw new Error('Maximum 500 entrées dans cette liste.');
  let id=existing?.id||`${kind.toUpperCase()}-1`;let n=1;while(!existing&&Object.values(w).some(a=>Array.isArray(a)&&a.some(x=>x.id===id)))id=`${kind.toUpperCase()}-${++n}`;
  const next={...existing,...d,id};if(kind==='panel')next.allowRotate=bool(d.allowRotate);
  if(kind==='timber'&&existing?.generated===commercialSource){
    const changed=['kind','species'].some(k=>next[k]!==existing[k])||['qty','width','height','length'].some(k=>Number(next[k])!==existing[k]);
    if(changed)delete next.generated;
  }
  if(existing)w[list]=w[list].map(a=>a.id===id?next:a);else w[list].push(next);
  return normalizeWorkshop(w);
}

const field=(label,name,value='',type='text',attrs='')=>`<label class="field"><span>${esc(label)}</span><input name="${name}" type="${type}" value="${esc(value)}" ${attrs}></label>`;
const select=(label,name,value,opts)=>`<label class="field"><span>${esc(label)}</span><select name="${name}">${opts.map(([v,l])=>`<option value="${esc(v)}" ${v===value?'selected':''}>${esc(l)}</option>`).join('')}</select></label>`;
const num=(label,name,value,min=0)=>field(label,name,value,'number',`min="${min}" step="any" required`);
const species=speciesList.map(s=>[s,{pin:'Pin',douglas:'Douglas',meleze:'Mélèze',chene:'Chêne',other:'Autre'}[s]]);
const kinds=[['purchase','À acheter (0 = disponible sans limite)'],['stock','En stock (quantité limitée)'],['offcut','Chute disponible (quantité limitée)']];
const form=(kind,item,body)=>`<form data-workshop-form="save-${kind}"><input type="hidden" name="id" value="${esc(item?.id||'')}"><div class="workshop-fields">${body}</div><button class="btn" type="submit">${item?'Enregistrer':'Ajouter'}</button>${item?` <button type="button" class="btn subtle" data-workshop-action="remove-${kind}" data-id="${esc(item.id)}">Supprimer</button>`:''}</form>`;
const entry=(title,body)=>`<details class="workshop-entry"><summary>${esc(title)}</summary>${body}</details>`;
const commercialFields=a=>field('Article','label',a.label||'','text','maxlength="240" required')+select('Unité','unit',a.unit||'pièce',units.map(v=>[v,v]))+num('Quantité par paquet','packSize',a.packSize??1,.001)+num('Prix du paquet (€)','price',a.price??0)+field('Fournisseur','supplier',a.supplier)+field('Référence','reference',a.reference);
const legacyStockWarnings=(w,editable=false)=>(w.legacyTimberStockWarnings||[]).map(a=>`<p class="notice">${fmt(a.fraction)} barre historique de ${fmt(a.length)} mm : fraction historique à mesurer dans Stock. Elle n’est pas affectée au débit ; renseignez la longueur réelle de chaque chute.${editable?` <button class="btn small subtle" type="button" data-workshop-action="acknowledge-legacy-stock" data-id="${esc(a.rowId)}">J’ai reporté ce reliquat</button>`:''}</p>`).join('');

/** Le modèle transmis contient les longueurs brutes de fabrication, si renseignées. */
export function timberLengthsComparison(project,model,lengths,options={}){
  const precision=options.precision??project.manufacturing?.precision??1;
  try{
    const result=compareTimberLengths(project,model,lengths),a=result.currentSummary,b=result.proposedSummary;
    const rows=[['Barres à acheter',a.purchaseBoards,b.purchaseBoards],['Bois à acheter',`${fmt(a.purchaseLength/1000)} m`,`${fmt(b.purchaseLength/1000)} m`],['Barres / chutes du stock utilisées',a.stockBoards,b.stockBoards],['Chutes réutilisables',`${formatCutDimension(a.reusableOffcuts,precision)} mm`,`${formatCutDimension(b.reusableOffcuts,precision)} mm`],['Pièces sans approvisionnement',a.missing,b.missing]];
    const amount=s=>s.priceComplete?`${s.knownPrice.toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2})} €`:`${s.knownPrice>0?s.knownPrice.toLocaleString('fr-FR')+' € renseignés · ':''}prix incomplets`;
    return `<div class="table-wrap"><table class="timber-comparison"><thead><tr><th scope="col">Comparaison</th><th scope="col">Réglage actuel</th><th scope="col">Longueurs choisies</th></tr></thead><tbody>${rows.map(([label,left,right])=>`<tr><th scope="row">${esc(label)}</th><td>${esc(left)}</td><td>${esc(right)}</td></tr>`).join('')}<tr><th scope="row">Prix des barres renseignés</th><td>${esc(amount(a))}</td><td>${esc(amount(b))}</td></tr></tbody></table></div>${b.missing?`<p class="error-state">${b.missing} pièce(s) restent sans longueur compatible. Ajoutez un format plus long ou vérifiez leurs sections.</p>`:''}${legacyStockWarnings(result.workshop)}<p class="help-text">Comparaison par répartition heuristique : elle ne garantit pas l’optimum, ni le prix minimal. Les stocks historiques de barres entières sont repris dans le nouveau débit ; vos chutes et références manuelles sont conservées. Les prix indiqués sont ceux des formats saisis ; le total des achats reprend vos tarifs de checklist.</p>`;
  }catch(error){return `<p class="error-state">${esc(error.message)}</p>`;}
}

export function timberQuickSetup(project,model,options={}){
  const w=normalizeWorkshop(project.workshop),selected=options.lengths?parseCommercialLengths(options.lengths):w.commercialLengths.length?w.commercialLengths:normalizedLengths([2400,3000,4000,project.woodStockLength||3000]);
  const extra=selected.filter(n=>!COMMON_TIMBER_LENGTHS.includes(n)),groups=new Set((model?.parts||[]).filter(p=>p.material==='wood'&&p.kind!=='panel').map(p=>timberKey({...p,species:p.species||project.material||'pin'})));
  return `<section class="content-card timber-quick-setup"><span class="eyebrow">CHOISIR LES LONGUEURS DISPONIBLES</span><h2>Un débit selon les formats du magasin.</h2><p>Choisissez plusieurs longueurs : elles seront proposées pour les ${groups.size} section(s) et essence(s) présentes dans ce projet.</p><form data-commercial-lengths><fieldset class="commercial-lengths"><legend>Longueurs commerciales (mm)</legend>${COMMON_TIMBER_LENGTHS.map(length=>`<label><input type="checkbox" name="length" value="${length}" ${selected.includes(length)?'checked':''}> ${fmt(length)} mm</label>`).join('')}</fieldset>${field('Autres longueurs en mm · séparées par un espace ou ;','customLengths',extra.join(' ; '),'text','inputmode="decimal" placeholder="3500 ; 4200"')}<div data-commercial-comparison aria-live="polite">${timberLengthsComparison(project,model,selected,options)}</div><div class="selection-actions"><button class="btn primary" type="submit" ${groups.size?'':'disabled'}>Appliquer ces longueurs au débit et aux achats</button><button class="btn" type="button" data-page="workshop">Stocks, chutes et prix</button><button class="btn subtle" type="button" data-page="shopping">Voir les achats</button></div><p class="help-text">Le trait de scie est pris en compte. Les formats générés sont disponibles à l’achat sans limite de quantité ; vos formats manuels et leur disponibilité sont conservés. Aucun stock n’est consommé par cette simulation.</p></form></section>`;
}

export function workshopView(project,model,rows=[]){
  const w=normalizeWorkshop(project.workshop);
  const unitMismatches=w.catalogue.filter(c=>c.rowId&&rows.some(r=>r.id===c.rowId&&r.unit!==c.unit));
  const rollMismatches=w.catalogue.filter(c=>c.rowId==='mesh-roll'&&rows.some(r=>r.id===c.rowId&&Math.abs(c.packSize-r.packSize)>1e-6));
  const catalogueForm=a=>form('catalogue',a,a?commercialFields(a):commercialFields({})) .replace('</div><button', `${select('Ligne d’achat associée (facultatif)','rowId',a?.rowId||'',[['','Aucune : article réutilisable'],...rows.filter(r=>!r.id.startsWith('extra-')).map(r=>[r.id,`${r.label} · ${r.unit}`])])}</div><button`);
  const extraForm=a=>form('extra',a,select('Article du catalogue','catalogueId',a?.catalogueId||'',[['','Saisie libre'],...w.catalogue.map(c=>[c.id,c.label])])+commercialFields(a||{label:'Complément'})+num('Quantité totale nécessaire','qty',a?.qty??1)+num('Déjà disponible','stock',a?.stock??0));
  const timberForm=a=>form('timber',a,select('Essence','species',a?.species||project.material||'pin',species)+num('Largeur (mm)','width',a?.width??project.beamWidth??45,.1)+num('Hauteur (mm)','height',a?.height??project.beamHeight??70,.1)+num('Longueur (mm)','length',a?.length??project.woodStockLength??3000,1)+select('Provenance','kind',a?.kind||'purchase',kinds)+field('Quantité de barres','qty',a?.qty??0,'number','min="0" max="10000" step="1" required')+num('Prix par barre (€)','price',a?.price??0));
  const panelForm=a=>form('panel',a,select('Matériau','material',a?.material||'wood',[['wood','Bois'],['roof','Couverture']])+select('Essence (bois)','species',a?.species||project.material||'pin',species)+num('Largeur (mm)','width',a?.width??1250,1)+num('Longueur (mm)','height',a?.height??2500,1)+num('Épaisseur (mm)','thickness',a?.thickness??18,.1)+select('Provenance','kind',a?.kind||'purchase',kinds)+field('Quantité de plaques','qty',a?.qty??0,'number','min="0" max="10000" step="1" required')+num('Prix par plaque (€)','price',a?.price??0)+`<label class="field"><span><input type="checkbox" name="allowRotate" ${a?.allowRotate?'checked':''}> Autoriser la rotation à 90° (sens du matériau)</span></label>`);
  return `<div class="content-card"><span class="eyebrow">MATÉRIAUX & STOCKS</span><h2>Vos références, vos chutes, vos formats.</h2><p>Les prix saisis ici sont ceux de vos fournisseurs. Les quantités des articles complémentaires s’ajoutent à la checklist.</p><form data-workshop-form="settings"><label class="field"><span><input type="checkbox" name="useTimberStock" ${w.useTimberStock?'checked':''}> Utiliser les barres et chutes ci-dessous pour le débit et les achats bois</span></label><label class="field"><span><input type="checkbox" name="usePanelStock" ${w.usePanelStock?'checked':''}> Utiliser les formats ci-dessous pour les panneaux et leur achat</span></label><button class="btn" type="submit">Appliquer les sources de débit</button></form><p class="help-text">Une source « à acheter » de quantité 0 est illimitée. Les stocks et les chutes sont limités à la quantité indiquée. Le calcul réserve le trait de scie ; les surlongueurs de dressage restent à prévoir.</p></div>
  <div class="content-card"><h3>Catalogue personnel</h3><p>Associez une référence à une ligne d’achat de même unité pour appliquer son conditionnement et son prix. Un prix modifié dans la checklist reste prioritaire.</p>${unitMismatches.map(c=>`<p class="error-state">${esc(c.label)} : unité ${esc(c.unit)} différente de la ligne associée. Tarif non appliqué ; choisissez la même unité.</p>`).join('')}${rollMismatches.map(c=>`<p class="error-state">${esc(c.label)} : la longueur par rouleau diffère du plan de grillage. Modifiez d’abord le format du rouleau dans les paramètres du projet ; tarif non appliqué.</p>`).join('')}${w.catalogue.map(a=>entry(`${a.label} · ${fmt(a.price)} € / ${fmt(a.packSize)} ${a.unit}`,catalogueForm(a))).join('')}${entry('Ajouter une référence',catalogueForm())}</div>
  <div class="content-card"><h3>Articles complémentaires</h3><p>Peinture, charnières, outils, consommables… Le catalogue remplace le nom, l’unité, le paquet et le tarif de la saisie libre.</p>${w.extras.map(a=>entry(`${a.label} · ${fmt(a.qty)} ${a.unit}`,extraForm(a))).join('')}${entry('Ajouter un article à acheter',extraForm())}</div>
  <div class="content-card"><h3>Bois : longueurs et chutes</h3>${legacyStockWarnings(w,true)}${w.timberStock.map(a=>entry(`${a.species} · ${a.width} × ${a.height} × ${a.length} mm · ${a.kind==='purchase'?'achat':a.kind==='offcut'?'chute':'stock'} · ${a.qty|| (a.kind==='purchase'?'illimité':'0')}`,timberForm(a))).join('')}${entry('Ajouter une longueur ou une chute',timberForm())}</div>
  <div class="content-card"><h3>Formats de panneaux</h3>${w.panelStock.map(a=>entry(`${a.material==='wood'?a.species:'Couverture'} · ${a.width} × ${a.height} × ${a.thickness} mm`,panelForm(a))).join('')}${entry('Ajouter un format',panelForm())}<p class="help-text">Calepinage rectangulaire par coupes guillotine, avec rotation seulement si vous l’autorisez. Les formes trapézoïdales et les découpes courbes restent signalées pour un tracé manuel.</p></div>`;
}

export function timberPlanView(plan,options={}){
  const precision=Number(options.precision)===.5?.5:1,dim=value=>formatCutDimension(value,precision);
  return `<div class="content-card"><span class="eyebrow">DÉBIT MULTI-LONGUEURS</span><h2>${plan.boards.length} barres : ${plan.stats.stockBoards} disponibles, ${plan.stats.purchaseBoards} à acheter.</h2><p>${fmt(plan.stats.totalLength/1000)} m de pièces · ${fmt(plan.stats.reusableOffcuts/1000)} m de chutes restantes · ${dim(plan.stats.sawWaste)} mm de trait de scie. Répartition heuristique par essence et section.</p><p class="help-text">Cotes affichées arrondies au ${precision===.5?'demi-millimètre':'millimètre'}. Les longueurs utilisées pour répartir les pièces restent exactes.</p></div>${plan.missing.length?`<div class="error-state">${plan.missing.length} pièce(s) sans approvisionnement : ${plan.missing.map(p=>`${esc(p.id)} (${dim(p.length)} mm, ${esc(p.species)}, ${dim(p.width)} × ${dim(p.height)})`).join(' · ')}. Ajoutez des longueurs compatibles dans Matériaux.</div>`:''}${plan.boards.map(b=>`<div class="cut-group"><div class="cut-header"><strong>${esc(b.id)} <span class="tag">${esc(b.section)}</span></strong><span>${dim(b.length)} mm · ${b.kind==='purchase'?'à acheter':b.kind==='offcut'?'chute disponible':'en stock'}</span></div><div class="cut-bar">${b.cuts.map(c=>`<div class="cut-segment" style="width:${c.length/b.length*100}%" title="${esc(c.id)} : ${dim(c.length)} mm">${esc(c.id)} · ${dim(c.length)}</div>${c.kerf?`<div style="width:${c.kerf/b.length*100}%;background:#495c48" title="Trait de scie ${fmt(c.kerf)} mm"></div>`:''}`).join('')}<div class="cut-rest">${dim(b.remaining)} mm</div></div><div class="cut-details">${b.cuts.map(c=>`${esc(c.id)} : ${dim(c.length)} mm`).join(' · ')}<br>Chute réutilisable : ${dim(b.remaining)} mm · scie : ${dim(b.sawWaste)} mm · source ${esc(b.stockId)}</div></div>`).join('')}`;
}

export function panelPlanView(plan){
  return `<div class="content-card"><span class="eyebrow">CALEPINAGE DES PANNEAUX</span><h2>${plan.sheets.length} plaques préparées</h2><p>${fmt(plan.cutArea)} m² découpés · ${fmt(plan.offcutArea)} m² de chutes rectangulaires. Coordonnées des coupes depuis le coin supérieur gauche, en mm.</p>${plan.missing.map(p=>`<p class="error-state">${esc(p.id)} : ${esc(p.reason)}</p>`).join('')}</div>${plan.sheets.map(s=>`<div class="content-card"><h3>${esc(s.id)} · ${fmt(s.width)} × ${fmt(s.height)} mm · ${s.kind==='purchase'?'à acheter':'disponible'}</h3><svg role="img" aria-label="Plan de découpe ${esc(s.id)}" viewBox="0 0 ${s.width} ${s.height}" style="width:100%;max-height:360px;background:#f0ede1"><rect width="${s.width}" height="${s.height}" fill="#f0ede1" stroke="#b7b5a3"/>${s.cuts.map(c=>`<rect x="${c.x}" y="${c.y}" width="${c.width}" height="${c.height}" fill="#b9c9aa" stroke="#426044" stroke-width="${Math.max(s.width,s.height)/700}"/><text x="${c.x+c.width/2}" y="${c.y+c.height/2}" text-anchor="middle" fill="#243b28" font-size="${Math.min(Math.max(s.width,s.height)/42,c.width/Math.max(String(c.id).length,1)*1.4)}">${esc(c.id)}</text>`).join('')}</svg><p class="help-text">${s.cuts.map(c=>`${esc(c.id)} : ${fmt(c.width)} × ${fmt(c.height)} mm à (${fmt(c.x)}, ${fmt(c.y)})${c.rotated?' · tourné 90°':''}`).join('<br>')}</p><p class="help-text">Chutes : ${s.free.map(c=>`${fmt(c.width)} × ${fmt(c.height)} mm`).join(' · ')||'aucune'}</p></div>`).join('')}`;
}

export function meshPlanView(plan){
  return `<div class="content-card"><span class="eyebrow">GRILLAGE</span><h2>${plan.purchaseCount} rouleaux ${plan.missing.length?'pour les lés réalisables':'à acheter'} · ${fmt(plan.width)} mm × ${fmt(plan.length/1000)} m</h2><p>Découpe brute : ${plan.rolls.length} rouleaux avant stock et réserve. Stock saisi : ${fmt(plan.stockMetres)} m ; réserve demandée : ${fmt(plan.reserveLength/1000)} m. ${plan.reserveRolls?`${plan.reserveRolls} rouleau(x) supplémentaire(s) couvre(nt) la réserve.`:'La réserve tient dans les longueurs restantes.'}</p><p>Recouvrement ${fmt(plan.overlap)} mm. Les lés sont découpés sur toute la largeur ; les chutes en largeur ne sont pas réemployées automatiquement. Le stock est supposé composé de rouleaux entiers et d’un seul reste continu.</p>${plan.missing.map(p=>`<p class="error-state">${esc(p.id)} : ${esc(p.reason)} Quantité d’achat à revoir.</p>`).join('')}${[...plan.stockRolls,...plan.purchaseRolls].map(r=>`<p><strong>${esc(r.id)}</strong> · ${r.id.startsWith('STOCK')?'déjà disponible':'à acheter'} · reste ${fmt(r.remaining/1000)} m<br>${r.cuts.map(c=>`${esc(c.id)} : ${fmt(c.width)} × ${fmt(c.length)} mm (${c.orientation})`).join(' · ')}</p>`).join('')}</div>`;
}
