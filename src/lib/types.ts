import type { VoteCard } from './voteConstants';

/** Client → server: join a Scrum poker room. */
export type RoomJoinPayload = {
  roomName: string;
  displayName: string;
  seed: string;
};

export type VotePhase = 'idle' | 'voting' | 'revealed';

/** A committed choice (number or abstain). */
export type VoteChoice = VoteCard | 'abstain';

/**
 * What the UI may show per participant: real choice, not voted yet, or
 * redacted while others are still voting.
 */
export type VoteDisplay = VoteChoice | null | 'hidden';

/** Client → server: cast a vote during an active voting phase. */
export type VoteSubmitPayload = {
  value: VoteChoice;
};

/** One participant as broadcast to the room. */
export type RoomParticipant = {
  socketId: string;
  displayName: string;
  seed: string;
  vote: VoteDisplay;
};

/** Server → clients: roster + voting phase (payload may be redacted per socket). */
export type RoomStatePayload = {
  participants: RoomParticipant[];
  votePhase: VotePhase;
};
