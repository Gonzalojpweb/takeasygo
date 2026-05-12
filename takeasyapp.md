# Plan de Implementación: Rediseño Premium de Takeasygo (Inicio / Explore)

Este documento detalla la transformación de la vista `/explore` en una pantalla de inicio (Home) de primer nivel, inspirada en las mejores prácticas de Rappi y PedidosYa, con un enfoque en la persistencia de datos y la integración milimétrica entre los Tenants y la plataforma global.

## 1. Arquitectura de Datos y Persistencia

### 1.1 Direcciones Guardadas (Japonesa Precisión)
Para lograr una experiencia personalizada, necesitamos persistir las ubicaciones del usuario.
- **Modelo `User`**: Se extenderá para incluir `savedAddresses`.
- **Estructura**:
  ```typescript
  savedAddresses: [{
    label: string; // "Casa", "Trabajo", "Gym"
    address: string;
    city: string;
    coordinates: { lat: number, lng: number };
    isDefault: boolean;
  }]
  ```
- **Fallback**: Si el usuario no está autenticado, se utilizará `localStorage` con la misma estructura para mantener la consistencia.

### 1.2 Agregación Global de Contenido
Crearemos un endpoint `/api/explore/home` que realice una agregación inteligente:
- **Filtro Geográfico**: Todo el contenido (Promociones, Canjes, Tenants) se filtrará por un radio de **20km** desde la dirección seleccionada.
- **Relaciones**:
  - `Promotion` -> Vinculado a `Tenant`.
  - `StoreItem` (Canjes) -> Vinculado a `LoyaltyConfig` del `Tenant`.
  - `MarketingQR` -> Extraído de `Tenant.qrPromo`.

---

## 2. Rediseño de Interfaz (UI/UX Pro Max)

### 2.1 Header Adaptativo y Selector de Ubicación
- **Sticky Header**: Fondo con glassmorphism (`backdrop-blur-xl`).
- **Selector**: Al hacer click, abre un Modal/Drawer premium para elegir entre direcciones guardadas o usar GPS.
- **Buscador Inteligente**: Input minimalista que busca por nombre de plato, local o **Categorías/Tags** (Pizza, Sushi, Burgers, etc.).

### 2.2 Hero Carousel: La Cuponera Global
- **Fuente**: `Promotion.find({ isActive: true, isFeatured: true })`.
- **Diseño**: Cards horizontales de gran formato con imágenes de alta calidad generadas/subidas por los tenants.
- **Acción**: Redirección directa al menú del tenant con el descuento pre-aplicado en el contexto.

### 2.3 Grid de Categorías e Iconografía
- Iconos minimalistas y coloridos para navegación rápida:
  - 🍕 Restaurantes
  - 🏷️ Ofertas (Marketing QR)
  - ☕ Café & Deli
  - 🍦 Helados
  - 🛍️ Canjes Club

### 2.4 Sección de Ofertas (Marketing QR)
- Carrusel de campañas configuradas en el Admin de cada tenant.
- Se muestran como "Ofertas Relámpago" o "Beneficios por Escaneo".

### 2.5 Componente de Canjes (Loyalty Showcase)
- **Objetivo**: Promocionar el Club de cada tenant.
- **Visual**: Cards que muestran el producto de canje (ej: "Burger Gratis") y los puntos necesarios.
- **Efecto**: Incentiva al usuario a unirse al club de sus locales favoritos.

---

## 3. Navegación Bottom (Tab Bar)

Se reestructurará el `BottomNav` para ser el centro de control:
1. **Inicio**: La nueva vista agregada (Home).
2. **Explorar**: Vista de mapa optimizada.
3. **Ofertas**: Filtro rápido de todas las promociones activas cercanas.
4. **Pedidos**: Historial y seguimiento en tiempo real.
5. **Perfil**: Gestión de direcciones, club y configuración.

---

## 4. Plan de Ejecución (Milimétrico)

### Fase 1: Core de Identidad (Día 1)
- [ ] Modificar `models/User.ts` para soportar `savedAddresses`.
- [ ] Crear API `api/user/addresses` (GET/POST/DELETE).
- [ ] Implementar el contexto de `LocationContext` en el frontend para manejar la persistencia entre Session/Local/DB.

### Fase 2: Motor de Agregación (Día 1-2)
- [ ] Crear el endpoint `api/explore/home`.
- [ ] Implementar lógica de búsqueda por categorías (Tags de Tenants).
- [ ] Optimizar queries con índices geoespaciales para asegurar carga en <200ms.

### Fase 3: UI Pro Max (Día 2-3)
- [ ] Construir el `HomeHeader` con selector de direcciones.
- [ ] Desarrollar los 3 carruseles dinámicos (Promos, Marketing, Canjes).
- [ ] Actualizar el `BottomNav` con la nueva iconografía y rutas.

### Fase 4: Pulido y Performance (Día 3)
- [ ] Implementar Skeleton Loaders para cada sección.
- [ ] Optimización de imágenes con `next/image` y WebP.
- [ ] Test de usabilidad en dispositivos móviles.

---

> **Nota del Artesano**: La clave del éxito será que cada sección se sienta nativa y rápida. No es solo un listado, es un escaparate de oportunidades para el usuario basado en su ubicación exacta.
