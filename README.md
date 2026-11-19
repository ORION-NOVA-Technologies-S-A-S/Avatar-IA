# ORI · Asistente humanoide de IA — ORION NOVA TECHNOLOGIES

Avatar 3D que habla, escucha, investiga en internet, analiza documentos y **aprende** de lo que usted le enseña.
Funciona en **escritorio (Windows/Linux)** y en **celular Android (APK)**, conectado a **su propio servidor**
con modelos de código abierto: sin pagar APIs y con los datos en casa.

```
 ┌─────────────────┐
 │ App escritorio  │──┐                         ┌──────────────────────────────────────┐
 └─────────────────┘  │   red Wi-Fi / internet  │  Servidor ORI (su máquina virtual)   │
 ┌─────────────────┐  ├───────────────────────▶ │  ├─ Ollama: Qwen 2.5 (cerebro)       │
 │ APK Android     │──┘                         │  ├─ bge-m3: memoria de aprendizaje   │
 └─────────────────┘                            │  ├─ Whisper: voz → texto             │
                                                │  ├─ Piper: texto → voz               │
                                                │  └─ Búsqueda web (DuckDuckGo/SearXNG)│
                                                └──────────────────────────────────────┘
```

## Qué hace ORI
- **Asistente empresarial:** atiende clientes con la información de `servidor/conocimiento/`.
- **Asistente personal:** responde preguntas, redacta, planea.
- **Automatización:** lee PDF, Word, Excel, CSV y TXT; resume y genera reportes.
- **Investigación:** busca en internet, lee las páginas y le entrega un reporte con fuentes.
- **Aprende sola:** guarda en su memoria lo que usted le enseña o corrige y los hallazgos de sus investigaciones.
  En el botón 🧠 puede ver todo lo que aprendió, enseñarle cosas y borrar lo que esté mal.

> ORI aprende con una **memoria**: no re-entrena el modelo. Así es más seguro, porque usted
> puede revisar y borrar lo que aprendió, y nada se pierde al cambiar de modelo o de servidor.

---

## 1. Servidor en su máquina virtual (Ubuntu/Debian)

**Recomendado para la VM:** 4 núcleos o más, **12–16 GB de RAM** y 30 GB de disco.
Con 8 GB de RAM use el modelo pequeño (paso a).

**Red de la VM:** en VirtualBox/VMware ponga el adaptador de red en **"Adaptador puente" (Bridged)**.
Así la VM tiene su propia IP en el Wi-Fi y el celular la puede alcanzar.

Copie la carpeta `servidor` a la VM y ejecute:
```
cd servidor
bash instalar_linux.sh
```
a) Para equipos con poca RAM: `ORION_MODELO=qwen2.5:3b bash instalar_linux.sh`

Al terminar le muestra **la dirección** (ej. `http://192.168.1.50:8765`) y **la clave de acceso**.
ORI queda como servicio: arranca solo cada vez que se enciende la VM.

Comandos útiles: `journalctl -u orion-ori -f` (ver qué hace) · `sudo systemctl restart orion-ori` (reiniciar).

### Pasar a su servidor nuevo (cuando lo compre)
1. Copie la carpeta `servidor` completa, **incluida `datos/memoria.db`** (es lo que ORI aprendió) y el archivo `.env` (su clave).
2. En el servidor nuevo ejecute `bash instalar_linux.sh`.
3. En la app cambie la dirección en ⚙. Listo: ORI conserva todo lo aprendido.

## 2. APK para Android

**Opción fácil, sin instalar nada (con GitHub):**
1. Suba este proyecto a un repositorio de GitHub (rama `main`).
2. Vaya a la pestaña **Actions** → **APK Android de ORI** → **Run workflow**.
3. En unos 5–8 minutos descargue el APK desde **Artifacts** (`ORI-Orion-Nova-apk`).
4. Páselo al celular, ábralo y permita "instalar apps de origen desconocido".

**Opción con Android Studio:**
```
cd movil
npm install
npx cap add android        (solo la primera vez)
npm run android
```
Luego en Android Studio: *Build → Build APK*. Agregue en `android/app/src/main/AndroidManifest.xml`
el permiso `<uses-permission android:name="android.permission.RECORD_AUDIO" />`.

**En el celular:** abra ORI → ⚙ → ponga la dirección y la clave que le dio el instalador.
El celular debe estar en el **mismo Wi-Fi** que la VM.

## 3. App de escritorio
```
cd escritorio
npm install
npm start            (probar)
npm run dist         (crear instalador .exe en escritorio/dist/)
```

## 4. Usar ORI desde fuera de casa (opcional)
Use **Cloudflare Tunnel** con su dominio (ej. `ori.orionnovatechnologies.com`) instalado en la VM.
Así el celular funciona con datos móviles, con HTTPS y sin abrir puertos del router.
Nunca exponga el puerto 8765 directamente a internet.

## 5. Personalizar
- **Información de la empresa:** `servidor/conocimiento/orion_nova.md` (precios, contacto, horarios).
- **Avatar propio:** diseñe un personaje en **VRoid Studio**, expórtelo como `.vrm` y guárdelo en `escritorio/avatar/nova.vrm` (sirve para escritorio y APK). Use solo modelos propios o con licencia comercial.
- **Buscador propio (opcional):** instale SearXNG en la VM, active el formato JSON y agregue `ORION_SEARXNG=http://127.0.0.1:8080` al archivo `.env`.
- **Personalidad:** `PROMPT_SISTEMA` en `servidor/orion_server.py`.

## Seguridad
- La clave de acceso (`.env`) protege el servidor: no la comparta ni la suba a GitHub (ya está en `.gitignore`).
- ORI no guarda contraseñas ni números de tarjeta en su memoria.
- Al leer páginas web, ORI bloquea direcciones internas de su red (protección SSRF) e ignora instrucciones escondidas en las páginas.
- Revise de vez en cuando lo aprendido (🧠): una página web puede traer datos falsos.

## Problemas comunes
| Mensaje | Solución |
|---|---|
| Servidor ORI sin conexión | Revise la dirección en ⚙, que la VM esté en modo puente y `systemctl status orion-ori` |
| Clave de acceso incorrecta | Copie la clave de `servidor/.env` en ⚙ |
| Ollama apagado | `sudo systemctl start ollama` |
| Falta el modelo | `ollama pull qwen2.5:7b` |
| Memoria básica | `ollama pull bge-m3` |
| No investiga | La VM necesita internet; pruebe `curl https://duckduckgo.com` |
| El micrófono no funciona en el celular | Ajustes → Apps → ORI → Permisos → Micrófono |
| Respuestas lentas | Use `qwen2.5:3b` o asigne más RAM y núcleos a la VM |
