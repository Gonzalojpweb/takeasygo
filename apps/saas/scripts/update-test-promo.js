const mongoose = require('mongoose');
const MONGO_URI = 'mongodb+srv://pgonzalojose_db_user:6oXEemLauaEuPoaq@takeasygo.ssjlhfw.mongodb.net/?appName=takeasygo';

async function run() {
  await mongoose.connect(MONGO_URI);
  const db = mongoose.connection.db;

  // Update OUTSIDE promo type to 'announcement' (unique type not in any other promo)
  const r = await db.collection('promotions').updateOne(
    { _id: new mongoose.Types.ObjectId('6a61819b9a741ec405546424') },
    { $set: { type: 'announcement' } }
  );
  console.log('Updated OUTSIDE promo type to announcement:', r.modifiedCount);

  // Verify
  const promo = await db.collection('promotions').findOne({ _id: new mongoose.Types.ObjectId('6a61819b9a741ec405546424') });
  console.log('Verified type:', promo.type, '| title:', promo.title);

  mongoose.disconnect();
}

run().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
