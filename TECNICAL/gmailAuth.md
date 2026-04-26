Gmail Auth Premium & Consumer Profile
Hemos implementado un sistema de autenticación de alta gama para que los consumidores de TakeasyGO puedan acceder a su perfil con un solo clic usando Google.

🚀 Innovaciones Implementadas
1. Registro Invisible (Zero Friction)
Implementamos una lógica en los callbacks de NextAuth que detecta si el usuario es nuevo. Si entra por Google y no está en nuestra base de datos, el sistema le crea un perfil de consumer instantáneamente, sincronizando su nombre, email y foto de perfil.

2. Interfaz "App-Like" Premium
La nueva vista de /explore/profile sigue la línea Dark Premium del resto de la app:

Efectos Visuales: Uso de BorderBeam para marcar el contorno del perfil con luz dinámica.
Micro-interacciones: Botón de inicio de sesión con efecto shimmer para guiar el ojo del usuario.
Estados de Carga: Skeletons y spinners integrados para una transición fluida.
3. Modelo de Datos Extensible
El modelo de User ahora es más flexible, permitiendo la coexistencia de cuentas con contraseña (Staff/Admin) y cuentas sociales (Consumidores) sin conflictos de esquemas.

📁 Estructura de Archivos Afectados
User.ts
: Soporte para rol consumer e imágenes.
auth.ts
: Inyección del GoogleProvider.
auth.config.ts
: Lógica de auto-registro y persistencia de sesión.
profile/page.tsx
: El nuevo hub del usuario.
BottomNav.tsx
: Linkeado final de la navegación.
TIP

Al probarlo, recordá que como las variables de entorno están en .env.local, el servidor de Next.js se reiniciará automáticamente para tomarlas. El botón de Google redirigirá al flujo oficial de OAuth de Google.