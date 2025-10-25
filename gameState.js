const HexGrid = require('./hexGrid');
const GameConfig = require('./config');

/**
 * Game State Manager
 * Manages all players, landmarks, towers, and game mechanics
 */
class GameState {
  constructor() {
    this.hexGrid = new HexGrid(GameConfig.map.radius);
    this.players = new Map(); // playerId -> player object
    this.landmarks = new Map(); // landmarkId -> landmark object
    this.towers = new Map(); // towerId -> tower object
    this.bases = new Map(); // baseId -> base object (team bases)
    this.projectiles = []; // Active projectiles
    this.nextLandmarkId = 1;
    this.nextTowerId = 1;
    this.nextBaseId = 1;
    this.nextProjectileId = 1;
    this.gameOver = false;
    this.winner = null;
    
    // Fixed timestep tracking
    this.gameTick = 0; // Current game tick number
    this.tickDeltaMs = GameConfig.updates.gameLoopTick; // Milliseconds per tick (50ms = 20 ticks/sec)
    
    this.config = GameConfig;
    
    this.initializeBases();
    this.initializeLandmarks();
    this.startGameLoop();
  }

  /**
   * Initialize team bases in starting zones
   */
  initializeBases() {
    const zones = this.config.map.startingZones;
    const baseCfg = this.config.bases;
    
    // Create green base (center of green zone)
    const greenZone = zones.green.spawnArea;
    const greenBase = {
      id: 'base-green',
      team: 'green',
      position: {
        q: Math.floor((greenZone.qMin + greenZone.qMax) / 2),
        r: Math.floor((greenZone.rMin + greenZone.rMax) / 2)
      },
      hp: baseCfg.maxHp,
      maxHp: baseCfg.maxHp,
      attackRange: baseCfg.attackRange,
      damage: baseCfg.damage,
      attackSpeed: baseCfg.attackSpeed,
      visionRange: baseCfg.visionRange,
      target: null,
      lastAttackTick: 0,
      isDestroyed: false
    };
    this.bases.set(greenBase.id, greenBase);
    
    // Create blue base (center of blue zone)
    const blueZone = zones.blue.spawnArea;
    const blueBase = {
      id: 'base-blue',
      team: 'blue',
      position: {
        q: Math.floor((blueZone.qMin + blueZone.qMax) / 2),
        r: Math.floor((blueZone.rMin + blueZone.rMax) / 2)
      },
      hp: baseCfg.maxHp,
      maxHp: baseCfg.maxHp,
      attackRange: baseCfg.attackRange,
      damage: baseCfg.damage,
      attackSpeed: baseCfg.attackSpeed,
      visionRange: baseCfg.visionRange,
      target: null,
      lastAttackTick: 0,
      isDestroyed: false
    };
    this.bases.set(blueBase.id, blueBase);
    
    console.log(`Initialized bases: Green at (${greenBase.position.q},${greenBase.position.r}), Blue at (${blueBase.position.q},${blueBase.position.r})`);
  }

  /**
   * Initialize landmarks with oil deposits and defensive towers
   */
  initializeLandmarks() {
    const cfg = this.config.landmarks;
    
    // Place single oil rig at center of map
    const landmark = {
      id: this.nextLandmarkId++,
      position: { q: 0, r: 0 }, // Center of map
      oil: 0,
      maxOil: cfg.maxOil,
      regenerationRate: cfg.regenerationRate,
      capturingPlayer: null,
      captureProgress: 0,
      towers: [] // IDs of towers defending this landmark
    };
    
    this.landmarks.set(landmark.id, landmark);
    
    // Create defensive towers around this landmark
    this.createTowersForLandmark(landmark);
    
    console.log(`Initialized central oil rig at (0,0) with ${this.config.towers.perLandmark} towers`);
  }

  /**
   * Check if position is outside all starting zones (safe areas)
   */
  isPositionOutsideStartingZones(position) {
    const zones = this.config.map.startingZones;
    const safeRadius = 5; // 5 hex buffer zone
    
    for (const zoneName in zones) {
      const zone = zones[zoneName];
      const { rMin, rMax } = zone.spawnArea;
      
      // For bottom zone (green, positive r), check if within buffer above the zone
      // For top zone (blue, negative r), check if within buffer below the zone
      if (rMin > 0) {
        // Bottom zone - check r values above it (smaller r values)
        if (position.r >= rMin - safeRadius && position.r <= rMax) {
          return false;
        }
      } else {
        // Top zone - check r values below it (larger r values)
        if (position.r <= rMax + safeRadius && position.r >= rMin) {
          return false;
        }
      }
    }
    
    return true;
  }

  /**
   * Create defensive towers around a landmark
   */
  createTowersForLandmark(landmark) {
    const cfg = this.config.towers;
    const towersToCreate = cfg.perLandmark;
    
    for (let i = 0; i < towersToCreate; i++) {
      // Place towers in a circle around the landmark
      const angle = (Math.PI * 2 / towersToCreate) * i;
      const distance = cfg.placementRadius;
      
      // Calculate offset hex position
      const offsetQ = Math.round(Math.cos(angle) * distance);
      const offsetR = Math.round(Math.sin(angle) * distance);
      
      const towerPosition = {
        q: landmark.position.q + offsetQ,
        r: landmark.position.r + offsetR
      };
      
      // Ensure tower is on valid hex and outside starting zones
      if (!this.hexGrid.isValidHex(towerPosition) || !this.isPositionOutsideStartingZones(towerPosition)) {
        continue;
      }
      
      const tower = {
        id: this.nextTowerId++,
        position: towerPosition,
        landmarkId: landmark.id,
        hp: cfg.maxHp,
        maxHp: cfg.maxHp,
        attackRange: cfg.attackRange,
        damage: cfg.damage,
        attackSpeed: cfg.attackSpeed,
        visionRange: cfg.visionRange,
        target: null,
        lastAttackTick: 0,
        isDestroyed: false
      };
      
      this.towers.set(tower.id, tower);
      landmark.towers.push(tower.id);
    }
  }

  /**
   * Add a new player to the game
   */
  addPlayer(playerId, username, team = 'green') {
    const zone = this.config.map.startingZones[team];
    if (!zone) {
      team = 'green'; // Default to green if invalid team
    }
    
    const spawnPosition = this.getRandomSpawnPosition(team);
    const cfg = this.config.player;
    
    const player = {
      id: playerId,
      username: username || `Player${playerId.substring(0, 6)}`,
      team: team,
      position: spawnPosition,
      destination: null,
      movementProgress: 0, // 0 to 1, represents progress to next hex
      path: [], // Array of hex coordinates to follow
      energy: cfg.startingEnergy,
      hp: cfg.startingHp,
      maxHp: cfg.maxHp,
      attackRange: cfg.attackRange,
      damage: cfg.damage,
      attackSpeed: cfg.attackSpeed,
      visionRange: cfg.visionRange,
      target: null,
      targetedTower: null, // Manually selected tower target
      lastAttackTime: 0,
      isDead: false,
      respawnTime: 0,
      respawnTick: 0, // Game tick when player can respawn
      weapons: {
        laser: {
          available: true,
          lastFiredTick: 0,
          cooldownRemaining: 0
        },
        lrm: {
          available: true,
          lastFiredTick: 0,
          cooldownRemaining: 0
        }
      },
      color: this.getTeamColor(team)
    };
    
    this.players.set(playerId, player);
    return player;
  }

  /**
   * Get a random spawn position within a team's starting zone
   */
  getRandomSpawnPosition(team) {
    const zone = this.config.map.startingZones[team];
    if (!zone) return { q: 0, r: 0 };
    
    const { qMin, qMax, rMin, rMax } = zone.spawnArea;
    
    let position;
    let attempts = 0;
    do {
      const q = Math.floor(Math.random() * (qMax - qMin + 1)) + qMin;
      const r = Math.floor(Math.random() * (rMax - rMin + 1)) + rMin;
      position = { q, r };
      attempts++;
    } while (!this.hexGrid.isValidHex(position) && attempts < 50);
    
    return position;
  }

  /**
   * Get color based on team
   */
  getTeamColor(team) {
    const colors = {
      green: '#00ff00',
      blue: '#4ECDC4'
    };
    return colors[team] || '#00ff00';
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
   * Set player's targeted tower
   */
  setPlayerTarget(playerId, towerId) {
    const player = this.players.get(playerId);
    if (!player) return false;
    
    player.targetedTower = towerId;
    return true;
  }

  /**
   * Fire laser at targeted structure
   */
  fireLaser(playerId) {
    const player = this.players.get(playerId);
    if (!player) return { success: false, message: 'Player not found' };
    
    const laserConfig = this.config.weapons.laser;
    
    // Check if laser is available
    if (!player.weapons.laser.available) {
      return { success: false, message: 'Laser on cooldown' };
    }
    
    // Check if player has a target (tower or base)
    if (!player.targetedTower) {
      return { success: false, message: 'No target selected' };
    }
    
    // Check if target is a tower
    let target = this.towers.get(player.targetedTower);
    let targetType = 'tower';
    
    // If not a tower, check if it's a base
    if (!target || target.isDestroyed) {
      target = this.bases.get(player.targetedTower);
      targetType = 'base';
    }
    
    if (!target || target.isDestroyed) {
      player.targetedTower = null;
      return { success: false, message: 'Target destroyed' };
    }
    
    // Don't allow shooting own base
    if (targetType === 'base' && target.team === player.team) {
      return { success: false, message: 'Cannot target own base' };
    }
    
    // Check range
    const distance = this.hexGrid.distance(player.position, target.position);
    if (distance > laserConfig.range) {
      return { success: false, message: 'Target out of range' };
    }
    
    // Fire Laser!
    target.hp -= laserConfig.damage;
    this.createProjectile(player.position, target.position, player.color, false);
    
    if (target.hp <= 0) {
      target.isDestroyed = true;
      target.hp = 0;
      player.targetedTower = null;
      
      if (targetType === 'base') {
        this.gameOver = true;
        this.winner = player.team;
        console.log(`╔═══════════════════════════════════╗`);
        console.log(`║  GAME OVER! ${player.team.toUpperCase()} TEAM WINS!  ║`);
        console.log(`║  ${target.team.toUpperCase()} base destroyed by ${player.username}'s Laser  ║`);
        console.log(`╚═══════════════════════════════════╝`);
      } else {
        console.log(`Tower ${target.id} destroyed by ${player.username}'s Laser`);
      }
    }
    
    // Start cooldown (convert seconds to ticks: cooldown_seconds * 1000ms / tickDeltaMs)
    const cooldownTicks = Math.ceil((laserConfig.cooldown * 1000) / this.tickDeltaMs);
    player.weapons.laser.available = false;
    player.weapons.laser.lastFiredTick = this.gameTick;
    player.weapons.laser.cooldownRemaining = laserConfig.cooldown * 1000; // For client display
    
    return { success: true, message: 'Laser fired!' };
  }

  /**
   * Fire LRM at targeted tower
   */
  fireLRM(playerId) {
    const player = this.players.get(playerId);
    if (!player) return { success: false, message: 'Player not found' };
    
    const lrmConfig = this.config.weapons.lrm;
    
    // Check if LRM is available
    if (!player.weapons.lrm.available) {
      return { success: false, message: 'LRM on cooldown' };
    }
    
    // Check if player has a target (tower or base)
    if (!player.targetedTower) {
      return { success: false, message: 'No target selected' };
    }
    
    // Check if target is a tower
    let target = this.towers.get(player.targetedTower);
    let targetType = 'tower';
    
    // If not a tower, check if it's a base
    if (!target || target.isDestroyed) {
      target = this.bases.get(player.targetedTower);
      targetType = 'base';
    }
    
    if (!target || target.isDestroyed) {
      player.targetedTower = null;
      return { success: false, message: 'Target destroyed' };
    }
    
    // Don't allow shooting own base
    if (targetType === 'base' && target.team === player.team) {
      return { success: false, message: 'Cannot target own base' };
    }
    
    // Check range
    const distance = this.hexGrid.distance(player.position, target.position);
    if (distance > lrmConfig.range) {
      return { success: false, message: 'Target out of range' };
    }
    
    // Fire LRM!
    target.hp -= lrmConfig.damage;
    this.createProjectile(player.position, target.position, '#ffff00', true); // Yellow for LRM
    
    if (target.hp <= 0) {
      target.isDestroyed = true;
      target.hp = 0;
      player.targetedTower = null;
      
      if (targetType === 'base') {
        this.gameOver = true;
        this.winner = player.team;
        console.log(`╔═══════════════════════════════════╗`);
        console.log(`║  GAME OVER! ${player.team.toUpperCase()} TEAM WINS!  ║`);
        console.log(`║  ${target.team.toUpperCase()} base destroyed by ${player.username}'s LRM  ║`);
        console.log(`╚═══════════════════════════════════╝`);
      } else {
        console.log(`Tower ${target.id} destroyed by ${player.username}'s LRM`);
      }
    }
    
    // Start cooldown (convert seconds to ticks)
    const cooldownTicks = Math.ceil((lrmConfig.cooldown * 1000) / this.tickDeltaMs);
    player.weapons.lrm.available = false;
    player.weapons.lrm.lastFiredTick = this.gameTick;
    player.weapons.lrm.cooldownRemaining = lrmConfig.cooldown * 1000; // For client display
    
    return { success: true, message: 'LRM fired!' };
  }

  /**
   * Build a tower at specified position
   */
  buildTower(playerId, position) {
    const player = this.players.get(playerId);
    if (!player) return { success: false, message: 'Player not found' };
    
    const buildCost = this.config.towers.buildCost;
    const buildRadius = this.config.towers.buildRadius;
    
    // Check if player has enough energy
    if (player.energy < buildCost) {
      return { success: false, message: 'Not enough energy' };
    }
    
    // Find player's team base
    const playerBase = Array.from(this.bases.values()).find(b => b.team === player.team);
    
    // Check if within build range (4 hexes from player or base)
    const distFromPlayer = this.hexGrid.distance(player.position, position);
    const distFromBase = playerBase ? this.hexGrid.distance(playerBase.position, position) : Infinity;
    
    if (distFromPlayer > buildRadius && distFromBase > buildRadius) {
      return { success: false, message: 'Too far from player or base' };
    }
    
    // Check if hex is occupied
    const isOccupied = 
      Array.from(this.players.values()).some(p => p.position.q === position.q && p.position.r === position.r) ||
      Array.from(this.towers.values()).some(t => t.position.q === position.q && t.position.r === position.r) ||
      Array.from(this.landmarks.values()).some(l => l.position.q === position.q && l.position.r === position.r) ||
      Array.from(this.bases.values()).some(b => b.position.q === position.q && b.position.r === position.r);
    
    if (isOccupied) {
      return { success: false, message: 'Position occupied' };
    }
    
    // Deduct energy
    player.energy -= buildCost;
    
    // Create tower
    const towerCfg = this.config.towers;
    const tower = {
      id: this.nextTowerId++,
      position: { q: position.q, r: position.r },
      hp: towerCfg.maxHp,
      maxHp: towerCfg.maxHp,
      attackRange: towerCfg.attackRange,
      damage: towerCfg.damage,
      attackSpeed: towerCfg.attackSpeed,
      visionRange: towerCfg.visionRange,
      target: null,
      lastAttackTick: 0,
      isDestroyed: false,
      team: player.team, // Player-built towers belong to team
      builtBy: player.username
    };
    
    this.towers.set(tower.id, tower);
    console.log(`${player.username} built tower ${tower.id} at (${position.q},${position.r}) for ${player.team} team`);
    
    return { success: true, message: 'Tower built!' };
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
  getVisiblePlayers(playerId, visionRange = null) {
    const player = this.players.get(playerId);
    if (!player) return [];

    // If fog of war is disabled, show all players
    if (!this.config.fogOfWar.enabled) {
      const allPlayers = [];
      for (const [id, otherPlayer] of this.players) {
        if (id === playerId) continue;
        
        allPlayers.push({
          id: otherPlayer.id,
          username: otherPlayer.username,
          position: otherPlayer.position,
          color: otherPlayer.color,
          hp: otherPlayer.hp,
          maxHp: otherPlayer.maxHp,
          isDead: otherPlayer.isDead
        });
      }
      return allPlayers;
    }

    // Fog of war enabled - use vision range
    const effectiveRange = visionRange || player.visionRange || this.config.fogOfWar.baseVisionRange;
    const visiblePlayers = [];
    
    for (const [id, otherPlayer] of this.players) {
      if (id === playerId) continue;
      
      const distance = this.hexGrid.distance(player.position, otherPlayer.position);
      if (distance <= effectiveRange) {
        visiblePlayers.push({
          id: otherPlayer.id,
          username: otherPlayer.username,
          position: otherPlayer.position,
          color: otherPlayer.color,
          hp: otherPlayer.hp,
          maxHp: otherPlayer.maxHp,
          isDead: otherPlayer.isDead
        });
      }
    }
    
    return visiblePlayers;
  }

  /**
   * Main game loop - fixed timestep at 50ms (20 ticks/second)
   */
  startGameLoop() {
    setInterval(() => {
      this.gameTick++;
      const deltaTime = this.tickDeltaMs;
      
      // Update all players
      for (const player of this.players.values()) {
        if (!player.isDead) {
          this.updatePlayerMovement(player, deltaTime);
          this.updatePlayerCapture(player, deltaTime);
          this.updatePlayerCombat(player, deltaTime);
        } else {
          this.updatePlayerRespawn(player, deltaTime);
        }
      }
      
      // Update towers
      for (const tower of this.towers.values()) {
        if (!tower.isDestroyed) {
          this.updateTowerCombat(tower, deltaTime);
        }
      }
      
      // Update bases
      for (const base of this.bases.values()) {
        if (!base.isDestroyed) {
          this.updateBaseCombat(base, deltaTime);
        }
      }
      
      // Update landmarks
      for (const landmark of this.landmarks.values()) {
        this.updateLandmark(landmark, deltaTime);
      }
      
      // Update projectiles
      this.updateProjectiles(deltaTime);
    }, this.tickDeltaMs);
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
    const timePerHex = this.config.time.movementTimePerHex * this.config.time.scale;
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
    // Check if player is at max energy
    if (player.energy >= this.config.player.maxEnergy) {
      return; // Stop collecting when at cap
    }
    
    // Check if player is at a landmark
    const landmark = this.getLandmarkAtPosition(player.position);
    
    if (landmark && landmark.oil > 0 && !player.destination) {
      // Player is stationary at an oil deposit
      const captureTime = this.config.landmarks.captureTime * this.config.time.scale;
      const captureDelta = deltaTime / captureTime;
      
      if (landmark.capturingPlayer !== player.id) {
        landmark.capturingPlayer = player.id;
        landmark.captureProgress = 0;
      }
      
      landmark.captureProgress += captureDelta;
      
      // Capture complete
      if (landmark.captureProgress >= 1) {
        const energyGained = Math.min(this.config.landmarks.oilPerCapture, landmark.oil);
        const energyAfterCap = Math.min(this.config.player.maxEnergy, player.energy + energyGained);
        const actualGained = energyAfterCap - player.energy;
        
        player.energy = energyAfterCap;
        landmark.oil -= actualGained;
        landmark.captureProgress = 0;
      }
    }
  }

  /**
   * Update landmark regeneration
   */
  updateLandmark(landmark, deltaTime) {
    if (landmark.oil < landmark.maxOil) {
      const regenTime = this.config.time.scale;
      const regenDelta = (deltaTime / regenTime) * landmark.regenerationRate;
      landmark.oil = Math.min(landmark.maxOil, landmark.oil + regenDelta);
    }
  }

  /**
   * Update player combat - only update weapon cooldowns (manual firing)
   */
  updatePlayerCombat(player, deltaTime) {
    // Update weapon cooldowns based on ticks
    if (!player.weapons.laser.available) {
      const ticksSinceFired = this.gameTick - player.weapons.laser.lastFiredTick;
      const ticksNeeded = Math.ceil((this.config.weapons.laser.cooldown * 1000) / this.tickDeltaMs);
      
      player.weapons.laser.cooldownRemaining = Math.max(0, 
        this.config.weapons.laser.cooldown * 1000 - (ticksSinceFired * this.tickDeltaMs)
      );
      
      if (ticksSinceFired >= ticksNeeded) {
        player.weapons.laser.available = true;
        player.weapons.laser.cooldownRemaining = 0;
      }
    }
    
    if (!player.weapons.lrm.available) {
      const ticksSinceFired = this.gameTick - player.weapons.lrm.lastFiredTick;
      const ticksNeeded = Math.ceil((this.config.weapons.lrm.cooldown * 1000) / this.tickDeltaMs);
      
      player.weapons.lrm.cooldownRemaining = Math.max(0, 
        this.config.weapons.lrm.cooldown * 1000 - (ticksSinceFired * this.tickDeltaMs)
      );
      
      if (ticksSinceFired >= ticksNeeded) {
        player.weapons.lrm.available = true;
        player.weapons.lrm.cooldownRemaining = 0;
      }
    }
  }

  /**
   * Player attacks a tower
   */
  playerAttackTower(player, tower) {
    tower.hp -= player.damage;
    
    // Create projectile for visual effect
    this.createProjectile(player.position, tower.position, player.color);
    
    if (tower.hp <= 0) {
      tower.isDestroyed = true;
      tower.hp = 0;
      console.log(`Tower ${tower.id} destroyed by ${player.username}`);
    }
  }

  /**
   * Player attacks an enemy base - WIN CONDITION
   */
  playerAttackBase(player, base) {
    base.hp -= player.damage;
    
    // Create projectile for visual effect
    this.createProjectile(player.position, base.position, player.color);
    
    if (base.hp <= 0) {
      base.isDestroyed = true;
      base.hp = 0;
      this.gameOver = true;
      this.winner = player.team;
      console.log(`╔═══════════════════════════════════╗`);
      console.log(`║  GAME OVER! ${player.team.toUpperCase()} TEAM WINS!  ║`);
      console.log(`║  ${base.team.toUpperCase()} base destroyed by ${player.username}  ║`);
      console.log(`╚═══════════════════════════════════╝`);
    }
  }

  /**
   * Update base combat - auto-target and shoot at enemy players
   */
  updateBaseCombat(base, deltaTime) {
    // Find enemy players in range
    let closestEnemy = null;
    let closestDistance = Infinity;
    
    for (const player of this.players.values()) {
      if (player.isDead || player.team === base.team) continue; // Don't shoot teammates
      
      const distance = this.hexGrid.distance(base.position, player.position);
      if (distance <= base.attackRange && distance < closestDistance) {
        closestEnemy = player;
        closestDistance = distance;
      }
    }
    
    base.target = closestEnemy ? closestEnemy.id : null;
    
    // Attack if we have a target (tick-based cooldown)
    if (closestEnemy) {
      const ticksSinceLastAttack = this.gameTick - base.lastAttackTick;
      const attackCooldownTicks = Math.ceil(((1 / base.attackSpeed) * this.config.time.scale) / this.tickDeltaMs);
      
      if (ticksSinceLastAttack >= attackCooldownTicks) {
        this.baseAttackPlayer(base, closestEnemy);
        base.lastAttackTick = this.gameTick;
      }
    }
  }

  /**
   * Base attacks an enemy player
   */
  baseAttackPlayer(base, player) {
    player.hp -= base.damage;
    
    // Create projectile for visual effect (team colored)
    const projectileColor = base.team === 'green' ? '#00ff00' : '#4ECDC4';
    this.createProjectile(base.position, player.position, projectileColor);
    
    if (player.hp <= 0) {
      player.isDead = true;
      player.hp = 0;
      player.destination = null;
      player.path = [];
      
      // Calculate respawn time in ticks
      const respawnDelayMs = this.config.player.respawnTime * this.config.time.scale;
      player.respawnTick = this.gameTick + Math.ceil(respawnDelayMs / this.tickDeltaMs);
      
      console.log(`${player.username} was killed by ${base.team} base`);
    }
  }

  /**
   * Update tower combat - auto-target and shoot at players
   */
  updateTowerCombat(tower, deltaTime) {
    // Find players in range
    let closestPlayer = null;
    let closestDistance = Infinity;
    
    for (const player of this.players.values()) {
      if (player.isDead) continue;
      
      // Check team allegiance
      // Neutral towers (no team property) attack everyone
      // Team towers only attack enemy players
      if (tower.team) {
        // This is a team tower - only attack enemies
        if (player.team === tower.team) {
          continue; // Don't attack teammates
        }
      }
      
      const distance = this.hexGrid.distance(tower.position, player.position);
      if (distance <= tower.attackRange && distance < closestDistance) {
        closestPlayer = player;
        closestDistance = distance;
      }
    }
    
    tower.target = closestPlayer ? closestPlayer.id : null;
    
    // Attack if we have a target (tick-based cooldown)
    if (closestPlayer) {
      const ticksSinceLastAttack = this.gameTick - tower.lastAttackTick;
      const attackCooldownTicks = Math.ceil(((1 / tower.attackSpeed) * this.config.time.scale) / this.tickDeltaMs);
      
      if (ticksSinceLastAttack >= attackCooldownTicks) {
        this.towerAttackPlayer(tower, closestPlayer);
        tower.lastAttackTick = this.gameTick;
      }
    }
  }

  /**
   * Tower attacks a player
   */
  towerAttackPlayer(tower, player) {
    player.hp -= tower.damage;
    
    // Create projectile for visual effect (match tower team color)
    let projectileColor = '#ff0000'; // Neutral red
    if (tower.team === 'green') projectileColor = '#00ff00';
    else if (tower.team === 'blue') projectileColor = '#4ECDC4';
    
    this.createProjectile(tower.position, player.position, projectileColor);
    
    if (player.hp <= 0) {
      player.isDead = true;
      player.hp = 0;
      player.destination = null;
      player.path = [];
      
      // Calculate respawn time in ticks
      const respawnDelayMs = this.config.player.respawnTime * this.config.time.scale;
      player.respawnTick = this.gameTick + Math.ceil(respawnDelayMs / this.tickDeltaMs);
      
      const towerType = tower.team ? `${tower.team} tower ${tower.id}` : `neutral tower ${tower.id}`;
      console.log(`${player.username} was killed by ${towerType}`);
    }
  }

  /**
   * Handle player respawn
   */
  updatePlayerRespawn(player, deltaTime) {
    if (this.gameTick >= player.respawnTick) {
      player.isDead = false;
      player.hp = player.maxHp;
      // Respawn in team's starting zone
      player.position = this.getRandomSpawnPosition(player.team);
      player.destination = null;
      player.path = [];
      player.movementProgress = 0;
      console.log(`${player.username} respawned in ${player.team} zone at (${player.position.q},${player.position.r})`);
    }
  }

  /**
   * Create a projectile for visual effects
   */
  createProjectile(from, to, color, isLRM = false) {
    this.projectiles.push({
      id: this.nextProjectileId++,
      from: { ...from },
      to: { ...to },
      color: color,
      isLRM: isLRM,
      createdAtTick: this.gameTick,
      lifetime: isLRM ? 800 : 300 // LRMs travel slower/longer (in ms)
    });
  }

  /**
   * Update and clean up projectiles
   */
  updateProjectiles(deltaTime) {
    // Remove projectiles that have exceeded their lifetime (tick-based)
    this.projectiles = this.projectiles.filter(p => {
      const ticksAlive = this.gameTick - p.createdAtTick;
      const msAlive = ticksAlive * this.tickDeltaMs;
      return msAlive < p.lifetime;
    });
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
        team: player.team,
        position: player.position,
        destination: player.destination,
        energy: Math.floor(player.energy),
        hp: Math.floor(player.hp),
        maxHp: player.maxHp,
        isDead: player.isDead,
        target: player.target,
        targetedTower: player.targetedTower,
        weapons: player.weapons,
        color: player.color
      },
      landmarks: this.getLandmarks().map(l => ({
        id: l.id,
        position: l.position,
        oil: Math.floor(l.oil),
        maxOil: l.maxOil,
        capturingPlayer: l.capturingPlayer,
        captureProgress: l.captureProgress,
        towers: l.towers
      })),
      towers: Array.from(this.towers.values()).map(t => ({
        id: t.id,
        position: t.position,
        landmarkId: t.landmarkId,
        hp: Math.floor(t.hp),
        maxHp: t.maxHp,
        isDestroyed: t.isDestroyed,
        target: t.target,
        team: t.team // Include team for rendering
      })),
      bases: Array.from(this.bases.values()).map(b => ({
        id: b.id,
        team: b.team,
        position: b.position,
        hp: Math.floor(b.hp),
        maxHp: b.maxHp,
        isDestroyed: b.isDestroyed,
        target: b.target
      })),
      gameOver: this.gameOver,
      winner: this.winner,
      visiblePlayers: this.getVisiblePlayers(playerId),
      projectiles: this.projectiles.map(p => ({
        ...p,
        createdAt: Date.now() - ((this.gameTick - p.createdAtTick) * this.tickDeltaMs) // Convert tick to timestamp for client
      }))
    };
  }

  /**
   * Reset the game state for a new match
   */
  resetGame() {
    console.log('Resetting game...');
    
    // Clear all entities
    this.landmarks.clear();
    this.towers.clear();
    this.bases.clear();
    this.projectiles = [];
    
    // Reset IDs
    this.nextLandmarkId = 1;
    this.nextTowerId = 1;
    this.nextBaseId = 1;
    this.nextProjectileId = 1;
    
    // Reset game state
    this.gameOver = false;
    this.winner = null;
    
    // Reset all players
    for (const player of this.players.values()) {
      player.hp = this.config.player.startingHp;
      player.energy = this.config.player.startingEnergy;
      player.isDead = false;
      player.position = this.getRandomSpawnPosition(player.team);
      player.destination = null;
      player.path = [];
      player.target = null;
      player.targetedTower = null;
      player.weapons.laser.available = true;
      player.weapons.laser.lastFired = 0;
      player.weapons.laser.cooldownRemaining = 0;
      player.weapons.lrm.available = true;
      player.weapons.lrm.lastFired = 0;
      player.weapons.lrm.cooldownRemaining = 0;
    }
    
    // Reinitialize map
    this.initializeBases();
    this.initializeLandmarks();
    
    console.log('Game reset complete!');
  }
}

module.exports = GameState;
