// three-glasses.js - Interactive 3D Ultrasonic Glasses Hardware Model
import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.js';

export class GlassesViewer {
  constructor(containerId, options = {}) {
    this.container = document.getElementById(containerId);
    if (!this.container) return;

    this.distanceCm = options.distanceCm || 142;
    this.pitchDeg = options.pitchDeg || 8.4;
    this.autoRotate = true;
    this.activeHotspot = null;

    this.onHotspotChange = options.onHotspotChange || null;

    this.init();
  }

  init() {
    const width = this.container.clientWidth || 800;
    const height = this.container.clientHeight || 480;

    // Renderer
    try {
      this.renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: true,
        powerPreference: "default"
      });
    } catch (e) {
      console.warn("WebGL not supported:", e);
      return;
    }

    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
    this.container.appendChild(this.renderer.domElement);

    // Scene & Camera
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    this.camera.position.set(0, 1.2, 7.5);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xdfe8f2, 1.4);
    this.scene.add(ambientLight);

    const keyLight = new THREE.PointLight(0x00f2fe, 3.5, 25);
    keyLight.position.set(0, 3.5, 4.5);
    this.scene.add(keyLight);

    const rimLight = new THREE.PointLight(0x38bdf8, 2.2, 20);
    rimLight.position.set(-4, 2, 2);
    this.scene.add(rimLight);

    const fillLight = new THREE.DirectionalLight(0x818cf8, 1.6);
    fillLight.position.set(4, -2, -3);
    this.scene.add(fillLight);

    // Main Group
    this.glassesGroup = new THREE.Group();
    this.scene.add(this.glassesGroup);

    this.buildGlassesModel();
    this.setupEvents();
    this.animate();
  }

  buildGlassesModel() {
    // Materials
    const matFrame = new THREE.MeshStandardMaterial({
      color: 0x111622,
      metalness: 0.85,
      roughness: 0.22
    });

    const matLens = new THREE.MeshPhysicalMaterial({
      color: 0x00d2ef,
      transparent: true,
      opacity: 0.32,
      roughness: 0.08,
      metalness: 0.1,
      transmission: 0.72,
      ior: 1.5
    });

    const matMount = new THREE.MeshStandardMaterial({
      color: 0x0284c7,
      roughness: 0.35,
      metalness: 0.3
    });

    const matAlum = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      metalness: 0.92,
      roughness: 0.18
    });

    const matGrill = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      metalness: 0.7,
      roughness: 0.65
    });

    const matGoldPins = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      metalness: 0.95,
      roughness: 0.2
    });

    const matChips = new THREE.MeshStandardMaterial({
      color: 0x18181b,
      metalness: 0.5,
      roughness: 0.7
    });

    const W = 1.35;
    const Z = 1.6;
    const k = 1.05;

    // Eyeglass Rims & Lenses
    const createRim = (sign) => {
      const rimGroup = new THREE.Group();
      rimGroup.position.x = sign * W;

      const shape = new THREE.Shape();
      const halfW = Z / 2;
      const halfH = k / 2;
      const r = 0.3;

      shape.moveTo(-halfW + r, -halfH);
      shape.lineTo(halfW - r, -halfH);
      shape.quadraticCurveTo(halfW, -halfH, halfW, -halfH + r);
      shape.lineTo(halfW, halfH - r);
      shape.quadraticCurveTo(halfW, halfH, halfW - r, halfH);
      shape.lineTo(-halfW + r, halfH);
      shape.quadraticCurveTo(-halfW, halfH, -halfW, halfH - r);
      shape.lineTo(-halfW, -halfH + r);
      shape.quadraticCurveTo(-halfW, -halfH, -halfW + r, -halfH);

      const extrudeSettings = {
        depth: 0.12,
        bevelEnabled: true,
        bevelSegments: 3,
        steps: 1,
        bevelSize: 0.04,
        bevelThickness: 0.04
      };

      const rimGeom = new THREE.ExtrudeGeometry(shape, extrudeSettings);
      const rimMesh = new THREE.Mesh(rimGeom, matFrame);
      rimMesh.position.z = -0.06;
      rimGroup.add(rimMesh);

      const lensGeom = new THREE.PlaneGeometry(Z * 0.9, k * 0.9);
      const lensMesh = new THREE.Mesh(lensGeom, matLens);
      lensMesh.position.z = 0.02;
      rimGroup.add(lensMesh);

      return rimGroup;
    };

    this.glassesGroup.add(createRim(-1));
    this.glassesGroup.add(createRim(1));

    // Nose Bridge
    const bridgeGeom = new THREE.CylinderGeometry(0.045, 0.045, W - 0.2, 16);
    const bridgeMesh = new THREE.Mesh(bridgeGeom, matFrame);
    bridgeMesh.rotation.z = Math.PI / 2;
    bridgeMesh.position.set(0, 0.2, 0);
    this.glassesGroup.add(bridgeMesh);

    // Brow Bar
    const browGeom = new THREE.BoxGeometry(Z * 2 + W * 0.8, 0.1, 0.12);
    const browMesh = new THREE.Mesh(browGeom, matFrame);
    browMesh.position.set(0, k * 0.52, 0);
    this.glassesGroup.add(browMesh);

    // Temple Arms with Curved Tips
    const templeLen = 3.2;
    const createTemple = (sign) => {
      const armGroup = new THREE.Group();
      armGroup.position.set(sign * (W + Z / 2 + 0.05), k * 0.45, 0);

      const armGeom = new THREE.BoxGeometry(0.08, 0.12, templeLen);
      const armMesh = new THREE.Mesh(armGeom, matFrame);
      armMesh.position.set(0, 0, -templeLen / 2);
      armGroup.add(armMesh);

      const tipGeom = new THREE.TorusGeometry(0.28, 0.04, 12, 24, Math.PI / 1.8);
      const tipMesh = new THREE.Mesh(tipGeom, matFrame);
      tipMesh.rotation.x = Math.PI / 2;
      tipMesh.rotation.y = sign > 0 ? -Math.PI / 2 : Math.PI / 2;
      tipMesh.position.set(0, -0.22, -templeLen);
      armGroup.add(tipMesh);

      return armGroup;
    };

    this.glassesGroup.add(createTemple(-1));
    this.glassesGroup.add(createTemple(1));

    // Front Dual-Transducer Sonar Module (HC-SR04)
    const sonarGroup = new THREE.Group();
    sonarGroup.position.set(0, k * 0.52 + 0.42, 0.15);

    const sonarPcbGeom = new THREE.BoxGeometry(1.6, 0.72, 0.06);
    const sonarPcb = new THREE.Mesh(sonarPcbGeom, matMount);
    sonarGroup.add(sonarPcb);

    const cylRadius = 0.28;
    const cylLen = 0.45;
    const transOffset = 0.48;

    const createTransducer = (xOffset, type) => {
      const trans = new THREE.Group();
      trans.position.set(xOffset, 0, 0.22);

      const canGeom = new THREE.CylinderGeometry(cylRadius, cylRadius, cylLen, 32);
      const canMesh = new THREE.Mesh(canGeom, matAlum);
      canMesh.rotation.x = Math.PI / 2;
      trans.add(canMesh);

      const grillGeom = new THREE.CylinderGeometry(cylRadius * 0.9, cylRadius * 0.9, 0.03, 32);
      const grillMesh = new THREE.Mesh(grillGeom, matGrill);
      grillMesh.rotation.x = Math.PI / 2;
      grillMesh.position.z = cylLen / 2 + 0.015;
      trans.add(grillMesh);

      const ledGeom = new THREE.SphereGeometry(0.07, 16, 16);
      const ledMat = new THREE.MeshStandardMaterial({
        color: type === 'T' ? 0x00f2fe : 0x38bdf8,
        emissive: type === 'T' ? 0x00f2fe : 0x0284c7,
        emissiveIntensity: 0.85
      });
      const ledMesh = new THREE.Mesh(ledGeom, ledMat);
      ledMesh.position.z = cylLen / 2 + 0.02;
      trans.add(ledMesh);

      return trans;
    };

    sonarGroup.add(createTransducer(-transOffset, 'T'));
    sonarGroup.add(createTransducer(transOffset, 'R'));

    // Crystal Oscillator
    const xtalGeom = new THREE.CylinderGeometry(0.08, 0.08, 0.28, 16);
    const xtalMesh = new THREE.Mesh(xtalGeom, matAlum);
    xtalMesh.rotation.z = Math.PI / 2;
    xtalMesh.position.set(0, -0.15, 0.05);
    sonarGroup.add(xtalMesh);

    // 4 Header Pins
    for (let i = 0; i < 4; i++) {
      const pinGeom = new THREE.CylinderGeometry(0.015, 0.015, 0.2, 8);
      const pinMesh = new THREE.Mesh(pinGeom, matGoldPins);
      pinMesh.position.set(-0.25 + i * 0.16, -0.38, 0.02);
      sonarGroup.add(pinMesh);
    }
    this.glassesGroup.add(sonarGroup);

    // Arduino Nano Board on Right Temple
    const nanoGroup = new THREE.Group();
    nanoGroup.position.set(W + Z / 2 + 0.12, k * 0.45, -1.2);
    nanoGroup.rotation.y = Math.PI / 2;

    const nanoPcbGeom = new THREE.BoxGeometry(1.4, 0.52, 0.05);
    const nanoPcb = new THREE.Mesh(nanoPcbGeom, matMount);
    nanoGroup.add(nanoPcb);

    const mcuChipGeom = new THREE.BoxGeometry(0.35, 0.35, 0.06);
    const mcuChip = new THREE.Mesh(mcuChipGeom, matChips);
    mcuChip.position.set(0.15, 0, 0.04);
    nanoGroup.add(mcuChip);

    const usbGeom = new THREE.BoxGeometry(0.28, 0.22, 0.1);
    const usbMesh = new THREE.Mesh(usbGeom, matAlum);
    usbMesh.position.set(-0.55, 0, 0.06);
    nanoGroup.add(usbMesh);

    const smdGeom = new THREE.BoxGeometry(0.05, 0.05, 0.04);
    const ledPwr = new THREE.MeshBasicMaterial({ color: 0xef4444 });
    const ledPwrMesh = new THREE.Mesh(smdGeom, ledPwr);
    ledPwrMesh.position.set(-0.2, 0.15, 0.04);
    nanoGroup.add(ledPwrMesh);

    this.ledTx = new THREE.Mesh(smdGeom, new THREE.MeshBasicMaterial({ color: 0x22c55e }));
    this.ledTx.position.set(-0.1, 0.15, 0.04);
    nanoGroup.add(this.ledTx);

    this.ledRx = new THREE.Mesh(smdGeom, new THREE.MeshBasicMaterial({ color: 0x38bdf8 }));
    this.ledRx.position.set(0, 0.15, 0.04);
    nanoGroup.add(this.ledRx);

    this.glassesGroup.add(nanoGroup);

    // MPU-6050 IMU on Left Temple
    const imuGroup = new THREE.Group();
    imuGroup.position.set(-2.27, k * 0.45, -1.0);
    imuGroup.rotation.y = -Math.PI / 2;

    const imuPcb = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.55, 0.05), new THREE.MeshStandardMaterial({ color: 0x0369a1, roughness: 0.4 }));
    imuGroup.add(imuPcb);

    const imuChip = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, 0.05), matChips);
    imuChip.position.set(0, 0, 0.04);
    imuGroup.add(imuChip);
    this.glassesGroup.add(imuGroup);

    // ERM Coin Vibration Motor
    const hapticGroup = new THREE.Group();
    hapticGroup.position.set(-2.23, k * 0.2, -2.8);
    const motorMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.07, 24), matAlum);
    motorMesh.rotation.z = Math.PI / 2;
    hapticGroup.add(motorMesh);
    this.glassesGroup.add(hapticGroup);

    // LiPo Battery & Regulator Pack
    const batGroup = new THREE.Group();
    batGroup.position.set(W + Z / 2 + 0.1, k * 0.35, -2.4);
    const batMesh = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.32, 1.1), new THREE.MeshStandardMaterial({ color: 0xc084fc, roughness: 0.5, metalness: 0.4 }));
    batGroup.add(batMesh);
    this.glassesGroup.add(batGroup);

    // 5 Acoustic Sound Pulse Rings Propagating Forward
    this.pulseRings = [];
    this.ringCount = 5;
    for (let i = 0; i < this.ringCount; i++) {
      const ringGeom = new THREE.RingGeometry(0.15, 0.2, 32);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0x00f2fe,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.6
      });
      const ring = new THREE.Mesh(ringGeom, ringMat);
      ring.position.set(-transOffset, k * 0.52 + 0.42, 0.5 + i * 0.3);
      ring.scale.set(1 + i * 0.5, 1 + i * 0.5, 1);
      this.glassesGroup.add(ring);
      this.pulseRings.push(ring);
    }

    // Initial position & tilt
    this.glassesGroup.position.y = -0.15;
    this.glassesGroup.rotation.x = 0.15;
    this.glassesGroup.rotation.y = -0.35;
  }

  setupEvents() {
    let isDragging = false;
    let prevX = 0, prevY = 0;
    this.targetRotY = -0.35;
    this.targetRotX = 0.15;

    const onPointerDown = (e) => {
      isDragging = true;
      const x = e.touches ? e.touches[0].clientX : e.clientX;
      const y = e.touches ? e.touches[0].clientY : e.clientY;
      prevX = x;
      prevY = y;
    };

    const onPointerMove = (e) => {
      if (!isDragging) return;
      const x = e.touches ? e.touches[0].clientX : e.clientX;
      const y = e.touches ? e.touches[0].clientY : e.clientY;
      const dx = x - prevX;
      const dy = y - prevY;

      this.targetRotY += dx * 0.008;
      this.targetRotX += dy * 0.008;
      this.targetRotX = Math.max(-0.6, Math.min(0.8, this.targetRotX));

      prevX = x;
      prevY = y;
    };

    const onPointerUp = () => {
      isDragging = false;
    };

    const el = this.renderer.domElement;
    el.addEventListener('mousedown', onPointerDown);
    window.addEventListener('mousemove', onPointerMove);
    window.addEventListener('mouseup', onPointerUp);

    el.addEventListener('touchstart', onPointerDown, { passive: true });
    window.addEventListener('touchmove', onPointerMove, { passive: true });
    window.addEventListener('touchend', onPointerUp);

    // Resize observer
    this.resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = entry.contentRect.width;
        const h = entry.contentRect.height;
        if (w > 0 && h > 0) {
          this.camera.aspect = w / h;
          this.camera.updateProjectionMatrix();
          this.renderer.setSize(w, h);
        }
      }
    });
    this.resizeObserver.observe(this.container);

    this.clock = new THREE.Clock();
  }

  updateMetrics(distanceCm, pitchDeg) {
    this.distanceCm = distanceCm;
    this.pitchDeg = pitchDeg;
  }

  toggleAutoRotate() {
    this.autoRotate = !this.autoRotate;
    return this.autoRotate;
  }

  setHotspot(spot) {
    this.activeHotspot = spot;
    if (this.onHotspotChange) this.onHotspotChange(spot);
  }

  animate() {
    this.animFrameId = requestAnimationFrame(() => this.animate());

    const t = this.clock.getElapsedTime();

    // Auto rotate
    if (this.autoRotate) {
      this.targetRotY += 0.004;
    }

    // Inertia dampening
    this.glassesGroup.rotation.y += (this.targetRotY - this.glassesGroup.rotation.y) * 0.08;
    this.glassesGroup.rotation.x += (this.targetRotX - this.glassesGroup.rotation.x) * 0.08;

    // Head flexion posture tilt dynamic reaction
    const pitchRad = (this.pitchDeg * Math.PI) / 180;
    this.glassesGroup.position.y = -0.15 + Math.sin(t * 1.5) * 0.03 - pitchRad * 0.4;

    // Blinking LEDs
    if (this.ledTx) this.ledTx.visible = Math.sin(t * 20) > 0;
    if (this.ledRx) this.ledRx.visible = Math.cos(t * 15) > 0.2;

    // Acoustic sound pulse waves
    const isCaution = this.distanceCm < 80;
    for (let i = 0; i < this.ringCount; i++) {
      const progress = (t * 2.2 + i * (1 / this.ringCount)) % 1;
      const scale = 0.5 + progress * 3.5;
      this.pulseRings[i].scale.set(scale, scale, 1);
      this.pulseRings[i].position.z = 0.4 + progress * 2.8;

      const mat = this.pulseRings[i].material;
      mat.opacity = Math.max(0, (1 - progress) * 0.85);
      if (isCaution) {
        mat.color.setHex(0xf59e0b); // Caution Amber
      } else {
        mat.color.setHex(0x00f2fe); // Active Cyan
      }
    }

    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    if (this.animFrameId) cancelAnimationFrame(this.animFrameId);
    if (this.resizeObserver) this.resizeObserver.disconnect();
    if (this.renderer && this.renderer.domElement) {
      this.container.removeChild(this.renderer.domElement);
      this.renderer.dispose();
    }
  }
}
