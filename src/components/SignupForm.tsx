import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { groupSignupsByCourt } from '../lib/queue';
import type { SignupInsert, Signup } from '../lib/types';
import { useToast } from '../lib/ToastContext';

interface SignupFormProps {
  signups: Signup[];
  userId: string | null;
}

export default function SignupForm({ signups, userId }: SignupFormProps) {
  const { showToast } = useToast();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [courtNumber, setCourtNumber] = useState<number>(1);
  const [queuePosition, setQueuePosition] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Get available groups for the selected court
  const getAvailablePositions = () => {
    const groups = groupSignupsByCourt(signups, courtNumber);
    const positions = [];

    // Add existing groups
    groups.forEach((group) => {
      const isFull = group.players.length >= 4;
      positions.push({
        value: group.groupIndex,
        label: `${group.label} ${isFull ? '(Full)' : `(${group.players.length}/4)`}`,
        isFull,
      });
    });

    // Add future groups up to a total of 5 groups
    const totalGroupsToShow = 5;
    for (let i = groups.length; i < totalGroupsToShow; i++) {
      const label = i === 0 ? 'Now Playing' :
                    i === 1 ? 'Up Next' :
                    i === 2 ? 'On Deck' :
                    `Group ${i + 1}`;

      positions.push({
        value: i,
        label: `${label} (0/4)`,
        isFull: false,
      });
    }

    return positions;
  };

  const availablePositions = getAvailablePositions();

  // Calculate the timestamp for inserting at a specific group position
  const calculateInsertTimestamp = (): string | undefined => {
    const courtSignups = signups
      .filter(s => s.court_number === courtNumber && s.status === 'waiting')
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    // queuePosition is the group index (0 for Now Playing, 1 for Up Next, etc.)
    const groupIndex = queuePosition;

    // Check if we have group_index data
    const hasGroupIndex = courtSignups.length > 0 && courtSignups[0].group_index !== undefined;

    let groupSignups: typeof courtSignups;

    if (hasGroupIndex) {
      // New system: Get signups in the selected group
      groupSignups = courtSignups.filter(s => (s.group_index ?? 0) === groupIndex);
    } else {
      // Old system: Calculate which signups belong to this group by position
      const startPos = groupIndex * 4;
      const endPos = startPos + 4;
      groupSignups = courtSignups.slice(startPos, endPos);
    }

    // If the group is empty or there are no signups at all, use current time
    if (groupSignups.length === 0) {
      return undefined; // Let database use default
    }

    // Insert after the last person in this group
    const lastInGroup = groupSignups[groupSignups.length - 1];
    if (!lastInGroup) return undefined;
    const lastTime = new Date(lastInGroup.created_at).getTime();
    return new Date(lastTime + 1000).toISOString();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!firstName.trim() || !lastName.trim()) {
      showToast('Please enter your first and last name');
      return;
    }

    if (firstName.length > 50 || lastName.length > 50) {
      showToast('Names must be less than 50 characters');
      return;
    }

    // Check if selected group is full
    const courtSignups = signups
      .filter(s => s.court_number === courtNumber && s.status === 'waiting');

    const groupIndex = queuePosition;

    // Check if we have group_index data or need to calculate dynamically
    const hasGroupIndex = courtSignups.length > 0 && courtSignups[0].group_index !== undefined;
    const playersInGroup = hasGroupIndex
      ? courtSignups.filter(s => (s.group_index ?? 0) === groupIndex).length
      : courtSignups.filter((_, index) => Math.floor(index / 4) === groupIndex).length;

    if (playersInGroup >= 4) {
      const groupLabel = groupIndex === 0 ? 'Now Playing' :
                        groupIndex === 1 ? 'Up Next' :
                        groupIndex === 2 ? 'On Deck' :
                        `Group ${groupIndex + 1}`;
      showToast(`${groupLabel} is full. Please select a different group.`);
      return;
    }

    setLoading(true);

    // Ensure we have a valid user session (create anonymous if needed)
    let currentUserId = userId;
    if (!currentUserId) {
      try {
        const { data: { session } } = await supabase.auth.getSession();

        if (!session) {
          const { data: anonData, error: anonError } = await supabase.auth.signInAnonymously();
          if (anonError) {
            console.error('Error creating anonymous session:', anonError);
            showToast('Failed to initialize authentication. Please refresh the page and try again.');
            setLoading(false);
            return;
          }
          currentUserId = anonData.user?.id || null;
        } else {
          currentUserId = session.user?.id || null;
        }

        if (!currentUserId) {
          showToast('Authentication failed. Please refresh the page and try again.');
          setLoading(false);
          return;
        }
      } catch (error) {
        console.error('Error initializing auth:', error);
        showToast('Failed to initialize authentication. Please refresh the page and try again.');
        setLoading(false);
        return;
      }
    }

    // Check if user already has an active signup
    const existingSignup = signups.find(
      s => s.created_by === currentUserId && s.status === 'waiting'
    );
    if (existingSignup) {
      showToast('You already have an active signup. Please cancel it first before signing up again.');
      setLoading(false);
      return;
    }

    try {
      const insertTimestamp = calculateInsertTimestamp();

      // Check if we should include group_index (only if migration has been run)
      // Check ALL signups, not just this court, to see if group_index field exists
      const hasGroupIndex = signups.length > 0 && signups[0].group_index !== undefined;

      const insertData: SignupInsert = {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        court_number: courtNumber,
        created_by: currentUserId,
        ...(insertTimestamp && { created_at: insertTimestamp }),
        // Only include group_index if the database has been migrated
        ...(hasGroupIndex && { group_index: queuePosition }),
      };

      const { error } = await supabase
        .from('signups')
        .insert(insertData);

      if (error) throw error;

      // Successfully signed up - mark as submitted so form disappears
      setSubmitted(true);

      // Calculate the group label for the success message
      const groupIndex = queuePosition;
      const groupLabel = groupIndex === 0 ? 'Now Playing' :
                        groupIndex === 1 ? 'Up Next' :
                        groupIndex === 2 ? 'On Deck' :
                        `Group ${groupIndex + 1}`;

      showToast(`Signed up successfully on Court ${courtNumber} - ${groupLabel}!`);
    } catch (error) {
      console.error('Error signing up:', error);
      showToast('Failed to sign up. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Don't show form if already submitted - parent will handle this
  if (submitted) {
    return null;
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6 max-w-md mx-auto">
      <h2 className="text-2xl font-bold text-gray-800 mb-6 text-center">Sign Up for a Court</h2>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="firstName" className="block text-sm font-medium text-gray-700 mb-1">
            First Name
          </label>
          <input
            type="text"
            id="firstName"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
            maxLength={50}
            disabled={loading}
          />
        </div>

        <div>
          <label htmlFor="lastName" className="block text-sm font-medium text-gray-700 mb-1">
            Last Name
          </label>
          <input
            type="text"
            id="lastName"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
            maxLength={50}
            disabled={loading}
          />
        </div>

        <div>
          <label htmlFor="courtNumber" className="block text-sm font-medium text-gray-700 mb-1">
            Court Number
          </label>
          <select
            id="courtNumber"
            value={courtNumber}
            onChange={(e) => {
              const newCourt = Number(e.target.value);
              setCourtNumber(newCourt);
              // Reset to first available position for the new court
              setQueuePosition(0);
            }}
            className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={loading}
          >
            <option value={1}>Court 1</option>
            <option value={2}>Court 2</option>
            <option value={3}>Court 3</option>
          </select>
        </div>

        <div>
          <label htmlFor="queuePosition" className="block text-sm font-medium text-gray-700 mb-1">
            Join Queue At
          </label>
          <select
            id="queuePosition"
            value={queuePosition}
            onChange={(e) => setQueuePosition(Number(e.target.value))}
            className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={loading}
          >
            {availablePositions.map((pos) => (
              <option key={pos.value} value={pos.value}>
                {pos.label}
              </option>
            ))}
          </select>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Signing up...' : 'Sign Up'}
        </button>
      </form>
    </div>
  );
}
