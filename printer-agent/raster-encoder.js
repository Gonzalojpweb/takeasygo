/**
 * raster-encoder.js
 * Convierte canvas RGBA a buffer ESC/POS monocromo usando GS v 0 (raster bit image).
 * Atkinson dithering para conversión 1-bit.
 */

/**
 * Convierte pixels RGBA a monocromo (1-bit) usando Atkinson dithering.
 * @param {Uint8ClampedArray} rgba - pixels del canvas (4 bytes por pixel: R, G, B, A)
 * @param {number} width - ancho en pixels
 * @param {number} height - alto en pixels
 * @returns {{ pixels: Uint8Array, width: number, height: number }}
 */
function imageToMonochrome(rgba, width, height) {
    const totalPixels = width * height;
    const grayscale = new Float32Array(totalPixels);

    // Paso 1: RGBA → grayscale
    for (let i = 0; i < totalPixels; i++) {
        const r = rgba[i * 4];
        const g = rgba[i * 4 + 1];
        const b = rgba[i * 4 + 2];
        grayscale[i] = 0.299 * r + 0.587 * g + 0.114 * b;
    }

    // Paso 2: Atkinson dithering
    const output = new Uint8Array(totalPixels);

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = y * width + x;
            const old = grayscale[idx];
            const new_val = old < 128 ? 0 : 255;
            output[idx] = new_val;
            const error = (old - new_val) / 8; // Atkinson: 1/8 per neighbor, 6 neighbors = 75% distributed

            // Distribuir error a 6 vecinos (Atkinson pattern)
            const spread = [
                [x + 1, y],
                [x + 2, y],
                [x - 1, y + 1],
                [x, y + 1],
                [x + 1, y + 1],
                [x, y + 2],
            ];

            for (const [nx, ny] of spread) {
                if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                    grayscale[ny * width + nx] += error;
                }
            }
        }
    }

    return { pixels: output, width, height };
}

/**
 * Empaqueta pixels monocromo en buffer ESC/POS con GS v 0.
 * Ancho: padding a byte completo (ceil(width / 8)).
 * Alto: exacto en yL/yH, sin padding.
 * @param {Uint8Array} pixels - 1 bit por pixel (0 = negro, 255 = blanco)
 * @param {number} width - ancho en dots
 * @param {number} height - alto en dots
 * @param {number} paperWidth - 384 (58mm) o 576 (80mm)
 * @returns {Buffer}
 */
function encodeGSv0(pixels, width, height, paperWidth) {
    const bytesWide = Math.ceil(width / 8);
    const dataSize = bytesWide * height;

    // GS v 0 header: 1D 76 30 m xL xH yL yH (8 bytes)
    const headerBuf = Buffer.alloc(8);
    headerBuf[0] = 0x1D;                     // GS
    headerBuf[1] = 0x76;                     // v
    headerBuf[2] = 0x30;                     // 0 (mode: normal)
    headerBuf[3] = 0x00;                     // m = 0 (normal)
    headerBuf[4] = bytesWide & 0xFF;         // xL (low byte)
    headerBuf[5] = (bytesWide >> 8) & 0xFF;  // xH (high byte)
    headerBuf[6] = height & 0xFF;            // yL (low byte)
    headerBuf[7] = (height >> 8) & 0xFF;     // yH (high byte)

    // Data: empaquetar pixels a 1-bit, MSB primero
    const data = Buffer.alloc(dataSize);
    let dataIdx = 0;

    for (let y = 0; y < height; y++) {
        for (let byteX = 0; byteX < bytesWide; byteX++) {
            let byte = 0;
            for (let bit = 0; bit < 8; bit++) {
                const dotX = byteX * 8 + bit;
                if (dotX < width) {
                    const pixelVal = pixels[y * width + dotX];
                    // Negro (0) = bit encendido (1 en ESC/POS)
                    if (pixelVal === 0) {
                        byte |= (0x80 >> bit);
                    }
                }
                // Si dotX >= width, bit queda en 0 (blanco)
            }
            data[dataIdx++] = byte;
        }
    }

    return Buffer.concat([headerBuf, data]);
}

/**
 * Pipeline completo: canvas RGBA → buffer ESC/POS listo para enviar por TCP/USB.
 * @param {import('@napi-rs/canvas').Canvas} canvas - canvas RGBA renderizado
 * @param {number} paperWidth - 384 (58mm) o 576 (80mm)
 * @returns {Buffer}
 */
function canvasToEscPos(canvas, paperWidth) {
    const ctx = canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    // Centrar el canvas en el ancho del papel si es necesario
    const srcWidth = canvas.width;
    const srcHeight = canvas.height;

    let mono;
    if (srcWidth === paperWidth) {
        // Ya tiene el ancho correcto
        mono = imageToMonochrome(imageData.data, srcWidth, srcHeight);
    } else {
        // Centrar: crear canvas temporal del ancho del papel
        const { createCanvas: createTempCanvas } = require('@napi-rs/canvas');
        const tempCanvas = createTempCanvas(paperWidth, srcHeight);
        const tempCtx = tempCanvas.getContext('2d');

        // Fondo blanco
        tempCtx.fillStyle = '#FFFFFF';
        tempCtx.fillRect(0, 0, paperWidth, srcHeight);

        // Centrar contenido
        const offsetX = Math.floor((paperWidth - srcWidth) / 2);
        tempCtx.drawImage(canvas, offsetX, 0);

        const tempImageData = tempCtx.getImageData(0, 0, paperWidth, srcHeight);
        mono = imageToMonochrome(tempImageData.data, paperWidth, srcHeight);
    }

    return encodeGSv0(mono.pixels, mono.width, mono.height, paperWidth);
}

module.exports = { imageToMonochrome, encodeGSv0, canvasToEscPos };
