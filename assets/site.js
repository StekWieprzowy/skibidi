(() => {
  'use strict';

  const DEMOS = [
    { id: 'yacht',  path: 'demo/el-iseo/index.html', n: '01', t: { pl: 'Jacht', en: 'Yacht' } },
    { id: 'car',    path: 'demo/car/index.html',     n: '02', t: { pl: 'Auto', en: 'Car' } },
    { id: 'camper', path: 'demo/camper/index.html',  n: '03', t: { pl: 'Kamper', en: 'Camper' } },
    { id: 'sauna',  path: 'demo/sauna/index.html',   n: '04', t: { pl: 'Sauna', en: 'Sauna' } },
  ];

  const SECTORS = {
    pl: ['Jachty i łodzie', 'Motoryzacja', 'Kampery i przyczepy', 'Sauny i ogród', 'Meble', 'Domy modułowe', 'Kuchnie', 'Rowery', 'Oświetlenie', 'Bramy i ogrodzenia'],
    en: ['Yachts & boats', 'Automotive', 'Campers & trailers', 'Saunas & garden', 'Furniture', 'Modular homes', 'Kitchens', 'Bicycles', 'Lighting', 'Gates & fencing'],
  };

  // Teksty EN; polskie są w HTML (i zapamiętywane przy starcie).
  const EN = {
    'nav.services': 'Services', 'nav.work': 'Demos', 'nav.process': 'Process', 'nav.cta': 'Free demo',
    'hero.loading': 'Loading model', 'hero.drag': '↻ Drag to rotate', 'hero.kicker': '3D configurators · Websites · Graphics',
    'hero.title': 'Show the product<br>the way they’ll <em>buy it</em>', 'hero.cta': 'Get a demo of your product', 'hero.full': 'Full screen ↗',
    's1.label': 'Studio',
    's1.big': 'A photo shows one variant. <span>A configurator shows them all — in the colour the customer picked, from every side, at any time.</span>',
    'f1.t': 'In the browser', 'f1.d': 'No apps, no plugins. Works on desktop, tablet and phone.',
    'f2.t': 'Fast start', 'f2.d': 'Lean code and web-optimised models. Customers don’t stare at a progress bar.',
    'f3.t': 'One embed code', 'f3.d': 'Drop it into WordPress, Shopify, WooCommerce, PrestaShop or any HTML page.',
    'f4.t': 'Configuration in a link', 'f4.d': 'Every choice is saved in the URL, ready to send to a sales rep or attach to an enquiry.',
    's2.label': 'Services', 's2.right': 'From model to sale',
    'sv1.t': '3D configurators', 'sv1.d': 'An interactive model of your product: colours, materials, variants and equipment changed live, with camera views and shareable configurations.',
    'sv2.t': 'Websites', 'sv2.d': 'Websites and landing pages built around the product: fast, polished, with the configurator on the first screen, not at the bottom of the page.',
    'sv3.t': 'Graphics & renders', 'sv3.d': 'From one 3D model: packshots in every colour, lifestyle scenes, 360° spins and short social videos, with no photo shoot.',
    'sv4.t': 'Integrations', 'sv4.d': 'The configurator connected to your shop, price list and inbox: the chosen version goes to the cart or lands as a ready enquiry.',
    'tag.colors': 'Colours & materials', 'tag.variants': 'Variants', 'tag.views': 'Camera views', 'tag.quote': 'Pricing',
    'tag.site': 'Company site', 'tag.anim': '360° spin', 'tag.shop': 'Shop', 'tag.form': 'Enquiry form',
    's3.label': 'Demos', 's3.right': 'All of them run live', 's3.title': 'Click.<br>Spin. Change.',
    'd.yacht.k': 'Motor yacht · 8.35 m', 'd.yacht.t': 'Runabout', 'd.car.k': 'Automotive · studio', 'd.camper.k': 'Campers · equipment', 'd.camper.t': 'Camper Van',
    'd.sauna.k': 'Garden · variants & sizes', 'd.sauna.t': 'Barrel sauna', 'd.open': 'Launch ↗',
    's3.note': 'The demos are concept models we built from scratch. For your project we recreate your product from photos, dimensions or CAD files.',
    's4.label': 'Process', 's4.right': 'Zero risk to start', 's4.title': 'From a photo<br>to a configurator',
    'p1.t': 'You send the product', 'p1.d': 'Photos, dimensions, a link or CAD files — whatever you have.',
    'p2.t': 'Demo in 48 h', 'p2.d': 'We build a working demo of your product. Free, no strings attached.',
    'p3.t': 'Launch', 'p3.d': 'We refine the model, options and look, connect your shop or form and embed it on your site.',
    'p4.t': 'Growth', 'p4.d': 'New products, colours and campaigns: we keep adding variants and visuals.',
    'q1': 'How much does a configurator cost?', 'a1': 'Every quote is individual: it depends on the number of products, variants and integrations. We start with a free demo, so you see what you pay for before you order anything.',
    'q2': 'Do we need 3D models?', 'a2': 'No. Photos and dimensions are enough. If you have CAD files or 3D models, we’ll use them and prepare them for the browser.',
    'q3': 'Will it work on our website?', 'a3': 'Yes. We embed the configurator with a single snippet in WordPress, WooCommerce, Shopify, PrestaShop or any site. We can also build a new site around it.',
    'q4': 'How does it work on phones?', 'a4': 'We design mobile-first: lighter effects on weaker devices, touch controls and an options panel that fits the screen.',
    'q5': 'How long does it take?', 'a5': 'A demo in 48 hours. A full launch depends on scope: from a few days for one product to a few weeks for a whole range with shop integration.',
    'q6': 'Who handles hosting and changes?', 'a6': 'Your choice: we hand over the files for your server, or host the configurator ourselves and keep adding new variants.',
    's5.label': 'Contact', 's5.right': 'We reply within 24 h', 's5.title': 'Show us<br>your <em>product</em>',
    's5.lead': 'Send a link or a few photos. Within 48 hours you’ll get a working configurator demo of your product, free of charge.',
    'fm.name': 'Full name', 'fm.company': 'Company / website', 'fm.product': 'Product (link or name)', 'fm.msg': 'What do you want to show your customers?',
    'fm.note': 'By sending the form you agree to be contacted about your enquiry.', 'fm.send': 'Send enquiry',
    'ft.tag': '3D configurators · Websites · Graphics',
  };
  const MSG = {
    pl: { ok: 'Dziękujemy — odezwiemy się w ciągu 24 godzin.', req: 'Podaj imię i poprawny adres e-mail.', mail: 'Otwieramy Twój program pocztowy, żeby wysłać zapytanie…', sending: 'Wysyłanie…' },
    en: { ok: 'Thank you — we’ll get back to you within 24 hours.', req: 'Please enter your name and a valid e-mail address.', mail: 'Opening your e-mail app to send the enquiry…', sending: 'Sending…' },
  };

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const store = { get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* prywatne okno */ } } };

  /* ------------------------------------------------------------ język */
  const PL = {};
  $$('[data-i18n]').forEach((el) => { PL[el.dataset.i18n] = el.innerHTML; });
  const qLang = new URLSearchParams(location.search).get('lang');
  let lang = qLang === 'en' || qLang === 'pl' ? qLang : (store.get('lang') || ((navigator.language || 'pl').toLowerCase().startsWith('pl') ? 'pl' : 'en'));

  function applyLang() {
    document.documentElement.lang = lang;
    $$('[data-i18n]').forEach((el) => {
      const k = el.dataset.i18n;
      const v = lang === 'en' ? EN[k] : PL[k];
      if (v !== undefined) el.innerHTML = v;
    });
    $$('.lang button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === lang)));
    renderTabs();
    renderMarquee();
  }
  $$('.lang button').forEach((b) => b.addEventListener('click', () => {
    if (b.dataset.lang === lang) return;
    lang = b.dataset.lang; store.set('lang', lang);
    applyLang();
    loadDemo(current, true);
  }));

  /* ------------------------------------------------------------ dema w hero */
  const frame = $('#stage'), veil = $('#veil'), tabs = $('#demos'), full = $('#fullscreen');
  let current = Math.max(0, DEMOS.findIndex((d) => d.id === (location.hash.match(/demo=(\w+)/) || [])[1]));

  function renderTabs() {
    tabs.innerHTML = '';
    DEMOS.forEach((d, i) => {
      const b = document.createElement('button');
      b.type = 'button'; b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(i === current));
      b.innerHTML = `<span class="n">${d.n}</span><span class="t">${d.t[lang]}</span>`;
      b.addEventListener('click', () => { if (i !== current) loadDemo(i); });
      tabs.appendChild(b);
    });
  }
  function loadDemo(i, force = false) {
    if (i === current && !force && frame.src) return;
    current = i;
    const d = DEMOS[i];
    $$('button', tabs).forEach((b, k) => b.setAttribute('aria-selected', String(k === i)));
    full.href = `${d.path}?lang=${lang}`;
    veil.classList.remove('off');
    const src = `${d.path}?embed&lang=${lang}`;
    setTimeout(() => { frame.src = src; }, frame.src ? 260 : 0);
  }
  frame.addEventListener('load', () => {
    // pierwsza klatka modelu potrzebuje chwili po zdarzeniu load
    setTimeout(() => veil.classList.add('off'), 450);
    setPaused(!heroVisible);
  });

  // pauza renderowania, gdy hero nie jest widoczne (oszczędza baterię i GPU)
  let heroVisible = true;
  function setPaused(p) {
    frame.style.visibility = p && !document.hidden ? 'hidden' : ''; // poza ekranem iframe nie bierze udziału w kompozycji
    try { frame.contentWindow.__pause && frame.contentWindow.__pause(p); } catch (e) { /* inny origin */ }
  }
  new IntersectionObserver(([e]) => { heroVisible = e.isIntersecting; setPaused(!heroVisible); }, { threshold: 0.02 }).observe($('.hero'));
  document.addEventListener('visibilitychange', () => setPaused(document.hidden || !heroVisible));

  // podpowiedź "przeciągnij" znika po pierwszej interakcji
  const hint = $('#dragHint');
  const hideHint = () => hint.classList.add('hide');
  window.addEventListener('blur', () => { if (document.activeElement === frame) hideHint(); });
  setTimeout(hideHint, 9000);

  // karty dem: przełączają hero, jeśli to nie kliknięcie z modyfikatorem
  $$('.card[data-demo]').forEach((a) => a.addEventListener('click', (e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
    e.preventDefault();
    loadDemo(DEMOS.findIndex((d) => d.id === a.dataset.demo));
    $('#top').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }));

  /* ------------------------------------------------------------ nawigacja, wejścia, pasek branż */
  const nav = $('#nav');
  const onScroll = () => nav.classList.toggle('solid', window.scrollY > window.innerHeight * 0.75);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px' });
  $$('.rv').forEach((el, i) => { el.style.transitionDelay = `${(i % 4) * 70}ms`; io.observe(el); });

  function renderMarquee() {
    const m = $('#marquee');
    const items = SECTORS[lang].map((s) => `<span>${s}</span>`).join('');
    m.innerHTML = items + items;
  }

  /* ------------------------------------------------------------ formularz */
  const form = $('#form'), msg = $('#formMsg');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    if (!data.name.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email.trim())) { msg.textContent = MSG[lang].req; return; }
    msg.textContent = MSG[lang].sending;
    try {
      const r = await fetch(form.action, { method: 'POST', body: new FormData(form), headers: { Accept: 'application/json' } });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error('send');
      form.reset();
      msg.textContent = MSG[lang].ok;
    } catch (err) {
      // brak PHP na serwerze (np. hosting statyczny) — wyślij przez program pocztowy
      const body = `${data.name}\n${data.email}\n${data.company}\n${data.product}\n\n${data.message}`;
      msg.textContent = MSG[lang].mail;
      location.href = `mailto:kontakt@banatstudios.pl?subject=${encodeURIComponent('Zapytanie: ' + (data.product || data.company || data.name))}&body=${encodeURIComponent(body)}`;
    }
  });

  $('#year').textContent = new Date().getFullYear();

  applyLang();
  loadDemo(current, true);
})();
