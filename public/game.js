// Game Client
const socket = io();

// Game state
let gameState = null;
let canvas, ctx;
let camera = { x: 0, y: 0, zoom: 1 };
let isDragging = false;
let lastMousePos = { x: 0, y: 0 };
let hoveredHex = null;

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

    joinButton.addEventListener('click', () => {
        const username = usernameInput.value.trim() || 'Survivor';
        socket.emit('join', username);
    });

    usernameInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
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
        updateHUD();
        render();
    });

    socket.on('moveConfirmed', (destination) => {
        console.log('Movement confirmed to', destination);
    });

    socket.on('moveError', (error) => {
        console.error('Movement error:', error);
    });
}

function updateHUD() {
    if (!gameState || !gameState.player) return;

    document.getElementById('hud-username').textContent = gameState.player.username;
    document.getElementById('hud-energy').textContent = gameState.player.energy;
    document.getElementById('hud-position').textContent = 
        `${gameState.player.position.q}, ${gameState.player.position.r}`;
    
    const status = gameState.player.destination ? 'MOVING' : 'IDLE';
    document.getElementById('hud-status').textContent = status;
    document.getElementById('hud-status').style.color = 
        gameState.player.destination ? '#ffd700' : '#00ff00';
}

// Hex coordinate conversion
function hexToPixel(hex) {
    const x = HEX_SIZE * (Math.sqrt(3) * hex.q + Math.sqrt(3) / 2 * hex.r);
    const y = HEX_SIZE * (3 / 2 * hex.r);
    return { x, y };
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

// Rendering
function render() {
    if (!gameState) {
        console.log('No game state, skipping render');
        return;
    }
    
    // Clear
    ctx.fillStyle = '#0f0f0f';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.save();
    ctx.translate(camera.x, camera.y);
    ctx.scale(camera.zoom, camera.zoom);
    
    // Draw hex grid (only visible area)
    drawHexGrid();
    
    // Draw landmarks
    if (gameState.landmarks) {
        gameState.landmarks.forEach(landmark => drawLandmark(landmark));
    }
    
    // Draw visible players
    if (gameState.visiblePlayers) {
        gameState.visiblePlayers.forEach(player => drawPlayer(player, false));
    }
    
    // Draw current player
    if (gameState.player) {
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
    const mapRadius = 25;
    
    // Only draw hexes in visible area for performance
    const viewportPadding = 10;
    const minQ = Math.floor((-camera.x / camera.zoom - canvas.width / 2) / HEX_WIDTH) - viewportPadding;
    const maxQ = Math.ceil((-camera.x / camera.zoom + canvas.width / 2) / HEX_WIDTH) + viewportPadding;
    const minR = Math.floor((-camera.y / camera.zoom - canvas.height / 2) / HEX_HEIGHT) - viewportPadding;
    const maxR = Math.ceil((-camera.y / camera.zoom + canvas.height / 2) / HEX_HEIGHT) + viewportPadding;
    
    ctx.strokeStyle = '#2a2a2a';
    ctx.lineWidth = 1 / camera.zoom;
    
    for (let q = Math.max(-mapRadius, minQ); q <= Math.min(mapRadius, maxQ); q++) {
        for (let r = Math.max(-mapRadius, minR); r <= Math.min(mapRadius, maxR); r++) {
            const s = -q - r;
            if (Math.abs(s) <= mapRadius) {
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
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, HEX_SIZE * 0.5, 0, Math.PI * 2);
    ctx.stroke();
    
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
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, HEX_SIZE * 0.6, 0, Math.PI * 2);
    ctx.stroke();
    
    // Draw X
    ctx.strokeStyle = '#ff6b6b';
    ctx.lineWidth = 2;
    const size = HEX_SIZE * 0.3;
    ctx.beginPath();
    ctx.moveTo(pos.x - size, pos.y - size);
    ctx.lineTo(pos.x + size, pos.y + size);
    ctx.moveTo(pos.x + size, pos.y - size);
    ctx.lineTo(pos.x - size, pos.y + size);
    ctx.stroke();
}

// Animation loop
function animate() {
    render();
    requestAnimationFrame(animate);
}

animate();
