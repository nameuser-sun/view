$chrome = "C:\Program Files\Google\Chrome\Application\chrome.exe"
$views = @(
  @{ n = "front"; v = "-2.14,1.34,20" },
  @{ n = "angle"; v = "-1.02,1.40,18" },
  @{ n = "across"; v = "-2.72,1.30,24" },
  @{ n = "close"; v = "-1.62,1.12,9" },
  @{ n = "high"; v = "-2.20,0.72,26" }
)
foreach ($item in $views) {
  $out = "D:\gongzuoqu\scene\_v_$($item.n).png"
  $prof = "D:\gongzuoqu\scene\_p_$($item.n)"
  New-Item -ItemType Directory -Force -Path $prof | Out-Null
  Remove-Item $out -ErrorAction SilentlyContinue
  $a = @("--headless=new","--no-sandbox","--disable-crash-reporter","--disable-breakpad",
    "--user-data-dir=$prof","--disable-gpu","--enable-unsafe-swiftshader","--hide-scrollbars",
    "--window-size=1000,560","--virtual-time-budget=22000","--screenshot=$out",
    "file:///D:/gongzuoqu/scene/index.html?q=low&still=3&view=$($item.v)")
  $p = Start-Process -FilePath $chrome -ArgumentList $a -PassThru -NoNewWindow
  if (-not $p.WaitForExit(120000)) { $p.Kill() }
  if (Test-Path $out) { Write-Output "$($item.n): OK" } else { Write-Output "$($item.n): FAIL" }
}
