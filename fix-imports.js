const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(f => {
    const fp = path.join(dir, f);
    const st = fs.statSync(fp);
    if (st.isDirectory()) {
      results = results.concat(walk(fp));
    } else if (f.endsWith('.tsx') || f.endsWith('.ts')) {
      results.push(fp);
    }
  });
  return results;
}

const root = 'apps/saas';
const files = walk(root);
let count = 0;

files.forEach(f => {
  let c = fs.readFileSync(f, 'utf8');
  if (c.includes("'use client'") && c.includes("from '@takeasygo/business'")) {
    c = c.replace(/from '@takeasygo\/business'/g, "from '@takeasygo/business/browser'");
    fs.writeFileSync(f, c);
    count++;
    console.log(f);
  }
});

console.log('\nTotal files updated:', count);
