Add-Type -AssemblyName System.Drawing
$dir = $PSScriptRoot
$src = "C:\Users\A\AppData\Local\Temp\claude\C--Users-A\677f14c0-b9d5-404b-a18d-9641e38427d4\images\1.jpg"
$srcImg = [System.Drawing.Image]::FromFile($src)

function New-Icon($size, $padRatio, $bgHex, $file) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $bg = [System.Drawing.ColorTranslator]::FromHtml($bgHex)
  $g.Clear($bg)

  $pad = [int]($size * $padRatio)
  $avail = $size - $pad * 2
  $ratio = [Math]::Min([double]$avail / $srcImg.Width, [double]$avail / $srcImg.Height)
  $w = [int]($srcImg.Width * $ratio)
  $h = [int]($srcImg.Height * $ratio)
  $x = [int](($size - $w) / 2)
  $y = [int](($size - $h) / 2)
  $g.DrawImage($srcImg, $x, $y, $w, $h)

  $g.Dispose()
  $bmp.Save((Join-Path $dir $file), [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
}

New-Icon 192 0.06 "#FFFFFF" "icon-192.png"
New-Icon 512 0.06 "#FFFFFF" "icon-512.png"
New-Icon 512 0.22 "#FFFFFF" "icon-maskable-512.png"
New-Icon 180 0.08 "#FFFFFF" "apple-touch-icon.png"

$srcImg.Dispose()
Write-Host "Icons generated in $dir"
