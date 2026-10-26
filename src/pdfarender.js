// ================================================================
// Render de PDF -> PNG a 300 dpi (server-side)
// ================================================================
// Usa pdfjs-dist (JS puro) para interpretar el PDF y @napi-rs/canvas
// para rasterizar cada página. 300 dpi = 300/72 de escala sobre el
// viewport nativo (72 dpi) del PDF.

const { createCanvas } = require('@napi-rs/canvas');

const DPI = 300;
const ESCALA = DPI / 72; // 4.1667

/**
 * Convierte un Buffer PDF en un array de Buffers PNG (uno por página).
 * @param {Buffer} pdfBuffer
 * @returns {Promise<Array<{pagina:number, png:Buffer, ancho:number, alto:number}>>}
 */
async function pdfAPngs(pdfBuffer) {
  // Import dinámico: pdfjs-dist v4+/6+ distribuye ESM en legacy/build.
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');

  const data = new Uint8Array(pdfBuffer);
  const doc = await pdfjs.getDocument({
    data,
    useSystemFonts: true,
    disableFontFace: false
  }).promise;

  const paginas = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const viewport = page.getViewport({ scale: ESCALA });

    const ancho = Math.ceil(viewport.width);
    const alto = Math.ceil(viewport.height);

    const canvas = createCanvas(ancho, alto);
    const ctx = canvas.getContext('2d');

    // Fondo blanco (los P&ID suelen tener fondo transparente).
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, ancho, alto);

    await page.render({
      canvasContext: ctx,
      viewport: viewport,
      canvas: canvas
    }).promise;

    const png = canvas.toBuffer('image/png');
    paginas.push({ pagina: i, png: png, ancho: ancho, alto: alto });
  }

  return paginas;
}

module.exports = { pdfAPngs, DPI };
