import express from "express";
import cors from "cors";
import multer from "multer";
import sharp from "sharp";

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 },
});

app.use(cors({ origin: true }));
app.use(express.json());

const PORT = process.env.PORT || 4000;

function clampByte(x) {
  return Math.max(0, Math.min(255, Math.round(x)));
}

function rgbToHex([r, g, b]) {
  return `#${[r, g, b]
    .map((v) => clampByte(v).toString(16).padStart(2, "0"))
    .join("")}`;
}

function squaredDistance(a, b) {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return dr * dr + dg * dg + db * db;
}

function seededRandom(seed = 123456789) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

function chooseInitialCentersKMeansPlusPlus(pixels, k) {
  const rand = seededRandom(42);
  const centers = [];
  centers.push(pixels[Math.floor(rand() * pixels.length)]);

  while (centers.length < k) {
    const distances = pixels.map((p) =>
      Math.min(...centers.map((c) => squaredDistance(p, c)))
    );
    const total = distances.reduce((sum, d) => sum + d, 0);

    if (total === 0) {
      centers.push(pixels[Math.floor(rand() * pixels.length)]);
      continue;
    }

    let target = rand() * total;
    let chosen = pixels[pixels.length - 1];
    for (let i = 0; i < pixels.length; i++) {
      target -= distances[i];
      if (target <= 0) {
        chosen = pixels[i];
        break;
      }
    }
    centers.push(chosen);
  }

  return centers.map((c) => [...c]);
}

function kMeansRgb(pixels, k, iterations = 14) {
  if (pixels.length === 0) return [];

  const actualK = Math.max(1, Math.min(k, pixels.length));
  let centers = chooseInitialCentersKMeansPlusPlus(pixels, actualK);
  let assignments = new Array(pixels.length).fill(0);

  for (let iter = 0; iter < iterations; iter++) {
    const sums = Array.from({ length: actualK }, () => [0, 0, 0, 0]);

    for (let i = 0; i < pixels.length; i++) {
      let best = 0;
      let bestDist = Infinity;

      for (let c = 0; c < actualK; c++) {
        const dist = squaredDistance(pixels[i], centers[c]);
        if (dist < bestDist) {
          bestDist = dist;
          best = c;
        }
      }

      assignments[i] = best;
      sums[best][0] += pixels[i][0];
      sums[best][1] += pixels[i][1];
      sums[best][2] += pixels[i][2];
      sums[best][3] += 1;
    }

    centers = centers.map((oldCenter, i) => {
      const count = sums[i][3];
      if (count === 0) return oldCenter;
      return [sums[i][0] / count, sums[i][1] / count, sums[i][2] / count];
    });
  }

  const counts = new Array(actualK).fill(0);
  for (const a of assignments) counts[a] += 1;

  return centers
    .map((center, i) => {
      const rgb = center.map(clampByte);
      return {
        id: `color-${i}`,
        hex: rgbToHex(rgb),
        rgb,
        count: counts[i],
        percentage: counts[i] / pixels.length,
      };
    })
    .filter((cluster) => cluster.count > 0)
    .sort((a, b) => b.count - a.count);
}

function shouldKeepPixel(r, g, b, a) {
  if (a < 180) return false;

  // Drop near-white and near-black outliers slightly so the palette better reflects objects.
  // Remove these two lines if you want exact dominance including backgrounds/shadows.
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max > 248 && min > 238) return false;

  return true;
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/api/analyze", upload.single("photo"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded. Use the field name 'photo'." });
    }

    const k = Math.max(2, Math.min(10, Number(req.body.k || 5)));

    const image = sharp(req.file.buffer, { failOn: "none" }).rotate();
    const metadata = await image.metadata();

    const { data, info } = await image
      .clone()
      .resize({ width: 220, height: 220, fit: "inside", withoutEnlargement: true })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const pixels = [];
    const channels = info.channels;

    for (let i = 0; i < data.length; i += channels) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3] ?? 255;
      if (shouldKeepPixel(r, g, b, a)) pixels.push([r, g, b]);
    }

    const fallbackPixels = [];
    if (pixels.length < 20) {
      for (let i = 0; i < data.length; i += channels) {
        const a = data[i + 3] ?? 255;
        if (a >= 80) fallbackPixels.push([data[i], data[i + 1], data[i + 2]]);
      }
    }

    const palette = kMeansRgb(pixels.length >= 20 ? pixels : fallbackPixels, k);

    res.json({
      palette,
      image: {
        width: metadata.width,
        height: metadata.height,
        format: metadata.format,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Could not analyze this image." });
  }
});

app.listen(PORT, () => {
  console.log(`Colour analysis server listening on http://localhost:${PORT}`);
});
