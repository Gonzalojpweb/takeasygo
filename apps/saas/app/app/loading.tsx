import PuntoTGO from '@/components/tgo/PuntoTGO'

export default function Loading() {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '100%',
      height: '100vh',
    }}>
      <PuntoTGO size="xl" expression="happy" />
    </div>
  )
}
