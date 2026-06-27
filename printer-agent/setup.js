#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const http = require('http');
const readline = require('readline');

const CONFIG_PATH = path.join(__dirname, 'config.json');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(question) {
  return new Promise(resolve => rl.question(question, resolve));
}

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const options = {
      hostname: parsed.hostname,
      port: parsed.port || 80,
      path: parsed.pathname + parsed.search,
      method: 'GET',
      timeout: 10000,
    };
    const req = http.request(options, res => {
      let data = '';
      res.on('data', chunk => (data += chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          reject(new Error('Respuesta no es JSON válido'));
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    req.end();
  });
}

async function main() {
  console.log('');
  console.log('===================================================');
  console.log('   CONFIGURADOR - AGENTE DE IMPRESION TAKEASYGO');
  console.log('===================================================');
  console.log('');

  let config = {};
  if (fs.existsSync(CONFIG_PATH)) {
    try {
      config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    } catch {}
  }

  const apiUrl = await ask(`URL del servidor [${config.apiUrl || 'https://takeasygo.com'}]: `);
  config.apiUrl = apiUrl.trim() || config.apiUrl || 'https://takeasygo.com';

  const tenantSlug = await ask(`Slug del restaurante [${config.tenantSlug || ''}]: `);
  config.tenantSlug = tenantSlug.trim() || config.tenantSlug;

  if (!config.tenantSlug || config.tenantSlug.startsWith('TU-')) {
    console.log('');
    console.log('ERROR: Debés ingresar el slug de tu restaurante.');
    console.log('Ejemplo: si tu panel es takeasygo.com/cero-cafe/admin, el slug es "cero-cafe".');
    rl.close();
    return;
  }

  console.log('');
  console.log(`Buscando sedes de "${config.tenantSlug}" en ${config.apiUrl}...`);

  try {
    const data = await fetchJSON(`${config.apiUrl}/api/${config.tenantSlug}/locations`);
    if (data.error) {
      console.log(`Error: ${data.error}`);
      rl.close();
      return;
    }

    const locations = data.locations || [];
    if (locations.length === 0) {
      console.log('No se encontraron sedes activas para este restaurante.');
      rl.close();
      return;
    }

    console.log('');
    console.log('Sedes disponibles:');
    locations.forEach((loc, i) => {
      console.log(`  ${i + 1}. ${loc.name} (${loc._id})`);
    });

    const locIndex = await ask(`Elegí el número de la sede [1]: `);
    const idx = parseInt(locIndex) || 1;
    if (idx < 1 || idx > locations.length) {
      console.log('Número inválido.');
      rl.close();
      return;
    }

    config.locationId = locations[idx - 1]._id;
    console.log(`Sede seleccionada: ${locations[idx - 1].name}`);

  } catch (err) {
    console.log(`No se pudo conectar al servidor: ${err.message}`);
    const locId = await ask('Ingresá el locationId manualmente: ');
    config.locationId = locId.trim();
  }

  const pollInterval = await ask(`Intervalo de polling en ms [${config.pollInterval || 15000}]: `);
  config.pollInterval = parseInt(pollInterval) || config.pollInterval || 15000;

  config.autoUpdate = false;

  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
  console.log('');
  console.log('===================================================');
  console.log('   CONFIGURACION GUARDADA');
  console.log('===================================================');
  console.log('');
  console.log('Para iniciar el agente:');
  console.log('  - Modo manual: doble-click en start.bat');
  console.log('  - Como servicio: doble-click en INSTALAR_SERVICIO.bat');
  console.log('');

  rl.close();
}

main();
