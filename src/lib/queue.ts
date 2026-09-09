import type { Signup } from './types';

export interface QueueGroup {
  groupIndex: number;
  players: Signup[];
  label: string;
}

const GROUP_LABELS = ['Now Playing', 'Up Next', 'On Deck'];

export function groupSignupsByCourt(signups: Signup[], courtNumber: number): QueueGroup[] {
  const courtSignups = signups
    .filter(s => s.court_number === courtNumber && s.status === 'waiting')
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  const groups: QueueGroup[] = [];

  for (let i = 0; i < courtSignups.length; i += 4) {
    const groupIndex = Math.floor(i / 4);
    const players = courtSignups.slice(i, i + 4);
    const label = GROUP_LABELS[groupIndex] || `Group ${groupIndex + 1}`;

    groups.push({
      groupIndex,
      players,
      label,
    });
  }

  return groups;
}

export function getQueuePosition(signups: Signup[], courtNumber: number, signupId: string): { group: string; position: number } | null {
  const courtSignups = signups
    .filter(s => s.court_number === courtNumber && s.status === 'waiting')
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  const index = courtSignups.findIndex(s => s.id === signupId);
  if (index === -1) return null;

  const groupIndex = Math.floor(index / 4);
  const label = GROUP_LABELS[groupIndex] || `Group ${groupIndex + 1}`;

  return {
    group: label,
    position: index + 1,
  };
}
