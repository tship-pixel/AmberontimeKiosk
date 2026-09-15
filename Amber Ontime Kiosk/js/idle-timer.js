/**
 * Idle Detection & Timeout Manager for Kiosk
 */
class IdleTimer {
  constructor(options = {}) {
    this.onIdleCallback = options.onIdle || (() => {});
    this.onWarningCallback = options.onWarning || (() => {});
    this.onResetCallback = options.onReset || (() => {});

    this.warningModal = document.getElementById(options.warningModalId || 'idle-warning-modal');
    this.warningCountdownEl = document.getElementById(options.warningCountdownId || 'idle-countdown-number');
    this.continueBtn = document.getElementById(options.continueBtnId || 'idle-continue-btn');

    // Default 45s total idle time, 10s warning window
    this.idleTimeoutSec = this.loadTimeout() || options.defaultTimeoutSec || 45;
    this.warningDurationSec = options.warningDurationSec || 10;

    this.timer = null;
    this.countdownInterval = null;
    this.iframeCheckInterval = null;
    this.secondsRemaining = this.idleTimeoutSec;
    this.isWarningActive = false;
    this.isActive = false;

    this.events = ['pointerdown', 'touchstart', 'mousemove', 'click', 'scroll', 'keydown'];
    this.eventHandler = this.handleUserActivity.bind(this);
    this.blurHandler = this.handleWindowBlur.bind(this);

    this.init();
  }

  loadTimeout() {
    try {
      const stored = localStorage.getItem('kiosk_idle_timeout');
      if (stored) return parseInt(stored, 10);
    } catch (e) {
      console.warn('Failed to read idle timeout:', e);
    }
    return null;
  }

  saveTimeout(sec) {
    this.idleTimeoutSec = sec;
    localStorage.setItem('kiosk_idle_timeout', sec.toString());
    if (this.isActive) this.reset();
  }

  init() {
    if (this.continueBtn) {
      this.continueBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (window.soundEngine) window.soundEngine.playTap();
        this.dismissWarning();
        this.reset();
      });
    }
  }

  start() {
    if (this.idleTimeoutSec <= 0) return; // Disabled
    this.isActive = true;
    this.bindEvents();
    this.reset();
  }

  stop() {
    this.isActive = false;
    this.unbindEvents();
    this.clearAllTimers();
    this.hideWarning();
  }

  bindEvents() {
    this.events.forEach(evt => {
      window.addEventListener(evt, this.eventHandler, { passive: true });
    });
    window.addEventListener('blur', this.blurHandler);
  }

  unbindEvents() {
    this.events.forEach(evt => {
      window.removeEventListener(evt, this.eventHandler);
    });
    window.removeEventListener('blur', this.blurHandler);
  }

  handleWindowBlur() {
    // When a user clicks or touches inside a cross-domain iframe (e.g. amberontime.com/kiosk), window blurs
    if (this.isActive) {
      this.reset();
    }
  }

  handleUserActivity(e) {
    if (!this.isActive) return;
    
    // If the warning modal is currently shown, only clicking the continue button or modal should dismiss it
    if (this.isWarningActive) {
      return;
    }

    this.reset();
  }

  reset() {
    if (!this.isActive || this.idleTimeoutSec <= 0) return;

    this.clearAllTimers();
    this.hideWarning();
    this.secondsRemaining = this.idleTimeoutSec;

    const timeUntilWarningMs = Math.max(0, (this.idleTimeoutSec - this.warningDurationSec) * 1000);

    this.timer = setTimeout(() => {
      this.triggerWarning();
    }, timeUntilWarningMs);

    this.onResetCallback();
  }

  triggerWarning() {
    this.isWarningActive = true;
    this.showWarning();

    if (window.soundEngine) {
      window.soundEngine.playWarning();
    }

    let remainingWarning = this.warningDurationSec;
    this.updateCountdownDisplay(remainingWarning);

    this.countdownInterval = setInterval(() => {
      remainingWarning--;
      this.updateCountdownDisplay(remainingWarning);

      if (remainingWarning <= 0) {
        this.clearAllTimers();
        this.hideWarning();
        this.isWarningActive = false;
        this.onIdleCallback();
      }
    }, 1000);

    this.onWarningCallback();
  }

  dismissWarning() {
    this.isWarningActive = false;
    this.hideWarning();
  }

  showWarning() {
    if (this.warningModal) {
      this.warningModal.classList.remove('hidden');
      this.warningModal.classList.add('flex');
    }
  }

  hideWarning() {
    if (this.warningModal) {
      this.warningModal.classList.add('hidden');
      this.warningModal.classList.remove('flex');
    }
  }

  updateCountdownDisplay(sec) {
    if (this.warningCountdownEl) {
      this.warningCountdownEl.textContent = sec;
    }
  }

  clearAllTimers() {
    if (this.timer) clearTimeout(this.timer);
    if (this.countdownInterval) clearInterval(this.countdownInterval);
  }
}

window.IdleTimer = IdleTimer;
