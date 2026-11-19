#!/usr/bin/env bash
# Instala el servidor ORI en Ubuntu/Debian (máquina virtual o servidor físico).
# Uso:  cd servidor && bash instalar_linux.sh
# Sirve igual para la máquina virtual de hoy y para el servidor que compre después.
set -e
cd "$(dirname "$0")"
DIR="$(pwd)"
MODELO="${ORION_MODELO:-qwen2.5:7b}"

echo "== 1/6 Paquetes del sistema"
sudo apt-get update -y
sudo apt-get install -y python3 python3-venv python3-pip curl wget ffmpeg

echo "== 2/6 Ollama"
command -v ollama >/dev/null || curl -fsSL https://ollama.com/install.sh | sh
sudo systemctl enable --now ollama || true
sleep 3

echo "== 3/6 Modelos de IA (puede tardar varios minutos)"
ollama pull "$MODELO"
ollama pull bge-m3

echo "== 4/6 Librerías de Python"
python3 -m venv .venv
.venv/bin/pip install --upgrade pip
.venv/bin/pip install -r requirements.txt

echo "== 5/6 Voz en español (Piper)"
BASEURL="https://huggingface.co/rhasspy/piper-voices/resolve/main/es/es_MX/ald/medium"
[ -f voces/es_MX-ald-medium.onnx ] || wget -q -O voces/es_MX-ald-medium.onnx "$BASEURL/es_MX-ald-medium.onnx"
[ -f voces/es_MX-ald-medium.onnx.json ] || wget -q -O voces/es_MX-ald-medium.onnx.json "$BASEURL/es_MX-ald-medium.onnx.json"

echo "== 6/6 Servicio automático (arranca solo al encender)"
if [ ! -f .env ]; then
  echo "ORION_API_KEY=$(python3 -c 'import secrets;print(secrets.token_urlsafe(32))')" > .env
  echo "ORION_MODELO=$MODELO" >> .env
  chmod 600 .env
fi
sudo tee /etc/systemd/system/orion-ori.service >/dev/null <<EOF
[Unit]
Description=ORI - Servidor de IA de Orion Nova Technologies
After=network-online.target ollama.service

[Service]
WorkingDirectory=$DIR
EnvironmentFile=$DIR/.env
ExecStart=$DIR/.venv/bin/python $DIR/orion_server.py
Restart=always
User=$USER

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable --now orion-ori
command -v ufw >/dev/null && sudo ufw allow 8765/tcp || true

IP=$(hostname -I | awk '{print $1}')
echo
echo "  ✔ ORI está funcionando"
echo "  Dirección para la app:  http://$IP:8765"
echo "  Clave de acceso:        $(grep ORION_API_KEY .env | cut -d= -f2)"
echo "  Ver registros:          journalctl -u orion-ori -f"
