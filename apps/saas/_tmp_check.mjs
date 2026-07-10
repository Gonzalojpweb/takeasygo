import { connectDB } from './lib/mongoose.js'
import PlatformConfig from './models/PlatformConfig.js'

async function main() {
  try {
    await connectDB()
    const pc = await PlatformConfig.findById('platform').lean()
    console.log(JSON.stringify({
      appId: pc?.mpOAuth?.appId,
      hasAppSecret: !!pc?.mpOAuth?.appSecret,
      redirectUri: pc?.mpOAuth?.redirectUri,
      platformFeePercent: pc?.mpOAuth?.platformFeePercent,
    }))
  } catch (err) {
    console.error('ERROR:', err?.message || err)
  }
  process.exit(0)
}
main()
