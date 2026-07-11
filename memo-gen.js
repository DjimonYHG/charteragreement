/* ============================================================================
 * memo-gen.js
 *
 * Generates the Charter Memorandum HTML from a form payload and opens it
 * in a new browser tab where the crew can view, print or save to PDF.
 *
 * Public API:
 *   generateMemoHtml(payload) -> string
 *   openMemo(payload)         -> opens a new tab with the memo
 * ============================================================================
 */

(function (global) {
  'use strict';

  const MEMO_STYLES = `
    :root {
      --navy: #000028;
      --navy-70: rgba(0,0,40,0.7);
      --navy-50: rgba(0,0,40,0.5);
      --navy-30: rgba(0,0,40,0.3);
      --navy-10: rgba(0,0,40,0.1);
      --navy-05: rgba(0,0,40,0.05);
      --mint: #00D7A0;
      --white: #ffffff;
      --sans: Calibri, 'Helvetica Neue', Helvetica, Arial, sans-serif;
    }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; font-family: var(--sans); color: var(--navy);
      background: #eaeaef; -webkit-font-smoothing: antialiased; font-size: 13px; line-height: 1.5; }
    body { padding: 40px 20px; }
    .page { max-width: 820px; margin: 0 auto; background: var(--white);
      box-shadow: 0 4px 24px rgba(0,0,40,0.08); padding: 48px 56px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start;
      padding-bottom: 24px; border-bottom: 2px solid var(--navy); margin-bottom: 32px; }
    .brand { font-weight: 700; font-size: 15px; letter-spacing: 0.16em; }
    .doc-title { font-size: 11px; text-transform: uppercase; letter-spacing: 0.18em;
      color: var(--navy-50); margin-top: 4px; }
    .meta { text-align: right; font-size: 11px; color: var(--navy-70); }
    .meta__ref { font-weight: 600; color: var(--navy); font-size: 12px; margin-bottom: 4px; }
    .section { margin-bottom: 28px; page-break-inside: avoid; }
    .section__title { font-size: 11px; font-weight: 700; text-transform: uppercase;
      letter-spacing: 0.14em; color: var(--navy); margin: 0 0 12px 0;
      padding-bottom: 6px; border-bottom: 1px solid var(--navy-10); }
    .data-grid { display: grid; grid-template-columns: 180px 1fr; gap: 8px 24px; margin: 0; }
    .data-grid dt { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em;
      color: var(--navy-50); padding-top: 2px; }
    .data-grid dd { margin: 0; font-size: 13px; color: var(--navy); }
    .menu-card { background: var(--navy-05); border-left: 3px solid var(--mint);
      padding: 12px 16px; margin-bottom: 10px; border-radius: 0 4px 4px 0; }
    .menu-card__name { font-weight: 600; font-size: 12px; margin-bottom: 4px; }
    .menu-card__items { font-size: 12px; color: var(--navy-70); }
    .menu-card__serving { font-size: 11px; color: var(--navy-50); font-style: italic; margin-top: 6px; }
    .equip-list { display: flex; flex-wrap: wrap; gap: 8px; }
    .equip-tag { background: var(--navy-05); border: 1px solid var(--navy-10); padding: 6px 12px;
      border-radius: 4px; font-size: 12px; font-weight: 500; }
    .crew-grid { display: flex; flex-wrap: wrap; gap: 8px; }
    .crew-pill { display: inline-flex; align-items: center; padding: 6px 14px;
      border: 1px solid var(--navy-10); border-radius: 999px; font-size: 12px; color: var(--navy-30); }
    .crew-pill--on { border-color: var(--mint); color: var(--navy); }
    .crew-pill__dot { width: 8px; height: 8px; border-radius: 50%; background: var(--navy-10);
      margin-right: 8px; }
    .crew-pill--on .crew-pill__dot { background: var(--mint); }
    .signoff { margin-top: 36px; padding-top: 24px; border-top: 1px solid var(--navy-10); }
    .signoff__grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
    .signoff__line { border-bottom: 1px solid var(--navy-30); padding-bottom: 4px; height: 32px; }
    .signoff__label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em;
      color: var(--navy-50); margin-top: 4px; }
    .empty-note { font-style: italic; color: var(--navy-30); font-size: 12px; }
    @media print {
      body { background: white; padding: 0; }
      .page { box-shadow: none; margin: 0; padding: 32px; max-width: 100%; }
    }
  `;

  function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function get(p, path, fallback) {
    if (fallback === undefined) fallback = '';
    const parts = path.split('.');
    let cur = p;
    for (const k of parts) {
      if (cur === null || typeof cur !== 'object' || !(k in cur)) return fallback;
      cur = cur[k];
    }
    return (cur === null || cur === undefined || cur === '') ? fallback : cur;
  }

  function row(label, value, empty) {
    const v = value ? esc(value) : ('<span class="empty-note">' + (empty || 'Not provided') + '</span>');
    return '<dt>' + label + '</dt><dd>' + v + '</dd>';
  }

  function formatDietary(payload) {
    const bits = [];
    const gf = parseInt(get(payload, 'dietary.gluten_free', 0) || 0, 10);
    const veg = parseInt(get(payload, 'dietary.vegetarian', 0) || 0, 10);
    const vgn = parseInt(get(payload, 'dietary.vegan', 0) || 0, 10);
    if (gf > 0) bits.push('Gluten Free \u00b7 ' + gf + ' ' + (gf === 1 ? 'person' : 'persons'));
    if (veg > 0) bits.push('Vegetarian \u00b7 ' + veg + ' ' + (veg === 1 ? 'person' : 'persons'));
    if (vgn > 0) bits.push('Vegan \u00b7 ' + vgn + ' ' + (vgn === 1 ? 'person' : 'persons'));
    const other = get(payload, 'dietary.other', []) || [];
    for (const o of other) if (o && o.trim()) bits.push(o.trim());
    return bits.length ? bits.join(', ') : '';
  }

  function crewSection(payload) {
    const crew = ['captain', 'deckhand', 'stewardess', 'chef'];
    return crew.map(c => {
      const on = !!get(payload, 'crew.' + c, false);
      const label = c.charAt(0).toUpperCase() + c.slice(1);
      return '<div class="crew-pill' + (on ? ' crew-pill--on' : '') + '"><span class="crew-pill__dot"></span>' + label + '</div>';
    }).join('');
  }

  function watersportsSection(payload) {
    const map = {
      seabob: 'Seabob',
      jet_ski: 'Jet Ski',
      sup: "SUP's",
      fliteboard: 'FliteBoard',
      axopar_29: 'Axopar 29',
      axopar_37: 'Axopar 37',
    };
    const on = [];
    for (const k in map) {
      if (get(payload, 'watersports.' + k, false)) on.push(map[k]);
    }
    if (!on.length) return '<div class="empty-note">No watersports equipment requested.</div>';
    return on.map(name => '<span class="equip-tag">' + esc(name) + '</span>').join('');
  }

  function menuBlocks(payload) {
    const menus = payload.menus || [];
    if (!menus.length) return '';
    return menus.map((m, i) => {
      return '<dt>Menu ' + (i + 1) + '</dt><dd><div class="menu-card">' +
        (m.name ? '<div class="menu-card__name">' + esc(m.name) + '</div>' : '') +
        (m.items ? '<div class="menu-card__items">' + esc(m.items) + '</div>' : '') +
        (m.serving ? '<div class="menu-card__serving">' + esc(m.serving) + '</div>' : '') +
        '</div></dd>';
    }).join('');
  }

  function beveragesSection(payload) {
    const cats = [
      ['champagne', 'Champagne'],
      ['wine', 'Wine'],
      ['beers', 'Beers'],
      ['spirits', 'Spirits'],
      ['mixers', 'Mixers'],
      ['other', 'Other'],
    ];
    const rows = [];
    for (const [k, name] of cats) {
      const v = get(payload, 'beverages.' + k);
      if (v && v !== 'N/A') rows.push(row(name, v));
    }
    if (!rows.length) return '<div class="empty-note">No beverage order.</div>';
    return '<dl class="data-grid">' + rows.join('') + '</dl>';
  }

  function generateMemoHtml(payload) {
    const charterRef = get(payload, 'charter_ref', 'Draft');
    const chartererName = get(payload, 'charterer.full_name', 'Charter');
    const from = get(payload, 'charter.from_date');
    const to = get(payload, 'charter.to_date');
    const dateRange = from + (to && to !== from ? ' \u2013 ' + to : '');

    const catererOn = get(payload, 'catering.enabled', false);
    const catererName = get(payload, 'catering.supplier_name');
    const catererContact = get(payload, 'catering.supplier_contact');
    const drinksSupplierOn = get(payload, 'drinks.enabled', false);
    const drinksSupplierName = get(payload, 'drinks.supplier_name');
    const drinksSupplierContact = get(payload, 'drinks.supplier_contact');

    const dietaryStr = formatDietary(payload);
    const menusHtml = menuBlocks(payload);

    return '<!DOCTYPE html>' +
'<html lang="en"><head>' +
'<meta charset="UTF-8">' +
'<meta name="viewport" content="width=device-width, initial-scale=1.0">' +
'<title>Charter Memorandum \u00b7 ' + esc(chartererName) + '</title>' +
'<style>' + MEMO_STYLES + '</style>' +
'</head><body><div class="page">' +

'<div class="header">' +
'  <div>' +
'    <div class="brand">YACHTHUB GROUP</div>' +
'    <div class="doc-title">Charter Memorandum</div>' +
'  </div>' +
'  <div class="meta">' +
'    <div class="meta__ref">' + esc(charterRef) + '</div>' +
'    <div>' + esc(dateRange) + '</div>' +
'    <div>' + esc(get(payload, 'vessel.name')) + '</div>' +
'  </div>' +
'</div>' +

'<section class="section">' +
'  <h2 class="section__title">Charter Overview</h2>' +
'  <dl class="data-grid">' +
    row('Vessel', get(payload, 'vessel.name')) +
    row('Charter Date', dateRange) +
    row('Time', get(payload, 'charter.from_time') && get(payload, 'charter.to_time')
        ? get(payload, 'charter.from_time') + ' \u2013 ' + get(payload, 'charter.to_time')
        : '') +
    row('Place of Delivery', get(payload, 'charter.place_delivery')) +
    row('Place of Re-Delivery', get(payload, 'charter.place_redelivery')) +
    row('Cruising Area', get(payload, 'charter.cruising_area')) +
    row('Itinerary', get(payload, 'charter.itinerary')) +
'  </dl>' +
'</section>' +

'<section class="section">' +
'  <h2 class="section__title">Charterer &amp; Main Contact</h2>' +
'  <dl class="data-grid">' +
    row('Charterer', get(payload, 'charterer.full_name')) +
    row('Mobile', get(payload, 'charterer.mobile'), 'Not provided') +
    row('Email', get(payload, 'charterer.email'), 'Not provided') +
'  </dl>' +
'</section>' +

'<section class="section">' +
'  <h2 class="section__title">Guests</h2>' +
'  <dl class="data-grid">' +
    row('Number of Guests', get(payload, 'guests.num_guests')) +
    row('Adults', get(payload, 'guests.adults')) +
    row('Children', get(payload, 'guests.children_count')) +
    row('Ages of Children', get(payload, 'guests.children_ages'), '\u2014') +
    row('Allergies', get(payload, 'allergies'), 'None reported') +
    row('Dietary Requirements', dietaryStr, 'None') +
'  </dl>' +
'</section>' +

'<section class="section">' +
'  <h2 class="section__title">Food</h2>' +
'  <dl class="data-grid">' +
    row('Chef on Board', get(payload, 'chef_confirmed') ? 'Confirmed' : 'Not confirmed') +
    (catererOn
      ? row('Catering Supplier',
          (catererName || 'Not specified') +
          (catererContact ? ' \u00b7 ' + catererContact : ''))
      : '') +
    (get(payload, 'menu_order')
      ? row('Menu Order from Yachthub', get(payload, 'menu_order'))
      : '') +
    menusHtml +
'  </dl>' +
'</section>' +

'<section class="section">' +
'  <h2 class="section__title">Beverages</h2>' +
    (drinksSupplierOn
      ? '  <dl class="data-grid">' + row('Drinks Supplier',
          (drinksSupplierName || 'Not specified') +
          (drinksSupplierContact ? ' \u00b7 ' + drinksSupplierContact : '')) + '</dl>'
      : '') +
    beveragesSection(payload) +
'</section>' +

'<section class="section">' +
'  <h2 class="section__title">Watersports Equipment Requested</h2>' +
'  <div class="equip-list">' + watersportsSection(payload) + '</div>' +
'</section>' +

'<section class="section">' +
'  <h2 class="section__title">Crew on Charter</h2>' +
'  <div class="crew-grid">' + crewSection(payload) + '</div>' +
'</section>' +

'<section class="section">' +
'  <h2 class="section__title">Special Instructions &amp; Notes</h2>' +
'  <dl class="data-grid">' +
    (get(payload, 'special_occasion')
      ? row('Special Occasion', get(payload, 'special_occasion')) : '') +
    row('Crew Notes', get(payload, 'notes.crew_internal'), '\u2014') +
'  </dl>' +
'</section>' +

'<div class="signoff">' +
'  <div class="signoff__grid">' +
'    <div><div class="signoff__line"></div><div class="signoff__label">Prepared by \u00b7 ' +
      esc(get(payload, 'agent.broker')) + '</div></div>' +
'    <div><div class="signoff__line"></div><div class="signoff__label">Received by (Captain)</div></div>' +
'  </div>' +
'</div>' +

'</div></body></html>';
  }

  function openMemo(payload) {
    const html = generateMemoHtml(payload);
    const w = window.open('', '_blank');
    if (!w) {
      alert('Popup blocked. Enable popups for this site so the memorandum can open.');
      return;
    }
    w.document.write(html);
    w.document.close();
  }

  function downloadMemo(payload, filename) {
    const html = generateMemoHtml(payload);
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  global.generateMemoHtml = generateMemoHtml;
  global.openMemo = openMemo;
  global.downloadMemo = downloadMemo;
})(typeof window !== 'undefined' ? window : globalThis);
