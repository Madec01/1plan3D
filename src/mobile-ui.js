/** Responsive panels; the editor keeps ownership of its DOM and project state. */
export const MOBILE_QUERY = '(max-width: 760px), (max-width: 1000px) and (max-height: 500px) and (pointer: coarse)';

const SHEETS = { pieces: 'sidebar', aids: 'sidebar', properties: 'inspector' };
const TITLES = { pieces: 'Pièces et projet', aids: 'Aides au placement', properties: 'Propriétés' };
const FOCUSABLE = 'button:not(:disabled),a[href],input:not(:disabled):not([type=hidden]),select:not(:disabled),textarea:not(:disabled),summary,[tabindex]:not([tabindex="-1"])';

/**
 * Shell hooks: #mobile-toolbar, [data-mobile-sheet="pieces|properties|aids"],
 * [data-mobile-action="add|multi|confirm|cancel"], optional #mobile-sheet-backdrop.
 * Context: page, sceneActive, mode, selectedCount, pendingAction, canConfirm,
 * multiSelect. Call refresh after rendering the sidebar or inspector.
 * A media-query-list-compatible `media` can be injected for DOM-only tests.
 */
export function setupMobileUI({ getContext = () => ({}), onAction = () => {}, document: doc = globalThis.document, media } = {}) {
  if (!doc?.body) throw new Error('Le contrôleur mobile nécessite un document.');
  const view = doc.defaultView;
  const mq = media ?? view?.matchMedia?.(MOBILE_QUERY) ?? { matches: false };
  const original = new Map();
  const background = new Map();
  let context = {}, active = null, opener = null, mobile = false, destroyed = false;
  let backdrop = doc.getElementById('mobile-sheet-backdrop');
  const ownsBackdrop = !backdrop;
  if (!backdrop) {
    backdrop = doc.createElement('button');
    backdrop.id = 'mobile-sheet-backdrop';
    backdrop.type = 'button';
    backdrop.setAttribute('aria-label', 'Replier le panneau');
    doc.body.append(backdrop);
  }
  backdrop.hidden = true;
  backdrop.tabIndex = -1;

  function panelFor(sheet = active) { return doc.getElementById(SHEETS[sheet]); }
  function remember(panel) {
    if (!original.has(panel)) original.set(panel, {
      role: panel.getAttribute('role'), hidden: panel.getAttribute('aria-hidden'),
      modal: panel.getAttribute('aria-modal'), tabindex: panel.getAttribute('tabindex'), inert: panel.inert,
    });
  }
  function attribute(el, key, value) { value == null ? el.removeAttribute(key) : el.setAttribute(key, value); }
  function restorePanel(panel) {
    const before = original.get(panel);
    if (!before) return;
    attribute(panel, 'role', before.role); attribute(panel, 'aria-hidden', before.hidden);
    attribute(panel, 'aria-modal', before.modal); attribute(panel, 'tabindex', before.tabindex);
    panel.inert = before.inert;
    panel.classList.remove('mobile-sheet-active');
    panel.querySelector('[data-mobile-sheet-heading]')?.remove();
  }
  function restoreBackground() {
    for (const [el, inert] of background) el.inert = inert;
    background.clear();
  }
  function protectBackground(panel) {
    restoreBackground();
    if (!panel) return;
    for (let branch = panel; branch?.parentElement && branch !== doc.body; branch = branch.parentElement) {
      for (const sibling of branch.parentElement.children) {
        if (sibling === branch || sibling === backdrop || sibling.id === 'mobile-toolbar' || sibling.matches('dialog,.toast,script,style')) continue;
        background.set(sibling, sibling.inert);
        sibling.inert = true;
      }
    }
  }
  function eligible(element) {
    if (element.closest('[hidden],.hidden,[inert]')) return false;
    const details = element.closest('details:not([open])');
    return !details || details.querySelector('summary') === element;
  }
  function focusables(panel) { return [...panel.querySelectorAll(FOCUSABLE)].filter(eligible); }
  function focusPanel(panel) { (panel.querySelector('[data-mobile-close]') ?? panel).focus({ preventScroll: true }); }
  function available(sheet) {
    if (!SHEETS[sheet] || !panelFor(sheet)) return false;
    if (sheet === 'properties') return context.sceneActive !== false && Number(context.selectedCount) > 0 && !panelFor(sheet).classList.contains('hidden');
    if (sheet === 'aids') return context.sceneActive !== false;
    return true;
  }
  function addHeading(panel, sheet) {
    let heading = panel.querySelector('[data-mobile-sheet-heading]');
    if (!heading) {
      heading = doc.createElement('div');
      heading.dataset.mobileSheetHeading = '';
      heading.className = 'mobile-sheet-heading';
      const title = doc.createElement('strong'); title.dataset.mobileSheetTitle = '';
      const closeButton = doc.createElement('button');
      closeButton.type = 'button'; closeButton.className = 'btn small';
      closeButton.dataset.mobileClose = ''; closeButton.textContent = 'Replier ↓';
      closeButton.setAttribute('aria-label', 'Replier le panneau et revenir au dessin');
      heading.append(title, closeButton); panel.prepend(heading);
    }
    heading.querySelector('[data-mobile-sheet-title]').textContent = TITLES[sheet] ?? TITLES.pieces;
  }
  function paint() {
    restoreBackground();
    doc.body.classList.toggle('mobile-ui', mobile);
    doc.body.classList.toggle('mobile-scene', mobile && context.sceneActive !== false);
    doc.body.classList.toggle('mobile-sheet-open', mobile && !!active);
    doc.body.classList.toggle('mobile-action-pending', mobile && !!context.pendingAction);
    doc.body.dataset.mobilePage = context.page ?? 'design';
    if (active) doc.body.dataset.activeMobileSheet = active; else delete doc.body.dataset.activeMobileSheet;
    for (const id of new Set(Object.values(SHEETS))) {
      const panel = doc.getElementById(id); if (!panel) continue;
      remember(panel);
      if (!mobile) { restorePanel(panel); continue; }
      const visible = panel === panelFor();
      panel.classList.toggle('mobile-sheet-active', visible);
      panel.inert = !visible;
      panel.setAttribute('aria-hidden', String(!visible));
      panel.setAttribute('role', 'dialog');
      panel.setAttribute('tabindex', '-1');
      if (visible) { panel.setAttribute('aria-modal', 'true'); addHeading(panel, active); }
      else panel.removeAttribute('aria-modal');
    }
    backdrop.hidden = !mobile || !active;
    const toolbar = doc.getElementById('mobile-toolbar');
    if (toolbar) toolbar.hidden = !mobile;
    for (const button of doc.querySelectorAll('[data-mobile-sheet]')) {
      const sheet = button.dataset.mobileSheet;
      button.setAttribute('aria-controls', SHEETS[sheet] ?? 'sidebar');
      button.setAttribute('aria-expanded', String(mobile && active === sheet));
      button.disabled = !available(sheet);
    }
    for (const button of doc.querySelectorAll('[data-mobile-action]')) {
      const action = button.dataset.mobileAction;
      if (action === 'confirm' || action === 'cancel') {
        button.hidden = !context.pendingAction;
        button.disabled = !context.pendingAction || (action === 'confirm' && context.canConfirm === false);
      } else {
        button.disabled = context.sceneActive === false || !!context.pendingAction;
        if (action === 'multi') button.setAttribute('aria-pressed', String(!!context.multiSelect));
      }
    }
    for (const el of doc.querySelectorAll('[data-mobile-pending]')) {
      el.hidden = !context.pendingAction;
      if (el.matches('[data-mobile-pending-label]')) el.textContent = typeof context.pendingAction === 'string' ? context.pendingAction : 'Action en cours';
    }
    if (mobile && active) protectBackground(panelFor());
    updateVisibleViewport();
  }
  function updateVisibleViewport() {
    const visible = view?.visualViewport;
    const keyboard = mobile && visible && (!visible.scale || Math.abs(visible.scale - 1) < 0.01)
      ? Math.max(0, (view.innerHeight || visible.height) - visible.height - (visible.offsetTop || 0)) : 0;
    // Safari can keep the layout viewport tall while the numeric keyboard covers it.
    doc.body.style.setProperty('--mobile-keyboard-inset', `${Math.round(keyboard)}px`);
  }
  function close({ restoreFocus = true } = {}) {
    if (!active) return false;
    const previous = active; active = null; paint();
    if (restoreFocus) {
      const target = opener?.isConnected && !opener.disabled && eligible(opener) ? opener : doc.querySelector(`[data-mobile-sheet="${previous}"]`);
      if (target && !target.disabled) target.focus({ preventScroll: true });
    }
    opener = null;
    return true;
  }
  function open(sheet, trigger) {
    if (destroyed) return false;
    refresh();
    if (!mobile || !available(sheet)) return false;
    opener = trigger ?? doc.querySelector(`[data-mobile-sheet="${sheet}"]`) ?? doc.activeElement;
    active = sheet; paint();
    const panel = panelFor(); focusPanel(panel);
    const anchor = sheet === 'aids' ? panel.querySelector('.adaptive-assistance,[data-assistance-settings]') : null;
    if (anchor) {
      for (let el = anchor.parentElement; el && el !== panel; el = el.parentElement) if (el.tagName === 'DETAILS') el.open = true;
      anchor.scrollIntoView?.({ block: 'start', behavior: 'instant' });
    } else panel.scrollTop = 0;
    return true;
  }
  function refresh(next) {
    if (destroyed) return;
    const wasMobile = mobile, wasPending = !!context.pendingAction, previousPage = context.page;
    context = { ...(next ?? getContext() ?? {}) }; mobile = !!mq.matches;
    if (active && (!mobile || !available(active) || (context.pendingAction && !wasPending) || (previousPage && previousPage !== context.page))) close({ restoreFocus: mobile && wasMobile });
    paint();
    const panel = mobile && panelFor();
    if (panel && active && !panel.contains(doc.activeElement) && !doc.querySelector('dialog[open]')) focusPanel(panel);
  }
  function click(event) {
    if (!mobile || destroyed) return;
    const target = event.target?.closest?.('[data-mobile-sheet],[data-mobile-action],[data-mobile-close],#mobile-sheet-backdrop');
    if (!target || target.disabled) return;
    event.preventDefault(); event.stopPropagation();
    if (target.dataset.mobileSheet==='aids') { close({restoreFocus:false}); onAction('aids'); return; }
    if (target.dataset.mobileSheet) {
      if (active === target.dataset.mobileSheet) close(); else open(target.dataset.mobileSheet, target);
    } else if (target.hasAttribute('data-mobile-action')) {
      close({ restoreFocus: false }); onAction(target.dataset.mobileAction); refresh();
    } else close();
  }
  function keydown(event) {
    if (!mobile || !active || doc.querySelector('dialog[open]')) return;
    if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); close(); return; }
    if (event.key !== 'Tab') return;
    const panel = panelFor(), items = focusables(panel), first = items[0], last = items.at(-1);
    if (!items.length || !panel.contains(doc.activeElement) || (event.shiftKey && doc.activeElement === first) || (!event.shiftKey && doc.activeElement === last)) {
      event.preventDefault(); (event.shiftKey ? last ?? panel : first ?? panel).focus({ preventScroll: true });
    }
  }
  function focusin(event) {
    if (!mobile || !active || doc.querySelector('dialog[open]') || panelFor()?.contains(event.target)) return;
    // The persistent bottom bar may switch panels without closing the selection.
    if (event.target.closest?.('#mobile-toolbar')) return;
    focusPanel(panelFor());
  }
  const changed = () => refresh();
  doc.addEventListener('click', click, true);
  doc.addEventListener('keydown', keydown, true);
  doc.addEventListener('focusin', focusin);
  if (mq.addEventListener) mq.addEventListener('change', changed); else mq.addListener?.(changed);
  view?.addEventListener('orientationchange', changed);
  view?.visualViewport?.addEventListener('resize', updateVisibleViewport);
  view?.visualViewport?.addEventListener('scroll', updateVisibleViewport);
  refresh();
  return {
    refresh, open, close,
    getState: () => ({ mobile, sheet: active, pendingAction: !!context.pendingAction }),
    destroy() {
      if (destroyed) return;
      close({ restoreFocus: false }); destroyed = true; restoreBackground();
      for (const panel of original.keys()) restorePanel(panel);
      for (const cls of ['mobile-ui', 'mobile-scene', 'mobile-sheet-open', 'mobile-action-pending']) doc.body.classList.remove(cls);
      delete doc.body.dataset.activeMobileSheet; delete doc.body.dataset.mobilePage;
      doc.body.style.removeProperty('--mobile-keyboard-inset');
      doc.getElementById('mobile-toolbar')?.setAttribute('hidden', '');
      for (const button of doc.querySelectorAll('[data-mobile-sheet]')) button.setAttribute('aria-expanded', 'false');
      if (ownsBackdrop) backdrop.remove(); else backdrop.hidden = true;
      doc.removeEventListener('click', click, true); doc.removeEventListener('keydown', keydown, true); doc.removeEventListener('focusin', focusin);
      if (mq.removeEventListener) mq.removeEventListener('change', changed); else mq.removeListener?.(changed);
      view?.removeEventListener('orientationchange', changed);
      view?.visualViewport?.removeEventListener('resize', updateVisibleViewport);
      view?.visualViewport?.removeEventListener('scroll', updateVisibleViewport);
    },
  };
}
