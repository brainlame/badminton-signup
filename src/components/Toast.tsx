import React, { useEffect } from 'react';

export interface ToastProps {
  message: string;
  onClose: () => void;
  duration?: number;
}

export default function Toast({ message, onClose, duration = 5000 }: ToastProps) {
  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(() => {
        onClose();
      }, duration);

      return () => clearTimeout(timer);
    }
  }, [duration, onClose]);

  return (
    <div className="fixed bottom-4 right-4 z-50 animate-slide-in">
      <div className="bg-blue-100 border border-blue-300 rounded-lg shadow-lg p-4 pr-12 max-w-md">
        <p className="text-blue-900 text-sm">{message}</p>
        <button
          onClick={onClose}
          className="absolute top-2 right-2 text-blue-900 hover:text-blue-700 transition-colors"
          aria-label="Close notification"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}
