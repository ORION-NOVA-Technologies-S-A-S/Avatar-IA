// ORI · Lógica de la app de escritorio
import { Avatar } from './avatar.js';

const $ = (id) => document.getElementById(id);
const avatar = new Avatar($('lienzo'));

// ------------------------------------------------------------------ Plataforma (escritorio o celular)
// En escritorio Electron expone window.orion; en el celular (APK) se usa este reemplazo.
const plataforma = window.orion ?? {
  async leerConfig() {
    const inicial = { servidor: 'http://192.168.1.50:8765', clave: '', voz: true };
    try { return { ...inicial, ...JSON.parse(localStorage.getItem('ori-config') || '{}') }; } catch { return inicial; }
  },
  async guardarConfig(datos) {
    const cfg = { ...(await this.leerConfig()), ...datos };
    localStorage.setItem('ori-config', JSON.stringify(cfg));
    return cfg;
  },
  async rutaVRM() {
    try { return (await fetch('./avatar/nova.vrm', { method: 'HEAD' })).ok ? './avatar/nova.vrm' : null; } catch { return null; }
  },
  async guardarReporte(titulo, contenido) {
    // En Android abre el menú Compartir (Drive, WhatsApp, Archivos, correo…)
    const share = window.Capacitor?.Plugins?.Share;
    if (share) { await share.share({ title: titulo, text: contenido, dialogTitle: 'Guardar o enviar reporte' }); return null; }
    await navigator.clipboard.writeText(contenido);
    return 'el portapapeles';
  },
};
if (!window.orion) document.body.classList.add('movil');

let config = await plataforma.leerConfig();
let historial = [];
let documento = null;          // { nombre, texto }
let ocupado = false;

// ------------------------------------------------------------------ Utilidades
const cabeceras = (extra = {}) => (config.clave ? { 'x-orion-key': config.clave, ...extra } : extra);
const url = (ruta) => config.servidor.replace(/\/$/, '') + ruta;

function estadoAvatar(estado, texto) {
  avatar.setEstado(estado);
  $('estadoAvatar').textContent = texto;
}

function agregarMensaje(rol, texto = '') {
  const div = document.createElement('div');
  div.className = `msg ${rol}`;
  div.textContent = texto;
  $('mensajes').appendChild(div);
  $('mensajes').scrollTop = $('mensajes').scrollHeight;
  return div;
}

function herramientasMensaje(div, texto) {
  const barra = document.createElement('div');
  barra.className = 'herramientas';
  const copiar = document.createElement('button');
  copiar.textContent = 'Copiar';
  copiar.onclick = () => { navigator.clipboard.writeText(texto); copiar.textContent = 'Copiado'; };
  const guardar = document.createElement('button');
  guardar.textContent = 'Guardar como reporte';
  guardar.onclick = async () => {
    const titulo = (texto.match(/^#\s+(.+)$/m)?.[1]) || `Reporte ORI ${new Date().toISOString().slice(0, 10)}`;
    const ruta = await plataforma.guardarReporte(titulo, texto);
    if (ruta) agregarMensaje('sistema', `Reporte guardado en ${ruta}`);
  };
  const escuchar = document.createElement('button');
  escuchar.textContent = 'Escuchar';
  escuchar.onclick = () => { voz.cancelar(); dividirFrases(texto).forEach((f) => voz.decir(f)); };
  barra.append(copiar, guardar, escuchar);
  div.appendChild(barra);
}

function dividirFrases(texto) {
  return texto.replace(/[#*`|>-]/g, ' ').split(/(?<=[.!?:])\s+|\n+/).map((s) => s.trim()).filter((s) => s.length > 1);
}

// ------------------------------------------------------------------ Estado del servidor
async function revisarServidor() {
  const caja = $('estadoServidor');
  try {
    const r = await fetch(url('/api/estado'), { signal: AbortSignal.timeout(4000) });
    const e = await r.json();
    const ok = e.ollama && e.modelo_instalado;
    caja.className = 'estado-servidor ' + (ok ? 'ok' : 'error');
    $('textoServidor').textContent = ok
      ? `${e.modelo} · voz ${e.tts ? 'local' : 'del sistema'} · memoria ${e.memoria ? 'activa' : 'básica'}`
      : (e.ollama ? `Falta el modelo ${e.modelo}` : 'Ollama apagado');
    voz.ttsServidor = !!e.tts;
  } catch {
    caja.className = 'estado-servidor error';
    $('textoServidor').textContent = 'Servidor ORI sin conexión';
    voz.ttsServidor = false;
  }
}

// ------------------------------------------------------------------ Voz (habla con movimiento de boca)
const voz = {
  ttsServidor: false,
  cola: [],
  reproduciendo: false,
  ctx: null,
  fuente: null,
  generacion: 0,

  decir(frase) {
    if (!config.voz || !frase) return;
    // Pide el audio de inmediato para reducir la espera entre frases
    const gen = this.generacion;
    const audio = this.ttsServidor
      ? fetch(url('/api/tts'), { method: 'POST', headers: cabeceras({ 'Content-Type': 'application/json' }), body: JSON.stringify({ texto: frase }) })
          .then((r) => (r.ok ? r.arrayBuffer() : null)).catch(() => null)
      : Promise.resolve(null);
    this.cola.push({ frase, audio, gen });
    if (!this.reproduciendo) this._siguiente();
  },

  cancelar() {
    this.generacion++;
    this.cola = [];
    try { this.fuente?.stop(); } catch {}
    speechSynthesis.cancel();
    this.reproduciendo = false;
    avatar.setNivelVoz(0);
  },

  async _siguiente() {
    const item = this.cola.shift();
    if (!item) {
      this.reproduciendo = false;
      avatar.setNivelVoz(0);
      if (!ocupado) estadoAvatar('espera', 'En espera');
      return;
    }
    if (item.gen !== this.generacion) return this._siguiente();
    this.reproduciendo = true;
    estadoAvatar('hablando', 'Hablando…');
    const datos = await item.audio;
    if (item.gen !== this.generacion) return;
    if (datos) await this._reproducirWav(datos);
    else await this._vozSistema(item.frase);
    this._siguiente();
  },

  async _reproducirWav(datos) {
    this.ctx ??= new AudioContext();
    const buffer = await this.ctx.decodeAudioData(datos);
    const fuente = this.ctx.createBufferSource();
    const analizador = this.ctx.createAnalyser();
    analizador.fftSize = 512;
    fuente.buffer = buffer;
    fuente.connect(analizador).connect(this.ctx.destination);
    this.fuente = fuente;
    const muestras = new Uint8Array(analizador.fftSize);
    let activo = true;
    const medir = () => {
      if (!activo) return;
      analizador.getByteTimeDomainData(muestras);
      let suma = 0;
      for (const m of muestras) suma += ((m - 128) / 128) ** 2;
      avatar.setNivelVoz(Math.sqrt(suma / muestras.length) * 4);
      requestAnimationFrame(medir);
    };
    return new Promise((resolver) => {
      fuente.onended = () => { activo = false; avatar.setNivelVoz(0); resolver(); };
      fuente.start();
      medir();
    });
  },

  _vozSistema(frase) {
    // Respaldo: voz del sistema operativo con boca simulada
    return new Promise((resolver) => {
      const u = new SpeechSynthesisUtterance(frase);
      u.lang = 'es-CO';
      const vozEs = speechSynthesis.getVoices().find((v) => v.lang.startsWith('es'));
      if (vozEs) u.voice = vozEs;
      let activo = true;
      const simular = () => {
        if (!activo) return;
        avatar.setNivelVoz(0.3 + Math.random() * 0.5);
        setTimeout(simular, 90);
      };
      u.onstart = simular;
      u.onend = u.onerror = () => { activo = false; avatar.setNivelVoz(0); resolver(); };
      speechSynthesis.speak(u);
    });
  },
};

// ------------------------------------------------------------------ Conversación
async function enviar(texto) {
  texto = texto.trim();
  if (!texto || ocupado) return;
  voz.cancelar();
  ocupado = true;
  $('btnEnviar').disabled = true;
  agregarMensaje('user', texto);
  historial.push({ role: 'user', content: texto });
  estadoAvatar('pensando', 'Pensando…');

  const div = agregarMensaje('assistant', '…');
  let respuesta = '', pendiente = '';
  try {
    const r = await fetch(url('/api/chat'), {
      method: 'POST',
      headers: cabeceras({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ mensajes: historial, documento: documento?.texto, nombre_documento: documento?.nombre }),
    });
    if (r.status === 401) throw new Error('Clave de acceso incorrecta. Revise la configuración.');
    if (!r.ok) throw new Error(`El servidor respondió ${r.status}`);
    const lector = r.body.getReader();
    const deco = new TextDecoder();
    let bufer = '';
    while (true) {
      const { value, done } = await lector.read();
      if (done) break;
      bufer += deco.decode(value, { stream: true });
      // Avisos de estado del servidor: §Buscando: …§
      bufer = bufer.replace(/§([^§]*)§/g, (_, aviso) => {
        estadoAvatar('pensando', aviso + '…');
        agregarMensaje('sistema', '🔎 ' + aviso);
        div.parentNode.appendChild(div);   // la respuesta queda debajo del aviso
        return '';
      });
      const corte = bufer.indexOf('§');      // aviso aún incompleto: esperar
      const trozo = corte >= 0 ? bufer.slice(0, corte) : bufer;
      bufer = corte >= 0 ? bufer.slice(corte) : '';
      if (!trozo) continue;
      if (respuesta === '') estadoAvatar('hablando', 'Respondiendo…');
      respuesta += trozo;
      pendiente += trozo;
      div.textContent = respuesta;
      $('mensajes').scrollTop = $('mensajes').scrollHeight;
      // Habla por frases mientras llega el texto
      const frases = pendiente.split(/(?<=[.!?])\s+|\n+/);
      pendiente = frases.pop();
      dividirFrases(frases.join(' ')).forEach((f) => voz.decir(f));
    }
    dividirFrases(pendiente).forEach((f) => voz.decir(f));
    historial.push({ role: 'assistant', content: respuesta });
    herramientasMensaje(div, respuesta);
  } catch (e) {
    div.textContent = `No pude responder: ${e.message}`;
    historial.pop();
  } finally {
    ocupado = false;
    $('btnEnviar').disabled = false;
    if (!voz.reproduciendo) estadoAvatar('espera', 'En espera');
  }
}

$('formulario').addEventListener('submit', (e) => {
  e.preventDefault();
  const t = $('texto').value;
  $('texto').value = '';
  $('texto').style.height = 'auto';
  enviar(t);
});
$('texto').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('formulario').requestSubmit(); }
});
$('texto').addEventListener('input', (e) => {
  e.target.style.height = 'auto';
  e.target.style.height = e.target.scrollHeight + 'px';
});

document.querySelectorAll('.acciones button').forEach((b) => {
  b.addEventListener('click', () => {
    if (b.hasAttribute('data-doc') && !documento) {
      agregarMensaje('sistema', 'Primero adjunte un documento con el clip 📎');
      return;
    }
    const accion = b.dataset.accion;
    if (accion.endsWith(': ')) { $('texto').value = accion; $('texto').focus(); }
    else enviar(accion);
  });
});

// ------------------------------------------------------------------ Documentos
async function cargarDocumento(archivo) {
  if (!archivo) return;
  agregarMensaje('sistema', `Leyendo ${archivo.name}…`);
  const fd = new FormData();
  fd.append('archivo', archivo);
  try {
    const r = await fetch(url('/api/documento'), { method: 'POST', headers: cabeceras(), body: fd });
    if (!r.ok) throw new Error((await r.json()).detail || r.status);
    const d = await r.json();
    documento = { nombre: d.nombre, texto: d.texto };
    $('nombreAdjunto').textContent = `${d.nombre} (${d.caracteres.toLocaleString()} caracteres${d.recortado ? ', se usará la primera parte' : ''})`;
    $('adjunto').classList.remove('oculto');
    agregarMensaje('sistema', 'Documento listo. Pídale a ORI que lo resuma, analice o genere un reporte.');
  } catch (e) {
    agregarMensaje('sistema', `No pude leer el documento: ${e.message}`);
  }
}
$('archivo').addEventListener('change', (e) => { cargarDocumento(e.target.files[0]); e.target.value = ''; });
$('quitarAdjunto').addEventListener('click', () => { documento = null; $('adjunto').classList.add('oculto'); });
document.addEventListener('dragover', (e) => e.preventDefault());
document.addEventListener('drop', (e) => { e.preventDefault(); cargarDocumento(e.dataTransfer.files[0]); });

// ------------------------------------------------------------------ Micrófono
let grabadora = null, trozos = [];
$('btnMic').addEventListener('click', async () => {
  if (grabadora?.state === 'recording') { grabadora.stop(); return; }
  voz.cancelar();
  try {
    const flujo = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    const tipo = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((t) => MediaRecorder.isTypeSupported(t)) || '';
    grabadora = new MediaRecorder(flujo, tipo ? { mimeType: tipo } : undefined);
    trozos = [];
    grabadora.ondataavailable = (e) => trozos.push(e.data);
    grabadora.onstop = async () => {
      flujo.getTracks().forEach((t) => t.stop());
      $('btnMic').classList.remove('grabando');
      estadoAvatar('pensando', 'Transcribiendo…');
      const fd = new FormData();
      const ext = (grabadora.mimeType || '').includes('mp4') ? 'm4a' : 'webm';
      fd.append('audio', new Blob(trozos, { type: grabadora.mimeType || 'audio/webm' }), `voz.${ext}`);
      try {
        const r = await fetch(url('/api/stt'), { method: 'POST', headers: cabeceras(), body: fd });
        if (!r.ok) throw new Error((await r.json()).detail || r.status);
        const { texto } = await r.json();
        if (texto) enviar(texto);
        else { agregarMensaje('sistema', 'No le entendí, intente de nuevo.'); estadoAvatar('espera', 'En espera'); }
      } catch (e) {
        agregarMensaje('sistema', `Error de voz: ${e.message}`);
        estadoAvatar('espera', 'En espera');
      }
    };
    grabadora.start();
    $('btnMic').classList.add('grabando');
    estadoAvatar('escuchando', 'Escuchando…');
  } catch {
    agregarMensaje('sistema', 'No tengo acceso al micrófono.');
  }
});

// ------------------------------------------------------------------ Configuración
$('btnConfig').addEventListener('click', () => {
  $('cfgServidor').value = config.servidor;
  $('cfgClave').value = config.clave;
  $('cfgVoz').checked = config.voz;
  $('dlgConfig').showModal();
});
$('dlgConfig').addEventListener('close', async () => {
  if ($('dlgConfig').returnValue !== 'guardar') return;
  config = await plataforma.guardarConfig({
    servidor: $('cfgServidor').value.trim() || 'http://127.0.0.1:8765',
    clave: $('cfgClave').value,
    voz: $('cfgVoz').checked,
  });
  revisarServidor();
});

// ------------------------------------------------------------------ Memoria (lo que ORI ha aprendido)
async function mostrarMemoria() {
  const lista = $('listaMemoria');
  lista.innerHTML = '<p class="tenue">Cargando…</p>';
  $('dlgMemoria').showModal();
  try {
    const r = await fetch(url('/api/recuerdos'), { headers: cabeceras() });
    const datos = await r.json();
    lista.innerHTML = datos.length ? '' : '<p class="tenue">ORI todavía no ha aprendido nada.</p>';
    for (const rec of datos) {
      const fila = document.createElement('div');
      fila.className = 'recuerdo';
      const txt = document.createElement('span');
      txt.textContent = rec.texto;
      const meta = document.createElement('small');
      meta.textContent = `${rec.fuente} · ${rec.fecha.slice(0, 10)}`;
      txt.appendChild(document.createElement('br'));
      txt.appendChild(meta);
      const borrar = document.createElement('button');
      borrar.className = 'icono';
      borrar.title = 'Olvidar';
      borrar.textContent = '🗑';
      borrar.onclick = async () => {
        await fetch(url(`/api/recuerdos/${rec.id}`), { method: 'DELETE', headers: cabeceras() });
        fila.remove();
      };
      fila.append(txt, borrar);
      lista.appendChild(fila);
    }
  } catch {
    lista.innerHTML = '<p class="tenue">No pude conectar con el servidor.</p>';
  }
}
$('btnMemoria').addEventListener('click', mostrarMemoria);
$('formEnsenar').addEventListener('submit', async (e) => {
  e.preventDefault();
  const texto = $('nuevoRecuerdo').value.trim();
  if (!texto) return;
  await fetch(url('/api/recuerdos'), { method: 'POST', headers: cabeceras({ 'Content-Type': 'application/json' }), body: JSON.stringify({ texto }) });
  $('nuevoRecuerdo').value = '';
  mostrarMemoria();
});

// ------------------------------------------------------------------ Inicio
const vrm = await plataforma.rutaVRM();
if (vrm) avatar.cargarVRM(vrm).catch((e) => console.warn('No se pudo cargar el VRM:', e));
await revisarServidor();
setInterval(revisarServidor, 15000);
agregarMensaje('assistant', 'Hola, soy ORI, la inteligencia artificial de Orion Nova Technologies. Puede escribirme, hablarme, adjuntarme un documento o pedirme que investigue algo en internet. Lo que me enseñe lo recordaré.');
