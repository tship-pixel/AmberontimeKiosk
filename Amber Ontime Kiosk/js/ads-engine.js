/**
 * Ads & Attract Screen Engine
 * Crisp Image Background + High-Contrast Glass Ad Information Overlay
 */
class AdsEngine {
  constructor(options = {}) {
    this.container = document.getElementById(options.containerId || 'ads-screen');
    this.slidesContainer = document.getElementById(options.slidesContainerId || 'ads-slides-wrapper');
    this.indicatorsContainer = document.getElementById(options.indicatorsContainerId || 'ads-indicators');
    this.progressBar = document.getElementById(options.progressBarId || 'ads-progress-bar');
    this.onWakeCallback = options.onWake || (() => {});
    
    this.currentIndex = 0;
    this.slideDuration = options.defaultSlideDuration || 6000; // ms
    this.timer = null;
    this.progressInterval = null;
    this.remoteSyncInterval = null;
    this.progress = 0;
    this.isPlaying = false;
    this.isWaking = false;

    // Remote Server Feed URL (defaults to /api/ads on HTTP/HTTPS, or http://localhost:3000/api/ads on file://)
    this.remoteFeedUrl = localStorage.getItem('kiosk_ad_server_url') || 
      (window.location.protocol.startsWith('http') ? '/api/ads' : 'http://localhost:3000/api/ads');


    // Slides loaded dynamically from server / user uploads
    this.slides = this.loadSlides();
    this.init();

    // If a remote feed is configured or running on HTTP server, immediately fetch and schedule rapid sync
    if (this.remoteFeedUrl) {
      this.fetchRemoteAds(this.remoteFeedUrl);
      this.startRemoteSync(10000); // auto-sync every 10 seconds in real-time
    }
  }

  loadSlides() {
    try {
      const stored = localStorage.getItem('kiosk_ads');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          // Filter out legacy hardcoded/test slides so ONLY user-added ads display
          const userAds = parsed.filter(s => {
            if (!s || !s.id) return false;
            if (s.id.startsWith('taxi-ad')) return false;
            if (s.id === 'ad-1789493951023' || s.id === 'ad-1789493661455') return false;
            if (s.mediaUrl && (s.mediaUrl.includes('upload_1789493951016') || s.mediaUrl.includes('upload_1789493661451'))) return false;
            return true;
          });
          return userAds;
        }
      }
    } catch (e) {
      console.warn('Failed to load stored ads:', e);
    }
    return [];
  }

  saveSlides(slides) {
    this.slides = slides;
    localStorage.setItem('kiosk_ads', JSON.stringify(slides));
    this.renderSlides();
  }

  setRemoteFeedUrl(url) {
    this.remoteFeedUrl = (url || '').trim();
    if (this.remoteFeedUrl) {
      localStorage.setItem('kiosk_ad_server_url', this.remoteFeedUrl);
      return this.fetchRemoteAds(this.remoteFeedUrl);
    } else {
      localStorage.removeItem('kiosk_ad_server_url');
      clearInterval(this.remoteSyncInterval);
      return Promise.resolve({ success: true, count: this.slides.length });
    }
  }

  async fetchRemoteAds(url) {
    const feedUrl = url || this.remoteFeedUrl;
    if (!feedUrl) return { success: false, error: 'No server URL configured' };

    try {
      const fetchUrl = feedUrl.includes('?') ? `${feedUrl}&_t=${Date.now()}` : `${feedUrl}?_t=${Date.now()}`;
      const res = await fetch(fetchUrl);
      
      if (!res.ok) {
        throw new Error(`HTTP Error ${res.status}`);
      }

      const data = await res.json();
      if (Array.isArray(data)) {
        const normalized = data
          .filter(item => {
            if (!item) return false;
            if (item.id === 'ad-1789493951023' || item.id === 'ad-1789493661455') return false;
            if (item.mediaUrl && (item.mediaUrl.includes('upload_1789493951016') || item.mediaUrl.includes('upload_1789493661451'))) return false;
            return true;
          })
          .map((item, idx) => ({
            id: item.id || `remote-ad-${idx}`,
            type: item.type || (this.isVideoMedia(item) ? 'video' : 'image'),
            title: item.title || 'Advertisement',
            mediaUrl: item.mediaUrl || item.imageUrl || item.image || '',
            qrCodeUrl: item.qrCodeUrl || item.qrImage || item.qr || ''
          }));

        // Compare if slides have changed to avoid interrupting a running slide
        const currentSummary = this.slides.map(s => `${s.id}-${s.mediaUrl}-${s.qrCodeUrl}`).join('|');
        const newSummary = normalized.map(s => `${s.id}-${s.mediaUrl}-${s.qrCodeUrl}`).join('|');

        if (currentSummary !== newSummary || this.slides.length !== normalized.length) {
          const wasPlaying = this.isPlaying;
          this.slides = normalized;
          localStorage.setItem('kiosk_ads', JSON.stringify(normalized));
          this.renderSlides();
          if (wasPlaying && !this.isPlaying && this.slides.length > 0) {
            this.start();
          }
        }
        return { success: true, count: normalized.length };
      } else {
        throw new Error('Invalid JSON: expected array of slide objects');
      }
    } catch (err) {
      console.warn('Failed to fetch remote ads:', err.message);
      return { success: false, error: err.message };
    }
  }

  startRemoteSync(intervalMs = 10000) {
    clearInterval(this.remoteSyncInterval);
    this.remoteSyncInterval = setInterval(() => {
      if (this.remoteFeedUrl) {
        this.fetchRemoteAds(this.remoteFeedUrl);
      }
    }, intervalMs);
  }

  init() {
    this.renderSlides();
    this.bindEvents();
  }

  isVideoMedia(slide) {
    if (slide.type === 'video') return true;
    const url = (slide.mediaUrl || '').toLowerCase();
    return url.startsWith('data:video/') || 
           url.endsWith('.mp4') || 
           url.endsWith('.webm') || 
           url.endsWith('.ogg') || 
           url.endsWith('.mov') || 
           url.endsWith('.m4v');
  }

  renderSlides() {
    if (!this.slidesContainer) return;
    this.slidesContainer.innerHTML = '';
    if (this.indicatorsContainer) this.indicatorsContainer.innerHTML = '';

    if (!this.slides || this.slides.length === 0) {
      const slideEl = document.createElement('div');
      slideEl.className = 'absolute inset-0 transition-opacity duration-700 ease-in-out opacity-100 z-10';
      slideEl.id = 'ad-slide-0';
      slideEl.innerHTML = `
        <div class="relative w-full h-full overflow-hidden bg-black flex items-center justify-center p-8 md:p-14">
          <div class="absolute inset-0 bg-gradient-to-br from-slate-950 via-red-950/20 to-black"></div>
          <div class="relative z-10 max-w-xl text-center space-y-5 p-8 rounded-3xl clear-glass-card shadow-2xl animate-float">
            <img src="img/logo.png" alt="Amber OnTime" class="w-20 h-20 mx-auto object-contain drop-shadow-xl" />
            <h1 class="text-3xl md:text-5xl font-black font-display text-white tracking-tight leading-[1.15]">Amber OnTime</h1>
            <p class="text-base md:text-xl text-white/90 font-medium">Touch screen to book your taxi now</p>
          </div>
        </div>
      `;
      this.slidesContainer.appendChild(slideEl);
      return;
    }

    this.slides.forEach((slide, index) => {
      const slideEl = document.createElement('div');
      slideEl.className = `absolute inset-0 transition-opacity duration-700 ease-in-out ${index === 0 ? 'opacity-100 z-10' : 'opacity-0 z-0'}`;
      slideEl.id = `ad-slide-${index}`;

      const isVideo = this.isVideoMedia(slide);

      const mediaMarkup = isVideo ? `
        <!-- 100% Crisp Full-Bleed Video Ad -->
        <video 
          src="${slide.mediaUrl}" 
          autoplay 
          muted 
          loop 
          playsinline 
          class="ad-video-element absolute inset-0 w-full h-full object-cover pointer-events-none select-none"
        ></video>
      ` : `
        <!-- 100% Crisp Full-Bleed Background Image -->
        <img 
          src="${slide.mediaUrl}" 
          alt="${slide.title || 'Ad Slide'}" 
          class="absolute inset-0 w-full h-full object-cover pointer-events-none select-none"
          onerror="this.src='https://images.unsplash.com/photo-1557223562-6c77ef16210f?q=80&w=1920&auto=format&fit=crop'"
        />
      `;

      slideEl.innerHTML = `
        <div class="relative w-full h-full overflow-hidden bg-black flex items-center justify-center">
          
          <!-- Full-Bleed Media (100% Unobstructed Image / Video) -->
          ${mediaMarkup}

          <!-- Optional QR Code Card (Floating at the Right Center of the screen) -->
          ${slide.qrCodeUrl ? `
            <div class="absolute right-6 md:right-10 top-1/2 -translate-y-1/2 z-20 flex flex-col items-center gap-2 p-3.5 rounded-2xl clear-glass-card shadow-2xl animate-float pointer-events-auto">
              <div class="bg-white p-2.5 rounded-xl shadow-md">
                <img src="${slide.qrCodeUrl}" alt="Scan QR Code" class="w-24 h-24 md:w-32 md:h-32 object-contain" />
              </div>
              <span class="text-[12px] font-bold text-white/95 uppercase tracking-wider font-display drop-shadow-md flex items-center gap-1.5">
                <i data-lucide="qr-code" class="w-3.5 h-3.5 text-amber-400"></i>
                <span>Scan for more info</span>
              </span>
            </div>
          ` : ''}

        </div>
      `;

      this.slidesContainer.appendChild(slideEl);

      // Indicator Dot
      if (this.indicatorsContainer) {
        const dot = document.createElement('button');
        dot.className = `h-2 rounded-full transition-all duration-300 ${index === 0 ? 'w-10 bg-red-600 shadow-lg shadow-red-600/50' : 'w-2.5 bg-white/40'}`;
        dot.addEventListener('click', (e) => {
          e.stopPropagation();
          this.goToSlide(index);
        });
        this.indicatorsContainer.appendChild(dot);
      }
    });

    this.currentIndex = 0;
    if (window.lucide) lucide.createIcons();
  }

  bindEvents() {
    if (this.container) {
      const triggerWake = (e) => {
        if (e.target && e.target.closest && e.target.closest('.no-wake')) return;
        if (this.isWaking) return;
        this.isWaking = true;
        this.onWakeCallback();
        setTimeout(() => { this.isWaking = false; }, 500);
      };

      this.container.addEventListener('pointerdown', triggerWake);
      this.container.addEventListener('click', triggerWake);
      this.container.addEventListener('touchstart', triggerWake, { passive: true });
    }
  }

  logSlideImpression(slideIndex) {
    if (!this.slideStartTime || !this.slides || !this.slides[slideIndex]) return;
    const slide = this.slides[slideIndex];
    const durationSec = Math.max(0.5, parseFloat(((Date.now() - this.slideStartTime) / 1000).toFixed(2)));
    this.slideStartTime = null;

    const payload = {
      adId: slide.id || `ad-${slideIndex}`,
      title: slide.title || 'Untitled Ad',
      type: this.isVideoMedia(slide) ? 'video' : 'image',
      durationSec: durationSec,
      timestamp: new Date().toISOString()
    };

    console.log(`[Ad Analytics Logged] ${payload.title} (${payload.type}) - ${payload.durationSec}s`);

    // Send to server logging endpoint
    try {
      const endpoint = this.remoteFeedUrl
        ? this.remoteFeedUrl.replace(/\/ads\.json|\/api\/ads$/, '/api/ads/log')
        : '/api/ads/log';

      fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true
      }).catch(() => {
        this.bufferOfflineLog(payload);
      });
    } catch (_) {
      this.bufferOfflineLog(payload);
    }
  }

  bufferOfflineLog(payload) {
    try {
      const buffer = JSON.parse(localStorage.getItem('kiosk_offline_ad_logs') || '[]');
      buffer.push(payload);
      if (buffer.length > 500) buffer.shift();
      localStorage.setItem('kiosk_offline_ad_logs', JSON.stringify(buffer));
    } catch (_) {}
  }

  flushOfflineLogs() {
    try {
      const buffer = JSON.parse(localStorage.getItem('kiosk_offline_ad_logs') || '[]');
      if (!Array.isArray(buffer) || buffer.length === 0) return;

      const endpoint = this.remoteFeedUrl
        ? this.remoteFeedUrl.replace(/\/ads\.json|\/api\/ads$/, '/api/ads/log')
        : '/api/ads/log';

      const sendNext = () => {
        if (buffer.length === 0) {
          localStorage.removeItem('kiosk_offline_ad_logs');
          return;
        }
        const item = buffer.shift();
        fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(item)
        }).then(() => {
          localStorage.setItem('kiosk_offline_ad_logs', JSON.stringify(buffer));
          sendNext();
        }).catch(() => {});
      };
      sendNext();
    } catch (_) {}
  }

  start() {
    this.isPlaying = true;
    this.progress = 0;
    this.slideStartTime = Date.now();
    this.flushOfflineLogs();
    this.playActiveMedia();
    this.resetTimer();
  }

  stop() {
    this.isPlaying = false;
    this.logSlideImpression(this.currentIndex);
    clearInterval(this.timer);
    clearInterval(this.progressInterval);
    this.pauseAllMedia();
  }

  playActiveMedia() {
    const currentSlideEl = document.getElementById(`ad-slide-${this.currentIndex}`);
    if (currentSlideEl) {
      const video = currentSlideEl.querySelector('video');
      if (video) {
        video.play().catch(() => {});
      }
    }
  }

  pauseAllMedia() {
    if (!this.slidesContainer) return;
    const videos = this.slidesContainer.querySelectorAll('video');
    videos.forEach(v => {
      try { v.pause(); } catch (_) {}
    });
  }

  resetTimer() {
    clearInterval(this.timer);
    clearInterval(this.progressInterval);

    if (!this.isPlaying) return;

    this.progress = 0;
    const intervalTime = 50;
    const totalSteps = this.slideDuration / intervalTime;
    let currentStep = 0;

    this.progressInterval = setInterval(() => {
      currentStep++;
      this.progress = (currentStep / totalSteps) * 100;
      if (this.progressBar) {
        this.progressBar.style.width = `${Math.min(this.progress, 100)}%`;
      }
    }, intervalTime);

    this.timer = setTimeout(() => {
      this.nextSlide();
    }, this.slideDuration);
  }

  nextSlide() {
    if (!this.slides || this.slides.length === 0) return;
    const nextIndex = (this.currentIndex + 1) % this.slides.length;
    this.goToSlide(nextIndex);
  }

  goToSlide(index) {
    if (index === this.currentIndex) return;

    // Log impression & duration for the slide that just finished
    this.logSlideImpression(this.currentIndex);
    this.slideStartTime = Date.now();

    const currentSlideEl = document.getElementById(`ad-slide-${this.currentIndex}`);
    const nextSlideEl = document.getElementById(`ad-slide-${index}`);

    if (currentSlideEl) {
      currentSlideEl.classList.remove('opacity-100', 'z-10');
      currentSlideEl.classList.add('opacity-0', 'z-0');
      const prevVideo = currentSlideEl.querySelector('video');
      if (prevVideo) {
        try { prevVideo.pause(); } catch (_) {}
      }
    }

    if (nextSlideEl) {
      nextSlideEl.classList.remove('opacity-0', 'z-0');
      nextSlideEl.classList.add('opacity-100', 'z-10');
      const nextVideo = nextSlideEl.querySelector('video');
      if (nextVideo) {
        nextVideo.currentTime = 0;
        nextVideo.play().catch(() => {});
      }
    }

    if (this.indicatorsContainer) {
      const dots = this.indicatorsContainer.children;
      for (let i = 0; i < dots.length; i++) {
        if (i === index) {
          dots[i].className = 'h-2 rounded-full transition-all duration-300 w-10 bg-red-600 shadow-lg shadow-red-600/50';
        } else {
          dots[i].className = 'h-2 rounded-full transition-all duration-300 w-2.5 bg-white/40';
        }
      }
    }

    this.currentIndex = index;
    this.resetTimer();
  }
}

window.AdsEngine = AdsEngine;
