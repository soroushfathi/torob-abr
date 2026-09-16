param([string]$SourceDirectory = 'D:\Projects\ForoushYar\IRANYekanX(Pro)\IRANYekanX(Pro)\Webfonts\woff2')
$ErrorActionPreference = 'Stop'
$fontTarget = Join-Path $PSScriptRoot '..\public\fonts'
New-Item -ItemType Directory -Path $fontTarget -Force | Out-Null
foreach ($weight in @('Regular', 'Medium', 'DemiBold', 'Bold', 'ExtraBold')) {
    $fontFile = "IRANYekanX-$weight.woff2"
    Copy-Item -LiteralPath (Join-Path $SourceDirectory $fontFile) -Destination (Join-Path $fontTarget $fontFile)
}
Write-Output 'Installed five local IRANYekanX webfont weights.'
