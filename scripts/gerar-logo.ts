/**
 * Prepara a logo a partir do PNG original: recorta a margem transparente,
 * reduz para uso em tela e gera a versão do tema escuro — nela apenas os
 * pixels escuros são clareados; o laranja da marca fica intacto.
 *
 *   npm run gerar-logo -- "caminho/para/logo.png"
 */
import fs from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";

const origem = process.argv[2];
if (!origem || !fs.existsSync(origem)) {
  console.error('Informe o PNG de origem. Ex.: npm run gerar-logo -- "C:/.../logo.png"');
  process.exit(1);
}

const LARGURA = 320; // suficiente para 40px em telas 4x
const src = PNG.sync.read(fs.readFileSync(origem));
const at = (p: PNG, x: number, y: number) => (p.width * y + x) << 2;

// ---- recorte na área com conteúdo
let minX = src.width;
let minY = src.height;
let maxX = 0;
let maxY = 0;
for (let y = 0; y < src.height; y++) {
  for (let x = 0; x < src.width; x++) {
    if (src.data[at(src, x, y) + 3] > 16) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
}
const cropW = maxX - minX + 1;
const cropH = maxY - minY + 1;

// ---- redução por média de área, preservando a transparência
const escala = cropW / LARGURA;
const outW = LARGURA;
const outH = Math.round(cropH / escala);
const out = new PNG({ width: outW, height: outH });

for (let y = 0; y < outH; y++) {
  for (let x = 0; x < outW; x++) {
    const x0 = minX + Math.floor(x * escala);
    const x1 = Math.min(maxX + 1, minX + Math.ceil((x + 1) * escala));
    const y0 = minY + Math.floor(y * escala);
    const y1 = Math.min(maxY + 1, minY + Math.ceil((y + 1) * escala));

    let r = 0;
    let g = 0;
    let b = 0;
    let a = 0;
    let n = 0;
    for (let sy = y0; sy < y1; sy++) {
      for (let sx = x0; sx < x1; sx++) {
        const i = at(src, sx, sy);
        const alpha = src.data[i + 3] / 255;
        // média ponderada pelo alfa evita halo escuro nas bordas
        r += src.data[i] * alpha;
        g += src.data[i + 1] * alpha;
        b += src.data[i + 2] * alpha;
        a += src.data[i + 3];
        n += 1;
      }
    }
    const somaAlfa = a / 255 || 1;
    const o = at(out, x, y);
    out.data[o] = Math.round(r / somaAlfa);
    out.data[o + 1] = Math.round(g / somaAlfa);
    out.data[o + 2] = Math.round(b / somaAlfa);
    out.data[o + 3] = Math.round(a / n);
  }
}

const dir = path.join(process.cwd(), "public");
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, "logo.png"), PNG.sync.write(out));

// ---- versão do tema escuro: só o que é escuro vira claro
const CLARO = [248, 248, 249]; // --text do tema escuro
const escura = new PNG({ width: outW, height: outH });
out.data.copy(escura.data);

let recoloridos = 0;
for (let i = 0; i < escura.data.length; i += 4) {
  if (escura.data[i + 3] < 8) continue;
  const [r, g, b] = [escura.data[i], escura.data[i + 1], escura.data[i + 2]];
  const max = Math.max(r, g, b);
  const laranja = r > 120 && r > g * 1.5 && r > b * 2; // preserva o laranja da marca
  if (laranja) continue;

  // escuros e cinzas: inverte a luminosidade mantendo o tom neutro
  const lum = max / 255;
  const alvo = 1 - lum;
  escura.data[i] = Math.round(CLARO[0] * (0.45 + 0.55 * alvo));
  escura.data[i + 1] = Math.round(CLARO[1] * (0.45 + 0.55 * alvo));
  escura.data[i + 2] = Math.round(CLARO[2] * (0.45 + 0.55 * alvo));
  recoloridos += 1;
}
fs.writeFileSync(path.join(dir, "logo-dark.png"), PNG.sync.write(escura));

const kb = (f: string) => `${(fs.statSync(path.join(dir, f)).size / 1024).toFixed(0)} kB`;
console.log(`origem      ${src.width}x${src.height}`);
console.log(`recortado   ${cropW}x${cropH}`);
console.log(`gerado      ${outW}x${outH}`);
console.log(`public/logo.png       ${kb("logo.png")}`);
console.log(`public/logo-dark.png  ${kb("logo-dark.png")}  (${recoloridos} pixels clareados)`);
