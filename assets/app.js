(() => {
  'use strict';

  const DATA = window.POLICE_DATA;
  const { stations, groups } = DATA;
  const SOFIA_CENTER = [42.6977, 23.3219];
  const SOFIA_VIEWBOX = '22.95,42.88,23.70,42.50';
  const NOMINATIM = 'https://nominatim.openstreetmap.org';

  const $ = (sel) => document.querySelector(sel);
  const panel = $('#panel');
  const content = $('#content');

  /* ---------------- Helpers ---------------- */

  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
  const tel = (p) => `<a href="tel:${p.replace(/\s/g, '')}">${esc(p)}</a>`;
  const phoneList = (arr) => arr.map(tel).join(', ');

  /** Нормализиране на топоними за сравнение: без префикси, кавички и пунктуация. */
  const norm = (s) => ' ' + String(s ?? '')
    .toLowerCase()
    .replace(/район\s+/g, ' ')
    .replace(/(ж\.\s*к\.|ул\.|бул\.|кв\.|пл\.|гр\.|м-ст|(^|\s)с\.)/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/(\p{L})(\p{N})/gu, '$1 $2')
    .replace(/(\p{N})(\p{L})/gu, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim() + ' ';

  const toRad = (d) => (d * Math.PI) / 180;
  function distanceKm(a, b) {
    const dLat = toRad(b[0] - a[0]);
    const dLon = toRad(b[1] - a[1]);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLon / 2) ** 2;
    return 6371 * 2 * Math.asin(Math.sqrt(h));
  }
  const fmtDistance = (km) => (km < 1
    ? `${Math.round(km * 1000)} м`
    : `${km.toLocaleString('bg-BG', { maximumFractionDigits: 1 })} км`);

  async function getJSON(url, opts) {
    const res = await fetch(url, opts);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  /* ---------------- Data indexes ---------------- */

  const stationById = new Map(stations.map((s) => [s.id, s]));
  const districtIndex = new Map(); // нормализирано име на район → станция
  stations.forEach((s) => s.districts.forEach((d) => districtIndex.set(norm(d), s)));
  const settlementIndex = new Map(); // нормализирано име на село/град → район (от описанията на участъците)
  groups.forEach((g) => g.precincts.forEach((p) => {
    p._area = norm(p.area);
    p._reception = norm(p.reception);
    for (const m of `${p.area || ''} ${p.reception || ''}`.matchAll(/(?:с\.|гр\.)\s*([А-Я][а-я]+(?:\s[А-Я][а-я]+)?)/g)) {
      if (!settlementIndex.has(norm(m[1]))) settlementIndex.set(norm(m[1]), g.district);
    }
  }));

  const groupsForDistrict = (district) => groups.filter((g) => norm(g.district) === norm(district));
  const groupsForStation = (id) => groups.filter((g) => g.ru === id);

  /* ---------------- Map ---------------- */

  const map = L.map('map', { zoomControl: false, attributionControl: true }).setView(SOFIA_CENTER, 12);
  L.control.zoom({ position: 'topright' }).addTo(map);

  // Стандартни OSM плочки; приглушаването и тъмният режим са чрез CSS филтър (.leaflet-tile-pane).
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);

  /** Центрира картата, като отчита панела, който покрива част от нея. */
  function focus(latlng, zoom) {
    const z = Math.max(map.getZoom(), zoom);
    const r = panel.getBoundingClientRect();
    const mobile = r.width >= window.innerWidth - 1;
    const offset = mobile ? L.point(0, r.height / 2) : L.point(-(r.right) / 2, 0);
    const target = map.unproject(map.project(latlng, z).add(offset), z);
    map.flyTo(target, z, { duration: 0.6 });
  }

  const markers = new Map();
  stations.forEach((s) => {
    const m = L.marker([s.lat, s.lon], {
      icon: L.divIcon({ className: '', html: `<div class="ru-marker">${s.id}</div>`, iconSize: [30, 30], iconAnchor: [15, 15] }),
      title: `${s.id} РУ – СДВР`,
      keyboard: true,
    }).addTo(map);
    m.on('click', (e) => { L.DomEvent.stopPropagation(e); showStation(s.id); });
    markers.set(s.id, m);
  });

  function highlightStation(id) {
    markers.forEach((m, key) => m.getElement()?.firstElementChild?.classList.toggle('active', key === id));
  }

  /* ---------------- Districts (предварително изтеглени контури) ---------------- */

  const cssVar = (name, fallback) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
  const districtStyle = (active) => (active
    ? { color: cssVar('--accent', '#007aff'), weight: 2.5, opacity: 0.9, fill: true, fillOpacity: 0.07 }
    : { color: cssVar('--text-3', '#86868b'), weight: 1, opacity: 0.35, fill: false });

  const districts = (window.SOFIA_DISTRICTS || []).map((d) => ({
    name: d.name,
    rings: d.rings,
    layer: L.polygon(d.rings, { ...districtStyle(false), interactive: false }).addTo(map),
  }));

  /** Точка в многоъгълник (even-odd по всички пръстени, вкл. дупките). */
  function inRings(lat, lon, rings) {
    let inside = false;
    for (const ring of rings) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [yi, xi] = ring[i];
        const [yj, xj] = ring[j];
        if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
      }
    }
    return inside;
  }
  const districtAt = (lat, lon) => districts.find((d) => inRings(lat, lon, d.rings))?.name || null;

  function highlightDistricts(names = []) {
    const set = new Set(names.map(norm));
    districts.forEach((d) => {
      const active = set.has(norm(d.name));
      d.layer.setStyle(districtStyle(active));
      if (active) d.layer.bringToFront();
    });
  }
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => highlightDistricts(activeDistricts));
  let activeDistricts = [];
  const setActiveDistricts = (names) => { activeDistricts = names; highlightDistricts(names); };

  let pin = null;
  let link = null;
  function clearOverlays() {
    [pin, link].forEach((l) => l && map.removeLayer(l));
    pin = link = null;
    highlightStation(null);
    setActiveDistricts([]);
  }

  /* ---------------- Geodata services ---------------- */

  const reverseGeocode = (lat, lon) => getJSON(
    `${NOMINATIM}/reverse?format=jsonv2&addressdetails=1&zoom=18&accept-language=bg&lat=${lat}&lon=${lon}`,
  );

  async function forwardGeocode(q) {
    const params = new URLSearchParams({
      format: 'jsonv2', addressdetails: '1', limit: '1', countrycodes: 'bg',
      'accept-language': 'bg', viewbox: SOFIA_VIEWBOX, bounded: '1', q,
    });
    const res = await getJSON(`${NOMINATIM}/search?${params}`);
    return res[0] || null;
  }

  /** Намира района от адреса на Nominatim. */
  function districtFromAddress(addr) {
    if (!addr) return null;
    const values = Object.values(addr);
    const tagged = values.find((v) => /^район\s+/i.test(v) && districtIndex.has(norm(v)));
    if (tagged) return tagged.replace(/^район\s+/i, '');
    if (addr.city_district && districtIndex.has(norm(addr.city_district))) return addr.city_district;
    for (const v of [addr.village, addr.town, addr.city]) {
      if (v && settlementIndex.has(norm(v))) return settlementIndex.get(norm(v));
    }
    return null;
  }

  /** Оценява кои участъци съответстват на улицата / квартала от адреса. */
  function matchPrecincts(addr, candidateGroups) {
    if (!addr) return [];
    const road = addr.road ? norm(addr.road) : null;
    const roadLast = road?.trim().split(' ').filter((w) => w.length >= 5).pop();
    const places = [addr.neighbourhood, addr.quarter, addr.suburb, addr.residential, addr.hamlet]
      .filter(Boolean).map(norm).filter((p) => p.trim().length > 2);
    const villages = [addr.village, addr.town].filter(Boolean).map(norm);

    const scored = [];
    candidateGroups.forEach((g) => g.precincts.forEach((p) => {
      let score = 0;
      if (road && p._area.includes(road)) score += 4;
      else if (roadLast && p._area.includes(` ${roadLast} `)) score += 2;
      villages.forEach((v) => { if (p._area.includes(v)) score += 5; });
      places.forEach((pl) => {
        if (p._area.includes(pl)) score += 3;
        else if (p._reception.includes(pl)) score += p.area ? 1 : 2; // без описани граници – съдим по приемната
      });
      if (score >= 2) scored.push({ p, g, score });
    }));
    if (!scored.length) return [];
    const best = Math.max(...scored.map((s) => s.score));
    return scored.filter((s) => s.score === best).slice(0, 4);
  }

  /* ---------------- Rendering ---------------- */

  function setView(html, hash = '') {
    content.innerHTML = html;
    content.scrollTop = 0;
    panel.classList.remove('collapsed');
    const url = location.pathname + location.search + (hash ? `#${hash}` : '');
    history.replaceState(null, '', url);
  }

  const officerNames = (p) => (p.officers.length
    ? p.officers.map((o) => `${o.rank} ${o.name}`).join(', ')
    : 'Няма назначен служител');

  function precinctHTML(p, { open = false, match = false } = {}) {
    const rows = [
      p.area && ['Граници', esc(p.area)],
      p.reception && ['Приемна', esc(p.reception)],
      p.phones.length && ['Телефон', phoneList(p.phones)],
      p.hours && ['Приемно време', esc(p.hours)],
    ].filter(Boolean);
    return `
      <details class="precinct${match ? ' match' : ''}"${open ? ' open' : ''}>
        <summary>
          ${p.code ? `<span class="p-code">${esc(p.code)}</span>` : ''}
          <span class="p-names">${esc(officerNames(p))}</span>
        </summary>
        <dl class="p-body">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>
      </details>`;
  }

  function groupHTML(g, matched = new Set()) {
    return `
      <div class="group-head section-title">
        <span>ТП ${esc(g.name)}</span>
        ${g.head ? `<span class="muted">Нач. ${esc(g.head)}</span>` : ''}
      </div>
      <div class="list">${g.precincts.map((p) => precinctHTML(p, { match: matched.has(p) })).join('')}</div>`;
  }

  function stationCardHTML(s, { distance, from, primary = false, label = 'Районно управление' } = {}) {
    // Начална точка = избраното място; иначе Google гадае по IP и може да тръгне от друг град.
    const origin = from ? `&origin=${from[0].toFixed(6)},${from[1].toFixed(6)}` : '';
    const dir = `https://www.google.com/maps/dir/?api=1${origin}&destination=${s.lat},${s.lon}`;
    return `
      <div class="card${primary ? ' primary' : ''}">
        <div class="eyebrow">${esc(label)}</div>
        <div class="big">${s.id} РУ – СДВР</div>
        <div class="muted">${esc(s.address)}</div>
        <dl class="kv">
          <dt>Дежурна част</dt><dd>${phoneList(s.phones)}</dd>
          ${distance != null ? `<dt>Разстояние</dt><dd>${fmtDistance(distance)}</dd>` : ''}
          <dt>Обслужва райони</dt><dd>${s.districts.map(esc).join(', ')}</dd>
          ${s.note ? `<dt>Още</dt><dd class="small">${esc(s.note)}</dd>` : ''}
        </dl>
        <div class="actions">
          <a class="btn" href="tel:${s.phones[0].replace(/\s/g, '')}">Обади се</a>
          <a class="btn secondary" href="${dir}" target="_blank" rel="noopener">Маршрут</a>
        </div>
      </div>`;
  }

  function showHome() {
    clearOverlays();
    setView(`
      <p class="hint">Докоснете картата или потърсете адрес, за да видите кое районно управление и кой участъков инспектор обслужват мястото.</p>
      <div class="section-title">Районни управления</div>
      <div class="list">
        ${stations.map((s) => `
          <button class="row" type="button" data-station="${s.id}">
            <span class="badge">${s.id}</span>
            <span class="row-main">
              <span class="row-title">${s.id} РУ – СДВР</span>
              <span class="row-sub" style="display:block">${s.districts.map(esc).join(' · ')}</span>
            </span>
            <span class="chev">›</span>
          </button>`).join('')}
      </div>
      <p class="footnote">
        Данни: <a href="${esc(DATA.source)}" target="_blank" rel="noopener">СДВР, mvr.bg</a>,
        обновени ${new Date(DATA.updated).toLocaleDateString('bg-BG')}.
        Участъкът се определя ориентировъчно по име на улица и квартал.
      </p>`);
  }

  function showStation(id) {
    const s = stationById.get(id);
    if (!s) return showHome();
    clearOverlays();
    highlightStation(id);
    setActiveDistricts(s.districts);
    setView(`
      <button class="back" type="button" data-home>‹ Всички управления</button>
      ${stationCardHTML(s, { primary: true })}
      ${groupsForStation(id).map((g) => groupHTML(g)).join('')}
    `, `ru-${id}`);
    focus([s.lat, s.lon], 13);
  }

  /* ---------------- Main flow ---------------- */

  let requestId = 0;

  async function inspect(lat, lon, known = null) {
    const id = ++requestId;
    clearOverlays();
    pin = L.marker([lat, lon], {
      icon: L.divIcon({ className: '', html: '<div class="pin"></div>', iconSize: [22, 22], iconAnchor: [11, 11] }),
      interactive: false,
    }).addTo(map);

    // Районът и РУ се определят веднага, локално; улицата (за участъка) идва после от Nominatim.
    let district = districtAt(lat, lon);
    let place = known;
    const pending = !place?.address;
    renderResult(lat, lon, place, district, pending);
    focus([lat, lon], 14);
    if (!pending) return;

    place = await reverseGeocode(lat, lon).catch(() => null);
    if (id !== requestId) return;
    district = district || districtFromAddress(place?.address);
    const open = [...content.querySelectorAll('details[open] .p-names')].map((n) => n.textContent);
    const scroll = content.scrollTop;
    renderResult(lat, lon, place, district, false);
    content.scrollTop = scroll;
    content.querySelectorAll('details .p-names').forEach((n) => {
      if (open.includes(n.textContent)) n.closest('details').open = true;
    });
  }

  function renderResult(lat, lon, place, district, pending = false) {
    const here = [lat, lon];
    if (link) map.removeLayer(link);
    setActiveDistricts(district ? [district] : []);
    let station = district ? districtIndex.get(norm(district)) : null;
    let label = 'Районно управление';
    if (!station) {
      station = stations.reduce((a, b) => (distanceKm(here, [a.lat, a.lon]) <= distanceKm(here, [b.lat, b.lon]) ? a : b));
      label = 'Най-близко РУ · районът не е разпознат';
    }
    const dist = distanceKm(here, [station.lat, station.lon]);
    highlightStation(station.id);
    link = L.polyline([here, [station.lat, station.lon]], {
      color: '#8e8e93', weight: 2, opacity: 0.8, dashArray: '2 6', interactive: false,
    }).addTo(map);

    const a = place?.address || {};
    const title = a.road ? `${a.road}${a.house_number ? ' ' + a.house_number : ''}` : (place?.name || 'Посочена точка');
    const skeleton = '<div class="skeleton" style="width:60%"></div>';
    const sub = pending ? `район ${district || '…'}` : [a.neighbourhood || a.suburb || a.quarter || a.village || a.town, district && `район ${district}`]
      .filter(Boolean).join(' · ');

    const candidateGroups = district ? groupsForDistrict(district) : [];
    const matches = matchPrecincts(a, candidateGroups);
    const matched = new Set(matches.map((m) => m.p));

    let precinctBlock = '';
    if (candidateGroups.length) {
      precinctBlock = `
        <div class="section-title">Участъков инспектор${matches.length ? '<span class="tag">вероятно</span>' : ''}</div>
        ${pending ? `<div class="card">${skeleton}${skeleton}</div>` : matches.length
          ? `<div class="list">${matches.map((m) => precinctHTML(m.p, { open: matches.length === 1, match: true })).join('')}</div>
             <p class="muted small" style="margin-top:8px">Определено ориентировъчно по улица и квартал. Проверете границите в описанието.</p>`
          : '<p class="muted small">Не успяхме да определим точния участък автоматично. Изберете от списъка по-долу.</p>'}
        ${candidateGroups.map((g) => groupHTML(g, matched)).join('')}`;
    }

    setView(`
      <button class="back" type="button" data-home>‹ Всички управления</button>
      <div class="place">${esc(title)}</div>
      ${sub ? `<div class="muted small">${esc(sub)}</div>` : ''}
      ${stationCardHTML(station, { distance: dist, from: here, primary: true, label })}
      ${precinctBlock}
    `, `${lat.toFixed(5)},${lon.toFixed(5)}`);
  }

  /* ---------------- Events ---------------- */

  map.on('click', (e) => inspect(e.latlng.lat, e.latlng.lng));

  content.addEventListener('click', (e) => {
    const st = e.target.closest('[data-station]');
    if (st) return showStation(st.dataset.station);
    if (e.target.closest('[data-home]')) {
      showHome();
      map.flyTo(SOFIA_CENTER, 12, { duration: 0.6 });
    }
  });

  $('#search').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = $('#q');
    const q = input.value.trim();
    if (!q) return;
    input.blur();
    try {
      const hit = await forwardGeocode(/софия|sofia/i.test(q) ? q : `${q}, София`) || await forwardGeocode(q);
      if (!hit) throw new Error('not found');
      inspect(parseFloat(hit.lat), parseFloat(hit.lon), hit);
    } catch {
      setView(`
        <button class="back" type="button" data-home>‹ Всички управления</button>
        <p class="error">Адресът „${esc(q)}“ не е намерен.</p>
        <p class="muted small" style="margin-top:6px">Опитайте с по-кратък адрес (напр. „Тинтява 13“ или „Младост 1 бл. 26“) или докоснете картата.</p>`);
    }
  });

  const locateBtn = $('#locate');
  locateBtn.addEventListener('click', () => {
    if (!navigator.geolocation) return;
    locateBtn.classList.add('busy');
    navigator.geolocation.getCurrentPosition(
      (pos) => { locateBtn.classList.remove('busy'); inspect(pos.coords.latitude, pos.coords.longitude); },
      () => { locateBtn.classList.remove('busy'); },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  });

  $('.panel-grip').addEventListener('click', () => panel.classList.toggle('collapsed'));

  /* ---------------- Initial state from URL ---------------- */

  function route() {
    const hash = decodeURIComponent(location.hash.slice(1));
    const coords = hash.match(/^(-?\d+\.\d+),(-?\d+\.\d+)$/);
    const ru = hash.match(/^ru-(\d{2})$/);
    if (coords) inspect(parseFloat(coords[1]), parseFloat(coords[2]));
    else if (ru) showStation(ru[1]);
    else showHome();
  }
  window.addEventListener('hashchange', route);
  route();
})();
