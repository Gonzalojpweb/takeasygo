import NewTenantForm from '@/components/superadmin/NewTenantForm'

export default function NewTenantPage() {
  return (
    <div className="max-w-lg">
      <h1 className="text-white text-2xl font-bold mb-6">Nuevo Tenant</h1>
      <NewTenantForm />
    </div>
  )
}