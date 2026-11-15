'use strict';

process.env.USE_TRANSACTIONS = 'false';

const { MongoMemoryServer } = require('mongodb-memory-server');
const request = require('supertest');
const crypto = require('crypto');

const app = require('../../src/app');
const { connectDatabase, disconnectDatabase } = require('../../src/config/db');
const { signAccessToken } = require('../../src/middleware/authMiddleware');
const User = require('../../src/models/User');
const Group = require('../../src/models/Group');
const Expense = require('../../src/models/Expense');
const Settlement = require('../../src/models/Settlement');
const razorpayService = require('../../src/services/razorpayService');
const config = require('../../src/config/env');

const API = '/api/v1';

let mongod;
let alice;
let bob;
let group;

const bearer = (user) => ({ Authorization: `Bearer ${signAccessToken(user)}` });

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await connectDatabase(mongod.getUri());

  alice = await User.create({
    name: 'Alice Patel',
    email: 'alice.razorpay@example.com',
    password: 'TestPassword123!',
    preferredCurrency: 'INR',
  });

  bob = await User.create({
    name: 'Bob Rao',
    email: 'bob.razorpay@example.com',
    password: 'TestPassword123!',
    preferredCurrency: 'INR',
  });

  group = await Group.create({
    name: 'Goa Trip Razorpay',
    baseCurrency: 'INR',
    createdBy: alice._id,
    members: [
      { userId: alice._id, role: 'admin', status: 'active' },
      { userId: bob._id, role: 'member', status: 'active' },
    ],
  });

  // Bob pays ₹1000 split equally between Alice and Bob => Alice owes Bob ₹500
  await Expense.create({
    groupId: group._id,
    title: 'Dinner at Beach',
    totalMinor: 100000,
    currency: 'INR',
    groupAmountMinor: 100000,
    paidBy: bob._id,
    splitType: 'equal',
    participants: [
      { userId: alice._id, shareMinor: 50000 },
      { userId: bob._id, shareMinor: 50000 },
    ],
    createdBy: bob._id,
    expenseDate: new Date(),
  });
});

afterAll(async () => {
  await disconnectDatabase();
  if (mongod) await mongod.stop();
});

describe('Razorpay Service', () => {
  it('creates an order through Razorpay API', async () => {
    const order = await razorpayService.createOrder({
      amountMinor: 50000,
      currency: 'INR',
      notes: { test: 'true' },
    });

    expect(order).toHaveProperty('orderId');
    expect(order.orderId).toMatch(/^order_/);
    expect(order.amount).toBe(50000);
    expect(order.currency).toBe('INR');
    expect(order.keyId).toBe(config.RAZORPAY_KEY_ID);
  });

  it('validates a genuine Razorpay signature and rejects an invalid one', () => {
    const orderId = 'order_test123456';
    const paymentId = 'pay_test123456';
    const validSignature = crypto
      .createHmac('sha256', config.RAZORPAY_KEY_SECRET)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');

    const isValid = razorpayService.verifyPaymentSignature({
      razorpayOrderId: orderId,
      razorpayPaymentId: paymentId,
      razorpaySignature: validSignature,
    });
    expect(isValid).toBe(true);

    const isInvalid = razorpayService.verifyPaymentSignature({
      razorpayOrderId: orderId,
      razorpayPaymentId: paymentId,
      razorpaySignature: 'invalid_tampered_signature',
    });
    expect(isInvalid).toBe(false);
  });
});

describe('Razorpay Settlement API', () => {
  let createdOrderId;

  it('POST /settlements/razorpay/create-order creates a valid order for debt settlement', async () => {
    const res = await request(app)
      .post(`${API}/settlements/razorpay/create-order`)
      .set(bearer(alice))
      .send({
        groupId: String(group._id),
        receiverId: String(bob._id),
        amount: '500.00',
        currency: 'INR',
        note: 'Settling beach dinner',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('orderId');
    expect(res.body.data.orderId).toMatch(/^order_/);
    expect(res.body.data.amountMinor).toBe(50000);
    expect(res.body.data.amount).toBe('500.00');
    expect(res.body.data.keyId).toBe(config.RAZORPAY_KEY_ID);

    createdOrderId = res.body.data.orderId;
  });

  it('rejects order creation if amount exceeds outstanding debt', async () => {
    const res = await request(app)
      .post(`${API}/settlements/razorpay/create-order`)
      .set(bearer(alice))
      .send({
        groupId: String(group._id),
        receiverId: String(bob._id),
        amount: '900.00', // Alice only owes ₹500
        currency: 'INR',
      });

    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toMatch(/exceeds/i);
  });

  it('POST /settlements/razorpay/verify verifies signature and records completed settlement', async () => {
    const paymentId = `pay_${Date.now()}`;
    const signature = crypto
      .createHmac('sha256', config.RAZORPAY_KEY_SECRET)
      .update(`${createdOrderId}|${paymentId}`)
      .digest('hex');

    const res = await request(app)
      .post(`${API}/settlements/razorpay/verify`)
      .set(bearer(alice))
      .send({
        groupId: String(group._id),
        receiverId: String(bob._id),
        amount: '500.00',
        currency: 'INR',
        note: 'Paid online via Razorpay',
        razorpayOrderId: createdOrderId,
        razorpayPaymentId: paymentId,
        razorpaySignature: signature,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('completed');
    expect(res.body.data.paymentMethod).toBe('razorpay');
    expect(res.body.data.amountMinor).toBe(50000);
    expect(res.body.data.razorpayOrderId).toBe(createdOrderId);
    expect(res.body.data.razorpayPaymentId).toBe(paymentId);

    // Verify balance after settlement: Alice is now settled up!
    const balanceRes = await request(app)
      .get(`${API}/groups/${group._id}/balances`)
      .set(bearer(alice));

    expect(balanceRes.status).toBe(200);
    expect(balanceRes.body.meta.isSettledUp).toBe(true);
  });

  it('rejects verification when signature is invalid', async () => {
    const res = await request(app)
      .post(`${API}/settlements/razorpay/verify`)
      .set(bearer(alice))
      .send({
        groupId: String(group._id),
        receiverId: String(bob._id),
        amount: '500.00',
        currency: 'INR',
        razorpayOrderId: createdOrderId,
        razorpayPaymentId: 'pay_fraud123',
        razorpaySignature: 'bad_signature_here',
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toMatch(/Invalid Razorpay payment signature/i);
  });

  it('GET /razorpay/key returns the public Razorpay key ID', async () => {
    const res = await request(app).get(`${API}/razorpay/key`);
    expect(res.status).toBe(200);
    expect(res.body.data.keyId).toBe(config.RAZORPAY_KEY_ID);
  });
});
