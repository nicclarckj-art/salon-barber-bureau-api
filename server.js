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

const MPESA_CODE_PATTERN = /^[A-Z0-9]{10}$/;

// ---------- Airtable helpers ----------

function authHeaders() {
  const token = process.env.AIRTABLE_TOKEN;
  if (!token) throw new Error('AIRTABLE_TOKEN not configured');
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json'
  };
}

async function airtableRequest(path, options = {}) {
  const res = await fetch(`${API_ROOT}${path}`, { ...options, headers: authHeaders() });
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data?.error?.message || 'Airtable request failed');
    err.status = res.status;
    throw err;
  }
  return data;
}

async function createRecord(tableId, fields) {
  const data = await airtableRequest(`/${tableId}`, {
    method: 'POST',
    body: JSON.stringify({ records: [{ fields }], typecast: true })
  });
  return data.records[0];
}

async function listRecords(tableId, params = '') {
  const data = await airtableRequest(`/${tableId}${params}`);
  return data.records;
}

async function updateRecord(tableId, recordId, fields) {
  const data = await airtableRequest(`/${tableId}`, {
    method: 'PATCH',
    body: JSON.stringify({ records: [{ id: recordId, fields }], typecast: true })
  });
  return data.records[0];
}

function checkPin(pin) {
  const adminPin = process.env.ADMIN_PIN || '6425';
  return String(pin) === String(adminPin);
}

// ---------- Routes ----------

app.get('/', (req, res) => {
  res.json({ status: 'Salon & Barber Bureau API running' });
});

// Post a role (from salon)
app.post('/api/post-role', async (req, res) => {
  try {
    const {
      salonName, contactName, phone, email,
      roleTitle, roleLevel, county, arrangement,
      payRange, description
    } = req.body;

    if (!salonName || !phone || !roleTitle || !roleLevel || !county) {
      return res.status(400).json({ error: 'Missing required fields: salonName, phone, roleTitle, roleLevel, county' });
    }

    const fee = FEE_BY_LEVEL[roleLevel] || null;

    const record = await createRecord(TABLES.ROLES, {
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
    });

    res.json({ success: true, id: record.id, placementFee: fee });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Failed to post role' });
  }
});

// Register a candidate (professional)
app.post('/api/register-candidate', async (req, res) => {
  try {
    const {
      fullName, phone, email, county,
      specialty, roleLevel, yearsExperience, bio
    } = req.body;

    if (!fullName || !phone || !specialty || !roleLevel || !county) {
      return res.status(400).json({ error: 'Missing required fields: fullName, phone, specialty, roleLevel, county' });
    }

    const record = await createRecord(TABLES.CANDIDATES, {
      'Full Name': fullName,
      'Phone': phone,
      'Email': email || '',
      'County': county,
      'Specialty': specialty,
      'Role Level': roleLevel,
      'Years of Experience': yearsExperience ? Number(yearsExperience) : null,
      'Bio / Experience': bio || '',
      'Status': 'Available',
      'Date Registered': new Date().toISOString()
    });

    res.json({ success: true, id: record.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Failed to register candidate' });
  }
});

// Admin: get all roles, candidates, placements (PIN-gated)
app.post('/api/admin-data', async (req, res) => {
  try {
    if (!checkPin(req.body.pin)) return res.status(401).json({ error: 'Invalid PIN' });

    const [roles, candidates, placements] = await Promise.all([
      listRecords(TABLES.ROLES, '?sort[0][field]=Date Posted&sort[0][direction]=desc'),
      listRecords(TABLES.CANDIDATES, '?sort[0][field]=Date Registered&sort[0][direction]=desc'),
      listRecords(TABLES.PLACEMENTS, '?sort[0][field]=Date Confirmed&sort[0][direction]=desc')
    ]);

    res.json({
      roles: roles.map(r => ({ id: r.id, ...r.fields })),
      candidates: candidates.map(c => ({ id: c.id, ...c.fields })),
      placements: placements.map(p => ({ id: p.id, ...p.fields }))
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Failed to load admin data' });
  }
});

// Admin: confirm a match between role and candidate (PIN-gated)
app.post('/api/admin-confirm-match', async (req, res) => {
  try {
    if (!checkPin(req.body.pin)) return res.status(401).json({ error: 'Invalid PIN' });

    const { roleId, candidateId } = req.body;
    if (!roleId || !candidateId) {
      return res.status(400).json({ error: 'roleId and candidateId are required' });
    }

    const roles = await listRecords(TABLES.ROLES);
    const role = roles.find(r => r.id === roleId);
    if (!role) return res.status(404).json({ error: 'Role not found' });

    const fee = role.fields['Placement Fee (KES)'] || FEE_BY_LEVEL[role.fields['Role Level']] || 0;
    const placementRef = `SBB-${Date.now().toString().slice(-6)}`;

    const placement = await createRecord(TABLES.PLACEMENTS, {
      'Placement Ref': placementRef,
      'Role': [roleId],
      'Candidate': [candidateId],
      'Placement Fee (KES)': fee,
      'Payment Status': 'Awaiting payment',
      'Contact Details Released': false,
      'Date Confirmed': new Date().toISOString()
    });

    await Promise.all([
      updateRecord(TABLES.ROLES, roleId, { 'Status': 'Hired - fee pending' }),
      updateRecord(TABLES.CANDIDATES, candidateId, { 'Status': 'Matched' })
    ]);

    res.json({
      success: true,
      placementId: placement.id,
      placementRef,
      fee,
      mpesaTill: '4086426',
      message: `Match confirmed. Salon owes KES ${fee} to Till 4086426. Once paid, verify the M-Pesa code to release contact details.`
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Failed to confirm match' });
  }
});

// Admin: verify M-Pesa payment and release contact details (PIN-gated)
app.post('/api/admin-verify-payment', async (req, res) => {
  try {
    if (!checkPin(req.body.pin)) return res.status(401).json({ error: 'Invalid PIN' });

    const { placementId, mpesaCode, phone } = req.body;
    if (!placementId || !mpesaCode) {
      return res.status(400).json({ error: 'placementId and mpesaCode are required' });
    }

    const cleanCode = String(mpesaCode).trim().toUpperCase();
    if (!MPESA_CODE_PATTERN.test(cleanCode)) {
      return res.status(400).json({ error: 'M-Pesa code format looks invalid. Expect 10 characters, letters and numbers.' });
    }

    const allPlacements = await listRecords(TABLES.PLACEMENTS);
    const duplicate = allPlacements.find(
      p => p.id !== placementId && p.fields['M-Pesa Transaction Code'] === cleanCode
    );
    if (duplicate) {
      return res.status(409).json({ error: 'This M-Pesa code has already been used to verify another placement.' });
    }

    const placement = allPlacements.find(p => p.id === placementId);
    if (!placement) return res.status(404).json({ error: 'Placement not found' });

    const updated = await updateRecord(TABLES.PLACEMENTS, placementId, {
      'Payment Status': 'Paid - verified',
      'M-Pesa Transaction Code': cleanCode,
      'Payment Phone Number': phone || '',
      'Contact Details Released': true
    });

    const roleIds = placement.fields['Role'] || [];
    const candidateIds = placement.fields['Candidate'] || [];
    await Promise.all([
      ...roleIds.map(id => updateRecord(TABLES.ROLES, id, { 'Status': 'Placed' })),
      ...candidateIds.map(id => updateRecord(TABLES.CANDIDATES, id, { 'Status': 'Placed' }))
    ]);

    res.json({ success: true, placementId: updated.id, contactDetailsReleased: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Failed to verify payment' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Bureau API running on port ${PORT}`));
