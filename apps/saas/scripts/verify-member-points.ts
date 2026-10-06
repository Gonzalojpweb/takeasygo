import mongoose from 'mongoose'
import * as fs from 'fs'
import * as path from 'path'

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://pgonzalojose_db_user:6oXEemLauaEuPoaq@takeasygo.ssjlhfw.mongodb.net/?appName=takeasygo'
const TENANT_ID = '69f8bf6ad3fcc97fd64bec87'

async function connect() {
  await mongoose.connect(MONGODB_URI, { bufferCommands: false, maxPoolSize: 5 })
  console.log('✅ Connected to MongoDB')
}

async function disconnect() {
  await mongoose.disconnect()
  console.log('✅ Disconnected from MongoDB')
}

async function checkMemberPoints() {
  console.log('\n🔍 VERIFICANDO PUNTOS DE MIEMBROS')
  console.log('='.repeat(70))
  
  await connect()
  
  const db = mongoose.connection.db!
  
  const members = await db.collection('loyaltymembers')
    .find({ tenantId: new mongoose.Types.ObjectId(TENANT_ID) })
    .toArray()
  
  console.log(`\nTotal miembros: ${members.length}`)
  
  const pointsDistribution = members.map((m: any) => ({
    memberId: m._id,
    phoneHash: m.phoneHash,
    points: m.loyalty?.points || 0,
    tier: m.loyalty?.tier,
    cache: m.cache
  }))
  
  const withPoints = pointsDistribution.filter(m => m.points > 0)
  const withoutPoints = pointsDistribution.filter(m => m.points === 0)
  
  console.log(`Con puntos: ${withPoints.length}`)
  console.log(`Sin puntos: ${withoutPoints.length}`)
  
  if (withPoints.length > 0) {
    const points = withPoints.map(m => m.points)
    points.sort((a, b) => a - b)
    
    console.log(`\nEstadísticas de puntos:`)
    console.log(`  Mínimo: ${points[0]}`)
    console.log(`  Máximo: ${points[points.length - 1]}`)
    console.log(`  Promedio: ${points.reduce((sum, p) => sum + p, 0) / points.length}`)
    console.log(`  Mediana: ${points[Math.floor(points.length / 2)]}`)
    
    console.log(`\nTop 10 miembros por puntos:`)
    withPoints.sort((a, b) => b.points - a.points).slice(0, 10).forEach(m => {
      console.log(`  ${m.phoneHash}: ${m.points} pts`)
    })
  }
  
  const outputPath = path.join(__dirname, '../reward-intelligence-data-keke-larry/member_points_verification.json')
  fs.writeFileSync(outputPath, JSON.stringify(pointsDistribution, null, 2))
  
  console.log(`\n✅ Datos guardados en: ${outputPath}`)
  
  await disconnect()
}

checkMemberPoints().catch(console.error)
