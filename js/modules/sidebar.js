/**
 * Constellation of Us - Sidebar & Header Controller Module
 * Follows Front-End Anti-Slop Guidelines:
 * - Decoupled pure template builder (SidebarTemplate) from state/controller logic
 * - Tailwind hierarchy: layout -> spacing -> typography -> visual/colors
 * - Standard Tailwind design system scales (no arbitrary micro-classes)
 */

const SidebarTemplate = {
  /**
   * Builds empty state UI
   * @returns {string}
   */
  buildEmptyState() {
    return `
      <div class="p-8 text-center text-slate-400">
        <i data-lucide="compass" class="w-8 h-8 mx-auto mb-2 opacity-50"></i>
        <p class="text-xs">Kosong ege! Ga ada memori di kategori ini bwang :v</p>
      </div>
    `;
  },

  /**
   * Builds individual memory card UI
   * @param {Object} memory
   * @param {number} index
   * @param {boolean} isClueCollected
   * @param {string} formattedDate
   * @param {boolean} [isUnlocked]
   * @returns {string}
   */
  buildMemoryCard(memory, index, isClueCollected, formattedDate, isUnlocked) {
    const isLocked = isUnlocked !== undefined ? !isUnlocked : (memory.isLocked !== false);
    const thumbUrl = (Array.isArray(memory.photos) && memory.photos[0]?.url) || memory.image || "assets/images/og-preview.jpg";
    const locationStr = memory.location || memory.locationName || "";

    return `
      <div 
        class="memory-card group relative mb-3 p-3.5 cursor-pointer rounded-2xl border border-pink-100/60 bg-white/70 shadow-sm transition-all hover:bg-white hover:border-rose-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-rose-400"
        data-id="${memory.id}"
        tabindex="0"
        role="button"
        onclick="window.app.handleMemorySelect('${memory.id}')"
        onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();window.app.handleMemorySelect('${memory.id}');}"
      >
        <div class="flex items-center gap-3">
          <div class="relative flex-shrink-0 w-14 h-14 overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
            <img 
              src="${thumbUrl}" 
              alt="${memory.title}" 
              class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110 ${isLocked ? "blur-xs brightness-75" : ""}"
              loading="lazy"
              decoding="async"
              onerror="this.src='assets/images/og-preview.jpg'"
            />
            ${
              isLocked
                ? `
              <div class="absolute inset-0 flex items-center justify-center bg-amber-950/40">
                <i data-lucide="lock" class="w-5 h-5 text-amber-300"></i>
              </div>
            `
                : `
              <div class="absolute top-1 left-1 flex items-center justify-center w-5 h-5 text-xs font-bold text-white bg-rose-500 rounded-full shadow">
                ${memory.order || index + 1}
              </div>
            `
            }
          </div>

          <div class="flex-1 min-w-0">
            <div class="flex items-center justify-between gap-1 mb-0.5">
              <span class="px-2 py-0.5 text-xs font-semibold tracking-wide rounded-full ${isLocked ? "bg-amber-100 text-amber-700" : "bg-rose-100 text-rose-600"}">
                ${memory.category}
              </span>
              <span class="flex-shrink-0 text-xs font-medium text-slate-500">${formattedDate}</span>
            </div>
            <h4 class="mt-0.5 text-xs sm:text-sm font-bold leading-snug break-words text-slate-800 transition-colors group-hover:text-rose-600">
              ${memory.title}
            </h4>
            <p class="flex items-start gap-1 mt-1 text-xs leading-snug break-words text-slate-500">
              <i data-lucide="map-pin" class="flex-shrink-0 w-3 h-3 mt-0.5 text-rose-400"></i>
              <span class="leading-tight">${locationStr}</span>
            </p>
            ${
              memory.secretClue === "is"
                ? `
              <div class="mt-2 text-right">
                <span 
                  class="hidden-word-clue ${isClueCollected ? "clue-collected" : ""} text-xs py-0.5 px-2.5" 
                  data-clue="is" 
                  onclick="window.app.handleClueClick('is', event)" 
                  title="${isClueCollected ? "Udah dapet ✦" : "Kepingan kata rahasia bwang"}"
                >
                  ✦ is
                </span>
              </div>
            `
                : ""
            }
          </div>
        </div>
      </div>
    `;
  },

  /**
   * Builds teaser / Samarinda future adventures card
   * @param {boolean} isClueCollected
   * @returns {string}
   */
  buildFutureAdventuresCard(isClueCollected) {
    return `
      <div class="future-adventures-card relative mt-4 p-4 text-center rounded-2xl border border-dashed border-indigo-200/90 bg-gradient-to-br from-indigo-50/90 via-sky-50/70 to-amber-50/60 shadow-sm">
        <div class="flex items-center justify-center w-8 h-8 mx-auto mb-2 text-indigo-600 bg-indigo-100 rounded-full shadow-inner">
          <i data-lucide="compass" class="w-4 h-4"></i>
        </div>
        <h5 class="flex items-center justify-center gap-1 mb-1 text-xs font-bold tracking-wide text-indigo-800">
          ✦ Next Episode: Samarinda Connection! ✦
        </h5>
        <p class="font-handwriting text-base leading-snug text-slate-600">
          "Makasih banyaaa udah jadi partner hangout & jalan-jalan paling unik selama masa PKL di Bandung nona! Abis ini giliran rasi bintangnya kita sambung dari Samarinda yakkkk 💜 :v"
        </p>

        <div class="flex flex-wrap items-center justify-center gap-2 mt-3 pt-2.5 border-t border-indigo-100/80">
          <button 
            id="btn-open-secret-puzzle" 
            type="button" 
            onclick="window.app.openSecretPuzzleModal()" 
            class="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-white bg-gradient-to-r from-amber-500 to-rose-500 rounded-full shadow-sm transition-all hover:from-amber-600 hover:to-rose-600 hover:shadow active:scale-95"
          >
            <i data-lucide="sparkles" class="w-3.5 h-3.5"></i> ✦ Rangkai Kata Rahasia
          </button>
          
          <span 
            class="hidden-word-clue ${isClueCollected ? "clue-collected" : ""} text-xs py-0.5 px-2.5" 
            data-clue="isn't it?" 
            onclick="window.app.handleClueClick('isn\\'t it?', event)" 
            title="${isClueCollected ? "Udah dapet ✦" : "Kepingan kata rahasia bwang"}"
          >
            ✦ isn't it?
          </span>
        </div>
      </div>
    `;
  },

  /**
   * Builds header stats badges UI
   * @param {number} unlocked
   * @param {number} total
   * @param {number} locked
   * @returns {string}
   */
  buildStatsBadges(unlocked, total, locked) {
    return `
      <span class="inline-flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-0.5 sm:py-1 text-xs font-bold text-rose-700 bg-rose-100 rounded-full shadow-xs">
        <i data-lucide="sparkles" class="header-star-sparkle w-3 h-3 sm:w-3.5 sm:h-3.5 text-rose-500"></i>
        <span>${unlocked}/${total}</span>
        <span class="hidden sm:inline">Bintang Terbuka</span>
        <span class="header-star-sparkle sm:hidden">✦</span>
      </span>
      ${
        locked > 0
          ? `
        <span class="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-amber-800 bg-amber-100 rounded-full">
          <i data-lucide="lock" class="w-3 h-3"></i> ${locked} Rahasia 🔒
        </span>
      `
          : `
        <span class="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-emerald-800 bg-emerald-100 rounded-full">
          <i data-lucide="check-circle" class="header-star-sparkle w-3.5 h-3.5"></i> Sempurna bwang! ✨
        </span>
      `
      }
    `;
  }
};

class SidebarController {
  constructor(app) {
    this.app = app;
    this.isOpen = window.innerWidth >= 768;
    this.currentFilter = "all";
    this.sortOrder = "asc"; // 'asc' = oldest to newest, 'desc' = newest to oldest
  }

  /**
   * Toggles sidebar drawer visibility
   * @param {Boolean|null} forceState
   */
  toggle(forceState = null) {
    const sidebar = document.getElementById("sidebar");
    if (!sidebar) return;

    this.isOpen = forceState !== null ? forceState : !this.isOpen;

    if (this.isOpen) {
      sidebar.classList.remove("sidebar-hidden");
      sidebar.classList.add("sidebar-visible");
    } else {
      sidebar.classList.remove("sidebar-visible");
      sidebar.classList.add("sidebar-hidden");
    }

    if (this.app.mapInstance) {
      this.app.mapInstance.invalidateSize();
    }
  }

  /**
   * Initializes initial sidebar state based on screen size
   */
  updateInitialUI() {
    const sidebar = document.getElementById("sidebar");
    if (!sidebar) return;

    if (this.isOpen) {
      sidebar.classList.add("sidebar-visible");
      sidebar.classList.remove("sidebar-hidden");
    } else {
      sidebar.classList.add("sidebar-hidden");
      sidebar.classList.remove("sidebar-visible");
    }
  }

  /**
   * Toggles sort order between ascending and descending
   */
  toggleSortOrder() {
    this.sortOrder = this.sortOrder === "asc" ? "desc" : "asc";
    this.updateSortButtonUI();
    this.render();
  }

  /**
   * Updates sort order button label and icon
   */
  updateSortButtonUI() {
    const textEl = document.getElementById("sort-order-text");
    const iconEl = document.getElementById("sort-order-icon");
    if (textEl) {
      textEl.innerText = this.sortOrder === "asc" ? "Terlama" : "Terbaru";
    }
    if (iconEl) {
      iconEl.setAttribute(
        "data-lucide",
        this.sortOrder === "asc" ? "arrow-up-narrow-wide" : "arrow-down-wide-narrow"
      );
      if (window.lucide) lucide.createIcons();
    }
  }

  /**
   * Sets current category filter
   * @param {String} category
   */
  setFilter(category) {
    this.currentFilter = category || "all";
    this.render();
  }

  /**
   * Renders memory cards list into sidebar
   */
  render() {
    const container = document.getElementById("memory-list");
    if (!container) return;

    const memories = this.app.memories || [];

    // Filter memories by category
    const filtered = memories.filter((m) => {
      const isItemUnlocked = this.app?.unlockedIds instanceof Set
        ? this.app.unlockedIds.has(m.id)
        : m.isLocked === false;
      if (this.currentFilter === "unlocked") return isItemUnlocked;
      if (this.currentFilter === "locked") return !isItemUnlocked;
      return true;
    });

    // Sort memories chronologically
    filtered.sort((a, b) => {
      if (a.order !== undefined && b.order !== undefined) {
        return this.sortOrder === "asc" ? a.order - b.order : b.order - a.order;
      }
      const dateA = new Date(a.date);
      const dateB = new Date(b.date);
      return this.sortOrder === "asc" ? dateA - dateB : dateB - dateA;
    });

    if (filtered.length === 0) {
      container.innerHTML = SidebarTemplate.buildEmptyState();
      if (window.lucide) lucide.createIcons();
      return;
    }

    const isClueIsCollected = Boolean(this.app.secretPuzzle?.hasClue("is"));
    const cardsHtml = filtered
      .map((memory, index) => {
        const formattedDate = this.app.formatDateIndo ? this.app.formatDateIndo(memory.date) : memory.date;
        const isItemUnlocked = this.app?.unlockedIds instanceof Set
          ? this.app.unlockedIds.has(memory.id)
          : memory.isLocked === false;
        return SidebarTemplate.buildMemoryCard(memory, index, isClueIsCollected, formattedDate, isItemUnlocked);
      })
      .join("");

    const isClue5Collected = Boolean(this.app.secretPuzzle?.hasClue("isn't it?"));
    const futureAdventuresCard = SidebarTemplate.buildFutureAdventuresCard(isClue5Collected);

    container.innerHTML = cardsHtml + futureAdventuresCard;

    if (window.lucide) lucide.createIcons();
  }

  /**
   * Highlights selected memory card in the sidebar
   * @param {String} id
   */
  highlightItem(id) {
    document.querySelectorAll(".memory-card").forEach((card) => {
      if (card.dataset.id === id) {
        card.classList.add("ring-2", "ring-rose-500", "bg-rose-50/90", "active-memory", "border-rose-400");
        card.scrollIntoView({ behavior: "smooth", block: "center" });
      } else {
        card.classList.remove("ring-2", "ring-rose-500", "bg-rose-50/90", "active-memory", "border-rose-400");
      }
    });
  }

  /**
   * Updates memory statistics in header / summary badges
   */
  updateStats() {
    const memories = this.app.memories || [];
    const total = memories.length;
    const unlocked = this.app?.unlockedIds instanceof Set
      ? this.app.unlockedIds.size
      : memories.filter((m) => m.isLocked === false).length;
    const locked = Math.max(0, total - unlocked);

    const statsEl = document.getElementById("constellation-stats");
    if (statsEl) {
      statsEl.innerHTML = SidebarTemplate.buildStatsBadges(unlocked, total, locked);
      if (window.lucide) window.lucide.createIcons();
    }
  }

  /**
   * Alias method for render()
   */
  renderMemoryList() {
    this.render();
  }
}

window.SidebarController = SidebarController;
