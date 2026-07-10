import { connectDB } from './apps/saas/lib/mongoose'
import PlatformConfig from './apps/saas/models/PlatformConfig'

async function main() {
  try {
    await connectDB()
    const pc = await PlatformConfig.findById('platform').lean() as any
    console.log(JSON.stringify({
      appId: pc?.mpOAuth?.appId,
      hasAppSecret: !!pc?.mpOAuth?.appSecret,
      redirectUri: pc?.mpOAuth?.redirectUri,
      platformFeePercent: pc?.mpOAuth?.platformFeePercent,
    }))
  } catch (err: any) {
    console.error('ERROR:', err?.message || err)
  }
  process.exit(0)
}
main()
