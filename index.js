const express = require('express');
const cors = require('cors');
require('dotenv').config();
const crypto = require('crypto');

const app = express();
app.use(cors());
app.use(express.json());

// In-memory store for pending activations (in a real app, use a database like SQLite/MongoDB)
// Structure: { [hwid]: { tier: 'pro' | 'ultimate', timestamp: number } }
const pendingActivations = {};

const PORT = process.env.PORT || 3001;
const WHOP_WEBHOOK_SECRET = process.env.WHOP_WEBHOOK_SECRET || 'your_secret_here';

// --- Cryptography logic matching the client ---
const SALT = "SENTINEL-ULTIMATE-SECRET-2026";
function generateSentinelKey(hwid, tier) {
    const combined = hwid.trim().toUpperCase() + SALT + tier.toUpperCase();
    const hash = crypto.createHash('sha256').update(combined).digest('hex').toUpperCase();
    return `${hash.slice(0, 4)}-${hash.slice(4, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}`;
}

// --- Routes ---

// 1. Webhook for Whop
// Endpoint to be configured in Whop Dashboard: https://your-server.com/webhook/whop
app.post('/webhook/whop', (req, res) => {
    // Note: In production, verify the Whop signature header!
    const event = req.body;
    
    console.log('Received Whop Event:', event.action);

    if (event.action === 'membership.went_active' || event.action === 'payment.succeeded') {
        const email = event.data.user?.email;
        // Whop allows passing custom metadata or using 'passthrough' params in the checkout URL.
        // We expect the HWID to be passed as a metadata field 'hwid'
        const hwid = event.data.metadata?.hwid || event.data.custom_fields?.hwid;
        
        let tier = 'pro';
        // Logic to determine tier based on product ID or plan ID
        // Example: if (event.data.plan_id === 'plan_123') tier = 'ultimate';
        if (event.data.plan?.name?.toLowerCase().includes('ultimate')) {
            tier = 'ultimate';
        }

        if (hwid) {
            console.log(`Activating ${tier} for HWID: ${hwid} (User: ${email})`);
            pendingActivations[hwid.toUpperCase()] = {
                tier: tier,
                key: generateSentinelKey(hwid, tier),
                timestamp: Date.now()
            };
        } else {
            console.warn('Payment received but no HWID found in metadata.');
        }
    }

    res.status(200).send('Webhook Received');
});

// 2. Polling Endpoint for the App
app.get('/api/status/:hwid', (req, res) => {
    const hwid = req.params.hwid.toUpperCase();
    const activation = pendingActivations[hwid];

    if (activation) {
        // Return the key and tier, then remove from pending (or keep for a short duration)
        res.json({
            status: 'paid',
            tier: activation.tier,
            key: activation.key
        });
        // Optional: remove after 1 minute to allow for network retries
        setTimeout(() => delete pendingActivations[hwid], 60000);
    } else {
        res.json({ status: 'pending' });
    }
});

app.listen(PORT, () => {
    console.log(`Whop Backend listening on port ${PORT}`);
});
