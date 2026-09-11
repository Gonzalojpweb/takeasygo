const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(f => {
    const fp = path.join(dir, f);
    try {
      const st = fs.statSync(fp);
      if (st.isDirectory()) results = results.concat(walk(fp));
      else if (f.endsWith('.tsx') || f.endsWith('.ts')) results.push(fp);
    } catch(e) {}
  });
  return results;
}

const files = walk('apps/saas');
const results = { clientBare: [], clientBrowser: [], serverBare: [], serverBrowser: [] };

files.forEach(f => {
  const c = fs.readFileSync(f, 'utf8');
  if (!c.includes('takeasygo/business')) return;
  
  const hasUseClient = c.includes("'use client'");
  const hasBrowser = c.includes("@takeasygo/business/browser");
  const hasBare = /from\s+['"]@takeasygo\/business['"]/.test(c);
  
  if (hasUseClient && hasBare) results.clientBare.push(f);
  if (hasUseClient && hasBrowser) results.clientBrowser.push(f);
  if (!hasUseClient && hasBare) results.serverBare.push(f);
  if (!hasUseClient && hasBrowser) results.serverBrowser.push(f);
});

console.log('=== CLIENT + BARE (BROKEN - will hit node:crypto) ===');
results.clientBare.forEach(f => console.log('  ', f));
console.log('  Count:', results.clientBare.length);

console.log('\n=== CLIENT + /browser (CORRECT) ===');
console.log('  Count:', results.clientBrowser.length);

console.log('\n=== SERVER + BARE (OK - runs on Node.js) ===');
console.log('  Count:', results.serverBare.length);

console.log('\n=== SERVER + /browser (OK but unusual) ===');
results.serverBrowser.forEach(f => console.log('  ', f));
console.log('  Count:', results.serverBrowser.length);
