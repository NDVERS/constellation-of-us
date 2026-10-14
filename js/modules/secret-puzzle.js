/**
 * Constellation of Us - Secret Word Puzzle & Clues System
 * Handles Hidden Word Clues collection, floating sparkles, toast notifications,
 * interactive 5-word slot puzzle assembly, and the Golden Hour Sunset Reveal.
 */

class SecretPuzzleController {
  constructor(app) {
    this.app = app;
    this.CLUES_STORAGE_KEY = "constellation_collected_clues";
    this.PUZZLE_SOLVED_KEY = "constellation_secret_puzzle_solved";

    this.collectedClues = new Set();
    this.isPuzzleSolved = false;
    this.puzzleSlots = [null, null, null, null, null];
    this.SECRET_SOLUTION = ["The", "moon", "is", "beautiful,", "isn't it?"];
    this.typewriterTimers = [];
    this.sealClickStage = 0; // 0 = intact, 1 = cracked, 2 = shattered
    this.isLetterRevealed = false;

    this.loadState();
    this.setupSwipeToDismiss();
  }

  /**
   * Loads collected clues & solved status from localStorage
   */
  loadState() {
    try {
      const stored = localStorage.getItem(this.CLUES_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          this.collectedClues = new Set(parsed);
        }
      }
      this.isPuzzleSolved = localStorage.getItem(this.PUZZLE_SOLVED_KEY) === "true";
    } catch (e) {
      console.warn("Error loading clue state from localStorage:", e);
      this.collectedClues = new Set();
      this.isPuzzleSolved = false;
    }
    this.updateClueIndicators();
  }

  /**
   * Syncs DOM clue indicators in modal and floating pill
   */
  updateClueIndicators() {
    const count = this.collectedClues.size;
    const indicator = document.getElementById("puzzle-clue-indicator");
    if (indicator) {
      indicator.innerText = `Kata Tersembunyi: ${count}/5 Ditemukan`;
    }
    const floatingCount = document.getElementById("floating-clue-count");
    if (floatingCount) {
      floatingCount.innerText = `${count}/5 Kata`;
    }
  }

  /**
   * Helper to check if a specific clue is collected
   * @param {String} clue
   */
  hasClue(clue) {
    return this.collectedClues.has(clue);
  }

  /**
   * Handles click on any hidden word clue
   * @param {String} clue
   * @param {Event} event
   */
  handleClueClick(clue, event) {
    if (event) {
      event.stopPropagation();
      event.preventDefault();
    }
    if (!clue) return;

    if (this.collectedClues.has(clue)) {
      if (window.triggerHaptic) window.triggerHaptic(30);
      this.showToast(`Kepingan kata "${clue}" udah luwh ambil ege bwang! ✦`);
      return;
    }

    // Save clue
    this.collectedClues.add(clue);
    try {
      localStorage.setItem(this.CLUES_STORAGE_KEY, JSON.stringify(Array.from(this.collectedClues)));
    } catch (e) {
      console.warn("Error saving clues to localStorage:", e);
    }

    // Tactile & Audio cue
    if (window.triggerHaptic) window.triggerHaptic([40, 30, 40]);
    if (this.app?.audioPlayer?.playSparkleChime) {
      this.app.audioPlayer.playSparkleChime();
    }

    // Visual feedback
    const x = event && event.clientX ? event.clientX : window.innerWidth / 2;
    const y = event && event.clientY ? event.clientY : window.innerHeight / 2;
    this.spawnSparkles(x, y);
    this.showToast(`Eits dapet kepingan kata: "${clue}" nih bwang! ✦`);

    // Mark current clue element as collected in DOM
    document.querySelectorAll(`.hidden-word-clue[data-clue="${clue}"]`).forEach((el) => {
      el.classList.add("clue-collected");
      el.title = "Udah dapet ✦";
    });

    // Update sidebar & secret puzzle modal if active
    this.updateClueIndicators();
    if (this.app.sidebar) this.app.sidebar.render();
    const puzzleModal = document.getElementById("secret-puzzle-modal");
    if (puzzleModal && !puzzleModal.classList.contains("hidden")) {
      this.renderModal();
    }
  }

  /**
   * Spawns floating golden star particles
   * @param {Number} x
   * @param {Number} y
   */
  spawnSparkles(x, y) {
    const colors = ["#fbbf24", "#f59e0b", "#f43f5e", "#6366f1", "#38bdf8"];
    const symbols = ["✦", "★", "✨", "💫", "✦"];

    for (let i = 0; i < 8; i++) {
      const p = document.createElement("div");
      p.className = "clue-sparkle-particle";
      p.innerText = symbols[Math.floor(Math.random() * symbols.length)];
      p.style.left = `${x}px`;
      p.style.top = `${y}px`;
      p.style.color = colors[Math.floor(Math.random() * colors.length)];

      const angle = (Math.PI * 2 * i) / 8 + (Math.random() * 0.4 - 0.2);
      const dist = 35 + Math.random() * 45;
      const tx = Math.cos(angle) * dist;
      const ty = Math.sin(angle) * dist - 25;

      p.style.setProperty("--tx", `${tx}px`);
      p.style.setProperty("--ty", `${ty}px`);

      document.body.appendChild(p);
      setTimeout(() => p.remove(), 1200);
    }
  }

  /**
   * Displays brief floating toast notification
   * @param {String} message
   */
  showToast(message) {
    const container = document.getElementById("toast-container");
    if (!container) return;

    const toast = document.createElement("div");
    toast.className = "toast-item";
    toast.innerHTML = `
      <i data-lucide="sparkles" class="w-4 h-4 text-amber-400 flex-shrink-0"></i>
      <span>${message}</span>
    `;
    container.appendChild(toast);
    if (window.lucide) lucide.createIcons();

    setTimeout(() => {
      toast.classList.add("toast-out");
      setTimeout(() => toast.remove(), 350);
    }, 3000);
  }

  /**
   * Opens Secret Word Puzzle Modal
   */
  openModal() {
    const modal = document.getElementById("secret-puzzle-modal");
    if (!modal) return;

    if (this.app?.audioPlayer?.duckVolume) {
      this.app.audioPlayer.duckVolume(0.18, 1000);
    }

    this.renderModal();
    modal.classList.remove("hidden");
    modal.classList.add("flex");
    if (window.lucide) lucide.createIcons();
  }

  /**
   * Sets up swipe-to-dismiss gesture on modal card (Mobile QoL)
   */
  setupSwipeToDismiss() {
    let startX = 0;
    let startY = 0;

    const handleTouchStart = (e) => {
      if (e.target.closest("button") || e.target.closest("input") || e.target.closest(".hidden-word-clue")) return;
      if (e.touches && e.touches.length > 0) {
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
      }
    };

    const handleTouchEnd = (e) => {
      if (e.target.closest("button") || e.target.closest("input") || e.target.closest(".hidden-word-clue")) return;
      const endX = e.changedTouches && e.changedTouches.length > 0 ? e.changedTouches[0].clientX : startX;
      const endY = e.changedTouches && e.changedTouches.length > 0 ? e.changedTouches[0].clientY : startY;
      const deltaX = endX - startX;
      const deltaY = endY - startY;

      const modal = document.getElementById("secret-puzzle-modal");
      const card = document.getElementById("puzzle-modal-card");
      if (!modal || modal.classList.contains("hidden")) return;

      // Ignore gesture if user is actively scrolling through overflowing content
      const isScrolled = modal.scrollTop > 5 || (card && card.scrollTop > 5);

      if (!isScrolled && deltaY > 75 && Math.abs(deltaY) > Math.abs(deltaX) * 1.5) {
        if (window.triggerHaptic) window.triggerHaptic(25);
        this.closeModal();
      }
    };

    // Attach listeners on DOMContentLoaded / immediately
    const bindCard = () => {
      const card = document.getElementById("puzzle-modal-card");
      if (card) {
        card.addEventListener("touchstart", handleTouchStart, { passive: true });
        card.addEventListener("touchend", handleTouchEnd, { passive: true });
      }
    };

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", bindCard);
    } else {
      bindCard();
    }
  }

  /**
   * Closes Secret Word Puzzle Modal
   */
  closeModal() {
    this.clearTypewriter();
    const modal = document.getElementById("secret-puzzle-modal");
    if (modal) {
      modal.classList.add("hidden");
      modal.classList.remove("flex");
    }

    if (this.app?.audioPlayer?.restoreVolume) {
      this.app.audioPlayer.restoreVolume(1200);
    }

    // Release wake lock if audio is not currently playing
    const isAudioActive = this.app?.audioPlayer?.isPlaying || this.app?.audioPlayer?.isRainActive;
    if (!isAudioActive && window.releaseScreenWakeLock) {
      window.releaseScreenWakeLock();
    }
  }

  /**
   * Renders Secret Word Puzzle Modal content & slots
   */
  renderModal() {
    const indicator = document.getElementById("puzzle-clue-indicator");
    const slotsContainer = document.getElementById("puzzle-slots-container");
    const availableChipsContainer = document.getElementById("puzzle-available-chips");
    const hintBox = document.getElementById("puzzle-hint-box");
    const hintText = document.getElementById("puzzle-hint-text");
    const assemblyContent = document.getElementById("puzzle-assembly-content");
    const envelopeStage = document.getElementById("puzzle-envelope-stage");
    const revealContent = document.getElementById("puzzle-reveal-content");
    const card = document.getElementById("puzzle-modal-card");

    if (!slotsContainer || !availableChipsContainer) return;

    if (this.isPuzzleSolved) {
      // If already solved previously, show the beautiful sunset reveal directly
      if (assemblyContent) assemblyContent.classList.add("hidden");
      if (envelopeStage) envelopeStage.classList.add("hidden");
      if (revealContent) {
        revealContent.classList.remove("hidden");
        revealContent.style.opacity = "1";
        revealContent.style.transform = "none";
      }
      if (card) card.classList.add("sunset-glow-card");
      if (window.lucide) lucide.createIcons();
      return;
    }

    if (assemblyContent) {
      assemblyContent.classList.remove("hidden");
      assemblyContent.style.opacity = "1";
      assemblyContent.style.transform = "scale(1)";
    }
    if (envelopeStage) envelopeStage.classList.add("hidden");
    if (revealContent) revealContent.classList.add("hidden");
    if (card) card.classList.remove("sunset-glow-card");

    // Clues indicator
    const collectedCount = this.collectedClues.size;
    if (indicator) {
      indicator.innerText = `Kata Tersembunyi: ${collectedCount}/5 Ditemukan`;
    }

    // 5 Word Slots
    slotsContainer.innerHTML = this.puzzleSlots
      .map((word, idx) => {
        if (word) {
          return `
            <div 
              class="puzzle-slot slot-filled" 
              onclick="window.app.removePuzzleWord(${idx})" 
              title="Klik untuk kembalikan kata"
            >
              ${word}
            </div>
          `;
        }
        return `
          <div class="puzzle-slot" title="Slot kosong (${idx + 1})">
            <span class="text-xs font-sans text-slate-300 font-bold">${idx + 1}</span>
          </div>
        `;
      })
      .join("");

    // Placed words count in slots
    const placedWords = this.puzzleSlots.filter((w) => w !== null);

    // Available chips: collected words that are NOT yet placed
    const availableWords = Array.from(this.collectedClues).filter((w) => !placedWords.includes(w));

    if (availableWords.length > 0) {
      availableChipsContainer.innerHTML = availableWords
        .map(
          (word) => `
        <button 
          type="button" 
          class="puzzle-word-chip" 
          onclick="window.app.placePuzzleWord('${word.replace(/'/g, "\\'")}')" 
          title="Klik untuk tempatkan ke slot susunan"
        >
          ✦ ${word}
        </button>
      `
        )
        .join("");
    } else if (placedWords.length === 5) {
      availableChipsContainer.innerHTML = `
        <span class="text-xs font-semibold text-emerald-600 flex items-center gap-1">
          <i data-lucide="check-circle" class="w-3.5 h-3.5"></i> Semua kata udah kepasang bwang! Tekan Verifikasi :v
        </span>
      `;
    } else if (collectedCount === 0) {
      availableChipsContainer.innerHTML = `
        <span class="text-xs text-slate-400 italic">
          Belum ada kepingan kata yang kamu temukan. Jelajahi peta & foto kenangan bwang!
        </span>
      `;
    } else {
      availableChipsContainer.innerHTML = `
        <span class="text-xs text-slate-400 italic">
          Semua kepingan yang kamu miliki saat ini sudah terpasang di slot.
        </span>
      `;
    }

    // Clues Missing Hint
    if (hintBox && hintText) {
      if (collectedCount < 5) {
        hintBox.classList.remove("hidden");
        const remaining = 5 - collectedCount;
        hintText.innerText = `Masih ada ${remaining} kata yang terselip di foto atau catatan perjalanan bwang :v`;
      } else {
        hintBox.classList.add("hidden");
      }
    }

    if (window.lucide) lucide.createIcons();
  }

  /**
   * Places an available word into the first empty slot
   * @param {String} word
   */
  placeWord(word) {
    const firstEmptyIndex = this.puzzleSlots.indexOf(null);
    if (firstEmptyIndex !== -1) {
      this.puzzleSlots[firstEmptyIndex] = word;
      if (window.triggerHaptic) window.triggerHaptic(40);
      this.renderModal();
    } else {
      if (window.triggerHaptic) window.triggerHaptic(40);
      this.showToast("Slot sudah penuh ege! Hapus salah satu kata dulu kalau mau ganti :v");
    }
  }

  /**
   * Removes placed word from slot
   * @param {Number} slotIndex
   */
  removeWord(slotIndex) {
    if (slotIndex >= 0 && slotIndex < this.puzzleSlots.length) {
      this.puzzleSlots[slotIndex] = null;
      if (window.triggerHaptic) window.triggerHaptic(40);
      this.renderModal();
    }
  }

  /**
   * Resets all puzzle slots
   */
  resetSlots() {
    this.puzzleSlots = [null, null, null, null, null];
    if (window.triggerHaptic) window.triggerHaptic(35);
    this.renderModal();
    this.showToast("Slot kata udah dibersihin bwang ✦");
  }

  /**
   * Verifies the ordered puzzle sequence
   */
  verify() {
    if (this.puzzleSlots.includes(null)) {
      if (window.triggerHaptic) window.triggerHaptic([40, 50, 40]);
      this.showToast("Slotnya masih kosong tuh, cari dulu kepingannya bwang jangan males ah :v");
      return;
    }

    // Check against target sequence
    const isCorrect = this.puzzleSlots.every((word, idx) => word === this.SECRET_SOLUTION[idx]);

    if (isCorrect) {
      // SOLVED! Transition to Vintage Envelope Stage
      this.isPuzzleSolved = true;
      try {
        localStorage.setItem(this.PUZZLE_SOLVED_KEY, "true");
      } catch (e) {
        console.warn("Puzzle save error:", e);
      }
      this.triggerEnvelopeStage();
    } else {
      // WRONG SEQUENCE
      if (window.triggerHaptic) window.triggerHaptic([50, 60, 50]);
      const slotsContainer = document.getElementById("puzzle-slots-container");
      if (slotsContainer) {
        slotsContainer.classList.add("shake-animation");
        setTimeout(() => slotsContainer.classList.remove("shake-animation"), 600);
      }
      this.showToast("Salah ege! Rangkai yang bener dulu kata guwa mah, jangan ngasal bwang 🗿");
    }
  }

  /**
   * Stage 2: Transitions smoothly from Assembly slots to Vintage Envelope & Wax Seal
   */
  triggerEnvelopeStage() {
    if (window.triggerHaptic) window.triggerHaptic([50, 40, 60]);
    if (this.app?.audioPlayer?.playSparkleChime) {
      this.app.audioPlayer.playSparkleChime();
    }

    this.sealClickStage = 0; // Reset to intact state

    const assemblyContent = document.getElementById("puzzle-assembly-content");
    const envelopeStage = document.getElementById("puzzle-envelope-stage");
    const waxSeal = document.getElementById("wax-seal-btn");
    const waxSealText = document.getElementById("wax-seal-text");
    const hintText = document.getElementById("wax-seal-hint-text");
    const envelope = document.querySelector(".vintage-envelope-container");

    if (waxSeal) {
      waxSeal.classList.remove("seal-broken", "seal-cracking", "seal-shatter");
    }
    if (waxSealText) {
      waxSealText.innerText = "OPEN";
    }
    const hintContainer = document.getElementById("wax-seal-hint-container");
    if (hintContainer) {
      hintContainer.classList.remove("border-amber-400/50", "bg-black/70", "ring-2", "ring-amber-400/30");
    }
    if (hintText) {
      hintText.innerText = "Pencet segelnya bwang, ada samting buat last meet nih 😏";
    }
    if (envelope) envelope.classList.remove("envelope-open");

    if (assemblyContent) {
      assemblyContent.style.transition = "all 0.4s ease-out";
      assemblyContent.style.opacity = "0";
      assemblyContent.style.transform = "scale(0.95)";
      setTimeout(() => {
        assemblyContent.classList.add("hidden");
        if (envelopeStage) {
          envelopeStage.classList.remove("hidden");
          envelopeStage.style.opacity = "0";
          envelopeStage.style.transform = "scale(0.92)";
          setTimeout(() => {
            envelopeStage.style.transition = "all 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)";
            envelopeStage.style.opacity = "1";
            envelopeStage.style.transform = "scale(1)";
          }, 30);
        }
        if (window.lucide) lucide.createIcons();
      }, 350);
    }
  }

  /**
   * Stage 3: Interactive 2-Stage Wax Seal Physics
   * Click 1: Fracture lines appear (.seal-cracking) + double micro haptic + CRACK text
   * Click 2: Full shatter with wax splinter shards + celestial swell + sunset letter reveal
   * @param {Event} event
   */
  unsealLetter(event) {
    const sealBtn = document.getElementById("wax-seal-btn");
    const sealText = document.getElementById("wax-seal-text");
    const hintText = document.getElementById("wax-seal-hint-text");
    const envelope = document.querySelector(".vintage-envelope-container");
    const envelopeStage = document.getElementById("puzzle-envelope-stage");
    const revealContent = document.getElementById("puzzle-reveal-content");
    const card = document.getElementById("puzzle-modal-card");

    const rect = sealBtn ? sealBtn.getBoundingClientRect() : null;
    const x = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
    const y = rect ? rect.top + rect.height / 2 : window.innerHeight / 2;

    // STAGE 1: FIRST CLICK -> CRACK / RETAK
    if (this.sealClickStage === 0) {
      this.sealClickStage = 1;

      if (sealBtn) {
        sealBtn.classList.add("seal-cracking");
      }
      if (sealText) {
        sealText.innerText = "CRACK!";
      }
      if (hintText) {
        hintText.innerText = "⚡ Segelnya mulai retak bwang! Ketuk sekali lagi buat pecahin total! 🔥";
      }
      const hintContainer = document.getElementById("wax-seal-hint-container");
      if (hintContainer) {
        hintContainer.classList.add("border-amber-400/50", "bg-black/70", "ring-2", "ring-amber-400/30");
      }

      // Micro double haptic + tactile sound
      if (window.triggerHaptic) window.triggerHaptic([30, 40]);
      if (this.app?.audioPlayer?.playSparkleChime) {
        this.app.audioPlayer.playSparkleChime();
      }

      // Spawn minor fracture sparkles
      this.spawnSparkles(x, y);
      return;
    }

    // STAGE 2: SECOND CLICK -> SHATTER / PECAH BERHAMBURAN
    this.sealClickStage = 2;
    this.isLetterRevealed = true;

    if (window.requestScreenWakeLock) {
      window.requestScreenWakeLock();
    }

    // Micro tactile & splinter burst
    if (window.triggerHaptic) window.triggerHaptic([60, 50, 80, 50, 100]);
    this.spawnWaxSplinters(x, y);

    // Cosmic stardust confetti celebration across screen
    if (this.app?.triggerConfetti) {
      this.app.triggerConfetti();
    }

    // Break seal visual state
    if (sealBtn) {
      sealBtn.classList.remove("seal-cracking");
      sealBtn.classList.add("seal-broken", "seal-shatter");
    }
    if (envelope) envelope.classList.add("envelope-open");

    // Audio cue: Celestial chime + BGM Volume Swell
    if (this.app?.audioPlayer?.playSecretRevealChime) {
      this.app.audioPlayer.playSecretRevealChime();
    }
    if (this.app?.audioPlayer?.swellVolume) {
      this.app.audioPlayer.swellVolume(0.65, 3500);
    }

    // Transition envelope to poetic sunset letter
    setTimeout(() => {
      if (envelopeStage) {
        envelopeStage.style.transition = "all 0.5s ease-in";
        envelopeStage.style.opacity = "0";
        envelopeStage.style.transform = "scale(0.95)";
      }

      setTimeout(() => {
        if (envelopeStage) envelopeStage.classList.add("hidden");
        if (card) card.classList.add("sunset-glow-card");
        if (revealContent) {
          revealContent.classList.remove("hidden");
          revealContent.style.opacity = "0";
          revealContent.style.transform = "scale(0.88) translateY(20px)";
          setTimeout(() => {
            revealContent.style.transition = "all 0.9s cubic-bezier(0.34, 1.4, 0.64, 1)";
            revealContent.style.opacity = "1";
            revealContent.style.transform = "scale(1) translateY(0)";
            this.startTypewriterSequence();
          }, 40);
        }
        if (window.lucide) lucide.createIcons();
        if (this.app.triggerConfetti) {
          this.app.triggerConfetti();
        }
      }, 450);
    }, 450);
  }

  /**
   * Spawns physical wax splinter shards bursting outwards
   * @param {Number} x
   * @param {Number} y
   */
  spawnWaxSplinters(x, y) {
    const shardCount = 16;
    for (let i = 0; i < shardCount; i++) {
      const shard = document.createElement("div");
      shard.className = "wax-splinter-shard";
      shard.style.left = `${x}px`;
      shard.style.top = `${y}px`;

      const angle = (Math.PI * 2 * i) / shardCount + (Math.random() * 0.4 - 0.2);
      const dist = 35 + Math.random() * 70;
      const tx = Math.cos(angle) * dist;
      const ty = Math.sin(angle) * dist - 15;
      const rot = Math.random() * 720 - 360;

      shard.style.setProperty("--tx", `${tx}px`);
      shard.style.setProperty("--ty", `${ty}px`);
      shard.style.setProperty("--rot", `${rot}deg`);

      document.body.appendChild(shard);
      setTimeout(() => shard.remove(), 800);
    }
  }

  /**
   * Clears any active typewriter timers
   */
  clearTypewriter() {
    if (this.typewriterTimers && this.typewriterTimers.length > 0) {
      this.typewriterTimers.forEach((timer) => clearTimeout(timer));
      this.typewriterTimers = [];
    }
  }

  /**
   * Starts emotional typewriter animation for Sunset Letter
   */
  startTypewriterSequence() {
    this.clearTypewriter();

    const titleEl = document.getElementById("sunset-quote-title");
    const p1El = document.getElementById("sunset-message-p1");
    const p2El = document.getElementById("sunset-message-p2");
    const sigEl = document.getElementById("sunset-signature");

    const fullTitle = '"The moon is beautiful, isn\'t it?"';
    const fullP1 = '“…makasih banyaaa udah nemenin hamba selama masa PKL di Bandung & Cimahi ya nona Ayumi Keira.”';
    const fullP2 = '"Siapin mental yakkkk abis ini kita sambung petualangan menkrep & roblok dari Samarinda wkwk :v"';
    const fullSignature = '— Salam dari exfora / hamba buat nona cinta unguu 💜';

    if (titleEl) titleEl.innerText = "";
    if (p1El) p1El.innerText = "";
    if (p2El) p2El.innerText = "";
    if (sigEl) {
      sigEl.style.opacity = "0";
      sigEl.style.transform = "translateY(6px)";
      sigEl.innerText = fullSignature;
    }

    let delay = 300;

    // 1. Type Quote Title
    if (titleEl) {
      for (let i = 0; i <= fullTitle.length; i++) {
        const t = setTimeout(() => {
          titleEl.innerText = fullTitle.slice(0, i);
        }, delay);
        this.typewriterTimers.push(t);
        delay += 35;
      }
    }

    delay += 250;

    // 2. Type Paragraph 1 (Teks Utama Surat)
    if (p1El) {
      for (let i = 0; i <= fullP1.length; i++) {
        const t = setTimeout(() => {
          p1El.innerText = fullP1.slice(0, i);
        }, delay);
        this.typewriterTimers.push(t);
        delay += 24;
      }
    }

    delay += 200;

    // 3. Type Paragraph 2 (Teks Candaan Menkrep & Roblok)
    if (p2El) {
      for (let i = 0; i <= fullP2.length; i++) {
        const t = setTimeout(() => {
          p2El.innerText = fullP2.slice(0, i);
        }, delay);
        this.typewriterTimers.push(t);
        delay += 20;
      }
    }

    delay += 250;

    // 4. Reveal Signature (Salam Exfora)
    if (sigEl) {
      const t = setTimeout(() => {
        sigEl.style.transition = "all 0.8s cubic-bezier(0.34, 1.56, 0.64, 1)";
        sigEl.style.opacity = "1";
        sigEl.style.transform = "translateY(0)";
      }, delay);
      this.typewriterTimers.push(t);
    }
  }

  /**
   * Opens original handwritten letter full resolution modal
   */
  openOriginalLetterModal() {
    const modal = document.getElementById("original-letter-modal");
    if (modal) {
      const img = document.getElementById("original-letter-img");
      if (img) {
        img.src = "assets/images/surat-asli-ayumi-keira.webp?v=2";
      }
      modal.classList.remove("hidden");
      modal.classList.add("flex");
      if (window.triggerHaptic) window.triggerHaptic(20);
      if (window.lucide) lucide.createIcons();
    }
  }

  /**
   * Closes original handwritten letter modal
   */
  closeOriginalLetterModal() {
    const modal = document.getElementById("original-letter-modal");
    if (modal) {
      modal.classList.add("hidden");
      modal.classList.remove("flex");
    }
  }

  /**
   * Performs full reset on clues, puzzle slots, solved state, and memory unlocks
   */
  resetPuzzleState() {
    const confirmReset = window.confirm(
      "Mau ngunci balik surat rahasia ini dan ngulang nyari kepingan kata dari awal bwang? 🤔"
    );
    if (!confirmReset) return;

    this.clearTypewriter();

    // 1. Reset in-memory secret puzzle state
    this.collectedClues.clear();
    this.isPuzzleSolved = false;
    this.puzzleSlots = [null, null, null, null, null];
    this.sealClickStage = 0;

    // 2. Clear secret puzzle localStorage entries & memory unlocks
    try {
      localStorage.removeItem(this.PUZZLE_SOLVED_KEY);
      localStorage.removeItem(this.CLUES_STORAGE_KEY);
      if (this.app?.STORAGE_KEY) {
        localStorage.removeItem(this.app.STORAGE_KEY);
      }
    } catch (e) {
      console.warn("Error resetting secret puzzle localStorage:", e);
    }

    // 3. Reset app memory unlocked state to fully locked
    if (this.app) {
      if (this.app.unlockedIds) {
        this.app.unlockedIds.clear();
      }
      if (Array.isArray(this.app.memories)) {
        this.app.memories.forEach((m) => {
          m.isLocked = true;
        });
      }
    }

    // 4. Reset all clue badges in DOM (remove collected state)
    document.querySelectorAll(".hidden-word-clue").forEach((el) => {
      el.classList.remove("clue-collected");
      el.removeAttribute("title");
    });

    // 5. Update clue indicators (kiri bawah -> 0/5 Kata)
    this.updateClueIndicators();

    // 6. Update sidebar memory list and header stats badge (kanan atas -> 0/5 Bintang)
    if (this.app?.sidebar) {
      this.app.sidebar.updateStats();
      if (typeof this.app.sidebar.renderMemoryList === "function") {
        this.app.sidebar.renderMemoryList();
      } else {
        this.app.sidebar.render();
      }
    }

    // 7. Update Leaflet map marker icons back to locked stars
    const mapCtrl = this.app?.mapController || this.app?.mapInstance;
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

    // 8. Tactile feedback & toast notification
    if (window.triggerHaptic) window.triggerHaptic([40, 50, 40]);
    this.showToast("Teka-teki direset total! Silakan berburu kepingan lagi bwang :v");

    // 9. Re-render modal interface back to Stage 1 (0/5 clues)
    this.renderModal();
  }
}

window.SecretPuzzleController = SecretPuzzleController;
