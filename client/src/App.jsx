import { useEffect, useMemo, useRef, useState } from "react";

const API_URL = import.meta.env.VITE_API_URL || "";
const MAX_PREVIEW_SIDE = 1100;

function clampByte(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function hexToRgb(hex) {
  const clean = hex.replace("#", "");
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ];
}

function rgbToHex(rgb) {
  return `#${rgb.map((v) => clampByte(v).toString(16).padStart(2, "0")).join("")}`;
}

function squaredDistance(a, b) {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return dr * dr + dg * dg + db * db;
}

function nearestPaletteIndex(rgb, palette) {
  let best = 0;
  let bestDistance = Infinity;

  for (let i = 0; i < palette.length; i++) {
    const d = squaredDistance(rgb, palette[i].originalRgb);
    if (d < bestDistance) {
      bestDistance = d;
      best = i;
    }
  }

  return best;
}

function fitImageSize(width, height, maxSide = MAX_PREVIEW_SIDE) {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  };
}

function PentagonLogo() {
  const colors = ["#2563eb", "#ec4899", "#f97316", "#8b5cf6", "#06b6d4"];
  const radius = 10;
  const centerX = 30;
  const centerY = 30;
  const orbitRadius = 18;

  const circles = colors.map((color, index) => {
    const angle = (index * 72 * Math.PI) / 180 - Math.PI / 2;
    const x = centerX + orbitRadius * Math.cos(angle);
    const y = centerY + orbitRadius * Math.sin(angle);
    return { x, y, color };
  });

  return (
    <svg width="60" height="60" viewBox="0 0 60 60" className="logo">
      {circles.map((circle, index) => (
        <circle
          key={index}
          cx={circle.x}
          cy={circle.y}
          r={radius}
          fill={circle.color}
          opacity="0.9"
        />
      ))}
    </svg>
  );
}

function PaletteChip({ color, onChangeColor, onMove, onReset, onMysteryColor }) {
  const dragOffsetRef = useRef({ x: 0, y: 0 });

  function onPointerDown(event) {
    if (event.target.closest("input, button, label")) return;

    const rect = event.currentTarget.parentElement.getBoundingClientRect();
    dragOffsetRef.current = {
      x: event.clientX - rect.left - color.x,
      y: event.clientY - rect.top - color.y,
    };

    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;

    const board = event.currentTarget.parentElement.getBoundingClientRect();
    const nextX = event.clientX - board.left - dragOffsetRef.current.x;
    const nextY = event.clientY - board.top - dragOffsetRef.current.y;

    onMove(color.id, {
      x: Math.max(0, Math.min(board.width - 132, nextX)),
      y: Math.max(0, Math.min(board.height - 96, nextY)),
    });
  }

  function onPointerUp(event) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  return (
    <div
      className="palette-chip"
      style={{ left: color.x, top: color.y }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <div
        className="chip-swatch"
        style={{ background: color.currentHex }}
        title={color.currentHex}
      />
      <div className="chip-content">
        <div className="chip-row">
          <strong>{Math.round(color.percentage * 100)}%</strong>
          <span>{color.currentHex}</span>
        </div>
        <div className="chip-controls">
          <label className="color-picker-button">
            <input
              aria-label={`Change ${color.originalHex}`}
              type="color"
              value={color.currentHex}
              onChange={(event) => onChangeColor(color.id, event.target.value)}
            />
            <span>Try colour</span>
          </label>
          <button type="button" onClick={() => onMysteryColor(color.id)}>
            Mystery?
          </button>
          <button type="button" onClick={() => onReset(color.id)}>
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const canvasRef = useRef(null);
  const originalImageDataRef = useRef(null);
  const imageUrlRef = useRef(null);
  const imageRef = useRef(null);

  const [file, setFile] = useState(null);
  const [fileName, setFileName] = useState("");
  const [status, setStatus] = useState("Upload a photo to begin.");
  const [error, setError] = useState("");
  const [palette, setPalette] = useState([]);
  const [k, setK] = useState(5);
  const [strength, setStrength] = useState(0.85);
  const [detail, setDetail] = useState(0.85);

  const hasImage = Boolean(originalImageDataRef.current && palette.length);

  const selectedColours = useMemo(
    () => palette.map((color) => color.currentHex).join(" "),
    [palette]
  );

  useEffect(() => {
    return () => {
      if (imageUrlRef.current) URL.revokeObjectURL(imageUrlRef.current);
    };
  }, []);

  useEffect(() => {
    renderRecolouredImage();
  }, [palette, strength, detail]);

  async function handleFileChange(event) {
    const nextFile = event.target.files?.[0];
    if (!nextFile) return;

    if (!nextFile.type.startsWith("image/")) {
      setError("Please choose an image file.");
      return;
    }

    setFile(nextFile);
    setFileName(nextFile.name);
    setError("");
    setStatus("Image selected. Click Analyze colours.");
    setPalette([]);
    originalImageDataRef.current = null;

    if (imageUrlRef.current) URL.revokeObjectURL(imageUrlRef.current);
    imageUrlRef.current = URL.createObjectURL(nextFile);

    await drawOriginalPreview(imageUrlRef.current);
  }

  async function drawOriginalPreview(url) {
    const img = new Image();
    img.src = url;

    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
    });

    imageRef.current = img;
    const size = fitImageSize(img.naturalWidth, img.naturalHeight);
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    canvas.width = size.width;
    canvas.height = size.height;
    ctx.clearRect(0, 0, size.width, size.height);
    ctx.drawImage(img, 0, 0, size.width, size.height);
    originalImageDataRef.current = ctx.getImageData(0, 0, size.width, size.height);
  }

  async function analyzeColours() {
    if (!file) {
      setError("Upload a photo first.");
      return;
    }

    try {
      setError("");
      setStatus("Extracting dominant colours with k-means...");

      const formData = new FormData();
      formData.append("photo", file);
      formData.append("k", String(k));

      const response = await fetch(`${API_URL}/api/analyze`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "Could not analyze this image.");
      }

      const data = await response.json();
      const paletteCount = data.palette.length;
      const columns = paletteCount > 5 ? 3 : 2;
      const columnGap = columns === 3 ? 220 : 230;
      const rowGap = 160;
      const startOffset = 24;

      const nextPalette = data.palette.map((color, index) => ({
        ...color,
        originalHex: color.hex,
        currentHex: color.hex,
        originalRgb: color.rgb,
        x: startOffset + (index % columns) * columnGap,
        y: startOffset + Math.floor(index / columns) * rowGap,
      }));

      setPalette(nextPalette);
      setStatus(`Found ${nextPalette.length} main colours. Drag or edit the chips to recolour the photo.`);
    } catch (err) {
      setError(err.message);
      setStatus("Something went wrong.");
    }
  }

  function renderRecolouredImage() {
    const canvas = canvasRef.current;
    const original = originalImageDataRef.current;
    if (!canvas || !original || palette.length === 0) return;

    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const output = new ImageData(
      new Uint8ClampedArray(original.data),
      original.width,
      original.height
    );

    const currentPalette = palette.map((color) => ({
      original: color.originalRgb,
      current: hexToRgb(color.currentHex),
    }));

    for (let i = 0; i < output.data.length; i += 4) {
      const alpha = output.data[i + 3];
      if (alpha === 0) continue;

      const originalRgb = [output.data[i], output.data[i + 1], output.data[i + 2]];
      const index = nearestPaletteIndex(originalRgb, palette);
      const source = currentPalette[index].original;
      const target = currentPalette[index].current;

      // Keep some local contrast: move the pixel toward the edited cluster colour,
      // while preserving part of its offset from the original cluster centroid.
      const detailedTarget = [
        target[0] + (originalRgb[0] - source[0]) * detail,
        target[1] + (originalRgb[1] - source[1]) * detail,
        target[2] + (originalRgb[2] - source[2]) * detail,
      ];

      output.data[i] = clampByte(originalRgb[0] * (1 - strength) + detailedTarget[0] * strength);
      output.data[i + 1] = clampByte(originalRgb[1] * (1 - strength) + detailedTarget[1] * strength);
      output.data[i + 2] = clampByte(originalRgb[2] * (1 - strength) + detailedTarget[2] * strength);
    }

    ctx.putImageData(output, 0, 0);
  }

  function moveChip(id, position) {
    setPalette((colors) =>
      colors.map((color) => (color.id === id ? { ...color, ...position } : color))
    );
  }

  function changeChipColor(id, hex) {
    setPalette((colors) =>
      colors.map((color) => (color.id === id ? { ...color, currentHex: hex } : color))
    );
  }

  function resetChip(id) {
    setPalette((colors) =>
      colors.map((color) =>
        color.id === id ? { ...color, currentHex: color.originalHex } : color
      )
    );
  }

  function resetAll() {
    setPalette((colors) =>
      colors.map((color) => ({ ...color, currentHex: color.originalHex }))
    );
    setStrength(0.38);
    setDetail(0.35);
  }

  function randomisePalette() {
    setPalette((colors) =>
      colors.map((color) => ({
        ...color,
        currentHex: rgbToHex([
          Math.random() * 255,
          Math.random() * 255,
          Math.random() * 255,
        ]),
      }))
    );
  }

  function randomColourHex() {
    return rgbToHex([
      Math.random() * 255,
      Math.random() * 255,
      Math.random() * 255,
    ]);
  }

  function mysteryColor(id) {
    setPalette((colors) =>
      colors.map((color) =>
        color.id === id ? { ...color, currentHex: randomColourHex() } : color
      )
    );
  }

  function downloadImage() {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const link = document.createElement("a");
    link.download = "recoloured-photo.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
  }

  function exportPaletteCard() {
    if (!palette.length) return;

    const width = Math.max(360, palette.length * 100);
    const height = 240;
    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = width;
    exportCanvas.height = height;
    const ctx = exportCanvas.getContext("2d");

    ctx.fillStyle = "#f8fafb";
    ctx.fillRect(0, 0, width, height);

    const headerHeight = 40;
    ctx.fillStyle = "#172026";
    ctx.font = "700 18px Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText("Palette card", 18, 14);

    const swatchTop = headerHeight + 10;
    const swatchHeight = 100;
    const swatchWidth = Math.floor(width / palette.length);
    const labelY = swatchTop + swatchHeight + 14;

    palette.forEach((color, index) => {
      ctx.fillStyle = color.currentHex;
      ctx.fillRect(index * swatchWidth, swatchTop, swatchWidth, swatchHeight);
      ctx.fillStyle = "#172026";
      ctx.font = "600 12px Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText(color.currentHex, index * swatchWidth + swatchWidth / 2, labelY);
    });

    const link = document.createElement("a");
    link.download = "palette-card.png";
    link.href = exportCanvas.toDataURL("image/png");
    link.click();
  }

  return (
    <main className="app-shell">
      <div className="logo-container">
        <PentagonLogo />
      </div>
      <section className="hero-card">
        <div>
          <p className="eyebrow">Colour Playground</p>
          <h1>Upload a photo, artwork, design</h1>
          <p className="hero-copy">
            Extracts main color palette, preview how the photo changes when you drag, edit, or replace each colour piece.
          </p>
        </div>

        <div className="upload-card">
          <label className="file-input">
            <input type="file" accept="image/*" onChange={handleFileChange} />
            <span>{fileName || "Choose photo"}</span>
          </label>

          <label className="slider-label">
            Colours: <strong>{k}</strong>
            <input
              type="range"
              min="2"
              max="10"
              value={k}
              onChange={(event) => setK(Number(event.target.value))}
            />
          </label>

          <button className="primary-button blue-button" type="button" onClick={analyzeColours}>
            Analyze colours
          </button>
        </div>
      </section>

      <section className="workspace">
        <div className="image-panel">
          <div className="panel-header">
            <div>
              <h2>Modified Graphic</h2>
              <p>{status}</p>
            </div>
            <div className="action-row">
              <button type="button" onClick={downloadImage} disabled={!hasImage}>
                Download PNG
              </button>
              <button className="pink-button" type="button" onClick={exportPaletteCard} disabled={!palette.length}>
                Export palette card
              </button>
            </div>
          </div>

          {error && <div className="error-box">{error}</div>}

          <div className="canvas-wrap">
            <canvas ref={canvasRef} />
            {!file && <div className="empty-state">Image preview will appear here.</div>}
          </div>
        </div>

        <aside className="control-panel">
          <h2>Colour Lab</h2>
          <p className="muted">
            Use each colour card to change the matching
            colour cluster in the photo, feel free to drag the color cards around too. 
          </p>

          <div className="slider-stack">
            <label className="slider-label">
              Recolour strength: <strong>{Math.round(strength * 100)}%</strong>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={strength}
                onChange={(event) => setStrength(Number(event.target.value))}
              />
            </label>

            <label className="slider-label">
              Keep detail: <strong>{Math.round(detail * 100)}%</strong>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={detail}
                onChange={(event) => setDetail(Number(event.target.value))}
              />
            </label>
          </div>

          <div className="button-row">
            <button className="orange-button" type="button" onClick={resetAll} disabled={!palette.length}>
              Reset
            </button>
            <button type="button" onClick={randomisePalette} disabled={!palette.length}>
              Randomise
            </button>
          </div>

          <div className="palette-board" aria-label="Draggable palette board">
            {palette.length === 0 ? (
              <div className="palette-empty">Extracted colours will appear here.</div>
            ) : (
              palette.map((color) => (
                <PaletteChip
                  key={color.id}
                  color={color}
                  onMove={moveChip}
                  onChangeColor={changeChipColor}
                  onReset={resetChip}
                  onMysteryColor={mysteryColor}
                />
              ))
            )}
          </div>

          {palette.length > 0 && (
            <div className="palette-summary">
              <span>Current palette</span>
              <code>{selectedColours}</code>
            </div>
          )}
        </aside>
      </section>
    </main>
  );
}
