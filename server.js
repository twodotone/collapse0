const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');
const GameState = require('./gameState');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

const PORT = process.env.PORT || 3000;

// Initialize game state
const gameState = new GameState();

// Serve static files
app.use(express.static('public'));

// Main route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);

  // Handle player join
  socket.on('join', (data) => {
    const username = typeof data === 'string' ? data : data.username;
    const team = typeof data === 'object' ? data.team : 'green';
    
    const player = gameState.addPlayer(socket.id, username, team);
    console.log(`${player.username} joined the ${team} team`);

    // Send initial game state to the new player
    socket.emit('init', gameState.getGameStateForPlayer(socket.id));

    // Notify other players (they'll see this player if in range)
    socket.broadcast.emit('playerJoined', {
      id: player.id,
      username: player.username
    });
  });

  // Handle movement commands
  socket.on('moveTo', (destination) => {
    const success = gameState.setPlayerDestination(socket.id, destination);
    
    if (success) {
      // Confirm movement to player
      socket.emit('moveConfirmed', destination);
    } else {
      socket.emit('moveError', 'Invalid destination');
    }
  });

  // Handle tower targeting
  socket.on('targetTower', (towerId) => {
    gameState.setPlayerTarget(socket.id, towerId);
  });

  // Handle LRM firing
  socket.on('fireLRM', () => {
    const result = gameState.fireLRM(socket.id);
    socket.emit('lrmResult', result);
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    const player = gameState.getPlayer(socket.id);
    if (player) {
      console.log(`${player.username} disconnected`);
      gameState.removePlayer(socket.id);
      
      // Notify other players
      socket.broadcast.emit('playerLeft', socket.id);
    }
  });
});

// Broadcast game state updates to all players
setInterval(() => {
  for (const [playerId] of gameState.players) {
    const state = gameState.getGameStateForPlayer(playerId);
    io.to(playerId).emit('gameUpdate', state);
  }
}, gameState.config.updates.clientBroadcast); // Use config value

// Start server
server.listen(PORT, () => {
  console.log(`
  ╔════════════════════════════════════════╗
  ║      COLLAPSE 0 - Server Running       ║
  ╠════════════════════════════════════════╣
  ║  Port: ${PORT}                            ║
  ║  Mode: BASE ASSAULT                    ║
  ║  Oil Rigs: 1 (center, 3 towers)        ║
  ║  Win: Destroy enemy base (20 HP)       ║
  ╚════════════════════════════════════════╝
  
  Server ready at http://localhost:${PORT}
  `);
});
