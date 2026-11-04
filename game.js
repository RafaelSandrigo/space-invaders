'use strict';
/*
 * NEBULA SIEGE — shooter fixo no estilo dos arcades de 1978.
 * Mecânica fiel ao clássico do gênero:
 *  - formação 11 x 5, um alienígena se move por frame (a marcha acelera
 *    naturalmente conforme a formação diminui)
 *  - ao tocar a borda, a formação desce 8 px e inverte
 *  - um tiro do jogador por vez; até 3 tiros inimigos (3 tipos, um mirado)
 *  - 4 escudos destrutíveis pixel a pixel, chão que também é danificado
 *  - nave misteriosa a cada ~25 s, pontuação ligada à contagem de tiros
 *  - 10/20/30 pontos por fileira, vida extra aos 1500, ondas começam mais baixas
 *  - se a formação chega à linha do jogador, é fim de jogo
 */
(() => {
  // ---------------------------------------------------------------- config
  const W = 224, H = 256;
  const GROUND_Y = 238;
  const PLAYER_Y = 220;
  const BUNKER_Y = 192;
  const UFO_Y = 34;
  const BASE_TOP = 64;
  const COLS = 11, ROWS = 5, CELL = 16;
  const DROP = 8;
  const PLAYER_SPEED = 1;
  const PSHOT_SPEED = 4;
  const WAVE_OFFSETS = [0, 16, 24, 32, 32, 32, 40, 40, 40];
  const UFO_INTERVAL = 1536;
  const UFO_TABLE = [100, 50, 50, 100, 150, 100, 100, 50, 300, 100, 100, 100, 50, 150, 100];
  const PLUNGER_COLS = [1, 7, 1, 1, 1, 4, 11, 1, 6, 3, 1, 1, 11, 9, 2, 8];
  const SQUIGGLY_COLS = [11, 1, 6, 3, 1, 1, 11, 9, 2, 8, 2, 11, 4, 7, 10];
  const ROW_TYPE = [0, 1, 1, 2, 2];
  const STEP = 1 / 60;
  const MAXP = 5000;
  const FONT = '"Press Start 2P", ui-monospace, monospace';
  const HI_KEY = 'nebulaSiege.hi';

  // ---------------------------------------------------------------- canvas
  const canvas = document.getElementById('screen');
  const glow = document.getElementById('glow');
  const wrap = document.getElementById('screen-wrap');
  const ctx = canvas.getContext('2d');
  const gctx = glow.getContext('2d');
  canvas.width = glow.width = W;
  canvas.height = glow.height = H;
  ctx.imageSmoothingEnabled = false;
  gctx.imageSmoothingEnabled = false;

  // ---------------------------------------------------------------- utils
  const rand = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
  const randInt = n => (Math.random() * n) | 0;
  const pick = arr => arr[randInt(arr.length)];
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const hex = c => { const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const mix = (c1, c2, t) => {
    const a = hex(c1), b = hex(c2);
    return '#' + [0, 1, 2].map(i => Math.round(a[i] + (b[i] - a[i]) * t).toString(16).padStart(2, '0')).join('');
  };
  const palFrom = c => ['#ffffff', mix(c, '#ffffff', 0.55), c, c, mix(c, '#000000', 0.35), mix(c, '#000000', 0.65)];

  // ---------------------------------------------------------------- paletas
  const FIRE = ['#ffffff', '#fff3a0', '#ffd23f', '#ff9a1f', '#ff5a1f', '#d12a2a', '#6b1430'];
  const CYAN = ['#ffffff', '#bff7ff', '#4fe8ff', '#1fa8ff', '#2a5cd1', '#1a2a6b'];
  const ENGINE = ['#ffffff', '#bff7ff', '#4fe8ff', '#7a5cff', '#3a1a8a'];
  const DEBRIS = ['#fff0c8', '#ffb84a', '#ffb84a', '#d47a1f', '#7a3a10'];
  const GROUND_PAL = ['#e8ffd0', '#7dff6a', '#2ec24a', '#145a30'];
  const UFO_COLOR = '#ff3a5a';
  const UFO_PAL = palFrom(UFO_COLOR);
  const SHOT_COLORS = ['#ff5a5a', '#ffd23f', '#ff8a3a'];
  const SHOT_PALS = SHOT_COLORS.map(palFrom);

  // ---------------------------------------------------------------- sprites (designs originais)
  const sprite = rows => ({ w: rows[0].length, h: rows.length, px: rows.map(r => [...r].map(ch => ch !== '.')) });

  const SPR = {
    A: [sprite([
      '..#####..',
      '.#######.',
      '##.###.##',
      '###.#.###',
      '.#######.',
      '..#.#.#..',
      '.#.....#.',
      '#.......#',
    ]), sprite([
      '..#####..',
      '.#######.',
      '###.#.###',
      '##.###.##',
      '.#######.',
      '..#.#.#..',
      '..#...#..',
      '.#.....#.',
    ])],
    B: [sprite([
      '.....#.....',
      '....###....',
      '#..#####..#',
      '##.##.##.##',
      '###########',
      '.#########.',
      '..#..#..#..',
      '.#...#...#.',
    ]), sprite([
      '.....#.....',
      '....###....',
      '...#####...',
      '##.##.##.##',
      '###########',
      '#.#######.#',
      '#..#.#.#..#',
      '...#...#...',
    ])],
    C: [sprite([
      '.....##.....',
      '...######...',
      '.##########.',
      '#.#.####.#.#',
      '############',
      '.#.#....#.#.',
      '#..........#',
      '.#........#.',
    ]), sprite([
      '.....##.....',
      '...######...',
      '.##########.',
      '.#.######.#.',
      '############',
      '.#.#....#.#.',
      '.#........#.',
      '#..........#',
    ])],
    PLAYER: sprite([
      '......#......',
      '.....###.....',
      '.....#.#.....',
      '..#.#####.#..',
      '.###########.',
      '#############',
      '##.##...##.##',
      '#...........#',
    ]),
    UFO: sprite([
      '.....######.....',
      '...##########...',
      '..############..',
      '.##.##.##.##.##.',
      '################',
      '..###..##..###..',
      '...#........#...',
    ]),
  };

  // desenha o sprite com sombreamento automático (luz em cima, sombra embaixo)
  function renderSprite(spr, color) {
    const c = document.createElement('canvas');
    c.width = spr.w; c.height = spr.h;
    const g = c.getContext('2d');
    const light = mix(color, '#ffffff', 0.55), dark = mix(color, '#000000', 0.4);
    for (let y = 0; y < spr.h; y++) for (let x = 0; x < spr.w; x++) {
      if (!spr.px[y][x]) continue;
      const up = y > 0 && spr.px[y - 1][x];
      const down = y < spr.h - 1 && spr.px[y + 1][x];
      g.fillStyle = !up ? light : !down ? dark : color;
      g.fillRect(x, y, 1, 1);
    }
    return c;
  }

  const TYPES = [
    { spr: SPR.A, color: '#ff4fd8', pts: 30 },
    { spr: SPR.B, color: '#4fe8ff', pts: 20 },
    { spr: SPR.C, color: '#7dff6a', pts: 10 },
  ].map(t => ({
    ...t,
    w: t.spr[0].w,
    off: (CELL - t.spr[0].w) >> 1,
    canv: t.spr.map(s => renderSprite(s, t.color)),
    pal: palFrom(t.color),
  }));
  const PLAYER_COLOR = '#4fe8ff';
  const playerCanv = renderSprite(SPR.PLAYER, PLAYER_COLOR);
  const ufoCanv = renderSprite(SPR.UFO, UFO_COLOR);

  // ---------------------------------------------------------------- fundo: nebulosa com dithering
  function makeNebula() {
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    const img = g.createImageData(W, H);
    const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
    const cols = [[5, 4, 12], [11, 7, 26], [18, 10, 42], [28, 13, 60]];
    const blobs = [[165, 175, 85, 1], [45, 95, 60, 0.8], [120, 30, 55, 0.45], [30, 230, 50, 0.5]];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let v = 0;
      for (const [bx, by, br, bs] of blobs) {
        const dx = x - bx, dy = y - by;
        v += bs * Math.exp(-(dx * dx + dy * dy) / (br * br));
      }
      v += 0.14 * Math.sin(x * 0.07 + Math.sin(y * 0.05) * 2) * Math.cos(y * 0.04 + x * 0.01);
      const lvl = clamp(Math.floor(clamp(v, 0, 1) * 2.6 + bayer[(y & 3) * 4 + (x & 3)] / 16), 0, 3);
      const i = (y * W + x) * 4, col = cols[lvl];
      img.data[i] = col[0]; img.data[i + 1] = col[1]; img.data[i + 2] = col[2]; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return c;
  }
  const nebula = makeNebula();

  const stars = Array.from({ length: 90 }, () => ({
    x: rand(W), y: rand(H), z: pick([0.04, 0.1, 0.22]), tw: randInt(400),
    c: pick(['#ffffff', '#bff7ff', '#ffd8f6', '#fff3a0']),
  }));

  // ---------------------------------------------------------------- áudio (sintetizado)
  const Sfx = (() => {
    let ac = null, master = null, noiseBuf = null, muted = false, ufoNode = null;
    function init() {
      if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
      try {
        ac = new (window.AudioContext || window.webkitAudioContext)();
        master = ac.createGain(); master.gain.value = 0.3; master.connect(ac.destination);
        noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
        const d = noiseBuf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      } catch (e) { ac = null; }
    }
    const ok = () => ac && !muted;
    function tone(f, dur, type = 'square', vol = 0.2, f2 = null, delay = 0) {
      if (!ok()) return;
      const t = ac.currentTime + delay;
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f, t);
      if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g).connect(master);
      o.start(t); o.stop(t + dur + 0.02);
    }
    function noise(dur, vol = 0.3, freq = 2000, freq2 = null) {
      if (!ok()) return;
      const t = ac.currentTime;
      const s = ac.createBufferSource(); s.buffer = noiseBuf;
      const f = ac.createBiquadFilter(); f.type = 'lowpass';
      f.frequency.setValueAtTime(freq, t);
      if (freq2) f.frequency.exponentialRampToValueAtTime(freq2, t + dur);
      const g = ac.createGain();
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      s.connect(f).connect(g).connect(master);
      s.start(t); s.stop(t + dur + 0.02);
    }
    const MARCH = [110, 82.4, 98, 73.4];
    return {
      init,
      get muted() { return muted; },
      toggle() { muted = !muted; if (muted) this.ufoStop(); return muted; },
      shoot() { tone(1400, 0.12, 'square', 0.08, 220); },
      alienDie() { noise(0.25, 0.35, 2400, 300); tone(520, 0.12, 'square', 0.06, 80); },
      playerDie() { noise(1.1, 0.55, 1400, 60); tone(180, 0.9, 'sawtooth', 0.12, 30); },
      shotClash() { tone(2200, 0.06, 'square', 0.05, 900); },
      bunkerHit() { noise(0.08, 0.15, 900); },
      march(i) { tone(MARCH[i & 3], 0.1, 'triangle', 0.55); },
      ufoStart() {
        if (!ok() || ufoNode) return;
        const o = ac.createOscillator(); o.type = 'square'; o.frequency.value = 560;
        const lfo = ac.createOscillator(); lfo.frequency.value = 7;
        const lg = ac.createGain(); lg.gain.value = 140;
        lfo.connect(lg).connect(o.frequency);
        const g = ac.createGain(); g.gain.value = 0.035;
        o.connect(g).connect(master);
        o.start(); lfo.start();
        ufoNode = { o, lfo };
      },
      ufoStop() {
        if (!ufoNode) return;
        try { ufoNode.o.stop(); ufoNode.lfo.stop(); } catch (e) { /* já parado */ }
        ufoNode = null;
      },
      ufoHit() { noise(0.5, 0.4, 3000, 200); [880, 1100, 1320, 1760].forEach((f, i) => tone(f, 0.1, 'square', 0.07, null, i * 0.07)); },
      extra() { [660, 880, 1100, 1320, 1760].forEach((f, i) => tone(f, 0.12, 'square', 0.07, null, i * 0.08)); },
      waveClear() { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.18, 'triangle', 0.25, null, i * 0.12)); },
      start() { [220, 330, 440, 660].forEach((f, i) => tone(f, 0.1, 'square', 0.07, null, i * 0.06)); },
    };
  })();

  // ---------------------------------------------------------------- partículas
  const parts = [];
  function P(x, y, vx, vy, life, pal, o = {}) {
    if (parts.length >= MAXP) return;
    parts.push({
      x, y, vx, vy, life, max: life, pal,
      size: o.size || 1, g: o.g || 0, drag: o.drag ?? 0.98,
      add: o.add ?? true, bounce: !!o.bounce,
    });
  }
  function burst(x, y, n, pal, spd, life, o) {
    for (let i = 0; i < n; i++) {
      const a = rand(Math.PI * 2), s = rand(spd);
      P(x, y, Math.cos(a) * s, Math.sin(a) * s, life * rand(0.5, 1), pal, o);
    }
  }
  function ring(x, y, n, spd, pal, life, o) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      P(x, y, Math.cos(a) * spd, Math.sin(a) * spd, life, pal, o);
    }
  }
  // cada pixel do sprite vira uma partícula
  function shatter(spr, sx, sy, pal, force, o = {}) {
    const cx = sx + spr.w / 2, cy = sy + spr.h / 2;
    for (let y = 0; y < spr.h; y++) for (let x = 0; x < spr.w; x++) {
      if (!spr.px[y][x]) continue;
      const dx = sx + x - cx, dy = sy + y - cy;
      P(sx + x, sy + y,
        dx * force * 0.12 + rand(-0.5, 0.5) * force,
        dy * force * 0.12 + rand(-0.5, 0.5) * force - 0.3,
        rand(30, 60), pal, { g: 0.02, drag: 0.96, ...o });
    }
  }
  // onda de choque: empurra as partículas existentes radialmente
  function shockwave(x, y, r, f) {
    const r2 = r * r;
    for (const p of parts) {
      const dx = p.x - x, dy = p.y - y, d2 = dx * dx + dy * dy;
      if (d2 > r2 || d2 < 0.01) continue;
      const d = Math.sqrt(d2), k = (1 - d / r) * f;
      p.vx += (dx / d) * k; p.vy += (dy / d) * k;
    }
    for (const t of titleParts) {
      const dx = t.x - x, dy = t.y - y, d2 = dx * dx + dy * dy;
      if (d2 > r2 || d2 < 0.01) continue;
      const d = Math.sqrt(d2), k = (1 - d / r) * f;
      t.vx += (dx / d) * k; t.vy += (dy / d) * k;
    }
  }
  function updateParticles() {
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      if (--p.life <= 0 || p.x < -6 || p.x > W + 6 || p.y > H + 6 || p.y < -30) {
        parts[i] = parts[parts.length - 1]; parts.pop(); continue;
      }
      p.vx *= p.drag;
      p.vy = p.vy * p.drag + p.g;
      p.x += p.vx; p.y += p.vy;
      if (p.bounce && p.y >= GROUND_Y - 1 && p.vy > 0) {
        p.y = GROUND_Y - 1; p.vy *= -0.35; p.vx *= 0.6;
      }
    }
  }
  function drawParticles() {
    for (let pass = 0; pass < 2; pass++) {
      const add = pass === 1;
      ctx.globalCompositeOperation = add ? 'lighter' : 'source-over';
      for (const p of parts) {
        if (p.add !== add) continue;
        const idx = Math.min(p.pal.length - 1, ((1 - p.life / p.max) * p.pal.length) | 0);
        ctx.fillStyle = p.pal[idx];
        ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  // ---------------------------------------------------------------- estado
  let state = 'title'; // title | playing | dying | waveclear | gameover
  let paused = false;
  let frame = 0, stateTimer = 0;
  let score = 0, hi = loadHi(), lives = 3, wave = 1, extraGiven = false, shotsFired = 0;
  let aliens = [], grid = [], aliveCount = 0;
  let fm = { dx: 1, dropping: false, cursor: 0 };
  let marchNote = 0;
  let alienShots = [], pshot = null;
  let bunkers = [], ground = new Uint8Array(W);
  let ufo = null, ufoTimer = UFO_INTERVAL;
  let fireTimer = 0, nextShotType = 0, plIdx = 0, sqIdx = 0;
  let alienFreeze = 0, hitPause = 0;
  let player = { x: W / 2 - 6, alive: true, cooldown: 0, dir: 0 };
  let popups = [];
  let shake = 0, flash = 0;
  let titleParts = [];

  function loadHi() { try { return parseInt(localStorage.getItem(HI_KEY), 10) || 0; } catch (e) { return 0; } }
  function saveHi() { try { localStorage.setItem(HI_KEY, String(hi)); } catch (e) { /* sem storage */ } }

  // ---------------------------------------------------------------- escudos
  const BW = 22, BH = 16;
  function bunkerShape(x, y) {
    if (x + y < 5 || (BW - 1 - x) + y < 5) return 0;            // cantos chanfrados
    if (y < 2 && (x === 7 || x === 8 || x === 13 || x === 14)) return 0; // ameias
    const depth = y - (BH - 7);
    if (depth >= 0 && Math.abs(x - (BW - 1) / 2) < depth * 0.9 + 1.5) return 0; // arco em V
    return 1;
  }
  function makeBunkers() {
    bunkers = [];
    for (let i = 0; i < 4; i++) {
      const mask = new Uint8Array(BW * BH);
      for (let y = 0; y < BH; y++) for (let x = 0; x < BW; x++) mask[y * BW + x] = bunkerShape(x, y);
      const c = document.createElement('canvas'); c.width = BW; c.height = BH;
      bunkers.push({ x: Math.round((W * (i + 1)) / 5 - BW / 2), y: BUNKER_Y, mask, canv: c, dirty: true });
    }
  }
  const BUNK_COL = '#ffb84a', BUNK_LIGHT = mix(BUNK_COL, '#ffffff', 0.5), BUNK_DARK = mix(BUNK_COL, '#000000', 0.45);
  function renderBunker(b) {
    const g = b.canv.getContext('2d');
    g.clearRect(0, 0, BW, BH);
    for (let y = 0; y < BH; y++) for (let x = 0; x < BW; x++) {
      if (!b.mask[y * BW + x]) continue;
      const up = y > 0 && b.mask[(y - 1) * BW + x];
      const down = y < BH - 1 && b.mask[(y + 1) * BW + x];
      g.fillStyle = !up ? BUNK_LIGHT : !down ? BUNK_DARK : BUNK_COL;
      g.fillRect(x, y, 1, 1);
    }
    b.dirty = false;
  }
  // retorna o primeiro pixel sólido de escudo dentro do retângulo
  function bunkerHit(rx, ry, rw, rh, fromBottom) {
    rx = Math.floor(rx); ry = Math.floor(ry);
    for (const b of bunkers) {
      if (rx + rw <= b.x || rx >= b.x + BW || ry + rh <= b.y || ry >= b.y + BH) continue;
      for (let k = 0; k < rh; k++) {
        const yy = fromBottom ? ry + rh - 1 - k : ry + k;
        const ly = yy - b.y;
        if (ly < 0 || ly >= BH) continue;
        for (let xx = rx; xx < rx + rw; xx++) {
          const lx = xx - b.x;
          if (lx >= 0 && lx < BW && b.mask[ly * BW + lx]) return { b, x: xx, y: yy };
        }
      }
    }
    return null;
  }
  function erode(b, cx, cy, r, dirY) {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const d = Math.hypot(dx, dy);
      if (d > r || Math.random() > 1 - (d / r) * 0.55) continue;
      const lx = cx + dx - b.x, ly = cy + dy - b.y;
      if (lx < 0 || lx >= BW || ly < 0 || ly >= BH || !b.mask[ly * BW + lx]) continue;
      b.mask[ly * BW + lx] = 0;
      if (Math.random() < 0.8) {
        P(cx + dx, cy + dy, rand(-0.8, 0.8), dirY * rand(0.2, 1.4), rand(40, 90), DEBRIS,
          { g: 0.05, drag: 0.98, add: false, bounce: true });
      }
    }
    b.dirty = true;
    burst(cx, cy, 6, FIRE, 1.2, 14, { drag: 0.9 });
    Sfx.bunkerHit();
  }
  function clearBunkerRect(rx, ry, rw, rh) {
    for (const b of bunkers) {
      if (rx + rw <= b.x || rx >= b.x + BW || ry + rh <= b.y || ry >= b.y + BH) continue;
      for (let y = ry; y < ry + rh; y++) for (let x = rx; x < rx + rw; x++) {
        const lx = x - b.x, ly = y - b.y;
        if (lx < 0 || lx >= BW || ly < 0 || ly >= BH || !b.mask[ly * BW + lx]) continue;
        b.mask[ly * BW + lx] = 0; b.dirty = true;
        if (Math.random() < 0.3) P(x, y, rand(-0.5, 0.5), rand(0, 0.8), rand(30, 60), DEBRIS, { g: 0.05, add: false, bounce: true });
      }
    }
  }

  // ---------------------------------------------------------------- colisão pixel a pixel
  function rectSpriteHit(spr, sx, sy, rx, ry, rw, rh) {
    sx = Math.round(sx); sy = Math.round(sy); rx = Math.floor(rx); ry = Math.floor(ry);
    const x0 = Math.max(rx, sx), x1 = Math.min(rx + rw, sx + spr.w);
    const y0 = Math.max(ry, sy), y1 = Math.min(ry + rh, sy + spr.h);
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (spr.px[y - sy][x - sx]) return true;
    return false;
  }

  // ---------------------------------------------------------------- ondas
  function setupWave() {
    const off = wave === 1 ? 0 : WAVE_OFFSETS[1 + ((wave - 2) % (WAVE_OFFSETS.length - 1))];
    aliens = []; grid = [];
    for (let r = 0; r < ROWS; r++) {
      grid[r] = [];
      for (let c = 0; c < COLS; c++) {
        grid[r][c] = { r, c, type: ROW_TYPE[r], x: 24 + c * CELL, y: BASE_TOP + off + r * CELL, frame: 0, alive: true };
      }
    }
    // ordem de movimento original: de baixo para cima, da esquerda para a direita
    for (let r = ROWS - 1; r >= 0; r--) for (let c = 0; c < COLS; c++) aliens.push(grid[r][c]);
    aliveCount = aliens.length;
    fm = { dx: 1, dropping: false, cursor: 0 };
    makeBunkers();
    ground.fill(1);
    alienShots = []; pshot = null;
    if (ufo) Sfx.ufoStop();
    ufo = null; ufoTimer = UFO_INTERVAL;
    fireTimer = 90; nextShotType = 0; plIdx = 0; sqIdx = 0;
    alienFreeze = 70; hitPause = 0; marchNote = 0;
    // materialização da formação
    for (const a of aliens) {
      const t = TYPES[a.type];
      for (let i = 0; i < 5; i++) {
        const ang = rand(Math.PI * 2), d = rand(10, 22);
        const px = a.x + 8 + Math.cos(ang) * d, py = a.y + 4 + Math.sin(ang) * d;
        P(px, py, (a.x + 8 - px) / 22, (a.y + 4 - py) / 22, 22, t.pal, { drag: 1 });
      }
    }
  }

  function startGame() {
    Sfx.start();
    for (const t of titleParts) P(t.x, t.y, t.vx + rand(-2, 2), t.vy + rand(-2.5, 1), rand(30, 70), palFrom(t.c), { g: 0.03, drag: 0.97 });
    titleParts = [];
    score = 0; lives = 3; wave = 1; extraGiven = false; shotsFired = 0;
    player = { x: W / 2 - 6, alive: true, cooldown: 20, dir: 0 };
    popups = [];
    setupWave();
    state = 'playing'; paused = false;
  }

  function addScore(n) {
    score += n;
    if (score > hi) hi = score;
    if (!extraGiven && score >= 1500) {
      extraGiven = true; lives++;
      Sfx.extra();
      popups.push({ x: W / 2, y: GROUND_Y - 30, text: 'VIDA EXTRA', color: '#7dff6a', t: 120 });
    }
  }

  // ---------------------------------------------------------------- formação
  function endSweep() {
    Sfx.march(marchNote++);
    if (fm.dropping) { fm.dropping = false; return; }
    let minX = 1e9, maxX = -1e9;
    for (const a of aliens) {
      if (!a.alive) continue;
      const t = TYPES[a.type];
      minX = Math.min(minX, a.x + t.off); maxX = Math.max(maxX, a.x + t.off + t.w);
    }
    const step = aliveCount === 1 ? 3 : 2;
    if ((fm.dx > 0 && maxX + step > W - 8) || (fm.dx < 0 && minX - step < 8)) {
      fm.dropping = true; fm.dx = -fm.dx;
    }
  }

  function stepFormation() {
    if (aliveCount === 0) return;
    let i = fm.cursor;
    while (i < aliens.length && !aliens[i].alive) i++;
    if (i >= aliens.length) { endSweep(); i = 0; while (!aliens[i].alive) i++; }
    const a = aliens[i], t = TYPES[a.type];
    if (fm.dropping) a.y += DROP;
    else a.x += fm.dx * (aliveCount === 1 ? 3 : 2);
    a.frame ^= 1;
    fm.cursor = i + 1;
    let j = fm.cursor;
    while (j < aliens.length && !aliens[j].alive) j++;
    if (j >= aliens.length) { fm.cursor = 0; endSweep(); }

    clearBunkerRect(a.x + t.off, a.y, t.w, 8);
    if (a.y + 8 >= PLAYER_Y) killPlayer(true); // invasão
  }

  function killAlien(a) {
    const t = TYPES[a.type];
    a.alive = false; aliveCount--;
    addScore(t.pts);
    hitPause = 14;
    const sx = a.x + t.off, sy = a.y;
    shatter(t.spr[a.frame], sx, sy, t.pal, 1.6);
    burst(sx + t.w / 2, sy + 4, 14, FIRE, 2.2, 20, { drag: 0.9 });
    ring(sx + t.w / 2, sy + 4, 16, 1.6, t.pal, 14, { drag: 0.93 });
    shockwave(sx + t.w / 2, sy + 4, 26, 1.4);
    shake = Math.max(shake, 1.2);
    Sfx.alienDie();
  }

  function bottomAlien(c) {
    for (let r = ROWS - 1; r >= 0; r--) if (grid[r][c].alive) return grid[r][c];
    return null;
  }

  function reloadRate() {
    if (score < 200) return 48;
    if (score < 1000) return 24;
    if (score < 2000) return 18;
    if (score < 3000) return 14;
    return 11;
  }

  function alienFire() {
    if (fireTimer > 0) { fireTimer--; return; }
    const t = nextShotType;
    nextShotType = (nextShotType + 1) % 3;
    if (alienShots.some(s => s.type === t)) return; // cada tipo existe uma vez
    if (t === 1 && aliveCount === 1) return;        // "pistão" não atira com 1 restante
    if (t === 2 && ufo) return;                     // "zigue-zague" desliga com a nave misteriosa
    let shooter = null;
    if (t === 0) {
      // tiro mirado: coluna acima do jogador
      const pc = player.x + 6;
      let best = 1e9;
      for (let c = 0; c < COLS; c++) {
        const a = bottomAlien(c);
        if (!a) continue;
        const d = Math.abs(a.x + 8 - pc);
        if (d < best) { best = d; shooter = a; }
      }
      if (best > 12) shooter = null;
    } else {
      const table = t === 1 ? PLUNGER_COLS : SQUIGGLY_COLS;
      for (let k = 0; k < table.length && !shooter; k++) {
        let idx;
        if (t === 1) { idx = plIdx; plIdx = (plIdx + 1) % table.length; }
        else { idx = sqIdx; sqIdx = (sqIdx + 1) % table.length; }
        shooter = bottomAlien(table[idx] - 1);
      }
    }
    fireTimer = reloadRate();
    if (!shooter) return;
    alienShots.push({ x: shooter.x + 8, y: shooter.y + 8, type: t, anim: 0 });
    burst(shooter.x + 8, shooter.y + 9, 4, SHOT_PALS[t], 0.8, 10);
  }

  // ---------------------------------------------------------------- tiros
  function firePlayer() {
    pshot = { x: Math.round(player.x) + 6, y: PLAYER_Y - 4 };
    shotsFired++;
    Sfx.shoot();
    burst(pshot.x, PLAYER_Y - 1, 6, CYAN, 1, 10, { drag: 0.85 });
  }

  function updatePlayerShot() {
    if (!pshot) return;
    for (let s = 0; s < 2; s++) {
      pshot.y -= PSHOT_SPEED / 2;
      P(pshot.x + rand(-0.4, 0.4), pshot.y + 4, rand(-0.12, 0.12), rand(0.2, 0.6), rand(8, 16), CYAN, { drag: 0.92 });

      if (pshot.y < 22) { // explode no topo
        burst(pshot.x, 22, 10, CYAN, 1.2, 16, { drag: 0.9 });
        pshot = null; return;
      }
      for (const a of aliens) {
        if (!a.alive) continue;
        const t = TYPES[a.type];
        if (rectSpriteHit(t.spr[a.frame], a.x + t.off, a.y, pshot.x, pshot.y, 1, 4)) {
          killAlien(a); pshot = null; return;
        }
      }
      if (ufo && !ufo.dead && rectSpriteHit(SPR.UFO, ufo.x, UFO_Y, pshot.x, pshot.y, 1, 4)) {
        killUfo(); pshot = null; return;
      }
      for (let i = 0; i < alienShots.length; i++) {
        const as = alienShots[i];
        if (pshot.x >= as.x - 1 && pshot.x <= as.x + 1 && pshot.y < as.y + 7 && pshot.y + 4 > as.y) {
          alienShots.splice(i, 1);
          burst(pshot.x, pshot.y, 18, FIRE, 1.8, 18, { drag: 0.9 });
          ring(pshot.x, pshot.y, 10, 1.2, CYAN, 12, { drag: 0.92 });
          Sfx.shotClash();
          pshot = null; return;
        }
      }
      const h = bunkerHit(pshot.x, pshot.y, 1, 4, false);
      if (h) { erode(h.b, h.x, h.y, 2, -1); pshot = null; return; }
    }
  }

  function updateAlienShots() {
    const speed = aliveCount <= 8 ? 5 / 3 : 4 / 3;
    for (let i = alienShots.length - 1; i >= 0; i--) {
      const s = alienShots[i];
      s.y += speed; s.anim++;
      if (s.anim % 2 === 0) P(s.x + rand(-0.5, 0.5), s.y, rand(-0.15, 0.15), rand(-0.3, 0), rand(8, 14), SHOT_PALS[s.type], { drag: 0.9 });

      const h = bunkerHit(s.x - 1, s.y, 3, 7, true);
      if (h) { erode(h.b, h.x, h.y + 1, 3, 1); alienShots.splice(i, 1); continue; }

      if (player.alive && rectSpriteHit(SPR.PLAYER, player.x, PLAYER_Y, s.x - 1, s.y, 3, 7)) {
        alienShots.splice(i, 1);
        killPlayer(false);
        return;
      }
      if (s.y + 7 >= GROUND_Y) {
        const gx = Math.round(s.x);
        for (let x = gx - 2; x <= gx + 2; x++) {
          if (x >= 0 && x < W && ground[x] && Math.random() < 0.7) {
            ground[x] = 0;
            P(x, GROUND_Y, rand(-0.6, 0.6), rand(-1.6, -0.4), rand(40, 80), GROUND_PAL, { g: 0.06, add: false, bounce: true });
          }
        }
        burst(s.x, GROUND_Y - 1, 12, FIRE, 1.4, 18, { drag: 0.9, g: 0.02 });
        alienShots.splice(i, 1);
      }
    }
  }

  // ---------------------------------------------------------------- nave misteriosa
  function ufoScore() {
    const n = shotsFired;
    if (n >= 23 && (n - 23) % 15 === 0) return 300;
    return UFO_TABLE[n % 15];
  }
  function updateUfo() {
    if (ufo) {
      ufo.x += ufo.dir * 0.8;
      if (frame % 2 === 0) {
        P(ufo.x + (ufo.dir > 0 ? 1 : 15), UFO_Y + rand(2, 6), -ufo.dir * rand(0.2, 0.6), rand(-0.1, 0.1), rand(10, 20), UFO_PAL, { drag: 0.95 });
      }
      if (ufo.x < -20 || ufo.x > W + 4) { ufo = null; Sfx.ufoStop(); ufoTimer = UFO_INTERVAL; }
    } else if (--ufoTimer <= 0) {
      ufoTimer = UFO_INTERVAL;
      if (aliveCount >= 8) {
        const dir = shotsFired % 2 === 0 ? 1 : -1;
        ufo = { x: dir > 0 ? -16 : W, dir };
        Sfx.ufoStart();
      }
    }
  }
  function killUfo() {
    const pts = ufoScore();
    addScore(pts);
    const cx = ufo.x + 8, cy = UFO_Y + 3;
    shatter(SPR.UFO, ufo.x, UFO_Y, UFO_PAL, 2.2);
    burst(cx, cy, 40, FIRE, 3, 30, { drag: 0.93, g: 0.01 });
    ring(cx, cy, 28, 2.2, UFO_PAL, 22, { drag: 0.95 });
    ring(cx, cy, 20, 1.2, FIRE, 26, { drag: 0.96 });
    shockwave(cx, cy, 50, 2.5);
    popups.push({ x: cx, y: UFO_Y, text: String(pts), color: '#ff8fa3', t: 90 });
    shake = Math.max(shake, 2.5); flash = Math.max(flash, 0.25);
    Sfx.ufoStop(); Sfx.ufoHit();
    ufo = null; ufoTimer = UFO_INTERVAL;
  }

  // ---------------------------------------------------------------- jogador
  function killPlayer(invasion) {
    if (state !== 'playing') return;
    state = 'dying';
    stateTimer = invasion ? 120 : 150;
    if (invasion) lives = 1;
    player.alive = false;
    const px = Math.round(player.x), cx = px + 6, cy = PLAYER_Y + 4;
    shatter(SPR.PLAYER, px, PLAYER_Y, CYAN, 2.6, { bounce: true, g: 0.05 });
    burst(cx, cy, 70, FIRE, 3.4, 45, { drag: 0.94, g: 0.03, bounce: true });
    ring(cx, cy, 32, 2.6, FIRE, 24, { drag: 0.95 });
    for (let i = 0; i < 25; i++) {
      P(cx + rand(-4, 4), cy, rand(-1.5, 1.5), rand(-3, -0.5), rand(60, 120), FIRE, { g: 0.06, add: false, bounce: true, size: pick([1, 1, 2]) });
    }
    shockwave(cx, cy, 70, 3);
    shake = 5; flash = 0.5;
    alienShots = []; pshot = null;
    if (ufo) { Sfx.ufoStop(); ufo = null; ufoTimer = UFO_INTERVAL; }
    Sfx.playerDie();
  }

  function gameOver() {
    state = 'gameover';
    stateTimer = 0;
    if (score >= hi) { hi = score; saveHi(); }
  }

  // ---------------------------------------------------------------- input
  const keys = Object.create(null);
  const touch = { left: false, right: false, fire: false };
  const input = {
    get left() { return keys.ArrowLeft || keys.KeyA || touch.left; },
    get right() { return keys.ArrowRight || keys.KeyD || touch.right; },
    get fire() { return keys.Space || keys.KeyW || keys.ArrowUp || touch.fire; },
  };

  function pressStart() {
    Sfx.init();
    if (state === 'title') startGame();
    else if (state === 'gameover' && stateTimer > 60) startGame();
  }
  function togglePause() {
    if (state === 'title' || state === 'gameover') return;
    paused = !paused;
    if (paused) Sfx.ufoStop(); else if (ufo) Sfx.ufoStart();
  }

  const GAME_KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'];
  addEventListener('keydown', e => {
    if (GAME_KEYS.includes(e.code)) e.preventDefault();
    Sfx.init();
    if (e.repeat) return;
    keys[e.code] = true;
    if (e.code === 'Enter' || (e.code === 'Space' && state !== 'playing')) pressStart();
    if (e.code === 'KeyP' || e.code === 'Escape') togglePause();
    if (e.code === 'KeyM') { const m = Sfx.toggle(); if (!m && ufo && !paused) Sfx.ufoStart(); }
  });
  addEventListener('keyup', e => { keys[e.code] = false; });
  addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && !paused && (state === 'playing' || state === 'dying' || state === 'waveclear')) togglePause();
  });

  for (const btn of document.querySelectorAll('#touch button')) {
    const k = btn.dataset.k;
    const on = e => { e.preventDefault(); Sfx.init(); touch[k] = true; btn.classList.add('active'); if (k === 'fire') pressStart(); };
    const off = e => { e.preventDefault(); touch[k] = false; btn.classList.remove('active'); };
    btn.addEventListener('pointerdown', on);
    btn.addEventListener('pointerup', off);
    btn.addEventListener('pointerleave', off);
    btn.addEventListener('pointercancel', off);
  }
  wrap.addEventListener('pointerdown', () => pressStart());

  // ---------------------------------------------------------------- título com partículas
  const TITLE_Y = 38;
  function buildTitle() {
    if (state !== 'title') return;
    const c = document.createElement('canvas');
    c.width = W; c.height = 50;
    const g = c.getContext('2d');
    g.font = `16px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'top'; g.fillStyle = '#fff';
    g.fillText('NEBULA', W / 2, 2);
    g.fillText('SIEGE', W / 2, 26);
    const d = g.getImageData(0, 0, W, 50).data;
    const old = titleParts;
    titleParts = [];
    for (let y = 0; y < 50; y++) for (let x = 0; x < W; x++) {
      if (d[(y * W + x) * 4 + 3] < 140) continue;
      const c1 = y < 22 ? mix('#ff4fd8', '#a07cff', x / W) : mix('#4fe8ff', '#7dff6a', x / W);
      const prev = old[titleParts.length];
      titleParts.push({
        tx: x, ty: y + TITLE_Y,
        x: prev ? prev.x : rand(W), y: prev ? prev.y : rand(H),
        vx: 0, vy: 0, c: c1,
      });
    }
  }
  function updateTitle() {
    for (const t of titleParts) {
      t.vx = (t.vx + (t.tx - t.x) * 0.012 + rand(-0.04, 0.04)) * 0.9;
      t.vy = (t.vy + (t.ty - t.y) * 0.012 + rand(-0.04, 0.04)) * 0.9;
      t.x += t.vx; t.y += t.vy;
    }
    if (frame % 300 === 150 && titleParts.length) {
      const t = pick(titleParts);
      shockwave(t.x, t.y, 34, 3);
      burst(t.x, t.y, 20, pick([CYAN, FIRE, TYPES[0].pal]), 2, 24, { drag: 0.93 });
    }
    // brasas subindo
    if (frame % 3 === 0) P(rand(W), H + 2, rand(-0.1, 0.1), rand(-0.9, -0.4), rand(120, 220), pick([TYPES[0].pal, CYAN, TYPES[2].pal]), { drag: 1 });
  }
  function drawTitle() {
    ctx.globalCompositeOperation = 'lighter';
    const sheen = ((frame * 1.5) % (W + 80)) - 40;
    for (const t of titleParts) {
      ctx.fillStyle = Math.abs(t.tx - sheen + (t.ty - TITLE_Y) * 0.5) < 5 ? '#ffffff' : t.c;
      ctx.fillRect(Math.round(t.x), Math.round(t.y), 1, 1);
    }
    ctx.globalCompositeOperation = 'source-over';

    text('TABELA DE PONTOS', W / 2, 106, '#8a7cff', 'center');
    const f = (frame >> 5) & 1;
    const rows = [
      [ufoCanv, '= ? MISTERIO', '#ff8fa3'],
      [TYPES[0].canv[f], '= 30 PONTOS', TYPES[0].color],
      [TYPES[1].canv[f], '= 20 PONTOS', TYPES[1].color],
      [TYPES[2].canv[f], '= 10 PONTOS', TYPES[2].color],
    ];
    rows.forEach(([img, label, col], i) => {
      const y = 124 + i * 16;
      ctx.drawImage(img, 64 - (img.width >> 1), y);
      text(label, 80, y, col);
    });
    if ((frame >> 5) % 2 === 0) text('PRESSIONE ENTER', W / 2, 202, '#ffffff', 'center');
  }
  if (document.fonts && document.fonts.load) {
    document.fonts.load(`16px ${FONT}`).then(buildTitle).catch(() => {});
  }
  buildTitle();

  // ---------------------------------------------------------------- update
  function update() {
    frame++;
    const warp = state === 'waveclear' ? 8 : 1;
    for (const s of stars) {
      s.y += s.z * warp;
      if (s.y > H) { s.y = 0; s.x = rand(W); }
    }

    if (state === 'title') {
      updateTitle();
    } else if (!paused) {
      if (state === 'playing') updatePlaying();
      else if (state === 'dying') updateDying();
      else if (state === 'waveclear') updateWaveClear();
      else if (state === 'gameover') stateTimer++;
    }

    if (!paused) {
      updateParticles();
      for (let i = popups.length - 1; i >= 0; i--) { popups[i].y -= 0.15; if (--popups[i].t <= 0) popups.splice(i, 1); }
      if (shake > 0) { shake *= 0.9; if (shake < 0.3) shake = 0; }
      if (flash > 0) flash = Math.max(0, flash - 0.03);
    }
  }

  function updatePlaying() {
    // jogador
    player.dir = 0;
    if (input.left) { player.x -= PLAYER_SPEED; player.dir = -1; }
    if (input.right) { player.x += PLAYER_SPEED; player.dir += 1; }
    player.x = clamp(player.x, 8, W - 8 - SPR.PLAYER.w);
    if (player.cooldown > 0) player.cooldown--;
    if (input.fire && !pshot && player.cooldown === 0 && hitPause === 0) firePlayer();

    // propulsores
    const px = Math.round(player.x);
    for (const ex of [1, 11]) {
      if (Math.random() < (player.dir ? 0.9 : 0.5)) {
        P(px + ex + rand(-0.5, 0.5), PLAYER_Y + 8, rand(-0.1, 0.1) - player.dir * 0.25, rand(0.4, 1), rand(6, 12), ENGINE, { drag: 0.9 });
      }
    }

    updatePlayerShot();

    if (alienFreeze > 0) alienFreeze--;
    else if (hitPause > 0) hitPause--;
    else stepFormation();
    if (state !== 'playing') return;

    // brilho ambiente dos alienígenas
    for (const a of aliens) {
      if (a.alive && Math.random() < 0.003) {
        const t = TYPES[a.type];
        P(a.x + t.off + rand(t.w), a.y + rand(8), 0, rand(0.1, 0.3), 20, t.pal, { drag: 1 });
      }
    }

    if (alienFreeze === 0) alienFire();
    updateAlienShots();
    if (state !== 'playing') return;
    updateUfo();

    if (aliveCount === 0 && hitPause === 0) {
      state = 'waveclear';
      stateTimer = 200;
      alienShots = []; pshot = null;
      if (ufo) { Sfx.ufoStop(); ufo = null; }
      Sfx.waveClear();
    }
  }

  function updateDying() {
    if (--stateTimer > 0) return;
    lives--;
    if (lives <= 0) { gameOver(); return; }
    player = { x: 16, alive: true, cooldown: 30, dir: 0 };
    // reaparecimento com partículas convergindo
    for (let i = 0; i < 40; i++) {
      const a = rand(Math.PI * 2), d = rand(14, 30);
      const sx = player.x + 6 + Math.cos(a) * d, sy = PLAYER_Y + 4 + Math.sin(a) * d;
      P(sx, sy, (player.x + 6 - sx) / 20, (PLAYER_Y + 4 - sy) / 20, 20, CYAN, { drag: 1 });
    }
    alienFreeze = 40;
    state = 'playing';
  }

  function updateWaveClear() {
    if (stateTimer % 22 === 0) {
      const x = rand(30, W - 30), y = rand(50, 150);
      const pal = pick([TYPES[0].pal, TYPES[1].pal, TYPES[2].pal, FIRE, UFO_PAL]);
      ring(x, y, 36, 1.6, pal, 50, { g: 0.025, drag: 0.97 });
      burst(x, y, 30, pal, 1.2, 60, { g: 0.03, drag: 0.97 });
      Sfx.bunkerHit();
    }
    if (--stateTimer <= 0) {
      wave++;
      setupWave();
      player.cooldown = 20;
      state = 'playing';
    }
  }

  // ---------------------------------------------------------------- render
  function text(s, x, y, color = '#fff', align = 'left', size = 8) {
    ctx.font = `${size}px ${FONT}`;
    ctx.textAlign = align;
    ctx.textBaseline = 'top';
    ctx.fillStyle = color;
    ctx.fillText(s, Math.round(x), Math.round(y));
  }

  function drawAlienShot(s) {
    const x = Math.round(s.x), y = Math.round(s.y), a = (s.anim >> 2) & 3;
    ctx.fillStyle = SHOT_COLORS[s.type];
    if (s.type === 0) {        // espiral
      for (let i = 0; i < 7; i++) ctx.fillRect(x + [0, 1, 0, -1][(i + a) & 3], y + i, 1, 1);
    } else if (s.type === 1) { // pistão
      ctx.fillRect(x, y, 1, 7);
      ctx.fillRect(x - 1, y + ((a * 2) % 7), 3, 1);
    } else {                   // zigue-zague
      for (let i = 0; i < 7; i++) ctx.fillRect(x + [-1, -1, 0, 1, 1, 0][(i + a * 2) % 6], y + i, 1, 1);
    }
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x, y + 6, 1, 1);
  }

  function drawHUD() {
    text('PONTOS', 8, 4, '#8a7cff');
    text(String(score).padStart(5, '0'), 8, 14, '#ffffff');
    text('RECORDE', W / 2, 4, '#8a7cff', 'center');
    text(String(hi).padStart(5, '0'), W / 2, 14, '#ffffff', 'center');
    text('ONDA', W - 8, 4, '#8a7cff', 'right');
    text(String(wave).padStart(2, '0'), W - 8, 14, '#ffffff', 'right');
    if (state !== 'title') {
      text(String(Math.max(lives, 0)), 8, GROUND_Y + 5, '#4fe8ff');
      for (let i = 0; i < Math.min(lives - 1, 5); i++) ctx.drawImage(playerCanv, 22 + i * 16, GROUND_Y + 5);
    }
    if (Sfx.muted) text('SEM SOM', W - 8, GROUND_Y + 5, '#5a4c9a', 'right');
  }

  function overlayBox(y, h) {
    ctx.fillStyle = 'rgba(5,4,12,0.78)';
    ctx.fillRect(24, y, W - 48, h);
    ctx.fillStyle = '#2a1d55';
    ctx.fillRect(24, y, W - 48, 1); ctx.fillRect(24, y + h - 1, W - 48, 1);
    ctx.fillRect(24, y, 1, h); ctx.fillRect(W - 25, y, 1, h);
  }

  function render() {
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.drawImage(nebula, 0, 0);

    // estrelas
    const warp = state === 'waveclear';
    for (const s of stars) {
      if ((frame + s.tw) % 400 < 6) continue; // piscar
      ctx.globalAlpha = s.z > 0.2 ? 1 : s.z > 0.08 ? 0.65 : 0.35;
      ctx.fillStyle = s.c;
      ctx.fillRect(s.x | 0, s.y | 0, 1, warp ? Math.ceil(s.z * 24) : 1);
    }
    ctx.globalAlpha = 1;

    ctx.save();
    if (shake > 0) ctx.translate(Math.round(rand(-shake, shake)), Math.round(rand(-shake, shake)));

    // chão
    ctx.fillStyle = '#7dff6a';
    for (let x = 0; x < W; x++) if (ground[x] || state === 'title') ctx.fillRect(x, GROUND_Y, 1, 1);

    if (state !== 'title') {
      for (const b of bunkers) { if (b.dirty) renderBunker(b); ctx.drawImage(b.canv, b.x, b.y); }
      for (const a of aliens) {
        if (!a.alive) continue;
        const t = TYPES[a.type];
        ctx.drawImage(t.canv[a.frame], a.x + t.off, a.y);
      }
      if (ufo) ctx.drawImage(ufoCanv, Math.round(ufo.x), UFO_Y);
      if (player.alive) {
        const blink = alienFreeze > 0 && state === 'playing' && (frame >> 2) & 1 && player.cooldown > 0;
        if (!blink) ctx.drawImage(playerCanv, Math.round(player.x), PLAYER_Y);
      }
      if (pshot) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(pshot.x, Math.round(pshot.y), 1, 4);
        ctx.fillStyle = '#4fe8ff';
        ctx.fillRect(pshot.x, Math.round(pshot.y) + 3, 1, 1);
      }
      for (const s of alienShots) drawAlienShot(s);
    }

    drawParticles();
    ctx.restore();

    for (const p of popups) {
      if (p.t > 20 || (p.t >> 1) & 1) text(p.text, p.x, p.y, p.color, 'center');
    }

    if (state === 'title') drawTitle();
    drawHUD();

    if (state === 'waveclear') text(`ONDA ${wave} COMPLETA`, W / 2, 118, '#7dff6a', 'center');
    if (state === 'gameover') {
      overlayBox(96, 58);
      text('FIM DE JOGO', W / 2, 106, '#ff4fd8', 'center');
      if (score >= hi && score > 0) text('NOVO RECORDE!', W / 2, 122, '#ffd23f', 'center');
      if (stateTimer > 60 && (frame >> 5) % 2 === 0) text('ENTER: JOGAR', W / 2, 138, '#ffffff', 'center');
    }
    if (paused) {
      overlayBox(108, 32);
      text('PAUSA', W / 2, 120, '#4fe8ff', 'center');
    }

    if (flash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${flash})`;
      ctx.fillRect(0, 0, W, H);
    }

    // camada de bloom
    gctx.clearRect(0, 0, W, H);
    gctx.drawImage(canvas, 0, 0);
  }

  // ---------------------------------------------------------------- escala da tela
  function resize() {
    const coarse = matchMedia('(pointer: coarse)').matches;
    const availW = innerWidth - 32;
    const availH = innerHeight - (coarse ? 130 : 80);
    let s = Math.min(availW / W, availH / H);
    s = s >= 2 ? Math.floor(s) : Math.max(1, s);
    wrap.style.width = `${Math.floor(W * s)}px`;
    wrap.style.height = `${Math.floor(H * s)}px`;
    document.documentElement.style.setProperty('--px', `${s}px`);
  }
  addEventListener('resize', resize);
  resize();

  // ---------------------------------------------------------------- loop (passo fixo de 60 Hz)
  let last = performance.now(), acc = 0;
  function loop(now) {
    acc += Math.min(0.25, (now - last) / 1000);
    last = now;
    while (acc >= STEP) { update(); acc -= STEP; }
    render();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();
