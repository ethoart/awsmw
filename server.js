
import express from 'express';
import cors from 'cors';
import { MongoClient, ServerApiVersion } from 'mongodb';
import dotenv from 'dotenv';
import path from 'path';
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
            console.log(">>> MW-OMS Master Node Active.");
        } catch (err) {
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
            return tClient.db();
        } catch (err) { return db; }
    }
    return db;
}

const FDE_ERRORS = {
  201: "Inactive Client",
  202: "Invalid Order ID (Numeric Required)",
  203: "Invalid Weight",
  204: "Invalid Parcel Description",
  205: "Invalid Name",
  206: "Contact Number 1 Invalid",
  207: "Contact Number 2 Invalid",
  208: "Invalid Address",
  209: "Invalid City Name",
  210: "Insert Failed",
  211: "Invalid API Key",
  212: "Invalid or Inactive Client",
  213: "Invalid Exchange Value",
  214: "Maintenance Mode"
};

const clean = (obj) => {
  if (!obj) return obj;
  const { _id, ...rest } = obj;
  return rest;
};

app.get('/api/health', (req, res) => res.json({ status: 'connected' }));

app.post('/api/login', async (req, res) => {
    try {
        const db = await connectCentral();
        const { username, password } = req.body;
        const user = await db.collection('users').findOne({ username, password });
        if (user) res.json(clean(user));
        else res.status(401).json({ error: 'Identity failure' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

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

app.get('/api/orders', async (req, res) => {
    try {
        const { tenantId, id, page, limit, search, status, productId, startDate, endDate } = req.query;
        const db = await getTenantDb(tenantId);
        const col = db.collection('orders');

        if (id) {
            let order = await col.findOne({ id });
            return res.json(clean(order));
        }

        const query = { tenantId };
        
        // Advanced status filtering
        if (status && status !== 'ALL') {
            if (status === 'TODAY_SHIPPED') {
                const dateToMatch = startDate || new Date().toISOString().split('T')[0];
                query.shippedAt = { $regex: `^${dateToMatch}` };
            } else {
                query.status = status;
            }
        }

        if (productId) query['items.productId'] = productId;
        
        if (!query.shippedAt && (startDate || endDate)) {
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
        } else if (order) {
            await col.updateOne({ id: order.id }, { $set: { ...clean(order), tenantId } }, { upsert: true });
        }
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/orders', async (req, res) => {
    try {
        const { tenantId, id, purge } = req.query;
        if (!tenantId) return res.status(400).json({ error: 'Context Required' });
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
        res.status(400).json({ error: 'Missing Target' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

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
            const updated = { ...order, status: 'RETURN_COMPLETED' };
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
        const central = await connectCentral();
        const tenantDoc = await central.collection('tenants').findOne({ id: tenantId });
        const settings = tenantDoc?.settings;
        
        if (!settings || !settings.courierApiKey) return res.status(400).json({ error: "Keys Missing" });

        const fdeOrderId = order.id.replace(/\D/g, '').slice(-10) || Math.floor(Math.random() * 1000000000).toString();

        const formData = new URLSearchParams();
        formData.append('api_key', settings.courierApiKey.trim());
        formData.append('client_id', settings.courierClientId.trim());
        formData.append('order_id', fdeOrderId);
        formData.append('parcel_weight', order.parcelWeight || '1');
        formData.append('parcel_description', (order.parcelDescription || order.items[0]?.name || 'Standard Shipment').toString().slice(0, 50));
        formData.append('recipient_name', order.customerName.toString());
        formData.append('recipient_contact_1', order.customerPhone.replace(/\D/g, ''));
        
        const phone2 = (order.customerPhone2 || '').replace(/\D/g, '');
        if (phone2) formData.append('recipient_contact_2', phone2);

        formData.append('recipient_address', order.customerAddress.toString());
        formData.append('recipient_city', (order.customerCity || 'Colombo').toString());
        formData.append('amount', Math.round(order.totalAmount).toString());
        formData.append('exchange', '0');

        const targetUrl = settings.courierMode === 'EXISTING_WAYBILL' 
            ? 'https://www.fdedomestic.com/api/parcel/existing_waybill_api_v1.php'
            : 'https://www.fdedomestic.com/api/parcel/new_api_v1.php';

        if (settings.courierMode === 'EXISTING_WAYBILL') {
            formData.append('waybill_id', (order.trackingNumber || '').toString());
        }

        const response = await fetch(targetUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: formData
        });
        
        const rawText = await response.text();
        let data;
        try {
            data = JSON.parse(rawText);
        } catch (err) {
            return res.status(400).json({ error: `FDE Text: ${rawText.slice(0, 150)}` });
        }

        const status = Number(data.status);
        if (status === 200) {
            const updated = { 
                ...order, 
                status: 'SHIPPED', 
                trackingNumber: data.waybill_no || order.trackingNumber, 
                shippedAt: new Date().toISOString(),
                logs: [...(order.logs || []), { id: `l-${Date.now()}`, message: 'FDE Handshake: Success', timestamp: new Date().toISOString(), user: 'OMS Connector' }]
            };
            await db.collection('orders').updateOne({ id: order.id }, { $set: clean(updated) });
            res.json(updated);
        } else {
            res.status(400).json({ error: FDE_ERRORS[status] || `FDE Status ${status}` });
        }
    } catch (e) { res.status(500).json({ error: `System Handshake Failure: ${e.message}` }); }
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

app.delete('/api/products', async (req, res) => {
    try {
        const { id, tenantId } = req.query;
        const db = await getTenantDb(tenantId);
        await db.collection('products').deleteOne({ id, tenantId });
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
    console.log(`>>> MW-OMS Local Node Port ${PORT}`);
    try { await connectCentral(); } catch (e) {}
});
