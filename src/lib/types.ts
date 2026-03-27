/** Client → server: join a Scrum poker room. */
export type RoomJoinPayload = {
  roomName: string;
  displayName: string;
  seed: string;
};

/** One participant as broadcast to the room. */
export type RoomParticipant = {
  socketId: string;
  displayName: string;
  seed: string;
};

/** Server → clients: full room roster (v1 read-only list). */
export type RoomStatePayload = {
  participants: RoomParticipant[];
};
