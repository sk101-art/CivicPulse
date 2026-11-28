'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  User,
  Trash2,
  Plus,
  Loader2,
  X,
  Edit2,
  CheckCircle2,
  AlertCircle,
  Search,
  Briefcase,
  RefreshCw,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { EnrichedPersonnel } from '@/lib/desk/personnelData';
import { subscribeIssueUpdates, notifyIssueUpdated } from '@/lib/map/statusPresentation';
import { formatDateIST } from '@/lib/time/ist';

export type Personnel = EnrichedPersonnel;

interface PersonnelManagerProps {
  initialPersonnels: Personnel[];
}

const ROLE_OPTIONS = [
  'Senior Field Engineer',
  'Road Works Supervisor',
  'Drainage Technician',
  'Electrical Maintenance Lead',
  'Field Officer',
];

function formatShortId(id: string): string {
  if (id.startsWith('CP-') || id.startsWith('FP-')) return id;
  return id.slice(-6).toUpperCase();
}

export function PersonnelManager({ initialPersonnels }: PersonnelManagerProps) {
  const router = useRouter();
  const [personnels, setPersonnels] = useState<Personnel[]>(initialPersonnels);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [isAdding, setIsAdding] = useState(false);
  const [editingPersonnel, setEditingPersonnel] = useState<Personnel | null>(null);
  const [selectedPersonnel, setSelectedPersonnel] = useState<Personnel | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    role: 'Field Officer',
    contact: '',
    active: true,
  });

  const [editData, setEditData] = useState({
    name: '',
    role: 'Field Officer',
    contact: '',
    active: true,
  });

  const fetchPersonnels = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const params = new URLSearchParams();
      if (roleFilter !== 'ALL') params.set('role', roleFilter);
      if (statusFilter !== 'ALL') params.set('status', statusFilter);
      if (searchQuery.trim()) params.set('search', searchQuery.trim());

      const res = await fetch(`/api/personnels?${params.toString()}`, { cache: 'no-store' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setErrorMsg(err.error || 'Failed to load field personnel directory.');
        return;
      }
      const data = await res.json();
      if (Array.isArray(data)) {
        setPersonnels(data);
      }
    } catch (err) {
      console.error('Failed to refresh personnels:', err);
      setErrorMsg('Network error refreshing personnel directory.');
    } finally {
      setIsRefreshing(false);
    }
  }, [roleFilter, statusFilter, searchQuery]);

  // Keep personnel workload & status synced across Operations Queue / Route Optimizer / Claim Gap
  useEffect(() => {
    const unsubscribe = subscribeIssueUpdates(() => {
      void fetchPersonnels();
    });
    const onFocus = () => {
      if (document.visibilityState === 'visible') {
        void fetchPersonnels();
      }
    };
    window.addEventListener('focus', onFocus);
    return () => {
      unsubscribe();
      window.removeEventListener('focus', onFocus);
    };
  }, [fetchPersonnels]);

  // Refetch from backend when filters change
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchPersonnels();
    }, 180);
    return () => window.clearTimeout(timer);
  }, [fetchPersonnels]);

  const filteredPersonnels = useMemo(() => {
    return personnels.filter((p) => {
      if (roleFilter !== 'ALL' && p.role !== roleFilter) return false;
      if (statusFilter === 'ACTIVE' && p.dutyStatus !== 'Active') return false;
      if (statusFilter === 'ON_DUTY' && p.dutyStatus !== 'On Duty') return false;
      if (statusFilter === 'INACTIVE' && p.active) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        return (
          p.name.toLowerCase().includes(q) ||
          p.id.toLowerCase().includes(q) ||
          p.role.toLowerCase().includes(q) ||
          p.contact.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [personnels, roleFilter, statusFilter, searchQuery]);

  const openProfile = async (p: Personnel) => {
    setSelectedPersonnel(p);
    setLoadingDetail(true);
    try {
      const res = await fetch(`/api/personnels/${p.id}`, { cache: 'no-store' });
      if (res.ok) {
        const detail = await res.json();
        setSelectedPersonnel(detail);
      }
    } catch {
      // Keep initial summary if detail refresh fails
    } finally {
      setLoadingDetail(false);
    }
  };

  const openEditModal = (p: Personnel) => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setEditingPersonnel(p);
    setEditData({
      name: p.name,
      role: p.role,
      contact: p.contact,
      active: p.active,
    });
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await fetch('/api/personnels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || data.message || 'Failed to add personnel');
      }

      setPersonnels((prev) => [data, ...prev]);
      setIsAdding(false);
      setFormData({ name: '', role: 'Field Officer', contact: '', active: true });
      setSuccessMsg(`Added ${data.name} to field personnel roster.`);
      notifyIssueUpdated();
      router.refresh();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to create personnel record');
    } finally {
      setLoading(false);
    }
  };

  const handleEditSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPersonnel) return;
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await fetch(`/api/personnels/${editingPersonnel.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editData),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update personnel record');
      }

      setPersonnels((prev) => prev.map((item) => (item.id === editingPersonnel.id ? data : item)));
      if (selectedPersonnel?.id === editingPersonnel.id) {
        setSelectedPersonnel(data);
      }
      setEditingPersonnel(null);
      setSuccessMsg(`Updated ${data.name}'s profile and duty status.`);
      notifyIssueUpdated();
      router.refresh();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to update personnel');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleActive = async (p: Personnel) => {
    setTogglingId(p.id);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await fetch(`/api/personnels/${p.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !p.active }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update personnel status');
      }
      setPersonnels((prev) => prev.map((item) => (item.id === p.id ? data : item)));
      if (selectedPersonnel?.id === p.id) {
        setSelectedPersonnel(data);
      }
      setSuccessMsg(`${p.name} marked as ${data.active ? data.dutyStatus : 'Inactive'}.`);
      notifyIssueUpdated();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to update personnel status');
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await fetch(`/api/personnels/${id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Failed to remove personnel');
      }
      if (data.deactivated) {
        setPersonnels((prev) =>
          prev.map((p) => (p.id === id ? { ...p, active: false, dutyStatus: 'Inactive' } : p))
        );
        setSuccessMsg('Personnel has historical assignments — deactivated instead of deleting.');
      } else {
        setPersonnels((prev) => prev.filter((p) => p.id !== id));
        setSuccessMsg('Personnel record removed.');
      }
      notifyIssueUpdated();
      router.refresh();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to delete personnel');
    } finally {
      setDeletingId(null);
    }
  };

  const activeCountTotal = filteredPersonnels.filter((p) => p.active).length;
  const hasFilters = roleFilter !== 'ALL' || statusFilter !== 'ALL' || searchQuery.trim() !== '';

  return (
    <div className="space-y-6">
      {/* Editorial Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[#DDDCD3] pb-5">
        <div>
          <div className="text-[11px] font-mono font-bold text-[#527B7A] uppercase tracking-wider mb-1">
            MUNICIPAL OPERATIONS ROSTER
          </div>
          <h1 className="text-3xl font-display font-bold text-[#293732] tracking-tight">
            Field Personnel
          </h1>
          <p className="text-xs text-[#65736B] font-sans mt-1">
            Manage municipal inspection engineers, road maintenance crews, active workload, and assignment history.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => void fetchPersonnels()}
            disabled={isRefreshing}
            title="Refresh directory"
            className="px-3 py-2.5 rounded-xl bg-[#FFFFFF] border border-[#DDDCD3] text-[#293732] hover:bg-[#FAF9F5] text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-[#527B7A] ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setErrorMsg(null);
              setSuccessMsg(null);
              setIsAdding(true);
            }}
            data-testid="add-personnel-btn"
            className="px-4 py-2.5 rounded-xl bg-[#355858] hover:bg-[#293732] text-white text-xs font-semibold shadow-[0_2px_8px_rgba(53,88,88,0.25)] active:translate-y-[1px] transition-all flex items-center gap-2 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Personnel</span>
          </button>
        </div>
      </div>

      {/* Error / Success Banners */}
      {errorMsg && (
        <div className="p-3.5 rounded-xl bg-[#FCEBE6] border border-[#F5C7BD] text-xs text-[#B76F60] flex items-center justify-between gap-2 animate-in fade-in duration-150">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button type="button" onClick={() => setErrorMsg(null)} className="text-[#B76F60] hover:opacity-75">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
      {successMsg && (
        <div className="p-3.5 rounded-xl bg-[#EBF3ED] border border-[#CDE3D2] text-xs text-[#537C60] flex items-center justify-between gap-2 animate-in fade-in duration-150">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button type="button" onClick={() => setSuccessMsg(null)} className="text-[#537C60] hover:opacity-75">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="bg-[#FFFFFF] rounded-2xl p-4 border border-[#DDDCD3] shadow-[0_2px_8px_rgba(41,55,50,0.04)] flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[280px]">
          {/* Role Filter */}
          <div className="relative">
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              aria-label="Filter by role"
              className="appearance-none bg-[#E9ECE6] hover:bg-[#E2E6DF] border border-[#DDDCD3] rounded-xl px-3.5 py-2 pr-8 text-xs font-medium text-[#293732] shadow-[inset_0_1px_2px_rgba(0,0,0,0.04)] focus:outline-none focus:ring-1 focus:ring-[#527B7A] cursor-pointer"
            >
              <option value="ALL">All Roles</option>
              {ROLE_OPTIONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[#65736B] text-[10px]">
              ▼
            </span>
          </div>

          {/* Duty Status Filter */}
          <div className="relative">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="Filter by duty status"
              className="appearance-none bg-[#E9ECE6] hover:bg-[#E2E6DF] border border-[#DDDCD3] rounded-xl px-3.5 py-2 pr-8 text-xs font-medium text-[#293732] shadow-[inset_0_1px_2px_rgba(0,0,0,0.04)] focus:outline-none focus:ring-1 focus:ring-[#527B7A] cursor-pointer"
            >
              <option value="ALL">All Duty Status</option>
              <option value="ACTIVE">Active (Available)</option>
              <option value="ON_DUTY">On Duty (Assigned)</option>
              <option value="INACTIVE">Inactive</option>
            </select>
            <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[#65736B] text-[10px]">
              ▼
            </span>
          </div>

          <span className="text-xs font-mono text-[#65736B]">
            {filteredPersonnels.length} Shown ({activeCountTotal} Active)
          </span>

          {hasFilters && (
            <button
              type="button"
              onClick={() => {
                setRoleFilter('ALL');
                setStatusFilter('ALL');
                setSearchQuery('');
              }}
              className="text-xs font-semibold text-[#527B7A] hover:text-[#355858] underline cursor-pointer"
            >
              Clear filters
            </button>
          )}
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-64">
          <input
            type="text"
            placeholder="Search name, ID, role, contact..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#E9ECE6] border border-[#DDDCD3] rounded-xl pl-8 pr-3 py-2 text-xs font-sans text-[#293732] placeholder:text-[#929B92] shadow-[inset_0_1px_2px_rgba(0,0,0,0.05)] focus:outline-none focus:ring-1 focus:ring-[#527B7A]"
          />
          <Search className="w-3.5 h-3.5 text-[#929B92] absolute left-2.5 top-1/2 -translate-y-1/2" />
        </div>
      </div>

      {/* Swiss-Grid Civic Ledger Table */}
      <div className="bg-[#FFFFFF] rounded-2xl border border-[#DDDCD3] shadow-[0_4px_20px_rgba(41,55,50,0.04)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-[#DDDCD3] bg-[#F7F8F5] text-[11px] font-sans font-semibold text-[#65736B] uppercase tracking-wider select-none">
                <th className="py-3.5 px-6">Name &amp; ID</th>
                <th className="py-3.5 px-6">Specialization / Role</th>
                <th className="py-3.5 px-6">Direct Contact</th>
                <th className="py-3.5 px-6">Workload</th>
                <th className="py-3.5 px-6">Duty Status</th>
                <th className="py-3.5 px-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#DDDCD3]/60 text-[#293732]">
              {filteredPersonnels.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-[#65736B] bg-[#FAF9F5]/40">
                    <div className="flex flex-col items-center justify-center space-y-2">
                      <User className="w-8 h-8 text-[#929B92]" />
                      <div className="font-semibold text-[#293732]">No personnel records found</div>
                      <p className="text-xs text-[#65736B]">
                        No field team members match your current filter.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredPersonnels.map((p) => {
                  const status = p.dutyStatus || (p.active ? 'Active' : 'Inactive');
                  let statusBadge = 'bg-[#E9ECE6] text-[#65736B] border-[#DDDCD3]';
                  if (status === 'On Duty') {
                    statusBadge = 'bg-[#FDF3E7] text-[#B68B63] border-[#F2D7B8]';
                  } else if (status === 'Active') {
                    statusBadge = 'bg-[#E2EBE5] text-[#537C60] border-[#C3D9CB]';
                  }

                  const wl = p.workload ?? {
                    activeCount: 0,
                    pendingCount: 0,
                    inProgressCount: 0,
                    completedCount: 0,
                    overdueCount: 0,
                  };

                  return (
                    <tr key={p.id} className="hover:bg-[#F3F2EB]/50 transition-colors">
                      {/* Name & ID */}
                      <td className="py-4 px-6 font-semibold text-[#293732]">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-full bg-[#D4E3DF] text-[#355858] font-bold text-xs flex items-center justify-center shrink-0">
                            {p.name.charAt(0)}
                          </div>
                          <div>
                            <div>{p.name}</div>
                            <div className="text-[10px] font-mono text-[#65736B]">
                              ID: {formatShortId(p.id)}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Role */}
                      <td className="py-4 px-6 text-[#65736B]">{p.role}</td>

                      {/* Contact */}
                      <td className="py-4 px-6 font-mono text-[#293732]">{p.contact}</td>

                      {/* Workload */}
                      <td className="py-4 px-6">
                        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                          <span className="px-2 py-0.5 rounded-md bg-[#FAF9F5] border border-[#DDDCD3] font-mono font-semibold text-[#355858]">
                            {wl.activeCount} active
                          </span>
                          <span className="text-[#65736B] font-mono">
                            · {wl.completedCount} done
                          </span>
                          {wl.overdueCount > 0 && (
                            <span className="px-1.5 py-0.5 rounded bg-[#FBF1EF] border border-[#EAC8C1] text-[#B76F60] font-mono font-semibold">
                              {wl.overdueCount} overdue
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Status Badge (Click to toggle active/inactive) */}
                      <td className="py-4 px-6">
                        <button
                          type="button"
                          disabled={togglingId === p.id}
                          onClick={() => handleToggleActive(p)}
                          title="Click to toggle active/inactive eligibility"
                          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border transition-all cursor-pointer hover:opacity-80 disabled:opacity-50 ${statusBadge}`}
                        >
                          {togglingId === p.id && <Loader2 className="w-3 h-3 animate-spin" />}
                          {status}
                        </button>
                      </td>

                      {/* Action Icons */}
                      <td className="py-4 px-6 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => void openProfile(p)}
                            data-testid={`view-personnel-${p.id}`}
                            className="p-1.5 rounded-lg bg-[#FFFFFF] border border-[#DDDCD3] text-[#65736B] hover:text-[#527B7A] hover:border-[#527B7A] transition-all shadow-[0_1px_2px_rgba(0,0,0,0.04)] cursor-pointer"
                            title="View Profile & Workload"
                          >
                            <Briefcase className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => openEditModal(p)}
                            data-testid={`edit-personnel-${p.id}`}
                            className="p-1.5 rounded-lg bg-[#FFFFFF] border border-[#DDDCD3] text-[#65736B] hover:text-[#355858] hover:border-[#355858] transition-all shadow-[0_1px_2px_rgba(0,0,0,0.04)] cursor-pointer"
                            title="Edit Personnel"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={deletingId === p.id}
                            onClick={() => handleDelete(p.id)}
                            className="p-1.5 rounded-lg bg-[#FFFFFF] border border-[#DDDCD3] text-[#65736B] hover:text-[#B76F60] hover:border-[#B76F60] transition-all shadow-[0_1px_2px_rgba(0,0,0,0.04)] cursor-pointer disabled:opacity-40"
                            title="Deactivate or Delete Personnel"
                          >
                            {deletingId === p.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Personnel Profile, Workload & Assignment History Modal */}
      {selectedPersonnel && (
        <div className="fixed inset-0 z-50 overflow-hidden bg-black/40 backdrop-blur-[2px] flex items-center justify-center p-4">
          <div className="bg-[#FFFFFF] border border-[#DDDCD3] rounded-2xl p-6 max-w-2xl w-full max-h-[85vh] overflow-y-auto shadow-2xl space-y-5 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-[#DDDCD3] pb-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-[#D4E3DF] text-[#355858] font-bold text-sm flex items-center justify-center">
                  {selectedPersonnel.name.charAt(0)}
                </div>
                <div>
                  <h3 className="font-display font-bold text-lg text-[#293732]">
                    {selectedPersonnel.name}
                  </h3>
                  <div className="text-xs text-[#65736B] flex items-center gap-2">
                    <span>{selectedPersonnel.role}</span>
                    <span>·</span>
                    <span className="font-mono">ID: {selectedPersonnel.id}</span>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPersonnel(null)}
                className="w-8 h-8 rounded-lg bg-[#E9ECE6] hover:bg-[#DDDCD3] text-[#65736B] flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Profile & Workload Summary */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
              <div className="p-3 rounded-xl bg-[#FAF9F5] border border-[#E5E9E3]">
                <div className="text-[10px] text-[#65736B] uppercase">Active</div>
                <div className="text-xl font-display font-bold text-[#355858]">
                  {selectedPersonnel.workload?.activeCount ?? 0}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-[#FAF9F5] border border-[#E5E9E3]">
                <div className="text-[10px] text-[#65736B] uppercase">Pending</div>
                <div className="text-xl font-display font-bold text-[#B68B63]">
                  {selectedPersonnel.workload?.pendingCount ?? 0}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-[#FAF9F5] border border-[#E5E9E3]">
                <div className="text-[10px] text-[#65736B] uppercase">Completed</div>
                <div className="text-xl font-display font-bold text-[#537C60]">
                  {selectedPersonnel.workload?.completedCount ?? 0}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-[#FAF9F5] border border-[#E5E9E3]">
                <div className="text-[10px] text-[#65736B] uppercase">Overdue SLA</div>
                <div className="text-xl font-display font-bold text-[#B76F60]">
                  {selectedPersonnel.workload?.overdueCount ?? 0}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
              <div className="p-3 rounded-xl bg-[#FAF9F5] border border-[#E5E9E3] flex items-center justify-between">
                <span className="text-[#65736B]">Direct Contact</span>
                <span className="font-mono font-semibold text-[#293732]">{selectedPersonnel.contact}</span>
              </div>
              <div className="p-3 rounded-xl bg-[#FAF9F5] border border-[#E5E9E3] flex items-center justify-between">
                <span className="text-[#65736B]">Duty Status</span>
                <span className="font-semibold text-[#355858]">{selectedPersonnel.dutyStatus}</span>
              </div>
            </div>

            {/* Active Assignments */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-[#65736B]">
                  Current Active Assignments
                </h4>
                {loadingDetail && <Loader2 className="w-3.5 h-3.5 animate-spin text-[#527B7A]" />}
              </div>
              {(selectedPersonnel.activeAssignments?.length ?? 0) === 0 ? (
                <div className="p-4 rounded-xl bg-[#FAF9F5] border border-[#E5E9E3] text-xs text-[#65736B]">
                  No active assignments currently queued.
                </div>
              ) : (
                <div className="space-y-2">
                  {selectedPersonnel.activeAssignments.map((a) => (
                    <div
                      key={a.id}
                      className="p-3 rounded-xl bg-[#FAF9F5] border border-[#DDDCD3] flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="min-w-0 space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-[#355858]">
                            {formatShortId(a.issueId)}
                          </span>
                          <span className="font-semibold text-[#293732]">
                            {a.category.replace(/_/g, ' ')}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#E9ECE6] text-[#293732] font-semibold">
                            {a.band}
                          </span>
                        </div>
                        <div className="text-[11px] text-[#65736B] truncate">
                          {a.address || 'Coordinates recorded'} · Assigned {formatDateIST(a.assignedAt)}
                        </div>
                      </div>
                      <div className="text-right shrink-0 space-y-0.5">
                        <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#EAF2F0] text-[#355858] border border-[#D0E2DF]">
                          {a.issueStatus.replace(/_/g, ' ')}
                        </span>
                        <div className={`text-[10px] font-mono ${a.slaBreached ? 'text-[#B76F60]' : 'text-[#65736B]'}`}>
                          SLA: {formatDateIST(a.slaDueAt)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Historical Completed Assignments */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-[#65736B]">
                Assignment History ({selectedPersonnel.historicalAssignments?.length ?? 0})
              </h4>
              {(selectedPersonnel.historicalAssignments?.length ?? 0) === 0 ? (
                <div className="p-3 rounded-xl bg-[#FAF9F5] border border-[#E5E9E3] text-xs text-[#65736B]">
                  No completed or transferred assignments recorded yet.
                </div>
              ) : (
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {selectedPersonnel.historicalAssignments.map((a) => (
                    <div
                      key={a.id}
                      className="p-2.5 rounded-xl bg-[#FAF9F5] border border-[#E5E9E3] flex items-center justify-between gap-2 text-[11px]"
                    >
                      <div className="min-w-0 truncate">
                        <span className="font-mono font-semibold text-[#355858] mr-2">
                          {formatShortId(a.issueId)}
                        </span>
                        <span className="text-[#293732]">{a.category.replace(/_/g, ' ')}</span>
                        <span className="text-[#65736B]"> · {a.address || 'Ward sector'}</span>
                      </div>
                      <span className="font-mono text-[#65736B] shrink-0">
                        {formatDateIST(a.completedAt || a.assignedAt)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="pt-2 flex justify-end gap-2 border-t border-[#DDDCD3]">
              <button
                type="button"
                onClick={() => {
                  const target = selectedPersonnel;
                  setSelectedPersonnel(null);
                  openEditModal(target);
                }}
                className="px-4 py-2 rounded-xl bg-[#E9ECE6] hover:bg-[#DDDCD3] text-[#293732] font-semibold text-xs cursor-pointer"
              >
                Edit Profile
              </button>
              <button
                type="button"
                onClick={() => setSelectedPersonnel(null)}
                className="px-5 py-2 rounded-xl bg-[#355858] hover:bg-[#293732] text-white font-semibold text-xs transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Personnel Modal */}
      {isAdding && (
        <div className="fixed inset-0 z-50 overflow-hidden bg-black/40 backdrop-blur-[2px] flex items-center justify-center p-4">
          <div className="bg-[#FFFFFF] border border-[#DDDCD3] rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-[#DDDCD3] pb-3">
              <h3 className="font-display font-bold text-lg text-[#293732]">
                Add Field Personnel
              </h3>
              <button
                type="button"
                onClick={() => setIsAdding(false)}
                className="w-7 h-7 rounded-lg bg-[#E9ECE6] hover:bg-[#DDDCD3] text-[#65736B] flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAdd} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-[#293732] block">Full Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Ramesh Kumar"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full bg-[#E9ECE6] border border-[#DDDCD3] rounded-xl px-3 py-2 text-xs text-[#293732] focus:outline-none focus:ring-1 focus:ring-[#527B7A]"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-[#293732] block">Role / Specialization</label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                  className="w-full bg-[#E9ECE6] border border-[#DDDCD3] rounded-xl px-3 py-2 text-xs text-[#293732] focus:outline-none focus:ring-1 focus:ring-[#527B7A]"
                >
                  {ROLE_OPTIONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-[#293732] block">Contact Number</label>
                <input
                  type="tel"
                  required
                  placeholder="+91 98765 00000"
                  value={formData.contact}
                  onChange={(e) => setFormData({ ...formData, contact: e.target.value })}
                  className="w-full bg-[#E9ECE6] border border-[#DDDCD3] rounded-xl px-3 py-2 text-xs text-[#293732] focus:outline-none focus:ring-1 focus:ring-[#527B7A]"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#DDDCD3]">
                <button
                  type="button"
                  onClick={() => setIsAdding(false)}
                  className="px-4 py-2 rounded-xl border border-[#DDDCD3] text-[#65736B] hover:bg-[#E9ECE6] transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 rounded-xl bg-[#355858] hover:bg-[#293732] text-white font-semibold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                >
                  {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Save Record</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Personnel Modal */}
      {editingPersonnel && (
        <div className="fixed inset-0 z-50 overflow-hidden bg-black/40 backdrop-blur-[2px] flex items-center justify-center p-4">
          <div className="bg-[#FFFFFF] border border-[#DDDCD3] rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-[#DDDCD3] pb-3">
              <h3 className="font-display font-bold text-lg text-[#293732]">
                Edit Field Personnel
              </h3>
              <button
                type="button"
                onClick={() => setEditingPersonnel(null)}
                className="w-7 h-7 rounded-lg bg-[#E9ECE6] hover:bg-[#DDDCD3] text-[#65736B] flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleEditSave} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-[#293732] block">Full Name</label>
                <input
                  type="text"
                  required
                  value={editData.name}
                  onChange={(e) => setEditData({ ...editData, name: e.target.value })}
                  className="w-full bg-[#E9ECE6] border border-[#DDDCD3] rounded-xl px-3 py-2 text-xs text-[#293732] focus:outline-none focus:ring-1 focus:ring-[#527B7A]"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-[#293732] block">Role / Specialization</label>
                <select
                  value={editData.role}
                  onChange={(e) => setEditData({ ...editData, role: e.target.value })}
                  className="w-full bg-[#E9ECE6] border border-[#DDDCD3] rounded-xl px-3 py-2 text-xs text-[#293732] focus:outline-none focus:ring-1 focus:ring-[#527B7A]"
                >
                  {ROLE_OPTIONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-[#293732] block">Contact Number</label>
                <input
                  type="tel"
                  required
                  value={editData.contact}
                  onChange={(e) => setEditData({ ...editData, contact: e.target.value })}
                  className="w-full bg-[#E9ECE6] border border-[#DDDCD3] rounded-xl px-3 py-2 text-xs text-[#293732] focus:outline-none focus:ring-1 focus:ring-[#527B7A]"
                />
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-[#FAF9F5] border border-[#DDDCD3]">
                <span className="font-semibold text-[#293732]">Eligible for Assignments (Active)</span>
                <input
                  type="checkbox"
                  checked={editData.active}
                  onChange={(e) => setEditData({ ...editData, active: e.target.checked })}
                  className="w-4 h-4 accent-[#355858] cursor-pointer"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#DDDCD3]">
                <button
                  type="button"
                  onClick={() => setEditingPersonnel(null)}
                  className="px-4 py-2 rounded-xl border border-[#DDDCD3] text-[#65736B] hover:bg-[#E9ECE6] transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 rounded-xl bg-[#355858] hover:bg-[#293732] text-white font-semibold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                >
                  {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Save Changes</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
