// Protecao local pelo usuario Windows atual; nenhum segredo vai em argv/log.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
function dpapi(bytes, decode = false) {
  assert.equal(process.platform, "win32");
  const script =
    "Add-Type -AssemblyName System.Security; $b=[Convert]::FromBase64String([Console]::In.ReadToEnd()); [Convert]::ToBase64String([Security.Cryptography.ProtectedData]::" +
    (decode ? "Unprotect" : "Protect") +
    "($b,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser))";
  const r = spawnSync(
    path.join(
      process.env.SystemRoot,
      "System32/WindowsPowerShell/v1.0/powershell.exe",
    ),
    [
      "-NoProfile",
      "-NonInteractive",
      "-EncodedCommand",
      Buffer.from(script, "utf16le").toString("base64"),
    ],
    {
      input: bytes.toString("base64"),
      encoding: "utf8",
      windowsHide: true,
      timeout: 15000,
    },
  );
  assert.equal(r.status, 0, "DPAPI indisponivel");
  return Buffer.from(r.stdout.trim(), "base64");
}
function privateDirectory(directory) {
  assert.ok(path.isAbsolute(directory));
  assert.ok(!fs.existsSync(directory));
  fs.mkdirSync(directory, { recursive: true });
  const sid = spawnSync("whoami", ["/user", "/fo", "csv", "/nh"], {
    encoding: "utf8",
    windowsHide: true,
  }).stdout.match(/S-1-5-[0-9-]+/)?.[0];
  assert.ok(sid);
  const acl = spawnSync(
    "icacls",
    [
      directory,
      "/inheritance:r",
      "/grant:r",
      "*" + sid + ":(OI)(CI)F",
      "*S-1-5-18:(OI)(CI)F",
    ],
    { encoding: "utf8", windowsHide: true },
  );
  assert.equal(acl.status, 0, "ACL privada nao aplicada");
}
function savePrivate(file, value) {
  fs.writeFileSync(file, dpapi(Buffer.from(JSON.stringify(value))));
}
function readPrivate(file) {
  return JSON.parse(dpapi(fs.readFileSync(file), true).toString("utf8"));
}
module.exports = { dpapi, privateDirectory, savePrivate, readPrivate };
