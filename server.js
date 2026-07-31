const express = require('express');
const cors = require('cors');

const app = express();

app.use(cors());
app.use(express.json());

const BASE_ID = 'apposCytzOcT5TROB';
const API_ROOT = `https://api.airtable.com/v0/${BASE_ID}`;

const TABLES = {
  ROLES: 'tblhldhsGxpeBMlNy',
  CANDIDATES: 'tbluZ8n6lLPopU089',
  PLACEMENTS: 'tblpl0KXGpk8Usiwp'
};

const FEE_BY_LEVEL = {
  'Junior / Apprentice': 1500,
  'Senior / Specialist': 3000,
  'Salon / Shop Manager': 5000
};

function authHeaders() {
  const token = process.env.AIRTABLE_TOKEN;

  if (!token) {
    throw new Error('AIRTABLE_TOKEN is not configured in Vercel');
  }

  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json'
  };
}

async function airtableRequest(path, options = {}) {
  const response = await fetch(`${API_ROOT}${path}`, {
    ...options,
    headers: authHeaders()
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data?.error?.message || 'Airtable request failed'
    );
  }

  return data;
}

async function createRecord(tableId, fields) {
  const data = await airtableRequest(`/${tableId}`, {
    method: 'POST',
    body: JSON.stringify({
      records: [
        {
          fields
        }
      ],
      typecast: true
    })
  });

  return data.records[0];
}

/* =========================
   HEALTH CHECK
========================= */

app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Salon & Barber Bureau API is running',
    status: 'online'
  });
});

/* =========================
   REGISTER PROFESSIONAL
========================= */

app.post('/api/register-candidate', async (req, res) => {
  try {
    const {
      fullName,
      phone,
      email,
      county,
      specialty,
      roleLevel,
      yearsExperience,
      bio
    } = req.body;

    if (
      !fullName ||
      !phone ||
      !county ||
      !specialty ||
      !roleLevel
    ) {
      return res.status(400).json({
        success: false,
        error: 'Please fill in all required fields.'
      });
    }

    const record = await createRecord(
      TABLES.CANDIDATES,
      {
        'Full Name': fullName,
        'Phone': phone,
        'Email': email || '',
        'County': county,
        'Specialty': specialty,
        'Role Level': roleLevel,
        'Years of Experience': yearsExperience
          ? Number(yearsExperience)
          : null,
        'Bio / Experience': bio || '',
        'Status': 'Available',
        'Date Registered': new Date().toISOString()
      }
    );

    return res.status(201).json({
      success: true,
      message: 'Professional registered successfully.',
      id: record.id
    });

  } catch (error) {
    console.error('REGISTER CANDIDATE ERROR:', error);

    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to register professional.'
    });
  }
});

/* =========================
   POST ROLE
========================= */

app.post('/api/post-role', async (req, res) => {
  try {
    const {
      salonName,
      contactName,
      phone,
      email,
      roleTitle,
      roleLevel,
      county,
      arrangement,
      payRange,
      description
    } = req.body;

    if (
      !salonName ||
      !phone ||
      !roleTitle ||
      !roleLevel ||
      !county
    ) {
      return res.status(400).json({
        success: false,
        error: 'Please fill in all required fields.'
      });
    }

    const fee = FEE_BY_LEVEL[roleLevel] || null;

    const record = await createRecord(
      TABLES.ROLES,
      {
        'Salon Name': salonName,
        'Contact Name': contactName || '',
        'Phone': phone,
        'Email': email || '',
        'Role Title': roleTitle,
        'Role Level': roleLevel,
        'County': county,
        'Arrangement': arrangement || '',
        'Pay Range (KES)': payRange || '',
        'Description': description || '',
        'Status': 'Open',
        'Placement Fee (KES)': fee,
        'Date Posted': new Date().toISOString()
      }
    );

    return res.status(201).json({
      success: true,
      message: 'Role posted successfully.',
      id: record.id,
      placementFee: fee
    });

  } catch (error) {
    console.error('POST ROLE ERROR:', error);

    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to post role.'
    });
  }
});

/* =========================
   VERCEL EXPORT
========================= */

module.exports = app;
