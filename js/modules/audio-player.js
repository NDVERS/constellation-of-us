/**
 * Constellation of Us - Audio Player & Ambient Soundscapes Module
 * Handles background music streaming, vinyl animation, visualizer EQ bars,
 * Web Audio API pentatonic synthesizer fallback, and procedural soft Bandung rain ambience.
 */

const curatedMixtape = [
  {
    id: "the-1975-about-you",
    title: "About You",
    artist: "The 1975",
    src: "./assets/audio/the-1975-about-you.m4a",
    tag: "Lagu Pembuka"
  },
  {
    id: "daniel-caesar-best-part",
    title: "Best Part (feat. H.E.R.)",
    artist: "Daniel Caesar",
    src: "./assets/audio/daniel-caesar-best-part.m4a",
    tag: "Akustik Manis"
  },
  {
    id: "cas-apocalypse",
    title: "Apocalypse",
    artist: "Cigarettes After Sex",
    src: "./assets/audio/cas-apocalypse.m4a",
    tag: "Langit Malam"
  },
  {
    id: "banda-neira-sampai-jadi-debu",
    title: "Sampai Jadi Debu",
    artist: "Banda Neira",
    src: "./assets/audio/banda-neira-sampai-jadi-debu.m4a",
    tag: "Syahdu Cimahi"
  }
];

if (typeof window !== "undefined") {
  window.curatedMixtape = curatedMixtape;
}

class AudioPlayerController {
  constructor() {
    this.audioPlayer = null;
    this.isPlaying = false;
    this.audioContext = null;
    this.synthInterval = null;

    // Curated Mixtape Playlist State
    this.mixtape = curatedMixtape;
    this.currentTrackIndex = 0;
    this.isShuffle = false;

    // Storage Keys
    this.RAIN_ACTIVE_KEY = "constellation_rain_active";
    this.RAIN_VOL_KEY = "constellation_rain_vol";

    // Dual Volume State (with LocalStorage restore)
    this.userMusicVolume = 0.5;
    let savedRainVol = 0.4;
    try {
      const vol = localStorage.getItem(this.RAIN_VOL_KEY);
      if (vol !== null) savedRainVol = Math.max(0, Math.min(1, parseFloat(vol) || 0.4));
    } catch (e) {}
    this.userRainVolume = savedRainVol;

    this.isDrawerOpen = false;
    this.isDucking = false;

    // Ambient Rain Generator State
    this.isRainActive = false;
    this.rainSourceNode = null;
    this.rainGainNode = null;
    this.rainFilterNode = null;
    this.rainStopTimer = null;

    this.init();
  }

  /**
   * Initializes audio element and stream source
   */
  init() {
    this.audioPlayer = new Audio();
    this.audioPlayer.preload = "none";
    this.audioPlayer.src = this.mixtape[this.currentTrackIndex].src;
    this.audioPlayer.loop = false;
    this.audioPlayer.volume = this.userMusicVolume;

    // Auto-advance to next track when finished
    this.audioPlayer.addEventListener("ended", () => {
      this.nextTrack();
    });

    this.audioPlayer.addEventListener("error", (e) => {
      console.log("Audio file error: Menggunakan Web Audio API synthesizer ambient fallback.", e);
      if (this.isPlaying) {
        this.startSynthesizedBGM();
      }
    });

    // Passive unlock for Web Audio API context upon first user interaction
    const unlockAudioContext = () => {
      if (this.audioContext && this.audioContext.state === "suspended") {
        this.audioContext.resume().catch(() => {});
      }
      // If user previously had rain active, start synthesizer on first gesture
      try {
        if (localStorage.getItem(this.RAIN_ACTIVE_KEY) === "true" && !this.isRainActive) {
          this.startRain(true);
        }
      } catch (e) {}
    };
    document.addEventListener("pointerdown", unlockAudioContext, { once: true, passive: true });
    // Initialize shuffle button visual state
    this.updateShuffleUI();

    // Click outside to smoothly close Soundscape Lounge Drawer
    document.addEventListener("pointerdown", (e) => {
      if (!this.isDrawerOpen) return;
      const drawer = document.getElementById("soundscape-drawer");
      if (!drawer || drawer.classList.contains("hidden")) return;

      // Ignore clicks inside the drawer (sliders, chips, controls)
      if (drawer.contains(e.target)) return;

      // Ignore clicks on drawer trigger buttons in floating pill bar
      const triggerBtn = document.getElementById("btn-open-soundscape");
      const vinylDisc = document.getElementById("vinyl-disc");
      const trackStatus = document.getElementById("audio-track-status");
      if (
        (triggerBtn && triggerBtn.contains(e.target)) ||
        (vinylDisc && vinylDisc.contains(e.target)) ||
        (trackStatus && trackStatus.contains(e.target))
      ) {
        return;
      }

      this.toggleSoundscapeDrawer(false);
    });
  }

  /**
   * Toggles Soundscape Lounge Drawer (Audio Mixer Modal)
   * @param {Boolean} forceState
   */
  toggleSoundscapeDrawer(forceState = null) {
    const drawer = document.getElementById("soundscape-drawer");
    if (!drawer) return;

    this.isDrawerOpen = forceState !== null ? forceState : !this.isDrawerOpen;

    if (this.isDrawerOpen) {
      drawer.classList.remove("hidden");
      drawer.classList.add("flex", "flex-col");
      this.syncDrawerUI();
    } else {
      drawer.classList.add("hidden");
      drawer.classList.remove("flex", "flex-col");
    }

    if (window.lucide) window.lucide.createIcons();
    if (window.triggerHaptic) window.triggerHaptic(15);
  }

  /**
   * Syncs slider inputs and channel toggle labels in the Soundscape Drawer
   */
  syncDrawerUI() {
    const musicSlider = document.getElementById("music-volume-slider");
    const musicLabel = document.getElementById("music-volume-label");
    const rainSlider = document.getElementById("rain-volume-slider");
    const rainLabel = document.getElementById("rain-volume-label");

    if (musicSlider) musicSlider.value = Math.round(this.userMusicVolume * 100);
    if (musicLabel) musicLabel.innerText = `${Math.round(this.userMusicVolume * 100)}%`;
    if (rainSlider) rainSlider.value = Math.round(this.userRainVolume * 100);
    if (rainLabel) rainLabel.innerText = `${Math.round(this.userRainVolume * 100)}%`;

    this.updateUI(this.isPlaying);
    this.updateRainUI(this.isRainActive);
    this.syncMixtapeUI();
  }

  /**
   * Returns currently active track object
   */
  getCurrentTrack() {
    return this.mixtape[this.currentTrackIndex] || this.mixtape[0];
  }

  /**
   * Loads and plays a track by index
   * @param {Number} index
   * @param {Boolean} autoPlay
   */
  setTrack(index, autoPlay = true) {
    if (index < 0 || index >= this.mixtape.length) return;
    this.currentTrackIndex = index;
    const track = this.getCurrentTrack();

    if (this.audioPlayer) {
      const wasPlaying = this.isPlaying;
      this.audioPlayer.src = track.src;
      this.audioPlayer.currentTime = 0;

      if (autoPlay || wasPlaying) {
        this.play();
      } else {
        this.updateUI(false);
      }
    }

    this.syncDrawerUI();
    if (window.triggerHaptic) window.triggerHaptic(15);
  }

  /**
   * Advances to the next track in the mixtape playlist (sequential or shuffled)
   */
  nextTrack() {
    if (this.isShuffle && this.mixtape.length > 1) {
      const otherIndices = this.mixtape
        .map((_, idx) => idx)
        .filter((idx) => idx !== this.currentTrackIndex);
      const randomIdx = otherIndices[Math.floor(Math.random() * otherIndices.length)];
      this.setTrack(randomIdx, true);
    } else {
      const nextIdx = (this.currentTrackIndex + 1) % this.mixtape.length;
      this.setTrack(nextIdx, true);
    }
  }

  /**
   * Goes back to previous track in the mixtape playlist
   */
  prevTrack() {
    const prevIdx = (this.currentTrackIndex - 1 + this.mixtape.length) % this.mixtape.length;
    this.setTrack(prevIdx, true);
  }

  /**
   * Toggles shuffle mode on or off
   * @returns {Boolean}
   */
  toggleShuffle() {
    this.isShuffle = !this.isShuffle;
    this.updateShuffleUI();
    if (window.triggerHaptic) window.triggerHaptic(20);
    return this.isShuffle;
  }

  /**
   * Updates shuffle button visual state with clear LED indicator and contrast styling
   */
  updateShuffleUI() {
    const btn = document.getElementById("btn-mixtape-shuffle");
    const dot = document.getElementById("shuffle-active-dot");
    if (!btn) return;

    if (this.isShuffle) {
      // State ON: background rose lembut, border rose terang, teks rose kontras, dot menyala
      btn.className = "relative flex items-center justify-center p-2 rounded-xl border border-rose-400 bg-rose-500/20 text-rose-500 shadow-sm transition-all duration-200 scale-105 cursor-pointer";
      btn.setAttribute("title", "Acak Lagu: Aktif");
      btn.setAttribute("aria-pressed", "true");
      if (dot) dot.classList.remove("hidden");
    } else {
      // State OFF: netral redup, border transparan/halus, dot mati
      btn.className = "relative flex items-center justify-center p-2 rounded-xl border border-transparent bg-black/5 dark:bg-white/5 text-slate-400 hover:text-slate-600 dark:text-white/40 dark:hover:text-white/80 transition-all duration-200 cursor-pointer active:scale-90";
      btn.setAttribute("title", "Acak Lagu: Mati");
      btn.setAttribute("aria-pressed", "false");
      if (dot) dot.classList.add("hidden");
    }
  }

  /**
   * Synchronizes mixtape UI elements in drawer
   */
  syncMixtapeUI() {
    const track = this.getCurrentTrack();
    if (!track) return;

    const titleEl = document.getElementById("mixtape-current-title");
    const artistEl = document.getElementById("mixtape-current-artist");
    const tagEl = document.getElementById("mixtape-current-tag");
    const tracklistEl = document.getElementById("mixtape-tracklist");

    if (titleEl) titleEl.innerText = track.title;
    if (artistEl) artistEl.innerText = track.artist;
    if (tagEl) tagEl.innerText = track.tag;

    this.updateShuffleUI();

    if (tracklistEl) {
      tracklistEl.innerHTML = this.mixtape
        .map((t, idx) => {
          const isActive = idx === this.currentTrackIndex;
          const activeClasses = isActive
            ? "border-rose-400 bg-rose-500/15 text-rose-600 dark:text-rose-300 ring-1 ring-rose-400/50 shadow-xs font-bold"
            : "border-slate-200/80 bg-white/60 text-slate-600 hover:bg-slate-100/80 hover:text-slate-900 dark:border-slate-700/60 dark:bg-slate-800/40 dark:text-slate-300 dark:hover:bg-slate-800 font-medium";

          return `
            <button
              type="button"
              onclick="window.app.audioPlayer.setTrack(${idx})"
              class="mixtape-chip flex items-center justify-between p-2 rounded-xl border text-left transition-all active:scale-95 cursor-pointer ${activeClasses}"
              title="${t.title} - ${t.artist} (${t.tag})"
            >
              <div class="min-w-0 pr-1">
                <p class="text-xs truncate">${t.title}</p>
                <p class="text-[10px] opacity-70 truncate">${t.artist}</p>
              </div>
              ${isActive ? `<span class="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse shrink-0"></span>` : ""}
            </button>
          `;
        })
        .join("");
    }

    if (window.lucide) window.lucide.createIcons();
  }

  /**
   * Adjusts BGM music volume independently
   * @param {Number} volume (0.0 to 1.0)
   */
  setMusicVolume(volume) {
    const clamped = Math.max(0, Math.min(1, parseFloat(volume) || 0));
    this.userMusicVolume = clamped;

    if (!this.isDucking && this.audioPlayer) {
      this.audioPlayer.volume = clamped;
    }

    const musicLabel = document.getElementById("music-volume-label");
    if (musicLabel) musicLabel.innerText = `${Math.round(clamped * 100)}%`;

    const musicSlider = document.getElementById("music-volume-slider");
    if (musicSlider && Math.abs(musicSlider.value - clamped * 100) > 1) {
      musicSlider.value = Math.round(clamped * 100);
    }
  }

  /**
   * Adjusts Bandung rain ambient volume independently
   * @param {Number} volume (0.0 to 1.0)
   */
  setRainVolume(volume) {
    const clamped = Math.max(0, Math.min(1, parseFloat(volume) || 0));
    this.userRainVolume = clamped;

    try {
      localStorage.setItem(this.RAIN_VOL_KEY, clamped.toString());
    } catch (e) {}

    if (this.isRainActive && this.rainGainNode && this.audioContext) {
      try {
        const now = this.audioContext.currentTime;
        this.rainGainNode.gain.setValueAtTime(this.rainGainNode.gain.value, now);
        this.rainGainNode.gain.exponentialRampToValueAtTime(Math.max(0.0001, clamped), now + 0.1);
      } catch (e) {}
    }

    const rainLabel = document.getElementById("rain-volume-label");
    if (rainLabel) rainLabel.innerText = `${Math.round(clamped * 100)}%`;

    const rainSlider = document.getElementById("rain-volume-slider");
    if (rainSlider && Math.abs(rainSlider.value - clamped * 100) > 1) {
      rainSlider.value = Math.round(clamped * 100);
    }
  }

  /**
   * Applies Quick Vibe soundscape presets
   * @param {String} type ('siang', 'hujan', 'malam')
   */
  applyPreset(type) {
    if (window.triggerHaptic) window.triggerHaptic([30, 40]);

    if (type === "siang") {
      // Hangout Siang: Hujan Off, Musik 70%
      if (this.isRainActive) this.stopRain();
      this.setMusicVolume(0.7);
      if (!this.isPlaying) this.play();

      if (window.app?.secretPuzzle?.showToast) {
        window.app.secretPuzzle.showToast("☀️ Preset 'Hangout Siang' on bwang, musik 70% :v");
      }
    } else if (type === "hujan") {
      // Hujan Temaram: Hujan 60%, Musik 40%
      this.setRainVolume(0.6);
      if (!this.isRainActive) this.startRain();
      this.setMusicVolume(0.4);
      if (!this.isPlaying) this.play();

      if (window.app?.secretPuzzle?.showToast) {
        window.app.secretPuzzle.showToast("🌧️ Hujan Bandung turun nih bwang, adem bener awas mager");
      }
    } else if (type === "malam") {
      // Malam Syahdu: Hujan 80%, Musik 20%
      this.setRainVolume(0.8);
      if (!this.isRainActive) this.startRain();
      this.setMusicVolume(0.2);
      if (!this.isPlaying) this.play();

      if (window.app?.secretPuzzle?.showToast) {
        window.app.secretPuzzle.showToast("🌙 Preset 'Malam Syahdu' aktif, fokus rintik hujan syahdu 💜");
      }
    }

    this.syncDrawerUI();
  }

  /**
   * Ensures AudioContext is created and running safely
   */
  getAudioContext() {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    if (!this.audioContext) {
      this.audioContext = new AudioCtx();
    }
    if (this.audioContext.state === "suspended") {
      this.audioContext.resume().catch(() => {});
    }
    return this.audioContext;
  }

  /**
   * Toggles audio BGM playback
   */
  toggle() {
    if (this.isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  }

  /**
   * Plays BGM audio with graceful synthesizer fallback
   */
  play() {
    if (window.requestScreenWakeLock) {
      window.requestScreenWakeLock();
    }

    this.stopSynthesizedBGM();

    const playPromise = this.audioPlayer.play();
    if (playPromise !== undefined) {
      playPromise
        .then(() => {
          this.isPlaying = true;
          this.updateUI(true);
        })
        .catch((err) => {
          // If browser autoplay policy blocks stream, wait for user gesture without switching to synth
          if (err && err.name === "NotAllowedError") {
            console.warn("Autoplay ditolak oleh browser. Menunggu interaksi pengguna.");
            this.isPlaying = false;
            this.updateUI(false);
          } else {
            console.warn("Audio playback error, fallback to synth chimes:", err);
            this.startSynthesizedBGM();
            this.isPlaying = true;
            this.updateUI(true);
          }
        });
    }
  }

  /**
   * Pauses BGM audio and optionally pauses ambient sounds
   */
  pause() {
    if (this.audioPlayer) {
      this.audioPlayer.pause();
    }
    this.stopSynthesizedBGM();
    this.isPlaying = false;
    this.updateUI(false);

    // Release wake lock if rain is also not active
    if (!this.isRainActive && !window.app?.secretPuzzle?.isLetterRevealed) {
      if (window.releaseScreenWakeLock) {
        window.releaseScreenWakeLock();
      }
    }
  }

  /**
   * Smoothly ducks BGM volume for reading secret messages or cinematic reveal
   * @param {Number} targetVolume (e.g. 0.18)
   * @param {Number} durationMs (e.g. 1000)
   * @param {Boolean} isDuckingState
   */
  duckVolume(targetVolume = 0.18, durationMs = 1000, isDuckingState = true) {
    if (!this.audioPlayer) return;
    this.isDucking = isDuckingState;

    if (this.volumeTransitionTimer) {
      clearInterval(this.volumeTransitionTimer);
      this.volumeTransitionTimer = null;
    }

    const startVolume = this.audioPlayer.volume;
    const startTime = Date.now();

    this.volumeTransitionTimer = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / durationMs, 1);
      
      const newVol = startVolume + (targetVolume - startVolume) * progress;
      try {
        this.audioPlayer.volume = Math.max(0, Math.min(1, newVol));
      } catch (e) {}

      if (progress >= 1) {
        clearInterval(this.volumeTransitionTimer);
        this.volumeTransitionTimer = null;
        if (!isDuckingState) {
          this.isDucking = false;
        }
      }
    }, 40);
  }

  /**
   * Restores BGM volume smoothly to user-set volume level
   * @param {Number} durationMs (e.g. 1200)
   */
  restoreVolume(durationMs = 1200) {
    if (!this.audioPlayer) return;
    this.duckVolume(this.userMusicVolume, durationMs, false);
  }

  /**
   * Gentle Web Audio API fallback for soothing background music chords
   */
  startSynthesizedBGM() {
    if (this.synthInterval) return;
    try {
      const ctx = this.getAudioContext();
      if (!ctx) return;

      // Soft romantic pentatonic notes (C major / A minor soothing frequencies)
      const notes = [261.63, 329.63, 392.0, 440.0, 523.25, 659.25];
      let noteIndex = 0;

      const playChime = () => {
        if (!this.isPlaying || !this.audioContext) return;
        const osc = this.audioContext.createOscillator();
        const gain = this.audioContext.createGain();

        osc.type = "sine";
        osc.frequency.setValueAtTime(notes[noteIndex % notes.length], this.audioContext.currentTime);
        noteIndex = (noteIndex + 1) % notes.length;

        gain.gain.setValueAtTime(0.001, this.audioContext.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.04, this.audioContext.currentTime + 0.8);
        gain.gain.exponentialRampToValueAtTime(0.0001, this.audioContext.currentTime + 3.2);

        osc.connect(gain);
        gain.connect(this.audioContext.destination);

        osc.start();
        osc.stop(this.audioContext.currentTime + 3.3);
      };

      playChime();
      this.synthInterval = setInterval(playChime, 2400);
    } catch (e) {
      console.warn("Web Audio synth not supported", e);
    }
  }

  /**
   * Stops Web Audio synthesizer
   */
  stopSynthesizedBGM() {
    if (this.synthInterval) {
      clearInterval(this.synthInterval);
      this.synthInterval = null;
    }
  }

  /**
   * Plays a delicate sparkle chime sound cue upon collecting a clue
   */
  playSparkleChime() {
    try {
      const ctx = this.getAudioContext();
      if (!ctx) return;
      if (ctx.state === "suspended") ctx.resume().catch(() => {});

      const now = ctx.currentTime;
      // High-pitched celestial chime frequencies (E6, G#6, B6)
      const freqs = [1318.51, 1661.22, 1975.53];
      freqs.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, now + idx * 0.07);

        gain.gain.setValueAtTime(0.001, now + idx * 0.07);
        gain.gain.exponentialRampToValueAtTime(0.06, now + idx * 0.07 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.07 + 0.35);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now + idx * 0.07);
        osc.stop(now + idx * 0.07 + 0.38);
      });
    } catch (e) {
      // Ignore if Web Audio blocked
    }
  }

  /**
   * Plays an ethereal celestial arpeggio chime chord upon unsealing the secret letter
   */
  playSecretRevealChime() {
    try {
      const ctx = this.getAudioContext();
      if (!ctx) return;
      if (ctx.state === "suspended") ctx.resume().catch(() => {});

      const now = ctx.currentTime;
      // Celestial harmonic frequencies (C5, E5, G5, B5, D6, G6)
      const freqs = [523.25, 659.25, 783.99, 987.77, 1174.66, 1567.98];

      freqs.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = idx % 2 === 0 ? "sine" : "triangle";
        osc.frequency.setValueAtTime(freq, now + idx * 0.11);

        gain.gain.setValueAtTime(0.001, now + idx * 0.11);
        gain.gain.exponentialRampToValueAtTime(0.08, now + idx * 0.11 + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.11 + 1.4);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now + idx * 0.11);
        osc.stop(now + idx * 0.11 + 1.45);
      });
    } catch (e) {
      // Ignore if Web Audio blocked
    }
  }

  /**
   * Warm music swell effect for cinematic reveal
   * @param {Number} peakVolume
   * @param {Number} durationMs
   */
  swellVolume(peakVolume = 0.65, durationMs = 3500) {
    if (!this.audioPlayer || !this.isPlaying) return;

    if (this.volumeTransitionTimer) {
      clearInterval(this.volumeTransitionTimer);
      this.volumeTransitionTimer = null;
    }

    const startVol = this.audioPlayer.volume;
    const targetPeak = Math.min(1, Math.max(startVol, peakVolume));
    const startTime = Date.now();
    const halfDuration = durationMs / 2;

    this.volumeTransitionTimer = setInterval(() => {
      const elapsed = Date.now() - startTime;
      let newVol = startVol;

      if (elapsed < halfDuration) {
        const progress = elapsed / halfDuration;
        newVol = startVol + (targetPeak - startVol) * progress;
      } else if (elapsed < durationMs) {
        const progress = (elapsed - halfDuration) / halfDuration;
        newVol = targetPeak + (0.22 - targetPeak) * progress;
      } else {
        newVol = 0.22;
        clearInterval(this.volumeTransitionTimer);
        this.volumeTransitionTimer = null;
      }

      try {
        this.audioPlayer.volume = Math.max(0, Math.min(1, newVol));
      } catch (e) {}
    }, 40);
  }

  /* ========================================================================
   * SOUNDSCAPES AMBIENCE: PROCEDURAL SOFT BANDUNG RAIN SYNTHESIZER
   * ======================================================================== */

  /**
   * Generates a 5-second pink noise buffer with natural drizzle modulation
   */
  createRainNoiseBuffer() {
    const ctx = this.getAudioContext();
    if (!ctx) return null;

    const bufferSize = ctx.sampleRate * 5;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);

    // Paul Kellet's Pink Noise Algorithm for warm rainfall rumble
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;

    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.969 * b2 + white * 0.153852;
      b3 = 0.8665 * b3 + white * 0.3104856;
      b4 = 0.55 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.016898;
      const pink = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
      b6 = white * 0.115926;

      // Soft wave modulation to simulate gentle breeze and raindrops variation
      const modulation = 0.88 + 0.12 * Math.sin((i / bufferSize) * Math.PI * 6);
      data[i] = pink * 0.28 * modulation;
    }

    return buffer;
  }

  /**
   * Toggles soft Bandung rain ambience
   */
  toggleRain() {
    if (this.isRainActive) {
      this.stopRain();
    } else {
      this.startRain();
    }
  }

  /**
   * Starts procedural soft rain ambience
   */
  /**
   * Starts procedural soft rain ambience
   * @param {Boolean} skipToast
   */
  async startRain(skipToast = false) {
    try {
      if (this.rainStopTimer) {
        clearTimeout(this.rainStopTimer);
        this.rainStopTimer = null;
      }

      try {
        localStorage.setItem(this.RAIN_ACTIVE_KEY, "true");
      } catch (e) {}

      // Start Visual Canvas Rain FX
      if (window.app?.rainFx) {
        window.app.rainFx.start();
      }

      const ctx = this.getAudioContext();
      if (!ctx) return;

      if (ctx.state === "suspended") {
        await ctx.resume();
      }

      // Clean up previous source node if still running
      if (this.rainSourceNode) {
        try {
          this.rainSourceNode.stop();
          this.rainSourceNode.disconnect();
        } catch (err) {}
        this.rainSourceNode = null;
      }

      const rainBuffer = this.createRainNoiseBuffer();
      if (!rainBuffer) return;

      // Create looping buffer source
      this.rainSourceNode = ctx.createBufferSource();
      this.rainSourceNode.buffer = rainBuffer;
      this.rainSourceNode.loop = true;

      // Lowpass filter for crisp yet natural Bandung drizzle texture
      this.rainFilterNode = ctx.createBiquadFilter();
      this.rainFilterNode.type = "lowpass";
      this.rainFilterNode.frequency.setValueAtTime(1250, ctx.currentTime);
      this.rainFilterNode.Q.setValueAtTime(1.0, ctx.currentTime);

      // Smooth Gain Node for volume (target volume: userRainVolume)
      this.rainGainNode = ctx.createGain();
      this.rainGainNode.gain.setValueAtTime(0.001, ctx.currentTime);
      this.rainGainNode.gain.exponentialRampToValueAtTime(Math.max(0.0001, this.userRainVolume), ctx.currentTime + 1.2);

      // Connect nodes: Source -> Filter -> Gain -> Destination
      this.rainSourceNode.connect(this.rainFilterNode);
      this.rainFilterNode.connect(this.rainGainNode);
      this.rainGainNode.connect(ctx.destination);

      this.rainSourceNode.start();
      this.isRainActive = true;
      this.updateRainUI(true);

      if (window.requestScreenWakeLock) {
        window.requestScreenWakeLock();
      }

      if (window.triggerHaptic) window.triggerHaptic(25);

      if (!skipToast && window.app?.secretPuzzle?.showToast) {
        window.app.secretPuzzle.showToast("🌧️ Hujan Bandung turun nih bwang, adem bener awas mager");
      }
    } catch (e) {
      console.warn("Could not start rain ambience:", e);
    }
  }

  /**
   * Stops soft rain ambience with gentle fade out
   */
  stopRain() {
    if (!this.isRainActive) return;

    this.isRainActive = false;
    this.updateRainUI(false);

    if (!this.isPlaying && !window.app?.secretPuzzle?.isLetterRevealed) {
      if (window.releaseScreenWakeLock) {
        window.releaseScreenWakeLock();
      }
    }

    try {
      localStorage.setItem(this.RAIN_ACTIVE_KEY, "false");
    } catch (e) {}

    // Stop Visual Canvas Rain FX
    if (window.app?.rainFx) {
      window.app.rainFx.stop();
    }

    if (this.rainStopTimer) {
      clearTimeout(this.rainStopTimer);
      this.rainStopTimer = null;
    }

    try {
      const ctx = this.audioContext;
      const currentSource = this.rainSourceNode;

      if (ctx && this.rainGainNode) {
        this.rainGainNode.gain.setValueAtTime(this.rainGainNode.gain.value, ctx.currentTime);
        this.rainGainNode.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.6);

        this.rainStopTimer = setTimeout(() => {
          if (currentSource) {
            try {
              currentSource.stop();
              currentSource.disconnect();
            } catch (err) {
              // ignore if already stopped
            }
          }
          if (this.rainSourceNode === currentSource) {
            this.rainSourceNode = null;
          }
          this.rainStopTimer = null;
        }, 650);
      } else if (currentSource) {
        try {
          currentSource.stop();
          currentSource.disconnect();
        } catch (err) {}
        this.rainSourceNode = null;
      }
    } catch (e) {
      console.warn("Error stopping rain ambience:", e);
    }

    this.isRainActive = false;
    this.updateRainUI(false);
  }

  /**
   * Updates rain toggle button appearance and drawer channel state
   * @param {Boolean} isActive
   */
  updateRainUI(isActive) {
    const rainBtn = document.getElementById("btn-toggle-rain");
    const drawerRainToggle = document.getElementById("channel-rain-toggle");

    if (rainBtn) {
      if (isActive) {
        rainBtn.classList.add("active-rain", "ambient-ripple-active");
        rainBtn.classList.remove("text-slate-500", "bg-slate-100", "border-slate-200/60");
      } else {
        rainBtn.classList.remove("active-rain", "ambient-ripple-active");
        rainBtn.classList.add("text-slate-500", "bg-slate-100", "border-slate-200/60");
      }
    }

    if (drawerRainToggle) {
      if (isActive) {
        drawerRainToggle.className = "px-2.5 py-0.5 text-xs font-bold rounded-full transition-all bg-sky-500 text-white shadow-xs";
        drawerRainToggle.innerText = "Aktif";
      } else {
        drawerRainToggle.className = "px-2.5 py-0.5 text-xs font-bold rounded-full transition-all bg-slate-200 text-slate-600";
        drawerRainToggle.innerText = "Mati";
      }
    }

    if (window.lucide) window.lucide.createIcons();
  }

  /**
   * Updates floating player button aesthetics, visualizer, and drawer channel state
   * @param {Boolean} isPlaying
   */
  updateUI(isPlaying) {
    const vinyl = document.getElementById("vinyl-disc");
    const eq = document.getElementById("audio-visualizer");
    const icon = document.getElementById("audio-play-icon");
    const playBtn = document.getElementById("audio-play-btn");
    const title = document.getElementById("audio-track-status");
    const drawerMusicToggle = document.getElementById("channel-music-toggle");

    if (vinyl) {
      if (isPlaying) vinyl.classList.add("playing");
      else vinyl.classList.remove("playing");
    }

    if (playBtn) {
      if (isPlaying) playBtn.classList.add("ambient-ripple-active");
      else playBtn.classList.remove("ambient-ripple-active");
    }

    if (eq) {
      if (isPlaying) eq.classList.remove("eq-paused");
      else eq.classList.add("eq-paused");
    }

    if (icon) {
      icon.setAttribute("data-lucide", isPlaying ? "pause" : "music");
      if (window.lucide) window.lucide.createIcons();
    }

    if (title) {
      const currentTrack = this.getCurrentTrack();
      title.innerText = isPlaying ? `${currentTrack.title}` : `Paused: ${currentTrack.title}`;
      title.title = `${currentTrack.title} - ${currentTrack.artist} (${currentTrack.tag})`;
    }

    if (drawerMusicToggle) {
      if (isPlaying) {
        drawerMusicToggle.className = "px-2.5 py-0.5 text-xs font-bold rounded-full transition-all bg-rose-500 text-white shadow-xs";
        drawerMusicToggle.innerText = "Aktif";
      } else {
        drawerMusicToggle.className = "px-2.5 py-0.5 text-xs font-bold rounded-full transition-all bg-slate-200 text-slate-600";
        drawerMusicToggle.innerText = "Mati";
      }
    }
  }
}

if (typeof window !== "undefined") {
  window.AudioPlayerController = AudioPlayerController;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { curatedMixtape, AudioPlayerController };
}
