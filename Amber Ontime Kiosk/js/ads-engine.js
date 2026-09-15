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

    // Remote Server Feed URL (stored in localStorage or empty)
    this.remoteFeedUrl = localStorage.getItem('kiosk_ad_server_url') || '';

    // Default slides with full taxi booking info and local img/ images
    this.defaultSlides = [
      {
        id: 'taxi-ad-1',
        title: 'Book Your Taxi in Seconds',
        tagline: 'Instant airport transfers, city rides, and fixed transparent rates with zero surge pricing.',
        badge: 'Instant Ride Dispatch',
        badgeColor: 'bg-red-600 text-white',
        mediaUrl: 'img/ad1.jpg',
        features: ['🚖 Instant Dispatch', '⏱️ ~3 Min Arrival', '💳 Card & Cash', '📍 GPS Tracked']
      },
      {
        id: 'taxi-ad-2',
        title: '24/7 Airport & Intercity Transfers',
        tagline: 'Spacious luggage capacity, comfortable sedans, and executive VIP transport on demand.',
        badge: 'Airport Express Service',
        badgeColor: 'bg-red-600 text-white',
        mediaUrl: 'img/ad2.jpg',
        features: ['✈️ Flight Tracking', '🧳 Luggage Assistance', '👥 Group Shuttles', '⭐ Top Rated Drivers']
      },
      {
        id: 'taxi-ad-3',
        title: 'Amber OnTime Premium Fleet',
        tagline: 'Licensed professional drivers, sanitized vehicles, and live SMS ride tracking.',
        badge: 'Zero Surge • Fixed Fares',
        badgeColor: 'bg-red-600 text-white',
        mediaUrl: 'img/ad3.jpg',
        features: ['🔒 Verified Drivers', '📱 SMS Status Alert', '🧾 Printed Receipt', '❄️ Climate Controlled']
      },
      {
        id: 'taxi-ad-4',
        title: 'Tap Screen to Begin Booking',
        tagline: 'Select your destination on our self-service touch kiosk and get your taxi ticket immediately.',
        badge: 'Self-Service Kiosk',
        badgeColor: 'bg-red-600 text-white',
        mediaUrl: 'img/ad4.jpg',
        features: ['⚡ 3 Simple Steps', '🗺️ Interactive Map', '🏷️ Transparent Pricing', '📲 Direct Driver Contact']
      }
    ];

    this.slides = this.loadSlides();
    this.init();

    // If a remote feed is configured, fetch it and schedule periodic sync
    if (this.remoteFeedUrl) {
      this.fetchRemoteAds(this.remoteFeedUrl);
      this.startRemoteSync(300000); // sync every 5 minutes
    }
  }

  loadSlides() {
    try {
      const stored = localStorage.getItem('kiosk_ads');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].tagline) {
          return parsed;
        }
      }
    } catch (e) {
      console.warn('Failed to load stored ads:', e);
    }
    return this.defaultSlides;
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
      if (Array.isArray(data) && data.length > 0) {
        const normalized = data.map((item, idx) => ({
          id: item.id || `remote-ad-${idx}`,
          title: item.title || 'Amber OnTime',
          tagline: item.tagline || 'Instant ride dispatch & airport transfers',
          badge: item.badge || 'Featured',
          badgeColor: item.badgeColor || 'bg-red-600 text-white',
          mediaUrl: item.mediaUrl || item.imageUrl || item.image || `img/ad${(idx % 4) + 1}.jpg`,
          features: item.features || []
        }));

        this.saveSlides(normalized);
        return { success: true, count: normalized.length };
      } else {
        throw new Error('Invalid JSON: expected array of slide objects');
      }
    } catch (err) {
      console.warn('Failed to fetch remote ads:', err.message);
      return { success: false, error: err.message };
    }
  }

  startRemoteSync(intervalMs = 300000) {
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

    this.slides.forEach((slide, index) => {
      const slideEl = document.createElement('div');
      slideEl.className = `absolute inset-0 transition-opacity duration-700 ease-in-out ${index === 0 ? 'opacity-100 z-10' : 'opacity-0 z-0'}`;
      slideEl.id = `ad-slide-${index}`;

      const isVideo = this.isVideoMedia(slide);

      const mediaMarkup = isVideo ? `
        <!-- 100% Crisp Video Ad -->
        <video 
          src="${slide.mediaUrl}" 
          autoplay 
          muted 
          loop 
          playsinline 
          class="ad-video-element absolute inset-0 w-full h-full object-cover pointer-events-none select-none"
        ></video>
      ` : `
        <!-- 100% Crisp Background Image -->
        <img 
          src="${slide.mediaUrl}" 
          alt="${slide.title || 'Ad Slide'}" 
          class="absolute inset-0 w-full h-full object-cover pointer-events-none select-none"
          onerror="this.src='https://images.unsplash.com/photo-1557223562-6c77ef16210f?q=80&w=1920&auto=format&fit=crop'"
        />
      `;

      slideEl.innerHTML = `
        <div class="relative w-full h-full overflow-hidden bg-black flex items-center justify-between p-8 md:p-14">
          
          ${mediaMarkup}

          <!-- Clear Glass Ad Information Card with Prominent Downward Shadow -->
          <div class="relative z-10 max-w-xl my-auto space-y-4 p-7 md:p-9 rounded-3xl clear-glass-card shadow-2xl animate-float">
            
            <!-- Category Badge in Amber OnTime Red -->
            ${slide.badge ? `
              <div class="inline-flex items-center gap-2 px-4 py-1.5 rounded-full ${slide.badgeColor || 'bg-red-600 text-white'} text-xs font-black tracking-wider uppercase shadow-lg shadow-red-600/30">
                <span class="w-2 h-2 rounded-full bg-white animate-ping"></span>
                <span>${slide.badge}</span>
              </div>
            ` : ''}

            <!-- Main Headline -->
            ${slide.title ? `
              <h1 class="text-3xl md:text-5xl font-black font-display text-white tracking-tight leading-[1.15] text-shadow-strong">
                ${slide.title}
              </h1>
            ` : ''}

            <!-- Tagline / Description -->
            ${slide.tagline ? `
              <p class="text-base md:text-xl text-white/95 font-medium leading-relaxed drop-shadow-md">
                ${slide.tagline}
              </p>
            ` : ''}

            <!-- Feature Badges -->
            ${slide.features && slide.features.length > 0 ? `
              <div class="flex flex-wrap gap-2 pt-2">
                ${slide.features.map(f => `
                  <span class="px-3.5 py-1.5 rounded-xl bg-white/15 backdrop-blur-md border border-white/25 text-xs font-bold text-white shadow-md">
                    ${f}
                  </span>
                `).join('')}
              </div>
            ` : ''}

          </div>

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

    // Send to server logging endpoint
    try {
      const endpoint = this.remoteFeedUrl
        ? this.remoteFeedUrl.replace(/\/ads\.json|\/api\/ads$/, '/api/ads/log')
        : '/api/ads/log';

      fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
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
