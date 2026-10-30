import http from 'node:http';
import socket from 'socket.io';

export const attachWebSockets = (server: http.Server) => {
  const io = new socket.Server(server);

  // TODO: wire up notification system for real-time event
  // streams to agents
};
