import { exec } from 'child_process'

// Remove characters that could break out of PowerShell single-quoted strings
function sanitizePs(s: string): string {
  return s.replace(/'/g, '').replace(/[;&|`]/g, '')
}

function runPs(script: string): Promise<string | null> {
  // Encode as base64 to avoid all shell-escaping issues
  const encoded = Buffer.from(script, 'utf16le').toString('base64')
  const cmd = `powershell -NonInteractive -WindowStyle Hidden -EncodedCommand ${encoded}`
  return new Promise((resolve) => {
    exec(cmd, { timeout: 300000, encoding: 'utf8' }, (_err, stdout) => {
      resolve(stdout.trim() || null)
    })
  })
}

export function openFilePicker(title = 'Selecionar arquivo', filter = 'TAR (*.tar)|*.tar|Todos (*.*)|*.*'): Promise<string | null> {
  const safeTitle = sanitizePs(title)
  const safeFilter = sanitizePs(filter)
  const script = [
    'Add-Type -AssemblyName System.Windows.Forms;',
    '$d = New-Object System.Windows.Forms.OpenFileDialog;',
    `$d.Title = '${safeTitle}';`,
    `$d.Filter = '${safeFilter}';`,
    '$d.Multiselect = $false;',
    'if ($d.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { $d.FileName }'
  ].join(' ')
  return runPs(script)
}

export function openFolderPicker(title = 'Selecionar pasta'): Promise<string | null> {
  const safeTitle = sanitizePs(title)
  const script = [
    'Add-Type -AssemblyName System.Windows.Forms;',
    '$d = New-Object System.Windows.Forms.FolderBrowserDialog;',
    `$d.Description = '${safeTitle}';`,
    '$d.ShowNewFolderButton = $true;',
    'if ($d.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { $d.SelectedPath }'
  ].join(' ')
  return runPs(script)
}
