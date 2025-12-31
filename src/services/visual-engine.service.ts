import { Injectable, signal, computed } from '@angular/core';
import * as THREE from 'three';
import { GestureType } from './gesture.service';

// --- Types ---
type AppMode = 'COUNTDOWN' | 'SHOW';

interface ParticleSystem {
  mesh: THREE.Points;
  originalPositions: Float32Array; // Target text shape positions
  currentPositions: Float32Array;
  velocities: Float32Array;
  colors: Float32Array; // Base colors
  
  // Logic State
  state: 'ROCKET' | 'EXPLODING' | 'WEAVING' | 'FADING';
  timer: number;
  
  // Rocket specific
  rocketPos: THREE.Vector3;
  rocketVelocity: THREE.Vector3;
}

// Updated Palettes: Red, Orange, Yellow, Green, Cyan, Blue, Purple
const PALETTES = [
  { name: '赤 (Red)', colors: [0xFF0000, 0xFF4D4D, 0xFF9999, 0xFFFFFF, 0xDC143C] },
  { name: '橙 (Orange)', colors: [0xFF7F00, 0xFFA500, 0xFFD700, 0xFFFFFF, 0xFF4500] },
  { name: '黄 (Yellow)', colors: [0xFFFF00, 0xFFFFE0, 0xFFD700, 0xFFFFFF, 0xDAA520] },
  { name: '绿 (Green)', colors: [0x00FF00, 0x32CD32, 0x90EE90, 0xFFFFFF, 0x006400] },
  { name: '青 (Cyan)', colors: [0x00FFFF, 0x40E0D0, 0xE0FFFF, 0xFFFFFF, 0x008B8B] },
  { name: '蓝 (Blue)', colors: [0x0000FF, 0x1E90FF, 0x87CEFA, 0xFFFFFF, 0x000080] },
  { name: '紫 (Purple)', colors: [0x8B00FF, 0x9370DB, 0xE6E6FA, 0xFFFFFF, 0x4B0082] }
];

@Injectable({ providedIn: 'root' })
export class VisualEngineService {
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private renderer!: THREE.WebGLRenderer;
  
  // Resources
  private textPointsCache: { [key: string]: THREE.Vector3[] } = {};
  
  // Scene Objects
  private systems: ParticleSystem[] = [];
  private stars!: THREE.Points; 
  private nebula!: THREE.Points;
  private cursor!: THREE.Mesh; // Hand Cursor
  
  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2();
  
  // State
  private mode: AppMode = 'COUNTDOWN';
  private currentPaletteIndex = 1;
  
  // Interaction State
  private isHandDetected = false;
  private handGesture: GestureType = 'IDLE';

  // Control State
  public isPaused = signal(false);
  private lastTriggerTime = 0; // Debounce timer
  
  // Signals
  public currentAction = signal<string>('WAITING');
  public currentTheme = computed(() => PALETTES[this.currentPaletteIndex].name);

  async init(canvas: HTMLCanvasElement) {
    this.scene = new THREE.Scene();
    // Deep Universe Background
    this.scene.background = new THREE.Color(0x050510);
    // Subtle fog to blend distant objects, but much lighter than before to see stars
    this.scene.fog = new THREE.FogExp2(0x050510, 0.002);
    
    this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 3000);
    this.camera.position.z = 50; 

    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: false, antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    const ambient = new THREE.AmbientLight(0x222222);
    this.scene.add(ambient);

    this.createUniverse();
    this.createCursor();

    window.addEventListener('resize', () => this.onWindowResize());
    
    this.currentAction.set('READY');
    this.animate();
  }

  private createUniverse() {
    this.createStars();
    this.createNebula();
  }

  private createStars() {
    const geometry = new THREE.BufferGeometry();
    const count = 5000;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);

    for(let i=0; i<count; i++) {
        // Spread stars widely to create depth
        const x = (Math.random() - 0.5) * 2500;
        const y = (Math.random() - 0.5) * 1500;
        const z = -Math.random() * 2000; 

        positions[i*3] = x;
        positions[i*3+1] = y;
        positions[i*3+2] = z;

        // Star colors based on stellar types
        const type = Math.random();
        let r=1, g=1, b=1;
        
        if (type > 0.95) { 
            // Blue Giants (Rare)
            r=0.6; g=0.8; b=1.0;
        } else if (type > 0.8) { 
            // Yellowish
            r=1.0; g=0.9; b=0.6;
        } else if (type > 0.6) {
             // Reddish
             r=1.0; g=0.6; b=0.6;
        } else {
             // White/Dim
             const dim = 0.4 + Math.random()*0.6;
             r=dim; g=dim; b=dim;
        }
        
        colors[i*3] = r;
        colors[i*3+1] = g;
        colors[i*3+2] = b;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
        size: 1.5,
        vertexColors: true,
        transparent: true,
        opacity: 0.9,
        sizeAttenuation: true
    });

    this.stars = new THREE.Points(geometry, material);
    this.scene.add(this.stars);
  }

  private createNebula() {
     // Generate cloud texture programmatically
     const canvas = document.createElement('canvas');
     canvas.width = 128; 
     canvas.height = 128;
     const ctx = canvas.getContext('2d');
     if(ctx) {
        const g = ctx.createRadialGradient(64,64,0, 64,64,64);
        g.addColorStop(0, 'rgba(255,255,255, 0.15)'); // Soft center
        g.addColorStop(0.4, 'rgba(255,255,255, 0.05)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0,0,128,128);
     }
     const texture = new THREE.CanvasTexture(canvas);

     const geometry = new THREE.BufferGeometry();
     const count = 60; 
     const positions = new Float32Array(count * 3);
     const colors = new Float32Array(count * 3);

     for(let i=0; i<count; i++) {
        // Place clouds far back
        const x = (Math.random() - 0.5) * 1500;
        const y = (Math.random() - 0.5) * 1000;
        const z = -300 - Math.random() * 1000;

        positions[i*3] = x;
        positions[i*3+1] = y;
        positions[i*3+2] = z;

        // Nebula colors: Deep Purple, Magenta, Blue
        const c = new THREE.Color();
        const hue = 0.6 + Math.random() * 0.25; // 0.6 (Blue) to 0.85 (Magenta)
        c.setHSL(hue, 0.8, 0.3); // Low Lightness for deep space feel
        
        colors[i*3] = c.r;
        colors[i*3+1] = c.g;
        colors[i*3+2] = c.b;
     }

     geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
     geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

     const material = new THREE.PointsMaterial({
        size: 400, // Large puff
        map: texture,
        vertexColors: true,
        transparent: true,
        opacity: 0.3,
        depthWrite: false,
        blending: THREE.AdditiveBlending
     });

     this.nebula = new THREE.Points(geometry, material);
     this.scene.add(this.nebula);
  }

  private createCursor() {
    const geo = new THREE.SphereGeometry(1, 16, 16);
    const mat = new THREE.MeshBasicMaterial({ 
        color: 0x00ffff, 
        transparent: true, 
        opacity: 0.5,
        blending: THREE.AdditiveBlending 
    });
    this.cursor = new THREE.Mesh(geo, mat);
    this.cursor.visible = false;
    this.scene.add(this.cursor);
  }

  startShow() {
    this.currentAction.set('SHOW STARTED');
    this.mode = 'SHOW';
    this.runTextLoop();
  }

  // --- Sequence Logic ---

  private async runTextLoop() {
    const sequence = ['2026', '祝大家', '新年快乐', '马到成功']; 
    
    let index = 0;
    while (true) {
      if (this.mode !== 'SHOW') break;

      // Logic to pause the Spawning Sequence
      while (this.isPaused()) {
          await new Promise(r => setTimeout(r, 100));
      }

      const text = sequence[index];
      const scale = text.length > 2 ? 0.25 : 0.35;
      
      // Auto sequence spawns at center (offset 0,0)
      this.spawnRocketFirework(text, scale, 0, 0); 

      // Wait loop that respects pausing
      let elapsed = 0;
      const duration = 4000;
      while (elapsed < duration) {
          await new Promise(r => setTimeout(r, 100));
          if (!this.isPaused()) {
              elapsed += 100;
          }
      }
      
      index = (index + 1) % sequence.length;
    }
  }

  // --- Interaction & Action Logic ---

  updateHand(x: number, y: number, gesture: GestureType, isPresent: boolean) {
    if (!this.camera) return;

    this.isHandDetected = isPresent;
    this.handGesture = gesture;

    // Map [0,1] to NDC [-1, 1]
    this.mouse.x = (x * 2) - 1;
    this.mouse.y = -(y * 2) + 1;

    if (!isPresent) {
         this.currentAction.set('NO SIGNAL');
         return;
    }

    const now = Date.now();
    
    // --- GESTURE TRIGGERS (Discrete Actions) ---

    if (gesture === 'V_SIGN') {
        // Heart Shape
        if (now - this.lastTriggerTime > 1500) {
            this.spawnSpecialShape('HEART');
            this.lastTriggerTime = now;
            this.currentAction.set('❤ LOVE (V-SIGN)');
        }
    }
    else if (gesture === 'OK_SIGN') {
        // Grand Finale
        if (now - this.lastTriggerTime > 3000) {
            this.triggerFinale();
            this.lastTriggerTime = now;
            this.currentAction.set('🎆 FINALE (OK)');
        }
    }
    // PINCH and OPEN_PALM are handled in animate() for continuous zoom
    else if (gesture === 'PINCH' || gesture === 'OPEN_PALM') {
       // Just update text here if not already set by animate, 
       // but typically animate() runs more frequently.
    }
    else {
        this.currentAction.set('READY');
    }
  }

  // --- Spawning Logic ---

  private spawnRandomFirework() {
    const texts = ['福', '春', '喜', '✨', '2026', '✦', '★'];
    const randText = texts[Math.floor(Math.random() * texts.length)];
    
    // Random position within approximate view
    // Camera Z=50, fov=60. Visible height ~57 units, Width ~100 units at z=0.
    const rx = (Math.random() - 0.5) * 80;
    const ry = (Math.random() - 0.5) * 40;
    
    this.spawnRocketFirework(randText, 0.25, rx, ry);
  }

  spawnSpecialShape(type: 'HEART' | 'STAR') {
    const key = `SHAPE_${type}`;
    // Always center special shapes
    this.spawnRocketFirework(key, 1, 0, 0, type);
  }

  private triggerFinale() {
    // Spawn 6 fireworks immediately
    for(let i=0; i<6; i++) {
        setTimeout(() => {
           this.spawnRandomFirework();
        }, i * 200);
    }
  }

  private cyclePalette() {
    // Random palette that is different from current
    let nextIndex = this.currentPaletteIndex;
    while (nextIndex === this.currentPaletteIndex) {
        nextIndex = Math.floor(Math.random() * PALETTES.length);
    }
    this.currentPaletteIndex = nextIndex;
  }

  // --- Canvas & Particle Generation ---

  private getPointsFromTextCanvas(text: string, scale: number, shapeType?: string): THREE.Vector3[] {
    const cacheKey = shapeType ? shapeType : text;
    if (this.textPointsCache[cacheKey]) return this.textPointsCache[cacheKey];

    // Handle Parametric Shapes
    if (shapeType === 'HEART') {
        const count = 3000;
        const targets: THREE.Vector3[] = [];
        for(let i=0; i<count; i++) {
            const t = i/count * Math.PI * 2;
            // Heart formula
            let x = 16 * Math.pow(Math.sin(t), 3);
            let y = 13 * Math.cos(t) - 5 * Math.cos(2*t) - 2 * Math.cos(3*t) - Math.cos(4*t);
            // Scale down
            x *= 1.2; y *= 1.2;
            targets.push(new THREE.Vector3(x, y, 0));
        }
        this.textPointsCache[cacheKey] = targets;
        return targets;
    }

    // Handle Text
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return [];

    const fontSize = 100;
    ctx.font = `bold ${fontSize}px "Microsoft YaHei", "Heiti SC", sans-serif`;
    
    const measure = ctx.measureText(text);
    const width = Math.ceil(measure.width);
    const height = fontSize * 1.5;

    canvas.width = width;
    canvas.height = height;

    ctx.font = `bold ${fontSize}px "Microsoft YaHei", "Heiti SC", sans-serif`;
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, width / 2, height / 2);

    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    const points: THREE.Vector3[] = [];

    const step = 1; 
    
    for (let y = 0; y < height; y += step) {
      for (let x = 0; x < width; x += step) {
        const index = (y * width + x) * 4;
        const alpha = data[index + 3];

        if (alpha > 128) {
          const posX = (x - width / 2) * scale;
          const posY = -(y - height / 2) * scale;
          
          points.push(new THREE.Vector3(
             posX, 
             posY, 
             (Math.random()-0.5) * 1.0 
          ));
        }
      }
    }

    this.textPointsCache[cacheKey] = points;
    return points;
  }

  private spawnRocketFirework(text: string, scale: number, targetX: number, targetY: number, shapeType?: string) {
    const targets = this.getPointsFromTextCanvas(text, scale, shapeType);
    const count = targets.length;
    if (count === 0) return;

    const geometry = new THREE.BufferGeometry();
    const currentPos = new Float32Array(count * 3);
    const originalPos = new Float32Array(count * 3); // Relative to target center
    const velocities = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);

    const palette = PALETTES[this.currentPaletteIndex].colors;
    const color = new THREE.Color();

    const startX = targetX;
    const startY = -60; // Start from bottom
    const startZ = 0;

    for (let i = 0; i < count; i++) {
      currentPos[i*3] = startX;
      currentPos[i*3+1] = startY;
      currentPos[i*3+2] = startZ;

      // Store relative offsets, but we will add targetX/Y during simulation
      originalPos[i*3] = targets[i].x;
      originalPos[i*3+1] = targets[i].y;
      originalPos[i*3+2] = targets[i].z;

      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI;
      const speed = 0.3 + Math.random() * 1.2; 
      
      velocities[i*3] = speed * Math.sin(phi) * Math.cos(theta);
      velocities[i*3+1] = speed * Math.sin(phi) * Math.sin(theta);
      velocities[i*3+2] = speed * Math.cos(phi);

      const baseColorHex = palette[Math.floor(Math.random() * palette.length)];
      color.setHex(baseColorHex);
      
      colors[i*3] = color.r;
      colors[i*3+1] = color.g;
      colors[i*3+2] = color.b;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(currentPos, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: 0.25,
      vertexColors: true,
      transparent: true,
      opacity: 1,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const mesh = new THREE.Points(geometry, material);
    mesh.frustumCulled = false;
    this.scene.add(mesh);

    this.systems.push({
      mesh,
      currentPositions: currentPos,
      originalPositions: originalPos,
      velocities,
      colors,
      state: 'ROCKET',
      timer: 0,
      rocketPos: new THREE.Vector3(startX, startY, startZ),
      // Velocity calculates required speed to reach targetY roughly
      rocketVelocity: new THREE.Vector3(0, 0, 0) 
    });
    
    // Calculate initial Rocket Velocity to hit Target Height (simple physics approximation)
    // Distance = targetY - startY. 
    // We want it to reach there in roughly 40-60 frames?
    // Let's just do fixed speed up and stop when Y >= targetY
    const sys = this.systems[this.systems.length-1];
    sys.rocketVelocity.set(0, 0.8 + Math.random() * 0.4, 0);
    // Determine the actual explosion height for this system
    (sys as any).targetY = targetY; 
    (sys as any).targetX = targetX;
  }

  private animate() {
    requestAnimationFrame(() => this.animate());
    
    const dt = 0.016; 
    
    // --- NEBULA ANIMATION ---
    // Slowly rotate the nebula to give a feeling of vastness and movement
    if (this.nebula) {
        this.nebula.rotation.z += 0.0002;
    }

    // --- CONTINUOUS GESTURE ACTIONS (Zoom) ---
    if (this.isHandDetected) {
        // Reduced Zoom Speed from 0.8 to 0.2
        const zoomSpeed = 0.2; 
        if (this.handGesture === 'PINCH') {
            // Zoom In (Decrease Z)
            this.camera.position.z = Math.max(10, this.camera.position.z - zoomSpeed);
            this.currentAction.set('🔍 ZOOM IN (PINCH)');
        } 
        else if (this.handGesture === 'OPEN_PALM') {
            // Zoom Out (Increase Z)
            this.camera.position.z = Math.min(120, this.camera.position.z + zoomSpeed);
            this.currentAction.set('🔭 ZOOM OUT (PALM)');
        }
    }

    // Interactive Cursor Calculation
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const vec = new THREE.Vector3(this.mouse.x, this.mouse.y, 0.5);
    vec.unproject(this.camera);
    const dir = vec.sub(this.camera.position).normalize();
    const distance = (0 - this.camera.position.z) / dir.z;
    const interactPos = this.camera.position.clone().add(dir.multiplyScalar(distance));
    
    if (this.cursor) {
        this.cursor.position.copy(interactPos);
        this.cursor.visible = this.isHandDetected;
        
        if (this.isHandDetected) {
             const mat = this.cursor.material as THREE.MeshBasicMaterial;
             if (this.isPaused()) mat.color.setHex(0xff0000);
             else mat.color.setHex(0x00ffff);
        }
    }

    // PAUSE LOGIC: If paused, skip particle physics
    if (this.isPaused()) {
        this.renderer.render(this.scene, this.camera);
        return; 
    }

    for (let i = this.systems.length - 1; i >= 0; i--) {
      const sys = this.systems[i];
      const targetY = (sys as any).targetY || 0;
      const targetX = (sys as any).targetX || 0;

      sys.timer += dt;

      const positions = sys.mesh.geometry.attributes['position'].array as Float32Array;
      const colors = sys.mesh.geometry.attributes['color'].array as Float32Array;
      const mat = sys.mesh.material as THREE.PointsMaterial;

      if (sys.state === 'ROCKET') {
        // Simple Physics: Move Up
        sys.rocketPos.add(sys.rocketVelocity); 

        // Update Particles - TRAIL
        const trailLength = 8.0; 
        for (let j = 0; j < positions.length / 3; j++) {
            const lag = Math.random();
            const lagCurve = Math.pow(lag, 6); 
            const spread = 0.05 + lagCurve * 0.4; 

            positions[j*3] = sys.rocketPos.x + (Math.random()-0.5) * spread;
            positions[j*3+1] = sys.rocketPos.y - lagCurve * trailLength;
            positions[j*3+2] = sys.rocketPos.z + (Math.random()-0.5) * spread;

            // White center, colored edges
            if (lagCurve < 0.02) {
                colors[j*3] = 1.0; colors[j*3+1] = 1.0; colors[j*3+2] = 1.0;
            } else {
                const fade = 1.0 - lagCurve; 
                const dimFactor = 0.6 * fade; 
                colors[j*3] = sys.colors[j*3] * dimFactor;
                colors[j*3+1] = sys.colors[j*3+1] * dimFactor;
                colors[j*3+2] = sys.colors[j*3+2] * dimFactor;
            }
        }
        
        sys.mesh.geometry.attributes['color'].needsUpdate = true;

        // Trigger explosion when reached target height
        if (sys.rocketPos.y >= targetY) {
            sys.state = 'EXPLODING';
            sys.timer = 0;
            mat.size = 0.18; 
            for (let j = 0; j < colors.length; j++) {
                colors[j] = sys.colors[j];
            }
            sys.mesh.geometry.attributes['color'].needsUpdate = true;
        }
      } 
      else if (sys.state === 'EXPLODING') {
        for (let j = 0; j < positions.length / 3; j++) {
           positions[j*3] += sys.velocities[j*3];
           positions[j*3+1] += sys.velocities[j*3+1];
           positions[j*3+2] += sys.velocities[j*3+2];
           
           sys.velocities[j*3] *= 0.9; 
           sys.velocities[j*3+1] *= 0.9;
           sys.velocities[j*3+2] *= 0.9;
        }

        if (sys.timer > 0.6) { 
          sys.state = 'WEAVING';
          sys.timer = 0; 
        }
      } 
      else if (sys.state === 'WEAVING') {
        const weaveDuration = 2.4;
        const progress = Math.min(sys.timer / weaveDuration, 1.0);
        
        const moveFactor = 0.1 * (1.0 - Math.pow(progress, 2)); 
        const spreadBase = 0.02;
        const spread = spreadBase + (progress * 0.1);

        if (progress > 0.6) {
           mat.opacity = 1.0 - ((progress - 0.6) / 0.4) * 0.5; 
        } else {
           mat.opacity = 1.0;
        }

        for (let j = 0; j < positions.length / 3; j++) {
            const px = positions[j*3];
            const py = positions[j*3+1];
            const pz = positions[j*3+2];

            // Target position including the offset (targetX, targetY)
            const tx = sys.originalPositions[j*3] + targetX;
            const ty = sys.originalPositions[j*3+1] + targetY;
            const tz = sys.originalPositions[j*3+2];

            // Move towards target
            positions[j*3] += (tx - px) * moveFactor;
            positions[j*3+1] += (ty - py) * moveFactor;
            positions[j*3+2] += (tz - pz) * moveFactor;
            
            // Jitter / Dissipation
            positions[j*3] += (Math.random()-0.5) * spread;
            positions[j*3+1] += (Math.random()-0.5) * spread;
            positions[j*3+2] += (Math.random()-0.5) * spread;
        }

        if (sys.timer > weaveDuration) { 
            sys.state = 'FADING';
        }
      }
      else if (sys.state === 'FADING') {
          mat.opacity -= 0.02; 
          for (let j = 0; j < positions.length / 3; j++) {
             positions[j*3+1] -= 0.05; 
             positions[j*3] += (Math.random()-0.5) * 0.15; 
             positions[j*3+2] += (Math.random()-0.5) * 0.15; 
          }

          if (mat.opacity <= 0) {
              this.scene.remove(sys.mesh);
              sys.mesh.geometry.dispose();
              this.systems.splice(i, 1);
          }
      }

      sys.mesh.geometry.attributes['position'].needsUpdate = true;
    }

    this.renderer.render(this.scene, this.camera);
  }

  private onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
}