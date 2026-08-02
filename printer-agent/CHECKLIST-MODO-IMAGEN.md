# Checklist: Modo Impresión por IMAGEN — Test en Máquina de Cliente

**Fecha:** 2026-08-03  
**Objetivo:** Activar modo imagen en una impresora real y confirmar que imprime correctamente como Windows Service.

---

## ACTUALIZACIÓN DE AGENTE EXISTENTE

Si el cliente ya tiene el agente instalado (con servicio corriendo), hay 2 caminos:

### Opción A: UPDATE.bat (automático)

1. Copiar al directorio del agente los archivos nuevos desde el ZIP:
   ```
   agent.js.new       ← renombrar el agent.js del ZIP como agent.js.new
   package.json.new   ← renombrar el package.json del ZIP como package.json.new
   ticket-renderer.js
   raster-encoder.js
   UPDATE.bat
   ```
2. Ejecutar `UPDATE.bat` como Administrador.
3. Sigue al PASO 3 más abajo.

### Opción B: Manual (paso a paso)

1. Detener el servicio:
   ```powershell
   net stop "Takeasygo Printer Agent"
   ```
2. Copiar estos archivos al directorio del agente (reemplazando los existentes):
   ```
   agent.js            ← reemplazar
   package.json        ← reemplazar
   ticket-renderer.js  ← nuevo
   raster-encoder.js   ← nuevo
   ```
   **NO tocar** `config.json` (tiene los datos de conexión del cliente).
3. Instalar dependencias:
   ```powershell
   pnpm install
   ```
4. Verificar que los módulos cargan:
   ```powershell
   node -e "require('./ticket-renderer'); require('./raster-encoder'); console.log('OK')"
   ```
5. Reiniciar el servicio:
   ```powershell
   net start "Takeasygo Printer Agent"
   ```
6. Seguir al PASO 3 más abajo.

---

## INSTALACIÓN LIMPIA (nuevo cliente)

## PREREQUISITOS

- [ ] Acceso a la máquina del cliente con la consola de administrador
- [ ] Acceso al panel de administración del tenant (navegador web)
- [ ] Node.js >= 18 instalado en la máquina
- [ ] PowerShell corriendo como Administrador

---

## PASO 1: Actualizar archivos del agente

Copiar estos 2 archivos nuevos al directorio del agente (donde están `agent.js`, `package.json`, etc.):

```
ticket-renderer.js
raster-encoder.js
```

Copiar el `package.json` actualizado (que incluye `"@napi-rs/canvas": "^0.1.100"` en dependencies).

**Si usás `build-dist.ps1`:** correr `.\build-dist.ps1` genera el ZIP con todo incluido. Solo descomprimir en la carpeta del agente.

---

## PASO 2: Instalar dependencias

Desde PowerShell, en la carpeta del agente:

```powershell
pnpm install
```

Si pnpm no está instalado:
```powershell
npm install -g pnpm
pnpm install
```

**Verificar:** que no haya errores de `@napi-rs/canvas` ni `canvas-win32-x64-msvc`.

---

## PASO 3: Test manual (sin servicio)

1. Activar modo imagen desde el panel de administración:
   - Ir a **Panel → Impresoras**
   - En la impresora de **Cocina**, click en **"Estilos"**
   - En **"Modo de impresión"**, cambiar de "Texto (ESC/POS)" a **"Imagen (GS v 0)"**
   - Click en **"Guardar cambios"**

2. Detener el servicio si está corriendo:
```powershell
# Ver si está corriendo
Get-Service -Name "Takeasygo Printer Agent" -ErrorAction SilentlyContinue

# Detenerlo
Stop-Service -Name "Takeasygo Printer Agent" -Force -ErrorAction SilentlyContinue
```

3. Correr el agente a mano:
```powershell
node agent.js
```

**Esperar:** que muestre el banner "AGENTE DE IMPRESIÓN - TAKEASYGO" y empiece a pollear. No debería haber errores de canvas/Skia.

4. Enviar una orden de prueba desde la app del restaurante.

5. **Verificar:** que el ticket salga de la impresora con el layout de modo imagen (Consolas, headers centrados, items con doble alto).

6. Ctrl+C para detener.

---

## PASO 4: Activar como servicio

Si el test manual funcionó:

1. Reiniciar el servicio:
```powershell
# Si ya está instalado, solo reiniciarlo
Restart-Service -Name "Takeasygo Printer Agent" -Force -ErrorAction SilentlyContinue

# Si no está instalado o falla:
cd "RUTA_DEL_AGENTE"
node install_service.js
```

2. Verificar que esté corriendo:
```powershell
Get-Service -Name "Takeasygo Printer Agent"
# Estado debe ser "Running"
```

3. Verificar en el Visor de Eventos que no haya errores:
```powershell
Get-EventLog -LogName Application -Source "Takeasygo Printer Agent" -Newest 5 -ErrorAction SilentlyContinue
```

4. Enviar otra orden de prueba.

5. **Verificar:** que el ticket salga igual que en el test manual.

---

## PASO 5: Revertir si hay problemas

Si el modo imagen falla, volver al modo texto desde el panel:
- **Panel → Impresoras → Estilos** en la impresora de cocina
- Cambiar "Modo de impresión" a **"Texto (ESC/POS)"**
- **Guardar cambios**
- Reiniciar el servicio:
```powershell
Restart-Service -Name "Takeasygo Printer Agent" -Force
```

---

## TROUBLESHOOTING

| Problema | Causa probable | Solución |
|----------|---------------|----------|
| "SkIcuLoader: datafile missing" | icudtl.dat no encontrado | Verificar que `@napi-rs/canvas-win32-x64-msvc` está en node_modules. Reinstalar: `pnpm install @napi-rs/canvas` |
| "Cannot find module @napi-rs/canvas" | npm install no corrió o falló | Correr `pnpm install` de nuevo |
| Servicio no arranca | Error de config.json o de módulo | Revisar Event Viewer. Probar `node agent.js` a mano primero |
| Ticket sale en modo texto | mode no está activado | Verificar en Panel → Impresoras → Estilos que el modo sea "Imagen (GS v 0)" |
| Canvas lento en cocina | Normal en primer ticket | Los primeros 1-2 tickets pueden ser ~1s más lentos por cold start de Skia |

---

## NOTAS

- **`@napi-rs/canvas`** se instala automáticamente con `pnpm install` (ya está en package.json)
- **No se necesita** configurar variables de entorno ni copiar binarios manualmente
- **El modo image es opt-in por impresora** — solo se activa en la que vos setees `mode: "image"`
- **Las demás impresoras** siguen en modo texto (default `mode: "text"`)
- **Toggle disponible** en Panel → Impresoras → Estilos → Modo de impresión
