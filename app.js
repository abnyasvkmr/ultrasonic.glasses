// app.js - Tactile Telemetry & Kinematics State Controller
import { GlassesViewer } from './three-glasses.js';

// Audio Synthesizer Engine (Web Audio API)
let audioCtx = null;
function getAudioContext() {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (AudioCtor) audioCtx = new AudioCtor();
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

// 40kHz Ultrasonic Echo Ping Audio Synthesizer (Scaled down to audible pitch)
export function playSonarPing(distanceCm) {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const freq = 1600 - Math.max(0.05, Math.min(1, distanceCm / 300)) * 1100;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(freq * 1.2, ctx.currentTime + 0.06);

    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.09);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.09);
  } catch (err) {
    console.debug('Audio play failed:', err);
  }
}

// ERM Haptic Motor Buzz Tone
export function playHapticBuzz() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(140, ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(80, ctx.currentTime + 0.12);

    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.14);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.14);
  } catch (err) {
    console.debug('Haptic audio failed:', err);
  }
}

// Application State
export const state = {
  distanceCm: 142,
  pitchDeg: 8.4,
  soundEnabled: false,
  schematicsOpen: false,
  activeModalTab: 'wiring',
  fontVibe: 'cyber', // 'cyber' | 'syne' | 'grotesk'
  autoSimulateMotion: true
};

let viewer = null;
let motionInterval = null;

// Initialize on DOM Ready
document.addEventListener('DOMContentLoaded', () => {
  initViewer();
  bindUIEvents();
  renderAll();
  startNeckFlexionAutoSim();
});

function initViewer() {
  const container = document.getElementById('threejs-canvas-wrapper');
  if (container) {
    viewer = new GlassesViewer('threejs-canvas-wrapper', {
      distanceCm: state.distanceCm,
      pitchDeg: state.pitchDeg,
      onHotspotChange: (spot) => renderHotspotPopup(spot)
    });
  }
}

function bindUIEvents() {
  // Audio toggle
  const soundBtn = document.getElementById('toggle-sound-btn');
  if (soundBtn) {
    soundBtn.addEventListener('click', () => {
      state.soundEnabled = !state.soundEnabled;
      if (state.soundEnabled) getAudioContext();
      renderAudioButton();
    });
  }

  // Schematics trigger
  const schematicsBtns = document.querySelectorAll('.open-schematics-btn');
  schematicsBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      openSchematicsModal();
    });
  });

  const closeSchematicsBtn = document.getElementById('close-schematics-btn');
  if (closeSchematicsBtn) {
    closeSchematicsBtn.addEventListener('click', () => {
      closeSchematicsModal();
    });
  }

  const modalBackdrop = document.getElementById('schematics-modal');
  if (modalBackdrop) {
    modalBackdrop.addEventListener('click', (e) => {
      if (e.target === modalBackdrop) closeSchematicsModal();
    });
  }

  // Modal Tabs
  const tabBtns = document.querySelectorAll('.modal-tab-btn');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      state.activeModalTab = btn.getAttribute('data-tab');
      renderModalTabs();
    });
  });

  // Copy Firmware
  const copyBtn = document.getElementById('copy-firmware-btn');
  if (copyBtn) {
    copyBtn.addEventListener('click', () => {
      const code = document.getElementById('firmware-code-block')?.innerText;
      if (code) {
        navigator.clipboard.writeText(code).then(() => {
          const txt = document.getElementById('copy-btn-text');
          if (txt) {
            txt.textContent = 'COPIED!';
            setTimeout(() => { txt.textContent = 'COPY CODE'; }, 2000);
          }
        });
      }
    });
  }

  // Download .INO
  const downloadBtn = document.getElementById('download-ino-btn');
  if (downloadBtn) {
    downloadBtn.addEventListener('click', () => {
      const code = document.getElementById('firmware-code-block')?.innerText;
      if (code) {
        const blob = new Blob([code], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'ultrasonic_glasses_firmware.ino';
        a.click();
        URL.revokeObjectURL(url);
      }
    });
  }

  // Font Vibe Selector
  const fontBtns = document.querySelectorAll('.font-vibe-btn');
  fontBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      state.fontVibe = btn.getAttribute('data-vibe');
      renderFontVibe();
    });
  });

  // Obstacle Distance Slider
  const distSlider = document.getElementById('distance-range-slider');
  if (distSlider) {
    distSlider.addEventListener('input', (e) => {
      setDistance(Number(e.target.value));
    });
  }

  // Distance Presets
  document.querySelectorAll('.dist-preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const val = Number(btn.getAttribute('data-val'));
      setDistance(val);
    });
  });

  // Neck Flexion Slider
  const pitchSlider = document.getElementById('neck-flexion-slider');
  if (pitchSlider) {
    pitchSlider.addEventListener('input', (e) => {
      state.autoSimulateMotion = false;
      renderMotionToggleBtn();
      setPitch(Number(e.target.value));
    });
  }

  // Neck Flexion Presets
  document.querySelectorAll('.flexion-preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.autoSimulateMotion = false;
      renderMotionToggleBtn();
      const val = Number(btn.getAttribute('data-pitch'));
      setPitch(val);
    });
  });

  // Spine Angle Range Slider in Telemetry Lab
  const spineSlider = document.getElementById('spine-angle-slider');
  if (spineSlider) {
    spineSlider.addEventListener('input', (e) => {
      state.autoSimulateMotion = false;
      renderMotionToggleBtn();
      setPitch(Number(e.target.value));
    });
  }

  // Spine Angle Presets in Telemetry Lab
  document.querySelectorAll('.spine-preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.autoSimulateMotion = false;
      renderMotionToggleBtn();
      const val = Number(btn.getAttribute('data-pitch'));
      setPitch(val);
    });
  });

  // Auto-Simulate Toggle
  const toggleMotionBtn = document.getElementById('toggle-motion-btn');
  if (toggleMotionBtn) {
    toggleMotionBtn.addEventListener('click', () => {
      state.autoSimulateMotion = !state.autoSimulateMotion;
      renderMotionToggleBtn();
      if (state.autoSimulateMotion) {
        startNeckFlexionAutoSim();
      } else {
        stopNeckFlexionAutoSim();
      }
    });
  }

  // Reset Flexion (8°)
  const resetFlexionBtn = document.getElementById('reset-flexion-btn');
  if (resetFlexionBtn) {
    resetFlexionBtn.addEventListener('click', () => {
      state.autoSimulateMotion = false;
      renderMotionToggleBtn();
      setPitch(8.0);
    });
  }

  // 3D Autorotate Toggle
  const autoRotateBtn = document.getElementById('toggle-autorotate-btn');
  if (autoRotateBtn) {
    autoRotateBtn.addEventListener('click', () => {
      if (viewer) {
        const active = viewer.toggleAutoRotate();
        autoRotateBtn.textContent = active ? 'AUTOROTATE: ON' : 'AUTOROTATE: OFF';
        autoRotateBtn.classList.toggle('active-cyan', active);
      }
    });
  }

  // 3D Hotspot Buttons
  document.querySelectorAll('.hotspot-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const spot = btn.getAttribute('data-spot');
      if (viewer) {
        const next = viewer.activeHotspot === spot ? null : spot;
        viewer.setHotspot(next);
      }
    });
  });

  // Close Hotspot Popup
  const closeHotspotBtn = document.getElementById('close-hotspot-btn');
  if (closeHotspotBtn) {
    closeHotspotBtn.addEventListener('click', () => {
      if (viewer) viewer.setHotspot(null);
    });
  }
}

// Distance Setter
function setDistance(dist) {
  state.distanceCm = dist;
  if (viewer) viewer.updateMetrics(state.distanceCm, state.pitchDeg);

  if (state.soundEnabled) {
    playSonarPing(state.distanceCm);
    if (state.distanceCm < 80) playHapticBuzz();
  }

  renderOscilloscope();
  renderDistanceReadouts();
}

// Pitch Setter
function setPitch(pitch) {
  state.pitchDeg = parseFloat(pitch.toFixed(1));
  if (viewer) viewer.updateMetrics(state.distanceCm, state.pitchDeg);

  if (state.pitchDeg > 25.0 && state.soundEnabled) {
    playHapticBuzz();
  }

  renderCervicalFlexion();
  renderGauge();
}

// Auto Motion Simulation for Sagittal Spine
function startNeckFlexionAutoSim() {
  if (motionInterval) clearInterval(motionInterval);
  let direction = 1;
  motionInterval = setInterval(() => {
    if (!state.autoSimulateMotion) {
      clearInterval(motionInterval);
      return;
    }
    let next = state.pitchDeg + direction * 0.45;
    if (next >= 38.0) {
      direction = -1;
      next = 38.0;
    } else if (next <= 3.0) {
      direction = 1;
      next = 3.0;
    }
    setPitch(next);
  }, 45);
}

function stopNeckFlexionAutoSim() {
  if (motionInterval) clearInterval(motionInterval);
}

// Render Functions
function renderAll() {
  renderAudioButton();
  renderFontVibe();
  renderDistanceReadouts();
  renderOscilloscope();
  renderCervicalFlexion();
  renderGauge();
  renderMotionToggleBtn();
}

function renderAudioButton() {
  const btn = document.getElementById('toggle-sound-btn');
  const icon = document.getElementById('sound-icon');
  if (btn && icon) {
    if (state.soundEnabled) {
      btn.classList.add('active');
      btn.title = 'Acoustic Sound Synth Enabled';
      icon.innerHTML = `<path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/>`;
    } else {
      btn.classList.remove('active');
      btn.title = 'Acoustic Sound Muted';
      icon.innerHTML = `<path d="M11 5L6 9H2v6h4l5 4V5z"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>`;
    }
  }
}

function renderFontVibe() {
  const heroTitle = document.getElementById('hero-title');
  if (heroTitle) {
    if (state.fontVibe === 'cyber') {
      heroTitle.style.fontFamily = 'var(--font-hero-cyber)';
      heroTitle.style.letterSpacing = '0.04em';
    } else if (state.fontVibe === 'syne') {
      heroTitle.style.fontFamily = 'var(--font-hero-syne)';
      heroTitle.style.letterSpacing = '-0.02em';
    } else if (state.fontVibe === 'grotesk') {
      heroTitle.style.fontFamily = 'var(--font-hero-grotesk)';
      heroTitle.style.letterSpacing = '-0.03em';
    }
  }

  document.querySelectorAll('.font-vibe-btn').forEach(btn => {
    const vibe = btn.getAttribute('data-vibe');
    if (vibe === state.fontVibe) {
      btn.classList.add('active-cyan');
    } else {
      btn.classList.remove('active-cyan');
    }
  });
}

function renderDistanceReadouts() {
  const isCaution = state.distanceCm < 80;
  const distEl = document.getElementById('distance-readout-cm');
  if (distEl) distEl.textContent = `${state.distanceCm} cm Distance`;

  const slider = document.getElementById('distance-range-slider');
  if (slider) slider.value = state.distanceCm;

  // Presets styling
  document.querySelectorAll('.dist-preset-btn').forEach(btn => {
    const val = Number(btn.getAttribute('data-val'));
    if (Math.abs(val - state.distanceCm) < 15) {
      btn.classList.add('active-cyan');
    } else {
      btn.classList.remove('active-cyan');
    }
  });

  // Haptic trigger status
  const hapticStatus = document.getElementById('haptic-trigger-status');
  if (hapticStatus) {
    if (isCaution) {
      hapticStatus.innerHTML = `<span style="color: var(--caution-amber); font-weight: bold;">⚠ &lt; 80 cm Hazard (ACTIVE)</span>`;
    } else {
      hapticStatus.textContent = '< 80 cm Hazard (STANDBY)';
    }
  }

  // Waveform bounce indicator
  const bounceIndicator = document.getElementById('waveform-bounce-status');
  if (bounceIndicator) {
    if (isCaution) {
      bounceIndicator.textContent = '⚠ CAUTION: OBSTACLE WITHIN 80CM';
      bounceIndicator.style.color = 'var(--caution-amber)';
    } else {
      bounceIndicator.textContent = 'ACOUSTIC BOUNCE CAPTURED';
      bounceIndicator.style.color = 'var(--sonar-cyan)';
    }
  }

  // Time of flight calculation: 2 * (d / 100) / 343.2 * 1000 ms
  const timeMs = 2 * (state.distanceCm / 100) / 343.2 * 1000;
  const tofEl = document.getElementById('time-of-flight-readout');
  if (tofEl) tofEl.textContent = `+${timeMs.toFixed(1)}ms [RX ECHO RETURN]`;

  // Hero callout card distance
  const heroDistCallout = document.getElementById('hero-dist-metric');
  if (heroDistCallout) {
    heroDistCallout.textContent = `2cm – 400 cm`;
  }
}

function renderOscilloscope() {
  const isCaution = state.distanceCm < 80;
  const M = 200 + Math.max(0, Math.min(1, (state.distanceCm - 20) / 380)) * 320;

  // Waveform SVG Path
  const d = `M 0,80 L 80,80 L 85,20 L 95,140 L 105,30 L 115,130 L 125,50 L 135,110 L 145,70 L 155,90 L 165,80 L ${M-15},80 L ${M-10},40 L ${M},120 L ${M+10},55 L ${M+20},105 L ${M+30},75 L ${M+40},85 L ${M+50},80 L 600,80`;

  const wavePath = document.getElementById('oscilloscope-waveform-path');
  if (wavePath) {
    wavePath.setAttribute('d', d);
    wavePath.setAttribute('stroke', isCaution ? '#f59e0b' : '#00f2fe');
  }

  const bounceRect = document.getElementById('oscilloscope-bounce-rect');
  if (bounceRect) {
    bounceRect.setAttribute('x', M - 10);
    bounceRect.setAttribute('fill', isCaution ? 'rgba(245, 158, 11, 0.12)' : 'rgba(0, 242, 254, 0.08)');
    bounceRect.setAttribute('stroke', isCaution ? '#f59e0b' : '#0ea5e9');
  }

  const beamLine = document.getElementById('oscilloscope-beam-line');
  if (beamLine) {
    beamLine.style.left = `${(M / 600) * 100}%`;
  }
}

function renderCervicalFlexion() {
  const deg = state.pitchDeg;
  const isDanger = deg > 25.0;
  const isCaution = deg > 16.0 && !isDanger;

  // Readouts
  const angleTexts = document.querySelectorAll('.cervical-angle-text');
  angleTexts.forEach(el => {
    el.textContent = `${deg.toFixed(1)}°`;
    if (isDanger) {
      el.style.color = 'var(--hazard-red)';
    } else if (isCaution) {
      el.style.color = 'var(--caution-amber)';
    } else {
      el.style.color = 'var(--pulse-emerald)';
    }
  });

  // Slider sync
  const slider = document.getElementById('neck-flexion-slider');
  if (slider) slider.value = deg;

  const spineSlider = document.getElementById('spine-angle-slider');
  if (spineSlider) spineSlider.value = deg;

  // Status Badge
  const statusBadge = document.getElementById('flexion-status-badge');
  if (statusBadge) {
    if (isDanger) {
      statusBadge.textContent = 'DANGER: TECH-NECK';
      statusBadge.className = 'engraved-stamp engraved-stamp-red';
    } else if (isCaution) {
      statusBadge.textContent = 'CAUTION: FORWARD TILT';
      statusBadge.className = 'engraved-stamp engraved-stamp-amber';
    } else {
      statusBadge.textContent = 'ERGONOMIC: OPTIMAL';
      statusBadge.className = 'engraved-stamp engraved-stamp-emerald';
    }
  }

  // Exceeded Pill in heading
  const exceededPill = document.getElementById('flexion-limit-exceeded-pill');
  if (exceededPill) {
    exceededPill.style.display = isDanger ? 'inline-flex' : 'none';
  }

  // Kinematic calculations for SVG
  const p = deg * 1.1;
  const m = Math.sin((p * Math.PI) / 180) * 48;
  const delta = (1 - Math.cos((p * Math.PI) / 180)) * 26;
  const spinalLbs = Math.round(12 + Math.pow(deg / 40, 1.4) * 42);

  const lbsEl = document.getElementById('spinal-load-lbs');
  if (lbsEl) {
    lbsEl.textContent = `~${spinalLbs} lbs`;
    lbsEl.style.color = isDanger ? 'var(--hazard-red)' : '#ffffff';
  }

  // ERM status
  const ermStatus = document.getElementById('erm-haptic-status');
  if (ermStatus) {
    if (isDanger) {
      ermStatus.innerHTML = `<span style="color: var(--hazard-red);" class="animate-pulse">ACTIVE 220Hz</span>`;
    } else {
      ermStatus.textContent = 'STANDBY';
      ermStatus.style.color = '#94a3b8';
    }
  }

  // SVG Kinematic Cervical Spine Elements
  const spineCurve = document.getElementById('svg-cervical-curve');
  if (spineCurve) {
    spineCurve.setAttribute('d', `M 205,215 Q ${210 + m * 0.45},${170 + delta * 0.45} ${215 + m},${125 + delta}`);
    spineCurve.setAttribute('stroke', isDanger ? '#ef4444' : isCaution ? '#f59e0b' : '#38bdf8');
    spineCurve.setAttribute('stroke-width', isDanger ? '4' : '3');
  }

  // 4 Vertebrae dots
  const vertGroup = document.getElementById('svg-vertebrae-dots');
  if (vertGroup) {
    const fractions = [0.2, 0.45, 0.7, 0.95];
    vertGroup.innerHTML = fractions.map(v => {
      const cx = 205 + v * (10 + m);
      const cy = 215 - v * (90 - delta * 0.9);
      const color = isDanger ? '#ef4444' : isCaution ? '#f59e0b' : '#00f2fe';
      return `<circle cx="${cx}" cy="${cy}" r="4.5" fill="${color}" ${isDanger ? 'class="animate-pulse"' : ''}/>`;
    }).join('');
  }

  // Skull & Wearable rotation group
  const skullGroup = document.getElementById('svg-skull-rotation-group');
  if (skullGroup) {
    skullGroup.setAttribute('transform', `rotate(${p} 205 215)`);
  }

  // Angle arc
  const arcPath = document.getElementById('svg-angle-arc-path');
  if (arcPath) {
    const rad = (deg * Math.PI) / 180;
    const endX = 220 + Math.sin(rad) * 90;
    const endY = 220 - Math.cos(rad) * 90;
    arcPath.setAttribute('d', `M 220,130 A 90 90 0 0 1 ${endX} ${endY}`);
    arcPath.setAttribute('stroke', isDanger ? '#ef4444' : isCaution ? '#f59e0b' : '#00f2fe');
  }

  // Flexion Ray
  const rayLine = document.getElementById('svg-flexion-ray');
  if (rayLine) {
    const rad = (deg * Math.PI) / 180;
    rayLine.setAttribute('x2', 205 + Math.sin(rad) * 190);
    rayLine.setAttribute('y2', 215 - Math.cos(rad) * 190);
    rayLine.setAttribute('stroke', isDanger ? '#ef4444' : isCaution ? '#f59e0b' : '#38bdf8');
  }

  // Neck Flexion Description & Progress Bar
  const hazardDesc = document.getElementById('posture-hazard-description');
  if (hazardDesc) {
    if (isDanger) {
      hazardDesc.textContent = 'Head flexion has crossed the safe 25° cervical threshold. Temple vibration motors are actively pulsing haptic tactile cues to prompt head realignment.';
    } else if (isCaution) {
      hazardDesc.textContent = 'Moderate forward tilt detected. You are approaching the ergonomic strain boundary. Hold upright to maintain spinal neutrality.';
    } else {
      hazardDesc.textContent = 'Spine alignment is within the healthy ergonomic zone (<16°). Ultrasonic echo sensors continue ambient forward caution scans.';
    }
  }

  const gaugeBar = document.getElementById('posture-gauge-fill-bar');
  if (gaugeBar) {
    const pct = Math.min(100, (deg / 40) * 100);
    gaugeBar.style.width = `${pct}%`;
    gaugeBar.style.background = isDanger
      ? 'linear-gradient(to right, #f59e0b, #ef4444)'
      : isCaution
      ? 'linear-gradient(to right, #00f2fe, #f59e0b)'
      : 'linear-gradient(to right, #38bdf8, #00f2fe)';
  }

  // Hero Spine Callout Card
  const heroPitchEl = document.getElementById('hero-pitch-metric');
  if (heroPitchEl) {
    heroPitchEl.textContent = `Pitch: ${deg.toFixed(1)}° ${deg > 20 ? 'Warning' : 'Neutral'}`;
  }
}

function renderGauge() {
  const deg = state.pitchDeg;
  const isDanger = deg > 25.0;

  // Arc calculation (264 is perimeter)
  const v = Math.min(198, Math.max(10, (deg / 45) * 198));
  const arc = document.getElementById('gauge-progress-circle');
  if (arc) {
    arc.setAttribute('stroke-dasharray', `${v} 264`);
    arc.setAttribute('stroke', isDanger ? '#ef4444' : '#f59e0b');
  }

  const dialVal = document.getElementById('gauge-dial-value');
  if (dialVal) {
    dialVal.textContent = `${deg.toFixed(1)}°`;
    dialVal.style.color = isDanger ? 'var(--hazard-red)' : '#ffffff';
  }

  const dialPill = document.getElementById('telemetry-dial-status-pill');
  if (dialPill) {
    if (isDanger) {
      dialPill.textContent = 'SLOUCH ALERT';
      dialPill.className = 'engraved-stamp engraved-stamp-red';
    } else if (deg > 15) {
      dialPill.textContent = 'MODERATE TILT';
      dialPill.className = 'engraved-stamp engraved-stamp-amber';
    } else {
      dialPill.textContent = 'OPTIMAL';
      dialPill.className = 'engraved-stamp engraved-stamp-emerald';
    }
  }

  const hapticText = document.getElementById('dial-haptic-status-text');
  if (hapticText) {
    if (isDanger) {
      hapticText.innerHTML = `<span style="color: var(--hazard-red); font-weight: bold;" class="animate-pulse">PULSING HAPTIC ALERT</span>`;
    } else {
      hapticText.textContent = 'Silent ERM Motor Ready';
      hapticText.style.color = 'var(--sonar-cyan)';
    }
  }
}

function renderMotionToggleBtn() {
  const btn = document.getElementById('toggle-motion-btn');
  const txt = document.getElementById('motion-btn-text');
  if (btn && txt) {
    if (state.autoSimulateMotion) {
      txt.textContent = 'PAUSE MOTION';
      btn.classList.add('active-cyan');
    } else {
      txt.textContent = 'AUTO SIMULATE';
      btn.classList.remove('active-cyan');
    }
  }
}

function renderHotspotPopup(spot) {
  const popup = document.getElementById('hotspot-popup-card');
  const title = document.getElementById('hotspot-popup-title');
  const desc = document.getElementById('hotspot-popup-desc');
  if (!popup || !title || !desc) return;

  if (!spot) {
    popup.style.display = 'none';
    return;
  }

  popup.style.display = 'block';
  if (spot === 'sonar') {
    title.textContent = 'Dual 40kHz Ultrasonic Transducers';
    desc.textContent = 'Emits 40kHz acoustic square pulses mapping frontal hazards within 2cm–400cm. Mounted directly on top of the bridge.';
  } else if (spot === 'mcu') {
    title.textContent = 'Arduino Nano ATmega328P Microcontroller';
    desc.textContent = 'Runs real-time pulse interrupts on GPIO D7/D8, reading flight time with sub-millimeter math and firing haptic alerts.';
  } else if (spot === 'imu') {
    title.textContent = 'MPU6050 6-DOF Cervical IMU';
    desc.textContent = 'Calculates pitch/roll angles over fast I2C bus at 400kHz. Triggers corrective haptic pulses when slouching exceeds 25°.';
  }
}

function openSchematicsModal() {
  state.schematicsOpen = true;
  const modal = document.getElementById('schematics-modal');
  if (modal) modal.style.display = 'flex';
  renderModalTabs();
}

function closeSchematicsModal() {
  state.schematicsOpen = false;
  const modal = document.getElementById('schematics-modal');
  if (modal) modal.style.display = 'none';
}

function renderModalTabs() {
  const tabs = ['wiring', 'bom', 'firmware'];
  tabs.forEach(t => {
    const pane = document.getElementById(`modal-tab-${t}`);
    const btn = document.querySelector(`.modal-tab-btn[data-tab="${t}"]`);
    if (pane) pane.style.display = (state.activeModalTab === t) ? 'block' : 'none';
    if (btn) {
      if (state.activeModalTab === t) {
        btn.classList.add('active-cyan');
      } else {
        btn.classList.remove('active-cyan');
      }
    }
  });
}
