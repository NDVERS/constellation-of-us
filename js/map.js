const TILE_PROVIDERS = {
  light: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  dark: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}'
};

const TILE_ATTRIBUTIONS = {
  light: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  dark: 'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ'
};

class MemoryMap {
  constructor(containerId = 'map') {
    this.containerId = containerId;
    this.map = null;
    this.tileLayer = null;
    this.currentTheme = 'light';
    this.markers = new Map(); // id -> { marker, data }
    this.constellationPolyline = null;
    this.onMarkerClickCallback = null;
    this.activeMarkerId = null;
  }

  /**
   * Initializes the Leaflet map with theme-based tile layer
   */
  init(defaultCenter = [-6.8950, 107.5680], defaultZoom = 13) {
    if (this.map) return;

    // Create Leaflet instance with smooth animations and constrained zoom levels
    this.map = L.map(this.containerId, {
      center: defaultCenter,
      zoom: defaultZoom,
      minZoom: 11,
      maxZoom: 18,
      zoomControl: false,
      attributionControl: false
    });

    // Add custom zoom control at top-right
    L.control.zoom({
      position: 'topright'
    }).addTo(this.map);

    const isDark = this.currentTheme === 'dark';
    const initialUrl = isDark ? TILE_PROVIDERS.dark : TILE_PROVIDERS.light;
    const initialAttribution = isDark ? TILE_ATTRIBUTIONS.dark : TILE_ATTRIBUTIONS.light;

    this.tileLayer = L.tileLayer(initialUrl, {
      minZoom: 11,
      maxZoom: 18,
      updateWhenIdle: true,
      keepBuffer: 2,
      attribution: initialAttribution
    }).addTo(this.map);

    // Apply initial theme
    this.setTheme(this.currentTheme);

    // Click outside markers to reset focus
    this.map.on('click', () => {
      this.resetMarkerHighlights();
    });

    // Toggle Floating Recenter Button when map pans away
    this.map.on('moveend', () => {
      this.checkRecenterButtonVisibility();
    });

    return this;
  }

  /**
   * Switches visual theme between Day (OSM), Sunset (Warm Magenta/Purple), and Night (DarkMatter)
   * @param {String} theme ('light', 'sunset', or 'dark')
   */
  setTheme(theme = 'light') {
    this.currentTheme = theme;
    const isDark = theme === 'dark';
    const isSunset = theme === 'sunset';

    // Toggle dark-tiles / sunset-tiles class on map container
    const mapEl = document.getElementById(this.containerId);
    if (mapEl) {
      mapEl.classList.toggle('dark-tiles', isDark || isSunset);
      mapEl.classList.toggle('sunset-tiles', isSunset);
    }

    // Switch Tile Layer URL to clean CartoDB Dark Matter or OSM Light
    if (this.tileLayer) {
      const targetUrl = (isDark || isSunset) ? TILE_PROVIDERS.dark : TILE_PROVIDERS.light;
      this.tileLayer.setUrl(targetUrl);
    }

    // Update Dual-Layer Celestial Polyline styling for dark / sunset / light
    if (this.constellationGlow) {
      let glowColor = '#f43f5e';
      let glowWeight = 6;
      let glowOpacity = 0.45;

      if (isSunset) {
        glowColor = '#fb7185';
        glowWeight = 8;
        glowOpacity = 0.7;
      } else if (isDark) {
        glowColor = '#38bdf8';
        glowWeight = 8;
        glowOpacity = 0.55;
      }

      this.constellationGlow.setStyle({
        color: glowColor,
        weight: glowWeight,
        opacity: glowOpacity
      });
    }

    if (this.constellationLine) {
      let coreColor = '#fffbeb';
      if (isSunset) {
        coreColor = '#fde047';
      } else if (isDark) {
        coreColor = '#f0f9ff';
      }

      this.constellationLine.setStyle({
        color: coreColor,
        opacity: 0.95,
        weight: isSunset ? 2.8 : 2.5,
        dashArray: '6, 10'
      });
    }

    // Re-render markers if any exist so icons reflect the active theme
    this.markers.forEach((item) => {
      const newIcon = this.createCustomMarkerIcon(item.data);
      item.marker.setIcon(newIcon);
    });
  }

  /**
   * Generates graceful curved celestial arc points between sequential star coordinates
   * Features distance-adaptive Bézier curvature with aesthetic northward sky arching.
   * @param {Array<[number, number]>} points
   * @param {Number} numPoints
   * @returns {Array<[number, number]>}
   */
  buildCelestialArc(points, numPoints = 32) {
    if (!points || points.length < 2) return points || [];

    try {
      const allArcPoints = [];

      for (let i = 0; i < points.length - 1; i++) {
        const start = points[i];
        const end = points[i + 1];

        if (!Array.isArray(start) || !Array.isArray(end) || isNaN(start[0]) || isNaN(end[0])) {
          continue;
        }

        const dy = end[0] - start[0]; // Latitude delta (North/South)
        const dx = end[1] - start[1]; // Longitude delta (East/West)
        const dist = Math.sqrt(dx * dx + dy * dy);

        // Check if this segment is the long inter-city span (Ciwalk ➔ Gacoan Padasuka)
        const isCiwalkToGacoan = dist > 0.05 || (Math.abs(start[1] - end[1]) > 0.04);

        let curveMagnitude = Math.min(0.012, Math.max(0.003, dist * 0.12));
        let normLat = dist > 0 ? dx / dist : 1;
        let normLng = dist > 0 ? -dy / dist : 0;

        if (isCiwalkToGacoan) {
          // Prominent southward celestial arch (~2.8 km curve to the south avoiding northern Cimahi pins)
          curveMagnitude = 0.026;
          normLat = -Math.abs(normLat);
          normLng = 0.05;
        } else {
          // Other segments: gentle natural arching
          if (normLat < 0) {
            normLat = -normLat;
            normLng = -normLng;
          }
        }

        // Calculate dynamic Bézier control point
        const midLat = (start[0] + end[0]) / 2 + normLat * curveMagnitude;
        const midLng = (start[1] + end[1]) / 2 + normLng * curveMagnitude;

        // Quadratic Bézier curve interpolation with high sampling resolution
        for (let s = 0; s <= numPoints; s++) {
          const t = s / numPoints;
          const invT = 1 - t;
          const lat = invT * invT * start[0] + 2 * invT * t * midLat + t * t * end[0];
          const lng = invT * invT * start[1] + 2 * invT * t * midLng + t * t * end[1];

          if (allArcPoints.length === 0 || s > 0) {
            allArcPoints.push([parseFloat(lat.toFixed(6)), parseFloat(lng.toFixed(6))]);
          }
        }
      }

      if (allArcPoints.length >= 2) {
        return allArcPoints;
      }
    } catch (err) {
      console.warn("Gagal membuat kurva busur rasi bintang (menggunakan fallback garis lurus):", err);
    }

    return points;
  }

  /**
   * Creates custom HTML icon for Leaflet markers (Celestial Diamond Star Pin)
   * @param {Object} memory
   */
  createCustomMarkerIcon(memory) {
    const isLocked = memory.isLocked;
    
    // Short location name for permanent floating pill
    const loc = memory.location || memory.locationName || memory.title || '';
    let shortName = loc.split(',')[0].trim();
    if (shortName.includes('23 Paskal') || shortName.includes('CGV')) shortName = '23 Paskal';
    else if (shortName.includes('Ciwalk') || shortName.includes('Cihampelas')) shortName = 'Ciwalk';
    else if (shortName.includes('Gacoan') || shortName.includes('Padasuka')) shortName = 'Gacoan';
    else if (shortName.includes('Milky') || shortName.includes('Ramayana')) shortName = 'Milky Verse';
    else if (shortName.includes('Upperside') || shortName.includes('Cimahi Mall')) shortName = 'The Upperside';

    // 4-point Diamond Crystal Star SVG with radiant core
    const starSvg = `
      <svg class="constellation-star-icon" viewBox="0 0 24 24" width="22" height="22" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 1L14.8 9.2L23 12L14.8 14.8L12 23L9.2 14.8L1 12L9.2 9.2L12 1Z" fill="currentColor"/>
        <circle cx="12" cy="12" r="2.5" fill="#ffffff"/>
      </svg>
    `;

    const lockBadge = isLocked ? `
      <div class="constellation-lock-badge" title="Terkunci - Selesaikan Kuis!">
        <svg xmlns="http://www.w3.org/2000/svg" width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
          <rect width="18" height="11" x="3" y="11" rx="2" ry="2"/>
          <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
        </svg>
      </div>
    ` : '';

    const html = `
      <div class="constellation-marker-container custom-pin-container ${isLocked ? 'is-locked' : 'is-unlocked'}" data-memory-id="${memory.id}">
        <!-- Pulsing Aura Rings -->
        <div class="constellation-marker-aura"></div>
        
        <!-- Diamond Crystal Star Core -->
        <div class="constellation-star-core">
          ${starSvg}
          ${lockBadge}
        </div>
        
        <!-- Permanent Floating Pill Label -->
        <div class="constellation-floating-pill">
          <span>${shortName}</span>
        </div>
      </div>
    `;

    return L.divIcon({
      className: 'constellation-leaflet-marker-wrapper',
      html: html,
      iconSize: [84, 60],
      iconAnchor: [42, 18],
      popupAnchor: [0, -24]
    });
  }

  /**
   * Renders memory markers and draws constellation lines
   * @param {Array} memories
   * @param {Function} onClick
   */
  renderMemories(memories, onClick) {
    this.onMarkerClickCallback = onClick;
    this.clearMarkers();

    const bounds = [];

    memories.forEach((memory) => {
      const coords = memory.coords || memory.coordinates;
      if (!coords || !Array.isArray(coords)) return;

      const icon = this.createCustomMarkerIcon(memory);
      const marker = L.marker(coords, {
        icon: icon,
        title: memory.title,
        riseOnHover: true
      });

      marker.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        this.highlightMarker(memory.id);
        if (this.onMarkerClickCallback) {
          this.onMarkerClickCallback(memory, true);
        }
      });

      marker.addTo(this.map);
      this.markers.set(memory.id, { marker, data: memory });
      bounds.push(coords);
    });

    // Draw connecting constellation polyline
    this.drawConstellationLine(memories);

    // Fit map bounds gracefully if memories exist
    if (bounds.length > 0) {
      this.map.fitBounds(bounds, {
        padding: [80, 80],
        maxZoom: 14,
        animate: true,
        duration: 1.2
      });
    }
  }

  /**
   * Connects the memories directly with a graceful curved Celestial Constellation Arc
   * @param {Array} memories
   */
  drawConstellationLine(memories) {
    if (this.constellationGlow) {
      this.map.removeLayer(this.constellationGlow);
      this.constellationGlow = null;
    }
    if (this.constellationLine) {
      this.map.removeLayer(this.constellationLine);
      this.constellationLine = null;
    }
    if (this.constellationPolyline) {
      this.map.removeLayer(this.constellationPolyline);
      this.constellationPolyline = null;
    }

    if (!this.map || !memories || memories.length < 2) return;

    // Filter valid coordinate pairs
    const validMemories = memories.filter((m) => {
      const coords = m.coords || m.coordinates;
      return Array.isArray(coords) && coords.length === 2 && !isNaN(coords[0]) && !isNaN(coords[1]);
    });

    if (validMemories.length < 2) return;

    // Sort chronologically by order or date
    const sorted = [...validMemories].sort((a, b) => {
      if (a.order !== undefined && b.order !== undefined) return a.order - b.order;
      return new Date(a.date) - new Date(b.date);
    });
    const rawPinPoints = sorted.map((m) => m.coords || m.coordinates);

    // Build graceful curved celestial arc connecting pins directly
    const arcPoints = this.buildCelestialArc(rawPinPoints, 32);

    const isDark = this.currentTheme === 'dark';

    // Layer 1: Ambient Cosmic Glow (Lapisan Bawah)
    this.constellationGlow = L.polyline(arcPoints, {
      className: 'constellation-glow-layer',
      color: isDark ? '#38bdf8' : '#f43f5e',
      weight: isDark ? 8 : 6,
      opacity: isDark ? 0.55 : 0.45,
      lineCap: 'round',
      lineJoin: 'round',
      smoothFactor: 1.0
    }).addTo(this.map);

    // Layer 2: Animated Core Star Trail (Lapisan Atas)
    this.constellationLine = L.polyline(arcPoints, {
      className: 'constellation-trail-core',
      color: isDark ? '#f0f9ff' : '#fffbeb',
      weight: 2.5,
      opacity: 0.95,
      dashArray: '6, 10',
      lineCap: 'round',
      lineJoin: 'round',
      smoothFactor: 1.0
    }).addTo(this.map);

    // Backward compatibility reference
    this.constellationPolyline = this.constellationLine;
  }

  /**
   * Updates marker status after unlocking
   * @param {String} memoryId
   * @param {Boolean} isLocked
   */
  updateMarkerStatus(memoryId, isLocked) {
    const item = this.markers.get(memoryId);
    if (!item) return;

    item.data.isLocked = isLocked;
    const newIcon = this.createCustomMarkerIcon(item.data);
    item.marker.setIcon(newIcon);
  }

  /**
   * Updates all marker icons in the map according to their latest isLocked state
   */
  updateMarkerIcons() {
    this.markers.forEach((item) => {
      const newIcon = this.createCustomMarkerIcon(item.data);
      item.marker.setIcon(newIcon);
    });
  }

  /**
   * Focuses and navigates the camera to a specific memory with cinematic flyTo
   * @param {String} memoryId
   * @param {Number} zoom
   * @param {Function} onComplete
   */
  focusMemory(memoryId, zoom = 16, onComplete = null) {
    const item = this.markers.get(memoryId);
    if (!item) {
      if (onComplete) onComplete();
      return;
    }

    const coords = item.data.coords || item.data.coordinates;
    if (!coords) {
      if (onComplete) onComplete();
      return;
    }

    this.highlightMarker(memoryId);

    // Trigger pin bounce animation on arrival
    const triggerPinBounce = () => {
      const pinEl = document.querySelector(`.custom-pin-container[data-memory-id="${memoryId}"]`);
      if (pinEl) {
        pinEl.classList.remove('pin-bounce');
        void pinEl.offsetWidth; // Reflow
        pinEl.classList.add('pin-bounce');
      }
    };

    triggerPinBounce();

    if (this.map) {
      let isDone = false;
      const finish = () => {
        if (!isDone) {
          isDone = true;
          this.map.off('moveend', finish);
          triggerPinBounce();
          if (onComplete) onComplete();
        }
      };

      this.map.once('moveend', finish);
      setTimeout(finish, 1300);

      this.map.flyTo(coords, zoom, {
        animate: true,
        duration: 1.2,
        easeLinearity: 0.25
      });
    } else if (onComplete) {
      onComplete();
    }
  }

  /**
   * Highlights the marker in the DOM
   * @param {String} memoryId
   */
  highlightMarker(memoryId) {
    this.activeMarkerId = memoryId;
    document.querySelectorAll('.custom-pin-container').forEach(el => {
      if (el.dataset.memoryId === memoryId) {
        el.classList.add('active-pin');
      } else {
        el.classList.remove('active-pin');
      }
    });
  }

  /**
   * Removes active highlight states
   */
  resetMarkerHighlights() {
    this.activeMarkerId = null;
    document.querySelectorAll('.custom-pin-container').forEach(el => {
      el.classList.remove('active-pin');
    });
  }

  /**
   * Cleans all markers from map
   */
  clearMarkers() {
    this.markers.forEach(({ marker }) => {
      this.map.removeLayer(marker);
    });
    this.markers.clear();
    if (this.constellationGlow) {
      this.map.removeLayer(this.constellationGlow);
      this.constellationGlow = null;
    }
    if (this.constellationLine) {
      this.map.removeLayer(this.constellationLine);
      this.constellationLine = null;
    }
    if (this.constellationPolyline) {
      this.map.removeLayer(this.constellationPolyline);
      this.constellationPolyline = null;
    }
  }

  /**
   * Animates a dramatic cosmic beam drawing from start pin to unlocked target pin
   * Synchronizes camera flyTo across Bandung & Cimahi and triggers arrival sparkle bursts
   * @param {String} targetMemoryId
   * @param {Function} onComplete
   */
  animateConstellationDraw(targetMemoryId, onComplete = null) {
    const targetItem = this.markers.get(targetMemoryId);
    const targetCoords = targetItem?.data?.coords || targetItem?.data?.coordinates || [-6.8950, 107.5680];

    // Smoothly pan & zoom the camera to frame the constellation arc
    if (this.map) {
      this.map.flyTo(targetCoords, 14.5, {
        animate: true,
        duration: 2.2,
        easeLinearity: 0.25
      });
    }

    // Check if SVG paths exist for line and glow
    const linePath = this.constellationLine?._path;
    const glowPath = this.constellationGlow?._path;

    if (linePath && typeof linePath.getTotalLength === 'function') {
      try {
        const length = linePath.getTotalLength();

        // 1. Prepare SVG Stroke Animation
        linePath.style.transition = 'none';
        linePath.style.strokeDasharray = `${length} ${length}`;
        linePath.style.strokeDashoffset = `${length}`;
        void linePath.getBoundingClientRect(); // Force reflow

        if (glowPath && typeof glowPath.getTotalLength === 'function') {
          glowPath.style.transition = 'none';
          glowPath.style.strokeDasharray = `${length} ${length}`;
          glowPath.style.strokeDashoffset = `${length}`;
          void glowPath.getBoundingClientRect();
        }

        // 2. Play Audio Cue
        if (window.app?.audioPlayer?.playSparkleChime) {
          window.app.audioPlayer.playSparkleChime();
        }

        // 3. Trigger Smooth Beam Drawing Transition
        requestAnimationFrame(() => {
          const transitionCss = 'stroke-dashoffset 2.2s cubic-bezier(0.4, 0, 0.2, 1)';
          linePath.style.transition = transitionCss;
          linePath.style.strokeDashoffset = '0';

          if (glowPath) {
            glowPath.style.transition = transitionCss;
            glowPath.style.strokeDashoffset = '0';
          }
        });

        // 4. On Arrival: Spawn pin sparkles, sound swell, and restore standard stardust flow
        setTimeout(() => {
          // Reset stroke styling back to continuous flowing stardust
          if (this.constellationLine) {
            this.constellationLine.setStyle({
              dashArray: '6, 10'
            });
          }
          if (linePath) {
            linePath.style.transition = '';
            linePath.style.strokeDasharray = '';
            linePath.style.strokeDashoffset = '';
          }
          if (glowPath) {
            glowPath.style.transition = '';
            glowPath.style.strokeDasharray = '';
            glowPath.style.strokeDashoffset = '';
          }

          // Trigger pin bounce and arrival sparkles
          this.focusMemory(targetMemoryId, 15.5);
          this.spawnPinArrivalSparkles(targetCoords);

          if (window.app?.audioPlayer?.playSecretRevealChime) {
            window.app.audioPlayer.playSecretRevealChime();
          }

          if (onComplete) {
            setTimeout(onComplete, 400);
          }
        }, 2250);

        return;
      } catch (err) {
        console.warn('Constellation animation fallback:', err);
      }
    }

    // Fallback if SVG path not directly animatable
    this.focusMemory(targetMemoryId, 15.5, onComplete);
  }

  /**
   * Spawns radiant sparkle particles at pin coordinates upon beam arrival
   * @param {Array<number, number>} coords
   */
  spawnPinArrivalSparkles(coords) {
    if (!this.map) return;
    const pt = this.map.latLngToContainerPoint(coords);
    const colors = ['#f59e0b', '#fbbf24', '#fb7185', '#38bdf8', '#c084fc'];

    for (let i = 0; i < 16; i++) {
      const el = document.createElement('div');
      el.className = 'star-dust-particle';
      el.innerText = '✦';
      el.style.position = 'fixed';
      el.style.left = `${pt.x}px`;
      el.style.top = `${pt.y}px`;
      el.style.color = colors[Math.floor(Math.random() * colors.length)];
      el.style.fontSize = `${14 + Math.random() * 8}px`;

      const angle = (Math.PI * 2 * i) / 16 + (Math.random() * 0.2 - 0.1);
      const dist = 30 + Math.random() * 45;
      const tx = Math.cos(angle) * dist;
      const ty = Math.sin(angle) * dist;

      el.style.setProperty('--tx', `${tx}px`);
      el.style.setProperty('--ty', `${ty}px`);

      document.body.appendChild(el);
      setTimeout(() => el.remove(), 700);
    }
  }

  /**
   * Checks whether the current map viewport has drifted far from Bandung-Cimahi constellation
   * and toggles the floating Recenter Map button accordingly
   */
  checkRecenterButtonVisibility() {
    if (!this.map) return;
    const btn = document.getElementById('btn-recenter-map');
    if (!btn) return;

    const center = this.map.getCenter();
    const constellationCenter = L.latLng(-6.8950, 107.5680);
    const distanceMeters = center.distanceTo(constellationCenter);
    const zoom = this.map.getZoom();

    // Show recenter button if user panned > 5000m away or zoomed way out (< 11) or way in (> 17)
    const isDrifted = distanceMeters > 5000 || zoom < 11 || zoom > 17;
    btn.classList.toggle('hidden', !isDrifted);
  }

  /**
   * Smoothly recenters the camera back to Bandung-Cimahi constellation hub
   */
  recenterToBandung() {
    if (!this.map) return;
    if (window.triggerHaptic) window.triggerHaptic(25);

    this.map.flyTo([-6.8950, 107.5680], 13, {
      animate: true,
      duration: 1.2,
      easeLinearity: 0.25
    });

    const btn = document.getElementById('btn-recenter-map');
    if (btn) {
      btn.classList.add('hidden');
    }
  }

  /**
   * Refreshes map layout dimensions (e.g. after resizing or toggling sidebar)
   */
  invalidateSize() {
    if (this.map) {
      setTimeout(() => {
        this.map.invalidateSize();
      }, 300);
    }
  }
}

// Export as global window object for clean modularity without bundler
window.MemoryMap = MemoryMap;
