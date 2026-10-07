// DOM side: loader, nav, story steps, lineup labels/detail, combo list, menu, cart.
import { SITE, BREADS, EXTRAS } from './data.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const money = (n) => `${SITE.currency} ${n}`;
const pad2 = (n) => String(n).padStart(2, '0');

const ALL = [...BREADS, ...EXTRAS];
const byId = Object.fromEntries(ALL.map((x) => [x.id, x]));
const COMBO_WAS = byId.sheermaal.price * 2 + byId.kulcha.price + byId.chai.price;

function waLink(text) {
  return `https://wa.me/${SITE.whatsapp}?text=${encodeURIComponent(text)}`;
}

export function initUI({ goLineup, setDetail }) {
  document.body.classList.add('loading');

  // ---------------------------------------------------------- static fills
  $$('[data-site]').forEach((el) => { el.textContent = SITE[el.dataset.site]; });
  $$('[data-year]').forEach((el) => { el.textContent = new Date().getFullYear(); });
  $$('[data-wa-link]').forEach((el) => { el.href = waLink(`Assalam o Alaikum! ${SITE.nameEn} se order karna hai.`); });
  $('[data-combo-was]').textContent = money(COMBO_WAS);
  $('[data-combo-price]').textContent = money(byId.nashta.price);

  const track = $('[data-marquee]');
  const words = BREADS.map((b) => `<span>${b.en}</span><span class="ur" lang="ur" dir="rtl">${b.ur}</span><span class="star">✦</span>`).join('');
  track.innerHTML = words + words;

  // ---------------------------------------------------------- menu
  const grid = $('[data-menu-grid]');
  grid.innerHTML = ALL.map((it) => `
    <article class="card" data-cat="${it.cat}" style="--c:${it.theme ? it.theme.accent : '#f4a531'}">
      <div class="thumb" data-thumb="${it.id}"><div class="ph"></div></div>
      <div class="card-body">
        <div class="card-top"><h3>${it.en}</h3><span class="ur" lang="ur" dir="rtl">${it.ur}</span></div>
        <p>${it.tag}</p>
        <div class="card-foot"><span class="price">${money(it.price)}</span><button class="add" data-add="${it.id}" aria-label="${it.en} order mein shamil karein">+ Add</button></div>
      </div>
    </article>`).join('');

  $$('.tabs button').forEach((btn) => btn.addEventListener('click', () => {
    $$('.tabs button').forEach((b) => { b.classList.toggle('on', b === btn); b.setAttribute('aria-selected', String(b === btn)); });
    const f = btn.dataset.filter;
    $$('.card', grid).forEach((c) => c.classList.toggle('hide', f !== 'all' && c.dataset.cat !== f));
  }));

  // ---------------------------------------------------------- cart
  const cart = new Map();
  const fab = $('.cart-fab');
  const list = $('[data-cart-list]');
  const send = $('[data-cart-send]');
  const toastEl = $('[data-toast]');
  let toastTimer = 0;

  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 1800);
  }

  function renderCart() {
    let count = 0, total = 0;
    const lines = [];
    for (const [id, q] of cart) {
      const it = byId[id];
      count += q; total += q * it.price;
      lines.push(`${q} x ${it.en} = ${money(q * it.price)}`);
    }
    $$('[data-cart-count]').forEach((el) => { el.textContent = count; });
    $('[data-cart-total]').textContent = count ? money(total) : '';
    $('[data-cart-sum]').textContent = money(total);
    fab.classList.toggle('show', count > 0);
    list.innerHTML = count
      ? [...cart].map(([id, q]) => `
        <li><div class="nm">${byId[id].en}<small>${money(byId[id].price)} har ek</small></div>
        <div class="qty"><button data-q="${id}" data-d="-1" aria-label="Kam karein">−</button><span>${q}</span><button data-q="${id}" data-d="1" aria-label="Zyada karein">+</button></div></li>`).join('')
      : '<li class="cart-empty">Abhi tak kuch nahi. Menu se kuch shamil karein.</li>';
    send.href = waLink(`Assalam o Alaikum! ${SITE.nameEn} se order:\n${lines.join('\n')}\nTotal: ${money(total)}`);
    send.setAttribute('aria-disabled', String(count === 0));
  }

  function add(id, n = 1) {
    const q = (cart.get(id) || 0) + n;
    if (q <= 0) cart.delete(id); else cart.set(id, q);
    renderCart();
    if (n > 0) {
      toast(`${byId[id].en} order mein shamil ✓`);
      fab.classList.remove('bump');
      void fab.offsetWidth;
      fab.classList.add('bump');
    }
  }

  const openCart = (open) => {
    document.body.classList.toggle('cart-open', open);
    $('.cart').setAttribute('aria-hidden', String(!open));
  };

  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-add]');
    if (a) { add(a.dataset.add); return; }
    const q = e.target.closest('[data-q]');
    if (q) { add(q.dataset.q, Number(q.dataset.d)); return; }
    if (e.target.closest('[data-open-cart]')) { openCart(true); return; }
    if (e.target.closest('[data-close-cart]')) openCart(false);
  });
  renderCart();

  // ---------------------------------------------------------- story
  const steps = $$('.step');
  const rail = $('.story-rail');
  const railDots = $$('span', rail);
  let lastStep = -1;
  function setStory(p, step) {
    rail.style.setProperty('--p', p.toFixed(4));
    if (step === lastStep) return;
    lastStep = step;
    steps.forEach((s, i) => { s.classList.toggle('on', i === step); s.classList.toggle('past', i < step); });
    railDots.forEach((d, i) => d.classList.toggle('on', i <= step));
  }

  // ---------------------------------------------------------- lineup
  const lineup = $('#lineup');
  const snaps = $('.snaps', lineup);
  snaps.innerHTML = BREADS.map((_, i) => `<i style="top:calc(${i} * var(--step))"></i>`).join('');
  const dots = $('[data-lu-dots]');
  dots.innerHTML = BREADS.map((b, i) => `<button aria-label="${b.en}" data-i="${i}"></button>`).join('');
  dots.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) goLineup(Number(b.dataset.i)); });
  let cur = 0;
  $('[data-lu-prev]').addEventListener('click', () => goLineup(cur - 1));
  $('[data-lu-next]').addEventListener('click', () => goLineup(cur + 1));
  $('[data-lu-open]').addEventListener('click', () => setDetail(true));
  $('[data-lu-close]').addEventListener('click', () => setDetail(false));
  $('[data-d-add]').addEventListener('click', () => add(BREADS[cur].id));
  const nameBox = $('.lu-name');

  function setLineup(i) {
    cur = i;
    const b = BREADS[i];
    lineup.style.setProperty('--accent', b.theme.accent);
    $('[data-lu-index]').textContent = pad2(i + 1);
    $('[data-lu-ur]').textContent = b.ur;
    $('[data-lu-en]').textContent = b.en;
    $('[data-lu-tag]').textContent = b.tag;
    nameBox.classList.remove('swap');
    void nameBox.offsetWidth;
    nameBox.classList.add('swap');
    $$('button', dots).forEach((d, k) => d.classList.toggle('on', k === i));
    $('[data-d-kicker]').textContent = `${pad2(i + 1)} / ${pad2(BREADS.length)}`;
    $('[data-d-en]').textContent = b.en;
    $('[data-d-ur]').textContent = b.ur;
    $('[data-d-tag]').textContent = b.tag;
    $('[data-d-desc]').textContent = b.desc;
    $('[data-d-price]').textContent = money(b.price);
    $('[data-d-specs]').innerHTML = Object.entries(b.specs).map(([k, v]) =>
      `<div class="spec"><span>${k}</span><span class="bar">${[0, 1, 2, 3, 4].map((n) => `<i class="${n < v ? 'on' : ''}"></i>`).join('')}</span></div>`).join('');
    $('[data-d-ing]').innerHTML = b.ingredients.map((x) => `<li>${x}</li>`).join('');
  }

  function setDetailUI(open) {
    lineup.classList.toggle('detail-open', open);
    $('[data-detail]').setAttribute('aria-hidden', String(!open));
  }

  // ---------------------------------------------------------- combo
  const comboItems = $$('[data-c]');
  function setCombo(p) {
    const th = [0.36, 0.44, 0.52, 0.6];
    comboItems.forEach((el) => el.classList.toggle('on', p > th[Number(el.dataset.c)]));
  }

  // ---------------------------------------------------------- nav + loader
  const nav = $('.nav');
  const navLinks = $$('[data-nav]');
  let lastNav = '';
  function setNav(scrolled, active) {
    nav.classList.toggle('scrolled', scrolled);
    if (active === lastNav) return;
    lastNav = active;
    navLinks.forEach((a) => a.classList.toggle('on', a.dataset.nav === active));
  }

  const loader = $('#loader');
  function setLoad(p) { loader.style.setProperty('--p', p.toFixed(3)); }
  function loaded() {
    setLoad(1);
    loader.classList.add('done');
    document.body.classList.remove('loading');
    document.body.classList.add('ready');
  }

  const tip = $('.orbit-tip');
  function setTip(b) {
    tip.classList.toggle('show', !!b);
    if (!b) return;
    $('[data-tip-en]', tip).textContent = b.en;
    $('[data-tip-ur]', tip).textContent = b.ur;
    tip.style.setProperty('--c', b.theme.accent);
  }
  function moveTip(x, y) {
    const w = tip.offsetWidth;
    const left = x + 18 + w > innerWidth - 8 ? x - 18 - w : x + 18;
    tip.style.transform = `translate(${Math.round(left)}px, ${Math.round(y - 18)}px)`;
  }

  function setThumb(id, url) {
    const box = $(`[data-thumb="${id}"]`);
    if (box) box.innerHTML = `<img src="${url}" alt="${byId[id].en}" loading="lazy">`;
  }

  setLineup(0);
  setStory(0, 0);

  return { setStory, setLineup, setDetailUI, setCombo, setNav, setLoad, loaded, setThumb, toast, setTip, moveTip };
}
