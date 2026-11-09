// The map on the Date log screen. The Leaflet map is created once and moved into
// each fresh render (so it keeps its zoom and doesn't flash when data changes).
import * as db from './db.js';
import { S } from './db.js';
import { esc, fmtDate, STATUS } from './ui.js';
import { loadLeaflet } from './geo.js';
import { logState } from './views.js';

let map = null, layer = null, el = null, fitted = false;

// Plain map pins: filled = a date we went on, outlined = an idea we want to try
const pinIcon = (L, kind) => L.divIcon({
  className: `pin pin-${kind}`, html: '<span></span>',
  iconSize: [28, 28], iconAnchor: [14, 28], popupAnchor: [0, -26],
});

export async function mountMap() {
  const slot = document.getElementById('map-slot');
  if (!slot) return;
  el ||= Object.assign(document.createElement('div'), { className: 'map' });
  slot.append(el);
  let L;
  try { L = await loadLeaflet(); } catch (e) { slot.innerHTML = `<p class="muted center">${esc(e.message)}</p>`; return; }
  if (!document.body.contains(el)) return; // user already left the map
  if (!map) {
    map = L.map(el, { zoomControl: true, attributionControl: true });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
    }).addTo(map);
    layer = L.layerGroup().addTo(map);
    map.setView([32.9, -97.2], 9); // Dallas–Fort Worth until there are pins
  }
  map.invalidateSize();
  layer.clearLayers();

  const pts = []; let focus = null;
  for (const o of S.outings) {
    if (o.lat == null) continue;
    const m = L.marker([o.lat, o.lng], { icon: pinIcon(L, 'done'), title: db.outingTitle(o), riseOnHover: true })
      .bindPopup(`<b>${esc(db.outingTitle(o))}</b><br><span>${fmtDate(o.happened_on)}</span><br><a href="#/outing/${o.id}">Open this date ›</a>`);
    layer.addLayer(m); pts.push([o.lat, o.lng]);
    if (logState.focus === o.id) focus = m;
  }
  for (const i of S.ideas) {
    if (i.lat == null || i.status === 'done') continue;
    const m = L.marker([i.lat, i.lng], { icon: pinIcon(L, 'wish'), title: i.title, riseOnHover: true })
      .bindPopup(`<b>${esc(i.title)}</b><br><span>Idea · ${STATUS[i.status].label}</span><br><a href="#/idea/${i.id}">Open idea ›</a>`);
    layer.addLayer(m); pts.push([i.lat, i.lng]);
  }
  if (focus) { map.setView(focus.getLatLng(), 15); focus.openPopup(); logState.focus = null; fitted = true; }
  else if (!fitted && pts.length) { map.fitBounds(pts, { padding: [40, 40], maxZoom: 14 }); fitted = true; }
}
