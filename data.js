// ============================================================
// AquaCore — shared synthetic ocean data model
// Swap these generator functions for real NetCDF model output
// and a live ARGO/station feed to connect this front end to
// actual data. Everything downstream (dashboard + comparison
// page) just calls the functions below.
// ============================================================

const DEPTHS = [0, 50, 100, 200, 500, 1000];
const N_DAYS = 8;

function lonNorm(lon){ return (lon/180) * Math.PI; }
function latNorm(lat){ return (lat/90) * Math.PI; }

function tempValue(lon, lat, depth, t){
  const ln = lonNorm(lon), la = latNorm(lat);
  const latBand = Math.cos(la) * 14; // warmer near equator
  const surface = 12 + latBand + 3*Math.sin(ln*2 + t*0.3) + 1.5*Math.cos(la*3 - t*0.15);
  const decay = Math.exp(-depth/250);
  return 2 + (surface - 2) * decay;
}
function salValue(lon, lat, depth, t){
  const ln = lonNorm(lon), la = latNorm(lat);
  const surface = 35 + 0.8*Math.sin(la*2 - t*0.2) + 0.4*Math.cos(ln*2 + t*0.1);
  return surface - 0.2*(depth/1000);
}
function currentSpeed(lon, lat, depth, t){
  const ln = lonNorm(lon), la = latNorm(lat);
  const u = -Math.sin(ln*2)*Math.cos(la*2 + t*0.2);
  const v =  Math.cos(ln*2 + t*0.2)*Math.sin(la*2);
  const surfaceSpeed = Math.sqrt(u*u+v*v) * 1.1;
  return surfaceSpeed * Math.exp(-depth/400);
}
function waveHeightValue(lon, lat, depth, t){
  const ln = lonNorm(lon), la = latNorm(lat);
  const base = 1.2 + 1.4*Math.abs(Math.sin(la*2.4 + t*0.4)) + 0.6*Math.abs(Math.cos(ln*3 - t*0.25));
  return depth === 0 ? base : base * 0.05; // waves are a surface phenomenon
}

const VARIABLES = {
  temperature: { key:'temperature', label:'Temperature', unit:'°C',  fn: tempValue,      stops:['#1e3a8a','#0891b2','#10b981','#eab308','#dc2626'] },
  salinity:    { key:'salinity',    label:'Salinity',     unit:'PSU', fn: salValue,       stops:['#3b0764','#4338ca','#0891b2','#14b8a6','#a7f3d0'] },
  currents:    { key:'currents',    label:'Currents',     unit:'m/s', fn: currentSpeed,   stops:['#071a2b','#155e75','#14b8a6','#eab308','#fef9c3'] },
  waves:       { key:'waves',       label:'Wave Height',  unit:'m',   fn: waveHeightValue,stops:['#082032','#0e4d64','#17c9c4','#8be8e0','#e7fffb'] }
};

function computeRange(fn){
  let min=Infinity, max=-Infinity;
  for (let t=0;t<N_DAYS;t++){
    for (const depth of DEPTHS){
      for (let i=0;i<=16;i++){
        for (let j=0;j<=10;j++){
          const lon = -180 + 360*i/16;
          const lat = -80 + 160*j/10;
          const v = fn(lon,lat,depth,t);
          if (v<min) min=v; if (v>max) max=v;
        }
      }
    }
  }
  return { min, max };
}
Object.keys(VARIABLES).forEach(k => { VARIABLES[k].range = computeRange(VARIABLES[k].fn); });

// ---- seeded PRNG so the "random" station network is stable across pages ----
function seededRand(seed){
  let s = seed % 2147483647; if (s<=0) s += 2147483646;
  return function(){ s = s*16807 % 2147483647; return (s-1)/2147483646; };
}
const rand = seededRand(77);

const OCEAN_REGIONS = [
  { name:'North Atlantic',  lonRange:[-60,-10], latRange:[35,60] },
  { name:'North Pacific',   lonRange:[140,-130],latRange:[20,50] },
  { name:'Equatorial Pacific', lonRange:[-170,-90], latRange:[-10,10] },
  { name:'Indian Ocean',    lonRange:[55,95],   latRange:[-25,10] },
  { name:'Southern Ocean',  lonRange:[-150,150],latRange:[-60,-40] },
  { name:'South Atlantic',  lonRange:[-40,10],  latRange:[-40,-5] }
];

// ---- Argo platform metadata pools (illustrative, not live WMO-registry data) ----
// Real Argo floats carry a unique WMO platform number, a float model, an operating
// Data Assembling Center (DAC), a deployment date, sensor payload, and a ~10-day
// profiling cycle. We generate plausible-format values per region so each station
// reads like a real float record; see the note in the dashboard UI for the caveat.
const FLOAT_MODELS_CORE = ['APEX','SOLO-II','ARVOR','PROVOR'];
const FLOAT_MODELS_BGC  = ['NAVIS BGC','ARVOR-C BGC','PROVOR-CTS5'];
const REGION_DAC = {
  'North Atlantic':      'Coriolis (France)',
  'North Pacific':       'AOML (USA)',
  'Equatorial Pacific':  'AOML (USA)',
  'Indian Ocean':        'INCOIS (India)',
  'Southern Ocean':      'CSIRO (Australia)',
  'South Atlantic':      'Coriolis (France)'
};

const N_STATIONS = 18;
const STATIONS = [];
for (let i=0;i<N_STATIONS;i++){
  const region = OCEAN_REGIONS[i % OCEAN_REGIONS.length];
  let [lonA,lonB] = region.lonRange;
  if (lonB < lonA) lonB += 360;
  let lon = lonA + rand()*(lonB-lonA);
  if (lon > 180) lon -= 360;
  const lat = region.latRange[0] + rand()*(region.latRange[1]-region.latRange[0]);
  const depthIdx = Math.floor(rand()*DEPTHS.length);

  const isBGC = rand() < 0.35; // roughly a third are biogeochemical floats, like the real fleet mix
  const models = isBGC ? FLOAT_MODELS_BGC : FLOAT_MODELS_CORE;
  const model = models[Math.floor(rand()*models.length)];
  const deployedYear = 2018 + Math.floor(rand()*7); // 2018-2024
  const cycleDays = 10; // standard Argo park-and-profile cycle
  const daysSinceDeploy = (2026 - deployedYear) * 365;
  const cyclesCompleted = Math.max(1, Math.floor(daysSinceDeploy / cycleDays * (0.85 + rand()*0.1)));
  const sensors = isBGC
    ? ['CTD (temperature/salinity)', 'Dissolved oxygen', 'Chlorophyll-a', 'Backscatter', 'pH']
    : ['CTD (temperature/salinity)'];

  STATIONS.push({
    id: 'ARGO-' + (100+i),
    name: region.name,
    lon, lat,
    depthIdx,
    depth: DEPTHS[depthIdx],
    platform: {
      wmoId: '59' + (10000 + Math.floor(rand()*89999)).toString(),
      model,
      isBGC,
      dac: REGION_DAC[region.name],
      deployedYear,
      cycleDays,
      cyclesCompleted,
      sensors,
      status: rand() < 0.92 ? 'Active' : 'Inactive'
    },
    bias: {
      temperature: (rand()-0.5)*1.0,
      salinity:    (rand()-0.5)*0.2,
      currents:    (rand()-0.5)*0.12,
      waves:       (rand()-0.5)*0.3
    },
    noiseSeed: rand()*1000
  });
}

function stationValue(station, variableKey, t){
  const v = VARIABLES[variableKey];
  const model = v.fn(station.lon, station.lat, station.depth, t);
  let observed, isLive = false;
  // Live reading is a real-time snapshot, so it only anchors "now" (t=0 / Day 1).
  // Days 2-8 stay simulated forecast so the timeline still shows variation.
  if (t === 0 && station.live && station.live[variableKey] !== undefined && variableKey !== 'salinity'){
    observed = station.live[variableKey];
    isLive = true;
  } else {
    const noise = Math.sin(t*1.7 + station.noiseSeed) * (v.range.max - v.range.min) * 0.015;
    observed = model + station.bias[variableKey] + noise;
  }
  return { model, observed, difference: observed - model, isLive };
}

// ============================================================
// LIVE DATA — Open-Meteo Marine Weather API (open-meteo.com)
// Free, no API key required for non-commercial use. Real model
// output (ECMWF WAM / DWD / MeteoFrance) for sea surface
// temperature, wave height, and ocean current speed at each
// station's real-world coordinates. Used here as the live
// "observation" side of the model-vs-observation comparison.
// Salinity has no free live-data source and stays simulated.
// ============================================================
const LIVE = { status: 'idle', lastFetched: null, error: null }; // idle | loading | live | error

async function fetchLiveData(){
  LIVE.status = 'loading'; LIVE.error = null;
  try{
    const lats = STATIONS.map(s=>s.lat.toFixed(3)).join(',');
    const lons = STATIONS.map(s=>s.lon.toFixed(3)).join(',');
    const url = `https://marine-api.open-meteo.com/v1/marine?latitude=${lats}&longitude=${lons}` +
                `&current=sea_surface_temperature,wave_height,ocean_current_velocity&timezone=auto`;
    const controller = new AbortController();
    const timeout = setTimeout(()=>controller.abort(), 9000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) throw new Error('Marine API responded ' + res.status);
    const json = await res.json();
    const list = Array.isArray(json) ? json : [json];
    let matched = 0;
    list.forEach((entry, i) => {
      const st = STATIONS[i];
      if (!st || !entry || !entry.current) return;
      const c = entry.current;
      st.live = {
        temperature: (typeof c.sea_surface_temperature === 'number') ? c.sea_surface_temperature : undefined,
        waves: (typeof c.wave_height === 'number') ? c.wave_height : undefined,
        currents: (typeof c.ocean_current_velocity === 'number') ? c.ocean_current_velocity/3.6 : undefined, // km/h -> m/s
        time: c.time
      };
      matched++;
    });
    LIVE.status = 'live';
    LIVE.lastFetched = Date.now();
    LIVE.matched = matched;
    return matched;
  } catch(err){
    LIVE.status = 'error';
    LIVE.error = err.message || String(err);
    throw err;
  }
}

function fleetStats(variableKey, t, depthIdxFilter){
  const relevant = (depthIdxFilter===undefined) ? STATIONS : STATIONS.filter(s=>s.depthIdx===depthIdxFilter);
  if (!relevant.length) return { count:0, rmse:0, bias:0 };
  let sq=0, biasSum=0;
  relevant.forEach(s=>{
    const { difference } = stationValue(s, variableKey, t);
    sq += difference*difference; biasSum += difference;
  });
  return { count: relevant.length, rmse: Math.sqrt(sq/relevant.length), bias: biasSum/relevant.length };
}

// ---- color helpers ----
function hexToRgb(hex){ const n=parseInt(hex.slice(1),16); return [(n>>16)&255,(n>>8)&255,n&255]; }
function lerp(a,b,t){ return a+(b-a)*t; }
function colorForValue(variableKey, value){
  const v = VARIABLES[variableKey];
  const stops = v.stops.map(hexToRgb);
  let t = (value - v.range.min)/(v.range.max - v.range.min || 1);
  t = Math.max(0, Math.min(1, t));
  const seg = stops.length-1;
  const segT = t*seg;
  const idx = Math.min(Math.floor(segT), seg-1);
  const localT = segT-idx;
  const c0=stops[idx], c1=stops[idx+1];
  return [lerp(c0[0],c1[0],localT)/255, lerp(c0[1],c1[1],localT)/255, lerp(c0[2],c1[2],localT)/255];
}
function colorHexForValue(variableKey, value){
  const [r,g,b] = colorForValue(variableKey, value);
  const h = c => Math.round(c*255).toString(16).padStart(2,'0');
  return '#' + h(r) + h(g) + h(b);
}
