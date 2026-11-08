# Turns the original date-ideas spreadsheet into seed/seed.json + seed/photos/*.jpg
# Usage:  powershell -ExecutionPolicy Bypass -File tools\build-seed.ps1 -Xlsx "path\to\date_ideas_checklist.xlsx"
# The seed folder is git-ignored: it holds personal photos and must never be published.
param(
  [Parameter(Mandatory = $true)][string]$Xlsx
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$root    = Split-Path -Parent $PSScriptRoot
$seedDir = Join-Path $root 'seed'
$photoDir = Join-Path $seedDir 'photos'
$tmp     = Join-Path ([IO.Path]::GetTempPath()) ("wt-xlsx-" + [guid]::NewGuid())
New-Item -ItemType Directory -Force $photoDir | Out-Null
Copy-Item $Xlsx "$tmp.zip"
Expand-Archive "$tmp.zip" $tmp
$xl = Join-Path $tmp 'xl'

# ---------- shared strings ----------
[xml]$ss = Get-Content -Raw -Encoding UTF8 "$xl\sharedStrings.xml"
$strs = @(); foreach ($si in $ss.sst.si) { $strs += $si.InnerText }

# ---------- photos: in-cell (rich values) ----------
$cellImg = @{}   # vm index (1-based) -> media file
[xml]$rvr = Get-Content -Raw "$xl\richData\_rels\richValueRel.xml.rels"
$relMap = @{}; foreach ($r in $rvr.Relationships.Relationship) { $relMap[$r.Id] = Split-Path -Leaf $r.Target }
[xml]$rvl = Get-Content -Raw "$xl\richData\richValueRel.xml"
$relOrder = @(); foreach ($r in $rvl.richValueRels.rel) { $relOrder += $r.GetAttribute('id', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships') }
[xml]$rv = Get-Content -Raw "$xl\richData\rdrichvalue.xml"
$i = 1; foreach ($v in $rv.rvData.rv) { $cellImg[$i] = $relMap[$relOrder[[int]$v.v[0]]]; $i++ }

# ---------- photos: floating (drawing anchored to a row) ----------
$rowImgs = @{}   # excel row number -> list of media files
if (Test-Path "$xl\drawings\drawing1.xml") {
  [xml]$drr = Get-Content -Raw "$xl\drawings\_rels\drawing1.xml.rels"
  $dmap = @{}; foreach ($r in $drr.Relationships.Relationship) { $dmap[$r.Id] = Split-Path -Leaf $r.Target }
  [xml]$dr = Get-Content -Raw "$xl\drawings\drawing1.xml"
  $ns = New-Object Xml.XmlNamespaceManager $dr.NameTable
  $ns.AddNamespace('xdr', 'http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing')
  $ns.AddNamespace('a', 'http://schemas.openxmlformats.org/drawingml/2006/main')
  foreach ($a in $dr.SelectNodes('//xdr:twoCellAnchor|//xdr:oneCellAnchor', $ns)) {
    $row = [int]$a.SelectSingleNode('xdr:from/xdr:row', $ns).InnerText + 1
    $emb = $a.SelectSingleNode('.//a:blip', $ns).GetAttribute('embed', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships')
    if (-not $rowImgs[$row]) { $rowImgs[$row] = @() }
    $rowImgs[$row] += $dmap[$emb]
  }
}

function Save-Photo([string]$media, [string]$name) {
  $img = [Drawing.Image]::FromFile("$xl\media\$media")
  try {
    # honour EXIF orientation
    if ($img.PropertyIdList -contains 0x0112) {
      switch ([int]$img.GetPropertyItem(0x0112).Value[0]) {
        3 { $img.RotateFlip('Rotate180FlipNone') } 6 { $img.RotateFlip('Rotate90FlipNone') } 8 { $img.RotateFlip('Rotate270FlipNone') }
      }
    }
    $max = 1600; $s = [Math]::Min(1.0, $max / [Math]::Max($img.Width, $img.Height))
    $w = [int]($img.Width * $s); $h = [int]($img.Height * $s)
    $bmp = New-Object Drawing.Bitmap $w, $h
    $g = [Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = 'HighQualityBicubic'; $g.Clear([Drawing.Color]::White); $g.DrawImage($img, 0, 0, $w, $h); $g.Dispose()
    $enc = [Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object MimeType -eq 'image/jpeg'
    $p = New-Object Drawing.Imaging.EncoderParameters 1
    $p.Param[0] = New-Object Drawing.Imaging.EncoderParameter ([Drawing.Imaging.Encoder]::Quality), 85L
    $bmp.Save((Join-Path $photoDir $name), $enc, $p); $bmp.Dispose()
  } finally { $img.Dispose() }
  return $name
}

# ---------- rows ----------
[xml]$sh = Get-Content -Raw -Encoding UTF8 "$xl\worksheets\sheet1.xml"
$rows = @{}
foreach ($row in $sh.worksheet.sheetData.row) {
  $cells = @{}
  foreach ($c in $row.c) {
    $col = ($c.r -replace '\d', '')
    if ($c.vm) { $cells[$col] = "@img:" + $c.vm; continue }
    $v = $c.v
    if ($c.t -eq 's') { $v = $strs[[int]$v] } elseif ($c.t -eq 'inlineStr') { $v = $c.is.InnerText }
    if ($null -ne $v -and "$v".Trim() -ne '') { $cells[$col] = "$v".Trim() }
  }
  $rows[[int]$row.r] = $cells
}

$tagEmoji = @{
  'Outdoor & Active' = '🌲'; 'Classic Date Night' = '🎳'; 'Culture & Exploring' = '🏛️'; 'Food & Treats' = '🍰'
  'Thrifting & Shopping' = '🛍️'; 'Cozy Nights In' = '🛋️'; 'Creative Projects' = '🎨'; 'Giving Back / Community' = '🤝'
}
$tags = @(); $ideas = @(); $cur = $null; $photoN = 0
foreach ($n in ($rows.Keys | Sort-Object)) {
  $c = $rows[$n]
  if ($c.Count -eq 1 -and $c.A -and $tagEmoji.ContainsKey($c.A)) { $cur = $c.A; $tags += [ordered]@{ name = $cur; emoji = $tagEmoji[$cur] }; continue }
  if (-not $cur -or $c.B -eq 'Date Idea' -or -not $c.B) { continue }   # headers / blank rows
  $done = ("$($c.C)".Trim().ToLower() -eq 'done')
  $idea = [ordered]@{ title = $c.B; tag = $cur; want = ($c.A -eq '★'); status = $(if ($done) { 'done' } else { 'not_yet' }) }
  if ($done) {
    $photos = @(); $note = $null
    $media = @()
    if ("$($c.F)".StartsWith('@img:')) { $media += $cellImg[[int]$c.F.Substring(5)] } elseif ($c.F) { $note = $c.F }
    if ($rowImgs[$n]) { $media += $rowImgs[$n] }
    foreach ($m in $media) { $photoN++; $photos += Save-Photo $m ("photo-{0:d2}.jpg" -f $photoN) }
    $recap = "$($c.E)".Trim()
    if ($note) { $recap = ("$recap`n`n📷 $note").Trim() }
    $idea.outing = [ordered]@{
      happened_on = $(if ($c.D) { [DateTime]::FromOADate([double]$c.D).ToString('yyyy-MM-dd') } else { $null })
      recap = $recap; photos = $photos
    }
  }
  $ideas += $idea
}

# total in the sheet (G1/H1) and its "as of" date (G3)
$total = [int]$rows[1].H
$asOf = $null
if ($rows[3].G -match '(\d{1,2})/(\d{1,2})/(\d{4})') { $asOf = '{0}-{1:d2}-{2:d2}' -f $matches[3], [int]$matches[1], [int]$matches[2] }
$doneCount = @($ideas | Where-Object { $_.status -eq 'done' }).Count

$seed = [ordered]@{
  source = (Split-Path -Leaf $Xlsx)
  baseline = [ordered]@{ count = $total - $doneCount; total_in_sheet = $total; as_of = $asOf; note = 'Dates before the app that are not tied to an idea' }
  tags = $tags; ideas = $ideas
}
$json = $seed | ConvertTo-Json -Depth 8
[IO.File]::WriteAllText((Join-Path $seedDir 'seed.json'), $json, (New-Object Text.UTF8Encoding $false))
Remove-Item -Recurse -Force $tmp, "$tmp.zip"
"Ideas: $($ideas.Count)  Done: $doneCount  Tags: $($tags.Count)  Photos: $photoN  Sheet total: $total  Baseline: $($total - $doneCount)  As of: $asOf"
