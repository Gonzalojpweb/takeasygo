const { connectDB } = require('./lib/mongoose')
const SystemAnnouncement = require('./models/SystemAnnouncement').default
const mongoose = require('mongoose')

async function createAnnouncement() {
  try {
    await connectDB()
    console.log('Conectado a la base de datos...')

    const announcement = new SystemAnnouncement({
      title: '🚀 ¡Nueva Función: Tienda de Canjes y Validación en Vivo!',
      type: 'feature',
      status: 'published',
      publishedAt: new Date(),
      targetPlans: ['premium'], // Esta feature es solo para Premium según lib/plans.ts
      content: `
# ¡La espera terminó! El Club de Fidelización ahora tiene Tienda.

Estamos muy emocionados de presentarte la evolución del **Club de Fidelización**. Ahora, tus clientes no solo acumulan puntos, ¡sino que pueden canjearlos por artículos exclusivos directamente desde tu propia tienda digital!

### 🛒 ¿Qué hay de nuevo?

*   **Tu Tienda de Recompensas**: Publicá comida, bebida, merch o experiencias con un costo en puntos. Tus clientes podrán asegurarlos desde su casa o el local.
*   **Control Total de Stock**: El sistema descuenta automáticamente los puntos y el stock al momento del canje.
*   **Validador de Canjes (Admin)**: Ingresá el código único del cliente en la nueva pestaña **"Validar Canje"** de tu panel para confirmar la entrega en segundos.

### 💡 Beneficios para tu comercio:

*   **Fidelización Activa**: Incentivá a tus clientes a volver para alcanzar ese premio que tanto quieren.
*   **Seguridad**: Códigos únicos y con fecha de expiración para evitar fraudes.
*   **Simplicidad**: Interfaz dedicada para el staff del local.

### 🛠️ ¿Cómo empezar?

Es muy fácil:
1. Andá a la sección **Tienda** en tu Panel de Administrador.
2. Cargá tus primeros artículos en la pestaña **Inventario**.
3. ¡Y listo! Tus clientes empezarán a ver los premios disponibles en su perfil del club.

*Equipo Takeasygo* 🚀
      `.trim()
    })

    await announcement.save()
    console.log('¡Anuncio creado y publicado con éxito!')
    process.exit(0)
  } catch (err) {
    console.error('Error al crear el anuncio:', err)
    process.exit(1)
  }
}

createAnnouncement()
