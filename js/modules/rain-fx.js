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

    this.initDrops();
  }

  /**
   * Resizes canvas buffer with device pixel ratio support
   */
  resize() {
    if (!this.canvas) return;
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);

    this.canvas.width = this.width * this.dpr;
    this.canvas.height = this.height * this.dpr;
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;

    if (this.ctx) {
      this.ctx.scale(this.dpr, this.dpr);
    }
  }

  /**
   * Generates raindrop particle pool
   */
  initDrops() {
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
   */
  start() {
    this.isRaining = true;
    document.body.classList.add("rain-weather-active");

    if (!this.animationFrameId) {
      this.lastTime = performance.now();
      this.animate();
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
   * Main render and physics loop
   */
  animate() {
    if (!this.ctx || !this.canvas) return;

    // Smooth opacity transition
    if (this.isRaining) {
      if (this.globalOpacity < 1) {
        this.globalOpacity = Math.min(1, this.globalOpacity + 0.04);
      }
    } else {
      if (this.globalOpacity > 0) {
        this.globalOpacity = Math.max(0, this.globalOpacity - 0.035);
      }
    }

    // If completely faded out and stopped, clear canvas and cancel loop to save CPU
    if (!this.isRaining && this.globalOpacity <= 0) {
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

    this.animationFrameId = requestAnimationFrame(() => this.animate());
  }
}

window.RainFXController = RainFXController;
