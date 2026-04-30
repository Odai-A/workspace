param(
  [Parameter(Mandatory)][string]$TargetExe,
  [Parameter(Mandatory)][string]$IconIco,
  [Parameter(Mandatory)][string]$ShortcutPath
)
$shell = New-Object -ComObject WScript.Shell
$sc = $shell.CreateShortcut($ShortcutPath)
$sc.TargetPath = $TargetExe
$sc.WorkingDirectory = [System.IO.Path]::GetDirectoryName($TargetExe)
$sc.IconLocation = "$IconIco,0"
$sc.Save()
