param(
    [ValidateSet('catalogue', 'admin')]
    [string]$Action = 'catalogue'
)

$ErrorActionPreference = 'Stop'
$projectPath = Split-Path -Parent $PSScriptRoot
$previousUri = $env:MONGO_URI
$previousEmail = $env:ADMIN_EMAIL
$previousDns = $env:ATLAS_DNS_SERVERS
$atlasUri = Read-Host 'Colle MONGO_URI du projet Atlas cible (saisie masquee)' -AsSecureString
$uriPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($atlasUri)
try {
    $env:MONGO_URI = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($uriPointer).Trim()
    if ($env:MONGO_URI -notmatch '^mongodb\+srv://') {
        throw 'Une adresse Atlas mongodb+srv:// est requise.'
    }
    $env:ATLAS_DNS_SERVERS = '1.1.1.1,8.8.8.8'
    if ($Action -eq 'admin') {
        $env:ADMIN_EMAIL = Read-Host 'Email exact du compte existant a promouvoir'
        & node (Join-Path $projectPath 'backend/admin.js') --promote-admin
    } else {
        & node (Join-Path $projectPath 'backend/seeder.js') --seed-products
    }
    if ($LASTEXITCODE -ne 0) { throw 'Operation non terminee. Consulter le message precedent.' }
} finally {
    $env:MONGO_URI = $previousUri
    $env:ADMIN_EMAIL = $previousEmail
    $env:ATLAS_DNS_SERVERS = $previousDns
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($uriPointer)
}
