
import React, { useState, useEffect } from 'react';
import { db } from '../services/mockBackend';
import { Tenant, User, UserRole } from '../types';
import { 
  Database, RefreshCcw, Globe, Plus, Trash2, Cloud, 
  AlertTriangle, Settings, Layout, Globe2, ShieldAlert, Key, Zap
} from 'lucide-react';

export const DevAdmin: React.FC = () => {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'CLUSTERS' | 'DOMAINS'>('CLUSTERS');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);
  const [formData, setFormData] = useState({
    name: '', shopName: '', logoUrl: '', mongoUri: '', domain: '', adminEmail: '', adminPass: '', cloudflareToken: ''
  });

  const load = async () => {
    setLoading(true);
    try {
      const t = await db.getTenants();
      setTenants(t);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleSaveCluster = async () => {
    if (!formData.name || !formData.mongoUri) return alert("System fields missing.");
    
    // Normalize domain for robust hostname matching
    const cleanDomain = formData.domain.toLowerCase().trim().replace(/^https?:\/\//, '').split('/')[0];

    setLoading(true);
    try {
      if (editingTenant) {
        const updated: Tenant = {
          ...editingTenant,
          name: formData.name,
          mongoUri: formData.mongoUri,
          domain: cleanDomain,
          settings: { 
            ...editingTenant.settings, 
            shopName: formData.shopName, 
            logoUrl: formData.logoUrl, 
            cloudflareToken: formData.cloudflareToken 
          }
        };
        await db.updateTenant(updated, formData.adminEmail || undefined, formData.adminPass || undefined);
      } else {
        await db.createTenant({ 
          ...formData, 
          domain: cleanDomain,
          settings: {
            ...formData, // Passing branding down
            cloudflareToken: formData.cloudflareToken
          }
        });
      }
      setIsModalOpen(false);
      load();
      alert("Cluster Node Synchronised.");
    } catch (e: any) { alert(e.message); } finally { setLoading(false); }
  };

  const handleDeleteTenant = async (id: string) => {
    const confirmation = prompt(`CRITICAL: Type "DELETE ${id}" to permanently erase this cluster.`);
    if (confirmation !== `DELETE ${id}`) return alert("Decommissioning aborted.");
    
    setLoading(true);
    try {
      await db.deleteTenant(id);
      load();
      alert("Cluster decommissioned.");
    } catch (e: any) { alert("Failure: " + e.message); } finally { setLoading(false); }
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-20 animate-slide-in px-4">
      <div className="bg-slate-950 text-white p-10 rounded-[3rem] shadow-2xl relative border border-white/5 overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-600/10 blur-[150px] -translate-y-1/2 translate-x-1/2"></div>
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-center gap-6">
            <div>
                <h2 className="text-4xl font-black tracking-tighter uppercase leading-none">Master Console</h2>
                <p className="text-slate-400 text-[10px] font-black uppercase tracking-[0.3em] mt-2">Milky Way Infrastructure Controller</p>
            </div>
            <div className="flex gap-4">
              <button onClick={() => { setEditingTenant(null); setFormData({name:'', shopName:'', logoUrl:'', mongoUri:'', domain:'', adminEmail:'', adminPass:'', cloudflareToken:''}); setIsModalOpen(true); }} className="px-8 py-4 bg-blue-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl transition-all active:scale-95">Deploy New Node</button>
              <button onClick={load} className="p-4 bg-white/10 rounded-full hover:bg-white/20 transition-all"><RefreshCcw size={20} className={loading ? 'animate-spin' : ''} /></button>
            </div>
        </div>
      </div>

      <div className="flex gap-2 p-1.5 bg-white rounded-2xl w-fit border border-slate-100 mb-6 shadow-sm">
          <button onClick={() => setView('CLUSTERS')} className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${view === 'CLUSTERS' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-400 hover:text-slate-600'}`}>Active Clusters</button>
          <button onClick={() => setView('DOMAINS')} className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${view === 'DOMAINS' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-400 hover:text-slate-600'}`}>DNS & Tunnels</button>
      </div>

      {view === 'CLUSTERS' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {tenants.map(t => (
                  <div key={t.id} className="bg-white p-8 rounded-[3rem] border border-slate-100 shadow-sm flex flex-col justify-between group hover:border-blue-200 transition-all">
                      <div className="space-y-6">
                          <div className="flex items-center justify-between">
                              <div className="w-14 h-14 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center overflow-hidden shadow-inner">
                                {t.settings.logoUrl ? <img src={t.settings.logoUrl} className="w-full h-full object-cover" /> : <Database className="text-slate-300" size={24} />}
                              </div>
                              <div className="flex flex-col items-end gap-1">
                                <span className={`px-3 py-1 rounded-full text-[8px] font-black uppercase ${t.isActive ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>{t.isActive ? 'Online' : 'Offline'}</span>
                                {t.settings.cloudflareToken && <span className="text-[7px] font-black uppercase bg-amber-50 text-amber-600 px-2 py-0.5 rounded-md">CF Sync Active</span>}
                              </div>
                          </div>
                          <div>
                            <h4 className="text-xl font-black uppercase text-slate-900 truncate">{t.settings.shopName || t.name}</h4>
                            <p className="text-[10px] font-mono font-bold text-blue-500 mt-1">HOST: {t.domain || 'SYSTEM DEFAULT'}</p>
                          </div>
                          <div className="bg-slate-50 p-4 rounded-2xl space-y-2">
                             <div className="flex justify-between text-[9px] font-black uppercase">
                                <span className="text-slate-400">Node Cluster</span>
                                <span className="text-slate-900 truncate ml-4">{t.id}</span>
                             </div>
                             <div className="flex justify-between text-[9px] font-black uppercase">
                                <span className="text-slate-400">DB Status</span>
                                <span className="text-emerald-600 font-bold truncate ml-4">CONNECTED</span>
                             </div>
                          </div>
                      </div>
                      <div className="flex items-center gap-3 mt-8">
                          <button onClick={() => { setEditingTenant(t); setFormData({name: t.name, shopName: t.settings.shopName, logoUrl: t.settings.logoUrl || '', mongoUri: t.mongoUri, domain: t.domain || '', adminEmail: '', adminPass: '', cloudflareToken: t.settings.cloudflareToken || ''}); setIsModalOpen(true); }} className="flex-1 px-4 py-3 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase hover:bg-black flex items-center justify-center gap-2">
                            <Settings size={14} /> Configure Infrastructure
                          </button>
                          <button onClick={() => handleDeleteTenant(t.id)} className="p-3 bg-rose-50 text-rose-600 rounded-xl hover:bg-rose-600 hover:text-white transition-all shadow-sm" title="Erase Cluster">
                            <Trash2 size={18} />
                          </button>
                      </div>
                  </div>
              ))}
          </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm">
          <div className="bg-white w-full max-w-xl rounded-[3rem] p-10 space-y-8 shadow-2xl animate-slide-in max-h-[90vh] overflow-y-auto no-scrollbar">
            <div className="flex items-center gap-4">
               <div className="p-3 bg-blue-600 text-white rounded-2xl"><Plus size={20}/></div>
               <h3 className="text-2xl font-black uppercase">{editingTenant ? 'Managed Node Policy' : 'Provision Infrastructure'}</h3>
            </div>
            
            <div className="space-y-6">
              <div className="bg-slate-50 p-6 rounded-[2rem] border border-slate-100 space-y-4">
                  <div className="flex items-center gap-2 text-blue-600">
                    <Zap size={16}/>
                    <h4 className="text-[10px] font-black uppercase tracking-widest">Routing Protocol</h4>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Assigned Domain</label>
                          <input className="w-full bg-white border border-slate-200 rounded-2xl px-5 py-3.5 text-sm font-black text-blue-600 outline-none focus:ring-2 focus:ring-blue-600" value={formData.domain} onChange={e => setFormData({...formData, domain: e.target.value})} placeholder="oms.yourbrand.com" />
                      </div>
                      <div className="space-y-1.5">
                          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Cloudflare Sync Token</label>
                          <input type="password" className="w-full bg-white border border-slate-200 rounded-2xl px-5 py-3.5 text-sm font-black text-slate-900 outline-none focus:ring-2 focus:ring-amber-500" value={formData.cloudflareToken} onChange={e => setFormData({...formData, cloudflareToken: e.target.value})} placeholder="CF_API_TOKEN" />
                      </div>
                  </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Node Identifier</label>
                      <input className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-3.5 text-sm font-black outline-none focus:ring-2 focus:ring-blue-600" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="tenant-slug" disabled={!!editingTenant} />
                  </div>
                  <div className="space-y-1.5">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Official Cluster Name</label>
                      <input className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-3.5 text-sm font-black outline-none focus:ring-2 focus:ring-blue-600" value={formData.shopName} onChange={e => setFormData({...formData, shopName: e.target.value})} placeholder="Master Branding Name" />
                  </div>
              </div>

              <div className="space-y-1.5">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Infrastructure Logo (Branding)</label>
                  <input className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-3.5 text-sm font-bold text-slate-500 outline-none" value={formData.logoUrl} onChange={e => setFormData({...formData, logoUrl: e.target.value})} placeholder="https://..." />
              </div>

              <div className="space-y-1.5">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Managed Database (Mongo URI)</label>
                  <input className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-3.5 text-xs font-mono font-bold text-slate-500 outline-none" value={formData.mongoUri} onChange={e => setFormData({...formData, mongoUri: e.target.value})} placeholder="mongodb+srv://..." />
              </div>

              {!editingTenant && (
                  <div className="bg-slate-950 p-6 rounded-[2rem] space-y-4">
                    <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Master User Provisioning</p>
                    <div className="grid grid-cols-2 gap-4">
                      <input className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm font-black text-white outline-none" value={formData.adminEmail} onChange={e => setFormData({...formData, adminEmail: e.target.value})} placeholder="Admin Username" />
                      <input className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm font-black text-white outline-none" value={formData.adminPass} onChange={e => setFormData({...formData, adminPass: e.target.value})} placeholder="Secret Passphrase" />
                    </div>
                  </div>
              )}
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
              <button onClick={() => setIsModalOpen(false)} className="px-6 py-3 rounded-xl font-black text-[10px] uppercase text-slate-400 hover:text-slate-600">Cancel</button>
              <button onClick={handleSaveCluster} className="bg-blue-600 text-white px-10 py-4 rounded-2xl font-black text-[10px] uppercase shadow-xl hover:bg-blue-700 transition-all flex items-center gap-2">
                <Cloud size={16}/> {editingTenant ? 'Update Protocol' : 'Initialise Node'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
