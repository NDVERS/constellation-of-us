/**
 * Constellation of Us - Pure Template Builders for Polaroid Modal
 * Decoupled from state management according to Front-End Anti-Slop Guidelines
 */
const PolaroidTemplate = {
  buildStoryClue(storyClue, isCollected) {
    return `
      <span 
        class="hidden-word-clue ${isCollected ? "clue-collected" : ""} text-xs py-0.5 px-2.5" 
        data-clue="${storyClue}" 
        onclick="window.app.handleClueClick('${storyClue}', event)" 
        title="${isCollected ? "Sudah dikoleksi ✦" : "Kepingan kata rahasia"}"
      >
        ✦ ${storyClue}
      </span>
    `;
  },

  buildPhotoClue(photoClue, isCollected) {
    const safeClue = photoClue.replace(/'/g, "\\'");
    return `
      <span 
        class="hidden-word-clue hidden-word-clue-dark ${isCollected ? "clue-collected" : ""} text-xs py-0.5 px-2.5" 
        data-clue="${photoClue}" 
        onclick="window.app.handleClueClick('${safeClue}', event)" 
        title="${isCollected ? "Sudah dikoleksi ✦" : "Kepingan kata rahasia"}"
      >
        ✦ ${photoClue}
      </span>
    `;
  },

  buildTimelineItem(item) {
    return `
      <div class="timeline-pill flex items-start gap-2.5 p-2 rounded-xl bg-white/95 border border-stone-200/80 shadow-xs hover:border-rose-300 transition-colors">
        <span class="timeline-badge flex items-center justify-center flex-shrink-0 w-6 h-6 mt-0.5 text-xs font-bold text-rose-600 bg-rose-100 rounded-lg">
          ${item.icon || "✦"}
        </span>
        <div class="flex flex-col flex-1 min-w-0">
          <span class="mb-1 text-xs font-bold uppercase tracking-wider text-rose-600 leading-none">${item.time}</span>
          <span class="text-xs font-medium leading-snug break-words text-stone-700">${item.text}</span>
        </div>
      </div>
    `;
  },

  buildSingleTimeItem(time) {
    return `
      <div class="timeline-pill flex items-start gap-2.5 p-2 rounded-xl bg-white/95 border border-stone-200/80 shadow-xs hover:border-rose-300 transition-colors">
        <span class="timeline-badge flex items-center justify-center flex-shrink-0 w-6 h-6 mt-0.5 text-xs font-bold text-rose-600 bg-rose-100 rounded-lg">
          🕒
        </span>
        <div class="flex flex-col flex-1 min-w-0">
          <span class="mb-1 text-xs font-bold uppercase tracking-wider text-rose-600 leading-none">Waktu Hangout</span>
          <span class="text-xs font-medium leading-snug break-words text-stone-700">${time}</span>
        </div>
      </div>
    `;
  },

  buildVideoPlayer(photoUrl) {
    return `
      <video 
        id="polaroid-video" 
        src="${photoUrl}" 
        preload="none" 
        loop 
        playsinline 
        controls 
        class="w-full h-full object-cover rounded-xl pointer-events-auto transition-opacity duration-300"
        style="opacity: 0;"
      ></video>
    `;
  },

  buildPhotoElement(photoUrl, title, photoPosition) {
    return `
      <img 
        id="polaroid-img" 
        src="${photoUrl}" 
        alt="${title || 'Memory Photo'}" 
        loading="lazy" 
        decoding="async" 
        class="w-full h-full object-cover transition-opacity duration-300" 
        style="object-position: ${photoPosition}; opacity: 0;" 
      />
    `;
  }
};

class PolaroidModalController {
  constructor(app) {
    this.app = app;
    this.currentMemory = null;
    this.currentGallery = [];
    this.currentGalleryIndex = 0;
    this.isZoomed = false;
    this.isVideoCurrent = false;
    this.isVideoDuckingActive = false;
    this.lastTapTime = 0;
    this.touchStartX = 0;
    this.touchStartY = 0;
    this.SWIPE_THRESHOLD = 45;

    this.setupTouchInteractions();
    this.setupFrameTouchInteractions();
  }

  /**
   * Ducks BGM volume when modal video is actively playing with sound
   */
  duckBgm() {
    const audioPlayer = this.app?.audioPlayer || window.app?.audioPlayer;
    if (audioPlayer && !this.isVideoDuckingActive) {
      this.isVideoDuckingActive = true;
      audioPlayer.duckVolume(0.1, 400, true);
    }
  }

  /**
   * Restores BGM volume when video is paused, muted, or modal closed
   */
  restoreBgm() {
    const audioPlayer = this.app?.audioPlayer || window.app?.audioPlayer;
    if (audioPlayer && this.isVideoDuckingActive) {
      this.isVideoDuckingActive = false;
      audioPlayer.restoreVolume(600);
    }
  }

  /**
   * Sets up swipe gestures and double tap to zoom on Polaroid photo container
   */
  setupTouchInteractions() {
    const container = document.querySelector(".polaroid-image-container");
    if (!container) return;

    // Touchstart: Record initial touch position
    container.addEventListener(
      "touchstart",
      (e) => {
        if (e.target.closest("button") || e.target.closest(".hidden-word-clue") || e.target.closest("video")) return;
        if (e.touches && e.touches.length > 0) {
          this.touchStartX = e.touches[0].clientX;
          this.touchStartY = e.touches[0].clientY;
        }
      },
      { passive: true }
    );

    // Touchend: Detect double tap and horizontal swipe gestures
    container.addEventListener("touchend", (e) => {
      if (e.target.closest("button") || e.target.closest(".hidden-word-clue") || e.target.closest("video")) return;

      const touchEndX = e.changedTouches && e.changedTouches.length > 0 ? e.changedTouches[0].clientX : this.touchStartX;
      const touchEndY = e.changedTouches && e.changedTouches.length > 0 ? e.changedTouches[0].clientY : this.touchStartY;
      const deltaX = touchEndX - this.touchStartX;
      const deltaY = touchEndY - this.touchStartY;

      const currentTime = Date.now();
      const tapInterval = currentTime - this.lastTapTime;
      const isShortMovement = Math.abs(deltaX) < 15 && Math.abs(deltaY) < 15;

      // Double Tap detection (< 300ms) - Only for images, disabled on video
      if (!this.isVideoCurrent && isShortMovement && tapInterval > 0 && tapInterval < 300) {
        this.toggleZoom();
        this.lastTapTime = 0;
        return;
      }
      this.lastTapTime = currentTime;

      // Horizontal Swipe gesture (only when not zoomed)
      if (!this.isZoomed && Math.abs(deltaX) > this.SWIPE_THRESHOLD && Math.abs(deltaX) > Math.abs(deltaY) * 1.2) {
        if (deltaX < 0) {
          if (this.currentGallery && this.currentGallery.length > 1) {
            this.nextPhoto();
          } else {
            this.nextMemory();
          }
        } else {
          if (this.currentGallery && this.currentGallery.length > 1) {
            this.prevPhoto();
          } else {
            this.prevMemory();
          }
        }
      }
    });

    // Double click fallback for desktop testing
    container.addEventListener("dblclick", (e) => {
      if (e.target.closest("button") || e.target.closest(".hidden-word-clue") || e.target.closest("video")) return;
      if (!this.isVideoCurrent) {
        this.toggleZoom();
      }
    });
  }

  /**
   * Sets up swipe-to-navigate gesture on the full Polaroid frame (story note area)
   */
  setupFrameTouchInteractions() {
    const frame = document.querySelector(".polaroid-frame");
    if (!frame) return;

    let frameStartX = 0;
    let frameStartY = 0;

    frame.addEventListener(
      "touchstart",
      (e) => {
        if (e.target.closest("button") || e.target.closest(".hidden-word-clue") || e.target.closest(".polaroid-image-container")) return;
        if (e.touches && e.touches.length > 0) {
          frameStartX = e.touches[0].clientX;
          frameStartY = e.touches[0].clientY;
        }
      },
      { passive: true }
    );

    frame.addEventListener(
      "touchend",
      (e) => {
        if (e.target.closest("button") || e.target.closest(".hidden-word-clue") || e.target.closest(".polaroid-image-container")) return;

        const frameEndX = e.changedTouches && e.changedTouches.length > 0 ? e.changedTouches[0].clientX : frameStartX;
        const frameEndY = e.changedTouches && e.changedTouches.length > 0 ? e.changedTouches[0].clientY : frameStartY;
        const deltaX = frameEndX - frameStartX;
        const deltaY = frameEndY - frameStartY;

        // Check if user is scrolling inside story text
        const scrollable = frame.querySelector(".custom-scroll") || frame.querySelector(".overflow-y-auto");
        const isScrolled = scrollable && scrollable.scrollTop > 5;

        // Vertical Swipe Down -> Dismiss Modal (Mobile QoL)
        if (!isScrolled && deltaY > 75 && Math.abs(deltaY) > Math.abs(deltaX) * 1.5) {
          if (window.triggerHaptic) window.triggerHaptic(25);
          this.close();
          return;
        }

        // Horizontal Swipe -> Navigate between memories
        if (Math.abs(deltaX) > this.SWIPE_THRESHOLD && Math.abs(deltaX) > Math.abs(deltaY) * 1.3) {
          if (deltaX < 0) {
            this.nextMemory();
          } else {
            this.prevMemory();
          }
        }
      },
      { passive: true }
    );
  }

  /**
   * Navigates to next memory pin with cinematic transition
   */
  nextMemory() {
    const memories = this.app.memories || [];
    if (!this.currentMemory) return;
    const currentIndex = memories.findIndex((m) => m.id === this.currentMemory.id);
    if (currentIndex < memories.length - 1) {
      if (window.triggerHaptic) window.triggerHaptic(35);
      this.close();
      this.app.handleMemorySelect(memories[currentIndex + 1].id, false);
    }
  }

  /**
   * Navigates to previous memory pin with cinematic transition
   */
  prevMemory() {
    const memories = this.app.memories || [];
    if (!this.currentMemory) return;
    const currentIndex = memories.findIndex((m) => m.id === this.currentMemory.id);
    if (currentIndex > 0) {
      if (window.triggerHaptic) window.triggerHaptic(35);
      this.close();
      this.app.handleMemorySelect(memories[currentIndex - 1].id, false);
    }
  }

  /**
   * Toggles zoom state on Polaroid image (disabled for video)
   */
  toggleZoom() {
    if (this.isVideoCurrent) return;
    this.isZoomed = !this.isZoomed;
    const img = document.getElementById("polaroid-img");
    if (img) {
      if (this.isZoomed) {
        img.classList.add("photo-zoomed");
      } else {
        img.classList.remove("photo-zoomed");
      }
    }
    if (window.triggerHaptic) window.triggerHaptic(45);
  }

  /**
   * Resets photo zoom back to normal scale(1)
   */
  resetZoom() {
    this.isZoomed = false;
    const img = document.getElementById("polaroid-img");
    if (img) {
      img.classList.remove("photo-zoomed");
    }
  }

  /**
   * Opens Polaroid modal with full memory details and gallery setup
   * @param {Object|String} memoryOrId
   */
  open(memoryOrId) {
    const modal = document.getElementById("polaroid-modal");
    if (!modal) return;

    let memory = memoryOrId;
    if (typeof memoryOrId === "string") {
      memory = (this.app.memories || []).find((m) => m.id === memoryOrId) || this.currentMemory;
    }
    if (!memory) return;

    this.currentMemory = memory;
    this.resetZoom();

    // Setup Gallery Array from photos, gallery, or image
    if (Array.isArray(memory.photos) && memory.photos.length > 0) {
      this.currentGallery = memory.photos;
    } else if (Array.isArray(memory.gallery) && memory.gallery.length > 0) {
      this.currentGallery = memory.gallery;
    } else if (memory.image) {
      this.currentGallery = [memory.image];
    } else {
      this.currentGallery = [];
    }
    this.currentGalleryIndex = 0;

    // Display initial photo/video
    this.updateGalleryPhoto(false);

    document.getElementById("polaroid-title").innerText = memory.title || "Kenangan";

    const locTextEl = document.getElementById("polaroid-location-text");
    const locValue = memory.location || memory.locationName || "";
    if (locTextEl) {
      locTextEl.innerText = locValue;
    } else {
      const locEl = document.getElementById("polaroid-location");
      if (locEl) locEl.innerText = locValue;
    }

    document.getElementById("polaroid-date").innerText = this.formatDateIndo(memory.date);
    document.getElementById("polaroid-category").innerText = memory.category || "Hangout";
    document.getElementById("polaroid-story").innerText = `"${memory.story || ''}"`;

    // Dynamic Story Clue Hooks: "The" (Paskal) or "is" (Gacoan)
    const storyClueContainer = document.getElementById("polaroid-story-clue-container");
    if (storyClueContainer) {
      let storyClue = null;
      if (memory.secretClue === "The" || memory.id === "memory-paskal-cgv" || memory.id === "mem-paskal") {
        storyClue = "The";
      } else if (memory.secretClue === "is" || memory.id === "memory-gacoan-padasuka") {
        storyClue = "is";
      }

      if (storyClue) {
        const isCollected = Boolean(this.app.secretPuzzle?.hasClue(storyClue));
        storyClueContainer.innerHTML = PolaroidTemplate.buildStoryClue(storyClue, isCollected);
      } else {
        storyClueContainer.innerHTML = "";
      }
    }

    // Dynamic Timeline Pills Rendering
    const timelineContainer = document.getElementById("polaroid-timeline-container");
    const timelineList = document.getElementById("polaroid-timeline-list");
    if (timelineContainer && timelineList) {
      if (Array.isArray(memory.timeline) && memory.timeline.length > 0) {
        timelineContainer.classList.remove("hidden");
        timelineList.innerHTML = memory.timeline.map((item) => PolaroidTemplate.buildTimelineItem(item)).join("");
      } else if (memory.time) {
        timelineContainer.classList.remove("hidden");
        timelineList.innerHTML = PolaroidTemplate.buildSingleTimeItem(memory.time);
      } else {
        timelineContainer.classList.add("hidden");
        timelineList.innerHTML = "";
      }
    }

    // Modal navigation buttons (Previous / Next memory pin with flyTo transition)
    const memories = this.app.memories || [];
    const currentIndex = memories.findIndex((m) => m.id === memory.id);
    const prevBtn = document.getElementById("polaroid-prev");
    const nextBtn = document.getElementById("polaroid-next");

    if (prevBtn) {
      prevBtn.disabled = currentIndex <= 0;
      prevBtn.onclick = () => {
        if (currentIndex > 0) {
          this.close();
          this.app.handleMemorySelect(memories[currentIndex - 1].id, false);
        }
      };
    }

    if (nextBtn) {
      nextBtn.disabled = currentIndex >= memories.length - 1;
      nextBtn.onclick = () => {
        if (currentIndex < memories.length - 1) {
          this.close();
          this.app.handleMemorySelect(memories[currentIndex + 1].id, false);
        }
      };
    }

    modal.classList.remove("hidden");
    modal.classList.add("flex");
    if (window.lucide) lucide.createIcons();
  }

  /**
   * Updates current media (Image / Video) in Polaroid slider with Polymorphic Renderer
   * @param {Boolean} fade
   */
  updateGalleryPhoto(fade = true) {
    this.resetZoom();

    // Pause any previously active video and restore BGM volume if ducked
    const activeVideo = document.getElementById("polaroid-video");
    if (activeVideo) {
      try {
        activeVideo.pause();
      } catch (e) {}
    }
    this.restoreBgm();

    const mediaContainer = document.getElementById("polaroid-media-container");
    const imageContainer = document.querySelector(".polaroid-image-container");
    const counter = document.getElementById("gallery-counter");
    const prevBtn = document.getElementById("gallery-btn-prev");
    const nextBtn = document.getElementById("gallery-btn-next");
    const photoClueContainer = document.getElementById("polaroid-photo-clue-container");
    const subcaptionContainer = document.getElementById("polaroid-subcaption-container");
    const subcaptionEl = document.getElementById("polaroid-subcaption");

    if (!mediaContainer && !imageContainer) return;

    const totalPhotos = this.currentGallery.length;
    const currentItem = totalPhotos > 0 ? this.currentGallery[this.currentGalleryIndex] : null;
    const photoUrl = typeof currentItem === "object" && currentItem !== null ? currentItem.url || "" : currentItem || "";
    const photoCaption = typeof currentItem === "object" && currentItem !== null ? currentItem.caption || "" : "";
    const photoPosition = typeof currentItem === "object" && currentItem !== null
      ? currentItem.position || currentItem.objectPosition || "center center"
      : "center center";

    // Polymorphic Check: Video or Image
    const isVideo = (typeof currentItem === "object" && currentItem !== null && currentItem.type === "video") ||
      photoUrl.endsWith(".mp4") || photoUrl.endsWith(".webm");
    this.isVideoCurrent = isVideo;

    // Apply shimmer loader state
    if (imageContainer) imageContainer.classList.add("is-loading-shimmer");

    const targetWrapper = mediaContainer || imageContainer;

    if (isVideo) {
      // 1. RENDER POLYMORPHIC VIDEO PLAYER (Unmuted by default for interactive viewing)
      targetWrapper.innerHTML = PolaroidTemplate.buildVideoPlayer(photoUrl);

      const video = targetWrapper.querySelector("video");
      const onVideoReady = () => {
        if (imageContainer) imageContainer.classList.remove("is-loading-shimmer");
        if (video) video.style.opacity = "1";
      };

      if (video) {
        video.muted = false;
        video.volume = 1;

        const attemptPlay = () => {
          const modal = document.getElementById("polaroid-modal");
          const isModalOpen = modal && !modal.classList.contains("hidden");
          if (!isModalOpen) return;

          video.muted = false;
          const playPromise = video.play();
          if (playPromise !== undefined) {
            playPromise
              .then(() => {
                handleVideoAudioDucking();
              })
              .catch((err) => {
                console.log("Autoplay unmuted dicegah oleh kebijakan browser/audio, mencoba fallback mode muted:", err);
                video.muted = true;
                video.play().catch(() => {});
              });
          }
        };

        video.onloadeddata = () => {
          onVideoReady();
          attemptPlay();
        };
        video.oncanplay = onVideoReady;
        video.onerror = () => {
          if (imageContainer) imageContainer.classList.remove("is-loading-shimmer");
          if (video) video.style.opacity = "1";
        };

        // Audio Ducking / Auto-Pause event handlers
        const handleVideoAudioDucking = () => {
          const isPlayingWithAudio = !video.paused && !video.muted && video.volume > 0;
          if (isPlayingWithAudio) {
            this.duckBgm();
          } else {
            this.restoreBgm();
          }
        };

        video.addEventListener("play", handleVideoAudioDucking);
        video.addEventListener("playing", handleVideoAudioDucking);
        video.addEventListener("pause", handleVideoAudioDucking);
        video.addEventListener("ended", handleVideoAudioDucking);
        video.addEventListener("volumechange", handleVideoAudioDucking);

        // Explicit unmuted play trigger upon slide render
        attemptPlay();
      }
    } else {
      // 2. RENDER POLYMORPHIC IMAGE
      targetWrapper.innerHTML = PolaroidTemplate.buildPhotoElement(photoUrl, this.currentMemory?.title, photoPosition);

      const img = targetWrapper.querySelector("img");
      const onPhotoLoaded = () => {
        if (imageContainer) imageContainer.classList.remove("is-loading-shimmer");
        if (img) img.style.opacity = "1";
      };

      if (img) {
        img.onload = onPhotoLoaded;
        img.onerror = () => {
          // Fallback to og-preview or first photo if file missing
          if (imageContainer) imageContainer.classList.remove("is-loading-shimmer");
          if (img) {
            img.style.opacity = "1";
          }
        };

        if (img.complete && img.naturalWidth > 0) {
          onPhotoLoaded();
        }
      }
    }

    // Silent background pre-caching for next and previous slides (Images only!)
    if (totalPhotos > 1) {
      const preloadItem = (item) => {
        if (!item) return;
        const isVid = typeof item === "object" && (item.type === "video" || item.url?.endsWith(".mp4"));
        const url = typeof item === "object" ? item.url : item;
        if (!isVid && url && typeof Image !== "undefined") {
          const preImg = new Image();
          preImg.src = url;
        }
      };

      preloadItem(this.currentGallery[this.currentGalleryIndex + 1]);
      preloadItem(this.currentGallery[this.currentGalleryIndex - 1]);
    }

    // Dynamic Per-Slide Sub-Caption with Smooth Fade
    if (subcaptionContainer && subcaptionEl) {
      if (photoCaption) {
        subcaptionContainer.classList.remove("hidden");
        subcaptionContainer.style.opacity = "0";
        subcaptionEl.innerText = photoCaption;
        setTimeout(() => {
          subcaptionContainer.style.opacity = "1";
        }, 30);
      } else {
        subcaptionContainer.classList.add("hidden");
        subcaptionEl.innerText = "";
      }
    }

    // Dynamic Photo Slide Clues (Strictly per-slide matching)
    if (photoClueContainer) {
      let photoClue = null;

      // 1. Ciwalk: Clue "moon" ONLY on Slide 8 (index 7: ciwalk-jco.jpg)
      if (
        (this.currentMemory?.id === "memory-ciwalk-bandung" || this.currentMemory?.id === "mem-ciwalk") &&
        (this.currentGalleryIndex === 7 || photoUrl.includes("ciwalk-jco"))
      ) {
        photoClue = "moon";
      }
      // 2. Milky Verse: Clue "beautiful," ONLY on Slide 1 (index 0: milkyverse-lempar-sasaran.jpg)
      else if (
        (this.currentMemory?.id === "memory-milkyverse-ramayana" || this.currentMemory?.id === "mem-milkyverse") &&
        (this.currentGalleryIndex === 0 || photoUrl.includes("milkyverse-lempar-sasaran.jpg"))
      ) {
        photoClue = "beautiful,";
      }
      // 3. The Upperside: Clue "isn't it?" ONLY on Slide 12 (index 11: upperside-citylight-view.jpg)
      else if (
        (this.currentMemory?.id === "memory-the-upperside-cimall" || this.currentMemory?.id === "mem-upperside") &&
        (this.currentGalleryIndex === 11 || photoUrl.includes("upperside-citylight-view.jpg"))
      ) {
        photoClue = "isn't it?";
      }

      if (photoClue) {
        const isCollected = Boolean(this.app.secretPuzzle?.hasClue(photoClue));
        photoClueContainer.innerHTML = PolaroidTemplate.buildPhotoClue(photoClue, isCollected);
        photoClueContainer.classList.remove("hidden");
      } else {
        photoClueContainer.innerHTML = "";
        photoClueContainer.classList.add("hidden");
      }
    }

    // Toggle Gallery Nav Controls & Counter
    if (totalPhotos > 1) {
      if (counter) {
        counter.classList.remove("hidden");
        counter.style.display = "";
        counter.innerText = `${this.currentGalleryIndex + 1} / ${totalPhotos}`;
      }
      if (prevBtn) {
        prevBtn.classList.remove("hidden");
        prevBtn.style.display = "";
      }
      if (nextBtn) {
        nextBtn.classList.remove("hidden");
        nextBtn.style.display = "";
      }
    } else {
      if (counter) {
        counter.classList.add("hidden");
        counter.style.display = "none";
      }
      if (prevBtn) {
        prevBtn.classList.add("hidden");
        prevBtn.style.display = "none";
      }
      if (nextBtn) {
        nextBtn.classList.add("hidden");
        nextBtn.style.display = "none";
      }
    }

    if (window.lucide) lucide.createIcons();
  }

  /**
   * Navigates to next photo/video in gallery
   */
  nextPhoto() {
    if (!this.currentGallery || this.currentGallery.length <= 1) return;
    this.currentGalleryIndex = (this.currentGalleryIndex + 1) % this.currentGallery.length;
    this.updateGalleryPhoto(true);
    if (window.triggerHaptic) window.triggerHaptic(35);
  }

  /**
   * Navigates to previous photo/video in gallery
   */
  prevPhoto() {
    if (!this.currentGallery || this.currentGallery.length <= 1) return;
    this.currentGalleryIndex = (this.currentGalleryIndex - 1 + this.currentGallery.length) % this.currentGallery.length;
    this.updateGalleryPhoto(true);
    if (window.triggerHaptic) window.triggerHaptic(35);
  }

  /**
   * Closes Polaroid modal
   */
  close() {
    this.resetZoom();
    const modal = document.getElementById("polaroid-modal");
    if (modal) {
      modal.classList.add("hidden");
      modal.classList.remove("flex");
    }

    // Pause any active video, release decoder buffer, and restore BGM volume
    const video = document.getElementById("polaroid-video");
    if (video) {
      try {
        video.pause();
        video.removeAttribute("src");
        video.load();
      } catch (e) {}
    }
    this.restoreBgm();
  }

  /**
   * Formats ISO or localized date string to Indonesian format
   * @param {String} dateString
   */
  formatDateIndo(dateString) {
    if (!dateString) return "";
    if (dateString.includes("Agu") || dateString.includes("Sep") || dateString.includes("Okt")) {
      return dateString;
    }
    const options = { day: "numeric", month: "short", year: "numeric" };
    const d = new Date(dateString);
    return isNaN(d.getTime()) ? dateString : d.toLocaleDateString("id-ID", options);
  }
}

window.PolaroidModalController = PolaroidModalController;
