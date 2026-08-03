/**
 * Receipt image preprocessing for OCR.
 *
 * Pipeline: downscale -> grayscale -> crop-to-receipt -> de-skew ->
 * illumination flattening + adaptive threshold blend -> JPEG data URL.
 *
 * Everything runs on canvas/typed arrays so it stays fast on phones.
 */

type Gray = { data: Uint8ClampedArray; w: number; h: number };

function toGray(ctx: CanvasRenderingContext2D, w: number, h: number): Gray {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const out = new Uint8ClampedArray(w * h);
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    out[p] = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) | 0;
  }
  return { data: out, w, h };
}

/** Otsu threshold over a grayscale buffer. */
function otsu(gray: Gray): number {
  const hist = new Array(256).fill(0);
  for (let i = 0; i < gray.data.length; i++) hist[gray.data[i]]++;
  const total = gray.data.length;
  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * hist[t];
  let sumB = 0, wB = 0, best = 0, thr = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) { best = between; thr = t; }
  }
  return thr;
}

/**
 * Find the receipt: it is the bright document sitting on a darker background.
 * We use row/column profiles of "bright" pixel density and trim the borders
 * where density collapses.
 */
function findReceiptBox(gray: Gray): { x: number; y: number; w: number; h: number } {
  const { data, w, h } = gray;
  const thr = Math.max(90, otsu(gray));
  const rows = new Float32Array(h);
  const cols = new Float32Array(w);
  for (let y = 0; y < h; y++) {
    let c = 0;
    const off = y * w;
    for (let x = 0; x < w; x++) if (data[off + x] > thr) { c++; cols[x]++; }
    rows[y] = c / w;
  }
  for (let x = 0; x < w; x++) cols[x] /= h;

  const trim = (prof: Float32Array, len: number) => {
    let peak = 0;
    for (let i = 0; i < len; i++) if (prof[i] > peak) peak = prof[i];
    const cut = peak * 0.35;
    let a = 0, b = len - 1;
    while (a < len && prof[a] < cut) a++;
    while (b > a && prof[b] < cut) b--;
    return [a, b] as const;
  };

  const [y0, y1] = trim(rows, h);
  const [x0, x1] = trim(cols, w);
  const padX = Math.round(w * 0.01);
  const padY = Math.round(h * 0.01);
  const bx = Math.max(0, x0 - padX);
  const by = Math.max(0, y0 - padY);
  const bw = Math.min(w - bx, x1 - x0 + 1 + padX * 2);
  const bh = Math.min(h - by, y1 - y0 + 1 + padY * 2);

  // Ignore implausible crops (dark receipt, full-bleed scan, detection noise).
  if (bw < w * 0.25 || bh < h * 0.25 || bw * bh > w * h * 0.985) {
    return { x: 0, y: 0, w, h };
  }
  return { x: bx, y: by, w: bw, h: bh };
}

/**
 * Estimate skew by maximising the variance of the horizontal ink profile.
 * Text lines align into sharp peaks only when the page is straight.
 */
function estimateSkew(gray: Gray): number {
  const { data, w, h } = gray;
  const step = Math.max(1, Math.round(Math.max(w, h) / 500)); // sample grid
  const thr = otsu(gray);
  const pts: number[] = [];
  for (let y = 0; y < h; y += step) {
    const off = y * w;
    for (let x = 0; x < w; x += step) {
      if (data[off + x] < thr * 0.85) pts.push(x, y); // dark = ink
    }
  }
  if (pts.length < 200) return 0;

  const cx = w / 2, cy = h / 2;
  let bestAngle = 0, bestScore = -1;
  for (let deg = -10; deg <= 10; deg += 0.5) {
    const a = (deg * Math.PI) / 180;
    const sin = Math.sin(a), cos = Math.cos(a);
    const bins = new Float32Array(h + 1);
    for (let i = 0; i < pts.length; i += 2) {
      const dx = pts[i] - cx, dy = pts[i + 1] - cy;
      const yy = (dx * sin + dy * cos + cy) | 0;
      if (yy >= 0 && yy <= h) bins[yy]++;
    }
    let mean = 0;
    for (let i = 0; i < bins.length; i++) mean += bins[i];
    mean /= bins.length;
    let varSum = 0;
    for (let i = 0; i < bins.length; i++) {
      const d = bins[i] - mean;
      varSum += d * d;
    }
    if (varSum > bestScore) { bestScore = varSum; bestAngle = deg; }
  }
  return Math.abs(bestAngle) < 0.4 ? 0 : bestAngle;
}

/**
 * Illumination-flattened adaptive threshold (Bradley/integral-image), blended
 * with a contrast-stretched grayscale so faint thermal print survives.
 */
function adaptiveContrast(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const g = new Uint8ClampedArray(w * h);
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    g[p] = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) | 0;
  }

  // Integral image for O(1) local means.
  const integral = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let rowSum = 0;
    for (let x = 0; x < w; x++) {
      rowSum += g[y * w + x];
      integral[(y + 1) * (w + 1) + (x + 1)] = integral[y * (w + 1) + (x + 1)] + rowSum;
    }
  }
  const half = Math.max(6, Math.round(Math.min(w, h) / 24));

  // Global stretch bounds (2nd/98th percentile) for the grayscale channel.
  const hist = new Uint32Array(256);
  for (let i = 0; i < g.length; i++) hist[g[i]]++;
  const lowCut = g.length * 0.02, highCut = g.length * 0.98;
  let acc = 0, lo = 0, hi = 255;
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= lowCut) { lo = v; break; } }
  acc = 0;
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= highCut) { hi = v; break; } }
  const range = Math.max(1, hi - lo);

  for (let y = 0; y < h; y++) {
    const y1 = Math.max(0, y - half), y2 = Math.min(h - 1, y + half);
    for (let x = 0; x < w; x++) {
      const x1 = Math.max(0, x - half), x2 = Math.min(w - 1, x + half);
      const area = (x2 - x1 + 1) * (y2 - y1 + 1);
      const sum =
        integral[(y2 + 1) * (w + 1) + (x2 + 1)] -
        integral[y1 * (w + 1) + (x2 + 1)] -
        integral[(y2 + 1) * (w + 1) + x1] +
        integral[y1 * (w + 1) + x1];
      const mean = sum / area;
      const p = y * w + x;
      const v = g[p];
      // Soft threshold around the local mean -> removes shadows/glare gradients.
      const t = mean * 0.92;
      const soft = Math.max(0, Math.min(255, 128 + (v - t) * 3.2));
      const stretched = Math.max(0, Math.min(255, ((v - lo) * 255) / range));
      const out = Math.round(soft * 0.65 + stretched * 0.35);
      const i4 = p * 4;
      d[i4] = d[i4 + 1] = d[i4 + 2] = out;
      d[i4 + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

function makeCanvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  return { c, ctx };
}

export async function preprocessReceipt(
  file: File | Blob,
  maxDim = 1800,
  quality = 0.9,
): Promise<string> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));

  let { c, ctx } = makeCanvas(w, h);
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close?.();

  try {
    // 1) Crop to the receipt.
    const box = findReceiptBox(toGray(ctx, w, h));
    if (box.w !== w || box.h !== h) {
      const cropped = makeCanvas(box.w, box.h);
      cropped.ctx.drawImage(c, box.x, box.y, box.w, box.h, 0, 0, box.w, box.h);
      c = cropped.c; ctx = cropped.ctx;
    }

    // 2) De-skew.
    const angle = estimateSkew(toGray(ctx, c.width, c.height));
    if (angle !== 0) {
      const rad = (angle * Math.PI) / 180;
      const sin = Math.abs(Math.sin(rad)), cos = Math.abs(Math.cos(rad));
      const rw = Math.round(c.width * cos + c.height * sin);
      const rh = Math.round(c.width * sin + c.height * cos);
      const rot = makeCanvas(rw, rh);
      rot.ctx.fillStyle = "#ffffff";
      rot.ctx.fillRect(0, 0, rw, rh);
      rot.ctx.translate(rw / 2, rh / 2);
      rot.ctx.rotate(-rad);
      rot.ctx.drawImage(c, -c.width / 2, -c.height / 2);
      rot.ctx.setTransform(1, 0, 0, 1, 0, 0);
      c = rot.c; ctx = rot.ctx;
    }

    // 3) Contrast / adaptive threshold.
    adaptiveContrast(ctx, c.width, c.height);
  } catch {
    // Any canvas/security failure: fall back to the plain resized render.
  }

  return c.toDataURL("image/jpeg", quality);
}
