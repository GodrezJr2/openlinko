/* Jaecoo J5 EV for the V2 Doors and Tyres pages, built in code from a measured blueprint.
   Sizes are the official ones (4380 x 1860 x 1650 mm, wheelbase 2620, 235/55 R18). The side profile was
   traced from a near-orthographic side photo and scaled piecewise by the wheel centres, so each overhang
   gets its true length; the cross-section, front and rear layouts come from straight front/rear photos.
   The body is one loft of rounded cross-sections. Doors and tailgate are faces of that same loft, sorted
   into their own parts, so the shut lines line up exactly and every part swings on its own hinge.
   If WebGL is unavailable, v2.html keeps the flat top-view diagram.

   createCar3D(host, {view: 'doors' | 'tyres', labels: ['FL','FR','RL','RR'] | null, dark: bool,
                      paint: '#rrggbb' | 'ivory' | 'green' | 'black' | 'white', lockIcon: '<svg>', onFail: fn})
     .set({doors: [FL,FR,RL,RR bool open], trunk, sunroof, unlocked,
           wheels: [class x4: 'ok'|'warn'|'bad'|''], values: [text x4]})
     .setPaint(colour)
     .dispose()
   The car faces +Z and its left side is +X. Wheel and door order is FL FR RL RR, as in v2.html.
   Debug URL flags: ?c3yaw=<rad> freezes the camera, ?c3open=0,1,4,5 opens doors / gate (4) / roof (5),
   ?c3paint=green, ?c3pitch=, ?c3dist=, ?c3at=x,y,z. */
import * as THREE from './three.module.min.js';

export const PAINTS = {ivory: '#c9c3b9', green: '#3e4b40', black: '#141619', white: '#e9ebea'};
const STATUS = {ok: 0x3ddc97, warn: 0xf0a93b, bad: 0xff5d5d, '': 0x7d8793};

const THEME = {
  dark:  {stage: 'radial-gradient(120% 95% at 50% 36%, #343c47 0%, #1b2129 62%, #141920 100%)',
          halo: .10, line: 0x8a95a3, lineA: .30, shadow: .85, sky: 0xdfe6ee, ground: 0x4b5563, key: 2.4, hemi: .75, env: .85},
  light: {stage: 'radial-gradient(120% 95% at 50% 36%, #f6f7f8 0%, #e4e7ea 62%, #d9dde1 100%)',
          halo: .55, line: 0xa4abb4, lineA: .55, shadow: .30, sky: 0xffffff, ground: 0xaab1ba, key: 2.1, hemi: .80, env: 1}
};

// ================================ blueprint ================================================
// Side photo (1200 px wide, car facing right): pixel x -> metres along the car, piecewise between the
// bumpers and the two wheel centres; pixel y -> metres above the road (roof at 155 px = 1.65 m).
const LEN = 4.38, WB = 2.62, Z_REAR = -LEN / 2, Z_FRONT = LEN / 2;
const AX_R = Z_REAR + .892, AX_F = AX_R + WB;                 // rear / front axle (overhangs 892 / 868 mm)
const ZP = px => px <= 290 ? Z_REAR + (px - 100) * (.892 / 190)
               : px <= 905 ? AX_R + (px - 290) * (WB / 615)
               : AX_F + (px - 905) * (.868 / 185);
const YP = py => (535 - py) * .004342;
const tab = t => t.map(([x, y]) => [ZP(x), YP(y)]);
const interp = (t, z) => { if(z <= t[0][0]) return t[0][1];
  for(let i = 1; i < t.length; i++) if(z <= t[i][0]){ const a = t[i - 1], b = t[i]; return a[1] + (b[1] - a[1]) * (z - a[0]) / (b[0] - a[0]); }
  return t[t.length - 1][1]; };

// top of the body (no rails): rear glass, spoiler lip, roof, windscreen, bonnet, nose
const TOP = tab([[100, 276], [110, 262], [130, 238], [150, 214], [162, 201], [168, 183], [180, 176], [240, 169], [300, 165], [400, 161],
                 [500, 159], [600, 159], [632, 160], [652, 166], [700, 192], [750, 226], [790, 256], [806, 266], [818, 273], [850, 281],
                 [950, 291], [1030, 299], [1065, 305], [1080, 312], [1090, 321]]);
// window line, carried on as the bonnet's shoulder ahead of the windscreen
const BELT = tab([[100, 272], [110, 264], [165, 258], [320, 260], [540, 263], [700, 266], [780, 268], [806, 271], [818, 276], [850, 284],
                  [950, 294], [1030, 302], [1065, 308], [1080, 315], [1090, 323]]);
// underside line without the wheel arches
const BOT = tab([[100, 432], [110, 445], [140, 458], [170, 466], [188, 471], [300, 478], [900, 478], [1005, 476], [1050, 474], [1075, 467], [1090, 459]]);

const TYRE_R = .358, TYRE_HW = .1175, RIM_R = .248, WHEEL_X = .79;           // 235/55 R18 (rim incl. lip), track ~1.58 m
const ARCH_R = .43, ARCH_Y = .36;
const SILL = .36;                                                               // door bottom
const DOOR_Z = [[ZP(552), ZP(805)], [ZP(318), ZP(552)]];                        // front, rear door: [rear edge, hinge edge]
const PILLARS = [[ZP(527), ZP(552)], [ZP(318), ZP(338)]];                       // B, C
const WS_Z = [ZP(634), ZP(806)];                                                // windscreen
const RG_Z = ZP(168);                                                           // rear glass ends under the spoiler
const GATE_Z = ZP(238);                                                         // tailgate hinge line on the roof
const GLASS_Z = [ZP(104), ZP(806)];                                             // side glass band

const top = z => interp(TOP, z);
const belt = z => Math.min(interp(BELT, z), top(z));
function bot(z){
  let y = interp(BOT, z);
  for(const a of [AX_R, AX_F]){ const d = z - a; if(Math.abs(d) < ARCH_R) y = Math.max(y, ARCH_Y + Math.sqrt(ARCH_R * ARCH_R - d * d)); }
  return y;
}
// plan view: flat nose and tail, corners rounded off over the last 16 / 14 cm
function plan(z){
  const f = Z_FRONT - z, r = z - Z_REAR;
  if(f < .30){ const t = 1 - f / .30; return .86 + .14 * Math.sqrt(1 - t * t); }
  if(r < .14){ const t = 1 - r / .14; return .93 + .07 * Math.sqrt(1 - t * t); }
  return 1;
}
// roof-edge half width: narrow cabin, wide bonnet, a little narrower at the tail
function roofW(z){
  if(z > WS_Z[1]) return .80;
  if(z > WS_Z[1] - .30) return .71 + .09 * (z - (WS_Z[1] - .30)) / .30;
  if(z < RG_Z) return .68;
  return .71;
}
const blackY = z => z > 1.65 ? .40 : z < -1.85 ? .54 : .355;                    // black sill / bumper skirts below this
const GATE = {t: .86, y0: .56, y1: 1.118};                                      // tailgate panel in the tail face: |x| < t * half width
// nose and tail bow outward in plan: the centre line stands 7 / 6 cm proud of the corners, eased in over the last 45 / 40 cm
const BOW_F = .07, BOW_R = .06, BOW_W = .93;
function zShift(x, z){
  const b = Math.max(0, 1 - (x / BOW_W) ** 2), df = Z_FRONT - z, dr = z - Z_REAR;
  if(df < .45) return BOW_F * b * (1 - df / .45) ** 2;
  if(dr < .40) return -BOW_R * b * (1 - dr / .40) ** 2;
  return 0;
}

// Half cross-section (left side, x >= 0) at station z. Row meaning (keep in step with classify()):
// 0-2 underside, 3 bottom corner, 4 sill = door bottom, 5-7 door skin, 8-9 shoulder crease (belt),
// 10 glass base, 11 upper glass, 12 roof edge, 13-15 roof to the centre line.
const ROWS = 16;
const CREASE = new Set([9, 10, 12]);                                           // shoulder, glass base, roof edge stay crisp
function section(z){
  const b = bot(z), bl = belt(z), t = top(z), p = plan(z), wT = roofW(z), wS = .895;
  const re = t - .035;
  const r = [[0, b], [.47, b], [.81, b], [.86, b + .05], [.90, SILL], [.925, .46], [.93, .62], [.925, .85],
             [wS + .006, bl - .035], [wS, bl], [wS - .035, bl + .012],
             [wS - .035 + (wT - wS + .035) * .88, bl + .012 + (re - bl - .012) * .88], [wT, re],
             [wT - .035, t - .006], [wT * .55, t], [0, t + .005]];
  for(let j = 1; j < ROWS; j++) if(r[j][1] < r[j - 1][1]) r[j][1] = r[j - 1][1];   // arches and the low tail squeeze rows together
  for(const q of r) q[0] *= p;
  return r;
}
// half width of the skin at height y on a ring (to place things on the body side)
function skinX(ring, y){
  for(let j = 3; j < 12; j++){ const a = ring[j], b = ring[j + 1];
    if(y >= a[1] && y <= b[1] && b[1] > a[1]) return a[0] + (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]); }
  return ring[6][0];
}

// stations: every 3.5 cm, plus every edge that must line up exactly
function stations(){
  const s = [];
  for(let z = Z_REAR; z <= Z_FRONT + 1e-6; z += .035) s.push(z);
  const keys = [Z_REAR, Z_FRONT, ...DOOR_Z.flat(), ...PILLARS.flat(), ...WS_Z, RG_Z, GATE_Z, GLASS_Z[0]];
  for(const a of [AX_R, AX_F]) keys.push(a - ARCH_R + .001, a - ARCH_R - .001, a + ARCH_R - .001, a + ARCH_R + .001);
  const all = s.concat(keys).sort((a, b) => a - b), out = [];
  for(const z of all){ if(out.length && z - out[out.length - 1] < .009){ if(keys.includes(z)) out[out.length - 1] = z; continue; } out.push(z); }
  return out;
}

// ================================ materials ================================================
function envMap(renderer){
  // a soft studio: grey dome, darker floor, two long softboxes and a side strip, for paint and glass reflections
  const sc = new THREE.Scene();
  const dome = new THREE.SphereGeometry(20, 32, 16), cols = [], c = new THREE.Color();
  const pos = dome.attributes.position;
  for(let i = 0; i < pos.count; i++){ const y = pos.getY(i) / 20;
    if(y < 0) c.setRGB(.16, .16, .17); else c.setRGB(.30 + .45 * y, .31 + .45 * y, .33 + .46 * y);
    cols.push(c.r, c.g, c.b); }
  dome.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  sc.add(new THREE.Mesh(dome, new THREE.MeshBasicMaterial({vertexColors: true, side: THREE.BackSide})));
  const box = (w, h, x, y, z, k) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({color: new THREE.Color(k, k, k), side: THREE.DoubleSide}));
    m.position.set(x, y, z); m.lookAt(0, 0, 0); sc.add(m); };
  box(14, 3, 0, 14, 4, 3.2); box(10, 2, -9, 8, -8, 1.8); box(3, 12, 12, 5, -2, 1.4);
  const pm = new THREE.PMREMGenerator(renderer), rt = pm.fromScene(sc, .02);
  pm.dispose(); sc.traverse(o => { if(o.geometry) o.geometry.dispose(); if(o.material) o.material.dispose(); });
  return rt;
}

function makeMats(env, paint){
  const std = o => new THREE.MeshStandardMaterial(Object.assign({envMap: env}, o));
  return {
    paint: new THREE.MeshPhysicalMaterial({color: paint, metalness: .35, roughness: .42, clearcoat: 1, clearcoatRoughness: .07, envMap: env}),
    glass: new THREE.MeshPhysicalMaterial({color: 0x0b0f14, metalness: .1, roughness: .06, envMap: env, envMapIntensity: 1.5, transparent: true, opacity: .93}),
    pillar: std({color: 0x0c0d0f, roughness: .30, metalness: .1}),
    trim: std({color: 0x18191b, roughness: .75}),
    under: std({color: 0x0d0e10, roughness: 1}),
    cabin: new THREE.MeshStandardMaterial({color: 0x0f1114, roughness: 1, side: THREE.BackSide}),
    rail: std({color: 0x34373c, roughness: .35, metalness: .6}),
    chrome: std({color: 0xc8ccd2, roughness: .18, metalness: 1}),
    seat: new THREE.MeshStandardMaterial({color: 0x5b554c, roughness: .9}),
    dash: new THREE.MeshStandardMaterial({color: 0x24262a, roughness: .8}),
    tyre: new THREE.MeshStandardMaterial({color: 0x1a1b1d, roughness: .92}),
    well: new THREE.MeshStandardMaterial({color: 0x070809, roughness: 1, side: THREE.DoubleSide}),
    tail: std({color: 0x3a0c0e, roughness: .2, emissive: 0xc0141a, emissiveIntensity: .55}),
    refl: std({color: 0x8a1016, roughness: .3, emissive: 0x500608, emissiveIntensity: .5}),
    shut: new THREE.LineBasicMaterial({color: 0x26282c, transparent: true, opacity: .75})
  };
}

// small canvas textures: light bars with lettering, number plate, perforated panels, grille, wheel face
function canvasTex(w, h, draw){
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
function letters(x, cx, cy, size, gap, txt, col){
  x.fillStyle = col; x.font = '600 ' + size + 'px "Helvetica Neue", Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  const n = txt.length; for(let i = 0; i < n; i++) x.fillText(txt[i], cx + (i - (n - 1) / 2) * gap, cy);
}
const TEX = {
  frontBar: () => canvasTex(1024, 64, (x, w, h) => {
    const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#2a2f36'); g.addColorStop(1, '#0b0d10'); x.fillStyle = g; x.fillRect(0, 0, w, h);
    x.fillStyle = 'rgba(255,255,255,.9)'; x.fillRect(0, 3, w, 3);                                   // running light across the top
    for(const s of [0, 1]){ const x0 = s ? w - 150 : 0;                                              // headlamp clusters at the ends
      const hg = x.createLinearGradient(x0, 0, x0 + 150, 0);
      hg.addColorStop(s ? 1 : 0, '#f4f7ff'); hg.addColorStop(s ? 0 : 1, '#9aa7b8'); x.fillStyle = hg; x.fillRect(x0 + 8, 14, 134, 38);
      x.fillStyle = '#0d1014'; for(let k = 0; k < 4; k++) x.fillRect(x0 + 22 + k * 30, 18, 16, 30); }
    letters(x, w / 2, h * .58, 26, 58, 'JAECOO', '#c9ced6');
  }),
  rearBar: () => canvasTex(1024, 64, (x, w, h) => {
    const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#1d1013'); g.addColorStop(1, '#0a0809'); x.fillStyle = g; x.fillRect(0, 0, w, h);
    x.fillStyle = 'rgba(255,40,40,.35)'; x.fillRect(0, h * .36, w, 14);
    x.fillStyle = '#ff2a2a'; x.fillRect(0, h * .42, w, 4);
    letters(x, w / 2, h * .55, 24, 62, 'JAECOO', '#d6d9de');
  }),
  sideLamp: rear => canvasTex(256, 32, (x, w, h) => {                            // u = 0 back end, 1 front end of the strip
    const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, rear ? '#2a0d10' : '#2a2f36'); g.addColorStop(1, rear ? '#0d0607' : '#0b0d10');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    if(rear){ x.fillStyle = '#ff2a2a'; x.fillRect(0, h * .40, w, 3); x.fillStyle = 'rgba(255,40,40,.4)'; x.fillRect(0, h * .30, w * .6, 9); }
    else { x.fillStyle = 'rgba(255,255,255,.95)'; x.fillRect(0, 2, w, 2);
      const lg = x.createLinearGradient(w * .55, 0, w, 0); lg.addColorStop(0, 'rgba(160,175,195,0)'); lg.addColorStop(1, '#eef3ff'); x.fillStyle = lg; x.fillRect(w * .55, 8, w * .45, h - 14); }
  }),
  plate: () => canvasTex(512, 112, (x, w, h) => {
    x.fillStyle = '#f2f3f4'; x.fillRect(0, 0, w, h); x.strokeStyle = '#c9ccd0'; x.lineWidth = 6; x.strokeRect(3, 3, w - 6, h - 6);
    x.fillStyle = '#16181b'; x.font = '700 64px "Helvetica Neue", Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('J5 EV', w / 2, h / 2 + 3);
  }),
  dots: () => canvasTex(256, 96, (x, w, h) => {
    x.fillStyle = '#2b2e33'; x.fillRect(0, 0, w, h); x.fillStyle = '#c4c7cc';
    for(let r = 0; r < 9; r++) for(let c = 0; c < 26; c++) x.fillRect(5 + c * 9.6 + (r % 2) * 4.8, 6 + r * 9.8, 3, 3);
  }),
  grille: () => canvasTex(256, 64, (x, w, h) => {
    x.fillStyle = '#101113'; x.fillRect(0, 0, w, h); x.fillStyle = '#2c2f34';
    for(let r = 0; r < 6; r++) for(let c = 0; c < 22; c++) x.fillRect(4 + c * 11.4, 5 + r * 10, 8, 5);
  }),
  wheel: () => canvasTex(512, 512, (x, w) => {
    const c = w / 2, R = w / 2 - 2, P = (a, r) => [c + Math.cos(a) * R * r, c + Math.sin(a) * R * r];
    x.fillStyle = '#c3c8ce'; x.beginPath(); x.arc(c, c, R, 0, 7); x.fill();                       // machined lip
    x.fillStyle = '#121315'; x.beginPath(); x.arc(c, c, R * .90, 0, 7); x.fill();                 // black aero face
    x.strokeStyle = 'rgba(255,255,255,.07)'; x.lineWidth = 2;                                      // fine turbine ribs on the inserts
    for(let k = 0; k < 60; k++){ const a = k / 60 * Math.PI * 2; x.beginPath(); x.moveTo(...P(a, .30)); x.quadraticCurveTo(...P(a + .18, .62), ...P(a + .40, .88)); x.stroke(); }
    x.lineCap = 'round';
    for(let k = 0; k < 10; k++){ const a0 = k / 10 * Math.PI * 2 - Math.PI / 2;                    // five twin spokes, swept
      for(const d of [-.05, .05]){ const a = a0 + d;
        const g = x.createLinearGradient(...P(a, .2), ...P(a + .3, .9)); g.addColorStop(0, '#f2f4f6'); g.addColorStop(1, '#a9b0b8');
        x.strokeStyle = g; x.lineWidth = R * .055;
        x.beginPath(); x.moveTo(...P(a, .20)); x.quadraticCurveTo(...P(a + .10, .58), ...P(a + .30, .90)); x.stroke(); } }
    x.fillStyle = '#c9ced4'; x.beginPath(); x.arc(c, c, R * .21, 0, 7); x.fill();
    x.fillStyle = '#26292d'; x.beginPath(); x.arc(c, c, R * .13, 0, 7); x.fill();
    x.fillStyle = '#d7dbe0'; x.beginPath(); x.arc(c, c, R * .07, 0, 7); x.fill();
    x.strokeStyle = '#3a3e44'; x.lineWidth = 3; x.beginPath(); x.arc(c, c, R * .90, 0, 7); x.stroke();
  })
};

function roundRect(w, h, r){
  const x = -w / 2, y = -h / 2, sh = new THREE.Shape();
  sh.moveTo(x + r, y); sh.lineTo(x + w - r, y); sh.quadraticCurveTo(x + w, y, x + w, y + r); sh.lineTo(x + w, y + h - r);
  sh.quadraticCurveTo(x + w, y + h, x + w - r, y + h); sh.lineTo(x + r, y + h); sh.quadraticCurveTo(x, y + h, x, y + h - r);
  sh.lineTo(x, y + r); sh.quadraticCurveTo(x, y, x + r, y); return sh;
}
// rounded box: w (x) by h (y), d deep along z, centred
function rbox(w, h, d, r){
  const b = r * .5, g = new THREE.ExtrudeGeometry(roundRect(w - 2 * b, h - 2 * b, Math.min(r, (w - 2 * b) / 2, (h - 2 * b) / 2) * .9),
    {depth: Math.max(.001, d - 2 * b), bevelEnabled: true, bevelSize: b, bevelThickness: b, bevelSegments: 3, curveSegments: 6});
  g.translate(0, 0, -(d - 2 * b) / 2); return g;
}
const plane = (w, h, m) => new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
// a strip laid on the body side (s = +1 left, -1 right) from z0 to z1, top edge at yTop(z), h tall; u runs z0 -> z1
function ribbon(s, z0, z1, yTop, h, m, n = 24){
  const pos = [], uv = [], idx = [];
  for(let k = 0; k <= n; k++){ const t = k / n, z = z0 + (z1 - z0) * t, r = section(z), y1 = yTop(z), y0 = y1 - h;
    for(const [y, v] of [[y0, 0], [y1, 1]]){ const x = skinX(r, y) + .004; pos.push(s * x, y, z + zShift(x, z)); uv.push(t, v); } }
  for(let k = 0; k < n; k++){ const a = k * 2; if(s > 0) idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); else idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals(); return new THREE.Mesh(g, m);
}

// ================================ wheel ====================================================
function makeWheel(M, face, s){
  const g = new THREE.Group();
  const lathe = (pts, seg, m) => { const geo = new THREE.LatheGeometry(pts.map(p => new THREE.Vector2(p[0], p[1])), seg); geo.rotateZ(-Math.PI / 2); return new THREE.Mesh(geo, m); };
  const h = TYRE_HW;
  g.add(lathe([[RIM_R - .004, -h + .012], [.255, -h + .002], [.300, -h - .004], [.335, -h + .006], [.352, -h + .03], [TYRE_R, -h + .05],
               [TYRE_R, h - .05], [.352, h - .03], [.335, h - .006], [.300, h + .004], [.255, h - .002], [RIM_R - .004, h - .012]], 48, M.tyre));
  const lip = new THREE.Mesh(new THREE.TorusGeometry(RIM_R - .004, .008, 6, 48), M.chrome); lip.rotation.y = Math.PI / 2; lip.position.x = s * (h - .016); g.add(lip);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(RIM_R - .008, 48), face);
  disc.rotation.y = s * Math.PI / 2; disc.position.x = s * (h - .022); g.add(disc);
  g.traverse(o => { if(o.isMesh) o.castShadow = o.receiveShadow = true; });
  return g;
}

// ================================ cabin ====================================================
function makeInterior(M){
  const g = new THREE.Group(), box = (w, h, d, x, y, z, rx, m) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m || M.seat);
    o.position.set(x, y, z); if(rx) o.rotation.x = rx; o.castShadow = o.receiveShadow = true; g.add(o); return o; };
  const seat = (x, z, w) => { box(w, .13, .50, x, .58, z); box(w, .60, .12, x, .96, z - .30, -.16); box(w * .52, .17, .10, x, 1.34, z - .38, -.16); };
  seat(-.36, .02, .48); seat(.36, .02, .48);                                        // front pair
  seat(-.38, -.92, .36); seat(0, -.92, .34); seat(.38, -.92, .36);                // rear bench
  box(1.50, .22, .40, 0, .92, .56, .25, M.dash);                                    // dash
  box(.20, .26, .80, 0, .64, -.18, 0, M.dash);                                      // console
  box(.36, .20, .02, 0, 1.12, .44, -.35, M.pillar);                                 // centre screen
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(.17, .024, 6, 24), M.dash); wheel.position.set(-.36, 1.02, .30); wheel.rotation.x = 1.0; g.add(wheel);   // right-hand drive
  box(.05, .05, .22, -.36, .97, .40, .25, M.dash);
  box(1.66, .02, 3.0, 0, .40, -.30, 0, M.under);                                    // floor
  return g;
}

// ================================ body loft ================================================
// Every skin part comes from one loft. Returns parts {body, gate, door0..3} as {class: [P, N, P, N, ...]}
// (triangle corners with smooth normals, car coordinates) and the rings for the end caps.
function buildLoft(){
  const Z = stations(), S = Z.length, rings = Z.map(section);
  const parts = {body: {}, gate: {}, door0: {}, door1: {}, door2: {}, door3: {}};
  for(const s of [1, -1]){
    const P = rings.map((r, i) => r.map(([x, y]) => new THREE.Vector3(s * x, y, Z[i] + zShift(x, Z[i]))));
    const N = P.map(r => r.map(() => new THREE.Vector3()));                         // from the faces above (row j)
    const NB = P.map(r => r.map(() => new THREE.Vector3()));                        // from the faces below, crease rows only
    const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), n = new THREE.Vector3();
    for(let i = 0; i < S - 1; i++) for(let j = 0; j < ROWS - 1; j++){
      const a = P[i][j], b = P[i][j + 1], c = P[i + 1][j], d = P[i + 1][j + 1];
      e1.subVectors(b, a).add(e2.subVectors(d, c)); n.subVectors(c, a).add(e2.subVectors(d, b));
      e1.cross(n).multiplyScalar(s);                                                   // (up the ring) x (along the car) = outward
      for(const [ii, jj] of [[i, j], [i + 1, j]]) N[ii][jj].add(e1);
      for(const [ii, jj] of [[i, j + 1], [i + 1, j + 1]]) (CREASE.has(jj) ? NB : N)[ii][jj].add(e1);
    }
    const fix = v => { if(v.lengthSq() < 1e-12) v.set(s, 0, 0); v.normalize(); };
    N.forEach((r, i) => r.forEach((v, j) => { if(!CREASE.has(j)) return; fix(NB[i][j]); if(v.lengthSq() < 1e-12) v.copy(NB[i][j]); }));
    N.forEach(r => { r[0].x = 0; r[ROWS - 1].x = 0; r.forEach(fix); });
    for(let i = 0; i < S - 1; i++) for(let j = 0; j < ROWS - 1; j++){
      const zc = (Z[i] + Z[i + 1]) / 2, yc = (P[i][j].y + P[i][j + 1].y + P[i + 1][j].y + P[i + 1][j + 1].y) / 4;
      const {part, cls} = classify(s, j, zc, yc);
      const grp = parts[part][cls] || (parts[part][cls] = []);
      const q = [[i, j], [i, j + 1], [i + 1, j + 1], [i + 1, j]];
      const tri = s > 0 ? [q[0], q[1], q[3], q[1], q[2], q[3]] : [q[0], q[3], q[1], q[1], q[3], q[2]];
      for(const [ii, jj] of tri) grp.push(P[ii][jj], jj > j && CREASE.has(jj) ? NB[ii][jj] : N[ii][jj]);
    }
  }
  capGrid(true, rings[S - 1], parts); capGrid(false, rings[0], parts);
  return {parts, rings};
}

function classify(s, j, z, y){
  let door = -1;
  if(j >= 4 && j <= 10) for(let k = 0; k < 2; k++) if(z > DOOR_Z[k][0] && z < DOOR_Z[k][1]) door = k * 2 + (s > 0 ? 0 : 1);
  const part = door >= 0 ? 'door' + door : (j >= 12 && z < GATE_Z) ? 'gate' : 'body';
  const inGlass = z > GLASS_Z[0] && z < GLASS_Z[1];
  let cls = 'paint';
  if(j < 3) cls = 'under';
  else if(j < 5) cls = y < blackY(z) ? 'trim' : 'paint';
  else if(j === 9) cls = inGlass ? 'trim' : 'paint';
  else if(j === 10) cls = inGlass ? (PILLARS.some(p => z > p[0] && z < p[1]) ? 'pillar' : 'glass') : 'paint';
  else if(j === 11) cls = inGlass ? 'pillar' : 'paint';
  else if(j >= 12) cls = (z > WS_Z[0] && z < WS_Z[1]) || z < RG_Z ? 'glass' : 'paint';
  return {part, cls};
}

// one group per part: the outside split into material groups, plus a dark inside (not behind the glass,
// so you see through the windows) for when a door is open
function partMesh(src, M, pivot, paintMat){
  const keys = Object.keys(src);
  const pos = [], nrm = [], geo = new THREE.BufferGeometry(), mats = [], inner = []; let start = 0;
  keys.forEach((k, gi) => {
    const a = src[k];
    for(let i = 0; i < a.length; i += 2){ pos.push(a[i].x - pivot.x, a[i].y - pivot.y, a[i].z - pivot.z); nrm.push(a[i + 1].x, a[i + 1].y, a[i + 1].z); }
    geo.addGroup(start, a.length / 2, gi); start += a.length / 2;
    mats.push(k === 'paint' ? paintMat : M[k]); inner.push(k === 'glass' ? null : M.cabin);
  });
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  const g = new THREE.Group(); g.position.copy(pivot);
  const outer = new THREE.Mesh(geo, mats); outer.castShadow = outer.receiveShadow = true; g.add(outer);
  g.add(new THREE.Mesh(geo, inner));
  return g;
}

// half width of an end ring at height y (bottom flat to the roof centre)
function ringHW(ring, y){
  let best = 0;
  for(let j = 2; j < ROWS - 1; j++){ const a = ring[j], b = ring[j + 1];
    if(y < a[1] - 1e-9 || y > b[1] + 1e-9) continue;
    best = Math.max(best, b[1] - a[1] < 1e-9 ? Math.max(a[0], b[0]) : a[0] + (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1])); }
  return best;
}
// The nose / tail face: a grid over the end ring, bowed like the loft. Rows include the black skirt line and
// (tail) the tailgate edges; columns are fractions of the half width, so the gate edges follow the body sides.
function capGrid(front, ring, parts){
  const z0 = front ? Z_FRONT : Z_REAR, sg = front ? 1 : -1, skirt = front ? .40 : .54;
  let ys = ring.slice(2).map(r => r[1]).concat(front ? [skirt] : [skirt, GATE.y0, GATE.y1]).sort((a, b) => a - b);
  ys = ys.filter((y, k) => !k || y - ys[k - 1] > 1e-4);
  let ts = []; for(let k = -8; k <= 8; k++) ts.push(k / 8);
  if(!front) ts.push(-GATE.t, GATE.t);
  ts = ts.sort((a, b) => a - b).filter((t, k, a) => !k || t - a[k - 1] > 1e-4);
  const V = ys.map(y => { const h = ringHW(ring, y); return ts.map(t => { const x = h * t; return new THREE.Vector3(x, y, z0 + zShift(Math.abs(x), z0)); }); });
  const N = V.map(r => r.map(() => new THREE.Vector3()));
  const e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
  for(let r = 0; r < ys.length - 1; r++) for(let c = 0; c < ts.length - 1; c++){
    e1.subVectors(V[r][c + 1], V[r][c]).add(e2.subVectors(V[r + 1][c + 1], V[r + 1][c]));
    e2.subVectors(V[r + 1][c], V[r][c]).add(new THREE.Vector3().subVectors(V[r + 1][c + 1], V[r][c + 1]));
    const n = e1.clone().cross(e2).multiplyScalar(sg);
    for(const [a, b] of [[r, c], [r, c + 1], [r + 1, c], [r + 1, c + 1]]) N[a][b].add(n);
  }
  N.forEach(r => r.forEach(v => { if(v.lengthSq() < 1e-12) v.set(0, 0, sg); v.normalize(); }));
  for(let r = 0; r < ys.length - 1; r++) for(let c = 0; c < ts.length - 1; c++){
    const gate = !front && ts[c] >= -GATE.t - 1e-6 && ts[c + 1] <= GATE.t + 1e-6 && ys[r] >= GATE.y0 - 1e-6 && ys[r + 1] <= GATE.y1 + 1e-6;
    const cls = (ys[r] + ys[r + 1]) / 2 < skirt ? 'trim' : 'paint';
    const part = gate ? parts.gate : parts.body, grp = part[cls] || (part[cls] = []);
    const q = [[r, c], [r, c + 1], [r + 1, c + 1], [r + 1, c]];
    const tri = front ? [q[0], q[1], q[2], q[0], q[2], q[3]] : [q[0], q[2], q[1], q[0], q[3], q[2]];
    for(const [a, b] of tri) grp.push(V[a][b], N[a][b]);
  }
}
// a flat-textured strip laid on the bowed nose / tail face, x0..x1 by y0..y1, `off` proud of the skin
function faceStrip(front, x0, x1, y0, y1, m, off = .003, n = 14){
  const z0 = front ? Z_FRONT : Z_REAR, sg = front ? 1 : -1, pos = [], uv = [], idx = [];
  for(let k = 0; k <= n; k++){ const x = x0 + (x1 - x0) * k / n, z = z0 + zShift(Math.abs(x), z0) + sg * off, u = front ? k / n : 1 - k / n;
    pos.push(x, y0, z, x, y1, z); uv.push(u, 0, u, 1); }
  for(let k = 0; k < n; k++){ const a = k * 2; if(front) idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); else idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals(); return new THREE.Mesh(g, m);
}

// ================================ the car ==================================================
export function createCar3D(host, opts){
  opts = opts || {};
  const renderer = new THREE.WebGLRenderer({antialias: true, alpha: true, powerPreference: 'low-power'});
  if(!renderer.getContext()) throw new Error('no webgl');
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, /iPhone|iPad|Android/.test(navigator.userAgent) ? 1.75 : 2));
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  const cv = renderer.domElement;
  cv.className = 'c3d'; cv.style.touchAction = 'pan-y';
  const P = opts.dark !== false ? THEME.dark : THEME.light;
  host.style.background = P.stage;
  host.appendChild(cv);

  const scene = new THREE.Scene();
  const envRT = envMap(renderer);
  scene.add(new THREE.HemisphereLight(P.sky, P.ground, P.hemi));
  const key = new THREE.DirectionalLight(0xffffff, P.key); key.position.set(3.2, 7, 4.2); scene.add(key);
  key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -.0004; key.shadow.normalBias = .02; key.shadow.radius = 3;
  Object.assign(key.shadow.camera, {left: -3.4, right: 3.4, top: 3.4, bottom: -3.4, near: 1, far: 20}); key.shadow.camera.updateProjectionMatrix();
  const fill = new THREE.DirectionalLight(0xdfe8ff, .6); fill.position.set(-5, 3, -4); scene.add(fill);

  const dbgPaint = /c3paint=([#\w]+)/.exec(location.search);
  const paintOf = c => new THREE.Color(PAINTS[c] || c || PAINTS.ivory);
  const M = makeMats(envRT.texture, paintOf(dbgPaint ? decodeURIComponent(dbgPaint[1]) : opts.paint));
  M.paint.envMapIntensity = P.env;
  const car = new THREE.Group(); scene.add(car);

  // ---- body, doors, tailgate from the loft ----
  const L = buildLoft();
  const kit = {doors: [], gate: null, gateMat: null, wheels: [], sun: null};
  car.add(partMesh(L.parts.body, M, new THREE.Vector3(), M.paint));
  const paintMats = [M.paint];
  for(let i = 0; i < 4; i++){
    const s = i % 2 === 0 ? 1 : -1, zr = DOOR_Z[i >> 1];
    const hinge = new THREE.Vector3(s * .90, .70, zr[1]);
    const pm = M.paint.clone(); paintMats.push(pm);
    const g = partMesh(L.parts['door' + i], M, hinge, pm); car.add(g);
    const loc = (x, y, z) => new THREE.Vector3(x - hinge.x, y - hinge.y, z - hinge.z);
    // shut lines along the door's front, rear and bottom edges, a hair outside the skin
    const segs = [], off = .003;
    for(const z of [zr[0] + .002, zr[1] - .002]){ const r = section(z), seg = [];
      for(let j = 4; j <= 11; j++) seg.push(loc(s * (r[j][0] + off), r[j][1], z)); segs.push(seg); }
    const btm = []; for(let t = 0; t <= 24; t++){ const z = zr[0] + (zr[1] - zr[0]) * t / 24, r = section(z); btm.push(loc(s * (r[4][0] + off), r[4][1] + .004, z)); }
    segs.push(btm);
    segs.forEach(seg => g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(seg), M.shut)));
    // flush pull handle, body colour on a dark recess
    const hz = i < 2 ? ZP(600) : ZP(358), hy = 1.0, hx = skinX(section(hz), hy);
    const rec = new THREE.Mesh(rbox(.22, .05, .012, .02), M.trim); rec.position.copy(loc(s * (hx + .002), hy, hz)); rec.rotation.y = Math.PI / 2; g.add(rec);
    const hd = new THREE.Mesh(rbox(.20, .032, .018, .014), pm); hd.position.copy(loc(s * (hx + .010), hy + .004, hz)); hd.rotation.y = Math.PI / 2; hd.castShadow = true; g.add(hd);
    if(i < 2){                                                                      // door mirror rides on the front door
      const mz = ZP(742), by = belt(mz), my = by + .06, mx = skinX(section(mz), by - .01);
      const base = new THREE.Mesh(rbox(.05, .06, .14, .015), M.trim); base.position.copy(loc(s * (mx + .02), my - .02, mz)); g.add(base);
      const hs = new THREE.Mesh(rbox(.20, .105, .09, .032), pm); hs.position.copy(loc(s * (mx + .14), my + .02, mz - .03)); hs.rotation.y = s * .10; hs.castShadow = true; g.add(hs);
      const gl = plane(.19, .09, M.glass); gl.position.copy(loc(s * (mx + .14), my + .02, mz - .081)); gl.rotation.y = Math.PI + s * .10; g.add(gl);
      const rep = new THREE.Mesh(rbox(.10, .012, .02, .006), M.trim); rep.position.copy(loc(s * (mx + .17), my - .035, mz - .02)); g.add(rep);
    }
    kit.doors.push({grp: g, mat: pm, cur: 0, to: 0, max: -s * .95});
  }

  // ---- tailgate: roof faces behind the hinge line plus its panel in the tail face, all from the loft ----
  const ringR = L.rings[0], ringF = L.rings[L.rings.length - 1];
  const gpm = M.paint.clone(); paintMats.push(gpm);
  const gHinge = new THREE.Vector3(0, top(GATE_Z), GATE_Z);
  const gate = partMesh(L.parts.gate, M, gHinge, gpm); car.add(gate);
  const onGate = o => { o.position.sub(gHinge); gate.add(o); return o; };
  const plateM = new THREE.MeshStandardMaterial({map: TEX.plate(), roughness: .5});
  {
    // light bar right under the glass: lettered middle on the gate, red lamps on the corners, wrapping along the sides
    const by = 1.082, bh = .066, hw = ringHW(ringR, by) - .006, gw = GATE.t * ringHW(ringR, by);
    const barM = new THREE.MeshStandardMaterial({map: TEX.rearBar(), roughness: .25, emissive: 0xffffff, emissiveIntensity: .35}); barM.emissiveMap = barM.map;
    const rearSideM = new THREE.MeshStandardMaterial({map: TEX.sideLamp(true), roughness: .2, emissive: 0xffffff, emissiveIntensity: .45}); rearSideM.emissiveMap = rearSideM.map;
    onGate(faceStrip(false, -gw + .006, gw - .006, by - bh / 2, by + bh / 2, barM));
    for(const s of [1, -1]){
      car.add(faceStrip(false, s > 0 ? gw + .008 : -hw, s > 0 ? hw : -gw - .008, by - bh / 2, by + bh / 2, M.tail, .003, 4));
      car.add(ribbon(s, Z_REAR + .004, ZP(190), z => by + bh / 2, bh, rearSideM));
      car.add(faceStrip(false, s > 0 ? .72 : -.80, s > 0 ? .80 : -.72, .575, .600, M.refl, .003, 3));
    }
    onGate(faceStrip(false, -.26, .26, .745, .859, plateM, .005, 4));
    const stop = new THREE.Mesh(rbox(.42, .02, .02, .008), M.tail); stop.position.set(0, top(RG_Z + .02) - .015, RG_Z + .005); car.add(stop);
    // shut line round the gate panel, and across the roof at the hinge
    const ol = [], at = (t, y) => { const x = t * ringHW(ringR, y); return new THREE.Vector3(x, y, Z_REAR + zShift(Math.abs(x), Z_REAR) - .002).sub(gHinge); };
    for(let k = 0; k <= 16; k++) ol.push(at(-GATE.t + 2 * GATE.t * k / 16, GATE.y0));
    for(let k = 1; k <= 8; k++) ol.push(at(GATE.t, GATE.y0 + (GATE.y1 - GATE.y0) * k / 8));
    for(let k = 1; k <= 16; k++) ol.push(at(GATE.t - 2 * GATE.t * k / 16, GATE.y1));
    for(let k = 1; k <= 8; k++) ol.push(at(-GATE.t, GATE.y1 - (GATE.y1 - GATE.y0) * k / 8));
    gate.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(ol), M.shut));
    const hl = [], rh = section(GATE_Z);
    for(let j = 12; j < ROWS; j++) hl.push(new THREE.Vector3(rh[j][0], rh[j][1] + .003, GATE_Z));
    for(let j = ROWS - 1; j >= 12; j--) hl.push(new THREE.Vector3(-rh[j][0], rh[j][1] + .003, GATE_Z));
    car.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(hl), M.shut));
  }
  kit.gate = gate; kit.gateMat = gpm;

  // ---- nose: closed body-colour face, light bar under the bonnet edge, perforated panels, plate, black grille ----
  {
    const fy = belt(Z_FRONT) - .075, hw = y => ringHW(ringF, y);
    const barM = new THREE.MeshStandardMaterial({map: TEX.frontBar(), roughness: .2, emissive: 0xffffff, emissiveIntensity: .45}); barM.emissiveMap = barM.map;
    car.add(faceStrip(true, -hw(fy) + .01, hw(fy) - .01, fy - .055, fy + .055, barM, .003, 20));
    const sideM = new THREE.MeshStandardMaterial({map: TEX.sideLamp(false), roughness: .2, emissive: 0xffffff, emissiveIntensity: .5}); sideM.emissiveMap = sideM.map;
    for(const s of [1, -1]) car.add(ribbon(s, ZP(975), Z_FRONT - .004, z => Math.min(belt(z) - .022, fy + .055 + (Z_FRONT - z) * .06), .10, sideM));
    const x0 = hw(.55), dotM = new THREE.MeshStandardMaterial({map: TEX.dots(), roughness: .6});
    for(const s of [1, -1]) car.add(faceStrip(true, s > 0 ? x0 * .35 : -x0 * .71, s > 0 ? x0 * .71 : -x0 * .35, .50, .605, dotM, .003, 6));
    car.add(faceStrip(true, -.25, .25, .495, .605, plateM, .005, 6));
    car.add(faceStrip(true, -x0 * .71, x0 * .71, .405, .49, new THREE.MeshStandardMaterial({map: TEX.grille(), roughness: .8}), .003, 14));
    const cam = new THREE.Mesh(new THREE.CircleGeometry(.012, 12), M.pillar); cam.position.set(0, .64, Z_FRONT + BOW_F + .004); car.add(cam);
  }

  // ---- charge flap on the right front wing ----
  { const z = ZP(852), y = YP(333), x = skinX(section(z), y);
    const f = new THREE.Mesh(new THREE.ShapeGeometry(roundRect(.15, .10, .03), 4), M.paint); f.position.set(-(x + .003), y, z); f.rotation.y = -Math.PI / 2; car.add(f);
    const o = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(roundRect(.15, .10, .03).getPoints(4)), M.shut); o.position.set(-(x + .004), y, z); o.rotation.y = -Math.PI / 2; car.add(o); }

  // ---- roof rails, roof glass panel that slides back ----
  { const z0 = ZP(245), z1 = ZP(632);
    for(const s of [1, -1]){ const y0 = top(z0) + .035, y1 = top(z1) + .035, len = Math.hypot(z1 - z0, y1 - y0);
      const r = new THREE.Mesh(rbox(.032, .028, len, .012), M.rail); r.position.set(s * .60, (y0 + y1) / 2, (z0 + z1) / 2); r.rotation.x = Math.atan2(y0 - y1, z1 - z0); r.castShadow = true; car.add(r);
      for(const z of [z0 + .04, z1 - .04]){ const f = new THREE.Mesh(rbox(.04, .05, .10, .015), M.rail); f.position.set(s * .60, top(z) + .015, z); car.add(f); } }
    const za = ZP(330), zb = ZP(615), w = .96, len = zb - za, zc = (za + zb) / 2, yc = top(zc) + .006, tilt = Math.atan2(top(za) - top(zb), len);
    const hole = new THREE.Mesh(new THREE.ShapeGeometry(roundRect(w, len, .05), 3), M.under); hole.rotation.x = -Math.PI / 2 + tilt; hole.position.set(0, yc + .001, zc); car.add(hole);
    const sun = new THREE.Group(); sun.position.set(0, yc + .006, zc); sun.rotation.x = tilt; car.add(sun);
    const pane = new THREE.Mesh(rbox(w + .02, len + .02, .012, .02), M.glass); pane.rotation.x = -Math.PI / 2; sun.add(pane);
    kit.sun = sun; kit.sunBase = sun.position.clone();
  }

  // ---- wheels, wheel wells, cabin ----
  const wheelZ = [AX_F, AX_R], WX = [1, -1, 1, -1];
  const faceMat = new THREE.MeshStandardMaterial({map: TEX.wheel(), roughness: .32, metalness: .35, envMap: envRT.texture});
  for(const z of wheelZ){ const w = new THREE.Mesh(new THREE.CylinderGeometry(ARCH_R - .01, ARCH_R - .01, 1.7, 32, 1, true, 0, Math.PI), M.well);
    w.rotation.z = Math.PI / 2; w.position.set(0, ARCH_Y, z); car.add(w); }
  car.add(makeInterior(M));
  const labelPos = [];
  for(let i = 0; i < 4; i++){
    const s = WX[i], z = wheelZ[i >> 1], w = makeWheel(M, faceMat, s);
    w.position.set(s * WHEEL_X, TYRE_R, z); car.add(w);
    labelPos.push(new THREE.Vector3(s * 1.55, .34, z));
    const ringMat = new THREE.MeshBasicMaterial({color: STATUS[''], side: THREE.DoubleSide, transparent: true, opacity: .92});
    const ring = new THREE.Mesh(new THREE.RingGeometry(RIM_R + .01, RIM_R + .05, 48), ringMat);
    ring.rotation.y = s * Math.PI / 2; ring.position.set(s * (WHEEL_X + TYRE_HW + .006), TYRE_R, z); car.add(ring);
    const plateMat = new THREE.MeshBasicMaterial({color: STATUS[''], transparent: true, opacity: .30, depthWrite: false});
    const plate = new THREE.Group(); plate.position.set(s * WHEEL_X, .016, z); plate.rotation.x = -Math.PI / 2;
    plate.add(new THREE.Mesh(new THREE.ShapeGeometry(roundRect(.42, .94, .10)), plateMat));
    const edgeMat = new THREE.LineBasicMaterial({color: STATUS[''], transparent: true, opacity: .9});
    plate.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(roundRect(.42, .94, .10).getPoints(8)), edgeMat));
    car.add(plate);
    ring.visible = plate.visible = false;
    kit.wheels.push({ringMat, ring, plate, plateMat, edgeMat, st: ''});
  }

  // ---- stage: halo disc, lane lines, soft contact shadow ----
  const haloMat = new THREE.MeshBasicMaterial({color: 0xffffff, transparent: true, opacity: P.halo, depthWrite: false});
  const halo = new THREE.Mesh(new THREE.CircleGeometry(3.0, 64), haloMat);
  halo.rotation.x = -Math.PI / 2; halo.position.y = .004; scene.add(halo);
  const haloRingMat = new THREE.MeshBasicMaterial({color: STATUS.ok, transparent: true, opacity: .75, depthWrite: false});
  const haloRing = new THREE.Mesh(new THREE.RingGeometry(2.96, 3.02, 96), haloRingMat);
  haloRing.rotation.x = -Math.PI / 2; haloRing.position.y = .006; scene.add(haloRing);
  const fadeTex = canvasTex(4, 256, x => { const g = x.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(.35, 'rgba(255,255,255,1)'); g.addColorStop(.65, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 4, 256); });
  const lineMat = new THREE.MeshBasicMaterial({color: P.line, transparent: true, opacity: P.lineA, map: fadeTex, depthWrite: false});
  [-4.2, -3.4, 3.4, 4.2].forEach((x, k) => {
    const l = new THREE.Mesh(new THREE.PlaneGeometry(k === 0 || k === 3 ? .05 : .035, 30), lineMat);
    l.rotation.x = -Math.PI / 2; l.position.set(x, .003, 0); scene.add(l);
  });
  const shTex = canvasTex(128, 128, x => { const g = x.createRadialGradient(64, 64, 4, 64, 64, 62);
    g.addColorStop(0, 'rgba(0,0,0,.80)'); g.addColorStop(.5, 'rgba(0,0,0,.34)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, 128, 128); });
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 2.7), new THREE.MeshBasicMaterial({map: shTex, transparent: true, depthWrite: false, opacity: P.shadow}));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = .008; scene.add(shadow);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), new THREE.ShadowMaterial({opacity: P.shadow * .55}));
  floor.rotation.x = -Math.PI / 2; floor.position.y = .01; floor.receiveShadow = true; scene.add(floor);

  if(/c3bare/.test(location.search)){ host.style.background = '#fff'; [halo, haloRing, shadow, floor].forEach(o => o.visible = false); scene.children.forEach(o => { if(o.material === lineMat) o.visible = false; }); }

  // ---- DOM overlays: wheel labels and lock badge ----
  const labels = [];
  if(opts.labels) for(let i = 0; i < 4; i++){
    const d = document.createElement('div'); d.className = 'c3l';
    d.innerHTML = '<b>' + opts.labels[i] + '</b><span></span>';
    host.appendChild(d); labels.push(d);
  }
  const lockEl = document.createElement('div'); lockEl.className = 'c3lock'; host.appendChild(lockEl);

  // ---- camera, drag-to-turn, idle sway ----
  const dbgFov = /c3fov=([\d.]+)/.exec(location.search);
  const camera = new THREE.PerspectiveCamera(dbgFov ? +dbgFov[1] : 28, 1, .1, 200);
  const reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const tyres = opts.view === 'tyres';
  const q = location.search;
  const dbgPitch = /c3pitch=(-?[\d.]+)/.exec(q), dbgDist = /c3dist=([\d.]+)/.exec(q), dbgAt = /c3at=(-?[\d.]+),(-?[\d.]+),(-?[\d.]+)/.exec(q);
  const pitch = dbgPitch ? +dbgPitch[1] : tyres ? .95 : .42, dist = dbgDist ? +dbgDist[1] : tyres ? 11.6 : 10.2, yaw0 = tyres ? .55 : .62;
  const dbgYaw = /c3yaw=(-?[\d.]+)/.exec(q), dbgOpen = /c3open=([\d,]*)/.exec(q);
  let yaw = dbgYaw ? +dbgYaw[1] : yaw0, vel = 0, touched = !!dbgYaw, down = false, lastX = 0, sway = 0;
  cv.addEventListener('pointerdown', e => { down = true; touched = true; lastX = e.clientX; vel = 0; try{ cv.setPointerCapture(e.pointerId); }catch(_){} });
  cv.addEventListener('pointermove', e => { if(!down) return; const dx = e.clientX - lastX; lastX = e.clientX; yaw -= dx * .011; vel = -dx * .011; });
  const up = () => { down = false; };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);

  function resize(){
    const w = host.clientWidth || 360, h = host.clientHeight || Math.round(w * .8);
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize); ro.observe(host); resize();

  const tmp = new THREE.Vector3(), RED = new THREE.Color(.30, .03, .02);
  const gateS = {cur: 0, to: 0}, sunS = {cur: 0, to: 0};
  let visible = true, alive = true, last = performance.now(), raf = 0, first = true;
  const io = new IntersectionObserver(es => { visible = es[0].isIntersecting; }, {threshold: 0});
  io.observe(host);
  const tint = (m, k) => m.emissive.copy(RED).multiplyScalar(k);              // an open panel glows faintly red

  const dbg = !!(dbgYaw || dbgOpen);                                            // debug URLs keep rendering in a background tab
  const next = () => dbg ? setTimeout(() => frame(performance.now()), 100) : requestAnimationFrame(frame);
  function frame(now){
    raf = next();
    if(!alive || !visible || (document.hidden && !dbg)){ last = now; return; }
    const dt = Math.min(.05, (now - last) / 1000); last = now;
    if(!touched && !reduced){ sway += dt; yaw = yaw0 + Math.sin(sway * .55) * .62; }
    else if(!down){ yaw += vel; vel *= .93; }
    camera.position.set(Math.sin(yaw) * Math.cos(pitch) * dist, Math.sin(pitch) * dist + .5, Math.cos(yaw) * Math.cos(pitch) * dist);
    if(dbgAt){ camera.position.x += +dbgAt[1]; camera.position.y += +dbgAt[2] - .78; camera.position.z += +dbgAt[3]; camera.lookAt(+dbgAt[1], +dbgAt[2], +dbgAt[3]); }
    else camera.lookAt(0, .78, -.1);

    const k = reduced ? 1 : 1 - Math.pow(.0009, dt);
    kit.doors.forEach(d => { d.cur += (d.to - d.cur) * k; d.grp.rotation.y = d.cur * d.max; tint(d.mat, Math.min(1, d.cur)); });
    gateS.cur += (gateS.to - gateS.cur) * k; kit.gate.rotation.x = gateS.cur * 1.25; tint(kit.gateMat, Math.min(1, gateS.cur));
    sunS.cur += (sunS.to - sunS.cur) * k; kit.sun.position.z = kit.sunBase.z - sunS.cur * .48; kit.sun.position.y = kit.sunBase.y + sunS.cur * .03;

    if(!reduced) kit.wheels.forEach(w => { w.plateMat.opacity = w.st === 'bad' ? .26 + .16 * Math.sin(now * .004) : .30; });
    renderer.render(scene, camera);
    if(labels.length){
      const w = host.clientWidth, h = host.clientHeight;
      labelPos.forEach((p, i) => {
        tmp.copy(p).project(camera);
        labels[i].style.transform = 'translate(' + ((tmp.x * .5 + .5) * w).toFixed(1) + 'px,' + ((-tmp.y * .5 + .5) * h).toFixed(1) + 'px) translate(-50%,-50%)';
        labels[i].style.opacity = tyres || WX[i] * camera.position.x > .6 ? 1 : 0;
      });
    }
    if(first){ first = false; host.classList.add('ready'); }
  }
  raf = next();

  function apply(s){
    s = s || {};
    (s.doors || []).forEach((o, i) => { if(kit.doors[i]) kit.doors[i].to = o ? 1 : 0; });
    gateS.to = s.trunk ? 1 : 0;
    sunS.to = s.sunroof ? 1 : 0;
    if(dbgOpen){ const o = dbgOpen[1].split(',').map(Number);
      kit.doors.forEach((d, i) => { if(o.includes(i)) d.to = 1; });
      if(o.includes(4)) gateS.to = 1; if(o.includes(5)) sunS.to = 1; }
    kit.wheels.forEach(w => { w.ring.visible = w.plate.visible = !!s.wheels; });
    if(s.wheels) for(let i = 0; i < 4; i++){ const w = kit.wheels[i];
      w.st = s.wheels[i] != null ? s.wheels[i] : ''; const hex = STATUS[w.st] || STATUS[''];
      w.ringMat.color.setHex(hex); w.plateMat.color.setHex(hex); w.edgeMat.color.setHex(hex); }
    const anyOpen = (s.doors || []).some(Boolean) || s.trunk || s.sunroof;
    haloRingMat.color.setHex(anyOpen ? STATUS.bad : s.unlocked ? STATUS.warn : STATUS.ok);
    labels.forEach((el, i) => {
      const v = s.values && s.values[i]; el.lastChild.textContent = v || '';
      const c = s.wheels && s.wheels[i]; el.className = 'c3l' + (c ? ' ' + c : '');
    });
    lockEl.className = 'c3lock' + (s.unlocked ? ' un' : '');
    lockEl.innerHTML = (opts.lockIcon || '') + '<span>' + (s.unlocked ? 'Unlocked' : 'Locked') + '</span>';
    lockEl.hidden = s.unlocked == null;
  }
  apply(null);

  return {
    set(s){ apply(s); },
    setPaint(c){ const col = paintOf(c); paintMats.forEach(m => m.color.copy(col)); },
    dispose(){
      alive = false; cancelAnimationFrame(raf); clearTimeout(raf); ro.disconnect(); io.disconnect();
      scene.traverse(o => { if(o.geometry) o.geometry.dispose();
        if(o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { if(!m) return; if(m.map) m.map.dispose(); m.dispose(); }); });
      envRT.dispose(); renderer.dispose(); renderer.forceContextLoss();
      cv.remove(); labels.forEach(l => l.remove()); lockEl.remove();
    }
  };
}
