// Island Courier — keyboard and mouse input.
//
// Keyboard flies the plane (W/S pitch, A/D bank, Shift/Ctrl throttle,
// P pause, R restart, M mute, Enter confirm). Dragging the mouse with the
// left button held nudges the chase camera; the offset eases back to
// centre on its own so the camera never fights the pilot.

export class InputManager {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.cameraYawOffset = 0;
    this.cameraPitchOffset = 0;
    this.dragging = false;
    this.lastMouseX = 0;
    this.lastMouseY = 0;
    // Callbacks the game wires up: pause, restart, mute, confirm, anyKey,
    // and the cockpit/chase view toggle.
    this.onPause = null;
    this.onRestart = null;
    this.onMute = null;
    this.onConfirm = null;
    this.onAnyKey = null;
    this.onToggleCockpit = null;
    this.bindKeyboard();
    this.bindMouse();
  }

  bindKeyboard() {
    window.addEventListener('keydown', (event) => {
      const key = event.key.toLowerCase();
      if (
        ['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(key)
      ) {
        event.preventDefault();
      }
      if (event.repeat) return;
      this.keys.add(key);
      if (this.onAnyKey) this.onAnyKey(key);
      if (key === 'p' || key === 'escape') {
        if (this.onPause) this.onPause();
      } else if (key === 'r') {
        if (this.onRestart) this.onRestart();
      } else if (key === 'm') {
        if (this.onMute) this.onMute();
      } else if (key === 'c' || key === 'v') {
        if (this.onToggleCockpit) this.onToggleCockpit();
      } else if (key === 'enter' || key === ' ') {
        if (this.onConfirm) this.onConfirm();
      }
    });
    window.addEventListener('keyup', (event) => {
      this.keys.delete(event.key.toLowerCase());
    });
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.dragging = false;
    });
  }

  bindMouse() {
    this.canvas.addEventListener('mousedown', (event) => {
      if (event.button !== 0) return;
      this.dragging = true;
      this.lastMouseX = event.clientX;
      this.lastMouseY = event.clientY;
    });
    window.addEventListener('mousemove', (event) => {
      if (!this.dragging) return;
      const dx = event.clientX - this.lastMouseX;
      const dy = event.clientY - this.lastMouseY;
      this.lastMouseX = event.clientX;
      this.lastMouseY = event.clientY;
      this.cameraYawOffset = Math.max(
        -0.9,
        Math.min(0.9, this.cameraYawOffset - dx * 0.005),
      );
      this.cameraPitchOffset = Math.max(
        -0.35,
        Math.min(0.35, this.cameraPitchOffset + dy * 0.004),
      );
    });
    window.addEventListener('mouseup', () => {
      this.dragging = false;
    });
    this.canvas.addEventListener('dblclick', () => {
      this.cameraYawOffset = 0;
      this.cameraPitchOffset = 0;
    });
  }

  // Ease the camera offset back to centre when the pilot is not dragging.
  updateCameraOffset(deltaTime) {
    if (this.dragging) return;
    const ease = Math.min(1, deltaTime * 1.4);
    this.cameraYawOffset *= 1 - ease;
    this.cameraPitchOffset *= 1 - ease;
  }

  isDown(key) {
    return this.keys.has(key);
  }

  // The control state the flight model reads each frame.
  readFlightControls() {
    return {
      pitchUp: this.isDown('w') || this.isDown('arrowup'),
      pitchDown: this.isDown('s') || this.isDown('arrowdown'),
      rollLeft: this.isDown('a') || this.isDown('arrowleft'),
      rollRight: this.isDown('d') || this.isDown('arrowright'),
      throttleUp: this.isDown('shift') || this.isDown('=') || this.isDown('+'),
      throttleDown: this.isDown('control') || this.isDown('-') || this.isDown('_'),
    };
  }
}
