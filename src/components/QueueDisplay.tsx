import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { groupSignupsByCourt } from '../lib/queue';
import type { Signup } from '../lib/types';
import SignupForm from './SignupForm';
import { useToast } from '../lib/ToastContext';

const MAX_VISIBLE_GROUPS = 5;
const COURTS = [1, 2, 3];

type LoadStatus = 'loading' | 'ready' | 'error';

export default function QueueDisplay() {
  const { showToast } = useToast();
  const [signups, setSignups] = useState<Signup[]>([]);
  const [mySignups, setMySignups] = useState<Signup[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const loading = status === 'loading';

  // Hide the static pre-hydration loader as soon as React takes over.
  useEffect(() => {
    const staticLoader = document.getElementById('app-loading');
    if (staticLoader) {
      staticLoader.style.display = 'none';
    }
  }, []);

  // Step 1: establish the anonymous session.
  //
  // This MUST complete before the first read. Reads are RLS-gated to
  // authenticated users, so querying with only the anon API key returns an
  // empty list with a 200 status rather than an error - which would render a
  // confidently empty queue instead of the real one.
  useEffect(() => {
    let cancelled = false;

    const initAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();

        if (session?.user) {
          if (!cancelled) setUserId(session.user.id);
          return;
        }

        const { data, error } = await supabase.auth.signInAnonymously();
        if (error) throw error;
        if (!data.user) throw new Error('Anonymous sign-in returned no user');

        if (!cancelled) setUserId(data.user.id);
      } catch (error) {
        console.error('Error initializing auth:', error);
        if (!cancelled) {
          setStatus('error');
          showToast('Could not connect. Please refresh the page.');
        }
      }
    };

    initAuth();

    return () => {
      cancelled = true;
    };
  }, []); // Run once on mount - showToast is stable via context

  // Step 2: once authenticated, load the queue and subscribe to changes.
  useEffect(() => {
    if (!userId) return;

    let cancelled = false;

    const fetchSignups = async (isInitialLoad = false) => {
      try {
        const { data, error } = await supabase
          .from('signups')
          .select('*')
          .order('created_at', { ascending: true });

        if (error) throw error;
        if (cancelled) return;

        setSignups(data ?? []);
        setStatus('ready');
      } catch (error) {
        console.error('Error fetching signups:', error);
        if (cancelled) return;

        if (isInitialLoad) {
          // Never fall through to an empty-looking queue on first load.
          setStatus('error');
        }
        showToast('Failed to load queue data. Please refresh the page.');
      }
    };

    fetchSignups(true);

    // Subscribe to realtime changes
    const channel = supabase
      .channel('signups-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'signups' },
        () => {
          fetchSignups();
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [userId]);

  useEffect(() => {
    // Fetch user's own signups
    if (userId) {
      const userSignups = signups.filter(
        s => s.created_by === userId && s.status === 'waiting'
      );
      setMySignups(userSignups);
    }
  }, [signups, userId]);

  const handleCancelSignup = async (signupId: string, courtNumber: number) => {
    setCancellingId(signupId);

    const { error } = await supabase
      .from('signups')
      .delete()
      .eq('id', signupId);

    if (error) {
      console.error('Error canceling signup:', error);
      showToast('Failed to cancel signup. Please try again.');
    } else {
      showToast(`Successfully cancelled signup for Court ${courtNumber}. Refresh to view changes.`);
    }

    setCancellingId(null);
  };

  const renderCourt = (courtNumber: number) => {
    const groups = groupSignupsByCourt(signups, courtNumber);
    const visibleGroups = groups.slice(0, MAX_VISIBLE_GROUPS);
    const remainingCount = groups.length - MAX_VISIBLE_GROUPS;

    return (
      <div className="bg-white rounded-lg shadow-md p-4">
        <h2 className="text-xl font-bold mb-4 text-center text-blue-600">
          Court {courtNumber}
        </h2>

        {groups.length === 0 ? (
          <div className="text-center text-gray-500 py-8">
            No one waiting — sign up!
          </div>
        ) : (
          <>
            {visibleGroups.map((group) => (
              <div
                key={`court-${courtNumber}-group-${group.groupIndex}`}
                className={`mb-4 border rounded p-3 ${
                  group.isCurrentlyPlaying
                    ? 'border-green-500 bg-green-50 border-2'
                    : 'border-gray-200'
                }`}
              >
                <h3 className={`font-semibold text-sm mb-2 ${
                  group.isCurrentlyPlaying
                    ? 'text-green-700'
                    : 'text-gray-700'
                }`}>
                  {group.label} ({group.players.length}/4)
                  {group.isCurrentlyPlaying && ' - Currently Playing'}
                </h3>
                <ul className="space-y-1">
                  {group.players.map((player) => (
                    <li key={player.id} className="text-sm">
                      {player.first_name} {player.last_name}
                    </li>
                  ))}
                  {[...Array(4 - group.players.length)].map((_, i) => (
                    <li key={`empty-${i}`} className="text-sm text-gray-400 italic">
                      (open)
                    </li>
                  ))}
                </ul>
              </div>
            ))}

            {remainingCount > 0 && (
              <div className="text-center text-sm text-gray-600 mt-2">
                +{remainingCount} more {remainingCount === 1 ? 'group' : 'groups'} waiting
              </div>
            )}
          </>
        )}
      </div>
    );
  };

  // Placeholder court card shown until real data is confirmed.
  const renderCourtSkeleton = (courtNumber: number) => (
    <div className="bg-white rounded-lg shadow-md p-4">
      <h2 className="text-xl font-bold mb-4 text-center text-blue-600">
        Court {courtNumber}
      </h2>
      <div className="animate-pulse space-y-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="border border-gray-200 rounded p-3">
            <div className="h-4 w-1/2 bg-gray-200 rounded mb-3" />
            <div className="space-y-2">
              <div className="h-3 w-3/4 bg-gray-100 rounded" />
              <div className="h-3 w-2/3 bg-gray-100 rounded" />
              <div className="h-3 w-3/5 bg-gray-100 rounded" />
              <div className="h-3 w-1/2 bg-gray-100 rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  if (status === 'loading') {
    return (
      <div className="space-y-8">
        <div
          className="text-center text-gray-600"
          role="status"
          aria-live="polite"
        >
          Loading queue data…
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {COURTS.map(courtNumber => (
            <div key={courtNumber}>
              {renderCourtSkeleton(courtNumber)}
            </div>
          ))}
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h2 className="text-lg font-semibold mb-3 text-center">Next Available Queue Positions</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 animate-pulse">
            {COURTS.map(courtNumber => (
              <div key={courtNumber} className="bg-white rounded p-3">
                <h3 className="font-semibold text-sm text-blue-700 mb-2 text-center">
                  Court {courtNumber}
                </h3>
                <div className="space-y-2">
                  <div className="h-3 w-2/3 mx-auto bg-gray-100 rounded" />
                  <div className="h-3 w-2/3 mx-auto bg-gray-100 rounded" />
                  <div className="h-3 w-2/3 mx-auto bg-gray-100 rounded" />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="max-w-2xl mx-auto">
          <SignupForm signups={[]} userId={null} isDataLoading={true} />
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="max-w-2xl mx-auto bg-red-50 border border-red-200 rounded-lg p-6 text-center space-y-3">
        <h2 className="text-lg font-semibold text-red-800">Could not load the queue</h2>
        <p className="text-sm text-red-700">
          The live queue data did not load, so it is being hidden rather than shown
          as empty. Check your connection and try again.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="bg-red-600 hover:bg-red-700 text-white font-medium py-3 px-6 rounded"
        >
          Try again
        </button>
      </div>
    );
  }

  // Render next 3 queue positions for all courts
  const renderNextPositions = () => {
    return (
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h2 className="text-lg font-semibold mb-3 text-center">Next Available Queue Positions</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {COURTS.map(courtNumber => {
            const groups = groupSignupsByCourt(signups, courtNumber);
            const nextPositions = [];

            // Create a map of group index to player count
            const groupPlayerCount = new Map<number, number>();
            groups.forEach(group => {
              groupPlayerCount.set(group.groupIndex, group.players.length);
            });

            // Find the minimum group index (currently playing)
            const minGroupIndex = groups.length > 0
              ? Math.min(...groups.map(g => g.groupIndex))
              : 0;

            // Start from the group AFTER currently playing
            const startGroupIndex = minGroupIndex + 1;

            // Get next 3 available positions after the currently playing group
            for (let i = 0; i < 3; i++) {
              const groupIndex = startGroupIndex + i;
              const label = `Group ${groupIndex + 1}`;
              const playerCount = groupPlayerCount.get(groupIndex) || 0;
              nextPositions.push({ groupIndex, label, playerCount });
            }

            return (
              <div key={courtNumber} className="bg-white rounded p-3">
                <h3 className="font-semibold text-sm text-blue-700 mb-2 text-center">
                  Court {courtNumber}
                </h3>
                <ul className="space-y-1 text-sm">
                  {nextPositions.map((pos, idx) => (
                    <li key={pos.groupIndex} className="text-gray-700">
                      {idx === 0 ? '→ ' : '  '}{pos.label} ({pos.playerCount}/4)
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-8">
      {/* Queue Display */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {COURTS.map(courtNumber => (
          <div key={courtNumber}>
            {renderCourt(courtNumber)}
          </div>
        ))}
      </div>

      {/* Next Available Positions */}
      {renderNextPositions()}

      {/* My Signups Section */}
      {mySignups.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <h2 className="text-lg font-semibold mb-3">My Signups</h2>
          <div className="space-y-2">
            {mySignups.map((signup) => (
              <div
                key={signup.id}
                className="flex justify-between items-center bg-white p-3 rounded border border-yellow-300"
              >
                <div>
                  <div className="font-medium">
                    Court {signup.court_number}
                  </div>
                  <div className="text-sm text-gray-600">
                    {signup.first_name} {signup.last_name}
                  </div>
                </div>
                <button
                  onClick={() => handleCancelSignup(signup.id, signup.court_number)}
                  disabled={cancellingId === signup.id}
                  className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {cancellingId === signup.id ? 'Cancelling...' : 'Cancel'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Signup Form - Only show if user doesn't have an active signup */}
      {mySignups.length === 0 ? (
        <div className="max-w-2xl mx-auto">
          <SignupForm signups={signups} userId={userId} isDataLoading={loading} />
        </div>
      ) : (
        <div className="max-w-2xl mx-auto bg-gray-50 border border-gray-200 rounded-lg p-6 text-center">
          <p className="text-gray-700 text-lg">
            You already have an active signup. Cancel your current signup to join another queue.
          </p>
        </div>
      )}
    </div>
  );
}
