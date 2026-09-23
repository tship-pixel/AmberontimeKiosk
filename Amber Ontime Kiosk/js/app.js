/**
 * Main Application Controller for Amber OnTime Kiosk
 */
document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const adsScreen = document.getElementById('ads-screen');
  const kioskApp = document.getElementById('kiosk-app');
  const clockEl = document.getElementById('header-clock');
  const dateEl = document.getElementById('header-date');
  const fullscreenBtn = document.getElementById('fullscreen-btn');
  const exitToAdsBtn = document.getElementById('exit-to-ads-btn');
  const reloadAppBtn = document.getElementById('reload-app-btn');

  // Secret Admin Triggers
  const secretAdminCorner = document.getElementById('secret-admin-corner');
  const screensaverLogoSecret = document.getElementById('screensaver-logo-secret');
  const appLogoSecret = document.getElementById('app-logo-secret');

  // Web App & Hub Containers
  const webAppContainer = document.getElementById('web-app-container');
  const builtinHubContainer = document.getElementById('builtin-hub-container');
  const kioskIframe = document.getElementById('kiosk-iframe');
  const currentUrlDisplay = document.getElementById('current-url-display');

  // Navigation Tabs for built-in hub
  const navTabs = document.querySelectorAll('.kiosk-nav-btn');
  const viewSections = document.querySelectorAll('.kiosk-view');
  const directoryContainer = document.getElementById('directory-grid');
  const searchInput = document.getElementById('directory-search');

  // Admin Modal Elements
  const adminPinModal = document.getElementById('admin-pin-modal');
  const adminPinInput = document.getElementById('admin-pin-input');
  const adminPinSubmit = document.getElementById('admin-pin-submit');
  const adminPinCancel = document.getElementById('admin-pin-cancel');
  const adminPinError = document.getElementById('admin-pin-error');
  const adminSettingsModal = document.getElementById('admin-settings-modal');
  const closeAdminSettingsBtn = document.getElementById('close-admin-settings');
  const adminTimeoutSelect = document.getElementById('admin-timeout-select');
  const adminSoundToggle = document.getElementById('admin-sound-toggle');
  const adminSlidesList = document.getElementById('admin-slides-list');
  const addSlideForm = document.getElementById('add-slide-form');
  const adminKioskUrl = document.getElementById('admin-kiosk-url');
  const saveUrlBtn = document.getElementById('save-url-btn');
  const adminModeSelect = document.getElementById('admin-mode-select');
  const adminNewPin = document.getElementById('admin-new-pin');
  const savePinBtn = document.getElementById('save-pin-btn');

  // Virtual PIN Pad Keys
  const pinKeys = document.querySelectorAll('.pin-key');
  const pinKeyClear = document.getElementById('pin-key-clear');
  const pinKeyDel = document.getElementById('pin-key-del');

  // Default / Saved Configuration
  let kioskUrl = localStorage.getItem('kiosk_target_url') || 'https://amberontime.com/kiosk';
  let appMode = localStorage.getItem('kiosk_app_mode') || 'web'; // 'web', 'direct', or 'builtin'
  let masterPin = localStorage.getItem('kiosk_master_pin') || '1234';

  function applyKioskConfig() {
    if (kioskIframe) {
      const isHttpServer = window.location.protocol.startsWith('http');
      let effectiveSrc = kioskUrl;
      
      // If served from a server and target is amberontime.com/kiosk in embedded mode, route through /proxy-kiosk
      if (isHttpServer && kioskUrl.includes('amberontime.com/kiosk')) {
        effectiveSrc = '/proxy-kiosk';
      } else if (!isHttpServer && kioskUrl.includes('amberontime.com/kiosk')) {
        effectiveSrc = 'http://localhost:3000/proxy-kiosk';
      }

      const currentSrcAttr = kioskIframe.getAttribute('src') || '';
      const currentSrcProp = kioskIframe.src || '';
      if (currentSrcAttr !== effectiveSrc && !currentSrcProp.endsWith(effectiveSrc)) {
        kioskIframe.src = effectiveSrc;
      }
    }

    if (currentUrlDisplay) {
      currentUrlDisplay.textContent = kioskUrl.replace(/^https?:\/\//, '');
    }
    if (adminKioskUrl) {
      adminKioskUrl.value = kioskUrl;
    }
    if (adminModeSelect) {
      adminModeSelect.value = appMode;
    }

    if (appMode === 'builtin') {
      if (webAppContainer) webAppContainer.classList.add('hidden');
      if (builtinHubContainer) builtinHubContainer.classList.remove('hidden');
    } else {
      if (webAppContainer) webAppContainer.classList.remove('hidden');
      if (builtinHubContainer) builtinHubContainer.classList.add('hidden');
    }
  }
  applyKioskConfig();

  // 1. Initialize Sound, Ads Engine & Idle Timer
  const adsEngine = new AdsEngine({
    containerId: 'ads-screen',
    slidesContainerId: 'ads-slides-wrapper',
    indicatorsContainerId: 'ads-indicators',
    progressBarId: 'ads-progress-bar',
    defaultSlideDuration: 6500,
    onWake: () => wakeToApp()
  });

  const idleTimer = new IdleTimer({
    warningModalId: 'idle-warning-modal',
    warningCountdownId: 'idle-countdown-number',
    continueBtnId: 'idle-continue-btn',
    defaultTimeoutSec: 90,
    warningDurationSec: 15,
    onIdle: () => sleepToAds()
  });

  // Start with Ads Engine Running
  adsEngine.start();

  // 2. App Wake / Sleep Transitions
  function wakeToApp() {
    if (window.soundEngine) {
      window.soundEngine.playWake();
    }

    // Optional direct top-level navigation if explicitly configured in Admin
    if (appMode === 'direct') {
      adsEngine.stop();
      window.location.href = kioskUrl;
      return;
    }

    applyKioskConfig();

    // Hide Ads Screen
    adsScreen.classList.remove('fade-in');
    adsScreen.classList.add('fade-out');
    adsEngine.stop();

    // Show Kiosk App
    setTimeout(() => {
      adsScreen.classList.add('hidden');
      kioskApp.classList.remove('hidden');
      kioskApp.classList.remove('fade-out');
      kioskApp.classList.add('fade-in');

      // Trigger map resize if iframe is active
      try {
        if (kioskIframe && kioskIframe.contentWindow) {
          kioskIframe.contentWindow.dispatchEvent(new Event('resize'));
        }
      } catch (_) {}

      // Start Idle Monitoring
      idleTimer.start();
      if (window.lucide) lucide.createIcons();
    }, 200);
  }

  function sleepToAds() {
    // Hide Kiosk App
    kioskApp.classList.remove('fade-in');
    kioskApp.classList.add('fade-out');
    idleTimer.stop();

    // Close open modals
    closeAdminModals();

    setTimeout(() => {
      kioskApp.classList.add('hidden');
      adsScreen.classList.remove('hidden');
      adsScreen.classList.remove('fade-out');
      adsScreen.classList.add('fade-in');

      // Restart Ads Carousel
      adsEngine.start();
      lucide.createIcons();
    }, 400);
  }

  // 3. Live Clock & Date Updater
  function updateClock() {
    const now = new Date();
    if (clockEl) {
      clockEl.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }
    if (dateEl) {
      dateEl.textContent = now.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
    }
  }
  updateClock();
  setInterval(updateClock, 1000);

  // 4. Header Actions (Reload, Exit to Ads, Fullscreen)
  if (reloadAppBtn) {
    reloadAppBtn.addEventListener('click', () => {
      if (window.soundEngine) window.soundEngine.playTap();
      if (kioskIframe) {
        const cur = kioskIframe.src;
        kioskIframe.src = 'about:blank';
        setTimeout(() => {
          applyKioskConfig();
        }, 100);
      }
    });
  }

  if (exitToAdsBtn) {
    exitToAdsBtn.addEventListener('click', () => {
      if (window.soundEngine) window.soundEngine.playTap();
      sleepToAds();
    });
  }

  if (fullscreenBtn) {
    fullscreenBtn.addEventListener('click', () => {
      if (window.soundEngine) window.soundEngine.playTap();
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(err => {
          console.warn(`Fullscreen error: ${err.message}`);
        });
      } else {
        if (document.exitFullscreen) {
          document.exitFullscreen();
        }
      }
    });
  }

  // 5. SECRET ADMIN GESTURES & TRIGGERS
  
  // Method 1: Invisible Top-Right Corner (Tap 5 times within 2.5 seconds)
  let cornerTapCount = 0;
  let cornerTapTimer = null;
  if (secretAdminCorner) {
    secretAdminCorner.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      cornerTapCount++;
      clearTimeout(cornerTapTimer);
      cornerTapTimer = setTimeout(() => {
        cornerTapCount = 0;
      }, 2500);

      if (cornerTapCount >= 5) {
        cornerTapCount = 0;
        if (window.soundEngine) window.soundEngine.playTap();
        openAdminPinModal();
      }
    });
  }

  // Method 2: Long-Press on Logo (Hold for 3 seconds)
  function attachLongPressSecret(element) {
    if (!element) return;
    let pressTimer = null;

    const startPress = (e) => {
      e.stopPropagation();
      pressTimer = setTimeout(() => {
        if (window.soundEngine) window.soundEngine.playTap();
        openAdminPinModal();
      }, 3000); // 3 seconds hold
    };

    const cancelPress = () => {
      if (pressTimer) {
        clearTimeout(pressTimer);
        pressTimer = null;
      }
    };

    element.addEventListener('pointerdown', startPress);
    element.addEventListener('pointerup', cancelPress);
    element.addEventListener('pointerleave', cancelPress);
    element.addEventListener('pointercancel', cancelPress);
  }

  attachLongPressSecret(screensaverLogoSecret);
  attachLongPressSecret(appLogoSecret);

  // Method 3: Secret Keyboard Shortcut (Ctrl + Shift + A or Ctrl + Shift + K)
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && (e.key === 'A' || e.key === 'a' || e.key === 'K' || e.key === 'k')) {
      e.preventDefault();
      openAdminPinModal();
    }
  });

  // 6. Admin Authorization Modal
  function openAdminPinModal() {
    if (!adminPinModal) return;
    if (adminPinInput) adminPinInput.value = '';
    if (adminPinError) adminPinError.classList.add('hidden');
    adminPinModal.classList.remove('hidden');
    adminPinModal.classList.add('flex');
    if (adminPinInput) adminPinInput.focus();
    lucide.createIcons();
  }

  function closeAdminModals() {
    if (adminPinModal) {
      adminPinModal.classList.add('hidden');
      adminPinModal.classList.remove('flex');
    }
    if (adminSettingsModal) {
      adminSettingsModal.classList.add('hidden');
      adminSettingsModal.classList.remove('flex');
    }
  }

  // Virtual Keypad for PIN
  pinKeys.forEach(key => {
    key.addEventListener('click', (e) => {
      e.stopPropagation();
      if (window.soundEngine) window.soundEngine.playTap();
      if (adminPinInput && adminPinInput.value.length < 8) {
        adminPinInput.value += key.textContent.trim();
      }
    });
  });

  if (pinKeyClear) {
    pinKeyClear.addEventListener('click', (e) => {
      e.stopPropagation();
      if (window.soundEngine) window.soundEngine.playTap();
      if (adminPinInput) adminPinInput.value = '';
    });
  }

  if (pinKeyDel) {
    pinKeyDel.addEventListener('click', (e) => {
      e.stopPropagation();
      if (window.soundEngine) window.soundEngine.playTap();
      if (adminPinInput) adminPinInput.value = adminPinInput.value.slice(0, -1);
    });
  }

  if (adminPinCancel) {
    adminPinCancel.addEventListener('click', (e) => {
      e.stopPropagation();
      if (window.soundEngine) window.soundEngine.playTap();
      closeAdminModals();
    });
  }

  if (adminPinSubmit) {
    adminPinSubmit.addEventListener('click', (e) => {
      e.stopPropagation();
      if (window.soundEngine) window.soundEngine.playTap();
      validateAdminPin();
    });
  }

  if (adminPinInput) {
    adminPinInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        validateAdminPin();
      }
    });
  }

  function validateAdminPin() {
    const pin = adminPinInput ? adminPinInput.value.trim() : '';
    if (pin === masterPin) {
      if (adminPinModal) {
        adminPinModal.classList.add('hidden');
        adminPinModal.classList.remove('flex');
      }
      openAdminSettings();
    } else {
      if (adminPinError) adminPinError.classList.remove('hidden');
    }
  }

  function openAdminSettings() {
    if (!adminSettingsModal) return;

    if (adminTimeoutSelect) {
      adminTimeoutSelect.value = idleTimer.idleTimeoutSec.toString();
    }
    if (adminSoundToggle) {
      adminSoundToggle.checked = window.soundEngine.enabled;
    }
    if (adminKioskUrl) {
      adminKioskUrl.value = kioskUrl;
    }
    if (adminModeSelect) {
      adminModeSelect.value = appMode;
    }
    if (adminNewPin) {
      adminNewPin.value = masterPin;
    }

    renderAdminSlidesList();
    loadAdminAdStats();
    loadServerHealth();
    adminSettingsModal.classList.remove('hidden');
    adminSettingsModal.classList.add('flex');
    lucide.createIcons();
  }

  const cloudSyncBadge = document.getElementById('cloud-sync-badge');
  const keepaliveStatus = document.getElementById('keepalive-status');
  const githubSyncStatus = document.getElementById('github-sync-status');
  const manualGithubSyncBtn = document.getElementById('manual-github-sync-btn');

  async function loadServerHealth() {
    if (!cloudSyncBadge) return;
    try {
      const healthEndpoint = adsEngine.remoteFeedUrl
        ? adsEngine.remoteFeedUrl.replace(/\/ads\.json|\/api\/ads$/, '/api/health')
        : '/api/health';

      const res = await fetch(healthEndpoint);
      if (!res.ok) throw new Error('Health check unavailable');
      const data = await res.json();

      if (data.githubSyncActive) {
        cloudSyncBadge.textContent = 'Cloud Persistence Active';
        cloudSyncBadge.className = 'px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40';
        if (githubSyncStatus) {
          githubSyncStatus.textContent = `Connected (${data.githubRepo || 'GitHub'})`;
          githubSyncStatus.className = 'font-bold text-emerald-400';
        }
      } else {
        cloudSyncBadge.textContent = 'Local Ephemeral Mode';
        cloudSyncBadge.className = 'px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40';
        if (githubSyncStatus) {
          githubSyncStatus.textContent = 'Not configured (add GITHUB_TOKEN)';
          githubSyncStatus.className = 'font-bold text-amber-400';
        }
      }

      if (keepaliveStatus) {
        if (data.keepAliveActive) {
          keepaliveStatus.textContent = 'Active (24/7 Live)';
          keepaliveStatus.className = 'font-bold text-emerald-400';
        } else {
          keepaliveStatus.textContent = 'Local Dev Mode';
          keepaliveStatus.className = 'font-bold text-slate-400';
        }
      }
    } catch (_) {
      if (cloudSyncBadge) {
        cloudSyncBadge.textContent = 'Offline / Standalone';
        cloudSyncBadge.className = 'px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-800 text-slate-400 border border-slate-700';
      }
    }
  }

  if (manualGithubSyncBtn) {
    manualGithubSyncBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (window.soundEngine) window.soundEngine.playTap();
      manualGithubSyncBtn.disabled = true;
      manualGithubSyncBtn.innerHTML = '<i data-lucide="loader-2" class="w-3 h-3 animate-spin"></i><span>Syncing...</span>';
      if (window.lucide) lucide.createIcons();

      try {
        const syncEndpoint = adsEngine.remoteFeedUrl
          ? adsEngine.remoteFeedUrl.replace(/\/ads\.json|\/api\/ads$/, '/api/sync/github')
          : '/api/sync/github';
        await fetch(syncEndpoint, { method: 'POST' });
        await adsEngine.fetchRemoteAds();
        renderAdminSlidesList();
        loadServerHealth();
        manualGithubSyncBtn.innerHTML = '<i data-lucide="check" class="w-3 h-3 text-emerald-300"></i><span>Synced!</span>';
      } catch (err) {
        manualGithubSyncBtn.innerHTML = '<i data-lucide="alert-circle" class="w-3 h-3 text-red-300"></i><span>Failed</span>';
      }
      if (window.lucide) lucide.createIcons();

      setTimeout(() => {
        manualGithubSyncBtn.disabled = false;
        manualGithubSyncBtn.innerHTML = '<i data-lucide="refresh-cw" class="w-3 h-3"></i><span>Sync from GitHub</span>';
        if (window.lucide) lucide.createIcons();
      }, 2500);
    });
  }

  const adminAdStatsContainer = document.getElementById('admin-ad-stats-container');
  const resetAdLogBtn = document.getElementById('reset-ad-log-btn');
  const downloadAdLogBtn = document.getElementById('download-ad-log-btn');

  async function loadAdminAdStats() {
    if (!adminAdStatsContainer) return;
    adminAdStatsContainer.innerHTML = '<div class="text-xs text-slate-500 italic py-2 flex items-center gap-1.5"><i data-lucide="loader-2" class="w-3.5 h-3.5 animate-spin"></i><span>Loading analytics...</span></div>';
    if (window.lucide) lucide.createIcons();

    try {
      const statsEndpoint = adsEngine.remoteFeedUrl 
        ? adsEngine.remoteFeedUrl.replace(/\/ads\.json|\/api\/ads$/, '/api/ads/stats')
        : '/api/ads/stats';

      if (downloadAdLogBtn) {
        downloadAdLogBtn.href = adsEngine.remoteFeedUrl 
          ? adsEngine.remoteFeedUrl.replace(/\/ads\.json|\/api\/ads$/, '/api/ads/logs')
          : '/api/ads/logs';
      }

      const res = await fetch(statsEndpoint);
      if (!res.ok) throw new Error('Stats unavailable');
      const stats = await res.json();

      const adIds = Object.keys(stats);
      if (adIds.length === 0) {
        adminAdStatsContainer.innerHTML = '<div class="text-xs text-slate-500 italic py-2">No ad display impressions recorded yet.</div>';
        return;
      }

      adminAdStatsContainer.innerHTML = '';
      adIds.forEach(id => {
        const item = stats[id];
        const row = document.createElement('div');
        row.className = 'flex items-center justify-between p-2.5 rounded-xl bg-slate-800/80 border border-slate-700/70 text-xs';
        
        const minutes = (item.totalAirTimeSec / 60).toFixed(1);
        row.innerHTML = `
          <div class="truncate max-w-[60%]">
            <div class="flex items-center gap-1.5">
              <span class="font-bold text-white truncate">${item.title}</span>
              <span class="text-[10px] px-1.5 py-0.5 rounded ${item.type === 'video' ? 'bg-indigo-900/60 text-indigo-300' : 'bg-red-900/60 text-red-300'} uppercase font-bold">${item.type}</span>
            </div>
            <p class="text-[10px] font-mono text-slate-400 mt-0.5">${item.id}</p>
          </div>
          <div class="text-right flex-shrink-0">
            <div class="font-bold text-emerald-400">${item.impressions} Views</div>
            <div class="text-[11px] text-slate-300 font-mono">${item.totalAirTimeSec}s <span class="text-slate-500">(${minutes}m)</span></div>
          </div>
        `;
        adminAdStatsContainer.appendChild(row);
      });

      if (window.lucide) lucide.createIcons();
    } catch (_) {
      adminAdStatsContainer.innerHTML = '<div class="text-xs text-slate-400 py-2">Analytics logging is active. Connect to server to view live report.</div>';
    }
  }

  if (resetAdLogBtn) {
    resetAdLogBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!confirm('Are you sure you want to reset the ad display log and statistics?')) return;
      if (window.soundEngine) window.soundEngine.playTap();

      try {
        const deleteEndpoint = adsEngine.remoteFeedUrl 
          ? adsEngine.remoteFeedUrl.replace(/\/ads\.json|\/api\/ads$/, '/api/ads/logs')
          : '/api/ads/logs';

        await fetch(deleteEndpoint, { method: 'DELETE' }).catch(() => {});
        localStorage.removeItem('kiosk_offline_ad_logs');
        loadAdminAdStats();
      } catch (_) {
        loadAdminAdStats();
      }
    });
  }

  if (closeAdminSettingsBtn) {
    closeAdminSettingsBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (window.soundEngine) window.soundEngine.playTap();
      closeAdminModals();
    });
  }

  // Save Target URL
  if (saveUrlBtn && adminKioskUrl) {
    saveUrlBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (window.soundEngine) window.soundEngine.playTap();
      let val = adminKioskUrl.value.trim();
      if (!val.startsWith('http://') && !val.startsWith('https://')) {
        val = 'https://' + val;
      }
      kioskUrl = val;
      localStorage.setItem('kiosk_target_url', kioskUrl);
      applyKioskConfig();
      saveUrlBtn.textContent = 'Saved!';
      setTimeout(() => {
        saveUrlBtn.textContent = 'Save URL';
      }, 1500);
    });
  }

  // Change Master PIN
  if (savePinBtn && adminNewPin) {
    savePinBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (window.soundEngine) window.soundEngine.playTap();
      const newPinVal = adminNewPin.value.trim();
      if (newPinVal.length >= 4) {
        masterPin = newPinVal;
        localStorage.setItem('kiosk_master_pin', masterPin);
        savePinBtn.textContent = 'Updated!';
        setTimeout(() => {
          savePinBtn.textContent = 'Change PIN';
        }, 1500);
      }
    });
  }

  if (adminModeSelect) {
    adminModeSelect.addEventListener('change', (e) => {
      appMode = e.target.value;
      localStorage.setItem('kiosk_app_mode', appMode);
      applyKioskConfig();
    });
  }

  if (adminTimeoutSelect) {
    adminTimeoutSelect.addEventListener('change', (e) => {
      const val = parseInt(e.target.value, 10);
      idleTimer.saveTimeout(val);
    });
  }

  if (adminSoundToggle) {
    adminSoundToggle.addEventListener('change', (e) => {
      window.soundEngine.enabled = e.target.checked;
    });
  }

  const adminAdServerUrl = document.getElementById('admin-ad-server-url');
  const syncAdsBtn = document.getElementById('sync-ads-btn');
  const clearFeedBtn = document.getElementById('clear-feed-btn');
  const remoteAdStatus = document.getElementById('remote-ad-status');

  function updateAdFeedStatus() {
    if (!remoteAdStatus) return;
    if (adsEngine.remoteFeedUrl) {
      remoteAdStatus.textContent = `Connected (${adsEngine.slides.length} slides)`;
      remoteAdStatus.className = 'text-xs font-semibold text-emerald-400';
    } else {
      remoteAdStatus.textContent = 'Local Mode';
      remoteAdStatus.className = 'text-xs font-semibold text-slate-400';
    }
    if (adminAdServerUrl) {
      adminAdServerUrl.value = adsEngine.remoteFeedUrl;
    }
  }

  if (syncAdsBtn && adminAdServerUrl) {
    syncAdsBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (window.soundEngine) window.soundEngine.playTap();
      const url = adminAdServerUrl.value.trim();
      if (!url) return;

      syncAdsBtn.disabled = true;
      syncAdsBtn.innerHTML = '<i data-lucide="loader-2" class="w-3.5 h-3.5 animate-spin"></i><span>Syncing...</span>';
      if (window.lucide) lucide.createIcons();

      const res = await adsEngine.setRemoteFeedUrl(url);
      syncAdsBtn.disabled = false;

      if (res.success) {
        syncAdsBtn.innerHTML = '<i data-lucide="check" class="w-3.5 h-3.5 text-emerald-300"></i><span>Synced!</span>';
        updateAdFeedStatus();
        renderAdminSlidesList();
      } else {
        syncAdsBtn.innerHTML = '<i data-lucide="alert-circle" class="w-3.5 h-3.5 text-red-300"></i><span>Failed</span>';
        if (remoteAdStatus) {
          remoteAdStatus.textContent = `Error: ${res.error}`;
          remoteAdStatus.className = 'text-xs font-semibold text-red-400';
        }
      }
      if (window.lucide) lucide.createIcons();

      setTimeout(() => {
        syncAdsBtn.innerHTML = '<i data-lucide="refresh-cw" class="w-3.5 h-3.5"></i><span>Sync Feed</span>';
        if (window.lucide) lucide.createIcons();
      }, 2500);
    });
  }

  if (clearFeedBtn) {
    clearFeedBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (window.soundEngine) window.soundEngine.playTap();
      if (adminAdServerUrl) adminAdServerUrl.value = '';
      localStorage.removeItem('kiosk_ad_server_url');
      adsEngine.remoteFeedUrl = window.location.protocol.startsWith('http') ? '/api/ads' : 'http://localhost:3000/api/ads';
      await adsEngine.fetchRemoteAds(adsEngine.remoteFeedUrl);

      updateAdFeedStatus();
      renderAdminSlidesList();
    });
  }

  // 6. Photo & Video Upload & Preview Logic
  const newSlideFile = document.getElementById('new-slide-file');
  const uploadPlaceholder = document.getElementById('upload-placeholder');
  const uploadPreviewContainer = document.getElementById('upload-preview-container');
  const uploadPreviewImg = document.getElementById('upload-preview-img');
  const uploadPreviewVideo = document.getElementById('upload-preview-video');
  const mediaTypeBadge = document.getElementById('media-type-badge');
  const removePreviewBtn = document.getElementById('remove-preview-btn');
  const newSlideDataUrl = document.getElementById('new-slide-dataurl');
  const newSlideMediaType = document.getElementById('new-slide-mediatype');
  const imageDropzone = document.getElementById('image-dropzone');
  const addSlideSubmitBtn = document.getElementById('add-slide-submit-btn');

  // QR Code Elements
  const newQrFile = document.getElementById('new-qr-file');
  const qrPlaceholder = document.getElementById('qr-placeholder');
  const qrPreviewContainer = document.getElementById('qr-preview-container');
  const qrPreviewImg = document.getElementById('qr-preview-img');
  const removeQrBtn = document.getElementById('remove-qr-btn');
  const newQrDataUrl = document.getElementById('new-qr-dataurl');

  function resetPhotoUpload() {
    if (newSlideFile) newSlideFile.value = '';
    if (newSlideDataUrl) newSlideDataUrl.value = '';
    if (newSlideMediaType) newSlideMediaType.value = 'image';
    if (uploadPreviewImg) {
      uploadPreviewImg.src = '';
      uploadPreviewImg.classList.add('hidden');
    }
    if (uploadPreviewVideo) {
      uploadPreviewVideo.src = '';
      uploadPreviewVideo.classList.add('hidden');
    }
    if (uploadPreviewContainer) uploadPreviewContainer.classList.add('hidden');
    if (uploadPlaceholder) uploadPlaceholder.classList.remove('hidden');
  }

  function resetQrUpload() {
    if (newQrFile) newQrFile.value = '';
    if (newQrDataUrl) newQrDataUrl.value = '';
    if (qrPreviewImg) qrPreviewImg.src = '';
    if (qrPreviewContainer) qrPreviewContainer.classList.add('hidden');
    if (qrPlaceholder) qrPlaceholder.classList.remove('hidden');
  }

  function handleFileSelect(file) {
    if (!file) return;

    const fileName = (file.name || '').toLowerCase();
    const isPng = file.type === 'image/png' || fileName.endsWith('.png') || file.type.startsWith('image/');
    const isMp4 = file.type === 'video/mp4' || fileName.endsWith('.mp4');

    if (!isPng && !isMp4) {
      alert('Invalid file format! Please select an image or MP4 video (.mp4).');
      resetPhotoUpload();
      return;
    }

    const isVideo = isMp4;
    const mediaType = isVideo ? 'video' : 'image';
    if (newSlideMediaType) newSlideMediaType.value = mediaType;
    if (mediaTypeBadge) {
      mediaTypeBadge.textContent = isVideo ? '🎬 MP4 Video Ad' : '📷 Image Ad';
      mediaTypeBadge.className = isVideo 
        ? 'absolute bottom-2 left-2 px-2.5 py-1 rounded-lg bg-indigo-900/80 backdrop-blur-md text-[10px] font-bold text-indigo-300 border border-white/10 uppercase tracking-wider z-30'
        : 'absolute bottom-2 left-2 px-2.5 py-1 rounded-lg bg-slate-900/80 backdrop-blur-md text-[10px] font-bold text-amber-300 border border-white/10 uppercase tracking-wider z-30';
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target.result;
      if (newSlideDataUrl) newSlideDataUrl.value = dataUrl;

      if (isVideo) {
        if (uploadPreviewImg) uploadPreviewImg.classList.add('hidden');
        if (uploadPreviewVideo) {
          uploadPreviewVideo.src = dataUrl;
          uploadPreviewVideo.classList.remove('hidden');
          uploadPreviewVideo.play().catch(() => {});
        }
      } else {
        if (uploadPreviewVideo) {
          uploadPreviewVideo.pause();
          uploadPreviewVideo.classList.add('hidden');
        }
        if (uploadPreviewImg) {
          uploadPreviewImg.src = dataUrl;
          uploadPreviewImg.classList.remove('hidden');
        }
      }

      if (uploadPlaceholder) uploadPlaceholder.classList.add('hidden');
      if (uploadPreviewContainer) uploadPreviewContainer.classList.remove('hidden');
      if (window.lucide) lucide.createIcons();
    };
    reader.readAsDataURL(file);
  }

  function handleQrSelect(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target.result;
      if (newQrDataUrl) newQrDataUrl.value = dataUrl;
      if (qrPreviewImg) qrPreviewImg.src = dataUrl;
      if (qrPlaceholder) qrPlaceholder.classList.add('hidden');
      if (qrPreviewContainer) qrPreviewContainer.classList.remove('hidden');
      if (window.lucide) lucide.createIcons();
    };
    reader.readAsDataURL(file);
  }

  if (newSlideFile) {
    newSlideFile.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) handleFileSelect(file);
    });
  }

  if (newQrFile) {
    newQrFile.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) handleQrSelect(file);
    });
  }

  if (removePreviewBtn) {
    removePreviewBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (window.soundEngine) window.soundEngine.playTap();
      resetPhotoUpload();
    });
  }

  if (removeQrBtn) {
    removeQrBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (window.soundEngine) window.soundEngine.playTap();
      resetQrUpload();
    });
  }

  // Drag and drop support for dropzone
  if (imageDropzone) {
    ['dragenter', 'dragover'].forEach(eventName => {
      imageDropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        imageDropzone.classList.add('border-indigo-500', 'bg-indigo-950/30');
      }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
      imageDropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        imageDropzone.classList.remove('border-indigo-500', 'bg-indigo-950/30');
      }, false);
    });

    imageDropzone.addEventListener('drop', (e) => {
      const dt = e.dataTransfer;
      const files = dt.files;
      if (files && files.length > 0) {
        handleFileSelect(files[0]);
      }
    }, false);
  }

  function renderAdminSlidesList() {
    updateAdFeedStatus();
    if (!adminSlidesList) return;
    adminSlidesList.innerHTML = '';

    adsEngine.slides.forEach((slide, idx) => {
      const isVideo = adsEngine.isVideoMedia(slide);
      const item = document.createElement('div');
      item.className = 'flex items-center justify-between p-3 rounded-xl bg-slate-800 border border-slate-700 text-sm';
      
      const mediaThumb = isVideo ? `
        <div class="relative w-12 h-8 rounded bg-black flex items-center justify-center flex-shrink-0 overflow-hidden border border-slate-700">
          <video src="${slide.mediaUrl}" class="w-full h-full object-cover" muted></video>
          <div class="absolute inset-0 bg-black/40 flex items-center justify-center">
            <i data-lucide="play" class="w-3 h-3 text-white"></i>
          </div>
        </div>
      ` : `
        <img src="${slide.mediaUrl}" class="w-12 h-8 rounded object-cover flex-shrink-0" alt="${slide.title}">
      `;

      item.innerHTML = `
        <div class="flex items-center gap-3 overflow-hidden">
          ${mediaThumb}
          <div class="truncate">
            <div class="flex items-center gap-1.5">
              <p class="font-bold text-slate-200 truncate">${slide.title}</p>
              ${isVideo ? '<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">VIDEO</span>' : ''}
              ${slide.qrCodeUrl ? '<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1"><i data-lucide="qr-code" class="w-3 h-3"></i>QR</span>' : ''}
            </div>
            <p class="text-xs text-slate-400 truncate">${slide.mediaUrl}</p>
          </div>
        </div>
        <button data-delete-id="${slide.id || idx}" class="p-2 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-all flex-shrink-0 ml-2">
          <i data-lucide="trash-2" class="w-4 h-4"></i>
        </button>
      `;

      item.querySelector('button').addEventListener('click', async (e) => {
        e.stopPropagation();
        if (window.soundEngine) window.soundEngine.playTap();

        // Attempt remote deletion if API is available
        try {
          if (slide.id) {
            const deleteEndpoint = adsEngine.remoteFeedUrl 
              ? adsEngine.remoteFeedUrl.replace(/\/ads\.json|\/api\/ads$/, `/api/ads/${slide.id}`)
              : `/api/ads/${slide.id}`;
            await fetch(deleteEndpoint, { method: 'DELETE' }).catch(() => {});
          }
        } catch (_) {}

        const newSlides = adsEngine.slides.filter((_, i) => i !== idx);
        adsEngine.saveSlides(newSlides);
        renderAdminSlidesList();
      });

      adminSlidesList.appendChild(item);
    });

    if (window.lucide) lucide.createIcons();
  }

  if (addSlideForm) {
    addSlideForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (window.soundEngine) window.soundEngine.playTap();

      const title = (document.getElementById('new-slide-title')?.value || '').trim() || 'Advertisement';
      const mediaDataUrl = newSlideDataUrl ? newSlideDataUrl.value.trim() : '';
      const mediaType = newSlideMediaType ? newSlideMediaType.value : 'image';
      const qrDataUrl = newQrDataUrl ? newQrDataUrl.value.trim() : '';

      if (!mediaDataUrl) {
        alert('Please select or upload a photo or video for the ad.');
        return;
      }

      if (addSlideSubmitBtn) {
        addSlideSubmitBtn.disabled = true;
        addSlideSubmitBtn.innerHTML = '<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i><span>Uploading & Processing...</span>';
        if (window.lucide) lucide.createIcons();
      }

      let finalMediaUrl = mediaDataUrl;
      let finalQrUrl = qrDataUrl;
      let finalType = mediaType;
      let adId = 'ad-' + Date.now();

      // Try uploading media to local or remote server API if available
      try {
        const uploadEndpoint = adsEngine.remoteFeedUrl 
          ? adsEngine.remoteFeedUrl.replace(/\/ads\.json|\/api\/ads$/, '/api/ads/upload')
          : '/api/ads/upload';

        const res = await fetch(uploadEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title,
            type: mediaType,
            mediaBase64: mediaDataUrl,
            qrBase64: qrDataUrl
          })
        });

        if (res.ok) {
          const result = await res.json();
          if (result.success && result.ad) {
            finalMediaUrl = result.ad.mediaUrl;
            finalQrUrl = result.ad.qrCodeUrl || qrDataUrl;
            finalType = result.ad.type || mediaType;
            adId = result.ad.id;
          }
        }
      } catch (err) {
        console.warn('Server upload unavailable, saving to local kiosk storage:', err);
      }

      const newSlide = {
        id: adId,
        type: finalType,
        title,
        mediaUrl: finalMediaUrl,
        qrCodeUrl: finalQrUrl
      };

      const updated = [newSlide, ...adsEngine.slides];
      adsEngine.saveSlides(updated);
      renderAdminSlidesList();

      // Reset form and upload UI
      addSlideForm.reset();
      resetPhotoUpload();
      resetQrUpload();

      if (addSlideSubmitBtn) {
        addSlideSubmitBtn.disabled = false;
        addSlideSubmitBtn.innerHTML = '<i data-lucide="check" class="w-4 h-4 text-emerald-300"></i><span>Ad Added!</span>';
        if (window.lucide) lucide.createIcons();
        setTimeout(() => {
          addSlideSubmitBtn.innerHTML = '<i data-lucide="plus" class="w-4 h-4"></i><span>Upload & Add Ad to Reel</span>';
          if (window.lucide) lucide.createIcons();
        }, 2000);
      }
    });
  }

  // 7. KIOSK LOCKDOWN & ANTI-SWIPE / GESTURE SECURITY
  
  // Disable right-click / long-tap context menu
  window.addEventListener('contextmenu', (e) => {
    e.preventDefault();
  }, { passive: false });

  // Disable dragging images/links off screen
  window.addEventListener('dragstart', (e) => {
    e.preventDefault();
  }, { passive: false });

  // Prevent multi-touch pinch-to-zoom gestures
  window.addEventListener('touchstart', (e) => {
    if (e.touches && e.touches.length > 1) {
      e.preventDefault();
    }
  }, { passive: false });

  // Prevent Safari / Chrome iOS gesture events
  window.addEventListener('gesturestart', (e) => e.preventDefault(), { passive: false });
  window.addEventListener('gesturechange', (e) => e.preventDefault(), { passive: false });
  window.addEventListener('gestureend', (e) => e.preventDefault(), { passive: false });

  // Block swipe navigation and browser exit key shortcuts
  window.addEventListener('keydown', (e) => {
    // Allow secret admin shortcut Ctrl + Shift + A
    if (e.ctrlKey && e.shiftKey && (e.key === 'A' || e.key === 'a' || e.key === 'K' || e.key === 'k')) {
      return;
    }

    // Block F5 (Refresh), F11, Alt+Left (Back), Alt+Right (Forward), Ctrl+R, Ctrl+W, Ctrl+N, Ctrl+T
    if (
      e.key === 'F5' ||
      (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) ||
      (e.ctrlKey && (e.key === 'r' || e.key === 'R' || e.key === 'w' || e.key === 'W' || e.key === 'n' || e.key === 'N' || e.key === 't' || e.key === 'T' || e.key === 'u' || e.key === 'U'))
    ) {
      e.preventDefault();
    }
  });

  lucide.createIcons();
});
