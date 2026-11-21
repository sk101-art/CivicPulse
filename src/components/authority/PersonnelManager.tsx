'use client';

import { useState } from 'react';
import { 
  User, Shield, HardHat, Truck, Trash2, Plus, 
  Phone, Send, Loader2, X, Edit2, CheckCircle2,
  Clock, AlertCircle
} from 'lucide-react';
import { useRouter } from 'next/navigation';

interface Personnel {
  id: string;
  name: string;
  role: string;
  contact: string;
  active: boolean;
  dutyStatus?: 'Active' | 'On Duty' | 'Inactive';
}

const DEFAULT_PERSONNEL: Personnel[] = [
  { id: 'p-1', name: 'Ravi Kumar', role: 'Field Officer', contact: '+91 98765 43021', active: true, dutyStatus: 'Active' },
  { id: 'p-2', name: 'Meera Nair', role: 'Supervisor', contact: '+91 98456 76120', active: true, dutyStatus: 'Active' },
  { id: 'p-3', name: 'Arjun Patel', role: 'Technician', contact: '+91 99879 22109', active: true, dutyStatus: 'On Duty' },
  { id: 'p-4', name: 'S. Ramesh', role: 'Field Worker', contact: '+91 98123 77090', active: false, dutyStatus: 'Inactive' },
];

export function PersonnelManager({ initialPersonnels }: { initialPersonnels: Personnel[] }) {
  const [personnels, setPersonnels] = useState<Personnel[]>(
    initialPersonnels.length > 0 ? initialPersonnels : DEFAULT_PERSONNEL
  );
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({ name: '', role: 'Field Officer', contact: '', dutyStatus: 'Active' as const });
  const router = useRouter();

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch('/api/personnels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      if (res.ok) {
        const newP = await res.json();
        setPersonnels([newP, ...personnels]);
        setIsAdding(false);
        setFormData({ name: '', role: 'Field Officer', contact: '', dutyStatus: 'Active' });
        router.refresh();
      } else {
        // Fallback local addition if api is in read-only / offline dev mode
        const fallbackP: Personnel = {
          id: `p-${Date.now()}`,
          name: formData.name,
          role: formData.role,
          contact: formData.contact,
          active: true,
          dutyStatus: formData.dutyStatus,
        };
        setPersonnels([fallbackP, ...personnels]);
        setIsAdding(false);
        setFormData({ name: '', role: 'Field Officer', contact: '', dutyStatus: 'Active' });
      }
    } catch (e) {
      const fallbackP: Personnel = {
        id: `p-${Date.now()}`,
        name: formData.name,
        role: formData.role,
        contact: formData.contact,
        active: true,
        dutyStatus: formData.dutyStatus,
      };
      setPersonnels([fallbackP, ...personnels]);
      setIsAdding(false);
      setFormData({ name: '', role: 'Field Officer', contact: '', dutyStatus: 'Active' });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to remove this personnel record?')) return;
    try {
      const res = await fetch(`/api/personnels/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setPersonnels(personnels.filter(p => p.id !== id));
        router.refresh();
      } else {
        setPersonnels(personnels.filter(p => p.id !== id));
      }
    } catch (e) {
      setPersonnels(personnels.filter(p => p.id !== id));
    }
  };

  return (
    <div className="space-y-6">
      {/* Editorial Header (Exact match to Row 4, Col 4) */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[#DDDCD3] pb-5">
        <div>
          <h1 className="text-3xl font-display font-bold text-[#293732] tracking-tight">
            Field Personnel
          </h1>
          <p className="text-xs text-[#65736B] font-sans mt-1">
            Manage municipal field teams and staff.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsAdding(true)}
          className="px-5 py-2.5 rounded-xl bg-[#355858] hover:bg-[#293732] text-white text-xs font-semibold shadow-[0_2px_8px_rgba(53,88,88,0.25)] active:translate-y-[1px] transition-all flex items-center gap-2 self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Add Personnel</span>
        </button>
      </div>

      {/* Swiss-Grid Civic Ledger Table (Row 4, Col 4) */}
      <div className="bg-[#FFFFFF] rounded-2xl border border-[#DDDCD3] shadow-[0_4px_20px_rgba(41,55,50,0.04)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-[#DDDCD3] bg-[#F7F8F5] text-[11px] font-sans font-semibold text-[#65736B] uppercase tracking-wider">
                <th className="py-3.5 px-6">Name</th>
                <th className="py-3.5 px-6">Role</th>
                <th className="py-3.5 px-6">Contact</th>
                <th className="py-3.5 px-6">Status</th>
                <th className="py-3.5 px-6 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#DDDCD3]/60 text-[#293732]">
              {personnels.map((p) => {
                const status = p.dutyStatus || (p.active ? 'Active' : 'Inactive');
                let statusBadge = 'bg-[#E9ECE6] text-[#65736B] border-[#DDDCD3]';
                if (status === 'Active') {
                  statusBadge = 'bg-[#E2EBE5] text-[#537C60] border-[#C3D9CB]';
                } else if (status === 'On Duty') {
                  statusBadge = 'bg-[#FDF3E7] text-[#B68B63] border-[#F2D7B8]';
                }

                return (
                  <tr key={p.id} className="hover:bg-[#F3F2EB]/50 transition-colors">
                    {/* Name */}
                    <td className="py-4 px-6 font-semibold text-[#293732]">
                      {p.name}
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
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-[11px] font-semibold border ${statusBadge}`}>
                        {status}
                      </span>
                    </td>

                    {/* Action Icons */}
                    <td className="py-4 px-6 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => alert(`Details for ${p.name}: Active on Ward 12 logistics.`)}
                          className="w-7 h-7 rounded-lg bg-[#FFFFFF] border border-[#DDDCD3] text-[#65736B] hover:text-[#527B7A] hover:border-[#527B7A] flex items-center justify-center transition-all shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
                          title="Edit / View"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(p.id)}
                          className="w-7 h-7 rounded-lg bg-[#FFFFFF] border border-[#DDDCD3] text-[#65736B] hover:text-[#B76F60] hover:border-[#B76F60] flex items-center justify-center transition-all shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
                          title="Delete Personnel"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Personnel Modal */}
      {isAdding && (
        <div className="fixed inset-0 z-50 overflow-hidden bg-black/40 backdrop-blur-[2px] flex items-center justify-center p-4">
          <div className="bg-[#FFFFFF] border border-[#DDDCD3] rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-[#DDDCD3] pb-3">
              <h3 className="font-display font-bold text-lg text-[#293732]">
                Add Field Personnel
              </h3>
              <button 
                onClick={() => setIsAdding(false)}
                className="w-7 h-7 rounded-lg bg-[#E9ECE6] hover:bg-[#DDDCD3] text-[#65736B] flex items-center justify-center"
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
                  <option value="Field Officer">Field Officer</option>
                  <option value="Supervisor">Supervisor</option>
                  <option value="Technician">Technician</option>
                  <option value="Field Worker">Field Worker</option>
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

              <div className="space-y-1">
                <label className="text-xs font-semibold text-[#293732] block">Duty Status</label>
                <select
                  value={formData.dutyStatus}
                  onChange={(e) => setFormData({ ...formData, dutyStatus: e.target.value as any })}
                  className="w-full bg-[#E9ECE6] border border-[#DDDCD3] rounded-xl px-3 py-2 text-xs text-[#293732] focus:outline-none focus:ring-1 focus:ring-[#527B7A]"
                >
                  <option value="Active">Active</option>
                  <option value="On Duty">On Duty</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAdding(false)}
                  className="px-4 py-2 rounded-xl bg-[#E9ECE6] text-[#293732] text-xs font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-5 py-2 rounded-xl bg-[#355858] text-white text-xs font-semibold shadow-md flex items-center gap-1.5"
                >
                  {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Save Personnel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
