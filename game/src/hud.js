// Island Courier — the heads-up display and the screens.
//
// The HUD is DOM over the 3D view: glowing altitude, speed, compass,
// throttle, fuel and damage gauges, a drawn artificial horizon, the
// mission objective, score and timer. The same module owns the title,
// pause, crash and mission-complete screens and the centre flash messages.

export class Hud {
  constructor() {
    this.altitudeValue = document.getElementById('hud-altitude');
    this.speedValue = document.getElementById('hud-speed');
    this.verticalSpeedValue = document.getElementById('hud-vertical-speed');
    this.scoreValue = document.getElementById('hud-score');
    this.timerValue = document.getElementById('hud-timer');
    this.objectiveText = document.getElementById('hud-objective');
    this.objectiveDistance = document.getElementById('hud-distance');
    this.throttleFill = document.getElementById('hud-throttle-fill');
    this.throttleValue = document.getElementById('hud-throttle-value');
    this.bankValue = document.getElementById('hud-bank-value');
    this.fuelFill = document.getElementById('hud-fuel-fill');
    this.fuelValue = document.getElementById('hud-fuel-value');
    this.damageFill = document.getElementById('hud-damage-fill');
    this.damageValue = document.getElementById('hud-damage-value');
    this.warningText = document.getElementById('hud-warning');
    this.messageBox = document.getElementById('hud-message');
    this.targetArrow = document.getElementById('hud-target-arrow');
    this.compassCanvas = document.getElementById('hud-compass');
    this.horizonCanvas = document.getElementById('hud-horizon');
    this.screens = {
      start: document.getElementById('screen-start'),
      pause: document.getElementById('screen-pause'),
      crash: document.getElementById('screen-crash'),
      complete: document.getElementById('screen-complete'),
    };
    this.crashReason = document.getElementById('crash-reason');
    this.completeStats = document.getElementById('complete-stats');
    this.messageTimer = 0;
    this.targetArrowAngle = 0;
  }

  static formatTime(totalSeconds) {
    const seconds = Math.max(0, Math.floor(totalSeconds));
    const minutes = Math.floor(seconds / 60);
    const rest = seconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
  }

  static formatScore(score) {
    return String(Math.max(0, Math.round(score))).padStart(5, '0');
  }

  // Draw the compass strip: tick marks, cardinal letters, the heading
  // caret in the middle and a gold marker at the target bearing.
  drawCompass(headingDegrees, targetBearingDegrees) {
    const canvas = this.compassCanvas;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = 'rgba(6, 24, 38, 0.72)';
    ctx.fillRect(0, 0, width, height);
    const cardinals = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' };
    const pixelsPerDegree = 1.6;
    const centre = width / 2;
    ctx.font = 'bold 13px Consolas, "Courier New", monospace';
    ctx.textAlign = 'center';
    for (let offset = -90; offset <= 90; offset += 5) {
      const bearing = (Math.round(headingDegrees) + offset + 360) % 360;
      const x = centre + offset * pixelsPerDegree;
      const isCardinal = bearing % 90 === 0;
      const isTen = bearing % 30 === 0;
      ctx.strokeStyle = isCardinal ? '#7df9ff' : 'rgba(125, 249, 255, 0.45)';
      ctx.lineWidth = isCardinal ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(x, isCardinal ? 6 : 12);
      ctx.lineTo(x, 20);
      ctx.stroke();
      if (isCardinal) {
        ctx.fillStyle = '#7df9ff';
        ctx.fillText(cardinals[bearing], x, 34);
      } else if (isTen) {
        ctx.fillStyle = 'rgba(200, 240, 255, 0.8)';
        ctx.font = '10px Consolas, "Courier New", monospace';
        ctx.fillText(String(bearing / 10), x, 32);
        ctx.font = 'bold 13px Consolas, "Courier New", monospace';
      }
    }
    // Target bearing marker (gold triangle near the bottom of the strip).
    if (typeof targetBearingDegrees === 'number') {
      let delta = ((targetBearingDegrees - headingDegrees + 540) % 360) - 180;
      const markerX = centre + delta * pixelsPerDegree;
      if (markerX > 8 && markerX < width - 8) {
        ctx.fillStyle = '#ffc93c';
        ctx.beginPath();
        ctx.moveTo(markerX, height - 12);
        ctx.lineTo(markerX - 6, height - 20);
        ctx.lineTo(markerX + 6, height - 20);
        ctx.closePath();
        ctx.fill();
      }
    }
    // Centre caret and heading readout (readout sits on its own line at
    // the bottom, clear of the tick labels and the target marker).
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(centre, 2);
    ctx.lineTo(centre - 6, 10);
    ctx.lineTo(centre + 6, 10);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#7df9ff';
    ctx.font = 'bold 14px Consolas, "Courier New", monospace';
    ctx.fillText(
      `${String(Math.round(headingDegrees)).padStart(3, '0')}°`,
      centre,
      height - 2,
    );
  }

  // Draw the artificial horizon: sky and ground rotate with bank and
  // shift with pitch; a fixed aircraft symbol stays centred.
  drawHorizon(pitchRadians, bankRadians) {
    const canvas = this.horizonCanvas;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const size = canvas.width;
    const centre = size / 2;
    const radius = size / 2 - 4;
    ctx.clearRect(0, 0, size, size);
    ctx.save();
    ctx.beginPath();
    ctx.arc(centre, centre, radius, 0, Math.PI * 2);
    ctx.clip();
    ctx.translate(centre, centre);
    ctx.rotate(-bankRadians);
    const pitchOffset = pitchRadians * 90;
    ctx.fillStyle = '#3f8fd2';
    ctx.fillRect(-radius, -radius - pitchOffset, radius * 2, radius + pitchOffset);
    ctx.fillStyle = '#7a5230';
    ctx.fillRect(-radius, -pitchOffset, radius * 2, radius + pitchOffset);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-radius, -pitchOffset);
    ctx.lineTo(radius, -pitchOffset);
    ctx.stroke();
    ctx.restore();
    // Fixed aircraft symbol.
    ctx.strokeStyle = '#ffe9a8';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(centre - 26, centre);
    ctx.lineTo(centre - 8, centre);
    ctx.moveTo(centre + 8, centre);
    ctx.lineTo(centre + 26, centre);
    ctx.moveTo(centre, centre);
    ctx.lineTo(centre, centre + 8);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(125, 249, 255, 0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(centre, centre, radius, 0, Math.PI * 2);
    ctx.stroke();
  }

  // One HUD refresh per frame. `snapshot` carries everything the game
  // knows: flight readouts, mission state, fuel, damage and score.
  update(snapshot) {
    if (this.altitudeValue) {
      this.altitudeValue.textContent = `${Math.round(snapshot.altitudeFeet)} ft`;
    }
    if (this.speedValue) {
      this.speedValue.textContent = `${Math.round(snapshot.speedKnots)} kt`;
    }
    if (this.verticalSpeedValue) {
      const vs = Math.round(snapshot.verticalSpeedFpm);
      this.verticalSpeedValue.textContent = `${vs >= 0 ? '+' : ''}${vs} fpm`;
    }
    if (this.scoreValue) {
      this.scoreValue.textContent = Hud.formatScore(snapshot.score);
    }
    if (this.timerValue) {
      this.timerValue.textContent = Hud.formatTime(snapshot.elapsedSeconds);
    }
    if (this.objectiveText) {
      this.objectiveText.textContent = snapshot.objective;
    }
    if (this.objectiveDistance) {
      this.objectiveDistance.textContent =
        snapshot.distanceMetres == null
          ? ''
          : `${Math.round(snapshot.distanceMetres)} m`;
    }
    if (this.throttleFill) {
      this.throttleFill.style.width = `${Math.round(snapshot.throttle * 100)}%`;
    }
    if (this.throttleValue) {
      this.throttleValue.textContent = `${Math.round(snapshot.throttle * 100)}%`;
    }
    if (this.bankValue) {
      const bankDegrees = Math.round((snapshot.bankRadians * 180) / Math.PI);
      const side = bankDegrees > 0 ? 'R' : bankDegrees < 0 ? 'L' : '';
      this.bankValue.textContent =
        bankDegrees === 0 ? '0°' : `${side} ${Math.abs(bankDegrees)}°`;
    }
    if (this.fuelFill) {
      this.fuelFill.style.width = `${Math.max(0, snapshot.fuel)}%`;
      this.fuelFill.classList.toggle('low', snapshot.fuel < 25);
    }
    if (this.fuelValue) {
      this.fuelValue.textContent = `${Math.round(Math.max(0, snapshot.fuel))}%`;
    }
    if (this.damageFill) {
      this.damageFill.style.width = `${Math.max(0, snapshot.damage)}%`;
    }
    if (this.damageValue) {
      this.damageValue.textContent = `${Math.round(Math.max(0, snapshot.damage))}%`;
    }
    if (this.warningText) {
      const warnings = [];
      if (snapshot.stalled) warnings.push('STALL');
      if (snapshot.fuel < 25 && snapshot.fuel > 0) warnings.push('LOW FUEL');
      if (snapshot.fuel <= 0) warnings.push('FUEL EMPTY');
      if (snapshot.damage >= 70) warnings.push('HEAVY DAMAGE');
      this.warningText.textContent = warnings.join('  ·  ');
      this.warningText.classList.toggle('visible', warnings.length > 0);
    }
    this.drawCompass(snapshot.headingDegrees, snapshot.targetBearingDegrees);
    this.drawHorizon(snapshot.pitchRadians, snapshot.bankRadians);
    this.updateTargetArrow(snapshot.targetScreen);
    if (this.messageTimer > 0) {
      this.messageTimer -= 1 / 60;
      if (this.messageTimer <= 0 && this.messageBox) {
        this.messageBox.classList.remove('visible');
      }
    }
  }

  // A small gold arrow at the screen edge pointing at the current target
  // when it is off-screen; hidden when the target is in view.
  updateTargetArrow(targetScreen) {
    if (!this.targetArrow) return;
    if (!targetScreen || targetScreen.visible) {
      this.targetArrow.classList.remove('visible');
      return;
    }
    this.targetArrow.classList.add('visible');
    this.targetArrowAngle = targetScreen.angleDegrees;
    this.targetArrow.style.transform = `translate(-50%, -50%) rotate(${this.targetArrowAngle}deg)`;
    this.targetArrow.style.left = `${targetScreen.edgeX}px`;
    this.targetArrow.style.top = `${targetScreen.edgeY}px`;
  }

  // Flash a centre-screen message for a couple of seconds.
  showMessage(text, seconds = 2.2) {
    if (!this.messageBox) return;
    this.messageBox.textContent = text;
    this.messageBox.classList.add('visible');
    this.messageTimer = seconds;
  }

  // Show exactly one full-screen overlay (or none).
  showScreen(name, data) {
    for (const [key, element] of Object.entries(this.screens)) {
      if (!element) continue;
      element.classList.toggle('visible', key === name);
    }
    if (name === 'crash' && data && this.crashReason) {
      this.crashReason.textContent = data.reason || '';
    }
    if (name === 'complete' && data && this.completeStats) {
      this.completeStats.innerHTML = data.lines
        .map(
          (line) =>
            `<div class="stat-row"><span>${line.label}</span><span>${line.value}</span></div>`,
        )
        .join('');
    }
  }
}
