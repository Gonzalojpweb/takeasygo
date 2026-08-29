// PRUEBA DE IMPRESION / SONDEO DE CODEPAGE
// Genera un ticket de diagnostico y lo envia a una impresora termica.
//
// Uso:
//   node test-ticket.js --list
//   node test-ticket.js --tcp 192.168.1.50[:9100] [--width 32|48]
//   node test-ticket.js --usb "Nombre de impresora" [--width 32|48]
//   node test-ticket.js --save ticket.bin   (guarda sin imprimir)
//
// Que imprime:
//   1) Palabras de aceptacion: RIÑON PORCION GUARNICION ENTRAÑA (deben verse bien)
//   2) Renglon de acentos: a e i o u / A E I O U / n N / u^ U^ / €
//   3) Bloque "TABLA FISICA": 4 renglones (CP437/CP850/CP858/CP1252) + hexdump
//      que permiten leer en la foto cual es la tabla real del equipo.

const net = require('node:net');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');
const iconv = require('iconv-lite');

const ESC_POS = {
    INIT: Buffer.from([0x1b, 0x40]),
    CODE_PAGE: Buffer.from([0x1b, 0x74, 43]), // CP858 (Latin-1 + Euro)
    CUT: Buffer.from([0x1d, 0x56, 0x01]),
    BOLD_ON: Buffer.from([0x1b, 0x45, 0x01]),
    BOLD_OFF: Buffer.from([0x1b, 0x45, 0x00]),
    ALIGN_LEFT: Buffer.from([0x1b, 0x61, 0x00]),
    ALIGN_CENTER: Buffer.from([0x1b, 0x61, 0x01]),
    SIZE_NORMAL: Buffer.from([0x1d, 0x21, 0x00]),
    SIZE_DOUBLE_HEIGHT: Buffer.from([0x1d, 0x21, 0x01]),
    LINE_SPACING: Buffer.from([0x1b, 0x33, 20]),
};

const NON_LATIN1_RE = /[^\u0000-\u00FF\u20AC]/g;

function buf(input) {
    if (Buffer.isBuffer(input)) return input;
    const str = typeof input === 'string' ? input : String(input);
    return iconv.encode(str.replace(NON_LATIN1_RE, ''), 'cp858');
}

function bytesLabel(hex) {
    const b = Buffer.from(hex, 'hex');
    return b.toString('hex').replace(/(..)(?=.)/g, '$1 ').trim().toUpperCase();
}

function buildTicket(columns = 32) {
    const chunks = [];
    const lineStr = '-'.repeat(columns);

    chunks.push(ESC_POS.INIT, ESC_POS.CODE_PAGE, ESC_POS.ALIGN_CENTER);
    chunks.push(ESC_POS.LINE_SPACING);
    chunks.push(ESC_POS.SIZE_DOUBLE_HEIGHT, ESC_POS.BOLD_ON);
    chunks.push(buf('PRUEBA DE IMPRESION\n'));
    chunks.push(ESC_POS.SIZE_NORMAL, ESC_POS.BOLD_OFF);
    chunks.push(buf('AGENTE FIX CP858\n'));
    chunks.push(buf(`${new Date().toLocaleString('es-AR')}\n`));
    chunks.push(buf(`${lineStr}\n`));

    // --- 1) Palabras de aceptacion (deben verse bien) ---
    chunks.push(ESC_POS.ALIGN_LEFT, ESC_POS.BOLD_ON);
    chunks.push(buf('1) PALABRAS DE ACEPTACION:\n'));
    chunks.push(ESC_POS.BOLD_OFF);
    const words = ['RIÑÓN', 'PORCIÓN', 'GUARNICIÓN', 'ENTRAÑA'];
    chunks.push(buf(words.map(w => `   - ${w}`).join('\n')));
    chunks.push(buf('\n'));
    chunks.push(buf(`   NUNCA: RIT-NN / PORCIroN / GUARNICIroN\n`));
    chunks.push(buf(`\n`));
    chunks.push(ESC_POS.BOLD_ON);
    chunks.push(buf('2) ACENTOS - DEBE VERSE:\n'));
    chunks.push(ESC_POS.BOLD_OFF);
    chunks.push(buf('   a e i o u  A E I O U\n'));
    chunks.push(buf('   n N  u^ U^  Euro(€)\n'));
    chunks.push(buf('   ($ si la impresora no tiene Euro)\n'));
    chunks.push(buf(`\n`));

    // --- 3) Identificador de tabla fisica ---
    chunks.push(ESC_POS.ALIGN_CENTER, ESC_POS.BOLD_ON);
    chunks.push(buf('3) TABLA FISICA DEL EQUIPO\n'));
    chunks.push(ESC_POS.BOLD_OFF, ESC_POS.ALIGN_LEFT);
    chunks.push(buf('El renglon que se ve BIEN indica\n'));
    chunks.push(buf('la tabla real. Hexdump = bytes\n'));
    chunks.push(buf('enviados:\n'));

    const sample = 'ÑÁÉÓ£¤╔═║€';
    const cps = [
        { label: 'CP437 ', enc: 'cp437' },
        { label: 'CP850 ', enc: 'cp850' },
        { label: 'CP858 ', enc: 'cp858' },
        { label: 'CP1252', enc: 'cp1252' },
    ];
    cps.forEach(c => {
        const bytes = iconv.encode(sample, c.enc);
        const rendered = iconv.decode(bytes, c.enc).replace(/[\u0000-\u001F\u007F-\u009F]/g, '?');
        chunks.push(buf(` ${c.label}: ${rendered}\n`));
        chunks.push(buf(`   HEX: ${bytesLabel(bytes)}\n`));
    });
    chunks.push(buf(`\n`));

    // --- Footer ---
    chunks.push(ESC_POS.ALIGN_CENTER, ESC_POS.BOLD_ON);
    chunks.push(buf('FOTO A SOPORTE\n'));
    chunks.push(ESC_POS.BOLD_OFF, ESC_POS.ALIGN_LEFT);
    chunks.push(buf(`\n`));
    chunks.push(ESC_POS.CUT);

    return Buffer.concat(chunks);
}

// Helper: bytes hex de una string (solo diagnostico en consola)
class BytesEnc {
    static FromString(str) {
        return Buffer.from(str.replace(NON_LATIN1_RE, ''), 'utf8')
    }
}

function sendToPrinterTCP(ip, port, data) {
    return new Promise((resolve, reject) => {
        const client = new net.Socket();
        client.setTimeout(8000);
        client.on('error', reject);
        client.on('timeout', () => { client.destroy(); reject(new Error('TIMEOUT: La impresora no respondió')); });
        client.connect(port, ip, () => {
            client.write(data, (err) => {
                if (err) { client.destroy(); return reject(err); }
                client.end(() => { client.destroy(); resolve(); });
            });
        });
    });
}

function sendToPrinterUSB(printerName, data) {
    return new Promise((resolve, reject) => {
        const tmpFile = path.join(os.tmpdir(), `test-ticket-${Date.now()}.bin`);
        fs.writeFileSync(tmpFile, data);
        const psScript = path.join(__dirname, 'send-raw.ps1');
        execFile(
            'powershell',
            ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', psScript, '-PrinterName', printerName, '-FilePath', tmpFile],
            { timeout: 15000 },
            (err, stdout, stderr) => {
                try { fs.unlinkSync(tmpFile); } catch (e) { /* ignore */ }
                if (err) reject(new Error((stderr || err.message).trim()));
                else resolve(stdout.trim());
            }
        );
    });
}

function listPrinters() {
    const { execSync } = require('child_process');
    try {
        const out = execSync('powershell -NoProfile -Command "Get-Printer | Select-Object -ExpandProperty Name"', { encoding: 'utf8', timeout: 5000 });
        return out.trim().split(/\r?\n/).filter(Boolean);
    } catch (e) {
        return [];
    }
}

function usage() {
    console.log('Uso:');
    console.log('  node test-ticket.js --list');
    console.log('  node test-ticket.js --tcp <ip>[:<puerto>] [--width 32|48]');
    console.log('  node test-ticket.js --usb "<nombre impresora>" [--width 32|48]');
}

(async () => {
    const args = process.argv.slice(2);
    const tcpIdx = args.indexOf('--tcp');
    const usbIdx = args.indexOf('--usb');
    const saveIdx = args.indexOf('--save');
    const widthIdx = args.indexOf('--width');

    const width = widthIdx >= 0 ? parseInt(args[widthIdx + 1], 10) : 32;
    const columns = width === 48 ? 48 : 32;

    if (args.includes('--list')) {
        const printers = listPrinters();
        if (printers.length > 0) {
            console.log('Impresoras instaladas (parametro --usb):');
            printers.forEach(p => console.log(`  - "${p}"`));
        } else {
            console.log('No hay impresoras instaladas en Windows.');
        }
        return;
    }

    if (saveIdx >= 0) {
        const outPath = args[saveIdx + 1];
        if (!outPath) { console.error('Falta la ruta de destino para --save'); usage(); return; }
        try {
            fs.writeFileSync(outPath, buildTicket(columns));
            console.log(`OK: ticket guardado en "${outPath}".`);
        } catch (e) {
            console.error(`FALLO: ${e.message}`);
            process.exitCode = 1;
        }
        return;
    }

    if (tcpIdx < 0 && usbIdx < 0) { usage(); return; }

    const ticket = buildTicket(columns);

    if (tcpIdx >= 0) {
        const target = args[tcpIdx + 1] || '';
        const m = target.match(/^([^:]+)(?::(\d+))?$/);
        if (!m) { console.error('IP invalida'); return; }
        const ip = m[1];
        const port = m[2] ? parseInt(m[2], 10) : 9100;
        try {
            await sendToPrinterTCP(ip, port, ticket);
            console.log(`OK: ticket enviado a ${ip}:${port} (${ticket.length} bytes).`);
        } catch (e) {
            console.error(`FALLO: ${e.message}`);
            process.exitCode = 1;
        }
    } else if (usbIdx >= 0) {
        const name = args[usbIdx + 1];
        if (!name) { console.error('Falta el nombre de la impresora'); usage(); return; }
        try {
            const res = await sendToPrinterUSB(name, ticket);
            console.log(`OK: ticket enviado a "${name}" (${ticket.length} bytes). ${res}`);
        } catch (e) {
            console.error(`FALLO: ${e.message}`);
            process.exitCode = 1;
        }
    } else {
        usage();
    }
})();