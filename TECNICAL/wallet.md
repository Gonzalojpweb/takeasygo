# Estrategia de Implementación: Billeteras Digitales (Google & Apple Wallet)

Este documento detalla el plan técnico, arquitectura y recomendaciones para integrar el **Club de Fidelización** de TakeasyGO con las billeteras digitales líderes.

---

## 🎯 Objetivo
Permitir que los miembros del club tengan su tarjeta de fidelización digital en su teléfono, con actualización automática de puntos y notificaciones de beneficios, manteniendo la identidad visual de cada restaurante (tenant).

---

## 📱 Flujo del Usuario

1.  **Registro/Login**: El cliente se une al club desde la web del tenant.
2.  **Instalación**: Se muestran los botones oficiales "Add to Apple Wallet" y "Add to Google Wallet".
3.  **Generación de Pase**:
    *   **iOS**: Se genera un archivo `.pkpass` firmado dinámicamente.
    *   **Android**: Se genera un objeto en la API de Google Wallet vinculado a la cuenta del usuario.
4.  **Uso**: El cliente muestra el código QR/Code128 en el local para que el staff lo escanee.
5.  **Sincronización**: Al realizar una compra, los puntos se actualizan en la base de datos de TakeasyGO y se "pushea" la actualización a la billetera en tiempo real.

---

## 🛠️ Arquitectura Técnica

### 1. Google Wallet (Google Wallet API)
Google utiliza un modelo de **Clase** (Plantilla) y **Objeto** (Instancia del usuario).

*   **Configuración SaaS**: 
    *   TakeasyGO actúa como el **Issuer** (Emisor) principal.
    *   Creamos una `LoyaltyClass` por cada **Tenant**. Esto permite que cada restaurante tenga su propio logo, color de fondo y textos descriptivos.
*   **Integración**:
    *   Uso de `google-auth-library` para autenticación por Service Account.
    *   Generación de JWT firmados para los botones de "Añadir".
*   **Actualización**: Se utiliza el método `loyaltyobject.patch` para actualizar el balance de puntos.

### 2. Apple Wallet (PassKit)
Apple utiliza paquetes `.pkpass` (archivos ZIP firmados con certificados de Apple).

*   **Desafío Multi-tenant**: Si todos los tenants comparten el mismo `passTypeIdentifier`, Apple Wallet los "apila" (stacking), lo cual es confuso para el usuario si tiene tarjetas de varios restaurantes TakeasyGO.
*   **Recomendación**: 
    *   **Ideal**: Cada tenant provee su propio `Certificado de Pass Type ID` desde su cuenta de Apple Developer (Plan Premium).
    *   **Simplificado**: TakeasyGO usa un solo certificado pero genera dinámicamente el contenido visual. *Nota: Apple puede rechazar esto si la marca del pase no coincide con el emisor del certificado.*
*   **Actualización**: 
    *   Requiere un **Web Service API** implementado en nuestro backend (siguiendo el [protocolo de Apple](https://developer.apple.com/documentation/walletpasses/getting_started_with_passkit/library/restful_web_service)).
    *   Uso de **APNs** (Apple Push Notification service) para avisar al iPhone que hay una actualización disponible.

---

## 📊 Modelo de Datos (Extensión)

### `Tenant` (Nuevos campos en `loyaltyConfig`)
```typescript
{
  wallet: {
    enabled: boolean;
    primaryColor: string; // Hex para la tarjeta
    labelColor: string;
    logoUrl: string;
    heroImageUrl: string;
    // Específico para Apple (si tienen cuenta propia)
    applePassTypeIdentifier?: string;
    appleTeamIdentifier?: string;
  }
}
```

### `LoyaltyMember` (Nuevos campos)
```typescript
{
  wallet: {
    googleObjectId?: string;
    appleDeviceLibraryIdentifier?: string;
    pushToken?: string;
  }
}
```

---

## 🚀 Plan de Implementación

### Fase 1: Infraestructura (Backend)
- [ ] Configurar Google Cloud Console y obtener Issuer ID.
- [ ] Configurar Apple Developer Program y certificados de firma.
- [ ] Implementar el servicio `WalletGenerator`: Lógica para empaquetar `.pkpass` y generar JWT de Google.

### Fase 2: Sincronización
- [ ] Implementar Apple Wallet Web Service (endpoints de registro, obtención de pases y logs).
- [ ] Crear el worker `WalletSyncWorker`: Al detectar cambio de puntos en DB, dispara la actualización a Google API y envía Push a Apple.

### Fase 3: UI de Usuario
- [ ] Agregar botones de "Añadir a Billetera" en el dashboard del cliente.
- [ ] Generación de códigos QR únicos que contengan el `memberId`.

---

## 💡 Recomendaciones y Sugerencias de Antigravity

1.  **Geocercas (Geofencing)**: Sugiero configurar hasta 10 ubicaciones (lat/long) en el pase de Apple. Cuando el cliente pase cerca de la sucursal, la tarjeta **aparecerá automáticamente en su pantalla de bloqueo**. Esto aumenta drásticamente el uso del club.
2.  **Notificaciones de Proximidad**: Enviar un mensaje sutil como "Tenés 500 puntos para canjear en [Nombre Local]" cuando el cliente entra al radio del restaurante.
3.  **Seguridad**: No usar el ID de base de datos directamente en el QR. Usar un `public_id` o un token firmado con expiración corta para evitar fraude (capturas de pantalla de otros usuarios).
4.  **Estrategia de Certificados**: Para Apple, recomiendo empezar con un certificado de TakeasyGO. Si un restaurante Premium quiere "Marca Blanca" total, permitirle cargar su propio certificado en el panel admin.
5.  **Fallbacks**: Siempre tener una versión web de la "Tarjeta Digital" para usuarios que no usen billeteras o tengan dispositivos no compatibles.

---
> **Estado**: Planificación inicial. Listo para revisión de arquitectura.
