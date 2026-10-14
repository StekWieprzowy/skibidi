(() => {
  'use strict';
  document.documentElement.classList.add('js');

  // Dema w hero. "q" to dodatkowe parametry sceny (np. słońce o zmierzchu dla jachtu).
  const DEMOS = [
    { id: 'yacht',  path: 'demo/el-iseo/index.html', q: '&dusk', t: { pl: 'Jacht', en: 'Yacht' } },
    { id: 'car',    path: 'demo/car/index.html',     q: '',      t: { pl: 'Auto', en: 'Car' } },
    { id: 'camper', path: 'demo/camper/index.html',  q: '',      t: { pl: 'Kamper', en: 'Camper' } },
    { id: 'sauna',  path: 'demo/sauna/index.html',   q: '',      t: { pl: 'Sauna', en: 'Sauna' } },
  ];

  const SECTORS = {
    pl: ['Jachty i łodzie', 'Motoryzacja', 'Kampery i przyczepy', 'Sauny i ogród', 'Meble', 'Domy modułowe', 'Kuchnie', 'Rowery', 'Oświetlenie', 'Bramy i ogrodzenia'],
    en: ['Yachts & boats', 'Automotive', 'Campers & trailers', 'Saunas & garden', 'Furniture', 'Modular homes', 'Kitchens', 'Bicycles', 'Lighting', 'Gates & fencing'],
  };

  // Teksty EN; polskie są w HTML (zapamiętywane przy starcie).
  const EN = {
    'nav.tag': '3D configurators', 'nav.services': 'Services', 'nav.work': 'Work', 'nav.process': 'Process', 'nav.cta': 'Book a demo',
    'hero.loading': 'Loading model', 'hero.kicker': 'Interactive 3D configurators',
    'hero.title': 'Your product.<br><span>Without limits.</span>',
    'hero.lede': 'Photorealistic 3D configurators that let your customers explore, customise and experience the product — before they buy.',
    'hero.cta1': 'Explore our work', 'hero.cta2': 'Book a demo', 'hero.try': 'Configure', 'hero.drag': 'Drag to rotate',
    's1.label': 'Studio',
    's1.big': 'A photo shows one variant. <span>A configurator shows them all: in the colour the customer picked, from every side, in every light.</span>',
    'f1.t': 'In the browser', 'f1.d': 'No apps, no plugins. Works on desktop, tablet and phone.',
    'f2.t': 'Fast start', 'f2.d': 'Lean code and web-optimised models. Customers don’t stare at a progress bar.',
    'f3.t': 'One embed code', 'f3.d': 'Drop it into WordPress, Shopify, WooCommerce, PrestaShop or any HTML page.',
    'f4.t': 'Configuration in a link', 'f4.d': 'Every choice is saved in the URL, ready to send to a sales rep or attach to an enquiry.',
    's2.label': 'Services', 's2.title': 'From model <span>to sale.</span>',
    'sv1.t': '3D configurators', 'sv1.d': 'An interactive model of your product: colours, materials, variants and equipment changed live, with camera views and shareable configurations.',
    'sv2.t': 'Websites', 'sv2.d': 'Websites and landing pages built around the product: fast, polished, with the configurator on the first screen, not at the bottom of the page.',
    'sv3.t': 'Graphics & renders', 'sv3.d': 'One 3D model gives you packshots in every colour, lifestyle scenes, 360° spins and short social videos. No photo shoot needed.',
    'sv4.t': 'Integrations', 'sv4.d': 'The configurator connected to your shop, price list and inbox: the chosen version goes to the cart or lands as a ready enquiry.',
    'tag.colors': 'Colours & materials', 'tag.variants': 'Variants', 'tag.views': 'Camera views', 'tag.quote': 'Pricing',
    'tag.site': 'Company site', 'tag.anim': '360° spin', 'tag.shop': 'Shop', 'tag.form': 'Enquiry form',
    's3.label': 'Work', 's3.title': 'Click, spin, <span>change.</span>',
    'd.yacht.k': 'Motor yacht · 8.35 m', 'd.yacht.t': 'Runabout', 'd.car.k': 'Automotive · studio', 'd.camper.k': 'Campers · equipment', 'd.camper.t': 'Camper Van',
    'd.sauna.k': 'Garden · variants & sizes', 'd.sauna.t': 'Barrel sauna', 'd.open': 'Launch',
    's3.note': 'The demos are concept models. For your project we recreate your product from photos, dimensions or CAD files.',
    's4.label': 'Process', 's4.title': 'From a photo <span>to a configurator.</span>',
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
    's5.label': 'Contact', 's5.title': 'Show us <span>your product.</span>', 's5.mail': 'Write to us directly',
    's5.lead': 'Send a link or a few photos. Within 48 hours you’ll get a working configurator demo of your product, free of charge.',
    'fm.name': 'Full name', 'fm.company': 'Company / website', 'fm.product': 'Product (link or name)', 'fm.msg': 'What do you want to show your customers?',
    'fm.note': 'By sending the form you agree to be contacted about your enquiry.', 'fm.send': 'Send enquiry',
    'ft.tag': '3D configurators · Websites · Graphics',
  };
  const MSG = {
    pl: { ok: 'Dziękujemy. Odezwiemy się w ciągu 24 godzin.', req: 'Podaj imię i poprawny adres e-mail.', mail: 'Nie udało się wysłać formularza. Napisz do nas na kontakt@banatstudios.pl.', sending: 'Wysyłanie…', pause: 'Zatrzymaj obrót', play: 'Wznów obrót' },
    en: { ok: 'Thank you. We’ll get back to you within 24 hours.', req: 'Please enter your name and a valid e-mail address.', mail: 'The form could not be sent. Please write to kontakt@banatstudios.pl.', sending: 'Sending…', pause: 'Pause rotation', play: 'Resume rotation' },
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
      const v = lang === 'en' ? EN[el.dataset.i18n] : PL[el.dataset.i18n];
      if (v !== undefined) el.innerHTML = v;
    });
    $$('.lang button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === lang)));
    renderDots();
    renderMarquee();
    syncPause();
  }
  $$('.lang button').forEach((b) => b.addEventListener('click', () => {
    if (b.dataset.lang === lang) return;
    lang = b.dataset.lang; store.set('lang', lang);
    applyLang();
    loadDemo(current, true);
  }));

  /* ------------------------------------------------------------ hero: dema */
  const hero = $('.hero'), frame = $('#stage'), veil = $('#veil'), dots = $('#demos');
  const tryBtn = $('#tryBtn'), pauseBtn = $('#pauseBtn'), hint = $('#dragHint');
  let current = 0, panelOpen = false, paused = false;
  const win = () => { try { return frame.contentWindow; } catch (e) { return null; } };

  function renderDots() {
    dots.innerHTML = '';
    DEMOS.forEach((d, i) => {
      const b = document.createElement('button');
      b.type = 'button'; b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(i === current));
      b.setAttribute('aria-label', d.t[lang]);
      b.innerHTML = `<span class="t">${d.t[lang]}</span><i></i>`;
      b.addEventListener('click', () => loadDemo(i));
      dots.appendChild(b);
    });
    $('#demoNum').textContent = String(current + 1).padStart(2, '0');
    $('#demoName').textContent = DEMOS[current].t[lang];
  }
  function loadDemo(i, force = false) {
    if (i === current && !force && frame.src) return;
    current = i;
    renderDots();
    veil.classList.remove('off');
    const d = DEMOS[i];
    const src = `${d.path}?embed&lang=${lang}${d.q}`;
    setTimeout(() => { frame.src = src; }, frame.src ? 300 : 0);
  }
  frame.addEventListener('load', () => {
    setTimeout(() => veil.classList.add('off'), 450);
    const w = win();
    if (!w) return;
    // demo może się inicjalizować dłużej niż zdarzenie load (np. pobiera model) — czekamy na jego API
    const t0 = Date.now();
    (function sync() {
      if (frame.contentWindow !== w) return;
      if (w.__panel && w.__setAuto) { w.__panel(panelOpen); w.__setAuto(!paused); return; }
      if (Date.now() - t0 < 30000) setTimeout(sync, 150);
    })();
    w.addEventListener('pointerdown', hideHint, { once: true });
    if (!hintTimer) hintTimer = setTimeout(hideHint, 10000);
    setPaused(!heroVisible);
  });

  // panel opcji w demie: ukryty, dopóki ktoś nie kliknie "Konfiguruj"
  tryBtn.addEventListener('click', () => {
    panelOpen = !panelOpen;
    tryBtn.setAttribute('aria-pressed', String(panelOpen));
    hero.classList.toggle('panel-open', panelOpen);
    const w = win(); w && w.__panel && w.__panel(panelOpen);
    if (panelOpen) hideHint();
  });

  // pauza = zatrzymanie automatycznego obrotu modelu
  function syncPause() {
    pauseBtn.setAttribute('aria-pressed', String(paused));
    pauseBtn.setAttribute('aria-label', paused ? MSG[lang].play : MSG[lang].pause);
  }
  pauseBtn.addEventListener('click', () => {
    paused = !paused; syncPause();
    const w = win(); w && w.__setAuto && w.__setAuto(!paused);
  });

  function hideHint() { hint.classList.add('hide'); }
  let hintTimer = 0;

  // renderowanie wstrzymane, gdy hero nie jest widoczne (bateria, GPU)
  let heroVisible = true;
  function setPaused(p) {
    frame.style.visibility = p && !document.hidden ? 'hidden' : '';
    const w = win(); w && w.__pause && w.__pause(p);
  }
  new IntersectionObserver(([e]) => { heroVisible = e.isIntersecting; setPaused(!heroVisible); }, { threshold: 0.02 }).observe(hero);
  document.addEventListener('visibilitychange', () => setPaused(document.hidden || !heroVisible));

  // karty realizacji przełączają demo w hero (Ctrl/Cmd+klik otwiera pełny ekran)
  $$('.card[data-demo]').forEach((a) => a.addEventListener('click', (e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
    e.preventDefault();
    loadDemo(DEMOS.findIndex((d) => d.id === a.dataset.demo));
    hero.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }));

  /* ------------------------------------------------------------ nawigacja, wejścia, branże */
  const nav = $('#nav');
  const onScroll = () => nav.classList.toggle('solid', window.scrollY > 40);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -6% 0px' });
  $$('.rv').forEach((el, i) => { el.style.transitionDelay = `${(i % 4) * 80}ms`; io.observe(el); });
  // zabezpieczenie: gdyby obserwator nie zadziałał, treść i tak się pokaże
  setTimeout(() => $$('.rv').forEach((el) => el.classList.add('in')), 4000);

  function renderMarquee() {
    const items = SECTORS[lang].map((s) => `<span>${s}</span>`).join('');
    $('#marquee').innerHTML = items + items;
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
      msg.textContent = MSG[lang].mail;
    }
  });

  $('#year').textContent = new Date().getFullYear();
  applyLang();
  loadDemo(0, true);
})();
