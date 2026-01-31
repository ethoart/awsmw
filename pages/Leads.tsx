
import React, { useState, useEffect, useRef } from 'react';
import { db } from '../services/mockBackend';
import { Product, Order, OrderStatus, Tenant, CourierMode } from '../types';
import { UserPlus, FileSpreadsheet, CheckCircle2, ChevronDown, History, Package, ShieldAlert, AlertTriangle, Upload, Trash2, Database, Box, Zap, MapPin, Scale } from 'lucide-react';
import { parseCSV, formatCurrency } from '../utils/helpers';

const SRI_LANKA_CITIES_FALLBACK = [
  "Colombo", "Gampaha", "Kalutara", "Kandy", "Matale", "Nuwara Eliya", "Galle", "Matara", "Hambantota", 
  "Jaffna", "Kilinochchi", "Mannar", "Vavuniya", "Mullaitivu", "Batticaloa", "Ampara", "Trincomalee", 
  "Kurunegala", "Puttalam", "Anuradhapura", "Polonnaruwa", "Badulla", "Monaragala", "Ratnapura", "Kegalle",
  "Dehiwala-Mount Lavinia", "Moratuwa", "Negombo", "Sri Jayawardenepura Kotte", "Kaduwela", "Kolonnawa", 
  "Chilaw", "Wattala", "Welisara", "Ja-Ela", "Paliyagoda", "Gampola", "Nawalapitiya", "Haputale"
].sort();

interface LeadsProps {
  tenantId: string;
  shopName: string;
}

export const Leads: React.FC<LeadsProps> = ({ tenantId, shopName }) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [cities, setCities] = useState<string[]>([]);
  const [currentUser, setCurrentUser] = useState<string>('System');
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [manualForm, setManualForm] = useState({ 
    name: '', 
    phone: '', 
    address: '', 
    productId: '',
    trackingNumber: '',
    city: 'Colombo',
    weight: '1'
  });
  const [customerHistory, setCustomerHistory] = useState<any>(null);
  const [message, setMessage] = useState<{ text: string, type: 'success' | 'error' | 'info' } | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // CSV States
  const [pendingLeads, setPendingLeads] = useState<any[]>([]);
  const [csvProductId, setCsvProductId] = useState('');

  useEffect(() => {
    db.getProducts(tenantId).then(setProducts);
    db.getTenant(tenantId).then(setTenant);
    db.getGlobalCities().then(c => {
        // Deduplicate cities
        const cityList = Array.from(new Set(c.length > 0 ? c : SRI_LANKA_CITIES_FALLBACK));
        setCities(cityList);
        setManualForm(prev => ({ ...prev, city: cityList.includes('Colombo') ? 'Colombo' : cityList[0] }));
    });
    const saved = localStorage.getItem('mw_user');
    if (saved) setCurrentUser(JSON.parse(saved).username);
  }, [tenantId]);

  useEffect(() => {
    const normalizedPhone = manualForm.phone.replace(/\D/g, '');
    if (normalizedPhone.length >= 9) {
        const timer = setTimeout(async () => {
            const h = await db.getCustomerHistory(normalizedPhone, tenantId);
            setCustomerHistory(h);
        }, 500);
        return () => clearTimeout(timer);
    } else {
        setCustomerHistory(null);
    }
  }, [manualForm.phone, tenantId]);

  const handleManualSubmit = async () => {
    if (!manualForm.name || !manualForm.phone || !manualForm.productId) return alert("System requires full identity and SKU.");
    
    const isExistingMode = tenant?.settings.courierMode === CourierMode.EXISTING_WAYBILL;
    if (isExistingMode && !manualForm.trackingNumber) return alert("Existing Waybill ID is mandatory for this cluster mode.");

    const p = products.find(x => x.id === manualForm.productId);
    if (!p) return;

    const order: Order = {
      id: `ord-${Date.now()}`,
      tenantId,
      customerName: manualForm.name,
      customerPhone: manualForm.phone,
      customerAddress: manualForm.address,
      customerCity: manualForm.city,
      parcelWeight: manualForm.weight,
      trackingNumber: isExistingMode ? manualForm.trackingNumber : undefined,
      items: [{ productId: p.id, name: p.name, price: p.price, quantity: 1 }],
      totalAmount: p.price,
      status: OrderStatus.PENDING,
      createdAt: new Date().toISOString(),
      isPrinted: false,
      openedBy: currentUser,
      logs: [{ id: `l-${Date.now()}`, message: 'Manual Creation', timestamp: new Date().toISOString(), user: currentUser }]
    };
    
    await db.createOrders([order]);
    setMessage({ text: "Entry Handshake Complete", type: 'success' });
    setManualForm({ 
        name: '', 
        phone: '', 
        address: '', 
        productId: '', 
        trackingNumber: '', 
        city: cities.includes('Colombo') ? 'Colombo' : cities[0], 
        weight: '1' 
    });
    setCustomerHistory(null);
    setTimeout(() => setMessage(null), 3000);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
        const text = event.target?.result as string;
        const parsed = parseCSV(text);
        setPendingLeads(parsed);
    };
    reader.readAsText(file);
  };

  const handleBulkSubmit = async () => {
    if (!csvProductId) return alert("Please select a target SKU for these leads.");
    if (pendingLeads.length === 0) return;
    
    setIsProcessing(true);
    const p = products.find(x => x.id === csvProductId);
    if (!p) return;

    const newOrders: Order[] = pendingLeads.map((lead, idx) => ({
        id: `ord-bulk-${Date.now()}-${idx}`,
        tenantId,
        customerName: lead.name,
        customerPhone: lead.phone,
        customerAddress: lead.address,
        customerCity: lead.city || (cities.includes('Colombo') ? 'Colombo' : cities[0]),
        parcelWeight: '1',
        items: [{ productId: p.id, name: p.name, price: p.price, quantity: 1 }],
        totalAmount: p.price,
        status: OrderStatus.PENDING,
        createdAt: new Date().toISOString(),
        isPrinted: false,
        openedBy: currentUser,
        logs: [{ id: `l-${Date.now()}`, message: 'Bulk CSV Ingestion', timestamp: new Date().toISOString(), user: currentUser }]
    }));

    await db.createOrders(newOrders);
    setIsProcessing(false);
    setPendingLeads([]);
    setMessage({ text: `${newOrders.length} Leads Injected Successfully`, type: 'success' });
    setTimeout(() => setMessage(null), 3000);
  };

  const isExistingMode = tenant?.settings.courierMode === CourierMode.EXISTING_WAYBILL;

  return (
    <div className="space-y-8 animate-slide-in max-w-[1300px] mx-auto pb-20 px-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="p-4 bg-blue-600 text-white rounded-[1.5rem] shadow-xl">
             <UserPlus size={28} />
          </div>
          <div>
            <h2 className="text-4xl font-black text-slate-900 tracking-tighter uppercase leading-none">Inbound Terminal</h2>
            <div className="flex items-center gap-2 mt-2">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{shopName} Injection Engine</span>
                <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase ${isExistingMode ? 'bg-indigo-600 text-white' : 'bg-emerald-500 text-white'}`}>
                    {isExistingMode ? 'Mode: Existing Waybill' : 'Mode: Standard API'}
                </span>
            </div>
          </div>
        </div>
        {message && (
            <div className="flex items-center gap-3 px-6 py-3 rounded-2xl bg-emerald-600 text-white text-[11px] font-black uppercase tracking-widest shadow-xl animate-bounce">
                <CheckCircle2 size={16}/> {message.text}
            </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <div className="lg:col-span-8 space-y-8">
            
            <div className="bg-white p-10 rounded-[3rem] border border-slate-100 shadow-sm space-y-8">
              <div className="flex items-center justify-between pb-6 border-b border-slate-50">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-slate-50 text-blue-600 rounded-2xl flex items-center justify-center border border-slate-100">
                    <Zap size={24} />
                  </div>
                  <h3 className="text-xl font-black text-slate-900 tracking-tighter uppercase">Direct Injection</h3>
                </div>
                {customerHistory?.count > 0 && (
                    <div className="flex items-center gap-2 px-5 py-2.5 bg-amber-50 text-amber-600 border border-amber-100 rounded-2xl text-[10px] font-black uppercase tracking-tight">
                        <AlertTriangle size={16} /> DUPLICATE: {customerHistory.count} RECORDS
                    </div>
                )}
              </div>

              {isExistingMode && (
                  <div className="bg-indigo-50 border border-indigo-100 p-8 rounded-[2rem] space-y-6">
                      <div className="flex items-center gap-2">
                        <Zap size={16} className="text-indigo-600" />
                        <h4 className="text-[10px] font-black text-indigo-900 uppercase tracking-[0.2em]">Required Protocol Fields</h4>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-indigo-400 uppercase tracking-widest ml-1">Waybill ID (Reference)</label>
                            <input 
                                className="w-full bg-white border border-indigo-200 rounded-2xl px-5 py-3.5 text-sm font-black text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-mono" 
                                value={manualForm.trackingNumber} 
                                onChange={(e) => setManualForm({...manualForm, trackingNumber: e.target.value})} 
                                placeholder="Scan assigned WB..." 
                            />
                        </div>
                        <div className="space-y-1.5 relative">
                            <label className="text-[10px] font-black text-indigo-400 uppercase tracking-widest ml-1">Recipient City</label>
                            <select 
                                className="w-full bg-white border border-indigo-200 rounded-2xl px-5 py-3.5 text-sm font-black text-slate-900 outline-none appearance-none"
                                value={manualForm.city} 
                                onChange={(e) => setManualForm({...manualForm, city: e.target.value})}
                            >
                                {cities.map(c => <option key={c} value={c}>{c.toUpperCase()}</option>)}
                            </select>
                            <MapPin className="absolute right-5 bottom-3.5 text-indigo-300 pointer-events-none" size={18} />
                        </div>
                      </div>
                  </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Identity Name</label>
                    <input 
                        className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-3.5 text-sm font-black text-slate-900 outline-none focus:ring-2 focus:ring-blue-500 transition-all" 
                        value={manualForm.name} 
                        onChange={(e) => setManualForm({...manualForm, name: e.target.value})} 
                        placeholder="Ex. John Doe" 
                    />
                </div>
                <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Contact No</label>
                    <input 
                        className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-3.5 text-sm font-black text-slate-900 outline-none focus:ring-2 focus:ring-blue-500 transition-all" 
                        value={manualForm.phone} 
                        onChange={(e) => setManualForm({...manualForm, phone: e.target.value})} 
                        placeholder="077..." 
                    />
                </div>
                <div className="md:col-span-2 space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Deployment Address</label>
                  <textarea 
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-6 py-4 text-sm font-black text-slate-900 outline-none focus:ring-2 focus:ring-blue-500 transition-all min-h-[100px]"
                    value={manualForm.address} 
                    onChange={(e) => setManualForm({...manualForm, address: e.target.value})}
                    placeholder="Full street address..."
                  />
                </div>
                
                <div className="space-y-2 relative">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">SKU Assignment</label>
                  <select 
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-6 py-4 text-sm font-black text-slate-900 outline-none appearance-none"
                    value={manualForm.productId} 
                    onChange={(e) => setManualForm({...manualForm, productId: e.target.value})}
                  >
                    <option value="">Select Target SKU...</option>
                    {products.map(p => <option key={p.id} value={p.id}>{p.name} - {formatCurrency(p.price)}</option>)}
                  </select>
                  <ChevronDown className="absolute right-6 bottom-4 text-slate-400 pointer-events-none" size={18} />
                </div>

                <div className="space-y-2 relative">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Parcel Weight (KG)</label>
                    <div className="relative">
                        <input 
                            type="number"
                            className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-6 py-4 text-sm font-black text-slate-900 outline-none focus:ring-2 focus:ring-blue-500 transition-all" 
                            value={manualForm.weight} 
                            onChange={(e) => setManualForm({...manualForm, weight: e.target.value})} 
                            placeholder="1" 
                        />
                        <Scale size={18} className="absolute right-6 top-1/2 -translate-y-1/2 text-slate-300" />
                    </div>
                </div>
              </div>
              <button onClick={handleManualSubmit} className="w-full py-6 bg-black text-white rounded-[2rem] font-black text-[11px] uppercase tracking-[0.3em] shadow-2xl hover:scale-105 active:scale-95 transition-all">
                Commit to Pipeline
              </button>
            </div>

            <div className="bg-white p-10 rounded-[3rem] border border-slate-100 shadow-sm space-y-8">
                <div className="flex items-center justify-between pb-6 border-b border-slate-50">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-slate-950 text-white rounded-2xl flex items-center justify-center shadow-lg">
                            <FileSpreadsheet size={24} />
                        </div>
                        <h3 className="text-xl font-black text-slate-900 tracking-tighter uppercase">Bulk CSV Registry</h3>
                    </div>
                    {pendingLeads.length > 0 && (
                        <button onClick={() => setPendingLeads([])} className="p-2 text-rose-500 hover:bg-rose-50 rounded-xl transition-all"><Trash2 size={20}/></button>
                    )}
                </div>

                {pendingLeads.length === 0 ? (
                    <div 
                        onClick={() => fileInputRef.current?.click()}
                        className="group border-4 border-dashed border-slate-50 rounded-[2.5rem] py-20 flex flex-col items-center justify-center cursor-pointer hover:border-blue-200 hover:bg-blue-50/30 transition-all"
                    >
                        <Upload size={48} className="text-slate-200 group-hover:text-blue-400 group-hover:scale-110 transition-all mb-4" />
                        <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Drop CSV Payload</p>
                        <input ref={fileInputRef} type="file" accept=".csv" onChange={handleFileUpload} className="hidden" />
                    </div>
                ) : (
                    <div className="space-y-6">
                        <div className="bg-blue-50 border-2 border-blue-100 p-8 rounded-[2.5rem] space-y-6">
                            <div className="flex items-center gap-4 text-blue-900">
                                <Box size={24} />
                                <h4 className="text-sm font-black uppercase tracking-widest">Batch Configuration</h4>
                            </div>
                            <div className="relative">
                                <select 
                                    className="w-full bg-white border-2 border-blue-200 rounded-2xl px-6 py-5 text-lg font-black outline-none appearance-none focus:border-blue-600 transition-all shadow-xl shadow-blue-500/10"
                                    value={csvProductId}
                                    onChange={e => setCsvProductId(e.target.value)}
                                >
                                    <option value="">Select Target SKU for Batch...</option>
                                    {products.map(p => <option key={p.id} value={p.id}>{p.name} ({formatCurrency(p.price)})</option>)}
                                </select>
                                <ChevronDown className="absolute right-6 top-1/2 -translate-y-1/2 text-blue-600" size={20} />
                            </div>
                        </div>

                        <div className="max-h-[300px] overflow-auto rounded-3xl border border-slate-100 no-scrollbar shadow-inner">
                            <table className="w-full text-left compact-table">
                                <thead className="sticky top-0 bg-white border-b border-slate-50">
                                    <tr>
                                        <th>Name</th>
                                        <th>Phone</th>
                                        <th>Address</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {pendingLeads.map((l, i) => (
                                        <tr key={i} className="bg-white hover:bg-slate-50 transition-colors">
                                            <td className="text-[11px] font-black uppercase">{l.name}</td>
                                            <td className="text-[11px] font-bold text-slate-400">{l.phone}</td>
                                            <td className="text-[10px] font-medium text-slate-400 truncate max-w-[200px]">{l.address}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <button 
                            disabled={!csvProductId || isProcessing}
                            onClick={handleBulkSubmit}
                            className="w-full py-6 bg-slate-900 text-white rounded-[2.5rem] font-black text-[11px] uppercase tracking-[0.4em] shadow-2xl hover:scale-105 active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-3"
                        >
                            <Database size={18} /> {isProcessing ? 'SYNCHRONIZING...' : `Commit ${pendingLeads.length} Leads`}
                        </button>
                    </div>
                )}
            </div>
        </div>

        <div className="lg:col-span-4 space-y-8 sticky top-10">
            <div className="bg-slate-950 text-white p-10 rounded-[3rem] shadow-2xl relative overflow-hidden flex flex-col min-h-[500px] border border-white/5">
                <div className="absolute top-0 right-0 w-64 h-64 bg-blue-600 rounded-full blur-[100px] opacity-20 transform translate-x-1/2 -translate-y-1/2"></div>
                <div className="relative z-10 h-full flex flex-col">
                    <div className="flex items-center gap-3 mb-10">
                        <History size={24} className="text-blue-400" />
                        <h3 className="text-sm font-black uppercase tracking-[0.2em]">Customer Intel</h3>
                    </div>
                    {!customerHistory ? (
                        <div className="flex-1 flex flex-col items-center justify-center text-center py-20 opacity-30">
                            <Package size={64} className="mb-6 stroke-1" />
                            <p className="text-[10px] font-black uppercase tracking-[0.4em] leading-relaxed">System Listening...</p>
                        </div>
                    ) : (
                        <div className="space-y-10 animate-slide-in">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-white/5 p-6 rounded-3xl border border-white/10 text-center">
                                    <p className="text-[9px] font-black text-slate-500 uppercase mb-2 tracking-widest">History</p>
                                    <p className="text-4xl font-black text-white">{customerHistory.count}</p>
                                </div>
                                <div className={`p-6 rounded-3xl border text-center ${customerHistory.returns > 0 ? 'bg-rose-500/10 border-rose-500/30' : 'bg-emerald-500/10 border-emerald-500/30'}`}>
                                    <p className="text-[9px] font-black text-slate-500 uppercase mb-2 tracking-widest">Returns</p>
                                    <p className={`text-4xl font-black ${customerHistory.returns > 0 ? 'text-rose-500' : 'text-emerald-500'}`}>{customerHistory.returns}</p>
                                </div>
                            </div>
                            {customerHistory.returns > 0 && (
                                <div className="bg-rose-600/20 border border-rose-600/30 p-8 rounded-3xl flex items-start gap-4">
                                    <ShieldAlert size={20} className="text-rose-500 shrink-0 mt-0.5" />
                                    <p className="text-[11px] font-bold text-rose-400 uppercase leading-relaxed tracking-tight">Identity Mismatch Risk: Subject has multiple rejections in cluster. Exercise caution.</p>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
      </div>
    </div>
  );
};
