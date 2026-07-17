import { Toaster } from '@/components/ui/sonner'
import PoweredByTakeasy from '@/components/PoweredByTakeasy'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import AdminSidebar from '@/components/admin/AdminSidebar'
import DesktopSidebar from '@/components/admin/DesktopSidebar'
import AdminPWAProvider from '@/components/admin/AdminPWAProvider'
import AdminPushBanner from '@/components/admin/AdminPushBanner'
import { SystemAnnouncementBanner } from '@/components/admin/SystemAnnouncementBanner'
import MobileNav from '@/components/MobileNav'
import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import { canAccess, type Plan } from '@/lib/plans'
import type { Metadata } from 'next'
import mongoose from 'mongoose'
import SystemAnnouncement from '@/models/SystemAnnouncement'

interface AdminLayoutProps {
  children: React.ReactNode
  params: Promise<{ tenant: string }>
}

export async function generateMetadata({ params }: AdminLayoutProps): Promise<Metadata> {
  const { tenant: tenantSlug } = await params
  await connectDB()

  const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true }).lean() as any
  if (!tenant) return {}

  const name: string = tenant.name || 'Admin'
  const branding = tenant.branding || {}
  const primaryColor = branding.primaryColor || '#f74211'

  return {
    title: name,
    manifest: `/${tenantSlug}/admin/manifest.json`,
    appleWebApp: {
      capable: true,
      title: name,
      statusBarStyle: 'black-translucent',
    },
    other: {
      'mobile-web-app-capable': 'yes',
      'msapplication-TileColor': primaryColor,
      'theme-color': primaryColor,
    },
  }
}

export default async function AdminLayout({
  children,
  params,
}: AdminLayoutProps) {
  const { tenant } = await params
  const session = await auth()

  if (!session?.user) {
    redirect('/login')
  }

  const isSuperadmin = session.user.role === 'superadmin'
  const isOwnerOfTenant = session.user.tenantSlug === tenant

  if (!isSuperadmin && !isOwnerOfTenant) {
    redirect('/login')
  }

  await connectDB()
  const tenantDoc = await Tenant.findOne({ slug: tenant, isActive: true })
    .select('plan business.enabled features.crm.enabled branding.primaryColor branding.backgroundColor branding.textColor branding.logoUrl')
    .lean() as any
  const plan: Plan = tenantDoc?.plan ?? 'try'
  const businessEnabled = tenantDoc?.business?.enabled ?? false
  const crmEnabled = tenantDoc?.features?.crm?.enabled ?? false

  const branding = tenantDoc?.branding || {}
  const primaryColor = branding.primaryColor || '#f74211'
  const bgColor = branding.backgroundColor || '#ffffff'
  const textColor = branding.textColor || '#1a1a1a'
  const tenantId = tenantDoc?._id?.toString()

  // Determine if tenant operates in dine-in only mode (no takeaway at any location)
  let dineInOnly = false
  let sidebarLocations: { _id: string; name: string }[] = []
  if (tenantDoc) {
    const [hasAny, hasTakeaway, locs] = await Promise.all([
      Location.exists({ tenantId: tenantDoc._id, isActive: true }),
      Location.exists({ tenantId: tenantDoc._id, isActive: true, 'settings.orderModes': 'takeaway' }),
      Location.find({ tenantId: tenantDoc._id, isActive: true }).select('name').lean(),
    ])
    dineInOnly = !!hasAny && !hasTakeaway
    sidebarLocations = (locs as any[]).map(l => ({
      _id: l._id.toString(),
      name: l.name,
    }))
  }

  // Count unread announcements for this user
  let unreadAnnouncements = 0
  if (session.user.id) {
    const userId = new mongoose.Types.ObjectId(session.user.id)
    unreadAnnouncements = await SystemAnnouncement.countDocuments({
      status: 'published',
      $or: [{ targetPlans: { $size: 0 } }, { targetPlans: plan }],
      readBy: { $ne: userId }
    })
  }

  const sidebarProps = {
    tenantSlug: tenant,
    userRole: session.user.role ?? 'staff',
    userName: session.user.name ?? session.user.email ?? '',
    plan,
    dineInOnly,
    unreadAnnouncements,
    businessEnabled,
    crmEnabled,
    assignedLocations: session.user.assignedLocations ?? [],
    locations: sidebarLocations,
  }

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Desktop Sidebar — Fixed overlay, does not push workspace */}
      <DesktopSidebar {...sidebarProps} />

      <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden relative z-20">
        {/* Mobile Header */}
        <MobileNav>
          <AdminSidebar {...sidebarProps} />
        </MobileNav>

        {/* Main Content */}
        <main className="flex-1 min-h-0 overflow-hidden bg-background flex flex-col" data-lenis-prevent>
          {tenantId && canAccess(plan, 'adminPushNotifications') && <AdminPushBanner tenantId={tenantId} />}
          <div className="flex-1 min-h-0 overflow-y-auto p-4 md:p-8 lg:p-10">
            <div className="w-full">
              {children}
            </div>
          </div>
          {/* Footer — stays at bottom, doesn't eat into board space */}
          <div className="shrink-0 py-3 border-t border-border/40 flex justify-center">
            <PoweredByTakeasy variant="light" label="network" />
          </div>
        </main>
      </div>
      {tenantDoc && (
        <AdminPWAProvider
          primaryColor={primaryColor}
          bgColor={bgColor}
          textColor={textColor}
          manifestUrl={`/${tenant}/admin/manifest.json`}
        />
      )}
      <Toaster />
      <SystemAnnouncementBanner tenantSlug={tenant} />
    </div>
  )
}
