const express = require('express');
const cors = require('cors');

const app = express();

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

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

const MPESA_CODE_PATTERN = /^[A-Z0-9]{10}$/;


// ============================================================
// AIRTABLE HELPERS
// ============================================================

function authHeaders() {
  const token = process.env.AIRTABLE_TOKEN;

  if (!token) {
    throw new Error('AIRTABLE_TOKEN is not configured in Vercel Environment Variables');
  }

  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json'
  };
}


async function airtableRequest(path, options = {}) {
  const response = await fetch(`${API_ROOT}${path}`, {
    ...options,
    headers: {
      ...authHeaders(),
      ...(options.headers || {})
    }
  });

  let data;

  try {
    data = await response.json();
  } catch {
    data = {};
  }

  if (!response.ok) {
    const errorMessage =
      data?.error?.message ||
      data?.error ||
      `Airtable request failed with status ${response.status}`;

    const error = new Error(errorMessage);
    error.status = response.status;

    throw error;
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

  return data.records?.[0];
}


async function listRecords(tableId, params = '') {
  const data = await airtableRequest(`/${tableId}${params}`);
  return data.records || [];
}


async function updateRecord(tableId, recordId, fields) {
  const data = await airtableRequest(`/${tableId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      records: [
        {
          id: recordId,
          fields
        }
      ],
      typecast: true
    })
  });

  return data.records?.[0];
}


// ============================================================
// ADMIN SECURITY
// ============================================================

function checkPin(pin) {
  const adminPin = process.env.ADMIN_PIN;

  if (!adminPin) {
    throw new Error('ADMIN_PIN is not configured in Vercel Environment Variables');
  }

  return String(pin || '') === String(adminPin);
}


// ============================================================
// HEALTH CHECK
// ============================================================

app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    status: 'Salon & Barber Bureau API running',
    platform: 'Vercel'
  });
});


// ============================================================
// POST A ROLE
// ============================================================

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
    } = req.body || {};

    if (
      !salonName ||
      !phone ||
      !roleTitle ||
      !roleLevel ||
      !county
    ) {
      return res.status(400).json({
        success: false,
        error:
          'Missing required fields: salonName, phone, roleTitle, roleLevel, county'
      });
    }

    const fee = FEE_BY_LEVEL[roleLevel] || null;

    const record = await createRecord(TABLES.ROLES, {

      'Salon Name': salonName,

      'Contact Name':
        contactName || '',

      'Phone':
        phone,

      'Email':
        email || '',

      'Role Title':
        roleTitle,

      'Role Level':
        roleLevel,

      'County':
        county,

      'Arrangement':
        arrangement || '',

      'Pay Range (KES)':
        payRange || '',

      'Description':
        description || '',

      'Status':
        'Open',

      'Placement Fee (KES)':
        fee,

      'Date Posted':
        new Date().toISOString()
    });

    return res.status(201).json({
      success: true,
      id: record?.id,
      placementFee: fee
    });

  } catch (error) {

    console.error('POST ROLE ERROR:', error);

    return res.status(error.status || 500).json({
      success: false,
      error:
        error.message ||
        'Failed to post role'
    });
  }
});


// ============================================================
// REGISTER PROFESSIONAL / CANDIDATE
// ============================================================

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
    } = req.body || {};

    if (
      !fullName ||
      !phone ||
      !specialty ||
      !roleLevel ||
      !county
    ) {
      return res.status(400).json({
        success: false,
        error:
          'Missing required fields: fullName, phone, specialty, roleLevel, county'
      });
    }

    const record = await createRecord(TABLES.CANDIDATES, {

      'Full Name':
        fullName,

      'Phone':
        phone,

      'Email':
        email || '',

      'County':
        county,

      'Specialty':
        specialty,

      'Role Level':
        roleLevel,

      'Years of Experience':
        yearsExperience !== undefined &&
        yearsExperience !== null &&
        yearsExperience !== ''
          ? Number(yearsExperience)
          : null,

      'Bio / Experience':
        bio || '',

      'Status':
        'Available',

      'Date Registered':
        new Date().toISOString()
    });

    return res.status(201).json({
      success: true,
      id: record?.id
    });

  } catch (error) {

    console.error('REGISTER CANDIDATE ERROR:', error);

    return res.status(error.status || 500).json({
      success: false,
      error:
        error.message ||
        'Failed to register candidate'
    });
  }
});


// ============================================================
// ADMIN: GET ROLES, CANDIDATES & PLACEMENTS
// ============================================================

app.post('/api/admin-data', async (req, res) => {
  try {

    if (!checkPin(req.body?.pin)) {
      return res.status(401).json({
        success: false,
        error: 'Invalid PIN'
      });
    }

    const [
      roles,
      candidates,
      placements
    ] = await Promise.all([

      listRecords(
        TABLES.ROLES,
        '?sort[0][field]=Date%20Posted&sort[0][direction]=desc'
      ),

      listRecords(
        TABLES.CANDIDATES,
        '?sort[0][field]=Date%20Registered&sort[0][direction]=desc'
      ),

      listRecords(
        TABLES.PLACEMENTS,
        '?sort[0][field]=Date%20Confirmed&sort[0][direction]=desc'
      )

    ]);

    return res.status(200).json({

      success: true,

      roles: roles.map(record => ({
        id: record.id,
        ...record.fields
      })),

      candidates: candidates.map(record => ({
        id: record.id,
        ...record.fields
      })),

      placements: placements.map(record => ({
        id: record.id,
        ...record.fields
      }))

    });

  } catch (error) {

    console.error('ADMIN DATA ERROR:', error);

    return res.status(error.status || 500).json({
      success: false,
      error:
        error.message ||
        'Failed to load admin data'
    });
  }
});


// ============================================================
// ADMIN: CONFIRM MATCH
// ============================================================

app.post('/api/admin-confirm-match', async (req, res) => {
  try {

    if (!checkPin(req.body?.pin)) {
      return res.status(401).json({
        success: false,
        error: 'Invalid PIN'
      });
    }

    const {
      roleId,
      candidateId
    } = req.body || {};

    if (!roleId || !candidateId) {
      return res.status(400).json({
        success: false,
        error: 'roleId and candidateId are required'
      });
    }

    const roles = await listRecords(TABLES.ROLES);

    const role = roles.find(
      record => record.id === roleId
    );

    if (!role) {
      return res.status(404).json({
        success: false,
        error: 'Role not found'
      });
    }

    const roleLevel =
      role.fields['Role Level'];

    const fee =
      role.fields['Placement Fee (KES)'] ||
      FEE_BY_LEVEL[roleLevel] ||
      0;

    const placementRef =
      `SBB-${Date.now().toString().slice(-6)}`;

    const placement =
      await createRecord(
        TABLES.PLACEMENTS,
        {

          'Placement Ref':
            placementRef,

          'Role':
            [roleId],

          'Candidate':
            [candidateId],

          'Placement Fee (KES)':
            fee,

          'Payment Status':
            'Awaiting payment',

          'Contact Details Released':
            false,

          'Date Confirmed':
            new Date().toISOString()
        }
      );

    await Promise.all([

      updateRecord(
        TABLES.ROLES,
        roleId,
        {
          'Status':
            'Hired - fee pending'
        }
      ),

      updateRecord(
        TABLES.CANDIDATES,
        candidateId,
        {
          'Status':
            'Matched'
        }
      )

    ]);

    return res.status(200).json({

      success: true,

      placementId:
        placement?.id,

      placementRef,

      fee,

      mpesaTill:
        '4086426',

      message:
        `Match confirmed. Salon owes KES ${fee} to Till 4086426. Once payment is verified, contact details can be released.`

    });

  } catch (error) {

    console.error(
      'CONFIRM MATCH ERROR:',
      error
    );

    return res.status(error.status || 500).json({
      success: false,
      error:
        error.message ||
        'Failed to confirm match'
    });
  }
});


// ============================================================
// ADMIN: VERIFY M-PESA PAYMENT
// ============================================================

app.post('/api/admin-verify-payment', async (req, res) => {
  try {

    if (!checkPin(req.body?.pin)) {
      return res.status(401).json({
        success: false,
        error: 'Invalid PIN'
      });
    }

    const {
      placementId,
      mpesaCode,
      phone
    } = req.body || {};

    if (!placementId || !mpesaCode) {
      return res.status(400).json({
        success: false,
        error:
          'placementId and mpesaCode are required'
      });
    }

    const cleanCode =
      String(mpesaCode)
        .trim()
        .toUpperCase();

    if (!MPESA_CODE_PATTERN.test(cleanCode)) {
      return res.status(400).json({
        success: false,
        error:
          'Invalid M-Pesa transaction code format'
      });
    }

    const allPlacements =
      await listRecords(
        TABLES.PLACEMENTS
      );

    const duplicate =
      allPlacements.find(
        placement =>
          placement.id !== placementId &&
          placement.fields[
            'M-Pesa Transaction Code'
          ] === cleanCode
      );

    if (duplicate) {
      return res.status(409).json({
        success: false,
        error:
          'This M-Pesa code has already been used for another placement'
      });
    }

    const placement =
      allPlacements.find(
        record =>
          record.id === placementId
      );

    if (!placement) {
      return res.status(404).json({
        success: false,
        error:
          'Placement not found'
      });
    }

    const updated =
      await updateRecord(
        TABLES.PLACEMENTS,
        placementId,
        {

          'Payment Status':
            'Paid - verified',

          'M-Pesa Transaction Code':
            cleanCode,

          'Payment Phone Number':
            phone || '',

          'Contact Details Released':
            true

        }
      );

    const roleIds =
      placement.fields['Role'] || [];

    const candidateIds =
      placement.fields['Candidate'] || [];

    await Promise.all([

      ...roleIds.map(
        id =>
          updateRecord(
            TABLES.ROLES,
            id,
            {
              'Status':
                'Placed'
            }
          )
      ),

      ...candidateIds.map(
        id =>
          updateRecord(
            TABLES.CANDIDATES,
            id,
            {
              'Status':
                'Placed'
            }
          )
      )

    ]);

    return res.status(200).json({

      success: true,

      placementId:
        updated?.id,

      contactDetailsReleased:
        true,

      message:
        'Payment verified successfully. Contact details released.'

    });

  } catch (error) {

    console.error(
      'VERIFY PAYMENT ERROR:',
      error
    );

    return res.status(error.status || 500).json({
      success: false,
      error:
        error.message ||
        'Failed to verify payment'
    });
  }
});


// ============================================================
// VERCEL SERVERLESS EXPORT
// ============================================================

module.exports = app;
