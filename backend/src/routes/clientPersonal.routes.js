const express = require("express");
const router = express.Router();
const authMiddleware = require("../middlewares/auth.middleware");
const ApiResponse = require("../utils/apiResponse");
const { prisma } = require("../config/db");

// All endpoints require authentication
router.use(authMiddleware);

/**
 * POST /api/client/enroll
 * Create client with personal details ONLY
 * Required: first_name, last_name, email, phone, address
 * Optional: secondary_phone, dob, age, gender, profession, member_group, nominee_name, relation_with_nominee, reason_for_insurance
 */
router.post("/client/enroll", async (req, res) => {
  try {
    const agentId = req.user?.id;
    if (!agentId) {
      return res.status(401).json(ApiResponse.error("Agent ID not found", null, 401));
    }

    const {
      first_name,
      last_name,
      email,
      phone,
      address,
      secondary_phone,
      dob,
      age,
      gender,
      profession,
      member_group,
      nominee_name,
      relation_with_nominee,
      reason_for_insurance,
    } = req.body;

    // Validation
    const errors = [];
    if (!first_name?.trim()) errors.push("First name is required");
    if (!last_name?.trim()) errors.push("Last name is required");
    if (!email?.trim()) errors.push("Email is required");
    else if (!/^[a-zA-Z0-9._%-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email)) errors.push("Invalid email format");

    if (!phone?.trim()) errors.push("Phone is required");
    else {
      const digits = phone.replace(/\s/g, '').replace(/\D/g, '');
      if (digits.length < 9 || digits.length > 15) errors.push("Phone must contain 9-15 digits");
    }

    if (!address?.trim()) errors.push("Address is required");
    if (!nominee_name?.trim()) errors.push("Nominee name is required");
    if (!relation_with_nominee?.trim()) errors.push("Relation with nominee is required");
    if (!gender?.trim()) errors.push("Gender is required");

    if (secondary_phone?.trim()) {
      const digits = secondary_phone.replace(/\s/g, '').replace(/\D/g, '');
      if (digits.length < 9 || digits.length > 15) errors.push("Secondary phone must contain 9-15 digits");
    }

    if (dob) {
      const dobDate = new Date(dob);
      if (isNaN(dobDate.getTime())) errors.push("Invalid date of birth");
      else if (dobDate > new Date()) errors.push("Date of birth cannot be in future");
    }

    if (age) {
      const ageNum = parseInt(age, 10);
      if (isNaN(ageNum) || ageNum < 18 || ageNum > 100) errors.push("Age must be between 18 and 100");
    }

    if (errors.length > 0) {
      return res.status(400).json(ApiResponse.error("Validation failed", errors, 400));
    }

    // Check if email/phone already exists
    const existing = await prisma.client.findFirst({
      where: { OR: [{ email: email.trim() }, { phone: phone.trim() }] },
    });

    if (existing) {
      return res.status(400).json(ApiResponse.error("Email or phone already registered", null, 400));
    }

    // Create client
    const clientId = `LIC-${Date.now()}-${Math.random().toString(36).substr(2, 5).toUpperCase()}`;

    const client = await prisma.client.create({
      data: {
        id: clientId,
        first_name: first_name.trim(),
        last_name: last_name.trim(),
        email: email.trim(),
        phone: phone.trim(),
        address: address.trim(),
        agent_id: agentId,
        secondary_phone: secondary_phone?.trim() || null,
        dob: dob ? new Date(dob) : null,
        age: age ? parseInt(age, 10) : null,
        gender: gender?.trim() || null,
        profession: profession?.trim() || null,
        member_group: member_group?.trim() || null,
        nominee_name: nominee_name?.trim() || null,
        relation_with_nominee: relation_with_nominee?.trim() || null,
        reason_for_insurance: reason_for_insurance?.trim() || null,
      },
    });

    const cleanRecord = (record) =>
      Object.fromEntries(Object.entries(record).filter(([_, value]) => value !== null && value !== undefined && value !== ""));

    res.status(201).json(
      ApiResponse.success("Client enrolled successfully", {
        client_id: client.id,
        client: cleanRecord(client),
      })
    );
  } catch (error) {
    console.error("[Client Enroll Error]:", error);
    res.status(500).json(ApiResponse.error("Failed to enroll client", null, 500));
  }
});

module.exports = router;
