const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const stripe = require('stripe');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Validate environment variables
const requiredEnvVars = ['STRIPE_SECRET_KEY', 'EMAIL_USER', 'EMAIL_PASS', 'BUSINESS_EMAIL'];
const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingEnvVars.length > 0) {
  console.error('❌ Missing required environment variables:', missingEnvVars.join(', '));
  console.error('Please add them to your .env file');
  process.exit(1);
}

// Initialize Stripe with secret key
const stripeClient = stripe(process.env.STRIPE_SECRET_KEY);

console.log('🔑 Stripe initialized successfully');
console.log('📧 Email service configured');

// CORS configuration
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  'https://pakbh.com',
  'https://www.pakbh.com',
  'https://delicate-banoffee-384c86.netlify.app',
  'https://blenhairs.netlify.app',
  'https://serveforpakbh.onrender.com'
];

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) === -1) {
      const msg = `The CORS policy for this site does not allow access from the specified Origin: ${origin}`;
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  },
  credentials: true
}));

// Raw body parser for webhooks
app.use('/api/webhook', express.raw({ type: 'application/json' }));

// JSON parser for other routes
app.use(express.json({ limit: '10mb' }));

// Email transporter setup
const emailTransporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// Verify email configuration
emailTransporter.verify((error) => {
  if (error) {
    console.error('❌ Email transporter verification failed:', error);
  } else {
    console.log('✅ Email transporter is ready to send messages');
  }
});

// Utility functions
const formatCurrency = (amount, currency = 'USD') => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
  }).format(amount / 100); // Convert cents to dollars
};

const validatePaymentData = (data) => {
  const errors = [];

  if (!data.amount || data.amount < 50) {
    errors.push('Invalid amount (minimum $0.50)');
  }

  if (!data.currency || !['usd', 'eur', 'gbp'].includes(data.currency.toLowerCase())) {
    errors.push('Invalid currency');
  }

  if (!data.customer || !data.customer.email) {
    errors.push('Customer email is required');
  }

  if (!data.items || !Array.isArray(data.items) || data.items.length === 0) {
    errors.push('At least one item is required');
  }

  return errors;
};

// Create Payment Intent for Stripe
app.post('/api/create-payment-intent', async (req, res) => {
  try {
    const { amount, currency = 'usd', customer, items, metadata, shipping } = req.body;

    // Validate input
    const validationErrors = validatePaymentData(req.body);
    if (validationErrors.length > 0) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: validationErrors 
      });
    }

    // Create payment intent with automatic payment methods
    const paymentIntent = await stripeClient.paymentIntents.create({
      amount: Math.round(amount),
      currency: currency.toLowerCase(),
      automatic_payment_methods: {
        enabled: true,
      },
      metadata: {
        ...metadata,
        customer_email: customer?.email || '',
        customer_name: customer?.name || '',
        items_count: items?.length?.toString() || '0',
        order_id: metadata?.order_id || `order_${Date.now()}`
      },
      receipt_email: customer?.email,
      description: 'Premium Afro Kinky Bulk Hair - Blen Hairs USA',
      shipping: shipping ? {
        name: shipping.name,
        address: {
          line1: shipping.address.line1,
          city: shipping.address.city,
          state: shipping.address.state,
          postal_code: shipping.address.postal_code,
          country: shipping.address.country || 'US'
        }
      } : undefined
    });

    console.log('✅ Payment Intent created:', paymentIntent.id);

    res.json({
      success: true,
      client_secret: paymentIntent.client_secret,
      payment_intent_id: paymentIntent.id,
      amount: paymentIntent.amount,
      currency: paymentIntent.currency
    });

  } catch (error) {
    console.error('❌ Error creating payment intent:', error);
    
    const errorResponse = handlePaymentError(error, 'stripe');
    res.status(errorResponse.status || 500).json({ 
      success: false,
      error: errorResponse.message,
      code: errorResponse.code
    });
  }
});

// Create Checkout Session for Stripe Checkout
app.post('/api/create-checkout-session', async (req, res) => {
  try {
    const { lineItems, customerEmail, successUrl, cancelUrl, metadata } = req.body;

    const session = await stripeClient.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: 'payment',
      success_url: successUrl,
      cancel_url: cancelUrl,
      customer_email: customerEmail,
      billing_address_collection: 'required',
      shipping_address_collection: {
        allowed_countries: ['US', 'CA', 'GB', 'FR', 'DE']
      },
      metadata: metadata || {},
      shipping_options: [
        {
          shipping_rate_data: {
            type: 'fixed_amount',
            fixed_amount: {
              amount: 0,
              currency: 'usd'
            },
            display_name: 'Free shipping',
            delivery_estimate: {
              minimum: {
                unit: 'business_day',
                value: 5
              },
              maximum: {
                unit: 'business_day',
                value: 7
              }
            }
          }
        }
      ]
    });

    res.json({
      success: true,
      sessionId: session.id,
      url: session.url
    });

  } catch (error) {
    console.error('❌ Error creating checkout session:', error);
    
    const errorResponse = handlePaymentError(error, 'stripe');
    res.status(errorResponse.status || 500).json({ 
      success: false,
      error: errorResponse.message,
      code: errorResponse.code
    });
  }
});

// Process PayPal Payment (Simulation)
app.post('/api/process-paypal-payment', async (req, res) => {
  try {
    const { orderID, amount, customer, items } = req.body;

    if (!orderID || !amount || !customer) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields'
      });
    }

    console.log('🟡 Processing PayPal payment simulation:', { orderID, amount: formatCurrency(amount, 'USD') });

    // Simulate PayPal payment processing
    const paypalPayment = {
      id: orderID,
      status: 'COMPLETED',
      amount: {
        currency_code: 'USD',
        value: (amount / 100).toFixed(2)
      },
      payer: {
        payer_id: `P${Date.now()}`,
        email_address: customer.email,
        name: {
          given_name: customer.name.split(' ')[0],
          surname: customer.name.split(' ').slice(1).join(' ')
        }
      },
      create_time: new Date().toISOString(),
      payment_method: 'PayPal'
    };

    // Send confirmation emails
    await sendOrderEmails(paypalPayment, customer, items, amount);

    console.log('✅ PayPal payment processed successfully');

    res.json({
      success: true,
      payment: paypalPayment
    });

  } catch (error) {
    console.error('❌ Error processing PayPal payment:', error);
    res.status(500).json({ 
      success: false,
      error: error.message || 'Failed to process PayPal payment'
    });
  }
});

// Confirm Payment
app.post('/api/confirm-payment', async (req, res) => {
  try {
    const { payment_intent_id } = req.body;

    if (!payment_intent_id) {
      return res.status(400).json({
        success: false,
        error: 'Payment intent ID is required'
      });
    }

    const paymentIntent = await stripeClient.paymentIntents.retrieve(payment_intent_id);

    if (paymentIntent.status === 'succeeded') {
      // Send confirmation emails
      await sendOrderEmails(paymentIntent);
      
      console.log('✅ Payment confirmed and emails sent');
      
      res.json({
        success: true,
        payment_intent: paymentIntent
      });
    } else {
      res.json({
        success: false,
        status: paymentIntent.status,
        message: `Payment status: ${paymentIntent.status}`
      });
    }

  } catch (error) {
    console.error('❌ Error confirming payment:', error);
    res.status(500).json({ 
      success: false,
      error: error.message || 'Failed to confirm payment'
    });
  }
});

// Webhook endpoint for Stripe events
app.post('/api/webhook', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error('❌ STRIPE_WEBHOOK_SECRET is not configured');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  let event;

  try {
    event = stripeClient.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error('❌ Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    // Handle the event
    switch (event.type) {
      case 'payment_intent.succeeded':
        const paymentIntent = event.data.object;
        console.log('✅ Payment succeeded via webhook:', paymentIntent.id);
        
        await sendOrderEmails(paymentIntent);
        break;

      case 'payment_intent.payment_failed':
        const failedPayment = event.data.object;
        console.log('❌ Payment failed via webhook:', failedPayment.id);
        break;

      case 'checkout.session.completed':
        const session = event.data.object;
        console.log('✅ Checkout session completed:', session.id);
        break;

      default:
        console.log(`ℹ️ Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (error) {
    console.error('❌ Error handling webhook event:', error);
    res.status(500).json({ error: 'Failed to process webhook event' });
  }
});

// Send order confirmation emails
async function sendOrderEmails(paymentData, customer = null, items = null, totalAmount = null) {
  try {
    let customerEmail, customerName, amount, paymentId, paymentMethod;
    
    if (paymentData.object === 'payment_intent') {
      // Stripe payment
      customerEmail = paymentData.receipt_email || paymentData.metadata?.customer_email;
      customerName = paymentData.metadata?.customer_name || 'Customer';
      amount = formatCurrency(paymentData.amount, paymentData.currency);
      paymentId = paymentData.id;
      paymentMethod = 'Credit/Debit Card';
    } else {
      // PayPal payment
      customerEmail = customer?.email || paymentData.payer?.email_address;
      customerName = customer?.name || 'Customer';
      amount = formatCurrency(totalAmount, 'USD');
      paymentId = paymentData.id;
      paymentMethod = 'PayPal';
    }

    if (!customerEmail) {
      console.log('⚠️ No customer email found for payment:', paymentId);
      return;
    }

    // Email to business
    const businessEmailOptions = {
      from: `"PAKBH Orders" <${process.env.EMAIL_USER}>`,
      to: process.env.BUSINESS_EMAIL,
      subject: `📦 New Order #${paymentId.slice(-8)}`,
      html: generateBusinessEmailTemplate(paymentId, amount, paymentMethod, customerName, customerEmail)
    };

    // Email to customer
    const customerEmailOptions = {
      from: `"PAKBH Support" <${process.env.EMAIL_USER}>`,
      to: customerEmail,
      subject: `✅ Order Confirmation #${paymentId.slice(-8)}`,
      html: generateCustomerEmailTemplate(paymentId, amount, paymentMethod, customerName)
    };

    // Send emails
    await Promise.all([
      emailTransporter.sendMail(businessEmailOptions),
      emailTransporter.sendMail(customerEmailOptions)
    ]);

    console.log('✅ Order confirmation emails sent successfully');

  } catch (error) {
    console.error('❌ Error sending order emails:', error);
  }
}

// Email template generators
function generateBusinessEmailTemplate(paymentId, amount, paymentMethod, customerName, customerEmail) {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #333; border-bottom: 2px solid #8B4513; padding-bottom: 10px;">
        New Order Received
      </h2>
      
      <div style="background: #f9f9f9; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <h3 style="color: #8B4513; margin-top: 0;">Order Details</h3>
        <p><strong>Order ID:</strong> ${paymentId}</p>
        <p><strong>Amount:</strong> ${amount}</p>
        <p><strong>Payment Method:</strong> ${paymentMethod}</p>
        <p><strong>Customer:</strong> ${customerName}</p>
        <p><strong>Email:</strong> ${customerEmail}</p>
        <p><strong>Date:</strong> ${new Date().toLocaleDateString()}</p>
      </div>
    </div>
  `;
}

function generateCustomerEmailTemplate(paymentId, amount, paymentMethod, customerName) {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #8B4513, #A0522D); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
        <h1 style="margin: 0; font-size: 28px;">Thank You for Your Order!</h1>
        <p style="margin: 10px 0 0 0; font-size: 16px;">Order #${paymentId.slice(-8)}</p>
      </div>
      
      <div style="padding: 30px; background: white; border: 1px solid #ddd; border-top: none;">
        <p style="font-size: 16px; color: #333;">
          Hi ${customerName},
        </p>
        <p style="font-size: 16px; color: #333;">
          Thank you for choosing PAKBH! We've received your payment of <strong>${amount}</strong> via ${paymentMethod} and are preparing your order for shipment.
        </p>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="https://wa.me/+33634549649" style="background: #25D366; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
            Contact us on WhatsApp
          </a>
        </div>
      </div>
    </div>
  `;
}

// Enhanced error handling
function handlePaymentError(error, paymentMethod = 'unknown') {
  console.error(`❌ ${paymentMethod} payment error:`, error);
  
  if (error.type === 'StripeCardError') {
    return { 
      message: error.message, 
      code: error.code,
      status: 400
    };
  } else if (error.type === 'StripeInvalidRequestError') {
    return { 
      message: 'Invalid payment request', 
      code: 'invalid_request',
      status: 400
    };
  } else if (error.type === 'StripeAuthenticationError') {
    return { 
      message: 'Payment authentication failed', 
      code: 'authentication_error',
      status: 401
    };
  } else if (error.type === 'StripeRateLimitError') {
    return { 
      message: 'Too many requests, please try again later', 
      code: 'rate_limit',
      status: 429
    };
  } else if (error.type === 'StripeConnectionError') {
    return { 
      message: 'Network connection failed', 
      code: 'connection_error',
      status: 503
    };
  } else {
    return { 
      message: 'An unexpected error occurred', 
      code: 'unknown_error',
      status: 500
    };
  }
}

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    service: 'PAKBH Payment API',
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    stripe_connected: !!stripeClient,
    email_configured: !!process.env.EMAIL_USER,
    supported_payment_methods: ['stripe', 'paypal'],
    uptime: process.uptime()
  });
});

// Get payment intent details
app.get('/api/payment-intent/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const paymentIntent = await stripeClient.paymentIntents.retrieve(id);
    
    res.json({
      success: true,
      payment_intent: {
        id: paymentIntent.id,
        status: paymentIntent.status,
        amount: paymentIntent.amount,
        currency: paymentIntent.currency,
        created: new Date(paymentIntent.created * 1000).toISOString(),
        payment_method: paymentIntent.payment_method,
        customer: paymentIntent.customer
      }
    });

  } catch (error) {
    console.error('❌ Error retrieving payment intent:', error);
    res.status(500).json({ 
      success: false,
      error: error.message || 'Failed to retrieve payment intent'
    });
  }
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    path: req.originalUrl
  });
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('❌ Server error:', error);
  res.status(500).json({ 
    success: false,
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 PAKBH Server running on port ${PORT}`);
  console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`💳 Stripe: Connected ✅`);
  console.log(`📧 Email: ${process.env.EMAIL_USER ? 'Configured ✅' : 'Not configured ❌'}`);
  console.log(`🔗 Health check: http://localhost:${PORT}/api/health`);
  console.log(`💰 Supported: Credit Cards, PayPal`);
});

module.exports = app;