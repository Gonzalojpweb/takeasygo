const mongoose = require('mongoose');

const MONGO_URI = 'mongodb+srv://pgonzalojose_db_user:6oXEemLauaEuPoaq@takeasygo.ssjlhfw.mongodb.net/?appName=takeasygo';

async function run() {
  await mongoose.connect(MONGO_URI);
  const db = mongoose.connection.db;

  // 1. Find Chopisburger tenant
  const tenant = await db.collection('tenants').findOne({ slug: 'chopisburger' });
  if (!tenant) {
    // Try by ID from production response
    const tenantById = await db.collection('tenants').findOne({ _id: new mongoose.Types.ObjectId('6a3145ee8bee91bc4d85dcaa') });
    if (!tenantById) {
      console.log('ERROR: Tenant not found by slug or ID');
      process.exit(1);
    }
    console.log('Found by ID:', tenantById._id.toString(), tenantById.name, tenantById.slug);
    var tenantId = tenantById._id;
  } else {
    console.log('Found by slug:', tenant._id.toString(), tenant.name, tenant.slug);
    var tenantId = tenant._id;
  }

  // 2. Get current time in Buenos Aires for window calculation
  const now = new Date();
  const bueTime = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Argentina/Buenos_Aires',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(now);
  const [currentH, currentM] = bueTime.split(':').map(Number);
  const currentMinutes = currentH * 60 + currentM;

  // Window 1: INSIDE (current time to +2 hours)
  const startMinutes1 = currentMinutes;
  const endMinutes1 = currentMinutes + 120;
  const startH1 = Math.floor(startMinutes1 / 60).toString().padStart(2, '0');
  const startM1 = (startMinutes1 % 60).toString().padStart(2, '0');
  const endH1 = Math.floor(endMinutes1 / 60).toString().padStart(2, '0');
  const endM1 = (endMinutes1 % 60).toString().padStart(2, '0');

  // Window 2: OUTSIDE (ended 1 hour ago)
  const startMinutes2 = currentMinutes - 180;
  const endMinutes2 = currentMinutes - 60;
  const startH2 = Math.floor(startMinutes2 / 60).toString().padStart(2, '0');
  const startM2 = (startMinutes2 % 60).toString().padStart(2, '0');
  const endH2 = Math.floor(endMinutes2 / 60).toString().padStart(2, '0');
  const endM2 = (endMinutes2 % 60).toString().padStart(2, '0');

  console.log(`\nCurrent Buenos Aires time: ${bueTime} (${currentMinutes} minutes)`);
  console.log(`Window 1 (INSIDE):  ${startH1}:${startM1} - ${endH1}:${endM1}`);
  console.log(`Window 2 (OUTSIDE): ${startH2}:${startM2} - ${endH2}:${endM2}`);

  // 3. Create Promo 1: INSIDE window
  const promo1 = await db.collection('promotions').insertOne({
    tenantId: tenantId,
    scope: 'tenant',
    type: 'info',
    title: 'TEST INSIDE Window - Borrar',
    description: 'Promo de prueba - ventana horaria activa',
    shortDescription: 'Test inside',
    imageUrl: '',
    price: 0,
    originalPrice: null,
    currency: 'USD',
    conditions: '',
    details: '',
    ctaText: '',
    ctaLink: '',
    visibility: 'both',
    isActive: true,
    isFeatured: false,
    scheduledStart: null,
    scheduledEnd: null,
    activeTimeStart: `${startH1}:${startM1}`,
    activeTimeEnd: `${endH1}:${endM1}`,
    customStyles: {},
    maxRedemptions: null,
    redemptionsCount: 0,
    sortOrder: 999,
    linkedCategoryIds: [],
    linkedItemIds: [],
    overrideCustomizationGroups: [],
    linkedItemVariantFilters: [],
    allowCustomization: true,
    createdAt: now,
    updatedAt: now,
  });
  console.log(`\nPromo 1 (INSIDE):  ${promo1.insertedId}`);

  // 4. Create Promo 2: OUTSIDE window
  const promo2 = await db.collection('promotions').insertOne({
    tenantId: tenantId,
    scope: 'tenant',
    type: 'sale',
    title: 'TEST OUTSIDE Window - Borrar',
    description: 'Promo de prueba - ventana horaria expirada',
    shortDescription: 'Test outside',
    imageUrl: '',
    price: 1000,
    originalPrice: 2000,
    currency: 'USD',
    conditions: '',
    details: '',
    ctaText: '',
    ctaLink: '',
    visibility: 'both',
    isActive: true,
    isFeatured: false,
    scheduledStart: null,
    scheduledEnd: null,
    activeTimeStart: `${startH2}:${startM2}`,
    activeTimeEnd: `${endH2}:${endM2}`,
    customStyles: {},
    maxRedemptions: null,
    redemptionsCount: 0,
    sortOrder: 998,
    linkedCategoryIds: [],
    linkedItemIds: [],
    overrideCustomizationGroups: [],
    linkedItemVariantFilters: [],
    allowCustomization: true,
    createdAt: now,
    updatedAt: now,
  });
  console.log(`Promo 2 (OUTSIDE): ${promo2.insertedId}`);

  console.log(`\n--- DELETION COMMAND ---`);
  console.log(`To delete after testing, run:`);
  console.log(`node scripts/delete-test-promos.js ${promo1.insertedId} ${promo2.insertedId}`);

  mongoose.disconnect();
}

run().catch(e => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
