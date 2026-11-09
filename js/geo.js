// Place search (OpenStreetMap Nominatim) and the map (Leaflet), loaded only when needed.
const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
let lastCall = 0;

// Returns up to 5 matches: { name, label, lat, lng }
export async function searchPlaces(q) {
  q = q.trim(); if (!q) return [];
  const wait = 1100 - (Date.now() - lastCall); // Nominatim asks for ≤ 1 request per second
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCall = Date.now();
  const url = `${NOMINATIM}?format=jsonv2&limit=5&addressdetails=1&countrycodes=us&q=${encodeURIComponent(q)}`;
  const r = await fetch(url, { headers: { 'Accept-Language': 'en' } });
  if (!r.ok) throw new Error('Place search is busy — try again in a moment');
  return (await r.json()).map((x) => {
    const a = x.address || {};
    const town = a.city || a.town || a.village || a.suburb || a.county || '';
    const name = x.name || x.display_name.split(',')[0];
    return { name: town && town !== name ? `${name}, ${town}` : name, label: x.display_name, lat: Number(x.lat), lng: Number(x.lon) };
  });
}

let leafletPromise = null;
export function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  leafletPromise ||= new Promise((resolve, reject) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet'; css.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css';
    document.head.append(css);
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
    s.onload = () => resolve(window.L); s.onerror = () => { leafletPromise = null; reject(new Error('Map couldn’t load — check your connection')); };
    document.head.append(s);
  });
  return leafletPromise;
}
