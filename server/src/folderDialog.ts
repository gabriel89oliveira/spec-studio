import { spawn } from "node:child_process";
import fs from "node:fs";
import { HttpError } from "./util.js";

/**
 * Janela nativa de escolha de pasta, aberta no computador onde o servidor roda (o do usuário).
 * Windows: seletor padrão do Explorer; macOS: Finder; Linux: zenity.
 * Devolve o caminho, ou null se o usuário cancelar.
 */
export type FolderPicker = (opts: { title: string; initial?: string }) => Promise<string | null>;

const PS_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class SsFolderPicker {
  [ComImport, Guid("DC1C5A9C-E88A-4DDE-A5A1-60F82A20AEF7")] class FileOpenDialogCom {}
  [ComImport, Guid("43826D1E-E718-42EE-BC55-A1E261C37BFE"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IShellItem {
    void BindToHandler(IntPtr pbc, ref Guid bhid, ref Guid riid, out IntPtr ppv);
    void GetParent(out IShellItem ppsi);
    void GetDisplayName(uint sigdnName, [MarshalAs(UnmanagedType.LPWStr)] out string ppszName);
    void GetAttributes(uint sfgaoMask, out uint psfgaoAttribs);
    void Compare(IShellItem psi, uint hint, out int piOrder);
  }
  [ComImport, Guid("42f85136-db7e-439c-85f1-e4075d135fc8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IFileDialog {
    [PreserveSig] int Show(IntPtr parent);
    void SetFileTypes(uint cFileTypes, IntPtr rgFilterSpec);
    void SetFileTypeIndex(uint iFileType);
    void GetFileTypeIndex(out uint piFileType);
    void Advise(IntPtr pfde, out uint pdwCookie);
    void Unadvise(uint dwCookie);
    void SetOptions(uint fos);
    void GetOptions(out uint pfos);
    void SetDefaultFolder(IShellItem psi);
    void SetFolder(IShellItem psi);
    void GetFolder(out IShellItem ppsi);
    void GetCurrentSelection(out IShellItem ppsi);
    void SetFileName([MarshalAs(UnmanagedType.LPWStr)] string pszName);
    void GetFileName([MarshalAs(UnmanagedType.LPWStr)] out string pszName);
    void SetTitle([MarshalAs(UnmanagedType.LPWStr)] string pszTitle);
    void SetOkButtonLabel([MarshalAs(UnmanagedType.LPWStr)] string pszText);
    void SetFileNameLabel([MarshalAs(UnmanagedType.LPWStr)] string pszLabel);
    void GetResult(out IShellItem ppsi);
    void AddPlace(IShellItem psi, int fdap);
    void SetDefaultExtension([MarshalAs(UnmanagedType.LPWStr)] string pszDefaultExtension);
    void Close(int hr);
    void SetClientGuid(ref Guid guid);
    void ClearClientData();
    void SetFilter(IntPtr pFilter);
  }
  [DllImport("shell32.dll", CharSet = CharSet.Unicode, PreserveSig = false)]
  static extern void SHCreateItemFromParsingName(string path, IntPtr pbc, ref Guid riid, out IShellItem item);

  public static string Pick(IntPtr owner, string title, string initial) {
    IFileDialog dlg = (IFileDialog)new FileOpenDialogCom();
    uint opts;
    dlg.GetOptions(out opts);
    dlg.SetOptions(opts | 0x20u | 0x40u | 0x800u);
    dlg.SetTitle(title);
    if (!string.IsNullOrEmpty(initial) && System.IO.Directory.Exists(initial)) {
      Guid iid = new Guid("43826D1E-E718-42EE-BC55-A1E261C37BFE");
      IShellItem folder;
      SHCreateItemFromParsingName(initial, IntPtr.Zero, ref iid, out folder);
      dlg.SetFolder(folder);
    }
    int hr = dlg.Show(owner);
    if (hr != 0) return null;
    IShellItem item;
    dlg.GetResult(out item);
    string path;
    item.GetDisplayName(0x80058000u, out path);
    return path;
  }
}
"@ -ReferencedAssemblies System.Windows.Forms
$f = New-Object System.Windows.Forms.Form
$f.TopMost = $true
$f.ShowInTaskbar = $false
$f.FormBorderStyle = 'None'
$f.StartPosition = 'Manual'
$f.Location = New-Object System.Drawing.Point(-32000, -32000)
$f.Size = New-Object System.Drawing.Size(1, 1)
$f.Show()
try {
  $r = [SsFolderPicker]::Pick($f.Handle, $env:SS_TITLE, $env:SS_INITIAL)
} finally {
  $f.Close()
}
if ($r) { [Console]::Out.Write($r) }
`;

function run(cmd: string, args: string[], env: NodeJS.ProcessEnv, timeoutMs = 10 * 60_000): Promise<{ code: number | null; out: string; err: string; missing: boolean }> {
  return new Promise((resolve) => {
    let out = "";
    let err = "";
    let settled = false;
    const done = (r: { code: number | null; missing: boolean }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ...r, out, err });
    };
    const child = spawn(cmd, args, { env, windowsHide: false, stdio: ["ignore", "pipe", "pipe"] });
    const timer = setTimeout(() => {
      child.kill();
      done({ code: null, missing: false });
    }, timeoutMs);
    child.stdout.on("data", (d) => (out += d.toString("utf8")));
    child.stderr.on("data", (d) => (err += d.toString("utf8")));
    child.on("error", (e: NodeJS.ErrnoException) => done({ code: null, missing: e.code === "ENOENT" }));
    child.on("close", (code) => done({ code, missing: false }));
  });
}

export const nativeFolderPicker: FolderPicker = async ({ title, initial }) => {
  const start = initial && fs.existsSync(initial) ? initial : "";
  const unsupported = (why: string) => new HttpError(501, `Não consegui abrir a janela de escolha de pasta (${why}).`);

  if (process.platform === "win32") {
    const encoded = Buffer.from(PS_SCRIPT, "utf16le").toString("base64");
    const r = await run("powershell.exe", ["-NoProfile", "-NonInteractive", "-STA", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encoded], { ...process.env, SS_TITLE: title, SS_INITIAL: start });
    if (r.missing) throw unsupported("PowerShell não encontrado");
    if (r.code !== 0) throw unsupported(r.err.trim().split("\n")[0] || `código ${r.code}`);
    return r.out.trim() || null;
  }
  if (process.platform === "darwin") {
    const script = `POSIX path of (choose folder with prompt "${title.replace(/"/g, "'")}"${start ? ` default location POSIX file "${start.replace(/"/g, "")}"` : ""})`;
    const r = await run("osascript", ["-e", script], process.env);
    if (r.missing) throw unsupported("osascript não encontrado");
    if (r.code !== 0) return /cancel/i.test(r.err) ? null : Promise.reject(unsupported(r.err.trim().split("\n")[0] || `código ${r.code}`));
    return r.out.trim().replace(/\/$/, "") || null;
  }
  const r = await run("zenity", ["--file-selection", "--directory", `--title=${title}`, ...(start ? [`--filename=${start}/`] : [])], process.env);
  if (r.missing) throw unsupported("instale o zenity ou digite o caminho");
  if (r.code === 1) return null;
  if (r.code !== 0) throw unsupported(r.err.trim().split("\n")[0] || `código ${r.code}`);
  return r.out.trim() || null;
};
