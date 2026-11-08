# Draws the app icons (plum square, blush speech bubble, orange "&").
# Usage: powershell -ExecutionPolicy Bypass -File tools\make-icons.ps1
Add-Type -AssemblyName System.Drawing
$out = Join-Path (Split-Path -Parent $PSScriptRoot) 'icons'
New-Item -ItemType Directory -Force $out | Out-Null
$plum = [Drawing.ColorTranslator]::FromHtml('#8F2D56')
$blush = [Drawing.ColorTranslator]::FromHtml('#E5D4CE')
$orange = [Drawing.ColorTranslator]::FromHtml('#BD632F')

function Draw([int]$size, [string]$file, [double]$pad = 0.0, [bool]$rounded = $false) {
  $bmp = New-Object Drawing.Bitmap $size, $size
  $g = [Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'; $g.TextRenderingHint = 'AntiAliasGridFit'
  $g.Clear([Drawing.Color]::Transparent)
  $bg = New-Object Drawing.SolidBrush $plum
  if ($rounded) {
    $r = $size * 0.22; $p = New-Object Drawing.Drawing2D.GraphicsPath
    $p.AddArc(0, 0, $r * 2, $r * 2, 180, 90); $p.AddArc($size - $r * 2, 0, $r * 2, $r * 2, 270, 90)
    $p.AddArc($size - $r * 2, $size - $r * 2, $r * 2, $r * 2, 0, 90); $p.AddArc(0, $size - $r * 2, $r * 2, $r * 2, 90, 90); $p.CloseFigure()
    $g.FillPath($bg, $p)
  } else { $g.FillRectangle($bg, 0, 0, $size, $size) }

  # speech bubble, scaled into the safe area
  $s = $size * (1 - 2 * $pad); $o = $size * $pad
  $bx = $o + $s * 0.16; $by = $o + $s * 0.18; $bw = $s * 0.68; $bh = $s * 0.52; $br = $s * 0.16
  $bub = New-Object Drawing.Drawing2D.GraphicsPath
  $bub.AddArc($bx, $by, $br * 2, $br * 2, 180, 90); $bub.AddArc($bx + $bw - $br * 2, $by, $br * 2, $br * 2, 270, 90)
  $bub.AddArc($bx + $bw - $br * 2, $by + $bh - $br * 2, $br * 2, $br * 2, 0, 90)
  $bub.AddLine($bx + $bw * 0.42, $by + $bh, $bx + $bw * 0.22, $by + $bh + $s * 0.15)
  $bub.AddLine($bx + $bw * 0.24, $by + $bh, $bx + $br, $by + $bh)
  $bub.AddArc($bx, $by + $bh - $br * 2, $br * 2, $br * 2, 90, 90); $bub.CloseFigure()
  $g.FillPath((New-Object Drawing.SolidBrush $blush), $bub)

  $font = New-Object Drawing.Font 'Georgia', ([float]($s * 0.40)), ([Drawing.FontStyle]::Bold -bor [Drawing.FontStyle]::Italic), ([Drawing.GraphicsUnit]::Pixel)
  $sf = New-Object Drawing.StringFormat; $sf.Alignment = 'Center'; $sf.LineAlignment = 'Center'
  $g.DrawString('&', $font, (New-Object Drawing.SolidBrush $orange), (New-Object Drawing.RectangleF ([float]$bx), ([float]($by + $s * 0.01)), ([float]$bw), ([float]$bh)), $sf)
  $g.Dispose()
  $bmp.Save((Join-Path $out $file), [Drawing.Imaging.ImageFormat]::Png); $bmp.Dispose()
}
Draw 192 'icon-192.png' 0 $true
Draw 512 'icon-512.png' 0 $true
Draw 512 'icon-maskable-512.png' 0.1 $false
Draw 180 'apple-touch-icon.png' 0 $false
Draw 64 'favicon-64.png' 0 $true
"Icons written to $out"
