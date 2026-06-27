# Agente de Impresion TakeasyGo

## Requisitos
- [Node.js](https://nodejs.org) v18 o superior
- Windows 10/11 (para servicio como Windows Service)

## Instalacion Rapida

### 1. Configurar
Doble-click en **SETUP.bat** y segui las instrucciones:
- Ingresa el slug de tu restaurante (ej: `cero-cafe`)
- Selecciona la sede de la cual vas a imprimir pedidos
- El script busca las sedes automaticamente desde el servidor

### 2. Instalar como servicio (recomendado)
Doble-click en **INSTALAR_SERVICIO.bat**
- Se ejecuta como administrador
- Se registra como servicio de Windows
- Se inicia automaticamente al encender la PC
- Se reinicia si se cierra por error

### 3. O iniciar manualmente
Doble-click en **start.bat**

## Verificar que funciona
1. Abri el panel admin de tu restaurante
2. Pedidos > Crear un pedido de prueba
3. El agente debe recibirlo e imprimirlo automaticamente

## Configuracion Manual
Si necesitas editar `config.json` directamente:

```json
{
  "apiUrl": "https://takeasygo.com",
  "tenantSlug": "tu-slug",
  "locationId": "id-de-la-sede",
  "pollInterval": 15000
}
```

- `apiUrl`: URL del servidor TakeasyGo
- `tenantSlug`: Identificador del restaurante (sin espacios ni mayusculas)
- `locationId`: ID de la sede (lo ves en el panel admin o lo da el setup)
- `pollInterval`: Cada cuantos ms consulta el servidor (15000 = 15 segundos)

## Desinstalar servicio
```cmd
sc stop TakeasyGoPrinter
sc delete TakeasyGoPrinter
```

## Troubleshooting

### No recibe pedidos
1. Verificar que `config.json` tenga los valores correctos
2. Verificar que la impresora este encendida y conectada
3. Verificar que el servidor este online
4. Revisar `agent.log` para errores

### Error "Firma invalida" en webhooks
Actualizar el `webhookSecret` en el panel admin del restaurante.

### Multiples impresoras
El agente busca impresoras configuradas en la base de datos.
Verificar en el panel admin > Configuracion > Impresoras que la impresora
este asignada a la sede correcta.
