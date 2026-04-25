# Plan Maestro de Interfaz de Red (Consumidor)

Este documento detalla el rediseño de la experiencia del cliente final en la ruta `/explore` y toda la red de TakeasyGO.

## 1. Identidad Visual y Marca
- **Color Primario**: `#f74211` (Naranja Takeasy).
- **Estética**: Limpia, profesional, mobile-first. Basada en estándares de Uber Eats.

## 2. Flujo de Usuario y Pantallas

### A. Pantalla de Carga (Splash Screen)
- **Fondo**: Sólido `#f74211`.
- **Contenido**: Logo central animado (sutil pulso o entrada).
- **Transición**: Desvanecimiento suave hacia la siguiente pantalla.

### B. Registro / Inicio de Sesión
- **Estética**: Inspirada en Uber Eats (ver referencias).
- **Opciones**:
    - Continuar con Apple.
    - Continuar con Google.
    - Continuar con Email.
- **Campos**: Selección de región/teléfono opcional para futuras integraciones.

### C. Onboarding Dinámico ("Stories" Style)
- **Formato**: Carrusel de 4 tarjetas con barra de progreso superior al estilo Instagram/Visa.
- **Contenido del Paso a Paso**:
    1. **Descubrimiento**: "Encuentra los restaurantes más cercanos a tu ubicación que ofrecen Takeaway."
    2. **Tiempos Reales**: "Conoce los tiempos estimados de preparación y retiro en tiempo real."
    3. **Compra Directa**: "Realiza tu compra directamente desde el menú digital del restaurante, sin intermediarios."
    4. **Notificaciones**: "Recibe una alerta cuando tu pedido esté listo para retirar. ¡Sin esperas!"

### D. Navegación Principal (Bottom Nav)
- **Estructura**:
    1. **Inicio**: Home del explore.
    2. **Mapa**: Vista geográfica de locales.
    3. **Explorar (Centro)**: Botón destacado circular que sobresale del nav, ícono de brújula.
    4. **Restós**: Listado/Buscador de restaurantes.
    5. **Perfil**: Gestión de usuario, favoritos e historial.
- **Diseño**: Fondo blanco/vidrio, íconos minimalistas, label debajo de cada ícono.

## 3. Requerimientos Técnicos
- Utilizar componentes de `@/components/ui` para máxima consistencia.
- Implementar animaciones con `framer-motion` o `gsap`.
- Asegurar compatibilidad total con dispositivos móviles (PWA ready).

---
*Documento creado para alineación de agentes de IA y desarrolladores.*
