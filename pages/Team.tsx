
import React, { useState, useEffect } from 'react';
import { db } from '../services/mockBackend';
import { User, UserRole } from '../types';
import { Plus, Trash2, UserPlus, Shield, Mail, Key, ShieldCheck, CheckCircle2, Users, Lock } from 'lucide-react';

interface TeamProps {
  tenantId: string;
  shopName: string;
}

const AVAILABLE_PERMISSIONS = [
    { id: 'dashboard', label: 'Dashboard Access' },
    { id: 'leads', label: 'Inbound Leads' },
    { id: 'selling', label: 'Selling Pipeline' },
    { id: 'shipping', label: 'Logistics Access' },
    { id: 'today_shipped', label: 'Daily Logs' },
    { id: 'return_mgmt', label: 'Returns Hub' },
    { id: 'residual_mgmt', label: 'Residual Hub' },
    { id: 'financials', label: 'Financial Center' },
    { id: 'inventory', label: 'Inventory Control' },
    { id: 'returns', label: 'OMS Scan Terminal' }
];

export const Team: React.FC<TeamProps> = ({ tenantId, shopName }) => {
  const [users, setUsers] = useState<User[]>([]);
  const [newUsername, setNewUsername] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<UserRole>(UserRole.ADMIN);
  const [newPermissions, setNewPermissions] = useState<string[]>(['selling']); // Default access
  const [isSaving, setIsSaving] = useState(false);

  const load = async () => {
    setUsers(await db.getTeamMembers(tenantId));
  };

  useEffect(() => { load(); }, [tenantId]);

  const togglePermission = (id: string) => {
    setNewPermissions(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const handleAdd = async () => {
      if(!newUsername || !newPassword) return alert("Credentials required.");
      setIsSaving(true);
      try {
        await db.addTeamMember(tenantId, newUsername, newRole, newEmail, newPassword, newPermissions);
        setNewUsername('');
        setNewEmail('');
        setNewPassword('');
        setNewPermissions(['selling']);
        load();
        alert("Staff member successfully integrated into cluster.");
      } finally {
        setIsSaving(false);
      }
  };

  const handleRemove = async (id: string) => {
      if (!confirm("CRITICAL: Revoke all access for this staff member?")) return;
      await db.removeTeamMember(id);
      load();
  };

  return (
    <div className="max-w-6xl mx-auto space-y-10 pb-20 animate-slide-in">
        <div className="flex items-center gap-4 px-2">
            <div className="p-4 bg-slate-900 text-white rounded-[1.5rem] shadow-xl">
                <Users size={32} />
            </div>
            <div>
                <h2 className="text-4xl font-black text-slate-900 tracking-tighter uppercase leading-none">{shopName} Team</h2>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-2">Staff Access & Permissions Delegation</p>
            </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
            <div className="lg:col-span-8 space-y-8">
                {/* Provision Form */}
                <div className="bg-white p-10 rounded-[3rem] border border-slate-100 shadow-sm space-y-10">
                    <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter flex items-center gap-3">
                        <UserPlus size={24} className="text-blue-600"/> Provision New Staff
                    </h3>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Account Username</label>
                            <input 
                                className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-3.5 text-sm font-black outline-none focus:ring-2 focus:ring-blue-600 transition-all"
                                value={newUsername}
                                onChange={e => setNewUsername(e.target.value)}
                                placeholder="Ex. agent_01"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Staff Email</label>
                            <input 
                                type="email"
                                className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-3.5 text-sm font-black outline-none focus:ring-2 focus:ring-blue-600 transition-all"
                                value={newEmail}
                                onChange={e => setNewEmail(e.target.value)}
                                placeholder="staff@brand.com"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Login Password</label>
                            <div className="relative">
                                <Key size={16} className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400" />
                                <input 
                                    type="text"
                                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-12 pr-5 py-3.5 text-sm font-black outline-none focus:ring-2 focus:ring-blue-600 transition-all"
                                    value={newPassword}
                                    onChange={e => setNewPassword(e.target.value)}
                                    placeholder="••••••••"
                                />
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Security Role</label>
                            <select 
                                className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-3.5 text-sm font-black outline-none appearance-none"
                                value={newRole}
                                onChange={e => setNewRole(e.target.value as UserRole)}
                            >
                                <option value={UserRole.ADMIN}>Admin (Staff Agent)</option>
                                <option value={UserRole.SUPER_ADMIN}>Super Admin (Partner/Owner)</option>
                            </select>
                        </div>
                    </div>

                    {/* Permissions Selector */}
                    <div className="space-y-6">
                        <div className="flex items-center gap-2">
                            <Lock size={16} className="text-blue-600" />
                            <h4 className="text-[10px] font-black text-slate-900 uppercase tracking-widest">Module Access Clearance</h4>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                            {AVAILABLE_PERMISSIONS.map(perm => (
                                <button
                                    key={perm.id}
                                    onClick={() => togglePermission(perm.id)}
                                    className={`flex items-center gap-3 p-4 rounded-2xl border text-left transition-all ${
                                        newPermissions.includes(perm.id)
                                        ? 'bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-200'
                                        : 'bg-slate-50 border-slate-100 text-slate-400 hover:bg-slate-100'
                                    }`}
                                >
                                    <div className={`w-5 h-5 rounded-md flex items-center justify-center border-2 ${
                                        newPermissions.includes(perm.id) ? 'bg-white border-white' : 'bg-white border-slate-200'
                                    }`}>
                                        {newPermissions.includes(perm.id) && <CheckCircle2 size={14} className="text-blue-600" />}
                                    </div>
                                    <span className="text-[11px] font-black uppercase tracking-tight leading-tight">{perm.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    <button onClick={handleAdd} disabled={isSaving} className="w-full bg-black text-white py-5 rounded-[2rem] font-black uppercase text-[11px] tracking-[0.2em] shadow-2xl hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50">
                        {isSaving ? 'SYNCHRONIZING...' : 'INJECT TEAM MEMBER'}
                    </button>
                </div>
            </div>

            <div className="lg:col-span-4 space-y-6">
                <div className="bg-slate-950 p-8 rounded-[3rem] border border-white/5 shadow-2xl">
                    <h3 className="text-white text-[11px] font-black uppercase tracking-widest mb-6 flex items-center gap-2">
                        <ShieldCheck size={16} className="text-blue-400"/> Active Directory
                    </h3>
                    <div className="space-y-4">
                        {users.map(u => (
                            <div key={u.id} className="bg-white/5 border border-white/10 p-5 rounded-3xl flex items-center justify-between group transition-all hover:bg-white/10">
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400 font-black text-xs">
                                        {u.username.slice(0, 2).toUpperCase()}
                                    </div>
                                    <div>
                                        <p className="text-white text-xs font-black uppercase tracking-tight">{u.username}</p>
                                        <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">{u.role.replace('_', ' ')}</p>
                                    </div>
                                </div>
                                <button 
                                    onClick={() => handleRemove(u.id)}
                                    className="p-2 text-slate-500 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-all"
                                >
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    </div>
  );
};
