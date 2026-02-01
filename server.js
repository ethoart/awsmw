
import express from 'express';
import cors from 'cors';
import { MongoClient, ServerApiVersion, ObjectId } from 'mongodb';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8080;
const MONGODB_URI = process.env.MONGODB_URI;
const CENTRAL_DB_NAME = 'milkyway_central';

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));

// Global Logging for debugging domain traffic
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} | Host: ${req.get('host')} | ${req.method} ${req.path}`);
    next();
});

let centralClient;
let centralDb;

async function connectCentral() {
    if (!centralClient) {
        if (!MONGODB_URI) throw new Error("MONGODB_URI is missing");
        try {
            centralClient = new MongoClient(MONGODB_URI, {
                serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true },
                connectTimeoutMS: 15000
            });
            await centralClient.connect();
            centralDb = centralClient.db(CENTRAL_DB_NAME);
            console.log(">>> MW-OMS: Master Node Connected.");
        } catch (err) {
            console.error(">>> MW-OMS: Master Node Connection FAILED:", err.message);
            centralClient = null;
            throw err;
        }
    }
    return centralDb;
}

const tenantClients = new Map();

async function getTenantDb(tenantId) {
    const db = await connectCentral();
    const tenantConfig = await db.collection('tenants').findOne({ id: tenantId });
    if (tenantConfig && tenantConfig.mongoUri) {
        if (tenantClients.has(tenantId)) return tenantClients.get(tenantId).db();
        try {
            const tClient = new MongoClient(tenantConfig.mongoUri);
            await tClient.connect();
            tenantClients.set(tenantId, tClient);
            const dbName = new URL(tenantConfig.mongoUri).pathname.slice(1) || `mw_cluster_${tenantId}`;
            return tClient.db(dbName);
        } catch (err) { return db; }
    }
    return db;
}

async function getTenantSettings(tenantId) {
    const db = await connectCentral();
    const t = await db.collection('tenants').findOne({ id: tenantId });
    return t ? t.settings : null;
}

const clean = (obj) => {
  if (!obj) return obj;
  const { _id, ...rest } = obj;
  return rest;
};

// --- INFRASTRUCTURE API ---

app.get('/api/health', (req, res) => res.json({ status: 'connected', timestamp: new Date().toISOString() }));

app.get('/api/cities', async (req, res) => {
    try {
        const db = await connectCentral();
        const cityDoc = await db.collection('global_cities').findOne({ id: 'master_list' });
        res.json({ cities: cityDoc?.cities || [] });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/cities', async (req, res) => {
    try {
        const db = await connectCentral();
        const { cities } = req.body;
        await db.collection('global_cities').updateOne({ id: 'master_list' }, { $set: { cities } }, { upsert: true });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// CLOUDFLARE DNS SYNC PROTOCOL
app.post('/api/sync-infrastructure', async (req, res) => {
    try {
        const { tenantId, domain, token, masterNode } = req.body;
        if (!domain || !token) throw new Error("Missing Domain or Cloudflare Token.");

        const cleanDomain = domain.toLowerCase().trim().replace(/^https?:\/\//, '').split('/')[0];
        const domainParts = cleanDomain.split('.');
        const rootDomain = domainParts.length > 2 ? domainParts.slice(-2).join('.') : cleanDomain;

        const zoneRes = await fetch(`https://api.cloudflare.com/client/v4/zones?name=${rootDomain}`, {
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
        });
        const zoneData = await zoneRes.json();

        if (!zoneData.success || zoneData.result.length === 0) {
            throw new Error(`Cloudflare Zone Not Found for ${rootDomain}`);
        }

        const zoneId = zoneData.result[0].id;
        const target = masterNode?.trim() || req.get('host').split(':')[0];
        const isIP = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(target);
        const recordType = isIP ? 'A' : 'CNAME';

        const dnsRecordsRes = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records?name=${cleanDomain}`, {
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
        });
        const dnsData = await dnsRecordsRes.json();
        const existingRecord = dnsData.result.find(r => r.name === cleanDomain);

        const payload = { type: recordType, name: cleanDomain, content: target, ttl: 1, proxied: true };

        if (existingRecord) {
            await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records/${existingRecord.id}`, {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
        } else {
            await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
        }

        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// --- CORE BUSINESS API ---

app.post('/api/login', async (req, res) => {
    try {
        const db = await connectCentral();
        const { username, password } = req.body;
        const user = await db.collection('users').findOne({ username, password });
        if (user) res.json(clean(user));
        else res.status(401).json({ error: 'Identity failure' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/orders', async (req, res) => {
    try {
        const { tenantId, id, page, limit, search, status, productId, startDate, endDate } = req.query;
        const db = await getTenantDb(tenantId);
        const col = db.collection('orders');

        if (id) {
            let order = await col.findOne({ id });
            return res.json(order);
        }

        // Build Query
        const query = { tenantId };

        if (status && status !== 'ALL') {
            if (status === 'TODAY_SHIPPED') {
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                query.shippedAt = { $gte: today.toISOString() };
            } else {
                query.status = status;
            }
        }

        if (productId) {
            query['items.productId'] = productId;
        }

        if (startDate || endDate) {
            query.createdAt = {};
            if (startDate) query.createdAt.$gte = startDate;
            if (endDate) query.createdAt.$lte = endDate + 'T23:59:59';
        }

        if (search) {
            query.$or = [
                { id: { $regex: search, $options: 'i' } },
                { customerName: { $regex: search, $options: 'i' } },
                { customerPhone: { $regex: search, $options: 'i' } },
                { trackingNumber: { $regex: search, $options: 'i' } }
            ];
        }

        const p = parseInt(page) || 1;
        const l = parseInt(limit) || 50;

        const total = await col.countDocuments(query);
        const data = await col.find(query)
            .sort({ createdAt: -1 })
            .skip((p - 1) * l)
            .limit(l)
            .toArray();

        res.json({ 
            data: data.map(clean), 
            total, 
            page: p, 
            limit: l 
        });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/orders', async (req, res) => {
    try {
        const { tenantId } = req.query;
        const { order, orders } = req.body;
        const db = await getTenantDb(tenantId);
        const col = db.collection('orders');
        if (orders) {
            const ops = orders.map(o => ({ updateOne: { filter: { id: o.id }, update: { $set: { ...clean(o), tenantId } }, upsert: true } }));
            await col.bulkWrite(ops);
        } else if (order) {
            await col.updateOne({ id: order.id }, { $set: { ...clean(order), tenantId } }, { upsert: true });
        }
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/orders', async (req, res) => {
    try {
        const { tenantId, id, purge } = req.query;
        const db = await getTenantDb(tenantId);
        const col = db.collection('orders');
        
        if (purge === 'true') {
            const result = await col.deleteMany({ tenantId });
            return res.json({ success: true, count: result.deletedCount });
        }
        
        await col.deleteOne({ id });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/customer-history', async (req, res) => {
    try {
        const { phone, tenantId } = req.query;
        if (!phone) return res.json({ count: 0, returns: 0, rejections: 0 });
        const db = await getTenantDb(tenantId);
        const last8 = phone.slice(-8);
        const all = await db.collection('orders').find({ customerPhone: { $regex: last8 + "$" } }).toArray();
        res.json({ 
            count: all.length, 
            returns: all.filter(o => o.status.includes('RETURN')).length, 
            rejections: all.filter(o => o.status === 'REJECTED').length 
        });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/customer-history-detailed', async (req, res) => {
    try {
        const { phone, tenantId } = req.query;
        if (!phone) return res.json([]);
        const db = await getTenantDb(tenantId);
        const last8 = phone.slice(-8);
        const all = await db.collection('orders').find({ customerPhone: { $regex: last8 + "$" } }).sort({ createdAt: -1 }).toArray();
        res.json(all);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/process-return', async (req, res) => {
    try {
        const { trackingOrId, tenantId } = req.body;
        const db = await getTenantDb(tenantId);
        const ordersCol = db.collection('orders');
        const order = await ordersCol.findOne({ $or: [{ id: trackingOrId }, { trackingNumber: trackingOrId }] });
        if (order) {
            const updated = { 
                ...order, 
                status: 'RETURN_COMPLETED',
                logs: [...(order.logs || []), { id: `l-${Date.now()}`, message: 'OMS Scan: Return Processed', timestamp: new Date().toISOString(), user: 'Scanner' }]
            };
            await ordersCol.updateOne({ id: order.id }, { $set: clean(updated) });
            return res.json(updated);
        }
        res.status(404).json({ error: 'Order reference not found' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/ship-order', async (req, res) => {
    try {
        const { order, tenantId } = req.body;
        const db = await getTenantDb(tenantId);
        const tenantSettings = await getTenantSettings(tenantId);
        
        if (!tenantSettings || !tenantSettings.courierApiKey || !tenantSettings.courierClientId) {
            return res.status(400).json({ error: "Logistics credentials missing in settings." });
        }

        const cleanOrderId = order.id.replace(/\D/g, '').slice(-10); 
        const cleanPhone = order.customerPhone.replace(/\D/g, '');
        const cleanPhone2 = (order.customerPhone2 || '').replace(/\D/g, '');
        const cleanAmount = Math.round(order.totalAmount).toString();

        const formData = new URLSearchParams();
        formData.append('api_key', tenantSettings.courierApiKey.trim());
        formData.append('client_id', tenantSettings.courierClientId.trim());
        formData.append('order_id', cleanOrderId);
        formData.append('parcel_weight', (order.parcelWeight || '1').toString());
        formData.append('parcel_description', (order.parcelDescription || 'Online Order').substring(0, 50));
        formData.append('recipient_name', order.customerName.toString());
        formData.append('recipient_contact_1', cleanPhone);
        formData.append('recipient_contact_2', cleanPhone2);
        formData.append('recipient_address', order.customerAddress.toString().substring(0, 200));
        formData.append('recipient_city', (order.customerCity || 'Colombo').toString());
        formData.append('amount', cleanAmount);
        formData.append('exchange', '0');

        const isExistingMode = tenantSettings.courierMode === 'EXISTING_WAYBILL';
        const targetUrl = isExistingMode 
            ? 'https://www.fdedomestic.com/api/parcel/existing_waybill_api_v1.php'
            : (tenantSettings.courierApiUrl || 'https://www.fdedomestic.com/api/parcel/new_api_v1.php');

        if (isExistingMode) {
            formData.append('waybill_id', (order.trackingNumber || '').toString());
        }

        let finalWaybill = order.trackingNumber;
        const response = await fetch(targetUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: formData
        });
        const rawText = await response.text();
        let data;
        try { data = JSON.parse(rawText); } catch(e) { throw new Error(`Gateway Error: ${rawText.slice(0, 50)}`); }

        if (Number(data.status) === 200) {
            finalWaybill = data.waybill_no;
            const updatedOrder = { 
                ...order, 
                status: 'SHIPPED', 
                shippedAt: new Date().toISOString(), 
                trackingNumber: finalWaybill,
                logs: [...(order.logs || []), { id: `l-${Date.now()}`, message: 'OMS Scan: Handshake Successful', timestamp: new Date().toISOString(), user: 'Scanner' }]
            };
            await db.collection('orders').updateOne({ id: order.id }, { $set: clean(updatedOrder) });
            res.json(updatedOrder);
        } else {
            res.status(400).json({ error: `Courier Error ${data.status}: ${data.message || 'Handshake failed'}` });
        }
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/tenants', async (req, res) => {
    try {
        const db = await connectCentral();
        res.json(await db.collection('tenants').find({}).toArray());
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/tenants', async (req, res) => {
    try {
        const db = await connectCentral();
        const { tenant, adminUser } = req.body;
        await db.collection('tenants').updateOne({ id: tenant.id }, { $set: clean(tenant) }, { upsert: true });
        if (adminUser) await db.collection('users').updateOne({ tenantId: tenant.id, role: 'SUPER_ADMIN' }, { $set: clean(adminUser) }, { upsert: true });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/tenants', async (req, res) => {
    try {
        const db = await connectCentral();
        const { tenant, adminUser } = req.body;
        await db.collection('tenants').updateOne({ id: tenant.id }, { $set: clean(tenant) }, { upsert: true });
        if (adminUser) await db.collection('users').updateOne({ tenantId: tenant.id, role: 'SUPER_ADMIN' }, { $set: clean(adminUser) }, { upsert: true });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/tenants', async (req, res) => {
    try {
        const { id } = req.query;
        const db = await connectCentral();
        await db.collection('tenants').deleteOne({ id });
        // Also cleanup associated users for this tenant
        await db.collection('users').deleteMany({ tenantId: id });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/products', async (req, res) => {
    try {
        const { tenantId } = req.query;
        const db = await getTenantDb(tenantId);
        res.json(await db.collection('products').find({ tenantId }).toArray());
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/products', async (req, res) => {
    try {
        const { tenantId } = req.query;
        const { product } = req.body;
        const db = await getTenantDb(tenantId);
        await db.collection('products').updateOne({ id: product.id }, { $set: { ...clean(product), tenantId } }, { upsert: true });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/products', async (req, res) => {
    try {
        const { id, tenantId } = req.query;
        const db = await getTenantDb(tenantId);
        await db.collection('products').deleteOne({ id });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/users', async (req, res) => {
    try {
        const { tenantId } = req.query;
        const db = await connectCentral();
        res.json(await db.collection('users').find({ tenantId }).toArray());
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/users', async (req, res) => {
    try {
        const db = await connectCentral();
        await db.collection('users').updateOne({ id: req.body.id }, { $set: req.body }, { upsert: true });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/users', async (req, res) => {
    try {
        const db = await connectCentral();
        await db.collection('users').deleteOne({ id: req.query.id });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

const distPath = path.join(__dirname, 'dist');
app.use(express.static(distPath));
app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'API route not matched.' });
    res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(PORT, async () => {
    console.log(`>>> MW-OMS Active on Port ${PORT}`);
    try { await connectCentral(); } catch (e) {}
});
