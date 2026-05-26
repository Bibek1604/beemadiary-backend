const express = require("express");
const router = express.Router();
const agentNotificationController = require("../controllers/agentNotification.controller");
const validate = require("../middlewares/validate.middleware");
const agentNotificationValidator = require("../validators/agentNotification.validator");
const authenticate = require("../middlewares/auth.middleware");
const authorize = require("../middlewares/rbac.middleware");

/**
 * @swagger
 * tags:
 *   name: Agent Notifications
 *   description: "Agent notification management - view and mark notifications as read"
 */

/**
 * @swagger
 * /api/agent/notifications:
 *   get:
 *     summary: Get Agent Notifications
 *     description: "Retrieve notifications sent to the logged-in agent or all agents. Authorized agent only."
 *     tags: [Agent Notifications]
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
 *         description: Number of notifications per page
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: "Search by notification title or content"
 *       - in: query
 *         name: is_read
 *         schema:
 *           type: boolean
 *         description: "Filter by read/unread status"
 *     responses:
 *       200:
 *         description: Notifications fetched successfully
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
 *                   example: "Notifications fetched successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     notifications:
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
 *                           created_at:
 *                             type: string
 *                             format: date-time
 *                           is_read:
 *                             type: boolean
 *                           read_at:
 *                             type: string
 *                             format: date-time
 *                             nullable: true
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         total:
 *                           type: integer
 *                         page:
 *                           type: integer
 *                         limit:
 *                           type: integer
 *                         totalPages:
 *                           type: integer
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Not an agent
 */
router.get(
  "/agent/notifications",
  authenticate,
  authorize(["AGENT"]),
  validate(agentNotificationValidator.getNotifications, "query"),
  agentNotificationController.getNotifications
);

/**
 * @swagger
 * /api/agent/notifications/unread/count:
 *   get:
 *     summary: Get Unread Notification Count
 *     description: "Retrieve the count of unread notifications for the logged-in agent. Authorized agent only."
 *     tags: [Agent Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Unread notification count fetched successfully
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
 *                   example: "Unread notification count fetched successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     unread_count:
 *                       type: integer
 *                       example: 5
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Not an agent
 */
router.get(
  "/agent/notifications/unread/count",
  authenticate,
  authorize(["AGENT"]),
  agentNotificationController.getUnreadCount
);

/**
 * @swagger
 * /api/agent/notifications/{id}:
 *   get:
 *     summary: Get Single Notification
 *     description: "Retrieve a single notification by its UUID. The notification must be directed to the logged-in agent or all agents. Authorized agent only."
 *     tags: [Agent Notifications]
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
 *     responses:
 *       200:
 *         description: Notification details fetched successfully
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
 *                   example: "Notification details fetched successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                     title:
 *                       type: string
 *                     content:
 *                       type: string
 *                     target_type:
 *                       type: string
 *                       enum: [SINGLE, ALL]
 *                     created_at:
 *                       type: string
 *                       format: date-time
 *                     is_read:
 *                       type: boolean
 *                     read_at:
 *                       type: string
 *                       format: date-time
 *                       nullable: true
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Not an agent
 *       404:
 *         description: Notification not found or access denied
 */
router.get(
  "/agent/notifications/:id",
  authenticate,
  authorize(["AGENT"]),
  validate(agentNotificationValidator.getNotificationById, "params"),
  agentNotificationController.getNotificationById
);

/**
 * @swagger
 * /api/agent/notifications/{id}/read:
 *   patch:
 *     summary: Mark Notification as Read
 *     description: "Mark a specific notification as read for the logged-in agent. Authorized agent only."
 *     tags: [Agent Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: UUID of the notification to mark as read
 *     responses:
 *       200:
 *         description: Notification marked as read successfully
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
 *                   example: "Notification marked as read successfully"
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Not an agent
 *       404:
 *         description: Notification not found or access denied
 */
router.patch(
  "/agent/notifications/:id/read",
  authenticate,
  authorize(["AGENT"]),
  validate(agentNotificationValidator.markAsRead, "params"),
  agentNotificationController.markAsRead
);

module.exports = router;