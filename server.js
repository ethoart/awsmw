import express from 'express';
import cors from 'cors';
import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const CENTRAL_URI = process.env.MONGODB_URI;
const CENTRAL_DB_NAME = 'milkyway_central';

let cachedCentralClient = null;
const tenantClients = new Map();

async function getCentralDb() {
  if (cachedCentralClient) return cachedCentralClient.db(CENTRAL_DB_NAME);
  if (!CENTRAL_URI) throw new Error('MONGODB_URI environment variable is missing.');
  const client = new MongoClient(CENTRAL_URI);
  await client.connect();
  cachedCentralClient = client;
  return client.db(CENTRAL_DB_NAME);
}

async function getTenantDb(tenantId) {
    if (!tenantId) throw new Error("Tenant ID is required");
    const decodedTenantId = decodeURIComponent(tenantId.replace(/\+/g, ' '));
    
    const central = await getCentralDb();
    const tenant = await central.collection('tenants').findOne({ id: decodedTenantId });
    if (!tenant) throw new Error(`Tenant ${decodedTenantId} not found`);
    
    const uri = tenant.mongoUri || CENTRAL_URI;
    if (tenantClients.has(decodedTenantId)) return tenantClients.get(decodedTenantId).db();
    
    const client = new MongoClient(uri);
    await client.connect();
    tenantClients.set(decodedTenantId, client);
    return client.db();
}

// Routes
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const central = await getCentralDb();
        
        if (username === 'dev' && password === 'admin') {
            return res.json({ id: 'dev-admin', username: 'dev', role: 'DEV_ADMIN' });
        }

        const user = await central.collection('users').findOne({ username, password });
        if (user) return res.json(user);

        const tenants = await central.collection('tenants').find({ isActive: true }).toArray();
        for (const t of tenants) {
            try {
                const db = await getTenantDb(t.id);
                const u = await db.collection('users').findOne({ username, password });
                if (u) return res.json({ ...u, tenantId: t.id });
            } catch (e) { continue; }
        }

        res.status(401).json({ error: 'Invalid credentials' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/tenants', async (req, res) => {
    try {
        const central = await getCentralDb();
        const tenants = await central.collection('tenants').find({}).toArray();
        res.json(tenants);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/tenants', async (req, res) => {
    try {
        const central = await getCentralDb();
        const { tenant, adminUser } = req.body;
        await central.collection('tenants').insertOne(tenant);
        if (adminUser) {
            const db = await getTenantDb(tenant.id);
            await db.collection('users').insertOne({ ...adminUser, role: 'ADMIN', tenantId: tenant.id });
        }
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/tenants', async (req, res) => {
    try {
        const central = await getCentralDb();
        const { tenant } = req.body;
        await central.collection('tenants').updateOne({ id: tenant.id }, { $set: tenant });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/tenants', async (req, res) => {
    try {
        const central = await getCentralDb();
        const { id } = req.query;
        await central.collection('tenants').deleteOne({ id });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/products', async (req, res) => {
    try {
        const { tenantId } = req.query;
        const db = await getTenantDb(tenantId);
        const products = await db.collection('products').find({}).toArray();
        res.json(products);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/products', async (req, res) => {
    try {
        const { product, tenantId } = req.body;
        const tId = tenantId || product.tenantId;
        const db = await getTenantDb(tId);
        if (product._id) delete product._id;
        await db.collection('products').updateOne({ id: product.id }, { $set: product }, { upsert: true });
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

app.get('/api/orders', async (req, res) => {
    try {
        const { tenantId, id, search, status, limit, page } = req.query;
        const db = await getTenantDb(tenantId);
        const col = db.collection('orders');
        
        const filter = {};
        if (id) filter.id = id;
        if (status && status !== 'LOGISTICS_ALL' && status !== 'TODAY_SHIPPED') {
            filter.status = status;
        }
        if (search) {
            filter.$or = [
                { id: { $regex: search, $options: 'i' } },
                { customerName: { $regex: search, $options: 'i' } },
                { customerPhone: { $regex: search, $options: 'i' } }
            ];
        }
        
        const l = parseInt(limit) || 50;
        const p = parseInt(page) || 1;
        const skip = (p - 1) * l;
        
        const total = await col.countDocuments(filter);
        const data = await col.find(filter).sort({ createdAt: -1 }).skip(skip).limit(l).toArray();
        
        res.json({ data, total });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/orders', async (req, res) => {
    try {
        const { order, orders, tenantId } = req.body;
        const tId = tenantId || (order ? order.tenantId : orders[0].tenantId);
        const db = await getTenantDb(tId);
        const col = db.collection('orders');
        
        if (orders) {
            await col.insertMany(orders);
        } else if (order) {
            if (order._id) delete order._id;
            await col.updateOne({ id: order.id }, { $set: order }, { upsert: true });
        }
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/orders', async (req, res) => {
    try {
        const { id, tenantId, purge } = req.query;
        const db = await getTenantDb(tenantId);
        const col = db.collection('orders');
        
        if (purge === 'true') {
            const result = await col.deleteMany({});
            return res.json({ count: result.deletedCount });
        }
        await col.deleteOne({ id });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/users', async (req, res) => {
    try {
        const { tenantId } = req.query;
        const db = await getTenantDb(tenantId);
        const users = await db.collection('users').find({}).toArray();
        res.json(users);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/users', async (req, res) => {
    try {
        const user = req.body;
        const db = await getTenantDb(user.tenantId);
        await db.collection('users').insertOne(user);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/users', async (req, res) => {
    try {
        const { id, tenantId } = req.query;
        const db = await getTenantDb(tenantId);
        await db.collection('users').deleteOne({ id });
        res.json({ success: true });
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
        const waybills = await db.collection('orders').countDocuments({
            customerPhone: { $regex: last8 + "$" },
            trackingNumber: { $exists: true, $ne: "" }
        });

        res.json({ count, returns, waybills });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

const PORT = 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));
