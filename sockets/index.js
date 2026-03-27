export function connect(socket) {
  console.log("a user connected");
  socket.emit("hello", "Hello World");
}
