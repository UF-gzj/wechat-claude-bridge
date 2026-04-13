$ErrorActionPreference = "Stop"

$targets = @(
  ".\data\cache\images",
  ".\data\cache\files",
  ".\data\cache\temp",
  ".\data\logs"
)

foreach ($target in $targets) {
  if (Test-Path $target) {
    Remove-Item -Recurse -Force $target
    Write-Host "Removed $target"
  } else {
    Write-Host "Skipped $target (not found)"
  }
}

Write-Host "Cache cleanup completed."
