/* 一键出图：渲染 + 分析（在沙箱外跑一次即可） */
param(
  [string]$Q = "?q=low&still=3",
  [string]$Out = "D:\gongzuoqu\scene\_snap.png",
  [int]$W = 1200,
  [int]$H = 675
)
$chrome = "C:\Program Files\Google\Chrome\Application\chrome.exe"
$prof = "D:\gongzuoqu\scene\_prof_run"
New-Item -ItemType Directory -Force -Path $prof | Out-Null
if (Test-Path $Out) { Remove-Item $Out -Force }

$args = @(
  "--headless=new", "--no-sandbox", "--disable-crash-reporter", "--disable-breakpad",
  "--user-data-dir=$prof", "--disable-gpu", "--enable-unsafe-swiftshader", "--hide-scrollbars",
  "--window-size=$W,$H", "--virtual-time-budget=25000", "--screenshot=$Out",
  "file:///D:/gongzuoqu/scene/index.html$Q"
)
$p = Start-Process -FilePath $chrome -ArgumentList $args -PassThru -NoNewWindow
if (-not $p.WaitForExit(120000)) { $p.Kill(); Write-Output "TIMEOUT" }
if (Test-Path $Out) {
  Write-Output ("OK " + [math]::Round((Get-Item $Out).Length/1KB) + "KB -> " + $Out)
} else {
  Write-Output "NO SHOT"
}
