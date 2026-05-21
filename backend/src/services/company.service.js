const companyRepository = require("../repositories/company.repository");
const auditLogRepository = require("../repositories/audit.repository");

/**
 * Company Management Business Logic Service
 */
class CompanyService {
  /**
   * Create a new company
   * @param {object} companyData - name, email, phone_number, image
   * @param {string} adminId - ID of the creating administrator
   * @param {string} ipAddress - Admin client IP address
   */
  async createCompany(companyData, adminId, ipAddress) {
    const { name, email, phone_number, image } = companyData;

    // Check if email already exists
    const existingEmail = await companyRepository.findOne({ email });
    if (existingEmail) {
      const error = new Error("Company email already exists");
      error.statusCode = 400;
      throw error;
    }

    // Check if phone number already exists
    const existingPhone = await companyRepository.findOne({ phone_number });
    if (existingPhone) {
      const error = new Error("Company phone number already exists");
      error.statusCode = 400;
      throw error;
    }

    // Create the company record
    const company = await companyRepository.create({
      name,
      email,
      phone_number,
      image,
      status: "ACTIVE",
    });

    // Save company creation audit log
    await auditLogRepository.create({
      user_id: adminId,
      user_type: "ADMIN",
      action: "COMPANY_CREATE",
      details: { company_id: company.id, name: company.name, email: company.email },
      ip_address: ipAddress || null,
    }).catch(err => {
      console.error("Audit log creation failed during company create:", err);
    });

    return company;
  }
}

module.exports = new CompanyService();
