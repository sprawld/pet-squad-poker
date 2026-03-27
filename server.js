import express from "express";
import { Server } from "socket.io";
import { connect } from "./sockets/index.js";
import http from "node:http";

const app = express();
const port = process.env.PORT || 3001;
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("./dist"));

io.on("connection", connect);

server.listen(port, () =>
  console.log(`Example app listening on http://localhost:${port}!`),
);
