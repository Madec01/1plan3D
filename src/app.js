import {openBatchExport} from './batch-export-ui.js';
import {fixingAdviceLinks,foundationHelpHTML} from './foundation-ui.js';
import {getObjectSnapCandidates} from './object-snapping.js';
import {previewAttachmentFixings} from './attachment-fixings.js';
import {attachmentFixingsPanel,readAttachmentFixingSelection,attachmentFixingPreviewHTML,ATTACHMENT_FIXINGS_STYLES} from './attachment-fixings-ui.js';
import {createFixedAttachment,configureBeamAttachment,configurePanelAttachment,detachAttachment,reconcileAttachments} from './attachments.js';
import {attachmentPanel,attachmentForm,adaptationForm,impactHTML} from './attachments-ui.js';
import {sceneSettingsPanel} from './precision-ui.js';
import {setupSceneChrome,sceneChromeStyles} from './scene-chrome.js';
import {workspaceStyles,activateInspectorTab,inspectorTabKeydown} from './workspace-ui.js';
import {normalizeSheetSettings,buildDrawingSheets,sheetSVG,printHTML,pdfBytes} from './paper-sheets.js';
import {normalizeTechnicalViewOptions,buildTechnicalView} from './technical-views.js';
import {paperSettingsPanel,paperWorkspace,technicalSettingsPanel,technicalWorkspace} from './dossier-ui.js';
import {setupOfflineUI,renderOfflinePanel} from './offline-ui.js';
import {PlanEditor} from './plan-editor.js';
import {setupMobileUI} from './mobile-ui.js';
import {normalizeDrawing,createDimension,measureDimension,getPlanDimensions,previewDimensionEdit,parseDimensionInput} from './plan-dimensions.js';
import {drawingPanel,createDimensionForm,editDimensionForm} from './plan-ui.js';
import {resolveAdaptiveGrid,normalizeAssistance} from './adaptive-placement.js';
import {betweenArrangement,betweenPreviewSVG,betweenMeasurements} from './between-placement.js';
import {canUngroupSelection,groundSelection,alignToReference,distributeSelection,groupSelection,ungroupSelection,connectedSelection,selectionGroupIds,keyboardNudge,separateCopiedGroups} from './context-actions.js';
import {CONTEXT_STYLES,contextMenuHTML,contextGroupForm,contextAlignForm,contextDistributeForm} from './context-ui.js';
import {panelResizeFrame,surfaceResizePatch} from './panel-resize.js';
import {placePartOnWorkplane} from './scene-interactions.js';
import {analyzeTimberCut,cuttingParts,timberCutSheetSVG,formatDimension} from './manufacturing.js';
import {fixingControls} from './fixings-ui.js';
import {getFoundationJoints,toManualFixingLayout,moveJointFixing,buildJointFixings} from './fixings.js';
import {workshopView,workshopAction,planTimber,planPanels,timberPlanView,panelPlanView,planMeshRolls,meshPlanView,timberQuickSetup,applyCommercialLengths,parseCommercialLengths,formatCutDimension,timberLengthsComparison} from './materials.js';
import {TEMPLATE_DEFINITIONS,parametricTemplates} from './templates.js';
import {projectionSVG,fabricationBody,jointSheetSVG,FABRICATION_STYLES} from './fabrication.js';
import {electricalView,electricalEventAction,electricalAction,electricalPlanSVG,electricalSingleLineSVG,electricalCSV} from './electrical.js';
import {createProjectLibrary,projectsView} from './project-library.js';
import { DEFAULT_PROJECT, RECIPES, SOURCES, normalizeProject, buildProject, calculateBOM, optimizeCuts, toCSV, convertToFree, makePart, duplicateParts, removeParts, addJoint, getJointDefaults } from './engine.js';
import { editorSidebar, editorInspector, entryCard, connectionsList, jointInspector, referencesHTML } from './editor-ui.js';
import { transformSelection, alignSelection, snapToPoint, createPreset, resizePartLength } from './editor-ops.js';
import { Viewport } from './viewport.js';
import {planeFromPart,workplaneDropDelta,workplaneFrame} from './workplane.js';
import {getPlacementSuggestions,setPartSpacing,measurePartSpacing,alignParts,computeAlignmentDelta,getPartBounds} from './placement.js';

const ICONS={cube:'M12 3 3 8v9l9 5 9-5V8L12 3Zm0 10v9M3 8l9 5 9-5M7 5.8l9 5',link:'m9 15 6-6M8 17l-1 1a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0m0 10a4 4 0 0 0 6 0l5-5a4 4 0 0 0-6-6l-1 1',cart:'M3 3h2l3 12h10l3-9H6M9 20h.01M18 20h.01',ruler:'m3 16 13-13 5 5L8 21 3 16Zm5-5 2 2m2-6 2 2m2-6 2 2',book:'M4 4h6l2 2 2-2h6v15h-6l-2 2-2-2H4V4Zm8 2v15',folder:'M3 7V5h6l2 2h10v13H3V7Zm0 3h18',save:'M4 3h14l3 3v15H3V3h1Zm3 0v6h10V3M7 21v-8h10v8',export:'M12 15V3m-4 4 4-4 4 4M4 13v7h16v-7',undo:'M9 5 4 10l5 5M4 10h10a6 6 0 0 1 6 6',redo:'m15 5 5 5-5 5m5-5H10a6 6 0 0 0-6 6',focus:'M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5M8 8h8v8H8z',mouse:'M12 2a6 6 0 0 1 6 6v8a6 6 0 0 1-12 0V8a6 6 0 0 1 6-6Zm0 0v7',grid:'M3 3h18v18H3V3Zm6 0v18m6-18v18M3 9h18M3 15h18',roof:'m2 12 10-9 10 9M5 10v11h14V10',anchor:'M12 3v17M8 6h8M4 13v3a8 5 0 0 0 16 0v-3M2 15l2-2 2 2m12 0 2-2 2 2',info:'M12 11v6m0-10h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',wood:'M3 7h18v10H3V7Zm4 0v10M10 9h7m-5 5h6',check:'m4 12 5 5L20 6',download:'M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5',file:'M5 2h9l5 5v15H5V2Zm9 0v6h5M8 12h8M8 16h8',image:'M3 3h18v18H3V3Zm0 14 6-6 5 5 3-3 4 4M15 7h.01',layers:'m12 3 10 5-10 5L2 8l10-5ZM2 12l10 5 10-5M2 16l10 5 10-5',plus:'M12 4v16M4 12h16',refresh:'M20 7v5h-5M4 17v-5h5M6 6a8 8 0 0 1 14 6M4 12a8 8 0 0 0 14 6'};
const icon=name=>`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${ICONS[name]||ICONS.cube}"/></svg>`;
const $=id=>document.getElementById(id), esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=(n,d=0)=>Number(n||0).toLocaleString('fr-FR',{maximumFractionDigits:d});const money=n=>Number(n||0).toLocaleString('fr-FR',{style:'currency',currency:'EUR',maximumFractionDigits:2});
const num=(key,label,min,max,step=1,unit='mm',p=project)=>`<label class="field"><span>${label}</span><div class="input-wrap"><input type="number" data-field="${key}" value="${p[key]}" min="${min}" max="${max}" step="${unit==='mm'?'any':step}" aria-label="${label}" required><span>${unit}</span></div></label>`;
const select=(key,label,opts,p=project)=>`<label class="field"><span>${label}</span><select data-field="${key}" aria-label="${label}">${opts.map(([v,l])=>`<option value="${v}"${p[key]===v?' selected':''}>${l}</option>`).join('')}</select></label>`;
const groundOpts=[['soil','Terre / jardin'],['concrete','Dalle en béton'],['pavers','Pavés ou gravier'],['unknown','Support à identifier']];
const foundations=[['concrete','Plot béton + pied'],['spike','Support à enfoncer'],['screw','Vis de fondation'],['plate_mechanical','Platine + ancrage mécanique'],['plate_chemical','Platine + scellement chimique']];
const joints=[['angle','Équerres'],['screw','Vissage direct'],['bolt','Boulonnage'],['hanger','Sabots'],['plate','Goussets'],['wood','Assemblage bois']];
const foundationInfo={concrete:['Plot béton + pied','Une fondation par poteau. Le volume et les sacs suivent les dimensions du plot.','Dimensions de fondation et pied à confirmer.'],spike:['Support à enfoncer','Une solution de jardin à comparer selon le sol et les efforts latéraux.','Usage et tenue au vent à vérifier.'],screw:['Vis de fondation','Un appui vissé avec tête et fixation du poteau.','Référence et capacité du sol à déterminer.'],plate_mechanical:['Platine + ancrage mécanique','Fixation rapportée dans un support en béton identifié.','Épaisseur, bords et ancrages à vérifier.'],plate_chemical:['Platine + scellement chimique','Tiges, résine, écrous et rondelles quantifiés ensemble.','Consommation et système compatibles à confirmer.']};
let project=normalizeProject(DEFAULT_PROJECT);let restored=false;try{const raw=localStorage.getItem('atelier.project.v4')||localStorage.getItem('atelier.project.v1');if(raw){project=normalizeProject(JSON.parse(raw));restored=true}}catch{};
const projectLibrary=createProjectLibrary(localStorage);
let model,bom,viewport=null,page='design',selectedId=null,undo=[],redo=[],shoppingFilter='',onlyMissing=false,wallSupport='concrete',lastSavedAt='',storageAvailable=true;
let dossierTab='overview',offlineUI=null;
let contextMenu=null,contextReturnFocus=null,linkPending=null,keyboardSession=null,sceneDistance=null,isolatedIds=null,soloSelectionId=null;
let workspaceMode='scene',planEditor=null,mobileUI=null,multiSelect=false,touchMode='pan',dimensionEditing=null,dimensionPreview=null,sceneInteractionPending=false;
let sceneChrome=null;
let inspectorTab='piece',attachmentImpact=null,attachmentProposal=null;
let placementPending=null;let sceneFocused=false;let cutSelection=null;let sceneView='iso';
let selectedFixing=null;let selectedIds=[],selectedJoint=null,editorFilter='',activeTool='select',navigationMode='free';try{navigationMode=localStorage.getItem('atelier.navigation.v1')==='orbit'?'orbit':'free'}catch{}
const changes=()=>JSON.stringify(project);function toast(message){$('toast').textContent=message;$('toast').classList.add('visible');clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast')?.classList.remove('visible'),3600)}
function persist(){
 let activeSaved=false,historySaved=false;
 try{localStorage.setItem('atelier.project.v4',changes());activeSaved=true}catch{}
 try{projectLibrary.save(project);historySaved=true}catch{}
 storageAvailable=activeSaved||historySaved;$('save-status').textContent=activeSaved&&historySaved?'Copie navigateur à jour':activeSaved?'Projet à jour · historique indisponible':historySaved?'Projet conservé dans Mes projets':'Enregistrez votre fichier';
 if(page==='projects')renderContent();
}
function sceneSignature(p){const {name,notes,prices,stock,purchased,workshop,electrical,manufacturing,drawing,paper,technical,objectSnap,...geometry}=p;return JSON.stringify(geometry)}
function commit(mutator,preserveChecks=false,coalesce=false,options={}){
 const snapshot=changes(),previous=new Map((bom||[]).map(r=>[r.id,r]));
 try{
  let draft=structuredClone(project);const result=mutator(draft);if(result&&typeof result==='object'&&result.version)draft=result;
  draft=normalizeProject(draft);
  if(!options.skipAttachments&&project.mode==='free'&&draft.mode==='free'){
   const reconciled=reconcileAttachments(project,draft);draft=normalizeProject(reconciled.project);
   if(reconciled.needsConfirmation&&!options.approved){
    attachmentImpact={snapshot,draft,preserveChecks,coalesce,changes:reconciled.changes};
    queueMicrotask(()=>showAttachmentImpact());return false;
   }
  }
  if(!preserveChecks)for(const row of calculateBOM(draft)){const old=previous.get(row.id);if(draft.purchased[row.id]&&(!old||row.spec!==old.spec||row.purchaseQty>old.purchaseQty+1e-6))delete draft.purchased[row.id]}
  if(!coalesce){undo.push(snapshot);if(undo.length>80)undo.shift();}redo=[];
  const sceneChanged=sceneSignature(project)!==sceneSignature(draft);if(sceneChanged)attachmentProposal=null;
  project=draft;rebuild(sceneChanged);persist();return true;
 }catch(error){toast(error.message||'Modification impossible : le projet a été conservé.');return false}
}
function rebuild(updateScene=true){model=buildProject(project);bom=calculateBOM(project,model);selectedIds=selectedIds.filter(id=>model.parts.some(p=>p.id===id));selectedId=selectedIds[0]||null;if(selectedJoint&&!allFixingJoints().some(j=>j.id===selectedJoint))selectedJoint=null;if(updateScene)viewport?.set(model,project);else if(viewport){viewport.project=project;viewport.model=model;}if(!viewport){const fallback=document.querySelector('.fallback');if(fallback)fallback.innerHTML='<p>3D indisponible sur ce navigateur · Plan de dessus</p>'+planSVG();}$('project-name').textContent=project.name;if($('project-title-input')&&document.activeElement!==$('project-title-input'))$('project-title-input').value=project.name;render();renderInspector()}
function costLabel(){const needed=bom.filter(r=>r.toBuy>0),priced=needed.filter(r=>r.priced);return needed.length&&!priced.length?'À chiffrer':money(bom.reduce((s,r)=>s+r.total,0))+(priced.length<needed.length?' · partiel':'')}
function render(){document.querySelectorAll('[data-page]').forEach(b=>b.classList.toggle('active',b.closest('.rail')?b.dataset.page===primaryPage(page):b.dataset.page===page));$('undo').disabled=!undo.length;$('redo').disabled=!redo.length;$('cart-count').textContent=bom.filter(r=>r.toBuy>0&&!project.purchased[r.id]).length;$('warning-count').textContent=model.warnings.length;$('sidebar').innerHTML=sidePanel();syncSelections($('sidebar'));const scene=['design','connections'].includes(page);$('scene-area').classList.toggle('hidden',!scene);$('summary-strip').classList.toggle('hidden',!scene);$('workspace-content').classList.toggle('hidden',scene);const titles={design:['VOTRE PROJET PREND FORME','Dessinez. Ajustez. Fabriquez.'],connections:['CHAQUE LIAISON COMPTE','Des pièces bien assemblées.'],shopping:['LE BON MATÉRIEL, AU BON MOMENT','Tout pour passer à l’atelier.'],cuts:['CHAQUE CHUTE A DE LA VALEUR','Préparez vos découpes.'],guide:['UN PROJET BIEN PRÉPARÉ','Les repères de votre atelier.'],workshop:['VOTRE STOCK A DE LA VALEUR','Matériaux et chutes disponibles.'],templates:['DES BASES À PERSONNALISER','Choisissez votre prochain projet.'],fabrication:['DE L’ÉCRAN À L’ATELIER','Votre dossier de fabrication.'],electrical:['VOTRE INSTALLATION DESSINÉE','Plans et circuits électriques.'],projects:['RETROUVEZ VOS IDÉES','Vos projets, au même endroit.']};$('space-kicker').textContent=titles[page][0];$('space-title').textContent=titles[page][1];const total=bom.reduce((s,r)=>s+r.total,0);const woods=model.parts.filter(p=>p.material==='wood');$('summary-strip').innerHTML=`<div class="stat"><span class="stat-icon">${icon('ruler')}</span><div><small>Emprise rectangulaire</small><strong>${fmt((model.bounds?.width??project.width)*(model.bounds?.depth??project.depth)/1e6,1)}<span>m²</span></strong></div></div><div class="stat"><span class="stat-icon">${icon('wood')}</span><div><small>Pièces de bois</small><strong>${woods.length}<span>${fmt(woods.reduce((s,p)=>s+p.length,0)/1000,1)} m au total</span></strong></div></div><div class="stat"><span class="stat-icon">${icon('cart')}</span><div><small>Budget · selon vos prix</small><strong class="budget-value">${costLabel()}</strong></div></div>`;
  if(!scene){renderContent();viewport?.previewPlacement([],null);}$('editor-toolbar').classList.toggle('hidden',page!=='design'||project.mode!=='free');document.body.classList.toggle('assembly-mode',page==='connections');renderSceneSettings();renderAttachmentStatus();$('space-title').textContent=({design:'Concevoir',connections:'Assembler',cuts:'Préparer · Débit',shopping:'Préparer · Achats',workshop:'Préparer · Stock',fabrication:'Dossier',templates:'Nouveau projet',projects:'Mes projets',electrical:'Module électricité',guide:'Aide & sources'})[page];updateWorkspaceNavigation();$('scene-sub').textContent=project.mode==='free'?'Pièces libres · coordonnées en mm':'Cliquez sur une pièce pour l’explorer';document.querySelectorAll('[data-tool]').forEach(b=>b.classList.toggle('active',b.dataset.tool===activeTool));hydrateIcons();viewport?.resize();refreshDrawing();refreshMobile();}
function sidePanel(){const top=(title,subtitle)=>`<span class="eyebrow">ATELIER / ${page==='design'?'01':page==='connections'?'02':page==='shopping'?'03':page==='cuts'?'04':'05'}</span><h2 class="sidebar-title">${title}</h2><p class="sidebar-intro">${subtitle}</p>`;
  if(['workshop','templates','fabrication','electrical','projects'].includes(page))return extraSidebar();
  if(page==='design'&&project.mode==='free')return (workspaceMode==='plan'?drawingPanel(project,model,selectedIds):'')+editorSidebar(project,model,selectedIds,editorFilter);
  if(page==='design')return (workspaceMode==='plan'?drawingPanel(project,model,selectedIds):'')+entryCard()+top('Votre enclos','Un modèle de départ. Vos dimensions, vos matériaux, vos choix.')+`<div class="project-type">${icon('roof')}<div><strong>Enclos avec portillon</strong><small>Modèle paramétrique · bois & grillage</small></div></div><label class="field"><span>Nom du projet</span><input data-field="name" type="text" value="${esc(project.name)}" maxlength="80"></label><div class="section-title"><span>01</span> DIMENSIONS HORS TOUT</div>${num('width','Largeur',1200,15000,50)}${num('depth','Profondeur',1000,15000,50)}${num('height','Hauteur avant',1000,3500,50)}<div class="field-grid">${num('maxSpan','Écart max. entre poteaux',500,3000,50)}${num('postSection','Section poteaux',45,200,5)}</div><div class="section-title"><span>02</span> BOIS & STRUCTURE</div>${select('material','Essence / aspect',[['pin','Pin'],['douglas','Douglas'],['chene','Chêne']])}<div class="field-grid">${num('beamWidth','Largeur chevrons',25,150,5)}${num('beamHeight','Hauteur chevrons',35,250,5)}</div><label class="toggle-row">Diagonales de contreventement<input type="checkbox" data-field="brace" ${project.brace?'checked':''}></label><div class="section-title"><span>03</span> PORTILLON & TOITURE</div><div class="field-grid">${num('gateWidth','Passage portillon',500,1800,50)}${num('gateHeight','Hauteur portillon',800,2500,50)}</div><label class="field"><span>Position du portillon<small>Sur la face avant</small></span><input type="range" data-field="gatePosition" min="0.15" max="0.85" step="0.05" value="${project.gatePosition}"><div class="range-labels"><span>À gauche</span><span>À droite</span></div></label>${select('roof','Couverture',[['none','Sans couverture'],['mesh','Grillage'],['solid','Panneaux de couverture']])}${project.roof!=='none'?num('roofRise','Surélévation arrière',0,800,25):''}<p class="help-text">Dimensions et sections d’exemple : le calcul prépare les quantités, sans valider la résistance.</p><div class="divider"></div><button class="btn full" data-action="go-connections">${icon('link')}Choisir mes fixations</button>`;
  if(page==='connections')return fixingAdviceLinks()+'<details class="side-details" id="foundation-settings"><summary>Réglages des plots, ancrages et liaisons</summary>'+top('Fixations & appuis','Choisissez une famille de montage, puis ajustez ses hypothèses.')+`${project.mode==='free'?'<div class="notice green">Ces réglages définissent les prochains poteaux ajoutés. Vous pouvez aussi les appliquer à tous les poteaux existants.</div><button class="btn full" data-editor="global-bases">Appliquer aux poteaux existants</button>':''}<div class="section-title"><span>01</span> ANCRAGES AU SOL</div>${select('ground','Support principal',groundOpts)}${foundations.map(([id])=>`<button class="recipe-card ${project.foundation===id?'selected':''}" data-foundation="${id}"><strong>${foundationInfo[id][0]}</strong><p>${foundationInfo[id][1]}</p><small>${RECIPES.find(r=>r.family==='foundation'&&r.id===id)?.supports.includes(project.ground)?foundationInfo[id][2]:'Support choisi à vérifier pour cette solution.'}</small></button>`).join('')}<p class="help-text">Un appui différent ? Cliquez sur un poteau en 3D pour modifier uniquement ce poteau.</p><label class="field"><span>Modifier un poteau précis</span><select id="post-picker"><option value="">Choisir un repère…</option>${model.posts.map(p=>`<option value="${esc(p.id)}">${esc(p.id)}</option>`).join('')}</select></label><details class="side-details" open><summary>Paramètres de quantification</summary><div class="field-grid">${num('footingWidth','Largeur du plot',150,1200,25)}${num('footingDepth','Profondeur du plot',150,1500,25)}</div>${num('concreteYield','Rendement du sac de béton',1,50,.5,'L/sac')}${num('anchorsPerBase','Ancrages par platine',1,8,1,'pces')}<div class="field-grid">${num('resinYield','Résine par point',1,200,1,'ml')}${num('resinCartridge','Cartouche',100,1000,10,'ml')}</div></details><div class="section-title"><span>02</span> LIAISONS ENTRE BOIS</div>${select('joint','Méthode des liaisons',joints)}<button class="btn full small" data-action="joint-detail">${icon('link')}Voir les hypothèses de montage</button><div class="notice" style="margin-top:14px">Les quantités des méthodes d’assemblage sont modifiables. Les références, positions et résistances des fixations sont à confirmer.</div><div class="divider"></div><button class="btn full" data-action="wall-helper">${icon('layers')}Assistant de fixation au mur</button>`+'</details>'+attachmentFixingsPanel(project)+connectionsList(project,model);
  if(page==='shopping'){const done=bom.filter(r=>project.purchased[r.id]).length;return top('Votre liste d’achats','Le besoin du projet, votre stock et ce qu’il reste à acheter.')+`<div class="quick-number"><strong>${bom.filter(r=>r.toBuy>0&&!project.purchased[r.id]).length}</strong><span>références à prévoir</span></div><div class="progress-row"><span>Références cochées</span><span>${done} / ${bom.length}</span></div><div class="progress-track"><span style="width:${100*done/Math.max(bom.length,1)}%"></span></div><div class="section-title">VOS HYPOTHÈSES</div>${num('margin','Réserve sur consommables',0,30,1,'%')}<div class="field-grid">${num('meshRollWidth','Largeur rouleau',500,2500,50)}${num('meshRollLength','Longueur rouleau',5000,50000,1000)}</div>${num('meshOverlap','Recouvrement grillage',0,200,10)}<div class="notice green">Le bois est calculé à partir du débit. La réserve ne lui est pas appliquée une seconde fois.</div><div class="divider"></div><p class="help-text">Renseignez le stock en unités indiquées. Un achat est décoché si les quantités à acheter augmentent. Renseignez vos prix par conditionnement d’achat. Le budget reste partiel tant qu’il manque des prix.</p><button class="btn full" style="margin-top:14px" data-action="csv">${icon('download')}Exporter en CSV</button><button class="btn full subtle" style="margin-top:7px" data-action="print">${icon('file')}Imprimer / PDF</button>`}
  if(page==='cuts')return top('Plan de débit','Répartissez vos pièces dans les longueurs disponibles.')+`${project.workshop.useTimberStock?'<p class="notice green">Les formats cochés et votre stock définissent les longueurs disponibles.</p>':num('woodStockLength','Longueur commerciale',1500,6000,100)}${num('kerf','Largeur du trait de scie',1,10,.5)}<div class="notice green">Chaque barre garde sa section. Les pièces longues impossibles à découper sont signalées.</div><div class="section-title">COMMENT LIRE LE PLAN</div><p class="help-text">Chaque rectangle coloré est une pièce. La zone claire correspond à une chute. Le trait de scie est réservé entre les coupes.</p><p class="help-text">Répartition indicative par longueurs. Les coupes biaises, défauts du bois et dressages d’extrémité peuvent nécessiter une surlongueur supplémentaire.</p><div class="divider"></div><button class="btn full" data-action="cut-csv">${icon('download')}Liste de débit CSV</button><button class="btn full subtle" style="margin-top:7px" data-action="print">${icon('file')}Dossier de fabrication</button>`;
  return top('Votre carnet d’atelier','Les repères pour préparer votre première fabrication.')+`<div class="notice green"><strong>V0.27 de test · Atelier</strong><br>Pièces libres, appuis, liaisons individuelles, murs, achats et débit dans un fichier autonome.</div><div class="section-title">ENREGISTREMENT</div><p class="help-text">Une copie est conservée dans ce navigateur quand il l’autorise. Téléchargez votre fichier projet pour le garder ou le transmettre.</p><button class="btn full" style="margin-top:13px" data-action="save">${icon('save')}Enregistrer le projet</button><button class="btn full subtle" data-editor="restore-import">Restaurer avant le dernier import</button><div class="section-title">NOTES DU PROJET</div><textarea data-field="notes" placeholder="Mesures à vérifier, références magasin, idées…">${esc(project.notes)}</textarea><div class="divider"></div><button class="btn full subtle" data-action="reset">${icon('refresh')}Repartir du modèle d’exemple</button>`;
}
function renderContent(){const content=$('workspace-content');if(extraContent(content))return;if(page==='shopping')content.innerHTML=shopping();if(page==='cuts')content.innerHTML=cutsView()+meshPlanView(planMeshRolls(model.parts,project));if(page==='guide')content.innerHTML=guide();}
function shopping(){const rows=bom.filter(r=>(!onlyMissing||(r.toBuy>0&&!project.purchased[r.id]))&&`${r.label} ${r.spec} ${r.category}`.toLowerCase().includes(shoppingFilter.toLowerCase()));const total=bom.reduce((s,r)=>s+r.total,0);return `<div class="list-toolbar"><input type="search" id="shopping-search" value="${esc(shoppingFilter)}" placeholder="Rechercher un matériau, une fixation…" aria-label="Rechercher dans les achats"><button class="btn ${onlyMissing?'primary':''}" data-action="toggle-missing">${icon('cart')}À acheter seulement</button><button class="btn" data-action="csv">${icon('download')}CSV</button></div><div class="table-wrap"><table><thead><tr><th aria-label="Acheté">✓</th><th>MATÉRIAU / RÉFÉRENCE</th><th>BESOIN + RÉSERVE</th><th>MON STOCK</th><th>À ACHETER</th><th>PRIX / LOT</th><th>TOTAL</th></tr></thead><tbody>${rows.map(r=>`<tr class="${project.purchased[r.id]?'purchased':''}"><td><input type="checkbox" data-purchased="${esc(r.id)}" ${project.purchased[r.id]?'checked':''} aria-label="${esc(r.label)} acheté"></td><td><strong>${esc(r.label)}</strong><small>${esc(r.spec||r.category)}</small>${r.needsQuote?'<span class="tag">Longueur spéciale · à chiffrer</span>':''}${r.needsReview?'<span class="tag">Calepinage à revoir</span>':''}<button class="details-link" data-bom-detail="${esc(r.id)}">Détail du calcul</button></td><td class="amount">${fmt(r.required,2)}${r.marginQty>0?` + ${fmt(r.marginQty,2)}`:''}<small>${esc(r.unit)}</small></td><td><input class="qty-input" type="number" min="0" step="1" data-stock="${esc(r.id)}" ${r.id.startsWith('workshop-')?'disabled title="Stock déjà affecté par le plan de débit ; modifier dans Stock."':''} value="${r.stock||0}" aria-label="Stock ${esc(r.label)}"></td><td><strong>${fmt(r.packs)} ${r.packSize>1?'lot'+(r.packs>1?'s':''):'unité'+(r.packs>1?'s':'')}</strong><small>${r.packSize>1?`${fmt(r.packSize,2)} ${esc(r.unit)} / lot`:`${fmt(r.toBuy,2)} ${esc(r.unit)} manquant${r.toBuy>1?'s':''}`}</small></td><td><input class="qty-input" type="number" min="0" step="0.01" data-price="${esc(r.id)}" value="${r.priced?Number(r.unitPrice).toFixed(2):''}" placeholder="À saisir" aria-label="Prix du lot ${esc(r.label)}"></td><td class="amount">${r.priced?money(r.total):'—'}</td></tr>`).join('')||'<tr><td colspan="7" class="empty">Aucun élément ne correspond à ce filtre.</td></tr>'}</tbody></table></div><div class="inline-total"><small>Prix renseignés par vous · Hors livraison et outillage</small><div><small>Budget des quantités à acheter</small><br><strong>${costLabel()}</strong></div></div><div class="notice">Les quantités suivent les montages renseignés. Confirmez les références et les hypothèses de fixation avant l’achat.</div>`}
function cutResult(){if(project.workshop.useTimberStock){const plan=planTimber(preparedParts(),project.workshop,{kerf:project.kerf,defaultSpecies:project.material});return {bars:plan.boards.map(b=>({...b,stockLength:b.length,waste:b.remaining})),unplaced:plan.missing,kerf:project.kerf}}return optimizeCuts(preparedParts().filter(p=>p.material==='wood'),[project.woodStockLength],project.kerf)}
function cutsView(){
 const parts=preparedParts(),precision=project.manufacturing.precision,setup=timberQuickSetup(project,{...model,parts},{precision});
 const incomplete=parts.filter(p=>p.material==='wood'&&p.kind!=='panel'&&p.cutPreparation?.status!=='defined');
 return setup+(incomplete.length?`<p class="notice">${incomplete.length} pièce(s) restent calculées sur leur longueur d’axe. Définissez les coupes et surlongueurs dans <button class="text-button" data-page="fabrication">Dossier</button> pour obtenir leur brut de préparation.</p>`:'')+(project.workshop.useTimberStock||project.workshop.usePanelStock?advancedCuts():simpleCuts());
}
function simpleCuts(){
 const result=cutResult(),bars=result.bars||result.groups?.flatMap(g=>g.bars)||[],impossible=result.unplaced||result.impossible||[],dim=value=>formatCutDimension(value,project.manufacturing.precision);
 return `<div class="content-card"><h2>${bars.length} barre${bars.length>1?'s':''} à préparer</h2><p>Longueur disponible : ${dim(project.woodStockLength)} mm · Trait de scie : ${project.kerf} mm.</p></div>${impossible.length?`<div class="error-state">${impossible.length} pièce(s) dépassent le format disponible : ${impossible.map(p=>`${esc(p.id||p.partId)} · ${dim(p.length)} mm`).join(', ')}. Choisissez une longueur supérieure.</div>`:''}${bars.map((bar,i)=>{const pieces=bar.pieces||bar.cuts||bar.parts||[],length=bar.stockLength||bar.length||project.woodStockLength,rest=bar.remaining??bar.waste??length-pieces.reduce((sum,p)=>sum+p.length,0);return `<div class="cut-group"><div class="cut-header"><strong>Barre ${String(i+1).padStart(2,'0')} <span class="tag">${esc(bar.section||pieces[0]?.section||'Bois')}</span></strong><span>${dim(length)} mm</span></div><div class="cut-bar">${pieces.map(p=>`<div class="cut-segment" title="${esc(p.id||p.partId)} — ${dim(p.length)} mm" style="width:${p.length/length*100}%">${esc(p.id||p.partId)} · ${dim(p.length)}</div>`).join('')}<div class="cut-rest">${dim(rest)} mm</div></div><div class="cut-details">${pieces.map(p=>`${esc(p.id||p.partId)} : ${dim(p.length)} mm`).join(' · ')}<br>Chute : ${dim(rest)} mm</div></div>`}).join('')}<div class="table-wrap"><table><thead><tr><th>REPÈRE</th><th>PIÈCE</th><th>SECTION</th><th>LONGUEUR AU DÉBIT</th><th>PRÉPARATION</th></tr></thead><tbody>${preparedParts().filter(p=>p.material==='wood'&&p.kind!=='panel').map(p=>`<tr><td>${esc(p.id)}</td><td>${esc(p.label)}</td><td>${esc(p.section)}</td><td>${dim(p.length)} mm</td><td>${p.cutPreparation?.status==='defined'?'Brut avec surlongueur':'Axe · coupes à définir'}</td></tr>`).join('')}</tbody></table></div>`;
}
function guide(){return fixingAdviceLinks()+`<div class="content-card"><span class="eyebrow">V0.27 · ATTACHES ET ADAPTATION</span><h2>Construire avec des repères qui suivent.</h2><p>La liste des pièces reste à gauche. Aimant / pose rassemble les aides près de la scène ; sur téléphone, ouvrez Aides. Les propriétés sont réparties entre Pièce et Position. Le nom du projet se modifie directement dans l’en-tête.</p><p>Après un accrochage, Attacher conserve la position relative au support. Vous pouvez aussi utiliser le clic droit. Une attache ne crée aucun achat ; Assembler propose les fixations compatibles à examiner puis confirmer.</p><p>Pour adapter un chevron, sélectionnez-le seul et choisissez Adapter aux supports. Définissez les deux extrémités, puis éventuellement les poteaux intermédiaires. Ces derniers ne pilotent pas la longueur. Pour un panneau, définissez un support pour chacun des quatre coins. Une forme non plane est signalée.</p><p>Les dimensions restent fixes par défaut. L’adaptation demande une activation explicite puis un aperçu des longueurs, surfaces et achats lors des modifications. Une attache en conflit reste signalée ; Détacher conserve la pièce en place. Supprimer un support libère les pièces qui lui étaient attachées. Annuler restaure toute l’opération.</p></div>`+`<div class="content-card"><span class="eyebrow">V0.19 · CONSTRUCTION DIRECTE</span><h2>Ajustez depuis la scène.</h2><p>Un clic droit court ouvre les actions de la sélection : lier deux pièces, grouper, poser au sol, aligner, répartir ou isoler. Sur téléphone, le bouton Actions ouvre le même menu. Un clic droit glissé continue à naviguer.</p><p>Approchez un chevron d’un autre bois : les faces proches, centres et bouts s’accrochent. La grille locale reste invisible ; son pas se règle dans les aides. Bleu : pièce déplacée, orange : face cible, vert : sélection. Le libellé indique le contact obtenu. Maintenez Alt pour conserver un décalage ou un débord voulu. L’accrochage seul conserve les dimensions et l’orientation. Les attaches et l’adaptation se choisissent séparément.</p><p>Sélectionnez un grillage, un panneau ou un mur seul : les poignées apparaissent directement. Tirez une poignée orange sur un côté ou bleue sur un coin ; l’opposé reste fixe. Agrandir (S) reste disponible. Un second clic isole une pièce de son groupe. Échap annule ; sur téléphone, Valider applique l’aperçu. Les achats sont recalculés après validation.</p><p>Flèches : déplacer dans le plan affiché ; Page ↑/↓ : hauteur ; Maj ×10, Alt ÷10. Une pression maintenue se défait en une seule annulation. G pose la sélection au sol ; L prépare une liaison. Un premier clic sélectionne toutes les pièces reliées et groupées. Un nouveau clic sur une pièce sélectionnée la choisit seule, sans enlever ses liaisons. Alt + clic permet aussi de la choisir directement. Dégrouper est accessible dans le clic droit, Actions et les propriétés : les pièces redeviennent sélectionnables séparément ; les fixations et attaches sont conservées. Grouper rétablit la sélection commune.</p><p>Avec deux bois sélectionnés, cliquez sur leur cote en 3D pour saisir un écart exact, par exemple 0,5 m. La référence reste fixe. La texture des matériaux peut se masquer dans Afficher.</p></div>`+`<div class="content-card"><span class="eyebrow">V0.18 · PLANS ET TÉLÉPHONE</span><h2>Des plans pour l’atelier.</h2><p>Dans Dossier → Plans à imprimer, choisissez A4 ou A3, les vues et une échelle. Le PDF est vectoriel ; imprimez à 100 % pour conserver l’échelle. Un dessin trop grand est signalé au lieu d’être réduit silencieusement.</p><p>Coupes & montage permet de couper la vue, d’écarter les groupes et de composer vos étapes à partir des pièces sélectionnées. Ces vues ne modifient pas votre construction.</p><button class="btn" data-dossier-tab="paper">Préparer mes plans</button> <button class="btn" data-open-offline>Installation et hors connexion</button></div>`+`<div class="content-card"><span class="eyebrow">PRISE EN MAIN · CONSTRUCTION LIBRE</span><h2>Votre premier essai en 3 minutes.</h2><p>1. Dans Concevoir, cliquez sur « Modifier les pièces librement ».<br>2. Cliquez sur un poteau dans la vue ou la liste. Modifiez ses cotes, puis appliquez.<br>3. Sélectionnez plusieurs pièces avec les cases ou Maj + clic ; déplacez, dupliquez ou alignez.<br>4. Reliez deux pièces et comparez les solutions dans Assembler.<br>5. Ouvrez Préparer → Achats pour voir les quantités mises à jour.</p><p>Navigation libre : glisser pour se déplacer, clic droit glissé pour tourner autour du point visé, molette pour zoomer vers la souris. Les poignées colorées restent dédiées aux pièces. Le mode Orbite et les vues orthographiques restent disponibles.</p><p>Ajout : choisissez un élément, puis cliquez sur le plan de travail pour le poser ; Échap annule. Mesurer permet de prendre deux points sur les surfaces ou le plan. Pendant un déplacement, Alt suspend l’accrochage.</p><p>Précision : choisissez un pas de 0,1 à 1 000 mm, utilisez les petits déplacements ou renseignez les coordonnées. Après placement, les contacts proches sont proposés avec aperçu. Les appuis intermédiaires sont reconnus pour les chevrons horizontaux ; les faces non parallèles demandent un réglage manuel. Avec deux bois sélectionnés, réglez l’espace libre ou la distance entre axes, ou alignez leurs faces. Le plan de travail se règle dans Aimant / pose, ou Aides sur téléphone.</p><p>Raccourcis : F plein cadre, M mesure, Échap annulation, V sélection, W déplacement, R rotation, Ctrl+D duplication, Suppr suppression, Ctrl+Z annulation. La rotation par poignée s’effectue autour de Y ; les rotations X/Z sont accessibles dans les réglages de la pièce.</p></div>`+`<div class="content-card"><span class="eyebrow">BIENVENUE DANS VOTRE ATELIER</span><h2>De l’idée aux pièces à préparer.</h2><div class="step"><span>1</span><p><strong>Choisissez votre départ.</strong> Réglez l’enclos, convertissez-le en pièces libres ou démarrez depuis une scène vide.</p></div><div class="step"><span>2</span><p><strong>Assemblez les pièces.</strong> Ajoutez, déplacez ou dupliquez. Sélectionnez deux pièces pour créer une liaison et personnaliser ses composants.</p></div><div class="step"><span>3</span><p><strong>Préparez les achats.</strong> Déduisez votre stock, ajustez les prix et cochez les références déjà achetées.</p></div><div class="step"><span>4</span><p><strong>Gardez votre projet.</strong> Enregistrez le fichier JSON pour le rouvrir. Exportez le dossier, la checklist et les plans.</p></div></div><div class="guide-grid"><div class="content-card"><h2>Ce que calcule cette version</h2><p>Pièces de bois, longueurs de débit, bandes de grillage, appuis, volumes de béton et consommables des recettes choisies. Les achats sont arrondis au conditionnement.</p><p style="margin-top:12px">Vous pouvez conserver le modèle d’enclos ou passer en construction libre. Les recettes génériques ne constituent pas un dimensionnement de résistance.</p></div><div class="content-card"><h2>La suite de l’atelier</h2><p>Les fixations se placent automatiquement ou manuellement dans Fixer. Modèles propose pergola, clôture et portes. Stock gère les références et chutes, Dossier réunit les plans, Élec. prépare les circuits et Projets conserve vos variantes. Les attaches fixes et l’adaptation choisie sont disponibles. Un solveur général de contraintes, les connexions aux catalogues marchands et les assemblages usinés restent hors de cette version.</p><p style="margin-top:12px">Les sources ci-dessous aident à confirmer le montage exact retenu pour votre réalisation.</p></div></div><div class="content-card" style="margin-top:16px"><h2>Documentation & fabricants</h2>${sourcesHTML()}<p class="help-text">Consultation des documents : octobre 2026. Les quantités génériques de l’application ne sont pas des prescriptions des fabricants cités.</p></div>`}
function sourcesHTML(){return referencesHTML()+`<a class="source-link" href="https://www.simpson.fr/fr-FR/fastener-designer" target="_blank" rel="noopener">Simpson · Fastener Designer ↗<small>Choix et calcul d’assemblages bois.</small></a><a class="source-link" href="https://www.simpson.fr/fr-FR/logiciels/connector-selector" target="_blank" rel="noopener">Simpson · Connector Selector ↗<small>Sabots, équerres et pieds de poteaux.</small></a><a class="source-link" href="https://www.fischer.fr/fr-fr/produits/fixations-chimiques/scellements-par-injection/scellement-par-injection-fis-v-plus" target="_blank" rel="noopener">Fischer · Systèmes de scellement ↗<small>Supports, composants compatibles et documentation technique.</small></a><a class="source-link" href="https://weasyfix.eu/faq/" target="_blank" rel="noopener">Weasyfix · Fondations vissées ↗<small>Sols, connecteurs et conditions d’utilisation.</small></a><a class="source-link" href="https://www.eota.eu/etassessments" target="_blank" rel="noopener">EOTA · Évaluations techniques européennes ↗<small>Vérifier le domaine couvert par une évaluation produit.</small></a>`}
function hydrateIcons(){document.querySelectorAll('[data-icon]').forEach(e=>{e.innerHTML=icon(e.dataset.icon)})}
function renderInspectorContent(){if(selectedJoint){const joint=allFixingJoints().find(j=>j.id===selectedJoint);const html=(selectedJoint.startsWith('BASE-')?`<div class="inspector-head"><strong>Ancrages de ${esc(joint?.aPart)}</strong><button data-action="close-inspector">×</button></div><p class="help-text">Le nombre de points suit le réglage « Ancrages par platine ».</p>`:jointInspector(project,model,selectedJoint))+fixingControls(joint,model,selectedFixing);$('inspector').innerHTML=html;$('inspector').classList.toggle('hidden',!html);if(selectedFixing)viewport?.selectFixing(selectedJoint,selectedFixing);else viewport?.select([]);return}if(project.mode==='free'){const html=page==='connections'?assemblySelectionInspector()+(project.freeParts.some(p=>p.kind==='post'&&selectedIds.includes(p.id))?'<button class="btn full" data-action="foundation-helper">Conseils : plots béton & ancrages</button>':''):editorInspector(project,model,selectedIds,{tab:inspectorTab})+attachmentPanel(project,selectedIds)+baseFixingButtons(selectedIds);$('inspector').innerHTML=html;$('inspector').classList.toggle('hidden',!html);viewport?.select(selectedIds);return}const part=model.parts.find(p=>p.id===selectedId);viewport?.select(selectedId);if(!part){$('inspector').classList.add('hidden');return}const post=model.posts.find(p=>p.id===part.id);$('inspector').classList.remove('hidden');$('inspector').innerHTML=`<div class="inspector-head"><strong>${esc(part.id)} · ${esc(part.label)}</strong><button data-action="close-inspector" aria-label="Fermer">×</button></div><span class="tag">${esc(part.material==='wood'?'Bois':part.material==='mesh'?'Grillage':part.material==='concrete'?'Béton':'Composant')}</span><p style="margin-top:10px">${part.section?`Section : ${esc(part.section)}<br>`:''}${part.length?`Longueur : ${fmt(part.length,1)} mm`:''}</p>${post?`<button class="btn full" data-action="foundation-helper">Conseils : plots béton & ancrages</button><div class="divider"></div><label class="field"><span>Support de ce poteau</span><select data-post-ground="${esc(post.id)}">${groundOpts.map(([v,l])=>`<option value="${v}" ${(project.postOverrides[post.id]?.ground||project.ground)===v?'selected':''}>${l}</option>`).join('')}</select></label><label class="field"><span>Appui de ce poteau</span><select data-post-foundation="${esc(post.id)}">${foundations.map(([v,l])=>`<option value="${v}" ${(project.postOverrides[post.id]?.foundation||project.foundation)===v?'selected':''}>${l}</option>`).join('')}</select></label><button class="details-link" data-reset-post="${esc(post.id)}">Reprendre le réglage principal</button>`:`<p>Retrouvez ce repère dans le plan de débit et le dossier de fabrication.</p>`}`}
function modal(title,html){closeContextMenu(false);keyboardSession=null;$('modal-title').textContent=title;$('modal-content').innerHTML=html;syncSelections($('modal-content'));hydrateIcons();if(!$('modal').open)$('modal').showModal()}
const WALLS={concrete:{label:'Béton',items:[['Fixation mécanique','Goujon ou vis à béton dont le domaine couvre le support.','Épaisseur, distances aux bords, fissuration et efforts.'],['Scellement chimique','Résine et tige d’un système compatible.','Profondeur d’ancrage, nettoyage et temps de prise.']]},solid:{label:'Brique / bloc plein',items:[['Ancrage pour maçonnerie pleine','Système documenté pour le bloc ou la brique concernés.','Nature de l’élément, joints, état et épaisseur.'],['Scellement chimique','Tige ou douille avec résine adaptée.','Agrément couvrant le support exact.']]},hollow:{label:'Brique / parpaing creux',items:[['Scellement avec tamis','Tamis, résine et tige compatibles forment un ensemble.','Géométrie des alvéoles, mode de perçage et consommation.'],['Autre ancrage dédié','Solution mécanique uniquement si documentée pour cet usage.','Bloc, efforts et configuration de montage.']]},cellular:{label:'Béton cellulaire',items:[['Ancrage dédié','Cheville spécifique ou scellement expressément couvert.','Résistance et épaisseur du béton cellulaire.']]},stone:{label:'Pierre / mur ancien',items:[['Reconnaissance du support','Caractériser la pierre, le mortier et les vides avant de choisir.','Essais et avis technique selon l’usage.'],['Appui indépendant','Étudier un poteau ou une structure indépendante.','Fondations et reprise des efforts à définir.']]},wood:{label:'Ossature bois',items:[['Fixation dans les montants','Vis structurelles ou connecteur documenté.','Montants identifiés, sections, distances aux rives.']]},plaster:{label:'Placo / doublage',items:[['Renfort ou reprise porteuse','Pour une pièce de structure, identifier l’ossature ou le mur porteur.','La plaque seule n’est pas un appui de charpente.']]},insulation:{label:'Façade isolée',items:[['Montage à distance','Système traversant l’isolant vers le support porteur.','Épaisseurs, déport, étanchéité et rupture thermique.']]}};
function wallHelper(){const w=WALLS[wallSupport];modal('Fixer un élément au mur',`<p class="help-text" style="margin-bottom:16px">Aide au choix documentaire. Pour le quantitatif, ajoutez un mur en mode libre et reliez-y une pièce de bois.</p><label class="field"><span>Support porteur</span><select id="wall-support">${Object.entries(WALLS).map(([v,w])=>`<option value="${v}" ${v===wallSupport?'selected':''}>${w.label}</option>`).join('')}</select></label>${w.items.map(([title,desc,check])=>`<div class="recipe-card"><strong>${title}</strong><p>${desc}</p><small>À préciser : ${check}</small></div>`).join('')}<div class="notice">Ces familles sont des pistes à vérifier, sans prescription de diamètre, nombre ou résistance.</div>${sourcesHTML()}`)}
function jointDetail(){modal('Liaisons entre pièces de bois',`<p class="help-text" style="margin-bottom:14px">${model.joints.length} liaisons repérées dans le modèle. Méthode principale : ${joints.find(([v])=>v===project.joint)?.[1]}.</p>${RECIPES.filter(r=>r.family==='joint').map(r=>`<div class="recipe-card"><strong>${esc(r.label)}</strong><p>${esc(r.description)}</p><small>${esc(r.conditions)}</small></div>`).join('')}<div class="notice">Le comptage suit une recette de préparation. Le type, le diamètre, la longueur et les positions des fixations doivent être confirmés pour l’assemblage réel.</div>`)}
function exportModal(){modal('Emportez votre projet',`<p class="help-text" style="margin-bottom:18px">Plans, quantités et données modifiables. Choisissez le format utile pour votre prochaine étape.</p><div class="export-grid"><button class="export-item" data-action="batch-views">${icon('image')}<strong>Plusieurs vues en une fois</strong><small>Angles 3D, styles et plans au choix dans un ZIP.</small></button><button class="export-item" data-paper-action="pdf">${icon('file')}<strong>Plans PDF à l’échelle</strong><small>Feuilles A4/A3, cartouche et cotes vectorielles.</small></button><button class="export-item" data-dossier-tab="paper">${icon('ruler')}<strong>Préparer les feuilles</strong><small>Choisir les vues, l’échelle et les coupes.</small></button><button class="export-item" data-action="print">${icon('file')}<strong>Dossier PDF</strong><small>Vue, plan, débit, achats et hypothèses via l’impression.</small></button><button class="export-item" data-action="csv">${icon('cart')}<strong>Checklist CSV</strong><small>Quantités et achats à ouvrir dans Excel.</small></button><button class="export-item" data-action="save">${icon('save')}<strong>Projet modifiable</strong><small>Un fichier JSON pour reprendre votre travail.</small></button><button class="export-item" data-action="png">${icon('image')}<strong>Image de la vue</strong><small>Votre angle de vue actuel en PNG.</small></button><button class="export-item" data-action="svg">${icon('ruler')}<strong>Plan SVG</strong><small>Vue de dessus vectorielle avec dimensions.</small></button><button class="export-item" data-action="obj">${icon('cube')}<strong>Modèle 3D OBJ</strong><small>Géométrie en mètres ; données projet dans le JSON.</small></button></div>`)}
function download(data,name,type='text/plain'){const blob=data instanceof Blob?data:new Blob([data],{type});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)}
const filename=()=>project.name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9_-]+/g,'_').replace(/^_|_$/g,'').slice(0,60)||'Mon_projet';
function save(){download(JSON.stringify({...project,app:'Atelier sur mesure',savedAt:new Date().toISOString()},null,2),filename()+'.atelier.json','application/json');lastSavedAt=new Date().toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});$('save-status').textContent='Exporté à '+lastSavedAt;toast('Fichier projet téléchargé. Gardez-le pour rouvrir votre travail.')}
function csvExport(){download(toCSV(bom,project.purchased),filename()+'_achats.csv','text/csv;charset=utf-8');toast('Liste d’achats exportée.')}
function cutCSV(){const rows=[['Repère','Pièce','Section (mm)','Longueur d’axe exacte (mm)','Brut à préparer (mm)','Coupe A','Coupe B','État'],...model.parts.filter(p=>p.material==='wood'&&p.kind!=='panel').map(p=>{const a=analyzeTimberCut(p,project.manufacturing.cuts[p.id]);return [p.id,p.label,p.section,a.axisLength,a.blankLength===null?'À définir':formatDimension(a.blankLength,project.manufacturing.precision),a.cuts?.a?.label||'',a.cuts?.b?.label||'',a.status]})];download('\uFEFF'+rows.map(r=>r.map(v=>{const value=String(v??'');return '"'+(/^[=+@-]/.test(value)?"'":'')+value.replace(/"/g,'""')+'"'}).join(';')).join('\r\n'),filename()+'_debit.csv','text/csv;charset=utf-8')}

function planSVG(){
 const box=model.bounds||{min:[-project.width/2,0,-project.depth/2],max:[project.width/2,project.height,project.depth/2],width:project.width,depth:project.depth};
 const W=Math.max(box.width,1000),D=Math.max(box.depth,1000),cx=(box.min[0]+box.max[0])/2,cz=(box.min[2]+box.max[2])/2,pad=Math.max(W,D)*.14,sw=Math.max(W,D)/500;
 const parts=model.parts.filter(p=>['wood','wall','mesh','roof'].includes(p.material));
 const shapes=parts.map(p=>{if(p.corners)return `<polygon points="${p.corners.map(a=>a[0]+','+a[2]).join(' ')}" fill="${p.material==='mesh'?'#cfddbe':'#93a486'}" fill-opacity=".25" stroke="#92a17f" stroke-width="${sw}"/>`;const dx=p.b[0]-p.a[0],dz=p.b[2]-p.a[2],len=Math.hypot(dx,dz);if(len<.01)return `<rect x="${p.a[0]-p.height/2}" y="${p.a[2]-p.width/2}" width="${p.height}" height="${p.width}" fill="#355a43"/>`;return `<line x1="${p.a[0]}" y1="${p.a[2]}" x2="${p.b[0]}" y2="${p.b[2]}" stroke="${p.material==='wall'?'#b5b6ae':'#ad8d5c'}" stroke-width="${p.width}" stroke-linecap="butt"/>`}).join('');
 const labels=parts.filter(p=>p.material==='wood'||p.material==='wall').map(p=>`<text x="${(p.a[0]+p.b[0])/2}" y="${(p.a[2]+p.b[2])/2-50}" text-anchor="middle" font-size="${sw*5}" fill="#355a43">${esc(p.id)}</text>`).join('');
 return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${cx-W/2-pad} ${cz-D/2-pad} ${W+pad*2} ${D+pad*2}" width="1000" height="${Math.round((D+pad*2)/(W+pad*2)*1000)}"><rect x="${cx-W/2-pad}" y="${cz-D/2-pad}" width="${W+pad*2}" height="${D+pad*2}" fill="#fffef9"/>${shapes}${labels}<text x="${cx}" y="${cz+D/2+pad*.8}" font-family="sans-serif" text-anchor="middle" font-size="${sw*10}" fill="#355a43">${fmt(box.width)} × ${fmt(box.depth)} mm · Vue de dessus</text></svg>`;
}
function handleAction(action){if(action==='batch-views')openBatchExport({modal,viewport,project,model,download,filename});else if(action==='save')save();else if(action==='csv')csvExport();else if(action==='cut-csv')cutCSV();else if(action==='print')printProject();else if(action==='png'){if(!viewport){toast('La vue 3D est indisponible sur ce navigateur.');return}fetch(viewport.png()).then(r=>r.blob()).then(b=>download(b,filename()+'.png','image/png'))}else if(action==='svg'){download(planEditor?planEditor.exportSVG():projectionSVG(model,'top',{precision:project.manufacturing.precision}),filename()+'_plan.svg','image/svg+xml')}else if(action==='obj'){if(!viewport){toast('La vue 3D est indisponible.');return}download('# Atelier — unités en mètres\n'+viewport.obj(),filename()+'.obj')}else if(action==='go-connections'){goToPage('connections')}else if(action==='foundation-helper')modal('Plots béton & ancrages',foundationHelpHTML(project,model,bom,selectedIds));else if(action==='foundation-settings'){ $('modal').close();goToPage('connections');const section=$('foundation-settings');section.open=true;mobileUI?.open?.('pieces');section.scrollIntoView?.({block:'start'});section.querySelector('[data-field="footingWidth"]')?.focus();}else if(action==='foundation-shopping'){$('modal').close();goToPage('shopping');}else if(action==='joint-detail')jointDetail();else if(action==='wall-helper')wallHelper();else if(action==='close-inspector'){selectParts([])}else if(action==='toggle-missing'){onlyMissing=!onlyMissing;renderContent();hydrateIcons()}else if(action==='reset')modal('Repartir du modèle d’exemple ?',`<p class="help-text" style="margin-bottom:18px">Enregistrez d’abord votre projet si vous souhaitez le conserver. Vous pourrez aussi annuler cette action.</p><div style="display:flex;gap:10px"><button class="btn" data-action="save">Enregistrer le projet actuel</button><button class="btn primary" data-action="confirm-reset">Charger l’exemple</button></div>`);else if(action==='confirm-reset'){commit(p=>{Object.keys(p).forEach(k=>delete p[k]);Object.assign(p,structuredClone(DEFAULT_PROJECT))});$('modal').close();toast('Modèle d’exemple chargé.') }}
document.addEventListener('click',e=>{if(extraClick(e)||editorClick(e))return;const pageBtn=e.target.closest('[data-page]');if(pageBtn){goToPage(pageBtn.dataset.page);return}const nav=e.target.closest('[data-navigation]');if(nav){setNavigation(nav.dataset.navigation);return}const viewBtn=e.target.closest('[data-view]');if(viewBtn){activateView(viewBtn.dataset.view);return}const layer=e.target.closest('[data-layer]');if(layer){layer.classList.toggle('active');layer.setAttribute('aria-pressed',String(layer.classList.contains('active')));viewport?.layer(layer.dataset.layer,layer.classList.contains('active'));return}const foundation=e.target.closest('[data-foundation]');if(foundation){commit(p=>p.foundation=foundation.dataset.foundation);return}const detail=e.target.closest('[data-bom-detail]');if(detail){const r=bom.find(r=>r.id===detail.dataset.bomDetail);modal(r.label,`<p style="font-size:13px;line-height:1.9">${esc(r.detail)}</p><div class="divider"></div><p class="help-text">Besoin : ${fmt(r.required,2)} ${esc(r.unit)} · Réserve : ${fmt(r.marginQty,2)} · Stock : ${fmt(r.stock,2)}.</p><p class="help-text">Achat : ${fmt(r.packs)} lot(s) de ${fmt(r.packSize,2)} ${esc(r.unit)}.</p><p class="help-text">${r.partIds?.length?'Pièces concernées : '+r.partIds.map(esc).join(', '):''}</p>`);return}const reset=e.target.closest('[data-reset-post]');if(reset){commit(p=>delete p.postOverrides[reset.dataset.resetPost]);return}const act=e.target.closest('[data-action]');if(act)handleAction(act.dataset.action)});
document.addEventListener('change',e=>{const el=e.target;if(el.id==='post-picker'){selectParts(el.value?[el.value]:[]);return}if(el.dataset.field){if(el.type==='number'&&(!Number.isFinite(el.valueAsNumber)||!el.checkValidity())){el.setAttribute('aria-invalid','true');toast(`${el.getAttribute('aria-label')||'Valeur'} : saisissez un nombre entre ${el.min||'−∞'} et ${el.max||'+∞'}${el.closest('.input-wrap')?.querySelector('span')?.textContent==='mm'?' mm':''}.`);return}el.removeAttribute('aria-invalid');const val=el.type==='checkbox'?el.checked:['number','range'].includes(el.type)?Number(el.value):el.value;const before=structuredClone(project);commit(p=>{p[el.dataset.field]=val;if(el.dataset.field==='ground'){p.foundation=val==='concrete'?'plate_mechanical':'concrete'}});if(typeof val==='number'){const adjusted=Object.keys(before).filter(k=>typeof before[k]==='number'&&k!=='nextId'&&k!=='version'&&(k===el.dataset.field?project[k]!==val:project[k]!==before[k]));if(adjusted.length)toast('Cotes liées ajustées pour conserver la géométrie : '+adjusted.map(k=>document.querySelector(`[data-field="${k}"]`)?.getAttribute('aria-label')||k).join(', ')+'.')}return}if(el.dataset.stock){commit(p=>p.stock[el.dataset.stock]=Math.max(0,Number(el.value)||0));return}if(el.dataset.price){commit(p=>{if(el.value.trim()==='')delete p.prices[el.dataset.price];else p.prices[el.dataset.price]=Math.max(0,Number(el.value)||0)});return}if(el.dataset.purchased){commit(p=>p.purchased[el.dataset.purchased]=el.checked);return}if(el.dataset.postFoundation){commit(p=>{const id=el.dataset.postFoundation;if(p.mode==='free')p.freeParts.find(x=>x.id===id).foundation=el.value;else p.postOverrides[id]={...p.postOverrides[id],foundation:el.value}});return}if(el.dataset.postGround){commit(p=>{const id=el.dataset.postGround;p.postOverrides[id]={...p.postOverrides[id],ground:el.value,foundation:el.value==='concrete'?'plate_mechanical':'concrete'}});return}if(el.id==='wall-support'){wallSupport=el.value;wallHelper()}});
document.addEventListener('input',e=>{if(e.target.id==='shopping-search'){shoppingFilter=e.target.value;const cursor=e.target.selectionStart;renderContent();const search=$('shopping-search');search.focus();search.setSelectionRange?.(cursor,cursor);hydrateIcons()}});
$('undo').onclick=()=>{if(!undo.length)return;cancelSceneInteraction();redo.push(changes());const previous=sceneSignature(project);project=normalizeProject(JSON.parse(undo.pop()));rebuild(previous!==sceneSignature(project));persist()};$('redo').onclick=()=>{if(!redo.length)return;cancelSceneInteraction();undo.push(changes());const previous=sceneSignature(project);project=normalizeProject(JSON.parse(redo.pop()));rebuild(previous!==sceneSignature(project));persist()};
document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();save()}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'&&!contextMenu&&!$('modal').open&&!isEditingText()){e.preventDefault();(e.shiftKey?$('redo'):$('undo')).click()}});
$('export-open').onclick=exportModal;$('modal-close').onclick=()=>$('modal').close();$('modal').addEventListener('close',()=>{dimensionEditing=null;dimensionPreview=null;planEditor?.clearPreview();viewport?.clearArrangementPreview?.();if(placementPending)cancelSceneInteraction()});$('modal').addEventListener('click',e=>{if(e.target===$('modal')){const r=$('modal').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)$('modal').close()}});
$('save-project').onclick=save;$('open-project').onclick=()=>$('file-input').click();$('file-input').addEventListener('change',async e=>{const f=e.target.files[0];if(!f)return;try{if(f.size>5e6)throw Error('Ce fichier est trop volumineux.');const raw=JSON.parse(await f.text());if(![1,4,5].includes(raw.version)||typeof raw.width!=='number'||typeof raw.depth!=='number')throw Error('Ce fichier ne correspond pas à un projet Atelier.');const next=normalizeProject(raw);cancelSceneInteraction();try{localStorage.setItem('atelier.project.before-import',changes())}catch{}projectLibrary.save(next,{id:null});selectedIds=[];selectedId=null;selectedJoint=null;commit(p=>{Object.keys(p).forEach(k=>delete p[k]);Object.assign(p,next)},true,false,{skipAttachments:true});toast('Projet ouvert : '+project.name)}catch(err){toast(err.message||'Impossible de lire le projet.')}finally{e.target.value=''}});
$('warnings-button').onclick=()=>modal('Points à vérifier',`<p class="help-text">Le dessin et les quantités restent disponibles. Ces points permettent de préparer les vérifications du montage réel.</p>${model.warnings.map(w=>`<div class="warning-item">${icon('info')} ${esc(w.message)}</div>`).join('')||'<p>Aucun avertissement supplémentaire.</p>'}`);
$('reset-view').onclick=()=>activateView('iso');$('zoom-in').onclick=()=>viewport?.zoom(1.2);$('zoom-out').onclick=()=>viewport?.zoom(1/1.2);
try{viewport=new Viewport($('scene'),handleSceneSelection,(ids,payload)=>{const ok=commit(p=>withContactAttachment(transformSelection(p,ids,payload),payload.snap));if(ok)offerContactAttachment(payload.snap);renderInspector();return ok;})}catch(error){console.warn('Vue 3D indisponible',error);$('scene-area').insertAdjacentHTML('afterbegin','<div class="fallback">La 3D nécessite WebGL. Les réglages, quantités, sauvegardes et plans SVG restent disponibles.</div>')}
{const style=document.createElement('style');style.textContent=FABRICATION_STYLES+workspaceStyles+sceneChromeStyles;document.head.append(style)}
sceneChrome=setupSceneChrome({getContext:()=>({page,mode:workspaceMode,view:sceneView,editable:project.mode==='free',selectedCount:selectedIds.length+(selectedJoint?1:0),canResize:selectedIds.length===1&&panelResizeFrame(project.freeParts.find(p=>p.id===selectedIds[0])).available,canLink:selectedIds.length===2&&project.freeParts.filter(p=>selectedIds.includes(p.id)).every(p=>p.material==='wall'||p.material==='wood'&&p.kind!=='panel'),canUngroup:canUngroupSelection(project,selectedIds)}),onResize:()=>viewport?.resize(),onCloseContext:()=>closeContextMenu(false)});
setupSceneCommands();setupDrawing();rebuild();setNavigation(navigationMode);persist();if(restored)toast('Votre dernier projet a été retrouvé sur ce navigateur.');
// Interface limitée aux tests de cohérence et à l’inspection de l’état local.
if(viewport)viewport.onFixingTransform=(jointId,id,position)=>moveFixing(jointId,id,position);
window.Atelier={getProject:()=>structuredClone(project),getModel:()=>structuredClone(model),getBOM:()=>structuredClone(bom),setPage:goToPage,planSVG,selectParts,pickJoint,pickFixing,getSelection:()=>[...selectedIds],setWorkspaceMode,getPlanEditor:()=>planEditor,getDrawingSheets:currentDrawingSheets,getTechnicalView:currentTechnicalView,getOfflineState:()=>offlineUI?.getState?.(),openContextMenu,editSceneDistance:openSceneDistance,applyPanelResize,selectScenePart:handleSceneSelection};
setupOfflineController();setupDirectCommands();


function setNavigation(mode){navigationMode=mode;viewport?.setNavigation(mode);document.querySelectorAll('[data-navigation]').forEach(b=>{const active=b.dataset.navigation===mode;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active))});$('navigation-hint').textContent=mode==='free'?'Glisser : déplacer · Droit glissé : pivoter · Droit court : actions · Molette : zoomer au curseur':'Glisser : tourner · Droit glissé : déplacer · Droit court : actions · Molette : zoomer au curseur';try{localStorage.setItem('atelier.navigation.v1',mode)}catch{}}
$('navigation-help').onclick=()=>modal('Se déplacer dans la 3D',`<div class="content-card"><h3>Navigation libre — point visé à la souris</h3><p>Glissez avec le bouton gauche pour déplacer le point de vue. Placez la souris sur un assemblage, puis maintenez le bouton droit et glissez pour tourner autour du point visé. Le centre est choisi à chaque nouveau geste. La molette zoome vers la souris et ralentit à l’approche de la pièce. Dans le vide, le plan de travail ou un point dans la direction de la souris sert de repère.</p><p>Le bouton central, ou Maj + clic droit glissé, déplace également la vue. Alt pendant un déplacement rend le geste plus fin ; Maj + molette ralentit le zoom.</p><p>Un clic gauche sélectionne une pièce. Les poignées colorées déplacent les pièces, et le fond déplace la caméra.</p></div><p class="help-text">Le mode Orbite reste disponible pour tourner autour du projet. Les vues Dessus, Face et Côté sont orthographiques. Recentrer permet de retrouver toute la structure.</p>`);

function selectParts(ids=[],toggle=false){
 keyboardSession=null;soloSelectionId=null;
 selectedFixing=null;selectedJoint=null;const valid=ids.filter(id=>model.parts.some(p=>p.id===id));selectedIds=toggle?[...new Set([...selectedIds.filter(id=>!valid.includes(id)),...valid.filter(id=>!selectedIds.includes(id))])]:valid;selectedId=selectedIds[0]||null;renderInspector();if(page==='design'&&project.mode==='free'){$('sidebar').innerHTML=sidePanel();hydrateIcons()}
}
function pickJoint(id){selectedFixing=null;selectedJoint=id;selectedIds=[];selectedId=null;renderInspector();viewport?.layer('joints',true);document.querySelector('[data-layer="joints"]').classList.add('active')}
function replaceProject(next){commit(()=>next)}
function editorClick(e){
 const target=e.target.closest('button,input');if(!target)return false;
 if(target.dataset.step){commit(p=>{p.grid=Number(target.dataset.step);p.snap=true});return true}
 if(target.dataset.nudgeAxis){const axis=target.dataset.nudgeAxis,amount=project.grid*Number(target.dataset.nudgeSign),delta=[0,0,0];if(axis==='u'||axis==='v'){const frame=workplaneFrame(project.workplane);delta.splice(0,3,...frame[axis].clone().multiplyScalar(amount).toArray())}else delta['xyz'.indexOf(axis)]=amount;commit(p=>transformSelection(p,selectedIds,{delta}));return true}
 if(target.dataset.inspectorTab){inspectorTab=target.dataset.inspectorTab;activateInspectorTab($('inspector'),inspectorTab);return true}
 if(target.dataset.applySnap){const proposal=getPlacementSuggestions(project,selectedIds,75).find(x=>x.id===target.dataset.applySnap);if(!proposal){toast('Ce contact n’est plus disponible. Sélectionnez à nouveau la pièce.');return true}if(commit(p=>withContactAttachment(transformSelection(p,selectedIds,{delta:proposal.delta}),proposal))){offerContactAttachment(proposal);toast('Faces mises en correspondance.');if(target.dataset.snapLink){selectParts([proposal.sourceId,proposal.targetId]);connectModal()}}return true}

 if(target.dataset.pick){handleSceneSelection(model.parts.find(part=>part.id===target.dataset.pick)||null,e);return true}
 if(target.dataset.multiPick){selectParts([target.dataset.multiPick],true);return true}
 if(target.dataset.jointPick){pickJoint(target.dataset.jointPick);return true}
 if(target.dataset.tool){sceneTool(target.dataset.tool);return true}
 if(target.dataset.preset){const preset=target.dataset.preset;modal('Changer de point de départ',`<p class="help-text">Enregistrez votre projet pour le conserver. Cette action remplace la scène et reste annulable.</p><div class="preset-confirm"><button class="btn" data-action="save">Enregistrer le projet</button><button class="btn primary" data-load-preset="${preset}">Charger ${esc(target.textContent)}</button></div>`);return true}
 if(target.dataset.loadPreset){selectedIds=[];selectedJoint=null;selectedId=null;replaceProject(createPreset(project,target.dataset.loadPreset));page='design';$('modal').close();render();activateView('iso');toast('Scène prête. Ajoutez ou sélectionnez une pièce.');return true}
 if(target.dataset.add){startAddingPiece(target.dataset.add);return true}
 if(target.dataset.align){replaceProject(alignSelection(project,selectedIds,target.dataset.align));return true}
 if(target.dataset.distribute){replaceProject(alignSelection(project,selectedIds,target.dataset.distribute,true));return true}
 if(target.dataset.jointCompare){compareJoint(target.dataset.jointCompare);return true}
 if(target.dataset.useRecipe){const id=target.dataset.forJoint,recipe=target.dataset.useRecipe;commit(p=>setJoint(p,id,{recipe,...getJointDefaults(recipe)}));$('modal').close();pickJoint(id);return true}
 if(target.dataset.jointDelete){const id=target.dataset.jointDelete;selectedJoint=null;commit(p=>p.freeJoints=p.freeJoints.filter(j=>j.id!==id));return true}
 if(target.dataset.jointReset){commit(p=>delete p.jointOverrides[target.dataset.jointReset]);return true}
 if(target.dataset.jointCopy){const j=model.joints.find(x=>x.id===target.dataset.jointCopy),isWall=j.recipe.startsWith('wall_');modal('Copier ce montage',`<form data-editor-form="copy-joint" data-id="${esc(j.id)}"><p class="help-text">Choisissez les liaisons à remplacer. Référence et quantités seront copiées ; les supports restent à vérifier.</p><div class="copy-joints">${model.joints.filter(x=>x.id!==j.id&&x.recipe.startsWith('wall_')===isWall).map(x=>`<label><input type="checkbox" name="jointIds" value="${esc(x.id)}"> ${esc(x.id)} · ${esc(x.aPart)} ↔ ${esc(x.bPart)}</label>`).join('')}</div><button class="btn primary" type="submit">Copier vers les liaisons cochées</button></form>`);return true}
 if(target.dataset.selectGroup){selectParts(project.freeParts.filter(p=>p.grouped&&p.groupName===target.dataset.selectGroup).map(p=>p.id));return true}
 const action=target.dataset.editor;if(!action)return false;
 if(action==='ungroup'){runContextAction('ungroup');return true}
 if(action==='convert'){selectedIds=[];selectedId=null;replaceProject(convertToFree(project));toast('Chaque pièce est indépendante. Annuler permet de revenir au modèle guidé.');activateView('iso')}
 if(action==='all')selectParts(project.freeParts.map(p=>p.id));
 if(action==='none')selectParts([]);
 if(action==='duplicate-fast'){if(project.freeParts.length+selectedIds.length>1000){toast('Cette duplication dépasserait 1 000 pièces.');return true}if(!selectedIds.length){toast('Sélectionnez une ou plusieurs pièces.');return true}const before=new Set(project.freeParts.map(p=>p.id));replaceProject(separateCopiedGroups(project,duplicateParts(project,selectedIds,[Math.max(200,project.grid*4),0,0])));selectParts(project.freeParts.filter(p=>!before.has(p.id)).map(p=>p.id))}
 if(action==='delete'){if(!selectedIds.length){toast('Sélectionnez les pièces à supprimer.');return true}const ids=[...selectedIds];selectParts([]);replaceProject(removeParts(project,ids));toast('Pièces et liaisons associées supprimées. Vous pouvez annuler.')}
 if(action==='connect')connectModal();
 if(action==='preview-placement'){const form=target.closest('form');if(form){form.dataset.preview='true';updatePlacementReadout(form)}}
 if(action==='plane-view'){cancelSceneInteraction();viewport?.workplaneView();sceneView='workplane';updateViewControls()}
 if(action==='plane-drop'){try{const parts=project.freeParts.filter(p=>selectedIds.includes(p.id)),delta=workplaneDropDelta(parts,project.workplane);commit(p=>transformSelection(p,selectedIds,{delta}));toast('Sélection posée sur le plan, sans rotation.')}catch(error){toast(error.message)}}
 if(action==='global-bases'){commit(p=>{for(const part of p.freeParts.filter(x=>x.kind==='post')){part.ground=p.ground;part.foundation=p.foundation}});toast('Appui principal appliqué à tous les poteaux.')}
 if(action==='restore-import'){try{const raw=localStorage.getItem('atelier.project.before-import');if(raw){replaceProject(normalizeProject(JSON.parse(raw)));toast('Projet avant import restauré.')}else toast('Aucune copie avant import disponible.')}catch{toast('La copie n’a pas pu être lue.')}}
 return true;
}
function setJoint(p,id,config){const allowed=['recipe','connectors','screws','bolts','anchors','resinDose','reference','notes','fixingLayout'];const patch=Object.fromEntries(Object.entries(config).filter(([key])=>allowed.includes(key)));if(p.mode==='free'){const j=p.freeJoints.find(x=>x.id===id);if(j)Object.assign(j,patch)}else p.jointOverrides[id]={...p.jointOverrides[id],...patch}}
function connectModal(){
 const parts=model.parts.filter(x=>['wood','wall'].includes(x.material));if(parts.length<2){toast('Ajoutez au moins deux pièces de bois ou un bois et un mur.');return}
 const opts=selected=>parts.map(x=>`<option value="${esc(x.id)}" ${x.id===selected?'selected':''}>${esc(x.id)} · ${esc(x.label)}</option>`).join('');
 modal('Créer une liaison',`<form data-editor-form="connect"><p class="help-text">Choisissez les deux pièces. Les nouvelles liaisons sont créées en mode libre ; le modèle guidé sera converti si nécessaire.</p><label class="field"><span>Première pièce</span><select name="aPart">${opts(selectedIds[0]||parts[0].id)}</select></label><label class="field"><span>Deuxième pièce</span><select name="bPart">${opts(selectedIds[1]||parts[1].id)}</select></label><label class="field"><span>Famille de montage</span><select name="recipe">${RECIPES.filter(r=>r.family!=='foundation').map(r=>`<option value="${r.id}">${esc(r.label)}</option>`).join('')}</select></label><p class="help-text">Le choix de la famille ajoute un quantitatif modifiable. Les distances et supports sont contrôlés à titre indicatif.</p><button class="btn primary" type="submit">Créer la liaison</button></form>`);const form=document.querySelector('[data-editor-form="connect"]');form.elements.namedItem('aPart').value=selectedIds[0]||parts[0].id;form.elements.namedItem('bPart').value=selectedIds[1]||parts[1].id;updateConnectRecipes();
}
function updateConnectRecipes(){const form=document.querySelector('[data-editor-form="connect"]');if(!form)return;const a=model.parts.find(p=>p.id===form.elements.aPart.value),b=model.parts.find(p=>p.id===form.elements.bPart.value),wall=[a,b].find(x=>x?.material==='wall');form.elements.recipe.innerHTML=RECIPES.filter(r=>r.family!=='foundation'&&(wall?r.family==='wall':r.family==='joint')).map(r=>`<option value="${r.id}">${esc(r.label)}</option>`).join('');if(wall){form.elements.recipe.value=wall.wallSupport?.startsWith('hollow')?'wall_screen':wall.wallSupport==='wood'?'wall_wood':wall.insulation||wall.gap?'wall_distance':'wall_mechanical'}}
function compareJoint(id){
 const joint=model.joints.find(j=>j.id===id);if(!joint)return;const wall=[joint.aPart,joint.bPart].map(id=>model.parts.find(p=>p.id===id)).find(p=>p?.material==='wall');const current=calculateBOM(project).reduce((s,r)=>s+r.total,0);
 const rows=RECIPES.filter(r=>wall?r.family==='wall':r.family==='joint').map(r=>{const candidate=structuredClone(project);setJoint(candidate,id,{recipe:r.id,...getJointDefaults(r.id)});const built=buildProject(candidate),bomRows=calculateBOM(candidate,built).filter(x=>x.jointIds?.includes(id)),warnings=built.warnings.filter(w=>w.code.includes(id));const price=bomRows.every(x=>x.priced)?money(bomRows.reduce((s,r)=>s+r.total,0)):'Prix à renseigner';return `<article class="comparison-card ${r.id===joint.recipe?'selected':''}"><h3>${esc(r.label)}</h3><p>${esc(r.conditions)}</p><ul>${bomRows.map(x=>`<li>${fmt(x.required,2)} ${esc(x.unit)} · ${esc(x.label)}</li>`).join('')||'<li>Usinage à détailler ; aucun consommable renseigné.</li>'}</ul>${warnings.length?`<p class="comparison-warning">${warnings.map(w=>esc(w.message)).join(' ')}</p>`:''}<small>Coût des lignes concernées pour le projet : ${price}</small><button class="btn full ${r.id===joint.recipe?'':'primary'}" data-use-recipe="${r.id}" data-for-joint="${esc(id)}">${r.id===joint.recipe?'Montage actuel':'Choisir cette solution'}</button></article>`}).join('');modal('Comparer les montages',`<p class="help-text">Les quantités ci-dessous agrègent les lignes d’achat concernées, qui peuvent être partagées avec d’autres liaisons. Les conditionnements et le stock s’appliquent au projet.</p><div class="comparison-grid">${rows}</div><details><summary>Documentation des systèmes</summary>${referencesHTML()}</details>`);
}
document.addEventListener('submit',e=>{
 const form=e.target.closest('[data-editor-form]');if(!form)return;e.preventDefault();if(!form.checkValidity()){form.reportValidity();return}
 const data=new FormData(form),type=form.dataset.editorForm,n=(key,def=0)=>{const v=data.get(key);return v===null||v===''?def:Number(v)},v=name=>[0,1,2].map(i=>n(name+i));
 if([...data.entries()].some(([k,value])=>form.elements.namedItem(k)?.type==='number'&&value!==''&&!Number.isFinite(Number(value)))){toast('Saisissez des nombres valides.');return}
 if(type==='placement'){try{const config=placementConfig(form),next=config.operation==='align'?alignParts(project,config.ids,config.reference,{axis:config.axis,feature:config.feature}):setPartSpacing(project,config.ids,config.reference,config);if(commit(()=>next))toast(config.operation==='align'?'Alignement appliqué.':'Écart exact appliqué.')}catch(error){toast(error.message)}return}
 if(type==='workplane'){commit(p=>{p.workplane={...p.workplane,type:data.get('type'),offset:n('offset'),lock:data.has('lock'),visible:data.has('visible')}});toast('Plan de travail défini.');return}
 if(type==='plane-face'){try{const part=project.freeParts.find(x=>x.id===form.dataset.id);commit(p=>p.workplane=planeFromPart(part,data.get('face')));toast('Plan de travail pris sur la face.')}catch(error){toast(error.message)}return}
 if(type==='piece'){
  const id=form.dataset.id,original=project.freeParts.find(x=>x.id===id);if(!original)return;
  const groupName=data.get('groupName')||'',edits={label:data.get('label'),groupName,grouped:groupName===original.groupName?original.grouped:!!groupName.trim(),a:original.a,b:original.b};
  if(original.material==='wood'&&original.kind!=='panel'){if(n('width')<=0||n('height')<=0||n('length')<=0){toast('Les dimensions doivent être supérieures à zéro.');return}Object.assign(edits,{width:n('width'),height:n('height'),species:data.get('species'),roll:n('roll')})}
  if(original.kind==='panel'){edits.width=n('width',original.width);edits.species=data.get('species')||original.species;edits.corners=[0,1,2,3].map(i=>v('c'+i));edits.material=data.get('material');edits.group=edits.material==='mesh'?'mesh':edits.material==='wood'?'structure':'roof';edits.a=edits.corners[0];edits.b=edits.corners[2]}
  else{edits.a=v('a');edits.b=v('b');if(Math.hypot(...edits.a.map((v,i)=>edits.b[i]-v))<1){toast('Les deux extrémités doivent être distinctes.');return}}
  if(original.material==='wood'&&original.kind!=='panel'&&Math.abs(n('length')-Math.hypot(...original.a.map((v,i)=>original.b[i]-v)))>1e-9){const resized=resizePartLength({...original,...edits},n('length'),data.get('lengthAnchor')||'a');edits.a=resized.a;edits.b=resized.b;}
  if(original.kind==='post')Object.assign(edits,{foundation:data.get('foundation'),ground:data.get('ground')});
  if(original.material==='wall'){if(n('height')<=0||n('wallThickness')<=0){toast('Renseignez une hauteur et une épaisseur positives.');return}Object.assign(edits,{height:n('height'),width:n('wallThickness'),wallThickness:n('wallThickness'),wallSupport:data.get('wallSupport'),insulation:Math.max(0,n('insulation')),gap:Math.max(0,n('gap'))})}
  commit(p=>Object.assign(p.freeParts.find(x=>x.id===id),edits));toast('Pièce mise à jour.');
 }
 if(type==='bulk'){commit(p=>{for(const part of p.freeParts.filter(x=>selectedIds.includes(x.id))){if(part.material==='wood'){if(n('width')>0)part.width=n('width');if(n('height')>0)part.height=n('height');if(data.get('species'))part.species=data.get('species')}if(data.get('groupName')){part.groupName=data.get('groupName');part.grouped=true;}}})}
 if(type==='transform'){if(selectedIds.some(id=>project.freeParts.find(x=>x.id===id)?.material==='wall')&&data.get('axis')!=='y'&&n('angle')!==0){toast('Les murs restent verticaux : utilisez une rotation autour de Y.');return}replaceProject(transformSelection(project,selectedIds,{delta:v('d'),axis:data.get('axis'),angle:n('angle')}))}
 if(type==='duplicate'){if(project.freeParts.length+selectedIds.length*Math.max(1,Math.min(30,Math.floor(n('count',1))))>1000){toast('Cette duplication dépasserait 1 000 pièces.');return}const count=Math.max(1,Math.min(30,Math.floor(n('count',1)))),axis={x:0,y:1,z:2}[data.get('axis')],before=new Set(project.freeParts.map(p=>p.id));let next=project;for(let i=1;i<=count;i++){const delta=[0,0,0];delta[axis]=n('spacing')*i;next=duplicateParts(next,selectedIds,delta)}replaceProject(separateCopiedGroups(project,next));selectParts(project.freeParts.filter(p=>!before.has(p.id)).map(p=>p.id))}
 if(type==='snap'){replaceProject(snapToPoint(project,selectedIds[0],data.get('end'),data.get('target'),data.get('targetEnd')))}
 if(type==='joint'){const id=form.dataset.id,recipe=data.get('recipe'),j=model.joints.find(x=>x.id===id);const patch={...j,recipe,reference:data.get('reference'),notes:data.get('notes')};for(const key of ['connectors','screws','bolts','anchors','resinDose'])if(data.has(key))patch[key]=Math.max(0,n(key));commit(p=>setJoint(p,id,patch));toast('Quantités de la liaison mises à jour.')}
 if(type==='connect'){const a=data.get('aPart'),b=data.get('bPart');if(a===b){toast('Choisissez deux pièces différentes.');return}if(model.joints.some(j=>[j.aPart,j.bPart].includes(a)&&[j.aPart,j.bPart].includes(b))){toast('Ces deux pièces ont déjà une liaison. Sélectionnez-la pour modifier son montage.');return}const next=addJoint(project.mode==='free'?project:convertToFree(project),a,b,data.get('recipe'));replaceProject(next);$('modal').close();pickJoint(project.freeJoints.at(-1).id);toast('Liaison ajoutée au quantitatif.')}
 if(type==='copy-joint'){const original=model.joints.find(j=>j.id===form.dataset.id),ids=data.getAll('jointIds');commit(p=>{for(const id of ids)setJoint(p,id,{...original,fixingLayout:{mode:"auto"}})});$('modal').close();toast(`Montage copié sur ${ids.length} liaison(s).`)}
});
document.addEventListener('change',e=>{const form=e.target.closest('[data-editor-form]');if(form?.dataset.editorForm==='connect'&&['aPart','bPart'].includes(e.target.name))updateConnectRecipes();if(form?.dataset.editorForm==='joint'&&e.target.name==='recipe'){const values=getJointDefaults(e.target.value);for(const [key,value]of Object.entries(values)){if(form.elements[key])form.elements[key].value=value}}});
document.addEventListener('input',e=>{if(e.target.id==='editor-search'){editorFilter=e.target.value;const pos=e.target.selectionStart;$('sidebar').innerHTML=sidePanel();$('editor-search').focus();$('editor-search').setSelectionRange?.(pos,pos)}});
document.addEventListener('keydown',e=>{if(e.defaultPrevented||contextMenu)return;if(e.key==='Escape'&&!$('modal').open)cancelSceneInteraction();if(isEditingText()||$('modal').open)return;if(e.key==='Escape'){cancelSceneInteraction();if(sceneFocused)setSceneFocus(false);else selectParts([]);return}if(!e.ctrlKey&&!e.metaKey&&e.key.toLowerCase()==='f'){e.preventDefault();setSceneFocus(!sceneFocused);return}if(!e.ctrlKey&&!e.metaKey&&e.key.toLowerCase()==='m'){e.preventDefault();$('measure-toggle')?.click();return}if(project.mode!=='free')return;if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();document.querySelector('[data-editor="delete"]')?.click()}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='d'){e.preventDefault();document.querySelector('[data-editor="duplicate-fast"]')?.click()}if(!e.ctrlKey&&!e.metaKey){const tool={v:'select',w:'translate',r:'rotate'}[e.key.toLowerCase()];if(tool)document.querySelector(`[data-tool="${tool}"]`)?.click()}});

function syncSelections(root){for(const select of root.querySelectorAll('select')){const option=select.querySelector('option[selected]');if(option)select.value=option.value}}
function renderInspector(){viewport?.previewPlacement([],null);renderInspectorContent();activateInspectorTab($('inspector'),inspectorTab);renderSceneSettings();if(selectedId&&project.mode!=='free')$('inspector').insertAdjacentHTML('beforeend',baseFixingButtons([selectedId]));syncSelections($('inspector'));updatePlacementReadout(document.querySelector('[data-editor-form="placement"]'));refreshDrawing();refreshMobile()}


function placementConfig(form){
 const fields=form.elements,read=name=>fields.namedItem(name).value,moving=read('moving');
 return {ids:moving==='selection'?[...selectedIds]:[moving],reference:read('reference'),axis:read('axis'),operation:read('operation'),measure:read('measure'),distance:Number(read('distance'))*Number(read('unit')),side:Number(read('side')),feature:read('feature')};
}
function updatePlacementReadout(form){
 if(!form)return;const c=placementConfig(form),output=form.querySelector('[data-placement-readout]');
 form.querySelector('[data-spacing-fields]').classList.toggle('hidden',c.operation!=='spacing');form.querySelector('[data-align-fields]').classList.toggle('hidden',c.operation!=='align');
 try{
  const measure=measurePartSpacing(project,c.ids,c.reference,c.axis,c.measure,c.side);if(measure===null)throw Error('Choisissez une référence fixe distincte des pièces à déplacer.');
  let delta;if(c.operation==='align'){delta=computeAlignmentDelta(project,c.ids,c.reference,{axis:c.axis,feature:c.feature});if(!delta)throw Error('Alignement indisponible pour cette sélection.');output.textContent=`Déplacement sur ${c.axis.toUpperCase()} : ${fmt(delta['xyz'.indexOf(c.axis)],3)} mm.`}
  else{if(!Number.isFinite(c.distance)||c.distance<0)throw Error('Saisissez un écart positif ou nul.');delta=[0,0,0];delta['xyz'.indexOf(c.axis)]=c.side*(c.distance-measure);output.textContent=`${c.measure==='faces'?'Espace libre':'Distance entre centres'} actuel : ${fmt(measure,3)} mm → ${fmt(c.distance,3)} mm (${fmt(c.distance/1000,3)} m).${measure<0?' Valeur négative : recouvrement projeté ou côté opposé.':''}`}
  if(form.dataset.preview==='true')viewport?.previewPlacement(c.ids,delta,c.reference);
 }catch(error){output.textContent=error.message;viewport?.previewPlacement([],null)}
}
for(const eventName of ['change','input'])document.addEventListener(eventName,e=>{const form=e.target.closest('[data-editor-form="placement"]');if(form)updatePlacementReadout(form)});
for(const eventName of ['mouseover','focusin'])document.addEventListener(eventName,e=>{const row=e.target.closest('[data-preview-snap]');if(!row)return;const proposal=getPlacementSuggestions(project,selectedIds,75).find(x=>x.id===row.dataset.previewSnap);if(proposal)viewport?.previewPlacement(selectedIds,proposal.delta,proposal.targetId)});
for(const eventName of ['mouseout','focusout'])document.addEventListener(eventName,e=>{const row=e.target.closest('[data-preview-snap]');if(row&&!row.contains(e.relatedTarget))viewport?.previewPlacement([],null)});

// Lots de préparation : implantation, stock, fabrication et projets.
function allFixingJoints(){return [...(model?.joints||[]),...(model?getFoundationJoints(model,project):[])]}
function baseFixingButtons(ids){const bases=allFixingJoints().filter(j=>j.kind==='foundation'&&ids.includes(j.aPart));return bases.map(j=>`<button class="btn full" data-base-fixings="${esc(j.id)}">Positionner les ancrages de ${esc(j.aPart)}</button>`).join('')}
function pickFixing(jointId,id){selectedJoint=jointId;selectedFixing=id;selectedIds=[];selectedId=null;renderInspector();document.querySelector('[data-layer="fixings"]')?.classList.add('active')}
function setFixingLayout(p,joint,layout){if(joint.kind==='foundation')p.baseFixingLayouts[joint.aPart]=layout;else setJoint(p,joint.id,{fixingLayout:layout})}
function moveFixing(jointId,id,position){const joint=allFixingJoints().find(j=>j.id===jointId);if(!joint)return;try{const layout=moveJointFixing(joint,model,id,position);commit(p=>setFixingLayout(p,joint,layout));pickFixing(jointId,id)}catch(error){toast(error.message)}}
function extraSidebar(){
 const text={workshop:['Matériaux & stock','Barres, chutes et références disponibles.'],templates:['Choisir un modèle','Vos dimensions, puis des pièces libres à personnaliser.'],fabrication:['Préparer la fabrication','Plans, fiches de coupe, assemblages et achats.'],electrical:['Électricité domestique','Module indépendant : implantation, circuits et cheminements.'],projects:['Vos projets','Versions dans ce navigateur et sauvegardes JSON.']}[page];
 return `<h2 class="sidebar-title">${text[0]}</h2><p class="sidebar-intro">${text[1]}</p><label class="field"><span>Nom du projet</span><input type="text" data-field="name" value="${esc(project.name)}" maxlength="80"></label>${page==='fabrication'?(dossierTab==='paper'?paperSettingsPanel(project):dossierTab==='technical'?technicalSettingsPanel(project,model,selectedIds):cutSettingsPanel()):''}<details class="side-details"><summary>Enregistrement et export</summary><p class="help-text">Gardez un fichier JSON pour transférer ou sauvegarder le projet en dehors de ce navigateur.</p><button class="btn full" data-action="save">Enregistrer le projet JSON</button><button class="btn full subtle" data-page="projects">Mes projets et versions</button></details>`;
}

function extraContent(content){
 if(page==='workshop')content.innerHTML=workshopView(project,model,bom);
 else if(page==='templates')content.innerHTML=templatesView();
 else if(page==='fabrication'&&dossierTab==='paper'){content.innerHTML=paperWorkspace(project,model,currentDrawingSheets());}
 else if(page==='fabrication'&&dossierTab==='technical'){content.innerHTML=technicalWorkspace(project,model,currentTechnicalView());}
 else if(page==='fabrication')content.innerHTML=`<div class="list-toolbar"><button class="btn primary" data-action="print">Imprimer / PDF</button>${['top','front','side'].map((v,i)=>`<button class="btn" data-projection-export="${v}">${['Dessus','Face','Côté'][i]} SVG</button>`).join('')}</div>`+fabricationBody({project,model,bom,cuts:cutResult(),title:project.name,includeJointDetails:true});
 else if(page==='electrical')content.innerHTML=electricalView(project)+`<div class="list-toolbar"><button class="btn" data-electric-export="plan">Plan SVG</button><button class="btn" data-electric-export="single">Unifilaire SVG</button><button class="btn" data-action="print">Imprimer / PDF</button></div>`;
 else if(page==='projects'){try{content.innerHTML='<div class="list-toolbar"><button class="btn primary" data-project-action="new">+ Projet vide</button></div>'+projectsView(projectLibrary,project)}catch(error){content.innerHTML=`<div class="notice">${esc(error.message)}</div>`}}
 else return false;
 syncSelections(content);return true;
}
function templatesView(){return `<div class="content-card"><span class="eyebrow">MODÈLES AJUSTABLES</span><h2>Des cotes à votre projet.</h2><p>Le modèle est créé en construction libre. Vous pouvez ensuite modifier chaque pièce et ses fixations. Le projet actuel reste dans l’historique et dans Mes projets.</p></div><div class="template-grid">${TEMPLATE_DEFINITIONS.map(def=>`<form class="content-card" data-template-form="${esc(def.id)}"><h3>${esc(def.label)}</h3><p>${esc(def.description)}</p><div class="field-grid">${Object.entries(def.defaults).filter(([k,v])=>typeof v==='number').map(([key,value])=>`<label class="field"><span>${esc(({width:'Largeur hors tout',depth:'Profondeur',height:'Hauteur',postSection:'Section poteau',beamWidth:'Largeur bois',beamHeight:'Hauteur bois',maxSpan:'Écart max. entre poteaux',rafterSpacing:'Écart entre chevrons',clearance:'Jeu',leaves:'Vantaux',plankWidth:'Largeur lame',plankThickness:'Épaisseur lame',plankGap:'Jour entre lames'})[key]||key)}${key==='leaves'?'':' · mm'}</span><input name="${esc(key)}" type="number" value="${value}" step="${key==='leaves'?'1':'any'}" min="${['clearance','plankGap'].includes(key)?'0':'1'}" max="${key==='leaves'?'2':'20000'}" required></label>`).join('')}</div>${def.id==='fence'?'<label class="field"><span>Remplissage</span><select name="fill"><option value="mesh">Grillage</option><option value="slats">Lames de bois</option></select></label>':''}<button type="submit" class="btn primary full">Créer ce modèle</button></form>`).join('')}<div class="content-card"><h3>Enclos et scènes rapides</h3><p>L’enclos guidé, le cadre, le départ en L, le mur et le toit deux pentes restent disponibles dans Concevoir.</p><button class="btn" data-page="design">Revenir à la construction</button></div></div>`}
function advancedCuts(){return `<div class="content-card"><h2>Débit selon votre stock</h2><p>Le stock physique est affecté au projet ; il n’est pas consommé définitivement. Les manquants restent signalés dans les achats.</p><button class="btn" data-page="workshop">Modifier les longueurs et chutes</button></div>${project.workshop.useTimberStock?timberPlanView(planTimber(preparedParts(),project.workshop,{kerf:project.kerf,defaultLength:project.woodStockLength,defaultSpecies:project.material}),{precision:project.manufacturing.precision}):simpleCuts()}${project.workshop.usePanelStock?panelPlanView(planPanels(model.parts,project.workshop,{kerf:project.kerf})):''}`}
function printProject(){
 if(page==='fabrication'&&dossierTab==='paper'){printDrawingSheets();return;}
 if(page==='electrical')$('print-area').innerHTML=`<h1>${esc(project.name)} · Électricité</h1>${electricalPlanSVG(project.electrical)}${electricalSingleLineSVG(project.electrical)}<h2>Checklist électrique</h2><table><thead><tr><th>Article</th><th>Besoin</th><th>Stock</th><th>À acheter</th></tr></thead><tbody>${bom.filter(r=>r.category==='Électricité').map(r=>`<tr><td>${esc(r.label)}</td><td>${fmt(r.required,3)} ${esc(r.unit)}</td><td>${fmt(r.stock,3)}</td><td>${fmt(r.purchaseQty,3)} ${esc(r.unit)}</td></tr>`).join('')}</tbody></table><p>Schéma de préparation, sans contrôle automatique de conformité.</p>`;
 else $('print-area').innerHTML=fabricationBody({project,model,bom,cuts:cutResult(),title:project.name,includeJointDetails:true})+`<p>Budget des achats : ${costLabel()}.</p>`+(project.workshop.useTimberStock||project.workshop.usePanelStock?advancedCuts():'')+((workspaceMode==='plan'||project.drawing.dimensions.length)&&planEditor?`<section class="print-plan"><h2>Plan coté · ${esc({top:'Dessus',front:'Face',side:'Côté'}[planEditor.view])}</h2>${planEditor.exportSVG()}</section>`:'');
 $('modal').close();window.print();
}
function useStoredProject(result){if(!result?.project)return;cancelSceneInteraction();$('modal').close();project=normalizeProject(result.project);undo=[];redo=[];selectedIds=[];selectedId=selectedJoint=selectedFixing=null;rebuild();persist();toast('Projet ouvert : '+project.name)}
function extraClick(e){
 const button=e.target.closest('button');
 try{
  const electrical=electricalEventAction(e,project.electrical);if(electrical){e.preventDefault();if(electrical.type.startsWith('export-')){exportElectrical(electrical.type);return true;}commit(p=>p.electrical=electricalAction(p.electrical,electrical));return true}
  if(!button)return false;
  if(button.dataset.fixingMode){const joint=allFixingJoints().find(j=>j.id===button.dataset.joint);if(joint){const layout=button.dataset.fixingMode==='manual'?toManualFixingLayout(joint,model):{mode:'auto'};commit(p=>setFixingLayout(p,joint,layout));toast(button.dataset.fixingMode==='manual'?'Positions manuelles activées.':'Répartition automatique rétablie.')}return true}
  if(button.dataset.fixingPick){pickFixing(button.dataset.joint,button.dataset.fixingPick);return true}
  if(button.dataset.baseFixings){pickJoint(button.dataset.baseFixings);return true}
  if(button.dataset.projectionExport){download(projectionSVG(model,button.dataset.projectionExport,{precision:project.manufacturing.precision}),filename()+'_'+button.dataset.projectionExport+'.svg','image/svg+xml');return true}
  if(button.dataset.electricExport){download(button.dataset.electricExport==='plan'?electricalPlanSVG(project.electrical):electricalSingleLineSVG(project.electrical),filename()+'_electrique_'+button.dataset.electricExport+'.svg','image/svg+xml');return true}
  if(button.dataset.workshopAction){commit(p=>p.workshop=workshopAction(p.workshop,button.dataset.workshopAction,{...button.dataset}));return true}
  if(button.dataset.projectAction){handleProjectAction(button);return true}
 }catch(error){toast(error.message);return true}
 return false;
}
document.addEventListener('submit',e=>{
 try{
  const electrical=electricalEventAction(e,project.electrical);if(electrical){e.preventDefault();commit(p=>p.electrical=electricalAction(p.electrical,electrical));return}
  const form=e.target;if(!form.matches('[data-fixing-form],[data-template-form],[data-workshop-form],[data-project-form]'))return;e.preventDefault();if(!form.checkValidity()){form.reportValidity();return}
  const data=Object.fromEntries(new FormData(form));for(const input of form.querySelectorAll('input[type="number"]'))data[input.name]=input.value===''?'':Number(input.value);for(const input of form.querySelectorAll('input[type="checkbox"]'))data[input.name]=input.checked;
  if(form.hasAttribute('data-fixing-form'))moveFixing(form.dataset.joint,form.dataset.id,[0,1,2].map(i=>Number(data['p'+i])));
  if(form.dataset.templateForm){const next=parametricTemplates(project,form.dataset.templateForm,data);const saved=projectLibrary.save(next,{id:null});useStoredProject(saved?.project?saved:{project:next});page='design';render();activateView('iso')}
  if(form.dataset.workshopForm)commit(p=>p.workshop=workshopAction(p.workshop,form.dataset.workshopForm,{...data,...form.dataset}));
  if(form.dataset.projectForm)handleProjectForm(form,data);
 }catch(error){toast(error.message)}
});
function handleProjectAction(button){
 const action=button.dataset.projectAction,id=button.dataset.projectId||button.dataset.id,revision=button.dataset.projectRevision||button.dataset.revision;
 if(action==='open')useStoredProject(projectLibrary.open(id));
 else if(action==='duplicate')useStoredProject(projectLibrary.duplicate(id));
 else if(action==='restore')useStoredProject(projectLibrary.restore(id,revision));
 else if(action==='save'||action==='save-current'){projectLibrary.save(project);renderContent();toast('Version enregistrée.')}
 else if(action==='save-copy'){useStoredProject(projectLibrary.save(project,{id:null,name:project.name+' (copie)'}))}
 else if(action==='new'){const next=normalizeProject({...DEFAULT_PROJECT,name:'Nouveau projet',mode:'free',freeParts:[],freeJoints:[]});useStoredProject(projectLibrary.save(next,{id:null}))}
 else if(action==='export'||action==='export-library'){download(projectLibrary.exportBackup(),'Atelier_tous_les_projets.json','application/json')}
 else if(action==='import'||action==='import-library')$('backup-input').click();
 else if(action==='remove'||action==='delete')modal('Supprimer ce projet local ?',`<p class="help-text">${esc(projectLibrary.list().find(x=>x.id===id)?.name||id)} et ses versions seront supprimés de ce navigateur.</p><button class="btn" data-project-action="export">Exporter tous les projets</button><button class="btn danger" data-project-action="confirm-delete" data-id="${esc(id)}">Supprimer ce projet</button>`);
 else if(action==='confirm-delete'){const active=projectLibrary.activeId()===id;projectLibrary.remove(id);$('modal').close();if(active){const first=projectLibrary.list()[0];if(first)useStoredProject(projectLibrary.open(first.id));else{useStoredProject(projectLibrary.save(normalizeProject({...DEFAULT_PROJECT,name:'Nouveau projet',mode:'free'}),{id:null}))}}renderContent()}
 else if(action==='rename')modal('Renommer le projet',`<form data-project-form="rename" data-id="${esc(id)}"><label class="field"><span>Nom</span><input name="name" value="${esc([...document.querySelectorAll('[data-project-name]')].find(x=>x.dataset.projectName===id)?.value||projectLibrary.list().find(x=>x.id===id)?.name)}" maxlength="80" required></label><button class="btn primary" type="submit">Renommer</button></form>`);
 else if(action==='history'||action==='versions')modal('Versions précédentes',`<div class="project-history">${projectLibrary.revisions(id).map(r=>`<button class="btn full" data-project-action="restore" data-id="${esc(id)}" data-revision="${esc(r.id)}">${esc(r.name||'Version')} · ${esc(new Date(r.savedAt||r.createdAt||r.at).toLocaleString('fr-FR'))}</button>`).join('')||'<p>Aucune version précédente.</p>'}</div>`);
 else throw Error('Action de projet non disponible : '+action);
}
function handleProjectForm(form,data){if(form.dataset.projectForm==='rename'){projectLibrary.rename(form.dataset.id,data.name);if(projectLibrary.activeId()===form.dataset.id){project.name=data.name;rebuild();persist()}$('modal').close();renderContent()}}
$('backup-input').addEventListener('change',async e=>{const file=e.target.files?.[0];if(!file)return;try{if(file.size>8e6)throw Error('Sauvegarde trop volumineuse.');const text=await file.text();projectLibrary.importBackup(text,{mode:'merge'});renderContent();toast('Projets importés dans Mes projets.')}catch(error){toast(error.message)}finally{e.target.value=''}});

function exportElectrical(type){const csv=type==='export-csv',value=csv?electricalCSV(project):type==='export-plan'?electricalPlanSVG(project,{interactive:false}):electricalSingleLineSVG(project);download(value,filename()+'_electrique_'+type.replace('export-','')+(csv?'.csv':'.svg'),csv?'text/csv;charset=utf-8':'image/svg+xml')}

// V0.12 — parcours compact, interactions de scène et préparation des coupes.
function primaryPage(value){return ['cuts','shopping','workshop'].includes(value)?'cuts':value==='electrical'?'fabrication':value==='templates'?'design':value}
function goToPage(value){
 if(!['design','connections','shopping','cuts','guide','workshop','templates','fabrication','electrical','projects'].includes(value))return;
 if(value!==page)cancelSceneInteraction();page=value;
 for(const details of document.querySelectorAll('.topbar details'))details.open=false;
 if(page==='connections'){viewport?.layer('joints',true);document.querySelector('[data-layer="joints"]')?.classList.add('active')}
 if(!['design','connections'].includes(page))setSceneFocus(false);
 render();
}
function updateWorkspaceNavigation(){
 const tabs=$('workspace-tabs');if(tabs){const group=['cuts','shopping','workshop'].includes(page)?[['cuts','Débit'],['workshop','Stock & références'],['shopping','Achats']]:page==='fabrication'||page==='electrical'?[['fabrication','Fabrication'],['electrical','Module électricité']]:[];tabs.innerHTML=group.map(([id,label])=>`<button class="btn small ${page===id?'primary':''}" data-page="${id}" aria-current="${page===id?'page':'false'}">${label}</button>`).join('');if(page==='design'){tabs.innerHTML=`<button class="btn small ${workspaceMode==='scene'?'primary':''}" data-workspace-mode="scene" aria-pressed="${workspaceMode==='scene'}">Construire en 3D</button><button class="btn small ${workspaceMode==='plan'?'primary':''}" data-workspace-mode="plan" aria-pressed="${workspaceMode==='plan'}">Plans & cotes</button>`}if(page==='fabrication')tabs.innerHTML=[['overview','Fabrication'],['paper','Plans à imprimer'],['technical','Coupes & montage']].map(([id,label])=>`<button class="btn small ${dossierTab===id?'primary':''}" data-dossier-tab="${id}" aria-current="${dossierTab===id?'page':'false'}">${label}</button>`).join('');tabs.classList.toggle('hidden',!group.length&&page!=='design')}
 const status=$('workflow-status');if(status)status.textContent=`${model.parts.filter(p=>['wood','wall','mesh','roof'].includes(p.material)).length} pièces · ${model.joints.length} liaisons · ${bom.filter(r=>r.toBuy>0&&!project.purchased[r.id]).length} références à acheter`;
 if($('focus-toggle'))$('focus-toggle').disabled=!['design','connections'].includes(page);
}
function setSceneFocus(active){sceneFocused=!!active&&['design','connections'].includes(page);document.body.classList.toggle('scene-focus',sceneFocused);$('focus-toggle')?.setAttribute('aria-pressed',String(sceneFocused));if($('focus-toggle'))$('focus-toggle').title=sceneFocused?'Quitter le plein cadre (F)':'Plein cadre 3D (F)';viewport?.resize()}
function updateViewControls(){
 const plan=['top','front','side','workplane'].includes(sceneView);
 document.querySelectorAll('[data-view]').forEach(b=>{b.classList.toggle('active',b.dataset.view===sceneView);b.setAttribute('aria-pressed',String(b.dataset.view===sceneView))});
 document.querySelectorAll('[data-navigation]').forEach(b=>{b.disabled=plan;b.classList.toggle('active',!plan&&b.dataset.navigation===navigationMode);b.setAttribute('aria-pressed',String(!plan&&b.dataset.navigation===navigationMode))});
 sceneChrome?.refresh();
 if($('view-orientation'))$('view-orientation').textContent=({top:'Dessus · X/Z',front:'Face · X/Y',side:'Côté · Z/Y',iso:'3D · Y vertical'})[sceneView]||'Plan de travail';
 if(plan)$('navigation-hint').textContent='Plan : glisser pour déplacer · Molette : zoomer · 3D pour tourner';
}
function activateView(name){
 cancelSceneInteraction();sceneView=name;
 if(name==='iso'){viewport?.setNavigation(navigationMode);setNavigation(navigationMode)}
 viewport?.view(name);updateViewControls();
}
function interactionStatus(text){
 const status=$('scene-interaction-status');if(status){status.textContent=text||'';status.classList.toggle('hidden',!text)}
 $('cancel-interaction')?.classList.toggle('hidden',!text);
}
function cancelSceneInteraction(){linkPending=null;keyboardSession=null;closeContextMenu(false);placementPending=null;sceneInteractionPending=false;planEditor?.clearPreview();viewport?.clearArrangementPreview?.();viewport?.cancelInteraction?.();viewport?.clearMeasurement?.();$('measure-toggle')?.setAttribute('aria-pressed','false');interactionStatus('');refreshMobile()}
function setupSceneCommands(){
 if(viewport){viewport.onInteractionStatus=interactionStatus;viewport.onCoordinates=point=>{const host=$('scene-coordinates');if(host)host.textContent=point?point.map((n,i)=>'XYZ'[i]+' '+fmt(n,3)).join(' · ')+' mm':'';};viewport.onInteractionStateChange=state=>{sceneInteractionPending=!!state.type;refreshMobile();const b=$('validate-interaction');if(b){b.classList.toggle('hidden',!state.canConfirm);b.disabled=!state.canConfirm}};}
 if($('validate-interaction'))$('validate-interaction').onclick=()=>viewport?.confirmInteraction?.();
 if($('focus-toggle'))$('focus-toggle').onclick=()=>setSceneFocus(!sceneFocused);
 if($('cancel-interaction'))$('cancel-interaction').onclick=cancelSceneInteraction;
 if($('measure-toggle'))$('measure-toggle').onclick=()=>{
  if(!viewport){toast('La mesure au clic nécessite la vue 3D. Les écarts entre pièces restent réglables dans les propriétés.');return}
  const was=$('measure-toggle').getAttribute('aria-pressed')==='true';cancelSceneInteraction();if(!was){viewport.beginMeasure();$('measure-toggle').setAttribute('aria-pressed','true')}
 };
 document.addEventListener('click',e=>{const button=e.target.closest('[data-layer-preset]');if(!button)return;
  const presets={structure:{mesh:false,roof:false,foundation:true,fixings:false,joints:false,wall:true,dimensions:false},complete:{mesh:true,roof:true,foundation:true,fixings:true,joints:false,wall:true,dimensions:true},plan:{mesh:false,roof:false,foundation:false,fixings:false,joints:false,wall:true,dimensions:true}};
  for(const [name,visible]of Object.entries(presets[button.dataset.layerPreset]||{})){viewport?.layer(name,visible);document.querySelector(`[data-layer="${name}"]`)?.classList.toggle('active',visible)}
  if(button.dataset.layerPreset==='plan')activateView('top');
 });
}
function makeCandidate(type){
 const p=project.mode==='free'?project:convertToFree(project),part=makePart(p,['mesh','roof','woodpanel'].includes(type)?'panel':type);
 if(type==='roof'){Object.assign(part,{material:'roof',group:'roof',label:'Panneau de couverture',corners:[[-1000,2200,-500],[1000,2200,-500],[1000,2200,500],[-1000,2200,500]]});part.a=[...part.corners[0]];part.b=[...part.corners[2]]}
 if(type==='mesh')part.label='Panneau de grillage';if(type==='woodpanel')Object.assign(part,{material:'wood',width:18,label:'Panneau de bois',group:'structure'});
 return part;
}
function startAddingPiece(type){
 if(project.freeParts.length>=1000){toast('Maximum 1 000 pièces dans un projet.');return}
 cancelSceneInteraction();const part=makeCandidate(type);placementPending={part,type,grid:resolveAdaptiveGrid(project)};
 if(workspaceMode==='plan'&&planEditor){planEditor.beginPlacement(part,{mode:['beam','brace'].includes(type)?'two-points':'point'});refreshMobile();return}
 if(viewport){viewport.beginPlacement(part,(placed,info)=>finishAddingPiece(placed,info));refreshMobile();return}
 const point=workplaneFrame(project.workplane).origin.toArray();
 modal('Placer la pièce',`<form data-place-piece><p class="help-text">Vue 3D indisponible : saisissez le point de pose sur le plan de travail. Les propriétés resteront modifiables.</p><div class="field-grid three">${['X','Y','Z'].map((axis,i)=>`<label class="field"><span>${axis} · mm</span><input name="p${i}" type="number" min="-100000" max="100000" step="any" value="${point[i]}" required></label>`).join('')}</div><button class="btn primary" type="submit">Placer la pièce</button><button class="btn" type="button" data-cancel-placement>Annuler</button></form>`);
}
function finishAddingPiece(part,info={}){
 if(!placementPending)return;const type=placementPending.type;placementPending=null;viewport?.cancelPlacement?.();planEditor?.clearPreview();interactionStatus('');
 let id=part.id;const ok=commit(p=>{const next=convertToFree(p);if(next.freeParts.length>=1000)throw Error('Maximum 1 000 pièces.');if(next.freeParts.some(p=>p.id===id)){id=makePart(next,part.kind).id}next.freeParts.push({...part,id});return withContactAttachment(next,info.snap?{...info.snap,sourceId:id}:null)});
 if(ok){offerContactAttachment(info.snap?{...info.snap,sourceId:id}:null);page='design';selectParts([id]);activeTool='translate';viewport?.setTool(activeTool);planEditor?.setTool('select');render();renderInspector();toast(`${part.label} placé${type==='brace'?'e':''}. Ajustez ses cotes dans les propriétés.`)}
}
function preparedParts(){return cuttingParts(model.parts,project.manufacturing)}
const cutPlaneOptions=[['unspecified','À définir'],['square','D’équerre à la pièce'],['horizontal','Horizontale'],['vertical','Verticale dans le plan de pente'],['vertical-x','Plan vertical X constant'],['vertical-z','Plan vertical Z constant']];
function cutSettingsPanel(){
 const parts=model.parts.filter(p=>p.material==='wood'&&p.kind!=='panel');const selected=parts.find(p=>p.id===cutSelection)||parts.find(p=>selectedIds.includes(p.id))||parts[0];if(!selected)return assemblySheetPanel()+'<p class="help-text">Ajoutez une pièce de bois pour préparer ses coupes.</p>';
 cutSelection=selected.id;const spec=project.manufacturing.cuts[selected.id]||{},analysis=analyzeTimberCut(selected,spec);
 return assemblySheetPanel()+`<label class="field"><span>Présentation des cotes</span><select data-cut-precision><option value="1" ${project.manufacturing.precision===1?'selected':''}>Au millimètre</option><option value="0.5" ${project.manufacturing.precision===.5?'selected':''}>Au demi-millimètre</option></select></label><p class="help-text">La géométrie et le débit gardent leur précision exacte.</p><div class="section-title">FICHE DE COUPE</div><label class="field"><span>Pièce à préparer</span><select data-cut-part>${parts.map(p=>`<option value="${esc(p.id)}" ${p.id===selected.id?'selected':''}>${esc(p.label)} · ${esc(p.id)}</option>`).join('')}</select></label><form data-cut-settings data-id="${esc(selected.id)}">${['a','b'].map(end=>`<label class="field"><span>Coupe ${end.toUpperCase()}</span><select name="${end}">${cutPlaneOptions.map(([value,label])=>`<option value="${value}" ${(spec[end]||'unspecified')===value?'selected':''}>${label}</option>`).join('')}</select></label>`).join('')}<label class="field"><span>Surlongueur totale de préparation · mm</span><input type="number" name="allowance" value="${spec.allowance||0}" min="0" max="1000" step="any" required></label><p class="help-text">Les plans de coupe passent par les extrémités de l’axe. Les angles sont géométriques ; le réglage de la scie dépend de la présentation du bois.</p><button class="btn primary full" type="submit">Appliquer les coupes au débit</button></form><p class="${analysis.status==='defined'?'help-text':'notice'}">${analysis.blankLength!==null?`Brut minimal avec surlongueur : ${formatDimension(analysis.blankLength,project.manufacturing.precision)} mm.`:'Brut à définir : complétez les deux coupes.'}${analysis.messages?.length?' '+analysis.messages.map(esc).join(' '):''}</p><button class="btn full" data-cut-export="${esc(selected.id)}">Exporter la fiche SVG</button>`;
}
document.addEventListener('submit',e=>{
 const form=e.target;
 if(form.matches('[data-place-piece]')){e.preventDefault();if(!form.checkValidity()||!placementPending)return;const fd=new FormData(form),point=[0,1,2].map(i=>Number(fd.get('p'+i)));try{finishAddingPiece(placePartOnWorkplane(placementPending.part,point,project.workplane,{grid:project.grid,snap:project.snap,gridFrame:project.assistance.gridSnap?placementPending.grid:null}));$('modal').close()}catch(error){toast(error.message)}return}
 if(form.matches('[data-commercial-lengths]')){e.preventDefault();if(!form.checkValidity())return;const fd=new FormData(form);try{const lengths=parseCommercialLengths([...fd.getAll('length'),fd.get('customLengths')]);commit(p=>p.workshop=applyCommercialLengths(p,lengths,{...model,parts:preparedParts()}));toast('Formats appliqués au débit et aux achats.')}catch(error){toast(error.message)}return}
 if(form.matches('[data-cut-settings]')){e.preventDefault();if(!form.checkValidity())return;const fd=new FormData(form),part=model.parts.find(p=>p.id===form.dataset.id),spec={a:fd.get('a'),b:fd.get('b'),allowance:Number(fd.get('allowance'))};try{const analysis=analyzeTimberCut(part,spec);if(analysis.status==='invalid')throw Error(analysis.messages.join(' '));commit(p=>p.manufacturing.cuts[part.id]=spec);toast('Coupes enregistrées. Le débit et les achats sont actualisés.')}catch(error){toast(error.message)}}
});
document.addEventListener('change',e=>{
 if(e.target.matches('[data-cut-precision]'))commit(p=>p.manufacturing.precision=Number(e.target.value));
 if(e.target.matches('[data-cut-part]')){cutSelection=e.target.value;$('sidebar').innerHTML=sidePanel();syncSelections($('sidebar'));hydrateIcons()}
});
for(const event of ['change','input'])document.addEventListener(event,e=>{const form=e.target.closest('[data-commercial-lengths]');if(form){const fd=new FormData(form);form.querySelector('[data-commercial-comparison]').innerHTML=timberLengthsComparison(project,{...model,parts:preparedParts()},[...fd.getAll('length'),fd.get('customLengths')],{precision:project.manufacturing.precision})}});
document.addEventListener('click',e=>{const cancel=e.target.closest('[data-cancel-placement]');if(cancel){cancelSceneInteraction();$('modal').close()}const button=e.target.closest('[data-cut-export]');if(button){const part=model.parts.find(p=>p.id===button.dataset.cutExport);if(part)download(timberCutSheetSVG(part,project.manufacturing.cuts[part.id],{precision:project.manufacturing.precision}),filename()+'_'+part.id+'_coupe.svg','image/svg+xml')}});

function assemblySheetPanel(){
 const joints=allFixingJoints();if(!joints.length)return '';
 return `<details class="side-details"><summary>Exporter une fiche de liaison</summary><form data-joint-sheet><label class="field"><span>Assemblage</span><select name="joint">${joints.map(j=>`<option value="${esc(j.id)}">${esc(j.id)} · ${esc(model.parts.find(p=>p.id===j.aPart)?.label||j.aPart)} ↔ ${esc(model.parts.find(p=>p.id===j.bPart)?.label||j.bPart)}</option>`).join('')}</select></label><button class="btn full" type="submit">Exporter la fiche SVG</button></form></details>`;
}
document.addEventListener('submit',e=>{if(e.target.matches('[data-joint-sheet]')){e.preventDefault();const id=new FormData(e.target).get('joint');download(jointSheetSVG(model,id,{project,precision:project.manufacturing.precision}),filename()+'_'+id+'_liaison.svg','image/svg+xml')}});


// Placement entre deux repères : aperçu sans mutation, application atomique et annulable.
function betweenWoods(){return project.freeParts.filter(p=>p.material==='wood'&&p.kind!=='panel')}
function openBetweenAssistant(centerExisting=false){
 const woods=betweenWoods();if(woods.length<2){toast('Ajoutez deux pièces de bois pour définir les repères.');return}
 cancelSceneInteraction();const picked=selectedIds.map(id=>woods.find(p=>p.id===id)).filter(Boolean),posts=woods.filter(p=>p.kind==='post'),base=picked.length>=2?picked:posts.length>=2?posts:woods;
 const a=base[0],b=base[1],moving=centerExisting?picked[2]||woods.find(p=>p.id!==a.id&&p.id!==b.id):a;
 const opts=selected=>woods.map(p=>`<option value="${esc(p.id)}" ${p.id===selected?'selected':''}>${esc(p.label)} · ${esc(p.id)}</option>`).join('');
 modal(centerExisting?'Centrer une pièce entre deux repères':'Insérer entre deux repères',`<form data-between-form><p class="help-text">Les deux repères restent fixes. L’aperçu montre la répartition avant de l’appliquer.</p><div class="field-grid"><label class="field"><span>Premier repère</span><select name="referenceA">${opts(a.id)}</select></label><label class="field"><span>Deuxième repère</span><select name="referenceB">${opts(b.id)}</select></label></div><label class="field"><span>Action</span><select name="mode"><option value="insert" ${!centerExisting?'selected':''}>Ajouter des pièces intermédiaires</option><option value="existing" ${centerExisting?'selected':''}>Repositionner une pièce existante</option></select></label><label class="field"><span data-between-source-label>Pièce à copier</span><select name="source">${opts(moving?.id||a.id)}</select></label><div class="field-grid"><label class="field"><span>Nombre de pièces à ajouter</span><input name="count" type="number" min="1" max="50" step="1" value="1" required></label><label class="field"><span>Répartition</span><select name="spacing"><option value="axes">Entraxes égaux</option><option value="faces">Espaces libres égaux</option></select></label></div><p class="help-text">Une pièce + entraxes égaux = exactement au milieu. Les mesures suivent le plan de travail. L’orientation, la section et la longueur de la pièce choisie sont conservées.</p><div data-between-preview class="between-preview" aria-live="polite"></div><p class="help-text">Ce placement exact prend la priorité sur la grille. Les pièces déjà présentes restent en place.</p><div class="placement-actions"><button class="btn" type="button" data-between-cancel>Annuler</button><button class="btn primary" type="submit" data-between-apply>Appliquer la pose</button></div></form>`);
 updateBetweenPreview(document.querySelector('[data-between-form]'));
}
function readBetweenForm(form){
 if(!form.checkValidity())throw Error('Vérifiez les champs : 1 à 50 pièces entières.');
 const d=new FormData(form),template=betweenWoods().find(p=>p.id===d.get('source')),existing=d.get('mode')==='existing';
 const count=existing?1:Number(d.get('count'));if(!existing&&project.freeParts.length+count>1000)throw Error('Cette pose dépasserait la limite de 1 000 pièces.');
 if(!template)throw Error('Choisissez une pièce à copier ou à déplacer.');
 const options={referenceA:d.get('referenceA'),referenceB:d.get('referenceB'),template,count,spacing:d.get('spacing'),existingId:existing?template.id:null,workplane:project.workplane};
 return {result:betweenArrangement(project.freeParts,options),options,existing,template};
}
function updateBetweenPreview(form){
 if(!form)return;const existing=form.elements.mode.value==='existing',count=form.elements.count;count.disabled=existing;
 form.querySelector('[data-between-source-label]').textContent=existing?'Pièce à déplacer':'Pièce à copier';
 const host=form.querySelector('[data-between-preview]'),apply=form.querySelector('[data-between-apply]');
 try{const {result}=readBetweenForm(form);host.innerHTML=betweenPreviewSVG(result)+`<div class="between-summary"><span>Distance entre repères <strong>${fmt(result.axisDistance,3)} mm</strong></span><span>${form.elements.spacing.value==='faces'?'Espace libre répété':'Entraxe répété'} <strong>${fmt(result.interval,3)} mm</strong></span></div>${(result.messages||[]).map(message=>`<p class="help-text">${esc(message)}</p>`).join('')}`;apply.disabled=false;viewport?.previewArrangement?.(result.parts,result.lines)}catch(error){host.innerHTML=`<p class="notice" role="status">${esc(error.message)}</p>`;apply.disabled=true;viewport?.clearArrangementPreview?.()}
}
function applyBetween(form){
 try{
  const {result,existing,template}=readBetweenForm(form),ids=[];
  const ok=commit(p=>{
   if(existing){const target=p.freeParts.find(p=>p.id===template.id);if(!target)throw Error('Pièce à déplacer introuvable.');Object.assign(target,result.parts[0],{id:template.id});ids.push(template.id)}
   else for(const [index,part]of result.parts.entries()){
    const id=makePart(p,part.kind).id;p.freeParts.push({...part,id,label:template.label+' · intermédiaire '+(index+1)});ids.push(id);
    if(p.manufacturing.cuts[template.id])p.manufacturing.cuts[id]=structuredClone(p.manufacturing.cuts[template.id]);
   }
  });
  if(ok){$('modal').close();viewport?.clearArrangementPreview?.();selectParts(ids);render();renderInspector();toast(existing?'Pièce centrée entre les deux repères.':ids.length+' pièce(s) placée(s) à intervalles réguliers.');}
 }catch(error){toast(error.message);updateBetweenPreview(form)}
}
document.addEventListener('click',e=>{
 const button=e.target.closest('[data-assist-action]');if(button){
  if(button.dataset.assistAction==='between')openBetweenAssistant();
  if(button.dataset.assistAction==='center-existing')openBetweenAssistant(true);
  if(button.dataset.assistAction==='grid-selection'){
   const ids=selectedIds.filter(id=>betweenWoods().some(p=>p.id===id));if(ids.length!==2){toast('Sélectionnez exactement deux pièces de bois.');return}
   cancelSceneInteraction();commit(p=>p.assistance={...p.assistance,gridSnap:true,gridMode:'adaptive',gridReference:'pair',gridA:ids[0],gridB:ids[1]});
   toast('Grille calée sur les deux repères sélectionnés.');
  }
 }
 if(e.target.closest('[data-between-cancel]'))$('modal').close();
});
document.addEventListener('change',e=>{
 const form=e.target.closest('[data-assistance-settings]');if(!form)return;
 if(!e.target.checkValidity()){e.target.setAttribute('aria-invalid','true');toast('Vérifiez le pas ou le nombre d’intervalles de la grille.');return}
 const data=new FormData(form),next={...project.assistance};
 for(const key of ['guides','guideSnap','gridSnap','placementShadow'])next[key]=data.has(key);
 for(const key of ['gridMode','gridStep','gridDivisions','gridReference','gridA','gridB'])if(data.has(key))next[key]=data.get(key);
 cancelSceneInteraction();commit(p=>p.assistance=normalizeAssistance(next));
});
for(const type of ['input','change'])document.addEventListener(type,e=>{const form=e.target.closest('[data-between-form]');if(form){
 if(type==='change'&&e.target.name==='mode'&&e.target.value==='existing'&&[form.elements.referenceA.value,form.elements.referenceB.value].includes(form.elements.source.value)){const candidate=betweenWoods().find(p=>![form.elements.referenceA.value,form.elements.referenceB.value].includes(p.id));if(candidate)form.elements.source.value=candidate.id}
 updateBetweenPreview(form);
}});
document.addEventListener('submit',e=>{if(e.target.matches('[data-between-form]')){e.preventDefault();applyBetween(e.target)}if(e.target.matches('[data-assistance-settings]')){e.preventDefault();e.target.querySelector('input,select')?.dispatchEvent(new window.Event('change',{bubbles:true}))}});

// V0.14 / V0.15 : une géométrie commune, gestes tactiles et cotation associative.
function refreshMobile(){
 sceneChrome?.refresh();
 const pending=!!placementPending||!!planEditor?.getPending?.()||sceneInteractionPending;
 mobileUI?.refresh({page,sceneActive:['design','connections'].includes(page),mode:workspaceMode==='plan'?'plan':'3d',selectedCount:selectedIds.length+(selectedJoint||selectedFixing?1:0),pendingAction:pending,canConfirm:workspaceMode==='plan'?!!planEditor?.getPending?.():!!viewport?.canConfirmInteraction?.(),multiSelect});
 document.querySelectorAll('#multi-toggle,[data-chrome-multi],[data-plan-action="multi"],[data-mobile-action="multi"]').forEach(b=>{b.classList.toggle('active',multiSelect);b.setAttribute('aria-pressed',String(multiSelect))});
}
function toggleMultiSelection(){multiSelect=!multiSelect;viewport?.setMultiSelect?.(multiSelect);planEditor?.setMulti(multiSelect);refreshMobile();toast(multiSelect?'Sélection multiple : touchez les pièces à ajouter ou retirer.':'Sélection simple.');}
function refreshDrawing(){
 const active=page==='design'&&workspaceMode==='plan';document.body.classList.toggle('plan-mode',active);$('scene-area')?.classList.toggle('plan-mode',active);$('plan-area')?.classList.toggle('hidden',!active);
 if(planEditor&&model){planEditor.set(project,model,selectedIds);const detail=document.querySelector('[data-plan-detail]');if(detail)detail.value=project.drawing.showDimensions===false?'none':project.drawing.automatic===false?'saved':project.drawing.autoLevel;for(const field of document.querySelectorAll('.plan-display-tools [data-drawing-field]'))field.checked=!!project.drawing[field.dataset.drawingField];planEditor.setMulti(multiSelect);document.querySelectorAll('[data-plan-view]').forEach(b=>{b.classList.toggle('active',b.dataset.planView===project.drawing.view);b.setAttribute('aria-pressed',String(b.dataset.planView===project.drawing.view))});}
}
function setWorkspaceMode(mode){
 if(!['scene','plan'].includes(mode))return;cancelSceneInteraction();workspaceMode=mode;if(page!=='design')page='design';setSceneFocus(false);render();renderInspector();if(mode==='plan')planEditor?.fit();else viewport?.resize();
}
function planPendingChanged(pending){
 $('plan-confirm')?.classList.toggle('hidden',!pending);$('plan-cancel')?.classList.toggle('hidden',!pending&&!placementPending);refreshMobile();
}
function setupDrawing(){
 planEditor=new PlanEditor($('plan-canvas'),{
  onSelect:handleSceneSelection,
  onDimension:id=>openDimensionEditor(id),
  onMove:(ids,delta)=>{const ok=commit(p=>transformSelection(p,ids,{delta}));if(ok){renderInspector();toast('Déplacement exact appliqué.')}return ok;},
  onPlace:part=>finishAddingPiece(part),
  onPreviewChange:planPendingChanged,
  onStatus:text=>{if($('plan-status'))$('plan-status').textContent=text||'Touchez une pièce ou une cote · glissez pour naviguer';}
 });
 mobileUI=setupMobileUI({getContext:()=>({page,sceneActive:['design','connections'].includes(page),mode:workspaceMode==='plan'?'plan':'3d',selectedCount:selectedIds.length+(selectedJoint||selectedFixing?1:0),pendingAction:!!placementPending||!!planEditor?.getPending?.()||sceneInteractionPending,canConfirm:workspaceMode==='plan'?!!planEditor?.getPending?.():!!viewport?.canConfirmInteraction?.(),multiSelect}),onAction:action=>{
  if(action==='aids'){modal('Aides au placement',sceneSettingsPanel(project,selectedIds));renderSceneSettings();const details=document.querySelector('#modal-content .scene-settings-menu');if(details)details.open=true;}if(action==='add')openAddPalette();if(action==='multi')toggleMultiSelection();if(action==='cancel')cancelSceneInteraction();if(action==='confirm'){if(workspaceMode==='plan')planEditor?.confirmPreview();else viewport?.confirmInteraction?.();refreshMobile();}
 }});
 $('plan-confirm').onclick=()=>{planEditor.confirmPreview();refreshMobile()};$('plan-cancel').onclick=cancelSceneInteraction;
 $('multi-toggle').onclick=toggleMultiSelection;
 document.querySelector('[data-chrome-multi]')?.addEventListener('click',toggleMultiSelection);
 document.querySelector('[data-chrome-touch]')?.addEventListener('click',()=>$('touch-rotate').click());
 $('touch-rotate').onclick=()=>{touchMode=touchMode==='pan'?'rotate':'pan';viewport?.setTouchMode?.(touchMode);$('touch-rotate').classList.toggle('active',touchMode==='rotate');$('touch-rotate').setAttribute('aria-pressed',String(touchMode==='rotate'));document.querySelector('[data-chrome-touch]')?.setAttribute('aria-pressed',String(touchMode==='rotate'));toast(touchMode==='rotate'?'Un doigt pivote la vue. Deux doigts déplacent et zooment.':'Un doigt déplace la vue. Pincez pour zoomer.');};
}
function openAddPalette(){
 cancelSceneInteraction();modal('Ajouter une pièce',`<p class="help-text">${workspaceMode==='plan'?'Dans le plan : un point pour poser un poteau, deux points pour tracer un chevron ou une diagonale.':'Touchez le plan pour préparer la pose. Sur téléphone, validez l’aperçu pour ajouter la pièce.'}</p><div class="add-grid">${[['post','Poteau'],['beam','Chevron / traverse'],['brace','Diagonale'],['mesh','Grillage'],['woodpanel','Panneau bois'],['roof','Toiture'],['wall','Mur existant']].map(([type,label])=>`<button class="btn" type="button" data-plan-add="${type}">${label}</button>`).join('')}</div>`);
}
function newDimension(){cancelSceneInteraction();modal('Enregistrer une cote',createDimensionForm(project,model,selectedIds));syncDimensionCreate();}
function syncDimensionCreate(){const form=document.querySelector('[data-dimension-create]');if(!form)return;const type=form.elements.type.value;form.querySelector('[data-dimension-second]').hidden=type==='length';form.querySelector('[data-dimension-axis]').hidden=['length','angle'].includes(type);}
function openDimensionEditor(id){
 cancelSceneInteraction();let dimension=project.drawing.dimensions.find(d=>d.id===id),base=project,automatic=false;
 if(!dimension){
  const m=getPlanDimensions(project,model,{view:project.drawing.view,limit:48}).find(d=>d.id===id);
  if(!m)return;
  try{const drawing=createDimension(project,m.type,m.partIds,{axis:m.axis,view:project.drawing.view,model});dimension=drawing.dimensions.at(-1);base={...project,drawing};automatic=true;}
  catch{modal('Mesure automatique',`<div class="adaptive-readout"><span>${esc(m.label)}</span><strong>${fmt(m.value,3)} ${esc(m.unit||'mm')}</strong></div><p class="help-text">Cette mesure d’ensemble est calculée à partir du projet. Sélectionnez une pièce ou deux références pour créer une cote modifiable.</p>`);return;}
 }
 const measurement=measureDimension(base,dimension,model);dimensionEditing={id:dimension.id,dimension,automatic,base};dimensionPreview=null;
 modal('Mesure et dimension',editDimensionForm(base,model,dimension,measurement,{automatic}));updateDimensionPreview(document.querySelector('[data-dimension-edit]'));
}
function dimensionEditBase(){return dimensionEditing?.automatic?{...project,drawing:dimensionEditing.base.drawing}:project;}
function updateDimensionPreview(form){
 if(!form||!dimensionEditing)return;const host=form.querySelector('[data-dimension-edit-preview]');if(!host)return;
 const input=form.elements.value?.value||'',options={move:form.elements.move?.value||'b',anchor:form.elements.anchor?.value||'a'};
 const result=previewDimensionEdit(dimensionEditBase(),dimensionEditing.id,input,options);dimensionPreview=result;
 const button=form.querySelector('[data-dimension-apply]');if(button)button.disabled=!result.ok;
 if(!result.ok){host.innerHTML=`<p class="notice">${esc(result.message||'Valeur non valide.')}</p>`;planEditor?.clearPreview();viewport?.clearArrangementPreview?.();return;}
 const parts=result.project.freeParts.filter(p=>(result.movedIds||[]).includes(p.id));
 const changed=parts.length?parts:result.project.freeParts.filter(p=>JSON.stringify(p)!==JSON.stringify(project.freeParts.find(q=>q.id===p.id)));
 planEditor?.previewParts(changed);viewport?.previewArrangement?.(changed,[]);
 const measurement=measureDimension(result.project,result.project.drawing.dimensions.find(d=>d.id===dimensionEditing.id),buildProject(result.project));
 host.innerHTML=`<div class="adaptive-readout"><span>Après application</span><strong>${fmt(measurement.value,3)} ${esc(measurement.unit||'mm')}</strong></div><p class="help-text">${esc(result.message||'Aperçu seulement : la géométrie et les achats sont inchangés jusqu’à validation.')}${result.fixedId?' Repère fixe : '+esc(result.fixedId)+'.':''}</p>`;
}
function saveDimensionName(form){
 if(!dimensionEditing)return;const {id,automatic,dimension}=dimensionEditing,label=form.elements.label.value;
 const ok=commit(p=>{if(automatic){p.drawing=createDimension(p,dimension.type,[dimension.aPart,dimension.bPart].filter(Boolean),{...dimension,label,model});}else{const d=p.drawing.dimensions.find(d=>d.id===id);if(d)d.label=label;}});
 if(ok){$('modal').close();toast('Cote enregistrée. La géométrie reste inchangée.');}
}
document.addEventListener('click',e=>{
 const mode=e.target.closest('[data-workspace-mode]');if(mode){setWorkspaceMode(mode.dataset.workspaceMode);return;}
 const view=e.target.closest('[data-plan-view]');if(view){cancelSceneInteraction();commit(p=>p.drawing.view=view.dataset.planView);return;}
 const add=e.target.closest('[data-plan-add]');if(add){const type=add.dataset.planAdd;if($('modal').open){$('modal').addEventListener('close',()=>startAddingPiece(type),{once:true});$('modal').close();}else startAddingPiece(type);return;}
 const open=e.target.closest('[data-dimension-open]');if(open){openDimensionEditor(open.dataset.dimensionOpen);return;}
 const del=e.target.closest('[data-dimension-delete]');if(del){commit(p=>p.drawing.dimensions=p.drawing.dimensions.filter(d=>d.id!==del.dataset.dimensionDelete));$('modal').close();return;}
 if(e.target.closest('[data-dimension-cancel]')){$('modal').close();return;}
 if(e.target.closest('[data-dimension-save]')){saveDimensionName(e.target.closest('form'));return;}
 if(e.target.closest('[data-dimension-preview]')){updateDimensionPreview(e.target.closest('form'));return;}
 const action=e.target.closest('[data-plan-action]')?.dataset.planAction;
 if(action==='aids'){modal('Accrochages du plan',sceneSettingsPanel(project,selectedIds));renderSceneSettings();document.querySelector('#modal-content .scene-settings-menu').open=true;}
 if(action==='dimension')newDimension();if(action==='add')openAddPalette();if(action==='fit')planEditor?.fit();if(action==='multi')toggleMultiSelection();
 if(['select','move'].includes(action)){cancelSceneInteraction();planEditor?.setTool(action==='move'?'move':'select');activeTool=action==='move'?'translate':'select';refreshMobile();}
 if(action==='export')download(planEditor.exportSVG(),filename()+'_'+project.drawing.view+'_cotes.svg','image/svg+xml');
});
document.addEventListener('change',e=>{
 if(e.target.matches('[data-plan-detail]')){const value=e.target.value;cancelSceneInteraction();commit(p=>{p.drawing.showDimensions=value!=='none';p.drawing.automatic=!['none','saved'].includes(value);if(['overall','spacing','full'].includes(value))p.drawing.autoLevel=value});planEditor?.fit();return;}
 const key=e.target.dataset.drawingField;if(key){cancelSceneInteraction();commit(p=>p.drawing[key]=e.target.type==='checkbox'?e.target.checked:key==='precision'?Number(e.target.value):e.target.value);}
 if(e.target.closest('[data-dimension-create]'))syncDimensionCreate();
 if(e.target.closest('[data-dimension-edit]'))updateDimensionPreview(e.target.closest('form'));
});
document.addEventListener('input',e=>{if(e.target.closest('[data-dimension-edit]'))updateDimensionPreview(e.target.closest('form'));});
document.addEventListener('submit',e=>{
 const form=e.target;
 if(form.matches('[data-dimension-create]')){
  e.preventDefault();if(!form.checkValidity())return;const data=new FormData(form),type=data.get('type'),ids=[data.get('aPart'),...(type==='length'?[]:[data.get('bPart')])];
  try{const drawing=createDimension(project,type,ids,{axis:data.get('axis'),label:data.get('label'),view:data.get('view'),model}),id=drawing.dimensions.at(-1).id;if(commit(p=>{p.drawing=drawing;}))openDimensionEditor(id);}catch(error){const out=form.querySelector('[data-dimension-create-error]');out.hidden=false;out.textContent=error.message;}
 }
 if(form.matches('[data-dimension-edit]')){
  e.preventDefault();updateDimensionPreview(form);if(!dimensionPreview?.ok)return;const next=dimensionPreview.project,d=next.drawing.dimensions.find(d=>d.id===dimensionEditing.id);if(d)d.label=form.elements.label.value;
  if(commit(()=>next)){$('modal').close();toast('Dimension appliquée. Les quantités et le plan sont actualisés.');}
 }
});

// V0.16–V0.18 : feuilles à l'échelle, vues techniques et installation mobile.
function currentTechnicalView(options={}){return buildTechnicalView(project,model,{...project.technical,...options});}
function currentDrawingSheets(){
 const extraSheets=[],settings=project.technical;
 if(settings.includeInDossier)extraSheets.push({...currentTechnicalView(),id:'technical-current'});
 if(settings.includeSteps)for(let i=0;i<settings.assemblySteps.length;i++){
  const result=currentTechnicalView({type:'exploded',view:settings.view==='section'?'iso':settings.view,selectionIds:[],stepIndex:i});
  extraSheets.push({...result,id:'assembly-'+settings.assemblySteps[i].id,title:`Montage ${i+1} · ${settings.assemblySteps[i].label}`});
 }
 return buildDrawingSheets(project,model,{...project.paper,extraSheets});
}
function setDossierTab(tab){
 if(!['overview','paper','technical'].includes(tab))return;
 cancelSceneInteraction();$('modal').close();dossierTab=tab;goToPage('fabrication');
}
function printDrawingSheets(){
 const sheets=currentDrawingSheets();if(!sheets.length)throw Error('Choisissez au moins une vue à imprimer.');
 $('paper-print-frame')?.remove();const frame=document.createElement('iframe');
 frame.id='paper-print-frame';frame.title='Feuilles prêtes à imprimer';frame.setAttribute('aria-hidden','true');
 frame.style.cssText='position:fixed;width:1px;height:1px;left:-10000px;top:0;border:0;pointer-events:none';
 frame.onload=()=>{try{frame.contentWindow?.addEventListener('afterprint',()=>frame.remove(),{once:true});frame.contentWindow?.focus();frame.contentWindow?.print();}catch{toast('L’impression n’a pas pu démarrer. Téléchargez le PDF pour imprimer les feuilles.');}};
 frame.srcdoc=printHTML(sheets,{title:project.name});document.body.append(frame);$('modal').close();
}
function exportDrawingSheets(action,id){
 if(action==='print'){printDrawingSheets();return;}
 const sheets=currentDrawingSheets();if(!sheets.length)throw Error('Choisissez au moins une vue dans les réglages du dossier.');
 if(action==='pdf'){download(pdfBytes(sheets,{title:project.name,author:project.paper.author}),filename()+'_plans.pdf','application/pdf');toast(`${sheets.length} feuille(s) PDF exportée(s). Imprimez à 100 % pour conserver l’échelle.`);}
 else if(action==='svg'){const sheet=sheets.find(s=>s.id===id)||sheets[0];download(sheetSVG(sheet),filename()+'_feuille_'+sheet.number+'.svg','image/svg+xml');}
}
function syncTechnicalForm(){
 const form=document.querySelector('[data-technical-form]');if(!form)return;
 const type=form.elements.type?.value||'section';if(type!=='section'&&form.elements.view?.value==='section')form.elements.view.value='iso';form.querySelectorAll('[data-technical-kind]').forEach(el=>el.hidden=el.dataset.technicalKind!==type);
}
function handleStepAction(action,button){
 const settings=project.technical,steps=settings.assemblySteps,index=steps.findIndex(s=>s.id===button.dataset.stepId);
 if(action==='add-step'){
  const form=document.querySelector('[data-technical-form]'),raw=button.dataset.stepSource==='checked'?[...form.querySelectorAll('[name="partIds"]:checked')].map(el=>el.value):selectedIds;
  const ids=[...new Set(raw)].filter(id=>model.parts.some(p=>p.id===id));if(!ids.length)throw Error('Sélectionnez les pièces de cette étape dans la liste ou dans la construction.');
  if(steps.length>=30)throw Error('Le dossier accepte jusqu’à 30 étapes de montage.');
  let next=1;while(steps.some(s=>s.id==='STEP-'+next))next++;
  commit(p=>{p.technical.assemblySteps.push({id:'STEP-'+next,label:form?.elements.stepLabel?.value?.trim()||'Étape '+(steps.length+1),partIds:ids,groups:[]});p.technical.stepIndex=p.technical.assemblySteps.length-1;p.technical.type='exploded';p.technical.selectionIds=[];if(p.technical.view==='section')p.technical.view='iso';});toast('Étape ajoutée. Son nom et son ordre restent modifiables.');return;
 }
 if(action==='all-steps'){commit(p=>{p.technical.stepIndex=null;});return;}
 if(action==='reset-steps'){commit(p=>{p.technical.stepIndex=-1;});return;}
 if(action==='prev-step'||action==='next-step'){
  if(!steps.length)return;const current=settings.stepIndex==null?-1:settings.stepIndex;
  commit(p=>{p.technical.stepIndex=Math.max(-1,Math.min(steps.length-1,current+(action==='next-step'?1:-1)));});return;
 }
 if(index<0)throw Error('Cette étape n’existe plus.');
 if(action==='step-save'){
  const input=[...document.querySelectorAll('[data-step-label]')].find(el=>el.dataset.stepLabel===button.dataset.stepId),label=input?.value?.trim();
  if(!label)throw Error('Donnez un nom à cette étape.');commit(p=>{p.technical.assemblySteps[index].label=label;});return;
 }
 if(action==='step-delete'){commit(p=>{p.technical.assemblySteps.splice(index,1);p.technical.stepIndex=null;});return;}
 if(action==='step-up'||action==='step-down'){
  const to=index+(action==='step-up'?-1:1);if(to<0||to>=steps.length)return;
  commit(p=>{const items=p.technical.assemblySteps;[items[index],items[to]]=[items[to],items[index]];p.technical.stepIndex=null;});
 }
}
function setupOfflineController(){
 offlineUI=setupOfflineUI({window,document,navigator:window.navigator,location:window.location,beforeUpdate:()=>{persist();if(!storageAvailable)throw Error('Exportez le projet JSON avant de préparer la mise à jour : la sauvegarde du navigateur est indisponible.');},onStatus:state=>{
  const panel=$('offline-panel');if(panel)panel.innerHTML=renderOfflinePanel(state);
  const label=document.querySelector('[data-offline-status]');if(label)label.textContent=state.online===false?'Hors connexion':state.offlineReady?'Disponible hors connexion':'';
 }});
}
function openOfflinePanel(){modal('Installation et hors connexion',`<div id="offline-panel">${renderOfflinePanel(offlineUI?.getState?.())}</div><div class="divider"></div><p class="help-text">Les projets restent dans ce navigateur. Un export JSON permet de les transférer ou de conserver une copie indépendante.</p><button class="btn" data-action="save">Sauvegarder ce projet JSON</button> <button class="btn" data-project-action="export-library">Sauvegarder tous mes projets</button>`);}
document.addEventListener('click',async e=>{
 const tab=e.target.closest('[data-dossier-tab]');if(tab){setDossierTab(tab.dataset.dossierTab);return;}
 if(e.target.closest('[data-open-offline]')){openOfflinePanel();return;}
 const offline=e.target.closest('[data-offline-action]');if(offline){
  const method={install:'install','check-update':'checkForUpdate','apply-update':'applyUpdate',persist:'requestPersistence',retry:'retry'}[offline.dataset.offlineAction];
  if(method)try{await offlineUI?.[method]?.();}catch(error){toast(error.message||'Cette action est indisponible sur ce navigateur.');}return;
 }
 const paper=e.target.closest('[data-paper-action]');if(paper){try{exportDrawingSheets(paper.dataset.paperAction,paper.dataset.sheetId);}catch(error){toast(error.message);}return;}
 const technical=e.target.closest('[data-technical-action]');if(!technical)return;
 try{const action=technical.dataset.technicalAction;
  if(action==='svg'){const result=currentTechnicalView();download(result.svg,filename()+'_'+project.technical.type+'.svg','image/svg+xml');}
  else handleStepAction(action,technical);
 }catch(error){toast(error.message);}
});
document.addEventListener('change',e=>{if(e.target.closest('[data-technical-form]')&&e.target.name==='type')syncTechnicalForm();});
document.addEventListener('submit',e=>{
 const form=e.target;if(!form.matches('[data-paper-form],[data-technical-form]'))return;e.preventDefault();if(!form.checkValidity())return;
 const fd=new FormData(form),values=Object.fromEntries(fd.entries());
 if(form.matches('[data-paper-form]')){
  const views=fd.getAll('views');if(!views.length&&!project.technical.includeInDossier&&!project.technical.includeSteps){toast('Choisissez au moins une vue ou ajoutez une vue technique au dossier.');return;}
  commit(p=>{p.paper=normalizeSheetSettings({...p.paper,...values,views,automatic:fd.has('automatic')});});toast('Mise en page enregistrée.');
 }else{
  delete values.partIds;delete values.stepLabel;
  if(values.type!=='section'&&values.view==='section')values.view='iso';
  const chosen=selectedIds.filter(id=>model.parts.some(part=>part.id===id));
  values.selectionIds=values.type==='detail'&&!values.jointId?(chosen.length?chosen:project.technical.selectionIds):[];
  if(values.type!==project.technical.type)values.stepIndex=null;
  commit(p=>{p.technical=normalizeTechnicalViewOptions({...p.technical,...values,labels:fd.has('labels'),dimensions:fd.has('dimensions'),includeFixings:fd.has('includeFixings'),includeInDossier:fd.has('includeInDossier'),includeSteps:fd.has('includeSteps')});});syncTechnicalForm();toast('Vue technique enregistrée. Les pièces du projet sont inchangées.');
 }
});

// V0.19 — commandes directement sur les pièces et les cotes.
function isEditingText(){const el=document.activeElement;return !!(el&&(['INPUT','TEXTAREA','SELECT'].includes(el.tagName)||el.isContentEditable||el.closest?.('[contenteditable="true"],[contenteditable=""]')));}
function handleSceneSelection(part,event={}){
 closeContextMenu(false);
 if(linkPending){
  if(!part||!['wood','wall'].includes(part.material)||part.kind==='panel'||part.id===linkPending){toast('Choisissez une autre pièce de bois ou un mur. Échap pour annuler.');return;}
  const first=linkPending;cancelSceneInteraction();selectParts([first,part.id]);connectModal();return;
 }
 if(part?.kind==='fixing'){pickFixing(part.jointId,part.id);return;}
 if(part?.kind==='joint'){pickJoint(part.id);return;}
 if(part&&project.mode==='free'&&!project.freeParts.some(p=>p.id===part.id)){const owner=part.id.replace(/^(PIED-|F-)/,'');part=project.freeParts.find(p=>p.id===owner)||null;}
 const additive=!!(multiSelect||event.shiftKey||event.ctrlKey||event.metaKey||event.additive),ids=part?[part.id]:[];
 const solo=!!part&&(event.altKey||!additive&&selectedIds.includes(part.id)&&(selectedIds.length>1||soloSelectionId===part.id));
 const expanded=part&&project.mode==='free'&&!solo?connectedSelection(project,ids,{includeGroups:true,respectUngrouped:true}):ids;
 selectParts(expanded,additive);if(solo&&!additive)soloSelectionId=part.id;
}
function closeContextMenu(restoreFocus=true){
 if(!contextMenu)return;contextMenu.remove();contextMenu=null;
 if(restoreFocus&&contextReturnFocus?.isConnected)contextReturnFocus.focus?.();contextReturnFocus=null;
}
function openContextMenu(part=null,event={}){
 sceneChrome?.closeMenus();
 if(viewport?.transform?.dragging||viewport?.pendingTransform||viewport?.panelDrag||viewport?.pendingPanel)return;
 closeContextMenu(false);keyboardSession=null;
 if(part?.kind==='fixing'){pickFixing(part.jointId,part.id);return;}
 if(part?.kind==='joint'){pickJoint(part.id);return;}
 if(part&&!selectedIds.includes(part.id))handleSceneSelection(part,event);
 contextReturnFocus=document.activeElement;
 contextMenu=document.createElement('div');contextMenu.id='scene-context-menu';contextMenu.className='scene-context-menu';contextMenu.setAttribute('aria-label','Actions des pièces');
 contextMenu.innerHTML=contextMenuHTML(project,selectedIds,{isolated:!!isolatedIds});document.body.append(contextMenu);
 const rect=contextMenu.getBoundingClientRect(),w=window.innerWidth||1024,h=window.innerHeight||768;
 const anchor=$('context-actions-open')?.getBoundingClientRect();
 const x=Number.isFinite(event.clientX)?event.clientX:anchor?.left||w/2,y=Number.isFinite(event.clientY)?event.clientY:anchor?.bottom||90;
 contextMenu.style.left=Math.max(8,Math.min(x,w-(rect.width||280)-8))+'px';contextMenu.style.top=Math.max(8,Math.min(y,h-(rect.height||420)-8))+'px';contextMenu.style.setProperty('--context-room',Math.max(120,h-parseFloat(contextMenu.style.top)-8)+'px');
 contextMenu.querySelector('button:not(:disabled),summary')?.focus();
}
function sceneTool(tool){
 if(tool==='resize'){
  const part=selectedIds.length===1?project.freeParts.find(p=>p.id===selectedIds[0]):null,frame=panelResizeFrame(part);
  if(!frame.available){toast(frame.message||'Sélectionnez un panneau rectangulaire.');return;}
  if(workspaceMode==='plan')setWorkspaceMode('scene');
  if(!viewport){toast('Les poignées nécessitent WebGL. Les dimensions restent modifiables dans les propriétés.');return;}
 }
 cancelSceneInteraction();activeTool=tool;viewport?.setTool(tool);planEditor?.setTool(tool==='translate'?'move':'select');document.querySelectorAll('[data-tool]').forEach(b=>b.classList.toggle('active',b.dataset.tool===tool));
}
function runContextAction(action,button){
 closeContextMenu(false);keyboardSession=null;
 if(action==='select-all'){selectParts(project.freeParts.map(p=>p.id));return;}
 if(action==='add'){openAddPalette();return;}
 if(action==='show-all'){isolatedIds=null;viewport?.setIsolation?.(null);toast('Toutes les pièces sont de nouveau visibles.');return;}
 if(action==='properties'){sceneChrome?.show('properties');if(mobileUI?.getState?.().mobile)mobileUI.open('properties');$('inspector')?.querySelector('input,select,button')?.focus();return;}
 if(action==='focus'){viewport?.focusSelection?.(selectedIds);if(workspaceMode==='plan')planEditor?.fit();return;}
 if(action==='isolate'){isolatedIds=[...selectedIds];viewport?.setIsolation?.(isolatedIds);toast('Sélection isolée. Actions → Tout afficher pour revenir.');return;}
 if(action==='measure'){if(selectedIds.length===2){openSceneDistance({referenceIds:[...selectedIds],measure:'faces'});return;}$('measure-toggle')?.click();return;}
 if(action==='attach'){openAttachmentEditor();return;}if(action==='adapt'){openAdaptationEditor();return;}if(action==='detach'){for(const id of selectedIds)commit(p=>detachAttachment(p,id));return;}
 if(action==='link'){connectModal();return;}
 if(action==='link-target'){
  const first=selectedIds[0];cancelSceneInteraction();if(!first)return;linkPending=first;
  interactionStatus('Lier : cliquez sur la deuxième pièce · Échap pour annuler');toast('Cliquez sur la pièce à relier.');return;
 }
 if(action==='select-connected'){selectParts(connectedSelection(project,selectedIds));return;}
 if(action==='select-group'){selectParts(button?.dataset.contextGroup?project.freeParts.filter(p=>p.groupName===button.dataset.contextGroup).map(p=>p.id):selectionGroupIds(project,selectedIds));return;}
 if(action==='group'){modal('Créer un groupe',contextGroupForm(project,selectedIds));return;}
 if(action==='ungroup'){const ids=selectionGroupIds(project,selectedIds),first=selectedIds[0];cancelSceneInteraction();if(commit(p=>ungroupSelection(p,ids))){selectParts([first]);soloSelectionId=first;toast('Pièces dégroupées · fixations et attaches conservées.');}return;}
 if(action==='align'){modal('Aligner les pièces',contextAlignForm(project,selectedIds));return;}
 if(action==='distribute'){modal('Répartir les pièces',contextDistributeForm(project,selectedIds));return;}
 if(action==='ground'||action==='ground-individual'){cancelSceneInteraction();if(commit(p=>groundSelection(p,selectedIds,{individual:action==='ground-individual'})))toast(action==='ground'?'Sélection posée au sol, positions relatives conservées.':'Chaque pièce a été posée au sol.');return;}
 if(action==='duplicate'||action==='delete'){editorClick({target:{closest:()=>({dataset:{editor:action==='duplicate'?'duplicate-fast':'delete'}})}});return;}
 if(action==='resize'){sceneTool('resize');return;}
 if(action==='workplane-reset'){commit(p=>{p.workplane={type:'xz',offset:0,lock:false,visible:true};});return;}
 if(action.startsWith('workplane-')){const part=project.freeParts.find(p=>p.id===selectedIds[0]),face={top:'top',side:'right',end:'b'}[action.slice(10)];if(face){commit(p=>{p.workplane=planeFromPart(part,face);});toast('Plan de travail pris sur la pièce.');}return;}
}
function applyPanelResize(id,corners){
 const part=project.freeParts.find(p=>p.id===id);if(!part)return false;
 const resize=surfaceResizePatch(part,corners);if(!resize.available){toast(resize.message);return false;}
 const ok=commit(p=>{const target=p.freeParts.find(x=>x.id===id);Object.assign(target,resize.patch);});
 if(ok)toast(part.kind==='wall'?'Mur redimensionné · épaisseur conservée.':'Panneau redimensionné · quantités et achats recalculés.');return ok;
}
function openSceneDistance(data={}){
 const ids=data.referenceIds||selectedIds;
 if(ids.length!==2){toast('Sélectionnez deux bois pour régler leur distance.');return;}
 const parts=ids.map(id=>project.freeParts.find(p=>p.id===id));
 try{
  const result=betweenMeasurements(parts[0],parts[1],project.workplane),measure=data.measure==='axes'?'axes':'faces',value=measure==='axes'?result.axisDistance:result.clearGap;
  cancelSceneInteraction();sceneDistance={referenceIds:[...ids],measure};
  modal(measure==='axes'?'Régler l’entraxe':'Régler l’espace entre les pièces',`<form data-scene-distance><p class="help-text">${esc(parts[0].label)} ↔ ${esc(parts[1].label)}<br>Mesure dans le plan de travail, suivant la ligne entre les deux pièces.</p><label class="field"><span>${measure==='axes'?'Entraxe':'Espace libre projeté'} souhaité</span><input name="value" type="text" inputmode="decimal" value="${esc(fmt(value,6))} mm" required aria-label="Distance souhaitée"><small>Exemples : 0,5 m · 25 cm · 120,5 mm</small></label><label class="field"><span>Pièce à déplacer</span><select name="move"><option value="b" selected>${esc(parts[1].label)} · ${esc(ids[1])}</option><option value="a">${esc(parts[0].label)} · ${esc(ids[0])}</option></select></label><label class="toggle-row">Déplacer aussi son groupe<input type="checkbox" name="withGroup"></label><output data-scene-distance-preview class="measure-readout"></output><p class="help-text">La référence reste fixe. L’écart saisi est exact, indépendamment des accroches. Une annulation restaure l’opération.</p><button class="btn primary full" type="submit">Appliquer la distance</button></form>`);
  updateSceneDistancePreview();
 }catch(error){toast(error.message);}
}
function sceneDistanceChange(form){
 if(!sceneDistance)throw Error('Cette cote n’est plus disponible.');
 const [a,b]=sceneDistance.referenceIds.map(id=>project.freeParts.find(p=>p.id===id));
 const measures=betweenMeasurements(a,b,project.workplane),value=parseDimensionInput(form.elements.value.value);
 if(value===null||value<0||value>100000)throw Error('Saisissez une distance de 0 à 100 000 mm, avec mm, cm ou m.');
 const current=sceneDistance.measure==='axes'?measures.axisDistance:measures.clearGap,moveA=form.elements.move.value==='a',moving=moveA?a:b,reference=moveA?b:a;
 const ids=form.elements.withGroup.checked?selectionGroupIds(project,[moving.id]):[moving.id];
 if(ids.includes(reference.id))throw Error('Les deux références sont dans le même groupe. Décochez « Déplacer aussi son groupe ».');
 const delta=measures.direction.map(n=>n*(value-current)*(moveA?-1:1));
 if(sceneDistance.measure==='axes'&&value===0)throw Error('Un entraxe nul superposerait les repères. Choisissez une valeur supérieure à zéro.');
 assertMovementBounds(ids,delta);
 return {ids,delta,value,current,referenceId:reference.id};
}
function updateSceneDistancePreview(){
 const form=document.querySelector('[data-scene-distance]');if(!form)return;
 try{const next=sceneDistanceChange(form);form.querySelector('[data-scene-distance-preview]').textContent=`${fmt(next.current,3)} → ${fmt(next.value,3)} mm · ${next.ids.length} pièce(s) déplacée(s)`;viewport?.previewPlacement(next.ids,next.delta,next.referenceId);form.querySelector('[type="submit"]').disabled=false;}
 catch(error){form.querySelector('[data-scene-distance-preview]').textContent=error.message;form.querySelector('[type="submit"]').disabled=true;viewport?.previewPlacement([],null);}
}
function assertMovementBounds(ids,delta){
 for(const part of project.freeParts.filter(p=>ids.includes(p.id)))for(const point of part.corners||[part.a,part.b])if(point.some((n,i)=>!Number.isFinite(n+delta[i])||Math.abs(n+delta[i])>100000))throw Error('Ce déplacement dépasserait les limites du projet (±100 000 mm).');
}
function setupDirectCommands(){
 const style=document.createElement('style');style.textContent=CONTEXT_STYLES;document.head.append(style);
 // Le menu natif peut viser le panneau apparu après pointerup, hors du canvas.
 document.addEventListener('contextmenu',event=>event.preventDefault(),{capture:true});
 if(viewport){viewport.onContextMenu=openContextMenu;viewport.onDimensionEdit=openSceneDistance;viewport.onPanelResize=applyPanelResize;}
 $('context-actions-open')?.addEventListener('click',()=>openContextMenu());
 $('modal').addEventListener('close',()=>{sceneDistance=null;viewport?.previewPlacement([],null);});
 document.addEventListener('pointerdown',e=>{if(contextMenu&&!contextMenu.contains(e.target)&&!e.target.closest?.('#context-actions-open'))closeContextMenu(false);},{capture:true});
 window.addEventListener('resize',()=>closeContextMenu(false));
 window.addEventListener('blur',()=>{keyboardSession=null;closeContextMenu(false);});
 document.addEventListener('click',e=>{
  if(e.target.closest('[data-context-cancel]')){$('modal').close();return;}
  const button=e.target.closest('[data-context-action]');if(!button)return;e.preventDefault();
  try{runContextAction(button.dataset.contextAction,button);}catch(error){toast(error.message);}
 });
 document.addEventListener('change',e=>{
  if(e.target.dataset.objectSnap){const key=e.target.dataset.objectSnap;if(!['enabled','localGrid','gridStep'].includes(key))return;if(!e.target.checkValidity()){e.target.reportValidity();return;}const value=e.target.type==='checkbox'?e.target.checked:Number(e.target.value);commit(p=>{p.objectSnap[key]=value;});}
  if(e.target.closest('[data-scene-distance]'))updateSceneDistancePreview();
 });
 document.addEventListener('input',e=>{if(e.target.closest('[data-scene-distance]'))updateSceneDistancePreview();});
 document.addEventListener('submit',e=>{
  const form=e.target;if(!form.matches('[data-context-form],[data-scene-distance]'))return;e.preventDefault();if(!form.checkValidity())return;
  try{
   if(form.matches('[data-scene-distance]')){const next=sceneDistanceChange(form);if(commit(p=>transformSelection(p,next.ids,{delta:next.delta}))){$('modal').close();toast('Distance exacte appliquée.');}return;}
   const fd=new FormData(form),values=Object.fromEntries(fd),type=form.dataset.contextForm;
   const ids=type==='group'&&fd.has('includeConnected')?connectedSelection(project,selectedIds):[...selectedIds];
   const action=type==='group'?p=>groupSelection(p,ids,{name:values.name}):type==='align'?p=>alignToReference(p,ids,values):type==='distribute'?p=>distributeSelection(p,ids,values):null;
   if(action&&commit(action)){$('modal').close();selectParts(ids);toast(type==='group'?'Groupe créé. Premier clic : ensemble lié · nouveau clic : une seule pièce.':type==='align'?'Pièces alignées sur la référence.':'Répartition appliquée.');}
  }catch(error){toast(error.message);}
 });
 document.addEventListener('keydown',e=>{
  if(contextMenu){
   if(e.key==='Escape'){e.preventDefault();e.stopPropagation();closeContextMenu();return;}
   if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();e.stopPropagation();const nodes=[...contextMenu.querySelectorAll('button:not(:disabled),summary')].filter(n=>!n.closest('details:not([open])')||n.tagName==='SUMMARY'),current=nodes.indexOf(document.activeElement),index=e.key==='Home'?0:e.key==='End'?nodes.length-1:(current+(e.key==='ArrowDown'?1:-1)+nodes.length)%nodes.length;nodes[index]?.focus();return;}
   if(e.key==='Tab')closeContextMenu(false);return;
  }
  if(isEditingText()||$('modal').open||!['design','connections'].includes(page))return;
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='a'&&project.mode==='free'){e.preventDefault();e.stopPropagation();selectParts(project.freeParts.map(p=>p.id));return;}
  if(e.key==='ContextMenu'||e.shiftKey&&e.key==='F10'){e.preventDefault();openContextMenu();return;}
  if(e.key==='Escape'&&linkPending){e.preventDefault();e.stopPropagation();cancelSceneInteraction();return;}
  if(project.mode!=='free'||viewport?.transform?.dragging||viewport?.pendingTransform||viewport?.panelDrag||viewport?.pendingPanel||viewport?.interaction||planEditor?.getPending?.()||linkPending)return;
  const frame=workspaceMode==='plan'?project.drawing.view:viewport?.getKeyboardFrame?.()||{right:workplaneFrame(project.workplane).u.toArray(),up:workplaneFrame(project.workplane).v.clone().negate().toArray()};
  const delta=keyboardNudge(e,frame,project.grid);
  if(delta&&selectedIds.length){
   e.preventDefault();e.stopPropagation();const ids=[...selectedIds],key=e.key+'|'+ids.join('|'),coalesce=!!(e.repeat&&keyboardSession?.key===key);
   try{assertMovementBounds(ids,delta);if(project.workplane.lock){const normal=workplaneFrame(project.workplane).normal;if(Math.abs(delta.reduce((s,n,i)=>s+n*normal.getComponent(i),0))>1e-6){toast('Déplacement hors du plan verrouillé. Utilisez les flèches du plan ou déverrouillez-le.');return;}}
    if(commit(p=>transformSelection(p,ids,{delta}),false,coalesce)){keyboardSession={key};interactionStatus(`Clavier : ${fmt(Math.hypot(...delta),4)} mm · Maj ×10 · Alt ÷10 · Page ↑/↓ hauteur`);}
   }catch(error){toast(error.message);}return;
  }
  keyboardSession=null;
  if(!e.ctrlKey&&!e.metaKey&&!e.altKey&&selectedIds.length){const key=e.key.toLowerCase();if(key==='s'){e.preventDefault();sceneTool('resize');}else if(key==='g'){e.preventDefault();runContextAction('ground');}else if(key==='l'){e.preventDefault();runContextAction(selectedIds.length===2?'link':'link-target');}}
 },true);
 document.addEventListener('keyup',e=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','PageUp','PageDown'].includes(e.key)){keyboardSession=null;if(!viewport?.interaction&&!linkPending)interactionStatus('');}});
}

// V0.20–V0.27 : aides locales, attaches explicites et transactions prévisualisées.
function renderSceneSettings(){
 const host=$('scene-settings-host');if(!host)return;
 host.hidden=page!=='design'||project.mode!=='free';
 const renderHost=node=>{const open=[...node.querySelectorAll('details[open]')].map(d=>d.classList.contains('scene-settings-menu')?'scene-root':d.querySelector(':scope > summary')?.textContent),scroll=node.querySelector('.scene-settings-body')?.scrollTop||0;node.innerHTML=sceneSettingsPanel(project,selectedIds)+'';for(const d of node.querySelectorAll('details'))if(open.includes(d.classList.contains('scene-settings-menu')?'scene-root':d.querySelector(':scope > summary')?.textContent))d.open=true;const body=node.querySelector('.scene-settings-body');if(body){body.insertAdjacentHTML('beforeend',`<details class="side-details"><summary>Attaches automatiques</summary><label class="toggle-row">Attacher après un accrochage<input type="checkbox" data-attachment-auto ${project.attachmentSettings.autoAttach?'checked':''}></label><p class="help-text">Par défaut, le bouton Attacher propose de conserver le contact. Ce mode crée automatiquement l’attache après une pose accrochée. Alt suspend l’accrochage, sans détacher.</p><button class="btn full" data-attachment-action="detect">Détecter les contacts existants…</button></details>`);body.scrollTop=scroll;}syncSelections(node);};
 renderHost(host);
 if(document.querySelector('#modal-content > .scene-settings-menu'))renderHost($('modal-content'));
}
function assemblySelectionInspector(){
 if(!selectedIds.length)return '';
 const related=model.joints.filter(j=>selectedIds.includes(j.aPart)||selectedIds.includes(j.bPart));
 return `<div class="inspector-head"><strong>Fixations de la sélection</strong><button data-action="close-inspector" aria-label="Fermer">×</button></div><p class="help-text">${selectedIds.length} pièce(s) · ${related.length} liaison(s). Choisissez un montage pour modifier ses quantités ou positionner ses fixations.</p>${related.map(j=>`<button class="btn full" data-joint-pick="${esc(j.id)}">${esc(j.id)} · ${esc(RECIPES.find(r=>r.id===j.recipe)?.label||j.recipe)}</button>`).join('')}${baseFixingButtons(selectedIds)}<button class="btn full subtle" data-editor="connect">Créer une liaison…</button><button class="btn full subtle" data-page="design">Modifier les pièces dans Concevoir</button>`;
}
function withContactAttachment(draft,snap){
 if(!snap||!draft.attachmentSettings?.autoAttach||draft.attachments?.some(a=>a.sourceId===snap.sourceId))return draft;
 try{return createFixedAttachment(draft,snap.sourceId,snap.targetId,snap)}catch(error){queueMicrotask(()=>toast('Pose conservée. Attache non créée : '+error.message));return draft}
}
function offerContactAttachment(snap){
 if(!snap||project.attachments?.some(a=>a.sourceId===snap.sourceId))return;
 if(!project.freeParts.some(p=>p.id===snap.sourceId)||!project.freeParts.some(p=>p.id===snap.targetId))return;
 attachmentProposal={...snap};renderAttachmentStatus();
}
function renderAttachmentStatus(){
 const host=$('attachment-status');if(!host)return;
 const conflicts=project.attachmentConflicts||[];
 host.hidden=page!=='design'||(!attachmentProposal&&!conflicts.length);
 host.innerHTML=attachmentProposal?`<span>Contact avec ${esc(project.freeParts.find(p=>p.id===attachmentProposal.targetId)?.label||attachmentProposal.targetId)}</span><button class="btn small primary" data-attachment-action="accept-contact">Attacher</button><button class="btn small" data-attachment-action="dismiss-contact" aria-label="Ignorer la proposition d’attache">×</button>`:conflicts.length?`<span>${conflicts.length} attache(s) à vérifier</span><button class="btn small" data-attachment-action="conflicts">Voir</button>`:'';
}
function openAttachmentEditor(sourceId=selectedIds[0],targetId=selectedIds[1]){
 if(project.mode!=='free'||project.freeParts.length<2){toast('Ajoutez au moins deux pièces en construction libre.');return;}
 modal('Attacher une pièce à un support',attachmentForm(project,sourceId,targetId));syncSelections($('modal-content'));
}
function openAdaptationEditor(sourceId=selectedIds[0]){modal('Adapter une pièce à ses supports',adaptationForm(project,sourceId));syncSelections($('modal-content'));}
function showAttachmentImpact(){
 if(!attachmentImpact)return;
 const {draft,changes:entries}=attachmentImpact,rows=entries.filter(x=>x.dimensionsChanged).map(x=>({id:x.partId,before:x.kind==='panel'?fmt(x.fromArea,4)+' m² · côtés '+(x.fromDimensions||[]).slice(0,4).map(n=>fmt(n,2)).join(' / ')+' mm':fmt(x.fromLength,3)+' mm',after:x.kind==='panel'?fmt(x.toArea,4)+' m² · côtés '+(x.toDimensions||[]).slice(0,4).map(n=>fmt(n,2)).join(' / ')+' mm':fmt(x.toLength,3)+' mm'}));
 const previous=new Map(calculateBOM(project).map(x=>[x.id,x])),next=new Map(calculateBOM(draft).map(x=>[x.id,x])),bomChanges=[];
 for(const id of new Set([...previous.keys(),...next.keys()])){const a=previous.get(id),b=next.get(id);if(Math.abs((a?.purchaseQty||0)-(b?.purchaseQty||0))>1e-6||a?.spec!==b?.spec)bomChanges.push({label:(b||a).label,before:fmt(a?.purchaseQty||0,3),after:fmt(b?.purchaseQty||0,3),unit:(b||a).unit});}
 modal('Vérifier l’adaptation des pièces',impactHTML(project,draft,rows,bomChanges));
}
function showDetectedAttachments(){
 const ids=(selectedIds.length?selectedIds:project.freeParts.map(p=>p.id)).slice(0,100),candidates=[],seen=new Set();
 for(const id of ids){if(project.attachments.some(a=>a.sourceId===id))continue;for(const c of getObjectSnapCandidates(project.freeParts.filter(p=>p.id===id),project.freeParts.filter(p=>p.id!==id),{tolerance:.1,featureTolerance:0,localGrid:false})){
  if(Math.hypot(...c.delta)>.05)continue;const pair=[c.sourceId,c.targetId].sort().join('|');if(seen.has(pair))continue;seen.add(pair);candidates.push(c);
 }}
 modal('Contacts existants à confirmer',`<p class="help-text">${ids.length} pièce(s) examinée(s), par lots de 100. Sélectionnez les pièces à analyser pour un grand projet. Une détection ne crée ni attache ni achat.</p>${candidates.length?candidates.slice(0,100).map(c=>`<article class="attachment-row"><strong>${esc(c.sourceLabel||c.sourceId)} → ${esc(c.targetLabel||c.targetId)}</strong><small>${esc(c.label)}</small><button class="btn small" data-attachment-detected-source="${esc(c.sourceId)}" data-attachment-detected-target="${esc(c.targetId)}">Choisir le sens de l’attache…</button></article>`).join(''):'<p>Aucun contact libre trouvé à moins de 0,05 mm. Vous pouvez créer une attache avec un décalage depuis les propriétés.</p>'}`);
}
function setupAttachmentControls(){
 $('modal').addEventListener('close',()=>{if(attachmentImpact){attachmentImpact=null;viewport?.set(model,project);renderInspector();}});
 document.addEventListener('keydown',e=>{const tab=inspectorTabKeydown(e,$('inspector'));if(tab)inspectorTab=tab;});
 const style=document.createElement('style');style.textContent=ATTACHMENT_FIXINGS_STYLES;document.head.append(style);
 let fixingPreview=null;
 document.addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b)return;
  if(b.dataset.attachmentAction){const action=b.dataset.attachmentAction;
   if(action==='create')openAttachmentEditor();
   if(action==='adapt')openAdaptationEditor();
   if(action==='cancel')$('modal').close();
   if(action==='detect')showDetectedAttachments();
   if(action==='dismiss-contact'){attachmentProposal=null;renderAttachmentStatus();}
   if(action==='accept-contact'&&attachmentProposal){const snap=attachmentProposal;if(commit(p=>createFixedAttachment(p,snap.sourceId,snap.targetId,snap))){attachmentProposal=null;renderAttachmentStatus();toast('Attache créée. Les dimensions restent fixes.');}}
   if(action==='conflicts')modal('Attaches à vérifier',`<p class="help-text">Les relations sont conservées. Corrigez la position, annulez le geste ou détachez explicitement la pièce.</p>${project.attachmentConflicts.map(c=>`<article class="attachment-row"><strong>${esc(project.freeParts.find(p=>p.id===c.sourceId)?.label||c.sourceId)}</strong><p>${esc(c.message)}</p><button class="btn small" data-attachment-select="${esc(c.attachmentId)}">Voir les pièces</button><button class="btn small" data-attachment-detach="${esc(c.attachmentId)}">Détacher</button></article>`).join('')}`);
  }
  if(b.dataset.attachmentDetach){if(commit(p=>detachAttachment(p,b.dataset.attachmentDetach))){toast('Attache retirée. Les pièces restent en place.');if($('modal').open)$('modal').close();}}
  if(b.dataset.attachmentSelect){const a=project.attachments.find(a=>a.id===b.dataset.attachmentSelect);if(a){$('modal').close();selectParts([a.sourceId,...new Set(a.anchors.map(x=>x.targetId))]);viewport?.focusSelection?.(selectedIds);}}
  if(b.dataset.attachmentDetectedSource)openAttachmentEditor(b.dataset.attachmentDetectedSource,b.dataset.attachmentDetectedTarget);
  if(b.dataset.attachmentImpact){const pending=attachmentImpact;attachmentImpact=null;if(b.dataset.attachmentImpact==='apply'&&pending){if(changes()!==pending.snapshot){toast('Le projet a changé. Recommencez la modification.');return;}if(commit(()=>pending.draft,pending.preserveChecks,pending.coalesce,{skipAttachments:true})){toast('Adaptation validée. Débit et achats actualisés.');}}$('modal').close();viewport?.set(model,project);renderInspector();}
  if(b.dataset.attachmentFixingPreview==='cancel'){$('modal').close();fixingPreview=null;}
  if(b.dataset.attachmentFixingPreview==='confirm'&&fixingPreview){if(changes()!==fixingPreview.snapshot){toast('Le projet a changé. Examinez de nouveau la proposition.');return;}if(commit(()=>fixingPreview.project)){$('modal').close();toast('Fixations confirmées et ajoutées aux achats.');}fixingPreview=null;}
 });
 document.addEventListener('change',e=>{
  if(e.target.matches('[data-placement-surface]')){cancelSceneInteraction();commit(p=>p.placementSurface=e.target.value);}
  if(e.target.matches('[data-attachment-auto]'))commit(p=>p.attachmentSettings.autoAttach=e.target.checked);
  if(e.target.matches('[data-attachment-lock]'))commit(p=>{const part=p.freeParts.find(x=>x.id===e.target.dataset.attachmentLock);if(part)part.lengthLocked=e.target.checked;});
  if(e.target.matches('[data-attachment-form="fixed"] [name="sourceId"]')){const form=e.target.closest('form'),target=form.elements.targetId.value;form.outerHTML=attachmentForm(project,e.target.value,target);syncSelections($('modal-content'));}
 });
 document.addEventListener('submit',e=>{
  const form=e.target;if(form.matches('[data-attachment-fixing-form]')){e.preventDefault();try{const preview=previewAttachmentFixings(project,readAttachmentFixingSelection(form,e.submitter));fixingPreview={...preview,snapshot:changes()};modal('Confirmer les fixations',attachmentFixingPreviewHTML(preview)+'<div class="placement-actions"><button class="btn" data-attachment-fixing-preview="cancel">Annuler</button><button class="btn primary" data-attachment-fixing-preview="confirm">Confirmer et ajouter aux achats</button></div>');}catch(error){toast(error.message);}return;}
  if(!form.matches('[data-attachment-form]'))return;e.preventDefault();if(!form.checkValidity()){form.reportValidity();return;}
  const fd=new FormData(form);
  try{const type=form.dataset.attachmentForm;let next;
   if(type==='fixed')next=createFixedAttachment(project,fd.get('sourceId'),fd.get('targetId'));
   else{const source=form.dataset.source,part=project.freeParts.find(x=>x.id===source),targets=Array.from({length:part.kind==='panel'?4:2},(_,i)=>fd.get('target'+i));if(!fd.has('allowAdaptation'))throw Error('Autorisez explicitement l’adaptation pour continuer.');next=part.kind==='panel'?configurePanelAttachment(project,source,targets):configureBeamAttachment(project,source,targets,{intermediateIds:fd.getAll('intermediateIds')});}
   if(commit(()=>next)){$('modal').close();toast(type==='fixed'?'Attache créée, dimensions conservées.':'Supports enregistrés. Les changements de dimensions demanderont une validation.');}
  }catch(error){toast(error.message);}
 });
}
setupAttachmentControls();
