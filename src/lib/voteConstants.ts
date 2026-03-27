/** Allowed Scrum poker card values (Fibonacci-style deck). */
export const VOTE_VALUES = [1, 2, 3, 5, 8, 13, 20, 40, 100] as const;

export type VoteCard = (typeof VOTE_VALUES)[number];

/**
 * Not joining this round (shown as ?). Counts as having voted like other picks.
 */
export const UNSURE_VOTE = 'unsure' as const;

/** Coffee break / informal option (shown with coffee icon). Counts as a vote. */
export const COFFEE_VOTE = 'coffee' as const;
