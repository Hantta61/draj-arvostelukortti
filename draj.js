/* DRAJ arvostelukortti – © 2026 ICT- ja karttapalvelut Peltonen. Kaikki oikeudet pidätetään. */
/* Dreeverien ajokokeen (DRAJ) säännöt, voimassa 1.8.2018 – pisteytyslogiikka. */
(function (root) {
  'use strict';
  const MIN = 60000;
  const num = v => (v === '' || v === null || v === undefined || isNaN(+String(v).replace(',', '.'))) ? null : +String(v).replace(',', '.');

  // Ominaisuudet 7 × 0–5 p (0,5 p tarkkuus) = 35 p. Ajoaika enintään 65 p. Yhteensä 100 p.
  const CATS = [
    { id: 1, key: 'haku', name: 'Haku ennen yöjäljen löytämistä' },
    { id: 2, key: 'ylos', name: 'Ylösottotyöskentely ja äänenanto yöjäljellä' },
    { id: 3, key: 'ajov', name: 'Ajovarmuus ja hukkatyöskentely' },
    { id: 4, key: 'hauk', name: 'Haukku, kuuluvuus' },
    { id: 5, key: 'vaiht', name: 'Haukun vaihtelevuus ja kertovuus' },
    { id: 6, key: 'yht', name: 'Yhteistyö ja tottelevaisuus' },
    { id: 7, key: 'koko', name: 'Kokonaisvaikutelma' }
  ];
  const BREEDS = {
    dreeveri: { name: 'Dreeveri', limits: [75, 60, 45] },
    basset: { name: 'Bassetit', limits: [60, 50, 40] },
    alppi: { name: 'Alppienajokoira', limits: [40, 30, 20] }
  };
  const ajoPts = min => +(65 * Math.min(180, Math.max(0, min)) / 180).toFixed(2);   // 65 × t / 180
  function prize(total, breed) {
    const l = (BREEDS[breed] || BREEDS.dreeveri).limits;
    return total >= l[0] ? 1 : total >= l[1] ? 2 : total >= l[2] ? 3 : 0;
  }

  /* ---- Ajanotto ----
     Tapahtumat: irti, yojalki, ajo, hukka, jatkuu, nahty, eraloppu, kytk, era
     Erä alkaa ajon alusta (ylösotto) ja kestää valitun ajan (120 tai 60 min).
     Hyväksytty ajoaika = erän pituus − vähintään 5 min hukat − ajolöysyys. */
  function timeline(events, now, opts) {
    opts = opts || {};
    const len1 = +opts.era1 === 60 ? 60 : 120;
    const lens = [len1, len1 === 120 ? 60 : 120];
    const loys = (opts.loys || []).map(v => Math.max(0, num(v) || 0));
    const ev = [...events].sort((a, b) => a.t - b.t);
    const koeLoppu = ev.find(e => e.type === 'era');
    const end = koeLoppu ? koeLoppu.t : now;
    const haut = [], erat = [];
    let haku = null, era = null, gap = null, inAjo = false;
    const closeHaku = t => { if (haku) { haku.end = t; haut.push(haku); haku = null; } };
    const closeGap = t => { if (gap) { gap.end = Math.min(t, era.limit); era.gaps.push(gap); gap = null; } };
    const closeEra = (t, why) => { if (era) { closeGap(t); era.end = Math.min(t, era.limit); era.why = why; erat.push(era); era = null; inAjo = false; } };
    for (const e of ev) {
      if (koeLoppu && e.t > koeLoppu.t) break;
      if (era && e.t >= era.limit) closeEra(era.limit, 'aika');
      switch (e.type) {
        case 'irti': closeEra(e.t, 'kytk'); closeHaku(e.t); haku = { start: e.t }; break;
        case 'ajo':
          if (era) { closeGap(e.t); inAjo = true; break; }               // ajo jatkuu erän sisällä
          if (erat.length >= 2) break;
          closeHaku(e.t);
          { const L = lens[erat.length]; era = { n: erat.length + 1, len: L, start: e.t, limit: e.t + L * MIN, gaps: [] }; inAjo = true; }
          break;
        case 'hukka': if (era && inAjo) { gap = { start: e.t }; inAjo = false; } break;
        case 'jatkuu': if (era) { closeGap(e.t); inAjo = true; } break;
        case 'eraloppu': closeEra(e.t, 'loppu'); break;
        case 'kytk': closeEra(e.t, 'kytk'); closeHaku(e.t); break;
        case 'era': closeEra(e.t, 'koe'); closeHaku(e.t); break;
      }
    }
    if (era && end >= era.limit) closeEra(era.limit, 'aika');
    const live = !koeLoppu && !!(era || haku);
    const liveEra = era;
    if (era) { if (gap) { gap.end = Math.min(end, era.limit); gap.open = true; era.gaps.push(gap); gap = null; } era.end = Math.min(end, era.limit); era.open = true; erat.push(era); }
    if (haku) { haku.end = end; haku.open = !koeLoppu; haut.push(haku); }
    const r = x => Math.round(x / MIN);
    let hukkaCount = 0;
    erat.forEach((a, i) => {
      // erä päättynyt ennen aikaa (kytkentä): loppuaika ei ole ajoa
      const used = a.end - a.start;
      let ded = 0, lyhyt = 0;
      a.gaps.forEach(g => { const len = g.end - g.start; if (len <= 0) return; hukkaCount++; g.min = r(len); if (len >= 5 * MIN) { ded += len; g.deducted = true; } else lyhyt += len; });
      a.hukat = r(ded); a.lyhyet = r(lyhyt); a.loys = loys[i] || 0; a.kesto = r(used);
      a.ajo = Math.max(0, r(used - ded) - a.loys);
      a.jaljella = a.open ? Math.max(0, r(a.limit - now)) : 0;
    });
    const hakuMs = haut.reduce((x, h) => x + (h.end - h.start), 0);
    const ajoMin = erat.reduce((x, a) => x + a.ajo, 0);
    return {
      haut, erat, live, liveEra: liveEra ? erat[erat.length - 1] : null, inAjo, ended: !!koeLoppu,
      hakuaika: r(hakuMs), hakuJaljella: Math.max(0, 240 - r(hakuMs)),
      ajoMin, ajoPts: ajoPts(ajoMin), hukkaCount, hukatMin: erat.reduce((x, a) => x + a.hukat, 0),
      lens, yojalki: ev.some(e => e.type === 'yojalki')
    };
  }

  /* ---- Matkat ---- */
  function distances(tl, events, group, dog) {
    const G = root.GEO || (typeof require !== 'undefined' ? require('./geo.js') : null);
    const hasDog = dog && dog.length > 1;
    const out = { hasDog, hakuKm: null, haut: [], erat: [], groupKm: group && group.length > 1 ? G.length(group, -Infinity, Infinity) / 1000 : 0, dogKm: hasDog ? G.length(dog, -Infinity, Infinity) / 1000 : 0 };
    if (!hasDog) return out;
    const gAt = t => G.groupAt(group, events, t);
    let hk = 0;
    tl.haut.forEach(h => {
      const km = G.length(dog, h.start, h.end) / 1000; hk += km;
      let m = null;
      dog.filter(p => p[0] >= h.start && p[0] <= h.end).forEach(p => { const g = gAt(p[0]); if (g) { const d = G.dist(p, g); if (m === null || d > m) m = d; } });
      out.haut.push({ km: +km.toFixed(2), dist: m === null ? null : Math.round(m) });
    });
    out.hakuKm = +hk.toFixed(2);
    tl.erat.forEach(a => out.erat.push({ km: +(G.length(dog, a.start, a.end) / 1000).toFixed(2) }));
    return out;
  }

  const api = { CATS, BREEDS, ajoPts, prize, timeline, distances, num };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.DRAJ = api;
})(this);
