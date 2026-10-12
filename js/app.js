/**
 * Global Safe Haptic Feedback Helper
 * Safely checks navigator.vibrate support for mobile devices
 * @param {Number|Array} pattern - Duration in ms or vibration sequence
 */
window.triggerHaptic = function (pattern = 20) {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    try {
      navigator.vibrate(pattern);
    } catch (e) {
      // Ignored if browser/OS disallows or on desktop
    }
  }
};

/**
 * Global Screen Wake Lock Helper
 * Prevents mobile devices from sleeping during audio playback or letter reading
 */
window.wakeLockSentinel = null;
window.requestScreenWakeLock = async function () {
  if (typeof navigator !== "undefined" && "wakeLock" in navigator && !window.wakeLockSentinel) {
    try {
      window.wakeLockSentinel = await navigator.wakeLock.request("screen");
      window.wakeLockSentinel.addEventListener("release", () => {
        window.wakeLockSentinel = null;
      });
    } catch (e) {
      // Ignored if user/system denies or in low power mode
    }
  }
};

window.releaseScreenWakeLock = function () {
  if (window.wakeLockSentinel) {
    try {
      window.wakeLockSentinel.release();
    } catch (e) {}
    window.wakeLockSentinel = null;
  }
};

// Re-request wakeLock upon tab refocus if audio or letter active
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      const isAudioActive = window.app?.audioPlayer?.isPlaying || window.app?.audioPlayer?.isRainActive;
      const isLetterActive = window.app?.secretPuzzle?.isLetterRevealed;
      if (isAudioActive || isLetterActive) {
        window.requestScreenWakeLock();
      }
    }
  });
}

class ConstellationApp {
  constructor() {
    this.memories = [];
    this.unlockedIds = new Set();
    this.currentMemory = null;
    this.STORAGE_KEY = "constellation_unlocked_memories";

    this.THEME_STORAGE_KEY = "constellation_theme_mode";
    this.theme = "light";

    // Initialize Modular Sub-Controllers
    this.rainFx = new RainFXController();
    this.audioPlayer = new AudioPlayerController();
    this.secretPuzzle = new SecretPuzzleController(this);
    this.polaroidModal = new PolaroidModalController(this);
    this.sidebar = new SidebarController(this);
    this.mapInstance = null;

    // Tour State
    this.isTourRunning = false;
    this.tourTimer = null;

    this.init();
  }

  /**
   * Initializes application lifecycle
   */
  async init() {
    this.loadUnlockedState();
    this.initMap();
    this.initTheme();
    this.setupEventListeners();
    this.sidebar.updateInitialUI();
    await this.loadMemories();
    this.sidebar.render();
    this.sidebar.updateStats();

    // Restore saved rain FX visual state if active
    try {
      if (localStorage.getItem("constellation_rain_active") === "true") {
        this.rainFx.start();
        this.audioPlayer.isRainActive = true;
        this.audioPlayer.updateRainUI(true);
      }
    } catch (e) {}

    this.initStarDustCursor();

    if (window.lucide) {
      lucide.createIcons();
    }
  }

  /**
   * Initializes celestial star dust trail on desktop cursors
   */
  initStarDustCursor() {
    if (typeof window === "undefined" || !window.matchMedia || !window.matchMedia("(pointer: fine)").matches) {
      return;
    }

    let lastTime = 0;
    const symbols = ["✦", "✧", "⋆", "✨", "✦"];
    const colors = ["#fb7185", "#f59e0b", "#fbbf24", "#fda4af", "#e0e7ff"];

    window.addEventListener(
      "pointermove",
      (e) => {
        const now = performance.now();
        if (now - lastTime < 45) return; // 45ms throttle
        lastTime = now;

        const particle = document.createElement("span");
        particle.className = "star-dust-particle";
        particle.innerText = symbols[Math.floor(Math.random() * symbols.length)];
        particle.style.left = `${e.clientX}px`;
        particle.style.top = `${e.clientY}px`;
        particle.style.color = colors[Math.floor(Math.random() * colors.length)];

        const tx = (Math.random() - 0.5) * 28;
        const ty = (Math.random() - 0.5) * 28 + 14;
        particle.style.setProperty("--tx", `${tx}px`);
        particle.style.setProperty("--ty", `${ty}px`);

        document.body.appendChild(particle);
        setTimeout(() => particle.remove(), 600);
      },
      { passive: true }
    );
  }

  /**
   * Initializes theme from saved preference or real-time device hour
   */
  initTheme() {
    let savedTheme = null;
    try {
      savedTheme = localStorage.getItem(this.THEME_STORAGE_KEY);
    } catch (e) {
      console.warn("Theme localStorage read error:", e);
    }

    const validThemes = ["light", "sunset", "dark"];
    const activeTheme = validThemes.includes(savedTheme) ? savedTheme : this.getAutomaticTheme();
    this.applyTheme(activeTheme, false);
  }

  /**
   * Calculates automatic theme mode based on local device hours
   * Day: 06:00 - 16:59, Sunset: 17:00 - 18:29, Night: 18:30 - 05:59
   * @returns {String} 'light', 'sunset', or 'dark'
   */
  getAutomaticTheme() {
    const now = new Date();
    const hour = now.getHours();
    const minute = now.getMinutes();
    const totalMinutes = hour * 60 + minute;

    // 17:00 (1020m) to 18:30 (1110m) = Sunset Lembayung Bandung
    if (totalMinutes >= 1020 && totalMinutes < 1110) {
      return "sunset";
    }
    // 18:30 to 05:59 = Dark Night
    if (totalMinutes >= 1110 || totalMinutes < 360) {
      return "dark";
    }
    // 06:00 to 16:59 = Light Day
    return "light";
  }

  /**
   * Toggles between 3 modes manually: Light (Siang) ➔ Sunset (Senja) ➔ Dark (Malam)
   */
  toggleTheme() {
    let nextTheme = "light";
    if (this.theme === "light") {
      nextTheme = "sunset";
    } else if (this.theme === "sunset") {
      nextTheme = "dark";
    } else {
      nextTheme = "light";
    }

    try {
      localStorage.setItem(this.THEME_STORAGE_KEY, nextTheme);
    } catch (e) {
      console.warn("Theme localStorage save error:", e);
    }

    if (window.triggerHaptic) window.triggerHaptic(20);
    this.applyTheme(nextTheme, true);
  }

  /**
   * Applies the theme state to DOM, Map tile layer, and Header icon
   * @param {String} theme ('light', 'sunset', or 'dark')
   * @param {Boolean} showToastMessage
   */
  applyTheme(theme = "light", showToastMessage = false) {
    this.theme = theme;
    const isDark = theme === "dark";
    const isSunset = theme === "sunset";

    // Toggle body & html dark theme classes
    document.body.classList.toggle("theme-dark", isDark);
    document.body.classList.toggle("dark", isDark);
    document.documentElement.classList.toggle("dark", isDark);
    document.body.classList.toggle("theme-sunset", isSunset);

    // Update Map tile layer and constellation lines
    if (this.mapInstance && typeof this.mapInstance.setTheme === "function") {
      this.mapInstance.setTheme(theme);
    }

    // Update Header Theme Toggle Icon
    const themeBtn = document.getElementById("btn-toggle-theme");
    const themeIcon = document.getElementById("theme-toggle-icon");
    if (themeIcon) {
      if (theme === "light") {
        themeIcon.setAttribute("data-lucide", "sunset");
        themeIcon.setAttribute("class", "w-4 h-4 sm:w-4.5 sm:h-4.5 text-amber-500");
        if (themeBtn) themeBtn.setAttribute("title", "Beralih ke Mode Senja (Sunset Lembayung)");
      } else if (theme === "sunset") {
        themeIcon.setAttribute("data-lucide", "moon");
        themeIcon.setAttribute("class", "w-4 h-4 sm:w-4.5 sm:h-4.5 text-indigo-400");
        if (themeBtn) themeBtn.setAttribute("title", "Beralih ke Mode Malam");
      } else {
        themeIcon.setAttribute("data-lucide", "sun");
        themeIcon.setAttribute("class", "w-4 h-4 sm:w-4.5 sm:h-4.5 text-amber-400");
        if (themeBtn) themeBtn.setAttribute("title", "Beralih ke Mode Siang");
      }
      if (window.lucide) lucide.createIcons();
    }

    if (showToastMessage && this.secretPuzzle && typeof this.secretPuzzle.showToast === "function") {
      let msg = "☀️ Mode Siang aktif";
      if (theme === "sunset") {
        msg = "🌇 Mode Senja (Sunset Lembayung Bandung) aktif 💜";
      } else if (theme === "dark") {
        msg = "🌙 Mode Malam aktif";
      }
      this.secretPuzzle.showToast(msg);
    }
  }

  /**
   * Loads unlocked memory IDs from localStorage
   */
  loadUnlockedState() {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        const ids = JSON.parse(stored);
        if (Array.isArray(ids)) {
          this.unlockedIds = new Set(ids);
        }
      }
    } catch (e) {
      console.warn("LocalStorage access error:", e);
      this.unlockedIds = new Set();
    }
  }

  /**
   * Saves unlocked memory ID to localStorage
   * @param {String} id
   */
  saveUnlockedState(id) {
    this.unlockedIds.add(id);
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(Array.from(this.unlockedIds)));
    } catch (e) {
      console.warn("LocalStorage save error:", e);
    }
  }

  /**
   * Unlocks a specific memory by ID, persists it, and updates UI & map
   * @param {String} memoryId
   */
  unlockMemory(memoryId) {
    if (!memoryId) return;
    const memory = this.memories.find((m) => m.id === memoryId);
    if (memory) {
      memory.isLocked = false;
    }
    this.saveUnlockedState(memoryId);
    if (this.mapInstance) {
      this.mapInstance.updateMarkerStatus(memoryId, false);
    }
    if (this.sidebar) {
      this.sidebar.render();
      this.sidebar.updateStats();
    }
  }

  /**
   * Initializes Leaflet map instance
   */
  initMap() {
    this.mapInstance = new MemoryMap("map");
    this.mapController = this.mapInstance;
    this.mapInstance.init([-6.8950, 107.5680], 13);
  }

  /**
   * Fetches memories from data/memories.json with 4s AbortController timeout & offline fallback
   */
  async loadMemories() {
    const fallbackData = [
      {
        id: "memory-paskal-cgv",
        order: 1,
        title: "Nonton Spider-Man di 23 Paskal",
        category: "Weekend Hangout",
        date: "17 Agu 2026",
        time: "13:00 - 17:30 WIB",
        location: "CGV 23 Paskal Shopping Center, Bandung",
        coords: [-6.9157, 107.5957],
        photos: [
          {
            url: "assets/images/paskal/paskal-1.jpg",
            caption: "Momen awal kebersamaan nonton Spider-Man di CGV 23 Paskal 🍿"
          }
        ],
        story: "Awal mula petualangan hangout seru di masa PKL, nonton bareng Spider-Man di CGV 23 Paskal.",
        quiz: {
          question: "Film apa yang kita tonton bareng waktu pertama kali hangout di 23 Paskal?",
          answer: "Spider-Man: Brand New Day",
          acceptedAnswers: [
            "Spider-Man",
            "Spiderman",
            "BND",
            "Brand New Day",
            "Spiderman Brand New Day",
            "Spider-Man Brand New Day",
            "Spiderman: Brand New Day",
            "Spider-Man: Brand New Day"
          ],
          hint: "Petualangan Spider-Man: Brand New Day (bisa ketik Spider-Man, Brand New Day, atau BND) 🕷️"
        },
        secretClue: "The"
      },
      {
        id: "memory-ciwalk-bandung",
        order: 2,
        title: "Seharian Penuh Cerita di Ciwalk",
        category: "Our Little Adventures",
        date: "27 Sep 2026",
        time: "11:00 - 21:30 WIB",
        location: "Cihampelas Walk (Ciwalk), Bandung",
        coords: [-6.8936, 107.6047],
        photos: [
          {
            url: "assets/images/ciwalk/ciwalk-nonton.jpg",
            caption: "Start hari di bioskop nonton Avengers: Endgame Encore jam 12.30, seru bener kata guwa mah 🎬🍿",
            position: "right 90%"
          },
          {
            url: "assets/images/ciwalk/ciwalk-skywalk.jpg",
            caption: "Keliling Skywalk jam 16.13 abis bioskop, awas nyungsep bwang nikmatin sore Bandung 🌿😏"
          },
          {
            url: "assets/images/ciwalk/ciwalk-gigglebox.jpg",
            caption: "Perut demo kelaparan langsung mendarat kenyang di Giggle Box (16.31 – 18.27) nyam nyam 🍛🤤"
          },
          {
            url: "assets/images/ciwalk/ciwalk-heartwarmer.jpg",
            caption: "Nemenin nona Yumi hunting jepitan rambut & clay di Heartwarmer jam 18.34, lucu bener zirr 🧸🎀"
          },
          {
            url: "assets/images/ciwalk/ciwalk-kafe-fore.jpg",
            caption: "Nongki santai di Fore (19.39): Cafe Latte buat nona Yumi & Americano pait buat hamba ☕🥤"
          },
          {
            url: "assets/images/ciwalk/ciwalk-clay.jpg",
            caption: "Fokus mode on ngebentuk clay warna-warni ampe jam 20.51, berasa maen menkrep versi nyata 🎨👐"
          },
          {
            url: "assets/images/ciwalk/ciwalk-clay-result.jpg",
            caption: "6 karya masterpiece kita nih: cumi/gurita unguu, jamur Mario bermata, & bunga Patrick 🐙🍄🌸"
          },
          {
            url: "assets/images/ciwalk/ciwalk-jco.jpg",
            caption: "Mampir bungkus donat J.CO jam 21.13 buat orang rumahnya nona Yumi 🍩🏠 Hamba mah sendirian di perantauan jadi gak butuh jajan ginian ege, nemenin doang kata guwa mah :v"
          },
          {
            url: "assets/images/ciwalk/ciwalk-chikuro.jpg",
            caption: "Last destination OTW serbu Chikuro jam 21.20 sebelum pulang, mantap bener dah 🥖🧀"
          }
        ],
        timeline: [
          { time: "12.30", icon: "🎬", text: "Avengers: Endgame Encore" },
          { time: "16.13", icon: "🌿", text: "Skywalk sore awas nyungsep" },
          { time: "16.31", icon: "🍛", text: "Makan kenyang di Giggle Box" },
          { time: "18.34", icon: "🧸", text: "Heartwarmer & hunting jepitan" },
          { time: "19.39", icon: "🎨", text: "Fore Coffee & kreasi clay" },
          { time: "21.13", icon: "🍩", text: "J.CO & jajan Chikuro" }
        ],
        story: "Rute marathon jalan seharian bareng nona Ayumi Keira di Ciwalk menjelang beres PKL. Dari heboh nonton bioskop, makan kenyang nyam nyam, ngebentuk clay menkrep roblok, sampe jajan malam banyaaa 🤤",
        quiz: {
          question: "Di Fore Coffee Ciwalk, minuman apa yang dipesen nona Yumi?",
          answer: "cafe latte",
          hint: "Kopi susu klasik yang creamy dan hangat ☕"
        },
        secretClue: "moon"
      },
      {
        id: "memory-gacoan-padasuka",
        order: 3,
        title: "Makan Pedas & Kanvas Paus di Gacoan",
        category: "Warm Hangout",
        date: "04 Okt 2026",
        time: "14:40 - 16:20 WIB",
        location: "Mie Gacoan Padasuka, Cimahi",
        coords: [-6.8785, 107.5255],
        photos: [
          {
            url: "assets/images/gacoan/gacoan-padasuka-depan.jpg",
            caption: "Tampak depan Mie Gacoan Padasuka 🏠"
          },
          {
            url: "assets/images/gacoan/gacoan-kanvas-paus.jpg",
            caption: "Koleksi kado kenangan: kanvas paus, bricks bunga ungu yang sudah dirakit & bricks toko boba 💜🧋"
          },
          {
            url: "assets/images/gacoan/gacoan-mie-pedas.jpg",
            caption: "Dua porsi Mie Gacoan pedas lengkap dengan pangsit renyah 🥢"
          },
          {
            url: "assets/images/gacoan/gacoan-hoodie-biru.jpg",
            caption: "Ketawa malu-malu di balik hoodie biru 💙"
          }
        ],
        story: "Membuka pertemuan terakhir dengan semangkuk mie pedas di Gacoan Padasuka sekitar jam 14.40 WIB. Suasana penuh tawa ditemani lukisan paus yang berenang di langit berbintang, bricks bunga ungu yang sudah terakit rapi dan bricks mini toko boba yang siap dirakit, serta obrolan hangat sebelum petualangan berlanjut.",
        quiz: {
          question: "Gambar hewan apa yang ada di lukisan kanvas mini waktu kita makan di Gacoan Padasuka?",
          answer: "paus",
          hint: "Hewan laut raksasa yang berenang di lautan langit malam 🐳"
        },
        secretClue: "is"
      },
      {
        id: "memory-milkyverse-ramayana",
        order: 4,
        title: "Misi Gelang Luar Angkasa Milky Verse",
        category: "Playground Adventure",
        date: "04 Okt 2026",
        time: "16:40 - 18:30 WIB",
        location: "Milky Verse, Ramayana Cimahi Lt. 3",
        coords: [-6.8744, 107.5458],
        photos: [
          {
            type: "image",
            url: "assets/images/milkyverse/milkyverse-lempar-sasaran.jpg",
            caption: "Fokus membidik target lempar empuk velcro 🎯✨"
          },
          {
            type: "video",
            url: "assets/videos/milkyverse-seluncuran-neon.mp4",
            caption: "Meluncur seru di perosotan lampu neon warna-warni kosmik 🌈⚡"
          },
          {
            type: "video",
            url: "assets/videos/milkyverse-perosotan-terowongan.mp4",
            caption: "Mendarat santai di kolam bola dari terowongan ungu raksasa 💜🟣"
          },
          {
            type: "video",
            url: "assets/videos/milkyverse-tangga-rol-ungu.mp4",
            caption: "Menaklukkan rintangan tangga rol putar warna-warni 🪜✨"
          },
          {
            type: "video",
            url: "assets/videos/milkyverse-keliling-arena.mp4",
            caption: "Keliling arena bermain luar angkasa Milky Verse Ramayana Cimahi 🚀🪐"
          }
        ],
        story: "Tiba di Ramayana Cimahi sekitar pukul 16.40 WIB, langsung memakai tiket gelang biru kembar luar angkasa Milky Verse. Puas seru-seruan meluncur di perosotan lampu neon, melempar sasaran empuk, lalu jalan santai menyusuri lorong belanja supermarket sampai menjelang maghrib.",
        quiz: {
          question: "Apa tulisan di tiket gelang biru kembar yang kita pakai di arena bermain Ramayana?",
          answer: "milky verse",
          hint: "Ada kata 'Milky' seperti galaksi tempat bintang berpijar 🌌"
        },
        secretClue: "beautiful,"
      },
      {
        id: "memory-the-upperside-cimall",
        order: 5,
        title: "Citylight & Kado Istimewa The Upperside",
        category: "Rooftop Vibe",
        date: "04 Okt 2026",
        time: "19:02 - 21:50 WIB",
        location: "MR.DIY & The Upperside Rooftop Cimahi Mall",
        coords: [-6.8725, 107.5424],
        photos: [
          {
            url: "assets/images/upperside/upperside-sign-rooftop.jpg",
            caption: "Tiba di rooftop Cimahi Mall disambut pendar neon sign The Upperside 🏙️✨"
          },
          {
            url: "assets/images/upperside/upperside-naik-tangga.jpg",
            caption: "Menapaki tangga ungu menuju dek balkon atas The Upperside 💜🪜"
          },
          {
            url: "assets/images/upperside/upperside-mrdiy-capybara.jpg",
            caption: "Mampir ke MR.DIY Cimahi Mall, gemas melihat deretan boneka & merchandise capybara 🦫✨"
          },
          {
            url: "assets/images/upperside/upperside-mrdiy-lorong.jpg",
            caption: "Berkeliling lorong belanja MR.DIY sebelum naik ke rooftop 🛍️🚶‍♀️"
          },
          {
            url: "assets/images/upperside/upperside-kado-meja.jpg",
            caption: "Meja balkon penuh kado istimewa dari Yumi sebelum perjalanan PKL usai 🎁🐙"
          },
          {
            url: "assets/images/upperside/upperside-kado-bricks-kue.jpg",
            caption: "Bricks kue ulang tahun berpendar lampu rakitan Yumi (~3 jam effort) 🎂💡"
          },
          {
            url: "assets/images/upperside/upperside-kado-bricks-nick.jpg",
            caption: "Bricks miniatur karakter Nick Wilde dari Zootopia 🦊🧱"
          },
          {
            url: "assets/images/upperside/upperside-kado-keychain-kucing.jpg",
            caption: "Gantungan kunci kucing kardus kembar: si putih untukku, si abu-abu untuk Yumi 🐱📦"
          },
          {
            url: "assets/images/upperside/upperside-kado-musicbox.jpg",
            caption: "Kotak musik kayu putar pengalun melodi Happy Birthday 🎶🪵"
          },
          {
            url: "assets/images/upperside/upperside-kado-boneka-gurita.jpg",
            caption: "Boneka gurita 2 ekspresi: mode abu-abu senang vs mode hitam galak 🐙🖤"
          },
          {
            url: "assets/images/upperside/upperside-kado-buku-memory.jpg",
            caption: "Buku catatan 'My own fragments of memory' penyimpan surat kenangan 📖✨"
          },
          {
            url: "assets/images/upperside/upperside-citylight-view.jpg",
            caption: "Menatap gemerlap city lights malam kota Cimahi ditemani si gurita 🌃✨"
          },
          {
            url: "assets/images/upperside/upperside-matcha-citylight.jpg",
            caption: "Menikmati segelas matcha dingin berlatar panorama malam Cimahi 🍵🌌"
          }
        ],
        story: "Pukul 19.02 meluncur menuju Cimahi Mall dan mampir ke MR.DIY pada 19.18 WIB, lalu naik ke The Upperside Rooftop. Yumi memberikan kado-kado perpisahan yang sangat manis dan penuh kenangan: bricks kue ulang tahun dengan lampu yang dirakit Yumi selama ~3 jam, bricks Nick Wilde Zootopia, gantungan kunci kucing kardus kembar (si putih untukku dan si abu-abu untuk Yumi), kotak musik putar Happy Birthday, boneka gurita 2 ekspresi, buku jurnal 'My own fragments of memory', bricks bunga ungu, box bricks toko boba, aneka camilan, serta selembar surat kenangan hangat tulisan tangan bertanda tangan Ayumi Keira. Menikmati city lights malam dari balkon rooftop dan menutup perjalanan PKL dengan sejuta kenangan abadi di pintu barat pukul 21.50 WIB.",
        quiz: {
          question: "Lagu apa yang dimainkan kotak musik kayu putar yang diberikan Yumi?",
          answer: "happy birthday",
          hint: "Lagu perayaan hari lahir yang penuh doa 🎂🎶"
        },
        secretClue: "isn't it?"
      }
    ];

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);

      const res = await fetch("data/memories.json", { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      const data = await res.json();
      this.memories = Array.isArray(data) && data.length > 0 ? data : fallbackData;
    } catch (err) {
      console.warn("Gagal memuat data/memories.json (menggunakan fallback offline):", err);
      this.memories = fallbackData;
    }

    // Apply localStorage unlocks: A memory is unlocked strictly if it is in this.unlockedIds
    this.memories = this.memories.map((m) => {
      const isUnlocked = this.unlockedIds instanceof Set ? this.unlockedIds.has(m.id) : false;
      return {
        ...m,
        isLocked: !isUnlocked,
      };
    });

    // Sort chronologically by order or date
    this.memories.sort((a, b) => {
      if (a.order !== undefined && b.order !== undefined) return a.order - b.order;
      return new Date(a.date) - new Date(b.date);
    });

    // Render to map
    this.mapInstance.renderMemories(this.memories, (memory, isDirectClick) => {
      this.handleMemorySelect(memory.id, isDirectClick);
    });
  }

  /**
   * Handles memory selection from marker click or sidebar card
   * @param {String} memoryId
   * @param {Boolean} isDirectClick
   */
  handleMemorySelect(memoryId, isDirectClick = false) {
    const memory = this.memories.find((m) => m.id === memoryId);
    if (!memory) return;

    this.currentMemory = memory;
    this.sidebar.highlightItem(memoryId);

    // Auto-close sidebar for cinematic view on mobile/small screens only
    if (window.innerWidth < 768) {
      this.sidebar.toggle(false);
    }

    const openModal = () => {
      const isItemLocked = this.unlockedIds instanceof Set ? !this.unlockedIds.has(memory.id) : Boolean(memory.isLocked);
      if (isItemLocked) {
        this.openQuizModal(memory);
      } else {
        this.polaroidModal.open(memory);
      }
    };

    if (isDirectClick) {
      this.mapInstance.focusMemory(memoryId, 16);
      openModal();
    } else {
      // Fly to pin first, then open modal upon camera arrival
      this.mapInstance.focusMemory(memoryId, 16, () => {
        openModal();
      });
    }
  }

  /* ========================================================================
   * GAMIFIED QUIZ MODAL FOR LOCKED PINS
   * ======================================================================== */

  openQuizModal(memory) {
    const modal = document.getElementById("quiz-modal");
    if (!modal) return;

    this.currentMemory = memory;
    document.getElementById("quiz-location-title").innerText = memory.location || memory.locationName || memory.title;
    document.getElementById("quiz-question").innerText =
      memory.quiz?.question || "Apa kenangan rahasia kita di tempat ini bwang?";

    const hintBox = document.getElementById("quiz-hint-box");
    const hintText = document.getElementById("quiz-hint-text");
    if (hintBox && hintText) {
      hintBox.classList.add("hidden");
      hintText.innerText = memory.quiz?.hint || "Inget-inget dulu momen seru kita di sini ya nona!";
    }

    const input = document.getElementById("quiz-answer-input");
    if (input) {
      input.value = "";
      input.classList.remove("border-rose-500", "shake-animation", "border-emerald-500", "bg-emerald-50");
    }

    const feedback = document.getElementById("quiz-feedback");
    if (feedback) {
      feedback.classList.add("hidden");
      feedback.innerText = "";
    }

    modal.classList.remove("hidden");
    modal.classList.add("flex");
    if (input) setTimeout(() => input.focus(), 150);
    if (window.lucide) lucide.createIcons();
  }

  toggleQuizHint() {
    const hintBox = document.getElementById("quiz-hint-box");
    if (hintBox) hintBox.classList.toggle("hidden");
  }

  submitQuizAnswer() {
    if (!this.currentMemory || !this.currentMemory.quiz) return;

    const input = document.getElementById("quiz-answer-input");
    const feedback = document.getElementById("quiz-feedback");
    if (!input || !feedback) return;

    const userAnswer = input.value.trim().toLowerCase();
    const cleanUser = userAnswer.replace(/[^a-z0-9]/gi, "");

    const quiz = this.currentMemory.quiz;
    const candidates = [quiz.answer];
    if (Array.isArray(quiz.acceptedAnswers)) {
      candidates.push(...quiz.acceptedAnswers);
    }

    const isMatch = candidates.some((cand) => {
      if (!cand) return false;
      const lowerCand = cand.trim().toLowerCase();
      const cleanCand = lowerCand.replace(/[^a-z0-9]/gi, "");
      return (
        cleanUser === cleanCand ||
        userAnswer === lowerCand ||
        (cleanUser.length >= 3 && cleanCand.includes(cleanUser)) ||
        (cleanCand.length >= 3 && cleanUser.includes(cleanCand))
      );
    });

    if (isMatch) {
      if (window.triggerHaptic) window.triggerHaptic([60, 50, 70, 50, 100]);
      input.classList.remove("shake-animation", "border-rose-500");
      input.classList.add("border-emerald-500", "bg-emerald-50");

      feedback.className = "text-xs font-semibold text-emerald-600 mt-2 block animate-pulse";
      feedback.innerText = `✨ Anjay bener ege! Momen ${this.currentMemory.title || "kita"} kebuka nih bwang 🚀`;
      feedback.classList.remove("hidden");

      this.unlockMemory(this.currentMemory.id);
      this.triggerConfetti();

      // Close quiz modal after short delay and animate constellation beam towards unlocked pin
      setTimeout(() => {
        this.closeQuizModal();
        if (this.mapInstance && typeof this.mapInstance.animateConstellationDraw === "function") {
          this.mapInstance.animateConstellationDraw(this.currentMemory.id, () => {
            this.polaroidModal.open(this.currentMemory);
          });
        } else {
          this.polaroidModal.open(this.currentMemory);
        }
      }, 900);
    } else {
      if (window.triggerHaptic) window.triggerHaptic([50, 60, 50]);
      input.classList.add("shake-animation", "border-rose-500");
      feedback.className = "text-xs font-semibold text-rose-500 mt-2 block";
      feedback.innerText = "💭 Salah bwang! Intip petunjuknya dulu kata guwa mah :v";
      feedback.classList.remove("hidden");

      setTimeout(() => input.classList.remove("shake-animation"), 500);
    }
  }

  closeQuizModal() {
    const modal = document.getElementById("quiz-modal");
    if (modal) {
      modal.classList.add("hidden");
      modal.classList.remove("flex");
    }
  }

  triggerConfetti() {
    const colors = ["#6366f1", "#38bdf8", "#fbbf24", "#34d399", "#f43f5e", "#a855f7"];
    for (let i = 0; i < 35; i++) {
      const el = document.createElement("div");
      el.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="${colors[Math.floor(Math.random() * colors.length)]}" stroke="none">
          <path d="M12 2l2.4 7.4L22 12l-7.6 2.6L12 22l-2.4-7.4L2 12l7.6-2.6z"/>
        </svg>
      `;
      el.style.position = "fixed";
      el.style.left = `${50 + (Math.random() * 20 - 10)}%`;
      el.style.top = `${50 + (Math.random() * 20 - 10)}%`;
      el.style.pointerEvents = "none";
      el.style.zIndex = "99999";
      el.style.transition = "all 1.6s cubic-bezier(0.25, 1, 0.5, 1)";
      el.style.transform = `translate(0, 0) scale(${0.5 + Math.random() * 0.8})`;

      document.body.appendChild(el);

      const destX = (Math.random() - 0.5) * window.innerWidth * 0.6;
      const destY = (Math.random() - 0.7) * window.innerHeight * 0.5;

      setTimeout(() => {
        el.style.transform = `translate(${destX}px, ${destY}px) rotate(${Math.random() * 720 - 360}deg) scale(0)`;
        el.style.opacity = "0";
      }, 20);

      setTimeout(() => el.remove(), 1700);
    }
  }

  /* ========================================================================
   * DELEGATION PROXIES FOR GLOBAL / INLINE ONCLICK EVENTS
   * ======================================================================== */

  toggleAudio() { this.audioPlayer.toggle(); }
  playAudio() { this.audioPlayer.play(); }
  pauseAudio() { this.audioPlayer.pause(); }
  nextTrack() { this.audioPlayer.nextTrack(); }
  prevTrack() { this.audioPlayer.prevTrack(); }
  setTrack(i) { this.audioPlayer.setTrack(i); }
  toggleShuffle() { return this.audioPlayer.toggleShuffle(); }
  toggleRainAmbience() { this.audioPlayer.toggleRain(); }
  toggleSoundscapeDrawer(force) { this.audioPlayer.toggleSoundscapeDrawer(force); }
  playSparkleChime() { this.audioPlayer.playSparkleChime(); }

  openPolaroidModal(m) { this.polaroidModal.open(m); }
  closePolaroidModal() { this.polaroidModal.close(); }
  nextGalleryPhoto() { this.polaroidModal.nextPhoto(); }
  prevGalleryPhoto() { this.polaroidModal.prevPhoto(); }

  toggleSidebar(force) { this.sidebar.toggle(force); }
  toggleSortOrder() { this.sidebar.toggleSortOrder(); }

  handleClueClick(clue, e) { this.secretPuzzle.handleClueClick(clue, e); }
  openSecretPuzzleModal() { this.secretPuzzle.openModal(); }
  closeSecretPuzzleModal() { this.secretPuzzle.closeModal(); }
  placePuzzleWord(w) { this.secretPuzzle.placeWord(w); }
  removePuzzleWord(i) { this.secretPuzzle.removeWord(i); }
  resetPuzzleSlots() { this.secretPuzzle.resetSlots(); }
  verifyPuzzle() { this.secretPuzzle.verify(); }

  /**
   * Global Dev Reset Helper
   * Resets all unlocked memories and collected clues back to initial state
   */
  resetAllProgress() {
    localStorage.removeItem(this.STORAGE_KEY);
    localStorage.removeItem("constellation_collected_clues");
    localStorage.removeItem("constellation_puzzle_solved");
    this.unlockedIds.clear();

    if (Array.isArray(this.memories)) {
      this.memories.forEach((m) => {
        m.isLocked = true;
      });
    }

    if (this.secretPuzzle) {
      this.secretPuzzle.collectedClues.clear();
      this.secretPuzzle.isPuzzleSolved = false;
      this.secretPuzzle.puzzleSlots = [null, null, null, null, null];
      this.secretPuzzle.sealClickStage = 0;
      this.secretPuzzle.updateClueIndicators();
    }

    if (this.sidebar) {
      this.sidebar.updateStats();
      if (typeof this.sidebar.renderMemoryList === "function") {
        this.sidebar.renderMemoryList();
      } else {
        this.sidebar.render();
      }
    }

    const mapCtrl = this.mapController || this.mapInstance;
    if (mapCtrl) {
      if (typeof mapCtrl.updateMarkerIcons === "function") {
        mapCtrl.updateMarkerIcons();
      } else if (mapCtrl.markers) {
        mapCtrl.markers.forEach((item) => {
          item.data.isLocked = true;
          item.marker.setIcon(mapCtrl.createCustomMarkerIcon(item.data));
        });
      }
    }

    // Reset all clue badges in DOM
    document.querySelectorAll(".hidden-word-clue").forEach((el) => {
      el.classList.remove("clue-collected");
      el.removeAttribute("title");
    });

    console.log("Semua progres (bintang memori & teka-teki kata) berhasil di-reset.");
  }

  /**
   * Starts an automated cinematic tour across all constellation memories
   */
  async startConstellationTour() {
    if (this.isTourRunning) {
      this.stopConstellationTour("Jelajah rasi cerita dihentikan.");
      return;
    }

    if (!this.memories || this.memories.length === 0) return;

    this.isTourRunning = true;
    console.log("[AutoTour] 🚀 Memulai Jelajah Rasi Cerita...");
    if (window.triggerHaptic) window.triggerHaptic([30, 40]);

    // 1. Close sidebar & existing open modals
    if (this.sidebar) this.sidebar.toggle(false);
    this.closePolaroidModal();
    this.closeQuizModal();
    this.closeSecretPuzzleModal();

    if (this.secretPuzzle?.showToast) {
      this.secretPuzzle.showToast("🚀 Memulai Jelajah Rasi Cerita...");
    }

    // 2. Play audio if not already playing
    if (this.audioPlayer && !this.audioPlayer.isPlaying) {
      this.playAudio();
    }

    // 3. User manual drag listener to cancel tour (pure drag only, avoiding false triggers from programmatic flyTo)
    const onUserDrag = () => {
      if (this.isTourRunning) {
        console.log("[AutoTour] Interaksi drag manual terdeteksi. Menghentikan tur.");
        this.stopConstellationTour("Tur dijeda karena interaksi manual.");
      }
    };
    if (this.mapInstance?.map) {
      this.mapInstance.map.once("dragstart", onUserDrag);
    }

    const wait = (ms) =>
      new Promise((resolve) => {
        this.tourTimer = setTimeout(resolve, ms);
      });

    try {
      // --- ITERASI SELURUH TITIK KENANGAN RASI BINTANG SECARA ADAPTIF ---
      for (let idx = 0; idx < this.memories.length; idx++) {
        if (!this.isTourRunning) return;

        const mem = this.memories[idx];
        if (!mem) continue;

        console.log(`[AutoTour] ✦ Menuju titik ${idx + 1}/${this.memories.length}: ${mem.title}`);
        this.mapInstance.focusMemory(mem.id, 16);
        await wait(idx === 0 ? 1800 : 2200);
        if (!this.isTourRunning) return;

        // Buka modal polaroid
        console.log(`[AutoTour] ✦ Membuka modal: ${mem.title}`);
        this.polaroidModal.open(mem);

        // Putar seluruh slide foto secara adaptif
        const totalPhotos = Array.isArray(mem.photos) && mem.photos.length > 0 
          ? mem.photos.length 
          : Array.isArray(mem.gallery) && mem.gallery.length > 0 
          ? mem.gallery.length 
          : 1;
        const slideDuration = 2600; // 2.6 detik per slide agar nyaman membaca caption

        if (totalPhotos > 1) {
          for (let p = 0; p < totalPhotos; p++) {
            if (!this.isTourRunning) return;
            if (p > 0) {
              console.log(`[AutoTour] 📸 Slide ${p + 1}/${totalPhotos} pada ${mem.title}`);
              this.polaroidModal.nextPhoto();
            }
            await wait(slideDuration);
            if (!this.isTourRunning) return;
          }
        } else {
          // Memori dengan 1 foto (e.g. 23 Paskal) ditampilkan selama 4.2 detik
          await wait(4200);
          if (!this.isTourRunning) return;
        }

        this.polaroidModal.close();
        await wait(700);
        if (!this.isTourRunning) return;
      }

      // --- STEP FINAL: Tampilan Utuh Seluruh Rasi Bintang ---
      if (this.isTourRunning) {
        console.log("[AutoTour] ✦ Tur selesai, mereset kamera ke seluruh rasi bintang.");
        const bounds = this.memories.map((m) => m.coords || m.coordinates).filter(Boolean);
        if (bounds.length > 0 && this.mapInstance?.map) {
          this.mapInstance.map.fitBounds(bounds, {
            padding: [60, 60],
            maxZoom: 14,
            duration: 1.5,
            animate: true,
          });
        }
        if (this.secretPuzzle?.showToast) {
          this.secretPuzzle.showToast("✨ Jelajah Rasi Cerita selesai!");
        }
      }
    } catch (err) {
      console.error("[AutoTour] Error during constellation tour:", err);
    } finally {
      this.isTourRunning = false;
      this.tourTimer = null;
      if (this.mapInstance?.map) {
        this.mapInstance.map.off("dragstart", onUserDrag);
      }
    }
  }

  /**
   * Stops running constellation tour
   * @param {String} reason
   */
  stopConstellationTour(reason = null) {
    if (!this.isTourRunning && !this.tourTimer) return;
    this.isTourRunning = false;
    if (this.tourTimer) {
      clearTimeout(this.tourTimer);
      this.tourTimer = null;
    }
    if (reason && this.secretPuzzle?.showToast) {
      this.secretPuzzle.showToast(reason);
    }
  }

  formatDateIndo(dateString) {
    const options = { day: "numeric", month: "short", year: "numeric" };
    const d = new Date(dateString);
    return isNaN(d.getTime()) ? dateString : d.toLocaleDateString("id-ID", options);
  }

  /**
   * Attaches Global UI Event Listeners
   */
  setupEventListeners() {
    // Welcome modal explore button
    const startBtn = document.getElementById("btn-explore-map");
    const welcomeModal = document.getElementById("welcome-modal");
    if (startBtn && welcomeModal) {
      startBtn.addEventListener("click", () => {
        welcomeModal.classList.add("hidden");
        this.playAudio();
        this.mapInstance.invalidateSize();
      });
    }

    // Mixtape Shuffle Button Listener
    const shuffleBtn = document.getElementById("btn-mixtape-shuffle");
    if (shuffleBtn) {
      shuffleBtn.addEventListener("click", () => {
        this.toggleShuffle();
      });
    }

    // Sidebar Toggle for Mobile & Desktop
    const toggleSidebarBtn = document.getElementById("btn-toggle-sidebar");
    if (toggleSidebarBtn) {
      toggleSidebarBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.toggleSidebar();
      });
    }

    // Sidebar Close Button (inside header for mobile)
    const closeSidebarBtn = document.getElementById("btn-close-sidebar");
    if (closeSidebarBtn) {
      closeSidebarBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.toggleSidebar(false);
      });
    }

    // Sort Order Toggle Button
    const sortOrderBtn = document.getElementById("btn-sort-order");
    if (sortOrderBtn) {
      sortOrderBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.toggleSortOrder();
      });
    }

    // Responsive window resize listener
    window.addEventListener("resize", () => {
      this.mapInstance.invalidateSize();
    });

    // Keyboard shortcuts: ESC to close modals/drawer, 'K' to toggle audio, ArrowLeft/ArrowRight to browse gallery
    window.addEventListener("keydown", (e) => {
      const polaroidModal = document.getElementById("polaroid-modal");
      const isPolaroidOpen = polaroidModal && !polaroidModal.classList.contains("hidden");

      if (e.key === "Escape") {
        this.closePolaroidModal();
        this.closeQuizModal();
        this.closeSecretPuzzleModal();
        if (this.audioPlayer && this.audioPlayer.isDrawerOpen) {
          this.audioPlayer.toggleSoundscapeDrawer(false);
        }
      } else if (e.key.toLowerCase() === "k") {
        const activeEl = document.activeElement;
        const activeTag = activeEl ? activeEl.tagName.toLowerCase() : "";
        const isInput = activeTag === "input" || activeTag === "textarea" || (activeEl && activeEl.isContentEditable);
        if (!isInput) {
          e.preventDefault();
          this.toggleAudio();
        }
      } else if (isPolaroidOpen) {
        if (e.key === "ArrowRight") {
          this.nextGalleryPhoto();
        } else if (e.key === "ArrowLeft") {
          this.prevGalleryPhoto();
        }
      }
    });

    // Filter Chips
    document.querySelectorAll(".filter-chip").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        document.querySelectorAll(".filter-chip").forEach((b) => {
          b.classList.remove("bg-rose-500", "text-white", "shadow-sm");
          b.classList.add("bg-slate-100", "text-slate-600", "hover:bg-slate-200");
        });

        const target = e.currentTarget;
        target.classList.add("bg-rose-500", "text-white", "shadow-sm");
        target.classList.remove("bg-slate-100", "text-slate-600", "hover:bg-slate-200");

        this.sidebar.setFilter(target.dataset.category || "all");
      });
    });

    // Enter key submission on Quiz input
    const quizInput = document.getElementById("quiz-answer-input");
    if (quizInput) {
      quizInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          this.submitQuizAnswer();
        }
      });
    }
  }
}

// Instantiate on DOM Load
document.addEventListener("DOMContentLoaded", () => {
  window.app = new ConstellationApp();
});
