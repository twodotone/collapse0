/**
 * Hex Grid Utilities
 * Using axial coordinate system (q, r)
 * https://www.redblobgames.com/grids/hexagons/
 */

class HexGrid {
  constructor(mapRadius = 10) {
    // For a 20x20 effective map, we use radius 10 from center
    this.mapRadius = mapRadius;
  }

  /**
   * Calculate distance between two hex coordinates
   */
  distance(hex1, hex2) {
    const { q: q1, r: r1 } = hex1;
    const { q: q2, r: r2 } = hex2;
    
    return (Math.abs(q1 - q2) + Math.abs(q1 + r1 - q2 - r2) + Math.abs(r1 - r2)) / 2;
  }

  /**
   * Get all 6 neighbors of a hex
   */
  getNeighbors(hex) {
    const { q, r } = hex;
    const directions = [
      { q: 1, r: 0 },   // East
      { q: 1, r: -1 },  // Northeast
      { q: 0, r: -1 },  // Northwest
      { q: -1, r: 0 },  // West
      { q: -1, r: 1 },  // Southwest
      { q: 0, r: 1 }    // Southeast
    ];

    return directions
      .map(dir => ({ q: q + dir.q, r: r + dir.r }))
      .filter(neighbor => this.isValidHex(neighbor));
  }

  /**
   * Check if a hex coordinate is within map bounds
   */
  isValidHex(hex) {
    const { q, r } = hex;
    const s = -q - r;
    return Math.abs(q) <= this.mapRadius && 
           Math.abs(r) <= this.mapRadius && 
           Math.abs(s) <= this.mapRadius;
  }

  /**
   * Get a random valid hex coordinate
   */
  getRandomHex() {
    let hex;
    do {
      const q = Math.floor(Math.random() * (this.mapRadius * 2 + 1)) - this.mapRadius;
      const r = Math.floor(Math.random() * (this.mapRadius * 2 + 1)) - this.mapRadius;
      hex = { q, r };
    } while (!this.isValidHex(hex));
    
    return hex;
  }

  /**
   * Convert hex coordinates to a string key for easy storage
   */
  hexToKey(hex) {
    return `${hex.q},${hex.r}`;
  }

  /**
   * Convert string key back to hex coordinates
   */
  keyToHex(key) {
    const [q, r] = key.split(',').map(Number);
    return { q, r };
  }
}

module.exports = HexGrid;
