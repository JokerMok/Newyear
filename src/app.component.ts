import { Component, ElementRef, viewChild, afterNextRender, inject, effect, ChangeDetectionStrategy, signal } from '@angular/core';
import { VisualEngineService } from './services/visual-engine.service';
import { GestureService } from './services/gesture.service';

@Component({
  selector: 'app-root',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="relative w-full h-screen bg-black overflow-hidden select-none font-sans">
      
      <!-- 3D Scene -->
      <canvas #canvas class="absolute inset-0 z-10"></canvas>

      <!-- Startup Overlay -->
      @if (!hasStarted()) {
        <div class="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/90 backdrop-blur-sm">
          <h1 class="text-6xl md:text-9xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-600 mb-8 animate-pulse tracking-tighter">
            2026
          </h1>
          <div class="flex gap-8">
            <button (click)="start(false)" class="px-8 py-3 border border-gray-500 text-gray-300 hover:bg-white/10 hover:text-white transition rounded-full tracking-widest uppercase text-sm">
              Just Watch
            </button>
            <button (click)="start(true)" class="px-8 py-3 bg-cyan-600 text-white hover:bg-cyan-500 shadow-[0_0_20px_rgba(0,255,255,0.5)] transition rounded-full tracking-widest uppercase text-sm font-bold">
              Enable Interaction
            </button>
          </div>
          <p class="mt-6 text-gray-500 text-xs tracking-widest uppercase">Experience the Era of the Palm</p>
        </div>
      }

      <!-- HUD (Only if Camera Requested) - Resized to smaller dimensions -->
      @if (cameraEnabled()) {
        <div class="absolute bottom-4 left-4 z-40 w-[100px] h-[133px] bg-black/80 rounded-lg overflow-hidden border border-cyan-500/50 shadow-[0_0_20px_rgba(0,255,255,0.2)] hud-panel transition-all duration-300 hover:opacity-100 opacity-90">
          <!-- Video Feed (Visible now) -->
          <video #video class="absolute inset-0 w-full h-full object-cover opacity-60 transform -scale-x-100"></video>
          <!-- Canvas Overlay for Skeleton -->
          <canvas #hudCanvas width="100" height="133" class="absolute inset-0 w-full h-full transform -scale-x-100"></canvas>
          
          <!-- Loading State -->
          @if (!gestureService.isCameraRunning()) {
             <div class="absolute inset-0 flex items-center justify-center text-cyan-500 text-[10px] font-mono animate-pulse bg-black/50">
               INIT...
             </div>
          }

          <!-- Status Text -->
          @if (gestureService.isCameraRunning()) {
            <div class="absolute bottom-0 w-full bg-gradient-to-t from-black to-transparent p-1">
              <div class="text-[8px] text-cyan-400 font-mono leading-tight">SYS: ON</div>
              <div class="text-[8px] text-white font-mono flex justify-between leading-tight">
                <span class="truncate pr-1">{{ gestureService.handState().gesture }}</span>
                <span class="{{ gestureService.handState().isPresent ? 'text-green-400' : 'text-red-400' }}">
                  {{ gestureService.handState().isPresent ? 'TRK' : 'SCN' }}
                </span>
              </div>
            </div>
          }
        </div>

        <!-- Info Panel Right -->
        <div class="absolute bottom-4 right-4 z-40 text-right font-mono text-xs text-white/70 space-y-1 pointer-events-none select-none">
          <div class="text-cyan-400 font-bold uppercase">{{ visualService.currentAction() }}</div>
          <div>THEME: {{ visualService.currentTheme() }}</div>
          <div class="opacity-50">------------------</div>
          <div>[🤏] 捏合手指 -> 拉近镜头</div>
          <div>[✋] 张开手掌 -> 拉远镜头</div>
          <div>[✌️] 胜利手势 -> 爱心烟花</div>
          <div>[👌] OK 手势 -> 盛大终章</div>
        </div>
      }

    </div>
  `
})
export class AppComponent {
  canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  video = viewChild<ElementRef<HTMLVideoElement>>('video');
  hudCanvas = viewChild<ElementRef<HTMLCanvasElement>>('hudCanvas');

  visualService = inject(VisualEngineService);
  gestureService = inject(GestureService);

  hasStarted = signal(false);
  cameraEnabled = signal(false);

  constructor() {
    afterNextRender(() => {
      this.visualService.init(this.canvas().nativeElement);
    });

    // Bridge Gestures to Visuals
    effect(() => {
      const state = this.gestureService.handState();
      // Only update visuals if camera is actively running
      if (this.gestureService.isCameraRunning()) {
        this.visualService.updateHand(state.x, state.y, state.gesture, state.isPresent);
      }
    });
  }

  async start(enableCamera: boolean) {
    this.hasStarted.set(true);
    
    // Start Visual Show
    this.visualService.startShow();

    if (enableCamera) {
      this.cameraEnabled.set(true);
      
      // Small delay to ensure viewChild is available after template update
      setTimeout(async () => {
        const videoEl = this.video()?.nativeElement;
        const hudEl = this.hudCanvas()?.nativeElement;
        if (videoEl && hudEl) {
          await this.gestureService.initialize(videoEl, hudEl);
        } else {
          console.error('Camera elements not found');
        }
      }, 100);
    }
  }
}