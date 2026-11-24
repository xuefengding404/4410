# Build the free/geek edition installer (Tauri, GNU toolchain, no admin/MSVC).
param()

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) {
  $node = 'C:\Users\YANGdamowang.DESKTOP-U9R3T5U\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe'
}
$cargoBin = Join-Path $env:USERPROFILE '.cargo\bin'
$mingw = 'C:\Temp\msys2\msys64\mingw64\bin'
$targetDir = 'C:\Temp\starry-target'
$icons = 'C:\Temp\starry-icons'
$override = 'C:\Temp\starry-tauri-override.json'
$version = (Get-Content (Join-Path $root 'package.json') -Raw | ConvertFrom-Json).version

Push-Location $root
try {
  & $node 'node_modules\typescript\bin\tsc' --noEmit
  if ($LASTEXITCODE -ne 0) { throw "typecheck failed: $LASTEXITCODE" }
  & $node 'node_modules\vite\bin\vite.js' build
  if ($LASTEXITCODE -ne 0) { throw "vite build failed: $LASTEXITCODE" }
} finally {
  Pop-Location
}

$isAscii = $root -match '^[\x00-\x7F]+$'
if ($isAscii) {
  $work = $root
} else {
  $link = 'C:\Temp\starry-tauri-src'
  if (Test-Path $link) { cmd.exe /c "rmdir `"$link`"" | Out-Null }
  cmd.exe /c "mklink /J `"$link`" `"$root`"" | Out-Null
  $work = $link
}

New-Item -ItemType Directory -Force $icons, $targetDir | Out-Null
Copy-Item (Join-Path $root 'src-tauri\icons\icon.ico') (Join-Path $icons 'icon.ico') -Force

$config = @{
  build = @{ frontendDist = '../dist' }
  productName = 'StarryTheater Geek'
  identifier = 'com.starrytheater.geek'
  bundle = @{
    active = $true
    targets = @('nsis')
    icon = @('C:/Temp/starry-icons/icon.ico')
    windows = @{ nsis = @{ installMode = 'currentUser'; languages = @('SimpChinese') } }
  }
}
[IO.File]::WriteAllText($override, ($config | ConvertTo-Json -Depth 8), (New-Object System.Text.UTF8Encoding($false)))

$env:PATH = "$cargoBin;$mingw;$env:PATH"
$env:RUSTUP_TOOLCHAIN = 'stable-x86_64-pc-windows-gnu'
$env:CARGO_TARGET_X86_64_PC_WINDOWS_GNU_LINKER = Join-Path $mingw 'x86_64-w64-mingw32-gcc.exe'
$env:CARGO_TARGET_DIR = $targetDir

Push-Location $work
try {
  & $node (Join-Path $work 'node_modules\@tauri-apps\cli\tauri.js') build `
    --target x86_64-pc-windows-gnu --bundles nsis --config $override
  if ($LASTEXITCODE -ne 0) { throw "tauri build failed: $LASTEXITCODE" }
} finally {
  Pop-Location
}

$installer = Get-ChildItem (Join-Path $targetDir 'x86_64-pc-windows-gnu\release\bundle\nsis') -Filter '*.exe' |
  Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $installer) { throw 'installer not found' }

$installersDir = Join-Path (Split-Path -Parent $root) 'starry-theater-installers'
New-Item -ItemType Directory -Force $installersDir | Out-Null
$artifact = "starry-theater-geek-setup-$version.exe"
$dest = Join-Path $installersDir $artifact
Copy-Item $installer.FullName $dest -Force
$hash = (Get-FileHash $dest -Algorithm SHA256).Hash
"$hash  $artifact" | Set-Content -LiteralPath ($dest -replace '\.exe$', '.sha256') -Encoding ascii

Write-Host "installer: $dest"
Write-Host ("size: {0:N1} MB" -f ((Get-Item $dest).Length / 1MB))
Write-Host "sha256: $hash"
