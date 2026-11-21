'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import {
  Bell,
  Check,
  CheckCheck,
  Clock,
  AlertTriangle,
  RotateCcw,
  ShieldCheck,
  FileText,
  Award,
  AlertCircle,
  Inbox,
} from 'lucide-react';
import { AppNotificationItem } from '@/app/api/notifications/route';

interface NotificationCenterProps {
  className?: string;
}

function formatRelativeTime(dateString: string): string {
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMinutes = Math.floor(diffMs / (60 * 1000));
    const diffHours = Math.floor(diffMs / (60 * 60 * 1000));
    const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));

    if (diffMinutes < 1) return 'Just now';
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString('en-IN', {
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return 'Recently';
  }
}

export function NotificationCenter({ className = '' }: NotificationCenterProps) {
  const { data: session } = useSession();
  const router = useRouter();
  const userId = session?.user?.id || 'anonymous';
  const storageKey = `civicpulse_read_notifications_${userId}`;

  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotificationItem[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  // Load read state from localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem(storageKey);
        if (stored) {
          const parsed = JSON.parse(stored);
          setTimeout(() => setReadIds(new Set(parsed)), 0);
        }
      } catch {
        // ignore
      }
    }
  }, [storageKey]);

  // Save read state to localStorage
  const saveReadIds = useCallback((newReadIds: Set<string>) => {
    setReadIds(newReadIds);
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(storageKey, JSON.stringify(Array.from(newReadIds)));
      } catch {
        // ignore
      }
    }
  }, [storageKey]);

  // Fetch real notifications from API
  const fetchNotifications = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/notifications');
      if (!res.ok) {
        throw new Error(`Failed to load notifications (${res.status})`);
      }
      const data = await res.json();
      setNotifications(data.notifications || []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unable to load notifications';
      console.warn('Error fetching notifications:', err);
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch on mount and when popover is opened
  useEffect(() => {
    let cancelled = false;
    if (!session?.user) return;

    const run = async () => {
      try {
        const res = await fetch('/api/notifications');
        if (!res.ok) {
          throw new Error(`Failed to load notifications (${res.status})`);
        }
        const data = await res.json();
        if (!cancelled) {
          setNotifications(data.notifications || []);
          setError(null);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : 'Unable to load notifications';
          console.warn('Error fetching notifications:', err);
          setError(msg);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [session]);

  // Handle click outside to close popover
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  const unreadCount = notifications.filter((n) => !readIds.has(n.id)).length;
  const hasUnread = unreadCount > 0;

  const markAsRead = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const updated = new Set(readIds);
    updated.add(id);
    saveReadIds(updated);
  };

  const markAllAsRead = () => {
    const updated = new Set(readIds);
    notifications.forEach((n) => updated.add(n.id));
    saveReadIds(updated);
  };

  const handleNotificationClick = (item: AppNotificationItem) => {
    markAsRead(item.id);
    setIsOpen(false);
    if (item.link) {
      router.push(item.link);
    }
  };

  const getIconForType = (type: AppNotificationItem['type']) => {
    switch (type) {
      case 'AUDIT_TASK':
        return <ShieldCheck className="w-3.5 h-3.5 text-[#527B7A]" />;
      case 'ISSUE_UPDATE':
        return <FileText className="w-3.5 h-3.5 text-[#527B7A]" />;
      case 'POINTS':
        return <Award className="w-3.5 h-3.5 text-[#B68B63]" />;
      case 'SLA_BREACH':
        return <AlertTriangle className="w-3.5 h-3.5 text-[#B76F60]" />;
      case 'CRITICAL_HAZARD':
        return <AlertCircle className="w-3.5 h-3.5 text-[#B76F60]" />;
      default:
        return <Bell className="w-3.5 h-3.5 text-[#527B7A]" />;
    }
  };

  return (
    <div ref={containerRef} className={`relative select-none ${className}`}>
      {/* Persistent Notification Bell Button */}
      <button
        type="button"
        onClick={() => {
          setIsOpen(!isOpen);
          if (!isOpen) {
            fetchNotifications();
          }
        }}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        title={hasUnread ? `${unreadCount} unread notification${unreadCount > 1 ? 's' : ''}` : 'Notifications'}
        className="group relative w-10 h-10 rounded-2xl bg-white hover:bg-[#FAF9F5] active:bg-[#F3F2EB] border border-[#DDDCD3] shadow-[0_2px_6px_rgba(41,55,50,0.06),0_1px_2px_rgba(41,55,50,0.03),inset_0_1px_0_rgba(255,255,255,1)] hover:border-[#C2D7D1] transition-all duration-150 flex items-center justify-center cursor-pointer text-[#293732] focus:outline-none focus:ring-2 focus:ring-[#527B7A]/30"
      >
        <Bell className="w-4 h-4 text-[#293732] group-hover:text-[#355858] transition-colors" />

        {/* Small Indicator: Only shown when unread count > 0 */}
        {hasUnread && (
          <span
            aria-label={`${unreadCount} unread`}
            className="w-2.5 h-2.5 rounded-full bg-[#B68B63] border-2 border-white absolute top-2 right-2 animate-pulse"
          />
        )}
      </button>

      {/* Expanded Notification Popover */}
      {isOpen && (
        <div
          role="dialog"
          aria-label="Notification Centre"
          className="absolute right-0 mt-2 w-80 sm:w-96 bg-white border border-[#DDDCD3] rounded-2xl shadow-[0_16px_36px_rgba(41,55,50,0.18),0_4px_12px_rgba(41,55,50,0.08),inset_0_1px_0_rgba(255,255,255,1)] z-[1200] overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        >
          {/* Popover Header */}
          <div className="p-3.5 bg-[#FAF9F5] border-b border-[#DDDCD3] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-[#293732]">Notifications</span>
              {hasUnread && (
                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-[#E5E9E3] text-[#355858] border border-[#C2D7D1]">
                  {unreadCount} unread
                </span>
              )}
            </div>

            {hasUnread && (
              <button
                type="button"
                onClick={markAllAsRead}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#527B7A] hover:text-[#355858] transition-colors cursor-pointer"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                <span>Mark all as read</span>
              </button>
            )}
          </div>

          {/* Popover Content States */}
          <div className="max-h-80 overflow-y-auto">
            {/* Loading State */}
            {isLoading && notifications.length === 0 && (
              <div className="p-4 space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex gap-3 animate-pulse p-2">
                    <div className="w-8 h-8 rounded-lg bg-[#E5E9E3]" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3 bg-[#E5E9E3] rounded w-3/4" />
                      <div className="h-2.5 bg-[#E5E9E3]/70 rounded w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Error State */}
            {error && !isLoading && (
              <div className="p-6 text-center space-y-3">
                <div className="w-10 h-10 rounded-full bg-[#FBF1EF] border border-[#B76F60]/20 text-[#B76F60] flex items-center justify-center mx-auto">
                  <AlertCircle className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-[#293732]">Unable to load notifications</div>
                  <div className="text-[11px] text-[#65736B] mt-0.5">Please check your connection and retry.</div>
                </div>
                <button
                  type="button"
                  onClick={fetchNotifications}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-medium bg-[#E5E9E3] text-[#293732] hover:bg-[#D4E3DF] transition-colors cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3 text-[#527B7A]" />
                  <span>Retry</span>
                </button>
              </div>
            )}

            {/* Empty Notification State */}
            {!isLoading && !error && notifications.length === 0 && (
              <div className="p-8 text-center space-y-2.5">
                <div className="w-10 h-10 rounded-full bg-[#E5E9E3] border border-[#DDDCD3] text-[#527B7A] flex items-center justify-center mx-auto">
                  <Inbox className="w-5 h-5" />
                </div>
                <div className="text-xs font-semibold text-[#293732]">No notifications yet</div>
                <p className="text-[11px] text-[#65736B] max-w-[220px] mx-auto leading-relaxed">
                  You&apos;re all caught up with your civic activity and task ledger.
                </p>
              </div>
            )}

            {/* Populated Notifications List */}
            {!error && notifications.length > 0 && (
              <div className="divide-y divide-[#DDDCD3]/50">
                {notifications.map((item) => {
                  const isRead = readIds.has(item.id);
                  return (
                    <div
                      key={item.id}
                      onClick={() => handleNotificationClick(item)}
                      className={`group p-3 transition-colors cursor-pointer flex gap-3 relative ${
                        isRead
                          ? 'bg-white hover:bg-[#FAF9F5]'
                          : 'bg-[#FAF9F5] hover:bg-[#F3F2EB]/80'
                      }`}
                    >
                      {/* Icon */}
                      <div className="w-8 h-8 rounded-xl bg-[#E5E9E3] border border-[#DDDCD3]/70 flex items-center justify-center shrink-0 mt-0.5">
                        {getIconForType(item.type)}
                      </div>

                      {/* Content */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-1.5">
                          <div className="text-xs font-semibold text-[#293732] truncate">
                            {item.title}
                          </div>
                          {!isRead && (
                            <span className="w-2 h-2 rounded-full bg-[#B68B63] shrink-0 mt-1" />
                          )}
                        </div>

                        <p className="text-[11px] text-[#65736B] line-clamp-2 mt-0.5 leading-snug">
                          {item.description}
                        </p>

                        <div className="flex items-center gap-2 mt-1.5 text-[10px] text-[#929B92]">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3 text-[#929B92]" />
                            {formatRelativeTime(item.timestamp)}
                          </span>

                          {item.issueId && (
                            <span className="font-mono px-1 py-0.2 rounded bg-white border border-[#DDDCD3]/60 text-[#527B7A] font-medium">
                              {item.issueId.length > 12 ? item.issueId.slice(0, 10) + '…' : item.issueId}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Hover action: Mark as read button */}
                      {!isRead && (
                        <button
                          type="button"
                          title="Mark as read"
                          onClick={(e) => markAsRead(item.id, e)}
                          className="opacity-0 group-hover:opacity-100 p-1 rounded-lg text-[#929B92] hover:text-[#527B7A] hover:bg-white transition-opacity shrink-0 self-start"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
