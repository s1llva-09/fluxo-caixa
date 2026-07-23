# Start local static server for desenvolvimento
# Usa Python 3 se disponível, senão tenta npx serve.

function Start-Server {
    if (Get-Command python -ErrorAction SilentlyContinue) {
        Write-Host "Usando Python 3 -> python -m http.server 5500"
        python -m http.server 5500
    } elseif (Get-Command npx -ErrorAction SilentlyContinue) {
        Write-Host "Usando npx serve -> npx serve ."
        npx serve .
    } else {
        Write-Host "Nem python nem npx foram encontrados. Instale Python 3 ou Node.js (com npx) e tente novamente." -ForegroundColor Red
    }
}

Start-Server
