import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { groupSignupsByCourt } from '../lib/queue';
import type { Signup } from '../lib/types';

export default function AdminPanel() {
  const [signups, setSignups] = useState<Signup[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [userEmail, setUserEmail] = useState<string>('');

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session?.user) {
        // Redirect to login
        window.location.href = '/admin/login';
        return;
      }

      const user = session.user;
      setUserId(user.id);
      setUserEmail(user.email || '');

      // Check if user is admin
      const { data: adminData, error } = await supabase
        .from('admins')
        .select('user_id')
        .eq('user_id', user.id)
        .single();

      if (error || !adminData) {
        setIsAdmin(false);
        setLoading(false);
        return;
      }

      setIsAdmin(true);
      setLoading(false);
    };

    checkAuth();
  }, []);

  useEffect(() => {
    if (!isAdmin) return;

    // Fetch all signups
    const fetchSignups = async () => {
      const { data, error } = await supabase
        .from('signups')
        .select('*')
        .order('created_at', { ascending: true });

      if (error) {
        console.error('Error fetching signups:', error);
      } else {
        setSignups(data || []);
      }
    };

    fetchSignups();

    // Subscribe to realtime changes
    const channel = supabase
      .channel('admin-signups-changes')
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
  }, [isAdmin]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/';
  };

  const handleAdvanceQueue = async (courtNumber: number) => {
    const confirmed = confirm(`Advance the queue for Court ${courtNumber}? This will mark the current group as done.`);
    if (!confirmed) return;

    // Get the first 4 waiting signups for this court
    const courtSignups = signups
      .filter(s => s.court_number === courtNumber && s.status === 'waiting')
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      .slice(0, 4);

    if (courtSignups.length === 0) {
      alert('No one waiting for this court');
      return;
    }

    try {
      const { error } = await supabase
        .from('signups')
        .update({ status: 'done' as const })
        .in('id', courtSignups.map(s => s.id));

      if (error) throw error;
    } catch (error) {
      console.error('Error advancing queue:', error);
      alert('Failed to advance queue');
    }
  };

  const handleDeleteSignup = async (signupId: string, name: string) => {
    const confirmed = confirm(`Delete signup for ${name}?`);
    if (!confirmed) return;

    try {
      const { error } = await supabase
        .from('signups')
        .delete()
        .eq('id', signupId);

      if (error) throw error;
    } catch (error) {
      console.error('Error deleting signup:', error);
      alert('Failed to delete signup');
    }
  };

  const handleResetAll = async () => {
    const confirmed = confirm(
      'Reset ALL queues? This will mark all waiting signups as done. This action cannot be undone.'
    );
    if (!confirmed) return;

    const doubleConfirmed = confirm('Are you absolutely sure? This will clear all queues.');
    if (!doubleConfirmed) return;

    try {
      const { error } = await supabase
        .from('signups')
        .update({ status: 'done' as const })
        .eq('status', 'waiting');

      if (error) throw error;

      alert('All queues have been reset');
    } catch (error) {
      console.error('Error resetting queues:', error);
      alert('Failed to reset queues');
    }
  };

  const renderCourtQueue = (courtNumber: number) => {
    const groups = groupSignupsByCourt(signups, courtNumber);

    return (
      <div className="bg-white rounded-lg shadow-md p-4">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-blue-600">Court {courtNumber}</h2>
          <button
            onClick={() => handleAdvanceQueue(courtNumber)}
            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded text-sm font-medium"
          >
            Advance Queue
          </button>
        </div>

        {groups.length === 0 ? (
          <div className="text-center text-gray-500 py-4">No one waiting</div>
        ) : (
          <div className="space-y-3">
            {groups.map((group) => (
              <div
                key={`admin-court-${courtNumber}-group-${group.groupIndex}`}
                className="border border-gray-200 rounded p-3"
              >
                <h3 className="font-semibold text-sm text-gray-700 mb-2">
                  {group.label} ({group.players.length}/4)
                </h3>
                <ul className="space-y-2">
                  {group.players.map((player) => (
                    <li key={player.id} className="flex justify-between items-center text-sm">
                      <span>
                        {player.first_name} {player.last_name}
                      </span>
                      <button
                        onClick={() => handleDeleteSignup(player.id, `${player.first_name} ${player.last_name}`)}
                        className="bg-red-500 hover:bg-red-600 text-white px-2 py-1 rounded text-xs"
                      >
                        Remove
                      </button>
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
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="text-gray-600">Loading...</div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6 max-w-md mx-auto">
        <div className="text-center">
          <div className="text-red-600 text-5xl mb-4">⚠️</div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Not Authorized</h2>
          <p className="text-gray-600 mb-4">
            You are logged in as <strong>{userEmail}</strong>, but you don't have admin permissions yet.
          </p>
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
            <p className="text-sm text-gray-700">
              An existing organizer needs to add your user ID to the <code className="bg-gray-200 px-1 rounded">admins</code> table
              in the Supabase dashboard.
            </p>
            <p className="text-sm text-gray-700 mt-2">
              Your User ID: <code className="bg-gray-200 px-1 rounded">{userId}</code>
            </p>
          </div>
          <div className="space-y-2">
            <button
              onClick={handleLogout}
              className="block w-full bg-gray-600 hover:bg-gray-700 text-white font-medium py-2 px-4 rounded"
            >
              Logout
            </button>
            <a
              href="/"
              className="block w-full bg-gray-200 hover:bg-gray-300 text-gray-800 font-medium py-2 px-4 rounded text-center"
            >
              Back to Queue
            </a>
          </div>
        </div>
      </div>
    );
  }

  const totalWaiting = signups.filter(s => s.status === 'waiting').length;

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow-md p-4">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-xl font-bold text-gray-800">Admin Control Panel</h2>
            <p className="text-sm text-gray-600">Logged in as {userEmail}</p>
          </div>
          <div className="space-x-2">
            <button
              onClick={handleResetAll}
              className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded font-medium"
            >
              Reset All Queues
            </button>
            <button
              onClick={handleLogout}
              className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded font-medium"
            >
              Logout
            </button>
          </div>
        </div>
        <div className="mt-2 text-sm text-gray-600">
          Total waiting: <strong>{totalWaiting}</strong> players
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[1, 2, 3].map(courtNumber => (
          <div key={courtNumber}>
            {renderCourtQueue(courtNumber)}
          </div>
        ))}
      </div>

      <div className="text-center">
        <a href="/" className="text-blue-600 hover:text-blue-800 underline">
          View Public Queue
        </a>
      </div>
    </div>
  );
}
