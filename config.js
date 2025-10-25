/**
 * Game Configuration
 * Centralized place for all game balance and mechanics settings
 */

const GameConfig = {
  // Map Settings
  map: {
    radius: 10,  // 20x20 effective map (radius from center)
    startingZones: {
      green: {
        name: 'Green Zone',
        color: '#00ff0033',
        spawnArea: { qMin: -10, qMax: 10, rMin: 9, rMax: 10 }, // Bottom 2 rows
        safeRadius: 5  // No towers/oil within this distance
      },
      blue: {
        name: 'Blue Zone',
        color: '#0088ff33',
        spawnArea: { qMin: -10, qMax: 10, rMin: -10, rMax: -9 }, // Top 2 rows
        safeRadius: 5
      }
    }
  },

  // Time Settings
  time: {
    scale: 1000,  // 1 game hour = 1 second (much faster!)
    movementTimePerHex: 0.5,  // 0.5 game hours to move 1 hex (0.5 seconds)
  },

  // Landmark Settings
  landmarks: {
    count: 1,  // Single oil rig in center
    oilMin: 0,  // Start empty
    oilMax: 0,  // Start empty
    maxOil: 100,  // Cap at 100 units
    regenerationRate: 0.5,  // 0.5 oil units per game hour (0.5 per second = 200 seconds to fill!)
    captureTime: 5,  // Game hours to capture/extract (5 seconds - slower)
    oilPerCapture: 5,  // Oil extracted per capture cycle (slower gain)
  },

  // Tower Settings
  towers: {
    perLandmark: 3,  // 3 towers defending the oil rig
    placementRadius: 3,  // How far from landmark to place towers
    buildCost: 50,  // Energy cost to build a tower
    buildRadius: 4,  // Can build within 4 hexes of base or player
    maxHp: 30,
    attackRange: 3,  // Hexes - reduced from 6
    damage: 10,  // High damage - very dangerous
    attackSpeed: 0.1,  // 10 second reload (0.1 attacks per second)
    visionRange: 7,  // Can detect enemies this far
  },

  // Base Settings (team spawn bases - win condition)
  bases: {
    maxHp: 20,
    attackRange: 7,
    damage: 10,
    attackSpeed: 0.1,  // 10 second reload
    visionRange: 10,
  },

  // Player Settings
  player: {
    startingEnergy: 0,  // Start with nothing
    maxEnergy: 100,  // Cap at 100 units
    maxHp: 100,
    startingHp: 100,
    attackRange: 2,  // Hexes - reduced from 5
    damage: 4,  // Lower damage - need strategy
    attackSpeed: 2.0,  // Attacks per game hour (shoot twice as fast!)
    visionRange: Infinity,  // Can see entire map (fog of war disabled)
    respawnTime: 8,  // Game hours before respawn (8 seconds)
  },

  // Fog of War Settings
  fogOfWar: {
    enabled: false,  // Currently disabled - can be toggled for future features
    baseVisionRange: 10,  // Default vision range when enabled
    canBeUpgraded: true,  // Whether equipment/powerups can modify vision
  },

  // Weapon Systems
  weapons: {
    laser: {
      name: 'Laser',
      displayName: 'LASER',
      range: 2,  // Matches player attack range
      damage: 4,
      cooldown: 7,  // 7 second reload
      type: 'manual',  // Player activated
      hotkey: '2',
    },
    lrm: {
      name: 'LRM',
      displayName: 'LRM',
      range: 5,  // Reduced from 10
      damage: 25,  // High damage single shot
      cooldown: 30,  // 30 seconds cooldown
      type: 'manual',  // Player activated
      hotkey: '1',
    }
  },

  // Combat Settings
  combat: {
    autoTargetEnabled: false,  // Manual targeting only
    projectileSpeed: 20,  // Hexes per second (faster projectiles!)
  },

  // Update rates (milliseconds)
  updates: {
    gameLoopTick: 50,  // Main game loop (faster updates = smoother)
    clientBroadcast: 50,  // How often to send updates to clients
  }
};

module.exports = GameConfig;
