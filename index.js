import express from "express";
import { readFileSync } from "fs";
import { createServer as createHTTPSServer } from "https";
import { Server } from "socket.io";
import cors from "cors";
import path from "path";

const app = express();

// Cargar el certificado y la clave
const httpsOptions = {
  key: readFileSync(
    path.join(path.dirname(new URL(import.meta.url).pathname), "server.key")
  ),
  cert: readFileSync(
    path.join(path.dirname(new URL(import.meta.url).pathname), "server.cert")
  ),
};

// Crear servidores HTTP y HTTPS
const httpsServer = createHTTPSServer(httpsOptions, app);

const io = new Server(httpsServer, {
  cors: {
    origin: "*", // Permite solicitudes desde tu aplicación React
    methods: ["GET", "POST"],
  },
});

const PORT_HTTPS = process.env.HTTPS_PORT || 3443;

const usersInRooms = {};

io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);

  socket.on("error", (err) => {
    console.error(`Socket error: ${err}`);
  });
  // Unirse a una sala específica
  socket.on("join", (roomId) => {
    console.log(`Socket ${socket.id} is joining room ${roomId}`);
    socket.join(roomId);
    // Notifica a todos en la sala que alguien se ha unido (incluido el emisor)
    io.in(roomId).emit("room_joined", roomId);
    usersInRooms[roomId] = usersInRooms[roomId] || [];
    usersInRooms[roomId].push({ socketId: socket.id, username: "JohnDoe" });

    // Emitir la lista de usuarios a todos en la sala
    io.to(roomId).emit("usersInRoom", usersInRooms[roomId]);
  });

  // Recibir oferta y retransmitirla a otros en la sala
  socket.on("offer", (offer, roomId) => {
    console.log(`Offer received from ${socket.id} for room ${roomId}`);
    socket.to(roomId).emit("offer", offer); // Envía la oferta a otros en la sala
  });

  // Recibir respuesta y retransmitirla a otros en la sala
  socket.on("answer", (answer, roomId) => {
    console.log(`Answer received from ${socket.id} for room ${roomId}`);
    socket.to(roomId).emit("answer", answer); // Envía la respuesta a otros en la sala
  });

  // Manejo de ICE candidates y transmisión a otros usuarios en la sala
  socket.on("ice-candidate", (candidate, roomId) => {
    console.log(`ICE candidate received from ${socket.id} for room ${roomId}`);
    socket.to(roomId).emit("ice-candidate", candidate); // Envía el candidato ICE a otros en la sala
  });

  // Desconexión del cliente
  socket.on("disconnect", () => {
    console.log(`Client disconnected: ${socket.id}`);

    //remove from usersInRooms
    for (const roomId in usersInRooms) {
      const room = usersInRooms[roomId];
      const userIndex = room.findIndex((user) => user.socketId === socket.id);
      if (userIndex !== -1) {
        room.splice(userIndex, 1);
        io.to(roomId).emit("usersInRoom", usersInRooms[roomId]);
      }
    }
  });
});

app.use(cors());
app.use(express.json());

function error(err, req, res, next) {
  console.error(err.stack);
  res.status(500).send("Internal Server Error");
}

app.use(error);

httpsServer.listen(PORT_HTTPS, () => {
  console.log(`HTTPS server listening on port ${PORT_HTTPS}`);
});
