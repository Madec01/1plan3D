import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeSheetSettings,buildDrawingSheets,sheetSVG,printHTML,pdfBytes} from '../src/paper-sheets.js';
import {pdfString,textWidth} from '../src/vector-pdf.js';
import {Window} from 'happy-dom';
const near=(a,b,e=1e-7)=>assert.ok(Math.abs(a-b)<e,`${a} != ${b}`);
const post=(id,x)=>({id,label:'Poteau',kind:'post',material:'wood',a:[x,0,0],b:[x,2000,0],width:100,height:100});
const beam={id:'B',kind:'beam',material:'wood',a:[0,2000,0],b:[2000,2000,0],width:45,height:95};
const parts=[post('A',0),post('C',2000),beam],model={parts},project={name:'Élévation à l’échelle - œuvre française',mode:'free',freeParts:parts,drawing:{automatic:false,dimensions:[{id:'DIM-1',type:'axes',aPart:'A',bPart:'C',axis:'x',view:'all',label:'Écart réglé',offset:200}]},paper:{views:['top','front'],scale:20,author:'Françoise Noël',date:'2026-10-20',revision:'B'}};
const extent=p=>Math.max(...p.points.map(p=>p[0]))-Math.min(...p.points.map(p=>p[0]));

test('paramètres papier déterministes, formats et bornes strictes',()=>{
 assert.deepEqual(normalizeSheetSettings(),{format:'A4',orientation:'landscape',margin:10,scale:'fit',title:'',author:'',date:'',revision:'A',views:['top','front','side'],automatic:true});
 const settings=normalizeSheetSettings({format:'A2',orientation:'bad',margin:100,scale:'1:25',date:'2026-02-31',views:['front','front','bad'],author:'A\u0000B'});
 assert.equal(settings.format,'A4');assert.equal(settings.margin,30);assert.equal(settings.scale,'fit');assert.equal(settings.date,'');assert.deepEqual(settings.views,['front']);assert.equal(settings.author,'AB');
 assert.equal(normalizeSheetSettings({margin:-5}).margin,5);assert.equal(normalizeSheetSettings({margin:'14.5',scale:'25',date:'2024-02-29'}).margin,14.5);assert.equal(normalizeSheetSettings({scale:'25'}).scale,25);assert.equal(normalizeSheetSettings({date:'2024-02-29'}).date,'2024-02-29');
});

test('échelle physique exacte 1:5 à 1:100, géométrie et quantités du projet inchangées',()=>{
 const before=JSON.stringify({project,model});
 for(const scale of [5,10,20,25,50,100]){const [sheet]=buildDrawingSheets(project,model,{views:['top'],scale,automatic:false});const timber=sheet.primitives.find(p=>p.partId==='B');near(extent(timber),2000/scale);near(timber.strokeWidth,.18);assert.equal(sheet.scale,scale);assert.equal(sheet.scaleLabel,`1:${scale}`);}
 assert.equal(JSON.stringify({project,model}),before);
});

test('A4/A3 portrait/paysage, marges et témoin vrai restent dans le cartouche',()=>{
 for(const [format,orientation,width,height] of [['A4','portrait',210,297],['A4','landscape',297,210],['A3','portrait',297,420],['A3','landscape',420,297]])for(const margin of [5,10,30]){
  const [sheet]=buildDrawingSheets(project,model,{views:['top'],format,orientation,margin,scale:'fit'});assert.equal(sheet.width,width);assert.equal(sheet.height,height);assert.ok(sheet.contentRect.x>=margin);assert.ok(sheet.contentRect.x+sheet.contentRect.width<=width-margin);assert.ok(sheet.contentRect.y+sheet.contentRect.height<height-margin-30);assert.equal(sheet.overflow,false);
  const witness=sheet.primitives.find(p=>p.role==='print-witness');near(witness.b[0]-witness.a[0],witness.value);assert.ok(witness.b[0]<=width-margin);assert.ok(sheet.primitives.some(p=>p.type==='text'&&p.text===`${witness.value} mm à 100 %`));
 }
});

test('débordement explicite à échelle fixe ; ajuster seulement sur demande',()=>{
 const [fixed]=buildDrawingSheets(project,model,{views:['top'],scale:5,format:'A4',orientation:'portrait'});assert.equal(fixed.overflow,true);assert.equal(fixed.scale,5);near(extent(fixed.primitives.find(p=>p.partId==='B')),400);assert.match(fixed.warnings[0],/DÉBORDEMENT.*coupé/);assert.ok(fixed.primitives.some(p=>p.role==='overflow'));assert.ok(fixed.primitives.filter(p=>p.role==='geometry').every(p=>p.clip));
 const [fit]=buildDrawingSheets(project,model,{views:['top'],scale:'fit',format:'A4',orientation:'portrait'});assert.equal(fit.overflow,false);assert.ok(fit.scale>5);assert.match(fit.scaleLabel,/Ajusté/);assert.ok(fit.contentBounds.width<=fit.contentRect.width+.001);assert.ok(fit.contentBounds.height<=fit.contentRect.height+.001);
});

test('cotes persistantes et automatiques papier indépendantes de l’affichage interactif',()=>{
 const [sheet]=buildDrawingSheets(project,model,{views:['top'],automatic:true});const dims=sheet.primitives.filter(p=>p.role==='dimension-label');assert.ok(dims.some(p=>p.dimensionId==='DIM-1'));assert.ok(dims.some(p=>p.dimensionId?.startsWith('AUTO-')));near(dims.find(p=>p.dimensionId==='DIM-1').value,2000);
 const [noAuto]=buildDrawingSheets(project,model,{views:['top'],automatic:false});assert.ok(noAuto.primitives.some(p=>p.dimensionId==='DIM-1'));assert.equal(noAuto.primitives.some(p=>p.dimensionId?.startsWith('AUTO-')),false);
 const broken={...project,drawing:{...project.drawing,dimensions:[{...project.drawing.dimensions[0],bPart:'missing'}]}};assert.ok(buildDrawingSheets(broken,model,{views:['top']})[0].warnings.some(w=>/manquante|absente|introuvable|supprimée/i.test(w)));
});

test('sélection multiple et vue technique vectorielle réutilisée sans DOM ni rastérisation',()=>{
 const extra={id:'section-X',title:'Coupe A-A',kind:'section',warnings:['Schéma de coupe géométrique.'],primitives:[{type:'line',a:[0,0],b:[1000,0],stroke:'#222',strokeWidth:.25,paperStyle:true,role:'hatch'},{type:'text',x:500,y:-100,text:'Coupe précise',fontSize:3,paperStyle:true,align:'middle'}]};
 const sheets=buildDrawingSheets(project,model,{views:['top','front','side'],extraSheets:[extra],selectedIds:['plan-front','section-X'],scale:10});assert.deepEqual(sheets.map(s=>s.id),['plan-front','section-X']);assert.deepEqual(sheets.map(s=>[s.number,s.total]),[[1,2],[2,2]]);
 const technical=sheets[1],hatch=technical.primitives.find(p=>p.role==='hatch');near(hatch.b[0]-hatch.a[0],100);near(hatch.strokeWidth,.25);assert.equal(technical.primitives.find(p=>p.text==='Coupe précise').fontSize,3);assert.match(technical.svg,/Coupe précise/);assert.doesNotMatch(technical.svg,/<image|data:image/);assert.equal(extra.primitives[0].b[0],1000);
 assert.deepEqual(buildDrawingSheets(project,model,{selectedIds:[]}),[]);
});

test('SVG aux dimensions mm, cartouche complet, HTML multifeuille et textes échappés',async()=>{
 const sheets=buildDrawingSheets({...project,name:'A < B & C'},model,{views:['top','front'],title:'Dossier à réviser'}),window=new Window();try{
  const xml=new window.DOMParser().parseFromString(sheetSVG(sheets[0]),'image/svg+xml');assert.equal(xml.querySelector('parsererror'),null);assert.equal(xml.documentElement.getAttribute('width'),'297mm');assert.equal(xml.documentElement.getAttribute('height'),'210mm');assert.equal(xml.documentElement.getAttribute('viewBox'),'0 0 297 210');assert.match(xml.documentElement.textContent,/Françoise Noël/);assert.match(xml.documentElement.textContent,/2026-10-20/);assert.match(xml.documentElement.textContent,/B · 1\/2/);assert.match(sheetSVG(sheets[0]),/A &lt; B &amp; C/);
  const html=printHTML(sheets);assert.equal((html.match(/class="paper-page /g)||[]).length,2);assert.match(html,/@page sheet0\{size:297mm 210mm;margin:0}/);assert.match(html,/100 %/);assert.match(html,/taille réelle/);assert.throws(()=>printHTML([]),/Sélectionnez/);
 }finally{await window.happyDOM.close()}
});

test('PDF vectoriel multipage réel, MediaBox exact, xref et longueurs de flux valides',()=>{
 const sheets=buildDrawingSheets(project,model,{views:['top','front','side']}),bytes=pdfBytes(sheets,{title:'Élévation réglée',author:'Françoise Noël'}),pdf=new TextDecoder().decode(bytes);
 assert.ok(bytes instanceof Uint8Array);assert.match(pdf,/^%PDF-1\.4/);assert.match(pdf,/\/Type \/Pages \/Kids .* \/Count 3/);assert.equal((pdf.match(/\/Type \/Page \/Parent/g)||[]).length,3);assert.match(pdf,/\/MediaBox \[0 0 841\.88976378 595\.27559055]/);assert.match(pdf,/\/BaseFont \/Helvetica \/Encoding \/WinAnsiEncoding/);assert.doesNotMatch(pdf,/\/Subtype \/Image/);assert.match(pdf,/\bcm\n/);assert.match(pdf,/\bTj ET/);
 const xref=Number(pdf.match(/startxref\n(\d+)/)[1]);assert.equal(pdf.slice(xref,xref+4),'xref');const entries=pdf.slice(xref).split('\n').slice(3).filter(line=>/^\d{10} 00000 n/.test(line));for(let i=0;i<entries.length;i++)assert.ok(pdf.slice(Number(entries[i].slice(0,10))).startsWith(`${i+1} 0 obj`));
 for(const match of pdf.matchAll(/<< \/Length (\d+) >>\nstream\n/g)){const start=match.index+match[0].length,end=pdf.indexOf('endstream',start);assert.equal(end-start,Number(match[1]));}
 assert.equal(pdfString('É à ç œ €'),'(\\311 \\340 \\347 \\234 \\200)');assert.ok(textWidth('Élévation',3)>0);assert.throws(()=>pdfBytes([]),/Sélectionnez/);
});


test('repères techniques papier distribués en colonnes sans recouvrement ni réduction de police',()=>{
 const primitives=[{type:'rect',x:0,y:0,width:2000,height:2000,fill:'#eee'}];
 for(let i=0;i<65;i++){const partId=`POTEAU-${i}`;primitives.push({type:'line',a:[i*15,1000],b:[1100,1000],stroke:'#222',paperStyle:true,role:'label-leader',partId},{type:'text',x:1100,y:1000,text:partId,fontSize:3,paperStyle:true,role:'part-label',partId});}
 const [sheet]=buildDrawingSheets(project,model,{views:[],extraSheets:[{id:'labels',title:'Repères',primitives}],scale:'fit'}),labels=sheet.primitives.filter(p=>p.role==='part-label');assert.equal(labels.length,65);assert.equal(sheet.overflow,false);assert.ok(labels.every(p=>p.fontSize===3));
 const boxes=labels.map(p=>{const w=textWidth(p.text,3);return {x:p.x-(p.align==='end'?w:0),y:p.y-3,w,h:3.6}});
 for(let i=0;i<boxes.length;i++)for(const b of boxes.slice(i+1)){const a=boxes[i];assert.ok(a.x+a.w<=b.x||b.x+b.w<=a.x||a.y+a.h<=b.y||b.y+b.h<=a.y,'Deux repères ne doivent pas se recouvrir');}
 assert.ok(sheet.primitives.findIndex(p=>p.role==='label-background')>sheet.primitives.map(p=>p.role).lastIndexOf('label-leader'),'Les fonds de texte masquent les lignes de rappel');
});
