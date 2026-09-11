import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { groupSignupsByCourt } from '../lib/queue';
import type { Signup } from '../lib/types';
import SignupForm from './SignupForm';
import { useToast } from '../lib/ToastContext';

const MAX_VISIBLE_GROUPS = 5;

export default function QueueDisplay() {
  const { showToast } = useToast();
  const [signups, setSignups] = useState<Signup[]>([]);
  const [mySignups, setMySignups] = useState<Signup[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  useEffect(() => {
    // Ensure anonymous session exists
    const initAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();

        if (!session) {
          const { data: anonData, error: anonError } = await supabase.auth.signInAnonymously();
          if (anonError) {
            console.error('Error creating anonymous session:', anonError);
            return;
          }
          setUserId(anonData.user?.id || null);
        } else {
          setUserId(session.user?.id || null);
        }
      } catch (error) {
        console.error('Error initializing auth:', error);
      }
    };

    initAuth();
  }, []);

  useEffect(() => {
    // Hide the static loading indicator
    const staticLoader = document.getElementById('app-loading');
    if (staticLoader) {
      staticLoader.style.display = 'none';
    }

    // Fetch all signups
    const fetchSignups = async () => {
      try {
        const { data, error } = await supabase
          .from('signups')
          .select('*')
          .order('created_at', { ascending: true });

        if (error) {
          console.error('Error fetching signups:', error);
          showToast('Failed to load queue data. Please refresh the page.');
        } else {
          setSignups(data || []);
        }
      } catch (error) {
        console.error('Exception fetching signups:', error);
        showToast('Failed to load queue data. Please refresh the page.');
      } finally {
        setLoading(false);
      }
    };

    fetchSignups();

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
      supabase.removeChannel(channel);
    };
  }, [showToast]);

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

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="text-xl text-gray-800 font-semibold">Loading queue data...</div>
      </div>
    );
  }

  // Render next 3 queue positions for all courts
  const renderNextPositions = () => {
    return (
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h2 className="text-lg font-semibold mb-3 text-center">Next Available Queue Positions</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map(courtNumber => {
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
        {[1, 2, 3].map(courtNumber => (
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
