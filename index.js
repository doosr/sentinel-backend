const express = require('express');
const cors = require('cors');
require('dotenv').config();
const crypto = require('crypto');

const app = express();
app.use(cors());
app.use(express.json());

// In-memory store for pending activations
const pendingActivations = {};

const PORT = process.env.PORT || 3001;
const WHOP_API_KEY = process.env.WHOP_API_KEY; 
const WHOP_WEBHOOK_SECRET = process.env.WHOP_WEBHOOK_SECRET; 

// --- Cryptography logic matching the client ---
const SALT = "SENTINEL-ULTIMATE-SECRET-2026";
function generateSentinelKey(hwid, tier) {
    const combined = hwid.trim().toUpperCase() + SALT + tier.toUpperCase();
    const hash = crypto.createHash('sha256').update(combined).digest('hex').toUpperCase();
    return `${hash.slice(0, 4)}-${hash.slice(4, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}`;
}

// --- Routes ---

app.get('/', (req, res) => {
    res.send('Sentinel Whop Backend is RUNNING 🚀');
});

// Webhook for Whop
// URL configurée sur Whop : https://votre-app.com/api/whop-webhook
app.post('/api/whop-webhook', (req, res) => {
    const signature = req.headers['whop-signature'];
    
    if (WHOP_WEBHOOK_SECRET) {
        const hmac = crypto.createHmac('sha256', WHOP_WEBHOOK_SECRET);
        const digest = hmac.update(JSON.stringify(req.body)).digest('hex');
        if (signature !== digest) {
            console.error('Invalid Whop Signature');
            return res.status(401).send('Invalid Signature');
        }
    }

    const event = req.body;
    console.log('Received Whop Event:', event.action);

    if (event.action === 'membership.went_active' || event.action === 'payment.succeeded') {
        const email = event.data.user?.email || event.data.email;
        const hwid = event.data.metadata?.hwid || event.data.custom_fields?.hwid;
        
        let tier = 'pro';
        const planName = event.data.plan?.name?.toLowerCase() || "";
        if (planName.includes('ultimate')) {
            tier = 'ultimate';
        }

        if (hwid) {
            console.log(`Activating ${tier} for HWID: ${hwid} (User: ${email})`);
            pendingActivations[hwid.toUpperCase()] = {
                tier: tier,
                key: generateSentinelKey(hwid, tier),
                timestamp: Date.now()
            };
        }
    }

    res.status(200).send('Webhook Received');
});

// Polling Endpoint
app.get('/api/status/:hwid', (req, res) => {
    const hwid = req.params.hwid.toUpperCase();
    const activation = pendingActivations[hwid];

    if (activation) {
        res.json({
            status: 'paid',
            tier: activation.tier,
            key: activation.key
        });
        setTimeout(() => delete pendingActivations[hwid], 300000);
    } else {
        res.json({ status: 'pending' });
    }
});

app.listen(PORT, () => {
    console.log(`Whop Backend listening on port ${PORT}`);
});
