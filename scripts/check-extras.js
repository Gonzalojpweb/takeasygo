const mongoose = require('mongoose');
const uri = 'mongodb+srv://pgonzalojose_db_user:6oXEemLauaEuPoaq@takeasygo.ssjlhfw.mongodb.net/?appName=takeasygo';

(async () => {
  await mongoose.connect(uri, { dbName: 'test' });
  const Menu = mongoose.model('Menu', new mongoose.Schema({}, { strict: false }));

  const menus = await Menu.find({}).lean();
  console.log('Total menus:', menus.length);

  let foundAny = false;
  for (const menu of menus) {
    for (const cat of (menu.categories || [])) {
      // Check category-level customization groups
      for (const g of (cat.customizationGroups || [])) {
        const withPrice = (g.options || []).filter(o => o.extraPrice > 0);
        if (withPrice.length > 0) {
          foundAny = true;
          console.log('[CAT] ' + (menu.tenantId || '') + ' > ' + cat.name + ' > ' + g.name + ' (' + (g.priceRule || 'sum') + '):');
          for (const o of withPrice) {
            console.log('  ' + o.name + ': +$' + o.extraPrice);
          }
        }
      }

      for (const item of (cat.items || [])) {
        // Check item-level customization groups
        const groups = item.customizationGroups || [];
        for (const g of groups) {
          const withPrice = (g.options || []).filter(o => o.extraPrice > 0);
          if (withPrice.length > 0) {
            foundAny = true;
            console.log('[ITEM] ' + item.name + ' > ' + g.name + ' (' + (g.priceRule || 'sum') + '):');
            for (const o of withPrice) {
              console.log('  ' + o.name + ': +$' + o.extraPrice);
            }
          }
          // Check subGroups
          for (const opt of (g.options || [])) {
            for (const sg of (opt.subGroups || [])) {
              const subWithPrice = (sg.options || []).filter(o => o.extraPrice > 0);
              if (subWithPrice.length > 0) {
                foundAny = true;
                console.log('[ITEM-SUB] ' + item.name + ' > ' + g.name + ' > ' + opt.name + ' > ' + sg.name + ':');
                for (const o of subWithPrice) {
                  console.log('  ' + o.name + ': +$' + o.extraPrice);
                }
              }
            }
          }
        }

        // Check variant-level customization groups
        for (const v of (item.variants || [])) {
          for (const g of (v.customizationGroups || [])) {
            const withPrice = (g.options || []).filter(o => o.extraPrice > 0);
            if (withPrice.length > 0) {
              foundAny = true;
              console.log('[VAR] ' + item.name + ' > ' + v.name + ' > ' + g.name + ' (' + (g.priceRule || 'sum') + '):');
              for (const o of withPrice) {
                console.log('  ' + o.name + ': +$' + o.extraPrice);
              }
            }
          }
        }
      }

      // Check subcategory-level groups
      for (const sub of (cat.subcategories || [])) {
        for (const g of (sub.customizationGroups || [])) {
          const withPrice = (g.options || []).filter(o => o.extraPrice > 0);
          if (withPrice.length > 0) {
            foundAny = true;
            console.log('[SUB] ' + sub.name + ' > ' + g.name + ':');
            for (const o of withPrice) {
              console.log('  ' + o.name + ': +$' + o.extraPrice);
            }
          }
        }
      }
    }
  }

  if (!foundAny) {
    console.log('NO customization options with extraPrice > 0 found in ANY menu');
  }

  process.exit();
})();
