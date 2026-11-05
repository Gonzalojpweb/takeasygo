# =============================================================================
# Puente con la DLL oficial EpsonFiscalDriver (Epson Argentina, 2da generacion)
# =============================================================================
# Uso (lo llama fiscal-drivers/epson.js):
#   powershell -File epson-bridge.ps1 -DllPath <ruta> -Port usb:usb -InputFile <json>
# InputFile: { "commands": ["0001|0000", ...], "stopOnError": true }
# Salida (stdout, una linea JSON):
#   { opened, apiVersion, dllError, results: [ { command, dllError, returnCode,
#     fiscalStatus, printerStatus, fields: [...] } ] }
# Descarga de reportes: { "download": { "start": "...", "next": "0970|0000",
#   "end": "0971|0000", "cancel": "0972|0000", "outFile": "<ruta>" } }
#   Salida: { opened, download: { ok, fileName, bytes, error } }. Sigue el flujo
#   del ejemplo oficial (DownloadFileFromFp): repite hasta que el campo 2 no es S.
# Firmas de las funciones: ejemplo oficial C#-DLL (fiscal_driver.cs), StdCall/Ansi.
# La DLL tiene que ser de la MISMA arquitectura que PowerShell (64 bits en
# Windows de 64 bits): la x64 viene en examples\C#-DLL\example\target.
# =============================================================================
param(
    [Parameter(Mandatory = $true)][string]$DllPath,
    [Parameter(Mandatory = $true)][string]$Port,
    [Parameter(Mandatory = $true)][string]$InputFile
)

$ErrorActionPreference = 'Stop'

function Out-Json($obj) {
    [Console]::Out.WriteLine(($obj | ConvertTo-Json -Depth 6 -Compress))
}

if (-not (Test-Path -LiteralPath $DllPath)) {
    Out-Json @{ opened = $false; setupError = "No se encontro la DLL de Epson en $DllPath" }
    exit 0
}

$escaped = $DllPath.Replace('\', '\\').Replace('"', '\"')
$source = @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class EpsonFiscal {
    const string D = "$escaped";
    [DllImport(D, CharSet = CharSet.Ansi, CallingConvention = CallingConvention.StdCall)] public static extern void OpenPortByName(string name);
    [DllImport(D, CharSet = CharSet.Ansi, CallingConvention = CallingConvention.StdCall)] public static extern void ClosePort();
    [DllImport(D, CharSet = CharSet.Ansi, CallingConvention = CallingConvention.StdCall)] public static extern int getLastError();
    [DllImport(D, CharSet = CharSet.Ansi, CallingConvention = CallingConvention.StdCall)] public static extern int getReturnCode();
    [DllImport(D, CharSet = CharSet.Ansi, CallingConvention = CallingConvention.StdCall)] public static extern int getFiscalStatus();
    [DllImport(D, CharSet = CharSet.Ansi, CallingConvention = CallingConvention.StdCall)] public static extern int getPrinterStatus();
    [DllImport(D, CharSet = CharSet.Ansi, CallingConvention = CallingConvention.StdCall)] public static extern int getState();
    [DllImport(D, CharSet = CharSet.Ansi, CallingConvention = CallingConvention.StdCall)] public static extern int SendCommandComplete(string command);
    [DllImport(D, CharSet = CharSet.Ansi, CallingConvention = CallingConvention.StdCall)] public static extern int getExtraFieldCount();
    [DllImport(D, CharSet = CharSet.Ansi, CallingConvention = CallingConvention.StdCall)] public static extern void GetExtraField(int n, StringBuilder buf, int len, ref int finalLen);
    [DllImport(D, CharSet = CharSet.Ansi, CallingConvention = CallingConvention.StdCall)] public static extern void GetAPIVersion(StringBuilder buf);
}
"@

try {
    Add-Type -TypeDefinition $source -Language CSharp
} catch {
    Out-Json @{ opened = $false; setupError = "No se pudo preparar la DLL de Epson: $($_.Exception.Message)" }
    exit 0
}

$req = Get-Content -LiteralPath $InputFile -Raw | ConvertFrom-Json
$results = @()
$apiVersion = ''

try {
    $v = New-Object System.Text.StringBuilder 1024
    [EpsonFiscal]::GetAPIVersion($v)
    $apiVersion = $v.ToString()
} catch {
    # Una DLL de otra arquitectura falla aca (BadImageFormatException).
    Out-Json @{ opened = $false; setupError = "La DLL de Epson no se pudo cargar (usar la version de 64 bits): $($_.Exception.Message)" }
    exit 0
}

[EpsonFiscal]::OpenPortByName($Port)
$openError = [EpsonFiscal]::getLastError()
if ($openError -ne 0) {
    Out-Json @{ opened = $false; apiVersion = $apiVersion; dllError = $openError }
    exit 0
}

function Send-Field($command) {
    [void][EpsonFiscal]::SendCommandComplete([string]$command)
    $dllError = [EpsonFiscal]::getLastError()
    $returnCode = [EpsonFiscal]::getReturnCode()
    $fields = @()
    if ($dllError -eq 0) {
        $count = [EpsonFiscal]::getExtraFieldCount()
        for ($i = 1; $i -le $count; $i++) {
            $buf = New-Object System.Text.StringBuilder 51200
            $len = 0
            [EpsonFiscal]::GetExtraField($i, $buf, 51200, [ref]$len)
            $s = $buf.ToString()
            if ($len -ge 0 -and $len -lt $s.Length) { $s = $s.Substring(0, $len) }
            $fields += $s
        }
    }
    return @{ dllError = $dllError; returnCode = $returnCode; fields = $fields }
}

if ($req.download) {
    $dl = $req.download
    $outcome = @{ ok = $false; fileName = ''; bytes = 0; error = '' }
    $started = $false
    try {
        $r = Send-Field $dl.start
        if ($r.dllError -ne 0 -or $r.returnCode -ne 0) { throw "El equipo rechazo la descarga (dll $($r.dllError), codigo $($r.returnCode))" }
        $started = $true
        if ($r.fields.Count -gt 0) { $outcome.fileName = [string]$r.fields[0] }
        $data = New-Object System.Text.StringBuilder
        $more = 'S'
        while ($more -eq 'S') {
            $r = Send-Field $dl.next
            if ($r.dllError -ne 0 -or $r.returnCode -ne 0) { throw "Se corto la descarga (dll $($r.dllError), codigo $($r.returnCode))" }
            [void]$data.Append([string]$r.fields[0])
            $more = [string]$r.fields[1]
        }
        $text = $data.ToString()
        [System.IO.File]::WriteAllText([string]$dl.outFile, $text, (New-Object System.Text.ASCIIEncoding))
        $r = Send-Field $dl.end
        if ($r.dllError -ne 0 -or $r.returnCode -ne 0) { throw "No se pudo finalizar la descarga (codigo $($r.returnCode))" }
        $started = $false
        $outcome.ok = $true
        $outcome.bytes = $text.Length
    } catch {
        $outcome.error = $_.Exception.Message
        if ($started) { [void](Send-Field $dl.cancel) }
    } finally {
        [EpsonFiscal]::ClosePort()
    }
    Out-Json @{ opened = $true; apiVersion = $apiVersion; download = $outcome }
    exit 0
}

try {
    foreach ($command in $req.commands) {
        [void][EpsonFiscal]::SendCommandComplete([string]$command)
        $dllError = [EpsonFiscal]::getLastError()
        $returnCode = [EpsonFiscal]::getReturnCode()
        $fields = @()
        if ($dllError -eq 0) {
            $count = [EpsonFiscal]::getExtraFieldCount()
            for ($i = 1; $i -le $count; $i++) {
                $buf = New-Object System.Text.StringBuilder 51200
                $len = 0
                [EpsonFiscal]::GetExtraField($i, $buf, 51200, [ref]$len)
                # La DLL informa el largo real: lo que sigue es basura del buffer
                # (el ejemplo oficial corta igual: raw[:final_len]).
                $s = $buf.ToString()
                if ($len -ge 0 -and $len -lt $s.Length) { $s = $s.Substring(0, $len) }
                $fields += $s
            }
        }
        $results += @{
            command       = ([string]$command).Split('|')[0]
            dllError      = $dllError
            returnCode    = $returnCode
            fiscalStatus  = [EpsonFiscal]::getFiscalStatus()
            printerStatus = [EpsonFiscal]::getPrinterStatus()
            fields        = $fields
        }
        if ($dllError -ne 0) { break }
        if ($req.stopOnError -and $returnCode -ne 0) { break }
    }
} finally {
    [EpsonFiscal]::ClosePort()
}

Out-Json @{ opened = $true; apiVersion = $apiVersion; results = $results }
