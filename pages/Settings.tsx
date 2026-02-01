
import React, { useState, useEffect } from 'react';
import { db } from '../services/mockBackend';
import { Tenant, TenantSettings, CourierMode } from '../types';
import { 
  Save, Store, ShieldCheck, Truck, 
  Copy, CheckCircle2, Webhook, Image as ImageIcon,
  RefreshCcw, Layout, AlertTriangle, Globe, Zap, Key, Link, Shield, MapPin, Phone, CloudLightning, Info, Server,
  Fingerprint
} from 'lucide-react';

interface SettingsProps {
  tenantId: string;
  shopName: string;
  onRefreshBranding?: () => Promise<void>;
}

export const Settings: React.FC<SettingsProps> = ({ tenantId, shopName, onRefreshBranding }) => {
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [settings, setSettings] = useState<TenantSettings>({
      shopName: '', shopAddress: '', shopPhone: '', courierApiKey: '', courierApiUrl: '', 
      courierClientId: '', courierMode: CourierMode.STANDARD, showBillQr: true, logoUrl: '',
      cloudflareToken: ''
  });
  const [masterNode, setMasterNode] = useState(window.location.host);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'IDLE' | 'SUCCESS' | 'ERROR'>( 'IDLE' );
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    db.getTenant(tenantId).then(t => {
        if (t) {
            setTenant(t);
            setSettings({ ...t.settings, 
                courierApiUrl: t.settings.courierApiUrl || 'https://www.fdedomestic.com/api/parcel/new_api_v1.php' 
            });
        }
    });
  }, [tenantId]);

  const handleSave = async () => {
      if (!tenant) return;
      setSaving(true);
      try {
        await db.updateTenant({ ...tenant, settings });
        if (onRefreshBranding) await onRefreshBranding();
        alert("Branding & Cluster Settings Synchronized.");
      } finally { setSaving(false); }
  };

  const handleSyncDNS = async () => {
      if (!tenant?.domain || !settings.cloudflareToken) {
          return alert("Protocol Error: Custom Domain and CF Token required for sync.");
      }
      
      setSyncing(true);
      setSyncStatus('IDLE');
      try {
          const res = await fetch('/api/sync-infrastructure', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                  tenantId,
                  domain: tenant.domain,
                  token: settings.cloudflareToken,
                  masterNode: masterNode.replace(/^https?:\/\//, '').split('/')[0]
              })
          });
          const data = await res.json();
          if (data.success) {
              setSyncStatus('SUCCESS');
              alert("DNS Cluster Synchronized. NXDOMAIN and 1016 errors should resolve shortly.");
          } else {
              setSyncStatus('ERROR');
              alert(`Handshake Failure: ${data.error}`);
          }
      } catch (e: any) {
          setSyncStatus('ERROR');
          alert(`Network Protocol Error: ${e.message}`);
      } finally {
          setSyncing(false);
      }
  };

  const webhookUrl = `${window.location.protocol}//${tenant?.domain || window.location.host}/api/courier-webhook`;

  const copyWebhook = () => {
    navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!tenant) return <div className="p-20 text-center font-black uppercase text-slate-300 tracking-[0.5em]">Syncing Hub Registry...</div>;

  return (
    <div className="max-w-6xl mx-auto space-y-10 pb-20 animate-slide-in px-4">
        <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="flex items-center gap-4">
                <div className="p-4 bg-blue-600 text-white rounded-[2rem] shadow-2xl rotate-2"><ShieldCheck size={32} /></div>
                <div>
                  <h2 className="text-4xl font-black uppercase tracking-tighter text-slate-900 leading-none">Cluster Control</h2>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.4em] mt-2">{shopName} Global Registry</p>
                </div>
            </div>
            <button onClick={handleSave} disabled={saving} className="bg-slate-950 text-white px-12 py-5 rounded-[2.5rem] font-black uppercase text-[11px] shadow-2xl transition-all hover:scale-105 active:scale-95 flex items-center gap-3">
                {saving ? <RefreshCcw size={18} className="animate-spin" /> : <Save size={18} />} {saving ? 'SYNCING DATA...' : 'COMMIT REGISTRY'}
            </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
            <div className="lg:col-span-8 space-y-10">
                {/* Managed Infrastructure Card */}
                <div className="bg-slate-900 p-12 rounded-[4rem] border border-white/10 shadow-2xl space-y-8 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-blue-600/10 blur-[100px] -translate-y-1/2 translate-x-1/2"></div>
                    <div className="flex items-center justify-between relative z-10">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-blue-600 text-white rounded-2xl flex items-center justify-center shadow-lg"><Globe size={24}/></div>
                            <div>
                                <h3 className="text-xl font-black uppercase text-white leading-none">Cluster Routing</h3>
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Managed Infrastructure Node</p>
                            </div>
                        </div>
                        <div className={`flex items-center gap-2 px-4 py-2 border rounded-xl ${syncStatus === 'SUCCESS' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500' : 'bg-amber-500/10 border-amber-500/20 text-amber-500'}`}>
                            {syncStatus === 'SUCCESS' ? <Shield size={14} /> : <CloudLightning size={14} className={syncing ? 'animate-pulse' : ''} />}
                            <span className="text-[9px] font-black uppercase tracking-widest">{syncStatus === 'SUCCESS' ? 'Linked & Active' : syncing ? 'Syncing...' : 'Pending Sync'}</span>
                        </div>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 relative z-10">
                        <div className="bg-white/5 p-6 rounded-3xl border border-white/5">
                            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Target Domain</p>
                            <p className="text-lg font-mono font-black text-blue-400 truncate">{tenant.domain || window.location.host}</p>
                        </div>
                        <div className="bg-white/5 p-6 rounded-3xl border border-white/5 flex flex-col justify-between">
                            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Cloudflare API Token</p>
                            <input 
                                type="password" 
                                className="bg-transparent border-none text-white font-black text-lg p-0 outline-none w-full" 
                                value={settings.cloudflareToken || ''} 
                                onChange={e => setSettings({...settings, cloudflareToken: e.target.value})}
                                placeholder="CF_TOKEN_PENDING"
                            />
                        </div>
                    </div>

                    <div className="bg-white/5 p-8 rounded-3xl border border-white/10 space-y-4 relative z-10">
                        <label className="text-[10px] font-black text-blue-400 uppercase tracking-widest flex items-center gap-2">
                           <Server size={14}/> Master Node Address
                        </label>
                        <input 
                            className="w-full bg-slate-950 border border-white/10 rounded-2xl px-6 py-4 font-black text-white outline-none focus:border-blue-600 transition-all text-sm font-mono" 
                            value={masterNode} 
                            onChange={e => setMasterNode(e.target.value)} 
                        />
                    </div>

                    <div className="flex flex-col md:flex-row gap-4 relative z-10 pt-4">
                        <button 
                            onClick={handleSyncDNS} 
                            disabled={syncing || !settings.cloudflareToken}
                            className={`flex-1 flex items-center justify-center gap-3 py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl transition-all ${syncStatus === 'SUCCESS' ? 'bg-emerald-600 text-white' : 'bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-30'}`}
                        >
                            {syncing ? <RefreshCcw size={16} className="animate-spin" /> : <Zap size={16} />}
                            {syncStatus === 'SUCCESS' ? 'Protocol Synchronized' : 'Execute DNS Fix'}
                        </button>
                    </div>
                </div>

                {/* Reverse Webhook Hub */}
                <div className="bg-white p-12 rounded-[4rem] border border-slate-100 shadow-sm space-y-10">
                    <div className="flex items-center gap-4 border-b border-slate-50 pb-8">
                        <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center"><Webhook size={24}/></div>
                        <div>
                            <h3 className="text-xl font-black uppercase text-slate-900 leading-none">Reverse Webhook Hub</h3>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Asynchronous Courier Status Updates</p>
                        </div>
                    </div>
                    
                    <div className="space-y-6">
                        <div className="bg-slate-50 p-8 rounded-[2.5rem] border border-slate-100 space-y-4">
                            <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest ml-1 flex items-center gap-2">
                                <Fingerprint size={16} className="text-amber-600"/> Courier Callback Link (Webhook URL)
                            </label>
                            <div className="flex flex-col md:flex-row gap-4">
                                <div className="flex-1 bg-white border-2 border-slate-200 rounded-2xl px-6 py-4 font-black text-blue-600 text-xs break-all overflow-hidden flex items-center">
                                    {webhookUrl}
                                </div>
                                <button 
                                    onClick={copyWebhook}
                                    className={`px-8 py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest transition-all flex items-center gap-3 shrink-0 shadow-lg ${copied ? 'bg-emerald-600 text-white' : 'bg-black text-white hover:bg-slate-800'}`}
                                >
                                    {copied ? <CheckCircle2 size={16} /> : <Copy size={16} />}
                                    {copied ? 'COPIED!' : 'COPY URL'}
                                </button>
                            </div>
                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tight mt-2 italic px-2">
                                * Give this URL to your courier provider (FDE/Logistics) to enable real-time delivery status tracking.
                            </p>
                        </div>
                    </div>
                </div>

                {/* Logistics Gateway Section */}
                <div className="bg-white p-12 rounded-[4rem] border border-slate-100 shadow-sm space-y-10">
                    <div className="flex items-center gap-4 border-b border-slate-50 pb-8">
                        <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center"><Truck size={24}/></div>
                        <div>
                            <h3 className="text-xl font-black uppercase text-slate-900 leading-none">Logistics Gateway</h3>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">API Endpoint and Access Keys</p>
                        </div>
                    </div>
                    
                    <div className="space-y-8">
                        <div className="bg-indigo-50 p-8 rounded-[2.5rem] border border-indigo-100 space-y-4">
                            <label className="text-[11px] font-black text-indigo-600 uppercase tracking-widest ml-1 flex items-center gap-2"><Link size={16}/> Courier API Endpoint</label>
                            <input 
                                className="w-full bg-white border-2 border-indigo-200 rounded-2xl px-6 py-4 font-black text-blue-600 outline-none focus:border-indigo-600 transition-all text-sm" 
                                value={settings.courierApiUrl} 
                                onChange={e => setSettings({...settings, courierApiUrl: e.target.value})} 
                            />
                        </div>

                        <div className="grid md:grid-cols-2 gap-8">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">AUTH KEY</label>
                                <input type="password" placeholder="••••••••" className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-6 py-4 font-bold text-slate-900 outline-none focus:ring-2 focus:ring-blue-600" value={settings.courierApiKey} onChange={e => setSettings({...settings, courierApiKey: e.target.value})} />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">CLIENT ID</label>
                                <input className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-6 py-4 font-black text-slate-900 outline-none focus:ring-2 focus:ring-blue-600" value={settings.courierClientId} onChange={e => setSettings({...settings, courierClientId: e.target.value})} />
                            </div>
                        </div>
                    </div>
                </div>

                <div className="bg-white p-12 rounded-[4rem] border border-slate-100 shadow-sm space-y-10">
                    <div className="flex items-center gap-4 border-b border-slate-50 pb-8">
                        <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center"><Store size={24}/></div>
                        <div>
                            <h3 className="text-xl font-black uppercase text-slate-900 leading-none">Identity & Branding</h3>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Login portal and terminal customization</p>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Official Shop Name</label>
                            <input className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-6 py-4 font-black text-slate-900 outline-none focus:ring-2 focus:ring-blue-500 transition-all" value={settings.shopName} onChange={e => setSettings({...settings, shopName: e.target.value})} />
                        </div>
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Logo URL</label>
                            <div className="relative">
                              <input className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-6 py-4 pl-14 font-black text-blue-600 outline-none focus:ring-2 focus:ring-blue-500 transition-all" value={settings.logoUrl || ''} onChange={e => setSettings({...settings, logoUrl: e.target.value})} />
                              <ImageIcon className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-300" size={20} />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Support Phone</label>
                            <div className="relative">
                                <input className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-6 py-4 pl-14 font-black text-slate-900 outline-none focus:ring-2 focus:ring-blue-500 transition-all" value={settings.shopPhone || ''} onChange={e => setSettings({...settings, shopPhone: e.target.value})} />
                                <Phone className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-300" size={20} />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Warehouse Address</label>
                            <div className="relative">
                                <input className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-6 py-4 pl-14 font-black text-slate-900 outline-none focus:ring-2 focus:ring-blue-500 transition-all" value={settings.shopAddress || ''} onChange={e => setSettings({...settings, shopAddress: e.target.value})} />
                                <MapPin className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-300" size={20} />
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="lg:col-span-4 space-y-8">
                <div className="bg-white p-10 rounded-[3.5rem] border border-slate-100 shadow-sm sticky top-10 space-y-8">
                    <div className="flex items-center gap-3 mb-4">
                        <Layout className="text-blue-600" size={18} />
                        <h4 className="text-[11px] font-black uppercase tracking-widest text-slate-400">Identity Preview</h4>
                    </div>
                    <div className="flex flex-col items-center gap-6 py-10 bg-slate-50 rounded-[3rem] border border-slate-100 shadow-inner">
                        <div className="w-24 h-24 rounded-[2rem] bg-white border border-slate-200 flex items-center justify-center overflow-hidden shadow-2xl">
                          {settings.logoUrl ? <img src={settings.logoUrl} className="w-full h-full object-cover" /> : <Globe className="text-slate-200" size={48} />}
                        </div>
                        <div className="text-center px-6">
                            <h5 className="text-xl font-black uppercase text-slate-900 leading-none mb-2">{settings.shopName || 'Milky Way OMS'}</h5>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest line-clamp-2">{settings.shopAddress || 'Managed Node Identity'}</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
  );
};
