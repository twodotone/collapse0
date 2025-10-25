// Game Client
const socket = io();

// Game state
let gameState = null;
let canvas, ctx;
let camera = { x: 0, y: 0, zoom: 1 };
let isDragging = false;
let lastMousePos = { x: 0, y: 0 };
let hoveredHex = null;
let screenShake = { x: 0, y: 0, intensity: 0 };
let lastPlayerHp = 100;

// Hex rendering constants
const HEX_SIZE = 25;
const HEX_WIDTH = Math.sqrt(3) * HEX_SIZE;
const HEX_HEIGHT = 2 * HEX_SIZE;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    setupLogin();
    setupCanvas();
    setupSocketListeners();
});

function setupLogin() {
    const usernameInput = document.getElementById('username-input');
    const joinButton = document.getElementById('join-button');
    const teamButtons = document.querySelectorAll('.team-button');
    
    let selectedTeam = null;
    
    // Handle team selection
    teamButtons.forEach(button => {
        button.addEventListener('click', () => {
            teamButtons.forEach(b => b.classList.remove('selected'));
            button.classList.add('selected');
            selectedTeam = button.getAttribute('data-team');
            
            // Enable join button if username is entered
            if (usernameInput.value.trim()) {
                joinButton.disabled = false;
            }
        });
    });
    
    // Enable/disable join button based on username
    usernameInput.addEventListener('input', () => {
        if (usernameInput.value.trim() && selectedTeam) {
            joinButton.disabled = false;
        } else {
            joinButton.disabled = true;
        }
    });

    joinButton.addEventListener('click', () => {
        const username = usernameInput.value.trim() || 'Survivor';
        if (!selectedTeam) {
            alert('Please select a team first!');
            return;
        }
        socket.emit('join', { username, team: selectedTeam });
    });

    usernameInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !joinButton.disabled) {
            joinButton.click();
        }
    });

    usernameInput.focus();
}

function setupCanvas() {
    canvas = document.getElementById('game-canvas');
    ctx = canvas.getContext('2d');

    // Set canvas size
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Mouse controls
    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseup', handleMouseUp);
    canvas.addEventListener('wheel', handleWheel);
    canvas.addEventListener('click', handleClick);
    canvas.addEventListener('contextmenu', handleRightClick); // Right-click for targeting
    
    // Keyboard controls
    document.addEventListener('keydown', handleKeyDown);
}

function resizeCanvas() {
    const container = document.getElementById('canvas-container');
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
    
    if (gameState) {
        render();
    }
}

function setupSocketListeners() {
    socket.on('init', (state) => {
        console.log('Game initialized', state);
        gameState = state;
        
        // Hide login, show game
        document.getElementById('login-screen').style.display = 'none';
        document.getElementById('game-container').style.display = 'block';
        document.getElementById('weapon-bar').style.display = 'flex';
        
        // Resize canvas to ensure proper dimensions
        resizeCanvas();
        
        // Center camera on player
        if (gameState.player) {
            const pos = hexToPixel(gameState.player.position);
            camera.x = canvas.width / 2 - pos.x;
            camera.y = canvas.height / 2 - pos.y;
            console.log('Camera centered on player at', gameState.player.position, 'pixel pos:', pos, 'camera:', camera);
        }
        
        updateHUD();
        render();
        
        console.log('Rendering complete. Canvas size:', canvas.width, 'x', canvas.height);
    });

    socket.on('gameUpdate', (state) => {
        gameState = state;
        
        // Check for game over (only show once)
        if (gameState.gameOver && !document.getElementById('game-over-overlay')) {
            showGameOver(gameState.winner);
            return;
        }
        
        // Screen shake when taking damage
        if (gameState.player && lastPlayerHp > gameState.player.hp) {
            triggerScreenShake(3);
        }
        lastPlayerHp = gameState.player ? gameState.player.hp : 100;
        
        updateHUD();
        render();
    });

    socket.on('moveConfirmed', (destination) => {
        console.log('Movement confirmed to', destination);
    });

    socket.on('moveError', (error) => {
        console.error('Movement error:', error);
    });

    socket.on('lrmResult', (result) => {
        if (!result.success) {
            console.log('LRM: ' + result.message);
        }
    });

    socket.on('laserResult', (result) => {
        if (!result.success) {
            console.log('Laser: ' + result.message);
        }
    });

    socket.on('gameReset', () => {
        console.log('Game has been reset - returning to login');
        // Disconnect and reload to show login screen
        socket.disconnect();
        location.reload();
    });
}

function updateHUD() {
    if (!gameState || !gameState.player) return;

    document.getElementById('hud-username').textContent = gameState.player.username;
    
    // Display team with colored text
    const teamElement = document.getElementById('hud-team');
    const teamName = gameState.player.team ? gameState.player.team.toUpperCase() : 'NONE';
    teamElement.textContent = teamName;
    if (gameState.player.team === 'green') {
        teamElement.style.color = '#00ff00';
    } else if (gameState.player.team === 'blue') {
        teamElement.style.color = '#4ECDC4';
    }
    
    document.getElementById('hud-energy').textContent = `${gameState.player.energy}/100`;
    document.getElementById('hud-hp').textContent = `${gameState.player.hp}/${gameState.player.maxHp}`;
    document.getElementById('hud-position').textContent = 
        `${gameState.player.position.q}, ${gameState.player.position.r}`;
    
    // Update HP color based on health
    const hpElement = document.getElementById('hud-hp');
    const hpPercent = gameState.player.hp / gameState.player.maxHp;
    if (hpPercent > 0.6) {
        hpElement.style.color = '#00ff00';
    } else if (hpPercent > 0.3) {
        hpElement.style.color = '#ffa500';
    } else {
        hpElement.style.color = '#ff0000';
    }
    
    let status = 'IDLE';
    if (gameState.player.isDead) {
        status = 'DEAD - RESPAWNING';
    } else if (gameState.player.energy >= 100) {
        status = 'ENERGY FULL';
    } else if (gameState.player.destination) {
        status = 'MOVING';
    } else if (gameState.player.target) {
        status = 'COMBAT';
    }
    
    document.getElementById('hud-status').textContent = status;
    document.getElementById('hud-status').style.color = 
        gameState.player.isDead ? '#ff0000' :
        gameState.player.energy >= 100 ? '#00ff00' :
        gameState.player.destination ? '#ffd700' : 
        gameState.player.target ? '#ff6b6b' : '#00ff00';
    
    // Update weapon cooldowns
    updateWeaponUI();
}

function updateWeaponUI() {
    if (!gameState || !gameState.player || !gameState.player.weapons) return;
    
    // Update LRM
    const lrmSlot = document.getElementById('weapon-lrm');
    const lrmProgress = document.getElementById('lrm-cooldown-progress');
    const lrmWeapon = gameState.player.weapons.lrm;
    
    if (lrmWeapon.available) {
        lrmSlot.classList.remove('cooldown');
        lrmSlot.classList.add('ready');
        lrmProgress.style.width = '100%';
    } else {
        lrmSlot.classList.add('cooldown');
        lrmSlot.classList.remove('ready');
        const progress = Math.max(0, (30000 - lrmWeapon.cooldownRemaining) / 30000 * 100);
        lrmProgress.style.width = progress + '%';
    }
    
    // Update Laser
    const laserSlot = document.getElementById('weapon-laser');
    const laserProgress = document.getElementById('laser-cooldown-progress');
    const laserWeapon = gameState.player.weapons.laser;
    
    if (laserWeapon.available) {
        laserSlot.classList.remove('cooldown');
        laserSlot.classList.add('ready');
        laserProgress.style.width = '100%';
    } else {
        laserSlot.classList.add('cooldown');
        laserSlot.classList.remove('ready');
        const progress = Math.max(0, (7000 - laserWeapon.cooldownRemaining) / 7000 * 100);
        laserProgress.style.width = progress + '%';
    }
}

// Hex coordinate conversion
function hexToPixel(hex) {
    const x = HEX_SIZE * (Math.sqrt(3) * hex.q + Math.sqrt(3) / 2 * hex.r);
    const y = HEX_SIZE * (3 / 2 * hex.r);
    return { x, y };
}

// Helper function to scale line width with zoom
function scaledLineWidth(baseWidth) {
    return Math.max(0.5, baseWidth / camera.zoom);
}

function pixelToHex(x, y) {
    // Apply camera transform
    x = (x - camera.x) / camera.zoom;
    y = (y - camera.y) / camera.zoom;
    
    const q = (Math.sqrt(3) / 3 * x - 1 / 3 * y) / HEX_SIZE;
    const r = (2 / 3 * y) / HEX_SIZE;
    
    return hexRound({ q, r });
}

function hexRound(hex) {
    let q = Math.round(hex.q);
    let r = Math.round(hex.r);
    let s = Math.round(-hex.q - hex.r);
    
    const qDiff = Math.abs(q - hex.q);
    const rDiff = Math.abs(r - hex.r);
    const sDiff = Math.abs(s - (-hex.q - hex.r));
    
    if (qDiff > rDiff && qDiff > sDiff) {
        q = -r - s;
    } else if (rDiff > sDiff) {
        r = -q - s;
    }
    
    return { q, r };
}

// Mouse handling
function handleMouseDown(e) {
    isDragging = true;
    lastMousePos = { x: e.clientX, y: e.clientY };
    canvas.style.cursor = 'grabbing';
}

function handleMouseMove(e) {
    if (isDragging) {
        const dx = e.clientX - lastMousePos.x;
        const dy = e.clientY - lastMousePos.y;
        
        camera.x += dx;
        camera.y += dy;
        
        lastMousePos = { x: e.clientX, y: e.clientY };
        render();
    } else {
        // Update hovered hex
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        hoveredHex = pixelToHex(mouseX, mouseY);
        render();
    }
}

function handleMouseUp(e) {
    isDragging = false;
    canvas.style.cursor = 'crosshair';
}

function handleWheel(e) {
    e.preventDefault();
    
    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.max(0.3, Math.min(3, camera.zoom * zoomFactor));
    
    // Zoom towards mouse position
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    camera.x = mouseX - (mouseX - camera.x) * (newZoom / camera.zoom);
    camera.y = mouseY - (mouseY - camera.y) * (newZoom / camera.zoom);
    camera.zoom = newZoom;
    
    render();
}

function handleClick(e) {
    if (!gameState || !gameState.player) return;
    
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const hex = pixelToHex(mouseX, mouseY);
    
    console.log('Clicked hex:', hex);
    socket.emit('moveTo', hex);
}

function handleRightClick(e) {
    e.preventDefault();
    if (!gameState || !gameState.player) return;
    
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const hex = pixelToHex(mouseX, mouseY);
    
    // Check if clicked on a tower
    if (gameState.towers) {
        for (const tower of gameState.towers) {
            if (tower.position.q === hex.q && tower.position.r === hex.r && !tower.isDestroyed) {
                console.log('Targeted tower:', tower.id);
                socket.emit('targetTower', tower.id);
                return;
            }
        }
    }
    
    // Check if clicked on a base
    if (gameState.bases) {
        for (const base of gameState.bases) {
            if (base.position.q === hex.q && base.position.r === hex.r && !base.isDestroyed) {
                // Don't allow targeting own base
                if (base.team === gameState.player.team) {
                    console.log('Cannot target own base');
                    return;
                }
                console.log('Targeted enemy base:', base.id);
                socket.emit('targetTower', base.id);
                return;
            }
        }
    }
    
    // Clear target if clicked elsewhere
    socket.emit('targetTower', null);
}

function handleKeyDown(e) {
    if (!gameState || !gameState.player) return;
    
    // LRM hotkey
    if (e.key === '1') {
        socket.emit('fireLRM');
    }
    
    // Laser hotkey
    if (e.key === '2') {
        socket.emit('fireLaser');
    }
}

// Rendering
function render() {
    if (!gameState) {
        console.log('No game state, skipping render');
        return;
    }
    
    // Update screen shake
    if (screenShake.intensity > 0) {
        screenShake.x = (Math.random() - 0.5) * screenShake.intensity;
        screenShake.y = (Math.random() - 0.5) * screenShake.intensity;
        screenShake.intensity *= 0.9; // Decay
        if (screenShake.intensity < 0.1) {
            screenShake.intensity = 0;
            screenShake.x = 0;
            screenShake.y = 0;
        }
    }
    
    // Clear
    ctx.fillStyle = '#0f0f0f';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.save();
    ctx.translate(camera.x + screenShake.x, camera.y + screenShake.y);
    ctx.scale(camera.zoom, camera.zoom);
    
    // Draw hex grid (only visible area)
    drawHexGrid();
    
    // Draw landmarks
    if (gameState.landmarks) {
        gameState.landmarks.forEach(landmark => drawLandmark(landmark));
    }
    
    // Draw bases
    if (gameState.bases) {
        gameState.bases.forEach(base => drawBase(base));
    }
    
    // Draw towers
    if (gameState.towers) {
        gameState.towers.forEach(tower => drawTower(tower));
    }
    
    // Draw projectiles
    if (gameState.projectiles) {
        gameState.projectiles.forEach(projectile => drawProjectile(projectile));
    }
    
    // Draw visible players
    if (gameState.visiblePlayers) {
        gameState.visiblePlayers.forEach(player => drawPlayer(player, false));
    }
    
    // Draw current player
    if (gameState.player && !gameState.player.isDead) {
        drawPlayer(gameState.player, true);
        
        // Draw destination
        if (gameState.player.destination) {
            drawDestination(gameState.player.destination);
        }
    }
    
    // Draw hovered hex
    if (hoveredHex && !isDragging) {
        drawHexOutline(hoveredHex, '#ffffff', 2 / camera.zoom);
    }
    
    ctx.restore();
}

function drawHexGrid() {
    const mapRadius = 10;
    
    // Only draw hexes in visible area for performance
    const viewportPadding = 10;
    const minQ = Math.floor((-camera.x / camera.zoom - canvas.width / 2) / HEX_WIDTH) - viewportPadding;
    const maxQ = Math.ceil((-camera.x / camera.zoom + canvas.width / 2) / HEX_WIDTH) + viewportPadding;
    const minR = Math.floor((-camera.y / camera.zoom - canvas.height / 2) / HEX_HEIGHT) - viewportPadding;
    const maxR = Math.ceil((-camera.y / camera.zoom + canvas.height / 2) / HEX_HEIGHT) + viewportPadding;
    
    // Starting zones config (matching server config)
    const startingZones = {
        green: {
            spawnArea: { qMin: -10, qMax: 10, rMin: 9, rMax: 10 },
            color: 'rgba(0, 255, 0, 0.2)'
        },
        blue: {
            spawnArea: { qMin: -10, qMax: 10, rMin: -10, rMax: -9 },
            color: 'rgba(0, 136, 255, 0.2)'
        }
    };
    
    // Scale line width with zoom
    ctx.strokeStyle = '#2a2a2a';
    ctx.lineWidth = scaledLineWidth(1);
    
    for (let q = Math.max(-mapRadius, minQ); q <= Math.min(mapRadius, maxQ); q++) {
        for (let r = Math.max(-mapRadius, minR); r <= Math.min(mapRadius, maxR); r++) {
            const s = -q - r;
            if (Math.abs(s) <= mapRadius) {
                // Check if hex is in a starting zone
                let zoneColor = null;
                for (const zoneName in startingZones) {
                    const zone = startingZones[zoneName];
                    if (q >= zone.spawnArea.qMin && q <= zone.spawnArea.qMax &&
                        r >= zone.spawnArea.rMin && r <= zone.spawnArea.rMax) {
                        zoneColor = zone.color;
                        break;
                    }
                }
                
                // Draw zone background if in a starting zone
                if (zoneColor) {
                    drawHex({ q, r }, zoneColor, true);
                }
                
                // Draw hex border
                drawHex({ q, r }, ctx.strokeStyle, false);
            }
        }
    }
}

function drawHex(hex, color, fill = false) {
    const pos = hexToPixel(hex);
    const corners = [];
    
    for (let i = 0; i < 6; i++) {
        const angle = Math.PI / 180 * (60 * i + 30);
        corners.push({
            x: pos.x + HEX_SIZE * Math.cos(angle),
            y: pos.y + HEX_SIZE * Math.sin(angle)
        });
    }
    
    ctx.beginPath();
    ctx.moveTo(corners[0].x, corners[0].y);
    for (let i = 1; i < 6; i++) {
        ctx.lineTo(corners[i].x, corners[i].y);
    }
    ctx.closePath();
    
    if (fill) {
        ctx.fillStyle = color;
        ctx.fill();
    } else {
        ctx.strokeStyle = color;
        ctx.stroke();
    }
}

function drawHexOutline(hex, color, lineWidth = 2) {
    const pos = hexToPixel(hex);
    const corners = [];
    
    for (let i = 0; i < 6; i++) {
        const angle = Math.PI / 180 * (60 * i + 30);
        corners.push({
            x: pos.x + HEX_SIZE * Math.cos(angle),
            y: pos.y + HEX_SIZE * Math.sin(angle)
        });
    }
    
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(corners[0].x, corners[0].y);
    for (let i = 1; i < 6; i++) {
        ctx.lineTo(corners[i].x, corners[i].y);
    }
    ctx.closePath();
    
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
    ctx.restore();
}

function drawLandmark(landmark) {
    const pos = hexToPixel(landmark.position);
    
    // Draw hex background
    drawHex(landmark.position, '#3a3a00', true);
    
    // Draw oil indicator
    ctx.fillStyle = '#ffd700';
    ctx.font = `${Math.floor(HEX_SIZE)}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('◆', pos.x, pos.y);
    
    // Draw oil amount
    ctx.fillStyle = '#ffff00';
    ctx.font = `${Math.floor(HEX_SIZE * 0.4)}px monospace`;
    ctx.fillText(Math.floor(landmark.oil), pos.x, pos.y + HEX_SIZE * 0.6);
    
    // Draw capture progress if being captured
    if (landmark.capturingPlayer && landmark.captureProgress > 0) {
        const barWidth = HEX_SIZE * 1.5;
        const barHeight = 4;
        const barX = pos.x - barWidth / 2;
        const barY = pos.y - HEX_SIZE;
        
        ctx.fillStyle = '#333';
        ctx.fillRect(barX, barY, barWidth, barHeight);
        
        ctx.fillStyle = '#00ff00';
        ctx.fillRect(barX, barY, barWidth * landmark.captureProgress, barHeight);
    }
}

function drawPlayer(player, isCurrentPlayer) {
    const pos = hexToPixel(player.position);
    
    // Don't draw dead players
    if (player.isDead) return;
    
    // Draw glow for current player
    if (isCurrentPlayer) {
        ctx.shadowBlur = 15;
        ctx.shadowColor = '#00ff00';
    }
    
    // Draw player dot
    ctx.fillStyle = isCurrentPlayer ? '#00ff00' : player.color;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, HEX_SIZE * 0.5, 0, Math.PI * 2);
    ctx.fill();
    
    // Reset shadow
    ctx.shadowBlur = 0;
    
    // Draw outline
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = scaledLineWidth(2);
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, HEX_SIZE * 0.5, 0, Math.PI * 2);
    ctx.stroke();
    
    // Draw HP bar for everyone now (fog of war disabled)
    const hp = player.hp !== undefined ? player.hp : (player.maxHp || 100);
    const maxHp = player.maxHp || 100;
    drawHPBar(pos, hp, maxHp, HEX_SIZE * 1.5);
    
    // Draw player name
    ctx.fillStyle = isCurrentPlayer ? '#00ff00' : player.color;
    ctx.font = `bold ${Math.floor(HEX_SIZE * 0.5)}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    
    // Draw text background
    const textMetrics = ctx.measureText(player.username);
    const textY = pos.y + HEX_SIZE * 0.7;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(pos.x - textMetrics.width / 2 - 2, textY - 2, textMetrics.width + 4, HEX_SIZE * 0.5 + 4);
    
    // Draw text
    ctx.fillStyle = isCurrentPlayer ? '#00ff00' : player.color;
    ctx.fillText(player.username, pos.x, textY);
}

function drawDestination(destination) {
    const pos = hexToPixel(destination);
    
    // Draw destination marker
    ctx.strokeStyle = '#ff6b6b';
    ctx.lineWidth = scaledLineWidth(3);
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, HEX_SIZE * 0.6, 0, Math.PI * 2);
    ctx.stroke();
    
    // Draw X
    ctx.strokeStyle = '#ff6b6b';
    ctx.lineWidth = scaledLineWidth(2);
    const size = HEX_SIZE * 0.3;
    ctx.beginPath();
    ctx.moveTo(pos.x - size, pos.y - size);
    ctx.lineTo(pos.x + size, pos.y + size);
    ctx.moveTo(pos.x + size, pos.y - size);
    ctx.lineTo(pos.x - size, pos.y + size);
    ctx.stroke();
}

function drawTower(tower) {
    if (tower.isDestroyed) return;
    
    const pos = hexToPixel(tower.position);
    
    // Highlight if this is the targeted tower
    const isTargeted = gameState.player && gameState.player.targetedTower === tower.id;
    
    if (isTargeted) {
        // Draw targeting circle
        ctx.strokeStyle = '#ffff00';
        ctx.lineWidth = scaledLineWidth(3);
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, HEX_SIZE * 1.2, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
    }
    
    // Draw tower base (darker hex)
    drawHex(tower.position, isTargeted ? '#6a4a00' : '#4a0000', true);
    
    // Draw tower triangle
    ctx.fillStyle = isTargeted ? '#ffaa00' : '#ff0000';
    ctx.beginPath();
    const size = HEX_SIZE * 0.6;
    ctx.moveTo(pos.x, pos.y - size);
    ctx.lineTo(pos.x - size * 0.866, pos.y + size * 0.5);
    ctx.lineTo(pos.x + size * 0.866, pos.y + size * 0.5);
    ctx.closePath();
    ctx.fill();
    
    // Draw outline
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = scaledLineWidth(2);
    ctx.stroke();
    
    // Draw HP bar
    drawHPBar(pos, tower.hp, tower.maxHp, HEX_SIZE * 1.5);
    
    // Draw targeting line
    if (tower.target && gameState.player && tower.target === gameState.player.id) {
        const targetPos = hexToPixel(gameState.player.position);
        ctx.strokeStyle = 'rgba(255, 0, 0, 0.3)';
        ctx.lineWidth = scaledLineWidth(2);
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(pos.x, pos.y);
        ctx.lineTo(targetPos.x, targetPos.y);
        ctx.stroke();
        ctx.setLineDash([]);
    }
}

function drawBase(base) {
    if (base.isDestroyed) return;
    
    const pos = hexToPixel(base.position);
    const baseColor = base.team === 'green' ? '#00ff00' : '#4ECDC4';
    const darkColor = base.team === 'green' ? '#006600' : '#1a5a54';
    
    // Highlight if this is the targeted base
    const isTargeted = gameState.player && gameState.player.targetedTower === base.id;
    
    if (isTargeted) {
        // Draw targeting circle
        ctx.strokeStyle = '#ffff00';
        ctx.lineWidth = scaledLineWidth(3);
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, HEX_SIZE * 1.5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
    }
    
    // Draw base platform (larger hex)
    drawHex(base.position, darkColor, true);
    
    // Draw base structure (square)
    const size = HEX_SIZE * 0.7;
    ctx.fillStyle = isTargeted ? '#ffaa00' : baseColor;
    ctx.fillRect(pos.x - size/2, pos.y - size/2, size, size);
    
    // Draw outline
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = scaledLineWidth(3);
    ctx.strokeRect(pos.x - size/2, pos.y - size/2, size, size);
    
    // Draw team symbol in center
    ctx.fillStyle = '#000000';
    ctx.font = `bold ${HEX_SIZE * 0.5}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(base.team === 'green' ? 'G' : 'B', pos.x, pos.y);
    
    // Draw HP bar
    drawHPBar(pos, base.hp, base.maxHp, HEX_SIZE * 1.8);
    
    // Draw targeting line if base is attacking
    if (base.target) {
        const targetPlayer = gameState.visiblePlayers?.find(p => p.id === base.target) ||
                           (gameState.player?.id === base.target ? gameState.player : null);
        if (targetPlayer) {
            const targetPos = hexToPixel(targetPlayer.position);
            ctx.strokeStyle = `rgba(${base.team === 'green' ? '0, 255, 0' : '78, 205, 196'}, 0.3)`;
            ctx.lineWidth = scaledLineWidth(2);
            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            ctx.moveTo(pos.x, pos.y);
            ctx.lineTo(targetPos.x, targetPos.y);
            ctx.stroke();
            ctx.setLineDash([]);
        }
    }
}

function drawProjectile(projectile) {
    const fromPos = hexToPixel(projectile.from);
    const toPos = hexToPixel(projectile.to);
    
    // Calculate progress (0 to 1)
    const now = Date.now();
    const elapsed = now - projectile.createdAt;
    const progress = Math.min(1, elapsed / projectile.lifetime);
    
    // Interpolate position
    const x = fromPos.x + (toPos.x - fromPos.x) * progress;
    const y = fromPos.y + (toPos.y - fromPos.y) * progress;
    
    // LRMs are bigger and more dramatic
    const isLRM = projectile.isLRM;
    const size = isLRM ? HEX_SIZE * 0.3 : HEX_SIZE * 0.2;
    const glowSize = isLRM ? 20 : 15;
    
    // Draw projectile with bigger glow
    ctx.fillStyle = projectile.color;
    ctx.shadowBlur = glowSize;
    ctx.shadowColor = projectile.color;
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    
    // Draw trail
    ctx.strokeStyle = projectile.color;
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = isLRM ? 6 : 4;
    ctx.beginPath();
    ctx.moveTo(fromPos.x, fromPos.y);
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.globalAlpha = 1;
}

function triggerScreenShake(intensity) {
    screenShake.intensity = intensity;
}

function drawHPBar(pos, hp, maxHp, width) {
    const barHeight = 4;
    const barX = pos.x - width / 2;
    const barY = pos.y - HEX_SIZE - 10;
    
    // Background
    ctx.fillStyle = '#333';
    ctx.fillRect(barX, barY, width, barHeight);
    
    // HP
    const hpPercent = hp / maxHp;
    let hpColor = '#00ff00';
    if (hpPercent < 0.3) hpColor = '#ff0000';
    else if (hpPercent < 0.6) hpColor = '#ffa500';
    
    ctx.fillStyle = hpColor;
    ctx.fillRect(barX, barY, width * hpPercent, barHeight);
    
    // Border
    ctx.strokeStyle = '#000';
    ctx.lineWidth = scaledLineWidth(1);
    ctx.strokeRect(barX, barY, width, barHeight);
}

function showGameOver(winner) {
    // Create game over overlay
    const overlay = document.createElement('div');
    overlay.id = 'game-over-overlay';
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.9);
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        z-index: 2000;
    `;
    
    const winnerColor = winner === 'green' ? '#00ff00' : '#4ECDC4';
    const winnerName = winner.toUpperCase();
    
    overlay.innerHTML = `
        <h1 style="font-family: 'Courier New', monospace; font-size: 4em; color: ${winnerColor}; text-shadow: 0 0 20px ${winnerColor}; margin-bottom: 20px;">
            GAME OVER
        </h1>
        <h2 style="font-family: 'Courier New', monospace; font-size: 3em; color: ${winnerColor}; margin-bottom: 40px;">
            ${winnerName} TEAM WINS!
        </h2>
        <p style="font-family: 'Courier New', monospace; font-size: 1.5em; color: #888;">
            Enemy base destroyed
        </p>
        <button id="play-again-btn" style="
            margin-top: 40px;
            background: #ff6b6b;
            border: none;
            color: #0a0a0a;
            padding: 15px 40px;
            font-family: 'Courier New', monospace;
            font-size: 1.5em;
            cursor: pointer;
        ">
            PLAY AGAIN
        </button>
    `;
    
    document.body.appendChild(overlay);
    
    // Add click handler to reset game
    document.getElementById('play-again-btn').addEventListener('click', () => {
        socket.emit('resetGame');
    });
}

// Animation loop
function animate() {
    render();
    requestAnimationFrame(animate);
}

animate();
