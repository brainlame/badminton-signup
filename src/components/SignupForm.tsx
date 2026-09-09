import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { groupSignupsByCourt } from '../lib/queue';
import type { SignupInsert, Signup } from '../lib/types';

interface SignupFormProps {
  signups: Signup[];
  userId: string | null;
}

export default function SignupForm({ signups, userId }: SignupFormProps) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [courtNumber, setCourtNumber] = useState<number>(1);
  const [queuePosition, setQueuePosition] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Get available queue positions for the selected court
  const getAvailablePositions = () => {
    const groups = groupSignupsByCourt(signups, courtNumber);
    const positions = [];

    // Add existing groups (user joins at the end of each group)
    groups.forEach((group) => {
      positions.push({
        value: group.groupIndex,
        label: `${group.label} (${group.players.length}/4)`,
      });
    });

    // Add next available group
    positions.push({
      value: groups.length,
      label: groups.length === 0 ? 'Now Playing (0/4)' : `Group ${groups.length + 1} (0/4)`,
    });

    return positions;
  };

  const availablePositions = getAvailablePositions();

  // Calculate the timestamp for inserting at a specific queue position
  const calculateInsertTimestamp = (): string | undefined => {
    const courtSignups = signups
      .filter(s => s.court_number === courtNumber && s.status === 'waiting')
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    // If no signups exist, use current time
    if (courtSignups.length === 0) {
      return undefined; // Let database use default
    }

    // Calculate the position in the queue (end of selected group)
    const targetPosition = (queuePosition * 4) + 3; // End of the group (4th position in group)

    // If inserting at the end of all groups, use time after last signup
    if (targetPosition >= courtSignups.length) {
      const lastSignup = courtSignups[courtSignups.length - 1];
      if (!lastSignup) return undefined;
      const lastTime = new Date(lastSignup.created_at).getTime();
      return new Date(lastTime + 1000).toISOString(); // 1 second after
    }

    // If inserting in the middle, find the right spot
    // We want to be at position targetPosition, so insert between targetPosition-1 and targetPosition
    const beforeIndex = Math.min(targetPosition, courtSignups.length - 1);
    const afterIndex = beforeIndex + 1;

    if (afterIndex < courtSignups.length) {
      // Insert between two existing signups
      const beforeSignup = courtSignups[beforeIndex];
      const afterSignup = courtSignups[afterIndex];
      if (!beforeSignup || !afterSignup) return undefined;
      const beforeTime = new Date(beforeSignup.created_at).getTime();
      const afterTime = new Date(afterSignup.created_at).getTime();
      const midTime = beforeTime + (afterTime - beforeTime) / 2;
      return new Date(midTime).toISOString();
    } else {
      // Insert after the last one
      const beforeSignup = courtSignups[beforeIndex];
      if (!beforeSignup) return undefined;
      const lastTime = new Date(beforeSignup.created_at).getTime();
      return new Date(lastTime + 1000).toISOString();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!firstName.trim() || !lastName.trim()) {
      alert('Please enter your first and last name');
      return;
    }

    if (firstName.length > 50 || lastName.length > 50) {
      alert('Names must be less than 50 characters');
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
            alert('Failed to initialize authentication. Please refresh the page and try again.');
            setLoading(false);
            return;
          }
          currentUserId = anonData.user?.id || null;
        } else {
          currentUserId = session.user?.id || null;
        }

        if (!currentUserId) {
          alert('Authentication failed. Please refresh the page and try again.');
          setLoading(false);
          return;
        }
      } catch (error) {
        console.error('Error initializing auth:', error);
        alert('Failed to initialize authentication. Please refresh the page and try again.');
        setLoading(false);
        return;
      }
    }

    // Check if user already has an active signup
    const existingSignup = signups.find(
      s => s.created_by === currentUserId && s.status === 'waiting'
    );
    if (existingSignup) {
      alert('You already have an active signup. Please cancel it first before signing up again.');
      setLoading(false);
      return;
    }

    try {
      const insertTimestamp = calculateInsertTimestamp();

      const insertData: SignupInsert = {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        court_number: courtNumber,
        created_by: currentUserId,
        ...(insertTimestamp && { created_at: insertTimestamp }),
      };

      const { error } = await supabase
        .from('signups')
        .insert(insertData);

      if (error) throw error;

      // Successfully signed up - mark as submitted so form disappears
      setSubmitted(true);
    } catch (error) {
      console.error('Error signing up:', error);
      alert('Failed to sign up. Please try again.');
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
              setCourtNumber(Number(e.target.value));
              setQueuePosition(0); // Reset queue position when court changes
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
