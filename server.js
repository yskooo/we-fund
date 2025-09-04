const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public')); // Serve static files

// Store recent webhook data in memory (in production, use a database)
let recentWebhooks = [];
const MAX_STORED_WEBHOOKS = 10;

// Helper function to validate WooCommerce webhook structure
function validateWebhookData(data) {
  const requiredFields = ['id', 'status', 'total', 'transaction_id'];
  const missingFields = requiredFields.filter(field => !data[field]);
  
  if (missingFields.length > 0) {
    throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
  }
  
  return true;
}

// Webhook endpoint - receives WooCommerce order data
app.post('/api/webhook/woocommerce', (req, res) => {
  try {
    console.log('📥 Received webhook:', new Date().toISOString());
    console.log('Headers:', req.headers);
    console.log('Body:', JSON.stringify(req.body, null, 2));
    
    const webhookData = req.body;
    
    // Validate webhook data
    validateWebhookData(webhookData);
    
    // Extract key information
    const orderInfo = {
      id: webhookData.id,
      status: webhookData.status,
      total: webhookData.total,
      currency: webhookData.currency || 'USD',
      transaction_id: webhookData.transaction_id,
      payment_method: webhookData.payment_method,
      date_created: webhookData.date_created || new Date().toISOString(),
      customer: webhookData.billing ? {
        name: `${webhookData.billing.first_name} ${webhookData.billing.last_name}`,
        email: webhookData.billing.email,
        country: webhookData.billing.country
      } : null,
      product: webhookData.line_items && webhookData.line_items.length > 0 ? {
        name: webhookData.line_items[0].name,
        quantity: webhookData.line_items[0].quantity,
        product_id: webhookData.line_items[0].product_id
      } : null,
      raw_data: webhookData
    };
    
    // Store webhook data (keep only recent ones)
    recentWebhooks.unshift({
      ...orderInfo,
      received_at: new Date().toISOString(),
      processed_at: new Date().toISOString()
    });
    
    if (recentWebhooks.length > MAX_STORED_WEBHOOKS) {
      recentWebhooks = recentWebhooks.slice(0, MAX_STORED_WEBHOOKS);
    }
    
    console.log('✅ Webhook processed successfully');
    console.log(`📋 Order: #${orderInfo.id} – $${orderInfo.total} – ${orderInfo.status} – ${orderInfo.transaction_id}`);
    
    // Respond to WooCommerce with success
    res.status(200).json({
      success: true,
      message: 'Webhook received and processed',
      order_id: orderInfo.id,
      processed_at: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Webhook processing error:', error.message);
    
    res.status(400).json({
      success: false,
      error: error.message,
      received_at: new Date().toISOString()
    });
  }
});

// API endpoint to get recent webhooks (for frontend display)
app.get('/api/webhooks/recent', (req, res) => {
  res.json({
    success: true,
    count: recentWebhooks.length,
    webhooks: recentWebhooks
  });
});

// API endpoint to get the latest webhook
app.get('/api/webhooks/latest', (req, res) => {
  if (recentWebhooks.length === 0) {
    return res.status(404).json({
      success: false,
      message: 'No webhooks received yet'
    });
  }
  
  res.json({
    success: true,
    webhook: recentWebhooks[0]
  });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'WeFund Webhook API',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// Serve the main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Test endpoint to simulate sending a webhook (for development)
app.post('/api/test/simulate-webhook', async (req, res) => {
  const sampleData = {
    id: Math.floor(Math.random() * 10000),
    status: "processing",
    currency: "USD",
    payment_method: "paytiko_test",
    transaction_id: `txn_${Date.now()}`,
    date_created: new Date().toISOString(),
    total: "297.00",
    line_items: [
      {
        id: 1,
        name: "WeFund 25K Challenge",
        product_id: 101,
        quantity: 1,
        total: "297.00"
      }
    ],
    billing: {
      first_name: "John",
      last_name: "Doe",
      email: "john.doe@email.com",
      country: "PH"
    }
  };
  
  try {
    // Send to our own webhook endpoint
    const fetch = require('node-fetch');
    const response = await fetch(`http://localhost:${PORT}/api/webhook/woocommerce`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(sampleData)
    });
    
    const result = await response.json();
    
    res.json({
      success: true,
      message: 'Test webhook sent',
      sample_data: sampleData,
      webhook_response: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('🚨 Server Error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    timestamp: new Date().toISOString()
  });
});

// Handle 404s
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    path: req.path,
    method: req.method
  });
});

// Start server
app.listen(PORT, () => {
  console.log('🚀 WeFund Webhook API Server running');
  console.log(`📍 Server: http://localhost:${PORT}`);
  console.log(`🔗 Webhook URL: http://localhost:${PORT}/api/webhook/woocommerce`);
  console.log(`🏠 Frontend: http://localhost:${PORT}`);
  console.log(`🧪 Test endpoint: http://localhost:${PORT}/api/test/simulate-webhook`);
  console.log('📊 Recent webhooks: http://localhost:${PORT}/api/webhooks/recent');
  console.log('✅ Ready to receive WooCommerce webhooks!');
});

module.exports = app;