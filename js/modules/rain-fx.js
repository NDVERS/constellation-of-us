/**
 * Constellation of Us - Ambient Bandung Rain FX (Lightweight 2D Canvas)
 * Renders smooth diagonal soft drizzle overlay with battery-saving auto-pause.
 */

class RainFXController {
  constructor(canvasId = "rain-canvas") {
    this.canvasId = canvasId;
    this.canvas = null;
    this.ctx = null;
    this.drops = [];
    this.numDrops = 80;
    this.width = 0;
    this.height = 0;
    this.dpr = 1;

    this.isRaining = false;
    this.globalOpacity = 0;
    this.animationFrameId = null;
    this.lastTime = 0;

    this.init();
  }

  /**
   * Checks if user has enabled reduced motion preference
   */
  isReducedMotion() {
    return Boolean(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }

  /**
   * Initializes Canvas and binds resize listeners
   */
  init() {
    this.canvas = document.getElementById(this.canvasId);
    if (!this.canvas) return;

    this.ctx = this.canvas.getContext("2d");
    this.resize();

    window.addEventListener("resize", () => {
      this.resize();
    }, { passive: true });

    // Listen for OS reduced-motion preference changes
    if (window.matchMedia) {
      const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
      if (mediaQuery.addEventListener) {
        mediaQuery.addEventListener("change", (e) => {
          if (e.matches) {
            this.stop();
          }
        });
      }
    }

    this.initDrops();
  }

  /**
   * Resizes canvas buffer with mobile GPU optimization:
   * Capped to DPR 1 on mobile (< 640px) to prevent massive memory & pixel fill overhead.
   */
  resize() {
    if (!this.canvas) return;
    this.width = window.innerWidth;
    this.height = window.innerHeight;

    const isMobile = this.width < 640;
    // Cap DPR to 1 on mobile to avoid 4K/2K render buffer; max 2 on desktop
    this.dpr = isMobile ? 1 : Math.min(window.devicePixelRatio || 1, 2);

    this.canvas.width = this.width * this.dpr;
    this.canvas.height = this.height * this.dpr;
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;

    if (this.ctx) {
      this.ctx.scale(this.dpr, this.dpr);
    }

    // Re-adjust drop pool size on viewport resize
    const targetDrops = isMobile ? 32 : 80;
    if (this.numDrops !== targetDrops) {
      this.numDrops = targetDrops;
      this.initDrops();
    }
  }

  /**
   * Generates raindrop particle pool (32 drops on mobile, 80 on desktop)
   */
  initDrops() {
    const isMobile = (this.width || window.innerWidth) < 640;
    this.numDrops = isMobile ? 32 : 80;
    this.drops = [];
    for (let i = 0; i < this.numDrops; i++) {
      this.drops.push(this.createDrop(true));
    }
  }

  /**
   * Creates a single raindrop with realistic physics
   * @param {Boolean} randomizeY
   */
  createDrop(randomizeY = false) {
    const slantFactor = -2.2; // Slight diagonal westward wind
    return {
      x: Math.random() * (this.width + 120) - 60,
      y: randomizeY ? Math.random() * this.height : -30,
      length: 14 + Math.random() * 14, // 14px to 28px long
      speed: 11 + Math.random() * 7,   // 11px to 18px per frame
      slant: slantFactor + (Math.random() * 0.4 - 0.2),
      opacity: 0.25 + Math.random() * 0.35, // 0.25 to 0.60
      thickness: 0.8 + Math.random() * 0.7,  // 0.8px to 1.5px
    };
  }

  /**
   * Starts visual rain simulation with smooth fade-in
   * Skips RAF loop if user prefers reduced motion.
   */
  start() {
    this.isRaining = true;
    document.body.classList.add("rain-weather-active");

    if (this.isReducedMotion()) {
      // Keep weather theme class active but skip heavy canvas loop
      return;
    }

    if (!this.animationFrameId) {
      this.lastTime = performance.now();
      this.animate(this.lastTime);
    }
  }

  /**
   * Stops visual rain with smooth fade-out and auto-pauses RAF loop
   */
  stop() {
    this.isRaining = false;
    document.body.classList.remove("rain-weather-active");
    // Render loop will naturally fade out globalOpacity to 0 and cancel animationFrame
  }

  /**
   * Main render and physics loop with mobile frame throttling (~35 FPS limit on mobile)
   */
  animate(currentTime = performance.now()) {
    if (!this.ctx || !this.canvas) return;

    // Mobile FPS cap: throttle to ~35-40 FPS (min 26ms per frame) to save GPU on 120Hz displays
    const isMobile = this.width < 640;
    const minInterval = isMobile ? 26 : 0;
    const elapsed = currentTime - this.lastTime;

    if (minInterval > 0 && elapsed < minInterval) {
      this.animationFrameId = requestAnimationFrame((t) => this.animate(t));
      return;
    }
    this.lastTime = currentTime;

    // Smooth opacity transition
    if (this.isRaining && !this.isReducedMotion()) {
      if (this.globalOpacity < 1) {
        this.globalOpacity = Math.min(1, this.globalOpacity + 0.04);
      }
    } else {
      if (this.globalOpacity > 0) {
        this.globalOpacity = Math.max(0, this.globalOpacity - 0.035);
      }
    }

    // If completely faded out and stopped, clear canvas and cancel loop to save CPU
    if ((!this.isRaining || this.isReducedMotion()) && this.globalOpacity <= 0) {
      this.ctx.clearRect(0, 0, this.width, this.height);
      if (this.animationFrameId) {
        cancelAnimationFrame(this.animationFrameId);
        this.animationFrameId = null;
      }
      return;
    }

    // Clear frame
    this.ctx.clearRect(0, 0, this.width, this.height);

    const isDark = document.body.classList.contains("theme-dark");
    const baseColor = isDark ? "210, 235, 255" : "180, 215, 250";

    // Draw and update drops
    this.ctx.lineCap = "round";

    for (let i = 0; i < this.drops.length; i++) {
      const drop = this.drops[i];
      const effectiveAlpha = drop.opacity * this.globalOpacity;

      if (effectiveAlpha > 0.01) {
        this.ctx.beginPath();
        this.ctx.lineWidth = drop.thickness;
        this.ctx.strokeStyle = `rgba(${baseColor}, ${effectiveAlpha.toFixed(3)})`;
        
        this.ctx.moveTo(drop.x, drop.y);
        this.ctx.lineTo(
          drop.x + drop.slant * (drop.length * 0.4),
          drop.y + drop.length
        );
        this.ctx.stroke();
      }

      // Physics update
      drop.x += drop.slant * (drop.speed * 0.35);
      drop.y += drop.speed;

      // Wrap around screen bounds
      if (drop.y > this.height + 30 || drop.x < -100 || drop.x > this.width + 100) {
        this.drops[i] = this.createDrop(false);
      }
    }

    this.animationFrameId = requestAnimationFrame((t) => this.animate(t));
  }
}

window.RainFXController = RainFXController;
