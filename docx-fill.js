/* ============================================================================
 * docx-fill.js
 *
 * Ported from fill_contract.py. Populates the Charter Agreement Blue template
 * in the browser using PizZip. Called from the form's Generate button.
 *
 * Load order: PizZip must be loaded first (from CDN), then this file.
 *
 * Public API:
 *   generateContractDocx(payload) -> Promise<Blob>
 * ============================================================================
 */

(function (global) {
  'use strict';

  // -------- Constants --------
  const TEMPLATE_URL = './template.docx';

  // -------- Basic helpers --------
  function escapeXml(text) {
    if (text === null || text === undefined) return '';
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function makeRun(value, bold, size) {
    bold = bold || false;
    size = size || '20';
    const boldXml = bold ? '<w:b/><w:bCs/>' : '';
    return (
      '<w:r><w:rPr>' +
      '<w:rFonts w:eastAsia="Times New Roman" w:cstheme="minorHAnsi"/>' +
      boldXml +
      '<w:color w:val="000000"/>' +
      '<w:sz w:val="' + size + '"/><w:szCs w:val="' + size + '"/>' +
      '<w:lang w:eastAsia="en-GB"/>' +
      '</w:rPr>' +
      '<w:t xml:space="preserve">' + escapeXml(value) + '</w:t>' +
      '</w:r>'
    );
  }

  function reEscape(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function findNextEmptyParagraph(xml, start) {
    const emptyP = /(<w:p\b[^>]*>\s*<w:pPr>(?:[^<]|<(?!\/w:pPr>))*?<\/w:pPr>\s*)(<\/w:p>)/gs;
    const selfClose = /<w:p\b[^/>]*\/>/g;
    emptyP.lastIndex = start;
    const m1 = emptyP.exec(xml);
    selfClose.lastIndex = start;
    const m2 = selfClose.exec(xml);
    if (m1 && m2) return m1.index < m2.index ? { match: m1, style: 'wrap' } : { match: m2, style: 'self' };
    if (m1) return { match: m1, style: 'wrap' };
    if (m2) return { match: m2, style: 'self' };
    return null;
  }

  function fillAfterLabel(xml, labelText, occurrence, value, bold, size) {
    if (value === null || value === undefined || value === '') return xml;
    bold = bold || false; size = size || '20';
    const escaped = reEscape(labelText);
    const pattern = new RegExp('<w:t[^>]*>' + escaped + '</w:t>', 'g');
    const matches = [];
    let m;
    while ((m = pattern.exec(xml)) !== null) {
      matches.push({ index: m.index, end: m.index + m[0].length });
    }
    if (occurrence >= matches.length) return xml;
    const start = matches[occurrence].end;
    const result = findNextEmptyParagraph(xml, start);
    if (!result) return xml;
    const run = makeRun(value, bold, size);
    const mm = result.match;
    if (result.style === 'wrap') {
      return xml.slice(0, mm.index) + mm[1] + run + mm[2] + xml.slice(mm.index + mm[0].length);
    }
    const opening = mm[0].slice(0, -2) + '>';
    return xml.slice(0, mm.index) + opening + run + '</w:p>' + xml.slice(mm.index + mm[0].length);
  }

  // -------- Data access --------
  function get(payload, path, fallback) {
    if (fallback === undefined) fallback = '';
    const parts = path.split('.');
    let cur = payload;
    for (let i = 0; i < parts.length; i++) {
      if (cur === null || typeof cur !== 'object' || !(parts[i] in cur)) return fallback;
      cur = cur[parts[i]];
    }
    if (cur === null || cur === undefined || cur === '') return fallback;
    return cur;
  }
  function na(payload, path) { return get(payload, path, 'N/A'); }

  function euro(n) {
    const num = parseFloat(n);
    if (isNaN(num)) return '\u20ac0.00';
    return '\u20ac' + num.toLocaleString('en-MT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function truthy(v) {
    if (typeof v === 'boolean') return v;
    if (v === null || v === undefined) return false;
    const s = String(v).trim().toLowerCase();
    return s !== '' && s !== '0' && s !== 'false' && s !== 'no';
  }

  // -------- Main filler --------
  async function fillXml(xml, payload) {
    // === VESSEL & DATE ===
    const vesselMap = [
      ['VESSEL NAME:', 'vessel.name'],
      ['REGISTRATION NO.:', 'vessel.reg'],
      ['LENGTH:', 'vessel.length'],
      ['TYPE:', 'vessel.type'],
      ['DATE:', 'contract_date'],
    ];
    for (const [label, path] of vesselMap) {
      xml = fillAfterLabel(xml, label, 0, get(payload, path), true, '16');
    }

    // === OWNER ===
    for (const [label, occ, path] of [
      ['Company Name:', 0, 'owner.company_name'],
      ['Company Registration No. & State:', 0, 'owner.reg_state'],
      ['Registered Address:', 0, 'owner.address'],
      ['Company Authorised Signatory:', 0, 'owner.signatory'],
    ]) xml = fillAfterLabel(xml, label, occ, na(payload, path), false, '20');

    // === CHARTERER ===
    for (const [label, occ, path] of [
      ['Full Name:', 0, 'charterer.full_name'],
      ['Company Registration No. & State:', 1, 'charterer.reg_state'],
      ['Company VAT No:', 0, 'charterer.vat'],
      ['Company Authorised Signatory:', 1, 'charterer.auth_signatory'],
      ['Billing Details:', 0, 'charterer.billing'],
    ]) xml = fillAfterLabel(xml, label, occ, na(payload, path), false, '20');

    // === AGENT ===
    for (const [label, occ, path] of [
      ['Company Name:', 1, 'agent.company_name'],
      ['Company Registration No. & State:', 2, 'agent.reg_state'],
      ['Broker Details:', 0, 'agent.broker'],
      ['Broker Mobile Number:', 0, 'agent.mobile'],
      ['Email Address:', 0, 'agent.email'],
    ]) xml = fillAfterLabel(xml, label, occ, na(payload, path), false, '20');

    // === CO-AGENT ===
    for (const [label, occ, path] of [
      ['Company Name:', 2, 'co_agent.company_name'],
      ['Company Registration No. & State:', 3, 'co_agent.reg_state'],
      ['Company VAT No:', 1, 'co_agent.vat'],
      ['In case of an Individual \u2013 Full Name:', 0, 'co_agent.individual_name'],
      ['Co-Agent Mobile Number ', 0, 'co_agent.mobile'],
    ]) xml = fillAfterLabel(xml, label, occ, na(payload, path), false, '20');

    // === CHARTER PARTICULARS ===
    xml = fillAfterLabel(xml, 'FROM:', 0, get(payload, 'charter.from_date'), true, '16');
    xml = fillAfterLabel(xml, 'TO:', 0, get(payload, 'charter.to_date'), true, '16');

    const fromTime = get(payload, 'charter.from_time');
    const toTime = get(payload, 'charter.to_time');
    const hrsPattern = /<w:t>HRS<\/w:t>/g;
    const hrsMatches = [];
    let hm;
    while ((hm = hrsPattern.exec(xml)) !== null) {
      hrsMatches.push({ index: hm.index, end: hm.index + hm[0].length });
    }
    // Replace in reverse to keep offsets stable
    if (hrsMatches.length >= 2 && toTime) {
      const m = hrsMatches[1];
      const rep = '<w:t xml:space="preserve">' + escapeXml(toTime) + ' HRS</w:t>';
      xml = xml.slice(0, m.index) + rep + xml.slice(m.end);
    }
    if (hrsMatches.length >= 1 && fromTime) {
      const m = hrsMatches[0];
      const rep = '<w:t xml:space="preserve">' + escapeXml(fromTime) + ' HRS</w:t>';
      xml = xml.slice(0, m.index) + rep + xml.slice(m.end);
    }

    xml = fillAfterLabel(xml, 'PLACE OF DELIVERY:', 0, get(payload, 'charter.place_delivery'), true, '16');
    xml = fillAfterLabel(xml, 'PLACE OF RE-DELIVERY:', 0, get(payload, 'charter.place_redelivery'), true, '16');
    xml = fillAfterLabel(xml, 'CRUISING AREA:', 0, get(payload, 'charter.cruising_area'), false, '20');
    xml = fillAfterLabel(
      xml,
      'PLANNED ITINERARY as agreed with the Charterer (including any restaurant requests):',
      0, get(payload, 'charter.itinerary'), false, '20'
    );

    // === GUESTS ALLOWED ===
    xml = fillAfterLabel(xml, 'Day Charters:', 0, get(payload, 'guest_allowance.day_charters'), false, '20');
    xml = fillAfterLabel(xml, 'Sleeping on Board:', 0, get(payload, 'guest_allowance.sleeping_on_board'), false, '20');

    // === TICKS (19 in fixed order) ===
    const timeSlotMap = { full_day: 4, half_day_am: 5, half_day_pm: 6, other: 7 };
    const timeSlotIdx = timeSlotMap[get(payload, 'time_slot', 'full_day')] || 4;
    const ticks = {
      0:  truthy(get(payload, 'crew.captain')),
      1:  truthy(get(payload, 'crew.deckhand')),
      2:  truthy(get(payload, 'crew.stewardess')),
      3:  truthy(get(payload, 'crew.chef')),
      8:  parseInt(get(payload, 'dietary.gluten_free', 0) || 0, 10) > 0,
      9:  parseInt(get(payload, 'dietary.vegetarian', 0) || 0, 10) > 0,
      10: parseInt(get(payload, 'dietary.vegan', 0) || 0, 10) > 0,
      11: (get(payload, 'dietary.other', []) || []).length > 0,
      12: truthy(get(payload, 'chef_confirmed')),
      13: truthy(get(payload, 'watersports.seabob')),
      14: truthy(get(payload, 'watersports.jet_ski')),
      15: truthy(get(payload, 'watersports.sup')),
      16: truthy(get(payload, 'watersports.fliteboard')),
      17: truthy(get(payload, 'watersports.axopar_29')),
      18: truthy(get(payload, 'watersports.axopar_37')),
    };
    ticks[timeSlotIdx] = true;

    const boxPattern = /(<w:t[^>]*>)\u2610(<\/w:t>)/g;
    const boxes = [];
    let bm;
    while ((bm = boxPattern.exec(xml)) !== null) {
      boxes.push({ index: bm.index, end: bm.index + bm[0].length, pre: bm[1], post: bm[2] });
    }
    // Apply in reverse so earlier indices stay stable
    const idxSorted = Object.keys(ticks).map(Number).sort((a, b) => b - a);
    for (const idx of idxSorted) {
      if (ticks[idx] && idx < boxes.length) {
        const m = boxes[idx];
        xml = xml.slice(0, m.index) + m.pre + '\u2713' + m.post + xml.slice(m.end);
      }
    }

    // === FEES ===
    const charterFee = parseFloat(get(payload, 'fees.charter', 0)) || 0;
    const delivery = parseFloat(get(payload, 'fees.delivery', 0)) || 0;
    const apa = parseFloat(get(payload, 'fees.apa', 0)) || 0;
    const security = parseFloat(get(payload, 'fees.security', 0)) || 0;
    const totalCharter = charterFee + delivery;
    const totalInvoice = totalCharter + apa + security;
    const deposit = parseFloat(get(payload, 'fees.deposit', 0)) || 0;
    const balance = totalInvoice - deposit;

    xml = fillAfterLabel(xml, 'Charter Fee:', 0, euro(charterFee), false, '20');
    xml = fillAfterLabel(xml, 'Delivery & Re-Delivery Fees:', 0, euro(delivery), false, '20');
    xml = fillAfterLabel(xml, 'Total Charter Fee:', 0, euro(totalCharter), true, '20');

    // APA cell — special marker
    const apaMarker = '<w:t>30% Advance Provisioning Allowance (the &#x201C;APA&#x201D;):</w:t>';
    const apaPos = xml.indexOf(apaMarker);
    if (apaPos >= 0) {
      const result = findNextEmptyParagraph(xml, apaPos);
      if (result) {
        const mm = result.match;
        const run = makeRun(euro(apa));
        if (result.style === 'wrap') {
          xml = xml.slice(0, mm.index) + mm[1] + run + mm[2] + xml.slice(mm.index + mm[0].length);
        } else {
          const opening = mm[0].slice(0, -2) + '>';
          xml = xml.slice(0, mm.index) + opening + run + '</w:p>' + xml.slice(mm.index + mm[0].length);
        }
      }
    }

    xml = fillAfterLabel(xml, '5% Security Deposit Against Damages:', 0, euro(security), false, '20');
    xml = fillAfterLabel(xml, 'Total Amount to Invoice:', 0, euro(totalInvoice), true, '20');
    xml = fillAfterLabel(xml, 'Deposit Amount:', 0, euro(deposit), true, '20');
    xml = fillAfterLabel(xml, 'Deposit Amount due Date:', 0, get(payload, 'fees.deposit_due'), true, '20');
    xml = fillAfterLabel(xml, 'Balance Payment:', 0, euro(balance), true, '20');
    xml = fillAfterLabel(xml, 'Balance Payment Due Date:', 0, get(payload, 'fees.balance_due'), true, '20');

    // === FOR AND ON BEHALF OF ===
    const behalfValues = [
      na(payload, 'owner.company_name'),
      na(payload, 'charterer.full_name'),
      na(payload, 'agent.company_name'),
      na(payload, 'co_agent.company_name'),
      na(payload, 'owner.company_name'),
      na(payload, 'charterer.full_name'),
      na(payload, 'agent.company_name'),
      na(payload, 'co_agent.company_name'),
    ];
    const behalfLabelPattern = /<w:t[^>]*>FOR AND ON BEHALF OF[^<]*<\/w:t>/g;
    const behalfLabels = [];
    let blm;
    while ((blm = behalfLabelPattern.exec(xml)) !== null) {
      behalfLabels.push({ index: blm.index, end: blm.index + blm[0].length, text: blm[0] });
    }
    for (let i = behalfLabels.length - 1; i >= 0 && i < behalfValues.length; i--) {
      const m = behalfLabels[i];
      const val = behalfValues[i];
      const withUnderscore = m.text.match(/(FOR AND ON BEHALF OF[^_]*?)_+<\/w:t>/);
      if (withUnderscore) {
        const prefix = withUnderscore[1];
        const rep = '<w:t xml:space="preserve">' + prefix + escapeXml(val) + '</w:t>';
        xml = xml.slice(0, m.index) + rep + xml.slice(m.end);
      } else {
        const searchFrom = m.end;
        const searchWindow = xml.slice(searchFrom, searchFrom + 2000);
        const underscoreMatch = searchWindow.match(/<w:t>_+<\/w:t>/);
        if (underscoreMatch) {
          const absStart = searchFrom + underscoreMatch.index;
          const absEnd = absStart + underscoreMatch[0].length;
          xml = xml.slice(0, absStart) + '<w:t>' + escapeXml(val) + '</w:t>' + xml.slice(absEnd);
        }
      }
    }

    // === SPECIAL CONDITIONS 1)-9) ===
    const conditions = payload.special_conditions || [];
    for (let i = 1; i <= 9; i++) {
      const old = '<w:t>' + i + ')</w:t>';
      const val = (conditions[i - 1] && String(conditions[i - 1]).trim()) ? String(conditions[i - 1]) : 'N/A';
      const neu = '<w:t xml:space="preserve">' + i + ')   ' + escapeXml(val) + '</w:t>';
      const pos = xml.indexOf(old);
      if (pos >= 0) xml = xml.slice(0, pos) + neu + xml.slice(pos + old.length);
    }

    // === SIGNATURES ===
    const sigNames = [
      get(payload, 'owner.signatory'),
      get(payload, 'charterer.full_name'),
      get(payload, 'agent.broker'),
      na(payload, 'co_agent.individual_name'),
      get(payload, 'owner.signatory'),
      get(payload, 'charterer.full_name'),
      get(payload, 'agent.broker'),
      na(payload, 'co_agent.individual_name'),
    ];
    for (const name of sigNames) {
      const re = /<w:t([^>]*)>(FULL NAME OF SIGNATORY:\s*)_+<\/w:t>/;
      const m = xml.match(re);
      if (!m) break;
      const rep = '<w:t' + m[1] + '>' + m[2] + escapeXml(name) + '</w:t>';
      xml = xml.slice(0, m.index) + rep + xml.slice(m.index + m[0].length);
    }
    const sigDate = get(payload, 'signature_date');
    for (let i = 0; i < sigNames.length; i++) {
      const re = /<w:t([^>]*)>(DATE:\s*)_+<\/w:t>/;
      const m = xml.match(re);
      if (!m) break;
      const rep = '<w:t' + m[1] + '>' + m[2] + escapeXml(sigDate) + '</w:t>';
      xml = xml.slice(0, m.index) + rep + xml.slice(m.index + m[0].length);
    }

    // === PREFERENCE SHEET ===
    xml = fillAfterLabel(xml, 'Date of Charter:', 0, get(payload, 'charter.from_date'), false, '16');
    xml = fillAfterLabel(xml, 'Number of Guests:', 0, get(payload, 'guests.num_guests'), false, '16');
    xml = fillAfterLabel(xml, 'Adults:', 0, get(payload, 'guests.adults'), false, '16');
    xml = fillAfterLabel(xml, 'Children:', 0, get(payload, 'guests.children_count'), false, '16');
    xml = fillAfterLabel(xml, 'Age of Children:', 0, get(payload, 'guests.children_ages'), false, '16');
    xml = fillAfterLabel(xml, 'guest and the respective Allergy.', 0, get(payload, 'allergies'), false, '16');

    // Dietary "No of Persons" - modify the label text inline (Gluten Free, Vegetarian, Vegan, Other)
    const dietaryCounts = [
      parseInt(get(payload, 'dietary.gluten_free', 0) || 0, 10),
      parseInt(get(payload, 'dietary.vegetarian', 0) || 0, 10),
      parseInt(get(payload, 'dietary.vegan', 0) || 0, 10),
      (get(payload, 'dietary.other', []) || []).length,
    ];
    const personsPattern = /<w:t>No of Persons:<\/w:t>/g;
    const personsMatches = [];
    let pm;
    while ((pm = personsPattern.exec(xml)) !== null) {
      personsMatches.push({ index: pm.index, end: pm.index + pm[0].length });
    }
    for (let i = Math.min(personsMatches.length, 4) - 1; i >= 0; i--) {
      if (dietaryCounts[i] > 0) {
        const m = personsMatches[i];
        const rep = '<w:t xml:space="preserve">No of Persons: ' + dietaryCounts[i] + '</w:t>';
        xml = xml.slice(0, m.index) + rep + xml.slice(m.end);
      }
    }

    xml = fillAfterLabel(xml, 'Tell us all about it here:', 0, get(payload, 'special_occasion'), false, '16');

    // Beverages
    for (const [label, key] of [
      ['Which Champagne do you want to order, and what quantity?', 'champagne'],
      ['Which Wine do you want to order, and what quantity?', 'wine'],
      ['Which Beers do you want to order, and what quantity?', 'beers'],
      ['Which Spirits do you want to order, and what quantity?', 'spirits'],
      ['Which Mixers do you want to order, and what quantity?', 'mixers'],
      ['Which other beverages would you like to order, and what quantity?', 'other'],
    ]) xml = fillAfterLabel(xml, label, 0, na(payload, 'beverages.' + key), false, '16');

    // Main contact
    xml = fillAfterLabel(xml, 'Full Name:', 1, get(payload, 'main_contact.name') || get(payload, 'charterer.full_name'), false, '16');
    xml = fillAfterLabel(xml, 'Mobile No.:', 0, get(payload, 'main_contact.mobile'), false, '16');
    xml = fillAfterLabel(xml, 'Email Address:', 1, get(payload, 'main_contact.email'), false, '16');

    return xml;
  }

  // -------- Public API --------
  async function generateContractDocx(payload) {
    if (typeof PizZip === 'undefined') {
      throw new Error('PizZip is not loaded. Add the PizZip <script> tag before docx-fill.js.');
    }
    const response = await fetch(TEMPLATE_URL);
    if (!response.ok) throw new Error('Failed to load template.docx (' + response.status + ')');
    const templateBuffer = await response.arrayBuffer();

    const zip = new PizZip(templateBuffer);
    const docFile = zip.file('word/document.xml');
    if (!docFile) throw new Error('template.docx is missing word/document.xml');
    let xml = docFile.asText();

    xml = await fillXml(xml, payload);

    zip.file('word/document.xml', xml);
    return zip.generate({
      type: 'blob',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
  }

  global.generateContractDocx = generateContractDocx;
})(typeof window !== 'undefined' ? window : globalThis);
