# Blen Hairs Payment Server

This is the backend server for handling Stripe payments and order processing for the Blen Hairs e-commerce application.

## Features

- ✅ Stripe Payment Intent creation
- ✅ Secure payment processing
- ✅ Webhook handling for payment events
- ✅ Order confirmation emails
- ✅ CORS configuration for frontend integration
- ✅ Error handling and logging

## Setup Instructions

### 1. Install Dependencies

```bash
cd server
npm install
```

### 2. Environment Configuration

Copy the example environment file and configure your settings:

```bash
cp .env.example .env
```

Edit `.env` with your client's Stripe keys:

```env
# Stripe Configuration - Client's Account
STRIPE_SECRET_KEY=sk_test_your_client_secret_key_here
STRIPE_WEBHOOK_SECRET=whsec_your_actual_webhook_secret

# Email Configuration
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password

# Server Configuration
PORT=3001
NODE_ENV=development

# Business Email
BUSINESS_EMAIL=anaroyes7@gmail.com
```

### 3. Email Setup (Gmail Example)

1. Enable 2-factor authentication on your Gmail account
2. Generate an App Password:
   - Go to Google Account settings
   - Security → 2-Step Verification → App passwords
   - Generate a password for "Mail"
   - Use this password in `EMAIL_PASS`

### 4. Stripe Webhook Setup

1. Go to your Stripe Dashboard
2. Navigate to Developers → Webhooks
3. Create a new webhook endpoint: `http://localhost:3001/api/webhook`
4. Select events: `payment_intent.succeeded`, `payment_intent.payment_failed`
5. Copy the webhook secret to your `.env` file

### 5. Start the Server

Development mode with auto-reload:
```bash
npm run dev
```

Production mode:
```bash
npm start
```

## API Endpoints

### POST `/api/create-payment-intent`
Creates a new Stripe Payment Intent

**Request Body:**
```json
{
  "amount": 4500,
  "currency": "usd",
  "customer": {
    "email": "customer@example.com",
    "name": "John Doe"
  },
  "items": [...],
  "metadata": {...}
}
```

**Response:**
```json
{
  "client_secret": "pi_xxx_secret_xxx",
  "payment_intent_id": "pi_xxx"
}
```

### POST `/api/webhook`
Handles Stripe webhook events

### GET `/api/health`
Health check endpoint

### GET `/api/payment-intent/:id`
Retrieve payment intent details

## Frontend Integration

Update your frontend to use the server endpoints:

```javascript
// In your frontend code
const API_BASE_URL = 'http://localhost:3001/api';

// Create payment intent
const response = await fetch(`${API_BASE_URL}/create-payment-intent`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    amount: Math.round(amount * 100),
    currency: 'usd',
    customer: customerInfo,
    items: items
  }),
});
```

## Security Notes

- ✅ Secret keys are stored server-side only
- ✅ CORS is configured for specific origins
- ✅ Webhook signatures are verified
- ✅ Input validation on all endpoints
- ✅ Error messages don't expose sensitive data

## Testing

Use Stripe's test card numbers:
- Success: `4242 4242 4242 4242`
- Declined: `4000 0000 0000 0002`
- Requires Auth: `4000 0025 0000 3155`

## Deployment

For production deployment:

1. Set `NODE_ENV=production`
2. Use your live Stripe keys
3. Configure proper CORS origins
4. Set up SSL/HTTPS
5. Use a process manager like PM2

## Troubleshooting

### Common Issues

1. **CORS Errors**: Check that your frontend URL is in the CORS origins
2. **Webhook Failures**: Verify webhook secret and endpoint URL
3. **Email Issues**: Check Gmail app password and 2FA settings
4. **Payment Failures**: Check Stripe dashboard for detailed error logs

### Logs

The server logs important events:
- Payment intent creation
- Webhook events
- Email sending status
- Errors and warnings

## Support

For issues with this server setup, check:
1. Server logs in the console
2. Stripe Dashboard for payment details
3. Network tab in browser dev tools
4. Email service logs