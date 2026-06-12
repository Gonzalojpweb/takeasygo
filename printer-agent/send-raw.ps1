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

        if (!OpenPrinter(szPrinterName, out hPrinter, IntPtr.Zero)) {
            return -1;
        }

        try {
            int jobId = StartDocPrinter(hPrinter, 1, ref docInfo);
            if (jobId == 0) {
                return -2;
            }

            if (!StartPagePrinter(hPrinter)) {
                return -3;
            }

            IntPtr pBytes = Marshal.AllocHGlobal(data.Length);
            try {
                Marshal.Copy(data, 0, pBytes, data.Length);
                bSuccess = WritePrinter(hPrinter, pBytes, data.Length, out dwWritten);
            } finally {
                Marshal.FreeHGlobal(pBytes);
            }

            if (!bSuccess || dwWritten != data.Length) {
                return -4;
            }

            if (!EndPagePrinter(hPrinter)) {
                return -5;
            }

            if (!EndDocPrinter(hPrinter)) {
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
    $win32Error = [System.Runtime.InteropServices.Marshal]::GetLastWin32Error()
    Write-Error "ERROR_SPOOLER: codigo=$errorCode win32=$win32Error printer=$PrinterName"
    exit 1
}

Write-Output "OK: $result bytes enviados a $PrinterName"
exit 0
