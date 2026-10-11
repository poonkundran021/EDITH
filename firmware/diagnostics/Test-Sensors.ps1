param(
    [string]$Address = 'http://edith-test.local',
    [ValidateSet('all','bmp','humidity','gas','mpu','led')]
    [string]$Sensor = 'all'
)
$ErrorActionPreference = 'Stop'
$Address = $Address.TrimEnd('/')
$commands = @{all='a'; bmp='b'; humidity='d'; gas='g'; mpu='m'; led='l'}
try {
    Invoke-RestMethod -Method Post -Uri "$Address/test?sensor=$($commands[$Sensor])" -TimeoutSec 5 | Out-Null
} catch {
    throw "Cannot reach EDITH at $Address. Join the same Wi-Fi, or join EDITH-Test (password edithtest) and use -Address http://192.168.4.1. $($_.Exception.Message)"
}
while ($true) {
    try {
        $readings = Invoke-RestMethod -Uri "$Address/logs" -TimeoutSec 5
        Clear-Host
        Write-Host "EDITH | $Sensor | refreshed $(Get-Date -Format T) | Ctrl+C to stop" -ForegroundColor Cyan
        Write-Host $readings
    } catch {
        Write-Warning 'ESP32 unreachable. Previously displayed readings are old. Retrying...'
    }
    Start-Sleep -Seconds 2
}
