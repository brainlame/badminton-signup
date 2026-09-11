import type { Signup } from './types';

export interface QueueGroup {
  groupIndex: number;
  players: Signup[];
  label: string;
  isCurrentlyPlaying: boolean; // First group in the queue
}

export function groupSignupsByCourt(signups: Signup[], courtNumber: number): QueueGroup[] {
  const courtSignups = signups
    .filter(s => s.court_number === courtNumber && s.status === 'waiting')
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  // Check if we have group_index data (new system) or need to calculate dynamically (old system)
  const hasGroupIndex = courtSignups.length > 0 && courtSignups[0]?.group_index !== undefined;

  if (hasGroupIndex) {
    // New system: Group by stored group_index (frozen groups)
    const groupMap = new Map<number, Signup[]>();

    courtSignups.forEach(signup => {
      const groupIndex = signup.group_index ?? 0;
      if (!groupMap.has(groupIndex)) {
        groupMap.set(groupIndex, []);
      }
      groupMap.get(groupIndex)!.push(signup);
    });

    // Sort players within each group by created_at
    groupMap.forEach((players) => {
      players.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    });

    // Convert map to array and sort by group index
    const groups: QueueGroup[] = Array.from(groupMap.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([groupIndex, players], index) => {
        const label = `Group ${groupIndex + 1}`;
        return {
          groupIndex,
          players,
          label,
          isCurrentlyPlaying: index === 0, // First group is currently playing
        };
      });

    return groups;
  } else {
    // Old system: Calculate groups dynamically by position (for backwards compatibility)
    const groups: QueueGroup[] = [];

    for (let i = 0; i < courtSignups.length; i += 4) {
      const groupIndex = Math.floor(i / 4);
      const players = courtSignups.slice(i, i + 4);
      const label = `Group ${groupIndex + 1}`;

      groups.push({
        groupIndex,
        players,
        label,
        isCurrentlyPlaying: groupIndex === 0, // First group is currently playing
      });
    }

    return groups;
  }
}

export function getQueuePosition(signups: Signup[], courtNumber: number, signupId: string): { group: string; position: number } | null {
  const signup = signups.find(s => s.id === signupId && s.court_number === courtNumber && s.status === 'waiting');
  if (!signup) return null;

  // Check if we have group_index (new system) or need to calculate (old system)
  const hasGroupIndex = signup.group_index !== undefined;

  if (hasGroupIndex) {
    // New system: Use stored group_index
    const groupIndex = signup.group_index ?? 0;
    const label = `Group ${groupIndex + 1}`;

    // Find position within the group
    const groupSignups = signups
      .filter(s => s.court_number === courtNumber && s.status === 'waiting' && (s.group_index ?? 0) === groupIndex)
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    const positionInGroup = groupSignups.findIndex(s => s.id === signupId);

    return {
      group: label,
      position: positionInGroup + 1,
    };
  } else {
    // Old system: Calculate by position
    const courtSignups = signups
      .filter(s => s.court_number === courtNumber && s.status === 'waiting')
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    const index = courtSignups.findIndex(s => s.id === signupId);
    if (index === -1) return null;

    const groupIndex = Math.floor(index / 4);
    const label = `Group ${groupIndex + 1}`;

    return {
      group: label,
      position: index + 1,
    };
  }
}
