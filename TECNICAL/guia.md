# Guía de Integración POS — Paso a Paso para el Administrador

Esta guía te ayudará a conectar TakeasyGO con tu sistema POS (**FUDO** o **BISTROSOFT**) para que los pedidos lleguen automáticamente a tu cocina.

---

## 📋 Requisitos Previos

1.  **Cuenta en FUDO**: Debes tener acceso administrativo a tu panel de FUDO.
2.  **Menú Cargado**: Asegúrate de que tus productos en TakeasyGO coincidan o sean similares a los de tu POS para facilitar el mapeo.

---

## 🚀 Paso 1: Obtener Credenciales en FUDO

1.  Inicia sesión en tu panel de **FUDO**.
2.  Ve a **Administración** → **Aplicaciones Externas**.
3.  Haz clic en **"Nueva Aplicación"**.
4.  Nombre de la aplicación: `TakeasyGO`.
5.  **Copia estos 3 datos** (los necesitarás en el paso siguiente):
    *   `Client ID`
    *   `Client Secret`
    *   `Webhook Secret` (Este se genera cuando guardas la aplicación).

> [!IMPORTANT]
> **Configura el Webhook en FUDO**:
> En el campo "URL de Webhook" de FUDO, pega la siguiente dirección:
> `https://takeasygo.com/api/webhooks/pos/[TU-SLUG]`
> *(Reemplaza `[TU-SLUG]` por el nombre de tu restaurante en la URL de TakeasyGO)*.

---

## ⚙️ Paso 2: Configurar TakeasyGO

1.  Entra a tu panel de **Administración de TakeasyGO**.
2.  Ve a **Configuración** → **Integración POS**.
3.  En **Sistema POS**, selecciona **FUDO**.
4.  Activa el switch **"Activar integración"**.
5.  Pega el `Client ID`, `Client Secret` y `Webhook Secret` en los campos correspondientes.
6.  Haz clic en **"Guardar Configuración"**.
7.  Presiona el botón **"Probar Conexión"**.
    *   Si ves un mensaje de **"Conexión exitosa"** ✅, ¡ya están conectados!

---

## 🔗 Paso 3: Mapeo de Productos (Vital)

Para que el POS sepa qué producto se vendió, debemos vincularlos:

1.  En la misma pantalla de Integración POS, haz clic en **"Sincronizar Catálogo POS"**.
2.  Verás una tabla con tus productos de TakeasyGO a la izquierda.
3.  A la derecha, usa el menú desplegable para seleccionar el producto correspondiente en FUDO.
4.  Al terminar, haz clic en **"Guardar Mapeo"**.

> [!TIP]
> **¿Qué pasa si no mapeo un producto?**
> TakeasyGO enviará el nombre del producto al POS. Si el nombre coincide exactamente en FUDO, funcionará, pero es mucho más seguro usar el mapeo por ID.

---

## 🔑 Paso 4: API Keys Externas (Opcional)

Si usas una pantalla de cocina personalizada o una aplicación externa, puedes generar una **API Key** al final de la página de configuración:
1.  Ponle un nombre (ej: "Pantalla Cocina").
2.  Haz clic en **"+"**.
3.  **Copia la llave inmediatamente**, ya que por seguridad no se volverá a mostrar.

---

## ✅ ¡Listo!

A partir de ahora:
1.  El cliente hace un pedido y paga.
2.  **TakeasyGO envía el pedido a FUDO automáticamente.**
3.  Tu cocina recibe el ticket en el POS de siempre.
4.  Cuando marcas el pedido como **"Listo"** en FUDO, el cliente recibe una notificación automática de TakeasyGO.

---
*Para soporte técnico adicional, contacta a soporte@takeasygo.com*


*************************
¡Excelente pregunta! Esos datos no te los da TakeasyGO, sino que los genera FUDO para permitir que TakeasyGO "hable" con tu sistema.

Aquí te detallo exactamente de dónde sacarlos dentro de tu panel de FUDO (asegurate de tener el Plan Pro o superior en FUDO, ya que es el que habilita la API):

🔑 Paso a paso en FUDO:
Entrá a FUDO: Iniciá sesión en app.fu.do.
Sección de Integraciones: En el menú de la izquierda, buscá Administración (o el ícono de engranaje) y luego hacé clic en Aplicaciones Externas (o a veces simplemente dice Integraciones > API).
Generar Nueva Aplicación:
Hacé clic en el botón de "Nueva Aplicación" o "Añadir Vínculo".
Nombre: Poné TakeasyGO (esto es solo para que vos sepas qué es).
Obtener las llaves:
Una vez creada, FUDO te mostrará el Client ID y el Client Secret.
¡Importante!: Copiá el Client Secret y guardalo en un lugar seguro, porque FUDO no te lo vuelve a mostrar por seguridad después de que salís de esa pantalla.
Webhook Secret:
Dentro de esa misma configuración de la aplicación en FUDO, vas a ver un campo para URL de Webhook.
Pegá la URL que te da TakeasyGO ahí.
Al guardar los cambios, FUDO te va a generar el Webhook Secret.
TIP

Si no encontrás la opción "Aplicaciones Externas" en tu menú de FUDO, es probable que necesites solicitar a su soporte técnico que te activen el módulo de "API de inyección de pedidos" (que actualmente está en fase Beta pero muy estable).

¿Pudiste encontrar esa sección en tu panel de FUDO? Si te aparece algo distinto, avisame y lo revisamos.
