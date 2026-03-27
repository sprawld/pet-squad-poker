/** Allowed Scrum poker card values (Fibonacci-style deck). */
export const VOTE_VALUES = [1, 2, 3, 5, 8, 13, 20, 40, 100] as const;

export type VoteCard = (typeof VOTE_VALUES)[number];
