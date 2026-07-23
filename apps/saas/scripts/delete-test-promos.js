const mongoose = require('mongoose');

const MONGO_URI = 'mongodb+srv://pgonzalojose_db_user:6oXEemLauaEuPoaq@takeasygo.ssjlhfw.mongodb.net/?appName=takeasygo';

async function run() {
  const ids = process.argv.slice(2);
  if (ids.length === 0) {
    console.log('Usage: node delete-test-promos.js <id1> <id2> ...');
    process.exit(1);
  }

  await mongoose.connect(MONGO_URI);
  const db = mongoose.connection.db;

  const objectIds = ids.map(id => new mongoose.Types.ObjectId(id));
  const result = await db.collection('promotions').deleteMany({ _id: { $in: objectIds } });

  console.log(`Deleted ${result.deletedCount} test promotions`);
  mongoose.disconnect();
}

run().catch(e => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
