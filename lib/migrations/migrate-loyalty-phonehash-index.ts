import { connectDB } from '@/lib/mongoose'
import mongoose from 'mongoose'

export async function migrateLoyaltyPhoneHashIndex() {
  try {
    await connectDB()

    const db = mongoose.connection.db!
    const collection = db.collection('loyaltymembers')

    console.log('🔄 Dropping old index tenantId_1_phoneHash_1...')

    try {
      await collection.dropIndex('tenantId_1_phoneHash_1')
      console.log('✅ Old index dropped')
    } catch (e: any) {
      if (e?.code === 27) {
        console.log('ℹ️  Old index not found (already dropped or never existed)')
      } else {
        throw e
      }
    }

    console.log('🔄 Creating new index with partialFilterExpression...')

    await collection.createIndex(
      { tenantId: 1, phoneHash: 1 },
      {
        unique: true,
        partialFilterExpression: { phoneHash: { $type: 'string', $gt: '' } },
      }
    )

    console.log('✅ New index created successfully')

    // Verify
    const indexes = await collection.indexes()
    const newIndex = indexes.find(
      (i: any) => i.key?.tenantId === 1 && i.key?.phoneHash === 1
    )
    if (newIndex) {
      console.log('📋 Index verified:', JSON.stringify(newIndex, null, 2))
    }

  } catch (error) {
    console.error('❌ Migration failed:', error)
    throw error
  }
}

if (require.main === module) {
  migrateLoyaltyPhoneHashIndex()
    .then(() => process.exit(0))
    .catch(() => process.exit(1))
}
