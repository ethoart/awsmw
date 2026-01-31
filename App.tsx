
import React, { useState, useEffect, useCallback } from 'react';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './pages/Dashboard';
import { OrderDetail } from './pages/OrderDetail'; 
import { Stock } from './pages/Stock';
import { Returns } from './pages/Returns';
import { DevAdmin } from './pages/DevAdmin';
import { Settings } from './pages/Settings';
import { Team } from './pages/Team';
import { Leads } from './pages/Leads';
import { SellingPipeline } from './pages/SellingPipeline';
import { ShippingPipeline } from './pages/ShippingPipeline';
import { ReturnManagement } from './pages/ReturnManagement';
import { ResidualManagement } from './pages/ResidualManagement';
import { FinancialCenter } from './pages/FinancialCenter';
import { TodayShipped } from './pages/TodayShipped';
import { User, UserRole, Tenant } from './types';
import { db } from './services/mockBackend';
import { Lock, User as UserIcon, Menu, Globe } from 'lucide-react';

const LoginPage = ({ onLogin, branding }: { onLogin: (u: string, p: string) => Promise<void>, branding?: Tenant }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  
  const handleLoginClick = async () => {
    if (!username || !password) {
        alert('Please enter your credentials');
        return;
    }
    try {
      setLoading(true);
      await onLogin(username, password);
    } catch (e: any) {
      alert(e.message || 'Authentication failed.');
    } finally {
      setLoading(false);
    }
  }

  const shopName = branding?.settings.shopName || 'Milky Way OMS';
  const logoUrl = branding?.settings.logoUrl;

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f1f5f9] p-4 relative overflow-hidden">
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-500/10 rounded-full blur-[100px]"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-indigo-500/10 rounded-full blur-[100px]"></div>
      
      <div className="z-10 bg-white p-8 md:p-10 rounded-[2.5rem] shadow-2xl w-full max-w-sm border border-slate-100 animate-slide-in">
        <div className="flex flex-col items-center mb-10 text-center">
            {logoUrl ? (
                <img src={logoUrl} alt="Logo" className="w-16 h-16 rounded-2xl object-cover shadow-xl mb-5" />
            ) : (
                <div className="w-14 h-14 bg-blue-600 rounded-2xl flex items-center justify-center shadow-xl shadow-blue-200 mb-5">
                    <Globe className="text-white" size={28} />
                </div>
            )}
            <h1 className="text-2xl font-black text-slate-900 tracking-tighter uppercase leading-none">{shopName}</h1>
            <p className="text-[10px] font-black text-blue-600 uppercase tracking-[0.2em] mt-2">Enterprise OMS Engine</p>
        </div>
        
        <div className="space-y-4">
          <div className="bg-slate-50 rounded-2xl px-5 py-4 border border-slate-200 flex items-center gap-3 focus-within:ring-2 focus-within:ring-blue-500 transition-all">
            <UserIcon size={18} className="text-slate-400" />
            <input className="w-full bg-transparent text-slate-900 font-bold outline-none text-[13px]" value={username} onChange={e => setUsername(e.target.value)} placeholder="Username" />
          </div>
          <div className="bg-slate-50 rounded-2xl px-5 py-4 border border-slate-200 flex items-center gap-3 focus-within:ring-2 focus-within:ring-blue-500 transition-all">
            <Lock size={18} className="text-slate-400" />
            <input type="password" className="w-full bg-transparent text-slate-900 font-bold outline-none text-[13px]" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" />
          </div>
          <button onClick={handleLoginClick} disabled={loading} className="w-full bg-blue-600 text-white py-4 rounded-2xl font-black uppercase tracking-widest text-[11px] shadow-xl shadow-blue-200 hover:bg-blue-700 active:scale-95 transition-all disabled:opacity-50">
            {loading ? 'SYNCING...' : 'SIGN IN TO CLUSTER'}
          </button>
        </div>

        <div className="mt-10 text-center">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.3em]">
                Authorized Entry Point
            </p>
        </div>
      </div>
    </div>
  );
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [tenant, setTenant] = useState<Tenant | null>(null); 
  const [brandedTenant, setBrandedTenant] = useState<Tenant | null>(null);
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const initBranding = useCallback(async () => {
    try {
      const tenants = await db.getTenants();
      const currentHost = window.location.hostname.toLowerCase().trim();
      const currentHostNoWww = currentHost.replace(/^www\./, '');
      
      const match = tenants.find(t => {
          const tDomain = t.domain?.toLowerCase().trim();
          if (tDomain && (tDomain === currentHost || tDomain === currentHostNoWww)) return true;
          return (t.domainRecords || []).some(r => {
              const host = r.host.toLowerCase().trim();
              return (host === currentHost || host === currentHostNoWww) && r.isActive;
          });
      });
      
      if (match) setBrandedTenant(match);
    } catch (e) {
      console.error("Branding sync failure", e);
    }
  }, []);

  useEffect(() => {
    initBranding();

    const saved = localStorage.getItem('mw_user');
    if (saved) {
        const u = JSON.parse(saved); 
        setUser(u);
        if (u.tenantId) db.getTenant(u.tenantId).then(t => t && setTenant(t));
        if (u.role === UserRole.DEV_ADMIN) setCurrentPage('dev_dashboard');
    }
  }, [initBranding]);

  // Deep Link Observer for Ctrl + Click functionality
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const orderId = params.get('orderId');
    if (orderId && user) {
      setSelectedOrderId(orderId);
      setCurrentPage('order_detail');
      // Clean query string to avoid infinite loops on reload
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [user]);

  useEffect(() => {
    const defaultTitle = user?.role === UserRole.DEV_ADMIN ? 'Master Console' : 'Milky Way OMS';
    const displayShopName = tenant?.settings.shopName || brandedTenant?.settings.shopName || defaultTitle;
    document.title = `${displayShopName} | Control Hub`;
  }, [user, tenant, brandedTenant]);

  const handleLogin = async (u: string, p: string) => {
    const userObj = await db.login(u, p);
    if (userObj) {
      setUser(userObj);
      localStorage.setItem('mw_user', JSON.stringify(userObj));
      if (userObj.tenantId) db.getTenant(userObj.tenantId).then(t => t && setTenant(t));
      setCurrentPage(userObj.role === UserRole.DEV_ADMIN ? 'dev_dashboard' : 'dashboard');
    } else {
        throw new Error("Invalid credentials");
    }
  };

  if (!user) return <LoginPage onLogin={handleLogin} branding={brandedTenant || undefined} />;

  const defaultTitle = user.role === UserRole.DEV_ADMIN ? 'Master Console' : 'Milky Way';
  const displayShopName = tenant?.settings.shopName || brandedTenant?.settings.shopName || defaultTitle;

  const renderPage = () => {
    if (user.role === UserRole.DEV_ADMIN) return <DevAdmin />;
    if (currentPage === 'order_detail' && selectedOrderId) return <OrderDetail orderId={selectedOrderId} tenantId={user.tenantId!} onBack={() => {setSelectedOrderId(null); setCurrentPage('selling');}} />;
    switch(currentPage) {
        case 'dashboard': return <Dashboard tenantId={user.tenantId!} shopName={displayShopName} />;
        case 'leads': return <Leads tenantId={user.tenantId!} shopName={displayShopName} />;
        case 'selling': return <SellingPipeline tenantId={user.tenantId!} shopName={displayShopName} onSelectOrder={(id) => { setSelectedOrderId(id); setCurrentPage('order_detail'); }} />;
        case 'shipping': return <ShippingPipeline tenantId={user.tenantId!} shopName={displayShopName} onSelectOrder={(id) => { setSelectedOrderId(id); setCurrentPage('order_detail'); }} />;
        case 'today_shipped': return <TodayShipped tenantId={user.tenantId!} shopName={displayShopName} />;
        case 'return_mgmt': return <ReturnManagement tenantId={user.tenantId!} shopName={displayShopName} onSelectOrder={(id) => { setSelectedOrderId(id); setCurrentPage('order_detail'); }} />;
        case 'residual_mgmt': return <ResidualManagement tenantId={user.tenantId!} shopName={displayShopName} onSelectOrder={(id) => { setSelectedOrderId(id); setCurrentPage('order_detail'); }} />;
        case 'financials': return <FinancialCenter tenantId={user.tenantId!} shopName={displayShopName} />;
        case 'inventory': return <Stock tenantId={user.tenantId!} shopName={displayShopName} />;
        case 'returns': return <Returns tenantId={user.tenantId!} shopName={displayShopName} />;
        case 'settings': return <Settings tenantId={user.tenantId!} shopName={displayShopName} />;
        case 'team': return <Team tenantId={user.tenantId!} shopName={displayShopName} />;
        case 'dev_dashboard': return <DevAdmin />;
        case 'dev_tenants': return <DevAdmin />;
        default: return <Dashboard tenantId={user.tenantId!} shopName={displayShopName} />;
    }
  };

  return (
    <div className="flex h-screen bg-[#f1f5f9] text-slate-900 overflow-hidden">
      <div className="no-print">
        <Sidebar 
            user={user} 
            shopName={displayShopName} 
            logoUrl={tenant?.settings.logoUrl || brandedTenant?.settings.logoUrl} 
            activePage={currentPage} 
            onNavigate={setCurrentPage}
            onLogout={() => { setUser(null); setTenant(null); localStorage.removeItem('mw_user'); }}
            isOpen={mobileMenuOpen} onClose={() => setMobileMenuOpen(false)}
        />
      </div>
      <main className="flex-1 overflow-auto relative p-4 no-scrollbar no-print">
         <div className="md:hidden flex items-center justify-between mb-4 px-2 py-3 bg-white rounded-2xl shadow-sm border border-slate-100">
            <button onClick={() => setMobileMenuOpen(true)} className="p-2 bg-slate-50 rounded-xl text-slate-600"><Menu size={18} /></button>
            <span className="font-black text-sm uppercase tracking-tighter">{displayShopName}</span>
            <div className="w-8"></div>
         </div>
         {renderPage()}
      </main>
    </div>
  );
}
