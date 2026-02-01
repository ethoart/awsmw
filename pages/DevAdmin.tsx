
import React, { useState, useEffect, useRef } from 'react';
import { db } from '../services/mockBackend';
import { Tenant, User, UserRole, Order, OrderStatus } from '../types';
import { 
  Database, RefreshCcw, Globe, Plus, Trash2, Cloud, 
  AlertTriangle, Settings, Layout, Globe2, ShieldAlert, Key, Zap,
  FileUp, DatabaseBackup, CheckCircle2, AlertCircle, HardDriveDownload,
  Users, ChevronDown, Rocket, Lock, Store, ImageIcon, ShieldCheck, Mail,
  Eraser, Flame
} from 'lucide-react';

export const DevAdmin: React.FC = () => {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'CLUSTERS' | 'DOMAINS' | 'MIGRATION'>('CLUSTERS');
  
  // Cluster Form States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);
  const [formData, setFormData] = useState({
    name: '', shopName: '', logoUrl: '', mongoUri: '', domain: '', adminEmail: '', adminPass: '', cloudflareToken: ''
  });

  // Migration States
  const [migrationTenantId, setMigrationTenantId] = useState('');
  const [migrationFile, setMigrationFile] = useState<File | null>(null);
  const [migrationProgress, setMigrationProgress] = useState<'IDLE' | 'PARSING' | 'SYNCING' | 'SUCCESS' | 'ERROR' | 'PURGING'>('IDLE');
  const [migrationLog, setMigrationLog] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);
    try {
      const t = await db.getTenants();
      setTenants(t);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleSaveCluster = async () => {
    if (!formData.name || !formData.mongoUri) return alert("CRITICAL: Identifier and Mongo URI are mandatory.");
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
        if (!formData.adminEmail || !formData.adminPass) return alert("System requires initial admin credentials for new cluster nodes.");
        await db.createTenant({ 
          ...formData, 
          domain: cleanDomain,
          settings: { ...formData, cloudflareToken: formData.cloudflareToken }
        });
      }
      setIsModalOpen(false);
      load();
      alert("Cluster Node Protocol Synchronised.");
    } catch (e: any) { alert(e.message); } finally { setLoading(false); }
  };

  // Robust Status Intelligence for various CSV exports
  const mapLegacyStatus = (s: string): OrderStatus => {
    const status = (s || '').trim().toUpperCase();
    
    if (['PENDING', 'NEW', 'ENTRY'].some(x => status.includes(x))) return OrderStatus.PENDING;
    if (['CONFIRM', 'CONFIRMED', 'SUCCESS', 'VERIFIED'].some(x => status.includes(x))) return OrderStatus.CONFIRMED;
    if (['SHIP', 'SHIPPED', 'DISPATCHED', 'SENT'].some(x => status.includes(x))) return OrderStatus.SHIPPED;
    if (['DELIVERED', 'COMPLETED', 'RECEIVED'].some(x => status.includes(x))) return OrderStatus.DELIVERED;
    if (['RETURN', 'RETURNED', 'REVERSAL'].some(x => status.includes(x))) return OrderStatus.RETURNED;
    if (['REJECT', 'REJECTED', 'CANCEL', 'CANCELLED'].some(x => status.includes(x))) return OrderStatus.REJECTED;
    if (['HOLD', 'WAITING', 'PAUSE'].some(x => status.includes(x))) return OrderStatus.HOLD;
    if (['ANSWER', 'NO ANSWER', 'N/A', 'NA', 'CALL'].some(x => status.includes(x))) return OrderStatus.NO_ANSWER;
    
    return OrderStatus.PENDING;
  };

  const parseSafeDate = (dateStr: string): string => {
    if (!dateStr) return new Date().toISOString();
    // Handle "YYYY-MM-DD HH:mm:ss" by ensuring standard ISO format
    const normalized = dateStr.trim().replace(' ', 'T');
    const d = new Date(normalized);
    if (isNaN(d.getTime())) return new Date().toISOString();
    return d.toISOString();
  };

  const parseCsvLine = (text: string) => {
    const result = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (char === '"') inQuotes = !inQuotes;
      else if (char === ',' && !inQuotes) {
        result.push(cur.trim());
        cur = '';
      } else {
        cur += char;
      }
    }
    result.push(cur.trim());
    return result;
  };

  const handleMigration = async () => {
    if (!migrationTenantId) return alert("Select target cluster node.");
    if (!migrationFile) return alert("Upload legacy payload file (CSV).");

    setMigrationProgress('PARSING');
    const reader = new FileReader();
    
    reader.onload = async (e) => {
      try {
        const text = e.target?.result as string;
        const lines = text.split('\n');
        const headers = lines[0].split(',').map(h => h.trim());
        
        const findIdx = (names: string[]) => headers.findIndex(h => names.some(n => h.toLowerCase() === n.toLowerCase()));

        const idx = {
          id: findIdx(['Lead Num', 'id', 'reference']),
          tracking: findIdx(['Waybill ID', 'tracking', 'waybill']),
          name: findIdx(['Customer Name', 'name', 'consignee']),
          phone: findIdx(['Phone Number', 'phone', 'contact']),
          phone2: findIdx(['Contact 2', 'alt_phone']),
          address: findIdx(['Address', 'street']),
          city: findIdx(['City', 'town']),
          product: findIdx(['Product', 'item']),
          qty: findIdx(['Quantity', 'qty']),
          price: findIdx(['Price', 'rate']),
          total: findIdx(['Total Value', 'total', 'amount']),
          status: findIdx(['Status', 'state']),
          date: findIdx(['Order Date', 'created', 'date']),
          shipped: findIdx(['Shipped At', 'dispatch_date']),
          stockId: findIdx(['Stock Item ID', 'sku'])
        };

        const orders: Order[] = [];
        setMigrationLog(`Analyzing ${lines.length - 1} records...`);

        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;
          
          const parts = parseCsvLine(line);
          const cleanVal = (val: string) => (val || '').replace(/^"|"$/g, '').trim();

          // Standardize phone number format
          const phone = cleanVal(parts[idx.phone]).replace('p:', '').replace(/\s/g, '');
          
          // Determine specific Milky Way Order Status
          const rawStatus = cleanVal(parts[idx.status]);
          const targetStatus = mapLegacyStatus(rawStatus);

          const legacyOrder: Order = {
            id: cleanVal(parts[idx.id]) || `mig-${Date.now()}-${i}`,
            tenantId: migrationTenantId,
            customerName: cleanVal(parts[idx.name]),
            customerPhone: phone,
            customerPhone2: cleanVal(parts[idx.phone2]),
            customerAddress: cleanVal(parts[idx.address]),
            customerCity: cleanVal(parts[idx.city]),
            items: [{
              productId: cleanVal(parts[idx.stockId]) || 'legacy-sku',
              name: cleanVal(parts[idx.product]) || 'Legacy Item',
              price: parseFloat(cleanVal(parts[idx.price])) || 0,
              quantity: parseInt(cleanVal(parts[idx.qty])) || 1
            }],
            totalAmount: parseFloat(cleanVal(parts[idx.total])) || 0,
            status: targetStatus,
            trackingNumber: cleanVal(parts[idx.tracking]),
            createdAt: parseSafeDate(cleanVal(parts[idx.date])),
            shippedAt: parts[idx.shipped] && cleanVal(parts[idx.shipped]) ? parseSafeDate(cleanVal(parts[idx.shipped])) : undefined,
            isPrinted: true,
            logs: [{ id: `l-${Date.now()}`, message: `Legacy Sync Handshake: Status [${rawStatus}] mapped to [${targetStatus}]`, timestamp: new Date().toISOString(), user: 'DEV_ADMIN' }]
          };
          orders.push(legacyOrder);
        }

        setMigrationProgress('SYNCING');
        setMigrationLog(`Pushing ${orders.length} orders to registry...`);
        
        const chunkSize = 100;
        for (let i = 0; i < orders.length; i += chunkSize) {
          const chunk = orders.slice(i, i + chunkSize);
          await db.createOrders(chunk);
          setMigrationLog(`Syncing chunk ${Math.ceil(i/chunkSize) + 1} / ${Math.ceil(orders.length/chunkSize)}...`);
        }
        setMigrationProgress('SUCCESS');
        setMigrationLog(`Protocol Complete: ${orders.length} records merged successfully.`);
      } catch (err: any) {
        setMigrationProgress('ERROR');
        setMigrationLog(`Handshake Failure: ${err.message}`);
      }
    };

    reader.onerror = () => {
      setMigrationProgress('ERROR');
      setMigrationLog(`File Access Failure.`);
    };

    reader.readAsText(migrationFile);
  };

  const handlePurgeCluster = async () => {
    if (!migrationTenantId) return alert("Select target cluster node first.");
    const tenant = tenants.find(t => t.id === migrationTenantId);
    if (!confirm(`CRITICAL WARNING: This will permanently erase ALL records (10,000+) in the [${tenant?.settings.shopName || migrationTenantId}] cluster registry. Proceed?`)) return;
    
    setMigrationProgress('PURGING');
    setMigrationLog('Initiating high-speed server-side purge protocol...');
    
    try {
      // Execute the atomic purge method for instant 10,000+ record cleanup
      const count = await db.purgeOrders(migrationTenantId);
      setMigrationProgress('SUCCESS');
      setMigrationLog(`Cluster Sanitize Complete: ${count} records wiped from registry.`);
    } catch (err: any) {
      setMigrationProgress('ERROR');
      setMigrationLog(`Purge Failure: ${err.message}`);
    }
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
            <div className="flex items-center gap-6">
                <div className="w-16 h-16 bg-blue-600 rounded-[1.8rem] flex items-center justify-center shadow-2xl rotate-3">
                    <Rocket size={32} className="text-white" />
                </div>
                <div>
                    <h2 className="text-4xl font-black tracking-tighter uppercase leading-none">Master Console</h2>
                    <p className="text-slate-400 text-[10px] font-black uppercase tracking-[0.3em] mt-2">Milky Way Infrastructure Controller</p>
                </div>
            </div>
            <div className="flex gap-4">
              <button onClick={() => { setEditingTenant(null); setFormData({name:'', shopName:'', logoUrl:'', mongoUri:'', domain:'', adminEmail:'', adminPass:'', cloudflareToken:''}); setIsModalOpen(true); }} className="px-8 py-4 bg-blue-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl transition-all active:scale-95 hover:bg-blue-700">Deploy New Node</button>
              <button onClick={load} className="p-4 bg-white/10 rounded-full hover:bg-white/20 transition-all"><RefreshCcw size={20} className={loading ? 'animate-spin' : ''} /></button>
            </div>
        </div>
      </div>

      <div className="flex gap-2 p-1.5 bg-white rounded-2xl w-fit border border-slate-100 mb-6 shadow-sm">
          <button onClick={() => setView('CLUSTERS')} className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${view === 'CLUSTERS' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-400 hover:text-slate-600'}`}>Active Clusters</button>
          <button onClick={() => setView('DOMAINS')} className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${view === 'DOMAINS' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-400 hover:text-slate-600'}`}>DNS & Tunnels</button>
          <button onClick={() => setView('MIGRATION')} className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${view === 'MIGRATION' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-600'}`}>Migration Engine</button>
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
                              </div>
                          </div>
                          <div>
                            <h4 className="text-xl font-black uppercase text-slate-900 truncate">{t.settings.shopName || t.name}</h4>
                            <p className="text-[10px] font-mono font-bold text-blue-500 mt-1">HOST: {t.domain || 'SYSTEM DEFAULT'}</p>
                          </div>
                      </div>
                      <div className="flex items-center gap-3 mt-8">
                          <button onClick={() => { setEditingTenant(t); setFormData({name: t.name, shopName: t.settings.shopName, logoUrl: t.settings.logoUrl || '', mongoUri: t.mongoUri, domain: t.domain || '', adminEmail: '', adminPass: '', cloudflareToken: t.settings.cloudflareToken || ''}); setIsModalOpen(true); }} className="flex-1 px-4 py-3 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase hover:bg-black flex items-center justify-center gap-2">
                            <Settings size={14} /> Configure
                          </button>
                          <button onClick={() => handleDeleteTenant(t.id)} className="p-3 bg-rose-50 text-rose-600 rounded-xl hover:bg-rose-600 hover:text-white transition-all shadow-sm" title="Erase Cluster">
                            <Trash2 size={18} />
                          </button>
                      </div>
                  </div>
              ))}
          </div>
      )}

      {view === 'MIGRATION' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              <div className="lg:col-span-7 space-y-8">
                  <div className="bg-white p-12 rounded-[4rem] border border-slate-100 shadow-sm space-y-10">
                      <div className="flex items-center gap-4 border-b border-slate-50 pb-8">
                          <div className="w-14 h-14 bg-blue-50 text-blue-600 rounded-[1.5rem] flex items-center justify-center shadow-inner">
                              <DatabaseBackup size={28} />
                          </div>
                          <div>
                              <h3 className="text-2xl font-black uppercase text-slate-900 leading-none tracking-tighter">Migration Protocol</h3>
                              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Legacy CSV Synchronization</p>
                          </div>
                      </div>

                      <div className="space-y-8">
                          <div className="space-y-3">
                              <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest ml-1">Target Cluster Node</label>
                              <div className="relative">
                                  <select 
                                      className="w-full bg-slate-50 border border-slate-200 rounded-[1.5rem] px-6 py-4 text-sm font-black text-slate-900 outline-none appearance-none focus:ring-4 focus:ring-blue-100 transition-all"
                                      value={migrationTenantId}
                                      onChange={e => setMigrationTenantId(e.target.value)}
                                  >
                                      <option value="">Select Destination...</option>
                                      {tenants.map(t => <option key={t.id} value={t.id}>{t.settings.shopName} ({t.id})</option>)}
                                  </select>
                                  <ChevronDown className="absolute right-6 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={18} />
                              </div>
                          </div>

                          <div className="space-y-3">
                              <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest ml-1">Legacy CSV Payload</label>
                              <div 
                                  onClick={() => fileInputRef.current?.click()}
                                  className={`group border-4 border-dashed border-slate-50 rounded-[2.5rem] py-16 flex flex-col items-center justify-center cursor-pointer transition-all ${migrationFile ? 'bg-blue-50 border-blue-200' : 'hover:border-blue-100 hover:bg-slate-50/50'}`}
                              >
                                  {migrationFile ? (
                                      <>
                                          <HardDriveDownload size={48} className="text-blue-600 mb-4 animate-bounce" />
                                          <p className="text-sm font-black text-blue-600 uppercase">{migrationFile.name}</p>
                                          <p className="text-[9px] font-bold text-blue-400 uppercase mt-2">{(migrationFile.size / 1024).toFixed(2)} KB Loaded</p>
                                      </>
                                  ) : (
                                      <>
                                          <FileUp size={48} className="text-slate-200 group-hover:text-blue-200 group-hover:scale-110 transition-all mb-4" />
                                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Select CSV Payload</p>
                                      </>
                                  )}
                                  <input ref={fileInputRef} type="file" accept=".csv" onChange={e => setMigrationFile(e.target.files?.[0] || null)} className="hidden" />
                              </div>
                          </div>

                          <button 
                            onClick={handleMigration} 
                            disabled={migrationProgress === 'PARSING' || migrationProgress === 'SYNCING' || migrationProgress === 'PURGING'}
                            className="w-full py-6 bg-blue-600 text-white rounded-[2rem] font-black text-[11px] uppercase tracking-[0.3em] shadow-2xl hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-3"
                          >
                            <Zap size={18}/> {migrationProgress === 'SYNCING' ? 'SYNCHRONIZING CLUSTER...' : 'Execute Migration Protocol'}
                          </button>
                      </div>
                  </div>

                  {/* High Speed Purge Utility */}
                  <div className="bg-rose-50 border-2 border-rose-100 p-10 rounded-[3rem] space-y-6">
                      <div className="flex items-center gap-4">
                          <div className="w-12 h-12 bg-rose-600 text-white rounded-2xl flex items-center justify-center shadow-lg">
                              <Eraser size={24} />
                          </div>
                          <div>
                              <h3 className="text-xl font-black uppercase text-rose-900 leading-none">Cluster Sanitize</h3>
                              <p className="text-[10px] font-black text-rose-400 uppercase tracking-widest mt-1">Atomic Cleanup Utility</p>
                          </div>
                      </div>
                      <p className="text-[11px] font-bold text-rose-600/70 uppercase leading-relaxed px-2">
                        Wipe entire cluster histories instantly (10,000+ records) using the high-speed server-side protocol. This action is final.
                      </p>
                      <button 
                        onClick={handlePurgeCluster}
                        disabled={!migrationTenantId || migrationProgress === 'SYNCING' || migrationProgress === 'PURGING'}
                        className="w-full py-5 bg-rose-600 text-white rounded-[2rem] font-black text-[10px] uppercase tracking-[0.2em] shadow-xl hover:bg-rose-700 transition-all flex items-center justify-center gap-3 disabled:opacity-30"
                      >
                         <Flame size={18} /> {migrationProgress === 'PURGING' ? 'ERASING REGISTRY...' : 'Purge Cluster (10k+ Records)'}
                      </button>
                  </div>
              </div>

              <div className="lg:col-span-5 space-y-8 sticky top-10">
                  <div className="bg-slate-950 text-white p-10 rounded-[3rem] shadow-2xl relative overflow-hidden flex flex-col min-h-[400px] border border-white/5">
                      <div className="absolute top-0 right-0 w-64 h-64 bg-blue-600 rounded-full blur-[100px] opacity-20 transform translate-x-1/2 -translate-y-1/2"></div>
                      <div className="relative z-10 flex flex-col h-full">
                          <h3 className="text-xs font-black uppercase tracking-[0.3em] mb-10 flex items-center gap-3">
                             <ShieldAlert size={20} className="text-blue-400" /> Handshake Monitor
                          </h3>
                          
                          <div className="flex-1 space-y-6">
                              {migrationProgress === 'IDLE' && (
                                  <div className="text-center py-10 opacity-30 flex flex-col items-center gap-4">
                                      <Layout size={64} className="stroke-1" />
                                      <p className="text-[10px] font-black uppercase tracking-widest">System Awaiting Injection</p>
                                  </div>
                              )}

                              {migrationProgress !== 'IDLE' && (
                                  <div className="space-y-6 animate-slide-in">
                                      <div className={`p-6 rounded-3xl border flex items-start gap-4 ${
                                          migrationProgress === 'ERROR' ? 'bg-rose-500/10 border-rose-500/20 text-rose-500' :
                                          migrationProgress === 'SUCCESS' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500' :
                                          'bg-blue-500/10 border-blue-500/20 text-blue-400'
                                      }`}>
                                          {migrationProgress === 'ERROR' ? <AlertCircle size={20} /> : 
                                           migrationProgress === 'SUCCESS' ? <CheckCircle2 size={20} /> :
                                           <RefreshCcw size={20} className="animate-spin" />}
                                          <div>
                                              <p className="text-[11px] font-black uppercase leading-relaxed tracking-tight">{migrationLog}</p>
                                          </div>
                                      </div>
                                      
                                      {(migrationProgress === 'PARSING' || migrationProgress === 'SYNCING' || migrationProgress === 'PURGING') && (
                                          <div className="w-full bg-white/5 h-2 rounded-full overflow-hidden">
                                              <div className="bg-blue-600 h-full animate-progress-indeterminate"></div>
                                          </div>
                                      )}
                                  </div>
                              )}
                          </div>

                          <div className="mt-auto pt-10 border-t border-white/5">
                              <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Master Console Audit System v1.2</p>
                          </div>
                      </div>
                  </div>
              </div>
          </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm">
          <div className="bg-white w-full max-w-2xl rounded-[3rem] p-10 space-y-8 shadow-2xl animate-slide-in max-h-[90vh] overflow-y-auto no-scrollbar">
            <div className="flex items-center gap-4">
               <div className="p-3 bg-blue-600 text-white rounded-2xl"><Plus size={20}/></div>
               <h3 className="text-2xl font-black uppercase tracking-tighter leading-none">
                  {editingTenant ? 'Managed Node Policy' : 'Provision Infrastructure'}
                  <span className="block text-[10px] text-slate-400 mt-1 uppercase tracking-widest font-black">Milky Way Cluster Deployment</span>
               </h3>
            </div>
            
            <div className="space-y-10">
              {/* Identity Section */}
              <div className="space-y-4">
                <h4 className="text-[11px] font-black text-blue-600 uppercase tracking-widest flex items-center gap-2">
                  <Store size={14} /> Identity & Branding
                </h4>
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Node Identifier (Slug)</label>
                        <input className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-3.5 text-sm font-black outline-none focus:ring-2 focus:ring-blue-600" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="tenant-slug" disabled={!!editingTenant} />
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Official Shop Name</label>
                        <input className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-3.5 text-sm font-black outline-none focus:ring-2 focus:ring-blue-600" value={formData.shopName} onChange={e => setFormData({...formData, shopName: e.target.value})} placeholder="Master Branding Name" />
                    </div>
                    <div className="col-span-2 space-y-1.5">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Logo URL (Icon)</label>
                        <div className="relative">
                           <ImageIcon className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300" size={16} />
                           <input className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-12 pr-5 py-3.5 text-sm font-black outline-none focus:ring-2 focus:ring-blue-600" value={formData.logoUrl} onChange={e => setFormData({...formData, logoUrl: e.target.value})} placeholder="https://..." />
                        </div>
                    </div>
                </div>
              </div>

              {/* Infrastructure Section */}
              <div className="space-y-4">
                <h4 className="text-[11px] font-black text-blue-600 uppercase tracking-widest flex items-center gap-2">
                  <Globe size={14} /> Infrastructure Routing
                </h4>
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Custom Domain (Host)</label>
                        <input className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-3.5 text-sm font-black outline-none focus:ring-2 focus:ring-blue-600" value={formData.domain} onChange={e => setFormData({...formData, domain: e.target.value})} placeholder="shop.domain.com" />
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Managed Database (Mongo URI)</label>
                        <input className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-3.5 text-xs font-mono font-bold text-slate-500 outline-none focus:ring-2 focus:ring-blue-600" value={formData.mongoUri} onChange={e => setFormData({...formData, mongoUri: e.target.value})} placeholder="mongodb+srv://..." />
                    </div>
                </div>
              </div>

              {/* Security Section */}
              <div className="space-y-4">
                <h4 className="text-[11px] font-black text-emerald-600 uppercase tracking-widest flex items-center gap-2">
                  <ShieldCheck size={14} /> Administrator Access
                </h4>
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Admin Email/Username</label>
                        <div className="relative">
                           <Mail className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300" size={16} />
                           <input className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-12 pr-5 py-3.5 text-sm font-black outline-none focus:ring-2 focus:ring-emerald-600" value={formData.adminEmail} onChange={e => setFormData({...formData, adminEmail: e.target.value})} placeholder="admin@shop.com" />
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Initial Secret Password</label>
                        <div className="relative">
                           <Lock className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300" size={16} />
                           <input type="password" className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-12 pr-5 py-3.5 text-sm font-black outline-none focus:ring-2 focus:ring-emerald-600" value={formData.adminPass} onChange={e => setFormData({...formData, adminPass: e.target.value})} placeholder="••••••••" />
                        </div>
                    </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-6 border-t border-slate-100">
              <button onClick={() => setIsModalOpen(false)} className="px-8 py-4 rounded-xl font-black text-[10px] uppercase text-slate-400 hover:text-slate-600">Cancel</button>
              <button onClick={handleSaveCluster} className="bg-blue-600 text-white px-12 py-5 rounded-[2rem] font-black text-[10px] uppercase shadow-2xl hover:bg-blue-700 transition-all hover:scale-105 active:scale-95">
                 {editingTenant ? 'Update Protocol' : 'Deploy Cluster Node'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
          @keyframes progress-indeterminate {
              0% { transform: translateX(-100%); }
              100% { transform: translateX(100%); }
          }
          .animate-progress-indeterminate {
              width: 100%;
              animation: progress-indeterminate 1.5s infinite ease-in-out;
          }
      `}</style>
    </div>
  );
};
