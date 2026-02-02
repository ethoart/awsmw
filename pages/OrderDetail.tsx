
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { db } from '../services/mockBackend';
import { Order, OrderStatus, OrderLog, Product, Tenant, CourierMode } from '../types';
import { 
  ArrowLeft, Truck, Check, Clock, User as UserIcon, Save, 
  Activity, MapPin, Package, Trash2, Plus, Printer, RefreshCcw, MessageSquare, Zap, Calendar, ShoppingBag, DollarSign, Search, ChevronDown, X, History, ShoppingCart, Scale, Info, CheckCircle2, History as HistoryIcon, UserCheck, ExternalLink, Phone, RotateCcw, AlertCircle
} from 'lucide-react';
import { formatCurrency } from '../utils/helpers';
import { BillPrintView } from '../components/BillPrintView';
import { createPortal } from 'react-dom';

const SRI_LANKA_CITIES_FALLBACK = ["Colombo", "Gampaha", "Kalutara", "Kandy", "Matale", "Nuwara Eliya", "Galle", "Matara", "Hambantota", "Jaffna", "Kilinochchi", "Mannar", "Vavuniya", "Mullaitivu", "Batticaloa", "Ampara", "Trincomalee", "Kurunegala", "Puttalam", "Anuradhapura", "Polonnaruwa", "Badulla", "Monaragala", "Ratnapura", "Kegalle", "Dehiwala-Mount Lavinia", "Moratuwa", "Negombo", "Sri Jayawardenepura Kotte", "Kaduwela", "Kolonnawa", "Chilaw", "Wattala", "Welisara", "Ja-Ela", "Paliyagoda", "Gampola", "Nawalapitiya", "Haputale"].sort();

interface OrderDetailProps {
  orderId: string;
  tenantId: string;
  onBack: () => void;
}

export const OrderDetail: React.FC<OrderDetailProps> = ({ orderId, tenantId, onBack }) => {
  const [order, setOrder] = useState<Order | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [cities, setCities] = useState<string[]>([]);
  const [customerHistory, setCustomerHistory] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [shippingLoading, setShippingLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showPrintPortal, setShowPrintPortal] = useState(false);

  const [citySearch, setCitySearch] = useState('');
  const [isCityDropdownOpen, setIsCityDropdownOpen] = useState(false);
  const cityDropdownRef = useRef<HTMLDivElement>(null);

  const [localFormData, setLocalFormData] = useState({ 
    customerName: '', 
    customerPhone: '', 
    customerPhone2: '',
    customerAddress: '', 
    customerCity: '', 
    parcelWeight: '1', 
    parcelDescription: '', 
    trackingNumber: '', 
    createdAt: '' 
  });
  const [items, setItems] = useState<{ productId: string; quantity: number; price: number; name: string }[]>([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const results = await Promise.allSettled([db.getOrder(orderId, tenantId), db.getProducts(tenantId), db.getTenant(tenantId), db.getGlobalCities()]);
      const data = results[0].status === 'fulfilled' ? (results[0].value as Order) : null;
      const fetchedProducts = results[1].status === 'fulfilled' ? (results[1].value as Product[]) : [];
      const fetchedTenant = results[2].status === 'fulfilled' ? (results[2].value as Tenant) : null;
      const fetchedCities = results[3].status === 'fulfilled' ? (results[3].value as string[]) : [];
      
      const uniqueCities = Array.from(new Set(fetchedCities && fetchedCities.length > 0 ? fetchedCities : SRI_LANKA_CITIES_FALLBACK));
      setCities(uniqueCities);

      if (data) {
        setOrder(data);
        setProducts(fetchedProducts);
        setTenant(fetchedTenant || null);
        db.getCustomerDetailedHistory(data.customerPhone, tenantId).then(h => setCustomerHistory(h.filter(x => x.id !== orderId))).catch(() => {});

        const initialCity = data.customerCity || (uniqueCities.includes('Colombo') ? 'Colombo' : uniqueCities[0]);
        setCitySearch(initialCity);

        let dateVal = '';
        if (data.createdAt) {
          const dateObj = new Date(data.createdAt);
          if (!isNaN(dateObj.getTime())) {
            const offset = dateObj.getTimezoneOffset() * 60000;
            dateVal = (new Date(dateObj.getTime() - offset)).toISOString().slice(0, 16);
          }
        }

        setLocalFormData({ 
          customerName: data.customerName || '', 
          customerPhone: data.customerPhone || '', 
          customerPhone2: data.customerPhone2 || '',
          customerAddress: data.customerAddress || '', 
          customerCity: initialCity, 
          parcelWeight: data.parcelWeight || '1', 
          parcelDescription: data.parcelDescription || 'Online Order', 
          trackingNumber: data.trackingNumber || '', 
          createdAt: dateVal 
        });
        setItems(data.items || []);
      }
    } finally { setLoading(false); }
  }, [orderId, tenantId]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (cityDropdownRef.current && !cityDropdownRef.current.contains(event.target as Node)) {
        setIsCityDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (order && order.status === OrderStatus.PENDING) {
        updateStatus(OrderStatus.OPEN_LEAD);
    }
  }, [order?.id, order?.status]);

  const filteredCities = useMemo(() => {
    return cities.filter(c => c.toLowerCase().includes(citySearch.toLowerCase()));
  }, [cities, citySearch]);

  const totalAmount = useMemo(() => items.reduce((sum, item) => sum + (item.price * item.quantity), 0), [items]);

  const handleInventoryReduction = async () => {
    try {
        const reductionPromises = items.map(item => 
            db.deductStockFIFO(tenantId, item.productId, item.quantity)
        );
        await Promise.all(reductionPromises);
        console.log(">>> Inventory Protocol: Batch Reduction Successful.");
    } catch (err) {
        console.error(">>> Inventory Failure:", err);
    }
  };

  const updateStatus = async (newStatus: OrderStatus) => {
    if (!order) return;
    const user = localStorage.getItem('mw_user') ? JSON.parse(localStorage.getItem('mw_user')!).username : 'System';
    
    // ACTION: Reduce stock upon confirmation or direct ship if not done yet
    const needsStockReduction = (newStatus === OrderStatus.CONFIRMED || newStatus === OrderStatus.SHIPPED) && 
                               order.status !== OrderStatus.CONFIRMED && 
                               order.status !== OrderStatus.SHIPPED;

    if (needsStockReduction) {
        await handleInventoryReduction();
    }

    if (newStatus === OrderStatus.SHIPPED) {
      if (tenant?.settings.courierMode === CourierMode.EXISTING_WAYBILL && !localFormData.trackingNumber) return alert("Waybill ID required.");
      setShippingLoading(true);
      try { 
        await db.shipOrder({ ...order, ...localFormData, items, totalAmount }, tenantId);
        alert(`Logistics Protocol Success: Waybill Assigned.`);
        loadData();
      } catch (e: any) { alert(`Logistics Handshake Error: ${e.message}`); } 
      finally { setShippingLoading(false); }
      return;
    }
    
    setIsSaving(true);
    const log: OrderLog = { id: `l-${Date.now()}`, message: `Status Protocol: Order transitioned to ${newStatus}`, timestamp: new Date().toISOString(), user };
    await db.updateOrder({ ...order, ...localFormData, items, totalAmount, status: newStatus, logs: [...(order.logs || []), log] });
    setIsSaving(false);
    
    if (newStatus === OrderStatus.OPEN_LEAD) {
        setOrder(prev => prev ? { ...prev, status: OrderStatus.OPEN_LEAD, logs: [...(prev.logs || []), log] } : null);
    } else {
        loadData();
    }
  };

  const handleItemChange = (idx: number, field: string, val: any) => {
    const next = [...items];
    if (field === 'productId') {
        const prod = products.find(p => p.id === val);
        if (prod) next[idx] = { ...next[idx], productId: val, name: prod.name, price: prod.price };
    } else {
        next[idx] = { ...next[idx], [field]: val };
    }
    setItems(next);
  };

  const addItem = () => {
    if (products.length === 0) return;
    setItems([...items, { productId: products[0].id, name: products[0].name, price: products[0].price, quantity: 1 }]);
  };

  const removeItem = (idx: number) => {
    setItems(items.filter((_, i) => i !== idx));
  };

  const selectCity = (city: string) => {
    setLocalFormData({ ...localFormData, customerCity: city });
    setCitySearch(city);
    setIsCityDropdownOpen(false);
  };

  const getStatusBadgeClass = (status: OrderStatus) => {
    switch(status) {
      case OrderStatus.DELIVERED: return 'bg-emerald-50 text-emerald-600 border-emerald-100';
      case OrderStatus.REJECTED: return 'bg-rose-50 text-rose-600 border-rose-100';
      case OrderStatus.RETURNED: return 'bg-amber-50 text-amber-600 border-amber-100';
      case OrderStatus.SHIPPED: return 'bg-blue-50 text-blue-600 border-blue-100';
      default: return 'bg-slate-50 text-slate-500 border-slate-100';
    }
  };

  if (loading || !order) return <div className="p-20 text-center font-black uppercase text-slate-300">Synchronizing...</div>;

  const isConfirmed = order.status === OrderStatus.CONFIRMED;
  const isShipped = order.status === OrderStatus.SHIPPED;

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-20 animate-slide-in no-print px-2">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="flex items-center gap-4">
                <button onClick={onBack} className="p-4 bg-white border border-slate-100 rounded-3xl text-black shadow-sm hover:bg-slate-50 transition-all"><ArrowLeft size={20} /></button>
                <div>
                    <div className="flex items-center gap-3">
                        <h1 className="text-3xl font-black text-slate-900 uppercase leading-none tracking-tight">Node #{order.id.slice(-6)}</h1>
                        <span className="px-3 py-1 bg-blue-50 text-blue-600 rounded-lg text-[9px] font-black uppercase tracking-widest border border-blue-100">LOG LOCKED</span>
                    </div>
                    <div className="flex items-center gap-4 mt-2">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                            <Calendar size={12} className="text-blue-500" /> <span className="text-slate-900">{new Date(order.createdAt).toLocaleString()}</span>
                        </p>
                    </div>
                </div>
            </div>
            <div className="flex gap-2">
                <button onClick={() => { setShowPrintPortal(true); setTimeout(() => { window.print(); setShowPrintPortal(false); }, 500); }} className="bg-white border border-slate-200 text-slate-900 px-6 py-4 rounded-2xl font-black uppercase text-[10px] flex items-center gap-3 shadow-sm hover:border-blue-600 transition-all"><Printer size={16} /> Print Bill</button>
                <button onClick={async () => { setIsSaving(true); await db.updateOrder({ ...order, ...localFormData, items, totalAmount }); setIsSaving(false); alert("Registry updated."); }} className="bg-slate-950 text-white px-8 py-4 rounded-2xl font-black uppercase text-[10px] flex items-center gap-3 shadow-2xl active:scale-95 transition-all">
                    {isSaving ? <RefreshCcw size={16} className="animate-spin" /> : <Save size={16} />} Commit Changes
                </button>
            </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-8">
                {/* Protocol Control */}
                <div className="bg-white p-10 rounded-[3rem] border border-slate-100 shadow-sm space-y-6">
                    <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2 mb-2"><Activity size={16} className="text-blue-600"/> Handshake Protocol</h3>
                    <div className="flex flex-wrap gap-3">
                        {(!isConfirmed && !isShipped) ? (
                            <>
                                <button onClick={() => updateStatus(OrderStatus.NO_ANSWER)} className={`px-5 py-3.5 rounded-2xl font-black text-[10px] uppercase transition-all shadow-lg ${order.status === OrderStatus.NO_ANSWER ? 'bg-amber-500 text-white ring-4 ring-amber-100' : 'bg-amber-400 text-black hover:bg-amber-500'}`}>No Answer</button>
                                <button onClick={() => updateStatus(OrderStatus.REJECTED)} className={`px-5 py-3.5 rounded-2xl font-black text-[10px] uppercase transition-all shadow-lg ${order.status === OrderStatus.REJECTED ? 'bg-rose-700 text-white ring-4 ring-rose-100' : 'bg-rose-600 text-white hover:bg-rose-700'}`}>Rejected</button>
                                <button onClick={() => updateStatus(OrderStatus.CONFIRMED)} className="px-10 py-3.5 rounded-2xl font-black text-[10px] uppercase shadow-xl transition-all bg-emerald-500 text-white hover:bg-emerald-600 hover:scale-105">CONFIRM ORDER</button>
                                <button onClick={() => updateStatus(OrderStatus.HOLD)} className={`px-5 py-3.5 rounded-2xl font-black text-[10px] uppercase transition-all shadow-lg ${order.status === OrderStatus.HOLD ? 'bg-purple-700 text-white ring-4 ring-purple-100' : 'bg-purple-600 text-white hover:bg-purple-700'}`}>Hold</button>
                            </>
                        ) : (
                            <>
                                {isConfirmed && (
                                    <button onClick={() => updateStatus(OrderStatus.SHIPPED)} disabled={shippingLoading} className={`px-12 py-5 rounded-[2rem] font-black text-[14px] uppercase flex items-center gap-3 shadow-2xl transition-all bg-blue-600 text-white hover:bg-blue-700 hover:scale-105 animate-pulse`}>
                                        <Truck size={24} /> {shippingLoading ? 'SYNCHRONIZING...' : 'TRANSMIT TO LOGISTICS'}
                                    </button>
                                )}
                                {isShipped && (
                                    <div className="px-10 py-4 bg-indigo-700 text-white rounded-[2rem] font-black text-[12px] uppercase flex items-center gap-3 shadow-xl">
                                        <CheckCircle2 size={20} /> Transmitted Successfully
                                    </div>
                                )}
                                <button onClick={() => updateStatus(OrderStatus.OPEN_LEAD)} className="px-5 py-3.5 rounded-2xl font-black text-[10px] uppercase transition-all bg-slate-200 text-slate-600 hover:bg-slate-300 flex items-center gap-2"><RotateCcw size={14} /> Reset Status</button>
                            </>
                        )}
                    </div>
                </div>

                {/* Recipient Intelligence */}
                <div className="bg-white p-10 rounded-[3rem] border border-slate-100 shadow-sm space-y-8">
                    <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2"><UserIcon size={16} className="text-blue-600"/> Recipient Mapping</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Consignee Name</label>
                            <input className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-3.5 font-bold outline-none focus:ring-2 focus:ring-blue-600" value={localFormData.customerName} onChange={e => setLocalFormData({...localFormData, customerName: e.target.value})} />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Primary Contact</label>
                            <input className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-3.5 font-bold outline-none focus:ring-2 focus:ring-blue-600" value={localFormData.customerPhone} onChange={e => setLocalFormData({...localFormData, customerPhone: e.target.value})} />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Alt Contact</label>
                            <div className="relative">
                                <input className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-3.5 pl-12 font-bold outline-none focus:ring-2 focus:ring-blue-600" value={localFormData.customerPhone2} onChange={e => setLocalFormData({...localFormData, customerPhone2: e.target.value})} />
                                <Phone size={16} className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400" />
                            </div>
                        </div>
                        <div className="space-y-1.5 relative" ref={cityDropdownRef}>
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">City Hub</label>
                            <div className="relative">
                                <input className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-3.5 font-bold outline-none focus:ring-2 focus:ring-blue-600" value={citySearch} onFocus={() => setIsCityDropdownOpen(true)} onChange={e => { setCitySearch(e.target.value); setIsCityDropdownOpen(true); }} />
                                <MapPin className="absolute right-5 bottom-3.5 text-slate-400" size={18} />
                            </div>
                            {isCityDropdownOpen && (
                                <div className="absolute z-50 w-full mt-2 bg-white border border-slate-200 rounded-2xl shadow-2xl max-h-[200px] overflow-y-auto no-scrollbar">
                                    {filteredCities.map(c => <button key={c} onClick={() => selectCity(c)} className="w-full text-left px-5 py-3 text-[13px] font-bold hover:bg-blue-50 uppercase border-b border-slate-50">{c}</button>)}
                                </div>
                            )}
                        </div>
                        <div className="md:col-span-2 space-y-1.5">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Address</label>
                            <textarea className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 font-bold outline-none min-h-[100px]" value={localFormData.customerAddress} onChange={e => setLocalFormData({...localFormData, customerAddress: e.target.value})} />
                        </div>
                    </div>
                </div>

                {/* Order Payload Editor (Price/Items) */}
                <div className="bg-white p-10 rounded-[3rem] border border-slate-100 shadow-sm space-y-8">
                    <div className="flex items-center justify-between">
                        <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2"><Package size={16} className="text-blue-600"/> Order Payload</h3>
                        <button onClick={addItem} className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-600 rounded-xl text-[10px] font-black uppercase hover:bg-blue-600 hover:text-white transition-all"><Plus size={14}/> Add Item</button>
                    </div>
                    
                    <div className="space-y-4">
                        {items.length === 0 && <div className="py-10 text-center text-slate-300 uppercase text-[10px] font-black tracking-widest border-2 border-dashed border-slate-50 rounded-3xl">Payload Empty</div>}
                        {items.map((item, idx) => (
                            <div key={idx} className="p-6 bg-slate-50 border border-slate-100 rounded-[2rem] flex flex-col md:flex-row items-center gap-6 group hover:border-blue-200 transition-all">
                                <div className="flex-1 w-full space-y-1.5">
                                    <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Product SKU</label>
                                    <select className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold outline-none appearance-none" value={item.productId} onChange={e => handleItemChange(idx, 'productId', e.target.value)}>
                                        {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                    </select>
                                </div>
                                <div className="w-full md:w-32 space-y-1.5">
                                    <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Price (LKR)</label>
                                    <input type="number" className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-black outline-none" value={item.price} onChange={e => handleItemChange(idx, 'price', parseFloat(e.target.value) || 0)} />
                                </div>
                                <div className="w-full md:w-24 space-y-1.5">
                                    <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Quantity</label>
                                    <input type="number" className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-black outline-none text-center" value={item.quantity} onChange={e => handleItemChange(idx, 'quantity', parseInt(e.target.value) || 0)} />
                                </div>
                                <div className="flex flex-col items-end pt-4 md:pt-0">
                                    <p className="text-[8px] font-black text-slate-400 uppercase mb-1">Subtotal</p>
                                    <p className="text-sm font-black text-slate-900">{formatCurrency(item.price * item.quantity)}</p>
                                </div>
                                <button onClick={() => removeItem(idx)} className="p-3 text-slate-300 hover:text-rose-600 transition-all"><Trash2 size={16}/></button>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <div className="space-y-8">
                {/* Customer Nexus (Intel History) */}
                <div className="bg-white p-10 rounded-[3rem] border border-slate-100 shadow-sm space-y-8">
                    <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2"><HistoryIcon size={16} className="text-blue-600"/> Customer Intelligence Nexus</h3>
                    <div className="space-y-4">
                        {customerHistory.length === 0 ? (
                            <div className="py-10 text-center flex flex-col items-center gap-3 opacity-30">
                                <UserCheck size={40} className="text-slate-300" />
                                <p className="text-[10px] font-black uppercase tracking-widest">New Customer Entry</p>
                            </div>
                        ) : (
                            customerHistory.map(h => (
                                <div key={h.id} className="p-6 bg-slate-50 border border-slate-100 rounded-[2rem] flex items-center justify-between group hover:bg-white hover:shadow-lg transition-all">
                                    <div className="flex items-center gap-4">
                                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center border font-black text-[14px] ${getStatusBadgeClass(h.status)}`}>
                                            <ShoppingBag size={20} />
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm font-black text-slate-900">REF #{h.id.slice(-6).toUpperCase()}</span>
                                                <span className={`px-2 py-0.5 border rounded-lg text-[8px] font-black uppercase tracking-tight ${getStatusBadgeClass(h.status)}`}>{h.status}</span>
                                            </div>
                                            <p className="text-[10px] font-bold text-slate-400 uppercase mt-0.5">{new Date(h.createdAt).toLocaleDateString()} • {h.items[0]?.name || 'Item'}</p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-sm font-black text-slate-900">{formatCurrency(h.totalAmount)}</p>
                                        <p className="text-[9px] font-black text-blue-600 uppercase mt-0.5">Value Locked</p>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* Finance Monitor */}
                <div className="bg-slate-950 text-white p-10 rounded-[3rem] shadow-2xl relative border border-white/5 overflow-hidden">
                    <div className="absolute top-0 right-0 w-48 h-48 bg-blue-600/10 blur-[100px] -translate-y-1/2 translate-x-1/2"></div>
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] mb-2 relative z-10">Total Amount</p>
                    <h2 className="text-4xl font-black tracking-tighter text-blue-400 relative z-10">{formatCurrency(totalAmount)}</h2>
                    <div className="mt-6 flex items-center gap-4 relative z-10">
                        <div className="px-3 py-1 bg-white/5 border border-white/10 rounded-xl text-[9px] font-black uppercase text-slate-400">Items: {items.length}</div>
                        <div className="px-3 py-1 bg-white/5 border border-white/10 rounded-xl text-[9px] font-black uppercase text-slate-400">Total Units: {items.reduce((a,b) => a + b.quantity, 0)}</div>
                    </div>
                </div>

                {/* Logistics Intel */}
                {isShipped && order.trackingNumber && (
                    <div className="bg-blue-600 text-white p-10 rounded-[3rem] shadow-2xl space-y-4">
                        <div className="flex items-center gap-2 opacity-60">
                            <Truck size={16} />
                            <h4 className="text-[10px] font-black uppercase tracking-widest">Logistics Waybill</h4>
                        </div>
                        <h3 className="text-2xl font-black font-mono tracking-tighter">{order.trackingNumber}</h3>
                        <p className="text-[10px] font-bold uppercase opacity-60">Handshake timestamp: {new Date(order.shippedAt!).toLocaleString()}</p>
                    </div>
                )}

                {/* System Registry Log */}
                <div className="bg-white p-10 rounded-[3rem] border border-slate-100 shadow-sm space-y-6">
                    <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2"><History size={16} className="text-blue-600"/> Audit Registry</h3>
                    <div className="space-y-4 max-h-[450px] overflow-y-auto no-scrollbar">
                        {order.logs?.slice().reverse().map(log => (
                            <div key={log.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex items-start gap-4">
                                <div className="w-8 h-8 rounded-xl bg-white border border-slate-100 flex items-center justify-center text-[10px] font-black text-blue-600 shrink-0 shadow-sm">{log.user.slice(0, 1).toUpperCase()}</div>
                                <div className="flex-1">
                                    <div className="flex justify-between items-center mb-1">
                                        <span className="text-[9px] font-black text-slate-900 uppercase">{log.user}</span>
                                        <span className="text-[8px] font-bold text-slate-400">{new Date(log.timestamp).toLocaleTimeString()}</span>
                                    </div>
                                    <p className="text-[11px] font-bold text-slate-600 uppercase tracking-tight leading-relaxed">{log.message}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
        {showPrintPortal && tenant && createPortal(<div className="print-only"><BillPrintView order={{...order, ...localFormData, items, totalAmount}} settings={tenant.settings} /></div>, document.body)}
    </div>
  );
};
