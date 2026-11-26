param(
    [Parameter(Mandatory = $true)]
    [string]$PrinterName,
    [Parameter(Mandatory = $true)]
    [string]$FilePath
)

$ErrorActionPreference = 'Stop'

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public class RawPrinter {
    // Error Win32 capturado justo despues de la llamada que fallo (si se
    // lee mas tarde desde PowerShell puede estar pisado por otras llamadas).
    public static int LastError = 0;

    [DllImport("winspool.drv", CharSet = CharSet.Unicode, ExactSpelling = false, SetLastError = true)]
    public static extern bool OpenPrinter(string pPrinterName, out IntPtr phPrinter, IntPtr pDefault);

    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool ClosePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern int StartDocPrinter(IntPtr hPrinter, int level, [In] ref DOC_INFO_1 docInfo);

    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool StartPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, int dwCount, out int dwWritten);

    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool EndPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool EndDocPrinter(IntPtr hPrinter);

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public struct DOC_INFO_1 {
        [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
        [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
        [MarshalAs(UnmanagedType.LPWStr)] public string pDatatype;
    }

    public static int SendBytesToPrinter(string szPrinterName, byte[] data) {
        IntPtr hPrinter = IntPtr.Zero;
        DOC_INFO_1 docInfo = new DOC_INFO_1();
        bool bSuccess = false;
        int dwWritten = 0;

        docInfo.pDocName = "Takeasygo Ticket";
        docInfo.pDatatype = "RAW";
        docInfo.pOutputFile = null;

        LastError = 0;
        if (!OpenPrinter(szPrinterName, out hPrinter, IntPtr.Zero)) {
            LastError = Marshal.GetLastWin32Error();
            return -1;
        }

        try {
            int jobId = StartDocPrinter(hPrinter, 1, ref docInfo);
            if (jobId == 0) {
                LastError = Marshal.GetLastWin32Error();
                return -2;
            }

            if (!StartPagePrinter(hPrinter)) {
                LastError = Marshal.GetLastWin32Error();
                return -3;
            }

            IntPtr pBytes = Marshal.AllocHGlobal(data.Length);
            try {
                Marshal.Copy(data, 0, pBytes, data.Length);
                bSuccess = WritePrinter(hPrinter, pBytes, data.Length, out dwWritten);
                if (!bSuccess) LastError = Marshal.GetLastWin32Error();
            } finally {
                Marshal.FreeHGlobal(pBytes);
            }

            if (!bSuccess || dwWritten != data.Length) {
                return -4;
            }

            if (!EndPagePrinter(hPrinter)) {
                LastError = Marshal.GetLastWin32Error();
                return -5;
            }

            if (!EndDocPrinter(hPrinter)) {
                LastError = Marshal.GetLastWin32Error();
                return -6;
            }
        } finally {
            ClosePrinter(hPrinter);
        }

        return dwWritten;
    }
}
"@

if (-not (Test-Path $FilePath)) {
    Write-Error "ARCHIVO_NO_ENCONTRADO: $FilePath"
    exit 1
}

try {
    $bytes = [System.IO.File]::ReadAllBytes($FilePath)
} catch {
    Write-Error "ERROR_LECTURA: $_"
    exit 1
}

$result = [RawPrinter]::SendBytesToPrinter($PrinterName, $bytes)

if ($result -lt 0) {
    $errorCode = $result
    $win32Error = [RawPrinter]::LastError
    Write-Error "ERROR_SPOOLER: codigo=$errorCode win32=$win32Error printer=$PrinterName"
    exit 1
}

Write-Output "OK: $result bytes enviados a $PrinterName"
exit 0
