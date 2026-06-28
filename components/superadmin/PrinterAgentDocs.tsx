'use client'

import { useState } from 'react'
import {
  Printer,
  Download,
  Settings,
  Wrench,
  Terminal,
  Cpu,
  Copy,
  Check,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  Info,
  CheckCircle,
  XCircle,
  Usb,
  Wifi,
  FolderOpen,
  Play,
  Square,
  Trash2,
  FileText,
  Shield,
  Clock,
  Zap,
  RefreshCw,
} from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = async () => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-6 px-2 text-xs gap-1"
      onClick={handleCopy}
    >
      {copied ? <><Check size={12} className="text-green-500" /> Copiado</> : <><Copy size={12} /> Copiar</>}
    </Button>
  )
}

function CmdBlock({ command, description }: { command: string; description?: string }) {
  return (
    <div className="my-3">
      {description && <p className="text-sm text-muted-foreground mb-1.5">{description}</p>}
      <div className="relative group bg-black/90 rounded-lg border border-border/30 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2 bg-black/50 border-b border-border/20">
          <span className="text-[10px] font-mono text-green-400/70 uppercase tracking-wider">CMD</span>
          <CopyButton text={command} />
        </div>
        <pre className="px-4 py-3 overflow-x-auto">
          <code className="text-sm font-mono text-green-400">{command}</code>
        </pre>
      </div>
    </div>
  )
}

function CodeBlock({ code, language }: { code: string; language?: string }) {
  return (
    <div className="my-3">
      <div className="relative group bg-muted/80 rounded-lg border border-border/50 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-1.5 border-b border-border/30">
          <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">{language || 'code'}</span>
          <CopyButton text={code} />
        </div>
        <pre className="px-4 py-3 overflow-x-auto">
          <code className="text-sm font-mono text-foreground/80">{code}</code>
        </pre>
      </div>
    </div>
  )
}

function Accordion({ title, icon: Icon, children, defaultOpen = false }: {
  title: string
  icon: React.ElementType
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border border-border/50 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors text-left"
      >
        <Icon size={18} className="text-primary shrink-0" />
        <span className="flex-1 font-medium text-sm">{title}</span>
        {open ? <ChevronDown size={16} className="text-muted-foreground" /> : <ChevronRight size={16} className="text-muted-foreground" />}
      </button>
      {open && <div className="px-4 py-4 border-t border-border/30">{children}</div>}
    </div>
  )
}

function Step({ number, title, children }: { number: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4">
      <div className="shrink-0 w-8 h-8 rounded-full bg-primary flex items-center justify-center text-white font-bold text-sm">
        {number}
      </div>
      <div className="flex-1 min-w-0">
        <h4 className="font-semibold text-foreground mb-2">{title}</h4>
        <div className="text-sm text-muted-foreground space-y-2">{children}</div>
      </div>
    </div>
  )
}

function Note({ type = 'info', title, children }: { type?: 'info' | 'warning' | 'error' | 'success'; title: string; children: React.ReactNode }) {
  const styles = {
    info: { icon: Info, bg: 'bg-blue-500/10 border-blue-500/30', text: 'text-blue-600 dark:text-blue-400' },
    warning: { icon: AlertTriangle, bg: 'bg-yellow-500/10 border-yellow-500/30', text: 'text-yellow-600 dark:text-yellow-400' },
    error: { icon: XCircle, bg: 'bg-red-500/10 border-red-500/30', text: 'text-red-600 dark:text-red-400' },
    success: { icon: CheckCircle, bg: 'bg-green-500/10 border-green-500/30', text: 'text-green-600 dark:text-green-400' },
  }
  const s = styles[type]
  const Icon = s.icon
  return (
    <div className={`rounded-lg border p-4 my-4 ${s.bg}`}>
      <div className="flex items-center gap-2 mb-1">
        <Icon size={16} className={s.text} />
        <span className={`font-semibold text-sm ${s.text}`}>{title}</span>
      </div>
      <div className="text-sm text-muted-foreground pl-6">{children}</div>
    </div>
  )
}

function TableRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <tr className="border-b border-border/30 last:border-0">
      <td className="py-2 pr-4 font-medium text-sm text-foreground whitespace-nowrap">{label}</td>
      <td className="py-2 text-sm text-muted-foreground">{value}</td>
    </tr>
  )
}

export default function PrinterAgentDocs() {
  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-2">
          <div className="h-10 w-10 rounded-xl bg-primary flex items-center justify-center">
            <Printer size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-foreground text-3xl font-bold tracking-tight">Agente de Impresión</h1>
            <p className="text-muted-foreground mt-0.5 font-medium">Manual de instalación, configuración y troubleshooting</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="instalacion" className="space-y-6">
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-5 h-auto">
          <TabsTrigger value="instalacion" className="gap-2 py-2.5">
            <Download size={16} />
            <span className="hidden sm:inline">Instalación Nuevo</span>
            <span className="sm:hidden">Nuevo</span>
          </TabsTrigger>
          <TabsTrigger value="actualizacion" className="gap-2 py-2.5">
            <Zap size={16} />
            <span className="hidden sm:inline">Actualizar Existente</span>
            <span className="sm:hidden">Actualizar</span>
          </TabsTrigger>
          <TabsTrigger value="troubleshooting" className="gap-2 py-2.5">
            <Wrench size={16} />
            <span className="hidden sm:inline">Troubleshooting</span>
            <span className="sm:hidden">Debug</span>
          </TabsTrigger>
          <TabsTrigger value="comandos" className="gap-2 py-2.5">
            <Terminal size={16} />
            <span className="hidden sm:inline">Comandos CMD</span>
            <span className="sm:hidden">CMD</span>
          </TabsTrigger>
          <TabsTrigger value="arquitectura" className="gap-2 py-2.5">
            <Cpu size={16} />
            <span className="hidden sm:inline">Arquitectura</span>
            <span className="sm:hidden">Tech</span>
          </TabsTrigger>
        </TabsList>

        {/* ═══════════════════════════════════════════ TAB: INSTALACIÓN NUEVO ═══════════════════════════════════════════ */}
        <TabsContent value="instalacion" className="space-y-6">
          {/* Requisitos */}
          <Card className="rounded-2xl border-2 border-border/60 shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Shield size={18} className="text-primary" />
                Requisitos Previos
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="flex items-start gap-3 p-3 rounded-xl bg-muted/30 border border-border/30">
                  <Cpu size={20} className="text-primary shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-sm">Node.js v18+</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Descargar desde nodejs.org. Versión LTS recomendada.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 rounded-xl bg-muted/30 border border-border/30">
                  <Terminal size={20} className="text-primary shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-sm">Windows 10/11</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Necesario para el servicio de Windows.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 rounded-xl bg-muted/30 border border-border/30">
                  <Printer size={20} className="text-primary shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-sm">Impresora Térmica</p>
                    <p className="text-xs text-muted-foreground mt-0.5">USB o TCP/IP (red local). Configurada en Windows.</p>
                  </div>
                </div>
              </div>

              <Note type="info" title="Verificar Node.js">
                Abrir CMD y ejecutar: <code className="bg-muted px-1 rounded text-xs">node --version</code>. Si no muestra versión, instalar Node.js primero.
              </Note>
            </CardContent>
          </Card>

          {/* Generar ZIP */}
          <Card className="rounded-2xl border-2 border-border/60 shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Download size={18} className="text-primary" />
                Paso 1: Generar el ZIP (Equipo TakeasyGo)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Desde la PC del desarrollador, ejecutar el script de build para generar el ZIP descargable.
              </p>
              <Step number={1} title="Abrir la carpeta del proyecto">
                <p>Navegar a la carpeta <code className="bg-muted px-1 rounded text-xs">printer-agent/</code> del proyecto.</p>
              </Step>
              <Step number={2} title="Ejecutar BUILD.bat">
                <p>Doble-click en <code className="bg-muted px-1 rounded text-xs">BUILD.bat</code>. Genera el ZIP en <code className="bg-muted px-1 rounded text-xs">dist/takeasygo-printer-agent.zip</code>.</p>
              </Step>
              <Step number={3} title="Verificar el ZIP">
                <p>El ZIP debe pesar ~14 KB y contener 12 archivos.</p>
              </Step>

              <CmdBlock command="powershell -ExecutionPolicy Bypass -File build-dist.ps1" description="Alternativa: ejecutar desde CMD en la carpeta printer-agent" />
            </CardContent>
          </Card>

          {/* Instalación en la PC */}
          <Card className="rounded-2xl border-2 border-border/60 shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Settings size={18} className="text-primary" />
                Paso 2: Instalar en la PC del Restaurante
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Note type="warning" title="IMPORTANTE">
                La PC debe estar encendida durante el horario de atención del restaurante para que el agent imprima.
              </Note>

              <Step number={1} title="Copiar el ZIP a la PC del restaurante">
                <p>Enviar <code className="bg-muted px-1 rounded text-xs">takeasygo-printer-agent.zip</code> por email, USB, o WhatsApp. Descomprimir en cualquier carpeta. Ejemplo:</p>
                <CodeBlock code="C:\Takeasygo\" language="ruta" />
                <p>La carpeta debe contener estos archivos:</p>
                <CodeBlock code={`C:\\Takeasygo\\
├── agent.js
├── setup.js
├── config.json
├── package.json
├── .npmrc
├── send-raw.ps1
├── SETUP.bat
├── start.bat
├── INSTALAR_SERVICIO.bat
├── install_service.js
├── uninstall_service.js
└── README.md`} language="archivos" />
              </Step>

              <Step number={2} title="Ejecutar SETUP.bat">
                <p>Doble-click en <code className="bg-muted px-1 rounded text-xs">SETUP.bat</code>. El script pide:</p>
                <ul className="list-disc pl-5 mt-2 space-y-1">
                  <li><strong>URL del servidor</strong> — Default: <code className="bg-muted px-1 rounded text-xs">https://takeasygo.com</code> (enter para aceptar)</li>
                  <li><strong>Slug del restaurante</strong> — Ej: <code className="bg-muted px-1 rounded text-xs">cero-cafe</code>. Si tu panel es takeasygo.com/cero-cafe/admin, el slug es "cero-cafe"</li>
                  <li><strong>Seleccionar sede</strong> — Busca automáticamente las sedes del tenant. Elegir con el número</li>
                  <li><strong>Intervalo de polling</strong> — Default 15000ms (enter para aceptar)</li>
                </ul>
              </Step>

              <Step number={3} title="Verificar config.json">
                <p>Abrir <code className="bg-muted px-1 rounded text-xs">config.json</code> y confirmar que tiene valores reales:</p>
                <CodeBlock code={`{
  "apiUrl": "https://takeasygo.com",
  "tenantSlug": "cero-cafe",
  "locationId": "69a658edca4b0421ca9773e8",
  "pollInterval": 15000
}`} language="json" />
              </Step>

              <Step number={4} title="Probar con start.bat (modo manual)">
                <p>Doble-click en <code className="bg-muted px-1 rounded text-xs">start.bat</code>. Debería mostrar:</p>
                <CodeBlock code={`##########################################
#   AGENTE DE IMPRESIÓN - TAKEASYGO      #
##########################################
Estado:   Iniciado y Escuchando
Tenant:   cero-cafe
Sede:     69a658edca4b0421ca9773e8
API:      https://takeasygo.com
Intervalo: 15000ms
------------------------------------------

[USB] Impresoras detectadas en Windows: Impresora Fudo
[POLL] órdenes=0 impresoras=1 preClose=0`} language="log" />
                <Note type="success" title="Señales de que funciona">
                  Si ves <code className="bg-muted px-1 rounded text-xs">impresoras=1</code> y no hay errores, el agent está conectado correctamente.
                </Note>
              </Step>

              <Step number={5} title="Detener start.bat y ejecutar INSTALAR_SERVICIO.bat">
                <p>Cerrar start.bat con <code className="bg-muted px-1 rounded text-xs">Ctrl+C</code>. Luego doble-click en <code className="bg-muted px-1 rounded text-xs">INSTALAR_SERVICIO.bat</code>.</p>
                <p>Pide permiso de administrador (decir SÍ). El servicio se registra y auto-inicia.</p>
              </Step>

              <Step number={6} title="Configurar impresora en el panel admin">
                <p>Ir a <strong>Admin del restaurante → Configuración → Impresoras</strong>. Crear una impresora con:</p>
                <table className="w-full text-sm mt-2">
                  <tbody>
                    <TableRow label="Nombre" value={<code className="bg-muted px-1 rounded text-xs">cocina</code>} />
                    <TableRow label="IP" value={<span>IP de la impresora en la red local (ej: 192.168.1.100). Para USB: nombre exacto en Windows.</span>} />
                    <TableRow label="Puerto" value={<code className="bg-muted px-1 rounded text-xs">9100</code>} />
                    <TableRow label="Conexión" value={<span><code className="bg-muted px-1 rounded text-xs">TCP</code> para red, <code className="bg-muted px-1 rounded text-xs">USB</code> para cable directo</span>} />
                    <TableRow label="Roles" value={<span><code className="bg-muted px-1 rounded text-xs">kitchen</code> para cocina, <code className="bg-muted px-1 rounded text-xs">cashier</code> para caja</span>} />
                    <TableRow label="Paper Width" value={<span>80mm o 58mm según la impresora</span>} />
                  </tbody>
                </table>
              </Step>
            </CardContent>
          </Card>

          {/* Verificación */}
          <Card className="rounded-2xl border-2 border-border/60 shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <CheckCircle size={18} className="text-primary" />
                Paso 3: Verificar que Imprime
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Step number={1} title="Abrir el panel admin del restaurante">
                <p>Ir a la sección de <strong>Pedidos</strong>.</p>
              </Step>
              <Step number={2} title="Crear un pedido de prueba">
                <p>Hacer un pedido como cliente (o desde el admin). El pedido debe tener status <code className="bg-muted px-1 rounded text-xs">confirmed</code>, <code className="bg-muted px-1 rounded text-xs">preparing</code>, o <code className="bg-muted px-1 rounded text-xs">ready</code> para ser impreso.</p>
              </Step>
              <Step number={3} title="Verificar en la consola del agent">
                <p>Si el servicio está corriendo, verificar los logs con:</p>
                <CmdBlock command="sc query TakeasygoPrinter" description="Verificar que el servicio esté corriendo" />
              </Step>
              <Step number={4} title="Verificar el printLog en la DB">
                <p>Si el pedido no imprime, verificar en la DB si tiene <code className="bg-muted px-1 rounded text-xs">printLog</code> con entradas.</p>
              </Step>
            </CardContent>
          </Card>

          {/* Consideraciones */}
          <Card className="rounded-2xl border-2 border-border/60 shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Info size={18} className="text-primary" />
                Consideraciones Técnicas
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Accordion title="TCP vs USB — Cuál usar" icon={Wifi} defaultOpen>
                <div className="space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-3 rounded-xl bg-muted/30 border border-border/30">
                      <div className="flex items-center gap-2 mb-2">
                        <Wifi size={16} className="text-primary" />
                        <span className="font-medium text-sm">TCP/IP (Recomendado)</span>
                      </div>
                      <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-4">
                        <li>Impresora con IP propia en la red</li>
                        <li>Funciona por WiFi o cable Ethernet</li>
                        <li>No requiere drivers en la PC</li>
                        <li>Más confiable para producción</li>
                        <li>Puerto estándar: 9100</li>
                      </ul>
                    </div>
                    <div className="p-3 rounded-xl bg-muted/30 border border-border/30">
                      <div className="flex items-center gap-2 mb-2">
                        <Usb size={16} className="text-primary" />
                        <span className="font-medium text-sm">USB</span>
                      </div>
                      <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-4">
                        <li>Cable USB directo de impresora a PC</li>
                        <li>Requiere que la impresora esté instalada en Windows</li>
                        <li>Usa PowerShell + Win32 Spooler</li>
                        <li>Nombre en Windows debe coincidir con el de la DB</li>
                        <li>Funciona sin red</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </Accordion>

              <Accordion title="Firewall y Puertos" icon={Shield}>
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    Si la impresora es TCP/IP, verificar que el puerto 9100 esté abierto en el firewall de la PC del restaurante.
                  </p>
                  <CmdBlock command="telnet 192.168.1.100 9100" description="Probar conexión a la impresora (reemplazar IP)" />
                  <p className="text-sm text-muted-foreground">
                    Si no conecta, puede ser firewall. Agregar regla de entrada para el puerto 9100.
                  </p>
                </div>
              </Accordion>

              <Accordion title="Nombre de la impresora en Windows (USB)" icon={Printer}>
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    Para USB, el nombre en la DB <strong>debe coincidir exactamente</strong> con el nombre que Windows le da a la impresora.
                  </p>
                  <p className="text-sm text-muted-foreground">Para ver el nombre exacto:</p>
                  <CmdBlock command='powershell -Command "Get-Printer | Select-Object Name"' description="Listar impresoras instaladas en Windows" />
                  <Note type="warning" title="Caso común">
                    La impresora puede llamarse "POS-80-Series" o "Generic / Text Only" en Windows, aunque en la caja diga otro nombre.
                  </Note>
                </div>
              </Accordion>

              <Accordion title="Ubicación de la carpeta" icon={FolderOpen}>
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    El agent puede instalarse en cualquier carpeta. No necesita estar en el escritorio.
                  </p>
                  <p className="text-sm text-muted-foreground">
                    <strong>Recomendación:</strong> Usar <code className="bg-muted px-1 rounded text-xs">C:\Takeasygo\</code> o <code className="bg-muted px-1 rounded text-xs">C:\PrinterAgent\</code>.
                  </p>
                  <Note type="error" title="Si movés la carpeta después de instalar el servicio">
                    El servicio guarda la ruta absoluta de agent.js. Si movés la carpeta, hay que desinstalar y reinstalar el servicio:
                    <CmdBlock command={`sc stop TakeasygoPrinter\nsc delete TakeasygoPrinter\n# Mover la carpeta\n# Ejecutar INSTALAR_SERVICIO.bat desde la nueva ubicación`} />
                  </Note>
                </div>
              </Accordion>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══════════════════════════════════════════ TAB: ACTUALIZACIÓN ═══════════════════════════════════════════ */}
        <TabsContent value="actualizacion" className="space-y-6">
          <Card className="rounded-2xl border-2 border-border/60 shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Zap size={18} className="text-primary" />
                Actualizar Agent en Cliente Existente
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Note type="info" title="Cuándo es necesario">
                Solo es necesario actualizar cuando se cambia <code className="bg-muted px-1 rounded text-xs">agent.js</code> (nuevas features, bugs fixes). Los cambios en el backend (API) se despliegan automáticamente en Vercel.
              </Note>

              <Step number={1} title="Detener el servicio">
                <CmdBlock command="sc stop TakeasygoPrinter" />
              </Step>

              <Step number={2} title="Copiar el nuevo agent.js">
                <p>Reemplazar el archivo <code className="bg-muted px-1 rounded text-xs">agent.js</code> en la PC del restaurante con la versión nueva.</p>
                <p>No es necesario reinstalar el servicio ni reconfigurar.</p>
              </Step>

              <Step number={3} title="Iniciar el servicio">
                <CmdBlock command="sc start TakeasygoPrinter" />
              </Step>

              <Note type="success" title="No se pierde la configuración">
                El <code className="bg-muted px-1 rounded text-xs">config.json</code> se mantiene. Solo se reemplaza agent.js.
              </Note>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-2 border-border/60 shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <RefreshCw size={18} className="text-primary" />
                Qué Cambios Requieren Actualización
              </CardTitle>
            </CardHeader>
            <CardContent>
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground px-4 py-3 border-b border-border/50">Tipo de cambio</th>
                    <th className="text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground px-4 py-3 border-b border-border/50">¿Requiere actualizar agent?</th>
                    <th className="text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground px-4 py-3 border-b border-border/50">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-border/30">
                    <td className="px-4 py-3 font-medium">API / Backend (Vercel)</td>
                    <td className="px-4 py-3"><Badge className="bg-green-500/10 text-green-600 border-green-500/30">No</Badge></td>
                    <td className="px-4 py-3 text-muted-foreground">Deploy automático a Vercel</td>
                  </tr>
                  <tr className="border-b border-border/30">
                    <td className="px-4 py-3 font-medium">agent.js</td>
                    <td className="px-4 py-3"><Badge className="bg-red-500/10 text-red-600 border-red-500/30">Sí</Badge></td>
                    <td className="px-4 py-3 text-muted-foreground">Copiar archivo nuevo + reiniciar servicio</td>
                  </tr>
                  <tr className="border-b border-border/30">
                    <td className="px-4 py-3 font-medium">send-raw.ps1</td>
                    <td className="px-4 py-3"><Badge className="bg-red-500/10 text-red-600 border-red-500/30">Sí</Badge></td>
                    <td className="px-4 py-3 text-muted-foreground">Copiar archivo nuevo</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 font-medium">config.json</td>
                    <td className="px-4 py-3"><Badge className="bg-yellow-500/10 text-yellow-600 border-yellow-500/30">Manual</Badge></td>
                    <td className="px-4 py-3 text-muted-foreground">Editar directamente o ejecutar SETUP.bat</td>
                  </tr>
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══════════════════════════════════════════ TAB: TROUBLESHOOTING ═══════════════════════════════════════════ */}
        <TabsContent value="troubleshooting" className="space-y-6">
          <Card className="rounded-2xl border-2 border-border/60 shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Wrench size={18} className="text-primary" />
                Errores Comunes y Soluciones
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Accordion title='"Configuracion no completada" — El agent no arranca' icon={XCircle}>
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    El <code className="bg-muted px-1 rounded text-xs">config.json</code> tiene valores placeholder (<code className="bg-muted px-1 rounded text-xs">TU-SLUG</code>).
                  </p>
                  <p className="font-medium text-sm">Solución:</p>
                  <CmdBlock command="SETUP.bat" description="Ejecutar para configurar slug y sede" />
                </div>
              </Accordion>

              <Accordion title='"impresoras=0" — El agent no ve impresoras' icon={Printer}>
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">El agent hace polling pero el server devuelve 0 impresoras.</p>
                  <p className="font-medium text-sm">Causas posibles:</p>
                  <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
                    <li>La impresora no está creada en el panel admin (Configuración → Impresoras)</li>
                    <li>El <code className="bg-muted px-1 rounded text-xs">locationId</code> del config.json no coincide con la sede de la impresora</li>
                    <li>La impresora tiene <code className="bg-muted px-1 rounded text-xs">isActive: false</code> en la DB</li>
                  </ul>
                  <p className="font-medium text-sm">Solución:</p>
                  <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
                    <li>Verificar que la impresora exista en Admin → Configuración → Impresoras</li>
                    <li>Verificar que el <code className="bg-muted px-1 rounded text-xs">locationId</code> de la impresora coincida con el del config.json</li>
                    <li>Ejecutar SETUP.bat de nuevo para reconfigurar</li>
                  </ul>
                </div>
              </Accordion>

              <Accordion title='"órdenes=0" — El agent no recibe pedidos' icon={FileText}>
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    El agent detecta impresoras pero no ve pedidos para imprimir.
                  </p>
                  <p className="font-medium text-sm">Causas posibles:</p>
                  <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
                    <li>El pedido tiene status <code className="bg-muted px-1 rounded text-xs">delivered</code> o <code className="bg-muted px-1 rounded text-xs">cancelled</code> (no se imprime)</li>
                    <li>El pedido tiene <code className="bg-muted px-1 rounded text-xs">printed: true</code> (ya fue impreso)</li>
                    <li>El pedido tiene status <code className="bg-muted px-1 rounded text-xs">pending</code> o <code className="bg-muted px-1 rounded text-xs">open</code> (no confirmado aún)</li>
                  </ul>
                  <p className="font-medium text-sm">El agent solo busca pedidos con status:</p>
                  <CodeBlock code="confirmed | preparing | ready" language="status" />
                  <p className="text-sm text-muted-foreground">
                    Verificar en la DB: <code className="bg-muted px-1 rounded text-xs">{"Order.find({ status: { $in: ['confirmed','preparing','ready'] }, printed: false })"}</code>
                  </p>
                </div>
              </Accordion>

              <Accordion title='USB no imprime — "ERROR_SPOOLER"' icon={Usb}>
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    El agent detecta la impresora pero al intentar imprimir falla con error de spooler.
                  </p>
                  <p className="font-medium text-sm">Soluciones:</p>
                  <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
                    <li>Verificar que el nombre de la impresora en Windows sea exactamente el mismo que en la DB</li>
                    <li>Listar impresoras: <code className="bg-muted px-1 rounded text-xs">powershell -Command "Get-Printer | Select-Object Name"</code></li>
                    <li>Verificar que la impresora esté encendida y conectada</li>
                    <li>Probar imprimir desde Windows directamente (Paint → Imprimir)</li>
                  </ul>
                </div>
              </Accordion>

              <Accordion title='TCP no imprime — Timeout o conexión rechazada' icon={Wifi}>
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    El agent intenta conectar por TCP pero la impresora no responde.
                  </p>
                  <p className="font-medium text-sm">Soluciones:</p>
                  <CmdBlock command="telnet 192.168.1.100 9100" description="Probar conexión TCP a la impresora" />
                  <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
                    <li>Si no conecta: verificar IP de la impresora, firewall, que estén en la misma red</li>
                    <li>Verificar que el puerto sea 9100 (estándar para impresoras térmicas)</li>
                    <li>Verificar que la impresora acepte conexiones raw TCP</li>
                  </ul>
                </div>
              </Accordion>

              <Accordion title='Servicio no arranca o se detiene' icon={Square}>
                <div className="space-y-3">
                  <p className="font-medium text-sm">Verificar estado del servicio:</p>
                  <CmdBlock command="sc query TakeasygoPrinter" />
                  <p className="font-medium text-sm">Si no está corriendo:</p>
                  <CmdBlock command="sc start TakeasygoPrinter" />
                  <p className="font-medium text-sm">Si falla al instalar:</p>
                  <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
                    <li>Ejecutar INSTALAR_SERVICIO.bat como administrador (click derecho → Ejecutar como administrador)</li>
                    <li>Verificar que Node.js esté instalado: <code className="bg-muted px-1 rounded text-xs">node --version</code></li>
                    <li>Verificar que las dependencias estén instaladas: <code className="bg-muted px-1 rounded text-xs">pnpm install</code></li>
                  </ul>
                </div>
              </Accordion>

              <Accordion title='"Firma inválida" en webhooks de MercadoPago' icon={Shield}>
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Los webhooks de MercadoPago fallan con error de firma. Esto impide que los pedidos se confirmen automáticamente.
                  </p>
                  <p className="font-medium text-sm">Solución:</p>
                  <p className="text-sm text-muted-foreground">
                    Actualizar el <code className="bg-muted px-1 rounded text-xs">webhookSecret</code> en el panel admin del restaurante. Obtener el secret desde el dashboard de MercadoPago.
                  </p>
                </div>
              </Accordion>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══════════════════════════════════════════ TAB: COMANDOS CMD ═══════════════════════════════════════════ */}
        <TabsContent value="comandos" className="space-y-6">
          <Card className="rounded-2xl border-2 border-border/60 shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Terminal size={18} className="text-primary" />
                Cómo Abrir CMD como Administrador
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-muted/30 border border-border/30">
                  <p className="font-medium text-sm mb-2">Método 1: Menú Inicio</p>
                  <ol className="list-decimal pl-5 text-sm text-muted-foreground space-y-1">
                    <li>Presionar tecla Windows</li>
                    <li>Escribir "cmd"</li>
                    <li>Click derecho → "Ejecutar como administrador"</li>
                  </ol>
                </div>
                <div className="p-4 rounded-xl bg-muted/30 border border-border/30">
                  <p className="font-medium text-sm mb-2">Método 2: Exec dialog</p>
                  <ol className="list-decimal pl-5 text-sm text-muted-foreground space-y-1">
                    <li>Presionar <code className="bg-muted px-1 rounded text-xs">Win + R</code></li>
                    <li>Escribir <code className="bg-muted px-1 rounded text-xs">cmd</code></li>
                    <li>Presionar <code className="bg-muted px-1 rounded text-xs">Ctrl + Shift + Enter</code></li>
                  </ol>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-2 border-border/60 shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Play size={18} className="text-primary" />
                Servicio — Control del Agente
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <CmdBlock command="sc query TakeasygoPrinter" description="Verificar estado del servicio" />
              <CmdBlock command="sc start TakeasygoPrinter" description="Iniciar el servicio" />
              <CmdBlock command="sc stop TakeasygoPrinter" description="Detener el servicio" />
              <CmdBlock command="sc delete TakeasygoPrinter" description="Eliminar el servicio (requiere reinstalar con INSTALAR_SERVICIO.bat)" />
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-2 border-border/60 shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <FolderOpen size={18} className="text-primary" />
                Navegación de Archivos
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <CmdBlock command="cd C:\Takeasygo" description="Navegar a la carpeta del agent" />
              <CmdBlock command="dir" description="Listar archivos en la carpeta actual" />
              <CmdBlock command="dir /s agent.js" description="Buscar un archivo en la carpeta y subcarpetas" />
              <CmdBlock command="type config.json" description="Ver el contenido de un archivo en CMD" />
              <CmdBlock command="node --version" description="Verificar versión de Node.js instalada" />
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-2 border-border/60 shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Printer size={18} className="text-primary" />
                Impresora — Diagnóstico
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <CmdBlock command='powershell -Command "Get-Printer | Select-Object Name, DriverName, PortName, PrinterStatus"' description="Listar todas las impresoras instaladas en Windows" />
              <CmdBlock command="telnet 192.168.1.100 9100" description="Probar conexión TCP a la impresora (reemplazar IP)" />
              <CmdBlock command='powershell -Command "Test-NetConnection 192.168.1.100 -Port 9100"' description="Probar conexión TCP con PowerShell (más moderno que telnet)" />
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-2 border-border/60 shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Download size={18} className="text-primary" />
                Dependencias
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <CmdBlock command="npm install -g pnpm" description="Instalar pnpm globalmente (si no está)" />
              <CmdBlock command="pnpm install" description="Instalar dependencias del agent (desde la carpeta del agent)" />
              <CmdBlock command="where pnpm" description="Verificar si pnpm está instalado" />
              <CmdBlock command="where node" description="Verificar si Node.js está en el PATH" />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══════════════════════════════════════════ TAB: ARQUITECTURA ═══════════════════════════════════════════ */}
        <TabsContent value="arquitectura" className="space-y-6">
          <Card className="rounded-2xl border-2 border-border/60 shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Cpu size={18} className="text-primary" />
                Cómo Funciona el Agent
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-4 rounded-xl bg-muted/30 border border-border/30">
                <p className="text-sm text-muted-foreground">
                  El agent es un proceso Node.js que corre en la PC del restaurante. Hace <strong>polling</strong> (consulta periódica) al servidor de TakeasyGO cada 15 segundos.
                </p>
              </div>

              <h4 className="font-semibold text-sm mt-4">Flujo de Datos</h4>
              <CodeBlock code={`1. Agent hace GET /api/{tenant}/print-jobs?locationId={id}
   ↓
2. Server responde: { orders: [...], printers: [...] }
   ↓
3. Agent genera ticket ESC/POS para cada pedido × impresora × rol
   ↓
4. JobManager encola tickets (una impresora a la vez)
   ↓
5. Envía bytes a la impresora (TCP o USB)
   ↓
6. Agent hace POST /api/{tenant}/print-jobs confirmando resultado
   ↓
7. Server marca order.printed = true`} language="flujo" />
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-2 border-border/60 shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Settings size={18} className="text-primary" />
                config.json — Campos Explicados
              </CardTitle>
            </CardHeader>
            <CardContent>
              <CodeBlock code={`{
  "apiUrl": "https://takeasygo.com",    // URL del servidor TakeasyGO
  "tenantSlug": "cero-cafe",            // Slug del restaurante (sin espacios)
  "locationId": "69a658edca4b0421...",   // ObjectID de la sede en MongoDB
  "pollInterval": 15000,                // Cada cuántos ms consulta el server
  "autoUpdate": false                   // Auto-update (deshabilitado por defecto)
}`} language="json" />
              <div className="mt-4">
                <table className="w-full text-sm">
                  <tbody>
                    <TableRow label="apiUrl" value="URL del backend. Siempre https://takeasygo.com en producción." />
                    <TableRow label="tenantSlug" value="Identificador del restaurante. Lo obtuviste del panel admin." />
                    <TableRow label="locationId" value="ObjectID de la sede. El SETUP.bat lo busca automáticamente." />
                    <TableRow label="pollInterval" value="Frecuencia de consulta. 15000ms (15s) es el default. No bajar de 5000ms." />
                    <TableRow label="autoUpdate" value="Si true, verifica versión remota al arrancar. Requiere endpoint /api/agent/version." />
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-2 border-border/60 shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Clock size={18} className="text-primary" />
                Seguridad
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Note type="info" title="Diseño intencional">
                El endpoint <code className="bg-muted px-1 rounded text-xs">{"GET /api/{tenant}/print-jobs"}</code> no requiere autenticación. Esto es intencional: el agent necesita acceso sin login para que sea fácil de instalar. La seguridad se logra porque solo quien conozca el tenantSlug y locationId puede ver los pedidos.
              </Note>
              <p className="text-sm text-muted-foreground">
                El endpoint <code className="bg-muted px-1 rounded text-xs">{"POST /api/{tenant}/print-jobs"}</code> (confirmación) tampoco requiere auth. El agent reporta si la impresión fue exitosa o no.
              </p>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-2 border-border/60 shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <FileText size={18} className="text-primary" />
                Archivos del Agent
              </CardTitle>
            </CardHeader>
            <CardContent>
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground px-4 py-3 border-b border-border/50">Archivo</th>
                    <th className="text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground px-4 py-3 border-b border-border/50">Función</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-border/30"><td className="px-4 py-2 font-mono text-xs">agent.js</td><td className="px-4 py-2 text-muted-foreground">Código principal. Polling, generación de tickets, envío a impresora.</td></tr>
                  <tr className="border-b border-border/30"><td className="px-4 py-2 font-mono text-xs">setup.js</td><td className="px-4 py-2 text-muted-foreground">Script interactivo de configuración (slug, sede, polling).</td></tr>
                  <tr className="border-b border-border/30"><td className="px-4 py-2 font-mono text-xs">config.json</td><td className="px-4 py-2 text-muted-foreground">Configuración del agent (API URL, tenant, sede, intervalo).</td></tr>
                  <tr className="border-b border-border/30"><td className="px-4 py-2 font-mono text-xs">send-raw.ps1</td><td className="px-4 py-2 text-muted-foreground">Script PowerShell para enviar datos raw a impresoras USB (Win32 Spooler).</td></tr>
                  <tr className="border-b border-border/30"><td className="px-4 py-2 font-mono text-xs">package.json</td><td className="px-4 py-2 text-muted-foreground">Dependencias: axios, dotenv, node-windows.</td></tr>
                  <tr className="border-b border-border/30"><td className="px-4 py-2 font-mono text-xs">SETUP.bat</td><td className="px-4 py-2 text-muted-foreground">Launcher para setup.js.</td></tr>
                  <tr className="border-b border-border/30"><td className="px-4 py-2 font-mono text-xs">start.bat</td><td className="px-4 py-2 text-muted-foreground">Inicia el agent en modo manual (para testing).</td></tr>
                  <tr className="border-b border-border/30"><td className="px-4 py-2 font-mono text-xs">INSTALAR_SERVICIO.bat</td><td className="px-4 py-2 text-muted-foreground">Registra el agent como servicio de Windows.</td></tr>
                  <tr className="border-b border-border/30"><td className="px-4 py-2 font-mono text-xs">install_service.js</td><td className="px-4 py-2 text-muted-foreground">Usa node-windows para registrar el servicio.</td></tr>
                  <tr><td className="px-4 py-2 font-mono text-xs">uninstall_service.js</td><td className="px-4 py-2 text-muted-foreground">Elimina el servicio de Windows.</td></tr>
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
