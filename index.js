const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
require('dotenv').config();

// Initialize Stripe with secret key
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app = express();
const PORT = process.env.PORT || 3001;

// Validate Stripe configuration
if (!process.env.STRIPE_SECRET_KEY) {
  console.error('❌ STRIPE_SECRET_KEY is required in .env file');
  console.error('Please add your Stripe secret key to the .env file');
  process.exit(1);
}

console.log('🔑 Stripe initialized with key:', process.env.STRIPE_SECRET_KEY ? 'Present' : 'Missing');

// Middleware
app.use(cors({
  origin: [
    'http://localhost:5173', 
    'http://localhost:3000', 
    'https://pakbh.com',
    'https://www.pakbh.com',
    'https://delicate-banoffee-384c86.netlify.app'
  ],
  credentials: true
}));

// Raw body parser for webhooks
app.use('/api/webhook', express.raw({type: 'application/json'}));

// JSON parser for other routes
app.use(express.json());

// Email transporter setup - FIXED: createTransporter -> createTransport
const emailTransporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER || 'your-email@gmail.com',
    pass: process.env.EMAIL_PASS || 'your-app-password'
  }
});

// Create Payment Intent for Stripe
app.post('/api/create-payment-intent', async (req, res) => {
  try {
    const { amount, currency = 'usd', customer, items, metadata } = req.body;

    // Validate amount
    if (!amount || amount < 50) { // Minimum 50 cents
      return res.status(400).json({ error: 'Invalid amount' });
    }

    // Create payment intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount),
      currency,
      automatic_payment_methods: {
        enabled: true,
      },
      metadata: {
        ...metadata,
        customer_email: customer?.email || '',
        customer_name: customer?.name || '',
        items_count: items?.length?.toString() || '0'
      },
      receipt_email: customer?.email,
      description: 'Premium Afro Kinky Bulk Hair - PAKBH'
    });

    console.log('✅ Payment Intent created:', paymentIntent.id);

    res.json({
      client_secret: paymentIntent.client_secret,
      payment_intent_id: paymentIntent.id
    });

  } catch (error) {
    console.error('❌ Error creating payment intent:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to create payment intent' 
    });
  }
});

// Process PayPal Payment
app.post('/api/process-paypal-payment', async (req, res) => {
  try {
    const { orderID, payerID, amount, customer, items } = req.body;

    console.log('🟡 Processing PayPal payment:', { orderID, payerID, amount });

    // In a real implementation, you would verify the PayPal payment here
    // For now, we'll simulate successful processing
    
    const paypalPayment = {
      id: orderID,
      status: 'COMPLETED',
      amount: {
        currency_code: 'USD',
        value: amount.toFixed(2)
      },
      payer: {
        payer_id: payerID,
        email_address: customer?.email
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
      error: error.message || 'Failed to process PayPal payment' 
    });
  }
});

// Confirm Payment (webhook alternative for demo)
app.post('/api/confirm-payment', async (req, res) => {
  try {
    const { payment_intent_id } = req.body;

    const paymentIntent = await stripe.paymentIntents.retrieve(payment_intent_id);

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
        status: paymentIntent.status
      });
    }

  } catch (error) {
    console.error('❌ Error confirming payment:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to confirm payment' 
    });
  }
});

// Webhook endpoint for Stripe events
app.post('/api/webhook', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error('❌ Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  switch (event.type) {
    case 'payment_intent.succeeded':
      const paymentIntent = event.data.object;
      console.log('✅ Payment succeeded via webhook:', paymentIntent.id);
      
      // Send confirmation emails
      await sendOrderEmails(paymentIntent);
      break;

    case 'payment_intent.payment_failed':
      const failedPayment = event.data.object;
      console.log('❌ Payment failed via webhook:', failedPayment.id);
      break;

    default:
      console.log(`ℹ️ Unhandled event type ${event.type}`);
  }

  res.json({received: true});
});

// Send order confirmation emails (works for both Stripe and PayPal)
async function sendOrderEmails(paymentData, customer = null, items = null, totalAmount = null) {
  try {
    // Handle both Stripe and PayPal payment objects
    let customerEmail, customerName, amount, paymentId, paymentMethod;
    
    if (paymentData.object === 'payment_intent') {
      // Stripe payment
      customerEmail = paymentData.receipt_email || paymentData.metadata?.customer_email;
      customerName = paymentData.metadata?.customer_name || 'Customer';
      amount = (paymentData.amount / 100).toFixed(2);
      paymentId = paymentData.id;
      paymentMethod = 'Credit Card (Stripe)';
    } else {
      // PayPal payment
      customerEmail = customer?.email || paymentData.payer?.email_address;
      customerName = customer?.name || 'Customer';
      amount = totalAmount?.toFixed(2) || paymentData.amount?.value;
      paymentId = paymentData.id;
      paymentMethod = 'PayPal';
    }

    if (!customerEmail) {
      console.log('⚠️ No customer email found for payment:', paymentId);
      return;
    }

    // Email to business
    const businessEmailOptions = {
      from: process.env.EMAIL_USER,
      to: process.env.BUSINESS_EMAIL || 'anaroyes7@gmail.com',
      subject: `New Order - Payment ${paymentId}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333; border-bottom: 2px solid #8B4513; padding-bottom: 10px;">
            New Order Received
          </h2>
          
          <div style="background: #f9f9f9; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #8B4513; margin-top: 0;">Payment Details</h3>
            <p><strong>Payment ID:</strong> ${paymentId}</p>
            <p><strong>Amount:</strong> $${amount}</p>
            <p><strong>Payment Method:</strong> ${paymentMethod}</p>
            <p><strong>Customer:</strong> ${customerName}</p>
            <p><strong>Email:</strong> ${customerEmail}</p>
            <p><strong>Date:</strong> ${new Date().toLocaleDateString()}</p>
          </div>
          
          <div style="background: #e8f5e8; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 0; color: #2d5a2d;">
              <strong>Action Required:</strong> Please process this order and prepare for shipment.
            </p>
          </div>
        </div>
      `
    };

    // Email to customer
    const customerEmailOptions = {
      from: process.env.EMAIL_USER,
      to: customerEmail,
      subject: `Order Confirmation - Payment ${paymentId}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #8B4513, #A0522D); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
            <h1 style="margin: 0; font-size: 28px;">Thank You for Your Order!</h1>
            <p style="margin: 10px 0 0 0; font-size: 18px;">Payment ID: ${paymentId}</p>
          </div>
          
          <div style="padding: 30px; background: white; border: 1px solid #ddd; border-top: none;">
            <p style="font-size: 16px; color: #333;">
              Hi ${customerName},
            </p>
            <p style="font-size: 16px; color: ' #333;'>
              Thank you for choosing PAKBH! We've received your payment of <strong>$${amount}</strong> via ${paymentMethod} and are preparing your order for shipment.
            </p>
            
            <div style="background: #e8f5e8; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <h4 style="color: #2d5a2d; margin-top: 0;">What's Next?</h4>
              <ul style="color: #2d5a2d; margin: 0; padding-left: 20px;">
                <li>We'll process your order within 24 hours</li>
                <li>You'll receive a tracking number via email</li>
                <li>Free worldwide shipping included</li>
                <li>Expected delivery: 5-7 business days</li>
              </ul>
            </div>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="https://wa.me/+33634549649" style="background: #25D366; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
                Contact us on WhatsApp
              </a>
            </div>
            
            <p style="color: #666; font-size: 14px; text-align: center;">
              Questions? Reply to this email or contact us on WhatsApp for instant support.
            </p>
          </div>
        </div>
      `
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

// Enhanced error handling for all payment methods
const handlePaymentError = (error, paymentMethod = 'unknown') => {
  console.error(`❌ ${paymentMethod} payment error:`, error);
  
  if (error.type === 'StripeCardError') {
    return { error: error.message, code: error.code };
  } else if (error.type === 'StripeRateLimitError') {
    return { error: 'Too many requests made to the API too quickly', code: 'rate_limit' };
  } else if (error.type === 'StripeInvalidRequestError') {
    return { error: 'Invalid parameters were supplied to Stripe API', code: 'invalid_request' };
  } else if (error.type === 'StripeAPIError') {
    return { error: 'An error occurred internally with Stripe API', code: 'api_error' };
  } else if (error.type === 'StripeConnectionError') {
    return { error: 'Network communication with Stripe failed', code: 'connection_error' };
  } else if (error.type === 'StripeAuthenticationError') {
    return { error: 'Authentication with Stripe API failed', code: 'authentication_error' };
  } else {
    return { error: 'An unexpected error occurred', code: 'unknown_error' };
  }
};

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    stripe_connected: !!stripe,
    stripe_key_configured: !!process.env.STRIPE_SECRET_KEY,
    email_configured: !!process.env.EMAIL_USER,
    environment: process.env.NODE_ENV || 'development',
    supported_payment_methods: ['stripe', 'paypal']
  });
});

// Get payment intent details
app.get('/api/payment-intent/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const paymentIntent = await stripe.paymentIntents.retrieve(id);
    
    res.json({
      id: paymentIntent.id,
      status: paymentIntent.status,
      amount: paymentIntent.amount,
      currency: paymentIntent.currency,
      created: paymentIntent.created,
      payment_method: paymentIntent.payment_method
    });

  } catch (error) {
    console.error('❌ Error retrieving payment intent:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to retrieve payment intent' 
    });
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('❌ Server error:', error);
  res.status(500).json({ 
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📧 Email service: ${process.env.EMAIL_USER ? 'Configured' : 'Not configured'}`);
  console.log(`💳 Stripe: ${process.env.STRIPE_SECRET_KEY ? 'Connected' : 'Not configured'}`);
  console.log(`🔗 Webhook endpoint: http://localhost:${PORT}/api/webhook`);
  console.log(`💰 Supported payments: Stripe Cards, PayPal`);
});

module.exports = app;