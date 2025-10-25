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
  socket.on('join', (username) => {
    const player = gameState.addPlayer(socket.id, username);
    console.log(`${player.username} joined the game`);

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
}, 100); // Update every 100ms

// Start server
server.listen(PORT, () => {
  console.log(`
  ╔════════════════════════════════════════╗
  ║      COLLAPSE 0 - Server Running       ║
  ╠════════════════════════════════════════╣
  ║  Port: ${PORT}                            ║
  ║  Time Scale: 1 hour = 5 seconds        ║
  ║  Map Size: 50x50 hexes                 ║
  ╚════════════════════════════════════════╝
  
  Server ready at http://localhost:${PORT}
  `);
});
