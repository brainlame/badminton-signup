import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { groupSignupsByCourt } from '../lib/queue';
import type { SignupInsert, Signup } from '../lib/types';
import { useToast } from '../lib/ToastContext';

interface SignupFormProps {
  signups: Signup[];
  userId: string | null;
  isDataLoading: boolean;
}

export default function SignupForm({ signups, userId, isDataLoading }: SignupFormProps) {
  const { showToast } = useToast();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [courtNumber, setCourtNumber] = useState<number>(1);
  const [queuePosition, setQueuePosition] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Get available groups for the selected court
  const getAvailablePositions = () => {
    const groups = groupSignupsByCourt(signups, courtNumber);
    const positions = [];
    const groupIndexMap = new Map<number, { players: number; isFull: boolean }>();

    // Find the minimum group index (currently playing group)
    const minGroupIndex = groups.length > 0
      ? Math.min(...groups.map(g => g.groupIndex))
      : 0;

    // Build a map of existing groups
    groups.forEach((group) => {
      const isFull = group.players.length >= 4;
      groupIndexMap.set(group.groupIndex, {
        players: group.players.length,
        isFull,
      });
    });

    // Get the highest group index
    const maxGroupIndex = groups.length > 0
      ? Math.max(...groups.map(g => g.groupIndex))
      : -1;

    // Start from the currently playing group
    const startGroupIndex = minGroupIndex;

    // Show at least 5 future groups
    const totalGroupsToShow = Math.max(startGroupIndex + 5, maxGroupIndex + 2);

    for (let groupIndex = startGroupIndex; groupIndex < totalGroupsToShow; groupIndex++) {
      const groupData = groupIndexMap.get(groupIndex);
      const label = `Group ${groupIndex + 1}`;

      if (groupData) {
        // Existing group with players
        positions.push({
          value: groupIndex,
          label: `${label} ${groupData.isFull ? '(Full)' : `(${groupData.players}/4)`}`,
          isFull: groupData.isFull,
        });
      } else {
        // Empty future group
        positions.push({
          value: groupIndex,
          label: `${label} (0/4)`,
          isFull: false,
        });
      }
    }

    return positions;
  };

  const availablePositions = getAvailablePositions();

  // Auto-select the first available position when court changes or positions change
  useEffect(() => {
    if (availablePositions.length > 0 && availablePositions[0]) {
      setQueuePosition(availablePositions[0].value);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courtNumber, signups]); // availablePositions is derived from signups, so we don't need it in deps

  // Note: We no longer manipulate timestamps when using group_index.
  // The group_index field determines which group you're in,
  // and created_at (natural insertion time) determines order within that group.

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Prevent submission if data is still loading
    if (isDataLoading) {
      showToast('Please wait for queue data to load');
      return;
    }

    if (!firstName.trim() || !lastName.trim()) {
      showToast('Please enter your first and last name');
      return;
    }

    if (firstName.length > 50 || lastName.length > 50) {
      showToast('Names must be less than 50 characters');
      return;
    }

    // Validate email if provided (optional field, but must end in @andrew.cmu.edu)
    if (email.trim()) {
      const emailRegex = /^[A-Za-z0-9._%+-]+@andrew\.cmu\.edu$/i;
      if (!emailRegex.test(email.trim())) {
        showToast('Please enter a valid CMU email address (@cmu.edu)');
        return;
      }
    }

    // Check if selected group is full
    const courtSignups = signups
      .filter(s => s.court_number === courtNumber && s.status === 'waiting');

    const groupIndex = queuePosition;

    // Count how many players are in the selected group
    const playersInGroup = courtSignups.filter(s => (s.group_index ?? 0) === groupIndex).length;

    if (playersInGroup >= 4) {
      const groupLabel = `Group ${groupIndex + 1}`;
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
      const insertData: SignupInsert = {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        email: email.trim() || null, // Store null if empty
        court_number: courtNumber,
        created_by: currentUserId,
        group_index: queuePosition, // Always include group_index - it's a required field in the schema
        // created_at will use the database default (now()) to determine order within the group
      };

      const { error } = await supabase
        .from('signups')
        .insert(insertData);

      if (error) throw error;

      // Successfully signed up - mark as submitted so form disappears
      setSubmitted(true);

      // Calculate the group label for the success message
      const groupLabel = `Group ${queuePosition + 1}`;

      showToast(`Successfully signed up for Court ${courtNumber} - ${groupLabel}. Refresh to view changes.`);
    } catch (error) {
      console.error('Error signing up:', error);

      // More detailed error message
      let errorMessage = 'Failed to sign up. ';
      if (error && typeof error === 'object' && 'message' in error) {
        errorMessage += (error as any).message;
      } else {
        errorMessage += 'Please try again.';
      }

      showToast(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // Don't show form if already submitted - parent will handle this
  if (submitted) {
    return null;
  }

  // Show loading state while data is being fetched
  if (isDataLoading) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6 max-w-md mx-auto">
        <h2 className="text-2xl font-bold text-gray-800 mb-6 text-center">Sign Up for a Court</h2>
        <div className="flex justify-center items-center py-12">
          <div className="text-gray-600">Loading queue data...</div>
        </div>
      </div>
    );
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
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
            CMU Email (Optional)
          </label>
          <input
            type="email"
            id="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="andrew@cmu.edu"
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
              // Queue position will be auto-updated by useEffect
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
