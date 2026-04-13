$ErrorActionPreference = "Continue"

Write-Host "Node:"
node -v

Write-Host ""
Write-Host "npm:"
npm -v

Write-Host ""
Write-Host "Claude:"
claude --version

Write-Host ""
Write-Host "Claude auth:"
claude auth status
