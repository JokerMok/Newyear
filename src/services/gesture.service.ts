import { Injectable, signal, WritableSignal } from '@angular/core';

declare const window: any;
declare const Hands: any;
declare const Camera: any;

export type GestureType = 'IDLE' | 'PINCH' | 'OPEN_PALM' | 'V_SIGN' | 'OK_SIGN' | 'FIST';

export interface HandState {
  gesture: GestureType;
  x: number; 
  y: number; 
  z: number;
  isPresent: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class GestureService {
  handState: WritableSignal<HandState> = signal({ gesture: 'IDLE', x: 0.5, y: 0.5, z: 0, isPresent: false });
  isCameraRunning = signal(false);

  private hands: any;
  private camera: any;
  private canvasCtx: CanvasRenderingContext2D | null = null;
  private canvasElement: HTMLCanvasElement | null = null;

  async initialize(videoElement: HTMLVideoElement, canvasElement: HTMLCanvasElement) {
    this.canvasElement = canvasElement;
    this.canvasCtx = canvasElement.getContext('2d');

    if (!window.Hands) {
      console.error('MediaPipe Hands not loaded');
      return;
    }

    this.hands = new window.Hands({
      locateFile: (file: string) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
      }
    });

    this.hands.setOptions({
      maxNumHands: 1,
      modelComplexity: 1,
      minDetectionConfidence: 0.6, 
      minTrackingConfidence: 0.6
    });

    this.hands.onResults((results: any) => this.onResults(results));

    this.camera = new window.Camera(videoElement, {
      onFrame: async () => {
        await this.hands.send({ image: videoElement });
      },
      width: 640,
      height: 480
    });

    await this.camera.start();
    this.isCameraRunning.set(true);
  }

  private onResults(results: any) {
    // Draw on the HUD canvas
    if (this.canvasCtx && this.canvasElement) {
      this.canvasCtx.save();
      this.canvasCtx.clearRect(0, 0, this.canvasElement.width, this.canvasElement.height);
      
      // Removed drawImage to hide camera feed
      // this.canvasCtx.drawImage(results.image, 0, 0, this.canvasElement.width, this.canvasElement.height);
      
      if (results.multiHandLandmarks) {
        for (const landmarks of results.multiHandLandmarks) {
          // Draw connectors
          window.drawConnectors(this.canvasCtx, landmarks, window.HAND_CONNECTIONS, {
            color: '#00FFFF', // Cyan
            lineWidth: 2
          });
          // Draw landmarks
          window.drawLandmarks(this.canvasCtx, landmarks, {
            color: '#FFFFFF',
            lineWidth: 1,
            radius: 2
          });
        }
      }
      this.canvasCtx.restore();
    }

    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
      this.processHand(results.multiHandLandmarks[0]);
    } else {
      this.handState.set({ gesture: 'IDLE', x: 0.5, y: 0.5, z: 0, isPresent: false });
    }
  }

  private processHand(landmarks: any[]) {
    const thumbTip = landmarks[4];
    const indexTip = landmarks[8];
    
    const pinchDist = this.getDistance(thumbTip, indexTip);
    
    // Check extensions
    const isIndexExt = this.isFingerExtended(landmarks, 8);
    const isMiddleExt = this.isFingerExtended(landmarks, 12);
    const isRingExt = this.isFingerExtended(landmarks, 16);
    const isPinkyExt = this.isFingerExtended(landmarks, 20);

    let gesture: GestureType = 'IDLE';

    // --- Gesture Detection Logic ---

    // 1. FIST (4 fingers closed) - Simplified: No Thumb check needed for now
    if (!isIndexExt && !isMiddleExt && !isRingExt && !isPinkyExt) {
       gesture = 'FIST';
    }
    // 2. PINCH or OK_SIGN (Thumb + Index close)
    else if (pinchDist < 0.05) {
       // If Middle, Ring, Pinky are open, it implies OK Sign
       if (isMiddleExt && isRingExt && isPinkyExt) {
         gesture = 'OK_SIGN';
       } else {
         gesture = 'PINCH';
       }
    }
    // 3. V_SIGN (Peace: Index & Middle up, Pinky down)
    else if (isIndexExt && isMiddleExt && !isPinkyExt) {
      gesture = 'V_SIGN';
    }
    // 4. OPEN_PALM (4 fingers extended)
    else if (isIndexExt && isMiddleExt && isRingExt && isPinkyExt) {
      gesture = 'OPEN_PALM';
    }

    // Coordinates: Use index tip for pointing, or midpoint of pinch
    let x = indexTip.x;
    let y = indexTip.y;
    
    // Mirror X for intuitive interaction
    x = 1 - x;

    this.handState.set({ 
      gesture, 
      x, 
      y, 
      z: indexTip.z,
      isPresent: true
    });
  }

  private getDistance(p1: any, p2: any) {
    return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2) + Math.pow(p1.z - p2.z, 2));
  }

  private isFingerExtended(landmarks: any[], tipIdx: number): boolean {
    const tip = landmarks[tipIdx];
    const mcp = landmarks[tipIdx - 3]; // Compare Tip to MCP (Knuckle)
    const wrist = landmarks[0];
    
    // Standard finger check
    return this.getDistance(wrist, tip) > (this.getDistance(wrist, mcp) * 1.3);
  }
}