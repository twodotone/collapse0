const HexGrid = require('./hexGrid');

/**
 * Game State Manager
 * Manages all players, landmarks, and game mechanics
 */
class GameState {
  constructor() {
    this.hexGrid = new HexGrid(25); // 50x50 effective map
    this.players = new Map(); // playerId -> player object
    this.landmarks = new Map(); // landmarkId -> landmark object
    this.nextLandmarkId = 1;
    
    // Game constants
    this.TIME_SCALE = 5000; // 1 game hour = 5 seconds (5000ms)
    this.MOVEMENT_TIME_PER_HEX = 1; // 1 game hour per hex
    this.OIL_REGENERATION_RATE = 10; // Oil units per game hour
    this.CAPTURE_TIME = 2; // 2 game hours to capture
    this.STARTING_ENERGY = 100;
    
    this.initializeLandmarks();
    this.startGameLoop();
  }

  /**
   * Initialize landmarks with oil deposits
   */
  initializeLandmarks() {
    const landmarkCount = 15; // Start with 15 oil deposits
    
    for (let i = 0; i < landmarkCount; i++) {
      const position = this.hexGrid.getRandomHex();
      const landmark = {
        id: this.nextLandmarkId++,
        position,
        oil: Math.floor(Math.random() * 500) + 100, // 100-600 oil
        maxOil: 1000,
        regenerationRate: this.OIL_REGENERATION_RATE,
        capturingPlayer: null,
        captureProgress: 0
      };
      
      this.landmarks.set(landmark.id, landmark);
    }
  }

  /**
   * Add a new player to the game
   */
  addPlayer(playerId, username) {
    const spawnPosition = this.hexGrid.getRandomHex();
    
    const player = {
      id: playerId,
      username: username || `Player${playerId.substring(0, 6)}`,
      position: spawnPosition,
      destination: null,
      movementProgress: 0, // 0 to 1, represents progress to next hex
      path: [], // Array of hex coordinates to follow
      energy: this.STARTING_ENERGY,
      color: this.getRandomColor(),
      lastUpdate: Date.now()
    };
    
    this.players.set(playerId, player);
    return player;
  }

  /**
   * Remove a player from the game
   */
  removePlayer(playerId) {
    this.players.delete(playerId);
  }

  /**
   * Get player state
   */
  getPlayer(playerId) {
    return this.players.get(playerId);
  }

  /**
   * Set player destination and calculate path
   */
  setPlayerDestination(playerId, destination) {
    const player = this.players.get(playerId);
    if (!player || !this.hexGrid.isValidHex(destination)) {
      return false;
    }

    // For now, simple direct path (can enhance with pathfinding later)
    player.destination = destination;
    player.path = this.calculatePath(player.position, destination);
    player.movementProgress = 0;
    
    return true;
  }

  /**
   * Calculate simple path between two hexes
   * Using linear interpolation for now
   */
  calculatePath(start, end) {
    const distance = this.hexGrid.distance(start, end);
    if (distance === 0) return [];
    
    const path = [];
    const N = Math.ceil(distance);
    
    for (let i = 1; i <= N; i++) {
      const t = i / N;
      const q = Math.round(start.q * (1 - t) + end.q * t);
      const r = Math.round(start.r * (1 - t) + end.r * t);
      path.push({ q, r });
    }
    
    return path;
  }

  /**
   * Get all landmarks
   */
  getLandmarks() {
    return Array.from(this.landmarks.values());
  }

  /**
   * Get visible players for a specific player (within range)
   */
  getVisiblePlayers(playerId, visionRange = 5) {
    const player = this.players.get(playerId);
    if (!player) return [];

    const visiblePlayers = [];
    
    for (const [id, otherPlayer] of this.players) {
      if (id === playerId) continue;
      
      const distance = this.hexGrid.distance(player.position, otherPlayer.position);
      if (distance <= visionRange) {
        visiblePlayers.push({
          id: otherPlayer.id,
          username: otherPlayer.username,
          position: otherPlayer.position,
          color: otherPlayer.color
        });
      }
    }
    
    return visiblePlayers;
  }

  /**
   * Main game loop - runs every 100ms
   */
  startGameLoop() {
    setInterval(() => {
      const now = Date.now();
      const deltaTime = 100; // 100ms tick
      
      // Update all players
      for (const player of this.players.values()) {
        this.updatePlayerMovement(player, deltaTime);
        this.updatePlayerCapture(player, deltaTime);
      }
      
      // Update landmarks
      for (const landmark of this.landmarks.values()) {
        this.updateLandmark(landmark, deltaTime);
      }
    }, 100);
  }

  /**
   * Update player movement
   */
  updatePlayerMovement(player, deltaTime) {
    if (!player.path || player.path.length === 0) {
      player.destination = null;
      return;
    }

    // Calculate how much progress we make this tick
    const timePerHex = this.MOVEMENT_TIME_PER_HEX * this.TIME_SCALE;
    const progressDelta = deltaTime / timePerHex;
    
    player.movementProgress += progressDelta;

    // Move to next hex in path
    while (player.movementProgress >= 1 && player.path.length > 0) {
      player.movementProgress -= 1;
      player.position = player.path.shift();
      
      if (player.path.length === 0) {
        player.destination = null;
        player.movementProgress = 0;
      }
    }
  }

  /**
   * Update player capture progress at landmarks
   */
  updatePlayerCapture(player, deltaTime) {
    // Check if player is at a landmark
    const landmark = this.getLandmarkAtPosition(player.position);
    
    if (landmark && landmark.oil > 0 && !player.destination) {
      // Player is stationary at an oil deposit
      const captureTime = this.CAPTURE_TIME * this.TIME_SCALE;
      const captureDelta = deltaTime / captureTime;
      
      if (landmark.capturingPlayer !== player.id) {
        landmark.capturingPlayer = player.id;
        landmark.captureProgress = 0;
      }
      
      landmark.captureProgress += captureDelta;
      
      // Capture complete
      if (landmark.captureProgress >= 1) {
        const energyGained = Math.min(10, landmark.oil); // Extract 10 oil per capture cycle
        player.energy += energyGained;
        landmark.oil -= energyGained;
        landmark.captureProgress = 0;
      }
    }
  }

  /**
   * Update landmark regeneration
   */
  updateLandmark(landmark, deltaTime) {
    if (landmark.oil < landmark.maxOil) {
      const regenTime = this.TIME_SCALE; // Regen rate per game hour
      const regenDelta = (deltaTime / regenTime) * landmark.regenerationRate;
      landmark.oil = Math.min(landmark.maxOil, landmark.oil + regenDelta);
    }
  }

  /**
   * Get landmark at a specific position
   */
  getLandmarkAtPosition(position) {
    for (const landmark of this.landmarks.values()) {
      if (landmark.position.q === position.q && landmark.position.r === position.r) {
        return landmark;
      }
    }
    return null;
  }

  /**
   * Get random color for player
   */
  getRandomColor() {
    const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E2'];
    return colors[Math.floor(Math.random() * colors.length)];
  }

  /**
   * Get full game state for a player
   */
  getGameStateForPlayer(playerId) {
    const player = this.players.get(playerId);
    if (!player) return null;

    return {
      player: {
        id: player.id,
        username: player.username,
        position: player.position,
        destination: player.destination,
        energy: Math.floor(player.energy),
        color: player.color
      },
      landmarks: this.getLandmarks().map(l => ({
        id: l.id,
        position: l.position,
        oil: Math.floor(l.oil),
        maxOil: l.maxOil,
        capturingPlayer: l.capturingPlayer,
        captureProgress: l.captureProgress
      })),
      visiblePlayers: this.getVisiblePlayers(playerId)
    };
  }
}

module.exports = GameState;
