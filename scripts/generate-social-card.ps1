Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Drawing

$webRoot = Split-Path -Parent $PSScriptRoot
$sourcePath = Join-Path $webRoot 'assets\img\logo-512.png'
$outputPath = Join-Path $webRoot 'assets\img\social-share.png'

$canvas = New-Object System.Drawing.Bitmap 1200, 630
$canvas.SetResolution(96, 96)
$graphics = [System.Drawing.Graphics]::FromImage($canvas)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

$navy = [System.Drawing.ColorTranslator]::FromHtml('#0f1f3d')
$gold = [System.Drawing.ColorTranslator]::FromHtml('#e8a030')
$white = [System.Drawing.ColorTranslator]::FromHtml('#ffffff')
$muted = [System.Drawing.ColorTranslator]::FromHtml('#d8dfeb')
$graphics.Clear($navy)

$goldBrush = New-Object System.Drawing.SolidBrush $gold
$whiteBrush = New-Object System.Drawing.SolidBrush $white
$mutedBrush = New-Object System.Drawing.SolidBrush $muted
$graphics.FillRectangle($goldBrush, 0, 0, 18, 630)

$source = [System.Drawing.Image]::FromFile($sourcePath)
$sourceRect = New-Object System.Drawing.Rectangle 166, 78, 190, 188
$destinationRect = New-Object System.Drawing.Rectangle 100, 174, 300, 297
$graphics.DrawImage($source, $destinationRect, $sourceRect, [System.Drawing.GraphicsUnit]::Pixel)

$brandFont = New-Object System.Drawing.Font 'Segoe UI', 52, ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
$headlineFont = New-Object System.Drawing.Font 'Georgia', 54, ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
$detailFont = New-Object System.Drawing.Font 'Segoe UI', 26, ([System.Drawing.FontStyle]::Regular), ([System.Drawing.GraphicsUnit]::Pixel)
$smallFont = New-Object System.Drawing.Font 'Segoe UI', 21, ([System.Drawing.FontStyle]::Regular), ([System.Drawing.GraphicsUnit]::Pixel)

$graphics.DrawString('ClasesDe10', $brandFont, $goldBrush, 468, 124)
$headlineBox = New-Object System.Drawing.RectangleF 468, 214, 640, 180
$graphics.DrawString("El profesor adecuado,`npara cada alumno.", $headlineFont, $whiteBrush, $headlineBox)
$graphics.DrawString('Clases particulares presenciales y online', $detailFont, $mutedBrush, 472, 430)
$graphics.DrawString('clasesde10.com', $smallFont, $mutedBrush, 472, 500)

$canvas.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)

$source.Dispose()
$brandFont.Dispose()
$headlineFont.Dispose()
$detailFont.Dispose()
$smallFont.Dispose()
$goldBrush.Dispose()
$whiteBrush.Dispose()
$mutedBrush.Dispose()
$graphics.Dispose()
$canvas.Dispose()

Write-Output $outputPath
