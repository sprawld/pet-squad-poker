import type { VoteCard } from './voteConstants';

/** Client → server: join a Scrum poker room. */
export type RoomJoinPayload = {
  roomName: string;
  displayName: string;
  seed: string;
};

export type VotePhase = 'idle' | 'voting' | 'revealed';

/** A committed choice: number, abstain, unsure (?), or coffee. */
export type VoteChoice = VoteCard | 'abstain' | 'unsure' | 'coffee';

/**
 * What the UI may show per participant: real choice, not voted yet, or
 * redacted while others are still voting.
 */
export type VoteDisplay = VoteChoice | null | 'hidden';

/** Client → server: cast a vote, or `null` to retract (same as deselecting). */
export type VoteSubmitPayload = {
  value: VoteChoice | null;
};

/** One participant as broadcast to the room. */
export type RoomParticipant = {
  socketId: string;
  displayName: string;
  seed: string;
  vote: VoteDisplay;
};

/** During `voting` only: how many people have locked in a pick (numbers, abstain, or unsure). */
export type VoteProgress = {
  cast: number;
  total: number;
};

/** Server → clients: roster + voting phase (payload may be redacted per socket). */
export type RoomStatePayload = {
  participants: RoomParticipant[];
  votePhase: VotePhase;
  voteProgress: VoteProgress | null;
};
