// Générateur de QR code (octets UTF-8, correction d'erreurs M, versions 1 à 10). Aucune dépendance.
// ModuleQR.matrix(texte) -> { size, get(x, y) } ; ModuleQR.svg(texte, { margin }) -> chaîne SVG (null si trop long).
const ModuleQR = {
    ECC: [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26],   // octets de correction par bloc (niveau M), index = version
    BLK: [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5],             // nombre de blocs
    MAXV: 10,
    gmul(a, b) { let r = 0; for (let i = 7; i >= 0; i--) { r = (r << 1) ^ ((r >>> 7) * 0x11D); r ^= ((b >>> i) & 1) * a; } return r & 255; },
    rs(data, deg) {
        const div = new Array(deg).fill(0); div[deg - 1] = 1; let root = 1;
        for (let i = 0; i < deg; i++) { for (let j = 0; j < deg; j++) { div[j] = this.gmul(div[j], root); if (j + 1 < deg) div[j] ^= div[j + 1]; } root = this.gmul(root, 2); }
        const res = new Array(deg).fill(0);
        data.forEach(b => { const f = b ^ res.shift(); res.push(0); div.forEach((c, i) => { res[i] ^= this.gmul(c, f); }); });
        return res;
    },
    rawModules(v) { let r = (16 * v + 128) * v + 64; if (v >= 2) { const n = Math.floor(v / 7) + 2; r -= (25 * n - 10) * n - 55; if (v >= 7) r -= 36; } return r; },
    align(v) {
        if (v === 1) return [];
        const n = Math.floor(v / 7) + 2, size = v * 4 + 17, step = Math.ceil((v * 4 + 4) / (n * 2 - 2)) * 2, r = [6];
        for (let pos = size - 7; r.length < n; pos -= step) r.splice(1, 0, pos);
        return r;
    },
    bytes(text) { return Array.from(new TextEncoder().encode(String(text))); },
    matrix(text) {
        const data = this.bytes(text);
        let ver = 0, cap = 0;
        for (let v = 1; v <= this.MAXV; v++) {
            cap = Math.floor(this.rawModules(v) / 8) - this.ECC[v] * this.BLK[v];
            const need = Math.ceil((4 + (v < 10 ? 8 : 16) + data.length * 8) / 8);
            if (need <= cap) { ver = v; break; }
        }
        if (!ver) return null;
        // 1. flux de bits : mode octets, longueur, données, terminateur, remplissage
        const bits = []; const put = (val, n) => { for (let i = n - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
        put(4, 4); put(data.length, ver < 10 ? 8 : 16); data.forEach(b => put(b, 8));
        put(0, Math.min(4, cap * 8 - bits.length)); while (bits.length % 8) bits.push(0);
        const cw = []; for (let i = 0; i < bits.length; i += 8) { let b = 0; for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j]; cw.push(b); }
        for (let pad = 0xEC; cw.length < cap; pad ^= 0xEC ^ 0x11) cw.push(pad);
        // 2. blocs + correction + entrelacement
        const nb = this.BLK[ver], el = this.ECC[ver], raw = Math.floor(this.rawModules(ver) / 8), ns = nb - raw % nb, sl = Math.floor(raw / nb);
        const blocks = []; let k = 0;
        for (let i = 0; i < nb; i++) { const dat = cw.slice(k, k + sl - el + (i < ns ? 0 : 1)); k += dat.length; const ecc = this.rs(dat, el); if (i < ns) dat.push(0); blocks.push(dat.concat(ecc)); }
        const all = [];
        for (let i = 0; i < blocks[0].length; i++) blocks.forEach((bl, j) => { if (i !== sl - el || j >= ns) all.push(bl[i]); });
        // 3. matrice
        const size = ver * 4 + 17, mod = Array.from({ length: size }, () => new Array(size).fill(false)), fn = Array.from({ length: size }, () => new Array(size).fill(false));
        const set = (x, y, d) => { mod[y][x] = d; fn[y][x] = true; };
        for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
        const finder = (cx, cy) => { for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) { const d = Math.max(Math.abs(dx), Math.abs(dy)), x = cx + dx, y = cy + dy; if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, d !== 2 && d !== 4); } };
        finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
        const ap = this.align(ver);
        ap.forEach((ax, i) => ap.forEach((ay, j) => { if ((i === 0 && j === 0) || (i === 0 && j === ap.length - 1) || (i === ap.length - 1 && j === 0)) return; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1); }));
        const fmt = (mask) => {
            const d = (0 << 3) | mask; let r = d; for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537);
            const b = ((d << 10) | r) ^ 0x5412, g = i => ((b >>> i) & 1) !== 0;
            for (let i = 0; i <= 5; i++) set(8, i, g(i)); set(8, 7, g(6)); set(8, 8, g(7)); set(7, 8, g(8)); for (let i = 9; i < 15; i++) set(14 - i, 8, g(i));
            for (let i = 0; i < 8; i++) set(size - 1 - i, 8, g(i)); for (let i = 8; i < 15; i++) set(8, size - 15 + i, g(i)); set(8, size - 8, true);
        };
        fmt(0);
        if (ver >= 7) { let r = ver; for (let i = 0; i < 12; i++) r = (r << 1) ^ ((r >>> 11) * 0x1F25); const b = (ver << 12) | r; for (let i = 0; i < 18; i++) { const bit = ((b >>> i) & 1) !== 0, a = size - 11 + i % 3, c = Math.floor(i / 3); set(a, c, bit); set(c, a, bit); } }
        let i = 0;
        for (let right = size - 1; right >= 1; right -= 2) {
            if (right === 6) right = 5;
            for (let vert = 0; vert < size; vert++) for (let j = 0; j < 2; j++) {
                const x = right - j, up = ((right + 1) & 2) === 0, y = up ? size - 1 - vert : vert;
                if (!fn[y][x] && i < all.length * 8) { mod[y][x] = ((all[i >>> 3] >>> (7 - (i & 7))) & 1) !== 0; i++; }
            }
        }
        // 4. masque : on garde celui qui a la plus faible pénalité (séries et blocs 2×2)
        const inv = (m, x, y) => [(x + y) % 2 === 0, y % 2 === 0, x % 3 === 0, (x + y) % 3 === 0, (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, x * y % 2 + x * y % 3 === 0, (x * y % 2 + x * y % 3) % 2 === 0, ((x + y) % 2 + x * y % 3) % 2 === 0][m];
        const pen = () => {
            let p = 0;
            for (let t = 0; t < 2; t++) for (let a = 0; a < size; a++) { let run = 1; for (let b = 1; b < size; b++) { const cur = t ? mod[b][a] : mod[a][b], prv = t ? mod[b - 1][a] : mod[a][b - 1]; if (cur === prv) { run++; if (run === 5) p += 3; else if (run > 5) p++; } else run = 1; } }
            for (let y = 0; y < size - 1; y++) for (let x = 0; x < size - 1; x++) { const c = mod[y][x]; if (c === mod[y][x + 1] && c === mod[y + 1][x] && c === mod[y + 1][x + 1]) p += 3; }
            return p;
        };
        const apply = (m) => { for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fn[y][x] && inv(m, x, y)) mod[y][x] = !mod[y][x]; };
        let best = 0, bp = Infinity;
        for (let m = 0; m < 8; m++) { apply(m); fmt(m); const p = pen(); if (p < bp) { bp = p; best = m; } apply(m); }
        apply(best); fmt(best);
        return { size, version: ver, get: (x, y) => x >= 0 && y >= 0 && x < size && y < size && mod[y][x] };
    },
    svg(text, o) {
        const m = this.matrix(text); if (!m) return null;
        const mg = (o && o.margin != null) ? o.margin : 4, n = m.size + mg * 2; let d = '';
        for (let y = 0; y < m.size; y++) for (let x = 0; x < m.size; x++) if (m.get(x, y)) d += 'M' + (x + mg) + ',' + (y + mg) + 'h1v1h-1z';
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges" role="img" aria-label="QR code"><rect width="${n}" height="${n}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
    }
};
