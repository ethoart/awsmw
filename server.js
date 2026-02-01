
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

const clean = (obj) => {
  if (!obj) return obj;
  const { _id, ...rest } = obj;
  return rest;
};

// --- INVENTORY UTILITY PROTOCOLS ---

async function adjustInventory(db, items, tenantId, type = 'DEDUCT') {
    for (const item of items) {
        const product = await db.collection('products').findOne({ id: item.productId });
        if (!product || !product.batches) continue;

        let needed = item.quantity;
        let batches = [...product.batches];

        if (type === 'DEDUCT') {
            for (let i = 0; i < batches.length; i++) {
                if (needed <= 0) break;
                if (batches[i].quantity > 0) {
                    const take = Math.min(batches[i].quantity, needed);
                    batches[i].quantity -= take;
                    needed -= take;
                }
            }
        } else {
            if (batches.length > 0) {
                batches[batches.length - 1].quantity += needed;
            } else {
                batches.push({
                    id: `restock-${Date.now()}`,
                    quantity: needed,
                    buyingPrice: 0,
                    createdAt: new Date().toISOString()
                });
            }
        }

        await db.collection('products').updateOne(
            { id: item.productId },
            { $set: { batches: batches } }
        );
    }
}

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

// CITIES
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

// USERS
app.get('/api/users', async (req, res) => {
    try {
        const { tenantId } = req.query;
        const db = await connectCentral();
        const users = await db.collection('users').find({ tenantId }).toArray();
        res.json(users.map(clean));
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/users', async (req, res) => {
    try {
        const user = req.body;
        const db = await connectCentral();
        await db.collection('users').updateOne({ id: user.id }, { $set: clean(user) }, { upsert: true });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/users', async (req, res) => {
    try {
        const { id } = req.query;
        const db = await connectCentral();
        await db.collection('users').deleteOne({ id });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ORDERS
app.get('/api/orders', async (req, res) => {
    try {
        const { tenantId, id, page, limit, search, status, productId, startDate, endDate } = req.query;
        const db = await getTenantDb(tenantId);
        const col = db.collection('orders');

        if (id) {
            let order = await col.findOne({ id });
            return res.json(order);
        }

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
        if (productId) query['items.productId'] = productId;
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
        const data = await col.find(query).sort({ createdAt: -1 }).skip((p - 1) * l).limit(l).toArray();

        res.json({ data: data.map(clean), total, page: p, limit: l });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/orders', async (req, res) => {
    try {
        const { tenantId } = req.query;
        const { order, orders } = req.body;
        const db = await getTenantDb(tenantId);
        const col = db.collection('orders');

        if (orders) {
            const ops = orders.map(o => ({ 
                updateOne: { 
                    filter: { id: o.id }, 
                    update: { $set: { ...clean(o), tenantId } }, 
                    upsert: true 
                } 
            }));
            await col.bulkWrite(ops);
            for (const o of orders) {
                if (o.status === 'CONFIRMED' || o.status === 'SHIPPED') {
                    await adjustInventory(db, o.items, tenantId, 'DEDUCT');
                }
            }
        } else if (order) {
            const existing = await col.findOne({ id: order.id });
            const oldStatus = existing?.status;
            const newStatus = order.status;
            const isBecomingConfirmed = ['PENDING', 'OPEN_LEAD', 'NO_ANSWER', 'REJECTED', 'HOLD'].includes(oldStatus) && 
                                       ['CONFIRMED', 'SHIPPED'].includes(newStatus);

            if (isBecomingConfirmed) {
                await adjustInventory(db, order.items, tenantId, 'DEDUCT');
            }
            await col.updateOne({ id: order.id }, { $set: { ...clean(order), tenantId } }, { upsert: true });
        }
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/orders', async (req, res) => {
    try {
        const { tenantId, id, purge } = req.query;
        if (!tenantId) return res.status(400).json({ error: 'Tenant context required.' });
        const db = await getTenantDb(tenantId);
        const col = db.collection('orders');

        if (purge === 'true') {
            const result = await col.deleteMany({ tenantId });
            return res.json({ success: true, count: result.deletedCount });
        }

        if (id) {
            const ids = id.split(',');
            const result = await col.deleteMany({ id: { $in: ids }, tenantId });
            return res.json({ success: true, count: result.deletedCount });
        }

        res.status(400).json({ error: 'No deletion target identified.' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// CUSTOMER HISTORY
app.get('/api/customer-history', async (req, res) => {
    try {
        const { phone, tenantId } = req.query;
        const db = await getTenantDb(tenantId);
        const last8 = phone.slice(-8);
        const count = await db.collection('orders').countDocuments({ customerPhone: { $regex: last8 + "$" } });
        const returns = await db.collection('orders').countDocuments({ 
            customerPhone: { $regex: last8 + "$" }, 
            status: { $in: ['RETURNED', 'REJECTED', 'RETURN_COMPLETED'] } 
        });
        res.json({ count, returns });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/customer-history-detailed', async (req, res) => {
    try {
        const { phone, tenantId } = req.query;
        const db = await getTenantDb(tenantId);
        const last8 = phone.slice(-8);
        const all = await db.collection('orders').find({ customerPhone: { $regex: last8 + "$" } }).sort({ createdAt: -1 }).toArray();
        res.json(all.map(clean));
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/process-return', async (req, res) => {
    try {
        const { trackingOrId, tenantId } = req.body;
        const db = await getTenantDb(tenantId);
        const ordersCol = db.collection('orders');
        const order = await ordersCol.findOne({ $or: [{ id: trackingOrId }, { trackingNumber: trackingOrId }] });
        
        if (order) {
            if (order.status !== 'RETURN_COMPLETED') {
                await adjustInventory(db, order.items, tenantId, 'RESTOCK');
            }
            const updated = { 
                ...order, 
                status: 'RETURN_COMPLETED',
                logs: [...(order.logs || []), { id: `l-${Date.now()}`, message: 'OMS Scan: Return Processed & Stock Restored', timestamp: new Date().toISOString(), user: 'Scanner' }]
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
        const t = await connectCentral();
        const tenantDoc = await t.collection('tenants').findOne({ id: tenantId });
        const tenantSettings = tenantDoc?.settings;
        
        if (!tenantSettings || !tenantSettings.courierApiKey) {
            return res.status(400).json({ error: "Logistics credentials missing." });
        }

        const cleanOrderId = order.id.replace(/\D/g, '').slice(-10); 
        const formData = new URLSearchParams();
        formData.append('api_key', tenantSettings.courierApiKey.trim());
        formData.append('client_id', tenantSettings.courierClientId.trim());
        formData.append('order_id', cleanOrderId);
        formData.append('recipient_name', order.customerName.toString());
        formData.append('recipient_contact_1', order.customerPhone.replace(/\D/g, ''));
        formData.append('recipient_address', order.customerAddress.toString());
        formData.append('recipient_city', (order.customerCity || 'Colombo').toString());
        formData.append('amount', Math.round(order.totalAmount).toString());

        const isExistingMode = tenantSettings.courierMode === 'EXISTING_WAYBILL';
        const targetUrl = isExistingMode 
            ? 'https://www.fdedomestic.com/api/parcel/existing_waybill_api_v1.php'
            : (tenantSettings.courierApiUrl || 'https://www.fdedomestic.com/api/parcel/new_api_v1.php');

        if (isExistingMode) formData.append('waybill_id', (order.trackingNumber || '').toString());

        const response = await fetch(targetUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: formData
        });
        const data = await response.json();

        if (Number(data.status) === 200) {
            const existing = await db.collection('orders').findOne({ id: order.id });
            if (!['CONFIRMED', 'SHIPPED'].includes(existing?.status)) {
                await adjustInventory(db, order.items, tenantId, 'DEDUCT');
            }
            const updatedOrder = { 
                ...order, 
                status: 'SHIPPED', 
                shippedAt: new Date().toISOString(), 
                trackingNumber: data.waybill_no || order.trackingNumber,
                logs: [...(order.logs || []), { id: `l-${Date.now()}`, message: 'OMS Scan: Handshake Successful', timestamp: new Date().toISOString(), user: 'Scanner' }]
            };
            await db.collection('orders').updateOne({ id: order.id }, { $set: clean(updatedOrder) });
            res.json(updatedOrder);
        } else {
            res.status(400).json({ error: data.message || 'Handshake failed' });
        }
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/tenants', async (req, res) => {
    try {
        const db = await connectCentral();
        res.json(await db.collection('tenants').find({}).toArray());
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
