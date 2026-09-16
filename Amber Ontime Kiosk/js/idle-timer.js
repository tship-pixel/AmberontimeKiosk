/**
 * Idle Detection & Timeout Manager for Kiosk
 * Handles cross-frame activity, on-screen typing, and graceful warning dismissals
 */
class IdleTimer {
  constructor(options = {}) {
    this.onIdleCallback = options.onIdle || (() => {});
    this.onWarningCallback = options.onWarning || (() => {});
    this.onResetCallback = options.onReset || (() => {});

    this.warningModal = document.getElementById(options.warningModalId || 'idle-warning-modal');
    this.warningCountdownEl = document.getElementById(options.warningCountdownId || 'idle-countdown-number');
    this.continueBtn = document.getElementById(options.continueBtnId || 'idle-continue-btn');

    // Default 90s total idle time, 15s warning window
    this.idleTimeoutSec = this.loadTimeout() || options.defaultTimeoutSec || 90;
    this.warningDurationSec = options.warningDurationSec || 15;

    this.timer = null;
    this.countdownInterval = null;
    this.secondsRemaining = this.idleTimeoutSec;
    this.isWarningActive = false;
    this.isActive = false;

    this.events = ['pointerdown', 'touchstart', 'touchmove', 'mousemove', 'click', 'scroll', 'keydown', 'keyup', 'input', 'change', 'focus'];
    this.eventHandler = this.handleUserActivity.bind(this);
    this.blurHandler = this.handleWindowBlur.bind(this);
    this.messageHandler = this.handleMessage.bind(this);

    this.init();
  }

  loadTimeout() {
    try {
      const stored = localStorage.getItem('kiosk_idle_timeout');
      if (stored) {
        const parsed = parseInt(stored, 10);
        if (!isNaN(parsed) && parsed > 0) return parsed;
      }
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

    if (this.warningModal) {
      this.warningModal.addEventListener('click', (e) => {
        if (this.isWarningActive) {
          this.dismissWarning();
          this.reset();
        }
      });
      this.warningModal.addEventListener('touchstart', (e) => {
        if (this.isWarningActive) {
          this.dismissWarning();
          this.reset();
        }
      }, { passive: true });
    }

    // Attach listener to iframe when it finishes loading
    const iframe = document.getElementById('kiosk-iframe');
    if (iframe) {
      iframe.addEventListener('load', () => {
        this.attachIframeListeners(iframe);
      });
    }
  }

  attachIframeListeners(iframe) {
    try {
      if (iframe && iframe.contentDocument) {
        this.events.forEach(evt => {
          iframe.contentDocument.addEventListener(evt, this.eventHandler, { passive: true, capture: true });
        });
      }
    } catch (_) {}
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
      window.addEventListener(evt, this.eventHandler, { passive: true, capture: true });
      document.addEventListener(evt, this.eventHandler, { passive: true, capture: true });
    });
    window.addEventListener('blur', this.blurHandler);
    window.addEventListener('message', this.messageHandler);

    const iframe = document.getElementById('kiosk-iframe');
    if (iframe) {
      this.attachIframeListeners(iframe);
    }
  }

  unbindEvents() {
    this.events.forEach(evt => {
      window.removeEventListener(evt, this.eventHandler, { capture: true });
      document.removeEventListener(evt, this.eventHandler, { capture: true });
    });
    window.removeEventListener('blur', this.blurHandler);
    window.removeEventListener('message', this.messageHandler);
  }

  handleMessage(e) {
    if (e && e.data === 'kiosk_user_activity') {
      this.handleUserActivity(e);
    }
  }

  handleWindowBlur() {
    // When focus shifts into the booking iframe, register as activity and reset timer
    if (this.isActive) {
      this.reset();
    }
  }

  handleUserActivity(e) {
    if (!this.isActive) return;
    
    // If the warning modal is active, ANY tap, touch, or keypress instantly dismisses it
    if (this.isWarningActive) {
      this.dismissWarning();
    }

    this.reset();
  }

  reset() {
    if (!this.isActive || this.idleTimeoutSec <= 0) return;

    this.clearAllTimers();
    this.hideWarning();
    this.isWarningActive = false;
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
