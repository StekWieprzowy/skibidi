// Panel konfiguratora budowany z opisu opcji (grupy kolorów, przełączniki, widoki kamery).
import { t } from './stage.js';

const L = {
  auto: { pl: 'Auto-obrót', en: 'Auto-rotate' },
  hint: { pl: 'Przeciągnij, aby obrócić · scroll lub szczypanie, aby przybliżyć', en: 'Drag to rotate · scroll or pinch to zoom' },
  loading: { pl: 'Ładowanie…', en: 'Loading…' },
};

export function buildUI(stage, { title, subtitle, specs = [], groups = [], toggles = [] }) {
  const { controls, views, goView } = stage;
  document.querySelector('.brand small').textContent = t(subtitle);
  document.querySelector('.brand h1').textContent = t(title);
  document.title = `${t(title)} – ${t(subtitle)}`;
  document.querySelector('.specs').innerHTML = specs.map((s) => `<div>${t(s)}</div>`).join('');
  const hint = document.getElementById('hint');
  hint.textContent = t(L.hint);
  const loader = document.getElementById('loader');
  if (loader) loader.textContent = t(L.loading);

  const panel = document.querySelector('.panel');
  const state = {};
  const hash = new URLSearchParams(location.hash.slice(1));
  const writeHash = () => { try { history.replaceState(null, '', '#' + new URLSearchParams(state).toString()); } catch (e) { /* file:// */ } };

  for (const g of groups) {
    const row = document.createElement('div');
    row.className = 'row';
    row.innerHTML = `<div class="label">${t(g.label)} <strong></strong></div><div class="swatches" role="group" aria-label="${t(g.label)}"></div>`;
    const name = row.querySelector('strong'), box = row.querySelector('.swatches');
    const select = (i, push = true) => {
      state[g.id] = i;
      g.apply(g.items[i], i);
      name.textContent = t(g.items[i].name);
      [...box.children].forEach((b, k) => b.setAttribute('aria-pressed', String(k === i)));
      if (push) writeHash();
    };
    g.items.forEach((it, i) => {
      const b = document.createElement('button');
      b.className = 'swatch';
      b.style.setProperty('--c', it.swatch || it.hex);
      b.title = t(it.name); b.setAttribute('aria-label', t(it.name));
      b.addEventListener('click', () => select(i));
      box.appendChild(b);
    });
    panel.appendChild(row);
    const fromHash = parseInt(hash.get(g.id), 10);
    select(g.items[fromHash] ? fromHash : (g.default ?? 0), false);
  }

  const bottom = document.createElement('div');
  bottom.className = 'row';
  const viewsBox = document.createElement('div');
  viewsBox.className = 'views';
  bottom.appendChild(viewsBox);
  const togglesBox = document.createElement('div');
  togglesBox.className = 'toggles';
  bottom.appendChild(togglesBox);
  panel.appendChild(bottom);

  for (const tg of toggles) {
    const lab = document.createElement('label');
    lab.className = 'toggle';
    lab.innerHTML = `<input type="checkbox"><span class="switch"></span>${t(tg.label)}`;
    const input = lab.querySelector('input');
    const h = hash.get(tg.id);
    input.checked = h === null ? !!tg.value : h === '1';
    const apply = (push = true) => { state[tg.id] = input.checked ? 1 : 0; tg.apply(input.checked); if (push) writeHash(); };
    input.addEventListener('change', () => apply());
    togglesBox.appendChild(lab);
    apply(false);
  }

  let autoOn = true, idleTimer = 0;
  const autoBtn = document.createElement('button');
  autoBtn.className = 'chip';
  autoBtn.textContent = t(L.auto);
  const setAuto = (on) => {
    autoOn = on; controls.autoRotate = on; clearTimeout(idleTimer);
    autoBtn.setAttribute('aria-pressed', String(on));
    if (on) [...viewsBox.children].forEach((b) => b.dataset.key && b.setAttribute('aria-pressed', 'false'));
  };
  Object.entries(views).forEach(([key, v]) => {
    const b = document.createElement('button');
    b.className = 'chip'; b.textContent = t(v.label); b.dataset.key = key; b.setAttribute('aria-pressed', 'false');
    b.addEventListener('click', () => {
      goView(key); setAuto(false);
      [...viewsBox.children].forEach((x) => x.dataset.key && x.setAttribute('aria-pressed', String(x.dataset.key === key)));
    });
    viewsBox.appendChild(b);
  });
  viewsBox.appendChild(autoBtn);
  autoBtn.addEventListener('click', () => setAuto(!autoOn));
  setAuto(true);
  window.__setAuto = setAuto;
  window.__panel = (on) => document.body.classList.toggle('show-panel', !!on);
  controls.addEventListener('start', () => { clearTimeout(idleTimer); controls.autoRotate = false; hint.classList.add('hide'); });
  controls.addEventListener('end', () => { clearTimeout(idleTimer); if (autoOn) idleTimer = setTimeout(() => { controls.autoRotate = true; }, 5000); });
  setTimeout(() => hint.classList.add('hide'), 7000);
}
