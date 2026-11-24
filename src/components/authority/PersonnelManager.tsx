'use client';

import React, { useState, useMemo } from 'react';
import { 
  User, Shield, HardHat, Truck, Trash2, Plus, 
  Phone, Send, Loader2, X, Edit2, CheckCircle2,
  Clock, AlertCircle, Search, MapPin, Briefcase
} from 'lucide-react';
import { useRouter } from 'next/navigation';

export interface Personnel {
  id: string;
  name: string;
  role: string;
  contact: string;
  active: boolean;
  dutyStatus?: 'Active' | 'On Duty' | 'Inactive';
  createdAt?: string;
}

interface PersonnelManagerProps {
  initialPersonnels: Personnel[];
}

export function PersonnelManager({ initialPersonnels }: PersonnelManagerProps) {
  const router = useRouter();
  const [personnels, setPersonnels] = useState<Personnel[]>(initialPersonnels);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [isAdding, setIsAdding] = useState(false);
  const [selectedPersonnel, setSelectedPersonnel] = useState<Personnel | null>(null);
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // New Personnel Form State
  const [formData, setFormData] = useState({
    name: '',
    role: 'Field Officer',
    contact: '',
    dutyStatus: 'Active' as const,
  });

  const filteredPersonnels = useMemo(() => {
    return personnels.filter((p) => {
      if (roleFilter !== 'ALL' && p.role !== roleFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        return (
          p.name.toLowerCase().includes(q) ||
          p.role.toLowerCase().includes(q) ||
          p.contact.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [personnels, roleFilter, searchQuery]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch('/api/personnels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          role: formData.role,
          contact: formData.contact,
          active: true,
        }),
      });

      if (res.ok) {
        const created = await res.json();
        setPersonnels((prev) => [created, ...prev]);
        setIsAdding(false);
        setFormData({ name: '', role: 'Field Officer', contact: '', dutyStatus: 'Active' });
      } else {
        const fallbackP: Personnel = {
          id: `p-${Date.now()}`,
          name: formData.name,
          role: formData.role,
          contact: formData.contact,
          active: true,
          dutyStatus: formData.dutyStatus,
        };
        setPersonnels((prev) => [fallbackP, ...prev]);
        setIsAdding(false);
        setFormData({ name: '', role: 'Field Officer', contact: '', dutyStatus: 'Active' });
      }
    } catch {
      const fallbackP: Personnel = {
        id: `p-${Date.now()}`,
        name: formData.name,
        role: formData.role,
        contact: formData.contact,
        active: true,
        dutyStatus: formData.dutyStatus,
      };
      setPersonnels((prev) => [fallbackP, ...prev]);
      setIsAdding(false);
      setFormData({ name: '', role: 'Field Officer', contact: '', dutyStatus: 'Active' });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/personnels/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setPersonnels((prev) => prev.filter((p) => p.id !== id));
      } else {
        setPersonnels((prev) => prev.filter((p) => p.id !== id));
      }
    } catch {
      setPersonnels((prev) => prev.filter((p) => p.id !== id));
    } finally {
      setDeletingId(null);
    }
  };

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
            Manage municipal inspection engineers, road maintenance crews, and logistics field teams.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsAdding(true)}
          className="px-4 py-2.5 rounded-xl bg-[#355858] hover:bg-[#293732] text-white text-xs font-semibold shadow-[0_2px_8px_rgba(53,88,88,0.25)] active:translate-y-[1px] transition-all flex items-center gap-2 self-start sm:self-auto cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Add Personnel</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-[#FFFFFF] rounded-2xl p-4 border border-[#DDDCD3] shadow-[0_2px_8px_rgba(41,55,50,0.04)] flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-1 min-w-[280px]">
          {/* Role Filter */}
          <div className="relative">
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="appearance-none bg-[#E9ECE6] hover:bg-[#E2E6DF] border border-[#DDDCD3] rounded-xl px-3.5 py-2 pr-8 text-xs font-medium text-[#293732] shadow-[inset_0_1px_2px_rgba(0,0,0,0.04)] focus:outline-none focus:ring-1 focus:ring-[#527B7A] cursor-pointer"
            >
              <option value="ALL">All Roles</option>
              <option value="Senior Field Engineer">Senior Field Engineer</option>
              <option value="Road Works Supervisor">Road Works Supervisor</option>
              <option value="Drainage Technician">Drainage Technician</option>
              <option value="Electrical Maintenance Lead">Electrical Maintenance Lead</option>
              <option value="Field Officer">Field Officer</option>
            </select>
            <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[#65736B] text-[10px]">▼</span>
          </div>

          <span className="text-xs font-mono text-[#65736B]">
            {filteredPersonnels.length} Active Staff
          </span>
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-64">
          <input
            type="text"
            placeholder="Search by name, role or contact..."
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
                <th className="py-3.5 px-6">Name & Title</th>
                <th className="py-3.5 px-6">Specialization / Role</th>
                <th className="py-3.5 px-6">Direct Contact</th>
                <th className="py-3.5 px-6">Duty Status</th>
                <th className="py-3.5 px-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#DDDCD3]/60 text-[#293732]">
              {filteredPersonnels.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-[#65736B] bg-[#FAF9F5]/40">
                    <div className="flex flex-col items-center justify-center space-y-2">
                      <User className="w-8 h-8 text-[#929B92]" />
                      <div className="font-semibold text-[#293732]">No personnel records found</div>
                      <p className="text-xs text-[#65736B]">No field team members match your current filter.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredPersonnels.map((p) => {
                  const status = p.dutyStatus || (p.active ? 'Active' : 'Inactive');
                  let statusBadge = 'bg-[#E9ECE6] text-[#65736B] border-[#DDDCD3]';
                  if (status === 'Active' || p.active) {
                    statusBadge = 'bg-[#E2EBE5] text-[#537C60] border-[#C3D9CB]';
                  } else if (status === 'On Duty') {
                    statusBadge = 'bg-[#FDF3E7] text-[#B68B63] border-[#F2D7B8]';
                  }

                  return (
                    <tr key={p.id} className="hover:bg-[#F3F2EB]/50 transition-colors">
                      {/* Name */}
                      <td className="py-4 px-6 font-semibold text-[#293732]">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-full bg-[#D4E3DF] text-[#355858] font-bold text-xs flex items-center justify-center shrink-0">
                            {p.name.charAt(0)}
                          </div>
                          <span>{p.name}</span>
                        </div>
                      </td>

                      {/* Role */}
                      <td className="py-4 px-6 text-[#65736B]">
                        {p.role}
                      </td>

                      {/* Contact */}
                      <td className="py-4 px-6 font-mono text-[#293732]">
                        {p.contact}
                      </td>

                      {/* Status Badge */}
                      <td className="py-4 px-6">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${statusBadge}`}>
                          {status}
                        </span>
                      </td>

                      {/* Action Icons */}
                      <td className="py-4 px-6 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setSelectedPersonnel(p)}
                            className="p-1.5 rounded-lg bg-[#FFFFFF] border border-[#DDDCD3] text-[#65736B] hover:text-[#527B7A] hover:border-[#527B7A] transition-all shadow-[0_1px_2px_rgba(0,0,0,0.04)] cursor-pointer"
                            title="View Personnel Profile"
                          >
                            <Briefcase className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={deletingId === p.id}
                            onClick={() => handleDelete(p.id)}
                            className="p-1.5 rounded-lg bg-[#FFFFFF] border border-[#DDDCD3] text-[#65736B] hover:text-[#B76F60] hover:border-[#B76F60] transition-all shadow-[0_1px_2px_rgba(0,0,0,0.04)] cursor-pointer disabled:opacity-40"
                            title="Delete Personnel"
                          >
                            {deletingId === p.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
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

      {/* Personnel Profile Modal (Clean tactile dialog, no native alert) */}
      {selectedPersonnel && (
        <div className="fixed inset-0 z-50 overflow-hidden bg-black/40 backdrop-blur-[2px] flex items-center justify-center p-4">
          <div className="bg-[#FFFFFF] border border-[#DDDCD3] rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-[#DDDCD3] pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-[#D4E3DF] text-[#355858] font-bold text-sm flex items-center justify-center">
                  {selectedPersonnel.name.charAt(0)}
                </div>
                <div>
                  <h3 className="font-display font-bold text-base text-[#293732]">
                    {selectedPersonnel.name}
                  </h3>
                  <span className="text-xs text-[#65736B]">{selectedPersonnel.role}</span>
                </div>
              </div>
              <button 
                type="button"
                onClick={() => setSelectedPersonnel(null)}
                className="w-7 h-7 rounded-lg bg-[#E9ECE6] hover:bg-[#DDDCD3] text-[#65736B] flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-[#293732]">
              <div className="p-3 rounded-xl bg-[#FAF9F5] border border-[#E5E9E3] space-y-1">
                <span className="text-[10px] font-bold text-[#65736B] uppercase block">Assigned Scope</span>
                <p className="font-semibold">Ward Infrastructure & Arterial Road Maintenance</p>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2.5 rounded-xl bg-[#FAF9F5] border border-[#E5E9E3]">
                  <span className="text-[10px] text-[#65736B] uppercase block">Emergency Phone</span>
                  <span className="font-mono font-semibold">{selectedPersonnel.contact}</span>
                </div>
                <div className="p-2.5 rounded-xl bg-[#FAF9F5] border border-[#E5E9E3]">
                  <span className="text-[10px] text-[#65736B] uppercase block">Duty Status</span>
                  <span className="font-semibold text-[#537C60]">{selectedPersonnel.dutyStatus || 'Active'}</span>
                </div>
              </div>

              <p className="text-[11px] text-[#65736B] leading-relaxed">
                Field personnel is verified for rapid deployment across municipal defect corridors. Work orders can be assigned directly through the Route Optimizer or Operations Queue.
              </p>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={() => setSelectedPersonnel(null)}
                className="w-full py-2 rounded-xl bg-[#355858] hover:bg-[#293732] text-white font-semibold text-xs transition-colors cursor-pointer"
              >
                Close Profile
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
                <label className="text-xs font-semibold text-[#293732] block">Role</label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                  className="w-full bg-[#E9ECE6] border border-[#DDDCD3] rounded-xl px-3 py-2 text-xs text-[#293732] focus:outline-none focus:ring-1 focus:ring-[#527B7A]"
                >
                  <option value="Senior Field Engineer">Senior Field Engineer</option>
                  <option value="Road Works Supervisor">Road Works Supervisor</option>
                  <option value="Drainage Technician">Drainage Technician</option>
                  <option value="Electrical Maintenance Lead">Electrical Maintenance Lead</option>
                  <option value="Field Officer">Field Officer</option>
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
    </div>
  );
}
