const express = require("express");
const router = express.Router();
const bulkNotificationController = require("../controllers/bulkNotification.controller");
const authenticate = require("../middlewares/auth.middleware");
const authorize = require("../middlewares/rbac.middleware");
const validate = require("../middlewares/validate.middleware");
const bulkNotificationValidator = require("../validators/bulkNotification.validator");

/**
 * @swagger
 * tags:
 *   - name: Bulk Notifications
 *     description: "Admin bulk notification management - send, view, and delete notifications"
 */

/**
 * @swagger
 * /api/admin/bulk-notifications:
 *   post:
 *     summary: Send a Notification
 *     description: "Send a notification to a single agent or broadcast to all agents. Authorized admin only."
 *     tags:
 *       - Bulk Notifications
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - content
 *               - target_type
 *             properties:
 *               title:
 *                 type: string
 *                 description: Notification title
 *                 example: "Premium Reminder"
 *               content:
 *                 type: string
 *                 description: Notification message body
 *                 example: "Submit pending premium today."
 *               target_type:
 *                 type: string
 *                 enum: [single, all]
 *                 description: "Target type - 'single' for one agent, 'all' for broadcast"
 *                 example: "single"
 *               target_agent_id:
 *                 type: string
 *                 format: uuid
 *                 description: "Required when target_type is 'single'. Must be a valid agent UUID."
 *                 example: "3b25fbfb-8260-47bf-8f25-ca68bb7d22cc"
 *           examples:
 *             singleAgent:
 *               summary: Send to single agent
 *               value:
 *                 title: "Premium Reminder"
 *                 content: "Submit pending premium today."
 *                 target_type: "single"
 *                 target_agent_id: "3b25fbfb-8260-47bf-8f25-ca68bb7d22cc"
 *             allAgents:
 *               summary: Broadcast to all agents
 *               value:
 *                 title: "Meeting Notice"
 *                 content: "Monthly meeting at 5 PM."
 *                 target_type: "all"
 *     responses:
 *       201:
 *         description: Notification sent successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Notification sent successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                       example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
 *                     title:
 *                       type: string
 *                       example: "Premium Reminder"
 *                     content:
 *                       type: string
 *                       example: "Submit pending premium today."
 *                     target_type:
 *                       type: string
 *                       enum: [SINGLE, ALL]
 *                       example: "SINGLE"
 *                     target_agent_id:
 *                       type: string
 *                       format: uuid
 *                       nullable: true
 *                       example: "3b25fbfb-8260-47bf-8f25-ca68bb7d22cc"
 *                     target_agent:
 *                       type: object
 *                       nullable: true
 *                       properties:
 *                         id:
 *                           type: string
 *                           format: uuid
 *                         first_name:
 *                           type: string
 *                         last_name:
 *                           type: string
 *                         email:
 *                           type: string
 *                     created_by:
 *                       type: string
 *                       format: uuid
 *                     creator:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                           format: uuid
 *                         username:
 *                           type: string
 *                         email:
 *                           type: string
 *                     created_at:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: "Validation error - missing/invalid fields"
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               status: false
 *               message: "Validation failed"
 *               errors: ["Notification title is required and cannot be empty", "target_type must be either 'single' or 'all'"]
 *       401:
 *         description: "Unauthorized - Missing or invalid Bearer JWT"
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: "Forbidden - User lacks admin permissions"
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: "Target agent not found"
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               status: false
 *               message: "Target agent not found"
 *               errors: ["Agent with ID '3b25fbfb-8260-47bf-8f25-ca68bb7d22cc' does not exist"]
 */
router.post(
  "/admin/bulk-notifications",
  authenticate,
  authorize(["ADMIN"], ["SUPER_ADMIN", "ADMIN"]),
  validate(bulkNotificationValidator.createBulkNotification),
  bulkNotificationController.createNotification
);

/**
 * @swagger
 * /api/admin/bulk-notifications:
 *   get:
 *     summary: Get All Notifications
 *     description: "Retrieve all bulk notifications with pagination and search. Authorized admin only."
 *     tags:
 *       - Bulk Notifications
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number for pagination
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 10
 *         description: Number of records per page
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *           maxLength: 200
 *         description: "Search by notification title or content (case-insensitive)"
 *     responses:
 *       200:
 *         description: Notifications retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Notifications retrieved successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     data:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                             format: uuid
 *                           title:
 *                             type: string
 *                           content:
 *                             type: string
 *                           target_type:
 *                             type: string
 *                             enum: [SINGLE, ALL]
 *                           target_agent:
 *                             type: object
 *                             nullable: true
 *                           creator:
 *                             type: object
 *                           created_at:
 *                             type: string
 *                             format: date-time
 *                     total:
 *                       type: integer
 *                       example: 25
 *                     page:
 *                       type: integer
 *                       example: 1
 *                     limit:
 *                       type: integer
 *                       example: 10
 *                     totalPages:
 *                       type: integer
 *                       example: 3
 *       400:
 *         description: "Invalid pagination parameters"
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: "Unauthorized - Missing or invalid Bearer JWT"
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: "Forbidden - User lacks admin permissions"
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get(
  "/admin/bulk-notifications",
  authenticate,
  authorize(["ADMIN"], ["SUPER_ADMIN", "ADMIN"]),
  validate(bulkNotificationValidator.getAllNotifications),
  bulkNotificationController.getAllNotifications
);

/**
 * @swagger
 * /api/admin/bulk-notifications/{id}:
 *   get:
 *     summary: Get Single Notification
 *     description: "Retrieve a single bulk notification by its UUID. Authorized admin only."
 *     tags:
 *       - Bulk Notifications
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: UUID of the notification to retrieve
 *         example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
 *     responses:
 *       200:
 *         description: Notification retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Notification retrieved successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                     title:
 *                       type: string
 *                       example: "Premium Reminder"
 *                     content:
 *                       type: string
 *                       example: "Submit pending premium today."
 *                     target_type:
 *                       type: string
 *                       enum: [SINGLE, ALL]
 *                     target_agent:
 *                       type: object
 *                       nullable: true
 *                       properties:
 *                         id:
 *                           type: string
 *                           format: uuid
 *                         first_name:
 *                           type: string
 *                         last_name:
 *                           type: string
 *                         email:
 *                           type: string
 *                     creator:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                           format: uuid
 *                         username:
 *                           type: string
 *                         email:
 *                           type: string
 *                     created_at:
 *                       type: string
 *                       format: date-time
 *                     updated_at:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: "Invalid UUID format"
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               status: false
 *               message: "Validation failed"
 *               errors: ["ID must be a valid UUID"]
 *       401:
 *         description: "Unauthorized - Missing or invalid Bearer JWT"
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: "Forbidden - User lacks admin permissions"
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: "Notification not found"
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               status: false
 *               message: "Notification not found"
 *               errors: ["Notification with ID 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' does not exist or has been deleted"]
 */
router.get(
  "/admin/bulk-notifications/:id",
  authenticate,
  authorize(["ADMIN"], ["SUPER_ADMIN", "ADMIN"]),
  validate(bulkNotificationValidator.getNotificationById),
  bulkNotificationController.getNotificationById
);

/**
 * @swagger
 * /api/admin/bulk-notifications/{id}:
 *   delete:
 *     summary: Delete a Notification
 *     description: "Soft delete a bulk notification by its UUID. Authorized admin only."
 *     tags:
 *       - Bulk Notifications
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: UUID of the notification to delete
 *         example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
 *     responses:
 *       200:
 *         description: Notification deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Notification deleted successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                       example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
 *       400:
 *         description: "Invalid UUID format"
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: "Unauthorized - Missing or invalid Bearer JWT"
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: "Forbidden - User lacks admin permissions"
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: "Notification not found"
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               status: false
 *               message: "Notification not found"
 *               errors: ["Notification with ID 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' does not exist or has been deleted"]
 */
router.delete(
  "/admin/bulk-notifications/:id",
  authenticate,
  authorize(["ADMIN"], ["SUPER_ADMIN", "ADMIN"]),
  validate(bulkNotificationValidator.deleteNotification),
  bulkNotificationController.deleteNotification
);

module.exports = router;
