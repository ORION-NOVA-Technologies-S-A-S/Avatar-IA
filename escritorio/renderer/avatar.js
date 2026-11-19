// ORI · Avatar humanoide 3D (Three.js)
// Usa un humanoide procedural propio. Si existe avatar/nova.vrm, carga ese modelo VRM.
import * as THREE from 'three';

const COLORES = {
  espera: 0x2de2ff,
  escuchando: 0x34d399,
  pensando: 0x8b5cf6,
  hablando: 0x2de2ff,
};

export class Avatar {
  constructor(canvas) {
    this.canvas = canvas;
    this.estado = 'espera';
    this.nivelVoz = 0;      // 0..1, controla la boca
    this.nivelSuave = 0;
    this.mirada = new THREE.Vector2();
    this.proximoParpadeo = 2;
    this.parpadeo = 0;
    this.reloj = new THREE.Clock();
    this.vrm = null;
    this.colorActual = new THREE.Color(COLORES.espera);
    this.colorDestino = new THREE.Color(COLORES.espera);

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;

    this.escena = new THREE.Scene();
    this.camara = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
    this.camara.position.set(0, 1.45, 4.2);
    this.camara.lookAt(0, 1.3, 0);

    this.#luces();
    this.#entorno();
    this.cuerpo = this.#crearHumanoide();
    this.escena.add(this.cuerpo);

    window.addEventListener('resize', () => this.#ajustar());
    window.addEventListener('mousemove', (e) => {
      this.mirada.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    });
    this.#ajustar();
    this.renderer.setAnimationLoop(() => this.#animar());
  }

  setEstado(estado) {
    this.estado = estado;
    this.colorDestino.set(COLORES[estado] ?? COLORES.espera);
  }

  setNivelVoz(v) { this.nivelVoz = Math.max(0, Math.min(1, v)); }

  // ---------------------------------------------------------------- VRM opcional
  async cargarVRM(url) {
    const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
    const { VRMLoaderPlugin, VRMUtils } = await import('@pixiv/three-vrm');
    const loader = new GLTFLoader();
    loader.register((p) => new VRMLoaderPlugin(p));
    const gltf = await loader.loadAsync(url);
    const vrm = gltf.userData.vrm;
    VRMUtils.removeUnnecessaryVertices(gltf.scene);
    VRMUtils.rotateVRM0(vrm);
    // Brazos abajo (pose relajada)
    const h = vrm.humanoid;
    h.getNormalizedBoneNode('leftUpperArm')?.rotation.set(0, 0, -1.2);
    h.getNormalizedBoneNode('rightUpperArm')?.rotation.set(0, 0, 1.2);
    this.escena.remove(this.cuerpo);
    this.escena.add(vrm.scene);
    this.vrm = vrm;
    // Encuadre según la altura de la cabeza del modelo
    const cabeza = h.getNormalizedBoneNode('head');
    const pos = new THREE.Vector3();
    cabeza.getWorldPosition(pos);
    this.camara.position.set(0, pos.y, 2.4);
    this.camara.lookAt(0, pos.y - 0.12, 0);
  }

  // ---------------------------------------------------------------- Escena
  #luces() {
    this.escena.add(new THREE.HemisphereLight(0x9fb8ff, 0x0a0f25, 0.9));
    const clave = new THREE.DirectionalLight(0xffffff, 2.2);
    clave.position.set(2, 3, 4);
    this.escena.add(clave);
    this.luzBorde = new THREE.PointLight(COLORES.espera, 25, 8);
    this.luzBorde.position.set(-1.5, 2, -1.5);
    this.escena.add(this.luzBorde);
  }

  #entorno() {
    // Anillo luminoso en el piso
    const piso = new THREE.Mesh(
      new THREE.RingGeometry(0.9, 1.0, 96),
      new THREE.MeshBasicMaterial({ color: COLORES.espera, transparent: true, opacity: 0.5, side: THREE.DoubleSide }),
    );
    piso.rotation.x = -Math.PI / 2;
    piso.position.y = 0.05;
    this.piso = piso;
    this.escena.add(piso);

    // Partículas flotantes
    const n = 400, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const r = 1.5 + Math.random() * 3, a = Math.random() * Math.PI * 2;
      pos.set([Math.cos(a) * r, Math.random() * 3.5, Math.sin(a) * r - 1], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.particulas = new THREE.Points(g, new THREE.PointsMaterial({ color: 0x6fa8ff, size: 0.02, transparent: true, opacity: 0.7 }));
    this.escena.add(this.particulas);
  }

  #crearHumanoide() {
    const raiz = new THREE.Group();
    const blanco = new THREE.MeshPhysicalMaterial({ color: 0xe9eef8, metalness: 0.25, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.15 });
    const gris = new THREE.MeshStandardMaterial({ color: 0x2a3352, metalness: 0.8, roughness: 0.35 });
    const visorMat = new THREE.MeshPhysicalMaterial({ color: 0x03060f, metalness: 0.9, roughness: 0.05, clearcoat: 1 });
    this.matBrillo = new THREE.MeshBasicMaterial({ color: COLORES.espera });

    // Torso
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 0.55, 8, 32), blanco);
    torso.scale.set(1.15, 1, 0.7);
    torso.position.y = 0.72;
    raiz.add(torso);
    this.torso = torso;

    const nucleo = new THREE.Mesh(new THREE.CircleGeometry(0.07, 32), this.matBrillo);
    nucleo.position.set(0, 0.95, 0.3);
    raiz.add(nucleo);
    const aroNucleo = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.012, 12, 48), gris);
    aroNucleo.position.copy(nucleo.position);
    raiz.add(aroNucleo);

    // Hombros y brazos
    for (const lado of [-1, 1]) {
      const hombro = new THREE.Mesh(new THREE.SphereGeometry(0.17, 32, 16), blanco);
      hombro.position.set(0.56 * lado, 1.12, 0);
      raiz.add(hombro);
      const brazo = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.5, 6, 16), blanco);
      brazo.position.set(0.66 * lado, 0.75, 0);
      brazo.rotation.z = 0.12 * lado;
      raiz.add(brazo);
      const codo = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.02, 8, 24), this.matBrillo);
      codo.rotation.x = Math.PI / 2;
      codo.position.set(0.69 * lado, 0.52, 0);
      raiz.add(codo);
    }

    // Cuello
    const cuello = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 0.22, 24), gris);
    cuello.position.y = 1.3;
    raiz.add(cuello);

    // Cabeza (grupo que gira)
    const cabeza = new THREE.Group();
    cabeza.position.y = 1.68;
    raiz.add(cabeza);
    this.cabeza = cabeza;

    const craneo = new THREE.Mesh(new THREE.SphereGeometry(0.34, 48, 32), blanco);
    craneo.scale.set(0.95, 1.1, 1);
    cabeza.add(craneo);

    const visor = new THREE.Mesh(new THREE.SphereGeometry(0.345, 48, 32, Math.PI * 0.18, Math.PI * 0.64, Math.PI * 0.3, Math.PI * 0.42), visorMat);
    visor.scale.set(0.97, 1.1, 1.02);
    cabeza.add(visor);

    // Ojos
    this.ojos = [];
    for (const lado of [-1, 1]) {
      const ojo = new THREE.Mesh(new THREE.CapsuleGeometry(0.028, 0.05, 4, 12), this.matBrillo);
      ojo.position.set(0.11 * lado, 0.06, 0.35);
      ojo.rotation.z = Math.PI / 2;
      cabeza.add(ojo);
      this.ojos.push(ojo);
    }

    // Boca tipo ecualizador
    this.boca = [];
    for (let i = 0; i < 7; i++) {
      const barra = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.04, 0.01), this.matBrillo);
      barra.position.set((i - 3) * 0.03, -0.11, 0.355);
      cabeza.add(barra);
      this.boca.push(barra);
    }

    // Orejas
    for (const lado of [-1, 1]) {
      const oreja = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.06, 32), gris);
      oreja.rotation.z = Math.PI / 2;
      oreja.position.set(0.33 * lado, 0.02, 0);
      cabeza.add(oreja);
      const luz = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.01, 8, 32), this.matBrillo);
      luz.rotation.y = Math.PI / 2;
      luz.position.set(0.365 * lado, 0.02, 0);
      cabeza.add(luz);
    }

    // Halo
    this.halo = new THREE.Mesh(
      new THREE.TorusGeometry(0.48, 0.008, 8, 96),
      new THREE.MeshBasicMaterial({ color: COLORES.espera, transparent: true, opacity: 0.8 }),
    );
    this.halo.position.y = 1.72;
    this.halo.rotation.x = Math.PI / 2.3;
    raiz.add(this.halo);

    return raiz;
  }

  #ajustar() {
    const { clientWidth: w, clientHeight: h } = this.canvas.parentElement;
    this.renderer.setSize(w, h, false);
    this.camara.aspect = w / h;
    this.camara.updateProjectionMatrix();
  }

  // ---------------------------------------------------------------- Animación
  #animar() {
    const dt = Math.min(this.reloj.getDelta(), 0.05);
    const t = this.reloj.elapsedTime;

    this.nivelSuave += (this.nivelVoz - this.nivelSuave) * Math.min(1, dt * 18);
    this.colorActual.lerp(this.colorDestino, dt * 4);

    // Parpadeo
    this.proximoParpadeo -= dt;
    if (this.proximoParpadeo <= 0) { this.parpadeo = 1; this.proximoParpadeo = 2 + Math.random() * 4; }
    this.parpadeo = Math.max(0, this.parpadeo - dt * 7);
    const ojoAbierto = 1 - Math.sin(this.parpadeo * Math.PI);

    if (this.vrm) {
      const em = this.vrm.expressionManager;
      em?.setValue('aa', this.nivelSuave * 0.9);
      em?.setValue('blink', 1 - ojoAbierto);
      const cuello = this.vrm.humanoid.getNormalizedBoneNode('neck');
      if (cuello) {
        cuello.rotation.y = this.mirada.x * 0.25 + Math.sin(t * 0.5) * 0.05;
        cuello.rotation.x = -this.mirada.y * 0.12;
      }
      const pecho = this.vrm.humanoid.getNormalizedBoneNode('chest');
      if (pecho) pecho.rotation.x = Math.sin(t * 1.6) * 0.015;
      this.vrm.update(dt);
    } else {
      this.matBrillo.color.copy(this.colorActual);
      this.halo.material.color.copy(this.colorActual);

      // Respiración y balanceo
      this.cuerpo.position.y = Math.sin(t * 1.6) * 0.01;
      this.torso.scale.y = 1 + Math.sin(t * 1.6) * 0.01;
      const objetivoY = this.mirada.x * 0.35 + Math.sin(t * 0.45) * 0.06;
      const objetivoX = -this.mirada.y * 0.18 + (this.estado === 'pensando' ? -0.12 : 0);
      this.cabeza.rotation.y += (objetivoY - this.cabeza.rotation.y) * dt * 3;
      this.cabeza.rotation.x += (objetivoX - this.cabeza.rotation.x) * dt * 3;
      this.cabeza.rotation.z = this.estado === 'escuchando' ? 0.08 : Math.sin(t * 0.7) * 0.02;

      for (const ojo of this.ojos) ojo.scale.set(1, 1, 1).setY(Math.max(0.08, ojoAbierto));

      // Boca: barras reaccionan a la voz
      this.boca.forEach((b, i) => {
        const centro = 1 - Math.abs(i - 3) / 4;
        const ruido = 0.6 + 0.4 * Math.sin(t * 22 + i * 1.7);
        b.scale.y = 0.4 + this.nivelSuave * 4.5 * centro * ruido;
      });

      // Halo
      const vel = this.estado === 'pensando' ? 3 : this.estado === 'hablando' ? 1.2 : 0.4;
      this.halo.rotation.z += dt * vel;
      this.halo.scale.setScalar(1 + this.nivelSuave * 0.08 + (this.estado === 'escuchando' ? Math.sin(t * 6) * 0.03 : 0));
    }

    this.luzBorde.color.copy(this.colorActual);
    this.piso.material.color.copy(this.colorActual);
    this.piso.material.opacity = 0.35 + this.nivelSuave * 0.5;
    this.particulas.rotation.y = t * 0.03;

    this.renderer.render(this.escena, this.camara);
  }
}
