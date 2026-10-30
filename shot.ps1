param(
  [string]$Query = "?q=low&still=6",
  [string]$Out = "D:\gongzuoqu\scene\_shot.png",
  [int]$W = 900,
  [int]$H = 520,
  [int]$Budget = 20000,
  [string]$View = ""
)
$chrome = "C:\Program Files\Google\Chrome\Application\chrome.exe"
$prof = "D:\gongzuoqu\scene\_prof_$([guid]::NewGuid().ToString('N').Substring(0,6))"
New-Item -ItemType Directory -Force -Path $prof | Out-Null
if (Test-Path $Out) { Remove-Item $Out -Force }
$url = "file:///D:/gongzuoqu/scene/index.html$Query"
$args = @(
  "--headless=new", "--no-sandbox", "--disable-crash-reporter", "--disable-breakpad",
  "--user-data-dir=$prof", "--disable-gpu", "--enable-unsafe-swiftshader",
  "--hide-scrollbars", "--window-size=$W,$H", "--virtual-time-budget=$Budget",
  "--screenshot=$Out", $url
)
$p = Start-Process -FilePath $chrome -ArgumentList $args -PassThru -NoNewWindow
if (-not $p.WaitForExit(120000)) { $p.Kill(); Write-Output "TIMEOUT" }
Start-Sleep -Milliseconds 400
Remove-Item $prof -Recurse -Force -ErrorAction SilentlyContinue
if (Test-Path $Out) {
  $kb = [math]::Round((Get-Item $Out).Length / 1KB)
  Write-Output "OK $Out ${kb}KB"
} else {
  Write-Output "NO SCREENSHOT"
}
