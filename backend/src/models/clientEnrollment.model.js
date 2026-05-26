const ENROLLMENT_FIELD_GROUPS = {
  personalProfile: [
    "full_name",
    "first_name",
    "last_name",
    "email",
    "phone",
    "secondary_phone",
    "address",
    "dob",
    "age",
    "nominee_name",
    "relation_with_nominee",
    "profession",
    "member_group",
    "gender",
    "reason_for_insurance",
  ],
  evidence: [
    "profile_picture",
    "images",
    "image_labels",
  ],
  policyDetails: [
    "plan_name",
    "plan_number",
    "policy_number",
    "policy_term",
    "sum_assured",
    "premium_amount",
    "ab_pwb",
    "date_of_commencement",
    "maturity_time",
    "discount_scheme",
    "policy_status",
    "premium_due_date",
    "premium_status",
  ],
  bankDetails: [
    "bank_name",
    "bank_account",
    "bank_branch",
  ],
};

const shapeEnrollmentPayload = (payload = {}, files = {}) => ({
  personal_profile: {
    full_name: payload.full_name || payload.fullName || null,
    first_name: payload.first_name || payload.firstName || null,
    last_name: payload.last_name || payload.lastName || null,
    email: payload.email || null,
    phone: payload.phone || payload.contact_number || payload.contactNumber || null,
    secondary_phone: payload.secondary_phone || payload.secondaryContact || payload.secondary_contact || null,
    address: payload.address || null,
    dob: payload.dob || payload.date_of_birth || payload.dateOfBirth || null,
    age: payload.age || null,
    nominee_name: payload.nominee_name || payload.nomineeName || null,
    relation_with_nominee: payload.relation_with_nominee || payload.relationWithNominee || null,
    profession: payload.profession || null,
    member_group: payload.member_group || payload.memberGroup || null,  
    gender: payload.gender || null,
    reason_for_insurance: payload.reason_for_insurance || payload.reasonForInsurance || payload.why_bought || payload.whyBought || null,
  },
  evidence: {
    profile_picture: files.profile_picture || null,
    supporting_images: Array.isArray(files.supporting_images) ? files.supporting_images : Array.isArray(files.images) ? files.images : [],
    image_labels: payload.image_labels || payload.imageLabels || payload.supporting_images_labels || payload.supportingImagesLabels || [],
  },
  policy_details: {
    plan_name: payload.plan_name || payload.planName || null,
    plan_number: payload.plan_number || payload.plan_no || payload.planNo || null,
    policy_number: payload.policy_number || payload.policyNumber || null,
    policy_term: payload.policy_term || payload.policyTerm || null,
    sum_assured: payload.sum_assured || payload.sumAssured || null,
    premium_amount: payload.premium_amount || payload.premiumAmount || null,
    ab_pwb: payload.ab_pwb || payload.abPwb || null,
    date_of_commencement: payload.date_of_commencement || payload.doc || null,
    maturity_time: payload.maturity_time || payload.maturityTime || null,
    discount_scheme: payload.discount_scheme || payload.discountScheme || null,
    policy_status: payload.policy_status || payload.policyStatus || payload.status || null,
  },
  bank_details: {
    bank_name: payload.bank_name || payload.bankName || null,
    bank_account: payload.bank_account || payload.bankAccount || payload.bank_account_details || payload.bankAccountDetails || null,
    bank_branch: payload.bank_branch || payload.branch || null,
    premium_due_date: payload.premium_due_date || payload.payment_due_date || payload.paymentDueDate || null,
    premium_status: payload.premium_status || payload.premium_due_paid || payload.premiumDuePaid || null,
  },
});

const shapePolicyRecord = (policy) => {
  if (!policy) return null;

  // Determine premium status from premium_status field
  let premiumStatus = "DUE";
  if (policy.premium_status) {
    premiumStatus = String(policy.premium_status).toUpperCase();
  }

  return {
    id: policy.id,
    policy_number: policy.policy_number,
    plan_name: policy.plan_name,
    plan_no: policy.plan_no,
    policy_term: policy.policy_term,
    sum_assured: policy.sum_assured,
    ab_pwb: policy.ab_pwb,
    doc: policy.doc,
    maturity_time: policy.maturity_time,
    premium_amount: policy.premium_amount,
    discount_scheme: policy.discount_scheme,
    premium_due_date: policy.premium_due_date,
    premium_paid: policy.premium_paid,
    premium_status: premiumStatus,
    bank_name: policy.bank_name,
    bank_account: policy.bank_account,
    bank_branch: policy.branch,
    branch: policy.branch,
    policy_status: policy.status,
    status: policy.status,
    client_id: policy.client_id,
    agent_id: policy.agent_id,
    company_id: policy.company_id,
    created_at: policy.created_at,
    updated_at: policy.updated_at,
    deleted_at: policy.deleted_at,
  };
};

const shapeClientRecord = (client) => {
  if (!client) return null;

  const policies = Array.isArray(client.policies)
    ? client.policies.map(shapePolicyRecord)
    : [];

  return {
    id: client.id,
    client_id: client.client_id,
    full_name: `${client.first_name || ""} ${client.last_name || ""}`.trim(),
    first_name: client.first_name,
    last_name: client.last_name,
    email: client.email,
    phone: client.phone,
    secondary_phone: client.secondary_phone,
    address: client.address,
    dob: client.dob,
    age: client.age,
    gender: client.gender,
    nominee_name: client.nominee_name,
    relation_with_nominee: client.relation_with_nominee,
    profession: client.profession,
    member_group: client.member_group,
    reason_for_insurance: client.reason_for_insurance,
    profile_picture: client.profile_picture,
    profile_picture_public_id: client.profile_picture_public_id,
    images: Array.isArray(client.images) ? client.images : [],
    supporting_images: Array.isArray(client.images) ? client.images : [],
    documents: Array.isArray(client.documents) ? client.documents : [],
    image1: client.image1,
    image1_public_id: client.image1_public_id,
    image2: client.image2,
    image2_public_id: client.image2_public_id,
    status: client.status,
    agent_id: client.agent_id,
    created_at: client.created_at,
    updated_at: client.updated_at,
    deleted_at: client.deleted_at,
    policies_count: policies.length,
    policies,
    latest_policy: policies[0] || null,
  };
};

const shapeEnrollmentResponse = ({ client, policy, uploads, received_payload }) => ({
  data: shapeClientRecord(client),
  client_id: client?.id || null,
  policy: shapePolicyRecord(policy),
  uploads: uploads || null,
  received_payload: received_payload || null,
});

module.exports = {
  ENROLLMENT_FIELD_GROUPS,
  shapeEnrollmentPayload,
  shapeClientRecord,
  shapePolicyRecord,
  shapeEnrollmentResponse,
};


//here i want image handleing to work like 1 palce to store profie pciture right?
//and other should be supporting image not suportig document . supporitng iamge hould bestore in array and upporting image should also be sent in array from frontend or in correct format 