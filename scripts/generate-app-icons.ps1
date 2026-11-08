# Original APEX app-icon artwork, rendered from system text onto an opaque safe-area background.
Add-Type -AssemblyName System.Drawing
$iconRoot = Join-Path $PSScriptRoot '../public/icons'
New-Item -ItemType Directory -Force -Path $iconRoot | Out-Null
foreach ($iconSize in @(180,192,512)) {
 $bitmap = New-Object System.Drawing.Bitmap($iconSize,$iconSize)
 $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
 $graphics.Clear([System.Drawing.ColorTranslator]::FromHtml('#143a38'))
 $graphics.SmoothingMode='AntiAlias'
 $font = New-Object System.Drawing.Font('Arial',($iconSize*0.49),[System.Drawing.FontStyle]::Bold,[System.Drawing.GraphicsUnit]::Pixel)
 $brush = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml('#f6d35e'))
 $graphics.DrawString('A/',$font,$brush,($iconSize*0.17),($iconSize*0.19))
 $bitmap.Save((Join-Path $iconRoot "icon-$iconSize.png"),[System.Drawing.Imaging.ImageFormat]::Png)
 $font.Dispose();$brush.Dispose();$graphics.Dispose();$bitmap.Dispose()
}
